import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wallet as WalletIcon, IndianRupee, History, Plus, Loader2, FileBadge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// @ts-ignore
import { load } from "@cashfreepayments/cashfree-js";
import {
  useGetWalletBalance,
  useGetWalletHistory,
  useCreateOrder,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Wallet() {
  const { data: balanceData, isLoading: isLoadingBalance, refetch: refetchBalance } = useGetWalletBalance();
  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useGetWalletHistory();
  const { mutateAsync: createOrder } = useCreateOrder() as any;
  const { toast } = useToast();

  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<string>("500");
  const [isProcessingTopUp, setIsProcessingTopUp] = useState(false);

  const currentBalance = balanceData?.currentBalance ?? 0;
  const ledgerHistory = historyData?.ledgers || [];
  
  const RATE = Number(import.meta.env.VITE_CERT_GENERATION_RATE || 1);
  const generationLimit = Math.floor(currentBalance / RATE);

  const handleTopUp = async () => {
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      setIsProcessingTopUp(true);
      const { payment_session_id } = await createOrder({ data: { amount } } as any);

      const cashfree = await load({
        mode: import.meta.env.VITE_CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox", 
      });

      const checkoutOptions: any = {
        paymentSessionId: payment_session_id,
        redirectTarget: "_modal",
      };

      await cashfree.checkout(checkoutOptions);
      
      console.log("Payment flow closed by user or completed.");
      setIsTopUpOpen(false);
      
      setTimeout(() => {
        refetchBalance();
        refetchHistory();
      }, 3000);
      
    } catch (error: any) {
      console.error("Failed to initiate top-up:", error);
      toast({
        title: "Top-up failed",
        description: error.data?.error || "Could not connect to the payment gateway. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingTopUp(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Prepaid Wallet</h1>
          <p className="text-muted-foreground mt-1">
            Manage your credits for certificate generation.
          </p>
        </div>

        <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              Add Credits
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Top-up Wallet</DialogTitle>
              <DialogDescription>
                Add funds to your prepaid wallet securely via Cashfree.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (INR)</label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  min="1"
                  className="text-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[100, 500, 1000].map((amt) => (
                  <Button
                    key={amt}
                    variant="outline"
                    type="button"
                    onClick={() => setTopUpAmount(amt.toString())}
                  >
                    ₹{amt}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pb-2">
              <Button variant="ghost" onClick={() => setIsTopUpOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleTopUp} disabled={isProcessingTopUp}>
                {isProcessingTopUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Proceed to Pay
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border bg-card/60 backdrop-blur-sm shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <WalletIcon className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-display font-bold">
                {isLoadingBalance ? "..." : `₹${currentBalance.toFixed(2)}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Used for generation and delivery fees
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-border bg-card/60 backdrop-blur-sm shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <FileBadge className="w-24 h-24" />
          </div>
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Generation Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-display font-bold">
                {isLoadingBalance ? "..." : generationLimit.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Current Generation Limit. Info-only updates are free!
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-muted-foreground" />
              Transaction History
            </CardTitle>
            <CardDescription>
              Your recent wallet top-ups and deductions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground">Loading history...</div>
            ) : ledgerHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <IndianRupee className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No transactions yet</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  When you add credits or generate batches, the transactions will appear here.
                </p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium text-right">Amount</th>
                      <th className="px-4 py-3 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerHistory.map((ledger: any) => (
                      <tr key={ledger.id} className="border-t">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {format(new Date(ledger.createdAt), "dd MMM yyyy, HH:mm")}
                        </td>
                        <td className="px-4 py-3">{ledger.description}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap
                            ${ledger.type === 'topup' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            {ledger.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${ledger.type === 'topup' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {ledger.amount > 0 ? '+' : '-'}₹{Math.abs(ledger.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground font-medium">
                          ₹{ledger.balanceAfter.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
