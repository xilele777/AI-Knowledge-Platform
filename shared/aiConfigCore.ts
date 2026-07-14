export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_MODEL = 'gpt-4o-mini'
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

export function normalizeBaseUrl(value: string | null | undefined): string {
  const trimmed = (value || DEFAULT_BASE_URL).trim()
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export function resolveDefaultModel(model: string | null | undefined): string {
  return (model || DEFAULT_MODEL).trim()
}
