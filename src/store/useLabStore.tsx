import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AppUser,
  CashTransaction,
  Client,
  FixedExpenseItem,
  LabConfig,
  LabState,
  OrderExtraItem,
  OrderStatus,
  OsPrefillDraft,
  PartItem,
  RouteId,
  SellerPerson,
  ServiceCatalogItem,
  ServiceOrder,
  Supplier,
  TechnicianPerson,
  TelemetryReading,
  UserRole,
} from '../types/lab';
import {
  canRoleAccessRoute,
  clearLoginLockout,
  generateSalt,
  getLoginLockStatus,
  hashPinPBKDF2,
  isAtendenteRole,
  recordFailedPinAttempt,
  verifyUserPin,
} from '../utils/auth';
import {
  DEFAULT_CAT_DESP,
  DEFAULT_FIXOS_SEED,
  DEFAULT_PARTS_CURVE,
  DEFAULT_ROUNDING,
  DEFAULT_SERVICOS_SEED,
  OFFICIAL_BILLABLE_HOURS,
  OFFICIAL_BREAK_EVEN_TARGET,
  OFFICIAL_FIXED_COSTS,
  OFFICIAL_HOURS_BY_DOW,
  OFFICIAL_INDIRECT_HOURLY_RATE,
  OFFICIAL_MIN_HOURLY_RATE,
  OFFICIAL_MONTHLY_HOURS,
  OFFICIAL_OCCUPANCY_PCT,
  OFFICIAL_PAYMENT_FEE_PCT,
  OFFICIAL_PRO_LABORE,
  OFFICIAL_PROFIT_MARGIN_PCT,
  OFFICIAL_WARRANTY_RESERVE_PCT,
  OFFICIAL_WEEKLY_HOURS,
  OFFICIAL_WORKING_CAPITAL_PCT,
  addDiasIso,
  calcDiagTaxa,
  calcEffectivePricingFromConfig,
  calcOrderTotalAmount,
  createDefaultLabConfig,
  resolveOrderWarrantyDays,
  todayIsoLocal,
} from '../utils/pricing';
import {
  FirebaseAuthState,
  LEGACY_DB_KEY,
  SyncStatus,
  authenticateFirebaseEmailPassword,
  emptySyncMetadata,
  formatFirebaseSyncError,
  getDbStorageKey,
  loadAuthState,
  loadSyncMetadata,
  parseFirebaseConfigText,
  runFirestoreSync,
  sanitizeLabStateForPersistence,
  saveAuthState,
  saveSyncMetadata,
  stampLabStateChanges,
} from '../services/firebaseSync';

export interface VolatileDeviceSecret {
  passcode?: string;
  patternNodes?: number[];
}

export interface PendingAccountSwitch {
  nextAuth: FirebaseAuthState;
  previousUid: string;
  previousEmail: string;
  previousPendingCount: number;
  nextHasLocalCache: boolean;
}

const DAY_ID_TO_DOW: Record<string, number> = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
};

const normStr = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const reconcileDerivedFromCfg = (state: LabState): LabState => {
  const cfg = state.cfg;
  const eff = calcEffectivePricingFromConfig(cfg, state.fixos);
  const horas = Array.isArray(cfg.horas) && cfg.horas.length === 7 ? cfg.horas : [...OFFICIAL_HOURS_BY_DOW];

  const nextDays = state.scheduleDays.map((d) => {
    const dow = DAY_ID_TO_DOW[d.id];
    if (dow === undefined) return d;
    const cap = Math.max(0, Math.min(24, Number(horas[dow]) || 0));
    return {
      ...d,
      capacityHours: cap,
      isOff: cap === 0,
    };
  });

  const proLabore = Math.max(0, Number(cfg.proLabore) || 0);
  const fixedCosts = eff.fixedCosts;

  return {
    ...state,
    scheduleDays: nextDays,
    budgetParams: {
      baseHourlyRate: eff.hourlyRate,
      profitMarginPct: Math.round(eff.profitMarginPct * 100) / 100,
      indirectHourlyRate: eff.indirectHourlyRate,
      guaranteeRatePct: Math.round(eff.warrantyRatePct * 100) / 100,
      workingCapitalRatePct: Math.round(eff.workingCapitalPct * 100) / 100,
      paymentFeePct: Math.round(eff.paymentFeePct * 100) / 100,
      occupancyPct: Math.round((Number(cfg.ocup) || 0) * 10000) / 100,
      weeklyHours: eff.metrics.weeklyHours,
      monthlyHours: eff.metrics.monthlyHours,
      billableHours: eff.metrics.billableHours,
      proLabore,
      fixedCosts,
    },
    interBalances: {
      ...state.interBalances,
      fixedCosts,
      proLabore,
      monthlyBreakEvenTarget: Math.round((fixedCosts + proLabore) * 100) / 100,
    },
    labProfile: {
      ...state.labProfile,
      pixKey: cfg.pixKey,
      pixMerchant: cfg.pixNome,
      pixCity: cfg.pixCid,
    },
  };
};

const createInitialLabState = (): LabState => {
  const dayMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const todayId = dayMap[new Date().getDay()];
  const defaultCfg = createDefaultLabConfig();

  const initial: LabState = {
    orders: [],
    clients: [],
    scheduleDays: [
      { id: 'seg', label: 'Segunda-feira', shortName: 'Segunda', isToday: todayId === 'seg', isOff: false, capacityHours: 4.0, items: [], updatedAt: 1 },
      { id: 'ter', label: 'Terça-feira', shortName: 'Terça', isToday: todayId === 'ter', isOff: false, capacityHours: 4.0, items: [], updatedAt: 1 },
      { id: 'qua', label: 'Quarta-feira', shortName: 'Quarta', isToday: todayId === 'qua', isOff: false, capacityHours: 4.0, items: [], updatedAt: 1 },
      { id: 'qui', label: 'Quinta-feira', shortName: 'Quinta', isToday: todayId === 'qui', isOff: false, capacityHours: 4.0, items: [], updatedAt: 1 },
      { id: 'sex', label: 'Sexta-feira', shortName: 'Sexta', isToday: todayId === 'sex', isOff: false, capacityHours: 4.0, items: [], updatedAt: 1 },
      { id: 'sab', label: 'Sábado', shortName: 'Sábado', isToday: todayId === 'sab', isOff: false, capacityHours: 4.0, items: [], updatedAt: 1 },
      { id: 'dom', label: 'Domingo', shortName: 'Domingo', isToday: todayId === 'dom', isOff: false, capacityHours: 2.0, items: [], updatedAt: 1 },
    ],
    priorityQueue: [],
    parts: [],
    suppliers: [],
    shipments: [],
    warranties: [],
    transactions: [],
    users: [],
    tecnicos: [],
    vendedores: [],
    servicos: DEFAULT_SERVICOS_SEED.map((s) => ({ ...s })),
    fixos: DEFAULT_FIXOS_SEED.map((f) => ({ ...f })),
    vendas: [],
    compras: [],
    fonteMem: [],
    cfg: defaultCfg,
    interBalances: {
      operational: 0,
      porquinhoTotal: 0,
      garantiaReserve: 0,
      workingCapital: 0,
      fixedCosts: OFFICIAL_FIXED_COSTS,
      proLabore: OFFICIAL_PRO_LABORE,
      monthlyBreakEvenTarget: OFFICIAL_BREAK_EVEN_TARGET,
      currentMonthRevenue: 0,
    },
    budgetParams: {
      baseHourlyRate: OFFICIAL_MIN_HOURLY_RATE,
      profitMarginPct: OFFICIAL_PROFIT_MARGIN_PCT,
      indirectHourlyRate: OFFICIAL_INDIRECT_HOURLY_RATE,
      guaranteeRatePct: OFFICIAL_WARRANTY_RESERVE_PCT,
      workingCapitalRatePct: OFFICIAL_WORKING_CAPITAL_PCT,
      paymentFeePct: OFFICIAL_PAYMENT_FEE_PCT,
      occupancyPct: OFFICIAL_OCCUPANCY_PCT,
      weeklyHours: OFFICIAL_WEEKLY_HOURS,
      monthlyHours: OFFICIAL_MONTHLY_HOURS,
      billableHours: OFFICIAL_BILLABLE_HOURS,
      proLabore: OFFICIAL_PRO_LABORE,
      fixedCosts: OFFICIAL_FIXED_COSTS,
    },
    labProfile: {
      technicianName: 'Técnico Responsável',
      role: 'Técnico Responsável',
      pixKey: defaultCfg.pixKey,
      pixMerchant: defaultCfg.pixNome,
      pixCity: defaultCfg.pixCid,
      lastSync: 'Offline (Local)',
    },
    counters: {
      nextOrderNumber: 0,
      nextSaleNumber: 0,
      nextPurchaseNumber: 0,
    },
    tombstones: {},
    singletonTimestamps: {},
  };

  return reconcileDerivedFromCfg(initial);
};

function mergeDefined<T extends Record<string, unknown>>(baseObj: T, rawObj?: Partial<T> | null): T {
  const result = { ...baseObj };
  if (!rawObj || typeof rawObj !== 'object') return result;
  for (const [key, val] of Object.entries(rawObj)) {
    if (val !== undefined && val !== null) {
      (result as Record<string, unknown>)[key] = val;
    }
  }
  return result;
}

function hydrateServicosWithSeeds(rawServicos: unknown): ServiceCatalogItem[] {
  if (!Array.isArray(rawServicos) || rawServicos.length === 0) {
    return DEFAULT_SERVICOS_SEED.map((s) => ({ ...s }));
  }
  const list: ServiceCatalogItem[] = rawServicos
    .filter((x): x is ServiceCatalogItem => Boolean(x && typeof x === 'object'))
    .map((x) => ({
      ...x,
      id: String(x.id || ''),
      nome: String(x.nome || ''),
      cat: String(x.cat || 'Geral'),
      tempo: Number(x.tempo) || 0,
      cons: Number(x.cons) || 0,
      peca: String(x.peca || ''),
      gar: String(x.gar ?? ''),
      mercado: Number(x.mercado) || 0,
    }));

  // Migração idempotente seed1..seed6 (mesmo ID em todos os aparelhos)
  DEFAULT_SERVICOS_SEED.forEach((seed, idx) => {
    const nid = `seed${idx + 1}`;
    if (list.some((x) => x.id === nid)) return;
    const match = list.find(
      (y) => y.nome === seed.nome && !/^seed\d+$/.test(String(y.id))
    );
    if (match) {
      match.id = nid;
    }
  });

  return list;
}

