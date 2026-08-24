import { } from "naive-ui";
import { defineComponent, reactive, ref, computed, onMounted, onBeforeUnmount, watch, PropType, nextTick } from "vue";

import { useRealTimeStore } from "@/store/realtime";
import * as echarts from 'echarts';
import { useTrendStore } from "@/store/trendStore";
import { storeToRefs } from "pinia";
import { getRandomInt, sleep } from "@/utils/utils";
import { useCurcevInnerDataStore } from "./innerData";
import { callSpc } from "@/utils/call";
import { callFnName } from "@/utils/enum";
import { CollectPointModel, DataConfigEntity, DataGroupEntity, DataValue, ModbusAdressRow } from "~/me";
import CpkBlock from "./CpkBlock";
import { useConfigStore } from "@/store/config";
import { callBrige } from "@/utils/callm";
import SymAuto from '@/assets/SymAuto.png'
import SymBigger from '@/assets/SymBigger.png'
import SymSmaller from '@/assets/SymSmaller.png'
import SymUp from '@/assets/SymUp.png'
import SymDown from '@/assets/SymDown.png'

let now = Date.now()
let fakeDataList = new Array(50).fill(0).map((e, i) => {
  //js 获取特定范围内的随机整数
  let val = getRandomInt(90, 110)
  return [now + i, val]
})
export type CurcevChartRowIns = {
  getChartIns: Function,
}
export default defineComponent({
  name: 'CurcevChartRow',
  props: {
    chartId: String,
    adressRow: Object as PropType<DataGroupEntity>,
    dataSourceItem: {
      type: Object as PropType<{
        label: string,
        key: string,
        parent: string
      }>,
    },
    i: {
      type: Number
    },
    height: String,
  },
  setup(props, ctx) {
    let count = 0                     //记录realdata数据的更新次数
    const innerData = useCurcevInnerDataStore()
    const configStore = useConfigStore()
    // const configStore = useConfigStore()
    let thisReMountedCount = innerData.reMountedCount
    // console.log("🚀 ~ file: CurcevChartRow.tsx:36 ~ setup ~ thisReMountedCount:", thisReMountedCount)
    let myChart: echarts.ECharts
    const reloadKey = ref(0)
    let loopVersion = 0
    let unit = `mm`
    const alldata = reactive({
      widthPixel: 800,
      isAuto: true,
      upMove: 0, //上移动中线
      // downMove: 0,
      scalUpMove: 0,  //放大上下限
      // scalDownMove: 0 //缩小上下限
      curParSaclStep: 0.1,
      isZoom: false,
    })
    const dataSourceItem = computed(() => {
      return props.dataSourceItem
    })
    const paraItem = computed(() => {
      let item = configStore.curEnableFormulaParamList?.find(e => e.DataGroupId == props.adressRow?.GId)
      alldata.curParSaclStep = item?.Standard ? item.Standard * 0.01 : 0.1
      return item
    })
    const initEchart = () => {
      let ele = document.getElementById((props.chartId || 'trendChart') + props.i)
      if (!ele) return
      myChart = echarts.init(ele, undefined, {
        useDirtyRect: true
      });
      // console.log("🪵 [CurcevChartRow.tsx:66] ~ token ~ \x1b[0;32mprops.dataConfig\x1b[0m = ", props.dataConfig);
      const para = paraItem.value
      // console.log("🪵 [CurcevChartRow.tsx:173] ~ token ~ \x1b[0;32mpara\x1b[0m = ", para);
      let option = {
        animation: false,
        title: {
          //@ts-ignore
          // text: '',
          text: props.adressRow?.DataName,
          left: '48%'
        },
        toolbox: {
          feature: {
            dataZoom: {
              yAxisIndex: 'none' // 如果只想横向缩放，设为 'none'；如果想横纵同时缩放，去掉此行
            },
            // restore: {}, // 提供一个“还原”按钮，方便放大后一键回到初始状态
            // saveAsImage: {}
          }
        },
        // toolbox: {
        //   feature: {
        //     // dataZoom: {
        //     //   yAxisIndex: 'none'
        //     // },
        //     restore: {},
        //     saveAsImage: {}
        //   }
        // },
        // legend: {
        //   data: [`value(${unit})`]
        // },
        tooltip: {
          trigger: 'axis',
          formatter: function (params: any) {
            params = params[0];
            return (
              // params.value[0].toLocaleString() +
              '  ' +
              params.value[1]
            );
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
            return (value.max + (paraItem.value?.UpperTol || 0.1) + alldata.scalUpMove + alldata.upMove).toFixed(3)
            // if(paraItem.value){
            //   return paraItem.value?.Standard + paraItem.value?.UpperTol
            // }else{
            //   return value.max.toFixed(3)
            // }
          },
          min: function (value: any) {
            let min = value.min
            console.log("🪵 [CurcevChartRow.tsx:146] ~ token ~ \x1b[0;32mmin\x1b[0m = ", min, paraItem.value);
            if (value.min <= 0 && paraItem.value) {
              // 上边界(与max函数保持一致的计算方式，但不含upMove)与标准值的差值
              // upMove是纯平移量，需要在镜像计算之后单独叠加，否则会和max产生相反方向的偏移，导致表现为缩放而不是平移
              let upperBoundNoMove = value.max + (paraItem.value?.UpperTol || 0.1) + alldata.scalUpMove
              let upperDiff = upperBoundNoMove - (paraItem.value?.Standard || 0)
              min = (paraItem.value?.Standard || 0) - upperDiff + alldata.upMove
              return min.toFixed(3)
            }
            // let val = (value.min - (paraItem.value?.LowerTol || 0.1) - alldata.scalUpMove).toFixed(3)

            return (min - (paraItem.value?.LowerTol || 0.1) - alldata.scalUpMove + alldata.upMove).toFixed(3)
            // if(para){
            //   return para?.Standard + para?.UpperTol
            // }else{
            //   return value.max.toFixed(3)
            // }
          },
          // boundaryGap: ['10%', '10%'],
          splitLine: {
            show: true
          },
          axisLabel: {
            formatter: '{value} ' + props.adressRow?.Unit // Specify the unit here
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
          },
          // {
          //   id: 'dataZoomY',
          //   type: 'inside',
          //   start: 0,
          //   end: 100,
          //   yAxisIndex: [0],
          //   filterMode: 'none',
          //   disabled: true
          // },
          // {
          //   type: 'inside', // 允许鼠标滚轮缩放
          //   start: 0,
          //   end: 100,
          //   filterMode: 'none'
          // },
          // {
          //   type: 'inside', // 允许鼠标滚轮缩放
          //   start: 0,
          //   end: 100,
          //   filterMode: 'none'
          // },
        ],
        // dataZoom: [
        //   {
        //     type: 'inside',
        //     start: 0,
        //     end: 100
        //   },
        //   {
        //     start: 0,
        //     end: 100
        //   }
        // ],
        series: {
          name: dataSourceItem.value?.label,
          type: 'line',
          showSymbol: false,
          // data: fakeDataList,
          data: [[0, 1]],
          smooth: false,
        },
        grid: {
          right: '14px',
          left: '7%',
          top: '30px'
        }
      }

      // 绘制图表
      myChart.setOption(option);
      myChart.on('datazoom', function (params: any) {
        console.log("🪵 [CurcevChartRow.tsx:225] ~ token ~ \x1b[0;32mparams\x1b[0m = ", params);
        // 只要触发了 datazoom 事件，基本就代表用户进行了操作
        // alldata.isZoom = true;
        console.log("当前处于缩放状态");
        if (params.batch && !params.batch[0].isCode) {
          innerData.setCurDataZoomInfo(params)
        }

        if (params.batch) {
          let diff = params.batch[0].endValue - params.batch[0].startValue
          innerData.setCurDataZoomDiff(diff / 10)
          // console.log("🪵 [CurcevChartRow.tsx:371] ~ token ~ \x1b[0;32mdiff\x1b[0m = ", diff);
        } else {
          let diff = params.endValue - params.startValue
          innerData.setCurDataZoomDiff(diff / 10)
        }
        if (props.i != undefined) {
          innerData.setCurDataZoomIndex(props.i)
        }
      });

      // 当用户点击工具栏的 restore（还原）按钮时，重置状态
      myChart.on('restore', function () {
        alldata.isZoom = false;
        console.log("图表已重置");
      });

      startSelect()
      // 在初始化 chart 后执行

    }
    const startSelect = () => {
      sleep(100).then(() => {
        myChart.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'dataZoomSelect',
          // 启动或关闭
          dataZoomSelectActive: true
        });
      })

    }
    const getWidthPixel = () => {
      let width = document.querySelector('.my-index-chart')?.clientWidth || 800
      alldata.widthPixel = width
    }

    const disposeChart = () => {
      loopVersion++
      if (myChart && !myChart.isDisposed()) {
        myChart.dispose()
      }
      myChart = undefined as any
    }

    const loopGet = () => {
      const curLoopVersion = loopVersion
      if (!myChart || !innerData.isGetting || !props.adressRow || curLoopVersion != loopVersion || thisReMountedCount != innerData.reMountedCount) return
      // callSpc(callFnName.getSpanCollectPoints, [props.dataConfig.GId, new Date(innerData.startTime)], true).then((res: CollectPointModel[]) => {


      // console.log("🪵 [CurcevChartRow.tsx:161] ~ token ~ \x1b[0;32malldata.widthPixel\x1b[0m = ", alldata.widthPixel);
      // new Promise<CollectPointModel[]>((resolve, reject) => { resolve([]) })
      callBrige(callFnName.GetChartData, [props.adressRow.GId, alldata.widthPixel], true).then((res: DataValue[]) => {
        if (curLoopVersion != loopVersion || !myChart) return
        // console.log("🚀 ~ file: CurcevChartRow.tsx:135 ~ callSpc ~ res:", res)
        // let maxCount = configStore.sysConfig.maxDataCount.Value
        // maxCount && (res = res.slice(-maxCount))
        // if (props.i == 0) {
        //   let length = res.length
        //   innerData.setCurDataLength(length)
        //   res[length - 1] && innerData.setCurNewVal(res[length - 1].Value)
        // }
        // filter((e,i) => i % 2 == 0)
        if (!res) {
          return sleep(1000).then(() => {
            if (curLoopVersion == loopVersion) {
              loopGet()
            }
          })
        }
        let paramItem = configStore.curEnableFormulaParamList?.find(e => e.DataGroupId == props.adressRow?.GId)
        let upValue: number = paramItem?.UpperTol || 0.1
        let downValue: number = paramItem?.LowerTol || 0.1
        if (paramItem) {
          let stand = paramItem.Standard || 0
          let up = paramItem.UpperTol || 0
          let down = paramItem.LowerTol || 0
          upValue = stand + up
          downValue = stand - down
        }

        const list: [number, number][] = res
          .map(e => {
            const time = new Date(e.Intime).getTime()
            return [time, e.Value * 1] as [number, number]
          })
          .filter(([time]) => Number.isFinite(time))
          .sort(([leftTime], [rightTime]) => leftTime - rightTime)
        // console.log("🚀 ~ list ~ list:", list.length)
        let opt = {
          title: {
            //@ts-ignore
            text: props.adressRow?.DataName,
            left: '48%'
          },
          progressiveThreshold: innerData.samplingNum,
          progressive: 200,
          progressiveChunkMode: "sequential",
          animation: false,
          series: {
            name: props.adressRow?.DataName,
            type: 'line',
            showSymbol: false,
            symbol: 'none',
            data: list,
            smooth: false,
            large: true,
            // 当数据量超过 1000 时，进入大数据模式
            largeThreshold: innerData.samplingNum,
            sampling: 'lttb',
            markArea: {
              silent: true, // 图形是否不响应鼠标事件，建议开启以防干扰点击折线
              itemStyle: {
                color: 'rgba(0, 0, 0, 0.1)', // 设置阴影颜色和透明度 (这里是淡红色)
              },
              data: [
                [
                  {
                    // name: '公差范围', // 阴影区域的名字
                    yAxis: downValue    // 下公差的具体数值
                  },
                  {
                    yAxis: upValue     // 上公差的具体数值
                  }
                ]
              ]
            }
            // ...((res.length > innerData.samplingNum) ? { sampling: 'lttb' } : {})
          },
        }
        myChart.setOption(opt);
        // let time = innerData.sysConfig.find(e => e.Name == 'RefreshInterval')?.Value
        let time = configStore.sysConfig.RefreshInterval
        return sleep(time ? Number(time) : 1000)
      }).then(() => {
        if (curLoopVersion == loopVersion) {
          loopGet()
        }
      }).catch((err: any) => {
        console.log("🪵 [CurcevChartRow.tsx:182] ~ token ~ \x1b[0;32merr\x1b[0m = ", err);
      })
    }
    const reloadChart = () => {
      disposeChart()
      resetSysValue()
      alldata.isAuto = true
      alldata.isZoom = false
      reloadKey.value++
      nextTick(() => {
        initEchart()
        getWidthPixel()
        if (innerData.isGetting) {
          loopGet()
        }
      })
    }
    const getChartIns = () => {
      return myChart
    }
    watch(() => innerData.isGetting, (val) => {
      if (val) {
        loopGet()
      }
    })
    watch(() => props.adressRow?.GId, (val, oldVal) => {
      if (val && oldVal && val != oldVal) {
        reloadChart()
      }
    })
    watch(() => innerData.curDataZoomInfo, (val: any) => {
      // console.log("🪵 [CurcevChartRow.tsx:362] ~ token ~ \x1b[0;32mval\x1b[0m = ", val, innerData.curDataZoomIndex, props.i);
      // console.log("🪵 [CurcevChartRow.tsx:360] ~ token ~ \x1b[0;32mval\x1b[0m = ", val);
      if (val && innerData.curDataZoomIndex != props.i) {

        myChart.dispatchAction({
          "type": "dataZoom",
          "batch": val.batch,
          isCode: true
        })
      }
    })
    watch(() => innerData.ZoomRestoreCount, (val) => {
      if (val && innerData.curDataZoomIndex != props.i) {
        restoreFn()
      }
    })
    const restoreFn = () => {
      resetSysValue()
      myChart.dispatchAction({
        type: 'restore'
      });
      myChart.setOption({});
      startSelect()
    }
    const setOption = (opts: any) => {
      let opt = {

      }
      myChart.setOption(opt);
    }
    const resetSysValue = () => {
      alldata.scalUpMove = 0
      alldata.upMove = 0
    }
    const setOptionSleep = () => {

    }
    const autoClick = () => {
      alldata.isAuto = true
      innerData.setCurDataZoomIndex(props.i || 0)
      restoreFn()
      innerData.addZoomRestoreCount()
    }
    const sysBiggerClick = () => {
      if (alldata.isZoom) {  //暂时废弃

        let zoneList = myChart.getOption().dataZoom as any
        // console.log("🪵 [CurcevChartRow.tsx:357] ~ token ~ \x1b[0;32mzone\x1b[0m = ", zoneList);
        let yItem = zoneList[1]
        myChart.dispatchAction({
          type: "dataZoom",
          // 对应 dataZoom 组件的 index，如果有多个 dataZoom，通常是 0
          dataZoomIndex: 1,
          // 开始的具体数值（X 轴上的值）
          startValue: yItem.startValue + innerData.curDataZoomDiff,
          // 结束的具体数值
          endValue: yItem.endValue - innerData.curDataZoomDiff
        });


      } else {
        //@ts-ignore
        var yAxisModel = myChart.getModel().getComponent('yAxis', 0);
        var axisExtent = yAxisModel.axis.scale.getExtent();
        let diff = (axisExtent[1] - axisExtent[0]) / 10
        // alldata.curParSaclStep = diff

        alldata.isAuto = false
        alldata.scalUpMove -= diff

        myChart.setOption({});
      }
      // startSelect()
    }
    const sysSmallerClick = () => {
      if (alldata.isZoom) {//暂时废弃
        let zoneList = myChart.getOption().dataZoom as any
        // console.log("🪵 [CurcevChartRow.tsx:357] ~ token ~ \x1b[0;32mzone\x1b[0m = ", zoneList);
        let yItem = zoneList[1]
        myChart.dispatchAction({
          type: "dataZoom",
          // 对应 dataZoom 组件的 index，如果有多个 dataZoom，通常是 0
          dataZoomIndex: 1,
          // 开始的具体数值（X 轴上的值）
          startValue: yItem.startValue - innerData.curDataZoomDiff,
          // 结束的具体数值
          endValue: yItem.endValue + innerData.curDataZoomDiff
        });
        // console.log("🪵 [CurcevChartRow.tsx:393] ~ token ~ \x1b[0;32myItem.startValue + innerData.curDataZoomDiff\x1b[0m = ", yItem.startValue + innerData.curDataZoomDiff, yItem.endValue - innerData.curDataZoomDiff);
      } else {
        alldata.isAuto = false
        alldata.scalUpMove += alldata.curParSaclStep
        myChart.setOption({});
      }

      // startSelect()

    }
    const sysUpClick = () => {
      // myChart.dispatchAction({
      //   "type": "dataZoom",
      //   "batch": [
      //     {
      //       "dataZoomId": "\u0000_ec_\u0000toolbox-dataZoom_xAxis0",
      //       "startValue": 1777971451868.2463,
      //       "endValue": 1777971533222.7588,
      //       "type": "datazoom",
      //       "from": "toolbox-feature_1817",
      //       "batch": null
      //     }
      //   ]
      // })
      alldata.isAuto = false
      alldata.upMove -= alldata.curParSaclStep
      myChart.setOption({});

      // startSelect()
    }
    const sysDownClick = () => {
      alldata.isAuto = false
      alldata.upMove += alldata.curParSaclStep
      myChart.setOption({});
      // startSelect()

    }

    ctx.expose({
      getChartIns,
    } as CurcevChartRowIns)
    // watch(productLength, () => {
    //   if (!myChart || !innerData.isGetting) return
    //   if (count < 1) {
    //     count++
    //     return
    //   }
    //   count = 0
    //   let dataItem = realtimeStore.realData[`${dataSourceItem.value?.parent || dataSourceItem.value?.key}Data`] || {}
    //   myChart.setOption({
    //     title: {
    //       //@ts-ignore
    //       text: dataSourceItem.value?.parent ? trendStore.menuMaintainOptions![0]!.children!.find(e => e.key == dataSourceItem.value?.parent).label + '-' + dataSourceItem.value?.label : dataSourceItem.value?.label,
    //       left: '48%'
    //     },
    //     series: {
    //       name: dataSourceItem.value?.label,
    //       type: 'line',
    //       showSymbol: false,
    //       data: (dataItem[dataSourceItem.value?.key || 'no'] || []).slice(-600),
    //       smooth: false,
    //     },
    //   });
    // })
    onBeforeUnmount(() => {
      disposeChart()
    })
    onMounted(() => {
      setTimeout(() => {
        initEchart()

        getWidthPixel()
        if (innerData.isGetting) {
          loopGet()
        }
      }, 0);
    })
    return () => {
      return (
        <div key={reloadKey.value} class={'h-full shrink mt-2 overflow-visible relative my-index-chart'} style={{ ...(props.height ? { height: props.height } : {}) }} >
          {/* <CpkBlock dataConfig={props.dataConfig} /> */}
          <div class={' h-full w-full  '} style={{}} id={(props.chartId || 'trendChart') + props.i} >
          </div>
          <div class={'w-full h-[50px] absolute bottom-0  '}>
            <div class={'w-full h-full flex justify-around items-center'}>
              <div class={' h-[50px] w-[50px] mb-3'} title={'自动'} onClick={autoClick} style={{ backgroundImage: `url(${SymAuto})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} >

              </div>
              <div class={' h-[50px] w-[50px] mb-3'} title={'放大曲线'} onClick={sysBiggerClick} style={{ backgroundImage: `url(${SymBigger})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} >

              </div>
              <div class={' h-[50px] w-[50px] mb-3'} title={'缩小曲线'} onClick={sysSmallerClick} style={{ backgroundImage: `url(${SymSmaller})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} >

              </div>
              <div class={' h-[50px] w-[50px] mb-3'} title={'上移'} onClick={sysUpClick} style={{ backgroundImage: `url(${SymUp})`, backgroundSize: '150% 150%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} >

              </div>
              <div class={' h-[50px] w-[50px] mb-3'} title={'下移'} onClick={sysDownClick} style={{ backgroundImage: `url(${SymDown})`, backgroundSize: '150% 150%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} >

              </div>
            </div>

          </div>
        </div>
      )
    }
  }

})
