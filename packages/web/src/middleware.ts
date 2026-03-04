import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

export async function middleware(req: Request) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = new URL(req.url);

  // Allow public routes
  const publicPaths = ["/login", "/api/auth", "/_next", "/favicon.ico"];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Redirect to login if no token
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
