import React, { useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Cake,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Cpu,
  DollarSign,
  MessageCircle,
  PackageCheck,
  PackageSearch,
  Plus,
  Printer,
  QrCode,
  ShoppingCart,
  Sliders,
  Smartphone,
  Tablet,
  Watch,
  Zap,
} from 'lucide-react';
import { RouteId, ServiceOrder } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  calcOrderTotalAmount,
  diasAteIso,
  formatDateBR,
  todayIsoLocal,
} from '../utils/pricing';

interface DashboardViewProps {
  onNavigate: (route: RouteId) => void;
  onSelectOrder: (orderId: number) => void;
  onOpenPix: (amount?: number, desc?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onSelectOrder,
  onOpenPix,
}) => {
  const { state, currentUser, canAccessRoute, markOrderPartArrived } = useLabStore();
  const [filterTab, setFilterTab] = useState<'Todas' | 'Bancada' | 'Aguardando' | 'Prontas'>('Todas');
  const [confirmPartOrderId, setConfirmPartOrderId] = useState<number | null>(null);
  const [activeAlertTab, setActiveAlertTab] = useState<'birthdays' | 'receivables' | 'agenda'>('agenda');
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const canSeeFinancialSummary = canAccessRoute('fluxo-de-caixa');

  const todayIso = todayIsoLocal();
  const todayMmDd = todayIso.slice(5, 10);

  const todayBirthdays = canAccessRoute('clientes')
    ? state.clients.filter((c) => Boolean(c.nasc && c.nasc.slice(5, 10) === todayMmDd))
    : [];

  const dueReceivableOrders = canAccessRoute('ordens-de-servico')
    ? state.orders
        .map((o) => {
          const total = calcOrderTotalAmount(o);
          const saldo = Math.round((total - (o.paidAmount || 0)) * 100) / 100;
          const isDueOrOverdue =
            ['Pronto', 'Pronto Retirada', 'Entregue'].includes(o.status) ||
            Boolean(o.isDiagOnly) ||
            (Boolean(o.expectedDeliveryDate) && (o.expectedDeliveryDate as string) <= todayIso);
          return { order: o, saldo, isDueOrOverdue };
        })
        .filter((x) => x.order.status !== 'Cancelado' && x.saldo > 0.004 && x.isDueOrOverdue)
        .sort((a, b) =>
          String(a.order.expectedDeliveryDate || a.order.createdDate || '').localeCompare(
            String(b.order.expectedDeliveryDate || b.order.createdDate || '')
          )
        )
    : [];
  const dueReceivablesTotal = dueReceivableOrders.reduce((s, x) => s + x.saldo, 0);

  const todayCapacity = state.scheduleDays.find((d) => d.isToday);
  const todayUsed = todayCapacity ? todayCapacity.items.reduce((sum, i) => sum + i.hours, 0) : 0;
  const todayTotal = todayCapacity ? todayCapacity.capacityHours : 4;
  const occPct = Math.round((todayUsed / Math.max(1, todayTotal)) * 100);

  const todayPromisedOrders = (() => {
    if (!canAccessRoute('ordens-de-servico') && !canAccessRoute('agenda-de-bancada')) return [];
    const seen = new Set<number>();
    const list: { order: ServiceOrder; reason: string }[] = [];
    state.orders.forEach((o) => {
      if (o.status === 'Entregue' || o.status === 'Cancelado') return;
      if (o.expectedDeliveryDate === todayIso) {
        seen.add(o.id);
        list.push({ order: o, reason: 'Entrega prometida hoje' });
      }
    });
    (todayCapacity?.items || []).forEach((item) => {
      if (!item.orderId || seen.has(item.orderId)) return;
      const ord = state.orders.find((o) => o.id === item.orderId);
      if (ord && ord.status !== 'Entregue' && ord.status !== 'Cancelado') {
        seen.add(ord.id);
        list.push({ order: ord, reason: 'Alocada na Agenda de hoje' });
      }
    });
    return list;
  })();

  const totalDayAlerts =
    todayBirthdays.length + dueReceivableOrders.length + todayPromisedOrders.length;

  const pendingPartsAlertOrders = canAccessRoute('ordens-de-servico')
    ? state.orders
        .filter(
          (o) =>
            Boolean(o.pedPrev) &&
            !o.pedChegou &&
            o.status !== 'Entregue' &&
            o.status !== 'Cancelado' &&
            (o.pedPrev as string) <= todayIso
        )
        .sort((a, b) => String(a.pedPrev).localeCompare(String(b.pedPrev)))
    : [];
  const hasOverdueParts = pendingPartsAlertOrders.some((o) => (o.pedPrev as string) < todayIso);

  const activeOrders = state.orders.filter(
    (o) => o.status !== 'Entregue' && o.status !== 'Cancelado'
  );
  const readyOrders = state.orders.filter(
    (o) => o.status === 'Pronto' || o.status === 'Pronto Retirada'
  );
  const smdOrders = state.orders.filter(
    (o) => o.status === 'Em reparo' || o.status === 'Em Reparo SMD'
  );
  const lowStockCount = state.parts.filter(
    (p) => p.status === 'Esgotado' || p.status === 'Alerta Reposição'
  ).length;

  const filteredOrders = state.orders.filter((order) => {
    if (filterTab === 'Bancada') {
      return ['Em reparo', 'Em Reparo SMD', 'Em Triagem'].includes(order.status);
    }
    if (filterTab === 'Aguardando') {
      return ['Orçamento', 'Aprovado', 'Aprovado / Fila', 'Aguardando Peça'].includes(order.status);
    }
    if (filterTab === 'Prontas') {
      return order.status === 'Pronto' || order.status === 'Pronto Retirada';
    }
    return true;
  });

  const getDeviceIcon = (type: ServiceOrder['deviceType']) => {
    if (type === 'tablet') return Tablet;
    if (type === 'watch') return Watch;
    return Smartphone;
  };

  const getStatusBadgeStyle = (status: ServiceOrder['status']) => {
    switch (status) {
      case 'Em reparo':
      case 'Em Reparo SMD':
        return 'bg-[#EAF2FD] text-[#0056ab]';
      case 'Aguardando Peça':
        return 'bg-[#FFF7E6] text-[#D97706]';
      case 'Aprovado':
      case 'Aprovado / Fila':
        return 'bg-[#E0F2FE] text-[#0369A1]';
      case 'Pronto':
      case 'Pronto Retirada':
        return 'bg-[#DCFCE7] text-[#16A34A]';
      case 'Cancelado':
        return 'bg-[#FEE2E2] text-[#DC2626]';
      case 'Entregue':
        return 'bg-[#F3F6FB] text-[#727784]';
      default:
        return 'bg-[#e8eeff] text-[#4f5e81]';
    }
  };

  const allQuickActions: {
    route: RouteId;
    label: string;
    sub: string;
    icon: React.FC<{ className?: string }>;
    action: () => void;
  }[] = [
    { route: 'nova-os', label: 'Nova OS', sub: 'Check-in rápido', icon: Plus, action: () => onNavigate('nova-os') },
    { route: 'pdv-rapido', label: 'PDV Rápido', sub: 'Venda & Balcão', icon: ShoppingCart, action: () => onNavigate('pdv-rapido') },
    { route: 'agenda-de-bancada', label: 'Agenda Bancada', sub: `${todayUsed.toFixed(1)}h / ${todayTotal.toFixed(1)}h`, icon: Calendar, action: () => onNavigate('agenda-de-bancada') },
    { route: 'fonte', label: 'Fonte ZK-SK150C', sub: 'Telemetria DC', icon: Zap, action: () => onNavigate('fonte') },
    { route: 'simulador-orcamento', label: 'Simular Preço', sub: 'Orçamento rápido', icon: Sliders, action: () => onNavigate('simulador-orcamento') },
    { route: 'gerador-pix', label: 'Gerar PIX', sub: 'Inter Dinâmico', icon: QrCode, action: () => onOpenPix(0, 'Cobrança Bancada') },
  ];
  const quickActions = allQuickActions.filter((qa) => canAccessRoute(qa.route));

  const displayName = currentUser?.nome || state.labProfile.technicianName;
  const displayRole = currentUser?.nivel || state.labProfile.role;

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <section className="rounded-2xl bg-gradient-to-br from-[#091b36] via-[#0d2a56] to-[#0056ab] text-white p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-sky-200 font-medium">
              <Cpu className="w-4 h-4" />
              <span>Laboratório MicroLab OS · {displayRole}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Bom trabalho, {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-sky-100/85 max-w-2xl">
              {activeOrders.length} ordens em andamento · {readyOrders.length} prontas para retirada · Ocupação da bancada hoje em{' '}
              <span className="font-semibold text-white tabular-nums">{occPct}%</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canAccessRoute('nova-os') && (
              <button
                type="button"
                onClick={() => onNavigate('nova-os')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white text-[#091b36] px-4 py-2.5 text-xs font-bold hover:bg-sky-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Abrir Check-in / OS</span>
              </button>
            )}
            {canAccessRoute('fonte') && (
              <button
                type="button"
                onClick={() => onNavigate('fonte')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 border border-white/25 text-white px-4 py-2.5 text-xs font-semibold hover:bg-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-[#06B6D4]" />
                <span>Painel Fonte ZK</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Faixa Discreta "Alertas do Dia" (v1.4 Buck) */}
      <section className="rounded-2xl bg-white border border-[#D9E0EC] px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#091b36]">
            <Bell className="w-4 h-4 text-[#0056ab] shrink-0" />
            <span>Alertas do Dia</span>
            <span className="text-[11px] font-medium text-[#727784]">
              · {formatDateBR(todayIso)} ·{' '}
              <span className="tabular-nums">
                {totalDayAlerts} {totalDayAlerts === 1 ? 'gatilho' : 'gatilhos'}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canAccessRoute('agenda-de-bancada') || canAccessRoute('ordens-de-servico') ? (
              <button
                type="button"
                onClick={() => {
                  setActiveAlertTab('agenda');
                  setAlertsExpanded((prev) => (activeAlertTab === 'agenda' ? !prev : true));
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  alertsExpanded && activeAlertTab === 'agenda'
                    ? 'bg-[#0056ab] text-white'
                    : todayPromisedOrders.length > 0
                    ? 'bg-[#EAF2FD] text-[#0056ab] hover:bg-[#dce9fc]'
                    : 'bg-[#F3F6FB] text-[#727784] hover:text-[#091b36]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="tabular-nums">Agenda hoje ({todayPromisedOrders.length})</span>
              </button>
            ) : null}

            {canAccessRoute('ordens-de-servico') && (
              <button
                type="button"
                onClick={() => {
                  setActiveAlertTab('receivables');
                  setAlertsExpanded((prev) => (activeAlertTab === 'receivables' ? !prev : true));
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  alertsExpanded && activeAlertTab === 'receivables'
                    ? 'bg-[#0056ab] text-white'
                    : dueReceivableOrders.length > 0
                    ? 'bg-[#FFF7E6] text-[#D97706] hover:bg-[#fef0d1]'
                    : 'bg-[#F3F6FB] text-[#727784] hover:text-[#091b36]'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  A receber ({dueReceivableOrders.length}
                  {dueReceivablesTotal > 0 ? ` · ${formatBRL(dueReceivablesTotal)}` : ''})
                </span>
              </button>
            )}

            {canAccessRoute('clientes') && (
              <button
                type="button"
                onClick={() => {
                  setActiveAlertTab('birthdays');
                  setAlertsExpanded((prev) => (activeAlertTab === 'birthdays' ? !prev : true));
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  alertsExpanded && activeAlertTab === 'birthdays'
                    ? 'bg-[#0056ab] text-white'
                    : todayBirthdays.length > 0
                    ? 'bg-[#DCFCE7] text-[#16A34A] hover:bg-[#c8f7d8]'
                    : 'bg-[#F3F6FB] text-[#727784] hover:text-[#091b36]'
                }`}
              >
                <Cake className="w-3.5 h-3.5" />
                <span className="tabular-nums">Aniversários ({todayBirthdays.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAlertsExpanded((e) => !e)}
              className="p-1 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              aria-label={alertsExpanded ? 'Recolher alertas do dia' : 'Expandir alertas do dia'}
            >
              {alertsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {alertsExpanded && (
          <div className="pt-2 border-t border-[#D9E0EC] space-y-1.5 max-h-48 overflow-y-auto">
            {activeAlertTab === 'agenda' && (
              <>
                {todayPromisedOrders.length === 0 ? (
                  <p className="text-[11px] text-[#727784]">
                    Nenhuma OS com entrega prometida ou alocada para hoje.
                  </p>
                ) : (
                  todayPromisedOrders.map(({ order, reason }) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#F3F6FB] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          canAccessRoute('ordens-de-servico')
                            ? onSelectOrder(order.id)
                            : onNavigate('agenda-de-bancada')
                        }
                        className="text-left min-w-0 flex-1 cursor-pointer hover:opacity-80"
                      >
                        <p className="font-bold text-[#091b36] truncate">
                          {order.code} · {order.clientName} · {order.device}
                        </p>
                        <p className="text-[10.5px] text-[#414752] truncate">
                          {reason} · Status: {order.status} · Téc. {order.technician}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('agenda-de-bancada')}
                        className="text-[11px] font-semibold text-[#0056ab] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Ver Agenda
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {activeAlertTab === 'receivables' && (
              <>
                {dueReceivableOrders.length === 0 ? (
                  <p className="text-[11px] text-[#727784]">
                    Nenhuma conta a receber vencendo hoje ou em atraso.
                  </p>
                ) : (
                  dueReceivableOrders.map(({ order, saldo }) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#F3F6FB] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order.id)}
                        className="text-left min-w-0 flex-1 cursor-pointer hover:opacity-80"
                      >
                        <p className="font-bold text-[#091b36] truncate">
                          {order.code} · {order.clientName} · {order.device}
                        </p>
                        <p className="text-[10.5px] text-[#414752] truncate">
                          Status: {order.status}
                          {order.expectedDeliveryDate
                            ? ` · Prev. ${formatDateBR(order.expectedDeliveryDate)}`
                            : ''}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order.id)}
                        className="font-mono font-bold text-[#D97706] hover:underline whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
                      >
                        {formatBRL(saldo)}
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {activeAlertTab === 'birthdays' && (
              <>
                {todayBirthdays.length === 0 ? (
                  <p className="text-[11px] text-[#727784]">
                    Nenhum cliente aniversariante hoje ({formatDateBR(todayIso)}).
                  </p>
                ) : (
                  todayBirthdays.map((client) => {
                    const digits = (client.phone || '').replace(/\D/g, '');
                    const waPhone = digits.length >= 10 ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
                    const firstName = (client.name || '').trim().split(/\s+/)[0] || 'cliente';
                    const waHref = waPhone
                      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(
                          `Feliz aniversário, ${firstName}! Um abraço da equipe MicroLab.`
                        )}`
                      : '';
                    return (
                      <div
                        key={client.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[#F3F6FB] px-3 py-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => onNavigate('clientes')}
                          className="text-left min-w-0 flex-1 cursor-pointer hover:opacity-80"
                        >
                          <p className="font-bold text-[#091b36] truncate">{client.name}</p>
                          <p className="text-[10.5px] text-[#414752] truncate">
                            {client.phone || 'Telefone não cadastrado'}
                            {client.lastDevice ? ` · Último aparelho: ${client.lastDevice}` : ''}
                          </p>
                        </button>
                        {waHref ? (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#15803d] whitespace-nowrap shrink-0"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate('clientes')}
                            className="text-[11px] font-semibold text-[#0056ab] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Abrir ficha
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* Alerta de Peças para Chegar (pecasAlerta v17) */}
      {pendingPartsAlertOrders.length > 0 && (
        <section
          className={`rounded-2xl p-4 border space-y-2.5 ${
            hasOverdueParts
              ? 'bg-[#FEE2E2]/70 border-[#DC2626]/35'
              : 'bg-[#FFF7E6] border-[#D97706]/35'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PackageSearch
                className={`w-4 h-4 ${hasOverdueParts ? 'text-[#DC2626]' : 'text-[#D97706]'}`}
              />
              <h2 className="text-xs sm:text-sm font-bold text-[#091b36]">
                Peças para chegar: {pendingPartsAlertOrders.length}
              </h2>
            </div>
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                hasOverdueParts
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-[#D97706] text-white'
              }`}
            >
              {hasOverdueParts ? 'Com atraso' : 'Prevista hoje'}
            </span>
          </div>

          <div className="space-y-2">
            {pendingPartsAlertOrders.map((o) => {
              const days = diasAteIso(o.pedPrev) ?? 0;
              const statusText =
                days === 0
                  ? 'chega hoje'
                  : `atrasada há ${-days} ${days === -1 ? 'dia' : 'dias'}`;
              const isConfirming = confirmPartOrderId === o.id;
              return (
                <div
                  key={o.id}
                  className="rounded-xl bg-white border border-[#D9E0EC] px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onSelectOrder(o.id)}
                    className="text-left flex-1 min-w-0 cursor-pointer hover:opacity-80"
                  >
                    <p className="text-xs font-bold text-[#091b36] truncate">
                      {o.code} · {o.clientName || 'Sem cliente'} · {o.device}
                    </p>
                    <p className="text-[11px] text-[#414752] truncate">
                      {o.pedForn || 'Fornecedor não informado'}
                      {o.pedRastreio ? ` · ${o.pedRastreio}` : ''} ·{' '}
                      <strong className={days < 0 ? 'text-[#DC2626]' : 'text-[#D97706]'}>
                        {statusText}
                      </strong>{' '}
                      ({formatDateBR(o.pedPrev)})
                    </p>
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-semibold text-[#091b36]">
                        {o.status === 'Aguardando Peça' ? 'Mover p/ Aprovado?' : 'Confirmar?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          markOrderPartArrived(o.id);
                          setConfirmPartOrderId(null);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#15803d] cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Sim</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPartOrderId(null)}
                        className="rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-[11px] font-semibold text-[#414752] cursor-pointer"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmPartOrderId(o.id)}
                      className="rounded-xl bg-[#0056ab] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#1b6fd1] shrink-0 cursor-pointer"
                    >
                      Chegou
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* KPI Cards */}
      <section
        className={`grid grid-cols-2 ${
          canSeeFinancialSummary ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
        } gap-3 sm:gap-4`}
      >
        {canSeeFinancialSummary && (
          <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#727784] font-medium mb-1">
              <span>Receita Bruta Mês</span>
              <ArrowUpRight className="w-4 h-4 text-[#16A34A]" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-[#091b36] tabular-nums">
              {formatBRL(state.interBalances.currentMonthRevenue)}
            </p>
            <p className="text-[11px] text-[#16A34A] font-medium mt-1">
              Meta equilíbrio: {formatBRL(state.interBalances.monthlyBreakEvenTarget)}
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#727784] font-medium mb-1">
            <span>OS em Bancada</span>
            <ClipboardList className="w-4 h-4 text-[#0056ab]" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[#091b36] tabular-nums">
            {activeOrders.length} <span className="text-xs font-medium text-[#727784]">ativas</span>
          </p>
          <p className="text-[11px] text-[#414752] mt-1">
            {smdOrders.length} em reparo · {readyOrders.length} prontas
          </p>
        </div>

        {canSeeFinancialSummary && (
          <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#727784] font-medium mb-1">
              <span>Saldo Conta Inter</span>
              <QrCode className="w-4 h-4 text-[#0056ab]" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-[#091b36] tabular-nums">
              {formatBRL(state.interBalances.operational)}
            </p>
            <p className="text-[11px] text-[#727784] mt-1 tabular-nums">
              Porquinho reserva: {formatBRL(state.interBalances.porquinhoTotal)}
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#727784] font-medium mb-1">
            <span>Alertas de Estoque</span>
            <PackageCheck className="w-4 h-4 text-[#D97706]" />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-[#091b36] tabular-nums">
            {lowStockCount} <span className="text-xs font-medium text-[#727784]">itens</span>
          </p>
          {canAccessRoute('produtos-e-pecas') && (
            <button
              type="button"
              onClick={() => onNavigate('produtos-e-pecas')}
              className="text-[11px] text-[#0056ab] font-semibold mt-1 hover:underline cursor-pointer"
            >
              Repor peças críticas →
            </button>
          )}
        </div>
      </section>

      {/* 6 Quick Actions + Telemetry Mini Widget */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white p-4 sm:p-5 border border-[#D9E0EC] shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#091b36]">Acesso Rápido Operacional</h2>
            <span className="text-[11px] text-[#727784]">Atalhos de bancada</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {quickActions.map((qa) => {
              const Icon = qa.icon;
              return (
                <button
                  key={qa.label}
                  type="button"
                  onClick={qa.action}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/70 hover:bg-[#EAF2FD] hover:border-[#0056ab]/30 transition-colors text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#D9E0EC] text-[#0056ab] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#091b36] truncate">{qa.label}</p>
                    <p className="text-[11px] text-[#727784] truncate tabular-nums">{qa.sub}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ZK-SK150C Mini Telemetry Cockpit */}
        {(() => {
          const latestOrderWithTel = state.orders.find((o) => Boolean(o.telemetry));
          const latestTel = latestOrderWithTel?.telemetry;
          return (
            <div className="rounded-2xl bg-[#0B0F17] text-white p-4 sm:p-5 border border-[#2A3954] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#06B6D4]" />
                  <span className="text-xs font-bold tracking-wide">ZK-SK150C · Última Leitura Salva</span>
                </div>
                {canAccessRoute('fonte') && (
                  <button
                    type="button"
                    onClick={() => onNavigate('fonte')}
                    className="text-[11px] font-semibold text-[#06B6D4] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Abrir Painel →
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 my-3">
                <div className="rounded-xl bg-[#131B2E] p-2.5 border border-[#2A3954]">
                  <span className="text-[10px] text-slate-400 block">TENSÃO</span>
                  <span className="text-base font-mono font-bold text-[#06B6D4] tabular-nums">
                    {latestTel ? `${latestTel.voltage.toFixed(2)}V` : '0.00V'}
                  </span>
                </div>
                <div className="rounded-xl bg-[#131B2E] p-2.5 border border-[#2A3954]">
                  <span className="text-[10px] text-slate-400 block">CORRENTE</span>
                  <span className="text-base font-mono font-bold text-[#F59E0B] tabular-nums">
                    {latestTel ? `${latestTel.current.toFixed(3)}A` : '0.000A'}
                  </span>
                </div>
                <div className="rounded-xl bg-[#131B2E] p-2.5 border border-[#2A3954]">
                  <span className="text-[10px] text-slate-400 block">POTÊNCIA</span>
                  <span className="text-base font-mono font-bold text-[#10B981] tabular-nums">
                    {latestTel ? `${latestTel.power.toFixed(2)}W` : '0.00W'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-[#131B2E]/80 border border-[#2A3954] px-3 py-2 text-[11px] text-slate-300">
                {latestTel && latestOrderWithTel ? (
                  <>
                    <span className="font-semibold text-[#06B6D4]">OS {latestOrderWithTel.code}</span>
                    <span className="text-slate-400"> · {latestTel.recordedAt}</span>
                    <p className="text-slate-400 truncate mt-0.5">{latestTel.note}</p>
                  </>
                ) : (
                  <p className="text-slate-400">Nenhuma telemetria gravada. Conecte a fonte via BLE/USB.</p>
                )}
              </div>
            </div>
          );
        })()}
      </section>

      {/* Recent Service Orders */}
      <section className="rounded-2xl bg-white p-4 sm:p-5 border border-[#D9E0EC] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#091b36]">Ordens de Serviço Recentes</h2>
            <p className="text-xs text-[#727784]">Acompanhe triagem, reparo SMD e liberações de balcão</p>
          </div>
          <div className="flex items-center gap-1.5 bg-[#F3F6FB] p-1 rounded-xl border border-[#D9E0EC] overflow-x-auto">
            {(['Todas', 'Bancada', 'Aguardando', 'Prontas'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filterTab === tab
                    ? 'bg-white text-[#0056ab] shadow-xs'
                    : 'text-[#414752] hover:text-[#091b36]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredOrders.slice(0, 6).map((order) => {
            const DeviceIcon = getDeviceIcon(order.deviceType);
            const total = calcOrderTotalAmount(order);
            const waUrl = `https://wa.me/55${order.clientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
              `Olá ${order.clientName}, atualização da sua OS ${order.code} (${order.device}): Status atual "${order.status}".`
            )}`;
            return (
              <div
                key={order.id}
                className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/45 p-4 flex flex-col justify-between gap-3 hover:border-[#0056ab]/40 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#EAF2FD] text-[#0056ab] flex items-center justify-center shrink-0">
                        <DeviceIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#0056ab] tabular-nums">{order.code}</span>
                        <span className="text-xs text-[#727784] mx-1">·</span>
                        <span className="text-xs font-semibold text-[#091b36] truncate">{order.clientName}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap shrink-0 ${getStatusBadgeStyle(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#091b36] truncate">{order.device}</p>
                    <p className="text-[11px] text-[#414752] line-clamp-2 mt-0.5">{order.issue}</p>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#D9E0EC] flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-bold text-[#091b36] tabular-nums">{formatBRL(total)}</span>
                    <span className="text-[11px] text-[#727784] ml-1.5">· {order.technician}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Enviar atualização no WhatsApp"
                      className="p-1.5 rounded-lg border border-[#D9E0EC] bg-white text-[#16A34A] hover:bg-[#DCFCE7] transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onSelectOrder(order.id)}
                      title="Abrir OS para imprimir"
                      className="p-1.5 rounded-lg border border-[#D9E0EC] bg-white text-[#414752] hover:bg-[#F3F6FB] transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    {canAccessRoute('ordens-de-servico') && (
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#0056ab] text-white text-[11px] font-semibold hover:bg-[#1b6fd1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Abrir OS
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredOrders.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-[#D9E0EC] bg-[#F3F6FB]/50 p-8 text-center text-xs text-[#727784]">
              {state.orders.length === 0
                ? 'Nenhuma Ordem de Serviço registrada ainda. Clique em "Abrir Check-in / OS" para começar.'
                : 'Nenhuma Ordem de Serviço neste filtro.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
