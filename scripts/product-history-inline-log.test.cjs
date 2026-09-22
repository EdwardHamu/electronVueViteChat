const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { reactive, watch, effectScope, nextTick } = require('vue');
const root = path.resolve(__dirname, '../src/views/Home/product/productHistory');
const read = name => fs.readFileSync(path.join(root, name + '.tsx'), 'utf8');

test('modified TSX files parse without syntax errors', () => {
  for (const name of ['index', 'ProductLog', 'Statistic']) {
    const result = ts.transpileModule(read(name), {
      fileName: name + '.tsx', reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2020 },
    });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, name);
  }
});

test('inline panels retain equal landscape rows and stacked portrait layout', () => {
  const source = read('index');
  assert.doesNotMatch(source, /NDrawer|showLog|jumpLog/);
  assert.equal((source.match(/<ProductLog\s*\/>/g) || []).length, 1);
  assert.ok(source.indexOf('<Statistic />') < source.indexOf('<ProductLog />'));
  assert.match(source, /useMediaQuery\('\(orientation: landscape\)'\)/);
  assert.match(source, /gridTemplateRows:.*'repeat\(2, minmax\(0, 1fr\)\)'.*'minmax\(0, 4fr\) repeat\(2, minmax\(0, 3fr\)\)'/);
  assert.match(source, /gridRow: isLandscape.value \? 'span 2' : 'auto'/);
  assert.match(source, /flex-1 min-h-0 min-w-0 overflow-auto/);
  assert.match(source, /<AbsBottomBtn cancelFn=\{cancel\} showApply=\{false\}/);
});

for (const [name, method] of [['ProductLog', 'GetProductLogs'], ['Statistic', 'GetProductStatistics']]) {
  test(`${name}: immediate load, selection changes, stale replies, failure and disposal`, async () => {
    const source = read(name);
    const start = source.indexOf('    watch(() => innerData.curRow');
    const end = source.indexOf('    // 语言切换', start);
    assert.ok(start >= 0 && end > start);
    const code = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const innerData = reactive({ curRow: { GId: 'A' } });
    const tableCfg = reactive({ tdata: [] });
    const requests = [];
    const scope = effectScope();
    const flush = async () => { await Promise.resolve(); await nextTick(); await Promise.resolve(); };
    try {
      scope.run(() => vm.runInNewContext(code, {
        watch, innerData, tableCfg, callFnName: { [method]: method },
        callBrige: (fn, id) => new Promise((resolve, reject) => requests.push({ fn, id, resolve, reject })),
      }));
      assert.equal(requests.length, 1);
      assert.equal(requests[0].id, 'A');
      assert.equal(requests[0].fn, method);
      innerData.curRow = { GId: 'B' };
      await nextTick();
      requests[1].resolve([{ GId: 'B-result' }]);
      await flush();
      requests[0].resolve([{ GId: 'A-stale' }]);
      await flush();
      assert.equal(tableCfg.tdata[0].GId, 'B-result');
      innerData.curRow = { GId: 'C' };
      await nextTick();
      assert.equal(tableCfg.tdata.length, 0);
      requests[2].reject(new Error('backend unavailable'));
      await flush();
      assert.equal(tableCfg.tdata.length, 0);
      innerData.curRow = { GId: 'D' };
      await nextTick();
      innerData.curRow = null;
      await nextTick();
      requests[3].resolve([{ GId: 'D-stale' }]);
      await flush();
      assert.equal(tableCfg.tdata.length, 0);
      assert.equal(requests.length, 4);
      innerData.curRow = { GId: 'E' };
      await nextTick();
      scope.stop();
      requests[4].resolve([{ GId: 'E-disposed' }]);
      await flush();
      assert.equal(tableCfg.tdata.length, 0);
    } finally {
      scope.stop();
    }
  });
}


test('compact tables fit the container without forced horizontal widths', () => {
  const source = read('index');
  assert.match(source, /gridTemplateColumns:.*'minmax\(0, 9fr\) minmax\(0, 11fr\)'/);
  for (const name of ['index', 'ProductLog', 'Statistic']) {
    const content = read(name);
    assert.doesNotMatch(content, /scrollX|resizable: true/);
    assert.match(content, /tableLayout: 'fixed'/);
  }
  for (const name of ['index', 'ProductLog']) {
    const columns = read(name).split('columns: [')[1].split('],')[0];
    const widths = [...columns.matchAll(/width: '(\d+)%'/g)].map(match => Number(match[1]));
    assert.equal(widths.reduce((total, width) => total + width, 0), 100);
  }
  assert.match(read('ProductLog'), /class=\{'product-log-table'\}/);
  const css = fs.readFileSync(path.resolve(root, '../../../../style.scss'), 'utf8');
  assert.match(css, /\.product-history-table,\s*\.product-log-table\s*\{[\s\S]*?font-size: 12px/);
});


function loadTimeRangeStorage(storage) {
  const file = path.join(root, 'timeRangeStorage.ts');
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, localStorage: storage });
  return exports;
}

