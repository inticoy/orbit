<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mobile web first

Orbit은 폰(iOS 홈 화면 앱)과 맥 브라우저에서 쓴다. 넓은 화면은 Grok Bot식 세 칸(목록·대화·패널), 폰은 한 칸씩. UI를 바꿀 때마다 dvh, safe-area 여백, 16px 이상 입력, 가로 넘침 금지, 제목·버튼 한 줄, :active 누름 표시를 챙긴다.
