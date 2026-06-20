import { ipcMain, dialog } from 'electron';
import { createChannel } from '../types';
import { VaultManager } from '../vault/manager';
import { ConfigStore } from '../vault/config_store';
import type { PageContent } from '../types';

export const registerVaultHandlers = (): void => {
  ipcMain.handle(createChannel('vault', 'get-status'), async () => ({
    configured: VaultManager.isConfigured(),
    root: VaultManager.getRoot(),
  }));

  ipcMain.handle(createChannel('vault', 'select'), async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Escolha a pasta do seu vault',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { configured: VaultManager.isConfigured(), root: VaultManager.getRoot() };
    }
    const chosen = result.filePaths[0];
    ConfigStore.update({ vaultPath: chosen });
    VaultManager.setRoot(chosen);
    return { configured: true, root: chosen };
  });

  ipcMain.handle(createChannel('vault', 'read-tree'), async () => {
    if (!VaultManager.isConfigured()) return null;
    return VaultManager.readTree();
  });

  ipcMain.handle(createChannel('vault', 'read-page'), async (_e, relPath: string) => {
    return VaultManager.readPage(relPath) as Promise<PageContent>;
  });

  ipcMain.handle(createChannel('vault', 'write-page'), async (_e, relPath: string, content: string) => {
    await VaultManager.writePage(relPath, content);
    return { success: true };
  });

  ipcMain.handle(createChannel('vault', 'create-folder'), async (_e, relPath: string) => {
    await VaultManager.createFolder(relPath);
    return { success: true };
  });

  ipcMain.handle(createChannel('vault', 'move-page'), async (_e, fromPath: string, toPath: string) => {
    await VaultManager.movePage(fromPath, toPath);
    return { success: true };
  });

  ipcMain.handle(createChannel('vault', 'rename'), async (_e, oldPath: string, newPath: string) => {
    await VaultManager.rename(oldPath, newPath);
    return { success: true };
  });

  ipcMain.handle(createChannel('vault', 'delete'), async (_e, relPath: string) => {
    await VaultManager.deletePage(relPath);
    return { success: true };
  });
};
