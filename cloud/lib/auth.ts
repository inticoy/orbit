import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { getEnv } from "@/lib/env";
import { emailList } from "@/lib/emails";
import { VIEWER_HEADER } from "@/lib/viewer-header";

export type Viewer = { email: string };

/**
 * Who is looking at the page. The Worker in front of Next (custom-worker.ts,
 * lib/login-worker.ts) checks the session cookie and sets a header only it
 * can set; this reads that header. `next dev` runs without the Worker, so
 * there (and only in development) it trusts DEV_VIEWER_EMAIL from the local
 * .dev.vars, which is never deployed — production without the header gets nothing.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Always per request: a page must never be prerendered with someone's data.
  await connection();
  const env = await getEnv();
  const devViewer = process.env.NODE_ENV === "development" ? env.DEV_VIEWER_EMAIL?.toLowerCase() : undefined;
  const email = (await headers()).get(VIEWER_HEADER)?.toLowerCase() ?? devViewer ?? null;
  if (!email || !emailList(env.OWNER_EMAILS).includes(email)) return null;
  return { email };
});

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) throw new Error("Login required.");
  return viewer;
}
