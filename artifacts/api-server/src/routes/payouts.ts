import { Router, type IRouter } from "express";
import { db, payoutsTable, profilesTable, userTotalsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { RequestPayoutBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile } from "../lib/jaap-helpers";

const router: IRouter = Router();

function serializePayout(p: typeof payoutsTable.$inferSelect, devoteeName: string) {
  return {
    id: p.id,
    userId: p.userId,
    devoteeName,
    amount: p.amount,
    status: p.status as "pending" | "paid" | "rejected",
    upiId: p.upiId ?? null,
    paymentMethod: p.paymentMethod ?? null,
    paymentNote: p.paymentNote ?? null,
    requestedAt: p.requestedAt.toISOString(),
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
  };
}

router.get("/payouts", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const profile = await getOrCreateProfile(userId);
  const rows = await db
    .select()
    .from(payoutsTable)
    .where(eq(payoutsTable.userId, userId))
    .orderBy(desc(payoutsTable.requestedAt));
  res.json({
    payouts: rows.map((r) => serializePayout(r, profile?.name ?? "Devotee")),
  });
});

router.post("/payouts", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const parsed = RequestPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payout request" });
    return;
  }
  const { amount, upiId } = parsed.data;
  const profile = await getOrCreateProfile(userId);
  if (!profile) {
    res.status(400).json({ error: "Profile not set up" });
    return;
  }
  const [totals] = await db
    .select()
    .from(userTotalsTable)
    .where(eq(userTotalsTable.userId, userId))
    .limit(1);
  const balance = totals?.totalEarnings ?? 0;
  if (amount > balance) {
    res.status(400).json({ error: "Amount exceeds available balance" });
    return;
  }
  const [created] = await db
    .insert(payoutsTable)
    .values({ userId, amount, upiId: upiId ?? null, status: "pending" })
    .returning();
  if (upiId && (!profile.upiId || profile.upiId !== upiId)) {
    await db.update(profilesTable).set({ upiId }).where(eq(profilesTable.id, profile.id));
  }
  res.json({ payout: serializePayout(created!, profile.name) });
});

export default router;
