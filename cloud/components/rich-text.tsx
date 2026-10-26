"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";
import { OrbitCard } from "@/components/cards";

/**
 * A satellite's answer: Markdown (no raw HTML), plus three kinds of code block the
 * satellites may use — orbit-card (a JSON chart/table card), mermaid (a diagram),
 * and orbit-html (a full report shown in a sandboxed frame that cannot reach this app).
 */
export function RichText({ text }: { text: string }) {
  return (
    <div className="rich grid gap-2 text-[15px] leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => <a className="text-app-accent underline-offset-2" href={href} rel="noreferrer" target="_blank">{children}</a>,
          p: ({ children }) => <p className="m-0">{children}</p>,
          ul: ({ children }) => <ul className="m-0 grid gap-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="m-0 grid gap-1 pl-5">{children}</ol>,
          h1: ({ children }) => <p className="m-0 font-bold">{children}</p>,
          h2: ({ children }) => <p className="m-0 font-bold">{children}</p>,
          h3: ({ children }) => <p className="m-0 font-semibold">{children}</p>,
          blockquote: ({ children }) => <blockquote className="m-0 border-l-2 border-app-line pl-3 text-app-muted">{children}</blockquote>,
          table: ({ children }) => <div className="-mx-1 overflow-x-auto"><table className="w-full border-collapse text-[14px]">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-app-line px-2 py-1.5 text-left text-[12px] font-semibold text-app-muted">{children}</th>,
          td: ({ children }) => <td className="border-b border-app-line px-2 py-1.5 align-top">{children}</td>,
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
            const source = String(children ?? "").replace(/\n$/, "");
            if (language === "orbit-card") return <CardBlock source={source} />;
            if (language === "mermaid") return <Mermaid source={source} />;
            if (language === "orbit-html") return <HtmlFrame html={source} />;
            if (!language && !source.includes("\n")) return <code className="rounded-[6px] bg-app-fill px-1 py-0.5 font-mono text-[13px]">{children}</code>;
            return <pre className="m-0 overflow-x-auto rounded-[12px] bg-app-fill p-3 font-mono text-[13px] leading-snug"><code>{source}</code></pre>;
          },
        }}
        remarkPlugins={[remarkGfm, remarkCjkFriendly]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CardBlock({ source }: { source: string }) {
  try {
    return <OrbitCard spec={JSON.parse(source)} />;
  } catch {
    return <pre className="m-0 overflow-x-auto rounded-[12px] bg-app-fill p-3 font-mono text-[12px]">{source}</pre>;
  }
}

/** Mermaid loads only when an answer has a diagram (it is large). */
function Mermaid({ source }: { source: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    import("mermaid").then(async ({ default: mermaid }) => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral", fontFamily: "inherit" });
      const { svg: out } = await mermaid.render(`m${id}`, source);
      if (alive) setSvg(out);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id, source]);
  if (failed) return <pre className="m-0 overflow-x-auto rounded-[12px] bg-app-fill p-3 font-mono text-[12px]">{source}</pre>;
  if (!svg) return <div className="h-32 animate-pulse rounded-[12px] bg-app-fill" />;
  // Mermaid's strict mode strips scripts and handlers from the SVG it renders.
  return <div className="overflow-x-auto rounded-[12px] bg-app-card p-2 [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * A satellite-made HTML report. sandbox="allow-scripts" without allow-same-origin gives it an
 * opaque origin: no cookies, no storage, no access to this page. It reports its height by postMessage.
 */
export function HtmlFrame({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data?.orbitHeight !== "number") return;
      setHeight(Math.min(4000, Math.max(120, Math.ceil(event.data.orbitHeight))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const measure = "<script>(function(){function s(){parent.postMessage({orbitHeight:document.documentElement.scrollHeight},'*')}addEventListener('load',s);new ResizeObserver(s).observe(document.documentElement)})()</script>";
  return (
    <iframe
      className="w-full rounded-[12px] border-0 bg-white"
      ref={frame}
      sandbox="allow-scripts"
      srcDoc={`${html}${measure}`}
      style={{ height }}
      title="보고서"
    />
  );
}
