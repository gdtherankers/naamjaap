import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile } from "../lib/jaap-helpers";

const router: IRouter = Router();

const DEFAULT_WHATSAPP = "8950889321";

router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(appSettingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  res.json({
    whatsappNumber: map["whatsapp_number"] ?? DEFAULT_WHATSAPP,
    searchEngineIndexing: map["search_engine_indexing"] === "true",
  });
});

router.put("/admin/settings", requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const profile = await getOrCreateProfile(req.user.id);
  if (!profile?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { whatsappNumber, searchEngineIndexing } = req.body as { whatsappNumber?: string; searchEngineIndexing?: boolean };

  if (whatsappNumber !== undefined) {
    if (!/^\d{10,15}$/.test(whatsappNumber.replace(/\s/g, ""))) {
      res.status(400).json({ error: "Invalid WhatsApp number" });
      return;
    }
    const clean = whatsappNumber.replace(/\s/g, "");
    await db
      .insert(appSettingsTable)
      .values({ key: "whatsapp_number", value: clean })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: clean } });
  }

  if (searchEngineIndexing !== undefined) {
    await db
      .insert(appSettingsTable)
      .values({ key: "search_engine_indexing", value: searchEngineIndexing ? "true" : "false" })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: searchEngineIndexing ? "true" : "false" } });
  }

  const rows = await db.select().from(appSettingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  res.json({
    whatsappNumber: map["whatsapp_number"] ?? DEFAULT_WHATSAPP,
    searchEngineIndexing: map["search_engine_indexing"] === "true",
  });
});

export default router;
