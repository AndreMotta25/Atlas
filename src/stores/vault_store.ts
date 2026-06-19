import { create } from 'zustand';
import { api } from '../lib/api';
import type { PageContent, VaultChangeEvent, VaultTree } from '../types';

interface VaultState {
  tree: VaultTree | null;
  currentPath: string | null;
  currentContent: string;
  dirty: boolean;
  loadTree: () => Promise<void>;
  openPage: (relPath: string) => Promise<void>;
  setDirty: (dirty: boolean) => void;
  saveCurrent: (content: string) => Promise<void>;
  subscribeWatch: () => () => void;
  applyChange: (evt: VaultChangeEvent) => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  tree: null,
  currentPath: null,
  currentContent: '',
  dirty: false,

  loadTree: async () => {
    const tree = await api.vault.readTree();
    set({ tree });
  },

  openPage: async (relPath) => {
    const page: PageContent = await api.vault.readPage(relPath);
    set({ currentPath: relPath, currentContent: page.content, dirty: false });
  },

  setDirty: (dirty) => set({ dirty }),

  saveCurrent: async (content) => {
    const { currentPath } = get();
    if (!currentPath) return;
    await api.vault.writePage(currentPath, content);
    set({ currentContent: content, dirty: false });
  },

  subscribeWatch: () => {
    return api.vault.onChanged((evt) => {
      get().applyChange(evt);
    });
  },

  applyChange: (evt) => {
    // Simplest approach: reload the tree on any change.
    // (External edits to the currently-open file will be picked up by the
    // watcher in Phase 2; for now just refresh the tree.)
    if (evt.type === 'add' || evt.type === 'unlink' || evt.type === 'addDir' || evt.type === 'unlinkDir') {
      void get().loadTree();
    }
    // When a page is modified externally (e.g. AI chat edit), reload it
    // immediately so the editor reflects the change without navigation.
    if (evt.type === 'change') {
      const { currentPath } = get();
      if (currentPath === evt.path) {
        void get().openPage(currentPath);
      }
    }
  },
}));
