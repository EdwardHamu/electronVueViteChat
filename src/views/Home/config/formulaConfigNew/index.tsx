import AbsBottomBtn from "@/components/AbsBottomBtn";
import { formListItem, MyFormWrap, MyFormWrapIns } from "@/components/MyFormWrap/MyFormWrap";
import { useMain } from "@/store";
import { useConfigStore } from "@/store/config";
import { useFormulaStore } from "@/store/formula";
import { NButton, NTabPane, NTabs, useDialog } from "naive-ui";
import { defineComponent, reactive, ref, watch } from "vue";
import { useMyI18n } from "@/hooks/useMyI18n";
import FormulaList from "./FormulaList";
import FormulaParam from "./FormulaParam";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'
import { FormulaConfigEntity, FormulaParamEntity } from "~/me";
import { callBrige } from "@/utils/callm";
import { callFnName } from "@/utils/enum";
import DeviceGroupList from "./DeviceGroupList";
import classNames from "classnames";

export default defineComponent({
  name: 'formulaConfig',
  setup(props, ctx) {
    const AbsBottomBtnFormula = AbsBottomBtn
    const configStore = useConfigStore()
    const dialog = useDialog()
    const store = useMain()
    const formulaStore = useFormulaStore()
    const { t, i18nStore } = useMyI18n()
    const myFormRef = ref<MyFormWrapIns>()
    const minWidth = store.isLandscape ? '12vw' : '120px'
    const maxWidth = store.isLandscape ? '25vw' : '400px'
    const alldata = reactive({
      curTabValue: 'formula',
      curDialogIns: null as any,
      defaultTab: 'formula',
      commonStyle: {
        maxWidth: maxWidth, fontSize: '20px', minWidth: minWidth, borderTop: '1px solid #58595a', borderRight: '1px solid #58595a', borderLeft: '1px solid #58595a', borderBottom: '1px solid #58595a',
        flexGrow: 1, background: '#fff', borderRadius: '12px 12px 0 0'
      },
      activeStyle: {
        background: `#f5f6f6`,
        backgroundSize: 'cover',
        borderBottom: "0",
        color: '#000',
        zIndex: 6
      },
      addFormCfg: {
        itemList: [
          { type: 'input', label: t('config.name'), prop: 'PN', width: 24, rule: 'must' },
          // { type: 'input', label: '备注', prop: 'Note', width: 24, },
        ] as formListItem[],
        hideBtn: true,
        form: {},
        optionMap: {}

      }
    })

    // 语言切换时更新 reactive 对象中的标签
    watch(() => i18nStore.langChangeCount, () => {
      alldata.addFormCfg.itemList[0].label = t('config.name')
    })

    const handleTabChange = (value: string) => {
      alldata.curTabValue = value
    }

    const cancel = () => {
      formulaStore.setFormulaShow(false)
    }
    const confirm = () => {
      formulaStore.setFormulaShow(false)
    }
    const hideForm = () => {
      if (alldata.curDialogIns) {
        alldata.curDialogIns.destroy()
      }
    }
    const addConfig = () => {
      let item = alldata.addFormCfg.form as FormulaConfigEntity
      item.GroupId = configStore.sysConfig.CurrentGroupId as string
      callBrige(callFnName.SaveFormulaConfig, item).then((res: number) => {
        // console.log("🪵 [index.tsx:70] ~ token ~ \x1b[0;32mres\x1b[0m = ", res);
        window.$message.success(t('config.saveSuccess'))
        formulaStore.updateConfigListFn()
        hideForm()
      })
    }
    const add = () => {
      alldata.curDialogIns = dialog.create({
        title: t('config.addRecipe'),
        content: () => {
          return <div class={'min-h-[120px] limit-item-width-form'}>
            <MyFormWrap labelWidth={220} ref={myFormRef} {...alldata.addFormCfg} ></MyFormWrap>

          </div>
        },
        maskClosable: false,
        style: { width: '800px', minHeight: '200px', },
        action: () => {
          return <div class={'flex justify-around items-center w-full'}>
            <NButton style={{ width: '45%', height: '40px', fontSize: '24px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { hideForm() }}>{t('config.cancel')}</NButton>
            <NButton style={{ width: '45%', height: '40px', fontSize: '24px', backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => {
              // console.log("🪵 [ConForm.tsx:65] ~ token ~ \x1b[0;myFormRef.value\x1b[0m = ", myFormRef.value!);
              myFormRef.value?.submit(addConfig)
            }}>{t('config.confirm')}</NButton>
          </div>
        },
        positiveText: t('config.confirm'),
        negativeText: t('config.cancel'),
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
          // props.updateShowFn && props.updateShowFn(false)
          return false
        }
        // onAfterLeave: () => {
        //   changeShow()
        // }
      })
    }
    const del = () => {
      if (!formulaStore.curFormulaConfigRow) {
        window.$message.warning(t('config.pleaseSelectTheRecipeToBeDeleted'))
        return
      }
      callBrige(callFnName.DeleteFormulaConfig, formulaStore.curFormulaConfigRow.GId).then((res: number) => {
        window.$message.success(t('config.deleteSuccess'))
        formulaStore.updateConfigListFn()
      })
    }
    const save = () => {
      let formMap = formulaStore.getParamFormMapFn() as unknown as Record<string, FormulaParamEntity>
      // console.log("🪵 [index.tsx:130] ~ token ~ \x1b[0;32mformMap\x1b[0m = ", formMap);
      callBrige(callFnName.SaveFormulaParams, Object.values(formMap)).then((res: number) => {
        window.$message.success(t('config.saveSuccess'))
        formulaStore.updateConfigListFn()
      })
      let configList = formulaStore.getFormulaListFn()
      let applyItem = configList.find(e => e.GId == configStore.sysConfig.CurrentFormulaId)
      if (applyItem) {
        formulaStore.applayFormulaConfigFn(applyItem)
      }
    }

    {/* border-0 border-t border-gray-600 border-solid */ }

    return () => {
      // bg-[#f5f6f6]
      //  <div class={'h-full p-2  '}>

      //               </div>
      return (
        <div class={' bg-white w-screen h-screen absolute  flex flex-col z-10  overflow-hidden'}>
          {/* 横屏：左右分栏（配方 + 设备组 | 参数）；竖屏：上下分栏，各占一半高度 */}
          <div class={classNames('flex', { 'flex-col': !store.isLandscape })} style={{ height: 'calc(100% - 80px)' }}>
            <div class={classNames('p-2', { 'flex-1 h-full': store.isLandscape, 'h-1/2 min-h-0 pb-1': !store.isLandscape })}>
              <div class={'h-full bg-[#f5f6f6]'}>
                <NTabs value={alldata.curTabValue} type="card" animated size="large" barWidth={1148} paneClass={'shrink-0 h-full'} class={classNames('config-tab h-full w-full my-formula-tab ', { 'portrait-fill-tab': !store.isLandscape })} onUpdateValue={handleTabChange} defaultValue={alldata.defaultTab} >
                  <NTabPane displayDirective="show:lazy" name={"formula"} tab={t('menu.recipe')} tabProps={{ style: { ...alldata.commonStyle, ...alldata.curTabValue == 'formula' ? alldata.activeStyle : {}, } }}>
                    {/* 横屏沿用 100vh 固定高度；竖屏由 portrait-fill-tab 撑满剩余高度，用 h-full 即可 */}
                    <div style={store.isLandscape ? { height: 'calc(100vh - 160px)' } : undefined} class={'w-full h-full p-2 border border-gray-600 border-solid flex flex-nowrap justify-around'}>
                      <div class={'h-full w-[58%] '}>
                        <FormulaList />

                      </div>
                      <div class={'h-full w-[40%] ml-2'}>
                        <DeviceGroupList />
                      </div>

                    </div>
                    {/* 
                    <div class={' h-full  bg-[#f5f6f6] border border-gray-600 border-solid  rounded-xl overflow-hidden'}>
                    </div> */}

                  </NTabPane>
                </NTabs>
              </div>
            </div>

            <div class={classNames({ 'flex-1': store.isLandscape, 'h-1/2 min-h-0': !store.isLandscape })}>
              <div class={classNames('p-2 h-full', { 'flex-1': store.isLandscape, 'pt-1': !store.isLandscape })}>
                <div class={'h-full bg-[#f5f6f6]'}>
                  <FormulaParam />
                </div>
              </div>
            </div>
          </div>

          <AbsBottomBtn class={'flex-shrink-0'} type={'formula'} cancelFn={cancel} confirmFn={confirm} otherFnGroup={{ addFn: add, delFn: del, saveFn: save }} />
        </div>
      )
    }
  }

})
