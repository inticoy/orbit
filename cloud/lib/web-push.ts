// Web Push with WebCrypto only (Workers has no Node `web-push`):
// payload encryption is RFC 8291 (aes128gcm), sender identity is VAPID (RFC 8292).

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateJwk: string; subject: string };

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = "";
  for (const byte of view) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function concat(...parts: Bytes[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

async function encrypt(target: PushTarget, payload: string) {
  const uaPublic = fromB64url(target.p256dh);
  const authSecret = fromB64url(target.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the payload followed by the last-record delimiter 0x02.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(encoder.encode(payload), new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

async function vapidAuthorization(endpoint: string, vapid: VapidKeys) {
  const jwtHeader = b64url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(encoder.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: vapid.subject,
  })));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(vapid.privateJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${jwtHeader}.${claims}`));
  return `vapid t=${jwtHeader}.${claims}.${b64url(signature)}, k=${vapid.publicKey}`;
}

/** Sends one push. Resolves to the push service's HTTP status (404/410: the subscription is gone). */
export async function sendPush(target: PushTarget, payload: string, vapid: VapidKeys) {
  const response = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 3600),
      Urgency: "high",
    },
    body: await encrypt(target, payload),
  });
  return response.status;
}
