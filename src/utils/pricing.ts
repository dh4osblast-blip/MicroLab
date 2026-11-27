import {
  CashTransaction,
  Client,
  DeviceCategory,
  FixedExpenseItem,
  LabConfig,
  MicroComplexityLevel,
  PartItem,
  PartsMarginCurveConfig,
  PayableBill,
  PurchaseRecord,
  RoundingConfig,
  SaleRecord,
  ServiceCatalogItem,
  ServiceOrder,
  TransactionEnvelope,
  TransactionSubEnvelope,
} from '../types/lab';

// Official MicroLab Financial & Pricing Parameters

export const APP_VERSION_TAG = 'v1.8.1 · Electron';
export const OFFICIAL_WEEKLY_SCHEDULE = [4, 4, 4, 4, 4, 4, 2] as const; // Seg–Sáb 4h + Dom 2h = 26h/sem
export const OFFICIAL_HOURS_BY_DOW = [2, 4, 4, 4, 4, 4, 4] as const; // Date.getDay() order: Dom..Sáb
export const OFFICIAL_WEEKLY_HOURS = 26;
export const OFFICIAL_MONTHLY_HOURS = Number(((OFFICIAL_WEEKLY_HOURS * 52) / 12).toFixed(2)); // 112.67h/mês
export const OFFICIAL_OCCUPANCY_PCT = 50; // 50% faturável
export const OFFICIAL_BILLABLE_HOURS = Number(((OFFICIAL_MONTHLY_HOURS * OFFICIAL_OCCUPANCY_PCT) / 100).toFixed(2)); // 56.33h/mês
export const OFFICIAL_MIN_HOURLY_RATE = 25.0; // R$ 25,00/h
export const OFFICIAL_PRO_LABORE = 200.0; // R$ 200,00/mês referência
export const OFFICIAL_FIXED_COSTS = 100.0; // R$ 100,00/mês
export const OFFICIAL_INDIRECT_HOURLY_RATE = Number(
  (OFFICIAL_FIXED_COSTS / ((OFFICIAL_WEEKLY_HOURS * 52) / 12 * (OFFICIAL_OCCUPANCY_PCT / 100))).toFixed(2)
); // R$ 1,78/h
export const OFFICIAL_PAYMENT_FEE_PCT = 0.0; // 0,0% (Pix e dinheiro)
export const OFFICIAL_WARRANTY_RESERVE_PCT = 5.0; // Envelope 2: 5,0% embutido no preço
export const OFFICIAL_WORKING_CAPITAL_PCT = 10.0; // Envelope 3: 10,0% pós-recebimento (não entra no preço)
export const OFFICIAL_PROFIT_MARGIN_PCT = 30.0; // Meta de lucro líquido: 30,0%
export const OFFICIAL_BREAK_EVEN_TARGET = OFFICIAL_FIXED_COSTS + OFFICIAL_PRO_LABORE; // R$ 300,00/mês

export const PARTS_MARKUP_CURVE = {
  threshold: 50,
  ceiling: 500,
  marginAtZero: 200,
  marginAtThreshold: 100,
  marginAtCeiling: 20,
} as const;

export const DEFAULT_PARTS_CURVE: PartsMarginCurveConfig = {
  limite: 50,
  baixaMax: 200,
  baixaMin: 100,
  altaMax: 30,
  altaMin: 20,
  teto: 500,
};

export const DEFAULT_ROUNDING: RoundingConfig = {
  ate: 30,
  baixo: 1,
  alto: 5,
};

export const DEFAULT_TERMO_GARANTIA =
  'Garantia de 90 dias referentes apenas ao serviço executado e peça trocada (Art. 26, II, CDC). A garantia **NÃO COBRE** mau uso, quebras, trincos, riscos, quedas, pressão no display ou contato com líquidos/oxidação. O aparelho perde sua resistência à água após aberto.';

export const DEFAULT_COND_EXEC =
  'Atenção, a não retirada do aparelho no prazo de 90 dias implicará na venda do mesmo para pagamentos de gastos (Art. 6º, Item 3 do CDC).';

export const DEFAULT_TERMO_PECA_CLI =
  'Peça fornecida pelo cliente: a garantia cobre apenas a mão de obra do serviço executado. A MicroLab não se responsabiliza pela qualidade da peça nem por incompatibilidade de hardware ou de software dela com o aparelho.';

export const DEFAULT_CAT_DESP = [
  'Aluguel',
  'Peças',
  'Ferramentas',
  'Internet',
  'Anúncios',
  'Outros',
  'Garantia',
];

export const DEFAULT_SERVICOS_SEED: ServiceCatalogItem[] = [
  {
    id: 'seed1',
    nome: 'Diagnóstico de bancada (sem reparo)',
    cat: 'Diagnóstico',
    tempo: 0.5,
    cons: 0,
    peca: '',
    gar: '',
    mercado: 0,
    updatedAt: 1,
  },
  {
    id: 'seed2',
    nome: 'Troca de bateria – smartphone',
    cat: 'Bateria',
    tempo: 0.5,
    cons: 2,
    peca: 'Bateria smartphone Galaxy A14',
    gar: '',
    mercado: 0,
    updatedAt: 1,
  },
  {
    id: 'seed3',
    nome: 'Troca de conector de carga (módulo)',
    cat: 'Conector',
    tempo: 0.75,
    cons: 2,
    peca: 'Módulo conector de carga USB-C',
    gar: '',
    mercado: 0,
    updatedAt: 1,
  },
  {
    id: 'seed4',
    nome: 'Troca de tela – smartphone',
    cat: 'Tela',
    tempo: 1.0,
    cons: 3,
    peca: 'Tela Galaxy A14 (módulo)',
    gar: '',
    mercado: 0,
    updatedAt: 1,
  },
  {
    id: 'seed5',
    nome: 'Tablet – reparo de carga / bateria',
    cat: 'Tablet',
    tempo: 1.5,
    cons: 3,
    peca: 'Bateria tablet genérica',
    gar: '',
    mercado: 0,
    updatedAt: 1,
  },
  {
    id: 'seed6',
    nome: 'Limpeza e tratamento de oxidação',
    cat: 'Limpeza',
    tempo: 1.5,
    cons: 8,
    peca: '',
    gar: '',
    mercado: 0,
    updatedAt: 1,
  },
];

export const DEFAULT_FIXOS_SEED: FixedExpenseItem[] = [
  {
    id: 'fixo-internet',
    nome: 'Internet',
    valor: 50,
    cat: 'Internet',
    dia: 1,
    ativo: true,
    ultimo: '',
    updatedAt: 1,
  },
  {
    id: 'fixo-energia',
    nome: 'Energia da bancada',
    valor: 50,
    cat: 'Outros',
    dia: 1,
    ativo: true,
    ultimo: '',
    updatedAt: 1,
  },
];

export const FIXED_SHORTCUTS: readonly { nome: string; cat: string }[] = [
  { nome: 'Internet', cat: 'Internet' },
  { nome: 'Energia da bancada', cat: 'Outros' },
  { nome: 'MEI / DAS', cat: 'Outros' },
  { nome: 'Depreciação de ferramentas / outros', cat: 'Outros' },
];

export const DEFAULT_COMPLEXIDADES: MicroComplexityLevel[] = [
  { id: 'n1', nome: 'Nível 1 — Periféricos & Telas', mult: 1.0 },
  { id: 'n2', nome: 'Nível 2 — Conectores FPC / Carga', mult: 1.2 },
  { id: 'n3', nome: 'Nível 3 — Linhas Principais / Curto', mult: 1.5 },
  { id: 'n4', nome: 'Nível 4 — Reballing CPU / Sanduíche', mult: 2.0 },
];

export function createDefaultLabConfig(): LabConfig {
  return {
    bg: '#ffffff',
    pixKey: '(71) 99129-3552',
    pixNome: 'MicroLab Assistencia Tecnica',
    pixCid: 'SALVADOR',
    horas: [...OFFICIAL_HOURS_BY_DOW],
    ocup: OFFICIAL_OCCUPANCY_PCT / 100,
    horaMin: OFFICIAL_MIN_HOURLY_RATE,
    proLabore: OFFICIAL_PRO_LABORE,
    taxaPag: OFFICIAL_PAYMENT_FEE_PCT / 100,
    reservaGar: OFFICIAL_WARRANTY_RESERVE_PCT / 100,
    reservaCap: OFFICIAL_WORKING_CAPITAL_PCT / 100,
    preco: {
      modo: 'auto',
      hora: OFFICIAL_MIN_HOURLY_RATE,
      indireto: OFFICIAL_INDIRECT_HOURLY_RATE,
      taxa: (OFFICIAL_PAYMENT_FEE_PCT + OFFICIAL_WARRANTY_RESERVE_PCT) / 100,
      margem: OFFICIAL_PROFIT_MARGIN_PCT / 100,
    },
    margem: { ...DEFAULT_PARTS_CURVE },
    arred: { ...DEFAULT_ROUNDING },
    entrega: [],
    entMargem: 5,
    entMin: 0,
    validOrc: 7,
    diagTaxa: '',
    diagHoras: 0.5,
    ticketEsp: 0,
    custoEsp: 0,
    metaMes: 0,
    garantiaDias: 90,
    formas: ['Pix', 'Dinheiro'],
    idle: 10,
    termoGarantia: DEFAULT_TERMO_GARANTIA,
    condExec: DEFAULT_COND_EXEC,
    termoPecaCli: DEFAULT_TERMO_PECA_CLI,
    catDesp: [...DEFAULT_CAT_DESP],
    fonteTema: '',
    tempCal: {},
    pmicMin: 3.4,
    defeitosExtra: [],
    complexidades: DEFAULT_COMPLEXIDADES.map((c) => ({ ...c })),
    autoPrintTechSignature: true,
    thermalWidth: '80mm',
    _ts: {},
    updatedAt: 1,
  };
}

