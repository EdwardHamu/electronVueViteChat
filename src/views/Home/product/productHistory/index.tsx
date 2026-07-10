import AbsBottomBtn from "@/components/AbsBottomBtn";
import MyNTable from "@/components/MyNTable";
import { useMain } from "@/store";
import { useConfigStore } from "@/store/config";
import { callSpc } from "@/utils/call";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { formatDate } from "@/utils/utils";
import classNames from "classnames";
import { NButton, NDatePicker, NDivider, NDrawer, NDrawerContent, NInput, NSelect, NSpace, NTabPane, NTabs, useMessage } from "naive-ui";
import { computed, defineComponent, onMounted, reactive, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { ProductHistoryEntity } from "~/me";
import { useProductHistoryInnerDataStore } from "./innerData";
import activeImg from '@/assets/LineDspButton_inactive.png'
import ProductLog from "./ProductLog";
import Statistic from "./Statistic";

export default defineComponent({
  name: 'ProductHistory',
  setup(props, ctx) {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const store = useMain()
    const innerData = useProductHistoryInnerDataStore()
    const msg = useMessage()
    const alldata = reactive({
      curTabValue: 'product',
      defaultTab: 'product',
      commonStyle: {
        maxWidth: configStore.commonTabWidthObj.maxWidth, fontSize: '20px', minWidth: configStore.commonTabWidthObj.minWidth, borderTop: '1px solid #58595a', borderRight: '1px solid #58595a', borderLeft: '1px solid #58595a', borderBottom: '1px solid #58595a',
        flexGrow: 1, background: '#fff', borderRadius: '12px 12px 0 0',
      },
      activeStyle: {
        background: `#f5f6f6`,
        backgroundSize: 'cover',
        borderBottom: "0",
        color: '#000',
        zIndex: 6
      },
      showStatic: false,
      showLog: false
    })

    const cancel = () => {
      configStore.setProductHistoryShow(false)
    }
    const jumpStatic = (row: ProductHistoryEntity) => {

    }
    const jumpLog = (row: ProductHistoryEntity) => {
      innerData.setCurRow(row)
      alldata.showLog = true
    }
    const copyPath = (path?: string) => {
      if (!path) return
      navigator.clipboard.writeText(path)
      msg.success(t('config.copySuccess'))
    }
    const renderCopyCell = (path?: string) => {
      return (
        <span class={'cursor-pointer'} onClick={() => copyPath(path)}>{path}</span>
      )
    }
    const tableCfg = reactive({
      columns: [
        { key: 'ProductNo', title: t('config.spoolNumber'), resizable: true, align: 'center', render: (row: ProductHistoryEntity) => renderCopyCell(row.ProductNo) },
        { key: 'PN', title: t('config.wireModel'), resizable: true, render: (row: ProductHistoryEntity) => renderCopyCell(row.PN) },
        // { key: 'Note', title: '物料注释', resizable: true },
        { key: 'StartTime', title: t('config.startTime'), resizable: true },
        { key: 'EndTime', title: t('config.endTime'), resizable: true },
        { key: 'Operator', title: t('config.operator'), resizable: true, width: 120 },
        { key: 'ExcelPath', title: t('config.excelExportPath'), resizable: true, ellipsis: { tooltip: true }, render: (row: ProductHistoryEntity) => renderCopyCell(row.ExcelPath) },
        { key: 'PdfPath', title: t('config.pdfExportPath'), resizable: true, ellipsis: { tooltip: true }, render: (row: ProductHistoryEntity) => renderCopyCell(row.PdfPath) },
        // {
        //   key: 'op', title: t('config.other'), resizable: true, render: (row: ProductHistoryEntity) => {
        //     return (
        //       <NSpace justify="center">
        //         <div class={'border border-solid border-gray-500 p-1 text-lg cursor-pointer'} onClick={() => { jumpStatic(row) }} >
        //           {t('config.statisticalData')}
        //         </div>
        //         <div class={'border border-solid border-gray-500 p-1 text-lg cursor-pointer'} onClick={() => { jumpLog(row) }}>
        //           {t('config.productLog')}
        //         </div>
        //       </NSpace>
        //     )
        //   }
        // },
      ],
      tdata: [
        // { PN: 22232 },
        // { PN: 22232 }
      ] as ProductHistoryEntity[],
      rowProps: (row: ProductHistoryEntity) => {
        return {
          onClick: () => rowClick(row)
        }
      },
      rowClassName: (row: ProductHistoryEntity) => {
        return row.GId == innerData.curRow?.GId ? 'is-selected' : ''
      },
      rowKey: (row: ProductHistoryEntity) => row.GId,
      virtualScroll: true,
      isSimpleStyle: true
    })
    var sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 3);
    const commonData = reactive({
      filterText: '',
      selectProps: tableCfg.columns[0].key,
      // tableCfg.columns[2]
      selectOpt: [tableCfg.columns[0], tableCfg.columns[1]].map(e => {
        return { label: e.title, value: e.key }
      }),
      range: [sevenDaysAgo.getTime(), Date.now()] as [number, number]
    })
    const rowClick = (row: ProductHistoryEntity) => {
      innerData.setCurRowKey([row.GId!])
      innerData.setCurRow(row)
    }
    const ftdata = computed(() => {
      // let res = true
      let isTrue = false
      if (!commonData.filterText) isTrue = true
      if (!commonData.selectProps) isTrue = true
      let list = tableCfg.tdata
      // .filter(item => {
      //   if (isTrue) return true
      //   let val = item[commonData.selectProps as keyof ProductHistoryEntity]
      //   if (!val) return false
      //   return val.toString().includes(commonData.filterText)
      // })
      return list
    })
    const getTableData = (isTimeRange?: boolean) => {
      let data: Record<string, string> = {}
      if (isTimeRange) {
        data.startTime = formatDate(commonData.range[0])
        data.endTime = formatDate(commonData.range[1])
      }
      callBrige(callFnName.GetProductHistorys, [data.startTime, data.endTime, commonData.filterText], true).then((res: ProductHistoryEntity[]) => {
        console.log("🚀 ~ file: index.tsx:48 ~ callSpc ~ res:", res)
        if (res.length == 0) {
          msg.warning(t('config.noData'))
        }
        tableCfg.tdata = res.map(item => {
          return {
            ...item,
            StartTime: formatDate(item.StartTime),
            EndTime: formatDate(item.EndTime)
          }
        })
      })
    }

    const handleTabChange = (value: string) => {
      // curTabValue.value = value
      alldata.curTabValue = value
    }

    // 语言切换时更新 tableCfg 中的标题
    watch(() => i18nStore.langChangeCount, () => {
      tableCfg.columns[0].title = t('config.spoolNumber')
      tableCfg.columns[1].title = t('config.wireModel')
      tableCfg.columns[2].title = t('config.startTime')
      tableCfg.columns[3].title = t('config.endTime')
      tableCfg.columns[4].title = t('config.operator')
      tableCfg.columns[5].title = t('config.excelExportPath')
      tableCfg.columns[6].title = t('config.pdfExportPath')
    })

    onMounted(() => {
      getTableData(true)

    })


    return () => {
      return (
        <div class={' w-screen h-screen absolute  flex flex-col z-10 bg-[#f5f6f6] overflow-hidden'}>
          {/* <NTabs value={alldata.curTabValue} type="card" animated size="large" barWidth={1148} pane-class={'shrink-0 h-full'} class={'config-tab h-full w-full'} onUpdateValue={handleTabChange} defaultValue={alldata.defaultTab} >
            <NTabPane displayDirective="show:lazy" name={"product"} tab={t('config.productHistory')} tabProps={{ style: { ...alldata.commonStyle, ...alldata.curTabValue == 'product' ? alldata.activeStyle : {} } }}>
              
            </NTabPane>

          </NTabs> */}
          <div class={' h-full shrink '}>
            {/* <SysConfig /> */}
            <div class={classNames('flex-shrink flex h-full w-full', { 'flex-col': !store.isLandscape })}>
              <div class={classNames("flex flex-col ", { 'w-full': store.isLandscape, 'h-1/2': !store.isLandscape })}>
                <div class={'p-3 flex justify-between items-center'}>
                  <NSpace>
                    <NSelect class={'w-32'} v-model:value={commonData.selectProps} options={commonData.selectOpt}></NSelect>
                    <NInput v-model:value={commonData.filterText} placeholder={t('config.pleaseInput')} clearable ></NInput>

                    <NDatePicker v-model:value={commonData.range} type="daterange" clearable />
                    <NButton secondary strong={true} type="primary" size={'medium'} class={' w-full shrink mr-2 flex-1'} style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} onClick={() => { getTableData(true) }}>{t('config.query')}</NButton>
                  </NSpace>
                  <NSpace>
                    <NButton secondary strong={true} type="primary" size={'medium'} class={'  shrink mr-2 '} style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} onClick={() => {
                      if (!innerData.curRow) {
                        msg.warning(t('config.pleaseSelectOneRow'))
                        return
                      }
                      alldata.showStatic = true
                    }}>{t('config.statisticalData')}</NButton>
                    <NButton secondary strong={true} type="primary" size={'medium'} class={'  shrink mr-2 '} style={{ backgroundImage: `url(${activeImg})`, backgroundSize: '100% 100%', color: '#534d62' }} onClick={() => {
                      if (!innerData.curRow) {
                        msg.warning(t('config.pleaseSelectOneRow'))
                        return
                      }
                      alldata.showLog = true
                    }}>{t('config.productLog')}</NButton>
                  </NSpace>
                </div>
                <div class={'flex-1 min-h-0'}>
                  {/* @ts-ignore */}
                  <MyNTable {...tableCfg} data={ftdata.value} />
                </div>
              </div>

              {/* <div class={classNames(' border-0 border-l border-gray-200 border-solid', { 'w-1/2': store.isLandscape, 'h-1/2': !store.isLandscape })}>
              <div class={classNames('h-1/2 flex flex-col',)}>
                <NDivider titlePlacement="left" >线轴统计数据</NDivider >
                <Statistic />
              </div>
              <div class={'h-1/2 flex flex-col'}>
                <NDivider titlePlacement="left" >产品日志</NDivider >
                <ProductLog />
              </div>

            </div> */}


            </div>
          </div>



          <AbsBottomBtn cancelFn={cancel} showApply={false} />
          <NDrawer v-model:show={alldata.showStatic} placement="right" width="80%" >
            <NDrawerContent title={t('config.statisticalData')} closable>
              <Statistic />
            </NDrawerContent>
          </NDrawer>
          <NDrawer v-model:show={alldata.showLog} placement="right" width="80%" >
            <NDrawerContent title={t('config.productLog')} closable>
              <ProductLog />
            </NDrawerContent>
          </NDrawer>
        </div>
      )
    }
  }

})
