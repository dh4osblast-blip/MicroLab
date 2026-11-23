import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { ServiceCatalogItem, UserRole } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  APP_VERSION_TAG,
  FIXED_SHORTCUTS,
  calcDiagTaxa,
  calcEffectivePricingFromConfig,
} from '../utils/pricing';
import { USER_ROLES } from '../utils/auth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from '../components/PWAComponents';
import {
  GEMINI_BYOK_STORAGE_KEY,
  GEMINI_MODEL_ID,
  getGeminiByokKey,
  removeGeminiByokKey,
  saveGeminiByokKey,
  testGeminiByokKey,
} from '../services/geminiByok';

const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

const normKey = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

async function resizeTechSignature400Png(file: File, removeLightBg = true): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido para assinatura.'));
      img.onload = () => {
        const maxWidth = 400;
        let w = img.width || maxWidth;
        let h = img.height || 140;
        if (w > maxWidth) {
          h = Math.max(1, Math.round((h * maxWidth) / w));
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponível neste navegador.'));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        if (removeLightBg) {
          try {
            const imgData = ctx.getImageData(0, 0, w, h);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
              const alpha = d[i + 3];
              if (alpha === 0) continue;
              const r = d[i];
              const g = d[i + 1];
              const b = d[i + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
              if (lum >= 232 && maxDiff < 26) {
                d[i + 3] = 0;
              } else if (lum >= 200 && maxDiff < 26) {
                const factor = (232 - lum) / 32;
                d[i + 3] = Math.round(alpha * Math.max(0, Math.min(1, factor)));
              }
            }
            ctx.putImageData(imgData, 0, 0);
          } catch {
            // Fallback silently if pixel manipulation is blocked
          }
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

interface NumericFieldProps {
  value: number | '';
  onCommit: (val: number | '') => void;
  min?: number;
  max?: number;
  step?: string | number;
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  decimals?: number;
}

const NumericField: React.FC<NumericFieldProps> = ({
  value,
  onCommit,
  min = 0,
  max,
  step = '0.01',
  allowEmpty = false,
  placeholder,
  className = '',
  decimals = 4,
}) => {
  const formatProp = (v: number | '') => {
    if (v === '' || v === undefined || v === null) return '';
    const rounded = Number(Number(v).toFixed(decimals));
    return Number.isFinite(rounded) ? String(rounded) : '';
  };

  const [draft, setDraft] = useState<string>(() => formatProp(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(formatProp(value));
    }
  }, [value]);

  const clampNum = (n: number) => {
    let res = Math.max(min, n);
    if (max !== undefined) res = Math.min(max, res);
    return res;
  };

  const commitValue = (raw: string) => {
    const clean = raw.replace(',', '.').trim();
    if (clean === '') {
      if (allowEmpty) {
        onCommit('');
      } else {
        const fallback = clampNum(0);
        setDraft(String(fallback));
        onCommit(fallback);
      }
      return;
    }
    const num = Number(clean);
    if (!Number.isFinite(num)) {
      setDraft(formatProp(value));
      return;
    }
    const clamped = clampNum(num);
    setDraft(formatProp(clamped));
    onCommit(clamped);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      placeholder={placeholder}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        const clean = next.replace(',', '.').trim();
        if (clean === '' && allowEmpty) {
          onCommit('');
          return;
        }
        if (clean !== '' && !clean.endsWith('.') && !clean.endsWith('-')) {
          const parsed = Number(clean);
          if (Number.isFinite(parsed)) {
            onCommit(clampNum(parsed));
          }
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commitValue(draft);
      }}
      className={className}
    />
  );
};

