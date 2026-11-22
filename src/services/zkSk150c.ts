// Wuzhi ZK-SK150C Modbus RTU Protocol Engine (Web Bluetooth BLE, Web Serial USB, and Explicit Simulation)

export const ZK_LIMITS = {
  vmin: 0.5,
  vmax: 48.0,
  imax: 8.2,
} as const;

export const ZK_BLOCKED_REGS: Record<number, string> = {
  0x20: 'Restaurar fábrica',
  0x21: 'Zerar',
  0x2f: 'Reiniciar',
};

export const ZK_PROT_LABELS = [
  'Normal',
  'Sobretensão (OVP)',
  'Sobrecorrente (OCP)',
  'Sobrepotência (OPP)',
  'Subtensão (LVP)',
  'Limite de Ah (OAH)',
  'Limite de tempo (OHP)',
  'Sobretemperatura (OTP)',
  'OEP',
  'Limite de Wh (OWH)',
  'ICP',
  'IVP',
] as const;

export type ProtKey = 'ovp' | 'ocp' | 'opp' | 'lvp' | 'otp';

export interface ProtDef {
  offset: number;
  divisor: number | null;
  min: number;
  max: number;
  readMaxPlausible: number;
  decimals: number;
  unit: string;
  label: string;
}

export const ZK_PGRP_BASE = 0x50;
export const ZK_PGRP_STEP = 0x10;
export const ZK_PGRP_MAX = 10;

export const ZK_PROT_DEFS: Record<ProtKey, ProtDef> = {
  ovp: { offset: 3, divisor: 100, min: 0.5, max: 48, readMaxPlausible: 60, decimals: 2, unit: 'V', label: 'OVP' },
  ocp: { offset: 4, divisor: null, min: 0.1, max: 8.2, readMaxPlausible: 20, decimals: 3, unit: 'A', label: 'OCP' },
  opp: {
    offset: 5,
    divisor: 10,
    min: 1,
    max: Math.round(ZK_LIMITS.vmax * ZK_LIMITS.imax),
    readMaxPlausible: 1000,
    decimals: 1,
    unit: 'W',
    label: 'OPP',
  },
  lvp: { offset: 2, divisor: 100, min: 0, max: 48, readMaxPlausible: 60, decimals: 2, unit: 'V', label: 'LVP' },
  otp: { offset: 0x0c, divisor: 10, min: 45, max: 85, readMaxPlausible: 200, decimals: 1, unit: '°C', label: 'OTP' },
};

export const ZK_PROT_KEYS: ProtKey[] = ['ovp', 'ocp', 'opp', 'lvp', 'otp'];

export function protRegAddress(key: ProtKey, group: number): number {
  return ZK_PGRP_BASE + group * ZK_PGRP_STEP + ZK_PROT_DEFS[key].offset;
}

export function protDivisor(key: ProtKey, iscale: 100 | 1000): number {
  return ZK_PROT_DEFS[key].divisor ?? iscale;
}

export function protRange(key: ProtKey, otpUnit: 'C' | 'F'): ProtDef {
  if (key === 'otp' && otpUnit === 'F') {
    return { ...ZK_PROT_DEFS.otp, min: 113, max: 185, unit: '°F' };
  }
  return ZK_PROT_DEFS[key];
}

export function isProtectionReg(reg: number): boolean {
  return ZK_PROT_KEYS.some((k) => {
    const d = reg - ZK_PGRP_BASE - ZK_PROT_DEFS[k].offset;
    return d >= 0 && d % ZK_PGRP_STEP === 0 && d / ZK_PGRP_STEP <= ZK_PGRP_MAX;
  });
}

export function isAllowedControlReg(reg: number, val: number): boolean {
  return reg === 0 || reg === 1 || (reg === 0x12 && (val === 0 || val === 1));
}

