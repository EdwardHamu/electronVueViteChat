export const wallShapeChartId = 'wall-shape-chart'
export const wallShapeConId = 'wall-shape-con'

/** 超声波测厚绘制外形所需的最少测点数 */
export const MIN_WALL_POINTS = 6

export type WallShapeDerived = {
  /** 测点数 */
  n: number
  /** 相邻测点角度间隔（360 / n） */
  step: number
  /** 平均壁厚 */
  avg: number
  /** 最大壁厚 */
  max: number
  /** 最小壁厚 */
  min: number
  /** 最大壁厚测点下标 */
  maxI: number
  /** 最小壁厚测点下标 */
  minI: number
  /** 最薄点角度（即内孔偏移方向，°） */
  angleMin: number
  /** 偏心度 (max-min)/(2*avg)*100 % */
  ecc: number
  /** 内孔圆心偏移量 (max-min)/2 */
  d: number
  /** 作图用外圆半径（无外径数据时按平均壁厚放大，仅保证比例正确） */
  R: number
  /** 作图用内孔半径 R - avg */
  ri: number
}

/**
 * 由 N 个等角度分布的壁厚实测值推导外形作图所需的全部数据。
 * 第 i 个测点位于 i * 360 / N 度；壁厚模型 t(θ) ≈ (R - ri) - d·cos(θ - θmin)：
 * 平均壁厚 = R - ri，内孔向最薄点方向偏移 d = (max - min) / 2。
 * 任一值非正（未取到实时数据）时返回 null。
 */
export const computeWallShape = (values: number[]): WallShapeDerived | null => {
  const n = values.length
  if (!n || values.some(v => !(Number(v) > 0))) return null
  const ts = values.map(Number)
  const avg = ts.reduce((a, b) => a + b, 0) / n
  let maxI = 0, minI = 0
  ts.forEach((v, i) => {
    if (v > ts[maxI]) maxI = i
    if (v < ts[minI]) minI = i
  })
  const max = ts[maxI], min = ts[minI]
  const step = 360 / n
  const d = (max - min) / 2
  const angleMin = minI * step
  const ecc = avg > 0 ? (max - min) / (2 * avg) * 100 : 0
  const R = avg * 2.5
  const ri = R - avg
  return { n, step, avg, max, min, maxI, minI, angleMin, ecc, d, R, ri }
}
