import { DialogReactive, NButton, NSwitch, useDialog } from "naive-ui";
import { computed, defineComponent, PropType, reactive, ref, watch } from "vue";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import ModbusAddressModelForm from "../devConfig/addressForm/ModbusAddressModelForm";
import { DeviceConfigEntity, ModbusAdressSubItem } from "~/me";
import { useConfigStore } from "@/store/config";
import ModbusForm from "./address/ModbusForm";
import ConnectOpcDaAddressForm from "./address/ConnectOpcDaAddressForm";
import ConnectOpcUaAddressForm from "./address/ConnectOpcUaAddressForm";
import ConnectSiemensAddressForm from "./address/ConnectSiemensAddressForm";
import ConnectModbusRtuAddressForm from "./address/ConnectModbusRtuAddressForm";
import ConnectModbusAsciiAddressForm from "./address/ConnectModbusAsciiAddressForm";
import { MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export default defineComponent({
  name: 'AdressForm',
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
      return configStore.isAdressAddMore
    })
    const show = computed(() => {
      return configStore.addressFormShow
    })
    const formCfg = reactive({
      getFormRefFn: (ref: any) => {
        formRef.value = ref.value
      },
      getSubmitFn: (fn: () => void) => {
        alldata.curSubmitFn = fn
      },
    })
    const curDevRow = computed(() => configStore.curDevConfigRow)
    const curAddressRow = computed(() => configStore.curAddressRow)
    const getAdressForm = (driveName: string) => {
      switch (driveName) {
        case 'Modbus Tcp Client':
          return <ModbusForm {...formCfg} ></ModbusForm>
        case 'OPC DA Client':
          return <ConnectOpcDaAddressForm {...formCfg} ></ConnectOpcDaAddressForm>
        case 'OPC UA Client':
          return <ConnectOpcUaAddressForm {...formCfg} ></ConnectOpcUaAddressForm>
        case 'Siemens Tcp Client':
          return <ConnectSiemensAddressForm {...formCfg} ></ConnectSiemensAddressForm>
        case 'Modbus Rtu Client':
          return <ConnectModbusRtuAddressForm {...formCfg} ></ConnectModbusRtuAddressForm>
        case 'Modbus Ascii Client':
          return <ConnectModbusAsciiAddressForm {...formCfg} ></ConnectModbusAsciiAddressForm>
        default:
          break;
      }
    }

    const hideForm = () => {
      configStore.setAddressFormShow(false)
    }
    watch(() => show.value, (v) => {

      if (v) {
        // connectStr.value && (alldata.form = JSON.parse(connectStr.value))
        alldata.curDialogIns = dialog.create({
          title: t('config.dataAddress'),
          content: () => {
            return <div class={'min-h-[170px] relative'}>
              {
                !curAddressRow.value?.GId &&
                <div class={'absolute -top-9 left-32'}>
                  <NSwitch value={isAddMore.value} onUpdate:value={(v: boolean) => {
                    configStore.setIsAdressAddMore(v)
                  }} size={'large'} v-slots={{
                    checked: () => { return <div >{t('config.continueAdd')}</div> },
                    unchecked: () => { return <div class={'text-black'}>{t('config.continueAdd')}</div> }
                  }} />
                </div>
              }

              {/* <MyFormWrap ref={myFormRef} optionMap={optionMap} hideBtn={true} form={alldata.form} itemList={itemList.value}></MyFormWrap> */}
              {getAdressForm(curDevRow.value?.DriverName || '')}
            </div>
          },
          style: { width: '950px', minHeight: '200px', },
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
        <div class={''}>

        </div>
      )
    }
  }

})
