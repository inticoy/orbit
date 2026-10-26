// How the satellite list is ordered: by the latest message (default), or as written in the config.
// Kept per browser in a cookie so the server renders the right order on the first paint.
import type { Satellite } from "@/lib/satellites";

export type ListOrder = "recent" | "fixed";
export const LIST_ORDER_COOKIE = "orbit-list-order";
export const listOrder = (value: string | undefined): ListOrder => (value === "fixed" ? "fixed" : "recent");

/** recent: satellites that need a decision first, then newest conversation first; never-used ones keep config order at the end. */
export function sortSatellites(satellites: Satellite[], order: ListOrder, last: Map<string, { createdAt: string }>, asking: Set<string>) {
  if (order === "fixed") return satellites;
  const rank = (one: Satellite) => [asking.has(one.id) ? 0 : 1, last.get(one.id)?.createdAt ?? ""] as const;
  return [...satellites].sort((a, b) => {
    const [askA, timeA] = rank(a), [askB, timeB] = rank(b);
    return askA - askB || (timeA === timeB ? 0 : timeA > timeB ? -1 : 1);
  });
}
