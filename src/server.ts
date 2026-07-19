import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const PORT = 4782;
const CSV_PATH = path.join(__dirname, '../data/accounts.csv');
const IMAGES_DIR = path.join(__dirname, '../data/images');
const VAR_1_3_DIR = path.join(IMAGES_DIR, 'var_1_3');
const VAR_4_6_DIR = path.join(IMAGES_DIR, 'var_4_6');

// Ensure directories exist
if (!fs.existsSync(VAR_1_3_DIR)) {
  fs.mkdirSync(VAR_1_3_DIR, { recursive: true });
}
if (!fs.existsSync(VAR_4_6_DIR)) {
  fs.mkdirSync(VAR_4_6_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  // CORS Headers to allow Tampermonkey access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'x-filename');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqUrl = req.url || '';

  if (reqUrl === '/accounts') {
    try {
      if (fs.existsSync(CSV_PATH)) {
        const content = fs.readFileSync(CSV_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(content);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'accounts.csv not found' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  } else if (reqUrl === '/mark-done' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { username } = JSON.parse(body);
        if (!username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing username parameter' }));
          return;
        }

        if (fs.existsSync(CSV_PATH)) {
          const content = fs.readFileSync(CSV_PATH, 'utf8');
          const lines = content.split(/\r?\n/);
          let updated = false;

          let emailIndex = 0;
          let passIndex = 1;
          let statusIndex = 2;
          let hasStatusHeader = false;

          if (lines.length > 0) {
            const firstRow = lines[0].split(',');
            const eIdx = firstRow.findIndex(h => h.trim().toLowerCase().includes("email") || h.trim().toLowerCase().includes("user"));
            const pIdx = firstRow.findIndex(h => h.trim().toLowerCase().includes("pass"));
            const sIdx = firstRow.findIndex(h => h.trim().toLowerCase().includes("status"));
            
            if (eIdx !== -1) emailIndex = eIdx;
            if (pIdx !== -1) passIndex = pIdx;
            if (sIdx !== -1) {
              statusIndex = sIdx;
              hasStatusHeader = true;
            }
          }

          if (!hasStatusHeader && lines.length > 0) {
            const firstRowParts = lines[0].split(',');
            firstRowParts.push('status');
            lines[0] = firstRowParts.join(',');
            statusIndex = firstRowParts.length - 1;
          }

          const updatedLines = lines.map((line, idx) => {
            if (idx === 0) return line; // Skip header
            if (!line.trim()) return line;

            const parts = line.split(',');
            const email = parts[emailIndex] ? parts[emailIndex].trim() : '';

            // Ensure the parts array has enough elements
            while (parts.length <= Math.max(emailIndex, passIndex, statusIndex)) {
              parts.push('');
            }

            // Clean legacy " - Done" from password if present
            let pass = parts[passIndex] ? parts[passIndex].trim() : '';
            if (pass.endsWith(' - Done')) {
              pass = pass.replace(' - Done', '').trim();
              parts[passIndex] = pass;
              parts[statusIndex] = 'Done';
            }

            if (email === username.trim()) {
              if (parts[statusIndex] !== 'Done') {
                updated = true;
                parts[statusIndex] = 'Done';
              }
              return parts.join(',');
            }

            return parts.join(',');
          });

          if (updated) {
            fs.writeFileSync(CSV_PATH, updatedLines.join('\n'), 'utf8');
            console.log(`[CSV Server] Marked ${username} as done in CSV`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Account ${username} marked as done` }));
          } else {
            console.log(`[CSV Server] Account ${username} not found or already done`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: `Account ${username} already done or not found` }));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'accounts.csv not found' }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
  } else if (reqUrl === '/config') {
    try {
      const configPath = path.join(__dirname, '../config/config.json');
      let config: any = {};
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configData);
      }
      
      const apiKey = process.env.CAPTCHA_API_KEY || (config.captcha && config.captcha.apiKey);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ apiKey }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  } else if (reqUrl === '/images/list') {
    try {
      const getImages = (dir: string) => {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);
        });
      };
      const list = {
        var_1_3: getImages(VAR_1_3_DIR),
        var_4_6: getImages(VAR_4_6_DIR)
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  } else if (reqUrl.startsWith('/images/file')) {
    try {
      const parsedUrl = new URL(reqUrl, `http://localhost:${PORT}`);
      const folder = parsedUrl.searchParams.get('folder');
      const name = parsedUrl.searchParams.get('name');

      if (folder && name && (folder === 'var_1_3' || folder === 'var_4_6')) {
        const safeName = path.basename(name);
        const filePath = path.join(IMAGES_DIR, folder, safeName);

        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, { 
            'Content-Type': contentType,
            'x-filename': safeName
          });
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
          return;
        }
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[CSV Server] Running at http://localhost:${PORT}/accounts and /config`);
});
