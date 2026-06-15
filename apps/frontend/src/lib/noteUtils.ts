export function getContentPreview(content: string, maxLen = 150): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trimEnd() + "…";
}
