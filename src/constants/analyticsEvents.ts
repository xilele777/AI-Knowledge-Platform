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
  /** Web Vitals 现场指标（LCP / CLS / INP 近似），页面首次隐藏时上报 */
  PERF_WEB_VITALS: 'perf_web_vitals',
  /** AI 问答链路分段耗时（检索 / TTFT / 流式时长） */
  QA_PERF: 'qa_perf',
  /** 前端运行时错误（window.onerror / unhandledrejection / Vue errorHandler） */
  FE_ERROR: 'fe_error',
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
