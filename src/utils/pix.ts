/**
 * Gerador offline de payload PIX estático/reutilizável conforme padrão BCB EMVCo
 * com cálculo real de CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF).
 */

export function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function normalizePixText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .\-/]/g, '')
    .trim()
    .toUpperCase();
}

export function formatPixKeyForEmv(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (!trimmed) return '';

  // Telefone brasileiro formatado com DDD entre parênteses -> +55DDDNUMERO
  if (/^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    return `+55${digits}`;
  }

  return trimmed;
}

export interface BuildPixPayloadInput {
  pixKey: string;
  merchant?: string;
  city?: string;
  amount?: number;
  txid?: string;
}

export function buildPixPayload({
  pixKey,
  merchant = 'MICROLAB ASSISTENCIA TEC',
  city = 'SALVADOR',
  amount = 0,
  txid = '',
}: BuildPixPayloadInput): string {
  const formattedKey = formatPixKeyForEmv(pixKey);
  if (!formattedKey) return '';

  const merchantAccountInfo =
    tlv('00', 'br.gov.bcb.pix') + tlv('01', formattedKey);

  const normalizedMerchant =
    normalizePixText(merchant).slice(0, 25) || 'MICROLAB';
  const normalizedCity =
    normalizePixText(city).slice(0, 15) || 'SALVADOR';
  const cleanTxid =
    txid
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 25) || '***';

  const validAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

  const basePayload =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (validAmount > 0 ? tlv('54', validAmount.toFixed(2)) : '') +
    tlv('58', 'BR') +
    tlv('59', normalizedMerchant) +
    tlv('60', normalizedCity) +
    tlv('62', tlv('05', cleanTxid)) +
    '6304';

  return basePayload + crc16Ccitt(basePayload);
}
