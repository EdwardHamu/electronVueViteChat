import { formListItem } from "@/components/MyFormWrap/MyFormWrap"
import { generateUUID } from "@/utils/utils"
import { ConnectComModel, ConnectFFTModel, ConnectSiemensModel, ConnectSikoraComModel, ConnectSikoraTcpModel, ConnectTcpModel, ConnectZumbachComModel, ConnectZumbachTcpModel, DriverAddressType, DriverConnectType, DriverInfo, ModbusAddressModel } from "~/me"
import { useDevCfgInnerData } from "./innerData"
import i18n from "@/i18n"

const t = i18n.global.t
console.log("🪵 [enum.ts:7] ~ token ~ \x1b[0;32mt\x1b[0m = ", "enum执行");

export const adressSubmitFn = (form: DriverAddressType, innerData: ReturnType<typeof useDevCfgInnerData>) => {
  if (!form.Id && !innerData.checkAddressDataListNotSame(form.DataName)) {
    window.$message.warning(t('config.theDataNameAlreadyExists'))
    return
  }
  if (!form.Id) {
    // form.Id =
    form.Id = generateUUID()
    innerData.addressDataList.push(form)
  } else {
    const index = innerData.addressDataList.findIndex(e => e.Id == form.Id)
    innerData.addressDataList.splice(index, 1, form)
  }
  innerData.cleanAddressRow()
  innerData.setAddressCfgFormShow(false)
}

export const getDevStateList = () => [
  t('config.unavailable'),
  t('config.available'),
]
export const devStateList = getDevStateList()

export const Endian32BitList = [
  '3412',
  '1234',
  '2143',
  '4321',
].map(e => ({
  label: e,
  value: e
}))

const AreaValueList = [0, 1, 3, 4]
export const getAreaList = () => [
  t('config.coilStatus0'),
  t('config.inputStatus1'),
  t('config.inputRegister3'),
  t('config.holdingRegister4')
].map((e, i) => ({
  label: e,
  value: AreaValueList[i]
}))
export const AreaList = getAreaList()

export const PortNameList = [
  'COM1', 'COM2', 'COM3', 'COM4',
].map(e => ({
  label: e,
  value: e
}))

/** 超声波偏心仪壁厚点数可选值（后端 WALL01 ~ WALL08） */
export const WallNumList = [1, 2, 3, 4, 5, 6, 7, 8].map(e => ({
  label: String(e),
  value: e
}))

export const PlcModelList = [
  "S200Smart", "S200", "S1200", "S1500", "S300", "S400"
].map(e => ({
  label: e,
  value: e
}))

export const getDataTypeList = () => [t('config.unsignedInt16'), t('config.signedInt16'), t('config.unsignedInt32'), t('config.signedInt32'), t('config.float32'), t('config.asciiChar'), t('config.boolean')]
  .map((e, i) => ({
    label: e,
    value: i
  }))
export const DataTypeList = getDataTypeList()

// 刷新 AreaList 的国际化文本
export const refreshAreaList = () => {
  const newList = getAreaList()
  AreaList.length = 0
  AreaList.push(...newList)
}

// 刷新 DataTypeList 的国际化文本
export const refreshDataTypeList = () => {
  const newList = getDataTypeList()
  DataTypeList.length = 0
  DataTypeList.push(...newList)
}

