import MyNTable from "@/components/MyNTable";
import { useConfigStore } from "@/store/config";
import { callSpc } from "@/utils/call";
import { callFnName } from "@/utils/enum";
import { useMessage } from "naive-ui";
import { defineComponent, reactive, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import { ProductStatisticEntity } from "~/me";
import { useProductHistoryInnerDataStore } from "./innerData";
import { callBrige } from "@/utils/callm";

export default defineComponent({
  name: 'Statistic',  //线轴统计数据
  setup(props, ctx) {
    const configStore = useConfigStore()
    const { t, i18nStore } = useMyI18n()
    const innerData = useProductHistoryInnerDataStore()
    const msg = useMessage()
    const cancel = () => {
      configStore.setProductLogShow(false)
    }
    const formatFiveDecimals = (value: number) => {
      return Number.isFinite(value) ? value.toFixed(5) : ''
    }
    const tableCfg = reactive({
      columns: [
        // { key: 'ProductNo', title: '产品编号' },
        { key: 'DataName', title: t('config.name'), ellipsis: { tooltip: true, lineClamp: 1 } },
        { key: 'Unit', title: t('config.unit'), width: '6%', ellipsis: { tooltip: true, lineClamp: 1 } },
        { key: 'Standard', title: t('data.standard2'), ellipsis: { tooltip: true, lineClamp: 1 } },
        { key: 'USL', title: t('data.limitHeight'), ellipsis: { tooltip: true, lineClamp: 1 } },
        { key: 'LSL', title: t('data.limitLow'), ellipsis: { tooltip: true, lineClamp: 1 } },
        { key: 'Average', title: t('data.average'), ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.Average) },
        { key: 'Max', title: t('data.max'), ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.Max) },
        { key: 'Min', title: t('data.min'), ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.Min) },
        { key: 'StdDeviation', title: t('data.standardDeviation'), ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.StdDeviation) },
        { key: 'Ca', title: 'CA', ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.Ca) },
        { key: 'Cp', title: 'CP', ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.Cp) },
        { key: 'Cpk', title: 'CPK', ellipsis: { tooltip: true, lineClamp: 1 }, render: (row: ProductStatisticEntity) => formatFiveDecimals(row.Cpk) },

      ],
      tdata: [] as ProductStatisticEntity[],
      rowProps: (row: ProductStatisticEntity) => {
        return {
          onClick: () => rowClick(row)
        }
      },
      rowKey: (row: ProductStatisticEntity) => row.GId,
      virtualScroll: true,
      tableLayout: 'fixed' as const,
      isSimpleStyle: true

    })
    var sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const commonData = reactive({
      filterText: '',
      selectProps: tableCfg.columns[0].key,
      selectOpt: [tableCfg.columns[0]].map(e => {
        return { label: e.title, value: e.key }
      }),
      range: [sevenDaysAgo.getTime(), Date.now()] as [number, number]
    })
    const rowClick = (row: ProductStatisticEntity) => {
      // innerData.setCurRowKey([row.GId!])
      // innerData.setCurRow(row)
    }
    // const ftdata = computed(() => {
    //   // let res = true
    //   let isTrue = false
    //   if (!commonData.filterText) isTrue = true
    //   if (!commonData.selectProps) isTrue = true
    //   let list = tableCfg.tdata.filter(item => {
    //     if (isTrue) return true
    //     let val = item[commonData.selectProps as keyof ProductStatisticEntity]
    //     if (!val) return false
    //     return val.toString().includes(commonData.filterText)
    //   })
    //   return list
    // })
    // The embedded panels stay mounted; clear old rows and ignore stale replies.
    watch(() => innerData.curRow, (row, _previous, onCleanup) => {
      let active = true
      onCleanup(() => { active = false })
      tableCfg.tdata = []
      if (!row?.GId) return
      callBrige(callFnName.GetProductStatistics, row.GId).then((res: ProductStatisticEntity[]) => {
        if (active) tableCfg.tdata = res
      }).catch(() => {
        if (active) tableCfg.tdata = []
      })
    }, { immediate: true })

    // 语言切换时更新 tableCfg 中的标题
    watch(() => i18nStore.langChangeCount, () => {
      tableCfg.columns[0].title = t('config.name')
      tableCfg.columns[1].title = t('config.unit')
      tableCfg.columns[2].title = t('data.standard2')
      tableCfg.columns[3].title = t('data.limitHeight')
      tableCfg.columns[4].title = t('data.limitLow')
      tableCfg.columns[5].title = t('data.average')
      tableCfg.columns[6].title = t('data.max')
      tableCfg.columns[7].title = t('data.min')
      tableCfg.columns[8].title = t('data.standardDeviation')
    })

    // getTableData()


    return () => {
      return (
        <div class={' w-full h-full'}>
          {/* @ts-ignore */}
          <MyNTable class={'statistic-table'} {...tableCfg} data={tableCfg.tdata} />
        </div>
        // <div class={' w-screen h-screen absolute  flex flex-col z-10 bg-white overflow-hidden'}>
        //   <div class={"flex-shrink flex flex-col"}>
        //     <div class={'p-3'}>
        //       <NSpace>
        //         <NSelect class={'w-32'} v-model:value={commonData.selectProps} options={commonData.selectOpt}></NSelect>
        //         <NInput v-model:value={commonData.filterText} placeholder={`请输入编号查询`} clearable ></NInput>
        //         <NButton onClick={() => { getTableData() }}>查询</NButton>
        //         {/* <NDatePicker v-model:value={commonData.range} type="daterange" clearable /> */}
        //       </NSpace>
        //     </div>
        //     <div class={'flex-shrink'}>
        //       {/* @ts-ignore */}
        //       <MyNTable {...tableCfg} data={tableCfg.tdata} />
        //     </div>
        //   </div>

        //   <AbsBottomBtn cancelFn={cancel} />
        // </div>
      )
    }
  }

})
