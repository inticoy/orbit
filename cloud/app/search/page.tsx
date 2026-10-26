import { Search } from "lucide-react";
import { NotAllowed } from "@/components/not-allowed";
import { LibraryScreen } from "@/components/library-screen";
import { LibraryMessageLink } from "@/components/library-message";
import { getViewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { searchMessages } from "@/lib/library";
import { loadListState } from "@/lib/list-state";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const viewer = await getViewer();
  if (!viewer) return <NotAllowed />;
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();
  const env = await getEnv();
  const [list, messages] = await Promise.all([loadListState(env, viewer.email), searchMessages(env, q)]);
  return (
    <LibraryScreen active="search" list={list} title="검색">
      <form action="/search" method="get" className="flex min-w-0 items-center gap-2 px-2">
        <input aria-label="메시지 검색" autoFocus className="min-h-11 min-w-0 flex-1 rounded-row bg-app-fill px-3 text-[16px] text-app-ink placeholder:text-app-muted" defaultValue={q} key={q} name="q" placeholder="메시지 검색" type="search" />
        <button aria-label="검색" className="grid size-11 shrink-0 place-items-center rounded-full text-app-ink active:bg-app-fill" type="submit"><Search aria-hidden="true" size={20} /></button>
      </form>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {messages.map((message) => <LibraryMessageLink key={message.id} message={message} query={q} />)}
        {!messages.length ? <p className="m-0 px-2 py-6 text-[15px] text-app-muted">{q ? "검색 결과가 없어요. 다른 검색어를 입력해 보세요." : "위성과 나눈 대화를 검색해 보세요."}</p> : null}
      </div>
    </LibraryScreen>
  );
}
