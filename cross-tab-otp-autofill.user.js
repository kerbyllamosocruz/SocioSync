// ==UserScript==
// @name         Cross-Tab OTP Auto-Filler
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  Communicate between Login Tab and Email Tab to fetch and fill OTP codes, plus client-side TikTok Captcha Solving
// @author       Kerby (Discord: buchinyan)
// @match        https://*.tiktok.com/*
// @match        https://app.socialbee.com/*
// @match        https://*.kuku.lu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      localhost
// @connect      tiktok.eulerstream.com
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const currentUrl = window.location.href;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Handle case where we got stuck on raw TikTok JSON response
  try {
    const bodyText = (document.body.innerText || "").trim();
    if (bodyText.startsWith('{"data":') && bodyText.includes('"error_code":')) {
      console.warn("[OTP Link] Detected raw JSON response page. Redirecting back to login...");
      window.location.href = "https://www.tiktok.com/login/phone-or-email/email";
      return;
    }
  } catch (e) {}

  // Helper to mark an account as done locally (update GM storage CSV text)
  function markAccountAsDoneLocal(username) {
    if (!username) return;
    username = username.trim();
    const rawText = GM_getValue("otp_csv_raw_text", "");
    if (!rawText) return;

    const lines = rawText.split(/\r?\n/);
    let updated = false;

    let emailIndex = 0;
    let passIndex = 1;
    let statusIndex = -1;
    let hasStatusHeader = false;

    if (lines.length > 0) {
      const firstRow = lines[0].split(",");
      const eIdx = firstRow.findIndex((h) => h.trim().toLowerCase().includes("email") || h.trim().toLowerCase().includes("user"));
      const pIdx = firstRow.findIndex((h) => h.trim().toLowerCase().includes("pass"));
      const sIdx = firstRow.findIndex((h) => h.trim().toLowerCase().includes("status"));

      if (eIdx !== -1) emailIndex = eIdx;
      if (pIdx !== -1) passIndex = pIdx;
      if (sIdx !== -1) {
        statusIndex = sIdx;
        hasStatusHeader = true;
      }
    }

    if (!hasStatusHeader && lines.length > 0) {
      const firstRowParts = lines[0].split(",");
      firstRowParts.push("status");
      lines[0] = firstRowParts.join(",");
      statusIndex = firstRowParts.length - 1;
    } else if (statusIndex === -1 && lines.length > 0) {
      statusIndex = 2; // Default fallback
    }

    const updatedLines = lines.map((line, idx) => {
      if (idx === 0) return line;
      if (!line.trim()) return line;

      const parts = line.split(",");
      const email = parts[emailIndex] ? parts[emailIndex].trim() : "";

      // Ensure parts array has enough elements
      while (parts.length <= Math.max(emailIndex, passIndex, statusIndex)) {
        parts.push("");
      }

      // Clean legacy " - Done" from password if present
      let pass = parts[passIndex] ? parts[passIndex].trim() : "";
      if (pass.endsWith(" - Done")) {
        pass = pass.replace(" - Done", "").trim();
        parts[passIndex] = pass;
        parts[statusIndex] = "Done";
      }

      if (email.toLowerCase() === username.toLowerCase()) {
        if (parts[statusIndex].toLowerCase() !== "done") {
          updated = true;
          parts[statusIndex] = "Done";
        }
      }

      return parts.join(",");
    });

    if (updated) {
      const newText = updatedLines.join("\n");
      GM_setValue("otp_csv_raw_text", newText);
      console.log(`[OTP Link] Marked ${username} as done in local GM storage CSV`);
    }
  }

  // Wrapper function to mark done locally and optionally send to server
  function markAccountDone(username) {
    if (!username) return;
    console.log(`[OTP Link] Marking account done: ${username}`);

    // 1. Mark done locally in GM storage CSV
    markAccountAsDoneLocal(username);

    // 2. Try to mark done on local server (optional)
    GM_xmlhttpRequest({
      method: "POST",
      url: "http://localhost:4782/mark-done",
      data: JSON.stringify({ username: username }),
      headers: { "Content-Type": "application/json" },
      onload: function (res) {
        console.log(`[OTP Link] Server mark-done response status: ${res.status}`);
      },
      onerror: function (err) {
        console.log("[OTP Link] Local server offline, mark-done not updated on server.");
      },
    });
  }

  // Map to keep track of elements we've clicked and the timestamp of the click
  const clickedElements = new WeakMap();

  function clickElement(el, logMessage, retryDelay = 3000) {
    if (!el) return;

    const now = Date.now();
    const lastClickTime = clickedElements.get(el) || 0;

    if (now - lastClickTime > retryDelay) {
      console.log(`${logMessage} (Attempt: ${lastClickTime ? "Retry" : "First"})`);
      clickedElements.set(el, now);

      // Try standard click
      el.click();

      // Dispatch click event as fallback
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
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

    // Clear active selection to prevent loop on redirect back to social-accounts page
    GM_setValue("otp_csv_selected_email", "");

    const lastUser = GM_getValue("lastAttemptedUsername");
    if (lastUser) {
      console.log(`[OTP Link] Calling mark-done for ${lastUser} from callback handler`);
      markAccountDone(lastUser);
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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="font-size: 8px; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.05em; text-align: left;">Autofill from CSV</div>
                    <button id="otp-csv-toggle-btn" style="background: none; border: none; color: #818cf8; font-size: 8px; cursor: pointer; padding: 2px 4px; border-radius: 3px; font-weight: 600; transition: background 0.2s;">📝 Edit CSV</button>
                </div>
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
                <div id="otp-csv-editor-container" style="display: none; margin-top: 6px; flex-direction: column; gap: 6px;">
                    <textarea id="otp-csv-textarea" placeholder="username,password,status&#10;user1,pass1,&#10;user2,pass2,Done" style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; font-size: 9px; font-family: monospace; width: 100%; height: 90px; box-sizing: border-box; resize: vertical; padding: 6px; border-radius: 4px;"></textarea>
                    <button id="otp-csv-save-btn" style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); border: none; color: #fff; font-size: 10px; padding: 5px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: 600;">Save & Apply</button>
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
            <div id="otp-title">🔑 OTP Linker v3.5</div>
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

      const csvToggleBtn = shadow.getElementById("otp-csv-toggle-btn");
      const editorContainer = shadow.getElementById("otp-csv-editor-container");
      const csvTextarea = shadow.getElementById("otp-csv-textarea");
      const csvSaveBtn = shadow.getElementById("otp-csv-save-btn");

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
          const matchIdx = accounts.findIndex((acc) => acc.email === savedEmail);
          if (matchIdx !== -1) {
            selectEl.value = matchIdx.toString();
            console.log(`[OTP Link] Restored active selection index: ${matchIdx} (${savedEmail})`);
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }

      // Load initial CSV text if saved in GM
      const initialCsvText = GM_getValue("otp_csv_raw_text", "");
      if (initialCsvText) {
        csvTextarea.value = initialCsvText;
        const accounts = parseCSVText(initialCsvText);
        populateSelect(accounts);
      }

      csvToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (editorContainer.style.display === "none" || !editorContainer.style.display) {
          editorContainer.style.display = "flex";
          csvToggleBtn.textContent = "✕ Close Editor";
          csvToggleBtn.style.color = "#ef4444";
        } else {
          editorContainer.style.display = "none";
          csvToggleBtn.textContent = "📝 Edit CSV";
          csvToggleBtn.style.color = "#818cf8";
        }
      });

      csvSaveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = csvTextarea.value.trim();
        GM_setValue("otp_csv_raw_text", text);
        const accounts = parseCSVText(text);
        if (accounts.length > 0) {
          populateSelect(accounts);
          setStatus(`Parsed ${accounts.length} accounts`, "success");
        } else {
          setStatus("Parsed 0 accounts. Check format.", "error");
        }
        editorContainer.style.display = "none";
        csvToggleBtn.textContent = "📝 Edit CSV";
        csvToggleBtn.style.color = "#818cf8";
      });

      // Synchronize CSV text changes across tabs
      GM_addValueChangeListener("otp_csv_raw_text", function (key, oldValue, newValue, remote) {
        if (csvTextarea && csvTextarea.value !== newValue) {
          csvTextarea.value = newValue || "";
        }
        const accounts = parseCSVText(newValue || "");
        populateSelect(accounts);
      });

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
          csvTextarea.value = text;
          GM_setValue("otp_csv_raw_text", text);
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

      let activeAccountIdx = -1;

      selectEl.addEventListener("focus", () => {
        const val = parseInt(selectEl.value, 10);
        if (!isNaN(val)) {
          activeAccountIdx = val;
          selectEl.value = "";
        }
      });

      selectEl.addEventListener("mousedown", () => {
        const val = parseInt(selectEl.value, 10);
        if (!isNaN(val)) {
          activeAccountIdx = val;
          selectEl.value = "";
        }
      });

      selectEl.addEventListener("blur", () => {
        if (selectEl.value === "" && activeAccountIdx !== -1) {
          selectEl.value = activeAccountIdx.toString();
        }
      });

      selectEl.addEventListener("change", async (e) => {
        const idx = parseInt(selectEl.value, 10);
        if (isNaN(idx) || !window.otpCsvAccounts || !window.otpCsvAccounts[idx]) {
          if (activeAccountIdx !== -1) {
            selectEl.value = activeAccountIdx.toString();
          }
          return;
        }

        activeAccountIdx = idx;
        const account = window.otpCsvAccounts[idx];
        GM_setValue("otp_csv_selected_email", account.email);
        GM_setValue("otp_request", null);
        GM_setValue("otp_response", null);
        window.hasClickedSocialBeeReconnect = false; // Reset click guard on selection change
        await autofillCredentials(account.email, account.pass);
      });

      btnPrev.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!window.otpCsvAccounts || window.otpCsvAccounts.length === 0) return;

        let currentIdx = activeAccountIdx !== -1 ? activeAccountIdx : parseInt(selectEl.value, 10);
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

        let currentIdx = activeAccountIdx !== -1 ? activeAccountIdx : parseInt(selectEl.value, 10);
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
            const text = response.responseText;
            csvTextarea.value = text;
            GM_setValue("otp_csv_raw_text", text);
            const accounts = parseCSVText(text);
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
        },
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
          },
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

    let isAutofilling = false;

    async function autofillCredentials(email, password) {
      if (isAutofilling) {
        console.log("[OTP Link] Autofill already in progress. Skipping.");
        return;
      }
      isAutofilling = true;

      // Cleared OTP state before autofill
      GM_setValue("otp_request", null);
      GM_setValue("otp_response", null);
      window.otp_requested_email = null;

      try {
        const usernameInput = document.querySelector('input[name="username"], input[placeholder*="Email"], input[placeholder*="username"], input[placeholder*="phone"]');
        const passwordInput = document.querySelector('input[type="password"], input[placeholder*="Password"]');

        if (!usernameInput || !passwordInput) {
          console.warn("[OTP Link] Username or password input not found on page.");
          setStatus("Input fields not found.", "error");
          return;
        }

        GM_setValue("lastAttemptedUsername", email);

        setStatus(`Typing email (${email})...`, "running");
        await humanType(usernameInput, email, 15);
        await sleep(200);

        setStatus(`Typing password...`, "running");
        await humanType(passwordInput, password, 15);
        await sleep(300);

        console.log(`[OTP Link] Autofilled credentials for: ${email}`);

        // Wait for page hydration to prevent raw JSON response from native form submission
        setStatus("Awaiting page hydration...", "running");
        await sleep(2500);

        setStatus("Clicking login button...", "running");

        // Find and click the Log in button
        const loginBtn =
          Array.from(document.querySelectorAll('button[type="submit"], button[data-e2e="login-button"], button[class*="Button-StyledButton"]')).find((btn) => {
            const text = (btn.textContent || "").trim().toLowerCase();
            return text.includes("log in") || text.includes("login") || btn.getAttribute("data-e2e") === "login-button";
          }) || document.querySelector('button[type="submit"], button[data-e2e="login-button"]');

        if (loginBtn) {
          console.log("[OTP Link] Clicking login button:", loginBtn);
          loginBtn.click();
          setStatus("Login clicked! Awaiting OTP or Callback...", "running");

          // Added OTP/callback detection after login
          const startTime = Date.now();
          const timeoutMs = 30000;
          let loginOutcomeDetected = false;

          while (Date.now() - startTime < timeoutMs) {
            // Check for callback redirect or authorization flag
            const isAuthorized = GM_getValue("tiktok_authorized_flag", false);
            const currentHref = window.location.href;
            const isCallback = currentHref.includes("callback") || currentHref.includes("profiles") || currentHref.includes("success");

            if (isAuthorized || isCallback) {
              console.log("[OTP Link] Callback redirect or authorization detected!");
              setStatus("Login & Callback successful!", "success");
              loginOutcomeDetected = true;
              break;
            }

            // Check for OTP response or request state
            const otpResp = GM_getValue("otp_response", null);
            if ((otpResp && isEmailMatch(otpResp.email, email) && otpResp.otp) || window.otp_requested_email) {
              console.log("[OTP Link] OTP flow triggered after login click.");
              setStatus("OTP required - processing verification...", "running");
              loginOutcomeDetected = true;
              break;
            }

            // Check for visible OTP input field on page
            const otpInput = document.querySelector('input[data-testid="tux-web-input"], input[type="tel"], input[name="otp"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="6-digit"]');
            if (otpInput && otpInput.offsetWidth > 0) {
              console.log("[OTP Link] OTP input field detected on page.");
              setStatus("OTP field detected. Waiting for OTP code...", "running");
              loginOutcomeDetected = true;
              break;
            }

            await sleep(500);
          }

          if (!loginOutcomeDetected) {
            console.log("[OTP Link] Login click wait completed without explicit OTP/Callback detection.");
            setStatus("Login click complete", "idle");
          }
        } else {
          console.warn("[OTP Link] Login button not found");
          setStatus("Login button not found", "error");
        }
      } catch (err) {
        console.error("[OTP Link] Error during autofillCredentials:", err);
        setStatus("Autofill error: " + (err.message || err), "error");
      } finally {
        isAutofilling = false;
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
      if (lowerText.includes("maximum number of attempts") || lowerText.includes("too many attempts") || lowerText.includes("try again later") || lowerText.includes("rate limit")) {
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
      if (candidate.includes("*")) {
        const candidateParts = candidate.split("@");
        const targetParts = target.split("@");
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

  // Helper to find TikTok Connect/Reconnect button/form on SocialBee
  function findTikTokReconnectButton() {
    let btn = document.querySelector('form[action*="/signin/tiktok"] button, form[action="/signin/tiktok"] button, a[href*="/signin/tiktok"]');
    if (btn) return btn;

    btn = document.querySelector('.connect-social-tiktok button, [class*="connect-social-tiktok"] button');
    if (btn) return btn;

    const allButtons = Array.from(document.querySelectorAll("button, a"));
    for (const element of allButtons) {
      const text = (element.textContent || "").trim().toLowerCase();
      const parentForm = element.closest("form");
      const action = parentForm ? parentForm.getAttribute("action") || "" : "";

      if ((text.includes("reconnect") || text.includes("connect")) && (text.includes("tiktok") || action.includes("tiktok") || element.getAttribute("href")?.includes("tiktok"))) {
        return element;
      }
    }
    return null;
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
              const lastUser = GM_getValue("lastAttemptedUsername");
              if (lastUser) {
                markAccountDone(lastUser);
              }
            });
          }

          if (!hasClicked && authBtn.offsetWidth > 0 && !authBtn.disabled) {
            hasClicked = true;
            console.log("[OTP Link] Auto-clicking Authorize/Continue button:", authBtn);
            setStatus("Auto-clicking authorization button...", "success");
            GM_setValue("tiktok_authorized_flag", true);

            // Call mark-done on automated click
            const lastUser = GM_getValue("lastAttemptedUsername");
            if (lastUser) {
              markAccountDone(lastUser);
            }

            authBtn.click();
            clearInterval(authInterval);

            // Open tiktok.com/logout window and autoclose after logout completes
            setTimeout(() => {
              const logoutTab = GM_openInTab("https://www.tiktok.com/logout?auto_close=true", { active: false, insert: true });
              setTimeout(() => {
                if (logoutTab && typeof logoutTab.close === "function") {
                  try {
                    logoutTab.close();
                  } catch (e) {}
                }
              }, 10000);
            }, 1000);
          }
        }
      }, 1000);
    }

    GM_addValueChangeListener("otp_invalidated", function (key, oldValue, newValue, remote) {
      if (window.otp_requested_email) {
        console.log("[OTP Link] OTP invalidated by main script. Resetting state.");
        window.otp_requested_email = null;
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

    let isFillingOTP = false;

    // Fill the OTP code in the input fields with human-like typing (12 46 56 rhythm, 30-70ms per char)
    async function fillOTP(otpCode) {
      if (isFillingOTP) return false;
      isFillingOTP = true;

      const getRandomDelay = (min = 30, max = 70) => Math.floor(Math.random() * (max - min + 1)) + min;

      try {
        // 1. Try finding a single input box first (e.g. TikTok Tux input, placeholder with code/digit)
        const candidates = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input.tux-input__element-zY3KBY, input[name="otp"], input[placeholder*="6-digit"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]'));

        // Prioritize visible inputs, but fall back to the first matching candidate
        const singleInput = candidates.find((el) => el.offsetWidth > 0) || candidates[0];

        if (singleInput) {
          console.log("[OTP Link] Found single OTP input field. Typing with 12 46 56 rhythm (30-70ms/char):", singleInput);
          try {
            singleInput.focus();

            let nativeSetter;
            try {
              nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            } catch (e) {}

            if (nativeSetter) {
              nativeSetter.call(singleInput, "");
            } else {
              singleInput.value = "";
            }
            singleInput.dispatchEvent(new Event("input", { bubbles: true }));

            let currentVal = "";
            for (let i = 0; i < otpCode.length; i++) {
              const char = otpCode[i];
              currentVal += char;

              singleInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: char }));

              if (nativeSetter) {
                nativeSetter.call(singleInput, currentVal);
              } else {
                singleInput.value = currentVal;
              }

              const tracker = singleInput._valueTracker;
              if (tracker) {
                tracker.setValue("");
              }

              singleInput.dispatchEvent(new Event("input", { bubbles: true }));
              singleInput.dispatchEvent(new Event("change", { bubbles: true }));
              singleInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: char }));

              // Random delay 30-70ms per character + natural pair pause ("12 46 56")
              let delay = getRandomDelay(30, 70);
              if ((i + 1) % 2 === 0 && (i + 1) < otpCode.length) {
                delay += getRandomDelay(150, 250);
              }
              await sleep(delay);
            }

            singleInput.dispatchEvent(new Event("blur", { bubbles: true }));
          } catch (e) {
            console.warn("[OTP Link] Native value setter error:", e);
          }
          return true;
        }

        // 2. Try filling sequential inputs (e.g. 6 separate digit boxes)
        const digitInputs = Array.from(document.querySelectorAll('input[type="tel"], input[maxlength="1"], .code-input, [class*="code-digit"]')).filter((el) => el.offsetWidth > 0);
        if (digitInputs.length >= otpCode.length) {
          console.log(`[OTP Link] Found ${digitInputs.length} digit inputs. Typing with 12 46 56 rhythm (30-70ms/char).`);
          for (let i = 0; i < otpCode.length; i++) {
            const char = otpCode[i];
            const inputEl = digitInputs[i];
            inputEl.focus();
            inputEl.value = char;

            inputEl.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: char }));
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
            inputEl.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: char }));

            try {
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
              nativeInputValueSetter.call(inputEl, char);
              inputEl.dispatchEvent(new Event("input", { bubbles: true }));
              inputEl.dispatchEvent(new Event("change", { bubbles: true }));
            } catch (e) {}

            let delay = getRandomDelay(30, 70);
            if ((i + 1) % 2 === 0 && (i + 1) < otpCode.length) {
              delay += getRandomDelay(150, 250);
            }
            await sleep(delay);
          }
          return true;
        }

        return false;
      } finally {
        isFillingOTP = false;
      }
    }

    // Monitor if we need an OTP
    function checkForOTPRequirement() {
      const hasDigitInputs = Array.from(document.querySelectorAll('input[type="tel"], input[maxlength="1"]')).filter((el) => el.offsetWidth > 0).length >= 4;
      const singleInput = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input[name="otp"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]')).find((el) => el.offsetWidth > 0);

      if (!hasDigitInputs && !singleInput) return;

      const targetEmail = getTargetEmail();
      if (!targetEmail) return;

      // If we've already requested OTP for this specific email, skip
      if (window.otp_requested_email === targetEmail) return;

      window.otp_requested_email = targetEmail;
      console.log(`[OTP Link] OTP requested for email: ${targetEmail}`);
      setStatus(`Requesting OTP for ${targetEmail}...`, "running");

      // Clear any stale OTP response for a different email
      const staleResp = GM_getValue("otp_response");
      if (staleResp && (!staleResp.email || !isEmailMatch(staleResp.email, targetEmail))) {
        console.log(`[OTP Link] Clearing old/mismatched OTP response for ${staleResp?.email}`);
        GM_setValue("otp_response", null);
      }

      // Remove any existing response listener to prevent duplicate/leaked handlers
      if (window.otp_response_listener_id) {
        GM_removeValueChangeListener(window.otp_response_listener_id);
      }

      // Listen for the response from the email tab
      const responseListenerId = GM_addValueChangeListener("otp_response", function (key, oldValue, newValue, remote) {
        if (newValue && newValue.email && isEmailMatch(newValue.email, targetEmail) && newValue.otp) {
          console.log(`[OTP Link] Received matching OTP for ${newValue.email}: ${newValue.otp}`);
          setStatus(`Received OTP ${newValue.otp}! Filling...`, "success");

          // Fill with retries to handle latency / late-mounting inputs
          let attempts = 0;
          const maxAttempts = 30;
          let isAttempting = false;
          const fillInterval = setInterval(async () => {
            if (isAttempting) return;
            isAttempting = true;
            attempts++;
            try {
              const filled = await fillOTP(newValue.otp);
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
                  }, 300);
                } else {
                  console.warn("[OTP Link] Failed to fill OTP after multiple attempts.");
                  setStatus("Could not find OTP input field to fill.", "error");
                }
              }
            } finally {
              isAttempting = false;
            }
          }, 150);

          GM_removeValueChangeListener(responseListenerId);
          if (window.otp_response_listener_id === responseListenerId) {
            window.otp_response_listener_id = null;
          }
        }
      });
      window.otp_response_listener_id = responseListenerId;

      // Also check if valid response is already available in GM storage right now
      const currentResp = GM_getValue("otp_response");
      if (currentResp && currentResp.email && isEmailMatch(currentResp.email, targetEmail) && currentResp.otp) {
        console.log(`[OTP Link] Found existing matching OTP response for ${currentResp.email}: ${currentResp.otp}`);
        fillOTP(currentResp.otp);
        return;
      }

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
        // Query only specific interactive elements and text elements (avoiding generic div query)
        const channelItems = Array.from(document.querySelectorAll('div[data-e2e="channel-item"], div[role="link"], p, span, button'));
        let clickedChannel = false;

        for (const item of channelItems) {
          const text = (item.textContent || "").trim().toLowerCase();
          if (text === "use phone / email / username" || text === "phone / email / username") {
            const clickable = item.closest('div[role="link"], [data-e2e="channel-item"], button') || item;
            clickElement(clickable, '[AutoClick] Clicked "Use phone / email / username" menu option.');
            clickedChannel = true;
            break; // Stop scanning once we've triggered the click on the best candidate
          }
        }

        if (clickedChannel) return; // If we clicked this flow, skip other navigation checks in this tick

        // TikTok "Log in with email or username" link
        let emailLoginLink = document.querySelector('a[href="/login/phone-or-email/email"]');
        if (!emailLoginLink) {
          // Find any element containing "Log in with email or username" or similar (avoiding generic div query)
          const candidates = Array.from(document.querySelectorAll("a, button, p, span"));
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

    function checkForSocialBeeReconnect() {
      if (!window.location.hostname.includes("socialbee.com")) return;

      const savedEmail = GM_getValue("otp_csv_selected_email", "");
      if (!savedEmail) return;

      const currentHref = window.location.href;
      if (currentHref.includes("callback") || currentHref.includes("success") || currentHref.includes("code=")) {
        return;
      }

      if (window.hasClickedSocialBeeReconnect) return;

      const reconnectBtn = findTikTokReconnectButton();
      if (reconnectBtn && reconnectBtn.offsetWidth > 0) {
        window.hasClickedSocialBeeReconnect = true;
        console.log(`[OTP Link] Found TikTok Reconnect button for ${savedEmail}. Clicking...`);
        setStatus("Clicking TikTok Reconnect button...", "success");
        clickElement(reconnectBtn, "[AutoClick] Clicked TikTok Reconnect button.");
      }
    }

    function runChecks() {
      checkForOTPRequirement();
      checkForVerificationOption();
      solveTikTokCaptchaClientSide();
      checkForSocialBeeReconnect();

      // Look for rate-limit / too many attempts errors on page
      try {
        const possibleErrorSelectors = ['[class*="DivError"]', '[class*="error-message"]', '[class*="error"]', '[class*="DivTip"]', '[class*="Tip"]', '[role="alert"]'];

        let foundError = false;
        for (const selector of possibleErrorSelectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          for (const el of elements) {
            const text = el.textContent?.trim();
            if (text && text.length > 2 && text.length < 150) {
              const lowerText = text.toLowerCase();
              if (lowerText.includes("maximum number of attempts") || lowerText.includes("too many attempts") || lowerText.includes("try again later") || lowerText.includes("rate limit")) {
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
          if (/maximum number of attempts/i.test(bodyText) || /too many attempts/i.test(bodyText) || /try again later/i.test(bodyText) || /rate limit/i.test(bodyText)) {
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
      if (!targetEmail) return;

      // Verify active request matches targetEmail
      const activeReq = GM_getValue("otp_request");
      if (!activeReq || activeReq.status !== "pending" || !isEmailMatch(activeReq.email, targetEmail)) {
        console.log(`[OTP Link] Active request (${activeReq?.email}) does not match target (${targetEmail}). Skipping findAndSendOTP.`);
        return;
      }

      // Find all elements that might contain the recipient email or match the target email pattern
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

      if (!matchingElement) {
        console.log(`[OTP Link] No matching email row found for ${targetEmail} yet.`);
        setStatus(`Waiting for email to arrive for ${targetEmail}...`, "running");
        return;
      }

      // Check if the OTP is already visible in the inbox list item text (e.g. subject or preview)
      const rowText = matchingElement.innerText || matchingElement.textContent || "";

      // Ensure rowText actually matches targetEmail
      if (!rowText.includes(targetEmail) && !isEmailMatch(rowText, targetEmail)) {
        console.log(`[OTP Link] Inbox row text does not match ${targetEmail}. Skipping.`);
        return;
      }

      const inlineOtpMatch = rowText.match(/\b\d{6}\b/) || rowText.match(/\b\d{4}\b/);
      if (inlineOtpMatch) {
        const otpCode = inlineOtpMatch[0];
        const currentReq = GM_getValue("otp_request");
        if (currentReq && currentReq.invalid_otp === otpCode) {
          console.log(`[OTP Link] Found OTP ${otpCode} inline but it was marked invalid. Waiting for new email...`);
          return;
        }
        console.log(`[OTP Link] Found OTP Code directly in inbox item for ${targetEmail}: ${otpCode}. Sending response.`);
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

      console.log(`[OTP Link] Found matching email element for ${targetEmail}. Clicking to open...`);
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

        // Strictly verify that bodyText matches targetEmail!
        if (!bodyText.includes(targetEmail) && !isEmailMatch(bodyText, targetEmail)) {
          console.log(`[OTP Link] Opened email body does not match target email (${targetEmail}). Skipping extraction.`);
          continue;
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
          console.log(`[OTP Link] Found OTP Code for ${targetEmail}: ${otpCode}. Sending response.`);
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
    const startTime = Date.now();
    console.log("[OTP Link] Initiating auto-logout on TikTok...");

    const shouldClose = window.location.href.toLowerCase().includes("close") || window.location.hash.toLowerCase().includes("close") || window.location.search.toLowerCase().includes("close") || window.location.href.toLowerCase().includes("logout");

    async function safeClose() {
      if (!shouldClose) return;
      const elapsed = Date.now() - startTime;
      const remaining = 10000 - elapsed;
      if (remaining > 0) {
        console.log(`[OTP Link] Waiting ${remaining}ms before closing to ensure it stays open for at least 10 seconds...`);
        await sleep(remaining);
      }
      console.log("[OTP Link] Closing tab...");
      try {
        window.close();
      } catch (e) {}
    }

    // Guarantee window close after 15 seconds if requested
    if (shouldClose) {
      setTimeout(() => {
        console.log("[OTP Link] Auto-close safety timer reached (15s). Closing popup window...");
        try {
          window.close();
        } catch (e) {}
      }, 15000);
    }

    // Wait for the page to load
    await sleep(1500);

    // Case 1: Check if there is a direct "Log out" confirmation button visible on the page
    let confirmBtn = Array.from(document.querySelectorAll("button, a, div")).find((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      return text === "log out" || text === "logout" || text === "confirm";
    });

    if (confirmBtn && confirmBtn.offsetWidth > 0) {
      console.log("[OTP Link] Found direct logout button on page. Clicking...");
      confirmBtn.click();
      await sleep(1500);

      await safeClose();
      return;
    }

    // Case 2: Standard flow (hover profile avatar, click logout, then click confirm)
    console.log("[OTP Link] Falling back to profile menu hover logout...");

    let profileIcon = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      profileIcon = document.querySelector('[data-e2e="profile-icon"], img[class*="Avatar"], [class*="avatar"], .tiktok-avatar');
      if (profileIcon && profileIcon.offsetWidth > 0) {
        break;
      }
      await sleep(250);
    }

    if (!profileIcon) {
      console.warn("[OTP Link] Profile icon not found. Likely already logged out.");
      await safeClose();
      return;
    }

    console.log("[OTP Link] Hovering/clicking profile icon...");
    profileIcon.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    profileIcon.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    profileIcon.click();
    await sleep(800);

    let logoutBtn = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      logoutBtn = Array.from(document.querySelectorAll("a, button, div, span, li")).find((el) => {
        const text = (el.textContent || "").trim().toLowerCase();
        const e2e = el.getAttribute("data-e2e") || "";
        return text === "log out" || text === "logout" || e2e.includes("logout") || e2e.includes("log-out");
      });
      if (logoutBtn && logoutBtn.offsetWidth > 0) {
        break;
      }
      await sleep(200);
    }

    if (!logoutBtn) {
      console.warn("[OTP Link] Logout button not found in menu.");
      await safeClose();
      return;
    }

    console.log("[OTP Link] Clicking logout button...");
    logoutBtn.click();
    await sleep(800);

    // Confirm logout in modal
    let modalConfirmBtn = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      modalConfirmBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
        const text = (btn.textContent || "").trim().toLowerCase();
        return text === "log out" || text === "logout" || text === "confirm";
      });
      if (modalConfirmBtn && modalConfirmBtn.offsetWidth > 0) {
        break;
      }
      await sleep(200);
    }

    if (modalConfirmBtn) {
      console.log("[OTP Link] Clicking confirm button in logout modal...");
      modalConfirmBtn.click();
      await sleep(1000);
    }

    console.log("[OTP Link] Logout completed.");
    await safeClose();
  }
})();
