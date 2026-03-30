/**
 * Console interceptor — captures all console.log/warn/error into a ring buffer.
 * MUST be imported first in main.ts (before any other import that logs).
 */

export interface LogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error';
  msg: string;
}

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];

const _log = console.log;
const _warn = console.warn;
const _error = console.error;

function serialize(args: any[]): string {
  return args
    .map(a => {
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');
}

function capture(level: LogEntry['level'], args: any[]): void {
  buffer.push({ ts: new Date().toISOString(), level, msg: serialize(args) });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

console.log   = (...args: any[]) => { capture('log', args);   _log.apply(console, args); };
console.warn  = (...args: any[]) => { capture('warn', args);  _warn.apply(console, args); };
console.error = (...args: any[]) => { capture('error', args); _error.apply(console, args); };

/** Returns a copy of the current log buffer (up to 500 entries). */
export function getLogSnapshot(): LogEntry[] {
  return [...buffer];
}

/** Serializes the buffer as a single string for transmission. */
export function getLogsAsText(): string {
  return buffer
    .map(e => `[${e.ts}] [${e.level.toUpperCase()}] ${e.msg}`)
    .join('\n');
}
