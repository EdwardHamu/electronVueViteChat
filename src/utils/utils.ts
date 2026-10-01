import { useConfigStore } from "@/store/config";
import { ActualResult, DataConfigEntity, DataGroupEntity, DataValue, DeviceGroupEntity, DistributionModel, FormulaConfigEntity, FormulaParamEntity, ModbusAdressRow } from "~/me";
import { v4 as uuidv4 } from 'uuid';
import { callSpc } from "./call";
import { callFnName } from "./enum";
import { useSysCfgInnerDataStore } from "@/views/Home/config/sysConfig/innderData";
import { useMain } from "@/store";
import { Ref } from "vue";
import { propNameMap } from "@/views/Home/config/devConfig/enum";
import { callBrige } from "./callm";
import { menuIdSplit, menuPropEnum } from "@/views/Home/curcev/enum";
import { isKeyboardTarget, isTouchKeyboardEnabled } from "./virtualKeyboard";
import { useFormulaStore } from "@/store/formula";
import * as echarts from 'echarts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


const isLowResolution = () => {
  return screen.width <= 1440 || window.innerWidth <= 1440
}
function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const unique = (arr: []) => {
  return Array.from(new Set(arr))
}
// Simulate key press event
const simulateKeyPress = (keyCode: number) => {
  const event = new KeyboardEvent('keydown', { keyCode: keyCode });
  document.dispatchEvent(event);
}

const setLocalStorage = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const getLocalStorage = (key: string, def = {} as any) => {
  try {
    return JSON.parse(localStorage.getItem(key) as any) || def;
  } catch (error) {
    // 这里可以根据需要决定是否打印错误日志
    console.error("JSON 解析失败:", error);
    return def;
  }
  // return JSON.parse( || (def == -1 ? '{}' : def))
}
export { sleep, isLowResolution, capitalizeFirstLetter, unique, simulateKeyPress, setLocalStorage, getLocalStorage }

export const ajaxPromiseAll = <T extends Array<any>,>(list: any) => {
  return new Promise<T>((resolve, reject) => {
    return Promise.all(list).then(res => {
      resolve(res as T);
    }).catch(err => {
      reject(err);
    })
  })
}

export const generateUUID = () => {
  return uuidv4()
}

export const listenAltF5 = (cb: Function) => {
  document.addEventListener('keydown', function (event) {
    if (event.altKey && event.key === 'F5') {
      cb()
      // callSpc(callFnName.closeSpcSystem).then(() => {
      // })
    }
  })
}

export const showKeyBoard = () => {
  callSpc(callFnName.showKeyBoard).then(() => {
  })
}

export const getRegState = () => { //获取注册状态
  const SysCfgInnerData = useSysCfgInnerDataStore()
  // callSpc(callFnName.getRegisterState).then((e: ActualResult) => {
  //   // console.log("🚀 ~ callSpc ~ e:", e)
  //   if (e != null) {
  //     SysCfgInnerData.setRegState(true)
  //   } else {
  //     SysCfgInnerData.setRegState(false)
  //   }
  // })
}
export const focusToInput = (store: ReturnType<typeof useMain>) => {
  return sleep(50).then(() => {
    if (store.lastFocusedInput) {
      store.lastFocusedInput.focus()
      return sleep(50)
    }
  })
}

export const isSingleLetter = (str: string) => {
  return /^[A-Za-z]$/.test(str);
}

//main是shift这种按键，sec是普通按键
export const multiPressKey = (main: number, sec: number) => {
  callBrige(callFnName.KeyDown, main).then(() => {
    return callBrige(callFnName.KeyPress, sec)
  }).then(() => {
    return callBrige(callFnName.KeyUp, main)
  })
}

export const mapKeyAndTitle = (str: string) => {
  return {
    key: str,
    title: propNameMap[str]
  }
}

export const loopGet = (fn: () => Promise<any>, ms: number, isGettingRef: Ref<boolean>) => {
  fn().then(() => {
    return sleep(ms)
  }).then(() => {
    if (isGettingRef.value) {
      loopGet(fn, ms, isGettingRef)
    }
  })
}

/**
 * 当前是否屏蔽虚拟键盘：数据组态 tab 激活（store.globalKeyBoardBlocked）且
 * 系统配置（configStore.isShowConfig）、产品配方（formulaStore.show）、产品历史（configStore.productHistoryShow）这几个页面都没打开。
 * 这些页面是盖在 tab 上面的全屏层，打开时里面的输入框照常弹键盘。
 */
