import type { GoogleGenAI, Model, Type as GeminiTypeNamespace } from '@google/genai';
import {
  ImeiValidationResult,
  normalizeImeiDigits,
  validateImeiLuhn,
} from '../utils/pricing';

/**
 * Chave isolada exclusivamente no navegador local do Administrador.
 * NUNCA incluir em LabState, backups JSON ou firebaseSync.ts.
 */
export const GEMINI_BYOK_STORAGE_KEY = 'microlab_gemini_byok_key';
export const GEMINI_MODEL_ID = 'gemini-3.8-flash';
export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.8-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
] as const;

const PRIMARY_RETRY_DELAY_MS = 1200;

export function getGeminiByokKey(): string {
  try {
    return (localStorage.getItem(GEMINI_BYOK_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveGeminiByokKey(rawKey: string): void {
  const clean = String(rawKey || '').trim();
  try {
    if (!clean) {
      localStorage.removeItem(GEMINI_BYOK_STORAGE_KEY);
    } else {
      localStorage.setItem(GEMINI_BYOK_STORAGE_KEY, clean);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('microlab:byok-changed'));
    }
  } catch {
    // Ignore storage restriction errors gracefully
  }
}

export function removeGeminiByokKey(): void {
  try {
    localStorage.removeItem(GEMINI_BYOK_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('microlab:byok-changed'));
    }
  } catch {
    // Ignore storage restriction errors gracefully
  }
}

export function hasGeminiByokKey(): boolean {
  return getGeminiByokKey().length > 0;
}

export interface GeminiAvailability {
  available: boolean;
  reason: 'ok' | 'offline' | 'missing_key';
  message: string;
}

export function getGeminiAvailability(): GeminiAvailability {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      available: false,
      reason: 'offline',
      message:
        'Sem internet no momento (modo offline). Recursos de IA exigem conexão; o Pré-Diagnóstico Offline segue 100% ativo.',
    };
  }
  if (!hasGeminiByokKey()) {
    return {
      available: false,
      reason: 'missing_key',
      message:
        'Chave API Gemini (BYOK) não configurada neste aparelho. Solicite ao Administrador em Configurações.',
    };
  }
  return {
    available: true,
    reason: 'ok',
    message: 'IA Gemini BYOK pronta neste dispositivo.',
  };
}

function extractReadableMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as { message?: string; error?: { message?: string } };
    if (anyErr.error?.message) return String(anyErr.error.message);
    if (typeof anyErr.message === 'string') {
      const trimmed = anyErr.message.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as { error?: { message?: string }; message?: string };
          if (parsed.error?.message) return String(parsed.error.message);
          if (parsed.message) return String(parsed.message);
        } catch {
          // fallback below
        }
      }
      return trimmed;
    }
  }
  return String(err || '');
}

export function isGeminiAuthOrPermissionError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; code?: number; error?: { code?: number; status?: string } };
    const code = anyErr.status ?? anyErr.code ?? anyErr.error?.code;
    if (code === 401 || code === 403) return true;
  }
  const lower = extractReadableMessage(err).toLowerCase();
  return (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('permission_denied')
  );
}

export function isGeminiUnavailable503(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; code?: number; error?: { code?: number; status?: string } };
    if (anyErr.status === 503 || anyErr.code === 503 || anyErr.error?.code === 503) {
      return true;
    }
    if (anyErr.error?.status === 'UNAVAILABLE') {
      return true;
    }
  }
  const lower = extractReadableMessage(err).toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('high demand')
  );
}

export function isModelFallbackableError(err: unknown): boolean {
  if (isGeminiAuthOrPermissionError(err)) return false;
  if (isGeminiUnavailable503(err)) return true;
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; code?: number; error?: { code?: number; status?: string } };
    const code = anyErr.status ?? anyErr.code ?? anyErr.error?.code;
    if (code === 404 || code === 429) return true;
    if (anyErr.error?.status === 'NOT_FOUND' || anyErr.error?.status === 'RESOURCE_EXHAUSTED') {
      return true;
    }
  }
  const lower = extractReadableMessage(err).toLowerCase();
  return (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('no longer available') ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted')
  );
}

