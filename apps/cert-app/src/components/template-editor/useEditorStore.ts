import { useCallback, useReducer, useRef } from "react";
import type {
  CanvasDocument,
  CanvasElement,
  ElementId,
} from "./types";
import { newId } from "./types";

interface State {
  doc: CanvasDocument;
  selectedIds: ElementId[];
}

interface History {
  past: CanvasDocument[];
  future: CanvasDocument[];
}

type Action =
  | { type: "set"; doc: CanvasDocument }
  | { type: "patch_doc"; patch: Partial<CanvasDocument> }
  | { type: "add"; element: CanvasElement; select?: boolean }
  | { type: "update"; id: ElementId; patch: Partial<CanvasElement> }
  | { type: "update_many"; updates: Array<{ id: ElementId; patch: Partial<CanvasElement> }> }
  | { type: "remove"; ids: ElementId[] }
  | { type: "select"; ids: ElementId[] }
  | { type: "duplicate"; ids: ElementId[] }
  | { type: "reorder"; id: ElementId; toIndex: number }
  | { type: "bring_to_front"; ids: ElementId[] }
  | { type: "send_to_back"; ids: ElementId[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set":
      return { ...state, doc: action.doc };
    case "patch_doc":
      return { ...state, doc: { ...state.doc, ...action.patch } };
    case "add": {
      const elements = [...state.doc.elements, action.element];
      return {
        doc: { ...state.doc, elements },
        selectedIds: action.select ? [action.element.id] : state.selectedIds,
      };
    }
    case "update": {
      const elements = state.doc.elements.map((el) =>
        el.id === action.id ? ({ ...el, ...action.patch } as CanvasElement) : el,
      );
      return { ...state, doc: { ...state.doc, elements } };
    }
    case "update_many": {
      const map = new Map(action.updates.map((u) => [u.id, u.patch]));
      const elements = state.doc.elements.map((el) =>
        map.has(el.id) ? ({ ...el, ...map.get(el.id) } as CanvasElement) : el,
      );
      return { ...state, doc: { ...state.doc, elements } };
    }
    case "remove": {
      const ids = new Set(action.ids);
      const elements = state.doc.elements.filter((el) => !ids.has(el.id));
      return {
        doc: { ...state.doc, elements },
        selectedIds: state.selectedIds.filter((id) => !ids.has(id)),
      };
    }
    case "select":
      return { ...state, selectedIds: action.ids };
    case "duplicate": {
      const ids = new Set(action.ids);
      const dups: CanvasElement[] = [];
      for (const el of state.doc.elements) {
        if (ids.has(el.id)) {
          dups.push({
            ...el,
            id: newId(el.type),
            x: el.x + 20,
            y: el.y + 20,
          } as CanvasElement);
        }
      }
      return {
        doc: { ...state.doc, elements: [...state.doc.elements, ...dups] },
        selectedIds: dups.map((d) => d.id),
      };
    }
    case "reorder": {
      const idx = state.doc.elements.findIndex((el) => el.id === action.id);
      if (idx < 0) return state;
      const elements = [...state.doc.elements];
      const [moved] = elements.splice(idx, 1);
      elements.splice(Math.max(0, Math.min(action.toIndex, elements.length)), 0, moved);
      return { ...state, doc: { ...state.doc, elements } };
    }
    case "bring_to_front": {
      const ids = new Set(action.ids);
      const front = state.doc.elements.filter((el) => ids.has(el.id));
      const rest = state.doc.elements.filter((el) => !ids.has(el.id));
      return { ...state, doc: { ...state.doc, elements: [...rest, ...front] } };
    }
    case "send_to_back": {
      const ids = new Set(action.ids);
      const back = state.doc.elements.filter((el) => ids.has(el.id));
      const rest = state.doc.elements.filter((el) => !ids.has(el.id));
      return { ...state, doc: { ...state.doc, elements: [...back, ...rest] } };
    }
  }
}

const HISTORY_LIMIT = 50;
const NON_HISTORY_ACTIONS = new Set<Action["type"]>(["select"]);

