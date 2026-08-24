import AbsBottomBtn from "@/components/AbsBottomBtn";
import MyNTable from "@/components/MyNTable";
import { useMain } from "@/store";
import { useConfigStore } from "@/store/config";
import { callSpc } from "@/utils/call";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { formatDate } from "@/utils/utils";
import classNames from "classnames";
import { NButton, NDatePicker, NDrawer, NDrawerContent, NInput, NSpace, NTabPane, NTabs, useMessage } from "naive-ui";
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
      showLog: false
    })

    const cancel = () => {
      configStore.setProductHistoryShow(false)
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
    const openExportFile = (path: string) => {
      callBrige(callFnName.OpenFile, path)
    }
    const getParentDirectoryParentPath = (path?: string) => {
      const parentPath = path?.replace(/[\\/][^\\/]+$/, '')
      return parentPath?.replace(/[\\/][^\\/]+$/, '') || ''
    }
    const renderExportFileCell = (row: ProductHistoryEntity) => {
      const directory = getParentDirectoryParentPath(row.ExcelPath) || getParentDirectoryParentPath(row.PdfPath)
      return (
        <div class={'flex items-center gap-2 min-w-0'}>
          <NButton size="tiny" type="primary" disabled={!row.ExcelPath} onClick={(event) => {
            event.stopPropagation()
            openExportFile(row.ExcelPath)
          }}>Excel</NButton>
          <NButton size="tiny" type="error" disabled={!row.PdfPath} onClick={(event) => {
            event.stopPropagation()
            openExportFile(row.PdfPath)
          }}>PDF</NButton>
          <span class={'min-w-0 truncate'} title={directory}>({directory})</span>
        </div>
      )
    }
    const defaultStartTime = new Date()
    defaultStartTime.setDate(defaultStartTime.getDate() - 3)
    const filterData = reactive({
      ProductNo: '',
      PN: '',
      StartTime: defaultStartTime.getTime(),
      EndTime: Date.now(),
    })
    const rowClick = (row: ProductHistoryEntity) => {
      innerData.setCurRowKey([row.GId!])
      innerData.setCurRow(row)
    }
    let tableCfg: any
    const getTableData = () => {
      callBrige(callFnName.GetProductHistorys, [formatDate(filterData.StartTime), formatDate(filterData.EndTime), filterData.PN], true).then((res: ProductHistoryEntity[]) => {
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
    const handleFilterKeyup = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        getTableData()
      }
    }
    const renderTextColumnTitle = (label: string, key: 'ProductNo' | 'PN') => {
      return (
        <div class={'flex flex-col gap-1'}>
          <span>{label}</span>
          <NInput v-model:value={filterData[key]} size="small" clearable onKeyup={handleFilterKeyup} />
        </div>
      )
    }
    const renderTimeColumnTitle = (label: string, key: 'StartTime' | 'EndTime') => {
      return (
        <div class={'flex flex-col gap-1'}>
          <span>{label}</span>
          <NDatePicker
            value={filterData[key]}
            type="datetime"
            size="small"
            style={'width: 100%'}
            onUpdateValue={(value) => {
              if (value === null) return
              filterData[key] = value
              getTableData()
            }}
            onKeyup={handleFilterKeyup}
          />
        </div>
      )
    }
    tableCfg = reactive({
      columns: [
        { key: 'ProductNo', title: renderTextColumnTitle(t('config.spoolNumber'), 'ProductNo'), resizable: true, align: 'center', render: (row: ProductHistoryEntity) => renderCopyCell(row.ProductNo) },
        { key: 'PN', title: renderTextColumnTitle(t('config.wireModel'), 'PN'), resizable: true, render: (row: ProductHistoryEntity) => renderCopyCell(row.PN) },
        { key: 'StartTime', title: renderTimeColumnTitle(t('config.startTime'), 'StartTime'), resizable: true, },
        { key: 'EndTime', title: renderTimeColumnTitle(t('config.endTime'), 'EndTime'), resizable: true, },
        { key: 'Operator', title: t('config.operator'), resizable: true, width: 100 },
        { key: 'ExportFiles', title: t('config.exportFiles'), resizable: true, ellipsis: { tooltip: true }, render: (row: ProductHistoryEntity) => renderExportFileCell(row) },
      ],
      tdata: [] as ProductHistoryEntity[],
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
    const ftdata = computed(() => {
      const textFilters = ['ProductNo', 'PN'] as const
      return tableCfg.tdata.filter((row: ProductHistoryEntity) => {
        return textFilters.every(key => {
          const filterValue = filterData[key].trim()
          return !filterValue || String(row[key] ?? '').includes(filterValue)
        })
      })
    })

    const handleTabChange = (value: string) => {
      // curTabValue.value = value
      alldata.curTabValue = value
    }

    // 语言切换时更新 tableCfg 中的标题
    watch(() => i18nStore.langChangeCount, () => {
      tableCfg.columns[0].title = renderTextColumnTitle(t('config.spoolNumber'), 'ProductNo')
      tableCfg.columns[1].title = renderTextColumnTitle(t('config.wireModel'), 'PN')
      tableCfg.columns[2].title = renderTimeColumnTitle(t('config.startTime'), 'StartTime')
      tableCfg.columns[3].title = renderTimeColumnTitle(t('config.endTime'), 'EndTime')
      tableCfg.columns[4].title = t('config.operator')
      tableCfg.columns[5].title = t('config.exportFiles')
    })

    onMounted(() => {
      getTableData()

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
              <div class={classNames("flex flex-col min-w-0", { 'w-1/2': store.isLandscape, 'w-full h-1/2': !store.isLandscape })}>
                <div class={'p-3 flex justify-end items-center'}>
                  <NSpace>
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
                  <MyNTable class={'product-history-table'} {...tableCfg} data={ftdata.value} />
                </div>
              </div>

              <div class={classNames('flex flex-col min-w-0 border-0 border-solid border-gray-200', { 'w-1/2 border-l': store.isLandscape, 'w-full h-1/2 border-t': !store.isLandscape })}>
                <div class={'p-3 flex items-center'}>{t('config.statisticalData')}</div>
                <div class={'flex-1 min-h-0'}>
                  <Statistic />
                </div>
              </div>


            </div>
          </div>



          <AbsBottomBtn cancelFn={cancel} showApply={false} />
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
