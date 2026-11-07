import { NextResponse, type NextRequest } from "next/server";
import { origin, SESSION_COOKIE } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== origin(req) && req.headers.get("origin") !== req.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/api/auth" });
  return res;
}