export interface EditorStore {
  doc: CanvasDocument;
  selectedIds: ElementId[];
  setDoc: (doc: CanvasDocument) => void;
  patchDoc: (patch: Partial<CanvasDocument>) => void;
  addElement: (element: CanvasElement, select?: boolean) => void;
  updateElement: (id: ElementId, patch: Partial<CanvasElement>) => void;
  updateMany: (updates: Array<{ id: ElementId; patch: Partial<CanvasElement> }>) => void;
  removeElements: (ids: ElementId[]) => void;
  setSelected: (ids: ElementId[]) => void;
  duplicateElements: (ids: ElementId[]) => void;
  reorderElement: (id: ElementId, toIndex: number) => void;
  bringToFront: (ids: ElementId[]) => void;
  sendToBack: (ids: ElementId[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  beginTransient: () => void;
  endTransient: () => void;
}

export function useEditorStore(initialDoc: CanvasDocument): EditorStore {
  const historyRef = useRef<History>({ past: [], future: [] });
  const transientRef = useRef<{ active: boolean; snapshot: CanvasDocument | null }>({
    active: false,
    snapshot: null,
  });

  const [state, rawDispatch] = useReducer(reducer, {
    doc: initialDoc,
    selectedIds: [],
  });

  const dispatch = useCallback(
    (action: Action) => {
      if (!NON_HISTORY_ACTIONS.has(action.type) && !transientRef.current.active) {
        const h = historyRef.current;
        h.past.push(state.doc);
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
        h.future = [];
      }
      rawDispatch(action);
    },
    [state.doc],
  );

  const setDoc = useCallback((doc: CanvasDocument) => dispatch({ type: "set", doc }), [dispatch]);
  const patchDoc = useCallback(
    (patch: Partial<CanvasDocument>) => dispatch({ type: "patch_doc", patch }),
    [dispatch],
  );
  const addElement = useCallback(
    (element: CanvasElement, select = true) => dispatch({ type: "add", element, select }),
    [dispatch],
  );
  const updateElement = useCallback(
    (id: ElementId, patch: Partial<CanvasElement>) => dispatch({ type: "update", id, patch }),
    [dispatch],
  );
  const updateMany = useCallback(
    (updates: Array<{ id: ElementId; patch: Partial<CanvasElement> }>) =>
      dispatch({ type: "update_many", updates }),
    [dispatch],
  );
  const removeElements = useCallback(
    (ids: ElementId[]) => dispatch({ type: "remove", ids }),
    [dispatch],
  );
  const setSelected = useCallback((ids: ElementId[]) => dispatch({ type: "select", ids }), [dispatch]);
  const duplicateElements = useCallback(
    (ids: ElementId[]) => dispatch({ type: "duplicate", ids }),
    [dispatch],
  );
  const reorderElement = useCallback(
    (id: ElementId, toIndex: number) => dispatch({ type: "reorder", id, toIndex }),
    [dispatch],
  );
  const bringToFront = useCallback(
    (ids: ElementId[]) => dispatch({ type: "bring_to_front", ids }),
    [dispatch],
  );
  const sendToBack = useCallback(
    (ids: ElementId[]) => dispatch({ type: "send_to_back", ids }),
    [dispatch],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop()!;
    h.future.unshift(state.doc);
    rawDispatch({ type: "set", doc: prev });
  }, [state.doc]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.shift()!;
    h.past.push(state.doc);
    rawDispatch({ type: "set", doc: next });
  }, [state.doc]);

  const beginTransient = useCallback(() => {
    if (transientRef.current.active) return;
    transientRef.current = { active: true, snapshot: state.doc };
  }, [state.doc]);

  const endTransient = useCallback(() => {
    if (!transientRef.current.active) return;
    const snapshot = transientRef.current.snapshot;
    transientRef.current = { active: false, snapshot: null };
    if (snapshot && snapshot !== state.doc) {
      const h = historyRef.current;
      h.past.push(snapshot);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
    }
  }, [state.doc]);

  return {
    doc: state.doc,
    selectedIds: state.selectedIds,
    setDoc,
    patchDoc,
    addElement,
    updateElement,
    updateMany,
    removeElements,
    setSelected,
    duplicateElements,
    reorderElement,
    bringToFront,
    sendToBack,
    undo,
    redo,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    beginTransient,
    endTransient,
  };
}
