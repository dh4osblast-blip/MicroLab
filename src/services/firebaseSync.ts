import { LabState } from '../types/lab';

// Chaves isoladas por UID do usuário autenticado (evita contaminação cruzada entre contas)
export const AUTH_CONFIG_STORAGE_KEY = 'microlab_firebase_auth_cfg_v1';
export const DB_KEY_PREFIX = 'microlab_os_db_';
export const META_KEY_PREFIX = 'microlab_sync_meta_';
export const LEGACY_DB_KEY = 'microlab_os_pwa_v18_state';

export function getDbStorageKey(uid?: string | null): string {
  const clean = (uid || '').trim();
  return `${DB_KEY_PREFIX}${clean || 'local'}`;
}

export function getMetaStorageKey(uid?: string | null): string {
  const clean = (uid || '').trim();
  return `${META_KEY_PREFIX}${clean || 'local'}`;
}

export interface FirebaseAuthState {
  apiKey: string;
  projectId: string;
  email: string;
  refreshToken: string;
  uid: string;
  idToken: string;
  expiresAt: number;
}

export interface SyncMetadata {
  hashes: Record<string, string>;
  dirty: Record<string, 1>;
  cursor: string;
  cnt: Record<string, number>;
  uid: string;
  lastSyncAt: number;
}

export interface SyncStatus {
  configured: boolean;
  loggedIn: boolean;
  uid: string;
  email: string;
  storageKey: string;
  busy: boolean;
  lastSyncAt: number;
  pendingCount: number;
  error: string;
  warning: string;
}

export interface AccountSwitchCheck {
  requiresConfirmation: boolean;
  previousUid: string;
  previousEmail: string;
  nextUid: string;
  nextEmail: string;
  previousPendingCount: number;
  nextHasLocalCache: boolean;
}

/**
 * LGPD: Sanitiza qualquer campo sensível volátil antes de gravar em localStorage, exportar JSON ou enviar ao Firestore.
 */
export function sanitizeLabStateForPersistence(state: LabState): LabState {
  const cleanOrders = (state.orders || []).map((order) => {
    const { ...rest } = order as unknown as Record<string, unknown>;
    const hadVolatilePasscode = Boolean(
      (typeof rest.passcode === 'string' && rest.passcode.trim().length > 0) ||
        (Array.isArray(rest.patternNodes) && rest.patternNodes.length > 0)
    );
    delete rest.passcode;
    delete rest.patternNodes;
    delete rest.unlockPattern;
    if (hadVolatilePasscode && rest.hasPasscode === undefined) {
      rest.hasPasscode = true;
    }
    return rest as unknown as LabState['orders'][number];
  });

  const cleanUsers = (state.users || []).map((u) => ({
    id: String(u.id),
    nome: String(u.nome || ''),
    nivel: u.nivel,
    s: String(u.s || ''),
    h: String(u.h || ''),
    ...(typeof u.updatedAt === 'number' ? { updatedAt: u.updatedAt } : {}),
  }));

  return {
    ...state,
    orders: cleanOrders,
    users: cleanUsers,
  };
}

export function loadAuthState(): FirebaseAuthState {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FirebaseAuthState>;
      return {
        apiKey: parsed.apiKey || '',
        projectId: parsed.projectId || '',
        email: parsed.email || '',
        refreshToken: parsed.refreshToken || '',
        uid: parsed.uid || '',
        idToken: parsed.idToken || '',
        expiresAt: parsed.expiresAt || 0,
      };
    }
  } catch {
    // Fallback empty
  }
  return {
    apiKey: '',
    projectId: '',
    email: '',
    refreshToken: '',
    uid: '',
    idToken: '',
    expiresAt: 0,
  };
}

