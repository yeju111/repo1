const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

function loadEnv() {
  try {
    const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (_) {
    // .env is optional.
  }
}

loadEnv();

const SYSTEM_PROMPT = [
  '너는 사용자의 고민을 명확하게 분석하고 현실적인 다음 행동을 제안하는 챗봇이다.',
  '사용자를 모욕하거나 비난하지 않는다.',
  '공감만 반복하지 말고 문제의 구조를 짧게 설명한다.',
  '마지막에는 오늘 바로 할 수 있는 행동 1~2가지를 한국어로 제안한다.',
  '모든 답변은 반드시 한국어로 작성한다.'
].join('\n');

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((msg) => msg && typeof msg === 'object')
    .filter((msg) => typeof msg.content === 'string' && msg.content.trim())
    .map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content.trim().slice(0, 4000) }]
    }))
    .slice(-20);
}

function offlineReply(category) {
  const label = category || '기타';
  return '[' + label + '] 지금 필요한 건 고민을 더 키우는 게 아니라, 네가 통제할 수 있는 것과 없는 것을 나누는 거야. 각각 한 문장씩 적고, 오늘 10분 안에 끝낼 수 있는 행동 하나만 골라. 생각을 더 하는 것과 움직이는 건 다르다. 가장 작게 보이는 행동부터 바로 시작해.';
}

async function handleChat(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const contents = normalizeHistory(body.history);
    const category = body.category || '기타';

    if (contents.length === 0) {
      sendJson(res, 400, { error: '메시지를 입력해 주세요.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('API_') || apiKey === 'your_gemini_api_key_here') {
      sendJson(res, 200, { reply: offlineReply(category) });
      return;
    }

    if (typeof fetch !== 'function') {
      sendJson(res, 200, { reply: offlineReply(category) });
      return;
    }

    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT + '\n\n현재 선택한 고민 카테고리: ' + category + '\n모든 답변은 한국어로 작성한다.' }]
        },
        contents,
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 500
        }
      })
    });

    const data = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      sendJson(res, 200, { reply: offlineReply(category) });
      return;
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    sendJson(res, 200, { reply: reply || offlineReply(category) });
  } catch (err) {
    sendJson(res, 500, { error: '서버에서 응답을 처리하지 못했습니다.' });
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/chat') {
    handleChat(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log('Fact Bomber server running at http://localhost:' + PORT);
});
