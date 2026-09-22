import AbsBottomBtn from "@/components/AbsBottomBtn";
import MyNTable from "@/components/MyNTable";
import { useMediaQuery } from "@vueuse/core";
import { useConfigStore } from "@/store/config";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import { formatDate } from "@/utils/utils";
import classNames from "classnames";
import { NButton, NDatePicker, NInput, useMessage } from "naive-ui";
import { computed, defineComponent, onMounted, reactive, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { ProductHistoryEntity } from "~/me";
import { useProductHistoryInnerDataStore } from "./innerData";
import ProductLog from "./ProductLog";
import Statistic from "./Statistic";
import { loadProductHistoryTimeRange, saveProductHistoryTimeRange } from "./timeRangeStorage";

export default defineComponent({
  name: 'ProductHistory',
  setup(props, ctx) {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const isLandscape = useMediaQuery('(orientation: landscape)')
    const innerData = useProductHistoryInnerDataStore()
    const msg = useMessage()
    const cancel = () => {
      configStore.setProductHistoryShow(false)
    }
    const copyPath = (path?: string) => {
      if (!path) return
      navigator.clipboard.writeText(path)
      msg.success(t('config.copySuccess'))
    }
    const renderCopyCell = (path?: string) => {
      return (
        <span class={'block min-w-0 truncate cursor-pointer'} title={path} onClick={() => copyPath(path)}>{path}</span>
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
        <div class={'flex items-center gap-1 min-w-0'}>
          <NButton size="tiny" type="primary" disabled={!row.ExcelPath} onClick={(event) => {
            event.stopPropagation()
            openExportFile(row.ExcelPath)
          }}>Excel</NButton>
          <NButton size="tiny" type="error" disabled={!row.PdfPath} onClick={(event) => {
            event.stopPropagation()
            openExportFile(row.PdfPath)
          }}>PDF</NButton>
          <span class={'w-full min-w-0 truncate'} title={directory}>({directory})</span>
        </div>
      )
    }
    const filterData = reactive({
      ProductNo: '',
      PN: '',
      ...loadProductHistoryTimeRange(),
    })
    watch(() => [filterData.StartTime, filterData.EndTime], () => {
      saveProductHistoryTimeRange(filterData)
    }, { flush: 'sync' })
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
    const renderTextColumnTitle = (label: string, key: 'ProductNo' | 'PN') => () => {
      return (
        <div class={'flex flex-col gap-1'}>
          <span>{label}</span>
          <NInput v-model:value={filterData[key]} size="small" clearable onKeyup={handleFilterKeyup} />
        </div>
      )
    }
    // Render in the table header's reactive effect rather than caching initial VNodes.
    const renderTimeColumnTitle = (label: string, key: 'StartTime' | 'EndTime') => () => {
      return (
        <div class={'flex flex-col gap-1'} onKeyup={handleFilterKeyup}>
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
          />
        </div>
      )
    }
    tableCfg = reactive({
      columns: [
        { key: 'ProductNo', width: '15%', title: renderTextColumnTitle(t('config.spoolNumber'), 'ProductNo'), align: 'center', render: (row: ProductHistoryEntity) => renderCopyCell(row.ProductNo) },
        { key: 'PN', width: '13%', title: renderTextColumnTitle(t('config.wireModel'), 'PN'), render: (row: ProductHistoryEntity) => renderCopyCell(row.PN) },
        { key: 'StartTime', width: '20%', ellipsis: { tooltip: true }, title: renderTimeColumnTitle(t('config.startTime'), 'StartTime'), },
        { key: 'EndTime', width: '20%', ellipsis: { tooltip: true }, title: renderTimeColumnTitle(t('config.endTime'), 'EndTime'), },
        { key: 'Operator', title: t('config.operator'), width: '10%', ellipsis: { tooltip: true } },
        { key: 'ExportFiles', width: '22%', title: t('config.exportFiles'), ellipsis: { tooltip: true }, render: (row: ProductHistoryEntity) => renderExportFileCell(row) },
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
      tableLayout: 'fixed' as const,
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
        <div class={'product-history-page w-screen h-screen absolute flex flex-col z-10 bg-[#f5f6f6] overflow-hidden'}>
          <div class={'flex-1 min-h-0 min-w-0 overflow-auto'}>
            <div class={'product-history-layout grid h-full w-full'} style={{
              gridTemplateColumns: isLandscape.value ? 'minmax(0, 9fr) minmax(0, 11fr)' : 'minmax(0, 1fr)',
              gridTemplateRows: isLandscape.value ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 4fr) repeat(2, minmax(0, 3fr))',
              minHeight: isLandscape.value ? '420px' : '720px',
            }}>
              <section class={'product-history-list flex flex-col min-h-0 min-w-0 overflow-hidden'} style={{ gridRow: isLandscape.value ? 'span 2' : 'auto' }}>
                <div class={'px-3 py-2 text-sm shrink-0'}>{t('config.productHistory')}</div>
                <div class={'flex-1 min-h-0 min-w-0 overflow-hidden'}>
                  {/* @ts-ignore */}
                  <MyNTable class={'product-history-table'} {...tableCfg} data={ftdata.value} />
                </div>
              </section>
              <section class={classNames('product-history-statistic flex flex-col min-h-0 min-w-0 overflow-hidden border-0 border-solid border-gray-200', { 'border-l': isLandscape.value, 'border-t': !isLandscape.value })}>
                <div class={'px-3 py-2 text-sm shrink-0 flex flex-wrap items-center gap-2'}>
                  <span>{t('config.statisticalData')}</span>
                  <span class={'text-sm text-gray-500 break-all'}>{innerData.curRow?.ProductNo || (!innerData.curRow ? t('config.pleaseSelectOneRow') : '')}</span>
                </div>
                <div class={'flex-1 min-h-0 min-w-0 overflow-hidden'}>
                  <Statistic />
                </div>
              </section>
              <section class={classNames('product-history-log flex flex-col min-h-0 min-w-0 overflow-hidden border-0 border-t border-solid border-gray-200', { 'border-l': isLandscape.value })}>
                <div class={'px-3 py-2 text-sm shrink-0 flex flex-wrap items-center gap-2'}>
                  <span>{t('config.productLog')}</span>
                  <span class={'text-sm text-gray-500 break-all'}>{innerData.curRow?.ProductNo || (!innerData.curRow ? t('config.pleaseSelectOneRow') : '')}</span>
                </div>
                <div class={'flex-1 min-h-0 min-w-0 overflow-hidden'}>
                  <ProductLog />
                </div>
              </section>
            </div>
          </div>
          <AbsBottomBtn cancelFn={cancel} showApply={false} />
        </div>
      )
    }
  }

})
