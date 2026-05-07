export const ANALYTICS_EVENTS = {
  LOGIN_SUCCESS: 'login_success',
  REGISTER_SUCCESS: 'register_success',
  DOCUMENT_CREATE: 'document_create',
  DOCUMENT_DELETE: 'document_delete',
  DOCUMENT_SAVE: 'document_save',
  KNOWLEDGE_BASE_CREATE: 'knowledge_base_create',
  FILE_UPLOAD: 'file_upload',
  QA_SEND: 'qa_send',
  AI_WRITING_CALL: 'ai_writing_call',
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
