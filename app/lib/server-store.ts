import { normalizeDraws, seedHistory, type Draw } from "./lotto-data";

type RuntimeEnv = Record<string, unknown>;

export type MemberRecord = {
  id: number;
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderRecord = {
  id: number;
  memberId: number;
  period: string;
  drawDate: string;
  numbersJson: string;
  stake: number;
  status: string;
  note: string;
  hitCount: number | null;
  prize: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PredictionRecord = {
  id: number;
  memberId: number;
  period: string;
  drawDate: string;
  model: string;
  setsJson: string;
  lockedJson: string;
  excludedJson: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type DrawRecord = {
  id: number;
  game: string;
  period: string;
  drawDate: string;
  n1: number;
  n2: number;
  n3: number;
  n4: number;
  n5: number;
  source: string;
  rawJson: string;
  createdAt: string;
  updatedAt: string;
};

type SessionRecord = {
  id: number;
  memberId: number;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};

type StoreData = {
  counters: {
    draws: number;
    members: number;
    sessions: number;
    orders: number;
    predictions: number;
  };
  draws: DrawRecord[];
  members: MemberRecord[];
  sessions: SessionRecord[];
  orders: OrderRecord[];
  predictions: PredictionRecord[];
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T>() => Promise<{ results?: T[] }>;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

let d1Checked = false;
let d1Database: D1DatabaseLike | null = null;
let setupPromise: Promise<void> | null = null;
let fileWriteQueue = Promise.resolve();

const setupStatements = [
  `CREATE TABLE IF NOT EXISTS draws (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    game text DEFAULT 'daily_cash' NOT NULL,
    period text NOT NULL,
    draw_date text NOT NULL,
    n1 integer NOT NULL,
    n2 integer NOT NULL,
    n3 integer NOT NULL,
    n4 integer NOT NULL,
    n5 integer NOT NULL,
    source text DEFAULT 'manual' NOT NULL,
    raw_json text DEFAULT '{}' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS draws_game_period_idx ON draws (game, period)",
  `CREATE TABLE IF NOT EXISTS members (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS members_email_unique ON members (email)",
  `CREATE TABLE IF NOT EXISTS member_sessions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    member_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS member_sessions_token_hash_unique ON member_sessions (token_hash)",
  "CREATE INDEX IF NOT EXISTS member_sessions_token_idx ON member_sessions (token_hash)",
  "CREATE INDEX IF NOT EXISTS member_sessions_member_idx ON member_sessions (member_id)",
  `CREATE TABLE IF NOT EXISTS bet_orders (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    member_id integer NOT NULL,
    period text NOT NULL,
    draw_date text DEFAULT '' NOT NULL,
    numbers_json text NOT NULL,
    stake integer DEFAULT 50 NOT NULL,
    status text DEFAULT 'planned' NOT NULL,
    note text DEFAULT '' NOT NULL,
    hit_count integer,
    prize integer,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS bet_orders_member_created_idx ON bet_orders (member_id, created_at)",
  "CREATE INDEX IF NOT EXISTS bet_orders_member_period_idx ON bet_orders (member_id, period)",
  `CREATE TABLE IF NOT EXISTS member_predictions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    member_id integer NOT NULL,
    period text NOT NULL,
    draw_date text DEFAULT '' NOT NULL,
    model text NOT NULL,
    sets_json text NOT NULL,
    locked_json text DEFAULT '[]' NOT NULL,
    excluded_json text DEFAULT '[]' NOT NULL,
    note text DEFAULT '' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS member_predictions_member_created_idx ON member_predictions (member_id, created_at)",
  "CREATE INDEX IF NOT EXISTS member_predictions_member_period_idx ON member_predictions (member_id, period)",
];

function nowIso() {
  return new Date().toISOString();
}

function drawToRecord(draw: Draw, index: number): DrawRecord {
  const [n1, n2, n3, n4, n5] = draw.numbers;
  return {
    id: index + 1,
    game: "daily_cash",
    period: draw.period,
    drawDate: draw.date,
    n1,
    n2,
    n3,
    n4,
    n5,
    source: draw.source ?? "seed",
    rawJson: JSON.stringify(draw),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function emptyStore(): StoreData {
  const draws = seedHistory.map(drawToRecord);
  return {
    counters: {
      draws: draws.length,
      members: 0,
      sessions: 0,
      orders: 0,
      predictions: 0,
    },
    draws,
    members: [],
    sessions: [],
    orders: [],
    predictions: [],
  };
}

function mapDraw(row: DrawRecord): Draw {
  return {
    period: row.period,
    date: row.drawDate,
    numbers: [row.n1, row.n2, row.n3, row.n4, row.n5],
    source: row.source,
  };
}

function mapMember(row: Record<string, unknown>): MemberRecord {
  return {
    id: Number(row.id),
    email: String(row.email),
    displayName: String(row.display_name ?? row.displayName ?? ""),
    passwordSalt: String(row.password_salt ?? row.passwordSalt ?? ""),
    passwordHash: String(row.password_hash ?? row.passwordHash ?? ""),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ""),
  };
}

function mapOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: Number(row.id),
    memberId: Number(row.member_id ?? row.memberId),
    period: String(row.period),
    drawDate: String(row.draw_date ?? row.drawDate ?? ""),
    numbersJson: String(row.numbers_json ?? row.numbersJson ?? "[]"),
    stake: Number(row.stake ?? 50),
    status: String(row.status ?? "planned"),
    note: String(row.note ?? ""),
    hitCount: row.hit_count == null ? null : Number(row.hit_count),
    prize: row.prize == null ? null : Number(row.prize),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ""),
  };
}

function mapPrediction(row: Record<string, unknown>): PredictionRecord {
  return {
    id: Number(row.id),
    memberId: Number(row.member_id ?? row.memberId),
    period: String(row.period),
    drawDate: String(row.draw_date ?? row.drawDate ?? ""),
    model: String(row.model),
    setsJson: String(row.sets_json ?? row.setsJson ?? "[]"),
    lockedJson: String(row.locked_json ?? row.lockedJson ?? "[]"),
    excludedJson: String(row.excluded_json ?? row.excludedJson ?? "[]"),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ""),
  };
}

async function getRuntimeEnv(): Promise<RuntimeEnv> {
  let workerEnv: RuntimeEnv = {};
  try {
    const cloudflare = (await import("cloudflare:workers")) as { env?: RuntimeEnv };
    workerEnv = cloudflare.env ?? {};
  } catch {
    workerEnv = {};
  }

  const nodeEnv =
    typeof process !== "undefined" && process.env ? (process.env as RuntimeEnv) : {};

  return { ...workerEnv, ...nodeEnv };
}

async function getD1() {
  if (d1Checked) return d1Database;
  d1Checked = true;
  const runtimeEnv = await getRuntimeEnv();
  const database = runtimeEnv.DB;

  d1Database =
    database &&
    typeof database === "object" &&
    "prepare" in database &&
    typeof (database as D1DatabaseLike).prepare === "function"
      ? (database as D1DatabaseLike)
      : null;

  return d1Database;
}

async function getStorePath() {
  const runtimeEnv = await getRuntimeEnv();
  const configured = String(runtimeEnv.LOTTO539_DATA_PATH ?? "").trim();
  if (configured) return configured;

  const volume = String(runtimeEnv.RAILWAY_VOLUME_MOUNT_PATH ?? "").trim();
  if (volume) {
    const path = await import("node:path");
    return path.join(volume, "lotto539-store.json");
  }

  const path = await import("node:path");
  return path.join(process.cwd(), ".data", "lotto539-store.json");
}

async function readFileStore(): Promise<StoreData> {
  const fs = await import("node:fs/promises");
  const storePath = await getStorePath();

  try {
    const raw = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const fallback = emptyStore();

    return {
      counters: { ...fallback.counters, ...parsed.counters },
      draws: parsed.draws?.length ? parsed.draws : fallback.draws,
      members: parsed.members ?? [],
      sessions: parsed.sessions ?? [],
      orders: parsed.orders ?? [],
      predictions: parsed.predictions ?? [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeFileStore(store: StoreData) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const storePath = await getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

async function mutateFileStore<T>(mutator: (store: StoreData) => T | Promise<T>) {
  const run = async () => {
    const store = await readFileStore();
    const result = await mutator(store);
    await writeFileStore(store);
    return result;
  };

  const result = fileWriteQueue.then(run, run);
  fileWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function all<T>(db: D1DatabaseLike, query: string, values: unknown[] = []) {
  const result = await db.prepare(query).bind(...values).all<T>();
  return result.results ?? [];
}

export async function ensureStore() {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const db = await getD1();
    if (db) {
      await db.batch(setupStatements.map((statement) => db.prepare(statement)));
      return;
    }

    const store = await readFileStore();
    await writeFileStore(store);
  })();

  return setupPromise;
}

export async function getConfigValue(...keys: string[]) {
  const runtimeEnv = await getRuntimeEnv();
  for (const key of keys) {
    const value = runtimeEnv[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function listDraws(limit = 2000) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    const rows = await all<Record<string, unknown>>(
      db,
      `SELECT id, game, period, draw_date, n1, n2, n3, n4, n5, source, raw_json,
        created_at, updated_at
       FROM draws
       WHERE game = ?
       ORDER BY draw_date DESC, period DESC
       LIMIT ?`,
      ["daily_cash", limit],
    );
    return rows.map((row) =>
      mapDraw({
        id: Number(row.id),
        game: String(row.game),
        period: String(row.period),
        drawDate: String(row.draw_date),
        n1: Number(row.n1),
        n2: Number(row.n2),
        n3: Number(row.n3),
        n4: Number(row.n4),
        n5: Number(row.n5),
        source: String(row.source),
        rawJson: String(row.raw_json),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }),
    );
  }

  const store = await readFileStore();
  return normalizeDraws(store.draws.map(mapDraw)).slice(0, limit);
}

export async function upsertDraws(draws: Draw[]) {
  await ensureStore();
  const normalized = normalizeDraws(draws);
  const db = await getD1();
  const updatedAt = nowIso();

  if (db) {
    for (const draw of normalized) {
      const [n1, n2, n3, n4, n5] = draw.numbers;
      await db
        .prepare(
          `INSERT INTO draws (game, period, draw_date, n1, n2, n3, n4, n5, source, raw_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(game, period) DO UPDATE SET
             draw_date = excluded.draw_date,
             n1 = excluded.n1,
             n2 = excluded.n2,
             n3 = excluded.n3,
             n4 = excluded.n4,
             n5 = excluded.n5,
             source = excluded.source,
             raw_json = excluded.raw_json,
             updated_at = excluded.updated_at`,
        )
        .bind(
          "daily_cash",
          draw.period,
          draw.date,
          n1,
          n2,
          n3,
          n4,
          n5,
          draw.source ?? "api",
          JSON.stringify(draw),
          updatedAt,
        )
        .run();
    }
    return normalized;
  }

  return mutateFileStore((store) => {
    for (const draw of normalized) {
      const [n1, n2, n3, n4, n5] = draw.numbers;
      const existing = store.draws.find(
        (item) => item.game === "daily_cash" && item.period === draw.period,
      );
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
        updatedAt,
      };

      if (existing) {
        Object.assign(existing, values);
      } else {
        store.counters.draws += 1;
        store.draws.push({
          id: store.counters.draws,
          createdAt: updatedAt,
          ...values,
        });
      }
    }
    return normalized;
  });
}

export async function findMemberByEmail(email: string) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    const row = await db
      .prepare("SELECT * FROM members WHERE email = ? LIMIT 1")
      .bind(email)
      .first<Record<string, unknown>>();
    return row ? mapMember(row) : null;
  }

  const store = await readFileStore();
  return store.members.find((member) => member.email === email) ?? null;
}

export async function findMemberById(id: number) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    const row = await db
      .prepare("SELECT * FROM members WHERE id = ? LIMIT 1")
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? mapMember(row) : null;
  }

  const store = await readFileStore();
  return store.members.find((member) => member.id === id) ?? null;
}

export async function createMember(input: {
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
}) {
  await ensureStore();
  const db = await getD1();
  const timestamp = nowIso();

  if (db) {
    await db
      .prepare(
        "INSERT INTO members (email, display_name, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        input.email,
        input.displayName,
        input.passwordSalt,
        input.passwordHash,
        timestamp,
        timestamp,
      )
      .run();
    const member = await findMemberByEmail(input.email);
    if (!member) throw new Error("會員建立失敗，請稍後再試。");
    return member;
  }

  return mutateFileStore((store) => {
    if (store.members.some((member) => member.email === input.email)) {
      throw new Error("這個 Email 已經註冊。");
    }

    store.counters.members += 1;
    const member: MemberRecord = {
      id: store.counters.members,
      email: input.email,
      displayName: input.displayName,
      passwordSalt: input.passwordSalt,
      passwordHash: input.passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.members.push(member);
    return member;
  });
}

export async function createMemberSession(memberId: number, tokenHash: string, expiresAt: string) {
  await ensureStore();
  const db = await getD1();
  const timestamp = nowIso();

  if (db) {
    await db
      .prepare(
        "INSERT INTO member_sessions (member_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, tokenHash, expiresAt, timestamp)
      .run();
    return;
  }

  await mutateFileStore((store) => {
    store.counters.sessions += 1;
    store.sessions.push({
      id: store.counters.sessions,
      memberId,
      tokenHash,
      expiresAt,
      createdAt: timestamp,
    });
  });
}

export async function findMemberBySession(tokenHash: string, currentTime: string) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    const session = await db
      .prepare("SELECT * FROM member_sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1")
      .bind(tokenHash, currentTime)
      .first<Record<string, unknown>>();
    if (!session) return null;
    return findMemberById(Number(session.member_id));
  }

  const store = await readFileStore();
  const session = store.sessions.find(
    (item) => item.tokenHash === tokenHash && item.expiresAt > currentTime,
  );
  if (!session) return null;
  return store.members.find((member) => member.id === session.memberId) ?? null;
}

export async function deleteSession(tokenHash: string) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    await db.prepare("DELETE FROM member_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return;
  }

  await mutateFileStore((store) => {
    store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
}

export async function listOrders(memberId: number, limit = 200) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    const rows = await all<Record<string, unknown>>(
      db,
      "SELECT * FROM bet_orders WHERE member_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      [memberId, limit],
    );
    return rows.map(mapOrder);
  }

  const store = await readFileStore();
  return store.orders
    .filter((order) => order.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, limit);
}

export async function createOrder(input: Omit<OrderRecord, "id" | "createdAt" | "updatedAt">) {
  await ensureStore();
  const db = await getD1();
  const timestamp = nowIso();

  if (db) {
    await db
      .prepare(
        `INSERT INTO bet_orders
          (member_id, period, draw_date, numbers_json, stake, status, note, hit_count, prize, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.memberId,
        input.period,
        input.drawDate,
        input.numbersJson,
        input.stake,
        input.status,
        input.note,
        input.hitCount,
        input.prize,
        timestamp,
        timestamp,
      )
      .run();
    const orders = await listOrders(input.memberId, 1);
    return orders[0];
  }

  return mutateFileStore((store) => {
    store.counters.orders += 1;
    const order: OrderRecord = {
      id: store.counters.orders,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input,
    };
    store.orders.push(order);
    return order;
  });
}

export async function listPredictions(memberId: number, limit = 100) {
  await ensureStore();
  const db = await getD1();
  if (db) {
    const rows = await all<Record<string, unknown>>(
      db,
      "SELECT * FROM member_predictions WHERE member_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      [memberId, limit],
    );
    return rows.map(mapPrediction);
  }

  const store = await readFileStore();
  return store.predictions
    .filter((prediction) => prediction.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, limit);
}

export async function createPrediction(
  input: Omit<PredictionRecord, "id" | "createdAt" | "updatedAt">,
) {
  await ensureStore();
  const db = await getD1();
  const timestamp = nowIso();

  if (db) {
    await db
      .prepare(
        `INSERT INTO member_predictions
          (member_id, period, draw_date, model, sets_json, locked_json, excluded_json, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.memberId,
        input.period,
        input.drawDate,
        input.model,
        input.setsJson,
        input.lockedJson,
        input.excludedJson,
        input.note,
        timestamp,
        timestamp,
      )
      .run();
    const predictions = await listPredictions(input.memberId, 1);
    return predictions[0];
  }

  return mutateFileStore((store) => {
    store.counters.predictions += 1;
    const prediction: PredictionRecord = {
      id: store.counters.predictions,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...input,
    };
    store.predictions.push(prediction);
    return prediction;
  });
}
