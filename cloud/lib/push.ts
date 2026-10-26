// Shared by the Worker's /api/push route and the app's server actions, so it
// takes the env instead of reading the request context.
import { sendPush, type PushTarget } from "./web-push";

import { isCategory, type Category } from "./categories";
import { SITE, TIMEZONE } from "./site";

export { categories, isCategory, type Category } from "./categories";

export type PushMessage = { title: string; body?: string; url?: string; tag?: string; category?: Category; sender?: string };
type PushEnv = Pick<CloudflareEnv, "DB"> & Partial<Pick<CloudflareEnv, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_JWK">>;

// Push services only need a contact for the sender; the app's own address avoids sending anyone's email.
const SUBJECT = SITE.url;

/**
 * Declarative Web Push (iOS 18.4+): Safari shows `notification` itself, even if the
 * service worker is gone, and sets the icon badge. Not `mutable`: that makes iOS wait
 * on public/sw.js, and when the worker doesn't handle the push the notification is
 * dropped. An open app finds new ones itself (components/in-app-banner.tsx). The
 * top-level copies are for the service worker on Android Chrome and older iOS.
 */
export function pushPayload(message: PushMessage, unread: number) {
  const navigate = new URL(message.url || "/", SUBJECT).toString();
  return JSON.stringify({
    web_push: 8030,
    notification: { title: message.title, body: message.body, navigate, tag: message.tag, lang: "ko-KR", icon: `${SUBJECT}/icon.png` },
    app_badge: unread,
    title: message.title, body: message.body, url: message.url, tag: message.tag,
  });
}

export async function saveSubscription(env: PushEnv, email: string, target: PushTarget) {
  await env.DB.prepare(
    "INSERT INTO push_subscriptions (endpoint, email, p256dh, auth) VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth",
  ).bind(target.endpoint, email, target.p256dh, target.auth).run();
}

export async function deleteSubscription(env: PushEnv, email: string, endpoint: string) {
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND email = ?").bind(endpoint, email).run();
}

