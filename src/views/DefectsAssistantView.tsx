import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react';
import { useLabStore } from '../store/useLabStore';
import {
  getEntryChecklistItems,
  resolveOrderDeviceCategory,
} from '../utils/pricing';
import { buildLocalBenchCopilotFallback } from '../utils/preDiagnosis';
import {
  analyzeBenchCopilot,
  BenchCopilotResult,
  getGeminiAvailability,
} from '../services/geminiByok';

export interface DefectStepDef {
  text: string;
  warning?: string;
}

export interface DefectTemplate {
  id: string;
  t: string;
  pg: string;
  isCustom?: boolean;
  p: DefectStepDef[];
}

export const APOSTILA_DEFEITOS: DefectTemplate[] = [
  {
    id: 'nada',
    t: 'Não liga nada',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Forçar reinício: segurar Vol- + Power por 40 s' },
      { text: 'Conectar o aparelho ao PC por USB (ver se reconhece ou carrega)' },
      {
        text: 'Testar a bateria com choque de 5,2 V / 2 A na fonte de bancada',
        warning: 'PROIBIDO se a bateria estiver inchada ou oxidada.',
      },
      { text: 'Ligar a placa na fonte de bancada (4,0 V a 4,2 V / 2 A) e observar o consumo' },
      { text: 'Medir a resistência do botão Power' },
      { text: 'Medir 1,8 V no botão Power' },
    ],
  },
  {
    id: 'd03',
    t: 'Defeito 03 · Liga, mostra imagem, mas trava na tela inicial (loop infinito)',
    pg: 'Apostila 5.0, pág. 42',
    p: [
      { text: 'Colocar em modo recovery ou modo download para formatação/reinstalação de software' },
      { text: 'Abrir e verificar se há oxidação; se houver, desoxidar na banheira ultrassônica' },
      { text: 'Ligar a placa somente com a tela, deixando os outros periféricos desconectados' },
      { text: 'Ligar na fonte de bancada para isolar a hipótese de bateria desgastada' },
      { text: 'Verificar se o botão Power está em curto' },
    ],
  },
  {
    id: 'd04',
    t: 'Defeito 04 · Aparelho liga, reinicia e desliga',
    pg: 'Apostila 5.0, pág. 42',
    p: [
      { text: 'Ligar o aparelho na fonte de bancada para eliminar a hipótese de ser a bateria' },
      { text: 'Testar com jig USB ou modo download (software) antes de partir para análise profunda de placa' },
      { text: 'Investigar curto ou fuga de corrente na linha secundária (periféricos/componentes alimentados após ligar)' },
      { text: 'Conferir as tensões VREG que saem do PMIC e a comunicação com o processador' },
    ],
  },
  {
    id: 'carga',
    t: 'Não carrega a bateria',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Testar com outra bateria' },
      { text: 'Verificar o conector de carga' },
      { text: 'Medir 5,1 V no CI de carga ou PMIC' },
      { text: 'Verificar as malhas D+, D- e ID_USB' },
    ],
  },
  {
    id: 'desliga',
    t: 'Bateria indica carga, mas desliga rápido',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Testar com outra bateria' },
      { text: 'Ligar na fonte de bancada em standby: 0 a 10 mA é normal' },
      { text: 'Acima de 50 mA indica fuga de corrente: localizar com câmera térmica ou breu' },
    ],
  },
  {
    id: 'touch',
    t: 'Touch falha',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Verificar o FPC (reconectar e testar com outra tela)' },
      { text: 'Verificar as bobinas do circuito de touch' },
      { text: 'Verificar o CI de touch' },
    ],
  },
  {
    id: 'sinal',
    t: 'Sem sinal / Wi-Fi',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Conferir o IMEI' },
      { text: 'Verificar as antenas e seus contatos' },
      { text: 'Verificar o baseband' },
      { text: 'Verificar o WTR' },
      { text: 'Verificar o CI de Wi-Fi' },
    ],
  },
  {
    id: 'consumo',
    t: 'Consumo trava na fonte',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Observar o consumo travado: 80 mA a 150 mA indica software (recovery/download)' },
      { text: 'Consumo de 200 mA ou mais indica fuga de corrente: localizar com câmera térmica ou breu' },
    ],
  },
  {
    id: 'curto',
    t: 'Curto total (fonte apita / desarma)',
    pg: 'Apostila 5.0',
    p: [
      { text: 'Baixar o limite de corrente da fonte para 1 A' },
      { text: 'Procurar o ponto de aquecimento com câmera térmica ou breu' },
    ],
  },
  {
    id: 'd12',
    t: 'Defeito 12 · Na fonte sobe até certo consumo e zera; ao ligar de novo repete',
    pg: 'Apostila 5.0, pág. 44',
    p: [
      { text: 'Verificar histórico de queda ou contato com água; fazer análise visual buscando oxidação ou solda fria' },
      { text: 'Analisar o circuito de carga / CI de carga / Power Manager com o esquema elétrico da placa' },
    ],
  },
  {
    id: 'sug1',
    t: 'Display sem imagem com o aparelho ligado (sugestão)',
    pg: '(sugestão)',
    p: [
      { text: 'Testar com outra tela' },
      { text: 'Reconectar o FPC e verificar oxidação no conector' },
      { text: 'Medir as tensões do display e do backlight com o esquema elétrico' },
      { text: 'Verificar o CI de backlight' },
    ],
  },
  {
    id: 'sug2',
    t: 'Aparelho molhado / oxidado (sugestão)',
    pg: '(sugestão)',
    p: [
      { text: 'Desligar, abrir e inspecionar visualmente a corrosão' },
      { text: 'Remover periféricos e isolar microfones com fita de alumínio' },
      {
        text: 'Banheira ultrassônica: 3 min cada lado',
        warning: 'PROIBIDO aplicar choque de ativação (5,2 V) se a bateria estiver inchada ou oxidada.',
      },
      { text: 'Secar bem e só então ligar na fonte de bancada, observando o consumo' },
    ],
  },
];

