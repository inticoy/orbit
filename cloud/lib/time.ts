// Times in the owner's time zone, built from numeric parts so the server (Node) and the phone's
// browser print exactly the same text (their Intl locale data differ slightly).

import { TIMEZONE } from "@/lib/site";
import { addDays, todayKey } from "@/lib/date";

const parts = (value: Date) => {
  const map = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value).map((part) => [part.type, part.value]));
  return { day: `${map.year}-${map.month.padStart(2, "0")}-${map.day.padStart(2, "0")}`, month: Number(map.month), date: Number(map.day), hour: Number(map.hour), minute: map.minute };
};

const yesterday = (now: Date) => addDays(todayKey(now), -1);

/** "14:05" today, "어제", or "10/24" — like a chat list. */
export function shortTime(isoTime: string, now = new Date()) {
  const at = parts(new Date(isoTime));
  if (at.day === parts(now).day) return `${String(at.hour).padStart(2, "0")}:${at.minute}`;
  if (at.day === yesterday(now)) return "어제";
  return `${at.month}/${at.date}`;
}

/** "오늘 오전 7:30" style divider label for a message time. */
export function dayLabel(isoTime: string, now = new Date()) {
  const at = parts(new Date(isoTime));
  const time = `${at.hour < 12 ? "오전" : "오후"} ${at.hour % 12 || 12}:${at.minute}`;
  if (at.day === parts(now).day) return `오늘 ${time}`;
  if (at.day === yesterday(now)) return `어제 ${time}`;
  return `${at.month}월 ${at.date}일 ${time}`;
}
