import { Page, Browser, BrowserContext, ElementHandle } from 'playwright';

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onError?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 2, onError } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (onError) {
        onError(lastError, attempt);
      }
      
      if (attempt < retries) {
        const waitTime = delay * Math.pow(backoff, attempt - 1);
        console.log(`Retry ${attempt}/${retries} after ${waitTime}ms`);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError || new Error('All retries failed');
}

export function sleep(ms: number): Promise<void> {
  let scale = 1.0;
  try {
    // Dynamic require to avoid circular dependencies at import time
    const { loadConfig } = require('../config/config');
    const config = loadConfig();
    if (config && typeof config.actionDelay === 'number') {
      scale = config.actionDelay / 1000;
    }
  } catch (e) {
    // Fallback to no scaling
  }
  return new Promise(resolve => setTimeout(resolve, ms * scale));
}

export function extractOTP(text: string): string | null {
  const patterns = [
    /\b\d{6}\b/,
    /\b\d{4}\b/,
    /\b\d{8}\b/,
    /code[:\s]*(\d{4,8})/i,
    /OTP[:\s]*(\d{4,8})/i,
    /verification[:\s]*(\d{4,8})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  return null;
}

export async function safeCloseBrowser(browser: Browser): Promise<void> {
  try {
    if (browser && browser.isConnected()) {
      await browser.close();
    }
  } catch (error) {
    console.warn('Error closing browser:', error);
  }
}

export async function safeCloseContext(context: BrowserContext): Promise<void> {
  try {
    if (context) {
      await context.close();
    }
  } catch (error) {
    console.warn('Error closing browser context:', error);
  }
}

export async function waitForSelectorOrFail(
  page: Page,
  selector: string,
  timeout?: number
): Promise<void> {
  try {
    await page.waitForSelector(selector, { 
      timeout: timeout || 30000, 
      state: 'visible' 
    });
  } catch (error) {
    throw new Error(`Element ${selector} not found after timeout: ${error}`);
  }
}

export function generateRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function randomDelay(min: number = 500, max: number = 2000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

export function humanType(page: Page, selector: string | ElementHandle, text: string, delay: number = 100): Promise<void> {
  if (typeof selector === 'string') {
    return page.type(selector, text, { delay });
  }
  return selector.type(text, { delay });
}

export function registerEulerStreamLogger(page: Page, logger: any, workerId: string) {
  page.on('request', (request) => {
    try {
      const url = request.url();
      if (url.includes('eulerstream.com')) {
        logger.info(`[EulerStream] Outgoing API Request: ${url}`, workerId);
      }
    } catch (e) {
      // Ignore
    }
  });

  page.on('response', (response) => {
    try {
      const url = response.url();
      if (url.includes('eulerstream.com')) {
        logger.success(`[EulerStream] API Response: ${url} [Status: ${response.status()}]`, workerId);
      }
    } catch (e) {
      // Ignore
    }
  });
  
  page.on('console', (msg) => {
    try {
      const text = msg.text();
      if (text.toLowerCase().includes('eulerstream') || text.toLowerCase().includes('euler_')) {
        logger.info(`[EulerStream Console] ${text}`, workerId);
      }
    } catch (e) {
      // Ignore
    }
  });
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export function parseProxy(proxyStr: string): ProxyConfig | null {
  proxyStr = proxyStr.trim();
  if (!proxyStr || proxyStr.startsWith('#')) return null;
  
  // Format 1: protocol://username:password@ip:port
  if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://') || proxyStr.startsWith('socks5://')) {
    try {
      const url = new URL(proxyStr);
      const config: ProxyConfig = {
        server: `${url.protocol}//${url.hostname}:${url.port}`
      };
      if (url.username) {
        config.username = decodeURIComponent(url.username);
      }
      if (url.password) {
        config.password = decodeURIComponent(url.password);
      }
      return config;
    } catch (e) {
      // Fallback
    }
  }
  
  // Format 2: ip:port:username:password
  // Format 3: ip:port
  const parts = proxyStr.split(':');
  if (parts.length === 4) {
    const [ip, port, user, pass] = parts;
    return {
      server: `http://${ip}:${port}`,
      username: user,
      password: pass
    };
  } else if (parts.length === 2) {
    const [ip, port] = parts;
    return {
      server: `http://${ip}:${port}`
    };
  }
  
  return {
    server: proxyStr.startsWith('http') ? proxyStr : `http://${proxyStr}`
  };
}

// --- AdsPower Anti-Detect Browser Helpers ---

export async function startAntiDetectProfile(profileId: string, apiHost = 'http://local.adspower.net:50325'): Promise<string> {
  const axios = require('axios');
  try {
    const url = `${apiHost.replace(/\/$/, '')}/api/v1/browser/start?user_id=${profileId}`;
    const response = await axios.get(url, { timeout: 30000 });
    
    if (response.data && response.data.code === 0 && response.data.data?.ws?.puppeteer) {
      return response.data.data.ws.puppeteer;
    }
    
    throw new Error(`AdsPower API returned failure: ${JSON.stringify(response.data)}`);
  } catch (error) {
    throw new Error(`Failed to start AdsPower profile ${profileId}: ${(error as Error).message}`);
  }
}

export async function stopAntiDetectProfile(profileId: string, apiHost = 'http://local.adspower.net:50325'): Promise<void> {
  const axios = require('axios');
  try {
    const url = `${apiHost.replace(/\/$/, '')}/api/v1/browser/stop?user_id=${profileId}`;
    const response = await axios.get(url, { timeout: 15000 });
    if (!response.data || response.data.code !== 0) {
      console.warn(`[AdsPower] Warning: stop response returned non-success:`, response.data);
    }
  } catch (error) {
    console.warn(`[AdsPower] Failed to stop profile ${profileId}: ${(error as Error).message}`);
  }
}

export function isMaximumAttemptsError(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return lower.includes('maximum number of attempts') ||
         lower.includes('try again later') ||
         lower.includes('too many attempts') ||
         lower.includes('rate limit');
}

export async function findAntiDetectProfileId(name: string, apiHost = 'http://local.adspower.net:50325'): Promise<string | null> {
  const axios = require('axios');
  try {
    const url = `${apiHost.replace(/\/$/, '')}/api/v1/user/list`;
    const response = await axios.get(url, { timeout: 10000, params: { page_size: 100 } });
    if (response.data && response.data.code === 0 && response.data.data?.list) {
      const profiles = response.data.data.list;
      
      // 1. Try exact name match
      let profile = profiles.find((p: any) => (p.name || p.serial_number || '').toLowerCase() === name.toLowerCase());
      
      // 2. Try substring match
      if (!profile) {
        profile = profiles.find((p: any) => {
          const pName = (p.name || p.serial_number || '').toLowerCase();
          const target = name.toLowerCase();
          return pName.includes(target) || target.includes(pName);
        });
      }
      
      // 3. Fallback: use the first available profile
      if (!profile && profiles.length > 0) {
        profile = profiles[0];
        console.log(`[AdsPower] No profile matched "${name}", using fallback profile: ${profile.name || profile.serial_number} (${profile.user_id})`);
      }
      
      if (profile) {
        return String(profile.user_id);
      }
    }
    return null;
  } catch (error) {
    console.warn(`[AdsPower] Failed to list profiles from API: ${(error as Error).message}`);
    return null;
  }
}

// --- Dolphin{Anty} Anti-Detect Browser Helpers ---

export async function startDolphinProfile(profileId: string, apiHost = 'http://localhost:3001', apiToken?: string): Promise<string> {
  const axios = require('axios');
  let host = apiHost;
  if (host.includes('adspower') || host.includes('50325')) {
    host = 'http://localhost:3001';
  }
  
  try {
    const url = `${host.replace(/\/$/, '')}/v1.0/browser_profiles/${profileId}/start?automation=1`;
    console.log(`[Dolphin] Sending start request to: ${url}`);
    const response = await axios.get(url, { timeout: 30000 });
    
    if (response.data && response.data.success && response.data.automation) {
      const { port, wsEndpoint } = response.data.automation;
      if (!port) {
        throw new Error('No port returned in automation object');
      }
      const wsUrl = wsEndpoint 
        ? `ws://127.0.0.1:${port}${wsEndpoint.startsWith('/') ? wsEndpoint : '/' + wsEndpoint}`
        : `ws://127.0.0.1:${port}`;
      return wsUrl;
    }
    
    throw new Error(`Dolphin API returned failure: ${JSON.stringify(response.data)}`);
  } catch (error) {
    throw new Error(`Failed to start Dolphin profile ${profileId}: ${(error as Error).message}`);
  }
}

export async function stopDolphinProfile(profileId: string, apiHost = 'http://localhost:3001', apiToken?: string): Promise<void> {
  const axios = require('axios');
  let host = apiHost;
  if (host.includes('adspower') || host.includes('50325')) {
    host = 'http://localhost:3001';
  }
  try {
    const url = `${host.replace(/\/$/, '')}/v1.0/browser_profiles/${profileId}/stop`;
    console.log(`[Dolphin] Sending stop request to: ${url}`);
    const response = await axios.get(url, { timeout: 15000 });
    if (!response.data || !response.data.success) {
      console.warn(`[Dolphin] Warning: stop response returned non-success:`, response.data);
    }
  } catch (error) {
    console.warn(`[Dolphin] Failed to stop profile ${profileId}: ${(error as Error).message}`);
  }
}

export async function findDolphinProfileIdByName(name: string, apiHost = 'http://localhost:3001', apiToken?: string): Promise<string | null> {
  if (!apiToken) {
    console.warn('[Dolphin] Warning: DOLPHIN_API_TOKEN is not defined. Cannot search profile by name via cloud API.');
    return null;
  }
  
  const axios = require('axios');
  try {
    const url = `https://dolphin-anty-api.com/browser_profiles`;
    console.log(`[Dolphin] Searching for profile "${name}" via Cloud API...`);
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${apiToken.trim()}`
      },
      params: {
        query: name
      }
    });
    
    if (response.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
      const profiles = response.data.data;
      
      // 1. Try exact name match
      let profile = profiles.find((p: any) => (p.name || '').toLowerCase() === name.toLowerCase());
      
      // 2. Try substring match
      if (!profile) {
        profile = profiles.find((p: any) => {
          const pName = (p.name || '').toLowerCase();
          const target = name.toLowerCase();
          return pName.includes(target) || target.includes(pName);
        });
      }
      
      // 3. Fallback: use first returned
      if (!profile) {
        profile = profiles[0];
      }
      
      if (profile && profile.id) {
        const foundId = String(profile.id);
        console.log(`[Dolphin] Found profile "${profile.name}" (ID: ${foundId}) for query "${name}"`);
        return foundId;
      }
    }
    
    console.log(`[Dolphin] No profile found matching name "${name}"`);
    return null;
  } catch (error) {
    console.warn(`[Dolphin] Failed to search profile via Cloud API: ${(error as Error).message}`);
    return null;
  }
}
