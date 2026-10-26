"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { runRoutineNow, saveMemoryDoc, setRoutineEnabled } from "@/app/actions";
import { RichText } from "@/components/rich-text";
import { Switch } from "@/components/switch";
import type { Routine } from "@/lib/routines";
import { shortTime } from "@/lib/time";

type Tab = "dashboard" | "activity" | "routines" | "memory";
type Doc = { body: string; updatedAt: string } | undefined;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function schedule(routine: Routine) {
  const days = routine.weekdays ? routine.weekdays.split(",").map((day) => WEEKDAY[Number(day)]).join("·") : "매일";
  return `${days} ${routine.times.split(",").join(", ")}`;
}

/**
 * Muse-style profile tabs under the avatar: the satellite's dashboard, what it
 * did, its routines (on/off, run now) and its memory and goals (editable).
 */
export function SatellitePanel({ satelliteId, dashboard, activity, routines, memory, goals, hasDashboard }: {
  satelliteId: string; dashboard: ReactNode; activity: ReactNode; routines: Routine[]; memory: Doc; goals: Doc; hasDashboard: boolean;
}) {
  const tabs: [Tab, string][] = [...(hasDashboard ? [["dashboard", "대시보드"] as [Tab, string]] : []), ["activity", "활동"], ["routines", "루틴"], ["memory", "기억"]];
  const [tab, setTab] = useState<Tab>(tabs[0][0]);
  return (
    <div className="grid gap-4">
      <div className="flex rounded-full bg-app-fill p-[3px]" role="tablist">
        {tabs.map(([key, label]) => (
          <button aria-selected={tab === key} className={`relative h-9 flex-1 rounded-full text-[13px] font-semibold transition-colors ${tab === key ? "text-app-ink" : "text-app-muted"}`} key={key} onClick={() => setTab(key)} role="tab" type="button">
            {tab === key ? <motion.span className="absolute inset-0 rounded-full bg-app-card shadow-[0_1px_3px_rgba(0,0,0,.12)]" layoutId={`tab-${satelliteId}`} transition={{ type: "spring", bounce: 0, duration: 0.3 }} /> : null}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence initial={false} mode="wait">
        <motion.div animate={{ x: 0 }} exit={{ x: -8 }} initial={{ x: 8 }} key={tab} transition={{ type: "spring", bounce: 0, duration: 0.25 }}>
          {tab === "dashboard" ? dashboard : tab === "activity" ? activity : tab === "routines" ? <Routines routines={routines} /> : <Memory goals={goals} memory={memory} satelliteId={satelliteId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Routines({ routines }: { routines: Routine[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  if (!routines.length) return <p className="m-0 px-1 text-[14px] text-app-muted">정해진 루틴이 없어요. 대화로 "매일 아침 알려 줘"처럼 부탁하면 다음 단계에서 루틴이 돼요.</p>;
  return (
    <div className="grid gap-2">
      {routines.map((routine) => (
        <div className="grid gap-2 rounded-[16px] bg-app-side p-3.5" key={routine.id}>
          <div className="flex items-center gap-3">
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
              <span className="truncate text-[15px] font-semibold">{routine.title}</span>
              <span className="text-[12px] text-app-muted">{schedule(routine)}{routine.nextRunAt && routine.enabled ? ` · 다음 ${shortTime(routine.nextRunAt)}` : ""}</span>
            </span>
            <Switch checked={!!routine.enabled} disabled={busy} label={`${routine.title} 켜기`} onChange={(next) => start(async () => { await setRoutineEnabled(routine.id, next); router.refresh(); })} />
          </div>
          <p className="m-0 line-clamp-3 text-[13px] leading-relaxed text-app-muted">{routine.prompt}</p>
          <div className="flex items-center gap-2">
            <button className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-app-card px-3 text-[13px] font-semibold ring-1 ring-app-line active:scale-95 disabled:opacity-50" disabled={busy} onClick={() => start(async () => {
              const result = await runRoutineNow(routine.id);
              setNote("error" in result ? result.error : `${routine.title}을(를) 맡겼어요`);
              router.refresh();
            })} type="button"><Play aria-hidden="true" size={13} />지금 실행</button>
            {routine.lastRunAt ? <span className="text-[12px] text-app-muted">마지막 {shortTime(routine.lastRunAt)}</span> : null}
          </div>
        </div>
      ))}
      {note ? <p className="m-0 px-1 text-[13px] text-app-muted" role="status">{note}</p> : null}
    </div>
  );
}

function Memory({ satelliteId, memory, goals }: { satelliteId: string; memory: Doc; goals: Doc }) {
  return (
    <div className="grid gap-4">
      <MemoryDoc doc={goals} label="목표" name="goals" satelliteId={satelliteId} />
      <MemoryDoc doc={memory} label="기억" name="memory" satelliteId={satelliteId} />
      <p className="m-0 px-1 text-[12px] leading-relaxed text-app-muted">원본은 맥의 Orbit 홈 data/satellites/{satelliteId}/ 에 있어요. 여기서 고치면 맥 파일에 반영돼요.</p>
    </div>
  );
}

function MemoryDoc({ satelliteId, name, label, doc }: { satelliteId: string; name: "memory" | "goals"; label: string; doc: Doc }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(doc?.body ?? "");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="m-0 text-[15px] font-bold">{label}</h3>
        {editing ? null : <button className="min-h-8 rounded-full px-2.5 text-[13px] font-semibold text-app-accent active:bg-app-fill" onClick={() => { setBody(doc?.body ?? ""); setEditing(true); }} type="button">고치기</button>}
      </div>
      {editing ? (
        <div className="grid gap-2">
          <label className="sr-only" htmlFor={`${satelliteId}-${name}`}>{label}</label>
          <textarea className="min-h-48 w-full resize-y rounded-[14px] bg-app-side p-3 font-mono text-[14px] leading-relaxed outline-none ring-1 ring-app-line focus:ring-app-faint" id={`${satelliteId}-${name}`} onChange={(event) => setBody(event.target.value)} value={body} />
          <div className="flex gap-2">
            <button className="h-10 flex-1 rounded-full bg-app-fill text-[14px] font-semibold active:scale-[.98]" onClick={() => setEditing(false)} type="button">취소</button>
            <button className="h-10 flex-1 rounded-full bg-app-ink text-[14px] font-semibold text-app-bg active:scale-[.98] disabled:opacity-50" disabled={busy} onClick={() => start(async () => {
              const result = await saveMemoryDoc(satelliteId, name, body);
              if ("error" in result) { setError(result.error); return; }
              setEditing(false);
              router.refresh();
            })} type="button">저장</button>
          </div>
          {error ? <p className="m-0 text-[13px] text-app-danger" role="alert">{error}</p> : null}
        </div>
      ) : doc?.body ? (
        <div className="rounded-[14px] bg-app-side p-3"><RichText text={doc.body.replace(/^# .*\n+/, "")} /></div>
      ) : (
        <p className="m-0 px-1 text-[14px] text-app-muted">맥 엔진이 아직 보내지 않았어요.</p>
      )}
    </section>
  );
}