export function isValidProtWrite(
  reg: number,
  rawVal: number,
  ctx: { group: number; otpUnit: 'C' | 'F'; iscale: 100 | 1000 } | null
): boolean {
  if (!ctx || !Number.isInteger(ctx.group) || ctx.group < 0 || ctx.group > ZK_PGRP_MAX) return false;
  return ZK_PROT_KEYS.some((k) => {
    const def = protRange(k, ctx.otpUnit);
    const div = protDivisor(k, ctx.iscale);
    return (
      reg === protRegAddress(k, ctx.group) &&
      Number.isInteger(rawVal) &&
      rawVal >= Math.round(def.min * div) &&
      rawVal <= Math.round(def.max * div)
    );
  });
}

export function crc16Modbus(bytes: ArrayLike<number>): number {
  let c = 0xffff;
  for (let idx = 0; idx < bytes.length; idx++) {
    c ^= bytes[idx];
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? (c >> 1) ^ 0xa001 : c >> 1;
    }
  }
  return c;
}

export function buildModbusFrame(payload: number[]): Uint8Array {
  const c = crc16Modbus(payload);
  return Uint8Array.from([...payload, c & 0xff, c >> 8]);
}

const MODBUS_EXC: Record<number, string> = {
  1: 'função inválida',
  2: 'endereço de dado inválido',
  3: 'valor inválido',
  4: 'falha no dispositivo',
};

