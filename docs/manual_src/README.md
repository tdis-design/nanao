# 使用說明原始檔

本專案只有一份使用說明：雲端硬碟 For Website 資料夾裡的「00_南澳知識圖譜_使用說明_日期.pdf」。這個資料夾放的是它的原始檔。

| 檔案 | 用途 |
|------|------|
| `使用說明.html` | 內容。改說明就改這個檔 |
| `manual.css` | 版面（A4、頁碼、表格、提示框） |
| `build_manual.py` | 產生 PDF |
| `links.private.html` | 試算表與雲端硬碟的連結。**不進版控**，因為 GitHub 專案是公開的 |
| `out/` | 產生的 PDF。**不進版控**，因為含私人連結 |

## 更新步驟

1. 編輯 `使用說明.html`，並更新封面的「最後更新」日期。
2. 執行 `python docs/manual_src/build_manual.py`（需要 Chrome 或 Edge）。
3. 打開 `out/` 裡的 PDF 檢查版面。
4. 上傳到雲端硬碟 For Website，把舊的那一份移到垃圾桶。

沒有 `links.private.html` 時也能產生 PDF，但連結總表只會留一行提示。這時可以從雲端硬碟現有的 PDF 抄回連結，另存成 `links.private.html`（格式是兩個 HTML 表格）。
