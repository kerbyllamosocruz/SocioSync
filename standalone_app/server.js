const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const PUBLIC_DIR = __dirname;

// In-Memory & File-based Config for TikTok OAuth App Credentials
let tiktokConfig = {
  clientKey: process.env.TIKTOK_CLIENT_KEY || '',
  clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
  redirectUri: process.env.TIKTOK_REDIRECT_URI || `http://localhost:${PORT}/api/auth/tiktok/callback`
};

// Store Connected OAuth TikTok Accounts (Tokens & Profile Data)
let connectedAccounts = [];

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

// Helper: HTTP Request JSON Parser
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // --- API ENDPOINTS ---

  // 1. GET /api/config & POST /api/config (Manage TikTok OAuth Developer Credentials)
  if (pathname === '/api/config') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        clientKey: tiktokConfig.clientKey ? `${tiktokConfig.clientKey.substring(0, 6)}...` : '',
        hasClientKey: !!tiktokConfig.clientKey,
        hasClientSecret: !!tiktokConfig.clientSecret,
        redirectUri: tiktokConfig.redirectUri
      }));
    } else if (req.method === 'POST') {
      try {
        const body = await getJsonBody(req);
        if (body.clientKey) tiktokConfig.clientKey = body.clientKey;
        if (body.clientSecret) tiktokConfig.clientSecret = body.clientSecret;
        if (body.redirectUri) tiktokConfig.redirectUri = body.redirectUri;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'TikTok OAuth credentials updated!' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    }
  }

  // 2. GET /api/auth/tiktok/login (Initiate Official TikTok OAuth 2.0 Auth Code Flow)
  if (pathname === '/api/auth/tiktok/login') {
    const state = 'beetok_oauth_' + Math.random().toString(36).substring(7);
    const scope = 'user.info.basic,video.publish,video.upload';

    // If Client Key is configured, redirect to TikTok official OAuth endpoint
    if (tiktokConfig.clientKey) {
      const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/?` +
        `client_key=${encodeURIComponent(tiktokConfig.clientKey)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&redirect_uri=${encodeURIComponent(tiktokConfig.redirectUri)}` +
        `&state=${encodeURIComponent(state)}`;

      res.writeHead(302, { Location: tiktokAuthUrl });
      return res.end();
    } else {
      // Sandbox / Test OAuth Callback Simulation if API Keys not set yet
      const simulatedCode = 'simulated_oauth_code_' + Date.now();
      const mockCallbackUrl = `/api/auth/tiktok/callback?code=${simulatedCode}&state=${state}&simulated=true`;
      res.writeHead(302, { Location: mockCallbackUrl });
      return res.end();
    }
  }

  // 3. GET /api/auth/tiktok/callback (TikTok OAuth 2.0 Callback Handler)
  if (pathname === '/api/auth/tiktok/callback') {
    const { code, state, simulated } = parsedUrl.query;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      return res.end('<h1>OAuth Error: Missing authorization code from TikTok.</h1>');
    }

    try {
      let oauthTokenData = null;
      let userProfile = null;

      if (simulated === 'true' || !tiktokConfig.clientKey) {
        // Simulated OAuth Response for sandbox testing
        oauthTokenData = {
          access_token: 'act_simulated_' + Math.random().toString(36).substring(2),
          refresh_token: 'rft_simulated_' + Math.random().toString(36).substring(2),
          open_id: 'openid_' + Math.random().toString(36).substring(2, 10),
          expires_in: 86400
        };

        const randomHandle = '@tiktok_creator_' + Math.floor(1000 + Math.random() * 9000);
        userProfile = {
          handle: randomHandle,
          name: `Connected Creator (${randomHandle})`,
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          followers: `${(Math.random() * 50 + 5).toFixed(1)}K`
        };
      } else {
        // Official TikTok OAuth API Token Exchange
        // POST https://open.tiktokapis.com/v2/oauth/token/
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: tiktokConfig.clientKey,
            client_secret: tiktokConfig.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: tiktokConfig.redirectUri
          })
        });
        oauthTokenData = await tokenRes.json();

        // Fetch user info from TikTok API
        const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
          headers: { 'Authorization': `Bearer ${oauthTokenData.access_token}` }
        });
        const userData = await userRes.json();
        const info = userData.data?.user || {};

        userProfile = {
          handle: `@${(info.display_name || 'user').toLowerCase().replace(/\s+/g, '_')}`,
          name: info.display_name || 'TikTok Creator',
          avatar: info.avatar_url || '',
          followers: '10K'
        };
      }

      // Save connected account with OAuth tokens
      const accountRecord = {
        id: `acc_oauth_${Date.now()}`,
        handle: userProfile.handle,
        name: userProfile.name,
        avatar: userProfile.avatar,
        followers: userProfile.followers,
        group: 'OAuth Connected',
        authType: 'TikTok OAuth 2.0',
        openId: oauthTokenData.open_id,
        accessToken: oauthTokenData.access_token,
        refreshToken: oauthTokenData.refresh_token,
        connectedAt: new Date().toISOString()
      };

      connectedAccounts.push(accountRecord);

      // Redirect back to frontend dashboard with success flag & account data
      const redirectFrontend = `/?oauth_success=true&handle=${encodeURIComponent(accountRecord.handle)}&name=${encodeURIComponent(accountRecord.name)}&id=${encodeURIComponent(accountRecord.id)}`;
      res.writeHead(302, { Location: redirectFrontend });
      return res.end();
    } catch (err) {
      console.error('OAuth Exchange Error:', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      return res.end(`<h1>TikTok OAuth Authentication Failed</h1><p>${err.message}</p>`);
    }
  }

  // 4. POST /api/tiktok/publish (Post to TikTok via Official Content Posting API)
  if (pathname === '/api/tiktok/publish' && req.method === 'POST') {
    try {
      const body = await getJsonBody(req);
      const { accountId, caption, mediaUrl } = body;

      const account = connectedAccounts.find(a => a.id === accountId);
      if (!account || !account.accessToken) {
        // Fallback demo response if sandbox mode
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          status: 'simulated_publish',
          publishId: `pub_${Date.now()}`,
          message: `Post variation dispatched to TikTok account ${accountId} (Simulation Mode)`
        }));
      }

      // Call TikTok Content Posting API
      // POST https://open.tiktokapis.com/v2/post/publish/content/init/
      const publishRes = await fetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          post_info: {
            title: caption,
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: mediaUrl
          }
        })
      });

      const publishData = await publishRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, data: publishData }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`BeeTok Studio OAuth Server running at http://localhost:${PORT}/`);
});
