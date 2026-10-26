#!/usr/bin/env node
// Orbit engine: runs on this Mac, connects out to the Orbit Worker, and does the
// satellites' work with the Mac's own tools (Codex / Claude Code logins, a Gemini API key, Keychain).
// It long-polls /engine/poll for a job, runs the satellite's CLI headless in its
// folder, reports progress, and posts the answer with any files and proposed actions.
// It also keeps the dashboards (snapshots) and memory docs in sync.
// Who the satellites are comes from the owner's home folder (orbit.config.json);
// dashboards, extra context, approved actions and data tools come from its plugins.
// See ../docs/plugins.md. No dependencies: Node 24 only.
import { spawn, execFile, execFileSync } from "node:child_process";
import { createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { CORE, homeDir, readConfig, resolveConfig } from "../cli/config.mjs";

const run = promisify(execFile);
const VERSION = "engine 0.5";
const HOME = homeDir();
const CONFIG = resolveConfig(readConfig(HOME));
const ORBIT_URL = process.env.ORBIT_URL ?? CONFIG.cloudflare?.url;
const TIMEZONE = CONFIG.timezone;
const NODE22 = process.execPath;
const JOB_TIMEOUT_MS = 15 * 60_000;
const PROGRESS_EVERY_MS = 2000;
const HEARTBEAT_MS = 30_000;
const SNAPSHOT_EVERY_MS = 10 * 60_000;
const CODEX_MODEL = process.env.ORBIT_CODEX_MODEL ?? CONFIG.codexModel ?? null;
const GEMINI_MODEL = process.env.ORBIT_GEMINI_MODEL ?? CONFIG.geminiModel ?? null;
const MAX_FILE_BYTES = 1_000_000;
const OUT_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".csv": "text/csv", ".txt": "text/plain", ".html": "text/html", ".md": "text/markdown", ".json": "application/json" };

// How each satellite works, from the config. chat: the CLI for messages I send; routines use
// `routineEngine` when the config sets one. context: what the engine puts in front of the prompt.
const SATELLITES = Object.fromEntries(CONFIG.satellites.map((one) => [one.id, {
  name: one.name, role: one.role, chat: one.engine, web: !!one.web, mcp: !!one.mcp, context: one.context ?? [], actions: one.actions ?? false, builtin: one.builtin,
  // full: the CLI runs without its sandbox or permission checks (shell, any file, network). safe: writes only to its data folder.
  full: (one.access ?? CONFIG.access) === "full",
}]));

