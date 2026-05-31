import sqlite3

def check():
    conn = sqlite3.connect('Backend/database/aura.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row['name'] for row in cursor.fetchall()]
    print('Tables:', tables)
    for t in tables:
        cursor.execute(f"PRAGMA table_info({t})")
        cols = [row['name'] for row in cursor.fetchall()]
        print(f"Table {t} columns: {cols}")
        
        # Print count
        cursor.execute(f"SELECT COUNT(*) as cnt FROM {t}")
        print(f"  Count: {cursor.fetchone()['cnt']}")
        
    # Let's inspect some messages and conversation states
    print("\n--- Last 5 Conversation States ---")
    cursor.execute("SELECT * FROM conversation_state ORDER BY updated_at DESC LIMIT 5")
    for r in cursor.fetchall():
        print(dict(r))
        
    print("\n--- Last 10 Chat Messages ---")
    try:
        cursor.execute("SELECT * FROM messages ORDER BY id DESC LIMIT 10")
        for r in cursor.fetchall():
            print(dict(r))
    except Exception as e:
        print("Error reading messages table:", e)
        
    conn.close()

if __name__ == '__main__':
    check()
