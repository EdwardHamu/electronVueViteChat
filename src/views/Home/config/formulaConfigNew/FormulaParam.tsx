import { formListItem, MyFormWrap } from "@/components/MyFormWrap/MyFormWrap";
import { useConfigStore } from "@/store/config";
import { useFormulaStore } from "@/store/formula";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { ajaxPromiseAll, safeJsonParse, getAllDataUnderGroup } from "@/utils/utils";
import { computed, defineComponent, Transition, ref, watch, reactive } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { DataGroupEntity, DeviceGroupEntity, FormulaConfigEntity, FormulaParamEntity, GroupConfigEntity, ModbusAdressRow } from "~/me";
import { DeviceClassEnum } from "../devConfigNew/enum";

export default defineComponent({
  name: 'FormulaParam',
  setup(props, ctx) {
    const formulaStore = useFormulaStore()
    const configstore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const curFormulaConfigRow = computed(() => formulaStore.curFormulaConfigRow)
    const alldata = reactive({
      adressList: [] as DataGroupEntity[],
      paramList: [] as FormulaParamEntity[],
      formCfg: {
        optionMap: {

        },
        itemList: [
          { type: 'numInput', label: t('data.standard2'), prop: 'Standard', numAsString: true, width: 24, },
          { type: 'numInput', label: t('data.toleranceUp'), prop: 'UpperTol', numAsString: true, width: 24, },
          { type: 'numInput', label: t('data.toleranceDwon'), prop: 'LowerTol', numAsString: true, width: 24, },
        ] as formListItem[],
        hideBtn: true,
        noLargeBtn: true,
        btnStyleStr: `margin-right: 8px;margin-bottom:8px;`,
        // renderToBtn: () => {
        //   return (
        //     <NButton class={'mr-3 relative mb-2'} onClick={cancel} size={'large'} >取消</NButton>
        //   )
        // },
      },
      formMap: {} as Record<string, FormulaParamEntity>,
      otherCalcParamNameMap: {
        'bh': t('config.wallThickness')
      } as Record<string, string>,
    })

    // 语言切换时更新 reactive 对象中的标签
    watch(() => i18nStore.langChangeCount, () => {
      alldata.formCfg.itemList[0].label = t('data.standard2')
      alldata.formCfg.itemList[1].label = t('data.toleranceUp')
      alldata.formCfg.itemList[2].label = t('data.toleranceDwon')
      alldata.otherCalcParamNameMap['bh'] = t('config.wallThickness')
    })

    const curDeviceGroupRow = computed(() => formulaStore.curDeviceGroupRow)
    const pararmListWidthAdress = computed(() => {
      return alldata.paramList.map(e => { return { ...e, AdressItem: alldata.adressList.find(item => item.GId == e.DataGroupId) } })
    })
    const curDataGroupAdressList = computed(() => {

      // console.log("🪵 [FormulaParam.tsx:31] ~ token ~ \x1b[0;32mlist\x1b[0m = ", list);
      // return list
    })
    const getData = (row: FormulaConfigEntity | null) => {
      if (!row) return
      callBrige(callFnName.GetFormulaParams, row.GId).then((res: FormulaParamEntity[]) => {
        // console.log("🪵 [FormulaParam.tsx:68] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        alldata.paramList = res
        // alldata.paramList = [...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res, ...res,]
        if (res.length == 0) {
          let itemList = alldata.adressList.map(e => {
            let item: FormulaParamEntity = { DataGroupId: e.GId, FormulaId: row.GId }
            return item
          })
          callBrige(callFnName.SaveFormulaParams, itemList).then((res: FormulaParamEntity[]) => {
            getData(row)
          })
        } else {
          if (res.filter(e => e.DataGroupId && e.DataGroupId.search(/\*/) == -1).length < alldata.adressList.length) {
            let itemList = alldata.adressList.filter(e => !res.find(item => item.DataGroupId == e.GId)).map(e => {
              let item: FormulaParamEntity = { DataGroupId: e.GId, FormulaId: row.GId }
              return item
            })
            callBrige(callFnName.SaveFormulaParams, itemList).then((res: FormulaParamEntity[]) => {
              getData(row)
            })
          }
          // let curAllGroupData = getAllDataUnderGroup(configstore)
          // if(res.length < curAllGroupData.length){

          // }
        }




      })
    }
    // const getOtherCalcParam = (v: DeviceGroupEntity) => {
    //   callBrige(callFnName.GetFormulaParams, v.).then((res: FormulaParamEntity[]) => {

    //   })
    // }
    watch(() => curDeviceGroupRow.value, (v: DeviceGroupEntity | null | undefined) => {
      if (!v) return
      // console.log("🪵 [FormulaParam.tsx:126] ~ token ~ \x1b[0;32mcurParamList.value.find(item => item.DataGroupId == (v.GId + '*' + 'bh'))\x1b[0m = ", curParamList.value, v.DeviceClass == DeviceClassEnum.Ecc.toString());

      if (v.DeviceClass == DeviceClassEnum.Ecc.toString() && !alldata.paramList.find(item => item.DataGroupId == (v.GId + '*' + 'bh'))) {
        let dat: FormulaParamEntity = {
          // GId: v.GId + '*' + 'bh',
          FormulaId: curFormulaConfigRow.value?.GId,
          DataGroupId: v.GId + '*' + 'bh',
        }
        // console.log("🪵 [FormulaParam.tsx:128] ~ token ~ \x1b[0;32mdat\x1b[0m = ", dat);
        callBrige(callFnName.SaveFormulaParams, [dat]).then((res: FormulaParamEntity[]) => {
          getData(curFormulaConfigRow.value)
        })
      }
      // if(!alldata.formMap[curParamList.value[0].FormulaId + '*' + 'bh']){
      //   let dat:FormulaParamEntity = {
      //     GId:v.GId+'-'+'bh',
      //     FormulaId: curParamList.value[0].FormulaId,
      //     DataGroupId: v.GId+'-'+'bh',
      //   }
      //   alldata.formMap[curParamList.value[0].FormulaId + '*' + 'bh']y = {
      //     FormulaId: curParamList.value[0].FormulaId,

      //   }
      // }
    })
    watch(() => curFormulaConfigRow.value, (v: FormulaConfigEntity | null) => {
      getData(v)
    }, {
      immediate: true
    })
    watch(() => formulaStore.curEnableDataGroupConfig, (v: GroupConfigEntity | null | undefined) => {
      // let item = formulaStore.curEnableDataGroup
      // let list = safeJsonParse(item?.AddressIds || '[]') as string[]
      // callBrige(callFnName.GetDataAddressesWithIds, list).then((res: ModbusAdressRow[]) => {
      //   alldata.adressList = res
      // })
      callBrige(callFnName.GetFormulaFields).then((res: DataGroupEntity[]) => {
        console.log("🪵 [FormulaParam.tsx:105] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        alldata.adressList = res

      })
    }, {
      immediate: true
    })

    const curParamList = computed(() => {
      return pararmListWidthAdress.value.filter(item => {
        let DeviceGroupId = ''
        if (item.DataGroupId && item.DataGroupId?.search(/\*/) > -1) {
          DeviceGroupId = item.DataGroupId?.split('*')[0]!
          console.log("🪵 [FormulaParam.tsx:177] ~ token ~ \x1b[0;32mDeviceGroupId\x1b[0m = ", DeviceGroupId);
        }
        return item.AdressItem?.DeviceGroupId == curDeviceGroupRow.value?.GId || DeviceGroupId == curDeviceGroupRow.value?.GId
      })
    })
    const getFormMap = () => {
      return alldata.formMap
    }
    formulaStore.setGetParamFormMapFn(getFormMap)

    // 参数卡片标题, 对计算参数(如壁厚)使用i18n翻译, 并依赖 langChangeCount 确保语言切换时刷新
    const getParamDisplayName = (item: FormulaParamEntity & { AdressItem?: DataGroupEntity }) => {
      const _ = i18nStore.langChangeCount
      const prop = item.DataGroupId?.split('*')[1]
      if (prop && alldata.otherCalcParamNameMap[prop]) {
        return alldata.otherCalcParamNameMap[prop]
      }
      return item.AdressItem?.DataName || prop || ''
    }

    /** 一个参数一张卡片：标题 = 参数名，内容 = 标准值 / 上公差 / 下公差（标签在上方，卡片窄也放得下各语言的标签） */
    const renderCard = (item: FormulaParamEntity & { AdressItem?: DataGroupEntity }) => {
      let totalId = item.FormulaId + '-' + item.DataGroupId
      if (!alldata.formMap[totalId]) {
        alldata.formMap[totalId] = item
      }
      if (!item.AdressItem) {
        let prop = item.DataGroupId?.split('*')[1]
        if (prop) {
          let name = alldata.otherCalcParamNameMap[prop]
          item.AdressItem = {
            DataName: name
          }
        }
      }
      const name = getParamDisplayName(item)
      return (
        <div key={totalId} data-formula-param-card={item.DataGroupId || totalId} class={'min-w-0 flex flex-col bg-white border border-gray-600 border-solid rounded-xl overflow-hidden'}>
          <div class={'px-4 py-2 text-[22px] font-bold truncate border-0 border-b border-gray-600 border-solid bg-[#f5f6f6]'} title={name}>{name}</div>
          <div class={'px-4 pt-3'}>
            <MyFormWrap labelPlacement="top" labelAlign="left" fontSize={20} inputStyle={{ width: '100%', textAlign: 'center' }} {...alldata.formCfg} form={alldata.formMap[totalId]} />
          </div>
        </div>
      )
    }

    return () => {
      const list = curDeviceGroupRow.value ? curParamList.value : []
      return (
        // 原来是每个参数一个 tab，改成卡片网格：一行三张，多了换行，整体纵向滚动
        <div class={'formula-param-cards w-full h-full p-2 border border-gray-600 border-solid overflow-y-auto overflow-x-hidden'}>
          {list.length ? (
            <div class={'grid grid-cols-3 gap-3'}>
              {list.map(item => renderCard(item))}
            </div>
          ) : (
            <div class={'w-full h-full flex items-center justify-center text-2xl text-gray-400'}>{t('config.noData')}</div>
          )}
        </div>
      )
    }
  }

})
