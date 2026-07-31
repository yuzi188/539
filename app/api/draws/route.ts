import { getConfigValue, listDraws, upsertDraws } from "../../lib/server-store";
import { normalizeDraws, seedHistory, type Draw } from "../../lib/lotto-data";

type IncomingRecord = Record<string, unknown>;

async function getSyncToken() {
  return (
    (await getConfigValue("DRAW_SYNC_TOKEN", "LOTTO539_DRAW_SYNC_TOKEN")) ?? ""
  );
}

async function isAuthorized(request: Request) {
  const expected = String(await getSyncToken()).trim();
  if (!expected) return true;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerToken = request.headers.get("x-draw-sync-token")?.trim() ?? "";

  return bearer === expected || headerToken === expected;
}

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";

  if (
    message.includes("no such table") ||
    message.includes("draws") ||
    message.includes("cloudflare:")
  ) {
    return "開獎資料庫正在準備中，已先顯示內建資料。";
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
    throw new Error(`第 ${index + 1} 筆資料號碼需要在 01-39 範圍內。`);
  }

  return {
    period,
    date,
    numbers,
    source: getText(record, ["source"]) || "api",
  };
}

export async function GET() {
  try {
    const data = await listDraws(2000);

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
    if (!(await isAuthorized(request))) {
      return Response.json(
        { error: "沒有權限更新開獎資料。" },
        { status: 401 },
      );
    }

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
    const saved = await upsertDraws(normalized);

    return Response.json(
      { saved: saved.length, draws: saved, source: "database" },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: toRouteErrorMessage(error) },
      { status: 400 },
    );
  }
}
