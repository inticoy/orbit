import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Shell } from "@/components/shell";
import type { ListState } from "@/components/satellite-list";
import { glassButton } from "@/lib/design";

export function LibraryScreen({ title, active, list, children }: { title: string; active: string; list: ListState; children: ReactNode }) {
  return (
    <Shell active={active} list={list}>
      <div className="min-w-0 pt-[calc(env(safe-area-inset-top)+12px)] pr-[max(12px,env(safe-area-inset-right))] pb-[calc(40px+env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))]">
        <div className="mx-auto grid max-w-[720px] grid-cols-[minmax(0,1fr)] gap-3">
          <header className="flex min-w-0 items-center gap-2 px-2 pb-1">
            <Link aria-label="뒤로" className={`${glassButton} md:hidden`} href="/"><ChevronLeft aria-hidden="true" size={22} /></Link>
            <h1 className="m-0 min-w-0 flex-1 truncate text-[32px] font-bold tracking-[-0.03em]">{title}</h1>
          </header>
          {children}
        </div>
      </div>
    </Shell>
  );
}
