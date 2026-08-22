import { useConfigStore } from "@/store/config";
import { useFormulaStore } from "@/store/formula";
import { getSysConfig } from "@/utils/call";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import classNames from "classnames";
import { } from "naive-ui";
import { computed, defineComponent, reactive, watch } from "vue";
import { DataGroupEntity, DeviceGroupEntity, GroupConfigEntity, ModbusAdressRow } from "~/me";

export default defineComponent({
  name: 'DeviceGroupList',
  setup(props, ctx) {
    const configStore = useConfigStore()
    const formulaStore = useFormulaStore()
    const curGroupId = computed(() => configStore.sysConfig.CurrentGroupId)
    const curFormulaId = computed(() => configStore.sysConfig.CurrentFormulaId)
    const curDeviceGroupRow = computed(() => formulaStore.curDeviceGroupRow)
    const curFormulaConfigRow = computed(() => formulaStore.curFormulaConfigRow)
    const alldata = reactive({
      list: [] as DeviceGroupEntity[],
      curDataGroup: {}
    })
    const getData = () => {
      // if(!curGroupId.value) {
      //   window.$message.error('请先选择分组')
      //   return
      // }

      // console.log("🪵 [formulaList.tsx:13] ~ token ~ \x1b[0;32mcurGroupId.value\x1b[0m = ", curGroupId.value);
      callBrige(callFnName.GetShowDeviceGroups).then((res: DeviceGroupEntity[]) => {

        // console.log("🪵 [formulaList.tsx:11] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        // alldata.list = new Array(50).fill(0).map(e => { return { ...res[0] } }) as unknown as DeviceGroupEntity[]
        // console.log("🪵 [formulaList.tsx:25] ~ token ~ \x1b[0;32malldata.list \x1b[0m = ", alldata.list);
        alldata.list = res.filter(e => e.GroupId == curGroupId.value)
        // console.log("🪵 [formulaList.tsx:31] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
      })
    }

    // getData()
    const getConfigList = () => alldata.list
    // formulaStore.setUpdateConfigListFn(getData)
    formulaStore.setGetDeviceGroupListFn(getConfigList)
    const rowClick = (row: DeviceGroupEntity) => {
      formulaStore.setCurDeviceGroupRow(row)
    }
    // const applyConfig = (row: DeviceGroupEntity) => {
    //   callBrige(callFnName.EnableFormulaConfig, row.GId).then(() => {
    //     window.$message.success('应用成功')
    //     getSysConfig()
    //     formulaStore.updateConfigListFn()
    //   })
    // }
    // formulaStore.setApplayFormulaConfigFn(applyConfig)

    watch(() => curFormulaConfigRow.value, (v) => {
      if (!v) return
      getData()
      // callBrige(callFnName.GetGroupConfigs).then((res: GroupConfigEntity[]) => {
      //   let curItem = res.find(e => e.GId == curGroupId.value)
      //   console.log("🪵 [formulaList.tsx:48] ~ token ~ \x1b[0;32mcurItem\x1b[0m = ", curItem);
      //   formulaStore.setCurEnableDataGroupConfig(curItem)
      // })
    }, {
      immediate: true
    })

    return () => {
      return (
        <div class={'w-full h-full border border-gray-600 border-solid overflow-hidden '}>
          <div class={"w-full h-full overflow-auto "}>
            {
              curFormulaConfigRow.value && alldata.list.map((e, i) => {
                return <div class={classNames('text-2xl p-2 flex items-center', { 'bg-[#688eb2] text-white': curDeviceGroupRow.value?.GId == e.GId })}
                  onClick={() => { rowClick(e) }} >
                  <span>
                    {e.DeviceName}
                    {/* {e.Note && <>{` (${e.Note})`}</>} */}
                  </span>
                  {/* <span class={'ml-auto mr-2  py-1 px-3 bg-white text-black border border-gray-500 border-solid'}
                    onClick={() => { applyConfig(e) }}>
                    {curFormulaId.value == e.GId ? `已应用` : '应用'}
                  </span> */}
                </div>
              })
            }
          </div>

        </div>
      )
    }
  }

})