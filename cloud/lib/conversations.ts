import "server-only";
import { WAITING } from "./queue";

// One running conversation per satellite, and the jobs the Mac engine works through.

type Env = Pick<CloudflareEnv, "DB">;

export type FileInfo = { id: string; name: string; mime: string; size: number };
export type Approval = { id: string; type: string; summary: string; status: "pending" | "approved" | "rejected" | "done" | "failed"; result: string | null; payload: string };
export type Message = {
  id: number; role: "me" | "bot" | "error" | "approval" | "handoff"; body: string; createdAt: string; approvalId: string | null; files: FileInfo[];
  kind: string | null; peer: string | null; myReaction: string | null; botReaction: string | null; pinned: number; waiting: number;
};
/** Fields of recent messages that change after they arrive (reactions, waiting), re-sent on every poll. */
export type Mark = Pick<Message, "id" | "myReaction" | "botReaction" | "pinned" | "waiting">;
export type JobState = { id: string; status: "queued" | "running" | "done" | "failed"; progress: string | null; createdAt: string; kind: string };
export type Feed = { messages: Message[]; job: JobState | null; approvals: Approval[]; marks: Mark[] };
export type Activity = { id: string; satellite: string; prompt: string; kind: string; title: string | null; status: JobState["status"]; progress: string | null; createdAt: string; finishedAt: string | null };

const ENGINE_ONLINE_MS = 90_000;

/** Messages after `afterId` (the last 200 when 0) with their files, the newest unfinished job, and recent approval states. */
export async function getFeed(env: Env, satellite: string, afterId = 0): Promise<Feed> {
  const [rows, job, approvals, marks] = await Promise.all([
    env.DB.prepare(`SELECT id, role, body, created_at AS createdAt, approval_id AS approvalId, kind, peer, my_reaction AS myReaction,
        bot_reaction AS botReaction, pinned, (${WAITING}) AS waiting FROM (
        SELECT * FROM messages WHERE satellite = ? AND id > ? ORDER BY id DESC LIMIT 200
      ) ORDER BY id`).bind(satellite, afterId).all<Omit<Message, "files">>(),
    env.DB.prepare("SELECT id, status, progress, created_at AS createdAt, kind FROM jobs WHERE satellite = ? AND status IN ('queued', 'running') AND kind IN ('chat', 'routine', 'action') ORDER BY created_at DESC LIMIT 1")
      .bind(satellite).first<JobState>(),
    env.DB.prepare("SELECT id, type, summary, status, result, payload FROM approvals WHERE satellite = ? ORDER BY created_at DESC LIMIT 30")
      .bind(satellite).all<Approval>(),
    env.DB.prepare(`SELECT id, my_reaction AS myReaction, bot_reaction AS botReaction, pinned,
        (${WAITING}) AS waiting
        FROM messages WHERE satellite = ? ORDER BY id DESC LIMIT 40`).bind(satellite).all<Mark>(),
  ]);
  const ids = rows.results.map((row) => row.id);
  const files = new Map<number, FileInfo[]>();
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id, message_id AS messageId, name, mime, size FROM attachments WHERE message_id IN (${ids.map(() => "?").join(", ")})`)
      .bind(...ids).all<FileInfo & { messageId: number }>();
    for (const file of results) (files.get(file.messageId) ?? files.set(file.messageId, []).get(file.messageId)!).push({ id: file.id, name: file.name, mime: file.mime, size: file.size });
  }
  return { messages: rows.results.map((row) => ({ ...row, files: files.get(row.id) ?? [] })), job, approvals: approvals.results, marks: marks.results };
}

export type { NewFile } from "./queue";

/** Latest message per satellite, for the list's preview line and time. */
export async function lastMessages(env: Env) {
  const { results } = await env.DB.prepare(`SELECT m.satellite, m.role, m.body, m.created_at AS createdAt FROM messages m
    JOIN (SELECT satellite, MAX(id) AS id FROM messages GROUP BY satellite) last ON last.id = m.id`).all<{ satellite: string; role: Message["role"]; body: string; createdAt: string }>();
  return new Map(results.map((row) => [row.satellite, row]));
}

/** Satellites with a job that is waiting or running right now. */
export async function busySatellites(env: Env) {
  const { results } = await env.DB.prepare("SELECT DISTINCT satellite FROM jobs WHERE status IN ('queued', 'running') AND kind != 'memory'").all<{ satellite: string }>();
  return new Set(results.map((row) => row.satellite));
}

/** Satellites waiting on me (a pending approval card). */
export async function askingSatellites(env: Env) {
  const { results } = await env.DB.prepare("SELECT DISTINCT satellite FROM approvals WHERE status = 'pending'").all<{ satellite: string }>();
  return new Set(results.map((row) => row.satellite));
}

/** SQL: messages a satellite sent me (answers, errors, cards); my own lines and hand-offs don't count as unread. */
const FOR_ME = "role IN ('bot', 'error', 'approval')";

/** Unread answers per satellite (after where I last read), for the blue dots. */
export async function unreadBySatellite(env: Env, email: string) {
  const { results } = await env.DB.prepare(`SELECT m.satellite, COUNT(*) AS n FROM messages m
      LEFT JOIN satellite_reads r ON r.email = ? AND r.satellite = m.satellite
      WHERE m.${FOR_ME} AND m.id > COALESCE(r.last_read_id, 0) GROUP BY m.satellite`)
    .bind(email).all<{ satellite: string; n: number }>();
  return new Map(results.map((row) => [row.satellite, row.n]));
}

/** All unread answers, for the home screen icon badge. */
export async function unreadTotal(env: Env, email: string) {
  let total = 0;
  for (const n of (await unreadBySatellite(env, email)).values()) total += n;
  return total;
}

/**
 * Marks a conversation read up to `upToId`, the newest message actually shown (never past it, so an
 * answer that lands meanwhile stays unread). Also clears that satellite's notifications for the banner.
 */
export async function markSatelliteRead(env: Env, email: string, satellite: string, upToId: number) {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO satellite_reads (email, satellite, last_read_id) VALUES (?, ?, ?)
      ON CONFLICT (email, satellite) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`).bind(email, satellite, upToId),
    env.DB.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE email = ? AND url = ? AND read_at IS NULL")
      .bind(email, `/s/${satellite}`),
  ]);
}

