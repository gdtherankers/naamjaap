import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Target, ChevronDown, ChevronRight, FileText, Coins, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/language-context";

type Sankalp = {
  id: string;
  goalCount: number;
  accumulated: number;
  globalAccumulated: number;
  userAccumulated: number;
  remaining: number;
  isActive: boolean;
  isCompleted: boolean;
  locked: boolean;
  createdAt: string;
  yajamana: { name: string; relation: string } | null;
  purpose: string;
  mantra: { scriptText: string; displayName: string } | null;
};

function formatCount(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(2)} Lakh`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function SankalpBoardPage() {
  const { t } = useLanguage();
  const { data: profileEnv } = useGetMyProfile();
  const isAdmin = profileEnv?.profile?.isAdmin ?? false;

  const { data, isLoading } = useQuery({
    queryKey: ["patron-sankalps-devotee"],
    queryFn: async () => {
      const res = await fetch("/api/patron-sankalps/devotee-view", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sankalps");
      return res.json();
    },
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contributions, setContributions] = useState<Record<string, { totalJaaps: number; earnings: number }>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportSankalp, setReportSankalp] = useState<Sankalp | null>(null);
  const [reportContributors, setReportContributors] = useState<{ userId: string; userName: string; totalJaaps: number; earnings: number }[]>([]);
  const [myContrib, setMyContrib] = useState<{ totalJaaps: number; earnings: number } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const sankalps: Sankalp[] = data?.sankalps ?? [];
  const activeSankalp = sankalps.find((s) => s.isActive);

  if (isLoading) return null;

  const getStatusBadge = (s: Sankalp) => {
    if (s.isCompleted) return <Badge className="bg-green-600">{t("board.status-completed")}</Badge>;
    if (s.isActive) return <Badge className="bg-orange-600">🔥 {t("board.status-running")}</Badge>;
    return <Badge variant="outline" className="border-amber-300">🔒 {t("board.status-waiting")}</Badge>;
  };

  const toggleExpand = async (sankalpId: string) => {
    if (isAdmin) return;
    if (expandedId === sankalpId) { setExpandedId(null); return; }
    setExpandedId(sankalpId);
    if (!contributions[sankalpId]) {
      setLoadingId(sankalpId);
      try {
        const res = await fetch(`/api/patron-sankalps/${sankalpId}/my-contribution`, { credentials: "include" });
        if (res.ok) {
          const d = await res.json();
          setContributions((prev) => ({ ...prev, [sankalpId]: d.contribution }));
        }
      } finally { setLoadingId(null); }
    }
  };

  const openReport = async (s: Sankalp) => {
    setReportSankalp(s);
    setReportLoading(true);
    setReportContributors([]);
    setMyContrib(null);
    setReportDialogOpen(true);
    try {
      if (isAdmin) {
        const res = await fetch(`/api/admin/patron-sankalps/${s.id}/contributors`, { credentials: "include" });
        if (res.ok) { const d = await res.json(); setReportContributors(d.contributors ?? []); }
      } else {
        const res = await fetch(`/api/patron-sankalps/${s.id}/my-contribution`, { credentials: "include" });
        if (res.ok) { const d = await res.json(); setMyContrib(d.contribution); }
      }
    } finally { setReportLoading(false); }
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-serif">{t("board.title")}</h1>
        <p className="text-foreground mt-1">{t("board.subtitle")}</p>
      </div>

      {/* RUNNING SANKALP */}
      {activeSankalp && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/30 bg-primary/5 shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-orange-600 text-white">🔥 {t("board.active")}</Badge>
                    <CardTitle className="text-xl font-serif">{activeSankalp.yajamana?.name ?? t("board.unknown")}</CardTitle>
                  </div>
                  <p className="text-xs text-foreground italic">{activeSankalp.purpose}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-serif font-bold text-primary">{activeSankalp.mantra?.scriptText}</div>
                  <div className="text-xs text-foreground">{activeSankalp.mantra?.displayName}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-foreground">{t("board.progress")}</span>
                  <span className="font-semibold">{formatCount(activeSankalp.accumulated)} {t("board.of")} {formatCount(activeSankalp.goalCount)}</span>
                </div>
                <Progress value={Math.min(100, (activeSankalp.accumulated / activeSankalp.goalCount) * 100)} className="h-3" />
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-background rounded-lg">
                  <p className="text-foreground text-xs mb-0.5">{t("board.remaining")}</p>
                  <p className="font-bold text-base">{formatCount(activeSankalp.remaining)}</p>
                </div>
                {!isAdmin && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-foreground text-xs mb-0.5">{t("board.contribution-title")}</p>
                    <p className="font-bold text-base text-primary">{formatCount(activeSankalp.userAccumulated ?? 0)}</p>
                  </div>
                )}
                <div className={`p-3 bg-background rounded-lg ${isAdmin ? "col-span-2" : ""}`}>
                  <p className="text-foreground text-xs mb-0.5">{t("board.progress")}</p>
                  <p className="font-bold text-base">{((activeSankalp.accumulated / activeSankalp.goalCount) * 100).toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {sankalps.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Target className="w-12 h-12 text-foreground mx-auto mb-4" />
            <p className="text-foreground text-lg">{t("board.no-active")}</p>
          </CardContent>
        </Card>
      )}

      {/* TABLE VIEW - All Sankalps */}
      {sankalps.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">📊 {t("board.all-sankalps")}</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">{t("board.col-sno")}</TableHead>
                      <TableHead className="font-semibold">{t("board.col-yajman")}</TableHead>
                      <TableHead className="font-semibold">{t("board.col-purpose")}</TableHead>
                      <TableHead className="font-semibold">{t("board.col-date")}</TableHead>
                      <TableHead className="font-semibold text-right">{t("board.col-jaap")}</TableHead>
                      {!isAdmin && <TableHead className="font-semibold text-right">{t("board.yours-label")}</TableHead>}
                      <TableHead className="font-semibold">{t("board.progress")}</TableHead>
                      <TableHead className="font-semibold text-center">{t("board.col-status")}</TableHead>
                      <TableHead className="font-semibold text-right">{t("board.col-actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sankalps.map((s, idx) => {
                      const dateStr = new Date(s.createdAt).toLocaleDateString("hi-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                      });
                      const isExpanded = expandedId === s.id;
                      const contrib = contributions[s.id];
                      const displayCount = s.isCompleted ? (s.globalAccumulated ?? s.accumulated) : s.accumulated;
                      const progressPct = s.isCompleted ? 100 : Math.min(100, (s.accumulated / s.goalCount) * 100);
                      return (
                        <Fragment key={s.id}>
                          <TableRow
                            className={`${!isAdmin ? "cursor-pointer" : ""} ${s.isActive ? "bg-orange-50/40 dark:bg-orange-950/20" : s.isCompleted ? "bg-green-50/40 dark:bg-green-950/20" : "hover:bg-muted/50"}`}
                            onClick={() => toggleExpand(s.id)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {!isAdmin && (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                                {idx + 1}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">{s.yajamana?.name ?? t("board.unknown")}</TableCell>
                            <TableCell className="text-sm text-foreground max-w-xs truncate">{s.purpose}</TableCell>
                            <TableCell className="text-sm text-foreground">{dateStr}</TableCell>
                            <TableCell className="text-right font-mono">
                              <span className="text-base font-semibold">{formatCount(displayCount)}</span>
                              <span className="text-xs text-foreground"> / {formatCount(s.goalCount)}</span>
                            </TableCell>
                            {!isAdmin && (
                              <TableCell className="text-right font-mono">
                                <span className={`text-sm font-semibold ${(s.userAccumulated ?? 0) > 0 ? "text-primary" : "text-foreground"}`}>
                                  {formatCount(s.userAccumulated ?? 0)}
                                </span>
                              </TableCell>
                            )}
                            <TableCell>
                              <div className="flex items-center gap-2 min-w-max">
                                <Progress value={progressPct} className="w-20 h-2" />
                                <span className="text-xs font-semibold text-foreground min-w-12 text-right">
                                  {progressPct.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{getStatusBadge(s)}</TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              {(isAdmin || s.isCompleted) && (
                                <Button size="sm" variant="ghost" title={t("board.report-btn")} onClick={() => openReport(s)} className="h-8 w-8 p-0">
                                  <FileText className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && !isAdmin && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={8} className="p-4">
                                <div className="space-y-3">
                                  <h4 className="font-semibold text-sm">
                                    {s.isCompleted ? t("board.completed-contribution-title") : t("board.contribution-title")}
                                  </h4>
                                  {loadingId === s.id ? (
                                    <p className="text-sm text-foreground">{t("board.loading")}</p>
                                  ) : contrib ? (
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="p-3 bg-background rounded-lg border border-primary/20">
                                        <p className="text-xs text-foreground mb-1">{t("board.total-jaaps-done")}</p>
                                        <p className="text-2xl font-bold text-primary">{contrib.totalJaaps.toLocaleString()}</p>
                                      </div>
                                      <div className="p-3 bg-background rounded-lg border border-green-200/50">
                                        <p className="text-xs text-foreground mb-1">{t("board.earning")}</p>
                                        <p className="text-2xl font-bold text-green-600">₹{contrib.earnings.toFixed(2)}</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-foreground">{t("board.no-contribution")}</p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isAdmin ? (
                <>
                  <Users className="w-5 h-5 text-blue-600" />
                  {t("board.report-admin-title")} — {reportSankalp?.yajamana?.name}
                </>
              ) : (
                <>
                  <Coins className="w-5 h-5 text-green-600" />
                  {t("board.report-my-title")} — {reportSankalp?.yajamana?.name}
                </>
              )}
            </DialogTitle>
            {reportSankalp && (
              <p className="text-xs text-foreground italic mt-0.5">{reportSankalp.purpose}</p>
            )}
          </DialogHeader>

          {reportLoading ? (
            <p className="text-sm text-foreground text-center py-10">{t("board.loading")}</p>
          ) : isAdmin ? (
            <div className="space-y-4">
              {reportContributors.length > 0 ? (
                <>
                  <div className="text-sm font-semibold p-3 bg-blue-50 dark:bg-blue-950/30 rounded flex gap-6">
                    <span>{t("board.total-contributors")}: <span className="text-lg text-blue-600 dark:text-blue-400">{reportContributors.length}</span></span>
                    <span>{t("board.col-total-jaap")}: <span className="font-bold">{reportContributors.reduce((a, c) => a + c.totalJaaps, 0).toLocaleString()}</span></span>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b-2 border-primary/20">
                          <th className="px-4 py-3 text-left font-semibold">{t("board.col-sno")}</th>
                          <th className="px-4 py-3 text-left font-semibold">{t("board.col-bhakt")}</th>
                          <th className="px-4 py-3 text-right font-semibold">{t("board.col-total-jaap")}</th>
                          <th className="px-4 py-3 text-right font-semibold">{t("board.col-earned")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportContributors.map((c, idx) => (
                          <tr key={c.userId} className={`border-b ${idx % 2 === 0 ? "bg-background/50" : ""}`}>
                            <td className="px-4 py-3 font-medium text-foreground">{idx + 1}</td>
                            <td className="px-4 py-3 font-medium">{c.userName}</td>
                            <td className="px-4 py-3 text-right font-mono">{c.totalJaaps.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-green-600">₹{c.earnings.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t-2">
                        <tr>
                          <td colSpan={2} className="px-4 py-3 font-bold">{t("board.total-payment")}</td>
                          <td className="px-4 py-3 text-right font-bold font-mono">{reportContributors.reduce((a, c) => a + c.totalJaaps, 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold font-mono text-green-600">₹{reportContributors.reduce((sum, c) => sum + c.earnings, 0).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-foreground text-center py-8">{t("board.no-contrib-sankalp")}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {myContrib ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-primary/5 border border-primary/20 rounded-xl text-center">
                      <p className="text-xs text-foreground mb-2">{t("board.my-jaaps")}</p>
                      <p className="text-4xl font-bold text-primary">{myContrib.totalJaaps.toLocaleString()}</p>
                    </div>
                    <div className="p-5 bg-green-50 dark:bg-green-950/20 border border-green-200/50 rounded-xl text-center">
                      <p className="text-xs text-foreground mb-2">{t("board.my-earnings")}</p>
                      <p className="text-4xl font-bold text-green-600">₹{myContrib.earnings.toFixed(2)}</p>
                    </div>
                  </div>
                  {reportSankalp && (
                    <div className="p-3 bg-muted/30 rounded-lg text-xs text-foreground text-center">
                      {t("board.total-label")}:{" "}
                      <span className="font-semibold text-foreground">{formatCount(reportSankalp.globalAccumulated ?? reportSankalp.accumulated)}</span>
                      {" "}/ {formatCount(reportSankalp.goalCount)} —{" "}
                      <span className="text-green-600 font-medium">{t("board.sankalp-complete-mark")}</span>
                    </div>
                  )}
                  <p className="text-center text-sm text-foreground italic">{t("board.devotion-msg")}</p>
                </>
              ) : (
                <p className="text-sm text-foreground text-center py-8">{t("board.no-jaap-msg")}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>{t("board.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
