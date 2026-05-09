import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useReactFlow,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useListSheets,
  useGetSheetData,
  useListSlideTemplates,
  useGetSlidePlaceholders,
  useListBuiltinTemplates,
  useCreateBatch,
  getListBatchesQueryKey,
  type SheetFile,
  type SlideTemplate,
} from "@workspace/api-client-react";
import type { BuiltinTemplateSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Database,
  FileText,
  Plus,
  Play,
  X,
  Loader2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface SpreadsheetData extends Record<string, unknown> {
  source: "googlesheet" | "csv" | null;
  sheetId: string;
  sheetName: string;
  tabName: string;
  columns: string[];
  rows: Record<string, string>[];
  routingColumns: string[];       // columns that have a ConditionNode spawned
  fileName?: string;
}

interface ConditionData extends Record<string, unknown> {
  sourceColumn: string;           // which column this node routes on
}

interface TemplateData extends Record<string, unknown> {
  kind: "slides" | "builtin" | null;
  templateId: string;
  templateName: string;
  placeholders: string[];
}

// ── SpreadsheetNode ────────────────────────────────────────────────────────

function SpreadsheetNode({ id, data }: NodeProps) {
  const d = data as SpreadsheetData;
  const { updateNodeData, deleteElements, setNodes, setEdges, getNode } = useReactFlow();

  const { data: sheetsRes, isLoading: sheetsLoading } = useListSheets();
  const sheets = sheetsRes?.sheets ?? [];

  const { data: sheetDataRes } = useGetSheetData(
    (d.sheetId as string) || "",
    { tabName: (d.tabName as string) || undefined },
  );

  const prevHeaders = (d.columns as string[]).join(",");
  useEffect(() => {
    if (sheetDataRes?.headers) {
      const incoming = sheetDataRes.headers.join(",");
      if (incoming !== prevHeaders) {
        updateNodeData(id, { columns: sheetDataRes.headers, rows: sheetDataRes.rows ?? [] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetDataRes?.headers?.join(",")]);

  const routingColumns = (d.routingColumns as string[]) ?? [];

  const toggleRouting = useCallback(
    (col: string) => {
      const condNodeId = `cond-${id}-${col}`;
      if (routingColumns.includes(col)) {
        // Disable — remove the condition node
        deleteElements({ nodes: [{ id: condNodeId }] });
        updateNodeData(id, { routingColumns: routingColumns.filter((c) => c !== col) });
      } else {
        // Enable — spawn a ConditionNode to the right
        const myNode = getNode(id);
        const pos = myNode?.position ?? { x: 0, y: 0 };
        const condIdx = routingColumns.length;
        setNodes((nds) => [
          ...nds,
          {
            id: condNodeId,
            type: "condition",
            position: { x: pos.x + 380, y: pos.y + condIdx * 280 },
            data: { sourceColumn: col } satisfies ConditionData,
          },
        ]);
        setEdges((eds) => [
          ...eds,
          {
            id: `e-routing-${id}-${col}`,
            source: id,
            sourceHandle: `col-${col}`,
            target: condNodeId,
            targetHandle: "data-in",
            type: "default",
            style: { stroke: "#d97706", strokeDasharray: "4 3" },
          },
        ]);
        updateNodeData(id, { routingColumns: [...routingColumns, col] });
      }
    },
    [id, routingColumns, deleteElements, updateNodeData, setNodes, setEdges, getNode],
  );

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) return;
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const parsed = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
      });
      updateNodeData(id, {
        columns: headers, rows: parsed, fileName: file.name,
        source: "csv", sheetId: "", sheetName: "", tabName: "",
        routingColumns: [],
      });
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-background border-2 border-border font-mono shadow-xl" style={{ minWidth: 280, maxWidth: 320 }}>
      {/* Header */}
      <div className="px-3 py-2 border-b-2 border-border bg-foreground text-background flex items-center gap-2">
        <Database className="w-3 h-3 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest flex-1">Spreadsheet Data</span>
        <button onClick={() => deleteElements({ nodes: [{ id }] })} className="opacity-60 hover:opacity-100">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Source selector */}
      <div className="p-3 space-y-2.5">
        <div className="space-y-1">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Source</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => updateNodeData(id, { source: "googlesheet", columns: [], rows: [], sheetId: "", tabName: "", fileName: undefined, routingColumns: [] })}
              className={`flex-1 text-[9px] py-1 px-2 border font-bold uppercase tracking-wider transition-colors ${d.source === "googlesheet" ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}
            >
              Google Sheet
            </button>
            <button
              onClick={() => updateNodeData(id, { source: "csv", columns: [], rows: [], sheetId: "", sheetName: "", tabName: "", routingColumns: [] })}
              className={`flex-1 text-[9px] py-1 px-2 border font-bold uppercase tracking-wider transition-colors ${d.source === "csv" ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}
            >
              CSV
            </button>
          </div>
        </div>

        {d.source === "googlesheet" && (
          <div className="space-y-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Sheet</span>
            {sheetsLoading ? (
              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground py-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading sheets…
              </div>
            ) : (
              <select
                value={d.sheetId as string}
                onChange={(e) => {
                  const sheet = sheets.find((s: SheetFile) => s.id === e.target.value);
                  updateNodeData(id, { sheetId: e.target.value, sheetName: sheet?.name ?? "", tabName: "", columns: [], rows: [], routingColumns: [] });
                }}
                className="nodrag w-full text-[9px] border border-border bg-background px-2 py-1 font-mono cursor-pointer"
              >
                <option value="">Select sheet…</option>
                {sheets.map((s: SheetFile) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {d.source === "csv" && (
          <div className="space-y-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Upload CSV</span>
            <label className="nodrag flex items-center gap-2 border border-dashed border-border px-2 py-2 cursor-pointer hover:border-foreground transition-colors">
              <Upload className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[9px] text-muted-foreground truncate">
                {(d.fileName as string) || "Click to upload CSV file"}
              </span>
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="sr-only" />
            </label>
            {(d.columns as string[]).length > 0 && (
              <div className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>Batch generation requires Google Sheets</span>
              </div>
            )}
          </div>
        )}

        {!d.source && (
          <p className="text-[9px] text-muted-foreground/60">Select a source above to see columns</p>
        )}
      </div>

      {/* Columns with output handles + routing toggle */}
      {(d.columns as string[]).length > 0 && (
        <div className="border-t-2 border-border">
          <div className="px-3 pt-2 pb-1 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-1">
              Columns ({(d.columns as string[]).length})
            </span>
            <span className="text-[8px] uppercase tracking-widest text-muted-foreground/60">Route</span>
          </div>
          {(d.columns as string[]).map((col) => {
            const isRouting = routingColumns.includes(col);
            return (
              <div
                key={col}
                className={`relative flex items-center border-t border-border/30 ${isRouting ? "bg-amber-50/60 dark:bg-amber-950/20" : "hover:bg-muted/30"}`}
                style={{ height: 28 }}
              >
                {/* Routing toggle */}
                <button
                  onClick={() => toggleRouting(col)}
                  className={`nodrag shrink-0 flex items-center justify-center w-6 h-full border-r border-border/30 transition-colors ${isRouting ? "text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20" : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/50"}`}
                  title={isRouting ? `Remove routing for "${col}"` : `Enable conditional routing for "${col}"`}
                >
                  <GitBranch className="w-2.5 h-2.5" />
                </button>

                <span className={`text-[10px] font-bold px-2 truncate flex-1 ${isRouting ? "text-amber-700 dark:text-amber-400" : ""}`}>
                  {col}
                </span>

                {/* Source handle — always present; amber-styled when routing */}
                <Handle
                  id={`col-${col}`}
                  type="source"
                  position={Position.Right}
                  style={{
                    width: 10, height: 10, borderRadius: 0,
                    background: isRouting ? "#d97706" : "currentColor",
                    border: isRouting ? "2px solid #92400e" : "2px solid",
                    position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)",
                  }}
                />
                {isRouting && (
                  <span className="text-[8px] text-amber-600 dark:text-amber-400 pr-2 shrink-0 font-bold uppercase tracking-wider">
                    routing
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ConditionNode ──────────────────────────────────────────────────────────

function ConditionNode({ id, data }: NodeProps) {
  const d = data as ConditionData;
  const { getNodes, deleteElements, updateNodeData } = useReactFlow();

  // Read rows live from the SpreadsheetNode
  const spreadsheetNode = getNodes().find((n) => n.type === "spreadsheet");
  const sd = spreadsheetNode?.data as SpreadsheetData | undefined;
  const rows = (sd?.rows as Record<string, string>[]) ?? [];
  const col = d.sourceColumn as string;

  const values = useMemo(() => {
    if (!col || !rows.length) return [];
    const seen = new Set<string>();
    rows.forEach((r) => seen.add(r[col] ?? ""));
    // Sort: non-empty first, then empty last
    return [...seen].sort((a, b) => {
      if (a === "" && b !== "") return 1;
      if (a !== "" && b === "") return -1;
      return a.localeCompare(b);
    });
  }, [col, rows]);

  const handleDelete = useCallback(() => {
    // Remove this column from the SpreadsheetNode's routingColumns
    if (spreadsheetNode) {
      const rc = (spreadsheetNode.data.routingColumns as string[]) ?? [];
      updateNodeData(spreadsheetNode.id, { routingColumns: rc.filter((c) => c !== col) });
    }
    deleteElements({ nodes: [{ id }] });
  }, [id, col, spreadsheetNode, deleteElements, updateNodeData]);

  return (
    <div className="bg-background border-2 border-amber-500/60 font-mono shadow-xl" style={{ minWidth: 200, maxWidth: 260 }}>
      {/* Header */}
      <div className="relative px-3 py-2 border-b-2 border-amber-500/60 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-2">
        <Handle
          id="data-in"
          type="target"
          position={Position.Left}
          style={{
            width: 10, height: 10, borderRadius: 0,
            background: "#d97706", border: "2px solid #92400e",
            position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)",
          }}
        />
        <GitBranch className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 ml-2" />
        <span className="text-[10px] font-bold uppercase tracking-widest flex-1 text-amber-700 dark:text-amber-300 truncate">
          {col} Routing
        </span>
        <button onClick={handleDelete} className="text-amber-600 dark:text-amber-400 opacity-60 hover:opacity-100">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Values */}
      <div className="border-b border-amber-500/20 px-3 pt-2 pb-1">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
          {values.length === 0 ? "No data loaded yet" : `Values (${values.length})`}
        </span>
      </div>

      {values.length === 0 && (
        <div className="px-3 py-2 text-[9px] text-muted-foreground/60">
          Select a sheet with rows to see values
        </div>
      )}

      {values.map((val) => {
        const handleId = val === "" ? "val-__empty__" : `val-${val}`;
        const label = val === "" ? "(empty)" : val;
        return (
          <div
            key={handleId}
            className="relative flex items-center justify-between px-3 border-t border-amber-500/20 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
            style={{ height: 28 }}
          >
            <span className={`text-[10px] font-bold pr-3 truncate flex-1 ${val === "" ? "text-muted-foreground italic" : ""}`}>
              {label}
            </span>
            <Handle
              id={handleId}
              type="source"
              position={Position.Right}
              style={{
                width: 10, height: 10, borderRadius: 0,
                background: "#d97706",
                border: "2px solid #92400e",
                position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── TemplateNode ───────────────────────────────────────────────────────────

function TemplateNode({ id, data }: NodeProps) {
  const d = data as TemplateData;
  const { updateNodeData, deleteElements, getEdges } = useReactFlow();

  const { data: slidesRes } = useListSlideTemplates();
  const slideTemplates = slidesRes?.templates ?? [];

  const { data: phRes } = useGetSlidePlaceholders(d.templateId as string);

  const { data: builtinRes } = useListBuiltinTemplates();
  const builtinTemplates = (builtinRes as { templates: BuiltinTemplateSummary[] } | undefined)?.templates ?? [];

  // Sync slide placeholders
  const prevPh = (d.placeholders as string[]).join(",");
  useEffect(() => {
    if (d.kind === "slides" && phRes?.placeholders) {
      const incoming = phRes.placeholders.join(",");
      if (incoming !== prevPh) updateNodeData(id, { placeholders: phRes.placeholders });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phRes?.placeholders?.join(","), d.kind]);

  // Is this node being routed to by a ConditionNode?
  const isRouted = getEdges().some((e) => e.target === id && e.targetHandle === "route-in");

  const kindBadge = d.kind === "slides" ? "SLIDES" : d.kind === "builtin" ? "BUILT-IN" : null;

  return (
    <div className="bg-background border-2 border-border font-mono shadow-xl" style={{ minWidth: 280, maxWidth: 320 }}>
      {/* Header */}
      <div className={`px-3 py-2 border-b-2 border-border flex items-center gap-2 ${isRouted ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
        <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest flex-1">Template</span>
        {isRouted && (
          <span className="flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border border-amber-500/40 px-1.5 py-0.5">
            <GitBranch className="w-2 h-2" /> Routed
          </span>
        )}
        {kindBadge && !isRouted && (
          <span className="text-[8px] font-bold uppercase tracking-wider border border-border px-1.5 py-0.5 text-muted-foreground">
            {kindBadge}
          </span>
        )}
        <button onClick={() => deleteElements({ nodes: [{ id }] })} className="text-muted-foreground hover:text-foreground ml-1">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Template type + picker */}
      <div className="p-3 space-y-2.5">
        <div className="space-y-1">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Type</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => updateNodeData(id, { kind: "slides", templateId: "", templateName: "", placeholders: [] })}
              className={`flex-1 text-[9px] py-1 px-2 border font-bold uppercase tracking-wider transition-colors ${d.kind === "slides" ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}
            >
              Google Slides
            </button>
            <button
              onClick={() => updateNodeData(id, { kind: "builtin", templateId: "", templateName: "", placeholders: [] })}
              className={`flex-1 text-[9px] py-1 px-2 border font-bold uppercase tracking-wider transition-colors ${d.kind === "builtin" ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}
            >
              Built-in
            </button>
          </div>
        </div>

        {d.kind === "slides" && (
          <div className="space-y-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Template</span>
            <select
              value={d.templateId as string}
              onChange={(e) => {
                const tpl = slideTemplates.find((t: SlideTemplate) => t.id === e.target.value);
                updateNodeData(id, { templateId: e.target.value, templateName: tpl?.name ?? "", placeholders: [] });
              }}
              className="nodrag w-full text-[9px] border border-border bg-background px-2 py-1 font-mono cursor-pointer"
            >
              <option value="">Select template…</option>
              {slideTemplates.map((t: SlideTemplate) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {d.templateId && !phRes?.placeholders && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Detecting placeholders…
              </div>
            )}
          </div>
        )}

        {d.kind === "builtin" && (
          <div className="space-y-1">
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Template</span>
            <select
              value={d.templateId as string}
              onChange={(e) => {
                const tpl = builtinTemplates.find((t: BuiltinTemplateSummary) => t.id === e.target.value);
                updateNodeData(id, { templateId: e.target.value, templateName: tpl?.name ?? "", placeholders: tpl?.placeholders ?? [] });
              }}
              className="nodrag w-full text-[9px] border border-border bg-background px-2 py-1 font-mono cursor-pointer"
            >
              <option value="">Select template…</option>
              {builtinTemplates.map((t: BuiltinTemplateSummary) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {!d.kind && (
          <p className="text-[9px] text-muted-foreground/60">Select a type above to configure</p>
        )}
      </div>

      {/* Route-in handle — dedicated row for routing connections from ConditionNodes */}
      <div className="border-t-2 border-border">
        <div
          className={`relative flex items-center px-3 border-b border-amber-500/30 hover:bg-amber-50/30 dark:hover:bg-amber-950/20 ${isRouted ? "bg-amber-50/50 dark:bg-amber-950/30" : ""}`}
          style={{ height: 28 }}
        >
          <Handle
            id="route-in"
            type="target"
            position={Position.Left}
            style={{
              width: 10, height: 10, borderRadius: 0,
              background: isRouted ? "#d97706" : "#a16207",
              border: isRouted ? "2px solid #92400e" : "2px solid #a16207",
              position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)",
            }}
          />
          <GitBranch className={`w-2.5 h-2.5 ml-3 mr-1.5 shrink-0 ${isRouted ? "text-amber-600 dark:text-amber-400" : "text-amber-500/60"}`} />
          <span className={`text-[9px] font-bold uppercase tracking-widest ${isRouted ? "text-amber-700 dark:text-amber-300" : "text-amber-600/60 dark:text-amber-500/50"}`}>
            Route In
          </span>
          {isRouted && (
            <span className="ml-auto text-[8px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Connected
            </span>
          )}
        </div>

        {/* Placeholders with input handles */}
        {(d.placeholders as string[]).length > 0 && (
          <>
            <div className="px-3 pt-2 pb-1">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Placeholders ({(d.placeholders as string[]).length})
              </span>
            </div>
            {(d.placeholders as string[]).map((ph) => (
              <div
                key={ph}
                className="relative flex items-center px-3 border-t border-border/30 hover:bg-muted/30"
                style={{ height: 28 }}
              >
                <Handle
                  id={`ph-${ph}`}
                  type="target"
                  position={Position.Left}
                  style={{
                    width: 10, height: 10, borderRadius: 0,
                    background: "currentColor", border: "2px solid",
                    position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)",
                  }}
                />
                <span className="text-[10px] font-bold pl-3 truncate">{ph}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── DeletableEdge ──────────────────────────────────────────────────────────

function DeletableEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <button
              onClick={() => setEdges((eds) => eds.filter((e) => e.id !== id))}
              className="flex items-center justify-center w-4 h-4 rounded-sm border border-destructive bg-background text-destructive shadow-sm"
              title="Delete connection"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ── Node types (stable, module-level) ─────────────────────────────────────

const edgeTypes = { deletable: DeletableEdge };

const nodeTypes = {
  spreadsheet: SpreadsheetNode,
  condition: ConditionNode,
  template: TemplateNode,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildColumnMap(nodeId: string, edges: Edge[], nodes: Node[]): Record<string, string> {
  const map: Record<string, string> = {};
  edges.forEach((e) => {
    if (e.target !== nodeId || !e.targetHandle?.startsWith("ph-")) return;
    const ph = e.targetHandle.replace(/^ph-/, "");
    if (e.sourceHandle?.startsWith("col-")) {
      // spreadsheet column → placeholder
      map[ph] = e.sourceHandle.replace(/^col-/, "");
    } else if (e.sourceHandle?.startsWith("val-")) {
      // condition value → placeholder: use the condition node's source column as the data column
      const condNode = nodes.find((n) => n.id === e.source);
      if (condNode) map[ph] = (condNode.data as ConditionData).sourceColumn;
    }
  });
  return map;
}

function detectCol(
  columnMap: Record<string, string>,
  allCols: string[],
  pattern: RegExp,
): string {
  return (
    Object.values(columnMap).find((c) => pattern.test(c)) ||
    allCols.find((c) => pattern.test(c)) ||
    allCols[0] ||
    ""
  );
}

// ── GenResult ──────────────────────────────────────────────────────────────

interface GenResult {
  label: string;
  status: "pending" | "success" | "error";
  batchId?: number;
  error?: string;
}

// ── AdvancedInner ──────────────────────────────────────────────────────────

function AdvancedInner() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [showGenModal, setShowGenModal] = useState(false);
  const [batchName, setBatchName] = useState("Advanced Workflow");
  const [genResults, setGenResults] = useState<GenResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const { mutateAsync: createBatchAsync } = useCreateBatch();

  // ── Connection validation ───────────────────────────────────────────────

  const onConnect = useCallback(
    (params: Connection) => {
      const src = nodes.find((n) => n.id === params.source);
      const tgt = nodes.find((n) => n.id === params.target);

      const validRouting =
        src?.type === "condition" && tgt?.type === "template" && params.targetHandle === "route-in";
      const validConditionValue =
        src?.type === "condition" && tgt?.type === "template" && params.targetHandle?.startsWith("ph-");
      const validMapping =
        src?.type === "spreadsheet" && tgt?.type === "template" &&
        params.sourceHandle?.startsWith("col-") && params.targetHandle?.startsWith("ph-");

      if (!validRouting && !validConditionValue && !validMapping) {
        toast({ title: "Invalid connection", description: "Connect: spreadsheet column → placeholder, condition value → placeholder or Route In." });
        return;
      }
      setEdges((eds) => addEdge({ ...params, type: "deletable", animated: true }, eds));
    },
    [nodes, setEdges, toast],
  );

  // ── Add nodes ──────────────────────────────────────────────────────────

  const addSpreadsheetNode = useCallback(() => {
    if (nodes.some((n) => n.type === "spreadsheet")) {
      toast({ title: "Only one spreadsheet node per workflow" });
      return;
    }
    const id = `spreadsheet-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "spreadsheet",
        position: { x: 80, y: 120 },
        data: {
          source: null, sheetId: "", sheetName: "", tabName: "",
          columns: [], rows: [], routingColumns: [],
        } satisfies SpreadsheetData,
      },
    ]);
  }, [nodes, setNodes, toast]);

  const addTemplateNode = useCallback(() => {
    const id = `template-${Date.now()}`;
    setNodes((nds) => {
      const count = nds.filter((n) => n.type === "template").length;
      return [
        ...nds,
        {
          id,
          type: "template",
          position: { x: 640, y: 100 + count * 380 },
          data: {
            kind: null, templateId: "", templateName: "", placeholders: [],
          } satisfies TemplateData,
        },
      ];
    });
  }, [setNodes]);

  // ── Workflow analysis ──────────────────────────────────────────────────

  const { isConditionalMode, routingEdges, connectedTemplates } = useMemo(() => {
    // Routing edges: ANY connection from a ConditionNode to a TemplateNode
    // (covers both route-in and condition-value → placeholder connections)
    const re = edges.filter(
      (e) =>
        nodes.find((n) => n.id === e.source)?.type === "condition" &&
        nodes.find((n) => n.id === e.target)?.type === "template",
    );
    // Directly connected templates (via column→placeholder edges)
    const ct = nodes.filter(
      (n) =>
        n.type === "template" &&
        (n.data as TemplateData).templateId &&
        edges.some((e) => e.target === n.id && e.targetHandle?.startsWith("ph-")),
    );
    return { isConditionalMode: re.length > 0, routingEdges: re, connectedTemplates: ct };
  }, [nodes, edges]);

  // ── Validate & open modal ──────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    const spreadsheetNode = nodes.find((n) => n.type === "spreadsheet");
    if (!spreadsheetNode) {
      toast({ title: "Add a Spreadsheet node first", variant: "destructive" });
      return;
    }
    const sd = spreadsheetNode.data as SpreadsheetData;
    if (!sd.sheetId) {
      toast({ title: "Google Sheet required for generation", description: "Select a Google Sheet as your data source.", variant: "destructive" });
      return;
    }

    if (isConditionalMode) {
      // Routing mode: each routing edge = one template assignment
      const assignedTemplateIds = new Set(routingEdges.map((e) => e.target));
      if (assignedTemplateIds.size === 0) {
        toast({ title: "Connect routing values to templates", variant: "destructive" });
        return;
      }
      setGenResults([{ label: "1 batch with conditional routing", status: "pending" }]);
    } else {
      if (connectedTemplates.length === 0) {
        toast({ title: "Connect spreadsheet columns to template placeholders", variant: "destructive" });
        return;
      }
      setGenResults(
        connectedTemplates.map((n) => ({
          label: (n.data as TemplateData).templateName || "Template",
          status: "pending",
        })),
      );
    }
    setShowGenModal(true);
  }, [nodes, edges, isConditionalMode, routingEdges, connectedTemplates, toast]);

  // ── Confirm & create batches ───────────────────────────────────────────

  const handleConfirmGenerate = useCallback(async () => {
    const spreadsheetNode = nodes.find((n) => n.type === "spreadsheet")!;
    const sd = spreadsheetNode.data as SpreadsheetData;
    setIsGenerating(true);

    try {
      if (isConditionalMode) {
        // ── Conditional mode: ONE batch with categoryTemplateMap ────────
        const results: GenResult[] = [{ label: "Conditional routing batch", status: "pending" }];
        setGenResults([...results]);

        // Find the condition node
        const condNodeId = routingEdges[0]?.source;
        const condNode = nodes.find((n) => n.id === condNodeId);
        const categoryColumn = condNode
          ? (condNode.data as ConditionData).sourceColumn
          : "";

        // Deduplicate routing edges by condition value (First/Second/Third may each have
        // multiple edges to the same template via different ph-* handles)
        const valueToTemplateNode = new Map<string, Node>();
        routingEdges.forEach((edge) => {
          const tplNode = nodes.find((n) => n.id === edge.target);
          if (!tplNode || !(tplNode.data as TemplateData).templateId) return;
          const rawHandle = edge.sourceHandle ?? "";
          const val = rawHandle === "val-__empty__" ? "" : rawHandle.replace(/^val-/, "");
          if (!valueToTemplateNode.has(val)) valueToTemplateNode.set(val, tplNode);
        });

        // Primary template = the one mapped to empty/fallback, or first available
        let primaryTn: Node | undefined =
          valueToTemplateNode.get("") ??
          nodes.find((n) => n.type === "template" && (n.data as TemplateData).templateId);
        if (!primaryTn) primaryTn = nodes.find((n) => n.id === routingEdges[0]?.target)!;
        const ptd = primaryTn.data as TemplateData;

        // Build per-template column maps (deduplicated by node id)
        const colMapByNodeId = new Map<string, Record<string, string>>();
        routingEdges.forEach((e) => {
          if (!colMapByNodeId.has(e.target))
            colMapByNodeId.set(e.target, buildColumnMap(e.target, edges, nodes));
        });

        // Primary template's column map for emailColumn / nameColumn detection
        const primaryColMap = colMapByNodeId.get(primaryTn.id) ?? buildColumnMap(primaryTn.id, edges, nodes);
        const allCols = [...colMapByNodeId.values()].reduce((m, c) => Object.assign(m, c), {});
        const emailCol = detectCol(allCols, sd.columns as string[], /email/i);
        const nameCol = detectCol(primaryColMap, sd.columns as string[], /name/i) || detectCol(allCols, sd.columns as string[], /name/i);

        // Build categoryTemplateMap: each non-empty value carries its own columnMap
        const categoryTemplateMap: Record<string, { templateId: string; templateName: string; columnMap: Record<string, string> }> = {};
        valueToTemplateNode.forEach((tplNode, val) => {
          if (val === "") return;
          const td = tplNode.data as TemplateData;
          categoryTemplateMap[val] = {
            templateId: td.templateId as string,
            templateName: td.templateName as string,
            columnMap: colMapByNodeId.get(tplNode.id) ?? {},
          };
        });

        try {
          const batch = await createBatchAsync({
            data: {
              name: batchName,
              sheetId: sd.sheetId as string,
              sheetName: sd.sheetName as string,
              tabName: (sd.tabName as string) || undefined,
              templateId: ptd.templateId as string,
              templateName: ptd.templateName as string,
              templateKind: ptd.kind,
              columnMap: primaryColMap,   // primary template's own map
              emailColumn: emailCol,
              nameColumn: nameCol,
              ...(categoryColumn ? { categoryColumn, categoryTemplateMap } : {}),
            } as any,
          });
          results[0] = { ...results[0], status: "success", batchId: batch.id };
          setGenResults([...results]);
        } catch (err: any) {
          results[0] = { ...results[0], status: "error", error: err?.message || "Failed" };
          setGenResults([...results]);
        }

      } else {
        // ── Standard mode: one batch per template ───────────────────────
        const results: GenResult[] = connectedTemplates.map((n) => ({
          label: (n.data as TemplateData).templateName || "Template",
          status: "pending",
        }));
        setGenResults([...results]);

        await Promise.allSettled(
          connectedTemplates.map(async (tn, idx) => {
            const td = tn.data as TemplateData;
            const columnMap = buildColumnMap(tn.id, edges, nodes);
            const emailCol = detectCol(columnMap, sd.columns as string[], /email/i);
            const nameCol = detectCol(columnMap, sd.columns as string[], /name/i);
            const suffix = connectedTemplates.length > 1 ? ` (${idx + 1})` : "";

            try {
              const batch = await createBatchAsync({
                data: {
                  name: batchName + suffix,
                  sheetId: sd.sheetId as string,
                  sheetName: sd.sheetName as string,
                  tabName: (sd.tabName as string) || undefined,
                  templateId: td.templateId as string,
                  templateName: td.templateName as string,
                  templateKind: td.kind,
                  columnMap,
                  emailColumn: emailCol,
                  nameColumn: nameCol,
                } as any,
              });
              results[idx] = { ...results[idx], status: "success", batchId: batch.id };
              setGenResults([...results]);
            } catch (err: any) {
              results[idx] = { ...results[idx], status: "error", error: err?.message || "Failed" };
              setGenResults([...results]);
            }
          }),
        );
      }
    } finally {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() });
    }

    // Use timeout to read final results state (avoid stale closure)
    setTimeout(() => {
      setGenResults((current) => {
        const ok = current.filter((r) => r.status === "success").length;
        if (ok > 0) {
          toast({ title: `${ok} batch${ok > 1 ? "es" : ""} created`, description: "Redirecting to History…" });
          setShowGenModal(false);
          setTimeout(() => setLocation("/history"), 600);
        }
        return current;
      });
    }, 100);
  }, [
    nodes, edges, isConditionalMode, routingEdges, connectedTemplates,
    batchName, createBatchAsync, queryClient, toast, setLocation,
  ]);

  // ── Routing summary for the modal ──────────────────────────────────────

  const routingSummary = useMemo(() => {
    if (!isConditionalMode) return [];
    return routingEdges.map((edge) => {
      const condNode = nodes.find((n) => n.id === edge.source);
      const tplNode = nodes.find((n) => n.id === edge.target);
      const rawHandle = edge.sourceHandle ?? "";
      const val = rawHandle === "val-__empty__" ? "(empty)" : rawHandle.replace(/^val-/, "");
      const col = condNode ? (condNode.data as ConditionData).sourceColumn : "?";
      const tplName = tplNode ? (tplNode.data as TemplateData).templateName || "?" : "?";
      return { col, val, tplName };
    });
  }, [isConditionalMode, routingEdges, nodes]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background/95 backdrop-blur shrink-0">
        <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-muted-foreground mr-1">
          Workflow Builder
        </span>
        <div className="w-px h-4 bg-border mx-1" />
        <Button variant="outline" size="sm" onClick={addSpreadsheetNode} className="text-[10px] font-mono uppercase tracking-wider h-7 gap-1.5">
          <Plus className="w-3 h-3" /><Database className="w-3 h-3" /> Spreadsheet
        </Button>
        <Button variant="outline" size="sm" onClick={addTemplateNode} className="text-[10px] font-mono uppercase tracking-wider h-7 gap-1.5">
          <Plus className="w-3 h-3" /><FileText className="w-3 h-3" /> Template
        </Button>
        <div className="flex-1" />
        {isConditionalMode && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-amber-600 dark:text-amber-400">
            <GitBranch className="w-3 h-3" /> Conditional routing active
          </span>
        )}
        {!isConditionalMode && connectedTemplates.length > 0 && (
          <span className="text-[9px] font-mono text-muted-foreground">
            {connectedTemplates.length} template{connectedTemplates.length > 1 ? "s" : ""} ready
          </span>
        )}
        <Button size="sm" onClick={handleGenerate} className="text-[10px] font-mono uppercase tracking-wider h-7 gap-1.5">
          <Play className="w-3 h-3" /> Generate
        </Button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: "deletable" }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
          className="bg-muted/10"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
          <Controls />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-4 max-w-sm px-4">
              <div className="text-5xl opacity-10 font-mono">⬡</div>
              <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
                Visual Workflow Builder
              </p>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                Add a <strong>Spreadsheet</strong> node and connect columns to template placeholders.
                Click the <GitBranch className="inline w-3 h-3" /> icon next to any column to enable
                conditional routing — route different rows (e.g. "first", "participant") to
                different certificate templates.
              </p>
              <div className="pointer-events-auto">
                <Button size="sm" variant="outline" onClick={addSpreadsheetNode} className="text-[10px] font-mono uppercase tracking-wider">
                  <Database className="w-3 h-3 mr-1.5" /> Add Spreadsheet Node
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate Modal */}
      <Dialog open={showGenModal} onOpenChange={(open) => { if (!isGenerating) setShowGenModal(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-widest text-sm">
              {isConditionalMode ? "Create Conditional Batch" : "Create Batches"}
            </DialogTitle>
            <DialogDescription>
              {isConditionalMode
                ? "One batch will be created. The routing column directs each row to its matching template."
                : "One batch per connected template will be created."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider">Batch Name</Label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="My Workflow Batch"
                className="font-mono text-sm"
                disabled={isGenerating}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-wider">
                {isConditionalMode ? "Routing Summary" : `Templates (${genResults.length})`}
              </Label>
              <div className="border border-border divide-y divide-border">
                {genResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2">
                    {r.status === "pending" && !isGenerating && <div className="w-3 h-3 border border-border rounded-full shrink-0" />}
                    {r.status === "pending" && isGenerating && <Loader2 className="w-3 h-3 animate-spin shrink-0 text-muted-foreground" />}
                    {r.status === "success" && <CheckCircle2 className="w-3 h-3 shrink-0 text-green-600" />}
                    {r.status === "error" && <AlertTriangle className="w-3 h-3 shrink-0 text-destructive" />}
                    <span className="text-xs font-mono flex-1 truncate">{r.label}</span>
                    {r.status === "error" && r.error && (
                      <span className="text-[9px] text-destructive truncate max-w-[120px]">{r.error}</span>
                    )}
                  </div>
                ))}

                {/* Conditional routing breakdown */}
                {isConditionalMode && routingSummary.length > 0 && (
                  <div className="px-3 py-2 space-y-1 bg-amber-50/50 dark:bg-amber-950/20">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1.5">
                      Routing: "{routingSummary[0]?.col}" column
                    </p>
                    {routingSummary.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-[9px] font-mono">
                        <GitBranch className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                        <span className="font-bold text-foreground">{r.val}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-foreground truncate">{r.tplName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowGenModal(false)} disabled={isGenerating}>Cancel</Button>
            <Button onClick={handleConfirmGenerate} disabled={!batchName.trim() || isGenerating}>
              {isGenerating
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating…</>
                : <><Play className="w-4 h-4 mr-2" /> Create {isConditionalMode ? "Batch" : `${genResults.length} Batch${genResults.length > 1 ? "es" : ""}`}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Default export ─────────────────────────────────────────────────────────

export default function Advanced() {
  return (
    <ReactFlowProvider>
      <AdvancedInner />
    </ReactFlowProvider>
  );
}
