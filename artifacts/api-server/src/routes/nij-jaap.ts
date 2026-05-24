import { Router, type IRouter } from "express";
import { db, nijJaapDailyTable, nijJaapTotalsTable, jaapDailyTable, patronSankalpsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile, todayDateString } from "../lib/jaap-helpers";

const router: IRouter = Router();

export const NIJ_JAAP_TARGET = 324;

export async function ensureNijJaapDaily(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(nijJaapDailyTable)
    .where(and(eq(nijJaapDailyTable.userId, userId), eq(nijJaapDailyTable.date, date)))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(nijJaapDailyTable)
    .values({ userId, date, count: 0, sankalpShown: false, samarpanDone: false, timestamps: [] })
    .returning();
  return created!;
}

export async function ensureNijJaapTotals(userId: string) {
  const [row] = await db
    .select()
    .from(nijJaapTotalsTable)
    .where(eq(nijJaapTotalsTable.userId, userId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(nijJaapTotalsTable)
    .values({ userId, totalCount: 0 })
    .returning();
  return created!;
}

async function isBonusNijJaapUnlocked(userId: string, date: string): Promise<boolean> {
  const [daily] = await db
    .select()
    .from(jaapDailyTable)
    .where(and(eq(jaapDailyTable.userId, userId), eq(jaapDailyTable.date, date)))
    .limit(1);
  if (!daily) return false;
  if (daily.count >= 30000) return true;
  if (daily.patronSankalpId) {
    const [ps] = await db
      .select()
      .from(patronSankalpsTable)
      .where(eq(patronSankalpsTable.id, daily.patronSankalpId))
      .limit(1);
    if (ps?.status === "completed") return true;
  }
  return false;
}

function buildNijSnapshot(opts: {
  daily: typeof nijJaapDailyTable.$inferSelect;
  totalCount: number;
  bonusUnlocked: boolean;
  isAdmin: boolean;
}) {
  const { daily, totalCount, bonusUnlocked, isAdmin } = opts;
  const morningDone = daily.samarpanDone;
  return {
    todayCount: daily.count,
    totalCount,
    sankalpShown: daily.sankalpShown,
    samarpanDone: daily.samarpanDone,
    morningDone,
    bonusUnlocked: morningDone ? bonusUnlocked : false,
    target: NIJ_JAAP_TARGET,
    isAdmin,
  };
}

router.get("/nij-jaap/snapshot", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();

  const profile = await getOrCreateProfile(userId);
  const isAdmin = profile?.isAdmin ?? false;

  const daily = await ensureNijJaapDaily(userId, date);
  const totals = await ensureNijJaapTotals(userId);

  const bonusUnlocked = daily.samarpanDone
    ? await isBonusNijJaapUnlocked(userId, date)
    : false;

  res.json({
    snapshot: buildNijSnapshot({
      daily,
      totalCount: totals.totalCount,
      bonusUnlocked,
      isAdmin,
    }),
  });
});

router.post("/nij-jaap/count", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();

  const profile = await getOrCreateProfile(userId);
  if (!profile || !profile.approved) {
    res.status(403).json({ error: "Profile not approved" });
    return;
  }

  const rawCount = Number(req.body?.count ?? 1);
  const inc = Math.max(1, Math.min(isNaN(rawCount) ? 1 : rawCount, 200));

  const daily = await ensureNijJaapDaily(userId, date);

  const morningDone = daily.samarpanDone;
  if (morningDone) {
    const bonus = await isBonusNijJaapUnlocked(userId, date);
    if (!bonus) {
      res.status(403).json({ error: "nij_jaap_bonus_locked" });
      return;
    }
  }

  const now = Date.now();
  const ts = (daily.timestamps as number[]) ?? [];
  const newTs = [...ts.slice(-199), now];
  const newCount = daily.count + inc;

  const [updated] = await db
    .update(nijJaapDailyTable)
    .set({ count: newCount, timestamps: newTs })
    .where(eq(nijJaapDailyTable.id, daily.id))
    .returning();

  const totals = await ensureNijJaapTotals(userId);
  await db
    .update(nijJaapTotalsTable)
    .set({ totalCount: totals.totalCount + inc })
    .where(eq(nijJaapTotalsTable.userId, userId));

  const bonusUnlocked = updated!.samarpanDone
    ? await isBonusNijJaapUnlocked(userId, date)
    : false;

  res.json({
    snapshot: buildNijSnapshot({
      daily: updated!,
      totalCount: totals.totalCount + inc,
      bonusUnlocked,
      isAdmin: profile.isAdmin,
    }),
  });
});

router.post("/nij-jaap/accept-sankalp", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();
  const daily = await ensureNijJaapDaily(userId, date);
  await db
    .update(nijJaapDailyTable)
    .set({ sankalpShown: true })
    .where(eq(nijJaapDailyTable.id, daily.id));
  res.json({ success: true });
});

router.post("/nij-jaap/complete-samarpan", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();
  const daily = await ensureNijJaapDaily(userId, date);
  if (daily.count < NIJ_JAAP_TARGET) {
    res.status(400).json({ error: "Target not reached yet" });
    return;
  }
  await db
    .update(nijJaapDailyTable)
    .set({ samarpanDone: true })
    .where(eq(nijJaapDailyTable.id, daily.id));
  res.json({ success: true });
});

export default router;