export const defaultConnectTcpModel: ConnectTcpModel = {
  Host: `127.0.0.1`,
  Port: 502,
  SlaveId: 1,
  Endian32Bit: '3412',
  Cycle: 100,
  Timeout: 500,
  Endian16Bit: '21'
}
export const defaultConnectFFTModel: ConnectFFTModel = {
  Host: `127.0.0.1`,
  Port: 502,
}
export const defaultConnectComModel: ConnectComModel = {
  PortName: ``,
  BaudRate: "9600",
  DataBits: "8",
  StopBits: "1",
  Parity: 'N',
  // SlaveId: 1,
  Cycle: 100,
  Timeout: 500,
  Endian32bit: '3412',
  Endian16bit: '12',
  EndianString: '21'
}
export const defaultConnectSiemensModel: ConnectSiemensModel = {
  PlcModel: 'S200Smart',
  Host: `192.168.2.1`,
  Port: 102,
  Slot: '0',
  Rack: '1',
  Cycle: 100,
  Timeout: 500
}
export const defaultConnectSikoraTcpModel: ConnectSikoraTcpModel = {
  Host: ``,
  Port: 2001,
  Cycle: 100,
  Timeout: 500
}
export const defaultConnectSikoraComModel: ConnectSikoraComModel = {
  PortName: `COM1`,
  BaudRate: 19200,
  DataBits: 8,
  StopBits: '1',
  Parity: 'N',
  Cycle: 100,
  Timeout: 500,
}
export const defaultConnectZumbachComModel: ConnectZumbachComModel = {
  PortName: `COM1`,
  BaudRate: 9600,
  DataBits: 8,
  StopBits: '1',
  Parity: 'N',
  Cycle: 100,
  Timeout: 500,
  ReadBuffSize: 11,
}
export const defaultConnectZumbachTcpModel: ConnectZumbachTcpModel = {
  Host: ``,
  Port: 7720,
  Cycle: 100,
  Timeout: 500,
  ReadBuffSize: 11,
  Split: '0D 0A'
}
export const getDefaultModbusAddressModel = (): ModbusAddressModel => ({
  Area: t('config.holdingRegister4'),
  DataType: t('config.unsignedInt16'),
  ExchangeData: t('config.float32'),
  EndianBit: "",
  Index: 0,
  Length: 1,
  CountFormula: "",
  DataName: ""
})
export const defaultModbusAddressModel: ModbusAddressModel = getDefaultModbusAddressModel()
export const defaultData: Record<string, DriverConnectType | DriverAddressType> = {
  defaultConnectTcpModel, defaultModbusAddressModel, defaultConnectFFTModel, defaultConnectSiemensModel
}

export const driverInfo = {} as Record<string, DriverInfo>
driverInfo[`Modbus Tcp Client`] = {
  connectType: 'ConnectTcpModel',
  // connectTypeDefaultData:defaultConnectTcpModel,
  addressType: 'ModbusAddressModel',
  colType: 'defaultCol'
  // addressTypeDefaultData:defaultModbusAddressModel
}
driverInfo[`Test FFT Client`] = {
  connectType: 'ConnectFFTModel',
  addressType: 'FFTAddressModel',
  colType: 'fftCol'
}

driverInfo[`Modbus Rtu Client`] = {
  connectType: 'ConnectComModel',
  addressType: 'ModbusAddressModel',
  colType: 'defaultCol'
}

driverInfo[`Siemens S7 Client`] = {
  connectType: 'ConnectSiemensModel',
  addressType: 'SiemensAddressModel',
  colType: 'SiemensCol'
}

export enum propNameEnum {
  Host = 'Host',
  Port = 'Port',
  PortName = 'PortName',
  BaudRate = 'BaudRate',
  DataBits = 'DataBits',
  StopBits = 'StopBits',
  Parity = 'Parity',
  SlaveId = 'SlaveId',
  Cycle = 'Cycle',
  Timeout = 'Timeout',
  Endian32bit = 'Endian32bit',
  Endian16bit = 'Endian16bit',
  EndianString = 'EndianString',
  DataName = 'DataName',
  Name = 'Name',
  Area = 'Area',
  Index = 'Index',
  Length = 'Length',
  DataType = 'DataType',
  CountFormula = 'CountFormula',
  ExchangeData = 'ExchangeData',
  EndianBit = 'EndianBit',
  Frequency = 'Frequency',
  PlcModel = 'PlcModel',
  Slot = 'Slot',
  Rack = 'Rack',
  Address = 'Address',
  Offset = 'Offset',
  CountMark = 'CountMark',
  ReadBuffSize = 'ReadBuffSize',
  Split = 'Split',

  DeviceClass = 'DeviceClass',
  DataClass = 'DataClass',
  ParamClass = 'ParamClass',
  Unit = 'Unit',
  Precision = 'Precision',
  Unilateral = 'Unilateral',
  AlarmType = 'AlarmType',
  Permission = 'Permission',
  State = 'State',
  AddressString = 'AddressString',
  CreateTime = 'CreateTime',

  Exchange = 'Exchange',
  Rate = 'Rate',

