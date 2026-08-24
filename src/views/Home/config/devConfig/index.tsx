import LargeBtnIcon from "@/components/LargeBtnIcon";
import { callSpc } from "@/utils/call";
import { AddOutlined, CloseOutlined, DeleteForeverFilled, EditFilled, KeyboardReturnRound } from "@vicons/material";
import { NButton, NDataTable, NDivider, NIcon, NPopconfirm, useMessage } from "naive-ui";
import { defineComponent, reactive, Transition } from "vue";
import { DeviceConfigEntity } from "~/me";
import { useDevCfgInnerData } from "./innerData";
import Edit from "./Edit";
import { devStateList } from "./enum";
import MyNTable from "@/components/MyNTable";
import { callFnName } from "@/utils/enum";
import { useDataCfgInnerDataStore } from "../dataCofigNew/innerData";

export default defineComponent({
  name: 'DevConfig',
  setup(props, ctx) {
    const innerData = useDevCfgInnerData()
    const dataConfigInnerData = useDataCfgInnerDataStore()
    const msg = useMessage()
    const tableCfg = reactive({
      colList: [
        {
          type: 'selection',
          multiple: false,
        },
        { key: 'Name', title: '设备名称', resizable: true },
        { key: 'DriverName', title: '驱动名称', resizable: true },
        {
          key: 'State', title: '设备状态', resizable: true, render: (row: DeviceConfigEntity) => {
            return devStateList[row.State]
          }
        },
        { key: 'CreateTime', title: '创建时间', resizable: true },
        { key: 'Remark', title: '备注', resizable: true },
      ],
      data: [] as DeviceConfigEntity[],
      height: '',
      rowProps: (row: DeviceConfigEntity) => {
        return {
          onClick: () => rowClick(row)
        }
      },
      rowKey: (row: DeviceConfigEntity) => row.GId
    })
    const getTableData = () => {
      innerData.cleanCurRow()
      callSpc(callFnName.GetDevcieConfigs).then((e: DeviceConfigEntity[]) => {
        // let d= {...e[0]}
        // d.GId = '2233444'
        // e.push(d)
        tableCfg.data = e
      })
    }
    innerData.setResetFn(getTableData)
    getTableData()
    const rowClick = (e: DeviceConfigEntity) => {
      innerData.setCurRowKey([e.GId!])
      innerData.setCurRow(e)
    }
    const addDev = () => {
      if (innerData.editShow) return
      innerData.cleanDevConfig()
      innerData.setIsEdit(false)
      innerData.setEditShow(true)
      // innerData.cleanCurRow()
    }
    const editDev = () => {
      if (innerData.editShow) return
      if (!innerData.curRow) {
        msg.warning('请选择一行数据')
        return
      }
      innerData.cleanDevConfig()
      innerData.setIsEdit(true)
      innerData.setDevConfigForm({ ...innerData.curRow })
      console.log("🚀 ~ file: index.tsx:70 ~ editDev ~ innerData.curRow :", innerData.curRow)
      innerData.setEditShow(true)
    }
    const delDev = () => {
      if (innerData.editShow) {
        msg.warning('请先保存修改')
        return
      }
      if (!innerData.curRow) {
        msg.warning('请选择一行数据')
        return
      }
      callSpc(callFnName.DeleteDevcieConfig, innerData.curRow).then(() => {
        getTableData()
      })
    }
    const close = () => {
      dataConfigInnerData.setDevCfgShow(false)
    }

    return () => {
      return (
        <div class={'w-full h-full flex-col'}>

          <div class={'flex flex-shrink-0 justify-start items-center p-2 pt-0 border-0 border-b border-solid border-b-gray-200'}>
            <div class={'text-[26px] font-semibold'} >
              设备配置
            </div>
            <NButton class={' ml-3 my-large-btn mr-3'} renderIcon={() => <LargeBtnIcon><AddOutlined /></LargeBtnIcon>} type="primary" size={'large'} onClick={addDev}>添加设备</NButton>
            <NButton class={'my-large-btn mr-3'} renderIcon={() => <LargeBtnIcon><EditFilled /></LargeBtnIcon>} type="primary" size={'large'} onClick={editDev}>编辑设备</NButton>
            <NPopconfirm onPositiveClick={delDev} placement={'bottom'} v-slots={{
              trigger: () => <NButton class={'my-large-btn mr-3'} renderIcon={() => <LargeBtnIcon><DeleteForeverFilled /></LargeBtnIcon>} type="error" size={'large'} >删除设备</NButton>
            }}>
              确认删除吗?
            </NPopconfirm>
            {/* <NButton class={'my-large-btn mr-3'} renderIcon={() => <LargeBtnIcon><DeleteForeverFilled /></LargeBtnIcon>} type="primary" size={'large'} onClick={delDev}>删除设备</NButton> */}
            <NButton class={'my-large-btn mr-3'} renderIcon={() => <LargeBtnIcon><CloseOutlined /></LargeBtnIcon>} size={'large'} onClick={close}>关闭</NButton>

            {/* <NDivider titlePlacement="left" class={'large-label-size'}  >
              设备配置
            </NDivider> */}
          </div>
          <div class={'relative h-full flex-shrink'} style={{ height: 'calc(100% - 60px)' }}>
            {/* <NDataTable bordered={false} maxHeight={''} striped singleLine={false} columns={tableCfg.colList} data={tableCfg.data} size={'large'} >
            </NDataTable> */}
            {/* @ts-ignore */}
            <MyNTable v-model:checked-row-keys={innerData.curRowKey} data={tableCfg.data} rowKey={tableCfg.rowKey} rowProps={tableCfg.rowProps} columns={tableCfg.colList}></MyNTable>
            <Transition name='full-pop'>
              {innerData.editShow && <Edit />}
            </Transition>
          </div>

        </div>
      )
    }
  }

})
