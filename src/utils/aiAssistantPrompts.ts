export type AiAssistantAction = 'polish' | 'expand' | 'summarize' | 'continue'

type ActionOption = {
  value: AiAssistantAction
  label: string
  prompt: string
  description: string
}

export const aiAssistantActionOptions: ActionOption[] = [
  {
    value: 'polish',
    label: '润色',
    prompt: '你是中文写作助手。请在不改变原意的前提下润色文本，使其更专业、更自然。',
    description: '优化措辞与语气，保持原意不变。',
  },
  {
    value: 'expand',
    label: '扩写',
    prompt: '你是中文写作助手。请在保留核心观点的前提下扩写文本，补充细节与论据。',
    description: '补充细节、案例与解释。',
  },
  {
    value: 'summarize',
    label: '总结',
    prompt: '你是中文写作助手。请提炼文本要点并输出简洁总结。',
    description: '提炼重点，输出简短摘要。',
  },
  {
    value: 'continue',
    label: '续写',
    prompt: '你是中文写作助手。请保持原文语气与逻辑，续写后续内容。',
    description: '延续上下文继续写作。',
  },
]

export function getAiAssistantPrompt(action: AiAssistantAction): string {
  const matched = aiAssistantActionOptions.find((item) => item.value === action)
  return matched?.prompt || aiAssistantActionOptions[0].prompt
}
