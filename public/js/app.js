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

});

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