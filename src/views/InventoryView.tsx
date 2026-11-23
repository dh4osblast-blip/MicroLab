import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Edit3,
  Minus,
  Package,
  Percent,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { PartItem, PurchaseItem } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  calcInventoryTurnover90d,
  formatStockQty,
  getPartExpiryStatus,
  isLowStock,
  margemPctPeca,
  precoVendaPeca,
  roundCurrency3,
  roundStockQty,
} from '../utils/pricing';
import { PurchaseOrderModal } from '../components/PurchaseOrderModal';

export const InventoryView: React.FC<{ onGoSuppliers: () => void }> = ({ onGoSuppliers }) => {
  const {
    state,
    addPart,
    updatePart,
    deletePart,
    adjustPartStock,
    batchReadjustParts,
  } = useLabStore();

  const [viewTab, setViewTab] = useState<'estoque' | 'giro'>('estoque');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('Todas');

  // Add / Edit Part Modal
  const [showPartModal, setShowPartModal] = useState(false);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [pSku, setPSku] = useState('');
  const [pName, setPName] = useState('');
  const [pCat, setPCat] = useState<PartItem['category']>('CIs SMD & PMICs');
  const [pComp, setPComp] = useState('');
  const [pLoc, setPLoc] = useState('Gaveteiro A');
  const [pStock, setPStock] = useState('1');
  const [pMin, setPMin] = useState('1');
  const [pCost, setPCost] = useState('0');
  const [pSell, setPSell] = useState('0');
  const [pUnit, setPUnit] = useState('un');
  const [pExpiryDate, setPExpiryDate] = useState('');
  const [pFracConsumption, setPFracConsumption] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Batch readjust (`reaj`) modal
  const [showReadjustModal, setShowReadjustModal] = useState(false);
  const [reajMode, setReajMode] = useState<'percent' | 'curve'>('percent');
  const [reajPct, setReajPct] = useState('0');
  const [reajField, setReajField] = useState<'sellPrice' | 'costPrice'>('sellPrice');
  const [reajRound, setReajRound] = useState(true);
  const [reajConfirming, setReajConfirming] = useState(false);

  // Replenishment purchase order (`cpForm(true)`)
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [replenishItems, setReplenishItems] = useState<PurchaseItem[]>([]);
  const [toastMsg, setToastMsg] = useState<{ text: string; action?: 'suppliers' } | null>(null);

  const criticalParts = useMemo(() => state.parts.filter((p) => isLowStock(p)), [state.parts]);
  const expiringParts = useMemo(
    () =>
      state.parts
        .map((p) => ({ part: p, exp: getPartExpiryStatus(p.expiryDate) }))
        .filter((x) => x.exp.status === 'expired' || x.exp.status === 'expiring30')
        .sort((a, b) => (a.exp.daysRemaining ?? 999) - (b.exp.daysRemaining ?? 999)),
    [state.parts]
  );
  const totalInventoryCost = useMemo(
    () => state.parts.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0),
    [state.parts]
  );
  const totalPotentialSale = useMemo(
    () => state.parts.reduce((s, p) => s + Math.max(0, p.stock) * p.sellPrice, 0),
    [state.parts]
  );

  const turnover90 = useMemo(
    () => calcInventoryTurnover90d(state.parts, state.orders, state.vendas),
    [state.parts, state.orders, state.vendas]
  );

  const filtered = state.parts.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.compatibility.toLowerCase().includes(q);
    const matchesCat = catFilter === 'Todas' || p.category === catFilter;
    return matchesQ && matchesCat;
  });

  const openAddModal = () => {
    setEditingPartId(null);
    setPSku('');
    setPName('');
    setPCat('CIs SMD & PMICs');
    setPComp('');
    setPLoc('Gaveteiro A');
    setPStock('1');
    setPMin('1');
    setPCost('0');
    setPSell('0');
    setPUnit('un');
    setPExpiryDate('');
    setPFracConsumption('');
    setShowPartModal(true);
  };

  const openEditModal = (p: PartItem) => {
    setEditingPartId(p.id);
    setPSku(p.sku);
    setPName(p.name);
    setPCat(p.category);
    setPComp(p.compatibility);
    setPLoc(p.location);
    setPStock(String(p.stock));
    setPMin(String(p.minStock));
    setPCost(String(p.costPrice));
    setPSell(String(p.sellPrice));
    setPUnit(p.unit || 'un');
    setPExpiryDate(p.expiryDate || '');
    setPFracConsumption(p.fractionalConsumptionPerOs ? String(p.fractionalConsumptionPerOs) : '');
    setShowPartModal(true);
  };

  const handleCostChange = (val: string) => {
    setPCost(val);
    const num = parseFloat(val.replace(',', '.'));
    if (!Number.isNaN(num) && num > 0) {
      setPSell(precoVendaPeca(num, state.cfg.margem, state.cfg.arred).toFixed(2));
    }
  };

  const handleOpenReplenishment = () => {
    if (criticalParts.length === 0) {
      setToastMsg({ text: 'Nenhum item abaixo do estoque mínimo no momento.' });
      setTimeout(() => setToastMsg(null), 3500);
      return;
    }
    setReplenishItems(
      criticalParts.map((p) => ({
        p: p.id,
        d: p.name,
        q: roundStockQty(Math.max((p.minStock || 0) - (p.stock || 0), 1)),
        v: Number(p.costPrice) || 0,
      }))
    );
    setPurchaseModalOpen(true);
  };

  const handleSavePart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;
    const costVal = roundCurrency3(Math.max(0, parseFloat(pCost.replace(',', '.')) || 0));
    const sellVal = Math.max(
      0,
      parseFloat(pSell.replace(',', '.')) || (costVal > 0 ? precoVendaPeca(costVal, state.cfg.margem, state.cfg.arred) : 0)
    );
    const stockNum = roundStockQty(Math.max(0, parseFloat(pStock.replace(',', '.')) || 0));
    const minNum = roundStockQty(Math.max(0, parseFloat(pMin.replace(',', '.')) || 0));
    const fracRaw = parseFloat(pFracConsumption.replace(',', '.')) || 0;
    const fracNum = fracRaw > 0 ? roundStockQty(fracRaw) : undefined;
    const cleanUnit = pUnit.trim() || undefined;
    const cleanExpiry = pExpiryDate.trim() || undefined;

    if (editingPartId) {
      updatePart(editingPartId, {
        sku: pSku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
        name: pName.trim(),
        category: pCat,
        compatibility: pComp.trim() || 'Universal',
        location: pLoc.trim() || 'Gaveteiro',
        stock: stockNum,
        minStock: minNum,
        costPrice: costVal,
        sellPrice: sellVal,
        unit: cleanUnit,
        expiryDate: cleanExpiry,
        fractionalConsumptionPerOs: fracNum,
      });
    } else {
      addPart({
        sku: pSku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
        name: pName.trim(),
        category: pCat,
        compatibility: pComp.trim() || 'Universal',
        location: pLoc.trim() || 'Gaveteiro',
        stock: stockNum,
        minStock: minNum,
        costPrice: costVal,
        sellPrice: sellVal,
        unit: cleanUnit,
        expiryDate: cleanExpiry,
        fractionalConsumptionPerOs: fracNum,
        reservedOs: 0,
      });
    }
    setShowPartModal(false);
    setEditingPartId(null);
  };

  const handleApplyReadjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.parts.length === 0) return;
    const pct = parseFloat(reajPct.replace(',', '.')) || 0;
    if (reajMode === 'percent' && pct === 0) return;
    if (!reajConfirming) {
      setReajConfirming(true);
      return;
    }
    if (reajMode === 'curve') {
      batchReadjustParts({
        mode: 'curve',
        applyRounding: reajRound,
      });
      setShowReadjustModal(false);
      setReajConfirming(false);
      setToastMsg({
        text: `Preços de venda recalculados pela curva oficial da loja em ${state.parts.length} itens.`,
      });
      setTimeout(() => setToastMsg(null), 3500);
      return;
    }

    batchReadjustParts({
      mode: 'percent',
      percent: pct,
      field: reajField,
      applyRounding: reajField === 'sellPrice' && reajRound,
    });
    setShowReadjustModal(false);
    setReajConfirming(false);
    setReajPct('0');
    setToastMsg({
      text: `Reajuste de ${pct > 0 ? `+${pct}` : pct}% aplicado em ${state.parts.length} itens.`,
    });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const statusBadge = (st: PartItem['status']) => {
    switch (st) {
      case 'Disponível':
        return 'bg-[#DCFCE7] text-[#16A34A]';
      case 'Alerta Reposição':
        return 'bg-[#FFF7E6] text-[#D97706]';
      case 'Esgotado':
        return 'bg-[#FEE2E2] text-[#DC2626]';
      default:
        return 'bg-[#EAF2FD] text-[#0056ab]';
    }
  };

  const pendingPurchasesCount = state.compras.filter((c) => c.st === 'A caminho').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Produtos &amp; Peças SMD</h1>
          <p className="text-xs text-[#727784]">
            Baixa automática na entrega da OS, custo médio ponderado, reajuste em lote e giro 90 dias
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setReajConfirming(false);
              setShowReadjustModal(true);
            }}
            disabled={state.parts.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Percent className="w-3.5 h-3.5 text-[#0056ab]" />
            <span>Reajustar preços</span>
          </button>
          <button
            type="button"
            onClick={handleOpenReplenishment}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-[#D97706]" />
            <span>Reposição</span>
          </button>
          <button
            type="button"
            onClick={onGoSuppliers}
            className="rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            Pedidos &amp; Fornecedores{pendingPurchasesCount > 0 ? ` (${pendingPurchasesCount})` : ''}
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Peça</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">SKUs Cadastrados</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">{state.parts.length}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Abaixo do Mínimo</span>
          <span className="text-xl font-bold text-[#D97706] tabular-nums">{criticalParts.length}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Capital em Estoque (Custo)</span>
          <span className="text-xl font-bold text-[#091b36] tabular-nums">{formatBRL(totalInventoryCost)}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Potencial de Venda</span>
          <span className="text-xl font-bold text-[#16A34A] tabular-nums">{formatBRL(totalPotentialSale)}</span>
        </div>
      </div>

      {/* Smart Reorder Banner */}
      {criticalParts.length > 0 && (
        <div className="rounded-2xl bg-[#FFF7E6] border border-[#D97706]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[#091b36]">
                {criticalParts.length} {criticalParts.length === 1 ? 'item abaixo' : 'itens abaixo'} do estoque mínimo de segurança
              </p>
              <p className="text-[11px] text-[#414752]">
                {criticalParts
                  .map((p) => `${p.name} (${formatStockQty(p.stock, p.unit)}/${formatStockQty(p.minStock, p.unit)})`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenReplenishment}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D97706] text-white px-3.5 py-2 text-xs font-semibold hover:bg-[#b45309] cursor-pointer whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Gerar Pedido de Reposição</span>
          </button>
        </div>
      )}

      {/* Expiry Alert Banner (Insumos vencidos ou vencendo em 30 dias) */}
      {expiringParts.length > 0 && (
        <div
          className={`rounded-2xl p-4 border flex items-start gap-2.5 ${
            expiringParts.some((x) => x.exp.status === 'expired')
              ? 'bg-[#FEF2F2] border-[#DC2626]/35'
              : 'bg-[#FFF7E6] border-[#D97706]/35'
          }`}
        >
          <AlertTriangle
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              expiringParts.some((x) => x.exp.status === 'expired')
                ? 'text-[#DC2626]'
                : 'text-[#D97706]'
            }`}
          />
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#091b36]">
              Alerta de Validade ({expiringParts.length}{' '}
              {expiringParts.length === 1 ? 'insumo' : 'insumos'})
            </p>
            <p className="text-[11px] text-[#414752]">
              {expiringParts.map(({ part, exp }) => `${part.name} · ${exp.label}`).join(' | ')}
            </p>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-4 py-2.5 text-xs font-semibold text-[#16A34A] flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMsg.text}</span>
          </span>
          {toastMsg.action === 'suppliers' && (
            <button
              type="button"
              onClick={onGoSuppliers}
              className="rounded-lg bg-white border border-[#16A34A]/30 px-2.5 py-1 text-[11px] font-bold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer"
            >
              Ver Pedidos de Compra
            </button>
          )}
        </div>
      )}

      {/* Sub-tabs: Estoque | Giro 90 dias */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 rounded-2xl bg-white p-3.5 border border-[#D9E0EC]">
        <div className="inline-flex items-center gap-1 bg-[#F3F6FB] p-1 rounded-xl border border-[#D9E0EC] self-start">
          <button
            type="button"
            onClick={() => setViewTab('estoque')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              viewTab === 'estoque' ? 'bg-white text-[#0056ab] shadow-xs' : 'text-[#414752]'
            }`}
          >
            Itens em Estoque ({state.parts.length})
          </button>
          <button
            type="button"
            onClick={() => setViewTab('giro')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
              viewTab === 'giro' ? 'bg-white text-[#0056ab] shadow-xs' : 'text-[#414752]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Giro de Estoque (90d)</span>
          </button>
        </div>

        {viewTab === 'estoque' && (
          <div className="flex flex-col sm:flex-row gap-2 flex-1 md:max-w-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar SKU, modelo compatível ou gaveta..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs"
              />
            </div>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium"
            >
              <option value="Todas">Todas Categorias</option>
              <option value="Telas LCD/OLED">Telas LCD/OLED</option>
              <option value="Baterias Originais/OEM">Baterias Originais/OEM</option>
              <option value="Conectores FPC & Carga">Conectores FPC &amp; Carga</option>
              <option value="CIs SMD & PMICs">CIs SMD &amp; PMICs</option>
              <option value="Insumos de Solda">Insumos de Solda</option>
            </select>
          </div>
        )}
      </div>

      {viewTab === 'estoque' ? (
        <div className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#D9E0EC] bg-[#F3F6FB] text-[11px] font-semibold text-[#727784]">
                  <th className="py-3 px-4">Peça / Compatibilidade</th>
                  <th className="py-3 px-3">Gaveta</th>
                  <th className="py-3 px-3">Custo / Venda</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-center">Saldo &amp; Ajuste</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E0EC] text-xs">
                {filtered.map((p) => {
                  const ratio = Math.min(100, Math.round((p.stock / Math.max(0.001, p.minStock * 2)) * 100));
                  const autoCurvePrice = precoVendaPeca(p.costPrice, state.cfg.margem, state.cfg.arred);
                  const isManualPrice =
                    p.costPrice > 0 && p.sellPrice > 0 && Math.abs(p.sellPrice - autoCurvePrice) >= 0.01;
                  const exp = getPartExpiryStatus(p.expiryDate);
                  const adjustStep =
                    p.fractionalConsumptionPerOs && p.fractionalConsumptionPerOs > 0
                      ? p.fractionalConsumptionPerOs
                      : 1;
                  return (
                    <tr key={p.id} className="hover:bg-[#F3F6FB]/60">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-[#0056ab] shrink-0" />
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-bold text-[#091b36]">{p.name}</p>
                              {p.fractionalConsumptionPerOs && p.fractionalConsumptionPerOs > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-semibold tabular-nums">
                                  −{formatStockQty(p.fractionalConsumptionPerOs, p.unit)}/OS
                                </span>
                              )}
                              {exp.status !== 'none' && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    exp.status === 'expired'
                                      ? 'bg-[#FEE2E2] text-[#DC2626]'
                                      : exp.status === 'expiring30'
                                      ? 'bg-[#FFF7E6] text-[#D97706]'
                                      : 'bg-[#F3F6FB] text-[#414752]'
                                  }`}
                                >
                                  <Calendar className="w-2.5 h-2.5" />
                                  <span>{exp.label}</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#727784]">
                              <span className="font-mono">{p.sku}</span> · {p.compatibility} · Mín:{' '}
                              {formatStockQty(p.minStock, p.unit)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[#414752]">{p.location}</td>
                      <td className="py-3 px-3 tabular-nums">
                        <div className="text-[11px] text-[#727784]">Custo: {formatBRL(p.costPrice)}</div>
                        <div className="font-bold text-[#091b36] flex items-center gap-1">
                          <span>Venda: {formatBRL(p.sellPrice)}</span>
                          {isManualPrice && (
                            <span
                              title="Preço ajustado manualmente (preservado no recebimento de compras)"
                              className="px-1 py-0.2 rounded bg-[#F3F6FB] border border-[#D9E0EC] text-[9px] font-semibold text-[#727784]"
                            >
                              Manual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${statusBadge(
                            p.status
                          )}`}
                        >
                          {p.status}
                        </span>
                        <div className="w-24 h-1.5 bg-[#F3F6FB] rounded-full mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              p.stock === 0
                                ? 'bg-[#DC2626]'
                                : isLowStock(p)
                                ? 'bg-[#D97706]'
                                : 'bg-[#16A34A]'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustPartStock(p.id, -adjustStep)}
                            title={`Subtrair ${formatStockQty(adjustStep, p.unit)}`}
                            className="w-7 h-7 rounded-lg border border-[#D9E0EC] bg-white flex items-center justify-center hover:bg-[#F3F6FB] cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="min-w-12 text-center font-bold text-[#091b36] tabular-nums">
                            {formatStockQty(p.stock, p.unit)}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustPartStock(p.id, adjustStep)}
                            title={`Somar ${formatStockQty(adjustStep, p.unit)}`}
                            className="w-7 h-7 rounded-lg border border-[#D9E0EC] bg-white flex items-center justify-center hover:bg-[#F3F6FB] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Editar peça"
                            className="p-1.5 rounded-lg border border-[#D9E0EC] bg-white text-[#414752] hover:bg-[#EAF2FD] hover:text-[#0056ab] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteId === p.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  deletePart(p.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded-lg bg-[#DC2626] text-[10px] font-bold text-white cursor-pointer"
                              >
                                Excluir
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-1 rounded-lg border border-[#D9E0EC] bg-white text-[10px] text-[#414752] cursor-pointer"
                              >
                                Não
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              title="Excluir peça"
                              className="p-1.5 rounded-lg border border-[#D9E0EC] bg-white text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 px-4 text-center text-xs text-[#727784]">
                      {state.parts.length === 0
                        ? 'Nenhuma peça cadastrada ainda. Clique em "Nova Peça" para iniciar seu estoque técnico.'
                        : 'Nenhuma peça encontrada com os filtros atuais.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Giro de Estoque (90 dias) */
        <div className="rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#091b36]">Giro do Estoque (Últimos 90 dias)</h2>
              <p className="text-[11px] text-[#727784]">
                Considera peças baixadas em OS Entregues e vendas não estornadas nos últimos 90 dias.
              </p>
            </div>
            <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3 py-1.5 text-xs">
              Valor parado em custo:{' '}
              <strong className="text-[#091b36] tabular-nums">
                {formatBRL(turnover90.totalStockCost)}
              </strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#D9E0EC] bg-[#F3F6FB] text-[11px] font-semibold text-[#727784]">
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3 text-right">Em estoque</th>
                  <th className="py-2.5 px-3 text-right">Mínimo</th>
                  <th className="py-2.5 px-3 text-right">Saíram (90d)</th>
                  <th className="py-2.5 px-3 text-right">Dura cerca de</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E0EC] text-xs">
                {turnover90.rows.map(({ part, sold90d, estimatedDaysRemaining }) => (
                  <tr key={part.id} className="hover:bg-[#F3F6FB]/50">
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-[#091b36]">{part.name}</span>
                      <span className="ml-2 text-[10px] font-mono text-[#727784]">{part.sku}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold tabular-nums">{part.stock}</td>
                    <td className="py-2.5 px-3 text-right text-[#727784] tabular-nums">
                      {part.minStock || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#0056ab] tabular-nums">
                      {sold90d}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {estimatedDaysRemaining === null ? (
                        <span className="text-[#727784]">sem saída</span>
                      ) : (
                        <span
                          className={`font-bold ${
                            estimatedDaysRemaining <= 15
                              ? 'text-[#DC2626]'
                              : estimatedDaysRemaining <= 30
                              ? 'text-[#D97706]'
                              : 'text-[#16A34A]'
                          }`}
                        >
                          {estimatedDaysRemaining} dias
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {turnover90.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#727784]">
                      Nenhum item no estoque.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Part Modal */}
      {showPartModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowPartModal(false)}
        >
          <form
            onSubmit={handleSavePart}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">
                {editingPartId ? 'Editar Peça / Insumo' : 'Cadastrar Peça / Insumo'}
              </h3>
              <button
                type="button"
                onClick={() => setShowPartModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">SKU</label>
                <input
                  value={pSku}
                  onChange={(e) => setPSku(e.target.value)}
                  placeholder="IC-PMIC-99"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Categoria</label>
                <select
                  value={pCat}
                  onChange={(e) => setPCat(e.target.value as PartItem['category'])}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-2 text-xs"
                >
                  <option value="CIs SMD & PMICs">CIs SMD &amp; PMICs</option>
                  <option value="Telas LCD/OLED">Telas LCD/OLED</option>
                  <option value="Baterias Originais/OEM">Baterias Originais/OEM</option>
                  <option value="Conectores FPC & Carga">Conectores FPC &amp; Carga</option>
                  <option value="Insumos de Solda">Insumos de Solda</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Nome do Componente *
              </label>
              <input
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Compatibilidade
                </label>
                <input
                  value={pComp}
                  onChange={(e) => setPComp(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Gaveta / Local
                </label>
                <input
                  value={pLoc}
                  onChange={(e) => setPLoc(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Qtd</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={pStock}
                  onChange={(e) => setPStock(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Mín</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={pMin}
                  onChange={(e) => setPMin(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Custo R$</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={pCost}
                  onChange={(e) => handleCostChange(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Venda R$</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pSell}
                  onChange={(e) => setPSell(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Unidade</label>
                <select
                  value={pUnit}
                  onChange={(e) => setPUnit(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-2 text-xs"
                >
                  <option value="un">un (unidade)</option>
                  <option value="g">g (gramas)</option>
                  <option value="ml">ml (mililitros)</option>
                  <option value="seringa">seringa</option>
                  <option value="rolo">rolo</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Validade</label>
                <input
                  type="date"
                  value={pExpiryDate}
                  onChange={(e) => setPExpiryDate(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-2 text-xs"
                />
              </div>
              <div>
                <label
                  className="block text-[10px] font-semibold text-[#414752] mb-1"
                  title="Quantidade descontada automaticamente do estoque a cada OS entregue"
                >
                  Consumo / OS
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={pFracConsumption}
                  onChange={(e) => setPFracConsumption(e.target.value)}
                  placeholder="0 (manual)"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#0056ab] bg-[#EAF2FD]/70 border border-[#D9E0EC] rounded-lg px-2.5 py-1.5 tabular-nums">
              Margem da curva ({state.cfg.margem.limite}):{' '}
              <strong>{margemPctPeca(parseFloat(pCost) || 0, state.cfg.margem).toFixed(1)}%</strong> ·
              Sugestão:{' '}
              <strong>
                {formatBRL(
                  precoVendaPeca(parseFloat(pCost) || 0, state.cfg.margem, state.cfg.arred)
                )}
              </strong>
              . Alterações manuais no preço são preservadas em futuras compras.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPartModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Salvar Peça
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Batch Readjustment Modal (`reaj`) */}
      {showReadjustModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowReadjustModal(false)}
        >
          <form
            onSubmit={handleApplyReadjust}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Reajuste de Preços em Lote</h3>
              <button
                type="button"
                onClick={() => setShowReadjustModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-[#F3F6FB] p-1 rounded-xl border border-[#D9E0EC]">
              <button
                type="button"
                onClick={() => {
                  setReajMode('percent');
                  setReajConfirming(false);
                }}
                className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  reajMode === 'percent' ? 'bg-white text-[#0056ab] shadow-xs' : 'text-[#414752]'
                }`}
              >
                Reajuste %
              </button>
              <button
                type="button"
                onClick={() => {
                  setReajMode('curve');
                  setReajField('sellPrice');
                  setReajConfirming(false);
                }}
                className={`py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  reajMode === 'curve' ? 'bg-white text-[#0056ab] shadow-xs' : 'text-[#414752]'
                }`}
              >
                Curva da Loja
              </button>
            </div>

            {reajMode === 'percent' ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Percentual (%, negativo reduz)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={reajPct}
                    onChange={(e) => {
                      setReajPct(e.target.value);
                      setReajConfirming(false);
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Aplicar em
                  </label>
                  <select
                    value={reajField}
                    onChange={(e) => {
                      setReajField(e.target.value as 'sellPrice' | 'costPrice');
                      setReajConfirming(false);
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                  >
                    <option value="sellPrice">Preço de venda</option>
                    <option value="costPrice">Custo</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-[#EAF2FD]/70 border border-[#0056ab]/25 p-3 text-[11px] text-[#091b36] leading-relaxed">
                Recalcula o <strong>Preço de Venda</strong> de todas as peças com custo &gt; R$ 0,00 usando a curva oficial da loja (limite {formatBRL(state.cfg.margem.limite)} · {state.cfg.margem.baixaMax}%→{state.cfg.margem.baixaMin}% / {state.cfg.margem.altaMax}%→{state.cfg.margem.altaMin}%).
              </div>
            )}

            {(reajMode === 'curve' || reajField === 'sellPrice') && (
              <label className="flex items-center gap-2 text-xs text-[#414752] cursor-pointer">
                <input
                  type="checkbox"
                  checked={reajRound}
                  onChange={(e) => setReajRound(e.target.checked)}
                />
                <span>
                  Preservar arredondamento da loja (R$ {state.cfg.arred.baixo} / R$ {state.cfg.arred.alto})
                </span>
              </label>
            )}

            <p className="text-[11px] text-[#727784]">
              Vale para todos os {state.parts.length} itens do estoque. Recomendado fazer backup antes.
            </p>

            {reajConfirming && (
              <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-2.5 text-xs font-semibold text-[#92400E]">
                {reajMode === 'curve'
                  ? `Confirmar recálculo do Preço de Venda pela curva oficial em ${state.parts.length} itens?`
                  : `Confirmar reajuste de ${reajPct}% em ${state.parts.length} itens (${reajField === 'sellPrice' ? 'Preço de venda' : 'Custo'})?`}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (reajConfirming) setReajConfirming(false);
                  else setShowReadjustModal(false);
                }}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                {reajConfirming ? 'Voltar' : 'Cancelar'}
              </button>
              <button
                type="submit"
                disabled={reajMode === 'percent' && (parseFloat(reajPct) || 0) === 0}
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
              >
                {reajConfirming ? 'Sim, Aplicar' : 'Revisar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Replenishment Purchase Order Modal (`cpForm(true)`) */}
      <PurchaseOrderModal
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        initialItems={replenishItems}
        title="Pedido de Reposição de Estoque Mínimo"
        onCreated={(purchase) => {
          setToastMsg({
            text: `Pedido nº ${purchase.n} criado (A caminho) com ${purchase.itens.length} itens.`,
            action: 'suppliers',
          });
        }}
      />
    </div>
  );
};
