export interface MenuItem {
  index: string
  title: string
  icon: string
  requiresAdmin?: boolean
}

export interface MenuGroup {
  label: string
  items: MenuItem[]
}

export const mainMenuGroups: MenuGroup[] = [
  {
    label: '工作台',
    items: [
      { index: '/dashboard', title: '总览', icon: 'HomeFilled' },
    ],
  },
  {
    label: '内容',
    items: [
      { index: '/docs', title: '文档', icon: 'Document' },
      { index: '/knowledge', title: '知识库', icon: 'Collection' },
      { index: '/chat', title: '问答', icon: 'ChatDotRound' },
      { index: '/shared', title: '共享广场', icon: 'Share' },
    ],
  },
  {
    label: '系统',
    items: [
      { index: '/admin', title: '管理后台', icon: 'DataAnalysis', requiresAdmin: true },
      { index: '/profile', title: '个人中心', icon: 'User' },
    ],
  },
]

export const mainMenus: MenuItem[] = mainMenuGroups.flatMap((g) => g.items)

export const adminMenuGroups: MenuGroup[] = [
  {
    label: '后台模块',
    items: [
      { index: '/admin/dashboard', title: '数据大屏', icon: 'DataAnalysis' },
      { index: '/admin/users', title: '用户管理', icon: 'User' },
      { index: '/admin/docs', title: '文档管理', icon: 'Document' },
      { index: '/admin/files', title: '文件管理', icon: 'Folder' },
      { index: '/admin/operation-logs', title: '操作日志', icon: 'HomeFilled' },
    ],
  },
]

export const adminMenus: MenuItem[] = adminMenuGroups.flatMap((g) => g.items)
