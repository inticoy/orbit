# 플러그인

플러그인은 홈 폴더에 두는 ES 모듈 하나예요. `orbit.config.json`의 `"plugins": ["plugins/my.mjs"]`로 켜고, 바꾼 뒤에는 `./orbit engine`으로 엔진을 다시 띄워요. Node 24 맥 엔진 안에서 돌아요.

```js
export default async function plugin({ home, config, timezone, log, run, node }) {
  return { snapshots, context, actions, mcp }; // 모두 선택
}
```

`run`은 `promisify(execFile)`예요. `node`는 엔진의 Node 경로예요.

## snapshots: 대시보드

```js
async snapshots() {
  return {
    "<위성 id>": {
      observedAt: "2026-10-27T09:00:00Z",       // 데이터를 확인한 시각
      data: { ... },                             // 위성 프롬프트에만 들어가는 원래 숫자 (클라우드로 가지 않음)
      widget: { main: "7시간 10분", detail: "7일 평균 6시간 40분", tone: "ok", values: [6.5, 7, 7.2], valuesLabel: "7일 수면" },
      cards: [ /* 카드 */ ],
    },
  };
}
```

- 엔진은 10분마다 이 함수를 불러요. `widget`과 `cards`는 클라우드로 보내고, `data`는 맥에만 남겨요.
- 위성이 `"dashboard": true`이면 오늘 화면에 타일로, 위성 화면에 대시보드 탭으로 보여요.
- 위성의 `context`에 `dashboard:<id>`나 `dashboards`를 넣으면 `data`가 프롬프트에 들어가요.

**카드 종류**

위성이 채팅에서 ` ```orbit-card ` 블록으로 쓰는 카드와 같아요.

| type | 필드 |
|---|---|
| `metric` | `title`, `value`, `detail?`, `tone?` (`ok`·`warn`·`danger`) |
| `progress` | `title`, `value`, `current`, `max`, `detail?` |
| `list` | `title?`, `empty?`, `items: [{ label, detail?, meta?, mark?, tone?, group? }]` |
| `stat` | `title?`, `items: [{ label, value, detail? }]` |
| `bar`·`line`·`donut` | `title?`, `unit?`, `items: [{ label, value }]` |
| `table` | `title?`, `columns`, `rows` |
| `checklist` | `title?`, `items: [{ label, done }]` |

`list`의 `mark` 값은 `ok`(✓), `warn`(!), `dot`(점), `todo`(○)이고, `group`을 주면 그룹 제목으로 묶여요.

## context: 프롬프트에 붙일 글

```js
context: {
  "my-feed": async (job) => job.kind === "routine" ? await fetchFeed() : null, // null이면 안 붙임
}
```

위성의 `"context": ["my-feed"]`에 이름을 넣으면 `[my-feed]` 블록으로 붙어요. `job`에는 `kind`(`chat`·`routine`), `prompt`, `satellite`가 있어요.

## actions: 승인 후 실행하는 바깥 일

```js
actions: {
  "reminder.add": {
    guide: '{"type":"reminder.add","summary":"미리 알림: 우유 사기","payload":{"title":"우유 사기"}}',
    async run(payload) { /* ... */ return "추가했어요"; },
  },
}
```

- `actions`가 켜진 위성은 `guide` 예시를 보고 ` ```orbit-action ` 블록으로 제안해요.
- 폰에 승인 카드가 뜨고, 승인하면 엔진이 `run(payload)`를 실행해요. 모델이 직접 실행하지 않아요.
- `payload`는 모델이 만든 값이니 `run` 안에서 꼭 검사하세요.

## mcp: 데이터 도구

```js
mcp: { command: "/path/to/server", args: ["..."], env: { KEY: "value" } }
```

`"mcp": true`인 위성이 이 MCP 서버를 `orbit` 이름으로 써요. 읽기 전용으로 만드세요. Codex 루틴은 사람이 승인할 수 없어서, 도구 호출을 자동 승인해요.