export function saveAuthState(auth: FirebaseAuthState): void {
  try {
    localStorage.setItem(AUTH_CONFIG_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // Ignore quota errors
  }
}

export function emptySyncMetadata(uid = ''): SyncMetadata {
  return {
    hashes: {},
    dirty: {},
    cursor: '',
    cnt: {},
    uid,
    lastSyncAt: 0,
  };
}

export function loadSyncMetadata(uid?: string | null): SyncMetadata {
  const key = getMetaStorageKey(uid);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncMetadata>;
      return {
        hashes: parsed.hashes && typeof parsed.hashes === 'object' ? parsed.hashes : {},
        dirty: parsed.dirty && typeof parsed.dirty === 'object' ? parsed.dirty : {},
        cursor: parsed.cursor || '',
        cnt: parsed.cnt && typeof parsed.cnt === 'object' ? parsed.cnt : {},
        uid: parsed.uid || uid || '',
        lastSyncAt: parsed.lastSyncAt || 0,
      };
    }
  } catch {
    // Ignore parse error
  }
  return emptySyncMetadata(uid || '');
}

export function saveSyncMetadata(uid: string | null | undefined, meta: SyncMetadata): void {
  try {
    localStorage.setItem(getMetaStorageKey(uid), JSON.stringify(meta));
  } catch {
    // Ignore quota errors
  }
}

export function parseFirebaseConfigText(input: string): { apiKey: string; projectId: string } {
  const extract = (key: string) => {
    const match = input.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']([^"']+)["']`));
    return match ? match[1].trim() : '';
  };
  return {
    apiKey: extract('apiKey'),
    projectId: extract('projectId'),
  };
}

function stableHash(s: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

const COLLECTIONS = [
  'orders',
  'clients',
  'scheduleDays',
  'priorityQueue',
  'parts',
  'suppliers',
  'shipments',
  'warranties',
  'transactions',
  'users',
  'tecnicos',
  'vendedores',
  'servicos',
  'fixos',
  'vendas',
  'compras',
  'fonteMem',
] as const;

type CollectionKey = (typeof COLLECTIONS)[number];
const SINGLETON_KEYS = ['interBalances', 'budgetParams', 'labProfile'] as const;
const COUNTER_KEYS = ['nextOrderNumber', 'nextSaleNumber', 'nextPurchaseNumber'] as const;

let lastStampTs = 0;
function nextTimestamp(): number {
  lastStampTs = Math.max(Date.now(), lastStampTs + 1);
  return lastStampTs;
}

function serializeEntity(obj: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...obj };
  delete copy.updatedAt;
  delete copy.passcode;
  delete copy.patternNodes;
  delete copy.pin;
  delete copy.password;
  delete copy.senha;
  return JSON.stringify(copy);
}

/**
 * Carimba timestamps updatedAt e identifica registros alterados/excluídos na conta ativa.
 */
