import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSpreadsheet,
  useCreateSpreadsheet,
  useUpdateSpreadsheet,
  getListSpreadsheetsQueryKey,
} from "@workspace/api-client-react";
import { SpreadsheetEditorUI, type SheetData } from "@/components/spreadsheet-editor/SpreadsheetEditorUI";

const DEFAULT_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
const DEFAULT_ROW_COUNT = 50;
const DEFAULT_FIRST_ROW_VALUES: Record<string, string> = { A: "Name", B: "Position", C: "Email", D: "Phone Number" };

function createEmptyGrid(): SheetData {
  const empty: Record<string, string> = {};
  DEFAULT_COLS.forEach((c) => (empty[c] = ""));
  const firstRow: Record<string, string> = { ...empty, ...DEFAULT_FIRST_ROW_VALUES };
  return {
    columns: DEFAULT_COLS,
    rows: [firstRow, ...Array.from({ length: DEFAULT_ROW_COUNT - 1 }, () => ({ ...empty }))],
  };
}
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function SpreadsheetEditorPage() {
  const [, params] = useRoute<{ id: string }>("/spreadsheets/:id");
  const isNew = !params || params.id === "new";
  const id = isNew ? "" : params!.id;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: existing, isLoading } = useGetSpreadsheet(id, {
    query: { enabled: !isNew && !!id },
  } as any);

  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (isNew && !sheetData) {
      setSheetData(createEmptyGrid());
      setName("");
    }
  }, [isNew, sheetData]);

  useEffect(() => {
    if (existing && !sheetData) {
      setSheetData({
        columns: existing.columns ?? [],
        rows: existing.rows ?? [],
      });
      setName(existing.name);
    }
  }, [existing, sheetData]);

  const { mutate: createSheet, isPending: creating } = useCreateSpreadsheet({
    mutation: {
      onSuccess: (data: { id: string }) => {
        qc.invalidateQueries({ queryKey: getListSpreadsheetsQueryKey() });
        toast({ title: "Spreadsheet saved" });
        setLocation(`/spreadsheets/${data.id}`);
      },
      onError: (err: any) =>
        toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
    },
  });

  const { mutate: updateSheet, isPending: updating } = useUpdateSpreadsheet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSpreadsheetsQueryKey() });
        toast({ title: "Spreadsheet saved" });
      },
      onError: (err: any) =>
        toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
    },
  });

  const saving = creating || updating;

  const handleSave = ({ name: n, data }: { name: string; data: SheetData }) => {
    if (!n) return;
    setName(n);
    setSheetData(data);
    if (isNew) {
      createSheet({ data: { name: n, columns: data.columns, rows: data.rows } });
    } else {
      updateSheet({ id, data: { name: n, columns: data.columns, rows: data.rows } });
    }
  };

  if (!isNew && isLoading && !sheetData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const queryParams = new URLSearchParams(window.location.search);
  const returnTo = queryParams.get("returnTo");

  if (!sheetData) return null;

  return (
    <SpreadsheetEditorUI
      initialData={sheetData}
      initialName={name}
      saving={saving}
      onSave={handleSave}
      onBack={() => setLocation(returnTo || "/spreadsheets")}
    />
  );
}
