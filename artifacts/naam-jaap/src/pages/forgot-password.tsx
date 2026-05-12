import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Email is required"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const d = await res.json().catch(() => ({}));
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

        <h1 className="text-2xl font-bold text-center mb-1">Password Reset</h1>
        <p className="text-sm text-foreground text-center mb-8">
          Naam Jaap Sewa
        </p>

        {sent ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <h2 className="font-semibold text-green-800 dark:text-green-300">Email Sent!</h2>
            <p className="text-sm text-green-700 dark:text-green-400">
              If an account exists for <strong>{email}</strong>, a password reset link has been sent.<br />
              Please check your inbox and spam folder. The link expires in 1 hour.
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-2 w-full">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg space-y-5">
            <div>
              <h2 className="font-semibold text-base">Forgot your password?</h2>
              <p className="text-sm text-foreground mt-1">
                Enter your registered email and we'll send you a reset link.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
            <div className="text-center">
              <Link href="/">
                <button className="text-xs text-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto">
                  <ArrowLeft className="w-3 h-3" /> Back to Login
                </button>
              </Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
