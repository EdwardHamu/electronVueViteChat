import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { useConfigStore } from "@/store/config";
import { callSpc, chooseFolder, getPrinterList, getSysConfig, setSavedSysConfig, } from "@/utils/call";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { showKeyBoard, sleep } from "@/utils/utils";
import { NButton, NDialogProvider, NFormItem, NModal, NScrollbar, NSwitch, NTag, useMessage } from "naive-ui";
import { mapState } from "pinia";
import { computed, defineComponent, onMounted, reactive, ref, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { ActualResult, SysConfigEntity, SysConfigModel } from "~/me";
import AcCode from "./AcCode";
import { formDivideStyle, noKeyBoardInputClass, optionMap } from "./enum";
import SerialNoRule from "./SerialNoRule";
import DemoRangeDialog from "./DemoRangeDialog";

export default defineComponent({
  name: 'SysConfig',
  setup(props, ctx) {
    const myFormRef = ref<MyFormWrapIns>()
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const loading = ref(false)
    const msg = useMessage()
    const alldata = reactive({
      cfgData: {} as SysConfigModel,
      demoRangeShow: false,
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
            { type: 'divider', label: t('config.deviceInformation'), width: 24 },
            { type: 'input', label: t('config.companyName'), prop: 'CompanyName', width: 12 },
            { type: 'input', label: t('config.deviceNumber'), prop: 'MachineCode', width: 12 },
          ]
        },
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
        {
          type: 'box', label: '', width: 24, childCompList: [
            { type: 'divider', label: t('config.otherConfiguration'), width: 24 },
            // { type: 'input', label: '激活码', prop: 'Cdkey', width: 12 },
            {
              type: 'free', label: t('config.enterActivationCode'), renderComp: () => {
                return <AcCode v-model:value={alldata.cfgData.Cdkey} />
              }, width: 12
            },
            { type: 'switch', label: t('config.touchKeyboardInput'), prop: 'InputType', checkedValue: 1, uncheckedValue: 0, defaultValue: 1, width: 12 },
            {
              // 展示模式：开关与范围配置即时持久化（localStorage），不随表单保存
              type: 'free', label: t('config.demoMode'), prop: 'DemoMode', renderComp: () => {
                // free 类型不渲染表单 label，这里自带 NFormItem 以与其他配置项观感一致
                return <NFormItem label={t('config.demoMode')} showFeedback={false}>
                  <div class={'flex items-center gap-3'}>
                    <NSwitch value={!!configStore.demoMode} data-demo-mode-switch
                      onUpdateValue={(v: boolean) => configStore.setDemoMode(v ? 1 : 0)} />
                    <NButton size="small" disabled={!configStore.demoMode} data-demo-range-btn
                      onClick={() => { alldata.demoRangeShow = true }}>{t('config.demoRangeBtn')}</NButton>
                  </div>
                </NFormItem>
              }, width: 12
            },
            // { type: 'text', label: '', prop: 'InputType', text: '', width: 24 },
            // { type: 'text', label: '', prop: 'Version', text: '', width: 24 },
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
                if (child.label === '设备信息' || child.label === t('config.deviceInformation')) {
                  child.label = t('config.deviceInformation')
                } else if (child.label === '其他配置' || child.label === t('config.otherConfiguration')) {
                  child.label = t('config.otherConfiguration')
                }
              } else if (child.type === 'input' || child.type === 'numInput') {
                if (child.prop === 'CompanyName') {
                  child.label = t('config.companyName')
                } else if (child.prop === 'MachineCode') {
                  child.label = t('config.deviceNumber')
                }
              } else if (child.type === 'switch') {
                if (child.prop === 'InputType') {
                  child.label = t('config.touchKeyboardInput')
                }
              } else if (child.type === 'free') {
                if (child.prop === 'Cdkey' || child.label === '激活码' || child.label === t('config.enterActivationCode')) {
                  child.label = t('config.enterActivationCode')
                } else if (child.prop === 'DemoMode') {
                  child.label = t('config.demoMode')
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
      if (val != 'sysConfig') return
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
          <DemoRangeDialog show={alldata.demoRangeShow} onClose={() => { alldata.demoRangeShow = false }} />
        </div>
        // </NScrollbar>

      )
    }
  }

})