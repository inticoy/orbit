import type { ReactNode } from "react";
import Link from "next/link";
import { Archive, Search, Settings } from "lucide-react";
import { OrbitMark } from "@/components/avatar";
import { PageEnter } from "@/components/page-enter";
import { SatelliteList, type ListState } from "@/components/satellite-list";

/**
 * Desktop: Grok Bot's three columns — satellite list, the main column, and a
 * side panel (the satellite's dashboard). Phone: only the main column; the
 * list is its own screen (the home page) and the panel folds under the header.
 */
export function Shell({ list, active, panel, children }: { list: ListState; active: string; panel?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-app-bg md:grid md:h-dvh md:grid-cols-[272px_minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)_340px]">
      <aside className="hidden flex-col gap-2 overflow-y-auto bg-app-side px-2.5 pt-4 pb-3 md:flex">
        <div className="flex items-center gap-2 px-2 pb-2">
          <OrbitMark size={26} tight />
          <span className="flex-1 text-[19px] font-bold tracking-[-0.02em]">Orbit</span>
          <Link aria-label="검색" className="grid size-9 shrink-0 place-items-center rounded-full text-app-ink no-underline active:bg-app-fill" href="/search"><Search aria-hidden="true" size={18} /></Link>
          <Link aria-label="보관함" className="grid size-9 shrink-0 place-items-center rounded-full text-app-ink no-underline active:bg-app-fill" href="/library"><Archive aria-hidden="true" size={18} /></Link>
          <Link aria-label="설정" className="grid size-9 place-items-center rounded-full text-app-ink no-underline transition active:bg-app-fill" href="/settings"><Settings aria-hidden="true" size={18} /></Link>
        </div>
        <SatelliteList active={active} state={list} />
      </aside>
      <main className="flex min-h-dvh min-w-0 flex-col md:min-h-0 md:overflow-y-auto"><PageEnter className="flex min-h-0 flex-1 flex-col">{children}</PageEnter></main>
      {panel ? <aside className="hidden overflow-y-auto border-l border-app-line px-4 pt-4 pb-6 lg:block">{panel}</aside> : null}
    </div>
  );
}
