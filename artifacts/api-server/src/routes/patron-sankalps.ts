import { Router, type IRouter } from "express";
import { db, patronSankalpsTable, mantrasTable, yajamanaTable, jaapDailyTable, sankalpsTable, profilesTable, userTotalsTable, sankalpContributionsTable, sankalpParticipantsTable, payoutsTable } from "@workspace/db";
import { eq, sql, and, desc, or, exists, sum } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile, todayDateString, RUPEE_PER_JAAP, switchUserSankalp, getIncompletePrivateSankalp } from "../lib/jaap-helpers";
import { z } from "zod";

const router: IRouter = Router();

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const profile = await getOrCreateProfile(req.user.id);
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

const PatronSankalpBody = z.object({
  yajamanaId: z.string().min(1),
  mantraId: z.string().min(1),
  goalCount: z.number().int().positive(),
  budgetRs: z.number().positive().nullable().optional(),
  ratePerJaap: z.number().min(0.001).default(0.01),
  purpose: z.string().min(1).max(300).default("Khatu Shyam Ji ki kripa hetu"),
  deadline: z.string().nullable().optional(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
  visibility: z.enum(["public", "private"]).default("public"),
  participantUserIds: z.array(z.string()).optional(),
});

async function getSankalpAccumulated(ps: typeof patronSankalpsTable.$inferSelect): Promise<number> {
  if (ps.finalAccumulated > 0) return ps.finalAccumulated;
  if (ps.status === "completed") return ps.goalCount;

  const [aggRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.patronSankalpId, ps.id));
  const liveSum = Number(aggRow?.total ?? 0);

  const [archiveRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${sankalpContributionsTable.totalJaaps}), 0)` })
    .from(sankalpContributionsTable)
    .where(eq(sankalpContributionsTable.sankalpId, ps.id));
  const archiveSum = Number(archiveRow?.total ?? 0);

  return liveSum + archiveSum;
}

async function getSankalpParticipants(sankalpId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: sankalpParticipantsTable.userId })
    .from(sankalpParticipantsTable)
    .where(eq(sankalpParticipantsTable.sankalpId, sankalpId));
  return rows.map((r) => r.userId);
}

async function serializePatronSankalp(ps: typeof patronSankalpsTable.$inferSelect) {
  const [mantra] = await db.select().from(mantrasTable).where(eq(mantrasTable.id, ps.mantraId)).limit(1);
  const [yajamana] = await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, ps.yajamanaId)).limit(1);

  const accumulated = await getSankalpAccumulated(ps);
  const participants = ps.visibility === "private" ? await getSankalpParticipants(ps.id) : [];

  let effectiveStatus: "active" | "paused" | "completed" = ps.status as "active" | "paused" | "completed";
  if (accumulated >= ps.goalCount && ps.goalCount > 0) {
    effectiveStatus = "completed";
    if (ps.status !== "completed") {
      await db
        .update(patronSankalpsTable)
        .set({ status: "completed", completedAt: new Date(), finalAccumulated: accumulated })
        .where(eq(patronSankalpsTable.id, ps.id));
    } else if (ps.finalAccumulated === 0) {
      await db
        .update(patronSankalpsTable)
        .set({ finalAccumulated: accumulated })
        .where(eq(patronSankalpsTable.id, ps.id));
    }
  } else if (ps.status === "completed") {
    effectiveStatus = "completed";
  }

  return {
    id: ps.id,
    yajamanaId: ps.yajamanaId,
    mantraId: ps.mantraId,
    goalCount: ps.goalCount,
    budgetRs: ps.budgetRs ?? null,
    ratePerJaap: ps.ratePerJaap,
    purpose: ps.purpose,
    deadline: ps.deadline ?? null,
    status: effectiveStatus,
    visibility: ps.visibility as "public" | "private",
    participants,
    createdAt: ps.createdAt.toISOString(),
    completedAt: ps.completedAt?.toISOString() ?? null,
    accumulated,
    mantra: mantra ? {
      id: mantra.id,
      scriptText: mantra.scriptText,
      displayName: mantra.displayName,
    } : null,
    yajamana: yajamana ? {
      id: yajamana.id,
      name: yajamana.name,
      gotra: yajamana.gotra,
      fatherName: yajamana.fatherName ?? null,
      husbandName: yajamana.husbandName ?? null,
      motherName: yajamana.motherName ?? null,
      niwasStan: yajamana.niwasStan,
      status: yajamana.status,
      relation: yajamana.relation,
    } : null,
  };
}

async function syncParticipants(sankalpId: string, participantUserIds: string[] | undefined, visibility: string) {
  await db.delete(sankalpParticipantsTable).where(eq(sankalpParticipantsTable.sankalpId, sankalpId));
  if (visibility === "private" && participantUserIds && participantUserIds.length > 0) {
    await db.insert(sankalpParticipantsTable).values(
      participantUserIds.map((userId) => ({ sankalpId, userId }))
    );
  }
}

router.get("/admin/patron-sankalps", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(patronSankalpsTable).orderBy(patronSankalpsTable.createdAt);
  const result = await Promise.all(rows.map(serializePatronSankalp));
  res.json({ patronSankalps: result });
});

router.get("/patron-sankalps/active", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const profile = await getOrCreateProfile(userId);
  const isAdmin = profile?.isAdmin ?? false;

  const visibilityFilter = isAdmin
    ? undefined
    : or(
        eq(patronSankalpsTable.visibility, "public"),
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(sankalpParticipantsTable)
            .where(
              and(
                eq(sankalpParticipantsTable.sankalpId, patronSankalpsTable.id),
                eq(sankalpParticipantsTable.userId, userId)
              )
            )
        )
      );

  const rows = visibilityFilter
    ? await db
        .select()
        .from(patronSankalpsTable)
        .where(and(eq(patronSankalpsTable.status, "active"), visibilityFilter))
        .orderBy(patronSankalpsTable.createdAt)
    : await db
        .select()
        .from(patronSankalpsTable)
        .where(eq(patronSankalpsTable.status, "active"))
        .orderBy(patronSankalpsTable.createdAt);

  const result = await Promise.all(rows.map(serializePatronSankalp));
  res.json({ patronSankalps: result });
});

router.get("/patron-sankalps/devotee-view", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const today = todayDateString();

  const profile = await getOrCreateProfile(userId);
  const isAdmin = profile?.isAdmin ?? false;

  const [todaySankalp] = isAdmin
    ? [undefined]
    : await db
        .select()
        .from(sankalpsTable)
        .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, today)))
        .limit(1);

  let activeSankalpId = todaySankalp?.patronSankalpId ?? null;

  const eligibleCondition = isAdmin
    ? undefined
    : or(
        eq(patronSankalpsTable.visibility, "public"),
        exists(
          db
            .select({ one: sql<number>`1` })
            .from(sankalpParticipantsTable)
            .where(
              and(
                eq(sankalpParticipantsTable.sankalpId, patronSankalpsTable.id),
                eq(sankalpParticipantsTable.userId, userId)
              )
            )
        )
      );

  const rows = eligibleCondition
    ? await db.select().from(patronSankalpsTable).where(eligibleCondition).orderBy(patronSankalpsTable.createdAt)
    : await db.select().from(patronSankalpsTable).orderBy(patronSankalpsTable.createdAt);

  const serializedAll = await Promise.all(
    rows.map(async (ps) => ({
      ps,
      serialized: await serializePatronSankalp(ps),
    })),
  );

  // Check private priority once for this user (only for non-admin)
  const incompletePrivate = isAdmin ? null : await getIncompletePrivateSankalp(userId);

  if (!isAdmin) {
    if (activeSankalpId) {
      const currentSankalp = serializedAll.find((s) => s.ps.id === activeSankalpId);
      if (currentSankalp && currentSankalp.serialized.accumulated >= currentSankalp.serialized.goalCount) {
        // Current is done — find next (respecting private priority)
        const nextSankalp = incompletePrivate
          ? serializedAll.find((s) => s.ps.id === incompletePrivate.id)
          : serializedAll.find((s) => s.serialized.accumulated < s.serialized.goalCount);

        if (nextSankalp && nextSankalp.ps.id !== activeSankalpId) {
          await switchUserSankalp({
            userId,
            date: today,
            newSankalpId: nextSankalp.ps.id,
            accepted: true,
            existingTodaySankalpId: todaySankalp ? todaySankalp.id : undefined,
          });
          activeSankalpId = nextSankalp.ps.id;
        }
      } else if (incompletePrivate && activeSankalpId !== incompletePrivate.id) {
        // Private priority: user is on a different sankalp but has incomplete private
        await switchUserSankalp({
          userId,
          date: today,
          newSankalpId: incompletePrivate.id,
          accepted: true,
          existingTodaySankalpId: todaySankalp ? todaySankalp.id : undefined,
        });
        activeSankalpId = incompletePrivate.id;
      }
    }

    if (!activeSankalpId) {
      const firstIncomplete = incompletePrivate
        ? serializedAll.find((s) => s.ps.id === incompletePrivate.id)
        : serializedAll.find((s) => s.serialized.accumulated < s.serialized.goalCount);

      if (firstIncomplete) {
        await switchUserSankalp({
          userId,
          date: today,
          newSankalpId: firstIncomplete.ps.id,
          accepted: true,
          existingTodaySankalpId: todaySankalp ? todaySankalp.id : undefined,
        });
        activeSankalpId = firstIncomplete.ps.id;
      }
    }
  }

  const userContributions: Record<string, number> = {};
  for (const item of serializedAll) {
    const [liveRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
      .from(jaapDailyTable)
      .where(and(eq(jaapDailyTable.patronSankalpId, item.ps.id), eq(jaapDailyTable.userId, userId)));
    const liveContrib = Number(liveRow?.total ?? 0);

    const [archiveRow] = await db
      .select({ total: sankalpContributionsTable.totalJaaps })
      .from(sankalpContributionsTable)
      .where(and(eq(sankalpContributionsTable.sankalpId, item.ps.id), eq(sankalpContributionsTable.userId, userId)))
      .limit(1);
    const archiveContrib = Number(archiveRow?.total ?? 0);

    userContributions[item.ps.id] = liveContrib + archiveContrib;
  }

  const result = serializedAll.map((item) => {
    const isActive = item.ps.id === activeSankalpId;
    const isCompleted = item.serialized.accumulated >= item.serialized.goalCount;
    const userAccumulated = userContributions[item.ps.id] ?? 0;
    const globalAccumulated = item.serialized.accumulated;

    // Private priority lock: public sankalps are blocked when user has incomplete private
    const isPrivateLocked = !isAdmin && !isCompleted && !isActive &&
      incompletePrivate !== null && item.ps.visibility === "public";

    return {
      ...item.serialized,
      isActive,
      isCompleted,
      locked: !isActive && !isCompleted,
      privateLocked: isPrivateLocked,
      accumulated: globalAccumulated,
      globalAccumulated,
      userAccumulated,
      remaining: Math.max(0, item.serialized.goalCount - globalAccumulated),
    };
  });

  res.json({ sankalps: result });
});

router.post("/admin/patron-sankalps", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = PatronSankalpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  const { yajamanaId, mantraId, goalCount, budgetRs, ratePerJaap, purpose, deadline, status, visibility, participantUserIds } = parsed.data;
  const [created] = await db
    .insert(patronSankalpsTable)
    .values({ yajamanaId, mantraId, goalCount, budgetRs: budgetRs ?? null, ratePerJaap, purpose, deadline: deadline ?? null, status, visibility })
    .returning();
  await syncParticipants(created!.id, participantUserIds, visibility);
  res.json({ patronSankalp: await serializePatronSankalp(created!) });
});

router.put("/admin/patron-sankalps/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = PatronSankalpBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { participantUserIds, ...rest } = parsed.data;
  const updates: any = { ...rest };
  if (parsed.data.status === "completed") {
    updates.completedAt = new Date();
    const [existing] = await db
      .select()
      .from(patronSankalpsTable)
      .where(eq(patronSankalpsTable.id, String(req.params["id"])))
      .limit(1);
    if (existing && existing.finalAccumulated === 0) {
      const computed = await getSankalpAccumulated(existing);
      updates.finalAccumulated = computed > 0 ? computed : existing.goalCount;
    }
  }
  const [updated] = await db
    .update(patronSankalpsTable)
    .set(updates)
    .where(eq(patronSankalpsTable.id, String(req.params["id"])))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Patron sankalp not found" });
    return;
  }
  if (participantUserIds !== undefined || parsed.data.visibility !== undefined) {
    const vis = updated.visibility;
    await syncParticipants(updated.id, participantUserIds, vis);
  }
  res.json({ patronSankalp: await serializePatronSankalp(updated) });
});

router.delete("/admin/patron-sankalps/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const sankalpId = String(req.params["id"]);

  const [existing] = await db
    .select()
    .from(patronSankalpsTable)
    .where(eq(patronSankalpsTable.id, sankalpId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Sankalp not found" });
    return;
  }

  const [liveJaap] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.patronSankalpId, sankalpId));

  const [archivedJaap] = await db
    .select({ total: sql<number>`COALESCE(SUM(${sankalpContributionsTable.totalJaaps}), 0)` })
    .from(sankalpContributionsTable)
    .where(eq(sankalpContributionsTable.sankalpId, sankalpId));

  const totalJaaps = Number(liveJaap?.total ?? 0) + Number(archivedJaap?.total ?? 0);

  if (totalJaaps > 0) {
    res.status(409).json({ error: "Cannot delete — jaap has already been started on this sankalp. You can only update it." });
    return;
  }

  await db.delete(sankalpParticipantsTable).where(eq(sankalpParticipantsTable.sankalpId, sankalpId));
  await db.delete(patronSankalpsTable).where(eq(patronSankalpsTable.id, sankalpId));
  res.json({ success: true });
});

router.get("/admin/patron-sankalps/:id/contributors", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const sankalpId = String(req.params["id"]);

  // Look up this sankalp's ratePerJaap for accurate earnings display
  const [sankalpRow] = await db
    .select({ ratePerJaap: patronSankalpsTable.ratePerJaap })
    .from(patronSankalpsTable)
    .where(eq(patronSankalpsTable.id, sankalpId))
    .limit(1);
  const ratePerJaap = sankalpRow?.ratePerJaap ?? RUPEE_PER_JAAP;

  const liveContribs = await db
    .select({
      userId: jaapDailyTable.userId,
      totalJaaps: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)`,
    })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.patronSankalpId, sankalpId))
    .groupBy(jaapDailyTable.userId);

  const archivedContribs = await db
    .select()
    .from(sankalpContributionsTable)
    .where(eq(sankalpContributionsTable.sankalpId, sankalpId));

  const merged: Record<string, number> = {};
  for (const c of liveContribs) {
    if (Number(c.totalJaaps) > 0) merged[c.userId] = (merged[c.userId] ?? 0) + Number(c.totalJaaps);
  }
  for (const c of archivedContribs) {
    if (c.totalJaaps > 0) merged[c.userId] = (merged[c.userId] ?? 0) + c.totalJaaps;
  }

  const result = await Promise.all(
    Object.entries(merged)
      .filter(([, jaaps]) => jaaps > 0)
      .map(async ([userId, totalJaaps]) => {
        const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
        return {
          userId,
          userName: profile?.name ?? "Unknown",
          totalJaaps,
          earnings: Number((totalJaaps * ratePerJaap).toFixed(2)),
        };
      }),
  );

  result.sort((a, b) => b.totalJaaps - a.totalJaaps);
  res.json({ contributors: result });
});

