// middleware.ts
import { NextResponse } from "next/server";

const ALLOWED = new Set([
  "https://www.kravtofly.com",
  "https://kravtofly.com",
  "http://localhost:3000",
]);

export function middleware(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED.has(origin) ? origin : "https://www.kravtofly.com";

  // Preflight
  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set("Access-Control-Allow-Origin", allow);
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") ?? "Content-Type, Authorization");
    res.headers.set("Access-Control-Max-Age", "86400");
    res.headers.set("Vary", "Origin, Access-Control-Request-Headers");
    return res;
  }

  // Actual request
  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", allow);
  res.headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
