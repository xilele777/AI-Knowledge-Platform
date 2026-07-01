import type { App, Component } from 'vue'
import {
  ElAlert,
  ElAside,
  ElAvatar,
  ElButton,
  ElCard,
  ElCol,
  ElContainer,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElLoading,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRow,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElUpload,
} from 'element-plus'

const components = [
  ElAlert,
  ElAside,
  ElAvatar,
  ElButton,
  ElCard,
  ElCol,
  ElContainer,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRow,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElUpload,
] satisfies Component[]

export function installElementPlus(app: App) {
  for (const component of components) {
    if (component.name) {
      app.component(component.name, component)
    }
  }

  app.use(ElLoading)
}
