/**
 * Shared Tailwind recipes — the design system in one place.
 *
 * Type scale: title 28 · heading 17 · body 15 · label 13 · caption 12.
 * Grouped lists are rows inside one card, split by hairlines (iOS inset grouped).
 */
export const card = "rounded-card bg-app-card shadow-card ring-1 ring-app-line";
const hairlines = "overflow-hidden [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:z-10 [&>*+*]:before:top-0 [&>*+*]:before:right-0 [&>*+*]:before:left-[68px] [&>*+*]:before:h-px [&>*+*]:before:bg-app-line";
export const listCard = `${card} ${hairlines}`;
/** A flat row like the satellite list: no card, rounded fill when pressed. */
export const row = "flex min-h-[56px] items-center gap-3 rounded-row px-2 py-2";
export const rowLink = `${row} text-inherit no-underline transition-colors active:bg-app-fill`;

export const textLabel = "text-[13px] font-semibold text-app-muted";
export const numeric = "tabular-nums tracking-[-0.03em]";

export type Tone = "plain" | "danger";
export const toneTile: Record<Tone, string> = {
  plain: "bg-app-fill text-app-ink",
  danger: "bg-app-danger/12 text-app-danger",
};
export const iconTile = "grid size-10 shrink-0 place-items-center rounded-[12px]";

/** Round toolbar button. */
export const glassButton = "relative grid size-11 shrink-0 place-items-center rounded-full bg-app-fill text-app-ink no-underline transition active:scale-90";
