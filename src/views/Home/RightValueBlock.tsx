import { NTabs, NTabPane, NDropdown, DropdownProps, MenuOption, NScrollbar } from "naive-ui";
import { computed, defineComponent, onBeforeUnmount, onMounted, onUnmounted, PropType, reactive, ref, watch } from "vue";
import activeImg from '@/assets/PnlBtnActive.png'
import { useMain } from "@/store";
import closeBtn from '@/assets/LedCloseBtn.png'
import addBtn from '@/assets/LedAddBtn.png'
import lefticon from '@/assets/SymLeft.png'
import righticon from '@/assets/SymRight.png'
import { storeToRefs } from "pinia";
import { useRealTimeStore } from "@/store/realtime";
import { buildMenuOpt, getLocalStorage, setLocalStorage, sleep } from "@/utils/utils";
import { useCurcevInnerDataStore } from "./curcev/innerData";
import { CpkModel, DataValue, menuOption, ModbusAdressRow } from "~/me";
import { cpkModelPropName } from "./curcev/enum";
import classNames from "classnames";
import RightOtherValue from "./RightOtherValue";
import { useConfigStore } from "@/store/config";
import { useSvc } from "./svc";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { useI18n } from "vue-i18n";
import { useMyI18n } from "@/hooks/useMyI18n";

