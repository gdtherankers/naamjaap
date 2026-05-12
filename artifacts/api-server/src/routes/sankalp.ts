import { Router, type IRouter } from "express";
import { db, sankalpsTable, mantrasTable, yajamanaTable, patronSankalpsTable, sankalpParticipantsTable } from "@workspace/db";
import { and, desc, eq, gte, or, exists, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateProfile, todayDateString } from "../lib/jaap-helpers";

const router: IRouter = Router();

// ── Hindu Panchang — Jean Meeus "Astronomical Algorithms" ─────────────────
// Uses IST (UTC+5:30) so the tithi matches Indian calendars exactly.

function _toJD(year: number, month: number, day: number): number {
  let y = year, m = month;
  if (m <= 2) { y--; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

function _normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function _sunMoonLongitude(jd: number): { sun: number; moon: number } {
  const T = (jd - 2451545.0) / 36525;

  // Sun (Meeus Ch.25)
  const L0 = _normDeg(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const Ms = _normDeg(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const MsR = (Ms * Math.PI) / 180;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(MsR) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * MsR) +
    0.000289 * Math.sin(3 * MsR);
  const sun = _normDeg(L0 + C);

  // Moon (Meeus Ch.47 major terms)
  const Lm  = _normDeg(218.3164477 + 481267.88123421 * T);
  const Dm  = _normDeg(297.8501921 + 445267.1114034  * T);
  const Mm  = _normDeg(134.9633964 + 477198.8675055  * T);
  const Fm  = _normDeg(93.272095   + 483202.0175233  * T);
  const DmR = (Dm * Math.PI) / 180;
  const MmR = (Mm * Math.PI) / 180;
  const FmR = (Fm * Math.PI) / 180;

  const sumL =
     6288774 * Math.sin(MmR) +
     1274027 * Math.sin(2 * DmR - MmR) +
      658314 * Math.sin(2 * DmR) +
      213618 * Math.sin(2 * MmR) -
      185116 * Math.sin(MsR) -
      114332 * Math.sin(2 * FmR) +
       58793 * Math.sin(2 * DmR - 2 * MmR) +
       57066 * Math.sin(2 * DmR - MsR - MmR) +
       53322 * Math.sin(2 * DmR + MmR) +
       45758 * Math.sin(2 * DmR - MsR) -
       40923 * Math.sin(MsR - MmR) -
       34720 * Math.sin(DmR) -
       30383 * Math.sin(MsR + MmR);

  const moon = _normDeg(Lm + sumL / 1000000);
  return { sun, moon };
}

// Lahiri ayanamsha — official IAE system used by Govt. of India panchang
// T = Julian centuries from J2000.0
function _lahiriAyanamsha(T: number): number {
  return 23.8506 + 1.39572 * T; // degrees
}

function getHinduPanchang(utcDate: Date): { vikramiSamvat: number; masa: string; paksha: string; tithi: string } {
  // Convert to IST (UTC+5:30) — panchang is always reckoned in Indian Standard Time
  const istMs = utcDate.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);

  const year  = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1;
  const day   = ist.getUTCDate();
  // Use noon IST for stability — tithi does not flip mid-day
  const jd = _toJD(year, month, day) + 0.5;
  const T  = (jd - 2451545.0) / 36525;

  const { sun: sunTropical, moon } = _sunMoonLongitude(jd);

  // Nirayana (sidereal) sun — apply Lahiri ayanamsha for correct masa
  const ayanamsha   = _lahiriAyanamsha(T);
  const sunSidereal = _normDeg(sunTropical - ayanamsha);

  // Tithi: tropical Moon-Sun elongation (ayanamsha cancels in difference — correct)
  const diff       = _normDeg(moon - sunTropical);
  const tithiIndex = Math.floor(diff / 12); // 0–29

  const TITHI_NAMES = [
    "प्रतिपदा", "द्वितीया", "तृतीया", "चतुर्थी", "पञ्चमी",
    "षष्ठी",   "सप्तमी",  "अष्टमी", "नवमी",    "दशमी",
    "एकादशी",  "द्वादशी", "त्रयोदशी", "चतुर्दशी", "पूर्णिमा",
    "प्रतिपदा", "द्वितीया", "तृतीया", "चतुर्थी", "पञ्चमी",
    "षष्ठी",   "सप्तमी",  "अष्टमी", "नवमी",    "दशमी",
    "एकादशी",  "द्वादशी", "त्रयोदशी", "चतुर्दशी", "अमावस्या",
  ];

  const paksha = tithiIndex < 15 ? "शुक्ल" : "कृष्ण";
  const tithi  = TITHI_NAMES[tithiIndex]!;

  // Masa: which sidereal rashi the Sun occupies
  // 0=Mesha(Vaishakh), 1=Vrishabha(Jyeshtha), …, 11=Meena(Chaitra)
  const HINDU_MONTHS = [
    "वैशाख",   "ज्येष्ठ",    "आषाढ़",      "श्रावण",
    "भाद्रपद", "आश्विन",     "कार्तिक",   "मार्गशीर्ष",
    "पौष",     "माघ",        "फाल्गुन",   "चैत्र",
  ];
  const solarMonthIdx = Math.floor(sunSidereal / 30);
  const masa = HINDU_MONTHS[solarMonthIdx]!;

  // Vikrami Samvat: new year at Chaitra Shukla Pratipada (~late March/early April)
  const vikramiSamvat = (month > 3 || (month === 3 && day >= 22)) ? year + 57 : year + 56;

  return { vikramiSamvat, masa, paksha, tithi };
}

function buildSankalpText(opts: {
  devoteeName: string;
  devoteeGotra: string;
  gender?: string | null;
  yajamana: { name: string; gotra: string; fatherName?: string | null; husbandName?: string | null; niwasStan: string; status: string } | null;
  mantraScript: string;
  purpose: string;
}): string {
  const { devoteeName, devoteeGotra, gender, yajamana, mantraScript, purpose } = opts;
  const now = new Date();
  const dayNames = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
  const dayName = dayNames[now.getDay()];
  const gregorianDate = now.toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" });
  const kriya = gender === "female" ? "करती हूँ" : "करता हूँ";

  const { vikramiSamvat, masa, paksha, tithi } = getHinduPanchang(now);
  const panchaang = `${dayName}, ${masa} ${paksha} ${tithi}, विक्रमी संवत् ${vikramiSamvat}, ${gregorianDate}`;

  if (!yajamana) {
    return `आज, ${panchaang}, मैं ${devoteeName}, गोत्र ${devoteeGotra}, "${mantraScript}" नाम जाप श्री खाटू श्याम जी के श्री चरणों में समर्पित ${kriya}।`;
  }

  const pitaOrPati = yajamana.fatherName
    ? `पिता श्री ${yajamana.fatherName}`
    : yajamana.husbandName
    ? `पति श्री ${yajamana.husbandName}`
    : "";

  const yajamanaDesc = [
    yajamana.name,
    yajamana.gotra ? `गोत्र ${yajamana.gotra}` : "",
    pitaOrPati,
    yajamana.niwasStan ? `निवासी ${yajamana.niwasStan}` : "",
    yajamana.status === "divangat" ? "(दिवंगत)" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return `आज, ${panchaang}, मैं ${devoteeName}, गोत्र ${devoteeGotra}, यजमान ${yajamanaDesc} के निमित्त, ${purpose}, "${mantraScript}" नाम जाप श्री खाटू श्याम जी के श्री चरणों में समर्पित ${kriya}।`;
}

async function getActivePatronSankalps(userId: string) {
  const visibilityFilter = or(
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

  const rows = await db
    .select()
    .from(patronSankalpsTable)
    .where(and(eq(patronSankalpsTable.status, "active"), visibilityFilter))
    .orderBy(patronSankalpsTable.createdAt);

  return Promise.all(
    rows.map(async (ps) => {
      const [mantra] = await db.select().from(mantrasTable).where(eq(mantrasTable.id, ps.mantraId)).limit(1);
      const [yajamana] = await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, ps.yajamanaId)).limit(1);
      return {
        id: ps.id,
        purpose: ps.purpose,
        goalCount: ps.goalCount,
        mantra: mantra ? { id: mantra.id, scriptText: mantra.scriptText, displayName: mantra.displayName } : null,
        yajamana: yajamana ? { id: yajamana.id, name: yajamana.name, gotra: yajamana.gotra, fatherName: yajamana.fatherName ?? null, husbandName: yajamana.husbandName ?? null, niwasStan: yajamana.niwasStan, status: yajamana.status, relation: yajamana.relation } : null,
      };
    }),
  );
}

router.get("/sankalp/today", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();
  const profile = await getOrCreateProfile(userId);
  const devoteeName = profile?.name ?? (req.user!.firstName ?? "Bhakt");
  const devoteeGotra = profile?.gotra ?? "Ajnaat";

  const activePatronSankalps = await getActivePatronSankalps(userId);

  const [existing] = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)))
    .limit(1);

  const selectedPatronSankalpId = existing?.patronSankalpId ?? null;
  const selectedPatronSankalp = activePatronSankalps.find((ps) => ps.id === selectedPatronSankalpId) ?? activePatronSankalps[0] ?? null;

  const defaultText = buildSankalpText({
    devoteeName,
    devoteeGotra,
    gender: profile?.gender ?? null,
    yajamana: selectedPatronSankalp?.yajamana ?? null,
    mantraScript: selectedPatronSankalp?.mantra?.scriptText ?? "जय श्री श्याम",
    purpose: selectedPatronSankalp?.purpose ?? "खाटू श्याम जी की कृपा हेतु",
  });

  if (existing) {
    res.json({
      sankalp: {
        id: existing.id,
        userId: existing.userId,
        date: existing.date,
        accepted: existing.accepted,
        acceptedAt: existing.acceptedAt?.toISOString() ?? null,
        text: existing.text || defaultText,
        patronSankalpId: existing.patronSankalpId ?? null,
      },
      alreadyAcceptedToday: existing.accepted,
      activePatronSankalps,
      selectedPatronSankalpId: existing.patronSankalpId ?? null,
    });
    return;
  }

  res.json({
    sankalp: {
      id: "pending",
      userId,
      date,
      accepted: false,
      acceptedAt: null,
      text: defaultText,
      patronSankalpId: null,
    },
    alreadyAcceptedToday: false,
    activePatronSankalps,
    selectedPatronSankalpId: null,
  });
});

