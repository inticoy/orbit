import Link from "next/link";
import { ActivityList, EngineChip } from "@/components/activity";
import { Avatar } from "@/components/avatar";
import { TodayWidgets } from "@/components/dashboards";
import { RichText } from "@/components/rich-text";
import type { Activity } from "@/lib/conversations";
import { plain } from "@/lib/message-preview";
import type { Idea } from "@/lib/today";
import { satelliteById } from "@/lib/satellites";
import { SITE, TIMEZONE } from "@/lib/site";
import { shortTime } from "@/lib/time";

type Snap = { data: unknown; observedAt: string | null; updatedAt: string } | null;

function todayLabel() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, month: "numeric", day: "numeric", weekday: "short" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekday = { Sun: "일", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토" }[parts.weekday as string] ?? "";
  return `${parts.month}월 ${parts.day}일 ${weekday}요일`;
}

/** The pinned 오늘 page: The configured latest briefing, every satellite's dashboard widget, and activity. */
export function TodayView({ engine, activity, snapshots, briefing, ideas, back }: {
  engine: { online: boolean; lastSeen: string | null }; activity: Activity[]; snapshots: Record<string, Snap>;
  briefing: { body: string; createdAt: string } | null; ideas: Idea[]; back?: React.ReactNode;
}) {
  const briefer = SITE.briefing ? satelliteById(SITE.briefing) : undefined;
  return (
    <div className="mx-auto grid w-full max-w-[860px] gap-5 px-[max(16px,env(safe-area-inset-left))] pt-6 pb-10 md:px-8">
      {back}
      <header className="grid gap-1">
        <span className="text-[13px] text-app-muted" suppressHydrationWarning>{todayLabel()}</span>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-[30px] font-bold tracking-[-0.03em]">오늘</h1>
          <EngineChip lastSeen={engine.lastSeen} online={engine.online} />
        </div>
      </header>

      {briefer && <section className="grid min-w-0 gap-3 rounded-[20px] bg-app-side p-4">
        <Link className="flex min-w-0 items-center gap-2 text-inherit no-underline active:opacity-70" href={`/s/${briefer.id}`}>
          <Avatar satellite={briefer} size={26} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{briefer.name} · 브리핑</span>
          {briefing ? <span className="shrink-0 text-[12px] text-app-muted">{shortTime(briefing.createdAt)}</span> : null}
        </Link>
        {briefing ? <RichText text={briefing.body} /> : <p className="m-0 text-[15px] leading-relaxed text-app-muted">매일 아침 {briefer.name}가 오늘 꼭 알아야 할 것을 정리해요. 지금 받아 보려면 {briefer.name}의 루틴 탭에서 "지금 실행"을 눌러 주세요.</p>}
      </section>}

      {ideas.length ? (
        <section className="grid gap-1">
          <h2 className="m-0 px-1 pb-1 text-[15px] font-bold">먼저 알려 드려요</h2>
          {ideas.map((idea) => {
            const satellite = satelliteById(idea.satellite);
            return (
              <Link className="flex items-start gap-3 rounded-row px-2 py-2 text-inherit no-underline transition-colors active:bg-app-fill" href={`/s/${idea.satellite}#m-${idea.id}`} key={idea.id}>
                {satellite ? <Avatar satellite={satellite} size={32} /> : null}
                <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                  <span className="flex items-baseline gap-2"><span className="flex-1 text-[14px] font-semibold">{satellite?.name}</span><span className="text-[12px] text-app-muted">{shortTime(idea.createdAt)}</span></span>
                  <span className="line-clamp-2 text-[14px] leading-snug text-app-muted">{plain(idea.body.replace(/^\*\*[^*]+\*\*\s*/, ""))}</span>
                </span>
              </Link>
            );
          })}
        </section>
      ) : null}

      <TodayWidgets snapshots={snapshots} />

      <section className="grid gap-2 lg:hidden">
        <h2 className="m-0 px-1 text-[15px] font-bold">활동</h2>
        <ActivityList empty="아직 맡긴 일이 없어요." items={activity} />
      </section>
    </div>
  );
}
