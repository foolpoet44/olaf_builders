/**
 * server.js — Meeting Recorder 웹 서버 (Windows Server 버전)
 * - AI 파싱은 Azure VM으로 포워딩
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { execFile, spawn } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;
const DB_FILE = path.join(__dirname, 'data', 'records.json');
const AUDIO_DIR = path.join(__dirname, 'data', 'audio');

// Azure VM AI 서버 주소
const AZURE_AI_SERVER = 'https://prihr.com';

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
const MEMBERS_FILE = path.join(__dirname, 'data', 'members.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch(e) {
    return {
      smtp: { host:'smtp.gmail.com', port:587, secure:false, user:'seoheeshin2@gmail.com', pass:'figs bwfo umrf ppro' },
      admin: { user:'admin', pass:'lge12345!' }
    };
  }
}
function writeConfig(data) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2)); }

function readMembers() {
  try { return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8')); }
  catch(e) { return []; }
}
function writeMembers(data) { fs.writeFileSync(MEMBERS_FILE, JSON.stringify(data, null, 2)); }

if (!fs.existsSync(CONFIG_FILE)) writeConfig(readConfig());
if (!fs.existsSync(MEMBERS_FILE)) writeMembers([]);

const AUTH_CODES = {};
const SESSIONS = {};
const ADMIN_SESSIONS = {};

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function genToken() {
  return require('crypto').randomBytes(24).toString('hex');
}

function nameFromEmail(email) {
  const local = email.split('@')[0];
  return local;
}

const nodemailer = require('nodemailer');

// PowerShell + Outlook COM으로 사내 lge.com 메일 발송
function sendViaOutlook(toEmail, subject, bodyText) {
  return new Promise((resolve, reject) => {
    // PowerShell 스크립트: 이미 로그인된 Outlook COM 객체 활용
    const ps = `
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.To = "${toEmail}"
$mail.Subject = "${subject.replace(/"/g, '`"')}"
$mail.Body = "${bodyText.replace(/"/g, '`"').replace(/\n/g, '`n')}"
$mail.Send()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null
Write-Output "OK"
`.trim();
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 15000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout.trim());
      }
    );
  });
}

function getTransporter() {
  const cfg = readConfig();
  const s = cfg.smtp || {};
  const opts = {
    host: s.host || 'smtp.gmail.com',
    port: s.port || 587,
    secure: s.secure || false,
    tls: { rejectUnauthorized: false },
  };
  // 사내 SMTP(lgekrhqsy01.lge.com:25)는 인증을 사용하지 않음.
  // auth.user/pass가 있을 때만 인증 설정을 추가한다.
  if (s.user && s.pass) {
    opts.auth = { user: s.user, pass: s.pass };
  }
  return nodemailer.createTransport(opts);
}

async function sendAuthEmail(toEmail, code) {
  const name = nameFromMember(toEmail);

  // 1순위: PowerShell Outlook COM (사내 lge.com 발송)
  try {
    const subject = '[LG전자 생산기술원] 로그인 인증코드';
    const body = [
      `안녕하세요, ${name}님`,
      '',
      '아래 인증코드를 prihr.com 로그인 화면에 입력해주세요.',
      '',
      `  인증코드: ${code}`,
      '',
      
      '본인이 요청하지 않은 경우 이 메일을 무시해주세요.',
      '',
      '— LG전자 생산기술원 HR 시스템 자동 발송'
    ].join('\n');
    await sendViaOutlook(toEmail, subject, body);
    console.log(`[auth] Outlook COM 발송 성공 → ${toEmail}`);
    return;
  } catch(e) {
    console.warn('[auth] Outlook COM 발송 실패, Gmail fallback:', e.message);
  }

  // 2순위: Gmail SMTP fallback
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#A50034;padding:28px 40px;text-align:center;">
            <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">LG전자 생산기술원</div>
            <div style="color:rgba(255,255,255,0.85);font-size:14px;margin-top:4px;">회의록 메이커 시스템</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <div style="font-size:24px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">🔐 로그인 인증코드</div>
            <div style="font-size:16px;color:#444;margin-bottom:28px;">안녕하세요, <strong>${name}</strong>님</div>
            <div style="font-size:15px;color:#555;margin-bottom:20px;">아래 인증코드를 로그인 화면에 입력해주세요.</div>
            <div style="background:#f8f0f2;border:2px solid #A50034;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <div style="font-size:42px;font-weight:700;letter-spacing:12px;color:#A50034;font-family:monospace;">${code}</div>
            </div>
            <div style="background:#fff8f0;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:20px;">
            </div>
            <div style="font-size:13px;color:#888;line-height:1.8;">
              본인이 요청하지 않은 경우 이 메일을 무시해주세요.<br>
              인증코드는 타인과 공유하지 마세요.
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8f8;padding:20px 40px;border-top:1px solid #eee;text-align:center;">
            <div style="font-size:12px;color:#aaa;">LG전자 생산기술원 시스템 자동 발송</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const cfg = readConfig();
  // 발신 주소: smtp.from 우선, 없으면 smtp.user (사내 SMTP는 @lge.com 주소 사용)
  const smtpFrom = (cfg.smtp || {}).from || (cfg.smtp || {}).user || 'seoheeshin2@gmail.com';
  await getTransporter().sendMail({
    from: `"LG전자 생산기술원 PRI-Vibe log" <${smtpFrom}>`,
    to:   toEmail,
    subject: '[LG전자 생산기술원] 로그인 인증코드',
    html,
  });
}

function getSession(req) {
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (!m) return null;
  const token = m[1];
  const sess = SESSIONS[token];
  if (!sess) return null;
  if (Date.now() > sess.expires) { delete SESSIONS[token]; return null; }
  return sess;
}

function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`);
}

function getAdminSession(req) {
  // 1) Bearer 토큰 (localStorage 방식)
  const bearer = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (bearer && ADMIN_SESSIONS[bearer]) {
    const s = ADMIN_SESSIONS[bearer];
    if (Date.now() > s.expires) { delete ADMIN_SESSIONS[bearer]; }
    else return s;
  }
  // 2) 쿠키 방식
  const cookie = req.headers['cookie'] || '';
  const m = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
  if (!m) return null;
  const token = m[1];
  const sess = ADMIN_SESSIONS[token];
  if (!sess) return null;
  if (Date.now() > sess.expires) { delete ADMIN_SESSIONS[token]; return null; }
  return sess;
}
function setAdminCookie(res, token, maxAgeSec) {
  res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`);
}

function nameFromMember(email) {
  const members = readMembers();
  const m = members.find(m => m.email && m.email.toLowerCase() === email.toLowerCase());
  return m ? m.name : email.split('@')[0];
}

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return []; }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function readBodyRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buf, boundary) {
  const sep = Buffer.from('--' + boundary);
  const files = [];
  const fields = {};
  let pos = 0;

  while (pos < buf.length) {
    let start = buf.indexOf(sep, pos);
    if (start === -1) break;
    start += sep.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    start += 2;

    const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headerStr = buf.slice(start, headerEnd).toString('utf8');

    let nextSep = buf.indexOf(sep, headerEnd + 4);
    if (nextSep === -1) nextSep = buf.length;
    const bodyBuf = buf.slice(headerEnd + 4, nextSep - 2);

    const dispMatch  = headerStr.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    const fnameMatch = headerStr.match(/Content-Disposition:[^\r\n]*filename="([^"]+)"/i);
    const ctMatch    = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (dispMatch) {
      const name = dispMatch[1];
      if (fnameMatch) {
        files.push({
          fieldName:   name,
          filename:    fnameMatch[1],
          contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          data:        bodyBuf,
        });
      } else {
        fields[name] = bodyBuf.toString('utf8');
      }
    }
    pos = nextSep;
  }
  return { files, fields };
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, status, data) {
  setCORS(res);
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Connection': 'close'
  });
  res.end(body);
}

function sanitizeBprBody(body) {
  if (!body || typeof body !== 'object') return body;
  const clean = (v) => {
    if (typeof v === 'string') {
      return v
        .replace(/\uFFFD/g, '')
        .replace(/\uFFFE/g, '')
        .replace(/\uFFFF/g, '')
        .replace(/[\uD800-\uDFFF]/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    }
    if (Array.isArray(v)) return v.map(clean).filter(s => typeof s !== 'string' || s.trim());
    return v;
  };
  const result = {};
  for (const [k, v] of Object.entries(body)) result[k] = clean(v);
  return result;
}

/* ── Azure VM으로 AI 요청 포워딩 ── */
// raw Buffer를 그대로 Azure에 전송 (JSON 재직렬화 없음)
async function proxyToAzureRaw(apiPath, rawBuf, contentType, timeoutMs, extraHeaders) {
  // HTTP 직접 연결 (SSL 우회) — 사내 PC → Azure VM 8080 포트
  const http = require('http');
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': contentType || 'application/json',
      'Content-Length': rawBuf.length,
      ...(extraHeaders || {}),
    };
    const options = {
      hostname: '13.66.167.38',
      port: 8080,
      path: apiPath,
      method: 'POST',
      timeout: timeoutMs || 120000,
      headers,
    };
    const req2 = http.request(options, (res2) => {
      const chunks = [];
      res2.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res2.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ ok: res2.statusCode < 400, status: res2.statusCode, data: JSON.parse(raw) }); }
        catch(e) { resolve({ ok: false, status: res2.statusCode, data: { error: raw } }); }
      });
    });
    req2.on('timeout', () => { req2.destroy(); reject(new Error('Azure VM 응답 타임아웃')); });
    req2.on('error', reject);
    req2.write(rawBuf);
    req2.end();
  });
}

