import { useListBatches } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, IndianRupee, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

const COST_PER_MESSAGE = 0.12;

export default function Spending() {
  const { data: batchesRes, isLoading } = useListBatches();
  const batches = batchesRes?.batches || [];

  const batchesWithWhatsapp = batches.filter(
    (b) => b.whatsappSentCount && b.whatsappSentCount > 0
  );

  const totalMessages = batchesWithWhatsapp.reduce(
    (sum, b) => sum + (b.whatsappSentCount || 0),
    0
  );
  const totalSpent = totalMessages * COST_PER_MESSAGE;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">WhatsApp Spending</h1>
        <p className="text-muted-foreground mt-1">
          Cost breakdown for certificates sent via WhatsApp (₹{COST_PER_MESSAGE.toFixed(2)} per message)
        </p>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Messages Sent</CardTitle>
            <MessageCircle className="w-5 h-5 text-muted-foreground/50" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">
              {isLoading ? "..." : totalMessages}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Amount Spent</CardTitle>
            <IndianRupee className="w-5 h-5 text-muted-foreground/50" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">
              {isLoading ? "..." : `₹${totalSpent.toFixed(2)}`}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Batches via WhatsApp</CardTitle>
            <TrendingUp className="w-5 h-5 text-muted-foreground/50" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">
              {isLoading ? "..." : batchesWithWhatsapp.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-display font-bold mb-4">Per-Batch Breakdown</h2>

        {isLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">Loading...</div>
        ) : batchesWithWhatsapp.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-sm border border-dashed">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">No WhatsApp messages sent yet</h3>
            <p className="text-muted-foreground mt-1">
              Spending will appear here once you send certificates via WhatsApp.
            </p>
          </div>
        ) : (
          <div className="rounded-sm border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Batch</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Messages</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batchesWithWhatsapp.map((batch) => {
                  const cost = (batch.whatsappSentCount || 0) * COST_PER_MESSAGE;
                  return (
                    <tr key={batch.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/batches/${batch.id}`} className="font-medium text-foreground hover:underline">
                          {batch.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {format(new Date(batch.createdAt), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{batch.whatsappSentCount}</td>
                      <td className="px-4 py-3 text-right font-semibold">₹{cost.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/50 border-t border-border">
                <tr>
                  <td className="px-4 py-3 font-bold" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right font-bold">{totalMessages}</td>
                  <td className="px-4 py-3 text-right font-bold">₹{totalSpent.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
