// BeeTok Studio - Standalone TikTok Post Variation Engine Application Logic

// Initial Default State
const DEFAULT_ACCOUNTS = [
  { id: 'acc_1', handle: '@fashionbrand_official', name: 'Fashion Brand Main', followers: '124.5K', group: 'OAuth Connected', authType: 'TikTok OAuth 2.0' },
  { id: 'acc_2', handle: '@fashionbrand_trends', name: 'Trendy Looks', followers: '45.2K', group: 'OAuth Connected', authType: 'TikTok OAuth 2.0' },
  { id: 'acc_3', handle: '@styleinspo_daily', name: 'Daily Outfit Inspo', followers: '88.9K', group: 'OAuth Connected', authType: 'TikTok OAuth 2.0' },
  { id: 'acc_4', handle: '@streetwear_vault', name: 'Streetwear Vault', followers: '32.1K', group: 'OAuth Connected', authType: 'TikTok OAuth 2.0' }
];

const DEFAULT_MEDIA_A = [
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop&q=80'
];

const DEFAULT_MEDIA_B = [
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=80'
];

let appState = {
  accounts: [],
  selectedAccountIds: [],
  variations: [],
  queue: [],
  mediaSetA: [],
  mediaSetB: [],
  publishedCount: 18
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  if (appState.accounts.length === 0) {
    appState.accounts = [...DEFAULT_ACCOUNTS];
  }
  appState.selectedAccountIds = appState.accounts.map(a => a.id);
  appState.mediaSetA = [...DEFAULT_MEDIA_A];
  appState.mediaSetB = [...DEFAULT_MEDIA_B];

  handleOAuthCallbackRedirect();
  loadOAuthConfig();

  renderAccountsUI();
  renderMediaPreviews();
  generateInitialVariations();
  updateMetrics();
});

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem('beetok_app_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      appState.accounts = parsed.accounts || [];
      appState.queue = parsed.queue || [];
      appState.publishedCount = parsed.publishedCount || 18;
    } catch (e) {
      console.error('Error reading localStorage', e);
    }
  }
}

// Save state to localStorage
function saveState() {
  localStorage.setItem('beetok_app_state', JSON.stringify({
    accounts: appState.accounts,
    queue: appState.queue,
    publishedCount: appState.publishedCount
  }));
  updateMetrics();
}

// TikTok OAuth 2.0 Initiator
function initiateTikTokOAuth() {
  showToast('Redirecting to TikTok OAuth 2.0 authorization...');
  setTimeout(() => {
    window.location.href = '/api/auth/tiktok/login';
  }, 400);
}

// Handle Return from OAuth Redirect
function handleOAuthCallbackRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth_success') === 'true') {
    const handle = params.get('handle') || '@tiktok_user';
    const name = params.get('name') || 'Connected Creator';
    const id = params.get('id') || `acc_oauth_${Date.now()}`;

    // Add new OAuth connected profile to app state
    const existingIndex = appState.accounts.findIndex(a => a.handle === handle);
    const newAcc = {
      id: id,
      handle: handle,
      name: name,
      followers: '10.5K',
      group: 'OAuth Verified',
      authType: 'TikTok OAuth 2.0',
      connectedAt: new Date().toLocaleDateString()
    };

    if (existingIndex >= 0) {
      appState.accounts[existingIndex] = newAcc;
    } else {
      appState.accounts.unshift(newAcc);
    }

    if (!appState.selectedAccountIds.includes(newAcc.id)) {
      appState.selectedAccountIds.push(newAcc.id);
    }

    saveState();
    // Clean up query string
    window.history.replaceState({}, document.title, window.location.pathname);
    showToast(`🎉 TikTok Account ${handle} connected via OAuth 2.0!`);
    switchTab('accounts');
  }
}

// OAuth Developer Configuration Management
async function loadOAuthConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.clientKey) {
      document.getElementById('cfg-client-key').value = data.clientKey;
    }
    const statusText = document.getElementById('oauth-status-text');
    if (statusText) {
      if (data.hasClientKey && data.hasClientSecret) {
        statusText.textContent = 'Status: Official TikTok API OAuth Keys Configured ✓';
        statusText.style.color = '#10b981';
      } else {
        statusText.textContent = 'Status: Sandbox / Simulation Mode Active (Provide Keys above for Live API)';
        statusText.style.color = '#25f4ee';
      }
    }
  } catch (e) {
    console.error('Failed to load OAuth config', e);
  }
}

async function saveOAuthConfig() {
  const clientKey = document.getElementById('cfg-client-key').value.trim();
  const clientSecret = document.getElementById('cfg-client-secret').value.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey, clientSecret })
    });
    const result = await res.json();
    if (result.success) {
      showToast('TikTok OAuth credentials saved!');
      loadOAuthConfig();
    }
  } catch (e) {
    showToast('Failed to save config: ' + e.message);
  }
}

