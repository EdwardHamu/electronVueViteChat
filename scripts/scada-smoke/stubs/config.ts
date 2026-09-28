import { defineStore } from 'pinia'
export const useConfigStore = defineStore('config', {
  state: () => ({
    sysConfig: {} as Record<string, any>,
    curEnableFormulaParamList: [] as any[]
  })
})
