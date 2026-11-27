import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  CalendarClock,
  Check,
  CheckCircle2,
  Download,
  Info,
  Layers,
  MessageCircle,
  PiggyBank,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { CashTransaction, TransactionEnvelope, TransactionSubEnvelope } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  FinancePeriodKey,
  OFFICIAL_BREAK_EVEN_TARGET,
  OFFICIAL_FIXED_COSTS,
  OFFICIAL_PRO_LABORE,
  calcClientMetrics,
  calcEffectivePricingFromConfig,
  calcFinLayers,
  calcOrderApprovalRate,
  calcPendingPayablesSummary,
  calcTopExecutedServices,
  classifyExpenseTx,
  diasAteIso,
  formatDateBR,
  isRefundOrReversalTx,
  resolveTransactionEnvelope,
  resolveTransactionIsoDate,
  resolveTransactionSubEnvelope,
  todayIsoLocal,
} from '../utils/pricing';

function toWaPhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits || digits.length < 8) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export const CashFlowDreView: React.FC = () => {
  const {
    state,
    currentUser,
    addTransaction,
    recordWarrantyExpense,
    deleteTransaction,
    addPayableBill,
    markPayableBillPaid,
    deletePayableBill,
    syncNow,
  } = useLabStore();

  const [period, setPeriod] = useState<FinancePeriodKey>('mes');
  const [channelFilter, setChannelFilter] = useState<'Todos' | CashTransaction['channel']>('Todos');
  const [showTxModal, setShowTxModal] = useState(false);
  const [showGarModal, setShowGarModal] = useState(false);
  const [showPayableModal, setShowPayableModal] = useState(false);
  const [showInativosModal, setShowInativosModal] = useState(false);
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState('');

  // Form Novo Lançamento (`fnForm`)
  const [txType, setTxType] = useState<'in' | 'out'>('out');
  const [txDate, setTxDate] = useState(() => todayIsoLocal());
  const [txCategory, setTxCategory] = useState(
    () => state.cfg.catDesp[0] || 'Outros'
  );
  const [txChannel, setTxChannel] = useState<CashTransaction['channel']>('PIX');
  const [txEnv, setTxEnv] = useState<TransactionEnvelope>('conta');
  const [txSubEnv, setTxSubEnv] = useState<TransactionSubEnvelope>('giro');
  const [txAporte, setTxAporte] = useState(false);
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');

  // Form Gasto de Garantia (`gastoGar`)
  const [garDate, setGarDate] = useState(() => todayIsoLocal());
  const [garOrderId, setGarOrderId] = useState<string>('');
  const [garDesc, setGarDesc] = useState('');
  const [garAmount, setGarAmount] = useState('');

  // Contas a Pagar (`contasPagar` v1.5 Cortex)
  const [payablesFilter, setPayablesFilter] = useState<'Pendentes' | 'Vencidas' | 'Pagas' | 'Todas'>('Pendentes');
  const [billDesc, setBillDesc] = useState('');
  const [billSupplier, setBillSupplier] = useState('');
  const [billCategory, setBillCategory] = useState(() => state.cfg.catDesp[0] || 'Outros');
  const [billValue, setBillValue] = useState('');
  const [billDue, setBillDue] = useState(() => todayIsoLocal());
  const [settlingBillId, setSettlingBillId] = useState<string | null>(null);
  const [settleChannel, setSettleChannel] = useState<CashTransaction['channel']>('PIX');
  const [confirmDeleteBillId, setConfirmDeleteBillId] = useState<string | null>(null);

  const isAdmin = currentUser?.nivel === 'Administrador';

  const K = useMemo(
    () =>
      calcFinLayers(
        {
          orders: state.orders,
          transactions: state.transactions,
          parts: state.parts,
          cfg: state.cfg,
          fixos: state.fixos,
        },
        period
      ),
    [state.orders, state.transactions, state.parts, state.cfg, state.fixos, period]
  );

  const Q = K.equilibrio;
  const eff = useMemo(
    () => calcEffectivePricingFromConfig(state.cfg, state.fixos),
    [state.cfg, state.fixos]
  );
  const kMes = useMemo(
    () =>
      period === 'mes'
        ? K
        : calcFinLayers(
            {
              orders: state.orders,
              transactions: state.transactions,
              parts: state.parts,
              cfg: state.cfg,
              fixos: state.fixos,
            },
            'mes'
          ),
    [K, period, state.orders, state.transactions, state.parts, state.cfg, state.fixos]
  );
  const kAll = useMemo(
    () =>
      period === 'all'
        ? K
        : calcFinLayers(
            {
              orders: state.orders,
              transactions: state.transactions,
              parts: state.parts,
              cfg: state.cfg,
              fixos: state.fixos,
            },
            'all'
          ),
    [K, period, state.orders, state.transactions, state.parts, state.cfg, state.fixos]
  );
  const activeFixosCount = useMemo(
    () => (state.fixos || []).filter((f) => f.ativo !== false).length,
    [state.fixos]
  );
  const breakEvenTarget =
    kMes.meta || state.interBalances.monthlyBreakEvenTarget || OFFICIAL_BREAK_EVEN_TARGET;
  const breakEvenPct = Math.min(100, Math.max(0, Math.round(kMes.cob * 100)));
  const approvalRate = useMemo(() => calcOrderApprovalRate(state.orders), [state.orders]);

  const inactiveClients = useMemo(
    () =>
      state.clients
        .map((c) => ({ client: c, metrics: calcClientMetrics(c, state.orders, state.vendas) }))
        .filter((x) => x.metrics.isInactive90d)
        .sort((a, b) => (b.metrics.daysInactive || 0) - (a.metrics.daysInactive || 0)),
    [state.clients, state.orders, state.vendas]
  );

  const deliveredOrdersRecent = useMemo(
    () =>
      state.orders
        .filter((o) => o.status === 'Entregue')
        .sort((a, b) => b.id - a.id)
        .slice(0, 80),
    [state.orders]
  );

  const periodLedger = useMemo(() => {
    return [...K.filteredTxs]
      .filter((tx) => channelFilter === 'Todos' || tx.channel === channelFilter)
      .sort((a, b) => resolveTransactionIsoDate(b).localeCompare(resolveTransactionIsoDate(a)));
  }, [K.filteredTxs, channelFilter]);

  const todayIso = todayIsoLocal();
  const payablesSummary = useMemo(
    () => calcPendingPayablesSummary(state.contasPagar, state.transactions, todayIso),
    [state.contasPagar, state.transactions, todayIso]
  );

  const filteredPayables = useMemo(() => {
    const all = [...(state.contasPagar || [])].sort((a, b) =>
      String(a.vencimento || '').localeCompare(String(b.vencimento || ''))
    );
    if (payablesFilter === 'Pendentes') return all.filter((b) => b.status === 'Pendente');
    if (payablesFilter === 'Vencidas') {
      return all.filter((b) => b.status === 'Pendente' && Boolean(b.vencimento) && b.vencimento < todayIso);
    }
    if (payablesFilter === 'Pagas') return all.filter((b) => b.status === 'Pago');
    return all;
  }, [state.contasPagar, payablesFilter, todayIso]);

  const topServices = useMemo(
    () => calcTopExecutedServices(state.orders, state.servicos),
    [state.orders, state.servicos]
  );

  const liq = Math.max(0, K.bruto - K.dev);
  const metaFatPct = Q.metaFat > 0 ? Math.min(100, Math.round((liq / Q.metaFat) * 100)) : 0;
  const shareOfRp = (v: number) => (K.Rp > 0 ? Math.max(0, Math.min(100, (v / K.Rp) * 100)) : 0);
  const cobPct = Math.max(0, Math.min(100, Math.round(K.cob * 100)));

  const handleExportCsv = () => {
    const header = 'ID,DataISO,Titulo,Subtitulo,Tag,Canal,Tipo,Valor,DataExibicao,Conciliado,Envelope,Aporte\n';
    const rows = K.filteredTxs
      .map((t) => {
        const envLabel =
          resolveTransactionEnvelope(t) === 'porquinho'
            ? resolveTransactionSubEnvelope(t) === 'garantia'
              ? 'Porquinho Inter (Cofre Garantia)'
              : 'Porquinho Inter (Capital de Giro)'
            : 'Conta Corrente Inter';
        const aporteLabel = t.type === 'in' && t.aporte ? 'Sim' : 'Não';
        return `"${t.id}","${resolveTransactionIsoDate(t)}","${t.title.replace(/"/g, '""')}","${t.subtitle.replace(
          /"/g,
          '""'
        )}","${t.tag}","${t.channel}","${t.type === 'in' ? 'Entrada' : 'Saída'}",${t.amount.toFixed(2)},"${
          t.dateLabel
        }",${t.reconciled ? 'Sim' : 'Pendente'},"${envLabel}","${aporteLabel}"`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `microlab-financeiro-${period}-${todayIsoLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openNewTxModal = () => {
    setTxEnv('conta');
    setTxSubEnv('giro');
    setTxAporte(false);
    setShowTxModal(true);
  };

  const handleCreateTx = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    const amt = Math.round((parseFloat(txAmount.replace(',', '.')) || 0) * 100) / 100;
    if (!txTitle.trim() || amt <= 0) return;

    let resolvedChannel = txChannel;
    if (txType === 'out') {
      if (txCategory === 'Peças') resolvedChannel = 'Fornecedores';
      else if (txCategory === 'Aluguel' || txCategory === 'Internet') resolvedChannel = 'Fixo';
    }

    const isAporte = txType === 'in' && txAporte;
    const envSuffix =
      txEnv === 'porquinho'
        ? txSubEnv === 'garantia'
          ? ' · Porquinho (Cofre Garantia)'
          : ' · Porquinho (Capital de Giro)'
        : '';

    addTransaction({
      title: txTitle.trim(),
      subtitle: `${resolvedChannel} · ${
        txType === 'out' ? txCategory : isAporte ? 'Aporte / Saldo inicial' : 'Entrada manual'
      }${envSuffix}`,
      tag: txType === 'out' ? txCategory : isAporte ? 'APORTE' : 'ENTRADA',
      channel: resolvedChannel,
      type: txType,
      amount: amt,
      isoDate: txDate || todayIsoLocal(),
      kind: txType === 'out' && txCategory === 'Garantia' ? 'gar' : undefined,
      env: txEnv,
      ...(txEnv === 'porquinho' ? { subEnv: txSubEnv } : {}),
      ...(isAporte ? { aporte: true } : {}),
      reconciled: true,
    });
    setShowTxModal(false);
    setTxTitle('');
    setTxAmount('');
    setTxEnv('conta');
    setTxSubEnv('giro');
    setTxAporte(false);
    setTxDate(todayIsoLocal());
  };

  const handleCreateWarrantyExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    const amt = Math.round((parseFloat(garAmount.replace(',', '.')) || 0) * 100) / 100;
    const res = recordWarrantyExpense({
      isoDate: garDate || todayIsoLocal(),
      orderId: garOrderId ? Number(garOrderId) : undefined,
      description: garDesc,
      amount: amt,
    });
    if (!res.ok) {
      setFeedbackError(res.error || 'Erro ao registrar gasto de garantia.');
      return;
    }
    setShowGarModal(false);
    setGarDesc('');
    setGarAmount('');
    setGarOrderId('');
    setGarDate(todayIsoLocal());
  };

  const handleConfirmDeleteTx = (txId: string) => {
    setFeedbackError('');
    const res = deleteTransaction(txId);
    if (!res.ok && res.error) {
      setFeedbackError(res.error);
    }
    setConfirmDeleteTxId(null);
  };

  const handleCreatePayableBill = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    const amt = Math.round((parseFloat(billValue.replace(',', '.')) || 0) * 100) / 100;
    if (!billDesc.trim() || amt <= 0) return;
    addPayableBill({
      descricao: billDesc.trim(),
      fornecedor: billSupplier.trim() || undefined,
      categoria: billCategory || 'Outros',
      valor: amt,
      vencimento: billDue || todayIsoLocal(),
    });
    setShowPayableModal(false);
    setBillDesc('');
    setBillSupplier('');
    setBillValue('');
    setBillDue(todayIsoLocal());
  };

  const handleConfirmSettleBill = (billId: string) => {
    setFeedbackError('');
    const res = markPayableBillPaid(billId, { channel: settleChannel });
    if (!res.ok && res.error) {
      setFeedbackError(res.error);
    }
    setSettlingBillId(null);
  };

  const channelBreakdown = (['PIX', 'Dinheiro', 'Fornecedores', 'Fixo'] as const).map((ch) => {
    const txs = K.filteredTxs.filter((t) => t.channel === ch);
    const inflow = txs.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const outflow = txs.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    return { label: ch, inflow, outflow };
  });
  const maxBarScale = Math.max(100, ...channelBreakdown.map((b) => Math.max(b.inflow, b.outflow)));

  const renderExpenseClassLabel = (tx: CashTransaction) => {
    if (tx.type === 'in') return tx.aporte ? 'Aporte / Saldo inicial' : 'Entrada';
    if (isRefundOrReversalTx(tx)) return 'Estorno / Devolução';
    const cls = classifyExpenseTx(tx);
    if (cls === 'gar') return 'Garantia (Cofre)';
    if (cls === 'est') return 'Estrutura fixa';
    if (cls === 'pec') return 'Peças / Insumos';
    if (cls === 'fer') return 'Ferramentas (Giro)';
    return 'Outros';
  };

  return (
    <div className="space-y-5">
      {/* Header + Period selector */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">
            Fluxo de Caixa, DRE &amp; Envelopes Inter
          </h1>
          <p className="text-xs text-[#727784]">
            Período: <strong className="text-[#091b36]">{K.per.label}</strong> · Envelopes Banco Inter + Camada 1 (caixa) + Camada 2 (cofre) + Camada 3 (lucro real e equilíbrio 90d)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#D9E0EC]">
            {(
              [
                { id: 'mes', label: 'Mês atual' },
                { id: 'ant', label: 'Mês anterior' },
                { id: 'all', label: 'Todo o período' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  period === opt.id ? 'bg-[#0056ab] text-white' : 'text-[#414752] hover:bg-[#F3F6FB]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowGarModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#0056ab]/30 bg-[#EAF2FD] px-3 py-2 text-xs font-semibold text-[#0056ab] hover:bg-[#dce9fc] cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Gasto de Garantia</span>
          </button>

          <button
            type="button"
            onClick={syncNow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#0056ab]" />
            <span>Conciliar</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#0056ab]" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={openNewTxModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

      {feedbackError && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{feedbackError}</span>
        </div>
      )}

      {/* Envelopes Banco Inter: Conta Corrente Operacional, Porquinho Reservas & Termômetro Equilíbrio */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#ea580c] text-white p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-white" />
              <span className="text-xs font-bold uppercase tracking-wider text-orange-100">
                Conta Corrente Inter · Giro Operacional
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-bold">
              Envelope 1 + Pró-labore
            </span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs text-orange-100 block">
                Saldo Conta Corrente (Disponível após Cofre)
              </span>
              <span className="text-2xl sm:text-3xl font-bold tabular-nums">
                {formatBRL(state.interBalances.operational)}
              </span>
              <span className="text-[11px] text-orange-100 block mt-0.5 tabular-nums">
                Entradas Conta {formatBRL(kAll.cofre.contaIn)} − Saídas Conta {formatBRL(kAll.cofre.contaOut)} − Retido Porquinho{' '}
                {formatBRL(kAll.cofre.acc + kAll.giroAcc)}
              </span>
              <span className="text-[11px] text-orange-100 block mt-0.5 tabular-nums">
                Lucro Líquido Disponível (Caixa − Porquinho Inter):{' '}
                <strong className="text-white">{formatBRL(kAll.disp)}</strong>
              </span>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2 text-right">
              <span className="text-[10px] text-orange-100 block">Pró-labore Ref. Mensal</span>
              <strong className="text-sm font-bold tabular-nums">
                {formatBRL(state.interBalances.proLabore || OFFICIAL_PRO_LABORE)}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <span className="text-[10px] text-orange-100 block">
                Envelope 1 · Reposição de Peças (mês)
              </span>
              <strong className="text-sm font-bold tabular-nums">{formatBRL(kMes.env1)}</strong>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <span className="text-[10px] text-orange-100 block">
                Pró-labore Produzido (mês)
              </span>
              <strong className="text-sm font-bold tabular-nums">{formatBRL(kMes.prol)}</strong>
            </div>
            <div className="rounded-xl bg-white/20 px-3 py-2">
              <span className="text-[10px] text-orange-100 block">
                Saldo Comprometido (A Pagar)
              </span>
              <strong className="text-sm font-bold tabular-nums">
                {formatBRL(payablesSummary.saldoComprometido)}
              </strong>
              <span className="text-[10px] text-orange-100 block tabular-nums">
                {payablesSummary.pendingBills.length} pendente(s)
                {payablesSummary.overdueBills.length > 0
                  ? ` · ${payablesSummary.overdueBills.length} vencida(s)`
                  : ''}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/20 space-y-1.5">
            <div className="flex items-center justify-between text-xs gap-2">
              <span>
                Termômetro de Ponto de Equilíbrio (Fixos {formatBRL(kMes.equilibrio.fixos)} + Pró-labore{' '}
                {formatBRL(state.interBalances.proLabore || OFFICIAL_PRO_LABORE)})
              </span>
              <span className="font-bold tabular-nums shrink-0">{breakEvenPct}% atingido</span>
            </div>
            <div className="h-2 rounded-full bg-white/25 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${breakEvenPct}%` }} />
            </div>
            <p className="text-[11px] text-orange-100 tabular-nums">
              Contribuição coberta: {formatBRL(kMes.contrib)} / {formatBRL(breakEvenTarget)} ·{' '}
              {kMes.equilibrio.feitas} OS concluídas ·{' '}
              {kMes.falta === 0
                ? 'Equilíbrio atingido'
                : kMes.falta !== null
                  ? `Faltam ${kMes.falta} OS`
                  : '—'}{' '}
              · Capacidade {kMes.equilibrio.cabem ?? '—'} OS
            </p>
          </div>
        </div>

        <div className="lg:col-span-6 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-[#0056ab]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#091b36]">
                  Porquinho Inter · Reservas Blindadas
                </span>
              </div>
              <span className="text-[11px] text-[#727784] block mt-0.5">
                Cofre de Garantia + Capital de Giro acumulados
              </span>
            </div>
            <span className="text-lg font-bold text-[#0056ab] tabular-nums">
              {formatBRL(state.interBalances.porquinhoTotal)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC]">
              <span className="text-[10px] font-bold uppercase text-[#0056ab] block">
                Envelope 2 · Cofre Garantia ({kAll.cofre.pct.toFixed(1)}%)
              </span>
              <p className="text-lg font-bold text-[#091b36] tabular-nums mt-1">
                {formatBRL(kAll.saldo2)}
              </p>
              <span className="text-[10px] text-[#727784] block mt-0.5 tabular-nums">
                Retido {formatBRL(kAll.cofre.acc)}
                {kAll.garManualIn > 0 ? ` + ${formatBRL(kAll.garManualIn)} aportes` : ''} − Gastos{' '}
                {formatBRL(kAll.cofre.gastos)} (mês: {formatBRL(kMes.acc2 + kMes.acc2Manual)})
              </span>
            </div>

            <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC]">
              <span className="text-[10px] font-bold uppercase text-[#16A34A] block">
                Envelope 3 · Giro ({(kAll.pGiro * 100).toFixed(1)}%)
              </span>
              <p className="text-lg font-bold text-[#091b36] tabular-nums mt-1">
                {formatBRL(kAll.saldo3)}
              </p>
              <span className="text-[10px] text-[#727784] block mt-0.5 tabular-nums">
                Retido {formatBRL(kAll.giroAcc)}
                {kAll.giroManualIn > 0 ? ` + ${formatBRL(kAll.giroManualIn)} aportes` : ''} − Saídas{' '}
                {formatBRL(kAll.giroOut)} (mês: +{formatBRL(kMes.ret3 + kMes.ret3Manual)})
              </span>
            </div>

            <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC]">
              <span className="text-[10px] font-bold uppercase text-[#414752] block">
                Custos Fixos Mensais ({activeFixosCount} ativos)
              </span>
              <p className="text-lg font-bold text-[#091b36] tabular-nums mt-1">
                {formatBRL(kMes.equilibrio.fixos || state.interBalances.fixedCosts || OFFICIAL_FIXED_COSTS)}
              </p>
              <span className="text-[10px] text-[#727784] block mt-0.5 tabular-nums">
                Indireto {formatBRL(eff.indirectHourlyRate)}/h ({eff.metrics.billableHours.toFixed(2)}h fat.)
              </span>
            </div>
          </div>

          {(kAll.porquinhoManualIn > 0 || kAll.porquinhoOtherOut > 0) && (
            <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#414752]">
              <span>Movimentações manuais diretas no Porquinho Inter:</span>
              <span className="font-semibold tabular-nums text-[#091b36]">
                +{formatBRL(kAll.porquinhoManualIn)} aportes/entradas
                {kAll.porquinhoOtherOut > 0 ? ` · −${formatBRL(kAll.porquinhoOtherOut)} outras saídas` : ''}
              </span>
            </div>
          )}

          <div className="rounded-xl bg-[#EAF2FD]/70 border border-[#0056ab]/20 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-[#727784] block">Capacidade Bancada</span>
              <strong className="text-[#091b36] tabular-nums">
                {eff.metrics.weeklyHours}h/sem · {eff.metrics.monthlyHours.toFixed(2)}h/mês
              </strong>
            </div>
            <div>
              <span className="text-[#727784] block">Faturável ({Math.round((state.cfg.ocup || 0.5) * 100)}%)</span>
              <strong className="text-[#0056ab] tabular-nums">
                {eff.metrics.billableHours.toFixed(2)} h/mês
              </strong>
            </div>
            <div>
              <span className="text-[#727784] block">Hora Técnica Ativa</span>
              <strong className="text-[#091b36] tabular-nums">{formatBRL(eff.hourlyRate)}/h</strong>
            </div>
            <div>
              <span className="text-[#727784] block">Meta Lucro Serviço</span>
              <strong className="text-[#16A34A] tabular-nums">{eff.profitMarginPct.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      </section>

      {/* CAMADA 1 — Fluxo Operacional de Caixa */}
      <section className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#0056ab] text-white text-xs font-bold flex items-center justify-center shrink-0">
            1
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#091b36]">Fluxo Operacional de Caixa</h2>
            <p className="text-[11px] text-[#727784]">
              O que entrou e saiu no período pela data do lançamento (inclui OS, PDV, compras e custos fixos)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-1.5">
            <span className="text-[11px] font-semibold text-[#727784] block">Faturamento Bruto Recebido</span>
            <span className="text-xl font-bold text-[#16A34A] tabular-nums block">{formatBRL(K.bruto)}</span>
            {K.aportes > 0 && (
              <span className="text-[11px] text-[#0056ab] font-medium block tabular-nums">
                + {formatBRL(K.aportes)} em aportes / saldo inicial (fora do faturamento)
              </span>
            )}
            {K.dev > 0 && (
              <span className="text-[11px] text-[#D97706] font-medium block">
                menos {formatBRL(K.dev)} de devoluções e estornos
              </span>
            )}
            {period === 'mes' && Q.metaFat > 0 && (
              <div className="pt-1 space-y-1">
                <div className="flex justify-between text-[10px] text-[#414752]">
                  <span>{metaFatPct}% da meta mensal</span>
                  <strong className="tabular-nums">{formatBRL(Q.metaFat)}</strong>
                </div>
                <div className="h-1.5 rounded-full bg-white overflow-hidden border border-[#D9E0EC]">
                  <div className="h-full bg-[#16A34A] rounded-full" style={{ width: `${metaFatPct}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-1">
            <span className="text-[11px] font-semibold text-[#727784] block">Despesas Pagas (sem estornos)</span>
            <span className="text-xl font-bold text-[#DC2626] tabular-nums block">{formatBRL(K.desp)}</span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-[#414752] pt-1">
              <span>Peças/insumos:</span>
              <strong className="text-right tabular-nums">{formatBRL(K.D.pec)}</strong>
              <span>Estrutura fixa:</span>
              <strong className="text-right tabular-nums">{formatBRL(K.D.est)}</strong>
              <span>Ferramentas / outros:</span>
              <strong className="text-right tabular-nums">{formatBRL(K.D.fer + K.D.out)}</strong>
              <span>Garantia:</span>
              <strong className="text-right tabular-nums">{formatBRL(K.D.gar)}</strong>
            </div>
          </div>

          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-1.5">
            <span className="text-[11px] font-semibold text-[#727784] block">Saldo Operacional do Período</span>
            <span
              className={`text-xl font-bold tabular-nums block ${
                K.saldoOp >= 0 ? 'text-[#0056ab]' : 'text-[#DC2626]'
              }`}
            >
              {formatBRL(K.saldoOp)}
            </span>
            <span className="text-[11px] text-[#727784] block">
              entradas ({formatBRL(K.bruto)}) − saídas totais ({formatBRL(K.sai)})
            </span>
          </div>
        </div>
      </section>

      {/* CAMADA 2 — Envelopes Carimbados & Cofre da Reserva de Garantia */}
      <section className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#FF7A00] text-white text-xs font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#091b36]">
                Envelopes Carimbados &amp; Cofre da Reserva de Garantia
              </h2>
              <p className="text-[11px] text-[#727784]">
                Dinheiro com dono certo sobre {K.n} OS entregues no período ({formatBRL(K.Rp)} recebidos) + saldos acumulados globais
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-[#EAF2FD] border border-[#0056ab]/25 px-3 py-1.5 text-xs">
            <span className="text-[#414752]">Lucro Líquido Disponível (caixa − Porquinho Inter): </span>
            <strong className={`tabular-nums ${K.disp >= 0 ? 'text-[#0056ab]' : 'text-[#DC2626]'}`}>
              {formatBRL(K.disp)}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Envelope 1 */}
          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-[#FF7A00] block">
                Envelope 1 · Reposição de Peças
              </span>
              <span className="text-xl font-bold text-[#091b36] tabular-nums block">{formatBRL(K.env1)}</span>
              <p className="text-[11px] text-[#727784] leading-relaxed">
                Peça + frete da peça + consumíveis + itens das {K.n} OS entregues no período (peça do cliente não entra). Capital para repor estoque.
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-[#D9E0EC]">
              <div className="h-full bg-[#FF7A00] rounded-full" style={{ width: `${shareOfRp(K.env1)}%` }} />
            </div>
          </div>

          {/* Envelope 2 — Cofre de Garantia */}
          <div className="rounded-xl bg-[#EAF2FD]/60 p-4 border border-[#0056ab]/25 space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase text-[#0056ab]">
                  Envelope 2 · Cofre de Garantia ({(K.pGar * 100).toFixed(K.pGar * 100 % 1 ? 1 : 0)}%)
                </span>
                <PiggyBank className="w-4 h-4 text-[#0056ab]" />
              </div>
              <span
                className={`text-xl font-bold tabular-nums block ${
                  K.saldo2 >= 0 ? 'text-[#091b36]' : 'text-[#DC2626]'
                }`}
              >
                {formatBRL(K.saldo2)}
              </span>
              <p className="text-[10px] text-[#414752]">
                Saldo acumulado: {formatBRL(K.cofre.acc)} retidos sobre {formatBRL(K.cofre.base)}
                {K.garManualIn > 0 ? ` + ${formatBRL(K.garManualIn)} aportes` : ''} − {formatBRL(K.cofre.gastos)} gastos
              </p>
              <p className="text-[10px] text-[#727784]">
                No período: retido {formatBRL(K.acc2)}
                {K.acc2Manual > 0 ? ` + ${formatBRL(K.acc2Manual)} aportes` : ''} · gastos de garantia{' '}
                {formatBRL(K.gastoGar)}
              </p>
              <p className="text-[10px] font-semibold text-[#0056ab]">
                Caixa disponível após reservas (Conta Inter): {formatBRL(K.disp)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGarModal(true)}
              className="w-full rounded-lg bg-[#0056ab] text-white py-1.5 text-[11px] font-semibold hover:bg-[#1b6fd1] cursor-pointer"
            >
              Registrar gasto de garantia
            </button>
          </div>

          {/* Envelope 3 — Capital de Giro */}
          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-2 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-[#16A34A] block">
                Envelope 3 · Capital de Giro ({(K.pGiro * 100).toFixed(K.pGiro * 100 % 1 ? 1 : 0)}%)
              </span>
              <span
                className={`text-xl font-bold tabular-nums block ${
                  K.saldo3 >= 0 ? 'text-[#091b36]' : 'text-[#DC2626]'
                }`}
              >
                {formatBRL(K.saldo3)}
              </span>
              <p className="text-[10px] text-[#414752]">
                Saldo acumulado: {formatBRL(K.giroAcc)} retidos
                {K.giroManualIn > 0 ? ` + ${formatBRL(K.giroManualIn)} aportes` : ''} − {formatBRL(K.giroOut)} saídas
                (Ferramentas/Giro).
              </p>
              <p className="text-[10px] text-[#727784]">
                No período: retido {formatBRL(K.ret3)}
                {K.ret3Manual > 0 ? ` + ${formatBRL(K.ret3Manual)} aportes` : ''} · usado em ferramentas/giro{' '}
                {formatBRL(K.usoFer)}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white overflow-hidden border border-[#D9E0EC]">
              <div className="h-full bg-[#16A34A] rounded-full" style={{ width: `${shareOfRp(K.ret3)}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* CAMADA 3 — Resultado Real & Termômetro de Equilíbrio 90d */}
      <section className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#16A34A] text-white text-xs font-bold flex items-center justify-center shrink-0">
            3
          </span>
          <div>
            <h2 className="text-sm font-bold text-[#091b36]">
              Resultado Real &amp; Termômetro de Equilíbrio 90d
            </h2>
            <p className="text-[11px] text-[#727784]">
              Apuração do lucro real da MicroLab após peças, taxas, estrutura fixa, pró-labore e envelopes
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-1">
            <span className="text-[11px] font-semibold text-[#727784] block">
              Pró-labore Produzido no Período
            </span>
            <span className="text-xl font-bold text-[#091b36] tabular-nums block">{formatBRL(K.prol)}</span>
            <span className="text-[11px] text-[#727784] block">
              horas das OS entregues × hora técnica de cada OS
            </span>
          </div>

          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-1">
            <span className="text-[11px] font-semibold text-[#727784] block">
              Lucro Líquido da Empresa
            </span>
            <span
              className={`text-xl font-bold tabular-nums block ${
                K.lucro >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {formatBRL(K.lucro)}
            </span>
            <span className="text-[11px] text-[#727784] block">
              sobra livre para o caixa após pró-labore e envelopes
            </span>
          </div>

          {/* Termômetro do Ponto de Equilíbrio */}
          <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#727784]">Termômetro do Equilíbrio</span>
              <Target className="w-4 h-4 text-[#0056ab]" />
            </div>

            {K.per.all ? (
              <div className="space-y-1">
                <span className="text-sm font-bold text-[#091b36] block">
                  Meta mensal: {formatBRL(Q.meta)}
                </span>
                <p className="text-[11px] text-[#727784]">
                  Selecione <strong>Mês atual</strong> ou <strong>Mês anterior</strong> para ver quantas OS faltam no mês. Em 90d: {Q.feitas} OS concluídas este mês · {Q.necessarias ?? '—'} necessárias · cabem {Q.cabem ?? '—'} OS em {Q.horasFat.toFixed(1)}h.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xl font-bold text-[#091b36]">
                    {K.falta === null ? '—' : K.falta === 0 ? 'Atingido' : `Faltam ${K.falta} OS`}
                  </span>
                  <span className="text-xs font-bold text-[#0056ab] tabular-nums">{cobPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white overflow-hidden border border-[#D9E0EC]">
                  <div
                    className={`h-full rounded-full ${cobPct >= 100 ? 'bg-[#16A34A]' : 'bg-[#0056ab]'}`}
                    style={{ width: `${cobPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#414752] leading-relaxed">
                  Meta {formatBRL(K.meta)} (Fixos {formatBRL(Q.fixos)} + Pró-labore {formatBRL(Number(state.cfg.proLabore) || 0)}). Coberto {formatBRL(K.contrib)}.
                  {K.falta !== null && K.falta > 0 && K.avg > 0
                    ? ` OS média cobre ~${formatBRL(K.avg)}${K.n === 0 ? ' (estimativa)' : ''}.`
                    : ''}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Bloco detalhado Equilibrio 90d */}
        <div className="rounded-xl bg-[#EAF2FD]/50 border border-[#0056ab]/20 p-3.5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-[#727784] block">Concluídas no mês</span>
            <strong className="text-sm text-[#091b36] tabular-nums">{Q.feitas} OS</strong>
          </div>
          <div>
            <span className="text-[10px] text-[#727784] block">Necessárias p/ equilíbrio</span>
            <strong className="text-sm text-[#0056ab] tabular-nums">
              {Q.necessarias !== null ? `${Q.necessarias} OS` : '—'}
            </strong>
          </div>
          <div>
            <span className="text-[10px] text-[#727784] block">Faltam (Equilíbrio 90d)</span>
            <strong className="text-sm text-[#091b36] tabular-nums">
              {Q.faltam !== null ? (Q.faltam === 0 ? 'Meta batida' : `${Q.faltam} OS`) : '—'}
            </strong>
          </div>
          <div>
            <span className="text-[10px] text-[#727784] block">Capacidade da bancada</span>
            <strong className="text-sm text-[#091b36] tabular-nums">
              {Q.cabem !== null ? `${Q.cabem} OS` : '—'} ({Q.horasFat.toFixed(1)}h)
            </strong>
          </div>
          <div>
            <span className="text-[10px] text-[#727784] block">
              Base 90d ({Q.estimado ? 'Estimativa Ajustes' : `${Q.sampleCount90d} OS`})
            </span>
            <strong className="text-sm text-[#16A34A] tabular-nums">
              Ticket {formatBRL(Q.ticket)} · Contrib. {formatBRL(Q.contrib)}
            </strong>
          </div>
        </div>

        {/* Waterfall */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3.5 divide-y divide-[#D9E0EC] text-xs">
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">Recebido de serviço e itens (OS entregues no período)</span>
            <strong className="text-[#091b36] tabular-nums">{formatBRL(K.Rp)}</strong>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">− Peças e consumíveis (Envelope 1)</span>
            <strong className="text-[#DC2626] tabular-nums">{formatBRL(K.env1)}</strong>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">− Taxa de recebimento ({(K.pPag * 100).toFixed(1)}%)</span>
            <strong className="text-[#DC2626] tabular-nums">{formatBRL(K.tPag)}</strong>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">− Estrutura fixa e outras despesas pagas</span>
            <strong className="text-[#DC2626] tabular-nums">{formatBRL(K.D.est + K.D.out)}</strong>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">− Pró-labore produzido</span>
            <strong className="text-[#DC2626] tabular-nums">{formatBRL(K.prol)}</strong>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">− Reserva de garantia (Envelope 2)</span>
            <strong className="text-[#DC2626] tabular-nums">{formatBRL(K.acc2)}</strong>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-[#414752]">− Reserva de capital de giro (Envelope 3)</span>
            <strong className="text-[#DC2626] tabular-nums">{formatBRL(K.ret3)}</strong>
          </div>
          <div className="pt-2 flex justify-between font-bold text-sm">
            <span className="text-[#091b36]">= Lucro líquido da empresa</span>
            <span className={`tabular-nums ${K.lucro >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
              {formatBRL(K.lucro)}
            </span>
          </div>
        </div>

        <details className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/50 px-3.5 py-2.5 text-xs text-[#414752]">
          <summary className="font-semibold text-[#091b36] cursor-pointer inline-flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#0056ab]" />
            <span>Como estes números são calculados (sem dupla contagem)</span>
          </summary>
          <p className="mt-2 text-[11px] text-[#727784] leading-relaxed">
            Receita = parte já recebida de serviço + itens − desconto das OS entregues no período (sem taxa de entrega). Lucro = receita − Envelope 1 − taxa de recebimento − estrutura fixa e outras despesas pagas − pró-labore produzido − reserva de garantia − reserva de capital de giro. Peças, garantia e ferramentas pagas pelo caixa não são descontadas de novo: já estão nos Envelopes 1, 2 e 3. O custo indireto por hora da OS não entra aqui porque a estrutura fixa é contada pelo que foi pago de fato.
          </p>
        </details>
      </section>

      {/* Indicadores Auxiliares (Taxa Aprovação + Clientes Inativos +90d + Saldo Comprometido) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#727784] block">Aprovação de Orçamentos</span>
            <span className="text-xl font-bold text-[#091b36] tabular-nums">
              {approvalRate === null ? '—' : `${Math.round(approvalRate * 100)}%`}
            </span>
            <span className="text-[11px] text-[#727784] block">aprovados ÷ (aprovados + cancelados)</span>
          </div>
          <Layers className="w-8 h-8 text-[#0056ab]/30" />
        </div>

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-[#727784] block">Clientes Inativos (+90 dias)</span>
            <span className="text-xl font-bold text-[#091b36] tabular-nums">{inactiveClients.length}</span>
            <span className="text-[11px] text-[#727784] block">sem OS ou venda PDV nos últimos 90 dias</span>
          </div>
          {inactiveClients.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowInativosModal(true)}
              className="rounded-xl bg-[#EAF2FD] px-3 py-2 text-xs font-semibold text-[#0056ab] hover:bg-[#dce9fc] cursor-pointer shrink-0"
            >
              Ver lista
            </button>
          ) : (
            <Users className="w-8 h-8 text-[#16A34A]/30" />
          )}
        </div>

        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC] flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold text-[#727784] block">
              Saldo Comprometido (A Pagar)
            </span>
            <span
              className={`text-xl font-bold tabular-nums ${
                payablesSummary.overdueBills.length > 0 ? 'text-[#DC2626]' : 'text-[#091b36]'
              }`}
            >
              {formatBRL(payablesSummary.saldoComprometido)}
            </span>
            <span className="text-[11px] text-[#727784] block tabular-nums">
              {payablesSummary.pendingBills.length} pendente(s) ·{' '}
              {payablesSummary.overdueBills.length} vencida(s) ·{' '}
              {payablesSummary.dueTodayBills.length} hoje
            </span>
          </div>
          <CalendarClock className="w-8 h-8 text-[#D97706]/40 shrink-0" />
        </div>
      </div>

      {/* Contas a Pagar + Ranking Serviços Mais Executados (v1.5 Cortex) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section className="lg:col-span-7 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#0056ab]" />
                <h2 className="text-sm font-bold text-[#091b36]">
                  Contas a Pagar ({payablesSummary.pendingBills.length} pendentes)
                </h2>
              </div>
              <p className="text-[11px] text-[#727784]">
                Boletos, fornecedores e despesas agendadas. Ao dar baixa, lança saída única no caixa (sem dupla contagem).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPayableModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Conta a Pagar</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['Pendentes', 'Vencidas', 'Pagas', 'Todas'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPayablesFilter(tab)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  payablesFilter === tab
                    ? 'bg-[#0056ab] text-white'
                    : 'bg-[#F3F6FB] text-[#414752] hover:text-[#091b36]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="divide-y divide-[#D9E0EC] max-h-80 overflow-y-auto pr-1">
            {filteredPayables.map((bill) => {
              const days = diasAteIso(bill.vencimento, todayIso);
              const isOverdue = bill.status === 'Pendente' && days !== null && days < 0;
              const isDueToday = bill.status === 'Pendente' && days === 0;
              const isSettling = settlingBillId === bill.id;
              const isConfirmingDel = confirmDeleteBillId === bill.id;
              return (
                <div key={bill.id} className="py-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-[#091b36] truncate">{bill.descricao}</p>
                        <span className="px-1.5 py-0.5 rounded bg-[#F3F6FB] border border-[#D9E0EC] text-[10px] font-semibold text-[#414752]">
                          {bill.categoria}
                        </span>
                        {bill.purchaseId && (
                          <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-semibold">
                            Compra vinculada (não duplicada no caixa)
                          </span>
                        )}
                        {bill.status === 'Pago' ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold">
                            Paga {bill.dataPagamento ? `em ${formatDateBR(bill.dataPagamento)}` : ''}
                          </span>
                        ) : isOverdue ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">
                            Vencida há {-days!}d
                          </span>
                        ) : isDueToday ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#FFF7E6] text-[#D97706] text-[10px] font-bold">
                            Vence hoje
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-[#F3F6FB] text-[#414752] text-[10px] font-medium">
                            Venc. {formatDateBR(bill.vencimento)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#727784] mt-0.5 truncate">
                        {bill.fornecedor ? `Fornecedor: ${bill.fornecedor} · ` : ''}
                        Vencimento: {formatDateBR(bill.vencimento)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-[#091b36] tabular-nums">
                        {formatBRL(bill.valor)}
                      </span>
                      {bill.status === 'Pendente' && !isSettling && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettlingBillId(bill.id);
                            setSettleChannel(
                              bill.categoria === 'Peças'
                                ? 'Fornecedores'
                                : bill.categoria === 'Aluguel' || bill.categoria === 'Internet'
                                ? 'Fixo'
                                : 'PIX'
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#15803d] cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>Dar Baixa</span>
                        </button>
                      )}
                      {isAdmin && !isConfirmingDel && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBillId(bill.id)}
                          title="Excluir conta a pagar"
                          className="p-1 rounded-lg text-[#727784] hover:text-[#DC2626] hover:bg-[#FEE2E2]/50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isSettling && (
                    <div className="rounded-xl border border-[#16A34A]/30 bg-[#DCFCE7]/40 p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#091b36]">Canal do pagamento:</span>
                        <select
                          value={settleChannel}
                          onChange={(e) => setSettleChannel(e.target.value as CashTransaction['channel'])}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-2 py-1 text-xs font-semibold text-[#091b36]"
                        >
                          <option value="PIX">PIX</option>
                          <option value="Dinheiro">Dinheiro</option>
                          <option value="Fornecedores">Fornecedores</option>
                          <option value="Fixo">Fixo</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSettlingBillId(null)}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1 font-semibold text-[#414752] cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmSettleBill(bill.id)}
                          className="rounded-lg bg-[#16A34A] px-2.5 py-1 font-semibold text-white hover:bg-[#15803d] cursor-pointer"
                        >
                          Confirmar Pagamento
                        </button>
                      </div>
                    </div>
                  )}

                  {isConfirmingDel && (
                    <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] p-2.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#991B1B]">
                        Remover este agendamento de Contas a Pagar?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBillId(null)}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1 font-semibold text-[#414752] cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deletePayableBill(bill.id);
                            setConfirmDeleteBillId(null);
                          }}
                          className="rounded-lg bg-[#DC2626] px-2.5 py-1 font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredPayables.length === 0 && (
              <div className="py-8 text-center text-xs text-[#727784]">
                Nenhuma conta a pagar neste filtro.
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#0056ab]" />
              <div>
                <h2 className="text-sm font-bold text-[#091b36]">Serviços Mais Executados</h2>
                <p className="text-[11px] text-[#727784]">
                  Ranking real por quantidade, faturamento e ticket médio (OS entregues)
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {topServices.slice(0, 8).map((row, idx) => (
              <div
                key={row.key}
                className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-[#EAF2FD] text-[#0056ab] text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                    {idx + 1}º
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#091b36] truncate">{row.name}</p>
                    <p className="text-[10.5px] text-[#727784] tabular-nums">
                      {row.count} {row.count === 1 ? 'OS entregue' : 'OS entregues'} · Ticket médio{' '}
                      {formatBRL(row.avgTicket)}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#16A34A] tabular-nums shrink-0">
                  {formatBRL(row.totalRevenue)}
                </span>
              </div>
            ))}
            {topServices.length === 0 && (
              <div className="py-8 text-center text-xs text-[#727784]">
                Nenhuma OS entregue registrada ainda para compor o ranking.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Ledger + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#091b36]">
              Lançamentos do Período ({periodLedger.length})
            </h2>
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['Todos', 'PIX', 'Dinheiro', 'Fornecedores', 'Fixo'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannelFilter(ch)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                    channelFilter === ch
                      ? 'bg-[#0056ab] text-white'
                      : 'bg-[#F3F6FB] text-[#414752]'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[#D9E0EC]">
            {periodLedger.map((tx) => {
              const iso = resolveTransactionIsoDate(tx);
              const isConfirmingDel = confirmDeleteTxId === tx.id;
              return (
                <div key={tx.id} className="py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          tx.type === 'in'
                            ? 'bg-[#DCFCE7] text-[#16A34A]'
                            : 'bg-[#FEE2E2] text-[#DC2626]'
                        }`}
                      >
                        {tx.type === 'in' ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-bold text-[#091b36] truncate">{tx.title}</p>
                          <span className="px-1.5 py-0.5 rounded bg-[#F3F6FB] border border-[#D9E0EC] text-[10px] font-mono text-[#414752] shrink-0">
                            {tx.tag}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-semibold shrink-0">
                            {renderExpenseClassLabel(tx)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                              resolveTransactionEnvelope(tx) === 'porquinho'
                                ? 'bg-[#DCFCE7] text-[#15803d]'
                                : 'bg-[#FFF7E6] text-[#B45309]'
                            }`}
                          >
                            {resolveTransactionEnvelope(tx) === 'porquinho'
                              ? resolveTransactionSubEnvelope(tx) === 'garantia'
                                ? 'Porquinho · Garantia'
                                : 'Porquinho · Giro'
                              : 'Conta Inter'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#727784] truncate">
                          {formatDateBR(iso)} · {tx.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p
                          className={`text-xs font-bold tabular-nums ${
                            tx.type === 'in' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}
                        >
                          {tx.type === 'in' ? '+' : '−'} {formatBRL(tx.amount)}
                        </p>
                        <span className="text-[10px] text-[#727784]">{tx.channel}</span>
                      </div>

                      {isAdmin && !isConfirmingDel && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTxId(tx.id)}
                          title="Excluir lançamento"
                          className="p-1.5 rounded-lg text-[#727784] hover:text-[#DC2626] hover:bg-[#FEE2E2]/50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isAdmin && isConfirmingDel && (
                    <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#991B1B]">
                        Excluir este lançamento?
                        {tx.orderId ? ' O valor pago da OS vinculada também será ajustado.' : ''}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTxId(null)}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1 font-semibold text-[#414752] cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDeleteTx(tx.id)}
                          className="rounded-lg bg-[#DC2626] px-2.5 py-1 font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
                        >
                          Confirmar Exclusão
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {periodLedger.length === 0 && (
              <div className="py-10 text-center text-xs text-[#727784]">
                Nenhum lançamento neste período ou canal.
              </div>
            )}
          </div>
        </div>

        {/* Live Channel Breakdown */}
        <div className="lg:col-span-4 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0056ab]" />
            <h2 className="text-sm font-bold text-[#091b36]">Entradas vs. Saídas por Canal</h2>
          </div>

          <div className="space-y-3">
            {channelBreakdown.map((b) => {
              const inPct = Math.round((b.inflow / maxBarScale) * 100);
              const outPct = Math.round((b.outflow / maxBarScale) * 100);
              return (
                <div key={b.label} className="space-y-1 text-[11px]">
                  <div className="flex justify-between text-[#414752]">
                    <span className="font-semibold">{b.label}</span>
                    <span className="tabular-nums text-[10px] text-[#727784]">
                      +{formatBRL(b.inflow)} / -{formatBRL(b.outflow)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-[#F3F6FB] overflow-hidden">
                      <div className="h-full bg-[#0056ab] rounded-full" style={{ width: `${inPct}%` }} />
                    </div>
                    <div className="h-1.5 rounded-full bg-[#F3F6FB] overflow-hidden">
                      <div className="h-full bg-[#DC2626]/75 rounded-full" style={{ width: `${outPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Transaction Modal (`fnForm`) */}
      {showTxModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          data-modal-open="true"
          onClick={() => setShowTxModal(false)}
        >
          <form
            onSubmit={handleCreateTx}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Novo Lançamento no Caixa</h3>
              <button
                type="button"
                onClick={() => setShowTxModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTxType('out');
                  setTxAporte(false);
                  if (txCategory === 'Garantia') {
                    setTxEnv('porquinho');
                    setTxSubEnv('garantia');
                  }
                }}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  txType === 'out'
                    ? 'bg-[#FEE2E2] border-[#DC2626] text-[#DC2626]'
                    : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                }`}
              >
                − Saída (Despesa)
              </button>
              <button
                type="button"
                onClick={() => setTxType('in')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  txType === 'in'
                    ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                    : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                }`}
              >
                + Entrada
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              {txType === 'out' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Categoria</label>
                  <select
                    value={txCategory}
                    onChange={(e) => {
                      const nextCat = e.target.value;
                      setTxCategory(nextCat);
                      if (nextCat === 'Garantia') {
                        setTxEnv('porquinho');
                        setTxSubEnv('garantia');
                      } else if (nextCat === 'Ferramentas' && txEnv === 'porquinho') {
                        setTxSubEnv('giro');
                      }
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                  >
                    {(state.cfg.catDesp || ['Outros']).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Canal</label>
                  <select
                    value={txChannel}
                    onChange={(e) => setTxChannel(e.target.value as CashTransaction['channel'])}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Destino / Envelope
              </label>
              <select
                value={txEnv}
                onChange={(e) => {
                  const nextEnv = e.target.value as TransactionEnvelope;
                  setTxEnv(nextEnv);
                  if (nextEnv === 'porquinho') {
                    setTxSubEnv(txType === 'out' && txCategory === 'Garantia' ? 'garantia' : 'giro');
                  }
                }}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36]"
              >
                <option value="conta">Conta Corrente Inter (Caixa / Peças)</option>
                <option value="porquinho">Porquinho Inter — Reserva (Garantia &amp; Giro)</option>
              </select>
            </div>

            {txEnv === 'porquinho' && (
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Subdestino no Porquinho Inter
                </label>
                <select
                  value={txSubEnv}
                  onChange={(e) => setTxSubEnv(e.target.value as TransactionSubEnvelope)}
                  className="w-full rounded-xl border border-[#0056ab]/30 bg-[#EAF2FD]/70 px-3 py-2 text-xs font-medium text-[#091b36]"
                >
                  <option value="giro">Porquinho Inter — Capital de Giro (Envelope 3)</option>
                  <option value="garantia">Porquinho Inter — Cofre de Garantia (Envelope 2)</option>
                </select>
              </div>
            )}

            {txType === 'in' && (
              <label className="flex items-start gap-2 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2.5 text-[11px] text-[#091b36] cursor-pointer">
                <input
                  type="checkbox"
                  checked={txAporte}
                  onChange={(e) => setTxAporte(e.target.checked)}
                  className="mt-0.5 rounded border-[#D9E0EC] text-[#0056ab] focus:ring-[#0056ab]"
                />
                <span>
                  <strong>Aporte / Saldo inicial</strong> (não contar como faturamento de vendas/OS)
                </span>
              </label>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Descrição *</label>
              <input
                required
                value={txTitle}
                onChange={(e) => setTxTitle(e.target.value)}
                placeholder={
                  txType === 'in'
                    ? 'Ex: Saldo inicial Conta Inter, Aporte para reserva...'
                    : 'Ex: Compra de Fluxo Amtech, Estação SMD...'
                }
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Valor (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTxModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Registrar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Gasto de Garantia (`gastoGar` / `svGar`) */}
      {showGarModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          data-modal-open="true"
          onClick={() => setShowGarModal(false)}
        >
          <form
            onSubmit={handleCreateWarrantyExpense}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Registrar Gasto de Garantia</h3>
              <button
                type="button"
                onClick={() => setShowGarModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-[#727784] bg-[#EAF2FD] border border-[#0056ab]/20 rounded-xl p-3 leading-relaxed">
              O valor sai do <strong>Cofre da Reserva de Garantia</strong> e entra como saída no caixa (categoria Garantia). Se o custo já estiver lançado em uma OS de retorno de garantia, não registre aqui novamente.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Data *</label>
                <input
                  type="date"
                  required
                  value={garDate}
                  onChange={(e) => setGarDate(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={garAmount}
                  onChange={(e) => setGarAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                OS de origem (opcional)
              </label>
              <select
                value={garOrderId}
                onChange={(e) => setGarOrderId(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              >
                <option value="">— Não vincular —</option>
                {deliveredOrdersRecent.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    OS {o.code} · {o.clientName} · {o.device}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Descrição *</label>
              <input
                required
                value={garDesc}
                onChange={(e) => setGarDesc(e.target.value)}
                placeholder="Ex: peça nova no retorno de garantia"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGarModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Registrar no Cofre</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Clientes Inativos (+90d) */}
      {showInativosModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          data-modal-open="true"
          onClick={() => setShowInativosModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-4 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">
                Clientes sem atendimento há +90 dias ({inactiveClients.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowInativosModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto space-y-2 pr-1">
              {inactiveClients.map(({ client, metrics }) => {
                const wa = toWaPhone(client.phone);
                const firstName = client.name.split(' ')[0] || client.name;
                return (
                  <div
                    key={client.id}
                    className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#091b36] truncate">{client.name}</p>
                      <p className="text-[11px] text-[#727784]">
                        Último atendimento {formatDateBR(metrics.lastActivityIso)} ({metrics.daysInactive} dias)
                      </p>
                    </div>
                    {wa && (
                      <a
                        href={`https://wa.me/${wa}?text=${encodeURIComponent(
                          `Olá, ${firstName}! Aqui é da MicroLab. Tudo bem com o seu aparelho?`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#DCFCE7] px-2.5 py-1.5 text-[11px] font-bold text-[#16A34A] hover:bg-[#bbf7d0] shrink-0"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Conta a Pagar (`contasPagar` v1.5 Cortex) */}
      {showPayableModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          data-modal-open="true"
          onClick={() => setShowPayableModal(false)}
        >
          <form
            onSubmit={handleCreatePayableBill}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Agendar Conta a Pagar</h3>
              <button
                type="button"
                onClick={() => setShowPayableModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Descrição *</label>
              <input
                required
                value={billDesc}
                onChange={(e) => setBillDesc(e.target.value)}
                placeholder="Ex: Boleto Fornecedor Tela / Aluguel / Energia..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Fornecedor</label>
                <input
                  value={billSupplier}
                  onChange={(e) => setBillSupplier(e.target.value)}
                  placeholder="Opcional"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Categoria</label>
                <select
                  value={billCategory}
                  onChange={(e) => setBillCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                >
                  {(state.cfg.catDesp || ['Outros']).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={billValue}
                  onChange={(e) => setBillValue(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Vencimento *</label>
                <input
                  type="date"
                  required
                  value={billDue}
                  onChange={(e) => setBillDue(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPayableModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Agendar Conta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
