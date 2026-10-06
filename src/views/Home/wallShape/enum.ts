export const wallShapeChartId = 'wall-shape-chart'
export const wallShapeConId = 'wall-shape-con'

/** 超声波测厚绘制外形所需的最少测点数（4 点 = 0°/90°/180°/270° 两组对点，刚好能定出偏心的 x、y 两个分量） */
export const MIN_WALL_POINTS = 4

/**
 * 测点数少于该值（即 4、5 点）时，偏心量 / 偏心角改用一阶谐波（最小二乘）拟合求解。
 * 原来的「最薄测点方向 + (max - min) / 2」只能把偏心方向落在 360/N 的整数倍上：
 * 4 点时偏心角只有 0/90/180/270 四种取值，内孔真实偏向 45° 时偏心量还会少算约 30%。
 * 6 点及以上沿用原算法，保持已有显示结果不变。
 */
export const HARMONIC_FIT_BELOW = 6

export type WallShapeDerived = {
  /** 测点数 */
  n: number
  /** 相邻测点角度间隔（360 / n） */
  step: number
  /** 平均壁厚 */
  avg: number
  /** 最大壁厚（实测值） */
  max: number
  /** 最小壁厚（实测值） */
  min: number
  /** 最大壁厚测点下标 */
  maxI: number
  /** 最小壁厚测点下标 */
  minI: number
  /** 最薄方向角度（即内孔偏移方向，°，[0, 360)）；谐波拟合时为连续值，不一定落在测点上 */
  angleMin: number
  /** 偏心度 d / avg * 100 %（极值法时等于 (max-min)/(2*avg)*100） */
  ecc: number
  /** 内孔圆心偏移量 */
  d: number
  /** 偏心计算方式：harmonic = 一阶谐波拟合（< HARMONIC_FIT_BELOW 点），extreme = 最大/最小测点 */
  method: 'harmonic' | 'extreme'
  /** 作图用外圆半径（无外径数据时按平均壁厚放大，仅保证比例正确） */
  R: number
  /** 作图用内孔半径 R - avg */
  ri: number
}

/** 角度归一到 [0, 360)；贴近 360 的浮点残差（如 atan2 得到 -6e-15）按 0° 处理，否则 toFixed(1) 会显示成 360.0° */
const normDeg = (deg: number) => {
  const v = ((deg % 360) + 360) % 360
  return v > 360 - 1e-7 ? 0 : v
}

/**
 * 由 N 个等角度分布的壁厚实测值推导外形作图所需的全部数据。
 * 第 i 个测点位于 i * 360 / N 度（0° 在 x 正方向，逆时针）。
 * 壁厚模型 t(θ) ≈ avg - d·cos(θ - θmin)：内孔向最薄方向 θmin 偏移 d。
 *
 * - N < HARMONIC_FIT_BELOW（4、5 点）：一阶谐波拟合
 *     a = 2/N·Σ tᵢ·cos θᵢ，b = 2/N·Σ tᵢ·sin θᵢ，d = √(a² + b²)，θmin = atan2(-b, -a)
 *   4 点时即对点法：dx = (t180 - t0) / 2，dy = (t270 - t90) / 2。
 * - N ≥ HARMONIC_FIT_BELOW：d = (max - min) / 2，θmin = 最薄测点角度（原算法）。
 *
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

  let d: number
  let angleMin: number
  let method: WallShapeDerived['method']
  if (n < HARMONIC_FIT_BELOW) {
    method = 'harmonic'
    let a = 0, b = 0
    ts.forEach((v, i) => {
      const rad = i * step * Math.PI / 180
      a += v * Math.cos(rad)
      b += v * Math.sin(rad)
    })
    a = a * 2 / n
    b = b * 2 / n
    d = Math.hypot(a, b)
    // 浮点误差（cos 90° ≈ 6e-17）：各点相等时 d 应为 0，否则会画出一条随机方向的扇形
    if (d <= avg * 1e-9) d = 0
    angleMin = d > 0 ? normDeg(Math.atan2(-b, -a) * 180 / Math.PI) : minI * step
  } else {
    method = 'extreme'
    d = (max - min) / 2
    angleMin = minI * step
  }

  const ecc = avg > 0 ? d / avg * 100 : 0
  const R = avg * 2.5
  const ri = R - avg
  return { n, step, avg, max, min, maxI, minI, angleMin, ecc, d, method, R, ri }
}
