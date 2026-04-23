import type {
  ActiveWindowInfo,
  IActiveWindow,
  IClipboard,
  IKeystroke,
  IMicrophone,
} from '../../src/platform/interfaces.js';

export interface StubMicrophoneOptions {
  fixture: Buffer;
  startDelayMs?: number;
  stopDelayMs?: number;
  failOnStart?: Error;
  failOnStop?: Error;
}

export class StubMicrophone implements IMicrophone {
  private readonly opts: StubMicrophoneOptions;
  private recording = false;
  public startCalls = 0;
  public stopCalls = 0;

  constructor(opts: StubMicrophoneOptions) {
    this.opts = opts;
  }

  isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    this.startCalls += 1;
    if (this.opts.failOnStart) throw this.opts.failOnStart;
    if (this.opts.startDelayMs) await new Promise((r) => setTimeout(r, this.opts.startDelayMs));
    this.recording = true;
  }

  async stop(): Promise<Buffer> {
    this.stopCalls += 1;
    if (!this.recording) throw new Error('StubMicrophone.stop without start');
    if (this.opts.failOnStop) throw this.opts.failOnStop;
    if (this.opts.stopDelayMs) await new Promise((r) => setTimeout(r, this.opts.stopDelayMs));
    this.recording = false;
    return this.opts.fixture;
  }
}

export class StubClipboard implements IClipboard {
  public contents: string;
  public readCalls = 0;
  public writes: string[] = [];
  public failNextWrite: Error | null = null;

  constructor(initial = '') {
    this.contents = initial;
  }

  async read(): Promise<string> {
    this.readCalls += 1;
    return this.contents;
  }

  async write(text: string): Promise<void> {
    if (this.failNextWrite) {
      const err = this.failNextWrite;
      this.failNextWrite = null;
      throw err;
    }
    this.writes.push(text);
    this.contents = text;
  }
}

export class StubKeystroke implements IKeystroke {
  public pasteCalls = 0;

  async sendPaste(): Promise<void> {
    this.pasteCalls += 1;
  }
}

export class StubActiveWindow implements IActiveWindow {
  public calls = 0;
  public response: ActiveWindowInfo | null;

  constructor(response: ActiveWindowInfo | null = null) {
    this.response = response;
  }

  async getActive(): Promise<ActiveWindowInfo | null> {
    this.calls += 1;
    return this.response;
  }
}

export class FakeGlobalShortcut {
  private readonly handlers = new Map<string, () => void>();
  public registerCalls: Array<[string, () => void]> = [];
  public unregisterCalls: string[] = [];
  public nextResult = true;

  register(accelerator: string, cb: () => void): boolean {
    this.registerCalls.push([accelerator, cb]);
    if (this.nextResult) this.handlers.set(accelerator, cb);
    return this.nextResult;
  }

  unregister(accelerator: string): void {
    this.unregisterCalls.push(accelerator);
    this.handlers.delete(accelerator);
  }

  isRegistered(accelerator: string): boolean {
    return this.handlers.has(accelerator);
  }

  trigger(accelerator: string): void {
    const h = this.handlers.get(accelerator);
    if (!h) throw new Error(`No handler registered for ${accelerator}`);
    h();
  }
}
