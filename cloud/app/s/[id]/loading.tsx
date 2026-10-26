/** Shown at once while a conversation loads: its header and a few bubbles. */
export default function Loading() {
  return (
    <main aria-busy="true" className="flex min-h-dvh flex-col bg-app-bg pt-[calc(env(safe-area-inset-top)+10px)]">
      <div className="flex items-center justify-center gap-2.5 px-4 pb-3">
        <span className="size-[30px] animate-pulse rounded-[10px] bg-app-fill" />
        <span className="h-4 w-24 animate-pulse rounded-full bg-app-fill" />
      </div>
      <div className="mx-auto grid w-full max-w-[760px] gap-3 px-3 pt-4">
        <span className="h-10 w-2/3 animate-pulse justify-self-end rounded-[18px] bg-app-fill" />
        <span className="h-24 w-4/5 animate-pulse rounded-[18px] bg-app-fill" />
        <span className="h-10 w-1/2 animate-pulse justify-self-end rounded-[18px] bg-app-fill" />
      </div>
    </main>
  );
}
