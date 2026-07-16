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
    await page.waitForURL(url => {
      const href = url.href.toLowerCase();
      return href.includes('app.socialbee.com') && 
             !href.includes('login') && 
             !href.includes('register') && 
             !href.includes('auth');
    }, { timeout: 300000 });
    
    // Give it a brief moment to write cookies/localStorage completely
    await sleep(3000);
    
    console.log('🎉 Login detected! Saving session state...');
    await context.storageState({ path: storagePath });
    console.log(`✅ Session state saved to: ${storagePath}`);
  } catch (error) {
    console.error('❌ Login timeout or failed:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