if (!ORBIT_URL) throw new Error("orbit.config.json에 cloudflare.url이 없어요 (./orbit setup)");
const token = execFileSync("security", ["find-generic-password", "-s", CONFIG.keychain?.engineToken ?? "orbit-engine-token", "-w"], { encoding: "utf8" }).trim();
const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (text, max = 80) => {
  const one = String(text ?? "").replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

async function call(path, body, timeoutMs = 40_000) {
  const response = await fetch(`${ORBIT_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}

// --- per-satellite files -----------------------------------------------------

const satelliteDir = (id) => join(HOME, "satellites", id);
const dataDir = (id) => join(HOME, "data", "satellites", id);
const engineDir = join(HOME, "data", "engine");

function readSessions(id) {
  try { return JSON.parse(readFileSync(join(dataDir(id), "sessions.json"), "utf8")); } catch { return {}; }
}

function saveSession(id, engine, sessionId) {
  const sessions = readSessions(id);
  sessions[engine] = { id: sessionId, lastUsed: new Date().toISOString() };
  writeFileSync(join(dataDir(id), "sessions.json"), JSON.stringify(sessions, null, 2) + "\n");
}

/** The satellite's folder with its AGENTS.md (CLAUDE.md links to it): the built-in's, or a plain one from the config. */
function ensureSatellite(id) {
  const dir = satelliteDir(id);
  const agents = join(dir, "AGENTS.md");
  if (existsSync(agents)) return;
  mkdirSync(dir, { recursive: true });
  const template = join(CORE, "satellites", id, "AGENTS.md");
  if (SATELLITES[id].builtin && existsSync(template)) copyFileSync(template, agents);
  else {
    const { name, role } = SATELLITES[id];
    writeFileSync(agents, `# ${name}\n\n너는 Orbit의 위성 ${name}다.${role ? ` 맡은 일: ${role}.` : ""}\n\n## 기억\n- 시작할 때 \`../../data/satellites/${id}/memory.md\`와 \`goals.md\`를 읽는다.\n- 사용자가 알려 준 선호, 다음에도 필요한 사실은 memory.md에, 목표는 goals.md에 짧게 적는다. 다른 곳에는 쓰지 않는다.\n\n## 지켜야 할 것\n- 이 폴더와 Orbit 코드는 고치지 않는다. 쓰기는 \`../../data/satellites/${id}/\` 안에서만.\n- 메일, 결제, 계정 변경은 하지 않는다. 비밀값은 읽거나 출력하지 않는다.\n- 말투: 한국어 해요체, 결론부터 짧게. 폰 채팅으로 읽힌다.\n`);
  }
  if (!existsSync(join(dir, "CLAUDE.md"))) symlinkSync("AGENTS.md", join(dir, "CLAUDE.md"));
}

function ensureDirs(id) {
  ensureSatellite(id);
  for (const sub of ["", "inbox", "outbox", "journal"]) mkdirSync(join(dataDir(id), sub), { recursive: true });
  for (const [name, title] of [["memory.md", "기억"], ["goals.md", "목표"]]) {
    const file = join(dataDir(id), name);
    if (!existsSync(file)) writeFileSync(file, `# ${id} ${title}\n\n(아직 없음)\n`);
  }
}

/** MCP config shared by Claude (--mcp-config), Codex (-c mcp_servers.*) and Gemini (settings.json): the data tools a plugin offers. */
const mcpServer = () => plugins.find((plugin) => plugin.mcp)?.mcp ?? null;
const mcpReady = () => !!mcpServer();
function claudeMcpConfig() {
  mkdirSync(engineDir, { recursive: true });
  const file = join(engineDir, "mcp.json");
  writeFileSync(file, JSON.stringify({ mcpServers: { orbit: mcpServer() } }, null, 2));
  return file;
}
const toml = (value) => typeof value === "object" && !Array.isArray(value)
  ? `{${Object.entries(value).map(([key, item]) => `${key}=${JSON.stringify(String(item))}`).join(", ")}}` : JSON.stringify(value);

// --- plugins ---------------------------------------------------------------------

/** Each plugin is a module in the home folder whose default export returns { snapshots, context, actions, mcp }. */
let plugins = [];
async function loadPlugins() {
  for (const path of CONFIG.plugins ?? []) {
    const file = resolve(HOME, path);
    const module = await import(pathToFileURL(file).href);
    const plugin = await module.default({ home: HOME, config: CONFIG, timezone: TIMEZONE, log, run, node: NODE22 });
    plugins.push({ name: basename(file), ...plugin });
    log("plugin", basename(file), Object.keys(plugin).join(","));
  }
}
const pluginContext = (name) => plugins.find((plugin) => plugin.context?.[name])?.context[name];
const pluginAction = (type) => plugins.find((plugin) => plugin.actions?.[type])?.actions[type];
const actionTypes = () => plugins.flatMap((plugin) => Object.keys(plugin.actions ?? {}));

// --- context the engine adds to a prompt ------------------------------------------

let snapshotCache = { at: 0, data: null };

/** Every plugin's dashboards, by satellite id: { widget, cards, data, observedAt }. Cached for 5 minutes. */
async function snapshots() {
  if (snapshotCache.data && Date.now() - snapshotCache.at < 5 * 60_000) return snapshotCache.data;
  const data = {};
  for (const plugin of plugins.filter((one) => one.snapshots)) {
    try {
      Object.assign(data, await plugin.snapshots());
    } catch (error) {
      log("snapshot failed", plugin.name, short(error.message, 200));
    }
  }
  snapshotCache = { at: Date.now(), data };
  return data;
}

function localNow() {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TIMEZONE, dateStyle: "full", timeStyle: "short" }).format(new Date());
}

