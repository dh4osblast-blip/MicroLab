import React, { useState } from 'react';
import {
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { formatBRL, useLabStore } from '../store/useLabStore';
import { PixQrGraphic } from '../components/PixModal';
import { buildPixPayload, formatPixKeyForEmv } from '../utils/pix';

interface PosCatalogItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stockPartId?: string;
}

type PaymentMethod = 'PIX Dinâmico' | 'Dinheiro';

export const PosView: React.FC = () => {
  const { state, currentUser, addTransaction, adjustPartStock } = useLabStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('Todos');
  const [cart, setCart] = useState<{ item: PosCatalogItem; qty: number }[]>([]);
  const [discount, setDiscount] = useState('0');
  const [customerName, setCustomerName] = useState('Consumidor Balcão');
  const sellerOptions = Array.from(
    new Set(
      [...state.vendedores.map((v) => v.nome), currentUser?.nome].filter(
        (x): x is string => Boolean(x && x.trim())
      )
    )
  );
  const [selectedSeller, setSelectedSeller] = useState(
    () =>
      state.vendedores.find((v) => v.nome === currentUser?.nome)?.nome ||
      (currentUser?.nivel === 'Vendedor' ? currentUser.nome : '') ||
      state.vendedores[0]?.nome ||
      currentUser?.nome ||
      ''
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX Dinâmico');
  const [cashReceived, setCashReceived] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceiptTotal, setLastReceiptTotal] = useState(0);
  const [pixCopied, setPixCopied] = useState(false);

  // Venda avulsa rápida (produto ou serviço sem cadastro prévio)
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const stockCatalog: PosCatalogItem[] = state.parts
    .filter((p) => p.stock > 0)
    .map((p) => ({
      id: `part-${p.id}`,
      sku: p.sku,
      name: p.name,
      category: p.category,
      price: p.sellPrice,
      stockPartId: p.id,
    }));

  const categories = ['Todos', ...Array.from(new Set(stockCatalog.map((i) => i.category)))];

  const filtered = stockCatalog.filter((it) => {
    const q = search.trim().toLowerCase();
    const matchesQ = !q || it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q);
    const matchesCat = catFilter === 'Todos' || it.category === catFilter;
    return matchesQ && matchesCat;
  });

  const addToCart = (item: PosCatalogItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.item.id === item.id);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(customPrice.replace(',', '.')) || 0;
    if (!customName.trim() || priceNum <= 0) return;
    addToCart({
      id: `avulso-${Date.now()}`,
      sku: 'AVULSO',
      name: customName.trim(),
      category: 'Balcão',
      price: priceNum,
    });
    setCustomName('');
    setCustomPrice('');
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.item.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const subtotal = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0);
  const discountVal = Math.max(0, Math.min(subtotal, parseFloat(discount) || 0));
  const total = Math.max(0, subtotal - discountVal);
  const changeAmount = Math.max(0, (parseFloat(cashReceived) || 0) - total);

  const pdvPixPayload = buildPixPayload({
    pixKey: state.labProfile.pixKey,
    merchant: state.labProfile.pixMerchant,
    city: state.labProfile.pixCity || 'SALVADOR',
    amount: total,
    txid: `PDV${cart.length}`,
  });

  const handleCopyPdvPix = async () => {
    if (!pdvPixPayload) return;
    try {
      await navigator.clipboard.writeText(pdvPixPayload);
    } catch {
      // Fallback silent
    }
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const handleConfirmSale = () => {
    if (cart.length === 0 || total <= 0) return;
    const channel = paymentMethod === 'PIX Dinâmico' ? 'PIX' : 'Dinheiro';
    const sellerTag = selectedSeller.trim() ? ` · Vend.: ${selectedSeller.trim()}` : '';
    addTransaction({
      title: `Venda Balcão PDV (${cart.reduce((s, c) => s + c.qty, 0)} itens)`,
      subtitle: `${customerName || 'Balcão'} · ${paymentMethod}${sellerTag}`,
      tag: 'PDV-BALCÃO',
      channel,
      type: 'in',
      amount: total,
      reconciled: channel !== 'Dinheiro',
    });
    cart.forEach((c) => {
      if (c.item.stockPartId) {
        adjustPartStock(c.item.stockPartId, -c.qty);
      }
    });
    setLastReceiptTotal(total);
    setReceiptOpen(true);
    setCart([]);
    setDiscount('0');
    setCashReceived('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">PDV Rápido &amp; Caixa Balcão</h1>
          <p className="text-xs text-[#727784]">
            Venda expressa de peças do estoque ou itens avulsos via PIX e Dinheiro (taxa 0,0%)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Catalog + Custom Item */}
        <div className="lg:col-span-7 space-y-3">
          {/* Quick Custom Item Form */}
          <form
            onSubmit={handleAddCustomItem}
            className="rounded-2xl bg-white p-4 border border-[#D9E0EC] space-y-2.5"
          >
            <p className="text-xs font-bold text-[#091b36]">Adicionar Item ou Serviço Avulso ao Carrinho</p>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Descrição (ex: Película, Cabo USB-C, Limpeza...)"
                className="sm:col-span-7 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="Valor (R$)"
                className="sm:col-span-3 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold text-[#091b36] tabular-nums"
              />
              <button
                type="submit"
                className="sm:col-span-2 inline-flex items-center justify-center gap-1 rounded-xl bg-[#0056ab] py-2 px-3 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Incluir</span>
              </button>
            </div>
          </form>

          <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC] space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar peça em estoque por nome ou SKU..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs text-[#091b36]"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    catFilter === cat
                      ? 'bg-[#0056ab] text-white'
                      : 'bg-[#F3F6FB] text-[#414752] hover:bg-[#EAF2FD]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item)}
                className="rounded-2xl bg-white p-4 border border-[#D9E0EC] hover:border-[#0056ab] transition-colors text-left flex flex-col justify-between gap-2 cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-[#727784]">{item.sku}</span>
                    <span className="text-[10px] font-semibold text-[#0056ab] bg-[#EAF2FD] px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#091b36] mt-1.5">{item.name}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#D9E0EC]">
                  <span className="text-sm font-bold text-[#091b36] tabular-nums">{formatBRL(item.price)}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0056ab]">
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-2xl bg-white p-8 border border-[#D9E0EC] text-center text-xs text-[#727784]">
                {stockCatalog.length === 0
                  ? 'Nenhuma peça com saldo em estoque no momento. Cadastre em Produtos & Peças ou use o lançamento avulso acima.'
                  : 'Nenhum item encontrado com os filtros atuais.'}
              </div>
            )}
          </div>
        </div>

        {/* Cart & Checkout */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#0056ab]" />
              <span>Carrinho Atual</span>
            </h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#DC2626] hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {cart.map((c) => (
              <div
                key={c.item.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F3F6FB] border border-[#D9E0EC]"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#091b36] truncate">{c.item.name}</p>
                  <p className="text-[11px] text-[#727784] tabular-nums">
                    {formatBRL(c.item.price)} × {c.qty} ={' '}
                    <strong className="text-[#091b36]">{formatBRL(c.item.price * c.qty)}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQty(c.item.id, -1)}
                    className="w-7 h-7 rounded-lg bg-white border border-[#D9E0EC] flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold tabular-nums">{c.qty}</span>
                  <button
                    type="button"
                    onClick={() => updateQty(c.item.id, 1)}
                    className="w-7 h-7 rounded-lg bg-white border border-[#D9E0EC] flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <p className="py-6 text-center text-xs text-[#727784]">
                Adicione um item avulso ou selecione uma peça em estoque para iniciar a venda.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Cliente</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Vendedor</label>
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
              >
                <option value="">Não informado</option>
                {sellerOptions.map((sellerName) => (
                  <option key={sellerName} value={sellerName}>
                    {sellerName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Desconto (R$)</label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs tabular-nums"
              />
            </div>
          </div>

          {/* Payment Method Selector (PIX & Dinheiro — Taxa 0%) */}
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1.5">
              Forma de Pagamento (Taxa 0,0%)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'PIX Dinâmico', icon: QrCode },
                  { id: 'Dinheiro', icon: Banknote },
                ] as const
              ).map((pm) => {
                const Icon = pm.icon;
                const active = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                      active
                        ? 'bg-[#EAF2FD] border-[#0056ab] text-[#0056ab]'
                        : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{pm.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethod === 'PIX Dinâmico' && total > 0 && (
            <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC] flex items-center gap-3">
              <PixQrGraphic payload={pdvPixPayload} size={96} />
              <div className="text-xs space-y-1 min-w-0 flex-1">
                <p className="font-bold text-[#091b36]">PIX Banco Inter Instantâneo</p>
                <p className="text-[11px] text-[#727784] truncate">
                  Chave: {formatPixKeyForEmv(state.labProfile.pixKey) || 'Não configurada'}
                </p>
                <p className="text-sm font-bold text-[#0056ab] tabular-nums">{formatBRL(total)}</p>
                {pdvPixPayload && (
                  <button
                    type="button"
                    onClick={handleCopyPdvPix}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#EAF2FD] px-2.5 py-1 text-[11px] font-semibold text-[#0056ab] hover:bg-[#dfe8ff] cursor-pointer"
                  >
                    {pixCopied ? <Check className="w-3 h-3 text-[#16A34A]" /> : <Copy className="w-3 h-3" />}
                    <span>{pixCopied ? 'Copiado!' : 'Copiar PIX EMV'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {paymentMethod === 'Dinheiro' && (
            <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC] grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-[10px] font-semibold text-[#727784] mb-1">Valor Recebido (R$)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0,00"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                />
              </div>
              <div>
                <span className="block text-[10px] font-semibold text-[#727784]">Troco Calculado</span>
                <span className="text-base font-bold text-[#16A34A] tabular-nums">{formatBRL(changeAmount)}</span>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-[#D9E0EC] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#727784]">Total a Pagar</span>
              <span className="text-xl font-bold text-[#091b36] tabular-nums">{formatBRL(total)}</span>
            </div>
            <button
              type="button"
              disabled={cart.length === 0 || total <= 0}
              onClick={handleConfirmSale}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] py-3 text-xs font-bold text-white hover:bg-[#15803d] transition-colors cursor-pointer disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Pagamento &amp; Emitir Recibo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setReceiptOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#091b36]">Venda Confirmada no Caixa!</h3>
            <p className="text-xs text-[#414752]">
              Recebimento de <strong className="tabular-nums">{formatBRL(lastReceiptTotal)}</strong> via{' '}
              <strong>{paymentMethod}</strong> registrado para {customerName}.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#091b36] cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Nova Venda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
