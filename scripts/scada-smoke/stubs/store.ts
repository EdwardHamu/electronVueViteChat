/** @/store 的桩：组态页只用到 isLandscape（真实模块会拉进 @vueuse/core 等依赖） */
import { defineStore } from 'pinia'
export const useMain = defineStore('main', {
  state: () => ({ isLandscape: true }),
  actions: {
    setIsLandscape(v: boolean) {
      this.isLandscape = v
    }
  }
})
