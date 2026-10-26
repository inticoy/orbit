import "server-only";
import { cookies } from "next/headers";
import type { ListState } from "@/components/satellite-list";
import { LIST_ORDER_COOKIE, listOrder } from "@/lib/list-order";
import { askingSatellites, busySatellites, lastMessages, unreadBySatellite } from "@/lib/conversations";

export async function loadListState(env: Pick<CloudflareEnv, "DB">, email: string): Promise<ListState> {
  const [last, busy, unread, asking, jar] = await Promise.all([lastMessages(env), busySatellites(env), unreadBySatellite(env, email), askingSatellites(env), cookies()]);
  return { last, busy, unread, asking, order: listOrder(jar.get(LIST_ORDER_COOKIE)?.value) };
}
