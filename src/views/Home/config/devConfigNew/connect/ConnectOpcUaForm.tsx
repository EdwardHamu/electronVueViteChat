import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap } from "../../devConfig/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type ConnectFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

export default defineComponent({
  name: 'ConnectOpcUaForm',
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
    const buildOptionMap = () => ({
      SecurityPolicy: [
        { label: t('config.opcSecurityPolicyNone'), value: 'None' },
        { label: t('config.opcSecurityPolicyBasic128Rsa15'), value: 'Basic128Rsa15' },
        { label: t('config.opcSecurityPolicyBasic256'), value: 'Basic256' },
        { label: t('config.opcSecurityPolicyBasic256Sha256'), value: 'Basic256Sha256' },
      ],
      MessageMode: [
        { label: t('config.opcMessageModeNone'), value: 'None' },
        { label: t('config.opcMessageModeSign'), value: 'Sign' },
        { label: t('config.opcMessageModeSignAndEncrypt'), value: 'SignAndEncrypt' },
      ]
    })
    const optionMap = reactive(buildOptionMap())
    const buildItemList = (): formListItem[] => [
      { type: 'input', label: t('config.opcUaEndpointUrl'), prop: 'EndpointUrl', width: 24, rule: ['must'] },
      { type: 'select', label: t('config.opcSecurityPolicy'), prop: 'SecurityPolicy', width: 12, rule: ['must'] },
      { type: 'select', label: t('config.opcMessageMode'), prop: 'MessageMode', width: 12, rule: ['must'] },
      { type: 'input', label: t('config.userName'), prop: 'UserName', width: 12 },
      { type: 'input', label: t('config.password'), prop: 'Password', width: 12, inputType: 'password' },
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
      Object.assign(optionMap, buildOptionMap())
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
