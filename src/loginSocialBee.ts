import { chromium } from 'playwright';
import { loadConfig } from './config/config';
import * as path from 'path';
import { humanType, sleep } from './utils/helpers';

async function main() {
  console.log('🚀 Launching browser for SocialBee manual login...');
  
  const config = loadConfig();
  const storagePath = path.join(__dirname, '../config/socialbee_storage.json');
  
  const browser = await chromium.launch({
    headless: false
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  
  console.log('Navigating to SocialBee login page...');
  await page.goto('https://app.socialbee.com/login');
  
  // Autofill credentials if they are configured
  if (config.socialBee.email && config.socialBee.email !== 'YOUR_SOCIALBEE_EMAIL_HERE') {
    try {
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await humanType(page, 'input[name="email"]', config.socialBee.email);
      await humanType(page, 'input[name="password"]', config.socialBee.password);
      console.log('Autofilled SocialBee credentials.');
    } catch (e) {
      // Ignore if selector doesn't match
    }
  }
  
  console.log('👉 Please complete the login process manually (and handle the OTP) in the browser window.');
  console.log('⏳ Waiting for dashboard to load (5 minutes timeout)...');
  
  try {
    const startTime = Date.now();
    let loggedIn = false;
    
    while (Date.now() - startTime < 300000) {
      if (page.isClosed()) {
        break;
      }
      try {
        const currentUrl = page.url().toLowerCase();
        
        // Check if URL matches common logged-in pages
        if (currentUrl.includes('dashboard') || currentUrl.includes('social-accounts') || currentUrl.includes('workspaces') || currentUrl.includes('posts')) {
          loggedIn = true;
          break;
        }
        
        // Check for dashboard elements
        const isDashboardVisible = await page.evaluate(() => {
          return document.querySelector('.dashboard, .home, [class*="dashboard"], a[href*="logout"], .user-avatar') !== null;
        });
        
        if (isDashboardVisible) {
          loggedIn = true;
          break;
        }
        
        // Check if login inputs are gone
        const emailInputExists = await page.$('input[name="email"], input[type="email"], input[placeholder*="Email"]');
        if (!emailInputExists && currentUrl.includes('socialbee.com') && !currentUrl.includes('login')) {
          await sleep(2000);
          const emailInputStillGone = await page.$('input[name="email"], input[type="email"]');
          if (!emailInputStillGone) {
            loggedIn = true;
            break;
          }
        }
      } catch (e) {
        break;
      }
      await sleep(1000);
    }
    
    if (loggedIn) {
      await sleep(3000);
      console.log('🎉 Login detected! Saving session state...');
      await context.storageState({ path: storagePath });
      console.log(`✅ Session state saved to: ${storagePath}`);
    } else {
      throw new Error('Timeout waiting for login or browser was closed');
    }
  } catch (error) {
    console.error('❌ Login timeout or failed:', (error as Error).message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