function formatGeminiError(err: unknown): string {
  if (isGeminiUnavailable503(err)) {
    return 'Servidores do Gemini temporariamente ocupados (503). Aguarde alguns segundos e tente novamente.';
  }
  const raw = extractReadableMessage(err);
  const lower = raw.toLowerCase();
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('401')) {
    return 'Chave API Gemini inválida ou revogada. Verifique a chave cadastrada em Configurações.';
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return 'Limite de requisições ou cota da sua chave Gemini atingido no momento. Tente novamente em instantes.';
  }
  if (lower.includes('403') || lower.includes('permission')) {
    return 'Permissão negada pela API Gemini. Verifique se a API Generative Language está habilitada na chave.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Falha de conexão com os servidores do Google Gemini. Verifique sua internet.';
  }
  return raw ? `Erro ao consultar Gemini: ${raw}` : 'Erro inesperado ao consultar Gemini.';
}

async function createGenAiSdkClient(explicitKey?: string): Promise<{
  ai: GoogleGenAI;
  Type: typeof GeminiTypeNamespace;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Dispositivo offline. Conecte-se à internet para usar a IA de bancada.');
  }
  const key = (explicitKey ?? getGeminiByokKey()).trim();
  if (!key) {
    throw new Error('Chave API Gemini (BYOK) não configurada neste dispositivo.');
  }
  const { GoogleGenAI, Type } = await import('@google/genai');
  return { ai: new GoogleGenAI({ apiKey: key }), Type };
}

async function discoverDynamicFlashModels(
  ai: GoogleGenAI,
  alreadyTried: Set<string>
): Promise<string[]> {
  try {
    const pager = await ai.models.list({ config: { pageSize: 50 } });
    const discovered: string[] = [];
    const excludedTokens = [
      'tts',
      'embedding',
      'audio',
      'image',
      'robotics',
      'computer-use',
      'customtools',
      'live',
      'aqa',
    ];
    let scanned = 0;
    for await (const m of pager as AsyncIterable<Model>) {
      scanned++;
      if (scanned > 80) break;
      const cleanId = String(m.name || '')
        .replace(/^models\//i, '')
        .trim();
      if (!cleanId || alreadyTried.has(cleanId)) continue;
      const lower = cleanId.toLowerCase();
      if (!lower.startsWith('gemini-') || !lower.includes('flash')) continue;
      if (excludedTokens.some((tok) => lower.includes(tok))) continue;
      if (
        Array.isArray(m.supportedActions) &&
        m.supportedActions.length > 0 &&
        !m.supportedActions.includes('generateContent')
      ) {
        continue;
      }
      discovered.push(cleanId);
      if (discovered.length >= 4) break;
    }
    return discovered;
  } catch {
    return [];
  }
}

export interface GeminiRetryCallResult<T> {
  data: T;
  modelUsed: string;
  isFallbackModel: boolean;
}

/**
 * Executa chamada Gemini com:
 * 1) Modelo principal (`gemini-3.8-flash`) + 1 retentativa rápida de 1200ms em 503/UNAVAILABLE
 * 2) Cadeia de fallback em modelos leves da família Flash (`gemini-3.8-flash-lite`, `gemini-3.5-flash`, `gemini-2.5-flash-lite`, ...)
 * 3) Descoberta dinâmica via `ai.models.list()` de modelos `gemini-*-flash*` compatíveis com `generateContent`
 */
export async function callGeminiWithRetry<T>(
  ai: GoogleGenAI,
  runner: (modelId: string) => Promise<T>
): Promise<GeminiRetryCallResult<T>> {
  const tried = new Set<string>();
  let lastErr: unknown;

  // 1. Tenta modelo principal com 1 retentativa rápida de 1200ms em caso de 503
  tried.add(GEMINI_MODEL_ID);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await runner(GEMINI_MODEL_ID);
      return { data, modelUsed: GEMINI_MODEL_ID, isFallbackModel: false };
    } catch (err) {
      lastErr = err;
      if (!isModelFallbackableError(err)) {
        throw err;
      }
      const canFastRetryPrimary =
        attempt === 0 &&
        isGeminiUnavailable503(err) &&
        (typeof navigator === 'undefined' || navigator.onLine !== false);
      if (canFastRetryPrimary) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, PRIMARY_RETRY_DELAY_MS));
        continue;
      }
      break;
    }
  }

  // 2. Fallback estático para modelos leves da família Flash
  for (const candidate of GEMINI_FALLBACK_MODELS) {
    if (tried.has(candidate)) continue;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
    tried.add(candidate);
    try {
      const data = await runner(candidate);
      return { data, modelUsed: candidate, isFallbackModel: true };
    } catch (err) {
      lastErr = err;
      if (!isModelFallbackableError(err)) {
        throw err;
      }
    }
  }

  // 3. Descoberta dinâmica via ai.models.list()
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const dynamicCandidates = await discoverDynamicFlashModels(ai, tried);
    for (const candidate of dynamicCandidates) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      try {
        const data = await runner(candidate);
        return { data, modelUsed: candidate, isFallbackModel: true };
      } catch (err) {
        lastErr = err;
        if (!isModelFallbackableError(err)) {
          throw err;
        }
      }
    }
  }

  throw lastErr;
}

