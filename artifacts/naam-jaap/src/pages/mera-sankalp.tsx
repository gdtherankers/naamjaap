import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Target, Wallet, Clock, Users, TrendingUp, CheckCircle, PauseCircle, Star, FileText, Coins } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

type PatronSankalp = {
  id: string;
  yajamanaId: string;
  mantraId: string;
  goalCount: number;
  budgetRs: number | null;
  purpose: string;
  deadline: string | null;
  status: "active" | "paused" | "completed";
  createdAt: string;
  completedAt: string | null;
  accumulated: number;
  mantra: { id: string; scriptText: string; displayName: string } | null;
  yajamana: {
    id: string;
    name: string;
    gotra: string;
    fatherName: string | null;
    husbandName: string | null;
    niwasStan: string;
    status: string;
    relation: string;
  } | null;
};

function formatCount(n: number): string {
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)} Lakh`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function relationLabel(r: string): string {
  const map: Record<string, string> = {
    self: "स्वयं",
    mata: "माता जी",
    pita: "पिता जी",
    patni: "पत्नी जी",
    putra: "पुत्र",
    putri: "पुत्री",
    custom: "अन्य",
  };
  return map[r] ?? r;
}

export default function MeraSankalpPage() {
  const { t } = useLanguage();
  const { data: profileEnv } = useGetMyProfile();
  const isAdmin = profileEnv?.profile?.isAdmin;

  const [sankalps, setSankalps] = useState<PatronSankalp[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportSankalpId, setReportSankalpId] = useState<string | null>(null);
  const [reportContributors, setReportContributors] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchSankalps = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/patron-sankalps", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSankalps(data.patronSankalps ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSankalps();
    // Poll for realtime updates every 3 seconds
    const interval = setInterval(fetchSankalps, 3000);
    return () => clearInterval(interval);
  }, [fetchSankalps]);

  const openReport = async (sankalpId: string) => {
    setReportSankalpId(sankalpId);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/admin/patron-sankalps/${sankalpId}/contributors`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setReportContributors(data.contributors ?? []);
      }
    } finally {
      setReportLoading(false);
    }
    setReportDialogOpen(true);
  };

  function estimateDaysToComplete(accumulated: number, goalCount: number, createdAt: string): string {
    if (accumulated <= 0) return t("mera.na");
    const created = new Date(createdAt);
    const now = new Date();
    const daysSince = Math.max(1, (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    const pace = accumulated / daysSince;
    if (pace <= 0) return t("mera.na");
    const remaining = goalCount - accumulated;
    if (remaining <= 0) return t("mera.completed-label");
    const daysLeft = Math.ceil(remaining / pace);
    if (daysLeft > 365) return `~${Math.round(daysLeft / 365)} ${t("mera.years")}`;
    return `~${daysLeft} ${t("mera.days")}`;
  }

  const activeSankalps = sankalps.filter((s) => s.status === "active");
  const otherSankalps = sankalps.filter((s) => s.status !== "active");

  const totalAccumulated = activeSankalps.reduce((sum, s) => sum + s.accumulated, 0);
  const totalGoal = activeSankalps.reduce((sum, s) => sum + s.goalCount, 0);
  const totalBudget = activeSankalps.reduce((sum, s) => sum + (s.budgetRs ?? 0), 0);
  const totalSpent = activeSankalps.reduce((sum, s) => sum + s.accumulated * 0.01, 0);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-foreground">{t("mera.admin-required")}</p>
      </div>
    );
  }

  if (loading) return null;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-serif">{t("mera.title")}</h1>
        <p className="text-foreground mt-1">{t("mera.subtitle")}</p>
      </div>

      {activeSankalps.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-amber-50/50 border-amber-200 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("mera.total-accumulated")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{formatCount(totalAccumulated)}</div>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t("mera.of-goal").replace("{n}", formatCount(totalGoal))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> {t("mera.budget-used")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalSpent.toFixed(2)}</div>
              <p className="text-xs text-foreground mt-0.5">{t("mera.of-allocated").replace("{n}", totalBudget.toFixed(0))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {t("mera.active-sankalps")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSankalps.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {t("mera.remaining-budget")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{Math.max(0, totalBudget - totalSpent).toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSankalps.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Target className="w-12 h-12 text-foreground mx-auto mb-4" />
            <p className="text-foreground text-lg">{t("mera.no-active")}</p>
            <p className="text-sm text-foreground mt-1">{t("mera.no-active-desc")}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t("mera.active-heading")}</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>{t("mera.col-yajamana")}</TableHead>
                <TableHead className="font-serif">{t("mera.col-mantra")}</TableHead>
                <TableHead>{t("mera.col-purpose")}</TableHead>
                <TableHead className="text-right">{t("mera.col-progress")}</TableHead>
                <TableHead className="text-right">{t("mera.col-budget")}</TableHead>
                <TableHead className="text-center">{t("mera.col-estimate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeSankalps.map((s) => {
                const pct = Math.min(100, s.goalCount > 0 ? (s.accumulated / s.goalCount) * 100 : 0);
                const budgetUsed = s.accumulated * 0.01;
                const budgetRemaining = s.budgetRs != null ? Math.max(0, s.budgetRs - budgetUsed) : null;
                return (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="font-medium">{s.yajamana?.name ?? "—"}</div>
                      <div className="text-xs text-foreground">{s.yajamana?.gotra ?? "—"}</div>
                      {s.yajamana?.status === "divangat" && <Badge variant="outline" className="text-xs mt-1">{t("mera.divangat")}</Badge>}
                    </TableCell>
                    <TableCell className="font-serif font-bold text-sm">{s.mantra?.scriptText ?? "—"}</TableCell>
                    <TableCell className="text-sm text-foreground max-w-xs truncate">{s.purpose}</TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        <div className="font-mono text-sm">{formatCount(s.accumulated)} / {formatCount(s.goalCount)}</div>
                        <Progress value={pct} className="w-24 h-1.5" />
                        <div className="text-xs text-foreground">{pct.toFixed(1)}%</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1 text-xs">
                        <div className="font-medium">{s.budgetRs != null ? `₹${s.budgetRs.toFixed(0)}` : "—"}</div>
                        <div className="text-orange-600">{t("mera.budget-used-label")}: ₹{budgetUsed.toFixed(2)}</div>
                        <div className="text-green-600">{t("mera.budget-remaining-label")}: {budgetRemaining != null ? `₹${budgetRemaining.toFixed(2)}` : "—"}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-xs font-medium">{estimateDaysToComplete(s.accumulated, s.goalCount, s.createdAt)}</div>
                      {s.deadline && <div className="text-xs text-foreground mt-0.5">{s.deadline}</div>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      {otherSankalps.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-foreground">{t("mera.completed-paused")}</h2>
          <Card className="opacity-75">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{t("mera.col-yajamana")}</TableHead>
                  <TableHead className="font-serif">{t("mera.col-mantra")}</TableHead>
                  <TableHead>{t("mera.col-purpose")}</TableHead>
                  <TableHead className="text-right">{t("mera.col-progress")}</TableHead>
                  <TableHead className="text-center">{t("mera.col-status")}</TableHead>
                  <TableHead className="text-right">{t("mera.col-action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherSankalps.map((s) => {
                  const pct = Math.min(100, s.goalCount > 0 ? (s.accumulated / s.goalCount) * 100 : 0);
                  return (
                    <TableRow key={s.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="font-medium">{s.yajamana?.name ?? "—"}</div>
                        <div className="text-xs text-foreground">{s.yajamana?.gotra ?? "—"}</div>
                      </TableCell>
                      <TableCell className="font-serif font-bold text-sm">{s.mantra?.scriptText ?? "—"}</TableCell>
                      <TableCell className="text-sm text-foreground max-w-xs truncate">{s.purpose}</TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
                          <div className="font-mono text-sm">{formatCount(s.accumulated)} / {formatCount(s.goalCount)}</div>
                          <Progress value={pct} className="w-24 h-1.5" />
                          <div className="text-xs text-foreground">{pct.toFixed(1)}%</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={s.status === "completed" ? "secondary" : "outline"}>
                          {s.status === "completed" ? t("mera.completed-label") : s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        {s.status === "completed" && (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            title={t("mera.view-report")} 
                            onClick={() => openReport(s.id)}
                            className="h-8 w-8 p-0"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-green-600" /> {t("mera.report-title")}
            </DialogTitle>
          </DialogHeader>
          {reportSankalpId && (
            <div className="space-y-4">
              {reportLoading ? (
                <p className="text-sm text-foreground text-center py-8">{t("common.loading")}</p>
              ) : reportContributors.length > 0 ? (
                <div>
                  <div className="text-sm font-semibold mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded">
                    {t("board.total-contributors")}: <span className="text-lg text-blue-600 dark:text-blue-400">{reportContributors.length}</span>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b-2 border-primary/20">
                          <th className="px-4 py-3 text-left font-semibold">{t("mera.col-sno")}</th>
                          <th className="px-4 py-3 text-left font-semibold">{t("board.col-bhakt")}</th>
                          <th className="px-4 py-3 text-right font-semibold">{t("board.col-total-jaap")}</th>
                          <th className="px-4 py-3 text-right font-semibold">{t("board.col-earned")}</th>
                          <th className="px-4 py-3 text-center font-semibold">{t("mera.col-status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportContributors.map((c, idx) => (
                          <tr key={c.userId} className={`border-b ${idx % 2 === 0 ? "bg-background/50" : ""}`}>
                            <td className="px-4 py-3 font-medium text-foreground">{idx + 1}</td>
                            <td className="px-4 py-3 font-medium">{c.userName}</td>
                            <td className="px-4 py-3 text-right font-mono">{c.totalJaaps.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-green-600">₹{c.earnings.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="outline" className="bg-amber-50/50 dark:bg-amber-950/20">{t("mera.ready-for-payment")}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg flex justify-between items-center">
                    <span className="font-semibold text-foreground">{t("board.total-payment")}:</span>
                    <span className="font-bold text-xl text-green-600">₹{reportContributors.reduce((sum, c) => sum + c.earnings, 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-foreground">{t("mera.no-contribution")}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>{t("mera.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
