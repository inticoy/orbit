import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { NotAllowed } from "@/components/not-allowed";
import { PageEnter } from "@/components/page-enter";
import { SatelliteProfile } from "@/components/satellite-profile";
import { getViewer } from "@/lib/auth";
import { getFeed } from "@/lib/conversations";
import { glassButton } from "@/lib/design";
import { getEnv } from "@/lib/env";
import { satelliteById } from "@/lib/satellites";

/** Phone: the satellite's profile (dashboard, activity, routines, memory), opened from the chat header. */
export default async function SatelliteAbout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const satellite = satelliteById(id);
  if (!satellite) notFound();
  if (!(await getViewer())) return <NotAllowed />;
  const env = await getEnv();
  const { job } = await getFeed(env, satellite.id, Number.MAX_SAFE_INTEGER);
  return (
    <main className="min-h-dvh bg-app-bg pt-[calc(env(safe-area-inset-top)+8px)] pr-[max(16px,env(safe-area-inset-right))] pb-[calc(32px+env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))]">
      <PageEnter className="mx-auto grid max-w-[520px] gap-2">
        <Link aria-label={`${satellite.name} 대화로`} className={glassButton} href={`/s/${satellite.id}`}><ChevronLeft aria-hidden="true" size={22} /></Link>
        <SatelliteProfile job={job} satellite={satellite} />
      </PageEnter>
    </main>
  );
}