/**
 * Redige acidentalmente padrões de CPF/telefone que possam ter sido digitados em notas técnicas.
 * Dados pessoais (nome, telefone, CPF, senhas, padrão 3x3) NUNCA são recebidos pelas interfaces de IA.
 */
function scrubAccidentalIdentifiers(text: string): string {
  return String(text || '')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[redigido]')
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)9?\d{4}-?\d{4}\b/g, '[contato-redigido]')
    .trim();
}

export async function testGeminiByokKey(apiKey: string): Promise<{
  ok: boolean;
  overloaded?: boolean;
  modelUsed?: string;
  isFallbackModel?: boolean;
  message: string;
  latencyMs?: number;
}> {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) {
    return { ok: false, message: 'Informe uma chave API Gemini antes de testar.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, message: 'Sem conexão com a internet para validar a chave no momento.' };
  }
  const started = Date.now();
  try {
    const { ai } = await createGenAiSdkClient(cleanKey);
    const { data: response, modelUsed, isFallbackModel } = await callGeminiWithRetry(ai, (model) =>
      ai.models.generateContent({
        model,
        contents: 'Responda apenas com a palavra: OK',
      })
    );
    const text = (response.text || '').trim();
    const latencyMs = Date.now() - started;
    if (!text) {
      return { ok: false, message: 'A API respondeu sem conteúdo. Verifique sua chave.' };
    }
    return {
      ok: true,
      modelUsed,
      isFallbackModel,
      latencyMs,
      message: isFallbackModel
        ? `Chave válida! Modelo alternativo ${modelUsed} respondeu em ${latencyMs} ms (${GEMINI_MODEL_ID} com pico de demanda).`
        : `Chave válida! Conexão confirmada com ${modelUsed} (${latencyMs} ms).`,
    };
  } catch (err) {
    if (isGeminiUnavailable503(err)) {
      return {
        ok: false,
        overloaded: true,
        message:
          'Sua chave autenticou no Google Gemini, mas os servidores estão com pico momentâneo de tráfego (503). Você pode salvar a chave normalmente e os recursos contarão com fallback automático.',
      };
    }
    return { ok: false, message: formatGeminiError(err) };
  }
}

/**
 * Redimensiona a imagem da etiqueta apenas em RAM para OCR (NUNCA persiste no IndexedDB/localStorage).
 */
