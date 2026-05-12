import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMyProfile, useAdminStats } from "@workspace/api-client-react";
import { Flame, LayoutDashboard, Trophy, Wallet, Calendar, User, Shield, LogOut, Menu, Target, Globe, Banknote, BookOpen, CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme-provider";
import { useLanguage } from "@/lib/language-context";

const niyamRules = [
  {
    icon: "📿",
    en: { title: "Read and take the Sankalp carefully", desc: "Before starting, read the Sankalp attentively and recite it with clear intention." },
    hi: { title: "संकल्प को ध्यान से पढ़ें और करें", desc: "जप शुरू करने से पहले संकल्प को ध्यानपूर्वक पढ़ें और स्पष्ट रूप से उसका उच्चारण करें।" },
  },
  {
    icon: "🛁",
    en: { title: "Maintain purity before chanting", desc: "Take a bath or at least ensure personal cleanliness before starting the chanting." },
    hi: { title: "पवित्र होकर नाम जप करें", desc: "जप से पहले स्नान करें या कम से कम स्वच्छ होकर पवित्र अवस्था में बैठें।" },
  },
  {
    icon: "🧘",
    en: { title: "Chant with full concentration", desc: "Keep your mind focused and avoid distractions during the chanting process." },
    hi: { title: "पूर्ण एकाग्रता से जप करें", desc: "जप करते समय मन को इधर-उधर भटकने न दें और पूरा ध्यान नाम पर रखें।" },
  },
  {
    icon: "🙏",
    en: { title: "Maintain devotion and sincerity", desc: "Perform each chant with true devotion, honesty, and a pure heart." },
    hi: { title: "श्रद्धा और ईमानदारी बनाए रखें", desc: "हर नाम जप को सच्चे भाव, श्रद्धा और ईमानदारी के साथ करें।" },
  },
  {
    icon: "🚫",
    en: { title: "Avoid tamasic things during the jaap period", desc: "Refrain from non-vegetarian food, alcohol, and tobacco/intoxicants. This applies to both chanters and yajamanas (patrons) who have taken the sankalp." },
    hi: { title: "जप काल में तामसिक वस्तुओं से दूर रहें", desc: "मांस, मदिरा और तम्बाकू / नशीले पदार्थों का सेवन न करें। यह नियम जप करने वाले भक्त और संकल्प लेने वाले यजमान — दोनों पर लागू होता है।" },
  },
];

type NavItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
  badgeCount?: number;
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { data: profileEnv } = useGetMyProfile();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const profile = profileEnv?.profile;
  const isAdmin = profile?.isAdmin;

  const [showNiyam, setShowNiyam] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("8950889321");

  useEffect(() => {
    if (user && !isAdmin && !sessionStorage.getItem("niyamConfirmed")) {
      setShowNiyam(true);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.whatsappNumber) setWhatsappNumber(d.whatsappNumber); })
      .catch(() => {});
  }, []);

  const confirmNiyam = () => {
    sessionStorage.setItem("niyamConfirmed", "1");
    setShowNiyam(false);
    window.dispatchEvent(new CustomEvent("niyamConfirmed"));
  };

  const lang = language === "hi" ? "hi" : "en";

  const { data: adminStats } = useAdminStats({
    query: { enabled: !!isAdmin, refetchInterval: 30_000 } as any,
  });
  const pendingCount = adminStats?.pendingApproval ?? 0;

  const navItems: NavItem[] = [
    ...(!isAdmin ? [{ label: t("nav.jaap"), path: "/jaap", icon: <Flame className="w-4 h-4" /> }] : []),
    { label: t("nav.dashboard"), path: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: t("nav.sankalp-board"), path: "/sankalp-board", icon: <Target className="w-4 h-4" /> },
    { label: t("nav.leaderboard"), path: "/leaderboard", icon: <Trophy className="w-4 h-4" /> },
    ...(isAdmin
      ? [{ label: t("nav.payout"), path: "/payouts", icon: <Banknote className="w-4 h-4" /> }]
      : [{ label: t("nav.wallet"), path: "/wallet", icon: <Wallet className="w-4 h-4" /> }]),
    { label: t("nav.history"), path: "/sankalp-history", icon: <Calendar className="w-4 h-4" /> },
    { label: language === "hi" ? "नाम जप नियम" : "Naam Jaap Rules", path: "/niyam", icon: <BookOpen className="w-4 h-4" /> },
    { label: t("nav.profile"), path: "/profile", icon: <User className="w-4 h-4" /> },
  ];

  if (isAdmin) {
    navItems.push({
      label: t("nav.mera-sankalp"),
      path: "/mera-sankalp",
      icon: <Target className="w-4 h-4" />,
    });
    navItems.push({
      label: t("nav.admin"),
      path: "/admin",
      icon: <Shield className="w-4 h-4" />,
      badgeCount: pendingCount,
    });
  }

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <Link
          key={item.path}
          href={item.path}
          onClick={() => setIsMobileMenuOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            location === item.path
              ? "bg-primary/10 text-primary font-medium"
              : "hover:bg-muted text-foreground"
          }`}
        >
          {item.icon}
          <span className="flex-1">{item.label}</span>
          {item.badgeCount && item.badgeCount > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {item.badgeCount}
            </span>
          ) : null}
        </Link>
      ))}
    </>
  );

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row bg-background overflow-hidden">

      {/* ── Niyam Confirmation Dialog (shown every session) ── */}
      <Dialog open={showNiyam} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md max-h-[90dvh] overflow-y-auto [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Accessible title (screen-reader only) */}
          <DialogTitle className="sr-only">
            {lang === "hi" ? "नाम जप के नियम" : "Naam Jaap Rules"}
          </DialogTitle>

          {/* Header */}
          <div className="text-center space-y-2 pt-2">
            <div className="text-4xl">🕉️</div>
            <h2 className="text-xl font-bold font-serif text-primary">
              {lang === "hi" ? "नाम जप के नियम" : "Naam Jaap Rules"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {lang === "hi"
                ? "जप शुरू करने से पहले कृपया इन नियमों को पढ़ें और स्वीकार करें।"
                : "Please read and accept these guidelines before starting your chanting."}
            </p>
          </div>

          {/* Rules */}
          <div className="space-y-3 mt-2">
            {niyamRules.map((rule, i) => {
              const r = rule[lang];
              return (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/50 border border-border/40">
                  <span className="text-xl flex-shrink-0 mt-0.5">{rule.icon}</span>
                  <div>
                    <p className="font-semibold text-sm font-serif">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{r.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confirm button */}
          <div className="pt-2 space-y-2">
            <Button
              className="w-full gap-2 text-base py-5 font-serif"
              onClick={confirmNiyam}
            >
              <CheckCircle2 className="w-5 h-5" />
              {lang === "hi"
                ? (profileEnv?.profile?.gender === "female"
                    ? "मैं इन नियमों का पालन करूँगी"
                    : "मैं इन नियमों का पालन करूँगा")
                : "I will follow these rules"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {lang === "hi" ? "जय श्री श्याम 🙏" : "Jai Shree Shyam 🙏"}
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <Link href={isAdmin ? "/dashboard" : "/jaap"} className="flex items-center gap-2 text-primary">
          <Flame className="w-6 h-6 fill-primary" />
          <span className="font-serif font-bold text-lg">नाम जप सेवा</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLanguage(language === "en" ? "hi" : "en")} title={language === "en" ? "हिंदी" : "English"}>
            <span className="text-lg font-bold">{language === "en" ? "EN" : "हि"}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <span className="text-xl">{theme === "dark" ? "🌙" : "☀️"}</span>
          </Button>
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] flex flex-col p-0">
              <div className="p-6 border-b flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-primary/20">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.firstName?.[0] || profile?.name?.[0] || "O"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{profile?.name || user?.firstName || "Devotee"}</span>
                  <span className="text-xs text-muted-foreground">{profile?.city || "Welcome"}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
                <NavLinks />
              </div>
              <div className="p-4 border-t space-y-2">
                <Button variant="ghost" className="w-full justify-start gap-2 text-foreground" onClick={() => setLanguage(language === "en" ? "hi" : "en")}>
                  <Globe className="w-4 h-4" />
                  {language === "en" ? "हिंदी" : "English"}
                </Button>
                <Link href="/contact" className="flex w-full" onClick={() => setIsMobileMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-2 text-foreground">
                    <MessageCircle className="w-4 h-4" />
                    {t("nav.contact")}
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full justify-start gap-2 text-foreground hover:text-destructive hover:bg-destructive/10" onClick={logout}>
                  <LogOut className="w-4 h-4" />
                  {t("nav.logout")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r bg-card/50">
        <div className="p-6 border-b">
          <Link href={isAdmin ? "/dashboard" : "/jaap"} className="flex items-center gap-3 text-primary hover:opacity-80 transition-opacity">
            <Flame className="w-8 h-8 fill-primary" />
            <span className="font-serif font-bold text-xl tracking-wide">नाम जप सेवा</span>
          </Link>
        </div>

        <div className="p-6 border-b flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-primary/20">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-serif">
                {user?.firstName?.[0] || profile?.name?.[0] || "ॐ"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="font-medium text-sm truncate">{profile?.name || user?.firstName || "Devotee"}</span>
              <span className="text-xs text-muted-foreground truncate">{profile?.city || "Welcome"}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 mr-2">
            <Button variant="ghost" size="icon" onClick={() => setLanguage(language === "en" ? "hi" : "en")} title={language === "en" ? "हिंदी" : "English"}>
              <span className="text-sm font-bold">{language === "en" ? "EN" : "हि"}</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <span className="text-lg">{theme === "dark" ? "🌙" : "☀️"}</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-2">
          <NavLinks />
        </div>

        <div className="p-4 border-t space-y-2">
          <Button variant="ghost" className="w-full justify-start gap-3 text-foreground" onClick={() => setLanguage(language === "en" ? "hi" : "en")}>
            <Globe className="w-4 h-4" />
            {language === "en" ? "हिंदी" : "English"}
          </Button>
          <Link href="/contact" className="flex w-full">
            <Button variant="ghost" className="w-full justify-start gap-3 text-foreground">
              <MessageCircle className="w-4 h-4" />
              {t("nav.contact")}
            </Button>
          </Link>
          <Button variant="ghost" className="w-full justify-start gap-3 text-foreground hover:text-destructive hover:bg-destructive/10" onClick={logout}>
            <LogOut className="w-4 h-4" />
            {t("nav.logout")}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
        <div className="relative z-10 p-4 md:p-8 max-w-5xl mx-auto min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
