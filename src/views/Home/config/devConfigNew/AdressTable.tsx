import { c, DialogReactive, NButton, useDialog } from "naive-ui";
import { computed, defineComponent, PropType, reactive, ref, watch } from "vue";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import ModbusAddressModelForm from "../devConfig/addressForm/ModbusAddressModelForm";
import { DeviceConfigEntity, DataAddressEntity, ModbusAdressSubItem, simpleTableColumn } from "~/me";
import ConnectComForm, { ConnectFormIns } from "./connect/ConnectComForm";
import { MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import SimpleTable from "@/components/SimpleTable";
import { DataClassEnum, DataClassNameMap, DeviceClassNameMap, ParamClassEnum, ParamClassNameMap, PermissionNameList, refreshDevConfigNewEnums, tabNameEnum } from "./enum";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { useConfigStore } from "@/store/config";
import { useMyI18n } from "@/hooks/useMyI18n";
import { AlarmTypeNameList, UnilateralNameList } from "../dataCofigNew/enum";
import AdressForm from "./AdressForm";
import { sleep } from "@/utils/utils";
import { getDataTypeList } from "../devConfig/enum";

const defSubAdressItem: ModbusAdressSubItem = {
  Area: 0,
  Index: 0,
  Length: 2,
  DataType: 0,
  Exchange: 0,
  Rate: 1,
  Offset: 0
}
const defAdressRow: DataAddressEntity = {
  Name: '',
  DeviceId: '',
  Permission: 0,
  State: 1,
  AddressString: JSON.stringify(defSubAdressItem),
}

export default defineComponent({
  name: 'AdressForm',
  props: {
    show: Boolean,
    updateShowFn: Function,
    curRow: Object as PropType<DeviceConfigEntity>,
    updateParentFn: Function,
  },
  setup(props, ctx) {
    const show = computed(() => props.show)
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const dialog = useDialog()
    const myFormRef = ref<MyFormWrapIns>()

    const rowClick = (row: simpleTableColumn, item: DataAddressEntity) => {
      configStore.setCurAddressRow(item)
    }
    const deleteClick = (row: simpleTableColumn, item: DataAddressEntity) => {
      callBrige(callFnName.DeleteDataAddress, item.GId).then(() => {
        window.$message.success(t('config.deleteSuccess'))
        getData()
      })
    }
    const addClick = (row: simpleTableColumn, item: DataAddressEntity) => {
      // configStore.setCurAddressRow(null)
      configStore.setAddressFormIsAdd(true)
      configStore.setAddressFormShow(true)
    }
    const stateClick = (row: simpleTableColumn, item: DataAddressEntity) => {
      rowClick(row, item)
      callBrige(callFnName.SaveDataAddress, item).then((res: any) => {
        window.$message.success(t('config.saveSuccess'))
        getData()
      })
    }
    const editClick = () => {
      configStore.setAddressFormIsAdd(false)
      configStore.setAddressFormShow(true)
    }
    const alldata = reactive({
      form: {},
      formIsAdd: false,
      curDialogIns: null as DialogReactive | null,
      curConnectRefType: null,
      data: [] as DataAddressEntity[],
      coloumns: [
        { label: t('config.dataName'), prop: 'Name', flex: 2, },
        // 数据类型 / 起始地址来自 AddressString JSON（getData 时解析到行上）
        { label: t('config.dataType'), prop: 'DataType', flex: 1, mapFn: (col: any, item: DataAddressEntity & { DataType?: number }) => { const n = Number(item.DataType); return Number.isFinite(n) ? (getDataTypeList()[n]?.label || '') : '' } },
        { label: t('config.startAddress'), prop: 'Index', flex: 1, },
        // { label: '数据分类', prop: 'DeviceClass', flex: 2, mapFn: (col: any, item: DataAddressEntity) => { return DeviceClassNameMap[item.DeviceClass] } },
        // { label: '数据类型', prop: 'DataClass', flex: 2, mapFn: (col: any, item: DataAddressEntity) => { return DataClassNameMap[item.DataClass] } },
        // { label: '参数类型', prop: 'ParamClass', flex: 2, mapFn: (col: any, item: DataAddressEntity) => { return ParamClassNameMap[item.ParamClass] } },
        // { label: '是否单边数据', prop: 'Unilateral', flex: 2, mapFn: (col: any, item: DataAddressEntity) => { return UnilateralNameList[item.Unilateral] } },
        // // { label: '报警类型', prop: 'AlarmType', flex: 2, mapFn: (col: any, item: DataAddressEntity) => { return AlarmTypeNameList[item.AlarmType] } },
        // // { label: '从站地址', prop: 'SlaveId', flex: 1, },
        { label: t('config.readWritePermission'), prop: 'Permission', flex: 1, mapFn: (col: any, item: DataAddressEntity) => { return PermissionNameList[item.Permission] } },
        // { label: '精度', prop: 'Precision', flex: 1 },
        // { label: '单位', prop: 'Unit', flex: 1  },
        {
          label: t('config.status'), prop: 'State', flex: 1, isSwitch: true, btnFn: stateClick,
          mapFn: (col: any, item: DataAddressEntity) => { return item.State == 1 ? t('config.enabled') : t('config.disabled') }
        },
        // {
        //   label: '', prop: 'op', btnText: '编辑', flex: 1, btnFn: (col: any, item: any) => {
        //     configStore.setAddressFormShow(true)
        //     rowClick(col, item)
        //   }
        // },
        // { label: '', prop: 'op1', btnText: '删除', flex: 1, btnFn: deleteClick, btnType: 'danger' },
      ] as simpleTableColumn[],
    })

    const getData = () => {
      callBrige(callFnName.GetDataAddresses, configStore.curDevConfigRow?.GId).then((res: DataAddressEntity[]) => {
        // console.log("🪵 [AdressTable.tsx:60] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        res = res.map(e => {
          let subItem = e.AddressString ? JSON.parse(e.AddressString) : defSubAdressItem
          return {
            ...e,
            SlaveId: subItem.SlaveId,
            Length: subItem.Length,
            DataType: subItem.DataType,
            Index: subItem.Index
          }
        })
        // res.push({
        //   ...defAdressRow,
        //   Name: '新增数据',
        //   DeviceId: configStore.curDevConfigRow?.GId || '',
        //   isNewRow: true
        // })
        alldata.data = res
      })
    }
    const submit = (form: any) => {
      let str = JSON.stringify(form)
      props.updateParentFn && props.updateParentFn({ ConnectString: str })
    }

    watch(() => configStore.addressShow, (v) => {
      if (v) {
        refreshDevConfigNewEnums()
        getData()
        configStore.setUpdateAdressRowFn(getData)
      }
    }, {
      immediate: true
    })

    watch(() => i18nStore.langChangeCount, () => {
      sleep(100).then(() => {
        refreshDevConfigNewEnums()
        alldata.coloumns[0].label = t('config.dataName')
        alldata.coloumns[1].label = t('config.dataType')
        alldata.coloumns[2].label = t('config.startAddress')
        alldata.coloumns[3].label = t('config.readWritePermission')
        alldata.coloumns[4].label = t('config.status')
      })

    })

    return () => {
      return (
        <div class={'w-full  overflow-x-hidden -top-5 px-4 text-lg bg-[#f5f6f6] h-full'} style={{}}>
          <SimpleTable
            dat={alldata.data} col={alldata.coloumns}
            addAndEditAndDelFn={[addClick, editClick, deleteClick]}
            btnShowList={[1, 1, 1]}
            rowClickFn={rowClick}
            defIsEditing={true}
            hideEditSwitch={true}
          />

          <AdressForm />
        </div>
      )
    }
  }

})