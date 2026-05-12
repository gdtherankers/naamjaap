import {
  useGetDashboardSummary,
  useGetJaapHistory,
  useGetGlobalStats,
  useGetMyProfile,
  useAdminStats,
  useGetJaapSnapshot,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Flame, Coins, BarChart3, Star, Target, Zap, Users, IndianRupee, Activity, CheckCircle2, Clock, Search, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/language-context";
import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

type LiveReport = {
  bhakts: { name: string; todayJaap: number; todayEarnings: number; patronSankalpId: string | null }[];
  sankalps: {
    id: string; purpose: string; goalCount: number; accumulated: number; todayAccumulated: number;
    budgetUsed: number; budgetTotal: number; percent: number; status: string;
    yajamanaName: string; mantraText: string; createdAt: string;
  }[];
};

type Contributor = { userId: string; userName: string; totalJaaps: number; earnings: number };

function formatCount(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(2)} Lakh`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function AdminDashboard() {
  const { t, language } = useLanguage();
  const { data: stats } = useAdminStats({
    query: { refetchInterval: 1000 } as any,
  });

  const { data: liveReport } = useQuery<LiveReport>({
    queryKey: ["admin-live-report"],
    queryFn: async () => {
      const res = await fetch("/api/admin/live-report", { credentials: "include" });
      return res.json();
    },
    refetchInterval: 1000,
  });

  const { data: aggHistoryEnv } = useQuery<{ days: { date: string; jaap: number; earnings: number }[] }>({
    queryKey: ["admin-aggregate-history"],
    queryFn: async () => {
      const res = await fetch("/api/admin/aggregate-history", { credentials: "include" });
      return res.json();
    },
    refetchInterval: 30000,
  });
  const aggHistory = aggHistoryEnv?.days ?? [];
  const aggYesterdayJaap = aggHistory.length >= 2 ? (aggHistory[aggHistory.length - 2]?.jaap ?? 0) : 0;
  const aggYesterdayEarnings = aggHistory.length >= 2 ? (aggHistory[aggHistory.length - 2]?.earnings ?? 0) : 0;
  const agg7Jaap = aggHistory.slice(-7).reduce((a, d) => a + d.jaap, 0);
  const agg7Earnings = aggHistory.slice(-7).reduce((a, d) => a + d.earnings, 0);
  const agg30Jaap = aggHistory.reduce((a, d) => a + d.jaap, 0);
  const agg30Earnings = aggHistory.reduce((a, d) => a + d.earnings, 0);

  const s = stats as any;
  const bhakts = liveReport?.bhakts ?? [];
  const sankalps = liveReport?.sankalps ?? [];
  const activeSankalps = sankalps.filter((s) => s.status !== "completed");
  const completedSankalps = sankalps.filter((s) => s.status === "completed");

  // ── Active Devotees modal ──────────────────────────────────────────────────
  const [showBhaktsModal, setShowBhaktsModal] = useState(false);

  // ── Period Breakdown dialog ────────────────────────────────────────────────
  type PeriodKey = "today" | "yesterday" | "7days" | "30days" | "alltime";
  type PeriodBhakt = { name: string; jaap: number; earnings: number };
  const [periodDialog, setPeriodDialog] = useState<{ open: boolean; period: PeriodKey; loading: boolean; data: PeriodBhakt[] }>({
    open: false, period: "today", loading: false, data: [],
  });
  const periodLabel = (p: PeriodKey) => language === "hi"
    ? { today: "आज", yesterday: "कल", "7days": "7 दिन", "30days": "30 दिन", alltime: "कुल" }[p]
    : { today: "Today", yesterday: "Yesterday", "7days": "7 Days", "30days": "30 Days", alltime: "All Time" }[p];

  const openPeriodBreakdown = async (period: PeriodKey) => {
    setPeriodDialog({ open: true, period, loading: true, data: [] });
    try {
      const res = await fetch(`/api/admin/period-breakdown?period=${period}`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setPeriodDialog(prev => ({ ...prev, loading: false, data: d.bhakts ?? [] })); }
      else setPeriodDialog(prev => ({ ...prev, loading: false }));
    } catch { setPeriodDialog(prev => ({ ...prev, loading: false })); }
  };

  // ── Report dialog state ────────────────────────────────────────────────────
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSankalp, setReportSankalp] = useState<LiveReport["sankalps"][0] | null>(null);
  const [reportContributors, setReportContributors] = useState<Contributor[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const openReport = async (sk: LiveReport["sankalps"][0], e: React.MouseEvent) => {
    e.stopPropagation();
    setReportSankalp(sk);
    setReportContributors([]);
    setReportLoading(true);
    setReportOpen(true);
    try {
      const res = await fetch(`/api/admin/patron-sankalps/${sk.id}/contributors`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setReportContributors(d.contributors ?? []); }
    } finally { setReportLoading(false); }
  };

  // ── Sankalp table state ────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number | "all">(10);
  const [page, setPage] = useState(1);

  const filteredSankalps = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sankalps;
    return sankalps.filter(sk =>
      sk.yajamanaName.toLowerCase().includes(q) ||
      sk.mantraText.toLowerCase().includes(q) ||
      sk.purpose.toLowerCase().includes(q)
    );
  }, [sankalps, search]);

  const totalPages = pageSize === "all" ? 1 : Math.ceil(filteredSankalps.length / pageSize);
  const pagedSankalps = pageSize === "all"
    ? filteredSankalps
    : filteredSankalps.slice((page - 1) * pageSize, page * pageSize);

  // reset page when search or pageSize changes
  useEffect(() => { setPage(1); }, [search, pageSize]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.dash.title")}</h1>
          <p className="text-foreground mt-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500 animate-pulse" />
            {t("admin.dash.subtitle")}
          </p>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-400 bg-green-50 dark:bg-green-950/30 mt-2">
          ● LIVE
        </Badge>
      </div>

      {/* Top stat row — 3 cards */}
      <div className="grid gap-4 grid-cols-3">
        {/* Clickable Active Devotees Today card */}
        <Card
          className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
          onClick={() => setShowBhaktsModal(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.dash.active-bhakts")}</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s?.activeBhaktsToday ?? 0}</div>
            <p className="text-xs text-primary mt-1 underline underline-offset-2">{t("admin.dash.jaap-today")} — click to view</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.dash.sankalps")}</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSankalps.length}</div>
            <p className="text-xs text-foreground mt-1">{completedSankalps.length} {t("admin.dash.completed-count")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.dash.total-bhakts")}</CardTitle>
            <Users className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s?.approvedUsers ?? 0}</div>
            <p className="text-xs text-foreground mt-1">{s?.pendingApproval ?? 0} {t("admin.dash.pending-approval")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aggregate Jaap Summary Table */}
      <Card className="bg-orange-50/50 dark:bg-orange-950/10 border-orange-200/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-5 h-5 text-orange-500" />
            {language === "hi" ? "सभी भक्त — जाप सारांश" : "All Devotees — Jaap Summary"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-5 px-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-orange-200/60 dark:border-orange-800/40">
                  <th className="text-left py-2.5 pr-4 font-semibold text-foreground text-xs uppercase tracking-wide">
                    {language === "hi" ? "विवरण" : "Metric"}
                  </th>
                  {(language === "hi"
                    ? ["आज", "कल", "7 दिन", "30 दिन", "कुल"]
                    : ["Today", "Yesterday", "7 Days", "30 Days", "All Time"]
                  ).map((col) => (
                    <th key={col} className="text-right py-2.5 px-3 font-semibold text-foreground text-xs uppercase tracking-wide">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-orange-200/40 dark:border-orange-800/30">
                  <td className="py-4 pr-4 font-medium text-foreground flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                    {language === "hi" ? "जाप" : "Jaap"}
                  </td>
                  {(["today","yesterday","7days","30days","alltime"] as const).map((p, i) => {
                    const val = [s?.todayJaap ?? 0, aggYesterdayJaap, agg7Jaap, agg30Jaap, s?.totalJaap ?? 0][i];
                    const isHighlight = i === 0 || i === 4;
                    return (
                      <td key={p} onClick={() => openPeriodBreakdown(p)}
                        className={`text-right px-3 py-4 cursor-pointer rounded hover:bg-orange-200/40 transition-colors ${isHighlight ? "font-bold text-lg text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
                        {Number(val).toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-medium text-foreground flex items-center gap-2">
                    <Coins className="w-4 h-4 text-green-500 shrink-0" />
                    {language === "hi" ? "खर्च (₹)" : "Expense (₹)"}
                  </td>
                  {(["today","yesterday","7days","30days","alltime"] as const).map((p, i) => {
                    const val = [s?.todayExpense ?? 0, aggYesterdayEarnings, agg7Earnings, agg30Earnings, s?.totalExpense ?? 0][i];
                    const isHighlight = i === 0 || i === 4;
                    return (
                      <td key={p} onClick={() => openPeriodBreakdown(p)}
                        className={`text-right px-3 py-4 cursor-pointer rounded hover:bg-orange-200/40 transition-colors ${isHighlight ? "font-bold text-lg text-green-600 dark:text-green-400" : "text-foreground"}`}>
                        ₹{Number(val).toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sankalp Progress — Sankalp Board style table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                {t("admin.dash.sankalp-report")}
              </CardTitle>
              <CardDescription className="mt-1">{t("admin.dash.sankalp-report-desc")}</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground" />
                <Input
                  placeholder="Search yajamana, mantra..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm w-48"
                />
              </div>
              <Select
                value={String(pageSize)}
                onValueChange={v => setPageSize(v === "all" ? "all" : Number(v))}
              >
                <SelectTrigger className="h-8 w-24 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 rows</SelectItem>
                  <SelectItem value="20">20 rows</SelectItem>
                  <SelectItem value="50">50 rows</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredSankalps.length === 0 ? (
            <p className="text-sm text-foreground text-center py-8">
              {search ? "No sankalps found for your search." : t("admin.dash.no-sankalp")}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold w-10">#</TableHead>
                      <TableHead className="font-semibold">Yajamana</TableHead>
                      <TableHead className="font-semibold hidden md:table-cell">Purpose</TableHead>
                      <TableHead className="font-semibold hidden lg:table-cell">Date</TableHead>
                      <TableHead className="font-semibold text-right">Jaap</TableHead>
                      <TableHead className="font-semibold text-right hidden sm:table-cell">Today</TableHead>
                      <TableHead className="font-semibold">Progress</TableHead>
                      <TableHead className="font-semibold text-center">Status</TableHead>
                      <TableHead className="font-semibold text-right">Report</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedSankalps.map((sk, i) => {
                      const rowNum = pageSize === "all" ? i + 1 : (page - 1) * (pageSize as number) + i + 1;
                      const dateStr = sk.createdAt
                        ? new Date(sk.createdAt).toLocaleDateString("hi-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "—";
                      const progressPct = sk.status === "completed" ? 100 : sk.percent;
                      return (
                        <TableRow
                          key={sk.id}
                          className={sk.status === "completed" ? "bg-green-50/40 dark:bg-green-950/20" : sk.status === "active" ? "bg-orange-50/40 dark:bg-orange-950/20" : ""}
                        >
                          <TableCell className="font-medium text-foreground">{rowNum}</TableCell>
                          <TableCell className="font-semibold">
                            <div>{sk.yajamanaName}</div>
                            <div className="text-xs font-serif text-foreground font-normal">{sk.mantraText}</div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground max-w-xs truncate hidden md:table-cell italic">{sk.purpose}</TableCell>
                          <TableCell className="text-sm text-foreground hidden lg:table-cell">{dateStr}</TableCell>
                          <TableCell className="text-right font-mono">
                            <span className="text-base font-semibold">{formatCount(sk.accumulated)}</span>
                            <span className="text-xs text-foreground"> / {formatCount(sk.goalCount)}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-primary hidden sm:table-cell">
                            +{formatCount(sk.todayAccumulated)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-max">
                              <Progress value={progressPct} className="w-20 h-2" />
                              <span className="text-xs font-semibold text-foreground min-w-12 text-right">
                                {progressPct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {sk.status === "completed" ? (
                              <Badge className="bg-green-600 text-white text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />Done
                              </Badge>
                            ) : (
                              <Badge className="bg-orange-600 text-white text-xs">🔥 Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm" variant="ghost"
                              className="h-8 w-8 p-0"
                              title="View contributors report"
                              onClick={(e) => openReport(sk, e)}
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pageSize !== "all" && totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-foreground">
                    Showing {(page - 1) * (pageSize as number) + 1}–{Math.min(page * (pageSize as number), filteredSankalps.length)} of {filteredSankalps.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs px-2">{page} / {totalPages}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              {pageSize !== "all" && totalPages <= 1 && filteredSankalps.length > 0 && (
                <div className="px-4 py-2 border-t">
                  <p className="text-xs text-foreground">Showing all {filteredSankalps.length} sankalp{filteredSankalps.length !== 1 ? "s" : ""}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Contributors Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Contributors Report — {reportSankalp?.yajamanaName}
            </DialogTitle>
            <DialogDescription className="italic">{reportSankalp?.purpose}</DialogDescription>
          </DialogHeader>

          {reportLoading ? (
            <p className="text-sm text-foreground text-center py-10">Loading...</p>
          ) : reportContributors.length === 0 ? (
            <p className="text-sm text-foreground text-center py-8">No contributions yet for this sankalp.</p>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-semibold p-3 bg-blue-50 dark:bg-blue-950/30 rounded flex gap-6">
                <span>Total Contributors: <span className="text-lg text-blue-600 dark:text-blue-400">{reportContributors.length}</span></span>
                <span>Total Jaap: <span className="font-bold">{reportContributors.reduce((a, c) => a + c.totalJaaps, 0).toLocaleString()}</span></span>
                <span>Total: <span className="font-bold text-green-600">₹{reportContributors.reduce((a, c) => a + c.earnings, 0).toFixed(2)}</span></span>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b-2 border-primary/20">
                      <th className="px-4 py-3 text-left font-semibold">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Bhakt</th>
                      <th className="px-4 py-3 text-right font-semibold">Total Jaap</th>
                      <th className="px-4 py-3 text-right font-semibold">Earned</th>
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
                      <td colSpan={2} className="px-4 py-3 font-bold">Total</td>
                      <td className="px-4 py-3 text-right font-bold font-mono">{reportContributors.reduce((a, c) => a + c.totalJaaps, 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-bold font-mono text-green-600">₹{reportContributors.reduce((a, c) => a + c.earnings, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Devotees Today — Modal */}
      <Dialog open={showBhaktsModal} onOpenChange={setShowBhaktsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {t("admin.dash.today-bhakts-section")}
            </DialogTitle>
            <DialogDescription>{t("admin.dash.today-bhakts-desc")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {bhakts.length === 0 ? (
              <p className="text-sm text-foreground text-center py-8">No devotees have chanted today yet.</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-foreground">{t("admin.dash.col-bhakt")}</th>
                      <th className="text-right px-4 py-2 font-medium text-foreground">{t("admin.dash.col-today-jaap")}</th>
                      <th className="text-right px-4 py-2 font-medium text-foreground">{t("admin.dash.col-today-expense")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bhakts.map((b, i) => (
                      <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{b.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{b.todayJaap.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-green-600">₹{b.todayEarnings.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2">
                    <tr>
                      <td className="px-4 py-2.5 font-bold">{t("admin.dash.total")}</td>
                      <td className="px-4 py-2.5 text-right font-bold font-mono">
                        {bhakts.reduce((a, b) => a + b.todayJaap, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold font-mono text-green-600">
                        ₹{bhakts.reduce((a, b) => a + b.todayEarnings, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBhaktsModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Breakdown Dialog */}
      <Dialog open={periodDialog.open} onOpenChange={(o) => setPeriodDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-orange-500" />
              {language === "hi" ? "भक्त-वार रिपोर्ट" : "Bhakt-wise Report"} — {periodLabel(periodDialog.period)}
            </DialogTitle>
            <DialogDescription>
              {language === "hi" ? "इस अवधि में प्रत्येक भक्त के जाप और अर्जन" : "Jaap count and earnings per bhakt for this period"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {periodDialog.loading ? (
              <div className="py-10 text-center text-foreground text-sm">Loading...</div>
            ) : periodDialog.data.length === 0 ? (
              <div className="py-10 text-center text-foreground text-sm">
                {language === "hi" ? "इस अवधि में कोई जाप नहीं" : "No jaap recorded for this period"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-semibold text-xs uppercase text-foreground">#</th>
                    <th className="text-left py-2 px-3 font-semibold text-xs uppercase text-foreground">{language === "hi" ? "भक्त" : "Bhakt"}</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-foreground">{language === "hi" ? "जाप" : "Jaap"}</th>
                    <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-foreground">{language === "hi" ? "अर्जन" : "Earnings"}</th>
                  </tr>
                </thead>
                <tbody>
                  {periodDialog.data.map((b, i) => (
                    <tr key={i} className="border-b border-muted/40 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 text-foreground">{i + 1}</td>
                      <td className="py-2.5 px-3 font-medium">{b.name}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-orange-600 dark:text-orange-400">{b.jaap.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-green-600">₹{b.earnings.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t-2">
                  <tr>
                    <td colSpan={2} className="py-2.5 px-3 font-bold">{language === "hi" ? "कुल" : "Total"}</td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono text-orange-600 dark:text-orange-400">
                      {periodDialog.data.reduce((a, b) => a + b.jaap, 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono text-green-600">
                      ₹{periodDialog.data.reduce((a, b) => a + b.earnings, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialog(prev => ({ ...prev, open: false }))}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Bhakt Dashboard ──────────────────────────────────────────────────────────

function BhaktDashboard() {
  const { t, language } = useLanguage();
  const { data: summary } = useGetDashboardSummary({
    query: { refetchInterval: 1000 } as any,
  });
  const { data: snapshotEnv } = useGetJaapSnapshot({
    query: { refetchInterval: 3000 } as any,
  });
  const { data: historyEnv } = useGetJaapHistory({ days: 30 });
  const { data: global } = useGetGlobalStats();

  const snapshot = summary?.snapshot;
  const currentSankalp = snapshotEnv?.snapshot?.currentSankalp ?? null;
  const history = historyEnv?.days || [];
  const targetProgress = (summary?.dailyTargetProgress || 0) * 100;

  // Personal jaap stats computed from 30-day history
  const last7Days = history.slice(-7);
  const last7DaysTotal = last7Days.reduce((s, d) => s + d.count, 0);
  const last30DaysTotal = history.reduce((s, d) => s + d.count, 0);
  const yesterdayCount = history.length >= 2 ? (history[history.length - 2]?.count ?? 0) : 0;
  const last7DaysEarnings = last7Days.reduce((s, d) => s + (d.earnings ?? 0), 0);
  const last30DaysEarnings = history.reduce((s, d) => s + (d.earnings ?? 0), 0);
  const yesterdayEarnings = history.length >= 2 ? (history[history.length - 2]?.earnings ?? 0) : 0;

  const [showSankalpPopup, setShowSankalpPopup] = useState(false);
  const prevSankalpRef = useRef<string | null>(null);
  const hasShownPopupRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (currentSankalp) {
      const currentId = currentSankalp.id;
      const prevId = prevSankalpRef.current;
      if (currentId !== prevId && !hasShownPopupRef.current.has(currentId)) {
        setShowSankalpPopup(true);
        hasShownPopupRef.current.add(currentId);
      }
      prevSankalpRef.current = currentId;
    }
  }, [currentSankalp?.id]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-sm font-medium text-primary flex items-center gap-2">
                <Target className="w-4 h-4" /> {t("dashboard.daily-target")}
              </p>
              <p className="text-2xl font-bold">{snapshot?.todayCount ?? 0} <span className="text-sm text-foreground font-normal">/ {summary?.dailyTarget ?? 25000}</span></p>
            </div>
            <p className="text-sm font-medium text-primary">{Math.round(targetProgress)}%</p>
          </div>
          <Progress value={targetProgress} className="h-3" />
        </CardContent>
      </Card>

      {currentSankalp && (
        <Card className="border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-900 dark:text-amber-300">
              <Target className="w-4 h-4" /> {t("dashboard.active-sankalp")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{currentSankalp.yajamanaName}</p>
              <p className="text-xs text-amber-800/70 dark:text-amber-400/70 italic">{currentSankalp.purpose}</p>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-amber-800 dark:text-amber-300">{t("dashboard.progress")}</span>
                <span className="font-semibold text-amber-900 dark:text-amber-200">{currentSankalp.accumulated.toLocaleString()} / {currentSankalp.goalCount.toLocaleString()}</span>
              </div>
              <Progress key={`progress-${currentSankalp.id}`} value={Math.min(100, (currentSankalp.accumulated / currentSankalp.goalCount) * 100)} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-background rounded">
                <p className="text-foreground">{t("dashboard.remaining")}</p>
                <p className="font-bold">{currentSankalp.remaining.toLocaleString()}</p>
              </div>
              <div className="p-2 bg-background rounded">
                <p className="text-foreground">{t("dashboard.progress")}</p>
                <p className="font-bold">{((currentSankalp.accumulated / currentSankalp.goalCount) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-orange-50/50 dark:bg-orange-950/10 border-orange-200/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-5 h-5 text-orange-500" />
            {language === "hi" ? "मेरा जाप सारांश" : "My Jaap Summary"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-5 px-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-orange-200/60 dark:border-orange-800/40">
                  <th className="text-left py-2.5 pr-4 font-semibold text-foreground text-xs uppercase tracking-wide">
                    {language === "hi" ? "विवरण" : "Metric"}
                  </th>
                  {[
                    language === "hi" ? "आज" : "Today",
                    language === "hi" ? "कल" : "Yesterday",
                    language === "hi" ? "7 दिन" : "7 Days",
                    language === "hi" ? "30 दिन" : "30 Days",
                    language === "hi" ? "कुल" : "All Time",
                  ].map((col) => (
                    <th key={col} className="text-right py-2.5 px-3 font-semibold text-foreground text-xs uppercase tracking-wide">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-orange-200/40 dark:border-orange-800/30 hover:bg-orange-100/30 dark:hover:bg-orange-900/10 transition-colors">
                  <td className="py-4 pr-4 font-medium text-foreground flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500 shrink-0" />
                    {language === "hi" ? "जाप" : "Jaap"}
                  </td>
                  <td className="text-right px-3 py-4 font-bold text-lg text-orange-600 dark:text-orange-400">{(snapshot?.todayCount ?? 0).toLocaleString()}</td>
                  <td className="text-right px-3 py-4 text-foreground">{yesterdayCount.toLocaleString()}</td>
                  <td className="text-right px-3 py-4 text-foreground">{last7DaysTotal.toLocaleString()}</td>
                  <td className="text-right px-3 py-4 text-foreground">{last30DaysTotal.toLocaleString()}</td>
                  <td className="text-right px-3 py-4 font-bold text-primary text-lg">{(snapshot?.totalCount ?? 0).toLocaleString()}</td>
                </tr>
                <tr className="hover:bg-orange-100/30 dark:hover:bg-orange-900/10 transition-colors">
                  <td className="py-4 pr-4 font-medium text-foreground flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-green-600 shrink-0" />
                    {language === "hi" ? "कमाई" : "Earning"}
                  </td>
                  <td className="text-right px-3 py-4 font-bold text-lg text-green-600 dark:text-green-400">₹{(snapshot?.todayEarnings ?? 0).toFixed(2)}</td>
                  <td className="text-right px-3 py-4 text-foreground">₹{yesterdayEarnings.toFixed(2)}</td>
                  <td className="text-right px-3 py-4 text-foreground">₹{last7DaysEarnings.toFixed(2)}</td>
                  <td className="text-right px-3 py-4 text-foreground">₹{last30DaysEarnings.toFixed(2)}</td>
                  <td className="text-right px-3 py-4 font-bold text-primary text-lg">₹{(snapshot?.totalEarnings ?? 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* New Sankalp Popup */}
      {currentSankalp && (
        <Dialog open={showSankalpPopup} onOpenChange={setShowSankalpPopup}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-2xl font-serif flex items-center justify-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" /> {language === "hi" ? "नया संकल्प शुरू" : "New Sankalp Started"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg space-y-3">
                <div>
                  <p className="text-xs text-foreground mb-1">{language === "hi" ? "यजमान" : "Yajamana"}</p>
                  <p className="text-lg font-semibold">{currentSankalp.yajamanaName}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground mb-1">{language === "hi" ? "संकल्प का उद्देश्य" : "Purpose"}</p>
                  <p className="text-base">{currentSankalp.purpose}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-foreground">{language === "hi" ? "लक्ष्य" : "Goal"}</p>
                    <p className="text-lg font-bold text-primary">{currentSankalp.goalCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground">{language === "hi" ? "शेष" : "Remaining"}</p>
                    <p className="text-lg font-bold text-orange-600">{currentSankalp.remaining.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-foreground italic">
                {language === "hi" ? "अब इस संकल्प के लिए जाप शुरू करें। 🙏" : "Start chanting for this sankalp now. 🙏"}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowSankalpPopup(false)} className="w-full bg-orange-600 hover:bg-orange-700">
                {language === "hi" ? "✨ जाप शुरू करें" : "✨ Start Jaap"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: profileEnv, isLoading } = useGetMyProfile();
  const isAdmin = profileEnv?.profile?.isAdmin;

  if (isLoading) return null;

  return isAdmin ? <AdminDashboard /> : <BhaktDashboard />;
}
