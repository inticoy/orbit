// What this Orbit is: its address, time zone and satellites, from the owner's
// orbit.config.json. `./orbit build` writes orbit.site.json before every build;
// it holds nothing secret.
import site from "../orbit.site.json";

export type SiteSatellite = {
  id: string;
  name: string;
  role: string;
  /** Avatar color and the shape's border-radius (the simple Grok-style avatar). */
  color: string;
  shape: string;
  engine: "codex" | "claude" | "gemini";
  ready: boolean;
  /** One line under the name before there is any conversation. */
  intro: string;
  /** The Mac engine sends this satellite a dashboard (widget + cards). */
  dashboard: boolean;
};

type Site = { url: string; timezone: string; briefing: string | null; satellites: SiteSatellite[] };

export const SITE = site as Site;
/** IANA time zone every date and routine time is shown and scheduled in. */
export const TIMEZONE = SITE.timezone || "Asia/Seoul";
