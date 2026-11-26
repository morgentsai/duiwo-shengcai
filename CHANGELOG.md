# 版本紀錄（對我生財）

每次推上 GitHub Pages 的更新都記在這裡。時間為台北時間。

## 2026-11-26（發薪日區塊）

- 總覽的「發薪日資金分流」改成只在每月 5 號（發薪日）顯示，其他日子隱藏。發薪日日期設定在 src/pages/Overview.tsx 的 PAYDAY。
- 離線快取版本號升到 duiwo-shengcai-v4。

## 2026-11-26（新圖示）

- App 圖示換成「對我生財」金色古錢幣：紅底、金光放射與霧化光暈（全尺寸：180、64、192、512、maskable 512）。
- 離線快取版本號升到 duiwo-shengcai-v3。

## 2026-11-26（修正）

- 修正 iPhone 桌面圖示打開出現 404：App 設定檔（manifest）、離線快取（sw.js）與圖示改用相對路徑，起始頁指向 /duiwo-shengcai/。
- 離線快取版本號升到 duiwo-shengcai-v2。

## 2026-11-26

- **14:00**：`2fe5b3a` 補上 `.gitignore`、`.oxlintrc.json`，觸發部署成功。
- **13:51**：手動上傳合併版檔案（合併單機版與雲端同步），部署成功。
- **13:15**：設定 GitHub Pages 自動部署（GitHub Actions），首次部署成功。

### 本次版本內容
- 合併「最新單機版」與雲端同步功能。
- 雲端同步：Google 登入（Supabase），資料存在每位使用者自己的資料列，有 RLS 保護。
- 設定頁新增「雲端同步」區塊：登入、立即同步、登出。
- App 名稱統一為「對我生財」。
- 網站網址：https://morgentsai.github.io/duiwo-shengcai/
