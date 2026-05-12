import crypto from "crypto";
import { Router, type IRouter } from "express";
import { db, payoutsTable, profilesTable, userTotalsTable, usersTable, jaapDailyTable, patronSankalpsTable, yajamanaTable, mantrasTable, sankalpContributionsTable, localCredentialsTable } from "@workspace/db";
import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import { AdminSetApprovalBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile, todayDateString, RUPEE_PER_JAAP } from "../lib/jaap-helpers";

const router: IRouter = Router();

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const profile = await getOrCreateProfile(req.user.id);
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

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

router.get("/admin/users", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db
    .select({
      profile: profilesTable,
      totalCount: userTotalsTable.totalCount,
      totalEarnings: userTotalsTable.totalEarnings,
      email: usersTable.email,
    })
    .from(profilesTable)
    .leftJoin(userTotalsTable, eq(userTotalsTable.userId, profilesTable.userId))
    .leftJoin(usersTable, eq(usersTable.id, profilesTable.userId))
    .orderBy(desc(profilesTable.createdAt));
  res.json({
    users: rows.map((r) => ({
      userId: r.profile.userId,
      profileId: r.profile.id,
      name: r.profile.name,
      gotra: r.profile.gotra,
      city: r.profile.city,
      state: r.profile.state,
      email: r.email ?? null,
      approved: r.profile.approved,
      isAdmin: r.profile.isAdmin,
      phone: r.profile.phone ?? null,
      upiId: r.profile.upiId ?? null,
      totalJaap: r.totalCount ?? 0,
      totalEarnings: Number((r.totalEarnings ?? 0).toFixed?.(2) ?? r.totalEarnings ?? 0),
      suspiciousFlags: r.profile.suspiciousFlags,
      createdAt: r.profile.createdAt.toISOString(),
    })),
  });
});

