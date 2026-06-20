/**
 * Tavily API client (Main process only).
 *
 * Faz chamadas HTTP para https://api.tavily.com a partir do Main process.
 * O renderer NÃO pode chamar APIs externas diretamente (CSP `connect-src`
 * restrito). As tools AI (`web_search`, `web_extract`) consomem este cliente.
 */

const TAVILY_BASE_URL = 'https://api.tavily.com';
const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Tipos de resposta ────────────────────────────────────────────
export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  /** Resposta sintetizada pela Tavily (quando include_answer=true). */
  answer?: string;
  /** Resultados ranqueados por relevância. */
  results: TavilyResult[];
  /** Tempo de resposta em segundos. */
  responseTime?: number;
}

export interface TavilyExtractResult {
  url: string;
  /** Conteúdo limpo em markdown/plain text. */
  rawContent: string;
  images?: string[];
}

/** Shape cru retornado pela API (pode usar snake_case em alguns campos). */
interface TavilyExtractResultRaw {
  url: string;
  rawContent?: string;
  raw_content?: string;
  images?: string[];
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  /** URLs que falharam ao extrair. */
  failed?: Array<{ url: string; error: string }>;
}

// ─── Erros ────────────────────────────────────────────────────────
export class TavilyError extends Error {
  readonly code: 'auth' | 'rate_limit' | 'timeout' | 'http' | 'network' | 'parse';
  readonly status?: number;

  constructor(
    code: TavilyError['code'],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = 'TavilyError';
    this.code = code;
    this.status = status;
  }
}

// ─── Helper interno ───────────────────────────────────────────────
interface RequestOptions {
  method: 'POST';
  body: Record<string, unknown>;
}

async function request<T>(endpoint: string, opts: RequestOptions, apiKey: string): Promise<T> {
  const url = `${TAVILY_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TavilyError('timeout', 'Tavily request timed out');
    }
    throw new TavilyError(
      'network',
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      detail = body.detail ?? body.message ?? '';
    } catch {
      // corpo não-JSON — ignora
    }
    if (res.status === 401 || res.status === 403) {
      throw new TavilyError(
        'auth',
        detail || 'Invalid Tavily API key',
        res.status,
      );
    }
    if (res.status === 429) {
      throw new TavilyError(
        'rate_limit',
        detail || 'Tavily rate limit exceeded',
        res.status,
      );
    }
    throw new TavilyError(
      'http',
      detail || `Tavily HTTP ${res.status}`,
      res.status,
    );
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new TavilyError(
      'parse',
      err instanceof Error ? err.message : 'Failed to parse Tavily response',
    );
  }
}

// ─── API pública ──────────────────────────────────────────────────

export interface TavilySearchParams {
  query: string;
  /** 'basic' (padrão, mais rápido) ou 'advanced' (mais rico). */
  searchDepth?: 'basic' | 'advanced';
  /** Número máximo de resultados (1-20). Padrão 8. */
  maxResults?: number;
  /** Sintetiza uma resposta inicial (custa quota extra). Padrão true. */
  includeAnswer?: boolean;
  /** Restringe a estes domínios (opcional). */
  includeDomains?: string[];
  /** Exclui estes domínios (opcional). */
  excludeDomains?: string[];
}

export async function tavilySearch(
  apiKey: string,
  params: TavilySearchParams,
): Promise<TavilySearchResponse> {
  if (!apiKey) {
    throw new TavilyError('auth', 'Tavily API key not provided');
  }
  const body: Record<string, unknown> = {
    query: params.query,
    search_depth: params.searchDepth ?? 'advanced',
    max_results: params.maxResults ?? 8,
    include_answer: params.includeAnswer ?? true,
  };
  if (params.includeDomains?.length) body.include_domains = params.includeDomains;
  if (params.excludeDomains?.length) body.exclude_domains = params.excludeDomains;

  const raw = await request<TavilySearchResponse>('/search', { method: 'POST', body }, apiKey);
  // Normaliza campos — a API usa snake_case externamente
  return {
    answer: raw.answer,
    responseTime: raw.responseTime,
    results: Array.isArray(raw.results)
      ? raw.results.map((r) => ({
          title: r.title ?? '',
          url: r.url,
          content: r.content ?? '',
          score: r.score,
        }))
      : [],
  };
}

export interface TavilyExtractParams {
  /** URLs para extrair conteúdo (máx 5 por chamada — limite prático). */
  urls: string[];
  /** Incluir imagens extraídas. Padrão false. */
  includeImages?: boolean;
}

export async function tavilyExtract(
  apiKey: string,
  params: TavilyExtractParams,
): Promise<TavilyExtractResponse> {
  if (!apiKey) {
    throw new TavilyError('auth', 'Tavily API key not provided');
  }
  if (!params.urls.length) {
    throw new TavilyError('http', 'No URLs provided to extract');
  }
  if (params.urls.length > 5) {
    throw new TavilyError('http', 'Tavily extract accepts at most 5 URLs per call');
  }

  const body: Record<string, unknown> = {
    urls: params.urls,
    include_images: params.includeImages ?? false,
  };

  const raw = await request<{ results: TavilyExtractResultRaw[]; failed?: Array<{ url: string; error: string }> }>(
    '/extract',
    { method: 'POST', body },
    apiKey,
  );
  return {
    results: Array.isArray(raw.results)
      ? raw.results.map((r) => ({
          url: r.url,
          rawContent: r.rawContent ?? r.raw_content ?? '',
          images: r.images,
        }))
      : [],
    failed: raw.failed,
  };
}
