import { getCurrentMember } from "../../../lib/member-auth";
import { toMemberErrorMessage } from "../../../lib/member-db";
import {
  createPrediction,
  listDraws,
  listPredictions,
  type PredictionRecord,
} from "../../../lib/server-store";
import type { Draw } from "../../../lib/lotto-data";

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

  if (!period) throw new Error("請先產生本期參考期數。");
  if (!sets.length) throw new Error("請至少保留一組預測號碼。");

  return { period, drawDate, model, sets, locked, excluded, note };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapPrediction(row: PredictionRecord, drawMap: Map<string, Draw>) {
  const sets = parseJson<number[][]>(row.setsJson, []);
  const locked = parseJson<number[]>(row.lockedJson, []);
  const excluded = parseJson<number[]>(row.excludedJson, []);
  const draw = drawMap.get(row.period);
  const drawNumbers = draw ? draw.numbers : null;
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
  const rows = await listDraws(2000);
  return new Map(rows.map((row) => [row.period, row]));
}

export async function GET(request: Request) {
  try {
    const member = await getCurrentMember(request);
    if (!member) {
      return Response.json({ error: "請先登入會員。" }, { status: 401 });
    }

    const rows = await listPredictions(member.id, 100);
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
      return Response.json({ error: "請先登入會員，才能保存預測。" }, { status: 401 });
    }

    const payload = (await request.json()) as IncomingPrediction;
    const prediction = validatePrediction(payload);

    const saved = await createPrediction({
      memberId: member.id,
      period: prediction.period,
      drawDate: prediction.drawDate,
      model: prediction.model,
      setsJson: JSON.stringify(prediction.sets),
      lockedJson: JSON.stringify(prediction.locked),
      excludedJson: JSON.stringify(prediction.excluded),
      note: prediction.note,
    });
    const drawMap = await loadDrawMap();

    return Response.json(
      { prediction: mapPrediction(saved, drawMap) },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: toMemberErrorMessage(error) }, { status: 400 });
  }
}
