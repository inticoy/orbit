import "server-only";
import { engineStatus, getSnapshot, recentActivity } from "@/lib/conversations";

import { satellites } from "@/lib/satellites";
import { SITE } from "@/lib/site";

export type Idea = { id: number; satellite: string; body: string; createdAt: string };

/** Everything the 오늘 view needs. */
export async function loadToday(env: Pick<CloudflareEnv, "DB">) {
  const [engine, activity, snapshots, briefing, ideas] = await Promise.all([
    engineStatus(env), recentActivity(env),
    Promise.all(satellites.filter((s) => s.dashboard).map(async ({ id }) => [id, await getSnapshot(env, id)] as const)).then(Object.fromEntries),
    SITE.briefing ? env.DB.prepare("SELECT body, created_at AS createdAt FROM messages WHERE satellite = ? AND role = 'bot' ORDER BY id DESC LIMIT 1").bind(SITE.briefing).first<{ body: string; createdAt: string }>() : null,
    // What satellites told me unasked in the last three days.
    env.DB.prepare("SELECT id, satellite, body, created_at AS createdAt FROM messages WHERE kind = 'idea' AND created_at > ? ORDER BY id DESC LIMIT 4")
      .bind(new Date(Date.now() - 3 * 86400_000).toISOString()).all<Idea>().then((rows) => rows.results),
  ]);
  return { engine, activity, snapshots, briefing, ideas };
}
