import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useVaultStore } from '../../stores/vault_store';
import { useChatStore } from '../../stores/chat_store';
import { ContextMenu } from '../editor/context_menu';
import type { MenuEntry } from '../editor/context_menu';
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
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
}

const RenameInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onSubmit, onCancel }) => {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    const dot = value.lastIndexOf('.');
    ref.current?.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit();
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={onSubmit}
      onClick={(e) => e.stopPropagation()}
      className="w-full text-left px-2 py-0.5 rounded text-sm bg-card border border-primary text-foreground outline-none"
    />
  );
};

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  dragPath,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDrop,
  setDropTarget,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}) => {
  const currentPath = useVaultStore((s) => s.currentPath);
  const openPage = useVaultStore((s) => s.openPage);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isRenaming = renamingPath === node.path;

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
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e, node.path);
            }}
            className={`rounded transition-colors ${
              isDropTarget ? 'bg-accent ring-2 ring-primary' : ''
            }`}
          >
            {isRenaming ? (
              <div style={{ paddingLeft: depth * 12 + 8 }} className="pr-2">
                <RenameInput value={renameValue} onChange={onRenameChange} onSubmit={onRenameSubmit} onCancel={onRenameCancel} />
              </div>
            ) : (
              <button
                onClick={() => setExpanded((e) => ({ ...e, [node.path]: !isOpen }))}
                className="w-full text-left px-2 py-1 hover:bg-accent rounded text-sm flex items-center gap-1"
                style={{ paddingLeft: depth * 12 + 8 }}
              >
                <span className="text-muted-foreground shrink-0 w-4 h-4 inline-flex items-center justify-center">
                  {isOpen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      <path d="M2 10h20" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                </span>
                <span className="font-medium">{node.name}</span>
              </button>
            )}
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
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameChange={onRenameChange}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
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
    <div>
      {isRenaming ? (
        <div style={{ paddingLeft: depth * 12 + 8 }} className="pr-2">
          <RenameInput value={renameValue} onChange={onRenameChange} onSubmit={onRenameSubmit} onCancel={onRenameCancel} />
        </div>
      ) : (
        <button
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.path);
            onDragStart(node.path);
          }}
          onDragEnd={onDragEnd}
          onClick={() => void openPage(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e, node.path);
          }}
          className={`w-full text-left px-2 py-1 rounded text-sm truncate transition-opacity ${
            isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent text-foreground'
          } ${isDragging ? 'opacity-50' : ''}`}
          style={{ paddingLeft: depth * 12 + 8 }}
          title={node.path}
        >
          {title}
        </button>
      )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const tree = useVaultStore((s) => s.tree);
  const loadTree = useVaultStore((s) => s.loadTree);
  const openPage = useVaultStore((s) => s.openPage);
  const currentPath = useVaultStore((s) => s.currentPath);

  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, path });
  };

  const startRename = () => {
    if (!ctxMenu) return;
    const name = ctxMenu.path.split('/').pop() || ctxMenu.path;
    setRenamingPath(ctxMenu.path);
    setRenameValue(name);
    setCtxMenu(null);
  };

  const cancelRename = () => {
    setRenamingPath(null);
  };

  const submitRename = async () => {
    const oldPath = renamingPath;
    if (!oldPath) return;

    const oldName = oldPath.split('/').pop() || oldPath;
    const newName = renameValue.trim();

    if (!newName || newName === oldName) {
      setRenamingPath(null);
      return;
    }

    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    try {
      await api.vault.rename(oldPath, newPath);
      await loadTree();
      if (currentPath === oldPath) {
        await openPage(newPath);
      }
    } catch (err) {
      console.error('Falha ao renomear:', err);
    }
    setRenamingPath(null);
  };

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

  const handleSendToAtlas = async () => {
    if (!ctxMenu) return;
    const path = ctxMenu.path;
    setCtxMenu(null);
    try {
      await openPage(path);
      useChatStore.getState().loadPageContext(path);
    } catch (err) {
      console.error('Falha ao carregar página para o Atlas:', err);
    }
  };

  const contextMenuItems: MenuEntry[] = ctxMenu
    ? [
        ...(ctxMenu.path.endsWith('.md')
          ? [
              {
                type: 'item' as const,
                label: 'Enviar para o Atlas',
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M16 12l-4 4-4-4M12 8v8"/></svg>`,
                onSelect: handleSendToAtlas,
              },
            ]
          : []),
        {
          type: 'item',
          label: 'Renomear',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
          onSelect: startRename,
        },
      ]
    : [];

  const isEmpty = useMemo(
    () => !tree || !tree.children || tree.children.length === 0,
    [tree],
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-2 py-1 border-b border-border flex items-center gap-1">
        <button
          onClick={handleNewPage}
          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Nova página"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>
        <button
          onClick={handleNewFolder}
          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Nova pasta"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1 px-1">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground px-3 py-4">
            Nenhuma página ainda. Use os ícones acima para criar uma página ou pasta.
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
              onContextMenu={handleContextMenu}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameSubmit={submitRename}
              onRenameCancel={cancelRename}
            />
          )
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={contextMenuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
