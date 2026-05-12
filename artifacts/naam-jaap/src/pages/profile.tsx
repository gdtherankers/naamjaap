import { useGetMyProfile, useUpsertMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UpsertMyProfileBody } from "@workspace/api-zod";
import type { z } from "zod";
type UpsertProfileBody = z.infer<typeof UpsertMyProfileBody>;
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, LogOut, ShieldCheck, Lock, Phone, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language-context";

export default function ProfilePage() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { data: profileEnv } = useGetMyProfile();
  const upsertProfile = useUpsertMyProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const profile = profileEnv?.profile;

  const form = useForm<UpsertProfileBody>({
    resolver: zodResolver(UpsertMyProfileBody),
    defaultValues: {
      name: "",
      gotra: "",
      city: "",
      state: "",
      phone: "",
      upiId: "",
      gender: null,
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name,
        gotra: profile.gotra || "",
        city: profile.city,
        state: profile.state,
        phone: (profile as any).phone || "",
        upiId: profile.upiId || "",
        gender: profile.gender ?? null,
      });
    }
  }, [profile, form]);

  const onSubmit = (data: UpsertProfileBody) => {
    upsertProfile.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        toast({ title: t("profile.updated-title"), description: t("profile.updated-desc") });
      },
      onError: () => {
        toast({ variant: "destructive", title: t("common.error"), description: t("profile.error") });
      }
    });
  };

  // ── Password Change ──────────────────────────────────────────────────────
  const [authMethod, setAuthMethod] = useState<"local" | "oidc" | null>(null);
  const [hasLocalPassword, setHasLocalPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    fetch("/api/auth/method", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setAuthMethod(d.authMethod ?? null);
        setHasLocalPassword(!!d.hasLocalPassword);
      })
      .catch(() => {});
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError("Password must be at least 6 characters");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Password Updated", description: "Your password has been changed successfully." });
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        if (data.error?.includes("incorrect")) {
          setPwError("Current password is incorrect");
        } else if (data.error?.includes("6 characters")) {
          setPwError("Password must be at least 6 characters");
        } else {
          setPwError(data.error || "Something went wrong");
        }
      }
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError("Password must be at least 6 characters");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Password Set", description: "You can now also log in with your email and this password." });
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setHasLocalPassword(true);
      } else {
        setPwError(data.error || "Something went wrong");
      }
    } catch {
      setPwError("Something went wrong");
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in max-w-2xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("profile.title")}</h1>
          <p className="text-foreground mt-1">{t("profile.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <LogOut className="w-4 h-4 mr-2" /> {t("profile.logout")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary text-xl font-bold font-serif border border-primary/20">
                {profile?.name?.[0] || "ॐ"}
              </div>
              <div>
                <CardTitle className="text-2xl">{profile?.name}</CardTitle>
                <div className="flex gap-2 mt-2">
                  <Badge variant={profile?.approved ? "default" : "secondary"}>
                    {profile?.approved ? t("profile.approved") : t("profile.pending")}
                  </Badge>
                  {profile?.isAdmin && (
                    <Badge variant="outline" className="border-primary text-primary flex gap-1">
                      <ShieldCheck className="w-3 h-3" /> {t("nav.admin")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.full-name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="gotra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("profile.gotra")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("profile.city")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.state")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>लिंग (Gender)</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "none" ? null : val)}
                      value={field.value ?? "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="चुनें..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">— चुनें —</SelectItem>
                        <SelectItem value="male">पुरुष (Male)</SelectItem>
                        <SelectItem value="female">महिला (Female)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Read-only email from auth */}
              {(profile as any)?.email && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-foreground" /> Email
                  </label>
                  <Input
                    value={(profile as any).email}
                    readOnly
                    disabled
                    className="bg-muted text-foreground cursor-not-allowed"
                  />
                  <p className="text-xs text-foreground">Email login se linked hai, change nahi ho sakta</p>
                </div>
              )}

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-foreground" /> Mobile Number
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>UPI payment aur contact ke liye</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="upiId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.upi")}</FormLabel>
                    <FormControl>
                      <Input placeholder="user@upi" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>{t("profile.upi-desc")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={upsertProfile.isPending}>
                  {upsertProfile.isPending ? t("profile.saving") : t("profile.save")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* ── Password Card — shown for all logged-in users ── */}
      {authMethod !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="w-4 h-4" />
              {hasLocalPassword ? "Change Password" : "Set a Password"}
            </CardTitle>
            <CardDescription>
              {hasLocalPassword
                ? "Update your account password."
                : "Add email/password login to your account in addition to your current login method."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Change password — user already has a local password */}
            {hasLocalPassword && (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Current Password</label>
                  <Input
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New Password</label>
                  <Input
                    type="password"
                    value={pwForm.newPassword}
                    onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Confirm New Password</label>
                  <Input
                    type="password"
                    value={pwForm.confirmPassword}
                    onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                {pwError && <p className="text-sm text-destructive font-medium">{pwError}</p>}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={pwLoading || !pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword}
                  >
                    {pwLoading ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </form>
            )}

            {/* Set password — OIDC user without a local password yet */}
            {!hasLocalPassword && (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New Password</label>
                  <Input
                    type="password"
                    placeholder="Choose a password"
                    value={pwForm.newPassword}
                    onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <Input
                    type="password"
                    placeholder="Repeat password"
                    value={pwForm.confirmPassword}
                    onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                {pwError && <p className="text-sm text-destructive font-medium">{pwError}</p>}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={pwLoading || !pwForm.newPassword || !pwForm.confirmPassword}
                  >
                    {pwLoading ? "Setting..." : "Set Password"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
