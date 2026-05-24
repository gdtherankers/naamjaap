import { Router, type IRouter } from "express";
import { db, jaapDailyTable, sankalpsTable, userTotalsTable, profilesTable, mantrasTable, patronSankalpsTable, yajamanaTable, sankalpContributionsTable, nijJaapDailyTable } from "@workspace/db";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { AddJaapCountBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  RUPEE_PER_JAAP,
  buildSnapshot,
  computeStreak,
  ensureJaapDaily,
  ensureUserTotals,
  getOrCreateProfile,
  getSankalpRatePerJaap,
  resolveActivePatronSankalpId,
  todayDateString,
  yesterdayDateString,
} from "../lib/jaap-helpers";

const router: IRouter = Router();

// ── SSE: Real-time sankalp count broadcast ────────────────────────────────────
const sseClients = new Set<import("express").Response>();

setInterval(() => {
  const ping = ": ping\n\n";
  for (const res of sseClients) {
    try {
      res.write(ping);
    } catch {
      sseClients.delete(res);
    }
  }
}, 25000);

async function broadcastSankalpCount(patronSankalpId: string): Promise<void> {
  if (sseClients.size === 0) return;
  const [agg] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.patronSankalpId, patronSankalpId));
  const accumulated = Number(agg?.total ?? 0);
  const msg = `data: ${JSON.stringify({ sankalpId: patronSankalpId, accumulated })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

router.get("/jaap/live", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

async function getActiveMantraText(patronSankalpId: string | null | undefined): Promise<string> {
  if (!patronSankalpId) return "जय श्री श्याम";
  const [ps] = await db.select().from(patronSankalpsTable).where(eq(patronSankalpsTable.id, patronSankalpId)).limit(1);
  if (!ps) return "जय श्री श्याम";
  const [mantra] = await db.select().from(mantrasTable).where(eq(mantrasTable.id, ps.mantraId)).limit(1);
  return mantra?.scriptText ?? "जय श्री श्याम";
}

router.get("/jaap/snapshot", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();
  const totals = await ensureUserTotals(userId);
  const daily = await ensureJaapDaily(userId, date);

  const profile = await getOrCreateProfile(userId);
  const isAdmin = profile?.isAdmin ?? false;

  const resolvedPatronSankalpId = await resolveActivePatronSankalpId(userId, date);
  const allSankalpsDone = resolvedPatronSankalpId === null;
  // Do NOT fall back to daily.patronSankalpId — it may point to a private sankalp
  // the user is no longer eligible for (stale assignment).
  const patronSankalpId = resolvedPatronSankalpId;

  const activeMantraText = await getActiveMantraText(patronSankalpId);

  let currentSankalp: any = null;
  if (patronSankalpId) {
    const [ps] = await db.select().from(patronSankalpsTable).where(eq(patronSankalpsTable.id, patronSankalpId)).limit(1);
    if (ps) {
      let globalAccumulated: number;
      if (ps.finalAccumulated > 0) {
        globalAccumulated = ps.finalAccumulated;
      } else if (ps.status === "completed") {
        globalAccumulated = ps.goalCount;
      } else {
        const [globalAgg] = await db
          .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
          .from(jaapDailyTable)
          .where(eq(jaapDailyTable.patronSankalpId, ps.id));
        globalAccumulated = Number(globalAgg?.total ?? 0);
      }

      const [userLiveAgg] = await db
        .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
        .from(jaapDailyTable)
        .where(and(eq(jaapDailyTable.patronSankalpId, ps.id), eq(jaapDailyTable.userId, userId)));
      const userLive = Number(userLiveAgg?.total ?? 0);
      const [archiveRow] = await db
        .select({ total: sankalpContributionsTable.totalJaaps })
        .from(sankalpContributionsTable)
        .where(and(eq(sankalpContributionsTable.sankalpId, ps.id), eq(sankalpContributionsTable.userId, userId)))
        .limit(1);
      const userAccumulated = userLive + Number(archiveRow?.total ?? 0);

      const [yajamana] = await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, ps.yajamanaId)).limit(1);
      currentSankalp = {
        id: ps.id,
        goalCount: ps.goalCount,
        accumulated: globalAccumulated,
        userAccumulated,
        remaining: Math.max(0, ps.goalCount - globalAccumulated),
        yajamanaName: yajamana?.name ?? "Unknown",
        purpose: ps.purpose,
        ratePerJaap: ps.ratePerJaap,
      };
    }
  }

  const [todaySankalpForSnapshot] = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)))
    .limit(1);

  let pendingSankalpAcceptance: any = null;
  if (!isAdmin && patronSankalpId && todaySankalpForSnapshot) {
    const [ps] = await db.select().from(patronSankalpsTable).where(eq(patronSankalpsTable.id, patronSankalpId)).limit(1);
    if (ps) {
      const [yajamana] = await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, ps.yajamanaId)).limit(1);
      const [mantra] = await db.select().from(mantrasTable).where(eq(mantrasTable.id, ps.mantraId)).limit(1);

      // completedSankalpInfo only shown when this is a genuine new sankalp (not yet accepted today)
      let completedSankalpInfo: any = null;
      if (!todaySankalpForSnapshot.accepted) {
        const [lastContrib] = await db
          .select()
          .from(sankalpContributionsTable)
          .where(and(eq(sankalpContributionsTable.userId, userId), ne(sankalpContributionsTable.sankalpId, patronSankalpId)))
          .orderBy(desc(sankalpContributionsTable.updatedAt))
          .limit(1);
        if (lastContrib) {
          const [completedPs] = await db.select().from(patronSankalpsTable).where(eq(patronSankalpsTable.id, lastContrib.sankalpId)).limit(1);
          if (completedPs) {
            const [completedYajamana] = await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, completedPs.yajamanaId)).limit(1);
            const [completedMantra] = await db.select().from(mantrasTable).where(eq(mantrasTable.id, completedPs.mantraId)).limit(1);
            completedSankalpInfo = {
              myContribution: lastContrib.totalJaaps,
              yajamanaName: completedYajamana?.name ?? "",
              yajamanaGotra: completedYajamana?.gotra ?? "",
              yajamanaFatherName: completedYajamana?.fatherName ?? null,
              yajamanaHusbandName: completedYajamana?.husbandName ?? null,
              niwasStan: completedYajamana?.niwasStan ?? "",
              yajamanaStatus: completedYajamana?.status ?? "jiwit",
              mantraScript: completedMantra?.scriptText ?? "जय श्री श्याम",
              purpose: completedPs.purpose,
              devoteeName: profile?.name ?? "",
              devoteeGotra: profile?.gotra ?? "",
              gender: profile?.gender ?? "male",
            };
          }
        }
      }

      pendingSankalpAcceptance = {
        patronSankalpId: ps.id,
        yajamanaName: yajamana?.name ?? "Unknown",
        yajamanaGotra: yajamana?.gotra ?? "",
        yajamanaRelation: yajamana?.relation ?? "self",
        niwasStan: yajamana?.niwasStan ?? "",
        purpose: ps.purpose,
        goalCount: ps.goalCount,
        mantraText: mantra?.scriptText ?? "जय श्री श्याम",
        ratePerJaap: ps.ratePerJaap,
        devoteeName: profile?.name ?? "",
        devoteeGotra: profile?.gotra ?? "",
        gender: profile?.gender ?? "male",
        completedSankalpInfo,
      };
    }
  }

  const [nijDailySnap] = await db
    .select()
    .from(nijJaapDailyTable)
    .where(and(eq(nijJaapDailyTable.userId, userId), eq(nijJaapDailyTable.date, date)))
    .limit(1);

  const nijJaapRequired = !isAdmin && !(nijDailySnap?.samarpanDone ?? false);
  const nijJaapTodayCount = nijDailySnap?.count ?? 0;

  res.json({
    snapshot: {
      ...buildSnapshot({
        todayCount: daily.count,
        totalCount: totals.totalCount,
        todayEarnings: daily.earnings,
        totalEarnings: totals.totalEarnings,
        sankalpAccepted: !!todaySankalpForSnapshot?.accepted,
        streakDays: totals.streakDays,
      }),
      activeMantraText,
      activePatronSankalpId: patronSankalpId,
      currentSankalp,
      pendingSankalpAcceptance,
      allSankalpsDone,
      nijJaapRequired,
      nijJaapTodayCount,
    },
  });
});

router.post("/jaap/accept-patron-sankalp", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();

  const [todaySankalp] = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)))
    .limit(1);

  if (!todaySankalp || !todaySankalp.patronSankalpId) {
    res.status(404).json({ error: "No pending sankalp to accept" });
    return;
  }

  await db
    .update(sankalpsTable)
    .set({ accepted: true, acceptedAt: new Date() })
    .where(eq(sankalpsTable.id, todaySankalp.id));

  res.json({ success: true });
});

router.post("/jaap/count", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const parsed = AddJaapCountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid jaap payload" });
    return;
  }
  const { count, intervalMs } = parsed.data;
  const date = todayDateString();

  const profile = await getOrCreateProfile(userId);
  if (!profile) {
    res.status(403).json({ error: "Profile not set up" });
    return;
  }
  if (!profile.approved) {
    res.status(403).json({ error: "Account awaiting admin approval" });
    return;
  }

  const isAdmin = profile.isAdmin;

  if (!isAdmin) {
    const [nijDaily] = await db
      .select()
      .from(nijJaapDailyTable)
      .where(and(eq(nijJaapDailyTable.userId, userId), eq(nijJaapDailyTable.date, date)))
      .limit(1);
    if (!nijDaily?.samarpanDone) {
      res.status(403).json({ error: "nij_jaap_required" });
      return;
    }
  }

  // Resolve patron sankalp FIRST (before earnings calc) so we can use its rate
  let patronSankalpId: string | null = null;
  if (!isAdmin) {
    patronSankalpId = await resolveActivePatronSankalpId(userId, date);
    if (patronSankalpId === null) {
      res.status(403).json({ error: "all_sankalps_done" });
      return;
    }
  }

  // Look up this sankalp's custom rate-per-jaap
  const ratePerJaap = patronSankalpId
    ? await getSankalpRatePerJaap(patronSankalpId)
    : RUPEE_PER_JAAP;

  const daily = await ensureJaapDaily(userId, date);
  const totals = await ensureUserTotals(userId);

  const now = Date.now();
  const ts = (daily.timestamps as number[]) ?? [];
  const last = ts.length > 0 ? ts[ts.length - 1]! : 0;
  const sinceLast = now - last;

  let suspicious = daily.suspicious;
  let suspiciousIncrement = 0;
  const avgMs = count > 0 ? Math.max(intervalMs, sinceLast) / count : 0;
  if (last > 0 && avgMs > 0 && avgMs < 200) {
    suspicious = true;
    suspiciousIncrement = 1;
  }

  const inc = Math.max(1, Math.min(count, 200));
  const newCount = daily.count + inc;
  const newEarnings = Number((daily.earnings + inc * ratePerJaap).toFixed(4));
  const newTs = [...ts.slice(-199), now];

  // Re-fetch daily after resolveActivePatronSankalpId (it may have updated patronSankalpBaseCount)
  const [freshDaily] = await db
    .select()
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.id, daily.id))
    .limit(1);

  const [updatedDaily] = await db
    .update(jaapDailyTable)
    .set({
      count: newCount,
      earnings: newEarnings,
      timestamps: newTs,
      suspicious,
      patronSankalpId,
    })
    .where(eq(jaapDailyTable.id, daily.id))
    .returning();

  const newTotal = Number(totals.totalCount) + inc;
  const newTotalEarnings = Number((Number(totals.totalEarnings) + inc * ratePerJaap).toFixed(4));
  const today = todayDateString();
  const yesterday = yesterdayDateString();
  const newStreak = computeStreak(totals.lastJaapDate, today, yesterday, totals.streakDays, newCount);

  const [updatedTotals] = await db
    .update(userTotalsTable)
    .set({
      totalCount: newTotal,
      totalEarnings: newTotalEarnings,
      streakDays: newStreak,
      lastJaapDate: today,
    })
    .where(eq(userTotalsTable.userId, userId))
    .returning();

  if (suspiciousIncrement > 0) {
    await db
      .update(profilesTable)
      .set({ suspiciousFlags: profile.suspiciousFlags + suspiciousIncrement })
      .where(eq(profilesTable.id, profile.id));
  }

  const activeMantraText = await getActiveMantraText(patronSankalpId);

  if (patronSankalpId) {
    broadcastSankalpCount(patronSankalpId).catch(() => {});
  }

  res.json({
    snapshot: {
      ...buildSnapshot({
        todayCount: updatedDaily!.count,
        totalCount: updatedTotals!.totalCount,
        todayEarnings: updatedDaily!.earnings,
        totalEarnings: updatedTotals!.totalEarnings,
        sankalpAccepted: true,
        streakDays: updatedTotals!.streakDays,
      }),
      activeMantraText,
      activePatronSankalpId: patronSankalpId,
    },
  });
});

export default router;
