/**
 * Shared notification (toast) system.
 * Injects a live region once and reuses it for every message.
 */
const NOTIFICATION_DEFAULT_DURATION_MS = 4500;

const NOTIFICATION_ICONS = {
	success: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" class="ct-toast-icon ct-toast-icon-success">
      <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
	error: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" class="ct-toast-icon ct-toast-icon-error">
      <path d="M12 9v3.75m0 3v.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,
	info: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" class="ct-toast-icon ct-toast-icon-info">
      <path d="M12 9h.008v.008H12V9Zm0 3v3m9-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `
};

function ensureNotificationStyles() {
	if (document.getElementById('ct-toast-styles')) {return;}
	const style = document.createElement('style');
	style.id = 'ct-toast-styles';
	style.textContent = `
    .ct-toast-region {
      pointer-events: none;
      position: fixed;
      inset: 0;
      display: flex;
      align-items: flex-end;
      padding: 24px 16px;
      z-index: 10000;
    }
    @media (min-width: 640px) {
      .ct-toast-region {
        align-items: flex-start;
        padding: 24px;
      }
    }
    .ct-toast-stack {
      display: flex;
      width: 100%;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    @media (min-width: 640px) {
      .ct-toast-stack {
        align-items: flex-end;
      }
    }
    .ct-toast-panel {
      pointer-events: auto;
      width: 100%;
      max-width: 420px;
      background: #ffffff;
      color: #111827;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.12);
      outline: 1px solid rgba(0,0,0,0.05);
      transform: translateY(8px);
      opacity: 0;
      transition: opacity 220ms ease, transform 220ms ease;
    }
    .ct-toast-panel.ct-visible {
      transform: translateY(0);
      opacity: 1;
    }
    .ct-toast-panel.ct-leaving {
      transform: translateY(8px);
      opacity: 0;
    }
    @media (min-width: 640px) {
      .ct-toast-panel {
        transform: translate(8px, 0);
      }
      .ct-toast-panel.ct-visible {
        transform: translate(0, 0);
      }
      .ct-toast-panel.ct-leaving {
        transform: translate(8px, 0);
      }
    }
    .ct-toast-body {
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .ct-toast-icon {
      width: 24px;
      height: 24px;
      stroke: currentColor;
    }
    .ct-toast-icon-success { color: #22c55e; }
    .ct-toast-icon-error { color: #f87171; }
    .ct-toast-icon-info { color: #38bdf8; }
    .ct-toast-text {
      flex: 1;
      min-width: 0;
      padding-top: 2px;
    }
    .ct-toast-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: inherit;
    }
    .ct-toast-desc {
      margin: 4px 0 0 0;
      font-size: 0.9rem;
      color: #6b7280;
    }
    .ct-toast-close {
      border: none;
      background: none;
      color: #9ca3af;
      padding: 4px;
      border-radius: 8px;
      cursor: pointer;
    }
    .ct-toast-close:hover {
      color: #4b5563;
      background: rgba(0,0,0,0.04);
    }
    .ct-toast-close:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }
    .ct-toast-close-icon {
      width: 20px;
      height: 20px;
      display: block;
    }
    .dark .ct-toast-panel {
      background: #111827;
      color: #e5e7eb;
      outline-color: rgba(255,255,255,0.08);
      box-shadow: 0 10px 25px rgba(0,0,0,0.45);
    }
    .dark .ct-toast-desc {
      color: #9ca3af;
    }
    .dark .ct-toast-close {
      color: #9ca3af;
    }
    .dark .ct-toast-close:hover {
      color: #e5e7eb;
      background: rgba(255,255,255,0.06);
    }
  `;
	document.head.appendChild(style);
}

function ensureNotificationRegion() {
	let region = document.getElementById('ct-toast-region');
	let stack = document.getElementById('ct-toast-stack');

	if (!region) {
		region = document.createElement('div');
		region.id = 'ct-toast-region';
		region.className = 'ct-toast-region pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6';
		region.setAttribute('aria-live', 'assertive');
		region.setAttribute('aria-atomic', 'true');

		stack = document.createElement('div');
		stack.id = 'ct-toast-stack';
		stack.className = 'ct-toast-stack flex w-full flex-col items-center space-y-4 sm:items-end';

		region.appendChild(stack);
		document.body.appendChild(region);
	}

	return {region, stack};
}

function buildIcon(type) {
	return NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info;
}

function renderToast(title, type, description) {
	const {stack} = ensureNotificationRegion();

	const panel = document.createElement('div');
	panel.className = 'ct-toast-panel pointer-events-auto w-full max-w-sm translate-y-0 transform rounded-lg bg-white opacity-100 shadow-lg outline-1 outline-black/5 transition duration-300 ease-out sm:translate-x-0';
	panel.setAttribute('role', 'status');

	panel.innerHTML = `
    <div class="ct-toast-body p-4">
      <div class="ct-toast-icon-wrapper">
        ${buildIcon(type)}
      </div>
      <div class="ct-toast-text">
        <p class="ct-toast-title">${title}</p>
        ${description ? `<p class="ct-toast-desc">${description}</p>` : ''}
      </div>
      <div class="ct-toast-actions">
        <button type="button" class="ct-toast-close" aria-label="Close notification">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" class="ct-toast-close-icon">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </div>
  `;

	stack.appendChild(panel);

	requestAnimationFrame(() => {
		panel.classList.add('ct-visible');
	});

	const removePanel = () => {
		panel.classList.remove('ct-visible');
		panel.classList.add('ct-leaving');
		const cleanup = () => panel.remove();
		panel.addEventListener('transitionend', cleanup, {once: true});
		setTimeout(cleanup, 350);
	};

	const closeButton = panel.querySelector('.ct-toast-close');
	if (closeButton) {
		closeButton.addEventListener('click', removePanel);
	}

	return {panel, remove: removePanel};
}

export function showToast(title, type = 'info', description) {
	ensureNotificationStyles();
	const resolvedTitle = title || 'Notification';
	const resolvedDescription = typeof description === 'string' && description.trim() !== ''? description: resolvedTitle;
	const duration = NOTIFICATION_DEFAULT_DURATION_MS;

	const {remove} = renderToast(resolvedTitle, type, resolvedDescription);

	if (duration > 0) {
		setTimeout(remove, duration);
	}

	return {dismiss: remove};
}

// Expose globally for non-module scripts
if (typeof window !== 'undefined') {
	window.showToast = showToast;
}
