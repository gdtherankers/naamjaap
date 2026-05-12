import { Router, type IRouter } from "express";
import { db, mantrasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile } from "../lib/jaap-helpers";
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

const MantraBody = z.object({
  scriptText: z.string().min(1).max(200),
  displayName: z.string().min(1).max(100),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function serializeMantra(m: typeof mantrasTable.$inferSelect) {
  return {
    id: m.id,
    scriptText: m.scriptText,
    displayName: m.displayName,
    isDefault: m.isDefault,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt.toISOString(),
  };
}

async function seedDefaultMantra() {
  const existing = await db.select().from(mantrasTable).limit(1);
  if (existing.length === 0) {
    await db.insert(mantrasTable).values({
      scriptText: "जय श्री श्याम",
      displayName: "Jai Shree Shyam",
      isDefault: true,
      isActive: true,
      sortOrder: 0,
    });
  }
}

seedDefaultMantra().catch(() => {});

router.get("/admin/mantras", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(mantrasTable).orderBy(mantrasTable.sortOrder, mantrasTable.createdAt);
  res.json({ mantras: rows.map(serializeMantra) });
});

router.post("/admin/mantras", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = MantraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { scriptText, displayName, isDefault = false, isActive = true, sortOrder = 0 } = parsed.data;
  if (isDefault) {
    await db.update(mantrasTable).set({ isDefault: false });
  }
  const [created] = await db.insert(mantrasTable).values({ scriptText, displayName, isDefault, isActive, sortOrder }).returning();
  res.json({ mantra: serializeMantra(created!) });
});

router.put("/admin/mantras/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = MantraBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (parsed.data.isDefault) {
    await db.update(mantrasTable).set({ isDefault: false });
  }
  const [updated] = await db
    .update(mantrasTable)
    .set(parsed.data)
    .where(eq(mantrasTable.id, String(req.params["id"])))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Mantra not found" });
    return;
  }
  res.json({ mantra: serializeMantra(updated) });
});

router.delete("/admin/mantras/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const [deleted] = await db.delete(mantrasTable).where(eq(mantrasTable.id, String(req.params["id"]))).returning();
  if (!deleted) {
    res.status(404).json({ error: "Mantra not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
