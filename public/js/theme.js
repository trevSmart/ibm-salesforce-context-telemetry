/**
 * Theme Management Module
 * Handles theme switching and persistence
 */

/**
 * Toggle between light and dark themes
 */
export function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

/**
 * Apply a specific theme to the document
 * @param {string} theme - 'light' or 'dark'
 */
export function applyTheme(theme) {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);

    // Update theme color meta tag for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#1f2937' : '#ffffff');
    }
}

/**
 * Initialize theme on page load
 */
export function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
}

/**
 * Update theme toggle menu item icon and label
 * @param {string} theme - Current theme
 */
export function updateThemeMenuItem(theme) {
    const btn = document.getElementById('themeToggleMenuItem');
    if (!btn) {
        return;
    }

    const isDark = theme === 'dark';
    const icon = isDark ? getLightThemeIcon() : getDarkThemeIcon();
    const label = isDark ? 'Light theme' : 'Dark theme';

    // Update the button content
    const iconSpan = btn.querySelector('svg') || btn.querySelector('span:first-child');
    const labelSpan = btn.querySelector('span:last-child');

    if (iconSpan && iconSpan.tagName === 'svg') {
        iconSpan.outerHTML = icon;
    }
    if (labelSpan) {
        labelSpan.textContent = label;
    }
}

function getLightThemeIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>`;
}

function getDarkThemeIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="user-menu-icon" width="16" height="16" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>`;
}