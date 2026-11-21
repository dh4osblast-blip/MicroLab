import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  FlaskConical,
  Lock,
  Power,
  RefreshCw,
  Save,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Thermometer,
  Unplug,
  Unlock,
  Usb,
  X,
  Zap,
} from 'lucide-react';
import { useLabStore } from '../store/useLabStore';
import {
  EvidenceEvent,
  ModbusClient,
  ProtKey,
  ZK_LIMITS,
  ZK_PGRP_MAX,
  ZK_PROT_KEYS,
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

interface Preset {
  id: string;
  label: string;
  desc: string;
  v: number;
  i: number;
}

const PRESETS: Preset[] = [
  { id: 'M1', label: 'M1 · Bateria Cel', desc: 'Boot / VDD_MAIN', v: 4.2, i: 2.0 },
  { id: 'M2', label: 'M2 · Carga USB 5V', desc: 'Linha VBUS', v: 5.0, i: 2.0 },
  { id: 'M3', label: 'M3 · Injeção Curto', desc: 'Térmica 1.2V / 3A', v: 1.2, i: 3.0 },
  { id: 'M4', label: 'M4 · PD 12V', desc: 'Fast Charge', v: 12.0, i: 3.0 },
  { id: 'M5', label: 'M5 · Notebook DC', desc: 'Linha 19.5V / 4.5A', v: 19.5, i: 4.5 },
];

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export const BenchPowerView: React.FC<{ defaultDiagnosisMode?: boolean }> = ({
  defaultDiagnosisMode = false,
}) => {
  const { state, attachTelemetryToOrder, setPowerSupplyStatus } = useLabStore();

  // Connection & Hardware Refs
  const transportRef = useRef<ZkTransport | null>(null);
  const clientRef = useRef<ModbusClient | null>(null);
  const trackerRef = useRef<ZkSessionTracker>(new ZkSessionTracker());
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

  // Live Telemetry (null = disconnected / 0 readings)
  const [sample, setSample] = useState<ZkTelemetrySample | null>(null);
  const [history, setHistory] = useState<ZkTelemetrySample[]>([]);
  const [events, setEvents] = useState<EvidenceEvent[]>([]);

  // Control & Safety Interlocks
  const [controlUnlocked, setControlUnlocked] = useState(false);
  const [confirmOutputOn, setConfirmOutputOn] = useState(false);
  const [targetVoltage, setTargetVoltage] = useState('4.20');
  const [targetCurrent, setTargetCurrent] = useState('2.000');
  const [activePreset, setActivePreset] = useState('M1');
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdFeedback, setCmdFeedback] = useState('');

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

  // Order Attachment
  const [targetOrderId, setTargetOrderId] = useState<number>(state.orders[0]?.id || 0);
  const [telemetryNote, setTelemetryNote] = useState(
    defaultDiagnosisMode
      ? 'Análise de consumo em bancada via ZK-SK150C'
      : 'Consumo VDD_MAIN monitorado via ZK-SK150C'
  );
  const [savedFeedback, setSavedFeedback] = useState('');

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
    async (reason?: string) => {
      stopPolling();
      clearConfirmOn();
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

  // Report runtime power supply busy/energized status for idle & logout safety interlocks
  useEffect(() => {
    setPowerSupplyStatus({
      connected: connState === 'connected',
      outputOn: Boolean(sample?.outputOn),
    });
  }, [connState, sample?.outputOn, setPowerSupplyStatus]);

  // Clean up on unmount
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
      trackerRef.current = new ZkSessionTracker();
      pollFailCountRef.current = 0;
      setHistory([]);
      setEvents([]);
      setCommLost(false);
      setProtReadOk(false);
      setControlUnlocked(false);
      setConnError('');

      // First read registers (0..23)
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

      // Poll every 500ms
      pollTimerRef.current = window.setInterval(async () => {
        if (!clientRef.current || transportRef.current !== transport) return;
        try {
          const nextRegs = await clientRef.current.readRegisters(modbusAddr, 0, 24);
          pollFailCountRef.current = 0;
          setCommLost(false);
          const nextSample = parseZkRegisters(nextRegs, protContextRef.current.iscale);
          trackerRef.current.feed(nextSample, protContextRef.current.iscale);
          setSample(nextSample);
          setHistory((prev) => [...prev.slice(-119), nextSample]);
          setEvents([...trackerRef.current.events]);
        } catch {
          pollFailCountRef.current += 1;
          if (pollFailCountRef.current >= 6) {
            setCommLost(true);
            setConnError('Perda de comunicação com a fonte (6 falhas consecutivas). Desconexão de emergência liberada.');
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
        void cleanupTransport('Conexão física interrompida inesperadamente pela fonte ou cabo.');
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
      await cleanupTransport();
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

  const handleApplySetpoint = async (vStr?: string, iStr?: string) => {
    if (!clientRef.current || connState !== 'connected') return;
    if (!controlUnlocked) {
      setCmdFeedback('Libere o controle de bancada antes de alterar V-SET ou I-SET.');
      return;
    }
    const vNum = parseFloat(vStr ?? targetVoltage);
    const iNum = parseFloat(iStr ?? targetCurrent);
    if (Number.isNaN(vNum) || vNum < ZK_LIMITS.vmin || vNum > ZK_LIMITS.vmax) {
      setCmdFeedback(`Tensão fora dos limites seguros (${ZK_LIMITS.vmin}V a ${ZK_LIMITS.vmax}V).`);
      return;
    }
    if (Number.isNaN(iNum) || iNum < 0.01 || iNum > ZK_LIMITS.imax) {
      setCmdFeedback(`Corrente fora dos limites seguros (0.01A a ${ZK_LIMITS.imax}A).`);
      return;
    }

    setCmdBusy(true);
    setCmdFeedback('');
    try {
      await clientRef.current.writeRegister(modbusAddr, 0, Math.round(vNum * 100));
      await clientRef.current.writeRegister(modbusAddr, 1, Math.round(iNum * iscale));
      setTargetVoltage(vNum.toFixed(2));
      setTargetCurrent(iNum.toFixed(iscale === 1000 ? 3 : 2));
      setCmdFeedback(`Aplicado: ${vNum.toFixed(2)}V / ${iNum.toFixed(iscale === 1000 ? 3 : 2)}A`);
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

    // Desligar é sempre imediato (prioridade segurança)
    if (sample.outputOn) {
      clearConfirmOn();
      setCmdBusy(true);
      try {
        await clientRef.current.writeRegister(modbusAddr, 0x12, 0);
        setCmdFeedback('Saída desligada com segurança (OUTPUT OFF).');
      } catch (err) {
        setCmdFeedback(err instanceof Error ? err.message : 'Erro ao desligar saída.');
      } finally {
        setCmdBusy(false);
      }
      return;
    }

    // Ligar exige confirmação em 2 passos com timeout de 6s
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
      setCmdFeedback('Saída energizada (OUTPUT ON).');
    } catch (err) {
      setCmdFeedback(err instanceof Error ? err.message : 'Erro ao ligar saída.');
    } finally {
      setCmdBusy(false);
    }
  };

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
      setProtFeedback(`Grupo M${protGroup} lido da fonte com sucesso.`);
    } catch (err) {
      setProtReadOk(false);
      setProtFeedback(err instanceof Error ? err.message : 'Falha ao ler proteções.');
    } finally {
      setProtBusy(false);
    }
  };

  const canEditProtections = connState === 'connected' && !sample?.outputOn && controlUnlocked && protReadOk;

  const handleWriteProtectionsConfirmed = async () => {
    if (!clientRef.current || !canEditProtections) return;
    setShowWriteProtModal(false);
    setProtBusy(true);
    setProtFeedback('');
    try {
      for (const k of ZK_PROT_KEYS) {
        const reg = protRegAddress(k, protGroup);
        const div = protDivisor(k, iscale);
        const valNum = parseFloat(protValues[k]);
        const raw = Math.round(valNum * div);
        if (!isValidProtWrite(reg, raw, { group: protGroup, otpUnit, iscale })) {
          const def = protRange(k, otpUnit);
          throw new Error(`${def.label} fora da faixa segura (${def.min} a ${def.max} ${def.unit}).`);
        }
        await clientRef.current.writeRegister(modbusAddr, reg, raw);
      }
      setProtFeedback(`Proteções M${protGroup} gravadas na memória da fonte.`);
    } catch (err) {
      setProtFeedback(err instanceof Error ? err.message : 'Erro ao gravar proteções.');
    } finally {
      setProtBusy(false);
    }
  };

  const applyPreset = (p: Preset) => {
    setActivePreset(p.id);
    const vStr = p.v.toFixed(2);
    const iStr = p.i.toFixed(iscale === 1000 ? 3 : 2);
    setTargetVoltage(vStr);
    setTargetCurrent(iStr);
    if (connState === 'connected' && controlUnlocked) {
      void handleApplySetpoint(vStr, iStr);
    }
  };

  const handleAttachToOrder = () => {
    if (!targetOrderId) return;
    const vOut = sample ? sample.vOut : 0;
    const iOut = sample ? sample.iOut : 0;
    const pOut = sample ? sample.pOut : 0;
    const prefix = connMode === 'sim' ? '[SIMULAÇÃO] ' : connState === 'connected' ? '[HARDWARE ZK-SK150C] ' : '';
    const lastEvidence = events.length > 0 ? ` · ${events[events.length - 1].text}` : '';
    attachTelemetryToOrder(targetOrderId, {
      voltage: Number(vOut.toFixed(2)),
      current: Number(iOut.toFixed(3)),
      power: Number(pOut.toFixed(2)),
      note: `${prefix}${telemetryNote.trim() || 'Leitura gravada na bancada ZK-SK150C'}${lastEvidence}`,
      recordedAt: 'Agora',
    });
    setSavedFeedback(`Leitura gravada na OS #${targetOrderId}!`);
    window.setTimeout(() => setSavedFeedback(''), 3000);
  };

  // SVG chart points
  const dec = iscale === 1000 ? 3 : 2;
  const maxY = useMemo(() => {
    const peak = history.reduce((m, s) => Math.max(m, s.iOut), 0);
    return Math.max(0.5, sample?.iSet || 1.2, peak * 1.15);
  }, [history, sample?.iSet]);

  const wavePoints = useMemo(() => {
    if (history.length < 2) return '';
    return history
      .map((item, idx) => {
        const x = (idx / Math.max(1, history.length - 1)) * 420;
        const y = 84 - Math.min(78, (item.iOut / maxY) * 74);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [history, maxY]);

  const disconnectBlocked = Boolean(sample?.outputOn && !commLost);

  return (
    <div className="space-y-5 text-slate-100">
      {/* Top Hardware Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Zap className="w-5 h-5 text-[#06B6D4]" />
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Fonte Wuzhi ZK-SK150C · Telemetria Real (BLE / USB)
            </h1>
            {connState === 'disconnected' && (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300">
                DESCONECTADO · SEM HARDWARE
              </span>
            )}
            {connState === 'connected' && (connMode === 'ble' || connMode === 'usb') && (
              <span className="px-2 py-0.5 rounded-md bg-[#10B981]/20 border border-[#10B981]/50 text-[10px] font-bold text-[#10B981]">
                HARDWARE REAL CONECTADO · {connMode === 'ble' ? 'BLUETOOTH BLE' : 'USB SERIAL'}
              </span>
            )}
            {connState === 'connected' && connMode === 'sim' && (
              <span className="px-2 py-0.5 rounded-md bg-[#F59E0B]/20 border border-[#F59E0B] text-[10px] font-bold text-[#F59E0B]">
                MODO SIMULAÇÃO (DADOS FICTÍCIOS)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Protocolo Modbus RTU 1:1 validado em bancada · Escala padrão ÷1000 (modelo 4008) · Sem geração automática de dados falsos
          </p>
        </div>

        {/* Connection & Interlock Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {connState === 'disconnected' ? (
            <>
              <button
                type="button"
                onClick={() => void handleConnect('ble')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Bluetooth className="w-4 h-4" />
                <span>Conectar Bluetooth (BLE)</span>
              </button>
              <button
                type="button"
                onClick={() => void handleConnect('usb')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#131B2E] border border-[#06B6D4]/50 text-[#06B6D4] hover:bg-[#1a243b] px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Usb className="w-4 h-4" />
                <span>Conectar USB (Serial)</span>
              </button>
              <button
                type="button"
                onClick={() => void handleConnect('sim')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/60 text-[#F59E0B] hover:bg-[#F59E0B]/25 px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <FlaskConical className="w-4 h-4" />
                <span>Modo Demonstração / Simulação</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setControlUnlocked((u) => !u)}
                disabled={connState !== 'connected'}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border cursor-pointer ${
                  controlUnlocked
                    ? 'bg-[#10B981]/15 border-[#10B981] text-[#10B981]'
                    : 'bg-[#131B2E] border-[#F59E0B]/60 text-[#F59E0B]'
                }`}
              >
                {controlUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>{controlUnlocked ? 'Controle Liberado' : 'Liberar Controle'}</span>
              </button>

              {!confirmOutputOn ? (
                <button
                  type="button"
                  disabled={cmdBusy || !controlUnlocked}
                  onClick={() => void handleToggleOutput()}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer disabled:opacity-45 ${
                    sample?.outputOn
                      ? 'bg-[#10B981] text-[#0B0F17] hover:bg-[#34d399]'
                      : 'bg-[#DC2626] text-white hover:bg-[#ef4444]'
                  }`}
                >
                  <Power className="w-4 h-4" />
                  <span>{sample?.outputOn ? 'OUTPUT ON (Desligar)' : 'Ligar Saída (OUTPUT)'}</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-[#0B0F17] border border-[#F59E0B] rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => void handleToggleOutput()}
                    className="rounded-lg bg-[#10B981] text-[#0B0F17] px-3 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    Confirmar: ligar {targetVoltage}V · {targetCurrent}A
                  </button>
                  <button
                    type="button"
                    onClick={clearConfirmOn}
                    className="rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={disconnectBlocked}
                onClick={() => void handleDisconnect()}
                title={
                  disconnectBlocked
                    ? 'Desligue a saída (OUTPUT OFF) antes de desconectar'
                    : 'Desconectar transporte'
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#131B2E] border border-[#2A3954] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <Unplug className="w-4 h-4" />
                <span>{commLost ? 'Desconexão Emergência' : 'Desconectar'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowOptionsDrawer((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#131B2E] border border-[#2A3954] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            <Settings2 className="w-4 h-4 text-[#06B6D4]" />
            <span>Opções &amp; Proteções</span>
          </button>
        </div>
      </div>

      {/* Explicit Simulation Warning Banner */}
      {connState === 'connected' && connMode === 'sim' && (
        <div className="rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B] px-4 py-2.5 flex items-center gap-2.5 text-xs text-[#FCD34D]">
          <FlaskConical className="w-4 h-4 shrink-0 text-[#F59E0B]" />
          <span>
            <strong>ATENÇÃO — MODO DEMONSTRAÇÃO / SIMULAÇÃO ATIVO:</strong> As leituras abaixo são simuladas em memória para treinamento ou teste sem fonte física conectada.
          </span>
        </div>
      )}

      {/* Connection / Interlock Feedback */}
      {(connError || cmdFeedback) && (
        <div
          className={`rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-2 border ${
            connError
              ? 'bg-[#DC2626]/15 border-[#DC2626]/60 text-red-200'
              : 'bg-[#06B6D4]/15 border-[#06B6D4]/50 text-cyan-200'
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

      {/* Collapsible Modbus & M0-M10 Protection Settings Drawer */}
      {showOptionsDrawer && (
        <div className="rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#06B6D4]">
              Configuração Modbus RTU &amp; Proteções M0–M10 (Sem reset/zero)
            </h2>
            <button
              type="button"
              onClick={() => setShowOptionsDrawer(false)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-[#0B0F17] p-3 border border-[#2A3954]">
              <label className="block text-[11px] text-slate-400 mb-1">Endereço Modbus (Slave ID)</label>
              <input
                type="number"
                min={1}
                max={247}
                disabled={connState !== 'disconnected'}
                value={modbusAddr}
                onChange={(e) => setModbusAddr(Math.max(1, Math.min(247, parseInt(e.target.value, 10) || 1)))}
                className="w-full rounded-lg bg-[#131B2E] border border-[#2A3954] px-2.5 py-1.5 text-white font-mono disabled:opacity-50"
              />
            </div>
            <div className="rounded-xl bg-[#0B0F17] p-3 border border-[#2A3954]">
              <label className="block text-[11px] text-slate-400 mb-1">Baud Rate USB Serial</label>
              <select
                disabled={connState !== 'disconnected'}
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                className="w-full rounded-lg bg-[#131B2E] border border-[#2A3954] px-2.5 py-1.5 text-white font-mono disabled:opacity-50"
              >
                {[115200, 9600, 19200, 38400, 57600].map((b) => (
                  <option key={b} value={b}>
                    {b} bps
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl bg-[#0B0F17] p-3 border border-[#2A3954]">
              <label className="block text-[11px] text-slate-400 mb-1">Escala de Corrente (1:1 Bancada)</label>
              <select
                value={iscale}
                onChange={(e) => setIscale(Number(e.target.value) as 100 | 1000)}
                className="w-full rounded-lg bg-[#131B2E] border border-[#2A3954] px-2.5 py-1.5 text-white font-mono"
              >
                <option value={1000}>÷ 1000 (Modelo 4008 — Padrão Validado)</option>
                <option value={100}>÷ 100 (Outros firmwares · verificar amperímetro)</option>
              </select>
            </div>
          </div>

          {iscale === 100 && (
            <p className="text-[11px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-lg px-3 py-1.5">
              Aviso: Escala alterada para ÷100. O hardware validado na MicroLab (modelo 4008) utiliza ÷1000 (1:1 em 1A).
            </p>
          )}

          {/* M0-M10 Protection Editor */}
          <div className="rounded-xl bg-[#0B0F17] p-4 border border-[#2A3954] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                <span className="text-xs font-bold text-white">Grupo de Memória / Proteções Hardware</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={protGroup}
                  onChange={(e) => {
                    setProtGroup(Number(e.target.value));
                    setProtReadOk(false);
                  }}
                  className="rounded-lg bg-[#131B2E] border border-[#2A3954] px-2.5 py-1 text-xs font-mono text-white"
                >
                  {Array.from({ length: ZK_PGRP_MAX + 1 }, (_, g) => (
                    <option key={g} value={g}>
                      Grupo M{g}
                    </option>
                  ))}
                </select>
                <select
                  value={otpUnit}
                  onChange={(e) => setOtpUnit(e.target.value as 'C' | 'F')}
                  className="rounded-lg bg-[#131B2E] border border-[#2A3954] px-2 py-1 text-xs font-mono text-white"
                >
                  <option value="C">OTP °C</option>
                  <option value="F">OTP °F</option>
                </select>
                <button
                  type="button"
                  disabled={connState !== 'connected' || protBusy}
                  onClick={() => void handleReadProtections()}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${protBusy ? 'animate-spin' : ''}`} />
                  <span>Ler da Fonte</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              {ZK_PROT_KEYS.map((k) => {
                const def = protRange(k, otpUnit);
                return (
                  <div key={k} className="rounded-lg bg-[#131B2E] p-2.5 border border-[#2A3954]">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      {def.label} ({def.unit}) [{def.min}–{def.max}]
                    </label>
                    <input
                      type="number"
                      step={k === 'ocp' ? '0.01' : '0.1'}
                      disabled={!canEditProtections}
                      value={protValues[k]}
                      onChange={(e) => setProtValues((prev) => ({ ...prev, [k]: e.target.value }))}
                      className="w-full rounded bg-[#0B0F17] border border-[#2A3954] px-2 py-1 text-white font-mono disabled:opacity-50"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400">
                {protFeedback ||
                  'Para gravar proteções: conecte, desligue a saída (OUTPUT OFF), libere o controle e clique em "Ler da Fonte".'}
              </span>
              <button
                type="button"
                disabled={!canEditProtections || protBusy}
                onClick={() => setShowWriteProtModal(true)}
                className="rounded-lg bg-[#10B981] text-[#0B0F17] px-3.5 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer"
              >
                Gravar Proteções (M{protGroup})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary V / A / W Digital Readouts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>TENSÃO DE SAÍDA (OUT)</span>
            <span className="font-mono text-[#06B6D4]">
              {sample ? `SET ${sample.vSet.toFixed(2)}V` : 'OFFLINE'}
            </span>
          </div>
          <p className="mt-2 text-4xl font-mono font-bold text-[#06B6D4] tabular-nums">
            {(sample ? sample.vOut : 0).toFixed(2)}
            <span className="text-lg ml-1">V</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Modo:{' '}
              {!sample
                ? 'Sem leitura'
                : sample.isCC
                ? 'CC (Limitação Corrente)'
                : 'CV (Tensão Constante)'}
            </span>
            <span>U-IN: {sample ? `${sample.uIn.toFixed(2)}V` : '0.00V'}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>CORRENTE CONSUMIDA</span>
            <span className="font-mono text-[#F59E0B]">
              {sample ? `LIM ${sample.iSet.toFixed(dec)}A` : 'OFFLINE'}
            </span>
          </div>
          <p className="mt-2 text-4xl font-mono font-bold text-[#F59E0B] tabular-nums">
            {(sample ? sample.iOut : 0).toFixed(dec)}
            <span className="text-lg ml-1">A</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
            <span>{sample ? `${sample.ah.toFixed(3)} Ah` : '0.000 Ah'}</span>
            <span>{sample ? sample.durationStr : '00:00:00'}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>POTÊNCIA DISSIPADA</span>
            <span className="inline-flex items-center gap-1 text-slate-300 font-mono">
              <Thermometer className="w-3.5 h-3.5 text-[#10B981]" />
              {sample ? `${sample.tempC.toFixed(1)}°C` : '--°C'}
            </span>
          </div>
          <p className="mt-2 text-4xl font-mono font-bold text-[#10B981] tabular-nums">
            {(sample ? sample.pOut : 0).toFixed(2)}
            <span className="text-lg ml-1">W</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
            <span>Energia: {sample ? `${sample.wh.toFixed(3)} Wh` : '0.000 Wh'}</span>
            <span>Proteção: {sample ? sample.protLabel : 'Standby'}</span>
          </div>
        </div>
      </div>

      {/* Oscilloscope Waveform + Setpoint Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Activity className="w-4 h-4 text-[#06B6D4]" />
              <span>Curva de Consumo em Tempo Real ({history.length}/120 amostras · 500ms)</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                connState !== 'connected'
                  ? 'bg-slate-800 text-slate-400'
                  : sample?.outputOn
                  ? 'bg-[#10B981]/20 text-[#10B981]'
                  : 'bg-[#F59E0B]/20 text-[#F59E0B]'
              }`}
            >
              {connState !== 'connected'
                ? 'DESCONECTADO'
                : sample?.outputOn
                ? 'SAÍDA ENERGIZADA'
                : 'CONECTADO · SAÍDA OFF'}
            </span>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-[#2A3954] p-3">
            {history.length >= 2 ? (
              <svg viewBox="0 0 420 90" className="w-full h-28 overflow-visible">
                <line x1="0" y1="22" x2="420" y2="22" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="0" y1="45" x2="420" y2="45" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="0" y1="68" x2="420" y2="68" stroke="#1e293b" strokeDasharray="3 3" />
                <polyline
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={wavePoints}
                />
              </svg>
            ) : (
              <div className="h-28 flex flex-col items-center justify-center text-xs text-slate-500">
                <Activity className="w-5 h-5 mb-1 opacity-50" />
                <span>
                  {connState === 'connected'
                    ? 'Coletando primeiras amostras Modbus...'
                    : 'Conecte via Bluetooth (BLE), USB Serial ou ative o Modo Demonstração para visualizar a curva.'}
                </span>
              </div>
            )}
          </div>

          {/* M1-M5 Memory Presets */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  activePreset === p.id
                    ? 'bg-[#06B6D4]/15 border-[#06B6D4] text-white'
                    : 'bg-[#0B0F17] border-[#2A3954] text-slate-300 hover:border-slate-500'
                }`}
              >
                <span className="block text-[11px] font-bold text-[#06B6D4]">{p.label}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">
                  {p.v.toFixed(1)}V · {p.i.toFixed(1)}A
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Fine Precision Controls & Evidence Log */}
        <div className="lg:col-span-5 rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ajuste Modbus V-SET / I-SET
            </h2>
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">{connLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#0B0F17] p-3 border border-[#2A3954]">
              <label className="block text-[11px] text-slate-400 mb-1">Tensão Alvo (V)</label>
              <input
                type="number"
                step="0.01"
                min={ZK_LIMITS.vmin}
                max={ZK_LIMITS.vmax}
                value={targetVoltage}
                onChange={(e) => setTargetVoltage(e.target.value)}
                className="w-full rounded-lg bg-[#131B2E] border border-[#2A3954] px-2.5 py-1.5 font-mono text-sm font-bold text-[#06B6D4]"
              />
            </div>
            <div className="rounded-xl bg-[#0B0F17] p-3 border border-[#2A3954]">
              <label className="block text-[11px] text-slate-400 mb-1">Limite Corrente (A)</label>
              <input
                type="number"
                step={iscale === 1000 ? '0.005' : '0.01'}
                min={0.01}
                max={ZK_LIMITS.imax}
                value={targetCurrent}
                onChange={(e) => setTargetCurrent(e.target.value)}
                className="w-full rounded-lg bg-[#131B2E] border border-[#2A3954] px-2.5 py-1.5 font-mono text-sm font-bold text-[#F59E0B]"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={connState !== 'connected' || !controlUnlocked || cmdBusy}
            onClick={() => void handleApplySetpoint()}
            className="w-full rounded-xl bg-[#06B6D4] text-[#0B0F17] py-2.5 text-xs font-bold hover:bg-[#22d3ee] disabled:opacity-40 cursor-pointer"
          >
            {controlUnlocked
              ? 'Enviar Setpoint (V-SET / I-SET) para Fonte'
              : 'Ative "Liberar Controle" no topo para alterar'}
          </button>

          {/* Bench Session Events Tracker */}
          <div className="rounded-xl bg-[#0B0F17] border border-[#2A3954] p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-300">Evidências Detectadas na Sessão</span>
              <span className="font-mono text-slate-500">{events.length} eventos</span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1 text-[11px]">
              {events.length === 0 ? (
                <p className="text-slate-500">Aguardando sessão ativa para registrar fugas, pulsos de boot ou curtos.</p>
              ) : (
                [...events]
                  .reverse()
                  .slice(0, 8)
                  .map((ev, idx) => (
                    <div key={`${ev.timestamp}-${idx}`} className="flex items-start gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                          ev.kind === 'curto' || ev.kind === 'prot'
                            ? 'bg-red-500/20 text-red-300'
                            : ev.kind === 'fuga' || ev.kind === 'alto'
                            ? 'bg-amber-500/20 text-amber-300'
                            : ev.kind === 'pulso'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {ev.kind}
                      </span>
                      <span className="text-slate-300 leading-snug">{ev.text}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Telemetry Directly to OS */}
      <div className="rounded-2xl bg-[#131B2E] border border-[#2A3954] p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#06B6D4]" />
            <h2 className="text-sm font-bold text-white">Vincular Diagnóstico de Telemetria a uma OS</h2>
          </div>
          {savedFeedback && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981]">
              <CheckCircle2 className="w-4 h-4" />
              {savedFeedback}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <select
            value={targetOrderId}
            onChange={(e) => setTargetOrderId(Number(e.target.value))}
            className="md:col-span-4 rounded-xl bg-[#0B0F17] border border-[#2A3954] px-3 py-2.5 text-xs text-white"
          >
            {state.orders.length === 0 ? (
              <option value={0}>Nenhuma OS cadastrada</option>
            ) : (
              state.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} · {o.device} ({o.clientName})
                </option>
              ))
            )}
          </select>
          <input
            value={telemetryNote}
            onChange={(e) => setTelemetryNote(e.target.value)}
            placeholder="Nota técnica do comportamento de corrente..."
            className="md:col-span-5 rounded-xl bg-[#0B0F17] border border-[#2A3954] px-3 py-2.5 text-xs text-white"
          />
          <button
            type="button"
            disabled={!targetOrderId || state.orders.length === 0}
            onClick={handleAttachToOrder}
            className="md:col-span-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#06B6D4] text-[#0B0F17] py-2.5 px-4 text-xs font-bold hover:bg-[#22d3ee] disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>Gravar Leitura na OS</span>
          </button>
        </div>
      </div>

      {/* Inline Protection Write Confirmation Modal (No window.confirm) */}
      {showWriteProtModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowWriteProtModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#131B2E] border border-[#2A3954] p-6 space-y-4 text-slate-100 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-[#F59E0B]">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Confirmar Gravação em EEPROM (Grupo M{protGroup})</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Os limites de proteção abaixo serão gravados na memória não volátil do grupo <strong>M{protGroup}</strong> na fonte ZK-SK150C (com a saída desligada):
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#0B0F17] p-3 rounded-xl border border-[#2A3954]">
              <span>OVP: {protValues.ovp} V</span>
              <span>OCP: {protValues.ocp} A</span>
              <span>OPP: {protValues.opp} W</span>
              <span>LVP: {protValues.lvp} V</span>
              <span>OTP: {protValues.otp} °{otpUnit}</span>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowWriteProtModal(false)}
                className="flex-1 rounded-xl border border-[#2A3954] py-2 text-xs font-semibold text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleWriteProtectionsConfirmed()}
                className="flex-1 rounded-xl bg-[#10B981] py-2 text-xs font-bold text-[#0B0F17] cursor-pointer"
              >
                Gravar na Fonte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
