import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Mail,
  MessageCircle,
  PackageCheck,
  Plus,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { PurchaseItem, PurchaseRecord, Supplier } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  calcPurchaseTotalAmount,
  formatDateBR,
  isLowStock,
} from '../utils/pricing';
import { PurchaseOrderModal } from '../components/PurchaseOrderModal';

export const SuppliersView: React.FC = () => {
  const { state, addSupplier, updateSupplier, deleteSupplier, receivePurchaseOrder } =
    useLabStore();
  const [tagFilter, setTagFilter] = useState<string>('Todos');
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [modalSupplierId, setModalSupplierId] = useState('');
  const [modalInitialItems, setModalInitialItems] = useState<PurchaseItem[] | undefined>(undefined);
  const [modalTitle, setModalTitle] = useState('Novo Pedido de Compra');
  const [confirmReceiveId, setConfirmReceiveId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [warnMsg, setWarnMsg] = useState('');

  // Add / Edit supplier modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [confirmDeleteSupId, setConfirmDeleteSupId] = useState<string | null>(null);
  const [supName, setSupName] = useState('');
  const [supTag, setSupTag] = useState<Supplier['categoryTag']>('Estoque Local');
  const [supSpecialty, setSupSpecialty] = useState('');
  const [supLeadTime, setSupLeadTime] = useState('24h–48h');
  const [supTerms, setSupTerms] = useState('PIX à vista');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');

  const filteredSuppliers = state.suppliers.filter(
    (s) => tagFilter === 'Todos' || s.categoryTag === tagFilter
  );

  const sortedPurchases = useMemo(
    () => [...state.compras].sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0)),
    [state.compras]
  );

  const criticalParts = useMemo(
    () => state.parts.filter((p) => isLowStock(p)),
    [state.parts]
  );

  const showToast = (msg: string) => {
    setWarnMsg('');
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  const handleOpenNewPurchase = (supId = '') => {
    setModalSupplierId(supId || state.suppliers[0]?.id || '');
    setModalInitialItems(undefined);
    setModalTitle('Novo Pedido de Compra');
    setPurchaseModalOpen(true);
  };

  const handleOpenReplenishment = () => {
    if (criticalParts.length === 0) {
      setWarnMsg('Nenhum item abaixo do estoque mínimo no momento.');
      setTimeout(() => setWarnMsg(''), 3500);
      return;
    }
    setModalSupplierId(state.suppliers[0]?.id || '');
    setModalInitialItems(
      criticalParts.map((p) => ({
        p: p.id,
        d: p.name,
        q: Math.max((p.minStock || 0) - (p.stock || 0), 1),
        v: Number(p.costPrice) || 0,
      }))
    );
    setModalTitle('Pedido de Reposição Automática (Estoque Mínimo)');
    setPurchaseModalOpen(true);
  };

  const openAddSupplierModal = () => {
    setEditingSupplier(null);
    setSupName('');
    setSupTag('Estoque Local');
    setSupSpecialty('');
    setSupLeadTime('24h–48h');
    setSupTerms('PIX à vista');
    setSupPhone('');
    setSupEmail('');
    setShowAddModal(true);
  };

  const openEditSupplierModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setSupName(sup.name);
    setSupTag(sup.categoryTag);
    setSupSpecialty(sup.specialty || '');
    setSupLeadTime(sup.leadTime || 'A combinar');
    setSupTerms(sup.paymentTerms || 'PIX');
    setSupPhone(sup.phone || '');
    setSupEmail(sup.email || '');
    setShowAddModal(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    const payload = {
      name: supName.trim(),
      categoryTag: supTag,
      specialty: supSpecialty.trim() || 'Peças e componentes técnicos',
      leadTime: supLeadTime.trim() || 'A combinar',
      paymentTerms: supTerms.trim() || 'PIX',
      phone: supPhone.replace(/\D/g, ''),
      email: supEmail.trim() || '',
    };
    if (editingSupplier) {
      updateSupplier(editingSupplier.id, payload);
      showToast('Fornecedor atualizado com sucesso!');
    } else {
      addSupplier(payload);
      showToast('Fornecedor cadastrado com sucesso!');
    }
    setShowAddModal(false);
    setEditingSupplier(null);
    setSupName('');
    setSupSpecialty('');
    setSupPhone('');
    setSupEmail('');
  };

  const resolveSupplier = (fornKey: string): Supplier | undefined =>
    state.suppliers.find((s) => s.id === fornKey || s.name === fornKey);

  const buildPurchaseShareText = (purchase: PurchaseRecord): string => {
    const lines = purchase.itens.map(
      (it) => `${it.q}x ${it.d} - ${formatBRL(it.q * it.v)}`
    );
    const total = calcPurchaseTotalAmount(purchase);
    return [
      `MicroLab · Pedido de compra nº ${purchase.n}`,
      ...lines,
      ...(purchase.frete > 0 ? [`Frete: ${formatBRL(purchase.frete)}`] : []),
      `Total: ${formatBRL(total)}`,
      `WhatsApp (71) 99129-3552 · @microlabssa`,
    ].join('\n');
  };

  const handleCopyPurchase = async (purchase: PurchaseRecord) => {
    const txt = buildPurchaseShareText(purchase);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // Ignore clipboard permission errors
    }
    setCopiedId(purchase.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatWaUrl = (phone: string | undefined, text: string) => {
    const digits = (phone || '').replace(/\D/g, '');
    const waDigits =
      digits.length >= 8 && digits.length <= 11 ? `55${digits}` : digits;
    return waDigits
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">
            Fornecedores &amp; Pedidos de Compra
          </h1>
          <p className="text-xs text-[#727784]">
            Gestão de compras (`A caminho` / `Recebido`), custo médio ponderado com rateio de frete e envio ao fornecedor
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenReplenishment}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#FFF7E6] cursor-pointer whitespace-nowrap"
          >
            <ShoppingCart className="w-4 h-4 text-[#D97706]" />
            <span>Reposição ({criticalParts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenNewPurchase()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#091b36] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0056ab] cursor-pointer whitespace-nowrap"
          >
            <PackageCheck className="w-4 h-4" />
            <span>Novo Pedido de Compra</span>
          </button>
          <button
            type="button"
            onClick={openAddSupplierModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Fornecedor</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-4 py-2.5 text-xs font-semibold text-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {warnMsg && (
        <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-2.5 text-xs font-semibold text-[#92400E]">
          {warnMsg}
        </div>
      )}

      {/* Pedidos de Compra (`compras`) */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#0056ab]" />
            <span>Pedidos de Compra ({sortedPurchases.length})</span>
          </h2>
          <span className="text-[11px] text-[#727784]">
            Ao receber, o frete é rateado por valor, o custo médio ponderado é recalculado e o caixa é debitado em Peças.
          </span>
        </div>

        <div className="space-y-3">
          {sortedPurchases.map((purchase) => {
            const sup = resolveSupplier(purchase.forn);
            const supName = sup?.name || purchase.forn || 'Fornecedor';
            const total = calcPurchaseTotalAmount(purchase);
            const shareText = buildPurchaseShareText(purchase);
            const emailSubject = `MicroLab · Pedido de compra nº ${purchase.n}`;

            return (
              <div
                key={purchase.id}
                className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/50 p-4 space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#0056ab] tabular-nums">
                      Pedido nº {purchase.n}
                    </span>
                    <span className="text-xs font-bold text-[#091b36]">{supName}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        purchase.st === 'Recebido'
                          ? 'bg-[#DCFCE7] text-[#16A34A]'
                          : 'bg-[#FFF7E6] text-[#D97706]'
                      }`}
                    >
                      {purchase.st}
                    </span>
                    <span className="text-[11px] text-[#727784]">
                      Criado em {formatDateBR(purchase.data)}
                      {purchase.recebido ? ` · Recebido em ${formatDateBR(purchase.recebido)}` : ''}
                    </span>
                  </div>

                  <div className="text-sm font-bold text-[#091b36] tabular-nums">
                    {formatBRL(total)}
                    {purchase.frete > 0 && (
                      <span className="ml-1.5 text-[10px] font-normal text-[#727784]">
                        (frete {formatBRL(purchase.frete)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Items summary */}
                <div className="flex flex-wrap gap-1.5">
                  {purchase.itens.map((it, idx) => (
                    <span
                      key={idx}
                      className="rounded-lg bg-white border border-[#D9E0EC] px-2 py-1 text-[11px] text-[#414752] tabular-nums"
                    >
                      <strong>{it.q}x</strong> {it.d} ({formatBRL(it.v)})
                    </span>
                  ))}
                </div>

                {/* Actions: WhatsApp / Email / Copiar / Receber (`recC`) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#D9E0EC]/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={formatWaUrl(sup?.phone, shareText)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-[#DCFCE7] px-2.5 py-1.5 text-[11px] font-semibold text-[#16A34A] hover:bg-[#bbf7d0]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                    <a
                      href={`mailto:${encodeURIComponent(sup?.email || '')}?subject=${encodeURIComponent(
                        emailSubject
                      )}&body=${encodeURIComponent(shareText)}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-1.5 text-[11px] font-semibold text-[#091b36] hover:bg-[#EAF2FD]"
                    >
                      <Mail className="w-3.5 h-3.5 text-[#0056ab]" />
                      <span>E-mail</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyPurchase(purchase)}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-1.5 text-[11px] font-semibold text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
                    >
                      {copiedId === purchase.id ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === purchase.id ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>

                  {purchase.st === 'A caminho' && (
                    <div className="flex items-center gap-1.5">
                      {confirmReceiveId === purchase.id ? (
                        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1">
                          <span className="text-[11px] font-semibold text-[#92400E]">
                            Atualizar estoque + custo médio e lançar saída?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const res = receivePurchaseOrder(purchase.id);
                              setConfirmReceiveId(null);
                              if (res.ok) {
                                showToast(
                                  `Pedido nº ${purchase.n} recebido! Estoque, custo médio e caixa atualizados.`
                                );
                              }
                            }}
                            className="rounded-md bg-[#16A34A] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#15803D] cursor-pointer"
                          >
                            Sim, Receber
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmReceiveId(null)}
                            className="rounded-md border border-[#D9E0EC] bg-white px-2 py-1 text-[11px] text-[#414752] cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmReceiveId(purchase.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#15803D] cursor-pointer"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>Receber Pedido</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sortedPurchases.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#D9E0EC] bg-[#F3F6FB]/50 p-6 text-center text-xs text-[#727784]">
              Nenhum pedido de compra registrado ainda. Use <strong>Novo Pedido de Compra</strong> ou <strong>Reposição</strong> acima.
            </div>
          )}
        </div>
      </div>

      {/* Category Filter for Suppliers */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          ['Todos', 'Importação Direta', 'Estoque Local', 'Subdistribuidor', 'Consumíveis Lab'] as const
        ).map((tag) => (
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
        ))}
      </div>

      {/* Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSuppliers.map((sup) => (
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#D97706] bg-[#FFF7E6] px-2 py-1 rounded-lg">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {sup.rating}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditSupplierModal(sup)}
                    title="Editar fornecedor"
                    aria-label={`Editar ${sup.name}`}
                    className="p-1.5 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] text-[#414752] hover:bg-[#EAF2FD] hover:text-[#0056ab] cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDeleteSupId((prev) => (prev === sup.id ? null : sup.id))
                    }
                    title="Excluir fornecedor"
                    aria-label={`Excluir ${sup.name}`}
                    className="p-1.5 rounded-lg border border-[#FEE2E2] bg-[#FEE2E2]/40 text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {confirmDeleteSupId === sup.id && (
                <div className="rounded-xl bg-[#FEE2E2]/60 border border-[#DC2626]/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#DC2626]">
                    Remover este fornecedor?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        deleteSupplier(sup.id);
                        setConfirmDeleteSupId(null);
                        showToast(`Fornecedor "${sup.name}" excluído.`);
                      }}
                      className="rounded-lg bg-[#DC2626] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#b91c1c] cursor-pointer"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSupId(null)}
                      className="rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#414752] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

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
                  <strong className="text-[#16A34A]">
                    {sup.rmaRate} ({sup.rmaStatus})
                  </strong>
                </div>
              </div>
              {sup.email && (
                <p className="text-[11px] text-[#727784]">E-mail: {sup.email}</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              {sup.phone ? (
                <a
                  href={formatWaUrl(
                    sup.phone,
                    `Olá ${sup.name}, gostaria de consultar disponibilidade de peças para MicroLab.`
                  )}
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
                onClick={() => handleOpenNewPurchase(sup.id)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0056ab] py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Novo Pedido</span>
              </button>
            </div>
          </div>
        ))}
        {filteredSuppliers.length === 0 && (
          <div className="col-span-full rounded-2xl bg-white p-10 border border-[#D9E0EC] text-center text-xs text-[#727784]">
            {state.suppliers.length === 0
              ? 'Nenhum fornecedor cadastrado ainda. Clique em "Cadastrar Fornecedor" para adicionar seu primeiro parceiro.'
              : 'Nenhum fornecedor encontrado nesta categoria.'}
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      {showAddModal && (
        <div
          data-modal-open="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => {
            setShowAddModal(false);
            setEditingSupplier(null);
          }}
        >
          <form
            onSubmit={handleSaveSupplier}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">
                {editingSupplier ? 'Editar Fornecedor' : 'Cadastrar Fornecedor'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSupplier(null);
                }}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Nome / Empresa *
              </label>
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
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Categoria
                </label>
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
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  WhatsApp
                </label>
                <input
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="(71) 99999-0000"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">E-mail</label>
              <input
                type="email"
                value={supEmail}
                onChange={(e) => setSupEmail(e.target.value)}
                placeholder="pedidos@fornecedor.com"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Especialidade
              </label>
              <input
                value={supSpecialty}
                onChange={(e) => setSupSpecialty(e.target.value)}
                placeholder="Ex: Telas OLED, CIs PMIC, insumos BGA..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Prazo SLA
                </label>
                <input
                  value={supLeadTime}
                  onChange={(e) => setSupLeadTime(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Condição Pagamento
                </label>
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
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSupplier(null);
                }}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                {editingSupplier ? 'Atualizar Fornecedor' : 'Salvar Fornecedor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Purchase Order Modal (`cpForm`) */}
      <PurchaseOrderModal
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        initialSupplierId={modalSupplierId}
        initialItems={modalInitialItems}
        title={modalTitle}
        onCreated={(purchase) =>
          showToast(
            `Pedido de compra nº ${purchase.n} registrado como "A caminho".`
          )
        }
      />
    </div>
  );
};