export interface RightValueType {
  label?: string,
  title?: string,
  value?: number,
  unit?: string,
  stand?: RightValueType[],
  GId?: string,
  Precision?: number
}
let defStandValList: RightValueType[] = []
let zero = 0
export const ValueRow = defineComponent({
  name: 'ValueRow',
  props: {
    data: Object as PropType<RightValueType>,
    x: {
      type: Number,
      required: true
    },
    y: {
      type: Number,
      required: true
    },
    fixNum: {
      type: Number,
      default: 8
    },
    i: {
      type: Number,
      default: -1
    }
  },
  setup(props, ctx) {
    const { t, i18nStore } = useMyI18n()
    const store = useMain()
    const realtimeStore = useRealTimeStore()
    const curCevInnerData = useCurcevInnerDataStore()
    const configStore = useConfigStore()
    const initTextData = () => {
      defStandValList = [
        {
          label: 'pc',
          title: t('data.deviationMius'),
          value: 0.00000
        },
        {
          label: 'Standard',
          title: t('data.standard'),
          value: 0.00000
        }
      ]
    }
    initTextData()
    const alldata = reactive({
      value: 0,
      stand: defStandValList.map(e => ({ ...e })),
      timeIns: null as ReturnType<typeof setInterval> | null,
      tol: { up: 0, down: 0 }, //上下公差
      menuShow: true,
      langChangeCount: i18nStore.langChangeCount
    })
    const pdata = computed(() => props.data)
    // const curOption = ref<MenuOption>()
    // const { dataSourceList } = storeToRefs(store)
    const dataSourceList = computed(() => configStore.showDataAdressList.map(e => {
      let res = {
        ...buildMenuOpt(e, configStore, true),
        // children: e.children?.map(ee => buildMenuOpt(ee))
      }
      flashMenu()
      return res
    }))

    const curStandIdx = ref(0)
    const flashMenu = () => {
      alldata.menuShow = false
      sleep(50).then(() => {
        alldata.menuShow = true
      })
    }

    watch(() => i18nStore.langChangeCount, (v) => {
      sleep(500).then(() => {
        initTextData()

        alldata.stand.forEach((e, i) => e.title = defStandValList[i].title)
        alldata.langChangeCount = v

      })

    }, {
      immediate: true
    })


    // const initOption = () => {
    //   store.rightBlockDataMap[props.x][props.y] && (
    //     curOption.value = store.rightBlockDataMap[props.x][props.y]
    //   )
    // }
    // initOption()


    // const data = computed(() => {
    //   if (!curOption.value) return {}
    //   return realtimeStore.rightRealTimeData[curOption.value.key as string] || {}
    // })

    const data = computed(() => {
      let myData = props.data
      // console.log("🪵 [RightValueBlock.tsx:98] ~ token ~ \x1b[0;32mmyData\x1b[0m = ", myData);
      let formulaParamList = configStore.curEnableFormulaParamList
      let dat: RightValueType = {
        stand: [] as Object[],
        label: '',
        title: '',
        value: 0
      }
      if (!myData) return dat
      if (myData.GId) {
        // console.log("🪵 [RightValueBlock.tsx:94] ~ token ~ \x1b[0;32mmyData\x1b[0m = ", props.data);
        let stItem = formulaParamList?.find(e => e.DataGroupId == myData!.GId)
        // console.log("🪵 [RightValueBlock.tsx:107] ~ token ~ \x1b[0;32mformulaParamList\x1b[0m = ", formulaParamList);
        // console.log("🪵 [RightValueBlock.tsx:107] ~ token ~ \x1b[0;32mstItem\x1b[0m = ", stItem);
        alldata.stand[1].value = stItem?.Standard  //标准值
        alldata.tol.up = stItem?.UpperTol || 0
        alldata.tol.down = -(stItem?.LowerTol || 0)
      }
      if (myData.label && !myData.value) {
        myData.value = 0
      }
      return myData
    })


    // const handleMenuSelect: DropdownProps['onSelect'] = (val, option) => {
    //   curOption.value = option
    //   store.addRightBlockData(option, props.x, props.y)
    // }
    const handleMenuSelect: DropdownProps['onSelect'] = (val, option) => {
      console.log("🪵 [RightValueBlock.tsx:103] ~ token ~ \x1b[0;32mval\x1b[0m = ", val, option);
      let opt = option as any
      let dat: RightValueType = {
        stand: defStandValList.map(e => { return { ...e } }) as Object[],
        label: opt.DataName,
        title: '',
        value: 0.00000,
        GId: opt.GId,
        unit: opt.Unit,
        Precision: opt.Precision
      }
      // curOption.value = dat
      let list: menuOption[] = curCevInnerData.infoList
      if (props.i > -1) {
        list[props.i] = dat as menuOption
      }
      curCevInnerData.setInfoList(list)
      // store.addRightBlockData(option, props.x, props.y)
    }
    const handleDel = () => {
      // curOption.value = {}
      // store.removeRightBlockData(props.x, props.y)
      let list: menuOption[] = curCevInnerData.infoList
      if (props.i > -1) {
        list[props.i] = {} as menuOption
      }
      curCevInnerData.setInfoList(list)
    }
    const standLeft = () => {
      if (!data.value) return
      if (curStandIdx.value == 0) {
        curStandIdx.value = data.value.stand!.length - 1
      } else {
        curStandIdx.value--
      }
    }
    const standRight = () => {
      if (!data.value) return
      if (curStandIdx.value == data.value.stand!.length - 1) {
        curStandIdx.value = 0
      } else {
        curStandIdx.value++
      }
    }
    const standVal = computed(() => {
      // data.value.stand[curStandIdx.value].value
      // console.log("🪵 [RightValueBlock.tsx:169] ~ token ~ \x1b[0;32mdata.value.stand[curStandIdx.value].value\x1b[0m = ", data.value.stand);
      let _ = alldata.langChangeCount

      let val = alldata.stand[curStandIdx.value].value || 0
      // console.log("🪵 [RightValueBlock.tsx:204] ~ token ~ \x1b[0;32malldata.stand\x1b[0m = ", alldata.stand);
      let res = alldata.stand[curStandIdx.value].title + ' : ' + val.toFixed(props.data?.Precision || 3)
      return res
    })

    const loopGetVal = () => {
      // console.log("🪵 [RightValueBlock.tsx:207] ~计时器设置 ",);
      if (props.data && props.data.GId) {
        // console.log("🪵 [RightValueBlock.tsx:207] ~计时器设置voer ",);

        callBrige(callFnName.GetRealtimeData, props.data.GId).then((res: DataValue) => {
          // console.log("🪵 [RightValueBlock.tsx:167] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
          // console.log("🪵 [RightValueBlock.tsx:174] ~ token ~ \x1b[0;32mprops.data!.stand![1].value!\x1b[0m = ", res.Value, props.data!.stand![1].value!);
          if (!res) {
            return
          }
          props.data!.value = res.Value
          // props.data!.value = val
          let diff = res.Value - alldata.stand![1].value!
          // console.log("🪵 [RightValueBlock.tsx:175] ~ token ~ \x1b[0;32mdiff\x1b[0m = ", Number((diff * 1).toFixed(props.data!.Precision || 2)));
          if (alldata.stand) {
            alldata.stand![0].value = Number((diff * 1).toFixed(props.data!.Precision || 2))
          }

        })
      }
      // sleep(configStore.sysConfig.ColloctInterval || 500).then(() => {
      //   loopGetVal()
      // })
    }
    const valueIsOk = computed(() => {
      let dat = { ok: false, msg: '' }
      if (!alldata.stand) { dat.ok = true; return dat }
      if (!alldata.stand[0].value) { dat.ok = true; return dat }
      if (alldata.stand[0].value >= alldata.tol.down && alldata.stand[0].value <= alldata.tol.up) {
        dat.ok = true
        return dat
      } else {
        if (alldata.stand[0].value < alldata.tol.down) {
          dat.ok = false
          dat.msg = 'dowm'
          return dat
        }
        if (alldata.stand[0].value > alldata.tol.up) {
          dat.ok = false
          dat.msg = 'up'
          return dat
        }
      }
    })
    // watch(() => props.data, (val) => {
    //   // console.log("🪵 [RightValueBlock.tsx:179] ~ token ~ \x1b[0;32mval\x1b[0m = ", val);
    //   if (val && val.GId) {
    //     loopGetVal()
    //   }

    // }, { immediate: true })

    onMounted(() => {
      if (configStore.sysConfig.ColloctInterval) {
        sleep(200).then(() => {
          loopGetVal()
          alldata.timeIns = setInterval(() => {
            loopGetVal()
          }, configStore.sysConfig.ColloctInterval || 500);
        })

      } else {
        sleep(1000).then(() => {
          loopGetVal()
          alldata.timeIns = setInterval(() => {
            loopGetVal()
          }, configStore.sysConfig.ColloctInterval || 500);
        })
      }


    })
    onBeforeUnmount(() => {
      alldata.timeIns && clearInterval(alldata.timeIns)
    })

    const renderAddOrDel = () => {
      return !data.value.label && alldata.menuShow ?
        <NDropdown options={dataSourceList.value}
          nodeProps={(option: any) => {
            return {
              style: 'font-size: 1.4rem; width: 12vw;'
            }
          }}
          trigger="click" onSelect={handleMenuSelect} size={'large'} class={'text-2xl'}  >
          <img class={'ml-auto h-[32px] relative top-[2px] cursor-pointer'} src={addBtn}></img>
        </NDropdown> :
        <img class={'ml-auto h-[32px] relative top-[2px]   cursor-pointer'} src={closeBtn} onClick={handleDel} ></img>
    }


    return () => {
      return (
        <div class={classNames(' shrink mb-1', { 'w-full': store.isLandscape, 'w-1/2 pr-1': !store.isLandscape })}>
          <div class={classNames('flex items-center w-full  py-1', { 'pt-0': props.y == 0 || (!store.isLandscape && props.y == 1) })}>
            <span class={'text-2xl'}>{data.value.label || ''}</span>
            {renderAddOrDel()}
          </div>
          <div class={'flex items-end w-full h-[76px]  border border-solid border-[#e4e4e5] shadow-inner'} style={{ backgroundImage: `linear-gradient(#cdcdcd, #f2f2f2 ,#cdcdcd)` }}>
            {

            }
            <div class={'w-full h-full shrink bg-white flex justify-end pr-3 items-center py-2 value-number relative'}>
              {
                props.data?.label && !valueIsOk.value?.ok && <div class={'absolute left-[2px] top-[0] ' + classNames({
                  'text-[#ff0000]': !valueIsOk.value?.ok && valueIsOk.value?.msg == 'dowm',
                  'text-[#ff8d3f]': !valueIsOk.value?.ok && valueIsOk.value?.msg == 'up'
                })}>
                  {valueIsOk.value?.msg == 'dowm' ? `- ${t('data.tolerance')}` : `+ ${t('data.tolerance')}`}
                </div>
              }

              <span class={classNames(' font-semibold ',
                {
                  'text-[#003a62]': valueIsOk.value?.ok,
                  'text-[#ff0000]': !valueIsOk.value?.ok && valueIsOk.value?.msg == 'dowm',
                  'text-[#ff8d3f]': !valueIsOk.value?.ok && valueIsOk.value?.msg == 'up'
                },
                { 'text-4xl': store.isLowRes, ' text-[4.3rem]': !store.isLowRes })}
              >{props.data?.value?.toFixed ? props.data?.value?.toFixed(props.data?.Precision || 4) : "" || ''}</span>
            </div>
            <div class={'h-full pl-2 min-w-[50px] flex flex-col justify-end text-lg font-semibold text-[#5e5452]'}  >
              <span class={'mb-2'}>{props.data?.unit || '  '}</span>
            </div>
          </div>
          <div class={'flex items-center w-full h-1/4 pt-1'}>
            <div class={'h-full w-1/6 flex cursor-pointer btn-bg'} onClick={standLeft} ><img class={'m-auto h-1/2'} src={lefticon}></img></div>
            <div class={'h-full w-full shrink btn-bg mx-2 flex items-center justify-center'}>
              {
                props.data?.value ? <span class={` font-semibold ${store.isLowRes ? ' text-xs' : 'text-base '}`}>{standVal.value
                }</span> :
                  props.data?.label ? zero.toFixed(props.data?.Precision || 4) : ''
              }

              {/* {
                console.log("🪵 [RightValueBlock.tsx:322] ~ token ~ \x1b[0;32mstandVal.value\x1b[0m = ", props.data?.value, standVal.value)

              } */}
            </div>
            <div class={'h-full w-1/6 flex cursor-pointer btn-bg'} onClick={standRight} ><img class={'m-auto  h-1/2'} src={righticon}></img></div>
          </div>
        </div>
      )
    }
  }

})
//------------------------------------------------------------------------------------------------------------------

