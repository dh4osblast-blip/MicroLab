import React, { useCallback, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, RotateCcw } from 'lucide-react';

const NODE_COORDS: Record<number, { x: number; y: number }> = {
  1: { x: 30, y: 30 },
  2: { x: 90, y: 30 },
  3: { x: 150, y: 30 },
  4: { x: 30, y: 90 },
  5: { x: 90, y: 90 },
  6: { x: 150, y: 90 },
  7: { x: 30, y: 150 },
  8: { x: 90, y: 150 },
  9: { x: 150, y: 150 },
};

const MIDPOINT_SKIP: Record<string, number> = {
  '1-3': 2,
  '3-1': 2,
  '4-6': 5,
  '6-4': 5,
  '7-9': 8,
  '9-7': 8,
  '1-7': 4,
  '7-1': 4,
  '2-8': 5,
  '8-2': 5,
  '3-9': 6,
  '9-3': 6,
  '1-9': 5,
  '9-1': 5,
  '3-7': 5,
  '7-3': 5,
};

interface AndroidPatternLockProps {
  value: number[];
  onChange: (nodes: number[]) => void;
  label?: string;
  compact?: boolean;
  defaultRevealed?: boolean;
}

export const AndroidPatternLock: React.FC<AndroidPatternLockProps> = ({
  value,
  onChange,
  label = 'Padrão 3×3 (RAM)',
  compact = false,
  defaultRevealed = true,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(defaultRevealed);
  const nodesRef = useRef<number[]>(value);
  nodesRef.current = value;

  const getSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 180,
      y: ((clientY - rect.top) / rect.height) * 180,
    };
  }, []);

  const hitNode = useCallback((x: number, y: number): number | null => {
    const hitRadius = 21;
    for (let n = 1; n <= 9; n++) {
      const c = NODE_COORDS[n];
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return n;
      }
    }
    return null;
  }, []);

  const appendHitNode = useCallback(
    (current: number[], hit: number): number[] => {
      if (current.includes(hit)) return current;
      const next = [...current];
      if (next.length > 0) {
        const last = next[next.length - 1];
        const mid = MIDPOINT_SKIP[`${last}-${hit}`];
        if (mid && !next.includes(mid)) {
          next.push(mid);
        }
      }
      next.push(hit);
      return next;
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pos = getSvgCoords(e.clientX, e.clientY);
    if (!pos) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }
    setDrawing(true);
    setPointerPos(pos);
    const hit = hitNode(pos.x, pos.y);
    if (hit) {
      const started = [hit];
      nodesRef.current = started;
      onChange(started);
    } else {
      nodesRef.current = [];
      onChange([]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    const pos = getSvgCoords(e.clientX, e.clientY);
    if (!pos) return;
    setPointerPos(pos);
    const hit = hitNode(pos.x, pos.y);
    if (hit && !nodesRef.current.includes(hit)) {
      const updated = appendHitNode(nodesRef.current, hit);
      nodesRef.current = updated;
      onChange(updated);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    setDrawing(false);
    setPointerPos(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  const pointsAttr = value
    .map((n) => {
      const c = NODE_COORDS[n];
      return `${c.x},${c.y}`;
    })
    .join(' ');

  const lastNode = value.length > 0 ? NODE_COORDS[value[value.length - 1]] : null;
  const gridSize = compact ? 132 : 152;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex items-center justify-between w-full mb-1.5 gap-2">
        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#414752]">
          <Lock className="w-3.5 h-3.5 text-[#0056ab] shrink-0" />
          <span>{label}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0056ab] hover:underline cursor-pointer"
            title={revealed ? 'Ocultar desenho (LGPD)' : 'Mostrar desenho'}
          >
            {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{revealed ? 'Ocultar' : 'Revelar'}</span>
          </button>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#DC2626] hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar</span>
            </button>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox="0 0 180 180"
        width={gridSize}
        height={gridSize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className="touch-none select-none rounded-xl bg-white border border-[#D9E0EC] cursor-crosshair"
        aria-label="Grade interativa de padrão Android 3x3"
      >
        {revealed && value.length >= 2 && (
          <polyline
            points={pointsAttr}
            fill="none"
            stroke="#0056ab"
            strokeWidth={4.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.85}
          />
        )}
        {revealed && drawing && lastNode && pointerPos && (
          <line
            x1={lastNode.x}
            y1={lastNode.y}
            x2={pointerPos.x}
            y2={pointerPos.y}
            stroke="#1b6fd1"
            strokeWidth={3}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        )}

        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((node) => {
          const { x, y } = NODE_COORDS[node];
          const orderIdx = value.indexOf(node);
          const active = orderIdx >= 0;
          const showActive = active && revealed;
          const isStart = orderIdx === 0 && revealed;
          return (
            <g key={node}>
              <circle
                cx={x}
                cy={y}
                r={18}
                fill={showActive ? (isStart ? '#091b36' : '#0056ab') : '#F3F6FB'}
                stroke={showActive ? '#0056ab' : '#CBD5E1'}
                strokeWidth={showActive ? 2 : 1.5}
              />
              {showActive ? (
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="#ffffff"
                  className="font-mono"
                >
                  {orderIdx + 1}
                </text>
              ) : (
                <circle
                  cx={x}
                  cy={y}
                  r={4.5}
                  fill={active ? '#0056ab' : '#94A3B8'}
                />
              )}
            </g>
          );
        })}
      </svg>

      <span className="mt-1.5 text-[10px] font-mono text-[#727784] text-center">
        {value.length > 0
          ? revealed
            ? `Seq: ${value.join('→')}`
            : `Padrão capturado (${value.length} pontos · oculto)`
          : 'Arraste ligando os pontos (1 a 9)'}
      </span>
    </div>
  );
};

interface AndroidPatternMiniSvgProps {
  nodes: number[];
  size?: number;
  monochrome?: boolean;
}

export const AndroidPatternMiniSvg: React.FC<AndroidPatternMiniSvgProps> = ({
  nodes,
  size = 44,
  monochrome = false,
}) => {
  if (!nodes || nodes.length === 0) return null;
  const strokeColor = monochrome ? '#000000' : '#0056ab';
  const startColor = monochrome ? '#000000' : '#091b36';
  const mutedDot = monochrome ? '#9ca3af' : '#cbd5e1';

  const scale = 120 / 180;
  const pt = (n: number) => {
    const c = NODE_COORDS[n] || { x: 90, y: 90 };
    return { x: c.x * scale, y: c.y * scale };
  };

  const pointsAttr = nodes
    .map((n) => {
      const p = pt(n);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className="inline-block shrink-0 border border-gray-300 rounded bg-white"
      aria-label={`Mini-grade padrão ${nodes.join('-')}`}
    >
      {nodes.length >= 2 && (
        <polyline
          points={pointsAttr}
          fill="none"
          stroke={strokeColor}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((node) => {
        const { x, y } = pt(node);
        const idx = nodes.indexOf(node);
        const active = idx >= 0;
        const isFirst = idx === 0;
        return (
          <g key={node}>
            <circle
              cx={x}
              cy={y}
              r={active ? (isFirst ? 8.5 : 7) : 3.5}
              fill={active ? (isFirst ? startColor : strokeColor) : mutedDot}
            />
            {active && (
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill="#ffffff"
              >
                {idx + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
