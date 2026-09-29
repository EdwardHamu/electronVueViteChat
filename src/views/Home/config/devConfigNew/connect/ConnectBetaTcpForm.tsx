import { computed, defineComponent, onMounted, reactive, Ref, ref, watch } from "vue";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { commonMap2, refreshCommonMap2 } from "../../proto/proto";
import { commonFormItemListMap, propNameEnum, refreshCommonFormItemListMap, WallNumList } from "../../devConfig/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export type ConnectFormIns = {
  myFormRef: Ref<MyFormWrapIns>,
}

/** 与后端 SPC.Driver.Beta ConnectTcpModel 的默认值一致 */
const buildDefaultForm = () => ({
  Host: '127.0.0.1',
  Port: 502,
  SlaveId: 1,
  Cycle: 100,
  Timeout: 500,
  Endian32bit: '1234',
  Endian16bit: '12',
  EndianString: '21',
  WallNum: 6,
})

/**
 * 超声波偏心仪（SPC.Driver.Beta.UltrasonicWave）连接配置：
 * Modbus TCP 连接参数 + 壁厚点数 WallNum（1 ~ 8）。
 * 后端只在 InitConfig 时按 WallNum 生成 WALL01.. 默认地址，之后改点数需自行增删地址。
 */
export default defineComponent({
  name: 'ConnectBetaTcpForm',
  props: {
    show: Boolean,
    updateShowFn: Function,
    connectStr: String,
    updateParentFn: Function,
    getFormRefFn: Function
  },
  setup(props, ctx) {
    const { i18nStore } = useMyI18n()
    const myFormRef = ref<MyFormWrapIns>()
    const connectStr = computed(() => props.connectStr)
    const alldata = reactive({
      form: {} as Record<string, any>
    })
    const optionMap = reactive<Record<string, any>>({ ...commonMap2, [propNameEnum.WallNum]: WallNumList })

    const buildItemList = (): formListItem[] => [
      commonFormItemListMap[propNameEnum.Host],
      commonFormItemListMap[propNameEnum.Port],
      commonFormItemListMap[propNameEnum.SlaveId],
      commonFormItemListMap[propNameEnum.Cycle],
      commonFormItemListMap[propNameEnum.Timeout],
      commonFormItemListMap[propNameEnum.Endian32bit],
      commonFormItemListMap[propNameEnum.Endian16bit],
      commonFormItemListMap[propNameEnum.EndianString],
      commonFormItemListMap[propNameEnum.WallNum],
    ]

    const itemList = ref<formListItem[]>(buildItemList())

    const refreshFormConfig = () => {
      refreshCommonMap2()
      refreshCommonFormItemListMap()
      Object.keys(commonMap2).forEach(key => {
        optionMap[key] = commonMap2[key]
      })
      optionMap[propNameEnum.WallNum] = WallNumList
      itemList.value = buildItemList()
    }

    ctx.expose({ myFormRef } as ConnectFormIns)

    watch(() => connectStr.value, (value) => {
      const form: Record<string, any> = value ? { ...buildDefaultForm(), ...JSON.parse(value) } : buildDefaultForm()
      // 旧配置 / 手改 JSON 里 WallNum 可能是字符串或缺失；下拉选项值是 number，需要归一化
      const wallNum = Number(form.WallNum)
      form.WallNum = Number.isInteger(wallNum) && wallNum >= 1 && wallNum <= 8 ? wallNum : 6
      alldata.form = form
    }, { immediate: true })

    watch(() => i18nStore.langChangeCount, refreshFormConfig)

    onMounted(() => {
      refreshFormConfig()
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
