import React, { useEffect, useState } from 'react';
import { RouteId } from './types/lab';
import { LabProvider, useLabStore } from './store/useLabStore';
import { AppShell } from './components/AppShell';
import { LoginView } from './components/LoginView';
import { PixModal } from './components/PixModal';
import { DashboardView } from './views/DashboardView';
import { OrdersView } from './views/OrdersView';
import { CheckInOutView } from './views/CheckInOutView';
import { ClientsView } from './views/ClientsView';
import { ScheduleView } from './views/ScheduleView';
import { PosView } from './views/PosView';
import { InventoryView } from './views/InventoryView';
import { SuppliersView } from './views/SuppliersView';
import { WarrantiesView } from './views/WarrantiesView';
import { FinanceInterSimView } from './views/FinanceInterSimView';
import { CashFlowDreView } from './views/CashFlowDreView';
import { BenchPowerView } from './views/BenchPowerView';
import { DefectsAssistantView } from './views/DefectsAssistantView';
import { BenchReferenceView } from './views/BenchReferenceView';
import { SettingsView } from './views/SettingsView';
import { PublicAcceptanceView } from './views/PublicAcceptanceView';
import { parsePublicAcceptanceParamsFromLocation } from './services/publicAcceptance';

function LabAppRouter() {
  const { currentUser, canAccessRoute } = useLabStore();
  const [route, setRoute] = useState<RouteId>('inicio');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [pixState, setPixState] = useState<{
    isOpen: boolean;
    amount: number;
    description: string;
  }>({
    isOpen: false,
    amount: 0,
    description: 'Serviço de Bancada MicroLab',
  });

  useEffect(() => {
    if (currentUser && !canAccessRoute(route)) {
      setRoute('inicio');
    }
  }, [currentUser, route, canAccessRoute]);

  useEffect(() => {
    if (!currentUser) {
      setPixState((p) => (p.isOpen ? { ...p, isOpen: false } : p));
    }
  }, [currentUser]);

  if (!currentUser) {
    return <LoginView />;
  }

  const handleNavigate = (nextRoute: RouteId) => {
    if (!canAccessRoute(nextRoute)) {
      setRoute('inicio');
      return;
    }
    setRoute(nextRoute);
  };

  const handleOpenPix = (amount = 0, description = 'Cobrança Bancada MicroLab') => {
    if (!canAccessRoute('gerador-pix')) return;
    setPixState({ isOpen: true, amount, description });
  };

  const handleSelectOrderAndNavigate = (orderId: number) => {
    if (!canAccessRoute('ordens-de-servico')) return;
    setSelectedOrderId(orderId);
    setRoute('ordens-de-servico');
  };

  const renderView = () => {
    if (!canAccessRoute(route)) {
      return (
        <DashboardView
          onNavigate={handleNavigate}
          onSelectOrder={handleSelectOrderAndNavigate}
          onOpenPix={handleOpenPix}
        />
      );
    }

    switch (route) {
      case 'inicio':
        return (
          <DashboardView
            onNavigate={handleNavigate}
            onSelectOrder={handleSelectOrderAndNavigate}
            onOpenPix={handleOpenPix}
          />
        );
      case 'nova-os':
        return (
          <CheckInOutView
            key="nova-os"
            defaultTab="checkin"
            onNavigate={handleNavigate}
            onSelectOrder={setSelectedOrderId}
          />
        );
      case 'check-in-check-out':
        return (
          <CheckInOutView
            key="check-in-check-out"
            defaultTab="checkin"
            onNavigate={handleNavigate}
            onSelectOrder={setSelectedOrderId}
          />
        );
      case 'ordens-de-servico':
        return (
          <OrdersView
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            onOpenPix={handleOpenPix}
            onGoToCheckIn={() => handleNavigate('check-in-check-out')}
          />
        );
      case 'clientes':
        return (
          <ClientsView
            onSelectOrder={handleSelectOrderAndNavigate}
            onOpenReturnWarrantyOs={() => handleNavigate('ordens-de-servico')}
          />
        );
      case 'agenda-de-bancada':
        return <ScheduleView onSelectOrder={handleSelectOrderAndNavigate} />;
      case 'pdv-rapido':
        return <PosView />;
      case 'produtos-e-pecas':
        return <InventoryView onGoSuppliers={() => handleNavigate('fornecedores')} />;
      case 'fornecedores':
        return <SuppliersView />;
      case 'garantias':
        return (
          <WarrantiesView
            onOpenReturnWarrantyOs={() => handleNavigate('ordens-de-servico')}
            onSelectOrder={handleSelectOrderAndNavigate}
          />
        );
      case 'envelopes-inter':
        return <CashFlowDreView />;
      case 'simulador-orcamento':
        return (
          <FinanceInterSimView
            onOpenPix={handleOpenPix}
            onConvertToOs={() => handleNavigate('ordens-de-servico')}
          />
        );
      case 'fluxo-de-caixa':
        return <CashFlowDreView />;
      case 'fonte':
        return <BenchPowerView />;
      case 'defeitos':
        return <DefectsAssistantView />;
      case 'bancada':
        return <BenchReferenceView onNavigate={handleNavigate} />;
      case 'configuracoes':
        return <SettingsView />;
      default:
        return (
          <DashboardView
            onNavigate={handleNavigate}
            onSelectOrder={handleSelectOrderAndNavigate}
            onOpenPix={handleOpenPix}
          />
        );
    }
  };

  return (
    <AppShell currentRoute={route} onNavigate={handleNavigate} onOpenPix={handleOpenPix}>
      {renderView()}
      <PixModal
        isOpen={pixState.isOpen}
        onClose={() => setPixState((p) => ({ ...p, isOpen: false }))}
        initialAmount={pixState.amount}
        initialDescription={pixState.description}
      />
    </AppShell>
  );
}

export default function App() {
  const [publicRoute, setPublicRoute] = useState<{ token: string; projectId: string } | null>(
    () => parsePublicAcceptanceParamsFromLocation()
  );

  useEffect(() => {
    const syncPublicRoute = () => {
      setPublicRoute(parsePublicAcceptanceParamsFromLocation());
    };
    window.addEventListener('hashchange', syncPublicRoute);
    window.addEventListener('popstate', syncPublicRoute);
    return () => {
      window.removeEventListener('hashchange', syncPublicRoute);
      window.removeEventListener('popstate', syncPublicRoute);
    };
  }, []);

  if (publicRoute) {
    return (
      <PublicAcceptanceView
        token={publicRoute.token}
        projectId={publicRoute.projectId}
      />
    );
  }

  return (
    <LabProvider>
      <LabAppRouter />
    </LabProvider>
  );
}
