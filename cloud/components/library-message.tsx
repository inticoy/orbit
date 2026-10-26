import Link from "next/link";
import { Avatar, OrbitMark } from "@/components/avatar";
import type { LibraryMessage } from "@/lib/library";
import { plain } from "@/lib/message-preview";
import { satelliteById } from "@/lib/satellites";
import { shortTime } from "@/lib/time";

function Preview({ body, query, mine }: { body: string; query?: string; mine: boolean }) {
  const text = plain(body);
  const match = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  const start = match < 0 ? 0 : Math.max(0, match - 30);
  const end = Math.min(text.length, Math.max(start + 80, match + (query?.length ?? 0)));
  const snippet = text.slice(start, end);
  const offset = match - start;
  return (
    <span className="line-clamp-2 break-words text-[13px] text-app-muted">
      {mine ? "나: " : ""}
      {start > 0 ? "…" : ""}
      {match >= 0 && query ? <>{snippet.slice(0, offset)}<span className="font-semibold text-app-ink">{snippet.slice(offset, offset + query.length)}</span>{snippet.slice(offset + query.length)}</> : snippet || "첨부 파일 메시지"}
      {end < text.length ? "…" : ""}
    </span>
  );
}

export function LibraryMessageLink({ message, query, title }: { message: LibraryMessage; query?: string; title?: string }) {
  const satellite = satelliteById(message.satellite);
  return (
    <Link className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-row px-2 py-2 text-inherit no-underline active:bg-app-fill" href={`/s/${message.satellite}#m-${message.id}`}>
      {satellite ? <Avatar satellite={satellite} size={40} /> : <OrbitMark size={40} tight />}
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{satellite?.name ?? message.satellite}</span>
          <span className="shrink-0 text-[12px] text-app-muted">{shortTime(message.createdAt)}</span>
        </span>
        {title ? <span className="truncate text-[15px] font-semibold">{title}</span> : null}
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <Preview body={message.body} mine={message.role === "me"} query={query} />
        </span>
      </span>
    </Link>
  );
}
