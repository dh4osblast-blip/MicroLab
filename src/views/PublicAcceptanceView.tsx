import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Laptop,
  Lightbulb,
  Lock,
  Search,
  ShieldCheck,
  Smartphone,
  Tablet,
  Wrench,
  X,
} from 'lucide-react';
import {
  fetchPublicAcceptanceDoc,
  fetchPublicClientIp,
  PublicAcceptanceDocument,
  submitPublicClientAcceptance,
  verifyPublicDocumentQuoteHash,
} from '../services/publicAcceptance';
import { loadAuthState } from '../services/firebaseSync';
import { APP_VERSION_TAG, formatDateBR } from '../utils/pricing';

interface PublicAcceptanceViewProps {
  token: string;
  projectId: string;
}

const WHATSAPP_E164 = '5571991293552';

const formatBRL = (val: number) =>
  (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatServerIsoPtBr = (iso?: string, fallbackMs?: number) => {
  const dt = iso ? new Date(iso) : fallbackMs ? new Date(fallbackMs) : null;
  if (!dt || Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const stripSimpleMarkdownBold = (text: string) =>
  String(text || '').replace(/\*\*(.+?)\*\*/g, '$1').trim();

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

function resolveStatusDisplay(doc: PublicAcceptanceDocument): {
  label: string;
  pillClass: string;
  dotClass: string;
  pulse: boolean;
  step: number;
  cancelled: boolean;
} {
  const rawStatus = (doc.osStatus || '').trim();
  const isAccepted = doc.status === 'accepted';

  if (rawStatus === 'Cancelado') {
    return {
      label: 'OS Cancelada',
      pillClass: 'bg-red-100 text-red-800',
      dotClass: 'bg-red-500',
      pulse: false,
      step: 0,
      cancelled: true,
    };
  }

  if (rawStatus === 'Entregue') {
    return {
      label: 'Entregue ao Cliente',
      pillClass: 'bg-emerald-100 text-emerald-800',
      dotClass: 'bg-emerald-600',
      pulse: false,
      step: 5,
      cancelled: false,
    };
  }

  if (rawStatus === 'Pronto' || rawStatus === 'Pronto Retirada') {
    return {
      label: 'Pronto para Retirada',
      pillClass: 'bg-emerald-100 text-emerald-800',
      dotClass: 'bg-emerald-600',
      pulse: true,
      step: 5,
      cancelled: false,
    };
  }

  if (rawStatus === 'Em reparo' || rawStatus === 'Em Reparo SMD') {
    return {
      label: isAccepted ? 'Em Reparo na Bancada · Aceito' : 'Em Reparo na Bancada',
      pillClass: 'bg-[#1B6FD1]/10 text-[#1B6FD1]',
      dotClass: 'bg-[#1B6FD1]',
      pulse: true,
      step: 4,
      cancelled: false,
    };
  }

  if (rawStatus === 'Aguardando Peça') {
    return {
      label: isAccepted ? 'Aguardando Peça · Aceito' : 'Aguardando Peça',
      pillClass: 'bg-amber-100 text-amber-800',
      dotClass: 'bg-amber-500',
      pulse: true,
      step: 4,
      cancelled: false,
    };
  }

  if (rawStatus === 'Aprovado' || rawStatus === 'Aprovado / Fila' || isAccepted) {
    return {
      label: isAccepted ? 'Orçamento Aprovado · Em Fila' : 'Aprovado · Em Fila',
      pillClass: 'bg-emerald-100 text-emerald-800',
      dotClass: 'bg-emerald-600',
      pulse: false,
      step: 3,
      cancelled: false,
    };
  }

  return {
    label: 'Orçamento Aguardando Aceite',
    pillClass: 'bg-amber-100 text-amber-800',
    dotClass: 'bg-amber-500',
    pulse: true,
    step: 3,
    cancelled: false,
  };
}

const PROGRESS_STEPS = [
  { id: 1, label: '1. Entrada' },
  { id: 2, label: '2. Diagnóst.' },
  { id: 3, label: '3. Orçamento' },
  { id: 4, label: '4. Reparo' },
  { id: 5, label: '5. Pronto' },
] as const;

export const PublicAcceptanceView: React.FC<PublicAcceptanceViewProps> = ({
  token,
  projectId,
}) => {
  const resolvedProjectId = projectId || loadAuthState().projectId || '';
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [doc, setDoc] = useState<PublicAcceptanceDocument | null>(null);
  const [hashVerified, setHashVerified] = useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  useEffect(() => {
    let active = true;
    if (!doc) {
      setHashVerified(null);
      return;
    }
    void verifyPublicDocumentQuoteHash(doc)
      .then((valid) => {
        if (active) setHashVerified(valid);
      })
      .catch(() => {
        if (active) setHashVerified(false);
      });
    return () => {
      active = false;
    };
  }, [doc]);

  const validPhotos = useMemo(
    () =>
      (doc?.evidencePhotos || []).filter(
        (ph) => typeof ph.dataUrl === 'string' && ph.dataUrl.startsWith('data:image/')
      ),
    [doc]
  );

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight' && validPhotos.length > 1) {
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % validPhotos.length));
      } else if (e.key === 'ArrowLeft' && validPhotos.length > 1) {
        setLightboxIndex((prev) =>
          prev === null ? null : (prev - 1 + validPhotos.length) % validPhotos.length
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, validPhotos.length]);

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
    ctx.strokeStyle = '#102040';
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
          osStatus:
            !doc.osStatus || doc.osStatus === 'Orçamento' ? 'Aprovado' : doc.osStatus,
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
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-[16px] bg-white border border-slate-100 shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-6 text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-[#EAF2FD] text-[#1B6FD1] flex items-center justify-center mx-auto animate-pulse">
            <Wrench className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-[#102040]">Carregando Ordem de Serviço...</p>
          <p className="text-xs text-slate-500">Verificando integridade criptográfica do orçamento</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !doc) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-[16px] bg-white border border-slate-100 shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-semibold text-[#102040]">
            Link de Acompanhamento Indisponível
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            {errorMsg || 'Não foi possível localizar os dados deste orçamento.'}
          </p>
          <p className="text-[11px] text-slate-400">
            Solicite um novo link diretamente pelo WhatsApp da assistência técnica.
          </p>
        </div>
      </div>
    );
  }

  const isAccepted = doc.status === 'accepted';
  const statusInfo = resolveStatusDisplay(doc);
  const acceptedTimeLabel =
    formatServerIsoPtBr(doc.acceptedServerAt, doc.acceptedClientAtMs) || 'Registrado no servidor';

  const expectedDeliveryFormatted = doc.expectedDeliveryDate
    ? /^\d{4}-\d{2}-\d{2}/.test(doc.expectedDeliveryDate)
      ? formatDateBR(doc.expectedDeliveryDate)
      : doc.expectedDeliveryDate
    : '';
  const technicianLabel = (doc.technician || '').trim();
  const createdDateDisplay =
    (doc.createdDateLabel || '').trim() ||
    (doc.createdAtMs ? new Date(doc.createdAtMs).toLocaleDateString('pt-BR') : '');

  const cleanAiExplanation = stripSimpleMarkdownBold(doc.aiExplanation || '');
  const cleanTechnicalReport = stripSimpleMarkdownBold(doc.technicalReport || '');
  const showTechnicalReportSeparately =
    Boolean(cleanTechnicalReport) && cleanTechnicalReport !== cleanAiExplanation;
  const checklistChips = Array.isArray(doc.entryChecklist) ? doc.entryChecklist : [];
  const hasTechnicalSection = Boolean(
    cleanAiExplanation || cleanTechnicalReport || checklistChips.length > 0
  );

  const paidAmount = Math.max(0, Number(doc.paidAmount) || 0);
  const remainingAmount = Math.max(0, Math.round((doc.totalAmount - paidAmount) * 100) / 100);

  const cleanCondExec = stripSimpleMarkdownBold(doc.condExec || '');
  const cleanWarrantyText = stripSimpleMarkdownBold(doc.warrantyText || '');
  const safeSignaturePng =
    doc.signaturePng && doc.signaturePng.startsWith('data:image/') ? doc.signaturePng : '';

  const whatsappUrl = `https://wa.me/${WHATSAPP_E164}?text=${encodeURIComponent(
    `Olá! Gostaria de falar sobre a OS ${doc.orderCode} (${doc.device}).`
  )}`;

  const activeLightboxPhoto =
    lightboxIndex !== null && validPhotos[lightboxIndex] ? validPhotos[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-[#F3F6FB] py-4 px-3.5 flex justify-center font-sans text-[#1E293B]">
      <div className="w-full max-w-[420px] flex flex-col gap-3.5">
        {/* 1. InstitutionalHeader */}
        <header className="bg-[#102040] text-white rounded-[16px] p-4 shadow-md">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/pwa-192x192.png"
                alt="MicroLab Assistência Técnica"
                className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/15"
              />
              <div className="min-w-0">
                <h1 className="text-[14px] font-semibold leading-tight truncate">
                  MicroLab Assistência Técnica
                </h1>
                <p className="text-[11px] text-slate-300 leading-snug truncate">
                  Acompanhamento &amp; Aceite Digital de OS
                </p>
              </div>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contato rápido via WhatsApp"
              className="shrink-0 inline-flex items-center gap-1.5 bg-[#16A34A] hover:bg-green-700 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-full transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.172.109-1.891-.125-.438-.141-1-.328-1.719-.641-3.016-1.313-4.984-4.359-5.141-4.563-.156-.203-1.234-1.641-1.234-3.125s.781-2.219 1.063-2.516c.281-.297.609-.375.813-.375.203 0 .406.016.578.016.188 0 .438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.031.547-.094.203-.141.328-.281.5-.141.172-.297.375-.422.5-.141.141-.281.297-.125.578.156.281.703 1.156 1.516 1.875 1.047.922 1.922 1.219 2.203 1.359.281.141.438.125.609-.063.172-.188.703-.828.891-1.109.188-.281.375-.234.625-.141.25.094 1.609.766 1.891.906.281.141.469.203.531.313.063.109.063.641-.188 1.344z" />
              </svg>
              <span>WhatsApp</span>
            </a>
          </div>
        </header>

        {/* 2. RealtimeStatusCard */}
        <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Status Atual
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusInfo.pillClass}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass} ${
                  statusInfo.pulse ? 'animate-pulse' : ''
                }`}
              />
              <span>{statusInfo.label}</span>
            </span>
          </div>

          {statusInfo.cancelled ? (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-800">
              Esta Ordem de Serviço foi cancelada pela assistência técnica. Em caso de dúvida, fale
              conosco pelo WhatsApp acima.
            </div>
          ) : (
            <div aria-label="Progresso da Ordem de Serviço">
              <div className="grid grid-cols-5 gap-1 text-center">
                {PROGRESS_STEPS.map((st) => {
                  const reached = statusInfo.step >= st.id;
                  const current = statusInfo.step === st.id;
                  const barColor =
                    statusInfo.step === 5 && st.id === 5
                      ? 'bg-[#16A34A]'
                      : reached
                        ? 'bg-[#1B6FD1]'
                        : 'bg-slate-200';
                  const textColor =
                    statusInfo.step === 5 && st.id === 5
                      ? 'font-bold text-[#16A34A]'
                      : current
                        ? 'font-bold text-[#1B6FD1]'
                        : reached
                          ? 'font-semibold text-[#1B6FD1]'
                          : 'font-medium text-slate-400';
                  return (
                    <div key={st.id} className="flex flex-col items-center">
                      <div className={`w-full h-1.5 rounded-full mb-1.5 transition-colors ${barColor}`} />
                      <span className={`text-[10px] leading-tight ${textColor}`}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(expectedDeliveryFormatted || technicianLabel) && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              {expectedDeliveryFormatted ? (
                <div>
                  <span className="text-slate-400">Previsão: </span>
                  <strong className="font-semibold text-slate-700">
                    {expectedDeliveryFormatted}
                  </strong>
                </div>
              ) : (
                <div />
              )}
              {technicianLabel && (
                <div className="text-right">
                  <span className="text-slate-400">Técnico: </span>
                  <strong className="font-semibold text-slate-700">{technicianLabel}</strong>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. ServiceOrderDetails */}
        <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 min-w-0">
              {doc.deviceCategory === 'notebook' ? (
                <Laptop className="w-4 h-4 text-[#1B6FD1] shrink-0" />
              ) : doc.deviceCategory === 'tablet' ? (
                <Tablet className="w-4 h-4 text-[#1B6FD1] shrink-0" />
              ) : (
                <Smartphone className="w-4 h-4 text-[#1B6FD1] shrink-0" />
              )}
              <h2 className="text-[14px] font-semibold text-[#102040] truncate">
                Ordem de Serviço {doc.orderCode}
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-500 truncate max-w-[46%]">
              {doc.clientName}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[#F8FAFC] rounded-xl p-2.5 border border-slate-100 col-span-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Equipamento / Modelo
              </span>
              <span className="text-[12px] font-semibold text-slate-800">{doc.device}</span>
            </div>

            {Boolean(doc.deviceSerial && doc.deviceSerial.trim()) && (
              <div className="bg-[#F8FAFC] rounded-xl p-2.5 border border-slate-100 col-span-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {doc.deviceCategory === 'notebook' ? 'S/N (Serial)' : 'IMEI'}
                </span>
                <span className="text-[12px] font-semibold font-mono text-slate-800 break-all">
                  {doc.deviceSerial}
                </span>
              </div>
            )}

            {createdDateDisplay && (
              <div className="bg-[#F8FAFC] rounded-xl p-2.5 border border-slate-100">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Data de Entrada
                </span>
                <span className="text-[12px] font-semibold text-slate-800">{createdDateDisplay}</span>
              </div>
            )}

            <div
              className={`bg-[#F8FAFC] rounded-xl p-2.5 border border-slate-100 ${
                createdDateDisplay ? '' : 'col-span-2'
              }`}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Garantia Prevista
              </span>
              <span className="text-[12px] font-semibold text-slate-800">
                {doc.warrantyDays} dias (CDC)
              </span>
            </div>

            {Boolean(doc.issue && doc.issue.trim()) && (
              <div className="bg-[#F8FAFC] rounded-xl p-2.5 border border-slate-100 col-span-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Defeito Relatado pelo Cliente
                </span>
                <p className="text-[12px] text-slate-700 leading-snug mt-0.5">{doc.issue}</p>
              </div>
            )}
          </div>
        </section>

        {/* 4. TechnicalReportCard (Condicional) */}
        {hasTechnicalSection && (
          <section className="rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4 border border-[#1B6FD1]/35 bg-gradient-to-b from-[#F8FBFF] to-white">
            <div className="flex items-start gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1B6FD1]/10 text-[#1B6FD1] flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-[#102040] leading-tight">
                  Laudo Técnico &amp; Diagnóstico
                </h2>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  {cleanAiExplanation
                    ? 'Parecer técnico explicado de forma clara para você (traduzido com IA)'
                    : 'Parecer técnico e inspeção de entrada da bancada'}
                </p>
              </div>
            </div>

            {(cleanAiExplanation || cleanTechnicalReport) && (
              <div className="space-y-2.5 text-[12px] text-slate-700 leading-relaxed bg-white rounded-xl p-3 border border-slate-100">
                {cleanAiExplanation && (
                  <p className="whitespace-pre-line">{cleanAiExplanation}</p>
                )}
                {showTechnicalReportSeparately && (
                  <div className={cleanAiExplanation ? 'pt-2 border-t border-slate-100' : ''}>
                    {cleanAiExplanation && (
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                        Registro Técnico da Bancada
                      </span>
                    )}
                    <p className="whitespace-pre-line">{cleanTechnicalReport}</p>
                  </div>
                )}
              </div>
            )}

            {checklistChips.length > 0 && (
              <div className={cleanAiExplanation || cleanTechnicalReport ? 'mt-3' : ''}>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                  Checklist de Entrada
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {checklistChips.map((chip, idx) => {
                    const chipStyle =
                      chip.tone === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                        : chip.tone === 'warn'
                          ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                          : 'bg-slate-100 text-slate-700 border-slate-200/70';
                    return (
                      <span
                        key={`${chip.label}-${idx}`}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${chipStyle}`}
                      >
                        {chip.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 5. PhotoEvidenceCard (Condicional + Lightbox) */}
        {validPhotos.length > 0 && (
          <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-[14px] font-semibold text-[#102040]">
                Fotos do Aparelho (Check-in &amp; Evidências)
              </h2>
              <span className="text-[11px] font-semibold text-[#1B6FD1] bg-[#1B6FD1]/10 px-2 py-0.5 rounded-full shrink-0">
                {validPhotos.length} {validPhotos.length === 1 ? 'foto' : 'fotos'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {validPhotos.map((ph, idx) => (
                <button
                  key={ph.slot || idx}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className="group text-left focus:outline-none cursor-pointer"
                >
                  <div className="relative rounded-xl overflow-hidden bg-slate-100 aspect-[4/3] border border-slate-100">
                    <img
                      src={ph.dataUrl}
                      alt={ph.label}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <span className="block text-[11px] font-medium text-slate-600 mt-1 truncate">
                    {ph.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 6. BudgetBreakdownCard */}
        <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4">
          <h2 className="text-[14px] font-semibold text-[#102040] mb-3">
            Valores Discriminados do Orçamento
          </h2>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="py-2 px-3">Descrição</th>
                  <th className="py-2 px-2 text-center">Qtd</th>
                  <th className="py-2 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[12px]">
                {doc.servicePrice > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 text-slate-700">{doc.serviceName}</td>
                    <td className="py-2.5 px-2 text-center text-slate-500 tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-800 whitespace-nowrap tabular-nums">
                      {formatBRL(doc.servicePrice)}
                    </td>
                  </tr>
                )}
                {doc.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 text-slate-700">{it.d}</td>
                    <td className="py-2.5 px-2 text-center text-slate-500 tabular-nums">{it.q}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-800 whitespace-nowrap tabular-nums">
                      {formatBRL(it.q * it.v)}
                    </td>
                  </tr>
                ))}
                {doc.partsPrice > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 text-slate-700">Peças e Componentes Aplicados</td>
                    <td className="py-2.5 px-2 text-center text-slate-500 tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-800 whitespace-nowrap tabular-nums">
                      {formatBRL(doc.partsPrice)}
                    </td>
                  </tr>
                )}
                {doc.deliveryFee > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 text-slate-600">Taxa de entrega</td>
                    <td className="py-2.5 px-2 text-center text-slate-500 tabular-nums">1</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums">
                      {formatBRL(doc.deliveryFee)}
                    </td>
                  </tr>
                )}
                {doc.discount > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 text-[#16A34A] font-medium">Desconto concedido</td>
                    <td className="py-2.5 px-2 text-center text-slate-400">-</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#16A34A] whitespace-nowrap tabular-nums">
                      - {formatBRL(doc.discount)}
                    </td>
                  </tr>
                )}
                {paidAmount > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 text-slate-600">Sinal / valor já pago</td>
                    <td className="py-2.5 px-2 text-center text-slate-400">-</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums">
                      - {formatBRL(paidAmount)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-[#F8FBFF] border-t border-slate-200">
                  <td colSpan={2} className="py-3 px-3 text-[12px] font-bold text-[#102040] uppercase">
                    {paidAmount > 0
                      ? 'Valor Total / Saldo Restante'
                      : isAccepted
                        ? 'Valor Total Aprovado'
                        : 'Valor Total do Orçamento'}
                  </td>
                  <td className="py-3 px-3 text-right text-[15px] font-bold text-[#1B6FD1] whitespace-nowrap tabular-nums">
                    {formatBRL(paidAmount > 0 ? remainingAmount : doc.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {paidAmount > 0 && (
            <p className="text-[11px] text-slate-500 text-right mt-2">
              Total original do orçamento:{' '}
              <strong className="text-slate-700 tabular-nums">{formatBRL(doc.totalAmount)}</strong>
            </p>
          )}
        </section>

        {/* 7. TermsAndWarrantyCard */}
        <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
            <h2 className="text-[14px] font-semibold text-[#102040]">
              Condições Gerais &amp; Garantia
            </h2>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md border shrink-0 ${
                hashVerified === true
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200/80'
                  : hashVerified === false
                    ? 'text-red-700 bg-red-50 border-red-200'
                    : 'text-slate-500 bg-slate-100 border-slate-200/70'
              }`}
              title={
                hashVerified === true
                  ? 'Selo SHA-256 verificado no navegador'
                  : hashVerified === false
                    ? 'Atenção: divergência no selo SHA-256'
                    : 'Selo criptográfico SHA-256'
              }
            >
              <Lock className="w-3 h-3 shrink-0" />
              <span>SHA-256: {doc.quoteHash.slice(0, 12)}…</span>
            </span>
          </div>

          <div className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
            {cleanCondExec && (
              <p>
                <strong className="text-slate-800">Condições de Execução:</strong> {cleanCondExec}
              </p>
            )}
            {cleanWarrantyText && (
              <p>
                <strong className="text-slate-800">Garantia:</strong> {cleanWarrantyText}
              </p>
            )}
          </div>
        </section>

        {/* 8. DigitalSignatureCard / Aceite Confirmado */}
        {isAccepted ? (
          <section className="rounded-[16px] bg-[#DCFCE7] border border-[#16A34A]/40 p-4 shadow-[0_2px_10px_rgba(16,32,64,0.05)] space-y-3">
            <div className="flex items-center gap-2.5 text-[#16A34A]">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <div>
                <h2 className="text-[14px] font-semibold text-[#102040] leading-tight">
                  Aceite Digital Confirmado e Blindado
                </h2>
                <p className="text-[11px] text-slate-700 mt-0.5">
                  Registro gravado de forma imutável (write-once) no servidor.
                </p>
              </div>
            </div>

            {safeSignaturePng && (
              <div className="rounded-xl bg-white border border-[#16A34A]/30 p-3 flex justify-center">
                <img
                  src={safeSignaturePng}
                  alt="Assinatura digital do cliente"
                  className="max-h-24 w-auto object-contain"
                />
              </div>
            )}

            <div className="rounded-xl bg-white/85 border border-[#16A34A]/25 p-3 text-[11px] text-[#102040] space-y-1 font-mono">
              <div>
                <strong>Data/Hora Servidor:</strong> {acceptedTimeLabel}
              </div>
              <div>
                <strong>IP Registrado:</strong> {doc.acceptedIp || 'IP não disponível'}
              </div>
              <div className="break-all">
                <strong>Hash SHA-256 Orçamento:</strong> {doc.quoteHash}
              </div>
              {hashVerified !== null && (
                <div
                  className={`pt-1 font-sans text-[11px] font-semibold ${
                    hashVerified ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {hashVerified
                    ? '✓ Integridade verificada: escopo e valores aprovados permanecem inalterados.'
                    : '⚠ Alerta de integridade: os termos ou valores divergem do selo original.'}
                </div>
              )}
            </div>
          </section>
        ) : statusInfo.cancelled ? (
          <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4 border border-red-200 text-center space-y-1">
            <p className="text-[13px] font-semibold text-red-700">Aprovação Indisponível</p>
            <p className="text-[11px] text-slate-500">
              Esta Ordem de Serviço encontra-se cancelada e não aceita assinatura digital.
            </p>
          </section>
        ) : (
          <section className="bg-white rounded-[16px] shadow-[0_2px_10px_rgba(16,32,64,0.05)] p-4">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-[14px] font-semibold text-[#102040]">
                Assinatura Digital de Aprovação
              </h2>
              <button
                type="button"
                onClick={handleClearCanvas}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            </div>

            <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={640}
                height={220}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="w-full h-36 block touch-none cursor-crosshair bg-white"
              />
            </div>
            <p className="text-center text-[11px] text-slate-400 mt-1.5">
              Assine com o dedo ou mouse no quadro acima
            </p>

            <label className="mt-3 flex items-start gap-2.5 bg-[#F8FAFC] p-3 rounded-xl border border-slate-200/80 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#16A34A] focus:ring-[#16A34A] accent-[#16A34A]"
              />
              <span className="text-[11px] text-slate-700 leading-snug">
                Li e concordo com os serviços, valor total de{' '}
                <strong>{formatBRL(doc.totalAmount)}</strong> e termos de garantia/execução acima.
              </span>
            </label>

            {submitError && (
              <div className="mt-3 rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3 py-2 text-[11px] font-medium text-[#DC2626]">
                {submitError}
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleApproveAndSign}
              className="mt-3 w-full bg-[#16A34A] hover:bg-green-700 active:scale-[0.99] text-white font-semibold text-[13px] py-3.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting ? 'Registrando Assinatura...' : 'Aprovar Orçamento e Assinar'}
              </span>
            </button>
          </section>
        )}

        {/* 9. Footer */}
        <footer className="text-center py-2">
          <p className="text-[10px] text-slate-400">
            MicroLab OS · {APP_VERSION_TAG} · Aceite Digital com Integridade SHA-256
          </p>
        </footer>
      </div>

      {/* Fullscreen Photo Lightbox Modal */}
      {activeLightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeLightboxPhoto.label || 'Visualização de foto'}
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4"
        >
          <div className="w-full max-w-lg flex items-center justify-between mb-3">
            <span className="text-white/80 text-[11px] font-medium">
              {(lightboxIndex ?? 0) + 1} de {validPhotos.length}
            </span>
            <button
              type="button"
              aria-label="Fechar visualização"
              onClick={() => setLightboxIndex(null)}
              className="text-white bg-white/15 hover:bg-white/25 rounded-full p-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="relative w-full max-w-lg flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {validPhotos.length > 1 && (
              <button
                type="button"
                aria-label="Foto anterior"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev === null ? 0 : (prev - 1 + validPhotos.length) % validPhotos.length
                  )
                }
                className="absolute left-1 z-10 text-white bg-black/50 hover:bg-black/75 rounded-full p-2 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <img
              src={activeLightboxPhoto.dataUrl}
              alt={activeLightboxPhoto.label}
              className="max-w-full max-h-[75vh] rounded-xl object-contain"
            />

            {validPhotos.length > 1 && (
              <button
                type="button"
                aria-label="Próxima foto"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev === null ? 0 : (prev + 1) % validPhotos.length
                  )
                }
                className="absolute right-1 z-10 text-white bg-black/50 hover:bg-black/75 rounded-full p-2 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          <p className="text-white text-[12px] font-medium mt-3 text-center">
            {activeLightboxPhoto.label}
          </p>
        </div>
      )}
    </div>
  );
};
