import { LockKeyhole } from "lucide-react";
import { card } from "@/lib/design";

/** Shown when the signed-in account is not the owner. */
export function NotAllowed() {
  return (
    <main className="app-sky grid min-h-dvh place-items-center px-6">
      <div className={`grid max-w-[340px] justify-items-center gap-3 p-8 text-center ${card}`}>
        <span className="grid size-12 place-items-center rounded-full bg-app-ink/[.05] text-app-muted"><LockKeyhole aria-hidden="true" size={22} /></span>
        <h1 className="m-0 text-[20px] font-bold tracking-[-0.02em]">들어올 수 없는 계정이에요</h1>
        <p className="m-0 text-[15px] leading-relaxed text-app-muted">Orbit은 한 사람만 쓰는 공간이에요. 로그인이 풀렸다면 다시 로그인해 주세요.</p>
        <a className="mt-1 text-[15px] font-semibold text-app-accent" href="/api/auth/logout">다시 로그인</a>
      </div>
    </main>
  );
}
