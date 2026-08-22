import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap } from "../../devConfig/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type ConnectFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

export default defineComponent({
  name: 'ConnectOpcDaForm',
  props: {
    show: Boolean,
    updateShowFn: Function,
    connectStr: String,
    updateParentFn: Function,
    getFormRefFn: Function
  },
  setup(props, ctx) {
    const { t, i18nStore } = useMyI18n()
    const myFormRef = ref<MyFormWrapIns>()
    const connectStr = computed(() => props.connectStr)
    const alldata = reactive({
      form: {} as Record<string, any>
    })
    const optionMap = reactive({})
    const buildItemList = (): formListItem[] => [
      { type: 'input', label: t('config.opcDaProgId'), prop: 'ProgId', width: 12, rule: ['must'] },
      { type: 'input', label: t('config.opcServerHost'), prop: 'Host', width: 12 },
      commonFormItemListMap[propNameEnum.Cycle],
      commonFormItemListMap[propNameEnum.Timeout],
    ]
    const itemList = ref<formListItem[]>(buildItemList())

    ctx.expose({ myFormRef } as ConnectFormIns)

    watch(() => connectStr.value, (value) => {
      alldata.form = value ? JSON.parse(value) : {}
    }, { immediate: true })
    watch(() => i18nStore.langChangeCount, () => {
      refreshCommonFormItemListMap()
      itemList.value = buildItemList()
    })

    onMounted(() => {
      refreshCommonFormItemListMap()
      itemList.value = buildItemList()
      props.getFormRefFn && props.getFormRefFn(myFormRef)
    })

    return () => (
      <MyFormWrap
        ref={myFormRef}
        optionMap={optionMap}
        hideBtn={true}
        form={alldata.form}
        labelWidth={150}
        itemList={itemList.value}
      ></MyFormWrap>
    )
  }
})