// Bhakt full profile — for admin detail view
router.get("/admin/users/:userId/profile", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const targetUserId = String(req.params["userId"]);

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, targetUserId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
  const [totals] = await db.select().from(userTotalsTable).where(eq(userTotalsTable.userId, targetUserId)).limit(1);

  // Recent jaap days (last 30)
  const recentDays = await db
    .select()
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.userId, targetUserId))
    .orderBy(desc(jaapDailyTable.date))
    .limit(30);

  // Per-sankalp contributions (live + archived)
  const liveContribs = await db
    .select({
      sankalpId: jaapDailyTable.patronSankalpId,
      total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)`,
    })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.userId, targetUserId))
    .groupBy(jaapDailyTable.patronSankalpId);

  const archivedContribs = await db
    .select()
    .from(sankalpContributionsTable)
    .where(eq(sankalpContributionsTable.userId, targetUserId));

  const sankalpMap: Record<string, number> = {};
  for (const c of liveContribs) {
    if (c.sankalpId && Number(c.total) > 0) sankalpMap[c.sankalpId] = (sankalpMap[c.sankalpId] ?? 0) + Number(c.total);
  }
  for (const c of archivedContribs) {
    if (c.totalJaaps > 0) sankalpMap[c.sankalpId] = (sankalpMap[c.sankalpId] ?? 0) + c.totalJaaps;
  }

  const sankalpContribList = await Promise.all(
    Object.entries(sankalpMap).map(async ([sankalpId, totalJaaps]) => {
      const [ps] = await db.select().from(patronSankalpsTable).where(eq(patronSankalpsTable.id, sankalpId)).limit(1);
      const [yajamana] = ps ? await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, ps.yajamanaId)).limit(1) : [undefined];
      return {
        sankalpId,
        purpose: ps?.purpose ?? "Unknown",
        yajamanaName: yajamana?.name ?? "Unknown",
        totalJaaps,
        earnings: Number((totalJaaps * RUPEE_PER_JAAP).toFixed(2)),
      };
    })
  );
  sankalpContribList.sort((a, b) => b.totalJaaps - a.totalJaaps);

  // Payout history
  const payouts = await db
    .select()
    .from(payoutsTable)
    .where(eq(payoutsTable.userId, targetUserId))
    .orderBy(desc(payoutsTable.requestedAt))
    .limit(20);

  res.json({
    profile: {
      userId: profile.userId,
      name: profile.name,
      gotra: profile.gotra,
      city: profile.city,
      state: profile.state,
      email: user?.email ?? null,
      upiId: profile.upiId ?? null,
      approved: profile.approved,
      isAdmin: profile.isAdmin,
      suspiciousFlags: profile.suspiciousFlags,
      createdAt: profile.createdAt.toISOString(),
      totalJaap: totals?.totalCount ?? 0,
      totalEarnings: Number((totals?.totalEarnings ?? 0).toFixed(2)),
      streakDays: totals?.streakDays ?? 0,
    },
    recentDays: recentDays.map((d) => ({
      date: d.date,
      count: d.count,
      earnings: Number(d.earnings.toFixed(2)),
      suspicious: d.suspicious,
    })),
    sankalpContributions: sankalpContribList,
    payouts: payouts.map((p) => serializePayout(p, profile.name)),
  });
});

router.post("/admin/users/:userId/approve", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = AdminSetApprovalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { approved } = parsed.data;
  const targetUserId = String(req.params.userId);
  const [updated] = await db
    .update(profilesTable)
    .set({ approved })
    .where(eq(profilesTable.userId, targetUserId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [totals] = await db
    .select()
    .from(userTotalsTable)
    .where(eq(userTotalsTable.userId, targetUserId))
    .limit(1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
  res.json({
    user: {
      userId: updated.userId,
      profileId: updated.id,
      name: updated.name,
      gotra: updated.gotra,
      city: updated.city,
      state: updated.state,
      email: user?.email ?? null,
      approved: updated.approved,
      isAdmin: updated.isAdmin,
      totalJaap: totals?.totalCount ?? 0,
      totalEarnings: Number((totals?.totalEarnings ?? 0).toFixed?.(2) ?? totals?.totalEarnings ?? 0),
      suspiciousFlags: updated.suspiciousFlags,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

// Admin-initiated payout — create + immediately mark paid without bhakt request
router.post("/admin/payouts/initiate", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { userId, amount, paymentMethod, paymentNote, upiId } = req.body;
  if (!userId || !amount || !paymentMethod) {
    res.status(400).json({ error: "userId, amount and paymentMethod are required" });
    return;
  }
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [totals] = await db.select().from(userTotalsTable).where(eq(userTotalsTable.userId, userId)).limit(1);
  const balance = totals?.totalEarnings ?? 0;
  if (numAmount > balance) {
    res.status(400).json({ error: "Amount exceeds available balance" });
    return;
  }
  const resolvedUpiId = upiId || profile.upiId || null;
  const now = new Date();
  const [created] = await db
    .insert(payoutsTable)
    .values({
      userId,
      amount: numAmount,
      upiId: resolvedUpiId,
      status: "paid",
      paymentMethod,
      paymentNote: paymentNote || null,
      requestedAt: now,
      resolvedAt: now,
    })
    .returning();
  const newEarnings = Math.max(0, Number((balance - numAmount).toFixed(4)));
  await db.update(userTotalsTable).set({ totalEarnings: newEarnings }).where(eq(userTotalsTable.userId, userId));
  res.json({ payout: serializePayout(created!, profile.name) });
});

router.get("/admin/payouts", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db
    .select({ payout: payoutsTable, name: profilesTable.name })
    .from(payoutsTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, payoutsTable.userId))
    .orderBy(desc(payoutsTable.requestedAt));
  res.json({
    payouts: rows.map((r) => serializePayout(r.payout, r.name ?? "Devotee")),
  });
});

router.post("/admin/payouts/:payoutId", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { status } = req.body;
  if (!status || !["paid", "rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const paymentMethod = req.body.paymentMethod ?? null;
  const paymentNote = req.body.paymentNote ?? null;

  const id = String(req.params.payoutId);
  const [updated] = await db
    .update(payoutsTable)
    .set({
      status,
      resolvedAt: new Date(),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(paymentNote ? { paymentNote } : {}),
    })
    .where(eq(payoutsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, updated.userId))
    .limit(1);

  if (status === "paid") {
    const [totals] = await db
      .select()
      .from(userTotalsTable)
      .where(eq(userTotalsTable.userId, updated.userId))
      .limit(1);
    if (totals) {
      const newEarnings = Math.max(0, Number((totals.totalEarnings - updated.amount).toFixed(4)));
      await db
        .update(userTotalsTable)
        .set({ totalEarnings: newEarnings })
        .where(eq(userTotalsTable.userId, updated.userId));
    }
  }

  res.json({ payout: serializePayout(updated, profile?.name ?? "Devotee") });
});

router.get("/admin/stats", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const today = todayDateString();
  const [agg] = await db
    .select({
      totalUsers: sql<number>`(select count(*)::int from ${profilesTable})`,
      approvedUsers: sql<number>`(select count(*)::int from ${profilesTable} where approved = true)`,
      pendingApproval: sql<number>`(select count(*)::int from ${profilesTable} where approved = false)`,
      totalJaap: sql<number>`coalesce((select sum(total_count)::int from ${userTotalsTable}), 0)`,
      totalPayoutPending: sql<number>`coalesce((select sum(ut.total_earnings)::float from ${userTotalsTable} ut join ${profilesTable} p on p.user_id = ut.user_id where p.approved = true and p.is_admin = false), 0)`,
      totalPayoutPaid: sql<number>`coalesce((select sum(amount)::float from ${payoutsTable} where status = 'paid'), 0)`,
      todayJaap: sql<number>`coalesce((select sum(count)::int from ${jaapDailyTable} where date = ${today}), 0)`,
      todayExpense: sql<number>`coalesce((select sum(earnings)::float from ${jaapDailyTable} where date = ${today}), 0)`,
      totalExpense: sql<number>`coalesce((select sum(total_earnings)::float from ${userTotalsTable}), 0)`,
      activeBhaktsToday: sql<number>`coalesce((select count(distinct user_id)::int from ${jaapDailyTable} where date = ${today} and count > 0), 0)`,
    })
    .from(sql`(select 1) as t`);
  res.json({
    totalUsers: Number(agg!.totalUsers ?? 0),
    approvedUsers: Number(agg!.approvedUsers ?? 0),
    pendingApproval: Number(agg!.pendingApproval ?? 0),
    totalJaap: Number(agg!.totalJaap ?? 0),
    totalPayoutPending: Number((agg!.totalPayoutPending ?? 0)?.toFixed?.(2) ?? agg!.totalPayoutPending ?? 0),
    totalPayoutPaid: Number((agg!.totalPayoutPaid ?? 0)?.toFixed?.(2) ?? agg!.totalPayoutPaid ?? 0),
    todayJaap: Number(agg!.todayJaap ?? 0),
    todayExpense: Number((agg!.todayExpense ?? 0).toFixed?.(2) ?? 0),
    totalExpense: Number((agg!.totalExpense ?? 0).toFixed?.(2) ?? 0),
    activeBhaktsToday: Number(agg!.activeBhaktsToday ?? 0),
  });
});

router.get("/admin/live-report", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const today = todayDateString();

  const bhaktRows = await db
    .select({
      userId: jaapDailyTable.userId,
      count: jaapDailyTable.count,
      earnings: jaapDailyTable.earnings,
      patronSankalpId: jaapDailyTable.patronSankalpId,
      name: profilesTable.name,
    })
    .from(jaapDailyTable)
    .leftJoin(profilesTable, eq(profilesTable.userId, jaapDailyTable.userId))
    .where(eq(jaapDailyTable.date, today))
    .orderBy(desc(jaapDailyTable.count));

  const sankalpRows = await db
    .select({
      ps: patronSankalpsTable,
      yajamana: yajamanaTable,
      mantra: mantrasTable,
    })
    .from(patronSankalpsTable)
    .leftJoin(yajamanaTable, eq(yajamanaTable.id, patronSankalpsTable.yajamanaId))
    .leftJoin(mantrasTable, eq(mantrasTable.id, patronSankalpsTable.mantraId))
    .orderBy(patronSankalpsTable.createdAt);

  // Live (not-yet-archived) accumulated counts from jaapDailyTable
  const accRows = await db
    .select({
      patronSankalpId: jaapDailyTable.patronSankalpId,
      total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)`,
    })
    .from(jaapDailyTable)
    .groupBy(jaapDailyTable.patronSankalpId);

  // Archived accumulated counts from sankalpContributionsTable (completed sankalps)
  const archivedAccRows = await db
    .select({
      sankalpId: sankalpContributionsTable.sankalpId,
      total: sql<number>`COALESCE(SUM(${sankalpContributionsTable.totalJaaps}), 0)`,
    })
    .from(sankalpContributionsTable)
    .groupBy(sankalpContributionsTable.sankalpId);

  // Merge both sources into one map
  const accMap = new Map<string | null, number>();
  for (const r of accRows) {
    accMap.set(r.patronSankalpId, (accMap.get(r.patronSankalpId) ?? 0) + Number(r.total ?? 0));
  }
  for (const r of archivedAccRows) {
    accMap.set(r.sankalpId, (accMap.get(r.sankalpId) ?? 0) + Number(r.total ?? 0));
  }

  const todayAccRows = await db
    .select({
      patronSankalpId: jaapDailyTable.patronSankalpId,
      total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)`,
    })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.date, today))
    .groupBy(jaapDailyTable.patronSankalpId);
  const todayAccMap = new Map(todayAccRows.map((r) => [r.patronSankalpId, Number(r.total ?? 0)]));

  res.json({
    bhakts: bhaktRows.map((r) => ({
      name: r.name ?? "Bhakt",
      todayJaap: r.count,
      todayEarnings: Number(r.earnings.toFixed(2)),
      patronSankalpId: r.patronSankalpId ?? null,
    })),
    sankalps: sankalpRows.map((r) => {
      const accumulated = accMap.get(r.ps.id) ?? 0;
      const todayAccumulated = todayAccMap.get(r.ps.id) ?? 0;
      const budgetUsed = accumulated * RUPEE_PER_JAAP;
      const budgetTotal = r.ps.budgetRs ?? (r.ps.goalCount * RUPEE_PER_JAAP);
      const percent = r.ps.goalCount > 0 ? Math.min(100, (accumulated / r.ps.goalCount) * 100) : 0;
      return {
        id: r.ps.id,
        purpose: r.ps.purpose,
        goalCount: r.ps.goalCount,
        accumulated,
        todayAccumulated,
        budgetUsed: Number(budgetUsed.toFixed(2)),
        budgetTotal: Number(budgetTotal.toFixed(2)),
        percent: Number(percent.toFixed(1)),
        status: accumulated >= r.ps.goalCount ? "completed" : r.ps.status,
        yajamanaName: r.yajamana?.name ?? "—",
        mantraText: r.mantra?.scriptText ?? "—",
        createdAt: r.ps.createdAt,
      };
    }),
  });
});

router.post("/admin/restore-earnings", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const jaapTotals = await db
    .select({
      userId: jaapDailyTable.userId,
      totalEarnings: sql<number>`coalesce(sum(${jaapDailyTable.earnings}), 0)`,
    })
    .from(jaapDailyTable)
    .groupBy(jaapDailyTable.userId);
  for (const row of jaapTotals) {
    await db
      .update(userTotalsTable)
      .set({ totalEarnings: Math.round(Number(row.totalEarnings) * 10000) / 10000 })
      .where(eq(userTotalsTable.userId, row.userId));
  }
  res.json({ success: true, message: `Earnings restored for ${jaapTotals.length} bhakt(s)` });
});

router.post("/admin/users", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const { name, email, password, gotra, city, state } = req.body as {
    name?: string; email?: string; password?: string;
    gotra?: string; city?: string; state?: string;
  };

  if (!name?.trim() || !email?.trim() || !password?.trim() || !gotra?.trim() || !city?.trim() || !state?.trim()) {
    res.status(400).json({ error: "Sabhi fields required hain" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password kam se kam 6 characters ka hona chahiye" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db.select().from(localCredentialsTable).where(eq(localCredentialsTable.email, normalizedEmail)).limit(1);
  if (existing) { res.status(409).json({ error: "Is email se pehle se account bana hua hai" }); return; }
  const [oidcUser] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (oidcUser) { res.status(409).json({ error: "Is email se pehle se account bana hua hai" }); return; }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });

  const [newUser] = await db.insert(usersTable).values({ email: normalizedEmail, firstName: name.trim() }).returning();
  await db.insert(localCredentialsTable).values({ email: normalizedEmail, passwordHash, userId: newUser!.id });

  await db.insert(profilesTable).values({
    userId: newUser!.id,
    name: name.trim(),
    gotra: gotra.trim(),
    city: city.trim(),
    state: state.trim(),
    approved: true,
  });

  res.json({ success: true, userId: newUser!.id });
});

router.put("/admin/users/:userId", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const targetUserId = String(req.params["userId"]);

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, targetUserId)).limit(1);
  if (!profile) { res.status(404).json({ error: "User not found" }); return; }
  if (profile.isAdmin) { res.status(400).json({ error: "Admin ki details edit nahi kar sakte" }); return; }

  const { name, gotra, city, state, phone, upiId, newPassword } = req.body as {
    name?: string; gotra?: string; city?: string; state?: string;
    phone?: string; upiId?: string; newPassword?: string;
  };

  if (name || gotra || city || state || phone !== undefined || upiId !== undefined) {
    const updates: Record<string, any> = {};
    if (name?.trim()) updates.name = name.trim();
    if (gotra?.trim()) updates.gotra = gotra.trim();
    if (city?.trim()) updates.city = city.trim();
    if (state?.trim()) updates.state = state.trim();
    if (phone !== undefined) updates.phone = phone.trim() || null;
    if (upiId !== undefined) updates.upiId = upiId.trim() || null;
    if (Object.keys(updates).length > 0) {
      await db.update(profilesTable).set(updates).where(eq(profilesTable.userId, targetUserId));
    }
  }

  if (newPassword) {
    if (newPassword.length < 6) { res.status(400).json({ error: "Password kam se kam 6 characters ka hona chahiye" }); return; }
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = await new Promise<string>((resolve, reject) => {
      crypto.scrypt(newPassword, salt, 64, (err, key) => {
        if (err) reject(err);
        else resolve(`${salt}:${key.toString("hex")}`);
      });
    });
    const [creds] = await db.select().from(localCredentialsTable).where(eq(localCredentialsTable.userId, targetUserId)).limit(1);
    if (creds) {
      await db.update(localCredentialsTable).set({ passwordHash }).where(eq(localCredentialsTable.userId, targetUserId));
    }
  }

  res.json({ success: true });
});

router.delete("/admin/users/:userId", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const targetUserId = String(req.params["userId"]);

  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, targetUserId)).limit(1);
  if (!profile) { res.status(404).json({ error: "User not found" }); return; }
  if (profile.isAdmin) { res.status(400).json({ error: "Admin user ko delete nahi kar sakte" }); return; }

  await db.delete(payoutsTable).where(eq(payoutsTable.userId, targetUserId));
  await db.delete(sankalpContributionsTable).where(eq(sankalpContributionsTable.userId, targetUserId));
  await db.delete(jaapDailyTable).where(eq(jaapDailyTable.userId, targetUserId));
  await db.delete(userTotalsTable).where(eq(userTotalsTable.userId, targetUserId));
  await db.delete(profilesTable).where(eq(profilesTable.userId, targetUserId));
  await db.delete(usersTable).where(eq(usersTable.id, targetUserId));

  res.json({ success: true });
});

router.get("/admin/period-breakdown", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const period = (req.query.period as string) || "today";
  const istDate = (offsetDaysBack: number): string =>
    new Date(Date.now() - offsetDaysBack * 24 * 60 * 60 * 1000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let sinceStr: string;
  let untilStr: string | null = null;
  if (period === "today") {
    sinceStr = istDate(0);
  } else if (period === "yesterday") {
    sinceStr = istDate(1);
    untilStr = istDate(1);
  } else if (period === "7days") {
    sinceStr = istDate(6);
  } else if (period === "30days") {
    sinceStr = istDate(29);
  } else {
    sinceStr = "2000-01-01";
  }
  const rows = await db
    .select({
      userId: jaapDailyTable.userId,
      name: profilesTable.name,
      totalJaap: sql<number>`coalesce(sum(${jaapDailyTable.count}), 0)`,
      totalEarnings: sql<number>`coalesce(sum(${jaapDailyTable.earnings}), 0)`,
    })
    .from(jaapDailyTable)
    .innerJoin(profilesTable, eq(profilesTable.userId, jaapDailyTable.userId))
    .where(
      untilStr
        ? sql`${jaapDailyTable.date} >= ${sinceStr} AND ${jaapDailyTable.date} <= ${untilStr}`
        : sql`${jaapDailyTable.date} >= ${sinceStr}`
    )
    .groupBy(jaapDailyTable.userId, profilesTable.name)
    .orderBy(sql`sum(${jaapDailyTable.count}) desc`);
  res.json({
    period,
    bhakts: rows.map(r => ({
      name: r.name,
      jaap: Number(r.totalJaap),
      earnings: Number(r.totalEarnings),
    })),
  });
});

router.get("/admin/aggregate-history", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const days = 30;
  const istDateString = (offsetDaysBack: number): string =>
    new Date(Date.now() - offsetDaysBack * 24 * 60 * 60 * 1000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const sinceStr = istDateString(days - 1);
  const rows = await db
    .select({
      date: jaapDailyTable.date,
      totalJaap: sql<number>`coalesce(sum(${jaapDailyTable.count}), 0)`,
      totalEarnings: sql<number>`coalesce(sum(${jaapDailyTable.earnings}), 0)`,
    })
    .from(jaapDailyTable)
    .where(sql`${jaapDailyTable.date} >= ${sinceStr}`)
    .groupBy(jaapDailyTable.date);
  const map = new Map(rows.map((r) => [r.date, { jaap: Number(r.totalJaap), earnings: Number(r.totalEarnings) }]));
  const result: { date: string; jaap: number; earnings: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ds = istDateString(i);
    const entry = map.get(ds);
    result.push({ date: ds, jaap: entry?.jaap ?? 0, earnings: entry?.earnings ?? 0 });
  }
  res.json({ days: result });
});

export default router;
