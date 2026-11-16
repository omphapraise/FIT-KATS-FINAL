import { cookies } from "next/headers";

export const TOKEN_COOKIE = "fk_token";
export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value ?? null;
}