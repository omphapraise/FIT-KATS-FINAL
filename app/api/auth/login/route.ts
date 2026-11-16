import { NextResponse } from "next/server";
import { BACKEND_URL, TOKEN_COOKIE, cookieOptions } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Cannot reach the Fit Kats server" },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) {
    return NextResponse.json(
      { success: false, message: data?.message ?? "Login failed" },
      { status: res.ok ? 502 : res.status }
    );
  }

  const out = NextResponse.json({ success: true, user: data.user });
  out.cookies.set(TOKEN_COOKIE, data.token, cookieOptions);
  return out;
}