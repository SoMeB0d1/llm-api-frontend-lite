import json
import sqlite3
import sys
from pathlib import Path


def load_tables(conn):
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    return [row[0] for row in cursor.fetchall()]


def dump_table(conn, table):
    cursor = conn.execute(f"SELECT * FROM {table}")
    columns = [col[0] for col in cursor.description or []]
    rows = []
    for row in cursor.fetchall():
        rows.append({columns[idx]: row[idx] for idx in range(len(columns))})
    return rows


def main():
    root = Path(__file__).resolve().parent
    db_path = root / "backend" / "database.db"
    if not db_path.exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    db_uri = f"file:{db_path.as_posix()}?mode=ro"
    try:
        conn = sqlite3.connect(db_uri, uri=True, timeout=5)
    except sqlite3.Error as exc:
        print(f"Failed to open database: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        data = {}
        for table in load_tables(conn):
            data[table] = dump_table(conn, table)
    finally:
        conn.close()

    output = json.dumps(data, indent=2)
    if len(sys.argv) > 1:
        output_path = Path(sys.argv[1]).resolve()
        output_path.write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
