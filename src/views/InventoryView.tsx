import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import { PartItem } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import { margemPctPeca, precoVendaPeca } from '../utils/pricing';

export const InventoryView: React.FC<{ onGoSuppliers: () => void }> = ({ onGoSuppliers }) => {
  const { state, addPart, adjustPartStock, recordRestockOrder } = useLabStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('Todas');
  const [showAddModal, setShowAddModal] = useState(false);
  const [reorderToast, setReorderToast] = useState(false);

  // Add part fields
  const [pSku, setPSku] = useState('');
  const [pName, setPName] = useState('');
  const [pCat, setPCat] = useState<PartItem['category']>('CIs SMD & PMICs');
  const [pComp, setPComp] = useState('');
  const [pLoc, setPLoc] = useState('Gaveteiro A');
  const [pStock, setPStock] = useState('1');
  const [pMin, setPMin] = useState('1');
  const [pCost, setPCost] = useState('0');
  const [pSell, setPSell] = useState('0');

  const handleCostChange = (val: string) => {
    setPCost(val);
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num > 0) {
      setPSell(String(precoVendaPeca(num)));
    }
  };

  const criticalParts = state.parts.filter(
    (p) => p.status === 'Esgotado' || p.status === 'Alerta Reposição'
  );
  const totalInventoryCost = state.parts.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const totalPotentialSale = state.parts.reduce((s, p) => s + p.stock * p.sellPrice, 0);

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

  const handleOneClickReorder = () => {
    if (criticalParts.length === 0) return;
    const desc = criticalParts
      .map((p) => `${Math.max(3, p.minStock * 2 - p.stock)}x ${p.sku}`)
      .join(' + ');
    const estimatedTotal = criticalParts.reduce(
      (s, p) => s + Math.max(3, p.minStock * 2 - p.stock) * p.costPrice,
      0
    );
    recordRestockOrder(state.suppliers[0]?.name || 'Fornecedor de Reposição', desc, estimatedTotal);
    setReorderToast(true);
    setTimeout(() => setReorderToast(false), 3000);
  };

  const handleCreatePart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) return;
    const costVal = parseFloat(pCost) || 20;
    addPart({
      sku: pSku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      name: pName.trim(),
      category: pCat,
      compatibility: pComp.trim() || 'Universal',
      location: pLoc.trim() || 'Gaveteiro',
      stock: Math.max(0, parseInt(pStock, 10) || 0),
      minStock: Math.max(1, parseInt(pMin, 10) || 2),
      costPrice: costVal,
      sellPrice: parseFloat(pSell) || precoVendaPeca(costVal),
      reservedOs: 0,
    });
    setShowAddModal(false);
    setPName('');
    setPSku('');
    setPComp('');
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Produtos &amp; Peças SMD</h1>
          <p className="text-xs text-[#727784]">
            Controle de gaveteiro técnico, reserva de OS e reposição inteligente
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onGoSuppliers}
            className="rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer whitespace-nowrap"
          >
            Ver Fornecedores
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
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
          <span className="text-[11px] text-[#727784] block">Itens Críticos</span>
          <span className="text-xl font-bold text-[#D97706] tabular-nums">{criticalParts.length}</span>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-[#D9E0EC]">
          <span className="text-[11px] text-[#727784] block">Capital em Estoque</span>
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
                {criticalParts.length} componentes abaixo do estoque mínimo de segurança
              </p>
              <p className="text-[11px] text-[#414752]">
                {criticalParts.map((p) => p.name).join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOneClickReorder}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D97706] text-white px-3.5 py-2 text-xs font-semibold hover:bg-[#b45309] cursor-pointer whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Pedido Automático 1-Click</span>
          </button>
        </div>
      )}

      {reorderToast && (
        <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-4 py-2.5 text-xs font-semibold text-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Pedido de reposição enviado para Fornecedores e lançado no Fluxo de Caixa!</span>
        </div>
      )}

      {/* Search & Category */}
      <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC] flex flex-col md:flex-row gap-2.5">
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

      {/* Parts Table */}
      <div className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#D9E0EC] bg-[#F3F6FB] text-[11px] font-semibold text-[#727784]">
                <th className="py-3 px-4">Peça / Compatibilidade</th>
                <th className="py-3 px-3">Gaveta</th>
                <th className="py-3 px-3">Custo / Venda</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Saldo &amp; Ajuste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E0EC] text-xs">
              {filtered.map((p) => {
                const ratio = Math.min(100, Math.round((p.stock / Math.max(1, p.minStock * 2)) * 100));
                return (
                  <tr key={p.id} className="hover:bg-[#F3F6FB]/60">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#0056ab] shrink-0" />
                        <div>
                          <p className="font-bold text-[#091b36]">{p.name}</p>
                          <p className="text-[11px] text-[#727784]">
                            <span className="font-mono">{p.sku}</span> · {p.compatibility}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#414752]">{p.location}</td>
                    <td className="py-3 px-3 tabular-nums">
                      <div className="text-[11px] text-[#727784]">Custo: {formatBRL(p.costPrice)}</div>
                      <div className="font-bold text-[#091b36]">Venda: {formatBRL(p.sellPrice)}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${statusBadge(p.status)}`}>
                        {p.status}
                      </span>
                      <div className="w-24 h-1.5 bg-[#F3F6FB] rounded-full mt-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            p.stock === 0 ? 'bg-[#DC2626]' : p.stock <= p.minStock ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                          }`}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => adjustPartStock(p.id, -1)}
                          className="w-7 h-7 rounded-lg border border-[#D9E0EC] bg-white flex items-center justify-center hover:bg-[#F3F6FB] cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center font-bold text-[#091b36] tabular-nums">{p.stock}</span>
                        <button
                          type="button"
                          onClick={() => adjustPartStock(p.id, 1)}
                          className="w-7 h-7 rounded-lg border border-[#D9E0EC] bg-white flex items-center justify-center hover:bg-[#F3F6FB] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-xs text-[#727784]">
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

      {/* Add Part Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleCreatePart}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Cadastrar Peça / Insumo</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
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
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Nome do Componente *</label>
              <input
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Compatibilidade</label>
                <input
                  value={pComp}
                  onChange={(e) => setPComp(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Gaveta / Local</label>
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
                  value={pStock}
                  onChange={(e) => setPStock(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Mín</label>
                <input
                  type="number"
                  value={pMin}
                  onChange={(e) => setPMin(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Custo R$</label>
                <input
                  type="number"
                  step="0.01"
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
                  value={pSell}
                  onChange={(e) => setPSell(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-2 text-xs tabular-nums"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#0056ab] bg-[#EAF2FD]/70 border border-[#D9E0EC] rounded-lg px-2.5 py-1.5 tabular-nums">
              Margem curva contínua: <strong>{margemPctPeca(parseFloat(pCost) || 0).toFixed(1)}%</strong> · Sugestão arredondada:{' '}
              <strong>{formatBRL(precoVendaPeca(parseFloat(pCost) || 0))}</strong>
            </p>
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
                Salvar Peça
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
