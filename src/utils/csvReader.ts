import * as fs from 'fs';
import { parse } from 'csv-parse';

export async function readAccountsFromCSV(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const accounts: any[] = [];
    
    fs.createReadStream(filePath)
      .pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      }))
      .on('data', (record) => {
        if (record.email || record.username) {
          accounts.push({
            id: `account-${accounts.length + 1}-${Date.now()}`,
            email: record.email || record.username || '',
            password: record.password || '',
            username: record.username || record.email || '',
            ...record
          });
        }
      })
      .on('end', () => {
        resolve(accounts);
      })
      .on('error', (error) => {
        reject(new Error(`Failed to read CSV file: ${error.message}`));
      });
  });
}
