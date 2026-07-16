import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SUCCESS = 'success'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  workerId?: string;
  message: string;
  data?: any;
  error?: Error;
}

export class Logger {
  private logDir: string;
  private successFile: string;
  private failureFile: string;
  private logStream: WriteStream;
  private entries: LogEntry[] = [];
  private reportFile: string;

  constructor(baseDir: string, runId: string) {
    this.logDir = path.join(baseDir, runId);
    this.ensureDirectories();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reportFile = path.join(this.logDir, `report-${timestamp}.json`);
    this.successFile = path.join(this.logDir, `success-${timestamp}.csv`);
    this.failureFile = path.join(this.logDir, `failure-${timestamp}.csv`);
    
    this.logStream = createWriteStream(
      path.join(this.logDir, `log-${timestamp}.log`),
      { flags: 'a' }
    );
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatLog(entry: LogEntry): string {
    const workerTag = entry.workerId ? `[Worker-${entry.workerId}]` : '[Main]';
    const levelTag = entry.level.toUpperCase().padEnd(7);
    return `[${entry.timestamp}] ${workerTag} ${levelTag} ${entry.message}`;
  }

  private writeToFile(entry: LogEntry): void {
    const formatted = this.formatLog(entry);
    this.logStream.write(formatted + '\n');
  }

  private log(level: LogLevel, message: string, workerId?: string, data?: any, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      workerId,
      message,
      data,
      error
    };
    
    this.entries.push(entry);
    this.writeToFile(entry);
    
    const colors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[36m',
      [LogLevel.INFO]: '\x1b[34m',
      [LogLevel.WARN]: '\x1b[33m',
      [LogLevel.ERROR]: '\x1b[31m',
      [LogLevel.SUCCESS]: '\x1b[32m'
    };
    
    const color = colors[level] || '\x1b[0m';
    const reset = '\x1b[0m';
    console.log(`${color}${this.formatLog(entry)}${reset}`);
  }

  debug(message: string, workerId?: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, workerId, data);
  }

  info(message: string, workerId?: string, data?: any): void {
    this.log(LogLevel.INFO, message, workerId, data);
  }

  warn(message: string, workerId?: string, data?: any): void {
    this.log(LogLevel.WARN, message, workerId, data);
  }

  error(message: string, error?: Error, workerId?: string, data?: any): void {
    this.log(LogLevel.ERROR, message, workerId, data, error);
  }

  success(message: string, workerId?: string, data?: any): void {
    this.log(LogLevel.SUCCESS, message, workerId, data);
  }

  async writeSuccess(account: any): Promise<void> {
    await fs.promises.appendFile(this.successFile, `${JSON.stringify(account)}\n`);
  }

  async writeFailure(account: any, error: string): Promise<void> {
    await fs.promises.appendFile(this.failureFile, `${JSON.stringify({ ...account, error })}\n`);
  }

  async generateReport(): Promise<void> {
    const report = {
      runId: path.basename(this.logDir),
      startTime: this.entries[0]?.timestamp,
      endTime: new Date().toISOString(),
      totalEntries: this.entries.length,
      summary: {
        success: this.entries.filter(e => e.level === LogLevel.SUCCESS).length,
        error: this.entries.filter(e => e.level === LogLevel.ERROR).length,
        warning: this.entries.filter(e => e.level === LogLevel.WARN).length,
        info: this.entries.filter(e => e.level === LogLevel.INFO).length
      },
      entries: this.entries
    };
    
    await fs.promises.writeFile(this.reportFile, JSON.stringify(report, null, 2));
    
    const markdown = `# Automation Run Report

- **Run ID:** ${report.runId}
- **Start Time:** ${report.startTime}
- **End Time:** ${report.endTime}
- **Total Operations:** ${report.totalEntries}

## Summary
- ✅ Success: ${report.summary.success}
- ❌ Errors: ${report.summary.error}
- ⚠️ Warnings: ${report.summary.warning}
- ℹ️ Info: ${report.summary.info}

## Detailed Logs
See the attached JSON report for full details.
`;
    
    await fs.promises.writeFile(
      path.join(this.logDir, 'summary.md'),
      markdown
    );
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.logStream.end(resolve);
    });
  }
}
