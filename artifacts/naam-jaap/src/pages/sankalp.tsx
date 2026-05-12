import { useState, useEffect } from "react";
import { useGetTodaySankalp, useAcceptTodaySankalp, useGetMyProfile, getGetTodaySankalpQueryKey, getGetJaapSnapshotQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/language-context";

type PatronSankalpOption = {
  id: string;
  purpose: string;
  goalCount: number;
  mantra: { id: string; scriptText: string; displayName: string } | null;
  yajamana: { id: string; name: string; gotra: string; fatherName: string | null; husbandName: string | null; niwasStan: string; status: string; relation: string } | null;
};

function relationLabel(r: string): string {
  const map: Record<string, string> = { self: "स्वयं", mata: "माता जी", pita: "पिता जी", patni: "पत्नी जी", putra: "पुत्र", putri: "पुत्री", custom: "अन्य" };
  return map[r] ?? r;
}

export default function SankalpPage() {
  const { t } = useLanguage();
  const { data: sankalpEnv, isLoading } = useGetTodaySankalp();
  const { data: profileEnv, isLoading: isProfileLoading } = useGetMyProfile();
  const acceptSankalp = useAcceptTodaySankalp();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const isAdmin = profileEnv?.profile?.isAdmin;

  const sankalpData = sankalpEnv as any;
  const patronSankalps: PatronSankalpOption[] = sankalpData?.activePatronSankalps ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Redirect admin away — they don't do jaap
  useEffect(() => {
    if (!isProfileLoading && isAdmin) {
      setLocation("/admin");
    }
  }, [isProfileLoading, isAdmin, setLocation]);

  // Auto-select sankalp silently (no manual choice needed)
  useEffect(() => {
    if (sankalpData?.selectedPatronSankalpId) {
      setSelectedId(sankalpData.selectedPatronSankalpId);
    } else if (patronSankalps.length > 0 && !selectedId) {
      setSelectedId(patronSankalps[0]!.id);
    }
  }, [sankalpData?.selectedPatronSankalpId, patronSankalps.length]);

  const selectedPs = patronSankalps.find((p) => p.id === selectedId) ?? patronSankalps[0] ?? null;

  const handleAccept = () => {
    if (!sankalpEnv?.sankalp) return;
    acceptSankalp.mutate(
      { data: { text: sankalpEnv.sankalp.text, patronSankalpId: selectedId } as any },
      {
        onSuccess: async () => {
          queryClient.setQueryData<any>(getGetJaapSnapshotQueryKey(), (prev: any) => {
            if (!prev?.snapshot) {
              return { snapshot: { todayCount: 0, totalCount: 0, todayEarnings: 0, totalEarnings: 0, sankalpAccepted: true, streakDays: 0, todayMalas: 0, totalMalas: 0 } };
            }
            return { ...prev, snapshot: { ...prev.snapshot, sankalpAccepted: true } };
          });
          queryClient.invalidateQueries({ queryKey: getGetTodaySankalpQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetJaapSnapshotQueryKey() });
          setLocation("/jaap");
        },
      },
    );
  };

  if (isLoading || isProfileLoading || isAdmin) return null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-secondary/10 via-background to-background pointer-events-none" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg relative z-10 space-y-4">

        {/* No manual selection card — sankalp auto-selected */}

        <Card className="shadow-2xl border-primary/30 text-center overflow-hidden">
          <div className="bg-primary/10 py-6 border-b border-primary/20">
            <Sparkles className="w-12 h-12 text-primary mx-auto mb-2" />
            <CardTitle className="font-serif text-3xl text-primary">{t("sankalp.title")}</CardTitle>
            <p className="text-sm text-foreground mt-1">{t("sankalp.subtitle")}</p>
          </div>

          <CardContent className="py-8 px-6 space-y-6">
            {selectedPs && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 rounded-lg p-3 text-sm text-left space-y-1">
                <div className="font-medium text-amber-900 dark:text-amber-200">
                  {t("sankalp.yajamana")}: {selectedPs.yajamana?.name ?? "—"}
                  {selectedPs.yajamana?.gotra && <span className="font-normal opacity-70"> · {t("sankalp.gotra")}: {selectedPs.yajamana.gotra}</span>}
                </div>
                {selectedPs.yajamana?.niwasStan && (
                  <div className="text-amber-800/70 dark:text-amber-300/70 text-xs">{t("sankalp.niwas")}: {selectedPs.yajamana.niwasStan}</div>
                )}
                <div className="text-xs text-amber-700/70 dark:text-amber-400/70 italic">{selectedPs.purpose}</div>
              </div>
            )}

            <div className="bg-card border border-primary/10 rounded-xl p-6 shadow-inner">
              <p className="font-serif text-xl leading-relaxed text-foreground">
                {sankalpEnv?.sankalp?.text || "आज मैं पूरे मन और श्रद्धा से बाबा श्याम का नाम जपूंगा।"}
              </p>
            </div>

            <Button
              size="lg"
              className="w-full text-lg h-14 rounded-full shadow-lg shadow-primary/20"
              onClick={handleAccept}
              disabled={acceptSankalp.isPending}
            >
              {acceptSankalp.isPending ? t("sankalp.accepting") : t("sankalp.accept")}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
