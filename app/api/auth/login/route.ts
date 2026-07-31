import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import {
  createSession,
  normalizeEmail,
  sessionCookie,
  verifyPassword,
} from "../../../lib/member-auth";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = normalizeEmail(payload.email ?? "");
    const password = String(payload.password ?? "");
    const db = getDb();
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.email, email))
      .limit(1);

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
      {
        member: {
          id: member.id,
          email: member.email,
          displayName: member.displayName,
        },
      },
      {
        headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 400 });
  }
}
