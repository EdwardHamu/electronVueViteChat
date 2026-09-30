import { NTabs, NTabPane, useMessage, useNotification, NIcon, NDialogProvider, NMessageProvider, NNotificationProvider, NSpin } from "naive-ui";
import { defineComponent, KeepAlive, onMounted, onUnmounted, ref, Transition, watch } from "vue";
import BtmBtn from './BtmBtn'
import PicPane from "./picPane/PicPane";
import RightValueBlock from "./RightValueBlock";
import activeImg from '@/assets/PnlBtnActive.png'
import emptyAduio from '@/assets/10-seconds-of-silence.mp3'
import { useMain } from "@/store";
import { initWinFn, isLowResolution, showKeyBoard, sleep, updateFormulaConfig } from "@/utils/utils";
import { useRealTimeStore } from "@/store/realtime";
import Trend from "./trend/Trend";
import Statistical from "./statistical/Statistical";
import Config from "./config/Config";
import { useConfigStore } from "@/store/config";
import GlobalKeyBoard from "./GlobalKeyBoard";
import ProductLine from "./productLine";
import { ActualResult, DeviceGroupEntity, FormulaConfigEntity, FormulaParamEntity, ModbusAdressRow } from "~/me";
import { callFnName } from "@/utils/enum";
import { callSpc, getSysConfig } from "@/utils/call";
import ProductHistory from "./product/productHistory";
import Curcev from "./curcev";
import FormulaConfig from "./config/FormulaConfig";
import MultiCurcev from "./multiCurcev";
import classNames from "classnames";
import { KeyboardAltOutlined } from "@vicons/material";
import GlobalKeyBoard2 from "./GlobalKeyBoard2";
import { callBrige } from "@/utils/callm";
import { useFormulaStore } from "@/store/formula";
import FormulaConfigNew from "./config/formulaConfigNew";
import { noKeyBoardInputClass } from "./config/sysConfig/enum";
import { KEYBOARD_ROOT_CLASS } from "@/utils/virtualKeyboard";
import Ecc from "./ecc";
import Scada from "./scada";
import { useI18n } from "vue-i18n";
import { usei18nStore } from "@/store/i18n";
// import { useSvc } from "./svc";
//@ts-ignore

