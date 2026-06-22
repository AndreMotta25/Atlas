import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { api } from '../../lib/api';
import { useVaultStore } from '../../stores/vault_store';
import { SpinnerIcon, LinkIcon } from '../icons';
import type { GraphData } from '../../types';

/**
 * Graph visualization of the vault — pages as nodes, wiki-links as edges.
 *
 * Encapsulates `react-force-graph-2d` (canvas-based force-directed graph) so
 * the rest of the app stays decoupled from the library's API. Fetches data
 * via `api.vault.graph()` and refreshes on vault changes (debounced).
 */

interface RfgNode {
  id: number;
  path: string;
  title: string;
  degree: number;
  // Filled by the force engine:
  x?: number;
  y?: number;
}

interface RfgLink {
  source: number;
  target: number;
}

interface RfgGraphData {
  nodes: RfgNode[];
  links: RfgLink[];
}

// Maps our domain edge field name to the lib's expected `links` field.
const toLibData = (data: GraphData): RfgGraphData => ({
  nodes: data.nodes.map((n) => ({ ...n })),
  links: data.edges.map((e) => ({ source: e.source, target: e.target })),
});

// Tailwind tokens aren't available inside the canvas, so we read the CSS
// variables directly. Recomputed per render to track theme switches.
const useGraphColors = () => {
  const [colors, setColors] = useState(() => readColors());
  useEffect(() => {
    // Re-read when the `.dark` class flips (theme switch).
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return colors;
};

const readColors = () => {
  const styles = getComputedStyle(document.documentElement);
  return {
    node: styles.getPropertyValue('--primary').trim() || '#3b82f6',
    nodeActive: styles.getPropertyValue('--foreground').trim() || '#0f172a',
    link: styles.getPropertyValue('--border').trim() || '#cbd5e1',
    label: styles.getPropertyValue('--muted-foreground').trim() || '#64748b',
  };
};

// Node radius scales sub-linearly with degree so hubs don't dominate.
const nodeRadius = (degree: number): number => 4 + Math.sqrt(degree) * 1.5;

export const GraphView: React.FC = () => {
  const openPage = useVaultStore((s) => s.openPage);
  const currentPath = useVaultStore((s) => s.currentPath);

  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<unknown>(null);
  const inflightRef = useRef(false);

  const colors = useGraphColors();

  // Debounce timer for onChanged-driven refreshes.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGraph = useCallback((showLoading: boolean) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    if (showLoading) setLoading(true);
    api.vault
      .graph()
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[GraphView] Failed to load graph:', err);
        setLoading(false);
      })
      .finally(() => {
        inflightRef.current = false;
      });
  }, []);

  useEffect(() => {
    fetchGraph(true);
  }, [fetchGraph]);

  // Track container size — ForceGraph2D needs explicit width/height.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(100, r.width), height: Math.max(100, r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Refresh (silently) on vault changes — debounced to avoid storms.
  useEffect(() => {
    const unsub = api.vault.onChanged((evt) => {
      if (evt.type === 'add' || evt.type === 'change' || evt.type === 'unlink') {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => fetchGraph(false), 300);
      }
    });
    return () => {
      unsub();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchGraph]);

  // IDs of nodes adjacent to the hovered one — for highlight.
  const neighborIds = useMemo(() => {
    if (data === null || hoveredId === null) return null;
    const set = new Set<number>([hoveredId]);
    for (const e of data.edges) {
      if (e.source === hoveredId) set.add(e.target);
      else if (e.target === hoveredId) set.add(e.source);
    }
    return set;
  }, [data, hoveredId]);

  const libData = useMemo(() => (data ? toLibData(data) : { nodes: [], links: [] }), [data]);

  // Frame all nodes inside the visible canvas once the force simulation has
  // settled. Calling zoomToFit earlier (on data arrival) fires before d3-force
  // has spread the nodes, leaving them clustered on one side of the canvas.
  const frameGraph = useCallback(() => {
    if (!data || data.nodes.length === 0) return;
    (graphRef.current as { zoomToFit?: (ms?: number, pad?: number) => void } | null)?.zoomToFit?.(400, 60);
  }, [data]);

  const handleNodeClick = useCallback(
    (node: RfgNode) => {
      void openPage(node.path);
    },
    [openPage],
  );

  const handleNodeHover = useCallback((node: RfgNode | null) => {
    setHoveredId(node ? node.id : null);
  }, []);

  // Custom canvas painter — default renderer doesn't scale well and ignores
  // our theme. Draws filled circles + label when zoomed in.
  const paintNode = useCallback(
    (node: RfgNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isCurrent = node.path === currentPath;
      const isHovered = neighborIds !== null && neighborIds.has(node.id);
      const dimmed = neighborIds !== null && !isHovered;
      const r = nodeRadius(node.degree);

      ctx.globalAlpha = dimmed ? 0.25 : 1;
      ctx.fillStyle = isCurrent ? colors.nodeActive : colors.node;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fill();

      // Ring on the current page.
      if (isCurrent) {
        ctx.strokeStyle = colors.nodeActive;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 2, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Label only when zoomed in close enough to be readable.
      if (globalScale >= 1.5 && !dimmed) {
        const label = node.title;
        ctx.font = `${10 / globalScale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = colors.label;
        ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + r + 2 / globalScale);
      }
      ctx.globalAlpha = 1;
    },
    [colors, currentPath, neighborIds],
  );

  const linkColor = useCallback(
    (link: RfgLink) => {
      if (neighborIds === null) return colors.link;
      const isHighlighted =
        neighborIds.has(link.source as number) && neighborIds.has(link.target as number);
      return isHighlighted ? colors.node : colors.link;
    },
    [colors, neighborIds],
  );

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background">
        <SpinnerIcon className="w-6 h-6 text-muted-foreground/60 mb-2" />
        <p className="text-xs text-muted-foreground">Carregando grafo…</p>
      </div>
    );
  }

  if (data !== null && data.nodes.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background px-6">
        <LinkIcon className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground mb-1">Nenhuma página indexada ainda.</p>
        <p className="text-xs text-muted-foreground/60 text-center max-w-sm">
          Selecione um vault e crie algumas páginas com links <code className="font-mono">[[wikilink]]</code> para
          vê-las como um grafo.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-background">
      <ForceGraph2D
        ref={graphRef as never}
        graphData={libData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeRelSize={1}
        nodeCanvasObject={paintNode as never}
        nodeCanvasObjectMode={() => 'replace'}
        nodeLabel={(node) => (node as RfgNode).title}
        nodePointerAreaPaint={(node: RfgNode, color: string, ctx: CanvasRenderingContext2D) => {
          const r = nodeRadius(node.degree) + 4;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={linkColor as never}
        linkWidth={1}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick as never}
        onNodeHover={handleNodeHover as never}
        onEngineStop={frameGraph}
        cooldownTicks={120}
        backgroundColor="#00000000"
        width={size.width}
        height={size.height}
      />
      {/* Overlay legend — bottom-left */}
      <div className="absolute bottom-3 left-3 px-3 py-2 rounded-lg bg-card/80 backdrop-blur border border-border text-[10px] text-muted-foreground space-y-1 pointer-events-none">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: colors.node }}
          />
          <span>Página</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full border-2"
            style={{ borderColor: colors.nodeActive, backgroundColor: 'transparent' }}
          />
          <span>Página atual</span>
        </div>
        <div className="pt-0.5">
          <span className="opacity-70">Clique para abrir · Scroll para zoom</span>
        </div>
      </div>
    </div>
  );
};
