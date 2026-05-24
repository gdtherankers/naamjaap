import { Router, type IRouter } from "express";
import { db, jaapDailyTable, sankalpsTable, nijJaapDailyTable, nijJaapTotalsTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { GetJaapHistoryQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  DAILY_TARGET,
  MILESTONES,
  buildSnapshot,
  ensureJaapDaily,
  ensureUserTotals,
  getGlobalAggregates,
  getOrCreateProfile,
  todayDateString,
} from "../lib/jaap-helpers";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();
  const totals = await ensureUserTotals(userId);
  const daily = await ensureJaapDaily(userId, date);
  const profile = await getOrCreateProfile(userId);
  const [todaySankalp] = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)))
    .limit(1);

  const snapshot = buildSnapshot({
    todayCount: daily.count,
    totalCount: totals.totalCount,
    todayEarnings: daily.earnings,
    totalEarnings: totals.totalEarnings,
    sankalpAccepted: !!todaySankalp?.accepted,
    streakDays: totals.streakDays,
  });

  const [nijDaily] = await db
    .select()
    .from(nijJaapDailyTable)
    .where(and(eq(nijJaapDailyTable.userId, userId), eq(nijJaapDailyTable.date, date)))
    .limit(1);
  const [nijTotals] = await db
    .select()
    .from(nijJaapTotalsTable)
    .where(eq(nijJaapTotalsTable.userId, userId))
    .limit(1);

  res.json({
    snapshot,
    profile: profile
      ? {
          id: profile.id,
          userId: profile.userId,
          name: profile.name,
          gotra: profile.gotra,
          city: profile.city,
          state: profile.state,
          approved: profile.approved,
          isAdmin: profile.isAdmin,
          upiId: profile.upiId ?? null,
          createdAt: profile.createdAt.toISOString(),
        }
      : null,
    milestones: MILESTONES.map((m) => ({
      count: m.count,
      reward: m.reward,
      label: m.label,
      achieved: totals.totalCount >= m.count,
    })),
    dailyTarget: DAILY_TARGET,
    dailyTargetProgress: Math.min(1, daily.count / DAILY_TARGET),
    nijJaapTodayCount: nijDaily?.count ?? 0,
    nijJaapTotalCount: nijTotals?.totalCount ?? 0,
  });
});

router.get("/dashboard/history", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const parsed = GetJaapHistoryQueryParams.safeParse(req.query);
  const days = parsed.success ? parsed.data.days ?? 7 : 7;

  const istDateString = (offsetDaysBack: number): string =>
    new Date(Date.now() - offsetDaysBack * 24 * 60 * 60 * 1000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const sinceStr = istDateString(days - 1);

  const rows = await db
    .select({ date: jaapDailyTable.date, count: jaapDailyTable.count, earnings: jaapDailyTable.earnings })
    .from(jaapDailyTable)
    .where(and(eq(jaapDailyTable.userId, userId), gte(jaapDailyTable.date, sinceStr)));
  const map = new Map(rows.map((r) => [r.date, { count: r.count, earnings: Number(r.earnings ?? 0) }]));
  const result: { date: string; count: number; earnings: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ds = istDateString(i);
    const entry = map.get(ds);
    result.push({ date: ds, count: entry?.count ?? 0, earnings: entry?.earnings ?? 0 });
  }
  res.json({ days: result });
});

router.get("/global/stats", async (_req, res) => {
  const agg = await getGlobalAggregates();
  res.json({
    totalUsers: Number(agg.totalUsers ?? 0),
    totalJaapAllTime: Number(agg.totalJaapAllTime ?? 0),
    totalJaapToday: Number(agg.totalJaapToday ?? 0),
    totalEarnings: Number((agg.totalEarnings ?? 0).toFixed?.(2) ?? agg.totalEarnings ?? 0),
  });
});

export default router;
