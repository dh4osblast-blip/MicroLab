import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, History, Stethoscope } from 'lucide-react';
import { CustomDefectItem, ServiceOrder } from '../types/lab';
import { computeOfflinePreDiagnosis } from '../utils/preDiagnosis';

interface PreDiagnosisPanelProps {
  issue: string;
  brand?: string;
  model?: string;
  orders: ServiceOrder[];
  customDefects?: CustomDefectItem[];
  editingOrderId?: number | null;
  onApplyNote?: (snippet: string) => void;
}

export const PreDiagnosisPanel: React.FC<PreDiagnosisPanelProps> = ({
  issue,
  brand,
  model,
  orders,
  customDefects,
  editingOrderId,
  onApplyNote,
}) => {
  const [expanded, setExpanded] = useState(true);

  const result = useMemo(
    () =>
      computeOfflinePreDiagnosis({
        issue,
        brand,
        model,
        orders,
        customDefects,
        editingOrderId,
      }),
    [issue, brand, model, orders, customDefects, editingOrderId]
  );

  const hasContent = result.matchedTemplates.length > 0 || result.modelHistory !== null;
  if (!hasContent) return null;

  return (
    <div className="rounded-xl border border-[#0056ab]/25 bg-[#EAF2FD]/45 px-3 py-2.5 space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Stethoscope className="w-3.5 h-3.5 text-[#0056ab] shrink-0" />
          <span className="text-[11px] font-bold text-[#091b36] truncate">
            Pré-Diagnóstico Offline
          </span>
          <span className="text-[10px] text-[#414752] truncate">
            {result.matchedTemplates.length > 0
              ? `${result.matchedTemplates.length} roteiro(s) sugerido(s)`
              : ''}
            {result.matchedTemplates.length > 0 && result.modelHistory ? ' · ' : ''}
            {result.modelHistory
              ? `${result.modelHistory.deliveredCount} OS do modelo`
              : ''}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[#414752] shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#414752] shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-[#0056ab]/15">
          {result.modelHistory && (
            <div className="rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-2 text-[11px] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[#091b36]">
                <span className="inline-flex items-center gap-1 font-bold">
                  <History className="w-3.5 h-3.5 text-[#0056ab]" />
                  <span>
                    Histórico do modelo ({result.modelHistory.deliveredCount} entregues)
                  </span>
                </span>
                {result.modelHistory.avgHours !== null && (
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-[#0056ab] tabular-nums">
                    <Clock className="w-3 h-3" />
                    Tempo médio real: {result.modelHistory.avgHours}h
                  </span>
                )}
              </div>
              {result.modelHistory.topServices.length > 0 && (
                <p className="text-[10px] text-[#414752]">
                  Serviços frequentes nesse aparelho:{' '}
                  <strong>{result.modelHistory.topServices.join(' · ')}</strong>
                </p>
              )}
            </div>
          )}

          {result.matchedTemplates.map(({ template }) => (
            <div
              key={template.id}
              className="rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-2 text-[11px] space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#091b36]">{template.t}</span>
                <span className="text-[10px] text-[#727784] shrink-0">{template.pg}</span>
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-[10.5px] text-[#414752]">
                {template.p.slice(0, 4).map((step, idx) => (
                  <li key={idx}>
                    <span>{step.text}</span>
                    {step.warning && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-[#DC2626] font-semibold">
                        <AlertTriangle className="w-3 h-3 inline" /> {step.warning}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {onApplyNote && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      onApplyNote(
                        `Pré-diagnóstico (${template.t}): ${template.p
                          .slice(0, 3)
                          .map((s) => s.text)
                          .join('; ')}.`
                      )
                    }
                    className="text-[10px] font-semibold text-[#0056ab] hover:underline cursor-pointer"
                  >
                    + Inserir roteiro nas observações
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
