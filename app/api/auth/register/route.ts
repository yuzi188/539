import {
  createSession,
  hashPassword,
  normalizeEmail,
  sessionCookie,
} from "../../../lib/member-auth";
import { toMemberErrorMessage } from "../../../lib/member-db";
import { createMember, findMemberByEmail } from "../../../lib/server-store";

function validate(payload: { email?: string; password?: string; displayName?: string }) {
  const email = normalizeEmail(payload.email ?? "");
  const password = String(payload.password ?? "");
  const displayName = String(payload.displayName ?? "").trim().slice(0, 40);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("請輸入正確的 Email。");
  }
  if (password.length < 8) {
    throw new Error("密碼至少需要 8 個字元。");
  }
  if (!displayName) {
    throw new Error("請輸入顯示名稱。");
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
    const existing = await findMemberByEmail(input.email);

    if (existing) {
      return Response.json({ error: "這個 Email 已經註冊。" }, { status: 409 });
    }

    const password = await hashPassword(input.password);
    const member = await createMember({
      email: input.email,
      displayName: input.displayName,
      passwordSalt: password.salt,
      passwordHash: password.hash,
    });
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
