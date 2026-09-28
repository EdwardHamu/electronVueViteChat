/**
 * 数据源注册表。组件通过 DataBinding.source 找到 provider，再用 key 读值。
 */
import { computed, onBeforeUnmount, shallowReactive, watch } from 'vue'
import type { DataBinding, DataPoint, DataSourceProvider } from '../types'

const providers = shallowReactive<DataSourceProvider[]>([])

export const registerDataSource = (provider: DataSourceProvider) => {
  const idx = providers.findIndex(p => p.id === provider.id)
  if (idx > -1) {
    providers.splice(idx, 1, provider)
  } else {
    providers.push(provider)
  }
  return provider
}

export const unregisterDataSource = (id: string) => {
  const idx = providers.findIndex(p => p.id === id)
  if (idx > -1) providers.splice(idx, 1)
}

export const getDataSource = (id?: string | null) => (id ? providers.find(p => p.id === id) : undefined)

export const dataSourceList = () => providers as readonly DataSourceProvider[]

/** 组态页挂载 / 卸载时统一启停所有数据源 */
export const startAllDataSources = () => providers.forEach(p => p.start && p.start())
export const stopAllDataSources = () => providers.forEach(p => p.stop && p.stop())
export const refreshAllDataSources = () => Promise.all(providers.map(p => Promise.resolve(p.refresh && p.refresh()).catch(() => undefined)))

/**
 * 在组件内使用：根据绑定读取数据点，并在绑定变化 / 卸载时维护订阅。
 * 传 getter 而不是值，这样绑定切换时会自动重新订阅。
 */
export const useDataPoint = (binding: () => DataBinding | null | undefined) => {
  let unsubscribe: (() => void) | null = null

  const point = computed<DataPoint | undefined>(() => {
    const b = binding()
    if (!b) return undefined
    const provider = getDataSource(b.source)
    if (!provider) {
      return { value: null, status: 'offline', name: b.label }
    }
    return provider.read(b.key)
  })

  watch(
    () => {
      const b = binding()
      return b ? `${b.source}|${b.key}` : ''
    },
    () => {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
      const b = binding()
      if (!b) return
      const provider = getDataSource(b.source)
      if (provider && provider.subscribe) {
        unsubscribe = provider.subscribe(b.key)
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  })

  return point
}
