import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Lock,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  Smartphone,
  Trash2,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  OrderExtraItem,
  OrderStatus,
  OrderTriage,
  ServiceOrder,
} from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  ACCESSORIES_PRESETS,
  CANONICAL_ORDER_STATUSES,
  ENTRY_CHECKLIST_ITEMS,
  EXIT_CHECKLIST_ITEMS,
  IMEI_TRIAGE_STATUSES,
  addDiasIso,
  arredondarPreco,
  calcDiagTaxa,
  calcEffectivePricingFromConfig,
  calcGanhoDupla,
  calcOrderTotalAmount,
  calcTaxaEntregaByNeighborhood,
  diasAteIso,
  formatDateBR,
  getOrderWarrantyBadge,
  isQuoteExpired,
  planejar,
  previsaoNova,
  resolveOrderWarrantyDays,
  resolveOrderWarrantyUntil,
  todayIsoLocal,
} from '../utils/pricing';

interface OrdersViewProps {
  selectedOrderId: number | null;
  onSelectOrder: (id: number | null) => void;
  onOpenPix: (amount?: number, desc?: string) => void;
  onGoToCheckIn: () => void;
}

type ViewTab = 'Todas' | 'Abertas' | 'Vencidos' | 'Contas a Receber';

interface OsFormState {
  editingId?: number;
  clientId: string;
  customClientName: string;
  technician: string;
  status: OrderStatus;
  brand: string;
  model: string;
  imei: string;
  passcode: string;
  accessories: string[];
  customAccessories: string;
  issue: string;
  notes: string;
  entryChecklist7: Record<string, 's' | 'n' | 't'>;
  triage: OrderTriage;
  exitChecklist: Record<string, boolean>;
  serviceCatalogId: string;
  partId: string;
  partCost: number;
  partFreight: number;
  consumables: number;
  estimatedHours: number;
  hourlyRateOverride?: number;
  servicePrice: number;
  clientSuppliedPart: boolean;
  partPurchased: boolean;
  extraItems: OrderExtraItem[];
  discount: number;
  deliveryFee: number;
  deliveryRealCost: number;
  acceptedChannel: 'WhatsApp' | 'Presencial' | 'Outro' | '';
  signalPaid: number;
  expectedDeliveryDate: string;
  pedForn: string;
  pedRastreio: string;
  pedPrev: string;
  pedChegou: boolean;
  returnWarrantyFromId?: number;
}

const normStr = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const emptyEntryChecklist7 = (): Record<string, 's' | 'n' | 't'> => {
  const rec: Record<string, 's' | 'n' | 't'> = {};
  ENTRY_CHECKLIST_ITEMS.forEach((item) => {
    rec[item.key] = 't';
  });
  return rec;
};

const emptyExitChecklist = (): Record<string, boolean> => {
  const rec: Record<string, boolean> = {};
  EXIT_CHECKLIST_ITEMS.forEach((item) => {
    rec[item.key] = false;
  });
  return rec;
};

