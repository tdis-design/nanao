// apps_script/Graph.gs 的離線測試：用模擬的 Apps Script 環境執行，不會連到 Google 或 GitHub。
// 測試資料取自 graphdata 的真實列，另外加上各種錯誤情況。
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

// 用法：node apps_script/test/test_graph.mjs  （在 repo 根目錄執行）
const REPO = process.argv[2] || fileURLToPath(new URL('../..', import.meta.url));
const OUT = process.argv[3] || path.join(os.tmpdir(), 'nanao-graph-test-output.json');
const gsCode = fs.readFileSync(`${REPO}/apps_script/Graph.gs`, 'utf8');
const { normalizeGraph } = await import(pathToFileURL(`${REPO}/src/state/normalizeGraph.js`).href);

let passed = 0;
const results = [];
function test(name, fn) {
  try { fn(); passed++; results.push(`PASS  ${name}`); }
  catch (e) { results.push(`FAIL  ${name}\n      ${e.message}`); }
}

// ---------- mock spreadsheet ----------
class Range {
  constructor(sheet, a1) { this.sheet = sheet; this.a1 = a1; }
  setBackground(c) { this.sheet.log.push(['bg', this.a1, c]); return this; }
  setValues(v) { this.sheet.written.push(...v); return this; }
  setValue(v) { this.sheet.written.push([v]); return this; }
  setFontWeight() { return this; } setFontColor() { return this; }
}
class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows; this.log = []; this.written = []; this.cleared = false; }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getDataRange() { return { getValues: () => this.rows.map((r) => r.slice()) }; }
  getRange(a, b, c, d) { return new Range(this, typeof a === 'string' ? a : `${a},${b},${c},${d}`); }
  getRangeList(list) { return { setBackground: (c) => { list.forEach((a1) => this.log.push(['bg', a1, c])); } }; }
  clear() { this.cleared = true; this.written = []; }
  setFrozenRows() {} autoResizeColumn() {}
  bg(color) { return this.log.filter((l) => l[2] === color).map((l) => l[1]); }
}
class SS {
  constructor(sheets) { this.sheets = sheets; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n, []); this.sheets.push(s); return s; }
  toast() {}
}

const N = (id, g, info, sy = '', ey = '', lon = '', lat = '', img = '', url = '') => [id, g, info, sy, ey, lon, lat, img, url];
const L = (a, b, c, d, e = '') => [a, b, c, d, e];

