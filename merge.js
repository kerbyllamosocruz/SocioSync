// ==UserScript==
// @name         SocialBee & TikTok Automation Suite
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  All-in-one automation: caption filler, image manager, OTP synchronization, and TikTok captcha solver.
// @author       Kerby (Discord: buchinyan)
// @match        https://*.tiktok.com/*
// @match        https://app.socialbee.com/*
// @match        https://app.socialbee.io/*
// @match        https://*.kuku.lu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      localhost
// @connect      127.0.0.1
// @connect      10.0.2.2
// @connect      tiktok.eulerstream.com
// @connect      www.sadcaptcha.com
// @connect      sadcaptcha.com
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // Prevent duplicate execution if both scripts are installed/enabled
  if (window.hasSocialBeeSuiteRun) {
    console.log("[SocialBee Suite] Automation Suite already running on this page. Skipping.");
    return;
  }
  window.hasSocialBeeSuiteRun = true;

  const currentUrl = window.location.href;
  const hostname = window.location.hostname;

  // Shared shadow root and helper functions
  let suiteShadow = null;

  function makeElementDraggable(element, dragHeader) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;
    dragHeader.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      const targetTag = e.target.tagName;
      if (targetTag === "BUTTON" || targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") {
        return;
      }
      if (element.classList.contains("minimized")) {
        return;
      }

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

  function createUnifiedPanel() {
    const role = currentUrl.includes("kuku.lu") ? "Email Tab" : "Login Tab";
    const isOnSocialBee = hostname.includes("socialbee.com") || hostname.includes("socialbee.io");

    const container = document.createElement("div");
    container.id = "sb-suite-root";
    
    function mountPanel() {
      const parent = document.body || document.documentElement;
      if (parent) {
        if (!document.getElementById("sb-suite-root")) {
          parent.appendChild(container);
        }
      } else {
        setTimeout(mountPanel, 10);
      }
    }
    mountPanel();

    suiteShadow = container.attachShadow({ mode: "open" });
    const shadow = suiteShadow;

    const style = document.createElement("style");
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        #sb-suite-panel {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 340px;
            background: rgba(15, 17, 26, 0.85);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1);
            color: #f3f4f6;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            z-index: 999999999;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            user-select: none;
        }

        #sb-suite-panel.minimized {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.6);
            border: none;
        }

        #sb-suite-panel.minimized #sb-suite-content,
        #sb-suite-panel.minimized #sb-suite-tabs {
            display: none;
        }

        #sb-suite-panel.minimized #sb-suite-header {
            border: none;
            background: none;
            padding: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #sb-suite-panel.minimized #sb-suite-title {
            display: none;
        }

        #sb-suite-panel.minimized #sb-suite-toggle-btn {
            font-size: 22px;
            color: #ffffff;
            background: none;
            border: none;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        }

        #sb-suite-panel.minimized #sb-suite-toggle-btn::before {
            content: var(--suite-icon, '🤖');
        }

        #sb-suite-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            cursor: move;
        }

        #sb-suite-title {
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.5px;
            background: linear-gradient(90deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            display: flex;
            align-items: center;
            gap: 8px;
            text-transform: uppercase;
        }

        #sb-suite-toggle-btn {
            cursor: pointer;
            background: none;
            border: none;
            color: #9ca3af;
            font-size: 16px;
            padding: 4px;
            border-radius: 6px;
            transition: background 0.2s, color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
        }

        #sb-suite-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        #sb-suite-content {
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 500px;
            overflow-y: auto;
        }

        #sb-suite-content::-webkit-scrollbar {
            width: 6px;
        }
        #sb-suite-content::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
        }
        #sb-suite-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 3px;
        }

        #sb-suite-tabs {
            display: flex;
            background: rgba(0, 0, 0, 0.25);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .tab-btn {
            flex: 1;
            padding: 10px;
            background: none;
            border: none;
            color: #9ca3af;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            text-align: center;
        }

        .tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.02);
        }

        .tab-btn.active {
            color: #818cf8;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 2px solid #6366f1;
        }

        .tab-content {
            display: none;
            flex-direction: column;
            gap: 12px;
        }

        .tab-content.active {
            display: flex;
        }

        .sb-autofill-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .sb-autofill-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #9ca3af;
            font-weight: 600;
            text-align: left;
        }

        .sb-autofill-input {
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            color: #ffffff;
            padding: 8px 12px;
            font-size: 12px;
            font-family: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
            user-select: text;
        }

        .sb-autofill-input:focus {
            border-color: #6366f1;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
            outline: none;
        }

        .sb-autofill-textarea {
            resize: vertical;
            height: 48px;
            line-height: 1.4;
        }

        .sb-autofill-select {
            appearance: none;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1L5 5L9 1' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
            background-repeat: no-repeat;
            background-position: right 12px center;
            padding-right: 32px;
            cursor: pointer;
        }

        .sb-autofill-file-dropzone {
            border: 2px dashed rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 14px;
            text-align: center;
            background: rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: border-color 0.2s, background-color 0.2s;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .sb-autofill-file-dropzone:hover {
            border-color: #6366f1;
            background: rgba(99, 102, 241, 0.05);
        }

        .sb-file-dropzone-text {
            font-size: 11px;
            color: #9ca3af;
            font-weight: 500;
        }

        .sb-file-dropzone-subtext {
            font-size: 9px;
            color: #6b7280;
        }

        .sb-file-preview-container {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 4px;
        }

        .sb-file-preview-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .sb-file-preview-count {
            font-size: 9px;
            font-weight: 600;
            color: #a855f7;
            text-transform: uppercase;
        }

        .sb-file-clear-btn {
            font-size: 9px;
            font-weight: 600;
            color: #ef4444;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            text-transform: uppercase;
        }
        
        .sb-file-clear-btn:hover {
            text-decoration: underline;
        }

        .sb-file-preview-list {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding: 4px 0;
        }

        .sb-file-preview-item {
            position: relative;
            width: 44px;
            height: 44px;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }

        .sb-file-preview-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* OTP Linker styles */
        .otp-info {
            font-size: 11px;
            color: #9ca3af;
            margin-bottom: 2px;
            text-align: left;
        }

        #otp-status {
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 11px;
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
            gap: 8px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            transition: background-color 0.3s, box-shadow 0.3s;
        }

        .status-dot.idle {
            background-color: #9ca3af;
            box-shadow: 0 0 6px rgba(156, 163, 175, 0.4);
        }

        .status-dot.running {
            background-color: #3b82f6;
            box-shadow: 0 0 10px #3b82f6;
            animation: otp-pulse 1.5s infinite;
        }

        .status-dot.success {
            background-color: #10b981;
            box-shadow: 0 0 10px #10b981;
        }

        .status-dot.error {
            background-color: #ef4444;
            box-shadow: 0 0 10px #ef4444;
        }

        @keyframes otp-pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
        }

        /* SocialBee Status block */
        #sb-autofill-status {
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 500;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .sb-status-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .sb-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #9ca3af;
            display: inline-block;
            transition: background-color 0.3s, box-shadow 0.3s;
        }

        .sb-status-dot.idle {
            background-color: #9ca3af;
            box-shadow: 0 0 6px rgba(156, 163, 175, 0.4);
        }

        .sb-status-dot.running {
            background-color: #3b82f6;
            box-shadow: 0 0 10px #3b82f6;
            animation: sb-pulse 1.5s infinite;
        }

        .sb-status-dot.success {
            background-color: #10b981;
            box-shadow: 0 0 10px #10b981;
        }

        .sb-status-dot.error {
            background-color: #ef4444;
            box-shadow: 0 0 10px #ef4444;
        }

        @keyframes sb-pulse {
            0% { transform: scale(0.95); opacity: 0.5; }
            50% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.5; }
        }

        /* Actions/Buttons styles */
        .sb-autofill-actions {
            display: flex;
            gap: 8px;
            margin-top: 4px;
        }

        .sb-btn {
            flex: 1;
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s, box-shadow 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .sb-btn:active {
            transform: scale(0.98);
        }

        .sb-btn-primary {
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
        }

        .sb-btn-primary:hover:not(:disabled) {
            box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
            opacity: 0.95;
        }

        .sb-btn-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .sb-btn-secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.12);
        }

        .sb-btn-danger {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25);
        }

        .sb-btn-danger:hover:not(:disabled) {
            box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
            opacity: 0.95;
        }

        .sb-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            box-shadow: none;
        }

        .sb-autofill-checkbox-container {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 11px;
            color: #9ca3af;
            font-weight: 500;
            user-select: none;
        }

        .sb-autofill-checkbox {
            appearance: none;
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 4px;
            background: rgba(0, 0, 0, 0.25);
            cursor: pointer;
            position: relative;
            outline: none;
            transition: background-color 0.2s, border-color 0.2s;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .sb-autofill-checkbox:checked {
            background-color: #6366f1;
            border-color: #6366f1;
        }

        .sb-autofill-checkbox:checked::after {
            content: '✓';
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            position: absolute;
        }

        /* Footer and branding */
        .suite-footer {
            text-align: center;
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 9px;
            color: #6b7280;
            font-weight: 500;
            letter-spacing: 0.03em;
        }

        .author-gradient {
            background: linear-gradient(90deg, #818cf8, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 700;
        }

        .discord-username {
            color: #9ca3af;
            font-weight: 600;
        }
    `;
    suiteShadow.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "sb-suite-panel";
    panel.innerHTML = `
        <div id="sb-suite-header">
            <div id="sb-suite-title">⚡ Automation Suite v4.2</div>
            <button id="sb-suite-toggle-btn" title="Minimize Panel">✕</button>
        </div>
        <div id="sb-suite-tabs">
            <button id="tab-btn-sb" class="tab-btn active">🐝 SocialBee</button>
            <button id="tab-btn-otp" class="tab-btn">🔑 TikTok & OTP</button>
        </div>
        <div id="sb-suite-content">
            <!-- SocialBee Content -->
            <div id="tab-content-sb" class="tab-content active">
                <div class="sb-autofill-field">
                    <label class="sb-autofill-label">Caption Option 1 (A)</label>
                    <textarea id="sb-caption-a" class="sb-autofill-input sb-autofill-textarea"></textarea>
                </div>
                
                <div class="sb-autofill-field">
                    <label class="sb-autofill-label">Caption Option 2 (B)</label>
                    <textarea id="sb-caption-b" class="sb-autofill-input sb-autofill-textarea"></textarea>
                </div>

                <div class="sb-autofill-field">
                    <label class="sb-autofill-label">Caption Distribution Mode</label>
                    <select id="sb-caption-mode" class="sb-autofill-input sb-autofill-select">
                        <option value="alternate">Alternate (A, B, A, B...)</option>
                        <option value="random">Randomize (Choose A or B randomly)</option>
                        <option value="a-only">Option 1 (A) Only</option>
                        <option value="b-only">Option 2 (B) Only</option>
                        <option value="distribute-v4-b">All profiles A (Var 1-3) & B (Var 4-6)</option>
                    </select>
                </div>

                <div class="sb-autofill-field">
                    <label class="sb-autofill-label">Var 1-3 Images (Base)</label>
                    <div id="sb-dropzone-base" class="sb-autofill-file-dropzone">
                        <span class="sb-file-dropzone-text">Click or Drop Var 1-3 Image(s)</span>
                        <input type="file" id="sb-images-base" accept="image/*" multiple style="display: none;">
                    </div>
                    <div id="sb-preview-base" class="sb-file-preview-container" style="display: none;">
                        <div class="sb-file-preview-header">
                            <span id="sb-count-base" class="sb-file-preview-count">0 images</span>
                            <button id="sb-clear-base" class="sb-file-clear-btn">Clear</button>
                        </div>
                        <div id="sb-list-base" class="sb-file-preview-list"></div>
                    </div>
                </div>

                <div class="sb-autofill-field" style="margin-top: 6px;">
                    <label class="sb-autofill-label">Var 4-6 Images</label>
                    <div id="sb-dropzone-var4" class="sb-autofill-file-dropzone">
                        <span class="sb-file-dropzone-text">Click or Drop Var 4-6 Image(s)</span>
                        <input type="file" id="sb-images-var4" accept="image/*" multiple style="display: none;">
                    </div>
                    <div id="sb-preview-var4" class="sb-file-preview-container" style="display: none;">
                        <div class="sb-file-preview-header">
                            <span id="sb-count-var4" class="sb-file-preview-count">0 images</span>
                            <button id="sb-clear-var4" class="sb-file-clear-btn">Clear</button>
                        </div>
                        <div id="sb-list-var4" class="sb-file-preview-list"></div>
                    </div>
                </div>

                <details id="sb-delays-config" style="margin-top: 4px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; background: rgba(255, 255, 255, 0.02);">
                    <summary style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; padding: 10px 12px; cursor: pointer; user-select: none;">
                        ⚙️ Delay Configurations
                    </summary>
                    <div style="padding: 0 12px 12px 12px; display: flex; flex-direction: column; gap: 10px;">
                        <div class="sb-autofill-field">
                            <label class="sb-autofill-label">Step Delay (ms)</label>
                            <input id="sb-delay" type="number" class="sb-autofill-input" value="10" min="0" step="100">
                        </div>
                        <div class="sb-autofill-field">
                            <label class="sb-autofill-label">Upload Delay (ms)</label>
                            <input id="sb-upload-delay" type="number" class="sb-autofill-input" value="10" min="0" step="100">
                        </div>
                        <div class="sb-autofill-field">
                            <label class="sb-autofill-label">Variation Action Delay (ms)</label>
                            <input id="sb-var-delay" type="number" class="sb-autofill-input" value="10" min="0" step="100">
                        </div>
                        <div class="sb-autofill-field">
                            <label class="sb-autofill-label">UI/Modal Transition (ms)</label>
                            <input id="sb-ui-delay" type="number" class="sb-autofill-input" value="10" min="0" step="100">
                        </div>
                    </div>
                </details>

                <div class="sb-autofill-field" style="margin-top: 4px;">
                    <label class="sb-autofill-checkbox-container">
                        <input type="checkbox" id="sb-disable-alerts" class="sb-autofill-checkbox">
                        <span>Disable Toast Alerts</span>
                    </label>
                </div>

                <div class="sb-autofill-field" style="margin-top: 4px;">
                    <label class="sb-autofill-checkbox-container">
                        <input type="checkbox" id="sb-auto-reconnect-tiktok" class="sb-autofill-checkbox">
                        <span>Auto-Connect TikTok OAuth</span>
                    </label>
                </div>

                <div id="sb-autofill-status">
                    <div class="sb-status-info">
                        <span id="sb-status-dot" class="sb-status-dot idle"></span>
                        <span id="sb-status-text">Status: Ready</span>
                    </div>
                </div>

                <div class="sb-autofill-actions">
                    <button id="sb-btn-start" class="sb-btn sb-btn-primary">Start Fill</button>
                    <button id="sb-btn-stop" class="sb-btn sb-btn-secondary" disabled>Stop</button>
                </div>
                <div class="sb-autofill-actions" style="margin-top: 8px;">
                    <button id="sb-btn-share-vars" class="sb-btn sb-btn-primary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25); flex: 1;">🔄 Share Vars</button>
                    <button id="sb-btn-load-server" class="sb-btn sb-btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25); flex: 1;">📂 Server Images</button>
                </div>
                <div class="sb-autofill-actions" style="margin-top: 8px;">
                    <button id="sb-btn-logout-tiktok" class="sb-btn" style="background: linear-gradient(135deg, #f43f5e 0%, #be123c 100%); border: none; box-shadow: 0 4px 12px rgba(244, 63, 94, 0.25); flex: 1; color: white;">🔑 Logout TikTok</button>
                    <button id="sb-btn-delete-all" class="sb-btn sb-btn-danger" style="flex: 1;">🗑️ Delete Accounts</button>
                </div>
            </div>

            <!-- OTP Content -->
            <div id="tab-content-otp" class="tab-content">
                <div class="otp-info">Role: <b id="otp-role-text">${role}</b></div>
                <div id="otp-status">
                    <div class="status-info">
                        <span id="otp-status-dot" class="status-dot idle"></span>
                        <span id="otp-status-text">Status: Idle</span>
                    </div>
                </div>
                
                <div id="otp-login-only-controls" style="display: none;">
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
                        <div style="font-size: 8px; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 4px; letter-spacing: 0.05em; text-align: left;">Captcha API Key (SadCaptcha)</div>
                        <input type="password" id="otp-captcha-key" placeholder="Enter API Key (auto-saved)" style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; font-size: 10px; padding: 4px 8px; border-radius: 4px; width: 100%; box-sizing: border-box;" />
                    </div>
                </div>
            </div>
            
            <div style="margin: 8px 12px 0 12px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px;">
                <button id="sb-btn-export-session" class="sb-btn" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); border: none; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25); width: 100%; color: white;">📋 Copy All Cookies (Kuku + SocialBee)</button>
            </div>

            <div class="suite-footer">
                Developed by <span class="author-gradient">Kerby</span> (Discord: <span class="discord-username">buchinyan</span>)
            </div>
        </div>
    `;
    suiteShadow.appendChild(panel);

    // Setup tabs logic
    const tabBtnSb = shadow.getElementById("tab-btn-sb");
    const tabBtnOtp = shadow.getElementById("tab-btn-otp");
    const tabContentSb = shadow.getElementById("tab-content-sb");
    const tabContentOtp = shadow.getElementById("tab-content-otp");

    if (isOnSocialBee) {
      tabBtnSb.addEventListener("click", () => {
        tabBtnSb.classList.add("active");
        tabBtnOtp.classList.remove("active");
        tabContentSb.classList.add("active");
        tabContentOtp.classList.remove("active");
      });
      tabBtnOtp.addEventListener("click", () => {
        tabBtnOtp.classList.add("active");
        tabBtnSb.classList.remove("active");
        tabContentOtp.classList.add("active");
        tabContentSb.classList.remove("active");
      });
      panel.style.setProperty('--suite-icon', '"🐝"');
    } else {
      shadow.getElementById("sb-suite-tabs").style.display = "none";
      tabContentSb.classList.remove("active");
      tabContentOtp.classList.add("active");
      panel.style.setProperty('--suite-icon', '"🔑"');
    }

    if (role === "Login Tab") {
      shadow.getElementById("otp-login-only-controls").style.display = "block";
    }

    // Toggle minimize
    const toggleBtn = shadow.getElementById("sb-suite-toggle-btn");
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("minimized");
      if (panel.classList.contains("minimized")) {
        toggleBtn.innerHTML = panel.style.getPropertyValue('--suite-icon').replace(/"/g, '') || "🤖";
        toggleBtn.title = "Maximize Panel";
      } else {
        toggleBtn.innerHTML = "✕";
        toggleBtn.title = "Minimize Panel";
      }
    });

    panel.addEventListener("click", (e) => {
      if (panel.classList.contains("minimized")) {
        panel.classList.remove("minimized");
        toggleBtn.innerHTML = "✕";
        toggleBtn.title = "Minimize Panel";
      }
    });

    function getCurrentDomainCookies() {
      const cookiesList = [];
      const currentHost = window.location.hostname;
      const domainName = currentHost.startsWith(".") ? currentHost : "." + currentHost;
      const isHttps = window.location.protocol === "https:";

      if (document.cookie) {
        document.cookie.split(";").forEach((pair) => {
          const parts = pair.trim().split("=");
          const name = parts[0];
          if (name) {
            const rawVal = parts.slice(1).join("=");
            cookiesList.push({
              domain: domainName,
              expirationDate: Math.floor(Date.now() / 1000) + 31536000,
              hostOnly: false,
              httpOnly: false,
              name: name,
              path: "/",
              sameSite: null,
              secure: isHttps,
              session: false,
              storeId: null,
              value: rawVal
            });
          }
        });
      }
      return cookiesList;
    }

    function cacheCurrentDomainCookies() {
      const host = window.location.hostname;
      const currentCookies = getCurrentDomainCookies();
      if (host.includes("kuku.lu")) {
        GM_setValue("cached_cookies_kuku", currentCookies);
      } else if (host.includes("socialbee.com") || host.includes("socialbee.io")) {
        GM_setValue("cached_cookies_socialbee", currentCookies);
      }
    }

    cacheCurrentDomainCookies();

    async function exportCombinedCookiesJSON() {
      cacheCurrentDomainCookies();

      const kukuCookies = GM_getValue("cached_cookies_kuku", []);
      const sbCookies = GM_getValue("cached_cookies_socialbee", []);

      const host = window.location.hostname;
      const liveCookies = getCurrentDomainCookies();

      let mergedList = [];
      if (host.includes("kuku.lu")) {
        mergedList = [...liveCookies, ...sbCookies];
      } else if (host.includes("socialbee")) {
        mergedList = [...kukuCookies, ...liveCookies];
      } else {
        mergedList = [...kukuCookies, ...sbCookies];
      }

      const uniqueMap = new Map();
      mergedList.forEach((c) => {
        const key = `${c.domain}_${c.name}`;
        uniqueMap.set(key, c);
      });
      const combinedCookies = Array.from(uniqueMap.values());

      const jsonString = JSON.stringify(combinedCookies, null, 2);

      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(jsonString);
          copied = true;
        }
      } catch (e) {}

      if (!copied && typeof GM_setClipboard === "function") {
        try {
          GM_setClipboard(jsonString);
          copied = true;
        } catch (e) {}
      }

      if (!copied) {
        const ta = document.createElement("textarea");
        ta.value = jsonString;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      const btn = shadow.getElementById("sb-btn-export-session");
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = `📋 Copied ${combinedCookies.length} Cookies!`;
        btn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)";
        }, 2000);
      }

      console.log(`[Automation Suite] Copied combined cookies (${combinedCookies.length}) to clipboard.`);
    }

    const btnExportSession = shadow.getElementById("sb-btn-export-session");
    if (btnExportSession) {
      btnExportSession.addEventListener("click", exportCombinedCookiesJSON);
    }

    makeElementDraggable(panel, shadow.getElementById("sb-suite-header"));
  }

  // =========================================================================
  // MODULE 1: Cross-Tab OTP Auto-Filler & TikTok Captcha Solver
  // =========================================================================
  function runOtpLinker(shadow) {
    const currentUrl = window.location.href;
    const pageInitTime = Date.now();
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

        el.click();
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

    function determineRole() {
      if (currentUrl.includes("kuku.lu")) return "Email Tab";
      if (currentUrl.includes("tiktok.com") || currentUrl.includes("socialbee.com") || currentUrl.includes("socialbee.io")) return "Login Tab";
      return null;
    }

    const role = determineRole();
    if (!role) return;

    let statusTextEl = shadow.getElementById("otp-status-text");
    let statusDotEl = shadow.getElementById("otp-status-dot");
    statusText = statusTextEl;
    statusDot = statusDotEl;

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

            const statusLower = status.toLowerCase();
            if (statusLower === "done" || statusLower === "banned" || statusLower.includes("banned")) {
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
        window.hasClickedSocialBeeReconnect = false;
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

      const captchaKeyInput = shadow.getElementById("otp-captcha-key");
      let savedKey = GM_getValue("captcha_api_key", "");
      if (!savedKey) {
        savedKey = "b94b520aa4bb49b24e33996888c5be7e";
        GM_setValue("captcha_api_key", savedKey);
      }
      captchaKeyInput.value = savedKey;

      captchaKeyInput.addEventListener("input", () => {
        GM_setValue("captcha_api_key", captchaKeyInput.value.trim());
      });

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
          },
        });
      }
    }

    async function humanType(element, text, delayMs = 15) {
      element.focus();

      let nativeSetter;
      try {
        nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      } catch (e) {}

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

        setStatus("Awaiting page hydration...", "running");
        await sleep(2500);

        setStatus("Clicking login button...", "running");

        const loginBtn =
          Array.from(document.querySelectorAll('button[type="submit"], button[data-e2e="login-button"], button[class*="Button-StyledButton"]')).find((btn) => {
            const text = (btn.textContent || "").trim().toLowerCase();
            return text.includes("log in") || text.includes("login") || btn.getAttribute("data-e2e") === "login-button";
            }) || document.querySelector('button[type="submit"], button[data-e2e="login-button"]');

          if (loginBtn) {
            console.log("[OTP Link] Clicking login button:", loginBtn);
            loginBtn.click();
            setStatus("Login clicked! Awaiting OTP or Callback...", "running");

            const startTime = Date.now();
            const timeoutMs = 30000;
            let loginOutcomeDetected = false;

            while (Date.now() - startTime < timeoutMs) {
              const isAuthorized = GM_getValue("tiktok_authorized_flag", false);
              const currentHref = window.location.href;
              const isCallback = currentHref.includes("callback") || currentHref.includes("profiles") || currentHref.includes("success");

              if (isAuthorized || isCallback) {
                console.log("[OTP Link] Callback redirect or authorization detected!");
                setStatus("Login & Callback successful!", "success");
                loginOutcomeDetected = true;
                break;
              }

              const otpResp = GM_getValue("otp_response", null);
              if ((otpResp && isEmailMatch(otpResp.email, email) && otpResp.otp) || window.otp_requested_email) {
                console.log("[OTP Link] OTP flow triggered after login click.");
                setStatus("OTP required - processing verification...", "running");
                loginOutcomeDetected = true;
                break;
              }

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

      // Tab/Minimize/Drag logic is handled by createUnifiedPanel


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

    function isEmailMatch(text, targetPattern) {
      if (!text || !targetPattern) return false;
      text = text.toLowerCase().trim();
      targetPattern = targetPattern.toLowerCase().trim();

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

    if (currentUrl.includes("tiktok.com") || currentUrl.includes("socialbee.com") || currentUrl.includes("socialbee.io")) {
      console.log("[OTP Link] Login tab active.");
      setStatus("Listening for OTP fields...", "idle");

      if (currentUrl.includes("tiktok.com") && (currentUrl.includes("authorize") || currentUrl.includes("oauth") || currentUrl.includes("connect"))) {
        console.log("[OTP Link] On TikTok authorization page. Setting up auto-click and listener...");
        let hasClicked = false;
        const authInterval = setInterval(() => {
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

              const lastUser = GM_getValue("lastAttemptedUsername");
              if (lastUser) {
                markAccountDone(lastUser);
              }

              authBtn.click();
              clearInterval(authInterval);

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

      function cleanExtractedEmail(email) {
        if (!email) return null;
        let cleaned = email.trim();
        cleaned = cleaned.replace(/\.resend.*$/i, "");
        cleaned = cleaned.replace(/resend.*$/i, "");
        cleaned = cleaned.replace(/[.,;\s]+$/, "");
        return cleaned;
      }

      function getTargetEmail() {
        const emailElement = document.querySelector('.email-display-class, [class*="email"], [id*="email"], [class*="pc-email-otp-desc"]');
        if (emailElement) {
          const txt = emailElement.textContent.trim();
          const matched = txt.match(/[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (matched) return cleanExtractedEmail(matched[0]);
        }

        const maskedEmailRegex = /[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const elements = Array.from(document.querySelectorAll("p, span, div, h2, h3, h4, td"));

        for (const el of elements) {
          if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
          if (el.children.length > 3) continue;

          const text = el.textContent.trim();
          const matches = text.match(maskedEmailRegex);
          if (matches) {
            for (const email of matches) {
              const cleaned = cleanExtractedEmail(email);
              if (cleaned) {
                const emailLower = cleaned.toLowerCase();
                if (!emailLower.includes("tiktok.com") && !emailLower.includes("socialbee.com") && !emailLower.includes("example.com")) {
                  return cleaned;
                }
              }
            }
          }
        }

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
          const candidates = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input.tux-input__element-zY3KBY, input[name="otp"], input[placeholder*="6-digit"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]'));

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

      function checkForOTPRequirement() {
        const hasDigitInputs = Array.from(document.querySelectorAll('input[type="tel"], input[maxlength="1"]')).filter((el) => el.offsetWidth > 0).length >= 4;
        const singleInput = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input[name="otp"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]')).find((el) => el.offsetWidth > 0);

        if (!hasDigitInputs && !singleInput) return;

        const targetEmail = getTargetEmail();
        if (!targetEmail) return;

        if (window.otp_requested_email === targetEmail) return;

        window.otp_requested_email = targetEmail;
        console.log(`[OTP Link] OTP requested for email: ${targetEmail}`);
        setStatus(`Requesting OTP for ${targetEmail}...`, "running");

        const staleResp = GM_getValue("otp_response");
        if (staleResp && (!staleResp.email || !isEmailMatch(staleResp.email, targetEmail))) {
          console.log(`[OTP Link] Clearing old/mismatched OTP response for ${staleResp?.email}`);
          GM_setValue("otp_response", null);
        }

        if (window.otp_response_listener_id) {
          GM_removeValueChangeListener(window.otp_response_listener_id);
        }

        const responseListenerId = GM_addValueChangeListener("otp_response", function (key, oldValue, newValue, remote) {
          if (newValue && newValue.email && isEmailMatch(newValue.email, targetEmail) && newValue.otp) {
            console.log(`[OTP Link] Received matching OTP for ${newValue.email}: ${newValue.otp}`);
            setStatus(`Received OTP ${newValue.otp}! Filling...`, "success");

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

        const currentResp = GM_getValue("otp_response");
        if (currentResp && currentResp.email && isEmailMatch(currentResp.email, targetEmail) && currentResp.otp) {
          console.log(`[OTP Link] Found existing matching OTP response for ${currentResp.email}: ${currentResp.otp}`);
          fillOTP(currentResp.otp);
          return;
        }

        GM_setValue("otp_request", {
          email: targetEmail,
          status: "pending",
          timestamp: Date.now(),
          invalid_otp: window.last_invalid_otp || null,
        });
      }

      function checkForVerificationOption() {
        const items = Array.from(document.querySelectorAll('.pc-home-item-IxNc0F, [class*="pc-home-item-"], [class*="verification-option"]')).filter((el) => el.offsetWidth > 0);

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

              clickTarget.click();

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

          let apiKey = GM_getValue("captcha_api_key", "b94b520aa4bb49b24e33996888c5be7e");

          const containerText = (captchaContainer.textContent || "").toLowerCase();
          const isRotateCaptcha =
            containerText.includes("rotate") ||
            containerText.includes("spin") ||
            containerText.includes("right side up") ||
            containerText.includes("orientation") ||
            captchaContainer.querySelector('[class*="rotate"], [class*="whirl"], [class*="circle"]') !== null;

          let dragDistance = 0;
          const clientWidth = bgImg.clientWidth || bgImg.offsetWidth || 340;

          if (isRotateCaptcha) {
            console.log("[OTP Link] Detected Rotate CAPTCHA. Requesting solution from SadCaptcha...");
            setStatus("Solving Rotate CAPTCHA...", "running");

            const rotateRes = await new Promise((resolve, reject) => {
              GM_xmlhttpRequest({
                method: "POST",
                url: `https://www.sadcaptcha.com/api/v1/rotate?licenseKey=${encodeURIComponent(apiKey)}`,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                  outerImageB64: cleanBg,
                  innerImageB64: cleanSlide,
                }),
                responseType: "json",
                onload: (res) => resolve(res.response),
                onerror: (err) => reject(err),
              });
            });

            const angle = rotateRes && (rotateRes.angle !== undefined ? rotateRes.angle : rotateRes.rotation);
            if (angle === undefined) {
              throw new Error("SadCaptcha rotate response did not contain angle: " + JSON.stringify(rotateRes));
            }

            console.log("[OTP Link] Solved Rotate CAPTCHA! Calculated Angle: " + angle);
            setStatus(`Rotate CAPTCHA Solved (${angle}°)! Simulating drag...`, "success");

            const trackWidth = (dragHandle.parentElement?.clientWidth || clientWidth) - (dragHandle.offsetWidth || 40);
            dragDistance = Math.round((trackWidth * angle) / 360);
          } else {
            console.log("[OTP Link] Requesting puzzle solution from SadCaptcha...");
            const solveRes = await new Promise((resolve, reject) => {
              GM_xmlhttpRequest({
                method: "POST",
                url: `https://www.sadcaptcha.com/api/v1/puzzle?licenseKey=${encodeURIComponent(apiKey)}`,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({
                  puzzleImageB64: cleanBg,
                  pieceImageB64: cleanSlide,
                }),
                responseType: "json",
                onload: (res) => resolve(res.response),
                onerror: (err) => reject(err),
              });
            });

            let slideXProportion = solveRes && (solveRes.slideXProportion !== undefined ? solveRes.slideXProportion : solveRes.slide_x_proportion);

            if (slideXProportion === undefined && solveRes && solveRes.angle !== undefined) {
              const angle = solveRes.angle;
              const trackWidth = (dragHandle.parentElement?.clientWidth || clientWidth) - (dragHandle.offsetWidth || 40);
              dragDistance = Math.round((trackWidth * angle) / 360);
            } else if (slideXProportion === undefined) {
              throw new Error("SadCaptcha response did not contain slideXProportion: " + JSON.stringify(solveRes));
            } else {
              dragDistance = Math.round(slideXProportion * clientWidth);
            }

            console.log("[OTP Link] Solved Puzzle CAPTCHA! Target drag distance: " + dragDistance);
            setStatus("Puzzle CAPTCHA Solved! Simulating drag...", "success");
          }

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

          fireMouseEvent("mousedown", startX, startY);
          await sleep(100);

          const steps = 15;
          for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const easeProgress = progress * (2 - progress);
            const currentX = startX + dragDistance * easeProgress;
            const currentY = startY + (Math.random() * 4 - 2);
            fireMouseEvent("mousemove", currentX, currentY);
            await sleep(20 + Math.random() * 15);
          }

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
          const channelItems = Array.from(document.querySelectorAll('div[data-e2e="channel-item"], div[role="link"], p, span, button'));
          let clickedChannel = false;

          for (const item of channelItems) {
            const text = (item.textContent || "").trim().toLowerCase();
            if (text === "use phone / email / username" || text === "phone / email / username") {
              const clickable = item.closest('div[role="link"], [data-e2e="channel-item"], button') || item;
              clickElement(clickable, '[AutoClick] Clicked "Use phone / email / username" menu option.', 0);
              clickedChannel = true;
              break;
            }
          }

          if (clickedChannel) return;

          let emailLoginLink = document.querySelector('a[href="/login/phone-or-email/email"]');
          if (!emailLoginLink) {
            const candidates = Array.from(document.querySelectorAll("a, button, p, span"));
            emailLoginLink = candidates.find((el) => {
              const text = (el.textContent || "").trim().toLowerCase();
              return text.includes("log in with email") || text.includes("login with email") || text.includes("email or username") || text.includes("use email/username");
            });
          }
          if (emailLoginLink) {
            const clickableLink = emailLoginLink.closest("a, button") || emailLoginLink;
            clickElement(clickableLink, '[AutoClick] Clicked "Log in with email or username" link.', 0);
          }
        }
      }

      function checkForSocialBeeReconnect() {
        if (!window.location.hostname.includes("socialbee.com") && !window.location.hostname.includes("socialbee.io")) return;

        const autoReconnectEnabled = GM_getValue("sb_auto_reconnect_tiktok", false);
        if (!autoReconnectEnabled) return;

        // Prevent instant auto-click on page load - require 5 second grace period
        const elapsed = Date.now() - pageInitTime;
        if (elapsed < 5000) {
          const secondsLeft = Math.ceil((5000 - elapsed) / 1000);
          setStatus(`Auto-reconnect active. Redirecting in ${secondsLeft}s (Uncheck toggle to cancel)...`, "idle");
          return;
        }

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

      function autoClickResendCode() {
        const isTikTok = window.location.hostname.includes("tiktok.com");
        if (!isTikTok) return;

        const resendElements = Array.from(
          document.querySelectorAll(
            '[class*="pc-email-otp-resend"], [data-testid="tux-web-button-container"], button[data-testid="tux-web-button"], [data-testid="tux-web-text"], button'
          )
        );

        for (const el of resendElements) {
          const text = (el.textContent || "").trim().toLowerCase();

          if ((text === "resend code" || text === "resend" || text.startsWith("resend code")) && !/\d+/.test(text)) {
            const wrapper = el.closest('[class*="pc-email-otp-resend"]') || el.closest('[data-testid="tux-web-button-container"]') || el;
            const container = wrapper.querySelector('[data-testid="tux-web-button-container"]') || wrapper;
            const btn = wrapper.querySelector("button") || (wrapper.tagName === "BUTTON" ? wrapper : wrapper.closest("button")) || container;

            const isVisible = btn.offsetWidth > 0 || container.offsetWidth > 0 || wrapper.offsetWidth > 0;

            const isDisabled =
              btn.disabled ||
              btn.getAttribute("disabled") !== null ||
              btn.getAttribute("aria-disabled") === "true" ||
              container.getAttribute("aria-disabled") === "true" ||
              btn.classList.contains("disabled") ||
              container.classList.contains("tux-button--disabled") ||
              window.getComputedStyle(btn).pointerEvents === "none" ||
              window.getComputedStyle(container).pointerEvents === "none";

            if (isVisible && !isDisabled) {
              window.otp_requested_email = null;
              setStatus("Resend code clicked! Awaiting new OTP...", "running");
              console.log('[AutoClick] Found active Resend code button. Triggering click sequence...', { btn, container, wrapper });

              const targets = Array.from(new Set([btn, container, wrapper, el])).filter(Boolean);

              for (const target of targets) {
                clickElement(target, '[AutoClick] Automatically clicked "Resend code" element.', 2000);
                try {
                  target.click();
                  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
                  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
                  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
                  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
                  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                } catch (e) {}
              }
              break;
            }
          }
        }
      }

      function runChecks() {
        try {
          autoClickNavFlows();
        } catch (e) {
          console.error("[OTP Link] Error in autoClickNavFlows:", e);
        }

        checkForOTPRequirement();
        checkForVerificationOption();
        solveTikTokCaptchaClientSide();
        checkForSocialBeeReconnect();
        autoClickResendCode();

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
      }

      runChecks();
      setInterval(runChecks, 50);
    }

    // ==========================================
    // TAB 2: EMAIL TAB CODE (kuku.lu)
    // ==========================================
    if (currentUrl.includes("kuku.lu")) {
      console.log("[OTP Link] Email tab active and listening for OTP requests.");
      setStatus("Listening for OTP requests...", "idle");

      let isCheckingOTP = false;

      // Web Worker timer to bypass background tab timer throttling (Chrome/Edge throttle setInterval in background tabs to 60s)
      function createBackgroundTimer(fn, ms) {
        try {
          const blob = new Blob([`
            let interval = null;
            onmessage = function(e) {
              if (e.data === 'start') {
                if (!interval) interval = setInterval(function() { postMessage('tick'); }, ${ms});
              } else if (e.data === 'stop') {
                if (interval) { clearInterval(interval); interval = null; }
              }
            };
          `], { type: "application/javascript" });
          const worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = function() { fn(); };
          worker.postMessage('start');
          return worker;
        } catch (e) {
          console.warn("[OTP Link] Web Worker timer creation failed, falling back to setInterval:", e);
          setInterval(fn, ms);
          return null;
        }
      }

      async function triggerInboxRefresh() {
        if (typeof window.openMailRecvList === "function") {
          try { window.openMailRecvList(); } catch (e) {}
        }
        if (typeof window.recv_update === "function") {
          try { window.recv_update(); } catch (e) {}
        }

        const reloadImg = document.getElementById("image_reload") || document.getElementById("button_reload");
        if (reloadImg) {
          const clickTarget = reloadImg.closest("a, button") || reloadImg;
          clickTarget.click();
        } else {
          const refreshBtn = Array.from(document.querySelectorAll("a, button, span, img")).find((el) => {
            const text = (el.textContent || el.alt || "").toLowerCase();
            const onclick = el.getAttribute("onclick") || "";
            return text.includes("更新") || text.includes("refresh") || text.includes("update") || onclick.includes("recv");
          });
          if (refreshBtn) {
            refreshBtn.click();
          }
        }
      }

      async function checkAndFetchOTP() {
        if (isCheckingOTP) return;
        const request = GM_getValue("otp_request");
        if (request && request.status === "pending") {
          isCheckingOTP = true;
          try {
            console.log("[OTP Link] Request is pending. Refreshing inbox to look for new mail...");
            setStatus(`Refreshing inbox to find mail for ${request.email}...`, "running");

            triggerInboxRefresh();

            // Wait for dynamic AJAX response to render in the DOM
            await new Promise((r) => setTimeout(r, 800));

            await findAndSendOTP(request.email);
          } catch (err) {
            console.error("[OTP Link] Error checking OTP:", err);
          } finally {
            isCheckingOTP = false;
          }
        }
      }

      GM_addValueChangeListener("otp_request", function (key, oldValue, newValue, remote) {
        if (newValue && newValue.status === "pending") {
          console.log(`[OTP Link] New OTP request received for: ${newValue.email}`);
          setStatus(`Request received for ${newValue.email}`, "running");
          checkAndFetchOTP();
        }
      });

      // Bypasses background tab timer throttling
      createBackgroundTimer(checkAndFetchOTP, 1500);

      function isRecentEmail(text) {
        if (!text) return true;

        const secMatch = text.match(/(\d+)\s*(?:sec|s|秒)/i);
        if (secMatch) {
          const secs = parseInt(secMatch[1], 10);
          return secs <= 300; // Allow up to 5 minutes
        }

        const minMatch = text.match(/(\d+)\s*(?:min|m|分)/i);
        if (minMatch) {
          const mins = parseInt(minMatch[1], 10);
          return mins <= 5; // Allow up to 5 minutes
        }

        if (/just now|now|今|新着|less than/i.test(text)) {
          return true;
        }

        return true; // Default to true so we don't reject valid emails without explicit time strings
      }

      async function findAndSendOTP(targetEmail) {
        if (!targetEmail) return;

        const activeReq = GM_getValue("otp_request");
        if (!activeReq || activeReq.status !== "pending" || !isEmailMatch(activeReq.email, targetEmail)) {
          console.log(`[OTP Link] Active request (${activeReq?.email}) does not match target (${targetEmail}). Skipping findAndSendOTP.`);
          return;
        }

        const allElements = Array.from(document.querySelectorAll("a, tr, td, div, span, li"));
        let matchingElement = null;

        for (const el of allElements) {
          const txt = el.innerText || el.textContent || "";
          if (txt.includes(targetEmail) || isEmailMatch(txt, targetEmail)) {
            if (el.tagName === "A" || el.tagName === "TR" || el.getAttribute("onclick") || el.classList.contains("mail-row") || el.classList.contains("inbox-row") || el.getAttribute("href")) {
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

        const rowText = matchingElement.innerText || matchingElement.textContent || "";

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

          // Note: TikTok emails do not always repeat the email address in body text.
          // Since matchingElement was ALREADY verified to match targetEmail before clicking,
          // we check for OTP code inside the bodyText directly.

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
  }

  // =========================================================================
  // MODULE 2: SocialBee Profile Caption Filler & Image Manager
  // =========================================================================
  function runSocialBeeManager(shadow) {
    if (!shadow) return;
    const currentUrl = window.location.href;
    const hostname = window.location.hostname;

    // Helper to get active server host/url
    function getServerHost() {
      const stored = GM_getValue("sb_server_host", "localhost:4782");
      return stored.trim() || "localhost:4782";
    }
    function getServerUrl(endpoint = "") {
      const host = getServerHost();
      const path = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
      return `http://${host}:4782${path}`;
    }

    if (!window.location.hostname.includes("socialbee.com") && !window.location.hostname.includes("socialbee.io")) {
      return;
    }

    let isRunning = false;
    let baseFiles = [];
    let var4Files = [];
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function saveFilesToGM(key, fileList) {
      const promises = Array.from(fileList).map((file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              name: file.name,
              type: file.type,
              data: e.target.result
            });
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then((dataArray) => {
        GM_setValue(key, JSON.stringify(dataArray));
        console.log(`[SocialBee] Saved ${fileList.length} files to GM storage under key "${key}"`);
      });
    }

    function loadFilesFromGM(key) {
      const saved = GM_getValue(key, "");
      if (!saved) return [];
      try {
        const dataArray = JSON.parse(saved);
        return dataArray.map((item) => {
          const arr = item.data.split(",");
          const mime = arr[0].match(/:(.*?);/)[1];
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          return new File([u8arr], item.name, { type: mime });
        });
      } catch (e) {
        console.error("[SocialBee] Error loading files from GM storage:", e);
        return [];
      }
    }

    let alertsStyleEl = null;

    function updateAlertsDisabledState(disabled) {
      if (disabled) {
        if (!alertsStyleEl) {
          alertsStyleEl = document.createElement("style");
          alertsStyleEl.id = "sb-disable-alerts-style";
          alertsStyleEl.textContent = `
            div[role="alert"].alerts.jhi-toast,
            .alerts.jhi-toast {
              display: none !important;
            }
          `;
          document.documentElement.appendChild(alertsStyleEl);
        }
      } else {
        if (alertsStyleEl) {
          alertsStyleEl.remove();
          alertsStyleEl = null;
        }
      }
    }

    const toggleBtn = shadow.getElementById("sb-autofill-toggle-btn");
    const btnStart = shadow.getElementById("sb-btn-start");
    const btnStop = shadow.getElementById("sb-btn-stop");
    const btnDeleteAll = shadow.getElementById("sb-btn-delete-all");
    const btnLogoutTiktok = shadow.getElementById("sb-btn-logout-tiktok");
    const btnLoadServer = shadow.getElementById("sb-btn-load-server");
    const btnShareVars = shadow.getElementById("sb-btn-share-vars");
    const statusText = shadow.getElementById("sb-status-text");
    const statusDot = shadow.getElementById("sb-status-dot");

    const savedCaptionA = GM_getValue("sb_caption_a", "#gaymenoftiktok🏳️🌈 #gaydad #boyfriends #pridemonth #gay");
    const savedCaptionB = GM_getValue("sb_caption_b", "#gayboy #gaydad #gay #boyfriends #twink");
    const savedCaptionMode = GM_getValue("sb_caption_mode", "alternate");
    const savedDelay = GM_getValue("sb_delay", "10");
    const savedUploadDelay = GM_getValue("sb_upload_delay", "10");
    const savedVarDelay = GM_getValue("sb_var_delay", "10");
    const savedUIDelay = GM_getValue("sb_ui_delay", "10");
    const savedDisableAlerts = GM_getValue("sb_disable_alerts", false);

    const captionAInput = shadow.getElementById("sb-caption-a");
    const captionBInput = shadow.getElementById("sb-caption-b");
    const captionModeInput = shadow.getElementById("sb-caption-mode");
    const delayInput = shadow.getElementById("sb-delay");
    const uploadDelayInput = shadow.getElementById("sb-upload-delay");
    const varDelayInput = shadow.getElementById("sb-var-delay");
    const uiDelayInput = shadow.getElementById("sb-ui-delay");
    const disableAlertsInput = shadow.getElementById("sb-disable-alerts");

    if (captionAInput) captionAInput.value = savedCaptionA;
    if (captionBInput) captionBInput.value = savedCaptionB;
    if (captionModeInput) captionModeInput.value = savedCaptionMode;
    if (delayInput) delayInput.value = savedDelay;
    if (uploadDelayInput) uploadDelayInput.value = savedUploadDelay;
    if (varDelayInput) varDelayInput.value = savedVarDelay;
    if (uiDelayInput) uiDelayInput.value = savedUIDelay;
    if (disableAlertsInput) disableAlertsInput.checked = savedDisableAlerts;

    updateAlertsDisabledState(savedDisableAlerts);

    captionAInput?.addEventListener("input", () => GM_setValue("sb_caption_a", captionAInput.value));
    captionBInput?.addEventListener("input", () => GM_setValue("sb_caption_b", captionBInput.value));
    captionModeInput?.addEventListener("change", () => GM_setValue("sb_caption_mode", captionModeInput.value));
    delayInput?.addEventListener("input", () => GM_setValue("sb_delay", delayInput.value));
    uploadDelayInput?.addEventListener("input", () => GM_setValue("sb_upload_delay", uploadDelayInput.value));
    varDelayInput?.addEventListener("input", () => GM_setValue("sb_var_delay", varDelayInput.value));
    uiDelayInput?.addEventListener("input", () => GM_setValue("sb_ui_delay", uiDelayInput.value));
    disableAlertsInput?.addEventListener("change", () => {
      const isChecked = disableAlertsInput.checked;
      GM_setValue("sb_disable_alerts", isChecked);
      updateAlertsDisabledState(isChecked);
    });

    const autoReconnectInput = shadow.getElementById("sb-auto-reconnect-tiktok");
    const savedAutoReconnect = GM_getValue("sb_auto_reconnect_tiktok", false);
    if (autoReconnectInput) autoReconnectInput.checked = savedAutoReconnect;
    autoReconnectInput?.addEventListener("change", () => {
      GM_setValue("sb_auto_reconnect_tiktok", autoReconnectInput.checked);
    });

    const dropzoneBase = shadow.getElementById("sb-dropzone-base");
    const inputBase = shadow.getElementById("sb-images-base");
    const previewContainerBase = shadow.getElementById("sb-preview-base");
    const previewCountBase = shadow.getElementById("sb-count-base");
    const previewListBase = shadow.getElementById("sb-list-base");
    const btnClearBase = shadow.getElementById("sb-clear-base");

    const dropzoneVar4 = shadow.getElementById("sb-dropzone-var4");
    const inputVar4 = shadow.getElementById("sb-images-var4");
    const previewContainerVar4 = shadow.getElementById("sb-preview-var4");
    const previewCountVar4 = shadow.getElementById("sb-count-var4");
    const previewListVar4 = shadow.getElementById("sb-list-var4");
    const btnClearVar4 = shadow.getElementById("sb-clear-var4");

    function setStatus(text, state = "idle") {
      statusText.textContent = text;
      statusDot.className = `sb-status-dot ${state}`;
    }

    function updateUIState() {
      btnStart.disabled = isRunning;
      btnStop.disabled = !isRunning;
      if (btnDeleteAll) btnDeleteAll.disabled = isRunning;
      if (btnLoadServer) btnLoadServer.disabled = isRunning;
      if (btnShareVars) btnShareVars.disabled = isRunning;

      const inputs = shadow.querySelectorAll(".sb-autofill-input");
      inputs.forEach((input) => {
        input.disabled = isRunning;
      });

      if (disableAlertsInput) {
        disableAlertsInput.disabled = isRunning;
      }

      if (isRunning) {
        if (dropzoneBase) {
          dropzoneBase.style.pointerEvents = "none";
          dropzoneBase.style.opacity = "0.5";
        }
        if (dropzoneVar4) {
          dropzoneVar4.style.pointerEvents = "none";
          dropzoneVar4.style.opacity = "0.5";
        }
        if (btnClearBase) btnClearBase.disabled = true;
        if (btnClearVar4) btnClearVar4.disabled = true;
      } else {
        if (dropzoneBase) {
          dropzoneBase.style.pointerEvents = "auto";
          dropzoneBase.style.opacity = "1";
        }
        if (dropzoneVar4) {
          dropzoneVar4.style.pointerEvents = "auto";
          dropzoneVar4.style.opacity = "1";
        }
        if (btnClearBase) btnClearBase.disabled = false;
        if (btnClearVar4) btnClearVar4.disabled = false;
      }
    }

    function setupDropzone(dropzone, input, onFilesSelected) {
      if (!dropzone || !input) return;
      dropzone.addEventListener("click", () => input.click());

      input.addEventListener("change", (e) => {
        if (e.target.files && e.target.files.length > 0) {
          onFilesSelected(e.target.files);
        }
      });

      dropzone.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "#6366f1";
        dropzone.style.backgroundColor = "rgba(99, 102, 241, 0.05)";
      });

      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      dropzone.addEventListener("dragleave", () => {
        dropzone.style.borderColor = "rgba(255, 255, 255, 0.15)";
        dropzone.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
      });

      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "rgba(255, 255, 255, 0.15)";
        dropzone.style.backgroundColor = "rgba(0, 0, 0, 0.2)";

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFilesSelected(e.dataTransfer.files);
        }
      });
    }

    function renderListPreviews(files, container, countEl, listEl) {
      if (!listEl || !container || !countEl) return;
      listEl.innerHTML = "";
      if (!files || files.length === 0) {
        container.style.display = "none";
        countEl.textContent = "0 images";
        return;
      }

      container.style.display = "flex";
      countEl.textContent = `${files.length} image${files.length !== 1 ? "s" : ""}`;

      files.forEach((file) => {
        const item = document.createElement("div");
        item.className = "sb-file-preview-item";

        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        img.title = file.name;

        item.appendChild(img);
        listEl.appendChild(item);
      });
    }

    if (dropzoneBase && inputBase) {
      setupDropzone(dropzoneBase, inputBase, (files) => {
        baseFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
        renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
        saveFilesToGM("sb_base_files", baseFiles);
      });
    }

    if (btnClearBase) {
      btnClearBase.addEventListener("click", () => {
        baseFiles = [];
        if (inputBase) inputBase.value = "";
        renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
        GM_setValue("sb_base_files", "");
      });
    }

    if (dropzoneVar4 && inputVar4) {
      setupDropzone(dropzoneVar4, inputVar4, (files) => {
        var4Files = Array.from(files).filter((file) => file.type.startsWith("image/"));
        renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);
        saveFilesToGM("sb_var4_files", var4Files);
      });
    }

    if (btnClearVar4) {
      btnClearVar4.addEventListener("click", () => {
        var4Files = [];
        if (inputVar4) inputVar4.value = "";
        renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);
        GM_setValue("sb_var4_files", "");
      });
    }

    function setContentEditableText(el, text) {
      el.focus();

      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, text);

      if (el.textContent !== text) {
        el.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = text;
        el.appendChild(p);
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
    }

    function findFileInputNear(btn) {
      let current = btn;
      for (let depth = 0; depth < 4; depth++) {
        if (!current || current === document.body) break;
        const input = current.querySelector('input[type="file"]');
        if (input) return input;
        current = current.parentElement;
      }
      return null;
    }

    function isProfileFileInput(input) {
      const isProfileOrAvatar = (str) => {
        if (!str) return false;
        const s = str.toLowerCase();
        return s.includes("profile") || s.includes("avatar") || s.includes("user-pic") || s.includes("account-image");
      };
      if (isProfileOrAvatar(input.id) || isProfileOrAvatar(input.className) || isProfileOrAvatar(input.name)) {
        return true;
      }
      if (input.closest('[class*="profile"], [id*="profile"], [class*="avatar"], [id*="avatar"], [class*="user"], [id*="user"]')) {
        return true;
      }
      return false;
    }

    function getActiveEditorContainer() {
      const qlEditors = Array.from(document.querySelectorAll(".ql-editor"));
      const qlEditor = qlEditors.find((el) => el.offsetWidth > 0 && el.offsetHeight > 0) || document.querySelector(".ql-editor");
      if (!qlEditor) return null;
      return qlEditor.closest('.post-editor, .editor-container, .editor-inner, [class*="editor"]') || qlEditor.parentElement;
    }

    function getVariationSelectors() {
      const elements = Array.from(document.querySelectorAll("a, button, li, div"));
      return elements.filter((el) => {
        const text = el.textContent.trim();
        const hasVariationClass = el.className && typeof el.className === "string" && el.className.toLowerCase().includes("variation");
        const hasVariationId = el.id && typeof el.id === "string" && el.id.toLowerCase().includes("variation");
        const isVariationText = /^(variation|var|v)\s*\d+$/i.test(text) || text === "Base" || text === "Original";

        const isProfile = el.closest('.editor-selected-accounts, .selected-profile, [class*="profile"]');

        return (hasVariationClass || hasVariationId || isVariationText) && !isProfile && el.offsetWidth > 0;
      });
    }

    function selectVariation(index) {
      const selectors = getVariationSelectors();
      if (index >= 1 && index <= selectors.length) {
        const tab = selectors[index - 1];
        console.log(`Selecting variation ${index}:`, tab);
        tab.click();
        return true;
      }
      return false;
    }

    function uploadImageToWebpage(file) {
      let success = false;

      const uploadBtn = Array.from(document.querySelectorAll('button.upload-btn, .upload-btn, [class*="upload-btn"]')).find((btn) => btn.offsetWidth > 0) || document.querySelector('button.upload-btn, .upload-btn, [class*="upload-btn"]');
      const editorContainer = getActiveEditorContainer();

      if (uploadBtn) {
        const fileInput = findFileInputNear(uploadBtn);
        if (fileInput) {
          try {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
            fileInput.dispatchEvent(new Event("input", { bubbles: true }));
            success = true;
          } catch (e) {
            console.error("Error setting file input directly:", e);
          }
        }
      }

      if (!success) {
        const containerInputs = editorContainer ? Array.from(editorContainer.querySelectorAll('input[type="file"]')) : [];
        const activeNonProfileInputs = containerInputs.filter((input) => !isProfileFileInput(input));

        const targets = activeNonProfileInputs.length > 0 ? activeNonProfileInputs : Array.from(document.querySelectorAll('input[type="file"]')).filter((input) => !isProfileFileInput(input));

        targets.forEach((webInput) => {
          try {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            webInput.files = dataTransfer.files;

            webInput.dispatchEvent(new Event("change", { bubbles: true }));
            webInput.dispatchEvent(new Event("input", { bubbles: true }));
            success = true;
          } catch (e) {
            console.error("Error setting fallback file input:", e);
          }
        });
      }

      if (!success) {
        const dropTargets = [];
        if (uploadBtn) {
          dropTargets.push(uploadBtn);
        }
        if (editorContainer) {
          const localTargets = editorContainer.querySelectorAll('.upload-area, [class*="upload-area"], [class*="upload-btn"], [data-testid="media-upload"]');
          localTargets.forEach((t) => {
            if (!dropTargets.includes(t)) dropTargets.push(t);
          });
          if (!dropTargets.includes(editorContainer)) {
            dropTargets.push(editorContainer);
          }
        }

        dropTargets.forEach((target) => {
          try {
            target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
            target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);

            const dropEvent = new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer: dataTransfer,
            });

            target.dispatchEvent(dropEvent);
            success = true;
          } catch (e) {
            console.error("Error dispatching drop event on target:", target, e);
          }
        });
      }

      return success;
    }

    function getRandomElement(arr) {
      if (!arr || arr.length === 0) return null;
      const randomIndex = Math.floor(Math.random() * arr.length);
      return arr[randomIndex];
    }

    function shuffleArray(arr) {
      if (!arr || arr.length === 0) return [];
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    async function startAutomation() {
      const profiles = Array.from(document.querySelectorAll(".editor-selected-accounts .selected-profile"));

      if (profiles.length === 0) {
        setStatus("No profiles found! Open the SocialBee post editor.", "error");
        return;
      }

      if (baseFiles.length === 0) {
        baseFiles = loadFilesFromGM("sb_base_files");
      }
      if (var4Files.length === 0) {
        var4Files = loadFilesFromGM("sb_var4_files");
      }

      isRunning = true;
      updateUIState();

      const poolImages = shuffleArray(baseFiles);
      const poolImagesVar4 = var4Files.length > 0 ? shuffleArray(var4Files) : [];

      const profileCaptions = [];
      const captionMode = shadow.getElementById("sb-caption-mode").value;
      const captionA = shadow.getElementById("sb-caption-a").value;
      const captionB = shadow.getElementById("sb-caption-b").value;
      const stepDelay = Math.max(300, parseInt(shadow.getElementById("sb-delay").value, 10) || 1500);
      const uploadDelay = Math.max(500, parseInt(shadow.getElementById("sb-upload-delay").value, 10) || 3000);
      const varDelay = Math.max(300, parseInt(shadow.getElementById("sb-var-delay").value, 10) || 1500);
      const uiDelay = Math.max(100, parseInt(shadow.getElementById("sb-ui-delay").value, 10) || 500);

      setStatus(`Phase 1: Filling captions and base images (0/${profiles.length})...`, "running");

      for (let i = 0; i < profiles.length; i++) {
        if (!isRunning) break;

        const profile = profiles[i];
        setStatus(`Phase 1: Processing profile ${i + 1}/${profiles.length}...`, "running");

        profile.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const originalOutline = profile.style.outline;
        const originalOutlineOffset = profile.style.outlineOffset;
        const originalTransition = profile.style.transition;

        profile.style.transition = "outline 0.2s ease-in-out";
        profile.style.outline = "3px solid #6366f1";
        profile.style.outlineOffset = "2px";

        profile.click();

        await sleep(uiDelay);
        const proceedBtn = document.querySelector("button.btn-primary-sb");
        if (proceedBtn) {
          console.log("Found Proceed button, clicking to confirm customization.");
          proceedBtn.click();
          await sleep(uiDelay);
        }

        await sleep(stepDelay);

        if (!isRunning) {
          profile.style.outline = originalOutline;
          profile.style.outlineOffset = originalOutlineOffset;
          profile.style.transition = originalTransition;
          break;
        }

        const qlEditors = Array.from(document.querySelectorAll(".ql-editor"));
        const editor = qlEditors.find((el) => el.offsetWidth > 0 && el.offsetHeight > 0) || document.querySelector(".ql-editor");
        if (editor) {
          let caption = "";
          let chosenOption = "A";
          if (captionMode === "alternate") {
            if (i % 2 === 0) {
              caption = captionA;
              chosenOption = "A";
            } else {
              caption = captionB;
              chosenOption = "B";
            }
          } else if (captionMode === "random") {
            if (Math.random() < 0.5) {
              caption = captionA;
              chosenOption = "A";
            } else {
              caption = captionB;
              chosenOption = "B";
            }
          } else if (captionMode === "a-only") {
            caption = captionA;
            chosenOption = "A";
          } else if (captionMode === "b-only") {
            caption = captionB;
            chosenOption = "B";
          } else if (captionMode === "distribute-v4-b") {
            caption = captionA;
            chosenOption = "A";
          }

          profileCaptions[i] = chosenOption;
          setContentEditableText(editor, caption);
        } else {
          setStatus(`Editor not found on profile ${i + 1}!`, "error");
        }

        if (poolImages.length > 0) {
          const firstImg = poolImages[i % poolImages.length];

          setStatus(`Uploading base image for profile ${i + 1}: ${firstImg.name}...`, "running");
          const uploadTriggered = uploadImageToWebpage(firstImg);
          if (uploadTriggered) {
            await sleep(uploadDelay);
          } else {
            setStatus(`File uploader not found for profile ${i + 1}!`, "error");
            await sleep(uiDelay);
          }
        }

        setStatus(`Processed Phase 1 for ${i + 1}/${profiles.length} profiles`, "running");

        profile.style.outline = originalOutline;
        profile.style.outlineOffset = originalOutlineOffset;
        profile.style.transition = originalTransition;

        await sleep(uiDelay);
      }

      if (isRunning) {
        setStatus("Creating variations (up to 4)...", "running");
        for (let v = 0; v < 3; v++) {
          if (!isRunning) break;
          const addBtn = document.getElementById("addVariationButton");
          if (addBtn) {
            addBtn.click();
            await sleep(varDelay);
          } else {
            console.log("Add Variation button not found!");
            break;
          }
        }
      }

      if (isRunning && (poolImages.length > 0 || poolImagesVar4.length > 0)) {
        setStatus(`Phase 2: Swapping images on Variation 4 (0/${profiles.length})...`, "running");

        for (let i = 0; i < profiles.length; i++) {
          if (!isRunning) break;

          const profile = profiles[i];
          setStatus(`Phase 2: Processing profile ${i + 1}/${profiles.length}...`, "running");

          profile.scrollIntoView({ block: "nearest", behavior: "smooth" });
          const originalOutline = profile.style.outline;
          const originalOutlineOffset = profile.style.outlineOffset;
          const originalTransition = profile.style.transition;

          profile.style.transition = "outline 0.2s ease-in-out";
          profile.style.outline = "3px solid #a855f7";
          profile.style.outlineOffset = "2px";

          profile.click();

          await sleep(uiDelay);
          const proceedBtn = document.querySelector("button.btn-primary-sb");
          if (proceedBtn) {
            console.log("Found Proceed button, clicking to confirm customization.");
            proceedBtn.click();
            await sleep(uiDelay);
          }

          await sleep(stepDelay);

          if (!isRunning) {
            profile.style.outline = originalOutline;
            profile.style.outlineOffset = originalOutlineOffset;
            profile.style.transition = originalTransition;
            break;
          }

          const secondImg = poolImagesVar4.length > 0 ? poolImagesVar4[i % poolImagesVar4.length] : poolImages[(i + profiles.length) % poolImages.length];

          selectVariation(4);
          await sleep(varDelay);

          const editor = Array.from(document.querySelectorAll(".ql-editor")).find((el) => el.offsetWidth > 0 && el.offsetHeight > 0) || document.querySelector(".ql-editor");
          if (editor) {
            let targetCaption = "";
            if (captionMode === "distribute-v4-b") {
              targetCaption = captionB;
            } else {
              const originalOption = profileCaptions[i] || "A";
              targetCaption = originalOption === "A" ? captionB : captionA;
            }
            console.log(`Phase 2: Setting caption for profile ${i + 1} to Var 4 value`);
            setContentEditableText(editor, targetCaption);
            await sleep(uiDelay);
          }

          const removeImageBtn = Array.from(document.querySelectorAll('button.close-icon, .close-icon, button[class*="close-icon"]')).find((btn) => btn.offsetWidth > 0);

          if (removeImageBtn) {
            console.log("Clicking remove image button on Variation 4:", removeImageBtn);
            removeImageBtn.click();
            await sleep(varDelay);

            setStatus(`Phase 2: Uploading Var 4-6 image to Variation 4: ${secondImg.name}...`, "running");
            const secondUploadTriggered = uploadImageToWebpage(secondImg);
            if (secondUploadTriggered) {
              await sleep(uploadDelay);
            } else {
              setStatus(`File uploader not found for second image!`, "error");
              await sleep(uiDelay);
            }
          } else {
            console.log("Remove image button not found on Variation 4!");
          }

          setStatus(`Processed Phase 2 for ${i + 1}/${profiles.length} profiles`, "running");

          profile.style.outline = originalOutline;
          profile.style.outlineOffset = originalOutlineOffset;
          profile.style.transition = originalTransition;

          await sleep(uiDelay);
        }

        if (isRunning) {
          setStatus("Creating variations (up to 6)...", "running");
          for (let v = 0; v < 2; v++) {
            if (!isRunning) break;
            const addBtn = document.getElementById("addVariationButton");
            if (addBtn) {
              addBtn.click();
              await sleep(varDelay);
            } else {
              console.log("Add Variation button not found!");
              break;
            }
          }
        }
      }

      const completed = isRunning;
      isRunning = false;
      updateUIState();

      if (completed) {
        setStatus("Successfully filled all profiles and variations!", "success");
      } else {
        setStatus("Automation stopped.", "idle");
      }
    }

    function stopAutomation() {
      if (!isRunning) return;
      isRunning = false;
      setStatus("Stopping...", "idle");
    }

    function getConnectedProfilesCount() {
      const progressVal = document.querySelector("jhi-circular-progress .custom-progress-value b, .custom-progress-value b");
      if (progressVal) {
        const match = progressVal.textContent.trim().match(/^(\d+)/);
        if (match) return parseInt(match[1], 10);
      }

      const paragraphs = Array.from(document.querySelectorAll("p"));
      for (const p of paragraphs) {
        const text = p.textContent || "";
        if (text.includes("You have connected")) {
          const strongs = p.querySelectorAll("strong");
          if (strongs.length > 0) {
            const match = strongs[0].textContent.trim().match(/^\d+/);
            if (match) return parseInt(match[0], 10);
          }

          const match = text.match(/connected\s+(\d+)\s+profiles/i);
          if (match) return parseInt(match[1], 10);
        }
      }

      return null;
    }

    function findDeleteButtonDirect() {
      const elements = Array.from(document.querySelectorAll("button, a, i, span, div[role='button']"));
      const candidates = elements.filter((el) => {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;

        if (el.closest("#sb-suite-root") || el.closest("#sb-autofill-root")) return false;

        if (el.dataset.sbDeleteAttempted === "true" || el.closest("button, a")?.dataset.sbDeleteAttempted === "true") {
          return false;
        }

        if (el.closest(".modal, .modal-content, .modal-dialog, .modal-container, ngb-modal-window")) {
          return false;
        }

        const text = (el.textContent || "").trim().toLowerCase();
        const title = (el.getAttribute("title") || el.getAttribute("data-original-title") || el.getAttribute("aria-label") || "").toLowerCase();
        const className = (el.className || "").toLowerCase();
        const id = (el.id || "").toLowerCase();

        if (text.includes("yes") || text.includes("confirm") || text.includes("cancel") || text.includes("no") || text.includes("close") || text.includes("keep") || className.includes("btn-primary-sb")) {
          return false;
        }

        const isTrashIcon = className.includes("trash") || className.includes("delete") || className.includes("remove") || className.includes("disconnect");
        const isDeleteWord = text === "delete" || text === "remove" || text === "disconnect" || text.includes("remove account") || text.includes("delete account") || text.includes("disconnect profile") || text.includes("remove profile");
        const isDeleteTitle = title.includes("delete") || title.includes("remove") || title.includes("disconnect") || title.includes("unlink") || title.includes("trash");
        const isDeleteId = id.includes("delete") || id.includes("remove") || id.includes("disconnect");

        return isTrashIcon || isDeleteWord || isDeleteTitle || isDeleteId;
      });

      return candidates.length > 0 ? candidates[0] : null;
    }

    function findProfileSelector() {
      const elements = Array.from(document.querySelectorAll("a, button, div, li, tr, [role='tab']"));
      const items = elements.filter((el) => {
        if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;

        if (el.closest("#sb-suite-root") || el.closest("#sb-autofill-root") || el.closest(".modal, .modal-content, ngb-modal-window")) {
          return false;
        }

        if (el.dataset.sbProfileSelectAttempted === "true" || el.closest("a, button")?.dataset.sbProfileSelectAttempted === "true") {
          return false;
        }

        const className = (el.className || "").toLowerCase();
        const id = (el.id || "").toLowerCase();
        const text = (el.textContent || "").trim().toLowerCase();

        const isProfileClass = className.includes("profile-card") || className.includes("account-card") || className.includes("profile-item") || className.includes("account-item") || className.includes("connected-account") || className.includes("sidebar-profile");
        const isProfileId = id.includes("profile") || id.includes("account");

        const hasProfileParent = el.closest('[class*="profile-list"], [class*="connected-accounts"], [class*="social-accounts"], [class*="profiles-list"]');
        const isClickableChild = el.tagName === "A" || el.tagName === "BUTTON" || className.includes("active") || className.includes("item") || className.includes("card") || el.getAttribute("role") === "tab";

        return isProfileClass || isProfileId || (hasProfileParent && isClickableChild);
      });

      return items.length > 0 ? items[0] : null;
    }

    async function deleteAllAccounts() {
      let initialCount = getConnectedProfilesCount();
      let countMessage = initialCount !== null ? ` (${initialCount} remaining)` : "";

      if (!confirm(`Are you sure you want to delete all visible social accounts on this page?${initialCount !== null ? ` (Detected ${initialCount} accounts)` : ""}`)) {
        return;
      }

      isRunning = true;
      updateUIState();
      setStatus(`Starting account deletion...${countMessage}`, "running");

      try {
        const stepDelay = Math.max(300, parseInt(shadow.getElementById("sb-delay").value, 10) || 1500);
        let deletedCount = 0;
        let consecutiveFailures = 0;

        document.querySelectorAll("[data-sb-delete-attempted], [data-sb-profile-select-attempted]").forEach((el) => {
          delete el.dataset.sbDeleteAttempted;
          delete el.dataset.sbProfileSelectAttempted;
        });

        while (isRunning) {
          const currentCount = getConnectedProfilesCount();
          console.log("[SocialBee Autofill] Current connected profiles count:", currentCount);
          if (currentCount === 0) {
            console.log("[SocialBee Autofill] Dynamic profile count reached 0. Deletion complete!");
            break;
          }

          let deleteBtn = null;
          let profileItem = null;

          setStatus("Waiting for account elements to load...", "running");

          // Poll for delete button or profile selector (up to 20 attempts ~ 8 seconds)
          for (let poll = 0; poll < 20; poll++) {
            if (!isRunning) break;
            deleteBtn = findDeleteButtonDirect();
            if (deleteBtn) break;

            profileItem = findProfileSelector();
            if (profileItem) break;

            await sleep(400);
          }

          if (!isRunning) break;

          if (!deleteBtn && profileItem) {
            console.log("[SocialBee Autofill] Selecting profile item to reveal delete button:", profileItem);
            profileItem.dataset.sbProfileSelectAttempted = "true";

            profileItem.scrollIntoView({ block: "center", behavior: "smooth" });
            await sleep(400);
            profileItem.click();

            // Poll for delete button to render after clicking profile item (up to 20 attempts ~ 8 seconds)
            setStatus("Waiting for delete button after profile selection...", "running");
            for (let poll = 0; poll < 20; poll++) {
              if (!isRunning) break;
              deleteBtn = findDeleteButtonDirect();
              if (deleteBtn) break;
              await sleep(400);
            }
          }

          if (!deleteBtn) {
            if (consecutiveFailures < 2) {
              consecutiveFailures++;
              console.warn(`[SocialBee Autofill] Delete button not found yet (retry ${consecutiveFailures}/2). Resetting attempt flags...`);
              document.querySelectorAll("[data-sb-delete-attempted], [data-sb-profile-select-attempted]").forEach((el) => {
                delete el.dataset.sbDeleteAttempted;
                delete el.dataset.sbProfileSelectAttempted;
              });
              await sleep(1500);
              continue;
            }
            console.log("[SocialBee Autofill] No delete buttons found and no remaining profiles can be selected.");
            break;
          }

          consecutiveFailures = 0;

          let clickTarget = deleteBtn;
          if (deleteBtn.tagName === "I" || deleteBtn.tagName === "SPAN") {
            clickTarget = deleteBtn.closest("button, a") || deleteBtn;
          }

          clickTarget.dataset.sbDeleteAttempted = "true";

          console.log("[SocialBee Autofill] Clicking delete target:", clickTarget);

          const remaining = currentCount !== null ? currentCount : initialCount !== null ? Math.max(0, initialCount - deletedCount) : null;
          const remMessage = remaining !== null ? ` (${remaining} remaining)` : "";
          setStatus(`Deleting account...${remMessage}`, "running");

          clickTarget.scrollIntoView({ block: "center", behavior: "smooth" });
          await sleep(500);
          clickTarget.click();

          // Poll for confirmation modal & button (up to 30 attempts ~ 9 seconds)
          let clickedConfirm = false;
          for (let attempt = 0; attempt < 30; attempt++) {
            if (!isRunning) break;
            const confirmBtn = Array.from(document.querySelectorAll("button")).find((button) => {
              const txt = (button.textContent || "").trim().toLowerCase();
              const className = (button.className || "").toLowerCase();
              return txt.includes("yes, remove social account") || txt.includes("yes, remove") || txt === "remove" || txt.includes("disconnect") || (className.includes("btn-primary-sb") && (txt.includes("remove") || txt.includes("disconnect")));
            });

            if (confirmBtn && confirmBtn.offsetWidth > 0) {
              console.log("[SocialBee Autofill] Found confirm button in modal. Clicking...");
              confirmBtn.click();
              clickedConfirm = true;
              deletedCount++;
              break;
            }
            await sleep(300);
          }

          if (!clickedConfirm) {
            console.warn("[SocialBee Autofill] Failed to find/click confirmation button for this item.");
            setStatus("Could not confirm deletion of account.", "error");
            break;
          }

          await sleep(stepDelay + 1500);
        }

        setStatus(`Successfully removed ${deletedCount} account${deletedCount !== 1 ? "s" : ""}!`, "success");
      } catch (e) {
        console.error("[SocialBee Autofill] Error deleting accounts:", e);
        setStatus("Error during account deletion.", "error");
      } finally {
        isRunning = false;
        updateUIState();
      }
    }

    btnStart.addEventListener("click", startAutomation);
    btnStop.addEventListener("click", stopAutomation);
    if (btnDeleteAll) btnDeleteAll.addEventListener("click", deleteAllAccounts);
    if (btnLogoutTiktok) {
      btnLogoutTiktok.addEventListener("click", () => {
        console.log("[SocialBee Autofill] Manually triggered TikTok logout.");
        window.open("https://www.tiktok.com/logout?auto_close=true", "_blank", "width=500,height=600");
      });
    }
    if (btnLoadServer) btnLoadServer.addEventListener("click", loadImagesFromServer);
    if (btnShareVars) btnShareVars.addEventListener("click", shareVariationsAutomation);

    function fetchBlobFromUrl(url) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          responseType: "blob",
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve({
                blob: res.response,
                filename: res.responseHeaders.match(/x-filename:\s*(.+)/i)?.[1]?.trim() || "image.png",
              });
            } else {
              reject(new Error(`Failed to load image: ${res.statusText}`));
            }
          },
          onerror: (err) => reject(err),
        });
      });
    }

    function fetchJsonFromUrl(url) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          responseType: "json",
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve(res.response);
            } else {
              reject(new Error(`Failed to load list: ${res.statusText}`));
            }
          },
          onerror: (err) => reject(err),
        });
      });
    }

    async function loadImagesFromServer() {
      try {
        setStatus("Loading server images...", "running");
        const list = await fetchJsonFromUrl(getServerUrl("/images/list"));

        baseFiles = [];
        var4Files = [];

        if (list.var_1_3 && list.var_1_3.length > 0) {
          for (const filename of list.var_1_3) {
            const fileUrl = getServerUrl(`/images/file?folder=var_1_3&name=${encodeURIComponent(filename)}`);
            const { blob, filename: serverName } = await fetchBlobFromUrl(fileUrl);
            const file = new File([blob], serverName, { type: blob.type });
            baseFiles.push(file);
          }
          saveFilesToGM("sb_base_files", baseFiles);
        }

        if (list.var_4_6 && list.var_4_6.length > 0) {
          for (const filename of list.var_4_6) {
            const fileUrl = getServerUrl(`/images/file?folder=var_4_6&name=${encodeURIComponent(filename)}`);
            const { blob, filename: serverName } = await fetchBlobFromUrl(fileUrl);
            const file = new File([blob], serverName, { type: blob.type });
            var4Files.push(file);
          }
          saveFilesToGM("sb_var4_files", var4Files);
        }

        renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
        renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);

        setStatus(`Loaded ${baseFiles.length} base & ${var4Files.length} var4-6 images from server.`, "success");
      } catch (err) {
        console.error("Failed to load server images:", err);
        setStatus("Failed to load server images: " + err.message, "error");
      }
    }

    const storedBase = loadFilesFromGM("sb_base_files");
    const storedVar4 = loadFilesFromGM("sb_var4_files");
    if (storedBase.length > 0 || storedVar4.length > 0) {
      baseFiles = storedBase;
      var4Files = storedVar4;
      renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
      renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);
      setStatus("Restored saved images from local storage.", "success");
    } else {
      loadImagesFromServer();
    }

    async function shareVariationsAutomation() {
      isRunning = true;
      updateUIState();
      setStatus("Starting variation share automation...", "running");

      try {
        const stepDelay = Math.max(300, parseInt(shadow.getElementById("sb-delay").value, 10) || 1500);

        let shareNowBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
          return (btn.textContent || "").includes("Share now") && btn.offsetWidth > 0;
        });

        let modal = document.querySelector(".modal-content");
        if (!modal) {
          if (!shareNowBtn) {
            throw new Error("No 'Share now' button found on the page.");
          }
          console.log("[SocialBee] Clicking 'Share now' button to open modal");
          shareNowBtn.click();

          let opened = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            await sleep(200);
            modal = document.querySelector(".modal-content");
            if (modal) {
              opened = true;
              break;
            }
          }
          if (!opened) {
            throw new Error("Modal failed to open after clicking 'Share now'.");
          }
        }

        const selectEl = document.querySelector("#chosenVariation");
        if (!selectEl) {
          throw new Error("Variation dropdown (#chosenVariation) not found inside modal.");
        }

        const optionValues = Array.from(selectEl.options)
          .map((opt) => opt.value)
          .filter((val) => /^\d+$/.test(val));

        if (optionValues.length === 0) {
          throw new Error("No variations found in the dropdown.");
        }

        console.log("[SocialBee] Found variation values to share:", optionValues);

        for (let idx = 0; idx < optionValues.length; idx++) {
          if (!isRunning) break;

          const varVal = optionValues[idx];
          setStatus(`Sharing Variation ${idx + 1}/${optionValues.length}...`, "running");

          modal = document.querySelector(".modal-content");
          if (!modal) {
            shareNowBtn = Array.from(document.querySelectorAll("button")).find((btn) => {
              return (btn.textContent || "").includes("Share now") && btn.offsetWidth > 0;
            });

            if (!shareNowBtn) {
              throw new Error("Could not find 'Share now' button to share next variation.");
            }

            console.log("[SocialBee] Opening modal for variation:", varVal);
            shareNowBtn.click();

            let opened = false;
            for (let attempt = 0; attempt < 20; attempt++) {
              await sleep(200);
              modal = document.querySelector(".modal-content");
              if (modal) {
                opened = true;
                break;
              }
            }
            if (!opened) {
              throw new Error("Modal failed to re-open.");
            }
          }

          await sleep(500);

          const profileBtns = Array.from(document.querySelectorAll(".edit-social-accounts button.inactive")).filter((btn) => btn.disabled === false && btn.offsetWidth > 0);

          console.log(`[SocialBee] Selecting ${profileBtns.length} inactive profiles`);
          for (const btn of profileBtns) {
            btn.click();
            await sleep(150);
          }

          const currentSelectEl = document.querySelector("#chosenVariation");
          if (!currentSelectEl) {
            throw new Error("Dropdown not found during loop execution.");
          }

          console.log("[SocialBee] Selecting variation value:", varVal);
          currentSelectEl.value = varVal;
          currentSelectEl.dispatchEvent(new Event("change", { bubbles: true }));
          currentSelectEl.dispatchEvent(new Event("input", { bubbles: true }));

          await sleep(500);

          const shareSubmitBtn = document.querySelector("button.btn-primary-sb");
          if (!shareSubmitBtn) {
            throw new Error("Share/Submit button not found.");
          }

          console.log("[SocialBee] Clicking Share submit button");
          shareSubmitBtn.click();

          let closed = false;
          for (let attempt = 0; attempt < 25; attempt++) {
            await sleep(200);
            if (!document.querySelector(".modal-content")) {
              closed = true;
              break;
            }
          }

          if (!closed) {
            console.warn("[SocialBee] Warning: Modal did not close automatically. Waiting extra time...");
          }

          await sleep(stepDelay + 1000);
        }

        if (isRunning) {
          setStatus("Successfully shared all variations!", "success");
        } else {
          setStatus("Share automation stopped.", "idle");
        }
      } catch (e) {
        console.error("[SocialBee] Error in Share Variations:", e);
        setStatus("Error: " + e.message, "error");
      } finally {
        isRunning = false;
        updateUIState();
      }
    }

    const suitePanel = shadow.getElementById("sb-suite-panel");
    if (suitePanel) {
      suitePanel.addEventListener("click", (e) => {
        if (suitePanel.classList.contains("minimized")) {
          const storedBase = loadFilesFromGM("sb_base_files");
          const storedVar4 = loadFilesFromGM("sb_var4_files");
          if (storedBase.length > 0 || storedVar4.length > 0) {
            baseFiles = storedBase;
            var4Files = storedVar4;
            renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
            renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);
          }
        }
      });
    }

    function ensureChecked() {
      const checkboxes = document.querySelectorAll('input[name="usersCanComment"], input#usersCanComment');

      checkboxes.forEach((checkbox) => {
        if (!checkbox.checked) {
          console.log("[AutoComment] Checkbox found unchecked. Simulating interaction...");

          let label = null;
          if (checkbox.id) {
            label = document.querySelector(`label[for="${checkbox.id}"]`);
          }
          if (!label) {
            label = checkbox.closest("label");
          }

          if (label) {
            label.click();
          } else {
            checkbox.click();
          }

          setTimeout(() => {
            if (!checkbox.checked) {
              console.log("[AutoComment] Click failed to check. Forcing state...");
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event("change", { bubbles: true }));
              checkbox.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }, 50);
        }
      });
    }

    setInterval(ensureChecked, 300);

    setInterval(() => {
      if (GM_getValue("tiktok_authorized_flag") === true) {
        console.log("[SocialBee Autofill] Detected completed TikTok authorization. Triggering logout...");
        GM_setValue("tiktok_authorized_flag", false);
        const logoutTab = GM_openInTab("https://www.tiktok.com/logout?auto_close=true", { active: false, insert: true });
        setTimeout(() => {
          if (logoutTab && typeof logoutTab.close === "function") {
            try {
              logoutTab.close();
            } catch (e) {}
          }
        }, 10000);
      }
    }, 1500);
  }

  // Create unified UI panel
  createUnifiedPanel();

  // Dispatch modules based on matched domains/pages
  if (hostname.includes("tiktok.com") || hostname.includes("kuku.lu") || hostname.includes("socialbee.com") || hostname.includes("socialbee.io")) {
    try {
      runOtpLinker(suiteShadow);
    } catch(e) {
      console.error("[SocialBee Suite] Error running OTP Linker Module:", e);
    }
  }

  if (hostname.includes("socialbee.com") || hostname.includes("socialbee.io")) {
    try {
      runSocialBeeManager(suiteShadow);
    } catch(e) {
      console.error("[SocialBee Suite] Error running SocialBee Manager Module:", e);
    }
  }
})();
