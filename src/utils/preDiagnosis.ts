import { CustomDefectItem, OrderTriage, PowerSupplyTestEntry, ServiceOrder } from '../types/lab';
import type { BenchCopilotResult } from '../services/geminiByok';
import { APOSTILA_DEFEITOS, DefectTemplate } from '../views/DefectsAssistantView';

function normText(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const DEFECT_KEYWORDS: Record<string, string[]> = {
  nada: ['nao liga', 'apagado', 'morto', 'sem sinal de vida', 'nao acende', 'power', '0 ma'],
  d03: ['loop', 'trava na tela', 'logo', 'tela inicial', 'infinito', 'nao inicia'],
  d04: ['reinicia', 'desliga sozinho', 'reboot', 'fica reiniciando'],
  carga: ['nao carrega', 'carregamento', 'conector', 'usb', 'tipo c', 'type c', 'lento', 'falso'],
  desliga: ['desliga rapido', 'bateria', 'descarrega', 'viciada', 'porcentagem', 'autonomia'],
  touch: ['touch', 'toque', 'nao responde', 'fantasma', 'tela', 'display'],
  sinal: ['sem sinal', 'sem servico', 'wifi', 'wi-fi', 'rede', 'chip', 'antena', 'imei', '4g', '5g'],
  consumo: ['consumo', 'trava na fonte', '80 ma', '150 ma', '200 ma', 'fuga'],
  curto: ['curto', 'apita', 'desarma', 'aquece', 'esquenta', 'sobrecarga', 'cc'],
  d12: ['sobe e zera', 'repete', 'power manager', 'pmic', 'solda fria'],
  sug1: ['sem imagem', 'tela preta', 'backlight', 'escuro', 'liga sem imagem', 'blacklight'],
  sug2: ['molhou', 'agua', 'liquido', 'oxidado', 'oxidacao', 'choveu', 'caiu na agua'],
};

export interface OfflinePreDiagnosisResult {
  matchedTemplates: {
    template: DefectTemplate;
    score: number;
  }[];
  modelHistory: {
    modelQuery: string;
    deliveredCount: number;
    avgHours: number | null;
    matchingIssueCount: number;
    topServices: string[];
  } | null;
}

export function computeOfflinePreDiagnosis(params: {
  issue: string;
  brand?: string;
  model?: string;
  orders: ServiceOrder[];
  customDefects?: CustomDefectItem[];
  editingOrderId?: number | null;
}): OfflinePreDiagnosisResult {
  const issueNorm = normText(params.issue);
  const modelRaw = `${params.brand || ''} ${params.model || ''}`.trim() || (params.model || '');
  const modelNorm = normText(params.model || '');
  const deviceFullNorm = normText(modelRaw);

  const extras: DefectTemplate[] = (params.customDefects || []).map((x) => ({
    id: x.id,
    t: x.t,
    pg: 'Cadastrado no Lab',
    isCustom: true,
    p: (x.p || []).map((s) => ({ text: s })),
  }));
  const allTemplates = [...APOSTILA_DEFEITOS, ...extras];

  const matchedTemplates: { template: DefectTemplate; score: number }[] = [];

  if (issueNorm.length >= 2) {
    const tokens = issueNorm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    allTemplates.forEach((tpl) => {
      let score = 0;
      const titleNorm = normText(tpl.t);
      const kwList = DEFECT_KEYWORDS[tpl.id] || [];
      kwList.forEach((kw) => {
        if (issueNorm.includes(kw)) score += kw.includes(' ') ? 4 : 2;
      });
      tokens.forEach((tk) => {
        if (titleNorm.includes(tk)) score += 2;
        if (tpl.p.some((st) => normText(st.text).includes(tk))) score += 1;
      });
      if (score >= 2) {
        matchedTemplates.push({ template: tpl, score });
      }
    });
    matchedTemplates.sort((a, b) => b.score - a.score);
  }

  let modelHistory: OfflinePreDiagnosisResult['modelHistory'] = null;
  if (modelNorm.length >= 2) {
    const deliveredSameModel = (params.orders || []).filter((o) => {
      if (o.status !== 'Entregue') return false;
      if (params.editingOrderId && o.id === params.editingOrderId) return false;
      const devNorm = normText(`${o.brand || ''} ${o.model || ''} ${o.device || ''}`);
      return devNorm.includes(modelNorm) || (deviceFullNorm.length >= 4 && devNorm.includes(deviceFullNorm));
    });

    if (deliveredSameModel.length > 0) {
      const hoursList = deliveredSameModel
        .map((o) => Number(o.estimatedHours))
        .filter((h) => Number.isFinite(h) && h > 0);
      const avgHours =
        hoursList.length > 0
          ? Math.round((hoursList.reduce((s, h) => s + h, 0) / hoursList.length) * 10) / 10
          : null;

      const issueTokens = issueNorm.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      const matchingIssueCount =
        issueTokens.length > 0
          ? deliveredSameModel.filter((o) => {
              const oIssue = normText(o.issue);
              return issueTokens.some((tk) => oIssue.includes(tk));
            }).length
          : 0;

      const svcFreq = new Map<string, number>();
      deliveredSameModel.forEach((o) => {
        const label = (o.serviceCatalogName || o.issue || '').trim();
        if (!label) return;
        svcFreq.set(label, (svcFreq.get(label) || 0) + 1);
      });
      const topServices = Array.from(svcFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([lbl, cnt]) => (cnt > 1 ? `${lbl} (${cnt}×)` : lbl));

      modelHistory = {
        modelQuery: (params.model || modelRaw).trim(),
        deliveredCount: deliveredSameModel.length,
        avgHours,
        matchingIssueCount,
        topServices,
      };
    }
  }

  return {
    matchedTemplates: matchedTemplates.slice(0, 2),
    modelHistory,
  };
}

export interface ElectricalDiagnosticBadge {
  kind: 'fuga' | 'pulso' | 'curto' | 'alto' | 'prot' | 'ok';
  label: string;
  tone: 'danger' | 'warn' | 'info' | 'ok';
}

export function buildElectricalCardDetails(
  entry: PowerSupplyTestEntry,
  order: Pick<ServiceOrder, 'id' | 'code' | 'device' | 'clientName'>
): {
  badges: ElectricalDiagnosticBadge[];
  clientFriendlyLines: string[];
  whatsappText: string;
} {
  const badges: ElectricalDiagnosticBadge[] = [];
  const clientLines: string[] = [];

  const evs = entry.evidencias || [];
  const hasKind = (k: string) => evs.some((e) => e.kind === k);

  if (hasKind('curto') || (entry.diag || '').toLowerCase().includes('curto')) {
    badges.push({ kind: 'curto', label: 'Curto / Sobrecarga (CC)', tone: 'danger' });
  }
  if (hasKind('fuga') || (entry.fugaMa !== null && entry.fugaMa > 20)) {
    badges.push({
      kind: 'fuga',
      label: `Fuga Standby${entry.fugaMa !== null ? ` (${entry.fugaMa} mA)` : ''}`,
      tone: 'warn',
    });
  }
  if (hasKind('alto') || (entry.diag || '').toLowerCase().includes('alto sustentado')) {
    badges.push({ kind: 'alto', label: 'Consumo Alto Sustentado', tone: 'warn' });
  }
  if (hasKind('pulso') || (entry.bootA !== null && entry.bootA > 0)) {
    badges.push({
      kind: 'pulso',
      label: `Pulso de Boot${entry.bootA !== null ? ` (${entry.bootA.toFixed(3).replace('.', ',')} A)` : ''}`,
      tone: 'info',
    });
  }
  if (hasKind('prot') || (entry.prots && entry.prots.length > 0)) {
    badges.push({
      kind: 'prot',
      label: `Proteção (${entry.prots?.join(', ') || 'Ativada'})`,
      tone: 'danger',
    });
  }

  if (badges.length === 0) {
    badges.push({ kind: 'ok', label: 'Sem anomalias críticas detectadas', tone: 'ok' });
  }

  evs.forEach((ev) => {
    if (ev.cliText) clientLines.push(ev.cliText);
  });

  if (clientLines.length === 0) {
    if (entry.fugaMa !== null && entry.fugaMa > 20) {
      clientLines.push(
        `Detectamos um consumo residual de cerca de ${entry.fugaMa} mA mesmo antes de apertar o botão ligar, indicando possível fuga de corrente na placa.`
      );
    }
    if ((entry.diag || '').toLowerCase().includes('curto')) {
      clientLines.push(
        'A fonte atingiu o limite de corrente de proteção durante o teste, sinalizando curto ou sobrecarga que exige análise dos componentes da placa.'
      );
    }
    if ((entry.diag || '').toLowerCase().includes('alto sustentado')) {
      clientLines.push(
        'O aparelho manteve consumo elevado contínuo na bancada, compatível com falha no circuito de alimentação ou periférico em curto.'
      );
    }
    if (entry.bootA !== null && entry.bootA > 0) {
      clientLines.push(
        `Ao acionar o botão Power, a placa apresentou pulso inicial de ${entry.bootA.toFixed(3).replace('.', ',')} A.`
      );
    }
    if (clientLines.length === 0) {
      clientLines.push(
        entry.diag && entry.diag !== 'nenhum indício detectado'
          ? `Resultado técnico observado: ${entry.diag}.`
          : 'O teste elétrico na fonte de bancada não apontou curto ou fuga evidente nos parâmetros monitorados.'
      );
    }
  }

  const whatsappText =
    entry.cliResumo && entry.cliResumo.trim().length > 0
      ? entry.cliResumo.trim()
      : [
          '*MicroLab · Cartão de Diagnóstico Elétrico*',
          `OS: ${order.code} · Aparelho: ${order.device}`,
          `Data do teste: ${entry.dt} (duração ${entry.dur})`,
          '',
          'O que observamos na fonte de bancada:',
          ...clientLines.map((l) => `• ${l}`),
          '',
          `Medições principais: Fuga ${entry.fugaMa !== null ? `${entry.fugaMa} mA` : '--'} · Boot ${
            entry.bootA !== null ? `${entry.bootA.toFixed(3).replace('.', ',')} A` : '--'
          } · Pico ${entry.ipkA !== null ? `${entry.ipkA.toFixed(3).replace('.', ',')} A` : '--'}.`,
          ...(entry.nt ? [`Observação técnica: ${entry.nt}`] : []),
          '',
          'Orçamento antes do serviço.',
        ].join('\n');

  return {
    badges,
    clientFriendlyLines: clientLines,
    whatsappText,
  };
}

/**
 * Fallback local determinístico para o Copiloto Técnico de Bancada quando os modelos Gemini retornarem 503/indisponibilidade.
 * Cruza APOSTILA_DEFEITOS + histórico local do mesmo modelo + eventos elétricos da fonte ZK-SK150C.
 */
export function buildLocalBenchCopilotFallback(params: {
  issue: string;
  brand?: string;
  model?: string;
  device?: string;
  orders: ServiceOrder[];
  customDefects?: CustomDefectItem[];
  editingOrderId?: number | null;
  triage?: OrderTriage;
  powerTests?: PowerSupplyTestEntry[];
  telemetry?: ServiceOrder['telemetry'];
  activeTemplate?: DefectTemplate | null;
}): BenchCopilotResult {
  const modelQuery = (params.model || params.device || '').trim();
  const offline = computeOfflinePreDiagnosis({
    issue: params.issue || params.activeTemplate?.t || '',
    brand: params.brand,
    model: modelQuery,
    orders: params.orders,
    customDefects: params.customDefects,
    editingOrderId: params.editingOrderId,
  });

  const templates = params.activeTemplate
    ? [
        params.activeTemplate,
        ...offline.matchedTemplates
          .map((m) => m.template)
          .filter((t) => t.id !== params.activeTemplate?.id),
      ].slice(0, 2)
    : offline.matchedTemplates.map((m) => m.template);

  const hipotesesPrincipais: string[] = [];
  const pontosMedicao: string[] = [];
  const alertasSeguranca: string[] = [];

  if (templates.length > 0) {
    templates.forEach((tpl, idx) => {
      hipotesesPrincipais.push(
        idx === 0
          ? `Rotina principal compatível: ${tpl.t} (${tpl.pg}).`
          : `Rotina secundária relacionada: ${tpl.t} (${tpl.pg}).`
      );
    });
    templates[0].p.forEach((step) => {
      pontosMedicao.push(step.text);
      if (step.warning) {
        alertasSeguranca.push(step.warning);
      }
    });
  } else {
    hipotesesPrincipais.push(
      'Realizar inspeção visual sob microscópio (FPCs, oxidação, componentes aquecendo) e triagem inicial na fonte de bancada.'
    );
    pontosMedicao.push(
      'Medir consumo em standby na fonte com limite de segurança (4,0 V / 1 A–2 A).',
      'Conferir condução reversa nos pinos principais do conector de bateria e FPC de carga/display.'
    );
  }

  if (offline.modelHistory) {
    const h = offline.modelHistory;
    hipotesesPrincipais.push(
      `Histórico MicroLab (${h.modelQuery}): ${h.deliveredCount} OS entregues${
        h.matchingIssueCount > 0 ? ` (${h.matchingIssueCount} com queixa semelhante)` : ''
      }${h.avgHours ? ` · tempo médio ${h.avgHours}h` : ''}${
        h.topServices.length > 0 ? ` · serviços: ${h.topServices.join(', ')}` : ''
      }.`
    );
  }

  if (params.telemetry) {
    hipotesesPrincipais.push(
      `Telemetria ZK-SK150C vinculada: ${params.telemetry.voltage.toFixed(2)}V / ${params.telemetry.current.toFixed(
        3
      )}A (${params.telemetry.power.toFixed(2)}W) — ${params.telemetry.note}.`
    );
  }

  if (Array.isArray(params.powerTests) && params.powerTests.length > 0) {
    params.powerTests.slice(0, 3).forEach((t) => {
      const diagLower = (t.diag || '').toLowerCase();
      hipotesesPrincipais.push(
        `Fonte ZK-SK150C (${t.dt}): ${t.diag || 'Leitura registrada'} · fuga=${
          t.fugaMa ?? '--'
        }mA · boot=${t.bootA ?? '--'}A · pico=${t.ipkA ?? '--'}A.`
      );
      if (diagLower.includes('curto') || (t.prots && t.prots.length > 0)) {
        pontosMedicao.push(
          'Limitar fonte a 1 A e mapear aquecimento na malha primária com breu ou câmera térmica.'
        );
      } else if ((t.fugaMa ?? 0) > 20 || diagLower.includes('fuga')) {
        pontosMedicao.push(
          `Investigar fuga de ${t.fugaMa ?? '>20'} mA em standby desconectando periféricos antes de analisar PMIC/capacitores.`
        );
      }
    });
  }

  if (params.triage?.bat) {
    alertasSeguranca.push(
      'Bateria inchada registrada na triagem: PROIBIDO aplicar choque de 5,2 V ou usar espátula metálica.'
    );
  }
  if (params.triage?.oxi) {
    alertasSeguranca.push(
      'Sinais de oxidação: remover periféricos e isolar microfones com fita térmica/alumínio antes da cuba ultrassônica.'
    );
  }
  if (params.triage?.apagado) {
    alertasSeguranca.push(
      'Aparelho deu entrada apagado: iniciar alimentação na fonte com proteção de corrente reduzida.'
    );
  }

  const resumoPartes = [
    templates[0] ? `Roteiro: ${templates[0].t}` : '',
    offline.modelHistory
      ? `Histórico ${offline.modelHistory.modelQuery}: ${offline.modelHistory.deliveredCount} OS similares`
      : '',
    params.powerTests?.[0]
      ? `Fonte ZK-SK150C: ${params.powerTests[0].diag || 'ok'} (fuga ${
          params.powerTests[0].fugaMa ?? '--'
        }mA, pico ${params.powerTests[0].ipkA ?? '--'}A)`
      : '',
  ].filter(Boolean);

  return {
    hipotesesPrincipais: Array.from(new Set(hipotesesPrincipais)),
    pontosMedicao: Array.from(new Set(pontosMedicao)),
    alertasSeguranca: Array.from(new Set(alertasSeguranca)),
    resumoTecnicoOs:
      resumoPartes.join(' · ') ||
      'Pré-diagnóstico offline: verificar consumo em fonte de bancada, oxidação e FPCs.',
    sourceMode: 'local_fallback',
  };
}

