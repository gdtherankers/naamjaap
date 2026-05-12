import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useUpsertMyProfile, useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { UpsertMyProfileBody } from "@workspace/api-zod";
import type { z } from "zod";
type UpsertProfileBody = z.infer<typeof UpsertMyProfileBody>;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Flame } from "lucide-react";
import { useEffect } from "react";
import { useLanguage } from "@/lib/language-context";

export default function OnboardingPage() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: profileEnv, isLoading: isProfileLoading } = useGetMyProfile();
  const upsertProfile = useUpsertMyProfile();

  const form = useForm<UpsertProfileBody>({
    resolver: zodResolver(UpsertMyProfileBody),
    defaultValues: {
      name: "",
      gotra: "",
      city: "",
      state: "",
      upiId: "",
    },
  });

  useEffect(() => {
    if (profileEnv?.profile) {
      if (profileEnv.profile.approved) {
        setLocation("/jaap");
      } else {
        setLocation("/pending");
      }
    }
  }, [profileEnv, setLocation]);

  const onSubmit = (data: UpsertProfileBody) => {
    upsertProfile.mutate({ data }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        if (res.profile?.approved) {
          setLocation("/jaap");
        } else {
          setLocation("/pending");
        }
      }
    });
  };

  if (isProfileLoading) return null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
      
      <Card className="w-full max-w-md relative z-10 shadow-xl border-primary/20">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Flame className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="font-serif text-3xl text-primary mb-2">{t("onboarding.title")}</CardTitle>
            <CardDescription className="text-base">{t("onboarding.subtitle")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("onboarding.full-name")}</FormLabel>
                    <FormControl>
                      <Input placeholder="राम शर्मा" {...field} />
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
                      <FormLabel>{t("onboarding.gotra")}</FormLabel>
                      <FormControl>
                        <Input placeholder="कश्यप" {...field} value={field.value || ""} />
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
                      <FormLabel>{t("onboarding.city")}</FormLabel>
                      <FormControl>
                        <Input placeholder="जयपुर" {...field} />
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
                    <FormLabel>{t("onboarding.state")}</FormLabel>
                    <FormControl>
                      <Input placeholder="राजस्थान" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="upiId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("onboarding.upi")}</FormLabel>
                    <FormControl>
                      <Input placeholder="user@upi" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={upsertProfile.isPending}>
                {upsertProfile.isPending ? t("onboarding.saving") : t("onboarding.submit")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
