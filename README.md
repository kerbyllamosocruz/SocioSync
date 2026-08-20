# SocioSync v5.0

A Userscript for Tampermonkey and Violentmonkey designed to streamline social media account management, automated account deletion, and cross-tab OTP verification across TikTok, SocialBee, Vista Social, and kuku.lu / m.kuku.lu.

---

## Key Features

### 1. Cross-Tab OTP & Login Automation (TikTok)
- **Human-like Credential Autofill**: Simulates realistic typing delays (15ms per character) for usernames and passwords on TikTok login pages.
- **Cross-Tab Temporary Email Sync**: Automatically listens for OTP verification codes sent to `m.kuku.lu` / `kuku.lu` temporary mailboxes and inputs them into TikTok's 6-digit OTP fields.
- **Auto-Submit & Reconnect Flow**: Triggers submission after OTP entry and auto-clicks authorization/reconnect buttons.

### 2. Automatic Error Detection & Account Status Tracking
- **Smart Credential Validation**: Monitors TikTok login response messages for known failure states:
  - *"Account doesn't exist"*
  - *"Username or password doesn't match our records"*
  - *"Incorrect account or password. 5 attempts remaining"*
- **Automatic Status Tagging**: Automatically updates local account records to `Wrong` when login fails, preventing redundant attempts.
- **Filtered Account List**: Ignores accounts marked as `Done`, `Banned`, or `Wrong` when cycling through the CSV account queue.

### 3. Automated Batch Account Deletion (SocialBee & Vista Social)
- **Heuristic UI Scanner**: Locates profile row action menus (3-dot icons) and context dropdowns dynamically.
- **Synthetic Event Dispatcher**: Simulates full pointer and mouse event chains (`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`) to reliably interact with React-based UIs.
- **Automated Modal Confirmation**: Confirms "Remove profile" modal dialogs automatically in batch operations.

### 4. Frictionless Session & Cookie Export/Import
- **One-Click Session Backup**: Captures HttpOnly authentication tokens (e.g., `connect.sid`, `jwt`) for supported domains.
- **Domain-Scoped Security**: Restricts cookie operations specifically to `m.kuku.lu` and target platforms to ensure session safety.

---

## Quick Start & Installation

### Prerequisites
1. Install a Userscript Manager browser extension:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended) or [Violentmonkey](https://violentmonkey.github.io/).

### Installation
1. Open your Userscript extension dashboard.
2. Create a new script and paste the full contents of [`SocioSync.js`](./SocioSync.js).
3. Save the script and ensure it is enabled.

---

## CSV File Format

You can load account lists into the suite using the **TikTok & OTP** tab. CSV data is stored securely in local storage via `GM_setValue`.

### Format Example
```csv
email,password,status
user1@m.kuku.lu,Pass123!,,
user2@m.kuku.lu,Pass456!,Done
user3@m.kuku.lu,Pass789!,Banned
user4@m.kuku.lu,WrongPass!,Wrong
```

### Supported Status Identifiers
- **Blank / Unset**: Active account ready for automation.
- **`Done`**: Account successfully processed or logged in.
- **`Banned`**: Account suspended or flagged; automatically skipped.
- **`Wrong`**: Invalid credentials or non-existent account; automatically skipped.

---

## Architecture & Technical Design

- **Shadow DOM Encapsulation**: Renders the complete suite UI inside `#sb-suite-root` shadow root to prevent CSS style leaks or DOM conflicts with target websites.
- **Pure Local Persistence**: Operates entirely offline without needing an external local server by using native GM storage APIs (`GM_getValue`, `GM_setValue`, `GM_addValueChangeListener`).
- **Resilient Event Dispatching**: Bypasses synthetic event blockers using low-level `PointerEvent` and `MouseEvent` dispatch routines.

---

## File Structure

```
automation/
├── SocioSync.js     # Main Userscript file containing all modules & UI
├── bulk.csv         # Sample CSV file for account batch uploads
├── .gitignore       # Git ignore rules for bulk data and temporary files
└── README.md        # Documentation
```
