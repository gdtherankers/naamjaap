import React, { useState, useEffect, useCallback } from "react";
import { 
  useAdminStats, 
  useAdminListUsers, 
  useAdminSetApproval, 
  getAdminListUsersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Coins, TrendingUp, BellRing, Plus, Pencil, Trash2, Music, Target, ChevronDown, ChevronRight, FileText, Globe, Lock, User2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language-context";

type Mantra = { id: string; scriptText: string; displayName: string; isDefault: boolean; createdAt: string };
type Yajamana = { id: string; name: string; gotra: string; fatherName: string | null; husbandName: string | null; niwasStan: string; status: "jiwit" | "divangat"; relation: string; createdAt: string };
type PatronSankalp = {
  id: string; yajamanaId: string; mantraId: string; goalCount: number; budgetRs: number | null;
  ratePerJaap: number;
  purpose: string; deadline: string | null; status: "active" | "paused" | "completed";
  visibility: "public" | "private"; participants: string[];
  createdAt: string; accumulated: number;
  mantra: Mantra | null; yajamana: Yajamana | null;
};
type BhaktProfile = {
  profile: {
    userId: string; name: string; gotra: string; city: string; state: string;
    email: string | null; upiId: string | null; approved: boolean; isAdmin: boolean;
    suspiciousFlags: number; createdAt: string; totalJaap: number; totalEarnings: number; streakDays: number;
  };
  recentDays: { date: string; count: number; earnings: number; suspicious: boolean }[];
  sankalpContributions: { sankalpId: string; purpose: string; yajamanaName: string; totalJaaps: number; earnings: number }[];
  payouts: { id: string; amount: number; status: string; paymentMethod: string | null; requestedAt: string; resolvedAt: string | null }[];
};

export default function AdminPage() {
  const { t, language } = useLanguage();
  const { data: stats } = useAdminStats();
  const { data: usersEnv } = useAdminListUsers();
  const setApproval = useAdminSetApproval();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allUsers = usersEnv?.users || [];
  const pendingUsers = allUsers.filter(u => !u.approved && !u.isAdmin);
  const users = [...pendingUsers, ...allUsers.filter(u => u.approved || u.isAdmin)];
  const approvedBhakts = allUsers.filter(u => u.approved && !u.isAdmin);

  // ── Settings state ───────────────────────────────────────────────────────
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [searchEngineIndexing, setSearchEngineIndexing] = useState(false);
  const [savingIndexing, setSavingIndexing] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings", { credentials: "include" });
    if (res.ok) {
      const d = await res.json();
      setWhatsappNumber(d.whatsappNumber ?? "");
      setWhatsappInput(d.whatsappNumber ?? "");
      setSearchEngineIndexing(d.searchEngineIndexing ?? false);
    }
  }, []);
  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappNumber: whatsappInput }) });
      if (res.ok) { const d = await res.json(); setWhatsappNumber(d.whatsappNumber); setWhatsappInput(d.whatsappNumber); toast({ title: language === "hi" ? "सेटिंग्स सेव हो गईं" : "Settings saved" }); }
      else { const e = await res.json().catch(() => ({})); toast({ title: t("common.error"), description: e.error || "Failed", variant: "destructive" }); }
    } finally { setSavingSettings(false); }
  };

  const toggleIndexing = async (val: boolean) => {
    setSavingIndexing(true);
    try {
      const res = await fetch("/api/admin/settings", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ searchEngineIndexing: val }) });
      if (res.ok) { const d = await res.json(); setSearchEngineIndexing(d.searchEngineIndexing); toast({ title: language === "hi" ? "सेटिंग सेव हो गई" : "Setting saved" }); }
      else { toast({ title: t("common.error"), variant: "destructive" }); }
    } finally { setSavingIndexing(false); }
  };

  // ── Mantras state ────────────────────────────────────────────────────────
  const [mantras, setMantras] = useState<Mantra[]>([]);
  const [mantraDialog, setMantraDialog] = useState(false);
  const [editingMantra, setEditingMantra] = useState<Mantra | null>(null);
  const [mantraForm, setMantraForm] = useState({ scriptText: "", displayName: "", isDefault: false });

  const fetchMantras = useCallback(async () => {
    const res = await fetch("/api/admin/mantras", { credentials: "include" });
    if (res.ok) { const d = await res.json(); setMantras(d.mantras ?? []); }
  }, []);
  useEffect(() => { fetchMantras(); }, [fetchMantras]);

  const openMantraAdd = () => { setEditingMantra(null); setMantraForm({ scriptText: "", displayName: "", isDefault: false }); setMantraDialog(true); };
  const openMantraEdit = (m: Mantra) => { setEditingMantra(m); setMantraForm({ scriptText: m.scriptText, displayName: m.displayName, isDefault: m.isDefault }); setMantraDialog(true); };

  const saveMantra = async () => {
    if (!mantraForm.scriptText.trim()) return;
    const url = editingMantra ? `/api/admin/mantras/${editingMantra.id}` : "/api/admin/mantras";
    const method = editingMantra ? "PUT" : "POST";
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mantraForm) });
    if (res.ok) { toast({ title: editingMantra ? t("admin.mantra-form.updated") : t("admin.mantra-form.added") }); setMantraDialog(false); fetchMantras(); }
    else { const e = await res.json().catch(() => ({})); toast({ title: t("common.error"), description: e.error || "Failed", variant: "destructive" }); }
  };

  const deleteMantra = async (id: string) => {
    if (!confirm(t("admin.mantra-form.cannot-delete-desc"))) return;
    const res = await fetch(`/api/admin/mantras/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: t("admin.mantra-form.deleted") }); fetchMantras(); }
    else { toast({ title: t("admin.mantra-form.cannot-delete"), description: t("admin.mantra-form.cannot-delete-desc"), variant: "destructive" }); }
  };

  // ── Yajamanas state ──────────────────────────────────────────────────────
  const [yajamanas, setYajamanas] = useState<Yajamana[]>([]);
  const [yajamanaDialog, setYajamanaDialog] = useState(false);
  const [editingYajamana, setEditingYajamana] = useState<Yajamana | null>(null);
  const [yajamanaForm, setYajamanaForm] = useState({ name: "", gotra: "", fatherName: "", husbandName: "", niwasStan: "", status: "jiwit" as "jiwit"|"divangat", relation: "self" });

  const fetchYajamanas = useCallback(async () => {
    const res = await fetch("/api/admin/yajamanas", { credentials: "include" });
    if (res.ok) { const d = await res.json(); setYajamanas(d.yajamanas ?? []); }
  }, []);
  useEffect(() => { fetchYajamanas(); }, [fetchYajamanas]);

  const openYajamanaAdd = () => { setEditingYajamana(null); setYajamanaForm({ name: "", gotra: "", fatherName: "", husbandName: "", niwasStan: "", status: "jiwit", relation: "self" }); setYajamanaDialog(true); };
  const openYajamanaEdit = (y: Yajamana) => { setEditingYajamana(y); setYajamanaForm({ name: y.name, gotra: y.gotra, fatherName: y.fatherName ?? "", husbandName: y.husbandName ?? "", niwasStan: y.niwasStan, status: y.status as "jiwit"|"divangat", relation: y.relation }); setYajamanaDialog(true); };

  const saveYajamana = async () => {
    if (!yajamanaForm.name.trim() || !yajamanaForm.gotra.trim()) return;
    const url = editingYajamana ? `/api/admin/yajamanas/${editingYajamana.id}` : "/api/admin/yajamanas";
    const method = editingYajamana ? "PUT" : "POST";
    const body = { ...yajamanaForm, fatherName: yajamanaForm.fatherName || null, husbandName: yajamanaForm.husbandName || null };
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { toast({ title: editingYajamana ? t("admin.yajamana-form.updated") : t("admin.yajamana-form.added") }); setYajamanaDialog(false); fetchYajamanas(); }
    else { const e = await res.json().catch(() => ({})); toast({ title: t("common.error"), description: e.error || "Failed", variant: "destructive" }); }
  };

  const deleteYajamana = async (id: string) => {
    if (!confirm(t("admin.yajamana-form.cannot-delete-desc"))) return;
    const res = await fetch(`/api/admin/yajamanas/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: t("admin.yajamana-form.deleted") }); fetchYajamanas(); }
    else { toast({ title: t("admin.yajamana-form.cannot-delete"), description: t("admin.yajamana-form.cannot-delete-desc"), variant: "destructive" }); }
  };

  // ── Patron Sankalps state ────────────────────────────────────────────────
  const [patronSankalps, setPatronSankalps] = useState<PatronSankalp[]>([]);
  const [sankalpDialog, setSankalpDialog] = useState(false);
  const [editingSankalp, setEditingSankalp] = useState<PatronSankalp | null>(null);
  const [sankalpForm, setSankalpForm] = useState({
    yajamanaId: "", mantraId: "", goalCount: "1008000", budgetRs: "", ratePerJaap: "0.01", purpose: "", deadline: "",
    status: "active" as "active"|"paused"|"completed",
    visibility: "public" as "public"|"private",
    participantUserIds: [] as string[],
  });
  const [expandedSankalpId, setExpandedSankalpId] = useState<string | null>(null);
  const [contributors, setContributors] = useState<Record<string, any[]>>({});
  const [loadingContributors, setLoadingContributors] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportSankalpId, setReportSankalpId] = useState<string | null>(null);
  const [deleteSankalpConfirm, setDeleteSankalpConfirm] = useState<PatronSankalp | null>(null);
  const [deletingSankalp, setDeletingSankalp] = useState(false);

  const fetchPatronSankalps = useCallback(async () => {
    const res = await fetch("/api/admin/patron-sankalps", { credentials: "include" });
    if (res.ok) { const d = await res.json(); setPatronSankalps(d.patronSankalps ?? []); }
  }, []);
  useEffect(() => { 
    fetchPatronSankalps();
    const interval = setInterval(fetchPatronSankalps, 3000);
    return () => clearInterval(interval);
  }, [fetchPatronSankalps]);

  const openSankalpAdd = () => {
    setEditingSankalp(null);
    setSankalpForm({ yajamanaId: yajamanas[0]?.id ?? "", mantraId: mantras[0]?.id ?? "", goalCount: "1008000", budgetRs: "10080", ratePerJaap: "0.01", purpose: "", deadline: "", status: "active", visibility: "public", participantUserIds: [] });
    setSankalpDialog(true);
  };
  const openSankalpEdit = (s: PatronSankalp) => {
    setEditingSankalp(s);
    setSankalpForm({ yajamanaId: s.yajamanaId, mantraId: s.mantraId, goalCount: String(s.goalCount), budgetRs: s.budgetRs != null ? String(s.budgetRs) : "", ratePerJaap: String(s.ratePerJaap ?? 0.01), purpose: s.purpose, deadline: s.deadline ?? "", status: s.status, visibility: s.visibility, participantUserIds: s.participants ?? [] });
    setSankalpDialog(true);
  };

  const toggleSankalpExpand = async (sankalpId: string) => {
    if (expandedSankalpId === sankalpId) { setExpandedSankalpId(null); return; }
    setExpandedSankalpId(sankalpId);
    if (!contributors[sankalpId]) {
      setLoadingContributors(sankalpId);
      try {
        const res = await fetch(`/api/admin/patron-sankalps/${sankalpId}/contributors`, { credentials: "include" });
        if (res.ok) { const data = await res.json(); setContributors(prev => ({ ...prev, [sankalpId]: data.contributors ?? [] })); }
      } finally { setLoadingContributors(null); }
    }
  };

  const openReport = async (sankalpId: string) => {
    setReportSankalpId(sankalpId);
    if (!contributors[sankalpId]) {
      setLoadingContributors(sankalpId);
      try {
        const res = await fetch(`/api/admin/patron-sankalps/${sankalpId}/contributors`, { credentials: "include" });
        if (res.ok) { const data = await res.json(); setContributors(prev => ({ ...prev, [sankalpId]: data.contributors ?? [] })); }
      } finally { setLoadingContributors(null); }
    }
    setReportDialogOpen(true);
  };

  const deleteSankalp = async (s: PatronSankalp) => {
    setDeletingSankalp(true);
    try {
      const res = await fetch(`/api/admin/patron-sankalps/${s.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast({ title: "Sankalp delete ho gaya" });
        setDeleteSankalpConfirm(null);
        fetchPatronSankalps();
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Delete nahi ho saka", description: d.error ?? "Kuch gadbad ho gayi", variant: "destructive" });
      }
    } finally { setDeletingSankalp(false); }
  };

  const saveSankalp = async () => {
    if (!sankalpForm.yajamanaId || !sankalpForm.mantraId || !sankalpForm.purpose.trim()) return;
    const url = editingSankalp ? `/api/admin/patron-sankalps/${editingSankalp.id}` : "/api/admin/patron-sankalps";
    const method = editingSankalp ? "PUT" : "POST";
    const body = {
      ...sankalpForm,
      goalCount: parseInt(sankalpForm.goalCount, 10) || 1008000,
      budgetRs: sankalpForm.budgetRs ? parseFloat(sankalpForm.budgetRs) : null,
      ratePerJaap: parseFloat(sankalpForm.ratePerJaap) || 0.01,
      deadline: sankalpForm.deadline || null,
      participantUserIds: sankalpForm.visibility === "private" ? sankalpForm.participantUserIds : [],
    };
    const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { toast({ title: editingSankalp ? t("admin.sankalp-form.updated") : t("admin.sankalp-form.created") }); setSankalpDialog(false); fetchPatronSankalps(); }
    else { const e = await res.json().catch(() => ({})); toast({ title: t("common.error"), description: e.error || "Failed", variant: "destructive" }); }
  };

  const toggleParticipant = (userId: string) => {
    setSankalpForm(f => ({
      ...f,
      participantUserIds: f.participantUserIds.includes(userId)
        ? f.participantUserIds.filter(id => id !== userId)
        : [...f.participantUserIds, userId],
    }));
  };

  const handleApprovalToggle = (userId: string, currentStatus: boolean) => {
    setApproval.mutate({ userId, data: { approved: !currentStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        toast({ title: t("admin.devotees.updated"), description: !currentStatus ? t("admin.devotees.approved-desc") : t("admin.devotees.unapproved-desc") });
      }
    });
  };

  // ── Bhakt Profile Dialog ─────────────────────────────────────────────────
  const [bhaktProfileDialog, setBhaktProfileDialog] = useState(false);
  const [bhaktProfile, setBhaktProfile] = useState<BhaktProfile | null>(null);
  const [bhaktProfileLoading, setBhaktProfileLoading] = useState(false);

  const openBhaktProfile = async (userId: string) => {
    setBhaktProfile(null);
    setBhaktProfileDialog(true);
    setBhaktProfileLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/profile`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); setBhaktProfile(d); }
    } finally { setBhaktProfileLoading(false); }
  };

  // ── Edit Devotee ─────────────────────────────────────────────────────────
  const [editDevoteeDialog, setEditDevoteeDialog] = useState(false);
  const [editDevoteeForm, setEditDevoteeForm] = useState({ userId: "", name: "", gotra: "", city: "", state: "", phone: "", upiId: "", newPassword: "" });
  const [editDevoteeLoading, setEditDevoteeLoading] = useState(false);
  const [editDevoteeError, setEditDevoteeError] = useState("");

  const openEditDevotee = (u: typeof users[0]) => {
    setEditDevoteeForm({ userId: u.userId, name: u.name, gotra: u.gotra || "", city: u.city, state: u.state, phone: (u as any).phone || "", upiId: u.upiId || "", newPassword: "" });
    setEditDevoteeError("");
    setEditDevoteeDialog(true);
  };

  const handleEditDevotee = async () => {
    setEditDevoteeError("");
    const { userId, name, gotra, city, state, phone, upiId, newPassword } = editDevoteeForm;
    if (!name.trim() || !gotra.trim() || !city.trim() || !state.trim()) { setEditDevoteeError("Naam, Gotra, Shahar aur Rajya required hain"); return; }
    if (newPassword && newPassword.length < 6) { setEditDevoteeError("Password kam se kam 6 characters ka hona chahiye"); return; }
    setEditDevoteeLoading(true);
    try {
      const body: Record<string, string> = { name, gotra, city, state, phone, upiId };
      if (newPassword) body.newPassword = newPassword;
      const res = await fetch(`/api/admin/users/${userId}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setEditDevoteeError(d.error || "Kuch galat hua"); return; }
      toast({ title: language === "hi" ? "जानकारी अपडेट हो गई" : "Details updated successfully" });
      setEditDevoteeDialog(false);
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    } finally { setEditDevoteeLoading(false); }
  };

  // ── Add Devotee ──────────────────────────────────────────────────────────
  const [addDevoteeDialog, setAddDevoteeDialog] = useState(false);
  const [addDevoteeForm, setAddDevoteeForm] = useState({ name: "", email: "", password: "", gotra: "", city: "", state: "" });
  const [addDevoteeLoading, setAddDevoteeLoading] = useState(false);
  const [addDevoteeError, setAddDevoteeError] = useState("");

  const handleAddDevotee = async () => {
    setAddDevoteeError("");
    const { name, email, password, gotra, city, state } = addDevoteeForm;
    if (!name.trim() || !email.trim() || !password.trim() || !gotra.trim() || !city.trim() || !state.trim()) {
      setAddDevoteeError("Sabhi fields required hain"); return;
    }
    setAddDevoteeLoading(true);
    try {
      const res = await fetch("/api/admin/users", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addDevoteeForm) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAddDevoteeError(d.error || "Kuch galat hua"); return; }
      toast({ title: language === "hi" ? "भक्त जोड़ दिया गया" : "Devotee added successfully" });
      setAddDevoteeDialog(false);
      setAddDevoteeForm({ name: "", email: "", password: "", gotra: "", city: "", state: "" });
      queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    } finally { setAddDevoteeLoading(false); }
  };

  // ── Delete Bhakt ─────────────────────────────────────────────────────────
  const [deleteBhaktConfirm, setDeleteBhaktConfirm] = useState<{ userId: string; name: string } | null>(null);
  const [deletingBhakt, setDeletingBhakt] = useState(false);

  const handleDeleteBhakt = async () => {
    if (!deleteBhaktConfirm) return;
    setDeletingBhakt(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteBhaktConfirm.userId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast({ title: language === "hi" ? "भक्त हटा दिया गया" : "Devotee deleted" });
        setDeleteBhaktConfirm(null);
        queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: t("common.error"), description: e.error || "Delete failed", variant: "destructive" });
      }
    } finally { setDeletingBhakt(false); }
  };

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleResetJaapData = async () => {
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-jaap-data", { method: "POST", credentials: "include" });
      if (res.ok) {
        toast({ title: t("admin.reset.success"), description: t("admin.reset.success-desc") });
        setResetConfirmOpen(false);
        queryClient.invalidateQueries();
      } else {
        toast({ title: t("common.error"), description: "Reset failed", variant: "destructive" });
      }
    } finally { setResetLoading(false); }
  };

  const paymentMethodLabel = (m: string | null) => {
    if (m === "upi") return "UPI";
    if (m === "bank_transfer") return "Bank Transfer";
    if (m === "cash") return "Cash";
    return null;
  };

  const RELATION_OPTIONS = [
    { value: "self", label: t("admin.yajamanas.col-relation") === "Relation" ? "Self" : "स्वयं (Self)" },
    { value: "mata", label: "माता जी" },
    { value: "pita", label: "पिता जी" },
    { value: "patni", label: "पत्नी जी" },
    { value: "putra", label: "पुत्र" },
    { value: "putri", label: "पुत्री" },
    { value: "custom", label: t("admin.yajamanas.col-relation") === "Relation" ? "Other" : "अन्य (Other)" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("admin.title")}</h1>
          <p className="text-foreground mt-1">{t("admin.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 mt-1" onClick={() => setResetConfirmOpen(true)}>
          {t("admin.reset-btn")}
        </Button>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-destructive">{t("admin.reset.title")}</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground">{t("admin.reset.body")}</p>
          <p className="text-sm font-semibold text-destructive">{t("admin.reset.warning")}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)} disabled={resetLoading}>{t("admin.reset.cancel")}</Button>
            <Button variant="destructive" onClick={handleResetJaapData} disabled={resetLoading}>{resetLoading ? t("admin.reset.loading") : t("admin.reset.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Devotee Dialog ── */}
      <Dialog open={editDevoteeDialog} onOpenChange={v => { if (!v) setEditDevoteeDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              {language === "hi" ? "भक्त की जानकारी बदलें" : "Edit Devotee Details"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>{language === "hi" ? "पूरा नाम *" : "Full Name *"}</Label>
              <Input value={editDevoteeForm.name} onChange={e => setEditDevoteeForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{language === "hi" ? "गोत्र *" : "Gotra *"}</Label>
              <Input value={editDevoteeForm.gotra} onChange={e => setEditDevoteeForm(f => ({ ...f, gotra: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{language === "hi" ? "शहर *" : "City *"}</Label>
                <Input value={editDevoteeForm.city} onChange={e => setEditDevoteeForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{language === "hi" ? "राज्य *" : "State *"}</Label>
                <Input value={editDevoteeForm.state} onChange={e => setEditDevoteeForm(f => ({ ...f, state: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{language === "hi" ? "फ़ोन" : "Phone"}</Label>
                <Input placeholder="9876543210" value={editDevoteeForm.phone} onChange={e => setEditDevoteeForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>UPI ID</Label>
                <Input placeholder="name@upi" value={editDevoteeForm.upiId} onChange={e => setEditDevoteeForm(f => ({ ...f, upiId: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-foreground text-xs">{language === "hi" ? "नया पासवर्ड (खाली छोड़ें अगर बदलना नहीं है)" : "New Password (leave blank to keep unchanged)"}</Label>
              <Input type="password" placeholder={language === "hi" ? "कम से कम 6 अक्षर" : "Min 6 characters"} value={editDevoteeForm.newPassword} onChange={e => setEditDevoteeForm(f => ({ ...f, newPassword: e.target.value }))} />
            </div>
            {editDevoteeError && <p className="text-xs text-destructive">{editDevoteeError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDevoteeDialog(false)} disabled={editDevoteeLoading}>
              {language === "hi" ? "रद्द करें" : "Cancel"}
            </Button>
            <Button onClick={handleEditDevotee} disabled={editDevoteeLoading}>
              {editDevoteeLoading ? "..." : (language === "hi" ? "सेव करें" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Devotee Dialog ── */}
      <Dialog open={addDevoteeDialog} onOpenChange={v => { if (!v) setAddDevoteeDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {language === "hi" ? "नया भक्त जोड़ें" : "Add New Devotee"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>{language === "hi" ? "पूरा नाम *" : "Full Name *"}</Label>
              <Input placeholder={language === "hi" ? "राजेश कुमार" : "Rajesh Kumar"} value={addDevoteeForm.name} onChange={e => setAddDevoteeForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{language === "hi" ? "गोत्र *" : "Gotra *"}</Label>
              <Input placeholder="कश्यप" value={addDevoteeForm.gotra} onChange={e => setAddDevoteeForm(f => ({ ...f, gotra: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>{language === "hi" ? "शहर *" : "City *"}</Label>
                <Input placeholder="Jind" value={addDevoteeForm.city} onChange={e => setAddDevoteeForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{language === "hi" ? "राज्य *" : "State *"}</Label>
                <Input placeholder="Haryana" value={addDevoteeForm.state} onChange={e => setAddDevoteeForm(f => ({ ...f, state: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" placeholder="bhakt@email.com" value={addDevoteeForm.email} onChange={e => setAddDevoteeForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" placeholder={language === "hi" ? "कम से कम 6 अक्षर" : "Min 6 characters"} value={addDevoteeForm.password} onChange={e => setAddDevoteeForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            {addDevoteeError && <p className="text-xs text-destructive">{addDevoteeError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddDevoteeDialog(false)} disabled={addDevoteeLoading}>
              {language === "hi" ? "रद्द करें" : "Cancel"}
            </Button>
            <Button onClick={handleAddDevotee} disabled={addDevoteeLoading}>
              {addDevoteeLoading ? "..." : (language === "hi" ? "जोड़ें" : "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Bhakt Confirm Dialog ── */}
      <Dialog open={!!deleteBhaktConfirm} onOpenChange={v => { if (!v) setDeleteBhaktConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              {language === "hi" ? "भक्त हटाएं?" : "Delete Devotee?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            {language === "hi"
              ? <>क्या आप <strong>{deleteBhaktConfirm?.name}</strong> को हटाना चाहते हैं? उनके सभी जाप रिकॉर्ड, कमाई और डेटा स्थायी रूप से हट जाएगा।</>
              : <>Are you sure you want to delete <strong>{deleteBhaktConfirm?.name}</strong>? All their jaap records, earnings and data will be permanently removed.</>}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteBhaktConfirm(null)} disabled={deletingBhakt}>
              {language === "hi" ? "रद्द करें" : "Cancel"}
            </Button>
            <Button variant="destructive" onClick={handleDeleteBhakt} disabled={deletingBhakt}>
              {deletingBhakt ? "..." : (language === "hi" ? "हाँ, हटाएं" : "Yes, Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pendingUsers.length > 0 && (
        <Card className="border-orange-300 bg-orange-50/60 dark:bg-orange-950/20">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-base text-orange-700 dark:text-orange-400">{pendingUsers.length} {t("admin.pending.title")}</CardTitle>
              <p className="text-sm text-orange-600/80 dark:text-orange-500/80">{t("admin.pending.desc")}</p>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-sm text-foreground">{t("admin.stats.total-users")}</p><div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div><p className="text-xs text-foreground">{t("admin.stats.approved")} {stats?.approvedUsers ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-foreground">{t("admin.stats.today-jaap")}</p><div className="text-2xl font-bold">{(stats?.todayJaap ?? 0).toLocaleString()}</div><p className="text-xs text-foreground">{t("admin.stats.active-today")} {stats?.activeBhaktsToday ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-foreground">{t("admin.stats.pending-payouts")}</p><div className="text-2xl font-bold">₹{(stats?.totalPayoutPending ?? 0).toFixed(2)}</div><p className="text-xs text-foreground">{t("admin.stats.total-jaap")} {(stats?.totalJaap ?? 0).toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-foreground">{t("admin.stats.paid-out")}</p><div className="text-2xl font-bold">₹{(stats?.totalPayoutPaid ?? 0).toFixed(2)}</div><p className="text-xs text-foreground">{t("admin.stats.total-jaap")} {(stats?.totalJaap ?? 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="devotees">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="devotees">{t("admin.tab.devotees")}</TabsTrigger>
          <TabsTrigger value="mantras">{t("admin.tab.mantras")}</TabsTrigger>
          <TabsTrigger value="yajamanas">{t("admin.tab.yajamanas")}</TabsTrigger>
          <TabsTrigger value="sankalps">{t("admin.tab.sankalps")}</TabsTrigger>
          <TabsTrigger value="settings">⚙️ {language === "hi" ? "सेटिंग्स" : "Settings"}</TabsTrigger>
        </TabsList>

        {/* ── Devotees Tab ── */}
        <TabsContent value="devotees" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("admin.devotees.title")}</CardTitle>
                <CardDescription>{t("admin.devotees.desc")}</CardDescription>
              </div>
              <Button size="sm" onClick={() => { setAddDevoteeForm({ name: "", email: "", password: "", gotra: "", city: "", state: "" }); setAddDevoteeError(""); setAddDevoteeDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                {language === "hi" ? "भक्त जोड़ें" : "Add Devotee"}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{language === "hi" ? "गोत्र" : "Gotra"}</TableHead>
                    <TableHead>{t("admin.devotees.col-city")}</TableHead>
                    <TableHead>{language === "hi" ? "फोन / UPI" : "Phone / UPI"}</TableHead>
                    <TableHead>{t("admin.devotees.col-jaap")}</TableHead>
                    <TableHead>{t("admin.devotees.col-income")}</TableHead>
                    <TableHead>{t("admin.devotees.col-approval")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.userId} className={!u.approved && !u.isAdmin ? "bg-orange-50/40 dark:bg-orange-950/10" : undefined}>
                      <TableCell className="font-medium">
                        <button className="text-left hover:underline" onClick={() => openBhaktProfile(u.userId)}>
                          <div className="flex items-center gap-2">
                            <User2 className="w-3.5 h-3.5 text-foreground" />
                            <span>{u.name}</span>
                            {u.isAdmin && <Badge variant="secondary">Admin</Badge>}
                            {!u.approved && !u.isAdmin && <Badge className="bg-orange-500 hover:bg-orange-600 text-white">Pending</Badge>}
                          </div>
                          {u.email && <div className="text-xs text-foreground mt-0.5">{u.email}</div>}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">{u.gotra || "—"}</TableCell>
                      <TableCell className="text-sm">{u.city}, {u.state}</TableCell>
                      <TableCell className="text-xs text-foreground">
                        {u.phone && <div>📞 {u.phone}</div>}
                        {u.upiId && <div>💳 {u.upiId}</div>}
                        {!u.phone && !u.upiId && "—"}
                      </TableCell>
                      <TableCell>{u.totalJaap.toLocaleString()}</TableCell>
                      <TableCell>₹{Number(u.totalEarnings).toFixed(2)}</TableCell>
                      <TableCell>
                        <Switch checked={u.approved} onCheckedChange={() => handleApprovalToggle(u.userId, u.approved)} disabled={u.isAdmin || setApproval.isPending} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!u.isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-foreground hover:text-foreground"
                              onClick={() => openEditDevotee(u)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {!u.isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteBhaktConfirm({ userId: u.userId, name: u.name })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Mantras Tab ── */}
        <TabsContent value="mantras" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Music className="w-4 h-4" /> {t("admin.mantras")}</CardTitle>
                <CardDescription>{t("admin.mantras.desc")}</CardDescription>
              </div>
              <Button size="sm" onClick={openMantraAdd}><Plus className="w-4 h-4 mr-1" /> {t("admin.add-mantra")}</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.mantras.col-script")}</TableHead>
                    <TableHead>{t("admin.mantras.col-display")}</TableHead>
                    <TableHead>{t("common.default")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mantras.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-serif text-lg font-bold">{m.scriptText}</TableCell>
                      <TableCell>{m.displayName}</TableCell>
                      <TableCell>{m.isDefault ? <Badge className="bg-amber-500">{t("common.default")}</Badge> : null}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openMantraEdit(m)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMantra(m.id)} disabled={m.isDefault}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {mantras.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-foreground py-8">{t("admin.mantras.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Yajamanas Tab ── */}
        <TabsContent value="yajamanas" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("admin.yajamanas")}</CardTitle>
                <CardDescription>{t("admin.yajamanas.desc")}</CardDescription>
              </div>
              <Button size="sm" onClick={openYajamanaAdd}><Plus className="w-4 h-4 mr-1" /> {t("admin.add-yajamana")}</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("admin.yajamanas.col-gotra")}</TableHead>
                    <TableHead>{t("admin.yajamanas.col-father")}</TableHead>
                    <TableHead>{t("admin.yajamanas.col-niwas")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("admin.yajamanas.col-relation")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yajamanas.map(y => (
                    <TableRow key={y.id}>
                      <TableCell className="font-medium">{y.name}</TableCell>
                      <TableCell>{y.gotra}</TableCell>
                      <TableCell className="text-sm">{y.fatherName || y.husbandName || "—"}</TableCell>
                      <TableCell className="text-sm">{y.niwasStan}</TableCell>
                      <TableCell><Badge variant={y.status === "divangat" ? "outline" : "secondary"}>{y.status === "jiwit" ? t("admin.yajamanas.living") : t("admin.yajamanas.divangat")}</Badge></TableCell>
                      <TableCell className="text-sm capitalize">{y.relation}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openYajamanaEdit(y)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteYajamana(y.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {yajamanas.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-foreground py-8">{t("admin.yajamanas.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Patron Sankalps Tab ── */}
        <TabsContent value="sankalps" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Target className="w-4 h-4" /> {t("admin.sankalps")}</CardTitle>
                <CardDescription>{t("admin.sankalps.desc")}</CardDescription>
              </div>
              <Button size="sm" onClick={openSankalpAdd} disabled={yajamanas.length === 0 || mantras.length === 0}>
                <Plus className="w-4 h-4 mr-1" /> {t("admin.add-sankalp")}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.yajamanas")}</TableHead>
                    <TableHead>{t("admin.mantras")}</TableHead>
                    <TableHead>{t("admin.dash.progress")}</TableHead>
                    <TableHead>{t("admin.sankalps.col-type")}</TableHead>
                    <TableHead>{t("admin.sankalps.col-budget")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patronSankalps.map(s => {
                    const pct = s.goalCount > 0 ? Math.min(100, (s.accumulated / s.goalCount) * 100) : 0;
                    const isExpanded = expandedSankalpId === s.id;
                    const sankalpContributors = contributors[s.id] ?? [];
                    return (
                      <React.Fragment key={s.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSankalpExpand(s.id)}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <div>
                                <div className="font-medium">{s.yajamana?.name ?? s.yajamanaId}</div>
                                <div className="text-xs text-foreground">{s.yajamana?.gotra}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-serif font-bold">{s.mantra?.scriptText ?? s.mantraId}</TableCell>
                          <TableCell>
                            <div className="text-xs mb-1">{s.accumulated.toLocaleString()} / {s.goalCount.toLocaleString()}</div>
                            <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </TableCell>
                          <TableCell>
                            {s.visibility === "private" ? (
                              <div className="flex flex-col gap-0.5">
                                <Badge variant="outline" className="gap-1 text-xs border-purple-400 text-purple-600 w-fit">
                                  <Lock className="w-3 h-3" /> Private
                                </Badge>
                                {(s.participants ?? []).length > 0 && (
                                  <div className="text-xs text-foreground mt-0.5">
                                    {(s.participants ?? []).map((uid: string) => {
                                      const u = users.find(u => u.userId === uid);
                                      return u?.name ?? uid;
                                    }).join(", ")}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-xs border-blue-400 text-blue-600">
                                <Globe className="w-3 h-3" /> Public
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>{s.budgetRs != null ? `₹${s.budgetRs}` : "—"}</div>
                            <div className="text-xs text-foreground">₹{s.ratePerJaap}/jaap</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.status === "active" ? "default" : s.status === "completed" ? "secondary" : "outline"}>{s.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" title={t("admin.sankalps.view-report")} onClick={() => openReport(s.id)}><FileText className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" title={t("admin.edit")} onClick={() => openSankalpEdit(s)}><Pencil className="w-4 h-4" /></Button>
                              {s.accumulated === 0 && (
                                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete Sankalp" onClick={() => setDeleteSankalpConfirm(s)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={7} className="p-4">
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm">{t("admin.sankalps.contributors")}</h4>
                                {loadingContributors === s.id ? (
                                  <p className="text-sm text-foreground">{t("common.loading")}</p>
                                ) : sankalpContributors.length > 0 ? (
                                  <Table className="text-sm">
                                    <TableHeader>
                                      <TableRow className="bg-background hover:bg-background">
                                        <TableHead>{t("admin.report.col-bhakt")}</TableHead>
                                        <TableHead className="text-right">{t("admin.devotees.col-jaap")}</TableHead>
                                        <TableHead className="text-right">{t("admin.devotees.col-income")} (₹)</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sankalpContributors.map((c: any) => (
                                        <TableRow key={c.userId}>
                                          <TableCell className="font-medium">{c.userName}</TableCell>
                                          <TableCell className="text-right font-mono">{c.totalJaaps.toLocaleString()}</TableCell>
                                          <TableCell className="text-right font-mono">₹{c.earnings.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                ) : (
                                  <p className="text-sm text-foreground">{t("admin.sankalps.no-contrib")}</p>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {patronSankalps.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-foreground py-8">{t("admin.sankalps.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Settings Tab ── */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                💬 {language === "hi" ? "WhatsApp नंबर" : "WhatsApp Number"}
              </CardTitle>
              <p className="text-sm text-foreground">
                {language === "hi"
                  ? "यह नंबर साइडबार में भक्तों को दिखेगा ताकि वे आपसे संपर्क कर सकें।"
                  : "This number will be shown in the sidebar so bhakts can contact you."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {whatsappNumber && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-sm">
                  <span>✅</span>
                  <span className="text-green-700 dark:text-green-400">
                    {language === "hi" ? "वर्तमान नंबर:" : "Current number:"} <strong>+91 {whatsappNumber}</strong>
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="wa-number">
                  {language === "hi" ? "नया नंबर दर्ज करें (10 अंक)" : "Enter new number (10 digits)"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="wa-number"
                    placeholder="8950889321"
                    value={whatsappInput}
                    onChange={e => setWhatsappInput(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    className="font-mono"
                  />
                  <Button onClick={saveSettings} disabled={savingSettings || !whatsappInput}>
                    {savingSettings ? "..." : (language === "hi" ? "सेव करें" : "Save")}
                  </Button>
                </div>
              </div>
              {whatsappNumber && (
                <a
                  href={`https://wa.me/91${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-green-600 hover:underline"
                >
                  🔗 {language === "hi" ? "WhatsApp लिंक देखें" : "Preview WhatsApp link"}
                </a>
              )}
            </CardContent>
          </Card>

          {/* Search Engine Indexing */}
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                🔍 {language === "hi" ? "सर्च इंजन इंडेक्सिंग" : "Search Engine Indexing"}
              </CardTitle>
              <p className="text-sm text-foreground">
                {language === "hi"
                  ? "यदि OFF है, तो Google/Bing आदि इस वेबसाइट को index नहीं करेंगे।"
                  : "When OFF, Google, Bing and other search engines won't index this website."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {language === "hi" ? "सर्च इंजन को दिखाएं" : "Allow search engines"}
                  </p>
                  <p className="text-xs text-foreground">
                    {searchEngineIndexing
                      ? (language === "hi" ? "✅ इंडेक्सिंग चालू है — Google इस साइट को दिखा सकता है" : "✅ Indexing ON — Google can show this site")
                      : (language === "hi" ? "🚫 इंडेक्सिंग बंद है — कोई भी सर्च इंजन इसे नहीं दिखाएगा" : "🚫 Indexing OFF — no search engine will show this site")}
                  </p>
                </div>
                <Switch
                  checked={searchEngineIndexing}
                  onCheckedChange={toggleIndexing}
                  disabled={savingIndexing}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Mantra Dialog ── */}
      <Dialog open={mantraDialog} onOpenChange={setMantraDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingMantra ? t("admin.edit-mantra") : t("admin.add-mantra")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("admin.mantra-form.script-label")}</Label>
              <Input placeholder="जय श्री श्याम" value={mantraForm.scriptText} onChange={e => setMantraForm(f => ({ ...f, scriptText: e.target.value }))} className="font-serif text-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.mantra-form.display-label")}</Label>
              <Input placeholder="Jai Shri Shyam" value={mantraForm.displayName} onChange={e => setMantraForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="isDefault" checked={mantraForm.isDefault} onCheckedChange={v => setMantraForm(f => ({ ...f, isDefault: v }))} />
              <Label htmlFor="isDefault">{t("admin.mantra-form.default-label")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMantraDialog(false)}>{t("admin.cancel")}</Button>
            <Button onClick={saveMantra}>{editingMantra ? t("admin.mantra-form.update-btn") : t("admin.add-mantra")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Yajamana Dialog ── */}
      <Dialog open={yajamanaDialog} onOpenChange={setYajamanaDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingYajamana ? t("admin.edit-yajamana") : t("admin.add-yajamana")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>{t("common.name")} *</Label>
                <Input placeholder="राजेश कुमार" value={yajamanaForm.name} onChange={e => setYajamanaForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.yajamana-form.gotra-label")}</Label>
                <Input placeholder="कश्यप" value={yajamanaForm.gotra} onChange={e => setYajamanaForm(f => ({ ...f, gotra: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.yajamana-form.relation-label")}</Label>
                <Select value={yajamanaForm.relation} onValueChange={v => setYajamanaForm(f => ({ ...f, relation: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RELATION_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.yajamana-form.father-label")}</Label>
                <Input placeholder="श्याम लाल" value={yajamanaForm.fatherName} onChange={e => setYajamanaForm(f => ({ ...f, fatherName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.yajamana-form.husband-label")}</Label>
                <Input placeholder={t("admin.yajamana-form.husband-placeholder")} value={yajamanaForm.husbandName} onChange={e => setYajamanaForm(f => ({ ...f, husbandName: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>{t("admin.yajamana-form.niwas-label")}</Label>
                <Input placeholder="जयपुर, राजस्थान" value={yajamanaForm.niwasStan} onChange={e => setYajamanaForm(f => ({ ...f, niwasStan: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>{t("common.status")}</Label>
                <Select value={yajamanaForm.status} onValueChange={v => setYajamanaForm(f => ({ ...f, status: v as "jiwit"|"divangat" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jiwit">{t("admin.yajamana-form.jiwit")}</SelectItem>
                    <SelectItem value="divangat">{t("admin.yajamana-form.divangat")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYajamanaDialog(false)}>{t("admin.cancel")}</Button>
            <Button onClick={saveYajamana}>{editingYajamana ? t("admin.yajamana-form.update-btn") : t("admin.add-yajamana")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Patron Sankalp Dialog ── */}
      <Dialog open={sankalpDialog} onOpenChange={setSankalpDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSankalp ? t("admin.edit-sankalp") : t("admin.add-sankalp")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t("admin.yajamanas")} *</Label>
              <Select value={sankalpForm.yajamanaId} onValueChange={v => setSankalpForm(f => ({ ...f, yajamanaId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("admin.sankalp-form.yajamana-placeholder")} /></SelectTrigger>
                <SelectContent>{yajamanas.map(y => <SelectItem key={y.id} value={y.id}>{y.name} ({y.gotra})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.mantras")} *</Label>
              <Select value={sankalpForm.mantraId} onValueChange={v => setSankalpForm(f => ({ ...f, mantraId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("admin.sankalp-form.mantra-placeholder")} /></SelectTrigger>
                <SelectContent>{mantras.map(m => <SelectItem key={m.id} value={m.id}>{m.scriptText} — {m.displayName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.sankalp-form.rate-label")} <span className="text-xs text-foreground">— {t("admin.sankalp-form.rate-desc")}</span></Label>
              <Input
                type="number"
                placeholder="0.01"
                step="0.001"
                min="0.001"
                value={sankalpForm.ratePerJaap}
                onChange={e => {
                  const rate = e.target.value;
                  const rateNum = parseFloat(rate);
                  const goalNum = parseInt(sankalpForm.goalCount, 10);
                  setSankalpForm(f => ({
                    ...f,
                    ratePerJaap: rate,
                    budgetRs: goalNum > 0 && rateNum > 0 ? String((goalNum * rateNum).toFixed(2)) : f.budgetRs,
                  }));
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("admin.sankalp-form.goal-label")}</Label>
                <Input type="number" placeholder="1008000" value={sankalpForm.goalCount} onChange={e => {
                  const gc = e.target.value;
                  const num = parseInt(gc, 10);
                  const rate = parseFloat(sankalpForm.ratePerJaap) || 0.01;
                  setSankalpForm(f => ({ ...f, goalCount: gc, budgetRs: num > 0 ? String((num * rate).toFixed(2)) : "" }));
                }} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.sankalp-form.budget-label")}</Label>
                <Input type="number" placeholder="10080" value={sankalpForm.budgetRs} onChange={e => {
                  const br = e.target.value;
                  const num = parseFloat(br);
                  const rate = parseFloat(sankalpForm.ratePerJaap) || 0.01;
                  setSankalpForm(f => ({ ...f, budgetRs: br, goalCount: num > 0 ? String(Math.round(num / rate)) : "" }));
                }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.sankalp-form.purpose-label")}</Label>
              <Input placeholder={t("admin.sankalp-form.purpose-placeholder")} value={sankalpForm.purpose} onChange={e => setSankalpForm(f => ({ ...f, purpose: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("admin.sankalp-form.deadline-label")}</Label>
                <Input type="date" value={sankalpForm.deadline} onChange={e => setSankalpForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.status")}</Label>
                <Select value={sankalpForm.status} onValueChange={v => setSankalpForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("admin.sankalp-form.status-active")}</SelectItem>
                    <SelectItem value="paused">{t("admin.sankalp-form.status-paused")}</SelectItem>
                    <SelectItem value="completed">{t("admin.sankalp-form.status-completed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <Label className="font-semibold">{t("admin.sankalp-form.type-label")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSankalpForm(f => ({ ...f, visibility: "public", participantUserIds: [] }))}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${sankalpForm.visibility === "public" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "border-muted-foreground/30 hover:bg-muted"}`}
                >
                  <Globe className="w-4 h-4" /> {t("admin.sankalp-form.public")}
                </button>
                <button
                  type="button"
                  onClick={() => setSankalpForm(f => ({ ...f, visibility: "private" }))}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${sankalpForm.visibility === "private" ? "border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "border-muted-foreground/30 hover:bg-muted"}`}
                >
                  <Lock className="w-4 h-4" /> {t("admin.sankalp-form.private")}
                </button>
              </div>

              {sankalpForm.visibility === "private" && (
                <div className="mt-2 space-y-1.5">
                  <Label className="text-xs text-foreground">{t("admin.sankalp-form.select-bhakts")}</Label>
                  {approvedBhakts.length === 0 ? (
                    <p className="text-xs text-foreground">{t("admin.sankalp-form.no-approved")}</p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1 border rounded p-2 bg-background">
                      {approvedBhakts.map(u => (
                        <label key={u.userId} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={sankalpForm.participantUserIds.includes(u.userId)}
                            onChange={() => toggleParticipant(u.userId)}
                            className="accent-purple-600"
                          />
                          <span className="text-sm">{u.name}</span>
                          <span className="text-xs text-foreground">{u.city}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {sankalpForm.participantUserIds.length > 0 && (
                    <p className="text-xs text-purple-600">{sankalpForm.participantUserIds.length} {t("admin.sankalp-form.bhakts-selected")}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSankalpDialog(false)}>{t("admin.cancel")}</Button>
            <Button onClick={saveSankalp}>{editingSankalp ? t("admin.sankalp-form.update-btn") : t("admin.sankalp-form.create-btn")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Sankalp Confirmation Dialog ── */}
      <Dialog open={!!deleteSankalpConfirm} onOpenChange={(o) => { if (!o) setDeleteSankalpConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Sankalp Delete Karein?
            </DialogTitle>
          </DialogHeader>
          {deleteSankalpConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-foreground">
                Yeh sankalp permanently delete ho jayega:
              </p>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                <div><span className="font-medium">Yajamana:</span> {deleteSankalpConfirm.yajamana?.name ?? deleteSankalpConfirm.yajamanaId}</div>
                <div><span className="font-medium">Mantra:</span> {deleteSankalpConfirm.mantra?.scriptText ?? deleteSankalpConfirm.mantraId}</div>
                <div><span className="font-medium">Uddeshya:</span> {deleteSankalpConfirm.purpose}</div>
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠ Yeh action undo nahi ho sakti.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSankalpConfirm(null)} disabled={deletingSankalp}>Raho Jaane Do</Button>
            <Button variant="destructive" onClick={() => deleteSankalpConfirm && deleteSankalp(deleteSankalpConfirm)} disabled={deletingSankalp}>
              <Trash2 className="w-4 h-4 mr-1" />
              {deletingSankalp ? "Delete ho raha hai..." : "Haan, Delete Karein"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Report Dialog ── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-96 overflow-y-auto">
          <DialogHeader><DialogTitle>{t("admin.report.title")}</DialogTitle></DialogHeader>
          {reportSankalpId && (
            <div className="space-y-4">
              {loadingContributors === reportSankalpId ? (
                <p className="text-sm text-foreground">{t("common.loading")}</p>
              ) : contributors[reportSankalpId]?.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.report.col-bhakt")}</TableHead>
                      <TableHead className="text-right">{t("admin.report.col-jaap")}</TableHead>
                      <TableHead className="text-right">{t("admin.report.col-amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contributors[reportSankalpId].map((c: any) => (
                      <TableRow key={c.userId}>
                        <TableCell>{c.userName}</TableCell>
                        <TableCell className="text-right font-mono">{c.totalJaaps.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">₹{c.earnings.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/30">
                      <TableCell>{t("admin.report.total")}</TableCell>
                      <TableCell className="text-right font-mono">{contributors[reportSankalpId].reduce((s: number, c: any) => s + c.totalJaaps, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">₹{contributors[reportSankalpId].reduce((s: number, c: any) => s + c.earnings, 0).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <p className="text-foreground text-center py-8">{t("admin.report.no-contrib")}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bhakt Profile Dialog ── */}
      <Dialog open={bhaktProfileDialog} onOpenChange={setBhaktProfileDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><User2 className="w-5 h-5" /> {t("admin.profile.title")}</DialogTitle>
          </DialogHeader>
          {bhaktProfileLoading ? (
            <div className="py-12 text-center text-foreground">{t("common.loading")}</div>
          ) : bhaktProfile ? (
            <div className="space-y-5">
              {/* Basic Info */}
              <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold font-serif border border-primary/20">
                  {bhaktProfile.profile.name[0] ?? "ॐ"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{bhaktProfile.profile.name}</h3>
                    {bhaktProfile.profile.isAdmin && <Badge variant="secondary">Admin</Badge>}
                    <Badge variant={bhaktProfile.profile.approved ? "default" : "secondary"}>{bhaktProfile.profile.approved ? t("admin.devotees.approved-desc").replace(".", "") : "Pending"}</Badge>
                    {bhaktProfile.profile.suspiciousFlags > 0 && <Badge variant="destructive">{bhaktProfile.profile.suspiciousFlags} flags</Badge>}
                  </div>
                  <p className="text-sm text-foreground">{bhaktProfile.profile.gotra} • {bhaktProfile.profile.city}, {bhaktProfile.profile.state}</p>
                  {bhaktProfile.profile.email && <p className="text-xs text-foreground">{bhaktProfile.profile.email}</p>}
                  {bhaktProfile.profile.upiId && <p className="text-xs text-foreground font-mono">UPI: {bhaktProfile.profile.upiId}</p>}
                  <p className="text-xs text-foreground mt-1">{t("admin.profile.joined")} {new Date(bhaktProfile.profile.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="p-3 text-center"><p className="text-xs text-foreground">{t("admin.profile.total-jaap")}</p><p className="text-xl font-bold">{bhaktProfile.profile.totalJaap.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><p className="text-xs text-foreground">{t("admin.profile.total-kamayi")}</p><p className="text-xl font-bold">₹{bhaktProfile.profile.totalEarnings.toFixed(2)}</p></CardContent></Card>
                <Card><CardContent className="p-3 text-center"><p className="text-xs text-foreground">{t("admin.profile.streak")}</p><p className="text-xl font-bold">{bhaktProfile.profile.streakDays} {t("admin.profile.days")}</p></CardContent></Card>
              </div>

              {/* Sankalp Contributions */}
              {bhaktProfile.sankalpContributions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">{t("admin.profile.sankalp-contrib")}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.profile.col-sankalp")}</TableHead>
                        <TableHead className="text-right">{t("admin.profile.col-jaap")}</TableHead>
                        <TableHead className="text-right">{t("admin.profile.col-kamayi")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bhaktProfile.sankalpContributions.map(c => (
                        <TableRow key={c.sankalpId}>
                          <TableCell>
                            <div className="font-medium text-sm">{c.purpose}</div>
                            <div className="text-xs text-foreground">{c.yajamanaName}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{c.totalJaaps.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">₹{c.earnings.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Recent Days */}
              {bhaktProfile.recentDays.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">{t("admin.profile.recent-days")}</h4>
                  <div className="max-h-40 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("admin.profile.col-date")}</TableHead>
                          <TableHead className="text-right">{t("admin.profile.col-jaap")}</TableHead>
                          <TableHead className="text-right">{t("admin.profile.col-kamayi")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bhaktProfile.recentDays.map(d => (
                          <TableRow key={d.date} className={d.suspicious ? "bg-red-50/50 dark:bg-red-950/20" : undefined}>
                            <TableCell className="text-sm">{d.date} {d.suspicious && <Badge variant="destructive" className="text-xs ml-1">Suspicious</Badge>}</TableCell>
                            <TableCell className="text-right font-mono">{d.count.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">₹{d.earnings.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Payout History */}
              {bhaktProfile.payouts.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">{t("admin.profile.payout-history")}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.profile.col-date")}</TableHead>
                        <TableHead className="text-right">{t("admin.profile.col-amount")}</TableHead>
                        <TableHead>{t("admin.profile.col-method")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bhaktProfile.payouts.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{new Date(p.requestedAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right font-mono">₹{p.amount.toFixed(2)}</TableCell>
                          <TableCell className="text-sm">{paymentMethodLabel(p.paymentMethod) ?? "—"}</TableCell>
                          <TableCell><Badge variant={p.status === "paid" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-foreground">{t("admin.profile.load-failed")}</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
