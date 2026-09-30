import { formListItem, MyFormWrap } from "@/components/MyFormWrap/MyFormWrap";
import TableOpCol from "@/components/TableOpCol/TableOpCol";
import { useMain } from "@/store";
import { DataTableProps, NButton, NDataTable, NDrawer, NDrawerContent, NTabPane, NTabs, SelectProps, useMessage } from "naive-ui";
import { computed, DefineComponent, defineComponent, PropType, reactive, ref, watch } from "vue";
import { useDataConfigPartStore } from "../dataConfigPartStore";
import DataMapAutoForm, { DataMapAutoFormExpose } from "./DataMapAutoForm";
import OPCUATopForm from "./OPCUATopForm";

const ClientForm = defineComponent({
  name: 'ClientForm',
  props: {
    children: Object
  },
  setup(props, ctx) {
    const itemList = ref<formListItem[]>([
      { type: 'select', label: '连接变量', prop: 'Code', width: 6, rule: 'must' },
      { type: 'numInput', label: '命名空间', prop: 'SlaveId', numAsString: true, width: 6, rule: 'must' },
      { type: 'select', label: '空间标识符', prop: 'LHpostion', width: 6, },
      { type: 'input', label: 'NodeID', prop: 'StaAdd', width: 6, rule: 'must' },
      { type: 'select', label: '数据通道', prop: 'RegiData', width: 6, rule: 'must' },
      { type: 'select', label: '数据类型', prop: 'DataType', width: 6, rule: 'must' },
      { type: 'select', label: '读写方式', prop: 'Writable', width: 6, rule: 'must' },
      { type: 'numInput', label: '输入最小值', prop: 'Imin', numAsString: true, width: 6, },
      { type: 'numInput', label: '输入最大值', prop: 'Imax', numAsString: true, width: 6, },
      { type: 'numInput', label: '工程最小值', prop: 'Vmin', numAsString: true, width: 6, },
      { type: 'numInput', label: '工程最大值', prop: 'Vmax', numAsString: true, width: 6, },
      { type: 'input', label: '通道备注', prop: 'Remark', width: 6, },
    ].map((e: formListItem) => {
      e.placement = 'top'
      return e
    }))
    const optionMap: Record<string, SelectProps['options']> = reactive({
      LHpostion: ['string', 'numberic'].map(e => ({
        label: e,
        value: e
      }))
    })
    const submit = () => {

    }

    return () => {
      let comp = props.children
      return <comp tableName={'OPCUA'} pItemList={itemList.value} pOptionMap={optionMap} />
      // <MyFormWrap optionMap={optionMap} itemList={itemList.value} submitFn={submit} btnStyleStr={'margin-right:50px;margin-bottom:10px;'} v-model:isAddMore={isAddMore.value} hasAddMore={!(ctx.attrs.form as commonForm).id} loading={loading.value} />
    }
  }
})
const ServerForm = defineComponent({
  name: 'ClientForm',
  props: {
    children: Object
  },
  setup(props, ctx) {
    const autoForm = ref<DataMapAutoFormExpose>()
    const itemList = ref<formListItem[]>([
      { type: 'select', label: '连接变量', prop: 'Code', width: 6, rule: 'must' },
      { type: 'numInput', label: '命名空间', prop: 'NameSpaceIndex', numAsString: true, width: 6, rule: 'must' },
      { type: 'select', label: '空间标识符', prop: 'IdentifierType', width: 6, },
      { type: 'input', label: 'NodeID', prop: 'Identifier', width: 6, rule: 'must' },
      { type: 'select', label: '数据通道', prop: 'RegiData', width: 6, rule: 'must' },
      { type: 'select', label: '数据类型', prop: 'DataType', width: 6, rule: 'must' },
      { type: 'select', label: '读写方式', prop: 'Writable', width: 6, rule: 'must' },
      { type: 'select', label: '用户权限', prop: 'UserAccessLevel', width: 6, rule: 'must' },
      { type: 'select', label: '匿名权限', prop: 'AccessLevel', width: 6, rule: 'must' },
      { type: 'numInput', label: '输入最小值', prop: 'Imin', numAsString: true, width: 6, },
      { type: 'numInput', label: '输入最大值', prop: 'Imax', numAsString: true, width: 6, },
      { type: 'numInput', label: '工程最小值', prop: 'Vmin', numAsString: true, width: 6, },
      { type: 'numInput', label: '工程最大值', prop: 'Vmax', numAsString: true, width: 6, },
      { type: 'input', label: '通道备注', prop: 'Remark', width: 6, },
    ].map((e: formListItem) => {
      e.placement = 'top'
      return e
    }))
    const optionMap: Record<string, SelectProps['options']> = reactive(
      {
        IdentifierType: ['string', 'numberic'].map(e => ({
          label: e,
          value: e
        }))
      }
    )



    watch(() => {
      return autoForm.value?.optionMap.Writable
    }, (val) => {
      if (!autoForm.value) return
      autoForm.value.optionMap.AccessLevel = val
      autoForm.value.optionMap.UserAccessLevel = val
    })

    const submit = () => {

    }

    return () => {
      let comp = props.children
      return <comp ref={autoForm} tableName={'OPCUA'} pItemList={itemList.value} pOptionMap={optionMap} />
      // <MyFormWrap optionMap={optionMap} itemList={itemList.value} submitFn={submit} btnStyleStr={'margin-right:50px;margin-bottom:10px;'} v-model:isAddMore={isAddMore.value} hasAddMore={!(ctx.attrs.form as commonForm).id} loading={loading.value} />
    }
  }
})
const OPCUATable = defineComponent({
  name: 'OPCUATable',
  props: {
    colList: Array as PropType<DataTableProps['columns']>,
    children: Object
  },
  setup(props, ctx) {
    const rowKeyList = ref<DataTableProps['checkedRowKeys']>([])
    const store = useMain()
    const dataConfigPartStore = useDataConfigPartStore()
    const tdata = ref<Record<string, string>[]>([])
    const formShow = ref(false)
    const form = ref<Record<string, string>>({})
    const msg = useMessage()

    const delRow = (row: any) => {
      var transaction = store.db.transaction(["OPCUA"], "readwrite");
      var objectStore = transaction.objectStore("OPCUA");
      var req = objectStore.delete(row.id)
      req.onsuccess = function (event: any) {
        msg.success('删除成功')
        getTData()
      }

    }
    const addRow = () => {
      form.value = {}
      formShow.value = true
    }
    const editRow = (row: any) => {
      form.value = { ...row }
      formShow.value = true
    }
    const colList = computed(() => {
      return [
        ...(props.colList || []),
        {
          key: 'op', title: '操作', width: 180, render(row: any) {
            return <TableOpCol editFn={() => { editRow(row) }} delFn={() => { delRow(row) }} />
          }
        },
      ]
    })
    const getTData = () => {
      let transaction = store.db.transaction(['OPCUA'])
      var objectStore = transaction.objectStore('OPCUA')
      let keyRange = IDBKeyRange.only(dataConfigPartStore.checkedRowItem?.ProtoType)
      var request = objectStore.index("ProtoType").getAll(keyRange)
      // .get(dataConfigPartStore.checkedRowItem?.ProtoType)
      request.onsuccess = function (event: any) {
        tdata.value = event.target.result.sort((a: any, b: any) => {
          return a.createTime - b.createTime

        })
      }
    }
    getTData()
    const buildRowProp = (rowData: any, index: number) => {
      return {
        onClick: () => {
          // dataConfigPartStore.setCheckRowItem(rowData)
        }
      }
    }
    const buildRowKey = (rowData: any) => {
      return rowData.id
    }
    watch(() => {
      return dataConfigPartStore.checkedRowItem
    }, (val) => {
      getTData()
    })
    return () => {
      let children = props.children
      return [
        <div class={'p-2 flex justify-end'}>
          <NButton size={'large'} onClick={addRow}>新增</NButton>
        </div>,
        <div class={'h-full shrink'}>
          <NDataTable class={'h-full'} minHeight={'30vh'} striped columns={colList.value} bordered={false} singleLine={false} data={tdata.value} rowProps={buildRowProp} v-model:checkedRowKeys={rowKeyList.value} rowKey={buildRowKey} size={'large'} >
          </NDataTable>
        </div>
        ,
        <NDrawer v-model:show={formShow.value} placement={'bottom'} to={'#OPCUATableCon'} trapFocus={false} height={'26vh'} blockScroll={false}>
          <NDrawerContent title={''}>
            <children children={
              //@ts-ignore, form 会直接透传到子组件myformWrap中
              <DataMapAutoForm form={form.value} getFn={getTData} v-model:show={formShow.value} />
            }  >

            </children>
          </NDrawerContent>
        </NDrawer>
      ]
    }
  },
})

