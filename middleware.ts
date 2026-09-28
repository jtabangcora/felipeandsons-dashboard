import { NextResponse, type NextRequest } from "next/server";

// Optional gate. If DASH_PASSCODE is set in Vercel, the whole app asks for it (any username).
// Unset, the dashboard is public to anyone with the link.
export function middleware(req: NextRequest) {
  const code = process.env.DASH_PASSCODE;
  if (!code) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    const [, pass] = atob(auth.slice(6)).split(":");
    if (pass === code) return NextResponse.next();
  }
  return new NextResponse("Passcode required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="F&S Dashboard"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
