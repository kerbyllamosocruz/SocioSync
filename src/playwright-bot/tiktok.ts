import { Page } from 'playwright';
import { Logger } from '../logging/logger';
import { sleep } from '../utils/helpers';
import axios from 'axios';

export class TikTokHandler {
  private page: Page;
  private logger: Logger;
  private workerId: string;

  constructor(page: Page, logger: Logger, workerId: string) {
    this.page = page;
    this.logger = logger;
    this.workerId = workerId;
  }

  /**
   * Simulates a human character typing sequence with randomized delays
   */
  async humanType(selector: string, text: string): Promise<void> {
    const element = await this.page.$(selector);
    if (!element) return;

    this.logger.info(`Typing text into ${selector} with human delays...`, this.workerId);
    await element.focus();

    // Clear element first
    await element.evaluate((el: any) => {
      el.value = '';
      try {
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue('');
      } catch (err) {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await this.page.keyboard.type(char);
      // Random delay between 40ms and 120ms matching our humanType logic
      const delay = Math.floor(Math.random() * 80) + 40;
      await sleep(delay);
    }

    // Fire end change events
    await element.evaluate((el: any) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
  }

  /**
   * Checks for verification method selection popup and selects the Email option
   */
  async handleVerificationOption(): Promise<boolean> {
    const clicked = await this.page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.pc-home-item-IxNc0F, [class*="pc-home-item-"], [class*="verification-option"]'))
        .filter((el: any) => el.offsetWidth > 0);

      if (items.length === 0) return false;

      for (const el of items) {
        const text = el.textContent || '';
        const hasEmail = text.includes('Email') && (text.includes('@') || /[a-zA-Z0-9.*_%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text));

        if (hasEmail) {
          const clickTarget = (el.closest('.pc-home-item-IxNc0F, [class*="pc-home-item-"]') || el) as HTMLElement;
          clickTarget.click();

          // Also click inner elements just in case
          const subElements = clickTarget.querySelectorAll('div, svg, path, span');
          subElements.forEach((child: any) => {
            try { child.click(); } catch (e) {}
          });
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      this.logger.success('Selected Email verification option.', this.workerId);
      await sleep(2000);
    }
    return clicked;
  }

  /**
   * Resolves the TikTok sliding captcha using EulerStream API
   */
  async solveCaptcha(apiKey: string, apiEndpoint: string = 'https://tiktok.eulerstream.com'): Promise<boolean> {
    const captchaContainer = await this.page.$('#captcha-verify-container-main-page, [id*="captcha-verify-container"], [class*="captcha-verify-container"]');
    if (!captchaContainer) {
      return false;
    }

    this.logger.info('TikTok CAPTCHA slider detected. Initiating solve sequence...', this.workerId);

    const images = await this.page.$$('[id*="captcha-verify-container"] img, #captcha-verify-container-main-page img, [class*="captcha-verify-container"] img');
    if (images.length < 2) {
      this.logger.warn('Could not find CAPTCHA images.', this.workerId);
      return false;
    }

    let slideImg = null;
    let bgImg = null;

    for (const img of images) {
      const isAbsolute = await img.evaluate((el: any) => {
        const style = window.getComputedStyle(el);
        return el.classList.contains('cap-absolute') || style.position === 'absolute' || el.className.includes('slide');
      });
      if (isAbsolute) {
        slideImg = img;
      } else {
        bgImg = img;
      }
    }

    if (!slideImg || !bgImg) {
      this.logger.warn('Could not distinguish slide piece and background images.', this.workerId);
      return false;
    }

    const bgSrc = await bgImg.getAttribute('src');
    const slideSrc = await slideImg.getAttribute('src');

    if (!bgSrc || !slideSrc || !bgSrc.startsWith('data:') || !slideSrc.startsWith('data:')) {
      this.logger.warn('CAPTCHA image sources are invalid.', this.workerId);
      return false;
    }

    const dragHandle = await this.page.$('.secsdk-captcha-drag-icon, [class*="secsdk-captcha-drag-icon"], [class*="captcha_verify_slide--slide"], [class*="captcha_slider"], .cap-absolute.cap-w-\\[56px\\] button, .secsdk_captcha_slider_button, #captcha_slider');
    if (!dragHandle) {
      this.logger.warn('Could not find slider drag handle.', this.workerId);
      return false;
    }

    const cleanBg = bgSrc.replace(/^data:image\/[a-z]+;base64,/, '');
    const cleanSlide = slideSrc.replace(/^data:image\/[a-z]+;base64,/, '');

    this.logger.info('Submitting CAPTCHA puzzle solve request to EulerStream API...', this.workerId);

    const response = await axios.post(`${apiEndpoint.replace(/\/$/, '')}/api/v1/puzzle?licenseKey=${apiKey}`, {
      api_key: apiKey,
      puzzle_image_base64: cleanBg,
      piece_image_base64: cleanSlide
    }, { timeout: 15000 });

    const sizes = await bgImg.evaluate((el: HTMLImageElement) => {
      return {
        naturalWidth: el.naturalWidth || 340,
        clientWidth: el.clientWidth || 340
      };
    });

    let slideX = response.data?.slide_x || response.data?.x;
    if (slideX === undefined && response.data?.slideXProportion !== undefined) {
      slideX = Math.round(response.data.slideXProportion * sizes.naturalWidth);
    }

    if (slideX === undefined) {
      this.logger.error(`Failed to solve CAPTCHA: ${JSON.stringify(response.data)}`, undefined, this.workerId);
      return false;
    }

    this.logger.success(`EulerStream solved CAPTCHA. Target natural x: ${slideX}`, this.workerId);

    const scale = sizes.clientWidth / sizes.naturalWidth;
    const dragDistance = Math.round(slideX * scale);

    const boundingBox = await dragHandle.boundingBox();
    if (!boundingBox) {
      this.logger.warn('Could not get bounding box for drag handle.', this.workerId);
      return false;
    }

    const startX = boundingBox.x + boundingBox.width / 2;
    const startY = boundingBox.y + boundingBox.height / 2;

    this.logger.info(`Simulating human ease drag from ${startX} to ${startX + dragDistance}...`, this.workerId);

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();

    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const easeProgress = progress * (2 - progress); // easeOutQuad physics
      const currentX = startX + dragDistance * easeProgress;
      const currentY = startY + (Math.random() * 2 - 1);
      await this.page.mouse.move(currentX, currentY);
      await sleep(15 + Math.random() * 10);
    }

    await sleep(100);
    await this.page.mouse.up();
    this.logger.success('CAPTCHA drag completed.', this.workerId);
    await sleep(3000);
    return true;
  }

  /**
   * Enters the OTP verification code into the digit inputs
   */
  async fillOTP(otpCode: string): Promise<boolean> {
    this.logger.info(`Filling OTP code: ${otpCode}`, this.workerId);

    const filled = await this.page.evaluate(({ otpCode }) => {
      // 1. Try single OTP inputs
      const candidates = Array.from(document.querySelectorAll('input[data-testid="tux-web-input"], input.tux-input__element-zY3KBY, input[name="otp"], input[placeholder*="6-digit"], input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="digit"], input[placeholder*="Digit"], input[id*="otp"], input[class*="otp"], input[class*="code"], input[class*="tux-"]'));
      const singleInput = candidates.find((el: any) => el.offsetWidth > 0) || candidates[0];

      if (singleInput) {
        try {
          (singleInput as HTMLInputElement).focus();
          (singleInput as HTMLInputElement).value = otpCode;
          
          // React 16+ Value Tracker Bypass
          const tracker = (singleInput as any)._valueTracker;
          if (tracker) tracker.setValue('');
          
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(singleInput, otpCode);
          }

          singleInput.dispatchEvent(new Event('input', { bubbles: true }));
          singleInput.dispatchEvent(new Event('change', { bubbles: true }));
          singleInput.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        } catch (e) {}
      }

      // 2. Sequential inputs (6 individual boxes)
      const digitInputs = Array.from(document.querySelectorAll('input[type="tel"], input[maxlength="1"], .code-input, [class*="code-digit"]'))
        .filter((el: any) => el.offsetWidth > 0) as HTMLInputElement[];

      if (digitInputs.length >= otpCode.length) {
        for (let i = 0; i < otpCode.length; i++) {
          digitInputs[i].value = otpCode[i];
          
          try {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(digitInputs[i], otpCode[i]);
            }
          } catch (e) {}

          digitInputs[i].dispatchEvent(new Event('input', { bubbles: true }));
          digitInputs[i].dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      }

      return false;
    }, { otpCode });

    if (filled) {
      this.logger.success('Successfully entered OTP.', this.workerId);
      await sleep(1000);
    }
    return filled;
  }
}