async function compressLabelImageInMemory(
  file: File,
  maxDimension = 1024
): Promise<{ base64Data: string; mimeType: 'image/jpeg' }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler a foto selecionada.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Não foi possível decodificar a imagem da etiqueta.'));
    el.src = dataUrl;
  });

  const ratio = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round((img.width || 1) * ratio));
  const targetH = Math.max(1, Math.round((img.height || 1) * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto gráfico indisponível para preparar a foto.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const jpegUrl = canvas.toDataURL('image/jpeg', 0.82);
  const commaIdx = jpegUrl.indexOf(',');
  const base64Data = commaIdx >= 0 ? jpegUrl.slice(commaIdx + 1) : jpegUrl;

  return { base64Data, mimeType: 'image/jpeg' };
}

export interface LabelOcrResult {
  marca: string;
  modeloComercial: string;
  imei: string;
  observacao: string;
  luhn: ImeiValidationResult;
  modelUsed: string;
  isFallbackModel: boolean;
}

export async function extractDeviceAndImeiFromPhoto(file: File): Promise<LabelOcrResult> {
  const { ai, Type } = await createGenAiSdkClient();
  const { base64Data, mimeType } = await compressLabelImageInMemory(file, 1024);

  try {
    const { data: response, modelUsed, isFallbackModel } = await callGeminiWithRetry(ai, (model) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
          {
            text: [
              'Analise esta foto de etiqueta traseira, tela *#06#, caixa ou bandeja SIM de um aparelho eletrônico.',
              'Extraia exclusivamente os dados técnicos do equipamento em JSON:',
              '- marca: fabricante (ex: Samsung, Apple, Xiaomi, Motorola, Realme, LG, Asus). String vazia se não identificável.',
              '- modeloComercial: nome comercial e/ou código do modelo (ex: Galaxy A14, iPhone 13, Redmi Note 12 (23021RAAEG)). String vazia se não identificável.',
              '- imei: somente os 15 dígitos numéricos do IMEI principal (IMEI 1), sem espaços ou traços. Se houver apenas número de série ou não estiver legível, retorne string vazia.',
              '- observacao: nota breve em PT-BR se encontrou 2 IMEIs ou se a etiqueta estava parcialmente borrada (máximo 1 frase).',
            ].join('\n'),
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              marca: { type: Type.STRING },
              modeloComercial: { type: Type.STRING },
              imei: { type: Type.STRING },
              observacao: { type: Type.STRING },
            },
            required: ['marca', 'modeloComercial', 'imei'],
          },
        },
      })
    );

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      marca?: string;
      modeloComercial?: string;
      imei?: string;
      observacao?: string;
    };

    const marca = String(parsed.marca || '').trim();
    const modeloComercial = String(parsed.modeloComercial || '').trim();
    const imeiDigits = normalizeImeiDigits(parsed.imei || '');
    const luhn = validateImeiLuhn(imeiDigits);

    return {
      marca,
      modeloComercial,
      imei: imeiDigits,
      observacao: String(parsed.observacao || '').trim(),
      luhn,
      modelUsed,
      isFallbackModel,
    };
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }
}

export interface SanitizedBenchCopilotInput {
  orderCode?: string;
  device: string;
  brand?: string;
  model?: string;
  issue: string;
  technicalNotes?: string;
  entryChecklistSummary?: string[];
  safetyFlags?: {
    swollenBattery?: boolean;
    oxidation?: boolean;
    arrivedDead?: boolean;
  };
  powerTestsSummary?: string[];
  routineTitle?: string;
  routineStepsSummary?: string[];
}

export interface BenchCopilotResult {
  hipotesesPrincipais: string[];
  pontosMedicao: string[];
  alertasSeguranca: string[];
  resumoTecnicoOs: string;
  sourceMode: 'gemini' | 'local_fallback';
  modelUsed?: string;
  isFallbackModel?: boolean;
}

