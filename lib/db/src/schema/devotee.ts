import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const profilesTable = pgTable(
  "profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    gotra: varchar("gotra", { length: 60 }).notNull(),
    city: varchar("city", { length: 60 }).notNull(),
    state: varchar("state", { length: 60 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    upiId: varchar("upi_id", { length: 80 }),
    gender: varchar("gender", { length: 10 }),
    approved: boolean("approved").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    suspiciousFlags: integer("suspicious_flags").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
);

export type Profile = typeof profilesTable.$inferSelect;
export type NewProfile = typeof profilesTable.$inferInsert;

export const sankalpsTable = pgTable(
  "sankalps",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    date: date("date").notNull(),
    accepted: boolean("accepted").notNull().default(false),
    text: text("text").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    patronSankalpId: varchar("patron_sankalp_id"),
  },
  (table) => [
    uniqueIndex("uniq_user_date_sankalp").on(table.userId, table.date),
    index("idx_sankalp_user").on(table.userId),
    index("idx_sankalp_patron").on(table.patronSankalpId),
  ],
);

export type Sankalp = typeof sankalpsTable.$inferSelect;

export const jaapDailyTable = pgTable(
  "jaap_daily",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0),
    earnings: doublePrecision("earnings").notNull().default(0),
    timestamps: jsonb("timestamps").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    suspicious: boolean("suspicious").notNull().default(false),
    patronSankalpId: varchar("patron_sankalp_id"),
    patronSankalpBaseCount: integer("patron_sankalp_base_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_user_date_jaap").on(table.userId, table.date),
    index("idx_jaap_user").on(table.userId),
    index("idx_jaap_date").on(table.date),
    index("idx_jaap_patron_sankalp").on(table.patronSankalpId),
  ],
);

export type JaapDaily = typeof jaapDailyTable.$inferSelect;

export const userTotalsTable = pgTable("user_totals", {
  userId: varchar("user_id").primaryKey(),
  totalCount: integer("total_count").notNull().default(0),
  totalEarnings: doublePrecision("total_earnings").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  lastJaapDate: date("last_jaap_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserTotals = typeof userTotalsTable.$inferSelect;

export const payoutsTable = pgTable(
  "payouts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    amount: doublePrecision("amount").notNull(),
    upiId: varchar("upi_id", { length: 80 }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    paymentMethod: varchar("payment_method", { length: 20 }),
    paymentNote: text("payment_note"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [index("idx_payout_user").on(table.userId), index("idx_payout_status").on(table.status)],
);

export type Payout = typeof payoutsTable.$inferSelect;
