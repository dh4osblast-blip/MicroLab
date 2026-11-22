import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Eraser,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from 'lucide-react';
import { OrderStatus, OrderTriage, RouteId, ServiceOrder } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  ENTRY_CHECKLIST_ITEMS,
  IMEI_TRIAGE_STATUSES,
  arredondarPreco,
  calcEffectivePricingFromConfig,
  calcGanhoDupla,
  calcOrderTotalAmount,
  calcTaxaEntregaByNeighborhood,
} from '../utils/pricing';

interface CheckInOutViewProps {
  defaultTab?: 'checkin' | 'checkout';
  onNavigate: (route: RouteId) => void;
  onSelectOrder: (orderId: number) => void;
}

type EvidenceSlotId = 'front' | 'back' | 'rails' | 'dock';

const EVIDENCE_SLOTS: { id: EvidenceSlotId; title: string; note: string }[] = [
  { id: 'front', title: 'Frontal / Display', note: 'Película riscada, vidro íntegro' },
  { id: 'back', title: 'Tampa Traseira & Câmeras', note: 'Lentes sem trincos' },
  { id: 'rails', title: 'Laterais & Parafusos', note: 'Sem sinais de violação' },
  { id: 'dock', title: 'Conector & Lacre Entrada', note: 'Oxidação negativa no pino' },
];

