import { useState } from "react";
import { Link } from "wouter";
import { useListBatches } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, CheckCircle2, Clock, MailCheck, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function History() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListBatches();

  const batches = data?.batches || [];

  const filteredBatches = batches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.templateName.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400';
      case 'generated': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      case 'partial': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'generating':
      case 'sending': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Batch History</h1>
          <p className="text-muted-foreground mt-1">View all certificate batches you have created.</p>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <div className="p-4 border-b flex items-center gap-4 bg-secondary/30">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by batch name or template..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Batch Name</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    No batches found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredBatches.map(batch => (
                  <TableRow key={batch.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{batch.name}</TableCell>
                    <TableCell className="text-muted-foreground">{batch.templateName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {batch.sentCount} / {batch.totalCount} sent
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(batch.status)}>
                        {batch.status === 'draft' && <Clock className="w-3 h-3 mr-1" />}
                        {batch.status === 'generating' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {batch.status === 'generated' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {batch.status === 'sent' && <MailCheck className="w-3 h-3 mr-1" />}
                        {batch.status === 'partial' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {batch.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(batch.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/batches/${batch.id}`} className="text-primary hover:underline font-medium text-sm">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
