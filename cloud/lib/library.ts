import "server-only";
import { plain } from "@/lib/message-preview";

type Env = Pick<CloudflareEnv, "DB">;

export type LibraryMessage = { id: number; satellite: string; role: string; body: string; createdAt: string };
export type Report = LibraryMessage & { title: string };
export type LibraryFile = { id: string; messageId: number | null; satellite: string; direction: string; name: string; mime: string; size: number; createdAt: string };

export async function searchMessages(env: Env, q: string, limit = 50): Promise<LibraryMessage[]> {
  if (q.length < 1) return [];
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const { results } = await env.DB.prepare(`SELECT id, satellite, role, body, created_at AS createdAt FROM messages
    WHERE role IN ('me', 'bot', 'handoff') AND body LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(`%${escaped}%`, limit).all<LibraryMessage>();
  return results;
}

export async function pinnedMessages(env: Env, satellite?: string): Promise<LibraryMessage[]> {
  const { results } = await env.DB.prepare(`SELECT id, satellite, role, body, created_at AS createdAt FROM messages
    WHERE pinned = 1 ${satellite ? "AND satellite = ?" : ""} ORDER BY created_at DESC, id DESC`)
    .bind(...(satellite ? [satellite] : [])).all<LibraryMessage>();
  return results;
}

export async function reports(env: Env, satellite?: string): Promise<Report[]> {
  const { results } = await env.DB.prepare(`SELECT m.id, m.satellite, m.role, m.body, m.created_at AS createdAt,
    (SELECT a.name FROM attachments a WHERE a.message_id = m.id AND a.direction = 'out' AND a.mime = 'text/html'
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1) AS attachmentName
    FROM messages m WHERE ((m.role = 'bot' AND (instr(m.body, ?) > 0
      OR instr(m.body, ?) > 0 OR instr(m.body, ?) > 0))
      OR EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.direction = 'out' AND a.mime = 'text/html'))
    ${satellite ? "AND m.satellite = ?" : ""} ORDER BY m.created_at DESC, m.id DESC LIMIT 60`)
    .bind("```orbit-html", "```orbit-card", "```mermaid", ...(satellite ? [satellite] : [])).all<LibraryMessage & { attachmentName: string | null }>();
  return results.map(({ attachmentName, ...message }) => {
    const line = message.body.replace(/```[\s\S]*?(?:```|$)/g, "").split(/\r?\n/).map((line) => plain(line)).find(Boolean);
    return { ...message, title: line || attachmentName || "보고서" };
  });
}

export async function files(env: Env, satellite?: string): Promise<LibraryFile[]> {
  const { results } = await env.DB.prepare(`SELECT id, message_id AS messageId, satellite, direction, name, mime, size, created_at AS createdAt
    FROM attachments ${satellite ? "WHERE satellite = ?" : ""} ORDER BY created_at DESC, id DESC LIMIT 80`)
    .bind(...(satellite ? [satellite] : [])).all<LibraryFile>();
  return results;
}
