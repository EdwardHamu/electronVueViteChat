import { useConfigStore } from "@/store/config";
import { useFormulaStore } from "@/store/formula";
import { getSysConfig } from "@/utils/call";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import classNames from "classnames";
import { } from "naive-ui";
import { computed, defineComponent, reactive, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { DataGroupEntity, FormulaConfigEntity, GroupConfigEntity, ModbusAdressRow } from "~/me";

export default defineComponent({
  name: 'formulaList',
  setup(props, ctx) {
    const configStore = useConfigStore()
    const formulaStore = useFormulaStore()
    const { t, i18nStore } = useMyI18n()
    const curGroupId = computed(() => configStore.sysConfig.CurrentGroupId)
    const curFormulaId = computed(() => configStore.sysConfig.CurrentFormulaId)
    const curFormulaConfigRow = computed(() => formulaStore.curFormulaConfigRow)
    const alldata = reactive({
      list: [] as FormulaConfigEntity[],
      curDataGroup: {}
    })
    const getData = () => {
      // if(!curGroupId.value) {
      //   window.$message.error('请先选择分组')
      //   return
      // }

      // console.log("🪵 [formulaList.tsx:13] ~ token ~ \x1b[0;32mcurGroupId.value\x1b[0m = ", curGroupId.value);
      callBrige(callFnName.GetFormulaConfigs, curGroupId.value).then((res: FormulaConfigEntity[]) => {
        return callBrige(callFnName.GetGroupConfigs).then((gRes: GroupConfigEntity[]) => {
          alldata.list = res.map(e => {
            const g = gRes.find(g => g.GId == e.GroupId)
            return { ...e, GroupConfigItem: g }
          })
        })
        // console.log("🪵 [formulaList.tsx:11] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        // alldata.list = new Array(50).fill(0).map(e => { return { ...res[0] } }) as unknown as FormulaConfigEntity[]
        // console.log("🪵 [formulaList.tsx:25] ~ token ~ \x1b[0;32malldata.list \x1b[0m = ", alldata.list);
        // console.log("🪵 [formulaList.tsx:31] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
      })
    }

    // getData()
    const getConfigList = () => alldata.list
    formulaStore.setUpdateConfigListFn(getData)
    formulaStore.setGetFormulaListFn(getConfigList)
    const rowClick = (row: FormulaConfigEntity) => {
      formulaStore.setCurFormulaConfigRow(row)
    }
    const applyConfig = (row: FormulaConfigEntity) => {
      callBrige(callFnName.EnableFormulaConfig, row.GId).then(() => {
        window.$message.success(t('config.applicationSuccess'))
        getSysConfig()
        formulaStore.updateConfigListFn()
      })
    }
    formulaStore.setApplayFormulaConfigFn(applyConfig)

    watch(() => curGroupId.value, (v) => {
      if (!v) return
      getData()
      callBrige(callFnName.GetGroupConfigs).then((res: GroupConfigEntity[]) => {
        let curItem = res.find(e => e.GId == curGroupId.value)
        console.log("🪵 [formulaList.tsx:48] ~ token ~ \x1b[0;32mcurItem\x1b[0m = ", curItem);
        formulaStore.setCurEnableDataGroupConfig(curItem)
      })
    }, {
      immediate: true
    })

    return () => {
      return (
        <div class={'w-full h-full border border-gray-600 border-solid  overflow-hidden bg-white'}
        >
          <div class={"w-full h-full overflow-auto "}>
            {
              alldata.list.map((e, i) => {
                return <div class={classNames('text-2xl p-2 px-1 pr-0 flex items-center flex-wrap', { 'bg-[#688eb2] text-white': curFormulaConfigRow.value?.GId == e.GId })}
                  onClick={() => { rowClick(e) }} >
                  <span>
                    {e.PN}
                    {e.Note && <>{` (${e.Note})`}</>}

                  </span>
                  <span class={' grow flex items-center'}>
                    <span>
                      {e.GroupConfigItem && <>{` (${t('config.groupPrefix')}${e.GroupConfigItem.GroupName})`}</>}
                    </span>
                    <span class={'ml-auto mr-2 text-lg  py-2 px-1 min-w-[70px] bg-white text-black border border-gray-500 border-solid'}
                      onClick={() => { applyConfig(e) }}>
                      {curFormulaId.value == e.GId ? t('config.applied') : t('config.apply2')}
                    </span>
                  </span>

                </div>
              })
            }
          </div>

        </div>
      )
    }
  }

})