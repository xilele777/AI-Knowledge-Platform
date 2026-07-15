import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DocumentListItem } from '../types/document'
import type { KnowledgeBaseListItem } from '../types/knowledge'
import type { ChatListItem } from '../types/chat'

const DEFAULT_TTL_MS = 45_000

type CacheBucket<T> = {
  data: T
  updatedAt: number
  ttlMs: number
}

type CacheKind = 'documents' | 'knowledgeBases' | 'chats'

type Revalidator = (() => Promise<void>) | null

export const useListCacheStore = defineStore('listCache', () => {
  const documents = ref<CacheBucket<DocumentListItem[]> | null>(null)
  const knowledgeBases = ref<CacheBucket<KnowledgeBaseListItem[]> | null>(null)
  const chats = ref<CacheBucket<ChatListItem[]> | null>(null)

  const documentRevalidator = ref<Revalidator>(null)
  const knowledgeBaseRevalidator = ref<Revalidator>(null)
  const chatRevalidator = ref<Revalidator>(null)

  function now() {
    return Date.now()
  }

  function isFresh<T>(bucket: CacheBucket<T> | null): bucket is CacheBucket<T> {
    if (!bucket) {
      return false
    }

    return now() - bucket.updatedAt < bucket.ttlMs
  }

  function getData<T>(bucket: CacheBucket<T> | null): T | null {
    return bucket?.data ?? null
  }

  function setDocuments(data: DocumentListItem[], ttlMs = DEFAULT_TTL_MS) {
    documents.value = { data, updatedAt: now(), ttlMs }
  }

  function setKnowledgeBases(data: KnowledgeBaseListItem[], ttlMs = DEFAULT_TTL_MS) {
    knowledgeBases.value = { data, updatedAt: now(), ttlMs }
  }

  function setChats(data: ChatListItem[], ttlMs = DEFAULT_TTL_MS) {
    chats.value = { data, updatedAt: now(), ttlMs }
  }

  function invalidate(kind: CacheKind) {
    if (kind === 'documents') {
      documents.value = null
      return
    }

    if (kind === 'knowledgeBases') {
      knowledgeBases.value = null
      return
    }

    chats.value = null
  }

  function registerRevalidator(kind: CacheKind, revalidator: () => Promise<void>) {
    if (kind === 'documents') {
      documentRevalidator.value = revalidator
      return
    }

    if (kind === 'knowledgeBases') {
      knowledgeBaseRevalidator.value = revalidator
      return
    }

    chatRevalidator.value = revalidator
  }

  function removeDocument(id: string) {
    if (!documents.value) {
      return
    }

    documents.value = {
      ...documents.value,
      data: documents.value.data.filter((doc) => doc.id !== id),
      updatedAt: now(),
    }
  }

  function patchKnowledgeBase(item: KnowledgeBaseListItem) {
    if (!knowledgeBases.value) {
      return
    }

    const next = knowledgeBases.value.data.filter((kb) => kb.id !== item.id)
    knowledgeBases.value = {
      ...knowledgeBases.value,
      data: [item, ...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      updatedAt: now(),
    }
  }

  function removeKnowledgeBase(id: string) {
    if (!knowledgeBases.value) {
      return
    }

    knowledgeBases.value = {
      ...knowledgeBases.value,
      data: knowledgeBases.value.data.filter((kb) => kb.id !== id),
      updatedAt: now(),
    }
  }

  function removeChat(id: string) {
    if (!chats.value) {
      return
    }

    chats.value = {
      ...chats.value,
      data: chats.value.data.filter((chat) => chat.id !== id),
      updatedAt: now(),
    }
  }

  return {
    documents,
    knowledgeBases,
    chats,
    getData,
    isFresh,
    setDocuments,
    setKnowledgeBases,
    setChats,
    invalidate,
    registerRevalidator,
    patchKnowledgeBase,
    removeDocument,
    removeKnowledgeBase,
    removeChat,
  }
})
