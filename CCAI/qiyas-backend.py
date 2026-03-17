"""
scripts/verify_schema.py
Connects to the existing MySQL DB and verifies:
1. Connection works
2. Required tables exist
3. Required columns exist and match expected types
4. Spot-check row counts

Run with:
    cd qiyas-backend
    python scripts/verify_schema.py
"""
import pymysql
import sys

# ── Connection ────────────────────────────────────────────────
CONFIG = {
    "host":     "172.16.5.59",
    "port":     3324,
    "user":     "barzi",
    "password": "0MlUsiHIBy24aads",
    "database": "rayied",
    "charset":  "utf8mb4",
}

# ── Expected schema ───────────────────────────────────────────
# Format: { table: { column: expected_type_fragment } }
EXPECTED = {
    "base_requests": {
        "id":               "int",
        "requester_id":     "int",
        "status":           None,       # any type ok
        "attached_agent_id":"int",
        "language":         None,
        "is_raised":        None,
        "resolved_at":      None,
        "closed_at":        None,
        "city_id":          None,
    },
    "base_chats": {
        "id":           "int",
        "user_id":      "int",
        "request_id":   "int",
        "account_type": None,
        "type":         None,
        "message":      None,
        "sent_at":      None,
    },
    "base_apps": {
        "id":             "int",
        "username":       None,
        "is_super_admin": None,
        "type":           None,
    },
}

OK  = "  ✓"
ERR = "  ✗"
WRN = "  !"

def main():
    print("\n═══════════════════════════════════════")
    print("  QIYAS — DB Schema Verification")
    print("═══════════════════════════════════════\n")

    # ── 1. Connect ────────────────────────────────────────────
    print("1. Connecting to MySQL...")
    try:
        conn = pymysql.connect(**CONFIG)
        cur  = conn.cursor()
        print(f"{OK} Connected to {CONFIG['host']}:{CONFIG['port']}/{CONFIG['database']}\n")
    except Exception as e:
        print(f"{ERR} Connection failed: {e}")
        sys.exit(1)

    # ── 2. List all tables ────────────────────────────────────
    print("2. Tables in database:")
    cur.execute("SHOW TABLES")
    all_tables = [r[0] for r in cur.fetchall()]
    for t in all_tables:
        marker = OK if t in EXPECTED else "    "
        print(f"{marker} {t}")
    print()

    # ── 3. Verify expected tables + columns ───────────────────
    print("3. Verifying required tables and columns:")
    errors = []

    for table, columns in EXPECTED.items():
        if table not in all_tables:
            print(f"{ERR} Table `{table}` — NOT FOUND")
            errors.append(f"Missing table: {table}")
            continue

        # Get actual columns
        cur.execute(f"DESCRIBE `{table}`")
        actual = {row[0]: row[1].lower() for row in cur.fetchall()}

        print(f"{OK} Table `{table}`")
        for col, expected_type in columns.items():
            if col not in actual:
                print(f"{ERR}   column `{col}` — MISSING")
                errors.append(f"{table}.{col} is missing")
            elif expected_type and expected_type not in actual[col]:
                print(f"{WRN}   column `{col}` — type is `{actual[col]}` (expected contains `{expected_type}`)")
            else:
                print(f"{OK}   column `{col}` — {actual[col]}")

        # Show extra columns we didn't expect (informational)
        extra = set(actual.keys()) - set(columns.keys())
        if extra:
            print(f"     → extra columns found: {', '.join(sorted(extra))}")
        print()

    # ── 4. Row counts ─────────────────────────────────────────
    print("4. Row counts:")
    for table in EXPECTED:
        if table in all_tables:
            cur.execute(f"SELECT COUNT(*) FROM `{table}`")
            count = cur.fetchone()[0]
            print(f"{OK} {table}: {count:,} rows")
    print()

    # ── 5. Sample conversation ────────────────────────────────
    print("5. Sample conversation (first resolved request with chats):")
    try:
        cur.execute("""
            SELECT r.id, r.status, r.language, r.attached_agent_id,
                   COUNT(c.id) as msg_count
            FROM base_requests r
            JOIN base_chats c ON c.request_id = r.id
            WHERE r.status = 'resolved'
            GROUP BY r.id
            HAVING msg_count > 3
            ORDER BY r.id DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            rid, status, lang, agent, msgs = row
            print(f"{OK} Request ID: {rid}")
            print(f"     Status:   {status}")
            print(f"     Language: {lang}")
            print(f"     Agent ID: {agent}")
            print(f"     Messages: {msgs}")

            # Show actual messages
            cur.execute("""
                SELECT type, account_type, LEFT(message, 80), sent_at
                FROM base_chats
                WHERE request_id = %s
                ORDER BY sent_at
                LIMIT 5
            """, (rid,))
            print(f"\n     First 5 messages:")
            for i, (typ, acc, msg, ts) in enumerate(cur.fetchall(), 1):
                print(f"     [{i}] {typ or '?'} / {acc or '?'}")
                print(f"         {msg}")
        else:
            print(f"{WRN} No resolved conversations with >3 messages found")
    except Exception as e:
        print(f"{ERR} Sample query failed: {e}")
    print()

    # ── 6. Check account_type values ─────────────────────────
    print("6. Distinct account_type values in base_chats:")
    try:
        cur.execute("""
            SELECT account_type, COUNT(*) as cnt
            FROM base_chats
            GROUP BY account_type
            ORDER BY cnt DESC
        """)
        for acc_type, cnt in cur.fetchall():
            print(f"     {str(acc_type):<45} {cnt:>8,} rows")
    except Exception as e:
        print(f"{ERR} Failed: {e}")
    print()

    # ── 7. Check type values ──────────────────────────────────
    print("7. Distinct type values in base_chats:")
    try:
        cur.execute("""
            SELECT type, COUNT(*) as cnt
            FROM base_chats
            GROUP BY type
            ORDER BY cnt DESC
        """)
        for typ, cnt in cur.fetchall():
            print(f"     {str(typ):<45} {cnt:>8,} rows")
    except Exception as e:
        print(f"{ERR} Failed: {e}")
    print()

    # ── 8. Check status values ────────────────────────────────
    print("8. Distinct status values in base_requests:")
    try:
        cur.execute("""
            SELECT status, COUNT(*) as cnt
            FROM base_requests
            GROUP BY status
            ORDER BY cnt DESC
        """)
        for status, cnt in cur.fetchall():
            print(f"     {str(status):<20} {cnt:>8,} rows")
    except Exception as e:
        print(f"{ERR} Failed: {e}")
    print()

    # ── Summary ───────────────────────────────────────────────
    print("═══════════════════════════════════════")
    if errors:
        print(f"  RESULT: {len(errors)} issue(s) found:")
        for e in errors:
            print(f"  {ERR} {e}")
    else:
        print("  RESULT: All checks passed ✓")
        print("  DB schema matches QIYAS models.")
    print("═══════════════════════════════════════\n")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
