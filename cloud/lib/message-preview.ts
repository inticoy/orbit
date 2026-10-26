/** Markdown and card blocks out of a message, for a list preview. */
export function plain(text: string) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/[*_#>`|]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
}
