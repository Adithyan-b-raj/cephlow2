import { useState, useEffect, useCallback } from "react";
import {
  Wallet as WalletIcon, IndianRupee, History, Plus, Loader2,
  FileBadge, Users, Coins, ArrowRightLeft, Copy, Check, ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { Link } from "wouter";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// @ts-expect-error — cashfree-js ships no type declarations
import { load } from "@cashfreepayments/cashfree-js";
import {
  useGetWalletBalance, useGetWalletHistory, useCreateOrder, customFetch,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/use-workspace";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transfer {
  id: string;
  direction: "in" | "out";
  amount: number;
  note: string;
  fromWorkspace: { name: string; code: string };
  toWorkspace:   { name: string; code: string };
  createdAt: string;
}

interface ResolvedWorkspace { id: string; name: string; code: string }

// ─── Send Credits dialog ──────────────────────────────────────────────────────

function SendCreditsDialog({ onSent }: { onSent: () => void }) {
  const { toast } = useToast();
  const [open, setOpen]           = useState(false);
  const [code, setCode]           = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved]   = useState<ResolvedWorkspace | null>(null);
  const [resolveErr, setResolveErr] = useState("");
  const [amount, setAmount]       = useState("");
  const [note, setNote]           = useState("");
  const [sending, setSending]     = useState(false);

  const reset = () => {
    setCode(""); setResolved(null); setResolveErr("");
    setAmount(""); setNote(""); setSending(false); setResolving(false);
  };

  const handleOpenChange = (v: boolean) => { setOpen(v); if (!v) reset(); };

  const lookupCode = useCallback(async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (c.length < 8) { setResolved(null); setResolveErr(""); return; }
    setResolving(true); setResolveErr(""); setResolved(null);
    try {
      const data = await customFetch<ResolvedWorkspace>(`/api/wallet/resolve?code=${c}`);
      setResolved(data);
    } catch (err: any) {
      setResolveErr(err?.message ?? "Workspace not found");
    } finally {
      setResolving(false);
    }
  }, []);

  const handleSend = async () => {
    const amt = Number(amount);
    if (!resolved || isNaN(amt) || amt <= 0 || amt !== Math.floor(amt)) return;
    setSending(true);
    try {
      await customFetch("/api/wallet/send", {
        method: "POST",
        body: JSON.stringify({ toCode: resolved.code, amount: amt, note: note.trim() }),
      });
      toast({ title: `${amt} credits sent to ${resolved.name}` });
      setOpen(false);
      reset();
      onSent();
    } catch (err: any) {
      toast({ title: "Transfer failed", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="font-bold uppercase tracking-widest text-xs h-10 gap-2 border-2">
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Send Credits
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-2 border-foreground">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-widest">Send Credits</DialogTitle>
          <DialogDescription className="normal-case tracking-normal font-normal">
            Transfer balance to any workspace using their transfer code.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {/* Recipient code */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest">Recipient Transfer Code</label>
            <div className="flex gap-2">
              <Input
                className="font-mono uppercase tracking-widest border-2"
                placeholder="e.g. A1B2C3D4"
                maxLength={8}
                value={code}
                onChange={e => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
                  setCode(v);
                  if (v.length === 8) lookupCode(v);
                  else { setResolved(null); setResolveErr(""); }
                }}
              />
            </div>
            {resolving && <p className="text-[10px] text-muted-foreground">Looking up…</p>}
            {resolved && (
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest">
                ✓ {resolved.name}
              </p>
            )}
            {resolveErr && (
              <p className="text-[10px] text-destructive uppercase tracking-widest">{resolveErr}</p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest">Amount (Credits)</label>
            <Input
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 100"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="font-mono border-2 text-lg"
              disabled={!resolved}
            />
            <div className="flex gap-2 mt-1">
              {[50, 100, 500].map(a => (
                <Button
                  key={a} size="sm" variant="outline"
                  className="border-2 font-bold text-[10px] uppercase tracking-widest h-7"
                  disabled={!resolved}
                  onClick={() => setAmount(String(a))}
                >
                  {a}
                </Button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest">Note (optional)</label>
            <Input
              placeholder="e.g. For Q3 certificates"
              maxLength={200}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="border-2 normal-case"
              disabled={!resolved}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-2">
          <Button variant="ghost" onClick={() => setOpen(false)} className="uppercase tracking-widest text-xs font-bold">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!resolved || !amount || Number(amount) <= 0 || sending}
            className="uppercase tracking-widest text-xs font-bold border-2"
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send {amount || "—"} credits
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfer code display with copy button ───────────────────────────────────

function TransferCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors group"
      title="Copy transfer code"
    >
      <span className="border border-border px-1.5 py-0.5 group-hover:border-foreground transition-colors">{code}</span>
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── Transfer history section ─────────────────────────────────────────────────

function TransferHistory({ workspaceId }: { workspaceId: string }) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const limit = 10;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const d = await customFetch<{ transfers: Transfer[]; total: number }>(
        `/api/wallet/transfers?page=${p}&limit=${limit}`
      );
      setTransfers(d.transfers ?? []);
      setTotal(d.total ?? 0);
      setPage(p);
    } catch {
      // silent — not critical
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="border-2 border-foreground">
      <div className="border-b-2 border-foreground px-5 py-3 flex items-center gap-2 bg-muted">
        <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Credit Transfers</span>
      </div>

      {loading ? (
        <div className="h-24 flex items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
          Loading…
        </div>
      ) : transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ArrowRightLeft className="w-8 h-8 text-muted-foreground opacity-20 mb-3" />
          <p className="text-xs uppercase tracking-widest text-muted-foreground">No transfers yet</p>
          <p className="text-xs text-muted-foreground mt-1 normal-case tracking-normal font-normal">
            Send credits to other workspaces or receive them here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-foreground bg-muted">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Date</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">From → To</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Note</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.id} className="border-b border-foreground/10 hover:bg-muted transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono whitespace-nowrap">
                      {format(new Date(t.createdAt), "dd MMM yyyy, HH:mm")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {t.direction === "out"
                          ? <ArrowUpRight className="w-3 h-3 text-red-500 shrink-0" />
                          : <ArrowDownLeft className="w-3 h-3 text-green-600 shrink-0" />}
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {t.fromWorkspace.name} → {t.toWorkspace.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground normal-case tracking-normal font-normal max-w-[180px] truncate">
                      {t.note || "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${
                      t.direction === "in" ? "text-green-600" : "text-red-500"
                    }`}>
                      {t.direction === "in" ? "+" : "-"}{t.amount.toLocaleString()} credits
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-3 border-t border-foreground/10">
              <button
                disabled={page === 1}
                onClick={() => load(page - 1)}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-[10px] font-mono text-muted-foreground">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Wallet() {
  const { activeWorkspace, workspaces, role, reload } = useWorkspace();
  const isAdmin = role === "owner" || role === "admin";
  const memberCount = activeWorkspace
    ? workspaces.find((w) => w.id === activeWorkspace.id) ? workspaces.length : 1
    : 1;

  const { data: balanceData, isLoading: isLoadingBalance, refetch: refetchBalance } = useGetWalletBalance();
  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useGetWalletHistory();
  const { mutateAsync: createOrder } = useCreateOrder() as any;
  const { toast } = useToast();

  const [isTopUpOpen, setIsTopUpOpen]           = useState(false);
  const [topUpAmount, setTopUpAmount]           = useState<string>("500");
  const [isProcessingTopUp, setIsProcessingTopUp] = useState(false);
  const [transferKey, setTransferKey]           = useState(0);



  const currentBalance  = balanceData?.currentBalance ?? 0;
  const transferCode    = (balanceData as any)?.transferCode as string | null ?? null;
  const ledgerHistory   = historyData?.ledgers || [];
  const RATE            = Number((balanceData as any)?.costs?.generation ?? 1.0);
  const generationLimit = Math.floor(currentBalance / RATE);

  const minRechargeAmount = Number((balanceData as any)?.costs?.minRechargeAmount ?? 100);
  const creditsPerRupee = Number((balanceData as any)?.costs?.creditsPerRupee ?? 10);

  const handleTopUp = async () => {
    const amount = Number(topUpAmount);
    if (isNaN(amount) || amount < minRechargeAmount) {
      toast({ title: "Invalid amount", description: `Minimum recharge amount is ₹${minRechargeAmount}.`, variant: "destructive" });
      return;
    }
    try {
      setIsProcessingTopUp(true);
      const { payment_session_id, order_id } = await createOrder({ data: { amount } } as any);
      const cashfree = await load({ mode: import.meta.env.VITE_CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox" });
      await cashfree.checkout({ paymentSessionId: payment_session_id, redirectTarget: "_modal" });
      setIsTopUpOpen(false);
      try {
        const result = await customFetch<{ status: string; credited: boolean; amount?: number }>(
          `/api/payments/verify`,
          { method: "POST", body: JSON.stringify({ order_id }) }
        );
        if (result.credited) {
          toast({ title: "Payment successful", description: `₹${result.amount} received. Your credit balance has been updated.` });
        } else if (result.status === "already_processed") {
          toast({ title: "Payment already processed", description: "Your wallet has been credited." });
        } else {
          toast({ title: "Payment pending", description: "If you completed payment, your balance will update shortly.", variant: "destructive" });
        }
      } catch {
        toast({ title: "Verifying payment…", description: "Your balance will update shortly." });
      }
      setTimeout(() => { refetchBalance(); refetchHistory(); }, 1500);
    } catch (error: any) {
      toast({ title: "Top-up failed", description: error.data?.error || "Could not connect to payment gateway.", variant: "destructive" });
    } finally {
      setIsProcessingTopUp(false);
    }
  };

  const handleSent = () => {
    refetchBalance();
    refetchHistory();
    reload();
    setTransferKey(k => k + 1);
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-2 border-foreground pb-4">
        <div>
          <h1 className="text-2xl font-display font-black">Prepaid Wallet</h1>
          <p className="text-xs text-muted-foreground mt-1 normal-case tracking-normal font-normal">Manage credits for certificate generation.</p>
          {activeWorkspace && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-widest">
                <Users className="w-3 h-3" />
                Shared with {memberCount} member{memberCount !== 1 ? "s" : ""} · {activeWorkspace.name}
              </p>
              {transferCode && (
                <TransferCode code={transferCode} />
              )}
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <SendCreditsDialog onSent={handleSent} />
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
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest">Amount (INR)</label>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Rate: 1 INR = {creditsPerRupee} Credits
                      </span>
                    </div>
                    <Input type="number" placeholder={`Min ₹${minRechargeAmount}`} value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} min={minRechargeAmount} className="text-lg font-mono border-2" />
                    {Number(topUpAmount) < minRechargeAmount && (
                      <p className="text-[10px] text-destructive uppercase tracking-widest font-bold">
                        Minimum top-up amount is ₹{minRechargeAmount}
                      </p>
                    )}
                    {Number(topUpAmount) >= minRechargeAmount && !isNaN(Number(topUpAmount)) && (
                      <p className="text-[10px] text-green-600 uppercase tracking-widest font-bold">
                        You will receive: {(Number(topUpAmount) * creditsPerRupee).toLocaleString()} credits
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[100, 500, 1000].map((amt) => (
                      <Button key={amt} variant="outline" type="button" onClick={() => setTopUpAmount(amt.toString())} className="border-2 font-bold uppercase tracking-widest text-xs" disabled={amt < minRechargeAmount}>
                        ₹{amt}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pb-2">
                  <Button variant="ghost" onClick={() => setIsTopUpOpen(false)} className="uppercase tracking-widest text-xs font-bold">Cancel</Button>
                  <Button onClick={handleTopUp} disabled={isProcessingTopUp || Number(topUpAmount) < minRechargeAmount || isNaN(Number(topUpAmount))} className="uppercase tracking-widest text-xs font-bold border-2">
                    {isProcessingTopUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Proceed to Pay
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
            {isLoadingBalance ? "—" : `${currentBalance.toLocaleString()} credits`}
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

      {/* Workspace Cost Rates breakdown */}
      <div className="border-2 border-foreground p-5 bg-muted/30">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5" />
          Workspace Cost Rates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-foreground/10 p-3 bg-background">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Certificate Generation</p>
            <p className="text-lg font-black font-mono mt-1">{(balanceData as any)?.costs?.generation ?? 1.0} credits</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Per cert generated/resumed</p>
          </div>
          <div className="border border-foreground/10 p-3 bg-background">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email Delivery</p>
            <p className="text-lg font-black font-mono mt-1">{(balanceData as any)?.costs?.email ?? 1.0} credits</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Per Gmail email sent</p>
          </div>
          <div className="border border-foreground/10 p-3 bg-background">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">WhatsApp Delivery</p>
            <p className="text-lg font-black font-mono mt-1">{(balanceData as any)?.costs?.whatsapp ?? 1.0} credits</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Per Meta WhatsApp sent</p>
          </div>
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
                        ledger.type === "topup" || ledger.type === "transfer_in"
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground bg-background text-foreground"
                      }`}>
                        {ledger.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${
                      ledger.amount > 0 ? "" : "text-muted-foreground"
                    }`}>
                      {ledger.amount > 0 ? "+" : "-"}{Math.abs(ledger.amount).toLocaleString()} credits
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                      {ledger.balanceAfter.toLocaleString()} credits
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credit transfers (blockchain-style) */}
      {activeWorkspace && (
        <TransferHistory key={transferKey} workspaceId={activeWorkspace.id} />
      )}

    </div>
  );
}
