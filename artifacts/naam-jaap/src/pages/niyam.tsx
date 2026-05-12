import { BookOpen, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/lib/language-context";

const rules = [
  {
    icon: "📿",
    en: {
      title: "Read and take the Sankalp carefully",
      desc: "Before starting, read the Sankalp attentively and recite it with clear intention.",
    },
    hi: {
      title: "संकल्प को ध्यान से पढ़ें और करें",
      desc: "जप शुरू करने से पहले संकल्प को ध्यानपूर्वक पढ़ें और स्पष्ट रूप से उसका उच्चारण करें।",
    },
  },
  {
    icon: "🛁",
    en: {
      title: "Maintain purity before chanting",
      desc: "Take a bath or at least ensure personal cleanliness before starting the chanting.",
    },
    hi: {
      title: "पवित्र होकर नाम जप करें",
      desc: "जप से पहले स्नान करें या कम से कम स्वच्छ होकर पवित्र अवस्था में बैठें।",
    },
  },
  {
    icon: "🧘",
    en: {
      title: "Chant with full concentration",
      desc: "Keep your mind focused and avoid distractions during the chanting process.",
    },
    hi: {
      title: "पूर्ण एकाग्रता से जप करें",
      desc: "जप करते समय मन को इधर-उधर भटकने न दें और पूरा ध्यान नाम पर रखें।",
    },
  },
  {
    icon: "🙏",
    en: {
      title: "Maintain devotion and sincerity",
      desc: "Perform each chant with true devotion, honesty, and a pure heart.",
    },
    hi: {
      title: "श्रद्धा और ईमानदारी बनाए रखें",
      desc: "हर नाम जप को सच्चे भाव, श्रद्धा और ईमानदारी के साथ करें।",
    },
  },
  {
    icon: "🚫",
    en: {
      title: "Avoid tamasic things during the jaap period",
      desc: "Refrain from non-vegetarian food, alcohol, and tobacco/intoxicants during the naam jaap period. This applies to both the chanting devotees and the yajamanas (patrons) who have taken the sankalp.",
    },
    hi: {
      title: "जप काल में तामसिक वस्तुओं से दूर रहें",
      desc: "नाम जप की अवधि में मांस, मदिरा और तम्बाकू / नशीले पदार्थों का सेवन न करें। यह नियम जप करने वाले भक्त और संकल्प लेने वाले यजमान — दोनों पर लागू होता है।",
    },
  },
];

const content = {
  en: {
    pageTitle: "Naam Jaap Rules",
    subtitle: "Guidelines for Devotional Chanting",
    intro: "Follow these guidelines to perform naam jaap with purity and devotion. Baba Shyam blesses those who chant with sincerity and discipline.",
    footer: "Jai Shree Shyam",
  },
  hi: {
    pageTitle: "नाम जप के नियम",
    subtitle: "भक्तिपूर्ण जप के लिए दिशा-निर्देश",
    intro: "श्री खाटू श्याम जी के नाम जप को सफलतापूर्वक और पवित्र भाव से सम्पन्न करने के लिए इन नियमों का पालन करें। बाबा श्याम की कृपा उन पर विशेष रहती है जो श्रद्धा और नियम के साथ जप करते हैं।",
    footer: "जय श्री श्याम",
  },
};

export default function NiyamPage() {
  const { language } = useLanguage();
  const lang = language === "hi" ? "hi" : "en";
  const c = content[lang];

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight font-serif text-primary">{c.pageTitle}</h1>
        <p className="text-sm text-foreground italic">{c.subtitle}</p>
      </div>

      {/* Intro card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 text-center">
          <p className="text-sm leading-relaxed text-foreground">{c.intro}</p>
        </CardContent>
      </Card>

      {/* Rules cards */}
      <div className="space-y-4">
        {rules.map((rule, i) => {
          const r = rule[lang];
          return (
            <Card key={i} className="border-border/60 hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-xl">
                    {rule.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-base font-serif">{r.title}</h3>
                    <p className="text-sm text-foreground mt-1 leading-relaxed">{r.desc}</p>
                  </div>
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center pb-4">
        <div className="flex items-center justify-center gap-2 text-primary/60">
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-serif">{c.footer}</span>
          <Sparkles className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
