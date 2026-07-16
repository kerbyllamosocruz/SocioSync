import { Browser, BrowserContext, Page } from 'playwright';
import { Logger } from '../logging/logger';
import { extractOTP, sleep } from '../utils/helpers';

export interface EmailRequest {
  identifier: string;
  promise: Promise<string>;
  resolve: (code: string) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class EmailMonitor {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private running: boolean = false;
  private requests: Map<string, EmailRequest> = new Map();
  private logger: Logger;
  private pollInterval: number;
  private timeout: number;
  private browser: Browser | null = null;
  private emailAddress: string = '';

  constructor(logger: Logger, pollInterval: number = 3000, timeout: number = 120000) {
    this.logger = logger;
    this.pollInterval = pollInterval;
    this.timeout = timeout;
  }

  async initialize(emailAddress: string): Promise<void> {
    try {
      this.emailAddress = emailAddress;
      const { chromium } = await import('playwright');
      
      this.context = await chromium.launchPersistentContext(
        './user_data_dir/email_monitor',
        {
          headless: true,
          args: ['--no-sandbox']
        }
      );
      
      this.browser = this.context.browser();
      this.page = await this.context.newPage();
      
      const inboxUrl = `https://m.kuku.lu/${this.emailAddress}`;
      await this.page.goto(inboxUrl);
      await sleep(3000);
      
      this.running = true;
      this.logger.info(`Email monitor initialized for ${this.emailAddress}`);
      
      this.pollInbox();
    } catch (error) {
      this.logger.error('Failed to initialize email monitor', error as Error);
      throw error;
    }
  }

  private async pollInbox(): Promise<void> {
    while (this.running) {
      try {
        await this.checkInboxForPendingRequests();
        await sleep(this.pollInterval);
      } catch (error) {
        this.logger.error('Error polling inbox', error as Error);
        await this.recoverSession();
      }
    }
  }

  private async checkInboxForPendingRequests(): Promise<void> {
    if (this.requests.size === 0 || !this.page) return;
    
    await this.refreshInbox();
    const emails = await this.getLatestEmails();
    
    for (const [identifier, request] of this.requests) {
      const matchingEmail = emails.find(email => {
        const searchText = (email.subject + ' ' + email.from + ' ' + email.body).toLowerCase();
        return searchText.includes(identifier.toLowerCase()) || 
               searchText.includes('tiktok') ||
               searchText.includes('verification') ||
               searchText.includes('code');
      });
      
      if (matchingEmail) {
        const code = this.extractOTPFromEmail(matchingEmail);
        if (code) {
          this.logger.info(`Found OTP code ${code} for ${identifier}`);
          request.resolve(code);
          this.requests.delete(identifier);
        }
      }
    }
    
    const now = Date.now();
    for (const [identifier, request] of this.requests) {
      if (now - request.timestamp > this.timeout) {
        request.reject(new Error(`Timeout waiting for OTP for ${identifier}`));
        this.requests.delete(identifier);
      }
    }
  }

  private extractOTPFromEmail(email: any): string | null {
    const fullText = `${email.subject} ${email.from} ${email.body} ${email.content || ''}`;
    return extractOTP(fullText);
  }

  private async refreshInbox(): Promise<void> {
    if (!this.page) return;
    
    try {
      const refreshBtn = await this.page.$('button[aria-label="Refresh"], .refresh, [class*="refresh"]');
      if (refreshBtn) {
        await refreshBtn.click();
        await sleep(1000);
      } else {
        await this.page.reload({ timeout: 10000 });
        await sleep(2000);
      }
    } catch (error) {
      // Ignore
    }
  }

  private async getLatestEmails(): Promise<any[]> {
    if (!this.page) return [];
    
    try {
      return await this.page.evaluate(() => {
        const results: any[] = [];
        const emailItems = document.querySelectorAll('.email-item, .mail-item, tr, .message, [class*="email"], [class*="mail"]');
        
        emailItems.forEach(item => {
          const subject = item.querySelector('.subject, .title, .subj')?.textContent || '';
          const from = item.querySelector('.from, .sender, .address')?.textContent || '';
          const body = item.querySelector('.body, .content, .text')?.textContent || '';
          const date = item.querySelector('.date, .time, .received')?.textContent || '';
          
          if (subject || from || body) {
            results.push({ subject: subject.trim(), from: from.trim(), body: body.trim(), date: date.trim() });
          }
        });
        
        return results;
      });
    } catch (error) {
      this.logger.warn(`Error getting latest emails: ${(error as Error).message || error}`);
      return [];
    }
  }

  async waitForVerificationCode(identifier: string, timeout: number = 120000): Promise<string> {
    if (this.requests.has(identifier)) {
      return this.requests.get(identifier)!.promise;
    }
    
    let resolve!: (code: string) => void;
    let reject!: (error: Error) => void;
    
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    
    const request: EmailRequest = {
      identifier,
      promise,
      resolve,
      reject,
      timestamp: Date.now()
    };
    
    this.requests.set(identifier, request);
    
    const timeoutId = setTimeout(() => {
      if (this.requests.has(identifier)) {
        reject(new Error(`Timeout waiting for verification code for ${identifier}`));
        this.requests.delete(identifier);
      }
    }, timeout || this.timeout);
    
    promise.finally(() => {
      clearTimeout(timeoutId);
    });
    
    return promise;
  }

  private async recoverSession(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      await this.initialize(this.emailAddress);
    } catch (error) {
      this.logger.error('Failed to recover email session', error as Error);
    }
  }

  async cleanup(): Promise<void> {
    this.running = false;
    for (const [identifier, request] of this.requests) {
      request.reject(new Error('Email monitor shutting down'));
    }
    this.requests.clear();
    
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}
