import { useListMyPayouts, useRequestPayout, useGetDashboardSummary, getListMyPayoutsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RequestPayoutBody as RequestPayoutBodySchema } from "@workspace/api-zod";
import type { z } from "zod";
type RequestPayoutBody = z.infer<typeof RequestPayoutBodySchema>;
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Coins, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language-context";

export default function WalletPage() {
  const { t } = useLanguage();
  const { data: payoutsEnv } = useListMyPayouts();
  const { data: summaryEnv } = useGetDashboardSummary();
  const requestPayout = useRequestPayout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const balance = summaryEnv?.snapshot?.totalEarnings || 0;
  const pendingAmount = (payoutsEnv?.payouts || [])
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  
  const availableBalance = balance - pendingAmount;

  const form = useForm<RequestPayoutBody>({
    resolver: zodResolver(RequestPayoutBodySchema),
    defaultValues: { amount: 10, upiId: "" },
  });

  const onSubmit = (data: RequestPayoutBody) => {
    requestPayout.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyPayoutsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setIsOpen(false);
        form.reset();
        toast({ title: t("wallet.payout-requested-title"), description: t("wallet.payout-requested-desc") });
      },
      onError: (err: any) => {
        toast({ 
          variant: "destructive", 
          title: t("common.error"), 
          description: err?.response?.data?.message || t("wallet.payout-error")
        });
      }
    });
  };

  const statusLabel = (status: string) => {
    if (status === 'paid') return t("wallet.status-paid");
    if (status === 'rejected') return t("wallet.status-rejected");
    return t("wallet.status-pending");
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("wallet.title")}</h1>
        <p className="text-foreground mt-1">{t("wallet.subtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-foreground">{t("wallet.available")}</p>
                <p className="text-4xl font-bold text-primary mt-1">₹{availableBalance.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-full">
                <Coins className="w-6 h-6 text-primary" />
              </div>
            </div>
            
            <div className="mt-6">
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={availableBalance < 10}>
                    {t("wallet.request-payout")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("wallet.payout-dialog-title")}</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("wallet.amount")}</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min={10} 
                                max={availableBalance} 
                                {...field} 
                                onChange={e => field.onChange(Number(e.target.value))} 
                              />
                            </FormControl>
                            <FormDescription>{t("wallet.min-note")}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="upiId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("wallet.upi")}</FormLabel>
                            <FormControl>
                              <Input placeholder="user@upi" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={requestPayout.isPending}>
                        {requestPayout.isPending ? t("wallet.submitting") : t("wallet.submit")}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              {availableBalance < 10 && (
                <p className="text-xs text-foreground mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {t("wallet.min-balance")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("wallet.lifetime")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-foreground">{t("wallet.total-earned")}</span>
                <span className="font-medium">₹{balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-foreground">{t("wallet.pending-payouts")}</span>
                <span className="font-medium text-orange-500">₹{pendingAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">{t("wallet.total-withdrawn")}</span>
                <span className="font-medium text-green-600">
                  ₹{(balance - availableBalance - pendingAmount).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("wallet.payout-history")}</CardTitle>
          <CardDescription>{t("wallet.payout-history-desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("wallet.date")}</TableHead>
                <TableHead>{t("wallet.upi")}</TableHead>
                <TableHead>{t("wallet.amount-col")}</TableHead>
                <TableHead>{t("wallet.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payoutsEnv?.payouts || []).map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell>{new Date(payout.requestedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="font-mono text-xs">{payout.upiId}</TableCell>
                  <TableCell className="font-medium">₹{Number(payout.amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={
                      payout.status === 'paid' ? 'default' : 
                      payout.status === 'rejected' ? 'destructive' : 'secondary'
                    }>
                      {statusLabel(payout.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!payoutsEnv?.payouts?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-foreground">
                    {t("wallet.no-payouts")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