export interface ZkTransport {
  readonly mode: 'ble' | 'usb' | 'sim';
  readonly label: string;
  readonly timeout: number;
  readonly rx: number[];
  write(frame: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface ModbusClient {
  readRegisters(addr: number, start: number, count: number): Promise<number[]>;
  writeRegister(addr: number, reg: number, value: number): Promise<void>;
}

export function createModbusClient(
  transport: ZkTransport,
  canWriteProtections: () => boolean,
  getProtContext: () => { group: number; otpUnit: 'C' | 'F'; iscale: 100 | 1000 } | null
): ModbusClient {
  let chain: Promise<unknown> = Promise.resolve();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function txrx(frame: Uint8Array, expectedLen: number): Promise<number[]> {
    const task = chain.then(async () => {
      transport.rx.length = 0;
      await transport.write(frame);
      const started = Date.now();
      while (
        transport.rx.length < expectedLen &&
        !(transport.rx.length >= 5 && (transport.rx[1] & 128) !== 0) &&
        Date.now() - started < transport.timeout
      ) {
        await sleep(10);
      }
      if (transport.rx.length >= 5 && (transport.rx[1] & 128) !== 0 && transport.rx[1] === (frame[1] | 128)) {
        const code = transport.rx[2];
        const hex = code.toString(16).toUpperCase().padStart(2, '0');
        throw new Error(`A fonte recusou o comando (exceção 0x${hex}: ${MODBUS_EXC[code] || 'desconhecida'}).`);
      }
      if (transport.rx.length < expectedLen) {
        throw new Error('Sem resposta da fonte. Confira conexão e endereço Modbus.');
      }
      const resp = transport.rx.slice(0, expectedLen);
      const expectedCrc = resp[expectedLen - 2] | (resp[expectedLen - 1] << 8);
      if (crc16Modbus(resp.slice(0, -2)) !== expectedCrc) {
        throw new Error('Resposta da fonte com erro de CRC.');
      }
      if (resp[0] !== frame[0] || resp[1] !== frame[1]) {
        throw new Error('Resposta inesperada do barramento Modbus.');
      }
      return resp;
    });
    chain = task.catch(() => undefined);
    return task;
  }

  return {
    async readRegisters(addr: number, start: number, count: number): Promise<number[]> {
      const resp = await txrx(buildModbusFrame([addr, 3, start >> 8, start & 255, 0, count]), 5 + 2 * count);
      return Array.from({ length: count }, (_, i) => (resp[3 + 2 * i] << 8) | resp[4 + 2 * i]);
    },
    async writeRegister(addr: number, reg: number, value: number): Promise<void> {
      if (ZK_BLOCKED_REGS[reg] !== undefined) {
        throw new Error(`Bloqueado: ${ZK_BLOCKED_REGS[reg]} nunca é enviado por este painel.`);
      }
      if (isProtectionReg(reg)) {
        if (!canWriteProtections()) {
          throw new Error('Intertravamento: desligue a saída e libere o controle para alterar proteções.');
        }
        if (!isValidProtWrite(reg, value, getProtContext())) {
          throw new Error('Valor de proteção fora da faixa segura permitida.');
        }
      } else if (!isAllowedControlReg(reg, value)) {
        throw new Error('Registrador ou valor bloqueado neste painel de segurança.');
      }
      await txrx(buildModbusFrame([addr, 6, reg >> 8, reg & 255, value >> 8, value & 255]), 8);
    },
  };
}

export async function connectWebBluetooth(onUnexpectedDisconnect: () => void): Promise<ZkTransport> {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error(
      'Este navegador não suporta Web Bluetooth. Use Google Chrome ou Microsoft Edge (HTTPS/localhost).'
    );
  }
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [0xfff0] }, { services: [0xffe0] }, { namePrefix: 'Wuzhi' }],
    optionalServices: [0xfff0, 0xffe0],
  });
  if (!device.gatt) {
    throw new Error('Dispositivo BLE sem servidor GATT disponível.');
  }
  const server = await device.gatt.connect();

  let service: BluetoothRemoteGATTService;
  let notifyCharUuid = 0xfff1;
  let writeFallbackUuid = 0xfff2;

  try {
    service = await server.getPrimaryService(0xfff0);
    notifyCharUuid = 0xfff1;
    writeFallbackUuid = 0xfff2;
  } catch {
    service = await server.getPrimaryService(0xffe0);
    notifyCharUuid = 0xffe1;
    writeFallbackUuid = 0xffe2;
  }

  const ch = await service.getCharacteristic(notifyCharUuid);
  let writeCh: BluetoothRemoteGATTCharacteristic = ch;
  if (ch.properties && !ch.properties.writeWithoutResponse && !ch.properties.write) {
    try {
      writeCh = await service.getCharacteristic(writeFallbackUuid);
    } catch {
      writeCh = ch;
    }
  }

  const rx: number[] = [];

  const handleNotify = (ev: Event) => {
    const target = ev.target as BluetoothRemoteGATTCharacteristic;
    const v = target.value;
    if (v) {
      rx.push(...new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    }
  };

  ch.addEventListener('characteristicvaluechanged', handleNotify);
  await ch.startNotifications();

  const handleDisconnect = () => {
    onUnexpectedDisconnect();
  };
  device.addEventListener('gattserverdisconnected', handleDisconnect);

  return {
    mode: 'ble',
    label: device.name ? `Bluetooth (${device.name})` : 'Bluetooth BLE',
    timeout: 1500,
    rx,
    async write(frame: Uint8Array) {
      for (let i = 0; i < frame.length; i += 20) {
        const chunk = frame.slice(i, i + 20);
        if (writeCh.properties?.writeWithoutResponse && typeof writeCh.writeValueWithoutResponse === 'function') {
          await writeCh.writeValueWithoutResponse(chunk);
        } else if (typeof writeCh.writeValue === 'function') {
          await writeCh.writeValue(chunk);
        } else if (typeof writeCh.writeValueWithResponse === 'function') {
          await writeCh.writeValueWithResponse(chunk);
        } else if (typeof writeCh.writeValueWithoutResponse === 'function') {
          await writeCh.writeValueWithoutResponse(chunk);
        }
      }
    },
    async close() {
      device.removeEventListener('gattserverdisconnected', handleDisconnect);
      ch.removeEventListener('characteristicvaluechanged', handleNotify);
      try {
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
      } catch {
        // Ignore disconnect errors
      }
    },
  };
}

