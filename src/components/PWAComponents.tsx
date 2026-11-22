import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Monitor,
  PlusSquare,
  RefreshCw,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useLabStore } from '../store/useLabStore';
import { subscribePwaUpdate, triggerSafePwaReload } from '../services/pwaUpdate';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'settings' }> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A] bg-[#DCFCE7] px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0">
          Aplicativo Instalado (Standalone)
        </span>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1b6fd1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar App</span>
      </button>
    );
  }

  const showButton = isIOS || variant === 'settings';
  if (!showButton) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 rounded-lg bg-[#EAF2FD] px-3 py-1.5 text-xs font-semibold text-[#0056ab] hover:bg-[#dfe8ff] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {isIOS ? <Smartphone className="w-4 h-4 shrink-0" /> : <Download className="w-4 h-4 shrink-0" />}
        <span>{isIOS ? 'Instalar no iOS' : 'Como Instalar PWA'}</span>
      </button>

      {showGuide && (
        <div
          data-modal-open="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/50 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#091b36]">
                {isIOS ? 'Instalar MicroLab OS no iPhone/iPad' : 'Instalar MicroLab OS (PWA)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {isIOS ? (
              <ol className="space-y-3 text-sm text-[#414752]">
                <li className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#EAF2FD] text-[#0056ab] font-bold text-xs flex items-center justify-center shrink-0">1</span>
                  <span>
                    Toque em <strong className="inline-flex items-center gap-1"><Share className="w-3.5 h-3.5" /> Compartilhar</strong> na barra do Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#EAF2FD] text-[#0056ab] font-bold text-xs flex items-center justify-center shrink-0">2</span>
                  <span>
                    Role e toque em <strong className="inline-flex items-center gap-1"><PlusSquare className="w-3.5 h-3.5" /> Adicionar à Tela de Início</strong>.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-sm text-[#414752]">
                <div className="flex items-start gap-2.5">
                  <Monitor className="w-5 h-5 text-[#0056ab] shrink-0 mt-0.5" />
                  <p>
                    No Google Chrome ou Edge, clique no ícone de instalação <strong>(⊕)</strong> na barra de endereços ou abra o menu <strong>⋮ → Salvar e compartilhar → Instalar MicroLab OS</strong>.
                  </p>
                </div>
                <p className="text-xs text-[#727784]">
                  Após instalado, o sistema abre em janela própria e mantém todos os dados disponíveis offline no navegador.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-[#0056ab] py-2.5 text-sm font-semibold text-white hover:bg-[#1b6fd1] transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-5 left-4 z-40 flex items-center gap-2 rounded-xl bg-[#D97706] px-3.5 py-2 text-xs font-semibold text-white shadow-lg print:hidden"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo Offline — Dados salvos localmente na bancada</span>
    </div>
  );
};

export const PWAUpdateBanner: React.FC = () => {
  const { powerSupplyStatus } = useLabStore();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState('');
  const [needsModalConfirm, setNeedsModalConfirm] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    return subscribePwaUpdate((next) => {
      setAvailable(next);
      if (next) setDismissed(false);
    });
  }, []);

  if (!available || dismissed) return null;

  const hasOpenDialog = () =>
    Boolean(
      document.querySelector(
        '[role="dialog"]:not([aria-label="Calculadora"]), [data-modal-open="true"], .fixed.inset-0.z-50'
      )
    );

  const handleUpdateClick = async (forceModalConfirm = false) => {
    setBlockedMsg('');
    if (powerSupplyStatus.connected || powerSupplyStatus.outputOn) {
      setBlockedMsg(
        'Fonte ZK-SK150C conectada/ligada. Desligue a saída e desconecte antes de atualizar.'
      );
      return;
    }
    if (!forceModalConfirm && hasOpenDialog()) {
      setNeedsModalConfirm(true);
      return;
    }
    setUpdating(true);
    setNeedsModalConfirm(false);
    await triggerSafePwaReload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-pwa-banner="true"
      className="fixed bottom-16 lg:bottom-5 left-4 right-4 sm:right-auto sm:max-w-md z-40 rounded-2xl bg-[#091b36] text-white p-3.5 shadow-2xl border border-[#2A3954] space-y-2 print:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <RefreshCw className={`w-4 h-4 text-[#06B6D4] shrink-0 ${updating ? 'animate-spin' : ''}`} />
          <span className="text-xs font-semibold truncate">Nova versão disponível</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={updating}
            onClick={() => void handleUpdateClick(false)}
            className="rounded-lg bg-[#06B6D4] text-[#091b36] px-2.5 py-1 text-[11px] font-bold hover:bg-[#22d3ee] transition-colors cursor-pointer disabled:opacity-60"
          >
            {updating ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              setBlockedMsg('');
              setNeedsModalConfirm(false);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            title="Adiar atualização"
            aria-label="Adiar atualização"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {blockedMsg && (
        <div className="flex items-start gap-1.5 rounded-xl bg-[#D97706]/20 border border-[#D97706]/40 px-2.5 py-1.5 text-[11px] text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
          <span>{blockedMsg}</span>
        </div>
      )}

      {needsModalConfirm && !blockedMsg && (
        <div className="rounded-xl bg-white/10 px-2.5 py-2 text-[11px] space-y-1.5">
          <p className="text-slate-200">
            Há um formulário ou diálogo aberto. Atualizar agora recarregará a página.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleUpdateClick(true)}
              className="rounded-lg bg-white text-[#091b36] px-2.5 py-1 text-[11px] font-bold cursor-pointer"
            >
              Confirmar Atualização
            </button>
            <button
              type="button"
              onClick={() => setNeedsModalConfirm(false)}
              className="rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