test('time range defaults safely and restores each valid saved timestamp', () => {
  let saved = null;
  const api = loadTimeRangeStorage({ getItem: () => saved });
  const now = new Date(2026, 8, 22, 12).getTime();
  const start = new Date(now);
  start.setDate(start.getDate() - 3);
  for (const value of [null, '{broken', 'null', '{}', '{"StartTime":"123","EndTime":1e99}']) {
    saved = value;
    const range = api.loadProductHistoryTimeRange(now);
    assert.equal(range.StartTime, start.getTime());
    assert.equal(range.EndTime, now);
  }
  saved = JSON.stringify({ StartTime: 0, EndTime: now - 1000 });
  assert.equal(api.loadProductHistoryTimeRange(now).StartTime, 0);
  assert.equal(api.loadProductHistoryTimeRange(now).EndTime, now - 1000);
  saved = JSON.stringify({ StartTime: now - 2000 });
  assert.equal(api.loadProductHistoryTimeRange(now).StartTime, now - 2000);
  assert.equal(api.loadProductHistoryTimeRange(now).EndTime, now);
});

test('time range survives a fresh module load and storage failures are harmless', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const api = loadTimeRangeStorage(storage);
  api.saveProductHistoryTimeRange({ StartTime: 1000, EndTime: 2000, PN: 'not-persisted' });
  const restored = loadTimeRangeStorage(storage).loadProductHistoryTimeRange(9000);
  assert.equal(restored.StartTime, 1000);
  assert.equal(restored.EndTime, 2000);
  assert.deepEqual(JSON.parse(values.get(api.PRODUCT_HISTORY_TIME_RANGE_KEY)), { StartTime: 1000, EndTime: 2000 });
  api.saveProductHistoryTimeRange({ StartTime: NaN, EndTime: 3000 });
  assert.equal(api.loadProductHistoryTimeRange().EndTime, 2000);
  const unavailable = loadTimeRangeStorage({ getItem() { throw Error('disabled'); }, setItem() { throw Error('full'); } });
  assert.equal(unavailable.loadProductHistoryTimeRange(9000).EndTime, 9000);
  assert.doesNotThrow(() => unavailable.saveProductHistoryTimeRange({ StartTime: 1000, EndTime: 2000 }));
});

test('page restores time filters before querying and saves either change synchronously', () => {
  const source = read('index');
  const start = source.indexOf('    const filterData = reactive({');
  const end = source.indexOf('    const rowClick', start);
  const code = ts.transpileModule(source.slice(start, end) + '\n globalThis.filters = filterData;', {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const writes = [];
  const scope = effectScope();
  const context = {
    reactive, watch,
    loadProductHistoryTimeRange: () => ({ StartTime: 1000, EndTime: 2000 }),
    saveProductHistoryTimeRange: value => writes.push({ StartTime: value.StartTime, EndTime: value.EndTime }),
  };
  try {
    scope.run(() => vm.runInNewContext(code, context));
    assert.equal(context.filters.StartTime, 1000);
    assert.equal(context.filters.EndTime, 2000);
    assert.equal(writes.length, 0);
    context.filters.StartTime = 1200;
    assert.deepEqual(writes[0], { StartTime: 1200, EndTime: 2000 });
    context.filters.EndTime = 2200;
    assert.deepEqual(writes[1], { StartTime: 1200, EndTime: 2200 });
    context.filters.PN = 'other';
    assert.equal(writes.length, 2);
  } finally { scope.stop(); }
});


for (const key of ['StartTime', 'EndTime']) {
  test(`${key} header rerenders the latest controlled value after selection`, () => {
    const source = read('index');
    const start = source.indexOf('    const renderTimeColumnTitle =');
    const end = source.indexOf('    tableCfg = reactive({', start);
    const code = ts.transpileModule(source.slice(start, end) + '\n globalThis.renderTitle = renderTimeColumnTitle;', {
      fileName: 'header.tsx',
      compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
    }).outputText;
    const filterData = reactive({ StartTime: 1000, EndTime: 2000 });
    const queries = [];
    const context = {
      filterData, NDatePicker: 'date-picker', handleFilterKeyup() {},
      getTableData: () => queries.push(filterData[key]),
      h: (type, props, ...children) => ({ type, props, children }),
    };
    vm.runInNewContext(code, context);
    const title = context.renderTitle('Time', key);
    assert.equal(typeof title, 'function', 'column title must be a render function, not a cached VNode');
    const { effect, stop } = require('vue');
    let picker;
    const runner = effect(() => { picker = title().children.find(child => child.type === 'date-picker'); });
    try {
      assert.equal(picker.props.value, filterData[key]);
      picker.props.onUpdateValue(3000);
      assert.equal(picker.props.value, 3000);
      assert.deepEqual(queries, [3000]);
      picker.props.onUpdateValue(4000);
      assert.equal(picker.props.value, 4000);
      assert.deepEqual(queries, [3000, 4000]);
      picker.props.onUpdateValue(null);
      assert.equal(picker.props.value, 4000);
      assert.equal(queries.length, 2);
      // A regenerated title (e.g. after changing language) also uses current state.
      assert.equal(context.renderTitle('Translated', key)().children[1].props.value, 4000);
    } finally { stop(runner); }
  });
}
