/**
 * Smooths over serializer quirks so saving a page does not create diff noise:
 * - @tiptap/markdown emits an extra blank line on both sides of tables (and so a page that
 *   starts with a table would start with an empty line);
 * - trailing empty paragraphs (e.g. the one kept after a final table) become `&nbsp;` lines.
 * Files always end with exactly one newline.
 */
export function normalizeMarkdown(md: string): string {
  const body = md
    .replace(/\n{3,}(?=\|)/g, "\n\n")
    .replace(/^(\|.*\|)\n{3,}/gm, "$1\n\n")
    .replace(/^\n+/, "")
    .replace(/(?:\s|&nbsp;)+$/, "");
  return body ? `${body}\n` : "";
}
