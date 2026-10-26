import "server-only";

export type VaultSite = { site: string; username: string; updatedAt: string };

/** The engine's public key (null until the engine has started once) and the logins the Mac holds. */
export async function getVault(env: Pick<CloudflareEnv, "DB">) {
  const [state, sites, waiting] = await Promise.all([
    env.DB.prepare("SELECT vault_key AS publicKey FROM engine_state WHERE id = 1").first<{ publicKey: string | null }>(),
    env.DB.prepare("SELECT site, username, updated_at AS updatedAt FROM vault_sites ORDER BY site").all<VaultSite>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM vault_inbox").first<{ n: number }>(),
  ]);
  return { publicKey: state?.publicKey ?? null, sites: sites.results, waiting: waiting?.n ?? 0 };
}
