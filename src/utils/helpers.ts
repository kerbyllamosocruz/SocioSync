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