export interface BenchCapacityMetrics {
  weeklyHours: number;
  monthlyHours: number;
  billableHours: number;
  hourlyRate: number;
  proLaboreHourlyRaw: number;
  indirectHourlyRate: number;
  breakEvenTarget: number;
}

export function calcBenchMetrics(
  dailyHours: number[] = [...OFFICIAL_WEEKLY_SCHEDULE],
  occupancyPct = OFFICIAL_OCCUPANCY_PCT,
  proLabore = OFFICIAL_PRO_LABORE,
  fixedCosts = OFFICIAL_FIXED_COSTS,
  minHourlyRate = OFFICIAL_MIN_HOURLY_RATE
): BenchCapacityMetrics {
  const weeklyHours = dailyHours.reduce((sum, h) => sum + Math.max(0, Number(h) || 0), 0);
  const monthlyHoursExact = (weeklyHours * 52) / 12;
  const occ = Math.max(0, Math.min(1, occupancyPct / 100));
  const billableHoursExact = monthlyHoursExact * occ;
  const indirectHourlyRate =
    billableHoursExact > 0 ? Math.round((fixedCosts / billableHoursExact) * 100) / 100 : 0;
  const proLaboreHourlyRaw =
    billableHoursExact > 0 ? Math.round((proLabore / billableHoursExact) * 100) / 100 : 0;
  const hourlyRate = Math.max(minHourlyRate, proLaboreHourlyRaw);

  return {
    weeklyHours: Math.round(weeklyHours * 100) / 100,
    monthlyHours: Math.round(monthlyHoursExact * 100) / 100,
    billableHours: Math.round(billableHoursExact * 100) / 100,
    hourlyRate,
    proLaboreHourlyRaw,
    indirectHourlyRate,
    breakEvenTarget: Math.round((fixedCosts + proLabore) * 100) / 100,
  };
}

export function calcActiveFixedCosts(fixos: FixedExpenseItem[]): number {
  return (
    Math.round(
      (fixos || [])
        .filter((x) => x.ativo !== false)
        .reduce((sum, x) => sum + Math.max(0, Number(x.valor) || 0), 0) * 100
    ) / 100
  );
}

export function calcEffectivePricingFromConfig(
  cfg: LabConfig,
  fixos: FixedExpenseItem[]
): {
  metrics: BenchCapacityMetrics;
  fixedCosts: number;
  isManual: boolean;
  hourlyRate: number;
  indirectHourlyRate: number;
  paymentFeePct: number;
  warrantyRatePct: number;
  totalRetentionPct: number;
  workingCapitalPct: number;
  profitMarginPct: number;
} {
  const fixedCosts = calcActiveFixedCosts(fixos);
  const occPct = (Number(cfg.ocup) || 0) * 100;
  const proLabore = Math.max(0, Number(cfg.proLabore) || 0);
  const minHourly = Math.max(0, Number(cfg.horaMin) || 0);
  const metrics = calcBenchMetrics(cfg.horas || [...OFFICIAL_HOURS_BY_DOW], occPct, proLabore, fixedCosts, minHourly);

  const isManual = cfg.preco?.modo === 'manual';
  const paymentFeePct = Math.max(0, (Number(cfg.taxaPag) || 0) * 100);
  const warrantyRatePct = Math.max(0, (Number(cfg.reservaGar) || 0) * 100);
  const workingCapitalPct = Math.max(0, (Number(cfg.reservaCap) || 0) * 100);
  const profitMarginPct = Math.max(0, (Number(cfg.preco?.margem) ?? OFFICIAL_PROFIT_MARGIN_PCT / 100) * 100);

  const hourlyRate = isManual ? Math.max(0, Number(cfg.preco?.hora) || 0) : metrics.hourlyRate;
  const indirectHourlyRate = isManual
    ? Math.max(0, Number(cfg.preco?.indireto) || 0)
    : metrics.indirectHourlyRate;
  const totalRetentionPct = isManual
    ? Math.max(0, (Number(cfg.preco?.taxa) || 0) * 100)
    : paymentFeePct + warrantyRatePct;

  return {
    metrics,
    fixedCosts,
    isManual,
    hourlyRate,
    indirectHourlyRate,
    paymentFeePct,
    warrantyRatePct,
    totalRetentionPct,
    workingCapitalPct,
    profitMarginPct,
  };
}

export function calcDiagTaxa(cfg: Pick<LabConfig, 'diagTaxa' | 'diagHoras' | 'horaMin'>): number {
  if (cfg.diagTaxa !== '' && cfg.diagTaxa !== undefined && Number(cfg.diagTaxa) > 0) {
    return Math.round(Number(cfg.diagTaxa) * 100) / 100;
  }
  const v = (Number(cfg.diagHoras) || 0.5) * (Number(cfg.horaMin) || 0);
  return v > 0 ? Math.ceil(v / 5 - 1e-9) * 5 : 0;
}

export function calcTaxaEntregaCobrada(
  repasse: number,
  entMargemPct = 5,
  entMin = 0
): number {
  const base = Math.max(0, Number(repasse) || 0);
  if (base <= 0) return 0;
  const extra = Math.max(Number(entMin) || 0, base * ((Number(entMargemPct) || 0) / 100));
  return Math.ceil(base + extra - 1e-9);
}

/**
 * Curva contínua sem degraus na revenda de peças:
 * 200% em R$ 0 -> 100% no limite de R$ 50 -> 20% no teto de R$ 500+
 */
export function margemPctPeca(
  cost: number,
  curve: PartsMarginCurveConfig = DEFAULT_PARTS_CURVE
): number {
  const c = Math.max(0, Number(cost) || 0);
  const limite = Math.max(0.01, Number(curve.limite) || PARTS_MARKUP_CURVE.threshold);
  const teto = Math.max(limite, Number(curve.teto) || PARTS_MARKUP_CURVE.ceiling);
  const baixaMax = Math.max(0, Number(curve.baixaMax) ?? PARTS_MARKUP_CURVE.marginAtZero);
  const baixaMin = Math.max(0, Number(curve.baixaMin) ?? PARTS_MARKUP_CURVE.marginAtThreshold);
  const altaMin = Math.max(0, Number(curve.altaMin) ?? PARTS_MARKUP_CURVE.marginAtCeiling);

  if (c <= 0) return baixaMax;
  if (c <= limite) {
    return baixaMax - (baixaMax - baixaMin) * (c / limite);
  }
  const t = teto > limite ? Math.min(1, (c - limite) / (teto - limite)) : 1;
  return baixaMin - (baixaMin - altaMin) * t;
}

/**
 * Arredondamento MicroLab:
 * Passo de R$ 1,00 até R$ 30,00 e passo de R$ 5,00 acima de R$ 30,00 (configurável em cfg.arred).
 */
export function arredondarPreco(
  price: number,
  rounding: RoundingConfig = DEFAULT_ROUNDING
): number {
  const p = Math.max(0, Number(price) || 0);
  if (p <= 0) return 0;
  const ate = Math.max(0, Number(rounding.ate) ?? DEFAULT_ROUNDING.ate);
  const baixo = Math.max(0.01, Number(rounding.baixo) || DEFAULT_ROUNDING.baixo);
  const alto = Math.max(0.01, Number(rounding.alto) || DEFAULT_ROUNDING.alto);
  const step = p <= ate ? baixo : alto;
  return Math.round(Math.ceil(p / step - 1e-9) * step * 100) / 100;
}

export function precoVendaPeca(
  cost: number,
  curve: PartsMarginCurveConfig = DEFAULT_PARTS_CURVE,
  rounding: RoundingConfig = DEFAULT_ROUNDING
): number {
  const c = Math.max(0, Number(cost) || 0);
  if (c <= 0) return 0;
  const raw = Math.round(c * (1 + margemPctPeca(c, curve) / 100) * 100) / 100;
  return arredondarPreco(raw, rounding);
}

export interface ServiceQuoteInput {
  hours: number;
  hourlyRate: number;
  indirectHourlyRate: number;
  partCost: number;
  partFreight?: number;
  consumables?: number;
  paymentFeePct: number;
  warrantyRatePct: number;
  workingCapitalPct: number;
  profitMarginPct: number;
  discount?: number;
  manualPrice?: number;
  rounding?: RoundingConfig;
}

