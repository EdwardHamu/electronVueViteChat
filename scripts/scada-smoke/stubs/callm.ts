// 测试桩：模拟 src/utils/callm.ts 的 callBrige（走 window.chrome.webview.hostObjects.JsBridge）
export const callBrige = (cb: string, data?: any) => {
  const w = globalThis as any
  if (!w.chrome || !w.chrome.webview) return Promise.reject(null)
  const fn = w.chrome.webview.hostObjects.JsBridge[cb]
  if (!fn) return undefined
  return fn(data).then((res: string) => {
    const obj = JSON.parse(res)
    return obj.Code == 0 ? (obj.Data == null ? 1 : obj.Data) : null
  })
}
