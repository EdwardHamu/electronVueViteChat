import { useConfigStore } from "@/store/config"
import { DataValue } from "~/me"

/** 展示模式假数据默认随机范围（变量未单独配置时使用） */
export const DEMO_RANGE_DEFAULT = { min: 0, max: 100 }

/** 展示模式是否开启（pinia 未就绪时视为关闭） */
export const isDemoMode = (): boolean => {
  try {
    return !!useConfigStore().demoMode
  } catch {
    return false
  }
}

/** 取某变量（数据组 GId）配置的假数据随机范围，未配置返回默认范围 */
export const getDemoRange = (gid: string): { min: number, max: number } => {
  try {
    const r = useConfigStore().demoRanges?.[gid]
    const min = Number(r?.min)
    const max = Number(r?.max)
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) return { min, max }
  } catch { /* pinia 未就绪 */ }
  return { ...DEMO_RANGE_DEFAULT }
}

/**
 * 生成一个变量的随机假数据（保留5位小数）。
 * 展示模式开启后不再采集真数据，GetRealtimeData 直接返回该假数据。
 */
export const makeFakeDataValue = (gid: string): DataValue => {
  const { min, max } = getDemoRange(gid)
  const v = Number((min + Math.random() * (max - min)).toFixed(5))
  return {
    GId: gid,
    Value: v,
    StringValue: v.toFixed(5),
    DataType: 1,
  } as DataValue
}