export interface ServiceQuoteResult {
  laborCost: number;
  indirectCost: number;
  directCost: number;
  taxaTotalRate: number;
  floorPrice: number;
  suggestedPriceExact: number;
  suggestedPriceRounded: number;
  appliedPrice: number;
  warrantyRetention: number;
  paymentFeeAmount: number;
  netCompanyProfit: number;
  realizedMarginPct: number;
  workingCapitalReserve: number;
  partsReplenishment: number;
  techTotalGain: number;
  interContaCorrenteTotal: number;
  interPorquinhoTotal: number;
}

export function calcServiceQuote(input: ServiceQuoteInput): ServiceQuoteResult {
  const hours = Math.max(0, input.hours);
  const partCost = Math.max(0, input.partCost);
  const partFreight = Math.max(0, input.partFreight || 0);
  const consumables = Math.max(0, input.consumables || 0);
  const discount = Math.max(0, input.discount || 0);

  const laborCost = Math.round(hours * input.hourlyRate * 100) / 100;
  const indirectCost = Math.round(hours * input.indirectHourlyRate * 100) / 100;
  const directCost = Math.round((partCost + partFreight + consumables + laborCost + indirectCost) * 100) / 100;

  const taxaTotalRate = Math.max(0, Math.min(0.49, (input.paymentFeePct + input.warrantyRatePct) / 100));
  const targetMarginRate = Math.max(0, Math.min(0.8, input.profitMarginPct / 100));
  const denom = Math.max(0.05, 1 - taxaTotalRate - targetMarginRate);

  const floorPrice = Math.round((directCost / Math.max(0.05, 1 - taxaTotalRate)) * 100) / 100;
  const suggestedPriceExact = Math.round((directCost / denom) * 100) / 100;
  const suggestedPriceRounded = arredondarPreco(suggestedPriceExact, input.rounding || DEFAULT_ROUNDING);

  const appliedPrice = Math.max(
    0,
    (input.manualPrice && input.manualPrice > 0 ? input.manualPrice : suggestedPriceRounded) - discount
  );
  const warrantyRetention = Math.round(appliedPrice * (input.warrantyRatePct / 100) * 100) / 100;
  const paymentFeeAmount = Math.round(appliedPrice * (input.paymentFeePct / 100) * 100) / 100;

  const netCompanyProfit =
    Math.round((appliedPrice - directCost - warrantyRetention - paymentFeeAmount) * 100) / 100;
  const realizedMarginPct = appliedPrice > 0 ? Math.round((netCompanyProfit / appliedPrice) * 1000) / 10 : 0;

  // Capital de giro (Envelope 3 = 10%) NÃO entra no preço de venda; é separado após o recebimento líquido
  const netReceivedAfterFee = Math.max(0, appliedPrice - paymentFeeAmount);
  const workingCapitalReserve =
    Math.round(netReceivedAfterFee * (input.workingCapitalPct / 100) * 100) / 100;

  const partsReplenishment = Math.round((partCost + partFreight + consumables) * 100) / 100;
  const techTotalGain = Math.round((laborCost + netCompanyProfit) * 100) / 100;

  // Espelhamento Banco Inter
  const interContaCorrenteTotal = Math.round((partsReplenishment + laborCost) * 100) / 100;
  const interPorquinhoTotal =
    Math.round((warrantyRetention + workingCapitalReserve + indirectCost) * 100) / 100;

  return {
    laborCost,
    indirectCost,
    directCost,
    taxaTotalRate,
    floorPrice,
    suggestedPriceExact,
    suggestedPriceRounded,
    appliedPrice,
    warrantyRetention,
    paymentFeeAmount,
    netCompanyProfit,
    realizedMarginPct,
    workingCapitalReserve,
    partsReplenishment,
    techTotalGain,
    interContaCorrenteTotal,
    interPorquinhoTotal,
  };
}

// ---------- Etapa 4: Constantes & Motores v17 (SIMSV, CKL, SAIL, ganhoDupla, Garantia & Validade) ----------

export interface SimulatorServicePreset {
  id: number;
  nome: string;
  horas: number;
  consumiveis: number;
  catalogKeyword: string;
}

export const SIMULATOR_SERVICE_PRESETS: readonly SimulatorServicePreset[] = [
  { id: 0, nome: 'Troca de bateria', horas: 0.5, consumiveis: 2, catalogKeyword: 'troca de bateria' },
  { id: 1, nome: 'Conector (módulo)', horas: 0.75, consumiveis: 2, catalogKeyword: 'troca de conector' },
  { id: 2, nome: 'Tela', horas: 1.0, consumiveis: 3, catalogKeyword: 'troca de tela' },
  { id: 3, nome: 'Conector (microssolda)', horas: 1.5, consumiveis: 5, catalogKeyword: '' },
  { id: 4, nome: 'Oxidação', horas: 1.5, consumiveis: 8, catalogKeyword: 'oxida' },
  { id: 5, nome: 'Outro serviço', horas: 1.0, consumiveis: 2, catalogKeyword: '' },
];

export const ENTRY_CHECKLIST_ITEMS = [
  { key: 'liga', label: 'Aparelho liga?' },
  { key: 'tela', label: 'Tela ok?' },
  { key: 'audio', label: 'Áudio ok?' },
  { key: 'cam', label: 'Câmeras ok?' },
  { key: 'carga', label: 'Conector de carga ok?' },
  { key: 'marcas', label: 'Marcas de uso / arranhões?' },
  { key: 'liq', label: 'Molhou / contato com líquido?' },
] as const;

export const NOTEBOOK_ENTRY_CHECKLIST_ITEMS = [
  { key: 'nb_liga', label: 'Liga e dá vídeo?' },
  { key: 'nb_tela', label: 'Tela e dobradiças ok?' },
  { key: 'nb_teclado', label: 'Teclado e Touchpad ok?' },
  { key: 'nb_portas', label: 'Portas USB / HDMI / Carga ok?' },
  { key: 'nb_bateria', label: 'Bateria segura carga / sem inchaço?' },
  { key: 'nb_carcaca', label: 'Carcaça e parafusos íntegros?' },
  { key: 'nb_liq', label: 'Sinais de líquido / oxidação?' },
] as const;

export const EXIT_CHECKLIST_ITEMS = [
  { key: 'carga', label: 'Carga (tensão/corrente)' },
  { key: 'touch', label: 'Touch e display' },
  { key: 'auric', label: 'Alto-falante auricular' },
  { key: 'camp', label: 'Campainha (viva-voz)' },
  { key: 'mic1', label: 'Microfone primário' },
  { key: 'mic2', label: 'Microfone secundário' },
  { key: 'camF', label: 'Câmera frontal' },
  { key: 'camT', label: 'Câmera traseira' },
  { key: 'vib', label: 'Vibracall' },
  { key: 'sinal', label: 'Sinal de operadora / Wi-Fi' },
] as const;

export const IMEI_TRIAGE_STATUSES = [
  { value: 'regular', label: 'Regular' },
  { value: 'suspeito', label: 'Suspeito' },
  { value: 'impedido', label: 'Impedido / Bloqueado' },
] as const;

export const ACCESSORIES_PRESETS = [
  'Chip',
  'Capa',
  'Cartão de memória',
  'Carregador/cabo',
  'Película',
] as const;

export const NOTEBOOK_ACCESSORIES_PRESETS = [
  'Carregador / Fonte',
  'Cabo de força',
  'Case / Mochila',
  'Mouse / Receptor USB',
] as const;

export function resolveOrderDeviceCategory(
  o?: Pick<ServiceOrder, 'deviceCategory' | 'deviceType'> | null
): DeviceCategory {
  if (
    o?.deviceCategory === 'smartphone' ||
    o?.deviceCategory === 'tablet' ||
    o?.deviceCategory === 'notebook'
  ) {
    return o.deviceCategory;
  }
  if (o?.deviceType === 'laptop') return 'notebook';
  if (o?.deviceType === 'tablet') return 'tablet';
  return 'smartphone';
}

export function getEntryChecklistItems(
  category: DeviceCategory
): readonly { key: string; label: string }[] {
  return category === 'notebook' ? NOTEBOOK_ENTRY_CHECKLIST_ITEMS : ENTRY_CHECKLIST_ITEMS;
}

export function getAccessoriesPresets(category: DeviceCategory): readonly string[] {
  return category === 'notebook' ? NOTEBOOK_ACCESSORIES_PRESETS : ACCESSORIES_PRESETS;
}

export const CANONICAL_ORDER_STATUSES = [
  'Orçamento',
  'Aprovado',
  'Aguardando Peça',
  'Em reparo',
  'Pronto',
  'Entregue',
  'Cancelado',
] as const;

export interface GanhoDuplaInput {
  hourlyRate: number;
  indirectHourlyRate: number;
  taxaTotalRate: number; // fração (ex.: 0.05)
  hours: number;
  preco: number;
  peca: number;
  pcli?: boolean;
  fretePeca?: number;
  cons?: number;
  itRec?: number;
  itCusto?: number;
  desc?: number;
  frete?: number;
  custoEnt?: number;
}

export interface GanhoDuplaResult {
  rec: number;
  cd: number;
  cT: number;
  lu: number;
  mg: number;
  mo: number;
  ganho: number;
}

/**
 * Função única v17 para paridade exata de centavos entre Simulador e OS:
 * Lucro da empresa já paga a hora técnica como custo; Ganho do técnico = hora técnica + lucro.
 */
