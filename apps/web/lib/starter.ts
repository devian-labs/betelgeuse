/** Sample pages say `today+3` for their dates, so a task list is never out of date when first seen. */
export function fillDates(files: Record<string, string>, now = new Date()): Record<string, string> {
  const day = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return Object.fromEntries(Object.entries(files).map(([path, text]) => [path, text.replace(/\btoday([+-]\d+)\b/g, (_, offset) => day(Number(offset)))]));
}

/** The pages a new workspace starts with (packages/starter-pages), with today's dates. */
export async function starterPages(): Promise<Record<string, string>> {
  const res = await fetch("/starter-pages.json");
  if (!res.ok) throw new Error("Couldn't load the starter pages.");
  return fillDates((await res.json()) as Record<string, string>);
}
