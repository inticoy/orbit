// Notification kinds, shared by the server (lib/push.ts) and client settings without pulling in push crypto.
export const categories = {
  satellite: "위성 답장",
  system: "Orbit",
} as const;
export type Category = keyof typeof categories;
export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && Object.hasOwn(categories, value);
}
