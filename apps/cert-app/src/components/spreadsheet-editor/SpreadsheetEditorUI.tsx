import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getColumnName } from "@/lib/utils";
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

export interface SheetData {
  columns: string[];
  rows: Record<string, string>[];
}

interface CellPos { row: number; col: number }
interface SelectRange { start: CellPos; end: CellPos }

interface HistoryEntry {
  columns: string[];
  rows: Record<string, string>[];
}

interface Props {
  initialData: SheetData;
  initialName?: string;
  saving: boolean;
  onSave: (params: { name: string; data: SheetData }) => void;
  onBack: () => void;
}

const MAX_HISTORY = 50;
const ROW_GUTTER_FIT = 48;
const ACTION_COL_FIT = 40;

function getSelectionBounds(sel: SelectRange) {
  return {
    r1: Math.min(sel.start.row, sel.end.row),
    r2: Math.max(sel.start.row, sel.end.row),
    c1: Math.min(sel.start.col, sel.end.col),
    c2: Math.max(sel.start.col, sel.end.col),
  };
}

function isCellSelected(ri: number, ci: number, sel: SelectRange | null) {
  if (!sel) return false;
  const { r1, r2, c1, c2 } = getSelectionBounds(sel);
  return ri >= r1 && ri <= r2 && ci >= c1 && ci <= c2;
}

function selectionIsSingleCell(sel: SelectRange) {
  return sel.start.row === sel.end.row && sel.start.col === sel.end.col;
}