function hydrateLabState(raw: Partial<LabState> | null | undefined): LabState {
  const base = createInitialLabState();
  if (!raw || typeof raw !== 'object') return base;
  const rawDays = Array.isArray(raw.scheduleDays) && raw.scheduleDays.length > 0 ? raw.scheduleDays : null;
  const scheduleDays = rawDays
    ? rawDays.map((d, idx) => {
        const cap =
          typeof d?.capacityHours === 'number' && Number.isFinite(d.capacityHours)
            ? Math.max(0, Math.min(24, d.capacityHours))
            : base.scheduleDays[idx]?.capacityHours ?? 4.0;
        return {
          ...(base.scheduleDays[idx] || base.scheduleDays[0]),
          ...mergeDefined(
            (base.scheduleDays[idx] || base.scheduleDays[0]) as unknown as Record<string, unknown>,
            d as unknown as Record<string, unknown>
          ),
          items: Array.isArray(d?.items) ? d.items : [],
          capacityHours: cap,
          isOff: cap === 0,
        };
      })
    : base.scheduleDays;

  const mergedLabProfile = mergeDefined(base.labProfile, raw.labProfile);
  const rawCfg = (raw.cfg && typeof raw.cfg === 'object' ? raw.cfg : {}) as Partial<LabConfig>;

  // Reconstrói cfg.horas se veio apenas de scheduleDays legado sem raw.cfg.horas
  const fallbackHorasFromDays: number[] = [...OFFICIAL_HOURS_BY_DOW];
  scheduleDays.forEach((d) => {
    const dow = DAY_ID_TO_DOW[d.id];
    if (dow !== undefined) fallbackHorasFromDays[dow] = d.capacityHours;
  });

  const catDesp = Array.isArray(rawCfg.catDesp) && rawCfg.catDesp.length > 0
    ? [...rawCfg.catDesp]
    : [...DEFAULT_CAT_DESP];
  if (!catDesp.includes('Garantia')) catDesp.push('Garantia');

  const mergedCfg: LabConfig = {
    ...mergeDefined(base.cfg as unknown as Record<string, unknown>, rawCfg as unknown as Record<string, unknown>) as unknown as LabConfig,
    pixKey: rawCfg.pixKey !== undefined ? String(rawCfg.pixKey) : mergedLabProfile.pixKey,
    pixNome: rawCfg.pixNome !== undefined ? String(rawCfg.pixNome) : mergedLabProfile.pixMerchant,
    pixCid: rawCfg.pixCid !== undefined ? String(rawCfg.pixCid) : (mergedLabProfile.pixCity || 'SALVADOR'),
    horas:
      Array.isArray(rawCfg.horas) && rawCfg.horas.length === 7
        ? rawCfg.horas.map((h) => Math.max(0, Math.min(24, Number(h) || 0)))
        : fallbackHorasFromDays,
    preco: mergeDefined(
      base.cfg.preco as unknown as Record<string, unknown>,
      (rawCfg.preco || {}) as unknown as Record<string, unknown>
    ) as unknown as LabConfig['preco'],
    margem: mergeDefined(
      DEFAULT_PARTS_CURVE as unknown as Record<string, unknown>,
      (rawCfg.margem || {}) as unknown as Record<string, unknown>
    ) as unknown as LabConfig['margem'],
    arred: mergeDefined(
      DEFAULT_ROUNDING as unknown as Record<string, unknown>,
      (rawCfg.arred || {}) as unknown as Record<string, unknown>
    ) as unknown as LabConfig['arred'],
    entrega: Array.isArray(rawCfg.entrega) ? rawCfg.entrega : base.cfg.entrega,
    formas: Array.isArray(rawCfg.formas) && rawCfg.formas.length > 0 ? rawCfg.formas : base.cfg.formas,
    catDesp,
    tempCal: rawCfg.tempCal && typeof rawCfg.tempCal === 'object' ? rawCfg.tempCal : {},
    defeitosExtra: Array.isArray(rawCfg.defeitosExtra) ? rawCfg.defeitosExtra : [],
    _ts: rawCfg._ts && typeof rawCfg._ts === 'object' ? { ...rawCfg._ts } : {},
  };

  const hydratedFixos: FixedExpenseItem[] = Array.isArray(raw.fixos)
    ? raw.fixos
        .filter((f): f is FixedExpenseItem => Boolean(f && typeof f === 'object'))
        .map((f) => ({
          id: String(f.id || `fixo-${Date.now()}`),
          nome: String(f.nome || ''),
          valor: Math.max(0, Number(f.valor) || 0),
          cat: String(f.cat || 'Outros'),
          dia: Math.max(1, Math.min(28, parseInt(String(f.dia || 1), 10) || 1)),
          ativo: f.ativo !== false,
          ultimo: String(f.ultimo || ''),
          ...(typeof f.updatedAt === 'number' ? { updatedAt: f.updatedAt } : {}),
        }))
    : base.fixos;

  const merged: LabState = {
    ...base,
    ...raw,
    orders: Array.isArray(raw.orders) ? raw.orders : base.orders,
    clients: Array.isArray(raw.clients) ? raw.clients : base.clients,
    scheduleDays,
    priorityQueue: Array.isArray(raw.priorityQueue) ? raw.priorityQueue : base.priorityQueue,
    parts: Array.isArray(raw.parts) ? raw.parts : base.parts,
    suppliers: Array.isArray(raw.suppliers) ? raw.suppliers : base.suppliers,
    shipments: Array.isArray(raw.shipments) ? raw.shipments : base.shipments,
    warranties: Array.isArray(raw.warranties) ? raw.warranties : base.warranties,
    transactions: Array.isArray(raw.transactions) ? raw.transactions : base.transactions,
    users: Array.isArray(raw.users) ? raw.users : base.users,
    tecnicos: Array.isArray(raw.tecnicos) ? raw.tecnicos : base.tecnicos,
    vendedores: Array.isArray(raw.vendedores) ? raw.vendedores : base.vendedores,
    servicos: hydrateServicosWithSeeds(raw.servicos),
    fixos: hydratedFixos,
    vendas: Array.isArray(raw.vendas) ? raw.vendas : base.vendas,
    compras: Array.isArray(raw.compras) ? raw.compras : base.compras,
    fonteMem: Array.isArray(raw.fonteMem) ? raw.fonteMem : base.fonteMem,
    cfg: mergedCfg,
    interBalances: mergeDefined(base.interBalances, raw.interBalances),
    budgetParams: mergeDefined(base.budgetParams, raw.budgetParams),
    labProfile: mergedLabProfile,
    counters: mergeDefined(base.counters!, raw.counters),
  };

  return reconcileDerivedFromCfg(sanitizeLabStateForPersistence(merged));
}

function loadStateForUid(uid?: string | null): LabState {
  const targetKey = getDbStorageKey(uid);
  try {
    const saved = localStorage.getItem(targetKey);
    if (saved) {
      return hydrateLabState(JSON.parse(saved) as Partial<LabState>);
    }
    // Se unauthenticated ('local') e ainda existe a chave legada v18, migra sanitizada sem manter passcodes
    if (!uid) {
      const legacy = localStorage.getItem(LEGACY_DB_KEY);
      if (legacy) {
        const parsed = hydrateLabState(JSON.parse(legacy) as Partial<LabState>);
        localStorage.setItem(targetKey, JSON.stringify(parsed));
        localStorage.removeItem(LEGACY_DB_KEY);
        return parsed;
      }
    }
  } catch {
    // Fallback to initial state
  }
  return createInitialLabState();
}

