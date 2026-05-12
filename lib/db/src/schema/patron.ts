import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const mantrasTable = pgTable("mantras", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scriptText: varchar("script_text", { length: 200 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Mantra = typeof mantrasTable.$inferSelect;
export type NewMantra = typeof mantrasTable.$inferInsert;

export const yajamanaTable = pgTable("yajamanas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  gotra: varchar("gotra", { length: 60 }).notNull(),
  fatherName: varchar("father_name", { length: 80 }),
  husbandName: varchar("husband_name", { length: 80 }),
  motherName: varchar("mother_name", { length: 80 }),
  niwasStan: varchar("niwas_stan", { length: 200 }).notNull(),
  status: varchar("status", { length: 10 }).notNull().default("jiwit"),
  relation: varchar("relation", { length: 30 }).notNull().default("self"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Yajamana = typeof yajamanaTable.$inferSelect;
export type NewYajamana = typeof yajamanaTable.$inferInsert;

export const patronSankalpsTable = pgTable(
  "patron_sankalps",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    yajamanaId: varchar("yajamana_id").notNull(),
    mantraId: varchar("mantra_id").notNull(),
    goalCount: integer("goal_count").notNull(),
    budgetRs: doublePrecision("budget_rs"),
    ratePerJaap: doublePrecision("rate_per_jaap").notNull().default(0.01),
    purpose: varchar("purpose", { length: 300 }).notNull().default("Khatu Shyam Ji ki kripa hetu"),
    deadline: date("deadline"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    visibility: varchar("visibility", { length: 10 }).notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    finalAccumulated: integer("final_accumulated").notNull().default(0),
  },
  (table) => [index("idx_patron_sankalp_status").on(table.status)],
);

export type PatronSankalp = typeof patronSankalpsTable.$inferSelect;
export type NewPatronSankalp = typeof patronSankalpsTable.$inferInsert;

/**
 * Records each bhakt's total contribution to a patron sankalp.
 */
export const sankalpContributionsTable = pgTable(
  "sankalp_contributions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sankalpId: varchar("sankalp_id").notNull(),
    userId: varchar("user_id").notNull(),
    totalJaaps: integer("total_jaaps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_sc_sankalp_user").on(table.sankalpId, table.userId),
    index("idx_sc_sankalp").on(table.sankalpId),
    index("idx_sc_user").on(table.userId),
  ],
);

/**
 * Links specific users to private sankalps.
 * Only used when patronSankalpsTable.visibility = 'private'.
 */
export const sankalpParticipantsTable = pgTable(
  "sankalp_participants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sankalpId: varchar("sankalp_id").notNull(),
    userId: varchar("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_sp_sankalp_user").on(table.sankalpId, table.userId),
    index("idx_sp_sankalp").on(table.sankalpId),
  ],
);

export type SankalpParticipant = typeof sankalpParticipantsTable.$inferSelect;
export type NewSankalpParticipant = typeof sankalpParticipantsTable.$inferInsert;