function makeFixture() {
  return new SS([
    new Sheet('nodes_color', [
      ['node_Group', 'color', '', ''], ['人物', '#E63946'], ['政府機關', '#FF8E8E'], ['非營利組織', '#4CC9F0'],
      ['空間', '#2A9D8F'], ['事件', '#E9C46A'], ['物件', '#83C5BE'], ['行動/活動', '#9D4EDD'], ['族群', '#B5838D', 'ＸＸ族ＸＸ群'],
    ]),
    new Sheet('links_color', [
      ['link_group', 'color', '', ''], ['空間關係', '#E63946', '', '空間－空間'], ['人際關係', '#457B9D', '', '人－人'],
      ['活動/行動參與', '#F4A261', '', '人－活動'], ['人地關係', '#F4A261', '', '人－空間'], ['組織關聯', '#2A9D8F'],
    ]),
    new Sheet('missing_node', [['來源表單', '行號', 'id', 'node_Group', 'info', 'start_year', 'end_year', 'Lon', 'Lat']]),
    new Sheet('nodes_ALL', [
      ['id', 'node_Group', 'info', 'start_year', 'end_year', 'Lon', 'Lat緯度', 'Image', '相關連結'],
      N('Bato Naui', '人物', '瑞岩部落青年，自思源埡口往東，定居於碧侯村一帶'),
      N('Meya Box', '人物', '瑞岩部落領導人，指派四位青年翻越思源埡口往東尋找新生地'),
      N('吳子寧', '人物', '[merged] 金岳社區發展協會專員', '[merged] 金岳社區發展協會專員'),    // 年份欄有文字
      N('思源埡口', '空間', '泰雅族族群分散點', '', '', 121.42724, 24.49032644),
      N('碧候村', '空間', '南澳鄉行政村'),
      N('大南澳震安宮', '空間', '源於清末漢人移墾初期的土地公小祠', '', '', 24.46367414, 121.8071204, 'FALSE'), // 經緯度填反
      N('南澳鄉全民運動會', '行動/活動', '增進南澳鄉民身心健康', 2022, '現在'),
      N('南澳鄉泰雅文化館\r', '空間', '以泰雅族為主的文化館'),                          // &#13; 殘留
      N('Rgayung青年文化傳承團', '非營利組織', '澳花青年自組社群'),
      N('澳花村', '空間', '南澳鄉行政村'),
      N('', '', ''),                                                                  // 空白列
      N('Meya Box', '族群', '重複定義、分類不同'),                                      // 分類衝突
      N('沒有分類的節點', '', '測試'),
      N('新分類節點', '健康議題', '分類沒有顏色'),
    ]),
    new Sheet('link_ALL', [
      ['Node_A', 'Node_B', 'label', 'info', 'Date'],
      L('Bato Naui', '思源埡口', '人地關係', '自瑞岩翻越思源埡口往東'),
      L('Bato Naui', '碧候村', '人地關係', '於碧侯一帶定居'),
      L('Meya Box', 'Bato Naui', '人際關係', '指派青年往思源埡口方向尋找新生地'),
      L('Rgayung青年文化傳承團', '澳花村', '人地關係', '澳花青年自組社群'),
      L('Rgayung青年文化傳承團', '澳花村', '人地關係', '澳花青年自組社群'),              // 重複
      L('Rgayung青年文化傳承團', '楓樹下音樂會', '活動/行動 參與', '透過音樂促進文化交流', 2025), // 分類有空格、缺節點
      L('那山那谷', '部落裡的電影節', '活動/行動參與', '活動於該場域舉辦', '2025'),         // 兩端都缺
      L('', '', '', ''),
      L('只有一端', '', '人際關係', ''),
      L('南澳鄉泰雅文化館', '碧候村', '空間關係', '測試換行殘留', '民國100年'),
    ]),
    new Sheet('supbase後台資料', [['id', 'title'], ['3a4b', '東岳湧泉']]),
    new Sheet('文獻資料庫', [['x'], ['y']]),
    new Sheet('_nodes_停用', [['id'], ['不該被讀到']]),
  ]);
}

// ---------- mock services ----------
function makeContext({ token = 'test-token', getCode = 404, getBody = '', putCode = 201 } = {}) {
  const calls = [];
  const menu = [];
  const alerts = [];
  const ctx = {
    console: { log() {} },
    SpreadsheetApp: null,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'GITHUB_TOKEN' ? token : null) }) },
    UrlFetchApp: {
      fetch(url, opt) {
        calls.push({ url, opt });
        if (opt.method === 'get') return { getResponseCode: () => getCode, getContentText: () => getBody };
        return { getResponseCode: () => putCode, getContentText: () => '{"message":"x"}' };
      },
    },
    Utilities: {
      base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
      formatDate: () => '2026-11-25 12:00',
      Charset: { UTF_8: 'UTF-8' },
    },
  };
  const ui = {
    createMenu: (t) => { const m = { title: t, items: [], addItem(l, f) { this.items.push([l, f]); return this; }, addToUi() { menu.push(this); } }; return m; },
    alert: (t, msg) => alerts.push([t, msg]),
    ButtonSet: { OK: 'OK' },
  };
  vm.createContext(ctx);
  vm.runInContext(gsCode, ctx);
  return { ctx, calls, menu, alerts, ui };
}

