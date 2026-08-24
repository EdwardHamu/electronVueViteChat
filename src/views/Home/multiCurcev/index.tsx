import { PlayArrowOutlined, StopCircleOutlined } from "@vicons/material";
import { DropdownProps, NButton, NDropdown, NIcon, NSpace } from "naive-ui";
import { computed, defineComponent, onBeforeUnmount, reactive, watch } from "vue";
import { DataConfigEntity, DataGroupEntity, ModbusAdressRow } from "~/me";
import CurcevChartRow from "../curcev/CurcevChartRow";
import { useCurcevInnerDataStore } from "../curcev/innerData";
import { chartId } from "./enum";
import niotLogo from '@/assets/login_logos.png';
import { DataTypeEnum, DataTypeOnIndex } from "../config/dataCofigNew/enum";
import { getMenuOptList, menuIdSplit, menuOptList, MenuOptType, menuPropEnum } from "../curcev/enum";
import activeImg from '@/assets/LineDspButton_inactive.png'
import { buildMenuOpt, sleep } from "@/utils/utils";
import { useConfigStore } from "@/store/config";
import { DropdownMixedOption } from "naive-ui/es/dropdown/src/interface";
import { useI18n } from "vue-i18n";
import { usei18nStore } from "@/store/i18n";

export default defineComponent({
  name: 'MultiCurcev',
  setup(props, ctx) {
    const curCevInnerData = useCurcevInnerDataStore()
    const configStore = useConfigStore()
    const cfgDataList = computed<DataConfigEntity[]>(() => {
      return curCevInnerData.dataCfgList
    })
    const { t } = useI18n()
    const i18nStore = usei18nStore()
    const commonData = reactive({
      // cfgDataList: [] as DataConfigEntity[],
      curPage: 0,
      getCfgLoading: false,
      pageSize: 3,
      menuOpt: [] as DropdownMixedOption[],
      refreshHide: false,
      menuShow: true
    })
    watch([() => configStore.chartDataAdressList, () => i18nStore.langChangeCount], ([v, n]) => {
      // console.log("🪵 [index.tsx:216] ~ token ~ \x1b[0;32mv\x1b[0m = ", v);
      sleep(50).then(() => {
        let list = v
        let opt = getMenuOptList(t)
        let sitem = opt!.find(e => e.key == menuPropEnum.dataSource)
        if (sitem) {
          if (list.length == 0) {
            // commonData.cfgDataList.map(e => buildMenuOpt(e))
            sitem.children = list.map(e => buildMenuOpt(e, configStore)) as any
          } else {
            sitem.children = list.map(e => buildMenuOpt(e, configStore))
            // .filter((e: ModbusAdressRow) => (e.State == 1 && DataTypeOnIndex.includes(e.DataType))).map(e => {
            //   return {
            //     ...buildMenuOpt(e),
            //     children: e.children?.map(ee => buildMenuOpt(ee))
            //   }
            // }) as MenuOptType[]
          }
        }
        commonData.menuOpt = opt as any
        commonData.menuShow = false
        sleep(50).then(() => {
          commonData.menuShow = true
        })
      })

    }, {
      immediate: true
    })
    // const menuOpt = computed(() => {
    //   let opt = menuOptList
    //   let sitem = opt!.find(e => e.key == menuPropEnum.dataSource)
    //   if (sitem) {
    //     if (cfgDataList.value.length == 0) {
    //       let list: MenuOptType[] = []
    //       sitem.children = list
    //     } else {
    //       sitem.children = cfgDataList.value.filter((e: DataConfigEntity) => (e.State == 1 && DataTypeOnIndex.includes(e.DataType)))
    //         .map(e => {
    //           return {
    //             ...buildMenuOpt(e),
    //             children: e.children?.map(ee => buildMenuOpt(ee))
    //           }
    //         }) as MenuOptType[]
    //       // .map(e => {
    //       //   return {
    //       //     label: e.Name,
    //       //     key: menuPropEnum.dataSource + menuIdSplit + e.GId,
    //       //     trueKey: e.GId
    //       //   }
    //       // }) 
    //     }

    //   }
    //   // sitem && (sitem.children = commonData.cfgDataList.filter((e: DataConfigEntity) => (e.State == 1 && DataTypeOnIndex.includes(e.DataType))).map(e => {
    //   //   return {
    //   //     label: e.Name,
    //   //     key: menuPropEnum.dataSource + menuIdSplit + e.GId,
    //   //     trueKey: e.GId
    //   //   }
    //   // }) as MenuOptType[])
    //   console.log("🪵 [index.tsx:57] ~ token ~ \x1b[0;32mopt\x1b[0m = ", opt);

    //   return opt
    // })
    const nextShow = computed(() => {
      return (commonData.curPage + 1) * commonData.pageSize < curCevInnerData.dataCfgList.length
    })
    const prevShow = computed(() => {
      return commonData.curPage > 0
    })
    const dataList = computed(() => {
      // let list = curCevInnerData.dataCfgList.filter(e => e.DataType == DataTypeEnum.Chart)
      // let allSubList: DataConfigEntity[] = []
      // list.forEach(e => {
      //   if (e.children && e.children.length > 0) {
      //     allSubList.push(...e.children!)
      //   }
      // })
      let allSubList = configStore.curMultiChartAdress || []
      return allSubList
      // curCevInnerData.dataCfgList.filter(e => e.DataType == DataTypeEnum.Chart).slice(commonData.curPage * commonData.pageSize, (commonData.curPage + 1) * commonData.pageSize)
    })

    const handleSelect = (key: string) => {
      let type = key.split(menuIdSplit)[0]
      let trueKey = key.split(menuIdSplit)[1]
      if (type == menuPropEnum.dataSource) {
        let item = configStore.chartDataGroupList.find(e => e.GId == trueKey)
        if (item) {
          if (configStore.curMultiChartAdress.some(e => e.GId == item!.GId)) {
            configStore.removeMultiChartAdress(item)
          } else {
            configStore.addMultiChartAdress(item)
          }
        }

        // curCevInnerData.getCpkFn()
      }

    }
    const nextPage = () => {
      commonData.curPage = commonData.curPage + 1
    }
    const prevPage = () => {
      commonData.curPage = commonData.curPage - 1
    }
    const nodeProps = () => {
      return {
        style: 'min-width: 14vh;'
      }
    }
    const renderLabel: DropdownProps['renderLabel'] = (option) => {
      let text = option.label
      if (option.trueKey && configStore.curMultiChartAdress.some(e => e.GId == option.trueKey)) {
        text += ' ✔️'
      }

      return (
        <span>{text}</span>
      )
    }
    watch(() => dataList.value.length, (v) => {
      commonData.refreshHide = true
      sleep(200).then(() => {
        commonData.refreshHide = false
      })
    })
    onBeforeUnmount(() => {
      curCevInnerData.addReMounted()
    })

    return () => {
      return (
        <div class={'w-full h-full flex flex-col'}>
          <div class={'pl-2 flex'}>
            <NSpace align={'center'}>
              {/* {curCevInnerData.isGetting ?
                <NButton type={'warning'} size={'large'} v-slots={{
                  icon: () => <NIcon><StopCircleOutlined /></NIcon>
                }} onClick={curCevInnerData.stopColFn} >停止采集</NButton>
                : <NButton type={'primary'} size={'large'} v-slots={{
                  icon: () => <NIcon><PlayArrowOutlined /></NIcon>
                }} onClick={curCevInnerData.startColFn} >开始采集</NButton>
              } */}
              {
                commonData.menuShow && <NDropdown options={commonData.menuOpt} renderLabel={renderLabel} onSelect={handleSelect} trigger="click" placement="bottom-start" size={'large'} class={'text-2xl'} nodeProps={nodeProps} >
                  {/* style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} */}
                  <NButton style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} secondary strong={true} type="default" size={'large'} class={'h-12 w-28 shrink mr-2 '} >   <span class={'text-2xl'}>{t('menu.menu')}</span>
                  </NButton>
                </NDropdown>
              }

            </NSpace>

            <div class='ml-auto  h-16' >
              {/* <NSpace align={'center'}>
                {nextShow.value && <NButton onClick={nextPage} size={'large'} >上一页</NButton>}
                {prevShow.value && <NButton onClick={prevPage} size={'large'} >下一页</NButton>}

              </NSpace> */}
              <img class={'h-full'} src={niotLogo} />

            </div>
          </div>
          <div class={'flex-shrink w-full h-full pb-2 overflow-hidden'}>
            <div class={'w-full h-full flex flex-col'}>
              {!commonData.refreshHide && dataList.value.map((e: DataGroupEntity, i) => {
                return <div class={'w-full h-full flex-1'}>
                  <CurcevChartRow i={i} adressRow={e} chartId={chartId} />
                </div>
              })}
            </div>
          </div>
        </div>
      )
    }
  }

})
