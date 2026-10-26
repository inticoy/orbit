/** POSTs JSON to this site's own /api routes; a non-2xx answer throws its `error` message. */
export async function postJson<T = { ok: true }>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "다시 시도해 주세요.");
  return data;
}
