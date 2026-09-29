import { ConnectComModel } from "~/me";
import i18n from "@/i18n";

const t = i18n.global.t

export const tabNameEnum = {
  devConfigNew: 'devConfigNew',
  sysConfig: 'sysConfig',
  dataAddress: 'dataAddress',
  dataGroup: 'dataGroup',
  deviceGroup: 'deviceGroup',
  devDataGroup: 'devDataGroup',
  devConfig: 'devConfig'
}

export enum DeviceClassEnum {
  /** 线径仪 */
  OD = 1,
  /** 电容仪 */
  Cap = 2,
  /** 偏心仪 */
  Ecc = 3,
  /** 凹凸仪 */
  Con = 4,
  /** 计米 */
  Meter = 5,
  /** 控制 */
  Control = 6,
  /** 报警 */
  Alarm = 7,
}

export const DeviceClassHasShapeList = [DeviceClassEnum.OD, DeviceClassEnum.Ecc, DeviceClassEnum.Con]

/**
 * 数据类型
 */
export enum DataClassEnum {
  /** 平均线径 */
  OD = 101,

  /** 线径X */
  ODX = 102,

  /** 线径Y */
  ODY = 103,

  /** 椭圆 */
  OVAL = 104,

  /** 电容 */
  CAP = 201,

  /** 偏心度 */
  ECC = 301,

  /** 偏心角 */
  ANGLE = 302,

  /** 同心度 */
  CONCEN = 303,

  /** 导体线径 */
  CUOD = 304,

  /** 壁厚01 ~ 壁厚08（超声波偏心仪实测壁厚，后端 DataClassEnum.WALL01..WALL08，属于偏心仪数据） */
  WALL01 = 311,
  WALL02 = 312,
  WALL03 = 313,
  WALL04 = 314,
  WALL05 = 315,
  WALL06 = 316,
  WALL07 = 317,
  WALL08 = 318,

  /** 凹凸总数 */
  CON = 401,

  /** 凹计数 */
  CONC = 402,

  /** 凸计数 */
  CONV = 403,

  /** 计米 */
  LENGTH = 501,

  /** 线速 */
  LSPEED = 502,

  /** 开关 */
  SWITCH = 601,

  /** 换轴 */
  SHAFT = 602,

  /** 清零 */
  CLEAR = 603,

  /** 启动 */
  START = 604,

  /** 停止 */
  STOP = 605
}

/**
 * 参数类型
 */
export enum ParamClassEnum {
  /** 实际值 */
  Value = 0,
  /** 设定值 */
  Std = 1,
  /** 公差 */
  Tol = 2,
  /** 上公差 */
  Utol = 3,
  /** 下公差 */
  Ltol = 4,
}

/** 壁厚数据类型列表（按 01..08 顺序） */
export const WALL_DATA_CLASSES = [
  DataClassEnum.WALL01, DataClassEnum.WALL02, DataClassEnum.WALL03, DataClassEnum.WALL04,
  DataClassEnum.WALL05, DataClassEnum.WALL06, DataClassEnum.WALL07, DataClassEnum.WALL08,
]

/**
 * 后端 IDeviceDriver.GetDriverName() 返回的驱动名；前端据此决定连接表单 / 地址表单（ConForm、AdressForm、addForm）。
 * betaUltrasonic 对应 SPC.Driver.Beta.UltrasonicWave（超声波偏心仪 / 壁厚，Modbus TCP）。
 * 名称来自后端 fac4e7e（`UltrasonicWave.DriverName => "UltrasonicWave"`）；c41cddf 时它还叫 "Modbus Tcp Client"，
 * 与 Modbus 驱动同名会让 DriverHelper 按名去重时互相覆盖。后端若再改名，只需同步这里的字符串。
 */
export const driverNameEnum = {
  modbusTcp: 'Modbus Tcp Client',
  modbusRtu: 'Modbus Rtu Client',
  modbusAscii: 'Modbus Ascii Client',
  opcDa: 'OPC DA Client',
  opcUa: 'OPC UA Client',
  siemensTcp: 'Siemens Tcp Client',
  betaUltrasonic: 'UltrasonicWave',
} as const

export const getDeviceClassNameMap = (): Record<number, string> => ({
  [DeviceClassEnum.OD]: t('config.diameterGauge'),
  [DeviceClassEnum.Cap]: t('config.capacitanceMeter'),
  [DeviceClassEnum.Ecc]: t('config.eccentricityGauge'),
  [DeviceClassEnum.Con]: t('config.convexConcaveGauge'),
  [DeviceClassEnum.Meter]: t('config.meter'),
  [DeviceClassEnum.Control]: t('config.control'),
  [DeviceClassEnum.Alarm]: t('config.alarm'),
})
export const DeviceClassNameMap: Record<number, string> = getDeviceClassNameMap()

