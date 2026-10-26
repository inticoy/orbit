import { ActivityList, EngineChip } from "@/components/activity";
import { Avatar } from "@/components/avatar";
import { Dashboard } from "@/components/dashboards";
import { EngineLogo } from "@/components/engine-logo";
import { SatellitePanel } from "@/components/satellite-panel";
import { engineStatus, getMemoryDocs, getSnapshot, recentActivity, type JobState } from "@/lib/conversations";
import { getEnv } from "@/lib/env";
import { listRoutines } from "@/lib/routines";
import type { Satellite } from "@/lib/satellites";

/** "조사 ⟨logo⟩" when idle (the engine as its logo), or what the job is doing. */
export function statusLine(satellite: Satellite, job: JobState | null) {
  if (!job) return <span className="inline-flex items-center justify-center gap-1.5">{satellite.role}<EngineLogo engine={satellite.engine} /></span>;
  return job.status === "queued" ? "맥 엔진을 기다리는 중" : job.progress ?? "일하는 중";
}

/** Muse-style profile: big avatar, what it is doing now, then dashboard · activity · routines · memory. */
export async function SatelliteProfile({ satellite, job }: { satellite: Satellite; job: JobState | null }) {
  const env = await getEnv();
  const [snapshot, activity, routines, docs, engine] = await Promise.all([
    satellite.dashboard ? getSnapshot(env, satellite.id) : null,
    recentActivity(env, satellite.id),
    listRoutines(env, satellite.id),
    getMemoryDocs(env, satellite.id),
    engineStatus(env),
  ]);
  return (
    <div className="grid gap-5">
      <div className="grid justify-items-center gap-1.5 pt-2 text-center">
        <Avatar satellite={satellite} size={84} status={job ? "working" : "idle"} />
        <span className="mt-2 text-[22px] font-bold tracking-[-0.02em]">{satellite.name}</span>
        <span className="text-[14px] text-app-muted">{statusLine(satellite, job)}</span>
        <div className="mt-1"><EngineChip lastSeen={engine.lastSeen} online={engine.online} /></div>
      </div>
      <SatellitePanel
        activity={<ActivityList empty="아직 맡긴 일이 없어요." items={activity} />}
        dashboard={<Dashboard satellite={satellite.id} snapshot={snapshot} />}
        goals={docs.goals}
        hasDashboard={satellite.dashboard}
        memory={docs.memory}
        routines={routines}
        satelliteId={satellite.id}
      />
    </div>
  );
}
