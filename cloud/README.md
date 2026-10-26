# Orbit cloud

Orbit의 앞단. 폰·맥 브라우저에서 위성과 대화하는 PWA와, 맥 엔진(`../engine`)이 일을 받아 가는 대기열.

```text
폰·맥 브라우저 ── Worker (Next.js 16 + OpenNext) ── D1
                    ├ /api/auth/*  로그인 (초대 코드, 패스키)
                    └ /engine/*    맥 엔진 전용 (ENGINE_TOKEN): poll(롱폴링) · progress · finish · snapshot · memory
맥 엔진 (launchd) ── 밖으로만 연결, codex / claude / gemini 헤드리스 실행
```

- 위성 목록·주소·시간대는 `orbit.site.json`, Worker 설정은 `wrangler.jsonc`. 둘 다 `../orbit build`가 홈 폴더의 `orbit.config.json`으로 만들고 git에 넣지 않는다.
- 배포는 `../orbit deploy` (빌드, 마이그레이션, 배포, 루틴 맞추기).
- 로컬: `.dev.vars`에 `DEV_VIEWER_EMAIL=<email>`을 두고 `pnpm db:migrate:local && npx next dev -p 8791`.

## 비밀값

| 이름 | 위치 |
|---|---|
| `VAPID_PRIVATE_JWK` | Worker secret, 맥 Keychain (`orbit-vapid-private-jwk`) |
| `ENGINE_TOKEN` | Worker secret, 맥 Keychain (`orbit-engine-token`, 맥 엔진이 읽음) |
