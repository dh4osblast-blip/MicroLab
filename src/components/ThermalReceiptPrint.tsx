import React from 'react';
import { LabConfig, SaleRecord, ServiceOrder } from '../types/lab';
import {
  APP_VERSION_TAG,
  calcOrderTotalAmount,
  calcSaleTotalAmount,
  formatDateBR,
} from '../utils/pricing';
import { buildPixPayload } from '../utils/pix';
import { PixQrGraphic } from './PixModal';
import { AndroidPatternMiniSvg } from './AndroidPatternLock';

export function runWithThermalPrintMode(
  width: '58mm' | '80mm',
  prepare: () => void
): void {
  const root = document.documentElement;
  const cls = width === '58mm' ? 'thermal-print-58' : 'thermal-print-80';
  root.classList.remove('thermal-print-58', 'thermal-print-80');
  root.classList.add(cls);

  const cleanup = () => {
    root.classList.remove('thermal-print-58', 'thermal-print-80');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  prepare();
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 1500);
  }, 60);
}

interface OrderThermalReceiptProps {
  order: ServiceOrder;
  cfg: LabConfig;
  pixMerchant: string;
  pixCity?: string;
  defaultTechName?: string;
  volatilePatternNodes?: number[];
  clientSignatureDataUrl?: string;
  warrantyUntil?: string;
}

