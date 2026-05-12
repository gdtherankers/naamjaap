import { Router, type IRouter } from "express";
import { db, jaapDailyTable, profilesTable, userTotalsTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";
import { getOrCreateProfile } from "../lib/jaap-helpers";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res) => {
  const parsed = GetLeaderboardQueryParams.safeParse(req.query);
  const scope = parsed.success ? parsed.data.scope ?? "today" : "today";
  const myUserId = req.isAuthenticated() ? req.user.id : null;

  // Admins see all real names
  const requesterProfile = myUserId ? await getOrCreateProfile(myUserId) : null;
  const isAdmin = requesterProfile?.isAdmin ?? false;

  let rows: { userId: string; name: string; gotra: string; city: string; count: number }[] = [];

  if (scope === "today") {
    const today = new Date().toISOString().slice(0, 10);
    const data = await db
      .select({
        userId: profilesTable.userId,
        name: profilesTable.name,
        gotra: profilesTable.gotra,
        city: profilesTable.city,
        count: sql<number>`coalesce(${jaapDailyTable.count}, 0)::int`,
      })
      .from(profilesTable)
      .leftJoin(
        jaapDailyTable,
        and(eq(jaapDailyTable.userId, profilesTable.userId), eq(jaapDailyTable.date, today)),
      )
      .where(eq(profilesTable.approved, true))
      .orderBy(desc(sql`coalesce(${jaapDailyTable.count}, 0)`))
      .limit(10);
    rows = data.map((r) => ({ ...r, count: Number(r.count) }));
  } else if (scope === "week") {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 6);
    const sinceStr = since.toISOString().slice(0, 10);
    const data = await db
      .select({
        userId: profilesTable.userId,
        name: profilesTable.name,
        gotra: profilesTable.gotra,
        city: profilesTable.city,
        count: sql<number>`coalesce(sum(${jaapDailyTable.count}), 0)::int`,
      })
      .from(profilesTable)
      .leftJoin(
        jaapDailyTable,
        and(eq(jaapDailyTable.userId, profilesTable.userId), gte(jaapDailyTable.date, sinceStr)),
      )
      .where(eq(profilesTable.approved, true))
      .groupBy(profilesTable.userId, profilesTable.name, profilesTable.gotra, profilesTable.city)
      .orderBy(desc(sql`coalesce(sum(${jaapDailyTable.count}), 0)`))
      .limit(10);
    rows = data.map((r) => ({ ...r, count: Number(r.count) }));
  } else {
    const data = await db
      .select({
        userId: profilesTable.userId,
        name: profilesTable.name,
        gotra: profilesTable.gotra,
        city: profilesTable.city,
        count: sql<number>`coalesce(${userTotalsTable.totalCount}, 0)::int`,
      })
      .from(profilesTable)
      .leftJoin(userTotalsTable, eq(userTotalsTable.userId, profilesTable.userId))
      .where(eq(profilesTable.approved, true))
      .orderBy(desc(sql`coalesce(${userTotalsTable.totalCount}, 0)`))
      .limit(10);
    rows = data.map((r) => ({ ...r, count: Number(r.count) }));
  }

  // Get streaks for badges
  const streakMap = new Map<string, number>();
  if (rows.length > 0) {
    const totals = await db
      .select({ userId: userTotalsTable.userId, streakDays: userTotalsTable.streakDays, totalCount: userTotalsTable.totalCount })
      .from(userTotalsTable);
    for (const t of totals) streakMap.set(t.userId, t.streakDays);
  }

  const totalsMap = new Map<string, number>();
  if (rows.length > 0 && scope !== "alltime") {
    const totals = await db
      .select({ userId: userTotalsTable.userId, totalCount: userTotalsTable.totalCount })
      .from(userTotalsTable);
    for (const t of totals) totalsMap.set(t.userId, t.totalCount);
  }

  const entries = rows.map((r, i) => {
    const badges: string[] = [];
    if (i === 0 && r.count > 0) badges.push("Maha Bhakt");
    const totalForUser = scope === "alltime" ? r.count : totalsMap.get(r.userId) ?? 0;
    if (totalForUser >= 100000) badges.push("1 Lakh Jaap Club");
    if ((streakMap.get(r.userId) ?? 0) >= 7) badges.push("7 Day Streak");
    const isMe = !!myUserId && myUserId === r.userId;
    const showReal = isMe || isAdmin;
    return {
      rank: i + 1,
      userId: showReal ? r.userId : null,
      name: showReal ? r.name : "अज्ञात भक्त",
      gotra: showReal ? r.gotra : "",
      city: showReal ? r.city : "",
      count: r.count,
      isMe,
      badges,
    };
  });

  res.json({ scope, entries });
});

export default router;