  /** 超声波偏心仪：壁厚点数（SPC.Driver.Beta ConnectTcpModel.WallNum，1 ~ 8） */
  WallNum = 'WallNum'
}
export const getPropNameMap = (): Record<string, string> => {
  const map: Record<string, string> = {}
  map[propNameEnum.Host] = t('config.ipAddress')
  map[propNameEnum.Port] = t('config.port')
  map[propNameEnum.SlaveId] = t('config.stationNumber')
  map[propNameEnum.Endian32bit] = t('config.bit32ByteOrder')
  map[propNameEnum.Cycle] = t('config.acquisitionPeriod')
  map[propNameEnum.Timeout] = t('config.communicationTimeout')
  map[propNameEnum.DataName] = t('config.dataName')
  map[propNameEnum.Area] = t('config.registerArea')
  map[propNameEnum.Index] = t('config.startAddress')
  map[propNameEnum.Length] = t('config.registerCount')
  map[propNameEnum.DataType] = t('config.dataType')
  map[propNameEnum.CountFormula] = t('config.dataConversionFormula')
  map[propNameEnum.ExchangeData] = t('config.transformedType')
  map[propNameEnum.EndianBit] = t('config.swapDataEndian')
  map[propNameEnum.Endian16bit] = t('config.bit16ByteOrder')
  map[propNameEnum.PortName] = t('config.serialPortName')
  map[propNameEnum.BaudRate] = t('config.baudRate')
  map[propNameEnum.DataBits] = t('config.dataBits')
  map[propNameEnum.StopBits] = t('config.stopBits')
  map[propNameEnum.Parity] = t('config.parity')
  map[propNameEnum.EndianString] = t('config.stringByteOrder')
  map[propNameEnum.Frequency] = t('config.frequency')
  map[propNameEnum.PlcModel] = t('config.plcModel')
  map[propNameEnum.Slot] = t('config.slot')
  map[propNameEnum.Rack] = t('config.rack')
  map[propNameEnum.Address] = t('config.startAddress')
  map[propNameEnum.Offset] = t('config.dataOffset')
  map[propNameEnum.CountMark] = t('config.countMark')
  map[propNameEnum.ReadBuffSize] = t('config.readDataLength')
  map[propNameEnum.Split] = t('config.delimiter')

  map[propNameEnum.DeviceClass] = t('config.deviceType')
  map[propNameEnum.DataClass] = t('config.dataType')
  map[propNameEnum.ParamClass] = t('config.paramType')
  map[propNameEnum.Unit] = t('config.unit')
  map[propNameEnum.Precision] = t('config.precision')
  map[propNameEnum.Unilateral] = t('config.unilateral')
  map[propNameEnum.AlarmType] = t('config.alarmType')
  map[propNameEnum.Permission] = t('config.permission')
  map[propNameEnum.State] = t('config.status')

  map[propNameEnum.Exchange] = t('config.dataConversion')
  map[propNameEnum.Rate] = t('config.dataMultiplier')
  map[propNameEnum.WallNum] = t('config.wallNum')
  map[propNameEnum.Name] = map[propNameEnum.DataName]

  return map
}
export const propNameMap: Record<string, string> = getPropNameMap()



