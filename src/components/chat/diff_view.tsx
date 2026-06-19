interface DiffViewProps {
  oldText: string;
  newText: string;
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  text: string;
}

/** Classic LCS line diff. O(n*m) — fine for typical Markdown pages (< 1000 lines). */
const computeDiff = (a: string[], b: string[]): DiffLine[] => {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'context', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'remove', text: a[i++] });
  while (j < m) out.push({ type: 'add', text: b[j++] });
  return out;
};

export const DiffView: React.FC<DiffViewProps> = ({ oldText, newText }) => {
  const oldLines = oldText.length ? oldText.split('\n') : [];
  const newLines = newText.length ? newText.split('\n') : [];
  const diff = computeDiff(oldLines, newLines);

  if (diff.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic px-2 py-1">
        (sem mudanças)
      </div>
    );
  }

  return (
    <pre className="text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto bg-background/50 rounded border border-border">
      {diff.map((line, idx) => {
        if (line.type === 'context') {
          return (
            <div key={idx} className="px-2 text-muted-foreground/80 whitespace-pre">
              {line.text || ' '}
            </div>
          );
        }
        if (line.type === 'add') {
          return (
            <div
              key={idx}
              className="px-2 bg-green-500/10 border-l-2 border-green-500 text-green-700 dark:text-green-400 whitespace-pre"
            >
              + {line.text || ' '}
            </div>
          );
        }
        return (
          <div
            key={idx}
            className="px-2 bg-red-500/10 border-l-2 border-red-500 text-red-700 dark:text-red-400 line-through whitespace-pre"
          >
            - {line.text || ' '}
          </div>
        );
      })}
    </pre>
  );
};
