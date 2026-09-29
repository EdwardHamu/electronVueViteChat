// 测试桩：模拟 src/utils/callm.ts 的 callBrige（走 window.chrome.webview.hostObjects.JsBridge）
// multi=true 时 data 为参数数组，按位展开传给宿主方法（与真实实现一致，如 SaveResourceFile(fileName, base64)）
export const callBrige = (cb: string, data?: any, multi = false) => {
  const w = globalThis as any
  if (!w.chrome || !w.chrome.webview) return Promise.reject(null)
  const fn = w.chrome.webview.hostObjects.JsBridge[cb]
  if (!fn) return undefined
  const p = multi ? fn(...(Array.isArray(data) ? data : [data])) : fn(data)
  return p.then((res: string) => {
    const obj = JSON.parse(res)
    return obj.Code == 0 ? (obj.Data == null ? 1 : obj.Data) : null
  })
}
