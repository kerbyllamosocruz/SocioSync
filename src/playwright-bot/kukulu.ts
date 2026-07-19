import { Page } from 'playwright';
import { Logger } from '../logging/logger';
import { sleep } from '../utils/helpers';

export class KukuluMonitor {
  private page: Page;
  private logger: Logger;
  private workerId: string;

  constructor(page: Page, logger: Logger, workerId: string) {
    this.page = page;
    this.logger = logger;
    this.workerId = workerId;
  }

  /**
   * Auto-redirects from portal/English configuration pages to the actual inbox (recv.php)
   */
  async ensureOnInbox(): Promise<void> {
    const url = this.page.url();
    if (url.includes('/en.php') || url.includes('/index.php')) {
      this.logger.info('Landed on portal page. Redirecting to recv.php...', this.workerId);
      await this.page.goto('https://m.kuku.lu/recv.php');
      await sleep(2000);
    }
  }

  /**
   * Refreshes the inbox by clicking the update/refresh button
   */
  async refreshInbox(): Promise<void> {
    await this.ensureOnInbox();
    this.logger.info('Refreshing inbox to look for new mail...', this.workerId);

    try {
      const reloadImg = await this.page.$('#image_reload');
      if (reloadImg) {
        const clickTarget = await reloadImg.evaluateHandle(el => el.closest('a, button') || el);
        if (clickTarget) {
          await (clickTarget as any).click();
          await sleep(1500);
          return;
        }
      }
      
      // Fallback: look for "refresh" or "update" text
      const refreshBtn = await this.page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('a, button, span')).find((el) => {
          const text = el.textContent || '';
          return text.includes('更新') || text.toLowerCase().includes('refresh') || text.toLowerCase().includes('update');
        }) || null;
      });

      if (refreshBtn && (await refreshBtn.jsonValue()) !== null) {
        await (refreshBtn as any).click();
        await sleep(1500);
      } else {
        await this.page.reload();
        await sleep(2000);
      }
    } catch (e) {
      this.logger.warn(`Failed to click refresh button: ${(e as Error).message}`, this.workerId);
    }
  }

  /**
   * Determines if the email timestamp/relative text indicates a recent email (under 1 minute)
   */
  private isRecentEmail(text: string): boolean {
    if (!text) return true;

    const secMatch = text.match(/(\d+)\s*sec/i) || text.match(/(\d+)\s*秒/);
    if (secMatch) {
      const secs = parseInt(secMatch[1], 10);
      return secs <= 60;
    }

    const minMatch = text.match(/(\d+)\s*min/i) || text.match(/(\d+)\s*分/);
    if (minMatch) {
      const mins = parseInt(minMatch[1], 10);
      return mins <= 1;
    }

    if (text.match(/hour|day|month|時間|日|月/i)) {
      return false;
    }

    return true; // Default to true if no time indicator is found
  }

  /**
   * Checks if email text matches targetEmail or domain
   */
  private isEmailMatch(text: string, targetEmail: string): boolean {
    const emailLower = targetEmail.toLowerCase();
    const textLower = text.toLowerCase();
    
    if (textLower.includes(emailLower)) return true;
    
    // Masked patterns: e.g. k***y@kuku.lu
    const parts = emailLower.split('@');
    if (parts.length === 2) {
      const name = parts[0];
      const domain = parts[1];
      if (name.length > 2) {
        const masked = name[0] + '.*' + name[name.length - 1] + '@' + domain;
        const regex = new RegExp(masked.replace(/\./g, '\\.'), 'i');
        return regex.test(textLower);
      }
    }
    return false;
  }

  /**
   * Polls and retrieves the OTP from kuku.lu matching targetEmail
   */
  async waitForOTP(targetEmail: string, timeoutMs: number = 90000): Promise<string> {
    this.logger.info(`Starting OTP lookup on kuku.lu for: ${targetEmail}`, this.workerId);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.ensureOnInbox();

      // Check if we can find a matching email row
      const emailRowInfo = await this.page.evaluate(({ targetEmail }) => {
        const allElements = Array.from(document.querySelectorAll('a, tr, td, div, span, li'));
        
        const isEmailMatchLocal = (text: string, target: string) => {
          const emailLower = target.toLowerCase();
          const textLower = text.toLowerCase();
          if (textLower.includes(emailLower)) return true;
          const parts = emailLower.split('@');
          if (parts.length === 2) {
            const name = parts[0];
            const domain = parts[1];
            if (name.length > 2) {
              const masked = name[0] + '.*' + name[name.length - 1] + '@' + domain;
              const regex = new RegExp(masked.replace(/\./g, '\\.'), 'i');
              return regex.test(textLower);
            }
          }
          return false;
        };

        const isRecentEmailLocal = (text: string) => {
          if (!text) return true;
          const secMatch = text.match(/(\d+)\s*sec/i) || text.match(/(\d+)\s*秒/);
          if (secMatch) return parseInt(secMatch[1], 10) <= 60;
          const minMatch = text.match(/(\d+)\s*min/i) || text.match(/(\d+)\s*分/);
          if (minMatch) return parseInt(minMatch[1], 10) <= 1;
          if (text.match(/hour|day|month|時間|日|月/i)) return false;
          return true;
        };

        // 1. Direct match
        for (const el of allElements) {
          const txt = el.textContent || '';
          if (txt.includes(targetEmail) || isEmailMatchLocal(txt, targetEmail)) {
            const row = el.closest('a, tr, li, [onclick]') || el;
            const rowText = row.textContent || '';
            if (isRecentEmailLocal(rowText)) {
              return { success: true, text: rowText, selector: el.tagName === 'A' || el.tagName === 'TR' ? el.outerHTML : '' };
            }
          }
        }

        // 2. Fallback to domain part
        const domainPart = targetEmail.split('@')[1];
        if (domainPart) {
          for (const el of allElements) {
            const txt = el.textContent || '';
            if (txt.includes(domainPart)) {
              const row = el.closest('a, tr, li, [onclick]') || el;
              const rowText = row.textContent || '';
              if (isRecentEmailLocal(rowText)) {
                return { success: true, text: rowText, selector: el.outerHTML };
              }
            }
          }
        }

        return { success: false, text: '', selector: '' };
      }, { targetEmail });

      if (emailRowInfo.success) {
        this.logger.info(`Found matching row: ${emailRowInfo.text.trim().substring(0, 100)}`, this.workerId);

        // Check if the OTP is already visible inline in the subject / preview text
        const inlineOtpMatch = emailRowInfo.text.match(/\b\d{6}\b/) || emailRowInfo.text.match(/\b\d{4}\b/);
        if (inlineOtpMatch) {
          const code = inlineOtpMatch[0];
          this.logger.success(`Successfully found inline OTP: ${code}`, this.workerId);
          return code;
        }

        // Otherwise click the row to open the email
        this.logger.info('Clicking matching email row to open it...', this.workerId);
        await this.page.evaluate(({ targetEmail }) => {
          const allElements = Array.from(document.querySelectorAll('a, tr, td, div, span, li'));
          const isEmailMatchLocal = (text: string, target: string) => {
            const emailLower = target.toLowerCase();
            const textLower = text.toLowerCase();
            if (textLower.includes(emailLower)) return true;
            const parts = emailLower.split('@');
            if (parts.length === 2) {
              const name = parts[0];
              const domain = parts[1];
              if (name.length > 2) {
                const masked = name[0] + '.*' + name[name.length - 1] + '@' + domain;
                const regex = new RegExp(masked.replace(/\./g, '\\.'), 'i');
                return regex.test(textLower);
              }
            }
            return false;
          };

          for (const el of allElements) {
            const txt = el.textContent || '';
            if (txt.includes(targetEmail) || isEmailMatchLocal(txt, targetEmail)) {
              const clickTarget = el.closest('a, tr, li, [onclick]') || el;
              (clickTarget as any).click();
              return;
            }
          }

          // Fallback domain click
          const domainPart = targetEmail.split('@')[1];
          if (domainPart) {
            for (const el of allElements) {
              const txt = el.textContent || '';
              if (txt.includes(domainPart)) {
                const clickTarget = el.closest('a, tr, li, [onclick]') || el;
                (clickTarget as any).click();
                return;
              }
            }
          }
        }, { targetEmail });

        // Retrieve the body contents over 5 attempts (to let AJAX fetch load)
        for (let attempt = 1; attempt <= 5; attempt++) {
          await sleep(1000);
          
          const bodyText = await this.page.evaluate(() => {
            const selectors = ['#area_maildata', '#area_mailbody', '#area_mail_body', '#mail_body', '#mail_content', '.mail-body', '.email-body', 'iframe'];
            let text = '';
            for (const s of selectors) {
              const el = document.querySelector(s);
              if (el) {
                if (el.tagName === 'IFRAME') {
                  try {
                    text += ' ' + (el as HTMLIFrameElement).contentWindow?.document.body.innerText;
                  } catch (e) {}
                } else {
                  text += ' ' + (el as HTMLElement).innerText;
                }
              }
            }
            return text.trim() ? text : document.body.innerText;
          });

          const otpMatch = bodyText.match(/\b\d{6}\b/) || bodyText.match(/\b\d{4}\b/);
          if (otpMatch) {
            const code = otpMatch[0];
            this.logger.success(`Successfully extracted OTP from email: ${code}`, this.workerId);
            return code;
          }
        }
        this.logger.warn('Failed to extract OTP from email body content. Retrying list...', this.workerId);
      }

      await this.refreshInbox();
      await sleep(3000);
    }

    throw new Error(`Timeout waiting for kuku.lu OTP for ${targetEmail}`);
  }
}