export function stampLabStateChanges(
  rawState: LabState,
  uid: string | null | undefined,
  meta: SyncMetadata
): { state: LabState; meta: SyncMetadata; changed: boolean } {
  const state = sanitizeLabStateForPersistence(rawState);
  const tombstones: Record<string, Record<string, number>> = { ...(state.tombstones || {}) };
  const t = nextTimestamp();
  let changed = false;
  const seen = new Set<string>();

  const nextState: LabState = { ...state, tombstones };

  COLLECTIONS.forEach((col) => {
    const arr = Array.isArray(nextState[col]) ? [...(nextState[col] as unknown as Array<Record<string, unknown>>)] : [];
    const colTomb = { ...(tombstones[col] || {}) };
    tombstones[col] = colTomb;

    const updatedArr = arr.map((item) => {
      const id = String(item.id);
      const key = `${col}/${id}`;
      seen.add(key);
      const h = stableHash(serializeEntity(item));

      if (colTomb[id] !== undefined) {
        delete colTomb[id];
        meta.hashes[key] = h;
        meta.dirty[key] = 1;
        changed = true;
        return { ...item, updatedAt: t };
      }
      if (meta.hashes[key] === h) {
        return item;
      }
      const existingTs = typeof item.updatedAt === 'number' ? item.updatedAt : 0;
      if (meta.hashes[key] === undefined && existingTs > 0) {
        meta.hashes[key] = h;
        return item;
      }
      meta.hashes[key] = h;
      meta.dirty[key] = 1;
      changed = true;
      return { ...item, updatedAt: t };
    });

    (nextState as unknown as Record<string, unknown>)[col] = updatedArr;
  });

  // Detect deletions
  const gone = Object.keys(meta.hashes).filter((k) => {
    const slash = k.indexOf('/');
    const col = k.slice(0, slash) as CollectionKey;
    return COLLECTIONS.includes(col) && !seen.has(k);
  });

  if (gone.length > 10) {
    // Proteção contra sumiço em massa: força resync da nuvem em vez de propagar delete em massa
    gone.forEach((k) => delete meta.hashes[k]);
    meta.cursor = '';
    changed = true;
  } else {
    gone.forEach((k) => {
      const slash = k.indexOf('/');
      const col = k.slice(0, slash);
      const id = k.slice(slash + 1);
      delete meta.hashes[k];
      tombstones[col] = tombstones[col] || {};
      tombstones[col][id] = t;
      meta.dirty[k] = 1;
      changed = true;
    });
  }

  // Singleton config/balances/profile blocks
  SINGLETON_KEYS.forEach((sk) => {
    const val = nextState[sk];
    const key = `cfg/${sk}`;
    const h = stableHash(JSON.stringify(val));
    if (meta.hashes[key] !== h) {
      if (meta.hashes[key] === undefined && (nextState.singletonTimestamps?.[sk] || 0) > 0) {
        meta.hashes[key] = h;
      } else {
        nextState.singletonTimestamps = {
          ...(nextState.singletonTimestamps || {}),
          [sk]: t,
        };
        meta.hashes[key] = h;
        meta.dirty[key] = 1;
        changed = true;
      }
    }
  });

  // Per-key cfg sync (matching v17 db.cfg + cfg._ts)
  const rawCfg = (nextState.cfg || {}) as unknown as Record<string, unknown>;
  const cfgTs: Record<string, number> = {
    ...((rawCfg._ts as Record<string, number> | undefined) || {}),
  };
  let cfgUpdatedAt = typeof rawCfg.updatedAt === 'number' ? rawCfg.updatedAt : 0;
  const nextCfg: Record<string, unknown> = { ...rawCfg, _ts: cfgTs };

  Object.keys(nextCfg).forEach((k) => {
    if (
      k === '_ts' ||
      k === 'updatedAt' ||
      (SINGLETON_KEYS as readonly string[]).includes(k) ||
      nextCfg[k] === undefined
    ) {
      return;
    }
    const key = `cfg/${k}`;
    const h = stableHash(JSON.stringify(nextCfg[k]));
    if (meta.hashes[key] === h) return;
    if (meta.hashes[key] === undefined && (cfgTs[k] || 0) > 0) {
      meta.hashes[key] = h;
      return;
    }
    cfgTs[k] = t;
    cfgUpdatedAt = t;
    meta.hashes[key] = h;
    meta.dirty[key] = 1;
    changed = true;
  });

  Object.keys(meta.hashes).forEach((key) => {
    if (!key.startsWith('cfg/') || meta.hashes[key] === '-') return;
    const k = key.slice(4);
    if ((SINGLETON_KEYS as readonly string[]).includes(k)) return;
    if (nextCfg[k] === undefined) {
      meta.hashes[key] = '-';
      cfgTs[k] = t;
      cfgUpdatedAt = t;
      meta.dirty[key] = 1;
      changed = true;
    }
  });

  if (cfgUpdatedAt > 0) nextCfg.updatedAt = cfgUpdatedAt;
  nextState.cfg = nextCfg as unknown as LabState['cfg'];

  // Sequential counters
  const counters = nextState.counters || { nextOrderNumber: 0, nextSaleNumber: 0, nextPurchaseNumber: 0 };
  COUNTER_KEYS.forEach((ck) => {
    const curVal = Number(counters[ck]) || 0;
    const prevVal = Number(meta.cnt[ck]) || 0;
    if (curVal > prevVal) {
      meta.dirty[`cnt/${ck}`] = 1;
      changed = true;
    }
  });

  if (changed) {
    saveSyncMetadata(uid, meta);
  }
  return { state: nextState, meta, changed };
}