export async function connectWebSerial(
  baudRate: number,
  onUnexpectedDisconnect: () => void
): Promise<ZkTransport> {
  if (typeof navigator === 'undefined' || !navigator.serial) {
    throw new Error(
      'Este navegador não suporta Web Serial (USB). Use Chrome ou Edge no desktop.'
    );
  }
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
  if (!port.writable || !port.readable) {
    throw new Error('Porta USB aberta sem streams de leitura/escrita.');
  }

  const writer = port.writable.getWriter();
  const reader = port.readable.getReader();
  const rx: number[] = [];
  let closed = false;

  (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) rx.push(...value);
      }
    } catch {
      // Stream closed
    }
  })();

  const handleDisconnect = () => {
    if (!closed) onUnexpectedDisconnect();
  };
  port.addEventListener('disconnect', handleDisconnect);

  return {
    mode: 'usb',
    label: `USB Serial (${baudRate} bps)`,
    timeout: 600,
    rx,
    async write(frame: Uint8Array) {
      await writer.write(frame);
    },
    async close() {
      closed = true;
      port.removeEventListener('disconnect', handleDisconnect);
      try {
        await reader.cancel();
        reader.releaseLock();
      } catch {
        // Ignore reader cleanup error
      }
      try {
        writer.releaseLock();
      } catch {
        // Ignore writer cleanup error
      }
      try {
        await port.close();
      } catch {
        // Ignore port close error
      }
    },
  };
}

/**
 * Transporte de Simulação explícita (ONLY usado quando o técnico ativa manualmente o Modo Demonstração).
 * Responde aos mesmos frames Modbus RTU 0x03 e 0x06 para validar fluxo sem hardware físico.
 */
export function createSimulatedTransport(iscale: 100 | 1000 = 1000): ZkTransport {
  const rx: number[] = [];
  const regs = new Map<number, number>();
  // Defaults at 4.20V / 2.000A, Output OFF initially
  regs.set(0, 420); // V-SET
  regs.set(1, iscale === 1000 ? 2000 : 200); // I-SET
  regs.set(5, 2400); // U-IN 24.00V
  regs.set(13, 315); // Temp 31.5°C
  regs.set(16, 0); // Prot Normal
  regs.set(17, 0); // CV
  regs.set(18, 0); // Output OFF
  regs.set(0x13, 0); // Temp symbol °C
  regs.set(0x1d, 0); // Quick group
  regs.set(22, 4008); // Model
  regs.set(23, 14); // Firmware

  // Seed M0..M10 protection defaults
  for (let g = 0; g <= ZK_PGRP_MAX; g++) {
    regs.set(protRegAddress('lvp', g), 0);
    regs.set(protRegAddress('ovp', g), 4800);
    regs.set(protRegAddress('ocp', g), iscale === 1000 ? 8200 : 820);
    regs.set(protRegAddress('opp', g), 1500); // 150.0W
    regs.set(protRegAddress('otp', g), 850); // 85.0°C
  }

  let simStartMs = Date.now();
  let ahAccum = 0;
  let whAccum = 0;
  let lastTick = Date.now();

  const updateDynamicRegs = () => {
    const now = Date.now();
    const dtHours = Math.max(0, (now - lastTick) / 3600000);
    lastTick = now;

    const out = regs.get(18) === 1;
    const vSet = (regs.get(0) || 420) / 100;
    const iSetRaw = regs.get(1) || 1000;
    const iSet = iSetRaw / iscale;

    if (!out) {
      regs.set(2, 0);
      regs.set(3, 0);
      regs.set(13, 290);
      regs.set(17, 0);
      simStartMs = now;
    } else {
      const elapsedSec = Math.floor((now - simStartMs) / 1000);
      const hh = Math.floor(elapsedSec / 3600);
      const mm = Math.floor((elapsedSec % 3600) / 60);
      const ss = elapsedSec % 60;
      regs.set(10, hh);
      regs.set(11, mm);
      regs.set(12, ss);

      const jitter = (Math.random() - 0.5) * 0.025;
      const baseLoad = vSet <= 1.5 ? Math.min(iSet, 0.98) : Math.min(iSet * 0.92, 0.885);
      const actualI = Math.max(0.015, Math.min(iSet, baseLoad + jitter));
      const inCC = iSet > 0 && actualI >= iSet * 0.96;
      const actualV = inCC ? Math.max(0.4, vSet * 0.72) : vSet;

      ahAccum += actualI * dtHours;
      whAccum += actualI * actualV * dtHours;

      const ahInt = Math.round(ahAccum * 1000);
      const whInt = Math.round(whAccum * 1000);
      regs.set(6, ahInt & 0xffff);
      regs.set(7, (ahInt >> 16) & 0xffff);
      regs.set(8, whInt & 0xffff);
      regs.set(9, (whInt >> 16) & 0xffff);

      regs.set(2, Math.round(actualV * 100));
      regs.set(3, Math.round(actualI * iscale));
      regs.set(17, inCC ? 1 : 0);
      regs.set(13, Math.round((32 + actualV * actualI * 0.7) * 10));
    }
  };

  return {
    mode: 'sim',
    label: 'MODO SIMULAÇÃO (Dados Fictícios)',
    timeout: 400,
    rx,
    async write(frame: Uint8Array) {
      const addr = frame[0];
      const fn = frame[1];
      if (fn === 3) {
        updateDynamicRegs();
        const start = (frame[2] << 8) | frame[3];
        const count = (frame[4] << 8) | frame[5];
        const bytes: number[] = [addr, 3, count * 2];
        for (let i = 0; i < count; i++) {
          const val = regs.get(start + i) ?? 0;
          bytes.push((val >> 8) & 0xff, val & 0xff);
        }
        const resp = buildModbusFrame(bytes);
        setTimeout(() => {
          rx.push(...resp);
        }, 25);
      } else if (fn === 6) {
        const reg = (frame[2] << 8) | frame[3];
        const val = (frame[4] << 8) | frame[5];
        if (reg === 0x12 && val === 1 && regs.get(18) !== 1) {
          simStartMs = Date.now();
        }
        regs.set(reg, val);
        setTimeout(() => {
          rx.push(...frame);
        }, 25);
      }
    },
    async close() {
      // Nothing to release
    },
  };
}

