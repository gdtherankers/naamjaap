import { useGetMyProfile } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/lib/language-context";

export default function PendingPage() {
  const { t } = useLanguage();
  const { data: profileEnv } = useGetMyProfile();
  const { logout } = useAuth();
  
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="shadow-2xl border-primary/20 text-center py-8">
          <CardContent className="space-y-6 flex flex-col items-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
              <Flame className="w-10 h-10 text-primary" />
            </div>
            
            <div>
              <h1 className="text-2xl font-serif text-primary mb-2">
                {t("pending.heading")}
              </h1>
              <h2 className="text-xl font-medium">
                {t("pending.welcome")}, {profileEnv?.profile?.name || "भक्त"}
              </h2>
            </div>
            
            <p className="text-foreground max-w-sm">
              {t("pending.message")}
            </p>
            
            <Button variant="outline" onClick={logout} className="mt-4">
              <LogOut className="w-4 h-4 mr-2" />
              {t("pending.logout")}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
