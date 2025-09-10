// middleware.ts
import { NextResponse } from "next/server";

export function middleware(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  const reqHeaders = req.headers.get("access-control-request-headers") ?? "*";

  // Preflight
  if (req.method === "OPTIONS") {
    const res = new NextResponse(null, { status: 204 });
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", reqHeaders);
    res.headers.set("Access-Control-Max-Age", "86400");
    return res;
  }

  // Actual request
  const res = NextResponse.next();
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin, Access-Control-Request-Headers");
  return res;
}

export const config = {
  matcher: ["/api/:path*"], // apply to all API routes
};
