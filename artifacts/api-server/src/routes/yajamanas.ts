import { Router, type IRouter } from "express";
import { db, yajamanaTable } from "@workspace/db";
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

const YajamanaBody = z.object({
  name: z.string().min(1).max(100),
  gotra: z.string().min(1).max(60),
  fatherName: z.string().max(80).nullable().optional(),
  husbandName: z.string().max(80).nullable().optional(),
  motherName: z.string().max(80).nullable().optional(),
  niwasStan: z.string().min(1).max(200),
  status: z.enum(["jiwit", "divangat"]).default("jiwit"),
  relation: z.enum(["self", "mata", "pita", "patni", "putra", "putri", "custom"]).default("self"),
  notes: z.string().max(1000).nullable().optional(),
});

function serializeYajamana(y: typeof yajamanaTable.$inferSelect) {
  return {
    id: y.id,
    name: y.name,
    gotra: y.gotra,
    fatherName: y.fatherName ?? null,
    husbandName: y.husbandName ?? null,
    motherName: y.motherName ?? null,
    niwasStan: y.niwasStan,
    status: y.status,
    relation: y.relation,
    notes: y.notes ?? null,
    createdAt: y.createdAt.toISOString(),
  };
}

router.get("/admin/yajamanas", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(yajamanaTable).orderBy(yajamanaTable.createdAt);
  res.json({ yajamanas: rows.map(serializeYajamana) });
});

router.post("/admin/yajamanas", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = YajamanaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  const [created] = await db.insert(yajamanaTable).values(parsed.data).returning();
  res.json({ yajamana: serializeYajamana(created!) });
});

router.put("/admin/yajamanas/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = YajamanaBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(yajamanaTable)
    .set(parsed.data)
    .where(eq(yajamanaTable.id, String(req.params["id"])))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Yajamana not found" });
    return;
  }
  res.json({ yajamana: serializeYajamana(updated) });
});

router.delete("/admin/yajamanas/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const [deleted] = await db.delete(yajamanaTable).where(eq(yajamanaTable.id, String(req.params["id"]))).returning();
  if (!deleted) {
    res.status(404).json({ error: "Yajamana not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
