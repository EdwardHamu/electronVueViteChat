/** @/store 的桩：组态页只用到 isLandscape 与虚拟键盘开关（真实模块会拉进 @vueuse/core 等依赖） */
import { defineStore } from 'pinia'
export const useMain = defineStore('main', {
  state: () => ({ isLandscape: true, globalKeyBoardShow: false, globalKeyBoardBlocked: false }),
  actions: {
    setIsLandscape(v: boolean) {
      this.isLandscape = v
    },
    setGlobalKeyBoardShow(v: boolean) {
      this.globalKeyBoardShow = v
    },
    setGlobalKeyBoardBlocked(v: boolean) {
      this.globalKeyBoardBlocked = v
    }
  }
})
