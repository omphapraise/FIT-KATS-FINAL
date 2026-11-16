import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, code: body.code, password: body.password }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Cannot reach the Fit Kats server" },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    return NextResponse.json(
      { success: false, message: "Unexpected response from the server" },
      { status: 502 }
    );
  }
  return NextResponse.json(data, { status: res.status });
}
