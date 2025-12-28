#!/bin/bash

# Script to setup pg_stat_statements for local PostgreSQL
# This script helps configure PostgreSQL to enable pg_stat_statements extension

set -e

echo "🔧 Setting up pg_stat_statements for local PostgreSQL"
echo ""

# Detect PostgreSQL version and installation method
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    echo "✅ Found PostgreSQL version: $PSQL_VERSION"
else
    echo "❌ Error: psql not found. Please install PostgreSQL first."
    exit 1
fi

# Find postgresql.conf location
echo ""
echo "🔍 Finding postgresql.conf..."

# Try different common locations
CONF_FILE=""
if [ -f "/opt/homebrew/var/postgresql@${PSQL_VERSION}/postgresql.conf" ]; then
    CONF_FILE="/opt/homebrew/var/postgresql@${PSQL_VERSION}/postgresql.conf"
elif [ -f "/usr/local/var/postgresql@${PSQL_VERSION}/postgresql.conf" ]; then
    CONF_FILE="/usr/local/var/postgresql@${PSQL_VERSION}/postgresql.conf"
elif [ -f "$HOME/Library/Application Support/Postgres/var-${PSQL_VERSION}/postgresql.conf" ]; then
    CONF_FILE="$HOME/Library/Application Support/Postgres/var-${PSQL_VERSION}/postgresql.conf"
else
    # Try to get it from PostgreSQL
    CONF_FILE=$(psql -U postgres -t -c "SHOW config_file;" 2>/dev/null | xargs || echo "")
fi

if [ -z "$CONF_FILE" ] || [ ! -f "$CONF_FILE" ]; then
    echo "❌ Error: Could not find postgresql.conf"
    echo ""
    echo "Please find it manually with:"
    echo "  psql -U postgres -c 'SHOW config_file;'"
    echo ""
    echo "Or check common locations:"
    echo "  - /opt/homebrew/var/postgresql@${PSQL_VERSION}/postgresql.conf (Homebrew Apple Silicon)"
    echo "  - /usr/local/var/postgresql@${PSQL_VERSION}/postgresql.conf (Homebrew Intel)"
    exit 1
fi

echo "✅ Found: $CONF_FILE"
echo ""

# Check if already configured
if grep -q "shared_preload_libraries.*pg_stat_statements" "$CONF_FILE" 2>/dev/null; then
    echo "✅ pg_stat_statements is already in shared_preload_libraries"
    NEEDS_RESTART=true
elif grep -q "^shared_preload_libraries" "$CONF_FILE" 2>/dev/null; then
    echo "⚠️  shared_preload_libraries exists but doesn't include pg_stat_statements"
    echo "   Current value:"
    grep "^shared_preload_libraries" "$CONF_FILE" | head -1
    echo ""
    echo "   You need to manually edit $CONF_FILE and add 'pg_stat_statements' to the list"
    exit 1
else
    echo "📝 Adding shared_preload_libraries configuration..."
    
    # Backup the config file
    BACKUP_FILE="${CONF_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$CONF_FILE" "$BACKUP_FILE"
    echo "✅ Backup created: $BACKUP_FILE"
    
    # Add the configuration
    echo "" >> "$CONF_FILE"
    echo "# Added by setup-pg-stat-statements-local.sh" >> "$CONF_FILE"
    echo "shared_preload_libraries = 'pg_stat_statements'" >> "$CONF_FILE"
    echo "✅ Configuration added to postgresql.conf"
    NEEDS_RESTART=true
fi

if [ "$NEEDS_RESTART" = true ]; then
    echo ""
    echo "🔄 PostgreSQL needs to be restarted for changes to take effect"
    echo ""
    
    # Detect service manager
    if command -v brew &> /dev/null; then
        echo "To restart PostgreSQL (Homebrew):"
        echo "  brew services restart postgresql@${PSQL_VERSION}"
        echo ""
        read -p "Restart PostgreSQL now? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            brew services restart "postgresql@${PSQL_VERSION}"
            echo "✅ PostgreSQL restarted"
            sleep 2
        else
            echo "⚠️  Please restart PostgreSQL manually before continuing"
            exit 0
        fi
    else
        echo "Please restart PostgreSQL manually using your system's service manager"
        exit 0
    fi
fi

echo ""
echo "📦 Creating pg_stat_statements extension in database..."
echo ""

# Get database name from DATABASE_URL or use default
DB_NAME="telemetry_local"
if [ -f .env ]; then
    DB_URL=$(grep "^DATABASE_URL=" .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    if [ ! -z "$DB_URL" ]; then
        DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    fi
fi

echo "Using database: $DB_NAME"
echo ""

# Try to create extension
if psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" 2>/dev/null; then
    echo "✅ Extension created successfully!"
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "You can now query statistics with:"
    echo "  npm run pg-stat-statements"
else
    echo "❌ Failed to create extension"
    echo ""
    echo "Make sure:"
    echo "  1. PostgreSQL has been restarted after configuration"
    echo "  2. You have permissions to create extensions"
    echo "  3. The database '$DB_NAME' exists"
    echo ""
    echo "Try manually:"
    echo "  psql -d $DB_NAME -c \"CREATE EXTENSION pg_stat_statements;\""
    exit 1
fi
