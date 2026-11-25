/**
 * Graph.gs — 南澳知識圖譜：試算表檢查 + 推送 graph.json 到 GitHub
 *
 * 綁定試算表：雲端硬碟「For Website」資料夾裡的 graphdata。
 * 安裝方式：試算表 → 擴充功能 → Apps Script，貼上本檔全部內容，儲存。
 * Token 設定：見同資料夾的 TOKEN_設定說明.md。
 *
 * 分頁規則（依南澳現有習慣）：
 *   - 節點分頁：名稱開頭為 nodes_ 或 node_（例如 nodes_ALL、node_雅柔）
 *       A=id  B=node_Group  C=info  D=start_year  E=end_year  F=Lon  G=Lat  H=Image  I=相關連結
 *   - 連線分頁：名稱開頭為 link_（例如 link_ALL、link_竺庭）
 *       A=Node_A  B=Node_B  C=label（關係分類）  D=info  E=Date（年份）
 *   - nodes_color：A=node_Group  B=color
 *   - links_color：A=link_group  B=color
 *   - missing_node、檢查報告：程式自動產生，不用手動編輯
 *   - 其他名稱的分頁（例如 supbase後台資料、文獻資料庫）一律不讀。
 *   - 分頁名稱開頭加「_」可暫時停用該分頁（例如 _nodes_舊版）。
 *
 * 程式依「欄的位置」讀資料，不看標題文字，欄的順序不能換。
 */

const GRAPH_CONFIG = {
  REPO_OWNER: 'tdis-design',
  REPO_NAME: 'nanao',
  BRANCH: 'main',
  FILE_PATH: 'data/graph.json',
  TIMEZONE: 'Asia/Taipei'
};

const SHEET_NAMES = {
  NODE_COLOR: 'nodes_color',
  LINK_COLOR: 'links_color',
  MISSING: 'missing_node',
  REPORT: '檢查報告'
};

const AUTO_GROUP = '自動增加';
const AUTO_INFO = '(自動生成的關聯節點)';

const MARK = {
  CONFLICT: '#ffcdd2',  // 淺紅：同一個 id 在不同分頁的 node_Group 不同
  MISSING: '#fff59d',   // 淺黃：連線用到、但沒有任何節點分頁建立的 id
  WARNING: '#ffe0b2'    // 淺橘：年份不是數字、經緯度疑似填反、分類沒有顏色
};

// ===== 選單：開啟試算表時自動建立「圖譜工具」=====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('圖譜工具')
    .addItem('檢查資料（不推送）', 'runGraphCheckWithUI')
    .addItem('推送 graph.json 到網站', 'runGraphSyncWithUI')
    .addToUi();
}

// ===== 按鈕：只檢查、上色、更新 missing_node 與檢查報告 =====
function runGraphCheckWithUI() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    ss.toast('檢查中，請稍候…', '圖譜工具', 30);
    const out = processGraphData(ss);
    ss.toast('完成', '圖譜工具', 3);
    ui.alert('檢查完成', formatSummary(out.summary), ui.ButtonSet.OK);
  } catch (e) {
    ss.toast('失敗', '圖譜工具', 3);
    ui.alert('檢查失敗', e.message, ui.ButtonSet.OK);
  }
}

// ===== 按鈕：檢查後推送到 GitHub =====
function runGraphSyncWithUI() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    ss.toast('同步中，請稍候…', '圖譜工具', 30);
    const out = processGraphData(ss);
    const pushMsg = pushGraphToGitHub(out.result, out.summary);
    ss.toast('完成', '圖譜工具', 3);
    ui.alert('同步完成', pushMsg + '\n\n' + formatSummary(out.summary), ui.ButtonSet.OK);
  } catch (e) {
    ss.toast('失敗', '圖譜工具', 3);
    ui.alert('同步失敗', e.message, ui.ButtonSet.OK);
  }
}

