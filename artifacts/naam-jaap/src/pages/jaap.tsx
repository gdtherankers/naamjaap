import { 
  useGetJaapSnapshot, 
  useAddJaapCount,
  getGetJaapSnapshotQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, Mic, MicOff, HandHeart, PartyPopper, CheckCircle2 } from "lucide-react";
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
import { useAuth } from "@workspace/replit-auth-web";
import { useLanguage } from "@/lib/language-context";
import { getPanchang, buildPanchangLine } from "@/lib/panchang";

const RUPEE_PER_JAAP = 0.01;
const MILESTONE_25K = 25000;

function buildSamarpanText(info: {
  myContribution: number;
  yajamanaName: string;
  yajamanaGotra: string;
  yajamanaFatherName: string | null;
  yajamanaHusbandName: string | null;
  niwasStan: string;
  yajamanaStatus: string;
  mantraScript: string;
  devoteeName: string;
  devoteeGotra: string;
  gender: string;
}): { text: string; kriya: string } {
  const kriya = info.gender === "female" ? "करती" : "करता";
  const yajamanaDesc = [
    info.yajamanaName,
    info.yajamanaGotra ? `गोत्र ${info.yajamanaGotra}` : "",
    info.niwasStan ? `निवासी ${info.niwasStan}` : "",
    info.yajamanaStatus === "divangat" ? "(दिवंगत)" : "",
  ].filter(Boolean).join(", ");
  const count = info.myContribution.toLocaleString("hi-IN");
  const text = `मैंने ${info.devoteeName}, गोत्र ${info.devoteeGotra}, इस संकल्प में ${count} "${info.mantraScript}" नाम जप किए हैं। ये सभी नाम जप यजमान ${yajamanaDesc} के निमित्त श्री खाटू श्याम जी के श्री चरणों में समर्पित ${kriya} हूँ।`;
  return { text, kriya };
}