async function proxyToAzure(apiPath, bodyData, cookie, timeoutMs, httpMethod, extraHeaders) {
  const https = require('https');
  const _timeout = timeoutMs || 300000;
  const _method = httpMethod || 'POST';
  return new Promise((resolve, reject) => {
    const postData = (bodyData && _method !== 'GET' && _method !== 'DELETE')
      ? JSON.stringify(bodyData) : '';
    const azureUrl = new URL(AZURE_AI_SERVER + apiPath);
    const headers = {
      'Cookie': cookie || '',
      ...(extraHeaders || {}),
    };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const options = {
      hostname: azureUrl.hostname,
      port: azureUrl.port || 443,
      path: azureUrl.pathname,
      method: _method,
      timeout: _timeout,
      headers,
      rejectUnauthorized: false,
    };
    const req2 = https.request(options, (res2) => {
      const chunks = [];
      res2.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res2.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const contentType = res2.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          resolve({ ok: res2.statusCode < 400, status: res2.statusCode, raw });
        } else {
          try { resolve({ ok: res2.statusCode < 400, status: res2.statusCode, data: JSON.parse(raw) }); }
          catch(e) { resolve({ ok: false, status: res2.statusCode, data: { error: raw } }); }
        }
      });
    });
    req2.on('timeout', () => { req2.destroy(); reject(new Error('Azure VM 응답 타임아웃')); });
    req2.on('error', reject);
    if (postData) req2.write(postData);
    req2.end();
  });
}

