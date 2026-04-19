import { useState } from "react";
import { Link } from "wouter";
import { useListBatches, useDeleteBatch, getListBatchesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

  const getStatusStyle = (status: string) => {
    if (status === 'sent') return 'bg-foreground text-background border-foreground';
    return 'bg-background text-foreground border-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-2 border-foreground pb-4">
        <div>
          <h1 className="text-2xl font-display font-black">Batch History</h1>
          <p className="text-xs text-muted-foreground mt-1 normal-case tracking-normal font-normal">All certificate batches you have created.</p>
        </div>
      </div>

      {/* Table container */}
      <div className="border-2 border-foreground">
        {/* Search bar */}
        <div className="p-3 border-b-2 border-foreground flex items-center gap-3 bg-muted">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search batches..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm p-0 h-auto placeholder:text-muted-foreground"
          />
        </div>

        {/* Mobile list */}
        <div className="sm:hidden divide-y-2 divide-foreground">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">No batches found</div>
          ) : filteredBatches.map(batch => (
            <div key={batch.id} className="flex items-center">
              <Link href={`/batches/${batch.id}`} className="flex-1">
                <div className="p-4 hover:bg-muted transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="font-bold text-sm uppercase tracking-wide">{batch.name}</span>
                    <Badge variant="outline" className={`shrink-0 text-[10px] uppercase tracking-widest ${getStatusStyle(batch.status)}`}>
                      {batch.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap normal-case tracking-normal font-normal">
                    <span>{batch.templateName}</span>
                    <span>·</span>
                    <span>{batch.sentCount}/{batch.totalCount} sent</span>
                    <span>·</span>
                    <span>{format(new Date(batch.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </Link>
              <Button variant="ghost" size="icon" className="mr-3 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(batch.id.toString())}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 border-foreground hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-foreground bg-muted">Batch Name</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-foreground bg-muted">Template</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-foreground bg-muted">Progress</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-foreground bg-muted">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-foreground bg-muted">Date</TableHead>
                <TableHead className="text-[10px] uppercase tracking-widest font-bold text-foreground bg-muted text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-xs uppercase tracking-widest text-muted-foreground">
                    No batches found
                  </TableCell>
                </TableRow>
              ) : filteredBatches.map(batch => (
                <TableRow key={batch.id} className="hover:bg-muted transition-colors border-b border-foreground/20">
                  <TableCell className="font-bold text-sm uppercase tracking-wide">{batch.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs normal-case tracking-normal font-normal">{batch.templateName}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{batch.sentCount} / {batch.totalCount}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-widest font-bold ${getStatusStyle(batch.status)}`}>
                      {batch.status === 'generating' || batch.status === 'sending'
                        ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        : batch.status === 'sent' ? <MailCheck className="w-3 h-3 mr-1" />
                        : batch.status === 'generated' ? <CheckCircle2 className="w-3 h-3 mr-1" />
                        : batch.status === 'partial' ? <AlertTriangle className="w-3 h-3 mr-1" />
                        : <Clock className="w-3 h-3 mr-1" />}
                      {batch.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{format(new Date(batch.createdAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/batches/${batch.id}`} className="text-xs font-bold uppercase tracking-widest hover:underline underline-offset-2">View</Link>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(batch.id.toString())}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="border-2 border-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase tracking-widest">Delete batch?</AlertDialogTitle>
            <AlertDialogDescription className="normal-case tracking-normal font-normal">
              This will permanently delete the batch and all its certificate records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="uppercase tracking-widest text-xs font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 uppercase tracking-widest text-xs font-bold"
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
