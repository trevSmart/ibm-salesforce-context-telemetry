/**
 * ResizableColumns - Vanilla JavaScript implementation
 * Makes table columns resizable by dragging
 */
class ResizableColumns {
  constructor(table, options = {}) {
    this.table = table;
    this.options = {
      store: options.store || null,
      minWidth: options.minWidth || 48,
      ...options
    };

    this.tableId = table.getAttribute('data-resizable-columns-id');
    this.columns = [];
    this.activeColumn = null;
    this.startX = 0;
    this.startWidth = 0;
    this.previewLine = null;
    this.currentWidth = 0;

    this.init();
  }

  init() {
    // Set table layout to fixed
    this.table.style.tableLayout = 'fixed';

    // Get all header cells
    const headerRow = this.table.querySelector('thead tr');
    if (!headerRow) return;

    const headers = Array.from(headerRow.querySelectorAll('th'));

    // Restore saved widths if store is available
    const savedWidths = this.loadWidths();

    headers.forEach((th, index) => {
      const columnId = th.getAttribute('data-resizable-column-id');

      // Set initial width from saved state or current width
      if (savedWidths && columnId && savedWidths[columnId]) {
        th.style.width = savedWidths[columnId] + 'px';
      } else if (!th.style.width) {
        th.style.width = th.offsetWidth + 'px';
      }

      // Don't add resizer to the last column or columns without ID
      if (index < headers.length - 1 && columnId) {
        const resizer = this.createResizer();
        th.style.position = 'relative';
        th.appendChild(resizer);

        this.columns.push({
          header: th,
          resizer: resizer,
          columnId: columnId
        });

        this.attachResizerEvents(resizer, th);
      }
    });
  }

  createResizer() {
    const resizer = document.createElement('div');
    resizer.className = 'column-resizer';
    resizer.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 4px;
      height: 100%;
      cursor: col-resize;
      user-select: none;
      z-index: 1;
    `;

    // Add hover effect
    resizer.addEventListener('mouseenter', () => {
      resizer.style.background = 'rgba(59, 130, 246, 0.3)';
    });

    resizer.addEventListener('mouseleave', () => {
      if (!this.activeColumn) {
        resizer.style.background = '';
      }
    });

    return resizer;
  }

  attachResizerEvents(resizer, header) {
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      this.activeColumn = header;
      this.startX = e.pageX;
      this.startWidth = header.offsetWidth;
      this.currentWidth = this.startWidth;

      // Cache position calculations
      const tableContainer = this.table.closest('.logs-table-container');
      const containerRect = tableContainer ? tableContainer.getBoundingClientRect() : this.table.getBoundingClientRect();
      const headerRect = this.activeColumn.getBoundingClientRect();

      // Use the container's CLIENT height (visible area), not scroll height (total content)
      this.cachedPositions = {
        containerTop: containerRect.top,
        containerHeight: tableContainer ? tableContainer.clientHeight : containerRect.height,
        initialLeft: headerRect.right
      };

      // Create preview line
      this.createPreviewLine();

      resizer.style.background = 'rgba(59, 130, 246, 0.5)';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('mouseup', this.handleMouseUp);
    });
  }

  createPreviewLine() {
    // Create a visual indicator line
    this.previewLine = document.createElement('div');
    this.previewLine.className = 'column-resize-preview';

    this.previewLine.style.cssText = `
      position: fixed;
      top: ${this.cachedPositions.containerTop}px;
      left: ${this.cachedPositions.initialLeft}px;
      width: 2px;
      height: ${this.cachedPositions.containerHeight}px;
      background: rgba(59, 130, 246, 0.8);
      z-index: 9999;
      pointer-events: none;
      box-shadow: 0 0 4px rgba(59, 130, 246, 0.5);
    `;

    document.body.appendChild(this.previewLine);
  }

  updatePreviewLine(diff) {
    if (!this.previewLine) return;

    // Simple calculation without DOM queries
    const newLeft = this.cachedPositions.initialLeft + diff;
    this.previewLine.style.left = newLeft + 'px';
  }

  removePreviewLine() {
    if (this.previewLine && this.previewLine.parentNode) {
      this.previewLine.parentNode.removeChild(this.previewLine);
      this.previewLine = null;
    }
  }

  handleMouseMove = (e) => {
    if (!this.activeColumn) return;

    const diff = e.pageX - this.startX;
    const newWidth = Math.max(this.options.minWidth, this.startWidth + diff);

    // Only update the preview line, not the actual column
    this.currentWidth = newWidth;
    this.updatePreviewLine(diff);
  }

  handleMouseUp = () => {
    if (!this.activeColumn) return;

    const resizer = this.activeColumn.querySelector('.column-resizer');
    if (resizer) {
      resizer.style.background = '';
    }

    // Now apply the actual width change
    if (this.currentWidth !== this.startWidth) {
      this.activeColumn.style.width = this.currentWidth + 'px';
    }

    // Remove preview line
    this.removePreviewLine();

    // Save widths to store
    this.saveWidths();

    this.activeColumn = null;
    this.currentWidth = 0;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

  saveWidths() {
    if (!this.options.store || !this.tableId) return;

    const widths = {};
    this.columns.forEach(col => {
      if (col.columnId) {
        widths[col.columnId] = col.header.offsetWidth;
      }
    });

    this.options.store.set(`resizableColumns-${this.tableId}`, widths);
  }

  loadWidths() {
    if (!this.options.store || !this.tableId) return null;

    return this.options.store.get(`resizableColumns-${this.tableId}`);
  }

  destroy() {
    this.columns.forEach(col => {
      if (col.resizer && col.resizer.parentNode) {
        col.resizer.parentNode.removeChild(col.resizer);
      }
    });

    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }
}

// Simple localStorage store implementation
window.resizableColumnsStore = {
  get: function(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  },
  set: function(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Failed to save column widths:', e);
    }
  }
};

// Export for use in modules or global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResizableColumns;
} else {
  window.ResizableColumns = ResizableColumns;
}
