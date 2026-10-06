import { getLocalStorage, setLocalStorage } from "@/utils/utils";
import { tabNameEnum } from "@/views/Home/config/devConfigNew/enum";
import { DropdownProps } from "naive-ui";
import { defineStore } from "pinia" // 定义容器
import { v4 as uuidv4 } from 'uuid';
import { CPKEntity, DataGroupEntity, DataValue, DeviceConfigEntity, DeviceGroupEntity, FormulaConfigEntity, FormulaParamEntity, GroupConfigEntity, DataAddressEntity, SysConfigEntity, SysConfigModel } from "~/me";
type connectConfig = {
  data: Record<string, string>[]
}
type connectDev = connectConfig
type dataConfig = {
  histConfig: Record<string, string>,
  alarmCondiList: Record<string, string>[],
  OPCUATopForm: Record<string, string>,
}

const localConnect = JSON.parse(localStorage.getItem('connect') || 'null') || {
  data: <Record<string, string>[]>[],
}
const localConnectDev = JSON.parse(localStorage.getItem('connectDev') || 'null') || {
  data: <Record<string, string>[]>[],
}

const localDataConfig = JSON.parse(localStorage.getItem('dataConfig') || 'null') || {
  histConfig: <Record<string, string>>{},
  alarmCoodiList: <Record<string, string>[]>[],
  OPCUATopForm: <Record<string, string>>{},
}
const defaultTab = tabNameEnum.sysConfig

