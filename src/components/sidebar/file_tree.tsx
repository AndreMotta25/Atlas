import React, { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useVaultStore } from '../../stores/vault_store';
import type { VaultTree } from '../../types';

interface TreeNodeProps {
  node: VaultTree;
  depth: number;
  dragPath: string | null;
  dropTarget: string | null;
  onDragStart: (path: string) => void;
  onDragEnd: () => void;
  onDrop: (srcPath: string, destPath: string) => Promise<void>;
  setDropTarget: (path: string | null) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  dragPath,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDrop,
  setDropTarget,
}) => {
  const currentPath = useVaultStore((s) => s.currentPath);
  const openPage = useVaultStore((s) => s.openPage);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (node.isDir) {
    const isRoot = depth === 0;
    const isOpen = isRoot ? true : expanded[node.path] !== false;
    const isDropTarget = dropTarget === node.path;

    return (
      <div>
        {!isRoot && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropTarget !== node.path) setDropTarget(node.path);
            }}
            onDragLeave={(e) => {
              // Only clear if we actually left this element
              const related = e.relatedTarget as Node | null;
              if (!e.currentTarget.contains(related)) {
                setDropTarget(null);
              }
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(null);
              const srcPath = e.dataTransfer.getData('text/plain');
              if (srcPath && srcPath !== node.path) {
                const fileName = srcPath.split('/').pop() || srcPath;
                const destPath = node.path ? `${node.path}/${fileName}` : fileName;
                await onDrop(srcPath, destPath);
              }
            }}
            className={`rounded transition-colors ${
              isDropTarget ? 'bg-accent ring-2 ring-primary' : ''
            }`}
          >
            <button
              onClick={() => setExpanded((e) => ({ ...e, [node.path]: !isOpen }))}
              className="w-full text-left px-2 py-1 hover:bg-accent rounded text-sm flex items-center gap-1"
              style={{ paddingLeft: depth * 12 + 8 }}
            >
              <span className="text-muted-foreground text-xs">{isOpen ? '▼' : '▶'}</span>
              <span className="font-medium">{node.name}</span>
            </button>
          </div>
        )}
        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                dragPath={dragPath}
                dropTarget={dropTarget}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDrop={onDrop}
                setDropTarget={setDropTarget}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = currentPath === node.path;
  const title = node.name.replace(/\.md$/i, '');
  const isDragging = dragPath === node.path;

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.path);
        onDragStart(node.path);
      }}
      onDragEnd={onDragEnd}
      onClick={() => void openPage(node.path)}
      className={`w-full text-left px-2 py-1 rounded text-sm truncate transition-opacity ${
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent text-foreground'
      } ${isDragging ? 'opacity-50' : ''}`}
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

  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleNewPage = async () => {
    const base = 'sem-titulo';
    let n = 1;
    let rel = `${base}.md`;
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

  const handleNewFolder = async () => {
    const base = 'nova-pasta';
    let n = 1;
    let rel = base;
    for (;;) {
      try {
        await api.vault.readPage(rel);
        n += 1;
        rel = `${base}-${n}`;
      } catch {
        break;
      }
    }
    await api.vault.createFolder(rel);
    await loadTree();
  };

  const handleMove = async (srcPath: string, destPath: string) => {
    await api.vault.movePage(srcPath, destPath);
    await loadTree();
  };

  const isEmpty = useMemo(
    () => !tree || !tree.children || tree.children.length === 0,
    [tree],
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-2 py-1 border-b border-border flex flex-col gap-1">
        <button
          onClick={handleNewPage}
          className="w-full text-xs px-2 py-1 bg-muted hover:bg-accent rounded text-foreground"
        >
          + Nova página
        </button>
        <button
          onClick={handleNewFolder}
          className="w-full text-xs px-2 py-1 bg-muted hover:bg-accent rounded text-foreground"
        >
          + Nova pasta
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1 px-1">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground px-3 py-4">
            Nenhuma página ainda. Clique em <strong>+ Nova página</strong> ou <strong>+ Nova pasta</strong> para começar.
          </p>
        ) : (
          tree && (
            <TreeNode
              node={tree}
              depth={0}
              dragPath={dragPath}
              dropTarget={dropTarget}
              onDragStart={setDragPath}
              onDragEnd={() => setDragPath(null)}
              onDrop={handleMove}
              setDropTarget={setDropTarget}
            />
          )
        )}
      </div>
    </div>
  );
};
