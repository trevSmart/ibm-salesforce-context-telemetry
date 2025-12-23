# Dashboard Loading Requests

This document lists all the HTTP requests made when loading the dashboard page of the IBM Salesforce Context Telemetry Server.

## Overview

The dashboard loads in multiple phases:
1. **Initial HTML document** - Main page structure
2. **Stylesheets** - CSS files for styling
3. **JavaScript modules** - Client-side functionality
4. **Fonts** - Typography assets
5. **API calls** - Data fetching for dashboard content
6. **Assets** - Images and additional resources

## Requests by Category

### Document
| Resource | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|--------|--------|----------|--------|-----------|------|------|
| `/` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | document | 3.8 kB | 512 ms |

### Stylesheets
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| output.css | `/css/output.css` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | stylesheet | 28.6 kB | 107 ms |
| all.min.css | `/vendor/fontawesome/css/all.min.css` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | stylesheet | 21.2 kB | 54 ms |
| v4-shims.min.css | `/vendor/fontawesome/css/v4-shims.min.css` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | stylesheet | 4.5 kB | 92 ms |

### JavaScript Files
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| elements@1 | `/npm/@tailwindplus/elements@1` | GET | 200 | h3 | cdn.jsdelivr.net | script | 24.8 kB | 93 ms |
| notifications.js | `/js/notifications.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 2.6 kB | 54 ms |
| index.js | `/js/index.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 16.2 kB | 96 ms |
| tool-usage-chart.js | `/js/tool-usage-chart.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 2.8 kB | 92 ms |
| polyfills.js | `/js/polyfills.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 0.6 kB | 51 ms |
| command-palette.js | `/js/command-palette.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 8.1 kB | 81 ms |
| header.js | `/js/header.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 3.9 kB | 105 ms |
| echarts.min.js | `/vendor/echarts/echarts.min.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 334 kB | 156 ms |
| navigation.js | `/js/navigation.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 4.6 kB | 82 ms |
| csrf-helper.js | `/js/csrf-helper.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 1.3 kB | 156 ms |
| user-menu.js | `/js/user-menu.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 4.4 kB | 37 ms |
| settings-modal.js | `/js/settings-modal.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 13.7 kB | 52 ms |

### Fonts
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| Manrope-VariableFont_wght.ttf | `/fonts/Manrope/Manrope-VariableFont_wght.ttf` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | font | 68.7 kB | 91 ms |
| fa-solid-900.woff2 | `/vendor/fontawesome/webfonts/fa-solid-900.woff2` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | font | 113 kB | 190 ms |

### API Calls
| Endpoint | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| Authentication Status | `/api/auth/status` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 527 ms |
| Tool Usage Stats | `/api/tool-usage-stats?days=30` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 652 ms |
| Daily Stats | `/api/daily-stats?days=30&byEventType=true` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.6 kB | 941 ms |
| Top Users Today | `/api/top-users-today?days=14&limit=3` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 695 ms |
| Top Teams Today | `/api/top-teams-today?days=30&limit=5` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.8 kB | 826 ms |
| Database Size | `/api/database` | GET | - | h3 | ibm-salesforce-context-telemetry.onrender.com | - | - | - |

### Images & Assets
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| IBM Logo | `/resources/ibm.webp` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 4.1 kB | 378 ms |
| Favicon | `/resources/favicon.svg` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | svg+xml | 2.3 kB | 40 ms |
| Team Logo (ID: 4) | `/api/teams/4/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 2.0 kB | 773 ms |
| Team Logo (ID: 7) | `/api/teams/7/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.5 kB | 700 ms |
| Team Logo (ID: 6) | `/api/teams/6/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.2 kB | 772 ms |
| Team Logo (ID: 2) | `/api/teams/2/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 2.2 kB | 700 ms |
| Team Logo (ID: 3) | `/api/teams/3/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.8 kB | 769 ms |

## Performance Summary

- **Total requests**: 27
- **Total transfer size**: ~654 kB
- **Largest file**: echarts.min.js (334 kB)
- **Slowest request**: Daily Stats API (941 ms)
- **Fastest request**: Settings Modal JS (37 ms)

## Loading Order Analysis

1. **HTML Document** (512ms) - Base page loads
2. **Stylesheets** (54-107ms) - CSS loads in parallel
3. **JavaScript Libraries** (51-156ms) - Core dependencies load
4. **Authentication Check** (527ms) - User status verification
5. **Dashboard Data APIs** (652-941ms) - Main dashboard data fetches
6. **Team Logos** (700-773ms) - Visual assets load last
7. **Fonts** (91-190ms) - Typography loads throughout

## Navigation to Logs Page

This section documents the HTTP requests made when navigating from the dashboard to the logs page.

### Authentication & Assets
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| Auth Status | `/api/auth/status` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 1.89 s |
| Team Logo (ID: 4) | `/api/teams/4/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 2.0 kB | 2.03 s |
| Team Logo (ID: 7) | `/api/teams/7/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.5 kB | 3.66 s |
| Team Logo (ID: 6) | `/api/teams/6/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.2 kB | 2.03 s |
| Team Logo (ID: 2) | `/api/teams/2/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 2.2 kB | 1.77 s |
| Team Logo (ID: 3) | `/api/teams/3/logo` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.8 kB | 2.67 s |