type StepState = 0 | 1 | 2; // 0 = ○ pend, 1 = ✔ ok, 2 = ✖ falha

export const DefectsAssistantView: React.FC = () => {
  const {
    state,
    addCustomDefect,
    deleteCustomDefect,
    addOrderDiagnosticReport,
  } = useLabStore();

  const [selectedDefectId, setSelectedDefectId] = useState<string>('');
  const [stepMarks, setStepMarks] = useState<Record<number, StepState>>({});
  const [obs, setObs] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmUnmarkedSave, setConfirmUnmarkedSave] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal + Novo defeito
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStepsText, setNewStepsText] = useState('');
  const [newError, setNewError] = useState('');

  // Copiloto Técnico IA
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotError, setCopilotError] = useState('');
  const [copilotResult, setCopilotResult] = useState<BenchCopilotResult | null>(null);

  const handleRunCopilot = async () => {
    if (!activeDefect) return;
    setCopilotError('');
    const linkedOrder = selectedOrderId
      ? state.orders.find((o) => o.id === Number(selectedOrderId))
      : undefined;

    const runLocalFallback = () => {
      const localRes = buildLocalBenchCopilotFallback({
        issue: linkedOrder?.issue || activeDefect.t,
        brand: linkedOrder?.brand,
        model: linkedOrder?.model,
        device: linkedOrder?.device,
        orders: state.orders,
        customDefects: state.cfg.defeitosExtra,
        editingOrderId: linkedOrder?.id,
        triage: linkedOrder?.triage,
        powerTests: linkedOrder?.testesFonte,
        telemetry: linkedOrder?.telemetry,
        activeTemplate: activeDefect,
      });
      setCopilotResult(localRes);
    };

    const availability = getGeminiAvailability();
    if (!availability.available) {
      if (availability.reason === 'offline') {
        runLocalFallback();
        return;
      }
      setCopilotError(availability.message);
      return;
    }

    const checklistSummary = linkedOrder?.entryChecklist7
      ? getEntryChecklistItems(resolveOrderDeviceCategory(linkedOrder)).map((item) => {
          const val = linkedOrder.entryChecklist7?.[item.key];
          const label = val === 's' ? 'Sim' : val === 'n' ? 'Não' : 'Não testado';
          return `${item.label}: ${label}`;
        })
      : [];

    const powerTestsSummary: string[] = [];
    if (linkedOrder?.telemetry) {
      powerTestsSummary.push(
        `Telemetria: ${linkedOrder.telemetry.voltage.toFixed(2)}V / ${linkedOrder.telemetry.current.toFixed(3)}A / ${linkedOrder.telemetry.power.toFixed(2)}W (${linkedOrder.telemetry.note})`
      );
    }
    if (Array.isArray(linkedOrder?.testesFonte)) {
      linkedOrder.testesFonte.slice(0, 5).forEach((t) => {
        powerTestsSummary.push(
          `Teste ${t.dt}: diag=${t.diag || '—'}, fuga=${t.fugaMa ?? '—'}mA, boot=${t.bootA ?? '—'}A, pico=${t.ipkA ?? '—'}A, vavg=${t.vavgV ?? '—'}V, prots=${(t.prots || []).join(',') || 'nenhuma'}${t.nt ? `, obs=${t.nt}` : ''}`
        );
      });
    }

    const routineStepsSummary = activeDefect.p.map((step, idx) => {
      const mark = stepMarks[idx] || 0;
      const stLabel = mark === 1 ? 'OK' : mark === 2 ? 'FALHA' : 'PENDENTE';
      return `[${stLabel}] ${step.text}`;
    });

    setCopilotBusy(true);
    try {
      const res = await analyzeBenchCopilot({
        orderCode: linkedOrder?.code,
        device: linkedOrder?.device || 'Aparelho na bancada (sem OS vinculada)',
        brand: linkedOrder?.brand,
        model: linkedOrder?.model,
        issue: linkedOrder?.issue || activeDefect.t,
        technicalNotes: obs.trim(),
        entryChecklistSummary: checklistSummary,
        safetyFlags: linkedOrder
          ? {
              swollenBattery: Boolean(linkedOrder.triage?.bat),
              oxidation: Boolean(linkedOrder.triage?.oxi),
              arrivedDead: Boolean(linkedOrder.triage?.apagado),
            }
          : undefined,
        powerTestsSummary,
        routineTitle: activeDefect.t,
        routineStepsSummary,
      });
      setCopilotResult(res);
    } catch (err) {
      if ((err as Error & { isTransientModelExhausted?: boolean })?.isTransientModelExhausted) {
        runLocalFallback();
      } else {
        setCopilotError(err instanceof Error ? err.message : 'Falha ao consultar Copiloto IA.');
      }
    } finally {
      setCopilotBusy(false);
    }
  };

  const allDefects = useMemo<DefectTemplate[]>(() => {
    const extras: DefectTemplate[] = (state.cfg.defeitosExtra || []).map((x) => ({
      id: x.id,
      t: x.t,
      pg: 'Cadastrado por você',
      isCustom: true,
      p: (x.p || []).map((s) => ({ text: s })),
    }));
    return [...APOSTILA_DEFEITOS, ...extras];
  }, [state.cfg.defeitosExtra]);

  const activeDefect = useMemo(
    () => allDefects.find((d) => d.id === selectedDefectId) || null,
    [allDefects, selectedDefectId]
  );

  const eligibleOrders = useMemo(
    () =>
      state.orders
        .filter((o) => o.status !== 'Cancelado')
        .slice()
        .sort((a, b) => b.id - a.id)
        .slice(0, 80),
    [state.orders]
  );

  const handleSelectDefect = (id: string) => {
    setSelectedDefectId(id);
    setStepMarks({});
    setConfirmUnmarkedSave(false);
    setConfirmDeleteId(null);
    setFeedback(null);
    setCopilotResult(null);
    setCopilotError('');
  };

  const handleToggleStep = (index: number) => {
    setStepMarks((prev) => ({
      ...prev,
      [index]: (((prev[index] || 0) + 1) % 3) as StepState,
    }));
    setConfirmUnmarkedSave(false);
  };

  const executeSaveReport = (defect: DefectTemplate, orderIdNum: number) => {
    const order = state.orders.find((o) => o.id === orderIdNum);
    if (!order) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dataStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}`;

    addOrderDiagnosticReport(order.id, {
      data: dataStr,
      defeito: defect.t,
      passos: defect.p.map((step, i) => ({
        t: step.text,
        r: (['pend', 'ok', 'falha'] as const)[stepMarks[i] || 0],
      })),
      obs: obs.trim(),
    });

    setStepMarks({});
    setObs('');
    setConfirmUnmarkedSave(false);
    setFeedback({
      type: 'ok',
      text: `Diagnóstico salvo na OS nº ${order.id} (${order.code}).`,
    });
  };

  const handleSaveReportClick = () => {
    setFeedback(null);
    if (!activeDefect) return;
    const orderIdNum = Number(selectedOrderId);
    const targetOrder = state.orders.find((o) => o.id === orderIdNum);
    if (!targetOrder) {
      setFeedback({ type: 'err', text: 'Escolha a OS onde o laudo será salvo.' });
      return;
    }
    const anyMarked = activeDefect.p.some((_, idx) => Boolean(stepMarks[idx]));
    if (!anyMarked && !confirmUnmarkedSave) {
      setConfirmUnmarkedSave(true);
      return;
    }
    executeSaveReport(activeDefect, targetOrder.id);
  };

  const handleCreateCustomDefect = (e: React.FormEvent) => {
    e.preventDefault();
    setNewError('');
    const steps = newStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!newTitle.trim() || steps.length === 0) {
      setNewError('Informe o nome do defeito e ao menos uma etapa.');
      return;
    }
    const created = addCustomDefect(newTitle, steps);
    if (created) {
      setSelectedDefectId(created.id);
      setStepMarks({});
      setObs('');
      setShowNewModal(false);
      setNewTitle('');
      setNewStepsText('');
      setFeedback({ type: 'ok', text: `Defeito "${created.t}" cadastrado com sucesso.` });
    }
  };

  const handleConfirmDeleteCustom = (id: string) => {
    deleteCustomDefect(id);
    setSelectedDefectId('');
    setStepMarks({});
    setObs('');
    setConfirmDeleteId(null);
    setFeedback({
      type: 'ok',
      text: 'Defeito personalizado excluído. Os laudos já salvos nas OS foram mantidos.',
    });
  };

  const stepIcon = (s: StepState) => (s === 1 ? '✔' : s === 2 ? '✖' : '○');

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36] flex items-center gap-2">
            <Wrench className="w-5 h-5 text-[#0056ab]" />
            <span>Assistente de Defeitos · Apostila 5.0</span>
          </h1>
          <p className="text-xs text-[#727784] mt-0.5">
            Do teste mais simples ao mais complexo. Toque na etapa para alternar:{' '}
            <strong>○ pendente</strong>, <strong>✔ testado</strong>, <strong>✖ achei o defeito aqui</strong>.
            Base: Apostila 5.0, págs. 42 a 44.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewTitle('');
            setNewStepsText('');
            setNewError('');
            setShowNewModal(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#D9E0EC] hover:border-[#0056ab] text-[#091b36] px-3.5 py-2 text-xs font-semibold shadow-2xs cursor-pointer self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-[#0056ab]" />
          <span>Novo defeito</span>
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 border ${
            feedback.type === 'ok'
              ? 'bg-[#DCFCE7] border-[#16A34A]/30 text-[#15803D]'
              : 'bg-[#FEE2E2] border-[#DC2626]/30 text-[#B91C1C]'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#091b36] mb-1.5">
            Defeito relatado / sintoma na bancada ({allDefects.length} roteiros)
          </label>
          <select
            value={selectedDefectId}
            onChange={(e) => handleSelectDefect(e.target.value)}
            className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3.5 py-2.5 text-sm font-medium text-[#091b36] focus:outline-none focus:border-[#0056ab]"
          >
            <option value="">Escolha um defeito…</option>
            {allDefects.map((d) => (
              <option key={d.id} value={d.id}>
                {d.t}
              </option>
            ))}
          </select>
        </div>

        {!activeDefect ? (
          <div className="rounded-xl border border-dashed border-[#D9E0EC] bg-[#F3F6FB]/50 py-10 px-4 text-center">
            <ClipboardCheck className="w-8 h-8 text-[#727784] mx-auto mb-2 opacity-60" />
            <p className="text-xs font-medium text-[#727784]">
              Escolha um defeito acima para abrir o roteiro de testes passo a passo.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D9E0EC] pb-3">
              <div>
                <h2 className="text-base font-bold text-[#091b36]">{activeDefect.t}</h2>
                <span className="text-[11px] font-medium text-[#727784]">{activeDefect.pg}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-[#F3F6FB] text-[#414752] font-semibold">
                  ○ Pendente
                </span>
                <span className="px-2 py-0.5 rounded bg-[#DCFCE7] text-[#15803D] font-semibold">
                  ✔ Testado
                </span>
                <span className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C] font-semibold">
                  ✖ Defeito aqui
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              {activeDefect.p.map((step, idx) => {
                const s: StepState = stepMarks[idx] || 0;
                return (
                  <button
                    key={`${activeDefect.id}-${idx}`}
                    type="button"
                    onClick={() => handleToggleStep(idx)}
                    className={`w-full text-left rounded-xl border p-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                      s === 1
                        ? 'bg-[#DCFCE7]/50 border-[#16A34A]/50 text-[#091b36]'
                        : s === 2
                          ? 'bg-[#FEE2E2]/60 border-[#DC2626]/60 text-[#091b36]'
                          : 'bg-[#F3F6FB]/70 border-[#D9E0EC] hover:border-[#0056ab]/50 text-[#091b36]'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                        s === 1
                          ? 'bg-[#16A34A] text-white'
                          : s === 2
                            ? 'bg-[#DC2626] text-white'
                            : 'bg-white border border-[#D9E0EC] text-[#727784]'
                      }`}
                    >
                      {stepIcon(s)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-semibold leading-snug">
                        {idx + 1}. {step.text}
                      </p>
                      {step.warning && (
                        <div className="mt-2 rounded-lg bg-[#FEE2E2] border border-[#DC2626]/40 px-2.5 py-1.5 text-[11px] font-bold text-[#B91C1C] flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{step.warning}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-[#091b36] mb-1.5">
                  Observações do técnico
                </label>
                <textarea
                  rows={3}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Medições obtidas, comportamento na fonte, componente aquecendo..."
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#091b36] mb-1.5">
                  Salvar o laudo na OS
                </label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => {
                    setSelectedOrderId(e.target.value);
                    setFeedback(null);
                  }}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2.5 text-xs font-medium text-[#091b36] focus:outline-none focus:border-[#0056ab]"
                >
                  <option value="">Escolha a OS…</option>
                  {eligibleOrders.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      OS nº {o.id} · {o.clientName || 'Sem cliente'} · {o.device}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#727784] mt-1.5">
                  O laudo completo com as etapas marcadas fica arquivado no histórico técnico da OS.
                </p>
              </div>
            </div>

            {confirmUnmarkedSave && (
              <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#92400E]">
                <span className="font-semibold">
                  Nenhuma etapa foi marcada. Deseja salvar o laudo na OS mesmo assim?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => executeSaveReport(activeDefect, Number(selectedOrderId))}
                    className="rounded-lg bg-[#D97706] text-white px-3 py-1.5 font-bold cursor-pointer"
                  >
                    Confirmar e Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmUnmarkedSave(false)}
                    className="rounded-lg bg-white border border-[#D9E0EC] text-[#414752] px-3 py-1.5 font-semibold cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}

            {confirmDeleteId === activeDefect.id && (
              <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#B91C1C]">
                <span className="font-semibold">
                  Excluir este defeito cadastrado por você? Os laudos já salvos nas OS não são apagados.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirmDeleteCustom(activeDefect.id)}
                    className="rounded-lg bg-[#DC2626] text-white px-3 py-1.5 font-bold cursor-pointer"
                  >
                    Sim, Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-lg bg-white border border-[#D9E0EC] text-[#414752] px-3 py-1.5 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSaveReportClick}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-4 py-2.5 text-xs font-bold cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Salvar Diagnóstico na OS</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStepMarks({});
                  setConfirmUnmarkedSave(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] text-[#414752] hover:text-[#091b36] px-3.5 py-2.5 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar marcas</span>
              </button>

              <button
                type="button"
                onClick={() => void handleRunCopilot()}
                disabled={copilotBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#0056ab]/35 bg-[#EAF2FD] hover:bg-[#dfe8ff] text-[#0056ab] px-3.5 py-2.5 text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {copilotBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : typeof navigator !== 'undefined' && navigator.onLine === false ? (
                  <WifiOff className="w-3.5 h-3.5 text-[#D97706]" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{copilotBusy ? 'Analisando bancada...' : 'Analisar com Copiloto IA'}</span>
              </button>

              {activeDefect.isCustom && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(activeDefect.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#FEE2E2] text-[#DC2626] hover:bg-[#fecaca] px-3.5 py-2.5 text-xs font-semibold cursor-pointer ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir defeito</span>
                </button>
              )}
            </div>

            {copilotError && (
              <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/35 px-3.5 py-2.5 text-xs text-[#92400E] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                <span>{copilotError}</span>
              </div>
            )}

            {copilotResult && (
              <div className="rounded-xl bg-[#F3F6FB] border border-[#0056ab]/25 p-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#0056ab]">
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {copilotResult.sourceMode === 'local_fallback'
                        ? 'Pré-Diagnóstico Offline Cruzado (Bancada)'
                        : 'Parecer do Copiloto Técnico IA (Dados Anonimizados)'}
                    </span>
                  </span>
                  {copilotResult.resumoTecnicoOs && (
                    <button
                      type="button"
                      onClick={() => {
                        setObs((prev) =>
                          prev.trim()
                            ? `${prev.trim()}\n[Copiloto] ${copilotResult.resumoTecnicoOs}`
                            : `[Copiloto] ${copilotResult.resumoTecnicoOs}`
                        );
                      }}
                      className="rounded-lg bg-[#0056ab] text-white px-2.5 py-1 text-[11px] font-bold hover:bg-[#1b6fd1] cursor-pointer"
                    >
                      Anexar às Observações
                    </button>
                  )}
                </div>

                {copilotResult.alertasSeguranca.length > 0 && (
                  <div className="rounded-lg bg-[#FEE2E2] border border-[#DC2626]/30 p-2.5 text-[#991B1B] space-y-1">
                    <strong className="block text-[11px]">Alertas de Segurança na Bancada</strong>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {copilotResult.alertasSeguranca.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white border border-[#D9E0EC] p-3 space-y-1">
                    <strong className="block text-[11px] text-[#091b36]">Hipóteses Principais</strong>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-[#414752]">
                      {copilotResult.hipotesesPrincipais.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-white border border-[#D9E0EC] p-3 space-y-1">
                    <strong className="block text-[11px] text-[#091b36]">Pontos de Medição Sugeridos</strong>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-[#414752]">
                      {copilotResult.pontosMedicao.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {(copilotResult.sourceMode === 'local_fallback' ||
                  (copilotResult.isFallbackModel && copilotResult.modelUsed)) && (
                  <div className="text-[10px] text-[#727784] pt-1 border-t border-[#D9E0EC]/70">
                    {copilotResult.sourceMode === 'local_fallback'
                      ? 'Gerado localmente · Pré-Diagnóstico Offline (servidores Gemini ocupados ou dispositivo offline)'
                      : `Respondido via modelo alternativo: ${copilotResult.modelUsed}`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal + Novo defeito */}
      {showNewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Novo defeito personalizado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/60 backdrop-blur-xs p-4"
        >
          <form
            onSubmit={handleCreateCustomDefect}
            className="w-full max-w-lg rounded-2xl bg-white border border-[#D9E0EC] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#091b36]">Novo defeito personalizado</h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newError && (
              <div className="rounded-lg bg-[#FEE2E2] text-[#B91C1C] px-3 py-2 text-xs font-semibold">
                {newError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#091b36] mb-1">Nome do defeito</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex.: Áudio auricular mudo em chamada"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#091b36] mb-1">
                Etapas (uma por linha, do teste mais simples ao mais complexo)
              </label>
              <textarea
                rows={6}
                required
                value={newStepsText}
                onChange={(e) => setNewStepsText(e.target.value)}
                placeholder={
                  'Limpar tela protetora / grade do auricular\nTestar cápsula auricular na escala de resistência\nConferir malha no conector FPC em condução reversa'
                }
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-xl border border-[#D9E0EC] px-4 py-2 text-xs font-semibold text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] text-white px-4 py-2 text-xs font-bold cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
