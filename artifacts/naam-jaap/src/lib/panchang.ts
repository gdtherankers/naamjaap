// Hindu Panchang — Jean Meeus "Astronomical Algorithms" + Lahiri Ayanamsha
// Tithi uses Moon-Sun elongation (ayanamsha cancels in difference — correct).
// Masa uses SIDEREAL (Nirayana) sun longitude = tropical − Lahiri ayanamsha.

const TITHI_NAMES: string[] = [
  "प्रतिपदा", "द्वितीया", "तृतीया", "चतुर्थी", "पञ्चमी",
  "षष्ठी",   "सप्तमी",  "अष्टमी", "नवमी",    "दशमी",
  "एकादशी",  "द्वादशी", "त्रयोदशी", "चतुर्दशी", "पूर्णिमा",
  "प्रतिपदा", "द्वितीया", "तृतीया", "चतुर्थी", "पञ्चमी",
  "षष्ठी",   "सप्तमी",  "अष्टमी", "नवमी",    "दशमी",
  "एकादशी",  "द्वादशी", "त्रयोदशी", "चतुर्दशी", "अमावस्या",
];

// Sidereal solar month → Hindu masa name
// Index 0 = Sun in Mesha (Aries), 1 = Vrishabha (Taurus), …, 11 = Meena (Pisces)
const HINDU_MONTHS: string[] = [
  "वैशाख",   "ज्येष्ठ",    "आषाढ़",      "श्रावण",
  "भाद्रपद", "आश्विन",     "कार्तिक",   "मार्गशीर्ष",
  "पौष",     "माघ",        "फाल्गुन",   "चैत्र",
];

const DAY_NAMES_HI: string[] = [
  "रविवार", "सोमवार", "मंगलवार", "बुधवार",
  "गुरुवार", "शुक्रवार", "शनिवार",
];

function toJulianDay(year: number, month: number, day: number): number {
  let y = year, m = month;
  if (m <= 2) { y--; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// Lahiri ayanamsha (official IAE, used by Govt. of India panchang)
// T = Julian centuries from J2000.0
function lahiriAyanamsha(T: number): number {
  return 23.8506 + 1.39572 * T; // degrees
}

function calcSunMoon(jd: number): { sunTropical: number; moon: number; T: number } {
  const T = (jd - 2451545.0) / 36525;

  // Sun — Meeus Ch.25
  const L0 = normDeg(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const Ms = normDeg(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const MsR = (Ms * Math.PI) / 180;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(MsR) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * MsR) +
    0.000289 * Math.sin(3 * MsR);
  const sunTropical = normDeg(L0 + C);

  // Moon — Meeus Ch.47 major terms
  const Lm = normDeg(218.3164477 + 481267.88123421 * T);
  const Dm = normDeg(297.8501921 + 445267.1114034  * T);
  const Mm = normDeg(134.9633964 + 477198.8675055  * T);
  const Fm = normDeg(93.272095   + 483202.0175233  * T);
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

  const moon = normDeg(Lm + sumL / 1000000);
  return { sunTropical, moon, T };
}

export interface PanchangInfo {
  vikramiSamvat: number;
  maas: string;
  paksha: string;
  tithi: string;
  var: string;
}

export function getPanchang(date: Date = new Date()): PanchangInfo {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const day   = date.getDate();

  // Use noon of the day for stability
  const jd = toJulianDay(year, month, day) + 0.5;
  const { sunTropical, moon, T } = calcSunMoon(jd);

  // Nirayana (sidereal) sun — apply Lahiri ayanamsha for masa
  const ayanamsha  = lahiriAyanamsha(T);
  const sunSidereal = normDeg(sunTropical - ayanamsha);

  // Tithi: Moon-Sun elongation (tropical, ayanamsha cancels — correct)
  const diff       = normDeg(moon - sunTropical);
  const tithiIndex = Math.floor(diff / 12); // 0–29
  const paksha     = tithiIndex < 15 ? "शुक्ल पक्ष" : "कृष्ण पक्ष";
  const tithi      = TITHI_NAMES[tithiIndex]!;

  // Masa: which sidereal rashi the Sun is in
  const solarMonthIndex = Math.floor(sunSidereal / 30); // 0=Mesha … 11=Meena
  const maas = HINDU_MONTHS[solarMonthIndex]!;

  // Vikrami Samvat: new year at Chaitra Shukla Pratipada (~late March/early April)
  const vikramiSamvat = (month > 3 || (month === 3 && day >= 22)) ? year + 57 : year + 56;

  const varName = DAY_NAMES_HI[date.getDay()]!;
  return { vikramiSamvat, maas, paksha, tithi, var: varName };
}

export function buildPanchangLine(p: PanchangInfo): string {
  return `विक्रमी संवत् ${p.vikramiSamvat}, ${p.maas} मास, ${p.paksha}, ${p.tithi} तिथि, ${p.var}`;
}
