import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PiggyBank,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  TrendingUp,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { RouteId } from '../types/lab';
import { useLabStore } from '../store/useLabStore';
import { OfflineIndicator, PWAInstallButton } from './PWAComponents';

interface AppShellProps {
  currentRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  onOpenPix: (amount?: number, desc?: string) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: RouteId;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const MicroLabLogo: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div className="flex items-center gap-2.5">
    <img
      src="./pwa-192x192.png"
      alt="MicroLab OS"
      className="w-9 h-9 rounded-xl object-cover shadow-sm shrink-0"
    />
    <div className="leading-tight">
      <span className={`block text-sm font-bold tracking-tight ${dark ? 'text-white' : 'text-[#091b36]'}`}>
        MicroLab OS
      </span>
      <span className={`block text-[10px] font-medium ${dark ? 'text-slate-400' : 'text-[#727784]'}`}>
        Bancada &amp; Gestão SMD
      </span>
    </div>
  </div>
);

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  onNavigate,
  onOpenPix,
  children,
}) => {
  const { state, currentUser, canAccessRoute, logoutSession, syncStatus, syncNow } = useLabStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutWarning, setLogoutWarning] = useState('');

  const openOrdersCount = state.orders.filter(
    (o) => o.status !== 'Entregue' && o.status !== 'Cancelado'
  ).length;
  const lowStockCount = state.parts.filter(
    (p) => p.status === 'Esgotado' || p.status === 'Alerta Reposição'
  ).length;
  const activeWarrantyCount = state.warranties.filter((w) => w.status !== 'Concluída').length;

  const isHardwareDark = currentRoute === 'fonte-zk-sk150c' || currentRoute === 'diagnostico';

  const allNavGroups: NavGroup[] = [
    {
      title: 'Atendimento',
      items: [
        { id: 'inicio', label: 'Início', icon: LayoutDashboard },
        { id: 'nova-os', label: 'Nova OS', icon: Plus },
        { id: 'ordens-de-servico', label: 'Ordens de Serviço', icon: ClipboardList, badge: openOrdersCount },
        { id: 'clientes', label: 'Clientes', icon: Users },
        { id: 'agenda-de-bancada', label: 'Agenda de Bancada', icon: Calendar },
      ],
    },
    {
      title: 'Vendas e Estoque',
      items: [
        { id: 'pdv-rapido', label: 'PDV Rápido', icon: ShoppingCart },
        { id: 'produtos-e-pecas', label: 'Produtos & Peças', icon: Package, badge: lowStockCount },
        { id: 'fornecedores', label: 'Fornecedores', icon: Truck },
        { id: 'garantias', label: 'Garantias', icon: ShieldCheck, badge: activeWarrantyCount },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { id: 'envelopes-inter', label: 'Envelopes Inter', icon: PiggyBank },
        { id: 'simulador-orcamento', label: 'Simulador Orçamento', icon: Sliders },
        { id: 'fluxo-de-caixa', label: 'Fluxo de Caixa & DRE', icon: TrendingUp },
        { id: 'gerador-pix', label: 'Gerador PIX', icon: QrCode },
      ],
    },
    {
      title: 'Bancada & Telemetria',
      items: [
        { id: 'fonte-zk-sk150c', label: 'Fonte ZK-SK150C', icon: Zap },
        { id: 'diagnostico', label: 'Diagnóstico', icon: Activity },
        { id: 'check-in-check-out', label: 'Check-in / Check-out', icon: ScanLine },
      ],
    },
  ];

  const navGroups = allNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessRoute(item.id)),
    }))
    .filter((group) => group.items.length > 0);

  const handleNavClick = (id: RouteId) => {
    setMobileMenuOpen(false);
    if (!canAccessRoute(id)) return;
    if (id === 'gerador-pix') {
      onOpenPix(0, 'Cobrança Rápida MicroLab');
      return;
    }
    onNavigate(id);
  };

  const handleLogoutClick = () => {
    const res = logoutSession();
    if (!res.ok && res.reason) {
      setLogoutWarning(res.reason);
      window.setTimeout(() => setLogoutWarning(''), 4500);
      return;
    }
    setMobileMenuOpen(false);
  };

  const allMobileTabs: { id: RouteId; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'inicio', label: 'Início', icon: LayoutDashboard },
    { id: 'ordens-de-servico', label: 'Ordens', icon: ClipboardList },
    { id: 'agenda-de-bancada', label: 'Agenda', icon: Calendar },
    { id: 'pdv-rapido', label: 'PDV', icon: ShoppingCart },
    { id: 'produtos-e-pecas', label: 'Estoque', icon: Package },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'fonte-zk-sk150c', label: 'Fonte ZK', icon: Zap },
  ];

  const visibleMobileTabs = allMobileTabs.filter((tab) => canAccessRoute(tab.id)).slice(0, 5);

  const userDisplayName = currentUser?.nome || state.labProfile.technicianName;
  const userDisplayRole = currentUser?.nivel || state.labProfile.role;

  return (
    <div
      className={`min-h-screen flex transition-colors duration-200 ${
        isHardwareDark ? 'bg-[#0B0F17] text-slate-100' : 'bg-[#F3F6FB] text-[#091b36]'
      }`}
    >
      {/* Desktop Fixed Sidebar (240px) */}
      <aside
        className={`hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 z-30 border-r print:hidden ${
          isHardwareDark
            ? 'bg-[#0E1422] border-[#2A3954]'
            : 'bg-white border-[#D9E0EC]'
        }`}
      >
        <div className={`h-16 px-4 flex items-center border-b ${isHardwareDark ? 'border-[#2A3954]' : 'border-[#D9E0EC]'}`}>
          <MicroLabLogo dark={isHardwareDark} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p
                className={`px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider ${
                  isHardwareDark ? 'text-slate-500' : 'text-[#727784]'
                }`}
              >
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = currentRoute === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? isHardwareDark
                            ? 'bg-[#06B6D4]/15 text-[#06B6D4] font-semibold'
                            : 'bg-[#EAF2FD] text-[#0056ab] font-semibold'
                          : isHardwareDark
                          ? 'text-slate-300 hover:bg-[#131B2E] hover:text-white'
                          : 'text-[#414752] hover:bg-[#F3F6FB] hover:text-[#091b36]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${
                            active
                              ? 'bg-[#0056ab] text-white'
                              : isHardwareDark
                              ? 'bg-[#2A3954] text-slate-300'
                              : 'bg-[#F3F6FB] text-[#414752]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={`p-3 border-t space-y-1 ${isHardwareDark ? 'border-[#2A3954]' : 'border-[#D9E0EC]'}`}>
          {canAccessRoute('configuracoes') && (
            <button
              type="button"
              onClick={() => handleNavClick('configuracoes')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                currentRoute === 'configuracoes'
                  ? 'bg-[#EAF2FD] text-[#0056ab] font-semibold'
                  : isHardwareDark
                  ? 'text-slate-300 hover:bg-[#131B2E]'
                  : 'text-[#414752] hover:bg-[#F3F6FB]'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Configurações</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogoutClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              isHardwareDark
                ? 'text-rose-300 hover:bg-[#131B2E]'
                : 'text-[#DC2626] hover:bg-[#FEE2E2]/60'
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sair / Trocar Usuário</span>
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#091b36]/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-2xl z-10 text-[#091b36]">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#D9E0EC]">
              <MicroLabLogo />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-[#727784] hover:bg-[#F3F6FB]"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-2.5 bg-[#F3F6FB] border-b border-[#D9E0EC] text-xs">
              <p className="font-bold text-[#091b36] truncate">{userDisplayName}</p>
              <p className="text-[11px] font-semibold text-[#0056ab]">{userDisplayRole}</p>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {navGroups.map((group) => (
                <div key={group.title}>
                  <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#727784]">
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = currentRoute === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavClick(item.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium ${
                            active
                              ? 'bg-[#EAF2FD] text-[#0056ab] font-semibold'
                              : 'text-[#414752] hover:bg-[#F3F6FB]'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </span>
                          {typeof item.badge === 'number' && item.badge > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#F3F6FB] text-[#414752] tabular-nums">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {canAccessRoute('configuracoes') && (
                <div>
                  <button
                    type="button"
                    onClick={() => handleNavClick('configuracoes')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[#414752] hover:bg-[#F3F6FB]"
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                    <span>Configurações &amp; PWA</span>
                  </button>
                </div>
              )}
            </nav>
            <div className="p-3 border-t border-[#D9E0EC]">
              <button
                type="button"
                onClick={handleLogoutClick}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2]"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sair / Trocar Usuário</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-60 print:pl-0 flex flex-col min-w-0">
        {/* Compact Top Header */}
        <header
          className={`sticky top-0 z-20 h-14 lg:h-16 px-4 lg:px-6 flex items-center justify-between border-b backdrop-blur-md print:hidden ${
            isHardwareDark
              ? 'bg-[#0E1422]/90 border-[#2A3954]'
              : 'bg-white/90 border-[#D9E0EC]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`lg:hidden p-2 rounded-lg cursor-pointer ${
                isHardwareDark ? 'text-slate-200 hover:bg-[#131B2E]' : 'text-[#091b36] hover:bg-[#F3F6FB]'
              }`}
              aria-label="Abrir navegação"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden">
              <MicroLabLogo dark={isHardwareDark} />
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs min-w-0">
              <span className={`font-semibold truncate ${isHardwareDark ? 'text-white' : 'text-[#091b36]'}`}>
                {userDisplayName}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                  isHardwareDark
                    ? 'bg-[#06B6D4]/20 text-[#06B6D4]'
                    : 'bg-[#EAF2FD] text-[#0056ab]'
                }`}
              >
                {userDisplayRole}
              </span>
              <span className={isHardwareDark ? 'text-slate-500' : 'text-[#727784]'}>·</span>
              <span
                className={`inline-flex items-center gap-1 font-medium truncate ${
                  syncStatus.error
                    ? 'text-[#DC2626]'
                    : syncStatus.loggedIn
                    ? 'text-[#16A34A]'
                    : isHardwareDark
                    ? 'text-slate-300'
                    : 'text-[#414752]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {syncStatus.busy
                  ? 'Sincronizando nuvem…'
                  : syncStatus.loggedIn
                  ? `${state.labProfile.lastSync}${syncStatus.pendingCount > 0 ? ` (${syncStatus.pendingCount} pend.)` : ''}`
                  : state.labProfile.lastSync}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <PWAInstallButton variant="header" />

            <button
              type="button"
              disabled={syncStatus.busy}
              onClick={() => void syncNow()}
              title={syncStatus.loggedIn ? 'Sincronizar com Firestore' : 'Salvar estado local'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                isHardwareDark
                  ? 'border-[#2A3954] bg-[#131B2E] text-slate-200 hover:bg-[#1a243b]'
                  : 'border-[#D9E0EC] bg-white text-[#414752] hover:bg-[#F3F6FB]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.busy ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {syncStatus.busy ? 'Sincronizando…' : syncStatus.loggedIn ? 'Sincronizar Nuvem' : 'Sincronizar'}
              </span>
            </button>

            {canAccessRoute('nova-os') && (
              <button
                type="button"
                onClick={() => handleNavClick('nova-os')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#0056ab] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1b6fd1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova OS</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogoutClick}
              title="Sair / Trocar Usuário"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isHardwareDark
                  ? 'border-[#2A3954] bg-[#131B2E] text-rose-300 hover:bg-[#23192d]'
                  : 'border-[#D9E0EC] bg-white text-[#DC2626] hover:bg-[#FEE2E2]/60'
              }`}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sair / Trocar</span>
            </button>
          </div>
        </header>

        {logoutWarning && (
          <div className="mx-4 lg:mx-6 mt-3 rounded-xl bg-[#FFF7E6] border border-[#D97706]/40 px-4 py-2.5 text-xs font-semibold text-[#92400E] flex items-center gap-2 print:hidden">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>{logoutWarning}</span>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t grid print:hidden ${
          isHardwareDark
            ? 'bg-[#0E1422]/95 border-[#2A3954]'
            : 'bg-white/95 border-[#D9E0EC]'
        } backdrop-blur-md`}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, visibleMobileTabs.length)}, minmax(0, 1fr))`,
        }}
        aria-label="Navegação rápida"
      >
        {visibleMobileTabs.map((tab) => {
          const Icon = tab.icon;
          const active = currentRoute === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNavClick(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer ${
                active
                  ? isHardwareDark
                    ? 'text-[#06B6D4]'
                    : 'text-[#0056ab] font-semibold'
                  : isHardwareDark
                  ? 'text-slate-400'
                  : 'text-[#727784]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full px-1">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
};
