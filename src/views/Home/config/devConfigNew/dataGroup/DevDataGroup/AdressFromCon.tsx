import { DialogReactive, NButton, NSwitch, useDialog } from "naive-ui";
import { computed, defineComponent, PropType, reactive, ref, watch } from "vue";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import { DeviceConfigEntity, ModbusAdressRow, ModbusAdressSubItem } from "~/me";
import { useConfigStore } from "@/store/config";
import ModbusForm from "./form/ModbusForm";
import { MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { useMyI18n } from "@/hooks/useMyI18n";
import { driverNameEnum } from "../../enum";

export default defineComponent({
  name: 'AdressFormCon',
  props: {
    updateShowFn: Function,
    // curRow: Object as PropType<DeviceConfigEntity>,
  },
  setup(props, ctx) {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const dialog = useDialog()
    const formRef = ref<MyFormWrapIns>()
    const alldata = reactive({
      form: {},
      curDialogIns: null as DialogReactive | null,
      curSubmitFn: () => { },
      isMoreAdd: false
    })
    const isAddMore = computed(() => {
      return false
    })
    const show = computed(() => {
      return configStore.devDataGroupAddressFormShow
    })
    const formCfg = reactive({
      getFormRefFn: (ref: any) => {
        formRef.value = ref.value
      },
      getSubmitFn: (fn: () => void) => {
        alldata.curSubmitFn = fn
      },
    })
    const curDevRow = ref({} as DeviceConfigEntity | null | undefined)
    const curAddressRow = computed(() => configStore.curDevDataGroupRow)
    // watch(() => curAddressRow.value, (v) => {
    //   const getRealDev = () => {
    //     let devId = ''
    //     callBrige(callFnName.GetDataAddresses, [v?.DataId]).then((res: ModbusAdressRow[]) => {
    //       devId = res[0].DeviceId
    //       return callBrige(callFnName.GetDevcieConfigs)
    //     }).then((res: DeviceConfigEntity[]) => {
    //       let item = res.find(e => e.GId == devId)
    //       curDevRow.value = item
    //     })
    //   }
    //   getRealDev()
    // })

    const getAdressForm = (driveName: string) => {
      switch (driveName) {
        case 'Modbus Tcp Client':
        case driverNameEnum.betaUltrasonic: // 超声波偏心仪的地址模型与 Modbus 相同
          return <ModbusForm {...formCfg} ></ModbusForm>
        default:
          break;
      }
    }

    const hideForm = () => {
      configStore.setDevDataGroupAddressFormShow(false)
    }
    watch(() => show.value, (v) => {

      if (v) {
        // connectStr.value && (alldata.form = JSON.parse(connectStr.value))
        alldata.curDialogIns = dialog.create({
          title: t('config.data'),
          content: () => {
            return <div class={'min-h-[170px] relative'}>
              {/* {
                !curAddressRow.value?.GId &&
                <div class={'absolute -top-9 left-32'}>
                  <NSwitch value={isAddMore.value} onUpdate:value={(v: boolean) => {
                    configStore.setIsAdressAddMore(v)
                  }} size={'large'} v-slots={{
                    checked: () => { return <div >连续添加</div> },
                    unchecked: () => { return <div class={'text-black'}>连续添加</div> }
                  }} />
                </div>
              } */}

              {/* <MyFormWrap ref={myFormRef} optionMap={optionMap} hideBtn={true} form={alldata.form} itemList={itemList.value}></MyFormWrap> */}
              {/* {getAdressForm(curDevRow.value?.DriverName || '')} */}
              <ModbusForm {...formCfg} ></ModbusForm>
            </div>
          },
          style: { width: '800px', minHeight: '200px', },
          action: () => {
            return <div class={'flex justify-around items-center w-full'}>
              <NButton style={{ width: '45%', height: '40px', fontSize: '22px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { hideForm() }}>{t('config.cancel')}</NButton>
              <NButton style={{ width: '45%', height: '40px', fontSize: '22px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => {
                formRef.value?.submit(alldata.curSubmitFn)
              }}>{t('config.confirm')}</NButton>
            </div>
          },
          positiveText: t('config.confirm'),
          negativeText: t('config.cancel'),
          maskClosable: false,
          onPositiveClick: () => {
            hideForm()
          },
          onNegativeClick: () => {
            hideForm()
          },
          onClose: () => {
            hideForm()
            // ctx.emit('update:show', false) 
          },
          onMaskClick: () => {
            // hideForm()
            return false
          }
          // onAfterLeave: () => {
          //   changeShow()
          // }
        })
      } else {
        alldata.curDialogIns && alldata.curDialogIns?.destroy()
        configStore.setIsAdressAddMore(false)
      }
    })
    return () => {
      return (
        <div class={'absolute'}>

        </div>
      )
    }
  }

})