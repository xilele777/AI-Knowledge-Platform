export interface MenuItem {
  index: string
  title: string
}

export const mainMenus: MenuItem[] = [
  { index: '/docs', title: '文档' },
  { index: '/shared', title: '共享广场' },
  { index: '/knowledge', title: '知识库' },
  { index: '/chat', title: '问答' },
  { index: '/profile', title: '个人中心' },
]

export const adminMenus: MenuItem[] = [
  { index: '/admin', title: '后台首页' },
  { index: '/admin/users', title: '用户管理' },
  { index: '/admin/docs', title: '文档管理' },
  { index: '/admin/files', title: '文件管理' },
  { index: '/admin/chats', title: '问答管理' },
  { index: '/admin/analytics', title: '统计分析' },
]