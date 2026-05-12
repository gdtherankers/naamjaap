import { useEffect, useState } from "react";
import { MessageCircle, Clock, HelpCircle, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language-context";

export default function ContactPage() {
  const { t, language } = useLanguage();
  const [whatsappNumber, setWhatsappNumber] = useState("8950889321");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d?.whatsappNumber) setWhatsappNumber(d.whatsappNumber); })
      .catch(() => {});
  }, []);

  const waMessage = language === "hi"
    ? "नमस्ते! मुझे नाम जप सेवा के बारे में जानकारी चाहिए।"
    : "Hello! I need help with Naam Jap Sewa.";
  const waLink = `https://wa.me/91${whatsappNumber}?text=${encodeURIComponent(waMessage)}`;

  const formatted = whatsappNumber.replace(/(\d{5})(\d{5})/, "$1 $2");

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-1">
          <MessageCircle className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold font-serif text-foreground">
          {t("contact.title")}
        </h1>
        <p className="text-foreground text-sm">
          {t("contact.subtitle")}
        </p>
      </div>

      {/* WhatsApp Card */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-5 space-y-4 pt-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="w-4 h-4 text-foreground" />
            <span className="text-sm font-medium text-foreground">{t("contact.whatsapp.label")}</span>
          </div>

          {/* Number display */}
          <div className="flex items-center justify-between bg-muted/50 rounded-xl px-4 py-3 border border-border/40">
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-foreground flex-shrink-0" />
              <div>
                <p className="text-[10px] text-foreground uppercase tracking-wide mb-0.5">
                  {language === "hi" ? "व्हाट्सऐप नंबर" : "WhatsApp Number"}
                </p>
                <p className="text-lg font-bold text-foreground">+91 {formatted}</p>
              </div>
            </div>
          </div>

          <p className="text-sm text-foreground leading-relaxed">
            {t("contact.whatsapp.desc")}
          </p>

          <a href={waLink} target="_blank" rel="noopener noreferrer" className="block">
            <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-5">
              <MessageCircle className="w-4 h-4" />
              {t("contact.whatsapp.button")}
            </Button>
          </a>

          <p className="text-xs text-center text-foreground">
            {t("contact.whatsapp.hint")}
          </p>
        </CardContent>
      </Card>

      {/* Availability + Help — side by side on wider screens, stacked on small */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Availability */}
        <Card className="shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <p className="font-semibold text-sm text-foreground">{t("contact.hours.title")}</p>
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              {t("contact.hours.desc")}
            </p>
            <div className="bg-primary/5 rounded-lg px-3 py-2 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-primary">{t("contact.hours.time")}</span>
            </div>
          </CardContent>
        </Card>

        {/* Help */}
        <Card className="shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-4 h-4 text-orange-500" />
              </div>
              <p className="font-semibold text-sm text-foreground">{t("contact.note.title")}</p>
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              {t("contact.note.desc")}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-sm text-foreground pb-6">
        🙏 {language === "hi" ? "जय श्री श्याम" : "Jai Shri Shyam"}🙏
      </p>
    </div>
  );
}
