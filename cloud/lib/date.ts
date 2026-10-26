/**
 * Calendar dates as `YYYY-MM-DD` keys in the owner's time zone. Workers run in UTC, so
 * "today" must never come from the server's local midnight.
 */
import { TIMEZONE } from "@/lib/site";

const DAY_MS = 86_400_000;

export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function toUtc(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function addDays(key: string, days: number) {
  return new Date(toUtc(key) + days * DAY_MS).toISOString().slice(0, 10);
}

export function addYears(key: string, years: number) {
  const [year, month, day] = key.split("-");
  return `${Number(year) + years}-${month}-${day}`;
}

export function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(toUtc(value)).toISOString().slice(0, 10) === value;
}

export function formatDate(key: string, options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat("ko-KR", { ...options, timeZone: "UTC" }).format(new Date(toUtc(key)));
}

export function formatTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, "0")}`;
}

export function formatDday(days: number) {
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}
