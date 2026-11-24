import React from 'react';
import { CheckCircle2, CloudUpload, RefreshCw, Trash2, X } from 'lucide-react';
import { useLabStore } from '../store/useLabStore';

interface PendingSyncModalProps {
  open: boolean;
  onClose: () => void;
}

export const PendingSyncModal: React.FC<PendingSyncModalProps> = ({ open, onClose }) => {
  const { syncStatus, syncNow, detalhesPendentes, descartarPendencia } = useLabStore();

  if (!open) return null;

  const items = detalhesPendentes();

  return (
    <div
      className="fixed inset-0 z-50 bg-[#091b36]/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-sync-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white border border-[#D9E0EC] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#D9E0EC] flex items-center justify-between gap-3 bg-[#F3F6FB]/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#EAF2FD] text-[#0056ab] flex items-center justify-center shrink-0">
              <CloudUpload className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="pending-sync-modal-title"
                className="text-sm font-bold text-[#091b36] truncate"
              >
                Alterações Pendentes de Sincronização
              </h2>
              <p className="text-[11px] text-[#727784] tabular-nums">
                {syncStatus.pendingCount === 0
                  ? 'Nenhuma pendência na fila local'
                  : `${syncStatus.pendingCount} ${
                      syncStatus.pendingCount === 1 ? 'registro aguardando envio' : 'registros aguardando envio'
                    }`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de pendências"
            className="p-1.5 rounded-lg text-[#727784] hover:text-[#091b36] hover:bg-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {syncStatus.error && (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2.5 text-xs text-[#991B1B] font-medium">
              {syncStatus.error}
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-xl bg-[#DCFCE7]/50 border border-[#16A34A]/30 px-4 py-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#16A34A] mx-auto" />
              <p className="text-xs font-bold text-[#166534]">
                Tudo sincronizado! Nenhuma alteração aguardando envio.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#D9E0EC] rounded-xl border border-[#D9E0EC] overflow-hidden bg-white">
              {items.map((item) => {
                const isDelete = item.acao === 'Exclusão pendente';
                const isConfig = item.acao === 'Ajuste de parâmetro';
                return (
                  <div
                    key={item.chave}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-bold">
                          {item.tipo}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isDelete
                              ? 'bg-[#FEE2E2] text-[#DC2626]'
                              : isConfig
                              ? 'bg-[#F3F6FB] text-[#414752]'
                              : 'bg-[#FFF7E6] text-[#B45309]'
                          }`}
                        >
                          {item.acao}
                        </span>
                        <span className="text-[10px] font-mono text-[#727784] truncate">
                          {item.chave}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#091b36] truncate">
                        {item.titulo}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => descartarPendencia(item.chave)}
                      title="Descartar esta pendência da fila local"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#D9E0EC] bg-white text-[11px] font-semibold text-[#727784] hover:text-[#DC2626] hover:border-[#DC2626]/40 hover:bg-[#FEE2E2]/40 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Limpar</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#D9E0EC] bg-[#F3F6FB]/50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={syncStatus.busy}
            onClick={() => void syncNow()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] hover:bg-[#1b6fd1] disabled:opacity-55 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.busy ? 'animate-spin' : ''}`} />
            <span>{syncStatus.busy ? 'Sincronizando…' : 'Sincronizar Agora'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#D9E0EC] bg-white hover:bg-[#F3F6FB] px-3.5 py-2 text-xs font-semibold text-[#414752] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
