import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
