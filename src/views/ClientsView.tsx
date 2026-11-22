import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cake,
  Camera,
  Clock,
  Edit3,
  Instagram,
  MapPin,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Client } from '../types/lab';
import { formatBRL, useLabStore } from '../store/useLabStore';
import {
  calcClientMetrics,
  calcSaleTotalAmount,
  ClientComputedMetrics,
  diasAteIso,
  formatDateBR,
  getOrderWarrantyBadge,
  resolveOrderWarrantyUntil,
} from '../utils/pricing';

type ClientFilterTab =
  | 'Todos'
  | 'Com OS Aberta'
  | 'VIP / Lojistas'
  | 'Aniversariantes'
  | 'Inativos (+90d)';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const ORIGEM_OPTIONS = [
  'Indicação',
  'Instagram',
  'Google / Maps',
  'WhatsApp',
  'Balcão / Fachada',
  'Cliente Antigo',
  'Outro',
] as const;

function toWaPhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits || digits.length < 8) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

async function resizeClientPhoto160Jpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponível neste navegador.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const ClientsView: React.FC<{
  onSelectOrder: (orderId: number) => void;
  onOpenReturnWarrantyOs?: () => void;
}> = ({ onSelectOrder, onOpenReturnWarrantyOs }) => {
  const { state, addClient, updateClient, deleteClient, addClientNote, setOsPrefillDraft } =
    useLabStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilterTab>('Todos');
  const [birthMonth, setBirthMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedId, setSelectedId] = useState<string>(state.clients[0]?.id || '');
  const [newNote, setNewNote] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null);
  const [deleteClientError, setDeleteClientError] = useState('');

  // Add / Edit client form fields
  const [cFoto, setCFoto] = useState('');
  const [cPhotoError, setCPhotoError] = useState('');
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCpf, setCCpf] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cNasc, setCNasc] = useState('');
  const [cIg, setCIg] = useState('');
  const [cOrigem, setCOrigem] = useState('');
  const [cCep, setCCep] = useState('');
  const [cRua, setCRua] = useState('');
  const [cNum, setCNum] = useState('');
  const [cNeighborhood, setCNeighborhood] = useState('');
  const [cRef, setCRef] = useState('');
  const [cObs, setCObs] = useState('');
  const [cTag, setCTag] = useState<'VIP' | 'Lojista' | 'Recorrente' | ''>('Recorrente');

  const searchRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const metricsMap = useMemo(() => {
    const map: Record<string, ClientComputedMetrics> = {};
    state.clients.forEach((c) => {
      map[c.id] = calcClientMetrics(c, state.orders, state.vendas);
    });
    return map;
  }, [state.clients, state.orders, state.vendas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = state.clients.filter((c) => {
      const m = metricsMap[c.id];
      const matchesQ =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.neighborhood.toLowerCase().includes(q) ||
        (c.ig || '').toLowerCase().includes(q) ||
        (m?.lastDevice || c.lastDevice).toLowerCase().includes(q);
      if (!matchesQ) return false;

      if (filter === 'VIP / Lojistas') return c.tag === 'VIP' || c.tag === 'Lojista';
      if (filter === 'Com OS Aberta') {
        return state.orders.some(
          (o) =>
            (o.clientId === c.id || o.clientName.toLowerCase() === c.name.toLowerCase()) &&
            o.status !== 'Entregue' &&
            o.status !== 'Cancelado'
        );
      }
      if (filter === 'Aniversariantes') {
        return Boolean(c.nasc && Number(c.nasc.slice(5, 7)) === birthMonth);
      }
      if (filter === 'Inativos (+90d)') {
        return Boolean(m?.isInactive90d);
      }
      return true;
    });

    if (filter === 'Aniversariantes') {
      return [...base].sort(
        (a, b) => Number((a.nasc || '').slice(8, 10)) - Number((b.nasc || '').slice(8, 10))
      );
    }
    if (filter === 'Inativos (+90d)') {
      return [...base].sort(
        (a, b) => (metricsMap[b.id]?.daysInactive || 0) - (metricsMap[a.id]?.daysInactive || 0)
      );
    }
    return base;
  }, [state.clients, state.orders, metricsMap, search, filter, birthMonth]);

  const activeClient: Client | undefined =
    state.clients.find((c) => c.id === selectedId) || filtered[0];

  const activeMetrics = activeClient ? metricsMap[activeClient.id] : undefined;

  const clientOrders = activeClient
    ? state.orders.filter(
        (o) =>
          o.clientId === activeClient.id ||
          o.clientName.toLowerCase() === activeClient.name.toLowerCase()
      )
    : [];

  const clientSales = useMemo(() => {
    if (!activeClient) return [];
    const nameLower = activeClient.name.trim().toLowerCase();
    return [...state.vendas]
      .filter(
        (v) =>
          v.cli === activeClient.id ||
          (!v.cli && (v.cliNome || '').trim().toLowerCase() === nameLower)
      )
      .sort((a, b) => b.n - a.n);
  }, [activeClient, state.vendas]);

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClient || !newNote.trim()) return;
    addClientNote(activeClient.id, newNote);
    setNewNote('');
  };

  const resetFormFields = () => {
    setCFoto('');
    setCPhotoError('');
    setCName('');
    setCPhone('');
    setCCpf('');
    setCEmail('');
    setCNasc('');
    setCIg('');
    setCOrigem('');
    setCCep('');
    setCRua('');
    setCNum('');
    setCNeighborhood('');
    setCRef('');
    setCObs('');
    setCTag('Recorrente');
  };

  const openAddModal = () => {
    setEditingClient(null);
    resetFormFields();
    setShowAddModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setCFoto(client.foto || '');
    setCPhotoError('');
    setCName(client.name);
    setCPhone(client.phone === 'Não informado' ? '' : client.phone);
    setCCpf(client.cpf === '000.***.***-00' ? '' : client.cpf);
    setCEmail(client.email || '');
    setCNasc(client.nasc || '');
    setCIg(client.ig || '');
    setCOrigem(client.origem || '');
    setCCep(client.cep || '');
    setCRua(client.rua || '');
    setCNum(client.num || '');
    setCNeighborhood(client.neighborhood || '');
    setCRef(client.ref || '');
    setCObs(client.obs || '');
    setCTag(client.tag || '');
    setShowAddModal(true);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCPhotoError('');
    try {
      const resized = await resizeClientPhoto160Jpeg(file);
      setCFoto(resized);
    } catch (err) {
      setCPhotoError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    }
  };

  const handleSaveClientForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    const payload = {
      foto: cFoto || undefined,
      name: cName.trim(),
      phone: cPhone.trim() || 'Não informado',
      cpf: cCpf.trim() || '000.***.***-00',
      email: cEmail.trim() || '',
      nasc: cNasc || undefined,
      ig: cIg.trim() || undefined,
      origem: cOrigem.trim() || undefined,
      cep: cCep.trim() || undefined,
      rua: cRua.trim() || undefined,
      num: cNum.trim() || undefined,
      neighborhood: cNeighborhood.trim() || 'Salvador - BA',
      ref: cRef.trim() || undefined,
      obs: cObs.trim() || undefined,
      tag: cTag ? cTag : undefined,
    };

    if (editingClient) {
      updateClient(editingClient.id, payload);
    } else {
      const created = addClient({
        ...payload,
        lastDevice: 'Cadastro Inicial',
      });
      setSelectedId(created.id);
    }
    setShowAddModal(false);
    setEditingClient(null);
    resetFormFields();
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('');

  const inactiveCount = useMemo(
    () => state.clients.filter((c) => metricsMap[c.id]?.isInactive90d).length,
    [state.clients, metricsMap]
  );

  const birthdaysInMonthCount = useMemo(
    () =>
      state.clients.filter((c) => c.nasc && Number(c.nasc.slice(5, 7)) === birthMonth).length,
    [state.clients, birthMonth]
  );

  const formatAddressLine = (c: Client) => {
    const street = [c.rua, c.num].filter(Boolean).join(', ');
    return [street, c.neighborhood, c.cep ? `CEP ${c.cep}` : '', c.ref ? `Ref.: ${c.ref}` : '']
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#091b36]">Clientes &amp; CRM Técnico</h1>
          <p className="text-xs text-[#727784]">
            LTV calculado por OS entregues + PDV, aniversariantes, inativos (+90d), endereço e foto do perfil
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0056ab] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1b6fd1] cursor-pointer whitespace-nowrap self-start"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Cliente</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl bg-white p-3.5 border border-[#D9E0EC] space-y-2.5">
        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#727784] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente por nome, telefone, bairro, @instagram ou aparelho... (atalho /)"
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] pl-9 pr-3 py-2 text-xs text-[#091b36] focus:outline-none focus:border-[#0056ab]"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#F3F6FB] p-1 rounded-xl border border-[#D9E0EC] overflow-x-auto">
            {(
              [
                'Todos',
                'Com OS Aberta',
                'VIP / Lojistas',
                'Aniversariantes',
                'Inativos (+90d)',
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  filter === tab ? 'bg-white text-[#0056ab] shadow-xs' : 'text-[#414752]'
                }`}
              >
                {tab === 'Aniversariantes'
                  ? `Aniversariantes (${birthdaysInMonthCount})`
                  : tab === 'Inativos (+90d)'
                  ? `Inativos +90d (${inactiveCount})`
                  : tab}
              </button>
            ))}
          </div>
        </div>

        {filter === 'Aniversariantes' && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D9E0EC]">
            <div className="flex items-center gap-2 text-xs text-[#414752]">
              <Cake className="w-4 h-4 text-[#0056ab]" />
              <span className="font-semibold text-[#091b36]">Mês de aniversário:</span>
            </div>
            <select
              value={birthMonth}
              onChange={(e) => setBirthMonth(Number(e.target.value))}
              className="rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-1.5 text-xs font-semibold text-[#091b36]"
            >
              {MONTH_NAMES.map((mName, idx) => (
                <option key={mName} value={idx + 1}>
                  {mName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-2.5">
          {filtered.map((client) => {
            const active = activeClient?.id === client.id;
            const m = metricsMap[client.id];
            const firstName = client.name.split(' ')[0] || client.name;
            const waPhone = toWaPhone(client.phone);
            const birthdayDay = client.nasc ? client.nasc.slice(8, 10) : '';

            return (
              <div
                key={client.id}
                onClick={() => setSelectedId(client.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(client.id);
                  }
                }}
                className={`w-full text-left rounded-2xl p-4 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#EAF2FD]/70 border-[#0056ab]'
                    : 'bg-white border-[#D9E0EC] hover:border-[#0056ab]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {client.foto ? (
                      <img
                        src={client.foto}
                        alt={client.name}
                        className="w-10 h-10 rounded-full object-cover border border-[#D9E0EC] shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#0056ab] text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {getInitials(client.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-[#091b36] truncate">{client.name}</p>
                        {client.tag && (
                          <span className="px-1.5 py-0.5 rounded bg-[#EAF2FD] text-[#0056ab] text-[10px] font-bold shrink-0">
                            {client.tag}
                          </span>
                        )}
                        {filter === 'Aniversariantes' && birthdayDay && (
                          <span className="px-1.5 py-0.5 rounded bg-[#DCFCE7] text-[#16A34A] text-[10px] font-bold shrink-0">
                            Dia {birthdayDay}
                          </span>
                        )}
                        {filter === 'Inativos (+90d)' && m?.daysInactive != null && (
                          <span className="px-1.5 py-0.5 rounded bg-[#FFF7E6] text-[#D97706] text-[10px] font-bold shrink-0">
                            há {m.daysInactive} dias
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#727784] truncate">
                        {filter === 'Inativos (+90d)' && m?.lastActivityIso
                          ? `Último atend. ${formatDateBR(m.lastActivityIso)} · ${client.phone}`
                          : `${client.phone} · ${client.neighborhood}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <div className="text-right">
                        <p className="text-xs font-bold text-[#091b36] tabular-nums">
                          {formatBRL(m ? m.ltv : client.ltv)}
                        </p>
                        <p className="text-[10px] text-[#727784] tabular-nums">
                          {m ? m.ordersCount : client.ordersCount} atend.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(client.id);
                          openEditModal(client);
                        }}
                        title="Editar cadastro"
                        aria-label={`Editar ${client.name}`}
                        className="p-1.5 rounded-lg border border-[#D9E0EC] bg-[#F3F6FB] text-[#414752] hover:bg-[#EAF2FD] hover:text-[#0056ab] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {filter === 'Aniversariantes' && waPhone && (
                      <a
                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                          `Feliz aniversário, ${firstName}! Um abraço da MicroLab.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#16A34A] hover:bg-[#bbf7d0]"
                      >
                        <Cake className="w-3 h-3" />
                        <span>Parabenizar</span>
                      </a>
                    )}
                    {filter === 'Inativos (+90d)' && waPhone && (
                      <a
                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                          `Olá, ${firstName}! Aqui é da MicroLab. Tudo bem com o seu aparelho?`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold text-[#16A34A] hover:bg-[#bbf7d0]"
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-2xl bg-white p-8 border border-[#D9E0EC] text-center text-xs text-[#727784]">
              {filter === 'Aniversariantes'
                ? `Nenhum aniversariante cadastrado em ${MONTH_NAMES[birthMonth - 1]}.`
                : filter === 'Inativos (+90d)'
                ? 'Nenhum cliente inativo há mais de 90 dias.'
                : 'Nenhum cliente encontrado.'}
            </div>
          )}
        </div>

        {/* Right Detail Dossier */}
        <div className="lg:col-span-7 rounded-2xl bg-white p-5 border border-[#D9E0EC] space-y-5">
          {activeClient ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#D9E0EC]">
                <div className="flex items-center gap-3 min-w-0">
                  {activeClient.foto ? (
                    <img
                      src={activeClient.foto}
                      alt={activeClient.name}
                      className="w-12 h-12 rounded-full object-cover border border-[#D9E0EC] shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#091b36] text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {getInitials(activeClient.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-[#091b36] truncate">{activeClient.name}</h2>
                      {activeClient.tag && (
                        <span className="px-2 py-0.5 rounded-md bg-[#EAF2FD] text-[#0056ab] text-[10px] font-bold">
                          {activeClient.tag}
                        </span>
                      )}
                      {activeClient.origem && (
                        <span className="px-2 py-0.5 rounded-md bg-[#F3F6FB] border border-[#D9E0EC] text-[#414752] text-[10px] font-semibold">
                          Origem: {activeClient.origem}
                        </span>
                      )}
                      {activeMetrics?.isInactive90d && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFF7E6] text-[#D97706] text-[10px] font-bold">
                          <Clock className="w-3 h-3" />
                          <span>Inativo há {activeMetrics.daysInactive} dias</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#727784] truncate">
                      {activeClient.phone}
                      {activeClient.email ? ` · ${activeClient.email}` : ''} · CPF {activeClient.cpf}
                      {activeClient.nasc ? ` · Nasc. ${formatDateBR(activeClient.nasc)}` : ''}
                    </p>
                    {(activeClient.ig || formatAddressLine(activeClient)) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#414752] mt-1">
                        {activeClient.ig && (
                          <span className="inline-flex items-center gap-1 text-[#0056ab] font-medium">
                            <Instagram className="w-3 h-3" />
                            <span>{activeClient.ig}</span>
                          </span>
                        )}
                        {formatAddressLine(activeClient) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#727784] shrink-0" />
                            <span>{formatAddressLine(activeClient)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(activeClient)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-semibold text-[#091b36] hover:bg-[#EAF2FD] cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Cadastro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteClientError('');
                      setConfirmDeleteClientId((prev) =>
                        prev === activeClient.id ? null : activeClient.id
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#FEE2E2] bg-[#FEE2E2]/40 px-3 py-2 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                  {toWaPhone(activeClient.phone) && (
                    <a
                      href={`https://wa.me/${toWaPhone(activeClient.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#DCFCE7] text-[#16A34A] px-3.5 py-2 text-xs font-bold hover:bg-[#bbf7d0] whitespace-nowrap"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>

              {(confirmDeleteClientId === activeClient.id || deleteClientError) && (
                <div className="rounded-xl bg-[#FEE2E2]/60 border border-[#DC2626]/30 p-3 space-y-2">
                  {deleteClientError && (
                    <p className="text-xs font-semibold text-[#DC2626]">{deleteClientError}</p>
                  )}
                  {confirmDeleteClientId === activeClient.id && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#091b36]">
                        Confirmar exclusão permanente de <strong>{activeClient.name}</strong>?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const res = deleteClient(activeClient.id);
                            if (!res.ok) {
                              setDeleteClientError(
                                res.error || 'Não foi possível excluir este cliente.'
                              );
                              return;
                            }
                            setConfirmDeleteClientId(null);
                            setDeleteClientError('');
                            setSelectedId('');
                          }}
                          className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#b91c1c] cursor-pointer"
                        >
                          Confirmar Exclusão
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteClientId(null);
                            setDeleteClientError('');
                          }}
                          className="rounded-lg border border-[#D9E0EC] bg-white px-3 py-1.5 text-xs font-semibold text-[#414752] cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                  <span className="text-[11px] text-[#727784] block">LTV Acumulado</span>
                  <span className="text-base font-bold text-[#091b36] tabular-nums">
                    {formatBRL(activeMetrics ? activeMetrics.ltv : activeClient.ltv)}
                  </span>
                  <span className="block text-[10px] text-[#727784] mt-0.5">
                    {activeMetrics?.deliveredOrdersCount || 0} OS entregues ·{' '}
                    {activeMetrics?.validSalesCount || 0} PDV
                  </span>
                </div>
                <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                  <span className="text-[11px] text-[#727784] block">Ticket Médio</span>
                  <span className="text-base font-bold text-[#091b36] tabular-nums">
                    {formatBRL(
                      activeMetrics && activeMetrics.ordersCount > 0
                        ? activeMetrics.ltv / activeMetrics.ordersCount
                        : 0
                    )}
                  </span>
                </div>
                <div className="rounded-xl bg-[#F3F6FB] p-3 border border-[#D9E0EC]">
                  <span className="text-[11px] text-[#727784] block">Última Visita</span>
                  <span className="text-sm font-bold text-[#091b36]">
                    {activeMetrics?.lastActivityIso
                      ? formatDateBR(activeMetrics.lastActivityIso)
                      : activeClient.lastVisit}
                  </span>
                </div>
              </div>

              {activeClient.obs && (
                <div className="rounded-xl bg-[#EAF2FD]/60 border border-[#0056ab]/20 px-3.5 py-2.5 text-xs text-[#414752]">
                  <strong className="text-[#091b36]">Observações do cadastro:</strong> {activeClient.obs}
                </div>
              )}

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
                  <p className="text-xs text-[#727784]">
                    Último dispositivo registrado: {activeMetrics?.lastDevice || activeClient.lastDevice}
                  </p>
                )}
              </div>

              {/* Linked PDV Sales */}
              {clientSales.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#091b36] flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4 text-[#0056ab]" />
                    <span>Compras no PDV</span>
                  </h3>
                  <div className="space-y-2">
                    {clientSales.map((v) => {
                      const saleTotal = calcSaleTotalAmount(v);
                      const isRev = v.st === 'Estornada';
                      return (
                        <div
                          key={v.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB]/50 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#091b36]">
                                Venda nº {v.n} · {formatDateBR(v.data)}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isRev
                                    ? 'bg-white text-[#727784] border border-[#D9E0EC]'
                                    : 'bg-[#DCFCE7] text-[#16A34A]'
                                }`}
                              >
                                {isRev ? 'Estornada' : 'Paga'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#727784] truncate">
                              {v.itens.map((it) => `${it.q}x ${it.d}`).join(', ')} · {v.forma}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-bold tabular-nums shrink-0 ${
                              isRev ? 'line-through text-[#727784]' : 'text-[#091b36]'
                            }`}
                          >
                            {formatBRL(saleTotal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-xs text-[#727784]">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Selecione um cliente para visualizar o dossiê CRM.
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Client Modal */}
      {showAddModal && (
        <div
          data-modal-open="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
          onClick={() => {
            setShowAddModal(false);
            setEditingClient(null);
          }}
        >
          <form
            onSubmit={handleSaveClientForm}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-xl border border-[#D9E0EC] space-y-3.5 my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#091b36]">
                {editingClient ? 'Editar Cadastro do Cliente' : 'Cadastrar Novo Cliente'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingClient(null);
                }}
                className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Foto do cliente (Canvas 160px JPEG 0.8) */}
            <div className="flex items-center gap-3.5 rounded-xl bg-[#F3F6FB] border border-[#D9E0EC] p-3">
              {cFoto ? (
                <img
                  src={cFoto}
                  alt="Foto do cliente"
                  className="w-14 h-14 rounded-full object-cover border border-[#D9E0EC] shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-[#091b36] text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {cName.trim() ? getInitials(cName) : 'CL'}
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs font-bold text-[#091b36]">Foto do cliente (opcional)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handlePhotoSelect(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#D9E0EC] px-2.5 py-1.5 text-[11px] font-semibold text-[#0056ab] hover:bg-[#EAF2FD] cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{cFoto ? 'Trocar foto' : 'Enviar foto'}</span>
                  </button>
                  {cFoto && (
                    <button
                      type="button"
                      onClick={() => setCFoto('')}
                      className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#DC2626]/30 px-2.5 py-1.5 text-[11px] font-semibold text-[#DC2626] hover:bg-[#FEE2E2]/60 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover foto</span>
                    </button>
                  )}
                </div>
                {cPhotoError && <p className="text-[10px] text-[#DC2626] font-semibold">{cPhotoError}</p>}
              </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">WhatsApp / Telefone</label>
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">CPF</label>
                <input
                  value={cCpf}
                  onChange={(e) => setCCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">E-mail</label>
                <input
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">
                  Data de nascimento
                </label>
                <input
                  type="date"
                  value={cNasc}
                  onChange={(e) => setCNasc(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Instagram (@perfil)</label>
                <input
                  value={cIg}
                  onChange={(e) => setCIg(e.target.value)}
                  placeholder="@usuario"
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#414752] mb-1">Origem</label>
                <select
                  value={cOrigem}
                  onChange={(e) => setCOrigem(e.target.value)}
                  className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs"
                >
                  <option value="">— Selecionar origem —</option>
                  {ORIGEM_OPTIONS.map((orig) => (
                    <option key={orig} value={orig}>
                      {orig}
                    </option>
                  ))}
                  {cOrigem && !(ORIGEM_OPTIONS as readonly string[]).includes(cOrigem) && (
                    <option value={cOrigem}>{cOrigem}</option>
                  )}
                </select>
              </div>
            </div>

            {/* Endereço completo */}
            <div className="rounded-xl bg-[#F3F6FB]/60 border border-[#D9E0EC] p-3 space-y-2.5">
              <p className="text-[11px] font-bold text-[#091b36]">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">CEP</label>
                  <input
                    value={cCep}
                    onChange={(e) => setCCep(e.target.value)}
                    placeholder="40000-000"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Rua / Logradouro</label>
                  <input
                    value={cRua}
                    onChange={(e) => setCRua(e.target.value)}
                    placeholder="Rua, avenida, travessa..."
                    className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Número</label>
                  <input
                    value={cNum}
                    onChange={(e) => setCNum(e.target.value)}
                    placeholder="Nº / Apto"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Bairro / Cidade</label>
                  <input
                    value={cNeighborhood}
                    onChange={(e) => setCNeighborhood(e.target.value)}
                    placeholder="Ex.: Pituba"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#414752] mb-1">Referência</label>
                  <input
                    value={cRef}
                    onChange={(e) => setCRef(e.target.value)}
                    placeholder="Ponto de referência"
                    className="w-full rounded-xl border border-[#D9E0EC] bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#414752] mb-1">Observações</label>
              <textarea
                rows={2}
                value={cObs}
                onChange={(e) => setCObs(e.target.value)}
                placeholder="Preferências de contato, histórico geral, notas do cliente..."
                className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingClient(null);
                }}
                className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-[#0056ab] py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                {editingClient ? 'Salvar Alterações' : 'Salvar Cliente'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
