import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Sliders,
  X,
} from 'lucide-react';
import { useLabStore } from '../store/useLabStore';

export const ScheduleView: React.FC = () => {
  const { state, reorderPriorityQueue, enqueuePriorityItem, updateDayCapacity } = useLabStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showCapacityDrawer, setShowCapacityDrawer] = useState(false);
  const [showEnqueueModal, setShowEnqueueModal] = useState(false);
  const [newOsCode, setNewOsCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newHours, setNewHours] = useState('1.0');

  const totalWeeklyCapacity = state.scheduleDays.reduce((s, d) => s + d.capacityHours, 0);
  const totalScheduledHours = state.scheduleDays.reduce(
    (s, d) => s + d.items.reduce((acc, i) => acc + i.hours, 0),
    0
  );
  const utilizationPct = Math.round((totalScheduledHours / Math.max(1, totalWeeklyCapacity)) * 100);

  const toneBarClass = (tone: 'primary' | 'voltage' | 'dark' | 'secondary') => {
    switch (tone) {
      case 'voltage':
        return 'bg-[#06B6D4] text-[#091b36]';
      case 'dark':
        return 'bg-[#091b36] text-white';
      case 'secondary':
        return 'bg-[#4f5e81] text-white';
      default:
        return 'bg-[#0056ab] text-white';
    }
  };

  const handleEnqueue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOsCode.trim() || !newTitle.trim()) return;
    enqueuePriorityItem(newOsCode.trim(), newTitle.trim(), parseFloat(newHours) || 1.0);
    setShowEnqueueModal(false);
    setNewOsCode('');
    setNewTitle('');
    setNewHours('1.0');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Agenda de Bancada &amp; Capacidade</h1>
          <p className="text-xs text-[#727784]">
            Planejamento semanal de horas técnicas e fila de priorização SMD
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-[#D9E0EC] bg-white p-1">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-1.5 rounded-lg text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="px-2.5 text-xs font-semibold text-[#091b36] cursor-pointer"
            >
              {weekOffset === 0 ? 'Semana Atual' : weekOffset > 0 ? `+${weekOffset} Sem` : `${weekOffset} Sem`}
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-1.5 rounded-lg text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
            >
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
          <button
            type="button"
            onClick={() => setShowEnqueueModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Enfileirar OS</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Capacidade Semanal</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">{totalWeeklyCapacity.toFixed(1)}h</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Horas Alocadas</span>
          <span className="text-xl font-bold text-[#0056ab] tabular-nums">{totalScheduledHours.toFixed(1)}h</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Ocupação Global</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">{utilizationPct}%</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Itens na Fila</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">{state.priorityQueue.length} OS</span>
        </div>
      </div>

      {/* Collapsible Capacity Adjustment Drawer */}
      {showCapacityDrawer && (
        <div className="rounded-2xl bg-white p-4 border border-[#0056ab]/35 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#091b36]">Ajuste de Capacidade Diária da Bancada (Horas Úteis)</h2>
            <button
              type="button"
              onClick={() => setShowCapacityDrawer(false)}
              className="text-xs text-[#727784] hover:text-[#091b36] cursor-pointer"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {state.scheduleDays.map((day) => (
              <div key={day.id} className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC] text-center">
                <p className="text-[11px] font-semibold text-[#091b36]">{day.shortName}</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateDayCapacity(day.id, day.capacityHours - 0.5)}
                    className="w-6 h-6 rounded-lg bg-white border border-[#D9E0EC] text-xs font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-xs font-bold text-[#0056ab] tabular-nums">{day.capacityHours.toFixed(1)}h</span>
                  <button
                    type="button"
                    onClick={() => updateDayCapacity(day.id, day.capacityHours + 0.5)}
                    className="w-6 h-6 rounded-lg bg-white border border-[#D9E0EC] text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Split: 7-Day Gantt + Priority Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0056ab]" />
              <span>Cronograma Horizontal (7 Dias)</span>
            </h2>
            <span className="text-[11px] text-[#727784] tabular-nums">
              {totalWeeklyCapacity.toFixed(1)}h/sem · {state.scheduleDays.filter((d) => d.capacityHours > 0).length} dias ativos
            </span>
          </div>

          <div className="space-y-3">
            {state.scheduleDays.map((day) => {
              const used = day.items.reduce((s, i) => s + i.hours, 0);
              return (
                <div
                  key={day.id}
                  className={`rounded-xl p-3 border ${
                    day.isToday
                      ? 'bg-[#EAF2FD]/50 border-[#0056ab]/40'
                      : 'bg-[#F3F6FB]/50 border-[#D9E0EC]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#091b36]">{day.label}</span>
                      {day.isToday && (
                        <span className="px-1.5 py-0.5 rounded bg-[#0056ab] text-white text-[10px] font-bold">
                          HOJE
                        </span>
                      )}
                      {day.id === 'dom' && !day.isOff && (
                        <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-semibold">
                          Domingo · {day.capacityHours.toFixed(1)}h
                        </span>
                      )}
                      {day.isOff && (
                        <span className="px-1.5 py-0.5 rounded bg-[#F3F6FB] text-[#727784] text-[10px] font-semibold">
                          Folga
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-[#414752] tabular-nums">
                      {used.toFixed(1)}h / {day.capacityHours.toFixed(1)}h
                    </span>
                  </div>

                  {/* Gantt Horizontal Track */}
                  <div className="h-9 rounded-lg bg-white border border-[#D9E0EC] p-1 flex items-center gap-1 overflow-x-auto">
                    {day.items.length > 0 ? (
                      day.items.map((item) => {
                        const widthPct = Math.min(100, Math.round((item.hours / Math.max(1, day.capacityHours)) * 100));
                        return (
                          <div
                            key={item.id}
                            style={{ width: `${Math.max(22, widthPct)}%` }}
                            className={`h-full rounded-md px-2 flex items-center justify-between text-[11px] font-semibold truncate shrink-0 ${toneBarClass(
                              item.tone
                            )}`}
                            title={`${item.osCode} · ${item.title} (${item.hours}h)`}
                          >
                            <span className="truncate">
                              {item.osCode} · {item.title}
                            </span>
                            <span className="ml-1.5 text-[10px] opacity-90 tabular-nums shrink-0">
                              {item.hours}h
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-[11px] text-[#727784] px-2">Bancada livre para novos encaixes</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority Queue */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0056ab]" />
              <span>Fila de Priorização</span>
            </h2>
            <span className="text-[11px] text-[#727784]">Reordene em tempo real</span>
          </div>

          <div className="space-y-2.5">
            {state.priorityQueue.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/50 p-3.5 flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#0056ab] tabular-nums">{item.osCode}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-[#D9E0EC] text-[#414752]">
                      {item.statusLabel}
                    </span>
                    <span className="text-[10px] text-[#727784]">{item.benchLabel}</span>
                  </div>
                  <p className="text-xs font-semibold text-[#091b36]">{item.title}</p>
                  <p className="text-[11px] text-[#727784]">
                    Prometido: <strong>{item.promised}</strong> · {item.estimated}
                  </p>
                  {item.warningNote && (
                    <p className="inline-flex items-center gap-1 text-[11px] text-[#D97706] font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.warningNote}</span>
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => reorderPriorityQueue(idx, 'up')}
                    title="Subir prioridade"
                    className="p-1.5 rounded-lg bg-white border border-[#D9E0EC] text-[#414752] hover:bg-[#EAF2FD] disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === state.priorityQueue.length - 1}
                    onClick={() => reorderPriorityQueue(idx, 'down')}
                    title="Descer prioridade"
                    className="p-1.5 rounded-lg bg-white border border-[#D9E0EC] text-[#414752] hover:bg-[#EAF2FD] disabled:opacity-40 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {state.priorityQueue.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#D9E0EC] bg-[#F3F6FB]/50 p-6 text-center text-xs text-[#727784]">
                Nenhuma OS na fila de priorização ainda.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enqueue Modal */}
      {showEnqueueModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowEnqueueModal(false)}
        >
          <form
            onSubmit={handleEnqueue}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Enfileirar Ordem na Bancada</h3>
              <button
                type="button"
                onClick={() => setShowEnqueueModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Código da OS</label>
              <input
                required
                value={newOsCode}
                onChange={(e) => setNewOsCode(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Descrição Técnica</label>
              <input
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Horas Previstas</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={newHours}
                onChange={(e) => setNewHours(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs tabular-nums"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEnqueueModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Adicionar à Fila
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
