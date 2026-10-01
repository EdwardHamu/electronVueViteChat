/**
 * 冒烟测试用的 @/utils/callm 桩：宿主 JsBridge 调用交给测试脚本设置的 globalThis.__callBrige(name, data)，没设置时返回空数组。
 */
export const callBrige = (cb: string, data?: any, _multi: boolean = false): Promise<any> => {
  const fn = (globalThis as any).__callBrige
  return Promise.resolve(fn ? fn(cb, data) : [])
}
