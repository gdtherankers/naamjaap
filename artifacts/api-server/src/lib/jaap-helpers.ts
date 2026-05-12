import { db, profilesTable, jaapDailyTable, userTotalsTable, patronSankalpsTable, sankalpsTable, sankalpContributionsTable, sankalpParticipantsTable } from "@workspace/db";
import { and, eq, or, sql, exists } from "drizzle-orm";

export const RUPEE_PER_JAAP = 0.01;
export const DAILY_TARGET = 25000;

export const MILESTONES: Array<{ count: number; reward: number; label: string }> = [
  { count: 1008, reward: 10, label: "Sankalp Pura" },
  { count: 10000, reward: 50, label: "Maha Jaap" },
  { count: 25000, reward: 250, label: "Bhakti Ratna" },
  { count: 100000, reward: 1000, label: "1 Lakh Jaap Club" },
];

const IST_TZ = "Asia/Kolkata";

export function todayDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST_TZ });
}

export function yesterdayDateString(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: IST_TZ });
}

export async function getOrCreateProfile(userId: string) {
  const [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  return existing ?? null;
}

export async function ensureUserTotals(userId: string) {
  const [existing] = await db
    .select()
    .from(userTotalsTable)
    .where(eq(userTotalsTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(userTotalsTable)
    .values({ userId })
    .returning();
  return created!;
}

export async function ensureJaapDaily(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(jaapDailyTable)
    .where(and(eq(jaapDailyTable.userId, userId), eq(jaapDailyTable.date, date)))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(jaapDailyTable)
    .values({ userId, date, count: 0, earnings: 0, timestamps: [] })
    .returning();
  return created!;
}

export function computeStreak(lastJaapDate: string | null, today: string, yesterday: string, currentStreak: number, todayCountAfter: number): number {
  if (todayCountAfter === 0) return currentStreak;
  if (!lastJaapDate) return 1;
  if (lastJaapDate === today) return currentStreak === 0 ? 1 : currentStreak;
  if (lastJaapDate === yesterday) return currentStreak + 1;
  return 1;
}

export function buildSnapshot(opts: {
  todayCount: number;
  totalCount: number;
  todayEarnings: number;
  totalEarnings: number;
  sankalpAccepted: boolean;
  streakDays: number;
}) {
  const todayMalas = Math.floor(opts.todayCount / 108);
  const totalMalas = Math.floor(opts.totalCount / 108);
  return {
    todayCount: opts.todayCount,
    totalCount: opts.totalCount,
    todayEarnings: Number(opts.todayEarnings.toFixed(2)),
    totalEarnings: Number(opts.totalEarnings.toFixed(2)),
    sankalpAccepted: opts.sankalpAccepted,
    streakDays: opts.streakDays,
    todayMalas,
    totalMalas,
  };
}

/**
 * Returns a Drizzle WHERE condition that matches sankalps eligible for the given user.
 * A sankalp is eligible if:
 *   - visibility = 'public'
 *   - OR visibility = 'private' AND user is listed in sankalp_participants
 */
export function userEligibleCondition(userId: string) {
  return or(
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
}

/**
 * Finds the first incomplete private sankalp the user is a participant of.
 * Returns null if no such sankalp exists (user can work on public sankalps freely).
 *
 * Private Priority Rule: if this returns a sankalp, the user MUST complete it
 * before being routed to any public sankalp.
 */
export async function getIncompletePrivateSankalp(
  userId: string
): Promise<typeof patronSankalpsTable.$inferSelect | null> {
  const privateRows = await db
    .select()
    .from(patronSankalpsTable)
    .where(
      and(
        eq(patronSankalpsTable.status, "active"),
        eq(patronSankalpsTable.visibility, "private"),
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
      )
    )
    .orderBy(patronSankalpsTable.createdAt);

  for (const ps of privateRows) {
    const [agg] = await db
      .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
      .from(jaapDailyTable)
      .where(eq(jaapDailyTable.patronSankalpId, ps.id));
    const accumulated = Number(agg?.total ?? 0);

    if (accumulated < ps.goalCount) return ps;

    // This private sankalp is done — mark it completed
    await db
      .update(patronSankalpsTable)
      .set({ status: "completed", completedAt: new Date(), finalAccumulated: accumulated })
      .where(eq(patronSankalpsTable.id, ps.id));
  }

  return null;
}

/**
 * Look up the rate-per-jaap for the given sankalp.
 * Falls back to global RUPEE_PER_JAAP if sankalp not found.
 */
export async function getSankalpRatePerJaap(sankalpId: string): Promise<number> {
  const [row] = await db
    .select({ ratePerJaap: patronSankalpsTable.ratePerJaap })
    .from(patronSankalpsTable)
    .where(eq(patronSankalpsTable.id, sankalpId))
    .limit(1);
  return row?.ratePerJaap ?? RUPEE_PER_JAAP;
}

/**
 * Switches a user's active sankalp to a new one.
 */
export async function switchUserSankalp(opts: {
  userId: string;
  date: string;
  newSankalpId: string;
  accepted: boolean;
  existingTodaySankalpId?: string;
  oldSankalpId?: string;
}): Promise<void> {
  const { userId, date, newSankalpId, accepted, existingTodaySankalpId, oldSankalpId } = opts;

  const [dailyRow] = await db
    .select()
    .from(jaapDailyTable)
    .where(and(eq(jaapDailyTable.userId, userId), eq(jaapDailyTable.date, date)))
    .limit(1);
  const baseCount = dailyRow?.count ?? 0;

  const prevSankalpId = oldSankalpId ?? dailyRow?.patronSankalpId ?? null;
  if (prevSankalpId && prevSankalpId !== newSankalpId && dailyRow) {
    const userContrib = dailyRow.count - (dailyRow.patronSankalpBaseCount ?? 0);
    if (userContrib > 0) {
      await db
        .insert(sankalpContributionsTable)
        .values({ sankalpId: prevSankalpId, userId, totalJaaps: userContrib })
        .onConflictDoUpdate({
          target: [sankalpContributionsTable.sankalpId, sankalpContributionsTable.userId],
          set: {
            totalJaaps: sql`${sankalpContributionsTable.totalJaaps} + ${userContrib}`,
          },
        });
    }
  }

  if (existingTodaySankalpId !== undefined) {
    await db
      .update(sankalpsTable)
      .set({ patronSankalpId: newSankalpId, accepted, acceptedAt: accepted ? new Date() : null })
      .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)));
  } else {
    await db
      .insert(sankalpsTable)
      .values({ userId, date, patronSankalpId: newSankalpId, accepted, text: "श्री श्याम जाप संकल्प" });
  }

  if (dailyRow) {
    await db
      .update(jaapDailyTable)
      .set({
        patronSankalpId: newSankalpId,
        patronSankalpBaseCount: baseCount,
      })
      .where(eq(jaapDailyTable.id, dailyRow.id));
  }
}

/**
 * Finds the next genuinely-incomplete eligible sankalp and switches the user to it.
 *
 * Private Priority: if user has an incomplete private sankalp, they are always
 * routed to that first before any public sankalp.
 *
 * Returns null if all eligible sankalps are done.
 */
async function findAndSwitchToNextSankalp({
  userId,
  date,
  currentSankalpId,
  todaySankalpId,
}: {
  userId: string;
  date: string;
  currentSankalpId: string;
  todaySankalpId?: string;
}): Promise<string | null> {
  // PRIVATE PRIORITY: check for any incomplete private sankalp first
  const incompletePrivate = await getIncompletePrivateSankalp(userId);
  if (incompletePrivate && incompletePrivate.id !== currentSankalpId) {
    await switchUserSankalp({
      userId,
      date,
      newSankalpId: incompletePrivate.id,
      accepted: false,
      existingTodaySankalpId: todaySankalpId,
      oldSankalpId: currentSankalpId,
    });
    return incompletePrivate.id;
  }

  // No private priority — find next eligible (public or private participant)
  const allEligibleActive = await db
    .select()
    .from(patronSankalpsTable)
    .where(
      and(
        eq(patronSankalpsTable.status, "active"),
        userEligibleCondition(userId)
      )
    )
    .orderBy(patronSankalpsTable.createdAt);

  for (const ps of allEligibleActive) {
    if (ps.id === currentSankalpId) continue;

    const [agg] = await db
      .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
      .from(jaapDailyTable)
      .where(eq(jaapDailyTable.patronSankalpId, ps.id));
    const accumulated = Number(agg?.total ?? 0);

    if (accumulated >= ps.goalCount) {
      await db
        .update(patronSankalpsTable)
        .set({ status: "completed", completedAt: new Date(), finalAccumulated: accumulated })
        .where(eq(patronSankalpsTable.id, ps.id));
      continue;
    }

    await switchUserSankalp({
      userId,
      date,
      newSankalpId: ps.id,
      accepted: false,
      existingTodaySankalpId: todaySankalpId,
      oldSankalpId: currentSankalpId,
    });
    return ps.id;
  }

  return null;
}

/**
 * Resolves the correct active patronSankalpId for a user.
 *
 * Private Priority: if user is assigned to a public sankalp but has an incomplete
 * private sankalp, they are automatically switched to the private one.
 */
export async function resolveActivePatronSankalpId(userId: string, date: string): Promise<string | null> {
  const [todaySankalp] = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)))
    .limit(1);

  const activeSankalpId = todaySankalp?.patronSankalpId ?? null;
  if (!activeSankalpId) {
    // No today sankalp yet — check if user has an incomplete private sankalp assigned
    const incompletePrivate = await getIncompletePrivateSankalp(userId);
    if (incompletePrivate) {
      await switchUserSankalp({
        userId,
        date,
        newSankalpId: incompletePrivate.id,
        accepted: false,
        existingTodaySankalpId: todaySankalp ? todaySankalp.id : undefined,
      });
      return incompletePrivate.id;
    }
    // No private sankalp — check for any eligible active public sankalp
    const allEligibleActive = await db
      .select()
      .from(patronSankalpsTable)
      .where(and(eq(patronSankalpsTable.status, "active"), userEligibleCondition(userId)))
      .orderBy(patronSankalpsTable.createdAt);
    for (const ps of allEligibleActive) {
      const [agg] = await db
        .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
        .from(jaapDailyTable)
        .where(eq(jaapDailyTable.patronSankalpId, ps.id));
      const accumulated = Number(agg?.total ?? 0);
      if (accumulated < ps.goalCount) {
        await switchUserSankalp({
          userId,
          date,
          newSankalpId: ps.id,
          accepted: false,
          existingTodaySankalpId: todaySankalp ? todaySankalp.id : undefined,
        });
        return ps.id;
      }
    }
    return null;
  }

  const [dailyRow] = await db
    .select()
    .from(jaapDailyTable)
    .where(and(eq(jaapDailyTable.userId, userId), eq(jaapDailyTable.date, date)))
    .limit(1);

  if (dailyRow && dailyRow.patronSankalpId !== activeSankalpId) {
    await db
      .update(jaapDailyTable)
      .set({
        patronSankalpId: activeSankalpId,
        patronSankalpBaseCount: dailyRow.count,
      })
      .where(eq(jaapDailyTable.id, dailyRow.id));
    return activeSankalpId;
  }

  const [activeSankalp] = await db
    .select()
    .from(patronSankalpsTable)
    .where(eq(patronSankalpsTable.id, activeSankalpId))
    .limit(1);

  if (!activeSankalp) return activeSankalpId;

  // Verify user is still eligible for the currently assigned sankalp.
  // A private sankalp may have been reassigned to someone else, or the user
  // was never supposed to see it (stale DB row from before the privacy fix).
  if (activeSankalp.visibility === "private") {
    const [participantRow] = await db
      .select({ one: sql<number>`1` })
      .from(sankalpParticipantsTable)
      .where(
        and(
          eq(sankalpParticipantsTable.sankalpId, activeSankalpId),
          eq(sankalpParticipantsTable.userId, userId)
        )
      )
      .limit(1);
    if (!participantRow) {
      // Not a participant — clear this assignment and find next eligible
      await db
        .update(sankalpsTable)
        .set({ patronSankalpId: null })
        .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)));
      await db
        .update(jaapDailyTable)
        .set({ patronSankalpId: null })
        .where(and(eq(jaapDailyTable.userId, userId), eq(jaapDailyTable.date, date)));
      return await findAndSwitchToNextSankalp({
        userId,
        date,
        currentSankalpId: activeSankalpId,
        todaySankalpId: todaySankalp ? todaySankalp.id : undefined,
      });
    }
  }

  if (activeSankalp.status === "completed") {
    return await findAndSwitchToNextSankalp({
      userId,
      date,
      currentSankalpId: activeSankalpId,
      todaySankalpId: todaySankalp ? todaySankalp.id : undefined,
    });
  }

  if (activeSankalp.status !== "active") return activeSankalpId;

  const [aggRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${jaapDailyTable.count} - ${jaapDailyTable.patronSankalpBaseCount}), 0)` })
    .from(jaapDailyTable)
    .where(eq(jaapDailyTable.patronSankalpId, activeSankalpId));
  const globalAccumulated = Number(aggRow?.total ?? 0);

  if (globalAccumulated >= activeSankalp.goalCount) {
    await db
      .update(patronSankalpsTable)
      .set({ status: "completed", completedAt: new Date(), finalAccumulated: globalAccumulated })
      .where(eq(patronSankalpsTable.id, activeSankalpId));

    return await findAndSwitchToNextSankalp({
      userId,
      date,
      currentSankalpId: activeSankalpId,
      todaySankalpId: todaySankalp ? todaySankalp.id : undefined,
    });
  }

  // PRIVATE PRIORITY: if current is public but user has incomplete private → switch
  if (activeSankalp.visibility === "public") {
    const incompletePrivate = await getIncompletePrivateSankalp(userId);
    if (incompletePrivate && incompletePrivate.id !== activeSankalpId) {
      await switchUserSankalp({
        userId,
        date,
        newSankalpId: incompletePrivate.id,
        accepted: false,
        existingTodaySankalpId: todaySankalp ? todaySankalp.id : undefined,
        oldSankalpId: activeSankalpId,
      });
      return incompletePrivate.id;
    }
  }

  return activeSankalpId;
}

export async function getGlobalAggregates() {
  const [agg] = await db
    .select({
      totalUsers: sql<number>`(select count(*)::int from ${profilesTable})`,
      totalJaapAllTime: sql<number>`coalesce((select sum(total_count)::int from ${userTotalsTable}), 0)`,
      totalEarnings: sql<number>`coalesce((select sum(total_earnings)::float from ${userTotalsTable}), 0)`,
      totalJaapToday: sql<number>`coalesce((select sum(count)::int from ${jaapDailyTable} where date = current_date), 0)`,
    })
    .from(sql`(select 1) as t`);
  return agg!;
}
