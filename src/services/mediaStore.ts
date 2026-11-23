import { useEffect, useMemo, useState } from 'react';
import { ServiceOrder } from '../types/lab';

export type MediaSlot = 'front' | 'back' | 'rails' | 'dock' | 'clientSig';
export type EvidencePhotoSlot = 'front' | 'back' | 'rails' | 'dock';

export interface MediaBlobRecord {
  storageKey: string; // `${uid || 'local'}::${id}`
  uid: string;
  id: string;
  orderId: number;
  slot: MediaSlot;
  dataUrl: string;
  mime: string;
  updatedAt: number;
  deleted?: boolean;
}

const IDB_NAME = 'microlab_media_v1';
const IDB_VERSION = 1;
const STORE_NAME = 'media';

const memoryCache = new Map<string, MediaBlobRecord>();
const listeners = new Set<() => void>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

export function makeMediaStorageKey(uid: string | null | undefined, mediaId: string): string {
  const cleanUid = (uid || '').trim() || 'local';
  return `${cleanUid}::${mediaId}`;
}

export function buildDeterministicMediaId(orderId: number, slot: MediaSlot): string {
  return slot === 'clientSig' ? `os-${orderId}-clientSig` : `os-${orderId}-${slot}`;
}

function notifyMediaListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // Ignore listener errors
    }
  });
}

export function subscribeMediaChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'storageKey' });
          store.createIndex('byUid', 'uid', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function detectMimeFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  return m ? m[1] : 'image/jpeg';
}

export async function getMediaRecord(
  uid: string | null | undefined,
  mediaId: string
): Promise<MediaBlobRecord | null> {
  const storageKey = makeMediaStorageKey(uid, mediaId);
  const cached = memoryCache.get(storageKey);
  if (cached) return cached;

  const db = await openMediaDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(storageKey);
      req.onsuccess = () => {
        const rec = (req.result as MediaBlobRecord | undefined) || null;
        if (rec) memoryCache.set(storageKey, rec);
        resolve(rec);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function getCachedMediaDataUrl(
  uid: string | null | undefined,
  mediaId: string | undefined
): string | undefined {
  if (!mediaId) return undefined;
  const rec = memoryCache.get(makeMediaStorageKey(uid, mediaId));
  if (!rec || rec.deleted || !rec.dataUrl) return undefined;
  return rec.dataUrl;
}

export async function putMediaRecord(
  uid: string | null | undefined,
  input: {
    id: string;
    orderId: number;
    slot: MediaSlot;
    dataUrl: string;
    mime?: string;
    updatedAt?: number;
    deleted?: boolean;
  }
): Promise<MediaBlobRecord> {
  const cleanUid = (uid || '').trim() || 'local';
  const storageKey = makeMediaStorageKey(cleanUid, input.id);
  const record: MediaBlobRecord = {
    storageKey,
    uid: cleanUid,
    id: input.id,
    orderId: input.orderId,
    slot: input.slot,
    dataUrl: input.deleted ? '' : input.dataUrl,
    mime: input.mime || (input.dataUrl ? detectMimeFromDataUrl(input.dataUrl) : 'image/webp'),
    updatedAt: input.updatedAt ?? Date.now(),
    ...(input.deleted ? { deleted: true } : {}),
  };
  memoryCache.set(storageKey, record);
  notifyMediaListeners();

  const db = await openMediaDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return record;
}

export async function markMediaRecordDeleted(
  uid: string | null | undefined,
  mediaId: string,
  orderId = 0,
  slot: MediaSlot = 'front',
  updatedAt = Date.now()
): Promise<MediaBlobRecord> {
  return putMediaRecord(uid, {
    id: mediaId,
    orderId,
    slot,
    dataUrl: '',
    mime: '',
    updatedAt,
    deleted: true,
  });
}

export async function listMediaRecordsForUid(
  uid: string | null | undefined
): Promise<MediaBlobRecord[]> {
  const cleanUid = (uid || '').trim() || 'local';
  const db = await openMediaDb();
  if (!db) {
    return Array.from(memoryCache.values()).filter((r) => r.uid === cleanUid);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('byUid');
      const req = index.getAll(cleanUid);
      req.onsuccess = () => {
        const rows = (req.result as MediaBlobRecord[]) || [];
        rows.forEach((r) => memoryCache.set(r.storageKey, r));
        resolve(rows);
      };
      req.onerror = () => {
        resolve(Array.from(memoryCache.values()).filter((r) => r.uid === cleanUid));
      };
    } catch {
      resolve(Array.from(memoryCache.values()).filter((r) => r.uid === cleanUid));
    }
  });
}