router.post("/admin/reset-jaap-data", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  await db.delete(jaapDailyTable);
  await db.delete(sankalpsTable);
  await db.delete(sankalpContributionsTable);
  await db
    .update(userTotalsTable)
    .set({ totalCount: 0, totalEarnings: 0, streakDays: 0, lastJaapDate: null });
  await db
    .update(patronSankalpsTable)
    .set({ status: "active", completedAt: null, finalAccumulated: 0 });
  res.json({ success: true, message: "All jaap data reset to zero" });
});

router.post("/admin/clear-payouts", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  await db.delete(payoutsTable);
  // Recalculate each user's totalEarnings from jaap data so earnings are restored
  const jaapTotals = await db
    .select({
      userId: jaapDailyTable.userId,
      totalEarnings: sql<number>`coalesce(sum(${jaapDailyTable.earnings}), 0)`,
      totalCount: sql<number>`coalesce(sum(${jaapDailyTable.count}), 0)`,
    })
    .from(jaapDailyTable)
    .groupBy(jaapDailyTable.userId);
  for (const row of jaapTotals) {
    await db
      .update(userTotalsTable)
      .set({ totalEarnings: Math.round(Number(row.totalEarnings) * 10000) / 10000 })
      .where(eq(userTotalsTable.userId, row.userId));
  }
  res.json({ success: true, message: "All payout history cleared and earnings restored" });
});

