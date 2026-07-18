import { useLocation } from "wouter";
import {
  useListSpreadsheets,
  useDeleteSpreadsheet,
  getListSpreadsheetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SpreadsheetsListPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListSpreadsheets();

  const { mutate: del, isPending: deleting } = useDeleteSpreadsheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSpreadsheetsQueryKey() });
        toast({ title: "Spreadsheet deleted" });
      },
      onError: (err: any) =>
        toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  const sheets = data?.spreadsheets ?? [];

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-8 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold mb-1">My Spreadsheets</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Data tables you can use as batch data sources.
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button className="flex-1 sm:flex-none" onClick={() => setLocation("/spreadsheets/new")}>
            <Plus className="w-4 h-4 mr-1.5" /> New Spreadsheet
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : sheets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="bg-primary/10 text-primary p-4 rounded-2xl">
              <Table2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold">No spreadsheets yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Create a spreadsheet to store your recipient data — then select it when creating a batch instead of linking Google Sheets.
            </p>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => setLocation("/spreadsheets/new")}>
                <Plus className="w-4 h-4 mr-1.5" /> Create your first spreadsheet
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sheets.map((s: any) => (
            <Card
              key={s.id}
              className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setLocation(`/spreadsheets/${s.id}`)}
            >
              <div className="aspect-[4/3] bg-secondary flex items-center justify-center">
                <Table2 className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.columnCount ?? s.columns?.length ?? 0} column{(s.columnCount ?? s.columns?.length ?? 0) !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLocation(`/spreadsheets/${s.id}`);
                  }}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  disabled={deleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${s.name}"?`)) del({ id: s.id });
                  }}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
