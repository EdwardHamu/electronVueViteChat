import { MyFormWrap, formListItem } from "@/components/MyFormWrap/MyFormWrap";
import { SelectProps, useMessage } from "naive-ui";
import { computed, defineComponent, nextTick, reactive, ref } from "vue";
import { v4 as uuidv4 } from 'uuid';
import { useConfigStore } from "@/store/config";
//@ts-ignore
import devRegiTypeData from '@/store/jsonData/dev_regitype.js'
//@ts-ignore
import { useDataConfigPartStore } from "../dataConfigPartStore";
import { useMain } from "@/store";

export default defineComponent({
  name: 'DataMapForm',  // ModBusTCPSlave 专用
  props: {
    getFn: Function  //获取table参数
  },
  setup(props, ctx) {
    const configStore = useConfigStore()
    const store = useMain()
    const msg = useMessage()
    const dataConfigPartStore = useDataConfigPartStore()
    const loading = ref(false)
    const isAddMore = ref(false)
    let curProtoRegiDataList: any[] = []
    const legnthItem = { type: 'numInput', label: '数据长度', prop: 'Length', numAsString: true, width: 6, rule: 'must' }
    const remarkItem = { type: 'input', label: '通道备注', prop: 'Remark', width: 6, }
    const itemList = ref<formListItem[]>([
      { type: 'input', label: '连接变量', prop: 'Code', width: 6, rule: 'must' },
      { type: 'input', label: '通道地址', prop: 'StaAdd', width: 6, rule: 'must' },
      { type: 'select', label: '通道类型', prop: 'RegiType', width: 6, rule: 'must' },
      { type: 'select', label: '数据类型', prop: 'DataType', width: 6, rule: 'must' },
      { type: 'select', label: '读写方式', prop: 'Writable', width: 6, rule: 'must' },
    ])
    const optionMap: Record<string, SelectProps['options']> = reactive({
      RegiType: []
    })


    const initOptionMap = () => {
      curProtoRegiDataList = devRegiTypeData.filter((e: any) => e.ProtocolType == dataConfigPartStore.checkedRowItem?.ProtoType)
      optionMap.RegiType = curProtoRegiDataList.map((e: any) => ({
        label: e.RegiType,
        value: e.RegiType
      }))
    }
    initOptionMap()

    const submit = (fdata: commonForm) => {
      console.log(fdata)
      loading.value = true
      var transaction = store.db.transaction(["dataMap"], "readwrite");
      // 在所有数据添加完毕后的处理
      transaction.oncomplete = function (event: any) {
        !isAddMore.value && ctx.emit('update:show', false)
        loading.value = false
        props.getFn && props.getFn()
        msg.success('保存成功')
        if (isAddMore.value) {
          Object.assign((ctx.attrs.form as commonForm), { Code: '', Remark: '' })
        }
      };
      var objectStore = transaction.objectStore("dataMap");

      if (!fdata.Length) {
        fdata.Length = '1'
        if (fdata.DataType.search('32位') > -1)
          fdata.Length = '2'
      }
      if (!fdata.ProtoType) {
        fdata.ProtoType = dataConfigPartStore.checkedRowItem?.ProtoType
      }
      if (!fdata.id) {
        fdata.id = uuidv4()
        fdata.createTime = String(new Date().getTime())
        objectStore.add(fdata)
      } else {
        objectStore.put(fdata)
      }

    }

    const finalItemList = computed(() => {
      let form = ctx.attrs.form as commonForm

      return [
        ...itemList.value,
        ...((form.DataType && form.DataType.search("ASCII") > -1) ? [legnthItem] : []),
        remarkItem
      ]
    })

    const finalOptionMap = computed(() => {
      let form = ctx.attrs.form as commonForm
      let item = curProtoRegiDataList.find((e: any) => {
        return e.RegiType == form.RegiType
      })
      let obj = {
        DataType: item?.DataType.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        }),
        Writable: item?.Writable.split('/').map((e: any) => {
          return {
            label: e,
            value: e
          }
        })
      }
      return {
        ...optionMap,
        ...obj.DataType ? obj : {}
      }
    })

    return () => {
      return (
        <MyFormWrap optionMap={finalOptionMap.value} itemList={finalItemList.value} submitFn={submit} btnStyleStr={'margin-right:50px;margin-bottom:10px;'} v-model:isAddMore={isAddMore.value} hasAddMore={!(ctx.attrs.form as commonForm).id} loading={loading.value} />
      )
    }
  }

})