function formatCount(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(2)} Lakh`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function JaapPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: snapshotEnv, isLoading } = useGetJaapSnapshot({
    query: { refetchInterval: 1000, staleTime: 0 } as any,
  });
  const addJaap = useAddJaapCount();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [localCount, setLocalCount] = useState(0);
  const [localTotal, setLocalTotal] = useState(0);
  const [localTotalEarnings, setLocalTotalEarnings] = useState(0);
  const [mantraText, setMantraText] = useState("जय श्री\nश्याम");

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [show25kDialog, setShow25kDialog] = useState(false);
  const has25kShown = useRef(false);

  // Three-step sankalp completion flow:
  // Step 1: Samarpan dialog (pura kiya hua sankalp samarpit karo)
  // Step 2: Acceptance dialog (naya sankalp lo)
  const [showSamarpanDialog, setShowSamarpanDialog] = useState(false);
  const [pendingAcceptance, setPendingAcceptance] = useState<any>(null);
  const [showAcceptanceDialog, setShowAcceptanceDialog] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const sessionKey = `sankalp_popup_shown_${user?.id ?? "guest"}`;
  const hasShownPopupThisSession = (sankalpId: string) =>
    sessionStorage.getItem(sessionKey) === sankalpId;
  const markPopupShownThisSession = (sankalpId: string) =>
    sessionStorage.setItem(sessionKey, sankalpId);

  // Track niyam confirmation — sankalp popup only shows after niyam is confirmed
  const [niyamConfirmed, setNiyamConfirmed] = useState(
    () => sessionStorage.getItem("niyamConfirmed") === "1"
  );
  // Deferred sankalp data — store if niyam not yet confirmed, show after niyam confirm
  const deferredSankalp = useRef<any>(null);

  useEffect(() => {
    const onNiyamConfirmed = () => {
      setNiyamConfirmed(true);
      // Show the deferred sankalp popup now
      const psa = deferredSankalp.current;
      if (psa) {
        setPendingAcceptance(psa);
        if (psa.completedSankalpInfo && psa.completedSankalpInfo.myContribution > 0) {
          setShowSamarpanDialog(true);
        } else {
          setShowAcceptanceDialog(true);
        }
        deferredSankalp.current = null;
      }
    };
    window.addEventListener("niyamConfirmed", onNiyamConfirmed);
    return () => window.removeEventListener("niyamConfirmed", onNiyamConfirmed);
  }, []);

  const lastClickTime = useRef<number>(Date.now());
  const pendingCount = useRef(0);
  const hydrated = useRef(false);

  // Optimistic global sankalp progress — increments instantly on click, takes server value when higher
  const [displayGlobalAccum, setDisplayGlobalAccum] = useState(0);
  const currentSankalpIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!snapshotEnv?.snapshot) return;
    const snap = snapshotEnv.snapshot as any;

    // Detect sankalp requiring acceptance — show popup once per login session
    const psa = snap.pendingSankalpAcceptance;
    if (psa && !hasShownPopupThisSession(psa.patronSankalpId)) {
      markPopupShownThisSession(psa.patronSankalpId);
      if (!niyamConfirmed) {
        // Niyam not yet confirmed — defer sankalp popup until niyam is accepted
        deferredSankalp.current = psa;
      } else {
        setPendingAcceptance(psa);
        if (!showAcceptanceDialog) {
          if (psa.completedSankalpInfo && psa.completedSankalpInfo.myContribution > 0) {
            setShowSamarpanDialog(true);
          } else {
            setShowAcceptanceDialog(true);
          }
        }
      }
    } else if (!psa && !showAcceptanceDialog) {
      setPendingAcceptance(null);
      setShowSamarpanDialog(false);
    }

    if (hydrated.current) return;
    setLocalCount(snap.todayCount);
    setLocalTotal(snap.totalCount);
    setLocalTotalEarnings(snap.totalEarnings);
    if (snap.todayCount >= MILESTONE_25K) {
      has25kShown.current = true;
    }
    if (snap.activeMantraText) {
      const lines = (snap.activeMantraText as string).split(" ");
      if (lines.length > 2) {
        const mid = Math.ceil(lines.length / 2);
        setMantraText(lines.slice(0, mid).join(" ") + "\n" + lines.slice(mid).join(" "));
      } else {
        setMantraText(snap.activeMantraText);
      }
    }
    hydrated.current = true;
  }, [snapshotEnv, showAcceptanceDialog]);

  // Update mantra text when sankalp changes
  useEffect(() => {
    if (!hydrated.current || !snapshotEnv?.snapshot) return;
    const snap = snapshotEnv.snapshot as any;
    if (snap.activeMantraText) {
      const lines = (snap.activeMantraText as string).split(" ");
      if (lines.length > 2) {
        const mid = Math.ceil(lines.length / 2);
        setMantraText(lines.slice(0, mid).join(" ") + "\n" + lines.slice(mid).join(" "));
      } else {
        setMantraText(snap.activeMantraText);
      }
    }
  }, [snapshotEnv?.snapshot?.activePatronSankalpId]);

  // Sync displayGlobalAccum — reset on sankalp change, take max(local, server) otherwise
  useEffect(() => {
    const cs = snapshotEnv?.snapshot?.currentSankalp;
    if (!cs) return;
    if (cs.id !== currentSankalpIdRef.current) {
      currentSankalpIdRef.current = cs.id;
      setDisplayGlobalAccum(cs.accumulated);
    } else {
      setDisplayGlobalAccum((prev) => Math.max(prev, cs.accumulated));
    }
  }, [snapshotEnv?.snapshot?.currentSankalp?.accumulated, snapshotEnv?.snapshot?.currentSankalp?.id]);

  const audioCtx = useRef<AudioContext | null>(null);

  const playBell = useCallback(() => {
    if (!soundEnabled) return;
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtx.current;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  }, [soundEnabled]);

  const syncToServer = useCallback(() => {
    if (pendingCount.current > 0) {
      const countToSync = Math.min(pendingCount.current, 200);
      pendingCount.current -= countToSync;
      const now = Date.now();
      const interval = Math.max(100, now - lastClickTime.current);
      lastClickTime.current = now;
      addJaap.mutate({ data: { count: countToSync, intervalMs: interval } }, {
        onSuccess: () => {
          // Invalidate snapshot so GET /jaap/snapshot refetches immediately —
          // this ensures pendingSankalpAcceptance is included in the response
          // (POST response lacks it). All bhakts will see completion popup within 1s.
          queryClient.invalidateQueries({ queryKey: getGetJaapSnapshotQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["patron-sankalps-devotee"] });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
        onError: (err: any) => {
          if (err?.status === 403 || err?.response?.status === 403) {
            queryClient.invalidateQueries({ queryKey: getGetJaapSnapshotQueryKey() });
          }
        }
      });
    }
  }, [addJaap, queryClient]);

  // Flush pending jaap count to server every 300ms — faster sync = faster SSE push to others.
  useEffect(() => {
    const id = setInterval(syncToServer, 300);
    return () => clearInterval(id);
  }, [syncToServer]);

  // SSE: Real-time global count from other bhakts (pushed by server instantly after each sync)
  useEffect(() => {
    const es = new EventSource("/api/jaap/live", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const { sankalpId, accumulated } = JSON.parse(e.data);
        if (currentSankalpIdRef.current === sankalpId) {
          setDisplayGlobalAccum((prev) => Math.max(prev, accumulated));
        }
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => {}; // Browser auto-reconnects
    return () => es.close();
  }, []); // Connect once on mount

  const snap = snapshotEnv?.snapshot;
  const beads = Array.from({ length: 108 });
  const currentBead = localCount % 108;
  const totalMalaCount = Math.floor(localTotal / 108);
  const progressPct = Math.min(100, (localCount / MILESTONE_25K) * 100);
  const displayGoal = snap?.currentSankalp?.goalCount ?? 0;
  const displayRemaining = displayGoal > 0 ? Math.max(0, displayGoal - displayGlobalAccum) : 0;
  const isSankalpComplete = displayGoal > 0 && displayGlobalAccum >= displayGoal;
  const isNearCompletion = displayGoal > 0 && displayRemaining > 0 && displayRemaining <= 10;
  const displayGlobalPct = displayGoal > 0 ? Math.min(100, (displayGlobalAccum / displayGoal) * 100) : 0;

  // allSankalpsDone: server signals no more active sankalps left
  const allSankalpsDone = !!(snap?.allSankalpsDone);

  // Block jaap during transitions OR when all sankalps are globally completed
  const isJaapBlocked = showSamarpanDialog || showAcceptanceDialog || allSankalpsDone;

  const handleJaap = useCallback(() => {
    if (isJaapBlocked) return;

    if (navigator.vibrate) navigator.vibrate(15);
    playBell();

    setLocalCount((c) => {
      const next = c + 1;
      if (next === MILESTONE_25K && !has25kShown.current) {
        has25kShown.current = true;
        setShow25kDialog(true);
      }
      return next;
    });
    setLocalTotal((t) => t + 1);
    setLocalTotalEarnings((e) => Number((e + RUPEE_PER_JAAP).toFixed(2)));
    setDisplayGlobalAccum((a) => a + 1);
    pendingCount.current += 1;
  }, [playBell, isJaapBlocked]);

  // User confirms samarpan → open acceptance dialog for next sankalp
  const handleSamarpanConfirm = useCallback(() => {
    setShowSamarpanDialog(false);
    setShowAcceptanceDialog(true);
  }, []);

  const handleAcceptSankalp = useCallback(async () => {
    if (!pendingAcceptance) return;
    setAcceptLoading(true);
    try {
      const res = await fetch("/api/jaap/accept-patron-sankalp", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setShowAcceptanceDialog(false);
        setPendingAcceptance(null);
        queryClient.invalidateQueries({ queryKey: getGetJaapSnapshotQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["patron-sankalps-devotee"] });
      }
    } finally {
      setAcceptLoading(false);
    }
  }, [pendingAcceptance, queryClient]);

  useEffect(() => {
    if (!voiceEnabled) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      setVoiceEnabled(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "hi-IN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const latest = event.results[event.results.length - 1][0].transcript.toLowerCase();
      if (latest.includes("श्याम") || latest.includes("shyam") || latest.includes("syam")) {
        handleJaap();
      }
    };
    recognition.onerror = (e: any) => console.error("Speech error", e);
    recognition.onend = () => {
      if (voiceEnabled && !document.hidden) recognition.start();
    };
    recognition.start();
    return () => recognition.stop();
  }, [voiceEnabled, handleJaap]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) syncToServer();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [syncToServer]);

  if (isLoading) return null;

  const nijJaapRequired = !!(snap as any)?.nijJaapRequired;

  if (nijJaapRequired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] gap-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-2xl font-serif font-bold text-primary mb-3">पहले निज जाप करें</h2>
          <p className="text-foreground mb-2">
            यजमान सेवा शुरू करने से पहले आपको आज का निज नाम जप पूरा करना होगा।
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            श्री खाटू श्याम जी के लिए 324 नाम जप (3 माला) पूरे करें, फिर यजमान जाप का द्वार खुलेगा।
          </p>
          <div className="flex flex-col gap-3 items-center">
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="h-3 rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (((snap as any)?.nijJaapTodayCount ?? 0) / 324) * 100)}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {(snap as any)?.nijJaapTodayCount ?? 0} / 324 निज नाम जप
            </span>
          </div>
          <button
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors"
            onClick={() => setLocation("/nij-jaap")}
          >
            <span>निज जाप पेज पर जाएं 🙏</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full min-h-[calc(100vh-8rem)]">

      {/* ── Step 1: Samarpan Dialog ── */}
      <Dialog open={showSamarpanDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {pendingAcceptance?.completedSankalpInfo && (() => {
            const info = pendingAcceptance.completedSankalpInfo;
            const { text, kriya } = buildSamarpanText(info);
            return (
              <>
                <DialogHeader className="text-center">
                  <DialogTitle className="font-serif text-xl text-primary text-center">🕉️ नाम जप समर्पण संकल्प</DialogTitle>
                  <DialogDescription className="text-sm mt-1 leading-relaxed">
                    इस संकल्प के नाम जप अपने यजमान{" "}
                    <span className="font-semibold text-foreground">{info.yajamanaName}</span>{" "}
                    के निमित्त श्री खाटू श्याम जी के चरणों में समर्पित करें।
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 my-3 border border-amber-200/60">
                  <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100 font-serif text-left">
                    {text}
                  </p>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <Button
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold text-base py-5"
                    onClick={handleSamarpanConfirm}
                  >
                    <HandHeart className="w-5 h-5 mr-2" />
                    समर्पित {kriya} हूँ 🙏
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Step 2: New Sankalp Acceptance Dialog ── */}
      <Dialog open={showAcceptanceDialog} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {pendingAcceptance && (() => {
            const p = getPanchang();
            const panchangLine = buildPanchangLine(p);
            const devoteeName = pendingAcceptance.devoteeName || "भक्त";
            const devoteeGotra = pendingAcceptance.devoteeGotra;
            const yajamanaName = pendingAcceptance.yajamanaName;
            const yajamanaGotra = pendingAcceptance.yajamanaGotra;
            const purpose = pendingAcceptance.purpose;
            const mantraText = pendingAcceptance.mantraText;
            const gender = pendingAcceptance.gender ?? "male";
            const leta = gender === "female" ? "लेती" : "लेता";

            return (
              <>
                <DialogHeader className="text-center">
                  <DialogTitle className="font-serif text-xl text-primary text-center">🕉️ नाम जप संकल्प</DialogTitle>
                  <DialogDescription className="text-sm mt-1">
                    नीचे दिए संकल्प को पढ़कर स्वीकार करें और नाम जप शुरू करें।
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 my-3 border border-amber-200/60 text-sm leading-relaxed text-amber-900 dark:text-amber-100 font-serif">
                  <p className="mb-3">
                    <span className="font-semibold">आज, {panchangLine} के शुभ दिन,</span>
                  </p>
                  <p className="mb-3">
                    मैं <span className="font-bold">{devoteeName}</span>
                    {devoteeGotra ? <>, गोत्र <span className="font-bold">{devoteeGotra}</span>,</> : ","}
                  </p>
                  <p>
                    अपने यजमान <span className="font-bold">{yajamanaName}</span>
                    {yajamanaGotra ? <>, गोत्र <span className="font-bold">{yajamanaGotra}</span></> : ""} के{" "}
                    <span className="font-bold">{purpose}</span> के लिए, पूर्ण श्रद्धा और भक्ति भाव से{" "}
                    '<span className="font-bold text-primary">{mantraText}</span>' नाम का यथाशक्ति जप करने का संकल्प{" "}
                    <span className="font-bold">{leta} हूँ।</span>
                  </p>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <Button
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold text-base py-5"
                    onClick={handleAcceptSankalp}
                    disabled={acceptLoading}
                  >
                    <HandHeart className="w-5 h-5 mr-2" />
                    {acceptLoading ? "स्वीकार हो रहा है..." : "संकल्प स्वीकार करें 🙏"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 25k Milestone Dialog */}
      <Dialog open={show25kDialog} onOpenChange={setShow25kDialog}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <div className="text-5xl mb-2">🙏</div>
            <DialogTitle className="font-serif text-2xl text-primary">{t("jaap.milestone-title")}</DialogTitle>
            <DialogDescription className="text-base mt-2">
              {t("jaap.milestone-desc")}<br />
              {t("jaap.milestone-continue-q")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col mt-2">
            <Button className="w-full" onClick={() => setShow25kDialog(false)}>
              {t("jaap.milestone-continue")}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setShow25kDialog(false)}>
              {t("jaap.milestone-stop")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Stats — 4 cols, uniform height via grid row stretch */}
      <div className="w-full grid grid-cols-4 gap-1.5 sm:gap-3 mb-4" style={{ gridAutoRows: "1fr" }}>
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none whitespace-nowrap">{t("jaap.box-today-jaap")}</span>
          <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-amber-600 dark:text-amber-400 leading-none">{localCount.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none whitespace-nowrap">{t("jaap.box-today-earn")}</span>
          <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-green-600 leading-none">₹{(localCount * RUPEE_PER_JAAP).toFixed(2)}</span>
        </div>
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none whitespace-nowrap">{t("jaap.box-total-jaap")}</span>
          <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-amber-600 dark:text-amber-400 leading-none">{localTotal.toLocaleString()}</span>
        </div>
        <div className="flex flex-col items-center justify-center text-center rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 py-3 px-1">
          <span className="block text-[9px] sm:text-[11px] uppercase tracking-wide text-foreground font-bold mb-1.5 leading-none whitespace-nowrap">{t("jaap.box-total-earn")}</span>
          <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-green-600 leading-none">₹{localTotalEarnings.toFixed(2)}</span>
        </div>
      </div>


      {/* All Sankalps Complete — final completion card */}
      {allSankalpsDone && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md mb-6 rounded-lg border border-green-400/50 bg-green-50 dark:bg-green-950/20 overflow-hidden"
        >
          <div className="bg-green-600 text-white px-4 py-2.5 flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <p className="font-bold text-sm">सभी संकल्प पूर्ण हो गए!</p>
          </div>
          <div className="p-4 text-center space-y-1">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
              खाटू श्याम जी की कृपा से सभी यजमानों का संकल्प पूरा हुआ 🙏
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Admin नया संकल्प बनाएंगे तो जाप फिर शुरू होगा
            </p>
          </div>
        </motion.div>
      )}

      {/* Global Sankalp Progress (all bhakts combined) */}
      {snap?.currentSankalp && !allSankalpsDone && (
        <div className={`w-full mb-4 rounded-lg border overflow-hidden transition-colors duration-300 ${isNearCompletion ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-amber-200/50 bg-amber-50 dark:bg-amber-950/20"}`}>
          {/* Near-completion warning banner */}
          {isNearCompletion && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="bg-red-500 text-white px-4 py-2 flex items-center gap-2"
            >
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                className="text-lg"
              >⚠️</motion.span>
              <p className="text-sm font-bold">
                केवल {displayRemaining} नाम जाप बाकी — अपनी गति धीमी करें!
              </p>
            </motion.div>
          )}
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className={`text-sm font-bold ${isNearCompletion ? "text-red-900 dark:text-red-300" : "text-amber-900 dark:text-amber-300"}`}>
                  {snap.currentSankalp.yajamanaName}
                </p>
                <p className={`text-xs italic font-medium ${isNearCompletion ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
                  {snap.currentSankalp.purpose}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${isNearCompletion ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
                  {displayGlobalAccum.toLocaleString()}
                  <span className="font-normal text-amber-600"> / {snap.currentSankalp.goalCount.toLocaleString()}</span>
                </p>
                <p className={`text-xs font-semibold ${isNearCompletion ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>सभी भक्त मिलकर</p>
              </div>
            </div>

            <div className={`h-2.5 w-full rounded-full overflow-hidden ${isNearCompletion ? "bg-red-200 dark:bg-red-900" : "bg-amber-200 dark:bg-amber-900"}`}>
              <motion.div
                className={`h-full rounded-full ${isNearCompletion ? "bg-gradient-to-r from-red-500 to-rose-600" : "bg-gradient-to-r from-amber-500 to-orange-600"}`}
                animate={{ width: `${displayGlobalPct}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            <div className="flex justify-between items-center mt-1.5">
              <p className={`text-xs font-semibold ${isNearCompletion ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                आपका योगदान: {snap.currentSankalp.userAccumulated?.toLocaleString() ?? 0}
              </p>
              <p className={`text-xs font-bold ${isNearCompletion ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}`}>
                {displayRemaining.toLocaleString()} और बाकी
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Button */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full">
        <div className="relative flex items-center justify-center" style={{ width: "min(88vw, 40rem, calc(100vh - 400px))", height: "min(88vw, 40rem, calc(100vh - 400px))", minWidth: "18rem", minHeight: "18rem" }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            {beads.map((_, i) => {
              const angle = (i / 108) * Math.PI * 2 - Math.PI / 2;
              const radius = 47;
              const x = 50 + Math.cos(angle) * radius;
              const y = 50 + Math.sin(angle) * radius;
              const isFilled = i < currentBead;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={isFilled ? 1.6 : 1.2}
                  fill={isFilled ? "#7c2d12" : "#d6c8b8"}
                  stroke={isFilled ? "#fef3c7" : "transparent"}
                  strokeWidth={isFilled ? 0.25 : 0}
                  style={isFilled ? { filter: "drop-shadow(0 0 0.4px #7c2d12)" } : undefined}
                />
              );
            })}
          </svg>

          <motion.button
            whileTap={isJaapBlocked ? {} : { scale: 0.95 }}
            animate={!isJaapBlocked && localCount > 0 && localCount % 108 === 0 ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
            onClick={handleJaap}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && e.repeat) {
                e.preventDefault();
              }
            }}
            disabled={isJaapBlocked}
            className={`relative rounded-full flex items-center justify-center outline-none select-none touch-none overflow-hidden transition-all
              ${isJaapBlocked
                ? "bg-[radial-gradient(circle_at_30%_30%,#6b7280_0%,#4b5563_60%,#374151_100%)] border-4 border-gray-400/40 opacity-40 cursor-not-allowed"
                : "bg-[radial-gradient(circle_at_30%_30%,#9a1f24_0%,#6b1115_60%,#3f0708_100%)] shadow-[0_0_60px_rgba(255,193,7,0.25),inset_0_2px_8px_rgba(255,255,255,0.18)] border-4 border-amber-400/40 hover:shadow-[0_0_90px_rgba(255,193,7,0.4),inset_0_2px_8px_rgba(255,255,255,0.25)] cursor-pointer"
              }`}
            style={{ WebkitTapHighlightColor: "transparent", width: "82%", height: "82%" }}
          >
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay" />
            <div className="absolute inset-2 rounded-full border border-amber-300/30" />
            <h2
              className="font-serif font-bold relative z-10 text-center leading-snug whitespace-pre-line"
              style={{
                fontSize: "clamp(2rem, 11vmin, 4.5rem)",
                color: isJaapBlocked ? "#9ca3af" : "#fde047",
                textShadow: isJaapBlocked ? "none" : "0 1px 2px rgba(0,0,0,0.55), 0 0 14px rgba(253,224,71,0.45)",
                padding: "0 4%",
              }}
            >
              {mantraText}
            </h2>
          </motion.button>
        </div>

        <div className="mt-4 bg-background border px-4 py-1.5 rounded-full text-sm font-semibold text-foreground shadow-sm">
          {t("jaap.mala")} {Math.floor(localCount / 108)} · {t("jaap.bead")} {currentBead || 108}/108
        </div>

        <p className="mt-3 text-foreground font-semibold animate-pulse">
          {allSankalpsDone
            ? "सभी संकल्प पूर्ण — Admin का नया संकल्प आने तक प्रतीक्षा करें 🙏"
            : isJaapBlocked
            ? "संकल्प स्वीकार करने के बाद जाप शुरू होगा..."
            : t("jaap.tap-to-chant")}
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-4 mt-8">
        <Button
          variant={soundEnabled ? "default" : "outline"}
          size="icon"
          className="rounded-full w-12 h-12"
          title={soundEnabled ? t("jaap.mute") : t("jaap.unmute")}
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5 text-foreground" />}
        </Button>
        <Button
          variant={voiceEnabled ? "default" : "outline"}
          size="icon"
          className="rounded-full w-12 h-12"
          title={voiceEnabled ? t("jaap.voice-off") : t("jaap.voice-on")}
          onClick={() => setVoiceEnabled(!voiceEnabled)}
        >
          {voiceEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-foreground" />}
        </Button>
      </div>
    </div>
  );
}