export const isKeyboardSuppressed = (store: ReturnType<typeof useMain>, configStore: ReturnType<typeof useConfigStore>) => {
  if (!store.globalKeyBoardBlocked) return false
  const overlayOpen = !!configStore.isShowConfig || !!configStore.productHistoryShow || !!useFormulaStore().show
  return !overlayOpen
}

export const listenAllInputFocus = (store: ReturnType<typeof useMain>, configStore: ReturnType<typeof useConfigStore>) => {
  /** 是否为这个输入框弹出虚拟键盘：由系统配置 InputType（「触摸键盘输入」开关）决定 */
  const tryOpen = (target: EventTarget | null) => {
    // 数据组态 tab 激活且系统配置 / 产品配方 / 产品历史页面都没打开：聚焦输入框不弹出
    if (isKeyboardSuppressed(store, configStore)) return
    // 键盘把内容写回输入框时会聚焦它，不能因此再弹一次
    if (store.keyboardCommitting) return
    if (!isKeyboardTarget(target)) return
    if (!isTouchKeyboardEnabled(configStore.sysConfig?.InputType)) return
    // 键盘已经为这个输入框开着：不重新打开 / 带入（焦点被别的组件拉回来时不会循环，也不丢输入区里正在编辑的内容）
    if (store.globalKeyBoardShow && store.keyboardTarget === target) return
    store.openGlobalKeyBoard(target)
  }
  document.addEventListener('focusin', (event) => tryOpen(event.target));
  // 输入框已经有焦点（关掉键盘后焦点还留在里面）时再点它不会有 focusin，这里补上
  document.addEventListener('click', (event) => {
    if (store.globalKeyBoardShow) return
    if (event.target && event.target === document.activeElement) tryOpen(event.target)
  });
}

export const listenLandscape = (store: ReturnType<typeof useMain>) => {
  //比较长宽比判断竖屏
  if (window.innerHeight > window.innerWidth) {
    store.setIsLandscape(false)
  } else {
    store.setIsLandscape(true)
  }
  return window.innerHeight > window.innerWidth

  // 竖屏查询
  const mediaQueryPortrait = window.matchMedia('(orientation: portrait)');
  // 横屏查询
  const mediaQueryLandscape = window.matchMedia('(orientation: landscape)');

  // 判断当前状态
  if (mediaQueryLandscape.matches) {
    console.log('当前是横屏');
    store.setIsLandscape(true)
  } else if (mediaQueryPortrait.matches) {
    console.log('当前是竖屏');
    store.setIsLandscape(false)
  }

  // 监听方向变化
  mediaQueryLandscape.addEventListener('change', (e) => {
    if (e.matches) {
      console.log('屏幕方向已变为横屏');
      store.setIsLandscape(true)
    }
  });

  mediaQueryPortrait.addEventListener('change', (e) => {
    if (e.matches) {
      console.log('屏幕方向已变为竖屏');
      store.setIsLandscape(false)
    }
  });
}

export const safeJsonParse = (str: string) => {
  let res = {}
  try {
    res = JSON.parse(str || '{}')
  } catch (error) {
    console.log(error)
  }
  return res
}

export const formatDate = (time: string | number | undefined, fmt = 'yyyy-MM-dd HH:mm:ss') => {
  if (!time) return ''
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  const map: Record<string, string> = {
    yyyy: date.getFullYear().toString(),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  }
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, matched => map[matched])
}

