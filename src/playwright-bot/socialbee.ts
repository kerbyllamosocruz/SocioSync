import { Page } from 'playwright';
import { Logger } from '../logging/logger';
import { sleep } from '../utils/helpers';
import * as fs from 'fs';
import * as path from 'path';

export class SocialBeeHandler {
  private page: Page;
  private logger: Logger;
  private workerId: string;

  constructor(page: Page, logger: Logger, workerId: string) {
    this.page = page;
    this.logger = logger;
    this.workerId = workerId;
  }

  /**
   * Clears existing media inside the post editor if present
   */
  async clearExistingMedia(): Promise<void> {
    try {
      const deleteMediaBtn = await this.page.$('.media-remove-btn, [class*="remove-media"], [class*="delete-media"], button:has-text("Remove"), .remove-image, [class*="media-item"] [class*="close"]');
      if (deleteMediaBtn) {
        this.logger.info('Clearing existing media in editor...', this.workerId);
        await deleteMediaBtn.click();
        await sleep(1000);
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Clicks the "Add Variation" button up to 5 times
   */
  async addVariations(count: number = 5): Promise<void> {
    this.logger.info(`Adding ${count} post variations...`, this.workerId);
    for (let i = 0; i < count; i++) {
      try {
        const addVarBtn = await this.page.$('button:has-text("Add Variation"), button:has-text("Add variation"), [class*="add-variation"], .btn-add-variation');
        if (addVarBtn) {
          await addVarBtn.click();
          await sleep(1000);
        } else {
          this.logger.warn('Could not find Add Variation button.', this.workerId);
          break;
        }
      } catch (e) {
        this.logger.error(`Error adding variation ${i + 1}`, e as Error, this.workerId);
        break;
      }
    }
  }

  /**
   * Navigates to a specific variation tab (1-based index)
   */
  async selectVariationTab(index: number): Promise<boolean> {
    try {
      const tabs = await this.page.$$('a[class*="variation"], button[class*="variation"], [class*="variation-tab"], [class*="tab-item"]');
      const filteredTabs = [];
      for (const tab of tabs) {
        const text = await tab.textContent();
        const isProfile = await tab.evaluate(el => el.closest('.editor-selected-accounts, .selected-profile') !== null);
        if (text && !isProfile) {
          filteredTabs.push(tab);
        }
      }

      if (index >= 1 && index <= filteredTabs.length) {
        await filteredTabs[index - 1].click();
        await sleep(1000);
        return true;
      }
    } catch (e) {
      this.logger.error(`Failed to select variation tab ${index}`, e as Error, this.workerId);
    }
    return false;
  }

  /**
   * Sets the caption inside the rich editor (ql-editor)
   */
  async setCaption(text: string): Promise<void> {
    const editor = await this.page.$('.ql-editor');
    if (!editor) {
      throw new Error('Rich text editor (.ql-editor) not found.');
    }
    
    this.logger.info(`Entering caption text: ${text.substring(0, 40)}...`, this.workerId);
    await editor.focus();
    
    // Clear and input text
    await editor.evaluate((el: any) => {
      el.innerHTML = '';
    });
    await this.page.keyboard.type(text);
    await sleep(500);
  }

  /**
   * Uploads an image by locating the correct file input or dropping the file
   */
  async uploadImage(imagePath: string): Promise<boolean> {
    if (!fs.existsSync(imagePath)) {
      this.logger.error(`Image path does not exist: ${imagePath}`, undefined, this.workerId);
      return false;
    }

    this.logger.info(`Uploading image: ${path.basename(imagePath)}`, this.workerId);

    try {
      const uploadBtn = await this.page.$('button.upload-btn, .upload-btn, [class*="upload-btn"], [data-testid="media-upload"]');
      let fileInput = null;

      if (uploadBtn) {
        fileInput = await this.page.evaluateHandle((btn: any) => {
          let current = btn;
          for (let depth = 0; depth < 4; depth++) {
            if (!current || current === document.body) break;
            const input = current.querySelector('input[type="file"]');
            if (input) return input;
            current = current.parentElement;
          }
          return null;
        }, uploadBtn);
      }

      if (!fileInput || (await fileInput.jsonValue()) === null) {
        // Fallback: search all file inputs that are not profile-related
        const inputs = await this.page.$$('input[type="file"]');
        for (const input of inputs) {
          const isProfile = await input.evaluate((el: any) => {
            const str = (el.id + ' ' + el.className + ' ' + el.name).toLowerCase();
            return str.includes('profile') || str.includes('avatar') || el.closest('[class*="profile"], [id*="profile"], [class*="avatar"]') !== null;
          });
          if (!isProfile) {
            fileInput = input;
            break;
          }
        }
      }

      if (fileInput && (await fileInput.jsonValue()) !== null) {
        const element = fileInput.asElement();
        if (element) {
          await element.setInputFiles(imagePath);
          await sleep(3000); // Wait for upload task to process
          this.logger.success('Successfully set file input files.', this.workerId);
          return true;
        }
      }
    } catch (e) {
      this.logger.error('Failed to set file input directly', e as Error, this.workerId);
    }

    return false;
  }
}