async function resizeEvidencePhoto800Jpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        const maxSide = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w >= h) {
            h = Math.round((h * maxSide) / w);
            w = maxSide;
          } else {
            w = Math.round((w * maxSide) / h);
            h = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponível neste navegador.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

const normStr = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const initialEntry7 = (): Record<string, 's' | 'n' | 't'> => {
  const rec: Record<string, 's' | 'n' | 't'> = {};
  ENTRY_CHECKLIST_ITEMS.forEach((item) => {
    rec[item.key] = 't';
  });
  return rec;
};

export const CheckInOutView: React.FC<CheckInOutViewProps> = ({
  defaultTab = 'checkin',
  onNavigate,
  onSelectOrder,
}) => {
  const {
    state,
    currentUser,
    isAtendente,
    canAccessRoute,
    saveServiceOrder,
    updateOrderStatus,
    receiveOrderPayment,
    setVolatileSecret,
    getVolatileSecret,
    clearVolatileSecret,
  } = useLabStore();
  const [activeTab, setActiveTab] = useState<'checkin' | 'checkout'>(defaultTab);

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
        state.labProfile.technicianName,
      ].filter((x): x is string => Boolean(x && x.trim()))
    )
  );

  // Check-in form state — LGPD: senha e padrão iniciam vazios e permanecem apenas em RAM de sessão
  const [selectedClientId, setSelectedClientId] = useState(state.clients[0]?.id || '');
  const [customClientName, setCustomClientName] = useState('');
  const [technician, setTechnician] = useState(defaultTechName);
  const [initialStatus, setInitialStatus] = useState<OrderStatus>('Orçamento');
  const [device, setDevice] = useState('');
  const [imei, setImei] = useState('');
  const [accessories, setAccessories] = useState('');
  const [passcode, setPasscode] = useState('');
  const [patternNodes, setPatternNodes] = useState<number[]>([]);
  const [issue, setIssue] = useState('');

  // Precificação conectada a pricing.ts
  const [serviceCatalogId, setServiceCatalogId] = useState('');
  const [partId, setPartId] = useState('');
  const [partCost, setPartCost] = useState(0);
  const [partFreight, setPartFreight] = useState(0);
  const [consumables, setConsumables] = useState(2);
  const [estimatedHours, setEstimatedHours] = useState(1.0);
  const [clientSuppliedPart, setClientSuppliedPart] = useState(false);
  const [servicePrice, setServicePrice] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(() => {
    const cli = state.clients[0];
    return cli ? calcTaxaEntregaByNeighborhood(cli.neighborhood, state.cfg) : 0;
  });
  const [signalPaid, setSignalPaid] = useState(0);

  // Checklist 7 itens & Triagem IMEI/ESD
  const [entry7, setEntry7] = useState<Record<string, 's' | 'n' | 't'>>(initialEntry7);
  const [triage, setTriage] = useState<OrderTriage>({ imeiSt: '' });

  const [evidencePhotos, setEvidencePhotos] = useState<Partial<Record<EvidenceSlotId, string>>>({});
  const [evidenceError, setEvidenceError] = useState('');
  const [lgpdAccepted, setLgpdAccepted] = useState(true);
  const [hasSigned, setHasSigned] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<ServiceOrder | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  const selectedClient = state.clients.find((c) => c.id === selectedClientId);
  const readyForPickup = state.orders.filter(
    (o) => o.status === 'Pronto' || o.status === 'Pronto Retirada'
  );

  const eff = useMemo(
    () => calcEffectivePricingFromConfig(state.cfg, state.fixos),
    [state.cfg, state.fixos]
  );

  const quotePreview = useMemo(() => {
    const taxa = eff.totalRetentionPct / 100;
    const margem = eff.profitMarginPct / 100;
    const dupla = calcGanhoDupla({
      hourlyRate: eff.hourlyRate,
      indirectHourlyRate: eff.indirectHourlyRate,
      taxaTotalRate: taxa,
      hours: estimatedHours,
      preco: servicePrice,
      peca: partCost,
      pcli: clientSuppliedPart,
      fretePeca: partFreight,
      cons: consumables,
      frete: deliveryFee,
    });
    const floor = dupla.cd / Math.max(0.05, 1 - taxa);
    const denom = 1 - taxa - margem;
    const exact = denom > 0.02 ? dupla.cd / denom : 0;
    const suggested = exact > 0 ? arredondarPreco(exact, state.cfg.arred) : 0;
    return { dupla, floor, suggested, totalOs: servicePrice + deliveryFee };
  }, [
    eff,
    estimatedHours,
    servicePrice,
    partCost,
    clientSuppliedPart,
    partFreight,
    consumables,
    deliveryFee,
    state.cfg.arred,
  ]);

  const togglePatternNode = (node: number) => {
    setPatternNodes((prev) =>
      prev.includes(node) ? prev.filter((n) => n !== node) : [...prev, node]
    );
  };

  const handleMarkAllOk = () => {
    const next: Record<string, 's' | 'n' | 't'> = {};
    ENTRY_CHECKLIST_ITEMS.forEach((item) => {
      next[item.key] = 's';
    });
    setEntry7(next);
  };

  // Canvas signature drawing helpers
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    setHasSigned(true);
    const pt = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#091b36';
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSigned(false);
  };

  const handleEvidenceFileChange = async (
    slotId: EvidenceSlotId,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEvidenceError('');
    try {
      const resizedDataUrl = await resizeEvidencePhoto800Jpeg(file);
      setEvidencePhotos((prev) => ({ ...prev, [slotId]: resizedDataUrl }));
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : 'Não foi possível processar a foto.');
    }
  };

  const removeEvidencePhoto = (slotId: EvidenceSlotId) => {
    setEvidencePhotos((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  };

  const handleSubmitCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lgpdAccepted) return;
    const clientName = customClientName.trim() || selectedClient?.name || 'Cliente Balcão';
    const clientPhone = selectedClient?.phone || 'Não informado';
    const clientCpf = selectedClient?.cpf || '000.***.***-00';

    const cleanPin = passcode.trim();
    const cleanPattern = [...patternNodes];
    const hasSecret = Boolean(cleanPin || cleanPattern.length > 0);
    const cleanEvidencePhotos: Partial<Record<EvidenceSlotId, string>> = {};
    (Object.keys(evidencePhotos) as EvidenceSlotId[]).forEach((slotKey) => {
      const val = evidencePhotos[slotKey];
      if (val) cleanEvidencePhotos[slotKey] = val;
    });
    const evidenceCount = Object.keys(cleanEvidencePhotos).length;
    const signatureDataUrl =
      hasSigned && canvasRef.current ? canvasRef.current.toDataURL('image/png') : undefined;

    const newOs = saveServiceOrder({
      data: {
        clientId: selectedClient?.id || `cli-${Date.now()}`,
        clientName,
        clientPhone,
        clientCpf,
        model: device.trim() || 'Smartphone',
        device: device.trim() || 'Smartphone',
        deviceType: device.toLowerCase().includes('ipad')
          ? 'tablet'
          : device.toLowerCase().includes('watch')
          ? 'watch'
          : 'smartphone',
        imei: imei.trim() || 'Não informado',
        hasPasscode: hasSecret,
        accessories: accessories
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        evidenceCount,
        evidencePhotos: evidenceCount > 0 ? cleanEvidencePhotos : undefined,
        signatureDataUrl,
        entryChecklist7: { ...entry7 },
        triage: { ...triage },
        issue: issue.trim() || 'Análise de bancada solicitada',
        notes: 'Check-in registrado com inspeção visual e assinatura digital do cliente.',
        diagnosis: 'Check-in registrado com inspeção visual e assinatura digital do cliente.',
        status: initialStatus,
        priority: 'Normal',
        technician: technician.trim() || defaultTechName,
        serviceCatalogId: serviceCatalogId || undefined,
        partId: clientSuppliedPart ? '' : partId || undefined,
        partCost: clientSuppliedPart ? 0 : partCost,
        partFreight: clientSuppliedPart ? 0 : partFreight,
        consumables,
        clientSuppliedPart,
        estimatedHours,
        servicePrice,
        partsPrice: 0,
        deliveryFee,
        signalPaid,
        checklist: {
          faceId: entry7.tela === 's' ? 'OK' : 'Não Testa',
          cameras: entry7.cam === 's' ? 'OK 100%' : 'Verificar',
          battery: triage.bat ? 'Inchada (Cuidado)' : 'Triagem DC',
          chassis: entry7.marcas === 's' ? 'Com marcas' : 'Inspecionado',
        },
      },
      volatileSecret: hasSecret
        ? {
            passcode: cleanPin || undefined,
            patternNodes: cleanPattern.length > 0 ? cleanPattern : undefined,
          }
        : undefined,
    });

    if (hasSecret) {
      setVolatileSecret(newOs.id, {
        passcode: cleanPin || undefined,
        patternNodes: cleanPattern.length > 0 ? cleanPattern : undefined,
      });
    }

    // Limpa os campos do formulário imediatamente após gerar a OS
    setPasscode('');
    setPatternNodes([]);
    setDevice('');
    setImei('');
    setIssue('');
    setSignalPaid(0);
    setEvidencePhotos({});
    setEvidenceError('');
    clearSignature();
    setCreatedOrder(newOs);
  };

  const handleReleaseCheckout = (order: ServiceOrder) => {
    clearVolatileSecret(order.id);
    const total = calcOrderTotalAmount(order);
    const saldo = Math.max(0, Math.round((total - (order.paidAmount || 0)) * 100) / 100);
    if (saldo > 0.004) {
      receiveOrderPayment(order.id, saldo, state.cfg.formas[0] || 'Pix');
    }
    updateOrderStatus(order.id, 'Entregue');
  };

  const createdVolatileSecret = createdOrder ? getVolatileSecret(createdOrder.id) : undefined;

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">
            Check-in / Check-out &amp; Protocolo Digital LGPD
          </h1>
          <p className="text-xs text-[#727784]">
            Precificação oficial conectada, triagem IMEI/ESD, checklist 7 itens e senha volátil em RAM
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#D9E0EC] self-start">
          <button
            type="button"
            onClick={() => setActiveTab('checkin')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'checkin' ? 'bg-[#0056ab] text-white' : 'text-[#414752] hover:text-[#091b36]'
            }`}
          >
            Check-in (Nova OS)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('checkout')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'checkout' ? 'bg-[#0056ab] text-white' : 'text-[#414752] hover:text-[#091b36]'
            }`}
          >
            Check-out ({readyForPickup.length} prontas)
          </button>
        </div>
      </div>

      {createdOrder && activeTab === 'checkin' && (
        <div className="rounded-2xl bg-[#DCFCE7] border border-[#16A34A]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[#16A34A]">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-[#091b36]">
                OS {createdOrder.code} gerada! Campos sensíveis do formulário limpos com segurança LGPD.
              </p>
              <p className="text-[11px] text-[#414752]">
                {createdOrder.clientName} · {createdOrder.device} · Total{' '}
                <strong>{formatBRL(calcOrderTotalAmount(createdOrder))}</strong>
                {createdVolatileSecret && (
                  <span className="ml-2 font-mono text-[#0056ab]">
                    (Credencial temporária em RAM desta aba · apagada no check-out ou F5)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {createdVolatileSecret && (
              <button
                type="button"
                onClick={() => clearVolatileSecret(createdOrder.id)}
                className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar RAM</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onSelectOrder(createdOrder.id);
                onNavigate('ordens-de-servico');
              }}
              className="rounded-xl bg-[#16A34A] text-white px-3.5 py-2 text-xs font-semibold hover:bg-[#15803d] whitespace-nowrap cursor-pointer"
            >
              Abrir OS {createdOrder.code} →
            </button>
          </div>
        </div>
      )}

      {activeTab === 'checkin' ? (
        <form onSubmit={handleSubmitCheckIn} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
              <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#0056ab]" />
                <span>1. Dados do Cliente &amp; Equipamento</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Cliente Cadastrado
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedClientId(nextId);
                      const cli = state.clients.find((c) => c.id === nextId);
                      if (cli) {
                        setDeliveryFee(calcTaxaEntregaByNeighborhood(cli.neighborhood, state.cfg));
                      } else {
                        setDeliveryFee(0);
                      }
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  >
                    <option value="">Cliente Avulso / Balcão</option>
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Situação Inicial
                  </label>
                  <select
                    value={initialStatus}
                    onChange={(e) => setInitialStatus(e.target.value as OrderStatus)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36]"
                  >
                    <option value="Orçamento">Orçamento</option>
                    <option value="Aprovado">Aprovado</option>
                    <option value="Aguardando Peça">Aguardando Peça</option>
                    <option value="Em reparo">Em reparo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    Nome Avulso (opcional)
                  </label>
                  <input
                    value={customClientName}
                    onChange={(e) => setCustomClientName(e.target.value)}
                    placeholder="Sobrescrever cliente..."
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Modelo do Aparelho *</label>
                  <input
                    required
                    value={device}
                    onChange={(e) => setDevice(e.target.value)}
                    placeholder="Ex: Galaxy A14 / iPhone 13"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Técnico</label>
                  <select
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  >
                    {techOptions.map((techName) => (
                      <option key={techName} value={techName}>
                        {techName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">IMEI / Serial</label>
                  <input
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    placeholder="*#06#"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Acessórios Deixados</label>
                  <input
                    value={accessories}
                    onChange={(e) => setAccessories(e.target.value)}
                    placeholder="Chip, capa..."
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                    PIN / Senha (Volátil RAM)
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Não será persistida"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/25 px-3 py-2 flex items-start gap-2 text-[11px] text-[#414752]">
                <ShieldAlert className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                <span>
                  <strong>Proteção LGPD:</strong> O PIN e o padrão gráfico 3×3 ficam{' '}
                  <strong>apenas na memória temporária da sessão</strong> — nunca são salvos no{' '}
                  <code>localStorage</code>, backup JSON, impressão A4 ou Firebase, e são apagados ao concluir o atendimento ou recarregar.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Queixa Principal *</label>
                <textarea
                  required
                  rows={2}
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="Descreva o defeito relatado pelo cliente..."
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                />
              </div>
            </div>

            {/* Precificação Conectada */}
            <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
              <h2 className="text-sm font-bold text-[#091b36]">2. Precificação Conectada ao Catálogo</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Serviço do catálogo</label>
                  <select
                    value={serviceCatalogId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setServiceCatalogId(id);
                      const svc = state.servicos.find((s) => s.id === id);
                      if (svc) {
                        setEstimatedHours(svc.tempo || 1);
                        setConsumables(svc.cons ?? 2);
                        const mp = svc.peca
                          ? state.parts.find((p) => normStr(p.name) === normStr(svc.peca))
                          : undefined;
                        if (mp && !clientSuppliedPart) {
                          setPartId(mp.id);
                          setPartCost(mp.costPrice);
                        }
                      }
                    }}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                  >
                    <option value="">— Selecionar —</option>
                    {state.servicos.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </div>
                {!isAtendente && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[#414752] mb-1">Peça do estoque</label>
                    <select
                      value={partId}
                      disabled={clientSuppliedPart}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setPartId(pid);
                        const pt = state.parts.find((p) => p.id === pid);
                        if (pt && !clientSuppliedPart) setPartCost(pt.costPrice);
                      }}
                      className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs disabled:opacity-50"
                    >
                      <option value="">— Opcional —</option>
                      {state.parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.stock})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Tempo estimado (h)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={estimatedHours}
                    onChange={(e) => setEstimatedHours(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {!isAtendente && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#414752] mb-1">Custo Peça (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={clientSuppliedPart}
                        value={partCost}
                        onChange={(e) => setPartCost(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#414752] mb-1">Frete Peça (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={clientSuppliedPart}
                        value={partFreight}
                        onChange={(e) => setPartFreight(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#414752] mb-1">Consumíveis (R$)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={consumables}
                        onChange={(e) => setConsumables(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Preço Serviço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-[#0056ab] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Entrega (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Sinal Pago (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={signalPaid}
                    onChange={(e) => setSignalPaid(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clientSuppliedPart}
                    onChange={(e) => {
                      const ck = e.target.checked;
                      setClientSuppliedPart(ck);
                      if (ck) {
                        setPartCost(0);
                        setPartFreight(0);
                        setPartId('');
                      }
                    }}
                  />
                  <span>Peça fornecida pelo cliente (garantia só do serviço)</span>
                </label>

                {quotePreview.suggested > 0 && (
                  <button
                    type="button"
                    onClick={() => setServicePrice(quotePreview.suggested)}
                    className="rounded-lg bg-[#0056ab] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1b6fd1] cursor-pointer"
                  >
                    Usar Sugerido {formatBRL(quotePreview.suggested)}
                  </button>
                )}
              </div>

              {!isAtendente && quotePreview.dupla.cd > 0 && (
                <div className="rounded-xl bg-[#F3F6FB] p-2.5 border border-[#D9E0EC] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#414752]">
                  <span>
                    Custo direto <strong>{formatBRL(quotePreview.dupla.cd)}</strong> · Piso{' '}
                    <strong>{formatBRL(quotePreview.floor)}</strong>
                  </span>
                  {servicePrice > 0 && (
                    <span className={quotePreview.dupla.lu >= 0 ? 'text-[#16A34A] font-bold' : 'text-[#DC2626] font-bold'}>
                      Lucro {formatBRL(quotePreview.dupla.lu)} · Ganho téc. {formatBRL(quotePreview.dupla.ganho)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Hardware Checklist (7 itens) + Pattern Lock */}
            <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-8 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#091b36]">3. Checklist de Entrada (7 itens)</h2>
                  <button
                    type="button"
                    onClick={handleMarkAllOk}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0056ab] hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Marcar Tudo Sim</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {ENTRY_CHECKLIST_ITEMS.map((item) => {
                    const val = entry7[item.key] || 't';
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#F3F6FB] text-xs"
                      >
                        <span className="font-medium text-[#091b36] truncate">{item.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {(
                            [
                              ['s', 'Sim'],
                              ['n', 'Não'],
                              ['t', 'N/T'],
                            ] as const
                          ).map(([code, lbl]) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => setEntry7((p) => ({ ...p, [item.key]: code }))}
                              className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
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
              </div>

              {/* 3x3 Pattern Grid (Volatile Only) */}
              <div className="md:col-span-4 flex flex-col items-center justify-center rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[#414752]">
                    <Lock className="w-3.5 h-3.5 text-[#0056ab]" />
                    <span>Padrão (RAM)</span>
                  </span>
                  {patternNodes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPatternNodes([])}
                      className="text-[10px] font-semibold text-[#DC2626] hover:underline cursor-pointer"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((node) => {
                    const orderIdx = patternNodes.indexOf(node);
                    const active = orderIdx >= 0;
                    return (
                      <button
                        key={node}
                        type="button"
                        onClick={() => togglePatternNode(node)}
                        className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#0056ab] text-white'
                            : 'bg-white border border-[#D9E0EC] text-[#727784]'
                        }`}
                      >
                        {active ? orderIdx + 1 : '•'}
                      </button>
                    );
                  })}
                </div>
                <span className="mt-2 text-[10px] font-mono text-[#727784]">
                  Seq: {patternNodes.length ? patternNodes.join('→') : 'Não informada'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-5 space-y-4">
            {/* Triagem IMEI & Segurança */}
            <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
              <h2 className="text-sm font-bold text-[#091b36]">4. Triagem IMEI &amp; Segurança ESD</h2>
              <div className="flex flex-wrap gap-1.5">
                {[...IMEI_TRIAGE_STATUSES, { value: '' as const, label: 'Não consultado' }].map((opt) => (
                  <button
                    key={opt.value || 'empty'}
                    type="button"
                    onClick={() => setTriage((p) => ({ ...p, imeiSt: opt.value }))}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                      (triage.imeiSt || '') === opt.value
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(triage.bat)}
                    onChange={(e) => setTriage((p) => ({ ...p, bat: e.target.checked }))}
                  />
                  <span>Bateria inchada</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(triage.oxi)}
                    onChange={(e) => setTriage((p) => ({ ...p, oxi: e.target.checked }))}
                  />
                  <span>Sinais de oxidação</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={Boolean(triage.esd)}
                    onChange={(e) => setTriage((p) => ({ ...p, esd: e.target.checked }))}
                  />
                  <span>Proteção ESD verificada (pulseira/manta antiestática)</span>
                </label>
              </div>
              {triage.bat && (
                <div className="rounded-lg bg-[#FEE2E2] p-2 text-[11px] font-bold text-[#DC2626]">
                  PROIBIDO aplicar choque de ativação na fonte (5,2V) ou usar espátula metálica.
                </div>
              )}
              {triage.oxi && (
                <div className="rounded-lg bg-[#FFF7E6] p-2 text-[11px] font-semibold text-[#D97706]">
                  Remover periféricos e isolar microfones com fita de alumínio antes do ultrassom.
                </div>
              )}
            </div>

            {/* Visual Evidence 4-Slot Real Photo Capture */}
            <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[#091b36] flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#0056ab]" />
                  <span>5. Registro Visual de Evidências (4 Ângulos)</span>
                </h2>
                <span className="text-[11px] font-semibold text-[#0056ab] tabular-nums">
                  {Object.keys(evidencePhotos).length}/4 fotos
                </span>
              </div>
              {evidenceError && (
                <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3 py-2 text-[11px] font-semibold text-[#DC2626]">
                  {evidenceError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                {EVIDENCE_SLOTS.map((slot) => {
                  const photo = evidencePhotos[slot.id];
                  const inputId = `checkin-evidence-${slot.id}`;
                  return (
                    <div
                      key={slot.id}
                      className={`p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2 ${
                        photo
                          ? 'bg-[#F3F6FB] border-[#0056ab]/35'
                          : 'bg-white border-dashed border-[#D9E0EC]'
                      }`}
                    >
                      <input
                        id={inputId}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => void handleEvidenceFileChange(slot.id, e)}
                        className="hidden"
                      />
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Smartphone className="w-4 h-4 text-[#0056ab]" />
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              photo ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#F3F6FB] text-[#727784]'
                            }`}
                          >
                            {photo ? 'CAPTURADA' : 'PENDENTE'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#091b36]">{slot.title}</p>
                        <p className="text-[10px] text-[#727784] mt-0.5">{slot.note}</p>
                      </div>

                      {photo ? (
                        <div className="space-y-1.5">
                          <img
                            src={photo}
                            alt={slot.title}
                            className="w-full h-24 object-cover rounded-lg border border-[#D9E0EC]"
                          />
                          <div className="flex items-center gap-1.5">
                            <label
                              htmlFor={inputId}
                              className="flex-1 text-center rounded-lg border border-[#D9E0EC] bg-white py-1 text-[10px] font-semibold text-[#0056ab] hover:bg-[#EAF2FD] cursor-pointer"
                            >
                              Trocar foto
                            </label>
                            <button
                              type="button"
                              onClick={() => removeEvidencePhoto(slot.id)}
                              title="Remover foto"
                              className="p-1 rounded-lg border border-[#DC2626]/30 bg-white text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label
                          htmlFor={inputId}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#0056ab]/30 bg-[#EAF2FD]/70 py-1.5 text-[11px] font-semibold text-[#0056ab] hover:bg-[#EAF2FD] cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Fotografar / Anexar</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {canAccessRoute('fonte') && (
              <div className="rounded-2xl bg-[#0B0F17] text-white p-4 border border-[#2A3954] flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#06B6D4]">
                    <Zap className="w-4 h-4" />
                    <span>Pré-leitura na Fonte ZK-SK150C</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Conecte via Bluetooth/USB na aba Fonte ZK para gravar a leitura real nesta OS após o check-in.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('fonte')}
                  className="font-mono text-[11px] font-bold text-[#0B0F17] bg-[#06B6D4] px-3 py-1.5 rounded-lg hover:bg-[#22d3ee] shrink-0 cursor-pointer"
                >
                  Abrir Fonte
                </button>
              </div>
            )}

            {/* Digital Signature Canvas */}
            <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#091b36]">6. Assinatura Digital do Cliente</h2>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#727784] hover:text-[#DC2626] cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Limpar</span>
                </button>
              </div>
              <div className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] overflow-hidden relative">
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={120}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="w-full h-28 touch-none cursor-crosshair block"
                />
                {!hasSigned && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#727784]/70">
                    Assine com o dedo ou mouse aqui
                  </span>
                )}
              </div>

              <label className="flex items-start gap-2 text-[11px] text-[#414752] cursor-pointer">
                <input
                  type="checkbox"
                  checked={lgpdAccepted}
                  onChange={(e) => setLgpdAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-[#D9E0EC]"
                />
                <span>
                  Autorizo a inspeção técnica e tratamento de dados conforme LGPD e termo de garantia legal de{' '}
                  {state.cfg.garantiaDias} dias (CDC).
                </span>
              </label>

              <div className="rounded-xl bg-[#EAF2FD] px-3 py-2 flex items-center justify-between text-xs font-bold text-[#091b36]">
                <span>Total Previsto OS</span>
                <span className="text-sm text-[#0056ab] tabular-nums">{formatBRL(quotePreview.totalOs)}</span>
              </div>

              <button
                type="submit"
                disabled={!lgpdAccepted}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0056ab] py-3 text-xs font-bold text-white hover:bg-[#1b6fd1] transition-colors cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Concluir Check-in e Gerar OS</span>
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* Check-out Tab */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {readyForPickup.map((order) => {
            const total = calcOrderTotalAmount(order);
            const paid = Number(order.paidAmount) || 0;
            const saldo = Math.max(0, Math.round((total - paid) * 100) / 100);
            return (
              <div
                key={order.id}
                className="rounded-2xl bg-white p-5 border border-[#D9E0EC] flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#0056ab] tabular-nums">{order.code}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A]">
                      Pronto para Retirada
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#091b36]">{order.device}</h3>
                  <p className="text-xs text-[#414752]">
                    {order.clientName} · {order.clientPhone}
                  </p>
                  <p className="text-xs text-[#727784] bg-[#F3F6FB] p-2.5 rounded-xl border border-[#D9E0EC]">
                    {order.notes || order.diagnosis}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-[#16A34A] font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    <span>CQ Aprovado · Garantia {state.cfg.garantiaDias} dias · RAM limpa na entrega</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-[#D9E0EC] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#727784] block">
                      {paid > 0 ? `Saldo (Total ${formatBRL(total)})` : 'Total a Receber'}
                    </span>
                    <span className="text-base font-bold text-[#091b36] tabular-nums">
                      {saldo > 0.004 ? formatBRL(saldo) : 'Quitado'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReleaseCheckout(order)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#15803d] cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Liberar Aparelho</span>
                  </button>
                </div>
              </div>
            );
          })}
          {readyForPickup.length === 0 && (
            <div className="col-span-full rounded-2xl bg-white p-10 border border-[#D9E0EC] text-center text-xs text-[#727784]">
              Todas as Ordens prontas já foram entregues!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