export function SpreadsheetEditorUI({
  initialData,
  initialName = "",
  saving,
  onSave,
  onBack,
}: Props) {
  const [name, setName] = useState(initialName);
  const [columns, setColumns] = useState<string[]>(initialData.columns);
  const [rows, setRows] = useState<Record<string, string>[]>(initialData.rows);
  const [activeCell, setActiveCell] = useState<CellPos | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [editingHeaderValue, setEditingHeaderValue] = useState("");
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [resizingCol, setResizingCol] = useState<{ colIdx: number; startX: number; startW: number } | null>(null);

  // Selection / drag state
  const [selection, setSelection] = useState<SelectRange | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<CellPos | null>(null);

  // Undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([{ columns: initialData.columns, rows: initialData.rows }]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const [zoom, setZoom] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  const fitZoom = useCallback(() => {
    const el = gridRef.current;
    if (!el || columns.length === 0) return;
    const availW = el.clientWidth;
    const tableW = ROW_GUTTER_FIT + columns.reduce((s, _, i) => s + (colWidths[i] ?? 160), 0) + ACTION_COL_FIT;
    const fit = Math.min(1, availW / tableW);
    setZoom(Math.max(0.3, fit));
  }, [columns, colWidths]);

  const { toast } = useToast();
  const savedRef = useRef({ name: initialName, columns: initialData.columns, rows: initialData.rows });
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  useEffect(() => {
    const s = savedRef.current;
    const dirty =
      name !== s.name ||
      JSON.stringify(columns) !== JSON.stringify(s.columns) ||
      JSON.stringify(rows) !== JSON.stringify(s.rows);
    setIsDirty(dirty);
  }, [name, columns, rows]);

  const tableRef = useRef<HTMLTableElement>(null);
  const activeCellRef = useRef<HTMLInputElement>(null);

  // Sync col widths when columns change
  useEffect(() => {
    setColWidths((prev) => {
      const next = [...prev];
      while (next.length < columns.length) next.push(160);
      return next.slice(0, columns.length);
    });
  }, [columns.length]);

  const pushHistory = useCallback(
    (newCols: string[], newRows: Record<string, string>[]) => {
      const entry = { columns: newCols, rows: newRows };
      setHistory((h) => {
        const trimmed = h.slice(0, historyIdx + 1);
        return [...trimmed, entry].slice(-MAX_HISTORY);
      });
      setHistoryIdx((i) => Math.min(i + 1, MAX_HISTORY - 1));
    },
    [historyIdx],
  );

  const applyHistoryEntry = (entry: HistoryEntry) => {
    setColumns(entry.columns);
    setRows(entry.rows);
    setActiveCell(null);
    setSelection(null);
  };

  const undo = useCallback(() => {
    const newIdx = historyIdx - 1;
    if (newIdx < 0) return;
    setHistoryIdx(newIdx);
    applyHistoryEntry(history[newIdx]);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    const newIdx = historyIdx + 1;
    if (newIdx >= history.length) return;
    setHistoryIdx(newIdx);
    applyHistoryEntry(history[newIdx]);
  }, [history, historyIdx]);

  // ── Global mouseup: end drag ──────────────────────────────────────────────
  useEffect(() => {
    const onUp = () => {
      if (isDragging) setIsDragging(false);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDragging]);

  // ── Keyboard shortcuts (undo/redo/save/delete) ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isEditing = target.tagName === "INPUT" || target.isContentEditable;

      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault(); undo();
      } else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault(); redo();
      } else if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!name.trim()) {
          toast({ title: "Please provide a name", description: "Enter a name for the spreadsheet before saving.", variant: "destructive" });
        } else {
          savedRef.current = { name: name.trim(), columns, rows };
          setIsDirty(false);
          onSave({ name: name.trim(), data: { columns, rows } });
        }
      } else if ((e.key === "Delete" || e.key === "Backspace") && !isEditing && selection) {
        // Clear all cells in the drag selection
        e.preventDefault();
        const { r1, r2, c1, c2 } = getSelectionBounds(selection);
        const newRows = rows.map((r, ri) => {
          if (ri < r1 || ri > r2) return r;
          const copy = { ...r };
          columns.forEach((col, ci) => {
            if (ci >= c1 && ci <= c2) copy[col] = "";
          });
          return copy;
        });
        setRows(newRows);
        pushHistory(columns, newRows);
      } else if (e.key === "Escape") {
        setActiveCell(null);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, name, columns, rows, onSave, selection, pushHistory]);

  // ── Paste TSV from clipboard ──────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && activeCell === null && editingHeader === null) return;
      if (editingHeader !== null) return;

      const text = e.clipboardData?.getData("text");
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (!lines.length) return;
      const tsvLines = lines.map((l) => l.split("\t"));
      const maxCols = Math.max(...tsvLines.map((r) => r.length));
      const isMultiCol = maxCols > 1;
      const isMultiLine = lines.length > 1;
      if (!isMultiCol && !isMultiLine && activeCell !== null) return;

      e.preventDefault();
      const anchor = activeCell ?? (selection ? selection.start : null);
      const newCols = [...columns];
      const startRow = anchor?.row ?? rows.length;
      const startCol = anchor?.col ?? 0;

      while (newCols.length < startCol + maxCols) {
        newCols.push(getColumnName(newCols.length));
      }

      const newRows = rows.map((r) => ({ ...r }));
      tsvLines.forEach((line, ri) => {
        const rowIdx = startRow + ri;
        if (rowIdx >= newRows.length) {
          const empty: Record<string, string> = {};
          newCols.forEach((c) => (empty[c] = ""));
          newRows.push(empty);
        }
        line.forEach((val, ci) => {
          const colIdx = startCol + ci;
          if (colIdx < newCols.length) {
            newRows[rowIdx][newCols[colIdx]] = val;
          }
        });
      });

      setColumns(newCols);
      setRows(newRows);
      pushHistory(newCols, newRows);
      setActiveCell(null);
      setSelection(null);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [columns, rows, activeCell, editingHeader, selection, pushHistory]);

  // ── Column operations ─────────────────────────────────────────────────────

  const addColumn = () => {
    const colName = getColumnName(columns.length);
    const newCols = [...columns, colName];
    const newRows = rows.map((r) => ({ ...r, [colName]: "" }));
    setColumns(newCols);
    setRows(newRows);
    pushHistory(newCols, newRows);
  };

  const deleteColumn = (colIdx: number) => {
    const col = columns[colIdx];
    const newCols = columns.filter((_, i) => i !== colIdx);
    const newRows = rows.map((r) => {
      const copy = { ...r };
      delete copy[col];
      return copy;
    });
    setColumns(newCols);
    setRows(newRows);
    pushHistory(newCols, newRows);
    setActiveCell(null);
    setSelection(null);
  };

  const renameColumn = (colIdx: number, newName: string) => {
    const oldName = columns[colIdx];
    if (!newName.trim() || newName === oldName) { setEditingHeader(null); return; }
    const trimmed = newName.trim();
    const newCols = columns.map((c, i) => (i === colIdx ? trimmed : c));
    const newRows = rows.map((r) => {
      const copy: Record<string, string> = {};
      for (const k of Object.keys(r)) copy[k === oldName ? trimmed : k] = r[k];
      return copy;
    });
    setColumns(newCols);
    setRows(newRows);
    pushHistory(newCols, newRows);
    setEditingHeader(null);
  };

  // ── Row operations ────────────────────────────────────────────────────────

  const addRow = () => {
    const empty: Record<string, string> = {};
    columns.forEach((c) => (empty[c] = ""));
    const newRows = [...rows, empty];
    setRows(newRows);
    pushHistory(columns, newRows);
  };

  const deleteRow = (rowIdx: number) => {
    const newRows = rows.filter((_, i) => i !== rowIdx);
    setRows(newRows);
    pushHistory(columns, newRows);
    setActiveCell(null);
    setSelection(null);
  };

  // ── Cell editing ──────────────────────────────────────────────────────────

  const startEdit = (row: number, col: number) => {
    setActiveCell({ row, col });
    setEditingValue(rows[row]?.[columns[col]] ?? "");
    setEditingHeader(null);
    setSelection(null);
  };

  const commitCell = useCallback(
    (row: number, col: number, value: string) => {
      const col_name = columns[col];
      const newRows = rows.map((r, i) => i === row ? { ...r, [col_name]: value } : r);
      setRows(newRows);
      pushHistory(columns, newRows);
    },
    [columns, rows, pushHistory],
  );

  const navigateCell = (row: number, col: number, dRow: number, dCol: number) => {
    const newRow = Math.max(0, Math.min(rows.length - 1, row + dRow));
    const newCol = Math.max(0, Math.min(columns.length - 1, col + dCol));
    setActiveCell({ row: newRow, col: newCol });
    setEditingValue(rows[newRow]?.[columns[newCol]] ?? "");
    setSelection(null);
  };

  const onCellKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitCell(row, col, editingValue);
      navigateCell(row, col, 1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitCell(row, col, editingValue);
      if (e.shiftKey) navigateCell(row, col, 0, -1);
      else navigateCell(row, col, 0, 1);
    } else if (e.key === "Escape") {
      setActiveCell(null);
      setSelection(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      commitCell(row, col, editingValue);
      navigateCell(row, col, -1, 0);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commitCell(row, col, editingValue);
      navigateCell(row, col, 1, 0);
    }
  };

  useEffect(() => { activeCellRef.current?.focus(); }, [activeCell]);

  // Auto-fit zoom on mount and when columns change significantly
  useEffect(() => {
    requestAnimationFrame(fitZoom);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag-select handlers ──────────────────────────────────────────────────

  const onCellMouseDown = (e: React.MouseEvent, ri: number, ci: number) => {
    if (e.button !== 0) return;
    // Commit any open cell edit first
    if (activeCell) {
      commitCell(activeCell.row, activeCell.col, editingValue);
      setActiveCell(null);
    }
    dragStartRef.current = { row: ri, col: ci };
    setSelection({ start: { row: ri, col: ci }, end: { row: ri, col: ci } });
    setIsDragging(true);
    e.preventDefault(); // prevent text selection
  };

  const onCellMouseEnter = (ri: number, ci: number) => {
    if (!isDragging || !dragStartRef.current) return;
    setSelection({ start: dragStartRef.current, end: { row: ri, col: ci } });
  };

  const onCellClick = (e: React.MouseEvent, ri: number, ci: number) => {
    // After a drag that only covers 1 cell, enter edit mode on click
    if (selection && selectionIsSingleCell(selection) &&
        selection.start.row === ri && selection.start.col === ci) {
      startEdit(ri, ci);
    }
  };

  // ── Column resize (pointer-capture approach — works across scroll/iframe) ──

  const onResizePointerDown = (e: React.PointerEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setResizingCol({ colIdx, startX: e.clientX, startW: colWidths[colIdx] ?? 160 });
  };

  const onResizePointerMove = (e: React.PointerEvent, colIdx: number) => {
    if (!resizingCol || resizingCol.colIdx !== colIdx) return;
    const delta = e.clientX - resizingCol.startX;
    const newW = Math.max(60, resizingCol.startW + delta);
    setColWidths((prev) => { const next = [...prev]; next[colIdx] = newW; return next; });
  };

  const onResizePointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setResizingCol(null);
  };

  // ── CSV import/export ─────────────────────────────────────────────────────

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (!lines.length) return;
      const parse = (line: string) => line.split(",").map((v) => v.replace(/^"(.*)"$/, "$1").replace(/""/g, '"'));
      const headers = parse(lines[0]);
      const dataRows = lines.slice(1).map((l) => {
        const vals = parse(l);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => (obj[h] = vals[i] ?? ""));
        return obj;
      });
      setColumns(headers);
      setRows(dataRows);
      pushHistory(headers, dataRows);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCSV = () => {
    const escape = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [columns.map(escape).join(","), ...rows.map((r) => columns.map((c) => escape(r[c] ?? "")).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${name || "spreadsheet"}.csv`;
    a.click();
  };

  const handleSaveClick = () => {
    if (!name.trim()) {
      toast({ title: "Please provide a name", description: "Enter a name for the spreadsheet before saving.", variant: "destructive" });
      return;
    }
    savedRef.current = { name: name.trim(), columns, rows };
    setIsDirty(false);
    onSave({ name: name.trim(), data: { columns, rows } });
  };

  const handleBackClick = () => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onBack();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const selBounds = selection ? getSelectionBounds(selection) : null;
  const ROW_GUTTER = ROW_GUTTER_FIT;
  const ACTION_COL = ACTION_COL_FIT;
  const tableWidth = ROW_GUTTER + columns.reduce((s, _, i) => s + (colWidths[i] ?? 160), 0) + ACTION_COL;

  return (
    <div
      className="h-screen w-screen flex flex-col bg-background overflow-hidden"
      onMouseDown={(e) => {
        // Clicking outside the table clears selection
        if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
          setSelection(null);
          if (activeCell) {
            commitCell(activeCell.row, activeCell.col, editingValue);
            setActiveCell(null);
          }
        }
      }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center border-b bg-background/95 backdrop-blur sticky top-0 z-30 flex-wrap gap-2 sm:gap-3 px-2 sm:px-4 py-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={handleBackClick} className="px-2 sm:px-3 shrink-0">
          <ArrowLeft className="w-4 h-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Back</span>
        </Button>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Spreadsheet name"
          className="h-8 flex-1 min-w-[140px] sm:flex-none sm:w-56"
        />

        <div className="h-6 w-px bg-border hidden sm:block" />

        <Button variant="outline" size="sm" onClick={addColumn} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Col
        </Button>
        <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" /> Row
        </Button>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <label title="Import CSV">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={importCSV} />
          <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm border border-input bg-background hover:bg-accent cursor-pointer text-foreground whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Import CSV</span>
          </span>
        </label>

        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 shrink-0" disabled={columns.length === 0}>
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Export CSV</span>
        </Button>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {selBounds
              ? `${selBounds.r2 - selBounds.r1 + 1}×${selBounds.c2 - selBounds.c1 + 1} selected`
              : `${rows.length} row${rows.length !== 1 ? "s" : ""} · ${columns.length} col${columns.length !== 1 ? "s" : ""}`}
          </span>
          <Button
            size="sm"
            onClick={handleSaveClick}
            disabled={saving}
            className="gap-1.5 shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div
        ref={gridRef}
        className="flex-1 overflow-auto relative"
        style={{ cursor: isDragging ? "cell" : undefined }}
      >
        {columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
            <div className="bg-primary/10 text-primary p-4 rounded-2xl">
              <Plus className="w-7 h-7" />
            </div>
            <div>
              <p className="font-semibold text-lg">No columns yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click <strong>+ Col</strong> to add your first column, or paste TSV data from Excel / Google Sheets.
              </p>
            </div>
            <Button onClick={addColumn}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Column
            </Button>
          </div>
        ) : (
          <div style={{ zoom, transformOrigin: "top left" }}>
          <table
            ref={tableRef}
            className="border-collapse text-sm select-none"
            style={{ tableLayout: "fixed", width: tableWidth, minWidth: tableWidth }}
          >
            <colgroup>
              <col style={{ width: 48 }} />
              {columns.map((_, ci) => (
                <col key={ci} style={{ width: colWidths[ci] ?? 160 }} />
              ))}
              <col style={{ width: 40 }} />
            </colgroup>

            {/* Header row */}
            <thead className="sticky top-0 z-20 bg-muted">
              <tr>
                <th className="border border-border bg-muted text-muted-foreground text-center text-xs font-medium py-1.5 px-1 w-12" />
                {columns.map((col, ci) => (
                  <th
                    key={ci}
                    className="border border-border bg-muted text-left py-0 px-0 font-medium group relative"
                  >
                    {editingHeader === ci ? (
                      <input
                        autoFocus
                        value={editingHeaderValue}
                        onChange={(e) => setEditingHeaderValue(e.target.value)}
                        onBlur={() => renameColumn(ci, editingHeaderValue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameColumn(ci, editingHeaderValue);
                          if (e.key === "Escape") setEditingHeader(null);
                        }}
                        className="w-full h-full px-2 py-1.5 text-sm font-medium bg-transparent outline-none border-2 border-primary rounded"
                      />
                    ) : (
                      <div className="flex items-center px-2 py-1.5 gap-1 min-h-[32px]">
                        <span
                          className="flex-1 truncate cursor-pointer"
                          onDoubleClick={() => { setEditingHeader(ci); setEditingHeaderValue(col); }}
                          title="Double-click to rename"
                        >
                          {col}
                        </span>
                        <button
                          onClick={() => deleteColumn(ci)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground shrink-0"
                          title="Delete column"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div
                      onPointerDown={(e) => onResizePointerDown(e, ci)}
                      onPointerMove={(e) => onResizePointerMove(e, ci)}
                      onPointerUp={onResizePointerUp}
                      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary/60 z-30 touch-none"
                    />
                  </th>
                ))}
                <th className="border border-border bg-muted w-10" />
              </tr>
            </thead>

            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="group hover:bg-muted/30">
                  {/* row number */}
                  <td className="border border-border bg-muted/60 text-center text-xs text-muted-foreground py-0 px-1 w-12 select-none">
                    {ri + 1}
                  </td>

                  {columns.map((col, ci) => {
                    const isActive = activeCell?.row === ri && activeCell?.col === ci;
                    const isSelected = !isActive && isCellSelected(ri, ci, selection);
                    return (
                      <td
                        key={ci}
                        className={[
                          "border border-border py-0 px-0 cursor-cell",
                          isActive
                            ? "ring-2 ring-inset ring-primary bg-background"
                            : isSelected
                              ? "bg-primary/15"
                              : "hover:bg-accent/40",
                        ].join(" ")}
                        onMouseDown={(e) => onCellMouseDown(e, ri, ci)}
                        onMouseEnter={() => onCellMouseEnter(ri, ci)}
                        onClick={(e) => onCellClick(e, ri, ci)}
                      >
                        {isActive ? (
                          <input
                            ref={activeCellRef}
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => {
                              commitCell(ri, ci, editingValue);
                              setActiveCell(null);
                            }}
                            onKeyDown={(e) => onCellKeyDown(e, ri, ci)}
                            className="w-full h-full px-2 py-1.5 text-sm bg-background outline-none cursor-text"
                          />
                        ) : (
                          <div className="px-2 py-1.5 min-h-[34px] text-sm truncate select-none">
                            {row[col] ?? ""}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* row delete */}
                  <td className="border border-border bg-transparent w-10 text-center py-0">
                    <button
                      onClick={() => deleteRow(ri)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Add row shortcut */}
              <tr>
                <td colSpan={columns.length + 2} className="border border-dashed border-border/60">
                  <button
                    onClick={addRow}
                    className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add row
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        )}

        {/* Floating zoom control */}
        <div className="sticky bottom-3 ml-auto mr-3 w-fit z-40 flex items-center gap-0.5 bg-background/90 backdrop-blur-sm border border-border rounded-lg shadow-md px-1 py-0.5">
          <button
            onClick={() => setZoom((z) => Math.max(0.3, +(z * 0.8).toFixed(2)))}
            title="Zoom out"
            className="p-1.5 rounded hover:bg-accent transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitZoom}
            title="Fit to screen"
            className="px-2 py-1 text-xs font-mono hover:bg-accent rounded transition-colors min-w-[3rem] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(2, +(z * 1.25).toFixed(2)))}
            title="Zoom in"
            className="p-1.5 rounded hover:bg-accent transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            onClick={fitZoom}
            title="Fit columns to screen"
            className="p-1.5 rounded hover:bg-accent transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you go back now, they will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onBack}
            >
              Discard &amp; Go Back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