interface LabContextValue {
  state: LabState;
  currentUser: AppUser | null;
  isAtendente: boolean;
  canAccessRoute: (route: RouteId) => boolean;
  powerSupplyStatus: { connected: boolean; outputOn: boolean };
  setPowerSupplyStatus: (status: { connected: boolean; outputOn: boolean }) => void;
  createFirstAdmin: (nome: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithPin: (
    userId: string,
    pin: string
  ) => Promise<{ ok: boolean; error?: string; lockRemainingSec?: number }>;
  logoutSession: () => { ok: boolean; reason?: string };
  addAppUser: (nome: string, nivel: UserRole, pin: string) => Promise<{ ok: boolean; error?: string }>;
  resetAppUserPin: (userId: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  deleteAppUser: (userId: string) => { ok: boolean; error?: string };
  addTechnician: (input: Omit<TechnicianPerson, 'id'>) => TechnicianPerson;
  deleteTechnician: (id: string) => void;
  addSeller: (input: Omit<SellerPerson, 'id'>) => SellerPerson;
  deleteSeller: (id: string) => void;
  syncStatus: SyncStatus;
  firebaseConfig: { apiKey: string; projectId: string };
  pendingAccountSwitch: PendingAccountSwitch | null;
  getVolatileSecret: (orderId: number) => VolatileDeviceSecret | undefined;
  setVolatileSecret: (orderId: number, secret: VolatileDeviceSecret) => void;
  clearVolatileSecret: (orderId: number) => void;
  osPrefillDraft: OsPrefillDraft | null;
  setOsPrefillDraft: (draft: OsPrefillDraft | null) => void;
  addOrder: (order: Omit<ServiceOrder, 'id' | 'code' | 'createdAt'>) => ServiceOrder;
  saveServiceOrder: (input: {
    id?: number;
    data: Partial<ServiceOrder> & {
      clientId: string;
      clientName: string;
      device: string;
      issue: string;
      status: OrderStatus;
    };
    volatileSecret?: VolatileDeviceSecret;
  }) => ServiceOrder;
  updateOrderStatus: (id: number, status: OrderStatus) => void;
  markOrderPartArrived: (orderId: number) => void;
  receiveOrderPayment: (orderId: number, amount: number, method: string) => void;
  cancelOrderWithOptions: (
    orderId: number,
    options: { chargeDiag: boolean; refundAmount: number; markLost?: boolean }
  ) => void;
  deleteOrderWithAdminPin: (
    orderId: number,
    adminPin: string
  ) => Promise<{ ok: boolean; error?: string }>;
  attachTelemetryToOrder: (orderId: number, telemetry: TelemetryReading) => void;
  addClient: (client: Omit<Client, 'id' | 'ltv' | 'ordersCount' | 'lastVisit' | 'restrictions'>) => Client;
  addClientNote: (clientId: string, note: string) => void;
  reorderPriorityQueue: (index: number, direction: 'up' | 'down') => void;
  enqueuePriorityItem: (osCode: string, title: string, hours: number) => void;
  updateDayCapacity: (dayId: string, hours: number) => void;
  addPart: (part: Omit<PartItem, 'id' | 'status'>) => void;
  adjustPartStock: (partId: string, delta: number) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'initials' | 'rating' | 'rmaRate' | 'rmaStatus'>) => Supplier;
  addTransaction: (tx: Omit<CashTransaction, 'id' | 'dateLabel'>) => void;
  recordRestockOrder: (supplierName: string, itemsDesc: string, totalCost: number) => void;
  updateWarrantyStatus: (warrantyId: string, status: 'Em Análise' | 'RMA Fornecedor' | 'Concluída') => void;
  updateBudgetParams: (partial: Partial<LabState['budgetParams']>) => void;
  updateLabConfig: (updater: Partial<LabConfig> | ((prevCfg: LabConfig) => LabConfig)) => void;
  setWeekdayHours: (dowIndex: number, hours: number) => void;
  setWorkdaysHours: (hours: number) => void;
  setQuickFixedExpense: (nome: string, cat: string, valor: number) => void;
  addFixedExpense: (item: Omit<FixedExpenseItem, 'id' | 'ultimo' | 'ativo'> & { ativo?: boolean }) => void;
  updateFixedExpense: (id: string, partial: Partial<FixedExpenseItem>) => void;
  toggleFixedExpense: (id: string) => void;
  deleteFixedExpense: (id: string) => void;
  addDeliveryZone: (bairro: string, valor: number) => void;
  deleteDeliveryZone: (index: number) => void;
  restoreOfficialPricingDefaults: () => void;
  configureFirebase: (input: string | { apiKey: string; projectId: string }) => void;
  clearFirebaseConfig: () => void;
  requestCloudSignIn: (email: string, password: string) => Promise<{ switchedDirectly: boolean }>;
  confirmAccountSwitch: (confirm: boolean) => void;
  signOutCloud: () => void;
  syncNow: () => Promise<boolean>;
  exportBackupJson: () => string;
  importBackupJson: (jsonText: string) => { ok: boolean; error?: string };
  factoryResetLocalDb: () => void;
}

const LabContext = createContext<LabContextValue | null>(null);

export const LabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, setAuth] = useState<FirebaseAuthState>(() => loadAuthState());
  const [state, setState] = useState<LabState>(() => loadStateForUid(loadAuthState().uid));

  // Sessão local autenticada exclusivamente em RAM (exige PIN ao reabrir, igual v17)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [powerSupplyStatus, setPowerSupplyStatusState] = useState<{
    connected: boolean;
    outputOn: boolean;
  }>({ connected: false, outputOn: false });

  // LGPD: Senhas e padrões 3x3 existem exclusivamente nesta memória volátil de sessão (nunca localStorage/JSON/Firebase)
  const [volatileSecrets, setVolatileSecrets] = useState<Record<number, VolatileDeviceSecret>>({});
  const [osPrefillDraft, setOsPrefillDraft] = useState<OsPrefillDraft | null>(null);

  const [pendingAccountSwitch, setPendingAccountSwitch] = useState<PendingAccountSwitch | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncWarning, setSyncWarning] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<number>(() => loadSyncMetadata(loadAuthState().uid).lastSyncAt || 0);
  const [pendingCount, setPendingCount] = useState<number>(() =>
    Object.keys(loadSyncMetadata(loadAuthState().uid).dirty).length
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const authRef = useRef(auth);
  authRef.current = auth;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const powerSupplyRef = useRef(powerSupplyStatus);
  powerSupplyRef.current = powerSupplyStatus;
  const syncTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  // Persist current UID's sanitized state & stamp changes
  useEffect(() => {
    const uid = auth.uid || '';
    const storageKey = getDbStorageKey(uid);
    const meta = loadSyncMetadata(uid);
    const stamped = stampLabStateChanges(state, uid, meta);
    try {
      localStorage.setItem(storageKey, JSON.stringify(stamped.state));
    } catch {
      // Ignore quota errors
    }
    setPendingCount(Object.keys(stamped.meta.dirty).length);
  }, [state, auth.uid]);

  const executeCloudSync = useCallback(async (): Promise<boolean> => {
    const currentAuth = authRef.current;
    if (
      busyRef.current ||
      !currentAuth.apiKey ||
      !currentAuth.projectId ||
      !currentAuth.refreshToken ||
      !currentAuth.uid ||
      (typeof navigator !== 'undefined' && navigator.onLine === false)
    ) {
      return false;
    }

    busyRef.current = true;
    setSyncBusy(true);
    setSyncError('');
    try {
      const res = await runFirestoreSync(stateRef.current, currentAuth);
      authRef.current = res.auth;
      setAuth(res.auth);
      setLastSyncAt(res.meta.lastSyncAt);
      setPendingCount(Object.keys(res.meta.dirty).length);
      setSyncWarning(res.warning);
      if (res.changed) {
        setState(hydrateLabState(res.state));
      }
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setState((prev) => ({
        ...prev,
        labProfile: { ...prev.labProfile, lastSync: `Nuvem às ${timeStr}` },
      }));
      return true;
    } catch (err) {
      setSyncError(formatFirebaseSyncError(err, currentAuth));
      return false;
    } finally {
      busyRef.current = false;
      setSyncBusy(false);
    }
  }, []);

  const scheduleCloudSync = useCallback(
    (delayMs = 4000) => {
      const a = authRef.current;
      if (!a.apiKey || !a.projectId || !a.refreshToken || !a.uid) return;
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        void executeCloudSync();
      }, delayMs);
    },
    [executeCloudSync]
  );

  // Automatic background sync triggers (online, visibilitychange, 60s interval, mount)
  useEffect(() => {
    const a = authRef.current;
    if (a.apiKey && a.projectId && a.refreshToken && a.uid) {
      scheduleCloudSync(1500);
    }
    const handleOnline = () => scheduleCloudSync(500);
    const handleVisibility = () => {
      if (!document.hidden) scheduleCloudSync(500);
    };
    const intervalId = window.setInterval(() => {
      if (!document.hidden) scheduleCloudSync(0);
    }, 60000);

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(intervalId);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, [auth.uid, scheduleCloudSync]);

  // Mantém currentUser sincronizado caso a nuvem atualize nome/nível (ou encerra se excluído)
  useEffect(() => {
    const active = currentUserRef.current;
    if (!active) return;
    const match = state.users.find((u) => u.id === active.id);
    if (match) {
      if (match.nome !== active.nome || match.nivel !== active.nivel || match.h !== active.h) {
        setCurrentUser(match);
      }
    } else if (state.users.length > 0) {
      setCurrentUser(null);
    }
  }, [state.users]);

  // Logout automático por inatividade (cfg.idle minutos; 0 desliga; adia se modal aberto ou FONTE.busy())
  useEffect(() => {
    const idleMinutes = state.cfg.idle === undefined ? 10 : Math.max(0, Number(state.cfg.idle) || 0);
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (!currentUser || idleMinutes <= 0) return;

    const armTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        const hasOpenModal = Boolean(
          document.querySelector('dialog[open], [data-modal-open="true"], .fixed.inset-0.z-50')
        );
        const fonteBusy = powerSupplyRef.current.connected || powerSupplyRef.current.outputOn;
        if (hasOpenModal || fonteBusy) {
          armTimer();
          return;
        }
        setCurrentUser(null);
      }, idleMinutes * 60_000);
    };

    const handleActivity = () => armTimer();
    armTimer();
    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    return () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [currentUser?.id, state.cfg.idle]);

  const setPowerSupplyStatus = useCallback(
    (status: { connected: boolean; outputOn: boolean }) => {
      setPowerSupplyStatusState((prev) =>
        prev.connected === status.connected && prev.outputOn === status.outputOn ? prev : status
      );
    },
    []
  );

  const createFirstAdmin = async (
    nome: string,
    pin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanNome = nome.trim();
    const cleanPin = pin.trim();
    if (!cleanNome) return { ok: false, error: 'Informe seu nome.' };
    if (cleanPin.length < 4) return { ok: false, error: 'O PIN deve ter no mínimo 4 dígitos.' };
    const s = generateSalt();
    const h = await hashPinPBKDF2(cleanPin, s);
    const adminUser: AppUser = {
      id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nome: cleanNome,
      nivel: 'Administrador',
      s,
      h,
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      users: [...prev.users, adminUser],
    }));
    clearLoginLockout();
    setCurrentUser(adminUser);
    scheduleCloudSync(1500);
    return { ok: true };
  };

  const loginWithPin = async (
    userId: string,
    pin: string
  ): Promise<{ ok: boolean; error?: string; lockRemainingSec?: number }> => {
    const lock = getLoginLockStatus();
    if (lock.remainingSec > 0) {
      return {
        ok: false,
        error: `Muitas tentativas. Aguarde ${lock.remainingSec} s.`,
        lockRemainingSec: lock.remainingSec,
      };
    }

    const target = stateRef.current.users.find((u) => u.id === userId);
    if (!target) {
      return { ok: false, error: 'Selecione um usuário válido.' };
    }

    const check = await verifyUserPin(target, pin);
    if (!check.ok) {
      const nextLock = recordFailedPinAttempt();
      return {
        ok: false,
        error:
          nextLock.remainingSec > 0
            ? `PIN incorreto. Bloqueado por ${nextLock.remainingSec} s.`
            : 'PIN incorreto.',
        lockRemainingSec: nextLock.remainingSec,
      };
    }

    clearLoginLockout();
    let loggedUser = target;
    if (check.upgradedSalt && check.upgradedHash) {
      loggedUser = {
        ...target,
        s: check.upgradedSalt,
        h: check.upgradedHash,
        updatedAt: Date.now(),
      };
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === target.id ? loggedUser : u)),
      }));
      scheduleCloudSync(2000);
    }

    setCurrentUser(loggedUser);
    return { ok: true };
  };

  const logoutSession = (): { ok: boolean; reason?: string } => {
    if (powerSupplyRef.current.outputOn) {
      return {
        ok: false,
        reason: 'Desligue a saída da fonte ZK-SK150C antes de sair ou trocar de usuário.',
      };
    }
    setPowerSupplyStatusState({ connected: false, outputOn: false });
    setCurrentUser(null);
    return { ok: true };
  };

  const addAppUser = async (
    nome: string,
    nivel: UserRole,
    pin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanNome = nome.trim();
    const cleanPin = pin.trim();
    if (!cleanNome) return { ok: false, error: 'Informe o nome do usuário.' };
    if (cleanPin.length < 4) return { ok: false, error: 'O PIN deve ter no mínimo 4 dígitos.' };
    const s = generateSalt();
    const h = await hashPinPBKDF2(cleanPin, s);
    const created: AppUser = {
      id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nome: cleanNome,
      nivel,
      s,
      h,
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      users: [...prev.users, created],
    }));
    scheduleCloudSync(2500);
    return { ok: true };
  };

  const resetAppUserPin = async (
    userId: string,
    newPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const cleanPin = newPin.trim();
    if (cleanPin.length < 4) return { ok: false, error: 'O PIN deve ter no mínimo 4 dígitos.' };
    const s = generateSalt();
    const h = await hashPinPBKDF2(cleanPin, s);
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId ? { ...u, s, h, updatedAt: Date.now() } : u
      ),
    }));
    if (currentUserRef.current?.id === userId) {
      setCurrentUser((prev) => (prev ? { ...prev, s, h, updatedAt: Date.now() } : prev));
    }
    scheduleCloudSync(2500);
    return { ok: true };
  };

  const deleteAppUser = (userId: string): { ok: boolean; error?: string } => {
    if (currentUserRef.current?.id === userId) {
      return { ok: false, error: 'Você não pode excluir o usuário em uso no momento.' };
    }
    setState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== userId),
    }));
    scheduleCloudSync(2500);
    return { ok: true };
  };

  const addTechnician = (input: Omit<TechnicianPerson, 'id'>): TechnicianPerson => {
    const created: TechnicianPerson = {
      id: `tec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      nome: input.nome.trim(),
      tel: input.tel?.trim() || '',
      email: input.email?.trim() || '',
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      tecnicos: [...prev.tecnicos, created],
    }));
    scheduleCloudSync(3000);
    return created;
  };

  const deleteTechnician = (id: string) => {
    setState((prev) => ({
      ...prev,
      tecnicos: prev.tecnicos.filter((t) => t.id !== id),
    }));
    scheduleCloudSync(3000);
  };

  const addSeller = (input: Omit<SellerPerson, 'id'>): SellerPerson => {
    const created: SellerPerson = {
      id: `ven-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      nome: input.nome.trim(),
      tel: input.tel?.trim() || '',
      email: input.email?.trim() || '',
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      vendedores: [...prev.vendedores, created],
    }));
    scheduleCloudSync(3000);
    return created;
  };

  const deleteSeller = (id: string) => {
    setState((prev) => ({
      ...prev,
      vendedores: prev.vendedores.filter((v) => v.id !== id),
    }));
    scheduleCloudSync(3000);
  };

  const getVolatileSecret = useCallback(
    (orderId: number) => volatileSecrets[orderId],
    [volatileSecrets]
  );

  const setVolatileSecret = useCallback((orderId: number, secret: VolatileDeviceSecret) => {
    if (!secret.passcode && (!secret.patternNodes || secret.patternNodes.length === 0)) {
      setVolatileSecrets((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      return;
    }
    setVolatileSecrets((prev) => ({ ...prev, [orderId]: secret }));
  }, []);

  const clearVolatileSecret = useCallback((orderId: number) => {
    setVolatileSecrets((prev) => {
      if (!(orderId in prev)) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const nowClockStr = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const nowAgoraStr = () => `${todayIsoLocal()} ${nowClockStr()}`;

  const buildOrderStockSnapshot = (o: Pick<ServiceOrder, 'extraItems' | 'clientSuppliedPart' | 'partId'>) => ({
    items: (o.extraItems || [])
      .filter((x) => Boolean(x.p))
      .map((x) => ({ p: String(x.p), q: Math.max(0, Number(x.q) || 0) })),
    pp: o.clientSuppliedPart ? '' : o.partId || '',
  });

  const applyStockSnapshotToParts = (
    parts: PartItem[],
    snap: { items: { p: string; q: number }[]; pp?: string },
    sign: 1 | -1
  ): PartItem[] => {
    const deltas: Record<string, number> = {};
    (snap.items || []).forEach((it) => {
      if (it.p && it.q > 0) deltas[it.p] = (deltas[it.p] || 0) + sign * it.q;
    });
    if (snap.pp) {
      deltas[snap.pp] = (deltas[snap.pp] || 0) + sign * 1;
    }
    if (Object.keys(deltas).length === 0) return parts;
    return parts.map((p) => {
      const delta = deltas[p.id];
      if (!delta) return p;
      const nextStock = Math.max(0, p.stock + delta);
      const status: PartItem['status'] =
        nextStock === 0
          ? 'Esgotado'
          : nextStock <= p.minStock
          ? 'Alerta Reposição'
          : 'Disponível';
      return { ...p, stock: nextStock, status, updatedAt: Date.now() };
    });
  };

  const applyTransactionDelta = (
    prev: LabState,
    tx: CashTransaction,
    sign: 1 | -1 = 1
  ): LabState['interBalances'] => {
    const garRate = (prev.budgetParams.guaranteeRatePct ?? OFFICIAL_WARRANTY_RESERVE_PCT) / 100;
    const capRate = (prev.budgetParams.workingCapitalRatePct ?? OFFICIAL_WORKING_CAPITAL_PCT) / 100;
    const feeRate = (prev.budgetParams.paymentFeePct ?? OFFICIAL_PAYMENT_FEE_PCT) / 100;

    const netAfterFee = tx.type === 'in' ? tx.amount * (1 - feeRate) : 0;
    const guaranteeAdd = tx.type === 'in' ? Math.round(tx.amount * garRate * 100) / 100 : 0;
    const workingAdd = tx.type === 'in' ? Math.round(netAfterFee * capRate * 100) / 100 : 0;
    const deltaConta = tx.type === 'in' ? netAfterFee - guaranteeAdd - workingAdd : -tx.amount;

    const revDelta =
      tx.type === 'in'
        ? tx.amount
        : tx.kind === 'dev' || tx.kind === 'estSinal'
        ? -tx.amount
        : 0;

    return {
      ...prev.interBalances,
      operational: Math.max(
        0,
        Math.round((prev.interBalances.operational + sign * deltaConta) * 100) / 100
      ),
      garantiaReserve: Math.max(
        0,
        Math.round((prev.interBalances.garantiaReserve + sign * guaranteeAdd) * 100) / 100
      ),
      workingCapital: Math.max(
        0,
        Math.round((prev.interBalances.workingCapital + sign * workingAdd) * 100) / 100
      ),
      porquinhoTotal: Math.max(
        0,
        Math.round(
          (prev.interBalances.porquinhoTotal + sign * (guaranteeAdd + workingAdd)) * 100
        ) / 100
      ),
      currentMonthRevenue: Math.max(
        0,
        Math.round((prev.interBalances.currentMonthRevenue + sign * revDelta) * 100) / 100
      ),
    };
  };

  const addOrder = (orderInput: Omit<ServiceOrder, 'id' | 'code' | 'createdAt'>): ServiceOrder => {
    const cleanInput = { ...(orderInput as unknown as Record<string, unknown>) };
    delete cleanInput.passcode;
    delete cleanInput.patternNodes;

    const maxId = stateRef.current.orders.reduce((max, o) => Math.max(max, o.id), 0);
    const newId = Math.max(maxId, stateRef.current.counters?.nextOrderNumber || 0) + 1;
    const timeStr = nowClockStr();
    const today = todayIsoLocal();
    const eff = calcEffectivePricingFromConfig(stateRef.current.cfg, stateRef.current.fixos);
    const baseData = cleanInput as Omit<ServiceOrder, 'id' | 'code' | 'createdAt'>;
    const hours = Math.max(0, Number(baseData.estimatedHours) || 0);
    const pcli = Boolean(baseData.clientSuppliedPart);
    const peca = pcli ? 0 : Math.max(0, Number(baseData.partCost) || 0);
    const fretePeca = pcli ? 0 : Math.max(0, Number(baseData.partFreight) || 0);
    const cons = Math.max(0, Number(baseData.consumables) || 0);
    const snapCd =
      baseData.snapDirectCost !== undefined
        ? baseData.snapDirectCost
        : Math.round((peca + fretePeca + cons + hours * (eff.hourlyRate + eff.indirectHourlyRate)) * 100) / 100;

    const newOrder: ServiceOrder = {
      ...baseData,
      id: newId,
      code: `#${newId}`,
      createdAt: `Hoje · ${timeStr}`,
      createdDate: baseData.createdDate || today,
      snapDirectCost: snapCd,
      snapTaxRate: baseData.snapTaxRate ?? eff.totalRetentionPct / 100,
      snapHourlyRate: baseData.snapHourlyRate ?? eff.hourlyRate,
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      orders: [newOrder, ...prev.orders],
      counters: {
        nextOrderNumber: newId,
        nextSaleNumber: prev.counters?.nextSaleNumber || 0,
        nextPurchaseNumber: prev.counters?.nextPurchaseNumber || 0,
      },
      priorityQueue: [
        {
          id: `pq-${newId}`,
          osCode: `OS #${newId}`,
          statusLabel: newOrder.status,
          benchLabel: 'Bancada A',
          title: `${newOrder.device} — ${newOrder.issue.slice(0, 26)}`,
          promised: newOrder.expectedDeliveryDate || 'A definir',
          estimated: `${newOrder.estimatedHours.toFixed(1)}h previstas`,
          durationHours: newOrder.estimatedHours,
          updatedAt: Date.now(),
        },
        ...prev.priorityQueue,
      ],
    }));
    scheduleCloudSync(3500);
    return newOrder;
  };

  const saveServiceOrder = ({
    id,
    data,
    volatileSecret,
  }: {
    id?: number;
    data: Partial<ServiceOrder> & {
      clientId: string;
      clientName: string;
      device: string;
      issue: string;
      status: OrderStatus;
    };
    volatileSecret?: VolatileDeviceSecret;
  }): ServiceOrder => {
    const prevSnapshot = stateRef.current;
    const o0 = id ? prevSnapshot.orders.find((x) => x.id === id) : undefined;
    const maxId = prevSnapshot.orders.reduce((max, o) => Math.max(max, o.id), 0);
    const targetId = o0 ? o0.id : Math.max(maxId, prevSnapshot.counters?.nextOrderNumber || 0) + 1;
    const code = o0 ? o0.code : `#${targetId}`;
    const today = todayIsoLocal();
    const timeStr = nowClockStr();

    const pcli = Boolean(data.clientSuppliedPart);
    const partCost = pcli ? 0 : Math.max(0, Number(data.partCost) || 0);
    const partFreight = pcli ? 0 : Math.max(0, Number(data.partFreight) || 0);
    const partId = pcli ? '' : data.partId || '';
    const consumables = Math.max(0, Number(data.consumables) || 0);
    const estimatedHours = Math.max(0, Number(data.estimatedHours) || 0);
    const pedChegou = Boolean(data.pedChegou);
    const nextStatus: OrderStatus =
      pedChegou && data.status === 'Aguardando Peça' ? 'Aprovado' : data.status;

    const eff = calcEffectivePricingFromConfig(prevSnapshot.cfg, prevSnapshot.fixos);
    const sameCostInputs =
      o0 &&
      o0.snapDirectCost !== undefined &&
      Boolean(o0.clientSuppliedPart) === pcli &&
      (o0.partCost || 0) === partCost &&
      (o0.partFreight || 0) === partFreight &&
      (o0.consumables || 0) === consumables &&
      (o0.estimatedHours || 0) === estimatedHours;

    const snapDirectCost = sameCostInputs
      ? o0!.snapDirectCost!
      : Math.round(
          (partCost + partFreight + consumables + estimatedHours * (eff.hourlyRate + eff.indirectHourlyRate)) *
            100
        ) / 100;
    const snapTaxRate = sameCostInputs ? o0!.snapTaxRate! : eff.totalRetentionPct / 100;
    const snapHourlyRate = sameCostInputs ? o0!.snapHourlyRate! : eff.hourlyRate;

    const svcName =
      prevSnapshot.servicos.find((s) => s.id === data.serviceCatalogId)?.nome ||
      data.serviceCatalogName ||
      o0?.serviceCatalogName ||
      '';

    const cleanExtraItems: OrderExtraItem[] = (data.extraItems || [])
      .filter((x) => Boolean(x.d && x.d.trim()))
      .map((x) => {
        const partMatch = prevSnapshot.parts.find((p) => p.id === x.p);
        return {
          ...x,
          q: Math.max(1, Number(x.q) || 1),
          v: Math.max(0, Number(x.v) || 0),
          c:
            o0 && o0.stockDeducted && x.c !== undefined
              ? x.c
              : partMatch
              ? Number(partMatch.costPrice) || 0
              : Number(x.c) || 0,
        };
      });

    // Sinal & pago (aplicarSinal v17 — nunca estorna mais que o valor efetivamente pago)
    const desiredSignal = Math.max(0, Number(data.signalPaid) || 0);
    const oldSignal = Math.max(0, Number(o0?.signalPaid) || 0);
    const signalDiff = Math.round((desiredSignal - oldSignal) * 100) / 100;
    const oldPaid = Math.max(0, Number(o0?.paidAmount) || 0);
    const effectiveSignalDelta =
      signalDiff === 0 ? 0 : signalDiff > 0 ? signalDiff : -Math.min(-signalDiff, oldPaid);
    const nextPaid = Math.round((oldPaid + effectiveSignalDelta) * 100) / 100;

    // Garantia automática ao marcar Entregue (garantiaOS v17)
    let deliveredAt = o0?.deliveredAt || '';
    let warrantyDays = o0?.warrantyDays;
    let warrantyUntil = o0?.warrantyUntil;
    if (nextStatus === 'Entregue') {
      if (!warrantyUntil) {
        deliveredAt = todayIsoLocal();
        warrantyDays = resolveOrderWarrantyDays(
          data.serviceCatalogId || o0?.serviceCatalogId,
          prevSnapshot.servicos,
          prevSnapshot.cfg
        );
        warrantyUntil = addDiasIso(deliveredAt, warrantyDays);
      }
    } else {
      deliveredAt = '';
      warrantyDays = undefined;
      warrantyUntil = undefined;
    }

    const acceptedStatuses: OrderStatus[] = [
      'Aprovado',
      'Aprovado / Fila',
      'Aguardando Peça',
      'Em reparo',
      'Em Reparo SMD',
      'Pronto',
      'Pronto Retirada',
      'Entregue',
    ];
    const acceptedAt =
      o0?.acceptedAt ||
      (acceptedStatuses.includes(nextStatus) ? nowAgoraStr() : undefined);

    const savedOrder: ServiceOrder = {
      ...(o0 || {
        id: targetId,
        code,
        clientPhone: 'Não informado',
        clientCpf: '000.***.***-00',
        deviceType: 'smartphone' as const,
        imei: 'Não informado',
        diagnosis: '',
        priority: 'Normal' as const,
        technician:
          currentUserRef.current?.nome ||
          prevSnapshot.tecnicos[0]?.nome ||
          prevSnapshot.labProfile.technicianName ||
          'Técnico Bancada',
        createdAt: `Hoje · ${timeStr}`,
        createdDate: today,
        servicePrice: 0,
        partsPrice: 0,
        paymentStatus: 'Orçado' as const,
        checklist: { faceId: 'A testar', cameras: 'OK', battery: 'Normal', chassis: 'Íntegro' },
      }),
      ...data,
      id: targetId,
      code,
      createdDate: data.createdDate || o0?.createdDate || today,
      serviceCatalogName: svcName,
      partId,
      partCost,
      partFreight,
      consumables,
      clientSuppliedPart: pcli,
      extraItems: cleanExtraItems,
      estimatedHours,
      status: nextStatus,
      pedChegou,
      snapDirectCost,
      snapTaxRate,
      snapHourlyRate,
      signalPaid: desiredSignal,
      paidAmount: nextPaid,
      paymentStatus:
        nextPaid >= calcOrderTotalAmount({
          servicePrice: Number(data.servicePrice ?? o0?.servicePrice) || 0,
          partsPrice: Number(data.partsPrice ?? o0?.partsPrice) || 0,
          extraItems: cleanExtraItems,
          deliveryFee: Number(data.deliveryFee ?? o0?.deliveryFee) || 0,
          discount: Number(data.discount ?? o0?.discount) || 0,
        }) && nextPaid > 0
          ? 'Pago Pix'
          : nextPaid > 0
          ? 'Pendente'
          : o0?.paymentStatus || 'Orçado',
      acceptedAt,
      deliveredAt,
      warrantyDays,
      warrantyUntil,
      updatedAt: Date.now(),
    };

    // Volatile secret LGPD handling
    if (nextStatus === 'Entregue' || nextStatus === 'Cancelado') {
      clearVolatileSecret(targetId);
    } else if (volatileSecret) {
      setVolatileSecret(targetId, volatileSecret);
    }

    setState((prev) => {
      let nextParts = prev.parts;
      const oldSnap = o0?.stockDeducted
        ? o0.stockSnapshot || buildOrderStockSnapshot(o0)
        : null;
      const newSnap = buildOrderStockSnapshot(savedOrder);

      if (nextStatus === 'Entregue' && !o0?.stockDeducted) {
        nextParts = applyStockSnapshotToParts(nextParts, newSnap, -1);
        savedOrder.stockDeducted = true;
        savedOrder.stockSnapshot = newSnap;
      } else if (nextStatus === 'Entregue' && o0?.stockDeducted) {
        if (JSON.stringify(oldSnap) !== JSON.stringify(newSnap)) {
          if (oldSnap) nextParts = applyStockSnapshotToParts(nextParts, oldSnap, 1);
          nextParts = applyStockSnapshotToParts(nextParts, newSnap, -1);
        }
        savedOrder.stockDeducted = true;
        savedOrder.stockSnapshot = newSnap;
      } else if (nextStatus !== 'Entregue' && o0?.stockDeducted) {
        if (oldSnap) nextParts = applyStockSnapshotToParts(nextParts, oldSnap, 1);
        savedOrder.stockDeducted = false;
        savedOrder.stockSnapshot = undefined;
      }

      let nextState: LabState = {
        ...prev,
        parts: nextParts,
        orders: o0
          ? prev.orders.map((x) => (x.id === targetId ? savedOrder : x))
          : [savedOrder, ...prev.orders],
        counters: o0
          ? prev.counters
          : {
              nextOrderNumber: targetId,
              nextSaleNumber: prev.counters?.nextSaleNumber || 0,
              nextPurchaseNumber: prev.counters?.nextPurchaseNumber || 0,
            },
      };

      if (!o0) {
        nextState = {
          ...nextState,
          priorityQueue: [
            {
              id: `pq-${targetId}`,
              osCode: `OS #${targetId}`,
              statusLabel: savedOrder.status,
              benchLabel: 'Bancada A',
              title: `${savedOrder.device} — ${savedOrder.issue.slice(0, 26)}`,
              promised: savedOrder.expectedDeliveryDate || 'A definir',
              estimated: `${savedOrder.estimatedHours.toFixed(1)}h previstas`,
              durationHours: savedOrder.estimatedHours,
              updatedAt: Date.now(),
            },
            ...prev.priorityQueue,
          ],
        };
      }

      if (effectiveSignalDelta !== 0) {
        const tx: CashTransaction = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          title: `${effectiveSignalDelta > 0 ? 'Sinal' : 'Estorno de sinal'} da OS ${savedOrder.code}`,
          subtitle: `${savedOrder.clientName} · ${savedOrder.device}`,
          tag: `OS ${savedOrder.code}`,
          channel: 'PIX',
          type: effectiveSignalDelta > 0 ? 'in' : 'out',
          amount: Math.abs(effectiveSignalDelta),
          dateLabel: `Hoje, ${timeStr}`,
          isoDate: today,
          orderId: targetId,
          kind: effectiveSignalDelta > 0 ? 'sinal' : 'estSinal',
          reconciled: true,
          updatedAt: Date.now(),
        };
        nextState = {
          ...nextState,
          transactions: [tx, ...nextState.transactions],
          interBalances: applyTransactionDelta(nextState, tx, 1),
        };
      }

      return nextState;
    });

    scheduleCloudSync(3500);
    return savedOrder;
  };

  const updateOrderStatus = (id: number, status: OrderStatus) => {
    if (status === 'Entregue' || status === 'Cancelado') {
      clearVolatileSecret(id);
    }
    const today = todayIsoLocal();
    const acceptedStatuses: OrderStatus[] = [
      'Aprovado',
      'Aprovado / Fila',
      'Aguardando Peça',
      'Em reparo',
      'Em Reparo SMD',
      'Pronto',
      'Pronto Retirada',
      'Entregue',
    ];
    setState((prev) => {
      const target = prev.orders.find((o) => o.id === id);
      if (!target) return prev;
      let nextParts = prev.parts;
      const oldSnap = target.stockDeducted
        ? target.stockSnapshot || buildOrderStockSnapshot(target)
        : null;
      const newSnap = buildOrderStockSnapshot(target);

      let stockDeducted = target.stockDeducted;
      let stockSnapshot = target.stockSnapshot;
      if (status === 'Entregue' && !target.stockDeducted) {
        nextParts = applyStockSnapshotToParts(nextParts, newSnap, -1);
        stockDeducted = true;
        stockSnapshot = newSnap;
      } else if (status !== 'Entregue' && target.stockDeducted) {
        if (oldSnap) nextParts = applyStockSnapshotToParts(nextParts, oldSnap, 1);
        stockDeducted = false;
        stockSnapshot = undefined;
      }

      const deliveredAt = status === 'Entregue' ? target.deliveredAt || today : '';
      const warrantyDays =
        status === 'Entregue'
          ? target.warrantyDays ??
            resolveOrderWarrantyDays(target.serviceCatalogId, prev.servicos, prev.cfg)
          : undefined;
      const warrantyUntil =
        status === 'Entregue'
          ? target.warrantyUntil || addDiasIso(deliveredAt, warrantyDays ?? 90)
          : undefined;

      return {
        ...prev,
        parts: nextParts,
        orders: prev.orders.map((o) =>
          o.id === id
            ? {
                ...o,
                status,
                acceptedAt:
                  o.acceptedAt || (acceptedStatuses.includes(status) ? nowAgoraStr() : undefined),
                deliveredAt,
                warrantyDays,
                warrantyUntil,
                stockDeducted,
                stockSnapshot,
                paymentStatus: status === 'Entregue' ? 'Pago Pix' : o.paymentStatus,
                updatedAt: Date.now(),
              }
            : o
        ),
      };
    });
    scheduleCloudSync(3500);
  };

  const markOrderPartArrived = (orderId: number) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        const nextStatus: OrderStatus = o.status === 'Aguardando Peça' ? 'Aprovado' : o.status;
        return {
          ...o,
          pedChegou: true,
          status: nextStatus,
          acceptedAt: o.acceptedAt || nowAgoraStr(),
          updatedAt: Date.now(),
        };
      }),
    }));
    scheduleCloudSync(3000);
  };

  const receiveOrderPayment = (orderId: number, amount: number, method: string) => {
    const cleanVal = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100);
    if (cleanVal <= 0) return;
    const timeStr = nowClockStr();
    const today = todayIsoLocal();
    const isCash = method.toLowerCase().includes('dinheiro');
    const channel: CashTransaction['channel'] = isCash
      ? 'Dinheiro'
      : method.toLowerCase().includes('cart')
      ? 'Cartão'
      : 'PIX';

    setState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target) return prev;
      const nextPaid = Math.round(((target.paidAmount || 0) + cleanVal) * 100) / 100;
      const orderTotal = calcOrderTotalAmount(target);
      const tx: CashTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: `OS ${target.code} (${method})`,
        subtitle: `${target.clientName} · ${target.device}`,
        tag: `OS ${target.code}`,
        channel,
        type: 'in',
        amount: cleanVal,
        dateLabel: `Hoje, ${timeStr}`,
        isoDate: today,
        orderId,
        kind: 'rec',
        reconciled: channel !== 'Dinheiro',
        updatedAt: Date.now(),
      };
      const nextState: LabState = {
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                paidAmount: nextPaid,
                paymentMethod: method,
                paymentStatus:
                  nextPaid >= orderTotal ? (isCash ? 'Pago Dinheiro' : 'Pago Pix') : 'Pendente',
                updatedAt: Date.now(),
              }
            : o
        ),
        transactions: [tx, ...prev.transactions],
      };
      return {
        ...nextState,
        interBalances: applyTransactionDelta(nextState, tx, 1),
      };
    });
    scheduleCloudSync(3000);
  };

  const cancelOrderWithOptions = (
    orderId: number,
    options: { chargeDiag: boolean; refundAmount: number; markLost?: boolean }
  ) => {
    clearVolatileSecret(orderId);
    const timeStr = nowClockStr();
    const today = todayIsoLocal();
    setState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target) return prev;

      let nextParts = prev.parts;
      if (target.stockDeducted) {
        const snap = target.stockSnapshot || buildOrderStockSnapshot(target);
        nextParts = applyStockSnapshotToParts(nextParts, snap, 1);
      }

      const updated: ServiceOrder = {
        ...target,
        status: 'Cancelado',
        isLost: Boolean(options.markLost || target.isLost),
        stockDeducted: false,
        stockSnapshot: undefined,
        deliveredAt: '',
        warrantyDays: undefined,
        warrantyUntil: undefined,
        updatedAt: Date.now(),
      };

      const eff = calcEffectivePricingFromConfig(prev.cfg, prev.fixos);
      const dg = calcDiagTaxa(prev.cfg);
      if (
        options.chargeDiag &&
        !options.markLost &&
        !target.isDiagOnly &&
        !target.cancelHandled &&
        dg > 0
      ) {
        updated.originalQuote = {
          servicePrice: target.servicePrice,
          extraItems: target.extraItems || [],
          discount: target.discount || 0,
          estimatedHours: target.estimatedHours,
          partCost: target.partCost || 0,
          consumables: target.consumables || 0,
          snapDirectCost: target.snapDirectCost,
        };
        updated.servicePrice = dg;
        updated.partsPrice = 0;
        updated.extraItems = [];
        updated.discount = 0;
        updated.partCost = 0;
        updated.partFreight = 0;
        updated.consumables = 0;
        updated.estimatedHours = Number(prev.cfg.diagHoras) || 0.5;
        updated.snapDirectCost =
          Math.round(updated.estimatedHours * (eff.hourlyRate + eff.indirectHourlyRate) * 100) /
          100;
        updated.snapTaxRate = eff.totalRetentionPct / 100;
        updated.isDiagOnly = true;
      }

      const pg = Math.max(0, Number(target.paidAmount) || 0);
      const v =
        !target.cancelHandled && pg > 0
          ? Math.min(pg, Math.max(0, Math.round((Number(options.refundAmount) || 0) * 100) / 100))
          : 0;

      let refundTx: CashTransaction | null = null;
      if (v > 0) {
        updated.paidAmount = Math.round((pg - v) * 100) / 100;
        updated.signalPaid = Math.min(Number(target.signalPaid) || 0, updated.paidAmount);
        updated.refundedAmount = Math.round(((target.refundedAmount || 0) + v) * 100) / 100;
        refundTx = {
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          title: `Devolução da OS ${target.code}`,
          subtitle: `${target.clientName} · Cancelamento`,
          tag: `OS ${target.code}`,
          channel: 'PIX',
          type: 'out',
          amount: v,
          dateLabel: `Hoje, ${timeStr}`,
          isoDate: today,
          orderId,
          kind: 'dev',
          reconciled: true,
          updatedAt: Date.now(),
        };
      }
      updated.cancelHandled = true;

      const nextState: LabState = {
        ...prev,
        parts: nextParts,
        orders: prev.orders.map((o) => (o.id === orderId ? updated : o)),
        transactions: refundTx ? [refundTx, ...prev.transactions] : prev.transactions,
      };
      return refundTx
        ? { ...nextState, interBalances: applyTransactionDelta(nextState, refundTx, 1) }
        : nextState;
    });
    scheduleCloudSync(3000);
  };

  const deleteOrderWithAdminPin = async (
    orderId: number,
    adminPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const active = currentUserRef.current;
    if (!active || active.nivel !== 'Administrador') {
      return { ok: false, error: 'Somente o Administrador pode excluir OS.' };
    }
    const storedUser = stateRef.current.users.find((u) => u.id === active.id) || active;
    const pinCheck = await verifyUserPin(storedUser, adminPin);
    if (!pinCheck.ok) {
      return { ok: false, error: 'PIN incorreto.' };
    }

    clearVolatileSecret(orderId);
    setState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target) return prev;
      let nextParts = prev.parts;
      if (target.stockDeducted) {
        const snap = target.stockSnapshot || buildOrderStockSnapshot(target);
        nextParts = applyStockSnapshotToParts(nextParts, snap, 1);
      }

      const linkedIds = new Set(
        prev.transactions
          .filter(
            (tx) =>
              tx.orderId === orderId ||
              tx.tag === `OS ${target.code}` ||
              (tx.title && tx.title.includes(target.code))
          )
          .map((tx) => tx.id)
      );

      let nextBalances = prev.interBalances;
      prev.transactions.forEach((tx) => {
        if (linkedIds.has(tx.id)) {
          nextBalances = applyTransactionDelta({ ...prev, interBalances: nextBalances }, tx, -1);
        }
      });

      return {
        ...prev,
        parts: nextParts,
        orders: prev.orders.filter((o) => o.id !== orderId),
        priorityQueue: prev.priorityQueue.filter((pq) => pq.osCode !== `OS ${target.code}`),
        transactions: prev.transactions.filter((tx) => !linkedIds.has(tx.id)),
        interBalances: nextBalances,
      };
    });
    scheduleCloudSync(2500);
    return { ok: true };
  };

  const attachTelemetryToOrder = (orderId: number, telemetry: TelemetryReading) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId ? { ...o, telemetry, updatedAt: Date.now() } : o
      ),
    }));
    scheduleCloudSync(3500);
  };

  const addClient = (
    input: Omit<Client, 'id' | 'ltv' | 'ordersCount' | 'lastVisit' | 'restrictions'>
  ): Client => {
    const newClient: Client = {
      ...input,
      id: `cli-${Date.now()}`,
      ltv: 0,
      ordersCount: 0,
      lastVisit: 'Hoje',
      restrictions: [],
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      clients: [newClient, ...prev.clients],
    }));
    scheduleCloudSync(3500);
    return newClient;
  };

  const addClientNote = (clientId: string, note: string) => {
    if (!note.trim()) return;
    setState((prev) => ({
      ...prev,
      clients: prev.clients.map((c) =>
        c.id === clientId
          ? { ...c, restrictions: [...c.restrictions, note.trim()], updatedAt: Date.now() }
          : c
      ),
    }));
    scheduleCloudSync(3500);
  };

  const reorderPriorityQueue = (index: number, direction: 'up' | 'down') => {
    setState((prev) => {
      const next = [...prev.priorityQueue];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return { ...prev, priorityQueue: next };
    });
    scheduleCloudSync(3500);
  };

  const enqueuePriorityItem = (osCode: string, title: string, hours: number) => {
    setState((prev) => ({
      ...prev,
      priorityQueue: [
        ...prev.priorityQueue,
        {
          id: `pq-${Date.now()}`,
          osCode,
          statusLabel: 'Aprovado',
          benchLabel: 'Bancada A',
          title,
          promised: 'Sexta 17:00',
          estimated: `${hours.toFixed(1)}h previstas`,
          durationHours: hours,
          updatedAt: Date.now(),
        },
      ],
    }));
    scheduleCloudSync(3500);
  };

  const updateDayCapacity = (dayId: string, hours: number) => {
    const cleanHours = Math.max(0, Math.min(24, Number(hours) || 0));
    const dow = DAY_ID_TO_DOW[dayId];
    setState((prev) => {
      const nextHoras = [...(prev.cfg.horas || [...OFFICIAL_HOURS_BY_DOW])];
      if (dow !== undefined) nextHoras[dow] = cleanHours;
      return reconcileDerivedFromCfg({
        ...prev,
        cfg: { ...prev.cfg, horas: nextHoras },
        scheduleDays: prev.scheduleDays.map((d) =>
          d.id === dayId ? { ...d, capacityHours: cleanHours, isOff: cleanHours === 0, updatedAt: Date.now() } : d
        ),
      });
    });
    scheduleCloudSync(3500);
  };

  const setWeekdayHours = (dowIndex: number, hours: number) => {
    if (dowIndex < 0 || dowIndex > 6) return;
    const cleanHours = Math.max(0, Math.min(24, Number(hours) || 0));
    setState((prev) => {
      const nextHoras = [...(prev.cfg.horas || [...OFFICIAL_HOURS_BY_DOW])];
      nextHoras[dowIndex] = cleanHours;
      return reconcileDerivedFromCfg({
        ...prev,
        cfg: { ...prev.cfg, horas: nextHoras },
      });
    });
    scheduleCloudSync(3500);
  };

  const setWorkdaysHours = (hours: number) => {
    const cleanHours = Math.max(0, Math.min(24, Number(hours) || 0));
    setState((prev) => {
      const nextHoras = [...(prev.cfg.horas || [...OFFICIAL_HOURS_BY_DOW])];
      for (let i = 1; i <= 5; i++) {
        nextHoras[i] = cleanHours;
      }
      return reconcileDerivedFromCfg({
        ...prev,
        cfg: { ...prev.cfg, horas: nextHoras },
      });
    });
    scheduleCloudSync(3500);
  };

  const addPart = (partInput: Omit<PartItem, 'id' | 'status'>) => {
    const status: PartItem['status'] =
      partInput.stock === 0
        ? 'Esgotado'
        : partInput.stock <= partInput.minStock
        ? 'Alerta Reposição'
        : 'Disponível';
    const newPart: PartItem = {
      ...partInput,
      id: `part-${Date.now()}`,
      status,
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      parts: [newPart, ...prev.parts],
    }));
    scheduleCloudSync(3500);
  };

  const adjustPartStock = (partId: string, delta: number) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId) return p;
        const nextStock = Math.max(0, p.stock + delta);
        const status: PartItem['status'] =
          nextStock === 0
            ? 'Esgotado'
            : nextStock <= p.minStock
            ? 'Alerta Reposição'
            : 'Disponível';
        return { ...p, stock: nextStock, status, updatedAt: Date.now() };
      }),
    }));
    scheduleCloudSync(3500);
  };

  const addSupplier = (
    supInput: Omit<Supplier, 'id' | 'initials' | 'rating' | 'rmaRate' | 'rmaStatus'>
  ): Supplier => {
    const words = supInput.name.trim().split(/\s+/).filter(Boolean);
    const initials =
      words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : supInput.name.trim().slice(0, 2).toUpperCase() || 'FR';
    const newSup: Supplier = {
      ...supInput,
      id: `sup-${Date.now()}`,
      initials,
      rating: '5.0',
      rmaRate: '0,0%',
      rmaStatus: 'Regular',
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      suppliers: [newSup, ...prev.suppliers],
    }));
    scheduleCloudSync(3500);
    return newSup;
  };

  const addTransaction = (txInput: Omit<CashTransaction, 'id' | 'dateLabel'>) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newTx: CashTransaction = {
      ...txInput,
      id: `tx-${Date.now()}`,
      dateLabel: `Hoje, ${timeStr}`,
      updatedAt: Date.now(),
    };
    setState((prev) => {
      const garRate = (prev.budgetParams.guaranteeRatePct ?? OFFICIAL_WARRANTY_RESERVE_PCT) / 100;
      const capRate = (prev.budgetParams.workingCapitalRatePct ?? OFFICIAL_WORKING_CAPITAL_PCT) / 100;
      const feeRate = (prev.budgetParams.paymentFeePct ?? OFFICIAL_PAYMENT_FEE_PCT) / 100;

      const netAfterFee = newTx.type === 'in' ? newTx.amount * (1 - feeRate) : 0;
      const guaranteeAdd = newTx.type === 'in' ? Math.round(newTx.amount * garRate * 100) / 100 : 0;
      const workingAdd = newTx.type === 'in' ? Math.round(netAfterFee * capRate * 100) / 100 : 0;
      const deltaConta = newTx.type === 'in' ? netAfterFee - guaranteeAdd - workingAdd : -newTx.amount;

      return {
        ...prev,
        transactions: [newTx, ...prev.transactions],
        interBalances: {
          ...prev.interBalances,
          operational: Math.max(0, Math.round((prev.interBalances.operational + deltaConta) * 100) / 100),
          garantiaReserve: Math.round((prev.interBalances.garantiaReserve + guaranteeAdd) * 100) / 100,
          workingCapital: Math.round((prev.interBalances.workingCapital + workingAdd) * 100) / 100,
          porquinhoTotal: Math.round((prev.interBalances.porquinhoTotal + guaranteeAdd + workingAdd) * 100) / 100,
          currentMonthRevenue:
            newTx.type === 'in'
              ? Math.round((prev.interBalances.currentMonthRevenue + newTx.amount) * 100) / 100
              : prev.interBalances.currentMonthRevenue,
        },
      };
    });
    scheduleCloudSync(3500);
  };

  const recordRestockOrder = (supplierName: string, itemsDesc: string, totalCost: number) => {
    const nextNum = (state.counters?.nextPurchaseNumber || 0) + 1;
    const code = `PED-${String(nextNum).padStart(4, '0')}`;
    setState((prev) => ({
      ...prev,
      counters: {
        nextOrderNumber: prev.counters?.nextOrderNumber || 0,
        nextSaleNumber: prev.counters?.nextSaleNumber || 0,
        nextPurchaseNumber: nextNum,
      },
      shipments: [
        {
          id: `ship-${Date.now()}`,
          trackingCode: code,
          title: itemsDesc,
          sender: `${supplierName} · Pedido via MicroLab OS`,
          etaLabel: 'Postagem solicitada',
          progressStep: 1,
          updatedAt: Date.now(),
        },
        ...prev.shipments,
      ],
      transactions: [
        {
          id: `tx-${Date.now()}`,
          title: `Pedido Reposição: ${supplierName}`,
          subtitle: itemsDesc,
          tag: code,
          channel: 'Fornecedores',
          type: 'out',
          amount: totalCost,
          dateLabel: 'Agora',
          reconciled: false,
          updatedAt: Date.now(),
        },
        ...prev.transactions,
      ],
    }));
    scheduleCloudSync(3500);
  };

  const updateWarrantyStatus = (
    warrantyId: string,
    status: 'Em Análise' | 'RMA Fornecedor' | 'Concluída'
  ) => {
    setState((prev) => ({
      ...prev,
      warranties: prev.warranties.map((w) =>
        w.id === warrantyId ? { ...w, status, updatedAt: Date.now() } : w
      ),
    }));
    scheduleCloudSync(3500);
  };

  const updateBudgetParams = (partial: Partial<LabState['budgetParams']>) => {
    setState((prev) => {
      const prevCfg = prev.cfg;
      const nextCfg: LabConfig = {
        ...prevCfg,
        ocup: partial.occupancyPct !== undefined ? Math.max(0, Math.min(1, partial.occupancyPct / 100)) : prevCfg.ocup,
        proLabore: partial.proLabore !== undefined ? Math.max(0, partial.proLabore) : prevCfg.proLabore,
        horaMin: partial.baseHourlyRate !== undefined && prevCfg.preco.modo !== 'manual' ? Math.max(0, partial.baseHourlyRate) : prevCfg.horaMin,
        taxaPag: partial.paymentFeePct !== undefined ? Math.max(0, partial.paymentFeePct / 100) : prevCfg.taxaPag,
        reservaGar: partial.guaranteeRatePct !== undefined ? Math.max(0, partial.guaranteeRatePct / 100) : prevCfg.reservaGar,
        reservaCap: partial.workingCapitalRatePct !== undefined ? Math.max(0, partial.workingCapitalRatePct / 100) : prevCfg.reservaCap,
        preco: {
          ...prevCfg.preco,
          margem:
            partial.profitMarginPct !== undefined
              ? Math.max(0, partial.profitMarginPct / 100)
              : prevCfg.preco.margem,
          hora:
            partial.baseHourlyRate !== undefined && prevCfg.preco.modo === 'manual'
              ? Math.max(0, partial.baseHourlyRate)
              : prevCfg.preco.hora,
          indireto:
            partial.indirectHourlyRate !== undefined && prevCfg.preco.modo === 'manual'
              ? Math.max(0, partial.indirectHourlyRate)
              : prevCfg.preco.indireto,
        },
      };
      return reconcileDerivedFromCfg({ ...prev, cfg: nextCfg });
    });
    scheduleCloudSync(3500);
  };

  const updateLabConfig = (updater: Partial<LabConfig> | ((prevCfg: LabConfig) => LabConfig)) => {
    setState((prev) => {
      const nextCfg =
        typeof updater === 'function' ? updater(prev.cfg) : { ...prev.cfg, ...updater };
      return reconcileDerivedFromCfg({ ...prev, cfg: nextCfg });
    });
    scheduleCloudSync(3500);
  };

  const setQuickFixedExpense = (nome: string, cat: string, valor: number) => {
    const cleanVal = Math.max(0, Number(valor) || 0);
    const currentMonth = new Date().toISOString().slice(0, 7);
    setState((prev) => {
      const idx = prev.fixos.findIndex((f) => normStr(f.nome) === normStr(nome));
      let nextFixos: FixedExpenseItem[];
      if (idx >= 0) {
        nextFixos = prev.fixos.map((f, i) =>
          i === idx ? { ...f, valor: cleanVal, ativo: cleanVal > 0 ? true : f.ativo, updatedAt: Date.now() } : f
        );
      } else if (cleanVal > 0) {
        nextFixos = [
          ...prev.fixos,
          {
            id: `fixo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            nome,
            valor: cleanVal,
            cat,
            dia: 1,
            ativo: true,
            ultimo: currentMonth,
            updatedAt: Date.now(),
          },
        ];
      } else {
        nextFixos = prev.fixos;
      }
      return reconcileDerivedFromCfg({ ...prev, fixos: nextFixos });
    });
    scheduleCloudSync(3500);
  };

  const addFixedExpense = (
    item: Omit<FixedExpenseItem, 'id' | 'ultimo' | 'ativo'> & { ativo?: boolean }
  ) => {
    const nome = item.nome.trim();
    if (!nome) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const created: FixedExpenseItem = {
      id: `fixo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nome,
      valor: Math.max(0, Number(item.valor) || 0),
      cat: item.cat || 'Outros',
      dia: Math.max(1, Math.min(28, parseInt(String(item.dia || 1), 10) || 1)),
      ativo: item.ativo !== false,
      ultimo: currentMonth,
      updatedAt: Date.now(),
    };
    setState((prev) => reconcileDerivedFromCfg({ ...prev, fixos: [...prev.fixos, created] }));
    scheduleCloudSync(3500);
  };

  const updateFixedExpense = (id: string, partial: Partial<FixedExpenseItem>) => {
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        fixos: prev.fixos.map((f) =>
          f.id === id
            ? {
                ...f,
                ...partial,
                dia:
                  partial.dia !== undefined
                    ? Math.max(1, Math.min(28, parseInt(String(partial.dia), 10) || 1))
                    : f.dia,
                valor: partial.valor !== undefined ? Math.max(0, Number(partial.valor) || 0) : f.valor,
                updatedAt: Date.now(),
              }
            : f
        ),
      })
    );
    scheduleCloudSync(3500);
  };

  const toggleFixedExpense = (id: string) => {
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        fixos: prev.fixos.map((f) =>
          f.id === id ? { ...f, ativo: !f.ativo, updatedAt: Date.now() } : f
        ),
      })
    );
    scheduleCloudSync(3500);
  };

  const deleteFixedExpense = (id: string) => {
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        fixos: prev.fixos.filter((f) => f.id !== id),
      })
    );
    scheduleCloudSync(3500);
  };

  const addDeliveryZone = (bairro: string, valor: number) => {
    const cleanBairro = bairro.trim();
    if (!cleanBairro) return;
    const cleanValor = Math.max(0, Number(valor) || 0);
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        entrega: [...prev.cfg.entrega, { bairro: cleanBairro, valor: cleanValor }],
      },
    }));
    scheduleCloudSync(3500);
  };

  const deleteDeliveryZone = (index: number) => {
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        entrega: prev.cfg.entrega.filter((_, i) => i !== index),
      },
    }));
    scheduleCloudSync(3500);
  };

  const restoreOfficialPricingDefaults = () => {
    const def = createDefaultLabConfig();
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        fixos: DEFAULT_FIXOS_SEED.map((f) => ({ ...f, updatedAt: Date.now() })),
        cfg: {
          ...def,
          // Preserva chave PIX já personalizada se usuário não quiser perder, ou restaura PIX oficial?
          // Restaura todos parâmetros financeiros/operacionais oficiais conforme especificado:
          _ts: prev.cfg._ts || {},
        },
      })
    );
    scheduleCloudSync(3500);
  };

  const configureFirebase = (input: string | { apiKey: string; projectId: string }) => {
    const parsed = typeof input === 'string' ? parseFirebaseConfigText(input) : input;
    const apiKey = (parsed.apiKey || '').trim();
    const projectId = (parsed.projectId || '').trim();
    if (!apiKey || !projectId) {
      throw new Error('Informe apiKey e projectId válidos do firebaseConfig.');
    }
    const projectChanged = Boolean(auth.projectId && auth.projectId !== projectId);
    const nextAuth: FirebaseAuthState = {
      apiKey,
      projectId,
      email: projectChanged ? '' : auth.email,
      refreshToken: projectChanged ? '' : auth.refreshToken,
      uid: projectChanged ? '' : auth.uid,
      idToken: projectChanged ? '' : auth.idToken,
      expiresAt: projectChanged ? 0 : auth.expiresAt,
    };
    saveAuthState(nextAuth);
    setAuth(nextAuth);
    if (projectChanged) {
      setState(loadStateForUid(''));
      setPendingCount(Object.keys(loadSyncMetadata('').dirty).length);
      setLastSyncAt(0);
    }
    setSyncError('');
  };

  const clearFirebaseConfig = () => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    const emptyAuth: FirebaseAuthState = {
      apiKey: '',
      projectId: '',
      email: '',
      refreshToken: '',
      uid: '',
      idToken: '',
      expiresAt: 0,
    };
    saveAuthState(emptyAuth);
    setAuth(emptyAuth);
    setPendingAccountSwitch(null);
    setSyncError('');
    setSyncWarning('');
    setLastSyncAt(0);
    setState(loadStateForUid(''));
    setPendingCount(0);
  };

  const commitAccountActivation = useCallback(
    (nextAuth: FirebaseAuthState) => {
      saveAuthState(nextAuth);
      setAuth(nextAuth);
      setPendingAccountSwitch(null);
      // Carrega o armazenamento isolado do UID de destino (nunca herda registros de outra conta)
      const isolatedState = loadStateForUid(nextAuth.uid);
      const isolatedMeta = loadSyncMetadata(nextAuth.uid);
      if (isolatedMeta.uid !== nextAuth.uid) {
        isolatedMeta.uid = nextAuth.uid;
        isolatedMeta.cursor = '';
        saveSyncMetadata(nextAuth.uid, isolatedMeta);
      }
      setState(isolatedState);
      setCurrentUser(null);
      setPowerSupplyStatusState({ connected: false, outputOn: false });
      setLastSyncAt(isolatedMeta.lastSyncAt || 0);
      setPendingCount(Object.keys(isolatedMeta.dirty).length);
      setSyncError('');
      // Agenda sincronização imediata para a nova conta
      window.setTimeout(() => {
        void executeCloudSync();
      }, 300);
    },
    [executeCloudSync]
  );

  const requestCloudSignIn = async (
    email: string,
    password: string
  ): Promise<{ switchedDirectly: boolean }> => {
    if (!auth.apiKey || !auth.projectId) {
      throw new Error('Salve a configuração do Firebase (apiKey e projectId) antes de entrar.');
    }
    try {
      const cred = await authenticateFirebaseEmailPassword(auth.apiKey, email, password);
      const nextAuth: FirebaseAuthState = {
        ...auth,
        email: cred.email,
        refreshToken: cred.refreshToken,
        uid: cred.uid,
        idToken: cred.idToken,
        expiresAt: cred.expiresAt,
      };

      const prevUid = auth.uid || '';
      const prevMeta = loadSyncMetadata(prevUid);
      const prevPending = Object.keys(prevMeta.dirty).length;
      const nextHasLocalCache = Boolean(localStorage.getItem(getDbStorageKey(cred.uid)));

      // Se havia outra conta ativa OU alterações pendentes na sessão local não autenticada,
      // exige confirmação explícita antes de trocar para o namespace microlab_os_db_<uid>.
      if ((prevUid && prevUid !== cred.uid) || (!prevUid && prevPending > 0)) {
        setPendingAccountSwitch({
          nextAuth,
          previousUid: prevUid,
          previousEmail: auth.email || 'Sessão local sem nuvem',
          previousPendingCount: prevPending,
          nextHasLocalCache,
        });
        return { switchedDirectly: false };
      }

      commitAccountActivation(nextAuth);
      return { switchedDirectly: true };
    } catch (err) {
      const msg = formatFirebaseSyncError(err, auth);
      setSyncError(msg);
      throw new Error(msg);
    }
  };

  const confirmAccountSwitch = (confirm: boolean) => {
    if (!confirm || !pendingAccountSwitch) {
      setPendingAccountSwitch(null);
      return;
    }
    commitAccountActivation(pendingAccountSwitch.nextAuth);
  };

  const signOutCloud = () => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    const nextAuth: FirebaseAuthState = {
      ...auth,
      refreshToken: '',
      idToken: '',
      uid: '',
      expiresAt: 0,
    };
    saveAuthState(nextAuth);
    setAuth(nextAuth);
    setSyncError('');
    setSyncWarning('');
    // Retorna para o banco local isolado (sem expor dados da conta que saiu)
    setState(loadStateForUid(''));
    setCurrentUser(null);
    setPowerSupplyStatusState({ connected: false, outputOn: false });
    setLastSyncAt(0);
    setPendingCount(Object.keys(loadSyncMetadata('').dirty).length);
  };

  const syncNow = async (): Promise<boolean> => {
    if (auth.apiKey && auth.projectId && auth.refreshToken && auth.uid) {
      return executeCloudSync();
    }
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setState((prev) => ({
      ...prev,
      labProfile: { ...prev.labProfile, lastSync: `Salvo local às ${timeStr}` },
    }));
    return true;
  };

  const exportBackupJson = (): string => {
    // LGPD: Garante que nenhuma senha ou padrão de desbloqueio entra no backup JSON
    const clean = sanitizeLabStateForPersistence(stateRef.current);
    return JSON.stringify(clean, null, 2);
  };

  const importBackupJson = (jsonText: string): { ok: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(jsonText) as LabState;
      if (!parsed || !Array.isArray(parsed.orders) || !Array.isArray(parsed.clients)) {
        return { ok: false, error: 'Arquivo JSON inválido: estrutura MicroLab OS não reconhecida.' };
      }
      const clean = hydrateLabState(parsed);
      const uid = auth.uid || '';
      saveSyncMetadata(uid, emptySyncMetadata(uid));
      setState(clean);
      setVolatileSecrets({});
      return { ok: true };
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo JSON selecionado.' };
    }
  };

  const factoryResetLocalDb = () => {
    const uid = auth.uid || '';
    localStorage.removeItem(getDbStorageKey(uid));
    if (!uid) {
      localStorage.removeItem(LEGACY_DB_KEY);
    }
    saveSyncMetadata(uid, emptySyncMetadata(uid));
    setVolatileSecrets({});
    setPendingCount(0);
    setLastSyncAt(0);
    setPowerSupplyStatusState({ connected: false, outputOn: false });
    setCurrentUser(null);
    setState(createInitialLabState());
  };

  const syncStatus: SyncStatus = {
    configured: Boolean(auth.apiKey && auth.projectId),
    loggedIn: Boolean(auth.apiKey && auth.projectId && auth.refreshToken && auth.uid),
    uid: auth.uid || '',
    email: auth.email || '',
    storageKey: getDbStorageKey(auth.uid),
    busy: syncBusy,
    lastSyncAt,
    pendingCount,
    error: syncError,
    warning: syncWarning,
  };

  const isAtendente = isAtendenteRole(currentUser?.nivel);
  const canAccessRoute = useCallback(
    (route: RouteId) => canRoleAccessRoute(currentUser?.nivel, route),
    [currentUser?.nivel]
  );

  return (
    <LabContext.Provider
      value={{
        state,
        currentUser,
        isAtendente,
        canAccessRoute,
        powerSupplyStatus,
        setPowerSupplyStatus,
        createFirstAdmin,
        loginWithPin,
        logoutSession,
        addAppUser,
        resetAppUserPin,
        deleteAppUser,
        addTechnician,
        deleteTechnician,
        addSeller,
        deleteSeller,
        syncStatus,
        firebaseConfig: { apiKey: auth.apiKey, projectId: auth.projectId },
        pendingAccountSwitch,
        getVolatileSecret,
        setVolatileSecret,
        clearVolatileSecret,
        osPrefillDraft,
        setOsPrefillDraft,
        addOrder,
        saveServiceOrder,
        updateOrderStatus,
        markOrderPartArrived,
        receiveOrderPayment,
        cancelOrderWithOptions,
        deleteOrderWithAdminPin,
        attachTelemetryToOrder,
        addClient,
        addClientNote,
        reorderPriorityQueue,
        enqueuePriorityItem,
        updateDayCapacity,
        addPart,
        adjustPartStock,
        addSupplier,
        addTransaction,
        recordRestockOrder,
        updateWarrantyStatus,
        updateBudgetParams,
        updateLabConfig,
        setWeekdayHours,
        setWorkdaysHours,
        setQuickFixedExpense,
        addFixedExpense,
        updateFixedExpense,
        toggleFixedExpense,
        deleteFixedExpense,
        addDeliveryZone,
        deleteDeliveryZone,
        restoreOfficialPricingDefaults,
        configureFirebase,
        clearFirebaseConfig,
        requestCloudSignIn,
        confirmAccountSwitch,
        signOutCloud,
        syncNow,
        exportBackupJson,
        importBackupJson,
        factoryResetLocalDb,
      }}
    >
      {children}
    </LabContext.Provider>
  );
};

export function useLabStore() {
  const ctx = useContext(LabContext);
  if (!ctx) {
    throw new Error('useLabStore must be used inside LabProvider');
  }
  return ctx;
}

export function formatBRL(value: number) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