export async function analyzeBenchCopilot(
  input: SanitizedBenchCopilotInput
): Promise<BenchCopilotResult> {
  const { ai, Type } = await createGenAiSdkClient();

  const sanitizedContext = {
    os: input.orderCode || 'Em triagem',
    equipamento: input.device || [input.brand, input.model].filter(Boolean).join(' ') || 'Não informado',
    defeitoRelatado: scrubAccidentalIdentifiers(input.issue || 'Não especificado'),
    observacoesTecnicas: scrubAccidentalIdentifiers(input.technicalNotes || ''),
    checklistEntrada: input.entryChecklistSummary || [],
    alertasTriagem: {
      bateriaInchada: Boolean(input.safetyFlags?.swollenBattery),
      sinaisOxidacao: Boolean(input.safetyFlags?.oxidation),
      entrouApagado: Boolean(input.safetyFlags?.arrivedDead),
    },
    testesFonteBancada: input.powerTestsSummary || [],
    rotinaApostila: input.routineTitle
      ? {
          titulo: input.routineTitle,
          etapas: input.routineStepsSummary || [],
        }
      : null,
  };

  try {
    const { data: response, modelUsed, isFallbackModel } = await callGeminiWithRetry(ai, (model) =>
      ai.models.generateContent({
        model,
        contents: [
          'Dados técnicos anonimizados da bancada (sem dados pessoais do cliente):',
          JSON.stringify(sanitizedContext, null, 2),
        ].join('\n'),
        config: {
          systemInstruction: [
            'Você é um Copiloto Sênior de Bancada e Microssolda para assistência técnica de smartphones, tablets e notebooks (MicroLab).',
            'Analise estritamente os dados técnicos fornecidos (modelo, defeito, checklist de entrada, testes da fonte ZK-SK150C e rotina da apostila) e devolva orientações práticas e seguras em Português do Brasil.',
            'Regras de segurança obrigatórias: se houver bateria inchada ou oxidação, proíba choque de 5,2V e recomende isolamento de microfones antes da cuba ultrassônica; priorize medições não invasivas (condução reversa, consumo em fonte com limite seguro, inspeção de FPC/periféricos) antes de intervir na placa.',
            'Seja objetivo, técnico e conciso.',
          ].join(' '),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hipotesesPrincipais: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              pontosMedicao: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              alertasSeguranca: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              resumoTecnicoOs: {
                type: Type.STRING,
              },
            },
            required: [
              'hipotesesPrincipais',
              'pontosMedicao',
              'alertasSeguranca',
              'resumoTecnicoOs',
            ],
          },
        },
      })
    );

    const parsed = JSON.parse((response.text || '{}').trim()) as Partial<BenchCopilotResult>;
    return {
      hipotesesPrincipais: Array.isArray(parsed.hipotesesPrincipais)
        ? parsed.hipotesesPrincipais.map((x) => String(x).trim()).filter(Boolean)
        : [],
      pontosMedicao: Array.isArray(parsed.pontosMedicao)
        ? parsed.pontosMedicao.map((x) => String(x).trim()).filter(Boolean)
        : [],
      alertasSeguranca: Array.isArray(parsed.alertasSeguranca)
        ? parsed.alertasSeguranca.map((x) => String(x).trim()).filter(Boolean)
        : [],
      resumoTecnicoOs: String(parsed.resumoTecnicoOs || '').trim(),
      sourceMode: 'gemini',
      modelUsed,
      isFallbackModel,
    };
  } catch (err) {
    if (isModelFallbackableError(err)) {
      const errorToPropagate = new Error(formatGeminiError(err));
      (errorToPropagate as Error & { isTransientModelExhausted?: boolean }).isTransientModelExhausted =
        true;
      throw errorToPropagate;
    }
    throw new Error(formatGeminiError(err));
  }
}

export interface SanitizedQuoteTranslatorInput {
  orderCode: string;
  device: string;
  status: string;
  issue: string;
  serviceName?: string;
  technicalNotes?: string;
  items: { description: string; qty: number; subtotal: number }[];
  servicePrice: number;
  partsPrice: number;
  deliveryFee: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  warrantyDays: number;
}

export interface QuoteTranslationResult {
  bodyText: string;
  sourceMode: 'gemini' | 'local_fallback';
  modelUsed?: string;
  isFallbackModel?: boolean;
}

