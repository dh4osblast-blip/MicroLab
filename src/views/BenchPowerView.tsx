import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  FlaskConical,
  Lock,
  Palette,
  Power,
  Printer,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Thermometer,
  Trash2,
  Unplug,
  Unlock,
  Usb,
  X,
  Zap,
} from 'lucide-react';
import { PowerSupplyMemory, PowerSupplyTestEntry } from '../types/lab';
import { useLabStore } from '../store/useLabStore';
import {
  EvidenceEvent,
  ModbusClient,
  ProtKey,
  TELEMETRY_THRESHOLDS,
  ZK_LIMITS,
  ZK_PGRP_MAX,
  ZK_PROT_KEYS,
  ZkSessionSummary,
  ZkSessionTracker,
  ZkTelemetrySample,
  ZkTransport,
  connectWebBluetooth,
  connectWebSerial,
  createModbusClient,
  createSimulatedTransport,
  isValidProtWrite,
  parseZkRegisters,
  protDivisor,
  protRange,
  protRegAddress,
} from '../services/zkSk150c';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const MAX_HISTORY_POINTS = 120;

const fmtComma = (n: number, dec: number) => n.toFixed(dec).replace('.', ',');
const p2 = (n: number) => String(n).padStart(2, '0');
const fmtHms = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const fmtStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${fmtHms(d)}`;
};
const fmtDateBR = (ms: number) => {
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

const niceScale = (x: number, min: number) => {
  const v = Math.max(x, min);
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * exp >= v - 1e-9) return m * exp;
  }
  return 10 * exp;
};

// ---------------- RotaryKnob (kBuild SVG 1:1) ----------------

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  ticksCount: number;
  tickStep: number;
  decimals: number;
  color: string;
  brandTheme: boolean;
  disabled?: boolean;
  onChange: (nextVal: number) => void;
}

const knobAngle = (val: number, max: number) => -135 + (270 * clamp(val, 0, max)) / max;
const knobPoint = (r: number, deg: number): [number, number] => {
  const rad = (deg * Math.PI) / 180;
  return [140 + r * Math.sin(rad), 140 - r * Math.cos(rad)];
};
const knobArc = (val: number, max: number) => {
  const a = knobAngle(val, max);
  if (a <= -134.9) return '';
  const [x0, y0] = knobPoint(116, -135);
  const [x1, y1] = knobPoint(116, a);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A116 116 0 ${a + 135 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  value,
  min,
  max,
  ticksCount,
  tickStep,
  decimals,
  color,
  brandTheme,
  disabled = false,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const commitValue = useCallback(
    (raw: number) => {
      const factor = 10 ** decimals;
      const rounded = clamp(Math.round(raw * factor) / factor, min, max);
      onChange(rounded);
    },
    [decimals, max, min, onChange]
  );

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el || disabled) return;
    const rect = el.getBoundingClientRect();
    const angle =
      (Math.atan2(clientX - (rect.left + rect.width / 2), -(clientY - (rect.top + rect.height / 2))) *
        180) /
      Math.PI;
    const clampedAngle = clamp(angle, -135, 135);
    commitValue(((clampedAngle + 135) / 270) * max);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      const step = e.ctrlKey ? 1 : e.shiftKey ? 0.01 : 0.1;
      commitValue(value + (e.deltaY < 0 ? 1 : -1) * step);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [commitValue, disabled, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const map: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 10,
      PageDown: -10,
    };
    const delta = map[e.key];
    const step = e.ctrlKey ? 1 : e.shiftKey ? 0.01 : 0.1;
    if (delta !== undefined) {
      e.preventDefault();
      commitValue(value + delta * step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      commitValue(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      commitValue(max);
    }
  };

  const angle = knobAngle(value, max);
  const [needleX, needleY] = knobPoint(66, angle);

  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(decimals))}
      onKeyDown={handleKeyDown}
      onPointerDown={(e) => {
        if (disabled) return;
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      className={`w-36 h-36 mx-auto select-none touch-none rounded-full focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/60 ${
        disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <svg viewBox="0 0 280 280" className="w-full h-full" aria-hidden="true">
        <path
          d={knobArc(max, max)}
          fill="none"
          stroke={brandTheme ? '#D9E0EC' : '#1b2a42'}
          strokeWidth="7"
          strokeLinecap="round"
        />
        {knobArc(value, max) && (
          <path
            d={knobArc(value, max)}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
          />
        )}
        {Array.from({ length: ticksCount + 1 }, (_, j) => {
          const tickAngle = -135 + (270 * (j * tickStep)) / max;
          const isMajor = j % 10 === 0;
          const [x0, y0] = knobPoint(isMajor ? 99 : 104, tickAngle);
          const [x1, y1] = knobPoint(110, tickAngle);
          return (
            <line
              key={`tick-${j}`}
              x1={x0.toFixed(1)}
              y1={y0.toFixed(1)}
              x2={x1.toFixed(1)}
              y2={y1.toFixed(1)}
              stroke={
                isMajor
                  ? brandTheme
                    ? '#091b36'
                    : '#e8eef9'
                  : brandTheme
                    ? '#94a3b8'
                    : '#46526b'
              }
              strokeWidth={isMajor ? 2.4 : 1.2}
            />
          );
        })}
        {Array.from({ length: ticksCount + 1 }, (_, j) => {
          if (j % 10 !== 0) return null;
          const [lx, ly] = knobPoint(131, -135 + (270 * (j * tickStep)) / max);
          return (
            <text
              key={`lbl-${j}`}
              x={lx.toFixed(1)}
              y={ly.toFixed(1)}
              textAnchor="middle"
              dominantBaseline="central"
              fill={brandTheme ? '#414752' : '#9fb0cc'}
              fontSize="14"
              fontFamily="monospace"
            >
              {Number((j * tickStep).toFixed(1))}
            </text>
          );
        })}
        <circle
          cx="140"
          cy="140"
          r="86"
          fill={brandTheme ? '#cbd5e1' : '#0b1320'}
          stroke={brandTheme ? '#94a3b8' : '#1b2a42'}
          strokeWidth="2"
        />
        <circle cx="140" cy="140" r="78" fill={brandTheme ? '#ffffff' : '#e5eaf2'} />
        <line
          x1="140"
          y1="140"
          x2={needleX.toFixed(1)}
          y2={needleY.toFixed(1)}
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="140" cy="140" r="7" fill={color} />
      </svg>
    </div>
  );
};

// ---------------- OscilloscopeCanvas (scope 1:1) ----------------

interface OscilloscopeCanvasProps {
  values: number[];
  timestamps: number[];
  setValue: number | null;
  minScale: number;
  unit: string;
  decimals: number;
  color: string;
  brandTheme: boolean;
  hoverRatio: number | null;
  onHoverRatioChange: (ratio: number | null) => void;
}

