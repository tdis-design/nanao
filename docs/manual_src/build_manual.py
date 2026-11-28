"""產生「00_南澳知識圖譜_使用說明_日期.pdf」。

用法（在任何目錄都可以執行）：
    python docs/manual_src/build_manual.py

做的事：
    1. 讀取同資料夾的 使用說明.html。
    2. 把其中的 <!--PRIVATE_LINKS--> 換成 links.private.html 的內容。
       雲端硬碟連結不放在公開的 GitHub，這個檔不進版控；
       找不到時改放一行提示。
    3. 用 Chrome 或 Edge 的無頭模式列印成 A4 PDF，輸出到 out/。
產生的 PDF 含私人連結，不要 commit；
請上傳到雲端硬碟 For Website，取代舊的一份。
"""

import datetime
import pathlib
import subprocess
import sys

PROJECT_NAME = "南澳知識圖譜"
HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / "使用說明.html"
PRIVATE = HERE / "links.private.html"
PLACEHOLDER = "<!--PRIVATE_LINKS-->"
MISSING_NOTE = (
    '<div class="box warn"><span class="t">本版本沒有附私人連結</span>'
    "<p>試算表與雲端硬碟的連結，"
    "見雲端硬碟 For Website 資料夾裡的使用說明 PDF。</p></div>"
)
BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]


def find_browser():
    """回傳第一個存在的 Chrome／Edge 執行檔路徑。"""
    for path in BROWSERS:
        if pathlib.Path(path).exists():
            return path
    sys.exit("找不到 Chrome 或 Edge，請安裝其中一個，或把路徑加進 BROWSERS。")


def main():
    """套入私人連結，列印成 PDF。"""
    html = SOURCE.read_text(encoding="utf-8")
    if PLACEHOLDER not in html:
        sys.exit("使用說明.html 裡找不到 " + PLACEHOLDER)
    links = (
        PRIVATE.read_text(encoding="utf-8")
        if PRIVATE.exists()
        else MISSING_NOTE
    )
    if not PRIVATE.exists():
        print("提醒：沒有 links.private.html，PDF 不含試算表與雲端硬碟連結。")

    # 暫存檔放在同資料夾，CSS 的相對路徑才找得到
    temp = HERE / "_build.html"
    temp.write_text(html.replace(PLACEHOLDER, links), encoding="utf-8")

    out_dir = HERE / "out"
    out_dir.mkdir(exist_ok=True)
    today = datetime.date.today().isoformat()
    out = out_dir / ("00_" + PROJECT_NAME + "_使用說明_" + today + ".pdf")
    try:
        subprocess.run(
            [
                find_browser(),
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                "--print-to-pdf=" + str(out),
                temp.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
    finally:
        temp.unlink(missing_ok=True)
    print("完成：" + str(out))


if __name__ == "__main__":
    main()
