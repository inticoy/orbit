"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export async function setPinned(messageId: number, pinned: boolean) {
  await requireViewer();
  if (!Number.isSafeInteger(messageId) || messageId < 1 || typeof pinned !== "boolean") throw new Error("Invalid pin");
  const env = await getEnv();
  await env.DB.prepare("UPDATE messages SET pinned = ? WHERE id = ?").bind(pinned ? 1 : 0, messageId).run();
  revalidatePath("/library");
}
