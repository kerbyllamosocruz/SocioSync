import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const PORT = 4782;
const CSV_PATH = path.join(__dirname, '../data/accounts.csv');

const server = http.createServer((req, res) => {
  // CORS Headers to allow Tampermonkey access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/accounts') {
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
  } else if (req.url === '/config') {
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
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`[CSV Server] Running at http://localhost:${PORT}/accounts and /config`);
});
