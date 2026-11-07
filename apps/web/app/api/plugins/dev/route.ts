import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

/** Development only: the plugins built in this repository (`plugins/*\/dist`), as the desktop app loads them. */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const root = join(process.cwd(), "../../plugins");
  const out = [];
  for (const name of existsSync(root) ? readdirSync(root) : []) {
    const dist = join(root, name, "dist");
    const manifest = join(dist, "betelgeuse-plugin.json");
    if (!existsSync(manifest)) continue;
    const files: Record<string, string> = {};
    for (const f of readdirSync(dist, { withFileTypes: true })) if (f.isFile()) files[f.name] = readFileSync(join(dist, f.name), "utf8");
    out.push({ manifest: JSON.parse(files["betelgeuse-plugin.json"]), files });
  }
  return NextResponse.json(out);
}