router.post("/sankalp/today", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const date = todayDateString();
  const profile = await getOrCreateProfile(userId);
  const devoteeName = profile?.name ?? (req.user!.firstName ?? "Bhakt");
  const devoteeGotra = profile?.gotra ?? "Ajnaat";

  const patronSankalpId =
    typeof req.body?.patronSankalpId === "string" && req.body.patronSankalpId.trim().length > 0
      ? req.body.patronSankalpId
      : null;

  let selectedPatronSankalp: Awaited<ReturnType<typeof getActivePatronSankalps>>[number] | null = null;
  if (patronSankalpId) {
    const [ps] = await db.select().from(patronSankalpsTable).where(eq(patronSankalpsTable.id, patronSankalpId)).limit(1);
    if (ps && ps.status === "active") {
      const [mantra] = await db.select().from(mantrasTable).where(eq(mantrasTable.id, ps.mantraId)).limit(1);
      const [yajamana] = await db.select().from(yajamanaTable).where(eq(yajamanaTable.id, ps.yajamanaId)).limit(1);
      selectedPatronSankalp = {
        id: ps.id,
        purpose: ps.purpose,
        goalCount: ps.goalCount,
        mantra: mantra ? { id: mantra.id, scriptText: mantra.scriptText, displayName: mantra.displayName } : null,
        yajamana: yajamana ? { id: yajamana.id, name: yajamana.name, gotra: yajamana.gotra, fatherName: yajamana.fatherName ?? null, husbandName: yajamana.husbandName ?? null, niwasStan: yajamana.niwasStan, status: yajamana.status, relation: yajamana.relation } : null,
      };
    }
  } else {
    const active = await getActivePatronSankalps(userId);
    selectedPatronSankalp = active[0] ?? null;
  }

  const generatedText = buildSankalpText({
    devoteeName,
    devoteeGotra,
    gender: profile?.gender ?? null,
    yajamana: selectedPatronSankalp?.yajamana ?? null,
    mantraScript: selectedPatronSankalp?.mantra?.scriptText ?? "जय श्री श्याम",
    purpose: selectedPatronSankalp?.purpose ?? "खाटू श्याम जी की कृपा हेतु",
  });

  const text =
    typeof req.body?.text === "string" && req.body.text.trim().length > 0
      ? String(req.body.text).slice(0, 1000)
      : generatedText;

  const ip = (req.ip || req.headers["x-forwarded-for"]?.toString() || "").slice(0, 64);
  const ua = (req.headers["user-agent"] || "").toString().slice(0, 500);
  const finalPatronSankalpId = selectedPatronSankalp?.id ?? null;

  const [existing] = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), eq(sankalpsTable.date, date)))
    .limit(1);

  let saved;
  if (existing) {
    const [updated] = await db
      .update(sankalpsTable)
      .set({ accepted: true, acceptedAt: new Date(), text, ipAddress: ip, userAgent: ua, patronSankalpId: finalPatronSankalpId })
      .where(eq(sankalpsTable.id, existing.id))
      .returning();
    saved = updated!;
  } else {
    const [created] = await db
      .insert(sankalpsTable)
      .values({ userId, date, accepted: true, acceptedAt: new Date(), text, ipAddress: ip, userAgent: ua, patronSankalpId: finalPatronSankalpId })
      .returning();
    saved = created!;
  }

  res.json({
    sankalp: {
      id: saved.id,
      userId: saved.userId,
      date: saved.date,
      accepted: saved.accepted,
      acceptedAt: saved.acceptedAt?.toISOString() ?? null,
      text: saved.text,
      patronSankalpId: saved.patronSankalpId ?? null,
    },
    alreadyAcceptedToday: true,
  });
});

router.get("/sankalp/history", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceStr = since.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(sankalpsTable)
    .where(and(eq(sankalpsTable.userId, userId), gte(sankalpsTable.date, sinceStr)))
    .orderBy(desc(sankalpsTable.date));
  res.json({
    history: rows.map((r) => ({
      date: r.date,
      accepted: r.accepted,
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    })),
  });
});

export default router;