function formatSummary(s) {
  return '節點：' + s.nodeCount + '，連線：' + s.linkCount +
    '\n缺漏節點（連線分頁標黃，見 missing_node）：' + s.missingCount +
    '\n分類衝突（節點分頁標紅）：' + s.conflictCount + ' 處' +
    '\n其他提醒（標橘，見「' + SHEET_NAMES.REPORT + '」分頁）：' + s.warningCount + ' 項' +
    '\n重複連線（只保留一條）：' + s.duplicateLinkCount + ' 條';
}

// ===== GitHub：內容有變動才更新 data/graph.json =====
function pushGraphToGitHub(resultObj, summary) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('找不到 GITHUB_TOKEN。請至「專案設定 → 指令碼屬性」新增，步驟見 TOKEN_設定說明.md。');
  }

  const baseUrl = 'https://api.github.com/repos/' + GRAPH_CONFIG.REPO_OWNER + '/' +
    GRAPH_CONFIG.REPO_NAME + '/contents/' + GRAPH_CONFIG.FILE_PATH;
  const headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };

  let sha = '';
  let oldContent = '';
  const getRes = UrlFetchApp.fetch(baseUrl + '?ref=' + GRAPH_CONFIG.BRANCH, {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  });
  const getCode = getRes.getResponseCode();
  if (getCode === 200) {
    const gitData = JSON.parse(getRes.getContentText());
    sha = gitData.sha;
    oldContent = Utilities.newBlob(Utilities.base64Decode(gitData.content)).getDataAsString();
  } else if (getCode !== 404) {
    throw new Error(explainHttpError(getCode, getRes.getContentText()));
  }

  const newContent = JSON.stringify(resultObj, null, 2);
  if (oldContent === newContent) {
    return '資料無變動，跳過推送。';
  }

  const stamp = Utilities.formatDate(new Date(), GRAPH_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  const payload = {
    message: 'chore: update graph.json [' + stamp + '] (' + summary.nodeCount + ' nodes, ' +
      summary.linkCount + ' links)',
    content: Utilities.base64Encode(newContent, Utilities.Charset.UTF_8),
    branch: GRAPH_CONFIG.BRANCH
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(baseUrl, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const putCode = putRes.getResponseCode();
  if (putCode !== 200 && putCode !== 201) {
    throw new Error(explainHttpError(putCode, putRes.getContentText()));
  }
  return '推送成功（HTTP ' + putCode + '）。約 3～5 分鐘後網站更新。';
}

function explainHttpError(code, body) {
  const hints = {
    401: 'Token 失效或權限不足，請管理者重新產生 Token。',
    403: 'Token 沒有寫入權限，或 GitHub 暫時限制存取。',
    404: '找不到 GitHub 專案，請檢查 GRAPH_CONFIG 的 REPO_OWNER / REPO_NAME，或 Token 沒有這個專案的權限。',
    409: '網站資料剛被其他人更新，請再按一次推送。',
    422: 'GitHub 拒絕這次更新，請截圖給管理者。'
  };
  return 'GitHub 回應 HTTP ' + code + '：' + (hints[code] || '未知錯誤，請截圖給管理者。') +
    '\n' + String(body || '').slice(0, 200);
}

// ===== 核心：掃描、檢查、上色、更新 missing_node 與檢查報告 =====
function processGraphData(ss) {
  const sheets = ss.getSheets();
  const nodeColorMap = createColorMap(ss, SHEET_NAMES.NODE_COLOR);
  const linkColorMap = createColorMap(ss, SHEET_NAMES.LINK_COLOR);
  const legend = getLegendData(ss, SHEET_NAMES.NODE_COLOR);

  const nodesMap = {};
  const links = [];
  const linkKeys = {};
  const linkLocations = {};      // id → [{sheet, range}]，用來標黃
  const firstDefinition = {};    // id → {group, sheet, range}，用來標紅
  const marks = { conflict: {}, missing: {}, warning: {} };
  const warnings = [];
  let duplicateLinkCount = 0;

  // --- 第一階段：連線分頁 ---
  sheets.forEach(function (sheet) {
    const name = sheet.getName();
    if (sheetKind(name) !== 'link' || sheet.getLastRow() <= 1) return;
    sheet.getRangeList(['A2:C', 'E2:E']).setBackground(null);  // 只清程式會標記的欄

    sheet.getDataRange().getValues().slice(1).forEach(function (row, i) {
      const rowNum = i + 2;
      const source = cleanText(row[0]);
      const target = cleanText(row[1]);
      if (!source && !target) return;
      if (!source || !target) {
        addWarning(warnings, marks, name, (source ? 'B' : 'A') + rowNum, '連線少了一端的節點 id');
        return;
      }

      const group = normalizeCategory(row[2]);
      const info = cleanText(row[3]);
      const year = parseYear(row[4]);
      if (year.invalid) addWarning(warnings, marks, name, 'E' + rowNum, '年份不是數字：' + year.raw);
      if (group && !linkColorMap[group]) {
        addWarning(warnings, marks, name, 'C' + rowNum, '關係分類「' + group + '」在 links_color 沒有顏色');
      }

      [[source, 'A'], [target, 'B']].forEach(function (pair) {
        const id = pair[0];
        if (!linkLocations[id]) linkLocations[id] = [];
        linkLocations[id].push({ sheet: name, range: pair[1] + rowNum });
        if (!nodesMap[id]) nodesMap[id] = createAutoNode(id, nodeColorMap, name, rowNum);
      });

      const key = [source, target, group, info].join('\u0001');
      if (linkKeys[key]) {
        duplicateLinkCount++;
        return;
      }
      linkKeys[key] = true;

      links.push({
        source: source,
        target: target,
        group: group,
        label: group,
        info: info,
        year: year.value,
        color: linkColorMap[group] || '#999999'
      });
    });
  });

  // --- 第二階段：節點分頁 ---
  sheets.forEach(function (sheet) {
    const name = sheet.getName();
    if (sheetKind(name) !== 'node' || sheet.getLastRow() <= 1) return;
    sheet.getRangeList(['B2:B', 'D2:F']).setBackground(null);  // 只清程式會標記的欄

    sheet.getDataRange().getValues().slice(1).forEach(function (row, i) {
      const rowNum = i + 2;
      const id = cleanText(row[0]);
      if (!id) return;

      const group = cleanText(row[1]);
      const info = cleanText(row[2]);
      const range = 'B' + rowNum;

      if (!group) addWarning(warnings, marks, name, range, '沒有填 node_Group');
      else if (!nodeColorMap[group]) {
        addWarning(warnings, marks, name, range, '節點分類「' + group + '」在 nodes_color 沒有顏色');
      }

      const prev = firstDefinition[id];
      if (prev && prev.group !== group) {
        addMark(marks.conflict, name, range);
        addMark(marks.conflict, prev.sheet, prev.range);
      } else if (!prev) {
        firstDefinition[id] = { group: group, sheet: name, range: range };
      }

      const startYear = parseYear(row[3]);
      const endYear = parseYear(row[4]);
      if (startYear.invalid) addWarning(warnings, marks, name, 'D' + rowNum, '年份不是數字：' + startYear.raw);
      if (endYear.invalid) addWarning(warnings, marks, name, 'E' + rowNum, '年份不是數字：' + endYear.raw);

      const coord = parseCoordinates(row[5], row[6]);
      if (coord.swapped) addWarning(warnings, marks, name, 'F' + rowNum, '經緯度疑似填反（已自動對調輸出），請把 F 欄改成經度 121.x、G 欄改成緯度 24.x');
      if (coord.invalid) addWarning(warnings, marks, name, 'F' + rowNum, '經緯度不是數字或不在台灣範圍');

      const data = {
        id: id,
        group: group,
        info: info,
        start_year: startYear.value,
        end_year: endYear.value,
        lon: coord.lon,
        lat: coord.lat,
        col: nodeColorMap[group] || '#CCCCCC',
        sourceSheet: name,
        sourceRow: rowNum
      };
      const image = cleanText(row[7]);
      const url = cleanText(row[8]);
      if (image && image.toUpperCase() !== 'FALSE' && image.toUpperCase() !== 'TRUE') data.image = image;
      if (url) data.url = url;

      const existing = nodesMap[id];
      if (!existing || existing.group === AUTO_GROUP) {
        nodesMap[id] = data;
      } else {
        // 同一個 id 出現在多個節點分頁：保留第一次的分類，說明文字合併，空欄位用後面的補
        if (info && existing.info.indexOf(info) === -1) {
          existing.info = existing.info ? existing.info + '\n' + info : info;
        }
        ['start_year', 'end_year', 'lon', 'lat', 'image', 'url'].forEach(function (k) {
          if ((existing[k] === null || existing[k] === undefined) && data[k] !== undefined) existing[k] = data[k];
        });
      }
    });
  });

  // --- 第三階段：上色 ---
  const missingNodes = Object.keys(nodesMap)
    .map(function (id) { return nodesMap[id]; })
    .filter(function (n) { return n.group === AUTO_GROUP; });
  missingNodes.forEach(function (n) {
    (linkLocations[n.id] || []).forEach(function (loc) { addMark(marks.missing, loc.sheet, loc.range); });
  });
  applyMarks(ss, marks.warning, MARK.WARNING);
  applyMarks(ss, marks.missing, MARK.MISSING);
  applyMarks(ss, marks.conflict, MARK.CONFLICT);

  // --- 第四階段：輸出 ---
  updateMissingSheet(ss, missingNodes);
  updateReportSheet(ss, warnings);

  const nodes = Object.keys(nodesMap).map(function (id) { return nodesMap[id]; });
  const conflictCount = Object.keys(marks.conflict)
    .reduce(function (sum, k) { return sum + marks.conflict[k].length; }, 0);
  const summary = {
    nodeCount: nodes.length - missingNodes.length,
    linkCount: links.length,
    missingCount: missingNodes.length,
    conflictCount: conflictCount,
    warningCount: warnings.length,
    duplicateLinkCount: duplicateLinkCount
  };
  console.log(JSON.stringify(summary));
  return { result: { nodes: nodes, links: links, legend: legend }, summary: summary };
}

// ==========================================
// 輔助函式
// ==========================================

// 判斷分頁種類：'node'、'link' 或 null（不讀）
function sheetKind(name) {
  const lower = String(name).trim().toLowerCase();
  if (lower.charAt(0) === '_') return null;
  if (lower === SHEET_NAMES.NODE_COLOR || lower === SHEET_NAMES.LINK_COLOR || lower === SHEET_NAMES.MISSING) return null;
  if (lower.indexOf('nodes_') === 0 || lower.indexOf('node_') === 0) return 'node';
  if (lower.indexOf('link_') === 0) return 'link';
  return null;
}

// 去掉頭尾空白與 Windows 換行殘留（&#13;）
function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r/g, '').trim();
}

