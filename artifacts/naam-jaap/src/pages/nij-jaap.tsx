import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { HandHeart, CheckCircle2, Lock, Sparkles, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/language-context";
import { useGetMyProfile } from "@workspace/api-client-react";
import { getPanchang, buildPanchangLine } from "@/lib/panchang";

const NIJ_JAAP_TARGET = 324;
const MANTRA = "जय श्री श्याम";

type NijSnap = {
  todayCount: number;
  totalCount: number;
  sankalpShown: boolean;
  samarpanDone: boolean;
  morningDone: boolean;
  bonusUnlocked: boolean;
  target: number;
  isAdmin: boolean;
};

async function fetchNijSnapshot(): Promise<NijSnap> {
  const res = await fetch("/api/nij-jaap/snapshot", { credentials: "include" });
  const data = await res.json();
  return data.snapshot;
}

async function postNijCount(count: number, intervalMs: number): Promise<NijSnap> {
  const res = await fetch("/api/nij-jaap/count", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count, intervalMs }),
  });
  const data = await res.json();
  return data.snapshot;
}

async function acceptNijSankalp(): Promise<void> {
  await fetch("/api/nij-jaap/accept-sankalp", {
    method: "POST",
    credentials: "include",
  });
}

async function completeNijSamarpan(): Promise<void> {
  await fetch("/api/nij-jaap/complete-samarpan", {
    method: "POST",
    credentials: "include",
  });
}

