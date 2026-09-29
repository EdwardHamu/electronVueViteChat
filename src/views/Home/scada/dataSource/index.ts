/**
 * 内置数据源注册入口。新增数据源：实现 DataSourceProvider → 在这里 registerDataSource()。
 */
import { registerDataSource } from './registry'
import { productDataSource, PRODUCT_SOURCE_ID } from './productSource'
import { simDataSource, SIM_SOURCE_ID } from './simSource'
import { localDataSource, LOCAL_SOURCE_ID } from './localSource'

registerDataSource(productDataSource)
registerDataSource(simDataSource)
registerDataSource(localDataSource)

export { PRODUCT_SOURCE_ID, SIM_SOURCE_ID, LOCAL_SOURCE_ID }
export * from './registry'
