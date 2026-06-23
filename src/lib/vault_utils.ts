import { api } from './api';
import { useVaultStore } from '../stores/vault_store';

export const createNewPage = async (folderPath?: string): Promise<void> => {
  const { loadTree, openPage } = useVaultStore.getState();
  const base = 'sem-titulo';
  let n = 1;
  let finalRel = '';
  for (;;) {
    const fileName = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    finalRel = folderPath ? `${folderPath}/${fileName}` : fileName;
    if (!(await api.vault.exists(finalRel))) break;
    n += 1;
  }
  await api.vault.writePage(finalRel, `# ${base}${n > 1 ? ' ' + n : ''}\n\n`);
  await loadTree();
  await openPage(finalRel);
};

export const createNewPageInFolder = async (folderPath: string): Promise<void> => {
  if (!folderPath) return;
  await createNewPage(folderPath);
};

export const createNewFolder = async (parentPath?: string): Promise<void> => {
  const { loadTree } = useVaultStore.getState();
  const base = 'nova-pasta';
  let n = 1;
  let finalRel = '';
  for (;;) {
    const dirName = n === 1 ? base : `${base}-${n}`;
    finalRel = parentPath ? `${parentPath}/${dirName}` : dirName;
    if (!(await api.vault.exists(finalRel))) break;
    n += 1;
  }
  await api.vault.createFolder(finalRel);
  await loadTree();
};

export const createNewFolderInFolder = async (parentPath: string): Promise<void> => {
  if (!parentPath) return;
  await createNewFolder(parentPath);
};