export default function NijJaapPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { data: profileEnv } = useGetMyProfile();
  const [, setLocation] = useLocation();

  const profile = profileEnv?.profile;
  const devoteeName = profile?.name ?? "";
  const devoteeGotra = profile?.gotra ?? "";
  const gender = (profile as any)?.gender ?? "male";
  const lena = gender === "female" ? "लेती" : "लेता";
  const karna = gender === "female" ? "करती" : "करता";

  const [snap, setSnap] = useState<NijSnap | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const hydrated = useRef(false);

  const [showSankalpDialog, setShowSankalpDialog] = useState(false);
  const [showSamarpanDialog, setShowSamarpanDialog] = useState(false);
  const [samarpanSubmitting, setSamarpanSubmitting] = useState(false);
  const [sankalpAccepting, setSankalpAccepting] = useState(false);

  const pendingCount = useRef(0);
  const lastClickTime = useRef(Date.now());

  useEffect(() => {
    fetchNijSnapshot().then((s) => {
      setSnap(s);
      if (!hydrated.current) {
        setLocalCount(s.todayCount);
        hydrated.current = true;
        if (!s.sankalpShown && !s.samarpanDone) {
          setShowSankalpDialog(true);
        } else if (s.todayCount >= NIJ_JAAP_TARGET && !s.samarpanDone) {
          setShowSamarpanDialog(true);
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const syncToServer = useCallback(() => {
    if (pendingCount.current <= 0) return;
    const countToSync = Math.min(pendingCount.current, 200);
    pendingCount.current -= countToSync;
    const now = Date.now();
    const interval = Math.max(100, now - lastClickTime.current);
    lastClickTime.current = now;
    postNijCount(countToSync, interval).then((s) => {
      setSnap(s);
      if (s.todayCount >= NIJ_JAAP_TARGET && !s.samarpanDone && !showSamarpanDialog) {
        setShowSamarpanDialog(true);
      }
    }).catch(() => {});
  }, [showSamarpanDialog]);

  useEffect(() => {
    const id = setInterval(syncToServer, 300);
    return () => clearInterval(id);
  }, [syncToServer]);

  useEffect(() => {
    const onHide = () => syncToServer();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [syncToServer]);

  const handleJaap = useCallback(() => {
    if (!snap?.sankalpShown) return;
    if (snap.samarpanDone && !snap.bonusUnlocked) return;
    const currentCount = localCount;
    if (!snap.samarpanDone && currentCount >= NIJ_JAAP_TARGET) return;

    if (navigator.vibrate) navigator.vibrate(15);
    setLocalCount((c) => c + 1);
    pendingCount.current += 1;
  }, [snap, localCount]);

  const handleAcceptSankalp = useCallback(async () => {
    setSankalpAccepting(true);
    try {
      await acceptNijSankalp();
      setSnap((s) => s ? { ...s, sankalpShown: true } : s);
      setShowSankalpDialog(false);
    } finally {
      setSankalpAccepting(false);
    }
  }, []);

  const handleSamarpan = useCallback(async () => {
    setSamarpanSubmitting(true);
    try {
      await completeNijSamarpan();
      const s = await fetchNijSnapshot();
      setSnap(s);
      setShowSamarpanDialog(false);
    } finally {
      setSamarpanSubmitting(false);
    }
  }, []);

  if (loading || !snap) return null;

  const effectiveCount = snap.samarpanDone ? snap.todayCount : localCount;
  const progress = Math.min(100, (effectiveCount / NIJ_JAAP_TARGET) * 100);
  const morningDone = snap.samarpanDone;
  const beads = Array.from({ length: 108 });
  const currentBead = effectiveCount % 108;
  const malasDone = Math.floor(effectiveCount / 108);

  const panchang = getPanchang();
  const panchangLine = buildPanchangLine(panchang);

  const sankalpText = (
    <>
      <p className="mb-3">
        <span className="font-semibold">आज, {panchangLine} के शुभ दिन,</span>
      </p>
      <p className="mb-3">
        मैं <span className="font-bold">{devoteeName}</span>
        {devoteeGotra ? <>, गोत्र <span className="font-bold">{devoteeGotra}</span>,</> : ","}
      </p>
      <p>
        श्री खाटू श्याम जी के श्री चरणों में अपने नित्य नाम जप संकल्प के रूप में{" "}
        <span className="font-bold text-primary">324 (3 माला)</span> '
        <span className="font-bold text-primary">{MANTRA}</span>' नाम जप करने का संकल्प{" "}
        <span className="font-bold">{lena} हूँ।</span>
      </p>
    </>
  );

  const samarpanText = `मैंने ${devoteeName}${devoteeGotra ? `, गोत्र ${devoteeGotra}` : ""}, आज ${effectiveCount} "${MANTRA}" नाम जप अपने लिए किए हैं। ये सभी नाम जप श्री खाटू श्याम जी के श्री चरणों में समर्पित ${karna} हूँ।`;

  return (
    <div className="flex flex-col items-center w-full min-h-[calc(100vh-8rem)]">

      {/* Personal Sankalp Dialog */}
      <Dialog open={showSankalpDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="text-center">
            <DialogTitle className="font-serif text-xl text-primary text-center">
              🕉️ निज नाम जप संकल्प
            </DialogTitle>
            <DialogDescription className="text-sm mt-1">
              नीचे दिया संकल्प पढ़कर स्वीकार करें और अपना नित्य नाम जप शुरू करें।
            </DialogDescription>
          </DialogHeader>

          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 my-3 border border-amber-200/60 text-sm leading-relaxed text-amber-900 dark:text-amber-100 font-serif">
            {sankalpText}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold text-base py-5"
              onClick={handleAcceptSankalp}
              disabled={sankalpAccepting}
            >
              <HandHeart className="w-5 h-5 mr-2" />
              {sankalpAccepting ? "स्वीकार हो रहा है..." : `संकल्प स्वीकार करें — जय श्री श्याम 🙏`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Samarpan Dialog */}
      <Dialog open={showSamarpanDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="text-center">
            <div className="text-4xl mb-2">🙏</div>
            <DialogTitle className="font-serif text-xl text-primary text-center">
              नाम जप समर्पण
            </DialogTitle>
            <DialogDescription className="text-sm mt-1">
              आपने 324 नाम जप पूरे कर लिए! अब इन्हें श्री खाटू श्याम जी को समर्पित करें।
            </DialogDescription>
          </DialogHeader>

          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 my-3 border border-amber-200/60">
            <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100 font-serif">
              {samarpanText}
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold text-base py-5"
              onClick={handleSamarpan}
              disabled={samarpanSubmitting}
            >
              <HandHeart className="w-5 h-5 mr-2" />
              {samarpanSubmitting ? "समर्पित हो रहा है..." : `समर्पित ${karna} हूँ 🙏`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Row */}
      <div className="w-full grid grid-cols-3 gap-2 mb-4">
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none">आज निज जप</span>
          <span className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400 leading-none">{effectiveCount.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none">माला</span>
          <span className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400 leading-none">{malasDone}</span>
        </div>
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none">कुल निज जप</span>
          <span className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400 leading-none">{snap.totalCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Completion State */}
      {morningDone && !snap.bonusUnlocked && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mb-6"
        >
          <Card className="p-6 text-center border-green-400/50 bg-green-50 dark:bg-green-950/20">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-xl font-serif font-bold text-green-700 dark:text-green-300 mb-2">
              निज जप पूर्ण! जय श्री श्याम 🙏
            </h2>
            <p className="text-sm text-foreground mb-4">
              आपने आज के 324 निज नाम जप पूर्ण कर लिए। अब यजमान सेवा का मार्ग खुला है।
            </p>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => setLocation("/jaap")}
            >
              <Flame className="w-4 h-4 mr-2" />
              यजमान जाप शुरू करें
            </Button>
          </Card>
        </motion.div>
      )}

      {/* Bonus Mode - can do extra personal jaap after 30k yajman or sankalp complete */}
      {morningDone && snap.bonusUnlocked && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mb-4"
        >
          <Card className="p-3 text-center border-purple-400/40 bg-purple-50 dark:bg-purple-950/20">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300">
              <Sparkles className="w-4 h-4" />
              आज 30,000+ यजमान जाप हो गए — अब आप अपने लिए और जाप कर सकते हैं!
            </div>
          </Card>
        </motion.div>
      )}

      {/* Not accepted sankalp yet — waiting */}
      {!snap.sankalpShown && (
        <div className="w-full max-w-md flex flex-col items-center justify-center gap-4 mt-8">
          <Lock className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground text-center">संकल्प स्वीकार करने के बाद जाप शुरू होगा</p>
          <Button onClick={() => setShowSankalpDialog(true)}>
            संकल्प देखें
          </Button>
        </div>
      )}

      {/* Counter — show if: sankalp accepted AND (not samarpanDone OR bonusUnlocked) */}
      {snap.sankalpShown && (!morningDone || snap.bonusUnlocked) && (
        <>
          {/* Progress bar towards 324 (morning mode only) */}
          {!morningDone && (
            <div className="w-full max-w-md mb-4">
              <div className="flex justify-between text-xs text-foreground mb-1">
                <span>निज जाप लक्ष्य</span>
                <span>{effectiveCount} / {NIJ_JAAP_TARGET}</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Mala Beads */}
          <div className="relative flex items-center justify-center w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] mb-4 mx-auto">
            <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
              <circle cx="160" cy="160" r="120" fill="none" stroke="rgba(147,51,234,0.1)" strokeWidth="2" />
              {beads.map((_, i) => {
                const angle = (i / 108) * 2 * Math.PI - Math.PI / 2;
                const r = 120;
                const cx = 160 + r * Math.cos(angle);
                const cy = 160 + r * Math.sin(angle);
                const isActive = i < currentBead;
                const isCurrent = i === currentBead;
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r={isCurrent ? 6 : 5}
                    fill={isCurrent ? "#9333ea" : isActive ? "#c084fc" : "#e9d5ff"}
                    opacity={isCurrent ? 1 : isActive ? 0.8 : 0.4}
                  />
                );
              })}
            </svg>

            {/* Center button */}
            <motion.button
              className="relative z-10 flex flex-col items-center justify-center w-36 h-36 rounded-full cursor-pointer select-none"
              style={{
                background: "radial-gradient(circle at 35% 35%, #a855f7, #7c3aed)",
                boxShadow: "0 8px 32px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
              whileTap={{ scale: 0.94 }}
              onPointerDown={(e) => {
                e.preventDefault();
                handleJaap();
              }}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  if (e.repeat) return;
                  e.preventDefault();
                  handleJaap();
                }
              }}
              tabIndex={0}
              aria-label="नाम जप करें"
            >
              <span className="text-white font-serif text-lg leading-tight font-bold text-center drop-shadow-sm">
                जय श्री<br />श्याम
              </span>
              <span className="text-purple-200 text-xs mt-1">🙏</span>
            </motion.button>
          </div>

          {/* Target reached — show samarpan prompt */}
          {!morningDone && effectiveCount >= NIJ_JAAP_TARGET && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-sm mb-4"
            >
              <Card className="p-4 text-center border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
                <div className="text-2xl mb-2">🎉</div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-3">
                  324 नाम जप पूरे हो गए! समर्पण करें।
                </p>
                <Button
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => setShowSamarpanDialog(true)}
                >
                  <HandHeart className="w-4 h-4 mr-2" />
                  समर्पण संकल्प
                </Button>
              </Card>
            </motion.div>
          )}

          {/* Count display */}
          <div className="text-center">
            <span className="text-5xl font-bold font-mono text-purple-600 dark:text-purple-400">
              {effectiveCount.toLocaleString()}
            </span>
            {!morningDone && (
              <p className="text-sm text-foreground mt-1">
                लक्ष्य: {NIJ_JAAP_TARGET} — {Math.max(0, NIJ_JAAP_TARGET - effectiveCount)} शेष
              </p>
            )}
          </div>
        </>
      )}

      {/* Go to Yajman Jaap CTA */}
      {morningDone && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => setLocation("/jaap")}
            className="border-orange-400 text-orange-600 hover:bg-orange-50"
          >
            <Flame className="w-4 h-4 mr-2" />
            यजमान जाप पेज पर जाएं
          </Button>
        </div>
      )}
    </div>
  );
}
