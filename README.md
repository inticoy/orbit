<p align="center">
  <img src="docs/icon.png" width="96" alt="Orbit">
</p>

<h1 align="center">Orbit</h1>

<p align="center">폰에서 대화하는 나만의 AI 위성들.<br>일은 내 맥의 Codex, Claude Code, Gemini가 하고, 답과 알림은 폰으로 와요.</p>

<br>

## 할 수 있는 것

| | |
|---|---|
| 대화 | 위성마다 따로 대화하고, 일하는 중에도 이어 보낼 수 있어요 |
| 기억 | 위성이 내 선호와 목표를 기억해요 |
| 루틴 | 정한 시각에 알아서 일하고, 새 소식이 있을 때만 알려요 |
| 위성끼리 | `@이름`으로 다른 위성을 부르고, 위성끼리 일을 넘겨요 |
| 대시보드 | 내 데이터를 오늘 화면에 카드로 보여 줘요 |
| 보관함 | 검색, 고정, 보고서와 파일 모아 보기 |
| 알림 | 웹 푸시, Face ID 로그인 |
| 로그인 정보 | 설정에서 사이트 아이디·비밀번호를 맥 Keychain에 넣어요. `full` 웹 위성이 로그인할 때 써요 |

기본 위성은 넷이에요.

| 위성 | 하는 일 |
|---|---|
| **Tars** | 심부름. 맥에서 직접 처리하고, 돈 드는 일은 먼저 물어봐요 |
| **Scouty** | 조사하고, "나오면 알려 줘"를 추적해요 |
| **Scoop** | 관심 분야 뉴스를 골라 줘요 |
| **Polaris** | 매일 아침 브리핑을 써요 |

건강, 가계부, 일정처럼 내 데이터가 필요한 위성은 [플러그인](docs/plugins.md)으로 더해요.

## 준비물

