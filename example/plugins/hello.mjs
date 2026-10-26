// An example plugin. Turn it on with "plugins": ["plugins/hello.mjs"] in orbit.config.json
// and a satellite { "id": "hello", "name": "Hello", "role": "예시", "dashboard": true,
// "context": ["hello-note"], "actions": true }. See docs/plugins.md.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export default async function plugin({ home, timezone }) {
  return {
    // Dashboards, by satellite id. widget = the 오늘 tile, cards = the 대시보드 tab,
    // data = raw numbers the satellites see in their prompt (never sent to the cloud).
    async snapshots() {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
      return {
        hello: {
          observedAt: new Date().toISOString(),
          data: { hour },
          widget: { main: `${hour}시`, detail: "예시 대시보드" },
          cards: [
            { type: "metric", title: "지금", value: `${hour}시`, detail: "플러그인이 보낸 숫자" },
            { type: "list", title: "할 일", items: [{ label: "orbit.config.json 열어 보기", mark: "todo" }] },
          ],
        },
      };
    },
    // Extra text put in front of a satellite's prompt when its "context" lists the name. Return null to skip.
    context: {
      "hello-note": async (job) => job.kind === "routine" ? "루틴으로 실행됐어요." : null,
    },
    // Things a satellite may propose; they run only after you approve on the phone.
    actions: {
      "note.save": {
        guide: '{"type":"note.save","summary":"메모 저장: 장보기","payload":{"text":"우유, 계란"}}',
        async run(payload) {
          const text = String(payload.text ?? "").slice(0, 2000);
          writeFileSync(join(home, "data", `note-${Date.now()}.txt`), text);
          return "메모를 저장했어요.";
        },
      },
    },
    // Optional data tools (an MCP server) for satellites with "mcp": true.
    // mcp: { command: "/path/to/server", args: [], env: {} },
  };
}
