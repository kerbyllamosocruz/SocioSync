import { Config } from './config';

export class SelectorManager {
  private config: Config;
  
  constructor(config: Config) {
    this.config = config;
  }
  
  // TikTok selectors
  getTikTokEmailInput(): string {
    return 'input[type="text"]';
  }
  
  getTikTokPasswordInput(): string {
    return 'input[type="password"]';
  }
  
  getTikTokLoginButton(): string {
    return 'button[type="submit"]';
  }
  
  getTikTokOTPInputs(): string {
    return 'input[type="text"][maxlength="1"]';
  }
  
  getTikTokVerifyButton(): string {
    return 'button:has-text("Verify")';
  }
  
  // SocialBee selectors
  getSocialBeeEmailInput(): string {
    return 'input[name="email"]';
  }
  
  getSocialBeePasswordInput(): string {
    return 'input[name="password"]';
  }
  
  getSocialBeeLoginButton(): string {
    return 'button[type="submit"]';
  }
  
  getSocialBeeAddAccountButton(): string {
    return 'button:has-text("Add Account")';
  }
  
  getSocialBeeTikTokOption(): string {
    return 'text=TikTok';
  }
  
  getSocialBeeConnectButton(): string {
    return 'button:has-text("Connect TikTok")';
  }
}
