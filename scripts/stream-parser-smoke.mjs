function extractTextFromUnknownContent(content) {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return ''
      }

      if (typeof item.text === 'string') {
        return item.text
      }

      if (typeof item.content === 'string') {
        return item.content
      }

      if (item.delta && typeof item.delta === 'object' && typeof item.delta.text === 'string') {
        return item.delta.text
      }

      return ''
    })
    .join('')
}

function extractFirstDeepText(node, depth = 0) {
  if (depth > 8 || node == null) {
    return ''
  }

  if (typeof node === 'string') {
    const text = node.trim()
    if (!text || text.length <= 3) {
      return ''
    }
    return text
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractFirstDeepText(item, depth + 1)
      if (found) {
        return found
      }
    }
    return ''
  }

  if (typeof node !== 'object') {
    return ''
  }

  const prioritizedKeys = ['content', 'text', 'output_text', 'answer', 'response', 'message', 'result']
  for (const key of prioritizedKeys) {
    if (key in node) {
      const found = extractFirstDeepText(node[key], depth + 1)
      if (found) {
        return found
      }
    }
  }

  for (const value of Object.values(node)) {
    const found = extractFirstDeepText(value, depth + 1)
    if (found) {
      return found
    }
  }

  return ''
}

function extractTextFromCompletionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const directOutput = extractTextFromUnknownContent(payload.output_text)
  if (directOutput) {
    return directOutput
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : []
  for (const item of choices) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const fromMessage = extractTextFromUnknownContent(item?.message?.content)
    if (fromMessage) {
      return fromMessage
    }

    const fromText = extractTextFromUnknownContent(item.text)
    if (fromText) {
      return fromText
    }
  }

  const deepFallback = extractFirstDeepText(payload)
  if (deepFallback) {
    return deepFallback
  }

  return ''
}

const cases = [
  {
    name: 'OpenAI non-stream standard',
    payload: {
      choices: [{ message: { content: '这是标准 message.content 文本' } }],
    },
    expected: true,
  },
  {
    name: 'Provider output_text array',
    payload: {
      output_text: [{ text: '这是 output_text 文本' }],
    },
    expected: true,
  },
  {
    name: 'Provider custom nested response',
    payload: {
      data: {
        result: {
          answer: '这是深层 answer 文本',
        },
      },
    },
    expected: true,
  },
  {
    name: 'Empty payload',
    payload: {
      id: 'abc',
      created: 123,
    },
    expected: false,
  },
]

let passCount = 0
for (const item of cases) {
  const text = extractTextFromCompletionPayload(item.payload)
  const passed = item.expected ? Boolean(text) : !text
  if (!passed) {
    console.error(`[FAIL] ${item.name} =>`, text)
    process.exitCode = 1
  } else {
    console.log(`[PASS] ${item.name} =>`, text || '<empty>')
    passCount += 1
  }
}

console.log(`Summary: ${passCount}/${cases.length} passed`)
