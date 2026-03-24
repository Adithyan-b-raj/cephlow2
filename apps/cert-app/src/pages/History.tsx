import { useState } from "react";
import { Link } from "wouter";
import { useListBatches, useDeleteBatch, getListBatchesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, CheckCircle2, Clock, MailCheck, AlertTriangle, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function History() {
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data, isLoading } = useListBatches();
  const queryClient = useQueryClient();
  const { mutate: deleteBatch, isPending: isDeleting } = useDeleteBatch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() });
        setDeleteId(null);
      },
    },
  });

  const batches = data?.batches || [];

  const filteredBatches = batches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.templateName.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-foreground text-background border-foreground';
      case 'generated': return 'bg-secondary text-secondary-foreground border-border';
      case 'partial': return 'bg-muted text-muted-foreground border-border';
      case 'generating':
      case 'sending': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-background text-muted-foreground border-border';
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

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-border">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No batches found.
            </div>
          ) : (
            filteredBatches.map(batch => (
              <div key={batch.id} className="flex items-center">
                <Link href={`/batches/${batch.id}`} className="flex-1">
                  <div className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="font-medium text-sm leading-snug">{batch.name}</span>
                      <Badge variant="outline" className={`shrink-0 ${getStatusColor(batch.status)}`}>
                        {batch.status === 'draft' && <Clock className="w-3 h-3 mr-1" />}
                        {batch.status === 'generating' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {batch.status === 'generated' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {batch.status === 'sent' && <MailCheck className="w-3 h-3 mr-1" />}
                        {batch.status === 'partial' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {batch.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>{batch.templateName}</span>
                      <span>•</span>
                      <span>{batch.sentCount} / {batch.totalCount} sent</span>
                      <span>•</span>
                      <span>{format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-2 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(batch.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Batch Name</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
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
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/batches/${batch.id}`} className="text-foreground hover:underline font-medium text-sm">
                          View
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(batch.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the batch and all its certificate records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={() => deleteId && deleteBatch({ batchId: deleteId })}
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
