"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LIST_ORDER_COOKIE, type ListOrder } from "@/lib/list-order";
import { getViewer, requireViewer } from "@/lib/auth";
import { getFeed, markSatelliteRead, type Feed, type NewFile } from "@/lib/conversations";
import { getEnv } from "@/lib/env";
import { deleteSubscription, latestUnread, pushTo, saveSubscription, unreadCount } from "@/lib/push";
import { listRoutines, nextRun, queueRoutine } from "@/lib/routines";
import { addMessage, dispatchWaiting, handOff, WAITING } from "@/lib/queue";
import { REACTIONS } from "@/lib/reactions";
import { satelliteById, satellites } from "@/lib/satellites";

const MAX_MESSAGE = 4000;
const MAX_FILES = 4;
const MAX_FILE_BASE64 = 1_400_000;

type Result = { ok: true } | { error: string };

/**
 * Sends a message (and up to four small files) to a satellite. While it is busy the message waits and goes
 * out with its next job. "@Tempo …" passes the message (with this satellite's last answer) to Tempo instead.
 */
export async function sendToSatellite(satelliteId: string, text: string, files: NewFile[] = []): Promise<Result> {
  await requireViewer();
  const satellite = satelliteById(satelliteId);
  if (!satellite?.ready) return { error: "아직 준비 중인 위성이에요." };
  const body = typeof text === "string" ? text.trim() : "";
  const clean = (Array.isArray(files) ? files : []).slice(0, MAX_FILES).filter((file) =>
    typeof file?.name === "string" && typeof file.mime === "string" && typeof file.base64 === "string" && /^[A-Za-z0-9+/=]+$/.test(file.base64.slice(0, 200)));
  if (clean.some((file) => file.base64.length > MAX_FILE_BASE64)) return { error: "파일은 하나에 1MB까지 보낼 수 있어요." };
  if (!body && !clean.length) return { error: "보낼 내용을 적어 주세요." };
  if (body.length > MAX_MESSAGE) return { error: `${MAX_MESSAGE}자까지 보낼 수 있어요.` };
  const env = await getEnv();
  const newFiles = clean.map((file) => ({ name: file.name.slice(0, 120), mime: file.mime.slice(0, 100), base64: file.base64 }));
  const mention = /^@(\S+)\s+([\s\S]+)$/.exec(body);
  const target = mention ? satellites.find((one) => one.ready && one.id !== satellite.id && [one.id, one.name.toLowerCase()].includes(mention[1].toLowerCase())) : undefined;
  if (mention && target) {
    const last = await env.DB.prepare("SELECT body FROM messages WHERE satellite = ? AND role = 'bot' ORDER BY id DESC LIMIT 1").bind(satellite.id).first<{ body: string }>();
    await handOff(env, satellite.id, target.id, mention[2].trim(), { byMe: true, files: newFiles, context: last?.body.slice(0, 4000) });
  } else {
    await addMessage(env, satellite.id, { role: "me", body: body || "(첨부 파일)" }, newFiles);
    await dispatchWaiting(env, satellite.id);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** New messages after `afterId`, the running job and approval states, polled by the open chat. */
export async function pollFeed(satelliteId: string, afterId: number): Promise<Feed | null> {
  const viewer = await getViewer();
  if (!viewer || !satelliteById(satelliteId) || !Number.isInteger(afterId)) return null;
  const env = await getEnv();
  const feed = await getFeed(env, satelliteId, afterId);
  if (feed.messages.length) await markSatelliteRead(env, viewer.email, satelliteId, feed.messages[feed.messages.length - 1].id);
  return feed;
}

/** Stops the satellite's current job: a waiting one at once, a running one at its next progress report. */
export async function cancelJob(satelliteId: string): Promise<Result> {
  await requireViewer();
  const env = await getEnv();
  await env.DB.batch([
    env.DB.prepare("UPDATE jobs SET status = 'failed', error = '멈춤', finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE satellite = ? AND status = 'queued'").bind(satelliteId),
    env.DB.prepare("UPDATE jobs SET cancel_requested = 1 WHERE satellite = ? AND status = 'running'").bind(satelliteId),
    // Stop means stop: follow-ups waiting behind the job do not go out on their own.
    env.DB.prepare(`UPDATE messages SET job_id = 'cancelled' WHERE satellite = ? AND ${WAITING}`).bind(satelliteId),
  ]);
  return { ok: true };
}

/** Sends my last message to the satellite again (after a failure). */
export async function retryLast(satelliteId: string): Promise<Result> {
  await requireViewer();
  const env = await getEnv();
  const last = await env.DB.prepare("SELECT body FROM messages WHERE satellite = ? AND role = 'me' ORDER BY id DESC LIMIT 1").bind(satelliteId).first<{ body: string }>();
  if (!last) return { error: "다시 보낼 메시지가 없어요." };
  return sendToSatellite(satelliteId, last.body);
}

/** My reaction on a satellite's answer (null clears it). 👍/👎 reach the satellite as feedback on its next job. */
export async function setReaction(messageId: number, emoji: string | null): Promise<Result> {
  await requireViewer();
  if (!Number.isInteger(messageId) || (emoji !== null && !REACTIONS.includes(emoji))) return { error: "반응을 남기지 못했어요." };
  const env = await getEnv();
  await env.DB.prepare("UPDATE messages SET my_reaction = ?, my_reaction_at = CASE WHEN ? IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%SZ', 'now') END WHERE id = ? AND role IN ('bot', 'handoff')")
    .bind(emoji, emoji, messageId).run();
  return { ok: true };
}

/** Approves or rejects an approval card; an approved one becomes an action job the engine runs. */
export async function decideApproval(approvalId: string, approve: boolean): Promise<Result> {
  await requireViewer();
  const env = await getEnv();
  const row = await env.DB.prepare("UPDATE approvals SET status = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND status = 'pending' RETURNING satellite, type, payload, summary")
    .bind(approve ? "approved" : "rejected", approvalId).first<{ satellite: string; type: string; payload: string; summary: string }>();
  if (!row) return { error: "이미 처리된 카드예요." };
  if (approve) {
    await env.DB.prepare("INSERT INTO jobs (id, satellite, prompt, kind, payload) VALUES (?, ?, ?, 'action', ?)")
      .bind(crypto.randomUUID(), row.satellite, row.summary, JSON.stringify({ approvalId, type: row.type, action: JSON.parse(row.payload), notify: "never" })).run();
  }
  return { ok: true };
}

export async function setRoutineEnabled(routineId: string, enabled: boolean): Promise<Result> {
  await requireViewer();
  const env = await getEnv();
  await env.DB.prepare("UPDATE routines SET enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, routineId).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function runRoutineNow(routineId: string): Promise<Result> {
  await requireViewer();
  const env = await getEnv();
  const routine = (await listRoutines(env)).find((one) => one.id === routineId);
  if (!routine) return { error: "루틴을 찾지 못했어요." };
  await queueRoutine(env, { ...routine, nextRunAt: nextRun(routine.times, routine.weekdays) });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Saves an edited memory.md / goals.md; the engine writes it to the Mac file. */
export async function saveMemoryDoc(satelliteId: string, name: "memory" | "goals", body: string): Promise<Result> {
  await requireViewer();
  if (!satelliteById(satelliteId) || (name !== "memory" && name !== "goals") || typeof body !== "string" || body.length > 60_000) return { error: "저장하지 못했어요." };
  const env = await getEnv();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO memory_docs (satellite, name, body) VALUES (?, ?, ?)
      ON CONFLICT (satellite, name) DO UPDATE SET body = excluded.body, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`).bind(satelliteId, name, body),
    env.DB.prepare("INSERT INTO jobs (id, satellite, prompt, kind, payload) VALUES (?, ?, ?, 'memory', ?)")
      .bind(crypto.randomUUID(), satelliteId, `${name}.md 저장`, JSON.stringify({ name, body })),
  ]);
  return { ok: true };
}

type SubscriptionJson = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

/** Saves this device's push subscription for whoever is signed in. */
export async function savePushSubscription(subscription: SubscriptionJson) {
  const viewer = await requireViewer();
  const { endpoint, keys } = subscription;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    throw new Error("Invalid push subscription.");
  }
  await saveSubscription(await getEnv(), viewer.email, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
}

export async function removePushSubscription(endpoint: string) {
  const viewer = await getViewer();
  if (!viewer || typeof endpoint !== "string") return;
  await deleteSubscription(await getEnv(), viewer.email, endpoint);
}

export async function sendTestPush() {
  const viewer = await requireViewer();
  return pushTo(await getEnv(), [viewer.email], { title: "Orbit", body: "알림이 잘 와요", url: "/", tag: "test", category: "system" });
}

/** The viewer's newest unread notification, polled by the in-app banner while the app is open. */
export async function getLatestUnread() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const env = await getEnv();
  const [latest, unread] = await Promise.all([latestUnread(env, viewer.email), unreadCount(env, viewer.email)]);
  return { latest, unread };
}

/** Remembers how this browser orders the satellite list. */
export async function setListOrder(order: ListOrder) {
  await requireViewer();
  if (order !== "recent" && order !== "fixed") return;
  (await cookies()).set(LIST_ORDER_COOKIE, order, { maxAge: 400 * 86400, path: "/", sameSite: "lax", secure: true, httpOnly: true });
  revalidatePath("/", "layout");
}

const BASE64 = /^[A-Za-z0-9+/]+=*$/;

/** Hands the Mac a login sealed on this phone with the engine's public key. The Worker never sees it open. */
export async function sendVaultLogin(sealed: { e: string; iv: string; c: string }): Promise<Result> {
  await requireViewer();
  const { e, iv, c } = sealed ?? {};
  if (![e, iv, c].every((part) => typeof part === "string" && BASE64.test(part)) || e.length > 200 || iv.length > 40 || c.length > 2000) return { error: "저장하지 못했어요." };
  const env = await getEnv();
  await env.DB.prepare("INSERT INTO vault_inbox (id, payload) VALUES (?, ?)").bind(crypto.randomUUID(), JSON.stringify({ e, iv, c })).run();
  return { ok: true };
}

/** Asks the Mac to delete a saved login from its Keychain. */
export async function removeVaultLogin(site: string): Promise<Result> {
  await requireViewer();
  if (typeof site !== "string" || !site || site.length > 120) return { error: "지우지 못했어요." };
  const env = await getEnv();
  await env.DB.prepare("INSERT INTO vault_inbox (id, payload) VALUES (?, ?)").bind(crypto.randomUUID(), JSON.stringify({ op: "delete", site })).run();
  return { ok: true };
}
