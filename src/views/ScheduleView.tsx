import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  Sliders,
  Truck,
} from 'lucide-react';
import { useLabStore } from '../store/useLabStore';
import {
  OFFICIAL_HOURS_BY_DOW,
  addDiasIso,
  diasAteIso,
  formatDateBR,
  getAwaitingPartOrders,
  getFilaOrders,
  planejar,
  semPeca,
  todayIsoLocal,
} from '../utils/pricing';

interface ScheduleViewProps {
  onSelectOrder?: (orderId: number) => void;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const formatHoursLabel = (h: number): string => {
  const rounded = Math.round((Number(h) || 0) * 100) / 100;
  return `${String(rounded).replace('.', ',')} h`;
};

export const ScheduleView: React.FC<ScheduleViewProps> = ({ onSelectOrder }) => {
  const {
    state,
    canAccessRoute,
    moveOrderInQueue,
    markOrderPartArrived,
    setWeekdayHours,
    setWorkdaysHours,
  } = useLabStore();

  const [agSem, setAgSem] = useState(0);
  const [showCapacityDrawer, setShowCapacityDrawer] = useState(false);
  const [workdaysQuickInput, setWorkdaysQuickInput] = useState('');
  const [confirmArrivedId, setConfirmArrivedId] = useState<number | null>(null);

  const canEditScheduleCapacity = canAccessRoute('configuracoes');

  const horas = useMemo(
    () =>
      Array.isArray(state.cfg.horas) && state.cfg.horas.length === 7
        ? state.cfg.horas.map((h) => Math.max(0, Math.min(24, Number(h) || 0)))
        : [...OFFICIAL_HOURS_BY_DOW],
    [state.cfg.horas]
  );

  const hojeIso = todayIsoLocal();
  const filaOrders = useMemo(() => getFilaOrders(state.orders), [state.orders]);
  const awaitingPartOrders = useMemo(
    () => getAwaitingPartOrders(state.orders),
    [state.orders]
  );
  const semPecaCount = useMemo(
    () => state.orders.filter((o) => semPeca(o)).length,
    [state.orders]
  );
  const plan = useMemo(() => planejar(state.orders, horas), [state.orders, horas]);

  const weeklyCapacity = useMemo(
    () => Math.round(horas.reduce((sum, h) => sum + h, 0) * 100) / 100,
    [horas]
  );
  const activeWeekdaysCount = useMemo(
    () => horas.filter((h) => h > 0).length,
    [horas]
  );
  const totalQueueHours = useMemo(
    () =>
      Math.round(
        filaOrders.reduce((sum, o) => sum + Math.max(Number(o.estimatedHours) || 0, 0), 0) * 100
      ) / 100,
    [filaOrders]
  );
  const ordersWithoutHours = useMemo(
    () => filaOrders.filter((o) => !(Number(o.estimatedHours) > 0)),
    [filaOrders]
  );

  const orderById = useMemo(
    () => new Map(state.orders.map((o) => [o.id, o])),
    [state.orders]
  );
  const colorSlotByOs = useMemo(() => {
    const map = new Map<number, number>();
    filaOrders.forEach((o, idx) => map.set(o.id, idx % 3));
    return map;
  }, [filaOrders]);

  const baseIso = addDiasIso(hojeIso, agSem * 7);
  const weekEndIso = addDiasIso(baseIso, 6);

  // Build 7-day calendar rows for current `agSem` week, tracking `(continuação)` across previous days
  const weekDays = useMemo(() => {
    const vistos = new Set<number | '_novo'>();
    plan.dias
      .filter((d) => d.iso < baseIso)
      .forEach((d) => {
        d.blocos.forEach((b) => vistos.add(b.osId));
      });

    const rows: {
      iso: string;
      dayName: string;
      ddmm: string;
      isToday: boolean;
      cap: number;
      used: number;
      blocks: {
        key: string;
        orderId: number;
        osCode: string;
        label: string;
        hours: number;
        isContinuation: boolean;
        isInRepair: boolean;
        colorClass: string;
      }[];
    }[] = [];

    for (let k = 0; k < 7; k++) {
      const iso = addDiasIso(baseIso, k);
      const [y, m, dd] = iso.split('-').map(Number);
      const dw = new Date(y, m - 1, dd).getDay();
      const cap = horas[dw] || 0;
      const plannedDay = plan.dias.find((d) => d.iso === iso);
      const blocos = plannedDay ? plannedDay.blocos : [];
      const used = Math.round(blocos.reduce((s, b) => s + b.hours, 0) * 100) / 100;

      const blocks = blocos
        .map((b, idx) => {
          if (typeof b.osId !== 'number') return null;
          const ord = orderById.get(b.osId);
          if (!ord) return null;
          const isContinuation = vistos.has(b.osId);
          vistos.add(b.osId);

          const slot = colorSlotByOs.get(b.osId) ?? 0;
          const colorClass =
            ord.status === 'Em reparo' || ord.status === 'Em Reparo SMD'
              ? 'bg-[#06B6D4] text-[#091b36]'
              : slot === 0
              ? 'bg-[#0056ab] text-white'
              : slot === 1
              ? 'bg-[#091b36] text-white'
              : 'bg-[#4f5e81] text-white';

          return {
            key: `${iso}-${b.osId}-${idx}`,
            orderId: ord.id,
            osCode: ord.code,
            label: `${ord.code} ${ord.device || 'Aparelho'}`,
            hours: b.hours,
            isContinuation,
            isInRepair: ord.status === 'Em reparo' || ord.status === 'Em Reparo SMD',
            colorClass,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      rows.push({
        iso,
        dayName: WEEKDAY_LABELS[dw],
        ddmm: `${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
        isToday: iso === hojeIso,
        cap,
        used,
        blocks,
      });
    }

    return rows;
  }, [agSem, baseIso, colorSlotByOs, hojeIso, horas, orderById, plan.dias]);

  const weekAllocatedHours = useMemo(
    () => Math.round(weekDays.reduce((s, d) => s + d.used, 0) * 100) / 100,
    [weekDays]
  );
  const weekUtilizationPct =
    weeklyCapacity > 0 ? Math.min(100, Math.round((weekAllocatedHours / weeklyCapacity) * 100)) : 0;
  const loadVsWeeklyRatioPct =
    weeklyCapacity > 0 ? Math.round((totalQueueHours / weeklyCapacity) * 100) : 0;
  const hasAnyCapacity = horas.some((h) => h > 0);

  return (
    <div className="space-y-5">
      {/* Header & Weekly Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">
            Agenda de Bancada Inteligente
          </h1>
          <p className="text-xs text-[#727784]">
            Distribuição automática por prioridade, quebra em múltiplos dias e previsão real de entrega
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-[#D9E0EC] bg-white p-1">
            <button
              type="button"
              disabled={agSem === 0}
              onClick={() => setAgSem((w) => Math.max(0, w - 1))}
              title="Semana anterior"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-[#414752] hover:bg-[#F3F6FB] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Semana anterior</span>
            </button>

            <button
              type="button"
              onClick={() => setAgSem(0)}
              title="Voltar para hoje"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                agSem === 0
                  ? 'bg-[#EAF2FD] text-[#0056ab]'
                  : 'text-[#091b36] hover:bg-[#F3F6FB]'
              }`}
            >
              Hoje
            </button>

            <button
              type="button"
              onClick={() => setAgSem((w) => w + 1)}
              title="Próxima semana"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
            >
              <span className="hidden sm:inline">Próxima semana</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCapacityDrawer((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-4 h-4 text-[#0056ab]" />
            <span>Regime de Bancada</span>
          </button>
        </div>
      </div>

      {/* Zero Capacity Warning */}
      {!hasAnyCapacity && (
        <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 flex items-start gap-2.5 text-xs text-[#92400E]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#D97706]" />
          <div>
            <strong>Todos os dias estão com 0 h.</strong>{' '}
            {canEditScheduleCapacity
              ? 'Abra "Regime de Bancada" acima para definir as horas diárias e ativar o cálculo automático da agenda.'
              : 'Solicite ao Administrador que defina a carga horária diária em Ajustes.'}
          </div>
        </div>
      )}

      {/* KPI Strip: Carga total vs Capacidade semanal + Data de término da fila */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Carga Total na Fila</span>
          <span className="text-xl font-bold text-[#0056ab] tabular-nums">
            {formatHoursLabel(totalQueueHours)}
          </span>
          <span className="text-[10px] text-[#727784] block mt-0.5">
            {filaOrders.length} {filaOrders.length === 1 ? 'OS ativa' : 'OS ativas'} ({loadVsWeeklyRatioPct}% de 1 sem.)
          </span>
        </div>

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Capacidade Semanal</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">
            {formatHoursLabel(weeklyCapacity)}
          </span>
          <span className="text-[10px] text-[#727784] block mt-0.5">
            {activeWeekdaysCount} {activeWeekdaysCount === 1 ? 'dia ativo' : 'dias ativos'} · {weekUtilizationPct}% nesta semana
          </span>
        </div>

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Fila Termina Em</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">
            {totalQueueHours > 0 && plan.fim ? formatDateBR(plan.fim) : '—'}
          </span>
          <span className="text-[10px] text-[#727784] block mt-0.5">
            Pela carga horária atual
          </span>
        </div>

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Aguardando Peça</span>
          <span className="text-xl font-bold text-[#D97706] tabular-nums">
            {awaitingPartOrders.length} OS
          </span>
          <span className="text-[10px] text-[#727784] block mt-0.5">
            Não ocupam horas até chegada
          </span>
        </div>
      </div>

      {/* Collapsible Capacity Drawer (syncs with state.cfg.horas) */}
      {showCapacityDrawer && (
        <div className="rounded-2xl bg-white p-4 border border-[#0056ab]/35 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-[#091b36]">
              Carga Horária da Bancada (Horas Úteis por Dia)
            </h2>
            <button
              type="button"
              onClick={() => setShowCapacityDrawer(false)}
              className="text-xs text-[#727784] hover:text-[#091b36] cursor-pointer"
            >
              Fechar
            </button>
          </div>

          {canEditScheduleCapacity ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                {WEEKDAY_LABELS.map((label, dow) => (
                  <div
                    key={label}
                    className="rounded-xl bg-[#F3F6FB] p-2.5 border border-[#D9E0EC] text-center"
                  >
                    <p className="text-[11px] font-semibold text-[#091b36]">{label}</p>
                    <div className="mt-1.5 flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setWeekdayHours(dow, Math.max(0, horas[dow] - 0.5))}
                        className="w-6 h-6 rounded-lg bg-white border border-[#D9E0EC] text-xs font-bold cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold text-[#0056ab] tabular-nums min-w-[38px]">
                        {horas[dow].toFixed(1)}h
                      </span>
                      <button
                        type="button"
                        onClick={() => setWeekdayHours(dow, Math.min(24, horas[dow] + 0.5))}
                        className="w-6 h-6 rounded-lg bg-white border border-[#D9E0EC] text-xs font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                <div className="rounded-xl bg-[#EAF2FD]/70 p-2.5 border border-[#0056ab]/25 text-center">
                  <p className="text-[11px] font-semibold text-[#0056ab]">Seg–Sex</p>
                  <div className="mt-1.5 flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      placeholder="h"
                      value={workdaysQuickInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setWorkdaysQuickInput(raw);
                        if (raw !== '') {
                          setWorkdaysHours(Math.max(0, Math.min(24, Number(raw) || 0)));
                        }
                      }}
                      className="w-14 rounded-lg border border-[#D9E0EC] bg-white px-1.5 py-1 text-xs text-center tabular-nums"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[#727784]">
                Dias com <strong>0 h</strong> aparecem como <strong>Folga</strong> e não recebem serviços. Alterações recalculam toda a fila imediatamente.
              </p>
            </>
          ) : (
            <p className="text-xs text-[#727784]">
              A carga horária da bancada é definida pelo Administrador em Configurações.
            </p>
          )}
        </div>
      )}

      {/* Main Split: Weekly Proportional Bar Planner + Priority Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 7-Day Planner */}
        <div className="lg:col-span-7 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0056ab]" />
                <span>{agSem === 0 ? 'Esta semana' : `Semana +${agSem}`}</span>
              </h2>
              <p className="text-[11px] text-[#727784] mt-0.5">
                {formatDateBR(baseIso)} a {formatDateBR(weekEndIso)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-[#091b36] tabular-nums block">
                {formatHoursLabel(weekAllocatedHours)} / {formatHoursLabel(weeklyCapacity)}
              </span>
              <span className="text-[10px] text-[#727784]">
                Alocado nesta janela semanal
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {weekDays.map((day) => {
              const isOff = day.cap <= 0;
              return (
                <div
                  key={day.iso}
                  className={`rounded-xl p-3 border transition-colors ${
                    day.isToday
                      ? 'bg-[#EAF2FD]/55 border-[#0056ab]/45'
                      : isOff
                      ? 'bg-[#F3F6FB]/40 border-[#D9E0EC]/80 opacity-85'
                      : 'bg-[#F3F6FB]/50 border-[#D9E0EC]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#091b36]">
                        {day.dayName} {day.ddmm}
                      </span>
                      {day.isToday && (
                        <span className="px-1.5 py-0.5 rounded bg-[#0056ab] text-white text-[10px] font-bold">
                          HOJE
                        </span>
                      )}
                      {isOff && (
                        <span className="px-1.5 py-0.5 rounded bg-[#E2E8F0] text-[#475569] text-[10px] font-bold">
                          Folga
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-[#414752] tabular-nums">
                      {isOff
                        ? '0 h · Folga'
                        : `${formatHoursLabel(day.used)} / ${formatHoursLabel(day.cap)}`}
                    </span>
                  </div>

                  {!isOff && (
                    <>
                      {/* Proportional Bar Track */}
                      <div
                        className="h-9 rounded-lg bg-white border border-[#D9E0EC] p-1 flex items-center gap-1 overflow-hidden"
                        role="img"
                        aria-label={`${formatHoursLabel(day.used)} ocupadas de ${formatHoursLabel(day.cap)}`}
                      >
                        {day.blocks.length > 0 ? (
                          day.blocks.map((block) => {
                            const widthPct = Math.max(
                              6,
                              Math.min(100, (block.hours / day.cap) * 100)
                            );
                            return (
                              <button
                                key={block.key}
                                type="button"
                                onClick={() => onSelectOrder?.(block.orderId)}
                                style={{ width: `${widthPct}%` }}
                                title={`${block.label} · ${formatHoursLabel(block.hours)}${
                                  block.isContinuation ? ' (continuação)' : ''
                                }`}
                                className={`h-full rounded-md px-2 flex items-center justify-between text-[11px] font-semibold truncate cursor-pointer hover:opacity-90 transition-opacity ${block.colorClass}`}
                              >
                                <span className="truncate">{block.osCode}</span>
                                <span className="ml-1 text-[10px] opacity-90 tabular-nums shrink-0">
                                  {Math.round(block.hours * 100) / 100}h
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <span className="text-[11px] text-[#727784] px-2">
                            Dia livre — bancada disponível para novos encaixes
                          </span>
                        )}
                      </div>

                      {/* Clickable Block Detail Chips */}
                      {day.blocks.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {day.blocks.map((block) => (
                            <button
                              key={`${block.key}-chip`}
                              type="button"
                              onClick={() => onSelectOrder?.(block.orderId)}
                              className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#D9E0EC] px-2 py-1 text-[11px] text-[#091b36] hover:border-[#0056ab] hover:bg-[#EAF2FD]/40 cursor-pointer"
                            >
                              <strong className="text-[#0056ab]">{block.label}</strong>
                              <span className="text-[#414752] tabular-nums">
                                · {formatHoursLabel(block.hours)}
                              </span>
                              {block.isContinuation && (
                                <span className="text-[#0369A1] font-semibold">
                                  (continuação)
                                </span>
                              )}
                              {block.isInRepair && (
                                <span className="text-[#0891B2] font-semibold">
                                  · em reparo
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {agSem > 0 && (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setAgSem(0)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-1.5 text-xs font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
              >
                Voltar para hoje
              </button>
            </div>
          )}
        </div>

        {/* Priority Queue (`Fila de bancada`) */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0056ab]" />
              <span>Fila de Bancada ({filaOrders.length})</span>
            </h2>
            <span className="text-[11px] text-[#727784]">Ordem de execução</span>
          </div>

          <div className="space-y-2.5">
            {filaOrders.map((order, idx) => {
              const predIso = plan.prev[String(order.id)] || '';
              const atrasa = Boolean(
                order.expectedDeliveryDate && predIso && predIso > order.expectedDeliveryDate
              );
              const hoursVal = Number(order.estimatedHours) || 0;

              return (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder?.(order.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectOrder?.(order.id);
                    }
                  }}
                  className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                    atrasa
                      ? 'border-[#FDE68A] bg-[#FFFBEB]/60 hover:bg-[#FFFBEB]'
                      : 'border-[#D9E0EC] bg-[#F3F6FB]/50 hover:bg-[#EAF2FD]/45'
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-[#0056ab] tabular-nums">
                        {order.code}
                      </span>
                      <span className="text-xs font-bold text-[#091b36] truncate">
                        {order.device}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          order.status === 'Em reparo' || order.status === 'Em Reparo SMD'
                            ? 'bg-[#EAF2FD] text-[#0056ab]'
                            : 'bg-[#E0F2FE] text-[#0369A1]'
                        }`}
                      >
                        {order.status}
                      </span>
                      {atrasa && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA]">
                          <AlertTriangle className="w-3 h-3" />
                          Pode atrasar
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#414752] truncate">
                      {order.clientName} · {order.issue || 'Sem descrição de defeito'}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#727784]">
                      <span>
                        Tempo:{' '}
                        <strong className="text-[#091b36] tabular-nums">
                          {hoursVal > 0 ? formatHoursLabel(hoursVal) : 'sem tempo estimado'}
                        </strong>
                      </span>
                      {predIso && (
                        <span>
                          Previsão da agenda:{' '}
                          <strong className={atrasa ? 'text-[#DC2626]' : 'text-[#091b36]'}>
                            {formatDateBR(predIso)}
                          </strong>
                        </span>
                      )}
                      {order.expectedDeliveryDate && (
                        <span>
                          Prometido:{' '}
                          <strong className="text-[#091b36]">
                            {formatDateBR(order.expectedDeliveryDate)}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ▲ Subir / ▼ Descer (movOS) */}
                  <div
                    className="flex flex-col gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveOrderInQueue(order.id, -1)}
                      title="Subir na fila"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-[#D9E0EC] text-[10px] font-semibold text-[#414752] hover:bg-[#EAF2FD] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                      <span>Subir</span>
                    </button>
                    <button
                      type="button"
                      disabled={idx === filaOrders.length - 1}
                      onClick={() => moveOrderInQueue(order.id, 1)}
                      title="Descer na fila"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-[#D9E0EC] text-[10px] font-semibold text-[#414752] hover:bg-[#EAF2FD] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                      <span>Descer</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {filaOrders.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#D9E0EC] bg-[#F3F6FB]/50 p-6 text-center text-xs text-[#727784]">
                Nenhuma OS aprovada ou em reparo na fila ativa. Quando uma OS for aprovada (e não estiver aguardando peça), ela entra aqui automaticamente.
              </div>
            )}
          </div>

          <p className="text-[11px] text-[#727784] leading-relaxed">
            A ordem da fila define quem é feito primeiro. Orçamentos não ocupam a agenda.{' '}
            {semPecaCount > 0 && (
              <>
                {semPecaCount}{' '}
                {semPecaCount === 1
                  ? 'OS aprovada aguarda peça e não ocupa horas até a peça chegar. '
                  : 'OS aprovadas aguardam peça e não ocupam horas até a peça chegar. '}
              </>
            )}
            {ordersWithoutHours.length > 0 && (
              <span className="text-[#D97706] font-medium">
                {ordersWithoutHours.length}{' '}
                {ordersWithoutHours.length === 1 ? 'OS sem tempo estimado não ocupa horas.' : 'OS sem tempo estimado não ocupam horas.'}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Separate Section: OS Aguardando Peça */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
              <Package className="w-4 h-4 text-[#D97706]" />
              <span>OS Aguardando Peça ({awaitingPartOrders.length})</span>
            </h2>
            <p className="text-[11px] text-[#727784] mt-0.5">
              Ordens em status &ldquo;Aguardando Peça&rdquo; ou aprovadas com encomenda pendente não consomem horas da bancada até a confirmação de chegada.
            </p>
          </div>
        </div>

        {awaitingPartOrders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awaitingPartOrders.map((order) => {
              const daysLeft = order.pedPrev ? diasAteIso(order.pedPrev) : null;
              const isOverdue = daysLeft !== null && daysLeft < 0;
              const isToday = daysLeft === 0;
              const isApprovedWaitingPart = semPeca(order);

              return (
                <div
                  key={order.id}
                  onClick={() => onSelectOrder?.(order.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectOrder?.(order.id);
                    }
                  }}
                  className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer transition-colors ${
                    isOverdue
                      ? 'border-[#FECACA] bg-[#FEF2F2]/60 hover:bg-[#FEF2F2]'
                      : 'border-[#FDE68A] bg-[#FFFBEB]/50 hover:bg-[#FFFBEB]'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#0056ab] tabular-nums">
                        {order.code}
                      </span>
                      <span className="text-xs font-bold text-[#091b36] truncate">
                        {order.device}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FFF7E6] text-[#D97706] border border-[#FDE68A]">
                        {isApprovedWaitingPart ? 'Aprovada · Aguardando peça' : order.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#414752] truncate">
                      {order.clientName} · {order.issue}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#727784]">
                      {order.pedForn && (
                        <span className="inline-flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {order.pedForn}
                        </span>
                      )}
                      {order.pedPrev && (
                        <span
                          className={`font-semibold ${
                            isOverdue
                              ? 'text-[#DC2626]'
                              : isToday
                              ? 'text-[#D97706]'
                              : 'text-[#091b36]'
                          }`}
                        >
                          Previsão peça: {formatDateBR(order.pedPrev)}
                          {isOverdue ? ' (atrasada)' : isToday ? ' (hoje)' : ''}
                        </span>
                      )}
                      {order.pedRastreio && <span>Rastreio: {order.pedRastreio}</span>}
                    </div>
                  </div>

                  <div
                    className="shrink-0 flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {confirmArrivedId === order.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            markOrderPartArrived(order.id);
                            setConfirmArrivedId(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#15803D] cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          Sim, chegou
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmArrivedId(null)}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#414752] cursor-pointer"
                        >
                          Não
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmArrivedId(order.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#091b36] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0056ab] cursor-pointer whitespace-nowrap"
                      >
                        <Package className="w-3 h-3" />
                        Peça chegou
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#D9E0EC] bg-[#F3F6FB]/50 p-4 text-center text-xs text-[#727784]">
            Nenhuma OS aguardando chegada de peça no momento.
          </div>
        )}
      </div>
    </div>
  );
};