export const OrdersView: React.FC<OrdersViewProps> = ({
  selectedOrderId,
  onSelectOrder,
  onOpenPix,
  onGoToCheckIn,
}) => {
  const {
    state,
    currentUser,
    isAtendente,
    canAccessRoute,
    osPrefillDraft,
    setOsPrefillDraft,
    saveServiceOrder,
    updateOrderStatus,
    markOrderPartArrived,
    receiveOrderPayment,
    cancelOrderWithOptions,
    deleteOrderWithAdminPin,
    deleteOrderDiagnosticReport,
    getVolatileSecret,
  } = useLabStore();

  const [confirmDeleteReportId, setConfirmDeleteReportId] = useState<string | null>(null);

  const [viewTab, setViewTab] = useState<ViewTab>('Todas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [techFilter, setTechFilter] = useState<string>('Todos');

  // Modais
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<OsFormState | null>(null);
  const [formError, setFormError] = useState('');
  const [softConfirmWarnings, setSoftConfirmWarnings] = useState<string[]>([]);
  const [pendingSavePayload, setPendingSavePayload] = useState<{
    triage: OrderTriage;
    exitWarningNote?: string;
  } | null>(null);

  // Confirmação suave para troca de status no inspetor (Pronto / Entregue)
  const [pendingInspectorStatus, setPendingInspectorStatus] = useState<{
    order: ServiceOrder;
    targetStatus: OrderStatus;
    warnings: string[];
  } | null>(null);

  // Modais de Recebimento, Cancelamento / Perdido e Exclusão Admin
  const [paymentModalOrder, setPaymentModalOrder] = useState<ServiceOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(state.cfg.formas[0] || 'Pix');

  const [cancelModalOrder, setCancelModalOrder] = useState<ServiceOrder | null>(null);
  const [cancelMarkLost, setCancelMarkLost] = useState(false);
  const [cancelChargeDiag, setCancelChargeDiag] = useState(false);
  const [cancelRefund, setCancelRefund] = useState('0');

  const [deleteModalOrder, setDeleteModalOrder] = useState<ServiceOrder | null>(null);
  const [deleteConfirmCheck, setDeleteConfirmCheck] = useState(false);
  const [deleteAdminPin, setDeleteAdminPin] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const defaultTechName =
    currentUser?.nome ||
    state.tecnicos[0]?.nome ||
    state.labProfile.technicianName ||
    'Técnico Bancada';

  const techOptions = Array.from(
    new Set(
      [
        currentUser?.nome,
        ...state.tecnicos.map((t) => t.nome),
        ...state.orders.map((o) => o.technician),
        state.labProfile.technicianName,
      ].filter((x): x is string => Boolean(x && x.trim()))
    )
  );

  const allFilterStatuses = Array.from(
    new Set([...CANONICAL_ORDER_STATUSES, ...state.orders.map((o) => o.status)])
  );

  const eff = useMemo(
    () => calcEffectivePricingFromConfig(state.cfg, state.fixos),
    [state.cfg, state.fixos]
  );

  const openNewOsModal = (prefill?: Partial<OsFormState>) => {
    const baseClient = prefill?.clientId ?? (state.clients[0]?.id || '');
    const clientObj = state.clients.find((c) => c.id === baseClient);
    const defaultDelivery =
      prefill?.deliveryFee ??
      (clientObj ? calcTaxaEntregaByNeighborhood(clientObj.neighborhood, state.cfg) : 0);

    setForm({
      editingId: undefined,
      clientId: baseClient,
      customClientName: '',
      technician: defaultTechName,
      status: prefill?.status || 'Orçamento',
      brand: prefill?.brand || '',
      model: prefill?.model || '',
      imei: prefill?.imei || '',
      passcode: '',
      accessories: prefill?.accessories || [],
      customAccessories: '',
      issue: prefill?.issue || '',
      notes: prefill?.notes || '',
      entryChecklist7: emptyEntryChecklist7(),
      triage: { imeiSt: '' },
      exitChecklist: emptyExitChecklist(),
      serviceCatalogId: prefill?.serviceCatalogId || '',
      partId: prefill?.partId || '',
      partCost: prefill?.partCost ?? 0,
      partFreight: prefill?.partFreight ?? 0,
      consumables: prefill?.consumables ?? 2,
      estimatedHours: prefill?.estimatedHours ?? 1,
      hourlyRateOverride: prefill?.hourlyRateOverride,
      servicePrice: prefill?.servicePrice ?? 0,
      clientSuppliedPart: false,
      partPurchased: false,
      extraItems: [],
      discount: 0,
      deliveryFee: defaultDelivery,
      deliveryRealCost: 0,
      acceptedChannel: '',
      signalPaid: 0,
      expectedDeliveryDate: '',
      pedForn: '',
      pedRastreio: '',
      pedPrev: '',
      pedChegou: false,
      returnWarrantyFromId: prefill?.returnWarrantyFromId,
    });
    setFormError('');
    setSoftConfirmWarnings([]);
    setPendingSavePayload(null);
    setFormOpen(true);
  };

  const openEditOsModal = (o: ServiceOrder) => {
    const presetSet = new Set<string>(ACCESSORIES_PRESETS as readonly string[]);
    const ac = o.accessories || [];
    const customAc = ac.filter((x) => !presetSet.has(x)).join(', ');
    const modelStr = o.model || (!o.brand ? o.device : o.device.replace(new RegExp(`^${o.brand}\\s*`, 'i'), '').trim());

    const ck7 = emptyEntryChecklist7();
    if (o.entryChecklist7) {
      Object.assign(ck7, o.entryChecklist7);
    }
    const sai = emptyExitChecklist();
    if (o.exitChecklist) {
      Object.assign(sai, o.exitChecklist);
    }

    setForm({
      editingId: o.id,
      clientId: state.clients.some((c) => c.id === o.clientId) ? o.clientId : '',
      customClientName: state.clients.some((c) => c.id === o.clientId) ? '' : o.clientName,
      technician: o.technician || defaultTechName,
      status: o.status,
      brand: o.brand || '',
      model: modelStr || o.device,
      imei: o.imei === 'Não informado' ? '' : o.imei || '',
      passcode: getVolatileSecret(o.id)?.passcode || '',
      accessories: ac.filter((x) => presetSet.has(x)),
      customAccessories: customAc,
      issue: o.issue || '',
      notes: o.notes || o.diagnosis || '',
      entryChecklist7: ck7,
      triage: { ...(o.triage || {}) },
      exitChecklist: sai,
      serviceCatalogId: o.serviceCatalogId || '',
      partId: o.partId || '',
      partCost: Number(o.partCost) || 0,
      partFreight: Number(o.partFreight) || 0,
      consumables: o.consumables !== undefined ? Number(o.consumables) : 2,
      estimatedHours: Number(o.estimatedHours) || 0,
      hourlyRateOverride: o.snapHourlyRate,
      servicePrice: Number(o.servicePrice) || 0,
      clientSuppliedPart: Boolean(o.clientSuppliedPart),
      partPurchased: Boolean(o.partPurchased),
      extraItems: (o.extraItems || []).map((x) => ({ ...x })),
      discount: Number(o.discount) || 0,
      deliveryFee: Number(o.deliveryFee) || 0,
      deliveryRealCost: Number(o.deliveryRealCost) || 0,
      acceptedChannel: o.acceptedChannel || '',
      signalPaid: Number(o.signalPaid) || 0,
      expectedDeliveryDate: o.expectedDeliveryDate || '',
      pedForn: o.pedForn || '',
      pedRastreio: o.pedRastreio || '',
      pedPrev: o.pedPrev || '',
      pedChegou: Boolean(o.pedChegou),
      returnWarrantyFromId: o.returnWarrantyFromId,
    });
    setFormError('');
    setSoftConfirmWarnings([]);
    setPendingSavePayload(null);
    setFormOpen(true);
  };

  // Consome osPrefillDraft vindo do Simulador ou Retorno de Garantia
  useEffect(() => {
    if (!osPrefillDraft) return;
    const draft = osPrefillDraft;
    setOsPrefillDraft(null);
    openNewOsModal({
      clientId: draft.clientId ?? '',
      brand: draft.brand || '',
      model: draft.model || draft.device || '',
      imei: draft.imei || '',
      issue: draft.issue || '',
      notes: draft.notes || '',
      serviceCatalogId: draft.serviceCatalogId || '',
      partId: draft.partId || '',
      partCost: draft.partCost ?? 0,
      partFreight: draft.partFreight ?? 0,
      consumables: draft.consumables ?? 2,
      estimatedHours: draft.estimatedHours ?? 1,
      hourlyRateOverride: draft.hourlyRateOverride,
      servicePrice: draft.servicePrice ?? 0,
      status: draft.status || 'Aprovado',
      returnWarrantyFromId: draft.returnWarrantyFromId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osPrefillDraft]);

  const filtered = state.orders.filter((o) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.code.toLowerCase().includes(q) ||
      o.clientName.toLowerCase().includes(q) ||
      o.device.toLowerCase().includes(q) ||
      o.imei.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'Todos' || o.status === statusFilter;
    const matchesTech = techFilter === 'Todos' || o.technician === techFilter;
    if (!matchesSearch || !matchesStatus || !matchesTech) return false;

    if (viewTab === 'Abertas') {
      return o.status !== 'Entregue' && o.status !== 'Cancelado';
    }
    if (viewTab === 'Vencidos') {
      return isQuoteExpired(o, state.cfg.validOrc);
    }
    if (viewTab === 'Contas a Receber') {
      const total = calcOrderTotalAmount(o);
      const saldo = total - (o.paidAmount || 0);
      return (
        (['Pronto', 'Pronto Retirada', 'Entregue'].includes(o.status) || Boolean(o.isDiagOnly)) &&
        saldo > 0.004
      );
    }
    return true;
  });

  const receivableTotal = useMemo(() => {
    return state.orders
      .filter((o) => {
        const total = calcOrderTotalAmount(o);
        const saldo = total - (o.paidAmount || 0);
        return (
          (['Pronto', 'Pronto Retirada', 'Entregue'].includes(o.status) || Boolean(o.isDiagOnly)) &&
          saldo > 0.004
        );
      })
      .reduce((sum, o) => sum + (calcOrderTotalAmount(o) - (o.paidAmount || 0)), 0);
  }, [state.orders]);

  const activeOrder: ServiceOrder | undefined =
    state.orders.find((o) => o.id === selectedOrderId) || filtered[0];

  const activeVolatile = activeOrder ? getVolatileSecret(activeOrder.id) : undefined;

  const statusColor = (status: OrderStatus) => {
    switch (status) {
      case 'Em reparo':
      case 'Em Reparo SMD':
        return 'bg-[#EAF2FD] text-[#0056ab]';
      case 'Aguardando Peça':
        return 'bg-[#FFF7E6] text-[#D97706]';
      case 'Aprovado':
      case 'Aprovado / Fila':
        return 'bg-[#E0F2FE] text-[#0369A1]';
      case 'Pronto':
      case 'Pronto Retirada':
        return 'bg-[#DCFCE7] text-[#16A34A]';
      case 'Cancelado':
        return 'bg-[#FEE2E2] text-[#DC2626]';
      case 'Entregue':
        return 'bg-[#F3F6FB] text-[#727784]';
      default:
        return 'bg-[#e8eeff] text-[#4f5e81]';
    }
  };

  // Cálculo em tempo real dentro do Modal de OS (paridade calcGanhoDupla)
  const formPricing = useMemo(() => {
    if (!form) return null;
    const itemsRec = form.extraItems.reduce((s, x) => s + (Number(x.q) || 0) * (Number(x.v) || 0), 0);
    const itemsCost = form.extraItems.reduce((s, x) => {
      const part = state.parts.find((p) => p.id === x.p);
      const unitC = x.c !== undefined ? Number(x.c) || 0 : part ? Number(part.costPrice) || 0 : 0;
      return s + (Number(x.q) || 0) * unitC;
    }, 0);
    const taxaRate = eff.totalRetentionPct / 100;
    const marginRate = eff.profitMarginPct / 100;
    const activeHourlyRate =
      form.hourlyRateOverride !== undefined && Number.isFinite(form.hourlyRateOverride)
        ? form.hourlyRateOverride
        : eff.hourlyRate;
    const dupla = calcGanhoDupla({
      hourlyRate: activeHourlyRate,
      indirectHourlyRate: eff.indirectHourlyRate,
      taxaTotalRate: taxaRate,
      hours: form.estimatedHours,
      preco: form.servicePrice,
      peca: form.partCost,
      pcli: form.clientSuppliedPart,
      fretePeca: form.partFreight,
      cons: form.consumables,
      itRec: itemsRec,
      itCusto: itemsCost,
      desc: form.discount,
      frete: form.deliveryFee,
      custoEnt: form.deliveryRealCost,
    });
    const denomFloor = Math.max(0.05, 1 - taxaRate);
    const denomSug = 1 - taxaRate - marginRate;
    const floorDirect = dupla.cd / denomFloor;
    const floorWithItems = dupla.cT / denomFloor;
    const suggestedExact = denomSug > 0.02 ? dupla.cd / denomSug : 0;
    const suggestedRounded = suggestedExact > 0 ? arredondarPreco(suggestedExact, state.cfg.arred) : 0;
    const svc = state.servicos.find((s) => s.id === form.serviceCatalogId);
    const marketPrice = svc ? Number(svc.mercado) || 0 : 0;

    const totalOs = Math.max(
      0,
      Math.round((form.servicePrice + itemsRec + form.deliveryFee - form.discount) * 100) / 100
    );
    const existingOrder = form.editingId
      ? state.orders.find((o) => o.id === form.editingId)
      : undefined;
    const otherPaid = existingOrder
      ? Math.max(0, (existingOrder.paidAmount || 0) - (existingOrder.signalPaid || 0))
      : 0;
    const remainingBalance = Math.max(
      0,
      Math.round((totalOs - otherPaid - form.signalPaid) * 100) / 100
    );

    const selectedPart = state.parts.find((p) => p.id === form.partId);
    const partMissing = !form.clientSuppliedPart && form.partCost > 0 && (!selectedPart || selectedPart.stock <= 0);

    return {
      itemsRec,
      itemsCost,
      dupla,
      floorDirect,
      floorWithItems,
      suggestedExact,
      suggestedRounded,
      marketPrice,
      totalOs,
      remainingBalance,
      partMissing,
      marginTargetPct: eff.profitMarginPct,
    };
  }, [form, eff, state.cfg.arred, state.parts, state.servicos, state.orders]);

  const commitOsFormSave = (triageOverride?: OrderTriage, exitWarningNote?: string) => {
    if (!form) return;
    const clientObj = state.clients.find((c) => c.id === form.clientId);
    const clientName = clientObj?.name || form.customClientName.trim() || 'Cliente Balcão';
    const clientPhone = clientObj?.phone || 'Não informado';
    const clientCpf = clientObj?.cpf || '000.***.***-00';

    const customAc = form.customAccessories
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allAccessories = [...form.accessories, ...customAc];
    const deviceLabel = `${form.brand.trim()} ${form.model.trim()}`.trim() || 'Aparelho';

    const saved = saveServiceOrder({
      id: form.editingId,
      data: {
        clientId: clientObj?.id || form.editingId ? (clientObj?.id || `cli-avulso-${form.editingId}`) : `cli-${Date.now()}`,
        clientName,
        clientPhone,
        clientCpf,
        brand: form.brand.trim(),
        model: form.model.trim(),
        device: deviceLabel,
        deviceType: deviceLabel.toLowerCase().includes('ipad') || deviceLabel.toLowerCase().includes('tab')
          ? 'tablet'
          : deviceLabel.toLowerCase().includes('watch')
          ? 'watch'
          : 'smartphone',
        imei: form.imei.trim() || 'Não informado',
        hasPasscode: Boolean(form.passcode.trim()),
        accessories: allAccessories,
        issue: form.issue.trim() || 'Análise de bancada solicitada',
        notes: form.notes.trim(),
        diagnosis: form.notes.trim() || 'Em acompanhamento técnico na bancada.',
        status: form.pedChegou && form.status === 'Aguardando Peça' ? 'Aprovado' : form.status,
        technician: form.technician || defaultTechName,
        entryChecklist7: { ...form.entryChecklist7 },
        triage: triageOverride || form.triage,
        exitChecklist: { ...form.exitChecklist },
        exitWarningNote,
        serviceCatalogId: form.serviceCatalogId || undefined,
        partId: form.clientSuppliedPart ? '' : form.partId || undefined,
        partCost: form.clientSuppliedPart ? 0 : form.partCost,
        partFreight: form.clientSuppliedPart ? 0 : form.partFreight,
        consumables: form.consumables,
        clientSuppliedPart: form.clientSuppliedPart,
        partPurchased: form.partPurchased,
        estimatedHours: form.estimatedHours,
        snapHourlyRate: form.hourlyRateOverride ?? eff.hourlyRate,
        servicePrice: form.servicePrice,
        partsPrice: 0,
        extraItems: form.extraItems,
        discount: form.discount,
        deliveryFee: form.deliveryFee,
        deliveryRealCost: form.deliveryRealCost,
        acceptedChannel: form.acceptedChannel,
        signalPaid: form.signalPaid,
        expectedDeliveryDate: form.expectedDeliveryDate,
        pedForn: form.pedForn.trim(),
        pedRastreio: form.pedRastreio.trim(),
        pedPrev: form.pedPrev,
        pedChegou: form.pedChegou,
        returnWarrantyFromId: form.returnWarrantyFromId,
      },
      volatileSecret: form.passcode.trim() ? { passcode: form.passcode.trim() } : undefined,
    });

    onSelectOrder(saved.id);
    setFormOpen(false);
    setForm(null);
    setSoftConfirmWarnings([]);
    setPendingSavePayload(null);
  };

  const handleOsFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !formPricing) return;
    setFormError('');

    if (!form.model.trim()) {
      setFormError('Informe o modelo do aparelho.');
      return;
    }
    if (form.discount > form.servicePrice + formPricing.itemsRec) {
      setFormError('O desconto não pode ser maior que o valor do serviço somado aos itens adicionais.');
      return;
    }

    const existingOrder = form.editingId
      ? state.orders.find((o) => o.id === form.editingId)
      : undefined;
    const effectiveStatus: OrderStatus =
      form.pedChegou && form.status === 'Aguardando Peça' ? 'Aprovado' : form.status;
    const statusChanged = !existingOrder || existingOrder.status !== effectiveStatus;
    const isActiveStatus = effectiveStatus !== 'Orçamento' && effectiveStatus !== 'Cancelado';

    const warnings: string[] = [];
    const nextTriage: OrderTriage = { ...form.triage };
    const nowTag = `${todayIsoLocal()} ${new Date().toTimeString().slice(0, 5)}`;

    if (form.discount > 0 && formPricing.dupla.lu < 0) {
      warnings.push(
        isAtendente
          ? 'Com este desconto o preço fica abaixo do mínimo permitido.'
          : `Com este desconto o lucro líquido da OS fica negativo (${formatBRL(formPricing.dupla.lu)}).`
      );
    }

    if (isActiveStatus && statusChanged && !nextTriage.imeiSt && !nextTriage.semImei) {
      warnings.push(
        'Status do IMEI não foi registrado. Consulte *#06# em consultaaparelhoimpedido.com.br (se o aparelho entrou apagado, ficará registrado que seguiu sem consulta).'
      );
      nextTriage.semImei = nowTag;
    }

    if (isActiveStatus && nextTriage.imeiSt === 'impedido' && !nextTriage.impOk) {
      warnings.push(
        'ALERTA FORTE: IMEI marcado como IMPEDIDO / BLOQUEADO (restrição registrada). Avalie recusar o serviço ou registrar ciência do cliente.'
      );
      nextTriage.impOk = nowTag;
    }
    if (nextTriage.imeiSt !== 'impedido') {
      delete nextTriage.impOk;
    }

    let exitWarningNote: string | undefined;
    if (
      statusChanged &&
      ['Pronto', 'Pronto Retirada', 'Entregue'].includes(effectiveStatus)
    ) {
      const missingExit = EXIT_CHECKLIST_ITEMS.filter((item) => !form.exitChecklist[item.key]);
      if (missingExit.length > 0) {
        warnings.push(
          `Checklist de saída incompleto (faltam ${missingExit.length} itens: ${missingExit
            .slice(0, 4)
            .map((m) => m.label)
            .join(', ')}${missingExit.length > 4 ? '...' : ''}). Valide tudo antes de colar com B7000/T7000.`
        );
        exitWarningNote = `${nowTag} (faltavam ${missingExit.length})`;
      }
    }

    if (warnings.length > 0) {
      setSoftConfirmWarnings(warnings);
      setPendingSavePayload({ triage: nextTriage, exitWarningNote });
      return;
    }

    commitOsFormSave(nextTriage, exitWarningNote);
  };

  const handleInspectorStatusClick = (order: ServiceOrder, nextSt: OrderStatus) => {
    if (nextSt === order.status) return;
    if (nextSt === 'Cancelado') {
      setCancelModalOrder(order);
      setCancelMarkLost(false);
      setCancelChargeDiag(false);
      const pg = Number(order.paidAmount) || 0;
      setCancelRefund(pg > 0 ? pg.toFixed(2) : '0');
      return;
    }
    const warnings: string[] = [];
    const isActive = nextSt !== 'Orçamento';
    if (isActive && !order.triage?.imeiSt && !order.triage?.semImei) {
      warnings.push('IMEI ainda não consultado nesta OS.');
    }
    if (isActive && order.triage?.imeiSt === 'impedido' && !order.triage?.impOk) {
      warnings.push('ALERTA: IMEI marcado como IMPEDIDO / BLOQUEADO.');
    }
    if (['Pronto', 'Pronto Retirada', 'Entregue'].includes(nextSt)) {
      const missingCount = EXIT_CHECKLIST_ITEMS.filter(
        (item) => !order.exitChecklist?.[item.key]
      ).length;
      if (missingCount > 0) {
        warnings.push(
          `Checklist de saída possui ${missingCount} item(ns) pendente(s) antes de fechar/colar o aparelho.`
        );
      }
    }

    if (warnings.length > 0) {
      setPendingInspectorStatus({ order, targetStatus: nextSt, warnings });
      return;
    }
    updateOrderStatus(order.id, nextSt);
  };

  const handleOpenReturnWarranty = (o: ServiceOrder) => {
    openNewOsModal({
      clientId: state.clients.some((c) => c.id === o.clientId) ? o.clientId : '',
      brand: o.brand || '',
      model: o.model || o.device,
      imei: o.imei === 'Não informado' ? '' : o.imei,
      issue: `Retorno de garantia da OS ${o.code}`,
      notes: `Retorno dentro da garantia (OS ${o.code})`,
      serviceCatalogId: o.serviceCatalogId || '',
      partCost: 0,
      partFreight: 0,
      consumables: 0,
      estimatedHours: 0.5,
      servicePrice: 0,
      status: 'Aprovado',
      returnWarrantyFromId: o.id,
    });
  };

  const buildOrderWhatsappUrl = (o: ServiceOrder) => {
    const isQuote = o.status === 'Orçamento';
    const itemsText = (o.extraItems || [])
      .map((x) => `${x.q}x ${x.d} - ${formatBRL(x.q * x.v)}`)
      .join('\n');
    const total = calcOrderTotalAmount(o);
    const body = [
      `Olá ${o.clientName}! Segue seu ${isQuote ? 'orçamento' : 'atendimento'} da *MicroLab*:`,
      `OS: ${o.code} (${o.status})`,
      `Aparelho: ${o.device}`,
      ...(o.issue ? [`Defeito: ${o.issue}`] : []),
      ...(o.servicePrice > 0
        ? [`Serviço: ${o.serviceCatalogName || 'Conserto'} — ${formatBRL(o.servicePrice)}`]
        : []),
      ...(itemsText ? [`Itens adicionais:\n${itemsText}`] : []),
      ...(o.deliveryFee && o.deliveryFee > 0 ? [`Taxa de entrega: ${formatBRL(o.deliveryFee)}`] : []),
      ...(o.discount && o.discount > 0 ? [`Desconto: - ${formatBRL(o.discount)}`] : []),
      `Total: *${formatBRL(total)}*`,
      ...(o.paidAmount && o.paidAmount > 0
        ? [`Pago: ${formatBRL(o.paidAmount)} · Saldo: ${formatBRL(Math.max(0, total - o.paidAmount))}`]
        : []),
    ].join('\n');
    const digits = o.clientPhone.replace(/\D/g, '');
    const waDigits = digits.length <= 11 && digits.length >= 8 ? `55${digits}` : digits;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(body)}`;
  };

  const activeOrderTotal = activeOrder ? calcOrderTotalAmount(activeOrder) : 0;
  const activeOrderPaid = activeOrder ? Number(activeOrder.paidAmount) || 0 : 0;
  const activeOrderSaldo = Math.max(0, Math.round((activeOrderTotal - activeOrderPaid) * 100) / 100);
  const activeOrderWarrantyBadge = activeOrder
    ? getOrderWarrantyBadge(activeOrder, state.servicos, state.cfg)
    : null;
  const activeOrderWarrantyUntil = activeOrder
    ? resolveOrderWarrantyUntil(activeOrder, state.servicos, state.cfg)
    : '';
  const activeOrderWarrantyDaysLeft = activeOrderWarrantyUntil
    ? diasAteIso(activeOrderWarrantyUntil)
    : null;

  const diagTaxaVal = calcDiagTaxa(state.cfg);

  const agendaSuggestedIso = useMemo(() => {
    if (!form) return '';
    if (
      form.editingId &&
      ['Aprovado', 'Em reparo', 'Aprovado / Fila', 'Em Reparo SMD'].includes(form.status)
    ) {
      const updatedOrders = state.orders.map((o) =>
        o.id === form.editingId
          ? {
              ...o,
              estimatedHours: form.estimatedHours,
              status: form.status,
              pedPrev: form.pedPrev,
              pedChegou: form.pedChegou,
            }
          : o
      );
      return planejar(updatedOrders, state.cfg.horas).prev[String(form.editingId)] || '';
    }
    return previsaoNova(state.orders, state.cfg.horas, form.estimatedHours);
  }, [form, state.orders, state.cfg.horas]);

  const clientHistoryInForm = useMemo(() => {
    if (!form?.clientId) return [];
    return state.orders
      .filter(
        (o) =>
          o.clientId === form.clientId &&
          o.id !== form.editingId &&
          o.status !== 'Cancelado'
      )
      .sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || '') || b.id - a.id);
  }, [form?.clientId, form?.editingId, state.orders]);

  return (
    <>
      <div className="space-y-4 print:hidden">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Ordens de Serviço (OS)</h1>
            <p className="text-xs text-[#727784]">
              Precificação conectada ao Simulador, triagem IMEI/ESD, encomenda de peças e impressão A4
            </p>
          </div>
          {canAccessRoute('nova-os') && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onGoToCheckIn}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-[#0056ab]" />
                <span>Check-in Assinado</span>
              </button>
              <button
                type="button"
                onClick={() => openNewOsModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nova OS Completa</span>
              </button>
            </div>
          )}
        </div>

        {/* View Tabs + Filters */}
        <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-[#F3F6FB] p-1 rounded-xl border border-[#D9E0EC] overflow-x-auto">
              {(['Todas', 'Abertas', 'Vencidos', 'Contas a Receber'] as ViewTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setViewTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    viewTab === tab
                      ? 'bg-white text-[#0056ab] shadow-xs'
                      : 'text-[#414752] hover:text-[#091b36]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {viewTab === 'Contas a Receber' && (
              <div className="rounded-xl bg-[#EAF2FD] px-3 py-1.5 text-xs font-bold text-[#0056ab] tabular-nums">
                Saldo a receber: {formatBRL(receivableTotal)}
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por #OS, cliente, modelo ou IMEI..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36] focus:outline-none"
              >
                <option value="Todos">Todos os Status</option>
                {allFilterStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
                className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36] focus:outline-none"
              >
                <option value="Todos">Todos Técnicos</option>
                {techOptions.map((techName) => (
                  <option key={techName} value={techName}>
                    Téc. {techName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Split Table + Inspector Drawer */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Table */}
          <div className="xl:col-span-7 rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#D9E0EC] bg-[#F3F6FB] text-[11px] font-semibold text-[#727784]">
                    <th className="py-3 px-4">OS / Cliente</th>
                    <th className="py-3 px-3">Aparelho</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Total / Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E0EC] text-xs">
                  {filtered.map((order) => {
                    const isSelected = activeOrder?.id === order.id;
                    const total = calcOrderTotalAmount(order);
                    const paid = Number(order.paidAmount) || 0;
                    const saldo = Math.max(0, Math.round((total - paid) * 100) / 100);
                    const expired = isQuoteExpired(order, state.cfg.validOrc);

                    return (
                      <tr
                        key={order.id}
                        onClick={() => onSelectOrder(order.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#EAF2FD]/70' : 'hover:bg-[#F3F6FB]/70'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#0056ab] tabular-nums">{order.code}</span>
                            {order.returnWarrantyFromId && (
                              <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[9px] font-bold">
                                Garantia
                              </span>
                            )}
                          </div>
                          <div className="font-medium text-[#091b36]">{order.clientName}</div>
                          <div className="text-[10px] text-[#727784]">
                            {order.createdDate ? formatDateBR(order.createdDate) : order.createdAt}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[#091b36]">{order.device}</div>
                          <div className="text-[11px] text-[#414752] truncate max-w-[200px]">
                            {order.issue}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                                expired
                                  ? 'bg-[#FFF7E6] text-[#D97706]'
                                  : order.isDiagOnly
                                  ? 'bg-[#FFF7E6] text-[#D97706]'
                                  : statusColor(order.status)
                              }`}
                            >
                              {expired ? 'Vencido' : order.isDiagOnly ? 'Diagnóstico' : order.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#727784] mt-0.5">{order.technician}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#091b36] tabular-nums whitespace-nowrap">
                          <div>{formatBRL(total)}</div>
                          {saldo > 0.004 && order.status !== 'Cancelado' && (
                            <div className="text-[10px] font-semibold text-[#D97706]">
                              Saldo {formatBRL(saldo)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 px-4 text-center text-xs text-[#727784]">
                        {state.orders.length === 0
                          ? 'Nenhuma Ordem de Serviço cadastrada ainda. Clique em "+ Nova OS Completa" para iniciar.'
                          : 'Nenhuma Ordem de Serviço encontrada com os filtros atuais.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Detail Panel */}
          <div className="xl:col-span-5 rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-4">
            {activeOrder ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-bold text-[#0056ab] tabular-nums">{activeOrder.code}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${statusColor(activeOrder.status)}`}>
                        {activeOrder.status}
                      </span>
                      {activeOrderWarrantyBadge && activeOrder.status === 'Entregue' && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            activeOrderWarrantyBadge.tone === 'ok'
                              ? 'bg-[#DCFCE7] text-[#16A34A]'
                              : activeOrderWarrantyBadge.tone === 'warn'
                              ? 'bg-[#FFF7E6] text-[#D97706]'
                              : 'bg-[#F3F6FB] text-[#727784]'
                          }`}
                        >
                          {activeOrderWarrantyBadge.label}
                        </span>
                      )}
                      {isQuoteExpired(activeOrder, state.cfg.validOrc) && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FFF7E6] text-[#D97706]">
                          Orçamento Vencido
                        </span>
                      )}
                    </div>
                    <h2 className="text-sm font-bold text-[#091b36] mt-1">{activeOrder.device}</h2>
                    <p className="text-xs text-[#727784]">
                      {activeOrder.clientName} · {activeOrder.clientPhone}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditOsModal(activeOrder)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] text-xs font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
                      title="Editar OS completa"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#0056ab]" />
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[#D9E0EC] text-xs font-semibold text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
                      title="Imprimir OS em A4"
                    >
                      <Printer className="w-4 h-4" />
                      <span className="hidden sm:inline">A4</span>
                    </button>
                    <a
                      href={buildOrderWhatsappUrl(activeOrder)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg border border-[#D9E0EC] text-[#16A34A] hover:bg-[#DCFCE7]"
                      title="Enviar orçamento/OS no WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Status Stepper Selector */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#727784] mb-1.5">
                    Atualizar Situação da OS
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {CANONICAL_ORDER_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleInspectorStatusClick(activeOrder, st)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer truncate ${
                          activeOrder.status === st
                            ? 'bg-[#0056ab] border-[#0056ab] text-white'
                            : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752] hover:bg-[#EAF2FD]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Peça sob encomenda no Inspetor */}
                {(activeOrder.status === 'Aguardando Peça' ||
                  activeOrder.pedPrev ||
                  activeOrder.pedForn ||
                  activeOrder.pedRastreio) && (
                  <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/30 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#091b36]">
                        Peça sob encomenda {activeOrder.pedChegou ? '· Já chegou ✔' : '· Em trânsito'}
                      </span>
                      {!activeOrder.pedChegou && (
                        <button
                          type="button"
                          onClick={() => markOrderPartArrived(activeOrder.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#0056ab] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#1b6fd1] cursor-pointer"
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>Chegou</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#414752]">
                      {activeOrder.pedForn || 'Fornecedor não informado'}
                      {activeOrder.pedRastreio ? ` · Rastreio: ${activeOrder.pedRastreio}` : ''}
                      {activeOrder.pedPrev ? ` · Prev.: ${formatDateBR(activeOrder.pedPrev)}` : ''}
                    </p>
                  </div>
                )}

                {/* Volatile Session Secret Notice */}
                {activeVolatile && (
                  <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/30 p-3 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#091b36]">
                      <Lock className="w-4 h-4 text-[#D97706] shrink-0" />
                      <span>
                        Sessão RAM:{' '}
                        {activeVolatile.passcode && (
                          <strong className="font-mono mr-2">PIN {activeVolatile.passcode}</strong>
                        )}
                        {activeVolatile.patternNodes?.length ? (
                          <strong className="font-mono">Padrão {activeVolatile.patternNodes.join('→')}</strong>
                        ) : null}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-[#D97706]">Não persistida</span>
                  </div>
                )}

                {/* Technical Laudo & Triagem */}
                <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#091b36]">
                      <Wrench className="w-3.5 h-3.5 text-[#0056ab]" />
                      <span>Laudo Técnico &amp; Triagem</span>
                    </div>
                    {activeOrder.triage?.imeiSt && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          activeOrder.triage.imeiSt === 'impedido'
                            ? 'bg-[#FEE2E2] text-[#DC2626]'
                            : activeOrder.triage.imeiSt === 'suspeito'
                            ? 'bg-[#FFF7E6] text-[#D97706]'
                            : 'bg-[#DCFCE7] text-[#16A34A]'
                        }`}
                      >
                        IMEI {activeOrder.triage.imeiSt}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[#091b36]">{activeOrder.issue}</p>
                  <p className="text-xs text-[#414752] leading-relaxed">
                    {activeOrder.notes || activeOrder.diagnosis}
                  </p>
                  <div className="pt-1.5 grid grid-cols-2 gap-1.5 text-[11px] text-[#414752]">
                    <div>IMEI/SN: <strong className="font-mono">{activeOrder.imei}</strong></div>
                    <div>Técnico: <strong>{activeOrder.technician}</strong></div>
                    <div>
                      Saída:{' '}
                      <strong>
                        {EXIT_CHECKLIST_ITEMS.filter((i) => activeOrder.exitChecklist?.[i.key]).length}/
                        {EXIT_CHECKLIST_ITEMS.length}
                      </strong>
                    </div>
                    <div>
                      Previsão:{' '}
                      <strong>
                        {activeOrder.expectedDeliveryDate
                          ? formatDateBR(activeOrder.expectedDeliveryDate)
                          : 'A definir'}
                      </strong>
                    </div>
                  </div>
                  {activeOrder.triage?.bat && (
                    <div className="rounded-lg bg-[#FEE2E2] text-[#DC2626] px-2.5 py-1.5 text-[10px] font-bold">
                      Bateria inchada: PROIBIDO choque 5,2V ou espátula metálica.
                    </div>
                  )}
                  {activeOrder.triage?.oxi && (
                    <div className="rounded-lg bg-[#FFF7E6] text-[#D97706] px-2.5 py-1.5 text-[10px] font-bold">
                      Oxidação: remover periféricos e isolar microfones antes da cuba ultrassônica.
                    </div>
                  )}
                </div>

                {/* Evidências Fotográficas & Assinatura Digital do Check-in */}
                {((activeOrder.evidencePhotos &&
                  Object.values(activeOrder.evidencePhotos).some(Boolean)) ||
                  activeOrder.signatureDataUrl) && (
                  <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC] space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#091b36]">
                      <span>Evidências &amp; Assinatura de Entrada</span>
                      {activeOrder.signatureDataUrl && (
                        <span className="px-2 py-0.5 rounded bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold">
                          Assinatura digital anexada
                        </span>
                      )}
                    </div>
                    {activeOrder.evidencePhotos &&
                      Object.values(activeOrder.evidencePhotos).some(Boolean) && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(
                            [
                              ['front', 'Frontal / Display'],
                              ['back', 'Traseira & Câmeras'],
                              ['rails', 'Laterais & Parafusos'],
                              ['dock', 'Conector & Lacre'],
                            ] as const
                          )
                            .filter(([slot]) => Boolean(activeOrder.evidencePhotos?.[slot]))
                            .map(([slot, label]) => (
                              <div
                                key={slot}
                                className="rounded-lg bg-white border border-[#D9E0EC] p-1.5 text-center space-y-1"
                              >
                                <img
                                  src={activeOrder.evidencePhotos?.[slot]}
                                  alt={label}
                                  className="w-full h-16 object-cover rounded border border-[#D9E0EC]"
                                />
                                <span className="block text-[10px] font-medium text-[#414752] truncate">
                                  {label}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    {activeOrder.signatureDataUrl && (
                      <div className="rounded-lg bg-white border border-[#D9E0EC] p-2">
                        <span className="block text-[10px] text-[#727784] mb-1">
                          Assinatura coletada no check-in:
                        </span>
                        <img
                          src={activeOrder.signatureDataUrl}
                          alt="Assinatura digital do cliente"
                          className="max-h-14 w-auto object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Telemetry Card */}
                {activeOrder.telemetry && (
                  <div className="rounded-xl bg-[#0B0F17] text-white p-3.5 border border-[#2A3954]">
                    <div className="flex items-center justify-between text-[11px] text-[#06B6D4] font-semibold mb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" /> Telemetria ZK-SK150C Vinculada
                      </span>
                      <span className="text-slate-400">{activeOrder.telemetry.recordedAt}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                      <div>
                        <span className="text-slate-400 text-[10px] block">TENSÃO</span>
                        <span className="text-[#06B6D4] font-bold">{activeOrder.telemetry.voltage.toFixed(2)}V</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">CORRENTE</span>
                        <span className="text-[#F59E0B] font-bold">{activeOrder.telemetry.current.toFixed(3)}A</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">POTÊNCIA</span>
                        <span className="text-[#10B981] font-bold">{activeOrder.telemetry.power.toFixed(2)}W</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1.5">{activeOrder.telemetry.note}</p>
                  </div>
                )}

                {/* Testes na Fonte de Bancada (testesFonte v17) */}
                {Array.isArray(activeOrder.testesFonte) && activeOrder.testesFonte.length > 0 && (
                  <div className="rounded-xl bg-[#0B0F17] text-white p-3.5 border border-[#2A3954] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#06B6D4] font-semibold">
                      <span className="inline-flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" /> Testes na Fonte de Bancada ({activeOrder.testesFonte.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {activeOrder.testesFonte.map((t) => (
                        <div
                          key={t.sid}
                          className="rounded-lg bg-[#131B2E] border border-[#2A3954] p-2.5 text-[11px] space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1 text-slate-300">
                            <span className="font-mono font-bold text-[#06B6D4]">{t.dt}</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              Duração: {t.dur}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] tabular-nums text-slate-200">
                            <div>
                              <span className="text-slate-400 block">Fuga</span>
                              <strong>{t.fugaMa != null ? `${t.fugaMa} mA` : '—'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Boot</span>
                              <strong>{t.bootA != null ? `${t.bootA} A` : '—'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Pico</span>
                              <strong>{t.ipkA != null ? `${t.ipkA} A` : '—'}</strong>
                            </div>
                          </div>
                          {t.diag && (
                            <p className="text-slate-200 leading-snug">{t.diag}</p>
                          )}
                          {t.nt && (
                            <p className="text-[10px] text-slate-400 italic">Obs.: {t.nt}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Laudos do Assistente de Defeitos (laudos v17) */}
                {Array.isArray(activeOrder.laudos) && activeOrder.laudos.length > 0 && (
                  <div className="rounded-xl bg-[#F3F6FB] p-3.5 border border-[#D9E0EC] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#091b36] font-bold">
                      <span className="inline-flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-[#0056ab]" /> Laudos de Diagnóstico ({activeOrder.laudos.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {activeOrder.laudos.map((l) => (
                        <div
                          key={l.id}
                          className="rounded-lg bg-white border border-[#D9E0EC] p-2.5 text-[11px] space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-[#091b36] truncate">{l.defeito}</p>
                              <p className="text-[10px] text-[#727784]">{l.data}</p>
                            </div>
                            {confirmDeleteReportId === l.id ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteOrderDiagnosticReport(activeOrder.id, l.id);
                                    setConfirmDeleteReportId(null);
                                  }}
                                  className="px-2 py-0.5 rounded bg-[#DC2626] text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteReportId(null)}
                                  className="px-1.5 py-0.5 rounded bg-[#F3F6FB] text-[#414752] text-[10px] cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteReportId(l.id)}
                                className="p-1 rounded text-[#727784] hover:text-[#DC2626] hover:bg-[#FEE2E2]/50 cursor-pointer shrink-0"
                                title="Excluir laudo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {l.passos && l.passos.length > 0 && (
                            <ul className="space-y-0.5 text-[10px] text-[#414752]">
                              {l.passos.map((et, idx) => (
                                <li key={idx} className="flex items-start gap-1.5">
                                  <span
                                    className={`font-bold shrink-0 ${
                                      et.r === 'ok'
                                        ? 'text-[#16A34A]'
                                        : et.r === 'falha'
                                        ? 'text-[#DC2626]'
                                        : 'text-[#727784]'
                                    }`}
                                  >
                                    {et.r === 'ok' ? '✔' : et.r === 'falha' ? '✖' : '○'}
                                  </span>
                                  <span>{et.t}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {l.obs && (
                            <p className="text-[10px] text-[#414752] bg-[#F3F6FB] rounded px-2 py-1">
                              <strong>Obs.:</strong> {l.obs}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial Summary & Actions */}
                <div className="pt-2 border-t border-[#D9E0EC] space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#727784]">Total da OS (Serviço + Itens + Entrega - Desc.)</span>
                    <span className="text-base font-bold text-[#091b36] tabular-nums">
                      {formatBRL(activeOrderTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#414752] tabular-nums">
                    <span>Já pago (sinal + recebimentos): {formatBRL(activeOrderPaid)}</span>
                    <strong className={activeOrderSaldo > 0.004 ? 'text-[#D97706]' : 'text-[#16A34A]'}>
                      {activeOrderSaldo > 0.004 ? `Saldo ${formatBRL(activeOrderSaldo)}` : 'Quitado'}
                    </strong>
                  </div>

                  {activeOrder.status === 'Entregue' && activeOrderWarrantyUntil && (
                    <p className="text-[11px] text-[#0056ab] font-medium">
                      Garantia válida até <strong>{formatDateBR(activeOrderWarrantyUntil)}</strong>
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPix(
                          activeOrderSaldo > 0.004 ? activeOrderSaldo : activeOrderTotal,
                          `OS ${activeOrder.code} - ${activeOrder.device}`
                        )
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#EAF2FD] px-3 py-2 text-xs font-semibold text-[#0056ab] hover:bg-[#dce9fc] cursor-pointer whitespace-nowrap"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Cobrar PIX</span>
                    </button>

                    {activeOrderSaldo > 0.004 && activeOrder.status !== 'Cancelado' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentModalOrder(activeOrder);
                          setPaymentAmount(activeOrderSaldo.toFixed(2));
                          setPaymentMethod(state.cfg.formas[0] || 'Pix');
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#15803d] cursor-pointer whitespace-nowrap"
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Receber Saldo</span>
                      </button>
                    )}

                    {activeOrder.status === 'Entregue' &&
                      activeOrderWarrantyDaysLeft !== null &&
                      activeOrderWarrantyDaysLeft >= 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenReturnWarranty(activeOrder)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#0056ab]/30 bg-[#EAF2FD]/60 px-3 py-2 text-xs font-semibold text-[#0056ab] hover:bg-[#EAF2FD] cursor-pointer whitespace-nowrap"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Retorno Garantia</span>
                        </button>
                      )}

                    {isQuoteExpired(activeOrder, state.cfg.validOrc) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelModalOrder(activeOrder);
                          setCancelMarkLost(true);
                          setCancelChargeDiag(false);
                          const pg = Number(activeOrder.paidAmount) || 0;
                          setCancelRefund(pg > 0 ? pg.toFixed(2) : '0');
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FFF7E6] border border-[#D97706]/30 px-3 py-2 text-xs font-semibold text-[#D97706] hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Marcar Perdido</span>
                      </button>
                    )}

                    {activeOrder.status !== 'Cancelado' && activeOrder.status !== 'Entregue' && (
                      <button
                        type="button"
                        onClick={() => handleInspectorStatusClick(activeOrder, 'Cancelado')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#414752] hover:bg-[#FEE2E2] hover:text-[#DC2626] cursor-pointer whitespace-nowrap"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Cancelar OS</span>
                      </button>
                    )}

                    {currentUser?.nivel === 'Administrador' && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteModalOrder(activeOrder);
                          setDeleteConfirmCheck(false);
                          setDeleteAdminPin('');
                          setDeleteError('');
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DC2626]/30 bg-[#FEE2E2]/50 px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Excluir OS</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-xs text-[#727784]">
                <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Selecione uma Ordem de Serviço na tabela para inspecionar o laudo completo.
              </div>
            )}
          </div>
        </div>

        {/* MODAL COMPLETO DE OS v17 */}
        {formOpen && form && formPricing && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
            data-modal-open="true"
            onClick={() => setFormOpen(false)}
          >
            <form
              onSubmit={handleOsFormSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-[#D9E0EC] space-y-4 my-auto"
            >
              <div className="flex items-center justify-between border-b border-[#D9E0EC] pb-3 sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-base font-bold text-[#091b36]">
                    {form.editingId ? `Editar OS #${form.editingId}` : 'Nova Ordem de Serviço (Fluxo Completo v17)'}
                  </h3>
                  {form.returnWarrantyFromId && (
                    <span className="text-[11px] font-semibold text-[#0056ab]">
                      Retorno de garantia vinculado à OS #{form.returnWarrantyFromId}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Cliente, Técnico e Situação */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Cliente</label>
                  <select
                    value={form.clientId}
                    onChange={(e) => {
                      const nextCliId = e.target.value;
                      const cli = state.clients.find((c) => c.id === nextCliId);
                      const autoFrete = cli
                        ? calcTaxaEntregaByNeighborhood(cli.neighborhood, state.cfg)
                        : 0;
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              clientId: nextCliId,
                              deliveryFee:
                                prev.deliveryFee === 0 && autoFrete > 0 ? autoFrete : prev.deliveryFee,
                            }
                          : prev
                      );
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  >
                    <option value="">Cliente Avulso / Balcão</option>
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Técnico</label>
                  <select
                    value={form.technician}
                    onChange={(e) => setForm((p) => (p ? { ...p, technician: e.target.value } : p))}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  >
                    {techOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Situação</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((p) => (p ? { ...p, status: e.target.value as OrderStatus } : p))
                    }
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36]"
                  >
                    {allFilterStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!form.clientId && (
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Nome do Cliente Avulso
                  </label>
                  <input
                    value={form.customClientName}
                    onChange={(e) => setForm((p) => (p ? { ...p, customClientName: e.target.value } : p))}
                    placeholder="Informe o nome se ainda não cadastrou em Clientes"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                  />
                </div>
              )}

              {form.status === 'Entregue' && (
                <div className="rounded-xl bg-[#DCFCE7]/60 border border-[#16A34A]/30 px-3 py-2 text-[11px] text-[#091b36]">
                  {(() => {
                    const days = resolveOrderWarrantyDays(
                      form.serviceCatalogId || undefined,
                      state.servicos,
                      state.cfg
                    );
                    const until = addDiasIso(todayIsoLocal(), days);
                    return (
                      <>
                        Ao salvar como <strong>Entregue</strong>: garantia de <strong>{days} dias</strong>, válida até{' '}
                        <strong>{formatDateBR(until)}</strong>.
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Histórico compacto do cliente (M4) */}
              {clientHistoryInForm.length > 0 && (
                <details className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/70 px-3.5 py-2.5">
                  <summary className="text-xs font-bold text-[#091b36] cursor-pointer">
                    Histórico do cliente ({clientHistoryInForm.length}{' '}
                    {clientHistoryInForm.length === 1 ? 'OS anterior' : 'OS anteriores'})
                  </summary>
                  <div className="space-y-2 pt-2.5">
                    {clientHistoryInForm.map((ho) => {
                      const badge = getOrderWarrantyBadge(ho, state.servicos, state.cfg);
                      return (
                        <div
                          key={ho.id}
                          className="rounded-lg bg-white border border-[#D9E0EC] p-2.5 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-[#091b36] truncate">
                              {ho.code} · {ho.device}
                            </p>
                            <p className="text-[11px] text-[#727784] truncate">
                              {ho.serviceCatalogName || ho.issue}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              badge.tone === 'ok'
                                ? 'bg-[#DCFCE7] text-[#16A34A]'
                                : badge.tone === 'warn'
                                ? 'bg-[#FFF7E6] text-[#D97706]'
                                : 'bg-[#F3F6FB] text-[#727784]'
                            }`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {/* Peça sob encomenda (PED) */}
              {(form.status === 'Aguardando Peça' ||
                form.pedForn ||
                form.pedRastreio ||
                form.pedPrev ||
                form.pedChegou) && (
                <div className="rounded-xl bg-[#FFF7E6]/70 border border-[#D97706]/30 p-3.5 space-y-2.5">
                  <p className="text-xs font-bold text-[#091b36]">Peça sob encomenda</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                        Fornecedor / distribuidor
                      </label>
                      <input
                        list="dlFornOs"
                        value={form.pedForn}
                        onChange={(e) => setForm((p) => (p ? { ...p, pedForn: e.target.value } : p))}
                        className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
                      />
                      <datalist id="dlFornOs">
                        {state.suppliers.map((s) => (
                          <option key={s.id} value={s.name} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                        Código de rastreio
                      </label>
                      <input
                        value={form.pedRastreio}
                        onChange={(e) =>
                          setForm((p) => (p ? { ...p, pedRastreio: e.target.value.toUpperCase() } : p))
                        }
                        className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                        Data prevista de chegada
                      </label>
                      <input
                        type="date"
                        value={form.pedPrev}
                        onChange={(e) => setForm((p) => (p ? { ...p, pedPrev: e.target.value } : p))}
                        className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#091b36] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.pedChegou}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((p) =>
                          p
                            ? {
                                ...p,
                                pedChegou: checked,
                                status:
                                  checked && p.status === 'Aguardando Peça' ? 'Aprovado' : p.status,
                              }
                            : p
                        );
                      }}
                    />
                    <span>Peça já chegou (move automaticamente para Aprovado)</span>
                  </label>
                </div>
              )}

              {/* Dados do Aparelho */}
              <details open className="rounded-xl border border-[#D9E0EC] p-3.5 space-y-3">
                <summary className="text-xs font-bold text-[#091b36] cursor-pointer">
                  Dados do Aparelho &amp; Defeito
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">Marca</label>
                    <input
                      value={form.brand}
                      onChange={(e) => setForm((p) => (p ? { ...p, brand: e.target.value } : p))}
                      placeholder="Ex.: Samsung"
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">Modelo *</label>
                    <input
                      required
                      value={form.model}
                      onChange={(e) => setForm((p) => (p ? { ...p, model: e.target.value } : p))}
                      placeholder="Ex.: Galaxy A14"
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">IMEI / Nº Série</label>
                    <input
                      value={form.imei}
                      onChange={(e) => setForm((p) => (p ? { ...p, imei: e.target.value } : p))}
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Senha / Padrão (RAM LGPD)
                    </label>
                    <input
                      autoComplete="off"
                      value={form.passcode}
                      onChange={(e) => setForm((p) => (p ? { ...p, passcode: e.target.value } : p))}
                      placeholder="Apenas sessão atual"
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-semibold text-[#414752] mb-1">Acessórios deixados</span>
                  <div className="flex flex-wrap gap-2">
                    {ACCESSORIES_PRESETS.map((ac) => {
                      const active = form.accessories.includes(ac);
                      return (
                        <button
                          key={ac}
                          type="button"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    accessories: active
                                      ? p.accessories.filter((x) => x !== ac)
                                      : [...p.accessories, ac],
                                  }
                                : p
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                            active
                              ? 'bg-[#0056ab] border-[#0056ab] text-white'
                              : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                          }`}
                        >
                          {ac}
                        </button>
                      );
                    })}
                    <input
                      value={form.customAccessories}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, customAccessories: e.target.value } : p))
                      }
                      placeholder="Outros (separar por vírgula)"
                      className="flex-1 min-w-[160px] rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Defeito relatado
                    </label>
                    <input
                      value={form.issue}
                      onChange={(e) => setForm((p) => (p ? { ...p, issue: e.target.value } : p))}
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">Observações</label>
                    <input
                      value={form.notes}
                      onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))}
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </details>

              {/* Checklist de Entrada (7 itens CKL) */}
              <details className="rounded-xl border border-[#D9E0EC] p-3.5 space-y-2">
                <summary className="text-xs font-bold text-[#091b36] cursor-pointer">
                  Checklist de Entrada (7 itens · Sim / Não / Não testado)
                </summary>
                <div className="space-y-1.5 pt-2">
                  {ENTRY_CHECKLIST_ITEMS.map((item) => {
                    const val = form.entryChecklist7[item.key] || 't';
                    return (
                      <div
                        key={item.key}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-[#F3F6FB] px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium text-[#091b36]">{item.label}</span>
                        <div className="flex items-center gap-1">
                          {(
                            [
                              ['s', 'Sim'],
                              ['n', 'Não'],
                              ['t', 'Não testado'],
                            ] as const
                          ).map(([code, lbl]) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() =>
                                setForm((p) =>
                                  p
                                    ? {
                                        ...p,
                                        entryChecklist7: { ...p.entryChecklist7, [item.key]: code },
                                      }
                                    : p
                                )
                              }
                              className={`px-2 py-0.5 rounded border text-[11px] font-semibold cursor-pointer ${
                                val === code
                                  ? 'bg-[#0056ab] border-[#0056ab] text-white'
                                  : 'bg-white border-[#D9E0EC] text-[#414752]'
                              }`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* Triagem de Entrada e Segurança (TRI) */}
              <details open className="rounded-xl border border-[#D9E0EC] p-3.5 space-y-2.5">
                <summary className="text-xs font-bold text-[#091b36] cursor-pointer">
                  Triagem IMEI &amp; Segurança (ESD / Bateria / Oxidação)
                </summary>
                <p className="text-[11px] text-[#727784]">
                  Consulte o IMEI (*#06#) em{' '}
                  <a
                    href="https://consultaaparelhoimpedido.com.br"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0056ab] font-semibold underline"
                  >
                    consultaaparelhoimpedido.com.br
                  </a>
                  .
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...IMEI_TRIAGE_STATUSES, { value: '' as const, label: 'Não consultado' }].map((opt) => (
                    <button
                      key={opt.value || 'empty'}
                      type="button"
                      onClick={() =>
                        setForm((p) =>
                          p ? { ...p, triage: { ...p.triage, imeiSt: opt.value } } : p
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                        (form.triage.imeiSt || '') === opt.value
                          ? opt.value === 'impedido'
                            ? 'bg-[#DC2626] border-[#DC2626] text-white'
                            : opt.value === 'suspeito'
                            ? 'bg-[#D97706] border-[#D97706] text-white'
                            : opt.value === 'regular'
                            ? 'bg-[#16A34A] border-[#16A34A] text-white'
                            : 'bg-[#091b36] border-[#091b36] text-white'
                          : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {form.triage.imeiSt === 'impedido' && (
                  <div className="rounded-lg bg-[#FEE2E2] border border-[#DC2626]/30 p-2.5 text-[11px] font-semibold text-[#DC2626]">
                    IMEI IMPEDIDO / BLOQUEADO: o aparelho tem restrição registrada. Risco legal e de prejuízo; avalie recusar o serviço.
                  </div>
                )}
                {form.triage.imeiSt === 'suspeito' && (
                  <div className="rounded-lg bg-[#FFF7E6] border border-[#D97706]/30 p-2.5 text-[11px] font-semibold text-[#D97706]">
                    IMEI suspeito: confirme com o cliente a origem do aparelho antes de reparar.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.triage.apagado)}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, triage: { ...p.triage, apagado: e.target.checked } } : p
                        )
                      }
                    />
                    <span>Aparelho entrou apagado / sem ligar</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.triage.esd)}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, triage: { ...p.triage, esd: e.target.checked } } : p
                        )
                      }
                    />
                    <span>Proteção ESD verificada (pulseira/luva/manta)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.triage.bat)}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, triage: { ...p.triage, bat: e.target.checked } } : p
                        )
                      }
                    />
                    <span>Bateria inchada</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.triage.oxi)}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, triage: { ...p.triage, oxi: e.target.checked } } : p
                        )
                      }
                    />
                    <span>Sinais de oxidação</span>
                  </label>
                </div>

                {form.triage.bat && (
                  <div className="rounded-lg bg-[#FEE2E2] p-2.5 text-[11px] font-bold text-[#DC2626]">
                    PROIBIDO aplicar choque de ativação na fonte (5,2V) ou usar espátula metálica.
                  </div>
                )}
                {form.triage.oxi && (
                  <div className="rounded-lg bg-[#FFF7E6] p-2.5 text-[11px] font-semibold text-[#D97706]">
                    Remover periféricos e isolar microfones com fita de alumínio antes da banheira ultrassônica (3 min cada lado).
                  </div>
                )}
              </details>

              {/* Checklist de Saída (10 itens SAIL) */}
              <details className="rounded-xl border border-[#D9E0EC] p-3.5 space-y-2">
                <summary className="text-xs font-bold text-[#091b36] cursor-pointer">
                  Checklist de Saída (
                  {EXIT_CHECKLIST_ITEMS.filter((i) => form.exitChecklist[i.key]).length}/
                  {EXIT_CHECKLIST_ITEMS.length})
                </summary>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-[#727784]">
                    Valide todos os testes antes de colar a tela/tampa com B7000 ou T7000.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      EXIT_CHECKLIST_ITEMS.forEach((i) => {
                        all[i.key] = true;
                      });
                      setForm((p) => (p ? { ...p, exitChecklist: all } : p));
                    }}
                    className="rounded-lg bg-[#EAF2FD] px-2.5 py-1 text-[11px] font-bold text-[#0056ab] hover:bg-[#dce9fc] cursor-pointer"
                  >
                    Marcar todos
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  {EXIT_CHECKLIST_ITEMS.map((item) => (
                    <label
                      key={item.key}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#F3F6FB] px-2.5 py-1.5 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(form.exitChecklist[item.key])}
                        onChange={(e) =>
                          setForm((p) =>
                            p
                              ? {
                                  ...p,
                                  exitChecklist: { ...p.exitChecklist, [item.key]: e.target.checked },
                                }
                              : p
                          )
                        }
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </details>

              {/* Precificação Conectada (PB v17) */}
              <div className="rounded-xl border border-[#0056ab]/25 bg-[#EAF2FD]/45 p-3.5 space-y-3">
                <p className="text-xs font-bold text-[#091b36]">Precificação &amp; Peça Principal</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Serviço do catálogo
                    </label>
                    <select
                      value={form.serviceCatalogId}
                      onChange={(e) => {
                        const svcId = e.target.value;
                        const svc = state.servicos.find((s) => s.id === svcId);
                        const matchPart =
                          svc && svc.peca
                            ? state.parts.find(
                                (pt) => normStr(pt.name) === normStr(svc.peca)
                              )
                            : undefined;
                        setForm((p) =>
                          p
                            ? {
                                ...p,
                                serviceCatalogId: svcId,
                                estimatedHours: svc ? svc.tempo || p.estimatedHours : p.estimatedHours,
                                consumables: svc ? svc.cons ?? 2 : p.consumables,
                                partId: matchPart ? matchPart.id : p.partId,
                                partCost: matchPart && !p.clientSuppliedPart ? matchPart.costPrice : p.partCost,
                              }
                            : p
                        );
                      }}
                      className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="">—</option>
                      {state.servicos.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!isAtendente && (
                    <div>
                      <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                        Peça do estoque (opcional)
                      </label>
                      <select
                        value={form.partId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          const pt = state.parts.find((x) => x.id === pid);
                          setForm((p) =>
                            p
                              ? {
                                  ...p,
                                  partId: pid,
                                  partCost: pt && !p.clientSuppliedPart ? pt.costPrice : p.partCost,
                                }
                              : p
                          );
                        }}
                        disabled={form.clientSuppliedPart}
                        className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {state.parts.map((pt) => (
                          <option key={pt.id} value={pt.id}>
                            {pt.name} ({pt.stock})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Tempo estimado (h)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={form.estimatedHours}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, estimatedHours: Math.max(0, Number(e.target.value) || 0) } : p
                        )
                      }
                      className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {!isAtendente && (
                    <>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                          Custo da peça (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={form.clientSuppliedPart}
                          value={form.partCost}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, partCost: Math.max(0, Number(e.target.value) || 0) } : p
                            )
                          }
                          className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                          Frete da peça (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={form.clientSuppliedPart}
                          value={form.partFreight}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, partFreight: Math.max(0, Number(e.target.value) || 0) } : p
                            )
                          }
                          className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                          Consumíveis (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.consumables}
                          onChange={(e) =>
                            setForm((p) =>
                              p ? { ...p, consumables: Math.max(0, Number(e.target.value) || 0) } : p
                            )
                          }
                          className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Preço cobrado serviço (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.servicePrice}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, servicePrice: Math.max(0, Number(e.target.value) || 0) } : p
                        )
                      }
                      className="w-full rounded-lg border border-[#0056ab] bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.clientSuppliedPart}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((p) =>
                          p
                            ? {
                                ...p,
                                clientSuppliedPart: checked,
                                partCost: checked ? 0 : p.partCost,
                                partFreight: checked ? 0 : p.partFreight,
                                partId: checked ? '' : p.partId,
                              }
                            : p
                        );
                      }}
                    />
                    <span>Peça fornecida pelo cliente (garantia só do serviço)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.partPurchased}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, partPurchased: e.target.checked } : p))
                      }
                    />
                    <span>Peça já comprada para esta OS</span>
                  </label>
                </div>

                {/* Painel em tempo real (calcGanhoDupla + restrição Atendente) */}
                {formPricing.dupla.cd > 0 && (
                  <div className="rounded-lg bg-white border border-[#D9E0EC] p-2.5 text-xs space-y-1">
                    {isAtendente ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Preço sugerido:{' '}
                          <strong className="text-[#0056ab] tabular-nums">
                            {formatBRL(formPricing.suggestedRounded)}
                          </strong>
                        </span>
                        {formPricing.suggestedRounded > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((p) =>
                                p ? { ...p, servicePrice: formPricing.suggestedRounded } : p
                              )
                            }
                            className="rounded bg-[#0056ab] px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                          >
                            Usar {formatBRL(formPricing.suggestedRounded)}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#414752]">
                          <span>
                            Custo direto <strong>{formatBRL(formPricing.dupla.cd)}</strong> · Piso{' '}
                            <strong>{formatBRL(formPricing.floorDirect)}</strong> · Sugerido{' '}
                            <strong>{formatBRL(formPricing.suggestedExact)}</strong>
                            {formPricing.marketPrice > 0
                              ? ` · Mercado ${formatBRL(formPricing.marketPrice)}`
                              : ''}
                          </span>
                          {formPricing.suggestedRounded > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setForm((p) =>
                                  p ? { ...p, servicePrice: formPricing.suggestedRounded } : p
                                )
                              }
                              className="rounded bg-[#0056ab] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1b6fd1] cursor-pointer"
                            >
                              Usar {formatBRL(formPricing.suggestedRounded)}
                            </button>
                          )}
                        </div>
                        {form.servicePrice > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#D9E0EC] text-[11px]">
                            <span className={formPricing.dupla.lu >= 0 ? 'text-[#16A34A] font-bold' : 'text-[#DC2626] font-bold'}>
                              Lucro líquido empresa {formatBRL(formPricing.dupla.lu)} · margem{' '}
                              {(formPricing.dupla.mg * 100).toFixed(1)}%
                            </span>
                            <span className="text-[#091b36] font-bold">
                              Ganho técnico {formatBRL(formPricing.dupla.ganho)} (hora {formatBRL(formPricing.dupla.mo)} + lucro)
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {form.servicePrice > 0 &&
                      formPricing.dupla.rec < formPricing.floorWithItems - 0.005 && (
                        <p className="text-[11px] font-semibold text-[#DC2626]">
                          {isAtendente
                            ? 'Preço abaixo do mínimo permitido. Fale com o administrador.'
                            : 'Abaixo do preço mínimo: o lucro líquido fica negativo.'}
                        </p>
                      )}
                  </div>
                )}
              </div>

              {/* Itens Adicionais */}
              <div className="rounded-xl border border-[#D9E0EC] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#091b36]">Itens adicionais (opcional)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) =>
                        p
                          ? { ...p, extraItems: [...p.extraItems, { d: '', q: 1, v: 0 }] }
                          : p
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-[#F3F6FB] border border-[#D9E0EC] px-2.5 py-1 text-[11px] font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar item</span>
                  </button>
                </div>
                {form.extraItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={item.p || ''}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const pt = state.parts.find((x) => x.id === pid);
                        setForm((p) => {
                          if (!p) return p;
                          const next = [...p.extraItems];
                          next[idx] = pt
                            ? { ...next[idx], p: pid, d: pt.name, v: pt.sellPrice, c: pt.costPrice }
                            : { ...next[idx], p: undefined };
                          return { ...p, extraItems: next };
                        });
                      }}
                      className="col-span-4 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1.5 text-xs"
                    >
                      <option value="">Serviço / outro</option>
                      {state.parts.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.d}
                      onChange={(e) =>
                        setForm((p) => {
                          if (!p) return p;
                          const next = [...p.extraItems];
                          next[idx] = { ...next[idx], d: e.target.value };
                          return { ...p, extraItems: next };
                        })
                      }
                      placeholder="Descrição"
                      className="col-span-4 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      min="1"
                      value={item.q}
                      onChange={(e) =>
                        setForm((p) => {
                          if (!p) return p;
                          const next = [...p.extraItems];
                          next[idx] = { ...next[idx], q: Math.max(1, Number(e.target.value) || 1) };
                          return { ...p, extraItems: next };
                        })
                      }
                      className="col-span-1 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1.5 text-xs tabular-nums"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.v}
                      onChange={(e) =>
                        setForm((p) => {
                          if (!p) return p;
                          const next = [...p.extraItems];
                          next[idx] = { ...next[idx], v: Math.max(0, Number(e.target.value) || 0) };
                          return { ...p, extraItems: next };
                        })
                      }
                      className="col-span-2 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1.5 text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) =>
                          p ? { ...p, extraItems: p.extraItems.filter((_, i) => i !== idx) } : p
                        )
                      }
                      className="col-span-1 text-center text-[#DC2626] font-bold cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Valores, Entrega, Aceite e Sinal */}
              <div className="rounded-xl border border-[#D9E0EC] p-3.5 space-y-3">
                <p className="text-xs font-bold text-[#091b36]">Valores, Entrega &amp; Sinal</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">Desconto (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.discount}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, discount: Math.max(0, Number(e.target.value) || 0) } : p
                        )
                      }
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Taxa de entrega (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.deliveryFee}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, deliveryFee: Math.max(0, Number(e.target.value) || 0) } : p
                        )
                      }
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                  {!isAtendente && (
                    <div>
                      <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                        Custo real entrega (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.deliveryRealCost}
                        onChange={(e) =>
                          setForm((p) =>
                            p
                              ? { ...p, deliveryRealCost: Math.max(0, Number(e.target.value) || 0) }
                              : p
                          )
                        }
                        className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs tabular-nums"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Aceite do orçamento
                    </label>
                    <select
                      value={form.acceptedChannel}
                      onChange={(e) =>
                        setForm((p) =>
                          p
                            ? {
                                ...p,
                                acceptedChannel: e.target.value as 'WhatsApp' | 'Presencial' | 'Outro' | '',
                              }
                            : p
                        )
                      }
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs"
                    >
                      <option value="">—</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Presencial">Presencial</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">Sinal pago (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.signalPaid}
                      onChange={(e) =>
                        setForm((p) =>
                          p ? { ...p, signalPaid: Math.max(0, Number(e.target.value) || 0) } : p
                        )
                      }
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                      Previsão de entrega
                    </label>
                    <input
                      type="date"
                      value={form.expectedDeliveryDate}
                      onChange={(e) =>
                        setForm((p) => (p ? { ...p, expectedDeliveryDate: e.target.value } : p))
                      }
                      className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs"
                    />
                    {agendaSuggestedIso ? (
                      <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-[#727784]">
                        <span>
                          Agenda: <strong className="text-[#091b36]">{formatDateBR(agendaSuggestedIso)}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) =>
                              p ? { ...p, expectedDeliveryDate: agendaSuggestedIso } : p
                            )
                          }
                          className="rounded px-1.5 py-0.5 bg-[#EAF2FD] text-[#0056ab] font-semibold hover:bg-[#dbeafe] cursor-pointer"
                        >
                          Usar
                        </button>
                      </div>
                    ) : (
                      <span className="block mt-1 text-[10px] text-[#727784]">
                        Defina horas para calcular na agenda
                      </span>
                    )}
                  </div>
                  <div className="rounded-lg bg-[#F3F6FB] border border-[#D9E0EC] px-2.5 py-1.5">
                    <span className="block text-[10px] text-[#727784]">Total OS</span>
                    <strong className="text-xs text-[#091b36] tabular-nums">
                      {formatBRL(formPricing.totalOs)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-[#F3F6FB] border border-[#D9E0EC] px-2.5 py-1.5">
                    <span className="block text-[10px] text-[#727784]">Saldo restante</span>
                    <strong className="text-xs text-[#0056ab] tabular-nums">
                      {formPricing.remainingBalance > 0
                        ? formatBRL(formPricing.remainingBalance)
                        : 'Quitado'}
                    </strong>
                  </div>
                </div>

                {formPricing.partMissing && (
                  <p className="text-[11px] font-semibold text-[#D97706]">
                    Peça sob encomenda: sinal sugerido de pelo menos {formatBRL(form.partCost)}, para não financiar a peça.
                  </p>
                )}
              </div>

              {formError && (
                <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 p-3 text-xs font-semibold text-[#DC2626]">
                  {formError}
                </div>
              )}

              {softConfirmWarnings.length > 0 && pendingSavePayload && (
                <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/40 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#D97706]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Confirmação necessária antes de salvar</span>
                  </div>
                  <ul className="list-disc pl-5 text-xs text-[#414752] space-y-1">
                    {softConfirmWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSoftConfirmWarnings([]);
                        setPendingSavePayload(null);
                      }}
                      className="flex-1 rounded-xl border border-[#D9E0EC] bg-white py-2 text-xs font-semibold text-[#414752] cursor-pointer"
                    >
                      Voltar e Revisar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        commitOsFormSave(pendingSavePayload.triage, pendingSavePayload.exitWarningNote)
                      }
                      className="flex-1 rounded-xl bg-[#D97706] py-2 text-xs font-bold text-white hover:bg-[#b45309] cursor-pointer"
                    >
                      Confirmar e Salvar OS
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-[#D9E0EC]">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-bold text-white hover:bg-[#1b6fd1] cursor-pointer"
                >
                  {form.editingId ? 'Salvar Alterações da OS' : 'Salvar Nova OS'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal de confirmação suave de Status (Pronto / Entregue / IMEI) */}
        {pendingInspectorStatus && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
            data-modal-open="true"
            onClick={() => setPendingInspectorStatus(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-6 border border-[#D9E0EC] shadow-xl space-y-4"
            >
              <div className="flex items-center gap-2 text-[#D97706]">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold text-[#091b36]">
                  Confirmar mudança para {pendingInspectorStatus.targetStatus}?
                </h3>
              </div>
              <ul className="list-disc pl-5 text-xs text-[#414752] space-y-1.5">
                {pendingInspectorStatus.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingInspectorStatus(null)}
                  className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateOrderStatus(
                      pendingInspectorStatus.order.id,
                      pendingInspectorStatus.targetStatus
                    );
                    setPendingInspectorStatus(null);
                  }}
                  className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-bold text-white cursor-pointer"
                >
                  Marcar Mesmo Assim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Receber Pagamento */}
        {paymentModalOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
            data-modal-open="true"
            onClick={() => setPaymentModalOrder(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = Math.max(0, Number(paymentAmount) || 0);
                if (val <= 0) return;
                receiveOrderPayment(paymentModalOrder.id, val, paymentMethod);
                setPaymentModalOrder(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-6 border border-[#D9E0EC] shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#091b36]">
                  Receber · OS {paymentModalOrder.code}
                </h3>
                <button
                  type="button"
                  onClick={() => setPaymentModalOrder(null)}
                  className="p-1 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Math.max(
                    0.01,
                    calcOrderTotalAmount(paymentModalOrder) - (paymentModalOrder.paidAmount || 0)
                  )}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Forma</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                >
                  {(state.cfg.formas.length ? state.cfg.formas : ['Pix', 'Dinheiro']).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOrder(null)}
                  className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#16A34A] py-2.5 text-xs font-bold text-white cursor-pointer"
                >
                  Registrar Entrada
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Cancelar / Marcar Perdido */}
        {cancelModalOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
            data-modal-open="true"
            onClick={() => setCancelModalOrder(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                cancelOrderWithOptions(cancelModalOrder.id, {
                  markLost: cancelMarkLost,
                  chargeDiag: cancelChargeDiag,
                  refundAmount: Math.max(0, Number(cancelRefund) || 0),
                });
                setCancelModalOrder(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-6 border border-[#D9E0EC] shadow-xl space-y-4"
            >
              <h3 className="text-base font-bold text-[#091b36]">
                {cancelMarkLost
                  ? `Marcar Orçamento Perdido · ${cancelModalOrder.code}`
                  : `Cancelar OS · ${cancelModalOrder.code}`}
              </h3>
              {!cancelMarkLost && diagTaxaVal > 0 && !cancelModalOrder.isDiagOnly && !cancelModalOrder.cancelHandled && (
                <label className="flex items-start gap-2 rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC] text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cancelChargeDiag}
                    onChange={(e) => {
                      const ck = e.target.checked;
                      setCancelChargeDiag(ck);
                      const pg = Number(cancelModalOrder.paidAmount) || 0;
                      const partKeep = cancelModalOrder.partPurchased
                        ? Number(cancelModalOrder.partCost) || 0
                        : 0;
                      const retained = (ck ? diagTaxaVal : 0) + partKeep;
                      setCancelRefund(Math.max(0, pg - retained).toFixed(2));
                    }}
                  />
                  <span>
                    Cobrar taxa de diagnóstico de <strong>{formatBRL(diagTaxaVal)}</strong> (recusa após análise de bancada)
                  </span>
                </label>
              )}

              {(cancelModalOrder.paidAmount || 0) > 0 && !cancelModalOrder.cancelHandled && (
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Valor pago pelo cliente: {formatBRL(cancelModalOrder.paidAmount || 0)}. Quanto devolver?
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={cancelModalOrder.paidAmount || 0}
                    value={cancelRefund}
                    onChange={(e) => setCancelRefund(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#DC2626] py-2.5 text-xs font-bold text-white cursor-pointer"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Excluir OS com PIN de Administrador */}
        {deleteModalOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/60 backdrop-blur-xs p-4"
            data-modal-open="true"
            onClick={() => setDeleteModalOrder(null)}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setDeleteError('');
                if (!deleteConfirmCheck) {
                  setDeleteError('Confirme que entende a exclusão dos lançamentos financeiros.');
                  return;
                }
                const res = await deleteOrderWithAdminPin(deleteModalOrder.id, deleteAdminPin);
                if (!res.ok) {
                  setDeleteError(res.error || 'Erro ao excluir OS.');
                  return;
                }
                setDeleteModalOrder(null);
                onSelectOrder(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-6 border border-[#DC2626]/30 shadow-xl space-y-4"
            >
              <h3 className="text-base font-bold text-[#DC2626]">
                Excluir definitivamente OS {deleteModalOrder.code}?
              </h3>
              <p className="text-xs text-[#414752]">
                Esta ação apaga a OS, remove{' '}
                <strong>
                  {state.transactions.filter((tx) => tx.orderId === deleteModalOrder.id).length} lançamento(s)
                </strong>{' '}
                do caixa vinculados e devolve peças baixadas ao estoque.
              </p>
              <label className="flex items-start gap-2 text-xs text-[#091b36] cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteConfirmCheck}
                  onChange={(e) => setDeleteConfirmCheck(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Entendo que os lançamentos financeiros vinculados também serão apagados.</span>
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Digite seu PIN de Administrador para confirmar
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  value={deleteAdminPin}
                  onChange={(e) => setDeleteAdminPin(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono"
                />
              </div>
              {deleteError && <p className="text-xs font-semibold text-[#DC2626]">{deleteError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteModalOrder(null)}
                  className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-[#DC2626] py-2.5 text-xs font-bold text-white cursor-pointer"
                >
                  Excluir Definitivamente
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Layout de Impressão A4 Completo (sem custos internos ou margens) */}
      {activeOrder && (
        <section id="print-os-a4" className="hidden print:block bg-white text-black text-[11px] leading-snug">
          <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-3">
            <div className="flex items-center gap-3">
              <img
                src="./pwa-192x192.png"
                alt="MicroLab"
                className="w-11 h-11 rounded-lg object-cover shrink-0 border border-black/20"
              />
              <div>
                <div className="text-base font-extrabold tracking-tight">MicroLab</div>
                <div className="text-[10px] uppercase tracking-wider">Assistência Técnica Especializada</div>
              </div>
            </div>
            <div className="text-right text-[10px]">
              <div className="font-bold">MicroLab · Assistência Técnica</div>
              <div>WhatsApp (71) 99129-3552</div>
              <div>Instagram @microlabssa</div>
              <div>Impresso em {new Date().toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          <h1 className="text-center text-sm font-extrabold uppercase border border-black py-1.5 mb-3">
            ORDEM DE SERVIÇO Nº {activeOrder.id} — {activeOrder.status.toUpperCase()}
          </h1>

          <div className="mb-3">
            <h3 className="text-[10px] font-bold uppercase bg-gray-100 border border-black px-2 py-1">
              Dados do Cliente
            </h3>
            <div className="grid grid-cols-2 border-x border-b border-black text-[10px]">
              <div className="p-1.5 border-r border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">Nome do cliente</span>
                <strong>{activeOrder.clientName}</strong>
              </div>
              <div className="p-1.5 border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">Telefone / WhatsApp</span>
                <strong>{activeOrder.clientPhone}</strong>
              </div>
              <div className="p-1.5 border-r border-black">
                <span className="block text-[9px] uppercase text-gray-600">Data de entrada</span>
                <strong>
                  {activeOrder.createdDate
                    ? formatDateBR(activeOrder.createdDate)
                    : activeOrder.createdAt}
                </strong>
              </div>
              <div className="p-1.5">
                <span className="block text-[9px] uppercase text-gray-600">
                  Técnico responsável{activeOrder.expectedDeliveryDate ? ' · Previsão estimada' : ''}
                </span>
                <strong>
                  {activeOrder.technician}
                  {activeOrder.expectedDeliveryDate
                    ? ` · ${formatDateBR(activeOrder.expectedDeliveryDate)}`
                    : ''}
                </strong>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <h3 className="text-[10px] font-bold uppercase bg-gray-100 border border-black px-2 py-1">
              Dados do Aparelho
            </h3>
            <div className="grid grid-cols-2 border-x border-b border-black text-[10px]">
              <div className="p-1.5 border-r border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">Marca / Modelo</span>
                <strong>{activeOrder.device}</strong>
              </div>
              <div className="p-1.5 border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">IMEI / Série</span>
                <strong className="font-mono">{activeOrder.imei}</strong>
              </div>
              <div className="p-1.5 border-r border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">Acessórios deixados</span>
                <strong>{activeOrder.accessories?.join(', ') || 'Nenhum'}</strong>
              </div>
              <div className="p-1.5 border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">Senha / padrão (LGPD)</span>
                <strong>{activeOrder.hasPasscode ? 'Informada ao técnico' : 'Não informada'}</strong>
              </div>
              <div className="p-1.5 col-span-2 border-b border-black">
                <span className="block text-[9px] uppercase text-gray-600">Defeito relatado</span>
                <div>{activeOrder.issue}</div>
              </div>
              <div className="p-1.5 col-span-2">
                <span className="block text-[9px] uppercase text-gray-600">Observações técnicas</span>
                <div>{activeOrder.notes || activeOrder.diagnosis}</div>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <h3 className="text-[10px] font-bold uppercase bg-gray-100 border border-black px-2 py-1">
              Checklist de Entrada
            </h3>
            <table className="w-full border-collapse border-x border-b border-black text-[10px]">
              <thead>
                <tr className="border-b border-black bg-gray-50">
                  <th className="text-left p-1 border-r border-black">Item inspecionado</th>
                  <th className="text-center p-1 border-r border-black w-16">Sim</th>
                  <th className="text-center p-1 border-r border-black w-16">Não</th>
                  <th className="text-center p-1 w-24">Não testado</th>
                </tr>
              </thead>
              <tbody>
                {ENTRY_CHECKLIST_ITEMS.map((item) => {
                  const st = activeOrder.entryChecklist7?.[item.key] || 't';
                  return (
                    <tr key={item.key} className="border-b border-black last:border-b-0">
                      <td className="p-1 border-r border-black">{item.label}</td>
                      <td className="p-1 border-r border-black text-center font-mono">
                        {st === 's' ? '[ X ]' : '[   ]'}
                      </td>
                      <td className="p-1 border-r border-black text-center font-mono">
                        {st === 'n' ? '[ X ]' : '[   ]'}
                      </td>
                      <td className="p-1 text-center font-mono">
                        {st === 't' ? '[ X ]' : '[   ]'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {activeOrder.evidencePhotos &&
            (['front', 'back', 'rails', 'dock'] as const).some((slot) =>
              Boolean(activeOrder.evidencePhotos?.[slot])
            ) && (
              <div className="mb-3">
                <h3 className="text-[10px] font-bold uppercase bg-gray-100 border border-black px-2 py-1">
                  Registro Fotográfico de Entrada (Evidências)
                </h3>
                <div className="grid grid-cols-4 gap-2 border-x border-b border-black p-2">
                  {(
                    [
                      ['front', 'Frontal / Display'],
                      ['back', 'Tampa Traseira & Câmeras'],
                      ['rails', 'Laterais & Parafusos'],
                      ['dock', 'Conector & Lacre Entrada'],
                    ] as const
                  ).map(([slot, label]) => {
                    const photo = activeOrder.evidencePhotos?.[slot];
                    if (!photo) return null;
                    return (
                      <div key={slot} className="border border-gray-300 p-1 text-center">
                        <img
                          src={photo}
                          alt={label}
                          className="w-full h-24 object-contain mx-auto bg-white"
                        />
                        <div className="text-[8px] font-semibold mt-1 text-gray-800">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          <div className="mb-3">
            <h3 className="text-[10px] font-bold uppercase bg-gray-100 border border-black px-2 py-1">
              Descrição de Serviços e Valores
            </h3>
            <table className="w-full border-collapse border-x border-b border-black text-[10px]">
              <thead>
                <tr className="border-b border-black bg-gray-50">
                  <th className="text-left p-1 border-r border-black">Descrição</th>
                  <th className="text-right p-1 border-r border-black w-12">Qtd</th>
                  <th className="text-right p-1 border-r border-black w-24">Valor</th>
                  <th className="text-right p-1 w-24">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {activeOrder.servicePrice > 0 && (
                  <tr className="border-b border-black">
                    <td className="p-1 border-r border-black">
                      {activeOrder.serviceCatalogName || 'Serviço Técnico Especializado'}
                    </td>
                    <td className="p-1 border-r border-black text-right">1</td>
                    <td className="p-1 border-r border-black text-right">
                      {formatBRL(activeOrder.servicePrice)}
                    </td>
                    <td className="p-1 text-right">{formatBRL(activeOrder.servicePrice)}</td>
                  </tr>
                )}
                {(activeOrder.extraItems || []).map((it, idx) => (
                  <tr key={idx} className="border-b border-black">
                    <td className="p-1 border-r border-black">{it.d}</td>
                    <td className="p-1 border-r border-black text-right">{it.q}</td>
                    <td className="p-1 border-r border-black text-right">{formatBRL(it.v)}</td>
                    <td className="p-1 text-right">{formatBRL(it.q * it.v)}</td>
                  </tr>
                ))}
                {activeOrder.partsPrice > 0 && (
                  <tr className="border-b border-black">
                    <td className="p-1 border-r border-black">Peças e Componentes Aplicados</td>
                    <td className="p-1 border-r border-black text-right">1</td>
                    <td className="p-1 border-r border-black text-right">
                      {formatBRL(activeOrder.partsPrice)}
                    </td>
                    <td className="p-1 text-right">{formatBRL(activeOrder.partsPrice)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                {(activeOrder.deliveryFee || 0) > 0 && (
                  <tr className="border-b border-black">
                    <td colSpan={3} className="p-1 border-r border-black text-right">
                      Taxa de entrega
                    </td>
                    <td className="p-1 text-right">{formatBRL(activeOrder.deliveryFee || 0)}</td>
                  </tr>
                )}
                {(activeOrder.discount || 0) > 0 && (
                  <tr className="border-b border-black">
                    <td colSpan={3} className="p-1 border-r border-black text-right">
                      Desconto
                    </td>
                    <td className="p-1 text-right">- {formatBRL(activeOrder.discount || 0)}</td>
                  </tr>
                )}
                <tr className="font-bold bg-gray-50 border-b border-black">
                  <td colSpan={3} className="p-1.5 border-r border-black text-right">
                    VALOR TOTAL
                  </td>
                  <td className="p-1.5 text-right">{formatBRL(activeOrderTotal)}</td>
                </tr>
                {activeOrderPaid > 0 && (
                  <>
                    <tr className="border-b border-black">
                      <td colSpan={3} className="p-1 border-r border-black text-right">
                        Já pago (sinal e recebimentos)
                      </td>
                      <td className="p-1 text-right">- {formatBRL(activeOrderPaid)}</td>
                    </tr>
                    <tr className="font-bold bg-gray-50">
                      <td colSpan={3} className="p-1.5 border-r border-black text-right">
                        SALDO RESTANTE
                      </td>
                      <td className="p-1.5 text-right">{formatBRL(activeOrderSaldo)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>

          <div className="mb-5">
            <h3 className="text-[10px] font-bold uppercase bg-gray-100 border border-black px-2 py-1">
              Termos Legais e Garantia
            </h3>
            <div className="border-x border-b border-black p-2 text-[9px] space-y-1.5 leading-snug text-justify">
              <p>
                <strong>CONDIÇÕES GERAIS:</strong> {state.cfg.condExec}
              </p>
              <p>
                <strong>TERMO DE GARANTIA:</strong>{' '}
                {activeOrder.clientSuppliedPart ? state.cfg.termoPecaCli : state.cfg.termoGarantia}
              </p>
              {activeOrderWarrantyUntil && (
                <p>
                  <strong>GARANTIA VÁLIDA ATÉ {formatDateBR(activeOrderWarrantyUntil)}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 pt-4 text-center text-[10px]">
            <div>
              <div className="h-14 flex items-end justify-center mb-1">
                {activeOrder.signatureDataUrl && (
                  <img
                    src={activeOrder.signatureDataUrl}
                    alt="Assinatura do Cliente"
                    className="max-h-14 w-auto object-contain mx-auto"
                  />
                )}
              </div>
              <div className="border-t border-black pt-1 font-bold">Assinatura do Cliente</div>
              <div>{activeOrder.clientName}</div>
              <div className="text-[9px] text-gray-600 mt-1">Data: ____/____/________</div>
            </div>
            <div>
              <div className="h-14 mb-1" />
              <div className="border-t border-black pt-1 font-bold">Assinatura do Técnico</div>
              <div>{activeOrder.technician || defaultTechName}</div>
              <div className="text-[9px] text-gray-600 mt-1">Data: ____/____/________</div>
            </div>
          </div>
          <p className="text-center text-[9px] text-gray-500 mt-3">
            Orçamento antes do serviço · MicroLab OS
          </p>
        </section>
      )}
    </>
  );
};
