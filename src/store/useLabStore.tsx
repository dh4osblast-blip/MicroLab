import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AppUser,
  CashTransaction,
  Client,
  CustomDefectItem,
  FixedExpenseItem,
  LabConfig,
  LabState,
  OrderDiagnosticReport,
  OrderExtraItem,
  OrderStatus,
  OsPrefillDraft,
  PartItem,
  PayableBill,
  PowerSupplyMemory,
  PowerSupplyTestEntry,
  PurchaseItem,
  PurchaseRecord,
  RouteId,
  SaleItem,
  SaleRecord,
  SellerPerson,
  ServiceCatalogItem,
  ServiceOrder,
  Supplier,
  TechnicianPerson,
  TelemetryReading,
  UserRole,
  WarrantyCase,
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
  DEFAULT_COMPLEXIDADES,
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
  arredondarPreco,
  calcClientMetrics,
  calcCofreReservaGarantia,
  calcDiagTaxa,
  calcEffectivePricingFromConfig,
  calcEquilibrio90d,
  calcFinLayers,
  calcOrderTotalAmount,
  calcPurchaseTotalAmount,
  calcSaleTotalAmount,
  computePartStatus,
  createDefaultLabConfig,
  formatDateBR,
  getFilaOrders,
  margemPctPeca,
  planejar,
  precoVendaPeca,
  resolveOrderWarrantyDays,
  roundCurrency3,
  roundStockQty,
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
import {
  MediaSlot,
  buildDeterministicMediaId,
  clearMediaForUid,
  extractLegacyOrderMedia,
  markMediaRecordDeleted,
  putMediaRecord,
} from '../services/mediaStore';

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

  const todayIso = todayIsoLocal();
  const todayDate = new Date();
  const todayDow = todayDate.getDay();
  const plan = planejar(state.orders, horas);
  const fila = getFilaOrders(state.orders);
  const orderById = new Map(state.orders.map((o) => [o.id, o]));
  const colorIdxByOs = new Map<number, number>();
  fila.forEach((o, k) => colorIdxByOs.set(o.id, k % 2));

  // Mapa de dia da semana (0..6) -> data ISO nos próximos 7 dias a partir de hoje
  const dowToIso = new Map<number, string>();
  for (let k = 0; k < 7; k++) {
    const iso = addDiasIso(todayIso, k);
    const [y, m, dd] = iso.split('-').map(Number);
    const dw = new Date(y, m - 1, dd).getDay();
    dowToIso.set(dw, iso);
  }

  const nextDays = state.scheduleDays.map((d) => {
    const dow = DAY_ID_TO_DOW[d.id];
    if (dow === undefined) return d;
    const cap = Math.max(0, Math.min(24, Number(horas[dow]) || 0));
    const iso = dowToIso.get(dow);
    const plannedDay = iso ? plan.dias.find((pd) => pd.iso === iso) : undefined;
    const seenBefore = new Set<number>();
    if (iso) {
      plan.dias
        .filter((pd) => pd.iso < iso)
        .forEach((pd) => pd.blocos.forEach((b) => {
          if (typeof b.osId === 'number') seenBefore.add(b.osId);
        }));
    }

    const items = (plannedDay?.blocos || [])
      .map((b, idx) => {
        if (typeof b.osId !== 'number') return null;
        const ordObj = orderById.get(b.osId);
        if (!ordObj) return null;
        const isCont = seenBefore.has(b.osId);
        const tone: 'primary' | 'voltage' | 'dark' | 'secondary' =
          ordObj.status === 'Em reparo' || ordObj.status === 'Em Reparo SMD'
            ? 'voltage'
            : (colorIdxByOs.get(b.osId) || 0) === 0
            ? 'primary'
            : 'dark';
        return {
          id: `pl-${iso}-${b.osId}-${idx}`,
          orderId: b.osId,
          osCode: ordObj.code,
          title: `${ordObj.device}${isCont ? ' (continuação)' : ''}`,
          hours: b.hours,
          isContinuation: isCont,
          status: ordObj.status,
          tone,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    return {
      ...d,
      capacityHours: cap,
      isOff: cap === 0,
      isToday: dow === todayDow,
      items,
    };
  });

  const nextPriorityQueue = fila.map((o) => {
    const predictedIso = plan.prev[String(o.id)] || '';
    const isLateRisk = Boolean(
      o.expectedDeliveryDate && predictedIso && predictedIso > o.expectedDeliveryDate
    );
    return {
      id: `pq-${o.id}`,
      orderId: o.id,
      osCode: o.code,
      statusLabel: o.status,
      benchLabel: 'Bancada A',
      title: `${o.device}${o.issue ? ` — ${o.issue.slice(0, 32)}` : ''}`,
      promised: o.expectedDeliveryDate ? formatDateBR(o.expectedDeliveryDate) : 'A definir',
      estimated:
        Number(o.estimatedHours) > 0
          ? `${Number(o.estimatedHours).toFixed(1)}h previstas`
          : 'Sem tempo estimado',
      queuePredictedDate: predictedIso,
      isLateRisk,
      warningNote: isLateRisk ? 'Pode atrasar em relação ao prometido' : undefined,
      durationHours: Math.max(0, Number(o.estimatedHours) || 0),
      updatedAt: o.updatedAt || Date.now(),
    };
  });

  const nextClients = state.clients.map((c) => {
    const m = calcClientMetrics(c, state.orders, state.vendas);
    const nextVisit = m.lastActivityIso ? formatDateBR(m.lastActivityIso) : c.lastVisit;
    if (
      c.ltv === m.ltv &&
      c.ordersCount === m.ordersCount &&
      c.lastDevice === m.lastDevice &&
      c.lastVisit === nextVisit
    ) {
      return c;
    }
    return {
      ...c,
      ltv: m.ltv,
      ordersCount: m.ordersCount,
      lastDevice: m.lastDevice,
      lastVisit: nextVisit,
    };
  });

  const proLabore = Math.max(0, Number(cfg.proLabore) || 0);
  const fixedCosts = eff.fixedCosts;

  const updatedOrdersState: LabState = {
    ...state,
    clients: nextClients,
    scheduleDays: nextDays,
    priorityQueue: nextPriorityQueue,
  };

  // Financeiro em 3 Camadas v17 (substitui qualquer rateio automático por transação)
  const kAll = calcFinLayers(updatedOrdersState, 'all');
  const eq = kAll.equilibrio;
  const cf = kAll.cofre;
  const garantiaBal = Math.round(cf.saldo * 100) / 100;
  const giroBal = Math.round(kAll.saldo3 * 100) / 100;
  const porquinhoBal = Math.round((Math.max(0, garantiaBal) + Math.max(0, giroBal)) * 100) / 100;
  const operationalBal =
    Math.round((cf.totalCashBalance - Math.max(0, garantiaBal) - Math.max(0, giroBal)) * 100) /
    100;

  return {
    ...updatedOrdersState,
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
      operational: operationalBal,
      porquinhoTotal: porquinhoBal,
      garantiaReserve: garantiaBal,
      workingCapital: giroBal,
      fixedCosts,
      proLabore,
      monthlyBreakEvenTarget: eq.meta,
      currentMonthRevenue: eq.faturamento,
    },
    labProfile: {
      ...state.labProfile,
      pixKey: cfg.pixKey,
      pixMerchant: cfg.pixNome,
      pixCity: cfg.pixCid,
    },
  };
};

/**
 * `lancarFixos()` v17: Lança automaticamente despesas fixas ativas cujo dia de vencimento já chegou no mês atual,
 * usando ID determinístico `fx_<id>_<YYYY-MM>` para nunca duplicar entre aparelhos.
 */
function applyDueFixedExpenses(state: LabState): { state: LabState; changed: boolean } {
  const hoje = todayIsoLocal();
  const mes = hoje.slice(0, 7);
  const diaHoje = Number(hoje.slice(8, 10)) || 1;
  let changed = false;

  const addedTxs: CashTransaction[] = [];
  const nextFixos = (state.fixos || []).map((x) => {
    const dueDay = Math.max(1, Math.min(28, Number(x.dia) || 1));
    if (x.ativo !== false && x.ultimo !== mes && diaHoje >= dueDay) {
      const fid = `fx_${x.id}_${mes}`;
      const alreadyExists = (state.transactions || []).some((t) => t.id === fid) ||
        addedTxs.some((t) => t.id === fid);
      const wasDeleted = Boolean(state.tombstones?.transactions?.[fid]);
      if (!alreadyExists && !wasDeleted && (Number(x.valor) || 0) > 0) {
        addedTxs.push({
          id: fid,
          title: x.nome,
          subtitle: `Despesa fixa recorrente · ${x.cat || 'Outros'}`,
          tag: x.cat || 'Outros',
          channel: 'Fixo',
          type: 'out',
          amount: Math.max(0, Number(x.valor) || 0),
          dateLabel: formatDateBR(hoje),
          isoDate: hoje,
          kind: 'fixo',
          reconciled: true,
          updatedAt: Date.now(),
        });
      }
      changed = true;
      return { ...x, ultimo: mes, updatedAt: Date.now() };
    }
    return x;
  });

  if (!changed) return { state, changed: false };
  return {
    state: reconcileDerivedFromCfg({
      ...state,
      fixos: nextFixos,
      transactions: addedTxs.length > 0 ? [...addedTxs, ...state.transactions] : state.transactions,
    }),
    changed: true,
  };
}

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
    contasPagar: [],
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

function persistExtractedMediaForUid(
  uid: string,
  pendingWrites: Array<{
    id: string;
    orderId: number;
    slot: MediaSlot;
    dataUrl: string;
    mime?: string;
    updatedAt: number;
  }>
) {
  if (!pendingWrites.length) return;
  const meta = loadSyncMetadata(uid);
  let metaChanged = false;
  pendingWrites.forEach((rec) => {
    if (meta.dirty[`media/${rec.id}`] !== 1) {
      meta.dirty[`media/${rec.id}`] = 1;
      metaChanged = true;
    }
    void putMediaRecord(uid, rec);
  });
  if (metaChanged) saveSyncMetadata(uid, meta);
}

function hydrateLabState(
  raw: Partial<LabState> | null | undefined,
  uidForMediaMigration?: string
): LabState {
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
    pmicMin: Number(rawCfg.pmicMin) > 0 ? Number(rawCfg.pmicMin) : 3.4,
    defeitosExtra: Array.isArray(rawCfg.defeitosExtra) ? rawCfg.defeitosExtra : [],
    complexidades:
      Array.isArray(rawCfg.complexidades) && rawCfg.complexidades.length > 0
        ? rawCfg.complexidades
            .filter((c) => c && typeof c === 'object')
            .map((c, idx) => ({
              id: String(c.id || `cx-${idx + 1}`),
              nome: String(c.nome || `Nível ${idx + 1}`),
              mult: Math.max(0.1, Number(c.mult) || 1.0),
            }))
        : DEFAULT_COMPLEXIDADES.map((c) => ({ ...c })),
    techSignatureDataUrl:
      typeof rawCfg.techSignatureDataUrl === 'string' && rawCfg.techSignatureDataUrl.trim()
        ? rawCfg.techSignatureDataUrl
        : undefined,
    autoPrintTechSignature: rawCfg.autoPrintTechSignature !== false,
    thermalWidth: rawCfg.thermalWidth === '58mm' ? '58mm' : '80mm',
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

  const rawOrders = Array.isArray(raw.orders) ? raw.orders : base.orders;
  let finalOrders = rawOrders;
  if (uidForMediaMigration !== undefined) {
    const extracted = extractLegacyOrderMedia(uidForMediaMigration, rawOrders);
    finalOrders = extracted.orders;
    if (extracted.pendingWrites.length > 0) {
      persistExtractedMediaForUid(uidForMediaMigration, extracted.pendingWrites);
    }
  }

  const hydratedPayables: PayableBill[] = Array.isArray(raw.contasPagar)
    ? raw.contasPagar
        .filter((b): b is PayableBill => Boolean(b && typeof b === 'object'))
        .map((b) => ({
          ...b,
          id: String(b.id || `cpag-${Date.now()}`),
          descricao: String(b.descricao || 'Conta a pagar'),
          categoria: String(b.categoria || 'Outros'),
          valor: Math.max(0, Number(b.valor) || 0),
          vencimento: String(b.vencimento || todayIsoLocal()),
          status: b.status === 'Pago' ? 'Pago' : 'Pendente',
        }))
    : base.contasPagar;

  const merged: LabState = {
    ...base,
    ...raw,
    orders: finalOrders,
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
    contasPagar: hydratedPayables,
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
  const cleanUid = uid || '';
  try {
    const saved = localStorage.getItem(targetKey);
    if (saved) {
      const parsedRaw = JSON.parse(saved) as Partial<LabState>;
      const hadLegacyMedia =
        Array.isArray(parsedRaw.orders) &&
        parsedRaw.orders.some((o) => Boolean(o?.evidencePhotos || o?.clientSignatureDataUrl || o?.signatureDataUrl));
      const hydrated = hydrateLabState(parsedRaw, cleanUid);
      const withFixos = applyDueFixedExpenses(hydrated).state;
      if (hadLegacyMedia) {
        try {
          localStorage.setItem(targetKey, JSON.stringify(withFixos));
        } catch {
          // Ignore quota
        }
      }
      return withFixos;
    }
    // Se unauthenticated ('local') e ainda existe a chave legada v18, migra sanitizada sem manter passcodes
    if (!uid) {
      const legacy = localStorage.getItem(LEGACY_DB_KEY);
      if (legacy) {
        const parsed = hydrateLabState(JSON.parse(legacy) as Partial<LabState>, cleanUid);
        const withFixos = applyDueFixedExpenses(parsed).state;
        localStorage.setItem(targetKey, JSON.stringify(withFixos));
        localStorage.removeItem(LEGACY_DB_KEY);
        return withFixos;
      }
    }
  } catch {
    // Fallback to initial state
  }
  return applyDueFixedExpenses(createInitialLabState()).state;
}

interface LabContextValue {
  state: LabState;
  storageUid: string;
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
      clearClientSignature?: boolean;
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
  updateClient: (clientId: string, partial: Partial<Omit<Client, 'id'>>) => void;
  deleteClient: (clientId: string) => { ok: boolean; error?: string };
  addClientNote: (clientId: string, note: string) => void;
  moveOrderInQueue: (orderId: number, direction: -1 | 1) => void;
  addPart: (part: Omit<PartItem, 'id' | 'status'>) => void;
  updatePart: (partId: string, partial: Partial<Omit<PartItem, 'id' | 'status'>>) => void;
  deletePart: (partId: string) => void;
  adjustPartStock: (partId: string, delta: number) => void;
  batchReadjustParts: (input: {
    mode: 'percent' | 'curve';
    percent?: number;
    field?: 'sellPrice' | 'costPrice';
    applyRounding?: boolean;
  }) => void;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'initials' | 'rating' | 'rmaRate' | 'rmaStatus'>) => Supplier;
  updateSupplier: (supplierId: string, partial: Partial<Omit<Supplier, 'id'>>) => void;
  deleteSupplier: (supplierId: string) => void;
  createPurchaseOrder: (input: {
    forn: string;
    frete: number;
    itens: PurchaseItem[];
    payableDueDate?: string;
  }) => PurchaseRecord;
  receivePurchaseOrder: (purchaseId: string) => { ok: boolean; error?: string };
  addPayableBill: (
    input: Omit<PayableBill, 'id' | 'status'> & { status?: PayableBill['status'] }
  ) => PayableBill;
  updatePayableBill: (billId: string, partial: Partial<Omit<PayableBill, 'id'>>) => void;
  markPayableBillPaid: (
    billId: string,
    options?: { channel?: CashTransaction['channel']; isoDate?: string }
  ) => { ok: boolean; error?: string };
  deletePayableBill: (billId: string) => void;
  createPosSale: (input: {
    cli?: string;
    cliNome?: string;
    vend?: string;
    forma: string;
    desc: number;
    itens: SaleItem[];
  }) => SaleRecord;
  reversePosSale: (saleId: string) => { ok: boolean; error?: string };
  addTransaction: (tx: Omit<CashTransaction, 'id' | 'dateLabel'>) => void;
  recordWarrantyExpense: (input: {
    isoDate: string;
    orderId?: number;
    description: string;
    amount: number;
  }) => { ok: boolean; error?: string };
  deleteTransaction: (txId: string) => { ok: boolean; error?: string };
  addWarrantyCase: (
    input: Omit<WarrantyCase, 'id' | 'code' | 'openedAt'>
  ) => WarrantyCase;
  updateWarrantyStatus: (warrantyId: string, status: 'Em Análise' | 'RMA Fornecedor' | 'Concluída') => void;
  addServiceCatalog: (input: Omit<ServiceCatalogItem, 'id'>) => ServiceCatalogItem;
  updateServiceCatalog: (id: string, partial: Partial<Omit<ServiceCatalogItem, 'id'>>) => void;
  deleteServiceCatalog: (id: string) => void;
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
  savePowerMemory: (input: { nome: string; v: number; i: number }) => PowerSupplyMemory | null;
  deletePowerMemory: (id: string) => void;
  upsertOrderPowerTest: (targetOrderId: number | null, testEntry: PowerSupplyTestEntry) => void;
  addOrderDiagnosticReport: (orderId: number, report: Omit<OrderDiagnosticReport, 'id'>) => void;
  deleteOrderDiagnosticReport: (orderId: number, reportId: string) => void;
  addCustomDefect: (title: string, steps: string[]) => CustomDefectItem | null;
  deleteCustomDefect: (id: string) => void;
  setTempCalibration: (id: string, value: string) => void;
  setPmicMinVoltage: (value: number) => void;
  setPowerSupplyTheme: (theme: '' | 'br') => void;
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
        const fixedRes = applyDueFixedExpenses(hydrateLabState(res.state));
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setState({
          ...fixedRes.state,
          labProfile: { ...fixedRes.state.labProfile, lastSync: `Nuvem às ${timeStr}` },
        });
      } else {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setState((prev) => {
          const fixedRes = applyDueFixedExpenses(prev);
          return {
            ...fixedRes.state,
            labProfile: { ...fixedRes.state.labProfile, lastSync: `Nuvem às ${timeStr}` },
          };
        });
      }
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

  // Garante lançamento automático idempotente de despesas fixas vencidas ao iniciar sessão / virar o mês
  useEffect(() => {
    if (!currentUser) return;
    setState((prev) => {
      const res = applyDueFixedExpenses(prev);
      return res.changed ? res.state : prev;
    });
  }, [currentUser?.id]);

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

  const buildOrderStockSnapshot = (
    o: Pick<ServiceOrder, 'extraItems' | 'clientSuppliedPart' | 'partId' | 'isDiagOnly'>,
    parts: PartItem[] = []
  ) => {
    const items = (o.extraItems || [])
      .filter((x) => Boolean(x.p))
      .map((x) => ({ p: String(x.p), q: roundStockQty(Math.max(0, Number(x.q) || 0)) }))
      .filter((x) => x.q > 0);

    let pp = o.clientSuppliedPart ? '' : o.partId || '';
    if (pp && !o.isDiagOnly) {
      const ppPart = parts.find((p) => p.id === pp);
      const frac = Number(ppPart?.fractionalConsumptionPerOs) || 0;
      if (frac > 0) {
        items.push({ p: pp, q: roundStockQty(frac) });
        pp = '';
      }
    }

    if (!o.isDiagOnly && parts.length > 0) {
      const explicitIds = new Set(items.map((x) => x.p));
      if (pp) explicitIds.add(pp);
      parts.forEach((part) => {
        const frac = roundStockQty(Number(part.fractionalConsumptionPerOs) || 0);
        if (!explicitIds.has(part.id) && frac > 0 && (Number(part.stock) || 0) > 0) {
          items.push({ p: part.id, q: frac });
          explicitIds.add(part.id);
        }
      });
    }

    return { items, pp };
  };

  const applyStockSnapshotToParts = (
    parts: PartItem[],
    snap: { items: { p: string; q: number }[]; pp?: string },
    sign: 1 | -1
  ): PartItem[] => {
    const deltas: Record<string, number> = {};
    (snap.items || []).forEach((it) => {
      if (it.p && it.q > 0) deltas[it.p] = roundStockQty((deltas[it.p] || 0) + sign * it.q);
    });
    if (snap.pp) {
      deltas[snap.pp] = roundStockQty((deltas[snap.pp] || 0) + sign * 1);
    }
    if (Object.keys(deltas).length === 0) return parts;
    return parts.map((p) => {
      const delta = deltas[p.id];
      if (!delta) return p;
      const nextStock = roundStockQty(Math.max(0, (Number(p.stock) || 0) + delta));
      return {
        ...p,
        stock: nextStock,
        status: computePartStatus(nextStock, p.minStock),
        updatedAt: Date.now(),
      };
    });
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
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        orders: [newOrder, ...prev.orders],
        counters: {
          nextOrderNumber: newId,
          nextSaleNumber: prev.counters?.nextSaleNumber || 0,
          nextPurchaseNumber: prev.counters?.nextPurchaseNumber || 0,
        },
      })
    );
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
      clearClientSignature?: boolean;
    };
    volatileSecret?: VolatileDeviceSecret;
  }): ServiceOrder => {
    const prevSnapshot = stateRef.current;
    const activeUid = authRef.current.uid || '';
    const o0 = id ? prevSnapshot.orders.find((x) => x.id === id) : undefined;
    const maxId = prevSnapshot.orders.reduce((max, o) => Math.max(max, o.id), 0);
    const targetId = o0 ? o0.id : Math.max(maxId, prevSnapshot.counters?.nextOrderNumber || 0) + 1;
    const code = o0 ? o0.code : `#${targetId}`;
    const today = todayIsoLocal();
    const timeStr = nowClockStr();
    const nowTs = Date.now();

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
    const effectiveHourlyRate =
      typeof data.snapHourlyRate === 'number' && Number.isFinite(data.snapHourlyRate) && data.snapHourlyRate >= 0
        ? Math.round(data.snapHourlyRate * 100) / 100
        : eff.hourlyRate;
    const sameCostInputs =
      o0 &&
      o0.snapDirectCost !== undefined &&
      Boolean(o0.clientSuppliedPart) === pcli &&
      (o0.partCost || 0) === partCost &&
      (o0.partFreight || 0) === partFreight &&
      (o0.consumables || 0) === consumables &&
      (o0.estimatedHours || 0) === estimatedHours &&
      (o0.snapHourlyRate ?? eff.hourlyRate) === effectiveHourlyRate;

    const snapDirectCost = sameCostInputs
      ? o0!.snapDirectCost!
      : Math.round(
          (partCost + partFreight + consumables + estimatedHours * (effectiveHourlyRate + eff.indirectHourlyRate)) *
            100
        ) / 100;
    const snapTaxRate = sameCostInputs ? o0!.snapTaxRate! : eff.totalRetentionPct / 100;
    const snapHourlyRate = sameCostInputs ? o0!.snapHourlyRate! : effectiveHourlyRate;

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
          q: roundStockQty(Math.max(0.001, Number(x.q) || 1)),
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

    // Fase 4: Desacoplamento de mídias (IndexedDB + media__<id>, zero base64 dentro da OS)
    const syncMeta = loadSyncMetadata(activeUid);
    let metaDirtyChanged = false;
    const nextEvidenceMediaIds: Partial<Record<'front' | 'back' | 'rails' | 'dock', string>> = {
      ...(o0?.evidenceMediaIds || {}),
      ...(data.evidenceMediaIds || {}),
    };
    if (data.evidencePhotos && typeof data.evidencePhotos === 'object') {
      (['front', 'back', 'rails', 'dock'] as const).forEach((slot) => {
        if (!(slot in data.evidencePhotos!)) return;
        const val = data.evidencePhotos![slot];
        if (typeof val === 'string' && val.trim().startsWith('data:')) {
          const mediaId = nextEvidenceMediaIds[slot] || buildDeterministicMediaId(targetId, slot);
          nextEvidenceMediaIds[slot] = mediaId;
          const mime = val.match(/^data:([^;]+);/)?.[1] || 'image/webp';
          void putMediaRecord(activeUid, {
            id: mediaId,
            orderId: targetId,
            slot,
            dataUrl: val,
            mime,
            updatedAt: nowTs,
          });
          syncMeta.dirty[`media/${mediaId}`] = 1;
          metaDirtyChanged = true;
        } else if (!val && nextEvidenceMediaIds[slot]) {
          const removedId = nextEvidenceMediaIds[slot]!;
          delete nextEvidenceMediaIds[slot];
          void markMediaRecordDeleted(activeUid, removedId, targetId, slot, nowTs);
          syncMeta.dirty[`media/${removedId}`] = 1;
          metaDirtyChanged = true;
        }
      });
    }
    const cleanEvidenceIdsObj = Object.keys(nextEvidenceMediaIds).length > 0 ? nextEvidenceMediaIds : undefined;

    const nextAcceptanceType =
      data.clientAcceptanceType !== undefined
        ? data.clientAcceptanceType
        : o0?.clientAcceptanceType ||
          (o0?.clientSignatureMediaId || o0?.hasClientSignature || o0?.clientSignatureDataUrl || o0?.signatureDataUrl
            ? 'screen_signature'
            : 'printed');

    const incomingSigDataUrl =
      typeof data.clientSignatureDataUrl === 'string' && data.clientSignatureDataUrl.trim().startsWith('data:')
        ? data.clientSignatureDataUrl
        : typeof data.signatureDataUrl === 'string' && data.signatureDataUrl.trim().startsWith('data:')
        ? data.signatureDataUrl
        : undefined;

    let nextClientSignatureMediaId =
      nextAcceptanceType === 'screen_signature'
        ? data.clientSignatureMediaId ?? o0?.clientSignatureMediaId
        : undefined;
    let nextHasClientSignature =
      nextAcceptanceType === 'screen_signature'
        ? Boolean(data.hasClientSignature ?? o0?.hasClientSignature ?? nextClientSignatureMediaId)
        : false;

    if (nextAcceptanceType === 'screen_signature' && incomingSigDataUrl && !data.clearClientSignature) {
      const sigMediaId = nextClientSignatureMediaId || buildDeterministicMediaId(targetId, 'clientSig');
      nextClientSignatureMediaId = sigMediaId;
      nextHasClientSignature = true;
      const mime = incomingSigDataUrl.match(/^data:([^;]+);/)?.[1] || 'image/png';
      void putMediaRecord(activeUid, {
        id: sigMediaId,
        orderId: targetId,
        slot: 'clientSig',
        dataUrl: incomingSigDataUrl,
        mime,
        updatedAt: nowTs,
      });
      syncMeta.dirty[`media/${sigMediaId}`] = 1;
      metaDirtyChanged = true;
    } else if (
      (nextAcceptanceType !== 'screen_signature' || data.clearClientSignature) &&
      (o0?.clientSignatureMediaId || nextClientSignatureMediaId)
    ) {
      const removedSigId = o0?.clientSignatureMediaId || nextClientSignatureMediaId!;
      nextClientSignatureMediaId = undefined;
      nextHasClientSignature = false;
      void markMediaRecordDeleted(activeUid, removedSigId, targetId, 'clientSig', nowTs);
      syncMeta.dirty[`media/${removedSigId}`] = 1;
      metaDirtyChanged = true;
    }

    if (metaDirtyChanged) {
      saveSyncMetadata(activeUid, syncMeta);
      setPendingCount(Object.keys(syncMeta.dirty).length);
    }

    const nextChannel =
      nextAcceptanceType === 'digital_channel'
        ? data.clientAcceptanceChannel !== undefined
          ? data.clientAcceptanceChannel
          : o0?.clientAcceptanceChannel || 'WhatsApp'
        : undefined;
    const nextAt =
      nextAcceptanceType === 'digital_channel' || nextAcceptanceType === 'screen_signature'
        ? data.clientAcceptanceAt !== undefined
          ? data.clientAcceptanceAt
          : o0?.clientAcceptanceAt
        : undefined;

    const cleanDataInput = { ...(data as Record<string, unknown>) };
    delete cleanDataInput.evidencePhotos;
    delete cleanDataInput.clientSignatureDataUrl;
    delete cleanDataInput.signatureDataUrl;
    delete cleanDataInput.clearClientSignature;

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
      ...(cleanDataInput as Partial<ServiceOrder>),
      id: targetId,
      code,
      clientId: data.clientId,
      clientName: data.clientName,
      device: data.device,
      issue: data.issue,
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
      evidenceMediaIds: cleanEvidenceIdsObj,
      clientAcceptanceType: nextAcceptanceType,
      clientAcceptanceChannel: nextChannel,
      clientAcceptanceAt: nextAt,
      clientSignatureMediaId: nextClientSignatureMediaId,
      hasClientSignature: nextHasClientSignature,
      evidenceCount: cleanEvidenceIdsObj
        ? Object.values(cleanEvidenceIdsObj).filter(Boolean).length
        : data.evidenceCount ?? o0?.evidenceCount ?? 0,
      updatedAt: nowTs,
    };
    delete savedOrder.evidencePhotos;
    delete savedOrder.clientSignatureDataUrl;
    delete savedOrder.signatureDataUrl;

    // Volatile secret LGPD handling
    if (nextStatus === 'Entregue' || nextStatus === 'Cancelado') {
      clearVolatileSecret(targetId);
    } else if (volatileSecret) {
      setVolatileSecret(targetId, volatileSecret);
    }

    setState((prev) => {
      let nextParts = prev.parts;
      const oldSnap = o0?.stockDeducted
        ? o0.stockSnapshot || buildOrderStockSnapshot(o0, prev.parts)
        : null;
      const newSnap = buildOrderStockSnapshot(savedOrder, prev.parts);

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
        };
      }

      return reconcileDerivedFromCfg(nextState);
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
        ? target.stockSnapshot || buildOrderStockSnapshot(target, prev.parts)
        : null;
      const newSnap = buildOrderStockSnapshot(target, prev.parts);

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

      return reconcileDerivedFromCfg({
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
      });
    });
    scheduleCloudSync(3500);
  };

  const markOrderPartArrived = (orderId: number) => {
    setState((prev) =>
      reconcileDerivedFromCfg({
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
      })
    );
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
      return reconcileDerivedFromCfg(nextState);
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
        const snap = target.stockSnapshot || buildOrderStockSnapshot(target, prev.parts);
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
      return reconcileDerivedFromCfg(nextState);
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
    const activeUid = authRef.current.uid || '';
    const targetToRemove = stateRef.current.orders.find((o) => o.id === orderId);
    if (targetToRemove) {
      const mediaEntries: Array<{ id: string; slot: MediaSlot }> = [
        ...(['front', 'back', 'rails', 'dock'] as const)
          .filter((slot) => Boolean(targetToRemove.evidenceMediaIds?.[slot]))
          .map((slot) => ({ id: targetToRemove.evidenceMediaIds![slot]!, slot })),
        ...(targetToRemove.clientSignatureMediaId
          ? [{ id: targetToRemove.clientSignatureMediaId, slot: 'clientSig' as MediaSlot }]
          : []),
      ];
      if (mediaEntries.length > 0) {
        const syncMeta = loadSyncMetadata(activeUid);
        const ts = Date.now();
        mediaEntries.forEach(({ id: mid, slot }) => {
          void markMediaRecordDeleted(activeUid, mid, orderId, slot, ts);
          syncMeta.dirty[`media/${mid}`] = 1;
        });
        saveSyncMetadata(activeUid, syncMeta);
        setPendingCount(Object.keys(syncMeta.dirty).length);
      }
    }

    setState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target) return prev;
      let nextParts = prev.parts;
      if (target.stockDeducted) {
        const snap = target.stockSnapshot || buildOrderStockSnapshot(target, prev.parts);
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

      return reconcileDerivedFromCfg({
        ...prev,
        parts: nextParts,
        orders: prev.orders.filter((o) => o.id !== orderId),
        transactions: prev.transactions.filter((tx) => !linkedIds.has(tx.id)),
      });
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

  const savePowerMemory = (input: {
    nome: string;
    v: number;
    i: number;
  }): PowerSupplyMemory | null => {
    const cleanName = input.nome.trim().slice(0, 30);
    const v = Math.round((Number(input.v) || 0) * 100) / 100;
    const i = Math.round((Number(input.i) || 0) * 1000) / 1000;
    if (!cleanName || !(v >= 0.5 && v <= 48) || !(i >= 0 && i <= 8.2)) return null;
    const mem: PowerSupplyMemory = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      nome: cleanName,
      v,
      i,
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      fonteMem: [...(prev.fonteMem || []), mem],
    }));
    scheduleCloudSync(2500);
    return mem;
  };

  const deletePowerMemory = (id: string) => {
    setState((prev) => ({
      ...prev,
      fonteMem: (prev.fonteMem || []).filter((m) => m.id !== id),
    }));
    scheduleCloudSync(2500);
  };

  const upsertOrderPowerTest = (
    targetOrderId: number | null,
    testEntry: PowerSupplyTestEntry
  ) => {
    setState((prev) => {
      const now = Date.now();
      const nextOrders = prev.orders.map((o) => {
        const list = Array.isArray(o.testesFonte) ? o.testesFonte : [];
        if (targetOrderId !== null && o.id === targetOrderId) {
          const idx = list.findIndex((t) => t.sid === testEntry.sid);
          const nextList =
            idx >= 0
              ? list.map((t, i) => (i === idx ? testEntry : t))
              : [...list, testEntry];
          return { ...o, testesFonte: nextList, updatedAt: now };
        }
        const filtered = list.filter((t) => t.sid !== testEntry.sid);
        if (filtered.length !== list.length) {
          const updated: ServiceOrder = { ...o, updatedAt: now };
          if (filtered.length > 0) updated.testesFonte = filtered;
          else delete updated.testesFonte;
          return updated;
        }
        return o;
      });
      return { ...prev, orders: nextOrders };
    });
    scheduleCloudSync(2500);
  };

  const addOrderDiagnosticReport = (
    orderId: number,
    report: Omit<OrderDiagnosticReport, 'id'>
  ) => {
    const newReport: OrderDiagnosticReport = {
      ...report,
      id: `laudo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              laudos: [...(o.laudos || []), newReport],
              updatedAt: Date.now(),
            }
          : o
      ),
    }));
    scheduleCloudSync(2500);
  };

  const deleteOrderDiagnosticReport = (orderId: number, reportId: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        const filtered = (o.laudos || []).filter((l) => l.id !== reportId);
        return {
          ...o,
          laudos: filtered,
          updatedAt: Date.now(),
        };
      }),
    }));
    scheduleCloudSync(2500);
  };

  const addCustomDefect = (title: string, steps: string[]): CustomDefectItem | null => {
    const cleanTitle = title.trim();
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!cleanTitle || cleanSteps.length === 0) return null;
    const item: CustomDefectItem = {
      id: `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      t: cleanTitle,
      p: cleanSteps,
    };
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        defeitosExtra: [...(prev.cfg.defeitosExtra || []), item],
        _ts: { ...(prev.cfg._ts || {}), defeitosExtra: Date.now() },
        updatedAt: Date.now(),
      },
    }));
    scheduleCloudSync(2500);
    return item;
  };

  const deleteCustomDefect = (id: string) => {
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        defeitosExtra: (prev.cfg.defeitosExtra || []).filter((d) => d.id !== id),
        _ts: { ...(prev.cfg._ts || {}), defeitosExtra: Date.now() },
        updatedAt: Date.now(),
      },
    }));
    scheduleCloudSync(2500);
  };

  const setTempCalibration = (id: string, value: string) => {
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        tempCal: { ...(prev.cfg.tempCal || {}), [id]: value.trim() },
        _ts: { ...(prev.cfg._ts || {}), tempCal: Date.now() },
        updatedAt: Date.now(),
      },
    }));
    scheduleCloudSync(3000);
  };

  const setPmicMinVoltage = (value: number) => {
    const safe = Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 3.4;
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        pmicMin: safe,
        _ts: { ...(prev.cfg._ts || {}), pmicMin: Date.now() },
        updatedAt: Date.now(),
      },
    }));
    scheduleCloudSync(3000);
  };

  const setPowerSupplyTheme = (theme: '' | 'br') => {
    setState((prev) => ({
      ...prev,
      cfg: {
        ...prev.cfg,
        fonteTema: theme,
        _ts: { ...(prev.cfg._ts || {}), fonteTema: Date.now() },
        updatedAt: Date.now(),
      },
    }));
    scheduleCloudSync(3000);
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

  const updateClient = (clientId: string, partial: Partial<Omit<Client, 'id'>>) => {
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId ? { ...c, ...partial, updatedAt: Date.now() } : c
        ),
      })
    );
    scheduleCloudSync(3500);
  };

  const deleteClient = (clientId: string): { ok: boolean; error?: string } => {
    const target = stateRef.current.clients.find((c) => c.id === clientId);
    if (!target) return { ok: false, error: 'Cliente não encontrado.' };

    const targetNameNorm = normStr(target.name);
    const activeOrders = stateRef.current.orders.filter(
      (o) =>
        o.status !== 'Entregue' &&
        o.status !== 'Cancelado' &&
        (o.clientId === target.id ||
          (targetNameNorm.length > 0 && normStr(o.clientName) === targetNameNorm))
    );
    if (activeOrders.length > 0) {
      return {
        ok: false,
        error: `Não é possível excluir: ${target.name} possui ${activeOrders.length} OS ativa(s) (${activeOrders
          .map((o) => o.code)
          .slice(0, 3)
          .join(', ')}). Conclua ou cancele antes de excluir.`,
      };
    }

    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        clients: prev.clients.filter((c) => c.id !== clientId),
      })
    );
    scheduleCloudSync(3000);
    return { ok: true };
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

  const moveOrderInQueue = (orderId: number, direction: -1 | 1) => {
    setState((prev) => {
      const L = getFilaOrders(prev.orders);
      const i = L.findIndex((o) => o.id === orderId);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= L.length) return prev;
      const reordered = [...L];
      [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
      const ordMap = new Map<number, number>();
      reordered.forEach((o, k) => ordMap.set(o.id, k + 1));
      const now = Date.now();
      return reconcileDerivedFromCfg({
        ...prev,
        orders: prev.orders.map((o) =>
          ordMap.has(o.id) ? { ...o, ord: ordMap.get(o.id), updatedAt: now } : o
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
    const cleanStock = roundStockQty(Math.max(0, Number(partInput.stock) || 0));
    const cleanMin = roundStockQty(Math.max(0, Number(partInput.minStock) || 0));
    const cleanCost = roundCurrency3(Math.max(0, Number(partInput.costPrice) || 0));
    const status = computePartStatus(cleanStock, cleanMin);
    const newPart: PartItem = {
      ...partInput,
      stock: cleanStock,
      minStock: cleanMin,
      costPrice: cleanCost,
      unit: partInput.unit?.trim() || undefined,
      expiryDate: partInput.expiryDate?.trim() || undefined,
      fractionalConsumptionPerOs:
        partInput.fractionalConsumptionPerOs !== undefined && Number(partInput.fractionalConsumptionPerOs) > 0
          ? roundStockQty(Number(partInput.fractionalConsumptionPerOs))
          : undefined,
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

  const updatePart = (partId: string, partial: Partial<Omit<PartItem, 'id' | 'status'>>) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId) return p;
        const nextStock =
          partial.stock !== undefined ? roundStockQty(Math.max(0, Number(partial.stock) || 0)) : p.stock;
        const nextMin =
          partial.minStock !== undefined ? roundStockQty(Math.max(0, Number(partial.minStock) || 0)) : p.minStock;
        const nextCost =
          partial.costPrice !== undefined
            ? roundCurrency3(Math.max(0, Number(partial.costPrice) || 0))
            : p.costPrice;
        const nextUnit = partial.unit !== undefined ? partial.unit.trim() || undefined : p.unit;
        const nextExpiry = partial.expiryDate !== undefined ? partial.expiryDate.trim() || undefined : p.expiryDate;
        const nextFrac =
          partial.fractionalConsumptionPerOs !== undefined
            ? Number(partial.fractionalConsumptionPerOs) > 0
              ? roundStockQty(Number(partial.fractionalConsumptionPerOs))
              : undefined
            : p.fractionalConsumptionPerOs;
        return {
          ...p,
          ...partial,
          stock: nextStock,
          minStock: nextMin,
          costPrice: nextCost,
          unit: nextUnit,
          expiryDate: nextExpiry,
          fractionalConsumptionPerOs: nextFrac,
          status: computePartStatus(nextStock, nextMin),
          updatedAt: Date.now(),
        };
      }),
    }));
    scheduleCloudSync(3500);
  };

  const deletePart = (partId: string) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.filter((p) => p.id !== partId),
    }));
    scheduleCloudSync(3500);
  };

  const adjustPartStock = (partId: string, delta: number) => {
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        if (p.id !== partId) return p;
        const nextStock = roundStockQty(Math.max(0, (Number(p.stock) || 0) + delta));
        return {
          ...p,
          stock: nextStock,
          status: computePartStatus(nextStock, p.minStock),
          updatedAt: Date.now(),
        };
      }),
    }));
    scheduleCloudSync(3500);
  };

  const batchReadjustParts = (input: {
    mode: 'percent' | 'curve';
    percent?: number;
    field?: 'sellPrice' | 'costPrice';
    applyRounding?: boolean;
  }) => {
    if (input.mode === 'curve') {
      const useRounding = input.applyRounding !== false;
      setState((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => {
          const cost = Math.max(0, Number(p.costPrice) || 0);
          if (cost <= 0) return p;
          const nextSell = useRounding
            ? precoVendaPeca(cost, prev.cfg.margem, prev.cfg.arred)
            : Math.round(cost * (1 + margemPctPeca(cost, prev.cfg.margem) / 100) * 100) / 100;
          return {
            ...p,
            sellPrice: nextSell,
            updatedAt: Date.now(),
          };
        }),
      }));
      scheduleCloudSync(3500);
      return;
    }

    const field = input.field || 'sellPrice';
    const applyRounding = input.applyRounding ?? field === 'sellPrice';
    const pct = Number(input.percent) || 0;
    if (pct === 0) return;
    const factor = 1 + pct / 100;
    setState((prev) => ({
      ...prev,
      parts: prev.parts.map((p) => {
        const curVal = Number(p[field]) || 0;
        const raw = Math.max(0, Math.round(curVal * factor * 100) / 100);
        const nextVal =
          field === 'sellPrice' && applyRounding
            ? arredondarPreco(raw, prev.cfg.arred)
            : raw;
        return {
          ...p,
          [field]: nextVal,
          updatedAt: Date.now(),
        };
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

  const updateSupplier = (supplierId: string, partial: Partial<Omit<Supplier, 'id'>>) => {
    setState((prev) => ({
      ...prev,
      suppliers: prev.suppliers.map((s) => {
        if (s.id !== supplierId) return s;
        const nextName = partial.name !== undefined ? partial.name.trim() : s.name;
        const words = nextName.split(/\s+/).filter(Boolean);
        const initials =
          words.length >= 2
            ? `${words[0][0]}${words[1][0]}`.toUpperCase()
            : nextName.slice(0, 2).toUpperCase() || s.initials;
        return {
          ...s,
          ...partial,
          name: nextName,
          initials,
          updatedAt: Date.now(),
        };
      }),
    }));
    scheduleCloudSync(3500);
  };

  const deleteSupplier = (supplierId: string) => {
    setState((prev) => ({
      ...prev,
      suppliers: prev.suppliers.filter((s) => s.id !== supplierId),
    }));
    scheduleCloudSync(3000);
  };

  const createPurchaseOrder = (input: {
    forn: string;
    frete: number;
    itens: PurchaseItem[];
    payableDueDate?: string;
  }): PurchaseRecord => {
    const maxN = stateRef.current.compras.reduce((m, c) => Math.max(m, Number(c.n) || 0), 0);
    const nextN = Math.max(maxN, stateRef.current.counters?.nextPurchaseNumber || 0) + 1;
    const cleanItems: PurchaseItem[] = (input.itens || [])
      .filter((x) => Boolean(x.d && x.d.trim()))
      .map((x) => ({
        p: x.p || undefined,
        d: x.d.trim(),
        q: roundStockQty(Math.max(0.001, Number(x.q) || 1)),
        v: Math.max(0, Number(x.v) || 0),
      }));

    const nowTs = Date.now();
    const purchase: PurchaseRecord = {
      id: `cp-${nowTs.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      n: nextN,
      data: todayIsoLocal(),
      forn: input.forn,
      st: 'A caminho',
      frete: Math.max(0, Number(input.frete) || 0),
      desc: 0,
      itens: cleanItems,
      updatedAt: nowTs,
    };

    const totalCompra = calcPurchaseTotalAmount(purchase);
    const dueDate = (input.payableDueDate || '').trim();
    const shouldSchedulePayable = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && totalCompra > 0;

    setState((prev) => {
      const supName =
        prev.suppliers.find((s) => s.id === purchase.forn || s.name === purchase.forn)?.name ||
        purchase.forn ||
        'Fornecedor';
      const createdBill: PayableBill | null = shouldSchedulePayable
        ? {
            id: `cpag-${nowTs.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            descricao: `Compra nº ${purchase.n}`,
            categoria: 'Peças',
            fornecedor: supName,
            valor: totalCompra,
            vencimento: dueDate,
            status: 'Pendente',
            purchaseId: purchase.id,
            updatedAt: nowTs,
          }
        : null;

      return {
        ...prev,
        compras: [purchase, ...prev.compras],
        contasPagar: createdBill ? [createdBill, ...(prev.contasPagar || [])] : prev.contasPagar,
        counters: {
          nextOrderNumber: prev.counters?.nextOrderNumber || 0,
          nextSaleNumber: prev.counters?.nextSaleNumber || 0,
          nextPurchaseNumber: nextN,
        },
      };
    });
    scheduleCloudSync(3000);
    return purchase;
  };

  const receivePurchaseOrder = (purchaseId: string): { ok: boolean; error?: string } => {
    const target = stateRef.current.compras.find((c) => c.id === purchaseId);
    if (!target) return { ok: false, error: 'Pedido de compra não encontrado.' };
    if (target.st === 'Recebido') return { ok: false, error: 'Este pedido já foi recebido.' };

    const today = todayIsoLocal();
    const timeStr = nowClockStr();

    setState((prev) => {
      const order = prev.compras.find((c) => c.id === purchaseId);
      if (!order || order.st === 'Recebido') return prev;

      const base = order.itens.reduce((a, x) => a + (Number(x.q) || 0) * (Number(x.v) || 0), 0);
      const qt = order.itens.reduce((a, x) => a + (Number(x.q) || 0), 0);
      const fr = Math.max(0, Number(order.frete) || 0);
      const totalCompra = calcPurchaseTotalAmount(order);

      let nextParts = [...prev.parts];
      order.itens.forEach((x) => {
        if (!x.p) return;
        const idx = nextParts.findIndex((p) => p.id === x.p);
        if (idx < 0) return;
        const p = nextParts[idx];
        const q = Math.max(0, Number(x.q) || 0);
        const v = Math.max(0, Number(x.v) || 0);
        const rt =
          fr > 0 && q > 0
            ? (base > 0 ? (fr * (q * v)) / base : (fr * q) / Math.max(1, qt)) / q
            : 0;
        const cu = v + rt;
        const q0 = p.costPrice > 0 ? Math.max(0, Number(p.stock) || 0) : 0;
        const autoCurveBefore = precoVendaPeca(p.costPrice, prev.cfg.margem, prev.cfg.arred);
        const auto = !(p.sellPrice > 0) || Math.abs(p.sellPrice - autoCurveBefore) < 0.005;

        const nextStock = roundStockQty((Number(p.stock) || 0) + q);
        let nextCost = Number(p.costPrice) || 0;
        let nextSell = Number(p.sellPrice) || 0;
        if (v > 0) {
          nextCost =
            q0 + q > 0
              ? Math.round(((q0 * nextCost + q * cu) / (q0 + q)) * 100) / 100
              : Math.round(cu * 100) / 100;
          if (auto) {
            nextSell = precoVendaPeca(nextCost, prev.cfg.margem, prev.cfg.arred);
          }
        }

        nextParts[idx] = {
          ...p,
          stock: nextStock,
          costPrice: nextCost,
          sellPrice: nextSell,
          status: computePartStatus(nextStock, p.minStock),
          updatedAt: Date.now(),
        };
      });

      const supName =
        prev.suppliers.find((s) => s.id === order.forn || s.name === order.forn)?.name ||
        order.forn ||
        'Fornecedor';

      // Evita dupla contagem caso a compra tenha conta a pagar agendada ou já baixada no caixa
      const hasLinkedBillOrTx =
        (prev.contasPagar || []).some((b) => b.purchaseId === order.id) ||
        prev.transactions.some((t) => t.purchaseId === order.id && t.kind === 'compra');

      const tx: CashTransaction | null =
        totalCompra > 0 && !hasLinkedBillOrTx
          ? {
              id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              title: `Compra nº ${order.n}`,
              subtitle: `${supName} · ${order.itens.length} ${order.itens.length === 1 ? 'item' : 'itens'}`,
              tag: 'Peças',
              channel: 'Fornecedores',
              type: 'out',
              amount: totalCompra,
              dateLabel: `Hoje, ${timeStr}`,
              isoDate: today,
              purchaseId: order.id,
              kind: 'compra',
              reconciled: true,
              updatedAt: Date.now(),
            }
          : null;

      const nextState: LabState = {
        ...prev,
        parts: nextParts,
        compras: prev.compras.map((c) =>
          c.id === purchaseId
            ? { ...c, st: 'Recebido', recebido: today, updatedAt: Date.now() }
            : c
        ),
        transactions: tx ? [tx, ...prev.transactions] : prev.transactions,
      };
      return reconcileDerivedFromCfg(nextState);
    });

    scheduleCloudSync(2500);
    return { ok: true };
  };

  const addPayableBill = (
    input: Omit<PayableBill, 'id' | 'status'> & { status?: PayableBill['status'] }
  ): PayableBill => {
    const nowTs = Date.now();
    const created: PayableBill = {
      ...input,
      id: `cpag-${nowTs.toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      descricao: input.descricao.trim(),
      categoria: input.categoria.trim() || 'Outros',
      fornecedor: input.fornecedor?.trim() || undefined,
      valor: Math.max(0, Math.round((Number(input.valor) || 0) * 100) / 100),
      vencimento: input.vencimento || todayIsoLocal(),
      status: input.status === 'Pago' ? 'Pago' : 'Pendente',
      updatedAt: nowTs,
    };
    setState((prev) => ({
      ...prev,
      contasPagar: [created, ...(prev.contasPagar || [])],
    }));
    scheduleCloudSync(3000);
    return created;
  };

  const updatePayableBill = (billId: string, partial: Partial<Omit<PayableBill, 'id'>>) => {
    setState((prev) => ({
      ...prev,
      contasPagar: (prev.contasPagar || []).map((b) =>
        b.id === billId ? { ...b, ...partial, updatedAt: Date.now() } : b
      ),
    }));
    scheduleCloudSync(3000);
  };

  const markPayableBillPaid = (
    billId: string,
    options?: { channel?: CashTransaction['channel']; isoDate?: string }
  ): { ok: boolean; error?: string } => {
    const target = (stateRef.current.contasPagar || []).find((b) => b.id === billId);
    if (!target) return { ok: false, error: 'Conta a pagar não encontrada.' };
    if (target.status === 'Pago') return { ok: false, error: 'Esta conta já foi paga.' };

    const today = todayIsoLocal();
    const payDate = options?.isoDate || today;
    const timeStr = nowClockStr();

    setState((prev) => {
      const bill = (prev.contasPagar || []).find((b) => b.id === billId);
      if (!bill || bill.status === 'Pago') return prev;

      const alreadyPaidInCash =
        Boolean(bill.txId && prev.transactions.some((t) => t.id === bill.txId)) ||
        Boolean(
          bill.purchaseId &&
            prev.transactions.some((t) => t.purchaseId === bill.purchaseId && t.kind === 'compra')
        ) ||
        prev.transactions.some((t) => t.payableBillId === bill.id);

      const channel: CashTransaction['channel'] =
        options?.channel ||
        (bill.categoria === 'Peças'
          ? 'Fornecedores'
          : bill.categoria === 'Aluguel' || bill.categoria === 'Internet'
          ? 'Fixo'
          : 'PIX');

      const newTx: CashTransaction | null =
        !alreadyPaidInCash && bill.valor > 0
          ? {
              id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              title: bill.descricao,
              subtitle: `${bill.fornecedor ? `${bill.fornecedor} · ` : ''}Baixa Contas a Pagar (${bill.categoria})`,
              tag: bill.categoria || 'Outros',
              channel,
              type: 'out',
              amount: bill.valor,
              dateLabel: payDate === today ? `Hoje, ${timeStr}` : formatDateBR(payDate),
              isoDate: payDate,
              purchaseId: bill.purchaseId,
              payableBillId: bill.id,
              kind: bill.purchaseId ? 'compra' : 'pagar',
              reconciled: true,
              updatedAt: Date.now(),
            }
          : null;

      return reconcileDerivedFromCfg({
        ...prev,
        contasPagar: (prev.contasPagar || []).map((b) =>
          b.id === billId
            ? {
                ...b,
                status: 'Pago',
                dataPagamento: payDate,
                txId: newTx?.id || b.txId,
                updatedAt: Date.now(),
              }
            : b
        ),
        transactions: newTx ? [newTx, ...prev.transactions] : prev.transactions,
      });
    });

    scheduleCloudSync(2500);
    return { ok: true };
  };

  const deletePayableBill = (billId: string) => {
    setState((prev) => ({
      ...prev,
      contasPagar: (prev.contasPagar || []).filter((b) => b.id !== billId),
    }));
    scheduleCloudSync(3000);
  };

  const createPosSale = (input: {
    cli?: string;
    cliNome?: string;
    vend?: string;
    forma: string;
    desc: number;
    itens: SaleItem[];
  }): SaleRecord => {
    const maxN = stateRef.current.vendas.reduce((m, s) => Math.max(m, Number(s.n) || 0), 0);
    const nextN = Math.max(maxN, stateRef.current.counters?.nextSaleNumber || 0) + 1;
    const today = todayIsoLocal();
    const timeStr = nowClockStr();

    const cleanItems: SaleItem[] = (input.itens || [])
      .filter((x) => Boolean(x.d && x.d.trim()) && (Number(x.q) || 0) > 0)
      .map((x) => {
        const part = x.p ? stateRef.current.parts.find((p) => p.id === x.p) : undefined;
        return {
          p: x.p || undefined,
          d: x.d.trim(),
          q: roundStockQty(Math.max(0.001, Number(x.q) || 1)),
          v: Math.max(0, Number(x.v) || 0),
          c: x.c !== undefined ? Number(x.c) || 0 : part ? Number(part.costPrice) || 0 : 0,
        };
      });

    const sale: SaleRecord = {
      id: `vd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      n: nextN,
      data: today,
      cli: input.cli || undefined,
      cliNome: input.cliNome?.trim() || undefined,
      vend: input.vend?.trim() || undefined,
      forma: input.forma || 'Pix',
      desc: Math.max(0, Number(input.desc) || 0),
      itens: cleanItems,
      st: '',
      updatedAt: Date.now(),
    };

    const total = calcSaleTotalAmount(sale);
    const isCash = sale.forma.toLowerCase().includes('dinheiro');
    const channel: CashTransaction['channel'] = isCash ? 'Dinheiro' : 'PIX';

    setState((prev) => {
      const qtyByPart: Record<string, number> = {};
      cleanItems.forEach((x) => {
        if (x.p) qtyByPart[x.p] = roundStockQty((qtyByPart[x.p] || 0) + x.q);
      });
      const nextParts = prev.parts.map((p) => {
        const dec = qtyByPart[p.id];
        if (!dec) return p;
        const nextStock = roundStockQty(Math.max(0, p.stock - dec));
        return {
          ...p,
          stock: nextStock,
          status: computePartStatus(nextStock, p.minStock),
          updatedAt: Date.now(),
        };
      });

      const clientLabel =
        (sale.cli ? prev.clients.find((c) => c.id === sale.cli)?.name : '') ||
        sale.cliNome ||
        'Balcão';
      const sellerTag = sale.vend ? ` · Vend.: ${sale.vend}` : '';
      const tx: CashTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: `Venda nº ${sale.n}`,
        subtitle: `${clientLabel} · ${sale.forma}${sellerTag}`,
        tag: 'PDV-BALCÃO',
        channel,
        type: 'in',
        amount: total,
        dateLabel: `Hoje, ${timeStr}`,
        isoDate: today,
        kind: 'venda',
        reconciled: channel !== 'Dinheiro',
        updatedAt: Date.now(),
      };

      const nextState: LabState = {
        ...prev,
        parts: nextParts,
        vendas: [sale, ...prev.vendas],
        counters: {
          nextOrderNumber: prev.counters?.nextOrderNumber || 0,
          nextSaleNumber: nextN,
          nextPurchaseNumber: prev.counters?.nextPurchaseNumber || 0,
        },
        transactions: total > 0 ? [tx, ...prev.transactions] : prev.transactions,
      };
      return reconcileDerivedFromCfg(nextState);
    });

    scheduleCloudSync(2500);
    return sale;
  };

  const reversePosSale = (saleId: string): { ok: boolean; error?: string } => {
    const target = stateRef.current.vendas.find((v) => v.id === saleId);
    if (!target) return { ok: false, error: 'Venda não encontrada.' };
    if (target.st === 'Estornada') return { ok: false, error: 'Esta venda já foi estornada.' };

    const today = todayIsoLocal();
    const timeStr = nowClockStr();

    setState((prev) => {
      const sale = prev.vendas.find((v) => v.id === saleId);
      if (!sale || sale.st === 'Estornada') return prev;

      const qtyByPart: Record<string, number> = {};
      (sale.itens || []).forEach((x) => {
        if (x.p) qtyByPart[x.p] = roundStockQty((qtyByPart[x.p] || 0) + (Number(x.q) || 0));
      });

      const nextParts = prev.parts.map((p) => {
        const inc = qtyByPart[p.id];
        if (!inc) return p;
        const nextStock = roundStockQty(Math.max(0, p.stock + inc));
        return {
          ...p,
          stock: nextStock,
          status: computePartStatus(nextStock, p.minStock),
          updatedAt: Date.now(),
        };
      });

      const total = calcSaleTotalAmount(sale);
      const clientLabel =
        (sale.cli ? prev.clients.find((c) => c.id === sale.cli)?.name : '') ||
        sale.cliNome ||
        'Balcão';
      const isCash = (sale.forma || '').toLowerCase().includes('dinheiro');
      const tx: CashTransaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: `Estorno da venda nº ${sale.n}`,
        subtitle: `${clientLabel} · Estorno PDV`,
        tag: 'Estorno PDV',
        channel: isCash ? 'Dinheiro' : 'PIX',
        type: 'out',
        amount: total,
        dateLabel: `Hoje, ${timeStr}`,
        isoDate: today,
        kind: 'dev',
        reconciled: true,
        updatedAt: Date.now(),
      };

      const nextState: LabState = {
        ...prev,
        parts: nextParts,
        vendas: prev.vendas.map((v) =>
          v.id === saleId ? { ...v, st: 'Estornada', updatedAt: Date.now() } : v
        ),
        transactions: total > 0 ? [tx, ...prev.transactions] : prev.transactions,
      };

      return reconcileDerivedFromCfg(nextState);
    });

    scheduleCloudSync(2500);
    return { ok: true };
  };

  const addTransaction = (txInput: Omit<CashTransaction, 'id' | 'dateLabel'>) => {
    const today = todayIsoLocal();
    const isoDate = txInput.isoDate || today;
    const timeStr = nowClockStr();
    const isGar = txInput.type === 'out' && normStr(txInput.tag) === 'garantia';
    const newTx: CashTransaction = {
      ...txInput,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      isoDate,
      kind: txInput.kind || (isGar ? 'gar' : undefined),
      dateLabel: isoDate === today ? `Hoje, ${timeStr}` : formatDateBR(isoDate),
      updatedAt: Date.now(),
    };
    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        transactions: [newTx, ...prev.transactions],
      })
    );
    scheduleCloudSync(3500);
  };

  /**
   * `svGar` v17: Registra gasto da Reserva de Garantia (`k='gar'`, categoria `'Garantia'`) sem vincular `orderId`
   * para que eventual exclusão não altere o valor pago da OS de origem.
   */
  const recordWarrantyExpense = (input: {
    isoDate: string;
    orderId?: number;
    description: string;
    amount: number;
  }): { ok: boolean; error?: string } => {
    const desc = input.description.trim();
    const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
    if (!desc) return { ok: false, error: 'Informe a descrição do gasto de garantia.' };
    if (amount <= 0) return { ok: false, error: 'Informe um valor maior que zero.' };

    const today = todayIsoLocal();
    const isoDate = input.isoDate || today;
    const originOrder = input.orderId
      ? stateRef.current.orders.find((o) => o.id === input.orderId)
      : undefined;

    const tx: CashTransaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `Garantia: ${desc}${originOrder ? ` (ref. OS ${originOrder.code})` : ''}`,
      subtitle: originOrder
        ? `${originOrder.clientName} · ${originOrder.device}`
        : 'Cofre da Reserva de Garantia',
      tag: 'Garantia',
      channel: 'PIX',
      type: 'out',
      amount,
      dateLabel: formatDateBR(isoDate),
      isoDate,
      refOrderId: originOrder?.id,
      kind: 'gar',
      reconciled: true,
      updatedAt: Date.now(),
    };

    setState((prev) =>
      reconcileDerivedFromCfg({
        ...prev,
        transactions: [tx, ...prev.transactions],
      })
    );
    scheduleCloudSync(3000);
    return { ok: true };
  };

  /**
   * `dlF` v17: Exclui lançamento financeiro com segurança (somente Administrador).
   * Se ligado a uma OS (`orderId`), estorna/recompõe o `paidAmount` e o status de pagamento da OS.
   */
  const deleteTransaction = (txId: string): { ok: boolean; error?: string } => {
    const active = currentUserRef.current;
    if (!active || active.nivel !== 'Administrador') {
      return { ok: false, error: 'Somente o Administrador pode excluir lançamentos.' };
    }
    const target = stateRef.current.transactions.find((t) => t.id === txId);
    if (!target) return { ok: false, error: 'Lançamento não encontrado.' };

    setState((prev) => {
      const tx = prev.transactions.find((t) => t.id === txId);
      if (!tx) return prev;

      let nextOrders = prev.orders;
      if (tx.orderId) {
        nextOrders = prev.orders.map((o) => {
          if (o.id !== tx.orderId) return o;
          const v = Math.max(0, Number(tx.amount) || 0);
          let nextPaid = Math.max(0, Number(o.paidAmount) || 0);
          let nextSignal = Math.max(0, Number(o.signalPaid) || 0);
          let nextRefunded = Math.max(0, Number(o.refundedAmount) || 0);

          if (tx.kind === 'sinal' || tx.kind === 'rec' || (!tx.kind && tx.type === 'in')) {
            nextPaid = Math.max(0, Math.round((nextPaid - v) * 100) / 100);
            if (tx.kind === 'sinal') {
              nextSignal = Math.max(0, Math.round((nextSignal - v) * 100) / 100);
            }
          } else if (tx.kind === 'estSinal') {
            nextPaid = Math.round((nextPaid + v) * 100) / 100;
            nextSignal = Math.round((nextSignal + v) * 100) / 100;
          } else if (tx.kind === 'dev') {
            nextPaid = Math.round((nextPaid + v) * 100) / 100;
            nextRefunded = Math.max(0, Math.round((nextRefunded - v) * 100) / 100);
          }

          const orderTotal = calcOrderTotalAmount(o);
          const nextPaymentStatus: ServiceOrder['paymentStatus'] =
            nextPaid >= orderTotal && orderTotal > 0
              ? o.paymentStatus === 'Pago Dinheiro'
                ? 'Pago Dinheiro'
                : 'Pago Pix'
              : nextPaid > 0
              ? 'Pendente'
              : 'Orçado';

          return {
            ...o,
            paidAmount: nextPaid,
            signalPaid: nextSignal,
            refundedAmount: nextRefunded,
            paymentStatus: nextPaymentStatus,
            updatedAt: Date.now(),
          };
        });
      }

      const nextContasPagar = tx.payableBillId
        ? (prev.contasPagar || []).map((b) =>
            b.id === tx.payableBillId || b.txId === tx.id
              ? {
                  ...b,
                  status: 'Pendente' as const,
                  dataPagamento: undefined,
                  txId: undefined,
                  updatedAt: Date.now(),
                }
              : b
          )
        : prev.contasPagar;

      return reconcileDerivedFromCfg({
        ...prev,
        orders: nextOrders,
        contasPagar: nextContasPagar,
        transactions: prev.transactions.filter((t) => t.id !== txId),
      });
    });

    scheduleCloudSync(2500);
    return { ok: true };
  };

  const addWarrantyCase = (
    input: Omit<WarrantyCase, 'id' | 'code' | 'openedAt'>
  ): WarrantyCase => {
    const maxNum = stateRef.current.warranties.reduce((max, w) => {
      const m = String(w.code || '').match(/(\d+)/);
      return m ? Math.max(max, Number(m[1]) || 0) : max;
    }, 100);
    const nextCode = `#GAR-${maxNum + 1}`;
    const today = todayIsoLocal();
    const created: WarrantyCase = {
      ...input,
      id: `gar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      code: nextCode,
      openedAt: `${formatDateBR(today)} · ${nowClockStr()}`,
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      warranties: [created, ...prev.warranties],
    }));
    scheduleCloudSync(3000);
    return created;
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

  const addServiceCatalog = (
    input: Omit<ServiceCatalogItem, 'id'>
  ): ServiceCatalogItem => {
    const created: ServiceCatalogItem = {
      id: `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      nome: input.nome.trim(),
      cat: input.cat.trim() || 'Geral',
      tempo: Math.max(0, Number(input.tempo) || 0),
      cons: Math.max(0, Number(input.cons) || 0),
      peca: input.peca.trim(),
      gar: String(input.gar ?? '').trim(),
      mercado: Math.max(0, Number(input.mercado) || 0),
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      servicos: [...prev.servicos, created],
    }));
    scheduleCloudSync(3000);
    return created;
  };

  const updateServiceCatalog = (
    id: string,
    partial: Partial<Omit<ServiceCatalogItem, 'id'>>
  ) => {
    setState((prev) => ({
      ...prev,
      servicos: prev.servicos.map((s) =>
        s.id === id
          ? {
              ...s,
              ...partial,
              nome: partial.nome !== undefined ? partial.nome.trim() : s.nome,
              cat: partial.cat !== undefined ? partial.cat.trim() || 'Geral' : s.cat,
              tempo: partial.tempo !== undefined ? Math.max(0, Number(partial.tempo) || 0) : s.tempo,
              cons: partial.cons !== undefined ? Math.max(0, Number(partial.cons) || 0) : s.cons,
              peca: partial.peca !== undefined ? partial.peca.trim() : s.peca,
              gar: partial.gar !== undefined ? String(partial.gar ?? '').trim() : s.gar,
              mercado:
                partial.mercado !== undefined ? Math.max(0, Number(partial.mercado) || 0) : s.mercado,
              updatedAt: Date.now(),
            }
          : s
      ),
    }));
    scheduleCloudSync(3000);
  };

  const deleteServiceCatalog = (id: string) => {
    setState((prev) => ({
      ...prev,
      servicos: prev.servicos.filter((s) => s.id !== id),
    }));
    scheduleCloudSync(3000);
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
    const created: FixedExpenseItem = {
      id: `fixo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nome,
      valor: Math.max(0, Number(item.valor) || 0),
      cat: item.cat || 'Outros',
      dia: Math.max(1, Math.min(28, parseInt(String(item.dia || 1), 10) || 1)),
      ativo: item.ativo !== false,
      ultimo: '',
      updatedAt: Date.now(),
    };
    setState((prev) =>
      applyDueFixedExpenses(reconcileDerivedFromCfg({ ...prev, fixos: [...prev.fixos, created] })).state
    );
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
      const uid = auth.uid || '';
      saveSyncMetadata(uid, emptySyncMetadata(uid));
      const clean = applyDueFixedExpenses(hydrateLabState(parsed, uid)).state;
      setState(clean);
      setPendingCount(Object.keys(loadSyncMetadata(uid).dirty).length);
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
    void clearMediaForUid(uid);
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
        storageUid: auth.uid || '',
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
        updateClient,
        deleteClient,
        addClientNote,
        moveOrderInQueue,
        addPart,
        updatePart,
        deletePart,
        adjustPartStock,
        batchReadjustParts,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        createPurchaseOrder,
        receivePurchaseOrder,
        addPayableBill,
        updatePayableBill,
        markPayableBillPaid,
        deletePayableBill,
        createPosSale,
        reversePosSale,
        addTransaction,
        recordWarrantyExpense,
        deleteTransaction,
        addWarrantyCase,
        updateWarrantyStatus,
        addServiceCatalog,
        updateServiceCatalog,
        deleteServiceCatalog,
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
        savePowerMemory,
        deletePowerMemory,
        upsertOrderPowerTest,
        addOrderDiagnosticReport,
        deleteOrderDiagnosticReport,
        addCustomDefect,
        deleteCustomDefect,
        setTempCalibration,
        setPmicMinVoltage,
        setPowerSupplyTheme,
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
