import type { TargetId } from '../shared/constants';
import type { AiTargetAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { doubaoAdapter } from './doubao';
import { geminiAdapter } from './gemini';

export const adapters: AiTargetAdapter[] = [chatgptAdapter, claudeAdapter, geminiAdapter, doubaoAdapter];

export function getAdapterById(targetId: TargetId): AiTargetAdapter | undefined {
  return adapters.find((adapter) => adapter.id === targetId);
}

export function detectAdapter(): AiTargetAdapter | undefined {
  return adapters.find((adapter) => adapter.detect());
}
