import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { draws, memberPredictions } from "../../../../db/schema";
import { getCurrentMember } from "../../../lib/member-auth";
import { ensureMemberTables, toMemberErrorMessage } from "../../../lib/member-db";

type IncomingPrediction = {
  period?: string;
  drawDate?: string;
  model?: string;
  sets?: number[][];
  locked?: number[];
  excluded?: number[];
  note?: string;
};

const allowedModels = new Set(["balanced", "hot", "cold", "value"]);

function prizeForHits(hit: number) {
  if (hit === 5) return 8000000;
  if (hit === 4) return 20000;
  if (hit === 3) return 300;
  if (hit === 2) return 50;
  return 0;
}

function normalizeNumbers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}

function normalizeSets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeNumbers).filter((numbers) => {
    const unique = new Set(numbers);
    return (
      numbers.length === 5 &&
      unique.size === 5 &&
      numbers.every((number) => number >= 1 && number <= 39)
    );
  });
}

function validatePrediction(payload: IncomingPrediction) {
  const period = String(payload.period ?? "").trim();
  const drawDate = String(payload.drawDate ?? "").trim();
  const model = allowedModels.has(String(payload.model)) ? String(payload.model) : "balanced";
  const sets = normalizeSets(payload.sets).slice(0, 12);
  const locked = normalizeNumbers(payload.locked).slice(0, 5);
  const excluded = normalizeNumbers(payload.excluded).slice(0, 39);
  const note = String(payload.note ?? "").trim().slice(0, 160);

  if (!period) throw new Error("請提供預測期別。");
  if (!sets.length) throw new Error("請先產生至少一組預測號碼。");

  return { period, drawDate, model, sets, locked, excluded, note };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function drawKey(row: typeof draws.$inferSelect) {
  return `${row.game}:${row.period}`;
}

function mapPrediction(
  row: typeof memberPredictions.$inferSelect,
  drawMap: Map<string, typeof draws.$inferSelect>,
) {
  const sets = parseJson<number[][]>(row.setsJson, []);
  const locked = parseJson<number[]>(row.lockedJson, []);
  const excluded = parseJson<number[]>(row.excludedJson, []);
  const draw = drawMap.get(`daily_cash:${row.period}`);
  const drawNumbers = draw ? [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5] : null;
  const results = sets.map((numbers) => {
    const hitCount = drawNumbers
      ? numbers.filter((number) => drawNumbers.includes(number)).length
      : null;
    return {
      numbers,
      hitCount,
      prize: hitCount == null ? null : prizeForHits(hitCount),
    };
  });
  const settledResults = results.filter((result) => result.hitCount != null);
  const bestHit = settledResults.length
    ? Math.max(...settledResults.map((result) => result.hitCount ?? 0))
    : null;
  const totalPrize = settledResults.reduce((total, result) => total + (result.prize ?? 0), 0);

  return {
    id: row.id,
    period: row.period,
    drawDate: row.drawDate,
    model: row.model,
    sets,
    locked,
    excluded,
    note: row.note,
    createdAt: row.createdAt,
    drawNumbers,
    results,
    bestHit,
    totalPrize: settledResults.length ? totalPrize : null,
    status: drawNumbers ? "settled" : "waiting",
  };
}

async function loadDrawMap() {
  let rows: (typeof draws.$inferSelect)[] = [];
  try {
    rows = await getDb()
      .select()
      .from(draws)
      .where(eq(draws.game, "daily_cash"))
      .orderBy(desc(draws.drawDate), desc(draws.period))
      .limit(2000);
  } catch {
    rows = [];
  }

  return new Map(rows.map((row) => [drawKey(row), row]));
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
      .from(memberPredictions)
      .where(eq(memberPredictions.memberId, member.id))
      .orderBy(desc(memberPredictions.createdAt), desc(memberPredictions.id))
      .limit(100);
    const drawMap = await loadDrawMap();

    return Response.json({
      member: {
        id: member.id,
        email: member.email,
        displayName: member.displayName,
      },
      predictions: rows.map((row) => mapPrediction(row, drawMap)),
    });
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await getCurrentMember(request);
    if (!member) {
      return Response.json({ error: "請先登入會員再保存預測。" }, { status: 401 });
    }
    await ensureMemberTables();

    const payload = (await request.json()) as IncomingPrediction;
    const prediction = validatePrediction(payload);
    const db = getDb();

    await db.insert(memberPredictions).values({
      memberId: member.id,
      period: prediction.period,
      drawDate: prediction.drawDate,
      model: prediction.model,
      setsJson: JSON.stringify(prediction.sets),
      lockedJson: JSON.stringify(prediction.locked),
      excludedJson: JSON.stringify(prediction.excluded),
      note: prediction.note,
    });

    const [saved] = await db
      .select()
      .from(memberPredictions)
      .where(
        and(
          eq(memberPredictions.memberId, member.id),
          eq(memberPredictions.period, prediction.period),
        ),
      )
      .orderBy(desc(memberPredictions.createdAt), desc(memberPredictions.id))
      .limit(1);
    const drawMap = await loadDrawMap();

    return Response.json(
      { prediction: mapPrediction(saved, drawMap) },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 400 });
  }
}
