/**
 * Thin accessor for the IPC bridge exposed via preload.
 * The bridge is attached to `window.electronAPI`; this module just provides
 * a typed entry point and a friendly error if preload failed to load.
 */
import type { ElectronAPI } from '../preload';

export const api: ElectronAPI = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;

export type { ElectronAPI } from '../preload';