export function calcGanhoDupla(x: GanhoDuplaInput): GanhoDuplaResult {
  const h = Math.max(0, Number(x.hours) || 0);
  const preco = Math.max(0, Number(x.preco) || 0);
  const itRec = Math.max(0, Number(x.itRec) || 0);
  const desc = Math.max(0, Number(x.desc) || 0);
  const rec = preco + itRec - desc;

  const partCost = x.pcli ? 0 : Math.max(0, Number(x.peca) || 0);
  const partFreight = x.pcli ? 0 : Math.max(0, Number(x.fretePeca) || 0);
  const cons = Math.max(0, Number(x.cons) || 0);
  const hourly = Math.max(0, Number(x.hourlyRate) || 0);
  const indirect = Math.max(0, Number(x.indirectHourlyRate) || 0);
  const taxa = Math.max(0, Number(x.taxaTotalRate) || 0);

  const cd = Math.round((partCost + partFreight + cons + h * (hourly + indirect)) * 100) / 100;
  const itCusto = Math.max(0, Number(x.itCusto) || 0);
  const cT = Math.round((cd + itCusto) * 100) / 100;
  const custoEnt = Math.max(0, Number(x.custoEnt) || 0);
  const frete = Math.max(0, Number(x.frete) || 0);
  const ent = custoEnt > 0 ? frete - custoEnt : 0;

  const lu = Math.round((rec - cT - rec * taxa + ent) * 100) / 100;
  const mo = Math.round(h * hourly * 100) / 100;
  const ganho = Math.round((mo + lu) * 100) / 100;
  return {
    rec,
    cd,
    cT,
    lu,
    mg: rec > 0 ? lu / rec : 0,
    mo,
    ganho,
  };
}

export function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDiasIso(iso: string, days: number): string {
  const clean = (iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return '';
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function diasAteIso(iso?: string, refIso?: string): number | null {
  const clean = (iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const [y, m, d] = clean.split('-').map(Number);
  const cleanRef = (refIso || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanRef)) {
    const [ry, rm, rd] = cleanRef.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ry, rm - 1, rd)) / 864e5);
  }
  const t = new Date();
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5
  );
}