function translateFirebaseError(err: unknown, auth: FirebaseAuthState): string {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;
  if ((err as { net?: boolean })?.net) return 'Sem conexão com a nuvem.';
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(msg)) {
    return 'E-mail ou senha incorretos.';
  }
  if (/TOO_MANY_ATTEMPTS/.test(msg)) {
    return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
  }
  if (/USER_DISABLED/.test(msg)) {
    return 'Esta conta está desativada no Firebase.';
  }
  if (/INVALID_REFRESH_TOKEN|TOKEN_EXPIRED|USER_NOT_FOUND|INVALID_GRANT/.test(msg)) {
    saveAuthState({ ...auth, refreshToken: '', idToken: '', expiresAt: 0 });
    return 'Sessão expirada. Entre na nuvem novamente.';
  }
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
    return 'Chave apiKey inválida. Verifique o firebaseConfig.';
  }
  if (status === 403 || /PERMISSION_DENIED|insufficient permissions/i.test(msg)) {
    return 'Acesso recusado pelo Firestore. Verifique as regras de segurança e a conta logada.';
  }
  if (status === 401) {
    saveAuthState({ ...auth, idToken: '', expiresAt: 0 });
    return 'Sessão recusada. Tente sincronizar novamente.';
  }
  return msg;
}

async function fetchJson(url: string, options?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    const e = new Error('Sem conexão com a nuvem.') as Error & { net?: boolean };
    e.net = true;
    throw e;
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const errObj = body?.error as { message?: string; status?: string } | undefined;
    const msg = errObj?.message || errObj?.status || `HTTP ${res.status}`;
    const e = new Error(msg) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return body;
}

