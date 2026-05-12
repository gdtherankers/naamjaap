import { useAuth } from "@workspace/replit-auth-web";
import { useGetMyProfile, useGetJaapSnapshot, getGetMyProfileQueryKey, getGetJaapSnapshotQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Mail, Lock, User } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language-context";

export default function LandingPage() {
  const { t } = useLanguage();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: profileEnv, isLoading: profileLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey(), enabled: isAuthenticated }
  });
  const { data: snapshotEnv, isLoading: snapshotLoading } = useGetJaapSnapshot({
    query: { queryKey: getGetJaapSnapshotQueryKey(), enabled: isAuthenticated && !!profileEnv?.profile?.approved }
  });
  const [, setLocation] = useLocation();

  // Email/password form state
  const [emailTab, setEmailTab] = useState<"login" | "register">("login");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [localAuthLoading, setLocalAuthLoading] = useState(false);
  const [localAuthError, setLocalAuthError] = useState("");

  useEffect(() => {
    if (isAuthenticated && !profileLoading) {
      if (!profileEnv?.profile) {
        setLocation("/onboarding");
      } else if (!profileEnv.profile.approved) {
        setLocation("/pending");
      } else {
        setLocation("/jaap");
      }
    }
  }, [isAuthenticated, profileEnv, profileLoading, setLocation]);

  const handleLocalAuth = async () => {
    setLocalAuthError("");
    if (!emailInput.trim() || !passwordInput.trim()) {
      setLocalAuthError(t("landing.error-required"));
      return;
    }
    if (emailTab === "register" && !nameInput.trim()) {
      setLocalAuthError(t("landing.error-name-required"));
      return;
    }

    setLocalAuthLoading(true);
    try {
      const endpoint = emailTab === "login"
        ? "/api/auth/local/login"
        : "/api/auth/local/register";

      const body: Record<string, string> = {
        email: emailInput.trim(),
        password: passwordInput,
      };
      if (emailTab === "register") body.name = nameInput.trim();

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalAuthError(data.error ?? t("landing.error-generic"));
        return;
      }

      // Successful — reload to trigger auth state refresh
      window.location.href = "/";
    } catch {
      setLocalAuthError("Network error. Please try again.");
    } finally {
      setLocalAuthLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-foreground relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-secondary/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="z-10 flex flex-col items-center text-center px-4 max-w-2xl w-full"
      >
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-card border border-primary/20 flex items-center justify-center mb-8 shadow-2xl shadow-primary/20 relative">
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-[spin_10s_linear_infinite] border-dashed" />
          <Flame className="w-12 h-12 md:w-16 md:h-16 text-primary fill-primary/20" />
        </div>

        <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 text-primary drop-shadow-sm">
          {t("landing.title")}
        </h1>

        <p className="text-xl md:text-2xl text-foreground mb-4 font-serif italic">
          {t("landing.subtitle")}
        </p>

        <p className="text-base md:text-lg text-foreground mb-8 max-w-xl leading-relaxed">
          {t("landing.description")}
        </p>

        {/* Email/password form — always visible */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-full max-w-xs mt-2"
        >
          <div className="bg-card border border-border rounded-2xl p-5 shadow-lg space-y-4">
            {/* Login / Register tabs */}
            <div className="flex rounded-lg bg-muted p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => { setEmailTab("login"); setLocalAuthError(""); }}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${emailTab === "login" ? "bg-background shadow text-foreground" : "text-foreground hover:text-foreground"}`}
              >
                {t("landing.tab-login")}
              </button>
              <button
                type="button"
                onClick={() => { setEmailTab("register"); setLocalAuthError(""); }}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${emailTab === "register" ? "bg-background shadow text-foreground" : "text-foreground hover:text-foreground"}`}
              >
                {t("landing.tab-register")}
              </button>
            </div>

            {emailTab === "register" && (
              <div className="space-y-1">
                <Label className="text-xs text-foreground">{t("landing.label-name")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                  <Input
                    type="text"
                    placeholder={t("landing.placeholder-name")}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-foreground">{t("landing.label-email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                <Input
                  type="email"
                  placeholder={t("landing.placeholder-email")}
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="pl-9 text-sm"
                  onKeyDown={e => e.key === "Enter" && handleLocalAuth()}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <Label className="text-xs text-foreground">{t("landing.label-password")}</Label>
                {emailTab === "login" && (
                  <a href="/forgot-password" className="text-xs text-primary hover:underline">
                    {t("landing.forgot-password")}
                  </a>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                <Input
                  type="password"
                  placeholder={t("landing.placeholder-password")}
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  className="pl-9 text-sm"
                  onKeyDown={e => e.key === "Enter" && handleLocalAuth()}
                />
              </div>
            </div>

            {localAuthError && (
              <p className="text-xs text-destructive text-center">{localAuthError}</p>
            )}

            <Button
              className="w-full"
              onClick={handleLocalAuth}
              disabled={localAuthLoading}
            >
              {localAuthLoading
                ? t("landing.btn-loading")
                : emailTab === "login" ? t("landing.btn-login") : t("landing.btn-register")}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
