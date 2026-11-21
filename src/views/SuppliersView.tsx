import React, { useState } from 'react';
import { CheckCircle2, MessageCircle, PackageCheck, Plus, ShoppingCart, Star, Truck, X } from 'lucide-react';
import { Supplier } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';

export const SuppliersView: React.FC = () => {
  const { state, addSupplier, recordRestockOrder } = useLabStore();
  const [tagFilter, setTagFilter] = useState<string>('Todos');
  const [quoteSupplier, setQuoteSupplier] = useState<Supplier | null>(null);
  const [orderItems, setOrderItems] = useState('');
  const [orderCost, setOrderCost] = useState('0');
  const [successMsg, setSuccessMsg] = useState('');

  // New supplier modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [supName, setSupName] = useState('');
  const [supTag, setSupTag] = useState<Supplier['categoryTag']>('Estoque Local');
  const [supSpecialty, setSupSpecialty] = useState('');
  const [supLeadTime, setSupLeadTime] = useState('24h–48h');
  const [supTerms, setSupTerms] = useState('PIX à vista');
  const [supPhone, setSupPhone] = useState('');

  const filtered = state.suppliers.filter(
    (s) => tagFilter === 'Todos' || s.categoryTag === tagFilter
  );

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteSupplier || !orderItems.trim()) return;
    recordRestockOrder(quoteSupplier.name, orderItems.trim(), Math.max(0, parseFloat(orderCost) || 0));
    setSuccessMsg(`Pedido enviado para ${quoteSupplier.name} e adicionado ao rastreamento!`);
    setQuoteSupplier(null);
    setOrderItems('');
    setOrderCost('0');
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    addSupplier({
      name: supName.trim(),
      categoryTag: supTag,
      specialty: supSpecialty.trim() || 'Peças e componentes técnicos',
      leadTime: supLeadTime.trim() || 'A combinar',
      paymentTerms: supTerms.trim() || 'PIX',
      phone: supPhone.replace(/\D/g, ''),
    });
    setShowAddModal(false);
    setSupName('');
    setSupSpecialty('');
    setSupPhone('');
    setSuccessMsg('Fornecedor cadastrado com sucesso!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Fornecedores Homologados &amp; Pedidos</h1>
          <p className="text-xs text-[#727784]">
            SLA de entrega, índice de RMA e rastreio de remessas em trânsito
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['Todos', 'Importação Direta', 'Estoque Local', 'Subdistribuidor', 'Consumíveis Lab'] as const).map(
              (tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tag)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    tagFilter === tag
                      ? 'bg-[#0056ab] text-white'
                      : 'bg-white border border-[#D9E0EC] text-[#414752]'
                  }`}
                >
                  {tag}
                </button>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Fornecedor</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-4 py-2.5 text-xs font-semibold text-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((sup) => (
          <div
            key={sup.id}
            className="rounded-2xl bg-white p-5 border border-[#D9E0EC] flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#091b36] text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {sup.initials}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#091b36]">{sup.name}</h2>
                    <span className="text-[11px] text-[#0056ab] font-semibold">{sup.categoryTag}</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#D97706] bg-[#FFF7E6] px-2 py-1 rounded-lg">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {sup.rating}
                </span>
              </div>

              <p className="text-xs text-[#414752]">{sup.specialty}</p>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#D9E0EC] text-[11px]">
                <div>
                  <span className="text-[#727784] block">Prazo SLA</span>
                  <strong className="text-[#091b36]">{sup.leadTime}</strong>
                </div>
                <div>
                  <span className="text-[#727784] block">Condição</span>
                  <strong className="text-[#091b36]">{sup.paymentTerms}</strong>
                </div>
                <div>
                  <span className="text-[#727784] block">Taxa RMA</span>
                  <strong className="text-[#16A34A]">{sup.rmaRate} ({sup.rmaStatus})</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {sup.phone ? (
                <a
                  href={`https://wa.me/${sup.phone.startsWith('55') ? sup.phone : `55${sup.phone}`}?text=${encodeURIComponent(
                    `Olá ${sup.name}, gostaria de consultar disponibilidade de peças para MicroLab.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D9E0EC] py-2 text-xs font-semibold text-[#16A34A] hover:bg-[#DCFCE7]/50"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>WhatsApp</span>
                </a>
              ) : (
                <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D9E0EC] py-2 text-xs font-medium text-[#727784]">
                  Sem WhatsApp
                </span>
              )}
              <button
                type="button"
                onClick={() => setQuoteSupplier(sup)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0056ab] py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Novo Pedido</span>
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl bg-white p-10 border border-[#D9E0EC] text-center text-xs text-[#727784]">
            {state.suppliers.length === 0
              ? 'Nenhum fornecedor cadastrado ainda. Clique em "Cadastrar Fornecedor" para adicionar seu primeiro parceiro.'
              : 'Nenhum fornecedor encontrado nesta categoria.'}
          </div>
        )}
      </div>

      {/* Active Shipments */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
        <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#0056ab]" />
          <span>Remessas &amp; Pedidos em Trânsito</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.shipments.map((sh) => (
            <div key={sh.id} className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-[#0056ab]">{sh.trackingCode}</span>
                <span className="text-[11px] font-semibold text-[#16A34A]">{sh.etaLabel}</span>
              </div>
              <p className="text-xs font-bold text-[#091b36]">{sh.title}</p>
              <p className="text-[11px] text-[#727784]">{sh.sender}</p>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {['Pedido', 'Postado', 'Em Trânsito', 'Bancada'].map((stepLabel, idx) => (
                  <div key={stepLabel} className="space-y-1">
                    <div
                      className={`h-1.5 rounded-full ${
                        idx < sh.progressStep ? 'bg-[#0056ab]' : 'bg-[#D9E0EC]'
                      }`}
                    />
                    <span className="block text-[10px] text-[#727784]">{stepLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {state.shipments.length === 0 && (
            <div className="col-span-full py-6 text-center text-xs text-[#727784]">
              Nenhuma remessa ou pedido de reposição em trânsito no momento.
            </div>
          )}
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleCreateSupplier}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Cadastrar Fornecedor</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Nome / Empresa *</label>
              <input
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Ex: Distribuidora SMD Salvador"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Categoria</label>
                <select
                  value={supTag}
                  onChange={(e) => setSupTag(e.target.value as Supplier['categoryTag'])}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs"
                >
                  <option value="Estoque Local">Estoque Local</option>
                  <option value="Subdistribuidor">Subdistribuidor</option>
                  <option value="Importação Direta">Importação Direta</option>
                  <option value="Consumíveis Lab">Consumíveis Lab</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">WhatsApp</label>
                <input
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="(71) 99999-0000"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Especialidade</label>
              <input
                value={supSpecialty}
                onChange={(e) => setSupSpecialty(e.target.value)}
                placeholder="Ex: Telas OLED, CIs PMIC, insumos BGA..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Prazo SLA</label>
                <input
                  value={supLeadTime}
                  onChange={(e) => setSupLeadTime(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Condição Pagamento</label>
                <input
                  value={supTerms}
                  onChange={(e) => setSupTerms(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Salvar Fornecedor
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Purchase Order Modal */}
      {quoteSupplier && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setQuoteSupplier(null)}
        >
          <form
            onSubmit={handleSubmitOrder}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#0056ab]" />
                <h3 className="text-base font-bold text-[#091b36]">Pedido para {quoteSupplier.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuoteSupplier(null)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Itens do Pedido *</label>
              <textarea
                required
                rows={3}
                value={orderItems}
                onChange={(e) => setOrderItems(e.target.value)}
                placeholder="Descreva os itens e quantidades..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Valor Estimado (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={orderCost}
                onChange={(e) => setOrderCost(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>
            <p className="text-[11px] text-[#727784]">
              Será criado um rastreamento ativo e a saída prevista de {formatBRL(parseFloat(orderCost) || 0)} no Caixa.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuoteSupplier(null)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Confirmar Pedido
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
