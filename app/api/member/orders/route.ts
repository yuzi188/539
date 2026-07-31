import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { betOrders } from "../../../../db/schema";
import { getCurrentMember } from "../../../lib/member-auth";
import { ensureMemberTables, toMemberErrorMessage } from "../../../lib/member-db";

type IncomingOrder = {
  period?: string;
  drawDate?: string;
  numbers?: number[];
  stake?: number;
  status?: string;
  note?: string;
};

const allowedStatuses = new Set(["planned", "placed", "settled"]);

function normalizeNumbers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

function validateOrder(payload: IncomingOrder) {
  const period = String(payload.period ?? "").trim();
  const drawDate = String(payload.drawDate ?? "").trim();
  const numbers = normalizeNumbers(payload.numbers);
  const unique = new Set(numbers);
  const stake = Math.max(0, Math.round(Number(payload.stake ?? 50)));
  const status = allowedStatuses.has(String(payload.status))
    ? String(payload.status)
    : "planned";
  const note = String(payload.note ?? "").trim().slice(0, 160);

  if (!period) throw new Error("請輸入期別。");
  if (numbers.length !== 5 || unique.size !== 5) {
    throw new Error("請選擇 5 個不重複號碼。");
  }
  if (numbers.some((number) => number < 1 || number > 39)) {
    throw new Error("號碼必須介於 01 到 39。");
  }

  return { period, drawDate, numbers, stake, status, note };
}

function mapOrder(row: typeof betOrders.$inferSelect) {
  return {
    id: row.id,
    period: row.period,
    drawDate: row.drawDate,
    numbers: JSON.parse(row.numbersJson) as number[],
    stake: row.stake,
    status: row.status,
    note: row.note,
    hitCount: row.hitCount,
    prize: row.prize,
    createdAt: row.createdAt,
  };
}

export async function GET(request: Request) {
  try {
    const member = await getCurrentMember(request);
    if (!member) {
      return Response.json({ error: "請先登入會員。" }, { status: 401 });
    }
    await ensureMemberTables();

    const rows = await getDb()
      .select()
      .from(betOrders)
      .where(eq(betOrders.memberId, member.id))
      .orderBy(desc(betOrders.createdAt), desc(betOrders.id))
      .limit(200);

    return Response.json({
      member: {
        id: member.id,
        email: member.email,
        displayName: member.displayName,
      },
      orders: rows.map(mapOrder),
    });
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await getCurrentMember(request);
    if (!member) {
      return Response.json({ error: "請先登入會員。" }, { status: 401 });
    }
    await ensureMemberTables();

    const payload = (await request.json()) as IncomingOrder;
    const order = validateOrder(payload);

    await getDb().insert(betOrders).values({
      memberId: member.id,
      period: order.period,
      drawDate: order.drawDate,
      numbersJson: JSON.stringify(order.numbers),
      stake: order.stake,
      status: order.status,
      note: order.note,
    });

    const [saved] = await getDb()
      .select()
      .from(betOrders)
      .where(
        and(eq(betOrders.memberId, member.id), eq(betOrders.period, order.period)),
      )
      .orderBy(desc(betOrders.createdAt), desc(betOrders.id))
      .limit(1);

    return Response.json({ order: mapOrder(saved) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 400 });
  }
}
