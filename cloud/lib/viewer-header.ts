/** Set only by the Worker (lib/login-worker.ts) after it checks the login; any incoming copy is dropped. */
export const VIEWER_HEADER = "x-orbit-viewer";
/** How that person got in: "session" (the app's login) or "access" (Cloudflare Access, during the switch). */
export const VIA_HEADER = "x-orbit-via";
