/** Secrets and local-only vars, kept outside Wrangler's generated types. */
interface CloudflareEnv {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  /** The Mac engine's bearer token (Keychain orbit-engine-token). */
  ENGINE_TOKEN?: string;
  /** `next dev` only (.dev.vars): who to treat as signed in. */
  DEV_VIEWER_EMAIL?: string;
}
