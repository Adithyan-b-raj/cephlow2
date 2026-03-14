import { useState } from "react";
import { Link } from "wouter";
import { useListCertificates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, CheckCircle2, Clock, MailCheck, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function History() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListCertificates();

  const certificates = data?.certificates || [];
  
  const filteredCerts = certificates.filter(c => 
    c.recipientName.toLowerCase().includes(search.toLowerCase()) || 
    c.recipientEmail.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400';
      case 'generated': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Certificate History</h1>
          <p className="text-muted-foreground mt-1">View all individual certificates generated across all batches.</p>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <div className="p-4 border-b flex items-center gap-4 bg-secondary/30">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or email..." 
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
                <TableHead>Recipient</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredCerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                    No certificates found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCerts.map(cert => (
                  <TableRow key={cert.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{cert.recipientName}</TableCell>
                    <TableCell className="text-muted-foreground">{cert.recipientEmail}</TableCell>
                    <TableCell>
                      <Link href={`/batches/${cert.batchId}`} className="text-primary hover:underline font-medium">
                        Batch #{cert.batchId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(cert.status)}>
                        {cert.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {cert.status === 'generated' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {cert.status === 'sent' && <MailCheck className="w-3 h-3 mr-1" />}
                        {cert.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                        {cert.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(cert.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      {cert.slideUrl ? (
                        <Button variant="ghost" size="sm" asChild className="hover-elevate">
                          <a href={cert.slideUrl} target="_blank" rel="noopener noreferrer">View</a>
                        </Button>
                      ) : '-'}
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