router.get("/patron-sankalps/:id/my-contribution", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const sankalpId = String(req.params["id"]);

  // Look up this sankalp's ratePerJaap
  const [sankalpRow] = await db
    .select({ ratePerJaap: patronSankalpsTable.ratePerJaap })
    .from(patronSankalpsTable)
    .where(eq(patronSankalpsTable.id, sankalpId))
    .limit(1);
  const ratePerJaap = sankalpRow?.ratePerJaap ?? RUPEE_PER_JAAP;

  const [liveResult] = await db
    .select({
      totalJaaps: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)`,
    })
    .from(jaapDailyTable)
    .where(and(eq(jaapDailyTable.patronSankalpId, sankalpId), eq(jaapDailyTable.userId, userId)));
  const liveJaaps = Number(liveResult?.totalJaaps ?? 0);

  const [archiveResult] = await db
    .select({ totalJaaps: sankalpContributionsTable.totalJaaps })
    .from(sankalpContributionsTable)
    .where(and(eq(sankalpContributionsTable.sankalpId, sankalpId), eq(sankalpContributionsTable.userId, userId)))
    .limit(1);
  const archiveJaaps = Number(archiveResult?.totalJaaps ?? 0);

  const totalJaaps = liveJaaps + archiveJaaps;
  const earnings = totalJaaps * ratePerJaap;

  res.json({
    contribution: {
      totalJaaps,
      earnings: Number(earnings.toFixed(2)),
    },
  });
});

export default router;
