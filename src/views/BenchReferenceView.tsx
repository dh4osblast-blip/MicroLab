import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  BookOpen,
  Flame,
  Gauge,
  Search,
  Thermometer,
  Zap,
} from 'lucide-react';
import { RouteId } from '../types/lab';
import { useLabStore } from '../store/useLabStore';

interface BenchReferenceViewProps {
  onNavigate: (route: RouteId) => void;
}

const FPAR: readonly [string, string, string][] = [
  ['Teste de placa', '4,0 V a 4,2 V / 2 A', ''],
  ['Choque de bateria', '5,2 V / 2 A', 'PROIBIDO se a bateria estiver inchada ou oxidada.'],
  ['Placa conectada, pré-power', '0,000 mA', 'Oscilação até 0,020 mA = carga dos capacitores.'],
  ['Pulso de boot', '~120 mA (0,120 A) por 1 s', ''],
  ['Standby', '0 a 10 mA', 'Ou 10 a 80 mA com pico de 120 mA.'],
  ['Ligação (TX)', '300 a 450 mA', ''],
  ['Travado na fonte', '80 a 150 mA = software', '200 mA ou mais = fuga de corrente.'],
  ['Fuga', '> 50 mA em standby / ≥ 200 mA travado', ''],
  [
    'Curto total',
    'Limitar em 1 A',
    'Fonte apita/desarma: baixe a corrente para 1 A e procure o ponto que aquece.',
  ],
];

const TEMPS: readonly [string, string, string, string, string][] = [
  ['sep', 'Separadora (tela)', '90 °C', '—', 'Máx. 5 min'],
  ['tl', 'Estação · Touch / LCD / secagem', '100 °C', 'Ar máx.', ''],
  ['resina', 'Estação · Resina', '200 a 250 °C', 'Ar 6 a 7', ''],
  ['reflow', 'Estação · Reflow', '280 a 320 °C', 'Ar 5 a 6', 'Máx. 20 s'],
  ['blind', 'Estação · Blindagens', '290 a 320 °C', 'Ar 6 a 7', ''],
  ['smd', 'Estação · Solda SMD', '380 a 400 °C', 'Ar 5 a 6', ''],
  ['fe', 'Ferro de solda · Geral', '350 °C', '—', ''],
  ['malha', 'Ferro de solda · Malha dessoldadora', '400 °C', '—', ''],
];

