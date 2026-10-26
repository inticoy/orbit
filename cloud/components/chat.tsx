"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, Copy, FileText, Paperclip, Pin, PinOff, RotateCcw, SmilePlus, Square, X } from "lucide-react";
import { cancelJob, decideApproval, pollFeed, retryLast, sendToSatellite, setReaction } from "@/app/actions";
import { setPinned } from "@/app/library/actions";
import { HtmlFrame, RichText } from "@/components/rich-text";
import type { Approval, Feed, FileInfo, JobState, Mark, Message, NewFile } from "@/lib/conversations";
import { REACTIONS } from "@/lib/reactions";
import { satelliteById, satellites } from "@/lib/satellites";
import { dayLabel } from "@/lib/time";

const FAST_MS = 1500;
const SLOW_MS = 15_000;
const GAP_MS = 30 * 60_000;
const MAX_BASE64 = 1_350_000;

type Draft = { name: string; mime: string; base64: string; preview?: string };
type Pending = { key: number; body: string; files: Draft[] };

/**
 * One satellite's conversation. While a job is waiting or running it polls every
 * 1.5s for progress and the answer; otherwise every 15s, and at once when the
 * app comes back on screen. My message shows at once and is replaced when the
 * server has it.
 */
export function Chat({ satelliteId, name, color, ready, initial }: { satelliteId: string; name: string; color: string; ready: boolean; initial: Feed }) {
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [approvals, setApprovals] = useState<Map<string, Approval>>(() => new Map(initial.approvals.map((a) => [a.id, a])));
  const [job, setJob] = useState<JobState | null>(initial.job);
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startTransition] = useTransition();
  const lastId = useRef(initial.messages.at(-1)?.id ?? 0);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const hadJob = useRef(!!initial.job);

  const refresh = useCallback(async () => {
    const feed = await pollFeed(satelliteId, lastId.current).catch(() => null);
    if (!feed) return;
    const marks = new Map<number, Mark>(feed.marks.map((mark) => [mark.id, mark]));
    if (feed.messages.length) lastId.current = feed.messages.at(-1)!.id;
    // New messages go on the end; reactions and waiting states of recent ones update in place.
    setMessages((current) => [
      ...current.map((message) => marks.has(message.id) ? { ...message, ...marks.get(message.id) } : message),
      ...feed.messages.filter((message) => !current.some((known) => known.id === message.id)),
    ]);
    if (feed.messages.some((message) => message.role === "me")) setPending(null);
    setApprovals(new Map(feed.approvals.map((a) => [a.id, a])));
    setJob(feed.job);
  }, [satelliteId]);

  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, job || pending ? FAST_MS : SLOW_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [job, pending, refresh]);

  // When a job ends, refresh the server parts (header status, list) too.
  useEffect(() => {
    if (hadJob.current && !job) router.refresh();
    hadJob.current = !!job;
  }, [job, router]);

  // Opened from search or the library (#m-123): show that message once instead of the bottom.
  const jumped = useRef(false);
  useEffect(() => {
    const target = !jumped.current && /^#m-\d+$/.test(location.hash) ? document.getElementById(location.hash.slice(1)) : null;
    jumped.current = true;
    if (target) {
      target.scrollIntoView({ block: "center" });
      target.dataset.flash = "1";
      setTimeout(() => { delete target.dataset.flash; }, 1600);
      return;
    }
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, job?.progress, pending]);

  // Grow the textarea with its text, up to the max height.
  useEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [text]);

  const busy = !!job || !!pending;
  // Sending while it works is fine: the message waits and goes out when the current job ends.
  const hasDraft = !!text.trim() || drafts.length > 0;
  const canSend = ready && !sending && !pending && hasDraft;
  const mentionQuery = /^@(\S*)$/.exec(text)?.[1]?.toLowerCase();
  const mentionable = mentionQuery === undefined ? [] : satellites.filter((one) => one.ready && one.id !== satelliteId && (one.name.toLowerCase().startsWith(mentionQuery) || one.id.startsWith(mentionQuery)));

  const send = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    const body = text.trim();
    const files = drafts;
    setError(null);
    setPending({ key: Date.now(), body, files });
    setText("");
    setDrafts([]);
    startTransition(async () => {
      const result = await sendToSatellite(satelliteId, body, files.map(({ name: fileName, mime, base64 }): NewFile => ({ name: fileName, mime, base64 })))
        .catch(() => ({ error: "보내지 못했어요. 다시 시도해 주세요." }));
      if ("error" in result) {
        setPending(null);
        setText(body);
        setDrafts(files);
        setError(result.error);
        return;
      }
      await refresh();
    });
  };

  const pick = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const next: Draft[] = [];
    for (const file of Array.from(list).slice(0, 4 - drafts.length)) {
      try {
        next.push(await toDraft(file));
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "파일을 읽지 못했어요.");
      }
    }
    setDrafts((current) => [...current, ...next].slice(0, 4));
    if (fileInput.current) fileInput.current.value = "";
  };

  const stop = () => startTransition(async () => { await cancelJob(satelliteId); await refresh(); });
  const retry = () => startTransition(async () => {
    const result = await retryLast(satelliteId);
    if ("error" in result) setError(result.error);
    await refresh();
  });
  const patch = (id: number, change: Partial<Message>) => setMessages((current) => current.map((message) => message.id === id ? { ...message, ...change } : message));
  const react = (id: number, emoji: string | null) => {
    patch(id, { myReaction: emoji });
    setReaction(id, emoji).catch(() => setError("반응을 남기지 못했어요."));
  };
  const pin = (id: number, pinned: boolean) => {
    patch(id, { pinned: pinned ? 1 : 0 });
    setPinned(id, pinned).catch(() => setError("고정하지 못했어요."));
  };
  const decide = (id: string, approve: boolean) => startTransition(async () => {
    const result = await decideApproval(id, approve);
    if ("error" in result) setError(result.error);
    await refresh();
  });

  const placeholder = !ready ? `${name}은(는) 아직 준비 중이에요` : busy ? "이어서 보내면 지금 일이 끝나고 전달돼요" : `${name}에게 메시지 · @로 다른 위성`;
  const lastError = messages.at(-1)?.role === "error";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-2 px-[max(12px,env(safe-area-inset-left))] pt-2 pb-4 md:px-6">
        {messages.length === 0 && !busy ? (
          <p className="m-auto max-w-[320px] py-16 text-center text-[15px] leading-relaxed text-app-muted">
            {ready ? `${name}에게 말을 걸어 보세요. 내 맥에서 일하고, 끝나면 알림으로 알려 줘요.` : "다음 단계에서 이 위성이 일을 시작해요."}
          </p>
        ) : null}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const divider = !previous || Date.parse(message.createdAt) - Date.parse(previous.createdAt) > GAP_MS;
          return (
            <div className="contents" key={message.id}>
              {divider ? <span className="self-center py-2 text-[12px] text-app-muted" suppressHydrationWarning>{dayLabel(message.createdAt)}</span> : null}
              <div className={`flex scroll-mt-24 flex-col rounded-[20px] transition-colors duration-700 data-[flash]:bg-app-fill ${message.role === "me" ? "items-end" : "items-start"} ${message.role !== "me" && message.id > (initial.messages.at(-1)?.id ?? 0) ? "anim-rise" : ""}`} id={`m-${message.id}`}>
                {message.role === "approval" ? (
                  <ApprovalCard approval={message.approvalId ? approvals.get(message.approvalId) : undefined} disabled={sending} fallback={message.body} onDecide={decide} />
                ) : message.role === "handoff" ? (
                  <Handoff message={message} />
                ) : (
                  <Bubble message={message} onPin={pin} onReact={react} />
                )}
              </div>
            </div>
          );
        })}
        {pending ? (
          <div className="anim-rise flex flex-col items-end" key={pending.key}>
            <PendingBubble pending={pending} />
          </div>
        ) : null}
        {job ? (
          <div className="anim-rise mt-2 flex max-w-full items-center gap-2 self-start px-1 py-1 text-[13px] text-app-muted" role="status">
            <span className="relative grid size-4 shrink-0 place-items-center"><span className="absolute size-4 animate-ping rounded-full opacity-40" style={{ background: color }} /><span className="size-2.5 rounded-full" style={{ background: color }} /></span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{job.status === "queued" ? "맥 엔진을 기다리는 중…" : job.progress ?? "생각하는 중…"}</span>
          </div>
        ) : null}
        {lastError && !busy ? (
          <button className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full bg-app-fill px-3 text-[13px] font-semibold active:scale-95" disabled={sending} onClick={retry} type="button">
            <RotateCcw aria-hidden="true" size={14} />다시 보내기
          </button>
        ) : null}
        <div className="h-px" ref={bottom} />
      </div>

      <form className="sticky bottom-0 border-t border-app-line bg-app-bg px-[max(12px,env(safe-area-inset-left))] pt-2 pb-[calc(10px+env(safe-area-inset-bottom))] focus-within:pb-2.5 md:border-t-0 md:px-6" onSubmit={send}>
        {mentionable.length ? (
          <div aria-label="넘길 위성" className="mx-auto mb-2 flex max-w-[760px] gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {mentionable.map((one) => (
              <button className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-app-fill px-3 text-[14px] font-semibold active:scale-95" key={one.id} onClick={() => { setText(`@${one.name} `); textarea.current?.focus(); }} type="button">
                <span className="size-2.5 rounded-full" style={{ background: one.color }} />{one.name}<span className="font-normal text-app-muted">{one.role}</span>
              </button>
            ))}
          </div>
        ) : null}
        {drafts.length ? (
          <div className="mx-auto mb-2 flex max-w-[760px] flex-wrap gap-2">
            {drafts.map((draft, index) => (
              <span className="relative inline-flex items-center gap-2 rounded-[12px] bg-app-fill p-1.5 pr-8 text-[13px]" key={`${draft.name}-${index}`}>
                {draft.preview ? <img alt="" className="size-10 rounded-[8px] object-cover" src={draft.preview} /> : <FileText aria-hidden="true" className="ml-1" size={18} />}
                <span className="max-w-[140px] truncate">{draft.name}</span>
                <button aria-label={`${draft.name} 빼기`} className="absolute top-1 right-1 grid size-6 place-items-center rounded-full active:bg-app-fill" onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))} type="button"><X aria-hidden="true" size={14} /></button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-[760px] items-end gap-1.5 rounded-[24px] bg-app-card p-1.5 ring-1 ring-app-line transition-shadow focus-within:ring-app-faint">
          <input accept="image/*,.pdf,.csv,.txt,.md,.json" className="hidden" multiple onChange={(event) => pick(event.target.files)} ref={fileInput} type="file" />
          <button aria-label="사진이나 파일 첨부" className="grid size-9 shrink-0 place-items-center rounded-full text-app-muted transition active:scale-90 active:bg-app-fill disabled:opacity-30" disabled={!ready || drafts.length >= 4} onClick={() => fileInput.current?.click()} type="button">
            <Paperclip aria-hidden="true" size={19} />
          </button>
          <label className="sr-only" htmlFor="message">{name}에게 메시지</label>
          <textarea
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-snug outline-none placeholder:text-app-faint focus:outline-none focus-visible:outline-none"
            disabled={!ready}
            id="message"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) send(event); }}
            placeholder={placeholder}
            ref={textarea}
            rows={1}
            value={text}
          />
          {job && !hasDraft ? (
            <button aria-label="멈추기" className="grid size-9 shrink-0 place-items-center rounded-full bg-app-ink text-app-bg transition active:scale-90" disabled={sending} onClick={stop} type="button">
              <Square aria-hidden="true" fill="currentColor" size={12} />
            </button>
          ) : (
            <button aria-label="보내기" className="grid size-9 shrink-0 place-items-center rounded-full bg-app-ink text-app-bg transition active:scale-90 disabled:opacity-25" disabled={!canSend} type="submit">
              <ArrowUp aria-hidden="true" size={18} strokeWidth={2.6} />
            </button>
          )}
        </div>
        {error ? <p className="mx-auto mt-1.5 mb-0 max-w-[760px] px-2 text-[13px] text-app-danger" role="alert">{error}</p> : null}
      </form>
    </div>
  );
}