export async function clearMediaForUid(uid: string | null | undefined): Promise<void> {
  const cleanUid = (uid || '').trim() || 'local';
  for (const [k, v] of memoryCache.entries()) {
    if (v.uid === cleanUid) memoryCache.delete(k);
  }
  notifyMediaListeners();

  const db = await openMediaDb();
  if (!db) return;
  const rows = await listMediaRecordsForUid(cleanUid);
  if (rows.length === 0) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      rows.forEach((r) => store.delete(r.storageKey));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function encodeCanvasWebpOrJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.58
): { dataUrl: string; mime: string } {
  try {
    const webpUrl = canvas.toDataURL('image/webp', quality);
    if (webpUrl.startsWith('data:image/webp')) {
      return { dataUrl: webpUrl, mime: 'image/webp' };
    }
  } catch {
    // Fallback to JPEG below
  }
  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    mime: 'image/jpeg',
  };
}

export async function compressEvidenceImage(
  file: File,
  maxSide = 600,
  quality = 0.58
): Promise<{ dataUrl: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w >= h) {
            h = Math.max(1, Math.round((h * maxSide) / w));
            w = maxSide;
          } else {
            w = Math.max(1, Math.round((w * maxSide) / h));
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
        resolve(encodeCanvasWebpOrJpeg(canvas, quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export async function compressDataUrlIfNeeded(
  rawDataUrl: string,
  maxSide = 600,
  quality = 0.58
): Promise<{ dataUrl: string; mime: string }> {
  const mime = detectMimeFromDataUrl(rawDataUrl);
  // Evita reprocessar assinaturas transparentes ou arquivos já enxutos (< 45 KB)
  if (mime === 'image/png' || rawDataUrl.length < 45000 || typeof document === 'undefined') {
    return { dataUrl: rawDataUrl, mime };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve({ dataUrl: rawDataUrl, mime });
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxSide || h > maxSide) {
        if (w >= h) {
          h = Math.max(1, Math.round((h * maxSide) / w));
          w = maxSide;
        } else {
          w = Math.max(1, Math.round((w * maxSide) / h));
          h = maxSide;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: rawDataUrl, mime });
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const encoded = encodeCanvasWebpOrJpeg(canvas, quality);
      resolve(encoded.dataUrl.length < rawDataUrl.length ? encoded : { dataUrl: rawDataUrl, mime });
    };
    img.src = rawDataUrl;
  });
}

export interface LegacyMediaExtractionResult {
  orders: ServiceOrder[];
  migratedAny: boolean;
  pendingWrites: Array<{
    id: string;
    orderId: number;
    slot: MediaSlot;
    dataUrl: string;
    updatedAt: number;
  }>;
}

/**
 * Extrai fotos e assinaturas legadas embutidas em ServiceOrder para referências leves,
 * alimentando imediatamente o cache em RAM para exibição zero-delay e retornando os blobs
 * para gravação assíncrona no IndexedDB + marcação dirty na nuvem (`media__<id>`).
 */
