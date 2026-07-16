import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  workers: number;
  headless: boolean;
  timeout: number;
  retries: number;
  retryDelay: number;
  emailPollInterval: number;
  emailPollTimeout: number;
  maxConcurrentWorkers: number;
  actionDelay: number;
  socialBee: {
    email: string;
    password: string;
  };
  socialBeeTasks: {
    postCategories: string[];
    imagesFolder: string;
    caption: string;
    enableComments: boolean;
    scheduleType: string;
    variationTexts: string[];
  };
  captcha: {
    enabled: boolean;
    apiEndpoint: string;
    apiKey: string;
    timeout: number;
    retries: number;
  };
  email: {
    provider: string;
    pollInterval: number;
    timeout: number;
  };
  paths: {
    userDataDir: string;
    logs: string;
    screenshots: string;
    traces: string;
    reports: string;
  };
}

export function loadConfig(): Config {
  const configPath = path.join(__dirname, '../../config/config.json');
  
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData) as Config;
    
    // Set default actionDelay if not defined
    if (config.actionDelay === undefined) {
      config.actionDelay = 1000;
    }
    
    // Override settings from environment variables if they are set
    if (process.env.CAPTCHA_API_KEY) {
      if (!config.captcha) {
        config.captcha = {} as any;
      }
      config.captcha.apiKey = process.env.CAPTCHA_API_KEY;
    }
    if (process.env.SOCIALBEE_EMAIL) {
      if (!config.socialBee) {
        config.socialBee = {} as any;
      }
      config.socialBee.email = process.env.SOCIALBEE_EMAIL;
    }
    if (process.env.SOCIALBEE_PASSWORD) {
      if (!config.socialBee) {
        config.socialBee = {} as any;
      }
      config.socialBee.password = process.env.SOCIALBEE_PASSWORD;
    }
    
    // Validate required fields
    if (!config.socialBee?.email || !config.socialBee?.password) {
      console.warn('⚠️ SocialBee credentials not configured in config.json or .env');
    }
    
    // Ensure directories exist
    const dirs = [
      config.paths.userDataDir,
      config.paths.logs,
      config.paths.screenshots,
      config.paths.traces,
      config.paths.reports,
      config.socialBeeTasks?.imagesFolder
    ];
    
    for (const dir of dirs) {
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error}`);
  }
}

