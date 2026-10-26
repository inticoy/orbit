import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Bindings and vars from wrangler.jsonc (and .dev.vars locally). */
export async function getEnv(): Promise<Partial<CloudflareEnv> & Pick<CloudflareEnv, "DB">> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}
