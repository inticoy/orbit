import Link from "next/link";
import { Avatar } from "@/components/avatar";
import type { Activity } from "@/lib/conversations";
import { satelliteById } from "@/lib/satellites";
import { shortTime } from "@/lib/time";

const statusText: Record<Activity["status"], string> = { queued: "맥 엔진을 기다리는 중", running: "일하는 중", done: "끝남", failed: "멈춤" };

/** Muse-style activity rows: what each satellite was asked and where it stands. */
export function ActivityList({ items, empty }: { items: Activity[]; empty: string }) {
  if (!items.length) return <p className="m-0 px-1 text-[14px] text-app-muted">{empty}</p>;
  return (
    <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-0.5 p-0">
      {items.map((item) => {
        const satellite = satelliteById(item.satellite);
        const live = item.status === "queued" || item.status === "running";
        return (
          <li key={item.id}>
            <Link className={`flex items-center gap-3 rounded-row px-2 py-2.5 text-inherit no-underline active:bg-app-fill ${live ? "bg-app-fill" : ""}`} href={`/s/${item.satellite}`}>
              {satellite ? <Avatar satellite={satellite} size={34} status={live ? "working" : "idle"} /> : null}
              <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
                <span className="truncate text-[14px] font-semibold">{item.prompt.replace(/\s+/g, " ")}</span>
                <span className={`truncate text-[12px] ${item.status === "failed" ? "text-app-warn" : "text-app-muted"}`}>
                  {satellite?.name} · {live && item.progress ? item.progress : statusText[item.status]}
                </span>
              </span>
              <span className="shrink-0 text-[12px] text-app-muted">{shortTime(item.finishedAt ?? item.createdAt)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "맥 연결됨" / "맥 꺼짐" chip from the engine's last check-in. */
export function EngineChip({ online, lastSeen }: { online: boolean; lastSeen: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-app-fill px-2.5 py-1 text-[12px] font-semibold">
      <span className={`size-2 rounded-full ${online ? "bg-[#34c759]" : "bg-app-faint"}`} />
      {online ? "맥 연결됨" : lastSeen ? `맥 꺼짐 · ${shortTime(lastSeen)}` : "맥 엔진 연결 전"}
    </span>
  );
}
