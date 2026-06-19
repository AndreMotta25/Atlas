import { ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

/**
 * ViewPlugin that shows the current section heading as a sticky bar
 * at the top of the editor when the heading scrolls out of view.
 */
const stickyHeaderPlugin = ViewPlugin.fromClass(
  class {
    el: HTMLDivElement;

    constructor(view: EditorView) {
      this.el = document.createElement('div');
      this.el.className = 'atlas-sticky-header';
      view.dom.appendChild(this.el);
      this.el.style.display = 'none';
      this.updateHeading(view);
    }

    update(update: ViewUpdate) {
      if (update.viewportChanged || update.docChanged) {
        this.updateHeading(update.view);
      }
    }

    updateHeading(view: EditorView) {
      const visibleFrom = view.viewport.from;
      const doc = view.state.doc;

      // Find the line at the top of the viewport
      const topLine = doc.lineAt(visibleFrom);

      // Walk backwards from the top line to find a heading
      for (let i = topLine.number; i >= 1; i--) {
        const line = doc.line(i);
        const match = /^(#{1,6})\s/.exec(line.text);
        if (match) {
          // If this heading line is above the viewport, show sticky header
          if (line.from < visibleFrom) {
            const clean = line.text.replace(/^#+\s*/, '');
            this.el.textContent = clean;
            this.el.style.display = 'block';
            return;
          }
          // Heading is visible — no sticky needed
          break;
        }
      }

      // No heading found above viewport
      this.el.style.display = 'none';
    }

    destroy() {
      this.el.remove();
    }
  },
);

export { stickyHeaderPlugin };