export const getRandomInt = (min: number, max: number) => {
  // Math.random() 生成 [0, 1) 之间的浮点数
  // (max - min + 1) 确定了范围内的整数个数
  // Math.floor 向下取整，保证结果是整数
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const buildMenuOpt = (e: DeviceGroupEntity, configStore: ReturnType<typeof useConfigStore>, isShow = false) => {
  const getChild = (dev: DeviceGroupEntity) => {
    let name = isShow ? callFnName.GetShowDataGroups : callFnName.GetChartDataGroups
    callBrige(name, dev.GId).then((res: DataGroupEntity[]) => {
      // console.log("🪵 [utils.ts:196] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
      if (!isShow) {
        res.forEach(e => {
          if (!configStore.chartDataGroupList.find(item => item.GId == e.GId)) {
            configStore.chartDataGroupList.push(e)
          }
        })
      }
      let list = res.map(e => {
        return {
          label: e.DataName,
          key: menuPropEnum.dataSource + menuIdSplit + e.GId + menuIdSplit + dev.GId,
          trueKey: e.GId,
          DataName: e.DataName,
          GId: e.GId,
          Unit: e.Unit,
          Precision: e.Precision,
          ParentId: dev.GId
        }
      })
      dat.children.push(...list)
    })
  }
  let dat = {
    label: e.DeviceName,
    key: menuPropEnum.dataSource + menuIdSplit + e.GId,
    trueKey: e.GId,
    DataName: e.DeviceName,
    GId: e.GId,
    DeviceClass: e.DeviceClass,
    children: [] as any[]
    // Unit: e.Unit,
    // Precision: e.Precision
  }
  getChild(e)
  return dat
}

export const updateFormulaConfig = (configStore: ReturnType<typeof useConfigStore>) => {
  callBrige(callFnName.GetFormulaConfigs, configStore.sysConfig.CurrentGroupId).then((res: FormulaConfigEntity[]) => {
    let item = res.find(e => e.GId == configStore.sysConfig.CurrentFormulaId)
    configStore.setCurEnableFormulaRow(item)
    return callBrige(callFnName.GetFormulaParams, item?.GId)
  }).then((res: FormulaParamEntity[]) => {
    configStore.setCurEnableFormulaParamList(res)
  })
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    // 如果已经在计时，则清除之前的计时器重新开始
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

export function throttle<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let previous = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - previous > wait) {
      func.apply(this, args);
      previous = now;
    }
  };
}

export const getAllDataUnderGroup = (configStore: ReturnType<typeof useConfigStore>) => {
  const curGroupId = configStore.sysConfig.CurrentGroupId
  let dataGroupList: DataGroupEntity[] = []
  return callBrige(callFnName.GetDeviceGroups, curGroupId).then((devList: DeviceGroupEntity[]) => {
    let reqList = devList.map(e => {
      return callBrige(callFnName.GetShowDataGroups, e.GId)
    })
    return ajaxPromiseAll(reqList)
  }).then((res: DataGroupEntity[][]) => {
    res.forEach(e => {
      dataGroupList.push(...e)
    })
    return dataGroupList
  })
}

type ExportRealtimeArg = string | number | (Partial<DataGroupEntity> & {
  id?: string,
  Id?: string,
  dataGroup?: DataGroupEntity
})

const exportChartWidth = 1440
const exportChartHeight = 464

const removeDataUrlPrefix = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/\w+;base64,/, '')
}

const parseExportDataGroupId = (arg: ExportRealtimeArg) => {
  if (typeof arg == 'string' || typeof arg == 'number') {
    return String(arg)
  }
  return arg?.id || arg?.Id || arg?.GId || arg?.dataGroup?.GId || ''
}

const parseExportDataGroup = (arg: ExportRealtimeArg, configStore: ReturnType<typeof useConfigStore>, dataGroupId: string) => {
  if (arg && typeof arg == 'object') {
    if (arg.dataGroup) {
      return arg.dataGroup
    }
    if (arg.GId || arg.DataName || arg.Unit || arg.Precision != undefined) {
      return {
        ...arg,
        GId: arg.GId || dataGroupId
      } as DataGroupEntity
    }
  }
  return configStore.chartDataGroupList.find(e => e.GId == dataGroupId)
}

const getChartDataForExport = async (dataGroupId: string): Promise<DataValue[]> => {
  const res = await callBrige(callFnName.GetChartData, [dataGroupId, exportChartWidth], true)
  if (!res) {
    return [] as DataValue[]
  }
  return res as DataValue[]
}

const createExportChartContainer = () => {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = exportChartWidth + 'px'
  container.style.height = exportChartHeight + 'px'
  container.style.backgroundColor = '#fff'
  document.body.appendChild(container)
  return container
}

