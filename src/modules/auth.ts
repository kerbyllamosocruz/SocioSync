import { Page } from 'playwright';
import { Logger } from '../logging/logger';
import { SelectorManager } from '../config/selectors';
import { retry, waitForSelectorOrFail, humanType, sleep } from '../utils/helpers';

export class AuthModule {
  private logger: Logger;
  private selectors: SelectorManager;
  private workerId: string;

  constructor(logger: Logger, selectors: SelectorManager, workerId: string) {
    this.logger = logger;
    this.selectors = selectors;
    this.workerId = workerId;
  }

  async loginToTikTok(page: Page, username: string, password: string): Promise<{ success: boolean; needsOTP: boolean }> {
    try {
      this.logger.info(`Logging into TikTok as ${username}`, this.workerId);
      
      await page.goto('https://www.tiktok.com/login/phone-or-email/email');
      await sleep(2000);
      
      await waitForSelectorOrFail(page, 'input[type="text"]', 10000);
      
      await humanType(page, 'input[type="text"]', username);
      await humanType(page, 'input[type="password"]', password);
      
      await page.click('button[type="submit"]');
      await sleep(3000);
      
      // Check for rate limit or maximum attempts reached
      const isRateLimited = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Maximum number of attempts') || 
               bodyText.includes('Try again later') || 
               bodyText.includes('Too many attempts');
      });
      
      if (isRateLimited) {
        this.logger.error(`Rate limit / maximum attempts reached for TikTok account: ${username}`, undefined, this.workerId);
        return { success: false, needsOTP: false };
      }
      
      const pageUrl = page.url();
      
      if (pageUrl.includes('verify') || pageUrl.includes('challenge') || 
          await page.$('input[type="text"][maxlength="1"]') || 
          await page.$('text=Verification code')) {
        this.logger.info('OTP verification required', this.workerId);
        return { success: true, needsOTP: true };
      }
      
      if (pageUrl.includes('feed') || pageUrl.includes('@') || 
          await page.$('[class*="home"], [class*="feed"]')) {
        this.logger.success(`Successfully logged into TikTok as ${username}`, this.workerId);
        return { success: true, needsOTP: false };
      }
      
      const errorMsg = await page.$('text=Incorrect password, please try again');
      if (errorMsg) {
        this.logger.error(`Invalid credentials for ${username}`, undefined, this.workerId);
        return { success: false, needsOTP: false };
      }
      
