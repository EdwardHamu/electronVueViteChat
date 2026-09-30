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
            { type: 'divider', label: t('config.statisticalReport'), width: 24 },
            { type: 'switch', label: t('config.allowRealTimeDataExport'), prop: 'EnableExportReal', checkedValue: 1, uncheckedValue: 0, defaultValue: 0, width: 12, },
            // { type: 'select', label: '报表文件类型', prop: 'ExportRealType', width: 12 },
            { type: 'switch', label: t('config.allowStatisticalDataExport'), prop: 'EnableExportStati', checkedValue: 1, uncheckedValue: 0, defaultValue: 0, width: 12, suffix: 'ms' },
            // { type: 'select', label: '曲线文件类型', prop: 'ExportStatiType', width: 12 },
            {
              type: 'input', label: t('config.exportPath'), prop: 'ExportPath', class: noKeyBoardInputClass, width: 12, suffix: () => {
                return <label onClick={(e) => {
                  e.stopImmediatePropagation()
                  e.stopPropagation()
                  e.preventDefault()
                  chooseFolder().then((e) => {
                    if (e && alldata.cfgData.ExportPath == 'Export') {
                      alldata.cfgData.ExportPath = e
                    } else {
                      e && e != 'C:\\' && (alldata.cfgData.ExportPath = e)
                    }
                  })
                }} class={'z-50 relative -right-2'} >
                  <NTag bordered={false} >{t('config.selectDirectory')}</NTag>
                </label>
              }
            },
            // { type: 'text', },
            { type: 'switch', label: t('config.allowPrintingStatisticalData'), prop: 'EnablePrintStati', checkedValue: 1, uncheckedValue: 0, defaultValue: 0, width: 12, },
            { type: 'select', label: t('config.printerUsed'), prop: 'ReportPrinter', width: 12 },
          ]
        },
        {
          type: 'box', label: '', width: 24, childCompList: [
            { type: 'divider', label: t('config.serialNoRule'), width: 24 },
            {
              type: 'free', label: t('config.serialNoRule'), renderComp: () => {
                return <SerialNoRule />
              }, width: 24
            },
          ]
        },

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
                if (child.label === '统计报表' || child.label === t('config.statisticalReport')) {
                  child.label = t('config.statisticalReport')
                } else if (child.label === '编码规则' || child.label === t('config.serialNoRule')) {
                  child.label = t('config.serialNoRule')
                }
              } else if (child.type === 'switch') {
                if (child.prop === 'EnableExportReal') {
                  child.label = t('config.allowRealTimeDataExport')
                } else if (child.prop === 'EnableExportStati') {
                  child.label = t('config.allowStatisticalDataExport')
                } else if (child.prop === 'EnablePrintStati') {
                  child.label = t('config.allowPrintingStatisticalData')
                }
              } else if (child.type === 'input' || child.type === 'numInput') {
                if (child.prop === 'ExportPath') {
                  child.label = t('config.exportPath')
                }
              } else if (child.type === 'select') {
                if (child.prop === 'ReportPrinter') {
                  child.label = t('config.printerUsed')
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
      if (val != 'sysConfigStat') return
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