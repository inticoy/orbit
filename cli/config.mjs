// Reads the owner's home folder (orbit.config.json) and resolves it into the full list of
// satellites and routines, with the built-ins filled in. Shared by the CLI and the Mac engine.
// No dependencies: Node 24 only.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOME_POINTER = join(CORE, ".orbit-home");
export const BUILTINS = JSON.parse(readFileSync(join(CORE, "satellites", "builtins.json"), "utf8"));

const ID = /^[a-z][a-z0-9-]{0,30}$/;
const TIMES = /^\d{1,2}:\d{2}(,\d{1,2}:\d{2})*$/;
const ENGINES = ["codex", "claude", "gemini"];

/** The home folder: ORBIT_HOME, else the one `orbit setup` remembered, else ./home. */
export function homeDir() {
  if (process.env.ORBIT_HOME) return resolve(process.env.ORBIT_HOME);
  if (existsSync(HOME_POINTER)) return readFileSync(HOME_POINTER, "utf8").trim();
  return join(CORE, "home");
}

export function rememberHome(home) {
  writeFileSync(HOME_POINTER, `${resolve(home)}\n`);
}

export const configPath = (home) => join(home, "orbit.config.json");

export function readConfig(home = homeDir()) {
  const file = configPath(home);
  if (!existsSync(file)) throw new Error(`설정 파일이 없어요: ${file} (먼저 ./orbit setup)`);
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Writes back only the keys `orbit setup` fills in, keeping the owner's formatting choices simple. */
export function updateConfig(home, patch) {
  const config = { ...readConfig(home), ...patch };
  writeFileSync(configPath(home), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function satellite(entry) {
  const given = typeof entry === "string" ? { id: entry } : entry;
  if (!given || !ID.test(given.id ?? "")) throw new Error(`위성 id가 이상해요: ${JSON.stringify(entry)}`);
  const base = BUILTINS[given.id] ?? {};
  const merged = { role: "", intro: "", color: "#8e8e93", shape: "50%", engine: "codex", web: false, mcp: false, context: [], actions: false, dashboard: false, briefing: false, ...base, ...given };
  delete merged.routines;
  if (!merged.name) throw new Error(`위성 ${given.id}에 name이 없어요`);
  if (!ENGINES.includes(merged.engine)) throw new Error(`위성 ${given.id}의 engine은 codex, claude, gemini 중 하나여야 해요`);
  return { ...merged, builtin: !!BUILTINS[given.id] };
}

/** Everything the config adds up to: satellites (built-ins filled in) and routines. */
export function resolveConfig(config) {
  const satellites = (config.satellites ?? Object.keys(BUILTINS)).map(satellite);
  const ids = new Set();
  for (const one of satellites) {
    if (ids.has(one.id)) throw new Error(`위성 ${one.id}가 두 번 있어요`);
    ids.add(one.id);
  }
  const routines = new Map();
  for (const one of satellites) for (const routine of BUILTINS[one.id]?.routines ?? []) routines.set(routine.id, { ...routine, satellite: one.id });
  for (const routine of config.routines ?? []) {
    if (routine.remove) {
      routines.delete(routine.id);
      continue;
    }
    routines.set(routine.id, { ...routines.get(routine.id), ...routine });
  }
  for (const routine of routines.values()) {
    if (!ID.test(routine.id ?? "") || !ids.has(routine.satellite) || !routine.title || !routine.prompt || !TIMES.test(routine.times ?? "")) {
      throw new Error(`루틴이 이상해요: ${routine.id} (satellite, title, prompt, times "HH:MM,HH:MM" 필요)`);
    }
    routine.weekdays ??= null;
    routine.notify ??= "change";
  }
  return { ...config, timezone: config.timezone ?? "Asia/Seoul", satellites, routines: [...routines.values()] };
}

/** The public part the web app is built with (cloud/orbit.site.json). No secrets. */
export function siteJson(resolved) {
  return {
    url: resolved.cloudflare?.url ?? "",
    timezone: resolved.timezone,
    briefing: resolved.satellites.find((one) => one.briefing)?.id ?? null,
    satellites: resolved.satellites.map(({ id, name, role, color, shape, engine, intro, dashboard }) => ({ id, name, role, color, shape, engine, intro, ready: true, dashboard })),
  };
}