// 分類名稱去掉所有空白，讓「活動/行動 參與」與「活動/行動參與」視為同一類
function normalizeCategory(value) {
  return cleanText(value).replace(/[\s　]+/g, '');
}

// 年份：數字或純數字文字才算；「現在」視為沒有結束年份；其他文字回報
function parseYear(value) {
  const raw = cleanText(value);
  if (!raw || raw === '現在' || raw === '至今') return { value: null, invalid: false, raw: raw };
  if (typeof value === 'number' && isFinite(value)) return { value: Math.round(value), invalid: false, raw: raw };
  if (/^\d{1,4}$/.test(raw)) return { value: parseInt(raw, 10), invalid: false, raw: raw };
  return { value: null, invalid: true, raw: raw.slice(0, 20) };
}

// 經緯度：台灣經度約 119～123、緯度約 21～26；填反時自動對調
function parseCoordinates(lonValue, latValue) {
  const lonRaw = cleanText(lonValue);
  const latRaw = cleanText(latValue);
  if (!lonRaw && !latRaw) return { lon: null, lat: null, swapped: false, invalid: false };
  const lon = Number(lonRaw);
  const lat = Number(latRaw);
  const isLon = function (v) { return v >= 119 && v <= 123; };
  const isLat = function (v) { return v >= 21 && v <= 26; };
  if (!lonRaw || !latRaw || !isFinite(lon) || !isFinite(lat)) {
    return { lon: null, lat: null, swapped: false, invalid: true };
  }
  if (isLon(lon) && isLat(lat)) return { lon: lon, lat: lat, swapped: false, invalid: false };
  if (isLat(lon) && isLon(lat)) return { lon: lat, lat: lon, swapped: true, invalid: false };
  return { lon: null, lat: null, swapped: false, invalid: true };
}

