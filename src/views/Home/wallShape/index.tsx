import { computed, defineComponent, onBeforeUnmount, onMounted, reactive, watch } from "vue";
import * as echarts from 'echarts';
import classNames from "classnames";
import { useConfigStore } from "@/store/config";
import { ajaxPromiseAll, sleep } from "@/utils/utils";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { DataValue, FormulaParamEntity } from "~/me";
import { useMyI18n } from "@/hooks/useMyI18n";
import { WALL_DATA_CLASSES } from "../config/devConfigNew/enum";
import { computeWallShape, MIN_WALL_POINTS, wallShapeChartId, wallShapeConId } from "./enum";

/**
 * 超声波偏心仪（UltrasonicWave）壁厚外形图。
 * 参考 ecc/index.tsx：取当前设备全部壁厚数据组（WALL01..08，N 个测点按 360/N° 等角分布），
 * 由实测壁厚推导平均/最大/最小壁厚、偏心度、偏心角与内孔偏移，绘制线缆横截面。
 * 测点不足 MIN_WALL_POINTS 个时仅弹出警告，不绘图。
 */
export default defineComponent({
  name: 'WallShape',
  setup() {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    let myChart: echarts.ECharts | null = null

    const alldata = reactive({
      /** 按 WALL01.. 顺序的实时壁厚值 */
      values: [] as number[],
      chartHeight: 0,
      timeInstance: null as NodeJS.Timer | null,
    })

    /** 当前所选数据组所属设备 */
    const devId = computed(() => configStore.curChartDataGroup?.DeviceGroupId)

    /** 该设备的全部壁厚数据组（即该超声波设备的所有测点），按 WALL01..08 排序 */
    const wallGroups = computed(() => (configStore.chartDataGroupList || [])
      .filter(e => e.DeviceGroupId === devId.value && WALL_DATA_CLASSES.includes(Number(e.DataClass)))
      .sort((a, b) => Number(a.DataClass) - Number(b.DataClass)))

    const enough = computed(() => wallGroups.value.length >= MIN_WALL_POINTS)

    /** 壁厚显示小数位：取数据组配置精度，缺省 3 */
    const prec = computed(() => {
      const p = Number(wallGroups.value[0]?.Precision)
      return Number.isFinite(p) && p >= 0 && p <= 6 ? p : 3
    })

    const curParamList = computed(() => configStore.curEnableFormulaParamList)
    /** 壁厚公用配方参数（*bh），与 ecc 的壁厚标签配色规则一致 */
    const bhParam = computed<FormulaParamEntity | undefined>(() => curParamList.value?.find(e => {
      if (!e.DataGroupId || e.DataGroupId.search(/\*/) == -1) return false
      return e.DataGroupId.split('*')[1] == 'bh'
    }))

    /** 派生数据：平均/最大/最小壁厚、偏心度、偏心角、作图几何 */
    const derived = computed(() => computeWallShape(alldata.values))

    // ── 测点不足：弹出警告（设备或测点数变化时触发一次） ──
    watch([devId, () => wallGroups.value.length], ([id, n]) => {
      if (id && n > 0 && n < MIN_WALL_POINTS) {
        window.$message?.warning(t('wallShape.notEnough', { n }))
      }
    }, { immediate: true })

    const statLabels = computed(() => {
      const _ = i18nStore.langChangeCount
      return {
        points: t('wallShape.points'),
        avg: t('wallShape.avg'),
        max: t('wallShape.max'),
        min: t('wallShape.min'),
        ecc: t('wallShape.ecc'),
        angle: t('wallShape.angle'),
      }
    })

    /** 壁厚值按 *bh 公差配色：范围内绿 / 超上公差橙 / 超下公差红；无参数深蓝 */
    const thicknessColor = (v: number) => {
      const p = bhParam.value
      if (p?.Standard == null) return '#003a62'
      if (v > p.Standard + (p.UpperTol || 0)) return '#ff8d3f'
      if (v < p.Standard - (p.LowerTol || 0)) return '#ff0000'
      return '#00aa00'
    }

    const statList = computed(() => {
      const d = derived.value
      const f = (v: number | undefined, digits: number, unit = '') => v == null ? '—' : v.toFixed(digits) + unit
      return [
        { label: statLabels.value.points, value: String(wallGroups.value.length), color: '#003a62' },
        { label: statLabels.value.avg, value: f(d?.avg, prec.value), color: d ? thicknessColor(d.avg) : '#003a62' },
        { label: statLabels.value.max, value: f(d?.max, prec.value), color: d ? thicknessColor(d.max) : '#003a62' },
        { label: statLabels.value.min, value: f(d?.min, prec.value), color: d ? thicknessColor(d.min) : '#003a62' },
        { label: statLabels.value.ecc, value: f(d?.ecc, 2, '%'), color: '#003a62' },
        { label: statLabels.value.angle, value: f(d?.angleMin, 1, '°'), color: '#003a62' },
      ]
    })

    const getData = () => {
      const list = wallGroups.value
      if (list.length < MIN_WALL_POINTS) return
      return ajaxPromiseAll(list.map(g => callBrige(callFnName.GetRealtimeData, g.GId))).then((res: DataValue[]) => {
        if (!res || !res.length) return
        alldata.values = res.map(r => Number(r?.Value ?? 0))
      }).catch(() => { /* 无宿主桥或采集失败：保持等待状态 */ })
    }

    const getConShortSize = () => {
      const con = document.getElementById(wallShapeConId) as HTMLDivElement | null
      if (!con) return
      const { offsetHeight, offsetWidth } = con
      const size = offsetHeight - offsetWidth > 0 ? offsetWidth : offsetHeight
      alldata.chartHeight = size - 20
    }

    const initChart = () => {
      const ele = document.getElementById(wallShapeChartId)
      if (!ele) return
      if (myChart) { myChart.dispose(); myChart = null }
      myChart = echarts.init(ele)
      const axis = {
        type: 'value',
        min: -1,
        max: 1,
        axisLabel: { show: false },
        axisLine: { onZero: true },
        axisTick: { show: true },
        splitLine: { show: false }
      }
      myChart.setOption({
        grid: { left: 30, right: 30, top: 30, bottom: 30 },
        xAxis: { ...axis },
        yAxis: { ...axis },
        series: [
          // 外圆（绝缘外表面）
          {
            type: 'custom',
            renderItem: (params: any, api: any) => {
              const d = derived.value
              const len = d ? d.R * 2 : 0
              const size = api.size([len, len])
              return {
                type: 'circle',
                transition: ['shape'],
                shape: {
                  cx: api.coord([0, 0])[0],
                  cy: api.coord([0, 0])[1],
                  r: size[0] / 2
                },
                style: api.style({ fill: '#003a62' })
              }
            },
            zlevel: -3,
            data: [[0, 0]]
          },
          // 内孔（导体），向最薄壁方向偏移 d
          {
            type: 'custom',
            renderItem: (params: any, api: any) => {
              const d = derived.value
              const len = d ? d.ri * 2 : 0
              const rad = d ? d.angleMin * Math.PI / 180 : 0
              const pos = d ? [d.d * Math.cos(rad), d.d * Math.sin(rad)] : [0, 0]
              const size = api.size([len, len])
              return {
                type: 'circle',
                transition: ['shape'],
                shape: {
                  cx: api.coord(pos)[0],
                  cy: api.coord(pos)[1],
                  r: size[0] / 2
                },
                style: api.style({ fill: '#e8e9e9' })
              }
            },
            zlevel: -1,
            data: [[0, 0]]
          }
        ]
      })
    }

    /** 每个测点的箭头 + 壁厚标签（配色同 ecc 壁厚标签） */
    const updateLabels = () => {
      if (!myChart) return
      const d = derived.value
      if (!d) {
        myChart.setOption({ graphic: { elements: [] } })
        return
      }
      const axisMax = d.R / 0.85
      const arrowInnerRadius = axisMax * 1.025 * 0.85
      const labelRadius = axisMax * 1.09 * 0.85
      const elements: any[] = []

      for (let i = 0; i < d.n; i++) {
        const angle = i * d.step
        const angleRad = angle * Math.PI / 180
        const cosA = Math.cos(angleRad)
        const sinA = Math.sin(angleRad)

        const labelPx = myChart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [labelRadius * cosA, labelRadius * sinA])
        const arrowEndPx = myChart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [arrowInnerRadius * cosA, arrowInnerRadius * sinA])
        if (!labelPx || !arrowEndPx || isNaN(labelPx[0])) continue

        elements.push({
          type: 'line',
          shape: { x1: labelPx[0], y1: labelPx[1], x2: arrowEndPx[0], y2: arrowEndPx[1] },
          style: { stroke: '#FF8C00', lineWidth: 2 },
          silent: true,
        })

        const arrowSize = 9
        const dirX = -cosA
        const dirY = sinA
        const perpX = -dirY
        const perpY = dirX
        elements.push({
          type: 'polygon',
          shape: {
            points: [
              [arrowEndPx[0], arrowEndPx[1]],
              [arrowEndPx[0] + perpX * arrowSize / 2 - dirX * arrowSize * 0.6, arrowEndPx[1] + perpY * arrowSize / 2 - dirY * arrowSize * 0.6],
              [arrowEndPx[0] - perpX * arrowSize / 2 - dirX * arrowSize * 0.6, arrowEndPx[1] - perpY * arrowSize / 2 - dirY * arrowSize * 0.6],
            ]
          },
          style: { fill: '#FF8C00' },
          silent: true,
        })

        const textOffset = 14
        const topExtraOffset = sinA > 0.3 ? -12 : 0
        let textAlign: string
        if (cosA > 0.3) textAlign = 'left'
        else if (cosA < -0.3) textAlign = 'right'
        else textAlign = 'center'
        let textVerticalAlign: string
        if (sinA > 0.3) textVerticalAlign = 'bottom'
        else if (sinA < -0.3) textVerticalAlign = 'top'
        else textVerticalAlign = 'middle'

        elements.push({
          type: 'text',
          left: labelPx[0] + textOffset * cosA - 30,
          top: labelPx[1] - textOffset * sinA + topExtraOffset,
          style: {
            text: alldata.values[i].toFixed(prec.value),
            textAlign,
            textVerticalAlign,
            fill: thicknessColor(alldata.values[i]),
            font: 'bold 18px sans-serif',
          },
          silent: true,
        })
      }

      myChart.setOption({ graphic: { elements } })
    }

    const updateChart = () => {
      if (!myChart) return
      const d = derived.value
      const range = d ? d.R / 0.85 : 1
      myChart.setOption({
        xAxis: { min: -range, max: range },
        yAxis: { min: -range, max: range },
        series: [{ data: [[0, 0]] }, { data: [[0, 0]] }]
      })
      updateLabels()
    }

    watch(() => derived.value, () => {
      updateChart()
    })

    const startTimer = () => {
      alldata.timeInstance && clearInterval(alldata.timeInstance)
      getData()
      alldata.timeInstance = setInterval(() => {
        getData()
      }, configStore.sysConfig.ColloctInterval || 1000)
    }

    // 设备/测点集合变化：清掉旧值并重启采集
    watch(() => wallGroups.value.map(e => e.GId).join(','), () => {
      alldata.values = []
      if (enough.value) {
        sleep(50).then(() => {
          getConShortSize()
          if (!myChart) initChart()
          startTimer()
        })
      } else {
        alldata.timeInstance && clearInterval(alldata.timeInstance)
      }
    })

    onMounted(() => {
      getConShortSize()
      sleep(50).then(() => {
        if (enough.value) {
          initChart()
          startTimer()
        }
      })
    })

    onBeforeUnmount(() => {
      alldata.timeInstance && clearInterval(alldata.timeInstance)
      myChart && myChart.dispose()
      myChart = null
    })

    return () => {
      return (
        <div class={'w-full h-full px-2 flex flex-col'}>
          <div class={'flex justify-center flex-shrink-0'}>
            <div class={'flex w-full justify-between flex-wrap max-w-[1100px] ml-2'}>
              {
                statList.value.map((e, i) => {
                  return <div class={'text-lg flex items-center'} key={i}>
                    <span class={'mr-2'}>{e.label}:</span>
                    <span class={'text-xl min-w-[80px] text-center'} style={{ color: e.color }}>{e.value}</span>
                  </div>
                })
              }
            </div>
          </div>
          {
            !enough.value
              ? <div class={'w-full h-full shrink flex items-center justify-center text-xl text-[#c0392b]'}>
                {t('wallShape.notEnough', { n: wallGroups.value.length })}
              </div>
              : <div class={'w-full h-full shrink flex justify-center items-end relative'} id={wallShapeConId}>
                <div id={wallShapeChartId} class={'max-w-full max-h-full ' + classNames({ 'opacity-60': !derived.value })}
                  style={{
                    height: alldata.chartHeight + 'px',
                    width: alldata.chartHeight + 'px'
                  }}></div>
                {
                  !derived.value &&
                  <div class={'absolute inset-0 flex items-center justify-center text-lg text-[#7a8699]'}>
                    {t('wallShape.noData')}
                  </div>
                }
              </div>
          }
        </div>
      )
    }
  }
})