/* ── 서버 ── */
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method   = req.method;

  setCORS(res);

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── orghealth 프록시: / 및 /api/admin/* 제외한 모든 요청 → orghealth (127.0.0.1:3000) ──
  // lgprihr.lge.com:8080 접속 → 조직건강도 로그인/서비스로 투명 프록시
  console.log('[req]', method, pathname);
  // windows_server.js 자체 API만 isOwnApi=true (나머지는 orghealth로 프록시)
  const isOwnApi = pathname === '/api/auth/send-code'
    || pathname === '/api/auth/verify'
    || pathname === '/api/auth/logout'
    || pathname === '/api/auth/me'
    || pathname === '/api/admin/records'
    || pathname.match(/^\/api\/admin\/records\//)
    || pathname === '/api/admin/hosting'
    || pathname.match(/^\/api\/admin\/hosting\//)
    || pathname === '/api/admin/send-email'
    || pathname === '/api/send-news-mail'
    || pathname === '/api/admin/ai-proxy'
    || pathname.startsWith('/api/records')
    || pathname.startsWith('/api/parse')
    || pathname.startsWith('/api/ai-proxy')
    || pathname.startsWith('/api/transcribe')
    || pathname.startsWith('/h/')
    || pathname.startsWith('/bpr/')
    || pathname.startsWith('/slide_previews/')
    || pathname.startsWith('/tech/')
    || pathname === '/admin_dl.html'
    || pathname === '/api/self-update'
    || pathname === '/api/stock';


  // GET /api/stock — Yahoo Finance 직접 (사내 PC → 외부 직접 호출)
  if (pathname === '/api/stock' && method === 'GET') {
    const sym = req.url.split('sym=')[1] ? decodeURIComponent(req.url.split('sym=')[1].split('&')[0]) : '066570.KS';
    const rh = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' };
    try {
      const stockData = await new Promise((resolve, reject) => {
        require('https').get({
          hostname: 'query1.finance.yahoo.com',
          path: '/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=30m&range=5d',
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (r) => {
          const chunks = [];
          r.on('data', c => chunks.push(c));
          r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(e) { reject(e); } });
        }).on('error', reject).setTimeout(8000, function(){ this.destroy(); reject(new Error('timeout')); });
      });
      const r0 = stockData.chart && stockData.chart.result && stockData.chart.result[0];
      const meta = r0 && r0.meta;
      if (!meta) { res.writeHead(200, rh); res.end(JSON.stringify({ error: 'no data' })); return; }
      const price = meta.regularMarketPrice || meta.previousClose || 0;
      const prev = meta.previousClose || meta.chartPreviousClose || price;
      const change = price - prev;
      const changePct = prev ? (change / prev * 100) : 0;
      let spark = [];
      try { spark = ((r0.indicators && r0.indicators.quote && r0.indicators.quote[0] && r0.indicators.quote[0].close) || []).filter(v => v != null).slice(-60); } catch(e) {}
      res.writeHead(200, rh);
      res.end(JSON.stringify({ price: Math.round(price), change: Math.round(change), changePct: changePct.toFixed(2), symbol: sym, spark }));
    } catch(e) {
      res.writeHead(200, rh);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (!isOwnApi) {
    const proxyHeaders = { ...req.headers, host: 'seoheeshin2-c59b8b56-3660-vm.westus2.cloudapp.azure.com' };
    // 프록시 시 문제 일으키는 헤더 제거
    delete proxyHeaders['transfer-encoding'];
    delete proxyHeaders['connection'];
    const proxyReq = require('https').request({
      hostname: '13.66.167.38',
      port: 8880,
      path: req.url,
      method: req.method,
      headers: proxyHeaders,
      rejectUnauthorized: false
    }, proxyRes => {
      // Set-Cookie의 Secure 플래그 제거 (HTTP 사내망에서 쿠키 저장되도록)
      const headers = { ...proxyRes.headers };
      if (headers['set-cookie']) {
        headers['set-cookie'] = (Array.isArray(headers['set-cookie'])
          ? headers['set-cookie']
          : [headers['set-cookie']]
        ).map(c => c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax'));
      }
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', e => {
      console.error('[proxy-orghealth] 오류:', e.message);
      res.writeHead(502); res.end('orghealth 연결 실패');
    });
    req.pipe(proxyReq);
    return;
  }

  // POST /api/auth/send-code
  if (pathname === '/api/auth/send-code' && method === 'POST') {
    const body  = await readBody(req);
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      sendJSON(res, 400, { error: '유효한 이메일 주소를 입력해주세요.' });
      return;
    }
    const members = readMembers();
    const member  = members.find(m => m.email && m.email.toLowerCase() === email);
    if (!member) {
      sendJSON(res, 403, { error: '등록된 멤버가 아닙니다. 관리자에게 문의하세요.' });
      return;
    }
    const dept      = (member.dept || '').trim();
    const isHrMember = dept.startsWith('생산기술HR실') || dept === '생산기술원 교육파견';
    if (!isHrMember) {
      sendJSON(res, 403, { error: '생산기술HR실 구성원만 이용할 수 있습니다.' });
      return;
    }
    const code    = genCode();
    const expires = Date.now() + 10 * 60 * 1000;
    AUTH_CODES[email] = { code, expires };
    try {
      await sendAuthEmail(email, code);
      sendJSON(res, 200, { ok: true, message: '인증코드를 발송했습니다.' });
    } catch(e) {
      console.error('[auth] 이메일 발송 실패:', e.message);
      sendJSON(res, 500, { error: '이메일 발송에 실패했습니다.' });
    }
    return;
  }

  // POST /api/auth/verify
  if (pathname === '/api/auth/verify' && method === 'POST') {
    const body  = await readBody(req);
    const email = (body.email || '').trim().toLowerCase();
    const code  = (body.code  || '').trim();
    const entry = AUTH_CODES[email];
    if (!entry) { sendJSON(res, 401, { error: '인증코드를 먼저 요청해주세요.' }); return; }
    if (Date.now() > entry.expires) {
      delete AUTH_CODES[email];
      sendJSON(res, 401, { error: '인증코드가 만료되었습니다.' });
      return;
    }
    if (entry.code !== code) { sendJSON(res, 401, { error: '인증코드가 올바르지 않습니다.' }); return; }
    delete AUTH_CODES[email];
    const token = genToken();
    const name  = nameFromMember(email);
    const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
    SESSIONS[token] = { email, name, expires: Date.now() + SESSION_TTL };
    setSessionCookie(res, token, 7 * 24 * 60 * 60);
    sendJSON(res, 200, { ok: true, email, name });
    return;
  }

  // POST /api/auth/logout
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const cookie = req.headers['cookie'] || '';
    const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (m) delete SESSIONS[m[1]];
    setSessionCookie(res, '', 0);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // GET /api/auth/me
  if (pathname === '/api/auth/me' && method === 'GET') {
    // 1) Bearer 토큰 방식 (orghealth localStorage 토큰) → orghealth 서버에 프록시
    const bearerToken = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    if (bearerToken) {
      const proxyHeaders = { ...req.headers, host: 'seoheeshin2-c59b8b56-3660-vm.westus2.cloudapp.azure.com' };
      delete proxyHeaders['transfer-encoding'];
      delete proxyHeaders['connection'];
      const proxyReq = require('https').request({
        hostname: '13.66.167.38', port: 8880, path: '/api/auth/me', method: 'GET',
        headers: proxyHeaders, rejectUnauthorized: false
      }, proxyRes => {
        const headers = { ...proxyRes.headers };
        if (headers['set-cookie']) {
          headers['set-cookie'] = (Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']])
            .map(c => c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax'));
        }
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => sendJSON(res, 502, { error: 'proxy error' }));
      req.pipe(proxyReq);
      return;
    }
    // 2) 쿠키 방식 (기존)
    const sess = getSession(req);
    if (sess) {
      const memberName = nameFromMember(sess.email);
      sendJSON(res, 200, { authenticated: true, email: sess.email, name: memberName });
      return;
    }
    const adminSess = getAdminSession(req);
    if (adminSess) {
      sendJSON(res, 200, { authenticated: true, email: 'admin', name: '관리자', isAdmin: true });
      return;
    }
    sendJSON(res, 401, { authenticated: false, error: 'unauthorized' });
    return;
  }

  // POST /api/admin/login
  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const cfg  = readConfig();
    if (body.user === (cfg.admin?.user || 'admin') && body.pass === (cfg.admin?.pass || 'lge12345!')) {
      const token = genToken();
      ADMIN_SESSIONS[token] = { expires: Date.now() + 24 * 60 * 60 * 1000 };
      setAdminCookie(res, token, 24 * 60 * 60);
      sendJSON(res, 200, { ok: true, token }); // token을 body에도 포함
    } else {
      sendJSON(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    return;
  }

  // POST /api/admin/logout
  if (pathname === '/api/admin/logout' && method === 'POST') {
    const cookie = req.headers['cookie'] || '';
    const m = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
    if (m) delete ADMIN_SESSIONS[m[1]];
    setAdminCookie(res, '', 0);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // GET /api/admin/me
  if (pathname === '/api/admin/me' && method === 'GET') {
    const sess = getAdminSession(req);
    if (!sess) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    sendJSON(res, 200, { ok: true });
    return;
  }

  // GET /api/admin/config
  if (pathname === '/api/admin/config' && method === 'GET') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    sendJSON(res, 200, readConfig());
    return;
  }

  // POST /api/admin/config
  if (pathname === '/api/admin/config' && method === 'POST') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const body = await readBody(req);
    const cfg  = readConfig();
    if (body.smtp)  cfg.smtp  = { ...cfg.smtp,  ...body.smtp };
    if (body.admin) cfg.admin = { ...cfg.admin, ...body.admin };
    writeConfig(cfg);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // GET /api/admin/members
  if (pathname === '/api/admin/members' && method === 'GET') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    sendJSON(res, 200, readMembers());
    return;
  }

  // POST /api/admin/members
  if (pathname === '/api/admin/members' && method === 'POST') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const body     = await readBody(req);
    const incoming = Array.isArray(body) ? body : (body.members || []);
    const existing = readMembers();
    const map = {};
    existing.forEach(m => { if (m.email) map[m.email.toLowerCase()] = m; });
    incoming.forEach(m => {
      if (m.email) map[m.email.toLowerCase()] = { name: m.name||'', email: m.email, dept: m.dept||'', position: m.position||'' };
    });
    const merged = Object.values(map);
    writeMembers(merged);
    sendJSON(res, 200, { ok: true, count: merged.length });
    return;
  }

  // DELETE /api/admin/members/:email
  const matchMember = pathname.match(/^\/api\/admin\/members\/(.+)$/);
  if (matchMember && method === 'DELETE') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const targetEmail = decodeURIComponent(matchMember[1]).toLowerCase();
    const members = readMembers().filter(m => (m.email||'').toLowerCase() !== targetEmail);
    writeMembers(members);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // GET /api/admin/records
  if (pathname === '/api/admin/records' && method === 'GET') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const records = readDB();
    const sorted  = records.slice().sort((a, b) => b.created_at - a.created_at);
    sendJSON(res, 200, sorted);
    return;
  }

  // DELETE /api/admin/records/:id
  const matchAdminDel = pathname.match(/^\/api\/admin\/records\/([^/]+)$/);
  if (matchAdminDel && method === 'DELETE') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    let records = readDB();
    const before = records.length;
    records = records.filter(r => r.id !== matchAdminDel[1]);
    if (records.length === before) { sendJSON(res, 404, { error: 'Not found' }); return; }
    writeDB(records);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // ── HTML 배포 API (VM 프록시) ──────────────────────────────
  const HOSTING_TOKEN = 'lge-hosting-internal-2026';

  // GET /api/admin/hosting
  if (pathname === '/api/admin/hosting' && method === 'GET') {
    const isHostingAuth = getAdminSession(req) || req.headers['x-hosting-token'] === HOSTING_TOKEN;
    if (!isHostingAuth) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    try {
      // ★ 사내PC 세션으로 사용자 식별 → x-owner-email 헤더로 Azure에 전달 (본인 배포만 조회)
      const _ck = req.headers['cookie'] || '';
      const _sessG = getSession(req);
      const _ownerG = (_sessG ? (_sessG.email || '').toLowerCase() : '')
        || (req.headers['x-owner-email'] || '').toLowerCase().trim()
        || (getAdminSession(req) ? 'admin' : '');
      const _hdrG = { 'x-hosting-token': HOSTING_TOKEN };
      if (_ownerG) _hdrG['x-owner-email'] = _ownerG;
      const result = await proxyToAzure('/api/admin/hosting', null, _ck, 30000, 'GET', _hdrG);
      sendJSON(res, result.ok ? 200 : 500, result.ok ? result.data : { error: JSON.stringify(result) });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/admin/hosting
  if (pathname === '/api/admin/hosting' && method === 'POST') {
    const isHostingAuth = getAdminSession(req) || req.headers['x-hosting-token'] === HOSTING_TOKEN;
    if (!isHostingAuth) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    // ★ multipart/form-data(파일 업로드)는 JSON 파싱하지 말고 raw 그대로 Azure로 통과
    //   (Azure server.js가 multipart를 직접 처리 + owner 기록). 쿠키/토큰/원본 Content-Type 전달.
    const _ctIn = (req.headers['content-type'] || '');
    if (_ctIn.includes('multipart/form-data')) {
      try {
        const rawBufM = await readBodyRaw(req);
        const _ckM = req.headers['cookie'] || '';
        // ★ 사내PC 세션으로 업로더 식별 → Azure에 x-owner-email 헤더로 명시 전달
        //   (사내PC와 Azure는 세션을 공유하지 않으므로 쿠키만으론 식별 불가)
        const _sessM = getSession(req);
        // 세션 있으면 세션 이메일, 없으면 클라이언트(orghealth 로그인)가 보낸 x-owner-email 사용
        const _ownerM = (_sessM ? (_sessM.email || '').toLowerCase() : '')
          || (req.headers['x-owner-email'] || '').toLowerCase().trim()
          || (getAdminSession(req) ? 'admin' : '');
        const _hdrM = { 'x-hosting-token': HOSTING_TOKEN, 'Cookie': _ckM };
        if (_ownerM) _hdrM['x-owner-email'] = _ownerM;
        const resultM = await proxyToAzureRaw('/api/admin/hosting', rawBufM, _ctIn, 180000, _hdrM);
        // D:\save 자동 저장은 Azure가 처리(saveToIntranet). 여기선 응답만 전달.
        sendJSON(res, resultM.ok ? 200 : (resultM.status || 500), resultM.ok ? resultM.data : (resultM.data || { error: 'Azure 배포 실패' }));
      } catch(e) { sendJSON(res, 500, { error: e.message }); }
      return;
    }
    try {
      const rawBuf = await readBodyRaw(req);
      const rawStr = rawBuf.toString('utf8');
      console.log('[hosting-win] rawBuf.length:', rawBuf.length, '앞50자:', rawStr.slice(0,50));
      let body = {};
      try { body = JSON.parse(rawStr); } catch(e) {
        console.error('[hosting-win] JSON 파싱 실패:', e.message, '앞100자:', rawStr.slice(0,100));
        sendJSON(res, 400, { error: 'JSON 파싱 실패: ' + e.message }); return;
      }
      const { filename, html, fileBase64, contentType, slug } = body;
      console.log('[hosting-win] filename:', filename, 'html길이:', (html||'').length, 'base64길이:', (fileBase64||'').length);
      if (!filename) { sendJSON(res, 400, { error: '파일명이 필요합니다.' }); return; }
      if (!html && !fileBase64) { sendJSON(res, 400, { error: '파일 내용이 필요합니다.' }); return; }

      // ── 슬러그/ID 생성 ──
      const { randomUUID } = require('crypto');
      let id = (slug && /^[a-zA-Z0-9가-힣_-]{1,60}$/.test(slug)) ? slug : randomUUID();

      // ── Azure VM으로 전달 (소용량 메타데이터만 + 실제 파일은 스트림으로) ──
      // 파일이 크면 직접 로컬 D:\https에 저장 후 Azure에 notify
      const fileSizeMB = rawBuf.length / 1024 / 1024;
      let result;
      if (fileSizeMB > 5) {
        // 5MB 초과: D:\https 에 직접 저장 → Cloudflare Pages 배포 트리거
        const HTTPS_DIR = 'D:\\https';
        const destPath = path.join(HTTPS_DIR, filename);
        if (html) {
          fs.writeFileSync(destPath, html, 'utf8');
        } else if (fileBase64) {
          fs.writeFileSync(destPath, Buffer.from(fileBase64, 'base64'));
        }
        console.log('[hosting] 대용량 파일 D:\\https 직접 저장:', filename, Math.round(fileSizeMB) + 'MB');
        const vmUrl = 'https://prihr.com/h/' + id;
        result = { ok: true, data: { ok: true, id, url: vmUrl, vmUrl, cfUrl: null, renamed: false, newId: id } };
      } else {
        // 5MB 이하: 기존 방식으로 Azure 전달 (★ owner 식별용 쿠키 전달)
        const _ckP = req.headers['cookie'] || '';
        result = await proxyToAzureRaw('/api/admin/hosting', rawBuf, 'application/json', 120000, { 'x-hosting-token': HOSTING_TOKEN, 'Cookie': _ckP });
      }

      // D:\save 자동 저장
      try {
        const SAVE_DIR = 'D:\\save';
        if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
        const safeName = path.basename(filename).replace(/[\\/:*?"<>|]/g, '_');
        const savePath = path.join(SAVE_DIR, safeName);
        if (html) { fs.writeFileSync(savePath, html, 'utf8'); }
        else if (fileBase64) { fs.writeFileSync(savePath, Buffer.from(fileBase64, 'base64')); }
        console.log('[D:\\save] 저장 완료:', safeName);
      } catch(se) { console.warn('[D:\\save] 저장 실패:', se.message); }

      sendJSON(res, result.ok ? 200 : 500, result.ok ? result.data : { error: JSON.stringify(result) });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // DELETE /api/admin/hosting/:id
  const matchHostingDel = pathname.match(/^\/api\/admin\/hosting\/([^/]+)$/);
  if (matchHostingDel && method === 'DELETE') {
    const isHostingAuth = getAdminSession(req) || req.headers['x-hosting-token'] === HOSTING_TOKEN;
    if (!isHostingAuth) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    try {
      // ★ 본인 항목만 삭제 가능하도록 요청자 식별 정보 전달
      const _ckD = req.headers['cookie'] || '';
      const _sessD = getSession(req);
      const _ownerD = (_sessD ? (_sessD.email || '').toLowerCase() : '')
        || (req.headers['x-owner-email'] || '').toLowerCase().trim()
        || (getAdminSession(req) ? 'admin' : '');
      const _hdrD = { 'x-hosting-token': HOSTING_TOKEN };
      if (_ownerD) _hdrD['x-owner-email'] = _ownerD;
      const result = await proxyToAzure('/api/admin/hosting/' + matchHostingDel[1], {}, _ckD, 30000, 'DELETE', _hdrD);
      sendJSON(res, result.ok ? 200 : 500, result.ok ? result.data : { error: JSON.stringify(result) });
    } catch(e) { sendJSON(res, 500, { error: e.message }); }
    return;
  }

  // GET /h/:id — VM에서 HTML 받아서 서빙
  const matchHostingServe = pathname.match(/^\/h\/([^/]+)$/);
  if (matchHostingServe) {
    const result = await proxyToAzure('/h/' + matchHostingServe[1], null, '', 10000, 'GET');
    if (result.ok && result.raw) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(result.raw);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>404 - 페이지를 찾을 수 없습니다.</h2>');
    }
    return;
  }
  // ── HTML 배포 API 끝 ────────────────────────────────────────

  // POST /api/self-update — VM에서 최신 windows_server.js 받아서 자기 자신 업데이트 후 재시작
  if (pathname === '/api/self-update' && method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, message: '업데이트 시작. 3초 후 서비스 재시작됩니다.' }));
    setTimeout(async () => {
      try {
        const https = require('https');
        const fs2 = require('fs');
        const selfPath = __filename;
        const backupPath = selfPath + '.bak';
        // 백업
        fs2.copyFileSync(selfPath, backupPath);
        // VM에서 최신 파일 다운로드
        const file = fs2.createWriteStream(selfPath + '.new');
        await new Promise((resolve, reject) => {
          https.get({
            hostname: '13.66.167.38',
            port: 8880,
            path: '/windows_server.js',
            headers: { host: 'seoheeshin2-c59b8b56-3660-vm.westus2.cloudapp.azure.com' },
            rejectUnauthorized: false
          }, r => { r.pipe(file); file.on('finish', () => { file.close(); resolve(); }); }).on('error', reject);
        });
        fs2.renameSync(selfPath + '.new', selfPath);
        // 서비스 재시작
        require('child_process').exec('net stop prihr-main && timeout /t 2 && net start prihr-main');
      } catch(e) {
        console.error('[self-update] 오류:', e.message);
      }
    }, 500);
    return;
  }

  // POST /api/send-news-mail  — Azure(OrgHealth)가 호출하는 뉴스레터 발송 중계
  //   사내 PC에서 사내 SMTP(lgekrhqsy01.lge.com:25)로 발송한다.
  //   인증: x-relay-token 헤더 == config.relay_token
  //   body: { subject, html, recipients:[{email,name?}] | [email,...], from? }
  //   대량 발송 규정 준수: 사외(@lge.com 아닌) 주소는 5,000건/hr 로 자동 분할 지연.
  if (pathname === '/api/send-news-mail' && method === 'POST') {
    const cfg = readConfig();
    const token = req.headers['x-relay-token'] || '';
    if (!cfg.relay_token || token !== cfg.relay_token) {
      sendJSON(res, 401, { error: 'invalid relay token' }); return;
    }
    const body = await readBody(req);
    const { subject, html } = body;
    let recipients = body.recipients;
    if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
      sendJSON(res, 400, { error: '필수 파라미터 누락 (subject, html, recipients)' }); return;
    }
    const list = recipients.map(r => (typeof r === 'string') ? { email: r } : r)
                           .filter(r => r && r.email && r.email.includes('@'));
    if (list.length === 0) { sendJSON(res, 400, { error: '유효한 수신자 없음' }); return; }

    const smtpFrom = body.from || (cfg.smtp||{}).from || (cfg.smtp||{}).user || '';
    const transporter = getTransporter();
    const EXT_MIN_INTERVAL_MS = Math.ceil(3600 * 1000 / 5000); // 사외 5,000건/hr = 720ms
    let sent = 0, failed = 0;
    const errors = [];
    let lastExtSendAt = 0;

    for (const r of list) {
      const isExternal = !r.email.toLowerCase().endsWith('@lge.com');
      if (isExternal) {
        const wait = lastExtSendAt + EXT_MIN_INTERVAL_MS - Date.now();
        if (wait > 0) await new Promise(rs => setTimeout(rs, wait));
        lastExtSendAt = Date.now();
      }
      try {
        await transporter.sendMail({
          from: `"LG전자 생산기술원 PRI-Vibe log" <${smtpFrom}>`,
          to: r.email, subject, html
        });
        sent++;
      } catch(e) {
        failed++; errors.push({ to: r.email, msg: e.message });
        console.error('[news-mail]', r.email, e.message);
      }
    }
    console.log(`[news-mail] 완료 sent=${sent} failed=${failed}`);
    sendJSON(res, 200, { ok: true, sent, failed, errors: errors.slice(0, 20) });
    return;
  }

  // POST /api/admin/send-email
  if (pathname === '/api/admin/send-email' && method === 'POST') {
    if (!getAdminSession(req)) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const body = await readBody(req);
    const { subject, html, recipients } = body;
    if (!subject || !html || !Array.isArray(recipients) || recipients.length === 0) {
      sendJSON(res, 400, { error: '필수 파라미터 누락' }); return;
    }
    const cfg       = readConfig();
    const smtpFrom  = (cfg.smtp||{}).from || (cfg.smtp||{}).user || '';
    const transporter = getTransporter();
    let sent = 0, failed = 0;
    for (const to of recipients) {
      try {
        await transporter.sendMail({ from: `"LG전자 생산기술원 PRI-Vibe log" <${smtpFrom}>`, to, subject, html });
        sent++;
      } catch(e) { console.error('[admin mail]', to, e.message); failed++; }
    }
    sendJSON(res, 200, { ok: true, sent, failed });
    return;
  }

  // BP ARCHIVE API
  if (pathname.startsWith('/api/bpr')) {
    const sess = getSession(req) || getAdminSession(req);
    if (!sess) { sendJSON(res, 401, { error: 'unauthorized' }); return; }

    const SUPABASE_URL = 'https://qnkcprwubnceupmaznlz.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_97jaZhrEZ1r-gOtRX3bFhQ_aMAY8BIj';
    const https = require('https');

    function supabaseReq(method2, path2, body2, extraHeaders = {}) {
      return new Promise((resolve, reject) => {
        const u        = new URL(SUPABASE_URL + path2);
        const postData = body2 ? JSON.stringify(body2) : null;
        const options  = {
          hostname: u.hostname,
          path:     u.pathname + u.search,
          method:   method2,
          headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type':  'application/json',
            'Prefer':        method2 === 'POST' ? 'return=representation' : '',
            ...extraHeaders,
          },
        };
        if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData);
        const reqS = https.request(options, resS => {
          let raw = '';
          resS.on('data', c => raw += c);
          resS.on('end', () => {
            try { resolve({ status: resS.statusCode, data: JSON.parse(raw) }); }
            catch(e) { resolve({ status: resS.statusCode, data: raw }); }
          });
        });
        reqS.on('error', reject);
        if (postData) reqS.write(postData);
        reqS.end();
      });
    }

    const matchBprGet = pathname.match(/^\/api\/bpr\/reports\/([^/]+)$/);
    if (matchBprGet && method === 'GET') {
      const id   = matchBprGet[1];
      const r    = await supabaseReq('GET', `/rest/v1/bp_reports?id=eq.${id}&select=*`, null);
      const item = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!item) { sendJSON(res, 404, { error: 'not found' }); return; }
      sendJSON(res, 200, item);
      return;
    }

    if (pathname === '/api/bpr/reports' && method === 'GET') {
      const r = await supabaseReq('GET', '/rest/v1/bp_reports?select=*&order=date.desc', null);
      sendJSON(res, r.status, r.data);
      return;
    }

    if (pathname === '/api/bpr/reports' && method === 'POST') {
      let body = sanitizeBprBody(await readBody(req));
      delete body.author_email;
      const r = await supabaseReq('POST', '/rest/v1/bp_reports', body);
      const okStatus = (r.status === 200 || r.status === 201) ? 200 : r.status;
      const payload  = Array.isArray(r.data) ? r.data[0] : r.data;
      if (okStatus === 200) {
        sendJSON(res, 200, { ok: true, data: payload });
      } else {
        sendJSON(res, okStatus, { error: (payload && payload.message) || '저장 실패', detail: payload });
      }
      return;
    }

    const matchBprPatch = pathname.match(/^\/api\/bpr\/reports\/([^/]+)$/);
    if (matchBprPatch && method === 'PATCH') {
      const id   = matchBprPatch[1];
      const body = sanitizeBprBody(await readBody(req));
      const r    = await supabaseReq('PATCH', `/rest/v1/bp_reports?id=eq.${id}`, body, { 'Prefer': 'return=representation' });
      const item = Array.isArray(r.data) ? r.data[0] : r.data;
      sendJSON(res, r.status === 204 ? 200 : r.status, item || { ok: true });
      return;
    }

    const matchBprDel = pathname.match(/^\/api\/bpr\/reports\/([^/]+)$/);
    if (matchBprDel && method === 'DELETE') {
      const id = matchBprDel[1];
      await supabaseReq('DELETE', `/rest/v1/bp_reports?id=eq.${id}`, null);
      sendJSON(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/bpr/me' && method === 'GET') {
      const members = readMembers();
      const m       = members.find(x => x.email && x.email.toLowerCase() === (sess.email||'').toLowerCase());
      const dept    = (m && m.dept) ? m.dept : '';
      const isHr    = dept.startsWith('생산기술HR실') || dept === '생산기술원 교육파견';
      sendJSON(res, 200, { email: sess.email, name: sess.name || (m && m.name) || '', dept, isHr, position: m ? m.position||'' : '' });
      return;
    }

    sendJSON(res, 404, { error: 'not found' });
    return;
  }

  // GET /api/records
  if (pathname === '/api/records' && method === 'GET') {
    const sess = getSession(req);
    if (!sess) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const records = readDB();
    const visible = records.filter(r => r.user_email === sess.email || r.user_email === '__shared__');
    const sorted  = visible.slice().sort((a, b) => b.created_at - a.created_at);
    sendJSON(res, 200, sorted);
    return;
  }

  // POST /api/records
  if (pathname === '/api/records' && method === 'POST') {
    const sess = getSession(req);
    if (!sess) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const body   = await readBody(req);
    const records = readDB();
    const record  = {
      id:             body.record_id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      user_email:     sess.email,
      user_name:      sess.name,
      title:          body.title || '회의록',
      date:           body.date  || new Date().toISOString().slice(0,10),
      transcript:     body.transcript || '',
      summary:        body.summary    || '',
      template:       body.template   || 'lge',
      slide_count:    body.slide_count || 0,
      word_count:     body.word_count  || 0,
      memo:           body.memo   || '',
      tags:           body.tags   || [],
      audio_path:     body.audio_path || '',
      slides:         body.slides  || [],
      agenda:         body.agenda  || [],
      attendees:      body.attendees || '',
      datetime_place: body.datetime_place || '',
      created_at:     Date.now(),
    };
    const existIdx = records.findIndex(r => r.id === record.id && r.user_email === sess.email);
    if (existIdx >= 0) {
      records[existIdx] = { ...records[existIdx], ...record };
    } else {
      records.push(record);
    }
    writeDB(records);
    sendJSON(res, 201, record);
    return;
  }

  // POST /api/upload_audio
  if (pathname === '/api/upload_audio' && method === 'POST') {
    const ct2 = req.headers['content-type'] || '';
    const bm2 = ct2.match(/boundary=([^\s;]+)/);
    if (!bm2) { sendJSON(res, 400, { error: 'multipart boundary 없음' }); return; }
    const rawBuf2 = await readBodyRaw(req);
    const { files: files2, fields: fields2 } = parseMultipart(rawBuf2, bm2[1]);
    const audioFile = files2.find(f => f.fieldName === 'audio');
    if (!audioFile) { sendJSON(res, 400, { error: '음성 파일 없음' }); return; }
    const recordId = (fields2.record_id || '').trim();
    const ext3     = path.extname(audioFile.filename || '.webm') || '.webm';
    const audioId  = recordId || `audio_${Date.now()}`;
    const audioSavePath = path.join(AUDIO_DIR, `${audioId}${ext3}`);
    if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
    fs.writeFileSync(audioSavePath, audioFile.data);
    if (recordId) {
      const records3 = readDB();
      const rec3 = records3.find(r => r.id === recordId);
      if (rec3) { rec3.audio_path = audioSavePath; writeDB(records3); }
    }
    console.log(`[upload_audio] 저장: ${audioSavePath}`);
    setCORS(res);
    sendJSON(res, 200, { ok: true, record_id: recordId, audio_path: audioSavePath, size: audioFile.data.length });
    return;
  }

  // GET|HEAD /api/records/:id/audio
  const matchAudio = pathname.match(/^\/api\/records\/([^/]+)\/audio$/);
  if (matchAudio && (method === 'GET' || method === 'HEAD')) {
    const records = readDB();
    const record  = records.find(r => r.id === matchAudio[1]);
    if (!record) { sendJSON(res, 404, { error: 'Not found' }); return; }
    const ap = record.audio_path;
    if (!ap || !fs.existsSync(ap)) {
      const found = fs.readdirSync(AUDIO_DIR).find(f => f.startsWith(matchAudio[1]) && !f.endsWith('.txt'));
      if (!found) { sendJSON(res, 404, { error: '원본 파일 없음' }); return; }
      const fullPath = path.join(AUDIO_DIR, found);
      const ext2     = path.extname(found);
      const mime2    = ext2 === '.ogg' ? 'audio/ogg' : ext2 === '.mp3' ? 'audio/mpeg' : ext2 === '.wav' ? 'audio/wav' : 'audio/webm';
      setCORS(res);
      res.writeHead(200, { 'Content-Type': mime2, 'Content-Disposition': 'inline' });
      if (method === 'HEAD') { res.end(); return; }
      fs.createReadStream(fullPath).pipe(res);
      return;
    }
    const ext2  = path.extname(ap);
    const mime2 = ext2 === '.ogg' ? 'audio/ogg' : ext2 === '.mp3' ? 'audio/mpeg' : ext2 === '.wav' ? 'audio/wav' : 'audio/webm';
    setCORS(res);
    res.writeHead(200, { 'Content-Type': mime2, 'Content-Disposition': 'inline' });
    if (method === 'HEAD') { res.end(); return; }
    fs.createReadStream(ap).pipe(res);
    return;
  }

  // GET /api/records/:id
  const matchGet = pathname.match(/^\/api\/records\/([^/]+)$/);
  if (matchGet && method === 'GET') {
    const sess = getSession(req);
    if (!sess) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    const records = readDB();
    const record  = records.find(r => r.id === matchGet[1] && (r.user_email === sess.email || r.user_email === '__shared__'));
    if (!record) { sendJSON(res, 404, { error: 'Not found' }); return; }
    sendJSON(res, 200, record);
    return;
  }

  // DELETE /api/records/:id
  const matchDel = pathname.match(/^\/api\/records\/([^/]+)$/);
  if (matchDel && method === 'DELETE') {
    const sess = getSession(req);
    if (!sess) { sendJSON(res, 401, { error: 'unauthorized' }); return; }
    let records  = readDB();
    const before = records.length;
    records = records.filter(r => !(r.id === matchDel[1] && (r.user_email === sess.email || r.user_email === '__shared__')));
    if (records.length === before) { sendJSON(res, 404, { error: 'Not found' }); return; }
    writeDB(records);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // ★ POST /api/parse_transcript — Azure VM 인증없는 프록시로 포워딩
  if (pathname === '/api/parse_transcript' && method === 'POST') {
    const body = await readBody(req);
    console.log('[parse_transcript] Azure VM 프록시로 포워딩...');
    try {
      body._target = '/api/parse_transcript';
      const result = await proxyToAzure('/api/ai-proxy/parse', body, '');
      sendJSON(res, result.status, result.data);
    } catch(e) {
      console.error('[parse_transcript] Azure 포워딩 실패:', e.message);
      sendJSON(res, 500, { error: 'AI 서버 연결 실패: ' + e.message });
    }
    return;
  }

  // ★ POST /api/parse_transcript_full — Azure VM 인증없는 프록시로 포워딩
  if (pathname === '/api/parse_transcript_full' && method === 'POST') {
    const body = await readBody(req);
    console.log('[parse_transcript_full] Azure VM 프록시로 포워딩...');
    try {
      body._target = '/api/parse_transcript_full';
      const result = await proxyToAzure('/api/ai-proxy/parse', body, '');
      sendJSON(res, result.status, result.data);
    } catch(e) {
      console.error('[parse_transcript_full] Azure 포워딩 실패:', e.message);
      sendJSON(res, 500, { error: 'AI 서버 연결 실패: ' + e.message });
    }
    return;
  }

  // ★ POST /api/transcribe_media — Azure VM으로 포워딩 (multipart)
  if (pathname === '/api/transcribe_media' && method === 'POST') {
    const ct = req.headers['content-type'] || '';
    const boundaryMatch = ct.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) { sendJSON(res, 400, { error: 'multipart boundary 없음' }); return; }

    console.log('[transcribe_media] Azure VM으로 포워딩...');
    const rawBuf = await readBodyRaw(req);
    const https  = require('https');

    const azureUrl = new URL(AZURE_AI_SERVER + '/api/transcribe_media');
    const options  = {
      hostname: azureUrl.hostname,
      port:     azureUrl.port || 443,
      path:     azureUrl.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   ct,
        'Content-Length': rawBuf.length,
        'Cookie':         req.headers['cookie'] || '',
      },
      rejectUnauthorized: false,
    };
    const proxyReq = https.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          sendJSON(res, proxyRes.statusCode, JSON.parse(data));
        } catch(e) {
          sendJSON(res, proxyRes.statusCode, { error: data });
        }
      });
    });
    proxyReq.on('error', (e) => {
      sendJSON(res, 500, { error: 'Azure STT 서버 연결 실패: ' + e.message });
    });
    proxyReq.write(rawBuf);
    proxyReq.end();
    return;
  }

  // ★ POST /api/generate_lge_pptx — Azure VM으로 포워딩
  if (pathname === '/api/generate_lge_pptx' && method === 'POST') {
    const body = await readBody(req);
    console.log('[generate_lge_pptx] Azure VM으로 포워딩...');
    const https    = require('https');
    const postData = JSON.stringify(body);
    const azureUrl = new URL(AZURE_AI_SERVER + '/api/generate_lge_pptx');
    const options  = {
      hostname: azureUrl.hostname,
      port:     azureUrl.port || 443,
      path:     azureUrl.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cookie':         req.headers['cookie'] || '',
      },
      rejectUnauthorized: false,
    };
    const proxyReq = https.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        const buf = Buffer.concat(chunks);
        setCORS(res);
        res.writeHead(proxyRes.statusCode, {
          'Content-Type':        proxyRes.headers['content-type'] || 'application/octet-stream',
          'Content-Disposition': proxyRes.headers['content-disposition'] || 'attachment',
          'Content-Length':      buf.length,
        });
        res.end(buf);
      });
    });
    proxyReq.on('error', (e) => {
      sendJSON(res, 500, { error: 'Azure PPTX 서버 연결 실패: ' + e.message });
    });
    proxyReq.write(postData);
    proxyReq.end();
    return;
  }

  // ★ POST /api/generate_ai_slides — Azure VM으로 포워딩
  if (pathname === '/api/generate_ai_slides' && method === 'POST') {
    const body = await readBody(req);
    console.log('[generate_ai_slides] Azure VM으로 포워딩...');
    try {
      const result = await proxyToAzure('/api/generate_ai_slides', body, req.headers['cookie']);
      sendJSON(res, result.status, result.data);
    } catch(e) {
      sendJSON(res, 500, { error: 'AI 서버 연결 실패: ' + e.message });
    }
    return;
  }

  /* ====== /api/admin/* /api/push/* 중 로컬에서 처리 못 한 것 → orghealth로 프록시 ====== */
  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/public') || pathname.startsWith('/api/push')) {
    const proxyHeaders = { ...req.headers, host: 'seoheeshin2-c59b8b56-3660-vm.westus2.cloudapp.azure.com' };
    delete proxyHeaders['transfer-encoding'];
    delete proxyHeaders['connection'];
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const proxyReq = require('https').request({
        hostname: '13.66.167.38', port: 8880, path: req.url, method,
        headers: { ...proxyHeaders, 'content-length': body.length }, rejectUnauthorized: false
      }, proxyRes => {
        const h = { ...proxyRes.headers };
        if (h['set-cookie']) {
          h['set-cookie'] = (Array.isArray(h['set-cookie']) ? h['set-cookie'] : [h['set-cookie']])
            .map(c => c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, '; SameSite=Lax'));
        }
        res.writeHead(proxyRes.statusCode, h);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', () => sendJSON(res, 502, { error: 'orghealth proxy error' }));
      if (body.length) proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  /* ====== 정적 파일 ====== */
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const PUBLIC_PATHS = ['/login.html', '/login', '/setup_prihr.bat', '/caddy-root.crt', '/install_hosts.bat', '/server_dl.js', '/index_dl.html', '/admin_dl.html', '/meeting_dl.html'];
  const isAdminPage  = (pathname === '/admin.html');
  const isPublic     = PUBLIC_PATHS.includes(pathname)
    || pathname.startsWith('/css/')
    || pathname.startsWith('/js/')
    || pathname.startsWith('/fonts/')
    || pathname.startsWith('/fa-css/')
    || pathname.startsWith('/bpr/css/')
    || pathname.startsWith('/bpr/js/')
    || pathname.startsWith('/bpr/fonts/')
    || pathname.startsWith('/bpr/fa-css/')
    || pathname.startsWith('/slide_previews/')
    || pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|woff2?|ttf)$/i);

  // admin.html, 일반 페이지 모두 — 인증은 클라이언트 JS에서 처리
  // (localStorage Bearer 토큰 방식)

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      const idx = path.join(filePath, 'index.html');
      if (fs.existsSync(idx)) {
        filePath = idx;
      } else {
        res.writeHead(404); res.end('Not found'); return;
      }
    }

    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err2, data) => {
      if (err2) { res.writeHead(500); res.end('Server error'); return; }
      setCORS(res);
      const mimeWithCharset = (mime.startsWith('text/') || mime === 'application/javascript' || mime === 'application/json')
        ? mime.includes('charset') ? mime : mime + '; charset=utf-8'
        : mime;
      res.writeHead(200, {
        'Content-Type':        mimeWithCharset,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control':       'no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate',
        'Pragma':              'no-cache',
        'Expires':             '-1',
        'Surrogate-Control':   'no-store',
        'Vary':                '*',
      });
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[AI Slide Maker] Server running at http://0.0.0.0:${PORT}`);
});

