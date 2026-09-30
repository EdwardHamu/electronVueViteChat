import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { useMain } from "@/store";
import { useConfigStore } from "@/store/config";
import { NButton, SelectProps, useMessage } from "naive-ui";
import { ComponentPublicInstance, defineComponent, reactive, ref } from "vue";

export default defineComponent({
  name: 'WatchDataTop',
  setup(props, ctx) {
    const form = ref<Record<string, string>>({})
    const store = useMain()
    const configStore = useConfigStore()
    const msg = useMessage()
    const myForm = ref<ComponentPublicInstance<{},MyFormWrapIns>|null>(null)
    const itemList = ref<formListItem[]>([
      { type: 'select', label: '变量', prop: 'HistKey', width: 8, rule: 'must' },
      { type: 'select', label: '条件', prop: 'HistCondition', width: 8, rule: 'must' },
      { type: 'numInput', label: '值', prop: 'HistValue', numAsString: true, width: 8, rule: 'must' },
    ])
    const optionMap: Record<string, SelectProps['options']> = reactive({
      HistCondition: ['==', '>', '>=', '<', '<=', '!='].map((e) => {
        return { label: e, value: e }
      })
    })

    const initOptionMap = () => {
      let transaction = store.db.transaction(['dataMap'])
      var objectStore = transaction.objectStore('dataMap')
      let keyRange = IDBKeyRange.only(`Modbus-TCP-Slave`)
      var request = objectStore.index("ProtoType").getAll(keyRange)
      // .get(dataConfigPartStore.checkedRowItem?.ProtoType)
      request.onsuccess = function (event: any) {
        optionMap.HistKey = event.target.result.sort((a: any, b: any) => {
          return a.StaAdd - b.StaAdd
        }).map((e: any) => ({
          label: `${e.Code} - ${e.Remark}`, value: e.Code
        }))
      }
    }
    initOptionMap()

    const submit = (fdata: any) => {
      configStore.setHistConfig(fdata)
      msg.success('提交成功')
    }
    const clickSubmit = () => {
      myForm.value?.submit(submit)
    }


    return () => {
      return (
        <div class={'w-full h-full relative'}>
          <MyFormWrap hideBtn={true} itemList={itemList.value} optionMap={optionMap} ref={myForm} submitFn={submit} form={{...configStore.dataConfig.histConfig}} />

          <div class={'absolute w-fit h-fit top-0 -right-20'}>
            <NButton size={'large'} type={'primary'} onClick={clickSubmit} > 提交</NButton>
          </div>
        </div>
      )
    }
  }

})