const formatBrlSimple = (val: number): string =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function simplifyTechnicalJargonForClient(
  issue: string,
  serviceName?: string,
  technicalNotes?: string
): string {
  const combined = [serviceName, issue, technicalNotes].filter(Boolean).join(' · ');
  const lower = combined
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const explanations: string[] = [];
  if (lower.includes('pmic') || lower.includes('power manager') || lower.includes('reball')) {
    explanations.push('reparo técnico de precisão no circuito responsável pelo gerenciamento de energia da placa');
  }
  if (lower.includes('oxid') || lower.includes('molhou') || lower.includes('agua') || lower.includes('cuba')) {
    explanations.push('limpeza técnica especializada na placa e conectores para remover sinais de umidade/oxidação');
  }
  if (lower.includes('vbus') || lower.includes('curto') || lower.includes('malha') || lower.includes('fuga')) {
    explanations.push('correção elétrica na placa principal para restabelecer o funcionamento seguro');
  }
  if (lower.includes('fpc') || lower.includes('conector') || lower.includes('carga') || lower.includes('usb')) {
    explanations.push('reparo ou substituição do conector interno de alimentação/dados');
  }
  if (lower.includes('tela') || lower.includes('display') || lower.includes('modulo') || lower.includes('touch')) {
    explanations.push('substituição ou ajuste do conjunto de tela/display com testes de imagem e toque');
  }
  if (lower.includes('bateria')) {
    explanations.push('troca e calibração da bateria com verificação de autonomia e segurança');
  }
  if (lower.includes('software') || lower.includes('loop') || lower.includes('recovery')) {
    explanations.push('recuperação e atualização do sistema operacional do aparelho');
  }

  if (explanations.length > 0) {
    return explanations.join('; ');
  }
  return (serviceName || issue || 'avaliação e reparo técnico do equipamento').trim();
}

export function sanitizeWhatsAppBoldFormatting(text: string): string {
  return String(text || '').replace(/\*\*(.+?)\*\*/g, '*$1*');
}

/**
 * Motor local determinístico do MicroLab OS para traduzir orçamento quando todos os modelos Gemini estão indisponíveis (503/429/404).
 */
export function buildLocalQuoteTranslationFallback(
  input: SanitizedQuoteTranslatorInput
): QuoteTranslationResult {
  const friendlyScope = simplifyTechnicalJargonForClient(
    input.issue,
    input.serviceName,
    input.technicalNotes
  );
  const remaining = Math.max(
    0,
    Math.round(((Number(input.totalAmount) || 0) - (Number(input.paidAmount) || 0)) * 100) / 100
  );

  const lines: string[] = [
    `Aqui é da *MicroLab Assistência Técnica*. Segue o resumo claro do seu atendimento para a *OS ${input.orderCode}* (*${input.device}*):`,
    '',
    `📋 *O que será feito:* ${friendlyScope}.`,
  ];

  if (input.serviceName || input.servicePrice > 0) {
    lines.push(
      `🔧 *Serviço principal:* ${input.serviceName || 'Mão de obra técnica'}${
        input.servicePrice > 0 ? ` — ${formatBrlSimple(input.servicePrice)}` : ''
      }`
    );
  }

  if (input.items.length > 0) {
    lines.push('🧩 *Peças e itens previstos:*');
    input.items.forEach((it) => {
      lines.push(`• ${it.qty}× ${it.description} (${formatBrlSimple(it.subtotal)})`);
    });
  } else if (input.partsPrice > 0) {
    lines.push(`🧩 *Peças:* ${formatBrlSimple(input.partsPrice)}`);
  }

  if (input.deliveryFee > 0) {
    lines.push(`🚚 *Taxa de entrega/coleta:* ${formatBrlSimple(input.deliveryFee)}`);
  }
  if (input.discount > 0) {
    lines.push(`🏷️ *Desconto aplicado:* -${formatBrlSimple(input.discount)}`);
  }

  lines.push('');
  lines.push(`💰 *Valor Total: ${formatBrlSimple(input.totalAmount)}*`);

  if (input.paidAmount > 0) {
    lines.push(
      `✅ Já pago: ${formatBrlSimple(input.paidAmount)} · *Saldo restante: ${formatBrlSimple(remaining)}*`
    );
  }

  lines.push(
    `🛡️ *Garantia:* ${input.warrantyDays} dias referentes ao serviço executado e à peça substituída (conforme termo da OS).`
  );
  lines.push('');
  lines.push('Qualquer dúvida ou para confirmar a execução, basta responder esta mensagem!');

  return {
    bodyText: sanitizeWhatsAppBoldFormatting(lines.join('\n')),
    sourceMode: 'local_fallback',
  };
}

