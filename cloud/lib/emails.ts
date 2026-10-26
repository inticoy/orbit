/** Comma-separated email list from a var, lowercased. Usable outside Next (custom-worker.ts). */
export function emailList(value: string | undefined) {
  return (value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}
