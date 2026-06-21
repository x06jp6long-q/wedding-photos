# 婚禮照片上傳平台 - 設定指南

## 1. 安裝依賴

```bash
cd wedding-photos
npm install
```

## 2. 設定 Google Drive API

### 步驟一：建立 Google Cloud 專案
1. 前往 https://console.cloud.google.com/
2. 建立新專案（例如「wedding-photos」）
3. 左側選單 → 「API 和服務」→「資料庫」
4. 搜尋「Google Drive API」→ 點擊「啟用」

### 步驟二：建立 OAuth 憑證
1. 左側選單 → 「API 和服務」→「憑證」
2. 點擊「建立憑證」→「OAuth 用戶端 ID」
3. 如果尚未設定同意畫面，先設定：
   - 使用者類型選「外部」
   - 填寫應用程式名稱（例如「婚禮照片」）
   - 測試使用者加入你自己的 Gmail
4. 建立 OAuth 用戶端 ID：
   - 應用程式類型：「網頁應用程式」
   - 已授權的重新導向 URI：`http://localhost:3000/auth/callback`
5. 下載 JSON 檔案，命名為 `credentials.json` 放到專案根目錄

### 步驟三：首次授權
1. 執行 `npm start`
2. 終端機會顯示一個授權網址，用瀏覽器開啟
3. 登入你的 Google 帳號並授權
4. 授權完成後會自動產生 `token.json`
5. 之後啟動就不需要再授權了

## 3. 啟動伺服器

```bash
npm start
```

伺服器預設在 http://localhost:3000 啟動。

## 4. 產生 QR Code

瀏覽器開啟 `http://localhost:3000/qrcode?host=你的實際網址`

例如：`http://localhost:3000/qrcode?host=https://wedding.example.com`

把產生的 QR Code 列印出來放在婚禮會場即可。

## 5. 部署建議

### 方案 A：用 Synology NAS
- 在 NAS 上安裝 Node.js 套件（套件中心搜尋）
- 或使用 Docker（推薦）
- 設定 NAS 的反向代理，綁定一個網域名稱

### 方案 B：用 ngrok 臨時公開
- 安裝 ngrok: https://ngrok.com/
- 執行 `ngrok http 3000`
- 把產生的公開網址做成 QR Code

## 注意事項
- 照片會上傳到你 Google Drive 中的「婚禮照片」資料夾
- 檔名格式：`賓客名字_時間戳.jpg`
- 單次最多 20 張照片
- `credentials.json` 和 `token.json` 包含你的帳號資訊，請勿外洩
