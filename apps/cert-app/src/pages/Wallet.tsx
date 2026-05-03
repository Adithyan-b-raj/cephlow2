import { useState } from "react";
import { Wallet as WalletIcon, IndianRupee, History, Plus, Loader2, FileBadge, Users } from "lucide-react";
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
import { useWorkspace } from "@/hooks/use-workspace";

export default function Wallet() {
  const { activeWorkspace, workspaces, role } = useWorkspace();
  const isAdmin = role === "owner" || role === "admin";
  const memberCount = activeWorkspace
    ? workspaces.find((w) => w.id === activeWorkspace.id) ? workspaces.length : 1
    : 1;
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
      const cashfree = await load({ mode: import.meta.env.VITE_CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox" });
      await cashfree.checkout({ paymentSessionId: payment_session_id, redirectTarget: "_modal" });
      setIsTopUpOpen(false);
      setTimeout(() => { refetchBalance(); refetchHistory(); }, 3000);
    } catch (error: any) {
      toast({ title: "Top-up failed", description: error.data?.error || "Could not connect to payment gateway.", variant: "destructive" });
    } finally {
      setIsProcessingTopUp(false);
    }
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-2 border-foreground pb-4">
        <div>
          <h1 className="text-2xl font-display font-black">Prepaid Wallet</h1>
          <p className="text-xs text-muted-foreground mt-1 normal-case tracking-normal font-normal">Manage credits for certificate generation.</p>
          {activeWorkspace && (
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 uppercase tracking-widest">
              <Users className="w-3 h-3" />
              Shared with {memberCount} member{memberCount !== 1 ? "s" : ""} · {activeWorkspace.name}
            </p>
          )}
        </div>
        {isAdmin && (
        <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
          <DialogTrigger asChild>
            <Button className="font-bold uppercase tracking-widest text-xs h-10 gap-2 border-2">
              <Plus className="w-3.5 h-3.5" />
              Add Credits
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md border-2 border-foreground">
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest">Top-up Wallet</DialogTitle>
              <DialogDescription className="normal-case tracking-normal font-normal">Add funds securely via Cashfree.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest">Amount (INR)</label>
                <Input type="number" placeholder="e.g. 500" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} min="1" className="text-lg font-mono border-2" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[100, 500, 1000].map((amt) => (
                  <Button key={amt} variant="outline" type="button" onClick={() => setTopUpAmount(amt.toString())} className="border-2 font-bold uppercase tracking-widest text-xs">
                    ₹{amt}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pb-2">
              <Button variant="ghost" onClick={() => setIsTopUpOpen(false)} className="uppercase tracking-widest text-xs font-bold">Cancel</Button>
              <Button onClick={handleTopUp} disabled={isProcessingTopUp} className="uppercase tracking-widest text-xs font-bold border-2">
                {isProcessingTopUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Proceed to Pay
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Balance cards */}
      <div className="border-2 border-foreground grid grid-cols-1 md:grid-cols-2">
        <div className="p-6 md:border-r-2 border-foreground border-b-2 md:border-b-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Available Balance</span>
            <WalletIcon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-4xl font-display font-black font-mono">
            {isLoadingBalance ? "—" : `₹${currentBalance.toFixed(2)}`}
          </div>
          <p className="text-xs text-muted-foreground mt-2 normal-case tracking-normal font-normal">Used for generation and delivery fees</p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Generation Limit</span>
            <FileBadge className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-4xl font-display font-black font-mono">
            {isLoadingBalance ? "—" : generationLimit.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground mt-2 normal-case tracking-normal font-normal">Info-only updates are free</p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="border-2 border-foreground">
        <div className="border-b-2 border-foreground px-5 py-3 flex items-center gap-2 bg-muted">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Transaction History</span>
        </div>

        {isLoadingHistory ? (
          <div className="h-32 flex items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">Loading...</div>
        ) : ledgerHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 border-2 border-foreground flex items-center justify-center mb-4">
              <IndianRupee className="w-5 h-5" />
            </div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground mt-1 normal-case tracking-normal font-normal">Top-ups and generation fees will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-foreground bg-muted">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Date</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Description</th>
                  {isAdmin && <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">By</th>}
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Type</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Amount</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerHistory.map((ledger: any) => (
                  <tr key={ledger.id} className="border-b border-foreground/10 hover:bg-muted transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono whitespace-nowrap">
                      {format(new Date(ledger.createdAt), "dd MMM yyyy, HH:mm")}
                    </td>
                    <td className="px-4 py-3 normal-case tracking-normal font-normal">{ledger.description}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                        {ledger.userId ? String(ledger.userId).slice(0, 8) + "…" : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${
                        ledger.type === 'topup'
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-foreground bg-background text-foreground'
                      }`}>
                        {ledger.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${ledger.type === 'topup' ? '' : 'text-muted-foreground'}`}>
                      {ledger.amount > 0 ? '+' : '-'}₹{Math.abs(ledger.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                      ₹{ledger.balanceAfter.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
