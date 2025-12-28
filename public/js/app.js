/**
 * Main Application Module
 * Coordinates all modules and sets up event listeners
 */

import {openSettingsModal} from './settings-modal.js';
import {toggleTheme, initializeTheme} from './theme.js';

// Export openSettingsModal to window for command palette and other global access
window.openSettingsModal = openSettingsModal;

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {

    // Initialize theme from localStorage
    initializeTheme();

    // Set up event listeners for settings modal
    setupSettingsModalListeners();

    // Set up theme toggle listeners
    setupThemeToggleListeners();

    // Set up global ESC handler for inputs
    setupInputEscHandler();

});

/**
 * Set up global ESC key handler for input fields
 * - If input has value: clear it and stop propagation
 * - If input has no value: allow propagation (let ESC work normally for modals, etc.)
 * - Exception: command palette input should close the palette instead of clearing
 */
function setupInputEscHandler() {
    // Use capture phase to intercept before other handlers
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') {
            return;
        }

        const activeElement = document.activeElement;

        // Only handle INPUT and TEXTAREA elements
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            // Special case: command palette input should close the palette
            if (activeElement.id === 'commandPaletteInput') {
                // Check if command palette is open
                if (typeof window.isCommandPaletteOpen === 'function' && window.isCommandPaletteOpen()) {
                    // Close the palette instead of clearing the input
                    if (typeof window.hideCommandPalette === 'function') {
                        window.hideCommandPalette();
                    }
                    e.stopPropagation();
                    return;
                }
            }

            const hasValue = activeElement.value && activeElement.value.trim().length > 0;

            if (hasValue) {
                // Clear the input value
                activeElement.value = '';

                // Trigger input event to notify any listeners
                activeElement.dispatchEvent(new Event('input', {bubbles: true}));

                // Stop propagation so ESC doesn't trigger other handlers (like closing modals)
                e.stopPropagation();
            }
            // If no value, let the event propagate normally (don't intercept)
        }
    }, true); // Use capture phase
}

/**
 * Set up event listeners for the settings modal
 */
function setupSettingsModalListeners() {
    // Listen for settings modal triggers
    document.addEventListener('click', (e) => {
        if (e.target.matches('[data-action="open-settings"], [onclick*="openSettingsModal"]') ||
            e.target.closest('[data-action="open-settings"], [onclick*="openSettingsModal"]')) {
            e.preventDefault();
            openSettingsModal();
        }
    });
}

/**
 * Set up event listeners for theme toggle
 */
function setupThemeToggleListeners() {
    // Listen for theme toggle triggers
    document.addEventListener('click', (e) => {
        if (e.target.matches('[onclick*="toggleTheme"], #themeToggleMenuItem') ||
            e.target.closest('[onclick*="toggleTheme"], #themeToggleMenuItem')) {
            e.preventDefault();
            toggleTheme();
        }
    });
}