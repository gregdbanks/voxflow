export interface IMicrophone {
  start(): Promise<void>;
  stop(): Promise<Buffer>;
  isRecording(): boolean;
}

export interface IClipboard {
  read(): Promise<string>;
  write(text: string): Promise<void>;
}

export interface IKeystroke {
  sendPaste(): Promise<void>;
}

export interface ActiveWindowInfo {
  appName: string;
  title: string;
  bundleId?: string;
}

export interface IActiveWindow {
  getActive(): Promise<ActiveWindowInfo | null>;
}

export interface TranscriptionRequest {
  audio: Buffer;
  language?: string;
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
}

export interface ITranscriptionService {
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}

export interface CleanupRequest {
  text: string;
  activeApp?: string;
}

export interface ICleanupService {
  clean(request: CleanupRequest): Promise<string>;
}

export interface DictionaryEntry {
  id: number;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  createdAt: number;
}

export interface IDictionaryRepository {
  list(): DictionaryEntry[];
  add(pattern: string, replacement: string, caseSensitive: boolean): DictionaryEntry;
  remove(id: number): void;
  applyTo(text: string): string;
}

export interface CorrectionRecord {
  id: number;
  original: string;
  corrected: string;
  appName: string | null;
  createdAt: number;
}

export interface ICorrectionRepository {
  record(original: string, corrected: string, appName: string | null): CorrectionRecord;
  recent(limit: number): CorrectionRecord[];
}

export interface AppSettings {
  cleanupEnabled: boolean;
  hotkey: string;
  language: string;
}

export interface ISettingsRepository {
  get(): AppSettings;
  update(patch: Partial<AppSettings>): AppSettings;
}
