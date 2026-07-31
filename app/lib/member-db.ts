import { env } from "cloudflare:workers";

let setupPromise: Promise<void> | null = null;

const statements = [
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

export async function ensureMemberTables() {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    if (!env.DB) throw new Error("會員資料庫尚未啟用。");
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  })();

  return setupPromise;
}

export function toMemberErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";

  if (
    message.includes("no such table") ||
    message.includes("no such column") ||
    message.includes("Failed query") ||
    message.includes("D1 binding")
  ) {
    return "會員資料庫正在初始化，請重新整理後再試一次。";
  }

  return message;
}
