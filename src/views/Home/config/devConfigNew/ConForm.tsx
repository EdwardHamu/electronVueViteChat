import { DialogReactive, NButton, useDialog } from "naive-ui";
import { computed, defineComponent, PropType, reactive, ref, watch } from "vue";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import ModbusAddressModelForm from "../devConfig/addressForm/ModbusAddressModelForm";
import { DeviceConfigEntity } from "~/me";
import ConnectComForm, { ConnectFormIns } from "./connect/ConnectComForm";
import { MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import ConnectTcpForm from "./connect/ConnectTcpForm";
import ConnectOpcDaForm from "./connect/ConnectOpcDaForm";
import ConnectOpcUaForm from "./connect/ConnectOpcUaForm";
import ConnectSiemensForm from "./connect/ConnectSiemensForm";
import ConnectModbusRtuForm from "./connect/ConnectModbusRtuForm";
import ConnectModbusAsciiForm from "./connect/ConnectModbusAsciiForm";
import ConnectBetaTcpForm from "./connect/ConnectBetaTcpForm";
import { driverNameEnum } from "./enum";
import { useMyI18n } from "@/hooks/useMyI18n";

export default defineComponent({
  name: 'ConForm  ',
  props: {
    show: Boolean,
    updateShowFn: Function,
    curRow: Object as PropType<DeviceConfigEntity>,
    updateParentFn: Function,
    connectStr: String
  },
  setup(props, ctx) {
    const show = computed(() => props.show)
    const dialog = useDialog()
    const { t, i18nStore } = useMyI18n()
    const myFormRef = ref<MyFormWrapIns>()
    const alldata = reactive({
      form: {},
      curDialogIns: null as DialogReactive | null,
      curConnectRefType: null
    })
    const getConForm = (driveName: string) => {
      console.log("🪵 [ConForm.tsx:28] ~ token ~ \x1b[0;32mdriveName\x1b[0m = ", driveName);
      let res = null;
      switch (driveName) {
        case 'Modbus Tcp Client':
          res = ConnectTcpForm
          break;
        case 'OPC DA Client':
          res = ConnectOpcDaForm
          break;
        case 'OPC UA Client':
          res = ConnectOpcUaForm
          break;
        case 'Siemens Tcp Client':
          res = ConnectSiemensForm
          break;
        case 'Modbus Rtu Client':
          res = ConnectModbusRtuForm
          break;
        case 'Modbus Ascii Client':
          res = ConnectModbusAsciiForm
          break;
        case driverNameEnum.betaUltrasonic:
          // 超声波偏心仪：Modbus TCP 连接参数 + 壁厚点数
          res = ConnectBetaTcpForm
          break;
        default:
          res = ConnectComForm
          break;
      }
      console.log("🪵 [ConForm.tsx:35] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
      return res
    }

    const submit = (form: any) => {
      let str = JSON.stringify(form)
      props.updateParentFn && props.updateParentFn({ ConnectString: str })
    }
    {/* <ConnectComForm show={show.value} updateShowFn={props.updateShowFn} connectStr={props.connectStr} ></ConnectComForm> */ }
    watch(() => show.value, (v) => {

      if (v) {
        // connectStr.value && (alldata.form = JSON.parse(connectStr.value))
        alldata.curDialogIns = dialog.create({
          title: t('config.connectionConfiguration'),
          content: () => {
            return <div class={'min-h-[170px]'}>
              {/* <MyFormWrap ref={myFormRef} optionMap={optionMap} hideBtn={true} form={alldata.form} itemList={itemList.value}></MyFormWrap> */}
              {(() => {
                const targetForm = getConForm(props.curRow?.DriverName || '')
                return <targetForm getFormRefFn={(ref: any) => { myFormRef.value = ref.value }} show={show.value} updateShowFn={props.updateShowFn} connectStr={props.connectStr} ></targetForm>
              })()
              }
            </div>
          },
          maskClosable: false,
          style: { width: '800px', minHeight: '200px', },
          action: () => {
            return <div class={'flex justify-around items-center w-full'}>
              <NButton style={{ width: '45%', height: '40px', fontSize: '24px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.updateShowFn && props.updateShowFn(false) }}>{t('config.cancel')}</NButton>
              <NButton style={{ width: '45%', height: '40px', fontSize: '24px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => {
                // console.log("🪵 [ConForm.tsx:65] ~ token ~ \x1b[0;myFormRef.value\x1b[0m = ", myFormRef.value!);
                myFormRef.value?.submit(submit)
              }}>{t('config.confirm')}</NButton>
            </div>
          },
          positiveText: t('config.confirm'),
          negativeText: t('config.cancel'),
          onPositiveClick: () => {
            props.updateShowFn && props.updateShowFn(false)
          },
          onNegativeClick: () => {
            props.updateShowFn && props.updateShowFn(false)
          },
          onClose: () => {
            props.updateShowFn && props.updateShowFn(false)
            // ctx.emit('update:show', false) 
          },
          onMaskClick: () => {
            // props.updateShowFn && props.updateShowFn(false)
            return false
          }
          // onAfterLeave: () => {
          //   changeShow()
          // }
        })
      } else {
        alldata.curDialogIns && alldata.curDialogIns?.destroy()
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
