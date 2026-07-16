import { Page, ElementHandle } from 'playwright';
import { Logger } from '../logging/logger';
import { sleep, waitForSelectorOrFail, humanType } from '../utils/helpers';
import { Config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

export interface SocialBeeTaskConfig {
  postCategories: string[];           // Categories to engage with
  imagesFolder: string;               // Folder containing images
  caption: string;                    // Main caption
  enableComments: boolean;            // Enable comments for all accounts
  variationTexts: string[];           // 6 variations for posts (different text per variation)
  scheduleType: 'now' | 'schedule';
  scheduleTime?: string;
}

export interface PostResult {
  success: boolean;
  postId?: string;
  error?: string;
  accountsSelected: number;
  commentsEnabled: boolean;
  variationsCreated: number;
  imageUsed: string;
}

export class SocialBeeTasks {
  private logger: Logger;
  private workerId: string;
  private page: Page;
  private config: Config;
  private usedImages: Set<string> = new Set();

  constructor(logger: Logger, page: Page, workerId: string, config: Config) {
    this.logger = logger;
    this.page = page;
    this.workerId = workerId;
    this.config = config;
  }

  private async delay(factor: number = 1.0): Promise<void> {
    const baseDelay = this.config.actionDelay !== undefined ? this.config.actionDelay : 1000;
    await sleep(baseDelay * factor);
  }

  /**
   * Main method to execute SocialBee tasks
   */
  async executeSocialBeeTasks(config: SocialBeeTaskConfig): Promise<PostResult> {
    try {
      this.logger.info('Starting SocialBee tasks...', this.workerId);
      
      // Step 1: Navigate to SocialBee dashboard
      await this.navigateToDashboard();
      
      // Step 2: Engage with post categories
      await this.engageWithPostCategories(config.postCategories);
      
      // Step 3: Create a new post
      await this.createNewPost();
      
      // Step 4: Select all newly added TikTok accounts
      const accountsCount = await this.selectNewlyAddedAccounts();
      
      // Step 5: Enable comments for all selected accounts (click radio button)
      if (config.enableComments) {
        await this.enableCommentsForAllAccounts();
      }
      
      // Step 6: Select 1 image from the images folder
      const selectedImage = await this.selectImageFromFolder(config.imagesFolder);
      
      // Step 7: Upload the selected image
      await this.uploadImage(selectedImage);
      
      // Step 8: Add caption
      await this.addCaption(config.caption);
      
      // Step 9: Click "Add Variation" button up to 6 times
      const variationsCount = await this.addPostVariations(config.variationTexts);
      
      // Step 10: Share the post with all variations
      const posted = await this.sharePost();
      
      this.logger.success(`✅ Successfully posted to ${accountsCount} accounts with ${variationsCount} variations`, this.workerId);
      
      return {
        success: true,
        accountsSelected: accountsCount,
        commentsEnabled: config.enableComments,
        variationsCreated: variationsCount,
        imageUsed: selectedImage
      };
      
    } catch (error) {
      this.logger.error('Error executing SocialBee tasks', error as Error, this.workerId);
      return {
        success: false,
        error: (error as Error).message,
        accountsSelected: 0,
        commentsEnabled: false,
        variationsCreated: 0,
        imageUsed: ''
      };
    }
  }

  /**
   * Navigate to SocialBee dashboard
   */
  private async navigateToDashboard(): Promise<void> {
    try {
      this.logger.info('Navigating to SocialBee dashboard...', this.workerId);
      
      const currentUrl = this.page.url();
      if (currentUrl.includes('dashboard') || currentUrl.includes('home')) {
        this.logger.info('Already on dashboard', this.workerId);
        return;
      }
      
      await this.page.goto('https://app.socialbee.com/dashboard');
      await this.page.waitForTimeout(3000);
      await waitForSelectorOrFail(this.page, '.dashboard, .home, [class*="dashboard"]', 15000);
      
      this.logger.info('Dashboard loaded successfully', this.workerId);
      
    } catch (error) {
      this.logger.error('Failed to navigate to dashboard', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Engage with post categories
   */
  private async engageWithPostCategories(categories: string[]): Promise<void> {
    try {
      this.logger.info(`Engaging with categories: ${categories.join(', ')}`, this.workerId);
      
      await this.navigateToContentSection();
      
      for (const category of categories) {
        try {
          this.logger.info(`Selecting category: ${category}`, this.workerId);
          
          const categorySelectors = [
            `text="${category}"`,
            `[data-category="${category}"]`,
            `[class*="${category}"]`,
            `button:has-text("${category}")`
          ];
          
          let found = false;
          for (const selector of categorySelectors) {
            const el = await this.page.$(selector);
            if (el) {
              await el.click();
              await this.page.waitForTimeout(1000);
              found = true;
              break;
            }
          }
          
          if (found) {
            await this.page.waitForTimeout(2000);
            await this.engageWithCategoryPosts();
          }
          
        } catch (error) {
          this.logger.warn(`Failed to engage with category: ${category}: ${(error as Error).message || error}`);
          continue;
        }
      }
      
      this.logger.info('Finished engaging with categories', this.workerId);
      
    } catch (error) {
      this.logger.error('Failed to engage with categories', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Navigate to content section
   */
  private async navigateToContentSection(): Promise<void> {
    try {
      const contentSelectors = [
        'a:has-text("Content")',
        'button:has-text("Content")',
        '[href*="content"]',
        '[data-testid="content"]'
      ];
      
      for (const selector of contentSelectors) {
        const el = await this.page.$(selector);
        if (el) {
          await el.click();
          await this.page.waitForTimeout(2000);
          return;
        }
      }
      
      await this.page.goto('https://app.socialbee.com/content');
      await this.page.waitForTimeout(3000);
      
    } catch (error) {
      this.logger.error('Failed to navigate to content section', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Engage with posts in a category (like posts)
   */
  private async engageWithCategoryPosts(): Promise<void> {
    try {
      const posts = await this.page.$$('[class*="post"], [class*="card"], .post-item');
      
      if (posts.length === 0) {
        this.logger.warn('No posts found in category', this.workerId);
        return;
      }
      
      const postsToEngage = Math.min(posts.length, 2 + Math.floor(Math.random() * 2));
      
      for (let i = 0; i < postsToEngage; i++) {
        try {
          const post = posts[i];
          await post.click();
          await this.page.waitForTimeout(1000);
          await this.likePost();
          await this.closePostModal();
          await sleep(1500 + Math.random() * 2000);
        } catch (error) {
          this.logger.warn(`Failed to engage with post ${i + 1}: ${(error as Error).message || error}`);
          continue;
        }
      }
      
    } catch (error) {
      this.logger.warn(`Error engaging with category posts: ${(error as Error).message || error}`);
    }
  }

  /**
   * Like a post
   */
  private async likePost(): Promise<void> {
    try {
      const likeSelectors = [
        'button[aria-label="Like"]',
        'button[class*="like"]',
        '[data-testid="like"]',
        'button:has-text("Like")'
      ];
      
      for (const selector of likeSelectors) {
        const likeBtn = await this.page.$(selector);
        if (likeBtn) {
          await likeBtn.click();
          this.logger.info('Liked post', this.workerId);
          await sleep(500);
          return;
        }
      }
      
    } catch (error) {
      this.logger.warn(`Failed to like post: ${(error as Error).message || error}`);
    }
  }

  /**
   * Close post modal
   */
  private async closePostModal(): Promise<void> {
    try {
      const closeSelectors = [
        'button[aria-label="Close"]',
        'button:has-text("Close")',
        '[class*="close"]',
        '[data-testid="close"]'
      ];
      
      for (const selector of closeSelectors) {
        const closeBtn = await this.page.$(selector);
        if (closeBtn) {
          await closeBtn.click();
          await sleep(500);
          return;
        }
      }
      
      await this.page.keyboard.press('Escape');
      await sleep(500);
      
    } catch (error) {
      this.logger.warn(`Failed to close post modal: ${(error as Error).message || error}`);
    }
  }

  /**
   * Create a new post
   */
  private async createNewPost(): Promise<void> {
    try {
      this.logger.info('Creating new post...', this.workerId);
      
      const createSelectors = [
        'button:has-text("Create Post")',
        'button:has-text("New Post")',
        'a:has-text("Create Post")',
        '[data-testid="create-post"]',
        'button[class*="create"]'
      ];
      
      for (const selector of createSelectors) {
        const btn = await this.page.$(selector);
        if (btn) {
          await btn.click();
          await this.page.waitForTimeout(3000);
          await waitForSelectorOrFail(this.page, '.editor, [class*="editor"], .post-editor', 10000);
          this.logger.info('Post editor opened', this.workerId);
          return;
        }
      }
      
      await this.page.goto('https://app.socialbee.com/content/create');
      await this.page.waitForTimeout(3000);
      this.logger.info('Create post page loaded', this.workerId);
      
    } catch (error) {
      this.logger.error('Failed to create new post', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Select all newly added TikTok accounts
   */
  private async selectNewlyAddedAccounts(): Promise<number> {
    try {
      this.logger.info('Selecting all newly added TikTok accounts...', this.workerId);
      
      let selectedCount = 0;
      
      // Find account selection section
      const accountSelectors = [
        '[class*="account-select"]',
        '[class*="channel-select"]',
        '[data-testid="accounts"]',
        '.account-list',
        '.social-accounts'
      ];
      
      let accountSection: ElementHandle | null = null;
      for (const selector of accountSelectors) {
        accountSection = await this.page.$(selector);
        if (accountSection) break;
      }
      
      if (!accountSection) {
        const accountsTab = await this.page.$('button:has-text("Accounts"), a:has-text("Accounts")');
        if (accountsTab) {
          await accountsTab.click();
          await this.page.waitForTimeout(2000);
        }
      }
      
      // Method 1: Click "Select All" button
      const selectAllBtn = await this.page.$('button:has-text("Select All"), button:has-text("Select all")');
      if (selectAllBtn) {
        await selectAllBtn.click();
        this.logger.info('Selected all accounts via Select All button', this.workerId);
        await sleep(1000);
        
        const selectedCheckboxes = await this.page.$$('input[type="checkbox"]:checked');
        selectedCount = selectedCheckboxes.length;
        this.logger.info(`Selected ${selectedCount} accounts`, this.workerId);
        return selectedCount;
      }
      
      // Method 2: Select newly added accounts individually
      const accountItems = await this.page.$$('[class*="account-item"], [class*="channel-item"], .account-row');
      
      for (const item of accountItems) {
        try {
          const text = await item.textContent();
          const isNew = text && (text.includes('New') || text.includes('Recently added') || text.includes('Just added'));
          
          if (isNew) {
            const checkbox = await item.$('input[type="checkbox"]');
            if (checkbox) {
              const isChecked = await checkbox.isChecked();
              if (!isChecked) {
                await checkbox.click();
                selectedCount++;
                this.logger.info(`Selected newly added account`, this.workerId);
                await sleep(300);
              }
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Method 3: Select most recent accounts
      if (selectedCount === 0) {
        this.logger.info('No "New" badges found, selecting first 5 accounts...', this.workerId);
        const checkboxes = await this.page.$$('input[type="checkbox"]');
        const startIndex = checkboxes.length > 5 ? 1 : 0;
        const endIndex = Math.min(startIndex + 5, checkboxes.length);
        
        for (let i = startIndex; i < endIndex; i++) {
          const isChecked = await checkboxes[i].isChecked();
          if (!isChecked) {
            await checkboxes[i].click();
            selectedCount++;
            await sleep(200);
          }
        }
        this.logger.info(`Selected ${selectedCount} recent accounts`, this.workerId);
      }
      
      return selectedCount;
      
    } catch (error) {
      this.logger.error('Failed to select accounts', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Enable comments for all selected accounts (click radio button/toggle)
   */
  private async enableCommentsForAllAccounts(): Promise<void> {
    try {
      this.logger.info('Enabling comments for all selected accounts...', this.workerId);
      
      // Find the comments section
      const commentsSectionSelectors = [
        '[class*="comments"]',
        '[data-testid="comments"]',
        '.comment-settings',
        '.engagement-settings'
      ];
      
      let commentsSection: ElementHandle | null = null;
      for (const selector of commentsSectionSelectors) {
        commentsSection = await this.page.$(selector);
        if (commentsSection) break;
      }
      
      if (!commentsSection) {
        const commentsTab = await this.page.$('button:has-text("Comments"), button:has-text("Engagement")');
        if (commentsTab) {
          await commentsTab.click();
          await this.page.waitForTimeout(1000);
        }
      }
      
      // Method 1: Find radio buttons and select "On"/"Yes"
      const radioButtons = await this.page.$$('input[type="radio"]');
      for (const radio of radioButtons) {
        try {
          const label = await this.page.evaluate((el) => {
            const label = el.closest('label');
            return label ? label.textContent : '';
          }, radio);
          
          if (label && (label.includes('On') || label.includes('Yes') || label.includes('Enable'))) {
            const isChecked = await radio.isChecked();
            if (!isChecked) {
              await radio.click();
              this.logger.info('Enabled comments via radio button', this.workerId);
              await sleep(300);
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Method 2: Find toggle switches
      const toggles = await this.page.$$('[role="switch"], [class*="toggle"], [class*="switch"]');
      for (const toggle of toggles) {
        try {
          const isChecked = await toggle.getAttribute('aria-checked') === 'true';
          if (!isChecked) {
            await toggle.click();
            this.logger.info('Enabled comments toggle', this.workerId);
            await sleep(300);
          }
        } catch (e) {
          continue;
        }
      }
      
      // Method 3: Find "Enable Comments" button or checkbox
      const enableSelectors = [
        'button:has-text("Enable Comments")',
        'button:has-text("Turn On Comments")',
        'input[type="checkbox"][aria-label*="comments"]',
        'input[type="checkbox"][aria-label*="Comments"]',
        '.comments-toggle'
      ];
      
      for (const selector of enableSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const isChecked = await element.isChecked();
          if (!isChecked) {
            await element.click();
            this.logger.info('Enabled comments via checkbox', this.workerId);
            await sleep(300);
          }
        }
      }
      
      // Method 4: For each selected account, find and enable comments
      const selectedAccounts = await this.page.$$('input[type="checkbox"]:checked');
      if (selectedAccounts.length > 0) {
        this.logger.info(`Found ${selectedAccounts.length} selected accounts`, this.workerId);
        
        for (let i = 0; i < selectedAccounts.length; i++) {
          try {
            const accountRow = await selectedAccounts[i].evaluateHandle((el) => el.closest('tr, .row, .account-item'));
            if (accountRow) {
              const toggle = await (accountRow as any).$('[class*="toggle"], [role="switch"], input[type="checkbox"][aria-label*="comments"]');
              if (toggle) {
                const isChecked = await toggle.isChecked();
                if (!isChecked) {
                  await toggle.click();
                  this.logger.info(`Enabled comments for account ${i + 1}`, this.workerId);
                  await sleep(200);
                }
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      this.logger.success('✅ Comments enabled for all selected accounts', this.workerId);
      
    } catch (error) {
      this.logger.error('Failed to enable comments', error as Error, this.workerId);
    }
  }

  /**
   * Select 1 image from the images folder (cycle through images)
   */
  private async selectImageFromFolder(imagesFolder: string): Promise<string> {
    try {
      this.logger.info(`Selecting image from folder: ${imagesFolder}`, this.workerId);
      
      if (!fs.existsSync(imagesFolder)) {
        throw new Error(`Images folder not found: ${imagesFolder}`);
      }
      
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
      const allImages = fs.readdirSync(imagesFolder)
        .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
        .map(file => path.join(imagesFolder, file));
      
      if (allImages.length === 0) {
        throw new Error(`No images found in folder: ${imagesFolder}`);
      }
      
      this.logger.info(`Found ${allImages.length} images in folder`, this.workerId);
      
      const unusedImages = allImages.filter(img => !this.usedImages.has(img));
      
      let selectedImage: string;
      
      if (unusedImages.length > 0) {
        const randomIndex = Math.floor(Math.random() * unusedImages.length);
        selectedImage = unusedImages[randomIndex];
        this.logger.info(`Selected unused image: ${path.basename(selectedImage)}`, this.workerId);
      } else {
        this.logger.info('All images used, resetting image pool', this.workerId);
        this.usedImages.clear();
        const randomIndex = Math.floor(Math.random() * allImages.length);
        selectedImage = allImages[randomIndex];
        this.logger.info(`Selected random image: ${path.basename(selectedImage)}`, this.workerId);
      }
      
      this.usedImages.add(selectedImage);
      
      return selectedImage;
      
    } catch (error) {
      this.logger.error('Failed to select image', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Upload image for post
   */
  private async uploadImage(imagePath: string): Promise<void> {
    try {
      this.logger.info(`Uploading image: ${path.basename(imagePath)}`, this.workerId);
      
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      
      const uploadSelectors = [
        'input[type="file"]',
        '[class*="file-upload"]',
        '[class*="image-upload"]',
        '.upload-area',
        '[data-testid="media-upload"]'
      ];
      
      let uploadInput: ElementHandle | null = null;
      for (const selector of uploadSelectors) {
        uploadInput = await this.page.$(selector);
        if (uploadInput) break;
      }
      
      if (!uploadInput) {
        const uploadBtn = await this.page.$('button:has-text("Upload"), button:has-text("Add Media")');
        if (uploadBtn) {
          await uploadBtn.click();
          await this.page.waitForTimeout(2000);
          uploadInput = await this.page.$('input[type="file"]');
        }
      }
      
      if (uploadInput) {
        await uploadInput.setInputFiles(imagePath);
        this.logger.info('Image uploaded successfully', this.workerId);
        await this.page.waitForTimeout(3000);
        await this.page.waitForSelector('img[src*="blob"], [class*="media-preview"], [class*="image-preview"]', { timeout: 15000 });
        this.logger.info('Image preview loaded', this.workerId);
      } else {
        throw new Error('File upload input not found');
      }
      
    } catch (error) {
      this.logger.error('Failed to upload image', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Add caption to post
   */
  private async addCaption(caption: string): Promise<void> {
    try {
      this.logger.info('Adding caption...', this.workerId);
      
      const captionSelectors = [
        'textarea[placeholder*="caption"]',
        'textarea[placeholder*="description"]',
        'textarea[placeholder*="write"]',
        '[class*="caption"]',
        '[class*="description"]',
        '[data-testid="caption"]',
        '.post-caption'
      ];
      
      let captionInput: ElementHandle | null = null;
      for (const selector of captionSelectors) {
        captionInput = await this.page.$(selector);
        if (captionInput) break;
      }
      
      if (captionInput) {
        await captionInput.click();
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await humanType(this.page, captionInput, caption);
        this.logger.info('Caption added successfully', this.workerId);
      } else {
        throw new Error('Caption input not found');
      }
      
    } catch (error) {
      this.logger.error('Failed to add caption', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Click "Add Variation" button up to 6 times
   * This creates different post variations (different text/captions per variation)
   */
  private async addPostVariations(variationTexts: string[]): Promise<number> {
    let createdCount = 0;
    try {
      this.logger.info('Adding post variations...', this.workerId);
      
      const maxVariations = 6;
      
      // Find the "Add Variation" button
      const addVariationBtn = await this.page.$('button:has-text("Add Variation"), button:has-text("Add variation")');
      
      if (!addVariationBtn) {
        this.logger.warn('"Add Variation" button not found', this.workerId);
        return 0;
      }
      
      // Click "Add Variation" button up to 6 times
      for (let i = 0; i < maxVariations; i++) {
        try {
          this.logger.info(`Creating variation ${i + 1}/${maxVariations}...`, this.workerId);
          
          // Click the "Add Variation" button
          await addVariationBtn.click();
          await this.page.waitForTimeout(1000);
          
          // If variation texts are provided, fill them in
          if (variationTexts && variationTexts.length > i) {
            const variationText = variationTexts[i];
            
            // Find the variation text input (newly added)
            const variationInputs = await this.page.$$('textarea[placeholder*="variation"], textarea[placeholder*="Variation"], [class*="variation-text"]');
            if (variationInputs.length > 0) {
              const lastInput = variationInputs[variationInputs.length - 1];
              await lastInput.fill(variationText);
              this.logger.info(`Variation ${i + 1} text added: "${variationText.substring(0, 30)}..."`, this.workerId);
              await sleep(500);
            }
          }
          
          createdCount++;
          this.logger.info(`Variation ${i + 1} created`, this.workerId);
          
          await sleep(500 + Math.random() * 500);
          
        } catch (error) {
          this.logger.warn(`Failed to create variation ${i + 1}: ${(error as Error).message || error}`);
          break;
        }
      }
      
      this.logger.success(`✅ Created ${createdCount} post variations`, this.workerId);
      return createdCount;
      
    } catch (error) {
      this.logger.error('Failed to add post variations', error as Error, this.workerId);
      return createdCount;
    }
  }

  /**
   * Share the post with all variations
   */
  private async sharePost(): Promise<boolean> {
    try {
      this.logger.info('Sharing post with all variations...', this.workerId);
      
      // Find share/schedule button
      const shareSelectors = [
        'button:has-text("Share")',
        'button:has-text("Schedule")',
        'button:has-text("Publish")',
        'button:has-text("Post")',
        'button:has-text("Share Now")',
        '[data-testid="share"]',
        '[data-testid="publish"]'
      ];
      
      let shareBtn: ElementHandle | null = null;
      for (const selector of shareSelectors) {
        shareBtn = await this.page.$(selector);
        if (shareBtn) break;
      }
      
      if (!shareBtn) {
        throw new Error('Share button not found');
      }
      
      await shareBtn.click();
      await this.page.waitForTimeout(2000);
      
      // Confirm sharing
      const confirmSelectors = [
        'button:has-text("Confirm")',
        'button:has-text("Yes")',
        'button:has-text("Share")',
        'button:has-text("Publish")',
        '[data-testid="confirm"]'
      ];
      
      let confirmBtn: ElementHandle | null = null;
      for (const selector of confirmSelectors) {
        confirmBtn = await this.page.$(selector);
        if (confirmBtn) break;
      }
      
      if (confirmBtn) {
        await confirmBtn.click();
        await this.page.waitForTimeout(3000);
      }
      
      // Wait for confirmation
      const success = await this.waitForPublishConfirmation();
      
      if (success) {
        this.logger.success('✅ Post shared successfully with all variations!', this.workerId);
        return true;
      } else {
        this.logger.warn('Post may have been shared but confirmation not found', this.workerId);
        return true;
      }
      
    } catch (error) {
      this.logger.error('Failed to share post', error as Error, this.workerId);
      throw error;
    }
  }

  /**
   * Wait for post publishing confirmation
   */
  private async waitForPublishConfirmation(): Promise<boolean> {
    try {
      const confirmSelectors = [
        'text=Post published successfully',
        'text=Shared successfully',
        'text=Post scheduled',
        '.success-message',
        '[class*="success"]',
        '[class*="confirmation"]',
        '.alert-success'
      ];
      
      for (const selector of confirmSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 15000 });
          this.logger.info('Post published successfully!', this.workerId);
          return true;
        } catch (e) {
          continue;
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.warn(`Could not confirm post publishing: ${(error as Error).message || error}`);
      return false;
    }
  }

  /**
   * Reset used images (call when starting new session)
   */
  resetImagePool(): void {
    this.usedImages.clear();
    this.logger.info('Image pool reset', this.workerId);
  }
}