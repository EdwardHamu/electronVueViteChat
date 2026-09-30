/**
 * 虚拟键盘冒烟测试用的 @/store/config 桩：只保留键盘用到的 sysConfig（InputType =「触摸键盘输入」开关）。
 * 真实模块会拉进宿主通信、echarts 等整套依赖。
 */
import { defineStore } from 'pinia'
export const useConfigStore = defineStore('config', {
  state: () => ({
    sysConfig: { InputType: 0 } as Record<string, any>
  })
})