### Page Load
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| Logs Page | `/logs` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 4.8 kB | 2.35 s |
| Event Log Script | `/js/event-log.js` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | script | 41.8 kB | 146 ms |

### UI Assets
| Resource | Path | Method | Status | Protocol | Domain | Initiator | Size | Time |
|----------|------|--------|--------|----------|--------|-----------|------|------|
| Sort Desc Icon | `/resources/sort-desc` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | svg+xml | 0.6 kB | 405 ms |
| Colors Image | `/resources/colors.webp` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.6 kB | 2.69 s |
| OK Status Icon | `/resources/ok.png` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 1.3 kB | 66 ms |
| KO Status Icon | `/resources/ko.png` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | webp | 2.2 kB | 69 ms |

### API Data Loading
| Endpoint | Path | Method | Status | Protocol | Domain | Initiator | Size | Time | Notes |
|----------|------|--------|--------|----------|--------|-----------|------|------|-------|
| Auth Status | `/api/auth/status` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 513 ms | Page initialization |
| Event Types | `/api/event-types` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 776 ms | Available event types |
| Sessions | `/api/sessions?limit=50&includeUsersWithoutSessions=true` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 2.6 kB | 1.03 s | Session data |
| Events | `/api/events?limit=50&offset=0&orderBy=created_at&order=DESC` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 3.6 kB | 2.53 s | Recent events |
| Team Stats | `/api/team-stats` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.7 kB | 792 ms | Team statistics |
| Telemetry Users | `/api/telemetry-users?limit=50` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 1.7 kB | 774 ms | User list |
| Sessions (duplicate) | `/api/sessions?limit=50&includeUsersWithoutSessions=true` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 2.6 kB | 3.49 s | Data refresh |
| Telemetry Users (duplicate) | `/api/telemetry-users?limit=50` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 1.7 kB | 3.06 s | Data refresh |
| Event Types (duplicate) | `/api/event-types` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 640 ms | Data refresh |
| Events (duplicate) | `/api/events?limit=50&offset=0&orderBy=created_at&order=DESC` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 3.6 kB | 2.15 s | Data refresh |
| Team Stats (duplicate) | `/api/team-stats` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.7 kB | 2.13 s | Data refresh |
| Telemetry Users (subset) | `/api/telemetry-users` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 1.7 kB | 730 ms | Filtered data |
| Telemetry Users (subset) | `/api/telemetry-users` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 1.7 kB | 587 ms | Filtered data |
| Database Size | `/api/database-size` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 668 ms | DB statistics |
| Database Size (duplicate) | `/api/database-size` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 0.5 kB | 716 ms | DB statistics |
| Events (large batch) | `/api/events?limit=1000&orderBy=created_at&order=ASC` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 18.6 kB | 1.33 s | Chart data |
| Events (large batch duplicate) | `/api/events?limit=1000&orderBy=created_at&order=ASC` | GET | 200 | h3 | ibm-salesforce-context-telemetry.onrender.com | fetch | 18.6 kB | 1.32 s | Chart data |

## Navigation Performance Summary

- **Total requests**: 25
- **Total transfer size**: ~103 kB
- **Largest file**: event-log.js (41.8 kB)
- **Slowest request**: Team Logo (ID: 7) (3.66 s)
- **Most data-intensive**: Large events batch (18.6 kB)

## Performance Optimizations Implemented

After analyzing the excessive API calls during navigation, several optimizations were implemented:

### 1. Authentication Caching
- **Before**: Every page load made a fresh `/api/auth/status` call
- **After**: Checks for existing `window.__cachedAuthData` from previous page loads
- **Impact**: Eliminates redundant authentication checks during navigation

### 2. Global Data Cache System
- **Implementation**: Added `window.__globalDataCache` to share data between page navigations
- **Cache Duration**: 5 minutes for most data, 30 seconds for frequently changing data (database size)
- **Cached Endpoints**:
  - `/api/sessions` (without filters)
  - `/api/telemetry-users`
  - `/api/event-types` (without filters)
  - `/api/team-stats`
  - `/api/database-size`

### 3. Smart Cache Usage
- Only caches data when no filters are applied
- Bypasses cache when user filters or custom parameters are used
- Provides console logging when cache is used for debugging

### Expected Performance Improvements
- **Navigation time**: Reduced from ~25 requests to ~10-15 requests
- **Data transfer**: Reduced from ~103 kB to ~50-70 kB
- **API load**: Significantly reduced duplicate calls for same data
- **User experience**: Faster page transitions between dashboard and logs

## Notes

- All requests use HTTP/3 (h3) protocol
- External CDN used only for Tailwind Elements (@tailwindplus/elements@1)
- Font Awesome fonts load on-demand
- API calls are authenticated and include CSRF protection
- Team logos are loaded dynamically based on dashboard data
- Status icons (OK/KO) are loaded multiple times, likely due to dynamic status updates
- Large event data batches (1000 records) are still loaded for chart visualization (necessary for functionality)