const OUTPUT_GUIDE = `
[답장 형식]
- 폰 채팅으로 읽힌다. 한국어 해요체, 결론부터 짧게. 마크다운(목록, 굵게, 표, 링크)을 쓸 수 있다. 제목(#)은 쓰지 않는다.
- 숫자를 보여 줄 때는 카드를 쓸 수 있다. 코드 블록 언어를 orbit-card로 하고 JSON 하나를 넣는다:
  {"type":"stat","items":[{"label":"이번 달","value":"12회","detail":"+3회"}]}
  {"type":"bar","title":"이번 주","unit":"시간","items":[{"label":"월","value":6.5}]}
  {"type":"donut","title":"비중","items":[{"label":"A","value":46}]}
  {"type":"line","title":"추이","items":[{"label":"9/1","value":100}]}
  {"type":"table","columns":["항목","값"],"rows":[["A",32]]}
  {"type":"checklist","items":[{"label":"보고서 보내기","done":false}]}
  {"type":"list","title":"할 일","items":[{"label":"보고서","meta":"10/30","mark":"todo"}]}
- 흐름·구조는 코드 블록 언어 mermaid로 그릴 수 있다.
- 긴 보고서는 코드 블록 언어 orbit-html로 완성된 HTML 한 장을 넣을 수 있다(외부 파일·CDN 없이, 스타일과 스크립트는 안에). 꼭 필요할 때만.
- 파일(이미지, PDF, CSV, HTML)을 만들었으면 outbox 폴더(${"OUTBOX"})에 저장한다. 1MB 이하. 엔진이 대화에 첨부한다.`;

const ACTION_GUIDE = (types) => `
[바깥 일 제안]
- 아래 일이 필요하면 직접 하지 말고, 코드 블록 언어 orbit-action으로 JSON 하나를 넣어 제안한다. 사용자가 폰에서 승인하면 엔진이 실행한다.
${types.map((type) => `  ${pluginAction(type).guide}`).join("\n")}`;

const HANDOFF_GUIDE = (peers) => `
[다른 위성에게 넘기기]
- 다른 위성이 맡는 게 나은 일은 직접 하지 말고, 코드 블록 언어 orbit-handoff로 JSON 하나를 넣어 넘긴다. 받는 위성이 이어서 일하고 사용자에게 답한다. 꼭 필요할 때만, 한 번에 하나.
  {"to":"scouty","message":"11/1(토) 14시 전시회 예약이 가능하다는 걸 확인했어. 비슷한 전시가 근처에 더 있는지 찾아 줘."}
- message에는 받는 위성이 혼자 이해할 수 있게 필요한 사실을 다 적는다.
- 위성: ${peers.map((peer) => `${peer.id}(${peer.name}, ${peer.role})`).join(", ")}`;

/** My reactions on recent answers, so the satellite learns what landed. */
function feedbackBlock(feedback) {
  if (!feedback?.length) return null;
  return `[내 반응] 최근 네 답에 내가 단 반응이에요. 좋았던 방식은 이어 가고, 👎는 왜 별로였을지 생각해 고쳐. 계속 지킬 선호라면 memory.md에 적어 둬.\n${feedback.map((item) => `- ${item.reaction} “${short(item.body, 140)}”`).join("\n")}`;
}

/** The satellite's action types: all the plugins' when `actions: true`, or the listed ones. */
function satelliteActions(config) {
  const known = actionTypes();
  return config.actions === true ? known : Array.isArray(config.actions) ? config.actions.filter((type) => known.includes(type)) : [];
}

async function buildPrompt(job, config) {
  const blocks = [`[지금] ${localNow()} (${TIMEZONE})`];
  for (const item of config.context) {
    try {
      if (item === "dashboards") {
        const all = Object.entries(await snapshots()).map(([id, snap]) => `- ${SATELLITES[id]?.name ?? id}: ${JSON.stringify(snap.data ?? snap.widget ?? null)}`);
        if (all.length) blocks.push(`[대시보드] (observedAt은 데이터를 확인한 시각)\n${all.join("\n")}`);
      } else if (item.startsWith("dashboard:")) {
        const id = item.slice("dashboard:".length);
        const snap = (await snapshots())[id];
        blocks.push(`[대시보드 ${id}]\n${JSON.stringify(snap ? snap.data ?? snap.widget ?? null : { error: "아직 없음" })}`);
      } else if (item.startsWith("memory:")) {
        const id = item.slice("memory:".length);
        const file = join(dataDir(id), "memory.md");
        if (existsSync(file)) blocks.push(`[${SATELLITES[id]?.name ?? id} 기억]\n${readFileSync(file, "utf8").slice(0, 6000)}`);
      } else {
        const context = pluginContext(item);
        const text = context ? await context(job) : null;
        if (text) blocks.push(`[${item}]\n${String(text).slice(0, 30_000)}`);
      }
    } catch (error) {
      blocks.push(`[${item}] 가져오지 못했어요: ${short(error.message, 120)}`);
    }
  }
  if (job.localFiles?.length) blocks.push(`[첨부] 사용자가 보낸 파일:\n${job.localFiles.map((file) => `- ${file}`).join("\n")}`);
  const feedback = feedbackBlock(job.feedback);
  if (feedback) blocks.push(feedback);
  blocks.push(OUTPUT_GUIDE.replace("OUTBOX", join(dataDir(job.satellite), "outbox")));
  const types = satelliteActions(config);
  if (types.length) blocks.push(ACTION_GUIDE(types));
  if (!job.depth && job.peers?.length) blocks.push(HANDOFF_GUIDE(job.peers));
  const logins = config.full && config.web ? readVaultIndex() : [];
  if (logins.length) blocks.push(VAULT_GUIDE(logins));
  blocks.push(job.kind === "routine" ? `[루틴: ${job.payload?.title ?? ""}]\n${job.prompt}` : `[사용자]\n${job.prompt}`);
  return blocks.join("\n\n");
}

