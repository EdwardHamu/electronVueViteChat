/**
 * 图片：显示网络地址 / 本地选择的图片。本地文件在属性面板里经宿主 SaveResourceFile 存到 Resources/pic，
 * 布局里只记 https://pic.nt.local/… 的地址（见 resource.ts）；没有宿主桥时退回 data URL 内嵌。
 */
import { computed, defineComponent } from 'vue'
import type { WidgetDefinition } from '../types'
import { icons } from './icons'
import { tt, widgetProps } from './common'

const ImageWidget = defineComponent({
  name: 'ScadaImage',
  props: widgetProps,
  setup(props) {
    const p = computed(() => props.widget.props)
    return () => {
      const src = (p.value.src as string) || ''
      const style = {
        background: p.value.bg || 'transparent',
        borderRadius: (Number(p.value.radius) || 0) + 'px',
        opacity: p.value.opacity === undefined || p.value.opacity === null ? 1 : Math.max(0, Math.min(100, Number(p.value.opacity))) / 100
      }
      if (!src) {
        return (
          <div class={'w-full h-full flex flex-col items-center justify-center text-gray-400 overflow-hidden'} style={{ ...style, border: props.editing ? '1px dashed #9ca3af' : 'none' }}>
            <div class={'w-8 h-8'}>{icons.image()}</div>
            {props.editing && <div class={'text-[11px] mt-1'}>{tt('scada.widget.imagePlaceholder')}</div>}
          </div>
        )
      }
      return (
        <div class={'w-full h-full overflow-hidden'} style={style}>
          <img
            src={src}
            alt=""
            draggable={false}
            class={'block w-full h-full select-none'}
            style={{ objectFit: (p.value.fit as any) || 'contain', pointerEvents: 'none' }}
          />
        </div>
      )
    }
  }
})

export const imageDefinition: WidgetDefinition = {
  type: 'image',
  label: () => tt('scada.widget.image'),
  description: () => tt('scada.widget.imageDesc'),
  icon: icons.image,
  category: 'shape',
  defaultSize: { w: 200, h: 150 },
  minSize: { w: 16, h: 16 },
  needsBinding: false,
  defaultProps: () => ({ src: '', fit: 'contain', radius: 0, opacity: 100, bg: '' }),
  propSchema: [
    { key: 'src', label: () => tt('scada.prop.imageSrc'), type: 'image', placeholder: 'https://… / data:image/…' },
    {
      key: 'fit', label: () => tt('scada.prop.fit'), type: 'select',
      options: () => [
        { label: tt('scada.prop.fitContain'), value: 'contain' },
        { label: tt('scada.prop.fitCover'), value: 'cover' },
        { label: tt('scada.prop.fitFill'), value: 'fill' }
      ]
    },
    { key: 'radius', label: () => tt('scada.prop.radius'), type: 'number', min: 0, max: 200, step: 1 },
    { key: 'opacity', label: () => tt('scada.prop.opacity'), type: 'number', min: 0, max: 100, step: 5 },
    { key: 'bg', label: () => tt('scada.prop.bg'), type: 'color' }
  ],
  component: ImageWidget
}

export default ImageWidget
