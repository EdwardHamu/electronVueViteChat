import SimpleTable from "@/components/SimpleTable";
import { useConfigStore } from "@/store/config";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { NButton, NDrawer, NDrawerContent, NScrollbar, useDialog } from "naive-ui";
import { computed, defineComponent, reactive, ref, watch } from "vue";
import { ConnectComModel, DeviceConfigEntity, simpleTableColumn } from "~/me";
import type { Ref } from "vue";
import type { MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import AddForm from "./addForm";
import AdressForm from "./AdressForm";
import AdressTable from "./AdressTable";
import { getConFormComp } from "./ConForm";
import ConnectComForm from "./connect/ConnectComForm";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import { useMyI18n } from "@/hooks/useMyI18n";
import { tabNameEnum } from "./enum";

export default defineComponent({
  name: 'devConfigNew',  //设备配置
  setup(props, ctx) {
    const data = ref<DeviceConfigEntity[]>([])
    const otherData = reactive({
      showConnectComForm: false,
      showAdressForm: false,
      curConnectStr: '' as string | undefined,
      curRow: undefined as DeviceConfigEntity | undefined,
      addressTableShow: false
    })
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const configTab = computed(() => {
      return configStore.configTab
    })
    /** 连接配置表单实例（合并编辑抽屉左侧栏），由连接表单的 getFormRefFn 回传 */
    let conFormRef: Ref<MyFormWrapIns | undefined> | null = null
    /** 合并入口：一个按钮同时负责连接配置（左侧栏）与数据地址（主区域）的编辑 */
    const configClick = (row: simpleTableColumn, item: DeviceConfigEntity) => {
      rowClick(row, item)
      configStore.setAddressShow(true)
    }
    /** 保存左侧栏的连接配置（校验通过后写入 ConnectString） */
    const saveConnect = () => {
      conFormRef?.value?.submit((form: any) => {
        const str = JSON.stringify(form)
        otherData.curConnectStr = str
        updateRow({ ConnectString: str })
      })
    }
    const rowClick = (row: simpleTableColumn, item: DeviceConfigEntity) => {
      otherData.curConnectStr = item.ConnectString

      otherData.curRow = item
      configStore.setCurDevConfigRow(item)
    }
    const deleteClick = (row: simpleTableColumn, item: DeviceConfigEntity) => {
      callBrige(callFnName.DeleteDevcieConfig, item.GId).then(() => {
        window.$message.success(t('config.deleteSuccess'))
        getData()
      })
    }
    const addClick = (row: simpleTableColumn, item: DeviceConfigEntity) => {
      configStore.setAddFormShow(true)

    }
    const stateClick = (row: simpleTableColumn, item: DeviceConfigEntity) => {
      rowClick(row, item)
      updateRow({ State: item.State })
      // configStore.setStateShow(true)
    }
    const columns = ref<simpleTableColumn[]>([
      { label: t('config.deviceType'), prop: 'DriverName', flex: 3, btnFn: () => { } },
      {
        label: t('config.deviceName'), prop: 'Name', flex: 2, isInput: true
        , btnFn: rowClick
        , inputUpdateFn: () => {
          console.log("🪵 [index.tsx:30] ~ token ~ \x1b[0;32m otherData.curRow\x1b[0m = ", otherData.curRow);
          if (otherData.curRow) {
            updateRow({ Name: otherData.curRow.Name })
          }
        }
      },
      { label: t('config.connAndAddr'), prop: 'ConnectString', flex: 1, btnText: t('config.edit'), btnFn: configClick },
      { label: t('config.status'), prop: 'State', flex: 1, isSwitch: true, mapFn: (col: any, item: DeviceConfigEntity) => { return item.State == 1 ? t('config.enabled') : t('config.disabled') }, btnFn: stateClick },
      // { label: '', prop: 'op', flex: 1, btnText: '删除', btnFn: deleteClick, btnType: 'danger' },
    ])
    watch(() => i18nStore.langChangeCount, () => {
      columns.value[0].label = t('config.deviceType')
      columns.value[1].label = t('config.deviceName')
      columns.value[2].label = t('config.connAndAddr')
      columns.value[3].label = t('config.status')
    })

    const getData = () => {
      callBrige(callFnName.GetDevcieConfigs).then((res: DeviceConfigEntity[]) => {
        // res.push({ DriverName: '新增设备', Name: '', State: 0, CreateTime: '', isNewRow: true })

        data.value = res
      })
    }
    getData()
    configStore.setUpdateDevConfigRowFn(getData)

    const updateRow = (dat: any) => {
      let data = { ...otherData.curRow, ...dat, }
      callBrige(callFnName.SaveDevcieConfig, data).then((res: any[]) => {
        // console.log("🪵 [index.tsx:11] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        getData()
        window.$message.success(t('config.saveSuccess'))
        otherData.showConnectComForm = false
      })
    }

    watch(() => configTab.value, () => {
      getData()
    })

    return () => {
      return (
        <div class={'w-full  overflow-x-hidden -top-5 px-4 text-lg bg-[#f5f6f6]'} style={{
          height: 'calc(100vh - 200px)'
        }}>
          <SimpleTable originMode={false}
            dat={data.value} col={columns.value}
            rowClickFn={rowClick}
            defIsEditing={true}
            addAndEditAndDelFn={[addClick, () => { }, deleteClick]}
            addRowProp={'DriverName'} />

          <AddForm />


          <NDrawer
            v-model:show={configStore.addressShow}
            width="92vw" // 如果需要横向也铺满全屏，可以改为 100vw
            placement="right"
            resizable
          >
            <NDrawerContent title={`${t('config.connectionConfiguration')} / ${t('config.dataAddress')}${otherData.curRow ? `（${otherData.curRow.DriverName} - ${otherData.curRow.Name}）` : ''}`} closable>
              {{
                default: () => (
                  <div class={'flex w-full h-full overflow-hidden'}>
                    {/* 左侧栏：连接配置 */}
                    <div class={'w-[400px] flex-shrink-0 flex flex-col con-sidebar-form pr-3 mr-3'}
                      style={{ borderRight: '1px solid #c2cbd4' }}>
                      <div class={'text-lg font-bold mb-2 text-[#4d75a1]'}>{t('config.connectionConfiguration')}</div>
                      <NScrollbar class={'flex-1 min-h-0'}>
                        {(() => {
                          const TargetForm = getConFormComp(otherData.curRow?.DriverName || '')
                          // key 按设备行切换，保证换设备时表单重建并回填对应 ConnectString
                          return <TargetForm key={otherData.curRow?.GId || ''}
                            getFormRefFn={(r: Ref<MyFormWrapIns | undefined>) => { conFormRef = r }}
                            show={true} connectStr={otherData.curConnectStr} />
                        })()}
                      </NScrollbar>
                      <NButton class={'mt-2 flex-shrink-0'} type="primary" data-save-connect
                        onClick={saveConnect}>{t('config.saveConnect')}</NButton>
                    </div>
                    {/* 主区域：数据地址 */}
                    <div class={'flex-1 min-w-0 h-full overflow-hidden'}>
                      <AdressTable />
                    </div>
                  </div>
                ),
                footer: () => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    {/* <NButton onClick={() => { configStore.setAddressShow(false) }}>取消</NButton> */}
                    <NButton style={{ width: '160px', height: '40px', fontSize: '24px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { configStore.setAddressShow(false) }}>{t('config.back')}</NButton>
                    {/* <NButton type="primary" onClick={() => { }}>确定</NButton> */}
                  </div>
                )
              }}
            </NDrawerContent>
          </NDrawer>

          {/* <AdressTable
            curRow={otherData.curRow}
            show={otherData.showAdressForm} updateShowFn={(v: boolean) => {
              otherData.showAdressForm = v
            }} /> */}
        </div>
      )
    }
  }

})