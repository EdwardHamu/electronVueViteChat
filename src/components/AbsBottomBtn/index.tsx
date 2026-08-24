import { NButton, NPopconfirm } from "naive-ui";
import { defineComponent } from "vue";
import btnActiveImg from '@/assets/LineDspButton_inactive.png'

import LargeBtnIcon from "../LargeBtnIcon";
import { CloseOutlined } from "@vicons/material";
import { useMyI18n } from "@/hooks/useMyI18n";

export default defineComponent({
  name: 'AbsBottomBtn',
  props: {
    cancelFn: {
      type: Function,
      default: () => { }
    },
    confirmFn: {
      type: Function,
      default: () => { }
    },
    type: {
      type: String,
      default: ''
    },
    otherFnGroup: {
      type: Object,
      default: {} as any
    },
    showApply: {
      type: Boolean,
      default: true
    }
  },
  setup(props, ctx) {
    const { t, i18nStore } = useMyI18n()
    const renderBtn = () => {
      switch (props.type) {
        case 'formula':
          return [
            <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.otherFnGroup?.saveFn() }} size={'large'}  >
              <span class={'text-2xl ml-2 '}>{t('menu.storage')}</span>
            </NButton>,
            <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.otherFnGroup?.addFn() }} size={'large'}  >
              <span class={'text-2xl ml-2 '}>{t('config.add2')}</span>
            </NButton>,
            <NPopconfirm placement="top"
              v-slots={{
                default: () => {
                  return <div>{t('config.confirmDelete')}</div>
                },
                trigger: () => {
                  return <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} size={'large'}  >
                    <span class={'text-2xl ml-2 '}>{t('config.delete')}</span>
                  </NButton>
                }
              }}
              onPositiveClick={() => { props.otherFnGroup?.delFn() }} >
            </NPopconfirm>,

            <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.cancelFn() }} size={'large'}  >
              <span class={'text-2xl ml-2 '}>{t('config.cancel')}</span>
            </NButton>
          ]
        // case 'config':
        //   return [

        //     <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.cancelFn() }} size={'large'}  >
        //       <span class={'text-2xl ml-2 '}>取消</span>
        //     </NButton>,
        //     <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.confirmFn() }} size={'large'}  >
        //       <span class={'text-2xl ml-2 '}>采用</span>
        //     </NButton>]
        default:
          return [
            <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.cancelFn() }} size={'large'}  >
              <span class={'text-2xl ml-2 '}>{t('config.cancel')}</span>
            </NButton>,
            props.showApply &&
            <NButton class={'mr-3 h-16 w-[300px] shrink'} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }} strong={true} onClick={() => { props.confirmFn() }} size={'large'}  >
              <span class={'text-2xl ml-2 '}>{t('config.apply')}</span>
            </NButton>
          ]
      }

    }

    return () => {
      return (
        <div class={'w-full h-20 flex justify-end items-center mt-auto shrink-0 border-0 border-t border-solid border-gray-200 '}>
          {/* <NButton secondary strong={true} onClick={() => {props.cancelFn()}} type="primary" size={'large'} class={'h-16 w-[20vw] shrink mr-2 '} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }}
              v-slots={{
                // icon: () => {
                //   return <NIcon class={'text-3xl'}>
                //     {ctx.slots.icon && ctx.slots.icon()}
                //   </NIcon>
                // }
              }} >
              <span class={'text-2xl ml-2'}>返回</span>
            </NButton> */}
          {/* renderIcon={() => <LargeBtnIcon><CloseOutlined /></LargeBtnIcon>}  */}


          {renderBtn()}
          {/* <NButton secondary strong={true} onClick={confirm} type="primary" size={'large'} class={'h-16 w-[20vw]  shrink mr-2 '} style={{ backgroundImage: `url(${btnActiveImg})`, backgroundSize: '100% 100%', color: '#534d62' }}
              v-slots={{
                // icon: () => {
                //   return <NIcon class={'text-3xl'}>
                //     {ctx.slots.icon && ctx.slots.icon()}
                //   </NIcon>
                // }
              }} >
              <span class={'text-2xl ml-2'}>应用</span>
            </NButton> */}
        </div>
      )
    }
  }

})
