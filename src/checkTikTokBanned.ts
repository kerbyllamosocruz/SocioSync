import { chromium } from 'playwright';
import { sleep } from './utils/helpers';

interface Account {
  group: string;
  username: string;
}

const groups: { [key: string]: string[] } = {
  '88994884905': [
    'lshejshfbd',
    'odhemsjs',
    'soeuaksne',
    'sourmans49',
    'rljeskkse',
    'dljesksms',
    'keismssj',
    'skidjejs',
    'kdrjjsn',
    'kajekwjene',
    'lzrkmanss',
    'pekamsdj',
    'dljwmsd',
    'slrkmamas',
    'ldrnkschje',
    'doffing0',
    'clever8512',
    'occurring41',
    'background1163',
    'palyodwvs8m'
  ],
  '188582946374': [
    'bathayvxbgk',
    'mayhadfx3ag',
    'sobvilhuyxs',
    'artnalvjyio',
    'mayparumgu9',
    'raticowcwys',
    'fanhahwroys',
    'penpusalbc9',
    'suecaokkym9',
    'ourmujbcdgf',
    'ourbuuaubrg',
    'msivyazng94',
    'gasmsybacie',
    'nowonlzjqle',
    'agecrxtwsjf',
    'gaynevbcrl4',
    'godsejrlvpj',
    'kithilbqdls',
    'oakthiqwu2l',
    'rimwetuku9k',
    'weefolldaa2',
    'alemuwlnyox',
    'oarsoeepaez',
    'haybyhmcs8i',
    'itsapluzztu',
    'madjatzu7gi',
    'pielapdtko8',
    'humsesak9n2',
    'owlercyfxy7',
    'rimmidokty8'
  ],
  '269250825880': [
    'manmr893',
    'histeninn',
    'opttoobe',
    'ourdenjar',
    'sayhutdip',
    'joggo735',
    'frydienew',
    'myjoyoak',
    'agedry343',
    'wemow781'
  ]
};

// Flatten to a queue of accounts to check
const queue: Account[] = [];
for (const [groupName, usernames] of Object.entries(groups)) {
  for (const username of usernames) {
    queue.push({ group: groupName, username });
  }
}

interface CheckResult {
  group: string;
  username: string;
  status: string;
  title: string;
}

const results: CheckResult[] = [];

async function checkUser(page: any, account: Account): Promise<CheckResult> {
  const url = `https://www.tiktok.com/@${account.username}`;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Wait slightly for dynamic React state to load
    await sleep(2000);

    const title = await page.title();
    const bodyText = await page.innerText('body');
    
    let status = 'Active';
    
    if (bodyText.includes("Couldn't find this account") || title.includes("Couldn't find this account")) {
      status = 'Not Found';
    } else if (
      bodyText.includes("Account banned") || 
      bodyText.includes("This account was banned") || 
      bodyText.includes("banned") && bodyText.includes("account")
    ) {
      status = 'Banned';
    } else {
      // Check for user-title, user-subtitle, or user-post-item
      const hasProfileElement = await page.evaluate(() => {
        return document.querySelector('[data-e2e="user-title"], [data-e2e="user-subtitle"], [data-e2e="user-post-item"]') !== null;
      });
      if (!hasProfileElement) {
        if (title.toLowerCase() === 'tiktok' || bodyText.toLowerCase().includes('something went wrong')) {
          status = 'Unknown / Error Loading';
        }
      }
    }
    
    console.log(`[Group: ${account.group}] @${account.username} -> [${status}] (Title: "${title}")`);
    return { group: account.group, username: account.username, status, title };
  } catch (error) {
    console.error(`Error checking @${account.username}:`, (error as Error).message);
    return { group: account.group, username: account.username, status: 'Error / Timeout', title: '' };
  }
}

async function worker(browser: any, id: number) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  
  while (true) {
    const nextAcc = queue.shift();
    if (!nextAcc) break;
    
    const res = await checkUser(page, nextAcc);
    results.push(res);
    
    // Politely wait between pages
    await sleep(2000 + Math.random() * 1000);
  }
  
  await context.close();
}

async function main() {
  console.log(`🚀 Starting check for ${queue.length} accounts using 4 concurrent workers...`);
  
  const browser = await chromium.launch({
    headless: true
  });
  
  // Start 4 workers concurrently
  const workers = [];
  for (let i = 0; i < 4; i++) {
    workers.push(worker(browser, i));
  }
  
  await Promise.all(workers);
  await browser.close();
  
  console.log('\n================ ALL RESULTS ================');
  console.table(results);
  
  // Also list by group and status
  for (const groupName of Object.keys(groups)) {
    console.log(`\n--- GROUP: ${groupName} ---`);
    const groupResults = results.filter(r => r.group === groupName);
    const active = groupResults.filter(r => r.status === 'Active').map(r => r.username);
    const notFound = groupResults.filter(r => r.status === 'Not Found').map(r => r.username);
    const banned = groupResults.filter(r => r.status === 'Banned').map(r => r.username);
    const unknown = groupResults.filter(r => r.status.includes('Error') || r.status.includes('Unknown')).map(r => r.username);
    
    console.log(`Active (${active.length}): ${active.join(', ') || 'None'}`);
    console.log(`Not Found (${notFound.length}): ${notFound.join(', ') || 'None'}`);
    console.log(`Banned (${banned.length}): ${banned.join(', ') || 'None'}`);
    if (unknown.length > 0) {
      console.log(`Unknown/Error (${unknown.length}): ${unknown.join(', ')}`);
    }
  }
  console.log('==========================================');
}

main().catch(console.error);
