export type AttachMethod = 'file-input' | 'paste-event' | 'drop-event' | 'clipboard-fallback';
export type AttachConfidence = 'confirmed' | 'unconfirmed';

export interface AttachEvidence {
  kind: string;
  message?: string;
  selector?: string;
}

export interface AttachResult {
  ok: boolean;
  method?: AttachMethod;
  error?: string;
  confidence?: AttachConfidence;
  evidence?: AttachEvidence[];
}

export interface AiTargetAdapter {
  id: 'chatgpt' | 'claude' | 'gemini' | string;
  name: string;
  urlPatterns: string[];
  defaultUrl: string;

  detect(): boolean;
  waitUntilReady(timeoutMs: number): Promise<boolean>;
  attachImage(file: File): Promise<AttachResult>;
  focusInput?(): Promise<void>;
}

export interface AdapterSelectorSet {
  fileInputs: string[];
  textInputs: string[];
  dropTargets: string[];
  attachmentPreviews: string[];
}
