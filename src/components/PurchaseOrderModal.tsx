import React, { useEffect, useState } from 'react';
import { PackageCheck, Plus, Trash2, X } from 'lucide-react';
import { PurchaseItem, PurchaseRecord } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSupplierId?: string;
  initialItems?: PurchaseItem[];
  title?: string;
  onCreated?: (purchase: PurchaseRecord) => void;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  isOpen,
  onClose,
  initialSupplierId = '',
  initialItems,
  title = 'Novo Pedido de Compra',
  onCreated,
}) => {
  const { state, createPurchaseOrder } = useLabStore();
  const [supplierKey, setSupplierKey] = useState(initialSupplierId);
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [frete, setFrete] = useState('0');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSupplierKey(initialSupplierId || state.suppliers[0]?.id || '');
    setCustomSupplierName('');
    setFrete('0');
    setErrorMsg('');
    setItems(
      initialItems && initialItems.length > 0
        ? initialItems.map((x) => ({ ...x }))
        : [{ p: undefined, d: '', q: 1, v: 0 }]
    );
  }, [isOpen, initialSupplierId, initialItems, state.suppliers]);

  if (!isOpen) return null;

  const subtotal = items.reduce((s, it) => s + (Number(it.q) || 0) * (Number(it.v) || 0), 0);
  const freteNum = Math.max(0, parseFloat(frete) || 0);
  const total = Math.round((subtotal + freteNum) * 100) / 100;

  const handleSelectPart = (idx: number, partId: string) => {
    const part = state.parts.find((p) => p.id === partId);
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        if (!part) return { ...it, p: undefined };
        return {
          ...it,
          p: part.id,
          d: part.name,
          v: Number(part.costPrice) || 0,
        };
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const forn =
      state.suppliers.length > 0
        ? supplierKey.trim()
        : customSupplierName.trim() || 'Fornecedor Avulso';
    if (!forn) {
      setErrorMsg('Selecione um fornecedor para o pedido.');
      return;
    }
    const validItems = items.filter((it) => it.d.trim() && (Number(it.q) || 0) > 0);
    if (validItems.length === 0) {
      setErrorMsg('Adicione ao menos um item válido ao pedido.');
      return;
    }
    const created = createPurchaseOrder({
      forn,
      frete: freteNum,
      itens: validItems,
    });
    onCreated?.(created);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-4 my-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-[#0056ab]" />
            <h3 className="text-base font-bold text-[#091b36]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-[#FEE2E2] border border-[#FECACA] px-3 py-2 text-xs font-semibold text-[#DC2626]">
            {errorMsg}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-[#414752] mb-1">
            Fornecedor *
          </label>
          {state.suppliers.length > 0 ? (
            <select
              required
              value={supplierKey}
              onChange={(e) => setSupplierKey(e.target.value)}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
            >
              <option value="">Selecione um fornecedor...</option>
              {state.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.categoryTag})
                </option>
              ))}
            </select>
          ) : (
            <input
              required
              value={customSupplierName}
              onChange={(e) => setCustomSupplierName(e.target.value)}
              placeholder="Nome do fornecedor (cadastre em Fornecedores para salvar contato)"
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#091b36]">Itens do Pedido</span>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, { p: undefined, d: '', q: 1, v: 0 }])}
              className="inline-flex items-center gap-1 rounded-lg bg-[#EAF2FD] px-2.5 py-1 text-[11px] font-semibold text-[#0056ab] hover:bg-[#dbeafe] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar item</span>
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
              >
                <select
                  value={it.p || ''}
                  onChange={(e) => handleSelectPart(idx, e.target.value)}
                  className="sm:col-span-4 rounded-lg border border-[#D9E0EC] bg-white px-2 py-1.5 text-[11px] text-[#091b36]"
                >
                  <option value="">Item avulso (sem vínculo)</option>
                  {state.parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.name} (est.: {p.stock})
                    </option>
                  ))}
                </select>
                <input
                  value={it.d}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, d: e.target.value } : row))
                    )
                  }
                  placeholder="Descrição do item..."
                  className="sm:col-span-4 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs text-[#091b36]"
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={it.q}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, q: Math.max(1, parseInt(e.target.value, 10) || 1) } : row
                      )
                    )
                  }
                  title="Quantidade"
                  className="sm:col-span-1 rounded-lg border border-[#D9E0EC] bg-white px-2 py-1.5 text-xs text-center tabular-nums"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={it.v}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, v: Math.max(0, parseFloat(e.target.value) || 0) } : row
                      )
                    )
                  }
                  title="Custo unitário (R$)"
                  placeholder="Custo"
                  className="sm:col-span-2 rounded-lg border border-[#D9E0EC] bg-white px-2 py-1.5 text-xs tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  title="Remover item"
                  className="sm:col-span-1 p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Frete da Compra (R$, rateado no recebimento)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={frete}
              onChange={(e) => setFrete(e.target.value)}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
            />
          </div>
          <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3.5 py-2 flex items-center justify-between">
            <span className="text-xs text-[#727784]">Total do Pedido</span>
            <strong className="text-base text-[#091b36] tabular-nums">{formatBRL(total)}</strong>
          </div>
        </div>

        <p className="text-[11px] text-[#727784]">
          O pedido é salvo com status <strong>A caminho</strong>. Ao confirmar <strong>Receber</strong>, o estoque é atualizado com custo médio ponderado (incluindo rateio do frete) e a saída é lançada na categoria Peças.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
          >
            Salvar Pedido de Compra
          </button>
        </div>
      </form>
    </div>
  );
};
