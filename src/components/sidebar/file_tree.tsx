import React, { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useVaultStore } from '../../stores/vault_store';
import type { VaultTree } from '../../types';

interface TreeNodeProps {
  node: VaultTree;
  depth: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth }) => {
  const currentPath = useVaultStore((s) => s.currentPath);
  const openPage = useVaultStore((s) => s.openPage);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (node.isDir) {
    const isRoot = depth === 0;
    const isOpen = isRoot ? true : expanded[node.path] !== false;

    return (
      <div>
        {!isRoot && (
          <button
            onClick={() => setExpanded((e) => ({ ...e, [node.path]: !isOpen }))}
            className="w-full text-left px-2 py-1 hover:bg-slate-100 rounded text-sm flex items-center gap-1"
            style={{ paddingLeft: depth * 12 + 8 }}
          >
            <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
            <span className="font-medium">{node.name}</span>
          </button>
        )}
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = currentPath === node.path;
  const title = node.name.replace(/\.md$/i, '');

  return (
    <button
      onClick={() => void openPage(node.path)}
      className={`w-full text-left px-2 py-1 rounded text-sm truncate ${
        isActive ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-100 text-slate-700'
      }`}
      style={{ paddingLeft: depth * 12 + 8 }}
      title={node.path}
    >
      {title}
    </button>
  );
};

export const FileTree: React.FC = () => {
  const tree = useVaultStore((s) => s.tree);
  const loadTree = useVaultStore((s) => s.loadTree);
  const openPage = useVaultStore((s) => s.openPage);

  const handleNewPage = async () => {
    const base = 'sem-titulo';
    let n = 1;
    let rel = `${base}.md`;
    // Pick a non-existing name by trying to read until failure.
    // (Good enough for MVP — no index.)
    for (;;) {
      try {
        await api.vault.readPage(rel);
        n += 1;
        rel = `${base}-${n}.md`;
      } catch {
        break;
      }
    }
    await api.vault.writePage(rel, `# ${base}${n > 1 ? ' ' + n : ''}\n\n`);
    await loadTree();
    await openPage(rel);
  };

  const isEmpty = useMemo(
    () => !tree || !tree.children || tree.children.length === 0,
    [tree],
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-2 py-1 border-b border-slate-200">
        <button
          onClick={handleNewPage}
          className="w-full text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
        >
          + Nova página
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1 px-1">
        {isEmpty ? (
          <p className="text-xs text-slate-400 px-3 py-4">
            Nenhuma página ainda. Clique em <strong>+ Nova página</strong> para começar.
          </p>
        ) : (
          tree && <TreeNode node={tree} depth={0} />
        )}
      </div>
    </div>
  );
};
