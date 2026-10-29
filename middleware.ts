import { NextResponse, type NextRequest } from "next/server";

// Single-operator access gate (HTTP Basic auth). Fails closed in production.
// This protects every page and every /api route, including the ones that spend
// Walrus Memory relayer quota and use the Supabase service-role key.
// It is NOT multi-user authentication; see README "Known limitations".

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.VAULTPATH_ACCESS_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "VaultPath is locked: set VAULTPATH_ACCESS_PASSWORD in the deployment environment.",
        { status: 503 },
      );
    }
    return NextResponse.next(); // local development only
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (safeEqual(user, "vaultpath") && safeEqual(pass, password)) {
        return NextResponse.next();
      }
    } catch {
      /* fall through to 401 */
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="VaultPath", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
