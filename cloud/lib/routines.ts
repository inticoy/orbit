// Routine schedule math in the owner's time zone and queueing, shared by the Worker cron and the app.

import { TIMEZONE } from "@/lib/site";

type Env = Pick<CloudflareEnv, "DB">;
export type Routine = {
  id: string; satellite: string; title: string; prompt: string; times: string; weekdays: string | null;
  enabled: number; notify: "change" | "always" | "never"; lastRunAt: string | null; nextRunAt: string | null;
};

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// Encode local parts as UTC only to do calendar arithmetic, never as an instant.
const localParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
function wallTime(at: number) {
  const p = Object.fromEntries(localParts.formatToParts(at).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}
function zoneOffset(at: number) { return wallTime(at) - Math.floor(at / 1000) * 1000; }
function resolveTime(wall: number) {
  const guess = wall - zoneOffset(wall);
  const corrected = wall - zoneOffset(guess);
  // A nonexistent spring wall time moves forward by the DST gap.
  return wallTime(corrected) === wall ? corrected : Math.max(guess, corrected);
}

/** The next run strictly after `after`, from "HH:MM,…" in the owner's time zone (0 = Sunday). */
export function nextRun(times: string, weekdays: string | null, after = Date.now()) {
  if (!Number.isFinite(after)) return null;
  const slots = times.split(",").map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => {
    const [h, m] = t.split(":").map(Number);
    return h < 24 && m < 60 ? h * 60 + m : NaN;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  if (!slots.length) return null;
  const days = weekdays ? new Set(weekdays.split(",").map(Number)) : null;
  const localNow = new Date(wallTime(after));
  const dayStart = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
  for (let offset = 0; offset < 8; offset++) {
    const start = dayStart + offset * 86400_000;
    if (days && !days.has(new Date(start).getUTCDay())) continue;
    const candidates = slots.map((minute) => resolveTime(start + minute * 60_000)).filter((at) => at > after);
    if (candidates.length) return iso(Math.min(...candidates));
  }
  return null;
}

export async function listRoutines(env: Env, satellite?: string) {
  const { results } = await env.DB.prepare(`SELECT id, satellite, title, prompt, times, weekdays, enabled, notify,
      last_run_at AS lastRunAt, next_run_at AS nextRunAt FROM routines ${satellite ? "WHERE satellite = ?" : ""} ORDER BY times`)
    .bind(...(satellite ? [satellite] : [])).all<Routine>();
  return results;
}

/** Puts one routine run in the queue (unless one is already waiting) and moves its next run. */
export async function queueRoutine(env: Env, routine: Routine) {
  const waiting = await env.DB.prepare("SELECT 1 FROM jobs WHERE kind = 'routine' AND status IN ('queued', 'running') AND json_extract(payload, '$.routineId') = ?")
    .bind(routine.id).first();
  const now = Date.now();
  const statements = [env.DB.prepare("UPDATE routines SET last_run_at = ?, next_run_at = ? WHERE id = ?").bind(iso(now), nextRun(routine.times, routine.weekdays, now), routine.id)];
  if (!waiting) {
    statements.push(env.DB.prepare("INSERT INTO jobs (id, satellite, prompt, kind, payload) VALUES (?, ?, ?, 'routine', ?)")
      .bind(crypto.randomUUID(), routine.satellite, routine.prompt, JSON.stringify({ routineId: routine.id, title: routine.title, notify: routine.notify })));
  }
  await env.DB.batch(statements);
}

/** Cron: queue every enabled routine whose time has come; fill in missing next-run times. */
export async function runDueRoutines(env: Env) {
  const now = Date.now();
  for (const routine of await listRoutines(env)) {
    if (!routine.nextRunAt) {
      await env.DB.prepare("UPDATE routines SET next_run_at = ? WHERE id = ?").bind(nextRun(routine.times, routine.weekdays, now), routine.id).run();
      continue;
    }
    if (routine.enabled && Date.parse(routine.nextRunAt) <= now) await queueRoutine(env, routine);
    else if (!routine.enabled && Date.parse(routine.nextRunAt) <= now) {
      await env.DB.prepare("UPDATE routines SET next_run_at = ? WHERE id = ?").bind(nextRun(routine.times, routine.weekdays, now), routine.id).run();
    }
  }
}