export const useConfigStore = defineStore('config', {
  /**
   * 存储全局状态
   * 1.必须是箭头函数: 为了在服务器端渲染的时候避免交叉请求导致数据状态污染
   * 和 TS 类型推导
  */

  state: () => {
    return {
      isShowConfig: false,
      productHistoryShow: false,
      productLogShow: false,
      formulaCfgShow: false,
      connect: localConnect as connectConfig,
      dataConfig: localDataConfig as dataConfig,
      connectDev: localConnectDev as connectDev,
      needRestart: false,
      chartDataAdressList: [] as DeviceGroupEntity[],
      showDataAdressList: [] as DeviceGroupEntity[],
      chartDataGroupList: [] as DataGroupEntity[],
      curChartDataGroup: getLocalStorage('curChartDataGroup', null) as DataGroupEntity | null | undefined,
      curChartAdress: null as DataAddressEntity | null | undefined,
      curMultiChartAdress: getLocalStorage('curMultiChartAdress', []) as DataGroupEntity[],
      curCpk: null as CPKEntity | null,
      curRealTimeData: null as DataValue | null | undefined,

      sysConfig: {} as SysConfigModel,
      originSysConfig: [] as SysConfigEntity[],
      configTab: defaultTab,

      allSubmitCount: 0,
      // curTabValue: 'sysConfig',

      curDevConfigRow: null as DeviceConfigEntity | null,
      addressShow: false,
      addressFormShow: false,
      devDataGroupAddressFormShow: false,
      curAddressRow: null as DataAddressEntity | null,
      curDevDataGroupRow: null as DataGroupEntity | null,
      devDataGroupShow: false,
      updateAdressRowFn: () => { },
      addFormShow: false,
      updateDevConfigRowFn: () => { },
      isAdressAddMore: false,
      addressFormIsAdd: false,
      curGroupConfigRow: null as GroupConfigEntity | null,
      curDeviceGroupRow: null as DeviceGroupEntity | null | undefined,
      curDataGroupRow: null as DataGroupEntity | null | undefined,
      curEnableFormulaRow: null as FormulaConfigEntity | null | undefined,
      curEnableFormulaParamList: null as FormulaParamEntity[] | null | undefined,
      initServiceFn: () => { },
      refreshAllConfigFn: () => Promise.resolve(),


      DevChooseShow: false,
      AdressChooseShow: false,
      updateDataGroupRowFn: () => { },
      updateDevDataGroupRowFn: () => { },
      updateDevGroupRowFn: () => { },

      DeviceGroupShow: false, //TabShow
      devConfigTabShow: false,

      dataGroupAddFromShow: false,
      DeviceGroupAddFromShow: false,
      commonTabWidthObj: {} as Record<string, string>,

      devDataGroupDevListShow: false,

      chartType: getLocalStorage('chartType', 0) as number,
      curChartDeviceType: getLocalStorage('curChartDeviceType', '') as string,

      /** 展示模式：开启后不再采集真数据，产品分类下的数据全部使用随机假数据（保留5位小数） */
      demoMode: getLocalStorage('demoMode', 0) as number,
      /** 展示模式假数据随机范围，按变量（数据组 GId）配置 { min, max } */
      demoRanges: getLocalStorage('demoRanges', {}) as Record<string, { min: number, max: number }>,
    }
  },
  /**
   * 用来封装计算属性 有缓存功能  类似于computed
   */
  getters: {

  },
  /**
   * 编辑业务逻辑  类似于methods
   */
  actions: {
    saveConnectConfig() {
      localStorage.setItem('connect', JSON.stringify(this.connect))
    },
    saveDataConfig() {
      localStorage.setItem('dataConfig', JSON.stringify(this.dataConfig))
    },
    setIsShowConfig(value: boolean) {
      this.isShowConfig = value
    },
    setConnect(value: any) {
      this.connect = value
    },
    addConnectData(row: Record<string, string>) {
      this.connect.data.push(row)
      this.saveConnectConfig()
    },
    delConnectRow(id: string) {
      this.connect.data = this.connect.data.filter(item => item.id !== id)
      this.saveConnectConfig()
    },
    editConnectRow(row: Record<string, string>) {
      this.connect.data = this.connect.data.map(item => item.id === row.id ? row : item)
      this.saveConnectConfig()
    },
    setAlarmCondiData(value: Record<string, string>[]) {
      this.dataConfig.alarmCondiList = value
      this.saveDataConfig()
    },
    // addConnectDevData(row: Record<string, string>) {
    //   this.connectDev.data.push(row)
    //   this.saveConnectDev()
    // }
    // addAlarmCondiData(row: Record<string, string>) {
    //   this.dataConfig.alarmCondiList.push(row)
    //   this.saveDataConfig()
    // },
    // delAlarmCondiRow(id: string) {
    //   this.connect.data = this.connect.data.filter(item => item.id !== id)
    //   this.saveDataConfig()
    // },
    // editAlarmCondiRow(row: Record<string, string>) {
    //   this.connect.data = this.connect.data.map(item => item.id === row.id ? row : item)
    //   this.saveConnectConfig()
    // },
    setHistConfig(value: Record<string, string>) {
      this.dataConfig.histConfig = value
      this.saveDataConfig()
    },
    setOPCUATopForm(value: Record<string, string>) {
      this.dataConfig.OPCUATopForm = value
      this.saveDataConfig()
    },
    setSysConfig(value: SysConfigModel) {
      this.sysConfig = value
    },
    setOriginSysConfig(value: SysConfigEntity[]) {
      this.originSysConfig = value
    },
    setProductHistoryShow(value: boolean) {
      this.productHistoryShow = value
    },
    setProductLogShow(value: boolean) {
      this.productLogShow = value
    },
    setFormulaCfgShow(value: boolean) {
      this.formulaCfgShow = value
    },
    setConfigTab(value: string) {
      this.configTab = value
    },
    addSubmitCount() {
      this.allSubmitCount++
    },
    setCurDevConfigRow(value: DeviceConfigEntity | null) {
      this.curDevConfigRow = value
    },
    setAddressShow(value: boolean) {
      this.addressShow = value
    },
    setCurDeviceGroupRow(value: DeviceGroupEntity | null | undefined) {
      this.curDeviceGroupRow = value
    },
    setAddressFormShow(value: boolean) {
      this.addressFormShow = value
    },
    setCurAddressRow(value: DataAddressEntity | null) {
      this.curAddressRow = value
    },
    setUpdateAdressRowFn(value: () => void) {
      this.updateAdressRowFn = value
    },
    setAddFormShow(value: boolean) {
      this.addFormShow = value
    },
    setUpdateDevConfigRowFn(value: () => void) {
      this.updateDevConfigRowFn = value
    },
    setIsAdressAddMore(value: boolean) {
      this.isAdressAddMore = value
    },
    setCurGroupConfigRow(value: GroupConfigEntity | null) {
      this.curGroupConfigRow = value
    },
    setCurDataGroupRow(value: DataGroupEntity | null | undefined) {
      this.curDataGroupRow = value
    },
    setDeviceGroupShow(value: boolean) {
      this.DeviceGroupShow = value
    },
    setDevChooseShow(value: boolean) {
      this.DevChooseShow = value
    },
    setAdressChooseShow(value: boolean) {
      this.AdressChooseShow = value
    },
    setUpdateDataGroupRowFn(value: () => void) {
      this.updateDataGroupRowFn = value
    },
    setUpdateDevGroupRowFn(value: () => void) {
      this.updateDevGroupRowFn = value
    },
    setUpdateDevDataGroupRowFn(value: () => void) {
      this.updateDevDataGroupRowFn = value
    },
    setDataGroupAddFromShow(value: boolean) {
      this.dataGroupAddFromShow = value
    },
    setNeedRestart(value: boolean) {
      this.needRestart = value
    },
    setChartDataAdressList(value: DeviceGroupEntity[]) {
      this.chartDataAdressList = value
    },
    setCurChartAdress(value: DataAddressEntity | null | undefined) {
      this.curChartAdress = value
    },
    setCurChartDataGroup(value: DataGroupEntity | null | undefined) {
      setLocalStorage('curChartDataGroup', value)
      this.curChartDataGroup = value
    },
    setDevDataGroupDevListShow(value: boolean) {
      this.devDataGroupDevListShow = value
    },
    addMultiChartAdress(value: DataGroupEntity) {
      this.curMultiChartAdress.push(value)
      setLocalStorage('curMultiChartAdress', this.curMultiChartAdress)
    },
    setChartDataGroupList(value: DataGroupEntity[]) {
      this.chartDataGroupList = value
    },
    removeMultiChartAdress(value: DataGroupEntity) {
      this.curMultiChartAdress = this.curMultiChartAdress.filter(item => item.GId !== value.GId)
      setLocalStorage('curMultiChartAdress', this.curMultiChartAdress)
    },
    clearMultiChartAdress() {
      this.curMultiChartAdress = []
    },
    setDevDataGroupShow(value: boolean) {
      this.devDataGroupShow = value
    },
    setCurCpk(value: CPKEntity | null) {
      this.curCpk = value
    },
    setCurRealTimeData(value: DataValue | null | undefined) {
      this.curRealTimeData = value
    },
    setDevDataGroupAddressFormShow(value: boolean) {
      this.devDataGroupAddressFormShow = value
    },
    setCurDevDataGroupRow(value: DataGroupEntity | null) {
      this.curDevDataGroupRow = value
    },
    setShowDataAdressList(value: DeviceGroupEntity[]) {
      this.showDataAdressList = value
    },
    setCurEnableFormulaRow(value: FormulaConfigEntity | null | undefined) {
      this.curEnableFormulaRow = value
    },
    setCurEnableFormulaParamList(value: FormulaParamEntity[] | null | undefined) {
      this.curEnableFormulaParamList = value
    },
    setInitServiceFn(value: () => void) {
      this.initServiceFn = value
    },
    setCommonTabWidthObj(value: Record<string, string>) {
      this.commonTabWidthObj = value
    },
    setDeviceGroupAddFormShow(value: boolean) {
      this.DeviceGroupAddFromShow = value
    },
    setDevConfigTabShow(value: boolean) {
      this.devConfigTabShow = value
    },
    setRefreshAllConfigFn(value: () => Promise<void>) {
      this.refreshAllConfigFn = value
    },
    setAddressFormIsAdd(value: boolean) {
      this.addressFormIsAdd = value
    },
    setDemoMode(value: number) {
      this.demoMode = value
      setLocalStorage('demoMode', value)
    },
    setDemoRanges(value: Record<string, { min: number, max: number }>) {
      this.demoRanges = value
      setLocalStorage('demoRanges', value)
    },
    setChartType(value: number) {
      this.chartType = value
      setLocalStorage('chartType', value)
    },
    setCurChartDeviceType(value: string) {
      this.curChartDeviceType = value
      setLocalStorage('curChartDeviceType', value)
    },
  }


})

