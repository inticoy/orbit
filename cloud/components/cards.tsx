import type { ReactNode } from "react";

const colors = ["#007aff", "#34c759", "#ff9500", "#af52de", "#ff3b30", "#30b0c7", "#5856d6", "#8e8e93"];
const box = "@container min-w-0 rounded-[18px] bg-app-card p-4 text-app-ink ring-1 ring-app-line";
type Row = Record<string, unknown>;
const record = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const string = (v: unknown): v is string => typeof v === "string";
const numberLabel = (n: number) => String(Number(n.toFixed(2)));

function Frame({ title, children }: { title?: string; children: ReactNode }) {
  return <section className={box}>{title && <h3 className="m-0 mb-3 break-words text-[12px] font-semibold text-app-muted">{title}</h3>}{children}</section>;
}

const tones = { ok: "text-app-ok", warn: "text-app-warn", danger: "text-app-danger", muted: "text-app-muted" };
const tone = (v: unknown) => v === undefined || v === "ok" || v === "warn" || v === "danger";
function EmptyCard({ title }: { title?: string }) {
  return <Frame title={title}><p className="m-0 py-3 text-[13px] leading-relaxed text-app-muted">데이터 없음</p></Frame>;
}

/** JSON-only display card; safe to import from either React component boundary. */
export function OrbitCard({ spec }: { spec: unknown }) {
  if (!record(spec) || !string(spec.type) || (spec.title !== undefined && !string(spec.title)) || (spec.unit !== undefined && !string(spec.unit))) return <EmptyCard />;
  const title = spec.title as string | undefined;
  const unit = (spec.unit as string | undefined) ?? "";

  if (spec.type === "metric" || spec.type === "progress") {
    if (!string(title) || !string(spec.value) || (spec.detail !== undefined && !string(spec.detail))) return <EmptyCard title={title} />;
    if (spec.type === "metric" && !tone(spec.tone)) return <EmptyCard title={title} />;
    if (spec.type === "progress" && (!finite(spec.current) || !finite(spec.max) || spec.current < 0 || spec.max <= 0)) return <EmptyCard title={title} />;
    const pct = spec.type === "progress" ? Math.min(1, (spec.current as number) / (spec.max as number)) * 100 : 0;
    return <Frame title={title}><div className={`break-words text-[28px] font-semibold leading-tight tracking-tight tabular-nums ${spec.type === "metric" && spec.tone ? tones[spec.tone as "ok" | "warn" | "danger"] : "text-app-ink"}`}>{spec.value}</div>{spec.type === "progress" && <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="mt-3 h-2 overflow-hidden rounded-full bg-app-fill"><div className={`h-full rounded-full ${(spec.current as number) > (spec.max as number) ? "bg-app-warn" : "bg-app-accent"}`} style={{ width: `${pct}%` }} /></div>}{string(spec.detail) && spec.detail && <div className="mt-2 break-words text-[12px] tabular-nums text-app-muted">{spec.detail}</div>}</Frame>;
  }

  if (spec.type === "list") {
    if (!Array.isArray(spec.items) || (spec.empty !== undefined && !string(spec.empty))) return <EmptyCard title={title} />;
    if (!spec.items.every((i) => record(i) && string(i.label) && [i.detail, i.meta, i.group].every((v) => v === undefined || string(v)) && (i.mark === undefined || ["ok", "warn", "dot", "todo"].includes(i.mark as string)) && (tone(i.tone) || i.tone === "muted"))) return <EmptyCard title={title} />;
    const items = spec.items.slice(0, 40) as Row[];
    const groups = new Map<string, Row[]>();
    for (const item of items) {
      const group = (item.group as string | undefined) ?? "";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(item);
    }
    return <Frame title={title}>{items.length ? <div className="grid min-w-0 gap-4">{[...groups].map(([group, entries]) => <section className="min-w-0" key={group}>{group && <h4 className="m-0 mb-2 break-words text-[12px] font-medium text-app-muted">{group}</h4>}<ul className="m-0 grid list-none gap-3 p-0">{entries.map((i, n) => <li className="flex min-w-0 items-start gap-2 text-sm" key={n}>{string(i.mark) && <span className={`shrink-0 ${i.mark === "ok" ? tones.ok : i.mark === "warn" ? tones.warn : tones[i.tone as keyof typeof tones] ?? "text-app-muted"}`} aria-label={i.mark === "ok" ? "완료" : i.mark === "warn" ? "확인 필요" : i.mark === "todo" ? "미완료" : undefined}>{i.mark === "dot" ? <span className="mt-1.5 block size-2 rounded-full bg-current" /> : i.mark === "ok" ? "✓" : i.mark === "warn" ? "!" : "○"}</span>}<div className="min-w-0 flex-1"><p className={`m-0 break-words ${i.tone === "warn" || i.tone === "danger" ? tones[i.tone] : "text-app-ink"}`}>{i.label as string}</p>{string(i.detail) && i.detail && <p className={`m-0 mt-1 break-words text-[12px] ${i.tone === "warn" ? "text-app-warn" : "text-app-muted"}`}>{i.detail as string}</p>}</div>{string(i.meta) && i.meta && <span className="shrink-0 text-[12px] tabular-nums text-app-muted">{i.meta as string}</span>}</li>)}</ul></section>)}</div> : <p className="m-0 py-3 text-[13px] leading-relaxed text-app-muted">{(spec.empty as string | undefined) || "데이터 없음"}</p>}</Frame>;
  }

  if (spec.type === "table") {
    if (!Array.isArray(spec.columns) || !spec.columns.length || !spec.columns.every(string) || !Array.isArray(spec.rows)) return <EmptyCard title={title} />;
    const columns = spec.columns as string[];
    if (!spec.rows.every((row) => Array.isArray(row) && row.length === columns.length && row.every((v) => string(v) || finite(v)))) return <EmptyCard title={title} />;
    const rows = spec.rows.slice(0, 24) as (string | number)[][];
    return <Frame title={title}><div className="overflow-x-auto"><table className="w-full border-collapse text-left text-[13px] tabular-nums"><thead><tr>{columns.map((c, i) => <th className="whitespace-nowrap border-b border-app-line px-3 py-2 font-medium text-app-muted" key={i} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="whitespace-nowrap border-b border-app-line px-3 py-2 text-app-ink" key={j}>{cell}</td>)}</tr>)}</tbody></table></div></Frame>;
  }

  if (!["stat", "bar", "donut", "line", "checklist"].includes(spec.type) || !Array.isArray(spec.items) || !spec.items.length) return <EmptyCard title={title} />;
  if (!spec.items.every((item) => record(item) && string(item.label))) return <EmptyCard title={title} />;
  const all = spec.items as Row[];
  const items = all.slice(0, 24);

  if (spec.type === "stat") {
    if (!all.every((i) => (string(i.value) || finite(i.value)) && (i.detail === undefined || string(i.detail)))) return <EmptyCard title={title} />;
    return <Frame title={title}><div className="grid grid-cols-2 gap-2 @min-[480px]:grid-cols-3">{items.map((i, n) => <div className="min-w-0 rounded-[14px] bg-app-side p-3" key={n}><div className="break-words text-[12px] text-app-muted">{i.label as string}</div><div className="mt-1 break-words text-xl font-semibold tabular-nums tracking-tight text-app-ink">{i.value as string | number}</div>{string(i.detail) && i.detail.length > 0 && <div className="mt-1 break-words text-[12px] tabular-nums text-app-muted">{i.detail as string}</div>}</div>)}</div></Frame>;
  }
  if (spec.type === "checklist") {
    if (!all.every((i) => typeof i.done === "boolean")) return <EmptyCard title={title} />;
    return <Frame title={title}><ul className="m-0 grid list-none gap-3 p-0">{items.map((i, n) => <li className="flex min-w-0 items-start gap-2 text-sm" key={n}><span className={i.done ? "text-app-ok" : "text-app-faint"} aria-label={i.done ? "완료" : "미완료"}>{i.done ? "✓" : "○"}</span><span className={`min-w-0 break-words ${i.done ? "text-app-muted" : "text-app-ink"}`}>{i.label as string}</span></li>)}</ul></Frame>;
  }
  if (!all.every((i) => finite(i.value) && (spec.type === "line" || (i.value as number) >= 0))) return <EmptyCard title={title} />;
  const points = items as { label: string; value: number }[];
  const values = points.map((i) => i.value);

  if (spec.type === "donut") {
    // Scale before summing so even very large finite values produce valid SVG.
    const max = Math.max(...values);
    const total = max ? values.reduce((sum, value) => sum + value / max, 0) : 0;
    let offset = 0;
    return <Frame title={title}><div className="flex flex-wrap items-center gap-4"><svg className="mx-auto w-32 shrink-0" viewBox="0 0 120 120" role="img" aria-label={title ?? "비중 도넛 차트"}><circle cx="60" cy="60" r="43" fill="none" stroke="currentColor" strokeWidth="15" className="text-app-faint" opacity=".2" />{points.map((i, n) => {
      const pct = total ? (i.value / max) / total * 100 : 0;
      const start = offset;
      offset += pct;
      return <circle key={n} cx="60" cy="60" r="43" fill="none" stroke={colors[n % colors.length]} strokeWidth="15" pathLength="100" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-start} transform="rotate(-90 60 60)"><title>{`${i.label}: ${numberLabel(pct)}%`}</title></circle>;
    })}<text x="60" y="64" textAnchor="middle" className="fill-current text-[12px] text-app-muted">{total ? "비중" : "데이터 없음"}</text></svg><ul className="m-0 grid min-w-0 flex-1 list-none gap-2 p-0">{points.map((i, n) => <li className="flex items-center gap-2 text-[12px]" key={n}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[n % colors.length] }} /><span className="min-w-0 flex-1 break-words text-app-muted">{i.label}</span><span className="shrink-0 tabular-nums text-app-ink">{numberLabel(Math.round((total ? (i.value / max) / total * 100 : 0) * 10) / 10)}%</span></li>)}</ul></div></Frame>;
  }

  if (spec.type === "bar") {
    const max = Math.max(...values) || 1;
    const width = Math.max(280, points.length * 38);
    return <Frame title={title}><div className="overflow-x-auto"><svg className="block h-auto w-full min-w-[280px]" style={{ minWidth: width }} viewBox={`0 0 ${width} 170`} role="img" aria-label={`${title ?? "막대 차트"}${unit ? ` (${unit})` : ""}`}><line x1="0" y1="140" x2={width} y2="140" stroke="currentColor" className="text-app-faint" opacity=".25" />{points.map((i, n) => {
      const step = width / points.length;
      const height = i.value / max * 102;
      const x = step * (n + .5);
      return <g key={n}><title>{`${i.label}: ${numberLabel(i.value)}${unit}`}</title><rect x={x - Math.min(14, step * .3)} y={140 - height} width={Math.min(28, step * .6)} height={height} rx="5" fill={colors[0]} opacity={n === points.length - 1 ? 1 : .35} /><text x={x} y={130 - height} textAnchor="middle" className="fill-current text-[11px] tabular-nums text-app-ink">{numberLabel(i.value)}</text><text x={x} y="160" textAnchor="middle" className="fill-current text-[11px] text-app-muted">{i.label.length > 5 ? `${i.label.slice(0, 4)}…` : i.label}</text></g>;
    })}</svg></div>{unit && <p className="m-0 mt-1 text-right text-[11px] text-app-faint">단위: {unit}</p>}</Frame>;
  }

  const scale = Math.max(...values.map(Math.abs), 1);
  const scaled = values.map((v) => v / scale);
  const min = Math.min(...scaled), max = Math.max(...scaled);
  const range = max - min || 1;
  const coordinates = scaled.map((v, n) => [points.length === 1 ? 150 : 16 + n / (points.length - 1) * 268, max === min ? 75 : 122 - (v - min) / range * 92]);
  const path = coordinates.map(([x, y], n) => `${n ? "L" : "M"}${x},${y}`).join(" ");
  const last = coordinates[coordinates.length - 1];
  return <Frame title={title}><svg className="block w-full" viewBox="0 0 300 164" role="img" aria-label={title ?? "추이 차트"}><title>{points.map((i) => `${i.label}: ${numberLabel(i.value)}${unit}`).join(", ")}</title><path d={`${path} L${last[0]},140 L${coordinates[0][0]},140 Z`} fill={colors[0]} opacity=".1" /><path d={path} fill="none" stroke={colors[0]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" /><circle cx={last[0]} cy={last[1]} r="4" fill={colors[0]} /><text x="16" y="159" className="fill-current text-[11px] text-app-muted">{points[0].label}</text>{points.length > 1 && <text x="284" y="159" textAnchor="end" className="fill-current text-[11px] text-app-muted">{points[points.length - 1].label}</text>}</svg><p className="m-0 text-right text-[12px] tabular-nums text-app-muted">{numberLabel(points[points.length - 1].value)}{unit}</p></Frame>;
}
