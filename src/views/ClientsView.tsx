import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Smartphone,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Client } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  diasAteIso,
  formatDateBR,
  getOrderWarrantyBadge,
  resolveOrderWarrantyUntil,
} from '../utils/pricing';

export const ClientsView: React.FC<{
  onSelectOrder: (orderId: number) => void;
  onOpenReturnWarrantyOs?: () => void;
}> = ({ onSelectOrder, onOpenReturnWarrantyOs }) => {
  const { state, addClient, addClientNote, setOsPrefillDraft } = useLabStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'Todos' | 'Com OS Aberta' | 'VIP / Lojistas'>('Todos');
  const [selectedId, setSelectedId] = useState<string>(state.clients[0]?.id || '');
  const [newNote, setNewNote] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add client form
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCpf, setCCpf] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cNeighborhood, setCNeighborhood] = useState('');
  const [cTag, setCTag] = useState<'VIP' | 'Lojista' | 'Recorrente' | ''>('Recorrente');

  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = state.clients.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.neighborhood.toLowerCase().includes(q) ||
      c.lastDevice.toLowerCase().includes(q);
    if (!matchesQ) return false;
    if (filter === 'VIP / Lojistas') return c.tag === 'VIP' || c.tag === 'Lojista';
    if (filter === 'Com OS Aberta') {
      return state.orders.some(
        (o) =>
          (o.clientId === c.id || o.clientName.toLowerCase() === c.name.toLowerCase()) &&
          o.status !== 'Entregue'
      );
    }
    return true;
  });

  const activeClient: Client | undefined =
    state.clients.find((c) => c.id === selectedId) || filtered[0];

  const clientOrders = activeClient
    ? state.orders.filter(
        (o) =>
          o.clientId === activeClient.id ||
          o.clientName.toLowerCase() === activeClient.name.toLowerCase()
      )
    : [];

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !newNote.trim()) return;
    addClientNote(activeClient.id, newNote);
    setNewNote('');
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    const created = addClient({
      name: cName.trim(),
      phone: cPhone.trim() || 'Não informado',
      cpf: cCpf.trim() || '000.***.***-00',
      email: cEmail.trim() || '',
      neighborhood: cNeighborhood.trim() || 'Salvador - BA',
      tag: cTag ? cTag : undefined,
      lastDevice: 'Cadastro Inicial',
    });
    setSelectedId(created.id);
    setShowAddModal(false);
    setCName('');
    setCPhone('');
    setCCpf('');
    setCEmail('');
    setCNeighborhood('');
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Clientes &amp; CRM Técnico</h1>
          <p className="text-xs text-[#727784]">
            Histórico de aparelhos, LTV, notas de restrição de dados e contato rápido
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap self-start"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Cliente</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC] flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nome, telefone, bairro ou aparelho... (atalho /)"
            className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#F3F6FB] p-1 rounded-xl border border-[#D9E0EC]">
          {(['Todos', 'Com OS Aberta', 'VIP / Lojistas'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                filter === tab ? 'bg-white text-[#0056ab] shadow-xs' : 'text-[#414752]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-2.5">
          {filtered.map((client) => {
            const active = activeClient?.id === client.id;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => setSelectedId(client.id)}
                className={`w-full text-left rounded-2xl p-4 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#EAF2FD]/70 border-[#0056ab]'
                    : 'bg-white border-[#D9E0EC] hover:border-[#0056ab]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#0056ab] text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {getInitials(client.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#091b36] truncate">{client.name}</p>
                        {client.tag && (
                          <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-bold shrink-0">
                            {client.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#727784] truncate">
                        {client.phone} · {client.neighborhood}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-[#091b36] tabular-nums">{formatBRL(client.ltv)}</p>
                    <p className="text-[10px] text-[#727784] tabular-nums">{client.ordersCount} OS</p>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 border border-[#D9E0EC] text-center text-xs text-[#727784]">
              Nenhum cliente encontrado.
            </div>
          )}
        </div>

        {/* Right Detail Dossier */}
        <div className="lg:col-span-7 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-5">
          {activeClient ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D9E0EC]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#091b36] text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {getInitials(activeClient.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[#091b36]">{activeClient.name}</h2>
                      {activeClient.tag && (
                        <span className="px-2 py-0.5 rounded-md bg-[#EAF2FD] text-[#0056ab] text-[10px] font-bold">
                          {activeClient.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#727784]">
                      {activeClient.phone} · {activeClient.email} · CPF {activeClient.cpf}
                    </p>
                  </div>
                </div>
                <a
                  href={`https://wa.me/55${activeClient.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#DCFCE7] text-[#16A34A] px-3.5 py-2 text-xs font-bold hover:bg-[#bbf7d0] whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Abrir WhatsApp</span>
                </a>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                  <span className="text-[11px] text-[#727784] block">LTV Acumulado</span>
                  <span className="text-base font-bold text-[#091b36] tabular-nums">
                    {formatBRL(activeClient.ltv)}
                  </span>
                </div>
                <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                  <span className="text-[11px] text-[#727784] block">Ticket Médio</span>
                  <span className="text-base font-bold text-[#091b36] tabular-nums">
                    {formatBRL(activeClient.ordersCount ? activeClient.ltv / activeClient.ordersCount : 0)}
                  </span>
                </div>
                <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                  <span className="text-[11px] text-[#727784] block">Última Visita</span>
                  <span className="text-sm font-bold text-[#091b36]">{activeClient.lastVisit}</span>
                </div>
              </div>

              {/* Restriction Notes */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#D97706]" />
                  <span>Observações Técnicas &amp; Restrições</span>
                </h3>
                {activeClient.restrictions.map((note, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-[#FFF7E6] border border-[#D97706]/25 p-3 text-xs text-[#414752]"
                  >
                    {note}
                  </div>
                ))}
                <form onSubmit={handleAddNote} className="flex gap-2">
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Adicionar nova observação ou preferência do cliente..."
                    className="flex-1 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs text-[#091b36]"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-xl bg-[#0056ab] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nota</span>
                  </button>
                </form>
              </div>

              {/* Linked Orders */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#091b36]">Histórico de Ordens Vinculadas</h3>
                {clientOrders.length > 0 ? (
                  <div className="space-y-2">
                    {clientOrders.map((o) => {
                      const badge = getOrderWarrantyBadge(o, state.servicos, state.cfg);
                      const until = resolveOrderWarrantyUntil(o, state.servicos, state.cfg);
                      const daysLeft = until ? diasAteIso(until) : null;
                      return (
                        <div
                          key={o.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/50 text-xs"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <Smartphone className="w-4 h-4 text-[#0056ab] shrink-0 mt-0.5" />
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-[#091b36] truncate">
                                  {o.code} · {o.device}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    badge.tone === 'ok'
                                      ? 'bg-[#DCFCE7] text-[#16A34A]'
                                      : badge.tone === 'warn'
                                      ? 'bg-[#FFF7E6] text-[#D97706]'
                                      : badge.tone === 'blue'
                                      ? 'bg-[#EAF2FD] text-[#0056ab]'
                                      : 'bg-white text-[#727784] border border-[#D9E0EC]'
                                  }`}
                                >
                                  {badge.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#727784] truncate">
                                {o.serviceCatalogName || o.issue}
                                {until ? ` · Garantia até ${formatDateBR(until)}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {o.status === 'Entregue' && daysLeft !== null && daysLeft >= 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOsPrefillDraft({
                                    source: 'warranty',
                                    clientId: activeClient.id,
                                    brand: o.brand || '',
                                    model: o.model || o.device,
                                    device: o.device,
                                    imei: o.imei === 'Não informado' ? '' : o.imei,
                                    issue: `Retorno de garantia da OS ${o.code}`,
                                    notes: `Retorno dentro da garantia (OS ${o.code})`,
                                    serviceCatalogId: o.serviceCatalogId || '',
                                    partCost: 0,
                                    partFreight: 0,
                                    consumables: 0,
                                    estimatedHours: 0.5,
                                    servicePrice: 0,
                                    status: 'Aprovado',
                                    returnWarrantyFromId: o.id,
                                  });
                                  onOpenReturnWarrantyOs?.();
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0056ab] text-[11px] font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Retorno garantia</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectOrder(o.id)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#D9E0EC] text-[11px] font-semibold text-[#0056ab] hover:bg-[#EAF2FD] cursor-pointer"
                            >
                              Ver OS
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#727784]">Último dispositivo registrado: {activeClient.lastDevice}</p>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-[#727784]">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Selecione um cliente para visualizar o dossiê CRM.
            </div>
          )}
        </div>
      </div>

      {/* Add Client Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-4"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleCreateClient}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#D9E0EC] space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">Cadastrar Novo Cliente</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Nome Completo *</label>
              <input
                required
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">WhatsApp</label>
                <input
                  value={cPhone}
                  onChange={(e) => setCPhone(e.target.value)}
                  placeholder="(71) 99999-0000"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Perfil / Tag</label>
                <select
                  value={cTag}
                  onChange={(e) => setCTag(e.target.value as 'VIP' | 'Lojista' | 'Recorrente' | '')}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                >
                  <option value="Recorrente">Recorrente</option>
                  <option value="VIP">VIP</option>
                  <option value="Lojista">Lojista B2B</option>
                  <option value="">Padrão</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">CPF</label>
                <input
                  value={cCpf}
                  onChange={(e) => setCCpf(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Bairro / Cidade</label>
                <input
                  value={cNeighborhood}
                  onChange={(e) => setCNeighborhood(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">E-mail</label>
              <input
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Salvar Cliente
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