const normSearch = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseDec = (s: string) => {
  const n = parseFloat(String(s || '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const fmtNum = (n: number, dec = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const BenchReferenceView: React.FC<BenchReferenceViewProps> = ({ onNavigate }) => {
  const { state, canAccessRoute, setTempCalibration, setPmicMinVoltage } = useLabStore();
  const [query, setQuery] = useState('');

  // Escala de diodo (dioCalc)
  const [dioInput, setDioInput] = useState('');

  // Resistência interna da bateria (riCalc)
  const [riV0, setRiV0] = useState('4,21');
  const [riV1, setRiV1] = useState('');
  const [riI, setRiI] = useState('1,5');
  const [pmicInput, setPmicInput] = useState(() =>
    fmtNum(Number(state.cfg.pmicMin) > 0 ? Number(state.cfg.pmicMin) : 3.4, 2)
  );

  // Dissipação térmica em curto (pdCalc)
  const [pdV, setPdV] = useState('1,0');
  const [pdI, setPdI] = useState('1,0');

  const q = normSearch(query);
  const tempCal = state.cfg.tempCal || {};
  const pmicMin = Number(state.cfg.pmicMin) > 0 ? Number(state.cfg.pmicMin) : 3.4;

  const filteredFpar = useMemo(
    () =>
      FPAR.filter(([a, b, c]) => !q || normSearch(`${a} ${b} ${c}`).includes(q)),
    [q]
  );

  const filteredTemps = useMemo(
    () =>
      TEMPS.filter(([id, nome, t, ar, ob]) => {
        if (!q) return true;
        const cal = String(tempCal[id] || '');
        return normSearch(`${nome} ${t} ${ar} ${ob} ${cal}`).includes(q);
      }),
    [q, tempCal]
  );

  const dioVisible =
    !q ||
    normSearch(
      'escala de diodo conducao reversa gnd ol fuga curto oxidacao multimetro malha'
    ).includes(q);
  const riVisible =
    !q ||
    normSearch(
      'eletrotecnica resistencia interna bateria lei de ohm queda de tensao pmic boot'
    ).includes(q);
  const pdVisible =
    !q ||
    normSearch(
      'eletrotecnica dissipacao termica curto potencia watts camera termica breu'
    ).includes(q);

  // dioCalc
  const dioResult = useMemo(() => {
    const s = dioInput.trim();
    if (!s) return null;
    if (/^ol$/i.test(s)) {
      return { tone: 'warn' as const, html: 'OL: linha aberta.' };
    }
    const v = parseFloat(s.replace(',', '.'));
    if (Number.isNaN(v) || v < 0) {
      return { tone: 'info' as const, html: 'Digite um valor como 0,520 ou OL.' };
    }
    if (v > 0.8) {
      return { tone: 'warn' as const, html: 'Acima de 0,800 V: oxidação / alteração na malha.' };
    }
    if (v > 0.75) {
      return {
        tone: 'info' as const,
        html: 'Faixa intermediária (0,750 V a 0,800 V): fora da tabela. Compare com uma placa boa do mesmo modelo.',
      };
    }
    if (v >= 0.3) {
      return { tone: 'ok' as const, html: 'Normal (0,300 V a 0,750 V).' };
    }
    if (v >= 0.15) {
      return {
        tone: 'info' as const,
        html: 'Faixa intermediária (0,150 V a 0,300 V): abaixo do normal e fora da tabela. Compare com uma placa boa do mesmo modelo.',
      };
    }
    if (v >= 0.0005) {
      return { tone: 'warn' as const, html: 'Abaixo de 0,150 V: fuga / baixa impedância.' };
    }
    return { tone: 'danger' as const, html: '0,000 V: curto para o GND.' };
  }, [dioInput]);

  // riCalc
  const riResult = useMemo(() => {
    const v0 = parseDec(riV0);
    const v1 = parseDec(riV1);
    const I = parseDec(riI);
    if (!v1 || I <= 0) {
      return { ok: false as const, error: 'Informe a tensão sob carga e a corrente de pico.' };
    }
    const dv = v0 - v1;
    if (dv < 0) {
      return { ok: false as const, error: 'A tensão sob carga não pode ser maior que a tensão em vazio.' };
    }
    const r = dv / I;
    const iCut = r > 0 ? (v0 - pmicMin) / r : null;
    const bad = v1 < pmicMin;
    return {
      ok: true as const,
      dv,
      rMilliOhm: r * 1000,
      iCut,
      bad,
      v1,
    };
  }, [riV0, riV1, riI, pmicMin]);

  // pdCalc
  const pdResult = useMemo(() => {
    const V = parseDec(pdV);
    const I = parseDec(pdI);
    if (V <= 0 || I <= 0) {
      return { ok: false as const, error: 'Informe a tensão e a corrente limite.' };
    }
    return {
      ok: true as const,
      watts: V * I,
      wattsAt1V: 1 * I,
      wattsAt42V: 4.2 * I,
      above1A: I > 1.0001,
    };
  }, [pdV, pdI]);

  const toneBoxClass = (tone: 'ok' | 'warn' | 'danger' | 'info') =>
    tone === 'ok'
      ? 'bg-[#DCFCE7] border-[#16A34A]/40 text-[#15803D]'
      : tone === 'danger'
        ? 'bg-[#FEE2E2] border-[#DC2626]/40 text-[#B91C1C]'
        : tone === 'warn'
          ? 'bg-[#FFF7E6] border-[#D97706]/40 text-[#92400E]'
          : 'bg-[#F3F6FB] border-[#D9E0EC] text-[#414752]';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#0056ab]" />
            <span>Referência de Bancada &amp; Eletrotécnica</span>
          </h1>
          <p className="text-xs text-[#727784] mt-0.5">
            Parâmetros da Apostila 5.0, calibração da estação de ar e calculadoras ao vivo para diagnóstico.
          </p>
        </div>

        {canAccessRoute('fonte') && (
          <button
            type="button"
            onClick={() => onNavigate('fonte')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-4 py-2 text-xs font-bold cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <Zap className="w-4 h-4 text-[#06B6D4]" />
            <span>Abrir a Fonte</span>
          </button>
        )}
      </div>

      {/* Busca rápida */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#727784] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar (ex.: standby, diodo, reflow, Ohm, curto)"
          className="w-full rounded-2xl border border-[#D9E0EC] bg-white pl-10 pr-4 py-2.5 text-sm text-[#091b36] focus:outline-none focus:border-[#0056ab]"
        />
      </div>

      {/* 1. Parâmetros ZK-SK150C (FPAR) */}
      {(filteredFpar.length > 0 || !q || normSearch('fonte de bancada zk-sk150c apostila').includes(q)) && (
        <details open className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden group">
          <summary className="px-5 py-3.5 text-sm font-bold text-[#091b36] cursor-pointer select-none flex items-center gap-2 hover:bg-[#F3F6FB]/60">
            <Zap className="w-4 h-4 text-[#0056ab] shrink-0" />
            <span>Fonte de bancada ZK-SK150C (Apostila 5.0, págs. 17 e 42 a 49)</span>
          </summary>
          <div className="px-5 pb-4 divide-y divide-[#D9E0EC]/70">
            {(filteredFpar.length > 0 ? filteredFpar : FPAR).map(([titulo, valor, nota]) => (
              <div key={titulo} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <span className="font-medium text-[#414752]">{titulo}</span>
                  <strong className="font-mono text-[#091b36] text-right">{valor}</strong>
                </div>
                {nota && (
                  <div
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-medium ${
                      /PROIBIDO/.test(nota)
                        ? 'bg-[#FEE2E2] border border-[#DC2626]/40 text-[#B91C1C] font-bold flex items-center gap-1.5'
                        : 'text-[#727784]'
                    }`}
                  >
                    {/PROIBIDO/.test(nota) && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    <span>{nota}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 2. Escala de diodo / condução reversa (dioCalc) */}
      {dioVisible && (
        <details open={Boolean(q)} className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
          <summary className="px-5 py-3.5 text-sm font-bold text-[#091b36] cursor-pointer select-none flex items-center gap-2 hover:bg-[#F3F6FB]/60">
            <Gauge className="w-4 h-4 text-[#0056ab] shrink-0" />
            <span>Escala de diodo / condução reversa (págs. 16 e 32)</span>
          </summary>
          <div className="px-5 pb-5 space-y-3 pt-1">
            <p className="text-xs text-[#727784] leading-relaxed">
              Placa desenergizada. Ponta vermelha (+) no GND e preta (−) na malha. Digite a leitura do
              multímetro (<code className="font-mono">OL</code> para linha aberta). Os valores variam
              entre multímetros e linhas: na dúvida, compare com uma placa boa.
            </p>
            <div className="max-w-xs">
              <label className="block text-xs font-bold text-[#091b36] mb-1">Leitura (V)</label>
              <input
                type="text"
                inputMode="decimal"
                value={dioInput}
                onChange={(e) => setDioInput(e.target.value)}
                placeholder="Ex.: 0,520 ou OL"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-sm font-mono font-semibold text-[#091b36] focus:outline-none focus:border-[#0056ab]"
              />
            </div>
            {dioResult && (
              <div className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold ${toneBoxClass(dioResult.tone)}`}>
                {dioResult.html}
              </div>
            )}
            <p className="text-[11px] text-[#727784]">
              0,000 V = curto GND · OL = linha aberta · abaixo de 0,150 V = fuga / baixa impedância ·
              0,300 V a 0,750 V = normal · acima de 0,800 V = oxidação / alteração
            </p>
          </div>
        </details>
      )}

      {/* 3. Temperaturas e vazão de ar (TEMPS / tempCal) */}
      {(filteredTemps.length > 0 || !q || normSearch('temperaturas vazao de ar estacao').includes(q)) && (
        <details open={Boolean(q)} className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
          <summary className="px-5 py-3.5 text-sm font-bold text-[#091b36] cursor-pointer select-none flex items-center gap-2 hover:bg-[#F3F6FB]/60">
            <Thermometer className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>Temperaturas e vazão de ar (págs. 11 e 12)</span>
          </summary>
          <div className="px-5 pb-4 divide-y divide-[#D9E0EC]/70">
            {(filteredTemps.length > 0 ? filteredTemps : TEMPS).map(([id, nome, temp, ar, obs]) => (
              <div key={id} className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="font-semibold text-[#091b36]">{nome}</span>
                  <strong className="font-mono text-[#0056ab]">
                    {temp}
                    {ar !== '—' ? ` · ${ar}` : ''}
                  </strong>
                </div>
                {obs && <p className="text-[11px] text-[#727784]">{obs}</p>}
                <div>
                  <label className="block text-[11px] font-medium text-[#727784] mb-1">
                    Minha calibração / distância do bocal
                  </label>
                  <input
                    type="text"
                    defaultValue={String(tempCal[id] || '')}
                    onBlur={(e) => setTempCalibration(id, e.target.value)}
                    placeholder="Ex.: 4 cm, 310 °C"
                    className="w-full sm:max-w-sm rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-1.5 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 4. Eletrotécnica: Resistência Interna da Bateria (riCalc) */}
      {riVisible && (
        <details open={Boolean(q)} className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
          <summary className="px-5 py-3.5 text-sm font-bold text-[#091b36] cursor-pointer select-none flex items-center gap-2 hover:bg-[#F3F6FB]/60">
            <BatteryCharging className="w-4 h-4 text-[#16A34A] shrink-0" />
            <span>Eletrotécnica: resistência interna da bateria (Lei de Ohm, pág. 19)</span>
          </summary>
          <div className="px-5 pb-5 space-y-3 pt-1">
            <p className="text-xs text-[#727784]">
              V = R × I. Resistência interna = (tensão em vazio − tensão sob carga) ÷ corrente de pico.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#414752] mb-1">
                  Tensão em vazio (V)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={riV0}
                  onChange={(e) => setRiV0(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#414752] mb-1">
                  Tensão sob carga / boot (V)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={riV1}
                  onChange={(e) => setRiV1(e.target.value)}
                  placeholder="Ex.: 3,70"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#414752] mb-1">
                  Corrente de pico (A)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={riI}
                  onChange={(e) => setRiI(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#414752] mb-1">
                  Tensão mínima do PMIC (V)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pmicInput}
                  onChange={(e) => {
                    setPmicInput(e.target.value);
                    const n = parseDec(e.target.value);
                    if (n > 0) setPmicMinVoltage(n);
                  }}
                  onBlur={() => {
                    const n = parseDec(pmicInput);
                    const finalVal = n > 0 ? n : 3.4;
                    setPmicMinVoltage(finalVal);
                    setPmicInput(fmtNum(finalVal, 2));
                  }}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                />
                <span className="text-[10px] text-[#727784] block mt-0.5">
                  Referência configurável (padrão 3,40 V).
                </span>
              </div>
            </div>

            {!riResult.ok ? (
              <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3.5 py-2.5 text-xs text-[#414752]">
                {riResult.error}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3 divide-y divide-[#D9E0EC] text-xs">
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="text-[#414752]">Queda de tensão (ΔV)</span>
                    <strong className="font-mono text-[#091b36]">{fmtNum(riResult.dv, 3)} V</strong>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-bold text-[#091b36]">Resistência interna (ΔV ÷ I)</span>
                    <strong className="font-mono text-[#0056ab]">
                      {fmtNum(riResult.rMilliOhm, 0)} mΩ
                    </strong>
                  </div>
                  {riResult.iCut !== null && riResult.iCut > 0 && (
                    <div className="py-1.5 flex items-center justify-between">
                      <span className="text-[#414752]">
                        Corrente em que a tensão cairia a {fmtNum(pmicMin, 2)} V
                      </span>
                      <strong className="font-mono text-[#091b36]">{fmtNum(riResult.iCut, 2)} A</strong>
                    </div>
                  )}
                </div>

                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                    riResult.bad
                      ? 'bg-[#FEE2E2] border-[#DC2626]/40 text-[#B91C1C]'
                      : 'bg-[#DCFCE7] border-[#16A34A]/40 text-[#15803D]'
                  }`}
                >
                  {riResult.bad
                    ? `Sob carga a tensão ficou em ${fmtNum(riResult.v1, 2)} V, abaixo do mínimo de referência do PMIC (${fmtNum(pmicMin, 2)} V): a queda pode desarmar o PMIC. Teste outra bateria e confira contatos de alta resistência.`
                    : `Tensão sob carga acima do mínimo de referência do PMIC (${fmtNum(pmicMin, 2)} V).`}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* 5. Eletrotécnica: Dissipação térmica em curto (pdCalc) */}
      {pdVisible && (
        <details open={Boolean(q)} className="rounded-2xl bg-white border border-[#D9E0EC] overflow-hidden">
          <summary className="px-5 py-3.5 text-sm font-bold text-[#091b36] cursor-pointer select-none flex items-center gap-2 hover:bg-[#F3F6FB]/60">
            <Flame className="w-4 h-4 text-[#DC2626] shrink-0" />
            <span>Eletrotécnica: dissipação térmica em curto (P = V × I, pág. 44)</span>
          </summary>
          <div className="px-5 pb-5 space-y-3 pt-1">
            <p className="text-xs text-[#727784]">
              Com a fonte limitada em 1 A, a potência no ponto em curto é a tensão ajustada vezes 1 A.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-[#414752] mb-1">
                  Tensão ajustada (V)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pdV}
                  onChange={(e) => setPdV(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#414752] mb-1">
                  Corrente limite (A)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pdI}
                  onChange={(e) => setPdI(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono text-[#091b36]"
                />
              </div>
            </div>

            {!pdResult.ok ? (
              <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3.5 py-2.5 text-xs text-[#414752]">
                {pdResult.error}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3 divide-y divide-[#D9E0EC] text-xs">
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-bold text-[#091b36]">Potência dissipada no curto (P = V × I)</span>
                    <strong className="font-mono text-[#DC2626]">{fmtNum(pdResult.watts, 2)} W</strong>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="text-[#414752]">Mesma corrente a 1 V / 4,2 V</span>
                    <strong className="font-mono text-[#091b36]">
                      {fmtNum(pdResult.wattsAt1V, 2)} W / {fmtNum(pdResult.wattsAt42V, 2)} W
                    </strong>
                  </div>
                </div>

                {pdResult.above1A && (
                  <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/40 px-3.5 py-2 text-xs font-bold text-[#92400E]">
                    A orientação da apostila (pág. 44) é limitar a corrente em 1 A para localizar o curto.
                  </div>
                )}

                <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] px-3.5 py-2.5 text-xs text-[#414752]">
                  Toda essa potência esquenta o ponto em curto. Comece com tensão baixa, suba aos poucos
                  observando a câmera térmica ou o breu, e reduza ou desligue assim que um ponto aquecer,
                  para não queimar trilhas.
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
};
