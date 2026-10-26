// The Mac engine's side door (/engine/*), run in the Worker before Next.
// The engine connects out to here with ENGINE_TOKEN: it long-polls for the
// next job, reports progress, posts answers, files, proposed actions,
// dashboard snapshots and memory docs. Nothing here reaches into the Mac;
// the Mac only ever calls in.
import { emailList } from "./emails";
import { hasBearer } from "./login-worker";
import { pushTo } from "./push";
import { dispatchWaiting, handOff } from "./queue";
import { runDueRoutines } from "./routines";
import { satelliteById, satellites } from "./satellites";

type EngineEnv = Pick<CloudflareEnv, "DB"> & Partial<Pick<CloudflareEnv, "ENGINE_TOKEN" | "OWNER_EMAILS" | "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_JWK">>;

const LEASE_MS = 15 * 60_000;
const POLL_MS = 25_000;
const MAX_FILE_BASE64 = 1_400_000;
const MAX_FILES = 6;
// Action types come from the engine's plugins ("reminder.add"); the engine runs only the ones it knows.
const ACTION_TYPE = /^[a-z][a-z0-9-]{0,30}\.[a-z][a-z0-9-]{0,30}$/;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type ClaimedJob = { id: string; satellite: string; prompt: string; kind: string; payload: string | null; depth: number };

async function claim(env: EngineEnv): Promise<ClaimedJob | null> {
  const now = Date.now();
  return env.DB.prepare(`UPDATE jobs SET status = 'running', started_at = ?, lease_until = ?
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at, id LIMIT 1) AND status = 'queued'
    RETURNING id, satellite, prompt, kind, payload, depth`).bind(iso(now), iso(now + LEASE_MS)).first<ClaimedJob>();
}

async function seen(env: EngineEnv, version: string | null) {
  await env.DB.prepare(`INSERT INTO engine_state (id, last_seen_at, version) VALUES (1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET last_seen_at = excluded.last_seen_at, version = COALESCE(excluded.version, version)`)
    .bind(iso(Date.now()), version).run();
}

