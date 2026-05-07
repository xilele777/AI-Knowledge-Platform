export interface ChunkTextOptions {
  minLength?: number
  maxLength?: number
}

export interface TextChunk {
  index: number
  content: string
  length: number
}

const DEFAULT_MIN_LENGTH = 300
const DEFAULT_MAX_LENGTH = 500

function normalizeText(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
}

function splitParagraphs(content: string): string[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  if (paragraphs.length) {
    return paragraphs
  }

  return content
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function splitSentenceByPunctuation(text: string): string[] {
  const segments = text
    .split(/(?<=[。！？!?；;\.])\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  if (segments.length) {
    return segments
  }

  return [text]
}

function hardSplit(text: string, maxLength: number): string[] {
  const result: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    result.push(text.slice(cursor, cursor + maxLength))
    cursor += maxLength
  }

  return result
}

export function chunkText(content: string, options: ChunkTextOptions = {}): TextChunk[] {
  const minLength = Math.max(50, options.minLength ?? DEFAULT_MIN_LENGTH)
  const maxLength = Math.max(minLength, options.maxLength ?? DEFAULT_MAX_LENGTH)

  const normalized = normalizeText(content)

  if (!normalized) {
    return []
  }

  const paragraphs = splitParagraphs(normalized)
  const bucket: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      bucket.push(paragraph)
      continue
    }

    const bySentence = splitSentenceByPunctuation(paragraph)

    for (const sentence of bySentence) {
      if (sentence.length <= maxLength) {
        bucket.push(sentence)
        continue
      }

      const byHardSplit = hardSplit(sentence, maxLength)
      bucket.push(...byHardSplit)
    }
  }

  const merged: string[] = []
  let current = ''

  for (const segment of bucket) {
    if (!current) {
      current = segment
      continue
    }

    const joined = current + '\n' + segment

    if (joined.length <= maxLength) {
      current = joined
      continue
    }

    merged.push(current)
    current = segment
  }

  if (current) {
    merged.push(current)
  }

  if (merged.length >= 2) {
    for (let i = 0; i < merged.length - 1; i += 1) {
      if (merged[i].length >= minLength) {
        continue
      }

      const combined = merged[i] + '\n' + merged[i + 1]
      if (combined.length <= maxLength) {
        merged[i] = combined
        merged.splice(i + 1, 1)
        i = Math.max(-1, i - 1)
      }
    }
  }

  return merged.map((item, index) => ({
    index,
    content: item,
    length: item.length,
  }))
}
