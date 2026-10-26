import Link from "next/link";
import { Avatar, OrbitMark } from "@/components/avatar";
import { sortSatellites, type ListOrder } from "@/lib/list-order";
import { satellites } from "@/lib/satellites";
import { shortTime } from "@/lib/time";
import { plain } from "@/lib/message-preview";

export type ListState = {
  last: Map<string, { role: string; body: string; createdAt: string }>;
  busy: Set<string>;
  unread: Map<string, number>;
  asking: Set<string>;
  order: ListOrder;
};

/** Grok Bot-style roster: pinned 오늘, then one row per satellite (avatar, status, last line). */
export function SatelliteList({ state, active, large, todayHref = "/" }: { state: ListState; active?: string; large?: boolean; todayHref?: string }) {
  const size = large ? 52 : 40;
  return (
    <nav aria-label="위성" className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      <Link
        aria-current={active === "today" ? "page" : undefined}
        className={`flex items-center gap-3 rounded-row px-2 py-2 text-inherit no-underline transition-colors active:bg-app-fill ${active === "today" ? "bg-app-fill" : ""}`}
        href={todayHref}
      >
        <OrbitMark size={size} tight />
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
          <span className={`font-semibold ${large ? "text-[16px]" : "text-[15px]"}`}>오늘</span>
          <span className="truncate text-[13px] text-app-muted">대시보드 · 모든 위성</span>
        </span>
      </Link>
      <div className="mx-2 my-1.5 h-px bg-app-line" />
      {sortSatellites(satellites, state.order, state.last, state.asking).map((satellite) => {
        const last = state.last.get(satellite.id);
        const busy = state.busy.has(satellite.id);
        const unread = state.unread.get(satellite.id) ?? 0;
        const asking = state.asking.has(satellite.id);
        const preview = asking ? "확인이 필요해요" : busy ? "일하는 중…" : last ? plain(last.body) : satellite.intro;
        return (
          <Link
            aria-current={active === satellite.id ? "page" : undefined}
            className={`flex items-center gap-3 rounded-row px-2 py-2 text-inherit no-underline transition-colors active:bg-app-fill ${active === satellite.id ? "bg-app-fill" : ""} ${satellite.ready ? "" : "opacity-60"}`}
            href={`/s/${satellite.id}`}
            key={satellite.id}
          >
            <Avatar satellite={satellite} size={size} status={asking ? "ask" : busy ? "working" : "idle"} />
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
              <span className="flex items-baseline gap-2">
                <span className={`min-w-0 flex-1 truncate font-semibold ${large ? "text-[16px]" : "text-[15px]"}`}>{satellite.name}</span>
                {last ? <span className="shrink-0 text-[12px] text-app-muted">{shortTime(last.createdAt)}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className={`min-w-0 flex-1 truncate text-[13px] ${asking ? "font-semibold text-app-warn" : "text-app-muted"}`}>{preview}</span>
                {unread ? <span aria-label={`안 읽음 ${unread}`} className="size-2 shrink-0 rounded-full bg-app-accent" /> : null}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
