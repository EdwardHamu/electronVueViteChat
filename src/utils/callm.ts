import { useConfigStore } from "@/store/config"
import { ActualResult, SysConfigEntity } from "~/me"
import { resultProcess } from "./call";
import { callFnName } from "./enum";
import { safeJsonParse } from "./utils"
import { isDemoMode, makeFakeDataValue } from "./demoData"


export const callBrige = (cb: string, data?: any, multi: boolean = false) => {
  // 展示模式：开启后不再采集真数据，GetRealtimeData 一律直接返回随机假数据（5位小数，按变量配置的范围）
  if (cb == callFnName.GetRealtimeData && data && isDemoMode()) {
    return Promise.resolve(makeFakeDataValue(String(data)))
  }
  // console.log("🪵 [callm.ts:14] ~ token ~ \x1b[0;32mcb\x1b[0m = ", cb);
  // if (cb == callFnName.InitService) {
  //   console.error('callm.ts:16 ~ callBrige ~ cb', cb);
  // }
  if (!window.chrome || !window.chrome.webview) {
    return new Promise((resolve, reject) => {
      reject(null)
    })
  }
  const bridge = window.chrome.webview.hostObjects.JsBridge;
  // console.log("🪵 [callm.ts:10] ~ token ~ \x1b[0;32mbridge\x1b[0m = ", bridge);
  let str = null;
  if (data) {
    if (typeof data == 'object') {
      str = JSON.stringify(data)
    }
    if (typeof data == 'string') {
      str = data
    }
    if (typeof data == 'number') {
      str = data
    }
  }
  // console.log("🪵 [callm.ts:27] ~ token ~ \x1b[0;32mstr\x1b[0m = ", str);
  let fn = bridge[cb]
  if (fn) {
    let fnRun;
    if (multi) {
      fnRun = fn(...data)
    } else {
      fnRun = str ? fn(str) : fn()
    }
    // console.log("🪵 [callm.ts:34] ~ token ~ \x1b[0;32mfnRun\x1b[0m = ", fnRun);
    return fnRun.then((res: any) => {
      let resObj = safeJsonParse(res) as ActualResult
      if (cb != callFnName.GetRealtimeData && cb != callFnName.GetChartData && cb != callFnName.GetDistributionData) {
        console.log("🪵 [callm.ts:35] ~ token ~ \x1b[0;32mresObj\x1b[0m = ", cb, resObj);
      }
      return resultProcess(resObj, cb)
    }).catch((err: any) => {
      console.error(cb, err)
      if (cb == callFnName.GetRealtimeData) {

      } else {
        window.$message.error(err)
      }
    });
  }
}
// return bridge[cb] && bridge[cb]().then((res: string) => {
//   let resObj = safeJsonParse(res) as ActualResult
//   // console.log("🪵 [callm.ts:16] ~ token ~ \x1b[0;32mres\x1b[0m = ", resObj);
//   return resultProcess(resObj)
// }).catch((err: any) => {
//   console.error(err)
//   window.$message.error(err)
// });
// }