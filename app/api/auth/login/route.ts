import {
  createSession,
  normalizeEmail,
  sessionCookie,
  verifyPassword,
} from "../../../lib/member-auth";
import { toMemberErrorMessage } from "../../../lib/member-db";
import { findMemberByEmail } from "../../../lib/server-store";

function memberPayload(member: Awaited<ReturnType<typeof findMemberByEmail>>) {
  if (!member) return null;
  return {
    id: member.id,
    email: member.email,
    displayName: member.displayName,
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = normalizeEmail(payload.email ?? "");
    const password = String(payload.password ?? "");
    const member = await findMemberByEmail(email);

    if (!member) {
      return Response.json({ error: "Email 或密碼不正確。" }, { status: 401 });
    }

    const ok = await verifyPassword(
      password,
      member.passwordSalt,
      member.passwordHash,
    );
    if (!ok) {
      return Response.json({ error: "Email 或密碼不正確。" }, { status: 401 });
    }

    const session = await createSession(member.id);

    return Response.json(
      { member: memberPayload(member) },
      {
        headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
      },
    );
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 400 });
  }
}