// --- adapters ------------------------------------------------------------------

/** Runs a CLI that prints one JSON event per line; `onEvent` gets each parsed event. `signal` kills it. */
function runJsonLines(command, args, { cwd, input, onEvent, signal, env = {} }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, PATH: `${dirname(NODE22)}:${process.env.PATH}`, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let stderr = "";
    const kill = () => child.kill("SIGTERM");
    const timer = setTimeout(kill, JOB_TIMEOUT_MS);
    signal?.addEventListener("abort", kill);
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try { onEvent(JSON.parse(line)); } catch { /* not JSON: ignore */ }
      }
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on("close", (code, sig) => { clearTimeout(timer); resolve({ code, signal: sig, stderr }); });
    child.stdin.end(input);
  });
}

/** Codex: `codex exec --json`, resumed per satellite with `codex exec resume <thread>`. Routines run in their own fresh thread. */
async function runCodex(job, config, prompt, progress, signal) {
  const id = job.satellite;
  const session = job.kind === "routine" ? null : readSessions(id).codex?.id;
  const common = ["--json", "--skip-git-repo-check", ...(CODEX_MODEL ? ["-c", `model="${CODEX_MODEL}"`] : []),
    ...(config.full ? ["--dangerously-bypass-approvals-and-sandbox"] : ["-c", 'sandbox_mode="workspace-write"', "-c", `sandbox_workspace_write.writable_roots=["${dataDir(id)}"]`])];
  if (config.web) common.push("-c", 'web_search="live"');
  if (config.mcp && mcpReady()) {
    const server = mcpServer();
    common.push("-c", `mcp_servers.orbit.command=${JSON.stringify(server.command)}`, "-c", `mcp_servers.orbit.args=${JSON.stringify(server.args ?? [])}`,
      ...(server.env ? ["-c", `mcp_servers.orbit.env=${toml(server.env)}`] : []),
      // Read-only tools; unattended runs have nobody to approve each call.
      "-c", 'mcp_servers.orbit.default_tools_approval_mode="approve"');
  }
  for (const file of job.localFiles ?? []) if (/\.(png|jpe?g|gif|webp)$/i.test(file)) common.push("-i", file);
  const args = session ? ["exec", "resume", session, ...common, "-"] : ["exec", ...common, "-"];
  let answer = "";
  let threadId = session;
  const result = await runJsonLines("codex", args, {
    cwd: satelliteDir(id), input: prompt, signal,
    onEvent: (event) => {
      if (event.type === "thread.started") threadId = event.thread_id;
      const item = event.item;
      if (!item) return;
      if (item.type === "agent_message" && event.type === "item.completed") answer = item.text ?? answer;
      else if (item.type === "web_search") progress(`검색: ${short(item.query ?? item.action?.query ?? "웹", 60)}`);
      else if (item.type === "mcp_tool_call") progress(`Orbit 데이터: ${short(item.tool ?? item.name, 40)}`);
      else if (item.type === "command_execution") progress(/(^|[\s;&|])aside\b/.test(String(item.command ?? "")) ? "브라우저에서 일하는 중…" : `확인 중: ${short(item.command, 60)}`);
      else if (item.type === "reasoning") progress("생각하는 중…");
      else if (item.type === "file_change") progress("파일을 정리하는 중…");
    },
  });
  if (signal?.aborted) return { answer: "", cancelled: true };
  if (job.kind !== "routine" && threadId) saveSession(id, "codex", threadId);
  if (result.code !== 0 || !answer) {
    if (session) saveSession(id, "codex", ""); // a broken resume starts fresh next time
    throw new Error(short(result.stderr || `codex가 ${result.code ?? result.signal}로 끝났어요`, 300));
  }
  return { answer };
}