// ── D:\https 폴더 자동 감시 → Cloudflare 자동 배포 ──────────────
const WATCH_DIR = 'D:\\https';
const WATCH_DONE_FILE = path.join(__dirname, 'data', 'auto_hosted.json');
const HOSTING_TOKEN_AUTO = 'lge-hosting-internal-2026';

function readAutoDone() {
  try { return JSON.parse(fs.readFileSync(WATCH_DONE_FILE, 'utf8')); } catch { return {}; }
}
function writeAutoDone(data) {
  fs.writeFileSync(WATCH_DONE_FILE, JSON.stringify(data, null, 2));
}

// 확장자 → MIME 타입
const MIME_MAP = {
  'html': 'text/html', 'htm': 'text/html',
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
  'png': 'image/png', 'gif': 'image/gif',
  'webp': 'image/webp', 'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'mp4': 'video/mp4', 'webm': 'video/webm',
  'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
  'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
  'pdf': 'application/pdf',
};
const HTML_EXTS  = ['html', 'htm'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi'];
const MEDIA_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS];
const SUPPORTED_EXTS = Object.keys(MIME_MAP);

// 미디어 배치 대기 큐 (3초 디바운스)
let _mediaBatchQueue = [];   // 대기 중인 파일 경로 목록
let _mediaBatchTimer = null; // 디바운스 타이머

