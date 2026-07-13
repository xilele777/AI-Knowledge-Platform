import { cosineSimilarity } from '../../../shared/rag/similarityCore.ts'
import { fuseRetrievedChunks } from '../../../shared/rag/fuseRetrievalCore.ts'
import {
  hasValuableRetrievedChunks,
  retrieveRelevantChunks,
  type RetrieveChunkInput,
  type RetrievedChunk,
} from '../../../shared/rag/retrieveChunksCore.ts'
import {
  matchKnowledgeChunksByVector,
  type RagChunk,
} from './ragChunks.ts'
import type { AiChatSourceChunk } from '../../../src/types/ai.ts'

export type RagRetrievedChunk = RetrievedChunk<RetrieveChunkInput & {
  id: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number
}>

function toRetrieveInput(chunk: RagChunk): RetrieveChunkInput & {
  id: string
  fileId: string | null
  documentId: string | null
  sourceType: 'file' | 'document'
  sourceName: string | null
  chunkIndex: number
} {
  return {
    id: chunk.id,
    fileId: chunk.fileId,
    documentId: chunk.documentId,
    sourceType: chunk.sourceType,
    sourceName: chunk.sourceName,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
  }
}

function hasValuableVectorChunks(chunks: RagRetrievedChunk[]): boolean {
  if (chunks.length === 0) return false
  const topScore = chunks[0]?.score ?? 0
  const averageScore = chunks.reduce((total, item) => total + item.score, 0) / chunks.length
  return topScore >= 0.2 && averageScore >= 0.12
}

function toSourceChunks(items: RagRetrievedChunk[]): AiChatSourceChunk[] {
  return items.map((item) => ({
    chunkId: String(item.id ?? ''),
    fileId: typeof item.fileId === 'string' ? item.fileId : null,
    documentId: typeof item.documentId === 'string' ? item.documentId : null,
    sourceType: item.sourceType === 'document' ? 'document' : 'file',
    sourceName: typeof item.sourceName === 'string' ? item.sourceName : null,
    chunkIndex: typeof item.chunkIndex === 'number' ? item.chunkIndex : null,
    content: String(item.content ?? ''),
    score: item.score,
    matchedKeywords: item.matchedKeywords,
  }))
}

export async function selectKnowledgeSources(input: {
  authHeader: string
  knowledgeBaseId: string
  question: string
  chunks: RagChunk[]
  queryEmbedding: number[] | null
}): Promise<{ mode: 'general-ai' | 'knowledge-enhanced'; sources: AiChatSourceChunk[] }> {
  const retrieveInputs = input.chunks.map(toRetrieveInput)

  let vectorResults: RagRetrievedChunk[] = []
  if (input.queryEmbedding) {
    try {
      const matched = await matchKnowledgeChunksByVector(
        input.authHeader,
        input.knowledgeBaseId,
        input.queryEmbedding,
        8,
      )
      vectorResults = matched.map((chunk) => ({
        ...toRetrieveInput(chunk),
        score: chunk.score,
        hitCount: 0,
        matchedKeywords: [],
      }))
    } catch {
      vectorResults = input.chunks
        .filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === input.queryEmbedding!.length)
        .map((chunk) => ({
          ...toRetrieveInput(chunk),
          score: cosineSimilarity(input.queryEmbedding!, chunk.embedding as number[]),
          hitCount: 0,
          matchedKeywords: [],
        }))
        .filter((chunk) => chunk.score >= 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    }
  }

  const keywordResults = retrieveRelevantChunks(input.question, retrieveInputs, {
    topK: 8,
    minScore: 0.03,
  }) as RagRetrievedChunk[]

  const vectorValuable = hasValuableVectorChunks(vectorResults)
  const keywordValuable = hasValuableRetrievedChunks(keywordResults, {
    minTopScore: 0.1,
    minHitCount: 2,
    minAverageScore: 0.06,
  })

  let retrieved: RagRetrievedChunk[] = []
  if (vectorResults.length > 0 && keywordResults.length > 0) {
    retrieved = fuseRetrievedChunks(vectorResults, keywordResults, { topK: 5 }) as RagRetrievedChunk[]
  } else if (vectorResults.length > 0) {
    retrieved = vectorResults.slice(0, 5)
  } else {
    retrieved = keywordResults.slice(0, 5)
  }

  const hasValuableSources = retrieved.length > 0 && (vectorValuable || keywordValuable)
  return {
    mode: hasValuableSources ? 'knowledge-enhanced' : 'general-ai',
    sources: hasValuableSources ? toSourceChunks(retrieved) : [],
  }
}
