export type AttachMethod = 'file-input' | 'paste-event' | 'paste-command' | 'drop-event' | 'clipboard-fallback';
export type AttachOutcome = 'confirmed' | 'rejected' | 'unknown';

export interface AttachResult {
  ok: boolean;
  method?: AttachMethod;
  error?: string;
  outcome?: AttachOutcome;
}

export interface AttachOptions {
  allowClipboardPaste: boolean;
}

export interface AiTargetAdapter {
  id: 'chatgpt' | 'claude' | 'gemini' | string;
  name: string;
  urlPatterns: string[];
  defaultUrl: string;

  detect(): boolean;
  waitUntilReady(timeoutMs: number): Promise<boolean>;
  attachImage(file: File, options?: AttachOptions): Promise<AttachResult>;
  focusInput?(): Promise<void>;
}

export interface AdapterSelectorSet {
  fileInputs: string[];
  textInputs: string[];
  dropTargets: string[];
  attachmentPreviews: string[];
}
