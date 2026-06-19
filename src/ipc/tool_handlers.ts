import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { createChannel } from '../types';
import { ToolExecutor } from '../ai/tool_executor';
import { resumeConversation } from './ai_handlers';
import type {
  EditPageMode,
  ToolConfirmRequest,
  ToolRejectRequest,
  ToolResultPayload,
  UndoResult,
} from '../types';

const confirmSchema = z.object({
  toolCallId: z.string(),
  toolName: z.enum(['create_page', 'edit_page']),
  args: z.record(z.string(), z.unknown()),
  requestId: z.string(),
});

const rejectSchema = z.object({
  toolCallId: z.string(),
  requestId: z.string(),
});

const ensureArgs = (toolName: string, args: Record<string, unknown>): void => {
  if (typeof args.path !== 'string') throw new Error(`Tool "${toolName}": "path" ausente.`);
  if (typeof args.content !== 'string') throw new Error(`Tool "${toolName}": "content" ausente.`);
  if (toolName === 'edit_page') {
    if (!['replace', 'append', 'replace_section'].includes(args.mode as string)) {
      throw new Error(`edit_page: mode inválido "${String(args.mode)}".`);
    }
    if (args.mode === 'replace_section' && typeof args.section !== 'string') {
      throw new Error('edit_page: "section" é obrigatório quando mode = "replace_section".');
    }
  }
};

const executeWriteTool = async (
  toolName: 'create_page' | 'edit_page',
  args: Record<string, unknown>,
  toolCallId: string,
): Promise<ToolResultPayload> => {
  try {
    ensureArgs(toolName, args);
  } catch (err) {
    return {
      toolCallId,
      toolName,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (toolName === 'create_page') {
    const result = await ToolExecutor.createPage({
      path: args.path as string,
      content: args.content as string,
    });
    return { ...result, toolCallId };
  }

  // edit_page
  const result = await ToolExecutor.editPage({
    path: args.path as string,
    mode: args.mode as EditPageMode,
    content: args.content as string,
    section: typeof args.section === 'string' ? args.section : undefined,
  });
  return { ...result, toolCallId };
};

export const registerToolHandlers = (): void => {
  ipcMain.handle(createChannel('tool', 'confirm'), async (event, raw: unknown) => {
    const parsed = confirmSchema.parse(raw) as ToolConfirmRequest;
    const sender: IpcMainInvokeEvent['sender'] = event.sender;

    const result = await executeWriteTool(parsed.toolName, parsed.args, parsed.toolCallId);

    await resumeConversation(sender, parsed.requestId, result, {
      requestId: parsed.requestId,
      toolCallId: parsed.toolCallId,
      toolName: parsed.toolName,
      args: parsed.args,
      status: result.success ? 'applied' : 'rejected',
    });

    return result;
  });

  ipcMain.handle(createChannel('tool', 'reject'), async (event, raw: unknown) => {
    const parsed = rejectSchema.parse(raw) as ToolRejectRequest;
    const sender: IpcMainInvokeEvent['sender'] = event.sender;

    // We don't know the original args here — reconstruct a minimal pending object.
    const result: ToolResultPayload = {
      toolCallId: parsed.toolCallId,
      toolName: 'create_page', // best-effort; the renderer will read its own state for display
      success: false,
      error: 'Operação rejeitada pelo usuário.',
    };

    await resumeConversation(sender, parsed.requestId, result, {
      requestId: parsed.requestId,
      toolCallId: parsed.toolCallId,
      toolName: 'create_page',
      args: {},
      status: 'rejected',
    });

    return { success: true };
  });

  ipcMain.handle(createChannel('undo', 'last'), async (): Promise<UndoResult> => {
    return ToolExecutor.undoLast();
  });
};
