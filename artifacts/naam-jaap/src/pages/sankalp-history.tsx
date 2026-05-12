import { useGetSankalpHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, XCircle } from "lucide-react";
import { useLanguage } from "@/lib/language-context";

export default function SankalpHistoryPage() {
  const { t, language } = useLanguage();
  const { data: historyEnv } = useGetSankalpHistory();
  const items = historyEnv?.history || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("history.title")}</h1>
        <p className="text-foreground mt-1">{t("history.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {t("history.last30")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.date} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">{new Date(item.date).toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <Badge variant={item.accepted ? "default" : "secondary"} className={item.accepted ? "bg-green-600 hover:bg-green-700" : ""}>
                  {item.accepted ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {t("history.accepted")}</span>
                  ) : (
                    <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> {t("history.missed")}</span>
                  )}
                </Badge>
              </div>
            ))}
            
            {items.length === 0 && (
              <div className="text-center py-12 text-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>{t("history.empty")}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