- 항상 켜 두는 맥
- Node 24.22.1 이상 (2026년 10월 보안 패치가 들어간 LTS), pnpm (`corepack enable pnpm`)
- Codex CLI, Claude Code, Gemini CLI 중 하나
  - Codex와 Claude Code는 설치하고 로그인
  - Gemini는 [AI Studio](https://aistudio.google.com/apikey) API 키로 써요 (무료 키도 돼요)
- Cloudflare 계정 (무료 플랜이면 돼요)

## 설치

```bash
git clone https://github.com/inticoy/orbit.git
cd orbit
./orbit setup
```

이메일과 시간대를 물어본 뒤 나머지는 알아서 해요.

1. Cloudflare에 로그인하고 데이터베이스를 만들어요
2. 알림 키와 엔진 토큰을 만들어 맥 Keychain에 넣어요 (Gemini를 쓰면 API 키도 물어봐요)
3. 웹 앱을 `orbit.<내 이름>.workers.dev`에 배포해요
4. 맥 엔진을 등록해요 (로그인하면 켜지고, 꺼지면 다시 켜져요)
5. 폰 로그인 코드를 보여 줘요

중간에 멈추면 다시 실행하세요. 끝난 단계는 건너뛰어요.

## 폰에 설치

1. 주소를 아이폰은 Safari, 안드로이드는 Chrome으로 열어요
2. 공유 버튼에서 **홈 화면에 추가**
3. 홈 화면의 Orbit을 열고 로그인 코드를 넣어요
4. 설정에서 Face ID와 알림을 켜요

코드는 48시간 동안 유효해요. 새 코드는 `./orbit invite`로 만들어요.

## 내 Orbit 꾸미기

설정은 모두 `home/` 폴더에 있어요. git에는 올라가지 않아요.

```text
home/
├─ orbit.config.json     위성, 루틴, 플러그인
├─ satellites/<id>/      위성 지시문 (AGENTS.md)
├─ plugins/              내 플러그인
└─ data/                 기억, 로그
```

```json
{
  "owner": "me@example.com",
  "timezone": "Asia/Seoul",
  "satellites": [
    "scouty",
    "polaris",
    { "id": "scoop", "engine": "claude" },
    { "id": "chef", "name": "Chef", "role": "요리", "color": "#ff9500", "shape": "heart", "web": true }
  ],
  "routines": [
    { "id": "chef-dinner", "satellite": "chef", "title": "저녁 메뉴",
      "prompt": "저녁 메뉴 두 개를 추천해 줘.", "times": "17:30", "weekdays": "1,2,3,4,5" }
  ]
}
```

<details>
<summary>위성 설정 항목</summary>

모든 위성에 한 번에 주려면 맨 위에 `"access": "full"`처럼 써요.

| 항목 | 뜻 |
|---|---|
| `id` | 영문 소문자. 기본 위성은 이름만 써도 돼요 |
| `name`, `role`, `intro` | 화면에 보이는 이름, 역할, 소개 한 줄 |
| `color` | 아바타 색 |
| `shape` | 아바타 모양: `rect` `circle` `pin` `drop` `heart` `star` `sparkle` `burst` `hexagon` `octagon` `chamfer` `magnifier`, 또는 CSS border-radius |
| `engine` | `codex`, `claude`, `gemini` |
| `access` | `safe` 자기 폴더에만 쓰기 (기본) / `full` 권한 확인 없이 맥에서 무엇이든 (Tars는 기본이 `full`) |
| `web` | 웹 검색 사용 |
| `mcp` | 플러그인의 데이터 도구 사용 |
| `context` | 프롬프트 앞에 붙일 것: `dashboards`, `dashboard:<id>`, `memory:<id>`, 플러그인 이름 |
| `actions` | 플러그인의 바깥 일 제안 (`true` 또는 `["reminder.add"]`) |
| `dashboard` | 오늘 화면과 대시보드 탭에 표시 |

</details>

<details>
<summary>루틴 설정 항목</summary>

| 항목 | 뜻 |
|---|---|
| `times` | `"07:30"` 또는 `"09:00,18:00"` |
| `weekdays` | `"1,2,3,4,5"` (0이 일요일). 없으면 매일 |
| `notify` | `change` 새 소식만 알림 / `always` 항상 / `never` 안 함 |
| `remove` | `true`면 기본 루틴을 빼요 |

기본 위성의 루틴은 같은 `id`로 덮어쓸 수 있어요.

</details>

바꾼 뒤에는 이렇게 적용해요.

| 명령 | 언제 |
|---|---|
| `./orbit deploy` | 위성, 루틴, 화면을 바꿨을 때 |
| `./orbit engine` | 엔진 설정이나 플러그인을 바꿨을 때 |
| `./orbit key gemini` | Gemini API 키를 넣거나 바꿀 때 |
| `./orbit doctor` | 상태가 궁금할 때 |

## 보안

- 앱에는 설정한 이메일 한 명만 들어올 수 있어요
- 맥은 밖으로만 연결해요. 열어 두는 포트가 없어요
- 비밀값은 맥 Keychain과 Cloudflare에만 있어요
- 위성은 기본으로 자기 폴더에만 쓸 수 있어요. `"access": "full"`을 주면 셸과 파일을 마음대로 써요
- 로그인 정보는 폰에서 엔진의 공개키로 암호화돼 맥에서만 풀려요. Cloudflare에는 사이트와 아이디만 남아요
- 플러그인의 바깥 일은 폰에서 승인해야 실행돼요
- 플러그인의 원본 데이터는 맥에 남아요. 클라우드에는 카드와 대화만 올라가요

## 구조

```text
폰 ──── Cloudflare Worker + D1 ──── 맥 엔진 ──── codex / claude / gemini
        cloud/                      engine/
```

| 폴더 | 내용 |
|---|---|
| `cloud/` | 웹 앱 (Next.js 16.4, React 19.3, Cloudflare Workers) |
| `engine/` | 맥 엔진. Codex, Claude Code, Gemini CLI를 실행 (Node 24, 의존성 없음) |
| `satellites/` | 기본 위성 (Tars, Scouty, Scoop, Polaris) |
| `cli/` | `./orbit` 명령 |
| `example/` | 처음 만들어지는 home 폴더, 플러그인 예시 |
