import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";

export async function POST() {
  const out = NextResponse.json({ success: true });
  out.cookies.delete(TOKEN_COOKIE);
  return out;
}
