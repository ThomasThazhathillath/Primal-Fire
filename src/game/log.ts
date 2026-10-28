// The play-test event log (the prototype's `L` key). Lines carry enough
// context to reconstruct a bug report when pasted back to Claude.

export type LogLevel = '' | 'ok' | 'bad';

export interface LogLine {
  text: string;
  level: LogLevel;
}

export class EventLog {
  readonly lines: LogLine[] = [];
  private listeners = new Set<(line: LogLine) => void>();

  constructor(
    private context: () => string,
    private max = 400,
  ) {}

  add(msg: string, level: LogLevel = ''): void {
    const line = { text: `${this.context()} · ${msg}`, level };
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.shift();
    console.log('[PRIMAL]', line.text);
    for (const l of this.listeners) l(line);
  }

  onLine(fn: (line: LogLine) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  toString(): string {
    return this.lines.map((l) => l.text).join('\n');
  }
}
