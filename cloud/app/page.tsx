import Link from "next/link";
import { Archive, Search, Settings } from "lucide-react";
import { ActivityList, EngineChip } from "@/components/activity";
import { TodayView } from "@/components/today";
import { OrbitMark } from "@/components/avatar";
import { NotAllowed } from "@/components/not-allowed";
import { SatelliteList } from "@/components/satellite-list";
import { Shell } from "@/components/shell";
import { getViewer } from "@/lib/auth";
import { loadToday } from "@/lib/today";
import { glassButton } from "@/lib/design";
import { getEnv } from "@/lib/env";
import { loadListState } from "@/lib/list-state";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) return <NotAllowed />;
  const env = await getEnv();
  const [list, today] = await Promise.all([loadListState(env, viewer.email), loadToday(env)]);
  const { engine, activity } = today;

  return (
    <>
      {/* Phone: the roster is the home screen. */}
      <div className="min-h-dvh bg-app-bg pt-[calc(env(safe-area-inset-top)+12px)] pr-[max(12px,env(safe-area-inset-right))] pb-[calc(32px+env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] md:hidden">
        <header className="flex items-center gap-2 px-2 pb-3">
          <OrbitMark size={30} tight />
          <h1 className="m-0 flex-1 text-[32px] font-bold tracking-[-0.03em]">Orbit</h1>
          <Link aria-label="검색" className={glassButton} href="/search"><Search aria-hidden="true" size={19} /></Link>
          <Link aria-label="보관함" className={glassButton} href="/library"><Archive aria-hidden="true" size={19} /></Link>
          <Link aria-label="설정" className={glassButton} href="/settings"><Settings aria-hidden="true" size={19} /></Link>
        </header>
        <div className="px-2 pb-3"><EngineChip lastSeen={engine.lastSeen} online={engine.online} /></div>
        <SatelliteList large state={list} todayHref="/today" />
      </div>

      <div className="hidden md:block">
        <Shell active="today" list={list} panel={
          <div className="grid gap-3">
            <h2 className="m-0 px-1 text-[20px] font-bold tracking-[-0.02em]">활동</h2>
            <ActivityList empty="아직 맡긴 일이 없어요." items={activity} />
          </div>
        }>
          <TodayView {...today} />
        </Shell>
      </div>
    </>
  );
}
