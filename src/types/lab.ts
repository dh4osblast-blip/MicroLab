export type RouteId =
  | 'inicio'
  | 'nova-os'
  | 'ordens-de-servico'
  | 'clientes'
  | 'agenda-de-bancada'
  | 'pdv-rapido'
  | 'produtos-e-pecas'
  | 'fornecedores'
  | 'garantias'
  | 'envelopes-inter'
  | 'simulador-orcamento'
  | 'fluxo-de-caixa'
  | 'gerador-pix'
  | 'fonte'
  | 'defeitos'
  | 'bancada'
  | 'check-in-check-out'
  | 'configuracoes';

export type OrderStatus =
  | 'Orçamento'
  | 'Aprovado'
  | 'Aguardando Peça'
  | 'Em reparo'
  | 'Pronto'
  | 'Entregue'
  | 'Cancelado'
  | 'Em Triagem'
  | 'Aprovado / Fila'
  | 'Em Reparo SMD'
  | 'Pronto Retirada';

export type UserRole = 'Administrador' | 'Atendente' | 'Vendedor' | 'Técnico';

export interface AppUser {
  id: string;
  nome: string;
  nivel: UserRole;
  /** Salt criptográfico PBKDF2/SHA-256 (nunca armazena PIN em texto puro) */
  s: string;
  /** Hash PBKDF2/SHA-256 derivado do PIN + salt */
  h: string;
  updatedAt?: number;
}

export interface TechnicianPerson {
  id: string;
  nome: string;
  tel?: string;
  email?: string;
  updatedAt?: number;
}

export interface SellerPerson {
  id: string;
  nome: string;
  tel?: string;
  email?: string;
  updatedAt?: number;
}

export interface ServiceCatalogItem {
  id: string;
  nome: string;
  cat: string;
  tempo: number;
  cons: number;
  peca: string;
  gar: string;
  mercado: number;
  updatedAt?: number;
}

export interface FixedExpenseItem {
  id: string;
  nome: string;
  valor: number;
  cat: string;
  dia: number;
  ativo: boolean;
  ultimo: string;
  updatedAt?: number;
}

export interface SaleItem {
  p?: string;
  d: string;
  q: number;
  v: number;
  c?: number;
}

export interface SaleRecord {
  id: string;
  n: number;
  data: string;
  cli?: string;
  cliNome?: string;
  vend?: string;
  forma: string;
  desc: number;
  itens: SaleItem[];
  st?: '' | 'Estornada';
  updatedAt?: number;
}

export interface PurchaseItem {
  p?: string;
  d: string;
  q: number;
  v: number;
}

export interface PurchaseRecord {
  id: string;
  n: number;
  data: string;
  forn: string;
  st: 'A caminho' | 'Recebido';
  frete: number;
  desc: number;
  recebido?: string;
  itens: PurchaseItem[];
  updatedAt?: number;
}

export interface PowerSupplyMemory {
  id: string;
  nome: string;
  v: number;
  i: number;
  updatedAt?: number;
}

export interface CustomDefectItem {
  id: string;
  t: string;
  p: string[];
}

export interface PowerSupplyTestEvidence {
  kind: 'fuga' | 'pulso' | 'curto' | 'alto' | 'prot' | 'info';
  text: string;
  cliText?: string;
}

export interface PowerSupplyTestEntry {
  sid: number;
  dt: string;
  dur: string;
  fugaMa: number | null;
  bootA: number | null;
  ipkA: number | null;
  vavgV?: number | null;
  iminA?: number | null;
  iavgA?: number | null;
  pmaxW?: number | null;
  via?: string;
  prots?: string[];
  evidencias?: PowerSupplyTestEvidence[];
  cliResumo?: string;
  diag: string;
  nt: string;
}

export interface OrderDiagnosticReport {
  id: string;
  data: string;
  defeito: string;
  passos: { t: string; r: 'pend' | 'ok' | 'falha' }[];
  obs: string;
}

export interface DeliveryZone {
  bairro: string;
  valor: number;
}

export interface PartsMarginCurveConfig {
  limite: number;
  baixaMax: number;
  baixaMin: number;
  altaMax?: number;
  altaMin: number;
  teto: number;
}

