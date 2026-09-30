import { MyFormWrap, formListItem } from "@/components/MyFormWrap/MyFormWrap";
import { SelectProps, useMessage } from "naive-ui";
import { computed, defineComponent, nextTick, reactive, ref } from "vue";
import { v4 as uuidv4 } from 'uuid';
import { useConfigStore } from "@/store/config";
import { useMain } from "@/store";

export default defineComponent({
  name: 'IndexForm',
  props: {
    getFn: Function
  },
  setup(props, ctx) {
    const store = useMain()
    const loading = ref(false)
    const msg = useMessage()
    // const remarkItem = { type: 'input', label: '备注', prop: 'Remark', width: 8 }
    const itemList = ref<formListItem[]>([
      { type: 'select', label: 'Interface', prop: 'Interface', width: 6, rule: 'must' },
      { type: 'select', label: 'Port', prop: 'Port', width: 6, rule: 'must' },
      { type: 'select', label: 'Baud', prop: 'Baud', width: 6, rule: 'must' },
      { type: 'select', label: 'DeviceType', prop: 'DeviceType', width: 6, rule: 'must' },
      { type: 'select', label: 'PositionName', prop: 'PositionName', width: 6, rule: 'must' },
      // { type: 'select', label: 'Interface', prop: 'Interface', width: 6, rule: 'must' },
      {
        type: 'numInput', label: 'Distance', prop: 'Distance', numAsString: true, width: 6, rule: 'must', suffix: () => {
          return <span>M</span>
        }
      },

    ])
    const optionMap: Record<string, SelectProps['options']> = reactive({
      Interface: ['Serial', 'Ethernet', 'Digital'].map(e => ({
        label: e,
        value: e
      })),
      Port: ['COM1', 'COM2', 'COM3', 'COM4'].map(e => ({
        label: e,
        value: e
      })),
      Baud: ['9600B', '14,4kB', '19,2kB', '115,2kB', '153,6kB', '750kB'].map(e => ({
        label: e,
        value: e
      })),
      DeviceType: ['None', 'LUMP(digital input)', 'Mono MHD/LASER(internal)', 'LUMP(internal)', 'Duo MHD/LASER(internal)', 'LUMP 2000(USSC)', 'LASER/LED(USSC)'].map(e => ({
        label: e,
        value: e
      })),
      PositionName: ['Core Diameter', 'Filling Diameter', 'Hot Diameter', 'Cooled Off Diameter', 'Cold Diameter'].map(e => ({
        label: e,
        value: e
      }))
    })

    const submit = (fdata: connectDevForm) => {
      console.log(fdata)
      loading.value = true
      var transaction = store.db.transaction(["connectDev"], "readwrite");
      // 在所有数据添加完毕后的处理
      transaction.oncomplete = function (event: any) {
        // !isAddMore.value && ctx.emit('update:show', false)
        loading.value = false
        props.getFn && props.getFn()
        msg.success('保存成功')
        ctx.emit('update:show', false)
        // if (isAddMore.value) {
        //   Object.assign((ctx.attrs.form as commonForm), { Code: '', Remark: '' })
        // }
      };
      var objectStore = transaction.objectStore("connectDev");

      if (!fdata.id) {
        fdata.id = uuidv4()
        fdata.createTime = String(new Date().getTime())
        objectStore.add(fdata)
      } else {
        objectStore.put(fdata)
      }
    }



    // const finalOptionMap = computed(() => {
    //   let form = ctx.attrs.form as commonForm
    //   let curProtoType = form.ProtoType || 'Modbus-TCP-Master'
    //   let curProtoInfo = proto[curProtoType.split('-').join('')]
    //   return {
    //     ...optionMap,
    //     ...(curProtoInfo && curProtoInfo.optionMap) ? curProtoInfo.optionMap : {}
    //   }
    // })

    return () => {
      return (
        <MyFormWrap optionMap={optionMap} itemList={itemList.value} submitFn={submit} btnStyleStr={'margin-right:40px;margin-bottom:10px;'} loading={loading.value} />
      )
    }
  }

})