export interface ZkTelemetrySample {
  vSet: number;
  iSet: number;
  vOut: number;
  iOut: number;
  pOut: number;
  uIn: number;
  tempC: number;
  ah: number;
  wh: number;
  durationStr: string;
  protCode: number;
  protLabel: string;
  isCC: boolean;
  outputOn: boolean;
  model: number;
  firmware: number;
  timestamp: number;
}

export function parseZkRegisters(r: number[], iscale: 100 | 1000): ZkTelemetrySample {
  const vSet = r[0] / 100;
  const iSet = r[1] / iscale;
  const vOut = r[2] / 100;
  const iOut = r[3] / iscale;
  const pOut = Math.round(vOut * iOut * 100) / 100;
  const uIn = r[5] / 100;
  const ah = ((r[7] << 16) + r[6]) / 1000;
  const wh = ((r[9] << 16) + r[8]) / 1000;
  const p2 = (n: number) => String(n).padStart(2, '0');
  const durationStr = `${p2(r[10])}:${p2(r[11])}:${p2(r[12])}`;
  const tempC = r[13] / 10;
  const protCode = r[16];
  const protLabel = ZK_PROT_LABELS[protCode] || `Código ${protCode}`;
  const isCC = r[17] === 1;
  const outputOn = r[18] === 1;

  return {
    vSet,
    iSet,
    vOut,
    iOut,
    pOut,
    uIn,
    tempC,
    ah,
    wh,
    durationStr,
    protCode,
    protLabel,
    isCC,
    outputOn,
    model: r[22],
    firmware: r[23],
    timestamp: Date.now(),
  };
}

export interface EvidenceEvent {
  timestamp: number;
  kind: 'info' | 'out' | 'prot' | 'fuga' | 'pulso' | 'curto' | 'alto' | 'cmd' | 'cfg';
  text: string;
  cliText?: string;
  currentA?: number;
}

export interface ZkSessionSummary {
  ini: number;
  fim: number;
  via: string;
  vset: number | null;
  iset: number | null;
  n: number;
  imin: number | null;
  iavg: number | null;
  ipk: number | null;
  vpk: number | null;
  vavg: number | null;
  pmax: number | null;
  pavg: number | null;
  ms: number;
  prots: { t: number; nm: string }[];
  bootPk: number | null;
  fugaA: number | null;
  evid: EvidenceEvent[];
  tl: EvidenceEvent[];
}