export const SettingsView: React.FC = () => {
  const {
    state,
    currentUser,
    syncStatus,
    firebaseConfig,
    pendingAccountSwitch,
    updateLabConfig,
    setWeekdayHours,
    setWorkdaysHours,
    setQuickFixedExpense,
    addFixedExpense,
    updateFixedExpense,
    toggleFixedExpense,
    deleteFixedExpense,
    addDeliveryZone,
    deleteDeliveryZone,
    restoreOfficialPricingDefaults,
    addAppUser,
    resetAppUserPin,
    deleteAppUser,
    addTechnician,
    deleteTechnician,
    addSeller,
    deleteSeller,
    addServiceCatalog,
    updateServiceCatalog,
    deleteServiceCatalog,
    configureFirebase,
    clearFirebaseConfig,
    requestCloudSignIn,
    confirmAccountSwitch,
    signOutCloud,
    syncNow,
    exportBackupJson,
    importBackupJson,
    factoryResetLocalDb,
  } = useLabStore();
  const isOnline = useOnlineStatus();

  const cfg = state.cfg;
  const eff = calcEffectivePricingFromConfig(cfg, state.fixos);
  const isManual = eff.isManual;
  const diagTaxaVal = calcDiagTaxa(cfg);

  // Firebase config & login state
  const [configSnippet, setConfigSnippet] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState(firebaseConfig.apiKey || '');
  const [projectIdInput, setProjectIdInput] = useState(firebaseConfig.projectId || '');
  const [configFeedback, setConfigFeedback] = useState('');
  const [configError, setConfigError] = useState('');
  const [confirmClearConfig, setConfirmClearConfig] = useState(false);

  const [emailInput, setEmailInput] = useState(syncStatus.email || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authFeedback, setAuthFeedback] = useState('');
  const [authError, setAuthError] = useState('');

  // Backup JSON & Factory Reset state (double confirmation)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupFeedback, setBackupFeedback] = useState('');
  const [backupError, setBackupError] = useState('');
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetAckChecked, setResetAckChecked] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  // Restore official defaults inline confirmation
  const [confirmRestoreDefaults, setConfirmRestoreDefaults] = useState(false);
  const [defaultsRestoredMsg, setDefaultsRestoredMsg] = useState(false);

  // Seg-Sex batch input
  const [workdaysBatch, setWorkdaysBatch] = useState<string>('');

  // CRUD Despesas Fixas state
  const [newFixoNome, setNewFixoNome] = useState('');
  const [newFixoValor, setNewFixoValor] = useState('');
  const [newFixoCat, setNewFixoCat] = useState<string>(cfg.catDesp?.[0] || 'Outros');
  const [newFixoDia, setNewFixoDia] = useState('1');

  // Delivery zones & payment methods state
  const [newBairro, setNewBairro] = useState('');
  const [newEntregaValor, setNewEntregaValor] = useState('');
  const [newForma, setNewForma] = useState('');

  // Usuários (RBAC PIN) CRUD state
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Atendente');
  const [newUserPin, setNewUserPin] = useState('');
  const [userActionBusy, setUserActionBusy] = useState(false);
  const [userFeedback, setUserFeedback] = useState('');
  const [userError, setUserError] = useState('');
  const [resetPinTargetId, setResetPinTargetId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');

  // Equipe (Técnicos & Vendedores) CRUD state
  const [newTechName, setNewTechName] = useState('');
  const [newTechTel, setNewTechTel] = useState('');
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerTel, setNewSellerTel] = useState('');

  // Catálogo de Serviços (`servicos`) CRUD state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [svcNome, setSvcNome] = useState('');
  const [svcCat, setSvcCat] = useState('Hardware / Módulo');
  const [svcTempo, setSvcTempo] = useState('1');
  const [svcCons, setSvcCons] = useState('3');
  const [svcPeca, setSvcPeca] = useState('');
  const [svcGar, setSvcGar] = useState('90');
  const [svcMercado, setSvcMercado] = useState('');
  const [confirmDeleteSvcId, setConfirmDeleteSvcId] = useState<string | null>(null);
  const [svcFeedback, setSvcFeedback] = useState('');

  // Assinatura Digital do Técnico state
  const techSigInputRef = useRef<HTMLInputElement | null>(null);
  const [techSigError, setTechSigError] = useState('');
  const [techSigFeedback, setTechSigFeedback] = useState('');
  const [removeWhiteBgOnSig, setRemoveWhiteBgOnSig] = useState(true);

  // IA de Bancada · Google Gemini (BYOK — Local Only)
  const [geminiKeyInput, setGeminiKeyInput] = useState(() => getGeminiByokKey());
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiHasSavedKey, setGeminiHasSavedKey] = useState(() => Boolean(getGeminiByokKey()));
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiFeedback, setGeminiFeedback] = useState('');
  const [geminiError, setGeminiError] = useState('');

  const handleSaveGeminiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiFeedback('');
    setGeminiError('');
    const trimmed = geminiKeyInput.trim();
    if (!trimmed) {
      setGeminiError('Informe uma chave API do Google AI Studio antes de salvar.');
      return;
    }
    saveGeminiByokKey(trimmed);
    setGeminiKeyInput(trimmed);
    setGeminiHasSavedKey(true);
    setGeminiFeedback('Chave Gemini (BYOK) salva exclusivamente neste navegador.');
  };

  const handleTestGeminiKey = async () => {
    setGeminiFeedback('');
    setGeminiError('');
    const candidate = geminiKeyInput.trim() || getGeminiByokKey();
    if (!candidate) {
      setGeminiError('Cole ou salve uma chave API Gemini antes de testar.');
      return;
    }
    setGeminiTesting(true);
    const res = await testGeminiByokKey(candidate);
    setGeminiTesting(false);
    if (res.ok) {
      saveGeminiByokKey(candidate);
      setGeminiKeyInput(candidate);
      setGeminiHasSavedKey(true);
      setGeminiFeedback(`${res.message} Chave salva localmente neste navegador.`);
    } else {
      setGeminiError(res.message);
    }
  };

  const handleRemoveGeminiKey = () => {
    removeGeminiByokKey();
    setGeminiKeyInput('');
    setGeminiHasSavedKey(false);
    setGeminiError('');
    setGeminiFeedback('Chave Gemini (BYOK) removida deste dispositivo.');
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigFeedback('');
    setConfigError('');
    try {
      if (configSnippet.trim()) {
        configureFirebase(configSnippet.trim());
        setConfigSnippet('');
      } else {
        configureFirebase({ apiKey: apiKeyInput, projectId: projectIdInput });
      }
      setConfigFeedback('Configuração do Firebase salva com segurança neste navegador.');
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Falha ao salvar configuração Firebase.');
    }
  };

  const handleClearFirebaseConfig = () => {
    clearFirebaseConfig();
    setApiKeyInput('');
    setProjectIdInput('');
    setConfigSnippet('');
    setPasswordInput('');
    setConfirmClearConfig(false);
    setConfigFeedback('Configuração e sessão Firebase removidas deste dispositivo.');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthFeedback('');
    if (!emailInput.trim() || !passwordInput) {
      setAuthError('Informe e-mail e senha cadastrados no Firebase Auth.');
      return;
    }
    setAuthBusy(true);
    try {
      const res = await requestCloudSignIn(emailInput.trim(), passwordInput);
      setPasswordInput('');
      if (res.switchedDirectly) {
        setAuthFeedback('Sessão autenticada e sincronização iniciada no namespace isolado do usuário.');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Falha ao autenticar no Firebase.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDownloadBackup = () => {
    setBackupError('');
    const jsonText = exportBackupJson();
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `microlab-os-backup-lgpd-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupFeedback('Backup JSON exportado sem senhas ou padrões de desbloqueio (LGPD).');
    window.setTimeout(() => setBackupFeedback(''), 4000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupError('');
    setBackupFeedback('');
    try {
      const text = await file.text();
      const res = importBackupJson(text);
      if (res.ok) {
        setBackupFeedback('Backup JSON restaurado no armazenamento isolado atual!');
      } else {
        setBackupError(res.error || 'Arquivo inválido.');
      }
    } catch {
      setBackupError('Não foi possível ler o arquivo selecionado.');
    } finally {
      e.target.value = '';
    }
  };

  const handleFactoryReset = () => {
    if (!resetAckChecked || resetStep !== 2) return;
    factoryResetLocalDb();
    setResetStep(0);
    setResetAckChecked(false);
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 3500);
  };

  const handleAddFixo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixoNome.trim()) return;
    addFixedExpense({
      nome: newFixoNome.trim(),
      valor: Math.max(0, Number(newFixoValor.replace(',', '.')) || 0),
      cat: newFixoCat || 'Outros',
      dia: Math.max(1, Math.min(28, parseInt(newFixoDia, 10) || 1)),
      ativo: true,
    });
    setNewFixoNome('');
    setNewFixoValor('');
    setNewFixoDia('1');
  };

  const handleAddDeliveryZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBairro.trim()) return;
    addDeliveryZone(newBairro.trim(), Math.max(0, Number(newEntregaValor.replace(',', '.')) || 0));
    setNewBairro('');
    setNewEntregaValor('');
  };

  const handleAddForma = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newForma.trim();
    if (!clean) return;
    if (cfg.formas.some((f) => normKey(f) === normKey(clean))) {
      setNewForma('');
      return;
    }
    updateLabConfig((prev) => ({
      ...prev,
      formas: [...prev.formas, clean],
    }));
    setNewForma('');
  };

  const handleRemoveForma = (index: number) => {
    if (cfg.formas.length <= 1) return;
    updateLabConfig((prev) => ({
      ...prev,
      formas: prev.formas.filter((_, idx) => idx !== index),
    }));
  };

  const handleConfirmRestoreDefaults = () => {
    restoreOfficialPricingDefaults();
    setConfirmRestoreDefaults(false);
    setDefaultsRestoredMsg(true);
    window.setTimeout(() => setDefaultsRestoredMsg(false), 3500);
  };

  const handleCreateAppUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    setUserFeedback('');
    setUserActionBusy(true);
    try {
      const res = await addAppUser(newUserName, newUserRole, newUserPin.replace(/\D/g, ''));
      if (!res.ok) {
        setUserError(res.error || 'Não foi possível criar o usuário.');
        return;
      }
      setUserFeedback(`Usuário "${newUserName.trim()}" (${newUserRole}) cadastrado com hash PBKDF2-SHA256.`);
      setNewUserName('');
      setNewUserPin('');
      window.setTimeout(() => setUserFeedback(''), 4000);
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleConfirmResetUserPin = async (userId: string, userName: string) => {
    setUserError('');
    setUserFeedback('');
    setUserActionBusy(true);
    try {
      const res = await resetAppUserPin(userId, resetPinValue.replace(/\D/g, ''));
      if (!res.ok) {
        setUserError(res.error || 'Não foi possível redefinir o PIN.');
        return;
      }
      setResetPinTargetId(null);
      setResetPinValue('');
      setUserFeedback(`PIN de "${userName}" redefinido com sucesso.`);
      window.setTimeout(() => setUserFeedback(''), 4000);
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleDeleteAppUser = (userId: string, userName: string) => {
    setUserError('');
    setUserFeedback('');
    const res = deleteAppUser(userId);
    if (!res.ok) {
      setUserError(res.error || 'Não foi possível excluir o usuário.');
      return;
    }
    setUserFeedback(`Usuário "${userName}" removido.`);
    window.setTimeout(() => setUserFeedback(''), 3500);
  };

  const handleAddTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;
    addTechnician({ nome: newTechName.trim(), tel: newTechTel.trim() });
    setNewTechName('');
    setNewTechTel('');
  };

  const handleAddSeller = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSellerName.trim()) return;
    addSeller({ nome: newSellerName.trim(), tel: newSellerTel.trim() });
    setNewSellerName('');
    setNewSellerTel('');
  };

  const resetServiceForm = () => {
    setEditingServiceId(null);
    setSvcNome('');
    setSvcCat('Hardware / Módulo');
    setSvcTempo('1');
    setSvcCons('3');
    setSvcPeca('');
    setSvcGar('90');
    setSvcMercado('');
  };

  const handleEditService = (item: ServiceCatalogItem) => {
    setEditingServiceId(item.id);
    setSvcNome(item.nome);
    setSvcCat(item.cat || 'Hardware / Módulo');
    setSvcTempo(String(item.tempo ?? 1));
    setSvcCons(String(item.cons ?? 0));
    setSvcPeca(item.peca || '');
    setSvcGar(item.gar || '');
    setSvcMercado(item.mercado > 0 ? String(item.mercado) : '');
  };

  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!svcNome.trim()) return;
    const payload: Omit<ServiceCatalogItem, 'id'> = {
      nome: svcNome.trim(),
      cat: svcCat.trim() || 'Hardware / Módulo',
      tempo: Math.max(0.25, Number(svcTempo.replace(',', '.')) || 1),
      cons: Math.max(0, Number(svcCons.replace(',', '.')) || 0),
      peca: svcPeca.trim(),
      gar: svcGar.trim() || String(state.cfg.garantiaDias || 90),
      mercado: Math.max(0, Number(svcMercado.replace(',', '.')) || 0),
    };
    if (editingServiceId) {
      updateServiceCatalog(editingServiceId, payload);
      setSvcFeedback(`Serviço "${payload.nome}" atualizado.`);
    } else {
      addServiceCatalog(payload);
      setSvcFeedback(`Serviço "${payload.nome}" adicionado ao catálogo.`);
    }
    resetServiceForm();
    window.setTimeout(() => setSvcFeedback(''), 3500);
  };

  if (currentUser?.nivel !== 'Administrador') {
    return (
      <div className="max-w-xl rounded-2xl bg-white p-6 border border-[#D9E0EC] space-y-3">
        <div className="flex items-center gap-2.5 text-[#D97706]">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <h1 className="text-base font-bold text-[#091b36]">Acesso restrito a Administradores</h1>
        </div>
        <p className="text-xs text-[#414752] leading-relaxed">
          As configurações financeiras, margens, parâmetros de precificação, usuários PIN e nuvem Firebase são exclusivas para o nível <strong>Administrador</strong>.
        </p>
        {currentUser && (
          <p className="text-[11px] text-[#727784]">
            Sessão ativa: <strong>{currentUser.nome}</strong> · {currentUser.nivel}
          </p>
        )}
      </div>
    );
  }

  const renderSyncBadge = () => {
    if (!isOnline) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-[#FFF7E6] text-[#D97706] text-[11px] font-bold">
          Offline (Cache local ativo)
        </span>
      );
    }
    if (!syncStatus.configured) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-[#F3F6FB] text-[#727784] text-[11px] font-bold">
          Não configurado
        </span>
      );
    }
    if (!syncStatus.loggedIn) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-[#FFF7E6] text-[#D97706] text-[11px] font-bold">
          Configurado, sem login
        </span>
      );
    }
    if (syncStatus.busy) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-[#EAF2FD] text-[#0056ab] text-[11px] font-bold">
          Sincronizando…
        </span>
      );
    }
    if (syncStatus.error) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-[#FEE2E2] text-[#DC2626] text-[11px] font-bold">
          Erro na sincronização
        </span>
      );
    }
    const mins = syncStatus.lastSyncAt ? Math.max(0, Math.round((Date.now() - syncStatus.lastSyncAt) / 60000)) : null;
    return (
      <span className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#16A34A] text-[11px] font-bold">
        {mins === null ? 'Conectado' : mins === 0 ? 'Sincronizado agora' : `Sincronizado há ${mins} min`}
      </span>
    );
  };

  const inputClass =
    'w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#091b36] focus:border-[#0056ab] focus:outline-none tabular-nums';

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Configurações, Precificação &amp; Nuvem</h1>
        <p className="text-xs text-[#727784]">
          Parâmetros financeiros e operacionais editáveis (v17), PIX EMV, entrega por bairro, sincronização Firebase e PWA
        </p>
      </div>

      {/* PWA Install & Connectivity Card */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EAF2FD] text-[#0056ab] flex items-center justify-center shrink-0">
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5 text-[#D97706]" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#091b36]">Progressive Web App (Offline-First)</h2>
              <p className="text-xs text-[#727784]">
                Conectividade:{' '}
                <strong className={isOnline ? 'text-[#16A34A]' : 'text-[#D97706]'}>
                  {isOnline ? 'Online · Service Worker ativo' : 'Offline · Operando via cache local'}
                </strong>
              </p>
            </div>
          </div>
          <PWAInstallButton variant="settings" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#D9E0EC] text-xs">
          <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
            <span className="text-[#727784] block text-[11px]">Namespace Isolado Atual</span>
            <strong className="text-[#091b36] inline-flex items-center gap-1 mt-0.5 font-mono text-[11px] break-all">
              <Database className="w-3.5 h-3.5 text-[#0056ab] shrink-0" />
              {syncStatus.storageKey}
            </strong>
          </div>
          <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
            <span className="text-[#727784] block text-[11px]">Última Sincronização</span>
            <strong className="text-[#091b36] block mt-0.5">{state.labProfile.lastSync}</strong>
          </div>
          <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
            <span className="text-[#727784] block text-[11px]">Alterações Pendentes / Registros</span>
            <strong className="text-[#091b36] tabular-nums block mt-0.5">
              {syncStatus.pendingCount} pend. · {state.orders.length} OS · {state.parts.length} Peças
            </strong>
          </div>
        </div>
      </div>

      {/* Card PIX & Recebedor */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-[#0056ab]" />
            <h2 className="text-sm font-bold text-[#091b36]">Chave PIX &amp; Dados do Recebedor (BR Code EMV)</h2>
          </div>
          <span className="text-[11px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-2.5 py-0.5 rounded-lg">
            Ativo no PDV &amp; Modal PIX
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">Chave Pix</label>
            <input
              value={cfg.pixKey}
              onChange={(e) => updateLabConfig({ pixKey: e.target.value })}
              onBlur={(e) => updateLabConfig({ pixKey: e.target.value.trim() })}
              placeholder="(71) 99129-3552 ou CNPJ/EVP"
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-mono font-semibold text-[#091b36]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">Nome do Recebedor</label>
            <input
              value={cfg.pixNome}
              onChange={(e) => updateLabConfig({ pixNome: e.target.value })}
              onBlur={(e) => updateLabConfig({ pixNome: e.target.value.trim() })}
              maxLength={40}
              placeholder="MicroLab Assistencia Tecnica"
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">Cidade (Sem acentos, até 15 chars)</label>
            <input
              value={cfg.pixCid}
              onChange={(e) => updateLabConfig({ pixCid: e.target.value })}
              onBlur={(e) => updateLabConfig({ pixCid: e.target.value.trim().toUpperCase() })}
              maxLength={15}
              placeholder="SALVADOR"
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] uppercase"
            />
          </div>
        </div>
        <p className="text-[11px] text-[#727784]">
          Usados no gerador de PIX EMV (CRC16-CCITT). Confira um código no app do seu banco antes de cobrar clientes.
        </p>
      </div>

      {/* Card Financeiro: Como o Preço é Formado (4 subcards numerados + Modo Manual + Restaurar Padrões) */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#0056ab]" />
              <h2 className="text-sm font-bold text-[#091b36]">Financeiro: Como o Preço é Formado</h2>
              {isManual && (
                <span className="px-2 py-0.5 rounded bg-[#FFF7E6] border border-[#D97706]/30 text-[#D97706] text-[10px] font-bold">
                  Modo manual ativo
                </span>
              )}
            </div>
            <p className="text-xs text-[#727784] mt-0.5">
              Hora técnica em uso: <strong className="text-[#091b36]">{formatBRL(eff.hourlyRate)}/h</strong> · custo
              indireto: <strong className="text-[#091b36]">{formatBRL(eff.indirectHourlyRate)}/h</strong> · retenções:{' '}
              <strong className="text-[#0056ab]">{eff.totalRetentionPct.toFixed(1)}%</strong> · meta lucro:{' '}
              <strong className="text-[#16A34A]">{eff.profitMarginPct.toFixed(1)}%</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!confirmRestoreDefaults ? (
              <button
                type="button"
                onClick={() => setConfirmRestoreDefaults(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#0056ab]" />
                <span>Restaurar padrões oficiais</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 rounded-xl bg-[#FFF7E6] border border-[#D97706]/30 px-2.5 py-1.5">
                <span className="text-[11px] font-semibold text-[#92400E]">Restaurar padrões?</span>
                <button
                  type="button"
                  onClick={handleConfirmRestoreDefaults}
                  className="px-2 py-1 rounded-lg bg-[#0056ab] text-white text-[10px] font-bold cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestoreDefaults(false)}
                  className="px-2 py-1 rounded-lg bg-white border border-[#D9E0EC] text-[#414752] text-[10px] font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        {defaultsRestoredMsg && (
          <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-3.5 py-2 text-xs font-semibold text-[#16A34A] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Parâmetros financeiros e operacionais restaurados para os valores oficiais da MicroLab.</span>
          </div>
        )}

        {/* Subcard 1 — Capacidade da bancada */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#0056ab] text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                  1
                </span>
                <span>Capacidade da bancada (seu tempo)</span>
              </h3>
              <p className="text-[11px] text-[#727784] mt-0.5">
                Quantas horas por semana você trabalha na bancada e quanto vale sua hora técnica? (0h = Folga)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {DOW_SHORT.map((label, dowIdx) => {
              const hVal = cfg.horas?.[dowIdx] ?? 0;
              return (
                <div key={label} className="rounded-xl bg-white p-2 border border-[#D9E0EC]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-[#414752]">{label}</span>
                    {hVal === 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-[#F3F6FB] text-[#727784] text-[9px] font-bold">
                        Folga
                      </span>
                    )}
                  </div>
                  <NumericField
                    min={0}
                    max={24}
                    step="0.5"
                    value={hVal}
                    onCommit={(val) => setWeekdayHours(dowIdx, Number(val) || 0)}
                    className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1 text-xs font-bold text-[#091b36] tabular-nums"
                  />
                </div>
              );
            })}

            <div className="rounded-xl bg-[#EAF2FD]/70 p-2 border border-[#0056ab]/30">
              <span className="text-[10px] font-bold text-[#0056ab] block mb-1">Seg–Sex (lote)</span>
              <input
                type="number"
                min={0}
                max={24}
                step="0.5"
                placeholder="h"
                value={workdaysBatch}
                onChange={(e) => {
                  const raw = e.target.value;
                  setWorkdaysBatch(raw);
                  if (raw !== '') {
                    const num = Number(raw.replace(',', '.'));
                    if (Number.isFinite(num)) {
                      setWorkdaysHours(num);
                    }
                  }
                }}
                className="w-full rounded-lg border border-[#0056ab]/30 bg-white px-2 py-1 text-xs font-bold text-[#091b36] tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Taxa de ocupação faturável (%)
              </label>
              <NumericField
                min={0}
                max={100}
                step="1"
                value={Number(((cfg.ocup || 0) * 100).toFixed(2))}
                onCommit={(val) =>
                  updateLabConfig({ ocup: Math.max(0, Math.min(1, (Number(val) || 0) / 100)) })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Pró-labore mensal desejado (R$)
              </label>
              <NumericField
                min={0}
                step="10"
                value={cfg.proLabore}
                onCommit={(val) => updateLabConfig({ proLabore: Math.max(0, Number(val) || 0) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Piso mínimo da hora técnica (R$)
              </label>
              <NumericField
                min={0}
                step="1"
                value={cfg.horaMin}
                onCommit={(val) => updateLabConfig({ horaMin: Math.max(0, Number(val) || 0) })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D9E0EC] text-[11px] text-[#414752]">
            <span>
              Bancada: <strong className="tabular-nums">{eff.metrics.weeklyHours.toFixed(1)}h/sem</strong> (
              <strong className="tabular-nums">{eff.metrics.monthlyHours.toFixed(2)}h/mês</strong>) · Pró-labore ÷
              faturáveis = <strong className="tabular-nums">{formatBRL(eff.metrics.proLaboreHourlyRaw)}/h</strong>
            </span>
            <span className="font-semibold text-[#091b36] tabular-nums">
              Horas faturáveis/mês: <strong className="text-[#0056ab]">{eff.metrics.billableHours.toFixed(2)}h</strong> ·
              Hora técnica: <strong className="text-[#0056ab]">{formatBRL(eff.hourlyRate)}/h</strong>
              {isManual && <span className="text-[#D97706]"> (modo manual)</span>}
            </span>
          </div>
        </div>

        {/* Subcard 2 — Estrutura fixa & CRUD de Despesas Fixas */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0056ab] text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                2
              </span>
              <span>Estrutura fixa do laboratório (rateio indireto &amp; custos fixos)</span>
            </h3>
            <p className="text-[11px] text-[#727784] mt-0.5">
              Quanto custa manter a MicroLab aberta por mês? Os atalhos abaixo sincronizam diretamente com a lista de custos fixos.
            </p>
          </div>

          {/* 4 atalhos rápidos v17 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {FIXED_SHORTCUTS.map((sc) => {
              const found = state.fixos.find((x) => normKey(x.nome) === normKey(sc.nome));
              return (
                <div key={sc.nome}>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1 truncate" title={sc.nome}>
                    {sc.nome} (R$/mês)
                  </label>
                  <NumericField
                    min={0}
                    step="0.01"
                    value={found ? found.valor : ''}
                    allowEmpty
                    placeholder="0,00"
                    onCommit={(val) => setQuickFixedExpense(sc.nome, sc.cat, Number(val) || 0)}
                    className={inputClass}
                  />
                </div>
              );
            })}
          </div>

          {eff.fixedCosts === 0 && (
            <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/35 px-3 py-2 text-xs font-semibold text-[#92400E] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
              <span>Custos fixos zerados: o custo indireto/hora está em R$ 0,00 nos orçamentos.</span>
            </div>
          )}

          {/* Lista CRUD completa de Despesas Fixas */}
          <div className="rounded-xl bg-white border border-[#D9E0EC] overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#F8FAFC] border-b border-[#D9E0EC] flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#091b36]">
                Lista completa de custos fixos ({state.fixos.length})
              </span>
              <span className="text-[11px] text-[#727784]">
                Itens pausados não entram no rateio por hora nem no lançamento automático mensal
              </span>
            </div>

            {state.fixos.length > 0 ? (
              <div className="divide-y divide-[#D9E0EC]">
                {state.fixos.map((fx) => (
                  <div
                    key={fx.id}
                    className={`p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs ${
                      fx.ativo === false ? 'bg-[#F8FAFC] opacity-70' : ''
                    }`}
                  >
                    <div className="sm:col-span-4">
                      <input
                        value={fx.nome}
                        onChange={(e) => updateFixedExpense(fx.id, { nome: e.target.value })}
                        className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-semibold text-[#091b36]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <NumericField
                        min={0}
                        step="0.01"
                        value={fx.valor}
                        onCommit={(val) => updateFixedExpense(fx.id, { valor: Number(val) || 0 })}
                        className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-bold text-[#091b36] tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <select
                        value={fx.cat}
                        onChange={(e) => updateFixedExpense(fx.id, { cat: e.target.value })}
                        className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1.5 text-xs text-[#414752]"
                      >
                        {cfg.catDesp.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-1">
                      <span className="text-[10px] text-[#727784] shrink-0">Dia</span>
                      <NumericField
                        min={1}
                        max={28}
                        step="1"
                        decimals={0}
                        value={fx.dia}
                        onCommit={(val) =>
                          updateFixedExpense(fx.id, { dia: Math.max(1, Math.min(28, Number(val) || 1)) })
                        }
                        className="w-full rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2 py-1.5 text-xs font-semibold text-[#091b36] tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleFixedExpense(fx.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                          fx.ativo !== false
                            ? 'bg-[#DCFCE7] text-[#16A34A]'
                            : 'bg-[#F3F6FB] text-[#727784] border border-[#D9E0EC]'
                        }`}
                      >
                        {fx.ativo !== false ? 'Ativo' : 'Pausado'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFixedExpense(fx.id)}
                        title="Excluir custo fixo"
                        className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#727784]">
                Nenhum custo fixo cadastrado. Adicione abaixo para compor o custo indireto por hora.
              </div>
            )}

            <form
              onSubmit={handleAddFixo}
              className="p-3 bg-[#F3F6FB]/70 border-t border-[#D9E0EC] grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Novo custo fixo</label>
                <input
                  required
                  value={newFixoNome}
                  onChange={(e) => setNewFixoNome(e.target.value)}
                  placeholder="Ex.: Aluguel, Sistema, Contador"
                  className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={newFixoValor}
                  onChange={(e) => setNewFixoValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Categoria</label>
                <select
                  value={newFixoCat}
                  onChange={(e) => setNewFixoCat(e.target.value)}
                  className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2 py-1.5 text-xs"
                >
                  {cfg.catDesp.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#414752] mb-1">Dia (1–28)</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={newFixoDia}
                  onChange={(e) => setNewFixoDia(e.target.value)}
                  className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D9E0EC] text-[11px] text-[#414752]">
            <span>
              Ponto de equilíbrio mensal: <strong>{formatBRL(eff.metrics.breakEvenTarget)}</strong> (Fixos + Pró-labore)
            </span>
            <span className="font-semibold text-[#091b36] tabular-nums">
              Custo fixo mensal: <strong>{formatBRL(eff.fixedCosts)}</strong> · Custo indireto/h:{' '}
              <strong className="text-[#0056ab]">{formatBRL(eff.indirectHourlyRate)}/h</strong>
              {isManual && <span className="text-[#D97706]"> (modo manual)</span>}
            </span>
          </div>
        </div>

        {/* Subcard 3 — Blindagem e taxas sobre a venda */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0056ab] text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                3
              </span>
              <span>Blindagem e taxas sobre a venda (%)</span>
            </h3>
            <p className="text-[11px] text-[#727784] mt-0.5">
              Qual fatia de cada orçamento precisa ser retida para não dar prejuízo e proteger o caixa?
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Taxa média de recebimento (%) — Pix/cartão
              </label>
              <NumericField
                min={0}
                max={30}
                step="0.1"
                value={Number(((cfg.taxaPag || 0) * 100).toFixed(2))}
                onCommit={(val) => updateLabConfig({ taxaPag: Math.max(0, (Number(val) || 0) / 100) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Reserva de garantia / retrabalho (%)
              </label>
              <NumericField
                min={0}
                max={30}
                step="0.1"
                value={Number(((cfg.reservaGar || 0) * 100).toFixed(2))}
                onCommit={(val) => updateLabConfig({ reservaGar: Math.max(0, (Number(val) || 0) / 100) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Reserva de Capital de Giro (%)
              </label>
              <NumericField
                min={0}
                max={40}
                step="0.1"
                value={Number(((cfg.reservaCap || 0) * 100).toFixed(2))}
                onCommit={(val) => updateLabConfig({ reservaCap: Math.max(0, (Number(val) || 0) / 100) })}
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-[11px] text-[#727784]">
            Taxa de recebimento e reserva de garantia entram no preço mínimo e no sugerido (e alimentam o Cofre de
            Garantia). A Reserva de Capital de Giro NÃO entra no preço: ela apenas separa parte do que foi recebido no
            Envelope 3 do caixa.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D9E0EC] text-[11px] font-semibold text-[#091b36] tabular-nums">
            <span>
              Retenção total sobre venda:{' '}
              <strong className="text-[#0056ab]">{eff.totalRetentionPct.toFixed(1)}%</strong>
              {isManual && <span className="text-[#D97706]"> (modo manual)</span>}
            </span>
            <span>
              Capital de giro (pós-recebimento):{' '}
              <strong className="text-[#16A34A]">{eff.workingCapitalPct.toFixed(1)}%</strong>
            </span>
          </div>
        </div>

        {/* Subcard 4 — Metas de lucro, curva contínua de peças e arredondamento */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0056ab] text-white text-[11px] font-bold inline-flex items-center justify-center shrink-0">
                4
              </span>
              <span>Metas de lucro, curva contínua de peças e arredondamento</span>
            </h3>
            <p className="text-[11px] text-[#727784] mt-0.5">
              Quanto a empresa precisa lucrar além do pró-labore e como o estoque calcula a revenda de peças?
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Meta de lucro líquida sobre serviços (%)
              </label>
              <NumericField
                min={0}
                max={80}
                step="0.5"
                value={Number(((cfg.preco?.margem || 0) * 100).toFixed(2))}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    preco: { ...prev.preco, margem: Math.max(0, (Number(val) || 0) / 100) },
                  }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Limite entre faixas de peça (R$)
              </label>
              <NumericField
                min={0.01}
                step="1"
                value={cfg.margem.limite}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    margem: { ...prev.margem, limite: Math.max(0.01, Number(val) || 50) },
                  }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Custo-teto peças caras (R$)
              </label>
              <NumericField
                min={1}
                step="10"
                value={cfg.margem.teto}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    margem: { ...prev.margem, teto: Math.max(prev.margem.limite, Number(val) || 500) },
                  }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Baratas (R$ 0): margem máx. (%)
              </label>
              <NumericField
                min={0}
                step="1"
                value={cfg.margem.baixaMax}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    margem: { ...prev.margem, baixaMax: Math.max(0, Number(val) || 0) },
                  }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Margem no limite de {formatBRL(cfg.margem.limite)} (%)
              </label>
              <NumericField
                min={0}
                step="1"
                value={cfg.margem.baixaMin}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    margem: { ...prev.margem, baixaMin: Math.max(0, Number(val) || 0) },
                  }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Margem no custo-teto {formatBRL(cfg.margem.teto)} (%)
              </label>
              <NumericField
                min={0}
                step="1"
                value={cfg.margem.altaMin}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    margem: { ...prev.margem, altaMin: Math.max(0, Number(val) || 0) },
                  }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Arredondar com passo menor até (R$)
              </label>
              <NumericField
                min={0}
                step="1"
                value={cfg.arred.ate}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    arred: { ...prev.arred, ate: Math.max(0, Number(val) || 0) },
                  }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Passo até esse valor (R$)
              </label>
              <NumericField
                min={0.01}
                step="0.5"
                value={cfg.arred.baixo}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    arred: { ...prev.arred, baixo: Math.max(0.01, Number(val) || 1) },
                  }))
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Passo acima desse valor (R$)
              </label>
              <NumericField
                min={0.01}
                step="0.5"
                value={cfg.arred.alto}
                onCommit={(val) =>
                  updateLabConfig((prev) => ({
                    ...prev,
                    arred: { ...prev.arred, alto: Math.max(0.01, Number(val) || 5) },
                  }))
                }
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-[11px] text-[#727784]">
            Regra de arredondamento ativa: preços até <strong>{formatBRL(cfg.arred.ate)}</strong> sobem de{' '}
            <strong>{formatBRL(cfg.arred.baixo)}</strong> em <strong>{formatBRL(cfg.arred.baixo)}</strong>; acima disso,
            de <strong>{formatBRL(cfg.arred.alto)}</strong> em <strong>{formatBRL(cfg.arred.alto)}</strong>.
          </p>

          <div className="pt-2 border-t border-[#D9E0EC] text-[11px] font-semibold text-[#091b36] tabular-nums">
            Equação ativa: <strong>{formatBRL(eff.hourlyRate)}/h</strong> +{' '}
            <strong>{formatBRL(eff.indirectHourlyRate)}/h indireto</strong> |{' '}
            <strong className="text-[#0056ab]">{eff.totalRetentionPct.toFixed(1)}%</strong> retenções |{' '}
            <strong className="text-[#16A34A]">{eff.profitMarginPct.toFixed(1)}%</strong> margem líquida
          </div>
        </div>

        {/* Modo Automático ↔ Modo Manual */}
        <div className="rounded-xl bg-[#EAF2FD]/55 border border-[#0056ab]/25 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#091b36]">
                {isManual ? 'Modo Manual Ativo (Sobrescreve cálculos automáticos)' : 'Modo Automático Ativo (Recomendado)'}
              </p>
              <p className="text-[11px] text-[#414752]">
                OS já salvas mantêm seu custo gravado; alterações aqui passam a valer para novos orçamentos e simulador.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateLabConfig((prev) => ({
                  ...prev,
                  preco: {
                    ...prev.preco,
                    modo: isManual ? 'auto' : 'manual',
                    hora: !isManual ? eff.hourlyRate : prev.preco.hora,
                    indireto: !isManual ? eff.indirectHourlyRate : prev.preco.indireto,
                    taxa: !isManual ? eff.totalRetentionPct / 100 : prev.preco.taxa,
                  },
                }))
              }
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                isManual
                  ? 'bg-[#0056ab] text-white hover:bg-[#1b6fd1]'
                  : 'border border-[#D9E0EC] bg-white text-[#091b36] hover:bg-[#F3F6FB]'
              }`}
            >
              {isManual ? 'Voltar ao automático' : 'Usar valores manuais'}
            </button>
          </div>

          {isManual && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Hora técnica manual (R$)</label>
                <NumericField
                  min={0}
                  step="0.5"
                  value={cfg.preco.hora}
                  onCommit={(val) =>
                    updateLabConfig((prev) => ({
                      ...prev,
                      preco: { ...prev.preco, hora: Math.max(0, Number(val) || 0) },
                    }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Custo indireto manual (R$/h)
                </label>
                <NumericField
                  min={0}
                  step="0.1"
                  value={cfg.preco.indireto}
                  onCommit={(val) =>
                    updateLabConfig((prev) => ({
                      ...prev,
                      preco: { ...prev.preco, indireto: Math.max(0, Number(val) || 0) },
                    }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Retenção variável total (%)
                </label>
                <NumericField
                  min={0}
                  max={49}
                  step="0.1"
                  value={Number(((cfg.preco.taxa || 0) * 100).toFixed(2))}
                  onCommit={(val) =>
                    updateLabConfig((prev) => ({
                      ...prev,
                      preco: { ...prev.preco, taxa: Math.max(0, (Number(val) || 0) / 100) },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Operação, Entrega por Bairro, Metas, Segurança & Termos */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-5">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#0056ab]" />
          <h2 className="text-sm font-bold text-[#091b36]">Operação, Entrega por Bairro, Metas &amp; Termos</h2>
        </div>

        {/* Entrega por bairro */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-[#091b36]">
                Repasse de Entrega / Uber Flash por Bairro (a volta; o app soma a margem)
              </h3>
              <p className="text-[11px] text-[#727784]">
                Preenchimento automático da taxa de entrega na OS quando o cliente possui bairro cadastrado.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Margem de segurança da entrega (% do repasse)
              </label>
              <NumericField
                min={0}
                max={50}
                step="0.5"
                value={cfg.entMargem}
                onCommit={(val) => updateLabConfig({ entMargem: Math.max(0, Number(val) || 0) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Margem mínima adicional da entrega (R$)
              </label>
              <NumericField
                min={0}
                step="0.5"
                value={cfg.entMin}
                onCommit={(val) => updateLabConfig({ entMin: Math.max(0, Number(val) || 0) })}
                className={inputClass}
              />
            </div>
          </div>

          {cfg.entrega.length > 0 && (
            <div className="rounded-xl bg-white border border-[#D9E0EC] divide-y divide-[#D9E0EC]">
              {cfg.entrega.map((z, idx) => (
                <div key={`${z.bairro}-${idx}`} className="px-3 py-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#091b36]">{z.bairro}</span>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-bold text-[#0056ab]">{formatBRL(z.valor)} repasse</span>
                    <button
                      type="button"
                      onClick={() => deleteDeliveryZone(idx)}
                      className="text-[#DC2626] hover:bg-[#FEE2E2] p-1 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddDeliveryZone} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div className="sm:col-span-6">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">Bairro</label>
              <input
                required
                value={newBairro}
                onChange={(e) => setNewBairro(e.target.value)}
                placeholder="Ex.: Pituba, Brotas, Imbuí"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">Valor repasse (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={newEntregaValor}
                onChange={(e) => setNewEntregaValor(e.target.value)}
                placeholder="15,00"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Bairro</span>
              </button>
            </div>
          </form>
        </div>

        {/* Política, Diagnóstico, Garantia, Metas & Segurança */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Validade do orçamento (dias)
            </label>
            <NumericField
              min={0}
              step="1"
              decimals={0}
              value={cfg.validOrc}
              onCommit={(val) => updateLabConfig({ validOrc: Math.max(0, Math.round(Number(val) || 0)) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Taxa diagnóstico (R$; vazio = auto {formatBRL(diagTaxaVal)})
            </label>
            <NumericField
              min={0}
              step="0.5"
              allowEmpty
              placeholder={`Auto (${formatBRL(diagTaxaVal)})`}
              value={cfg.diagTaxa === '' ? '' : Number(cfg.diagTaxa)}
              onCommit={(val) => updateLabConfig({ diagTaxa: val === '' ? '' : Math.max(0, Number(val) || 0) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Tempo base diagnóstico auto (h)
            </label>
            <NumericField
              min={0.1}
              step="0.25"
              value={cfg.diagHoras}
              onCommit={(val) => updateLabConfig({ diagHoras: Math.max(0.1, Number(val) || 0.5) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Garantia padrão (dias · CDC)
            </label>
            <NumericField
              min={0}
              step="1"
              decimals={0}
              value={cfg.garantiaDias}
              onCommit={(val) => updateLabConfig({ garantiaDias: Math.max(0, Math.round(Number(val) || 0)) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Meta de faturamento mensal (R$)
            </label>
            <NumericField
              min={0}
              step="50"
              value={cfg.metaMes}
              onCommit={(val) => updateLabConfig({ metaMes: Math.max(0, Number(val) || 0) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Ticket médio esperado (R$ · &lt;10 OS)
            </label>
            <NumericField
              min={0}
              step="10"
              value={cfg.ticketEsp}
              onCommit={(val) => updateLabConfig({ ticketEsp: Math.max(0, Number(val) || 0) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Custo médio esperado peça+cons (R$)
            </label>
            <NumericField
              min={0}
              step="5"
              value={cfg.custoEsp}
              onCommit={(val) => updateLabConfig({ custoEsp: Math.max(0, Number(val) || 0) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Sair por inatividade (min; 0 = off)
            </label>
            <NumericField
              min={0}
              step="1"
              decimals={0}
              value={cfg.idle}
              onCommit={(val) => updateLabConfig({ idle: Math.max(0, Math.round(Number(val) || 0)) })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] tabular-nums"
            />
          </div>
        </div>

        {/* Formas de pagamento */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#091b36]">
            <Banknote className="w-4 h-4 text-[#0056ab]" />
            <span>Formas de pagamento aceitas (OS, PDV &amp; Caixa)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {cfg.formas.map((f, idx) => (
              <span
                key={`${f}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-1 text-xs font-semibold text-[#091b36]"
              >
                <span>{f}</span>
                {cfg.formas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveForma(idx)}
                    title="Remover forma de pagamento"
                    className="text-[#727784] hover:text-[#DC2626] cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          <form onSubmit={handleAddForma} className="flex gap-2 max-w-sm">
            <input
              value={newForma}
              onChange={(e) => setNewForma(e.target.value)}
              placeholder="Ex.: Cartão Débito, Crédito"
              className="flex-1 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
            >
              Adicionar
            </button>
          </form>
        </div>

        {/* Termos impressos na OS */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#091b36]">
            <FileText className="w-4 h-4 text-[#0056ab]" />
            <span>Termos legais &amp; garantia impressos na OS (suporta **negrito**)</span>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">Termo de garantia</label>
            <textarea
              rows={3}
              value={cfg.termoGarantia}
              onChange={(e) => updateLabConfig({ termoGarantia: e.target.value })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Condições gerais de execução e retirada (impressas na OS)
            </label>
            <textarea
              rows={2}
              value={cfg.condExec}
              onChange={(e) => updateLabConfig({ condExec: e.target.value })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Peça fornecida pelo cliente (impresso no lugar do termo de garantia)
            </label>
            <textarea
              rows={2}
              value={cfg.termoPecaCli}
              onChange={(e) => updateLabConfig({ termoPecaCli: e.target.value })}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
            />
          </div>
        </div>

        {/* Assinatura Digital do Técnico */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-[#091b36]">Assinatura Digital do Técnico</h3>
              <p className="text-[11px] text-[#727784]">
                Redimensionada para máx. 400 px preservando transparência em PNG para o rodapé da OS (A4)
              </p>
            </div>
            <input
              ref={techSigInputRef}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setTechSigError('');
                setTechSigFeedback('');
                try {
                  const dataUrl = await resizeTechSignature400Png(file, removeWhiteBgOnSig);
                  updateLabConfig({ techSignatureDataUrl: dataUrl });
                  setTechSigFeedback('Assinatura do técnico salva e sincronizada.');
                  window.setTimeout(() => setTechSigFeedback(''), 3500);
                } catch (err) {
                  setTechSigError(
                    err instanceof Error ? err.message : 'Erro ao processar imagem da assinatura.'
                  );
                }
              }}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => techSigInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{cfg.techSignatureDataUrl ? 'Trocar assinatura' : 'Enviar assinatura'}</span>
              </button>
              {cfg.techSignatureDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    updateLabConfig({ techSignatureDataUrl: undefined });
                    setTechSigFeedback('Assinatura do técnico removida.');
                    window.setTimeout(() => setTechSigFeedback(''), 3000);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#FEE2E2] bg-white px-3 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover assinatura</span>
                </button>
              )}
            </div>
          </div>

          {techSigError && (
            <div className="rounded-lg bg-[#FEE2E2] border border-[#DC2626]/30 px-3 py-2 text-xs font-medium text-[#DC2626]">
              {techSigError}
            </div>
          )}
          {techSigFeedback && (
            <div className="rounded-lg bg-[#DCFCE7] border border-[#16A34A]/30 px-3 py-2 text-xs font-medium text-[#16A34A]">
              {techSigFeedback}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-[#D9E0EC] bg-white p-3 flex flex-col items-center justify-center min-h-[84px]">
            {cfg.techSignatureDataUrl ? (
              <img
                src={cfg.techSignatureDataUrl}
                alt="Preview da assinatura do técnico"
                className="max-h-20 w-auto object-contain mix-blend-multiply"
              />
            ) : (
              <span className="text-[11px] text-[#727784]">
                Nenhuma assinatura digital enviada (recomendado PNG com fundo transparente)
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#091b36] cursor-pointer">
              <input
                type="checkbox"
                checked={removeWhiteBgOnSig}
                onChange={(e) => setRemoveWhiteBgOnSig(e.target.checked)}
                className="rounded border-[#D9E0EC] accent-[#0056ab]"
              />
              <span>
                Remover fundo claro/branco automaticamente ao enviar
                <span className="text-[#727784] font-normal">
                  {' '}
                  (ideal para foto de assinatura em papel; impressão A4 também aplica blend transparente)
                </span>
              </span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#091b36] cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.autoPrintTechSignature !== false}
                onChange={(e) => updateLabConfig({ autoPrintTechSignature: e.target.checked })}
                className="rounded border-[#D9E0EC] accent-[#0056ab]"
              />
              <span>
                Imprimir automaticamente minha assinatura na OS (A4)
                <span className="text-[#727784] font-normal">
                  {' '}
                  — quando desmarcado, imprime a linha em branco para assinatura à caneta
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Impressão em Cupom Térmico (58 mm / 80 mm) */}
        <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-[#091b36]">Largura da Impressora Térmica (Cupom OS / PDV)</h3>
            <p className="text-[11px] text-[#727784]">
              Define o layout estreito para bobinas de 58 mm (32 col.) ou 80 mm (42 col.) com PIX QR Code e Padrão 3×3
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(
              [
                ['58mm', 'Bobina 58 mm (32 col.)'],
                ['80mm', 'Bobina 80 mm (42 col.)'],
              ] as const
            ).map(([widthOpt, label]) => {
              const active = (cfg.thermalWidth || '80mm') === widthOpt;
              return (
                <button
                  key={widthOpt}
                  type="button"
                  onClick={() => updateLabConfig({ thermalWidth: widthOpt })}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#0056ab] border-[#0056ab] text-white'
                      : 'bg-white border-[#D9E0EC] text-[#414752] hover:bg-[#EAF2FD]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium pt-2 border-t border-[#D9E0EC]">
          <span className="inline-flex items-center gap-1.5 text-[#16A34A]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>
              LGPD: PINs e padrões 3×3 permanecem apenas em RAM volátil durante o atendimento e são apagados no check-out ou F5.
            </span>
          </span>
          <span className="text-[#414752]">
            Sessão ativa: <strong>{currentUser.nome}</strong> ({currentUser.nivel})
          </span>
        </div>
      </div>

      {/* Usuários de Acesso (PIN PBKDF2 & RBAC 4 Níveis) + Equipe (Técnicos & Vendedores) */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0056ab]" />
            <div>
              <h2 className="text-sm font-bold text-[#091b36]">Usuários de Acesso (PIN), RBAC &amp; Equipe</h2>
              <p className="text-[11px] text-[#727784]">
                4 níveis de permissão (Administrador, Atendente, Vendedor, Técnico). Apenas salt e hash PBKDF2-SHA256 são sincronizados na nuvem.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-[#0056ab] bg-[#EAF2FD] px-2.5 py-1 rounded-lg self-start">
            {state.users.length} usuário(s)
          </span>
        </div>

        {userError && (
          <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2 text-xs font-medium text-[#DC2626] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{userError}</span>
          </div>
        )}
        {userFeedback && (
          <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-3.5 py-2 text-xs font-medium text-[#16A34A] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{userFeedback}</span>
          </div>
        )}

        {/* Lista de Usuários */}
        <div className="rounded-xl border border-[#D9E0EC] overflow-hidden divide-y divide-[#D9E0EC]">
          {state.users.map((u) => {
            const isSelf = u.id === currentUser.id;
            const isResetting = resetPinTargetId === u.id;
            return (
              <div key={u.id} className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#091b36]">{u.nome}</span>
                    <span className="px-2 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-bold">
                      {u.nivel}
                    </span>
                    {isSelf && (
                      <span className="px-2 py-0.5 rounded bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold">
                        Sessão atual
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#727784] font-mono mt-0.5">
                    ID {u.id} · Hash {u.h.startsWith('p3:') ? 'PBKDF2-SHA256' : 'Legado'}
                  </p>
                </div>

                {isResetting ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="password"
                      inputMode="numeric"
                      value={resetPinValue}
                      onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                      placeholder="Novo PIN (4+ díg.)"
                      className="w-32 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1.5 text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={userActionBusy}
                      onClick={() => void handleConfirmResetUserPin(u.id, u.nome)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0056ab] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Salvar PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetPinTargetId(null);
                        setResetPinValue('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-[#D9E0EC] bg-white text-[11px] font-semibold text-[#414752] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setResetPinTargetId(u.id);
                        setResetPinValue('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] text-[11px] font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer"
                    >
                      <Lock className="w-3 h-3 text-[#0056ab]" />
                      <span>Redefinir PIN</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSelf}
                      title={isSelf ? 'Você não pode excluir o usuário em uso' : 'Excluir usuário'}
                      onClick={() => handleDeleteAppUser(u.id, u.nome)}
                      className="p-1.5 rounded-lg border border-[#D9E0EC] text-[#DC2626] hover:bg-[#FEE2E2] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Form Novo Usuário */}
        <form
          onSubmit={(e) => void handleCreateAppUser(e)}
          className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
        >
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-semibold text-[#414752] mb-1">Nome do novo usuário</label>
            <input
              required
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Ex: Maria Balcão"
              className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[10px] font-semibold text-[#414752] mb-1">Nível RBAC</label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#091b36]"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[10px] font-semibold text-[#414752] mb-1">PIN (mín. 4 dígitos)</label>
            <input
              type="password"
              inputMode="numeric"
              required
              value={newUserPin}
              onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={userActionBusy}
              className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] disabled:opacity-50 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar</span>
            </button>
          </div>
        </form>

        <p className="text-[11px] text-[#727784]">
          Regra v17: <strong>Atendente</strong> visualiza apenas o preço final ao cliente no Simulador e não acessa custos internos, lucro, Envelopes Inter, Fluxo de Caixa ou Configurações.
        </p>

        {/* Equipe de Bancada & Balcão (Técnicos & Vendedores) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-[#D9E0EC]">
          {/* Técnicos */}
          <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#091b36]">
                <Wrench className="w-3.5 h-3.5 text-[#0056ab]" />
                <span>Técnicos de Bancada ({state.tecnicos.length})</span>
              </span>
              <span className="text-[10px] text-[#727784]">Selecionáveis na OS / Check-in</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.tecnicos.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-1 text-xs font-semibold text-[#091b36]"
                >
                  <span>
                    {t.nome}
                    {t.tel ? ` · ${t.tel}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTechnician(t.id)}
                    title="Remover técnico"
                    className="text-[#727784] hover:text-[#DC2626] cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
              {state.tecnicos.length === 0 && (
                <span className="text-[11px] text-[#727784]">Nenhum técnico extra cadastrado (usa usuário logado).</span>
              )}
            </div>
            <form onSubmit={handleAddTechnician} className="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
              <input
                value={newTechName}
                onChange={(e) => setNewTechName(e.target.value)}
                placeholder="Nome do técnico"
                className="sm:col-span-5 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                value={newTechTel}
                onChange={(e) => setNewTechTel(e.target.value)}
                placeholder="WhatsApp (opcional)"
                className="sm:col-span-4 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                className="sm:col-span-3 rounded-lg bg-[#0056ab] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                Adicionar
              </button>
            </form>
          </div>

          {/* Vendedores */}
          <div className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#091b36]">
                <Banknote className="w-3.5 h-3.5 text-[#16A34A]" />
                <span>Vendedores / Balcão ({state.vendedores.length})</span>
              </span>
              <span className="text-[10px] text-[#727784]">Selecionáveis no PDV</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.vendedores.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-1 text-xs font-semibold text-[#091b36]"
                >
                  <span>
                    {v.nome}
                    {v.tel ? ` · ${v.tel}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteSeller(v.id)}
                    title="Remover vendedor"
                    className="text-[#727784] hover:text-[#DC2626] cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
              {state.vendedores.length === 0 && (
                <span className="text-[11px] text-[#727784]">Nenhum vendedor extra cadastrado (usa usuário logado).</span>
              )}
            </div>
            <form onSubmit={handleAddSeller} className="grid grid-cols-1 sm:grid-cols-12 gap-1.5">
              <input
                value={newSellerName}
                onChange={(e) => setNewSellerName(e.target.value)}
                placeholder="Nome do vendedor"
                className="sm:col-span-5 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
              <input
                value={newSellerTel}
                onChange={(e) => setNewSellerTel(e.target.value)}
                placeholder="WhatsApp (opcional)"
                className="sm:col-span-4 rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                className="sm:col-span-3 rounded-lg bg-[#0056ab] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                Adicionar
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Catálogo de Serviços (`servicos`) CRUD Card */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-[#0056ab]" />
            <div>
              <h2 className="text-sm font-bold text-[#091b36]">
                Catálogo de Serviços ({state.servicos.length})
              </h2>
              <p className="text-[11px] text-[#727784]">
                Presets utilizados automaticamente no Check-in, Nova OS e Simulador de Orçamento
              </p>
            </div>
          </div>
          {editingServiceId && (
            <button
              type="button"
              onClick={resetServiceForm}
              className="rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] px-2.5 py-1 text-[11px] font-semibold text-[#414752] cursor-pointer self-start"
            >
              Cancelar Edição
            </button>
          )}
        </div>

        {svcFeedback && (
          <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-3.5 py-2 text-xs text-[#16A34A] font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{svcFeedback}</span>
          </div>
        )}

        <form onSubmit={handleSaveService} className="rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-5">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Nome do serviço *
              </label>
              <input
                required
                value={svcNome}
                onChange={(e) => setSvcNome(e.target.value)}
                placeholder="Ex: Troca de conector de carga"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Categoria
              </label>
              <input
                value={svcCat}
                onChange={(e) => setSvcCat(e.target.value)}
                placeholder="Ex: Placa / Microssolda"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Peça padrão (opcional)
              </label>
              <input
                value={svcPeca}
                onChange={(e) => setSvcPeca(e.target.value)}
                placeholder="Ex: Tela / Conector"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Horas (h)
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={svcTempo}
                onChange={(e) => setSvcTempo(e.target.value)}
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Insumo (R$)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={svcCons}
                onChange={(e) => setSvcCons(e.target.value)}
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Garantia (dias)
              </label>
              <input
                value={svcGar}
                onChange={(e) => setSvcGar(e.target.value)}
                placeholder="90"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold text-[#414752] mb-1">
                Ref. mercado (R$)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={svcMercado}
                onChange={(e) => setSvcMercado(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[#D9E0EC] bg-white px-2.5 py-1.5 text-xs tabular-nums"
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <button
                type="submit"
                className="w-full rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
              >
                {editingServiceId ? 'Salvar Alteração' : 'Adicionar Serviço'}
              </button>
            </div>
          </div>
        </form>

        <div className="divide-y divide-[#D9E0EC] rounded-xl border border-[#D9E0EC]">
          {state.servicos.map((svc) => (
            <div key={svc.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-[#091b36]">{svc.nome}</strong>
                  <span className="px-2 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-semibold">
                    {svc.cat}
                  </span>
                </div>
                <p className="text-[11px] text-[#727784] tabular-nums mt-0.5">
                  {svc.tempo}h bancada · Insumo {formatBRL(svc.cons)}
                  {svc.gar ? ` · Garantia ${svc.gar}d` : ''}
                  {svc.mercado > 0 ? ` · Mercado ${formatBRL(svc.mercado)}` : ''}
                  {svc.peca ? ` · Peça: ${svc.peca}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {confirmDeleteSvcId === svc.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        deleteServiceCatalog(svc.id);
                        setConfirmDeleteSvcId(null);
                        if (editingServiceId === svc.id) resetServiceForm();
                        setSvcFeedback(`Serviço "${svc.nome}" removido.`);
                        window.setTimeout(() => setSvcFeedback(''), 3500);
                      }}
                      className="rounded-lg bg-[#DC2626] px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSvcId(null)}
                      className="rounded-lg border border-[#D9E0EC] bg-white px-2 py-1 text-[11px] text-[#414752] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleEditService(svc)}
                      title="Editar serviço"
                      className="p-1.5 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] text-[#414752] hover:bg-[#EAF2FD] hover:text-[#0056ab] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSvcId(svc.id)}
                      title="Excluir serviço"
                      className="p-1.5 rounded-lg border border-[#FEE2E2] bg-[#FEE2E2]/40 text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {state.servicos.length === 0 && (
            <div className="p-4 text-center text-xs text-[#727784]">
              Nenhum serviço cadastrado no catálogo.
            </div>
          )}
        </div>
      </div>

      {/* IA de Bancada · Google Gemini (BYOK — Exclusivo Administrador, Local Only) */}
      {currentUser?.nivel === 'Administrador' && (
        <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EAF2FD] border border-[#0056ab]/25 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[#0056ab]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#091b36]">IA de Bancada · Google Gemini (BYOK)</h2>
                <p className="text-[11px] text-[#727784]">
                  Habilita OCR de etiquetas/IMEI, Copiloto Técnico de Bancada e Tradutor de Orçamento para WhatsApp
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                !isOnline
                  ? 'bg-[#FFF7E6] text-[#D97706]'
                  : geminiHasSavedKey
                  ? 'bg-[#DCFCE7] text-[#16A34A]'
                  : 'bg-[#F3F6FB] text-[#727784]'
              }`}
            >
              {!isOnline
                ? 'Offline (IA pausada)'
                : geminiHasSavedKey
                ? 'Chave BYOK ativa neste aparelho'
                : 'Não configurada'}
            </span>
          </div>

          <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/30 px-3.5 py-2.5 text-[11px] text-[#92400E] flex items-start gap-2">
            <Lock className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <span>
              <strong>Isolamento Total de Segurança:</strong> Sua chave BYOK fica salva{' '}
              <strong>apenas neste navegador</strong> (<code className="font-mono">{GEMINI_BYOK_STORAGE_KEY}</code>).
              Ela <strong>nunca</strong> é enviada ao Firebase Firestore, nunca entra no backup JSON e não é visível para outros perfis.
            </span>
          </div>

          {geminiError && (
            <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2.5 text-xs text-[#DC2626] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{geminiError}</span>
            </div>
          )}

          {geminiFeedback && (
            <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-3.5 py-2.5 text-xs text-[#16A34A] font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{geminiFeedback}</span>
            </div>
          )}

          <form
            onSubmit={handleSaveGeminiKey}
            className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-3"
          >
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                Chave API Google Gemini (Google AI Studio)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex-1 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-mono text-[#091b36] focus:border-[#0056ab] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#414752] hover:bg-[#EAF2FD] cursor-pointer shrink-0"
                >
                  {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showGeminiKey ? 'Ocultar' : 'Mostrar'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[#727784]">
                Modelo padrão: <code className="font-mono">{GEMINI_MODEL_ID}</code> · Somente dados técnicos anonimizados (LGPD).
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {geminiHasSavedKey && (
                  <button
                    type="button"
                    onClick={handleRemoveGeminiKey}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#DC2626]/30 bg-white px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover Chave</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={geminiTesting || !isOnline}
                  onClick={() => void handleTestGeminiKey()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#0056ab]/35 bg-white px-3.5 py-2 text-xs font-semibold text-[#0056ab] hover:bg-[#EAF2FD] disabled:opacity-50 cursor-pointer"
                >
                  {geminiTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{geminiTesting ? 'Testando...' : 'Testar Chave'}</span>
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0056ab] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
                >
                  Salvar Chave
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Firebase Auth + Firestore Cloud Sync Card */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {syncStatus.loggedIn ? (
              <Cloud className="w-5 h-5 text-[#0056ab]" />
            ) : (
              <CloudOff className="w-5 h-5 text-[#727784]" />
            )}
            <div>
              <h2 className="text-sm font-bold text-[#091b36]">Sincronização em Nuvem (Firebase Auth + Firestore)</h2>
              <p className="text-[11px] text-[#727784]">
                Coleção <code className="font-mono">usuarios/{'{uid}'}/reg/{'{docId}'}</code> com isolamento estrito por conta
              </p>
            </div>
          </div>
          {renderSyncBadge()}
        </div>

        {(syncStatus.error || syncStatus.warning || authError || configError) && (
          <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2.5 text-xs text-[#DC2626] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError || configError || syncStatus.error || syncStatus.warning}</span>
          </div>
        )}

        {(authFeedback || configFeedback) && (
          <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-3.5 py-2.5 text-xs text-[#16A34A] font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{authFeedback || configFeedback}</span>
          </div>
        )}

        {/* Step 1: Firebase Project Config */}
        <form onSubmit={handleSaveFirebaseConfig} className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#0056ab]" />
              <span>1. Credenciais do Projeto Firebase (armazenadas localmente)</span>
            </h3>
            {syncStatus.configured && !confirmClearConfig && (
              <button
                type="button"
                onClick={() => setConfirmClearConfig(true)}
                className="text-[11px] font-semibold text-[#DC2626] hover:underline cursor-pointer"
              >
                Limpar Configuração
              </button>
            )}
            {confirmClearConfig && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearFirebaseConfig}
                  className="px-2 py-1 rounded bg-[#DC2626] text-white text-[10px] font-bold cursor-pointer"
                >
                  Confirmar Limpeza
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearConfig(false)}
                  className="px-2 py-1 rounded border border-[#D9E0EC] bg-white text-[10px] font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Colar trecho <code className="font-mono">firebaseConfig</code> (opcional — extrai apiKey e projectId)
            </label>
            <textarea
              rows={2}
              value={configSnippet}
              onChange={(e) => setConfigSnippet(e.target.value)}
              placeholder='const firebaseConfig = { apiKey: "...", projectId: "..." };'
              className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">API Key</label>
              <input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Project ID</label>
              <input
                value={projectIdInput}
                onChange={(e) => setProjectIdInput(e.target.value)}
                placeholder="seu-projeto-microlab"
                className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-[#0056ab] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
            >
              Salvar Configuração Firebase
            </button>
          </div>
        </form>

        {/* Step 2: Email/Password Authentication */}
        {!syncStatus.loggedIn ? (
          <form onSubmit={handleSignIn} className="rounded-xl bg-[#F3F6FB] p-4 border border-[#D9E0EC] space-y-3">
            <h3 className="text-xs font-bold text-[#091b36]">2. Entrar com E-mail e Senha (Firebase Auth)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="tecnico@microlab.com"
                className="rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
              />
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Senha Firebase Auth"
                className="rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#727784]">
                Senhas de aparelhos (PIN/Padrão 3×3) nunca são enviadas ao Firestore (LGPD).
              </span>
              <button
                type="submit"
                disabled={authBusy || !syncStatus.configured}
                className="rounded-xl bg-[#091b36] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102d57] disabled:opacity-45 cursor-pointer whitespace-nowrap"
              >
                {authBusy ? 'Autenticando...' : 'Entrar na Nuvem'}
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-xl bg-[#EAF2FD]/65 p-4 border border-[#0056ab]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-bold text-[#091b36]">Conta conectada: {syncStatus.email}</p>
              <p className="text-[11px] text-[#414752] font-mono">UID ativo: {syncStatus.uid}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncStatus.busy}
                onClick={() => void syncNow()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.busy ? 'animate-spin' : ''}`} />
                <span>Sincronizar Agora</span>
              </button>
              <button
                type="button"
                onClick={signOutCloud}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Backup JSON LGPD-Safe */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#091b36]">Backup JSON Portátil (Conformidade LGPD)</h2>
            <p className="text-xs text-[#727784]">
              Exportação sanitizada: senhas numéricas e padrões gráficos 3×3 nunca são incluídos no arquivo JSON.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Backup JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-white px-3.5 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#0056ab]" />
              <span>Restaurar JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
          </div>
        </div>

        {backupFeedback && (
          <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-3.5 py-2 text-xs font-semibold text-[#16A34A]">
            {backupFeedback}
          </div>
        )}
        {backupError && (
          <div className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/30 px-3.5 py-2 text-xs font-semibold text-[#DC2626]">
            {backupError}
          </div>
        )}
      </div>

      {/* Factory Reset with Double Confirmation */}
      <div className="rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#091b36]">Zerar banco local (Reset de fábrica)</h2>
            <p className="text-xs text-[#727784]">
              Apaga todas as ordens de serviço, clientes, estoque, fornecedores, garantias e caixa deste dispositivo, mantendo apenas os parâmetros oficiais da MicroLab.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void syncNow()}
              className="rounded-xl border border-[#D9E0EC] px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#F3F6FB] cursor-pointer"
            >
              Salvar Agora
            </button>
            {resetStep === 0 && (
              <button
                type="button"
                onClick={() => {
                  setResetAckChecked(false);
                  setResetStep(1);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#FEE2E2] px-3.5 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#fecaca] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Zerar banco local (Reset de fábrica)</span>
              </button>
            )}
          </div>
        </div>

        {resetStep > 0 && (
          <div className="rounded-xl bg-[#FEE2E2]/55 border border-[#DC2626]/35 p-4 space-y-3">
            <div className="flex items-start gap-2 text-xs text-[#991B1B]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
              <span>
                <strong>Atenção (Etapa {resetStep}/2):</strong> Esta ação é irreversível no armazenamento local atual (recomendamos baixar um Backup JSON antes).
              </span>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#091b36] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={resetAckChecked}
                onChange={(e) => setResetAckChecked(e.target.checked)}
                className="rounded border-[#DC2626]"
              />
              <span>Confirmo que desejo apagar permanentemente todos os registros locais deste banco.</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              {resetStep === 1 ? (
                <button
                  type="button"
                  disabled={!resetAckChecked}
                  onClick={() => setResetStep(2)}
                  className="rounded-xl bg-[#D97706] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-45 cursor-pointer"
                >
                  1ª Confirmação: Avançar para confirmação final
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!resetAckChecked}
                  onClick={handleFactoryReset}
                  className="rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-45 cursor-pointer"
                >
                  2ª Confirmação: Confirmar Reset de Fábrica
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setResetStep(0);
                  setResetAckChecked(false);
                }}
                className="rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {resetDone && (
        <div className="rounded-xl bg-[#DCFCE7] border border-[#16A34A]/30 px-4 py-2.5 text-xs font-semibold text-[#16A34A] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Banco local zerado com sucesso (parâmetros oficiais preservados).</span>
        </div>
      )}

      {/* Account Switch Confirmation Modal (Strict UID Isolation) */}
      {pendingAccountSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/65 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#D9E0EC] space-y-4">
            <div className="flex items-center gap-2.5 text-[#D97706]">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-[#091b36]">Confirmar Troca de Conta Isolada</h3>
            </div>
            <p className="text-xs text-[#414752] leading-relaxed">
              Você está autenticando como <strong>{pendingAccountSwitch.nextAuth.email}</strong> (UID{' '}
              <code className="font-mono">{pendingAccountSwitch.nextAuth.uid}</code>).
            </p>
            <div className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/35 p-3 text-xs text-[#92400E] space-y-1">
              <p>
                <strong>Origem anterior:</strong> {pendingAccountSwitch.previousEmail}{' '}
                {pendingAccountSwitch.previousPendingCount > 0 &&
                  `(${pendingAccountSwitch.previousPendingCount} alterações locais)`}
              </p>
              <p>
                Por segurança, cada conta possui um banco isolado (<code className="font-mono">microlab_os_db_&lt;uid&gt;</code>).
                Os registros da sessão anterior <strong>não serão mesclados nem enviados</strong> para a nova conta.
              </p>
              <p>
                Estado da nova conta neste aparelho:{' '}
                <strong>
                  {pendingAccountSwitch.nextHasLocalCache
                    ? 'Cache local existente será carregado + sincronizado'
                    : 'Sem cache local — dados serão baixados da nuvem'}
                </strong>
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => confirmAccountSwitch(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmAccountSwitch(true)}
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-bold text-white cursor-pointer"
              >
                Confirmar Troca de Conta
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="pt-2 pb-4 text-center text-[11px] text-[#727784] border-t border-[#D9E0EC]/70">
        <span>MicroLab OS</span>
        <span aria-hidden="true"> · </span>
        <span className="font-mono font-semibold text-[#414752]">{APP_VERSION_TAG}</span>
        <span aria-hidden="true"> · </span>
        <span>PWA Offline-First</span>
      </footer>
    </div>
  );
};