function addMark(bucket, sheetName, range) {
  if (!bucket[sheetName]) bucket[sheetName] = [];
  if (bucket[sheetName].indexOf(range) === -1) bucket[sheetName].push(range);
}

function addWarning(warnings, marks, sheetName, range, message) {
  warnings.push([sheetName, range, message]);
  addMark(marks.warning, sheetName, range);
}

function applyMarks(ss, bucket, color) {
  Object.keys(bucket).forEach(function (sheetName) {
    const ranges = bucket[sheetName];
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || ranges.length === 0) return;
    for (let i = 0; i < ranges.length; i += 500) {
      sheet.getRangeList(ranges.slice(i, i + 500)).setBackground(color);
    }
  });
}

function prepareOutputSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#EFEFEF');
  sheet.setFrozenRows(1);
  return sheet;
}

function updateMissingSheet(ss, missingNodes) {
  const headers = ['來源表單', '行號', 'id', 'node_Group', 'info', 'start_year', 'end_year', 'Lon', 'Lat'];
  const sheet = prepareOutputSheet(ss, SHEET_NAMES.MISSING, headers);
  if (missingNodes.length === 0) {
    sheet.getRange(2, 1).setValue('目前沒有缺漏的節點 (All clean)').setFontColor('green');
    return;
  }
  const rows = missingNodes.map(function (n) {
    return [n.sourceSheet || '', n.sourceRow || '', n.id, n.group, '', '', '', '', ''];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(2 + rows.length, 1)
    .setValue('--- 請把這些 id 補進節點分頁（例如 nodes_ALL），填好 node_Group 與 info，再按一次檢查 ---')
    .setFontColor('red');
}

function updateReportSheet(ss, warnings) {
  const headers = ['分頁', '儲存格', '說明'];
  const sheet = prepareOutputSheet(ss, SHEET_NAMES.REPORT, headers);
  if (warnings.length === 0) {
    sheet.getRange(2, 1).setValue('沒有需要處理的提醒').setFontColor('green');
    return;
  }
  sheet.getRange(2, 1, warnings.length, headers.length).setValues(warnings);
}

function createAutoNode(id, colorMap, sheetName, rowNum) {
  return {
    id: id,
    group: AUTO_GROUP,
    info: AUTO_INFO,
    start_year: null,
    end_year: null,
    lon: null,
    lat: null,
    col: colorMap[AUTO_GROUP] || '#777777',
    sourceSheet: sheetName,
    sourceRow: rowNum
  };
}

function createColorMap(ss, sheetName) {
  const map = {};
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return map;
  sheet.getDataRange().getValues().slice(1).forEach(function (row) {
    const key = sheetName === SHEET_NAMES.LINK_COLOR ? normalizeCategory(row[0]) : cleanText(row[0]);
    const color = cleanText(row[1]);
    if (key && /^#[0-9a-fA-F]{6}$/.test(color)) map[key] = color;
  });
  return map;
}

function getLegendData(ss, sheetName) {
  const list = [];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return list;
  sheet.getDataRange().getValues().slice(1).forEach(function (row) {
    const label = cleanText(row[0]);
    const color = cleanText(row[1]);
    if (label) list.push({ label: label, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#CCCCCC' });
  });
  return list;
}
