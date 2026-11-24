import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eraser,
  Lock,
  ShieldCheck,
  Smartphone,
  Wrench,
} from 'lucide-react';
import {
  fetchPublicAcceptanceDoc,
  fetchPublicClientIp,
  PublicAcceptanceDocument,
  submitPublicClientAcceptance,
} from '../services/publicAcceptance';
import { loadAuthState } from '../services/firebaseSync';
import { APP_VERSION_TAG } from '../utils/pricing';

interface PublicAcceptanceViewProps {
  token: string;
  projectId: string;
}

const formatBRL = (val: number) =>
  (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatServerIsoPtBr = (iso?: string, fallbackMs?: number) => {
  const dt = iso ? new Date(iso) : fallbackMs ? new Date(fallbackMs) : null;
  if (!dt || Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

function exportCompactPngSignature(sourceCanvas: HTMLCanvasElement): string {
  const maxW = 400;
  const scale = sourceCanvas.width > maxW ? maxW / sourceCanvas.width : 1;
  const targetW = Math.max(1, Math.round(sourceCanvas.width * scale));
  const targetH = Math.max(1, Math.round(sourceCanvas.height * scale));
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  if (!ctx) return sourceCanvas.toDataURL('image/png');
  ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
  return out.toDataURL('image/png');
}

export const PublicAcceptanceView: React.FC<PublicAcceptanceViewProps> = ({
  token,
  projectId,
}) => {
  const resolvedProjectId = projectId || loadAuthState().projectId || '';
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [doc, setDoc] = useState<PublicAcceptanceDocument | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!resolvedProjectId) {
        if (active) {
          setErrorMsg('Link de acompanhamento incompleto (identificador do projeto ausente).');
          setLoading(false);
        }
        return;
      }
      try {
        const fetched = await fetchPublicAcceptanceDoc(resolvedProjectId, token);
        if (!active) return;
        if (!fetched) {
          setErrorMsg('Orçamento não encontrado ou link expirado.');
        } else {
          setDoc(fetched);
        }
      } catch (err) {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Falha ao carregar orçamento.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [resolvedProjectId, token]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const pos = getPointerPos(e);
    ctx.strokeStyle = '#091b36';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isDrawingRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleApproveAndSign = async () => {
    if (!doc || !resolvedProjectId) return;
    if (!termsAccepted) {
      setSubmitError('Confirme que leu e concorda com o orçamento e os termos acima.');
      return;
    }
    if (!hasDrawn || !canvasRef.current) {
      setSubmitError('Desenhe sua assinatura no quadro acima antes de confirmar.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      const signaturePng = exportCompactPngSignature(canvasRef.current);
      const ip = await fetchPublicClientIp(2500);
      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent || 'Navegador' : 'Navegador';
      const clientAtMs = Date.now();

      await submitPublicClientAcceptance({
        projectId: resolvedProjectId,
        token,
        signaturePng,
        userAgent,
        ip,
        clientAtMs,
      });

      const refreshed = await fetchPublicAcceptanceDoc(resolvedProjectId, token).catch(() => null);
      setDoc(
        refreshed || {
          ...doc,
          status: 'accepted',
          signaturePng,
          acceptedIp: ip,
          acceptedUserAgent: userAgent,
          acceptedClientAtMs: clientAtMs,
        }
      );
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Não foi possível concluir o aceite digital.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-[#D9E0EC] p-6 text-center space-y-2 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[#EAF2FD] text-[#0056ab] flex items-center justify-center mx-auto animate-pulse">
            <Wrench className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-[#091b36]">Carregando Ordem de Serviço...</p>
          <p className="text-xs text-[#727784]">Verificando integridade criptográfica do orçamento</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !doc) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-[#D9E0EC] p-6 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold text-[#091b36]">Link de Acompanhamento Indisponível</h1>
          <p className="text-xs text-[#414752] leading-relaxed">
            {errorMsg || 'Não foi possível localizar os dados deste orçamento.'}
          </p>
          <p className="text-[11px] text-[#727784]">
            Solicite um novo link diretamente pelo WhatsApp da assistência técnica.
          </p>
        </div>
      </div>
    );
  }

  const isAccepted = doc.status === 'accepted';
  const acceptedTimeLabel =
    formatServerIsoPtBr(doc.acceptedServerAt, doc.acceptedClientAtMs) || 'Registrado no servidor';

  return (
    <div className="min-h-screen bg-[#F3F6FB] py-6 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header Público da Loja */}
        <header className="rounded-2xl bg-[#091b36] text-white p-5 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/pwa-192x192.png"
              alt="MicroLab"
              className="w-11 h-11 rounded-xl object-cover border border-white/20 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight">MicroLab Assistência Técnica</div>
              <div className="text-[11px] text-slate-300">
                Acompanhamento &amp; Aceite Digital de Orçamento · WhatsApp (71) 99129-3552
              </div>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase shrink-0 ${
              isAccepted ? 'bg-[#16A34A] text-white' : 'bg-[#F59E0B] text-[#091b36]'
            }`}
          >
            {isAccepted ? 'Aprovado' : 'Aguardando Aceite'}
          </span>
        </header>

        {/* Dados do Aparelho e Queixa */}
        <section className="rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-[#D9E0EC] pb-2.5">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#0056ab]" />
              <h2 className="text-sm font-bold text-[#091b36]">
                Ordem de Serviço {doc.orderCode}
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-[#414752]">{doc.clientName}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]/70">
              <span className="block text-[10px] font-semibold uppercase text-[#727784]">
                Equipamento
              </span>
              <strong className="text-[#091b36]">{doc.device}</strong>
            </div>
            <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]/70">
              <span className="block text-[10px] font-semibold uppercase text-[#727784]">
                Garantia Prevista
              </span>
              <strong className="text-[#091b36]">{doc.warrantyDays} dias (CDC)</strong>
            </div>
          </div>

          <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]/70 text-xs">
            <span className="block text-[10px] font-semibold uppercase text-[#727784] mb-0.5">
              Defeito Relatado / Escopo
            </span>
            <p className="text-[#091b36] font-medium leading-relaxed">{doc.issue}</p>
          </div>

          {doc.evidencePhotos.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="block text-[10px] font-bold uppercase text-[#727784]">
                Registro Fotográfico de Entrada
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {doc.evidencePhotos.map((ph, idx) => (
                  <div
                    key={ph.slot || idx}
                    className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] p-1.5 text-center space-y-1"
                  >
                    <img
                      src={ph.dataUrl}
                      alt={ph.label}
                      className="w-full h-20 object-cover rounded-lg border border-[#D9E0EC]"
                    />
                    <span className="block text-[10px] font-medium text-[#414752] truncate">
                      {ph.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Valores Discriminados */}
        <section className="rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#091b36]">Valores Discriminados do Orçamento</h2>

          <div className="rounded-xl border border-[#D9E0EC] overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F3F6FB] border-b border-[#D9E0EC] text-[10px] font-bold uppercase text-[#727784]">
                  <th className="py-2 px-3">Descrição</th>
                  <th className="py-2 px-2 text-right">Qtd</th>
                  <th className="py-2 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E0EC]">
                {doc.servicePrice > 0 && (
                  <tr>
                    <td className="py-2 px-3 font-medium text-[#091b36]">{doc.serviceName}</td>
                    <td className="py-2 px-2 text-right tabular-nums">1</td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {formatBRL(doc.servicePrice)}
                    </td>
                  </tr>
                )}
                {doc.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 text-[#091b36]">{it.d}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{it.q}</td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {formatBRL(it.q * it.v)}
                    </td>
                  </tr>
                ))}
                {doc.partsPrice > 0 && (
                  <tr>
                    <td className="py-2 px-3 text-[#091b36]">Peças e Componentes Aplicados</td>
                    <td className="py-2 px-2 text-right tabular-nums">1</td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {formatBRL(doc.partsPrice)}
                    </td>
                  </tr>
                )}
                {doc.deliveryFee > 0 && (
                  <tr>
                    <td className="py-2 px-3 text-[#414752]">Taxa de entrega</td>
                    <td className="py-2 px-2 text-right tabular-nums">1</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {formatBRL(doc.deliveryFee)}
                    </td>
                  </tr>
                )}
                {doc.discount > 0 && (
                  <tr>
                    <td className="py-2 px-3 text-[#16A34A]">Desconto concedido</td>
                    <td className="py-2 px-2 text-right tabular-nums">-</td>
                    <td className="py-2 px-3 text-right font-semibold text-[#16A34A] tabular-nums">
                      - {formatBRL(doc.discount)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-[#EAF2FD]/70 border-t border-[#D9E0EC] font-extrabold text-[#091b36]">
                  <td colSpan={2} className="py-2.5 px-3 text-right uppercase text-[11px]">
                    Valor Total Aprovado
                  </td>
                  <td className="py-2.5 px-3 text-right text-sm tabular-nums text-[#0056ab]">
                    {formatBRL(doc.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Termos & Hash SHA-256 */}
        <section className="rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#091b36]">Condições Gerais &amp; Garantia</h2>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#F3F6FB] border border-[#D9E0EC] px-2 py-0.5 text-[10px] font-mono text-[#414752]">
              <Lock className="w-3 h-3 text-[#0056ab]" />
              <span>SHA-256: {doc.quoteHash.slice(0, 12)}…</span>
            </span>
          </div>
          <p className="text-[11px] text-[#414752] leading-relaxed">
            <strong>Condições de Execução:</strong> {doc.condExec}
          </p>
          <p className="text-[11px] text-[#414752] leading-relaxed">
            <strong>Garantia:</strong> {doc.warrantyText}
          </p>
        </section>

        {/* Área de Assinatura ou Selo Imutável Confirmado */}
        {isAccepted ? (
          <section className="rounded-2xl bg-[#DCFCE7] border border-[#16A34A]/40 p-5 space-y-3">
            <div className="flex items-center gap-2.5 text-[#16A34A]">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-[#091b36]">
                  Aceite Digital Confirmado e Blindado
                </h2>
                <p className="text-[11px] text-[#414752]">
                  Este registro foi gravado de forma imutável (write-once) no servidor.
                </p>
              </div>
            </div>

            {doc.signaturePng && (
              <div className="rounded-xl bg-white border border-[#16A34A]/30 p-3 flex justify-center">
                <img
                  src={doc.signaturePng}
                  alt="Assinatura digital do cliente"
                  className="max-h-24 w-auto object-contain"
                />
              </div>
            )}

            <div className="rounded-xl bg-white/80 border border-[#16A34A]/25 p-3 text-[11px] text-[#091b36] space-y-1 font-mono">
              <div>
                <strong>Data/Hora Servidor:</strong> {acceptedTimeLabel}
              </div>
              <div>
                <strong>IP Registrado:</strong> {doc.acceptedIp || 'IP não disponível'}
              </div>
              <div className="break-all">
                <strong>Hash SHA-256 Orçamento:</strong> {doc.quoteHash}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl bg-white border border-[#D9E0EC] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#091b36]">Assinatura Digital de Aprovação</h2>
              <button
                type="button"
                onClick={handleClearCanvas}
                className="inline-flex items-center gap-1 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1 text-[11px] font-semibold text-[#414752] hover:bg-[#EAF2FD] cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            </div>

            <div className="rounded-xl border-2 border-dashed border-[#0056ab]/35 bg-[#F3F6FB] overflow-hidden">
              <canvas
                ref={canvasRef}
                width={560}
                height={180}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-40 touch-none cursor-crosshair bg-white block"
              />
            </div>
            <p className="text-[11px] text-[#727784] text-center">
              Assine com o dedo ou mouse no quadro acima
            </p>

            <label className="flex items-start gap-2.5 text-xs text-[#091b36] bg-[#F3F6FB] rounded-xl p-3 border border-[#D9E0EC] cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded border-[#D9E0EC] accent-[#0056ab]"
              />
              <span>
                Li e concordo com os serviços, valor total de{' '}
                <strong>{formatBRL(doc.totalAmount)}</strong> e termos de garantia/execução acima.
              </span>
            </label>

            {submitError && (
              <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3 py-2 text-xs font-medium text-[#DC2626]">
                {submitError}
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleApproveAndSign}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] py-3 px-4 text-xs font-bold text-white hover:bg-[#15803d] transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Registrando Assinatura...' : 'Aprovar Orçamento e Assinar'}</span>
            </button>
          </section>
        )}

        <footer className="text-center text-[10px] text-[#727784] py-2">
          MicroLab OS · {APP_VERSION_TAG} · Aceite Digital com Integridade SHA-256
        </footer>
      </div>
    </div>
  );
};