export const OrderThermalReceipt: React.FC<OrderThermalReceiptProps> = ({
  order,
  cfg,
  pixMerchant,
  pixCity = 'SALVADOR',
  defaultTechName = 'Técnico Bancada',
  volatilePatternNodes,
  clientSignatureDataUrl,
  warrantyUntil,
}) => {
  const width = cfg.thermalWidth === '58mm' ? '58mm' : '80mm';
  const is58 = width === '58mm';
  const total = calcOrderTotalAmount(order);
  const paid = Math.max(0, Number(order.paidAmount) || 0);
  const saldo = Math.max(0, Math.round((total - paid) * 100) / 100);
  const pixTargetAmount = saldo > 0.004 ? saldo : order.status !== 'Cancelado' && paid <= 0 ? total : 0;

  const pixPayload =
    cfg.pixKey && pixTargetAmount > 0
      ? buildPixPayload({
          pixKey: cfg.pixKey,
          merchant: cfg.pixNome || pixMerchant || 'MicroLab',
          city: cfg.pixCid || pixCity || 'SALVADOR',
          amount: pixTargetAmount,
          txid: `OS${order.id}`,
        })
      : '';

  const formatBRLSimple = (val: number) =>
    (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const isPublicAccepted = order.publicAcceptanceStatus === 'accepted';
  const acceptanceType =
    order.clientAcceptanceType ||
    (clientSignatureDataUrl || order.hasClientSignature ? 'screen_signature' : 'printed');

  return (
    <section
      id="print-os-thermal"
      className={`hidden print:block bg-white text-black font-mono leading-tight mx-auto ${
        is58 ? 'thermal-page-58 text-[9px]' : 'thermal-page-80 text-[10px]'
      }`}
    >
      {/* Header */}
      <div className="text-center border-b border-dashed border-black pb-1.5 mb-1.5">
        <div className="font-extrabold text-xs uppercase tracking-tight">MICROLAB ASSISTÊNCIA</div>
        <div>WhatsApp (71) 99129-3552</div>
        <div>@microlabssa</div>
        <div className="text-[8px] mt-0.5">{new Date().toLocaleString('pt-BR')}</div>
      </div>

      {/* Title */}
      <div className="text-center border-y border-black py-1 mb-1.5 font-extrabold uppercase">
        OS Nº {order.id} · {order.status.toUpperCase()}
      </div>

      {/* Client & Device */}
      <div className="space-y-0.5 border-b border-dashed border-black pb-1.5 mb-1.5">
        <div>
          <strong>CLI:</strong> {order.clientName}
        </div>
        {order.clientPhone && (
          <div>
            <strong>TEL:</strong> {order.clientPhone}
          </div>
        )}
        <div>
          <strong>APARELHO:</strong> {order.device}
        </div>
        {order.imei && order.imei !== 'Não informado' && (
          <div>
            <strong>IMEI:</strong> {order.imei}
          </div>
        )}
        <div>
          <strong>DEFEITO:</strong> {order.issue}
        </div>
        <div>
          <strong>TÉC:</strong> {order.technician || defaultTechName}
        </div>
        {order.expectedDeliveryDate && (
          <div>
            <strong>PREV.:</strong> {formatDateBR(order.expectedDeliveryDate)}
          </div>
        )}
      </div>

      {/* LGPD Pattern 3x3 Mini SVG (Volatile RAM only) */}
      {(volatilePatternNodes?.length || order.hasPasscode) && (
        <div className="border-b border-dashed border-black pb-1.5 mb-1.5 flex items-center justify-between gap-2">
          <div>
            <strong>SENHA / PADRÃO (LGPD):</strong>
            <div className="text-[8px]">
              {volatilePatternNodes?.length
                ? 'Padrão informado na sessão'
                : 'PIN informado ao técnico'}
            </div>
          </div>
          {volatilePatternNodes?.length ? (
            <AndroidPatternMiniSvg nodes={volatilePatternNodes} size={is58 ? 38 : 44} monochrome />
          ) : null}
        </div>
      )}

      {/* Items & Values */}
      <div className="border-b border-dashed border-black pb-1.5 mb-1.5 space-y-1">
        <div className="font-bold uppercase">SERVIÇOS E ITENS</div>
        {order.servicePrice > 0 && (
          <div className="flex justify-between gap-1">
            <span className="truncate">
              1x {order.serviceCatalogName || 'Serviço Técnico'}
            </span>
            <span className="shrink-0 tabular-nums">{formatBRLSimple(order.servicePrice)}</span>
          </div>
        )}
        {(order.extraItems || []).map((it, idx) => (
          <div key={idx} className="flex justify-between gap-1">
            <span className="truncate">
              {it.q}x {it.d}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatBRLSimple((Number(it.q) || 0) * (Number(it.v) || 0))}
            </span>
          </div>
        ))}
        {order.partsPrice > 0 && (
          <div className="flex justify-between gap-1">
            <span className="truncate">Peças Aplicadas</span>
            <span className="shrink-0 tabular-nums">{formatBRLSimple(order.partsPrice)}</span>
          </div>
        )}
        {(order.deliveryFee || 0) > 0 && (
          <div className="flex justify-between gap-1">
            <span>Taxa de entrega</span>
            <span className="shrink-0 tabular-nums">{formatBRLSimple(order.deliveryFee || 0)}</span>
          </div>
        )}
        {(order.discount || 0) > 0 && (
          <div className="flex justify-between gap-1">
            <span>Desconto</span>
            <span className="shrink-0 tabular-nums">-{formatBRLSimple(order.discount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between gap-1 font-extrabold border-t border-black pt-1 text-[10px]">
          <span>TOTAL OS</span>
          <span className="tabular-nums">{formatBRLSimple(total)}</span>
        </div>
        {paid > 0 && (
          <>
            <div className="flex justify-between gap-1">
              <span>Já pago</span>
              <span className="tabular-nums">-{formatBRLSimple(paid)}</span>
            </div>
            <div className="flex justify-between gap-1 font-bold">
              <span>SALDO A PAGAR</span>
              <span className="tabular-nums">{formatBRLSimple(saldo)}</span>
            </div>
          </>
        )}
      </div>

      {/* Summarized Terms */}
      <div className="border-b border-dashed border-black pb-1.5 mb-1.5 text-[7.5px] leading-tight space-y-0.5">
        <div className="font-bold uppercase">TERMOS RESUMIDOS (CDC)</div>
        <div>
          Garantia de {cfg.garantiaDias || 90} dias no serviço/peça trocada (não cobre mau uso, queda ou líquido).
          Aparelhos não retirados em 90 dias seguem Art. 6º CDC.
        </div>
        {warrantyUntil && (
          <div className="font-bold">Garantia até {formatDateBR(warrantyUntil)}</div>
        )}
      </div>

      {/* Signature / Digital Acceptance Seal */}
      <div className="border-b border-dashed border-black pb-1.5 mb-1.5 text-center space-y-1">
        {isPublicAccepted ? (
          <div className="border border-black p-1 text-[7.5px] space-y-0.5">
            {clientSignatureDataUrl && (
              <img
                src={clientSignatureDataUrl}
                alt="Assinatura Cliente"
                className="max-h-10 w-auto mx-auto object-contain mix-blend-multiply"
              />
            )}
            <div className="font-extrabold uppercase">ACEITE DIGITAL VERIFICADO</div>
            {order.publicAcceptedAt && <div>Data: {order.publicAcceptedAt}</div>}
            {order.publicAcceptedIp && <div>IP: {order.publicAcceptedIp}</div>}
            {order.publicAcceptanceQuoteHash && (
              <div>SHA-256: {order.publicAcceptanceQuoteHash.slice(0, 16)}</div>
            )}
          </div>
        ) : acceptanceType === 'digital_channel' ? (
          <div className="border border-black p-1 text-[8px] font-bold">
            Aceite via {order.clientAcceptanceChannel || 'WhatsApp'}
            {order.clientAcceptanceAt ? ` em ${order.clientAcceptanceAt}` : ''}
          </div>
        ) : acceptanceType === 'screen_signature' && clientSignatureDataUrl ? (
          <div>
            <img
              src={clientSignatureDataUrl}
              alt="Assinatura Cliente"
              className="max-h-10 w-auto mx-auto object-contain mix-blend-multiply"
            />
            <div className="border-t border-black pt-0.5 text-[8px]">Assinatura do Cliente</div>
          </div>
        ) : (
          <div className="pt-5">
            <div className="border-t border-black pt-0.5 text-[8px]">Assinatura do Cliente</div>
          </div>
        )}
      </div>

      {/* PIX QR Code when balance due */}
      {pixPayload && (
        <div className="flex flex-col items-center text-center border-b border-dashed border-black pb-1.5 mb-1.5 space-y-1">
          <div className="font-bold uppercase text-[8.5px]">
            PAGUE VIA PIX · {formatBRLSimple(pixTargetAmount)}
          </div>
          <PixQrGraphic payload={pixPayload} size={is58 ? 96 : 116} />
          <div className="text-[7.5px]">Escaneie no app do seu banco</div>
        </div>
      )}

      <div className="text-center text-[7.5px]">
        <div>Documento sem valor fiscal</div>
        <div>MicroLab OS · {APP_VERSION_TAG}</div>
      </div>
    </section>
  );
};

interface PosThermalReceiptProps {
  sale: SaleRecord;
  cfg: LabConfig;
  clientLabel: string;
  pixMerchant: string;
  pixCity?: string;
  cashInfo?: { received: number; change: number } | null;
}

export const PosThermalReceipt: React.FC<PosThermalReceiptProps> = ({
  sale,
  cfg,
  clientLabel,
  pixMerchant,
  pixCity = 'SALVADOR',
  cashInfo,
}) => {
  const width = cfg.thermalWidth === '58mm' ? '58mm' : '80mm';
  const is58 = width === '58mm';
  const total = calcSaleTotalAmount(sale);
  const formatBRLSimple = (val: number) =>
    (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const isPix = sale.forma.toLowerCase().includes('pix') && sale.st !== 'Estornada';
  const pixPayload =
    isPix && cfg.pixKey && total > 0
      ? buildPixPayload({
          pixKey: cfg.pixKey,
          merchant: cfg.pixNome || pixMerchant || 'MicroLab',
          city: cfg.pixCid || pixCity || 'SALVADOR',
          amount: total,
          txid: `PDV${sale.n}`,
        })
      : '';

  return (
    <section
      id="print-pos-thermal"
      className={`hidden print:block bg-white text-black font-mono leading-tight mx-auto ${
        is58 ? 'thermal-page-58 text-[9px]' : 'thermal-page-80 text-[10px]'
      }`}
    >
      <div className="text-center border-b border-dashed border-black pb-1.5 mb-1.5">
        <div className="font-extrabold text-xs uppercase">MICROLAB ASSISTÊNCIA</div>
        <div>WhatsApp (71) 99129-3552 · @microlabssa</div>
        <div className="text-[8px] mt-0.5">{new Date().toLocaleString('pt-BR')}</div>
      </div>

      <div className="text-center border-y border-black py-1 mb-1.5 font-extrabold uppercase">
        VENDA Nº {sale.n}
        {sale.st === 'Estornada' ? ' (ESTORNADA)' : ''}
      </div>

      <div className="space-y-0.5 border-b border-dashed border-black pb-1.5 mb-1.5">
        <div>
          <strong>CLI:</strong> {clientLabel}
        </div>
        <div>
          <strong>DATA:</strong> {formatDateBR(sale.data)}
        </div>
        <div>
          <strong>PAGAMENTO:</strong> {sale.forma}
        </div>
        {sale.vend && (
          <div>
            <strong>VEND:</strong> {sale.vend}
          </div>
        )}
      </div>

      <div className="border-b border-dashed border-black pb-1.5 mb-1.5 space-y-1">
        <div className="font-bold uppercase">ITENS</div>
        {sale.itens.map((it, idx) => (
          <div key={idx} className="flex justify-between gap-1">
            <span className="truncate">
              {it.q}x {it.d}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatBRLSimple((Number(it.q) || 0) * (Number(it.v) || 0))}
            </span>
          </div>
        ))}
        {sale.desc > 0 && (
          <div className="flex justify-between gap-1">
            <span>Desconto</span>
            <span className="tabular-nums">-{formatBRLSimple(sale.desc)}</span>
          </div>
        )}
        <div className="flex justify-between gap-1 font-extrabold border-t border-black pt-1 text-[10px]">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatBRLSimple(total)}</span>
        </div>
        {cashInfo && (
          <>
            <div className="flex justify-between gap-1">
              <span>Recebido</span>
              <span className="tabular-nums">{formatBRLSimple(cashInfo.received)}</span>
            </div>
            <div className="flex justify-between gap-1 font-bold">
              <span>Troco</span>
              <span className="tabular-nums">{formatBRLSimple(cashInfo.change)}</span>
            </div>
          </>
        )}
      </div>

      {pixPayload && (
        <div className="flex flex-col items-center text-center border-b border-dashed border-black pb-1.5 mb-1.5 space-y-1">
          <div className="font-bold uppercase text-[8.5px]">
            PIX · {formatBRLSimple(total)}
          </div>
          <PixQrGraphic payload={pixPayload} size={is58 ? 96 : 116} />
        </div>
      )}

      <div className="text-center text-[7.5px] space-y-0.5">
        <div>Comprovante sem valor fiscal</div>
        <div>Garantia legal 90 dias (CDC)</div>
        <div>MicroLab OS · {APP_VERSION_TAG}</div>
      </div>
    </section>
  );
};