async function ensureIdToken(auth: FirebaseAuthState): Promise<{ token: string; auth: FirebaseAuthState }> {
  if (auth.idToken && Date.now() < auth.expiresAt - 60000) {
    return { token: auth.idToken, auth };
  }
  if (!auth.refreshToken) {
    throw new Error('Entre na conta da nuvem.');
  }
  const j = (await fetchJson(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(auth.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(auth.refreshToken)}`,
    }
  )) as { id_token: string; refresh_token?: string; expires_in?: string; user_id?: string };

  const updated: FirebaseAuthState = {
    ...auth,
    idToken: j.id_token,
    refreshToken: j.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    uid: j.user_id || auth.uid,
  };
  saveAuthState(updated);
  return { token: updated.idToken, auth: updated };
}

interface FirestoreFieldReg {
  l: string;
  id: string;
  u: number;
  d: boolean;
  j: string;
  s?: string;
}

function encodeDocFields(r: FirestoreFieldReg) {
  return {
    l: { stringValue: r.l },
    id: { stringValue: r.id },
    u: { integerValue: String(r.u) },
    d: { booleanValue: Boolean(r.d) },
    j: { stringValue: r.j },
  };
}

function decodeDocFields(fields: Record<string, Record<string, unknown>> | undefined): FirestoreFieldReg | null {
  if (!fields || !fields.l || !fields.id) return null;
  return {
    l: String(fields.l.stringValue || ''),
    id: String(fields.id.stringValue || ''),
    u: Number(fields.u?.integerValue || fields.u?.doubleValue || 0),
    d: Boolean(fields.d?.booleanValue),
    j: String(fields.j?.stringValue || ''),
    s: String(fields.s?.timestampValue || ''),
  };
}

function docIdFromKey(key: string): string {
  const slash = key.indexOf('/');
  return `${key.slice(0, slash)}__${encodeURIComponent(key.slice(slash + 1)).replace(/%/g, '~')}`;
}

export async function authenticateFirebaseEmailPassword(
  apiKey: string,
  email: string,
  password: string
): Promise<{ uid: string; email: string; refreshToken: string; idToken: string; expiresAt: number }> {
  const j = (await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
    }
  )) as {
    email?: string;
    refreshToken: string;
    localId: string;
    idToken: string;
    expiresIn?: string;
  };

  return {
    uid: j.localId,
    email: j.email || email.trim(),
    refreshToken: j.refreshToken,
    idToken: j.idToken,
    expiresAt: Date.now() + (Number(j.expiresIn) || 3600) * 1000,
  };
}

export async function runFirestoreSync(
  rawState: LabState,
  authInput: FirebaseAuthState
): Promise<{
  state: LabState;
  meta: SyncMetadata;
  auth: FirebaseAuthState;
  changed: boolean;
  warning: string;
}> {
  const { token, auth } = await ensureIdToken(authInput);
  if (!auth.uid) {
    throw new Error('UID de autenticação ausente. Faça login novamente.');
  }

  let meta = loadSyncMetadata(auth.uid);
  if (meta.uid !== auth.uid) {
    meta = { ...emptySyncMetadata(auth.uid) };
  }

  const stamped = stampLabStateChanges(rawState, auth.uid, meta);
  let state = stamped.state;
  meta = stamped.meta;
  let changed = false;
  let warning = '';

  const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${auth.projectId}/databases/(default)/documents`;
  const postFs = async (path: string, body: unknown) =>
    fetchJson(`${baseDocsUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

  // 1) PULL
  let cur = meta.cursor || '1970-01-01T00:00:00Z';
  const fullPull = !meta.cursor;
  let maxTimestamp = '';
  let readTime = '';
  const seenKeys = new Set<string>();
  const PAGE = 500;

  for (let page = 0; page < 400; page++) {
    const rows = (await postFs(`/usuarios/${auth.uid}:runQuery`, {
      structuredQuery: {
        from: [{ collectionId: 'reg' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 's' },
            op: 'GREATER_THAN_OR_EQUAL',
            value: { timestampValue: cur },
          },
        },
        orderBy: [{ field: { fieldPath: 's' }, direction: 'ASCENDING' }],
        limit: PAGE,
      },
    })) as unknown as Array<{ document?: { fields?: Record<string, Record<string, unknown>> }; readTime?: string }>;

    const docs = (rows || []).filter((r) => r && r.document).map((r) => r.document!);
    if (rows?.[0]?.readTime) readTime = rows[0].readTime;

    docs.forEach((doc) => {
      const f = decodeDocFields(doc.fields);
      if (!f) return;
      seenKeys.add(`${f.l}/${f.id}`);
      if (f.s && (Date.parse(f.s) || 0) > (Date.parse(maxTimestamp) || 0)) {
        maxTimestamp = f.s;
      }

      if (f.l === 'cnt') {
        const ck = f.id as (typeof COUNTER_KEYS)[number];
        if (!COUNTER_KEYS.includes(ck)) return;
        meta.cnt[ck] = f.u;
        const counters = state.counters || { nextOrderNumber: 0, nextSaleNumber: 0, nextPurchaseNumber: 0 };
        if (f.u > (counters[ck] || 0)) {
          state = { ...state, counters: { ...counters, [ck]: f.u } };
          changed = true;
        }
        return;
      }

      if (f.l === 'cfg') {
        const key = `cfg/${f.id}`;
        if ((SINGLETON_KEYS as readonly string[]).includes(f.id)) {
          const sk = f.id as (typeof SINGLETON_KEYS)[number];
          const localTs = state.singletonTimestamps?.[sk] || 0;
          if (f.u < localTs) {
            meta.dirty[key] = 1;
            return;
          }
          const curJson = JSON.stringify(state[sk]);
          if (f.u === localTs && !f.d && curJson === f.j) return;
          if (!f.d) {
            try {
              const parsedVal = JSON.parse(f.j);
              state = {
                ...state,
                [sk]: parsedVal,
                singletonTimestamps: { ...(state.singletonTimestamps || {}), [sk]: f.u },
              };
              meta.hashes[key] = stableHash(JSON.stringify(parsedVal));
              delete meta.dirty[key];
              changed = true;
            } catch {
              // Skip malformed JSON
            }
          }
          return;
        }

        // Dynamic v17 cfg.<k> key
        const k = f.id;
        if (!k || k === '_ts' || k === 'updatedAt') return;
        const cfgObj = { ...((state.cfg || {}) as unknown as Record<string, unknown>) };
        const cfgTs = { ...((cfgObj._ts as Record<string, number> | undefined) || {}) };
        const localTs = cfgTs[k] || 0;
        const same = f.d
          ? cfgObj[k] === undefined
          : cfgObj[k] !== undefined && JSON.stringify(cfgObj[k]) === f.j;

        if (f.u < localTs) {
          meta.dirty[key] = 1;
          return;
        }
        if (f.u === localTs && same) return;

        let parsedVal: unknown;
        if (!f.d) {
          try {
            parsedVal = JSON.parse(f.j);
          } catch {
            return;
          }
        }
        if (f.d) delete cfgObj[k];
        else cfgObj[k] = parsedVal;
        cfgTs[k] = f.u;
        cfgObj._ts = cfgTs;
        cfgObj.updatedAt = Math.max(Number(cfgObj.updatedAt) || 0, f.u);
        state = {
          ...state,
          cfg: cfgObj as unknown as LabState['cfg'],
        };
        meta.hashes[key] = f.d ? '-' : stableHash(JSON.stringify(cfgObj[k]));
        delete meta.dirty[key];
        if (!same) changed = true;
        return;
      }

      const col = f.l as CollectionKey;
      if (!COLLECTIONS.includes(col) || !Array.isArray(state[col])) return;
      const arr = [...(state[col] as unknown as Array<Record<string, unknown>>)];
      const colTomb = { ...(state.tombstones?.[col] || {}) };
      const key = `${col}/${f.id}`;
      const idx = arr.findIndex((x) => String(x.id) === f.id);
      const localObj = idx >= 0 ? arr[idx] : null;
      const localTs = localObj
        ? Number(localObj.updatedAt) || 0
        : colTomb[f.id] !== undefined
        ? colTomb[f.id]
        : -1;

      if (f.u < localTs) {
        meta.dirty[key] = 1;
        return;
      }
      if (f.u === localTs && (f.d ? !localObj : localObj && serializeEntity(localObj) === f.j)) {
        return;
      }

      if (f.d) {
        if (idx >= 0) {
          arr.splice(idx, 1);
          changed = true;
        }
        colTomb[f.id] = f.u;
        delete meta.hashes[key];
      } else {
        try {
          const parsedObj = JSON.parse(f.j) as Record<string, unknown>;
          // Ensure LGPD & auth safety on incoming cloud payloads too
          delete parsedObj.passcode;
          delete parsedObj.patternNodes;
          delete parsedObj.unlockPattern;
          delete parsedObj.pin;
          delete parsedObj.password;
          delete parsedObj.senha;
          parsedObj.id = localObj ? localObj.id : parsedObj.id || f.id;
          parsedObj.updatedAt = f.u;
          if (idx >= 0) arr[idx] = parsedObj;
          else arr.push(parsedObj);
          delete colTomb[f.id];
          meta.hashes[key] = stableHash(serializeEntity(parsedObj));
          changed = true;
        } catch {
          return;
        }
      }

      delete meta.dirty[key];
      state = {
        ...state,
        [col]: arr,
        tombstones: { ...(state.tombstones || {}), [col]: colTomb },
      };
    });

    if (docs.length < PAGE || !maxTimestamp || (Date.parse(maxTimestamp) || 0) <= (Date.parse(cur) || 0)) {
      break;
    }
    cur = maxTimestamp;
  }

  if (maxTimestamp) meta.cursor = maxTimestamp;
  else if (!meta.cursor) meta.cursor = readTime || new Date().toISOString();

  if (fullPull) {
    // Reconcile any local items never seen on server
    COLLECTIONS.forEach((col) => {
      const arr = (state[col] as unknown as Array<Record<string, unknown>>) || [];
      arr.forEach((item) => {
        const k = `${col}/${item.id}`;
        if (!seenKeys.has(k)) meta.dirty[k] = 1;
      });
      Object.keys(state.tombstones?.[col] || {}).forEach((id) => {
        const k = `${col}/${id}`;
        if (!seenKeys.has(k)) meta.dirty[k] = 1;
      });
    });
    SINGLETON_KEYS.forEach((sk) => {
      const k = `cfg/${sk}`;
      if (!seenKeys.has(k)) meta.dirty[k] = 1;
    });
    const cfgObj = (state.cfg || {}) as unknown as Record<string, unknown>;
    Object.keys(cfgObj).forEach((ck) => {
      if (
        ck === '_ts' ||
        ck === 'updatedAt' ||
        (SINGLETON_KEYS as readonly string[]).includes(ck) ||
        cfgObj[ck] === undefined
      ) {
        return;
      }
      const key = `cfg/${ck}`;
      if (!seenKeys.has(key)) meta.dirty[key] = 1;
    });
    COUNTER_KEYS.forEach((ck) => {
      const k = `cnt/${ck}`;
      if (!seenKeys.has(k)) meta.dirty[k] = 1;
    });
  }

  // 2) PUSH dirty records
  const readRecord = (key: string): FirestoreFieldReg | null => {
    const slash = key.indexOf('/');
    const l = key.slice(0, slash);
    const id = key.slice(slash + 1);
    if (l === 'cnt') {
      const counters = state.counters || { nextOrderNumber: 0, nextSaleNumber: 0, nextPurchaseNumber: 0 };
      return { l, id, u: Number(counters[id as (typeof COUNTER_KEYS)[number]]) || 0, d: false, j: '' };
    }
    if (l === 'cfg') {
      if ((SINGLETON_KEYS as readonly string[]).includes(id)) {
        const sk = id as (typeof SINGLETON_KEYS)[number];
        const val = state[sk];
        const u = state.singletonTimestamps?.[sk] || 0;
        return { l, id, u, d: false, j: JSON.stringify(val) };
      }
      const cfgObj = (state.cfg || {}) as unknown as Record<string, unknown>;
      const cfgTs = (cfgObj._ts as Record<string, number> | undefined) || {};
      const u = cfgTs[id] || 0;
      return cfgObj[id] !== undefined
        ? { l, id, u, d: false, j: JSON.stringify(cfgObj[id]) }
        : { l, id, u, d: true, j: '' };
    }
    const col = l as CollectionKey;
    const arr = (state[col] as unknown as Array<Record<string, unknown>>) || [];
    const found = arr.find((x) => String(x.id) === id);
    if (found) {
      return { l, id, u: Number(found.updatedAt) || 0, d: false, j: serializeEntity(found) };
    }
    const tombTs = state.tombstones?.[col]?.[id];
    if (tombTs !== undefined) {
      return { l, id, u: tombTs, d: true, j: '' };
    }
    return null;
  };

  const MAX_JSON_BYTES = 900000;
  const BATCH = 100;
  const writes: Array<{ key: string; reg: FirestoreFieldReg }> = [];
  Object.keys(meta.dirty).forEach((k) => {
    const r = readRecord(k);
    if (!r) {
      delete meta.dirty[k];
      return;
    }
    if (r.j.length > MAX_JSON_BYTES) {
      warning = `Registro grande demais para a nuvem (ignorado): ${k}`;
      delete meta.dirty[k];
      return;
    }
    writes.push({ key: k, reg: r });
  });

  for (let i = 0; i < writes.length; i += BATCH) {
    const chunk = writes.slice(i, i + BATCH);
    await postFs(':commit', {
      writes: chunk.map(({ key, reg }) => ({
        update: {
          name: `projects/${auth.projectId}/databases/(default)/documents/usuarios/${auth.uid}/reg/${docIdFromKey(key)}`,
          fields: encodeDocFields(reg),
        },
        updateTransforms: [{ fieldPath: 's', setToServerValue: 'REQUEST_TIME' }],
      })),
    });
    chunk.forEach(({ key, reg }) => {
      const latest = readRecord(key);
      if (!latest || latest.u === reg.u) {
        delete meta.dirty[key];
      }
      if (reg.l === 'cnt') {
        meta.cnt[reg.id] = reg.u;
      }
    });
  }

  meta.lastSyncAt = Date.now();
  saveSyncMetadata(auth.uid, meta);
  state = sanitizeLabStateForPersistence(state);

  return { state, meta, auth, changed, warning };
}

export function formatFirebaseSyncError(err: unknown, auth: FirebaseAuthState): string {
  return translateFirebaseError(err, auth);
}
