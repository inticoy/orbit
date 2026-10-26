"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { motionTokens } from "@/lib/motion";
import { getLatestUnread } from "@/app/actions";

type Message = { title: string; body?: string; url?: string };

const POLL_MS = 15_000;

/**
 * A notification that arrives while the app is open: iOS shows nothing then, so
 * the app checks for the newest unread one while it's on screen and drops it in
 * from the top, drawn like an iOS notification. Where the system already showed
 * it (Android, desktop: public/sw.js says shownBySystem), no banner is drawn.
 * Also refreshes the page so the list's unread dots are current.
 */
export function InAppBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const here = useRef(pathname);
  here.current = pathname;
  const [message, setMessage] = useState<Message | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Newest notification already known; undefined until the first check sets the baseline.
  const lastId = useRef<number | undefined>(undefined);

  useEffect(() => {
    const show = (next: Message) => {
      setMessage(next);
      router.refresh();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), 5000);
    };

    let busy = false;
    const check = async (announce: boolean) => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const state = await getLatestUnread();
        const latest = state?.latest ?? null;
        const id = latest?.id ?? 0;
        // The home screen icon shows what is still unread (the push sets it too; opening a satellite lowers it).
        const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
        if (state) (state.unread ? nav.setAppBadge?.(state.unread) : nav.clearAppBadge?.())?.catch(() => {});
        // No banner for news from the conversation already on screen; it shows up there.
        if (announce && lastId.current !== undefined && latest && id > lastId.current && latest.url !== here.current) {
          show({ title: latest.title, body: latest.body ?? undefined, url: latest.url ?? undefined });
        }
        lastId.current = Math.max(lastId.current ?? 0, id);
      } catch {
        // Offline or signed out: try again on the next tick.
      } finally {
        busy = false;
      }
    };
    check(false);
    const interval = setInterval(() => check(true), POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(true); };
    document.addEventListener("visibilitychange", onVisible);

    // Registering on every open also picks up a new sw.js right away.
    const worker = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    worker?.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => registration.update()).catch(() => {});
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "push") return;
      if (event.data.message?.shownBySystem) router.refresh();
      else show(event.data.message);
      // Move the baseline past it so the next check doesn't show it twice.
      check(false);
    };
    worker?.addEventListener("message", onMessage);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      worker?.removeEventListener("message", onMessage);
    };
  }, [router]);

  const href = message?.url || "/notifications";
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[calc(env(safe-area-inset-top)+8px)] pr-[max(12px,env(safe-area-inset-right))] pl-[max(12px,env(safe-area-inset-left))]">
      <AnimatePresence>
        {message ? (
          <motion.a
            animate={{ y: 0, opacity: 1 }}
            className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[24px] bg-app-card/95 py-3 pr-4 pl-3 text-inherit no-underline shadow-float ring-1 ring-app-line active:scale-[.98]"
            drag="y"
            dragConstraints={{ top: -200, bottom: 0 }}
            dragElastic={{ top: 0.2, bottom: 0.05 }}
            exit={{ y: -120, opacity: 0 }}
            href={href}
            initial={{ y: -120, opacity: 0 }}
            onClick={() => setMessage(null)}
            onDragEnd={(_, info) => { if (info.offset.y < -30 || info.velocity.y < -300) setMessage(null); }}
            rel="noreferrer"
            target={href.startsWith("/") ? undefined : "_blank"}
            transition={motionTokens.settle}
          >
            {/* Like an iOS notification: the app icon, a bold title with "지금", then the body. */}
            <img alt="" className="size-[38px] shrink-0 self-start rounded-[9px]" height={38} src="/icon.png" width={38} />
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-px">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{message.title}</span>
                <span className="shrink-0 text-[13px] text-app-muted">지금</span>
              </span>
              {message.body ? <span className="line-clamp-2 text-[15px] leading-snug whitespace-pre-line">{message.body}</span> : null}
            </span>
          </motion.a>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