/** Keeps the message in each person's inbox and pushes it to enabled recipients' devices. Returns how many devices accepted it. */
export async function pushTo(env: PushEnv, emails: string[], message: PushMessage) {
  const lower = [...new Set(emails.map((email) => email.toLowerCase()))];
  if (!lower.length) return 0;
  const category = message.category ?? "system";
  await env.DB.batch(lower.map((email) => env.DB.prepare("INSERT INTO notifications (email, title, body, url, category, sender_email) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(email, message.title, message.body ?? null, message.url ?? null, category, message.sender ?? null)));
  const { results: disabled } = await env.DB.prepare(
    `SELECT email FROM notification_preferences WHERE category = ? AND push_enabled = 0 AND email IN (${lower.map(() => "?").join(", ")})`,
  ).bind(category, ...lower).all<{ email: string }>();
  const disabledEmails = new Set(disabled.map((item) => item.email));
  let enabled = lower.filter((email) => !disabledEmails.has(email));
  if (!enabled.length) return 0;
  {
    const { results: quiet } = await env.DB.prepare(
      `SELECT email, start_minute, end_minute FROM quiet_hours WHERE enabled = 1 AND email IN (${enabled.map(() => "?").join(", ")})`,
    ).bind(...enabled).all<{ email: string; start_minute: number; end_minute: number }>();
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const nowMinute = Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
    const quietEmails = new Set(quiet.filter((item) => isQuiet(nowMinute, item.start_minute, item.end_minute)).map((item) => item.email));
    enabled = enabled.filter((email) => !quietEmails.has(email));
  }
  if (!enabled.length) return 0;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) throw new Error("VAPID keys are not configured");
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK, subject: SUBJECT };
  const { results } = await env.DB.prepare(
    `SELECT email, endpoint, p256dh, auth FROM push_subscriptions WHERE email IN (${enabled.map(() => "?").join(", ")})`,
  ).bind(...enabled).all<PushTarget & { email: string }>();
  const { results: unread } = await env.DB.prepare(
    `SELECT email, COUNT(*) AS n FROM notifications WHERE read_at IS NULL AND email IN (${enabled.map(() => "?").join(", ")}) GROUP BY email`,
  ).bind(...enabled).all<{ email: string; n: number }>();
  const unreadOf = new Map(unread.map((row) => [row.email, row.n]));

  const statuses = await Promise.all(results.map((target) => sendPush(target, pushPayload(message, unreadOf.get(target.email) ?? 1), vapid).catch(() => 0)));
  const gone = results.filter((_, index) => statuses[index] === 404 || statuses[index] === 410);
  if (gone.length) {
    await env.DB.batch(gone.map((target) => env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(target.endpoint)));
  }
  return statuses.filter((status) => status >= 200 && status < 300).length;
}

export async function getPreferences(env: PushEnv, email: string): Promise<Record<Category, boolean>> {
  const preferences: Record<Category, boolean> = { satellite: true, system: true };
  const { results } = await env.DB.prepare("SELECT category, push_enabled FROM notification_preferences WHERE email = ?")
    .bind(email.toLowerCase()).all<{ category: string; push_enabled: number }>();
  for (const item of results) if (isCategory(item.category)) preferences[item.category] = item.push_enabled !== 0;
  return preferences;
}

export async function setPreference(env: PushEnv, email: string, category: Category, enabled: boolean) {
  await env.DB.prepare(
    "INSERT INTO notification_preferences (email, category, push_enabled) VALUES (?, ?, ?) ON CONFLICT (email, category) DO UPDATE SET push_enabled = excluded.push_enabled",
  ).bind(email.toLowerCase(), category, enabled ? 1 : 0).run();
}

export type QuietHours = { enabled: boolean; start: number; end: number };

export function isQuiet(nowMinute: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? nowMinute >= start && nowMinute < end : nowMinute >= start || nowMinute < end;
}

export async function getQuietHours(env: PushEnv, email: string): Promise<QuietHours> {
  const item = await env.DB.prepare("SELECT enabled, start_minute, end_minute FROM quiet_hours WHERE email = ?")
    .bind(email.toLowerCase()).first<{ enabled: number; start_minute: number; end_minute: number }>();
  return item ? { enabled: item.enabled !== 0, start: item.start_minute, end: item.end_minute } : { enabled: false, start: 1380, end: 480 };
}

export async function setQuietHours(env: PushEnv, email: string, enabled: boolean, start: number, end: number) {
  await env.DB.prepare(
    "INSERT INTO quiet_hours (email, enabled, start_minute, end_minute) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET enabled = excluded.enabled, start_minute = excluded.start_minute, end_minute = excluded.end_minute",
  ).bind(email.toLowerCase(), enabled ? 1 : 0, start, end).run();
}

export type NotificationRecord = { id: number; title: string; body: string | null; url: string | null; category: Category; createdAt: string; readAt: string | null };

export async function listNotifications(env: PushEnv, email: string, category?: Category) {
  const { results } = await env.DB.prepare(
    `SELECT id, title, body, url, category, created_at AS createdAt, read_at AS readAt FROM notifications WHERE email = ?${category ? " AND category = ?" : ""} ORDER BY id DESC LIMIT 200`,
  ).bind(...(category ? [email, category] : [email])).all<NotificationRecord>();
  return results;
}

/** The home screen badge: satellite answers after where I last read (see lib/conversations.ts unreadBySatellite). */
export async function unreadCount(env: PushEnv, email: string) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM messages m LEFT JOIN satellite_reads r ON r.email = ? AND r.satellite = m.satellite
    WHERE m.role IN ('bot', 'error', 'approval') AND m.id > COALESCE(r.last_read_id, 0)`).bind(email).first<{ n: number }>();
  return row?.n ?? 0;
}

/** The newest unread notification, so an open app can show it as a banner. */
export async function latestUnread(env: PushEnv, email: string) {
  return env.DB.prepare("SELECT id, title, body, url FROM notifications WHERE email = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1")
    .bind(email).first<{ id: number; title: string; body: string | null; url: string | null }>();
}

export async function markAllRead(env: PushEnv, email: string) {
  await env.DB.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE email = ? AND read_at IS NULL").bind(email).run();
}

/** Deletes the given notifications of this person; no ids deletes them all. */
export async function deleteNotifications(env: PushEnv, email: string, ids?: number[]) {
  if (!ids) {
    await env.DB.prepare("DELETE FROM notifications WHERE email = ?").bind(email).run();
    return;
  }
  if (!ids.length) return;
  await env.DB.prepare(`DELETE FROM notifications WHERE email = ? AND id IN (${ids.map(() => "?").join(", ")})`).bind(email, ...ids).run();
}
