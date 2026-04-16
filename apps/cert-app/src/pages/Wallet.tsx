import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wallet as WalletIcon, IndianRupee, History, Plus } from "lucide-react";

export default function Wallet() {
  // TODO: Fetch from actual endpoints in Phase 2
  const currentBalance = 0;
  const isLoading = false;
  const ledgerHistory: any[] = [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Prepaid Wallet</h1>
          <p className="text-muted-foreground mt-1">
            Manage your credits for certificate generation and WhatsApp delivery.
          </p>
        </div>
        <button
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          onClick={() => {
            // TODO: Open TopUpModal
            alert("TopUp Modal coming soon in Phase 2!");
          }}
        >
          <Plus className="w-4 h-4" />
          Add Credits
        </button>
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
                {isLoading ? "..." : `₹${currentBalance.toFixed(2)}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Used for generation and delivery fees
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
            {isLoading ? (
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
              <div className="rounded-md border">
                {/* TODO: Implement LedgerTable Component */}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
