# Automation Framework Development Rules

## 1. Versioning Rule
* **Always increment the script version** (`@version` in the Tampermonkey metadata header) and the UI panel version (e.g., `vX.Y` in the HTML markup) whenever any updates or modifications are made to the userscripts.
* Ensure both the metadata block version and the visual panel title version remain perfectly synchronized.

## 2. Git Commit & Push Rule
* **Do NOT execute git commit or git push commands** unless explicitly instructed/approved by the user. Keep all files as modified on the local file system without committing them until specifically told to do so.

## 3. General Agent Implementation Rules
* **Bypass CORS/CSP with `GM_xmlhttpRequest`**: When modifying userscripts that make calls to local backend services (such as the CSV/API server on `localhost:4782`), always use Tampermonkey's privileged `GM_xmlhttpRequest` instead of standard `fetch()` to prevent security sandbox blocks.
* **Resilient Element Selector Strategies**: Never rely on brittle, auto-generated, or highly specific class name paths. Utilize case-insensitive text searching, container-relative queries, and multi-selector fallback lists to locate buttons and fields.
* **Handling Dynamic SPAs with Sleep & Retries**: Always wrap DOM lookups and filling logic in loops/retries with asynchronous sleep/delays (e.g., 100ms-500ms intervals) to gracefully handle SPA page transitions, modal rendering, and late element mounting.
