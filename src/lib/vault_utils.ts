import { api } from './api';
import { useVaultStore } from '../stores/vault_store';

export const createNewPage = async (): Promise<void> => {
  const { loadTree, openPage } = useVaultStore.getState();
  const base = 'sem-titulo';
  let n = 1;
  let rel = `${base}.md`;
  for (;;) {
    if (!(await api.vault.exists(rel))) break;
    n += 1;
    rel = `${base}-${n}.md`;
  }
  await api.vault.writePage(rel, `# ${base}${n > 1 ? ' ' + n : ''}\n\n`);
  await loadTree();
  await openPage(rel);
};

export const createNewFolder = async (): Promise<void> => {
  const { loadTree } = useVaultStore.getState();
  const base = 'nova-pasta';
  let n = 1;
  let rel = base;
  for (;;) {
    if (!(await api.vault.exists(rel))) break;
    n += 1;
    rel = `${base}-${n}`;
  }
  await api.vault.createFolder(rel);
  await loadTree();
};