      return { success: true, needsOTP: false };
      
    } catch (error) {
      this.logger.error(`Failed to login to TikTok as ${username}`, error as Error, this.workerId);
      return { success: false, needsOTP: false };
    }
  }

  async handleOTPVerification(page: Page, otpCode: string): Promise<boolean> {
    try {
      this.logger.info(`Entering OTP verification code: ${otpCode}`, this.workerId);
      
      const otpInputs = await page.$$('input[type="text"][maxlength="1"]');
      if (otpInputs.length === 6) {
        for (let i = 0; i < 6; i++) {
          await otpInputs[i].fill(otpCode[i] || '');
        }
      } else {
        const otpField = await page.$('input[type="text"], input[type="number"]');
        if (otpField) {
          await otpField.fill(otpCode);
        } else {
          await page.fill('input[type="text"]', otpCode);
        }
      }
      
      const verifyBtn = await page.$('button:has-text("Verify")');
      if (verifyBtn) {
        await verifyBtn.click();
      } else {
        const nextBtn = await page.$('button:has-text("Next")');
        if (nextBtn) await nextBtn.click();
      }
      
      await sleep(3000);
      
      const pageUrl = page.url();
      if (pageUrl.includes('feed') || pageUrl.includes('@') || 
          await page.$('[class*="home"], [class*="feed"]')) {
        this.logger.success('OTP verification completed successfully', this.workerId);
        return true;
      }
      
      const errorMsg = await page.$('text=Incorrect verification code');
      if (errorMsg) {
        this.logger.error('Invalid OTP code entered', undefined, this.workerId);
        return false;
      }
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to handle OTP verification', error as Error, this.workerId);
      return false;
    }
  }

  async loginToSocialBee(page: Page, email: string, password: string): Promise<boolean> {
    try {
      this.logger.info(`Logging into SocialBee as ${email}`, this.workerId);
      
      // Try visiting dashboard first to check if we are already logged in via storageState
      await page.goto('https://app.socialbee.com/dashboard');
      await sleep(3000);
      
      const currentUrl = page.url();
      if (currentUrl.includes('dashboard') || currentUrl.includes('home') || await page.$('.dashboard, .home, [class*="dashboard"]')) {
        this.logger.success('Already logged into SocialBee (session active)', this.workerId);
        return true;
      }
      
      this.logger.info('Session not active, logging in to SocialBee...', this.workerId);
      await page.goto('https://app.socialbee.com/login');
      await sleep(2000);
      
      await waitForSelectorOrFail(page, 'input[name="email"]', 10000);
      
      await humanType(page, 'input[name="email"]', email);
      await humanType(page, 'input[name="password"]', password);
      
      await page.click('button[type="submit"]');
      
      try {
        await page.waitForSelector('.dashboard, .home, [class*="dashboard"]', { timeout: 15000 });
      } catch (e) {
        if (await page.$('[class*="dashboard"]')) {
          this.logger.info('Already logged into SocialBee', this.workerId);
          return true;
        }
        throw e;
      }
      
      this.logger.success(`Successfully logged into SocialBee as ${email}`, this.workerId);
      return true;
      
    } catch (error) {
      this.logger.error(`Failed to login to SocialBee as ${email}`, error as Error, this.workerId);
      return false;
    }
  }

  async connectTikTokAccount(page: Page): Promise<{ success: boolean; popupPage?: Page }> {
    try {
      this.logger.info('Connecting TikTok account in SocialBee', this.workerId);
      
      const currentUrl = page.url();
      if (!currentUrl.includes('accounts') && !currentUrl.includes('dashboard')) {
        await page.goto('https://app.socialbee.com/accounts');
        await sleep(2000);
      }
      
      const addBtn = await page.$('text=Add Account, button:has-text("Add Account")');
      if (addBtn) {
        await addBtn.click();
        await sleep(2000);
      }
      
      const tiktokOption = await page.$('text=TikTok, [data-testid="tiktok-option"]');
      if (tiktokOption) {
        await tiktokOption.click();
        await sleep(1000);
      }
      
      const connectBtn = await page.$('button:has-text("Connect TikTok"), button:has-text("Connect")');
      if (connectBtn) {
        const [popupPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 15000 }),
          connectBtn.click()
        ]);
        
        await popupPage.waitForTimeout(3000);
        
        this.logger.info('TikTok connection popup opened', this.workerId);
        return { success: true, popupPage };
      }
      
      this.logger.warn('Could not find Connect TikTok button', this.workerId);
      return { success: false };
      
    } catch (error) {
      this.logger.error('Failed to connect TikTok account', error as Error, this.workerId);
      return { success: false };
    }
  }

  async loginToTikTokOnPopup(popupPage: Page, username: string, password: string): Promise<{ success: boolean; needsOTP: boolean }> {
    try {
      this.logger.info(`Starting TikTok login on popup for ${username}`, this.workerId);
      
      // 1. Wait for page to load
      await popupPage.waitForLoadState('load');
      await sleep(3000);
      
      // 2. Check if we are already at the Authorize screen
      const pageUrl = popupPage.url();
      if (await popupPage.$('button:has-text("Authorize")') || pageUrl.includes('authorize')) {
        this.logger.info('Already logged in to TikTok. Proceeding to authorize.', this.workerId);
        return { success: true, needsOTP: false };
      }
      
      // 3. Click the "Use phone / email / username" button if it's present
      const usePhoneSelectors = [
        'button[data-e2e="login-button-email"]',
        'text=Use phone / email / username',
        'div:has-text("Use phone")'
      ];
      
      let clickedOption = false;
      for (const sel of usePhoneSelectors) {
        try {
          const btn = await popupPage.$(sel);
          if (btn) {
            this.logger.info(`Clicking login option: ${sel}`, this.workerId);
            await btn.click();
            clickedOption = true;
            await sleep(3000);
            break;
          }
        } catch (e) {
          // Ignore
        }
      }
      
      // 4. Click "Log in with email or username" if visible/selectable
      const emailTabSelectors = [
        'a:has-text("Log in with email")',
        'text=Log in with email or username',
        ':has-text("Email or username")'
      ];
      
      for (const sel of emailTabSelectors) {
        try {
          const tab = await popupPage.$(sel);
          if (tab) {
            this.logger.info(`Selecting tab: ${sel}`, this.workerId);
            await tab.click();
            await sleep(2000);
            break;
          }
        } catch (e) {
          // Ignore
        }
      }
      
      // 5. Fill credentials
      await waitForSelectorOrFail(popupPage, 'input[type="text"], input[name="username"]', 10000);
      
      const emailInput = await popupPage.$('input[type="text"], input[name="username"]');
      const passInput = await popupPage.$('input[type="password"]');
      
      if (!emailInput || !passInput) {
        throw new Error('Could not find TikTok credential inputs on popup');
      }
      
      await humanType(popupPage, emailInput, username);
      await humanType(popupPage, passInput, password);
      
      // 6. Click submit
      const submitBtn = await popupPage.$('button[type="submit"], button:has-text("Log in")');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await popupPage.keyboard.press('Enter');
      }
      await sleep(4000);
      
      // 7. Check for rate limit or maximum attempts reached
      const isRateLimited = await popupPage.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Maximum number of attempts') || 
               bodyText.includes('Try again later') || 
               bodyText.includes('Too many attempts');
      });
      
      if (isRateLimited) {
        this.logger.error(`Rate limit / maximum attempts reached for TikTok account: ${username}`, undefined, this.workerId);
        return { success: false, needsOTP: false };
      }
      
      // 8. Check for OTP verification
      const updatedUrl = popupPage.url();
      if (updatedUrl.includes('verify') || updatedUrl.includes('challenge') || 
          await popupPage.$('input[type="text"][maxlength="1"]') || 
          await popupPage.$('text=Verification code')) {
        this.logger.info('OTP verification required on TikTok popup', this.workerId);
        return { success: true, needsOTP: true };
      }
      
      return { success: true, needsOTP: false };
      
    } catch (error) {
      this.logger.error(`Failed to login to TikTok on popup as ${username}`, error as Error, this.workerId);
      return { success: false, needsOTP: false };
    }
  }

  async authorizeTikTokApp(popupPage: Page): Promise<boolean> {
    try {
      this.logger.info('Waiting for TikTok authorization screen...', this.workerId);
      
      // Wait for Authorize button (with 45s timeout as oauth pages can load slow)
      await popupPage.waitForSelector('button:has-text("Authorize"), button:has-text("Agree"), [class*="authorize"]', { timeout: 45000 });
      
      const authBtn = await popupPage.$('button:has-text("Authorize"), button:has-text("Agree"), button:has-text("Confirm")');
      if (authBtn) {
        this.logger.info('Clicking Authorize button', this.workerId);
        await authBtn.click();
        await sleep(5000);
        return true;
      }
      
      this.logger.warn('Could not find Authorize button', this.workerId);
      return false;
    } catch (error) {
      this.logger.error('Failed to authorize TikTok application', error as Error, this.workerId);
      return false;
    }
  }
}
