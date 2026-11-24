import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  History,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { SaleRecord } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import { calcSaleTotalAmount, formatDateBR } from '../utils/pricing';
import { PixQrGraphic } from '../components/PixModal';
import { buildPixPayload, formatPixKeyForEmv } from '../utils/pix';
import { PosThermalReceipt, runWithThermalPrintMode } from '../components/ThermalReceiptPrint';

interface PosCatalogItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  stockPartId?: string;
}

function toWaPhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export const PosView: React.FC = () => {
  const { state, currentUser, createPosSale, reversePosSale } = useLabStore();
  const [activeTab, setActiveTab] = useState<'pdv' | 'historico'>('pdv');
  const [search, setSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('Todos');
  const [cart, setCart] = useState<{ item: PosCatalogItem; qty: number }[]>([]);
  const [discount, setDiscount] = useState('0');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [walkInCustomerName, setWalkInCustomerName] = useState('Consumidor Balcão');

  const paymentOptions = useMemo(() => {
    const raw = (state.cfg.formas || []).filter((f) => Boolean(f && f.trim()));
    return raw.length > 0 ? raw : ['Pix', 'Dinheiro'];
  }, [state.cfg.formas]);

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
  const [paymentMethod, setPaymentMethod] = useState<string>(() => paymentOptions[0] || 'Pix');
  const [cashReceived, setCashReceived] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastSale, setLastSale] = useState<SaleRecord | null>(null);
  const [lastSaleCashInfo, setLastSaleCashInfo] = useState<{
    received: number;
    change: number;
  } | null>(null);
  const [printMode, setPrintMode] = useState<'a4' | 'thermal'>('a4');
  const [pixCopied, setPixCopied] = useState(false);
  const [copiedSaleId, setCopiedSaleId] = useState<string | null>(null);
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState('');

  // Venda avulsa rápida (produto ou serviço sem cadastro prévio)
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const effectivePaymentMethod = paymentOptions.includes(paymentMethod)
    ? paymentMethod
    : paymentOptions[0] || 'Pix';

  const selectedClient = selectedClientId
    ? state.clients.find((c) => c.id === selectedClientId)
    : undefined;

  const stockCatalog: PosCatalogItem[] = state.parts
    .filter((p) => p.stock > 0)
    .map((p) => ({
      id: `part-${p.id}`,
      sku: p.sku,
      name: p.name,
      category: p.category,
      price: p.sellPrice,
      stock: p.stock,
      stockPartId: p.id,
    }));

  const categories = ['Todos', ...Array.from(new Set(stockCatalog.map((i) => i.category)))];

  const filtered = stockCatalog.filter((it) => {
    const q = search.trim().toLowerCase();
    const matchesQ = !q || it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q);
    const matchesCat = catFilter === 'Todos' || it.category === catFilter;
    return matchesQ && matchesCat;
  });

  const sortedSales = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return [...state.vendas]
      .sort((a, b) => b.n - a.n)
      .filter((v) => {
        if (!q) return true;
        const clientLabel =
          (v.cli ? state.clients.find((c) => c.id === v.cli)?.name : '') ||
          v.cliNome ||
          'Balcão';
        return (
          String(v.n).includes(q) ||
          clientLabel.toLowerCase().includes(q) ||
          (v.vend || '').toLowerCase().includes(q) ||
          v.forma.toLowerCase().includes(q) ||
          v.itens.some((it) => it.d.toLowerCase().includes(q))
        );
      });
  }, [state.vendas, state.clients, historySearch]);

  const addToCart = (item: PosCatalogItem) => {
    setFeedbackError('');
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
      stock: 999,
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
  const discountVal = Math.max(0, Math.min(subtotal, parseFloat(discount.replace(',', '.')) || 0));
  const total = Math.max(0, subtotal - discountVal);
  const changeAmount = Math.max(0, (parseFloat(cashReceived.replace(',', '.')) || 0) - total);

  const isPixMethod = effectivePaymentMethod.toLowerCase().includes('pix');
  const isCashMethod = effectivePaymentMethod.toLowerCase().includes('dinheiro');

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

  const buildSaleReceiptText = (sale: SaleRecord): string => {
    const lines = (sale.itens || []).map(
      (it) => `${it.q}x ${it.d} - ${formatBRL((Number(it.q) || 0) * (Number(it.v) || 0))}`
    );
    const saleTotal = calcSaleTotalAmount(sale);
    const parts = [
      `MicroLab · Venda nº ${sale.n}`,
      ...lines,
      ...(sale.desc > 0 ? [`Desconto: -${formatBRL(sale.desc)}`] : []),
      `Total: ${formatBRL(saleTotal)}`,
      `Forma: ${sale.forma}`,
      'WhatsApp (71) 99129-3552 · @microlabssa',
    ];
    return parts.join('\n');
  };

  const handleCopySaleReceipt = async (sale: SaleRecord) => {
    const text = buildSaleReceiptText(sale);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback silent
    }
    setCopiedSaleId(sale.id);
    setTimeout(() => setCopiedSaleId((prev) => (prev === sale.id ? null : prev)), 2000);
  };

  const handleConfirmSale = () => {
    if (cart.length === 0 || total <= 0) return;
    setFeedbackError('');
    const created = createPosSale({
      cli: selectedClientId || undefined,
      cliNome: selectedClientId ? undefined : walkInCustomerName.trim() || 'Consumidor Balcão',
      vend: selectedSeller.trim() || undefined,
      forma: effectivePaymentMethod,
      desc: discountVal,
      itens: cart.map((c) => ({
        p: c.item.stockPartId,
        d: c.item.name,
        q: c.qty,
        v: c.item.price,
      })),
    });

    if (!created) {
      setFeedbackError('Não foi possível registrar a venda. Verifique os itens do carrinho.');
      return;
    }

    const receivedNum = isCashMethod ? parseFloat(cashReceived.replace(',', '.')) || 0 : 0;
    const cashSummary =
      isCashMethod && receivedNum > 0
        ? { received: receivedNum, change: Math.max(0, receivedNum - total) }
        : null;

    setLastSale(created);
    setLastSaleCashInfo(cashSummary);
    setReceiptOpen(true);
    setCart([]);
    setDiscount('0');
    setCashReceived('');
  };

  const handlePrintHistorySale = (sale: SaleRecord, mode: 'a4' | 'thermal' = 'a4') => {
    setLastSale(sale);
    setLastSaleCashInfo(null);
    if (mode === 'thermal') {
      const width = state.cfg.thermalWidth === '58mm' ? '58mm' : '80mm';
      runWithThermalPrintMode(width, () => setPrintMode('thermal'));
    } else {
      setPrintMode('a4');
      window.setTimeout(() => {
        window.print();
      }, 60);
    }
  };

  const handlePrintReceiptModal = (mode: 'a4' | 'thermal') => {
    if (mode === 'thermal') {
      const width = state.cfg.thermalWidth === '58mm' ? '58mm' : '80mm';
      runWithThermalPrintMode(width, () => setPrintMode('thermal'));
    } else {
      setPrintMode('a4');
      window.setTimeout(() => {
        window.print();
      }, 60);
    }
  };

  const handleConfirmReverse = (saleId: string) => {
    const res = reversePosSale(saleId);
    if (!res.ok && res.error) {
      setFeedbackError(res.error);
    }
    setConfirmReverseId(null);
  };

  const resolveSaleClient = (sale: SaleRecord) => {
    const client = sale.cli ? state.clients.find((c) => c.id === sale.cli) : undefined;
    const label = client?.name || sale.cliNome || 'Balcão';
    const waPhone = toWaPhone(client?.phone);
    return { client, label, waPhone };
  };

  return (
    <>
    <div className="space-y-4 print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">PDV Rápido &amp; Caixa Balcão</h1>
          <p className="text-xs text-[#727784]">
            Venda expressa de peças do estoque ou itens avulsos com baixa automática e estorno integrado
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#D9E0EC] self-start">
          <button
            type="button"
            onClick={() => setActiveTab('pdv')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              activeTab === 'pdv' ? 'bg-[#0056ab] text-white' : 'text-[#414752] hover:bg-[#F3F6FB]'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Nova Venda</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              activeTab === 'historico'
                ? 'bg-[#0056ab] text-white'
                : 'text-[#414752] hover:bg-[#F3F6FB]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico ({state.vendas.length})</span>
          </button>
        </div>
      </div>

      {feedbackError && (
        <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{feedbackError}</span>
        </div>
      )}

      {activeTab === 'pdv' ? (
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
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.5 rounded tabular-nums">
                          {item.stock} un.
                        </span>
                        <span className="text-[10px] font-semibold text-[#0056ab] bg-[#EAF2FD] px-2 py-0.5 rounded">
                          {item.category}
                        </span>
                      </div>
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

            <div className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Cliente (opcional)
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  >
                    <option value="">Consumidor Balcão</option>
                    {state.clients.map((cli) => (
                      <option key={cli.id} value={cli.id}>
                        {cli.name}
                      </option>
                    ))}
                  </select>
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {!selectedClientId && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                      Identificação Balcão
                    </label>
                    <input
                      value={walkInCustomerName}
                      onChange={(e) => setWalkInCustomerName(e.target.value)}
                      placeholder="Consumidor Balcão"
                      className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                    />
                  </div>
                )}
                <div className={selectedClientId ? 'sm:col-span-2' : ''}>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1.5">
                Forma de Pagamento
              </label>
              <div className="grid grid-cols-2 gap-2">
                {paymentOptions.map((pm) => {
                  const lower = pm.toLowerCase();
                  const Icon = lower.includes('pix')
                    ? QrCode
                    : lower.includes('dinheiro')
                    ? Banknote
                    : CreditCard;
                  const active = effectivePaymentMethod === pm;
                  return (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                        active
                          ? 'bg-[#EAF2FD] border-[#0056ab] text-[#0056ab]'
                          : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{pm}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isPixMethod && total > 0 && (
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

            {isCashMethod && (
              <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC] grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[10px] font-semibold text-[#727784] mb-1">Valor Recebido (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
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
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC]">
            <div className="relative">
              <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar venda por número, cliente, vendedor, forma ou item..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs text-[#091b36]"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {sortedSales.map((sale) => {
              const { label: clientLabel, waPhone } = resolveSaleClient(sale);
              const saleTotal = calcSaleTotalAmount(sale);
              const isReversed = sale.st === 'Estornada';
              const receiptMsg = encodeURIComponent(buildSaleReceiptText(sale));
              const waUrl = waPhone
                ? `https://wa.me/${waPhone}?text=${receiptMsg}`
                : `https://wa.me/?text=${receiptMsg}`;

              return (
                <div
                  key={sale.id}
                  className={`rounded-2xl bg-white p-4 border transition-colors space-y-3 ${
                    isReversed ? 'border-[#D9E0EC] opacity-80' : 'border-[#D9E0EC]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-[#091b36]">
                          Venda nº {sale.n} · {clientLabel}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isReversed
                              ? 'bg-[#F3F6FB] text-[#727784] border border-[#D9E0EC]'
                              : 'bg-[#DCFCE7] text-[#16A34A]'
                          }`}
                        >
                          {isReversed ? 'Estornada' : 'Paga'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#727784]">
                        {formatDateBR(sale.data)} · {sale.forma}
                        {sale.vend ? ` · Vend.: ${sale.vend}` : ''}
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span
                        className={`text-base font-bold tabular-nums ${
                          isReversed ? 'line-through text-[#727784]' : 'text-[#091b36]'
                        }`}
                      >
                        {formatBRL(saleTotal)}
                      </span>
                      {sale.desc > 0 && (
                        <p className="text-[10px] text-[#727784] tabular-nums">
                          Desconto: {formatBRL(sale.desc)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#F3F6FB] px-3 py-2 border border-[#D9E0EC]/70 space-y-1">
                    {sale.itens.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] text-[#414752]">
                        <span className="truncate">
                          <strong>{it.q}x</strong> {it.d}
                        </span>
                        <span className="font-semibold text-[#091b36] tabular-nums shrink-0 ml-2">
                          {formatBRL(it.q * it.v)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-bold text-[#16A34A] hover:bg-[#bbf7d0]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handlePrintHistorySale(sale, 'a4')}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0EC] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Recibo A4</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintHistorySale(sale, 'thermal')}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0EC] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0056ab] hover:bg-[#EAF2FD] cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cupom ({state.cfg.thermalWidth === '58mm' ? '58mm' : '80mm'})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopySaleReceipt(sale)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0EC] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
                    >
                      {copiedSaleId === sale.id ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedSaleId === sale.id ? 'Copiado!' : 'Copiar Recibo'}</span>
                    </button>
                    {!isReversed && confirmReverseId !== sale.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmReverseId(sale.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] px-3 py-1.5 text-[11px] font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Estornar</span>
                      </button>
                    )}
                  </div>

                  {!isReversed && confirmReverseId === sale.id && (
                    <div className="rounded-xl border border-[#DC2626]/30 bg-[#FEF2F2] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-[#991B1B]">
                        Estornar venda nº {sale.n}? Devolve itens ao estoque e lança saída no caixa.
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmReverseId(null)}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#414752] cursor-pointer"
                        >
                          Não
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmReverse(sale.id)}
                          className="rounded-lg bg-[#DC2626] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#B91C1C] cursor-pointer"
                        >
                          Sim, Estornar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {sortedSales.length === 0 && (
              <div className="rounded-2xl bg-white p-8 border border-[#D9E0EC] text-center text-xs text-[#727784]">
                {state.vendas.length === 0
                  ? 'Nenhuma venda registrada no PDV ainda.'
                  : 'Nenhuma venda encontrada para a busca atual.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptOpen && lastSale && (
        <div
          data-modal-open="true"
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
            <h3 className="text-base font-bold text-[#091b36]">
              Venda nº {lastSale.n} Confirmada no Caixa!
            </h3>
            <p className="text-xs text-[#414752]">
              Recebimento de{' '}
              <strong className="tabular-nums">{formatBRL(calcSaleTotalAmount(lastSale))}</strong> via{' '}
              <strong>{lastSale.forma}</strong> registrado para{' '}
              {resolveSaleClient(lastSale).label}.
            </p>
            {lastSaleCashInfo && (
              <p className="text-[11px] text-[#16A34A] font-semibold tabular-nums">
                Recebido: {formatBRL(lastSaleCashInfo.received)} · Troco:{' '}
                {formatBRL(lastSaleCashInfo.change)}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={(() => {
                  const { waPhone } = resolveSaleClient(lastSale);
                  const msg = encodeURIComponent(buildSaleReceiptText(lastSale));
                  return waPhone ? `https://wa.me/${waPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
                })()}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#DCFCE7] py-2.5 px-3 text-xs font-bold text-[#16A34A] hover:bg-[#bbf7d0]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={() => handlePrintReceiptModal('a4')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D9E0EC] py-2.5 px-3 text-xs font-semibold text-[#091b36] cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Recibo A4</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintReceiptModal('thermal')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#0056ab]/30 bg-[#EAF2FD] py-2.5 px-3 text-xs font-semibold text-[#0056ab] cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cupom {state.cfg.thermalWidth === '58mm' ? '58mm' : '80mm'}</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="w-full rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Nova Venda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Layout Dedicado de Impressão do Recibo PDV (A4 ou Cupom Térmico) */}
    {lastSale && printMode === 'a4' && (
      <section
        id="print-pos-receipt"
        className="hidden print:block bg-white text-black text-[11px] leading-snug max-w-md mx-auto p-2"
      >
        <div className="flex items-start justify-between border-b-2 border-black pb-2.5 mb-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/pwa-192x192.png"
              alt="MicroLab"
              className="w-10 h-10 rounded-lg object-cover shrink-0 border border-black/20"
            />
            <div>
              <div className="text-sm font-extrabold tracking-tight">MicroLab</div>
              <div className="text-[9px] uppercase tracking-wider">Assistência Técnica &amp; Balcão</div>
            </div>
          </div>
          <div className="text-right text-[9px]">
            <div>WhatsApp (71) 99129-3552</div>
            <div>Instagram @microlabssa</div>
            <div>Impresso em {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
        </div>

        <h1 className="text-center text-xs font-extrabold uppercase border border-black py-1 mb-2.5">
          COMPROVANTE DE VENDA Nº {lastSale.n}
          {lastSale.st === 'Estornada' ? ' (ESTORNADA)' : ''}
        </h1>

        <div className="grid grid-cols-2 border border-black text-[10px] mb-3">
          <div className="p-1.5 border-r border-b border-black">
            <span className="block text-[9px] uppercase text-gray-600">Cliente</span>
            <strong>{resolveSaleClient(lastSale).label}</strong>
          </div>
          <div className="p-1.5 border-b border-black">
            <span className="block text-[9px] uppercase text-gray-600">Data</span>
            <strong>{formatDateBR(lastSale.data)}</strong>
          </div>
          <div className="p-1.5 border-r border-black">
            <span className="block text-[9px] uppercase text-gray-600">Forma de Pagamento</span>
            <strong>{lastSale.forma}</strong>
          </div>
          <div className="p-1.5">
            <span className="block text-[9px] uppercase text-gray-600">Vendedor</span>
            <strong>{lastSale.vend || 'Balcão'}</strong>
          </div>
        </div>

        <table className="w-full border-collapse border border-black text-[10px] mb-3">
          <thead>
            <tr className="border-b border-black bg-gray-100">
              <th className="text-left p-1 border-r border-black">Item</th>
              <th className="text-right p-1 border-r border-black w-10">Qtd</th>
              <th className="text-right p-1 border-r border-black w-20">Unit.</th>
              <th className="text-right p-1 w-20">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lastSale.itens.map((it, idx) => (
              <tr key={idx} className="border-b border-black">
                <td className="p-1 border-r border-black">{it.d}</td>
                <td className="p-1 border-r border-black text-right tabular-nums">{it.q}</td>
                <td className="p-1 border-r border-black text-right tabular-nums">
                  {formatBRL(it.v)}
                </td>
                <td className="p-1 text-right tabular-nums">
                  {formatBRL((Number(it.q) || 0) * (Number(it.v) || 0))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {lastSale.desc > 0 && (
              <>
                <tr className="border-b border-black">
                  <td colSpan={3} className="p-1 border-r border-black text-right">
                    Subtotal
                  </td>
                  <td className="p-1 text-right tabular-nums">
                    {formatBRL(calcSaleTotalAmount(lastSale) + lastSale.desc)}
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td colSpan={3} className="p-1 border-r border-black text-right">
                    Desconto
                  </td>
                  <td className="p-1 text-right tabular-nums">- {formatBRL(lastSale.desc)}</td>
                </tr>
              </>
            )}
            <tr className="font-bold bg-gray-100 border-b border-black">
              <td colSpan={3} className="p-1.5 border-r border-black text-right">
                TOTAL PAGO
              </td>
              <td className="p-1.5 text-right tabular-nums">
                {formatBRL(calcSaleTotalAmount(lastSale))}
              </td>
            </tr>
            {lastSaleCashInfo && (
              <>
                <tr className="border-b border-black">
                  <td colSpan={3} className="p-1 border-r border-black text-right">
                    Valor Recebido em Dinheiro
                  </td>
                  <td className="p-1 text-right tabular-nums">
                    {formatBRL(lastSaleCashInfo.received)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="p-1 border-r border-black text-right font-bold">
                    Troco
                  </td>
                  <td className="p-1 text-right font-bold tabular-nums">
                    {formatBRL(lastSaleCashInfo.change)}
                  </td>
                </tr>
              </>
            )}
          </tfoot>
        </table>

        <p className="text-center text-[9px] text-gray-600 pt-2 border-t border-dashed border-black">
          Comprovante sem valor fiscal · Garantia legal de 90 dias (CDC) · MicroLab OS
        </p>
      </section>
    )}
    {lastSale && printMode === 'thermal' && (
      <PosThermalReceipt
        sale={lastSale}
        cfg={state.cfg}
        clientLabel={resolveSaleClient(lastSale).label}
        pixMerchant={state.labProfile.pixMerchant}
        pixCity={state.labProfile.pixCity}
        cashInfo={lastSaleCashInfo}
      />
    )}
    </>
  );
};
