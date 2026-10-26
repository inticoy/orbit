// Messages waiting for a satellite and the jobs that carry them, shared by the app
// (sending, @mentions) and the engine door (finishing a job, hand-offs).
// A message waits with job_id NULL while its satellite is busy; when the
// satellite is free, everything waiting goes out together as one chat job.
import { satelliteById } from "./satellites";

type Env = Pick<CloudflareEnv, "DB">;
export type NewFile = { name: string; mime: string; base64: string };

const BUSY = "SELECT 1 FROM jobs WHERE satellite = ? AND status IN ('queued', 'running') AND kind != 'memory'";
/** SQL: a message that waits for its satellite's next job. */
export const WAITING = "job_id IS NULL AND ((role = 'me' AND kind IS NULL) OR (role = 'handoff' AND kind IN ('in', 'mention')))";

export async function isBusy(env: Env, satellite: string) {
  return !!await env.DB.prepare(`${BUSY} LIMIT 1`).bind(satellite).first();
}

/** Adds one message (and my files) to a satellite's conversation. */
export async function addMessage(env: Env, satellite: string, message: { role: string; body: string; kind?: string | null; peer?: string | null; jobId?: string | null }, files: NewFile[] = []) {
  const row = await env.DB.prepare("INSERT INTO messages (satellite, role, body, kind, peer, job_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(satellite, message.role, message.body, message.kind ?? null, message.peer ?? null, message.jobId ?? null).first<{ id: number }>();
  if (files.length) {
    await env.DB.batch(files.map((file) => env.DB.prepare("INSERT INTO attachments (id, message_id, satellite, direction, name, mime, size, data) VALUES (?, ?, ?, 'in', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), row!.id, satellite, file.name, file.mime, Math.floor(file.base64.length * 3 / 4), file.base64)));
  }
  return row!.id;
}

/** If the satellite is free, starts one chat job with every waiting message. Returns the job id, or null. */
export async function dispatchWaiting(env: Env, satellite: string) {
  const { results } = await env.DB.prepare(`SELECT id, role, body, kind, peer FROM messages WHERE satellite = ? AND ${WAITING} ORDER BY id`)
    .bind(satellite).all<{ id: number; role: string; body: string; kind: string | null; peer: string | null }>();
  if (!results.length) return null;
  const parts = results.map((message) => {
    const from = satelliteById(message.peer ?? "")?.name ?? message.peer;
    if (message.role !== "handoff") return message.body;
    return message.kind === "in" ? `[${from}가 넘긴 일]\n${message.body}` : `[내가 ${from} 대화에서 보낸 메시지]\n${message.body}`;
  });
  const prompt = parts.length > 1 ? `(이어서 보낸 메시지 ${parts.length}개)\n\n${parts.join("\n\n---\n\n")}` : parts[0];
  const depth = results.some((message) => message.role === "handoff" && message.kind === "in") ? 1 : 0;
  const ids = results.map((message) => message.id);
  const marks = ids.map(() => "?").join(", ");
  const jobId = crypto.randomUUID();
  // The insert only happens when nothing else is queued or running, so two senders cannot start two jobs.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO jobs (id, satellite, prompt, depth) SELECT ?, ?, ?, ? WHERE NOT EXISTS (${BUSY})`).bind(jobId, satellite, prompt, depth, satellite),
    env.DB.prepare(`UPDATE messages SET job_id = ? WHERE id IN (${marks}) AND job_id IS NULL AND EXISTS (SELECT 1 FROM jobs WHERE id = ?)`).bind(jobId, ...ids, jobId),
    env.DB.prepare(`UPDATE attachments SET job_id = ? WHERE message_id IN (${marks}) AND EXISTS (SELECT 1 FROM jobs WHERE id = ?)`).bind(jobId, ...ids, jobId),
  ]);
  return inserted.meta.changes ? jobId : null;
}

/** Passes work to another satellite: a note in the sender's chat, the work in the receiver's, then dispatch. */
export async function handOff(env: Env, from: string, to: string, body: string, options: { byMe?: boolean; jobId?: string | null; files?: NewFile[]; context?: string } = {}) {
  if (options.byMe) await addMessage(env, from, { role: "me", body, kind: "mention", peer: to });
  else await addMessage(env, from, { role: "handoff", body, kind: "out", peer: to, jobId: options.jobId });
  const work = options.context ? `${body}\n\n[참고: ${satelliteById(from)?.name ?? from}의 최근 답]\n${options.context}` : body;
  await addMessage(env, to, { role: "handoff", body: work, kind: options.byMe ? "mention" : "in", peer: from }, options.files);
  return dispatchWaiting(env, to);
}
