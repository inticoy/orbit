// The app's own login, run in the Worker in front of Next (custom-worker.ts):
// who is asking is decided here once per request and handed to the app in a
// header that only this code can set.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

export { VIA_HEADER, VIEWER_HEADER } from "./viewer-header";
const COOKIE = "orbit_session";
// 400 days is the longest cookie browsers keep; each visit (at most daily) starts it over.
const SESSION_DAYS = 400;
const REFRESH_AFTER_MS = 24 * 3600_000;
const CHALLENGE_MS = 5 * 60_000;
const ATTEMPT_WINDOW_MS = 10 * 60_000;
const ATTEMPTS_PER_WINDOW = 20;

type LoginEnv = Pick<CloudflareEnv, "DB"> & Partial<Pick<CloudflareEnv, "OWNER_EMAILS">>;
export type Signed = { email: string; via: "session"; refresh?: string };

const encoder = new TextEncoder();
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

function b64url(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export async function sha256(text: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function isAllowed(env: LoginEnv, email: string) {
  const list = (env.OWNER_EMAILS ?? "").split(",").map((one) => one.trim().toLowerCase());
  return list.includes(email.toLowerCase());
}

function cookieValue(request: Request) {
  const match = /(?:^|;\s*)orbit_session=([^;]+)/.exec(request.headers.get("Cookie") ?? "");
  return match?.[1] ?? null;
}

function sessionCookie(token: string) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

const userAgent = (request: Request) => request.headers.get("User-Agent")?.slice(0, 300) ?? null;

async function startSession(env: LoginEnv, email: string, request: Request) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(iso(now)),
    env.DB.prepare("INSERT INTO sessions (token_hash, email, expires_at, user_agent) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), email.toLowerCase(), iso(now + SESSION_DAYS * 86400_000), userAgent(request)),
  ]);
  return sessionCookie(token);
}

/** Who sent this request, from the session cookie. */
export async function signedIn(request: Request, env: LoginEnv): Promise<Signed | null> {
  const token = cookieValue(request);
  if (token) {
    const hash = await sha256(token);
    const row = await env.DB.prepare("SELECT email, last_seen_at AS lastSeen FROM sessions WHERE token_hash = ? AND expires_at > ?")
      .bind(hash, iso(Date.now())).first<{ email: string; lastSeen: string }>();
    if (row && isAllowed(env, row.email)) {
      if (Date.now() - Date.parse(row.lastSeen) < REFRESH_AFTER_MS) return { email: row.email, via: "session" };
      const now = Date.now();
      await env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ?, user_agent = COALESCE(?, user_agent) WHERE token_hash = ?")
        .bind(iso(now), iso(now + SESSION_DAYS * 86400_000), userAgent(request), hash).run();
      return { email: row.email, via: "session", refresh: sessionCookie(token) };
    }
  }
  return null;
}

/** Public login/offline pages and assets iOS fetches for the home screen without cookies. */
export function isPublicPath(path: string) {
  return path === "/login" || path === "/offline" || path === "/offline.html" || path === "/sw.js" || path === "/manifest.webmanifest" || path === "/favicon.ico"
    || /^\/(apple-icon|icon|icon-512)\.png$/.test(path);
}

async function takeChallenge(env: LoginEnv, id: unknown) {
  if (typeof id !== "string") return null;
  const row = await env.DB.prepare("DELETE FROM auth_challenges WHERE id = ? RETURNING challenge, email, expires_at AS expiresAt")
    .bind(id).first<{ challenge: string; email: string | null; expiresAt: string }>();
  return row && Date.parse(row.expiresAt) > Date.now() ? row : null;
}

async function saveChallenge(env: LoginEnv, challenge: string, email: string | null) {
  const id = randomToken(16);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(iso(now)),
    env.DB.prepare("INSERT INTO auth_challenges (id, challenge, email, expires_at) VALUES (?, ?, ?, ?)").bind(id, challenge, email, iso(now + CHALLENGE_MS)),
  ]);
  return id;
}

function json(body: unknown, init: ResponseInit & { cookie?: string } = {}) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (init.cookie) headers.append("Set-Cookie", init.cookie);
  return Response.json(body, { status: init.status, headers });
}

// Codes are 12 characters (about 60 bits), so guessing is already hopeless; this keeps it that way per IP.
async function underAttemptLimit(request: Request, env: LoginEnv) {
  const now = Date.now();
  const window = iso(now - (now % ATTEMPT_WINDOW_MS));
  const row = await env.DB.prepare(`INSERT INTO auth_attempts (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END, window_start = excluded.window_start
    RETURNING count`).bind(await sha256(request.headers.get("cf-connecting-ip") ?? "unknown"), window).first<{ count: number }>();
  return (row?.count ?? 0) <= ATTEMPTS_PER_WINDOW;
}

/** `Authorization: Bearer <secret>` check that takes the same time however much of the secret matches. */
export async function hasBearer(request: Request, secret: string | undefined) {
  if (!secret) return false;
  // Comparing fixed-length digests byte by byte, without stopping early.
  const [given, expected] = await Promise.all([request.headers.get("Authorization") ?? "", `Bearer ${secret}`]
    .map(async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))));
  return given.reduce((diff, byte, index) => diff | (byte ^ expected[index]), 0) === 0;
}