// Tab Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);

  if (targetPane) targetPane.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
}

// Render Accounts across all views
function renderAccountsUI() {
  // 1. Dashboard Mini List
  const miniContainer = document.getElementById('dashboard-accounts-list');
  if (miniContainer) {
    miniContainer.innerHTML = appState.accounts.map(acc => `
      <div class="account-mini-card">
        <div class="account-info-left">
          <div class="account-avatar">${acc.handle.substring(1, 3).toUpperCase()}</div>
          <div>
            <div class="account-name">${escapeHtml(acc.name)}</div>
            <div class="account-handle">${escapeHtml(acc.handle)} • ${acc.followers}</div>
          </div>
        </div>
        <span class="oauth-badge">OAuth Verified</span>
      </div>
    `).join('');
  }

  // 2. Variations Form Checkboxes
  const formCheckboxes = document.getElementById('form-account-checkboxes');
  if (formCheckboxes) {
    formCheckboxes.innerHTML = appState.accounts.map(acc => `
      <label class="account-checkbox-card">
        <input type="checkbox" value="${acc.id}" ${appState.selectedAccountIds.includes(acc.id) ? 'checked' : ''} onchange="toggleAccountSelection('${acc.id}')">
        <span class="account-checkbox-name">${escapeHtml(acc.handle)}</span>
      </label>
    `).join('');
  }

  // 3. Accounts Full Manager Tab
  const fullGrid = document.getElementById('accounts-grid-full');
  if (fullGrid) {
    fullGrid.innerHTML = appState.accounts.map(acc => `
      <div class="account-card-full">
        <div class="account-card-top">
          <div class="account-avatar-lg">
            ${acc.avatar ? `<img src="${acc.avatar}" />` : acc.handle.substring(1, 3).toUpperCase()}
          </div>
          <div>
            <div class="account-name">${escapeHtml(acc.name)}</div>
            <div class="account-handle">${escapeHtml(acc.handle)}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="oauth-badge">🔑 ${acc.authType || 'TikTok OAuth 2.0'}</span>
        </div>
        <div class="account-card-stats">
          <div>
            <div class="account-stat-val">${acc.followers}</div>
            <div class="account-stat-lbl">Followers</div>
          </div>
          <div>
            <div class="account-stat-val">${acc.group || 'OAuth'}</div>
            <div class="account-stat-lbl">Status</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm btn-block" onclick="removeAccount('${acc.id}')">Disconnect Profile</button>
      </div>
    `).join('');
  }

  // Update counts
  document.getElementById('connected-count').textContent = appState.accounts.length;
  document.getElementById('stat-connected').textContent = appState.accounts.length;
}

function toggleAccountSelection(accId) {
  if (appState.selectedAccountIds.includes(accId)) {
    appState.selectedAccountIds = appState.selectedAccountIds.filter(id => id !== accId);
  } else {
    appState.selectedAccountIds.push(accId);
  }
}

// Media Upload File Handlers
function handleFileSelect(event, group) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const targetArr = group === 'A' ? appState.mediaSetA : appState.mediaSetB;
  
  for (let i = 0; i < files.length; i++) {
    const reader = new FileReader();
    reader.onload = (e) => {
      targetArr.push(e.target.result);
      renderMediaPreviews();
    };
    reader.readAsDataURL(files[i]);
  }
  showToast(`Added media to Media Set ${group}`);
}

function renderMediaPreviews() {
  const listA = document.getElementById('preview-list-a');
  const listB = document.getElementById('preview-list-b');

  if (listA) {
    listA.innerHTML = appState.mediaSetA.map((src, idx) => `
      <img src="${src}" class="preview-thumb" title="Set A #${idx+1}" />
    `).join('');
  }
  if (listB) {
    listB.innerHTML = appState.mediaSetB.map((src, idx) => `
      <img src="${src}" class="preview-thumb" title="Set B #${idx+1}" />
    `).join('');
  }
}

