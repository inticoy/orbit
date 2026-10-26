"use client";

/** Any page that fails to load: say so plainly and offer a retry. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-app-side px-6">
      <div className="grid max-w-[320px] justify-items-center gap-3 text-center">
        <h1 className="m-0 text-[20px] font-bold tracking-[-0.02em]">화면을 불러오지 못했어요</h1>
        <p className="m-0 text-[15px] leading-relaxed text-app-muted">연결이 잠깐 끊겼을 수 있어요. 다시 시도해 주세요.</p>
        <button className="mt-1 h-11 rounded-full bg-app-ink px-6 text-[15px] font-semibold text-app-bg active:scale-[.98]" onClick={reset} type="button">다시 시도</button>
      </div>
    </main>
  );
}
