import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db";
import { memberSessions, members } from "../../db/schema";
import { ensureMemberTables } from "./member-db";

export const SESSION_COOKIE = "lotto539_member_session";
const SESSION_DAYS = 30;
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBase64(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseCookie(header: string | null, name: string) {
  if (!header) return null;
  const cookies = header.split(";").map((item) => item.trim());
  const pair = cookies.find((item) => item.startsWith(`${name}=`));
  if (!pair) return null;
  return decodeURIComponent(pair.slice(name.length + 1));
}

export async function hashPassword(password: string, salt = randomBase64(16)) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations: 120000,
    },
    key,
    256,
  );

  return {
    salt,
    hash: bytesToBase64(new Uint8Array(bits)),
  };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
) {
  const result = await hashPassword(password, salt);
  return result.hash === expectedHash;
}

export async function createSession(memberId: number) {
  await ensureMemberTables();

  const token = randomBase64(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await getDb().insert(memberSessions).values({
    memberId,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: string) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export async function getCurrentMember(request: Request) {
  await ensureMemberTables();

  const token = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const db = getDb();
  const [session] = await db
    .select()
    .from(memberSessions)
    .where(
      and(
        eq(memberSessions.tokenHash, tokenHash),
        gt(memberSessions.expiresAt, now),
      ),
    )
    .limit(1);

  if (!session) return null;

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, session.memberId))
    .limit(1);

  return member ?? null;
}
