import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { useConfigStore } from "@/store/config";
import { callSpc, chooseFolder, getPrinterList, getSysConfig, setSavedSysConfig, } from "@/utils/call";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { showKeyBoard, sleep } from "@/utils/utils";
import { NButton, NDialogProvider, NModal, NScrollbar, NTag, useMessage } from "naive-ui";
import { mapState } from "pinia";
import { computed, defineComponent, onMounted, reactive, ref, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { ActualResult, SysConfigEntity, SysConfigModel } from "~/me";
import AcCode from "./AcCode";
import { formDivideStyle, noKeyBoardInputClass, optionMap } from "./enum";
import SerialNoRule from "./SerialNoRule";

export default defineComponent({
  name: 'SysConfig',
  setup(props, ctx) {
    const myFormRef = ref<MyFormWrapIns>()
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const loading = ref(false)
    const msg = useMessage()
    const alldata = reactive({
      cfgData: {} as SysConfigModel
    })
    const cfgData = computed(() => {
      return configStore.sysConfig
    })
    watch(() => cfgData.value, () => {
      if (loading.value) return
      alldata.cfgData = { ...cfgData.value }
    }, {
      immediate: true
    })
    // .then(() => {
    //   cfgData = reactive({
    //     ...configStore.sysConfig
    //   })
    // })
    const formOpt = reactive({
      optionMap: optionMap,
      itemList: [
        {
          type: 'box', label: '', width: 24, childCompList: [
            { type: 'divider', label: t('config.dataDisplay'), width: 24 },
            { type: 'select', label: t('config.defaultDecimalPlaces'), prop: 'Precision', width: 12 },
            { type: 'select', label: t('config.curvesPerScreen'), prop: 'MaxChartNum', width: 12 },
            { type: 'numInput', label: t('config.minimumStatisticalPoints'), prop: 'CpkMinPonitNum', numAsString: true, width: 12 },
            { type: 'numInput', label: t('config.statisticalDataPeriod'), prop: 'CpkInterval', numAsString: true, width: 12, suffix: 'ms' },
            { type: 'numInput', label: t('config.graphRefreshPeriod'), prop: 'RefreshInterval', numAsString: true, width: 12, suffix: 'ms' },
            // { type: 'input', label: t('config.maximumDisplayPoints'), prop: 'MaxPonitNum', width: 12 },
          ]
        },
        {
          type: 'box', label: '', width: 24, childCompList: [
            { type: 'divider', label: t('config.dataAcquisition'), width: 24 },
            { type: 'numInput', label: t('config.controlSignalInterval'), prop: 'ControlInterval', numAsString: true, width: 12, suffix: 'ms' },
            { type: 'numInput', label: t('config.dataAcquisitionInterval'), prop: 'ColloctInterval', numAsString: true, width: 12, suffix: 'ms' },
            { type: 'numInput', label: t('config.alarmSignalInterval'), prop: 'AlarmInterval', numAsString: true, width: 12, suffix: 'ms' },
            { type: 'switch', label: t('config.writeAlarmInfoToDatabase'), prop: 'AlarmToDb', width: 12, checkedValue: 1, uncheckedValue: 0, },
          ]
        },
        // {
        //   type: 'box', label: '', width: 24, childCompList: [
        //     { type: 'divider', label: '统计报表', width: 24 },
        //     { type: 'switch', label: '允许实时数据导出', prop: 'EnableExportReal', checkedValue: 1, uncheckedValue: 0, defaultValue: 0, width: 12, },
        //     // { type: 'select', label: '报表文件类型', prop: 'ExportRealType', width: 12 },
        //     { type: 'switch', label: '允许统计数据导出', prop: 'EnableExportStati', checkedValue: 1, uncheckedValue: 0, defaultValue: 0, width: 12, suffix: 'ms' },
        //     // { type: 'select', label: '曲线文件类型', prop: 'ExportStatiType', width: 12 },
        //     {
        //       type: 'input', label: '导出路径', prop: 'ExportPath', class: noKeyBoardInputClass, width: 12, suffix: () => {
        //         return <label onClick={(e) => {
        //           e.stopImmediatePropagation()
        //           e.stopPropagation()
        //           e.preventDefault()
        //           chooseFolder().then((e) => {
        //             e && (alldata.cfgData.ExportPath = e)
        //           })
        //         }} class={'z-50 relative -right-2'} >
        //           <NTag bordered={false} >选择目录</NTag>
        //         </label>
        //       }
        //     },
        //     // { type: 'text', },
        //     { type: 'switch', label: '允许打印统计数据', prop: 'EnablePrintStati', checkedValue: 1, uncheckedValue: 0, defaultValue: 0, width: 12, },
        //     { type: 'select', label: '使用的打印机', prop: 'ReportPrinter', width: 12 },
        //   ]
        // },
        // {
        //   type: 'box', label: '', width: 24, childCompList: [
        //     { type: 'divider', label: '编码规则', width: 24 },
        //     {
        //       type: 'free', label: '编码规则', renderComp: () => {
        //         return <SerialNoRule />
        //       }, width: 24
        //     },
        //   ]
        // },

      ] as formListItem[]
    })
    formOpt.itemList = formOpt.itemList.map((e) => {
      if (e.type == 'divider') {
        e.style = formDivideStyle
      }
      return e
    })

    // 语言切换时更新 formOpt 中的标签
    watch(() => i18nStore.langChangeCount, () => {
      sleep(100).then(() => {
        formOpt.itemList.forEach((e) => {
          if (e.type === 'box' && e.childCompList) {
            e.childCompList.forEach((child) => {
              if (child.type === 'divider') {
                if (child.label === '数据展示' || child.label === t('config.dataDisplay')) {
                  child.label = t('config.dataDisplay')
                } else if (child.label === '数据采集' || child.label === t('config.dataAcquisition')) {
                  child.label = t('config.dataAcquisition')
                }
              } else if (child.type === 'select') {
                if (child.prop === 'Precision') {
                  child.label = t('config.defaultDecimalPlaces')
                } else if (child.prop === 'MaxChartNum') {
                  child.label = t('config.curvesPerScreen')
                }
              } else if (child.type === 'input' || child.type === 'numInput') {
                if (child.prop === 'CpkMinPonitNum') {
                  child.label = t('config.minimumStatisticalPoints')
                } else if (child.prop === 'CpkInterval') {
                  child.label = t('config.statisticalDataPeriod')
                } else if (child.prop === 'RefreshInterval') {
                  child.label = t('config.graphRefreshPeriod')
                } else if (child.prop === 'MaxPonitNum') {
                  child.label = t('config.maximumDisplayPoints')
                } else if (child.prop === 'ControlInterval') {
                  child.label = t('config.controlSignalInterval')
                } else if (child.prop === 'ColloctInterval') {
                  child.label = t('config.dataAcquisitionInterval')
                } else if (child.prop === 'AlarmInterval') {
                  child.label = t('config.alarmSignalInterval')
                }
              } else if (child.type === 'switch') {
                if (child.prop === 'AlarmToDb') {
                  child.label = t('config.writeAlarmInfoToDatabase')
                }
              }
            })
          }
        })
      })

    })

    const submit = () => {
      loading.value = true
      // let oriSysConfig = configStore.originSysConfig
      // Object.keys(cfgData.value).map(e => {
      //   oriSysConfig.find(e1 => {
      //     if (e1.Name == e) {
      //       e1.Value = cfgData.value[e]
      //     }
      //   })
      // })
      // console.log("🪵 [index.tsx:124] ~ token ~ \x1b[0;32moriSysConfig\x1b[0m = ", oriSysConfig);
      console.log("🪵 [index.tsx:134] ~ token ~ \x1b[0;32malldata.cfgData\x1b[0m = ", alldata.cfgData);
      const saveData = { ...alldata.cfgData }
      callBrige(callFnName.SaveSysConfig, saveData)
        .then((e: number) => {
          msg.success(t('config.saveComplete'))
          setSavedSysConfig(saveData)
        }).finally(() => {
          loading.value = false
        })
    }
    const getPrinter = () => {
      getPrinterList().then(e => {
        formOpt.optionMap.ReportPrinter = e.map(e => {
          return {
            label: e,
            value: e
          }
        })
      })
    }
    getPrinter()
    watch(() => configStore.allSubmitCount, (val) => {
      myFormRef.value?.submit(submit)
    })
    watch(() => configStore.configTab, (val) => {
      if (val != 'sysConfigCollect') return
      getSysConfig()
    }, {
      immediate: true
    })
    watch(() => cfgData.value.InputType, (val) => {
      // if (val == "True") {
      //   // showKeyBoard()
      // }
    })

    onMounted(() => {
      // callSpc(callFnName.initKeyboardConfig)

    })
    //height:50px;width:20vw;font-size:22px
    // class={'relative -right-2'} tertiary size={'small'} onClick={() => {
    //   fileInput.value && fileInput.value.click()
    // }} 
    //for={'sysConfigFileInput'}
    return () => {
      return (

        // <NScrollbar class={'w-full h-full relative'} >

        <div class={'w-full h-full  overflow-x-hidden -top-5 px-4 text-lg bg-[#f5f6f6] '} style={{ height: 'calc(100% + 20px)' }}>
          <MyFormWrap class={'limit-item-width-form'} labelWidth={180} ref={myFormRef} form={alldata.cfgData} optionMap={formOpt.optionMap} hideBtn={true} itemList={formOpt.itemList} submitFn={submit} btnStyleStr={'margin-right:50px;margin-bottom:10px;'} loading={loading.value} />
        </div>
        // </NScrollbar>

      )
    }
  }

})