export interface RoundingConfig {
  ate: number;
  baixo: number;
  alto: number;
}

export interface ManualPricingConfig {
  modo: 'auto' | 'manual';
  hora: number;
  indireto: number;
  taxa: number;
  margem: number;
}

export interface MicroComplexityLevel {
  id: string;
  nome: string;
  mult: number;
}

export interface LabConfig {
  bg: string;
  bgImg?: string;
  logoL?: string;
  logoD?: string;
  pixKey: string;
  pixNome: string;
  pixCid: string;
  /** Capacidade por dia da semana no índice Date.getDay(): [Dom, Seg, Ter, Qua, Qui, Sex, Sáb] */
  horas: number[];
  /** Fração de ocupação faturável (ex: 0.5 = 50%) */
  ocup: number;
  horaMin: number;
  proLabore: number;
  /** Taxa média de recebimento em fração (ex: 0 = 0%) */
  taxaPag: number;
  /** Reserva de garantia em fração (ex: 0.05 = 5%) */
  reservaGar: number;
  /** Reserva de capital de giro em fração (ex: 0.1 = 10%, fora do preço) */
  reservaCap: number;
  preco: ManualPricingConfig;
  margem: PartsMarginCurveConfig;
  arred: RoundingConfig;
  entrega: DeliveryZone[];
  entMargem: number;
  entMin: number;
  validOrc: number;
  diagTaxa: number | '';
  diagHoras: number;
  ticketEsp: number;
  custoEsp: number;
  metaMes: number;
  garantiaDias: number;
  formas: string[];
  idle: number;
  termoGarantia: string;
  condExec: string;
  termoPecaCli: string;
  catDesp: string[];
  fonteTema: string;
  tempCal: Record<string, string>;
  pmicMin: number;
  defeitosExtra: CustomDefectItem[];
  complexidades: MicroComplexityLevel[];
  techSignatureDataUrl?: string;
  autoPrintTechSignature?: boolean;
  lastBk?: string;
  _ts?: Record<string, number>;
  updatedAt?: number;
}

export interface TelemetryReading {
  voltage: number;
  current: number;
  power: number;
  note: string;
  recordedAt: string;
}

export interface OrderExtraItem {
  id?: string;
  p?: string;
  d: string;
  q: number;
  v: number;
  c?: number;
}

export interface OrderTriage {
  imeiSt?: 'regular' | 'suspeito' | 'impedido' | '';
  apagado?: boolean;
  bat?: boolean;
  oxi?: boolean;
  esd?: boolean;
  semImei?: string;
  impOk?: string;
}

export interface OsPrefillDraft {
  source?: 'simulator' | 'warranty';
  clientId?: string;
  brand?: string;
  model?: string;
  device?: string;
  imei?: string;
  issue?: string;
  notes?: string;
  serviceCatalogId?: string;
  partId?: string;
  partCost?: number;
  partFreight?: number;
  consumables?: number;
  estimatedHours?: number;
  hourlyRateOverride?: number;
  complexityLabel?: string;
  servicePrice?: number;
  status?: OrderStatus;
  returnWarrantyFromId?: number;
}

