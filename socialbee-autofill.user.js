// ==UserScript==
// @name         SocialBee Profile Caption Filler & Manager
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Automate filling captions, uploading custom images, and managing accounts in SocialBee
// @author       Kerby (Discord: buchinyan)
// @match        https://app.socialbee.com/*
// @match        https://app.socialbee.io/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // 1. Create the shadow DOM container to avoid styling conflicts
  const container = document.createElement("div");
  container.id = "sb-autofill-root";
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: "open" });

  // 2. Define the styles for the premium floating panel
  const style = document.createElement("style");
  style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        #sb-autofill-panel {
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
            z-index: 99999;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            user-select: none;
        }

        #sb-autofill-panel.minimized {
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

        #sb-autofill-panel.minimized #sb-autofill-content {
            display: none;
        }

        #sb-autofill-panel.minimized #sb-autofill-header {
            border: none;
            background: none;
            padding: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #sb-autofill-panel.minimized #sb-autofill-title {
            display: none;
        }

        #sb-autofill-panel.minimized #sb-autofill-toggle-btn {
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

        #sb-autofill-panel.minimized #sb-autofill-toggle-btn::before {
            content: '🐝';
        }

        #sb-autofill-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            cursor: move;
        }

        #sb-autofill-title {
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

        #sb-autofill-toggle-btn {
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

        #sb-autofill-toggle-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        #sb-autofill-content {
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 500px;
            overflow-y: auto;
        }

        /* Scrollbar styles for the control panel */
        #sb-autofill-content::-webkit-scrollbar {
            width: 6px;
        }
        #sb-autofill-content::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
        }
        #sb-autofill-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 3px;
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

        /* File dropzone / upload styles */
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
    `;
  shadow.appendChild(style);

  // 3. Define the HTML markup for the panel
  const panel = document.createElement("div");
  panel.id = "sb-autofill-panel";
  panel.innerHTML = `
        <div id="sb-autofill-header">
            <div id="sb-autofill-title">🐝 SocialBee Caption Filler v2.0</div>
            <button id="sb-autofill-toggle-btn" title="Toggle Panel">✕</button>
        </div>
        <div id="sb-autofill-content">
            <div class="sb-autofill-field">
                <label class="sb-autofill-label">Caption Option 1 (A)</label>
                <textarea id="sb-caption-a" class="sb-autofill-input sb-autofill-textarea">#gaymenoftiktok🏳️🌈 #gaydad #boyfriends #pridemonth #gay</textarea>
            </div>
            
            <div class="sb-autofill-field">
                <label class="sb-autofill-label">Caption Option 2 (B)</label>
                <textarea id="sb-caption-b" class="sb-autofill-input sb-autofill-textarea">#gayboy #gaydad #gay #boyfriends #twink</textarea>
            </div>

            <div class="sb-autofill-field">
                <label class="sb-autofill-label">Caption Distribution Mode</label>
                <select id="sb-caption-mode" class="sb-autofill-input sb-autofill-select">
                    <option value="alternate">Alternate (A, B, A, B...)</option>
                    <option value="random">Randomize (Choose A or B randomly)</option>
                    <option value="a-only">Option 1 (A) Only</option>
                    <option value="b-only">Option 2 (B) Only</option>
                </select>
            </div>

            <div class="sb-autofill-field">
                <label class="sb-autofill-label">Image for Var 1-3 (Optional)</label>
                <div id="sb-dropzone-base" class="sb-autofill-file-dropzone">
                    <span class="sb-file-dropzone-text">Click or Drop Base Image(s) Here</span>
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

            <div class="sb-autofill-field">
                <label class="sb-autofill-label">Image for Var 4-6 (Optional)</label>
                <div id="sb-dropzone-var4" class="sb-autofill-file-dropzone">
                    <span class="sb-file-dropzone-text">Click or Drop Var 4 Image(s) Here</span>
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
                        <input id="sb-delay" type="number" class="sb-autofill-input" value="1500" min="300" step="100">
                    </div>
                    <div class="sb-autofill-field">
                        <label class="sb-autofill-label">Upload Delay (ms)</label>
                        <input id="sb-upload-delay" type="number" class="sb-autofill-input" value="3000" min="500" step="100">
                    </div>
                    <div class="sb-autofill-field">
                        <label class="sb-autofill-label">Variation Action Delay (ms)</label>
                        <input id="sb-var-delay" type="number" class="sb-autofill-input" value="1500" min="300" step="100">
                    </div>
                    <div class="sb-autofill-field">
                        <label class="sb-autofill-label">UI/Modal Transition (ms)</label>
                        <input id="sb-ui-delay" type="number" class="sb-autofill-input" value="500" min="100" step="100">
                    </div>
                </div>
            </details>

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
                <button id="sb-btn-delete-all" class="sb-btn sb-btn-danger">🗑️ Delete All Accounts</button>
            </div>
            <div style="text-align: center; margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 9px; color: #6b7280; font-weight: 500; letter-spacing: 0.03em;">
                Developed by <span style="background: linear-gradient(90deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700;">Kerby</span> (Discord: <span style="color: #9ca3af; font-weight: 600;">buchinyan</span>)
            </div>
        </div>
    `;
  shadow.appendChild(panel);

  // 4. State Management
  let isRunning = false;
  let baseFiles = [];
  let var4Files = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Element references within Shadow DOM
  const toggleBtn = shadow.getElementById("sb-autofill-toggle-btn");
  const btnStart = shadow.getElementById("sb-btn-start");
  const btnStop = shadow.getElementById("sb-btn-stop");
  const btnDeleteAll = shadow.getElementById("sb-btn-delete-all");
  const statusText = shadow.getElementById("sb-status-text");
  const statusDot = shadow.getElementById("sb-status-dot");

  // Base Image elements
  const dropzoneBase = shadow.getElementById("sb-dropzone-base");
  const inputBase = shadow.getElementById("sb-images-base");
  const previewContainerBase = shadow.getElementById("sb-preview-base");
  const previewCountBase = shadow.getElementById("sb-count-base");
  const previewListBase = shadow.getElementById("sb-list-base");
  const btnClearBase = shadow.getElementById("sb-clear-base");

  // Var 4 Image elements
  const dropzoneVar4 = shadow.getElementById("sb-dropzone-var4");
  const inputVar4 = shadow.getElementById("sb-images-var4");
  const previewContainerVar4 = shadow.getElementById("sb-preview-var4");
  const previewCountVar4 = shadow.getElementById("sb-count-var4");
  const previewListVar4 = shadow.getElementById("sb-list-var4");
  const btnClearVar4 = shadow.getElementById("sb-clear-var4");

  // UI Status Helpers
  function setStatus(text, state = "idle") {
    statusText.textContent = text;
    statusDot.className = `sb-status-dot ${state}`;
  }

  function updateUIState() {
    btnStart.disabled = isRunning;
    btnStop.disabled = !isRunning;
    if (btnDeleteAll) btnDeleteAll.disabled = isRunning;

    const inputs = shadow.querySelectorAll(".sb-autofill-input");
    inputs.forEach((input) => {
      input.disabled = isRunning;
    });

    if (isRunning) {
      dropzoneBase.style.pointerEvents = "none";
      dropzoneBase.style.opacity = "0.5";
      btnClearBase.disabled = true;

      dropzoneVar4.style.pointerEvents = "none";
      dropzoneVar4.style.opacity = "0.5";
      btnClearVar4.disabled = true;
    } else {
      dropzoneBase.style.pointerEvents = "auto";
      dropzoneBase.style.opacity = "1";
      btnClearBase.disabled = false;

      dropzoneVar4.style.pointerEvents = "auto";
      dropzoneVar4.style.opacity = "1";
      btnClearVar4.disabled = false;
    }
  }

  // 5. File Selection and Previews
  function setupDropzone(dropzone, input, onFilesSelected) {
    dropzone.addEventListener("click", () => input.click());

    input.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesSelected(e.target.files);
      }
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#6366f1";
      dropzone.style.backgroundColor = "rgba(99, 102, 241, 0.05)";
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
    listEl.innerHTML = "";
    if (files.length === 0) {
      container.style.display = "none";
      return;
    }

    countEl.textContent = `${files.length} image${files.length > 1 ? "s" : ""} selected`;
    container.style.display = "flex";

    files.forEach((file) => {
      const item = document.createElement("div");
      item.className = "sb-file-preview-item";

      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);

      item.appendChild(img);
      listEl.appendChild(item);
    });
  }

  setupDropzone(dropzoneBase, inputBase, (files) => {
    baseFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
  });

  setupDropzone(dropzoneVar4, inputVar4, (files) => {
    var4Files = Array.from(files).filter((file) => file.type.startsWith("image/"));
    renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);
  });

  btnClearBase.addEventListener("click", () => {
    baseFiles = [];
    inputBase.value = "";
    renderListPreviews(baseFiles, previewContainerBase, previewCountBase, previewListBase);
  });

  btnClearVar4.addEventListener("click", () => {
    var4Files = [];
    inputVar4.value = "";
    renderListPreviews(var4Files, previewContainerVar4, previewCountVar4, previewListVar4);
  });

  // 6. Text Entry & File Upload Simulation
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

  // Helper to find file input close to the upload button
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

  // Helper to check if a file input belongs to profile/avatar upload
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

  // Helper to get active editor container
  function getActiveEditorContainer() {
    const qlEditors = Array.from(document.querySelectorAll(".ql-editor"));
    const qlEditor = qlEditors.find((el) => el.offsetWidth > 0 && el.offsetHeight > 0) || document.querySelector(".ql-editor");
    if (!qlEditor) return null;
    return qlEditor.closest('.post-editor, .editor-container, .editor-inner, [class*="editor"]') || qlEditor.parentElement;
  }

  // Helper to find all variation tab/button elements
  function getVariationSelectors() {
    const elements = Array.from(document.querySelectorAll("a, button, li, div"));
    return elements.filter((el) => {
      const text = el.textContent.trim();
      const hasVariationClass = el.className && typeof el.className === "string" && el.className.toLowerCase().includes("variation");
      const hasVariationId = el.id && typeof el.id === "string" && el.id.toLowerCase().includes("variation");
      const isVariationText = /^(variation|var|v)\s*\d+$/i.test(text) || text === "Base" || text === "Original";

      // Exclude profile selection tabs
      const isProfile = el.closest('.editor-selected-accounts, .selected-profile, [class*="profile"]');

      return (hasVariationClass || hasVariationId || isVariationText) && !isProfile && el.offsetWidth > 0;
    });
  }

  // Helper to select/click a specific variation tab (1-based index)
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

  // Modern multi-pronged upload simulation targeting the correct editor upload button/dropzone
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

    // Fallback: If no direct file input was found/successfully set near the button,
    // try any non-profile file inputs.
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

    // Simulate drop event on the upload button and editor container ONLY if direct setting wasn't successful
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

  // 7. Automation Core Loop
  async function startAutomation() {
    const profiles = Array.from(document.querySelectorAll(".editor-selected-accounts .selected-profile"));

    if (profiles.length === 0) {
      setStatus("No profiles found! Open the SocialBee post editor.", "error");
      return;
    }

    isRunning = true;
    updateUIState();

    const profileCaptions = [];
    const captionMode = shadow.getElementById("sb-caption-mode").value;
    const captionA = shadow.getElementById("sb-caption-a").value;
    const captionB = shadow.getElementById("sb-caption-b").value;
    const stepDelay = Math.max(300, parseInt(shadow.getElementById("sb-delay").value, 10) || 1500);
    const uploadDelay = Math.max(500, parseInt(shadow.getElementById("sb-upload-delay").value, 10) || 3000);
    const varDelay = Math.max(300, parseInt(shadow.getElementById("sb-var-delay").value, 10) || 1500);
    const uiDelay = Math.max(100, parseInt(shadow.getElementById("sb-ui-delay").value, 10) || 500);

    // ==================== PHASE 1 ====================
    // 1. Fill all profiles with caption and base image (slot 1)
    setStatus(`Phase 1: Filling captions and base images (0/${profiles.length})...`, "running");

    for (let i = 0; i < profiles.length; i++) {
      if (!isRunning) break;

      const profile = profiles[i];
      setStatus(`Phase 1: Processing profile ${i + 1}/${profiles.length}...`, "running");

      // Scroll profile tab into view and highlight it
      profile.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const originalOutline = profile.style.outline;
      const originalOutlineOffset = profile.style.outlineOffset;
      const originalTransition = profile.style.transition;

      profile.style.transition = "outline 0.2s ease-in-out";
      profile.style.outline = "3px solid #6366f1";
      profile.style.outlineOffset = "2px";

      // Click the profile to select it
      profile.click();

      // Check for the "Proceed" confirmation dialog/button
      await sleep(uiDelay); // Wait for modal to pop up
      const proceedBtn = document.querySelector("button.btn-primary-sb");
      if (proceedBtn) {
        console.log("Found Proceed button, clicking to confirm customization.");
        proceedBtn.click();
        await sleep(uiDelay); // Additional sleep to let modal close and editor swap
      }

      // Wait for SocialBee to swap editor context
      await sleep(stepDelay);

      if (!isRunning) {
        profile.style.outline = originalOutline;
        profile.style.outlineOffset = originalOutlineOffset;
        profile.style.transition = originalTransition;
        break;
      }

      // Fill the Caption text
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
        }

        profileCaptions[i] = chosenOption;
        setContentEditableText(editor, caption);
      } else {
        setStatus(`Editor not found on profile ${i + 1}!`, "error");
      }

      // Upload the Base Image (if selected)
      if (baseFiles.length > 0) {
        const firstImg = getRandomElement(baseFiles);

        setStatus(`Uploading base image for profile ${i + 1}: ${firstImg.name}...`, "running");
        const uploadTriggered = uploadImageToWebpage(firstImg);
        if (uploadTriggered) {
          // Extra buffer delay for the image upload processing
          await sleep(uploadDelay);
        } else {
          setStatus(`File uploader not found for profile ${i + 1}!`, "error");
          await sleep(uiDelay);
        }
      }

      setStatus(`Processed Phase 1 for ${i + 1}/${profiles.length} profiles`, "running");

      // Remove highlight
      profile.style.outline = originalOutline;
      profile.style.outlineOffset = originalOutlineOffset;
      profile.style.transition = originalTransition;

      // Small breathing room between profiles
      await sleep(uiDelay);
    }

    // 2. Click Add Variation until 4 variations are created (3 new variations)
    if (isRunning) {
      setStatus("Creating variations (up to 4)...", "running");
      for (let v = 0; v < 3; v++) {
        if (!isRunning) break;
        const addBtn = document.getElementById("addVariationButton");
        if (addBtn) {
          addBtn.click();
          await sleep(varDelay); // Wait for variation creation
        } else {
          console.log("Add Variation button not found!");
          break;
        }
      }
    }

    // ==================== PHASE 2 ====================
    // 3. Go back to first profile, remove image on Variation 4, upload image from slot 2
    if (isRunning && var4Files.length > 0) {
      setStatus(`Phase 2: Swapping images on Variation 4 (0/${profiles.length})...`, "running");

      for (let i = 0; i < profiles.length; i++) {
        if (!isRunning) break;

        const profile = profiles[i];
        setStatus(`Phase 2: Processing profile ${i + 1}/${profiles.length}...`, "running");

        // Scroll profile tab into view and highlight it
        profile.scrollIntoView({ block: "nearest", behavior: "smooth" });
        const originalOutline = profile.style.outline;
        const originalOutlineOffset = profile.style.outlineOffset;
        const originalTransition = profile.style.transition;

        profile.style.transition = "outline 0.2s ease-in-out";
        profile.style.outline = "3px solid #a855f7"; // Purple highlight for Phase 2
        profile.style.outlineOffset = "2px";

        // Click the profile to select it
        profile.click();

        // Check for the "Proceed" confirmation dialog/button
        await sleep(uiDelay);
        const proceedBtn = document.querySelector("button.btn-primary-sb");
        if (proceedBtn) {
          console.log("Found Proceed button, clicking to confirm customization.");
          proceedBtn.click();
          await sleep(uiDelay);
        }

        // Wait for SocialBee to swap editor context
        await sleep(stepDelay);

        if (!isRunning) {
          profile.style.outline = originalOutline;
          profile.style.outlineOffset = originalOutlineOffset;
          profile.style.transition = originalTransition;
          break;
        }

        const secondImg = getRandomElement(var4Files);

        // Select Variation 4
        selectVariation(4);
        await sleep(varDelay);

        // Swap Caption for Variation 4 (A to B, B to A)
        const editor = Array.from(document.querySelectorAll(".ql-editor")).find((el) => el.offsetWidth > 0 && el.offsetHeight > 0) || document.querySelector(".ql-editor");
        if (editor) {
          const originalOption = profileCaptions[i] || "A";
          const oppositeCaption = originalOption === "A" ? captionB : captionA;
          console.log(`Phase 2: Swapping caption for profile ${i + 1} to opposite option:`, originalOption === "A" ? "B" : "A");
          setContentEditableText(editor, oppositeCaption);
          await sleep(uiDelay);
        }

        // Find and click the visible remove image button
        const removeImageBtn = Array.from(document.querySelectorAll('button.close-icon, .close-icon, button[class*="close-icon"]')).find((btn) => btn.offsetWidth > 0);

        if (removeImageBtn) {
          console.log("Clicking remove image button on Variation 4:", removeImageBtn);
          removeImageBtn.click();
          await sleep(varDelay); // Wait for removal and slots to update

          // Upload the second image to Variation 4
          setStatus(`Phase 2: Uploading Var 4-6 image to Variation 4: ${secondImg.name}...`, "running");
          const secondUploadTriggered = uploadImageToWebpage(secondImg);
          if (secondUploadTriggered) {
            await sleep(uploadDelay); // Buffer delay for upload
          } else {
            setStatus(`File uploader not found for second image!`, "error");
            await sleep(uiDelay);
          }
        } else {
          console.log("Remove image button not found on Variation 4!");
        }

        setStatus(`Processed Phase 2 for ${i + 1}/${profiles.length} profiles`, "running");

        // Remove highlight
        profile.style.outline = originalOutline;
        profile.style.outlineOffset = originalOutlineOffset;
        profile.style.transition = originalTransition;

        // Small breathing room between profiles
        await sleep(uiDelay);
      }

      // 4. Click Add Variation 2 times on the last profile to create Variation 5 and 6 (which copy Variation 4)
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
    // Check circular progress text (e.g. 7/25)
    const progressVal = document.querySelector('jhi-circular-progress .custom-progress-value b, .custom-progress-value b');
    if (progressVal) {
      const match = progressVal.textContent.trim().match(/^(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    
    // Check paragraphs with text "You have connected X profiles"
    const paragraphs = Array.from(document.querySelectorAll('p'));
    for (const p of paragraphs) {
      const text = p.textContent || "";
      if (text.includes("You have connected")) {
        const strongs = p.querySelectorAll('strong');
        if (strongs.length > 0) {
          const match = strongs[0].textContent.trim().match(/^\d+/);
          if (match) return parseInt(match[0], 10);
        }
        
        // Fallback: match number from the paragraph text directly
        const match = text.match(/connected\s+(\d+)\s+profiles/i);
        if (match) return parseInt(match[1], 10);
      }
    }
    
    return null;
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
      while (isRunning) {
        // Dynamic exit condition: if we can read the profile count and it reaches 0, we are done!
        const currentCount = getConnectedProfilesCount();
        if (currentCount === 0) {
          console.log("[SocialBee Autofill] Dynamic profile count reached 0. Deletion complete!");
          break;
        }

        // Find all potential delete/trash elements
        const candidates = Array.from(document.querySelectorAll('button, a, i, span')).filter(el => {
          // Ignore if already attempted in this run to avoid infinite loop
          if (el.dataset.sbDeleteAttempted === "true" || el.closest('button, a')?.dataset.sbDeleteAttempted === "true") {
            return false;
          }

          const text = (el.textContent || "").trim().toLowerCase();
          const title = (el.getAttribute('title') || el.getAttribute('data-original-title') || "").toLowerCase();
          const className = (el.className || "").toLowerCase();
          
          const isTrashIcon = className.includes('trash');
          const isDeleteWord = text === 'delete' || text === 'remove' || text === 'disconnect' || text.includes('remove account') || text.includes('delete account');
          const isDeleteTitle = title.includes('delete') || title.includes('remove') || title.includes('disconnect') || title.includes('unlink');
          
          return (isTrashIcon || isDeleteWord || isDeleteTitle) && el.offsetWidth > 0;
        });

        if (candidates.length === 0) {
          console.log("[SocialBee Autofill] No more delete buttons found.");
          break;
        }

        // Get the first candidate
        const btn = candidates[0];
        let clickTarget = btn;
        
        // If it's an icon, find the closest clickable parent (button or a)
        if (btn.tagName === 'I' || btn.tagName === 'SPAN') {
          clickTarget = btn.closest('button, a') || btn;
        }

        // Mark as attempted before clicking
        clickTarget.dataset.sbDeleteAttempted = "true";

        console.log("[SocialBee Autofill] Clicking delete target:", clickTarget);
        
        // Update status with remaining count if possible
        const remaining = currentCount !== null ? currentCount : (initialCount !== null ? Math.max(0, initialCount - deletedCount) : null);
        const remMessage = remaining !== null ? ` (${remaining} remaining)` : "";
        setStatus(`Deleting account...${remMessage}`, "running");

        clickTarget.scrollIntoView({ block: "center", behavior: "smooth" });
        await sleep(500);
        clickTarget.click();

        // Wait 1000ms for the modal opening animation to complete
        await sleep(1000);

        // Wait for the confirmation modal button to appear
        let clickedConfirm = false;
        for (let attempt = 0; attempt < 15; attempt++) {
          const confirmBtn = Array.from(document.querySelectorAll('button')).find(button => {
            const txt = (button.textContent || "").trim().toLowerCase();
            const className = (button.className || "").toLowerCase();
            return txt.includes("yes, remove social account") || 
                   txt.includes("yes, remove") || 
                   txt === "remove" || 
                   className.includes("btn-primary-sb") && txt.includes("remove");
          });

          if (confirmBtn && confirmBtn.offsetWidth > 0) {
            console.log("[SocialBee Autofill] Found confirm button in modal. Clicking...");
            confirmBtn.click();
            clickedConfirm = true;
            deletedCount++;
            break;
          }
          await sleep(250);
        }

        if (!clickedConfirm) {
          console.warn("[SocialBee Autofill] Failed to find/click confirmation button for this item.");
          setStatus("Could not confirm deletion of account.", "error");
          break;
        }

        // Wait for the modal to fade out and account to be deleted completely (stepDelay + 1000ms buffer)
        await sleep(stepDelay + 1000);
      }

      setStatus(`Successfully removed ${deletedCount} account${deletedCount !== 1 ? 's' : ''}!`, "success");
    } catch (e) {
      console.error("[SocialBee Autofill] Error deleting accounts:", e);
      setStatus("Error during account deletion.", "error");
    } finally {
      isRunning = false;
      updateUIState();
    }
  }

  // 8. Event Binding & Draggable implementation
  btnStart.addEventListener("click", startAutomation);
  btnStop.addEventListener("click", stopAutomation);
  if (btnDeleteAll) btnDeleteAll.addEventListener("click", deleteAllAccounts);

  // Minimize / Maximize toggle
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("minimized");
    if (panel.classList.contains("minimized")) {
      toggleBtn.innerHTML = "🐝";
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

  // Draggable Functionality
  makeElementDraggable(panel, shadow.getElementById("sb-autofill-header"));

  function makeElementDraggable(element, dragHeader) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;
    dragHeader.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      const targetTag = e.target.tagName;
      if (targetTag === "BUTTON" || targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT" || e.target.id === "sb-dropzone") {
        return;
      }
      if (panel.classList.contains("minimized")) {
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

  // 9. Auto-Comment Option Check Loop
  function ensureChecked() {
    // Find all checkboxes for commenting (handles multiple if they exist)
    const checkboxes = document.querySelectorAll('input[name="usersCanComment"], input#usersCanComment');

    checkboxes.forEach((checkbox) => {
      if (!checkbox.checked) {
        console.log("[AutoComment] Checkbox found unchecked. Simulating interaction...");

        // Find corresponding label if any (Awesome Bootstrap Checkbox hides the input and uses label)
        let label = null;
        if (checkbox.id) {
          label = document.querySelector(`label[for="${checkbox.id}"]`);
        }
        if (!label) {
          label = checkbox.closest("label");
        }

        // Try clicking the label first to trigger natural browser/UI update
        if (label) {
          label.click();
        } else {
          checkbox.click();
        }

        // Fallback: If it's still not checked after a short delay (e.g. event prevented or reset),
        // force the checked property and dispatch events to update Angular/React bindings.
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

  // Run every 300ms to handle dynamic content loading and state resets
  setInterval(ensureChecked, 300);
})();
