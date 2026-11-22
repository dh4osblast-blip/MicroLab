import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, RotateCcw, Search, ShieldCheck, Truck, X, Zap } from 'lucide-react';
import { ServiceOrder, WarrantyCase } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  diasAteIso,
  formatDateBR,
  getOrderWarrantyBadge,
  resolveOrderWarrantyUntil,
} from '../utils/pricing';

interface WarrantiesViewProps {
  onOpenReturnWarrantyOs?: () => void;
  onSelectOrder?: (id: number) => void;
}

export const WarrantiesView: React.FC<WarrantiesViewProps> = ({
  onOpenReturnWarrantyOs,
  onSelectOrder,
}) => {
  const {
    state,
    currentUser,
    addWarrantyCase,
    updateWarrantyStatus,
    addOrder,
    setOsPrefillDraft,
  } = useLabStore();
  const [filter, setFilter] = useState<'Todos' | WarrantyCase['status']>('Todos');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(state.warranties[0]?.id || '');
  const [feedback, setFeedback] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  // New RMA form state
  const [rmaOsId, setRmaOsId] = useState('');
  const [rmaOriginOs, setRmaOriginOs] = useState('');
  const [rmaClientName, setRmaClientName] = useState('');
  const [rmaDevice, setRmaDevice] = useState('');
  const [rmaService, setRmaService] = useState('');
  const [rmaStatus, setRmaStatus] = useState<WarrantyCase['status']>('Em Análise');
  const [rmaBatchCode, setRmaBatchCode] = useState('');
  const [rmaSealCode, setRmaSealCode] = useState('');
  const [rmaSealIntact, setRmaSealIntact] = useState(true);
  const [rmaSymptom, setRmaSymptom] = useState('');
  const [rmaReport, setRmaReport] = useState('');

  const filtered = state.warranties.filter((w) => {
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      w.code.toLowerCase().includes(q) ||
      w.clientName.toLowerCase().includes(q) ||
      w.device.toLowerCase().includes(q);
    const matchesStatus = filter === 'Todos' || w.status === filter;
    return matchesQ && matchesStatus;
  });

  const activeCase = state.warranties.find((w) => w.id === selectedId) || filtered[0];

  // OS Entregues com contagem regressiva de garantia (v17 garV / histCli)
  const deliveredOrdersWithWarranty = useMemo(() => {
    return state.orders
      .filter((o) => o.status === 'Entregue')
      .map((o) => {
        const badge = getOrderWarrantyBadge(o, state.servicos, state.cfg);
        const until = resolveOrderWarrantyUntil(o, state.servicos, state.cfg);
        const daysLeft = until ? diasAteIso(until) : null;
        return { order: o, badge, until, daysLeft };
      })
      .sort((a, b) => (b.daysLeft ?? -999) - (a.daysLeft ?? -999));
  }, [state.orders, state.servicos, state.cfg]);

  const activeWarrantiesCount = deliveredOrdersWithWarranty.filter(
    (x) => x.daysLeft !== null && x.daysLeft >= 0
  ).length;

  const handleTriggerReturnWarrantyOs = (o: ServiceOrder) => {
    setOsPrefillDraft({
      source: 'warranty',
      clientId: state.clients.some((c) => c.id === o.clientId) ? o.clientId : '',
      brand: o.brand || '',
      model: o.model || o.device,
      device: o.device,
      imei: o.imei === 'Não informado' ? '' : o.imei,
      issue: `Retorno de garantia da OS ${o.code}`,
      notes: `Retorno dentro da garantia (OS ${o.code})`,
      serviceCatalogId: o.serviceCatalogId || '',
      partCost: 0,
      partFreight: 0,
      consumables: 0,
      estimatedHours: 0.5,
      servicePrice: 0,
      status: 'Aprovado',
      returnWarrantyFromId: o.id,
    });
    onOpenReturnWarrantyOs?.();
  };

  const handleReopenFreeOs = (w: WarrantyCase) => {
    addOrder({
      clientId: `cli-gar-${w.id}`,
      clientName: w.clientName,
      clientPhone: 'Não informado',
      clientCpf: '000.***.***-00',
      device: w.device,
      deviceType: 'smartphone',
      imei: w.sealCode,
      issue: `[GARANTIA ${w.code}] ${w.symptom}`,
      diagnosis: `Reabertura cortesia vinculada à ${w.originOs}. Lote: ${w.batchCode}`,
      status: 'Em reparo',
      priority: 'Urgente',
      technician:
        currentUser?.nome ||
        state.tecnicos[0]?.nome ||
        state.labProfile.technicianName ||
        'Técnico Bancada',
      estimatedHours: 1.5,
      servicePrice: 0,
      partsPrice: 0,
      paymentStatus: 'Pago Pix',
      checklist: {
        faceId: 'Revisar',
        cameras: 'OK',
        battery: 'Normal',
        chassis: w.sealIntact ? 'Lacre Intacto' : 'Lacre Violado',
      },
    });
    updateWarrantyStatus(w.id, 'Concluída');
    setFeedback(`OS em Garantia sem custo criada para ${w.clientName}!`);
    setTimeout(() => setFeedback(''), 3500);
  };

  const statusBadge = (st: WarrantyCase['status']) => {
    switch (st) {
      case 'Em Análise':
        return 'bg-[#FFF7E6] text-[#D97706]';
      case 'RMA Fornecedor':
        return 'bg-[#EAF2FD] text-[#0056ab]';
      default:
        return 'bg-[#DCFCE7] text-[#16A34A]';
    }
  };

  const openNewRmaModal = () => {
    setRmaOsId('');
    setRmaOriginOs('');
    setRmaClientName('');
    setRmaDevice('');
    setRmaService('');
    setRmaStatus('Em Análise');
    setRmaBatchCode('');
    setRmaSealCode('');
    setRmaSealIntact(true);
    setRmaSymptom('');
    setRmaReport('');
    setShowNewModal(true);
  };

  const handleSelectLinkedOs = (orderIdStr: string) => {
    setRmaOsId(orderIdStr);
    const found = state.orders.find((o) => String(o.id) === orderIdStr);
    if (!found) return;
    setRmaOriginOs(found.code || `OS #${found.id}`);
    setRmaClientName(found.clientName || '');
    setRmaDevice(found.device || '');
    setRmaService(found.serviceCatalogName || found.issue || '');
  };

  const handleCreateRma = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rmaClientName.trim() || !rmaDevice.trim() || !rmaSymptom.trim()) return;
    const created = addWarrantyCase({
      originOs: rmaOriginOs.trim() || 'Avulso',
      clientName: rmaClientName.trim(),
      device: rmaDevice.trim(),
      service: rmaService.trim() || 'Avaliação de Garantia / RMA',
      status: rmaStatus,
      batchCode: rmaBatchCode.trim() || 'Lote não informado',
      sealCode: rmaSealCode.trim() || 'Sem lacre',
      sealIntact: rmaSealIntact,
      symptom: rmaSymptom.trim(),
      preliminaryReport:
        rmaReport.trim() || 'Protocolo aberto para inspeção técnica de garantia/RMA.',
    });
    setSelectedId(created.id);
    setShowNewModal(false);
    setFeedback(`Protocolo ${created.code} registrado com sucesso!`);
    setTimeout(() => setFeedback(''), 3500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Garantias, Retornos &amp; RMA</h1>
          <p className="text-xs text-[#727784]">
            Contagem regressiva de garantia por OS entregue, auditoria de lacre técnico e retorno sem custo
          </p>
        </div>
        <button
          type="button"
          onClick={openNewRmaModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap self-start"
        >
          <Plus className="w-4 h-4" />
          <span>+ Novo Protocolo RMA</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">OS em Garantia Ativa</span>
          <span className="text-xl font-bold text-[#16A34A] tabular-nums">{activeWarrantiesCount}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Protocolos em Análise</span>
          <span className="text-xl font-bold text-[#D97706] tabular-nums">
            {state.warranties.filter((w) => w.status === 'Em Análise').length}
          </span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">RMA Fornecedor</span>
          <span className="text-xl font-bold text-[#0056ab] tabular-nums">
            {state.warranties.filter((w) => w.status === 'RMA Fornecedor').length}
          </span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Reserva Garantia Inter</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">
            {formatBRL(state.interBalances.garantiaReserve)}
          </span>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-4 py-2.5 text-xs font-semibold text-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* OS Entregues & Contagem Regressiva de Garantia (v17) */}
      <section className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#091b36]">
            Controle de Garantia por OS Entregue ({deliveredOrdersWithWarranty.length})
          </h2>
          <span className="text-[11px] text-[#727784]">
            Prazo padrão: {state.cfg.garantiaDias} dias após entrega
          </span>
        </div>

        {deliveredOrdersWithWarranty.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {deliveredOrdersWithWarranty.map(({ order, badge, until, daysLeft }) => (
              <div
                key={order.id}
                className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectOrder?.(order.id)}
                      className="font-bold text-[#0056ab] hover:underline cursor-pointer"
                    >
                      {order.code}
                    </button>
                    <span className="font-bold text-[#091b36] truncate">{order.device}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        badge.tone === 'ok'
                          ? 'bg-[#DCFCE7] text-[#16A34A]'
                          : badge.tone === 'warn'
                          ? 'bg-[#FFF7E6] text-[#D97706]'
                          : 'bg-white text-[#727784] border border-[#D9E0EC]'
                      }`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#414752] truncate">
                    {order.clientName} · Entrega: {formatDateBR(order.deliveredAt || order.createdDate)}
                    {until ? ` · Garantia até ${formatDateBR(until)}` : ''}
                  </p>
                </div>

                {daysLeft !== null && daysLeft >= 0 && (
                  <button
                    type="button"
                    onClick={() => handleTriggerReturnWarrantyOs(order)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#1b6fd1] shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retorno de garantia</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#727784]">
            Nenhuma OS entregue ainda. Quando uma OS é marcada como Entregue, a contagem regressiva da garantia aparece aqui.
          </p>
        )}
      </section>

      {/* Filter Bar for RMA Cases */}
      <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC] flex flex-col md:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar protocolo #GAR, cliente ou modelo..."
            className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['Todos', 'Em Análise', 'RMA Fornecedor', 'Concluída'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                filter === tab ? 'bg-[#0056ab] text-white' : 'bg-[#F3F6FB] text-[#414752]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Split Cases & Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 space-y-2.5">
          {filtered.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setSelectedId(w.id)}
              className={`w-full text-left rounded-2xl p-4 border transition-colors cursor-pointer ${
                activeCase?.id === w.id
                  ? 'bg-[#EAF2FD]/70 border-[#0056ab]'
                  : 'bg-white border-[#D9E0EC] hover:border-[#0056ab]/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-[#0056ab] tabular-nums">
                  {w.code} · {w.originOs}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${statusBadge(w.status)}`}>
                  {w.status}
                </span>
              </div>
              <p className="text-xs font-bold text-[#091b36]">{w.device}</p>
              <p className="text-[11px] text-[#414752] mt-0.5">
                {w.clientName} · {w.service}
              </p>
              <p className="text-[10px] text-[#727784] mt-1">{w.openedAt}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 border border-[#D9E0EC] text-center text-xs text-[#727784]">
              {state.warranties.length === 0
                ? 'Nenhum protocolo de RMA registrado.'
                : 'Nenhum protocolo encontrado para os filtros aplicados.'}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          {activeCase ? (
            <>
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#D9E0EC]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[#0056ab]">{activeCase.code}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${statusBadge(activeCase.status)}`}>
                      {activeCase.status}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-[#091b36] mt-1">
                    {activeCase.device} — {activeCase.clientName}
                  </h2>
                  <p className="text-xs text-[#727784]">
                    {activeCase.batchCode} · Lacre {activeCase.sealCode}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#16A34A] text-[11px] font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  {activeCase.sealIntact ? 'Lacre Intacto' : 'Verificar Lacre'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC]">
                  <p className="font-bold text-[#091b36] mb-1">Sintoma Relatado no Retorno</p>
                  <p className="text-[#414752]">{activeCase.symptom}</p>
                </div>
                <div className="rounded-xl bg-[#EAF2FD]/50 p-3.5 border border-[#0056ab]/20">
                  <p className="font-bold text-[#091b36] mb-1">Laudo Técnico Preliminar</p>
                  <p className="text-[#414752]">{activeCase.preliminaryReport}</p>
                </div>
              </div>

              {(() => {
                const originOrder = state.orders.find(
                  (o) => `OS ${o.code}` === activeCase.originOs || o.code === activeCase.originOs
                );
                const tel = originOrder?.telemetry;
                return (
                  <div className="rounded-xl bg-[#0B0F17] text-white p-3.5 border border-[#2A3954] flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[#06B6D4] font-semibold">
                      <Zap className="w-4 h-4" /> Telemetria da OS de Origem
                    </span>
                    <span className="font-mono text-[#10B981] tabular-nums">
                      {tel
                        ? `${tel.voltage.toFixed(2)}V · ${tel.current.toFixed(3)}A · ${tel.power.toFixed(2)}W`
                        : 'Sem leitura vinculada à OS'}
                    </span>
                  </div>
                );
              })()}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#D9E0EC]">
                <button
                  type="button"
                  onClick={() => handleReopenFreeOs(activeCase)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reabrir OS sem Custo</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateWarrantyStatus(activeCase.id, 'RMA Fornecedor')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
                >
                  <Truck className="w-4 h-4 text-[#0056ab]" />
                  <span>Acionar RMA Fornecedor</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateWarrantyStatus(activeCase.id, 'Concluída')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#DCFCE7] px-3.5 py-2.5 text-xs font-semibold text-[#16A34A] hover:bg-[#bbf7d0] cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Concluir</span>
                </button>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-xs text-[#727784]">Nenhum protocolo selecionado.</p>
          )}
        </div>
      </div>

      {/* Modal Novo Protocolo RMA */}
      {showNewModal && (
        <div
          data-modal-open="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowNewModal(false)}
        >
          <form
            onSubmit={handleCreateRma}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Novo Protocolo de Garantia / RMA</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {state.orders.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Vincular à OS existente (opcional — preenche cliente e aparelho)
                </label>
                <select
                  value={rmaOsId}
                  onChange={(e) => handleSelectLinkedOs(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                >
                  <option value="">Selecionar OS ou preencher manualmente...</option>
                  {state.orders.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.code} · {o.clientName} · {o.device}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  OS de Origem
                </label>
                <input
                  value={rmaOriginOs}
                  onChange={(e) => setRmaOriginOs(e.target.value)}
                  placeholder="Ex: OS-1042"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Status Inicial
                </label>
                <select
                  value={rmaStatus}
                  onChange={(e) => setRmaStatus(e.target.value as WarrantyCase['status'])}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                >
                  <option value="Em Análise">Em Análise</option>
                  <option value="RMA Fornecedor">RMA Fornecedor</option>
                  <option value="Concluída">Concluída</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Cliente *
                </label>
                <input
                  required
                  value={rmaClientName}
                  onChange={(e) => setRmaClientName(e.target.value)}
                  placeholder="Nome completo do cliente"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Aparelho *
                </label>
                <input
                  required
                  value={rmaDevice}
                  onChange={(e) => setRmaDevice(e.target.value)}
                  placeholder="Ex: iPhone 13 Pro"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Serviço / Peça vinculada
              </label>
              <input
                value={rmaService}
                onChange={(e) => setRmaService(e.target.value)}
                placeholder="Ex: Troca de Display OLED Soft"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Lote / Fornecedor
                </label>
                <input
                  value={rmaBatchCode}
                  onChange={(e) => setRmaBatchCode(e.target.value)}
                  placeholder="Ex: LOTE-2026-04"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Código do Lacre / IMEI
                </label>
                <input
                  value={rmaSealCode}
                  onChange={(e) => setRmaSealCode(e.target.value)}
                  placeholder="Ex: ML-9912"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-[#091b36] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={rmaSealIntact}
                onChange={(e) => setRmaSealIntact(e.target.checked)}
                className="rounded border-[#D9E0EC] accent-[#0056ab]"
              />
              <span>Lacre técnico MicroLab intacto e sem sinais de violação / mau uso</span>
            </label>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Sintoma Relatado no Retorno *
              </label>
              <textarea
                required
                rows={2}
                value={rmaSymptom}
                onChange={(e) => setRmaSymptom(e.target.value)}
                placeholder="Descreva o sintoma apresentado no retorno..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Laudo Técnico Preliminar
              </label>
              <textarea
                rows={2}
                value={rmaReport}
                onChange={(e) => setRmaReport(e.target.value)}
                placeholder="Observações de bancada, inspeção visual ou análise RMA..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                Registrar Protocolo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