export interface ServiceOrder {
  id: number;
  code: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientCpf: string;
  device: string;
  brand?: string;
  model?: string;
  deviceType: 'smartphone' | 'tablet' | 'watch' | 'laptop';
  imei: string;
  /** LGPD: Apenas indicador booleano persistido; senha/padrão ficam só em RAM da sessão */
  hasPasscode?: boolean;
  accessories?: string[];
  checkInNotes?: string;
  notes?: string;
  evidenceCount?: number;
  evidencePhotos?: Partial<Record<'front' | 'back' | 'rails' | 'dock', string>>;
  signatureDataUrl?: string;
  clientAcceptanceType?: 'printed' | 'digital_channel' | 'screen_signature';
  clientAcceptanceChannel?: 'WhatsApp' | 'E-mail' | 'Instagram' | 'Presencial';
  clientAcceptanceAt?: string;
  clientSignatureDataUrl?: string;
  entryChecklist?: Record<string, boolean>;
  entryChecklist7?: Record<string, 's' | 'n' | 't'>;
  triage?: OrderTriage;
  exitChecklist?: Record<string, boolean>;
  exitWarningNote?: string;
  issue: string;
  diagnosis: string;
  status: OrderStatus;
  priority: 'Urgente' | 'Normal';
  technician: string;
  createdAt: string;
  createdDate?: string;
  estimatedHours: number;
  ord?: number;
  serviceCatalogId?: string;
  serviceCatalogName?: string;
  partId?: string;
  partCost?: number;
  partFreight?: number;
  consumables?: number;
  clientSuppliedPart?: boolean;
  partPurchased?: boolean;
  deliveryFee?: number;
  deliveryRealCost?: number;
  extraItems?: OrderExtraItem[];
  servicePrice: number;
  partsPrice: number;
  discount?: number;
  signalPaid?: number;
  paidAmount?: number;
  refundedAmount?: number;
  paymentMethod?: string;
  paymentStatus: 'Pago Pix' | 'Pago Dinheiro' | 'Pendente' | 'Orçado';
  expectedDeliveryDate?: string;
  acceptedChannel?: 'WhatsApp' | 'Presencial' | 'Outro' | '';
  acceptedAt?: string;
  pedForn?: string;
  pedRastreio?: string;
  pedPrev?: string;
  pedChegou?: boolean;
  snapDirectCost?: number;
  snapTaxRate?: number;
  snapHourlyRate?: number;
  deliveredAt?: string;
  warrantyDays?: number;
  warrantyUntil?: string;
  returnWarrantyFromId?: number;
  isLost?: boolean;
  isDiagOnly?: boolean;
  cancelHandled?: boolean;
  stockDeducted?: boolean;
  stockSnapshot?: {
    items: { p: string; q: number }[];
    pp?: string;
  };
  originalQuote?: {
    servicePrice: number;
    extraItems: OrderExtraItem[];
    discount: number;
    estimatedHours: number;
    partCost: number;
    consumables: number;
    snapDirectCost?: number;
  };
  checklist: {
    faceId: string;
    cameras: string;
    battery: string;
    chassis: string;
  };
  telemetry?: TelemetryReading;
  testesFonte?: PowerSupplyTestEntry[];
  laudos?: OrderDiagnosticReport[];
  updatedAt?: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  cpf: string;
  email: string;
  nasc?: string;
  foto?: string;
  ig?: string;
  origem?: string;
  cep?: string;
  rua?: string;
  num?: string;
  ref?: string;
  obs?: string;
  neighborhood: string;
  tag?: 'VIP' | 'Lojista' | 'Recorrente';
  ltv: number;
  ordersCount: number;
  lastDevice: string;
  lastVisit: string;
  restrictions: string[];
  updatedAt?: number;
}

export interface BenchScheduleDay {
  id: string;
  label: string;
  shortName: string;
  isToday?: boolean;
  isOff?: boolean;
  capacityHours: number;
  items: {
    id: string;
    orderId?: number;
    osCode: string;
    title: string;
    hours: number;
    isContinuation?: boolean;
    status?: OrderStatus;
    tone: 'primary' | 'voltage' | 'dark' | 'secondary';
  }[];
  updatedAt?: number;
}

export interface PriorityQueueItem {
  id: string;
  orderId?: number;
  osCode: string;
  statusLabel: string;
  benchLabel: string;
  title: string;
  promised: string;
  estimated: string;
  queuePredictedDate?: string;
  isLateRisk?: boolean;
  warningNote?: string;
  durationHours: number;
  updatedAt?: number;
}

export interface PartItem {
  id: string;
  sku: string;
  name: string;
  category: 'Telas LCD/OLED' | 'Baterias Originais/OEM' | 'Conectores FPC & Carga' | 'CIs SMD & PMICs' | 'Insumos de Solda';
  compatibility: string;
  location: string;
  stock: number;
  minStock: number;
  costPrice: number;
  sellPrice: number;
  reservedOs: number;
  status: 'Disponível' | 'Alerta Reposição' | 'Esgotado' | 'Em Trânsito';
  updatedAt?: number;
}

