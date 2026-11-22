import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightCircle,
  Calculator,
  Check,
  Clock,
  Copy,
  Cpu,
  Edit3,
  Layers,
  QrCode,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { MicroComplexityLevel } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  DEFAULT_COMPLEXIDADES,
  SIMULATOR_SERVICE_PRESETS,
  arredondarPreco,
  calcEffectivePricingFromConfig,
  calcGanhoDupla,
  calcServiceQuote,
  margemPctPeca,
  precoVendaPeca,
} from '../utils/pricing';

interface FinanceInterSimViewProps {
  onOpenPix: (amount?: number, desc?: string) => void;
  onConvertToOs?: () => void;
}

interface SimParamOverrides {
  hora?: number;
  indireto?: number;
  taxaPag?: number;
  reservaGar?: number;
  margem?: number;
}

const normStr = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const FinanceInterSimView: React.FC<FinanceInterSimViewProps> = ({
  onOpenPix,
  onConvertToOs,
}) => {
  const { state, isAtendente, canAccessRoute, setOsPrefillDraft, updateLabConfig } = useLabStore();

  const complexidades: MicroComplexityLevel[] = useMemo(
    () =>
      Array.isArray(state.cfg.complexidades) && state.cfg.complexidades.length > 0
        ? state.cfg.complexidades
        : DEFAULT_COMPLEXIDADES,
    [state.cfg.complexidades]
  );

  // Campos da simulação v17
  const [clientId, setClientId] = useState('');
  const [model, setModel] = useState('');
  const [defect, setDefect] = useState('');
  const [presetIdx, setPresetIdx] = useState(0);
  const [complexityId, setComplexityId] = useState<string>(() => complexidades[0]?.id || 'n1');
  const [editingComplexities, setEditingComplexities] = useState(false);
  const [hours, setHours] = useState<number>(SIMULATOR_SERVICE_PRESETS[0].horas);
  const [consumables, setConsumables] = useState<number>(SIMULATOR_SERVICE_PRESETS[0].consumiveis);
  const [partId, setPartId] = useState('');
  const [partCost, setPartCost] = useState<number>(0);
  const [partFreight, setPartFreight] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [manualPrice, setManualPrice] = useState('');
  const [copiedQuote, setCopiedQuote] = useState(false);

  // Overrides locais isolados (SIM.ov — nunca gravam em Ajustes automaticamente)
  const [simOverrides, setSimOverrides] = useState<SimParamOverrides>({});

  // Modais de confirmação in-app (evita window.confirm/alert em iframe)
  const [confirmAction, setConfirmAction] = useState<'copy' | 'convert' | null>(null);
  const [confirmMessages, setConfirmMessages] = useState<string[]>([]);
  const [errorBanner, setErrorBanner] = useState('');

  // Calculadora rápida da curva contínua de peças
  const [samplePartCost, setSamplePartCost] = useState('50');

  const selectedComplexity = useMemo(
    () => complexidades.find((c) => c.id === complexityId) || complexidades[0] || DEFAULT_COMPLEXIDADES[0],
    [complexidades, complexityId]
  );

  const eff = useMemo(
    () => calcEffectivePricingFromConfig(state.cfg, state.fixos),
    [state.cfg, state.fixos]
  );

  const baseParams = useMemo(
    () => ({
      hora: eff.hourlyRate,
      indireto: eff.indirectHourlyRate,
      taxaPag: eff.paymentFeePct,
      reservaGar: eff.warrantyRatePct,
      margem: eff.profitMarginPct,
    }),
    [eff]
  );

  const activeParams = useMemo(
    () => ({
      hora: simOverrides.hora ?? baseParams.hora,
      indireto: simOverrides.indireto ?? baseParams.indireto,
      taxaPag: simOverrides.taxaPag ?? baseParams.taxaPag,
      reservaGar: simOverrides.reservaGar ?? baseParams.reservaGar,
      margem: simOverrides.margem ?? baseParams.margem,
    }),
    [baseParams, simOverrides]
  );

  const simDirty = useMemo(
    () =>
      (Object.keys(simOverrides) as (keyof SimParamOverrides)[]).some((k) => {
        const val = simOverrides[k];
        return val !== undefined && Math.abs(val - baseParams[k]) > 0.0001;
      }),
    [simOverrides, baseParams]
  );

  // Hora técnica efetiva considerando o multiplicador de complexidade microeletrônica
  const complexityMult = Math.max(0.1, Number(selectedComplexity?.mult) || 1.0);
  const horaBase = activeParams.hora;
  const horaEfetiva = Math.round(horaBase * complexityMult * 100) / 100;

  const bp = state.budgetParams;
  const workingCapitalPct = eff.workingCapitalPct ?? bp.workingCapitalRatePct ?? 10;
  const manualPriceNum = Math.max(0, parseFloat(manualPrice) || 0);
  const denomOk =
    1 - (activeParams.taxaPag + activeParams.reservaGar) / 100 > 0 &&
    1 - (activeParams.taxaPag + activeParams.reservaGar + activeParams.margem) / 100 > 0;

  const quote = calcServiceQuote({
    hours,
    hourlyRate: horaEfetiva,
    indirectHourlyRate: activeParams.indireto,
    partCost,
    partFreight,
    consumables,
    paymentFeePct: activeParams.taxaPag,
    warrantyRatePct: activeParams.reservaGar,
    workingCapitalPct,
    profitMarginPct: activeParams.margem,
    discount,
    manualPrice: manualPriceNum > 0 ? manualPriceNum : undefined,
    rounding: state.cfg.arred,
  });

  // Paridade exata de centavos via calcGanhoDupla com hora efetiva
  const rawAppliedBeforeDiscount = manualPriceNum > 0 ? manualPriceNum : quote.suggestedPriceRounded;
  const dupla = calcGanhoDupla({
    hourlyRate: horaEfetiva,
    indirectHourlyRate: activeParams.indireto,
    taxaTotalRate: (activeParams.taxaPag + activeParams.reservaGar) / 100,
    hours,
    preco: rawAppliedBeforeDiscount,
    peca: partCost,
    fretePeca: partFreight,
    cons: consumables,
    desc: discount,
  });

  const finalClientPrice = Math.max(0, Math.round(dupla.rec * 100) / 100);
  const isBelowFloor = denomOk && finalClientPrice < quote.floorPrice - 0.005;
  const lossAmount = isBelowFloor ? Math.max(0, -dupla.lu) : 0;

  const selectedPreset = SIMULATOR_SERVICE_PRESETS[presetIdx] || SIMULATOR_SERVICE_PRESETS[0];

  const matchedCatalogService = useMemo(
    () =>
      selectedPreset.catalogKeyword
        ? state.servicos.find((s) => normStr(s.nome).includes(selectedPreset.catalogKeyword))
        : undefined,
    [selectedPreset.catalogKeyword, state.servicos]
  );

  // Preço Mercado recalculado em tempo real pela complexidade microeletrônica
  const catalogMarketBase = matchedCatalogService ? Number(matchedCatalogService.mercado) || 0 : 0;
  const marketPrice = useMemo(() => {
    if (catalogMarketBase > 0) {
      return arredondarPreco(catalogMarketBase * complexityMult, state.cfg.arred);
    }
    return arredondarPreco(quote.suggestedPriceExact * 1.25, state.cfg.arred);
  }, [catalogMarketBase, complexityMult, quote.suggestedPriceExact, state.cfg.arred]);

  const sampleCostNum = Math.max(0, parseFloat(samplePartCost) || 0);
  const sampleMarginPct = margemPctPeca(sampleCostNum, state.cfg.margem);
  const sampleSellPrice = precoVendaPeca(sampleCostNum, state.cfg.margem, state.cfg.arred);

  const handlePresetChange = (idx: number) => {
    setPresetIdx(idx);
    const p = SIMULATOR_SERVICE_PRESETS[idx];
    if (p) {
      setHours(p.horas);
      setConsumables(p.consumiveis);
    }
  };

  const handlePartSelect = (id: string) => {
    setPartId(id);
    const found = state.parts.find((p) => p.id === id);
    if (found) {
      setPartCost(Number(found.costPrice) || 0);
    }
  };

  const handleUpdateComplexityItem = (
    id: string,
    patch: Partial<Pick<MicroComplexityLevel, 'nome' | 'mult'>>
  ) => {
    updateLabConfig((prevCfg) => {
      const current =
        Array.isArray(prevCfg.complexidades) && prevCfg.complexidades.length > 0
          ? prevCfg.complexidades
          : DEFAULT_COMPLEXIDADES;
      return {
        ...prevCfg,
        complexidades: current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...(patch.nome !== undefined ? { nome: patch.nome } : {}),
                ...(patch.mult !== undefined
                  ? { mult: Math.max(0.1, Math.round(patch.mult * 100) / 100) }
                  : {}),
              }
            : item
        ),
      };
    });
  };

  const handleRestoreDefaultComplexities = () => {
    const restored = DEFAULT_COMPLEXIDADES.map((c) => ({ ...c }));
    updateLabConfig((prevCfg) => ({
      ...prevCfg,
      complexidades: restored,
    }));
    if (!restored.some((c) => c.id === complexityId)) {
      setComplexityId(restored[0].id);
    }
  };

  const buildWhatsappText = () => {
    const isOutro = presetIdx === SIMULATOR_SERVICE_PRESETS.length - 1;
    const svNome = isOutro ? 'Reparo técnico' : selectedPreset.nome;
    const lines = [
      'Olá! Segue o seu orçamento na *MicroLab* · Manutenção de smartphones e tablets.',
      '',
      `Aparelho: ${model.trim() || '(informar modelo)'}`,
      ...(defect.trim() ? [`Defeito: ${defect.trim()}`] : []),
      `Serviço: ${svNome}`,
      `Valor: ${formatBRL(finalClientPrice)}`,
      '',
      'Se estiver de acordo, é só responder esta mensagem.',
      'MicroLab · @microlabssa · WhatsApp (71) 99129-3552',
    ];
    return lines.join('\n');
  };

  const executeCopyWhatsapp = async () => {
    const text = buildWhatsappText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard fallback ignored
    }
    setCopiedQuote(true);
    setTimeout(() => setCopiedQuote(false), 2200);
  };

  const executeConvertToOs = () => {
    const chosenPart = state.parts.find((p) => p.id === partId);
    const compText = `${selectedComplexity.nome} (${complexityMult.toFixed(1)}x)`;
    setOsPrefillDraft({
      source: 'simulator',
      clientId: clientId || undefined,
      model: model.trim(),
      device: model.trim() || chosenPart?.compatibility || '',
      issue: defect.trim(),
      notes: `Serviço: ${selectedPreset.nome} · ${compText} (orçamento rápido)`,
      serviceCatalogId: matchedCatalogService?.id,
      partId: partId || undefined,
      partCost: Math.round(partCost * 100) / 100,
      partFreight: Math.round(partFreight * 100) / 100,
      consumables,
      estimatedHours: hours,
      hourlyRateOverride: horaEfetiva,
      complexityLabel: compText,
      servicePrice: Math.round(finalClientPrice * 100) / 100,
      status: 'Aprovado',
    });
    onConvertToOs?.();
  };

  const handleCopyClick = () => {
    setErrorBanner('');
    if (!denomOk || finalClientPrice <= 0) {
      setErrorBanner('Não há preço válido para copiar. Confira o serviço e os parâmetros.');
      return;
    }
    if (isBelowFloor) {
      setConfirmMessages([
        isAtendente
          ? 'ATENÇÃO: o preço está abaixo do mínimo permitido. Deseja copiar mesmo assim?'
          : `PREJUÍZO: neste preço você perde ${formatBRL(lossAmount)} (mínimo de equilíbrio ${formatBRL(
              quote.floorPrice
            )}). Deseja copiar mesmo assim?`,
      ]);
      setConfirmAction('copy');
      return;
    }
    void executeCopyWhatsapp();
  };

  const handleConvertClick = () => {
    setErrorBanner('');
    if (!denomOk || finalClientPrice <= 0) {
      setErrorBanner(
        'Não há preço válido. Confira o serviço e os parâmetros (taxas + margem devem somar menos de 100%).'
      );
      return;
    }
    const msgs: string[] = [];
    if (isBelowFloor) {
      msgs.push(
        isAtendente
          ? 'ATENÇÃO: o preço está abaixo do mínimo permitido.'
          : `PREJUÍZO: neste preço você perde ${formatBRL(lossAmount)} (mínimo de equilíbrio ${formatBRL(
              quote.floorPrice
            )}).`
      );
    }
    if (!isAtendente && simDirty) {
      msgs.push(
        'A simulação usa parâmetros temporários diferentes de Ajustes. A OS convertida receberá a hora técnica efetiva aplicada, mas usará as taxas oficiais de Ajustes.'
      );
    }
    if (msgs.length > 0) {
      setConfirmMessages(msgs);
      setConfirmAction('convert');
      return;
    }
    executeConvertToOs();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">
            Simulador de Orçamento &amp; Precificação
          </h1>
          <p className="text-xs text-[#727784]">
            {isAtendente
              ? 'Informe o aparelho, o serviço e a complexidade: o app calcula o preço sugerido e monta a mensagem para o WhatsApp.'
              : 'Simulador de balcão com complexidade microeletrônica editável e conversão direta em OS.'}
          </p>
        </div>
        {!isAtendente && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#EAF2FD] text-[#0056ab] px-3 py-1.5 text-xs font-bold self-start tabular-nums">
            <Cpu className="w-4 h-4" />
            <span>
              Hora Efetiva: {formatBRL(horaEfetiva)}/h ({complexityMult.toFixed(1)}x)
            </span>
          </div>
        )}
      </div>

      {/* Simulador de Orçamento Oficial MicroLab */}
      <section className="rounded-2xl bg-white p-5 border border-[#D9E0EC] grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#0056ab]" />
              <h2 className="text-sm font-bold text-[#091b36]">Dados do Serviço a Simular</h2>
            </div>
            {!isAtendente && (
              <span className="text-[11px] font-medium text-[#727784]">
                Fórmula: Custo Direto ÷ (1 − Taxa {(activeParams.taxaPag + activeParams.reservaGar).toFixed(1)}% − Lucro{' '}
                {activeParams.margem.toFixed(1)}%)
              </span>
            )}
          </div>

          {!isAtendente && (
            <details className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/70 px-3.5 py-2.5">
              <summary className="text-xs font-bold text-[#091b36] cursor-pointer select-none">
                Parâmetros de custo (vêm de Ajustes · alterações aqui são temporárias)
              </summary>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                    Hora técnica base (R$/h)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={activeParams.hora}
                    onChange={(e) =>
                      setSimOverrides((p) => ({ ...p, hora: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#414752] mb-1">Custo indireto (R$/h)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={activeParams.indireto}
                    onChange={(e) =>
                      setSimOverrides((p) => ({ ...p, indireto: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#414752] mb-1">Taxa recebimento (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={activeParams.taxaPag}
                    onChange={(e) =>
                      setSimOverrides((p) => ({ ...p, taxaPag: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#414752] mb-1">Reserva garantia (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={activeParams.reservaGar}
                    onChange={(e) =>
                      setSimOverrides((p) => ({ ...p, reservaGar: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#414752] mb-1">Margem lucro alvo (%)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={activeParams.margem}
                    onChange={(e) =>
                      setSimOverrides((p) => ({ ...p, margem: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                  />
                </div>
              </div>
            </details>
          )}

          {!isAtendente && simDirty && (
            <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/35 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#091b36]">
              <div>
                <strong className="text-[#D97706]">Simulação temporária:</strong> estes parâmetros diferem de Ajustes e não foram salvos.
              </div>
              <button
                type="button"
                onClick={() => setSimOverrides({})}
                className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#D97706]/40 px-2.5 py-1.5 text-[11px] font-bold text-[#091b36] hover:bg-amber-50 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#D97706]" />
                <span>Sincronizar com Ajustes</span>
              </button>
            </div>
          )}

          {/* Complexidade Microeletrônica Editável */}
          <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-[11px] font-bold text-[#091b36] flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#0056ab]" />
                <span>Complexidade Microeletrônica</span>
              </label>
              {!isAtendente && (
                <button
                  type="button"
                  onClick={() => setEditingComplexities((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0056ab] hover:underline cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{editingComplexities ? 'Concluir edição' : 'Editar níveis'}</span>
                </button>
              )}
            </div>

            <select
              value={selectedComplexity.id}
              onChange={(e) => setComplexityId(e.target.value)}
              className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36]"
            >
              {complexidades.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.nome} ({Number(lvl.mult).toFixed(1)}x)
                  {!isAtendente ? ` — ${formatBRL(horaBase * Number(lvl.mult))}/h` : ''}
                </option>
              ))}
            </select>

            {!isAtendente && editingComplexities && (
              <div className="pt-2 border-t border-[#D9E0EC] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-[#727784]">
                    Alterações salvam automaticamente em Configurações e sincronizam com a nuvem.
                  </span>
                  <button
                    type="button"
                    onClick={handleRestoreDefaultComplexities}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1 text-[10px] font-bold text-[#414752] hover:bg-[#EAF2FD] hover:text-[#0056ab] cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar 4 padrões</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {complexidades.map((lvl) => (
                    <div key={lvl.id} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={lvl.nome}
                        onChange={(e) => handleUpdateComplexityItem(lvl.id, { nome: e.target.value })}
                        className="col-span-9 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-medium text-[#091b36]"
                      />
                      <div className="col-span-3 relative">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={lvl.mult}
                          onChange={(e) =>
                            handleUpdateComplexityItem(lvl.id, { mult: parseFloat(e.target.value) || 1.0 })
                          }
                          className="w-full rounded-lg border border-[#D9E0EC] bg-white pl-2.5 pr-6 py-1.5 text-xs font-bold tabular-nums text-[#0056ab]"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#727784]">
                          x
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Presets rápidos de serviço (SIMSV) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Tipo de serviço (SIMSV)
              </label>
              <select
                value={presetIdx}
                onChange={(e) => handlePresetChange(Number(e.target.value))}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36]"
              >
                {SIMULATOR_SERVICE_PRESETS.map((p, idx) => (
                  <option key={p.id} value={idx}>
                    {p.nome}
                    {isAtendente ? '' : ` · ${p.horas}h · consumíveis ${formatBRL(p.consumiveis)}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Cliente (opcional)</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36]"
              >
                <option value="">— Cliente Avulso / Orçamento —</option>
                {state.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Modelo do aparelho</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex.: Galaxy A14 / iPhone 13"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Defeito relatado (opcional)</label>
              <input
                value={defect}
                onChange={(e) => setDefect(e.target.value)}
                placeholder="Ex.: Não carrega / Tela quebrada"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium"
              />
            </div>
          </div>

          <div className={`grid grid-cols-2 ${isAtendente ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-3`}>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Tempo Bancada (h)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={hours}
                onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
              />
            </div>
            {!isAtendente && (
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Consumíveis (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={consumables}
                  onChange={(e) => setConsumables(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
            )}
            {!isAtendente && (
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Custo Peça (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={partCost}
                  onChange={(e) => setPartCost(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
            )}
            {!isAtendente && (
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Frete Peça (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={partFreight}
                  onChange={(e) => setPartFreight(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
            )}
            {isAtendente && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Preço Manual (R$, opc.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Automático"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
              </>
            )}
          </div>

          {!isAtendente && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Peça do estoque (preenche custo)
                  </label>
                  <select
                    value={partId}
                    onChange={(e) => handlePartSelect(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36]"
                  >
                    <option value="">— Selecionar peça —</option>
                    {state.parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stock} un · {formatBRL(p.costPrice)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Preço Manual (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Automático"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              {/* Curva Contínua de Peças */}
              <div className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#091b36]">
                    <Calculator className="w-4 h-4 text-[#0056ab]" />
                    <span>Curva Contínua de Margem na Revenda de Peças</span>
                  </div>
                  <span className="text-[10px] font-medium text-[#727784]">
                    {state.cfg.margem.baixaMax}% em R$ 0 → {state.cfg.margem.baixaMin}% em{' '}
                    {formatBRL(state.cfg.margem.limite)} → {state.cfg.margem.altaMin}% em{' '}
                    {formatBRL(state.cfg.margem.teto)}+
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 items-center">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">Custo da Peça (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={samplePartCost}
                      onChange={(e) => setSamplePartCost(e.target.value)}
                      className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-[#D9E0EC]">
                    <span className="text-[10px] text-[#727784] block">Margem Interpolada</span>
                    <strong className="text-xs text-[#0056ab] tabular-nums">{sampleMarginPct.toFixed(1)}%</strong>
                  </div>
                  <div className="rounded-lg bg-[#0056ab] text-white p-2">
                    <span className="text-[10px] text-sky-200 block">Venda Arredondada</span>
                    <strong className="text-sm tabular-nums">{formatBRL(sampleSellPrice)}</strong>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Painel de Resultados e Conversão */}
        <div className="lg:col-span-5 rounded-2xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#091b36]">
              <Sparkles className="w-4 h-4 text-[#0056ab]" />
              <span>{isAtendente ? 'Valor Final ao Cliente' : 'Faixas Calculadas & Paridade OS'}</span>
            </div>

            {!denomOk ? (
              <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 p-3 text-xs font-semibold text-[#DC2626]">
                Taxas variáveis + margem somam 100% ou mais. Ajuste os parâmetros em Configurações.
              </div>
            ) : isAtendente ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#0056ab] text-white p-4 text-center">
                  <span className="text-[11px] font-semibold text-sky-200 block">
                    {manualPriceNum > 0 || discount > 0 ? 'VALOR PRATICADO AO CLIENTE' : 'PREÇO SUGERIDO AO CLIENTE'}
                  </span>
                  <span className="text-2xl font-bold tabular-nums block mt-1">
                    {formatBRL(finalClientPrice)}
                  </span>
                  <span className="text-[10px] text-sky-100 block mt-1">
                    {selectedComplexity.nome} · Prazo estimado: {hours.toFixed(1)}h · Garantia legal de {state.cfg.garantiaDias} dias
                  </span>
                </div>
                {isBelowFloor && (
                  <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2.5 text-xs font-semibold text-[#DC2626]">
                    Preço abaixo do mínimo permitido. Fale com o administrador antes de enviar.
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white p-3 border border-[#D9E0EC]">
                    <span className="text-[10px] font-semibold text-[#727784] block">PREÇO PISO</span>
                    <span className="text-sm font-bold text-[#414752] tabular-nums">{formatBRL(quote.floorPrice)}</span>
                    <span className="text-[9px] text-[#727784] block mt-0.5">Equilíbrio</span>
                  </div>
                  <div className="rounded-xl bg-[#0056ab] text-white p-3">
                    <span className="text-[10px] font-semibold text-sky-200 block">
                      {manualPriceNum > 0 || discount > 0 ? 'PRATICADO FINAL' : 'PREÇO SUGERIDO'}
                    </span>
                    <span className="text-base font-bold tabular-nums">{formatBRL(finalClientPrice)}</span>
                    <span className="text-[9px] text-sky-200 block mt-0.5 tabular-nums">
                      Exato: {formatBRL(quote.suggestedPriceExact)}
                    </span>
                  </div>
                  <div className="rounded-xl bg-white p-3 border border-[#D9E0EC]">
                    <span className="text-[10px] font-semibold text-[#727784] block">PREÇO MERCADO</span>
                    <span className="text-sm font-bold text-[#091b36] tabular-nums">
                      {formatBRL(marketPrice)}
                    </span>
                    <span className="text-[9px] text-[#727784] block mt-0.5">
                      {catalogMarketBase > 0 ? `Catálogo × ${complexityMult.toFixed(1)}x` : 'Ref. +25%'}
                    </span>
                  </div>
                </div>

                {isBelowFloor && (
                  <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3 py-2 text-xs font-semibold text-[#DC2626]">
                    Prejuízo de {formatBRL(lossAmount)} neste valor: mínimo de equilíbrio é {formatBRL(quote.floorPrice)}.
                  </div>
                )}

                <div className="text-[11px] text-[#414752] space-y-1.5 bg-white p-3.5 rounded-xl border border-[#D9E0EC]">
                  <div className="flex justify-between">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#0056ab]" />
                      Mão de obra ({hours.toFixed(2)}h × {formatBRL(horaEfetiva)})
                    </span>
                    <strong className="tabular-nums">{formatBRL(dupla.mo)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Peça + Frete + Consumíveis + Rateio ({formatBRL(activeParams.indireto)}/h)</span>
                    <strong className="tabular-nums">
                      {formatBRL(dupla.cd - dupla.mo)}
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-[#D9E0EC] pt-1">
                    <span className="font-semibold">Custo Direto Total</span>
                    <strong className="tabular-nums">{formatBRL(dupla.cd)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Envelope 2 · Garantia ({activeParams.reservaGar}% no preço)</span>
                    <strong className="tabular-nums text-[#0056ab]">
                      {formatBRL(finalClientPrice * (activeParams.reservaGar / 100))}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Envelope 3 · Giro ({workingCapitalPct}% pós-recebimento)</span>
                    <strong className="tabular-nums text-[#16A34A]">
                      {formatBRL(
                        Math.max(0, finalClientPrice * (1 - activeParams.taxaPag / 100)) *
                          (workingCapitalPct / 100)
                      )}
                    </strong>
                  </div>
                  <div className="pt-1.5 border-t border-[#D9E0EC] flex justify-between">
                    <span>Lucro Líquido Empresa ({(dupla.mg * 100).toFixed(1)}%)</span>
                    <strong className={`tabular-nums ${dupla.lu >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {formatBRL(dupla.lu)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Ganho Total do Técnico (Hora + Lucro)</span>
                    <strong className="tabular-nums text-[#091b36]">{formatBRL(dupla.ganho)}</strong>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 border border-[#D9E0EC] text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[#091b36] mb-1">
                    <Layers className="w-3.5 h-3.5 text-[#FF7A00]" />
                    <span>Destinação Banco Inter deste Orçamento</span>
                  </div>
                  <div className="flex justify-between text-[#414752]">
                    <span>Conta Corrente (Reposição + Mão de Obra)</span>
                    <strong className="tabular-nums">{formatBRL(quote.interContaCorrenteTotal)}</strong>
                  </div>
                  <div className="flex justify-between text-[#414752]">
                    <span>
                      Porquinho Inter (Garantia {activeParams.reservaGar}% + Giro {workingCapitalPct}% + Fixo)
                    </span>
                    <strong className="tabular-nums">{formatBRL(quote.interPorquinhoTotal)}</strong>
                  </div>
                </div>
              </>
            )}

            <div className="bg-white rounded-xl p-3 border border-[#D9E0EC]">
              <label className="block text-[10px] font-bold uppercase text-[#727784] mb-1">
                Prévia WhatsApp (Automática)
              </label>
              <textarea
                readOnly
                rows={5}
                value={buildWhatsappText()}
                className="w-full text-[11px] text-[#414752] bg-[#F3F6FB] rounded-lg p-2 border border-[#D9E0EC] resize-none focus:outline-none"
              />
            </div>

            {errorBanner && (
              <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3 py-2 text-xs font-semibold text-[#DC2626]">
                {errorBanner}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {canAccessRoute('ordens-de-servico') && (
              <button
                type="button"
                onClick={handleConvertClick}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0056ab] py-2.5 px-4 text-xs font-bold text-white hover:bg-[#1b6fd1] transition-colors cursor-pointer"
              >
                <ArrowRightCircle className="w-4 h-4" />
                <span>Converter em OS Agora</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyClick}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white border border-[#D9E0EC] py-2.5 text-xs font-bold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
              >
                {copiedQuote ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedQuote ? 'Copiado!' : 'Copiar WhatsApp'}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenPix(finalClientPrice, `Orçamento ${model || selectedPreset.nome}`)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#091b36] py-2.5 text-xs font-bold text-white hover:bg-[#14305a] cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>Cobrar PIX</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de confirmação para prejuízo ou simulação divergente */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          data-modal-open="true"
          onClick={() => setConfirmAction(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 border border-[#D9E0EC] shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-[#D97706]">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold text-[#091b36]">
                  {confirmAction === 'convert' ? 'Confirmar conversão em OS' : 'Confirmar cópia do orçamento'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="p-1 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {confirmMessages.map((msg, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/30 p-3 text-xs text-[#414752]"
                >
                  {msg}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Voltar e Ajustar
              </button>
              <button
                type="button"
                onClick={() => {
                  const act = confirmAction;
                  setConfirmAction(null);
                  if (act === 'copy') void executeCopyWhatsapp();
                  if (act === 'convert') executeConvertToOs();
                }}
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-bold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                Continuar Mesmo Assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
