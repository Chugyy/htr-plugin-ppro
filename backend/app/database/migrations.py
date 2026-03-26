"""Automatic migration system."""

from pathlib import Path
import asyncpg
from config.logger import logger
from app.database.db import get_async_db_connection


async def init_migrations_table():
    conn = await get_async_db_connection()
    try:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
    finally:
        await conn.close()


async def get_applied_migrations() -> set:
    conn = await get_async_db_connection()
    try:
        rows = await conn.fetch("SELECT filename FROM _migrations ORDER BY id")
        return {row['filename'] for row in rows}
    finally:
        await conn.close()


async def mark_migration_applied(filename: str):
    conn = await get_async_db_connection()
    try:
        await conn.execute(
            "INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
            filename
        )
    finally:
        await conn.close()


def parse_sql_statements(sql: str) -> list:
    statements = []
    current_stmt = []
    in_dollar_quote = False

    for line in sql.split('\n'):
        stripped = line.strip()
        if not stripped or stripped.startswith('--'):
            continue

        if '$$' in line:
            if not in_dollar_quote:
                in_dollar_quote = True
                current_stmt.append(line)
            else:
                current_stmt.append(line)
                in_dollar_quote = False
        elif in_dollar_quote:
            current_stmt.append(line)
        else:
            if ';' in line:
                parts = line.split(';')
                current_stmt.append(parts[0])
                stmt = '\n'.join(current_stmt).strip()
                if stmt:
                    statements.append(stmt)
                current_stmt = []
                if len(parts) > 1 and parts[1].strip():
                    current_stmt.append(parts[1])
            else:
                current_stmt.append(line)

    if current_stmt:
        stmt = '\n'.join(current_stmt).strip()
        if stmt:
            statements.append(stmt)

    return statements


async def run_migration(filepath: Path):
    conn = await get_async_db_connection()
    try:
        with open(filepath, 'r') as f:
            sql = f.read()

        for stmt in parse_sql_statements(sql):
            try:
                if stmt.strip():
                    await conn.execute(stmt)
            except asyncpg.exceptions.DuplicateTableError:
                pass
            except asyncpg.exceptions.DuplicateObjectError:
                pass
            except Exception as e:
                if 'does not exist' in str(e) and any(x in stmt.upper() for x in ['DROP TABLE', 'DROP FUNCTION', 'DROP INDEX']):
                    pass
                else:
                    logger.error(f"SQL error: {e}")
                    raise

        await mark_migration_applied(filepath.name)
        logger.info(f"Migration applied: {filepath.name}")
    except Exception as e:
        logger.error(f"Migration error {filepath.name}: {e}")
        raise
    finally:
        await conn.close()


async def run_pending_migrations():
    await init_migrations_table()
    applied = await get_applied_migrations()
    migrations_dir = Path(__file__).parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))

    pending_count = 0
    for filepath in migration_files:
        if filepath.name not in applied:
            logger.info(f"Applying migration: {filepath.name}")
            await run_migration(filepath)
            pending_count += 1

    if pending_count == 0:
        logger.info("All migrations already applied")
    else:
        logger.info(f"{pending_count} migration(s) applied")