// ---------- tests ----------
const { ctx } = makeContext();
const ss = makeFixture();
const out = JSON.parse(JSON.stringify(ctx.processGraphData(ss)));  // 轉成本 realm 的物件
const nodes = out.result.nodes;
const links = out.result.links;
const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
const report = ss.getSheetByName('檢查報告').written.map((r) => r.join(' | '));

test('分頁分類：只讀 nodes_/node_/link_，略過顏色、missing、supbase、文獻、_ 開頭', () => {
  const k = (n) => ctx.sheetKind(n);
  assert.equal(k('nodes_ALL'), 'node'); assert.equal(k('node_雅柔'), 'node'); assert.equal(k('nodes_竺庭'), 'node');
  assert.equal(k('link_ALL'), 'link'); assert.equal(k('link_雅柔'), 'link');
  for (const n of ['nodes_color', 'links_color', 'missing_node', 'supbase後台資料', '文獻資料庫', '記憶圖庫_雅柔', '_nodes_停用', '檢查報告']) assert.equal(k(n), null, n);
});

test('links_color 不會被當成連線分頁（舊版錯誤：色碼變成節點）', () => {
  assert.ok(!nodes.some((n) => /^#/.test(n.id)));
  assert.ok(!nodes.some((n) => n.sourceSheet === 'links_color'));
});

test('supbase後台資料、_nodes_停用 不會進入輸出', () => {
  assert.ok(!byId['東岳湧泉']); assert.ok(!byId['不該被讀到']);
});

test('節點數：12 個實際節點 + 3 個缺漏（自動增加）', () => {
  assert.equal(out.summary.nodeCount, 12);
  assert.equal(out.summary.missingCount, 3);
  assert.deepEqual(nodes.filter((n) => n.group === '自動增加').map((n) => n.id).sort(), ['部落裡的電影節', '那山那谷', '楓樹下音樂會'].sort());
});

test('重複連線只保留一條；空白列與缺一端的列不輸出', () => {
  assert.equal(out.summary.duplicateLinkCount, 1);
  assert.equal(out.summary.linkCount, 7);
  assert.ok(!links.some((l) => l.source === '只有一端'));
  assert.ok(report.some((r) => r.includes('link_ALL | B10 | 連線少了一端')));
});

test('分類名稱去空白：「活動/行動 參與」= 「活動/行動參與」，且拿得到顏色', () => {
  const l = links.find((x) => x.target === '楓樹下音樂會');
  assert.equal(l.group, '活動/行動參與'); assert.equal(l.color, '#F4A261');
});

test('年份：數字、數字文字 → 數字；「現在」→ 空；其他文字 → 空並回報', () => {
  assert.equal(links.find((x) => x.target === '楓樹下音樂會').year, 2025);
  assert.equal(links.find((x) => x.source === '那山那谷').year, 2025);
  assert.equal(byId['南澳鄉全民運動會'].start_year, 2022);
  assert.equal(byId['南澳鄉全民運動會'].end_year, null);
  assert.equal(byId['吳子寧'].start_year, null);
  assert.ok(report.some((r) => r.includes('nodes_ALL | D4 | 年份不是數字')));
  assert.ok(report.some((r) => r.includes('link_ALL | E11 | 年份不是數字：民國100年')));
});

test('經緯度：正常保留；填反自動對調並回報', () => {
  assert.equal(byId['思源埡口'].lon, 121.42724); assert.equal(byId['思源埡口'].lat, 24.49032644);
  assert.equal(byId['大南澳震安宮'].lon, 121.8071204); assert.equal(byId['大南澳震安宮'].lat, 24.46367414);
  assert.ok(report.some((r) => r.includes('nodes_ALL | F7 | 經緯度疑似填反')));
});

test('id 尾端的 \\r（&#13;）會被清掉，連線能對上', () => {
  assert.ok(byId['南澳鄉泰雅文化館']);
  assert.ok(links.some((l) => l.source === '南澳鄉泰雅文化館' && l.target === '碧候村'));
});

test('Image 欄的 FALSE 不輸出', () => { assert.equal(byId['大南澳震安宮'].image, undefined); });

test('分類衝突：Meya Box 兩列都標紅，保留第一次的分類', () => {
  const red = ss.getSheetByName('nodes_ALL').bg('#ffcdd2');
  assert.deepEqual(red.sort(), ['B13', 'B3'].sort());
  assert.equal(byId['Meya Box'].group, '人物');
  assert.ok(byId['Meya Box'].info.includes('重複定義'));
  assert.equal(out.summary.conflictCount, 2);
});

test('缺漏節點：連線分頁對應儲存格標黃，missing_node 有清單', () => {
  const y = ss.getSheetByName('link_ALL').bg('#fff59d');
  for (const c of ['B7', 'A8', 'B8']) assert.ok(y.includes(c), c);
  const ms = ss.getSheetByName('missing_node').written.map((r) => r[2]);
  assert.ok(ms.includes('那山那谷') && ms.includes('部落裡的電影節') && ms.includes('楓樹下音樂會'));
});

test('沒有分類、分類沒有顏色 → 標橘並回報', () => {
  assert.ok(report.some((r) => r.includes('沒有填 node_Group')));
  assert.ok(report.some((r) => r.includes('節點分類「健康議題」在 nodes_color 沒有顏色')));
  assert.ok(ss.getSheetByName('nodes_ALL').bg('#ffe0b2').includes('B15'));
});

test('只清程式會標記的欄（不動 H 欄以後使用者自己的顏色）', () => {
  const cleared = ss.getSheetByName('nodes_ALL').log.filter((l) => l[2] === null).map((l) => l[1]);
  assert.deepEqual(cleared, ['B2:B', 'D2:F']);
  const clearedL = ss.getSheetByName('link_ALL').log.filter((l) => l[2] === null).map((l) => l[1]);
  assert.deepEqual(clearedL, ['A2:C', 'E2:E']);
});

test('重跑一次結果相同（不會因為上次輸出的 missing_node / 檢查報告而改變）', () => {
  const again = JSON.parse(JSON.stringify(ctx.processGraphData(ss)));
  assert.deepEqual(again.summary, out.summary);
  assert.equal(JSON.stringify(again.result), JSON.stringify(out.result));
});

test('網站轉換：normalizeGraph 後連線兩端都存在、缺漏節點被濾掉、分類對到 meta_relation', () => {
  const g = normalizeGraph(JSON.parse(JSON.stringify(out.result)));
  const ids = new Set(g.nodes.map((n) => n.id));
  assert.equal(g.nodes.length, 12);
  assert.ok(g.links.every((l) => ids.has(l.source) && ids.has(l.target)));
  assert.equal(g.links.length, 5);
  assert.ok(g.links.every((l) => l.meta_relation !== '其他'), JSON.stringify(g.links.map((l) => l.group)));
  assert.equal(g.stats.nodes, 12);
});

test('網站轉換：與 repo 現有 graph.json 欄位相容', () => {
  const old = JSON.parse(fs.readFileSync(`${REPO}/data/graph.json`, 'utf8'));
  for (const k of ['id', 'group', 'info', 'start_year', 'end_year', 'lon', 'lat', 'col']) assert.ok(k in nodes[0], k);
  for (const k of Object.keys(old.links[0])) assert.ok(k in links[0], k);
  assert.deepEqual(Object.keys(out.result).sort(), Object.keys(old).sort());
});

test('選單：onOpen 建立「圖譜工具」兩個按鈕，對應的函式存在', () => {
  const m = makeContext();
  m.ctx.SpreadsheetApp = { getUi: () => m.ui };
  m.ctx.onOpen();
  assert.equal(m.menu[0].title, '圖譜工具');
  assert.deepEqual(m.menu[0].items.map((i) => i[1]), ['runGraphCheckWithUI', 'runGraphSyncWithUI']);
  for (const [, fn] of m.menu[0].items) assert.equal(typeof m.ctx[fn], 'function');
});

test('「檢查資料」按鈕：不呼叫 GitHub，跳出摘要', () => {
  const m = makeContext();
  const s2 = makeFixture();
  m.ctx.SpreadsheetApp = { getUi: () => m.ui, getActiveSpreadsheet: () => s2 };
  m.ctx.runGraphCheckWithUI();
  assert.equal(m.calls.length, 0);
  assert.equal(m.alerts[0][0], '檢查完成');
  assert.ok(m.alerts[0][1].includes('節點：12，連線：7'));
});

test('推送（第一次，檔案不存在）：GET 帶 ref=main，PUT 到 main，訊息含數量，內容正確', () => {
  const m = makeContext({ getCode: 404 });
  const s2 = makeFixture();
  m.ctx.SpreadsheetApp = { getUi: () => m.ui, getActiveSpreadsheet: () => s2 };
  m.ctx.runGraphSyncWithUI();
  assert.equal(m.alerts[0][0], '同步完成', m.alerts[0][1]);
  assert.equal(m.calls[0].url, 'https://api.github.com/repos/tdis-design/nanao/contents/data/graph.json?ref=main');
  const put = m.calls[1];
  assert.equal(put.opt.method, 'put');
  const body = JSON.parse(put.opt.payload);
  assert.equal(body.branch, 'main');
  assert.equal(body.sha, undefined);
  assert.equal(body.message, 'chore: update graph.json [2026-11-25 12:00] (12 nodes, 7 links)');
  const pushed = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  assert.equal(pushed.nodes.length, 15);
  assert.ok(put.opt.headers.Authorization === 'token test-token');
});

test('推送（檔案已存在且內容相同）：跳過，不呼叫 PUT', () => {
  const s2 = makeFixture();
  const probe = makeContext();
  const content = JSON.stringify(probe.ctx.processGraphData(makeFixture()).result, null, 2);
  const m = makeContext({ getCode: 200, getBody: JSON.stringify({ sha: 'abc', content: Buffer.from(content).toString('base64') }) });
  m.ctx.SpreadsheetApp = { getUi: () => m.ui, getActiveSpreadsheet: () => s2 };
  m.ctx.runGraphSyncWithUI();
  assert.equal(m.calls.length, 1);
  assert.ok(m.alerts[0][1].startsWith('資料無變動'));
});

test('推送（檔案已存在、內容不同）：PUT 帶 sha', () => {
  const s2 = makeFixture();
  const m = makeContext({ getCode: 200, getBody: JSON.stringify({ sha: 'abc', content: Buffer.from('{}').toString('base64') }), putCode: 200 });
  m.ctx.SpreadsheetApp = { getUi: () => m.ui, getActiveSpreadsheet: () => s2 };
  m.ctx.runGraphSyncWithUI();
  assert.equal(JSON.parse(m.calls[1].opt.payload).sha, 'abc');
  assert.ok(m.alerts[0][1].includes('推送成功（HTTP 200）'));
});

test('推送錯誤：沒有 Token、401、PUT 失敗都顯示「同步失敗」與中文說明', () => {
  for (const [opts, expect] of [
    [{ token: null }, '找不到 GITHUB_TOKEN'],
    [{ getCode: 401 }, 'HTTP 401：Token 失效'],
    [{ getCode: 404, putCode: 403 }, 'HTTP 403'],
    [{ getCode: 404, putCode: 409 }, 'HTTP 409'],
  ]) {
    const m = makeContext(opts);
    const s2 = makeFixture();
    m.ctx.SpreadsheetApp = { getUi: () => m.ui, getActiveSpreadsheet: () => s2 };
    m.ctx.runGraphSyncWithUI();
    assert.equal(m.alerts[0][0], '同步失敗', JSON.stringify(opts));
    assert.ok(m.alerts[0][1].includes(expect), m.alerts[0][1]);
  }
});

fs.writeFileSync(OUT, JSON.stringify(out.result, null, 2));
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
