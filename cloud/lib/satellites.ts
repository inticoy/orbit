// The satellites, shared by server pages and client components. They come from the
// owner's orbit.config.json (built-ins filled in) through orbit.site.json.
import { SITE, type SiteSatellite } from "./site";

export type Satellite = SiteSatellite;

export const satellites: Satellite[] = SITE.satellites;

export function satelliteById(id: string) {
  return satellites.find((satellite) => satellite.id === id);
}
