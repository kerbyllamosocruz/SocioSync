import { chromium, firefox, webkit } from 'playwright';
import { loadConfig } from './config/config';
import { SelectorManager } from './config/selectors';
import { Logger } from './logging/logger';
import { EmailMonitor } from './modules/emailMonitor';
import { AuthModule } from './modules/auth';
import { readAccountsFromCSV } from './utils/csvReader';
import { generateRunId, safeCloseBrowser, safeCloseContext, sleep, registerEulerStreamLogger, ProxyConfig, parseProxy } from './utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // 1. Load config
  const config = loadConfig();
  const runId = generateRunId();
  const logger = new Logger(config.paths.logs, runId);
  
  logger.info(`Starting TikTok-only automation run ${runId}`);
  
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

        // Launch browser context using configured browser type
        const browserType = config.browserType || 'chromium';
        const browserLauncher = browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium;
        logger.info(`Launching ${browserType} browser...`, workerId);
        
        context = await browserLauncher.launchPersistentContext(
          path.join(config.paths.userDataDir, `worker-tiktok-${workerId}`),
          {
            channel: config.channel || undefined,
            headless: config.headless,
            viewport: { width: 1280, height: 800 },
            userAgent: USER_AGENTS[workerIndex % USER_AGENTS.length],
            proxy: proxy || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          }
        );
        
        page = await context.newPage();
        registerEulerStreamLogger(page, logger, workerId);
        const auth = new AuthModule(logger, selectors, workerId);
        
        // Step 4.1: Login to TikTok directly
        logger.info('Logging into TikTok directly...', workerId);
        const loginResult = await auth.loginToTikTok(page, account.email, account.password);
        
        if (!loginResult.success) {
          logger.error(`TikTok login failed for ${account.email}`, undefined, workerId);
          await logger.writeFailure(account, 'TikTok login failed');
          continue;
        }
        
        if (loginResult.needsOTP) {
          logger.info('OTP required on TikTok page. Waiting for OTP...', workerId);
          if (account.email.includes('kuku.lu') || account.email.includes('addrin.uk') || account.email.includes('mbox.re')) {
            const emailMonitor = new EmailMonitor(logger, config.email.pollInterval, config.email.timeout);
            await emailMonitor.initialize(account.email.split('@')[0]);
            try {
              const otpCode = await emailMonitor.waitForVerificationCode(account.email, 60000);
              const otpSuccess = await auth.handleOTPVerification(page, otpCode);
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
        
        logger.success(`Successfully processed TikTok login for ${account.email}`, workerId);
        await logger.writeSuccess(account);
        
        // Save session state to configuration file for reuse if needed
        try {
          const sessionDir = path.join(__dirname, '../config/tiktok_sessions');
          if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
          }
          await context.storageState({ path: path.join(sessionDir, `${account.email}.json`) });
          logger.info(`Saved TikTok session state for ${account.email}`, workerId);
        } catch (e) {
          logger.warn(`Failed to save TikTok storageState: ${(e as Error).message}`, workerId);
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
  logger.info('TikTok-only automation run completed.');
}

main().catch(console.error);
