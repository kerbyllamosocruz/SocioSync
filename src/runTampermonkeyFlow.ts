import { chromium } from 'playwright';
import { loadConfig } from './config/config';
import { Logger } from './logging/logger';
import { generateRunId, sleep, startDolphinProfile, stopDolphinProfile } from './utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const config = loadConfig();
  const runId = generateRunId();
  const logger = new Logger(config.paths.logs, runId);

  logger.info(`Starting Playwright Tampermonkey injection flow (Run ID: ${runId})`);

  // Load the Tampermonkey scripts
  const otpScriptPath = path.join(__dirname, '../cross-tab-otp-autofill.user.js');
  const sbScriptPath = path.join(__dirname, '../socialbee-autofill.user.js');

  if (!fs.existsSync(otpScriptPath) || !fs.existsSync(sbScriptPath)) {
    logger.error('Error: Could not locate Tampermonkey userscripts in root directory.');
    process.exit(1);
  }

  const otpScriptContent = fs.readFileSync(otpScriptPath, 'utf8');
  const sbScriptContent = fs.readFileSync(sbScriptPath, 'utf8');

  logger.info('Loaded both userscripts successfully.');

  let context = null;
  let dolphinBrowser = null;
  let activeProfileId = config.dolphin?.enabled ? 'default_profile' : undefined; // Update if using custom profile identification

  try {
    if (config.dolphin?.enabled && config.dolphin.apiToken) {
      logger.info('Dolphin{Anty} is enabled. Initiating profile...');
      // Use configured API key or look up profile name
      const profileName = "TikTok-Worker"; // Default fallback
      const wsUrl = await startDolphinProfile(profileName, config.dolphin.apiHost, config.dolphin.apiToken);
      logger.info('Connecting to Dolphin profile via CDP...');
      dolphinBrowser = await chromium.connectOverCDP(wsUrl);
      context = dolphinBrowser.contexts()[0];
      if (!context) {
        throw new Error('No browser context found in Dolphin profile');
      }
    } else {
      logger.info('Launching local Chromium browser in headful mode...');
      const userTempDir = path.join(config.paths.userDataDir, `tampermonkey-runner`);
      context = await chromium.launchPersistentContext(userTempDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--allow-running-insecure-content'
        ]
      });
    }

    // 1. Inject the userscripts into every page loaded in this context
    // Since Tampermonkey scripts run under a GM_ scope (access to GM_getValue/GM_setValue), 
    // we mock basic GM_ functions on the window object so the userscripts compile and run natively in the context page.
    await context.addInitScript(({ otpScript, sbScript }) => {
      const win = window as any;
      // Mock GM API if not present in the native environment
      if (typeof win.GM_setValue === 'undefined') {
        const store: Record<string, any> = {};
        win.GM_setValue = function(key: string, val: any) {
          store[key] = val;
          localStorage.setItem('GM_MOCK_' + key, JSON.stringify(val));
          // Trigger listeners
          const listeners = win._gmListeners?.[key] || [];
          listeners.forEach((cb: Function) => cb(key, null, val, false));
        };
        win.GM_getValue = function(key: string, defaultValue: any) {
          const val = localStorage.getItem('GM_MOCK_' + key);
          return val !== null ? JSON.parse(val) : defaultValue;
        };
        win._gmListeners = {};
        win.GM_addValueChangeListener = function(key: string, callback: Function) {
          if (!win._gmListeners[key]) {
            win._gmListeners[key] = [];
          }
          win._gmListeners[key].push(callback);
          return key;
        };
        win.GM_openInTab = function(url: string) {
          window.open(url, '_blank');
          return {};
        };
        win.GM_xmlhttpRequest = function(details: any) {
          fetch(details.url, {
            method: details.method || 'GET',
            headers: details.headers,
            body: details.data
          })
          .then(res => res.text().then(text => ({ res, text })))
          .then(({ res, text }) => {
            if (details.onload) {
              details.onload({
                status: res.status,
                responseText: text
              });
            }
          })
          .catch(err => {
            if (details.onerror) details.onerror(err);
          });
        };
      }

      // Execute scripts immediately at document-start or when DOM loads
      const runScripts = () => {
        try {
          // Eval the OTP script
          const runOtp = new Function(otpScript);
          runOtp();
          
          // Eval the SocialBee script
          const runSb = new Function(sbScript);
          runSb();
        } catch (e) {
          console.error('[Playwright Injector] Error executing userscript:', e);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runScripts);
      } else {
        runScripts();
      }
    }, { otpScript: otpScriptContent, sbScript: sbScriptContent });

    logger.info('Scripts registered in browser init hook.');

    // 2. Open SocialBee page and kuku.lu tabs
    const sbPage = await context.newPage();
    logger.info('Opening SocialBee dashboard...');
    await sbPage.goto('https://app.socialbee.com/login');

    const mailPage = await context.newPage();
    logger.info('Opening kuku.lu inbox...');
    await mailPage.goto('https://m.kuku.lu/recv.php');

    logger.info('Setup complete. Browser is active and running the Tampermonkey scripts.');

    // Maintain session running
    while (!sbPage.isClosed() && !mailPage.isClosed()) {
      await sleep(1000);
    }

  } catch (error) {
    logger.error('Error running the Tampermonkey execution flow', error as Error);
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