async function notify(env: EngineEnv, satellite: string, body: string, jobId: string) {
  const name = satelliteById(satellite)?.name ?? "Orbit";
  const preview = body.replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`|]/g, "").replace(/\s+/g, " ").trim() || "새 답장이 왔어요";
  await pushTo(env, emailList(env.OWNER_EMAILS), {
    title: name,
    body: preview.length > 90 ? `${preview.slice(0, 89)}…` : preview,
    url: `/s/${satellite}`,
    tag: `job-${jobId}`,
    category: "satellite",
  }).catch(() => console.error("Push failed"));
}

type FileIn = { name?: unknown; mime?: unknown; base64?: unknown };
type ActionIn = { type?: unknown; payload?: unknown; summary?: unknown };
type HandoffIn = { to?: unknown; message?: unknown };

/** My recent reactions on this satellite's answers, handed to it as feedback with a job. */
async function feedback(env: EngineEnv, satellite: string) {
  const { results } = await env.DB.prepare(`SELECT my_reaction AS reaction, substr(body, 1, 160) AS body FROM messages
    WHERE satellite = ? AND my_reaction IS NOT NULL AND my_reaction_at > ? ORDER BY my_reaction_at DESC LIMIT 6`)
    .bind(satellite, iso(Date.now() - 3 * 86400_000)).all<{ reaction: string; body: string }>();
  return results;
}

/** Returns null for paths that are not /engine/*. */
export async function handleEngine(request: Request, env: EngineEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/engine/")) return null;
  // Same answer for a wrong token and a wrong path, so the door does not show from outside.
  if (request.method !== "POST" || !await hasBearer(request, env.ENGINE_TOKEN)) return new Response("Not found", { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const str = (value: unknown, max = 20_000) => typeof value === "string" ? value.slice(0, max) : null;

  switch (path) {
    case "/engine/poll": {
      // Held open up to ~25s; checks the queue once a second so a new message starts within a second.
      const until = Date.now() + POLL_MS;
      await seen(env, str(body.version, 40));
      while (Date.now() < until) {
        const job = await claim(env);
        if (job) {
          const [{ results: files }, reactions] = await Promise.all([
            env.DB.prepare("SELECT id, name, mime, size FROM attachments WHERE job_id = ? AND direction = 'in'")
              .bind(job.id).all<{ id: string; name: string; mime: string; size: number }>(),
            job.kind === "memory" || job.kind === "action" ? [] : feedback(env, job.satellite),
            // 👀 on my messages: the satellite has started on them.
            env.DB.prepare("UPDATE messages SET bot_reaction = '👀' WHERE job_id = ? AND role IN ('me', 'handoff')").bind(job.id).run(),
          ]);
          const peers = satellites.filter((one) => one.ready && one.id !== job.satellite).map(({ id, name, role }) => ({ id, name, role }));
          return json({ job: { ...job, payload: job.payload ? JSON.parse(job.payload) : null, files, feedback: reactions, peers } });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await seen(env, null);
      return json({ job: null });
    }

    case "/engine/file": {
      const id = str(body.id, 64);
      const row = id ? await env.DB.prepare("SELECT name, mime, data FROM attachments WHERE id = ?").bind(id).first<{ name: string; mime: string; data: string }>() : null;
      return row ? json(row) : json({ error: "no such file" }, 404);
    }

    case "/engine/progress": {
      const id = str(body.jobId, 64);
      const text = str(body.text, 200);
      if (!id || !text) return json({ error: "jobId and text are required" }, 400);
      const job = await env.DB.prepare("UPDATE jobs SET progress = ?, lease_until = ? WHERE id = ? AND status = 'running' RETURNING cancel_requested AS cancel")
        .bind(text, iso(Date.now() + LEASE_MS), id).first<{ cancel: number }>();
      await seen(env, null);
      return json({ ok: true, cancel: job?.cancel === 1 });
    }

    case "/engine/finish": {
      const id = str(body.jobId, 64);
      const ok = body.ok === true;
      const text = str(body.text, 60_000)?.trim() || (ok ? "" : "알 수 없는 오류");
      if (!id) return json({ error: "jobId is required" }, 400);
      const job = await env.DB.prepare(`UPDATE jobs SET status = ?, finished_at = ?, error = ?, progress = NULL
        WHERE id = ? AND status = 'running' RETURNING satellite, kind, payload, depth, cancel_requested AS cancelled`)
        .bind(ok ? "done" : "failed", iso(Date.now()), ok ? null : text, id).first<{ satellite: string; kind: string; payload: string | null; depth: number; cancelled: number }>();
      if (!job) return json({ error: "no running job with that id" }, 409);
      await seen(env, null);
      const payload = job.payload ? JSON.parse(job.payload) as { notify?: string; title?: string; approvalId?: string; routineId?: string } : {};

      if (job.kind === "memory") return json({ ok: true });
      // ✅ when it answered, nothing when it failed or was stopped.
      await env.DB.prepare("UPDATE messages SET bot_reaction = ? WHERE job_id = ? AND role IN ('me', 'handoff')").bind(ok && !job.cancelled ? "✅" : null, id).run();
      const result = await finishJob(env, id, job, payload, body, ok, text);
      // Whatever I sent while it worked goes out now.
      await dispatchWaiting(env, job.satellite);
      return result;
    }
    case "/engine/snapshot": {
      const satellite = str(body.satellite, 32);
      if (!satellite || !satelliteById(satellite) || typeof body.data !== "object" || !body.data) return json({ error: "satellite and data are required" }, 400);
      const data = JSON.stringify(body.data);
      if (data.length > 200_000) return json({ error: "snapshot too large" }, 413);
      await env.DB.prepare(`INSERT INTO snapshots (satellite, data, observed_at, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (satellite) DO UPDATE SET data = excluded.data, observed_at = excluded.observed_at, updated_at = excluded.updated_at`)
        .bind(satellite, data, str(body.observedAt, 40), iso(Date.now())).run();
      await seen(env, null);
      return json({ ok: true });
    }

    case "/engine/vault": {
      // The engine's public key and the sites it holds come in; sealed logins waiting for it go out.
      const publicKey = str(body.publicKey, 2000);
      const done = Array.isArray(body.done) ? (body.done as unknown[]).filter((id): id is string => typeof id === "string").slice(0, 50) : [];
      const sites = Array.isArray(body.sites) ? (body.sites as { site?: unknown; username?: unknown; updatedAt?: unknown }[]).slice(0, 200) : null;
      const statements = [
        ...(publicKey ? [env.DB.prepare("UPDATE engine_state SET vault_key = ? WHERE id = 1").bind(publicKey)] : []),
        ...done.map((id) => env.DB.prepare("DELETE FROM vault_inbox WHERE id = ?").bind(id)),
        ...(sites ? [env.DB.prepare("DELETE FROM vault_sites"), ...sites
          .filter((one) => typeof one.site === "string" && typeof one.username === "string")
          .map((one) => env.DB.prepare("INSERT OR REPLACE INTO vault_sites (site, username, updated_at) VALUES (?, ?, ?)")
            .bind(String(one.site).slice(0, 120), String(one.username).slice(0, 200), str(one.updatedAt, 40) ?? iso(Date.now())))] : []),
      ];
      if (statements.length) await env.DB.batch(statements);
      const { results } = await env.DB.prepare("SELECT id, payload FROM vault_inbox ORDER BY created_at LIMIT 20").all<{ id: string; payload: string }>();
      return json({ items: results });
    }

    case "/engine/memory": {
      const satellite = str(body.satellite, 32);
      const docs = Array.isArray(body.docs) ? body.docs as { name?: unknown; body?: unknown }[] : [];
      if (!satellite || !satelliteById(satellite)) return json({ error: "unknown satellite" }, 400);
      const statements = docs.filter((doc) => (doc.name === "memory" || doc.name === "goals") && typeof doc.body === "string")
        .map((doc) => env.DB.prepare(`INSERT INTO memory_docs (satellite, name, body, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (satellite, name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`)
          .bind(satellite, doc.name, String(doc.body).slice(0, 60_000), iso(Date.now())));
      if (statements.length) await env.DB.batch(statements);
      return json({ ok: true });
    }
  }
  return new Response("Not found", { status: 404 });
}

type FinishedJob = { satellite: string; kind: string; depth: number; cancelled: number };
type JobPayload = { notify?: string; title?: string; approvalId?: string; routineId?: string };

/** Posts a finished job's answer: message, files, approval cards, hand-offs and the push. */
async function finishJob(env: EngineEnv, id: string, job: FinishedJob, payload: JobPayload, body: Record<string, unknown>, ok: boolean, text: string) {
  const str = (value: unknown, max = 20_000) => typeof value === "string" ? value.slice(0, max) : null;
  if (job.kind === "action" && payload.approvalId) {
    await env.DB.prepare("UPDATE approvals SET status = ?, result = ? WHERE id = ?").bind(ok ? "done" : "failed", text.slice(0, 500), payload.approvalId).run();
  }
  // A routine with nothing new stays quiet: no message, no push.
  const quiet = ok && job.kind === "routine" && /^\s*NO_CHANGE\s*$/.test(text);
  if (quiet) return json({ ok: true, quiet: true });

  const files = Array.isArray(body.files) ? (body.files as FileIn[]).slice(0, MAX_FILES) : [];
  const actions = Array.isArray(body.actions) ? (body.actions as ActionIn[]).slice(0, 5) : [];
  const prefix = job.kind === "routine" && payload.title ? `**${payload.title}**\n\n` : "";
  const message = job.cancelled ? "멈췄어요." : ok ? `${prefix}${text}` : `일을 끝내지 못했어요. ${text}`;
  const idea = ok && job.kind === "routine" && payload.routineId?.endsWith("-ideas");
  const inserted = await env.DB.prepare("INSERT INTO messages (satellite, role, body, job_id, kind) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(job.satellite, ok || job.cancelled ? "bot" : "error", message, id, idea ? "idea" : null).first<{ id: number }>();
  const statements = files
    .filter((file) => typeof file.base64 === "string" && file.base64.length <= MAX_FILE_BASE64 && typeof file.name === "string")
    .map((file) => env.DB.prepare("INSERT INTO attachments (id, message_id, job_id, satellite, direction, name, mime, size, data) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), inserted!.id, id, job.satellite, String(file.name).slice(0, 120), str(file.mime, 100) ?? "application/octet-stream",
        Math.floor(String(file.base64).length * 3 / 4), file.base64));
  for (const action of actions) {
    if (typeof action.type !== "string" || !ACTION_TYPE.test(action.type) || typeof action.summary !== "string" || typeof action.payload !== "object" || !action.payload) continue;
    const approvalId = crypto.randomUUID();
    statements.push(
      env.DB.prepare("INSERT INTO approvals (id, satellite, type, payload, summary) VALUES (?, ?, ?, ?, ?)")
        .bind(approvalId, job.satellite, action.type, JSON.stringify(action.payload).slice(0, 4000), action.summary.slice(0, 200)),
      env.DB.prepare("INSERT INTO messages (satellite, role, body, job_id, approval_id) VALUES (?, 'approval', ?, ?, ?)")
        .bind(job.satellite, action.summary.slice(0, 200), id, approvalId),
    );
  }
  if (statements.length) await env.DB.batch(statements);
  // Work this satellite passed on. A job that was itself handed off cannot pass work again.
  const handoffs = ok && !job.cancelled && job.depth === 0 && Array.isArray(body.handoffs) ? (body.handoffs as HandoffIn[]).slice(0, 2) : [];
  for (const handoff of handoffs) {
    const to = typeof handoff.to === "string" ? satelliteById(handoff.to.toLowerCase()) : undefined;
    if (!to?.ready || to.id === job.satellite || typeof handoff.message !== "string" || !handoff.message.trim()) continue;
    await handOff(env, job.satellite, to.id, handoff.message.trim().slice(0, 4000), { jobId: id });
  }
  if (payload.notify !== "never" && !job.cancelled) await notify(env, job.satellite, actions.length ? `확인이 필요해요: ${String(actions[0].summary ?? "")}` : message, id);
  return json({ ok: true });
}

/** Cron: a running job whose lease ran out means the engine died mid-job; queued routines whose time came get queued. */
export async function cronTick(env: EngineEnv) {
  const { results } = await env.DB.prepare(`UPDATE jobs SET status = 'failed', finished_at = ?, error = '맥 엔진이 응답하지 않았어요', progress = NULL
    WHERE status = 'running' AND lease_until < ? RETURNING id, satellite`).bind(iso(Date.now()), iso(Date.now())).all<{ id: string; satellite: string }>();
  if (results.length) {
    await env.DB.batch(results.map((job) => env.DB.prepare("INSERT INTO messages (satellite, role, body, job_id) VALUES (?, 'error', ?, ?)")
      .bind(job.satellite, "맥 엔진이 응답하지 않아 멈췄어요. 다시 보내 주세요.", job.id)));
    for (const satellite of new Set(results.map((job) => job.satellite))) await dispatchWaiting(env, satellite);
  }
  await runDueRoutines(env);
}