const OscilloscopeCanvas: React.FC<OscilloscopeCanvasProps> = ({
  values,
  timestamps,
  setValue,
  minScale,
  unit,
  decimals,
  color,
  brandTheme,
  hoverRatio,
  onHoverRatioChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const top = useMemo(
    () => niceScale(Math.max(...values, setValue || 0, 0) * 1.25, minScale),
    [values, setValue, minScale]
  );
  const divVal = top / 5;
  const divDec = divVal < 0.1 ? 3 : divVal < 1 ? 2 : 1;

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return;

    g.clearRect(0, 0, w, h);

    // Grid 10x5
    g.lineWidth = dpr;
    for (let x = 0; x <= 10; x++) {
      g.strokeStyle =
        x === 5
          ? brandTheme
            ? 'rgba(9,27,54,0.16)'
            : 'rgba(255,255,255,0.17)'
          : brandTheme
            ? 'rgba(9,27,54,0.07)'
            : 'rgba(255,255,255,0.07)';
      g.beginPath();
      g.moveTo((x * w) / 10, 0);
      g.lineTo((x * w) / 10, h);
      g.stroke();
    }
    for (let y = 0; y <= 5; y++) {
      g.strokeStyle =
        y === 0 || y === 5
          ? brandTheme
            ? 'rgba(9,27,54,0.08)'
            : 'rgba(255,255,255,0.07)'
          : brandTheme
            ? 'rgba(9,27,54,0.11)'
            : 'rgba(255,255,255,0.1)';
      g.beginPath();
      g.moveTo(0, (y * h) / 5);
      g.lineTo(w, (y * h) / 5);
      g.stroke();
    }

    // Dashed setpoint line
    if (setValue !== null) {
      g.strokeStyle = color;
      g.globalAlpha = 0.45;
      g.setLineDash([6 * dpr, 6 * dpr]);
      const y = h - (h * setValue) / top;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }

    // Waveform
    if (values.length > 0) {
      g.strokeStyle = color;
      g.lineWidth = 2.2 * dpr;
      g.shadowColor = color;
      g.shadowBlur = brandTheme ? 3 * dpr : 8 * dpr;
      g.beginPath();
      values.forEach((d, idx) => {
        const x = (w * (idx + MAX_HISTORY_POINTS - values.length)) / (MAX_HISTORY_POINTS - 1);
        const y = h - 2 * dpr - (h - 4 * dpr) * Math.min(d / top, 1);
        if (idx === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
      g.shadowBlur = 0;
    }

    // Interactive hover/touch crosshair & tooltip
    if (hoverRatio !== null && values.length > 0) {
      const L = values.length;
      const i = Math.round(hoverRatio * (MAX_HISTORY_POINTS - 1)) - (MAX_HISTORY_POINTS - L);
      if (i >= 0 && i < L) {
        const x = (w * (i + MAX_HISTORY_POINTS - L)) / (MAX_HISTORY_POINTS - 1);
        const y = h - 2 * dpr - (h - 4 * dpr) * Math.min(values[i] / top, 1);
        g.strokeStyle = brandTheme ? 'rgba(9,27,54,0.45)' : 'rgba(180,195,220,0.55)';
        g.lineWidth = dpr;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();

        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, 3.5 * dpr, 0, Math.PI * 2);
        g.fill();

        const secAgo = Math.max(0, (Date.now() - (timestamps[i] || Date.now())) / 1000);
        const txt = `${fmtComma(values[i], decimals)} ${unit} · -${fmtComma(secAgo, 1)} s`;
        g.font = `600 ${11 * dpr}px Poppins, system-ui, sans-serif`;
        const tw = g.measureText(txt).width + 14 * dpr;
        const tx = Math.min(Math.max(4 * dpr, x - tw / 2), w - tw - 4 * dpr);
        g.fillStyle = brandTheme ? 'rgba(9,27,54,0.92)' : 'rgba(11,15,23,0.95)';
        g.strokeStyle = brandTheme ? '#0056ab' : '#2A3954';
        g.lineWidth = dpr;
        g.beginPath();
        g.rect(tx, 4 * dpr, tw, 20 * dpr);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.fillText(txt, tx + 7 * dpr, 18 * dpr);
      }
    }
  }, [values, timestamps, setValue, top, color, brandTheme, hoverRatio, unit, decimals]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    const onResize = () => renderCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderCanvas]);

  const setFromClientX = (clientX: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (!rect.width) return;
    onHoverRatioChange(clamp((clientX - rect.left) / rect.width, 0, 1));
  };

  return (
    <div className="space-y-1">
      <div
        className={`relative h-24 rounded-xl border overflow-hidden ${
          brandTheme ? 'bg-[#F3F6FB] border-[#D9E0EC]' : 'bg-[#0B0F17] border-[#2A3954]'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => setFromClientX(e.clientX)}
          onMouseLeave={() => onHoverRatioChange(null)}
          onTouchStart={(e) => {
            if (e.touches[0]) setFromClientX(e.touches[0].clientX);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) setFromClientX(e.touches[0].clientX);
          }}
          onTouchEnd={() => onHoverRatioChange(null)}
          className="w-full h-full block cursor-crosshair"
        />
      </div>
      <div
        className={`text-[10px] font-mono tabular-nums ${
          brandTheme ? 'text-[#727784]' : 'text-slate-400'
        }`}
      >
        {fmtComma(divVal, divDec)} {unit}/div · 6 s/div
      </div>
    </div>
  );
};

// ---------------- Main BenchPowerView ----------------

export const BenchPowerView: React.FC = () => {
  const {
    state,
    savePowerMemory,
    deletePowerMemory,
    upsertOrderPowerTest,
    attachTelemetryToOrder,
    setPowerSupplyTheme,
    setPowerSupplyStatus,
  } = useLabStore();

  const brandTheme = state.cfg.fonteTema === 'br';

  // Connection & Hardware Refs
  const transportRef = useRef<ZkTransport | null>(null);
  const clientRef = useRef<ModbusClient | null>(null);
  const trackerRef = useRef<ZkSessionTracker | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const confirmOnTimerRef = useRef<number | null>(null);
  const pollFailCountRef = useRef(0);

  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [connMode, setConnMode] = useState<'none' | 'ble' | 'usb' | 'sim'>('none');
  const [connLabel, setConnLabel] = useState('Desconectado');
  const [connError, setConnError] = useState('');
  const [commLost, setCommLost] = useState(false);

  // Modbus & Scale Settings
  const [modbusAddr, setModbusAddr] = useState(1);
  const [baudRate, setBaudRate] = useState(115200);
  const [iscale, setIscale] = useState<100 | 1000>(1000);
  const [showOptionsDrawer, setShowOptionsDrawer] = useState(false);

  // Live Telemetry & Session Feed
  const [sample, setSample] = useState<ZkTelemetrySample | null>(null);
  const [history, setHistory] = useState<ZkTelemetrySample[]>([]);
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);

  // Control & Safety Interlocks
  const [controlUnlocked, setControlUnlocked] = useState(false);
  const [confirmOutputOn, setConfirmOutputOn] = useState(false);
  const [targetVoltage, setTargetVoltage] = useState('5.00');
  const [targetCurrent, setTargetCurrent] = useState('1.000');
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdFeedback, setCmdFeedback] = useState('');

  // Editable Persistent Memories (fonteMem)
  const [selectedMemId, setSelectedMemId] = useState<string>('');
  const [memNameInput, setMemNameInput] = useState('');
  const [confirmDeleteMemId, setConfirmDeleteMemId] = useState<string | null>(null);

  // Protection Group (M0..M10)
  const [protGroup, setProtGroup] = useState(0);
  const [otpUnit, setOtpUnit] = useState<'C' | 'F'>('C');
  const [protReadOk, setProtReadOk] = useState(false);
  const [protBusy, setProtBusy] = useState(false);
  const [protFeedback, setProtFeedback] = useState('');
  const [showWriteProtModal, setShowWriteProtModal] = useState(false);
  const [protValues, setProtValues] = useState<Record<ProtKey, string>>({
    ovp: '48.00',
    ocp: '8.200',
    opp: '150.0',
    lvp: '0.00',
    otp: '85.0',
  });

  // Session Report Modal (relat)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSnapshot, setReportSnapshot] = useState<ZkSessionSummary | null>(null);
  const [reportOrderId, setReportOrderId] = useState<string>('');
  const [reportModel, setReportModel] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [reportStatusMsg, setReportStatusMsg] = useState('');
  const [copiedWpp, setCopiedWpp] = useState(false);
  const [wppFallbackText, setWppFallbackText] = useState('');

  // Dynamic refs for Modbus safety callbacks
  const protContextRef = useRef({
    connected: false,
    outputOn: false,
    controlUnlocked: false,
    protReadOk: false,
    group: 0,
    otpUnit: 'C' as 'C' | 'F',
    iscale: 1000 as 100 | 1000,
  });

  protContextRef.current = {
    connected: connState === 'connected',
    outputOn: Boolean(sample?.outputOn),
    controlUnlocked,
    protReadOk,
    group: protGroup,
    otpUnit,
    iscale,
  };

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearConfirmOn = useCallback(() => {
    setConfirmOutputOn(false);
    if (confirmOnTimerRef.current !== null) {
      window.clearTimeout(confirmOnTimerRef.current);
      confirmOnTimerRef.current = null;
    }
  }, []);

  const cleanupTransport = useCallback(
    async (reason?: string, emergency = false) => {
      stopPolling();
      clearConfirmOn();
      if (trackerRef.current) {
        trackerRef.current.markClosed(emergency);
        setEvents([...trackerRef.current.events]);
      }
      const t = transportRef.current;
      transportRef.current = null;
      clientRef.current = null;
      if (t) {
        await t.close();
      }
      setConnState('disconnected');
      setConnMode('none');
      setConnLabel('Desconectado');
      setCommLost(false);
      setControlUnlocked(false);
      setProtReadOk(false);
      setSample(null);
      if (reason) setConnError(reason);
    },
    [clearConfirmOn, stopPolling]
  );

  // Report runtime power supply status for idle/logout/PWA update safety interlocks
  useEffect(() => {
    setPowerSupplyStatus({
      connected: connState === 'connected',
      outputOn: Boolean(sample?.outputOn),
    });
  }, [connState, sample?.outputOn, setPowerSupplyStatus]);

  useEffect(() => {
    return () => {
      setPowerSupplyStatus({ connected: false, outputOn: false });
      if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
      if (confirmOnTimerRef.current !== null) window.clearTimeout(confirmOnTimerRef.current);
      if (transportRef.current) {
        void transportRef.current.close();
      }
    };
  }, [setPowerSupplyStatus]);

  const startSessionWithTransport = useCallback(
    async (transport: ZkTransport, mode: 'ble' | 'usb' | 'sim') => {
      const client = createModbusClient(
        transport,
        () => {
          const ctx = protContextRef.current;
          return ctx.connected && !ctx.outputOn && ctx.controlUnlocked && ctx.protReadOk;
        },
        () => ({
          group: protContextRef.current.group,
          otpUnit: protContextRef.current.otpUnit,
          iscale: protContextRef.current.iscale,
        })
      );

      transportRef.current = transport;
      clientRef.current = client;
      trackerRef.current = new ZkSessionTracker(transport.label);
      pollFailCountRef.current = 0;
      setHistory([]);
      setEvents([]);
      setCommLost(false);
      setProtReadOk(false);
      setControlUnlocked(false);
      setConnError('');

      const regs = await client.readRegisters(modbusAddr, 0, 24);
      const firstSample = parseZkRegisters(regs, iscale);
      trackerRef.current.feed(firstSample, iscale);
      setSample(firstSample);
      setHistory([firstSample]);
      setEvents([...trackerRef.current.events]);
      setTargetVoltage(firstSample.vSet.toFixed(2));
      setTargetCurrent(firstSample.iSet.toFixed(iscale === 1000 ? 3 : 2));
      if (regs[0x13] === 1) setOtpUnit('F');
      else setOtpUnit('C');

      setConnState('connected');
      setConnMode(mode);
      setConnLabel(transport.label);
      setCmdFeedback('Conectado. Nada foi escrito na fonte.');

      pollTimerRef.current = window.setInterval(async () => {
        if (!clientRef.current || transportRef.current !== transport) return;
        try {
          const nextRegs = await clientRef.current.readRegisters(modbusAddr, 0, 24);
          pollFailCountRef.current = 0;
          setCommLost(false);
          const nextSample = parseZkRegisters(nextRegs, protContextRef.current.iscale);
          trackerRef.current?.feed(nextSample, protContextRef.current.iscale);
          setSample(nextSample);
          setHistory((prev) => [...prev.slice(-(MAX_HISTORY_POINTS - 1)), nextSample]);
          if (trackerRef.current) setEvents([...trackerRef.current.events]);
        } catch {
          pollFailCountRef.current += 1;
          if (pollFailCountRef.current >= 6) {
            setCommLost(true);
            setConnError(
              'Sem comunicação com a fonte: desconexão liberada. Confira no visor se a saída continua ligada.'
            );
          }
        }
      }, 500);
    },
    [iscale, modbusAddr]
  );

  const handleConnect = async (mode: 'ble' | 'usb' | 'sim') => {
    if (connState !== 'disconnected') return;
    setConnState('connecting');
    setConnError('');
    try {
      let transport: ZkTransport;
      const onUnexpectedDisconnect = () => {
        void cleanupTransport('Conexão física interrompida inesperadamente pela fonte ou cabo.', true);
      };
      if (mode === 'ble') {
        transport = await connectWebBluetooth(onUnexpectedDisconnect);
      } else if (mode === 'usb') {
        transport = await connectWebSerial(baudRate, onUnexpectedDisconnect);
      } else {
        transport = createSimulatedTransport(iscale);
      }
      await startSessionWithTransport(transport, mode);
    } catch (err) {
      await cleanupTransport(undefined, true);
      const msg = err instanceof Error ? err.message : 'Falha ao conectar com a fonte.';
      setConnError(msg);
    }
  };

  const handleDisconnect = async () => {
    if (sample?.outputOn && !commLost) {
      setConnError('Intertravamento ativo: desligue a saída (OUTPUT OFF) antes de desconectar.');
      return;
    }
    await cleanupTransport();
  };

  const vNum = parseFloat(targetVoltage) || 0;
  const iNum = parseFloat(targetCurrent) || 0;
  const pendingV = Boolean(sample && Math.abs(vNum - sample.vSet) > 0.004);
  const pendingI = Boolean(
    sample && Math.abs(iNum - sample.iSet) > (iscale === 1000 ? 0.0004 : 0.004)
  );

  const handleApplySetpoint = async (vOverride?: number, iOverride?: number) => {
    if (!clientRef.current || connState !== 'connected') return;
    if (!controlUnlocked) {
      setCmdFeedback('Libere o controle de bancada antes de alterar V-SET ou I-SET.');
      return;
    }
    const vVal = vOverride ?? vNum;
    const iVal = Math.round((iOverride ?? iNum) * iscale) / iscale;
    if (!(vVal >= ZK_LIMITS.vmin && vVal <= ZK_LIMITS.vmax) || !(iVal >= 0 && iVal <= ZK_LIMITS.imax)) {
      setCmdFeedback(
        `Valores fora do limite: tensão de ${fmtComma(ZK_LIMITS.vmin, 1)} a ${ZK_LIMITS.vmax} V e corrente de 0 a ${fmtComma(ZK_LIMITS.imax, 1)} A.`
      );
      return;
    }

    setCmdBusy(true);
    setCmdFeedback('');
    try {
      await clientRef.current.writeRegister(modbusAddr, 0, Math.round(vVal * 100));
      await clientRef.current.writeRegister(modbusAddr, 1, Math.round(iVal * iscale));
      setTargetVoltage(vVal.toFixed(2));
      setTargetCurrent(iVal.toFixed(iscale === 1000 ? 3 : 2));
      const d = iscale === 1000 ? 3 : 2;
      trackerRef.current?.recordCommand(
        'cmd',
        `Comando enviado: V-SET ${fmtComma(vVal, 2)} V · I-SET ${fmtComma(iVal, d)} A`
      );
      if (trackerRef.current) setEvents([...trackerRef.current.events]);
      const uInWarn =
        sample && sample.uIn > 0 && vVal > sample.uIn - 1
          ? ` Atenção: a entrada é ${fmtComma(sample.uIn, 2)} V e a saída pode não chegar a ${fmtComma(vVal, 2)} V.`
          : '';
      setCmdFeedback(
        `Aplicado: ${fmtComma(vVal, 2)} V e ${fmtComma(iVal, d)} A. Confira no visor da fonte.${uInWarn}`
      );
    } catch (err) {
      setCmdFeedback(err instanceof Error ? err.message : 'Erro ao gravar setpoint.');
    } finally {
      setCmdBusy(false);
    }
  };

  const handleToggleOutput = async () => {
    if (!clientRef.current || connState !== 'connected' || !sample) return;
    if (!controlUnlocked) {
      setCmdFeedback('Intertravamento: ative "Liberar Controle" antes de acionar a saída.');
      return;
    }

    if (sample.outputOn) {
      clearConfirmOn();
      setCmdBusy(true);
      try {
        await clientRef.current.writeRegister(modbusAddr, 0x12, 0);
        trackerRef.current?.recordCommand('cmd', 'Comando: desligar saída');
        if (trackerRef.current) setEvents([...trackerRef.current.events]);
        setCmdFeedback('Saída desligada.');
      } catch (err) {
        setCmdFeedback(err instanceof Error ? err.message : 'Erro ao desligar saída.');
      } finally {
        setCmdBusy(false);
      }
      return;
    }

    if (!confirmOutputOn) {
      setConfirmOutputOn(true);
      if (confirmOnTimerRef.current) window.clearTimeout(confirmOnTimerRef.current);
      confirmOnTimerRef.current = window.setTimeout(() => {
        setConfirmOutputOn(false);
      }, 6000);
      return;
    }

    clearConfirmOn();
    setCmdBusy(true);
    try {
      await clientRef.current.writeRegister(modbusAddr, 0x12, 1);
      trackerRef.current?.recordCommand('cmd', 'Comando: ligar saída');
      if (trackerRef.current) setEvents([...trackerRef.current.events]);
      setCmdFeedback('Saída ligada.');
    } catch (err) {
      setCmdFeedback(err instanceof Error ? err.message : 'Erro ao ligar saída.');
    } finally {
      setCmdBusy(false);
    }
  };

  // Memories CRUD (fonteMem)
  const handleSelectMemory = (mem: PowerSupplyMemory) => {
    setSelectedMemId(mem.id);
    setConfirmDeleteMemId(null);
    setTargetVoltage(mem.v.toFixed(2));
    setTargetCurrent(mem.i.toFixed(iscale === 1000 ? 3 : 2));
    setCmdFeedback(
      `Memória "${mem.nome}" carregada nos campos. Libere o controle e toque em "Aplicar V e I".`
    );
  };

  const handleSaveMemory = () => {
    const vToSave = sample ? sample.vSet : vNum;
    const iToSave = sample ? sample.iSet : iNum;
    const rawName = memNameInput.trim() || `${fmtComma(vToSave, 2)} V`;
    const created = savePowerMemory({ nome: rawName, v: vToSave, i: iToSave });
    if (!created) {
      setConnError(
        `Memória não salva: informe nome e valores dentro dos limites (${fmtComma(ZK_LIMITS.vmin, 1)}–${ZK_LIMITS.vmax} V e 0–${fmtComma(ZK_LIMITS.imax, 1)} A).`
      );
      return;
    }
    setMemNameInput('');
    setSelectedMemId(created.id);
    setCmdFeedback(
      `Memória "${created.nome}" salva (${sample ? 'valores atuais da fonte' : 'valores dos campos'}).`
    );
  };

  const handleConfirmDeleteMemory = (id: string) => {
    deletePowerMemory(id);
    if (selectedMemId === id) setSelectedMemId('');
    setConfirmDeleteMemId(null);
  };

  // Protections
  const handleReadProtections = async () => {
    if (!clientRef.current || connState !== 'connected') return;
    setProtBusy(true);
    setProtFeedback('');
    try {
      const nextVals: Record<ProtKey, string> = { ...protValues };
      for (const k of ZK_PROT_KEYS) {
        const reg = protRegAddress(k, protGroup);
        const [raw] = await clientRef.current.readRegisters(modbusAddr, reg, 1);
        const div = protDivisor(k, iscale);
        const def = protRange(k, otpUnit);
        const converted = raw / div;
        if (converted > def.readMaxPlausible) {
          throw new Error(`Leitura inconsistente em ${def.label} (M${protGroup}). Verifique escala/endereço.`);
        }
        nextVals[k] = converted.toFixed(k === 'ocp' && iscale === 100 ? 2 : def.decimals);
      }
      setProtValues(nextVals);
      setProtReadOk(true);
      setProtFeedback(`Proteções do grupo M${protGroup} lidas da fonte.`);
    } catch (err) {
      setProtReadOk(false);
      setProtFeedback(err instanceof Error ? err.message : 'Falha ao ler proteções.');
    } finally {
      setProtBusy(false);
    }
  };

  const canEditProtections =
    connState === 'connected' && !sample?.outputOn && controlUnlocked && protReadOk;

  const handleWriteProtectionsConfirmed = async () => {
    if (!clientRef.current || !canEditProtections) return;
    setShowWriteProtModal(false);
    setProtBusy(true);
    setProtFeedback('');
    try {
      const summaryParts: string[] = [];
      for (const k of ZK_PROT_KEYS) {
        const reg = protRegAddress(k, protGroup);
        const div = protDivisor(k, iscale);
        const def = protRange(k, otpUnit);
        const valNum = parseFloat(protValues[k]);
        const raw = Math.round(valNum * div);
        if (!isValidProtWrite(reg, raw, { group: protGroup, otpUnit, iscale })) {
          throw new Error(`${def.label} fora da faixa segura (${def.min} a ${def.max} ${def.unit}).`);
        }
        await clientRef.current.writeRegister(modbusAddr, reg, raw);
        summaryParts.push(`${def.label}: ${fmtComma(valNum, def.decimals)} ${def.unit}`);
      }
      trackerRef.current?.recordCommand(
        'cfg',
        `Proteções gravadas (grupo M${protGroup}): ${summaryParts.join(' · ')}`
      );
      if (trackerRef.current) setEvents([...trackerRef.current.events]);
      setProtFeedback(`Proteções gravadas na fonte (grupo M${protGroup}). Confira no visor.`);
    } catch (err) {
      setProtFeedback(err instanceof Error ? err.message : 'Erro ao gravar proteções.');
    } finally {
      setProtBusy(false);
    }
  };

  const buildWhatsappReportText = (sum: ZkSessionSummary, notesOverride?: string) => {
    const devModel = reportModel.trim() || selectedReportOrder?.device || 'não informado';
    const d = iscale === 1000 ? 3 : 2;
    const nf = (x: number | null, dec: number) => (x === null ? '--' : fmtComma(x, dec));
    const notesStr = (notesOverride !== undefined ? notesOverride : reportNotes).trim();
    return [
      '*MicroLab · Assistência técnica*',
      'Teste na fonte de bancada',
      `Aparelho: ${devModel}${selectedReportOrder ? ` (OS nº ${selectedReportOrder.id})` : ''}`,
      `Data: ${fmtDateBR(sum.ini)}`,
      '',
      'O que observamos:',
      ...(sum.evid.length > 0
        ? sum.evid.map((e) => `• ${e.cliText || e.text}`)
        : [
            '• O teste não apontou os indícios que monitoramos (consumo em espera, curto/sobrecarga e consumo alto sustentado).',
          ]),
      ...(sum.prots.length > 0
        ? [`• A fonte acionou proteção durante o teste: ${sum.prots.map((x) => x.nm).join(', ')}.`]
        : []),
      '',
      `Medições: corrente mínima ${nf(sum.imin, d)} A, média ${nf(sum.iavg, d)} A e pico ${nf(
        sum.ipk,
        d
      )} A; potência máxima ${nf(sum.pmax, 1)} W; tempo com a saída ligada ${fmtDur(sum.ms)}.`,
      ...(notesStr ? ['', `Observação do técnico: ${notesStr}`] : []),
      '',
      'Orçamento antes do serviço.',
      'WhatsApp (71) 99129-3552',
    ].join('\n');
  };

  // Session Report (relat + testeOS + docPrint + wppTxt)
  const buildTestEntry = (sum: ZkSessionSummary, notesText: string): PowerSupplyTestEntry => {
    const dg: string[] = [];
    if (sum.fugaA !== null) {
      dg.push(`consumo em espera de cerca de ${Math.round(sum.fugaA * 1000)} mA antes do boot`);
    }
    if (sum.evid.some((e) => e.kind === 'curto')) {
      dg.push('limite de corrente (CC) ou disparo de proteção');
    }
    if (sum.evid.some((e) => e.kind === 'alto')) {
      dg.push('consumo alto sustentado');
    }
    const evidencias = sum.evid
      .filter(
        (e): e is typeof e & { kind: 'fuga' | 'pulso' | 'curto' | 'alto' | 'prot' } =>
          e.kind === 'fuga' ||
          e.kind === 'pulso' ||
          e.kind === 'curto' ||
          e.kind === 'alto' ||
          e.kind === 'prot'
      )
      .map((e) => ({
        kind: e.kind,
        text: e.text,
        ...(e.cliText ? { cliText: e.cliText } : {}),
      }));
    return {
      sid: sum.ini,
      dt: fmtStamp(sum.ini),
      dur: fmtDur(sum.ms),
      fugaMa: sum.fugaA !== null ? Math.round(sum.fugaA * 1000) : null,
      bootA: sum.bootPk !== null ? Math.round(sum.bootPk * 1000) / 1000 : null,
      ipkA: sum.ipk !== null ? Math.round(sum.ipk * 1000) / 1000 : null,
      vavgV: sum.vavg !== null ? Math.round(sum.vavg * 100) / 100 : null,
      iminA: sum.imin !== null ? Math.round(sum.imin * 1000) / 1000 : null,
      iavgA: sum.iavg !== null ? Math.round(sum.iavg * 1000) / 1000 : null,
      pmaxW: sum.pmax !== null ? Math.round(sum.pmax * 100) / 100 : null,
      via: sum.via,
      prots: sum.prots.map((p) => p.nm),
      evidencias,
      cliResumo: buildWhatsappReportText(sum, notesText),
      diag: dg.length > 0 ? dg.join('; ') : 'nenhum indício detectado',
      nt: notesText.trim(),
    };
  };

  const syncReportToOs = (orderIdStr: string, notesText: string, sum: ZkSessionSummary) => {
    const orderIdNum = orderIdStr ? Number(orderIdStr) : null;
    const entry = buildTestEntry(sum, notesText);
    upsertOrderPowerTest(orderIdNum, entry);
    if (orderIdNum !== null) {
      const target = state.orders.find((o) => o.id === orderIdNum);
      attachTelemetryToOrder(orderIdNum, {
        voltage: Number((sum.vavg ?? sum.vset ?? 0).toFixed(2)),
        current: Number((sum.ipk ?? sum.iavg ?? 0).toFixed(3)),
        power: Number((sum.pmax ?? sum.pavg ?? 0).toFixed(2)),
        note: `[ZK-SK150C · ${entry.dur}] ${entry.diag}${notesText.trim() ? ` · ${notesText.trim()}` : ''}`,
        recordedAt: fmtStamp(sum.fim),
      });
      setReportStatusMsg(
        target ? `Cartão de Diagnóstico Elétrico salvo na OS nº ${target.id} (${target.code}).` : ''
      );
    } else {
      setReportStatusMsg('Vínculo removido: o resumo saiu da OS.');
    }
  };

  const handleOpenReport = () => {
    if (!trackerRef.current) {
      setConnError('Ainda não há sessão registrada. Conecte a fonte e faça o teste.');
      return;
    }
    const snap = trackerRef.current.getSummary();
    setReportSnapshot(snap);
    setReportStatusMsg('');
    setCopiedWpp(false);
    setWppFallbackText('');
    setShowReportModal(true);
  };

  const sortedOrders = useMemo(
    () => state.orders.slice().sort((a, b) => b.id - a.id),
    [state.orders]
  );

  const selectedReportOrder = useMemo(
    () => (reportOrderId ? state.orders.find((o) => o.id === Number(reportOrderId)) || null : null),
    [reportOrderId, state.orders]
  );

  const handleCopyReportWhatsapp = async () => {
    if (!reportSnapshot) return;
    if (reportOrderId) syncReportToOs(reportOrderId, reportNotes, reportSnapshot);
    const txt = buildWhatsappReportText(reportSnapshot);
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedWpp(true);
      setReportStatusMsg('Resumo copiado. Cole no WhatsApp.');
      window.setTimeout(() => setCopiedWpp(false), 2500);
    } catch {
      setWppFallbackText(txt);
      setReportStatusMsg('Não foi possível copiar automaticamente. Selecione e copie o texto abaixo.');
    }
  };

  const handlePrintA4Report = () => {
    if (!reportSnapshot) return;
    if (reportOrderId) syncReportToOs(reportOrderId, reportNotes, reportSnapshot);
    window.print();
  };

  const dec = iscale === 1000 ? 3 : 2;
  const disconnectBlocked = Boolean(sample?.outputOn && !commLost);
  const vArr = useMemo(() => history.map((s) => s.vOut), [history]);
  const iArr = useMemo(() => history.map((s) => s.iOut), [history]);
  const pArr = useMemo(() => history.map((s) => s.pOut), [history]);
  const tArr = useMemo(() => history.map((s) => s.timestamp), [history]);

  // Colors per theme
  const colV = brandTheme ? '#0056ab' : '#06B6D4';
  const colI = brandTheme ? '#ea580c' : '#F59E0B';
  const colW = brandTheme ? '#16A34A' : '#10B981';

  const cardBg = brandTheme
    ? 'bg-white border-[#D9E0EC] text-[#091b36]'
    : 'bg-[#131B2E] border-[#2A3954] text-slate-100';
  const subCardBg = brandTheme
    ? 'bg-[#F3F6FB] border-[#D9E0EC] text-[#091b36]'
    : 'bg-[#0B0F17] border-[#2A3954] text-slate-100';
  const mutedText = brandTheme ? 'text-[#727784]' : 'text-slate-400';

  const activeSession = trackerRef.current;

  return (
    <>
      <div className={`space-y-5 print:hidden ${brandTheme ? 'text-[#091b36]' : 'text-slate-100'}`}>
        {/* Top Hardware Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="w-5 h-5 text-[#06B6D4]" />
              <h1 className={`text-lg sm:text-xl font-bold tracking-tight ${brandTheme ? 'text-[#091b36]' : 'text-white'}`}>
                Fonte de bancada · ZK-SK150C · 48 V / 8,2 A
              </h1>
              {connState === 'disconnected' && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300">
                  DESCONECTADO
                </span>
              )}
              {connState === 'connected' && (connMode === 'ble' || connMode === 'usb') && (
                <span className="px-2 py-0.5 rounded-md bg-[#10B981]/20 border border-[#10B981]/50 text-[10px] font-bold text-[#10B981]">
                  CONECTADO · {connMode === 'ble' ? 'BLUETOOTH BLE' : 'USB SERIAL'}
                </span>
              )}
              {connState === 'connected' && connMode === 'sim' && (
                <span className="px-2 py-0.5 rounded-md bg-[#F59E0B]/20 border border-[#F59E0B] text-[10px] font-bold text-[#F59E0B]">
                  SIMULAÇÃO ATIVA
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${mutedText}`}>
              Modo: <strong>{!sample ? '--' : sample.isCC ? 'CC (corrente)' : 'CV (tensão)'}</strong> · Saída:{' '}
              <strong>{!sample ? '--' : sample.outputOn ? 'Ligada' : 'Desligada'}</strong> · Proteção:{' '}
              <strong>{sample ? sample.protLabel : '--'}</strong> · {connLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connState === 'disconnected' ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleConnect('ble')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Conectar Bluetooth</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleConnect('usb')}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    brandTheme
                      ? 'bg-white border-[#D9E0EC] text-[#091b36] hover:bg-[#F3F6FB]'
                      : 'bg-[#131B2E] border-[#06B6D4]/50 text-[#06B6D4] hover:bg-[#1a243b]'
                  }`}
                >
                  <Usb className="w-4 h-4" />
                  <span>Conectar USB</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleConnect('sim')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/60 text-[#F59E0B] hover:bg-[#F59E0B]/25 px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>Simulação</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={disconnectBlocked}
                onClick={() => void handleDisconnect()}
                title={
                  disconnectBlocked
                    ? 'Desligue a saída antes de desconectar'
                    : 'Desconectar transporte'
                }
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold disabled:opacity-45 cursor-pointer ${
                  brandTheme
                    ? 'bg-white border-[#D9E0EC] text-[#091b36]'
                    : 'bg-[#131B2E] border-[#2A3954] text-slate-200 hover:text-white'
                }`}
              >
                <Unplug className="w-4 h-4" />
                <span>
                  {disconnectBlocked
                    ? 'Desconectar (desligue a saída)'
                    : commLost
                      ? 'Desconexão Emergência'
                      : 'Desconectar'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowOptionsDrawer((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                brandTheme
                  ? 'bg-white border-[#D9E0EC] text-[#414752]'
                  : 'bg-[#131B2E] border-[#2A3954] text-slate-300 hover:text-white'
              }`}
            >
              <Settings2 className="w-4 h-4 text-[#06B6D4]" />
              <span>Opções &amp; Proteções</span>
            </button>

            <button
              type="button"
              onClick={() => setPowerSupplyTheme(brandTheme ? '' : 'br')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                brandTheme
                  ? 'bg-white border-[#D9E0EC] text-[#414752]'
                  : 'bg-[#131B2E] border-[#2A3954] text-slate-300 hover:text-white'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Cores: {brandTheme ? 'marca' : 'visor'}</span>
            </button>

            {activeSession && (
              <button
                type="button"
                onClick={handleOpenReport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] text-[#0B0F17] hover:bg-[#34d399] px-3.5 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                <span>Gerar Relatório</span>
              </button>
            )}
          </div>
        </div>

        {/* Simulation Warning */}
        {connState === 'connected' && connMode === 'sim' && (
          <div className="rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B] px-4 py-2.5 flex items-center gap-2.5 text-xs text-[#F59E0B] font-semibold">
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>
              MODO DEMONSTRAÇÃO / SIMULAÇÃO ATIVO: Leituras fictícias para validação da bancada sem hardware físico.
            </span>
          </div>
        )}

        {/* Feedback / Alerts */}
        {(connError || cmdFeedback || (sample && sample.protCode !== 0)) && (
          <div className="space-y-2">
            {sample && sample.protCode !== 0 && (
              <div className="rounded-xl bg-[#DC2626]/20 border border-[#DC2626] px-4 py-2.5 text-xs font-bold text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>Proteção acionada: {sample.protLabel}</span>
              </div>
            )}
            {(connError || cmdFeedback) && (
              <div
                className={`rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-2 border ${
                  connError
                    ? 'bg-[#DC2626]/15 border-[#DC2626]/60 text-red-400'
                    : 'bg-[#06B6D4]/15 border-[#06B6D4]/50 text-[#06B6D4]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{connError || cmdFeedback}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConnError('');
                    setCmdFeedback('');
                  }}
                  className="p-1 rounded hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Options & Protections Drawer */}
        {showOptionsDrawer && (
          <div className={`rounded-2xl border p-5 space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#06B6D4]">
                Modbus RTU &amp; Proteções M0–M10 (Escrita bloqueada para resets/fábrica)
              </h2>
              <button
                type="button"
                onClick={() => setShowOptionsDrawer(false)}
                className={`text-xs cursor-pointer ${mutedText}`}
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className={`rounded-xl border p-3 ${subCardBg}`}>
                <label className={`block text-[11px] mb-1 ${mutedText}`}>Endereço Modbus</label>
                <input
                  type="number"
                  min={1}
                  max={247}
                  disabled={connState !== 'disconnected'}
                  value={modbusAddr}
                  onChange={(e) => setModbusAddr(clamp(parseInt(e.target.value, 10) || 1, 1, 247))}
                  className="w-full rounded-lg border border-slate-600/40 bg-transparent px-2.5 py-1.5 font-mono disabled:opacity-50"
                />
              </div>
              <div className={`rounded-xl border p-3 ${subCardBg}`}>
                <label className={`block text-[11px] mb-1 ${mutedText}`}>Baud (USB)</label>
                <select
                  disabled={connState !== 'disconnected'}
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-600/40 bg-transparent px-2.5 py-1.5 font-mono disabled:opacity-50"
                >
                  {[115200, 9600, 19200, 38400, 57600].map((b) => (
                    <option key={b} value={b} className="text-slate-900">
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`rounded-xl border p-3 ${subCardBg}`}>
                <label className={`block text-[11px] mb-1 ${mutedText}`}>Escala da corrente</label>
                <select
                  value={iscale}
                  onChange={(e) => {
                    const val = Number(e.target.value) as 100 | 1000;
                    setIscale(val);
                    setProtReadOk(false);
                    if (val !== 1000) {
                      setCmdFeedback(
                        'Atenção: nesta fonte (modelo 4008) a corrente usa 3 casas (÷1000). Confira o I-SET no visor da fonte.'
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-slate-600/40 bg-transparent px-2.5 py-1.5 font-mono"
                >
                  <option value={1000} className="text-slate-900">
                    ÷1000 (0,001 A) · modelo 4008
                  </option>
                  <option value={100} className="text-slate-900">
                    ÷100 (0,01 A) · visor 2 casas
                  </option>
                </select>
              </div>
            </div>

            <div className={`rounded-xl border p-4 space-y-3 ${subCardBg}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  Proteções da fonte (M0–M10)
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={protGroup}
                    onChange={(e) => {
                      setProtGroup(Number(e.target.value));
                      setProtReadOk(false);
                    }}
                    className="rounded-lg border border-slate-600/40 bg-transparent px-2.5 py-1 text-xs font-mono"
                  >
                    {Array.from({ length: ZK_PGRP_MAX + 1 }, (_, g) => (
                      <option key={g} value={g} className="text-slate-900">
                        M{g}
                      </option>
                    ))}
                  </select>
                  <select
                    value={otpUnit}
                    onChange={(e) => {
                      setOtpUnit(e.target.value as 'C' | 'F');
                      setProtReadOk(false);
                    }}
                    className="rounded-lg border border-slate-600/40 bg-transparent px-2 py-1 text-xs font-mono"
                  >
                    <option value="C" className="text-slate-900">
                      °C
                    </option>
                    <option value="F" className="text-slate-900">
                      °F
                    </option>
                  </select>
                  <button
                    type="button"
                    disabled={connState !== 'connected' || protBusy}
                    onClick={() => void handleReadProtections()}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${protBusy ? 'animate-spin' : ''}`} />
                    <span>Ler da fonte</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                {ZK_PROT_KEYS.map((k) => {
                  const def = protRange(k, otpUnit);
                  return (
                    <div key={k} className="space-y-1">
                      <label className={`block text-[10px] ${mutedText}`}>
                        {def.label} ({def.unit}) [{def.min}–{def.max}]
                      </label>
                      <input
                        type="number"
                        step={k === 'ocp' ? '0.001' : '0.1'}
                        disabled={!canEditProtections}
                        value={protValues[k]}
                        onChange={(e) => setProtValues((p) => ({ ...p, [k]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-600/40 bg-transparent px-2 py-1 font-mono disabled:opacity-50"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className={mutedText}>
                  {protFeedback ||
                    (canEditProtections
                      ? 'Saída desligada e controle liberado: proteções liberadas para edição.'
                      : 'Desligue a saída e libere o controle para alterar proteções.')}
                </span>
                <button
                  type="button"
                  disabled={!canEditProtections || protBusy}
                  onClick={() => setShowWriteProtModal(true)}
                  className="rounded-lg bg-[#10B981] text-[#0B0F17] px-3.5 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer"
                >
                  Gravar proteções
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3 Synchronized Canvas Oscilloscopes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Scope 1: Voltage */}
          <div className={`rounded-2xl border p-4 space-y-2.5 ${cardBg}`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${mutedText}`}>Tensão de saída</span>
              <span className="font-mono font-bold" style={{ color: colV }}>
                V-SET {sample ? `${fmtComma(sample.vSet, 2)} V` : '--'}
              </span>
            </div>
            <OscilloscopeCanvas
              values={vArr}
              timestamps={tArr}
              setValue={sample ? sample.vSet : null}
              minScale={1}
              unit="V"
              decimals={2}
              color={colV}
              brandTheme={brandTheme}
              hoverRatio={hoverRatio}
              onHoverRatioChange={setHoverRatio}
            />
            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-3xl font-bold" style={{ color: colV }}>
                {sample ? fmtComma(sample.vOut, 2) : '--,--'}
              </span>
              <span className={`text-sm font-semibold ${mutedText}`}>V</span>
            </div>
          </div>

          {/* Scope 2: Current */}
          <div className={`rounded-2xl border p-4 space-y-2.5 ${cardBg}`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${mutedText}`}>Corrente de saída</span>
              <span className="font-mono font-bold" style={{ color: colI }}>
                I-SET {sample ? `${fmtComma(sample.iSet, dec)} A` : '--'}
              </span>
            </div>
            <OscilloscopeCanvas
              values={iArr}
              timestamps={tArr}
              setValue={sample ? sample.iSet : null}
              minScale={0.1}
              unit="A"
              decimals={dec}
              color={colI}
              brandTheme={brandTheme}
              hoverRatio={hoverRatio}
              onHoverRatioChange={setHoverRatio}
            />
            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-3xl font-bold" style={{ color: colI }}>
                {sample ? fmtComma(sample.iOut, dec) : iscale === 1000 ? '-,---' : '-,--'}
              </span>
              <span className={`text-sm font-semibold ${mutedText}`}>A</span>
            </div>
          </div>

          {/* Scope 3: Power */}
          <div className={`rounded-2xl border p-4 space-y-2.5 ${cardBg}`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${mutedText}`}>Potência</span>
              <span className={`font-mono text-[11px] flex items-center gap-1 ${mutedText}`}>
                <Thermometer className="w-3.5 h-3.5" style={{ color: colW }} />
                {sample ? `${fmtComma(sample.tempC, 1)} °C` : '-- °C'}
              </span>
            </div>
            <OscilloscopeCanvas
              values={pArr}
              timestamps={tArr}
              setValue={null}
              minScale={1}
              unit="W"
              decimals={1}
              color={colW}
              brandTheme={brandTheme}
              hoverRatio={hoverRatio}
              onHoverRatioChange={setHoverRatio}
            />
            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-3xl font-bold" style={{ color: colW }}>
                {sample ? fmtComma(sample.pOut, 1) : '---,-'}
              </span>
              <span className={`text-sm font-semibold ${mutedText}`}>W</span>
            </div>
          </div>
        </div>

        {/* 6 Live Info Readouts */}
        <div className={`rounded-2xl border p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs ${cardBg}`}>
          <div>
            <span className={`block text-[10px] uppercase ${mutedText}`}>Entrada</span>
            <strong className="font-mono text-sm tabular-nums">
              {sample ? `${fmtComma(sample.uIn, 2)} V` : '-- V'}
            </strong>
          </div>
          <div>
            <span className={`block text-[10px] uppercase ${mutedText}`}>Temperatura</span>
            <strong className="font-mono text-sm tabular-nums">
              {sample ? `${fmtComma(sample.tempC, 1)} °C` : '-- °C'}
            </strong>
          </div>
          <div>
            <span className={`block text-[10px] uppercase ${mutedText}`}>Capacidade</span>
            <strong className="font-mono text-sm tabular-nums">
              {sample ? `${fmtComma(sample.ah, 3)} Ah` : '-- Ah'}
            </strong>
          </div>
          <div>
            <span className={`block text-[10px] uppercase ${mutedText}`}>Energia</span>
            <strong className="font-mono text-sm tabular-nums">
              {sample ? `${fmtComma(sample.wh, 3)} Wh` : '-- Wh'}
            </strong>
          </div>
          <div>
            <span className={`block text-[10px] uppercase ${mutedText}`}>Tempo ligada</span>
            <strong className="font-mono text-sm tabular-nums">
              {sample ? sample.durationStr : '--:--:--'}
            </strong>
          </div>
          <div>
            <span className={`block text-[10px] uppercase ${mutedText}`}>Modelo / firmware</span>
            <strong className="font-mono text-sm tabular-nums">
              {sample ? `${sample.model} / ${sample.firmware}` : '-- / --'}
            </strong>
          </div>
        </div>

        {/* Memories & Rotary Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Persistent Memories (fonteMem) */}
          <div className={`lg:col-span-5 rounded-2xl border p-5 space-y-4 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Memórias salvas</h2>
              <span className={`text-[11px] font-mono ${mutedText}`}>
                {(state.fonteMem || []).length} presets
              </span>
            </div>

            {(state.fonteMem || []).length === 0 ? (
              <p className={`text-xs ${mutedText}`}>
                Nenhuma memória salva. Ajuste a tensão e a corrente e toque em &quot;Salvar como memória&quot;.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(state.fonteMem || []).map((mem) => {
                  const active = selectedMemId === mem.id;
                  return (
                    <button
                      key={mem.id}
                      type="button"
                      onClick={() => handleSelectMemory(mem)}
                      className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#06B6D4]/15 border-[#06B6D4]'
                          : brandTheme
                            ? 'bg-[#F3F6FB] border-[#D9E0EC] hover:border-[#0056ab]'
                            : 'bg-[#0B0F17] border-[#2A3954] hover:border-slate-500'
                      }`}
                    >
                      <span className="block text-xs font-bold truncate">{mem.nome}</span>
                      <span className={`block text-[11px] font-mono tabular-nums mt-0.5 ${mutedText}`}>
                        {fmtComma(mem.v, 2)} V · {fmtComma(mem.i, 3)} A
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <input
                type="text"
                maxLength={30}
                value={memNameInput}
                onChange={(e) => setMemNameInput(e.target.value)}
                placeholder="Nome da memória (ex.: Boot Placa 4,2V)"
                className={`w-full rounded-xl border px-3 py-2 text-xs ${subCardBg}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveMemory}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-3.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar como memória</span>
                </button>
                {selectedMemId && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMemId(selectedMemId)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#FEE2E2] text-[#DC2626] px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir selecionada</span>
                  </button>
                )}
              </div>

              {confirmDeleteMemId && (
                <div className="rounded-xl bg-[#FEE2E2]/90 border border-[#DC2626]/40 px-3 py-2 text-xs text-[#B91C1C] flex items-center justify-between gap-2">
                  <span className="font-semibold">Excluir esta memória salva?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleConfirmDeleteMemory(confirmDeleteMemId)}
                      className="rounded-lg bg-[#DC2626] text-white px-2.5 py-1 font-bold cursor-pointer"
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMemId(null)}
                      className="rounded-lg bg-white text-[#414752] px-2.5 py-1 font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <p className={`text-[11px] ${mutedText}`}>
                Tocar em uma memória só preenche os campos de controle. Nada é enviado à fonte e a saída não liga sozinha.
              </p>
            </div>
          </div>

          {/* Rotary Knobs & Output Interlocks */}
          <div className={`lg:col-span-7 rounded-2xl border p-5 space-y-4 ${cardBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">Controle da Fonte</h2>
              <button
                type="button"
                disabled={connState !== 'connected'}
                onClick={() => {
                  clearConfirmOn();
                  setControlUnlocked((u) => !u);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold border cursor-pointer disabled:opacity-45 ${
                  controlUnlocked
                    ? 'bg-[#10B981]/15 border-[#10B981] text-[#10B981]'
                    : 'bg-[#F59E0B]/15 border-[#F59E0B]/60 text-[#F59E0B]'
                }`}
              >
                {controlUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{controlUnlocked ? 'Controle liberado' : 'Liberar controle'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Knob V-SET */}
              <div className={`rounded-2xl border p-4 space-y-3 ${subCardBg}`}>
                <div className="flex items-center justify-between text-xs">
                  <strong style={{ color: colV }}>V-SET</strong>
                  <span className={mutedText}>0–48 V</span>
                </div>
                <RotaryKnob
                  label="Tensão V-SET"
                  value={clamp(vNum, 0, ZK_LIMITS.vmax)}
                  min={ZK_LIMITS.vmin}
                  max={ZK_LIMITS.vmax}
                  ticksCount={40}
                  tickStep={ZK_LIMITS.vmax / 40}
                  decimals={2}
                  color={colV}
                  brandTheme={brandTheme}
                  disabled={!controlUnlocked && connState === 'connected'}
                  onChange={(next) => setTargetVoltage(next.toFixed(2))}
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Diminuir tensão"
                    disabled={!controlUnlocked && connState === 'connected'}
                    onClick={() =>
                      setTargetVoltage(clamp(vNum - 0.1, ZK_LIMITS.vmin, ZK_LIMITS.vmax).toFixed(2))
                    }
                    className="w-8 h-8 rounded-lg border border-slate-500/40 font-bold text-sm cursor-pointer disabled:opacity-45"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min={ZK_LIMITS.vmin}
                    max={ZK_LIMITS.vmax}
                    disabled={!controlUnlocked && connState === 'connected'}
                    value={targetVoltage}
                    onChange={(e) => setTargetVoltage(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-slate-500/40 bg-transparent px-2.5 py-1.5 text-center font-mono text-sm font-bold disabled:opacity-45"
                    style={{ color: colV }}
                  />
                  <button
                    type="button"
                    aria-label="Aumentar tensão"
                    disabled={!controlUnlocked && connState === 'connected'}
                    onClick={() =>
                      setTargetVoltage(clamp(vNum + 0.1, ZK_LIMITS.vmin, ZK_LIMITS.vmax).toFixed(2))
                    }
                    className="w-8 h-8 rounded-lg border border-slate-500/40 font-bold text-sm cursor-pointer disabled:opacity-45"
                  >
                    +
                  </button>
                  <span
                    title={pendingV ? 'Valor ainda não aplicado na fonte' : 'Sincronizado com V-SET'}
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      pendingV ? 'bg-[#F59E0B] animate-pulse' : 'bg-slate-600/30'
                    }`}
                  />
                </div>
                <p className={`text-[10px] text-center ${mutedText}`}>Roda do mouse · Arrastar · Setas</p>
              </div>

              {/* Knob I-SET */}
              <div className={`rounded-2xl border p-4 space-y-3 ${subCardBg}`}>
                <div className="flex items-center justify-between text-xs">
                  <strong style={{ color: colI }}>I-SET</strong>
                  <span className={mutedText}>0–8,2 A</span>
                </div>
                <RotaryKnob
                  label="Corrente I-SET"
                  value={clamp(iNum, 0, ZK_LIMITS.imax)}
                  min={0}
                  max={ZK_LIMITS.imax}
                  ticksCount={41}
                  tickStep={0.2}
                  decimals={3}
                  color={colI}
                  brandTheme={brandTheme}
                  disabled={!controlUnlocked && connState === 'connected'}
                  onChange={(next) => setTargetCurrent(next.toFixed(3))}
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Diminuir corrente"
                    disabled={!controlUnlocked && connState === 'connected'}
                    onClick={() =>
                      setTargetCurrent(clamp(iNum - 0.05, 0, ZK_LIMITS.imax).toFixed(3))
                    }
                    className="w-8 h-8 rounded-lg border border-slate-500/40 font-bold text-sm cursor-pointer disabled:opacity-45"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    step={iscale === 1000 ? '0.001' : '0.01'}
                    min={0}
                    max={ZK_LIMITS.imax}
                    disabled={!controlUnlocked && connState === 'connected'}
                    value={targetCurrent}
                    onChange={(e) => setTargetCurrent(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-slate-500/40 bg-transparent px-2.5 py-1.5 text-center font-mono text-sm font-bold disabled:opacity-45"
                    style={{ color: colI }}
                  />
                  <button
                    type="button"
                    aria-label="Aumentar corrente"
                    disabled={!controlUnlocked && connState === 'connected'}
                    onClick={() =>
                      setTargetCurrent(clamp(iNum + 0.05, 0, ZK_LIMITS.imax).toFixed(3))
                    }
                    className="w-8 h-8 rounded-lg border border-slate-500/40 font-bold text-sm cursor-pointer disabled:opacity-45"
                  >
                    +
                  </button>
                  <span
                    title={pendingI ? 'Valor ainda não aplicado na fonte' : 'Sincronizado com I-SET'}
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      pendingI ? 'bg-[#F59E0B] animate-pulse' : 'bg-slate-600/30'
                    }`}
                  />
                </div>
                <p className={`text-[10px] text-center ${mutedText}`}>Roda do mouse · Arrastar · Setas</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={connState !== 'connected' || !controlUnlocked || cmdBusy}
                onClick={() => void handleApplySetpoint()}
                className="flex-1 min-w-[160px] rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white py-2.5 px-4 text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Aplicar V e I
              </button>

              {!confirmOutputOn ? (
                <button
                  type="button"
                  disabled={connState !== 'connected' || !controlUnlocked || cmdBusy}
                  onClick={() => void handleToggleOutput()}
                  className={`flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-4 text-xs font-bold disabled:opacity-40 cursor-pointer ${
                    sample?.outputOn
                      ? 'bg-[#10B981] text-[#0B0F17] hover:bg-[#34d399]'
                      : 'bg-[#DC2626] text-white hover:bg-[#ef4444]'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  <span>{sample?.outputOn ? 'Desligar saída' : 'Ligar saída'}</span>
                </button>
              ) : (
                <div className="flex-1 min-w-[220px] inline-flex items-center gap-1.5 bg-[#0B0F17] border border-[#F59E0B] rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => void handleToggleOutput()}
                    className="flex-1 rounded-lg bg-[#10B981] text-[#0B0F17] px-3 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    Confirmar: ligar {sample ? fmtComma(sample.vSet, 2) : targetVoltage} V ·{' '}
                    {sample ? fmtComma(sample.iSet, dec) : targetCurrent} A
                  </button>
                  <button
                    type="button"
                    onClick={clearConfirmOn}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
            <p className={`text-[11px] ${mutedText}`}>
              Ligar a saída pede uma segunda confirmação no próprio botão (expira em 6 segundos).
            </p>
          </div>
        </div>

        {/* Electrical Signature Detector Feed (sesFeed) */}
        <div className={`rounded-2xl border p-5 space-y-3 ${cardBg}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#06B6D4]" />
              <h2 className="text-sm font-bold">Detector de assinatura elétrica da sessão</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono ${mutedText}`}>{events.length} eventos</span>
              {activeSession && (
                <button
                  type="button"
                  onClick={handleOpenReport}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-3 py-1.5 text-xs font-bold cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Relatório &amp; Vincular OS</span>
                </button>
              )}
            </div>
          </div>

          <div className={`rounded-xl border p-3 max-h-48 overflow-y-auto space-y-1.5 text-xs ${subCardBg}`}>
            {events.length === 0 ? (
              <p className={mutedText}>
                Conecte a fonte (Bluetooth, USB ou Simulação) para detectar automaticamente fuga de corrente (&gt;20 mA),
                pulso de boot (&ge;150 mA), disparo de curto/CC e consumo sustentado elevado (&ge;800 mA).
              </p>
            ) : (
              [...events].reverse().map((ev, idx) => (
                <div key={`${ev.timestamp}-${idx}`} className="flex items-start gap-2">
                  <span className={`font-mono text-[10px] shrink-0 mt-0.5 ${mutedText}`}>
                    {fmtHms(new Date(ev.timestamp))}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                      ev.kind === 'curto' || ev.kind === 'prot'
                        ? 'bg-red-500/20 text-red-400'
                        : ev.kind === 'fuga' || ev.kind === 'alto'
                          ? 'bg-amber-500/20 text-amber-400'
                          : ev.kind === 'pulso'
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-slate-600/25 text-slate-300'
                    }`}
                  >
                    {ev.kind}
                  </span>
                  <span className="leading-snug">{ev.text}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Protections Write Confirmation Modal */}
        {showWriteProtModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar gravação de proteções"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/75 backdrop-blur-xs p-4"
          >
            <div className="w-full max-w-md rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5 text-white space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#F59E0B]">
                  Gravar proteções no grupo M{protGroup}?
                </h3>
                <button
                  type="button"
                  onClick={() => setShowWriteProtModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-xl bg-[#0B0F17] border border-[#2A3954] p-3 font-mono text-xs space-y-1">
                {ZK_PROT_KEYS.map((k) => {
                  const def = protRange(k, otpUnit);
                  return (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-400">{def.label}:</span>
                      <strong>
                        {protValues[k]} {def.unit}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-300">
                Confira os valores no visor da fonte após a gravação.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWriteProtModal(false)}
                  className="rounded-xl border border-[#2A3954] px-4 py-2 text-xs text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleWriteProtectionsConfirmed()}
                  className="rounded-xl bg-[#10B981] text-[#0B0F17] px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  Confirmar gravação
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Session Report Modal (relat) */}
        {showReportModal && reportSnapshot && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Relatório da sessão da fonte"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/75 backdrop-blur-xs p-4 overflow-y-auto"
          >
            <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#D9E0EC] p-5 sm:p-6 text-[#091b36] shadow-2xl space-y-4 my-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold">
                  Relatório da sessão · Fonte de bancada
                </h2>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-[#091b36] mb-1">
                    Vincular a uma OS (opcional)
                  </label>
                  <select
                    value={reportOrderId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setReportOrderId(nextId);
                      const found = nextId
                        ? state.orders.find((o) => o.id === Number(nextId))
                        : undefined;
                      if (found && !reportModel.trim()) {
                        setReportModel(found.device || '');
                      }
                      syncReportToOs(nextId, reportNotes, reportSnapshot);
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  >
                    <option value="">Sem vínculo</option>
                    {sortedOrders.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        #{o.id} · {o.clientName || 'sem cliente'} · {o.device}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#091b36] mb-1">Modelo do aparelho</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={reportModel}
                    onChange={(e) => setReportModel(e.target.value)}
                    placeholder="Ex.: iPhone 13 Pro / Galaxy A54"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#091b36] mb-1">Notas do técnico</label>
                <textarea
                  rows={3}
                  maxLength={600}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  onBlur={() => {
                    if (reportOrderId) syncReportToOs(reportOrderId, reportNotes, reportSnapshot);
                  }}
                  placeholder="Observações da inspeção na bancada..."
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                />
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-[#727784] mb-1.5">
                  Resumo da sessão
                </h3>
                <div className="rounded-xl border border-[#D9E0EC] overflow-hidden text-xs">
                  <table className="w-full">
                    <tbody className="divide-y divide-[#D9E0EC]">
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">Período</td>
                        <td className="px-3 py-2 font-mono font-semibold text-right">
                          {fmtStamp(reportSnapshot.ini)} a {fmtStamp(reportSnapshot.fim)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">V-SET · I-SET (últimos)</td>
                        <td className="px-3 py-2 font-mono font-semibold text-right">
                          {reportSnapshot.vset !== null ? fmtComma(reportSnapshot.vset, 2) : '--'} V ·{' '}
                          {reportSnapshot.iset !== null ? fmtComma(reportSnapshot.iset, dec) : '--'} A
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">Corrente mín. / média / pico</td>
                        <td className="px-3 py-2 font-mono font-semibold text-right">
                          {reportSnapshot.imin !== null ? fmtComma(reportSnapshot.imin, dec) : '--'} /{' '}
                          {reportSnapshot.iavg !== null ? fmtComma(reportSnapshot.iavg, dec) : '--'} /{' '}
                          {reportSnapshot.ipk !== null ? fmtComma(reportSnapshot.ipk, dec) : '--'} A
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">Tensão média / pico</td>
                        <td className="px-3 py-2 font-mono font-semibold text-right">
                          {reportSnapshot.vavg !== null ? fmtComma(reportSnapshot.vavg, 2) : '--'} /{' '}
                          {reportSnapshot.vpk !== null ? fmtComma(reportSnapshot.vpk, 2) : '--'} V
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">Potência média / máxima</td>
                        <td className="px-3 py-2 font-mono font-semibold text-right">
                          {reportSnapshot.pavg !== null ? fmtComma(reportSnapshot.pavg, 1) : '--'} /{' '}
                          {reportSnapshot.pmax !== null ? fmtComma(reportSnapshot.pmax, 1) : '--'} W
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">Tempo com a saída ligada</td>
                        <td className="px-3 py-2 font-mono font-semibold text-right">
                          {fmtDur(reportSnapshot.ms)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-[#414752]">Proteções disparadas</td>
                        <td className="px-3 py-2 font-semibold text-right">
                          {reportSnapshot.prots.length > 0
                            ? reportSnapshot.prots.map((x) => `${fmtHms(new Date(x.t))} ${x.nm}`).join('; ')
                            : 'Nenhuma'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-[#727784] mb-1.5">
                  Evidências detectadas
                </h3>
                {reportSnapshot.evid.length === 0 ? (
                  <p className="text-xs text-[#727784]">Nenhuma evidência detectada nesta sessão.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {reportSnapshot.evid.map((e, idx) => (
                      <div
                        key={`${e.timestamp}-${idx}`}
                        className="rounded-lg bg-[#FFF7E6] border border-[#D97706]/30 px-3 py-2 text-xs text-[#091b36]"
                      >
                        <strong className="font-mono">{fmtHms(new Date(e.timestamp))}</strong> · {e.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {reportStatusMsg && (
                <p role="status" className="text-xs font-semibold text-[#16A34A]">
                  {reportStatusMsg}
                </p>
              )}

              {wppFallbackText && (
                <textarea
                  readOnly
                  rows={5}
                  value={wppFallbackText}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] p-2.5 text-xs font-mono"
                />
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handlePrintA4Report}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Salvar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyReportWhatsapp()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#EAF2FD] hover:bg-[#dce9fc] text-[#0056ab] px-4 py-2 text-xs font-bold cursor-pointer"
                >
                  {copiedWpp ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedWpp ? 'Copiado!' : 'Copiar resumo para WhatsApp'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="ml-auto rounded-xl border border-[#D9E0EC] px-4 py-2 text-xs font-semibold text-[#414752] cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Printable A4 Report Layout (docPrint v17) */}
      {showReportModal && reportSnapshot && (
        <div className="hidden print:block text-black bg-white text-xs leading-relaxed space-y-4">
          <div className="flex items-start justify-between border-b-2 border-[#091b36] pb-3">
            <div className="flex items-center gap-3">
              <img
                src={state.cfg.logoL || './pwa-192x192.png'}
                alt="MicroLab"
                className="w-12 h-12 rounded-lg object-contain"
              />
              <div>
                <h2 className="text-base font-bold">MicroLab · Assistência Técnica</h2>
                <p className="text-[11px]">Manutenção Especializada em Smartphones e Tablets</p>
              </div>
            </div>
            <div className="text-right text-[11px]">
              <p>WhatsApp (71) 99129-3552</p>
              <p>Instagram @microlabssa</p>
              <p>Impresso em {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          <h1 className="text-center text-sm font-bold tracking-wide uppercase py-1 border-y border-slate-300">
            RELATÓRIO DE TESTE NA FONTE DE BANCADA
          </h1>

          <div className="space-y-1">
            <h3 className="font-bold uppercase text-[11px] border-b border-slate-300 pb-0.5">
              Identificação
            </h3>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[10px] text-slate-600 block">Aparelho / modelo</span>
                <strong>{reportModel.trim() || selectedReportOrder?.device || 'Não informado'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Ordem de serviço</span>
                <strong>{selectedReportOrder ? `Nº ${selectedReportOrder.id}` : 'Sem vínculo'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Cliente</span>
                <strong>{selectedReportOrder?.clientName || '—'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Período do teste</span>
                <strong>
                  {fmtStamp(reportSnapshot.ini)} a {fmtStamp(reportSnapshot.fim)}
                </strong>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold uppercase text-[11px] border-b border-slate-300 pb-0.5">
              Resumo das medições
            </h3>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-[10px] text-slate-600 block">V-SET · I-SET (últimos)</span>
                <strong>
                  {reportSnapshot.vset !== null ? fmtComma(reportSnapshot.vset, 2) : '--'} V ·{' '}
                  {reportSnapshot.iset !== null ? fmtComma(reportSnapshot.iset, dec) : '--'} A
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Tempo com a saída ligada</span>
                <strong>{fmtDur(reportSnapshot.ms)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Corrente mínima / média / pico</span>
                <strong>
                  {reportSnapshot.imin !== null ? fmtComma(reportSnapshot.imin, dec) : '--'} /{' '}
                  {reportSnapshot.iavg !== null ? fmtComma(reportSnapshot.iavg, dec) : '--'} /{' '}
                  {reportSnapshot.ipk !== null ? fmtComma(reportSnapshot.ipk, dec) : '--'} A
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Tensão média / pico</span>
                <strong>
                  {reportSnapshot.vavg !== null ? fmtComma(reportSnapshot.vavg, 2) : '--'} /{' '}
                  {reportSnapshot.vpk !== null ? fmtComma(reportSnapshot.vpk, 2) : '--'} V
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Potência média / máxima</span>
                <strong>
                  {reportSnapshot.pavg !== null ? fmtComma(reportSnapshot.pavg, 1) : '--'} /{' '}
                  {reportSnapshot.pmax !== null ? fmtComma(reportSnapshot.pmax, 1) : '--'} W
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-600 block">Proteções disparadas</span>
                <strong>
                  {reportSnapshot.prots.length > 0
                    ? reportSnapshot.prots.map((x) => `${fmtHms(new Date(x.t))} ${x.nm}`).join('; ')
                    : 'Nenhuma'}
                </strong>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold uppercase text-[11px] border-b border-slate-300 pb-0.5">
              Evidências detectadas (ordem cronológica)
            </h3>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-400 text-left">
                  <th className="py-1 w-24">Horário</th>
                  <th className="py-1">Evidência</th>
                </tr>
              </thead>
              <tbody>
                {reportSnapshot.evid.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-1">
                      Nenhuma evidência detectada nesta sessão.
                    </td>
                  </tr>
                ) : (
                  reportSnapshot.evid.map((e, idx) => (
                    <tr key={`pev-${idx}`} className="border-b border-slate-200">
                      <td className="py-1 font-mono">{fmtHms(new Date(e.timestamp))}</td>
                      <td className="py-1">{e.text}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-1">
            <h3 className="font-bold uppercase text-[11px] border-b border-slate-300 pb-0.5">
              Registro de comandos e eventos
            </h3>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-400 text-left">
                  <th className="py-1 w-24">Horário</th>
                  <th className="py-1">Evento</th>
                </tr>
              </thead>
              <tbody>
                {reportSnapshot.tl.slice(-60).map((e, idx) => (
                  <tr key={`ptl-${idx}`} className="border-b border-slate-200">
                    <td className="py-1 font-mono">{fmtHms(new Date(e.timestamp))}</td>
                    <td className="py-1">{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reportNotes.trim() && (
            <div className="space-y-1">
              <h3 className="font-bold uppercase text-[11px] border-b border-slate-300 pb-0.5">
                Notas do técnico
              </h3>
              <p className="pt-1 whitespace-pre-wrap">{reportNotes.trim()}</p>
            </div>
          )}

          <div className="border border-slate-300 rounded p-2.5 text-[10px] text-slate-700">
            Os valores são leituras da fonte de bancada durante o teste e indicam o comportamento do aparelho naquele
            momento. Os limites de alerta usados (consumo em espera acima de{' '}
            {Math.round(TELEMETRY_THRESHOLDS.fugaA * 1000)} mA; consumo sustentado acima de{' '}
            {fmtComma(TELEMETRY_THRESHOLDS.altoA, 3)} A) são critérios internos da MicroLab, e cada indício precisa de
            avaliação do técnico. Este relatório não é um orçamento.
          </div>
          <p className="text-center font-bold text-[11px]">Orçamento antes do serviço.</p>
        </div>
      )}
    </>
  );
};
