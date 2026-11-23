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
export const GEMINI_MODEL_ID = 'gemini-2.5-flash';

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

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || '');
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

async function createGenAiSdkClient(explicitKey?: string) {
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
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
      contents: 'Responda apenas com a palavra: OK',
    });
    const text = (response.text || '').trim();
    const latencyMs = Date.now() - started;
    if (!text) {
      return { ok: false, message: 'A API respondeu sem conteúdo. Verifique sua chave.' };
    }
    return {
      ok: true,
      latencyMs,
      message: `Chave válida! Conexão confirmada com ${GEMINI_MODEL_ID} (${latencyMs} ms).`,
    };
  } catch (err) {
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
}

export async function extractDeviceAndImeiFromPhoto(file: File): Promise<LabelOcrResult> {
  const { ai, Type } = await createGenAiSdkClient();
  const { base64Data, mimeType } = await compressLabelImageInMemory(file, 1024);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
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
    });

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
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
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
    });

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
    };
  } catch (err) {
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

/**
 * Traduz jargão técnico de bancada para mensagem acessível de WhatsApp.
 * LGPD: Não recebe nome, telefone, CPF ou senhas do cliente. A saudação com nome é anexada localmente após a resposta.
 */
export async function translateQuoteForCustomer(
  input: SanitizedQuoteTranslatorInput
): Promise<string> {
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
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_ID,
      contents: [
        'Transforme os dados técnicos abaixo no corpo de uma mensagem cordial e clara para WhatsApp (sem saudação inicial com nome do cliente, pois o sistema adicionará o nome localmente):',
        JSON.stringify(payload, null, 2),
      ].join('\n'),
      config: {
        systemInstruction: [
          'Você é o atendente técnico cordial da MicroLab Assistência Técnica.',
          'Sua tarefa é traduzir termos técnicos de bancada (ex.: reballing PMIC, oxidação na malha VBUS, troca de FPC, condução reversa, curto em linha primária, troca de módulo) para uma explicação simples, transparente e fácil de entender por qualquer cliente leigo no WhatsApp.',
          'Regras obrigatórias:',
          '1. NÃO inclua saudação com nome de pessoa (o sistema vai prefixar localmente). Comece direto informando sobre a OS e o aparelho.',
          '2. Explique de forma acessível o que foi identificado e o que será feito no reparo.',
          '3. Informe claramente os valores (Total em R$, eventual desconto/entrega/sinal pago e saldo restante). Use formatação amigável de WhatsApp (*negrito* moderado).',
          '4. Informe o prazo de garantia previsto (ex.: 90 dias para o serviço executado).',
          '5. Convide o cliente a responder confirmando a aprovação ou tirando dúvidas. Texto pronto para envio, sem comentários extras.',
        ].join(' '),
      },
    });

    const text = (response.text || '').trim();
    if (!text) {
      throw new Error('O modelo retornou uma mensagem vazia.');
    }
    return text;
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }
}
