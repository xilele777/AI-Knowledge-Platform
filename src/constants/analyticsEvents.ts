export const ANALYTICS_EVENTS = {
  LOGIN_SUCCESS: 'login_success',
  REGISTER_SUCCESS: 'register_success',
  DOCUMENT_CREATE: 'document_create',
  DOCUMENT_DELETE: 'document_delete',
  DOCUMENT_SAVE: 'document_save',
  KNOWLEDGE_BASE_CREATE: 'knowledge_base_create',
  FILE_UPLOAD: 'file_upload',
  SHARED_DOC_VIEW: 'shared_doc_view',
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

export const ANALYTICS_EVENT_LABELS: Partial<Record<AnalyticsEventName | string, string>> = {
  [ANALYTICS_EVENTS.LOGIN_SUCCESS]: '登录成功',
  [ANALYTICS_EVENTS.REGISTER_SUCCESS]: '注册成功',
  [ANALYTICS_EVENTS.DOCUMENT_CREATE]: '新增文档',
  [ANALYTICS_EVENTS.DOCUMENT_DELETE]: '删除文档',
  [ANALYTICS_EVENTS.DOCUMENT_SAVE]: '保存文档',
  [ANALYTICS_EVENTS.KNOWLEDGE_BASE_CREATE]: '新建知识库',
  [ANALYTICS_EVENTS.FILE_UPLOAD]: '上传文件',
  [ANALYTICS_EVENTS.SHARED_DOC_VIEW]: '查看共享文档',
  [ANALYTICS_EVENTS.QA_SEND]: '发起问答',
  [ANALYTICS_EVENTS.AI_WRITING_CALL]: 'AI 写作调用',
  [ANALYTICS_EVENTS.PERF_WEB_VITALS]: '页面性能上报',
  delete_document: '删除文档',
  set_document_shared: '切换文档共享',
  delete_knowledge_file: '删除知识文件',
  create_user: '添加用户',
  set_user_role: '修改用户角色',
  ban_user: '封禁用户',
  unban_user: '解封用户',
  delete_user: '删除用户',
  delete_chat: '删除会话',
  delete_chat_message: '删除消息',
}

export function getAnalyticsEventLabel(eventName: string): string {
  return ANALYTICS_EVENT_LABELS[eventName] || eventName
}
