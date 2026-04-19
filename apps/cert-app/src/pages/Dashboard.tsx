import { Link } from "wouter";
import { useListBatches, useListCertificates } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilePlus2, Presentation, Send, Award, Clock, Sparkles } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: batchesRes, isLoading: batchesLoading } = useListBatches();
  const { data: certsRes, isLoading: certsLoading } = useListCertificates();

  const batches = batchesRes?.batches || [];
  const totalCerts = certsRes?.total || 0;
  const sentCerts = certsRes?.certificates?.filter(c => c.status === "sent").length || 0;

  return (
    <div className="space-y-8">

      {/* Hero */}
      <div className="bg-foreground text-background p-8 md:p-12 border-2 border-foreground">
        <div className="max-w-2xl">
          <p className="text-[10px] tracking-widest uppercase text-background/50 mb-3">Cephlow Automation</p>
          <h1 className="text-4xl md:text-5xl font-display font-black mb-4 tracking-tight text-background normal-case">
            Automate your certificates effortlessly.
          </h1>
          <p className="text-background/60 text-sm mb-8 max-w-xl font-normal normal-case tracking-normal">
            Merge Google Sheets data into Google Slides templates and send personalized emails in minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="outline" className="border-2 border-background/40 text-background bg-transparent hover:bg-background/10 font-bold uppercase tracking-widest text-xs px-6 h-11">
              <Link href="/templates/new">
                <Sparkles className="mr-2 w-4 h-4" />
                New Template
              </Link>
            </Button>
            <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90 font-bold uppercase tracking-widest text-xs px-8 h-11">
              <Link href="/batches/new">
                <FilePlus2 className="mr-2 w-4 h-4" />
                New Batch
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-0 grid-cols-1 md:grid-cols-3 border-2 border-foreground">
        {[
          { label: "Total Batches", value: batchesLoading ? "—" : batches.length, icon: Presentation },
          { label: "Certs Generated", value: certsLoading ? "—" : totalCerts, icon: Award },
          { label: "Successfully Sent", value: certsLoading ? "—" : sentCerts, icon: Send },
        ].map((stat, i) => (
          <div key={stat.label} className={`p-6 ${i < 2 ? "md:border-r-2 border-foreground" : ""} border-b-2 md:border-b-0 border-foreground last:border-b-0`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-4xl font-display font-black">{String(stat.value)}</div>
          </div>
        ))}
      </div>

      {/* Recent Batches */}
      <div>
        <div className="flex items-center justify-between mb-4 border-b-2 border-foreground pb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest">Recent Batches</h2>
          <Button variant="ghost" asChild className="text-xs uppercase tracking-widest font-bold h-8 px-3 hover:bg-muted">
            <Link href="/history">View All →</Link>
          </Button>
        </div>

        <div className="border-2 border-foreground">
          {batchesLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-xs uppercase tracking-widest">Loading...</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
              <p className="text-xs uppercase tracking-widest text-muted-foreground">No batches yet</p>
              <p className="text-xs text-muted-foreground mt-1 normal-case tracking-normal">Create your first certificate batch to get started.</p>
            </div>
          ) : (
            batches.slice(0, 5).map((batch, i) => (
              <Link key={batch.id} href={`/batches/${batch.id}`}>
                <div className={`p-5 flex items-center justify-between gap-4 flex-wrap cursor-pointer hover:bg-muted transition-colors ${i > 0 ? "border-t-2 border-foreground" : ""}`}>
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="font-bold text-sm uppercase tracking-wide">{batch.name}</h3>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3 normal-case tracking-normal font-normal">
                      <span className="flex items-center gap-1.5"><Presentation className="w-3 h-3"/> {batch.templateName}</span>
                      <span className="opacity-40">·</span>
                      <span>{format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-bold">{batch.sentCount} / {batch.totalCount}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sent</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`uppercase text-[10px] tracking-widest font-bold ${
                        batch.status === 'sent'
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-foreground border-foreground'
                      }`}
                    >
                      {batch.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
