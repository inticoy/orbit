"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPinned } from "@/app/library/actions";

export function UnpinButton({ messageId }: { messageId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();
  return (
    <div className="grid shrink-0 justify-items-end">
      <button aria-label={`메시지 ${messageId} 고정 해제`} className="min-h-11 rounded-row px-2 text-[12px] text-app-muted active:bg-app-fill disabled:opacity-50" disabled={pending} onClick={() => {
        setError(false);
        startTransition(async () => {
          try {
            await setPinned(messageId, false);
            router.refresh();
          } catch {
            setError(true);
          }
        });
      }} type="button">{pending ? "해제 중…" : "고정 해제"}</button>
      {error ? <span className="px-2 text-[12px] text-app-muted" role="alert">다시 시도해 주세요.</span> : null}
    </div>
  );
}
