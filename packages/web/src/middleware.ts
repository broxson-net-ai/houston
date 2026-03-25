import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = new URL(req.url);

  // Allow public routes
  const publicPaths = ["/login", "/api/auth", "/_next", "/favicon.ico"];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow requests with a valid static API key (for internal service-to-service calls)
  const apiKey = process.env.HOUSTON_API_KEY;
  const authHeader = req.headers.get("authorization");
  if (apiKey && authHeader === `Bearer ${apiKey}`) {
    return NextResponse.next();
  }

  // Fall back to NextAuth JWT session (for web UI)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
