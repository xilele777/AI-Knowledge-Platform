export interface MenuItem {
  index: string
  title: string
  icon: string
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
    ],
  },
  {
    label: '社区',
    items: [
      { index: '/shared', title: '共享广场', icon: 'Share' },
    ],
  },
  {
    label: '个人',
    items: [
      { index: '/profile', title: '个人中心', icon: 'User' },
    ],
  },
]

/** 扁平化菜单列表（向后兼容） */
export const mainMenus: MenuItem[] = mainMenuGroups.flatMap((g) => g.items)

export const adminMenuGroups: MenuGroup[] = [
  {
    label: '管理',
    items: [
      { index: '/admin', title: '后台首页', icon: 'HomeFilled' },
      { index: '/admin/users', title: '用户管理', icon: 'User' },
      { index: '/admin/docs', title: '文档管理', icon: 'Document' },
      { index: '/admin/files', title: '文件管理', icon: 'Folder' },
      { index: '/admin/chats', title: '问答管理', icon: 'ChatLineSquare' },
      { index: '/admin/analytics', title: '统计分析', icon: 'DataAnalysis' },
    ],
  },
]

/** 扁平化菜单列表（向后兼容） */
export const adminMenus: MenuItem[] = adminMenuGroups.flatMap((g) => g.items)