export async function recentActivity(env: Env, satellite?: string, limit = 12): Promise<Activity[]> {
  const where = satellite ? "AND satellite = ?" : "";
  const { results } = await env.DB.prepare(`SELECT id, satellite, prompt, kind, json_extract(payload, '$.title') AS title, status, progress,
      created_at AS createdAt, finished_at AS finishedAt FROM jobs WHERE kind != 'memory' ${where} ORDER BY created_at DESC LIMIT ?`)
    .bind(...(satellite ? [satellite, limit] : [limit])).all<Activity>();
  return results;
}

export async function engineStatus(env: Env) {
  const row = await env.DB.prepare("SELECT last_seen_at AS lastSeen, version FROM engine_state WHERE id = 1").first<{ lastSeen: string; version: string | null }>();
  return { online: !!row && Date.now() - Date.parse(row.lastSeen) < ENGINE_ONLINE_MS, lastSeen: row?.lastSeen ?? null, version: row?.version ?? null };
}

export async function getSnapshot<T = Record<string, unknown>>(env: Env, satellite: string) {
  const row = await env.DB.prepare("SELECT data, observed_at AS observedAt, updated_at AS updatedAt FROM snapshots WHERE satellite = ?").bind(satellite).first<{ data: string; observedAt: string | null; updatedAt: string }>();
  return row ? { data: JSON.parse(row.data) as T, observedAt: row.observedAt, updatedAt: row.updatedAt } : null;
}

export async function getMemoryDocs(env: Env, satellite: string) {
  const { results } = await env.DB.prepare("SELECT name, body, updated_at AS updatedAt FROM memory_docs WHERE satellite = ?").bind(satellite).all<{ name: "memory" | "goals"; body: string; updatedAt: string }>();
  return Object.fromEntries(results.map((doc) => [doc.name, doc])) as Partial<Record<"memory" | "goals", { body: string; updatedAt: string }>>;
}
