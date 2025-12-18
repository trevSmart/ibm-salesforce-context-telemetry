# Database Optimization Report

Based on PGHero analysis of production database on Render (December 2025).

## Issues Identified

### Duplicate Indexes
These indexes were redundant and have been removed to improve write performance:

| Table | Removed Index | Covered By |
|-------|---------------|------------|
| `person_usernames` | `idx_username_person (username)` | `person_usernames_username_org_id_key (username, org_id)` |
| `remember_tokens` | `idx_remember_token_hash (token_hash)` | `remember_tokens_token_hash_key (token_hash)` |
| `team_event_users` | `idx_team_event_users_team_id (team_id)` | `team_event_users_team_id_user_name_key (team_id, user_name)` |
| `teams` | `idx_teams_name (name)` | `teams_name_key (name)` |
| `telemetry_events` | `idx_created_at (created_at)` | `idx_created_at_org_id (created_at, org_id)` |
| `telemetry_events` | `idx_event (event)` | `idx_event_created_at (event, created_at)` |
| `telemetry_events` | `idx_org_id (org_id)` | `idx_org_id_created_at (org_id, created_at)` |
| `telemetry_events` | `idx_timestamp (timestamp)` | `idx_timestamp_event (timestamp, event)` |
| `telemetry_events` | `idx_user_id (user_id)` | `idx_user_created_at (user_id, created_at)` |
| `users` | `idx_username (username)` | `users_username_key (username)` |

### Slow Queries

#### Query 1: Session Aggregates (185ms average, 349 calls)
```sql
WITH session_aggregates AS (
    SELECT
        COALESCE(parent_session_id, session_id) AS logical_session_id,
        COUNT(*) as count,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event,
        SUM(CASE WHEN event = $1 THEN $2 ELSE $3 END) as has_start,
        SUM(CASE WHEN event = $4 THEN $5 ELSE $6 END) as has_end
    FROM telemetry_events
    WHERE session_id IS NOT NULL OR parent_session_id IS NOT NULL
    GROUP BY COALESCE(parent_session_id, session_id)
)
SELECT ... FROM session_aggregates sa
ORDER BY sa.last_event DESC
```

**Issues:**
- Correlated subqueries for each session
- COALESCE in GROUP BY not using optimal indexes
- No efficient way to lookup session start data

**Optimizations Added:**
- `idx_session_logical`: `(COALESCE(parent_session_id, session_id), timestamp)` for GROUP BY and MIN/MAX
- `idx_session_user_timestamp`: `(COALESCE(parent_session_id, session_id), timestamp, user_id)` for user lookup
- `idx_session_event_timestamp`: `(COALESCE(parent_session_id, session_id), event, timestamp)` for session start data

#### Query 2: Pagination Query (25ms average, 417 calls)
```sql
SELECT id, event, timestamp, server_id, version, session_id, user_id, data, received_at, created_at
FROM telemetry_events
WHERE $3=$4
ORDER BY created_at ASC
LIMIT $1 OFFSET $2
```

**Issues:**
- ORDER BY created_at could be optimized further

**Optimizations Added:**
- Ensured `idx_pagination_created_at (created_at)` exists for efficient pagination

## Migration Script

Run the optimization script:

```bash
node src/scripts/optimize-database-indexes.js
```

The script will:
1. Remove all duplicate indexes safely (using `DROP INDEX IF EXISTS`)
2. Add performance indexes for slow queries
3. Provide fallback indexes if COALESCE indexes fail (COALESCE cannot be used in index definitions)

## Expected Impact

- **Write Performance**: Improved by removing duplicate indexes (fewer indexes to maintain)
- **Read Performance**: Improved for session-related queries and pagination
- **Storage**: Reduced storage usage from duplicate indexes
- **Maintenance**: Faster index rebuilds and vacuums

## Monitoring

After deployment:
1. Check PGHero for improved query times
2. Monitor for any regression in query performance
3. Consider running `ANALYZE` on affected tables if needed
4. Review slow query logs in the following days

## Rollback Plan

If issues arise:
1. The script uses `IF EXISTS` clauses, so re-running won't cause issues
2. Missing indexes can be recreated if needed
3. Duplicate indexes won't be recreated unless the application schema changes

## Testing

Test locally before production deployment:
1. Export production data (anonymized)
2. Import to local PostgreSQL instance
3. Run the optimization script
4. Verify queries still work correctly
5. Check EXPLAIN plans for improved performance