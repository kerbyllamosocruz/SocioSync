// ==UserScript==
// @name         Cross-Tab OTP Auto-Filler
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  Communicate between Login Tab and Email Tab to fetch and fill OTP codes, plus client-side TikTok Captcha Solving
// @author       Kerby (Discord: buchinyan)
// @match        https://*.tiktok.com/*
// @match        https://app.socialbee.com/*
// @match        https://*.kuku.lu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      tiktok.eulerstream.com
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const currentUrl = window.location.href;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Map to keep track of elements we've clicked and the timestamp of the click
  const clickedElements = new WeakMap();

  function clickElement(el, logMessage, retryDelay = 3000) {
    if (!el) return;

    const now = Date.now();
    const lastClickTime = clickedElements.get(el) || 0;

    if (now - lastClickTime > retryDelay) {
      console.log(`${logMessage} (Attempt: ${lastClickTime ? 'Retry' : 'First'})`);
      clickedElements.set(el, now);

      // Try standard click
      el.click();

      // Dispatch click event as fallback
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }

  // 0. Check for auto-logout request
  if (currentUrl.includes("tiktok.com/logout") || window.location.hash.includes("auto_logout") || window.location.search.includes("auto_logout") || window.location.hash.includes("auto_close") || window.location.search.includes("auto_close")) {
    performTikTokLogout();
    return;
  }

  // Check for successful callback redirect
  if (currentUrl.includes("socialbee.com") && (currentUrl.includes("signin/tiktok/callback") || currentUrl.includes("success") || (currentUrl.includes("profiles") && currentUrl.includes("code=")))) {
    console.log("[OTP Link] Detected TikTok OAuth callback. Setting authorization flag.");
    GM_setValue("tiktok_authorized_flag", true);

    const lastUser = GM_getValue('lastAttemptedUsername');
    if (lastUser) {
      console.log(`[OTP Link] Calling mark-done for ${lastUser} from callback handler`);
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'http://localhost:4782/mark-done',
        data: JSON.stringify({ username: lastUser }),
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  let statusText = null;
  let statusDot = null;
  let panel = null;

  function createFloatingPanel(role) {
    const container = document.createElement("div");
    container.id = "otp-linker-root";
    document.body.appendChild(container);

    const shadow = container.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
        #otp-panel {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 280px;
            background: rgba(17, 24, 39, 0.85);
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
            color: #f3f4f6;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 999999999;
            transition: opacity 0.3s, transform 0.3s;
            overflow: hidden;
        }

        #otp-panel.minimized {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        #otp-panel.minimized #otp-content {
            display: none;
        }

        #otp-panel.minimized #otp-header {
            border: none;
            background: none;
            padding: 0;
            cursor: pointer;
        }

        #otp-panel.minimized #otp-title,
        #otp-panel.minimized #otp-toggle-btn {
            display: none;
        }

        #otp-panel.minimized::before {
            content: '🔑';
            font-size: 20px;
        }

        #otp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            cursor: move;
            user-select: none;
        }

        #otp-title {
            font-weight: 700;
            font-size: 11px;
            letter-spacing: 0.5px;
            background: linear-gradient(90deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 6px;
            text-transform: uppercase;
        }

        #otp-toggle-btn {
            cursor: pointer;
            background: none;
            border: none;
            color: #9ca3af;
            font-size: 14px;
            padding: 2px;
            border-radius: 4px;
            transition: background 0.2s, color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
        }

        #otp-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        #otp-content {
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .otp-info {
            font-size: 10px;
            color: #9ca3af;
            margin-bottom: 2px;
        }

        #otp-status {
            padding: 8px 10px;
            border-radius: 6px;
            font-size: 10.5px;
            font-weight: 500;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .status-info {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            display: inline-block;
            transition: background-color 0.3s, box-shadow 0.3s;
        }

        .status-dot.idle {
            background-color: #9ca3af;
            box-shadow: 0 0 4px rgba(156, 163, 175, 0.4);
        }

        .status-dot.running {
            background-color: #3b82f6;
            box-shadow: 0 0 8px #3b82f6;
            animation: otp-pulse 1.5s infinite;
        }

        .status-dot.success {
            background-color: #10b981;
            box-shadow: 0 0 8px #10b981;
        }

        .status-dot.error {
            background-color: #ef4444;
            box-shadow: 0 0 8px #ef4444;
        }

        @keyframes otp-pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
        }
    `;
    shadow.appendChild(style);

    let csvHtml = "";
    if (role === "Login Tab") {
      csvHtml = `
            <div style="margin-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px;">
                <div style="font-size: 8px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px; letter-spacing: 0.05em; text-align: left;">Autofill from CSV</div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <input type="file" id="otp-csv-file" accept=".csv" style="display: none;" />
                    <button id="otp-csv-upload-btn" style="background: rgba(255, 255, 255, 0.06); border: 1px dashed rgba(255, 255, 255, 0.2); color: #e5e7eb; font-size: 10px; padding: 4px 8px; border-radius: 4px; cursor: pointer; flex: 1;">📂 Load</button>
                    <select id="otp-csv-select" style="background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; font-size: 10px; padding: 4px 6px; border-radius: 4px; flex: 2; display: none; width: 100%;">
                        <option value="">-- Choose Account --</option>
                    </select>
                </div>
                <div id="otp-csv-nav-container" style="display: none; gap: 6px; margin-top: 6px;">
                    <button id="otp-csv-btn-prev" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; font-size: 10px; padding: 4px 8px; border-radius: 4px; cursor: pointer; flex: 1; text-align: center; border-style: solid;">◀ Prev</button>
                    <button id="otp-csv-btn-next" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; font-size: 10px; padding: 4px 8px; border-radius: 4px; cursor: pointer; flex: 1; text-align: center; border-style: solid;">Next ▶</button>
                </div>
            </div>
            <div style="margin-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px;">
                <div style="font-size: 8px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px; letter-spacing: 0.05em; text-align: left;">EulerStream API Key</div>
                <input type="password" id="otp-captcha-key" placeholder="Enter API Key (auto-saved)" style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; font-size: 10px; padding: 4px 8px; border-radius: 4px; width: 100%; box-sizing: border-box;" />
            </div>
      `;
    }

    panel = document.createElement("div");
    panel.id = "otp-panel";
    panel.innerHTML = `
        <div id="otp-header">
            <div id="otp-title">🔑 OTP Linker v3.2</div>
            <button id="otp-toggle-btn" title="Minimize Panel">✕</button>
        </div>
        <div id="otp-content">
            <div class="otp-info">Role: <b>${role}</b></div>
            <div id="otp-status">
                <div class="status-info">
                    <span id="otp-status-dot" class="status-dot idle"></span>
                    <span id="otp-status-text">Status: Idle</span>
                </div>
            </div>
            ${csvHtml}
            <div style="text-align: center; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 8px; color: #6b7280; font-weight: 500; letter-spacing: 0.03em;">
                Developed by <span style="background: linear-gradient(90deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700;">Kerby</span> (Discord: <span style="color: #9ca3af;">buchinyan</span>)
            </div>
        </div>
    `;
    shadow.appendChild(panel);

    statusText = shadow.getElementById("otp-status-text");
    statusDot = shadow.getElementById("otp-status-dot");

    // CSV logic if Login Tab
    if (role === "Login Tab") {
      const fileInput = shadow.getElementById("otp-csv-file");
      const uploadBtn = shadow.getElementById("otp-csv-upload-btn");
      const selectEl = shadow.getElementById("otp-csv-select");
      const btnPrev = shadow.getElementById("otp-csv-btn-prev");
      const btnNext = shadow.getElementById("otp-csv-btn-next");
      const navContainer = shadow.getElementById("otp-csv-nav-container");

      function parseCSVText(text) {
        const rows = text.split(/\r?\n/);
        const accounts = [];

        let emailIndex = 0;
        let passIndex = 1;
        let statusIndex = -1;

        if (rows.length > 0) {
          const firstRow = rows[0].split(",");
          const eIdx = firstRow.findIndex((h) => h.trim().toLowerCase().includes("email") || h.trim().toLowerCase().includes("user"));
          const pIdx = firstRow.findIndex((h) => h.trim().toLowerCase().includes("pass"));
          const sIdx = firstRow.findIndex((h) => h.trim().toLowerCase().includes("status"));
          if (eIdx !== -1) emailIndex = eIdx;
          if (pIdx !== -1) passIndex = pIdx;
          if (sIdx !== -1) statusIndex = sIdx;
        }

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(",");
          if (cols.length > Math.max(emailIndex, passIndex)) {
            const email = cols[emailIndex].trim();
            const pass = cols[passIndex].trim();
            const status = statusIndex !== -1 && cols[statusIndex] ? cols[statusIndex].trim() : "";
            
            // Skip done accounts
            if (status.toLowerCase() === "done") {
              continue;
            }

            if (email && pass) {
              accounts.push({ email, pass });
            }
          }
        }
        return accounts;
      }

      function populateSelect(accounts) {
        window.otpCsvAccounts = accounts;
        selectEl.innerHTML = '<option value="">-- Choose Account --</option>';
        accounts.forEach((acc, idx) => {
          const opt = document.createElement("option");
          opt.value = idx.toString();
          opt.textContent = acc.email;
          selectEl.appendChild(opt);
        });
        selectEl.style.display = "block";
        uploadBtn.textContent = `📂 (${accounts.length})`;

        if (accounts.length > 0) {
          navContainer.style.display = "flex";
        } else {
          navContainer.style.display = "none";
        }

        // Restore active selection
        const savedEmail = GM_getValue("otp_csv_selected_email", "");
        if (savedEmail) {
          const matchIdx = accounts.findIndex(acc => acc.email === savedEmail);
          if (matchIdx !== -1) {
            selectEl.value = matchIdx.toString();
            console.log(`[OTP Link] Restored active selection index: ${matchIdx} (${savedEmail})`);
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }

      uploadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
      });

      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target.result;
          const accounts = parseCSVText(text);
          if (accounts.length > 0) {
            populateSelect(accounts);
            setStatus(`Loaded ${accounts.length} accounts`, "success");
            console.log(`[OTP Link] Loaded ${accounts.length} accounts from CSV.`);
          } else {
            alert("No accounts found. Header needs to be 'email,password' or similar.");
          }
        };
        reader.readAsText(file);
      });

      selectEl.addEventListener("change", async (e) => {
        const idx = parseInt(selectEl.value, 10);
        if (isNaN(idx) || !window.otpCsvAccounts || !window.otpCsvAccounts[idx]) return;

        const account = window.otpCsvAccounts[idx];
        GM_setValue("otp_csv_selected_email", account.email);
        await autofillCredentials(account.email, account.pass);
      });

      btnPrev.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.otpCsvAccounts || window.otpCsvAccounts.length === 0) return;

        let currentIdx = parseInt(selectEl.value, 10);
        if (isNaN(currentIdx)) {
          currentIdx = window.otpCsvAccounts.length - 1;
        } else {
          currentIdx = (currentIdx - 1 + window.otpCsvAccounts.length) % window.otpCsvAccounts.length;
        }

        selectEl.value = currentIdx.toString();
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });

      btnNext.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.otpCsvAccounts || window.otpCsvAccounts.length === 0) return;

        let currentIdx = parseInt(selectEl.value, 10);
        if (isNaN(currentIdx)) {
          currentIdx = 0;
        } else {
          currentIdx = (currentIdx + 1) % window.otpCsvAccounts.length;
        }

        selectEl.value = currentIdx.toString();
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Auto-load from local CSV server if available
      GM_xmlhttpRequest({
        method: "GET",
        url: "http://localhost:4782/accounts",
        onload: function (response) {
          if (response.status === 200) {
            const accounts = parseCSVText(response.responseText);
            if (accounts.length > 0) {
              populateSelect(accounts);
              setStatus(`Auto-loaded ${accounts.length} accounts`, "success");
              console.log(`[OTP Link] Auto-loaded accounts from CSV server.`);
            }
          } else {
            console.log("[OTP Link] Local CSV server returned status: " + response.status);
          }
        },
        onerror: function (err) {
          console.log("[OTP Link] Local CSV server not running/accessible, waiting for manual upload.");
        }
      });

      // API Key saving and fetching logic
      const captchaKeyInput = shadow.getElementById("otp-captcha-key");
      const savedKey = GM_getValue("captcha_api_key", "");
      if (savedKey) {
        captchaKeyInput.value = savedKey;
      }

      captchaKeyInput.addEventListener("input", () => {
        GM_setValue("captcha_api_key", captchaKeyInput.value.trim());
      });

      // Auto-fetch API key from local config server if no saved key exists
      if (!savedKey) {
        GM_xmlhttpRequest({
          method: "GET",
          url: "http://localhost:4782/config",
          onload: function (response) {
            if (response.status === 200) {
              try {
                const config = JSON.parse(response.responseText);
                if (config && config.apiKey) {
                  captchaKeyInput.value = config.apiKey;
                  GM_setValue("captcha_api_key", config.apiKey);
                  console.log("[OTP Link] Auto-fetched and saved CAPTCHA API Key from local server.");
                }
              } catch (e) {
                console.warn("[OTP Link] Error parsing config response:", e);
              }
            }
          },
          onerror: function (err) {
            // Server not running or key not configured, ignore
          }
        });
      }
    }

    async function humanType(element, text, delayMs = 15) {
      element.focus();

      // Get native value setter
      let nativeSetter;
      try {
        nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      } catch (e) {}

      // Clear value first
      if (nativeSetter) {
        nativeSetter.call(element, "");
      } else {
        element.value = "";
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));

      let currentVal = "";
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        currentVal += char;

        element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: char }));

        if (nativeSetter) {
          nativeSetter.call(element, currentVal);
        } else {
          element.value = currentVal;
        }

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: char }));

        await sleep(delayMs);
      }

      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    async function autofillCredentials(email, password) {
      const usernameInput = document.querySelector('input[name="username"], input[placeholder*="Email"], input[placeholder*="username"], input[placeholder*="phone"]');
      const passwordInput = document.querySelector('input[type="password"], input[placeholder*="Password"]');

      if (!usernameInput || !passwordInput) {
        console.warn("[OTP Link] Username or password input not found on page.");
        setStatus("Input fields not found.", "error");
        return;
      }

      GM_setValue('lastAttemptedUsername', email);

      setStatus(`Typing email...`, "running");
      await humanType(usernameInput, email, 15);
      await sleep(200);

      setStatus(`Typing password...`, "running");
      await humanType(passwordInput, password, 15);
      await sleep(300);

      console.log(`[OTP Link] Autofilled credentials for: ${email}`);
      setStatus(`Clicking login...`, "running");

      // Find and click the Log in button
      const loginBtn =
        Array.from(document.querySelectorAll('button[type="submit"], button[data-e2e="login-button"], button[class*="Button-StyledButton"]')).find((btn) => {
          const text = (btn.textContent || "").trim().toLowerCase();
          return text.includes("log in") || text.includes("login") || btn.getAttribute("data-e2e") === "login-button";
        }) || document.querySelector('button[type="submit"], button[data-e2e="login-button"]');

      if (loginBtn) {
        console.log("[OTP Link] Clicking login button:", loginBtn);
        loginBtn.click();
        setStatus("Logged in!", "success");
      } else {
        console.warn("[OTP Link] Login button not found");
        setStatus("Login button not found", "error");
      }
    }

    const toggleBtn = shadow.getElementById("otp-toggle-btn");
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("minimized");
      if (panel.classList.contains("minimized")) {
        toggleBtn.innerHTML = "🔑";
        toggleBtn.title = "Maximize Panel";
      } else {
        toggleBtn.innerHTML = "✕";
        toggleBtn.title = "Minimize Panel";
      }
    });

    panel.addEventListener("click", () => {
      if (panel.classList.contains("minimized")) {
        panel.classList.remove("minimized");
        toggleBtn.innerHTML = "✕";
        toggleBtn.title = "Minimize Panel";
      }
    });

    makeElementDraggable(panel, shadow.getElementById("otp-header"));
  }

  function setStatus(text, state = "idle") {
    if (statusText && statusDot) {
      let displayStatus = text;
      let displayState = state;

      const lowerText = (text || "").toLowerCase();
      if (
        lowerText.includes("maximum number of attempts") ||
        lowerText.includes("too many attempts") ||
        lowerText.includes("try again later") ||
        lowerText.includes("rate limit")
      ) {
        displayStatus = "Try";
        displayState = "idle";
      }

      statusText.textContent = `Status: ${displayStatus}`;
      statusDot.className = `status-dot ${displayState}`;
    }
  }

  function makeElementDraggable(element, dragHeader) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;
    dragHeader.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      const targetTag = e.target.tagName;
      if (targetTag === "BUTTON" || targetTag === "INPUT") return;
      if (element.classList.contains("minimized")) return;

      e = e || window.event;
      e.preventDefault();

      pos3 = e.clientX;
      pos4 = e.clientY;

      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();

      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      element.style.top = element.offsetTop - pos2 + "px";
      element.style.left = element.offsetLeft - pos1 + "px";
      element.style.bottom = "auto";
      element.style.right = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // Helper to check if an email matches a target pattern (handles masking like a***d@domain.com)
  function isEmailMatch(text, targetPattern) {
    if (!text || !targetPattern) return false;
    text = text.toLowerCase().trim();
    targetPattern = targetPattern.toLowerCase().trim();

    // Find all email-like tokens in the text
    const emailRegex = /[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex);
    if (!matches) return false;

    function matchEmails(candidate, target) {
      if (candidate === target) return true;
      if (candidate.includes('*')) {
        const candidateParts = candidate.split('@');
        const targetParts = target.split('@');
        if (candidateParts.length !== 2 || targetParts.length !== 2) return false;

        const [candLocal, candDomain] = candidateParts;
        const [tgtLocal, tgtDomain] = targetParts;

        if (candDomain !== tgtDomain) return false;

        const escapedLocal = candLocal.replace(/[-\/\\^$+.()|[\]{}]/g, "\\$&");
        const regexStr = "^" + escapedLocal.replace(/\*+/g, ".*") + "$";
        try {
          const regex = new RegExp(regexStr);
          return regex.test(tgtLocal);
        } catch (e) {
          return false;
        }
      }
      return false;
    }

    return matches.some((email) => matchEmails(email, targetPattern) || matchEmails(targetPattern, email));
  }

  // ==========================================
  // TAB 1: LOGIN TAB CODE
  // ==========================================
  if (currentUrl.includes("tiktok.com") || currentUrl.includes("socialbee.com")) {
    console.log("[OTP Link] Login tab active.");
    createFloatingPanel("Login Tab");
    setStatus("Listening for OTP fields...", "idle");

    // Listen and auto-click the Authorize/Continue button on TikTok authorization pages
    if (currentUrl.includes("tiktok.com") && (currentUrl.includes("authorize") || currentUrl.includes("oauth") || currentUrl.includes("connect"))) {
      console.log("[OTP Link] On TikTok authorization page. Setting up auto-click and listener...");
      let hasClicked = false;
      const authInterval = setInterval(() => {
        // Find by ID, class, or textaft
        let authBtn = document.getElementById("auth-btn") || document.querySelector("button#auth-btn");

        if (!authBtn) {
          authBtn = document.querySelector("button.css-y1m958");
        }

        if (!authBtn) {
          authBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
            const text = (btn.textContent || "").trim().toLowerCase();
            return text.includes("continue") || text.includes("authorize") || text.includes("agree");
          });
        }

        if (authBtn) {
          if (!authBtn.dataset.sbAuthListenerAdded) {
            authBtn.dataset.sbAuthListenerAdded = "true";
            authBtn.addEventListener("click", () => {
              console.log("[OTP Link] Authorize/Continue clicked manually. Setting authorization flag.");
              GM_setValue("tiktok_authorized_flag", true);

              // Call mark-done on manual click
              const lastUser = GM_getValue('lastAttemptedUsername');
              if (lastUser) {
                GM_xmlhttpRequest({
                  method: 'POST',
                  url: 'http://localhost:4782/mark-done',
                  data: JSON.stringify({ username: lastUser }),
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            });
          }

          if (!hasClicked && authBtn.offsetWidth > 0 && !authBtn.disabled) {
            hasClicked = true;
            console.log("[OTP Link] Auto-clicking Authorize/Continue button:", authBtn);
            setStatus("Auto-clicking authorization button...", "success");
            GM_setValue("tiktok_authorized_flag", true);

            // Call mark-done on automated click
            const lastUser = GM_getValue('lastAttemptedUsername');
            if (lastUser) {
              GM_xmlhttpRequest({
                method: 'POST',
                url: 'http://localhost:4782/mark-done',
                data: JSON.stringify({ username: lastUser }),
                headers: { 'Content-Type': 'application/json' }
              });
            }

            authBtn.click();
            clearInterval(authInterval);

            // Open tiktok.com/logout and autoclose
            setTimeout(() => {
              GM_openInTab("https://www.tiktok.com/logout?auto_close=true", { active: false, insert: true });
            }, 1000);
          }
        }
      }, 1000);
    }

    GM_addValueChangeListener("otp_invalidated", function (key, oldValue, newValue, remote) {
      if (window.otp_requested_state) {
        console.log("[OTP Link] OTP invalidated by main script. Resetting state.");
        window.otp_requested_state = false;
        window.last_invalid_otp = newValue && newValue.otp ? newValue.otp : null;
        setStatus("OTP Invalid. Waiting for new one...", "running");
      }
    });

    // Find the target email address shown on the login page (including masked ones)
    function cleanExtractedEmail(email) {
      if (!email) return null;
      let cleaned = email.trim();
      // Remove trailing ".resend", "resend", "send", etc. (case-insensitive)
      cleaned = cleaned.replace(/\.resend.*$/i, "");
      cleaned = cleaned.replace(/resend.*$/i, "");
      // Remove trailing punctuation/dots
      cleaned = cleaned.replace(/[.,;\s]+$/, "");
      return cleaned;
    }

    function getTargetEmail() {
      // Check for specific elements that commonly display the email (including TikTok Canary)
      const emailElement = document.querySelector('.email-display-class, [class*="email"], [id*="email"], [class*="pc-email-otp-desc"]');
      if (emailElement) {
        const txt = emailElement.textContent.trim();
        const matched = txt.match(/[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (matched) return cleanExtractedEmail(matched[0]);
      }

      // Scan paragraphs, divs, spans for email patterns (including masked characters like '*')
      const maskedEmailRegex = /[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const elements = Array.from(document.querySelectorAll("p, span, div, h2, h3, h4, td"));

      for (const el of elements) {
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        if (el.children.length > 3) continue; // Leaf or small containers only

        const text = el.textContent.trim();
        const matches = text.match(maskedEmailRegex);
        if (matches) {
          for (const email of matches) {
            const cleaned = cleanExtractedEmail(email);
            if (cleaned) {
              const emailLower = cleaned.toLowerCase();
              // Ignore system/brand emails
              if (!emailLower.includes("tiktok.com") && !emailLower.includes("socialbee.com") && !emailLower.includes("example.com")) {
                return cleaned;
              }
            }
          }
        }
      }

      // Fallback: Scan full body text
      const bodyMatches = document.body.innerText.match(maskedEmailRegex);
      if (bodyMatches) {
        for (const email of bodyMatches) {
          const cleaned = cleanExtractedEmail(email);
          if (cleaned) {
            const emailLower = cleaned.toLowerCase();
            if (!emailLower.includes("tiktok.com") && !emailLower.includes("socialbee.com") && !emailLower.includes("example.com")) {
              return cleaned;
            }
          }
        }
      }

      return null;
    }

    // Fill the OTP code in the input fields
    function fillOTP(otpCode) {
      // 1. Try finding a single input box first (e.g. TikTok Tux input, placeholder with code/digit)
      const candidates = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input.tux-input__element-zY3KBY, input[name="otp"], input[placeholder*="6-digit"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]'));

      // Prioritize visible inputs, but fall back to the first matching candidate
      const singleInput = candidates.find((el) => el.offsetWidth > 0) || candidates[0];

      if (singleInput) {
        console.log("[OTP Link] Found single OTP input field:", singleInput);
        try {
          singleInput.focus();
          singleInput.value = otpCode;
          singleInput.dispatchEvent(new Event("input", { bubbles: true }));
          singleInput.dispatchEvent(new Event("change", { bubbles: true }));
          singleInput.dispatchEvent(new Event("keyup", { bubbles: true }));

          // React 16+ Value Tracker Bypass
          const tracker = singleInput._valueTracker;
          if (tracker) {
            tracker.setValue("");
          }

          // Use the prototype descriptor setter to bypass React's wrapper
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeInputValueSetter.call(singleInput, otpCode);

          // Dispatch events again after the native set
          singleInput.dispatchEvent(new Event("input", { bubbles: true }));
          singleInput.dispatchEvent(new Event("change", { bubbles: true }));
          singleInput.dispatchEvent(new Event("blur", { bubbles: true }));
        } catch (e) {
          console.warn("[OTP Link] Native value setter error:", e);
        }
        return true;
      }

      // 2. Try filling sequential inputs (e.g. 6 separate digit boxes)
      const digitInputs = Array.from(document.querySelectorAll('input[type="tel"], input[maxlength="1"], .code-input, [class*="code-digit"]')).filter((el) => el.offsetWidth > 0);
      if (digitInputs.length >= otpCode.length) {
        console.log(`[OTP Link] Found ${digitInputs.length} digit inputs. Filling sequentially.`);
        for (let i = 0; i < otpCode.length; i++) {
          digitInputs[i].value = otpCode[i];
          digitInputs[i].dispatchEvent(new Event("input", { bubbles: true }));
          digitInputs[i].dispatchEvent(new Event("change", { bubbles: true }));
          digitInputs[i].dispatchEvent(new Event("keyup", { bubbles: true }));

          try {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(digitInputs[i], otpCode[i]);
            digitInputs[i].dispatchEvent(new Event("input", { bubbles: true }));
            digitInputs[i].dispatchEvent(new Event("change", { bubbles: true }));
          } catch (e) {}
        }
        return true;
      }

      return false;
    }

    // Monitor if we need an OTP
    function checkForOTPRequirement() {
      const hasDigitInputs = Array.from(document.querySelectorAll('input[type="tel"], input[maxlength="1"]')).filter((el) => el.offsetWidth > 0).length >= 4;
      const singleInput = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input[name="otp"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]')).find((el) => el.offsetWidth > 0);

      if (!hasDigitInputs && !singleInput) return;

      const requestKey = "otp_requested_state";
      if (window[requestKey]) return;

      const targetEmail = getTargetEmail();
      if (!targetEmail) return;

      window[requestKey] = true;
      console.log(`[OTP Link] OTP requested for email: ${targetEmail}`);
      setStatus(`Requesting OTP for ${targetEmail}...`, "running");

      // Listen for the response from the email tab
      const responseListenerId = GM_addValueChangeListener("otp_response", function (key, oldValue, newValue, remote) {
        if (newValue && isEmailMatch(newValue.email, targetEmail) && newValue.otp) {
          console.log(`[OTP Link] Received OTP from mail tab: ${newValue.otp}`);
          setStatus(`Received OTP ${newValue.otp}! Filling...`, "success");

          // Fill with retries to handle latency / late-mounting inputs
          let attempts = 0;
          const maxAttempts = 30;
          const fillInterval = setInterval(() => {
            attempts++;
            const filled = fillOTP(newValue.otp);
            if (filled || attempts >= maxAttempts) {
              clearInterval(fillInterval);
              if (filled) {
                setTimeout(() => {
                  const submitBtn =
                    Array.from(document.querySelectorAll('button[type="submit"], button.login-btn, button[class*="submit"], button[class*="login"], button[data-testid="tux-web-button"], button.tux-button__element-ZBq38f')).find((btn) => {
                      const text = (btn.textContent || "").trim().toLowerCase();
                      return text === "next" || text === "submit" || text === "confirm" || text.includes("next");
                    }) || document.querySelector('button[type="submit"], button.login-btn, button[class*="submit"], button[class*="login"]');

                  if (submitBtn) {
                    console.log("[OTP Link] Clicking submit/next button:", submitBtn);
                    submitBtn.click();
                  }
                }, 200);
              } else {
                console.warn("[OTP Link] Failed to fill OTP after multiple attempts.");
                setStatus("Could not find OTP input field to fill.", "error");
              }
            }
          }, 100);

          GM_removeValueChangeListener(responseListenerId);
        }
      });

      // Send request to the email tab
      GM_setValue("otp_request", {
        email: targetEmail,
        status: "pending",
        timestamp: Date.now(),
        invalid_otp: window.last_invalid_otp || null,
      });
    }

    // Check if we need to select the Email verification method
    function checkForVerificationOption() {
      const items = Array.from(document.querySelectorAll('.pc-home-item-IxNc0F, [class*="pc-home-item-"], [class*="verification-option"]')).filter((el) => el.offsetWidth > 0);

      // Reset the click guard flag if the verification option is no longer present/visible on screen
      if (items.length === 0) {
        window.hasClickedVerificationOption = false;
        return;
      }

      for (const el of items) {
        const text = el.textContent || "";
        const hasEmail = text.includes("Email") && (text.includes("@") || /[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text));

        if (hasEmail) {
          const clickTarget = el.closest('.pc-home-item-IxNc0F, [class*="pc-home-item-"]') || el;

          if (!window.hasClickedVerificationOption) {
            window.hasClickedVerificationOption = true;
            console.log("[OTP Link] Found email verification option. Clicking:", clickTarget);
            setStatus("Selecting Email option...", "running");

            // Dispatch click on the target
            clickTarget.click();

            // Fallback: Click inner elements
            const subElements = clickTarget.querySelectorAll("div, svg, path, span");
            subElements.forEach((child) => {
              try {
                child.click();
              } catch (e) {}
            });
            break;
          }
        }
      }
    }

    // Client-side TikTok Captcha Solver integration
    let isSolvingCaptcha = false;

    async function solveTikTokCaptchaClientSide() {
      if (isSolvingCaptcha) return;

      const captchaContainer = document.querySelector('#captcha-verify-container-main-page, [id*="captcha-verify-container"], [class*="captcha-verify-container"]');
      if (!captchaContainer) return;

      isSolvingCaptcha = true;
      setStatus("CAPTCHA puzzle detected! Attempting to solve...", "running");
      console.log("[OTP Link] CAPTCHA detected. Finding images...");

      try {
        const images = Array.from(captchaContainer.querySelectorAll("img"));
        if (images.length < 2) {
          console.warn("[OTP Link] Could not find CAPTCHA images");
          isSolvingCaptcha = false;
          return;
        }

        let slideImg = null;
        let bgImg = null;

        for (const img of images) {
          const style = window.getComputedStyle(img);
          const isAbsolute = img.classList.contains("cap-absolute") || style.position === "absolute" || img.className.includes("slide");
          if (isAbsolute) {
            slideImg = img;
          } else {
            bgImg = img;
          }
        }

        if (!slideImg || !bgImg) {
          console.warn("[OTP Link] Could not identify slide and background images");
          isSolvingCaptcha = false;
          return;
        }

        const bgSrc = bgImg.getAttribute("src");
        const slideSrc = slideImg.getAttribute("src");

        if (!bgSrc || !slideSrc || !bgSrc.startsWith("data:") || !slideSrc.startsWith("data:")) {
          console.warn("[OTP Link] Image sources are not valid base64 URI");
          isSolvingCaptcha = false;
          return;
        }

        const dragHandle = document.querySelector('.secsdk-captcha-drag-icon, [class*="secsdk-captcha-drag-icon"], [class*="captcha_verify_slide--slide"], [class*="captcha_slider"], .cap-absolute.cap-w-\\[56px\\] button, .secsdk_captcha_slider_button, #captcha_slider');
        if (!dragHandle) {
          console.warn("[OTP Link] Slider handle not found");
          isSolvingCaptcha = false;
          return;
        }

        const cleanBg = bgSrc.replace(/^data:image\/[a-z]+;base64,/, "");
        const cleanSlide = slideSrc.replace(/^data:image\/[a-z]+;base64,/, "");

        // 1. Fetch API Key from GM storage
        let apiKey = GM_getValue("captcha_api_key", "");
        if (!apiKey) {
          throw new Error("EulerStream API Key not configured. Please input it in the UI panel.");
        }

        console.log("[OTP Link] Requesting puzzle solution from EulerStream...");
        const solveRes = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "POST",
            url: "https://tiktok.eulerstream.com/api/v1/captcha/slide",
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
              api_key: apiKey,
              puzzle_image_base64: cleanBg,
              piece_image_base64: cleanSlide,
            }),
            responseType: "json",
            onload: (res) => resolve(res.response),
            onerror: (err) => reject(err),
          });
        });

        const slideX = solveRes && (solveRes.slide_x || solveRes.x);
        if (slideX === undefined) {
          throw new Error("EulerStream CAPTCHA response did not contain x coordinate: " + JSON.stringify(solveRes));
        }

        console.log("[OTP Link] Solved! Target x: " + slideX);
        setStatus("CAPTCHA Solved! Simulating drag...", "success");

        // Calculate scaled drag distance
        const naturalWidth = bgImg.naturalWidth || 340;
        const clientWidth = bgImg.clientWidth || 340;
        const scale = clientWidth / naturalWidth;
        const dragDistance = Math.round(slideX * scale);

        // Perform programmatic human-like dragging on UI
        const rect = dragHandle.getBoundingClientRect();
        const startX = rect.left + rect.width / 2 + window.scrollX;
        const startY = rect.top + rect.height / 2 + window.scrollY;

        function fireMouseEvent(type, x, y) {
          const evt = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
          });
          dragHandle.dispatchEvent(evt);
          document.dispatchEvent(evt);
        }

        // Mouse Down
        fireMouseEvent("mousedown", startX, startY);
        await sleep(100);

        // Drag steps
        const steps = 15;
        for (let i = 1; i <= steps; i++) {
          const progress = i / steps;
          const easeProgress = progress * (2 - progress); // easeOutQuad
          const currentX = startX + dragDistance * easeProgress;
          const currentY = startY + (Math.random() * 4 - 2);
          fireMouseEvent("mousemove", currentX, currentY);
          await sleep(20 + Math.random() * 15);
        }

        // Mouse Up
        await sleep(150);
        const endX = startX + dragDistance;
        fireMouseEvent("mouseup", endX, startY);

        console.log("[OTP Link] Drag simulated successfully.");
        setStatus("Drag complete. Checking CAPTCHA status...", "success");
        await sleep(3000);
      } catch (err) {
        console.error("[OTP Link] CAPTCHA solving failed:", err);
        setStatus("CAPTCHA solving failed: " + err.message, "error");
      } finally {
        isSolvingCaptcha = false;
      }
    }

    function autoClickNavFlows() {
      const isTikTok = window.location.hostname.includes("tiktok.com");

      if (isTikTok) {
        // TikTok Login Method "Use phone / email / username"
        const channelItems = Array.from(document.querySelectorAll('div[data-e2e="channel-item"], div[role="link"], p, span, div'));
        channelItems.forEach((item) => {
          const text = (item.textContent || "").trim().toLowerCase();
          if (text === "use phone / email / username" || text === "phone / email / username") {
            const clickable = item.closest('div[role="link"], [data-e2e="channel-item"], button') || item;
            clickElement(clickable, '[AutoClick] Clicked "Use phone / email / username" menu option.');
          }
        });

        // TikTok "Log in with email or username" link
        let emailLoginLink = document.querySelector('a[href="/login/phone-or-email/email"]');
        if (!emailLoginLink) {
          // Find any element containing "Log in with email or username" or similar
          const candidates = Array.from(document.querySelectorAll("a, span, p, div"));
          emailLoginLink = candidates.find((el) => {
            const text = (el.textContent || "").trim().toLowerCase();
            return text.includes("log in with email") || text.includes("login with email") || text.includes("email or username") || text.includes("use email/username");
          });
        }
        if (emailLoginLink) {
          const clickableLink = emailLoginLink.closest("a, button") || emailLoginLink;
          clickElement(clickableLink, '[AutoClick] Clicked "Log in with email or username" link.');
        }
      }
    }

    function runChecks() {
      checkForOTPRequirement();
      checkForVerificationOption();
      solveTikTokCaptchaClientSide();

      // Look for rate-limit / too many attempts errors on page
      try {
        const possibleErrorSelectors = [
          '[class*="DivError"]',
          '[class*="error-message"]',
          '[class*="error"]',
          '[class*="DivTip"]',
          '[class*="Tip"]',
          '[role="alert"]'
        ];

        let foundError = false;
        for (const selector of possibleErrorSelectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          for (const el of elements) {
            const text = el.textContent?.trim();
            if (text && text.length > 2 && text.length < 150) {
              const lowerText = text.toLowerCase();
              if (
                lowerText.includes('maximum number of attempts') ||
                lowerText.includes('too many attempts') ||
                lowerText.includes('try again later') ||
                lowerText.includes('rate limit')
              ) {
                setStatus("Try", "idle");
                foundError = true;
                break;
              }
            }
          }
          if (foundError) break;
        }

        if (!foundError) {
          const bodyText = document.body.innerText || "";
          if (
            /maximum number of attempts/i.test(bodyText) ||
            /too many attempts/i.test(bodyText) ||
            /try again later/i.test(bodyText) ||
            /rate limit/i.test(bodyText)
          ) {
            setStatus("Try", "idle");
          }
        }
      } catch (e) {
        console.error("[OTP Link] Error checking for page errors:", e);
      }

      try {
        autoClickNavFlows();
      } catch (e) {
        console.error("[OTP Link] Error in autoClickNavFlows:", e);
      }
    }

    runChecks();
    setInterval(runChecks, 100);
  }

  // ==========================================
  // TAB 2: EMAIL TAB CODE (kuku.lu)
  // ==========================================
  if (currentUrl.includes("kuku.lu")) {
    console.log("[OTP Link] Email tab active and listening for OTP requests.");
    createFloatingPanel("Email Tab");
    setStatus("Listening for OTP requests...", "idle");

    // Listen for requests from the login tab
    GM_addValueChangeListener("otp_request", function (key, oldValue, newValue, remote) {
      if (newValue && newValue.status === "pending") {
        console.log(`[OTP Link] New OTP request received for: ${newValue.email}`);
        setStatus(`Request received for ${newValue.email}`, "running");
        findAndSendOTP(newValue.email);
      }
    });

    // Periodically refresh the inbox list if a request is pending
    setInterval(async () => {
      const request = GM_getValue("otp_request");
      if (request && request.status === "pending") {
        console.log("[OTP Link] Request is pending. Refreshing inbox to look for new mail...");
        setStatus(`Refreshing inbox to find mail for ${request.email}...`, "running");

        // Find and click the update/refresh button on kuku.lu
        const reloadImg = document.getElementById("image_reload");
        if (reloadImg) {
          const clickTarget = reloadImg.closest("a, button") || reloadImg;
          clickTarget.click();
        } else {
          const refreshBtn = Array.from(document.querySelectorAll("a, button, span")).find((el) => {
            const text = el.textContent || "";
            return text.includes("更新") || text.toLowerCase().includes("refresh") || text.toLowerCase().includes("update");
          });
          if (refreshBtn) {
            refreshBtn.click();
          }
        }

        // Run the finder
        findAndSendOTP(request.email);
      }
    }, 1500);

    function isRecentEmail(text) {
      if (!text) return false;

      // Look for relative time patterns like (40min), 40 minutes, etc.
      const secMatch = text.match(/(\d+)\s*sec/i) || text.match(/(\d+)\s*秒/);
      if (secMatch) {
        const secs = parseInt(secMatch[1], 10);
        return secs <= 60;
      }

      const minMatch = text.match(/(\d+)\s*min/i) || text.match(/(\d+)\s*分/);
      if (minMatch) {
        const mins = parseInt(minMatch[1], 10);
        return mins <= 1; // Accept if up to 1 minute old
      }

      return false; // Reject by default if no recent relative time indicator is found
    }

    async function findAndSendOTP(targetEmail) {
      // Find all elements that might contain the recipient email or match the masked pattern
      const allElements = Array.from(document.querySelectorAll("a, tr, td, div, span, li"));
      let matchingElement = null;

      for (const el of allElements) {
        const txt = el.innerText || el.textContent || "";
        if (txt.includes(targetEmail) || isEmailMatch(txt, targetEmail)) {
          // Select clickable elements representing the inbox row
          if (el.tagName === "A" || el.tagName === "TR" || el.getAttribute("onclick") || el.classList.contains("mail-row") || el.classList.contains("inbox-row")) {
            if (isRecentEmail(txt)) {
              matchingElement = el;
              break;
            }
          }
        }
      }

      // Fallback: look for the domain part of the target email
      if (!matchingElement) {
        const domainPart = targetEmail.split("@")[1];
        if (domainPart) {
          for (const el of allElements) {
            const txt = el.innerText || el.textContent || "";
            if (txt.includes(domainPart)) {
              const rowCandidate = el.closest("a, tr, li, [onclick]") || el;
              const rowText = rowCandidate.innerText || rowCandidate.textContent || "";
              if (isRecentEmail(rowText)) {
                matchingElement = rowCandidate;
                break;
              }
            }
          }
        }
      }

      if (!matchingElement) {
        console.log(`[OTP Link] No matching email row found for ${targetEmail} yet.`);
        setStatus(`Waiting for email to arrive...`, "running");
        return;
      }

      // Check if the OTP is already visible in the inbox list item text (e.g. subject or preview)
      const rowText = matchingElement.innerText || matchingElement.textContent || "";
      const inlineOtpMatch = rowText.match(/\b\d{6}\b/) || rowText.match(/\b\d{4}\b/);
      if (inlineOtpMatch) {
        const otpCode = inlineOtpMatch[0];
        const currentReq = GM_getValue("otp_request");
        if (currentReq && currentReq.invalid_otp === otpCode) {
          console.log(`[OTP Link] Found OTP ${otpCode} inline but it was marked invalid. Waiting for new email...`);
          return;
        }
        console.log(`[OTP Link] Found OTP Code directly in inbox item: ${otpCode}. Sending response.`);
        setStatus(`Found OTP ${otpCode}! Sending to Login tab...`, "success");

        GM_setValue("otp_response", {
          email: targetEmail,
          otp: otpCode,
          timestamp: Date.now(),
        });

        GM_setValue("otp_request", {
          email: targetEmail,
          status: "completed",
          timestamp: Date.now(),
        });

        return;
      }

      console.log("[OTP Link] Found matching email element. Clicking to open...");
      setStatus("Email matched! Opening...", "running");
      matchingElement.click();

      // Try to extract OTP over multiple attempts to account for loading delay
      for (let attempt = 1; attempt <= 15; attempt++) {
        await new Promise((r) => setTimeout(r, 200));

        const selectors = ["#area_maildata", "#area_mailbody", "#area_mail_body", "#mail_body", "#mail_content", ".mail-body", ".email-body", "iframe"];

        let bodyText = "";
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            if (el.tagName === "IFRAME") {
              try {
                bodyText += " " + el.contentWindow.document.body.innerText;
              } catch (e) {}
            } else {
              bodyText += " " + el.innerText;
            }
          }
        }

        if (!bodyText.trim()) {
          bodyText = document.body.innerText;
        }

        // Match 6-digit or 4-digit codes
        const otpMatch = bodyText.match(/\b\d{6}\b/) || bodyText.match(/\b\d{4}\b/);
        if (otpMatch) {
          const otpCode = otpMatch[0];
          const currentReq = GM_getValue("otp_request");
          if (currentReq && currentReq.invalid_otp === otpCode) {
            console.log(`[OTP Link] Found OTP ${otpCode} inside email but it was marked invalid. Closing and waiting...`);
            return;
          }
          console.log(`[OTP Link] Found OTP Code: ${otpCode}. Sending response.`);
          setStatus(`Found OTP ${otpCode}! Sending to Login tab...`, "success");

          GM_setValue("otp_response", {
            email: targetEmail,
            otp: otpCode,
            timestamp: Date.now(),
          });

          GM_setValue("otp_request", {
            email: targetEmail,
            status: "completed",
            timestamp: Date.now(),
          });

          return;
        }
      }

      console.log("[OTP Link] Failed to find a valid code inside the opened email.");
      setStatus("Failed to extract OTP from email body.", "error");
    }
  }

  async function performTikTokLogout() {
    console.log("[OTP Link] Initiating auto-logout on TikTok...");

    // Wait for the page to load
    await sleep(2000);

    // Case 1: Check if there is a direct "Log out" confirmation button visible on the page (e.g. if we are on a logout confirmation page)
    let confirmBtn = Array.from(document.querySelectorAll("button, a, div")).find((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      return text === "log out" || text === "logout" || text === "confirm";
    });

    if (confirmBtn && confirmBtn.offsetWidth > 0) {
      console.log("[OTP Link] Found direct logout button on page. Clicking...");
      confirmBtn.click();
      await sleep(3000);

      const shouldClose = window.location.href.toLowerCase().includes("close") || window.location.hash.toLowerCase().includes("close") || window.location.search.toLowerCase().includes("close");
      if (shouldClose) {
        console.log("[OTP Link] Closing tab...");
        window.close();
      }
      return;
    }

    // Case 2: Standard flow (hover profile avatar, click logout, then click confirm)
    console.log("[OTP Link] Falling back to profile menu hover logout...");

    let profileIcon = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      profileIcon = document.querySelector('[data-e2e="profile-icon"], img[class*="Avatar"], [class*="avatar"], .tiktok-avatar');
      if (profileIcon && profileIcon.offsetWidth > 0) {
        break;
      }
      await sleep(500);
    }

    if (!profileIcon) {
      console.warn("[OTP Link] Profile icon not found. Maybe already logged out?");
      const shouldClose = window.location.href.toLowerCase().includes("close") || window.location.hash.toLowerCase().includes("close") || window.location.search.toLowerCase().includes("close");
      if (shouldClose) {
        window.close();
      }
      return;
    }

    console.log("[OTP Link] Hovering/clicking profile icon...");
    profileIcon.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    profileIcon.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    profileIcon.click();
    await sleep(1500);

    let logoutBtn = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      logoutBtn = Array.from(document.querySelectorAll("a, button, div, span, li")).find((el) => {
        const text = (el.textContent || "").trim().toLowerCase();
        const e2e = el.getAttribute("data-e2e") || "";
        return text === "log out" || text === "logout" || e2e.includes("logout") || e2e.includes("log-out");
      });
      if (logoutBtn && logoutBtn.offsetWidth > 0) {
        break;
      }
      await sleep(250);
    }

    if (!logoutBtn) {
      console.warn("[OTP Link] Logout button not found in menu.");
      const shouldClose = window.location.href.toLowerCase().includes("close") || window.location.hash.toLowerCase().includes("close") || window.location.search.toLowerCase().includes("close");
      if (shouldClose) {
        window.close();
      }
      return;
    }

    console.log("[OTP Link] Clicking logout button...");
    logoutBtn.click();
    await sleep(1500);

    // Confirm logout in modal
    let modalConfirmBtn = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      modalConfirmBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
        const text = (btn.textContent || "").trim().toLowerCase();
        return text === "log out" || text === "logout" || text === "confirm";
      });
      if (modalConfirmBtn && modalConfirmBtn.offsetWidth > 0) {
        break;
      }
      await sleep(250);
    }

    if (modalConfirmBtn) {
      console.log("[OTP Link] Clicking confirm button in logout modal...");
      modalConfirmBtn.click();
      await sleep(3000);
    }

    console.log("[OTP Link] Logout completed.");
    const shouldClose = window.location.href.toLowerCase().includes("close") || window.location.hash.toLowerCase().includes("close") || window.location.search.toLowerCase().includes("close");
    if (shouldClose) {
      console.log("[OTP Link] Closing tab...");
      window.close();
    }
  }
})();