export function extractLegacyOrderMedia(
  uid: string | null | undefined,
  orders: ServiceOrder[]
): LegacyMediaExtractionResult {
  let migratedAny = false;
  const pendingWrites: LegacyMediaExtractionResult['pendingWrites'] = [];
  const now = Date.now();
  const cleanUid = (uid || '').trim() || 'local';

  const nextOrders = (orders || []).map((o) => {
    const slots: EvidencePhotoSlot[] = ['front', 'back', 'rails', 'dock'];
    const nextMediaIds: Partial<Record<EvidencePhotoSlot, string>> = {
      ...(o.evidenceMediaIds || {}),
    };
    let orderChanged = false;

    if (o.evidencePhotos && typeof o.evidencePhotos === 'object') {
      slots.forEach((slot) => {
        const rawUrl = o.evidencePhotos?.[slot];
        if (typeof rawUrl === 'string' && rawUrl.trim().startsWith('data:')) {
          const mediaId = nextMediaIds[slot] || buildDeterministicMediaId(o.id, slot);
          nextMediaIds[slot] = mediaId;
          const storageKey = makeMediaStorageKey(cleanUid, mediaId);
          if (!memoryCache.has(storageKey)) {
            memoryCache.set(storageKey, {
              storageKey,
              uid: cleanUid,
              id: mediaId,
              orderId: o.id,
              slot,
              dataUrl: rawUrl,
              mime: detectMimeFromDataUrl(rawUrl),
              updatedAt: o.updatedAt || now,
            });
          }
          pendingWrites.push({
            id: mediaId,
            orderId: o.id,
            slot,
            dataUrl: rawUrl,
            updatedAt: o.updatedAt || now,
          });
          orderChanged = true;
          migratedAny = true;
        }
      });
    }

    const legacySig =
      typeof o.clientSignatureDataUrl === 'string' && o.clientSignatureDataUrl.trim().startsWith('data:')
        ? o.clientSignatureDataUrl
        : typeof o.signatureDataUrl === 'string' && o.signatureDataUrl.trim().startsWith('data:')
        ? o.signatureDataUrl
        : undefined;

    let nextSigMediaId = o.clientSignatureMediaId;
    if (legacySig) {
      const sigId = nextSigMediaId || buildDeterministicMediaId(o.id, 'clientSig');
      nextSigMediaId = sigId;
      const storageKey = makeMediaStorageKey(cleanUid, sigId);
      if (!memoryCache.has(storageKey)) {
        memoryCache.set(storageKey, {
          storageKey,
          uid: cleanUid,
          id: sigId,
          orderId: o.id,
          slot: 'clientSig',
          dataUrl: legacySig,
          mime: detectMimeFromDataUrl(legacySig),
          updatedAt: o.updatedAt || now,
        });
      }
      pendingWrites.push({
        id: sigId,
        orderId: o.id,
        slot: 'clientSig',
        dataUrl: legacySig,
        updatedAt: o.updatedAt || now,
      });
      orderChanged = true;
      migratedAny = true;
    }

    if (!orderChanged) return o;

    const cleanEvidenceIds = Object.keys(nextMediaIds).length > 0 ? nextMediaIds : undefined;
    const {
      evidencePhotos: _ep,
      clientSignatureDataUrl: _cs,
      signatureDataUrl: _sd,
      ...rest
    } = o;
    void _ep;
    void _cs;
    void _sd;

    return {
      ...rest,
      evidenceMediaIds: cleanEvidenceIds,
      evidenceCount: cleanEvidenceIds
        ? Object.values(cleanEvidenceIds).filter(Boolean).length
        : o.evidenceCount || 0,
      clientSignatureMediaId: nextSigMediaId,
      hasClientSignature: Boolean(nextSigMediaId || o.hasClientSignature),
    };
  });

  if (pendingWrites.length > 0) {
    notifyMediaListeners();
  }

  return { orders: nextOrders, migratedAny, pendingWrites };
}

/**
 * Hook reativo para carregar fotos de evidência e assinatura do cliente a partir do IndexedDB
 * (com fallback automático para dados legados inline caso ainda não tenham sido substituídos).
 */
export function useOrderMedia(uid: string | null | undefined, order?: ServiceOrder | null) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeMediaChanges(() => setTick((t) => t + 1));
  }, []);

  const mediaIdsKey = useMemo(() => {
    if (!order) return '';
    const ids: string[] = [];
    (['front', 'back', 'rails', 'dock'] as const).forEach((s) => {
      const id = order.evidenceMediaIds?.[s];
      if (id) ids.push(id);
    });
    if (order.clientSignatureMediaId) ids.push(order.clientSignatureMediaId);
    return ids.join('|');
  }, [order]);

  useEffect(() => {
    if (!order || !mediaIdsKey) return;
    let cancelled = false;
    const ids = mediaIdsKey.split('|').filter(Boolean);
    Promise.all(ids.map((id) => getMediaRecord(uid, id))).then((recs) => {
      if (!cancelled && recs.some(Boolean)) {
        setTick((t) => t + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid, order?.id, mediaIdsKey]);

  return useMemo(() => {
    const photos: Partial<Record<EvidencePhotoSlot, string>> = {};
    if (!order) return { photos, clientSig: undefined as string | undefined };
    (['front', 'back', 'rails', 'dock'] as const).forEach((slot) => {
      const mediaId = order.evidenceMediaIds?.[slot];
      const fromCache = getCachedMediaDataUrl(uid, mediaId);
      const val = fromCache || order.evidencePhotos?.[slot];
      if (val) photos[slot] = val;
    });
    const clientSig =
      getCachedMediaDataUrl(uid, order.clientSignatureMediaId) ||
      order.clientSignatureDataUrl ||
      order.signatureDataUrl;
    return { photos, clientSig, _tick: tick };
  }, [uid, order, tick]);
}