export const getDataClassNameMap = (): Record<number, string> => ({
  [DataClassEnum.OD]: t('config.averageDiameter'),
  [DataClassEnum.ODX]: t('config.diameterX'),
  [DataClassEnum.ODY]: t('config.diameterY'),
  [DataClassEnum.OVAL]: t('config.ellipse'),
  [DataClassEnum.CAP]: t('config.capacitance'),
  [DataClassEnum.ECC]: t('config.eccentricity'),
  [DataClassEnum.ANGLE]: t('config.eccentricityAngle'),
  [DataClassEnum.CONCEN]: t('config.concentricity'),
  [DataClassEnum.CON]: t('config.convexConcaveTotal'),
  [DataClassEnum.CUOD]: t('config.conductorDiameter'),
  ...Object.fromEntries(WALL_DATA_CLASSES.map((dc, i) => [dc, t('config.wallThicknessN', { n: String(i + 1).padStart(2, '0') })])),
  [DataClassEnum.CONC]: t('config.concaveCount'),
  [DataClassEnum.CONV]: t('config.convexCount'),
  [DataClassEnum.LENGTH]: t('config.meter'),
  [DataClassEnum.LSPEED]: t('config.lineSpeed'),
  [DataClassEnum.SWITCH]: t('config.switch'),
  [DataClassEnum.SHAFT]: t('menu.switchShaft'),
  [DataClassEnum.CLEAR]: t('config.clear'),
  [DataClassEnum.START]: t('menu.start'),
  [DataClassEnum.STOP]: t('menu.stop'),
})
export const DataClassNameMap: Record<number, string> = getDataClassNameMap()

export const getParamClassNameMap = (): Record<number, string> => ({
  [ParamClassEnum.Value]: t('config.actualValue'),
  [ParamClassEnum.Std]: t('config.setValue'),
  [ParamClassEnum.Tol]: t('data.tolerance'),
  [ParamClassEnum.Utol]: t('data.toleranceUp'),
  [ParamClassEnum.Ltol]: t('data.toleranceDwon'),
})
export const ParamClassNameMap: Record<number, string> = getParamClassNameMap()
// export const UnilateralNameList = ['否', '没有下偏差', '没有上偏差']
export const getPermissionNameList = () => [t('config.readOnly'), t('config.writeOnly'), t('config.readWrite')]
export const PermissionNameList = getPermissionNameList()

export const deviceClassOptions = Object.keys(DeviceClassEnum)
  .filter((key) => isNaN(Number(key))) // 过滤掉数字键，只保留字符串定义的 Key
  .map((key) => ({
    // 这里我们可以定义一个映射表来处理中文 Label
    label: DeviceClassNameMap[DeviceClassEnum[key as keyof typeof DeviceClassEnum]],
    value: DeviceClassEnum[key as keyof typeof DeviceClassEnum],
  }));

export const paramClassOptions = Object.keys(ParamClassEnum)
  .filter((key) => isNaN(Number(key))) // 过滤掉数字键，只保留字符串定义的 Key
  .map((key) => ({
    // 这里我们可以定义一个映射表来处理中文 Label
    label: ParamClassNameMap[ParamClassEnum[key as keyof typeof ParamClassEnum]],
    value: ParamClassEnum[key as keyof typeof ParamClassEnum],
  }));

export const dataClassOptions = Object.keys(DataClassEnum)
  .filter((key) => isNaN(Number(key))) // 过滤掉数字键，只保留字符串定义的 Key
  .map((key) => ({
    // 这里我们可以定义一个映射表来处理中文 Label
    label: DataClassNameMap[DataClassEnum[key as keyof typeof DataClassEnum]],
    value: DataClassEnum[key as keyof typeof DataClassEnum],
  }));

// 刷新所有国际化文本的函数
export const refreshDevConfigNewEnums = () => {
  // 刷新 DeviceClassNameMap
  const newDeviceClassNameMap = getDeviceClassNameMap()
  Object.keys(newDeviceClassNameMap).forEach(key => {
    DeviceClassNameMap[Number(key)] = newDeviceClassNameMap[Number(key)]
  })

  // 刷新 DataClassNameMap
  const newDataClassNameMap = getDataClassNameMap()
  Object.keys(newDataClassNameMap).forEach(key => {
    DataClassNameMap[Number(key)] = newDataClassNameMap[Number(key)]
  })

  // 刷新 ParamClassNameMap
  const newParamClassNameMap = getParamClassNameMap()
  Object.keys(newParamClassNameMap).forEach(key => {
    ParamClassNameMap[Number(key)] = newParamClassNameMap[Number(key)]
  })

  // 刷新 PermissionNameList
  const newPermissionNameList = getPermissionNameList()
  PermissionNameList.length = 0
  PermissionNameList.push(...newPermissionNameList)
}

// 刷新 deviceClassOptions
export const refreshDeviceClassOptions = () => {
  const newMap = getDeviceClassNameMap()
  deviceClassOptions.forEach(item => {
    if (newMap[item.value] !== undefined) {
      item.label = newMap[item.value]
    }
  })
}

// 刷新 paramClassOptions
export const refreshParamClassOptions = () => {
  const newMap = getParamClassNameMap()
  paramClassOptions.forEach(item => {
    if (newMap[item.value] !== undefined) {
      item.label = newMap[item.value]
    }
  })
}

// 刷新 dataClassOptions
export const refreshDataClassOptions = () => {
  const newDataClassNameMap = getDataClassNameMap()
  dataClassOptions.forEach(item => {
    if (newDataClassNameMap[item.value] !== undefined) {
      item.label = newDataClassNameMap[item.value]
    }
  })
}


// export const defConnectComForm: ConnectComModel = {
//   PortName: ``,
//   BaudRate: 9600,
//   DataBits: 8,
//   StopBits: 1,
//   Parity: 'N',
//   Cycle: 100,
//   Timeout: 500,
//   Endian32bit: '3412',
//   EndianString: '1234',
//   Endian16bit: '12'
// }