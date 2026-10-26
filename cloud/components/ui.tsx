import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { iconTile, toneTile, type Tone } from "@/lib/design";

export function SectionHeader({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-4 flex items-baseline justify-between px-2 pb-1">
      <h2 id={id} className="m-0 text-[13px] font-semibold text-app-muted">{children}</h2>
      {aside ? <span className="text-[13px] text-app-muted">{aside}</span> : null}
    </div>
  );
}

export function IconTile({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${iconTile} ${toneTile[tone]}`}>{children}</span>;
}

/** Calendar-style date block used in schedule rows. */
export function DateTile({ date, muted }: { date: string; muted?: boolean }) {
  const [, month, day] = date.split("-").map(Number);
  return (
    <span className={`grid w-10 shrink-0 justify-items-center leading-none ${muted ? "text-app-faint" : ""}`}>
      <span className={`text-[11px] font-semibold ${muted ? "" : "text-violet-500"}`}>{month}월</span>
      <span className="mt-1 text-[20px] font-bold tabular-nums tracking-[-0.03em]">{day}</span>
    </span>
  );
}

export function RowText({ title, detail, muted }: { title: ReactNode; detail?: ReactNode; muted?: boolean }) {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
      <span className={`truncate text-[15px] font-semibold ${muted ? "text-app-muted" : ""}`}>{title}</span>
      {detail ? <span className="truncate text-[13px] text-app-muted">{detail}</span> : null}
    </span>
  );
}

export function Chevron() {
  return <ChevronRight aria-hidden="true" className="shrink-0 text-app-faint" size={18} />;
}

export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(value)} className="h-2 overflow-hidden rounded-full bg-app-ink/[.06]" role="progressbar">
      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-rose-300" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}
