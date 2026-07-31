import { getCurrentMember } from "../../../lib/member-auth";

export async function GET(request: Request) {
  try {
    const member = await getCurrentMember(request);
    return Response.json({
      member: member
        ? {
            id: member.id,
            email: member.email,
            displayName: member.displayName,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ member: null, error: message }, { status: 500 });
  }
}