const mapLabelAndProp = (str: string) => {
  return {
    label: propNameMap[str],
    prop: str
  }
}
export const commonFormItemListMap: Record<string, formListItem> = {
}
commonFormItemListMap[propNameEnum.Host] = { type: 'input', ...mapLabelAndProp(propNameEnum.Host), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Port] = { type: 'input', ...mapLabelAndProp(propNameEnum.Port), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.SlaveId] = { type: 'input', ...mapLabelAndProp(propNameEnum.SlaveId), width: 12, }
commonFormItemListMap[propNameEnum.Endian32bit] = { type: 'select', ...mapLabelAndProp(propNameEnum.Endian32bit), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Endian16bit] = { type: 'select', ...mapLabelAndProp(propNameEnum.Endian16bit), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Cycle] = { type: 'input', ...mapLabelAndProp(propNameEnum.Cycle), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Timeout] = { type: 'input', ...mapLabelAndProp(propNameEnum.Timeout), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.DataName] = { type: 'input', ...mapLabelAndProp(propNameEnum.DataName), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Name] = { type: 'input', ...mapLabelAndProp(propNameEnum.Name), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Area] = { type: 'select', ...mapLabelAndProp(propNameEnum.Area), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.Index] = { type: 'input', ...mapLabelAndProp(propNameEnum.Index), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Length] = { type: 'input', ...mapLabelAndProp(propNameEnum.Length), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.DataType] = { type: 'select', ...mapLabelAndProp(propNameEnum.DataType), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.CountFormula] = { type: 'input', ...mapLabelAndProp(propNameEnum.CountFormula), width: 12, }
commonFormItemListMap[propNameEnum.ExchangeData] = { type: 'select', ...mapLabelAndProp(propNameEnum.ExchangeData), width: 12, }
commonFormItemListMap[propNameEnum.EndianBit] = { type: 'select', ...mapLabelAndProp(propNameEnum.EndianBit), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Frequency] = { type: 'input', ...mapLabelAndProp(propNameEnum.Frequency), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.PortName] = { type: 'input', ...mapLabelAndProp(propNameEnum.PortName), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.BaudRate] = { type: 'select', ...mapLabelAndProp(propNameEnum.BaudRate), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.DataBits] = { type: 'select', ...mapLabelAndProp(propNameEnum.DataBits), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.StopBits] = { type: 'select', ...mapLabelAndProp(propNameEnum.StopBits), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Parity] = { type: 'select', ...mapLabelAndProp(propNameEnum.Parity), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.EndianString] = { type: 'select', ...mapLabelAndProp(propNameEnum.EndianString), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.PlcModel] = { type: 'select', ...mapLabelAndProp(propNameEnum.PlcModel), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Slot] = { type: 'input', ...mapLabelAndProp(propNameEnum.Slot), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Rack] = { type: 'input', ...mapLabelAndProp(propNameEnum.Rack), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Address] = { type: 'input', ...mapLabelAndProp(propNameEnum.Address), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Offset] = { type: 'input', ...mapLabelAndProp(propNameEnum.Offset), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.CountMark] = { type: 'select', ...mapLabelAndProp(propNameEnum.CountMark), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.ReadBuffSize] = { type: 'input', ...mapLabelAndProp(propNameEnum.ReadBuffSize), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Split] = { type: 'input', ...mapLabelAndProp(propNameEnum.Split), width: 12, rule: ['must'] }

commonFormItemListMap[propNameEnum.DeviceClass] = { type: 'select', ...mapLabelAndProp(propNameEnum.DeviceClass), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.DataClass] = { type: 'select', ...mapLabelAndProp(propNameEnum.DataClass), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.ParamClass] = { type: 'select', ...mapLabelAndProp(propNameEnum.ParamClass), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.Unilateral] = { type: 'select', ...mapLabelAndProp(propNameEnum.Unilateral), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.AlarmType] = { type: 'select', ...mapLabelAndProp(propNameEnum.AlarmType), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.Permission] = { type: 'select', ...mapLabelAndProp(propNameEnum.Permission), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.State] = { type: 'switch', ...mapLabelAndProp(propNameEnum.State), checkedValue: 1, uncheckedValue: 0, width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.Unit] = { type: 'input', ...mapLabelAndProp(propNameEnum.Unit), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Exchange] = { type: 'select', ...mapLabelAndProp(propNameEnum.Exchange), width: 12, rule: ['mustNum'] }
commonFormItemListMap[propNameEnum.Rate] = { type: 'input', ...mapLabelAndProp(propNameEnum.Rate), width: 12, rule: ['must'] }
commonFormItemListMap[propNameEnum.Precision] = { type: 'input', ...mapLabelAndProp(propNameEnum.Precision), width: 12, rule: ['must'] }
// 下拉 1 ~ 8（选项见 WallNumList），不用 numInput：项目里没有其它地方用它，样式也未与 input/select 对齐
commonFormItemListMap[propNameEnum.WallNum] = { type: 'select', ...mapLabelAndProp(propNameEnum.WallNum), width: 12, rule: ['mustNum'] }

// 刷新 propNameMap 和 commonFormItemListMap 的国际化文本
export const refreshCommonFormItemListMap = () => {
  // 重新生成 propNameMap
  const newPropNameMap = getPropNameMap()
  Object.keys(newPropNameMap).forEach(key => {
    propNameMap[key] = newPropNameMap[key]
  })

  // 重新生成 commonFormItemListMap 中的 label
  Object.keys(commonFormItemListMap).forEach(key => {
    const item = commonFormItemListMap[key]
    if (item && propNameMap[key]) {
      item.label = propNameMap[key]
    }
  })
}





