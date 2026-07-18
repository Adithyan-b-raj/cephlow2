import { Button } from "@/components/ui/button";
import { Loader2, Plus, Table2 } from "lucide-react";
import { useListSpreadsheets } from "@workspace/api-client-react";

interface Props {
  spreadsheetId: string;
  spreadsheetName: string;
  onPickSpreadsheet: (id: string, name: string) => void;
}

export function StepDataSource({
  spreadsheetId,
  spreadsheetName,
  onPickSpreadsheet,
}: Props) {
  const { data: spreadsheetsRes, isLoading: spreadsheetsLoading } = useListSpreadsheets();
  const spreadsheets = spreadsheetsRes?.spreadsheets ?? [];

  return (
    <div className="space-y-3 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold mb-1 sm:mb-2">Select Data Source</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          Choose where your recipient data comes from.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Pick a saved spreadsheet or create a new one.</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.open("/spreadsheets/new", "_blank")}
          >
            <Plus className="w-3.5 h-3.5" /> New Spreadsheet
          </Button>
        </div>

        {spreadsheetsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading spreadsheets…
          </div>
        ) : spreadsheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-border rounded-xl text-center">
            <Table2 className="w-10 h-10 text-muted-foreground" />
            <div>
              <p className="font-bold uppercase tracking-widest text-sm">No Spreadsheets Yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Create a spreadsheet from the Spreadsheets page first.
              </p>
            </div>
            <Button onClick={() => window.open("/spreadsheets/new", "_blank")}>
              <Plus className="w-4 h-4 mr-1.5" /> Create Spreadsheet
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
            {spreadsheets.map((s: any) => {
              const isSelected = spreadsheetId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onPickSpreadsheet(s.id, s.name)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                      : "border-border hover:border-primary/40 hover:bg-accent/40"
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    <Table2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground line-clamp-1">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.columnCount ?? s.columns?.length ?? 0} columns
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {spreadsheetId && (
          <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border-2 border-primary bg-primary/5 ring-4 ring-primary/10 max-w-sm">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground line-clamp-1">{spreadsheetName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Inbuilt spreadsheet selected</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