// Generate Post Variations
function handleGenerateVariations(e) {
  if (e) e.preventDefault();

  const campaignName = document.getElementById('campaign-name').value;
  const captionA = document.getElementById('caption-a').value;
  const captionB = document.getElementById('caption-b').value;
  const mode = document.getElementById('distribution-mode').value;

  if (appState.selectedAccountIds.length === 0) {
    showToast('Please select at least one target TikTok account!');
    return;
  }

  const selectedAccounts = appState.accounts.filter(acc => appState.selectedAccountIds.includes(acc.id));
  const newVariations = [];

  const totalVars = Math.max(6, selectedAccounts.length);

  for (let i = 0; i < totalVars; i++) {
    const varNum = i + 1;
    const account = selectedAccounts[i % selectedAccounts.length];
    
    let appliedCaption = captionA;
    let appliedMedia = appState.mediaSetA[i % appState.mediaSetA.length] || DEFAULT_MEDIA_A[0];
    let groupTag = 'Group A';

    if (mode === 'split-v4') {
      if (varNum >= 4) {
        appliedCaption = captionB;
        appliedMedia = appState.mediaSetB[(i - 3) % appState.mediaSetB.length] || DEFAULT_MEDIA_B[0];
        groupTag = 'Group B';
      }
    } else if (mode === 'alternate') {
      if (i % 2 === 1) {
        appliedCaption = captionB;
        appliedMedia = appState.mediaSetB[i % appState.mediaSetB.length] || DEFAULT_MEDIA_B[0];
        groupTag = 'Group B';
      }
    } else if (mode === 'random') {
      const isB = Math.random() > 0.5;
      appliedCaption = isB ? captionB : captionA;
      appliedMedia = isB ? (appState.mediaSetB[i % appState.mediaSetB.length] || DEFAULT_MEDIA_B[0]) : (appState.mediaSetA[i % appState.mediaSetA.length] || DEFAULT_MEDIA_A[0]);
      groupTag = isB ? 'Group B' : 'Group A';
    } else if (mode === 'b-only') {
      appliedCaption = captionB;
      appliedMedia = appState.mediaSetB[i % appState.mediaSetB.length] || DEFAULT_MEDIA_B[0];
      groupTag = 'Group B';
    }

    newVariations.push({
      id: `var_${Date.now()}_${varNum}`,
      varNumber: varNum,
      campaignName,
      accountId: account.id,
      accountHandle: account.handle,
      accountName: account.name,
      caption: appliedCaption,
      media: appliedMedia,
      groupTag,
      scheduledTime: new Date(Date.now() + (i + 1) * 15 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  appState.variations = newVariations;
  renderTikTokGrid();
  showToast(`Successfully created ${newVariations.length} TikTok post variations!`);
}

function generateInitialVariations() {
  handleGenerateVariations(null);
}

// Render Live TikTok Mobile Mockup Grid
function renderTikTokGrid() {
  const grid = document.getElementById('tiktok-variations-grid');
  if (!grid) return;

  grid.innerHTML = appState.variations.map(v => `
    <div class="tiktok-card">
      <div class="tiktok-badge-var">Variation #${v.varNumber} • ${v.groupTag}</div>
      <div class="tiktok-account-top">${escapeHtml(v.accountHandle)}</div>
      
      <img src="${v.media}" class="tiktok-media-bg" alt="Variation ${v.varNumber}" />

      <!-- Right Action Sidebar -->
      <div class="tiktok-right-actions">
        <div class="action-btn-item">
          <div class="action-btn-icon">❤️</div>
          <span>12.4K</span>
        </div>
        <div class="action-btn-item">
          <div class="action-btn-icon">💬</div>
          <span>342</span>
        </div>
        <div class="action-btn-item">
          <div class="action-btn-icon">🔖</div>
          <span>1.2K</span>
        </div>
        <div class="action-btn-item">
          <div class="action-btn-icon">↗️</div>
          <span>Share</span>
        </div>
      </div>

      <!-- Bottom Caption & Info -->
      <div class="tiktok-bottom-info">
        <div class="tiktok-author">${escapeHtml(v.accountHandle)}</div>
        <div class="tiktok-caption-text">${escapeHtml(v.caption)}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('stat-variations').textContent = appState.variations.length;
}

// Shuffle Pairings
function randomizeVariations() {
  document.getElementById('distribution-mode').value = 'random';
  handleGenerateVariations(null);
}

// Publish/Queue All Variations
function publishAllVariations() {
  if (appState.variations.length === 0) {
    showToast('No active variations to queue!');
    return;
  }

  const newQueueItems = appState.variations.map(v => ({
    id: `queue_${Date.now()}_${v.varNumber}`,
    varNumber: v.varNumber,
    accountId: v.accountId,
    accountHandle: v.accountHandle,
    caption: v.caption,
    media: v.media,
    scheduledTime: v.scheduledTime,
    status: 'queued'
  }));

  appState.queue.push(...newQueueItems);
  saveState();
  renderQueueUI();
  showToast(`Added ${newQueueItems.length} post variations to the TikTok Posting Queue!`);
  switchTab('queue');
}

// Render Queue Tab
function renderQueueUI() {
  const tableBody = document.getElementById('queue-table-body');
  if (!tableBody) return;

  if (appState.queue.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#9ca3af;">No scheduled post variations in queue. Create posts in Variations Studio!</td></tr>`;
  } else {
    tableBody.innerHTML = appState.queue.map(item => `
      <tr>
        <td><strong>Variation #${item.varNumber}</strong></td>
        <td><span class="oauth-badge">${escapeHtml(item.accountHandle)}</span></td>
        <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.caption)}</td>
        <td><img src="${item.media}" style="width:36px; height:36px; border-radius:6px; object-fit:cover;" /></td>
        <td>${item.scheduledTime}</td>
        <td>
          <span class="status-badge ${item.status === 'published' ? 'published' : 'queued'}">
            ${item.status === 'published' ? '✓ Published via TikTok API' : '⏱️ Scheduled'}
          </span>
        </td>
        <td>
          ${item.status === 'queued' ? `<button class="btn btn-secondary btn-sm" onclick="publishItemNow('${item.id}')">Publish Now</button>` : `<span style="color:#10b981; font-size:12px; font-weight:600;">API Sent</span>`}
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('queue-count').textContent = appState.queue.filter(i => i.status === 'queued').length;
  document.getElementById('stat-queued').textContent = appState.queue.filter(i => i.status === 'queued').length;
  document.getElementById('stat-published').textContent = appState.publishedCount;
}

async function publishItemNow(itemId) {
  const item = appState.queue.find(q => q.id === itemId);
  if (!item) return;

  try {
    showToast(`Sending Variation #${item.varNumber} to TikTok API...`);
    const res = await fetch('/api/tiktok/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: item.accountId,
        caption: item.caption,
        mediaUrl: item.media
      })
    });
    const data = await res.json();
    if (data.success) {
      item.status = 'published';
      appState.publishedCount += 1;
      saveState();
      renderQueueUI();
      showToast(`🎉 Variation #${item.varNumber} posted to ${item.accountHandle} via TikTok Content API!`);
    }
  } catch (e) {
    showToast('Posting failed: ' + e.message);
  }
}

async function dispatchQueueNow() {
  const pending = appState.queue.filter(q => q.status === 'queued');
  if (pending.length === 0) {
    showToast('Queue is empty or all variations already published!');
    return;
  }

  showToast(`Dispatching ${pending.length} variations via TikTok API...`);
  for (const item of pending) {
    await publishItemNow(item.id);
  }
}

function clearCompletedQueue() {
  appState.queue = appState.queue.filter(q => q.status === 'queued');
  saveState();
  renderQueueUI();
  showToast('Cleared completed items from queue.');
}

// Add/Remove TikTok Accounts
function openAddAccountModal() {
  document.getElementById('add-account-modal').classList.add('active');
}
function closeAddAccountModal() {
  document.getElementById('add-account-modal').classList.remove('active');
}

function handleAddAccount(e) {
  e.preventDefault();
  const handleInput = document.getElementById('new-account-handle').value.trim();
  const nameInput = document.getElementById('new-account-name').value.trim();
  const groupInput = document.getElementById('new-account-group').value.trim() || 'General';

  const formattedHandle = handleInput.startsWith('@') ? handleInput : `@${handleInput}`;

  const newAcc = {
    id: `acc_${Date.now()}`,
    handle: formattedHandle,
    name: nameInput,
    followers: '0',
    group: groupInput,
    authType: 'Manual Connected'
  };

  appState.accounts.push(newAcc);
  appState.selectedAccountIds.push(newAcc.id);
  saveState();
  renderAccountsUI();
  closeAddAccountModal();
  showToast(`Connected ${formattedHandle} successfully!`);
}

function removeAccount(accId) {
  appState.accounts = appState.accounts.filter(a => a.id !== accId);
  appState.selectedAccountIds = appState.selectedAccountIds.filter(id => id !== accId);
  saveState();
  renderAccountsUI();
  showToast('Profile disconnected.');
}

// Seed Demo Data
function seedSampleCampaign() {
  document.getElementById('campaign-name').value = 'Viral TikTok Summer Drop';
  document.getElementById('caption-a').value = '🚀 Huge summer sale alert! Tap the link in bio to claim 20% off before stock runs out 💥 #SummerSale #Trending #ViralOutfit';
  document.getElementById('caption-b').value = 'Which fit are you rocking this weekend? Option 1 or Option 2? Drop your vote below! 👇 #FitCheck #OOTD #FashionTikTok';
  document.getElementById('distribution-mode').value = 'split-v4';
  handleGenerateVariations(null);
  showToast('Loaded demo campaign parameters!');
  switchTab('variations');
}

// Update Top Metrics
function updateMetrics() {
  document.getElementById('stat-connected').textContent = appState.accounts.length;
  document.getElementById('stat-variations').textContent = appState.variations.length;
  document.getElementById('stat-queued').textContent = appState.queue.filter(i => i.status === 'queued').length;
  document.getElementById('stat-published').textContent = appState.publishedCount;
}

// Toast Notifications
function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
