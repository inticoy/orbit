"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { ScanFace } from "lucide-react";
import { IconTile, RowText } from "@/components/ui";
import { row } from "@/lib/design";
import { postJson } from "@/lib/post-json";

/** Registers this phone's Face ID (a passkey) so signing back in never needs a code. */
export function PasskeySetup({ count }: { count: number }) {
  const [registered, setRegistered] = useState(count);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function register() {
    setPending(true);
    setNote("");
    try {
      const { options, challengeId } = await postJson<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>("/api/auth/passkey/register/options", {});
      const response = await startRegistration({ optionsJSON: options });
      await postJson("/api/auth/passkey/register/verify", { challengeId, response });
      setRegistered((value) => value + 1);
      setNote("등록했어요. 다음부터 Face ID로 들어와요.");
    } catch (problem) {
      const name = problem instanceof Error ? problem.name : "";
      if (name === "InvalidStateError") setNote("이 기기는 이미 등록되어 있어요.");
      else if (name !== "NotAllowedError") setNote(problem instanceof Error ? problem.message : "다시 시도해 주세요.");
    }
    setPending(false);
  }

  return (
    <div className={row}>
      <IconTile><ScanFace aria-hidden="true" size={19} /></IconTile>
      <RowText title="Face ID" detail={note || (registered ? `등록됨 · ${registered}개 기기` : "로그인이 풀려도 Face ID로 바로 들어와요")} />
      <button className="shrink-0 rounded-full bg-app-fill px-3.5 py-1.5 text-[14px] font-semibold text-app-ink transition-transform active:scale-95 disabled:opacity-50" disabled={pending} onClick={register} type="button">{registered ? "추가" : "등록"}</button>
    </div>
  );
}