const buildRealtimeExportOption = (
  dataGroup: DataGroupEntity | undefined,
  formulaParam: FormulaParamEntity | undefined,
  chartData: DataValue[]
) => {
  let upValue: number = formulaParam?.UpperTol || 0.1
  let downValue: number = formulaParam?.LowerTol || 0.1
  if (formulaParam) {
    const stand = Number(formulaParam.Standard || 0)
    upValue = stand + Number(formulaParam.UpperTol || 0)
    downValue = stand - Number(formulaParam.LowerTol || 0)
  }

  const list = chartData.map(e => {
    return [new Date(e.Intime).getTime(), Number(e.Value)]
  }).filter(e => !Number.isNaN(e[0]) && !Number.isNaN(e[1]))

  return {
    animation: false,
    title: {
      text: dataGroup?.DataName || '',
      left: '48%'
    },
    tooltip: {
      trigger: 'axis',
      formatter: function (params: any) {
        params = params[0]
        return '  ' + params.value[1]
      },
      axisPointer: {
        animation: false
      }
    },
    xAxis: {
      type: 'time',
      splitLine: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      max: function (value: any) {
        return (value.max + (formulaParam?.UpperTol || 0.1)).toFixed(3)
      },
      min: function (value: any) {
        let min = value.min
        if (value.min <= 0 && formulaParam) {
          // 上边界(与max函数保持一致的计算方式)与标准值的差值
          const upperBound = value.max + (formulaParam?.UpperTol || 0.1)
          const upperDiff = upperBound - (formulaParam?.Standard || 0)
          min = (formulaParam?.Standard || 0) - upperDiff
          return min.toFixed(3)
        }
        return (min - (formulaParam?.LowerTol || 0.1)).toFixed(3)
      },
      splitLine: {
        show: true
      },
      axisLabel: {
        formatter: '{value} ' + (dataGroup?.Unit || '')
      }
    },
    dataZoom: [
      {
        id: 'dataZoomX',
        type: 'inside',
        start: 0,
        end: 100,
        xAxisIndex: [0],
        filterMode: 'none',
        disabled: true
      }
    ],
    series: {
      name: dataGroup?.DataName,
      type: 'line',
      showSymbol: false,
      symbol: 'none',
      data: list,
      smooth: false,
      large: true,
      largeThreshold: exportChartWidth,
      sampling: 'lttb',
      markArea: {
        silent: true,
        itemStyle: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
        data: [
          [
            {
              yAxis: downValue
            },
            {
              yAxis: upValue
            }
          ]
        ]
      }
    },
    grid: {
      right: '14px',
      left: '7%',
      top: '30px'
    }
  }
}

const createRealtimeChartImage = (
  dataGroup: DataGroupEntity | undefined,
  formulaParam: FormulaParamEntity | undefined,
  chartData: DataValue[]
) => {
  let chart: echarts.ECharts | null = null
  const container = createExportChartContainer()
  try {
    chart = echarts.init(container, undefined, {
      useDirtyRect: true
    })
    chart.setOption(buildRealtimeExportOption(dataGroup, formulaParam, chartData))
    return removeDataUrlPrefix(chart.getDataURL({
      type: 'png',
      pixelRatio: 1.5,
      backgroundColor: '#fff'
    }))
  } finally {
    chart?.dispose()
    container.remove()
  }
}

type ExportDistributionData = DistributionModel & {
  X?: number[]
  Y?: number[]
}

const getDistributionDataForExport = async (dataGroupId: string): Promise<ExportDistributionData | null> => {
  const res = await callBrige(callFnName.GetDistributionData, dataGroupId)
  return res ? res as ExportDistributionData : null
}

const buildDistributionData = (xList: number[] = [], yList: number[] = []) => {
  return xList.map((e, i) => {
    return [e, yList[i]]
  }).filter(e => !Number.isNaN(Number(e[0])) && !Number.isNaN(Number(e[1])))
}

