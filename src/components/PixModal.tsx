import React, { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, QrCode, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatBRL, useLabStore } from '../store/useLabStore';
import { buildPixPayload, formatPixKeyForEmv } from '../utils/pix';

interface PixModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAmount?: number;
  initialDescription?: string;
}

export const PixQrGraphic: React.FC<{ payload?: string; seed?: string; size?: number }> = ({
  payload,
  seed,
  size = 156,
}) => {
  const value = payload ?? seed ?? '';

  const matrix = useMemo(() => {
    if (!value) return null;
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const data = qr.modules.data;
      const rows: boolean[][] = [];
      for (let r = 0; r < count; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < count; c++) {
          row.push(Boolean(data[r * count + c]));
        }
        rows.push(row);
      }
      return { count, rows };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div
        style={{ width: size, height: size }}
        className="bg-white rounded-xl border border-[#D9E0EC] flex flex-col items-center justify-center p-3 text-center text-[11px] text-[#727784]"
      >
        <AlertTriangle className="w-5 h-5 text-[#D97706] mb-1" />
        <span>Chave PIX não configurada</span>
      </div>
    );
  }

  const margin = 2;
  const viewSize = matrix.count + margin * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      shapeRendering="crispEdges"
      className="bg-white rounded-xl border border-[#D9E0EC] shrink-0"
      role="img"
      aria-label="QR Code PIX Banco Inter escaneável"
    >
      <rect width={viewSize} height={viewSize} fill="#FFFFFF" />
      {matrix.rows.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={c + margin}
              y={r + margin}
              width={1}
              height={1}
              fill="#091b36"
            />
          ) : null
        )
      )}
    </svg>
  );
};

export const PixModal: React.FC<PixModalProps> = ({
  isOpen,
  onClose,
  initialAmount = 0,
  initialDescription = 'Servico Bancada MicroLab',
}) => {
  const { state, addTransaction } = useLabStore();
  const [amountStr, setAmountStr] = useState(initialAmount > 0 ? initialAmount.toFixed(2) : '');
  const [description, setDescription] = useState(initialDescription);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setAmountStr(initialAmount > 0 ? initialAmount.toFixed(2) : '');
      setDescription(initialDescription);
      setCopied(false);
      setConfirmed(false);
    }
  }, [isOpen, initialAmount, initialDescription]);

  const amountVal = Math.max(0, parseFloat(amountStr.replace(',', '.')) || 0);
  const pixPayload = useMemo(
    () =>
      buildPixPayload({
        pixKey: state.labProfile.pixKey,
        merchant: state.labProfile.pixMerchant,
        city: state.labProfile.pixCity || 'SALVADOR',
        amount: amountVal,
        txid: description,
      }),
    [state.labProfile.pixKey, state.labProfile.pixMerchant, state.labProfile.pixCity, amountVal, description]
  );

  if (!isOpen) return null;

  const formattedKey = formatPixKeyForEmv(state.labProfile.pixKey);

  const handleCopy = async () => {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
    } catch {
      // Fallback silent
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleConfirmReceive = () => {
    if (amountVal <= 0) return;
    addTransaction({
      title: description || 'Recebimento PIX Avulso',
      subtitle: 'PIX Banco Inter · Conciliado no Caixa',
      tag: 'PIX-INT',
      channel: 'PIX',
      type: 'in',
      amount: amountVal,
      reconciled: true,
    });
    setConfirmed(true);
    setTimeout(() => {
      onClose();
    }, 1100);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091b36]/55 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#D9E0EC]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#EAF2FD] text-[#0056ab] flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#091b36]">Gerador PIX Banco Inter</h3>
              <p className="text-xs text-[#727784]">Chave EMV: {formattedKey || 'Não configurada'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#727784] hover:bg-[#F3F6FB] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">
              Valor (R$) <span className="font-normal text-[#727784]">(vazio = livre)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Livre (cliente digita)"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-sm font-bold text-[#091b36] tabular-nums focus:outline-none focus:border-[#0056ab]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#414752] mb-1">Identificador / OS</label>
            <input
              type="text"
              maxLength={25}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-xs font-medium text-[#091b36] focus:outline-none focus:border-[#0056ab]"
            />
          </div>
        </div>

        <div className="flex flex-col items-center bg-[#F3F6FB] rounded-xl p-4 border border-[#D9E0EC]">
          <PixQrGraphic payload={pixPayload} size={168} />
          <p className="mt-2.5 text-lg font-bold text-[#091b36] tabular-nums">
            {amountVal > 0 ? formatBRL(amountVal) : 'Valor livre no banco'}
          </p>
          <p className="text-[11px] text-[#727784] text-center">
            {state.labProfile.pixMerchant} · {state.labProfile.pixCity || 'SALVADOR'}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={pixPayload}
            placeholder="Configure uma chave PIX para gerar o Copia e Cola"
            className="flex-1 rounded-xl border border-[#D9E0EC] bg-[#F3F6FB] px-3 py-2 text-[11px] font-mono text-[#414752] truncate"
          />
          <button
            type="button"
            disabled={!pixPayload}
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#EAF2FD] px-3 py-2 text-xs font-semibold text-[#0056ab] hover:bg-[#dfe8ff] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[#D9E0EC] py-2.5 text-xs font-semibold text-[#414752] hover:bg-[#F3F6FB] cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleConfirmReceive}
            disabled={confirmed || amountVal <= 0}
            className="flex-[1.5] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] py-2.5 text-xs font-semibold text-white hover:bg-[#15803d] transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{confirmed ? 'Registrado no Caixa!' : 'Confirmar Recebimento'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