/** One status line for a Claude tool call: Orbit data, a browser task (Aside), a web search, or the tool's name. */
function toolLine(name = "", input = {}) {
  if (name.startsWith("mcp__orbit")) return `Orbit 데이터: ${short(name.replace("mcp__orbit__", ""), 40)}`;
  if (name === "Bash" && /(^|[\s;&|])aside\b/.test(String(input.command ?? ""))) return "브라우저에서 일하는 중…";
  if (name === "WebSearch") return `검색: ${short(input.query ?? "웹", 60)}`;
  if (name === "WebFetch") return "웹 페이지를 읽는 중…";
  if (name === "Bash") return `확인 중: ${short(input.description ?? input.command, 60)}`;
  return `도구: ${short(name, 40)}`;
}

/** Claude Code: `claude -p --output-format stream-json`, resumed with `--resume <session>`. */
async function runClaude(job, config, prompt, progress, signal) {
  const id = job.satellite;
  const session = readSessions(id).claude?.id;
  const tools = ["Read", "Glob", "Grep", "Edit", "Write", ...(config.web ? ["WebSearch", "WebFetch"] : []), ...(config.mcp && mcpReady() ? ["mcp__orbit"] : [])];
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--add-dir", dataDir(id),
    ...(config.full ? ["--dangerously-skip-permissions"] : ["--permission-mode", "acceptEdits", "--allowedTools", ...tools, "--disallowedTools", "Bash"])];
  if (config.mcp && mcpReady()) args.push("--mcp-config", claudeMcpConfig(), "--strict-mcp-config");
  if (session) args.push("--resume", session);
  let answer = "";
  let sessionId = session;
  const result = await runJsonLines("claude", args, {
    cwd: satelliteDir(id), input: prompt, signal,
    onEvent: (event) => {
      if (event.session_id) sessionId = event.session_id;
      if (event.type === "result") answer = event.result ?? answer;
      if (event.type === "assistant") {
        for (const part of event.message?.content ?? []) {
          if (part.type === "tool_use") progress(toolLine(part.name, part.input));
          else if (part.type === "text") progress("답을 쓰는 중…");
        }
      }
    },
  });
  if (signal?.aborted) return { answer: "", cancelled: true };
  if (sessionId) saveSession(id, "claude", sessionId);
  if (result.code !== 0 || !answer) {
    if (session) saveSession(id, "claude", "");
    throw new Error(short(result.stderr || `claude가 ${result.code ?? result.signal}로 끝났어요`, 300));
  }
  return { answer };
}

/**
 * Gemini CLI with an API key (Google AI Studio). It runs with its own settings folder under data/engine/gemini,
 * so it never picks up a personal Google login, hooks or MCP servers, and the key (Keychain) goes only to it.
 * Each chat keeps one session id, resumed with --resume <id>; routines start fresh.
 */
function geminiHome(config) {
  const home = join(engineDir, "gemini");
  mkdirSync(join(home, ".gemini"), { recursive: true });
  const settings = {
    security: { auth: { selectedType: "gemini-api-key" } },
    ...(config.full ? {} : { tools: { exclude: ["run_shell_command"] } }),
    // The satellite's instructions are AGENTS.md, like Codex and Claude Code read.
    context: { fileName: ["AGENTS.md"] },
    ...(config.mcp && mcpReady() ? { mcpServers: { orbit: { ...mcpServer(), trust: true } } } : {}),
  };
  writeFileSync(join(home, ".gemini", "settings.json"), JSON.stringify(settings, null, 2));
  return home;
}

