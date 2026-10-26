"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { removeVaultLogin, sendVaultLogin } from "@/app/actions";
import { IconTile, RowText } from "@/components/ui";
import { row } from "@/lib/design";
import type { VaultSite } from "@/lib/vault";

const field = "h-11 w-full min-w-0 rounded-[14px] bg-app-bg px-3.5 text-[16px] ring-1 ring-app-line outline-none focus:ring-2 focus:ring-app-accent";
const pill = "shrink-0 rounded-full bg-app-fill px-3.5 py-1.5 text-[14px] font-semibold text-app-ink transition-transform active:scale-95 disabled:opacity-50";

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
/** "https://www.netflix.com/login" → "netflix.com" */
const siteOf = (input: string) => input.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

/** Seals the login on this phone: ECDH (P-256) between a one-time key and the engine's key, HKDF-SHA256 to AES-256-GCM. */
async function seal(publicKey: string, login: { site: string; username: string; password: string }) {
  const engine = await crypto.subtle.importKey("spki", Uint8Array.from(atob(publicKey), (char) => char.charCodeAt(0)), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: engine }, mine.privateKey, 256);
  const hkdf = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new TextEncoder().encode("orbit-vault") }, hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(JSON.stringify({ op: "set", ...login })));
  return { e: b64(await crypto.subtle.exportKey("spki", mine.publicKey)), iv: b64(iv), c: b64(c) };
}

/** Settings: site logins the satellites may use. Saved to the Mac's Keychain; this page only ever lists site and username. */
export function VaultLogins({ publicKey, sites, waiting }: { publicKey: string | null; sites: VaultSite[]; waiting: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<{ site: string; username: string; removing?: boolean }[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  // The Mac picks up a sealed login within ~15 seconds; look again a couple of times.
  const refreshSoon = () => [8_000, 20_000, 45_000].forEach((ms) => setTimeout(() => router.refresh(), ms));

  function save() {
    const clean = siteOf(site);
    if (!publicKey || !clean || !username.trim() || !password) return setNote("사이트, 아이디, 비밀번호를 다 적어 주세요.");
    start(async () => {
      try {
        const result = await sendVaultLogin(await seal(publicKey, { site: clean, username: username.trim(), password }));
        if ("error" in result) return setNote(result.error);
        setSent((list) => [...list.filter((one) => one.site !== clean), { site: clean, username: username.trim() }]);
        setSite(""); setUsername(""); setPassword(""); setOpen(false); setNote("");
        refreshSoon();
      } catch {
        setNote("암호화하지 못했어요. 다시 시도해 주세요.");
      }
    });
  }

  function remove(target: string) {
    start(async () => {
      const result = await removeVaultLogin(target);
      if ("error" in result) return setNote(result.error);
      setSent((list) => [...list.filter((one) => one.site !== target), { site: target, username: "", removing: true }]);
      refreshSoon();
    });
  }

  const saved = sites.filter((one) => !sent.some((item) => item.site === one.site && (item.removing || item.username !== one.username)));
  const inFlight = sent.filter((item) => !item.removing && !sites.some((one) => one.site === item.site && one.username === item.username));
  if (!publicKey) {
    return (
      <div className={row}>
        <IconTile><KeyRound aria-hidden="true" size={19} /></IconTile>
        <RowText title="로그인 정보" detail="맥 엔진을 새 버전으로 켜면 쓸 수 있어요" muted />
      </div>
    );
  }
  return (
    <div className="grid gap-0.5">
      {saved.map((one) => (
        <div className={row} key={one.site}>
          <IconTile><KeyRound aria-hidden="true" size={19} /></IconTile>
          <RowText title={one.site} detail={one.username} />
          <button className={pill} disabled={pending} onClick={() => remove(one.site)} type="button">지우기</button>
        </div>
      ))}
      {inFlight.map((one) => (
        <div className={row} key={one.site}>
          <IconTile><KeyRound aria-hidden="true" size={19} /></IconTile>
          <RowText title={one.site} detail="맥 키체인에 넣는 중…" muted />
        </div>
      ))}
      {open ? (
        <form className="grid gap-2 px-2 pt-1 pb-2" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <input aria-label="사이트" autoCapitalize="none" autoComplete="off" autoCorrect="off" className={field} inputMode="url" onChange={(event) => setSite(event.target.value)} placeholder="사이트 (예: netflix.com)" spellCheck={false} value={site} />
          <input aria-label="아이디" autoCapitalize="none" autoComplete="username" autoCorrect="off" className={field} onChange={(event) => setUsername(event.target.value)} placeholder="아이디 또는 이메일" spellCheck={false} value={username} />
          <input aria-label="비밀번호" autoComplete="current-password" className={field} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" type="password" value={password} />
          <div className="flex justify-end gap-2 pt-1">
            <button className={pill} disabled={pending} onClick={() => { setOpen(false); setNote(""); }} type="button">취소</button>
            <button className={`${pill} bg-app-ink text-app-bg`} disabled={pending} type="submit">맥에 저장</button>
          </div>
        </form>
      ) : (
        <button className={`${row} w-full text-left transition-colors active:bg-app-fill`} onClick={() => setOpen(true)} type="button">
          <IconTile><Plus aria-hidden="true" size={19} /></IconTile>
          <RowText title="로그인 추가" detail={waiting ? "맥이 아직 받지 않은 게 있어요" : "위성이 웹 일을 할 때 써요"} />
        </button>
      )}
      {note ? <p className="m-0 px-2 text-[13px] text-app-danger">{note}</p> : null}
    </div>
  );
}
