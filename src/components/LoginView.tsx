import React, { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { useLabStore } from '../store/useLabStore';
import { getLoginLockStatus } from '../utils/auth';

export const LoginView: React.FC = () => {
  const { state, syncStatus, createFirstAdmin, loginWithPin } = useLabStore();

  const [selectedUserId, setSelectedUserId] = useState<string>(() => state.users[0]?.id || '');
  const [nome, setNome] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockRemainingSec, setLockRemainingSec] = useState<number>(() => getLoginLockStatus().remainingSec);

  // Se o usuário já começou a digitar no formulário de primeiro acesso antes da nuvem responder,
  // não apagamos o que foi digitado; se não digitou nada, alterna suavemente para a lista sincronizada.
  const [forceFirstAccessHold, setForceFirstAccessHold] = useState(false);

  const hasUsers = state.users.length > 0;
  const showExistingLogin = hasUsers && !forceFirstAccessHold;

  useEffect(() => {
    if (state.users.length === 0) {
      setForceFirstAccessHold(false);
      setSelectedUserId('');
      return;
    }

    if (!selectedUserId || !state.users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(state.users[0].id);
    }

    // Se a lista chegou da nuvem enquanto o formulário estava vazio, vai direto para o seletor;
    // se já havia texto em `nome`, mantém o texto e oferece botão para alternar sem perda.
    if (nome.trim().length > 0 && !forceFirstAccessHold) {
      setForceFirstAccessHold(true);
    }
  }, [state.users, selectedUserId, nome, forceFirstAccessHold]);

  // Contagem regressiva em tempo real do bloqueio ml_lk
  useEffect(() => {
    if (lockRemainingSec <= 0) return;
    const timer = window.setInterval(() => {
      const rem = getLoginLockStatus().remainingSec;
      setLockRemainingSec(rem);
      if (rem <= 0) {
        setError('');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockRemainingSec]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!showExistingLogin) {
      const cleanPin = pin.replace(/\s+/g, '');
      if (!nome.trim()) {
        setError('Informe seu nome.');
        return;
      }
      if (cleanPin.length < 4) {
        setError('O PIN deve ter no mínimo 4 dígitos.');
        return;
      }
      setBusy(true);
      try {
        const res = await createFirstAdmin(nome.trim(), cleanPin);
        if (!res.ok) {
          setError(res.error || 'Não foi possível criar o administrador.');
        } else {
          setPin('');
          setNome('');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    const currentLock = getLoginLockStatus();
    if (currentLock.remainingSec > 0) {
      setLockRemainingSec(currentLock.remainingSec);
      setError(`Muitas tentativas. Aguarde ${currentLock.remainingSec} s.`);
      return;
    }

    const targetId = selectedUserId || state.users[0]?.id || '';
    if (!targetId) {
      setError('Selecione um usuário.');
      return;
    }

    setBusy(true);
    try {
      const res = await loginWithPin(targetId, pin);
      if (!res.ok) {
        if (res.lockRemainingSec && res.lockRemainingSec > 0) {
          setLockRemainingSec(res.lockRemainingSec);
        }
        setError(res.error || 'PIN incorreto.');
      } else {
        setPin('');
        setError('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#D9E0EC] shadow-xl p-6 sm:p-8 space-y-6">
        {/* Branding Header with Official Logo */}
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src="/pwa-192x192.png"
            alt="MicroLab OS"
            className="w-16 h-16 rounded-2xl object-cover shadow-md border border-[#D9E0EC]"
          />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#091b36]">
              Micro<span className="text-[#0056ab]">Lab</span> OS
            </h1>
            <p className="text-xs font-medium text-[#727784]">
              Assistência Técnica · Bancada SMD &amp; Gestão Operacional
            </p>
          </div>
        </div>

        {forceFirstAccessHold && hasUsers && (
          <div className="rounded-xl bg-[#EAF2FD] border border-[#0056ab]/30 p-3 text-xs text-[#091b36] space-y-2">
            <p className="font-medium">
              Usuários sincronizados da nuvem detectados ({state.users.length}).
            </p>
            <button
              type="button"
              onClick={() => {
                setForceFirstAccessHold(false);
                setError('');
              }}
              className="text-[11px] font-bold text-[#0056ab] hover:underline cursor-pointer"
            >
              Alternar para seletor de usuários existentes →
            </button>
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {!showExistingLogin ? (
            <>
              <div className="rounded-xl bg-[#EAF2FD]/70 border border-[#0056ab]/20 px-3.5 py-2.5 flex items-center gap-2 text-xs text-[#091b36]">
                <UserCheck className="w-4 h-4 text-[#0056ab] shrink-0" />
                <div>
                  <strong className="block">Primeiro acesso</strong>
                  <span className="text-[11px] text-[#414752]">
                    Crie o usuário Administrador inicial para proteger o acesso ao balcão.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Seu nome
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Nome do técnico administrador"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3.5 py-2.5 text-sm font-medium text-[#091b36] focus:border-[#0056ab] focus:bg-white focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Usuário
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setError('');
                }}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3.5 py-2.5 text-sm font-semibold text-[#091b36] focus:border-[#0056ab] focus:bg-white focus:outline-none"
              >
                {state.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} · {u.nivel}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              PIN (mínimo 4 dígitos)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#727784] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                inputMode="numeric"
                minLength={4}
                required
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-10 pr-3.5 py-2.5 text-sm font-mono font-bold tracking-widest text-[#091b36] focus:border-[#0056ab] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {lockRemainingSec > 0 && (
            <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/35 px-3.5 py-2.5 text-xs font-semibold text-[#92400E] flex items-center gap-2 tabular-nums">
              <Lock className="w-4 h-4 text-[#D97706] shrink-0" />
              <span>Muitas tentativas incorretas. Aguarde {lockRemainingSec} s para tentar novamente.</span>
            </div>
          )}

          {error && lockRemainingSec <= 0 && (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2.5 text-xs font-semibold text-[#DC2626] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || (showExistingLogin && lockRemainingSec > 0)}
            className="w-full rounded-xl bg-[#0056ab] py-3 text-sm font-bold text-white hover:bg-[#1b6fd1] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {busy
              ? 'Verificando PBKDF2…'
              : showExistingLogin
              ? 'Entrar'
              : 'Criar administrador'}
          </button>
        </form>

        <div className="pt-3 border-t border-[#D9E0EC] flex flex-col gap-1.5 text-[11px] text-[#727784]">
          <div className="flex items-center gap-1.5 text-[#16A34A] font-medium">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>PIN protegido localmente com PBKDF2-HMAC-SHA256 (150.000 iterações).</span>
          </div>
          {syncStatus.loggedIn && (
            <span className="text-[10px] text-[#414752]">
              Nuvem conectada ({syncStatus.email}) · usuários sincronizados entre aparelhos.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