let geminiKey = null;
async function runGemini(job, config, prompt, progress, signal) {
  const id = job.satellite;
  geminiKey ??= execFileSync("security", ["find-generic-password", "-s", CONFIG.keychain?.geminiApiKey ?? "orbit-gemini-api-key", "-w"], { encoding: "utf8" }).trim();
  const session = job.kind === "routine" ? null : readSessions(id).gemini?.id;
  const sessionId = session ?? randomUUID();
  const args = ["-p", "", "-o", "stream-json", "--skip-trust", "--approval-mode", config.full ? "yolo" : "auto_edit", "--include-directories", dataDir(id),
    ...(GEMINI_MODEL ? ["-m", GEMINI_MODEL] : []),
    ...(session ? ["--resume", session] : ["--session-id", sessionId]),
    ...(config.web ? ["--allowed-tools", "google_web_search", "web_fetch"] : []),
    ...(config.mcp && mcpReady() ? ["--allowed-mcp-server-names", "orbit"] : [])];
  let answer = "";
  let failed = null;
  const result = await runJsonLines("gemini", args, {
    cwd: satelliteDir(id), input: prompt, signal,
    env: { GEMINI_CLI_HOME: geminiHome(config), GEMINI_API_KEY: geminiKey },
    onEvent: (event) => {
      if (event.type === "message" && event.role === "assistant") answer += event.content ?? "";
      else if (event.type === "tool_use") progress(String(event.tool_name ?? "").startsWith("google_web") ? "검색하는 중…" : `도구: ${short(event.tool_name ?? "도구", 40)}`);
      else if (event.type === "result" && event.status !== "success") failed = event.error?.message ?? "gemini 오류";
    },
  });
  if (signal?.aborted) return { answer: "", cancelled: true };
  if (job.kind !== "routine") saveSession(id, "gemini", sessionId);
  if (result.code !== 0 || failed || !answer.trim()) {
    if (session) saveSession(id, "gemini", "");
    throw new Error(short(failed ?? (result.stderr || `gemini가 ${result.code ?? result.signal}로 끝났어요`), 300));
  }
  return { answer: answer.trim() };
}

const adapters = { codex: runCodex, claude: runClaude, gemini: runGemini };
const ENGINE_NAME = { codex: "Codex", claude: "Claude", gemini: "Gemini" };

// --- answer post-processing ------------------------------------------------------

/** Pulls ```orbit-action blocks (approval cards) and ```orbit-handoff blocks (work for another satellite) out of the answer. */
function takeActions(answer) {
  const actions = [];
  const handoffs = [];
  const text = answer.replace(/```orbit-(action|handoff)\s*\n([\s\S]*?)```/g, (_whole, kind, body) => {
    try {
      const item = JSON.parse(body);
      if (kind === "action" && item && typeof item.type === "string") actions.push(item);
      if (kind === "handoff" && item && typeof item.to === "string" && typeof item.message === "string") handoffs.push(item);
    } catch { /* malformed: drop it */ }
    return "";
  }).trim();
  return { text, actions, handoffs };
}

function takeOutbox(id) {
  const dir = join(dataDir(id), "outbox");
  const files = [];
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const path = join(dir, name);
    const mime = OUT_TYPES[extname(name).toLowerCase()];
    try {
      if (mime && statSync(path).isFile() && statSync(path).size <= MAX_FILE_BYTES) files.push({ name, mime, base64: readFileSync(path).toString("base64") });
    } finally {
      rmSync(path, { force: true, recursive: true });
    }
  }
  return files;
}

async function fetchInbox(job) {
  const paths = [];
  for (const file of job.files ?? []) {
    const { data, name } = await call("/engine/file", { id: file.id });
    const safe = basename(name).replace(/[^\w.\-가-힣]/g, "_").slice(0, 80) || "file";
    const path = join(dataDir(job.satellite), "inbox", `${job.id.slice(0, 8)}-${safe}`);
    writeFileSync(path, Buffer.from(data, "base64"));
    paths.push(path);
  }
  return paths;
}

// --- dashboards and memory sync -------------------------------------------------------

/** Sends each dashboard's widget and cards (not its raw data) to the cloud. */
async function pushSnapshots() {
  snapshotCache.at = 0;
  for (const [id, snap] of Object.entries(await snapshots())) {
    if (!SATELLITES[id] || !snap) continue;
    try {
      await call("/engine/snapshot", { satellite: id, data: { widget: snap.widget ?? null, cards: snap.cards ?? [] }, observedAt: snap.observedAt ?? null });
    } catch (error) {
      log("snapshot push failed", id, short(error.message, 200));
    }
  }
}

const memoryHashes = new Map();
async function syncMemory() {
  for (const id of Object.keys(SATELLITES)) {
    ensureDirs(id);
    const docs = [];
    for (const name of ["memory", "goals"]) {
      const body = readFileSync(join(dataDir(id), `${name}.md`), "utf8");
      const hash = createHash("sha256").update(body).digest("hex");
      if (memoryHashes.get(`${id}/${name}`) !== hash) docs.push({ name, body, hash });
    }
    if (!docs.length) continue;
    try {
      await call("/engine/memory", { satellite: id, docs: docs.map(({ name, body }) => ({ name, body })) });
      for (const doc of docs) memoryHashes.set(`${id}/${doc.name}`, doc.hash);
    } catch (error) {
      log("memory sync failed", id, error.message);
    }
  }
}

