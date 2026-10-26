import { OrbitCard } from "./cards";
import { satellites } from "@/lib/satellites";
import { TIMEZONE } from "@/lib/site";

type Snap = { data: unknown; observedAt: string | null; updatedAt: string } | null;
type Data = Record<string, unknown>;
const panel = "min-w-0 rounded-[18px] bg-app-card p-4 ring-1 ring-app-line";
const object = (v: unknown): Data => v && typeof v === "object" && !Array.isArray(v) && !("error" in v) ? v as Data : {};
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string";
const tones = { ok: "text-app-ok", warn: "text-app-warn", danger: "text-app-danger" };

function clock(value: unknown) {
  if (!str(value) || !value) return "시각 없음";
  // SQLite timestamps without an offset are UTC.
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(date.getTime())) return "시각 없음";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function Dashboard({ satellite, snapshot }: { satellite: string; snapshot: Snap }) {
  const cards = object(snapshot?.data).cards;
  if (!Array.isArray(cards) || !cards.length) return <div className={panel}><p className="m-0 py-3 text-[13px] leading-relaxed text-app-muted">맥 엔진이 아직 숫자를 보내지 않았어요</p></div>;
  return <div className="grid min-w-0 gap-3 text-app-ink" aria-label={`${satellite} 대시보드`}>
    {cards.map((spec, i) => <OrbitCard spec={spec} key={i} />)}
    <p className="m-0 px-1 text-right text-[11px] tabular-nums text-app-faint">확인 {clock(snapshot?.observedAt ?? snapshot?.updatedAt)}</p>
  </div>;
}

function MiniBars({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (!values.length) return null;
  const max = Math.max(...values.map(Math.abs), 1);
  return <svg viewBox="0 0 200 36" className="mt-3 h-9 w-full" role="img" aria-label={label}>{values.slice(-24).map((v, i, all) => {
    const step = 200 / all.length, height = Math.abs(v) / max * 30;
    return <rect key={i} x={i * step + 2} y={34 - height} width={Math.max(1, step - 4)} height={height} rx="2" fill={color} opacity={i === all.length - 1 ? 1 : .35}><title>{v}</title></rect>;
  })}</svg>;
}

export function TodayWidgets({ snapshots }: { snapshots: Record<string, Snap> }) {
  return <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-3">{satellites.filter((s) => s.dashboard).map(({ id, name, color }) => {
    const widget = object(object(snapshots[id]?.data).widget);
    const values = Array.isArray(widget.values) && widget.values.every(num) ? widget.values.slice(-24) : [];
    const tone = widget.tone === "ok" || widget.tone === "warn" || widget.tone === "danger" ? tones[widget.tone] : "text-app-ink";
    return <a key={id} href={`/s/${id}`} className={`${panel} block no-underline transition-transform active:scale-[.98]`} aria-label={`${name} 대시보드`}><div className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="truncate text-[12px] font-semibold text-app-muted">{name}</span></div><div className={`mt-3 break-words text-[24px] font-semibold leading-tight tracking-tight tabular-nums ${tone}`}>{str(widget.main) && widget.main ? widget.main : "데이터 없음"}</div><div className="mt-2 break-words text-[12px] leading-relaxed tabular-nums text-app-muted">{str(widget.detail) && widget.detail ? widget.detail : "맥 엔진의 숫자를 기다리고 있어요"}</div><MiniBars values={values} color={color} label={str(widget.valuesLabel) && widget.valuesLabel ? widget.valuesLabel : `${name} 추이`} /></a>;
  })}</div>;
}