export function formatDateBR(iso?: string): string {
  const clean = (iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return iso || '';
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

export function calcOrderTotalAmount(o: {
  servicePrice: number;
  partsPrice?: number;
  extraItems?: { q: number; v: number }[];
  deliveryFee?: number;
  discount?: number;
}): number {
  const extra = (o.extraItems || []).reduce(
    (sum, x) => sum + (Number(x.q) || 0) * (Number(x.v) || 0),
    0
  );
  // partsPrice legado permanece somado se não houver extraItems explicitando peças
  const total =
    (Number(o.servicePrice) || 0) +
    (Number(o.partsPrice) || 0) +
    extra +
    (Number(o.deliveryFee) || 0) -
    (Number(o.discount) || 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

export function calcTaxaEntregaByNeighborhood(neighborhood: string | undefined, cfg: LabConfig): number {
  const norm = (s: string) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  const b = norm(neighborhood || '');
  if (!b) return 0;
  const match = (cfg.entrega || []).find((z) => norm(z.bairro) === b);
  if (!match) return 0;
  return calcTaxaEntregaCobrada(match.valor, cfg.entMargem, cfg.entMin);
}

export function isQuoteExpired(
  order: { status: string; createdDate?: string },
  validOrcDays = 7
): boolean {
  if (order.status !== 'Orçamento') return false;
  if (!order.createdDate) return false;
  const limit = addDiasIso(order.createdDate, Math.max(1, Number(validOrcDays) || 7));
  if (!limit) return false;
  return limit < todayIsoLocal();
}

export function resolveOrderWarrantyDays(
  serviceCatalogId: string | undefined,
  servicos: ServiceCatalogItem[],
  cfg: Pick<LabConfig, 'garantiaDias'>
): number {
  if (serviceCatalogId) {
    const svc = servicos.find((s) => s.id === serviceCatalogId);
    if (svc && svc.gar !== '' && svc.gar !== undefined) {
      const parsed = parseInt(String(svc.gar), 10);
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
  }
  const cfgDays = parseInt(String(cfg.garantiaDias), 10);
  return Number.isNaN(cfgDays) || cfgDays < 0 ? 90 : cfgDays;
}

export function resolveOrderWarrantyUntil(
  order: {
    status: string;
    warrantyUntil?: string;
    deliveredAt?: string;
    createdDate?: string;
    serviceCatalogId?: string;
  },
  servicos: ServiceCatalogItem[],
  cfg: Pick<LabConfig, 'garantiaDias'>
): string {
  if (order.warrantyUntil) return order.warrantyUntil;
  if (order.status !== 'Entregue') return '';
  const baseDate = order.deliveredAt || order.createdDate || todayIsoLocal();
  const days = resolveOrderWarrantyDays(order.serviceCatalogId, servicos, cfg);
  return addDiasIso(baseDate, days);
}

export function getOrderWarrantyBadge(
  order: {
    status: string;
    warrantyUntil?: string;
    deliveredAt?: string;
    createdDate?: string;
    serviceCatalogId?: string;
  },
  servicos: ServiceCatalogItem[],
  cfg: Pick<LabConfig, 'garantiaDias'>
): { label: string; tone: 'ok' | 'warn' | 'muted' | 'blue' } {
  if (order.status === 'Cancelado') return { label: 'Cancelada', tone: 'muted' };
  if (order.status !== 'Entregue') return { label: `Em andamento · ${order.status}`, tone: 'blue' };
  const ga = resolveOrderWarrantyUntil(order, servicos, cfg);
  const d = diasAteIso(ga);
  if (d === null) return { label: 'Entregue', tone: 'muted' };
  if (d >= 0) {
    return {
      label:
        d === 0
          ? 'Garantia vence hoje'
          : `${d} ${d === 1 ? 'dia restante' : 'dias restantes'}`,
      tone: d === 0 ? 'warn' : 'ok',
    };
  }
  return { label: 'Garantia expirada', tone: 'muted' };
}

// ---------- Etapa 5: Motor de Alocação da Agenda de Bancada v17 (semPeca, fila, planejar, previsaoNova) ----------

export interface PlannedBlock {
  osId: number | '_novo';
  hours: number;
}

export interface PlannedDay {
  iso: string;
  cap: number;
  livre: number;
  blocos: PlannedBlock[];
}

export interface PlanejarResult {
  dias: PlannedDay[];
  prev: Record<string, string>;
  fim: string;
}

const ACTIVE_QUEUE_STATUSES = new Set<string>([
  'Aprovado',
  'Em reparo',
  'Aprovado / Fila',
  'Em Reparo SMD',
]);

/**
 * v17: OS Aprovada com peça encomendada que ainda não chegou não consome horas da bancada.
 */
export function semPeca(
  o: Pick<ServiceOrder, 'status' | 'pedPrev' | 'pedChegou'>
): boolean {
  return o.status === 'Aprovado' && Boolean(o.pedPrev) && !o.pedChegou;
}

/**
 * Retorna a fila ordenada por prioridade manual (`ord`) e depois pelo número da OS (`id`).
 */
export function getFilaOrders(orders: ServiceOrder[]): ServiceOrder[] {
  return (orders || [])
    .filter((o) => ACTIVE_QUEUE_STATUSES.has(o.status) && !semPeca(o))
    .sort((a, b) => (a.ord || 1e9) - (b.ord || 1e9) || a.id - b.id);
}

/**
 * OS que aguardam peça e por isso não ocupam horas na fila ativa.
 */
export function getAwaitingPartOrders(orders: ServiceOrder[]): ServiceOrder[] {
  return (orders || [])
    .filter((o) => semPeca(o) || o.status === 'Aguardando Peça')
    .sort(
      (a, b) =>
        (a.pedPrev || '9999-99-99').localeCompare(b.pedPrev || '9999-99-99') || a.id - b.id
    );
}

/**
 * Motor de alocação v17 (`planejar`):
 * Lê `cfg.horas` (0=Dom..6=Sáb) a partir de hoje, pula dias com 0h (Folga)
 * e distribui sequencialmente as horas das OS da fila, quebrando serviços longos em múltiplos dias.
 */
export function planejar(
  orders: ServiceOrder[],
  horas: number[],
  extraHours = 0
): PlanejarResult {
  const H = Array.isArray(horas) && horas.length === 7 ? horas : [...OFFICIAL_HOURS_BY_DOW];
  if (!H.some((h) => Number(h) > 0)) {
    return { dias: [], prev: {}, fim: '' };
  }

  const queue: { id: number | '_novo'; h: number }[] = getFilaOrders(orders).map((o) => ({
    id: o.id,
    h: Math.max(Number(o.estimatedHours) || 0, 0),
  }));
  if (extraHours > 0) {
    queue.push({ id: '_novo', h: Number(extraHours) });
  }

  const dias: PlannedDay[] = [];
  const prev: Record<string, string> = {};
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dia: PlannedDay | undefined;

  const novo = () => {
    for (let k = 0; k < 400; k++) {
      const cap = Math.max(0, Number(H[d.getDay()]) || 0);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if (cap > 0) {
        dia = { iso, cap, livre: cap, blocos: [] };
        dias.push(dia);
        return;
      }
    }
  };

  novo();
  if (!dia) {
    return { dias: [], prev: {}, fim: '' };
  }

  for (const o of queue) {
    let r = o.h;
    if (r <= 0) {
      prev[String(o.id)] = dia.iso;
      continue;
    }
    while (r > 1e-9) {
      if (dia.livre <= 1e-9) {
        const beforeLen = dias.length;
        novo();
        if (dias.length === beforeLen) break;
      }
      const u = Math.min(r, dia.livre);
      dia.blocos.push({ osId: o.id, hours: Math.round(u * 1000) / 1000 });
      dia.livre = Math.max(0, dia.livre - u);
      r -= u;
      prev[String(o.id)] = dia.iso;
    }
  }

  return {
    dias,
    prev,
    fim: dia.iso,
  };
}

export function previsaoNova(
  orders: ServiceOrder[],
  horas: number[],
  extraHours: number
): string {
  return extraHours > 0 ? planejar(orders, horas, extraHours).prev._novo || '' : '';
}

// ---------- Etapa 6: Estoque (low, giro 90d), Compras, Vendas & Métricas de Clientes ----------

/**
 * Regra v17 `low(p)`: saldo negativo ou menor/igual ao mínimo configurado (>0).
 */
export function isLowStock(p: Pick<PartItem, 'stock' | 'minStock'>): boolean {
  const q = Number(p.stock) || 0;
  const min = Number(p.minStock) || 0;
  return q < 0 || (min > 0 && q <= min);
}

export function computePartStatus(stock: number, minStock: number): PartItem['status'] {
  const q = Number(stock) || 0;
  const min = Number(minStock) || 0;
  if (q <= 0) return 'Esgotado';
  if (min > 0 && q <= min) return 'Alerta Reposição';
  return 'Disponível';
}

export function calcSaleTotalAmount(
  sale: Pick<SaleRecord, 'itens' | 'desc'>
): number {
  const sub = (sale.itens || []).reduce(
    (sum, x) => sum + (Number(x.q) || 0) * (Number(x.v) || 0),
    0
  );
  return Math.max(0, Math.round((sub - (Number(sale.desc) || 0)) * 100) / 100);
}

export function calcPurchaseTotalAmount(
  purchase: Pick<PurchaseRecord, 'itens' | 'frete' | 'desc'>
): number {
  const sub = (purchase.itens || []).reduce(
    (sum, x) => sum + (Number(x.q) || 0) * (Number(x.v) || 0),
    0
  );
  return Math.max(
    0,
    Math.round((sub + (Number(purchase.frete) || 0) - (Number(purchase.desc) || 0)) * 100) / 100
  );
}

export interface PartTurnoverRow {
  part: PartItem;
  sold90d: number;
  estimatedDaysRemaining: number | null;
}

/**
 * Giro de estoque (últimos 90 dias): soma saídas de peças em OS Entregues + Vendas não estornadas.
 */
export function calcInventoryTurnover90d(
  parts: PartItem[],
  orders: ServiceOrder[],
  vendas: SaleRecord[]
): { totalStockCost: number; rows: PartTurnoverRow[] } {
  const lim90 = addDiasIso(todayIsoLocal(), -90);
  const outByPart: Record<string, number> = {};

  (orders || []).forEach((o) => {
    if (o.status !== 'Entregue') return;
    const dt = (o.deliveredAt || o.createdDate || '').slice(0, 10);
    if (!dt || dt < lim90) return;
    if (!o.clientSuppliedPart && o.partId) {
      outByPart[o.partId] = (outByPart[o.partId] || 0) + 1;
    }
    (o.extraItems || []).forEach((it) => {
      if (it.p) {
        outByPart[it.p] = (outByPart[it.p] || 0) + Math.max(0, Number(it.q) || 0);
      }
    });
  });

  (vendas || []).forEach((v) => {
    if (v.st === 'Estornada') return;
    const dt = (v.data || '').slice(0, 10);
    if (!dt || dt < lim90) return;
    (v.itens || []).forEach((it) => {
      if (it.p) {
        outByPart[it.p] = (outByPart[it.p] || 0) + Math.max(0, Number(it.q) || 0);
      }
    });
  });

  const totalStockCost =
    Math.round(
      (parts || []).reduce(
        (sum, p) => sum + Math.max(0, Number(p.stock) || 0) * Math.max(0, Number(p.costPrice) || 0),
        0
      ) * 100
    ) / 100;

  const rows = (parts || []).map((part) => {
    const sold90d = Math.round((outByPart[part.id] || 0) * 100) / 100;
    const estimatedDaysRemaining =
      sold90d > 0 ? Math.max(0, Math.round((Number(part.stock) || 0) / (sold90d / 90))) : null;
    return { part, sold90d, estimatedDaysRemaining };
  });

  return { totalStockCost, rows };
}

export interface ClientComputedMetrics {
  ltv: number;
  ordersCount: number;
  deliveredOrdersCount: number;
  validSalesCount: number;
  lastActivityIso: string;
  daysInactive: number | null;
  isInactive90d: boolean;
  lastDevice: string;
}

export function calcClientMetrics(
  client: Client,
  orders: ServiceOrder[],
  vendas: SaleRecord[]
): ClientComputedMetrics {
  const clientNameLower = client.name.trim().toLowerCase();
  const matchedOrders = (orders || []).filter(
    (o) =>
      o.clientId === client.id ||
      (o.clientName || '').trim().toLowerCase() === clientNameLower
  );
  const deliveredOrders = matchedOrders.filter((o) => o.status === 'Entregue');

  const validSales = (vendas || []).filter(
    (v) =>
      v.st !== 'Estornada' &&
      (v.cli === client.id ||
        (!v.cli && (v.cliNome || '').trim().toLowerCase() === clientNameLower))
  );

  const osTotal = deliveredOrders.reduce((sum, o) => sum + calcOrderTotalAmount(o), 0);
  const salesTotal = validSales.reduce((sum, v) => sum + calcSaleTotalAmount(v), 0);
  const ltv = Math.round((osTotal + salesTotal) * 100) / 100;
  const ordersCount = deliveredOrders.length + validSales.length;

  let lastActivityIso = '';
  let lastDevice = client.lastDevice;
  let latestOsDate = '';

  matchedOrders.forEach((o) => {
    if (o.status === 'Cancelado') return;
    const dt = (o.deliveredAt || o.createdDate || '').slice(0, 10);
    if (dt && dt > lastActivityIso) lastActivityIso = dt;
    const osDt = (o.createdDate || o.deliveredAt || '').slice(0, 10);
    if (osDt >= latestOsDate && o.device) {
      latestOsDate = osDt;
      lastDevice = o.device;
    }
  });

  validSales.forEach((v) => {
    const dt = (v.data || '').slice(0, 10);
    if (dt && dt > lastActivityIso) lastActivityIso = dt;
  });

  const lim90 = addDiasIso(todayIsoLocal(), -90);
  const delta = lastActivityIso ? diasAteIso(lastActivityIso) : null;
  const daysInactive = delta !== null ? Math.max(0, -delta) : null;
  const isInactive90d = Boolean(lastActivityIso && lastActivityIso < lim90);

  return {
    ltv,
    ordersCount,
    deliveredOrdersCount: deliveredOrders.length,
    validSalesCount: validSales.length,
    lastActivityIso,
    daysInactive,
    isInactive90d,
    lastDevice,
  };
}

// ---------- Etapa 7: Financeiro em 3 Camadas, Cofre de Garantia & Equilíbrio 90d (v17) ----------

export type FinancePeriodKey = 'mes' | 'ant' | 'all';

const round2 = (x: number) => Math.round((Number(x) || 0) * 100) / 100;

const normFin = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function resolveTransactionIsoDate(tx: Pick<CashTransaction, 'isoDate' | 'updatedAt'>): string {
  if (tx.isoDate && /^\d{4}-\d{2}-\d{2}/.test(tx.isoDate)) {
    return tx.isoDate.slice(0, 10);
  }
  if (typeof tx.updatedAt === 'number' && tx.updatedAt > 0) {
    const d = new Date(tx.updatedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }
  return todayIsoLocal();
}

/**
 * `recLiqOS(o)`: receita líquida de serviço + itens - desconto (sem taxa de entrega).
 */
export function resolveOrderServiceNetRevenue(
  o: Pick<ServiceOrder, 'servicePrice' | 'partsPrice' | 'extraItems' | 'discount'>
): number {
  const extraRec = (o.extraItems || []).reduce(
    (sum, x) => sum + (Number(x.q) || 0) * (Number(x.v) || 0),
    0
  );
  return Math.max(
    0,
    round2(
      (Number(o.servicePrice) || 0) +
        (Number(o.partsPrice) || 0) +
        extraRec -
        (Number(o.discount) || 0)
    )
  );
}

/**
 * `baseRec(o)`: parte proporcional já paga correspondente a serviço + itens - desconto (exclui frete de entrega).
 */
export function resolveOrderBaseRec(o: ServiceOrder): number {
  const t = calcOrderTotalAmount(o);
  const r = resolveOrderServiceNetRevenue(o);
  const paid = Math.max(0, Number(o.paidAmount) || 0);
  return round2(paid * (t > 0 ? Math.max(0, r) / t : 1));
}

/**
 * `cpOS(o)`: Envelope 1 — peça (se não fornecida pelo cliente) + frete da peça + consumíveis + custo dos itens extras.
 */
export function resolveOrderPartsAndConsumablesCost(
  o: ServiceOrder,
  parts: PartItem[]
): number {
  const partCost = o.clientSuppliedPart ? 0 : Math.max(0, Number(o.partCost) || 0);
  const partFreight = o.clientSuppliedPart ? 0 : Math.max(0, Number(o.partFreight) || 0);
  const consumables = Math.max(0, Number(o.consumables) || 0);
  const itemsCost = (o.extraItems || []).reduce((sum, x) => {
    const q = Math.max(0, Number(x.q) || 0);
    const unitCost =
      x.c !== undefined
        ? Math.max(0, Number(x.c) || 0)
        : Math.max(0, Number(parts.find((p) => p.id === x.p)?.costPrice) || 0);
    return sum + q * unitCost;
  }, 0);
  return round2(partCost + partFreight + consumables + itemsCost);
}

/**
 * `finRef(x)`: identifica devoluções e estornos que abatem o faturamento bruto, e não contam como despesa paga.
 */
export function isRefundOrReversalTx(tx: Pick<CashTransaction, 'kind' | 'title'>): boolean {
  return (
    tx.kind === 'dev' ||
    tx.kind === 'estSinal' ||
    /^Estorno da venda/.test(tx.title || '')
  );
}

export type ExpenseClassKey = 'gar' | 'est' | 'pec' | 'fer' | 'out';

/**
 * `finCls(x)`: classifica uma saída paga em Garantia (`gar`), Estrutura fixa (`est`), Peças (`pec`), Ferramentas (`fer`) ou Outros (`out`).
 */
export function classifyExpenseTx(
  tx: Pick<CashTransaction, 'id' | 'kind' | 'tag' | 'channel'>
): ExpenseClassKey {
  const tagNorm = normFin(tx.tag);
  if (tx.kind === 'gar' || tagNorm === 'garantia') return 'gar';
  if (
    String(tx.id).startsWith('fx_') ||
    tx.channel === 'Fixo' ||
    tagNorm === 'aluguel' ||
    tagNorm === 'internet' ||
    tagNorm === 'fixo' ||
    tagNorm === 'estrutura fixa'
  ) {
    return 'est';
  }
  if (
    tx.kind === 'compra' ||
    tx.channel === 'Fornecedores' ||
    tagNorm === 'pecas' ||
    tagNorm === 'pecas/insumos' ||
    tagNorm === 'pdv-pecas'
  ) {
    return 'pec';
  }
  if (tagNorm === 'ferramentas') return 'fer';
  return 'out';
}

/**
 * Resolve o envelope de destino/origem de um lançamento (`'conta'` | `'porquinho'`).
 * Retrocompatível: lançamentos antigos sem `env` são tratados como `'conta'` (ou `'porquinho'` quando `kind === 'gar'`).
 */
export function resolveTransactionEnvelope(
  tx: Pick<CashTransaction, 'env' | 'kind' | 'tag' | 'type' | 'channel' | 'id'>
): TransactionEnvelope {
  if (tx.env === 'porquinho' || tx.env === 'conta') return tx.env;
  if (tx.kind === 'gar' || (tx.type === 'out' && classifyExpenseTx(tx) === 'gar')) {
    return 'porquinho';
  }
  return 'conta';
}

/**
 * Resolve o subenvelope do Porquinho Inter (`'giro'` | `'garantia'`).
 * Retrocompatível: lançamentos sem `subEnv` vão para `'garantia'` quando `kind === 'gar'` e `'giro'` nos demais casos.
 */
export function resolveTransactionSubEnvelope(
  tx: Pick<CashTransaction, 'subEnv' | 'kind' | 'tag' | 'type' | 'channel' | 'id'>
): TransactionSubEnvelope {
  if (tx.subEnv === 'garantia' || tx.subEnv === 'giro') return tx.subEnv;
  if (tx.kind === 'gar' || (tx.type === 'out' && classifyExpenseTx(tx) === 'gar')) {
    return 'garantia';
  }
  return 'giro';
}

export interface CofreGarantiaResult {
  pct: number;
  base: number;
  acc: number;
  garManualIn: number;
  gastos: number;
  saldo: number;
  giroAcc: number;
  giroManualIn: number;
  giroOut: number;
  giroSaldo: number;
  contaIn: number;
  contaOut: number;
  contaNet: number;
  porquinhoIn: number;
  porquinhoOut: number;
  porquinhoManualNet: number;
  porquinhoTotal: number;
  totalCashBalance: number;
  disp: number;
}

/**
 * `cofre()` v18.1: Cofre global da Reserva de Garantia + Capital de Giro no Porquinho Inter.
 * Particiona os lançamentos entre Conta Corrente Inter (`env === 'conta'`) e Porquinho Inter (`env === 'porquinho'`,
 * subdividido entre Envelope 2 `subEnv === 'garantia'` e Envelope 3 `subEnv === 'giro'`).
 * Lucro Líquido Disponível (`disp`) = caixa total − total alocado no Porquinho Inter (saldo livre na Conta Corrente).
 */
export function calcCofreReservaGarantia(
  orders: ServiceOrder[],
  transactions: CashTransaction[],
  cfg: Pick<LabConfig, 'reservaGar'> & Partial<Pick<LabConfig, 'reservaCap'>>
): CofreGarantiaResult {
  const pct = Math.max(0, (Number(cfg.reservaGar) || 0) * 100);
  const pGiro = Math.max(0, Number(cfg.reservaCap) || 0);
  const base = round2(
    (orders || [])
      .filter((o) => o.status === 'Entregue')
      .reduce((sum, o) => sum + resolveOrderBaseRec(o), 0)
  );
  const acc = Math.round(base * pct) / 100;
  const giroAcc = round2(base * pGiro);
  const txs = transactions || [];

  let contaIn = 0;
  let contaOut = 0;
  let garManualIn = 0;
  let garOut = 0;
  let giroManualIn = 0;
  let giroOut = 0;
  txs.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    const env = resolveTransactionEnvelope(tx);
    if (env === 'porquinho') {
      const sub = resolveTransactionSubEnvelope(tx);
      if (tx.type === 'in') {
        if (sub === 'garantia') garManualIn += amt;
        else giroManualIn += amt;
      } else if (tx.type === 'out') {
        if (sub === 'garantia') garOut += amt;
        else giroOut += amt;
      }
    } else if (tx.type === 'in') {
      contaIn += amt;
    } else if (tx.type === 'out') {
      contaOut += amt;
    }
  });

  contaIn = round2(contaIn);
  contaOut = round2(contaOut);
  const contaNet = round2(contaIn - contaOut);
  garManualIn = round2(garManualIn);
  const gastos = round2(garOut);
  giroManualIn = round2(giroManualIn);
  giroOut = round2(giroOut);
  const porquinhoIn = round2(garManualIn + giroManualIn);
  const porquinhoOut = round2(gastos + giroOut);
  const porquinhoManualNet = round2(porquinhoIn - porquinhoOut);

  const totalCashBalance = round2(contaNet + porquinhoManualNet);
  const saldo = round2(acc + garManualIn - gastos);
  const giroSaldo = round2(giroAcc + giroManualIn - giroOut);
  const porquinhoTotal = round2(saldo + giroSaldo);
  const disp = round2(totalCashBalance - porquinhoTotal);
  return {
    pct,
    base,
    acc,
    garManualIn,
    gastos,
    saldo,
    giroAcc,
    giroManualIn,
    giroOut,
    giroSaldo,
    contaIn,
    contaOut,
    contaNet,
    porquinhoIn,
    porquinhoOut,
    porquinhoManualNet,
    porquinhoTotal,
    totalCashBalance,
    disp,
  };
}

export interface Equilibrio90dResult {
  fixos: number;
  meta: number;
  ticket: number;
  custoVar: number;
  contrib: number;
  necessarias: number | null;
  feitas: number;
  faltam: number | null;
  faturamento: number;
  metaFat: number;
  estimado: boolean;
  sampleCount90d: number;
  cabem: number | null;
  horasFat: number;
  avgHours: number;
  reserva: number;
}

/**
 * `equilibrio()` v17: Termômetro do ponto de equilíbrio com base nos últimos 90 dias (fallback ticketEsp/custoEsp quando <10 OS).
 */
export function calcEquilibrio90d(
  orders: ServiceOrder[],
  transactions: CashTransaction[],
  parts: PartItem[],
  cfg: LabConfig,
  fixosList: FixedExpenseItem[]
): Equilibrio90dResult {
  const hoje = todayIsoLocal();
  const mes = hoje.slice(0, 7);
  const lim = addDiasIso(hoje, -90);
  const eff = calcEffectivePricingFromConfig(cfg, fixosList);
  const fixos = eff.fixedCosts;
  const meta = round2(fixos + (Number(cfg.proLabore) || 0));

  const delivered90 = (orders || []).filter((o) => {
    if (o.status !== 'Entregue' || (Number(o.servicePrice) || 0) <= 0) return false;
    const dt = (o.deliveredAt || o.createdDate || '').slice(0, 10);
    return dt >= lim;
  });
  const n = delivered90.length;
  const estimado = n < 10 && (Number(cfg.ticketEsp) || 0) > 0;

  let tk = 0;
  let cv = 0;
  let mh = 1;
  if (estimado) {
    tk = Number(cfg.ticketEsp) || 0;
    cv = Number(cfg.custoEsp) || 0;
    mh = 1;
  } else if (n > 0) {
    tk = delivered90.reduce((sum, o) => sum + resolveOrderServiceNetRevenue(o), 0) / n;
    cv = delivered90.reduce((sum, o) => sum + resolveOrderPartsAndConsumablesCost(o, parts), 0) / n;
    mh = delivered90.reduce((sum, o) => sum + (Number(o.estimatedHours) || 0), 0) / n;
  }

  const taxa = eff.totalRetentionPct / 100;
  const contrib = tk * (1 - taxa) - cv;
  const necessarias = contrib > 0 ? Math.ceil(meta / contrib) : null;
  const feitas = (orders || []).filter(
    (o) => o.status === 'Entregue' && (o.deliveredAt || o.createdDate || '').slice(0, 7) === mes
  ).length;
  const faltam = necessarias === null ? null : Math.max(0, necessarias - feitas);

  const faturamento = round2(
    (transactions || [])
      .filter(
        (x) =>
          resolveTransactionIsoDate(x).slice(0, 7) === mes &&
          !x.aporte &&
          (x.type === 'in' || isRefundOrReversalTx(x))
      )
      .reduce((sum, x) => sum + (x.type === 'in' ? Number(x.amount) || 0 : -(Number(x.amount) || 0)), 0)
  );
  const horasFat = eff.metrics.billableHours;
  const cabem = mh > 0 ? Math.floor(horasFat / mh) : null;
  const reserva = round2(Math.max(0, faturamento) * (Number(cfg.reservaCap) || 0));

  return {
    fixos,
    meta,
    ticket: round2(tk),
    custoVar: round2(cv),
    contrib: round2(contrib),
    necessarias,
    feitas,
    faltam,
    faturamento,
    metaFat: Number(cfg.metaMes) || 0,
    estimado,
    sampleCount90d: n,
    cabem,
    horasFat,
    avgHours: mh,
    reserva,
  };
}

export interface FinancePeriodMeta {
  key: FinancePeriodKey;
  ym: string;
  all: boolean;
  label: string;
  matchesIso: (iso?: string) => boolean;
}

export function getFinancePeriodMeta(key: FinancePeriodKey): FinancePeriodMeta {
  const nowIso = todayIsoLocal();
  let ym = nowIso.slice(0, 7);
  if (key === 'ant') {
    let y = Number(ym.slice(0, 4));
    let m = Number(ym.slice(5, 7)) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    ym = `${y}-${String(m).padStart(2, '0')}`;
  }
  const fMes = `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
  return {
    key,
    ym,
    all: key === 'all',
    label:
      key === 'all'
        ? 'Todo o período'
        : `${key === 'ant' ? 'Mês anterior' : 'Mês atual'} · ${fMes}`,
    matchesIso: (iso?: string) => key === 'all' || String(iso || '').slice(0, 7) === ym,
  };
}

export interface FinLayersResult {
  per: FinancePeriodMeta;
  filteredTxs: CashTransaction[];
  D: Record<ExpenseClassKey, number>;
  bruto: number;
  aportes: number;
  dev: number;
  sai: number;
  desp: number;
  saldoOp: number;
  deliveredOrders: ServiceOrder[];
  n: number;
  Rp: number;
  env1: number;
  prol: number;
  tPag: number;
  acc2: number;
  acc2Manual: number;
  ret3: number;
  ret3Manual: number;
  gastoGar: number;
  usoFer: number;
  giroAcc: number;
  garManualIn: number;
  giroManualIn: number;
  giroOut: number;
  ferPorquinho: number;
  porquinhoManualIn: number;
  porquinhoManualOut: number;
  porquinhoOtherOut: number;
  porquinhoTotal: number;
  operationalBalance: number;
  saldo3: number;
  saldo2: number;
  disp: number;
  cofre: CofreGarantiaResult;
  lucro: number;
  meta: number;
  contrib: number;
  cob: number;
  avg: number;
  falta: number | null;
  pGar: number;
  pGiro: number;
  pPag: number;
  equilibrio: Equilibrio90dResult;
}

/**
 * `finCalc()` v18.1: Motor financeiro completo em 3 camadas + Envelopes Inter direcionáveis com subdestino:
 * Camada 1 = Fluxo Operacional de Caixa (pela data do lançamento; `aporte: true` não infla o faturamento)
 * Camada 2 = Envelopes Carimbados & Cofre de Garantia (OS entregues + aportes/saídas manuais nos subenvelopes Garantia/Giro)
 * Camada 3 = Resultado Real (após pró-labore e envelopes) & Termômetro de Equilíbrio
 */
export function calcFinLayers(
  params: {
    orders: ServiceOrder[];
    transactions: CashTransaction[];
    parts: PartItem[];
    cfg: LabConfig;
    fixos: FixedExpenseItem[];
  },
  periodKey: FinancePeriodKey = 'mes'
): FinLayersResult {
  const { orders, transactions, parts, cfg, fixos } = params;
  const per = getFinancePeriodMeta(periodKey);
  const eff = calcEffectivePricingFromConfig(cfg, fixos);

  const pGar = Math.max(0, Number(cfg.reservaGar) || 0);
  const pGiro = Math.max(0, Number(cfg.reservaCap) || 0);
  const pPag = Math.max(0, Number(cfg.taxaPag) || 0);

  const filteredTxs = (transactions || []).filter((tx) =>
    per.matchesIso(resolveTransactionIsoDate(tx))
  );
  const En = filteredTxs.filter((tx) => tx.type === 'in');
  const Sa = filteredTxs.filter((tx) => tx.type === 'out');

  const D: Record<ExpenseClassKey, number> = {
    pec: 0,
    est: 0,
    fer: 0,
    out: 0,
    gar: 0,
  };
  Sa.filter((tx) => !isRefundOrReversalTx(tx)).forEach((tx) => {
    const cls = classifyExpenseTx(tx);
    D[cls] = round2(D[cls] + (Number(tx.amount) || 0));
  });

  const bruto = round2(
    En.filter((tx) => !tx.aporte).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const aportes = round2(
    En.filter((tx) => Boolean(tx.aporte)).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const dev = round2(
    Sa.filter(isRefundOrReversalTx).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const sai = round2(Sa.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0));
  const desp = round2(D.pec + D.est + D.fer + D.out + D.gar);
  const saldoOp = round2(bruto - sai);

  const deliveredOrders = (orders || []).filter(
    (o) => o.status === 'Entregue' && per.matchesIso(o.deliveredAt || o.createdDate || '')
  );
  const Rp = round2(deliveredOrders.reduce((sum, o) => sum + resolveOrderBaseRec(o), 0));
  const env1 = round2(
    deliveredOrders.reduce((sum, o) => sum + resolveOrderPartsAndConsumablesCost(o, parts), 0)
  );
  const prol = round2(
    deliveredOrders.reduce((sum, o) => {
      const h = Math.max(0, Number(o.estimatedHours) || 0);
      const rate =
        o.snapHourlyRate !== undefined && o.snapHourlyRate !== null
          ? Number(o.snapHourlyRate)
          : eff.hourlyRate;
      return sum + h * rate;
    }, 0)
  );

  const tPag = round2(Rp * pPag);
  const acc2 = round2(Rp * pGar);
  const acc2Manual = round2(
    En.filter(
      (tx) =>
        resolveTransactionEnvelope(tx) === 'porquinho' &&
        resolveTransactionSubEnvelope(tx) === 'garantia'
    ).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const ret3 = round2(Rp * pGiro);
  const ret3Manual = round2(
    En.filter(
      (tx) =>
        resolveTransactionEnvelope(tx) === 'porquinho' &&
        resolveTransactionSubEnvelope(tx) !== 'garantia'
    ).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const gastoGar = round2(
    Sa.filter(
      (tx) =>
        resolveTransactionEnvelope(tx) === 'porquinho' &&
        resolveTransactionSubEnvelope(tx) === 'garantia'
    ).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const usoFer = round2(
    Sa.filter(
      (tx) =>
        resolveTransactionEnvelope(tx) === 'porquinho' &&
        resolveTransactionSubEnvelope(tx) !== 'garantia'
    ).reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );

  const cofre = calcCofreReservaGarantia(orders, transactions, cfg);
  const giroAcc = cofre.giroAcc;
  const garManualIn = cofre.garManualIn;
  const giroManualIn = cofre.giroManualIn;
  const giroOut = cofre.giroOut;
  const ferPorquinho = giroOut;
  const saldo3 = cofre.giroSaldo;
  const porquinhoManualIn = cofre.porquinhoIn;
  const porquinhoManualOut = cofre.porquinhoOut;
  const porquinhoOtherOut = round2(
    (transactions || [])
      .filter((tx) => {
        if (tx.type !== 'out' || resolveTransactionEnvelope(tx) !== 'porquinho') return false;
        if (isRefundOrReversalTx(tx)) return true;
        const cls = classifyExpenseTx(tx);
        return cls !== 'gar' && cls !== 'fer';
      })
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  );
  const porquinhoTotal = cofre.porquinhoTotal;
  const operationalBalance = cofre.disp;

  const lucro = round2(Rp - env1 - tPag - (D.est + D.out) - prol - acc2 - ret3);

  const eq = calcEquilibrio90d(orders, transactions, parts, cfg, fixos);
  const meta = round2(eff.fixedCosts + (Number(cfg.proLabore) || 0));
  const contrib = round2(Rp - env1 - tPag - acc2);
  const n = deliveredOrders.length;
  const avg = n > 0 ? contrib / n : eq.contrib;
  const falta = avg > 0 ? Math.ceil(Math.max(0, meta - contrib) / avg - 1e-9) : null;

  return {
    per,
    filteredTxs,
    D,
    bruto,
    aportes,
    dev,
    sai,
    desp,
    saldoOp,
    deliveredOrders,
    n,
    Rp,
    env1,
    prol,
    tPag,
    acc2,
    acc2Manual,
    ret3,
    ret3Manual,
    gastoGar,
    usoFer,
    giroAcc,
    garManualIn,
    giroManualIn,
    giroOut,
    ferPorquinho,
    porquinhoManualIn,
    porquinhoManualOut,
    porquinhoOtherOut,
    porquinhoTotal,
    operationalBalance,
    saldo3,
    saldo2: cofre.saldo,
    disp: cofre.disp,
    cofre,
    lucro,
    meta,
    contrib,
    cob: meta > 0 ? contrib / meta : 0,
    avg,
    falta,
    pGar,
    pGiro,
    pPag,
    equilibrio: eq,
  };
}

/**
 * `taxaAprov()` v17: aprovados / (aprovados + cancelados)
 */
export function calcOrderApprovalRate(orders: ServiceOrder[]): number | null {
  const approvedSet = new Set([
    'Aprovado',
    'Aprovado / Fila',
    'Aguardando Peça',
    'Em reparo',
    'Em Reparo SMD',
    'Pronto',
    'Pronto Retirada',
    'Entregue',
  ]);
  const a = (orders || []).filter((o) => approvedSet.has(o.status)).length;
  const r = (orders || []).filter((o) => o.status === 'Cancelado').length;
  return a + r > 0 ? a / (a + r) : null;
}

export function roundStockQty(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function formatStockQty(n: number, unit?: string): string {
  const rounded = roundStockQty(n);
  const str = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return unit && unit.trim() ? `${str} ${unit.trim()}` : str;
}

export function getPartExpiryStatus(
  expiryDate?: string,
  todayIso = todayIsoLocal()
): {
  status: 'none' | 'expired' | 'expiring30' | 'ok';
  daysRemaining: number | null;
  label: string;
} {
  const clean = (expiryDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return { status: 'none', daysRemaining: null, label: '' };
  }
  const diff = diasAteIso(clean, todayIso);
  if (diff === null) {
    return { status: 'none', daysRemaining: null, label: '' };
  }
  if (diff < 0) {
    return {
      status: 'expired',
      daysRemaining: diff,
      label: `Vencido há ${-diff}d (${formatDateBR(clean)})`,
    };
  }
  if (diff === 0) {
    return {
      status: 'expiring30',
      daysRemaining: 0,
      label: `Vence hoje (${formatDateBR(clean)})`,
    };
  }
  if (diff <= 30) {
    return {
      status: 'expiring30',
      daysRemaining: diff,
      label: `Vence em ${diff}d (${formatDateBR(clean)})`,
    };
  }
  return {
    status: 'ok',
    daysRemaining: diff,
    label: `Val. ${formatDateBR(clean)}`,
  };
}

/**
 * Resume contas a pagar pendentes garantindo ZERO dupla contagem com compras já lançadas no caixa.
 */
export function calcPendingPayablesSummary(
  contasPagar: PayableBill[],
  transactions: CashTransaction[],
  todayIso = todayIsoLocal()
): {
  saldoComprometido: number;
  overdueBills: PayableBill[];
  dueTodayBills: PayableBill[];
  pendingBills: PayableBill[];
} {
  const paidPurchaseIds = new Set<string>();
  const paidBillIds = new Set<string>();
  (transactions || []).forEach((tx) => {
    if (tx.type === 'out') {
      if (tx.purchaseId && tx.kind === 'compra') paidPurchaseIds.add(tx.purchaseId);
      if (tx.payableBillId) paidBillIds.add(tx.payableBillId);
    }
  });

  const pendingBills = (contasPagar || [])
    .filter((bill) => {
      if (bill.status !== 'Pendente') return false;
      if (bill.txId || paidBillIds.has(bill.id)) return false;
      if (bill.purchaseId && paidPurchaseIds.has(bill.purchaseId)) return false;
      return true;
    })
    .sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));

  const saldoComprometido = round2(
    pendingBills.reduce((s, b) => s + Math.max(0, Number(b.valor) || 0), 0)
  );
  const overdueBills = pendingBills.filter(
    (b) => Boolean(b.vencimento) && b.vencimento < todayIso
  );
  const dueTodayBills = pendingBills.filter((b) => b.vencimento === todayIso);

  return {
    saldoComprometido,
    overdueBills,
    dueTodayBills,
    pendingBills,
  };
}

export interface TopExecutedServiceRow {
  key: string;
  name: string;
  count: number;
  totalRevenue: number;
  avgTicket: number;
}

export function calcTopExecutedServices(
  orders: ServiceOrder[],
  servicos: ServiceCatalogItem[]
): TopExecutedServiceRow[] {
  const map = new Map<string, TopExecutedServiceRow>();
  const svcNameById = new Map((servicos || []).map((s) => [s.id, s.nome]));

  (orders || []).forEach((o) => {
    if (o.status !== 'Entregue') return;
    const rawName =
      (o.serviceCatalogId && svcNameById.get(o.serviceCatalogId)) ||
      (o.serviceCatalogName || '').trim() ||
      (o.issue || '').trim() ||
      'Serviço Técnico';
    const key = o.serviceCatalogId || rawName.toLowerCase();
    const revenue = calcOrderTotalAmount(o);
    const cur = map.get(key) || {
      key,
      name: rawName,
      count: 0,
      totalRevenue: 0,
      avgTicket: 0,
    };
    cur.count += 1;
    cur.totalRevenue = round2(cur.totalRevenue + revenue);
    cur.avgTicket = cur.count > 0 ? round2(cur.totalRevenue / cur.count) : 0;
    map.set(key, cur);
  });

  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || b.totalRevenue - a.totalRevenue
  );
}

export function roundCurrency3(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function normalizeImeiDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export interface ImeiValidationResult {
  digits: string;
  status: 'empty' | 'incomplete' | 'valid' | 'invalid';
  label: string;
}

/**
 * Valida matematicamente IMEI de 15 dígitos pelo Algoritmo de Luhn (100% offline).
 */
export function validateImeiLuhn(raw: string): ImeiValidationResult {
  const digits = normalizeImeiDigits(raw);
  if (!digits) {
    return { digits: '', status: 'empty', label: '' };
  }
  if (digits.length !== 15) {
    return {
      digits,
      status: 'incomplete',
      label: `Incompleto (${digits.length}/15 dígitos)`,
    };
  }
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = Number(digits[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  if (sum % 10 === 0) {
    return { digits, status: 'valid', label: 'IMEI válido (Luhn OK)' };
  }
  return { digits, status: 'invalid', label: 'Dígito verificador inválido' };
}

export interface LocalImeiHistoryResult {
  matches: ServiceOrder[];
  hasFlagged: boolean;
  flaggedStatus: 'impedido' | 'suspeito' | '';
}

export function findLocalImeiHistory(
  imeiRaw: string,
  orders: ServiceOrder[],
  excludeOrderId?: number
): LocalImeiHistoryResult {
  const digits = normalizeImeiDigits(imeiRaw);
  const cleanRaw = String(imeiRaw || '').trim().toLowerCase();
  if (digits.length < 8 && cleanRaw.length < 8) {
    return { matches: [], hasFlagged: false, flaggedStatus: '' };
  }
  const matches = (orders || [])
    .filter((o) => {
      if (excludeOrderId !== undefined && o.id === excludeOrderId) return false;
      const oRaw = String(o.imei || '').trim().toLowerCase();
      if (!oRaw || oRaw === 'não informado') return false;
      const oDigits = normalizeImeiDigits(o.imei);
      if (digits.length >= 8 && oDigits) {
        return oDigits === digits;
      }
      return oRaw === cleanRaw;
    })
    .sort((a, b) => b.id - a.id);

  const hasImpedido = matches.some((m) => m.triage?.imeiSt === 'impedido');
  const hasSuspeito = matches.some((m) => m.triage?.imeiSt === 'suspeito');
  const flaggedStatus = hasImpedido ? 'impedido' : hasSuspeito ? 'suspeito' : '';
  return {
    matches,
    hasFlagged: Boolean(flaggedStatus),
    flaggedStatus,
  };
}

