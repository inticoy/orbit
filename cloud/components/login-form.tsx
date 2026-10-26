"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Bell, ScanFace } from "lucide-react";
import { card } from "@/lib/design";
import { postJson } from "@/lib/post-json";
import { getThisDeviceSubscription, subscribeThisDevice } from "@/lib/push-client";

/** Sign in with Face ID (a passkey) or, the first time on a phone, a one-time code — then offer Face ID and push notifications. */
export function LoginForm({ code: initialCode, next, publicKey }: { code: string; next: string; publicKey: string }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [offer, setOffer] = useState<"faceId" | "push" | null>(null);

  async function run(work: () => Promise<void>, after: () => void | Promise<void> = () => window.location.replace(next)) {
    setPending(true);
    setError("");
    try {
      await work();
      await after();
    } catch (problem) {
      // Closing the Face ID sheet is not an error worth showing.
      if (!(problem instanceof Error && problem.name === "NotAllowedError")) setError(problem instanceof Error ? problem.message : "다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  const faceId = () => run(async () => {
    const { options, challengeId } = await postJson<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>("/api/auth/passkey/login/options", {});
    const response = await startAuthentication({ optionsJSON: options });
    await postJson("/api/auth/passkey/login/verify", { challengeId, response });
  });

  const withCode = (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    postJson("/api/auth/code", { code })
      .then(() => setOffer("faceId"))
      .catch((problem) => setError(problem instanceof Error ? problem.message : "다시 시도해 주세요."))
      .finally(() => setPending(false));
  };

  async function offerNotifications() {
    if (publicKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Notification.permission !== "denied") {
      try {
        if (!await getThisDeviceSubscription()) {
          setOffer("push");
          return;
        }
      } catch {}
    }
    window.location.replace(next);
  }

  const registerFaceId = () => run(async () => {
    const { options, challengeId } = await postJson<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>("/api/auth/passkey/register/options", {});
    const response = await startRegistration({ optionsJSON: options });
    await postJson("/api/auth/passkey/register/verify", { challengeId, response });
  }, offerNotifications);

  if (offer) {
    const push = offer === "push";
    return (
      <main className="app-sky grid min-h-dvh place-items-center pr-[max(24px,env(safe-area-inset-right))] pl-[max(24px,env(safe-area-inset-left))] pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className={`grid w-full max-w-[340px] justify-items-center gap-4 p-7 text-center ${card}`}>
          <span className="grid size-14 place-items-center rounded-full bg-violet-100/80 text-violet-600">{push ? <Bell aria-hidden="true" size={28} /> : <ScanFace aria-hidden="true" size={28} />}</span>
          <div className="grid gap-1">
            <h1 className="m-0 whitespace-nowrap text-[20px] font-bold tracking-[-0.02em]">{push ? "알림을 켤까요?" : "Face ID를 등록할까요?"}</h1>
            <p className="m-0 text-[14px] leading-relaxed text-app-muted">{push ? "한마디·스티커·핫딜 소식을 이 폰으로 받아요." : "로그인이 풀려도 코드 없이 Face ID 한 번으로 다시 들어올 수 있어요."}</p>
          </div>
          <button className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-app-ink text-[15px] font-semibold text-app-bg transition active:scale-[.98] disabled:opacity-50" disabled={pending} onClick={push ? () => run(() => subscribeThisDevice(publicKey)) : registerFaceId} type="button">{push ? "알림 켜기" : "Face ID 등록"}</button>
          <button className="whitespace-nowrap text-[14px] font-semibold text-app-muted transition active:opacity-60 disabled:opacity-50" disabled={pending} onClick={push ? () => window.location.replace(next) : () => run(async () => {}, offerNotifications)} type="button">나중에</button>
          {error ? <p className="m-0 text-[13px] text-rose-500" role="alert">{error}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="app-sky grid min-h-dvh place-items-center pr-[max(24px,env(safe-area-inset-right))] pl-[max(24px,env(safe-area-inset-left))] pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <div className={`grid w-full max-w-[340px] gap-5 p-7 ${card}`}>
        <div className="grid gap-1 text-center">
          <h1 className="m-0 text-[24px] font-bold tracking-[-0.03em]">Orbit</h1>
          <p className="m-0 text-[14px] text-app-muted">내 위성들이 일하는 곳</p>
        </div>

        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-app-ink text-[15px] font-semibold text-app-bg transition active:scale-[.98] disabled:opacity-50" disabled={pending} onClick={faceId} type="button">
          <ScanFace aria-hidden="true" size={20} />Face ID로 로그인
        </button>

        <form className="grid gap-2" onSubmit={withCode}>
          <label className="text-[13px] font-semibold text-app-muted" htmlFor="code">처음이라면 받은 코드로</label>
          <div className="flex gap-2">
            <input autoCapitalize="characters" autoComplete="one-time-code" name="code" spellCheck={false} className="h-11 min-w-0 flex-1 rounded-[14px] bg-app-bg px-3.5 text-[16px] tracking-[.08em] ring-1 ring-app-line outline-none focus:ring-2 focus:ring-app-accent" id="code" onChange={(event) => setCode(event.target.value)} placeholder="ABCD-EFGH-JKLM…" value={code} />
            <button className="h-11 shrink-0 rounded-[14px] bg-app-ink/[.06] px-4 text-[14px] font-semibold transition active:scale-95 disabled:opacity-50" disabled={pending || !code.trim()} type="submit">들어가기</button>
          </div>
        </form>

        {error ? <p className="m-0 text-center text-[13px] text-rose-500" role="alert">{error}</p> : null}
      </div>
    </main>
  );
}
