# 产品历史起止时间持久化

- `src/views/Home/product/productHistory/index.tsx` 初始化时恢复起止时间，修改任一时间后同步保存，避免关闭页面时尚未写入。
- `src/views/Home/product/productHistory/timeRangeStorage.ts` 使用 localStorage 键 `productHistory.timeRange.v1`，仅保存 StartTime、EndTime 的毫秒时间戳，不保存产品编号或型号筛选。
- 无记录时默认本地日期三天前到当前时间；已有记录时恢复原始绝对时间，结束时间不会自动跟随今天变化。
- 无效字段独立回退默认值；JSON 损坏、存储禁用或写入失败不阻止页面查询。
- 持久化限于相同页面来源及 WebView2 用户数据目录；清理应用站点数据或更换来源/用户数据目录后不会保留。
- 保留用户已有导出按钮样式改动，不修改 C# 接口、布局或其他筛选行为。

## 验证

- `node --test scripts/product-history-inline-log.test.cjs`：10 项通过，0 失败，包含默认值、异常数据、跨模块恢复、存储失败、两项时间分别同步保存及时间表头响应式更新测试。
- `git diff --check` 通过（仅 Git 行尾提示）；修改目录编辑器诊断 0 错误、0 警告。
- 未执行 lint/build。未进行真实 WebView2 重启测试：此前调试端口没有本项目页面。本次测试使用模拟 localStorage 和真实 Vue 响应式监听。

## 时间输入框回跳修复

- 原因：列 title 在 setup 中保存了立即生成的 VNode，NDatePicker 的受控 value 固定为初始化时的时间。数据和持久化值虽然已更新，旧 VNode 仍给输入框传入旧值。
- 修复：时间及文本筛选表头生成函数改为返回渲染函数，由表头渲染过程读取最新响应式值。语言切换重新生成表头时也保留此行为。不修改持久化格式、查询参数或布局。
- 新增开始/结束时间分别连续选择两次、忽略 null、重新生成表头读取最新值的回归测试，使用真实 Vue effect 配合轻量 VNode 替身，非真实日期控件端到端测试。
- 本次重新探测真实 WebView2，9223 端口仍无 localhost:3920 页面，未操作其他页面；实际控件交互验证待正确实例启动。