export default defineComponent({
  name: 'Home',
  setup(props) {
    const store = useMain()
    const realtimeStore = useRealTimeStore()
    const configStore = useConfigStore()
    const formulaStore = useFormulaStore()
    window.$message = useMessage()
    const notification = useNotification()
    window.showError = (msg: string) => {
      notification.error({
        content: msg,
        duration: 5000,
        closable: true
      })
    }
    store.initDb()
    let startFetch = true
    const activeStyle = {
      backgroundImage: `url(${activeImg})`,
      backgroundSize: 'cover',
      color: '#fff',
      paddingBottom: '4px',
      marginTop: '-4px',
      zIndex: 6
    }
    const { t } = useI18n()
    const i18nStore = usei18nStore()
    const curTabValue = ref('curcev')
    const stopTrendLoading = ref(false)
    const width = store.isLandscape ? '11vw' : '18vw'
    // const maxWidth = store.isLandscape ? '14vw' : '25vw'
    const commonStyle = {
      // width: width,
      border: 'none', fontSize: '20px',
      minWidth: width,
      // maxWidth: maxWidth,
      borderBottom: '3px solid #58595a'
    }
    const audio = new Audio(emptyAduio)
    audio.loop = true
    window.frontFn = {}

    const handleTabChange = (value: string) => {
      curTabValue.value = value
      store.setHomeTab(value)
    }
    const handleBlur = () => {
      // window.ipc.invoke('test1').then((val) => {
      //   console.log(`dll`, val);
      // })
      // window.ipc.invoke('serialize',{'fff':'ffggg'}).then((val) => {
      //   console.log(`sdll`, val);
      // })
      audio.play()
    }
    const handleResize = () => {
      store.setIsLowRes(isLowResolution())
    }
    const handleFocus = () => {
      audio.pause()
    }
    const loopGetData = async () => {
      while (startFetch) {
        await sleep(1000)
        realtimeStore.fetchDiameterData()
      }
    }
    const handleAllInputFocuse = (event: any) => {
      // 虚拟键盘自己的输入区不算「最后聚焦的输入框」
      if (event.target?.closest && event.target.closest('.' + KEYBOARD_ROOT_CLASS)) return
      if (event.target?.tagName === 'INPUT') {
        store.setLastFocusedInput(event.target)
        // console.log("🚀 ~ file: index.tsx:64 ~ handleAllInputFocuse ~ event.target:", event.target)
        // lastFocusedInput = event.target;
      }

    }
    const keyboradInit = () => {
      // callSpc(callFnName.initKeyboardConfig).then((res: ActualResult) => {
      // })
    }
    const startSpcSys = () => {
      callSpc(callFnName.startSpcSystem).then((res: ActualResult) => {
        console.log(`startSpcSystem `,);
        keyboradInit()
      })
      // window.CefSharp.BindObjectAsync("spcJsBind").then(() => {
      //   window.spcJsBind.startSpcSystem().then(function (actualResult:ActualResult) {
      //     console.info(actualResult);
      //   });
      // })
    }
    store.setIsLowRes(isLowResolution())
    window.addEventListener('resize', handleResize)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('focusin', handleAllInputFocuse);

    const refreshAllConfig = (e?: any) => {
      // console.log("🪵 [index.tsx:183] ~ token ~ \x1b[0;32mrefresh\x1b[0m = ", refresh);
      return getSysConfig().then(() => {
        updateFormulaConfig(configStore)
        return initData()
      }).then(() => {
        if (e) {
          window.$message.success('配置已刷新')
        }
      })
      // return getAllActiveConfigData().then(() => {
      //   e && msg.success('配置已刷新')
      // })
    }

    const initData = () => {
      configStore.setChartDataGroupList([])
      return callBrige(callFnName.InitService).then((res: string) => {
        // console.log("🪵 [index.tsx:123] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        callBrige(callFnName.GetChartDeviceGroups).then((res: DeviceGroupEntity[]) => {
          configStore.setChartDataAdressList(res)
        })
        callBrige(callFnName.GetShowDeviceGroups).then((res: DeviceGroupEntity[]) => {
          configStore.setShowDataAdressList(res)
        })
      })
    }
    configStore.setInitServiceFn(initData)
    configStore.setRefreshAllConfigFn(refreshAllConfig)
    // getSysConfig()
    refreshAllConfig()
    initWinFn()
    onMounted(() => {
      // loopGetData()
      sleep(1000).then(() => {
        if (window.chrome) {
          // startSpcSys()
        }
      })
      // initData()
      // callBrige(callFnName.InitDevice).then((res: string) => {

      // })


    })
    watch(() => configStore.isShowConfig, (val: boolean) => {
      if (!val) {
        // initData()
      }
    })
    watch(() => configStore.sysConfig.CurrentFormulaId, () => {
      updateFormulaConfig(configStore)

    })
    onUnmounted(() => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('focusin', handleAllInputFocuse)
      startFetch = false
    })
    // console.log("🪵 [index.tsx:130] ~ token ~ \x1b[0;32mstore.isLandscape \x1b[0m = ", store.isLandscape);


    return () => {
      return (
        <div class={'w-full h-full flex flex-col overflow-hidden'} id={'indexCon'}>
          <GlobalKeyBoard2 />
          {stopTrendLoading.value && <div class={'fixed inset-0 z-[9999] flex items-center justify-center bg-white/40'}>
            <NSpin size={'large'} />
          </div>}
          {/* <KeepAlive> */}
          {
            store.isLandscape ? <div class={'h-full flex overflow-hidden'}>
              <div class={'w-3/4'}>
                {/* 装饰条（目前 hidden，即 display:none，三处一起关掉；要恢复去掉 hidden 即可）：z-0 使其位于所有 tab 之下（未选中 tab 是 position:relative 且在 DOM 中靠后，选中 tab 为 z-6）；
                    top 54 + 高 14 = 68，比 tab 底边（约 65）低 3px，在所有 tab 下方露出一条平整黑边，tab 之间的空隙也会露出 */}
                <div class={"w-full h-[14px] bg-[#39393b] absolute top-[54px] z-0 hidden"}></div>


                <NTabs type="card" animated size="large" barWidth={1148} pane-class={'shrink-0 h-full'} class={'home-tab h-full w-full'} onUpdateValue={handleTabChange} defaultValue={'curcev'} >
                  <NTabPane displayDirective="if" name="curcev" tab={t('menu.realTimeData')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'curcev' ? activeStyle : {} } }}>
                    <div class={' h-full'}>
                      <Curcev />
                    </div>
                  </NTabPane>
                  <NTabPane displayDirective="if" name="multiCurcev" tab={t('menu.trendChart')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'multiCurcev' ? activeStyle : {} } }}>
                    <div class={'h-full'}>
                      <MultiCurcev />
                    </div>
                  </NTabPane>
                  <NTabPane displayDirective="if" name="summary" tab={t('menu.statisticsChart')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'summary' ? activeStyle : {} } }}>
                    <div class={'h-full'}>
                      <Statistical />
                    </div>
                  </NTabPane>
                  <NTabPane displayDirective="if" name="scada" class="scada-pane" tab={t('menu.scada')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'scada' ? activeStyle : {} } }}>
                    <div class={'h-full'}>
                      <Scada />
                    </div>
                  </NTabPane>
                  {/* <NTabPane displayDirective="if" name="eccPic" tab={t('menu.deviationMeter')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'eccPic' ? activeStyle : {} } }}>
                    <div class={'h-full'}>
                      <Ecc />
                    </div>
                  </NTabPane> */}
                  {/* <NTabPane displayDirective="if" name="pic" tab="图像" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'pic' ? activeStyle : {} } }}>
                <div class={' h-full'}>
                  <PicPane />
                </div>
              </NTabPane> */}
                  {/* <NTabPane displayDirective="if" name="trend" tab="趋势图" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'trend' ? activeStyle : {} } }}>
                <div class={'h-full'}>
                  <Trend />
                </div>
              </NTabPane>
              <NTabPane displayDirective="if" name="summary" tab="统计图" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'summary' ? activeStyle : {} } }}>
                <div class={'h-full'}>
                  <Statistical />
                </div>
              </NTabPane> */}
                  {/* <NTabPane displayDirective="if" name="productLine" tab="生产线" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'productLine' ? activeStyle : {} } }}>
                <div class={'h-full'}>
                  <ProductLine />
                </div>
              </NTabPane>
              <NTabPane displayDirective="if" name="event" tab="事件" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'event' ? activeStyle : {} } }}>
                Hey Jude
              </NTabPane>
              <NTabPane displayDirective="if" name="print" tab="打印机" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'print' ? activeStyle : {} } }}>
                Hey Jude
              </NTabPane> */}
                </NTabs>
              </div>

              <div class={'w-1/4'}>
                <RightValueBlock />
              </div>
            </div> :
              <div class={'h-full flex overflow-hidden flex-col'}>
                <div class={'h-1/3 relative'}>
                  <div class={"w-full h-[14px] bg-[#39393b] absolute top-[54px] z-0 hidden"}></div>


                  <RightValueBlock />
                </div>
                <div class={'h-2/3 relative'}>
                  {/* 装饰条：容器必须 relative，否则会以视口定位跑到屏幕顶部盖住上方区块的 tab；
                      z-0 使其位于所有 tab 之下（选中/未选中都盖住它）；top 54 + 高 14 = 68，比 tab 底边（约 65）低 3px，在 tab 下方露出一条平整黑边 */}
                  <div class={"w-full h-[14px] bg-[#39393b] absolute top-[54px] z-0 hidden"}></div>
                  <NTabs type="card" animated size="large" barWidth={1148} pane-class={'shrink-0 h-full'} class={'home-tab h-full w-full'} onUpdateValue={handleTabChange} defaultValue={'curcev'} >
                    <NTabPane displayDirective="if" name="curcev" tab={t('menu.realTimeData')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'curcev' ? activeStyle : {} } }}>
                      <div class={' h-full'}>
                        <Curcev />
                      </div>
                    </NTabPane>
                    <NTabPane displayDirective="if" name="multiCurcev" tab={t('menu.trendChart')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'multiCurcev' ? activeStyle : {} } }}>
                      <div class={'h-full'}>
                        <MultiCurcev />
                      </div>
                    </NTabPane>
                    <NTabPane displayDirective="if" name="summary" tab={t('menu.statisticsChart')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'summary' ? activeStyle : {} } }}>
                      <div class={'h-full'}>
                        <Statistical />
                      </div>
                    </NTabPane>
                    <NTabPane displayDirective="if" name="scada" class="scada-pane" tab={t('menu.scada')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'scada' ? activeStyle : {} } }}>
                      <div class={'h-full'}>
                        <Scada />
                      </div>
                    </NTabPane>
                    {/* <NTabPane displayDirective="if" name="eccPic" tab="偏心仪" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'eccPic' ? activeStyle : {} } }}>
                      <div class={'h-full'}>
                        <Ecc />
                      </div>
                    </NTabPane> */}
                  </NTabs>
                </div>

              </div>
          }

          {/* </KeepAlive> */}
          {/* <GlobalKeyBoard /> */}
          <NDialogProvider>
            <BtmBtn setStopTrendLoading={(value: boolean) => { stopTrendLoading.value = value }} />
          </NDialogProvider>
          <Transition name='full-pop'>
            {configStore.isShowConfig && <Config />}
          </Transition>

          <NMessageProvider>
            <Transition name='full-pop'>
              {configStore.productHistoryShow && <ProductHistory />}
            </Transition>
          </NMessageProvider>

          {/* <Transition name='full-pop'>
            {configStore.formulaCfgShow && <FormulaConfig />}
          </Transition> */}
          <NDialogProvider>
            <Transition name='full-pop'>
              {formulaStore.show && <FormulaConfigNew />}
            </Transition>
          </NDialogProvider>
          {/* <Transition name='full-pop'>
            {configStore.productLogShow && <ProductLog />}
          </Transition> */}
        </div>
      )
    }
  }

})
