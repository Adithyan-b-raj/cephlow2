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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 md:p-12 shadow-xl shadow-primary/20">
        <img 
          src={`${import.meta.env.BASE_URL}images/dashboard-hero.png`}
          alt="Hero background"
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30"
        />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 tracking-tight">
            Automate your certificates effortlessly.
          </h1>
          <p className="text-primary-foreground/80 text-lg md:text-xl mb-8 max-w-xl">
            Merge Google Sheets data into beautiful Google Slides templates and send personalized emails in minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="outline" className="bg-white/20 border-white/30 text-white hover:bg-white/30 hover-elevate font-semibold rounded-xl px-6 h-12">
              <Link href="/templates/new">
                <Sparkles className="mr-2 w-5 h-5" />
                New Template
              </Link>
            </Button>
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 hover-elevate font-semibold rounded-xl px-8 h-12 shadow-lg shadow-black/10">
              <Link href="/batches/new">
                <FilePlus2 className="mr-2 w-5 h-5" />
                New Batch
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Batches</CardTitle>
            <Presentation className="w-5 h-5 text-primary/70" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">
              {batchesLoading ? "..." : batches.length}
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-shadow border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Certificates Generated</CardTitle>
            <Award className="w-5 h-5 text-accent-foreground/70" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold">
              {certsLoading ? "..." : totalCerts}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Successfully Sent</CardTitle>
            <Send className="w-5 h-5 text-green-500/70" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display font-bold text-green-600 dark:text-green-400">
              {certsLoading ? "..." : sentCerts}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold">Recent Batches</h2>
          <Button variant="ghost" asChild className="hover-elevate">
            <Link href="/history">View All History</Link>
          </Button>
        </div>

        <div className="grid gap-4">
          {batchesLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">Loading batches...</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border/50 border-dashed">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No batches yet</h3>
              <p className="text-muted-foreground mt-1">Create your first certificate batch to get started.</p>
            </div>
          ) : (
            batches.slice(0, 5).map(batch => (
              <Link key={batch.id} href={`/batches/${batch.id}`}>
                <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group group-hover:bg-primary/5">
                  <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                        {batch.name}
                      </h3>
                      <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                        <span className="flex items-center gap-1.5"><Presentation className="w-4 h-4"/> {batch.templateName}</span>
                        <span className="flex items-center gap-1.5 opacity-50">•</span>
                        <span>{format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-medium">{batch.sentCount} / {batch.totalCount}</div>
                        <div className="text-xs text-muted-foreground">Sent</div>
                      </div>
                      <Badge 
                        variant={batch.status === 'sent' ? 'default' : batch.status === 'failed' ? 'destructive' : 'secondary'}
                        className="capitalize"
                      >
                        {batch.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
