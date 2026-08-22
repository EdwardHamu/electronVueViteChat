import { useConfigStore } from "@/store/config";
import { NButton, NTabs, NTabPane, NIcon, useMessage, NDialogProvider, NDropdown } from "naive-ui";
import { computed, defineComponent, onBeforeMount, onMounted, reactive, ref, watch } from "vue";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import TabActiveImg from '@/assets/PnlBtnActive.png'
import Connect from "./Connect";
import DataConfig from "./dataConfig/DataConfig";
import KeyBorad from "@/components/KeyBoard/KeyBorad";
import { KeyboardAltRound } from "@vicons/material";
import { useMain } from "@/store";
import ConnectDevice from "./connectDevice";
import ConfigComp from "./configComp";
import SysConfig from "./sysConfig";
import DevConfig from "./devConfig";
import DevConfigNew from "./devConfigNew";
import DataCofigNew from "./dataCofigNew";
import FormulaConfig from "./FormulaConfig";
import AbsBottomBtn from "@/components/AbsBottomBtn";
import { useDataCfgInnerDataStore } from "./dataCofigNew/innerData";
import DataCfgOut from "./dataCfgOut";
import AdressTable from "./devConfigNew/AdressTable";
import DataGroup from "./devConfigNew/dataGroup";
import DeviceGroup from "./devConfigNew/dataGroup/DeviceGroup";
import { tabNameEnum } from "./devConfigNew/enum";
import DevDataGroup from "./devConfigNew/dataGroup/DevDataGroup";
import activeImg from '@/assets/LineDspButton_inactive.png'
import SysConfigCollect from "./sysConfig/sysConfigCollect";
import SysConfigStat from "./sysConfig/sysConfigStat";
import { useMyI18n } from "@/hooks/useMyI18n";
import { sleep } from "@/utils/utils";
export default defineComponent({
  name: 'Config',
  setup(props, ctx) {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const dataCfgInnerData = useDataCfgInnerDataStore()
    const msg = useMessage()
    const store = useMain()
    const alldata = reactive({
      advanceOption: [
        {
          label: t('config.deviceConfiguration'),
          key: "devConfig",
        }
      ]
    })

    // 语言切换时更新 advanceOption 中的标签
    watch(() => i18nStore.langChangeCount, () => {
      sleep(100).then(() => {
        alldata.advanceOption[0].label = t('config.deviceConfiguration')
      })
    })

    const curDevConfigRow = computed(() => {
      return configStore.curDevConfigRow
    })
    const addressShow = computed(() => {
      return configStore.addressShow
    })
    const DeviceGroupShow = computed(() => {
      return configStore.DeviceGroupShow
    })
    const DevDataGroupTabShow = computed(() => {
      return configStore.devDataGroupShow
    })
    const curGroupConfigRow = computed(() => {
      return configStore.curGroupConfigRow
    })
    const curDeviceGroupRow = computed(() => {
      return configStore.curDeviceGroupRow
    })
    const devConfigTabShow = computed(() => {
      return configStore.devConfigTabShow
    })
    const activeStyle = {
      // backgroundImage: `url(${TabActiveImg})`,
      // backgroundImage: `url(${TabActiveImg})`,
      background: `#f5f6f6`,
      backgroundSize: 'cover',
      borderBottom: "0",
      color: '#000',
      zIndex: 6
    }
    const defaultTab = 'sysConfig'
    const curTabValue = computed(() => {
      return configStore.configTab
    })
    const minWidth = store.isLandscape ? '12vw' : '120px'
    const maxWidth = store.isLandscape ? '32vw' : '52vw'
    configStore.setCommonTabWidthObj({ minWidth, maxWidth })
    const commonStyle = {
      maxWidth: maxWidth, fontSize: '20px', minWidth: minWidth, borderTop: '1px solid #58595a', borderRight: '1px solid #58595a', borderLeft: '1px solid #58595a', borderBottom: '1px solid #58595a',
      flexGrow: 1, background: '#fff', borderRadius: '12px 12px 0 0'
    }
    const cancel = () => {
      configStore.setIsShowConfig(false)
    }
    const confirm = () => {
      configStore.addSubmitCount()
      // msg.success('应用成功')
    }
    const handleAdvanceMenuSelect = (value: any) => {
      if (value === 'devConfig') {
        configStore.setDevConfigTabShow(true)
        configStore.setConfigTab(tabNameEnum.devConfig)
      }
    }
    const handleTabChange = (value: string) => {
      // curTabValue.value = value
      configStore.setConfigTab(value)
    }
    const invokeKeyBoard = () => {
      // window.ipc.invoke('keyboard')
      // store.setGlobalKeyBoardShow(true)
    }
    const btmBtnShow = computed(() => {
      return !dataCfgInnerData.devCfgShow
    })
    watch(() => configStore.curGroupConfigRow, (v) => {
      configStore.setDevDataGroupShow(false)
    })
    watch(() => configStore.isShowConfig, (v) => {
      if (!v) {
        configStore.setDevConfigTabShow(false)
      }
    })
    onMounted(() => {
      // console.log(`config mounted`,);
    })
    onBeforeMount(() => {
      configStore.setDevConfigTabShow(false)
      configStore.setConfigTab(defaultTab)
    })
    return () => {
      return (
        <div class={' w-screen h-screen absolute  flex flex-col z-10 bg-white overflow-hidden'}>
          <NDialogProvider >
            <div class={'absolute top-2 right-4'}>
              <NDropdown options={alldata.advanceOption}
                nodeProps={(option: any) => {
                  return {
                    style: 'font-size: 1.2rem; min-width: 14vw;'
                  }
                }}
                trigger="click" onSelect={handleAdvanceMenuSelect} size={'large'} class={'text-2xl'}  >
                <NButton style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} secondary strong={true} type="default" size={'large'} class={'h-12  shrink mr-2 '} >   <span class={'text-2xl'}>{t('config.advancedSettings')}</span>
                </NButton>
              </NDropdown>
            </div>
            <div class={"text-3xl flex justify-center items-center h-[54px] font-black"}>ECOCONTROL / V1.8.1.4</div>
            <div class={'h-full w-full shrink '} style={{ height: 'calc(100% - 80px - 54px)', backgroundColor: '#f5f6f6' }}>
              {/* <div class={"w-full h-[8px] bg-[#39393b] absolute top-14 z-[5]"}></div> */}

              <NTabs value={curTabValue.value} type="card" animated size="large" barWidth={1148} pane-class={'shrink-0 h-full'} class={'config-tab h-full w-full'} onUpdateValue={handleTabChange} defaultValue={defaultTab} >
                <NTabPane displayDirective="show:lazy" name={"sysConfig"} tab={t('config.basicConfiguration')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'sysConfig' ? activeStyle : {} } }}>
                  <div class={' h-full shrink border-0 border-t  border-gray-600 border-solid'}>
                    <SysConfig />
                  </div>
                </NTabPane>
                <NTabPane displayDirective="show:lazy" name={"sysConfigCollect"} tab={t('config.acquisitionConfiguration')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'sysConfigCollect' ? activeStyle : {} } }}>
                  <div class={' h-full shrink border-0 border-t  border-gray-600 border-solid'}>
                    <SysConfigCollect />
                  </div>
                </NTabPane>
                <NTabPane displayDirective="show:lazy" name={"sysConfigStat"} tab={t('config.statisticalConfiguration')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'sysConfigStat' ? activeStyle : {} } }}>
                  <div class={' h-full shrink border-0 border-t  border-gray-600 border-solid'}>
                    <SysConfigStat />
                  </div>
                </NTabPane>


                {/* {
                  curDevConfigRow.value && addressShow.value &&
                  <NTabPane displayDirective="show:lazy" name={"dataAddress"} tab={`数据地址-${curDevConfigRow.value.DriverName}(${curDevConfigRow.value.Name})`} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'dataAddress' ? activeStyle : {} } }}>
                    <div class={' h-full shrink overflow-auto border-t border-0 border-gray-600 border-solid'}>
                      <AdressTable />
                    </div>
                  </NTabPane>
                } */}

                <NTabPane displayDirective="show:lazy" name={"dataGroup"} tab={t('config.productClassification')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'dataGroup' ? activeStyle : {} } }}>
                  <div class={' h-full shrink overflow-auto border-t border-0 border-gray-600 border-solid'}>
                    <DataGroup />
                  </div>
                </NTabPane>

                {
                  devConfigTabShow.value && <NTabPane displayDirective="show:lazy" name={"devConfig"} tab={t('config.deviceConfiguration')} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'devConfig' ? activeStyle : {} } }}>
                    <div class={' h-full shrink overflow-auto border-t border-0 border-gray-600 border-solid'}>
                      <DevConfigNew />
                    </div>
                  </NTabPane>
                }

                {/* {
                  curGroupConfigRow.value && DeviceGroupShow.value &&
                  <NTabPane displayDirective="show:lazy" name={"deviceGroup"} tab={`${curGroupConfigRow.value.GroupName} ➔设备`} tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'deviceGroup' ? activeStyle : {} } }}>
                    <div class={' h-full shrink overflow-auto border-t border-0 border-gray-600 border-solid'}>
                      <DeviceGroup />
                    </div>
                  </NTabPane>
                } */}

                {/* {
                  curDeviceGroupRow.value && DevDataGroupTabShow.value &&
                  <NTabPane displayDirective="show:lazy" name={tabNameEnum.devDataGroup} tab={`${curDeviceGroupRow.value?.DeviceName} ➔数据`} tabProps={{ style: { ...commonStyle, ...curTabValue.value == tabNameEnum.devDataGroup ? activeStyle : {} } }}>
                    <div class={' h-full shrink overflow-auto border-t border-0 border-gray-600 border-solid'}>
                      <DevDataGroup />
                    </div>
                  </NTabPane>
                } */}



                {/* <NTabPane displayDirective="show:lazy" name={"devConfig"} tab="设备配置" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'devConfig' ? activeStyle : {} } }}>
                <div class={' h-full shrink'}>
                  <DevConfig />
                </div>
              </NTabPane> */}
                {/* <NTabPane displayDirective="show:lazy" name={"dataConfig"} tab="数据采集" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'dataConfig' ? activeStyle : {} } }}>
                  <div class={' h-full shrink'}>
                    <DataCofigNew />
                  </div>
                </NTabPane>
                <NTabPane displayDirective="show:lazy" name={"dataCfgOut"} tab="数据配置" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'dataCfgOut' ? activeStyle : {} } }}>
                  <div class={' h-full shrink'}>
                    <DataCfgOut />
                  </div>
                </NTabPane> */}
                {/* <NTabPane displayDirective="show:lazy" name={"formulaConfig"} tab="配方配置" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'formulaConfig' ? activeStyle : {} } }}>
                <div class={' h-full shrink'}>
                  <FormulaConfig />
                </div>
              </NTabPane> */}
                {/* <NTabPane displayDirective="show:lazy" name={"connect"} tab="连接配置" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'connect' ? activeStyle : {} } }}>
                <div class={' h-full shrink'}>
                  <Connect />
                </div>
              </NTabPane> */}
                {/* <NTabPane displayDirective="show:lazy" name={"data"} tab="数据配置" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'data' ? activeStyle : {} } }}>
                <div class={' h-full '}>
                  <DataConfig />
                </div>
              </NTabPane> */}
                {/* <NTabPane displayDirective="show:lazy" name={"connectDevice"} tab="连接设备" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'connectDevice' ? activeStyle : {} } }}>
                <div class={' h-full '}>
                  <ConnectDevice />
                </div>
              </NTabPane> */}
                {/* <NTabPane displayDirective="show:lazy" name={"configComp"} tab="test" tabProps={{ style: { ...commonStyle, ...curTabValue.value == 'configComp' ? activeStyle : {} } }}>
                <div class={' h-full '}>
                  <ConfigComp />
                </div>
              </NTabPane> */}

              </NTabs>
            </div>

            {/* <div class={'fixed left-2 bottom-6'} title={'虚拟键盘'}>
            <NButton circle type={'success'} v-slots={{
              icon: () => {
                return <NIcon><KeyboardAltRound /></NIcon>
              }
            }} onClick={invokeKeyBoard} >

            </NButton>
          </div> */}
            {/* 
          <div class={'w-[40vw] h-[30vh] absolute left-2 bottom-[20vh] bg-red-200 z-[5000]'}>
            <KeyBorad />
          </div> */}

            {btmBtnShow.value && <AbsBottomBtn cancelFn={cancel} confirmFn={confirm} />}
          </NDialogProvider>
        </div>
      )
    }
  }

})
