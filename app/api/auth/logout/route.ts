import {
  clearSessionCookie,
  parseCookie,
  SESSION_COOKIE,
} from "../../../lib/member-auth";
import { deleteSession } from "../../../lib/server-store";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function POST(request: Request) {
  const token = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    await deleteSession(tokenHash);
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearSessionCookie() } },
  );
}
