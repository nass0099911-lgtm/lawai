import json
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'aura.db')

def migrate():
    # 1. Connect to SQLite
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 2. Create Tables
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        google_id TEXT UNIQUE,
        profile_pic_url TEXT,
        plan TEXT DEFAULT 'free',
        msg_credits INTEGER DEFAULT 15,
        voice_credits INTEGER DEFAULT 0,
        upload_credits INTEGER DEFAULT 0,
        is_admin BOOLEAN DEFAULT 0,
        joined TEXT,
        language TEXT DEFAULT 'en',
        pfp_ext TEXT
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chats (
        chat_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        title TEXT DEFAULT 'Nýtt samtal',
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (username) REFERENCES users(username)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS codes (
        code TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        max_uses INTEGER DEFAULT 1,
        used INTEGER DEFAULT 0
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS plans (
        plan_name TEXT PRIMARY KEY,
        msg_credits INTEGER,
        voice_credits INTEGER,
        upload_credits INTEGER
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversation_state (
        chat_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        last_user_message TEXT,
        partial_assistant_response TEXT,
        generation_status TEXT DEFAULT 'completed',
        updated_at TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS system_stats (
        key TEXT PRIMARY KEY,
        value INTEGER DEFAULT 0
    )
    ''')

    # 3. Load JSON and Insert
    
    # Plans
    plans_path = os.path.join(os.path.dirname(__file__), 'plans.json')
    if os.path.exists(plans_path):
        with open(plans_path, 'r') as f:
            plans = json.load(f)
            for name, limits in plans.items():
                cursor.execute('INSERT OR REPLACE INTO plans VALUES (?, ?, ?, ?)',
                               (name, limits['msg_credits'], limits['voice_credits'], limits['upload_credits']))
        print("Migrated plans.")

    # Codes
    codes_path = os.path.join(os.path.dirname(__file__), 'codes.json')
    if os.path.exists(codes_path):
        with open(codes_path, 'r') as f:
            codes = json.load(f)
            for code, data in codes.items():
                cursor.execute('INSERT OR REPLACE INTO codes VALUES (?, ?, ?, ?)',
                               (code, data['plan'], data.get('max_uses', 1), data.get('used', 0)))
        print("Migrated codes.")

    # Users
    users_path = os.path.join(os.path.dirname(__file__), 'users.json')
    if os.path.exists(users_path):
        with open(users_path, 'r') as f:
            users = json.load(f)
            for username, u in users.items():
                cursor.execute('''
                INSERT OR REPLACE INTO users 
                (username, password, plan, msg_credits, voice_credits, upload_credits, is_admin, joined, language, pfp_ext)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    username, 
                    u['password'], 
                    u.get('plan', 'free'),
                    u.get('msg_credits', 0),
                    u.get('voice_credits', 0),
                    u.get('upload_credits', 0),
                    1 if u.get('is_admin') else 0,
                    u.get('joined'),
                    u.get('language', 'en'),
                    u.get('pfp_ext')
                ))
        print("Migrated users.")

    conn.commit()
    conn.close()
    print("Migration successful! aura.db is ready.")

if __name__ == '__main__':
    migrate()