export default defineComponent({
  name: 'OPCUA',

  setup(props, ctx) {


    const dataConfigPartStore = useDataConfigPartStore()
    const clientColList: DataTableProps['columns'] = [
      {
        type: 'selection',
        multiple: true,
      },
      { key: 'Code', title: '连接变量', resizable: true },
      { key: 'SlaveId', title: '命名空间', resizable: true },
      { key: 'LHpostion', title: '空间标识符', resizable: true },
      { key: 'Length', title: '数据长度', resizable: true },
      { key: 'DataType', title: '数据类型', resizable: true },
      { key: 'Writable', title: '读写属性', resizable: true },
      { key: 'Remark', title: '备注', resizable: true },
    ]
    const serverColList: DataTableProps['columns'] = [
      {
        type: 'selection',
        multiple: true,
      },
      { key: 'Code', title: '连接变量', resizable: true },
      { key: 'NameSpaceIndex', title: '命名空间', resizable: true },
      { key: 'Identifier', title: 'NodeID', resizable: true },
      { key: 'IdentifierType', title: '空间标识符', resizable: true },
      { key: 'UserAccessLevel', title: '用户权限', resizable: true },
      { key: 'AccessLevel', title: '匿名权限', resizable: true },
      { key: 'DataType', title: '数据类型', resizable: true },
      { key: 'Writable', title: '读写属性', resizable: true },
      { key: 'Remark', title: '备注', resizable: true },
    ].map((item: any, i) => {
      if (i > 0) {
        item.width = 120
      }
      return item
    })
    let obj: Record<string, any> = {
      'OPC-UA-Client': <OPCUATable colList={clientColList} children={<ClientForm />} >
      </OPCUATable>,
      'OPC-UA-Server': <OPCUATable colList={serverColList} children={<ServerForm />} />
    }
    return () => {

      return (
        <div class={'w-full h-full flex flex-col'}>
          <OPCUATopForm />
          <div class={'w-full h-full shrink flex flex-col'} id={'OPCUATableCon'}>
            {obj[dataConfigPartStore.checkedRowItem?.ProtoType || '']}
          </div>
        </div>
      )
    }
  }

})