// Limiares de detecção de evidência do laboratório (não são valores de fábrica)
export const TELEMETRY_THRESHOLDS = {
  fugaA: 0.02, // 20 mA
  estavelRatio: 0.1,
  pulsoA: 0.15, // 150 mA
  ccRatio: 0.95,
  altoA: 0.8, // 800 mA
  estabSec: 15,
  janAlto: 20,
  janFuga: 6,
};

const fmtDec = (n: number, dec: number) => n.toFixed(dec).replace('.', ',');

export class ZkSessionTracker {
  readonly ini: number;
  fim: number | null = null;
  via: string;
  events: EvidenceEvent[] = [];
  prots: { t: number; nm: string }[] = [];
  bootPk: number | null = null;

  private vSet: number | null = null;
  private iSet: number | null = null;
  private out: boolean | null = null;
  private prot = 0;
  private lastOnTimestamp: number | null = null;
  private cmdT = 0;

  private onCount = 0;
  private onMs = 0;
  private vMax = 0;
  private vSum = 0;
  private iMin = Infinity;
  private iMax = 0;
  private iSum = 0;
  private pMax = 0;
  private pSum = 0;

  private onSince = 0;
  private win: Array<{ t: number; i: number }> = [];
  private bootDetected = false;
  private bootTime = 0;
  private fugaDetected = false;
  private curtoDetected = false;
  private altoDetected = false;
  private ccCount = 0;
  private ccOffCount = 0;
  private firstOnSample = true;

  constructor(via = 'Sessão ZK-SK150C') {
    this.ini = Date.now();
    this.via = via;
  }

  private pushEvent(
    kind: EvidenceEvent['kind'],
    text: string,
    extra?: { cliText?: string; currentA?: number }
  ) {
    if (this.events.length >= 500) this.events.shift();
    this.events.push({ timestamp: Date.now(), kind, text, ...extra });
  }

  recordCommand(kind: 'cmd' | 'cfg', text: string) {
    this.cmdT = Date.now();
    this.pushEvent(kind, text);
  }

  markClosed(emergency = false) {
    if (this.fim === null) {
      this.fim = Date.now();
      this.pushEvent('info', `Conexão encerrada${emergency ? ' (emergência)' : ''}`);
    }
  }