export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** /api/auth/*: invite codes, passkeys, logout. Returns null for any other path. */
export async function handleLogin(request: Request, env: LoginEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;

  if (url.pathname === "/api/auth/logout") {
    // SameSite=Lax still sends the cookie on a link from another site; only this site's own pages may sign out.
    if (request.headers.get("Sec-Fetch-Site") === "cross-site") return Response.redirect(new URL("/", url).toString(), 303);
    const token = cookieValue(request);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }
  // Everything else is a JSON POST from this site's own pages.
  if (request.method !== "POST" || request.headers.get("Origin") !== url.origin) return json({ error: "not allowed" }, { status: 403 });
  if (!(await underAttemptLimit(request, env))) return json({ error: "잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rpID = url.hostname;

  switch (url.pathname) {
    case "/api/auth/code": {
      const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
      if (code.length < 8) return json({ error: "코드를 다시 확인해 주세요." }, { status: 400 });
      const row = await env.DB.prepare("UPDATE invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email")
        .bind(iso(Date.now()), await sha256(code), iso(Date.now())).first<{ email: string }>();
      if (!row || !isAllowed(env, row.email)) return json({ error: "코드가 맞지 않거나 이미 쓴 코드예요." }, { status: 400 });
      return json({ ok: true }, { cookie: await startSession(env, row.email, request) });
    }

    case "/api/auth/passkey/login/options": {
      const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
      return json({ options, challengeId: await saveChallenge(env, options.challenge, null) });
    }

    case "/api/auth/passkey/login/verify": {
      const challenge = await takeChallenge(env, body.challengeId);
      const response = body.response as AuthenticationResponseJSON | undefined;
      if (!challenge || challenge.email || typeof response?.id !== "string") return json({ error: "다시 시도해 주세요." }, { status: 400 });
      const passkey = await env.DB.prepare("SELECT id, email, public_key AS publicKey, counter, transports FROM passkeys WHERE id = ?")
        .bind(response.id).first<{ id: string; email: string; publicKey: string; counter: number; transports: string | null }>();
      if (!passkey || !isAllowed(env, passkey.email)) return json({ error: "등록되지 않은 Face ID예요. 코드로 로그인해 주세요." }, { status: 400 });
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: url.origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: passkey.id, publicKey: fromB64url(passkey.publicKey), counter: passkey.counter, transports: passkey.transports ? JSON.parse(passkey.transports) : undefined },
      }).catch(() => null);
      if (!result?.verified) return json({ error: "확인하지 못했어요. 다시 시도해 주세요." }, { status: 400 });
      await env.DB.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?").bind(result.authenticationInfo.newCounter, iso(Date.now()), passkey.id).run();
      return json({ ok: true }, { cookie: await startSession(env, passkey.email, request) });
    }

    case "/api/auth/passkey/register/options":
    case "/api/auth/passkey/register/verify": {
      const viewer = await signedIn(request, env);
      if (!viewer) return json({ error: "먼저 로그인해 주세요." }, { status: 401 });
      if (url.pathname.endsWith("/options")) {
        const { results } = await env.DB.prepare("SELECT id, transports FROM passkeys WHERE email = ?").bind(viewer.email).all<{ id: string; transports: string | null }>();
        const options = await generateRegistrationOptions({
          rpName: "Orbit",
          rpID,
          userName: viewer.email,
          userDisplayName: viewer.email.split("@")[0],
          userID: encoder.encode(await sha256(viewer.email)),
          attestationType: "none",
          excludeCredentials: results.map((row) => ({ id: row.id, transports: row.transports ? JSON.parse(row.transports) : undefined })),
          authenticatorSelection: { residentKey: "required", userVerification: "required" },
        });
        return json({ options, challengeId: await saveChallenge(env, options.challenge, viewer.email) });
      }
      const challenge = await takeChallenge(env, body.challengeId);
      if (!challenge || challenge.email !== viewer.email) return json({ error: "다시 시도해 주세요." }, { status: 400 });
      const result = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: url.origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      }).catch(() => null);
      if (!result?.verified) return json({ error: "등록하지 못했어요. 다시 시도해 주세요." }, { status: 400 });
      const { credential, aaguid } = result.registrationInfo;
      // Re-registering the same passkey updates it; a credential id saved under another email is refused.
      const saved = await env.DB.prepare(`INSERT INTO passkeys (id, email, public_key, counter, transports, aaguid) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET public_key = excluded.public_key, counter = excluded.counter, transports = excluded.transports, aaguid = excluded.aaguid
        WHERE passkeys.email = excluded.email`)
        .bind(credential.id, viewer.email, b64url(credential.publicKey), credential.counter, credential.transports ? JSON.stringify(credential.transports) : null, aaguid).run();
      if (!saved.meta.changes) return json({ error: "등록하지 못했어요. 다시 시도해 주세요." }, { status: 400 });
      return json({ ok: true });
    }
  }
  return json({ error: "not found" }, { status: 404 });
}

/** Cron: drop expired sessions, challenges and try counts, and invites a week past use or expiry. */
export async function cleanupLogins(env: LoginEnv) {
  const now = Date.now();
  const weekAgo = iso(now - 7 * 86400_000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(iso(now)),
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(iso(now)),
    env.DB.prepare("DELETE FROM invites WHERE used_at < ? OR expires_at < ?").bind(weekAgo, weekAgo),
    env.DB.prepare("DELETE FROM auth_attempts WHERE window_start < ?").bind(iso(now - ATTEMPT_WINDOW_MS)),
  ]);
}
