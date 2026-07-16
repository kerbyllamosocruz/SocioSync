import { chromium } from 'playwright';
import { loadConfig } from './config/config';
import { SelectorManager } from './config/selectors';
import { Logger } from './logging/logger';
import { EmailMonitor } from './modules/emailMonitor';
import { AuthModule } from './modules/auth';
import { SocialBeeTasks } from './modules/socialBeeTasks';
import { readAccountsFromCSV } from './utils/csvReader';
import { generateRunId, safeCloseBrowser, safeCloseContext, sleep, registerEulerStreamLogger, ProxyConfig, parseProxy } from './utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // 1. Load config
  const config = loadConfig();
  const runId = generateRunId();
  const logger = new Logger(config.paths.logs, runId);
  
  logger.info(`Starting automation run ${runId}`);
  
  // 2. Read accounts from CSV
  const csvPath = path.join(__dirname, '../data/accounts.csv');
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
  const proxiesPath = path.join(__dirname, '../data/proxies.txt');
  let proxies: ProxyConfig[] = [];
  try {
    if (config.useProxy !== false && fs.existsSync(proxiesPath)) {
      const content = fs.readFileSync(proxiesPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const p = parseProxy(line);
        if (p) proxies.push(p);
      }
      logger.info(`Loaded ${proxies.length} proxies from proxies.txt`);
    } else if (config.useProxy === false) {
      logger.info('Proxies are disabled in configuration.');
    } else {
      logger.warn('No data/proxies.txt file found. Running without proxies.');
    }
  } catch (error) {
    logger.error('Failed to read proxies list', error as Error);
  }
  
  // 3. Initialize selectors
  const selectors = new SelectorManager(config);
  
  // 4. Create a thread-safe queue of accounts
  const queue = [...accounts];
  
  // Define worker logic
  async function runWorker(workerIndex: number) {
    const workerId = `W-${workerIndex + 1}`;
    logger.info(`Worker ${workerId} started`, workerId);
    
    while (queue.length > 0) {
      const account = queue.shift();
      if (!account) break;
      
      logger.info(`Worker ${workerId} picked up account: ${account.email}`, workerId);
      
      let context = null;
      let page = null;
      
      try {
        const storageStatePath = path.join(__dirname, '../config/socialbee_storage.json');
        const hasStorageState = fs.existsSync(storageStatePath);
        if (hasStorageState) {
          logger.info(`Found saved SocialBee session. Loading storageState...`, workerId);
        }
        
        const USER_AGENTS = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        ];

        // Select proxy for this worker index
        const proxy = proxies.length > 0 ? proxies[workerIndex % proxies.length] : undefined;
        if (proxy) {
          logger.info(`Using proxy: ${proxy.server}`, workerId);
        }

        // Launch browser context
        context = await chromium.launchPersistentContext(
          path.join(config.paths.userDataDir, `worker-${workerId}`),
          {
            headless: config.headless,
            viewport: { width: 1280, height: 800 },
            userAgent: USER_AGENTS[workerIndex % USER_AGENTS.length],
            proxy: proxy || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }
        );
        
        if (hasStorageState) {
          try {
            const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
            if (state.cookies) {
              await context.addCookies(state.cookies);
            }
            if (state.origins) {
              for (const originState of state.origins) {
                const localStorageData = originState.localStorage.reduce((acc: any, item: any) => {
                  acc[item.name] = item.value;
                  return acc;
                }, {});
                
                await context.addInitScript((args: any) => {
                  if (window.location.origin === args.origin) {
                    for (const [key, value] of Object.entries(args.localStorageData)) {
                      window.localStorage.setItem(key, value as string);
                    }
                  }
                }, { origin: originState.origin, localStorageData });
              }
            }
            logger.info('Successfully injected SocialBee storage state via init scripts', workerId);
          } catch (e) {
            logger.warn(`Failed to inject storageState: ${(e as Error).message}`, workerId);
          }
        }
        
        page = await context.newPage();
        registerEulerStreamLogger(page, logger, workerId);
        const auth = new AuthModule(logger, selectors, workerId);
        
        // Step 4.1: Login to SocialBee first
        logger.info('Logging into SocialBee...', workerId);
        const socialBeeLoginSuccess = await auth.loginToSocialBee(page, config.socialBee.email, config.socialBee.password);
        if (!socialBeeLoginSuccess) {
          throw new Error('SocialBee login failed');
        }
        
        // Save/update the storage state so we reuse it next time
        try {
          await context.storageState({ path: storageStatePath });
          logger.info('Saved updated SocialBee session state to storage', workerId);
        } catch (e) {
          logger.warn(`Failed to save storageState: ${(e as Error).message}`, workerId);
        }
        
        // Step 4.2: Initiate TikTok Connection from SocialBee (this opens a popup page or redirects the main tab)
        logger.info('Connecting TikTok account in SocialBee...', workerId);
        const connectResult = await auth.connectTikTokAccount(page);
        if (!connectResult.success || !connectResult.popupPage) {
          throw new Error('Failed to start TikTok connection in SocialBee');
        }
        
        const popupPage = connectResult.popupPage;
        const isPopup = popupPage !== page;
        
        if (isPopup) {
          registerEulerStreamLogger(popupPage, logger, workerId);
        }
        
        // Step 4.3: Login to TikTok directly inside the OAuth page/popup
        logger.info('Logging into TikTok in the OAuth page...', workerId);
        const loginResult = await auth.loginToTikTokOnPopup(popupPage, account.email, account.password);
        
        if (!loginResult.success) {
          logger.error(`TikTok login failed for ${account.email}`, undefined, workerId);
          await logger.writeFailure(account, 'TikTok login failed on OAuth page');
          if (isPopup) {
            try { await popupPage.close(); } catch(e) {}
          }
          continue;
        }
        
        if (loginResult.needsOTP) {
          logger.info('OTP required on TikTok page. Waiting for OTP...', workerId);
          if (account.email.includes('kuku.lu') || account.email.includes('addrin.uk') || account.email.includes('mbox.re')) {
            const emailMonitor = new EmailMonitor(logger, config.email.pollInterval, config.email.timeout);
            await emailMonitor.initialize(account.email.split('@')[0]);
            try {
              const otpCode = await emailMonitor.waitForVerificationCode(account.email, 60000);
              const otpSuccess = await auth.handleOTPVerification(popupPage, otpCode);
              if (!otpSuccess) {
                throw new Error('OTP verification failed on TikTok page');
              }
            } finally {
              await emailMonitor.cleanup();
            }
          } else {
            logger.warn(`Email domain is not supported for automatic OTP retrieval. Please check manually.`, workerId);
            await sleep(30000);
          }
        }
        
        // Step 4.4: Complete the TikTok OAuth Authorization
        logger.info('Completing TikTok authorization...', workerId);
        const authSuccess = await auth.authorizeTikTokApp(popupPage);
        if (!authSuccess) {
          throw new Error('Failed to authorize TikTok application');
        }
        
        // Wait for the popup page to close or redirect back
        if (isPopup) {
          try {
            await popupPage.waitForEvent('close', { timeout: 15000 });
          } catch (e) {
            try { await popupPage.close(); } catch(err) {}
          }
        } else {
          // If redirected in the main tab, wait for the page to redirect back to SocialBee
          try {
            await page.waitForURL(url => url.href.includes('socialbee.com'), { timeout: 20000 });
          } catch (e) {
            // Fallback: manually navigate back
            await page.goto('https://app.socialbee.com/workspaces/social-accounts');
          }
        }
        
        // Step 4.4: Execute SocialBee Tasks (Categories, Image upload, Variations, Publish)
        const tasks = new SocialBeeTasks(logger, page, workerId, config);
        const taskResult = await tasks.executeSocialBeeTasks({
          postCategories: config.socialBeeTasks.postCategories,
          imagesFolder: config.socialBeeTasks.imagesFolder,
          caption: config.socialBeeTasks.caption,
          enableComments: config.socialBeeTasks.enableComments,
          variationTexts: config.socialBeeTasks.variationTexts,
          scheduleType: 'now'
        });
        
        if (taskResult.success) {
          logger.success(`Successfully processed account ${account.email}`, workerId);
          await logger.writeSuccess(account);
        } else {
          throw new Error(`SocialBee tasks execution failed: ${taskResult.error}`);
        }
        
      } catch (error) {
        logger.error(`Error processing account ${account.email}`, error as Error, workerId);
        await logger.writeFailure(account, (error as Error).message);
      } finally {
        if (context) {
          await safeCloseContext(context);
        }
      }
    }
    
    logger.info(`Worker ${workerId} finished`, workerId);
  }
  
  // 5. Start N workers concurrently
  const numWorkers = config.workers || 2;
  logger.info(`Launching ${numWorkers} concurrent workers...`);
  
  const workerPromises = Array.from({ length: numWorkers }, (_, index) => runWorker(index));
  await Promise.all(workerPromises);
  
  await logger.generateReport();
  await logger.close();
  logger.info('Automation run completed.');
}

main().catch(console.error);
