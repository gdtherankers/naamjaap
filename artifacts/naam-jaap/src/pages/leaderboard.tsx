import { useGetLeaderboard } from "@workspace/api-client-react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Trophy, Crown, Award, Flame } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/language-context";

type Scope = "today" | "week" | "alltime";

export default function LeaderboardPage() {
  const { t } = useLanguage();
  const [scope, setScope] = useState<Scope>("today");
  const { data: leaderboardEnv, isLoading } = useGetLeaderboard({ scope });

  const entries = leaderboardEnv?.entries || [];

  const badgeIcon = (badge: string) => {
    if (badge.includes("Maha")) return <Crown className="w-3 h-3 text-yellow-500" />;
    if (badge.includes("Lakh")) return <Award className="w-3 h-3 text-amber-600" />;
    if (badge.includes("Streak")) return <Flame className="w-3 h-3 text-orange-500" />;
    return <Trophy className="w-3 h-3" />;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("leaderboard.title")}</h1>
        <p className="text-foreground mt-1">{t("leaderboard.subtitle")}</p>
      </div>

      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="today">{t("leaderboard.today")}</TabsTrigger>
          <TabsTrigger value="week">{t("leaderboard.week")}</TabsTrigger>
          <TabsTrigger value="alltime">{t("leaderboard.alltime")}</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <Card className="overflow-hidden border-border/50">
            <div className="divide-y">
              {entries.map((entry, idx) => (
                <div 
                  key={`${entry.userId ?? entry.rank}-${idx}`}
                  className={`flex items-center gap-4 p-4 transition-colors hover:bg-muted/50 ${entry.isMe ? 'bg-primary/5 hover:bg-primary/10' : ''}`}
                >
                  <div className="w-8 font-bold text-center text-foreground">
                    {idx === 0 ? <Crown className="w-6 h-6 mx-auto text-yellow-500" /> :
                     idx === 1 ? <span className="text-gray-400 text-lg">2</span> :
                     idx === 2 ? <span className="text-amber-600 text-lg">3</span> :
                     idx + 1}
                  </div>

                  <Avatar className="h-10 w-10 border">
                    <AvatarFallback className={entry.isMe ? "" : "text-foreground"}>
                      {entry.isMe ? (entry.name?.[0] ?? "भ") : "?"}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">
                        {entry.name}
                        {entry.isMe && <span className="ml-2 text-xs font-normal text-primary">{t("leaderboard.you")}</span>}
                      </p>
                      {(entry.badges ?? []).map((b) => (
                        <Badge key={b} variant="secondary" className="text-[10px] h-5 px-1.5 flex gap-1 items-center">
                          {badgeIcon(b)} {b}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-foreground truncate">
                      {entry.city}{entry.gotra ? ` · ${entry.gotra}` : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{entry.count.toLocaleString()}</p>
                    <p className="text-xs text-foreground">{t("leaderboard.jaaps")}</p>
                  </div>
                </div>
              ))}

              {!isLoading && entries.length === 0 && (
                <div className="p-8 text-center text-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>{t("leaderboard.empty")}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </Tabs>
    </div>
  );
}
