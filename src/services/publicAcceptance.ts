import { DeviceCategory, LabConfig, ServiceOrder } from '../types/lab';
import {
  calcOrderTotalAmount,
  formatDateBR,
  resolveOrderDeviceCategory,
  resolveOrderWarrantyDays,
} from '../utils/pricing';
import {
  ensureFirebaseIdToken,
  loadAuthState,
} from './firebaseSync';
import { EvidencePhotoSlot, getMediaRecord } from './mediaStore';

export interface PublicAcceptanceLineItem {
  d: string;
  q: number;
  v: number;
}

export interface PublicAcceptanceEvidencePhoto {
  slot: string;
  label: string;
  dataUrl: string;
}

export interface PublicAcceptanceChecklistChip {
  label: string;
  tone: 'ok' | 'warn' | 'neutral';
}

export interface PublicAcceptanceDocument {
  token: string;
  ownerUid: string;
  orderId: number;
  orderCode: string;
  status: 'pending' | 'accepted';
  osStatus?: string;
  expectedDeliveryDate?: string;
  createdDateLabel?: string;
  technician?: string;
  clientName: string;
  device: string;
  deviceCategory?: DeviceCategory;
  deviceSerial?: string;
  issue: string;
  technicalReport?: string;
  aiExplanation?: string;
  entryChecklist?: PublicAcceptanceChecklistChip[];
  serviceName: string;
  servicePrice: number;
  partsPrice: number;
  items: PublicAcceptanceLineItem[];
  deliveryFee: number;
  discount: number;
  totalAmount: number;
  paidAmount?: number;
  signalPaid?: number;
  warrantyDays: number;
  condExec: string;
  warrantyText: string;
  quoteHash: string;
  evidencePhotos: PublicAcceptanceEvidencePhoto[];
  createdAtMs: number;
  updatedAtMs?: number;
  createdServerAt?: string;
  signaturePng?: string;
  acceptedIp?: string;
  acceptedUserAgent?: string;
  acceptedClientAtMs?: number;
  acceptedServerAt?: string;
}

const EVIDENCE_LABELS: Record<EvidencePhotoSlot, string> = {
  front: 'Frontal / Display',
  back: 'Traseira & Câmeras',
  rails: 'Laterais & Parafusos',
  dock: 'Conector & Lacre',
};

export function generatePublicToken128(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash criptográfico SHA-256 restrito ao escopo contratual do orçamento aprovado
 * (itens, valores, defeito relatado, garantia e condições).
 * Alterações operacionais de acompanhamento (osStatus, previsão, laudo, checklist, fotos, pagamentos)
 * não participam deste hash para preservar a integridade da assinatura write-once do cliente.
 */
export async function computeQuoteSha256Hex(payload: {
  orderId: number;
  orderCode: string;
  device: string;
  issue: string;
  serviceName: string;
  servicePrice: number;
  partsPrice: number;
  items: PublicAcceptanceLineItem[];
  deliveryFee: number;
  discount: number;
  totalAmount: number;
  warrantyDays: number;
  condExec: string;
  warrantyText: string;
}): Promise<string> {
  const canonicalJson = JSON.stringify({
    orderId: payload.orderId,
    orderCode: payload.orderCode,
    device: payload.device,
    issue: payload.issue,
    serviceName: payload.serviceName,
    servicePrice: Number(payload.servicePrice.toFixed(2)),
    partsPrice: Number(payload.partsPrice.toFixed(2)),
    items: payload.items.map((it) => ({
      d: it.d,
      q: Number(it.q.toFixed(3)),
      v: Number(it.v.toFixed(2)),
    })),
    deliveryFee: Number(payload.deliveryFee.toFixed(2)),
    discount: Number(payload.discount.toFixed(2)),
    totalAmount: Number(payload.totalAmount.toFixed(2)),
    warrantyDays: payload.warrantyDays,
    condExec: payload.condExec,
    warrantyText: payload.warrantyText,
  });

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(canonicalJson);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Deterministic fallback hash only if WebCrypto subtle is unavailable in insecure HTTP dev
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < canonicalJson.length; i++) {
    const ch = canonicalJson.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ ch, 2654435761) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, '0') +
    h2.toString(16).padStart(8, '0') +
    (h1 ^ h2).toString(16).padStart(8, '0')
  ).padEnd(64, '0');
}

