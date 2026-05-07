export interface DocumentDraftPayload {
  title: string
  content: string
  savedAt: number
}

const DRAFT_KEY_PREFIX = 'doc_draft_v1'

function buildDraftKey(documentId: string): string {
  return `${DRAFT_KEY_PREFIX}:${documentId}`
}

export function readDocumentDraft(documentId: string): DocumentDraftPayload | null {
  if (!documentId) {
    return null
  }

  try {
    const raw = localStorage.getItem(buildDraftKey(documentId))

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<DocumentDraftPayload>

    if (
      typeof parsed.title !== 'string' ||
      typeof parsed.content !== 'string' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null
    }

    return {
      title: parsed.title,
      content: parsed.content,
      savedAt: parsed.savedAt,
    }
  } catch {
    return null
  }
}

export function writeDocumentDraft(documentId: string, title: string, content: string): void {
  if (!documentId) {
    return
  }

  const payload: DocumentDraftPayload = {
    title,
    content,
    savedAt: Date.now(),
  }

  localStorage.setItem(buildDraftKey(documentId), JSON.stringify(payload))
}

export function clearDocumentDraft(documentId: string): void {
  if (!documentId) {
    return
  }

  localStorage.removeItem(buildDraftKey(documentId))
}