export interface Supplier {
  id: string;
  initials: string;
  name: string;
  categoryTag: 'Importação Direta' | 'Estoque Local' | 'Subdistribuidor' | 'Consumíveis Lab';
  rating: string;
  specialty: string;
  leadTime: string;
  paymentTerms: string;
  rmaRate: string;
  rmaStatus: string;
  phone: string;
  email?: string;
  updatedAt?: number;
}

export interface Shipment {
  id: string;
  trackingCode: string;
  title: string;
  sender: string;
  etaLabel: string;
  progressStep: number;
  updatedAt?: number;
}

export interface WarrantyCase {
  id: string;
  code: string;
  originOs: string;
  status: 'Em Análise' | 'RMA Fornecedor' | 'Concluída';
  device: string;
  clientName: string;
  service: string;
  batchCode: string;
  sealCode: string;
  sealIntact: boolean;
  symptom: string;
  preliminaryReport: string;
  openedAt: string;
  supplierCredit?: number;
  updatedAt?: number;
}

export interface CashTransaction {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  channel: 'PIX' | 'Cartão' | 'Dinheiro' | 'Fornecedores' | 'Fixo';
  type: 'in' | 'out';
  amount: number;
  dateLabel: string;
  isoDate?: string;
  orderId?: number;
  refOrderId?: number;
  kind?: 'sinal' | 'estSinal' | 'rec' | 'dev' | 'fixo' | 'venda' | 'compra' | 'gar';
  reconciled: boolean;
  updatedAt?: number;
}

export interface LabState {
  orders: ServiceOrder[];
  clients: Client[];
  scheduleDays: BenchScheduleDay[];
  priorityQueue: PriorityQueueItem[];
  parts: PartItem[];
  suppliers: Supplier[];
  shipments: Shipment[];
  warranties: WarrantyCase[];
  transactions: CashTransaction[];
  // Coleções v17
  users: AppUser[];
  tecnicos: TechnicianPerson[];
  vendedores: SellerPerson[];
  servicos: ServiceCatalogItem[];
  fixos: FixedExpenseItem[];
  vendas: SaleRecord[];
  compras: PurchaseRecord[];
  fonteMem: PowerSupplyMemory[];
  cfg: LabConfig;
  interBalances: {
    operational: number; // Conta Corrente Inter (Reposição Peças + Pró-labore)
    porquinhoTotal: number; // Porquinho Inter (Garantia 5% + Capital de Giro 10% + Fixos R$ 100)
    garantiaReserve: number; // Envelope 2 (5% embutido no preço)
    workingCapital: number; // Envelope 3 (10% pós-recebimento, fora do preço)
    fixedCosts: number; // Despesas fixas mensais (R$ 100,00)
    proLabore: number; // Pró-labore inicial de referência (R$ 200,00)
    monthlyBreakEvenTarget: number; // Ponto de equilíbrio mensal (R$ 300,00)
    currentMonthRevenue: number;
  };
  budgetParams: {
    baseHourlyRate: number; // R$ 25,00/h mínima
    profitMarginPct: number; // 30,0% meta líquida
    indirectHourlyRate: number; // R$ 1,78/h (100 / 56,33)
    guaranteeRatePct: number; // 5,0% reserva de garantia
    workingCapitalRatePct: number; // 10,0% capital de giro pós-recebimento
    paymentFeePct: number; // 0,0% (Pix e dinheiro)
    occupancyPct: number; // 50% ocupação faturável
    weeklyHours: number; // 26h/semana
    monthlyHours: number; // 112,67h/mês
    billableHours: number; // 56,33h/mês
    proLabore: number; // R$ 200,00/mês
    fixedCosts: number; // R$ 100,00/mês
  };
  labProfile: {
    technicianName: string;
    role: string;
    pixKey: string;
    pixMerchant: string;
    pixCity?: string;
    lastSync: string;
  };
  counters?: {
    nextOrderNumber: number;
    nextSaleNumber: number;
    nextPurchaseNumber: number;
  };
  tombstones?: Record<string, Record<string, number>>;
  singletonTimestamps?: Record<string, number>;
}
