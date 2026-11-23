import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import {
  extractDeviceAndImeiFromPhoto,
  getGeminiAvailability,
  LabelOcrResult,
} from '../services/geminiByok';

interface GeminiOcrButtonProps {
  onExtracted: (result: LabelOcrResult) => void;
  compact?: boolean;
}

export const GeminiOcrButton: React.FC<GeminiOcrButtonProps> = ({
  onExtracted,
  compact = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState(() => getGeminiAvailability());
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'ok' | 'warn' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    const refresh = () => setAvailability(getGeminiAvailability());
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('microlab:byok-changed', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('microlab:byok-changed', refresh);
    };
  }, []);

  const handleTrigger = () => {
    const current = getGeminiAvailability();
    setAvailability(current);
    if (!current.available) {
      setStatusMessage({ tone: 'warn', text: current.message });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setStatusMessage(null);
    try {
      const result = await extractDeviceAndImeiFromPhoto(file);
      onExtracted(result);

      const partsSummary = [
        result.marca && `Marca: ${result.marca}`,
        result.modeloComercial && `Modelo: ${result.modeloComercial}`,
        result.imei && `IMEI: ${result.imei} (${result.luhn.label})`,
      ].filter(Boolean);

      if (partsSummary.length === 0) {
        setStatusMessage({
          tone: 'warn',
          text:
            result.observacao ||
            'Não foi possível identificar modelo ou IMEI nítidos nesta foto. Tente aproximar com boa luz.',
        });
      } else {
        const hasInvalidImei = Boolean(result.imei) && result.luhn.status !== 'valid';
        const fallbackNote =
          result.isFallbackModel && result.modelUsed
            ? ` · Respondido via modelo alternativo: ${result.modelUsed}`
            : '';
        setStatusMessage({
          tone: hasInvalidImei ? 'warn' : 'ok',
          text: `${partsSummary.join(' · ')}${result.observacao ? ` — ${result.observacao}` : ''}${fallbackNote}`,
        });
      }
    } catch (err) {
      setStatusMessage({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Falha ao ler etiqueta via Gemini.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTrigger}
          disabled={busy}
          title={
            availability.available
              ? 'Fotografar etiqueta, caixa, tela *#06# ou bandeja SIM para preencher Marca, Modelo e IMEI'
              : availability.message
          }
          className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
            compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          } ${
            availability.available
              ? 'border-[#0056ab]/35 bg-[#EAF2FD] text-[#0056ab] hover:bg-[#dce9fc]'
              : 'border-[#D9E0EC] bg-[#F3F6FB] text-[#727784] hover:bg-[#eaeef5]'
          }`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : availability.reason === 'offline' ? (
            <WifiOff className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
          ) : (
            <>
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <Sparkles className="w-3 h-3 shrink-0" />
            </>
          )}
          <span>{busy ? 'Lendo etiqueta...' : 'Ler Etiqueta / IMEI por Foto'}</span>
        </button>

        {!availability.available && (
          <span className="text-[10px] text-[#727784]">
            {availability.reason === 'offline'
              ? 'Offline · preenchimento manual ativo'
              : 'Requer chave BYOK do Admin'}
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
      />

      {statusMessage && (
        <div
          className={`rounded-lg px-2.5 py-1.5 text-[11px] flex items-start gap-1.5 ${
            statusMessage.tone === 'ok'
              ? 'bg-[#DCFCE7] border border-[#16A34A]/30 text-[#14532D]'
              : statusMessage.tone === 'warn'
              ? 'bg-[#FFF7E6] border border-[#D97706]/35 text-[#92400E]'
              : 'bg-[#FEE2E2] border border-[#DC2626]/30 text-[#991B1B]'
          }`}
        >
          {statusMessage.tone === 'ok' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle
              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                statusMessage.tone === 'err' ? 'text-[#DC2626]' : 'text-[#D97706]'
              }`}
            />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};
