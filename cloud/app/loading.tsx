/** Shown at once while a page loads: the background and a few placeholder rows. */
export default function Loading() {
  return (
    <main aria-busy="true" className="min-h-dvh bg-app-bg pt-[calc(env(safe-area-inset-top)+24px)] pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))]">
      <div className="mx-auto grid max-w-[520px] gap-3">
        <span className="h-8 w-32 animate-pulse rounded-full bg-app-fill" />
        <span className="h-14 animate-pulse rounded-[14px] bg-app-fill" />
        <span className="h-14 animate-pulse rounded-[14px] bg-app-fill" />
        <span className="h-14 animate-pulse rounded-[14px] bg-app-fill" />
      </div>
    </main>
  );
}
