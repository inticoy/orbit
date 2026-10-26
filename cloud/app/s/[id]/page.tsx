import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Chat } from "@/components/chat";
import { NotAllowed } from "@/components/not-allowed";
import { SatelliteProfile, statusLine } from "@/components/satellite-profile";
import { Shell } from "@/components/shell";
import { getViewer } from "@/lib/auth";
import { getFeed, markSatelliteRead } from "@/lib/conversations";
import { glassButton } from "@/lib/design";
import { getEnv } from "@/lib/env";
import { loadListState } from "@/lib/list-state";
import { satelliteById } from "@/lib/satellites";

export default async function SatellitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const satellite = satelliteById(id);
  if (!satellite) notFound();
  const viewer = await getViewer();
  if (!viewer) return <NotAllowed />;
  const env = await getEnv();
  const feed = await getFeed(env, satellite.id);
  const newest = feed.messages[feed.messages.length - 1]?.id;
  if (newest) await markSatelliteRead(env, viewer.email, satellite.id, newest);
  const list = await loadListState(env, viewer.email);

  return (
    <Shell active={satellite.id} list={list} panel={<SatelliteProfile job={feed.job} satellite={satellite} />}>
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-app-line bg-app-bg px-[max(10px,env(safe-area-inset-left))] pt-[calc(env(safe-area-inset-top)+8px)] pb-2 md:border-b-0 md:px-5 md:pt-3">
        <Link aria-label="위성 목록" className={`${glassButton} md:hidden`} href="/"><ChevronLeft aria-hidden="true" size={22} /></Link>
        <Link className="flex min-w-0 flex-1 items-center justify-center gap-2.5 text-inherit no-underline md:justify-start lg:pointer-events-none" href={`/s/${satellite.id}/about`}>
          <Avatar satellite={satellite} size={30} status={feed.job ? "working" : "idle"} />
          <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center text-center md:justify-items-start md:text-left">
            <span className="max-w-full truncate text-[15px] font-semibold">{satellite.name}</span>
            <span className="max-w-full truncate text-[12px] text-app-muted">{statusLine(satellite, feed.job)}</span>
          </span>
        </Link>
        <span className="size-11 md:hidden" />
      </header>
      <Chat color={satellite.color} initial={feed} name={satellite.name} ready={satellite.ready} satelliteId={satellite.id} />
    </Shell>
  );
}
