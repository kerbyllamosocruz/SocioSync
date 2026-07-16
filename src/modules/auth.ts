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

  private async getSpecificError(p: Page): Promise<string | undefined> {
    try {
      return await p.evaluate(() => {
        const possibleErrorSelectors = [
          '[class*="DivError"]',
          '[class*="error-message"]',
          '[class*="error"]',
          '[class*="DivTip"]',
          '[class*="Tip"]',
          '[role="alert"]'
        ];
        
        for (const selector of possibleErrorSelectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          for (const el of elements) {
            const text = el.textContent?.trim();
            if (text && text.length > 2 && text.length < 150) {
              const lowerText = text.toLowerCase();
              if (
                lowerText.includes('incorrect') ||
                lowerText.includes('invalid') ||
                lowerText.includes('failed') ||
                lowerText.includes('not found') ||
                lowerText.includes('exist') ||
                lowerText.includes('attempt') ||
                lowerText.includes('try again') ||
                lowerText.includes('suspended') ||
                lowerText.includes('locked') ||
                lowerText.includes('error') ||
                lowerText.includes('verification code')
              ) {
                return text;
              }
            }
          }
        }
        
        const bodyText = document.body.innerText;
        const matches = [
          /maximum number of attempts/i,
          /try again later/i,
          /too many attempts/i,
          /incorrect password/i,
          /incorrect email/i,
          /incorrect code/i,
          /account doesn't exist/i,
          /verification code is incorrect/i,
          /account has been suspended/i,
          /account has been locked/i
        ];
        
        for (const regex of matches) {
          const match = bodyText.match(regex);
          if (match && match[0]) {
            return match[0];
          }
        }
        
        return undefined;
      });
    } catch (e) {
      return undefined;
    }
  }

  async loginToTikTok(page: Page, username: string, password: string): Promise<{ success: boolean; needsOTP: boolean; error?: string }> {
    try {
      this.logger.info(`Logging into TikTok as ${username}`, this.workerId);
      
      await page.goto('https://www.tiktok.com/login/phone-or-email/email');
      await sleep(2000);
      
      await waitForSelectorOrFail(page, 'input[type="text"]', 10000);
      
      await humanType(page, 'input[type="text"]', username);
      await humanType(page, 'input[type="password"]', password);
      
      await page.click('button[type="submit"]');
      await sleep(3000);
      
      // Check for specific error message on the page (including rate limits, invalid password, etc.)
      const specificError = await this.getSpecificError(page);
      if (specificError) {
        this.logger.error(`TikTok login failed for ${username}: ${specificError}`, undefined, this.workerId);
        return { success: false, needsOTP: false, error: specificError };
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
        return { success: false, needsOTP: false, error: 'Incorrect password, please try again' };
      }
      
      return { success: true, needsOTP: false };
      
    } catch (error) {
      this.logger.error(`Failed to login to TikTok as ${username}`, error as Error, this.workerId);
      return { success: false, needsOTP: false, error: (error as Error).message };
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
      this.logger.info('Navigating to dashboard to check session...', this.workerId);
      await page.goto('https://app.socialbee.com/dashboard');
      
      const isLoggedIn = await Promise.race([
        page.waitForSelector('.user-avatar, a[href*="logout"], .workspace-name, [data-testid*="sidebar"]', { timeout: 8000 }).then(() => true),
        page.waitForSelector('input[name="email"], input[type="email"], input[placeholder*="Email"]', { timeout: 8000 }).then(() => false)
      ]).catch(() => false);
      
      if (isLoggedIn) {
        this.logger.success('Already logged into SocialBee (session active)', this.workerId);
        return true;
      }
      
      this.logger.info('Session not active, logging in to SocialBee...', this.workerId);
      await page.goto('https://app.socialbee.com/login');
      await sleep(3000);
      
      // Step 1: Fill email address
      this.logger.info('Filling email address...', this.workerId);
      const emailInput = await page.waitForSelector('input[name="email"], input[type="email"], input[placeholder*="Email"]', { timeout: 15000 });
      if (!emailInput) {
        throw new Error('Email input field not found');
      }
      await humanType(page, emailInput, email);
      await sleep(1000);
      
      const continueBtn = await page.$('button:has-text("Continue"), button[type="submit"], button.btn-primary-sb');
      if (continueBtn) {
        this.logger.info('Clicking Continue...', this.workerId);
        await continueBtn.click();
        await sleep(3000);
      } else {
        this.logger.info('No Continue button found, submitting with Enter key', this.workerId);
        await page.keyboard.press('Enter');
        await sleep(3000);
      }
      
      // Step 2: Fill password
      this.logger.info('Waiting for password field or dashboard...', this.workerId);
      const result = await Promise.race([
        page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 15000 }).then(() => 'password'),
        page.waitForSelector('.dashboard, .home, [class*="dashboard"]', { timeout: 15000 }).then(() => 'dashboard')
      ]);
      
      if (result === 'dashboard') {
        this.logger.success('Successfully logged into SocialBee (auto-authenticated)', this.workerId);
        return true;
      }
      
      this.logger.info('Filling password...', this.workerId);
      const passwordInput = await page.$('input[name="password"], input[type="password"]');
      if (!passwordInput) {
        throw new Error('Password input field not found');
      }
      await humanType(page, passwordInput, password);
      await sleep(1000);
      
      const loginBtn = await page.$('button[type="submit"], button:has-text("Log in"), button:has-text("Continue")');
      if (loginBtn) {
        this.logger.info('Clicking Log in button...', this.workerId);
        await loginBtn.click();
      } else {
        this.logger.info('No Log in button found, submitting with Enter key', this.workerId);
        await page.keyboard.press('Enter');
      }
      
      // Step 3: Wait for dashboard redirection
      this.logger.info('Waiting for dashboard redirection...', this.workerId);
      await page.waitForSelector('.user-avatar, a[href*="logout"], .workspace-name, [data-testid*="sidebar"]', { timeout: 25000 });
      
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
      if (!currentUrl.includes('social-accounts')) {
        this.logger.info('Navigating to workspaces social-accounts page...', this.workerId);
        await page.goto('https://app.socialbee.com/workspaces/social-accounts');
        await sleep(4000);
      }
      
      // Step 1: Try to click the direct TikTok connect button/form (new UI grid)
      const directTikTokSelectors = [
        'form[action*="/signin/"] button:has-text("TikTok")',
        'form[action*="/signin/"] button:has(.connect-social-tiktok)',
        'button:has(.connect-social-tiktok)',
        'form[action*="/signin/"] button',
        '.connect-social-tiktok'
      ];
      
      let directTikTokBtn = null;
      for (const sel of directTikTokSelectors) {
        try {
          directTikTokBtn = await page.$(sel);
          if (directTikTokBtn) {
            this.logger.info(`Found direct TikTok connect button: ${sel}`, this.workerId);
            break;
          }
        } catch (e) {
          // Ignore selector syntax issues
        }
      }
      
      let initiatorElement = directTikTokBtn;
      
      // Step 2: Fallback to "Connect social account" / "Add Account" modal if direct button not found
      if (!initiatorElement) {
        this.logger.info('Direct TikTok button not found. Checking for Connect social account / Add Account modal...', this.workerId);
        const addBtnSelectors = [
          'button:has-text("Connect social account")',
          'button:has-text("Add Account")',
          'text=Connect social account',
          'text=Add Account'
        ];
        
        let addBtn = null;
        for (const sel of addBtnSelectors) {
          addBtn = await page.$(sel);
          if (addBtn) {
            this.logger.info(`Clicking connection initiator modal button: ${sel}`, this.workerId);
            await addBtn.click();
            await sleep(3000);
            break;
          }
        }
        
        // Look for TikTok option inside the modal
        const tiktokModalSelectors = [
          'text=TikTok',
          '[data-testid="tiktok-option"]',
          '.social-option:has-text("TikTok")',
          'div:has-text("TikTok")'
        ];
        
        for (const sel of tiktokModalSelectors) {
          initiatorElement = await page.$(sel);
          if (initiatorElement) {
            this.logger.info(`Found TikTok option inside modal: ${sel}`, this.workerId);
            break;
          }
        }
      }
      
      if (!initiatorElement) {
        this.logger.warn('Could not find TikTok option button/element (direct or in modal)', this.workerId);
        return { success: false };
      }
      
      // Wait for either a popup page to open or the current page to redirect
      this.logger.info('Clicking TikTok option and waiting for OAuth page...', this.workerId);
      
      let popupPage: Page | null = null;
      try {
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 8000 }),
          initiatorElement.click()
        ]);
        popupPage = popup;
        await popupPage.waitForLoadState('load');
        this.logger.info('TikTok connection page opened in a popup window', this.workerId);
      } catch (e) {
        // No popup opened, check if the main page redirected
        this.logger.info('No popup window detected. Checking for main page redirect...', this.workerId);
        try {
          await page.waitForURL(url => url.href.includes('tiktok.com'), { timeout: 10000 });
          popupPage = page;
          this.logger.info('TikTok connection redirected in the main browser tab', this.workerId);
        } catch (err) {
          this.logger.error('Failed to detect TikTok OAuth connection page (no popup and no redirect)', err as Error, this.workerId);
          return { success: false };
        }
      }
      
      return { success: true, popupPage };
      
    } catch (error) {
      this.logger.error('Failed to connect TikTok account', error as Error, this.workerId);
      return { success: false };
    }
  }

  async loginToTikTokOnPopup(popupPage: Page, username: string, password: string): Promise<{ success: boolean; needsOTP: boolean; error?: string }> {
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
      
      // 7. Check for specific error message on the popup page
      const specificError = await this.getSpecificError(popupPage);
      if (specificError) {
        this.logger.error(`TikTok login failed on popup for ${username}: ${specificError}`, undefined, this.workerId);
        return { success: false, needsOTP: false, error: specificError };
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
      return { success: false, needsOTP: false, error: (error as Error).message };
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
