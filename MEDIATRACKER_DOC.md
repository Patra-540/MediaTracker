# MediaTracker 技術文件

MediaTracker 是一款專為動漫、小說愛好者設計的 Chrome 擴充功能，用於追蹤作品進度、整合資源連結並記錄個人心得。

## 1. 核心功能

### 1.1 作品管理 (Dashboard)
*   **多維度追蹤**：支援「小說 (Novel)」、「漫畫 (Comic)」、「動畫 (Anime)」三種媒體類型的進度記錄。
*   **靈活進度條**：
    *   支援一般文字描述。
    *   特別優化動畫類型的「第 N 季 第 N 集」邏輯，提供專屬輸入框。
*   **資源連結整合**：支援多組 URL，並能根據網域自動顯示美化後的顯示名稱（如：巴哈姆特、愛奇藝等）。
*   **拖曳排序**：支援透過 `⠿` 圖示自由調整作品順序，且在篩選狀態下仍能正確維護完整清單順序。

### 1.2 進階 UI 與 互動
*   **動態目錄 (TOC)**：
    *   位於側邊欄，固定標題並獨立捲動。
    *   **捲動同步高亮**：使用 `IntersectionObserver` 追蹤視窗中央作品，自動點亮對應目錄項。
    *   **目錄自動置中**：高亮的項目會自動滾動至側邊欄中央區域。
    *   **即時計數**：標題旁即時顯示當前篩選後的作品總數。
*   **精確新增**：點擊右下角浮動按鈕 (`+`) 新增作品時，新作品會自動插入在目前瀏覽位置的下方。
*   **編輯彈窗優化**：
    *   **背景鎖定**：開啟時禁止主頁面捲動。
    *   **防誤觸關閉**：選取文字時鼠標移出彈窗不會意外關閉。
    *   **未儲存提醒**：偵測表單變更，關閉前若有未儲存內容會跳出確認視窗。
*   **字體調整**：提供四段字體大小切換 (SM, MD, LG, XL)。

### 1.3 內容格式化 (Markdown Lite)
文字欄位（相關作品、筆記、心得）支援以下語法：
*   **超連結**：`[顯示文字](網址)`
*   **列表**：`-` 或 `*` 開頭自動轉換為清單。
*   **刪除線**：`~~文字~~`
*   **下標**：`~文字~`
*   **自動排版**：中英文間距自動優化、標點符號全形轉換。

### 1.4 資料管理
*   **全域管理**：可統一修改或刪除 Tag 以及「原作載體」標籤，變更將套用到所有作品。
*   **常用網址管理**：可自定義各媒體類型的常用網域與對應名稱。
*   **匯入/匯出**：支援 JSON 格式的完整備份與還原。

---

## 2. 技術架構

### 2.1 檔案結構
*   `manifest.json`: 採用 Chrome Extension MV3 規範。
*   `js/storage.js`: 資料訪問層，封裝 `chrome.storage.local` 操作。
*   `dashboard/`: 管理面板核心。
    *   `dashboard.html`: 結構定義與 Template。
    *   `dashboard.css`: 佈局、側邊欄捲動、彈窗鎖定與美化。
    *   `dashboard.js`: 業務邏輯、`IntersectionObserver` 實作、Markdown 解析器。

### 2.2 資料模型 (Entry Schema)
```typescript
interface MediaEntry {
  id: string;
  title: string;
  originalMedium: string; // 如：Novel, Comic, Game
  watchingTime: { start: string; end: string; };
  otherNames: string[];
  tags: string[];
  novel: MediaDetail;
  comic: MediaEntry;
  anime: MediaDetail;
  relatedWorks: string;
  notes: string;
  thoughts: string;
  updatedAt: number;
}

interface MediaDetail {
  progress: { desc: string; val: string; }[];
  urls: { desc: string; val: string; }[];
}
```

---

## 3. UI 設計規範
*   **主色調**：Google Blue (`#1a73e8`) 與 Slate Grey (`#2c3e50`)。
*   **字體**：系統預設無襯線字體，行高 1.5。
*   **對齊**：篩選標籤設有固定寬度 (`90px - 100px`) 以確保垂直對齊。
*   **URL 斷行**：使用 `word-break: break-all` 防止長網址破壞佈局。

## 4. 待開發/建議清單
*   搜尋框即時過濾（目前需點擊搜尋按鈕）。
*   多裝置同步 (需改用 `chrome.storage.sync`)。
*   暗色模式支援。