  feed(sample: ZkTelemetrySample, iscale: 100 | 1000) {
    const t = sample.timestamp;
    const dec = iscale === 1000 ? 3 : 2;
    if (this.vSet === null) {
      this.pushEvent(
        'info',
        `Início do registro: V-SET ${fmtDec(sample.vSet, 2)} V · I-SET ${fmtDec(sample.iSet, dec)} A`
      );
    } else if (
      (sample.vSet !== this.vSet || sample.iSet !== this.iSet) &&
      t - this.cmdT > 3000
    ) {
      this.pushEvent(
        'cmd',
        `V-SET/I-SET alterados na fonte: ${fmtDec(sample.vSet, 2)} V · ${fmtDec(sample.iSet, dec)} A`
      );
    }
    this.vSet = sample.vSet;
    this.iSet = sample.iSet;

    if (this.out === null) {
      this.out = sample.outputOn;
      if (sample.outputOn) this.pushEvent('out', 'Saída já estava ligada ao conectar');
    } else if (sample.outputOn !== this.out) {
      this.out = sample.outputOn;
      this.pushEvent('out', sample.outputOn ? 'Saída ligada' : 'Saída desligada');
    }

    if (sample.protCode !== 0 && sample.protCode !== this.prot) {
      this.prots.push({ t, nm: sample.protLabel });
      this.pushEvent('prot', `Proteção acionada: ${sample.protLabel}`);
      if ((sample.protCode === 2 || sample.protCode === 3) && !this.curtoDetected) {
        this.curtoDetected = true;
        this.pushEvent(
          'curto',
          `Disparo de ${sample.protLabel} com ${fmtDec(sample.iOut, dec)} A e ${fmtDec(sample.vOut, 2)} V.`,
          {
            cliText:
              'A fonte desligou a saída por proteção de sobrecarga. Isso pode indicar um curto ou consumo acima do esperado e precisa de avaliação.',
          }
        );
      }
    }
    this.prot = sample.protCode;

    if (!sample.outputOn) {
      this.lastOnTimestamp = null;
      this.win = [];
      this.bootDetected = false;
      this.fugaDetected = false;
      this.curtoDetected = false;
      this.altoDetected = false;
      this.ccCount = 0;
      this.ccOffCount = 0;
      this.firstOnSample = true;
      this.onSince = 0;
      return;
    }

    this.onCount += 1;
    if (this.lastOnTimestamp !== null) {
      this.onMs += Math.min(t - this.lastOnTimestamp, 2000);
    }
    this.lastOnTimestamp = t;
    this.vMax = Math.max(this.vMax, sample.vOut);
    this.vSum += sample.vOut;
    this.iMin = Math.min(this.iMin, sample.iOut);
    this.iMax = Math.max(this.iMax, sample.iOut);
    this.iSum += sample.iOut;
    this.pMax = Math.max(this.pMax, sample.pOut);
    this.pSum += sample.pOut;

    if (!this.onSince) this.onSince = t;
    this.win.push({ t, i: sample.iOut });
    if (this.win.length > 40) this.win.shift();

    const ccNow =
      sample.isCC && sample.iSet > 0 && sample.iOut >= TELEMETRY_THRESHOLDS.ccRatio * sample.iSet;

    if (!this.bootDetected) {
      if (this.firstOnSample) {
        if (sample.iOut >= TELEMETRY_THRESHOLDS.pulsoA) {
          this.bootDetected = true;
          this.bootTime = t;
          this.pushEvent('pulso', `Consumo já alto ao ligar a saída: ${fmtDec(sample.iOut, dec)} A`);
        }
      } else {
        const prevSlice = this.win.slice(-5, -1);
        if (prevSlice.length >= 2) {
          const avgPrev = prevSlice.reduce((s, x) => s + x.i, 0) / prevSlice.length;
          if (sample.iOut - avgPrev >= TELEMETRY_THRESHOLDS.pulsoA) {
            this.bootDetected = true;
            this.bootTime = t;
            this.pushEvent(
              'pulso',
              `Pulso de consumo: ${fmtDec(sample.iOut, dec)} A (antes ${fmtDec(avgPrev, dec)} A)`
            );
          }
        }
      }
    }
    this.firstOnSample = false;

    if (this.bootDetected && this.bootTime && t - this.bootTime <= 10000) {
      this.bootPk = Math.max(this.bootPk || 0, sample.iOut);
    }

    if (!this.bootDetected && !this.fugaDetected && !ccNow) {
      const fWin = this.win.slice(-TELEMETRY_THRESHOLDS.janFuga);
      if (fWin.length >= TELEMETRY_THRESHOLDS.janFuga && t - this.onSince >= 2000) {
        const vals = fWin.map((x) => x.i);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const spread = Math.max(...vals) - Math.min(...vals);
        if (
          avg > TELEMETRY_THRESHOLDS.fugaA &&
          spread <= Math.max(2 / iscale, TELEMETRY_THRESHOLDS.estavelRatio * avg)
        ) {
          this.fugaDetected = true;
          const fugaMaStr = Math.round(avg * 1000).toString();
          this.pushEvent(
            'fuga',
            `Corrente estabilizou em ${fugaMaStr} mA com a saída ligada, antes de qualquer pulso de boot (limite de alerta: ${Math.round(
              TELEMETRY_THRESHOLDS.fugaA * 1000
            )} mA).`,
            {
              currentA: avg,
              cliText: `Com o aparelho sem acionar o botão de ligar, o consumo se manteve em cerca de ${fugaMaStr} mA. Isso costuma indicar algo consumindo energia em espera e pode precisar de avaliação.`,
            }
          );
        }
      }
    }

    if (ccNow) {
      this.ccCount++;
      this.ccOffCount = 0;
    } else {
      this.ccOffCount++;
      if (this.ccOffCount >= 3) {
        this.ccCount = 0;
        this.curtoDetected = false;
      }
    }
    if (this.ccCount >= 2 && !this.curtoDetected) {
      this.curtoDetected = true;
      const vDropTxt =
        sample.vSet > 0 && sample.vOut < 0.9 * sample.vSet
          ? `; tensão caiu para ${fmtDec(sample.vOut, 2)} V (V-SET ${fmtDec(sample.vSet, 2)} V)`
          : '';
      this.pushEvent(
        'curto',
        `Corrente chegou ao limite I-SET (${fmtDec(sample.iOut, dec)} A de ${fmtDec(
          sample.iSet,
          dec
        )} A) e a fonte entrou em modo CC${vDropTxt}.`,
        {
          currentA: sample.iOut,
          cliText: `A corrente subiu até o limite configurado na fonte (${fmtDec(
            sample.iSet,
            dec
          )} A). Isso pode indicar um curto ou sobrecarga e precisa de avaliação.`,
        }
      );
    }

    if (!ccNow) {
      const aWin = this.win.slice(-TELEMETRY_THRESHOLDS.janAlto);
      if (aWin.length >= TELEMETRY_THRESHOLDS.janAlto) {
        const vals = aWin.map((x) => x.i);
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const spread = Math.max(...vals) - Math.min(...vals);
        const durSec = Math.round((aWin[aWin.length - 1].t - aWin[0].t) / 1000);
        if (
          !this.altoDetected &&
          t - this.onSince >= TELEMETRY_THRESHOLDS.estabSec * 1000 &&
          (!this.bootTime || t - this.bootTime >= 10000) &&
          avg >= TELEMETRY_THRESHOLDS.altoA &&
          spread <= 0.35 * avg
        ) {
          this.altoDetected = true;
          this.pushEvent(
            'alto',
            `Corrente média de ${fmtDec(avg, dec)} A nos últimos ${durSec} s, com o sistema já estabilizado (limite de alerta: ${fmtDec(
              TELEMETRY_THRESHOLDS.altoA,
              3
            )} A).`,
            {
              currentA: avg,
              cliText: `Depois de estabilizar, o consumo ficou em cerca de ${fmtDec(
                avg,
                dec
              )} A de forma contínua, acima do nosso limite de alerta (${fmtDec(
                TELEMETRY_THRESHOLDS.altoA,
                3
              )} A). Pode indicar algo mantendo o aparelho muito ativo.`,
            }
          );
        } else if (this.altoDetected && avg < 0.7 * TELEMETRY_THRESHOLDS.altoA) {
          this.altoDetected = false;
        }
      }
    }
  }

  getSummary(): ZkSessionSummary {
    const n = this.onCount;
    const fugaEv = this.events.find((e) => e.kind === 'fuga');
    return {
      ini: this.ini,
      fim: this.fim ?? Date.now(),
      via: this.via,
      vset: this.vSet,
      iset: this.iSet,
      n,
      imin: n > 0 ? this.iMin : null,
      iavg: n > 0 ? this.iSum / n : null,
      ipk: n > 0 ? this.iMax : null,
      vpk: n > 0 ? this.vMax : null,
      vavg: n > 0 ? this.vSum / n : null,
      pmax: n > 0 ? this.pMax : null,
      pavg: n > 0 ? this.pSum / n : null,
      ms: this.onMs,
      prots: [...this.prots],
      bootPk: this.bootPk,
      fugaA: fugaEv?.currentA ?? null,
      evid: this.events.filter((e) => e.kind === 'fuga' || e.kind === 'curto' || e.kind === 'alto'),
      tl: this.events.filter((e) => e.kind !== 'fuga' && e.kind !== 'curto' && e.kind !== 'alto'),
    };
  }
}
