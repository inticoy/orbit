import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { NotAllowed } from "@/components/not-allowed";
import { PageEnter } from "@/components/page-enter";
import { TodayView } from "@/components/today";
import { getViewer } from "@/lib/auth";
import { loadToday } from "@/lib/today";
import { glassButton } from "@/lib/design";
import { getEnv } from "@/lib/env";

/** Phone: 오늘 as its own screen, opened from the roster. Desktop shows it on the home page. */
export default async function TodayPage() {
  const viewer = await getViewer();
  if (!viewer) return <NotAllowed />;
  const env = await getEnv();
  const today = await loadToday(env);
  return (
    <div className="min-h-dvh bg-app-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <PageEnter><TodayView {...today} back={<Link aria-label="위성 목록" className={glassButton} href="/"><ChevronLeft aria-hidden="true" size={22} /></Link>} /></PageEnter>
    </div>
  );
}