// --- site logins (Keychain) ---------------------------------------------------------

// The phone seals each login with this engine's public key; only the private key in this Mac's Keychain opens it.
// Logins go to Keychain items "orbit-site:<site>"; data/engine/vault.json lists site and username (never the password).
const VAULT_KEY = CONFIG.keychain?.vaultKey ?? "orbit-vault-key";
const VAULT_EVERY_MS = 15_000;
const vaultIndexFile = join(engineDir, "vault.json");
const SITE = /^[a-z0-9][a-z0-9.-]{0,119}$/;

/** Writes through `security -i` on stdin with the value as hex, so the secret never shows in a process list. */
function keychainSet(service, account, value) {
  if (/["\n\\]/.test(account)) throw new Error("아이디에 쓸 수 없는 글자가 있어요");
  const hex = Buffer.from(value, "utf8").toString("hex");
  execFileSync("security", ["-i"], { input: `add-generic-password -U -a "${account}" -s "${service}" -X ${hex}\n`, stdio: ["pipe", "ignore", "ignore"] });
  execFileSync("security", ["find-generic-password", "-s", service], { stdio: "ignore" }); // throws if it did not land
}

function vaultKey() {
  try {
    const der = execFileSync("security", ["find-generic-password", "-s", VAULT_KEY, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return createPrivateKey({ key: Buffer.from(der, "base64"), format: "der", type: "pkcs8" });
  } catch {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    keychainSet(VAULT_KEY, "orbit", privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"));
    log("vault key created");
    return privateKey;
  }
}

const readVaultIndex = () => { try { return JSON.parse(readFileSync(vaultIndexFile, "utf8")); } catch { return []; } };
function writeVaultIndex(sites) {
  mkdirSync(engineDir, { recursive: true });
  writeFileSync(vaultIndexFile, JSON.stringify(sites, null, 2) + "\n");
}

/** Opens a sealed login: ECDH (P-256) with the phone's one-time key, HKDF-SHA256 to an AES-256-GCM key; the tag is the last 16 bytes. */
function openSealed(privateKey, { e, iv, c }) {
  const secret = diffieHellman({ privateKey, publicKey: createPublicKey({ key: Buffer.from(e, "base64"), format: "der", type: "spki" }) });
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "orbit-vault", 32));
  const data = Buffer.from(c, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(data.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString("utf8"));
}

let vault = null;
async function syncVault() {
  vault ??= { key: vaultKey(), publicKey: null, sent: false };
  vault.publicKey ??= createPublicKey(vault.key).export({ format: "der", type: "spki" }).toString("base64");
  let done = [];
  for (let round = 0; round < 5; round++) {
    const { items } = await call("/engine/vault", { publicKey: vault.sent ? null : vault.publicKey, sites: readVaultIndex(), done });
    vault.sent = true;
    if (!items?.length) return;
    done = [];
    let sites = readVaultIndex();
    for (const item of items) {
      try {
        const payload = JSON.parse(item.payload);
        const login = payload.op === "delete" ? payload : openSealed(vault.key, payload);
        const site = String(login.site ?? "");
        if (!SITE.test(site)) throw new Error("bad site");
        if (login.op === "delete") {
          try { execFileSync("security", ["delete-generic-password", "-s", `orbit-site:${site}`], { stdio: "ignore" }); } catch { /* already gone */ }
          sites = sites.filter((one) => one.site !== site);
          log("vault removed", site);
        } else if (login.op === "set" && typeof login.username === "string" && typeof login.password === "string") {
          try { execFileSync("security", ["delete-generic-password", "-s", `orbit-site:${site}`], { stdio: "ignore" }); } catch { /* new */ }
          keychainSet(`orbit-site:${site}`, login.username.slice(0, 200), login.password);
          sites = [...sites.filter((one) => one.site !== site), { site, username: login.username.slice(0, 200), updatedAt: new Date().toISOString() }];
          log("vault saved", site);
        }
      } catch (error) {
        log("vault item failed", item.id, short(error.message, 120));
      }
      done.push(item.id); // a box this key cannot open never will: drop it either way
    }
    writeVaultIndex(sites.sort((a, b) => a.site.localeCompare(b.site)));
  }
}

const VAULT_GUIDE = (sites) => `
[저장된 로그인]
- 사용자가 맡긴 사이트 로그인이에요. 로그인이 필요할 때만 쓴다. 비밀번호는 화면·답장·기억에 쓰지 않고, 명령 안에서 바로 넘긴다:
  $(security find-generic-password -s "orbit-site:<사이트>" -w)
${sites.map((one) => `- ${one.site}: 아이디 ${one.username}`).join("\n")}`;

// --- loop ----------------------------------------------------------------------

async function work(job) {
  const config = SATELLITES[job.satellite];
  log("job", job.id, job.satellite, job.kind);
  if (!config) return call("/engine/finish", { jobId: job.id, ok: false, text: "이 맥 엔진은 아직 이 위성을 몰라요." });
  ensureDirs(job.satellite);

  if (job.kind === "memory") {
    const name = job.payload?.name;
    if (name === "memory" || name === "goals") writeFileSync(join(dataDir(job.satellite), `${name}.md`), String(job.payload.body ?? ""));
    await call("/engine/finish", { jobId: job.id, ok: true, text: "saved" });
    return syncMemory();
  }
  if (job.kind === "action") {
    try {
      // Only the plugins' fixed code runs an approved action, never the model.
      const action = pluginAction(job.payload?.type);
      if (!action) throw new Error(`이 맥 엔진은 모르는 일이에요: ${job.payload?.type}`);
      const text = await action.run(job.payload?.action ?? {});
      await call("/engine/finish", { jobId: job.id, ok: true, text });
    } catch (error) {
      await call("/engine/finish", { jobId: job.id, ok: false, text: short(error.message, 300) });
    }
    return;
  }

  const controller = new AbortController();
  let last = 0;
  let lastText = "준비하는 중…";
  const send = (text) => call("/engine/progress", { jobId: job.id, text })
    .then((reply) => { if (reply.cancel) controller.abort(); })
    .catch((error) => log("progress failed", error.message));
  const progress = (text) => {
    lastText = text;
    if (Date.now() - last < PROGRESS_EVERY_MS) return;
    last = Date.now();
    send(text);
  };
  // A long step (a browser task, a slow command) sends nothing for minutes: repeat the last line so the
  // app keeps showing the Mac as online, the job's lease stays fresh, and a stop request still arrives.
  const heartbeat = setInterval(() => { if (Date.now() - last >= HEARTBEAT_MS) { last = Date.now(); send(lastText); } }, HEARTBEAT_MS);
  progress("준비하는 중…");
  try {
    job.localFiles = await fetchInbox(job);
    const engine = job.kind === "routine" ? CONFIG.routineEngine ?? config.chat : config.chat;
    const prompt = await buildPrompt(job, config);
    progress(`${ENGINE_NAME[engine]}가 일하는 중…`);
    const { answer, cancelled } = await adapters[engine](job, config, prompt, progress, controller.signal);
    if (cancelled) {
      await call("/engine/finish", { jobId: job.id, ok: true, text: "멈췄어요." });
      return;
    }
    const { text, actions, handoffs } = takeActions(answer);
    await call("/engine/finish", { jobId: job.id, ok: true, text: text || "넘겼어요.", files: takeOutbox(job.satellite), actions, handoffs }, 60_000);
    log("done", job.id);
  } catch (error) {
    log("failed", job.id, error.message);
    await call("/engine/finish", { jobId: job.id, ok: false, text: error.message }).catch((finishError) => log("finish failed", finishError.message));
  } finally {
    clearInterval(heartbeat);
    syncMemory().catch(() => {});
  }
}

async function main() {
  log(VERSION, "→", ORBIT_URL, "home", HOME);
  await loadPlugins();
  for (const id of Object.keys(SATELLITES)) ensureDirs(id);
  syncMemory().catch(() => {});
  pushSnapshots();
  setInterval(pushSnapshots, SNAPSHOT_EVERY_MS);
  const vaultTick = () => syncVault().catch((error) => log("vault sync failed", short(error.message, 200)));
  vaultTick();
  setInterval(vaultTick, VAULT_EVERY_MS);
  let backoff = 1000;
  for (;;) {
    try {
      const { job } = await call("/engine/poll", { version: VERSION });
      backoff = 1000;
      if (job) await work(job);
    } catch (error) {
      log("poll failed", error.message);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

main();
