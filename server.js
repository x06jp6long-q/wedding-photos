const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');
const QRCode = require('qrcode');

const app = express();
const upload = multer({ dest: 'uploads/' });

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

let accessToken = null;
let refreshToken = null;
let tokenExpiry = 0;
let folderId = null;
let credentials = null;

function loadCredentials() {
  if (process.env.GOOGLE_CLIENT_ID) {
    credentials = {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    };
    refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    tokenExpiry = 0;
  } else {
    const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const c = raw.installed || raw.web;
    credentials = {
      client_id: c.client_id,
      client_secret: c.client_secret,
      redirect_uri: c.redirect_uris[0],
    };
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      accessToken = token.access_token;
      refreshToken = token.refresh_token;
      tokenExpiry = token.expiry_date || 0;
    }
  }
}

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function refreshAccessToken() {
  if (Date.now() < tokenExpiry - 60000) return;

  const postData = querystring.stringify({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
  }, postData);

  if (res.data.access_token) {
    accessToken = res.data.access_token;
    tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  }
}

async function driveRequest(method, pathStr, body, contentType) {
  await refreshAccessToken();

  const options = {
    hostname: 'www.googleapis.com',
    path: pathStr,
    method,
    headers: { 'Authorization': `Bearer ${accessToken}` },
  };

  let postData = null;
  if (body && contentType) {
    postData = typeof body === 'string' ? body : JSON.stringify(body);
    options.headers['Content-Type'] = contentType;
    options.headers['Content-Length'] = Buffer.byteLength(postData);
  }

  return httpsRequest(options, postData);
}

function uploadFileToDrive(filePath, fileName, mimeType, parentId) {
  return new Promise(async (resolve, reject) => {
    await refreshAccessToken();

    const metadata = JSON.stringify({ name: fileName, parents: [parentId] });
    const fileData = fs.readFileSync(filePath);
    const boundary = '--------boundary' + Date.now();

    const bodyParts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ];
    const bodyEnd = `\r\n--${boundary}--`;

    const multipartBody = Buffer.concat([
      Buffer.from(bodyParts[0]),
      Buffer.from(bodyParts[1]),
      fileData,
      Buffer.from(bodyEnd),
    ]);

    const req = https.request({
      hostname: 'www.googleapis.com',
      path: '/upload/drive/v3/files?uploadType=multipart',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': multipartBody.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(multipartBody);
    req.end();
  });
}

async function getOrCreateFolder(name) {
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveRequest('GET', `/drive/v3/files?q=${q}&fields=files(id)`);

  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

  const createRes = await driveRequest('POST', '/drive/v3/files?fields=id', {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }, 'application/json');

  return createRes.data.id;
}

async function initDrive() {
  loadCredentials();

  if (refreshToken) {
    await refreshAccessToken();
    folderId = await getOrCreateFolder('婚禮照片');
    console.log(`Google Drive 已連線，資料夾 ID: ${folderId}`);
  } else {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + querystring.stringify({
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/drive.file',
      response_type: 'code',
      client_id: credentials.client_id,
      redirect_uri: credentials.redirect_uri,
    });
    console.log('\n========================================');
    console.log('首次使用，請在瀏覽器開啟以下網址進行授權：');
    console.log(authUrl);
    console.log('========================================\n');

    app.get('/auth/callback', async (req, res) => {
      const code = req.query.code;
      if (!code) return res.send('缺少授權碼');
      try {
        const postData = querystring.stringify({
          code,
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
          redirect_uri: credentials.redirect_uri,
          grant_type: 'authorization_code',
        });
        const tokenRes = await httpsRequest({
          hostname: 'oauth2.googleapis.com',
          path: '/token',
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
        }, postData);

        if (tokenRes.data.error) throw new Error(tokenRes.data.error_description || tokenRes.data.error);

        accessToken = tokenRes.data.access_token;
        refreshToken = tokenRes.data.refresh_token;
        tokenExpiry = Date.now() + (tokenRes.data.expires_in * 1000);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenRes.data, null, 2));

        folderId = await getOrCreateFolder('婚禮照片');
        console.log(`Google Drive 授權成功，資料夾 ID: ${folderId}`);
        res.send('授權成功！你可以關閉此頁面。');
      } catch (err) {
        console.error('授權失敗:', err.message);
        res.send('授權失敗: ' + err.message);
      }
    });
  }
}

// --- API ---
const publicPath = path.join(__dirname, 'public');
console.log(`靜態檔案目錄: ${publicPath}, 存在: ${fs.existsSync(publicPath)}`);
app.use(express.static(publicPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', publicExists: fs.existsSync(publicPath), files: fs.existsSync(publicPath) ? fs.readdirSync(publicPath) : [] });
});

app.post('/upload', upload.array('photos', 500), async (req, res) => {
  if (!accessToken) return res.status(503).json({ error: 'Google Drive 尚未授權' });

  const guestName = req.body.name || '匿名賓客';
  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(file.originalname) || '.jpg';
      const fileName = `${guestName}_${timestamp}${ext}`;

      await uploadFileToDrive(file.path, fileName, file.mimetype, folderId);
      results.push(fileName);
    } catch (err) {
      console.error(`上傳失敗 [${file.originalname}]:`, err.message);
      errors.push({ file: file.originalname, error: err.message });
    } finally {
      fs.unlink(file.path, () => {});
    }
  }

  res.json({ uploaded: results.length, failed: errors.length, errors });
});

app.get('/qrcode', async (req, res) => {
  const host = req.query.host || `${req.protocol}://${req.headers.host}`;
  const svg = await QRCode.toString(host, { type: 'svg' });
  res.type('svg').send(svg);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`伺服器啟動: http://localhost:${PORT}`);
  await initDrive();
});
