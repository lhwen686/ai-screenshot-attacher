import type { TargetId } from '../shared/constants';
import type { OperationResult } from '../shared/messages';
import { enqueueManualAttachment } from './attachQueue';

export async function handleCommand(command: string): Promise<OperationResult> {
  switch (command) {
    case 'attach-to-chatgpt':
      return attachToTarget('chatgpt');
    case 'attach-to-claude':
      return attachToTarget('claude');
    case 'attach-to-gemini':
      return attachToTarget('gemini');
    case 'attach-to-default-ai':
    default:
      return attachToTarget();
  }
}

export async function attachToTarget(targetId?: TargetId): Promise<OperationResult> {
  return enqueueManualAttachment(targetId);
}
