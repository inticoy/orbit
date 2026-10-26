// ./orbit — sets up, deploys and runs your own Orbit. Every step is safe to run again:
// it skips what is already done. Secrets go straight into the Mac Keychain and the
// Worker; they are never printed. No dependencies: Node 24 only.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomInt, webcrypto } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { CORE, configPath, homeDir, readConfig, rememberHome, resolveConfig, siteJson, updateConfig } from "./config.mjs";

const CLOUD = join(CORE, "cloud");
const say = (text = "") => console.log(text);
const step = (text) => console.log(`\n▸ ${text}`);
const fail = (text) => {
  console.error(`\n✕ ${text}`);
  process.exit(1);
};

// --- small helpers ----------------------------------------------------------------

function which(command) {
  const result = spawnSync("/bin/zsh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split("\n").pop() : null;
}

/** Runs a command in cloud/ with the output shown; returns stdout too when `capture`. */
function sh(command, args, { capture = false, input, cwd = CLOUD } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` }, stdio: [input === undefined ? "inherit" : "pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (!capture) process.stdout.write(chunk);
    });
    if (input !== undefined) child.stdin.end(input);
    child.on("close", (code) => code === 0 ? done(out) : reject(new Error(`${command} ${args[0] ?? ""} 실패 (${code})`)));
  });
}
const wrangler = (args, options) => sh(join(CLOUD, "node_modules", ".bin", "wrangler"), args, options);

const keychain = {
  get(service) {
    const result = spawnSync("security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : null;
  },
  set(service, value) {
    execFileSync("security", ["add-generic-password", "-U", "-a", "orbit", "-s", service, "-w", value]);
  },
};

const services = (config) => ({ engine: config.keychain?.engineToken ?? "orbit-engine-token", vapid: config.keychain?.vapidPrivateKey ?? "orbit-vapid-private-jwk", gemini: config.keychain?.geminiApiKey ?? "orbit-gemini-api-key" });
const label = (config) => config.launchd ?? "com.orbit.engine";

async function ask(question, fallback = "") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(fallback ? `${question} (${fallback}) ` : `${question} `)).trim();
  rl.close();
  return answer || fallback;
}

/** Reads a line without echoing it (for API keys). */
async function askSecret(question) {
  process.stdout.write(question + " ");
  spawnSync("stty", ["-echo"], { stdio: "inherit" });
  try {
    const rl = createInterface({ input: process.stdin });
    const answer = await new Promise((done) => rl.once("line", done));
    rl.close();
    return answer.trim();
  } finally {
    spawnSync("stty", ["echo"], { stdio: "inherit" });
    process.stdout.write("\n");
  }
}

/** The Gemini API key (Google AI Studio → Get API key), kept in the Keychain for the engine. */
async function ensureGeminiKey(home, force = false) {
  const config = readConfig(home);
  const usesGemini = resolveConfig(config).satellites.some((one) => one.engine === "gemini");
  const service = services(config).gemini;
  if (!force && (!usesGemini || keychain.get(service))) return;
  step("Gemini API 키");
  say("  https://aistudio.google.com/apikey 에서 만든 키를 붙여 넣어요. 화면에는 보이지 않아요.");
  const key = await askSecret("  키:");
  if (!/^[\w-]{20,}$/.test(key)) fail("키 모양이 이상해요. 다시 ./orbit key gemini");
  keychain.set(service, key);
  say(`  Keychain ${service}에 넣었어요.`);
}

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

// --- steps --------------------------------------------------------------------------

function checkTools() {
  step("필요한 도구 확인");
  if (process.platform !== "darwin") fail("맥에서만 돌아가요 (엔진이 launchd와 Keychain을 써요).");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 24) fail(`Node 24 이상이 필요해요. 지금은 ${process.versions.node}.`);
  // 24.22.1 has the October 2026 security fixes (Brotli RCE, TLS hostname checks).
  const [, minor, patch] = process.versions.node.split(".").map(Number);
  if (major === 24 && (minor < 22 || (minor === 22 && patch < 1))) say(`  ! Node ${process.versions.node}는 보안 패치 전이에요. 24.22.1 이상으로 올려 주세요.`);
  if (!which("pnpm")) fail("pnpm이 없어요: corepack enable && corepack prepare pnpm@latest --activate");
  const engines = ["codex", "claude", "gemini"].filter(which);
  if (!engines.length) fail("Codex CLI(codex), Claude Code(claude), Gemini CLI(gemini) 중 하나는 설치해 두세요. Gemini는 API 키로 써요.");
  say(`  Node ${process.versions.node} · pnpm · ${engines.join(", ")}`);
  return engines;
}

async function ensureHome(engines) {
  const given = flag("home");
  const home = given ? resolve(given.replace(/^~/, homedir())) : homeDir();
  rememberHome(home);
  step(`홈 폴더: ${home}`);
  if (existsSync(configPath(home))) return home;
  mkdirSync(home, { recursive: true });
  cpSync(join(CORE, "example"), home, { recursive: true });
  const owner = await ask("로그인할 이메일:");
  if (!owner.includes("@")) fail("이메일이 필요해요.");
  const timezone = await ask("시간대:", Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul");
  const config = readConfig(home);
  // Without Codex, the built-ins run on whichever engine this Mac has.
  if (!engines.includes("codex")) config.satellites = config.satellites.map((one) => typeof one === "string" ? { id: one, engine: engines[0] } : { ...one, engine: engines[0] });
  writeFileSync(configPath(home), `${JSON.stringify({ ...config, owner: owner.toLowerCase(), timezone }, null, 2)}\n`);
  say(`  ${configPath(home)} 를 만들었어요. 위성과 루틴은 여기서 고치면 돼요.`);
  return home;
}

async function installCloud() {
  if (existsSync(join(CLOUD, "node_modules", ".bin", "wrangler"))) return;
  step("웹 앱 패키지 설치");
  await sh("pnpm", ["install", "--frozen-lockfile"]);
}

async function cloudflareLogin() {
  step("Cloudflare 계정");
  try {
    await wrangler(["whoami"], { capture: true });
  } catch {
    say("  브라우저에서 Cloudflare에 로그인해 주세요.");
    await wrangler(["login"]);
  }
}

async function ensureDatabase(home) {
  const config = readConfig(home);
  const cloudflare = { worker: "orbit", database: "orbit", ...config.cloudflare };
  if (cloudflare.databaseId) return;
  step(`D1 데이터베이스 "${cloudflare.database}"`);
  const find = async () => JSON.parse(await wrangler(["d1", "list", "--json"], { capture: true })).find((db) => db.name === cloudflare.database);
  let db = await find();
  if (!db) {
    await wrangler(["d1", "create", cloudflare.database], { capture: true });
    db = await find();
  }
  if (!db?.uuid) fail("D1 데이터베이스를 만들지 못했어요.");
  updateConfig(home, { cloudflare: { ...cloudflare, databaseId: db.uuid } });
  say(`  ${db.uuid}`);
}

async function ensureKeys(home) {
  const config = readConfig(home);
  const names = services(config);
  if (!config.vapidPublicKey || !keychain.get(names.vapid)) {
    step("푸시 알림 키 만들기");
    const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const raw = Buffer.from(await webcrypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
    keychain.set(names.vapid, JSON.stringify(await webcrypto.subtle.exportKey("jwk", pair.privateKey)));
    updateConfig(home, { vapidPublicKey: raw });
    say(`  Keychain ${names.vapid}`);
  }
  if (!keychain.get(names.engine)) {
    step("맥 엔진 토큰 만들기");
    keychain.set(names.engine, randomBytes(32).toString("base64url"));
    say(`  Keychain ${names.engine}`);
  }
}

/** Writes cloud/orbit.site.json and cloud/wrangler.jsonc from the config. */
function build(home) {
  const resolved = resolveConfig(readConfig(home));
  if (!resolved.owner) fail("orbit.config.json에 owner(로그인 이메일)가 없어요.");
  const cloudflare = { worker: "orbit", database: "orbit", ...resolved.cloudflare };
  writeFileSync(join(CLOUD, "orbit.site.json"), `${JSON.stringify(siteJson(resolved), null, 2)}\n`);
  const values = { worker: cloudflare.worker, database: cloudflare.database, databaseId: cloudflare.databaseId ?? "", owner: resolved.owner, vapidPublicKey: resolved.vapidPublicKey ?? "" };
  const template = readFileSync(join(CLOUD, "wrangler.template.jsonc"), "utf8");
  writeFileSync(join(CLOUD, "wrangler.jsonc"), template.replace(/\{\{(\w+)\}\}/g, (_whole, key) => JSON.stringify(values[key]).slice(1, -1)));
  return resolved;
}

const sql = (value) => value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;

/** Makes the routines table match the config. Keeps on/off and run times for routines that stay. */
async function syncRoutines(home) {
  const { routines } = resolveConfig(readConfig(home));
  step(`루틴 맞추기 (${routines.length}개)`);
  const statements = routines.map((r) => `INSERT INTO routines (id, satellite, title, prompt, times, weekdays, notify) VALUES (${[r.id, r.satellite, r.title, r.prompt, r.times, r.weekdays, r.notify].map(sql).join(", ")})
    ON CONFLICT (id) DO UPDATE SET satellite = excluded.satellite, title = excluded.title, prompt = excluded.prompt, notify = excluded.notify,
    next_run_at = CASE WHEN routines.times IS excluded.times AND routines.weekdays IS excluded.weekdays THEN routines.next_run_at ELSE NULL END,
    times = excluded.times, weekdays = excluded.weekdays;`);
  statements.push(`DELETE FROM routines WHERE id NOT IN (${routines.map((r) => sql(r.id)).join(", ") || "''"});`);
  const file = join(CLOUD, ".wrangler", "routines.sql");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, statements.join("\n"));
  await wrangler(["d1", "execute", "DB", "--remote", "--file", file, "-y"], { capture: true });
}

async function deploy(home) {
  build(home);
  step("데이터베이스 마이그레이션");
  await wrangler(["d1", "migrations", "apply", "DB", "--remote"], { input: "y\n" });
  step("배포 (몇 분 걸려요)");
  const out = await sh("pnpm", ["run", "deploy"]);
  const url = out.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
  const config = readConfig(home);
  if (url && url !== config.cloudflare?.url) {
    updateConfig(home, { cloudflare: { ...config.cloudflare, url } });
    build(home); // the push sender and invite links use the address
    say(`\n  주소: ${url} (설정에 적었어요, 주소가 바뀌어 한 번 더 배포해요)`);
    await sh("pnpm", ["run", "deploy"], { capture: true });
  }
  await putSecrets(home);
  await syncRoutines(home);
}

async function putSecrets(home) {
  const config = readConfig(home);
  const names = services(config);
  const existing = new Set(JSON.parse(await wrangler(["secret", "list", "--format", "json"], { capture: true }).catch(() => "[]")).map((one) => one.name));
  for (const [secret, service] of [["VAPID_PRIVATE_JWK", names.vapid], ["ENGINE_TOKEN", names.engine]]) {
    if (existing.has(secret) && !process.argv.includes("--secrets")) continue;
    step(`Worker 비밀값 ${secret}`);
    const value = keychain.get(service);
    if (!value) fail(`Keychain에 ${service}가 없어요.`);
    await wrangler(["secret", "put", secret], { input: value, capture: true });
  }
}

/** Installs the engine as a LaunchAgent that starts at login and restarts if it stops. */
function installEngine(home) {
  const config = readConfig(home);
  const name = label(config);
  step(`맥 엔진 (${name})`);
  const path = [...new Set([dirname(process.execPath), ...["codex", "claude", "gemini", "gh", "gws"].map(which).filter(Boolean).map(dirname),
    join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"])].join(":");
  const log = join(home, "data", "logs", "engine.log");
  mkdirSync(dirname(log), { recursive: true });
  const xml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(name)}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(process.execPath)}</string><string>${xml(join(CORE, "engine", "engine.mjs"))}</string></array>
  <key>WorkingDirectory</key><string>${xml(home)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>ORBIT_HOME</key><string>${xml(home)}</string><key>PATH</key><string>${xml(path)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
  const file = join(homedir(), "Library", "LaunchAgents", `${name}.plist`);
  const domain = `gui/${process.getuid()}`;
  spawnSync("launchctl", ["bootout", `${domain}/${name}`]);
  writeFileSync(file, plist);
  // bootout finishes in the background; bootstrap fails (error 5) until the old one is gone.
  for (let tries = 0; ; tries++) {
    if (spawnSync("launchctl", ["bootstrap", domain, file]).status === 0) break;
    if (tries === 10) fail(`launchctl bootstrap ${file} 실패`);
    spawnSync("sleep", ["1"]);
  }
  say(`  켜졌어요. 로그: ${log}`);
}

async function invite(home, email) {
  const config = readConfig(home);
  const to = (email ?? config.owner ?? "").toLowerCase();
  if (!to.includes("@")) fail("이메일이 필요해요: ./orbit invite you@example.com");
  if (!config.cloudflare?.url) fail("아직 배포하지 않았어요: ./orbit setup");
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
  const raw = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const hash = createHash("sha256").update(raw).digest("base64url");
  const expires = new Date(Date.now() + 48 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  build(home);
  await wrangler(["d1", "execute", "DB", "--remote", "--command", `INSERT INTO invites (code_hash, email, expires_at) VALUES (${sql(hash)}, ${sql(to)}, ${sql(expires)})`], { capture: true });
  const code = raw.match(/.{4}/g).join("-");
  say(`\n폰에서 로그인하기 (48시간 안에)
  1. 폰 Safari(아이폰)나 Chrome(안드로이드)으로 ${config.cloudflare.url} 를 열어요.
  2. 아이폰: 공유 → 홈 화면에 추가. 안드로이드: ⋮ → 홈 화면에 추가.
  3. 홈 화면의 Orbit을 열고 코드 ${code} 를 넣어요.
     (또는 링크: ${config.cloudflare.url}/login?code=${code})
  4. 설정에서 Face ID(패스키)와 알림을 켜요.`);
}

async function doctor(home) {
  const config = readConfig(home);
  const resolved = resolveConfig(config);
  const names = services(config);
  const check = (ok, text) => say(`  ${ok ? "✓" : "✕"} ${text}`);
  step(`점검 (${home})`);
  check(Number(process.versions.node.split(".")[0]) >= 24, `Node ${process.versions.node}`);
  for (const engine of new Set(resolved.satellites.map((one) => one.engine))) check(!!which(engine), `${engine} CLI`);
  if (resolved.satellites.some((one) => one.engine === "gemini")) check(!!keychain.get(names.gemini), `Keychain ${names.gemini} (Gemini API 키)`);
  check(!!config.owner, `로그인 이메일 ${config.owner ?? "없음"}`);
  check(!!config.cloudflare?.url, `주소 ${config.cloudflare?.url ?? "없음 (배포 전)"}`);
  check(!!keychain.get(names.engine), `Keychain ${names.engine}`);
  check(!!keychain.get(names.vapid), `Keychain ${names.vapid}`);
  const listed = spawnSync("launchctl", ["print", `gui/${process.getuid()}/${label(config)}`], { encoding: "utf8" });
  check(listed.status === 0 && /state = running/.test(listed.stdout), `맥 엔진 ${label(config)} 실행 중`);
  for (const path of config.plugins ?? []) check(existsSync(resolve(home, path)), `플러그인 ${path}`);
  say(`  위성: ${resolved.satellites.map((one) => `${one.name}(${one.engine})`).join(", ")} · 루틴 ${resolved.routines.length}개`);
}

// --- commands -----------------------------------------------------------------------

const HELP = `./orbit <명령>
  setup [--home <폴더>]   처음 설치: 설정 → Cloudflare 배포 → 맥 엔진 → 폰 로그인 코드
  deploy                  설정을 바꾼 뒤 다시 배포 (위성, 루틴, 앱)
  engine                  맥 엔진 다시 설치·재시작 (위성 설정·플러그인을 바꾼 뒤)
  invite [이메일]          폰 로그인 코드 새로 만들기
  key gemini              Gemini API 키 넣기·바꾸기
  sync                    루틴만 맞추기
  build                   웹 앱 설정 파일만 만들기 (개발용)
  doctor                  상태 점검`;

const command = process.argv[2];
try {
  if (command === "setup") {
    const engines = checkTools();
    const home = await ensureHome(engines);
    await installCloud();
    await cloudflareLogin();
    await ensureDatabase(home);
    await ensureKeys(home);
    await ensureGeminiKey(home);
    await deploy(home);
    installEngine(home);
    await invite(home);
    say("\n끝났어요. 위성을 바꾸려면 orbit.config.json을 고치고 ./orbit deploy && ./orbit engine.");
  } else if (command === "deploy") {
    const home = homeDir();
    await installCloud();
    await deploy(home);
    say("\n배포했어요. 엔진 쪽 설정(위성, 플러그인)이 바뀌었다면 ./orbit engine 도 해 주세요.");
  } else if (command === "engine") installEngine(homeDir());
  else if (command === "invite") await invite(homeDir(), process.argv[3]);
  else if (command === "key" && process.argv[3] === "gemini") {
    await ensureGeminiKey(homeDir(), true);
    say("엔진에 반영하려면 ./orbit engine");
  }
  else if (command === "sync") await syncRoutines(homeDir());
  else if (command === "build") build(homeDir());
  else if (command === "doctor") await doctor(homeDir());
  else say(HELP);
} catch (error) {
  fail(error.message);
}
