import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonMap2, refreshCommonMap2 } from "../../proto/proto";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap } from "../../devConfig/enum";
import { DataAddressEntity } from "~/me";
import { useConfigStore } from "@/store/config";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type AddressFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

export default defineComponent({
  name: 'ConnectSiemensAddressForm',
  props: {
    getFormRefFn: Function,
    getSubmitFn: Function,
  },
  setup(props, ctx) {
    const { t, i18nStore } = useMyI18n()
    const configStore = useConfigStore()
    const myFormRef = ref<MyFormWrapIns>()
    const curRow = computed(() => configStore.curAddressRow)
    const addressStr = computed(() => configStore.curAddressRow?.AddressString || '')
    const isAdd = computed(() => configStore.addressFormIsAdd)
    const isAddMore = computed(() => configStore.isAdressAddMore)
    const alldata = reactive({
      form: {} as DataAddressEntity & Record<string, any>,
    })
    const optionMap = ref<Record<string, any>>({})

    const buildDataTypeOptions = () => [
      { label: t('config.unsignedInt16'), value: 0 },
      { label: t('config.signedInt16'), value: 1 },
      { label: t('config.unsignedInt32'), value: 2 },
      { label: t('config.signedInt32'), value: 3 },
      { label: t('config.float32'), value: 4 },
      { label: t('config.asciiChar'), value: 5 },
      { label: t('config.boolean'), value: 6 },
    ]

    const buildExchangeOptions = () => [
      { label: t('config.valueMultiplyThenAdd'), value: 0 },
      { label: t('config.valueAddThenMultiply'), value: 1 },
    ]

    const buildItemList = (): formListItem[] => [
      commonFormItemListMap[propNameEnum.Name],
      commonFormItemListMap[propNameEnum.Permission],
      commonFormItemListMap[propNameEnum.State],
      commonFormItemListMap[propNameEnum.Address],
      commonFormItemListMap[propNameEnum.Length],
      { type: 'select', label: t('config.dataType'), prop: 'DataType', width: 12, rule: ['mustNum'] },
      { type: 'radio', label: t('config.dataConversion'), prop: 'Exchange', width: 24, radioType: 'btn', radioList: buildExchangeOptions(), rule: ['mustNum'] },
      commonFormItemListMap[propNameEnum.Rate],
      commonFormItemListMap[propNameEnum.Offset],
    ]

    const itemList = ref<formListItem[]>(buildItemList())

    const buildDefaultForm = () => ({
      DeviceId: configStore.curDevConfigRow?.GId || '',
      Permission: 0,
      State: 1,
      AddressString: '',
      Address: '',
      Length: 1,
      DataType: 0,
      Exchange: 0,
      Rate: 1,
      Offset: 0,
    })

    const submit = (data: any) => {
      data.AddressString = JSON.stringify({
        Address: data.Address,
        Length: data.Length,
        DataType: data.DataType,
        Exchange: data.Exchange,
        Rate: data.Rate,
        Offset: data.Offset,
      })
      callBrige(callFnName.SaveDataAddress, data).then(() => {
        window.$message.success(t('config.saveSuccess'))
        if (!isAddMore.value) {
          configStore.setAddressFormShow(false)
        } else {
          alldata.form.Name = ''
        }
        configStore.updateAdressRowFn && configStore.updateAdressRowFn()
      })
    }

    const refreshFormConfig = () => {
      refreshCommonFormItemListMap()
      optionMap.value = {
        ...refreshCommonMap2(),
        [propNameEnum.DataType]: buildDataTypeOptions(),
        [propNameEnum.Permission]: commonMap2[propNameEnum.Permission],
      }
      itemList.value = buildItemList()
    }

    ctx.expose({ myFormRef } as AddressFormIns)

    watch(() => addressStr.value, (value) => {
      if (value && !isAdd.value) {
        alldata.form = { ...curRow.value, ...JSON.parse(value) }
      } else {
        alldata.form = buildDefaultForm()
      }
    }, { immediate: true })

    onMounted(() => {
      refreshFormConfig()
      props.getFormRefFn && props.getFormRefFn(myFormRef)
      props.getSubmitFn && props.getSubmitFn(submit)
    })

    watch(() => i18nStore.langChangeCount, refreshFormConfig)

    return () => (
      <MyFormWrap ref={myFormRef} optionMap={optionMap.value} hideBtn={true} form={alldata.form} itemList={itemList.value}></MyFormWrap>
    )
  }
})
