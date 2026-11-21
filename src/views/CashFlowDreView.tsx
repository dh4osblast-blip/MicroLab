import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Plus,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { CashTransaction } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';

export const CashFlowDreView: React.FC = () => {
  const { state, addTransaction, syncNow } = useLabStore();
  const [channelFilter, setChannelFilter] = useState<'Todos' | CashTransaction['channel']>('Todos');
  const [showModal, setShowModal] = useState(false);

  const [txTitle, setTxTitle] = useState('');
  const [txSubtitle, setTxSubtitle] = useState('');
  const [txType, setTxType] = useState<'in' | 'out'>('in');
  const [txChannel, setTxChannel] = useState<CashTransaction['channel']>('PIX');
  const [txAmount, setTxAmount] = useState('0');

  const totalIn = state.transactions.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const totalOut = state.transactions.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  const netResult = totalIn - totalOut;
  const marginPct = totalIn > 0 ? Math.round((netResult / totalIn) * 100) : 0;

  const filtered = state.transactions.filter(
    (t) => channelFilter === 'Todos' || t.channel === channelFilter
  );

  const handleExportCsv = () => {
    const header = 'ID,Titulo,Subtitulo,Tag,Canal,Tipo,Valor,Data,Conciliado\n';
    const rows = state.transactions
      .map(
        (t) =>
          `"${t.id}","${t.title.replace(/"/g, '""')}","${t.subtitle.replace(/"/g, '""')}","${t.tag}","${
            t.channel
          }","${t.type === 'in' ? 'Entrada' : 'Saída'}",${t.amount.toFixed(2)},"${t.dateLabel}",${
            t.reconciled ? 'Sim' : 'Pendente'
          }`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `microlab-dre-fluxo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txTitle.trim()) return;
    addTransaction({
      title: txTitle.trim(),
      subtitle: txSubtitle.trim() || `${txChannel} · Lançamento manual`,
      tag: txType === 'in' ? 'ENTRADA' : 'SANGRIA',
      channel: txChannel,
      type: txType,
      amount: Math.max(1, parseFloat(txAmount) || 0),
      reconciled: true,
    });
    setShowModal(false);
    setTxTitle('');
    setTxSubtitle('');
  };

  const channelBreakdown = (['PIX', 'Dinheiro', 'Fornecedores', 'Fixo'] as const).map((ch) => {
    const txs = state.transactions.filter((t) => t.channel === ch);
    const inflow = txs.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const outflow = txs.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    return { label: ch, inflow, outflow };
  });
  const maxBarScale = Math.max(100, ...channelBreakdown.map((b) => Math.max(b.inflow, b.outflow)));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Fluxo de Caixa &amp; DRE Gerencial</h1>
          <p className="text-xs text-[#727784]">
            Livro-razão unificado de entradas PIX/Dinheiro, compras de peças e despesas fixas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={syncNow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#0056ab]" />
            <span>Conciliar Inter</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#0056ab]" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Entradas Consolidadas</span>
          <span className="text-xl font-bold text-[#16A34A] tabular-nums">{formatBRL(totalIn)}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Saídas &amp; Fornecedores</span>
          <span className="text-xl font-bold text-[#DC2626] tabular-nums">{formatBRL(totalOut)}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Resultado Líquido DRE</span>
          <span className={`text-xl font-bold tabular-nums ${netResult >= 0 ? 'text-[#0056ab]' : 'text-[#DC2626]'}`}>
            {formatBRL(netResult)}
          </span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Margem Operacional</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">{marginPct}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Ledger */}
        <div className="lg:col-span-8 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#091b36]">Livro-Razão de Movimentações</h2>
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
            {filtered.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
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
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-[#091b36] truncate">{tx.title}</p>
                      <span className="px-1.5 py-0.5 rounded bg-[#F3F6FB] border border-[#D9E0EC] text-[10px] font-mono text-[#414752] shrink-0">
                        {tx.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#727784] truncate">
                      {tx.subtitle} · {tx.dateLabel}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-xs font-bold tabular-nums ${
                      tx.type === 'in' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}
                  >
                    {tx.type === 'in' ? '+' : '-'} {formatBRL(tx.amount)}
                  </p>
                  <span className="text-[10px] text-[#727784]">
                    {tx.reconciled ? 'Conciliado' : 'Pendente'}
                  </span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-xs text-[#727784]">
                {state.transactions.length === 0
                  ? 'Nenhuma movimentação registrada no caixa ainda.'
                  : 'Nenhum lançamento encontrado neste canal.'}
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

      {/* Add Transaction Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowModal(false)}
        >
          <form
            onSubmit={handleCreateTx}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Novo Lançamento / Sangria</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
              <button
                type="button"
                onClick={() => setTxType('out')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  txType === 'out'
                    ? 'bg-[#FEE2E2] border-[#DC2626] text-[#DC2626]'
                    : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                }`}
              >
                - Saída / Sangria
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Descrição *</label>
              <input
                required
                value={txTitle}
                onChange={(e) => setTxTitle(e.target.value)}
                placeholder="Ex: Compra de Fluxo Amtech"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Canal</label>
                <select
                  value={txChannel}
                  onChange={(e) => setTxChannel(e.target.value as CashTransaction['channel'])}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                >
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Fornecedores">Fornecedores</option>
                  <option value="Fixo">Custo Fixo</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
    </div>
  );
};
