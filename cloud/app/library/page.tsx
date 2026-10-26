import Link from "next/link";
import { FileText } from "lucide-react";
import { NotAllowed } from "@/components/not-allowed";
import { LibraryScreen } from "@/components/library-screen";
import { LibraryMessageLink } from "@/components/library-message";
import { UnpinButton } from "@/components/unpin-button";
import { getViewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { files, pinnedMessages, reports, type LibraryFile } from "@/lib/library";
import { loadListState } from "@/lib/list-state";
import { satelliteById, satellites } from "@/lib/satellites";
import { shortTime } from "@/lib/time";

type Tab = "pinned" | "reports" | "files";
const tabs: { id: Tab; label: string }[] = [{ id: "pinned", label: "고정" }, { id: "reports", label: "보고서" }, { id: "files", label: "파일" }];

function libraryHref(tab: Tab, satellite?: string) {
  const params = new URLSearchParams({ tab });
  if (satellite) params.set("s", satellite);
  return `/library?${params}`;
}

function FileMeta({ file }: { file: LibraryFile }) {
  return <span className="truncate text-[12px] text-app-muted">{Math.max(1, Math.round(file.size / 1024))}KB · {satelliteById(file.satellite)?.name ?? file.satellite} · {shortTime(file.createdAt)}</span>;
}

function ConversationLink({ file }: { file: LibraryFile }) {
  return file.messageId !== null ? <Link className="inline-flex min-h-11 min-w-0 items-center rounded-row px-2 text-[12px] text-app-muted no-underline active:bg-app-fill" href={`/s/${file.satellite}#m-${file.messageId}`}>대화에서 보기</Link> : null;
}

function FileList({ items }: { items: LibraryFile[] }) {
  const images = items.filter((file) => file.mime.startsWith("image/"));
  const documents = items.filter((file) => !file.mime.startsWith("image/"));
  return (
    <>
      {images.length ? <div aria-label="이미지" className="grid grid-cols-3 gap-2 px-2">
        {images.map((file) => <div className="grid min-w-0 content-start grid-cols-[minmax(0,1fr)]" key={file.id}>
          <a aria-label={file.name} className="block min-h-11 min-w-0 rounded-row active:opacity-70" href={`/files/${encodeURIComponent(file.id)}`}>
            {/* Files are served by the authenticated download route. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={file.name} className="aspect-square w-full rounded-row bg-app-fill object-cover" loading="lazy" src={`/files/${encodeURIComponent(file.id)}`} />
          </a>
          <span className="truncate pt-1 text-[13px] text-app-ink">{file.name}</span>
          <FileMeta file={file} />
          <ConversationLink file={file} />
        </div>)}
      </div> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {documents.map((file) => <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]" key={file.id}>
          <a className="flex min-h-[56px] min-w-0 items-center gap-3 rounded-row px-2 py-2 text-inherit no-underline active:bg-app-fill" href={`/files/${encodeURIComponent(file.id)}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-row bg-app-fill text-app-muted"><FileText aria-hidden="true" size={22} /></span>
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
              <span className="truncate text-[15px] font-semibold">{file.name}</span>
              <FileMeta file={file} />
            </span>
          </a>
          <div className="min-w-0 pl-[52px]"><ConversationLink file={file} /></div>
        </div>)}
      </div>
    </>
  );
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; s?: string | string[] }> }) {
  const viewer = await getViewer();
  if (!viewer) return <NotAllowed />;
  const params = await searchParams;
  const satellite = typeof params.s === "string" && satelliteById(params.s) ? params.s : undefined;
  const env = await getEnv();
  const [list, allPinned] = await Promise.all([loadListState(env, viewer.email), pinnedMessages(env)]);
  const tab: Tab = params.tab === "pinned" || params.tab === "reports" || params.tab === "files" ? params.tab : allPinned.length ? "pinned" : "reports";
  const pinned = satellite ? allPinned.filter((message) => message.satellite === satellite) : allPinned;
  const reportItems = tab === "reports" ? await reports(env, satellite) : [];
  const fileItems = tab === "files" ? await files(env, satellite) : [];
  const empty = tab === "pinned" ? !pinned.length : tab === "reports" ? !reportItems.length : !fileItems.length;
  return (
    <LibraryScreen active="library" list={list} title="보관함">
      <nav aria-label="보관함 종류" className="flex min-w-0 gap-1 px-2">
        {tabs.map((item) => <Link aria-current={tab === item.id ? "page" : undefined} className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-row px-3 text-[15px] no-underline active:bg-app-fill ${tab === item.id ? "bg-app-fill font-semibold text-app-ink" : "text-app-muted"}`} href={libraryHref(item.id, satellite)} key={item.id}>{item.label}</Link>)}
      </nav>
      <nav aria-label="위성 필터" className="flex min-w-0 gap-1 overflow-x-auto px-2">
        {[{ id: "", name: "전체" }, ...satellites].map((item) => <Link aria-current={(satellite ?? "") === item.id ? "true" : undefined} className={`flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] no-underline active:bg-app-fill ${(satellite ?? "") === item.id ? "bg-app-fill font-semibold text-app-ink" : "text-app-muted"}`} href={libraryHref(tab, item.id || undefined)} key={item.id}>{item.name}</Link>)}
      </nav>
      {tab === "pinned" ? <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">{pinned.map((message) => <div className="flex min-w-0 items-center gap-1" key={message.id}><LibraryMessageLink message={message} /><UnpinButton messageId={message.id} /></div>)}</div> : null}
      {tab === "reports" ? <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">{reportItems.map((message) => <LibraryMessageLink key={message.id} message={message} title={message.title} />)}</div> : null}
      {tab === "files" ? <FileList items={fileItems} /> : null}
      {empty ? <p className="m-0 px-2 py-6 text-[15px] text-app-muted">{tab === "pinned" ? "고정한 메시지가 없어요." : tab === "reports" ? "아직 보관된 보고서가 없어요." : "아직 주고받은 파일이 없어요."}</p> : null}
    </LibraryScreen>
  );
}