/**
 * Traduz jargão técnico de bancada para mensagem acessível de WhatsApp.
 * LGPD: Não recebe nome, telefone, CPF ou senhas do cliente. A saudação com nome é anexada localmente após a resposta.
 */
export async function translateQuoteForCustomer(
  input: SanitizedQuoteTranslatorInput
): Promise<QuoteTranslationResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return buildLocalQuoteTranslationFallback(input);
  }
  if (!hasGeminiByokKey()) {
    throw new Error('Chave API Gemini (BYOK) não configurada neste dispositivo.');
  }

  const { ai } = await createGenAiSdkClient();

  const payload = {
    os: input.orderCode,
    aparelho: input.device,
    situacao: input.status,
    defeitoRelatado: scrubAccidentalIdentifiers(input.issue),
    servicoPrevisto: input.serviceName || '',
    detalhesTecnicos: scrubAccidentalIdentifiers(input.technicalNotes || ''),
    itensAdicionais: input.items,
    valorServicoR$: input.servicePrice,
    valorPecasLegadoR$: input.partsPrice,
    taxaEntregaR$: input.deliveryFee,
    descontoR$: input.discount,
    valorTotalR$: input.totalAmount,
    jaPagoR$: input.paidAmount,
    saldoRestanteR$: Math.max(0, Math.round((input.totalAmount - input.paidAmount) * 100) / 100),
    garantiaDias: input.warrantyDays,
  };

  try {
    const { data: response, modelUsed, isFallbackModel } = await callGeminiWithRetry(ai, (model) =>
      ai.models.generateContent({
        model,
        contents: [
          'Transforme os dados técnicos abaixo no corpo de uma mensagem cordial e clara para WhatsApp (sem saudação inicial com nome de pessoa, pois o sistema adicionará o nome do cliente localmente):',
          JSON.stringify(payload, null, 2),
        ].join('\n'),
        config: {
          systemInstruction: [
            'Você é o atendente técnico cordial da MicroLab Assistência Técnica.',
            'Sua tarefa é traduzir termos técnicos de bancada (ex.: reballing PMIC, oxidação na malha VBUS, troca de FPC, condução reversa, curto em linha primária, troca de módulo) para uma explicação simples, transparente e fácil de entender por qualquer cliente leigo no WhatsApp.',
            'Regras obrigatórias:',
            '1. NÃO inclua saudação com nome de pessoa (nem do cliente, nem do técnico — o sistema prefixará localmente com o nome do cliente da OS). Comece direto informando sobre a OS e o aparelho.',
            '2. Explique de forma acessível o que foi identificado e o que será feito no reparo.',
            '3. Informe claramente os valores (Total em R$, eventual desconto/entrega/sinal pago e saldo restante). Use APENAS formatação nativa de WhatsApp com asterisco simples (*texto*) para negrito moderado — NUNCA use asteriscos duplos (**texto**) ou Markdown.',
            '4. Informe o prazo de garantia previsto (ex.: 90 dias para o serviço executado).',
            '5. Convide o cliente a responder confirmando a aprovação ou tirando dúvidas. Texto pronto para envio, sem comentários extras.',
          ].join(' '),
        },
      })
    );

    const text = sanitizeWhatsAppBoldFormatting((response.text || '').trim());
    if (!text) {
      return buildLocalQuoteTranslationFallback(input);
    }
    return {
      bodyText: text,
      sourceMode: 'gemini',
      modelUsed,
      isFallbackModel,
    };
  } catch (err) {
    if (isModelFallbackableError(err)) {
      return buildLocalQuoteTranslationFallback(input);
    }
    throw new Error(formatGeminiError(err));
  }
}
