import React, { useState } from "react";
import {
  useAdminListUsers,
  useAdminListPayouts,
  useAdminUpdatePayout,
  getAdminListPayoutsQueryKey,
  getAdminListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Coins, Clock, IndianRupee, Users, Banknote, Smartphone, HandCoins, Trash2, Send, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language-context";

type PayoutEntry = {
  id: string;
  devoteeName: string;
  userId: string;
  amount: number;
  upiId: string | null;
  status: string;
  paymentMethod: string | null;
  paymentNote: string | null;
  requestedAt: string;
  resolvedAt: string | null;
};

function paymentMethodLabel(m: string | null) {
  if (m === "upi") return "UPI";
  if (m === "bank_transfer") return "Bank Transfer";
  if (m === "cash") return "Cash";
  return m ?? "—";
}

export default function AdminPayoutsPage() {
  const { t } = useLanguage();
  const { data: payoutsEnv, isLoading: payoutsLoading } = useAdminListPayouts();
  const { data: usersEnv } = useAdminListUsers();
  const updatePayout = useAdminUpdatePayout();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const payouts: PayoutEntry[] = (payoutsEnv?.payouts ?? []) as PayoutEntry[];
  const allUsers = usersEnv?.users ?? [];
  const bhakts = allUsers.filter((u) => u.approved && !u.isAdmin);

  const pendingPayouts = payouts.filter((p) => p.status === "pending");
  const resolvedPayouts = payouts.filter((p) => p.status !== "pending");

  const totalPending = pendingPayouts.reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const totalEarnings = bhakts.reduce((s, u) => s + (u.totalEarnings ?? 0), 0);

  // Existing pending payout dialog
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean; payoutId: string; amount: number; devoteeName: string; upiId: string | null;
  }>({ open: false, payoutId: "", amount: 0, devoteeName: "", upiId: null });
  const [selectedMethod, setSelectedMethod] = useState<"upi" | "bank_transfer" | "cash" | "">("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Admin-initiated pay dialog
  const [initiateDialog, setInitiateDialog] = useState<{
    open: boolean;
    userId: string;
    devoteeName: string;
    upiId: string | null;
    available: number;
  }>({ open: false, userId: "", devoteeName: "", upiId: null, available: 0 });
  const [initiateAmount, setInitiateAmount] = useState("");
  const [initiateMethod, setInitiateMethod] = useState<"upi" | "bank_transfer" | "cash" | "">("");
  const [initiateNote, setInitiateNote] = useState("");
  const [initiateLoading, setInitiateLoading] = useState(false);

  const [clearPayoutsOpen, setClearPayoutsOpen] = useState(false);
  const [clearPayoutsLoading, setClearPayoutsLoading] = useState(false);
  const [restoreEarningsLoading, setRestoreEarningsLoading] = useState(false);

  const handleRestoreEarnings = async () => {
    setRestoreEarningsLoading(true);
    try {
      const res = await fetch("/api/admin/restore-earnings", { method: "POST", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        toast({ title: "Earnings Restored!", description: data.message });
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      } else {
        toast({ title: "Error", description: "Failed to restore earnings", variant: "destructive" });
      }
    } finally { setRestoreEarningsLoading(false); }
  };

  const handleClearPayouts = async () => {
    setClearPayoutsLoading(true);
    try {
      const res = await fetch("/api/admin/clear-payouts", { method: "POST", credentials: "include" });
      if (res.ok) {
        toast({ title: "Payout history cleared", description: "All payout records have been deleted." });
        setClearPayoutsOpen(false);
        queryClient.invalidateQueries({ queryKey: getAdminListPayoutsQueryKey() });
      } else {
        toast({ title: "Error", description: "Failed to clear payouts", variant: "destructive" });
      }
    } finally { setClearPayoutsLoading(false); }
  };

  const openPaymentDialog = (p: PayoutEntry) => {
    setSelectedMethod("");
    setPaymentNote("");
    setPaymentDialog({ open: true, payoutId: p.id, amount: p.amount, devoteeName: p.devoteeName, upiId: p.upiId });
  };

  const confirmPayment = async () => {
    if (!selectedMethod) { toast({ title: t("payout.method-choose"), variant: "destructive" }); return; }
    setPaymentLoading(true);
    try {
      const res = await fetch(`/api/admin/payouts/${paymentDialog.payoutId}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid", paymentMethod: selectedMethod, paymentNote: paymentNote || null }),
      });
      if (res.ok) {
        toast({ title: t("payout.success-title"), description: `${paymentDialog.devoteeName} ${t("payout.success-desc")} ₹${paymentDialog.amount.toFixed(2)}` });
        setPaymentDialog((d) => ({ ...d, open: false }));
        queryClient.invalidateQueries({ queryKey: getAdminListPayoutsQueryKey() });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: t("common.error"), description: e.error || "Failed", variant: "destructive" });
      }
    } finally { setPaymentLoading(false); }
  };

  const handleReject = (payoutId: string, devoteeName: string) => {
    updatePayout.mutate({ payoutId, data: { status: "rejected" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListPayoutsQueryKey() });
        toast({ title: t("payout.rejected-toast-title"), description: `${devoteeName}` });
      },
    });
  };

  const openInitiateDialog = (u: { userId: string; name: string; upiId?: string | null; available: number }) => {
    setInitiateAmount(u.available.toFixed(2));
    setInitiateMethod("");
    setInitiateNote("");
    setInitiateDialog({ open: true, userId: u.userId, devoteeName: u.name, upiId: u.upiId ?? null, available: u.available });
  };

  const confirmInitiatePay = async () => {
    if (!initiateMethod) { toast({ title: t("payout.method-choose"), variant: "destructive" }); return; }
    const amt = parseFloat(initiateAmount);
    if (isNaN(amt) || amt <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    if (amt > initiateDialog.available) { toast({ title: "Amount exceeds available balance", variant: "destructive" }); return; }
    setInitiateLoading(true);
    try {
      const res = await fetch("/api/admin/payouts/initiate", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: initiateDialog.userId,
          amount: amt,
          paymentMethod: initiateMethod,
          paymentNote: initiateNote || null,
        }),
      });
      if (res.ok) {
        toast({ title: "Payment Sent!", description: `₹${amt.toFixed(2)} paid to ${initiateDialog.devoteeName}` });
        setInitiateDialog((d) => ({ ...d, open: false }));
        queryClient.invalidateQueries({ queryKey: getAdminListPayoutsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: t("common.error"), description: e.error || "Failed", variant: "destructive" });
      }
    } finally { setInitiateLoading(false); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("payout.title")}</h1>
        <p className="text-foreground mt-1">{t("payout.subtitle")}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-orange-500" />
              <p className="text-xs text-foreground">{t("payout.pending-requests")}</p>
            </div>
            <p className="text-2xl font-bold text-orange-500">{pendingPayouts.length}</p>
            <p className="text-xs text-foreground mt-0.5">₹{totalPending.toFixed(2)} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <p className="text-xs text-foreground">{t("payout.total-paid")}</p>
            </div>
            <p className="text-2xl font-bold text-green-600">₹{totalPaid.toFixed(2)}</p>
            <p className="text-xs text-foreground mt-0.5">{payouts.filter(p => p.status === "paid").length} {t("payout.transactions")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <IndianRupee className="w-4 h-4 text-primary" />
              <p className="text-xs text-foreground">{t("payout.total-earnings")}</p>
            </div>
            <p className="text-2xl font-bold">₹{totalEarnings.toFixed(2)}</p>
            <p className="text-xs text-foreground mt-0.5">{t("payout.all-bhakts")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-foreground">{t("payout.active-bhakts")}</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{bhakts.length}</p>
            <p className="text-xs text-foreground mt-0.5">{t("payout.approved-bhakts")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pending" className="relative">
            {t("payout.tab-pending")}
            {pendingPayouts.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                {pendingPayouts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="bhakts">{t("payout.tab-bhakts")}</TabsTrigger>
          <TabsTrigger value="history">{t("payout.tab-history")}</TabsTrigger>
        </TabsList>

        {/* ── Pending Requests ── */}
        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Coins className="w-4 h-4" /> {t("payout.pending-title")}</CardTitle>
              <CardDescription>{t("payout.pending-desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payout.col-date")}</TableHead>
                    <TableHead>{t("payout.col-bhakt")}</TableHead>
                    <TableHead>{t("payout.col-upi")}</TableHead>
                    <TableHead>{t("payout.col-amount")}</TableHead>
                    <TableHead className="text-right">{t("payout.col-actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm text-foreground">
                        {new Date(p.requestedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-semibold">{p.devoteeName}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground">{p.upiId || "—"}</TableCell>
                      <TableCell className="font-bold text-lg">₹{Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openPaymentDialog(p)}>
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> {t("payout.pay")}
                          </Button>
                          <Button size="sm" variant="outline" className="border-red-400 text-red-600 hover:bg-red-50" onClick={() => handleReject(p.id, p.devoteeName)}>
                            <XCircle className="w-3.5 h-3.5 mr-1" /> {t("payout.reject")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!payoutsLoading && pendingPayouts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                        <p>{t("payout.no-pending")}</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bhakt Earnings Overview ── */}
        <TabsContent value="bhakts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><IndianRupee className="w-4 h-4" /> {t("payout.bhakts-title")}</CardTitle>
              <CardDescription>{t("payout.bhakts-desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payout.col-bhakt")}</TableHead>
                    <TableHead>{t("payout.col-city")}</TableHead>
                    <TableHead>{t("payout.col-total-jaap")}</TableHead>
                    <TableHead>{t("payout.col-total-earning")}</TableHead>
                    <TableHead>{t("payout.col-pending")}</TableHead>
                    <TableHead>{t("payout.col-available")}</TableHead>
                    <TableHead>UPI</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bhakts
                    .slice()
                    .sort((a, b) => (b.totalEarnings ?? 0) - (a.totalEarnings ?? 0))
                    .map((u) => {
                      const userPending = pendingPayouts
                        .filter((p) => p.userId === u.userId)
                        .reduce((s, p) => s + Number(p.amount), 0);
                      const available = (u.totalEarnings ?? 0) - userPending;
                      const upiId = (u as any).upiId as string | null ?? null;
                      return (
                        <TableRow key={u.userId}>
                          <TableCell>
                            <div className="font-semibold text-sm">{u.name}</div>
                            <div className="text-xs text-foreground">{u.gotra || ""}</div>
                          </TableCell>
                          <TableCell className="text-sm text-foreground">{u.city || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{(u.totalJaap ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="font-semibold">₹{(u.totalEarnings ?? 0).toFixed(2)}</TableCell>
                          <TableCell>
                            {userPending > 0
                              ? <span className="text-orange-500 font-medium">₹{userPending.toFixed(2)}</span>
                              : <span className="text-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            <span className={available > 0 ? "text-green-600 font-medium" : "text-foreground text-xs"}>
                              {available > 0 ? `₹${available.toFixed(2)}` : "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {upiId
                              ? <span className="font-mono text-xs text-foreground">{upiId}</span>
                              : <span className="text-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              disabled={available <= 0}
                              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
                              onClick={() => openInitiateDialog({ userId: u.userId, name: u.name, upiId, available })}
                            >
                              <Send className="w-3.5 h-3.5 mr-1" /> Pay
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  {bhakts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-foreground">
                        {t("payout.no-bhakts")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{t("payout.history-title")}</CardTitle>
                <CardDescription>{t("payout.history-desc")}</CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                  onClick={handleRestoreEarnings}
                  disabled={restoreEarningsLoading}
                  title="Recalculate each bhakt's earnings from their jaap records"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${restoreEarningsLoading ? "animate-spin" : ""}`} />
                  {restoreEarningsLoading ? "Restoring..." : "Restore Earnings"}
                </Button>
                {resolvedPayouts.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setClearPayoutsOpen(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payout.col-date")}</TableHead>
                    <TableHead>{t("payout.col-bhakt")}</TableHead>
                    <TableHead>{t("payout.col-method")}</TableHead>
                    <TableHead>{t("payout.col-amount")}</TableHead>
                    <TableHead>{t("payout.col-status")}</TableHead>
                    <TableHead>{t("payout.col-note")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedPayouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-foreground">
                        {p.resolvedAt ? new Date(p.resolvedAt).toLocaleDateString() : new Date(p.requestedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{p.devoteeName}</TableCell>
                      <TableCell>
                        {p.paymentMethod
                          ? <Badge variant="outline" className="text-xs">{paymentMethodLabel(p.paymentMethod)}</Badge>
                          : <span className="text-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="font-bold">₹{Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "paid" ? "default" : "destructive"}>
                          {p.status === "paid" ? t("payout.paid-status") : t("payout.rejected-status")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-foreground max-w-[140px] truncate">
                        {(p as any).paymentNote || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {resolvedPayouts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-foreground">
                        {t("payout.no-history")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Clear Payout History Confirmation */}
      <Dialog open={clearPayoutsOpen} onOpenChange={setClearPayoutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Clear All Payout History?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            This will permanently delete all <strong>{resolvedPayouts.length}</strong> payout record{resolvedPayouts.length !== 1 ? "s" : ""} (₹{resolvedPayouts.reduce((s, p) => s + Number(p.amount), 0).toFixed(2)} total). This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearPayoutsOpen(false)} disabled={clearPayoutsLoading}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearPayouts} disabled={clearPayoutsLoading}>
              <Trash2 className="w-4 h-4 mr-1" />
              {clearPayoutsLoading ? "Clearing..." : "Yes, Clear All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment confirmation dialog (for pending requests) */}
      <Dialog open={paymentDialog.open} onOpenChange={(o) => setPaymentDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payout.confirm-title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted rounded-lg p-4 space-y-1">
              <div className="flex justify-between">
                <span className="text-foreground text-sm">{t("payout.bhakt-label")}</span>
                <span className="font-semibold">{paymentDialog.devoteeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground text-sm">{t("payout.amount-label")}</span>
                <span className="font-bold text-lg text-primary">₹{paymentDialog.amount.toFixed(2)}</span>
              </div>
              {paymentDialog.upiId && (
                <div className="flex justify-between">
                  <span className="text-foreground text-sm">{t("payout.col-upi")}</span>
                  <span className="font-mono text-xs">{paymentDialog.upiId}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("payout.method-label")}</Label>
              <Select value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("payout.method-placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upi"><div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> UPI</div></SelectItem>
                  <SelectItem value="bank_transfer"><div className="flex items-center gap-2"><Banknote className="w-3.5 h-3.5" /> Bank Transfer</div></SelectItem>
                  <SelectItem value="cash"><div className="flex items-center gap-2"><HandCoins className="w-3.5 h-3.5" /> Cash</div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("payout.note-label")}</Label>
              <Input placeholder={t("payout.note-placeholder")} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog((d) => ({ ...d, open: false }))}>{t("payout.cancel")}</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={confirmPayment} disabled={paymentLoading || !selectedMethod}>
              <CheckCircle className="w-4 h-4 mr-1" />
              {paymentLoading ? t("payout.processing") : t("payout.confirm-btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin-initiated payment dialog */}
      <Dialog open={initiateDialog.open} onOpenChange={(o) => setInitiateDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-green-600" /> Direct Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Bhakt info summary */}
            <div className="bg-muted rounded-lg p-4 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-foreground text-sm">Bhakt</span>
                <span className="font-semibold">{initiateDialog.devoteeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-foreground text-sm">Available</span>
                <span className="font-semibold text-green-600">₹{initiateDialog.available.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground text-sm">UPI ID</span>
                {initiateDialog.upiId
                  ? <span className="font-mono text-xs bg-background border rounded px-2 py-0.5">{initiateDialog.upiId}</span>
                  : <span className="text-xs text-foreground italic">Not set</span>}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                max={initiateDialog.available}
                value={initiateAmount}
                onChange={(e) => setInitiateAmount(e.target.value)}
              />
              <p className="text-xs text-foreground">Max: ₹{initiateDialog.available.toFixed(2)}</p>
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label>{t("payout.method-label")}</Label>
              <Select value={initiateMethod} onValueChange={(v) => setInitiateMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("payout.method-placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upi"><div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> UPI</div></SelectItem>
                  <SelectItem value="bank_transfer"><div className="flex items-center gap-2"><Banknote className="w-3.5 h-3.5" /> Bank Transfer</div></SelectItem>
                  <SelectItem value="cash"><div className="flex items-center gap-2"><HandCoins className="w-3.5 h-3.5" /> Cash</div></SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label>{t("payout.note-label")}</Label>
              <Input placeholder={t("payout.note-placeholder")} value={initiateNote} onChange={(e) => setInitiateNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitiateDialog((d) => ({ ...d, open: false }))}>{t("payout.cancel")}</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={confirmInitiatePay} disabled={initiateLoading || !initiateMethod}>
              <Send className="w-4 h-4 mr-1" />
              {initiateLoading ? "Sending..." : "Send Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
