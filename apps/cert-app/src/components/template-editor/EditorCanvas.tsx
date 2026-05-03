import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Stage, Layer, Rect, Ellipse, Line, Text as KText, Image as KImage, Transformer, Group } from "react-konva";
import type Konva from "konva";
import type { CanvasDocument, CanvasElement, ElementId, QrElement, ShapeElement, TextElement, ImageElement } from "./types";
import type { EditorStore } from "./useEditorStore";
import { computeSnap, type Guide } from "./useAlignmentGuides";

interface Props {
  store: EditorStore;
  zoom: number;
  setZoom: (z: number) => void;
}

interface ImageCache {
  [src: string]: HTMLImageElement | undefined;
}

export function EditorCanvas({ store, zoom, setZoom }: Props) {
  const { doc, selectedIds, setSelected, updateElement, beginTransient, endTransient } = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const layerRef = useRef<Konva.Layer>(null);

  const [guides, setGuides] = useState<Guide[]>([]);
  const [imageCache, setImageCache] = useState<ImageCache>({});

  // Preload images
  useEffect(() => {
    const srcs = doc.elements.filter((e): e is ImageElement => e.type === "image").map((e) => e.src);
    const missing = srcs.filter((s) => s && !imageCache[s]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(
        (src) =>
          new Promise<[string, HTMLImageElement | undefined]>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve([src, img]);
            img.onerror = () => resolve([src, undefined]);
            img.src = src;
          }),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setImageCache((prev) => {
        const next = { ...prev };
        for (const [src, img] of entries) next[src] = img;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [doc.elements, imageCache]);

  // Attach transformer to selected nodes
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, doc.elements]);

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === stageRef.current) setSelected([]);
  };

  const onElementMouseDown = (id: ElementId, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (e.evt.shiftKey) {
      if (selectedIds.includes(id)) setSelected(selectedIds.filter((x) => x !== id));
      else setSelected([...selectedIds, id]);
    } else if (!selectedIds.includes(id)) {
      setSelected([id]);
    }
  };

  const onDragStart = () => {
    beginTransient();
  };

  const onDragMove = (id: ElementId, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const el = doc.elements.find((x) => x.id === id);
    if (!el) return;
    const snap = computeSnap(doc, el, { x: node.x(), y: node.y() });
    node.x(snap.x);
    node.y(snap.y);
    setGuides(snap.guides);
  };

  const onDragEnd = (id: ElementId, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    updateElement(id, { x: node.x(), y: node.y() } as Partial<CanvasElement>);
    setGuides([]);
    endTransient();
  };

  const onTransformStart = () => {
    beginTransient();
  };

  const onTransformEnd = () => {
    const stage = stageRef.current;
    if (!stage) return;
    for (const id of selectedIds) {
      const node = stage.findOne(`#${id}`);
      if (!node) continue;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const patch: Partial<CanvasElement> = {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        width: Math.max(8, node.width() * scaleX),
        height: Math.max(8, node.height() * scaleY),
      };
      node.scaleX(1);
      node.scaleY(1);
      updateElement(id, patch);
    }
    endTransient();
  };

  // Wheel zoom (Ctrl + wheel)
  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const next = zoom * (e.deltaY > 0 ? 0.9 : 1.1);
    setZoom(Math.max(0.1, Math.min(4, next)));
  };

  const stageWidth = doc.width * zoom;
  const stageHeight = doc.height * zoom;

  // Background image
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!doc.backgroundImage) {
      setBgImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setBgImage(img);
    };
    img.src = doc.backgroundImage;
    return () => {
      cancelled = true;
    };
  }, [doc.backgroundImage]);

  const renderedElements = useMemo(() => {
    return doc.elements
      .filter((el) => !el.hidden)
      .map((el) => renderElement(el, imageCache, {
        onMouseDown: (e) => onElementMouseDown(el.id, e),
        draggable: !el.locked,
        onDragStart,
        onDragMove: (e) => onDragMove(el.id, e),
        onDragEnd: (e) => onDragEnd(el.id, e),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.elements, imageCache, selectedIds]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="themed-scroll relative w-full h-full overflow-auto bg-secondary/40 flex items-start justify-center p-8"
    >
      <div
        className="shadow-xl"
        style={{
          width: stageWidth,
          height: stageHeight,
          background: doc.backgroundColor,
        }}
      >
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          scaleX={zoom}
          scaleY={zoom}
          onMouseDown={handleStageMouseDown}
        >
          <Layer ref={layerRef}>
            {/* Background fill */}
            <Rect x={0} y={0} width={doc.width} height={doc.height} fill={doc.backgroundColor} listening={false} />
            {bgImage && (
              <KImage
                image={bgImage}
                x={0}
                y={0}
                width={doc.width}
                height={doc.height}
                listening={false}
              />
            )}
            {renderedElements}

            {/* Alignment guides */}
            {guides.map((g, i) =>
              g.axis === "x" ? (
                <Line
                  key={i}
                  points={[g.position, g.start, g.position, g.end]}
                  stroke="#3b82f6"
                  strokeWidth={1 / zoom}
                  dash={[4 / zoom, 4 / zoom]}
                  listening={false}
                />
              ) : (
                <Line
                  key={i}
                  points={[g.start, g.position, g.end, g.position]}
                  stroke="#3b82f6"
                  strokeWidth={1 / zoom}
                  dash={[4 / zoom, 4 / zoom]}
                  listening={false}
                />
              ),
            )}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={false}
              onTransformStart={onTransformStart}
              onTransformEnd={onTransformEnd}
              boundBoxFunc={(oldBox, newBox) => {
                if (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8) return oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

interface RenderHandlers {
  onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
}

function renderElement(
  el: CanvasElement,
  cache: ImageCache,
  h: RenderHandlers,
): ReactElement | null {
  const common = {
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    draggable: h.draggable,
    onMouseDown: h.onMouseDown,
    onDragStart: h.onDragStart,
    onDragMove: h.onDragMove,
    onDragEnd: h.onDragEnd,
  };

  if (el.type === "text") {
    const t = el as TextElement;
    return (
      <KText
        key={el.id}
        {...common}
        width={t.width}
        height={t.height}
        text={t.text}
        fontFamily={t.fontFamily}
        fontSize={t.fontSize}
        fontStyle={`${t.italic ? "italic " : ""}${t.fontWeight === 700 ? "bold" : "normal"}`}
        textDecoration={t.underline ? "underline" : ""}
        fill={t.color}
        align={t.align === "justify" ? "left" : t.align}
        lineHeight={t.lineHeight}
        letterSpacing={t.letterSpacing ?? 0}
        wrap="word"
      />
    );
  }

  if (el.type === "image") {
    const i = el as ImageElement;
    const img = cache[i.src];
    if (!img) {
      return (
        <Rect
          key={el.id}
          {...common}
          width={i.width}
          height={i.height}
          fill="#e5e7eb"
          stroke="#9ca3af"
          dash={[4, 4]}
        />
      );
    }
    return (
      <KImage
        key={el.id}
        {...common}
        width={i.width}
        height={i.height}
        image={img}
      />
    );
  }

  if (el.type === "shape") {
    const s = el as ShapeElement;
    if (s.shape === "rect") {
      return (
        <Rect
          key={el.id}
          {...common}
          width={s.width}
          height={s.height}
          fill={s.fill ?? undefined}
          stroke={s.stroke ?? undefined}
          strokeWidth={s.strokeWidth}
          cornerRadius={s.cornerRadius ?? 0}
        />
      );
    }
    if (s.shape === "ellipse") {
      // Ellipse uses center; group to keep top-left semantics
      return (
        <Group key={el.id} {...common} width={s.width} height={s.height}>
          <Ellipse
            x={s.width / 2}
            y={s.height / 2}
            radiusX={s.width / 2}
            radiusY={s.height / 2}
            fill={s.fill ?? undefined}
            stroke={s.stroke ?? undefined}
            strokeWidth={s.strokeWidth}
          />
        </Group>
      );
    }
    if (s.shape === "line") {
      return (
        <Line
          key={el.id}
          {...common}
          points={[0, s.height / 2, s.width, s.height / 2]}
          stroke={s.stroke ?? "#000"}
          strokeWidth={s.strokeWidth}
          width={s.width}
          height={s.height}
          hitStrokeWidth={Math.max(8, s.strokeWidth)}
        />
      );
    }
  }

  if (el.type === "qr") {
    const q = el as QrElement;
    return (
      <Group key={el.id} {...common} width={q.width} height={q.height}>
        <Rect width={q.width} height={q.height} fill="#fff" stroke="#9ca3af" strokeWidth={1} />
        <Rect x={q.width * 0.1} y={q.height * 0.1} width={q.width * 0.8} height={q.height * 0.8} fill="#0f172a" />
        <Rect x={q.width * 0.18} y={q.height * 0.18} width={q.width * 0.16} height={q.height * 0.16} fill="#fff" />
        <Rect x={q.width * 0.66} y={q.height * 0.18} width={q.width * 0.16} height={q.height * 0.16} fill="#fff" />
        <Rect x={q.width * 0.18} y={q.height * 0.66} width={q.width * 0.16} height={q.height * 0.16} fill="#fff" />
        <KText
          x={0}
          y={q.height / 2 - 8}
          width={q.width}
          align="center"
          text="QR"
          fontSize={Math.min(q.width, q.height) * 0.18}
          fill="#fff"
          fontStyle="bold"
        />
      </Group>
    );
  }

  return null;
}
