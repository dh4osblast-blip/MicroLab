import { LabConfig, ServiceOrder } from '../types/lab';
import {
  calcOrderTotalAmount,
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

export interface PublicAcceptanceDocument {
  token: string;
  ownerUid: string;
  orderId: number;
  orderCode: string;
  status: 'pending' | 'accepted';
  clientName: string;
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
  quoteHash: string;
  evidencePhotos: PublicAcceptanceEvidencePhoto[];
  createdAtMs: number;
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

function decodePublicDoc(rawJson: { fields?: Record<string, Record<string, unknown>> }): PublicAcceptanceDocument | null {
  const f = rawJson.fields;
  if (!f || !f.token || !f.orderCode) return null;

  const rawItems = ((f.items?.arrayValue as { values?: Array<{ mapValue?: { fields?: Record<string, Record<string, unknown>> } }> } | undefined)?.values || []);
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

  const rawPhotos = ((f.evidencePhotos?.arrayValue as { values?: Array<{ mapValue?: { fields?: Record<string, Record<string, unknown>> } }> } | undefined)?.values || []);
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

  const statusRaw = decodeFsString(f.status);
  const status: 'pending' | 'accepted' = statusRaw === 'accepted' ? 'accepted' : 'pending';

  return {
    token: decodeFsString(f.token),
    ownerUid: decodeFsString(f.ownerUid),
    orderId: decodeFsNumber(f.orderId),
    orderCode: decodeFsString(f.orderCode),
    status,
    clientName: decodeFsString(f.clientName),
    device: decodeFsString(f.device),
    issue: decodeFsString(f.issue),
    serviceName: decodeFsString(f.serviceName),
    servicePrice: decodeFsNumber(f.servicePrice),
    partsPrice: decodeFsNumber(f.partsPrice),
    items,
    deliveryFee: decodeFsNumber(f.deliveryFee),
    discount: decodeFsNumber(f.discount),
    totalAmount: decodeFsNumber(f.totalAmount),
    warrantyDays: decodeFsNumber(f.warrantyDays),
    condExec: decodeFsString(f.condExec),
    warrantyText: decodeFsString(f.warrantyText),
    quoteHash: decodeFsString(f.quoteHash),
    evidencePhotos,
    createdAtMs: decodeFsNumber(f.createdAtMs),
    createdServerAt: typeof f.createdServerAt?.timestampValue === 'string' ? f.createdServerAt.timestampValue : undefined,
    signaturePng: decodeFsString(f.signaturePng) || undefined,
    acceptedIp: decodeFsString(f.acceptedIp) || undefined,
    acceptedUserAgent: decodeFsString(f.acceptedUserAgent) || undefined,
    acceptedClientAtMs: f.acceptedClientAtMs ? decodeFsNumber(f.acceptedClientAtMs) : undefined,
    acceptedServerAt: typeof f.acceptedServerAt?.timestampValue === 'string' ? f.acceptedServerAt.timestampValue : undefined,
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

  // Coleta até 4 fotos de evidência do IndexedDB mantendo tamanho seguro (< 600KB no total)
  const evidencePhotos: PublicAcceptanceEvidencePhoto[] = [];
  let totalPhotoBytes = 0;
  for (const slot of ['front', 'back', 'rails', 'dock'] as const) {
    const mediaId = input.order.evidenceMediaIds?.[slot];
    if (!mediaId) continue;
    const rec = await getMediaRecord(auth.uid, mediaId);
    if (rec && !rec.deleted && rec.dataUrl.startsWith('data:image/')) {
      if (totalPhotoBytes + rec.dataUrl.length <= 600000) {
        evidencePhotos.push({
          slot,
          label: EVIDENCE_LABELS[slot],
          dataUrl: rec.dataUrl,
        });
        totalPhotoBytes += rec.dataUrl.length;
      }
    }
  }

  // Sanitização estrita LGPD e sigilo comercial (sem CPF, sem custos, sem margens, sem senha/padrão)
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
    Math.round(Number(input.order.warrantyDays ?? input.warrantyDays ?? resolveOrderWarrantyDays(input.order.serviceCatalogId, [], input.cfg)) || 90)
  );
  const condExec = String(input.cfg.condExec || '').slice(0, 2000);
  const warrantyText = String(
    input.order.clientSuppliedPart ? input.cfg.termoPecaCli : input.cfg.termoGarantia
  ).slice(0, 2000);
  const device = String(input.order.device || 'Aparelho').slice(0, 160);
  const issue = String(input.order.issue || '').slice(0, 600);
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
    createdAtMs: { integerValue: String(createdAtMs) },
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