export default defineComponent({
  name: 'RightValueBlock',
  setup(props, ctx) {
    const curCevInnerData = useCurcevInnerDataStore()
    const configStore = useConfigStore()
    const store = useMain()
    // const defCpkList = ['Avg', 'Max', 'Min', 'Sd', 'Ca', 'Cp', 'Cpk'].map(e => { return { label: e, title: cpkModelPropName[e],value:0, unit: curCevInnerData.curDataCfgEntity?.Unit } })
    const activeStyle = {
      backgroundImage: `url(${activeImg})`,
      backgroundSize: 'cover',
      color: '#fff',
      paddingBottom: '4px',
      marginTop: '-4px',
      zIndex: 6
    }
    const width = store.isLandscape ? '8vw' : '14vw'
    const commonStyle = {
      width: width, border: 'none', fontSize: '20px',
      minWidth: "100px",
      borderBottom: '3px solid #58595a'
    }
    const { t, i18nStore } = useMyI18n()
    const infoList = computed(() => { return curCevInnerData.infoList })
    const curTabValue = ref('value1')
    let startLoop = false
    const cpkList = computed(() => {

      if (!curCevInnerData.curCpk) return []
      let list = Object.keys(curCevInnerData.curCpk).map((key) => {
        let k = key as keyof CpkModel
        return {
          label: key,
          title: cpkModelPropName[k],
          value: curCevInnerData.curCpk![k],
          unit: curCevInnerData.curDataCfgEntity?.Unit
        }
      })
      let sortList = [] as typeof list
      let tempList = ['Avg', 'Max', 'Min', 'Sd', 'Ca', 'Cp', 'Cpk']
      list.forEach(e => {
        let idx = tempList.findIndex(e1 => e1 == e.label)
        if (idx > -1) {
          sortList[idx] = e
        }
      })
      // console.log("🚀 ~ cpkList ~ sortList:", sortList)
      return sortList
    })
    const initInfoList = () => {
      let list: menuOption[] = getLocalStorage('infoList')
      if (!list || !list.length || list.length == 0) {
        list = new Array(18).fill(0).map((e, i) => {
          return {
            label: ``,
            title: ``,
            value: undefined,
            unit: curCevInnerData.curDataCfgEntity?.Unit
          }
        })
      } else {
        list = list.map((e, i) => {
          if (!e.label) return {
            ...e,
            value: undefined
          }
          return {
            ...e,
            value: 0
          }
        })
      }
      curCevInnerData.setInfoList(list)
      // infoList.value = list
    }
    const fixNumRef = computed(() => {
      // let val = curCevInnerData.sysConfig.find(e => e.Name == 'Precision')?.Value
      // let val = configStore.originSysConfig.find(e => e.Name == 'Precision')?.Value
      let val = configStore.sysConfig.Precision
      return Number(val)
    })
    const handleTabChange = (value: string) => {
      curTabValue.value = value
    }
    const loopShow = async () => {
      const arr = new Array(3)
      while (startLoop) {
        await sleep(5000)
        let idx = curTabValue.value.slice(-1) as unknown as number
        // console.log("🚀 ~ file: RightValueBlock.tsx:134 ~ loopShow ~ idx:", idx)
        if (idx == arr.length) {
          idx = 1
        } else {
          idx++;
        }
        curTabValue.value = `value${idx}`
      }
    }

    onMounted(() => {
      // loopShow()
      initInfoList()
    })

    onUnmounted(() => {
      startLoop = false
    })

    return () => {
      return (
        <NTabs type="card" animated size="large" barWidth={1148} value={curTabValue.value} pane-class={'shrink-0 h-full'} class={'home-tab h-full w-full'} onUpdateValue={handleTabChange} defaultValue={'value1'} >
          <NTabPane displayDirective="if" name="value1" tab={t('menu.measureValue') + '1'} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'value1' ? activeStyle : {} } }}>
            <div class={classNames(' h-full px-2 flex  overflow-y-auto', { 'flex-col': store.isLandscape, 'flex-wrap': !store.isLandscape })}>
              {/* <NScrollbar> */}
              {infoList.value.slice(0, 6).map((e, i) => {
                return <ValueRow key={i} x={0} y={i} data={e} i={i} fixNum={fixNumRef.value} />
              })}
              {/* </NScrollbar> */}

            </div>
          </NTabPane>
          <NTabPane displayDirective="if" name="value2" tab={t('menu.measureValue') + '2'} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'value2' ? activeStyle : {} } }}>
            {/* <div class={' h-full px-2 flex flex-col overflow-y-auto'}>
              <RightOtherValue />
            </div> */}
            <div class={classNames(' h-full px-2 flex  overflow-y-auto', { 'flex-col': store.isLandscape, 'flex-wrap items-start justify-center': !store.isLandscape })}>
              {/* <NScrollbar> */}
              {infoList.value.slice(6, 12).map((e, i) => {
                return <ValueRow key={i} x={0} y={i} data={e} i={6 + i} fixNum={fixNumRef.value} />
              })}
              {/* </NScrollbar> */}

            </div>
          </NTabPane>
          {/* <NTabPane displayDirective="show:lazy" name="value2" tab="value2" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'value2' ? activeStyle : {} } }}>
            <div class={' h-full px-2 flex flex-col'}>
              {new Array(6).fill({}).map((_, i) => {
                return <ValueRow key={i} x={1} y={i} />
              })}
            </div>

          </NTabPane> */}
          <NTabPane displayDirective="show:lazy" name="value3" tab={t('menu.measureValue') + '3'} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'value3' ? activeStyle : {} } }}>
            {/* <div class={' h-full px-2 flex flex-col'}>
              {new Array(6).fill({}).map((_, i) => {
                return <ValueRow key={i} x={2} y={i} />
              })}
            </div> */}
            <div class={classNames(' h-full px-2 flex  overflow-y-auto', { 'flex-col': store.isLandscape, 'flex-wrap': !store.isLandscape })}>
              {/* <NScrollbar> */}
              {infoList.value.slice(12, 18).map((e, i) => {
                return <ValueRow key={i} x={0} y={i} data={e} i={12 + i} fixNum={fixNumRef.value} />
              })}
              {/* </NScrollbar> */}

            </div>
          </NTabPane>
        </NTabs>
      )
    }
  }

})