const buildDistributionExportOption = (
  dataGroup: DataGroupEntity | undefined,
  formulaParam: FormulaParamEntity | undefined,
  distributionData: ExportDistributionData
) => {
  const standard = Number(formulaParam?.Standard ?? distributionData.Std ?? 0)
  const lowValue = formulaParam
    ? standard - Number(formulaParam.LowerTol || 0)
    : Number(distributionData.Lsl || 0)
  const upValue = formulaParam
    ? standard + Number(formulaParam.UpperTol || 0)
    : Number(distributionData.Usl || 0)
  const barX = distributionData.X || distributionData.NdX || []
  const barY = distributionData.Y || distributionData.NdY || []

  return {
    animation: false,
    title: {
      text: dataGroup?.DataName || '',
      left: 'center',
    },
    color: ['#5470c6', '#91cc75'],
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        animation: false
      }
    },
    xAxis: {
      type: 'value',
      splitLine: {
        show: true
      },
      max: function (value: any) {
        return value.max
      },
      min: function (value: any) {
        return value.min
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '概率',
        min: function () {
          return 0
        },
        boundaryGap: ['5%', '5%'],
        splitLine: {
          show: true
        },
        axisLabel: {
          formatter: '{value} '
        }
      },
      {
        type: 'value',
        name: '数量',
        min: function () {
          return 0
        },
        boundaryGap: ['5%', '5%'],
        splitLine: {
          show: true
        },
        axisLabel: {
          formatter: '{value} 次'
        }
      },
    ],
    series: [
      {
        name: 'gass',
        type: 'line',
        showSymbol: false,
        data: buildDistributionData(distributionData.GaussX, distributionData.GaussY),
        smooth: true,
        markLine: {
          symbol: ['none', 'none'],
          label: { show: true, position: 'end' },
          lineStyle: {
            type: 'dashed',
            color: 'red',
            width: 2
          },
          data: [
            {
              name: '下限',
              xAxis: lowValue || 1,
              label: { formatter: '下限' }
            },
            {
              name: '标准值',
              xAxis: standard || 1,
              label: { formatter: '标准值' },
              lineStyle: { color: 'green' },
            },
            {
              name: '上限',
              xAxis: upValue || 1,
              label: { formatter: '上限' }
            }
          ]
        }
      },
      {
        name: 'Distribution',
        type: 'bar',
        showSymbol: false,
        data: buildDistributionData(barX, barY),
        smooth: true,
      },
    ],
    grid: {
      right: '14px',
      left: '7%',
      top: '30px'
    }
  }
}

const createDistributionChartImage = (
  dataGroup: DataGroupEntity | undefined,
  formulaParam: FormulaParamEntity | undefined,
  distributionData: ExportDistributionData
) => {
  let chart: echarts.ECharts | null = null
  const container = createExportChartContainer()
  try {
    chart = echarts.init(container, undefined, {
      useDirtyRect: true
    })
    chart.setOption(buildDistributionExportOption(dataGroup, formulaParam, distributionData))
    return removeDataUrlPrefix(chart.getDataURL({
      type: 'png',
      pixelRatio: 1.5,
      backgroundColor: '#fff'
    }))
  } finally {
    chart?.dispose()
    container.remove()
  }
}

export const initWinFn = () => {
  const ExportRealtime = async (arg: ExportRealtimeArg) => {
    try {
      const dataGroupId = parseExportDataGroupId(arg)
      // console.log('exportRealtime', arg, dataGroupId)

      if (!dataGroupId) {
        console.error('exportRealtime missing dataGroupId', arg)
        return ''
      }
      const configStore = useConfigStore()

      const chartData = await getChartDataForExport(dataGroupId)
      if (!chartData || chartData.length == 0) {
        return ''
      }
      const dataGroup = parseExportDataGroup(arg, configStore, dataGroupId)
      const formulaParam = configStore.curEnableFormulaParamList?.find(e => e.DataGroupId == dataGroupId)
      let res = createRealtimeChartImage(dataGroup, formulaParam, chartData)
      // console.log('exportRealtime res', res)
      return res
    } catch (err) {
      console.error('exportRealtime failed', err)
      return ''
    }
  }
  const ExportDistribution = async (arg: ExportRealtimeArg) => {
    try {
      const dataGroupId = parseExportDataGroupId(arg)
      // console.log('exportDistribution', arg, dataGroupId)

      if (!dataGroupId) {
        console.error('exportDistribution missing dataGroupId', arg)
        return ''
      }
      const configStore = useConfigStore()
      const distributionData = await getDistributionDataForExport(dataGroupId)
      if (!distributionData) {
        return ''
      }
      const dataGroup = parseExportDataGroup(arg, configStore, dataGroupId)
      const formulaParam = configStore.curEnableFormulaParamList?.find(e => e.DataGroupId == dataGroupId)
      let res = createDistributionChartImage(dataGroup, formulaParam, distributionData)
      // console.log('exportDistribution res', res)
      return res
    } catch (err) {
      console.error('exportDistribution failed', err)
      return ''
    }
  }

  window.exportRealtime = ExportRealtime
  window.exportDistribution = ExportDistribution
}
