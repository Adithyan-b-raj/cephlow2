import { useRef } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  onMove: (dx: number, dy: number) => void;
  onMoveEnd: () => void;
}

export function JoystickPad({ onMove, onMoveEnd }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startMove = (dx: number, dy: number) => {
    onMove(dx, dy);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => onMove(dx, dy), 40);
    }, 350);
  };

  const stopMove = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    onMoveEnd();
  };

  return (
    <div className="absolute bottom-4 right-4 grid grid-cols-3 gap-1.5 pointer-events-auto">
      <span />
      <DirBtn dx={0} dy={-3} onStart={startMove} onEnd={stopMove}>
        <ChevronUp className="w-5 h-5" />
      </DirBtn>
      <span />

      <DirBtn dx={-3} dy={0} onStart={startMove} onEnd={stopMove}>
        <ChevronLeft className="w-5 h-5" />
      </DirBtn>
      <div className="w-11 h-11 rounded-xl bg-background/50 border border-border/40" />
      <DirBtn dx={3} dy={0} onStart={startMove} onEnd={stopMove}>
        <ChevronRight className="w-5 h-5" />
      </DirBtn>

      <span />
      <DirBtn dx={0} dy={3} onStart={startMove} onEnd={stopMove}>
        <ChevronDown className="w-5 h-5" />
      </DirBtn>
      <span />
    </div>
  );
}

function DirBtn({
  dx,
  dy,
  onStart,
  onEnd,
  children,
}: {
  dx: number;
  dy: number;
  onStart: (dx: number, dy: number) => void;
  onEnd: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="w-11 h-11 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm border border-border shadow-md active:bg-accent touch-none select-none"
      onPointerDown={(e) => { e.preventDefault(); onStart(dx, dy); }}
      onPointerUp={onEnd}
      onPointerLeave={onEnd}
      onPointerCancel={onEnd}
    >
      {children}
    </button>
  );
}
