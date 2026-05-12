import { Router, type IRouter } from "express";
import { db, profilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpsertMyProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile } from "../lib/jaap-helpers";

const router: IRouter = Router();

function serializeProfile(p: typeof profilesTable.$inferSelect, email?: string | null) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    gotra: p.gotra,
    city: p.city,
    state: p.state,
    approved: p.approved,
    isAdmin: p.isAdmin,
    phone: p.phone ?? null,
    upiId: p.upiId ?? null,
    gender: p.gender ?? null,
    email: email ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/profile", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const profile = await getOrCreateProfile(userId);
  const [userRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ profile: profile ? serializeProfile(profile, userRow?.email) : null });
});

router.put("/profile", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const parsed = UpsertMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile data" });
    return;
  }
  const data = parsed.data;
  const existing = await getOrCreateProfile(userId);
  let saved;
  if (existing) {
    const [updated] = await db
      .update(profilesTable)
      .set({
        name: data.name,
        gotra: data.gotra,
        city: data.city,
        state: data.state,
        phone: (data as any).phone ?? existing.phone,
        upiId: data.upiId ?? existing.upiId,
        gender: data.gender ?? existing.gender,
      })
      .where(eq(profilesTable.userId, userId))
      .returning();
    saved = updated!;
  } else {
    // First registered user becomes admin
    const isFirstUser = (await db.select({ id: profilesTable.id }).from(profilesTable).limit(1)).length === 0;
    const [created] = await db
      .insert(profilesTable)
      .values({
        userId,
        name: data.name,
        gotra: data.gotra,
        city: data.city,
        state: data.state,
        phone: (data as any).phone ?? null,
        upiId: data.upiId ?? null,
        gender: data.gender ?? null,
        approved: isFirstUser,
        isAdmin: isFirstUser,
      })
      .returning();
    saved = created!;
  }
  const [userRow] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ profile: serializeProfile(saved, userRow?.email) });
});

export default router;
