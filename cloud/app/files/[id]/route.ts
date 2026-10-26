import { getViewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";

// Attachments behind the login. Satellite-made HTML is sent as a download so it never runs on this origin;
// the chat shows it inside a sandboxed frame instead.
const INLINE = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain|text\/csv)$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getViewer())) return new Response("Login required", { status: 401 });
  const { id } = await params;
  const env = await getEnv();
  const row = await env.DB.prepare("SELECT name, mime, data FROM attachments WHERE id = ?").bind(id).first<{ name: string; mime: string; data: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = Uint8Array.from(atob(row.data), (char) => char.charCodeAt(0));
  const inline = INLINE.test(row.mime);
  return new Response(bytes, {
    headers: {
      "Content-Type": inline ? row.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