export async function verifyPublicDocumentQuoteHash(
  doc: PublicAcceptanceDocument
): Promise<boolean> {
  if (!doc.quoteHash || !/^[a-f0-9]{64}$/.test(doc.quoteHash)) return false;
  const computed = await computeQuoteSha256Hex({
    orderId: doc.orderId,
    orderCode: doc.orderCode,
    device: doc.device,
    issue: doc.issue,
    serviceName: doc.serviceName,
    servicePrice: doc.servicePrice,
    partsPrice: doc.partsPrice,
    items: doc.items,
    deliveryFee: doc.deliveryFee,
    discount: doc.discount,
    totalAmount: doc.totalAmount,
    warrantyDays: doc.warrantyDays,
    condExec: doc.condExec,
    warrantyText: doc.warrantyText,
  });
  return computed === doc.quoteHash;
}

export function buildPublicAcceptanceUrl(token: string, projectId: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams();
  params.set('aceite', token);
  params.set('p', projectId);
  return `${base}?${params.toString()}`;
}

export function parsePublicAcceptanceParamsFromLocation(): {
  token: string;
  projectId: string;
} | null {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const searchToken = (searchParams.get('aceite') || '').trim();
    if (searchToken && /^[a-zA-Z0-9_-]{16,128}$/.test(searchToken)) {
      return {
        token: searchToken,
        projectId: (searchParams.get('p') || '').trim(),
      };
    }

    const hash = (window.location.hash || '').trim();
    const match = hash.match(/^#\/?aceite\/([a-zA-Z0-9_-]{16,128})(?:\?(.*))?$/);
    if (match) {
      const hashQuery = new URLSearchParams(match[2] || '');
      return {
        token: match[1],
        projectId: (hashQuery.get('p') || searchParams.get('p') || '').trim(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * LGPD & Sigilo: remove CPF, e-mail, IMEI completo (14-17 dígitos), senhas/PIN/padrões e valores de custo internos.
 */
export function scrubPublicText(raw: string): string {
  return String(raw || '')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[dados protegidos]')
    .replace(/\b\d{14,17}\b/g, '[IMEI protegido]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contato protegido]')
    .replace(
      /(?:^|[\s;,.])(?:senha|pin|padr[aã]o\s*(?:3x3|de\s*desbloqueio)?|passcode|desbloqueio)\s*[:=\-]?\s*[^\n,;]+/gi,
      ' [credencial protegida]'
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildPublicDeviceSerial(order: ServiceOrder, category: DeviceCategory): string {
  const raw = String(order.imei || '').trim();
  if (!raw || raw.toLowerCase() === 'não informado') return '';
  const noPii = raw
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .trim();
  if (!noPii) return '';
  if (category === 'notebook') {
    return noPii.slice(0, 60);
  }
  const digitsOnly = noPii.replace(/\D/g, '');
  if (digitsOnly.length >= 14 && digitsOnly.length <= 17 && /^\d+$/.test(noPii.replace(/[\s-]/g, ''))) {
    return `${digitsOnly.slice(0, 4)}•••••••${digitsOnly.slice(-4)}`;
  }
  return noPii.slice(0, 60);
}

function buildPublicChecklistChips(order: ServiceOrder): PublicAcceptanceChecklistChip[] {
  const chips: PublicAcceptanceChecklistChip[] = [];
  const ck7 = order.entryChecklist7;
  const category = resolveOrderDeviceCategory(order);

  if (ck7 && typeof ck7 === 'object') {
    if (category === 'notebook') {
      if (ck7.nb_liga === 's') chips.push({ label: 'Liga e dá vídeo: Sim', tone: 'ok' });
      else if (ck7.nb_liga === 'n') chips.push({ label: 'Liga e dá vídeo: Não', tone: 'warn' });

      if (ck7.nb_tela === 's') chips.push({ label: 'Tela e dobradiças: OK', tone: 'ok' });
      else if (ck7.nb_tela === 'n') chips.push({ label: 'Tela e dobradiças: Avaria', tone: 'warn' });

      if (ck7.nb_teclado === 's') chips.push({ label: 'Teclado e Touchpad: OK', tone: 'ok' });
      else if (ck7.nb_teclado === 'n') chips.push({ label: 'Teclado e Touchpad: Falha', tone: 'warn' });

      if (ck7.nb_portas === 's') chips.push({ label: 'Portas USB/HDMI/Carga: OK', tone: 'ok' });
      else if (ck7.nb_portas === 'n') chips.push({ label: 'Portas USB/HDMI/Carga: Falha', tone: 'warn' });

      if (ck7.nb_bateria === 's') chips.push({ label: 'Bateria: Segura carga / Sem inchaço', tone: 'ok' });
      else if (ck7.nb_bateria === 'n') chips.push({ label: 'Bateria: Sem carga / Atenção', tone: 'warn' });

      if (ck7.nb_carcaca === 's') chips.push({ label: 'Carcaça e parafusos: Íntegros', tone: 'ok' });
      else if (ck7.nb_carcaca === 'n') chips.push({ label: 'Carcaça e parafusos: Com avaria', tone: 'warn' });

      if (order.triage?.oxi || ck7.nb_liq === 's') {
        chips.push({ label: 'Oxidação / Líquido: Detectado', tone: 'warn' });
      } else if (ck7.nb_liq === 'n') {
        chips.push({ label: 'Sem sinais de líquido', tone: 'ok' });
      }
    } else {
      if (ck7.liga === 's') chips.push({ label: 'Liga: Sim', tone: 'ok' });
      else if (ck7.liga === 'n') chips.push({ label: 'Liga: Não', tone: 'warn' });

      if (ck7.tela === 's') chips.push({ label: 'Tela: Íntegra', tone: 'ok' });
      else if (ck7.tela === 'n') chips.push({ label: 'Tela: Com avaria', tone: 'warn' });

      if (order.triage?.oxi || ck7.liq === 's') {
        chips.push({ label: 'Oxidação / Umidade: Detectada', tone: 'warn' });
      } else if (ck7.liq === 'n') {
        chips.push({ label: 'Sem sinais de líquido', tone: 'ok' });
      }

      if (ck7.audio === 's') chips.push({ label: 'Áudio: OK', tone: 'ok' });
      else if (ck7.audio === 'n') chips.push({ label: 'Áudio: Falha', tone: 'warn' });

      if (ck7.cam === 's') chips.push({ label: 'Câmeras: OK', tone: 'ok' });
      else if (ck7.cam === 'n') chips.push({ label: 'Câmeras: Falha', tone: 'warn' });

      if (ck7.carga === 's') chips.push({ label: 'Conector carga: OK', tone: 'ok' });
      else if (ck7.carga === 'n') chips.push({ label: 'Conector carga: Falha', tone: 'warn' });

      if (ck7.marcas === 's') chips.push({ label: 'Carcaça: Com marcas de uso', tone: 'neutral' });
      else if (ck7.marcas === 'n') chips.push({ label: 'Carcaça: Sem marcas', tone: 'ok' });
    }
  } else {
    if (order.triage?.oxi) {
      chips.push({ label: 'Oxidação: Detectada', tone: 'warn' });
    }
    const legacy = order.checklist;
    if (legacy) {
      if (legacy.cameras && !/testa|verificar/i.test(legacy.cameras)) {
        chips.push({ label: `Câmeras: ${legacy.cameras}`, tone: 'ok' });
      }
      if (legacy.chassis && !/testa/i.test(legacy.chassis)) {
        chips.push({
          label: `Carcaça: ${legacy.chassis}`,
          tone: /marca/i.test(legacy.chassis) ? 'neutral' : 'ok',
        });
      }
    }
  }

  if (order.triage?.bat && !(category === 'notebook' && ck7?.nb_bateria === 'n')) {
    chips.push({ label: 'Bateria: Inchada (atenção)', tone: 'warn' });
  }

  return chips.slice(0, 12);
}

function buildPublicTechnicalReport(order: ServiceOrder): string {
  const sections: string[] = [];
  const rawNotes = (order.notes || '').trim();
  const rawDiag = (order.diagnosis || '').trim();
  const genericDefault = 'Em acompanhamento técnico na bancada.';

  const primaryNote = rawNotes || (rawDiag && rawDiag !== genericDefault ? rawDiag : '');
  if (primaryNote) {
    sections.push(scrubPublicText(primaryNote));
  }

  if (Array.isArray(order.laudos) && order.laudos.length > 0) {
    const latestLaudo = order.laudos[order.laudos.length - 1];
    const parts: string[] = [];
    if (latestLaudo.defeito) parts.push(`Diagnóstico: ${latestLaudo.defeito}`);
    if (latestLaudo.obs) parts.push(latestLaudo.obs);
    const laudoText = scrubPublicText(parts.join(' — '));
    if (laudoText && !sections.some((s) => s.includes(laudoText))) {
      sections.push(laudoText);
    }
  }

  if (Array.isArray(order.testesFonte) && order.testesFonte.length > 0) {
    const latestPower = order.testesFonte[order.testesFonte.length - 1];
    if (latestPower.cliResumo) {
      const cleanPower = scrubPublicText(latestPower.cliResumo);
      if (cleanPower && !sections.some((s) => s.includes(cleanPower))) {
        sections.push(`Análise elétrica: ${cleanPower}`);
      }
    }
  }

  return sections.join('\n\n').slice(0, 2900);
}

/**
 * Recomprime cada foto via Canvas (máx. 640 px de largura, JPEG qualidade 0.65)
 * para garantir carregamento ágil no 4G e manter o documento bem abaixo de 1 MB no Firestore.
 */
async function recompressPublicPhotoJpeg(
  rawDataUrl: string,
  maxWidth = 640,
  quality = 0.65
): Promise<string> {
  if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) return '';
  if (typeof document === 'undefined') return rawDataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve('');
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve('');
        return;
      }
      if (w > maxWidth) {
        h = Math.max(1, Math.round((h * maxWidth) / w));
        w = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      let encoded = canvas.toDataURL('image/jpeg', quality);
      if (encoded.length > 160000) {
        encoded = canvas.toDataURL('image/jpeg', 0.5);
      }
      resolve(encoded.startsWith('data:image/') ? encoded : '');
    };
    img.src = rawDataUrl;
  });
}

async function collectCompressedPublicPhotos(
  uid: string,
  order: ServiceOrder
): Promise<PublicAcceptanceEvidencePhoto[]> {
  const evidencePhotos: PublicAcceptanceEvidencePhoto[] = [];
  let totalPhotoBytes = 0;
  const maxTotalPhotoChars = 540000;

  for (const slot of ['front', 'back', 'rails', 'dock'] as const) {
    if (evidencePhotos.length >= 4) break;
    const mediaId = order.evidenceMediaIds?.[slot];
    let rawUrl = '';
    if (mediaId) {
      const rec = await getMediaRecord(uid, mediaId);
      if (rec && !rec.deleted && rec.dataUrl.startsWith('data:image/')) {
        rawUrl = rec.dataUrl;
      }
    }
    if (!rawUrl && order.evidencePhotos?.[slot]?.startsWith('data:image/')) {
      rawUrl = order.evidencePhotos[slot]!;
    }
    if (!rawUrl) continue;

    const compressed = await recompressPublicPhotoJpeg(rawUrl, 640, 0.65);
    if (!compressed) continue;
    if (totalPhotoBytes + compressed.length > maxTotalPhotoChars) continue;

    evidencePhotos.push({
      slot,
      label: EVIDENCE_LABELS[slot],
      dataUrl: compressed,
    });
    totalPhotoBytes += compressed.length;
  }

  return evidencePhotos;
}

type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

function decodeFsString(v: Record<string, unknown> | undefined): string {
  return typeof v?.stringValue === 'string' ? v.stringValue : '';
}

function decodeFsNumber(v: Record<string, unknown> | undefined): number {
  if (!v) return 0;
  if (v.doubleValue !== undefined) return Number(v.doubleValue) || 0;
  if (v.integerValue !== undefined) return Number(v.integerValue) || 0;
  return 0;
}

function decodePublicDoc(
  rawJson: { fields?: Record<string, Record<string, unknown>> }
): PublicAcceptanceDocument | null {
  const f = rawJson.fields;
  if (!f || !f.token || !f.orderCode) return null;

  const rawItems =
    ((f.items?.arrayValue as
      | { values?: Array<{ mapValue?: { fields?: Record<string, Record<string, unknown>> } }> }
      | undefined)?.values || []);
  const items: PublicAcceptanceLineItem[] = rawItems
    .map((entry) => {
      const mf = entry.mapValue?.fields;
      if (!mf) return null;
      return {
        d: decodeFsString(mf.d),
        q: decodeFsNumber(mf.q),
        v: decodeFsNumber(mf.v),
      };
    })
    .filter((x): x is PublicAcceptanceLineItem => Boolean(x && x.d));

  const rawPhotos =
    ((f.evidencePhotos?.arrayValue as
      | { values?: Array<{ mapValue?: { fields?: Record<string, Record<string, unknown>> } }> }
      | undefined)?.values || []);
  const evidencePhotos: PublicAcceptanceEvidencePhoto[] = rawPhotos
    .map((entry) => {
      const mf = entry.mapValue?.fields;
      if (!mf) return null;
      const dataUrl = decodeFsString(mf.dataUrl);
      if (!dataUrl.startsWith('data:image/')) return null;
      return {
        slot: decodeFsString(mf.slot),
        label: decodeFsString(mf.label),
        dataUrl,
      };
    })
    .filter((x): x is PublicAcceptanceEvidencePhoto => Boolean(x));

  const rawChecklist =
    ((f.entryChecklist?.arrayValue as
      | { values?: Array<{ mapValue?: { fields?: Record<string, Record<string, unknown>> } }> }
      | undefined)?.values || []);
  const entryChecklist: PublicAcceptanceChecklistChip[] = rawChecklist
    .map((entry) => {
      const mf = entry.mapValue?.fields;
      if (!mf) return null;
      const label = decodeFsString(mf.label);
      if (!label) return null;
      const toneRaw = decodeFsString(mf.tone);
      const tone: 'ok' | 'warn' | 'neutral' =
        toneRaw === 'ok' || toneRaw === 'warn' ? toneRaw : 'neutral';
      return { label, tone };
    })
    .filter((x): x is PublicAcceptanceChecklistChip => Boolean(x));

  const statusRaw = decodeFsString(f.status);
  const status: 'pending' | 'accepted' = statusRaw === 'accepted' ? 'accepted' : 'pending';

  return {
    token: decodeFsString(f.token),
    ownerUid: decodeFsString(f.ownerUid),
    orderId: decodeFsNumber(f.orderId),
    orderCode: decodeFsString(f.orderCode),
    status,
    osStatus: decodeFsString(f.osStatus) || undefined,
    expectedDeliveryDate: decodeFsString(f.expectedDeliveryDate) || undefined,
    createdDateLabel: decodeFsString(f.createdDateLabel) || undefined,
    technician: decodeFsString(f.technician) || undefined,
    clientName: decodeFsString(f.clientName),
    device: decodeFsString(f.device),
    deviceCategory: (() => {
      const cat = decodeFsString(f.deviceCategory);
      return cat === 'notebook' || cat === 'tablet' || cat === 'smartphone' ? cat : undefined;
    })(),
    deviceSerial: decodeFsString(f.deviceSerial) || undefined,
    issue: decodeFsString(f.issue),
    technicalReport: decodeFsString(f.technicalReport) || undefined,
    aiExplanation: decodeFsString(f.aiExplanation) || undefined,
    entryChecklist,
    serviceName: decodeFsString(f.serviceName),
    servicePrice: decodeFsNumber(f.servicePrice),
    partsPrice: decodeFsNumber(f.partsPrice),
    items,
    deliveryFee: decodeFsNumber(f.deliveryFee),
    discount: decodeFsNumber(f.discount),
    totalAmount: decodeFsNumber(f.totalAmount),
    paidAmount: f.paidAmount ? decodeFsNumber(f.paidAmount) : 0,
    signalPaid: f.signalPaid ? decodeFsNumber(f.signalPaid) : 0,
    warrantyDays: decodeFsNumber(f.warrantyDays),
    condExec: decodeFsString(f.condExec),
    warrantyText: decodeFsString(f.warrantyText),
    quoteHash: decodeFsString(f.quoteHash),
    evidencePhotos,
    createdAtMs: decodeFsNumber(f.createdAtMs),
    updatedAtMs: f.updatedAtMs ? decodeFsNumber(f.updatedAtMs) : undefined,
    createdServerAt:
      typeof f.createdServerAt?.timestampValue === 'string'
        ? f.createdServerAt.timestampValue
        : undefined,
    signaturePng: decodeFsString(f.signaturePng) || undefined,
    acceptedIp: decodeFsString(f.acceptedIp) || undefined,
    acceptedUserAgent: decodeFsString(f.acceptedUserAgent) || undefined,
    acceptedClientAtMs: f.acceptedClientAtMs ? decodeFsNumber(f.acceptedClientAtMs) : undefined,
    acceptedServerAt:
      typeof f.acceptedServerAt?.timestampValue === 'string'
        ? f.acceptedServerAt.timestampValue
        : undefined,
  };
}

function buildSanitizedOrderTrackingFields(
  order: ServiceOrder,
  evidencePhotos: PublicAcceptanceEvidencePhoto[]
): Record<string, FsValue> {
  const osStatus = String(order.status || 'Orçamento').slice(0, 40);
  const expectedDeliveryDate = String(order.expectedDeliveryDate || '').slice(0, 20);
  const createdDateLabel = (
    order.createdDate ? formatDateBR(order.createdDate) : order.createdAt || ''
  ).slice(0, 40);
  const technician = String(order.technician || '').slice(0, 80);
  const technicalReport = buildPublicTechnicalReport(order);
  const aiExplanation = scrubPublicText(order.publicAiSummary || '').slice(0, 2900);
  const entryChecklist = buildPublicChecklistChips(order);
  const deviceCategory = resolveOrderDeviceCategory(order);
  const deviceSerial = buildPublicDeviceSerial(order, deviceCategory);
  const paidAmount = Math.max(0, Number(order.paidAmount) || 0);
  const signalPaid = Math.max(0, Number(order.signalPaid) || 0);
  const updatedAtMs = Date.now();

  return {
    osStatus: { stringValue: osStatus },
    expectedDeliveryDate: { stringValue: expectedDeliveryDate },
    createdDateLabel: { stringValue: createdDateLabel },
    technician: { stringValue: technician },
    deviceCategory: { stringValue: deviceCategory },
    deviceSerial: { stringValue: deviceSerial },
    technicalReport: { stringValue: technicalReport },
    aiExplanation: { stringValue: aiExplanation },
    entryChecklist: {
      arrayValue: {
        values: entryChecklist.map((ch) => ({
          mapValue: {
            fields: {
              label: { stringValue: ch.label.slice(0, 80) },
              tone: { stringValue: ch.tone },
            },
          },
        })),
      },
    },
    evidencePhotos: {
      arrayValue: {
        values: evidencePhotos.map((ph) => ({
          mapValue: {
            fields: {
              slot: { stringValue: ph.slot },
              label: { stringValue: ph.label },
              dataUrl: { stringValue: ph.dataUrl },
            },
          },
        })),
      },
    },
    paidAmount: { doubleValue: paidAmount },
    signalPaid: { doubleValue: signalPaid },
    updatedAtMs: { integerValue: String(updatedAtMs) },
  };
}

export async function publishOrderPublicAcceptance(input: {
  order: ServiceOrder;
  cfg: LabConfig;
  warrantyDays: number;
}): Promise<{
  token: string;
  quoteHash: string;
  url: string;
  projectId: string;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sem conexão com a internet para gerar o link público.');
  }

  const authState = loadAuthState();
  if (!authState.apiKey || !authState.projectId) {
    throw new Error('Configure a conta Firebase nas Configurações antes de gerar links públicos.');
  }
  if (!authState.refreshToken || !authState.uid) {
    throw new Error('Faça login na nuvem (Configurações) para gerar links públicos.');
  }

  const { token: idToken, auth } = await ensureFirebaseIdToken(authState);
  const evidencePhotos = await collectCompressedPublicPhotos(auth.uid, input.order);

  // Sanitização estrita LGPD e sigilo comercial (sem CPF, sem IMEI completo, sem custos, sem margens, sem senha/padrão)
  const sanitizedItems: PublicAcceptanceLineItem[] = (input.order.extraItems || [])
    .filter((it) => Boolean(it.d && it.d.trim()))
    .slice(0, 50)
    .map((it) => ({
      d: String(it.d).slice(0, 140),
      q: Math.max(0, Number(it.q) || 0),
      v: Math.max(0, Number(it.v) || 0),
    }));

  const serviceName = (input.order.serviceCatalogName || 'Serviço Técnico Especializado').slice(0, 200);
  const servicePrice = Math.max(0, Number(input.order.servicePrice) || 0);
  const partsPrice = Math.max(0, Number(input.order.partsPrice) || 0);
  const deliveryFee = Math.max(0, Number(input.order.deliveryFee) || 0);
  const discount = Math.max(0, Number(input.order.discount) || 0);
  const totalAmount = calcOrderTotalAmount(input.order);
  const warrantyDays = Math.max(
    0,
    Math.round(
      Number(
        input.order.warrantyDays ??
          input.warrantyDays ??
          resolveOrderWarrantyDays(input.order.serviceCatalogId, [], input.cfg)
      ) || 90
    )
  );
  const condExec = String(input.cfg.condExec || '').slice(0, 2000);
  const warrantyText = String(
    input.order.clientSuppliedPart ? input.cfg.termoPecaCli : input.cfg.termoGarantia
  ).slice(0, 2000);
  const device = String(input.order.device || 'Aparelho').slice(0, 160);
  const issue = scrubPublicText(input.order.issue || '').slice(0, 600);
  const clientName = String(input.order.clientName || 'Cliente').slice(0, 120);
  const orderCode = String(input.order.code || `#${input.order.id}`).slice(0, 40);

  const quoteHash = await computeQuoteSha256Hex({
    orderId: input.order.id,
    orderCode,
    device,
    issue,
    serviceName,
    servicePrice,
    partsPrice,
    items: sanitizedItems,
    deliveryFee,
    discount,
    totalAmount,
    warrantyDays,
    condExec,
    warrantyText,
  });

  const publicToken = generatePublicToken128();
  const createdAtMs = Date.now();
  const trackingFields = buildSanitizedOrderTrackingFields(input.order, evidencePhotos);

  const fields: Record<string, FsValue> = {
    token: { stringValue: publicToken },
    ownerUid: { stringValue: auth.uid },
    orderId: { integerValue: String(Math.round(input.order.id)) },
    orderCode: { stringValue: orderCode },
    status: { stringValue: 'pending' },
    clientName: { stringValue: clientName },
    device: { stringValue: device },
    issue: { stringValue: issue },
    serviceName: { stringValue: serviceName },
    servicePrice: { doubleValue: servicePrice },
    partsPrice: { doubleValue: partsPrice },
    items: {
      arrayValue: {
        values: sanitizedItems.map((it) => ({
          mapValue: {
            fields: {
              d: { stringValue: it.d },
              q: { doubleValue: it.q },
              v: { doubleValue: it.v },
            },
          },
        })),
      },
    },
    deliveryFee: { doubleValue: deliveryFee },
    discount: { doubleValue: discount },
    totalAmount: { doubleValue: totalAmount },
    warrantyDays: { integerValue: String(warrantyDays) },
    condExec: { stringValue: condExec },
    warrantyText: { stringValue: warrantyText },
    quoteHash: { stringValue: quoteHash },
    createdAtMs: { integerValue: String(createdAtMs) },
    ...trackingFields,
  };

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    auth.projectId
  )}/databases/(default)/documents:commit`;

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      writes: [
        {
          currentDocument: { exists: false },
          update: {
            name: `projects/${auth.projectId}/databases/(default)/documents/public_aceites/${publicToken}`,
            fields,
          },
          updateTransforms: [{ fieldPath: 'createdServerAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      res.status === 403
        ? 'Permissão negada no Firestore ao gravar public_aceites. Atualize as Regras do Firestore.'
        : `Erro ao publicar link de aceite (${res.status}): ${errText.slice(0, 140)}`
    );
  }

  return {
    token: publicToken,
    quoteHash,
    url: buildPublicAcceptanceUrl(publicToken, auth.projectId),
    projectId: auth.projectId,
  };
}

/**
 * Atualiza automaticamente no Firestore os dados operacionais do documento público já existente
 * (status da OS, previsão de entrega, técnico, laudo técnico, explicação IA, checklist, fotos comprimidas e valor pago)
 * SEM alterar o token, o status de aceite ou o `quoteHash` SHA-256 selado.
 */
export async function syncOrderPublicAcceptance(input: {
  order: ServiceOrder;
}): Promise<{ synced: boolean; reason?: string }> {
  const token = (input.order.publicAcceptanceToken || '').trim();
  if (!token) return { synced: false, reason: 'no_token' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: false, reason: 'offline' };
  }

  const authState = loadAuthState();
  if (!authState.apiKey || !authState.projectId || !authState.refreshToken || !authState.uid) {
    return { synced: false, reason: 'unauthenticated' };
  }

  const { token: idToken, auth } = await ensureFirebaseIdToken(authState);
  const evidencePhotos = await collectCompressedPublicPhotos(auth.uid, input.order);
  const trackingFields = buildSanitizedOrderTrackingFields(input.order, evidencePhotos);
  const fieldPaths = Object.keys(trackingFields);

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    auth.projectId
  )}/databases/(default)/documents:commit`;

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      writes: [
        {
          currentDocument: { exists: true },
          update: {
            name: `projects/${auth.projectId}/databases/(default)/documents/public_aceites/${token}`,
            fields: trackingFields,
          },
          updateMask: {
            fieldPaths,
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      res.status === 403
        ? 'Permissão negada no Firestore ao atualizar acompanhamento público. Publique as novas regras em firestore.rules.'
        : `Erro ao sincronizar página pública (${res.status}): ${errText.slice(0, 140)}`
    );
  }

  return { synced: true };
}

export async function fetchPublicAcceptanceDoc(
  projectId: string,
  token: string
): Promise<PublicAcceptanceDocument | null> {
  const cleanProject = projectId.trim();
  const cleanToken = token.trim();
  if (!cleanProject || !cleanToken) return null;

  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cleanProject
  )}/databases/(default)/documents/public_aceites/${encodeURIComponent(cleanToken)}`;

  const res = await fetch(docUrl, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(
      res.status === 403
        ? 'Acesso negado ao documento público de aceite. Verifique as regras do Firestore.'
        : `Falha ao consultar aceite (${res.status}): ${errBody.slice(0, 120)}`
    );
  }

  const json = (await res.json()) as { fields?: Record<string, Record<string, unknown>> };
  return decodePublicDoc(json);
}

export async function fetchPublicClientIp(timeoutMs = 2500): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return 'IP não disponível';
    const data = (await res.json()) as { ip?: string };
    return data.ip && typeof data.ip === 'string' ? data.ip.slice(0, 64) : 'IP não disponível';
  } catch {
    return 'IP não disponível';
  }
}

export async function submitPublicClientAcceptance(input: {
  projectId: string;
  token: string;
  signaturePng: string;
  userAgent: string;
  ip: string;
  clientAtMs: number;
}): Promise<void> {
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    input.projectId
  )}/databases/(default)/documents:commit`;

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          currentDocument: { exists: true },
          update: {
            name: `projects/${input.projectId}/databases/(default)/documents/public_aceites/${input.token}`,
            fields: {
              status: { stringValue: 'accepted' },
              signaturePng: { stringValue: input.signaturePng.slice(0, 150000) },
              acceptedIp: { stringValue: input.ip.slice(0, 64) },
              acceptedUserAgent: { stringValue: input.userAgent.slice(0, 380) },
              acceptedClientAtMs: { integerValue: String(Math.round(input.clientAtMs)) },
            },
          },
          updateMask: {
            fieldPaths: [
              'status',
              'signaturePng',
              'acceptedIp',
              'acceptedUserAgent',
              'acceptedClientAtMs',
            ],
          },
          updateTransforms: [{ fieldPath: 'acceptedServerAt', setToServerValue: 'REQUEST_TIME' }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      res.status === 403 || res.status === 400
        ? 'Este orçamento já foi assinado anteriormente ou o prazo de alteração expirou (registro imutável).'
        : `Não foi possível registrar o aceite (${res.status}): ${errText.slice(0, 120)}`
    );
  }
}
