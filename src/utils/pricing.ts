import {
  FixedExpenseItem,
  LabConfig,
  PartsMarginCurveConfig,
  RoundingConfig,
  ServiceCatalogItem,
} from '../types/lab';

// Official MicroLab Financial & Pricing Parameters

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

export function diasAteIso(iso?: string): number | null {
  const clean = (iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const [y, m, d] = clean.split('-').map(Number);
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

