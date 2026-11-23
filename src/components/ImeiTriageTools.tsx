import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { ServiceOrder } from '../types/lab';
import {
  findLocalImeiHistory,
  validateImeiLuhn,
} from '../utils/pricing';

interface ImeiTriageInsightProps {
  imei: string;
  orders: ServiceOrder[];
  excludeOrderId?: number;
  compact?: boolean;
}

export const ImeiTriageInsight: React.FC<ImeiTriageInsightProps> = ({
  imei,
  orders,
  excludeOrderId,
  compact = false,
}) => {
  const [copiedMsg, setCopiedMsg] = useState('');
  const [offlineWarn, setOfflineWarn] = useState(false);
  const anatelLinkRef = useRef<HTMLAnchorElement>(null);

  const luhn = useMemo(() => validateImeiLuhn(imei), [imei]);
  const history = useMemo(
    () => findLocalImeiHistory(imei, orders, excludeOrderId),
    [imei, orders, excludeOrderId]
  );

  const handleCopyAndConsultAnatel = async () => {
    const valueToCopy = luhn.digits || imei.trim();
    if (valueToCopy) {
      try {
        await navigator.clipboard.writeText(valueToCopy);
      } catch {
        // Fallback silencioso caso permissão de área de transferência esteja restrita
      }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOfflineWarn(true);
      setCopiedMsg(
        valueToCopy
          ? `IMEI ${valueToCopy} copiado. Sem internet no momento — consulte no site da Anatel quando reconectar.`
          : 'Sem conexão com a internet para abrir o portal da Anatel.'
      );
      return;
    }

    setOfflineWarn(false);
    setCopiedMsg(
      valueToCopy
        ? `IMEI ${valueToCopy} copiado! Abrindo consulta oficial Anatel...`
        : 'Abrindo consulta oficial Anatel...'
    );
    anatelLinkRef.current?.click();
    window.setTimeout(() => setCopiedMsg(''), 4000);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {luhn.status === 'valid' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#DCFCE7] border border-[#16A34A]/30 px-2 py-0.5 text-[10px] font-bold text-[#16A34A]">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>{luhn.label}</span>
          </span>
        )}
        {luhn.status === 'invalid' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#FEE2E2] border border-[#DC2626]/30 px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{luhn.label}</span>
          </span>
        )}
        {luhn.status === 'incomplete' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF7E6] border border-[#D97706]/30 px-2 py-0.5 text-[10px] font-semibold text-[#D97706]">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{luhn.label}</span>
          </span>
        )}

        <button
          type="button"
          onClick={handleCopyAndConsultAnatel}
          className={`inline-flex items-center gap-1 rounded-lg border border-[#0056ab]/30 bg-[#EAF2FD] text-[#0056ab] hover:bg-[#dfe8ff] font-semibold cursor-pointer transition-colors ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
          }`}
        >
          {copiedMsg && !offlineWarn ? (
            <Check className="w-3 h-3 text-[#16A34A] shrink-0" />
          ) : (
            <Copy className="w-3 h-3 shrink-0" />
          )}
          <span>Copiar e Consultar Anatel</span>
          <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-75" />
        </button>

        <a
          ref={anatelLinkRef}
          href="https://consultaaparelhoimpedido.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        >
          Anatel
        </a>
      </div>

      {copiedMsg && (
        <div
          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-medium flex items-center gap-1.5 ${
            offlineWarn
              ? 'bg-[#FFF7E6] border border-[#D97706]/35 text-[#92400E]'
              : 'bg-[#EAF2FD] border border-[#0056ab]/25 text-[#0056ab]'
          }`}
        >
          {offlineWarn ? (
            <WifiOff className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
          )}
          <span>{copiedMsg}</span>
        </div>
      )}

      {history.matches.length > 0 && (
        <div
          className={`rounded-lg p-2 text-[10px] leading-snug flex items-start gap-1.5 ${
            history.hasFlagged
              ? 'bg-[#FEE2E2] border border-[#DC2626]/40 text-[#991B1B] font-semibold'
              : 'bg-[#FFF7E6] border border-[#D97706]/35 text-[#92400E]'
          }`}
        >
          <ShieldAlert
            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
              history.hasFlagged ? 'text-[#DC2626]' : 'text-[#D97706]'
            }`}
          />
          <div>
            <strong className="block">
              {history.flaggedStatus === 'impedido'
                ? 'ALERTA CRÍTICO: Este IMEI já foi marcado como IMPEDIDO neste banco!'
                : history.flaggedStatus === 'suspeito'
                ? 'ATENÇÃO: Este IMEI já possui registro SUSPEITO no histórico local!'
                : `Histórico local encontrado (${history.matches.length} OS anterior${
                    history.matches.length > 1 ? 'es' : ''
                  }):`}
            </strong>
            <span>
              {history.matches
                .slice(0, 3)
                .map(
                  (m) =>
                    `${m.code} (${m.device} · ${m.status}${
                      m.triage?.imeiSt ? ` · IMEI ${m.triage.imeiSt}` : ''
                    })`
                )
                .join(' | ')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