// 여러 미디어 파일을 갤러리 HTML로 묶어서 한 링크로 배포
async function deployMediaBatch(filePaths) {
  const done = readAutoDone();

  // 이미 배포된 파일 제외
  const newFiles = filePaths.filter(fp => {
    try {
      const stat = fs.statSync(fp);
      const key = fp + '_' + stat.mtimeMs;
      return !done[key];
    } catch { return false; }
  });
  if (newFiles.length === 0) return;

  console.log(`[auto-deploy] 미디어 ${newFiles.length}개 갤러리 배포 시작`);

  // 각 파일을 Base64로 인코딩해서 data URI 생성
  const items = [];
  for (const fp of newFiles) {
    const filename = path.basename(fp);
    const ext = filename.split('.').pop().toLowerCase();
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    try {
      const buf = fs.readFileSync(fp);
      const b64 = buf.toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;
      items.push({ filename, ext, mime, dataUri, isVideo: VIDEO_EXTS.includes(ext) });
    } catch(e) {
      console.error(`[auto-deploy] 파일 읽기 실패: ${filename}`, e.message);
    }
  }
  if (items.length === 0) return;

  // 파일이 1개면 단독 페이지, 여러 개면 균등 그리드 갤러리
  const title = items.length === 1
    ? items[0].filename
    : `미디어 ${items.length}개`;

  // 그리드 열 수: 1→1, 2→2, 3~4→2, 5+→3
  const cols = items.length === 1 ? 1 : items.length <= 4 ? 2 : 3;

  const itemsHtml = items.map(it => {
    if (it.isVideo) {
      return `
        <div class="media-item">
          <video controls preload="metadata">
            <source src="${it.dataUri}" type="${it.mime}">
            영상을 재생할 수 없습니다.
          </video>
          <div class="media-name">${it.filename}</div>
        </div>`;
    } else {
      return `
        <div class="media-item">
          <img src="${it.dataUri}" alt="${it.filename}" loading="lazy">
          <div class="media-name">${it.filename}</div>
        </div>`;
    }
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111;color:#fff;font-family:'Malgun Gothic',sans-serif;min-height:100vh;padding:20px}
h1{text-align:center;font-size:16px;color:#aaa;margin-bottom:20px;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;max-width:1200px;margin:0 auto}
.media-item{background:#1e1e1e;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.media-item img{width:100%;height:auto;display:block;object-fit:contain;max-height:70vh}
.media-item video{width:100%;display:block;max-height:70vh;background:#000}
.media-name{padding:8px 10px;font-size:12px;color:#888;text-align:center;word-break:break-all}
@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<h1>${title}</h1>
<div class="grid">${itemsHtml}</div>
</body>
</html>`;

  // 슬러그: 파일 1개면 파일명, 여러 개면 날짜시간
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const slug = items.length === 1
    ? items[0].filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9가-힣]/g,'-').replace(/-+/g,'-').slice(0,40)
    : `media-${ts}`;

  try {
    const rawBuf2 = Buffer.from(JSON.stringify({ filename: slug + '.html', html, slug }), 'utf8');
    const result = await proxyToAzureRaw('/api/admin/hosting',
      rawBuf2, 'application/json', 120000,
      { 'x-hosting-token': HOSTING_TOKEN_AUTO }
    );

    if (result.ok && result.data && (result.data.url || result.data.cfUrl || result.data.vmUrl)) {
      const url = result.data.cfUrl || result.data.vmUrl || result.data.url;
      console.log(`[auto-deploy] 갤러리 배포 완료 (${items.length}개): ${url}`);
      // 배포된 파일들 done에 기록
      const done2 = readAutoDone();
      for (const fp of newFiles) {
        try {
          const stat = fs.statSync(fp);
          const key = fp + '_' + stat.mtimeMs;
          done2[key] = { filename: path.basename(fp), url, time: Date.now() };
        } catch {}
      }
      writeAutoDone(done2);
    } else {
      console.log(`[auto-deploy] 갤러리 배포 실패:`, JSON.stringify(result.data));
    }
  } catch(e) {
    console.error(`[auto-deploy] 갤러리 오류:`, e.message);
  }
}

// HTML 단독 배포
async function autoDeployHtml(filePath) {
  const filename = path.basename(filePath);
  const done = readAutoDone();
  const stat = fs.statSync(filePath);
  const key = filePath + '_' + stat.mtimeMs;
  if (done[key]) return;

  console.log(`[auto-deploy] HTML 감지: ${filename}`);
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const slug = filename.replace(/\.[^.]+$/, '').toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').slice(0, 40);

    const rawBuf = Buffer.from(JSON.stringify({ filename, html, slug }), 'utf8');
    const result = await proxyToAzureRaw('/api/admin/hosting',
      rawBuf, 'application/json', 120000,
      { 'x-hosting-token': HOSTING_TOKEN_AUTO }
    );
    if (result.ok && result.data && (result.data.url || result.data.cfUrl || result.data.vmUrl)) {
      const url = result.data.cfUrl || result.data.vmUrl || result.data.url;
      console.log(`[auto-deploy] HTML 배포 완료: ${url}`);
      const done2 = readAutoDone();
      done2[key] = { filename, url, time: Date.now() };
      writeAutoDone(done2);
    } else {
      console.log(`[auto-deploy] HTML 배포 실패:`, JSON.stringify(result.data));
    }
  } catch(e) {
    console.error(`[auto-deploy] HTML 오류:`, e.message);
  }
}

// 파일 감지 → 종류에 따라 라우팅
// 폴더 안의 미디어 파일들을 갤러리로 배포
const _deployedFolders = new Set();
async function handleNewFolder(folderPath) {
  const folderName = path.basename(folderPath);
  if (_deployedFolders.has(folderPath)) return;
  _deployedFolders.add(folderPath);

  console.log(`[auto-deploy] 폴더 감지: ${folderName} — 5초 후 배포 시작...`);
  // 파일이 다 복사될 때까지 5초 대기
  await new Promise(r => setTimeout(r, 5000));

  let files = [];
  try { files = fs.readdirSync(folderPath).map(f => path.join(folderPath, f)); } catch { return; }

  const mediaFiles = files.filter(fp => {
    const ext = fp.split('.').pop().toLowerCase();
    return MEDIA_EXTS.includes(ext);
  });
  const htmlFiles = files.filter(fp => {
    const ext = fp.split('.').pop().toLowerCase();
    return HTML_EXTS.includes(ext);
  });

  console.log(`[auto-deploy] 폴더 내 미디어 ${mediaFiles.length}개, HTML ${htmlFiles.length}개 발견`);
  htmlFiles.forEach(fp => autoDeployHtml(fp));
  if (mediaFiles.length > 0) deployMediaBatch(mediaFiles);
}

function handleNewFile(filePath) {
  // 폴더인 경우
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      handleNewFolder(filePath);
      return;
    }
  } catch { return; }

  const filename = path.basename(filePath);
  const ext = filename.split('.').pop().toLowerCase();
  if (!SUPPORTED_EXTS.includes(ext)) return;

  if (HTML_EXTS.includes(ext)) {
    // HTML은 바로 단독 배포
    autoDeployHtml(filePath);
  } else if (MEDIA_EXTS.includes(ext)) {
    // 이미지/영상은 큐에 쌓고 3초 디바운스 후 일괄 갤러리 배포
    if (!_mediaBatchQueue.includes(filePath)) {
      _mediaBatchQueue.push(filePath);
    }
    if (_mediaBatchTimer) clearTimeout(_mediaBatchTimer);
    _mediaBatchTimer = setTimeout(() => {
      const batch = [..._mediaBatchQueue];
      _mediaBatchQueue = [];
      _mediaBatchTimer = null;
      deployMediaBatch(batch);
    }, 3000);
  }
}

function startWatcher() {
  // 서버 재시작 시 auto_hosted.json 초기화 → 기존 파일도 재스캔
  try { fs.writeFileSync(WATCH_DONE_FILE, '{}'); } catch(e) {}

  if (!fs.existsSync(WATCH_DIR)) {
    console.log(`[auto-deploy] 감시 폴더 없음: ${WATCH_DIR} — 폴더 생성 후 자동 시작됩니다.`);
    const timer = setInterval(() => {
      if (fs.existsSync(WATCH_DIR)) {
        clearInterval(timer);
        startWatcher();
      }
    }, 60000);
    return;
  }

  console.log(`[auto-deploy] 감시 시작: ${WATCH_DIR}`);

  // 기존 파일 스캔 (미디어 파일들은 한꺼번에 묶어서 처리)
  const existingFiles = fs.readdirSync(WATCH_DIR).map(f => path.join(WATCH_DIR, f));
  const existingMedia = existingFiles.filter(fp => {
    const ext = fp.split('.').pop().toLowerCase();
    return MEDIA_EXTS.includes(ext);
  });
  const existingHtml = existingFiles.filter(fp => {
    const ext = fp.split('.').pop().toLowerCase();
    return HTML_EXTS.includes(ext);
  });

  // HTML은 각각 배포
  existingHtml.forEach(fp => autoDeployHtml(fp));
  // 기존 미디어는 한꺼번에 갤러리로
  if (existingMedia.length > 0) {
    deployMediaBatch(existingMedia);
  }

  // fs.watch + 폴링 병행 (한글 파일명 감지 안정화)
  let _knownFiles = new Set(fs.readdirSync(WATCH_DIR).map(f => path.join(WATCH_DIR, f)));

  // fs.watch (이벤트 기반)
  try {
    fs.watch(WATCH_DIR, (eventType, filename) => {
      if (!filename) return;
      const filePath = path.join(WATCH_DIR, filename);
      setTimeout(() => {
        if (fs.existsSync(filePath) && !_knownFiles.has(filePath)) {
          _knownFiles.add(filePath);
          handleNewFile(filePath);
        }
      }, 1500);
    });
  } catch(e) {
    console.warn('[auto-deploy] fs.watch 실패, 폴링만 사용:', e.message);
  }

  // 폴링 방식 (3초마다 새 파일/폴더 감지) — 한글 파일명 대응
  setInterval(() => {
    try {
      const current = new Set(fs.readdirSync(WATCH_DIR).map(f => path.join(WATCH_DIR, f)));
      for (const fp of current) {
        if (!_knownFiles.has(fp)) {
          _knownFiles.add(fp);
          console.log(`[auto-deploy] 폴링 감지: ${path.basename(fp)}`);
          setTimeout(() => {
            if (fs.existsSync(fp)) handleNewFile(fp);
          }, 2000);
        }
      }
    } catch(e) {}
  }, 3000);

  console.log(`[auto-deploy] 감시 활성화 — 파일/폴더 모두 감지합니다.`);
}

startWatcher();

// ── D:\tech 폴더 감시 → 서버 tech/ 폴더로 자동 업로드 ──────────────
const TECH_WATCH_DIR = 'D:\\tech';

function uploadTechFile(filePath) {
  const filename = path.basename(filePath);
  const ext = filename.split('.').pop().toLowerCase();
  if (!['mp4','webm','mov','avi','png','jpg','jpeg','pdf','pptx'].includes(ext)) return;
  try {
    const fileSize = fs.statSync(filePath).size;
    const https2 = require('https');
    // Cloudflare 우회: tech/upload는 Azure VM 직접 주소(8888포트)로 전송
    const uploadUrl = new URL('/api/tech/upload', 'https://seoheeshin2-c59b8b56-3660-vm.westus2.cloudapp.azure.com:8888');
    // 스트리밍 업로드 — 파일을 메모리에 올리지 않고 직접 전송 (대용량 mp4 대응)
    const opts = {
      hostname: uploadUrl.hostname,
      port: 8888,
      path: uploadUrl.pathname + '?filename=' + encodeURIComponent(filename),
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
        'x-filename': filename,
      },
      timeout: 1800000  // 30분
    };
    const rq = https2.request(opts, rs => {
      let out = '';
      rs.on('data', d => out += d);
      rs.on('end', () => console.log('[tech-upload] 완료: ' + filename + ' → ' + out.slice(0,80)));
    });
    rq.on('error', e => console.error('[tech-upload] 오류:', e.message));
    rq.on('timeout', () => { rq.destroy(); console.error('[tech-upload] 타임아웃: ' + filename); });
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', e => { rq.destroy(); console.error('[tech-upload] 읽기 오류:', e.message); });
    let sent = 0;
    fileStream.on('data', chunk => {
      sent += chunk.length;
      const pct = Math.round(sent / fileSize * 100);
      if (pct % 10 === 0) console.log('[tech-upload] ' + filename + ' ' + pct + '% (' + Math.round(sent/1024/1024) + 'MB/' + Math.round(fileSize/1024/1024) + 'MB)');
    });
    fileStream.pipe(rq);
    console.log('[tech-upload] 업로드 시작: ' + filename + ' (' + Math.round(fileSize/1024/1024) + 'MB) — 스트리밍');
  } catch(e) { console.error('[tech-upload] 오류:', e.message); }
}

function startTechWatcher() {
  if (!fs.existsSync(TECH_WATCH_DIR)) {
    console.log('[tech-watcher] 폴더 없음: ' + TECH_WATCH_DIR + ' — 30초마다 재시도');
    const t = setInterval(() => { if (fs.existsSync(TECH_WATCH_DIR)) { clearInterval(t); startTechWatcher(); } }, 30000);
    return;
  }
  console.log('[tech-watcher] 감시 시작: ' + TECH_WATCH_DIR);
  // 기존 파일 즉시 업로드
  try {
    fs.readdirSync(TECH_WATCH_DIR).forEach(f => uploadTechFile(path.join(TECH_WATCH_DIR, f)));
  } catch(e) {}
  // 신규 파일 감지 (3초 폴링)
  let _known = new Set();
  try { _known = new Set(fs.readdirSync(TECH_WATCH_DIR).map(f => path.join(TECH_WATCH_DIR, f))); } catch(e) {}
  setInterval(() => {
    try {
      const cur = new Set(fs.readdirSync(TECH_WATCH_DIR).map(f => path.join(TECH_WATCH_DIR, f)));
      for (const fp of cur) {
        if (!_known.has(fp)) {
          console.log('[tech-watcher] 신규 파일: ' + path.basename(fp));
          setTimeout(() => uploadTechFile(fp), 2000);
        }
      }
      _known = cur;
    } catch(e) {}
  }, 3000);
}

startTechWatcher();

// ── D:\save 자동 저장 (prihr.com save_queue 폴링) ──────────────────
const SAVE_DIR = 'D:\\save';
const SAVE_TOKEN = 'lge-save-2026';
const PRIHR_URL = 'https://prihr.com';

function ensureSaveDir() {
  try { if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true }); } catch(e) {}
}

async function fetchSaveQueue() {
  try {
    const https = require('https');
    const pending = await new Promise((resolve, reject) => {
      const req = https.get(`${PRIHR_URL}/api/save/pending`, {
        headers: { 'x-save-token': SAVE_TOKEN }
      }, (res) => {
        // 한글(멀티바이트) 깨짐 방지: Buffer로 모은 뒤 한 번에 UTF-8 디코딩
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch(e) { resolve({ urls: [] }); } });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    for (const item of (pending.urls || [])) {
      await downloadFromUrl(item.url, item.filename);
    }
  } catch(e) {
    console.error('[save-queue] 오류:', e.message);
  }
}

async function downloadFromUrl(fileUrl, origName) {
  try {
    ensureSaveDir();
    const fname = origName || decodeURIComponent(fileUrl.split('/').pop().split('?')[0]) || ('file_' + Date.now() + '.html');
    const safeName = fname.replace(/[<>:"/\\|?*]/g, '_');
    const dest = path.join(SAVE_DIR, safeName);

    await new Promise((resolve, reject) => {
      function doGet(url, depth) {
        if (depth > 5) { reject(new Error('리다이렉트 너무 많음')); return; }
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            res.resume();
            doGet(res.headers.location, depth + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error('status ' + res.statusCode));
            return;
          }
          const ws = fs.createWriteStream(dest);
          res.pipe(ws);
          ws.on('finish', resolve);
          ws.on('error', reject);
        }).on('error', reject);
      }
      doGet(fileUrl, 0);
    });
    console.log(`[save-queue] D:\\save\\${safeName} 저장 완료`);
  } catch(e) {
    console.error(`[save-queue] 저장 실패: ${fileUrl} —`, e.message);
  }
}

// 5초마다 큐 체크
ensureSaveDir();
setInterval(fetchSaveQueue, 5000);
console.log('[save-queue] D:\\save 자동 저장 시작 (5초 간격)');

// ─── 뉴스레터 사내 SMTP 발송 (pull 방식) ─────────────────────
//   Azure 큐에서 대기 뉴스를 가져와 사내 SMTP(lgekrhqsy01.lge.com)로 발송.
//   인증 토큰: config.relay_token (config.json 에 설정).
let _newsSending = false;
async function fetchAndSendNews() {
  if (_newsSending) return;          // 이전 발송이 안 끝났으면 건너뜀
  const cfg = readConfig();
  const token = cfg.relay_token || '';
  if (!token) return;                // 토큰 없으면 비활성

  _newsSending = true;
  try {
    const https = require('https');
    const pending = await new Promise((resolve, reject) => {
      const req = https.get(`${PRIHR_URL}/api/news/pending`, {
        headers: { 'x-relay-token': token }
      }, (res) => {
        // 한글(멀티바이트) 깨짐 방지: chunk를 Buffer로 모은 뒤 한 번에 UTF-8 디코딩.
        // (c => data += c 방식은 chunk 경계에서 한글 3바이트가 잘려 □로 깨짐)
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch(e) { resolve({ items: [] }); } });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    const items = pending.items || [];
    if (items.length === 0) { _newsSending = false; return; }

    const transporter = getTransporter();
    const EXT_MIN_INTERVAL_MS = Math.ceil(3600 * 1000 / 5000); // 사외 5,000건/hr

    for (const item of items) {
      const fromAddr = item.from || (cfg.smtp||{}).from || (cfg.smtp||{}).user || '';
      const list = (item.recipients || [])
        .map(r => (typeof r === 'string') ? { email: r } : r)
        .filter(r => r && r.email && r.email.includes('@'));
      let sent = 0, failed = 0, lastExt = 0;

      for (const r of list) {
        const isExternal = !r.email.toLowerCase().endsWith('@lge.com');
        if (isExternal) {
          const wait = lastExt + EXT_MIN_INTERVAL_MS - Date.now();
          if (wait > 0) await new Promise(rs => setTimeout(rs, wait));
          lastExt = Date.now();
        }
        try {
          /* ★ 2026-10-12 첨부(attachments) · 참조(cc) 지원 추가
             근태현황 리포트처럼 조직별 PDF 를 붙여 보내기 위함.
             · item.attachments = [{ filename, contentBase64 }]
             · 수신자별 첨부가 다르면 r.attachments 가 우선한다.
             · 기존 호출(첨부·참조 없음)은 그대로 동작한다. */
          const _atts = (r.attachments || item.attachments || []).map(a => ({
            filename: a.filename,
            content: Buffer.from(a.contentBase64 || a.content || '', 'base64')
          }));
          const _mail = {
            from: `"LG전자 생산기술원 PRI-Vibe log" <${fromAddr}>`,
            to: r.email,
            subject: r.subject || item.subject,
            html: r.html || item.html
          };
          const _cc = r.cc || item.cc;
          if (_cc) _mail.cc = Array.isArray(_cc) ? _cc.join(', ') : _cc;
          if (_atts.length) _mail.attachments = _atts;
          await transporter.sendMail(_mail);
          sent++;
        } catch(e) { failed++; console.error('[news-send]', r.email, e.message); }
      }
      console.log(`[news-send] id=${item.id} sent=${sent} failed=${failed}`);

      // 발송 완료 보고 → Azure 큐에서 제거
      await new Promise((resolve) => {
        const payload = JSON.stringify({ id: item.id, sent, failed });
        const u = new URL(`${PRIHR_URL}/api/news/sent`);
        const req = https.request({
          hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'x-relay-token': token }
        }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
        req.on('error', () => resolve());
        req.setTimeout(10000, () => { req.destroy(); resolve(); });
        req.write(payload); req.end();
      });
    }
  } catch(e) {
    console.error('[news-send] 오류:', e.message);
  } finally {
    _newsSending = false;
  }
}
// 60초마다 뉴스 큐 체크
setInterval(fetchAndSendNews, 60000);
console.log('[news-send] 뉴스 사내SMTP 발송 대기 시작 (60초 간격)');

// ─── OTP 즉시 발송 (5초 간격) ────────────────────────────────────────────────
let _otpSending = false;
async function fetchAndSendOtp() {
  const cfg = readConfig();
  const token = cfg.relay_token || cfg.internal_token || '';
  if (!token || _otpSending) return;
  _otpSending = true;
  try {
    const https = require('https');
    const pending = await new Promise((resolve, reject) => {
      const req = https.get(`${PRIHR_URL}/api/otp/pending`, {
        headers: { 'x-relay-token': token }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch(e) { resolve({ items: [] }); } });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    const items = pending.items || [];
    if (items.length === 0) { _otpSending = false; return; }

    const transporter = getTransporter();
    for (const item of items) {
      // item.from에 이메일 포함 여부 확인 후 처리
      const fromAddr = item.from
        ? (item.from.includes('<') ? item.from : `${item.from} <${(cfg.smtp||{}).from || (cfg.smtp||{}).user || 'priexg@lge.com'}>`)
        : `"LG전자 생산기술원 PRI-Vibe log" <${(cfg.smtp||{}).from || (cfg.smtp||{}).user || 'priexg@lge.com'}>`; 
      const list = (item.recipients || []).filter(e => e && e.includes('@'));
      let sent = 0, failed = 0;
      for (const email of list) {
        try {
          await transporter.sendMail({ from: fromAddr, to: email, subject: item.subject, html: item.html });
          sent++;
          console.log(`[otp-send] ✅ ${email}`);
        } catch(e) { failed++; console.error('[otp-send] ❌', email, e.message); }
      }
      // 발송 완료 보고
      await new Promise((resolve) => {
        const payload = JSON.stringify({ id: item.id, sent, failed });
        const u = new URL(`${PRIHR_URL}/api/otp/sent`);
        const req = https.request({
          hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'x-relay-token': token }
        }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
        req.on('error', () => resolve());
        req.setTimeout(5000, () => { req.destroy(); resolve(); });
        req.write(payload); req.end();
      });
    }
  } catch(e) {
    console.error('[otp-send] 오류:', e.message);
  } finally {
    _otpSending = false;
  }
}
// 5초마다 OTP 큐 체크 (즉시 발송)
setInterval(fetchAndSendOtp, 5000);
console.log('[otp-send] OTP 사내SMTP 즉시 발송 대기 시작 (5초 간격)');
