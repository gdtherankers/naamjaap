import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Lock, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => setTokenValid(!!d.valid))
      .catch(() => setTokenValid(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setTimeout(() => setLocation("/"), 3000);
      } else {
        setError(d.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-card border border-primary/20 flex items-center justify-center shadow-lg">
            <Flame className="w-8 h-8 text-primary fill-primary/20" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-1">Set New Password</h1>
        <p className="text-sm text-foreground text-center mb-8">Naam Jaap Sewa</p>

        {tokenValid === null && (
          <div className="text-center text-foreground text-sm animate-pulse">
            Verifying your reset link...
          </div>
        )}

        {tokenValid === false && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-3">
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <h2 className="font-semibold text-destructive">Link Invalid or Expired</h2>
            <p className="text-sm text-foreground">
              This reset link has expired or has already been used.<br />
              Please request a new one.
            </p>
            <Link href="/forgot-password">
              <Button className="w-full mt-2">Request New Link</Button>
            </Link>
            <Link href="/">
              <button className="text-xs text-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto mt-1">
                <ArrowLeft className="w-3 h-3" /> Back to Login
              </button>
            </Link>
          </div>
        )}

        {tokenValid === true && !done && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg space-y-5">
            <div>
              <h2 className="font-semibold text-base">Create a new password</h2>
              <p className="text-sm text-foreground mt-1">
                Choose a strong password with at least 6 characters.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                  <Input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                  <Input
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </div>
        )}

        {done && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <h2 className="font-semibold text-green-800 dark:text-green-300">Password Updated!</h2>
            <p className="text-sm text-green-700 dark:text-green-400">
              Your new password has been set. You can now log in.<br />
              <span className="text-xs">Redirecting to login in 3 seconds...</span>
            </p>
            <Link href="/">
              <Button variant="outline" className="w-full mt-2">Go to Login</Button>
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
