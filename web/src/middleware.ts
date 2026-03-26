import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  const { pathname } = request.nextUrl;

  // No token → redirect to login (except public pages handled by matcher)
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Protect /register/plan: check email_verified via /api/auth/me
  if (pathname === "/register/plan") {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Cookie: `access_token=${token}` },
      });
      if (res.ok) {
        const user = await res.json();
        if (!user.emailVerified && !user.email_verified) {
          return NextResponse.redirect(new URL("/register/verify", request.url));
        }
      }
    } catch {
      // If API is down, let the page handle it
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\..*|.*\\.svg|.*\\.mp4|.*\\.pdf|.*\\.png|.*\\.jpg|api|login|register|forgot-password|reset-password|billing/success|billing/cancel|$).*)",
  ],
};
