import { NextResponse } from "next/server";
import { fetchIndex } from "@/lib/server/plugin-store";

/** The plugin store's list. GitHub's release downloads don't allow browsers to read them directly. */
export async function GET() {
  const index = await fetchIndex();
  if ("error" in index) return NextResponse.json({ error: index.error }, { status: index.status });
  return NextResponse.json({ plugins: index.plugins, fetched: Math.floor(Date.now() / 1000), stale: false }, { headers: { "Cache-Control": "public, max-age=300" } });
}
