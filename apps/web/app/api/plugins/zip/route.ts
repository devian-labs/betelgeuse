import { NextResponse, type NextRequest } from "next/server";
import { fetchIndex, MAX_ZIP, zipUrl } from "@/lib/server/plugin-store";

/** A store plugin's zip. The page checks its checksum and signature, so it needn't trust this server. */
export async function GET(req: NextRequest) {
  const index = await fetchIndex();
  if ("error" in index) return NextResponse.json({ error: index.error }, { status: index.status });
  const entry = index.plugins.find((e) => e.id === req.nextUrl.searchParams.get("id"));
  const url = entry && zipUrl(entry);
  if (!url) return NextResponse.json({ error: "No such plugin." }, { status: 404 });
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok || !res.body || Number(res.headers.get("content-length") ?? 0) > MAX_ZIP) return NextResponse.json({ error: "Couldn't download the plugin." }, { status: 502 });
  return new NextResponse(res.body, { headers: { "Content-Type": "application/zip", "Cache-Control": "public, max-age=300" } });
}
