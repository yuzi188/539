import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { members } from "../../../../db/schema";
import {
  createSession,
  hashPassword,
  normalizeEmail,
  sessionCookie,
} from "../../../lib/member-auth";
import { ensureMemberTables, toMemberErrorMessage } from "../../../lib/member-db";

function validate(payload: { email?: string; password?: string; displayName?: string }) {
  const email = normalizeEmail(payload.email ?? "");
  const password = String(payload.password ?? "");
  const displayName = String(payload.displayName ?? "").trim().slice(0, 40);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("請輸入有效的 Email。");
  }
  if (password.length < 8) {
    throw new Error("密碼至少需要 8 個字。");
  }
  if (!displayName) {
    throw new Error("請輸入暱稱。");
  }

  return { email, password, displayName };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
    };
    const input = validate(payload);
    await ensureMemberTables();
    const db = getDb();
    const existing = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, input.email))
      .limit(1);

    if (existing[0]) {
      return Response.json({ error: "這個 Email 已經註冊。" }, { status: 409 });
    }

    const password = await hashPassword(input.password);
    await db.insert(members).values({
      email: input.email,
      displayName: input.displayName,
      passwordSalt: password.salt,
      passwordHash: password.hash,
    });

    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.email, input.email))
      .limit(1);
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
        status: 201,
        headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
      },
    );
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 400 });
  }
}
