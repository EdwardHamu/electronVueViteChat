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
  name: 'ConnectOpcDaAddressForm',
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
      { label: t('config.opcDataTypeBool'), value: 0 },
      { label: t('config.opcDataTypeInt16'), value: 1 },
      { label: t('config.opcDataTypeInt32'), value: 2 },
      { label: t('config.opcDataTypeFloat'), value: 3 },
      { label: t('config.opcDataTypeDouble'), value: 4 },
      { label: t('config.opcDataTypeString'), value: 5 },
    ]
    const buildExchangeOptions = () => [
      { label: t('config.valueMultiplyThenAdd'), value: 0 },
      { label: t('config.valueAddThenMultiply'), value: 1 },
    ]
    const buildItemList = (): formListItem[] => [
      commonFormItemListMap[propNameEnum.Name],
      commonFormItemListMap[propNameEnum.Permission],
      commonFormItemListMap[propNameEnum.State],
      { type: 'select', label: t('config.dataType'), prop: 'DataType', width: 12, rule: ['mustNum'] },
      { type: 'input', label: t('config.opcItemId'), prop: 'ItemId', width: 24, rule: ['must'] },
      { type: 'radio', label: t('config.dataConversion'), prop: 'Exchange', width: 24, radioType: 'btn', radioList: buildExchangeOptions(), rule: ['mustNum'] },
      commonFormItemListMap[propNameEnum.Rate],
      commonFormItemListMap[propNameEnum.Offset],
    ]
    const itemList = ref<formListItem[]>(buildItemList())

    const buildDefForm = () => ({
      DeviceId: configStore.curDevConfigRow?.GId || '',
      Permission: 0,
      State: 1,
      AddressString: '',
      ItemId: '',
      DataType: 4,
      Exchange: 0,
      Rate: 1,
      Offset: 0,
    })
    const submit = (data: any) => {
      data.AddressString = JSON.stringify({
        ItemId: data.ItemId,
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

    ctx.expose({ myFormRef } as AddressFormIns)

    watch(() => addressStr.value, (value) => {
      if (value && !isAdd.value) {
        alldata.form = { ...curRow.value, ...JSON.parse(value) }
      } else {
        alldata.form = buildDefForm()
      }
    }, { immediate: true })

    onMounted(() => {
      refreshCommonFormItemListMap()
      optionMap.value = {
        ...refreshCommonMap2(),
        [propNameEnum.DataType]: buildDataTypeOptions(),
        [propNameEnum.Permission]: commonMap2[propNameEnum.Permission],
      }
      itemList.value = buildItemList()
      props.getFormRefFn && props.getFormRefFn(myFormRef)
      props.getSubmitFn && props.getSubmitFn(submit)
    })
    watch(() => i18nStore.langChangeCount, () => {
      refreshCommonFormItemListMap()
      optionMap.value = {
        ...refreshCommonMap2(),
        [propNameEnum.DataType]: buildDataTypeOptions(),
        [propNameEnum.Permission]: commonMap2[propNameEnum.Permission],
      }
      itemList.value = buildItemList()
    })

    return () => (
      <MyFormWrap ref={myFormRef} optionMap={optionMap.value} hideBtn={true} form={alldata.form} itemList={itemList.value}></MyFormWrap>
    )
  }
})
