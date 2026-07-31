import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const draws = sqliteTable(
  "draws",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    game: text("game").notNull().default("daily_cash"),
    period: text("period").notNull(),
    drawDate: text("draw_date").notNull(),
    n1: integer("n1").notNull(),
    n2: integer("n2").notNull(),
    n3: integer("n3").notNull(),
    n4: integer("n4").notNull(),
    n5: integer("n5").notNull(),
    source: text("source").notNull().default("manual"),
    rawJson: text("raw_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    periodIdx: uniqueIndex("draws_game_period_idx").on(table.game, table.period),
  }),
);

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memberSessions = sqliteTable(
  "member_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tokenIdx: index("member_sessions_token_idx").on(table.tokenHash),
    memberIdx: index("member_sessions_member_idx").on(table.memberId),
  }),
);

export const betOrders = sqliteTable(
  "bet_orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull(),
    period: text("period").notNull(),
    drawDate: text("draw_date").notNull().default(""),
    numbersJson: text("numbers_json").notNull(),
    stake: integer("stake").notNull().default(50),
    status: text("status").notNull().default("planned"),
    note: text("note").notNull().default(""),
    hitCount: integer("hit_count"),
    prize: integer("prize"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    memberCreatedIdx: index("bet_orders_member_created_idx").on(
      table.memberId,
      table.createdAt,
    ),
    memberPeriodIdx: index("bet_orders_member_period_idx").on(
      table.memberId,
      table.period,
    ),
  }),
);

export const memberPredictions = sqliteTable(
  "member_predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull(),
    period: text("period").notNull(),
    drawDate: text("draw_date").notNull().default(""),
    model: text("model").notNull(),
    setsJson: text("sets_json").notNull(),
    lockedJson: text("locked_json").notNull().default("[]"),
    excludedJson: text("excluded_json").notNull().default("[]"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    memberCreatedIdx: index("member_predictions_member_created_idx").on(
      table.memberId,
      table.createdAt,
    ),
    memberPeriodIdx: index("member_predictions_member_period_idx").on(
      table.memberId,
      table.period,
    ),
  }),
);
