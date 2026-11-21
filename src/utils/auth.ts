import { AppUser, RouteId, UserRole } from '../types/lab';

export const ML_LOCK_STORAGE_KEY = 'ml_lk';

export const USER_ROLES: readonly UserRole[] = [
  'Administrador',
  'Atendente',
  'Vendedor',
  'Técnico',
] as const;

export const ROLE_ALLOWED_ROUTES: Record<UserRole, '*' | readonly RouteId[]> = {
  Administrador: '*',
  Atendente: [
    'inicio',
    'nova-os',
    'ordens-de-servico',
    'check-in-check-out',
    'agenda-de-bancada',
    'simulador-orcamento',
    'pdv-rapido',
    'clientes',
    'garantias',
    'gerador-pix',
  ],
  Vendedor: [
    'inicio',
    'pdv-rapido',
    'ordens-de-servico',
    'nova-os',
    'clientes',
    'produtos-e-pecas',
    'gerador-pix',
  ],
  Técnico: [
    'inicio',
    'nova-os',
    'ordens-de-servico',
    'check-in-check-out',
    'agenda-de-bancada',
    'produtos-e-pecas',
    'garantias',
    'fonte-zk-sk150c',
    'diagnostico',
  ],
};

export function canRoleAccessRoute(
  role: UserRole | undefined | null,
  route: RouteId
): boolean {
  if (!role) return false;
  const allowed = ROLE_ALLOWED_ROUTES[role];
  if (allowed === '*') return true;
  return allowed.includes(route);
}

export function isAtendenteRole(role: UserRole | undefined | null): boolean {
  return role === 'Atendente';
}

export function generateSalt(): string {
  try {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256LegacyHex(text: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return bytesToHex(digest);
    }
  } catch {
    // fallback below
  }
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return text;
  }
}

export async function hashPinPBKDF2(pin: string, salt: string): Promise<string> {
  const cleanPin = String(pin || '');
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const enc = new TextEncoder();
      const baseKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(cleanPin),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      const bits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: enc.encode(salt),
          iterations: 150000,
        },
        baseKey,
        256
      );
      return `p3:${bytesToHex(bits)}`;
    }
  } catch {
    // Fallback below if WebCrypto subtle unavailable
  }
  return `p3x:${await sha256LegacyHex(`${salt}${cleanPin}`)}`;
}

export async function verifyUserPin(
  user: AppUser,
  pin: string
): Promise<{ ok: boolean; upgradedSalt?: string; upgradedHash?: string }> {
  const cleanPin = String(pin || '');
  if (!user || !cleanPin) return { ok: false };

  if (user.s) {
    const computed = await hashPinPBKDF2(cleanPin, user.s);
    return { ok: computed === user.h };
  }

  // Migração legada caso usuário antigo tenha vindo sem salt
  const legacySha = await sha256LegacyHex(`ml:${cleanPin}`);
  let legacyB64 = '';
  try {
    legacyB64 = btoa(`ml:${cleanPin}`);
  } catch {
    legacyB64 = '';
  }

  if (user.h === legacySha || (legacyB64 && user.h === legacyB64)) {
    const newSalt = generateSalt();
    const newHash = await hashPinPBKDF2(cleanPin, newSalt);
    return { ok: true, upgradedSalt: newSalt, upgradedHash: newHash };
  }

  return { ok: false };
}

export interface LoginLockState {
  n: number;
  until?: number;
}

export function getLoginLockStatus(): {
  attempts: number;
  lockedUntil: number;
  remainingSec: number;
} {
  try {
    const raw = localStorage.getItem(ML_LOCK_STORAGE_KEY);
    const parsed: LoginLockState = raw ? JSON.parse(raw) : { n: 0 };
    const attempts = Math.max(0, Number(parsed?.n) || 0);
    const lockedUntil = Math.max(0, Number(parsed?.until) || 0);
    const remainingSec = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
    return { attempts, lockedUntil, remainingSec };
  } catch {
    return { attempts: 0, lockedUntil: 0, remainingSec: 0 };
  }
}

export function recordFailedPinAttempt(): {
  attempts: number;
  lockedUntil: number;
  remainingSec: number;
} {
  const current = getLoginLockStatus();
  const nextAttempts = current.attempts + 1;
  const lockedUntil =
    nextAttempts >= 5 ? Date.now() + 30000 * (nextAttempts - 4) : 0;
  try {
    localStorage.setItem(
      ML_LOCK_STORAGE_KEY,
      JSON.stringify({ n: nextAttempts, ...(lockedUntil > 0 ? { until: lockedUntil } : {}) })
    );
  } catch {
    // ignore storage errors
  }
  const remainingSec = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  return { attempts: nextAttempts, lockedUntil, remainingSec };
}

export function clearLoginLockout(): void {
  try {
    localStorage.removeItem(ML_LOCK_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
