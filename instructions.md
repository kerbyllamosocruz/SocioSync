# Automation Framework Development Rules

## 1. Versioning Rule
* **Always increment the script version** (`@version` in the Tampermonkey metadata header) and the UI panel version (e.g., `vX.Y` in the HTML markup) whenever any updates or modifications are made to the userscripts.
* Ensure both the metadata block version and the visual panel title version remain perfectly synchronized.

## 2. Git Commit & Push Rule
* **Do NOT execute git commit or git push commands** unless explicitly instructed/approved by the user. Keep all files as modified on the local file system without committing them until specifically told to do so.
