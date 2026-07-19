import { chromium } from 'playwright';
import { loadConfig } from '../config/config';
import { Logger } from '../logging/logger';
import { readAccountsFromCSV } from '../utils/csvReader';
import { generateRunId, sleep, startDolphinProfile, stopDolphinProfile, parseProxy, findDolphinProfileIdByName } from '../utils/helpers';
import { TikTokHandler } from './tiktok';
import { KukuluMonitor } from './kukulu';
import { SocialBeeHandler } from './socialbee';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const config = loadConfig();
  const runId = generateRunId();
  const logger = new Logger(config.paths.logs, runId);
  const workerId = 'W-1';

  logger.info(`Starting Playwright-Bot Migrated Run (Run ID: ${runId})`);

  // Load accounts from CSV
  const csvPath = path.join(__dirname, '../../data/accounts.csv');
  let accounts: any[] = [];
  try {
    accounts = await readAccountsFromCSV(csvPath);
    logger.info(`Loaded ${accounts.length} accounts from CSV`);
  } catch (error) {
    logger.error('Failed to read accounts CSV', error as Error);
    process.exit(1);
  }

  if (accounts.length === 0) {
    logger.warn('No accounts to process in accounts.csv');
    process.exit(0);
  }

  // Load proxies
  const proxiesPath = path.join(__dirname, '../../data/proxies.txt');
  const proxies: any[] = [];
  if (fs.existsSync(proxiesPath)) {
    const content = fs.readFileSync(proxiesPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const p = parseProxy(line);
      if (p) proxies.push(p);
    }
  }

  let context = null;
  let dolphinBrowser = null;
  let activeProfileId = undefined;

  try {
    // 1. Browser launch
    if (config.dolphin?.enabled && config.dolphin.apiToken) {
      const account = accounts[0];
      activeProfileId = account.profileId;
      if (!activeProfileId) {
        logger.info(`Searching Dolphin{Anty} profile for: ${account.email}...`);
        activeProfileId = await findDolphinProfileIdByName(account.email, config.dolphin.apiHost, config.dolphin.apiToken) || 
                          await findDolphinProfileIdByName(account.email.split('@')[0], config.dolphin.apiHost, config.dolphin.apiToken) || 
                          undefined;
      }
      if (!activeProfileId) {
        logger.info('No profile matched account details. Falling back to default_profile...');
        activeProfileId = 'default_profile';
      }
      logger.info(`Connecting to Dolphin profile ${activeProfileId}...`);
      const wsUrl = await startDolphinProfile(activeProfileId, config.dolphin.apiHost, config.dolphin.apiToken);
      dolphinBrowser = await chromium.connectOverCDP(wsUrl);
      context = dolphinBrowser.contexts()[0];
      if (!context) throw new Error('No browser context found in Dolphin profile');
    } else {
      logger.info('Launching headful persistent browser context...');
      const proxy = proxies.length > 0 ? proxies[0] : undefined;
      const userTempDir = path.join(config.paths.userDataDir, `playwright-bot-runner`);
      context = await chromium.launchPersistentContext(userTempDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        proxy: proxy || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--allow-running-insecure-content'
        ]
      });
    }

    // Initialize Handler Classes
    const sbPage = await context.newPage();
    const sbHandler = new SocialBeeHandler(sbPage, logger, workerId);

    // 2. Perform SocialBee Login
    logger.info('Navigating to SocialBee login page...');
    await sbPage.goto('https://app.socialbee.com/login');
    
    // Autofill credentials
    if (config.socialBee.email && config.socialBee.email !== 'YOUR_SOCIALBEE_EMAIL_HERE') {
      try {
        await sbPage.waitForSelector('input[name="email"]', { timeout: 10000 });
        const tk = new TikTokHandler(sbPage, logger, workerId);
        await tk.humanType('input[name="email"]', config.socialBee.email);
        await tk.humanType('input[name="password"]', config.socialBee.password);
        await sbPage.click('button[type="submit"]');
        logger.info('Autofilled and submitted SocialBee credentials.');
        await sleep(3000);
      } catch (e) {
        logger.warn('Could not autofill SocialBee login input fields.');
      }
    }

    logger.info('Please ensure you are logged into SocialBee. Monitoring URL changes...');
    
    // Wait for Dashboard to load
    let loggedIn = false;
    for (let i = 0; i < 60; i++) {
      const url = sbPage.url();
      if (url.includes('dashboard') || url.includes('content') || url.includes('social-accounts')) {
        loggedIn = true;
        break;
      }
      await sleep(1000);
    }

    if (!loggedIn) {
      throw new Error('SocialBee login timed out or failed.');
    }

    logger.success('SocialBee dashboard loaded.');

    // 3. Orchestrate TikTok Link Connection (matching cross-tab-otp-autofill.user.js flow)
    // Create connection
    logger.info('Initiating TikTok connection inside SocialBee...');
    await sbPage.goto('https://app.socialbee.com/social-accounts');
    await sleep(2000);

    // Click "Add Account" or TikTok icon
    const addTikTokBtn = await sbPage.$('button:has-text("TikTok"), [href*="tiktok"], [class*="tiktok"]');
    if (addTikTokBtn) {
      logger.info('Clicking Add TikTok account button...');
      await addTikTokBtn.click();
      await sleep(3000);
    }

    // Now monitor for popup or OAuth page redirect
    let targetPage = sbPage;
    const pages = context.pages();
    if (pages.length > 2) {
      targetPage = pages[pages.length - 1];
    }

    logger.info(`TikTok target page URL: ${targetPage.url()}`);
    const tkHandler = new TikTokHandler(targetPage, logger, workerId);

    // Fill credentials for first account
    const account = accounts[0];
    logger.info(`Injecting TikTok credentials for: ${account.email}`);

    // Wait for TikTok username & password input fields
    try {
      await targetPage.waitForSelector('input[name="username"], input[type="text"]', { timeout: 15000 });
      await tkHandler.humanType('input[name="username"], input[type="text"]', account.email);
      await tkHandler.humanType('input[type="password"]', account.password);
      
      // Click Log in submit
      const submitBtn = await targetPage.$('button[type="submit"], [class*="login-button"]');
      if (submitBtn) {
        await submitBtn.click();
        await sleep(4000);
      }
    } catch (e) {
      logger.warn('TikTok input fields not found or already logged in.');
    }

    // Solve slider CAPTCHA if visible
    const apiKey = config.captcha?.apiKey;
    if (apiKey && !apiKey.includes('YOUR_EULERSTREAM_API_KEY')) {
      const isSolved = await tkHandler.solveCaptcha(apiKey, config.captcha.apiEndpoint);
      if (isSolved) {
        logger.success('CAPTCHA solved successfully.');
      }
    }

    // Check for Email verification options
    const needsEmailSelection = await tkHandler.handleVerificationOption();
    if (needsEmailSelection) {
      logger.info('Selected Email verification option. Waiting for OTP page...');
      await sleep(3000);
    }

    // Check if OTP input is present
    const isOtpRequired = await targetPage.$('input[type="tel"], input[maxlength="1"], input[placeholder*="code"], input[name="otp"]');
    if (isOtpRequired) {
      logger.info('OTP required! Setting up kuku.lu tab to retrieve code...');
      const mailPage = await context.newPage();
      await mailPage.goto('https://m.kuku.lu/recv.php');
      
      const kukulu = new KukuluMonitor(mailPage, logger, workerId);
      const code = await kukulu.waitForOTP(account.email);
      
      // Close mail page
      await mailPage.close();

      // Return to TikTok tab and insert code
      await targetPage.bringToFront();
      const codeInserted = await tkHandler.fillOTP(code);
      if (codeInserted) {
        logger.success('OTP code injected successfully.');
        const nextBtn = await targetPage.$('button[type="submit"], button:has-text("Next"), button:has-text("Verify")');
        if (nextBtn) {
          await nextBtn.click();
          await sleep(5000);
        }
      }
    }

    // Wait for user to finish manual validation if needed
    logger.info('Completed TikTok authorization sequence. Keeping browser open for validation...');
    while (!sbPage.isClosed()) {
      await sleep(1000);
    }

  } catch (error) {
    logger.error('Playwright-Bot execution failed', error as Error);
  } finally {
    if (dolphinBrowser) {
      try { await dolphinBrowser.close(); } catch(e) {}
      if (activeProfileId && config.dolphin?.apiToken) {
        try { await stopDolphinProfile(activeProfileId, config.dolphin.apiHost, config.dolphin.apiToken); } catch(e) {}
      }
    } else if (context) {
      try { await context.close(); } catch(e) {}
    }
  }
}

main().catch(console.error);
