import { desc, eq, and } from "drizzle-orm";
import { draws } from "../../../db/schema";
import { getDb } from "../../../db";
import { normalizeDraws, seedHistory, type Draw } from "../../lib/lotto-data";

type IncomingRecord = Record<string, unknown>;

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";

  if (
    message.includes("D1 binding") ||
    message.includes("no such table") ||
    message.includes("draws")
  ) {
    return "資料庫尚未啟用或資料表尚未建立。請先部署含 D1 migration 的版本。";
  }

  return message;
}

function getText(record: IncomingRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function parseNumbers(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  if (typeof value === "string") {
    return value
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);
  }

  return [];
}

function getNumbers(record: IncomingRecord) {
  const arrayKeys = [
    "numbers",
    "draw_numbers",
    "drawNumbers",
    "lottery_numbers",
    "lotteryNumbers",
    "獎號",
    "開獎號碼",
  ];

  for (const key of arrayKeys) {
    const parsed = parseNumbers(record[key]);
    if (parsed.length >= 5) return parsed.slice(0, 5);
  }

  const numberedKeys = [
    ["n1", "n2", "n3", "n4", "n5"],
    ["num1", "num2", "num3", "num4", "num5"],
    ["number1", "number2", "number3", "number4", "number5"],
    ["獎號1", "獎號2", "獎號3", "獎號4", "獎號5"],
  ];

  for (const keys of numberedKeys) {
    const parsed = keys.map((key) => Number(record[key])).filter(Number.isFinite);
    if (parsed.length === 5) return parsed;
  }

  return [];
}

function normalizeDate(value: string) {
  const normalized = value.replaceAll("-", "/").trim();
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return normalized;

  const [, year, month, day] = match;
  return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

function normalizeIncoming(record: IncomingRecord, index: number): Draw {
  const period =
    getText(record, ["period", "issue", "drawNo", "draw_number", "drawNumber", "期別"]) ||
    `manual-${Date.now()}-${index}`;
  const date = normalizeDate(
    getText(record, ["date", "drawDate", "draw_date", "lotteryDate", "開獎日期"]) ||
      new Date().toISOString().slice(0, 10),
  );
  const numbers = getNumbers(record).sort((a, b) => a - b);
  const unique = new Set(numbers);

  if (numbers.length !== 5 || unique.size !== 5) {
    throw new Error(`第 ${index + 1} 筆資料需要 5 個不重複號碼。`);
  }

  if (numbers.some((number) => number < 1 || number > 39)) {
    throw new Error(`第 ${index + 1} 筆資料含有 01-39 以外的號碼。`);
  }

  return {
    period,
    date,
    numbers,
    source: getText(record, ["source"]) || "api",
  };
}

function mapRow(row: typeof draws.$inferSelect): Draw {
  return {
    period: row.period,
    date: row.drawDate,
    numbers: [row.n1, row.n2, row.n3, row.n4, row.n5],
    source: row.source,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(draws)
      .where(eq(draws.game, "daily_cash"))
      .orderBy(desc(draws.drawDate), desc(draws.period))
      .limit(2000);
    const data = rows.map(mapRow);

    return Response.json({
      draws: data.length ? data : seedHistory,
      source: data.length ? "database" : "seed",
      count: data.length,
    });
  } catch (error) {
    return Response.json({
      draws: seedHistory,
      source: "seed",
      count: seedHistory.length,
      warning: toRouteErrorMessage(error),
    });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as
      | IncomingRecord
      | { draws?: IncomingRecord[]; data?: IncomingRecord[]; source?: string };
    const records =
      "draws" in payload && Array.isArray(payload.draws)
        ? payload.draws
        : "data" in payload && Array.isArray(payload.data)
          ? payload.data
          : [payload as IncomingRecord];
    const normalized = normalizeDraws(
      records.map((record, index) =>
        normalizeIncoming(
          {
            ...record,
            source:
              typeof record.source === "string"
                ? record.source
                : "source" in payload && typeof payload.source === "string"
                  ? payload.source
                  : "api",
          },
          index,
        ),
      ),
    );
    const db = getDb();

    for (const draw of normalized) {
      const [n1, n2, n3, n4, n5] = draw.numbers;
      const values = {
        game: "daily_cash",
        period: draw.period,
        drawDate: draw.date,
        n1,
        n2,
        n3,
        n4,
        n5,
        source: draw.source ?? "api",
        rawJson: JSON.stringify(draw),
        updatedAt: new Date().toISOString(),
      };
      const existing = await db
        .select({ id: draws.id })
        .from(draws)
        .where(and(eq(draws.game, "daily_cash"), eq(draws.period, draw.period)))
        .limit(1);

      if (existing[0]) {
        await db.update(draws).set(values).where(eq(draws.id, existing[0].id));
      } else {
        await db.insert(draws).values(values);
      }
    }

    return Response.json(
      { saved: normalized.length, draws: normalized, source: "database" },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 400 },
    );
  }
}