function Waiting() {
  return <span className="mt-1 mr-1 text-[12px] text-app-muted">대기 중 · 지금 일이 끝나면 전달돼요</span>;
}

/** The satellite's tapback on my message: 👀 while it works on it, ✅ when it answered. */
function BotReaction({ emoji }: { emoji: string | null }) {
  if (!emoji) return null;
  return <span aria-label={emoji === "👀" ? "보는 중" : "답했어요"} className="absolute -bottom-2.5 -left-2 grid size-7 place-items-center rounded-full bg-app-card text-[14px] shadow-card ring-1 ring-app-line" role="img">{emoji}</span>;
}

function PeerLink({ id, children }: { id: string | null; children: React.ReactNode }) {
  const peer = satelliteById(id ?? "");
  if (!peer) return <>{children}</>;
  return <Link className="inline-flex items-center gap-1 font-semibold text-app-ink no-underline active:opacity-60" href={`/s/${peer.id}`}><span className="size-2 rounded-full" style={{ background: peer.color }} />{children}</Link>;
}

function Bubble({ message, onReact, onPin }: { message: Message; onReact: (id: number, emoji: string | null) => void; onPin: (id: number, pinned: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const files = <Files files={message.files} />;
  if (message.role === "me") {
    const text = message.body && message.body !== "(첨부 파일)";
    return (
      <>
        {message.kind === "mention" ? <span className="mb-1 mr-1 inline-flex items-center gap-1 text-[12px] text-app-muted"><ArrowRight aria-hidden="true" size={12} /><PeerLink id={message.peer}>{satelliteById(message.peer ?? "")?.name ?? message.peer}</PeerLink>에게 보냈어요</span> : null}
        {message.files.length ? files : null}
        {text ? (
          <div className={`relative max-w-[80%] rounded-[18px] px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap text-white [overflow-wrap:anywhere] ${message.waiting ? "bg-app-accent/60" : "bg-app-accent"} ${message.botReaction ? "mb-2" : ""}`}>
            {message.body}
            <BotReaction emoji={message.botReaction} />
          </div>
        ) : null}
        {message.waiting ? <Waiting /> : null}
      </>
    );
  }
  if (message.role === "error") {
    return <div className="max-w-[88%] rounded-[18px] bg-app-fill px-3.5 py-2 text-[15px] leading-relaxed text-app-warn">{message.body}</div>;
  }
  const copy = () => {
    navigator.clipboard?.writeText(message.body).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const tool = "inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[12px] text-app-muted active:bg-app-fill";
  return (
    <>
      {message.kind === "idea" ? <span className="mb-1 ml-1 text-[12px] font-semibold text-app-warn">먼저 알려 드려요</span> : null}
      {/* Answers with cards, diagrams or reports get the full width without a bubble; plain text stays in one. */}
      <div className={`relative ${/```/.test(message.body) ? "w-full min-w-0 px-1 py-1" : "w-fit max-w-[92%] min-w-0 rounded-[18px] bg-app-bubble px-3.5 py-2.5"}`}>
        <RichText text={message.body} />
        {message.myReaction ? (
          <button aria-label={`내 반응 ${message.myReaction} 지우기`} className="absolute -right-2 -bottom-3 grid size-7 place-items-center rounded-full bg-app-card text-[14px] shadow-card ring-1 ring-app-line active:scale-90" onClick={() => onReact(message.id, null)} type="button">{message.myReaction}</button>
        ) : null}
      </div>
      {message.files.length ? files : null}
      <div className="mt-0.5 ml-1 flex flex-wrap items-center gap-0.5">
        <button aria-label="답장 복사" className={tool} onClick={copy} type="button">
          {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}{copied ? "복사했어요" : "복사"}
        </button>
        <button aria-expanded={picking} aria-label="반응 남기기" className={tool} onClick={() => setPicking((open) => !open)} type="button"><SmilePlus aria-hidden="true" size={14} />반응</button>
        <button aria-label={message.pinned ? "고정 풀기" : "보관함에 고정"} className={tool} onClick={() => onPin(message.id, !message.pinned)} type="button">
          {message.pinned ? <PinOff aria-hidden="true" size={13} /> : <Pin aria-hidden="true" size={13} />}{message.pinned ? "고정됨" : "고정"}
        </button>
        {picking ? (
          <span className="anim-rise inline-flex items-center gap-0.5 rounded-full bg-app-card p-0.5 shadow-card ring-1 ring-app-line">
            {REACTIONS.map((emoji) => (
              <button aria-label={emoji} aria-pressed={message.myReaction === emoji} className={`grid size-9 place-items-center rounded-full text-[18px] transition active:scale-90 ${message.myReaction === emoji ? "bg-app-fill" : ""}`} key={emoji}
                onClick={() => { onReact(message.id, message.myReaction === emoji ? null : emoji); setPicking(false); }} type="button">{emoji}</button>
            ))}
          </span>
        ) : null}
      </div>
    </>
  );
}

/** Work passed between satellites: a note where it left, the work itself where it arrived. */
function Handoff({ message }: { message: Message }) {
  const peerName = satelliteById(message.peer ?? "")?.name ?? message.peer;
  if (message.kind === "out") {
    return (
      <div className="grid max-w-[88%] gap-1 rounded-[16px] bg-app-side px-3.5 py-2.5 text-[14px]">
        <span className="inline-flex items-center gap-1 text-[12px] text-app-muted"><ArrowRight aria-hidden="true" size={12} /><PeerLink id={message.peer}>{peerName}</PeerLink>에게 넘겼어요</span>
        <span className="line-clamp-3 text-app-muted [overflow-wrap:anywhere]">{message.body}</span>
      </div>
    );
  }
  const [work, context] = message.body.split(/\n\n\[참고: [^\]]*\]\n/);
  return (
    <div className={`relative grid max-w-[88%] gap-1.5 rounded-[18px] bg-app-side px-3.5 py-2.5 ${message.botReaction ? "mb-2" : ""}`}>
      <span className="text-[12px] text-app-muted">{message.kind === "mention" ? <>내가 <PeerLink id={message.peer}>{peerName}</PeerLink> 대화에서 보냈어요</> : <><PeerLink id={message.peer}>{peerName}</PeerLink>가 넘긴 일</>}</span>
      <span className="text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{work}</span>
      {context ? (
        <details className="text-[13px] text-app-muted">
          <summary className="cursor-pointer select-none">함께 보낸 {peerName}의 답</summary>
          <div className="mt-1.5 max-h-60 overflow-y-auto"><RichText text={context} /></div>
        </details>
      ) : null}
      {message.files.length ? <Files files={message.files} /> : null}
      <BotReaction emoji={message.botReaction} />
      {message.waiting ? <span className="text-[12px] text-app-muted">대기 중 · 지금 일이 끝나면 전달돼요</span> : null}
    </div>
  );
}

function PendingBubble({ pending }: { pending: Pending }) {
  return (
    <>
      {pending.files.length ? (
        <div className="mb-1 flex flex-wrap justify-end gap-1.5">
          {pending.files.map((file, index) => file.preview
            ? <img alt="" className="size-24 rounded-[14px] object-cover opacity-70" key={index} src={file.preview} />
            : <span className="inline-flex items-center gap-1.5 rounded-[12px] bg-app-fill px-3 py-2 text-[13px]" key={index}><FileText aria-hidden="true" size={15} />{file.name}</span>)}
        </div>
      ) : null}
      {pending.body ? <div className="max-w-[80%] rounded-[18px] bg-app-accent/80 px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap text-white [overflow-wrap:anywhere]">{pending.body}</div> : null}
    </>
  );
}

function Files({ files }: { files: FileInfo[] }) {
  return (
    <div className="my-1 grid max-w-[92%] gap-1.5">
      {files.map((file) => {
        if (file.mime.startsWith("image/") && file.mime !== "image/svg+xml") {
          return <a href={`/files/${file.id}`} key={file.id} rel="noreferrer" target="_blank"><img alt={file.name} className="max-h-72 rounded-[14px] object-contain" loading="lazy" src={`/files/${file.id}`} /></a>;
        }
        if (file.mime === "text/html") return <HtmlFile file={file} key={file.id} />;
        return (
          <a className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-app-fill px-3 text-[14px] text-inherit no-underline active:scale-[.98]" href={`/files/${file.id}`} key={file.id} rel="noreferrer" target="_blank">
            <FileText aria-hidden="true" size={17} /><span className="truncate">{file.name}</span><span className="shrink-0 text-[12px] text-app-muted">{Math.max(1, Math.round(file.size / 1024))}KB</span>
          </a>
        );
      })}
    </div>
  );
}

function HtmlFile({ file }: { file: FileInfo }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => { fetch(`/files/${file.id}`).then((response) => response.text()).then(setHtml).catch(() => setHtml("")); }, [file.id]);
  if (html === null) return <div className="h-40 animate-pulse rounded-[12px] bg-app-fill" />;
  return <div className="w-[min(640px,80vw)]"><HtmlFrame html={html} /></div>;
}

const ACTION_LABEL: Record<string, string> = { "reminder.add": "미리 알림 추가", "calendar.add": "캘린더 일정 추가" };

function ApprovalCard({ approval, fallback, disabled, onDecide }: { approval?: Approval; fallback: string; disabled: boolean; onDecide: (id: string, approve: boolean) => void }) {
  const status = approval?.status ?? "pending";
  const statusText = { pending: null, approved: "승인했어요 · 맥에서 실행하는 중", rejected: "하지 않기로 했어요", done: approval?.result ?? "끝났어요", failed: `실패했어요 · ${approval?.result ?? ""}` }[status];
  return (
    <div className="grid w-[min(360px,88%)] gap-2.5 rounded-[18px] bg-app-card p-3.5 ring-1 ring-app-line">
      <span className="text-[12px] font-semibold text-app-muted">{approval ? ACTION_LABEL[approval.type] ?? approval.type : "확인 필요"}</span>
      <span className="text-[15px] font-semibold">{approval?.summary ?? fallback}</span>
      {status === "pending" && approval ? (
        <div className="flex gap-2">
          <button className="h-11 flex-1 rounded-full bg-app-fill text-[15px] font-semibold active:scale-[.98] disabled:opacity-50" disabled={disabled} onClick={() => onDecide(approval.id, false)} type="button">안 할래요</button>
          <button className="h-11 flex-1 rounded-full bg-app-ink text-[15px] font-semibold text-app-bg active:scale-[.98] disabled:opacity-50" disabled={disabled} onClick={() => onDecide(approval.id, true)} type="button">승인</button>
        </div>
      ) : statusText ? <span className={`text-[13px] ${status === "failed" ? "text-app-warn" : "text-app-muted"}`}>{statusText}</span> : null}
    </div>
  );
}

/** Reads a picked file; photos are shrunk to a JPEG that fits the upload limit. */
async function toDraft(file: File): Promise<Draft> {
  if (file.type.startsWith("image/") && file.type !== "image/gif" && file.type !== "image/svg+xml") {
    const bitmap = await createImageBitmap(file);
    for (const [edge, quality] of [[1800, 0.85], [1400, 0.8], [1100, 0.75], [900, 0.7]] as const) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (base64.length <= MAX_BASE64) return { name: file.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", base64, preview: dataUrl };
    }
    throw new Error("사진이 너무 커요.");
  }
  if (file.size > 1_000_000) throw new Error(`${file.name}: 파일은 1MB까지 보낼 수 있어요.`);
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return { name: file.name, mime: file.type || "application/octet-stream", base64: btoa(binary) };
}
