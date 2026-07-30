import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { sleep } from './utils/helpers';

const CSV_PATH = path.join(__dirname, '../data/accounts.csv');

interface Account {
  index: number; // Row index (1-based, ignoring header)
  username: string;
  originalLine: string;
}

interface CheckResult {
  username: string;
  status: string;
  title: string;
  index: number;
}

async function checkUser(page: any, account: Account): Promise<CheckResult> {
  const url = `https://www.tiktok.com/@${account.username}`;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Wait slightly for dynamic React state to load
    await sleep(2000);

    const title = await page.title();
    const bodyText = await page.innerText('body');
    const lowerBody = bodyText.toLowerCase();

    // Check for CAPTCHA elements
    const hasCaptcha = await page.evaluate(() => {
      return document.querySelector('[id*="captcha"], [class*="captcha"], #captcha-verify-container') !== null;
    });

    // Check for rate limit keywords
    const isRateLimited = lowerBody.includes("too many attempts") || 
                         lowerBody.includes("try again later") || 
                         lowerBody.includes("rate limit");

    // Check if we got redirected to home/login page
    const isRedirectedToHome = title === "TikTok - Make Your Day" || title === "TikTok";

    // Check for user-title, user-subtitle, or user-post-item
    const hasProfileElement = await page.evaluate(() => {
      return document.querySelector('[data-e2e="user-title"], [data-e2e="user-subtitle"], [data-e2e="user-post-item"]') !== null;
    });
    
    let status = 'Active';
    
    if (hasCaptcha) {
      status = 'Rate Limited / Captcha';
    } else if (isRateLimited) {
      status = 'Rate Limited';
    } else if (isRedirectedToHome) {
      status = 'Blocked / Redirected';
    } else if (bodyText.includes("Couldn't find this account") || title.includes("Couldn't find this account")) {
      status = 'Not Found';
    } else if (
      bodyText.includes("Account banned") || 
      bodyText.includes("This account was banned") || 
      bodyText.includes("banned") && bodyText.includes("account")
    ) {
      status = 'Banned';
    } else if (!hasProfileElement) {
      status = 'Unknown / Error Loading';
    }
    
    console.log(`[Row ${account.index}] @${account.username} -> [${status}] (Title: "${title}")`);
    return { username: account.username, status, title, index: account.index };
  } catch (error) {
    console.error(`Error checking @${account.username}:`, (error as Error).message);
    return { username: account.username, status: 'Error / Timeout', title: '', index: account.index };
  }
}

const results: CheckResult[] = [];
const queue: Account[] = [];

async function worker(browser: any) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  
  while (true) {
    const nextAcc = queue.shift();
    if (!nextAcc) break;
    
    const page = await context.newPage();
    const res = await checkUser(page, nextAcc);
    results.push(res);
    await page.close();
    
    // Politely wait between pages
    await sleep(2000 + Math.random() * 1000);
  }
  
  await context.close();
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Error: accounts.csv not found at ${CSV_PATH}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csvContent.split(/\r?\n/);
  if (lines.length <= 1) {
    console.log('⚠️ CSV file is empty or only contains header.');
    return;
  }

  // Parse headers
  const headerParts = lines[0].split(',');
  let usernameIndex = 0;
  let statusIndex = 2;

  const uIdx = headerParts.findIndex(h => h.trim().toLowerCase().includes("user") || h.trim().toLowerCase().includes("email"));
  const sIdx = headerParts.findIndex(h => h.trim().toLowerCase().includes("status"));

  if (uIdx !== -1) usernameIndex = uIdx;
  if (sIdx !== -1) statusIndex = sIdx;

  // Extract accounts from CSV
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parts = line.split(',');
    const username = parts[usernameIndex] ? parts[usernameIndex].trim() : '';
    if (username) {
      queue.push({
        index: i,
        username,
        originalLine: line
      });
    }
  }

  // Determine number of workers from command line arguments (e.g., npm run check-accounts 8 or --workers=8)
  let numWorkers = 4;
  const workersArg = process.argv.find(arg => arg.startsWith('--workers='));
  if (workersArg) {
    const val = parseInt(workersArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      numWorkers = val;
    }
  } else {
    const lastArg = parseInt(process.argv[process.argv.length - 1], 10);
    if (!isNaN(lastArg) && lastArg > 0) {
      numWorkers = lastArg;
    }
  }

  console.log(`🚀 Starting check for ${queue.length} accounts from CSV using ${numWorkers} concurrent workers...`);
  
  const browser = await chromium.launch({
    headless: true
  });
  
  // Start workers concurrently
  const workers = [];
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker(browser));
  }
  
  await Promise.all(workers);
  await browser.close();
  
  // Update status in the CSV file
  console.log('\n📝 Writing results back to CSV...');
  const updatedLines = [...lines];
  
  for (const res of results) {
    const lineIdx = res.index;
    const line = updatedLines[lineIdx];
    const parts = line.split(',');
    
    // Pad parts array if necessary
    while (parts.length <= Math.max(usernameIndex, statusIndex)) {
      parts.push('');
    }
    
    parts[statusIndex] = res.status;
    updatedLines[lineIdx] = parts.join(',');
  }
  
  fs.writeFileSync(CSV_PATH, updatedLines.join('\n'), 'utf8');
  console.log('✅ CSV file updated successfully!');

  // Print Summary
  console.log('\n================ SUMMARY ================');
  console.table(results.map(r => ({ Username: r.username, Status: r.status, Title: r.title })));
  
  const active = results.filter(r => r.status === 'Active').map(r => r.username);
  const notFound = results.filter(r => r.status === 'Not Found').map(r => r.username);
  const banned = results.filter(r => r.status === 'Banned').map(r => r.username);
  const errors = results.filter(r => r.status.includes('Error') || r.status.includes('Unknown')).map(r => r.username);

  console.log(`\nActive (${active.length}): ${active.join(', ') || 'None'}`);
  console.log(`Not Found (${notFound.length}): ${notFound.join(', ') || 'None'}`);
  console.log(`Banned (${banned.length}): ${banned.join(', ') || 'None'}`);
  if (errors.length > 0) {
    console.log(`Unknown/Error (${errors.length}): ${errors.join(', ')}`);
  }
  console.log('==========================================');
}

main().catch(console.error);
