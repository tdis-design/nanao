# GitHub Token 設定

試算表裡的 Apps Script 需要一組 GitHub Token（權杖），才能把資料寫進 `tdis-design/nanao`。Token 不寫在程式碼裡，而是存在 Apps Script 的「指令碼屬性」。

Token 等於帳號鑰匙，外洩就能修改專案。不要貼到聊天、信件或截圖裡。不小心外洩時，照「撤銷舊 Token」處理。

## 產生 Token（用 tdis-design 帳號）

1. 用 `tdis-design` 帳號登入 GitHub，點右上角頭像 → Settings → Developer settings。
2. Personal access tokens → Fine-grained tokens → Generate new token。
3. 填寫：
   - Token name：`nanao graph.json sync`
   - Expiration：90 days
   - Repository access：Only select repositories → 選 `tdis-design/nanao`
   - Permissions → Repository permissions → Contents：Read and write
4. 按 Generate token，複製 `github_pat_...` 開頭的字串。關掉頁面後就看不到了，先貼在記事本。

## 存進 Apps Script

1. 開啟雲端硬碟「For Website」裡的 `graphdata` → 擴充功能 → Apps Script。
2. 左側齒輪「專案設定」→ 拉到最下面「指令碼屬性」→ 新增指令碼屬性。
3. 屬性填 `GITHUB_TOKEN`，值貼上剛剛的 Token。
4. 儲存。程式會自動讀取，不用改程式碼。

## 更換 Token

到期或外洩時：產生新的 Token → 回到「指令碼屬性」改 `GITHUB_TOKEN` 的值 → 儲存 → 撤銷舊的。

## 撤銷舊 Token

GitHub → Settings → Developer settings → Personal access tokens → 選舊的 Token → Delete。

## 錯誤對照

| 訊息 | 原因 | 處理 |
|---|---|---|
| 找不到 GITHUB_TOKEN | 沒設定，或名稱打錯 | 名稱必須完全是 `GITHUB_TOKEN`，大小寫要一樣 |
| HTTP 401 | Token 過期或打錯 | 重新產生 |
| HTTP 403 | Token 沒有寫入權限 | 確認 Contents 選了 Read and write |
| HTTP 404 | 專案名稱錯，或 Token 沒選到 nanao | 確認 Repository access 有選 `tdis-design/nanao` |
| HTTP 409 | 剛好有別人同時推送 | 再按一次推送 |
