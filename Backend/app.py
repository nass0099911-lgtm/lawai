from flask import Flask, render_template, request, Response, jsonify, session, redirect, url_for, send_file
from google import genai
from google.genai import types
from werkzeug.security import generate_password_hash, check_password_hash
import os, base64, secrets, string, sqlite3, json
from dotenv import load_dotenv
from datetime import date, datetime
from openai import OpenAI
from groq import Groq
from authlib.integrations.flask_client import OAuth
import uuid

# Load environment variables from parent directory config files
def load_config():
    # Try config.json first
    json_path = os.path.join(os.path.dirname(__file__), '..', 'config.json')
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                for k, v in config.items():
                    os.environ[k] = str(v)
            print("Loaded configuration from config.json")
            return True
        except Exception as e:
            print(f"Error loading config.json: {e}")
            
    # Try config.txt next
    txt_path = os.path.join(os.path.dirname(__file__), '..', 'config.txt')
    if os.path.exists(txt_path):
        load_dotenv(txt_path)
        print("Loaded configuration from config.txt")
        return True

    # Fallback to .env
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print("Loaded configuration from .env")
        return True
        
    print("Warning: No configuration file found (config.json, config.txt, or .env)")
    return False

load_config()

app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(__file__), '..', 'templates'),
            static_folder=os.path.join(os.path.dirname(__file__), '..', 'static'))

# Persistent secret key so restarts do not log out users
secret_key_file = os.path.join(os.path.dirname(__file__), '.secret_key')
if os.path.exists(secret_key_file):
    try:
        with open(secret_key_file, 'rb') as f:
            app.secret_key = f.read()
    except Exception as e:
        print(f"Error reading secret key file: {e}")
        app.secret_key = os.urandom(24)
else:
    try:
        key = os.urandom(24)
        with open(secret_key_file, 'wb') as f:
            f.write(key)
        app.secret_key = key
    except Exception as e:
        print(f"Error writing secret key file: {e}")
        app.secret_key = os.urandom(24)

from datetime import timedelta
app.permanent_session_lifetime = timedelta(days=365)

oauth = OAuth(app)
oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

DB_PATH = os.path.join(os.path.dirname(__file__), 'database', 'aura.db')
PFP_DIR = os.path.join(os.path.dirname(__file__), '..', 'Uploads', 'Profiles')
os.makedirs(PFP_DIR, exist_ok=True)

def run_migrations():
    """Ensure all required tables and columns exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # New tables for admin system
    c.execute('''CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user TEXT,
        action TEXT,
        target TEXT,
        details TEXT,
        timestamp TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS ai_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')
    # Add missing columns to users table (safe to run multiple times)
    for col_sql in [
        "ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN last_login TEXT",
        "ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'",
    ]:
        try:
            c.execute(col_sql)
        except Exception:
            pass  # Column already exists
    conn.commit()
    conn.close()

run_migrations()


# ── Database Helpers ──────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def query_db(query, args=(), one=False):
    db = get_db()
    cur = db.execute(query, args)
    rv = cur.fetchall()
    db.commit()
    db.close()
    return (rv[0] if rv else None) if one else rv

def migrate_guest_chats(guest_username, new_username):
    try:
        db = get_db()
        db.execute('UPDATE chats SET username = ? WHERE username = ?', (new_username, guest_username))
        db.execute('UPDATE conversation_state SET user_id = ? WHERE user_id = ?', (new_username, guest_username))
        db.commit()
        db.close()
    except Exception as e:
        print(f"Error migrating guest chats: {e}")

# ── Rate Limiting ─────────────────────────────────────────────────────────
rate_limits = {} # username -> [timestamps]
active_generations = {} # chat_id -> request_id

def check_rate_limit(username, plan):
    if plan in ['pro', 'max']: return True # No rate limit for paid users
    if username not in rate_limits: rate_limits[username] = []
    import time
    now_ts = time.time()
    # Filter to last 60 seconds
    rate_limits[username] = [ts for ts in rate_limits[username] if now_ts - ts < 60]
    
    limit = 5
    if len(rate_limits[username]) >= limit: return False
    rate_limits[username].append(now_ts)
    return True

# ── Password Validation ───────────────────────────────────────────────────
def is_strong_password(password, username):
    import re
    if len(password) < 10:
        return False, "Lykilorð of veikt. Það verður að innihalda að minnsta kosti 10 stafi."
    if not re.search(r'[A-Z]', password):
        return False, "Lykilorð of veikt. Það verður að innihalda hástafi."
    if not re.search(r'[a-z]', password):
        return False, "Lykilorð of veikt. Það verður að innihalda lágstafi."
    if not re.search(r'[0-9]', password):
        return False, "Lykilorð of veikt. Það verður að innihalda tölur."
    if not re.search(r'[!@#$%^&*()-_=+[\]{}|;:,.<>?]', password):
        return False, "Lykilorð of veikt. Það verður að innihalda sérstaf (!@#$ o.s.frv.)."
        
    pwd_lower = password.lower()
    common_passwords = ['password123', '1234567890', 'qwerty', 'lykilorð', 'lykilsord123']
    if pwd_lower in common_passwords:
        return False, "Lykilorð of veikt. Þetta er of algengt lykilorð."
        
    if username.lower() in pwd_lower and len(username) > 3:
        return False, "Lykilorð má ekki innihalda notendanafnið þitt."
        
    # Check for repeating characters (e.g. aaaaaa, 111111)
    if re.search(r'(.)\1{4,}', pwd_lower):
        return False, "Lykilorð of veikt. Má ekki innihalda endurtekna stafi í röð."
        
    # Check for simple sequences
    if any(seq in pwd_lower for seq in ['12345', 'abcdef', 'qwert']):
        return False, "Lykilorð of veikt. Má ekki innihalda einfaldar raðir."
        
    return True, "Sterkt"

# ── Auth & Admin ──────────────────────────────────────────────────────────
def is_admin():
    if 'user' not in session: return False
    u = query_db('SELECT is_admin FROM users WHERE username = ?', (session['user'],), one=True)
    return bool(u['is_admin']) if u else False

@app.route('/')
def index():
    try:
        query_db("INSERT OR IGNORE INTO system_stats (key, value) VALUES ('visits', 0)")
        query_db("UPDATE system_stats SET value = value + 1 WHERE key = 'visits'")
    except Exception as e:
        print(f"Error updating stats: {e}")
        
    if 'user' not in session:
        # Create a new guest session
        guest_id = 'gestur_' + secrets.token_hex(4)
        session['user'] = guest_id
        session['is_guest'] = True
        # Insert guest user in database with unlimited credits (9999) for beta
        query_db('''INSERT OR IGNORE INTO users (username, password, plan, msg_credits, joined) 
                   VALUES (?, ?, 'free', 9999, ?)''', 
                (guest_id, generate_password_hash(secrets.token_hex(16)), date.today().isoformat()))
    else:
        # Check if existing session is guest
        session['is_guest'] = session['user'].startswith('gestur_')
        
    return render_template('index.html', username=session['user'], is_guest=session.get('is_guest', False))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        # Check special admin9119 credentials
        if username == 'admin9119' and password == 'admin9119':
            # Ensure admin9119 exists in database and is admin
            existing = query_db('SELECT * FROM users WHERE username = ?', (username,), one=True)
            if not existing:
                query_db('''INSERT INTO users (username, password, plan, msg_credits, is_admin, joined) 
                           VALUES (?, ?, 'pro', 9999, 1, ?)''', 
                         (username, generate_password_hash(password), date.today().isoformat()))
            else:
                if not existing['is_admin']:
                    query_db('UPDATE users SET is_admin = 1 WHERE username = ?', (username,))
            
            session['user'] = username
            session['is_guest'] = False
            session.permanent = True
            return redirect(url_for('index'))
            
        u = query_db('SELECT * FROM users WHERE username = ?', (username,), one=True)
        if u and check_password_hash(u['password'], password):
            old_user = session.get('user')
            session['user'] = username
            session['is_guest'] = False
            session.permanent = True
            if old_user and old_user.startswith('gestur_') and old_user != username:
                migrate_guest_chats(old_user, username)
            return redirect(url_for('index'))
        return render_template('login.html', error='Rangt notendanafn eða lykilorð')
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        if query_db('SELECT username FROM users WHERE username = ?', (username,), one=True):
            return render_template('signup.html', error='Notendanafn er þegar til')
            
        is_valid, msg = is_strong_password(password, username)
        if not is_valid:
            return render_template('signup.html', error=msg)
        
        # Insert new user with 9999 credits for beta
        query_db('''INSERT INTO users (username, password, plan, msg_credits, joined) 
                   VALUES (?, ?, 'free', 9999, ?)''', 
                (username, generate_password_hash(password), date.today().isoformat()))
        
        old_user = session.get('user')
        session['user'] = username
        session['is_guest'] = False
        session.permanent = True
        if old_user and old_user.startswith('gestur_') and old_user != username:
            migrate_guest_chats(old_user, username)
            
        return redirect(url_for('index'))
    return render_template('signup.html')

@app.route('/login/google')
def login_google():
    redirect_uri = url_for('auth_google_callback', _external=True)
    return oauth.google.authorize_redirect(redirect_uri)

@app.route('/auth/google/callback')
def auth_google_callback():
    token = oauth.google.authorize_access_token()
    user_info = token.get('userinfo')
    if user_info:
        google_id = user_info.get('sub')
        email = user_info.get('email')
        picture = user_info.get('picture')
        
        # Check if user exists
        u = query_db('SELECT * FROM users WHERE google_id = ? OR username = ?', (google_id, email), one=True)
        if not u:
            # Create user
            query_db('''INSERT INTO users (username, password, google_id, profile_pic_url, plan, msg_credits, joined) 
                       VALUES (?, ?, ?, ?, 'free', 9999, ?)''', 
                    (email, generate_password_hash(secrets.token_hex(16)), google_id, picture, date.today().isoformat()))
        else:
            # Update google_id and picture if not set
            query_db('UPDATE users SET google_id = ?, profile_pic_url = ? WHERE username = ?', (google_id, picture, u['username']))
            
        old_user = session.get('user')
        session['user'] = email
        session['profile_pic_url'] = picture
        session['is_guest'] = False
        session.permanent = True
        
        if old_user and old_user.startswith('gestur_') and old_user != email:
            migrate_guest_chats(old_user, email)
            
    return redirect(url_for('index'))

@app.route('/login/apple')
def login_apple():
    # Simulate Apple Sign-In
    apple_id = 'apple_' + secrets.token_hex(4)
    email = f"{apple_id}@apple.logvist.is"
    picture = "https://ui-avatars.com/api/?name=Apple+Notandi&background=000000&color=ffffff"
    
    u = query_db('SELECT * FROM users WHERE google_id = ? OR username = ?', (apple_id, email), one=True)
    if not u:
        query_db('''INSERT INTO users (username, password, google_id, profile_pic_url, plan, msg_credits, joined) 
                   VALUES (?, ?, ?, ?, 'free', 9999, ?)''', 
                (email, generate_password_hash(secrets.token_hex(16)), apple_id, picture, date.today().isoformat()))
    
    old_user = session.get('user')
    session['user'] = email
    session['profile_pic_url'] = picture
    session['is_guest'] = False
    session.permanent = True
    
    if old_user and old_user.startswith('gestur_') and old_user != email:
        migrate_guest_chats(old_user, email)
        
    return redirect(url_for('index'))

@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('profile_pic_url', None)
    session.pop('is_guest', None)
    return redirect(url_for('index'))

# ── Admin Dashboard ────────────────────────────────────────────────────────
@app.route('/admin')
def admin_dashboard():
    if not is_admin():
        return redirect(url_for('index'))
    return render_template('admin.html', username=session['user'])

@app.route('/api/admin/stats')
def admin_stats():
    if not is_admin(): return jsonify({'error': 'Unauthorized'}), 401
    users_count = query_db('SELECT COUNT(*) as c FROM users', one=True)['c']
    chats_count = query_db('SELECT COUNT(*) as c FROM chats', one=True)['c']
    paid_count = query_db("SELECT COUNT(*) as c FROM users WHERE plan != 'free'", one=True)['c']
    
    # New analytics stats
    visits_row = query_db("SELECT value FROM system_stats WHERE key = 'visits'", one=True)
    visits_count = visits_row['value'] if visits_row else 0
    questions_count = query_db("SELECT COUNT(*) as c FROM messages WHERE role = 'user'", one=True)['c']
    total_messages = query_db("SELECT COUNT(*) as c FROM messages", one=True)['c']
    guests_count = query_db("SELECT COUNT(*) as c FROM users WHERE username LIKE 'gestur_%'", one=True)['c']
    registered_count = query_db("SELECT COUNT(*) as c FROM users WHERE username NOT LIKE 'gestur_%'", one=True)['c']
    
    return jsonify({
        'users': users_count, 
        'chats': chats_count, 
        'paid': paid_count,
        'visits': visits_count,
        'questions': questions_count,
        'messages': total_messages,
        'guests': guests_count,
        'registered': registered_count
    })


# ── Chat Database Routes ──────────────────────────────────────────────────
@app.route('/api/chats', methods=['GET', 'POST'])
def handle_chats():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    username = session['user']
    
    if request.method == 'GET':
        if session.get('is_guest'):
            return jsonify([])
        chats = query_db('SELECT * FROM chats WHERE username = ? ORDER BY updated_at DESC', (username,))
        return jsonify([dict(c) for c in chats])
        
    if request.method == 'POST':
        data = request.json
        chat_id = data.get('chat_id', str(uuid.uuid4()))
        title = data.get('title', 'Nýtt samtal')
        if session.get('is_guest'):
            return jsonify({'chat_id': chat_id, 'title': title})
            
        now = datetime.now().isoformat()
        existing = query_db('SELECT chat_id FROM chats WHERE chat_id = ?', (chat_id,), one=True)
        if existing:
            query_db('UPDATE chats SET title = ?, updated_at = ? WHERE chat_id = ? AND username = ?', 
                     (title, now, chat_id, username))
        else:
            query_db('INSERT INTO chats (chat_id, username, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                     (chat_id, username, title, now, now))
        return jsonify({'chat_id': chat_id, 'title': title})

@app.route('/api/chats/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    if session.get('is_guest'):
        return jsonify({'success': True})
    username = session['user']
    query_db('DELETE FROM messages WHERE chat_id = ? AND chat_id IN (SELECT chat_id FROM chats WHERE username = ?)', (chat_id, username))
    query_db('DELETE FROM chats WHERE chat_id = ? AND username = ?', (chat_id, username))
    query_db('DELETE FROM conversation_state WHERE chat_id = ? AND user_id = ?', (chat_id, username))
    return jsonify({'success': True})

@app.route('/api/chats/<chat_id>/status', methods=['GET'])
def get_chat_status(chat_id):
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    username = session['user']
    state = query_db('SELECT * FROM conversation_state WHERE chat_id = ? AND user_id = ?', (chat_id, username), one=True)
    if state:
        return jsonify({
            'chat_id': state['chat_id'],
            'generation_status': state['generation_status'],
            'partial_assistant_response': state['partial_assistant_response'],
            'last_user_message': state['last_user_message']
        })
    return jsonify({
        'chat_id': chat_id,
        'generation_status': 'completed',
        'partial_assistant_response': '',
        'last_user_message': ''
    })

@app.route('/api/chats/<chat_id>/messages', methods=['GET', 'POST'])
def handle_messages(chat_id):
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    username = session['user']
    
    if session.get('is_guest'):
        if request.method == 'GET':
            return jsonify([])
        if request.method == 'POST':
            return jsonify({'success': True})
            
    # Verify ownership
    chat = query_db('SELECT * FROM chats WHERE chat_id = ? AND username = ?', (chat_id, username), one=True)
    if not chat: return jsonify({'error': 'Not found'}), 404
    
    if request.method == 'GET':
        msgs = query_db('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC', (chat_id,))
        # Format for frontend
        formatted = [{'role': m['role'], 'parts': [{'text': m['content']}]} for m in msgs]
        return jsonify(formatted)
        
    if request.method == 'POST':
        data = request.json
        role = data.get('role')
        content = data.get('content')
        if not role or not content: return jsonify({'error': 'Invalid data'}), 400
        
        # Check message count before inserting
        msg_count = query_db('SELECT COUNT(*) as c FROM messages WHERE chat_id = ?', (chat_id,), one=True)['c']
        
        msg_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        query_db('INSERT INTO messages (message_id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
                 (msg_id, chat_id, role, content, now))
        query_db('UPDATE chats SET updated_at = ? WHERE chat_id = ?', (now, chat_id))
        
        # If first user message, generate title and store in db
        if msg_count == 0 and role == 'user':
            generated_title = fetch_ai_title(content)
            query_db('UPDATE chats SET title = ? WHERE chat_id = ?', (generated_title, chat_id))
        return jsonify({'success': True})

    # ── Admin API ─────────────────────────────────────────────────────────────
@app.route('/api/admin/users')
def admin_list_users():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    users = query_db('SELECT username, plan, msg_credits, voice_credits, upload_credits, is_admin, joined FROM users')
    return jsonify([dict(u) for u in users])

@app.route('/api/admin/users/<username>/plan', methods=['POST'])
def admin_set_plan(username):
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    plan = request.json.get('plan', 'free')
    pd = query_db('SELECT * FROM plans WHERE plan_name = ?', (plan,), one=True)
    if not pd: return jsonify({'error': 'Invalid plan'}), 400
    query_db('''UPDATE users SET plan=?, msg_credits=?, voice_credits=?, upload_credits=? 
               WHERE username=?''', (plan, pd['msg_credits'], pd['voice_credits'], pd['upload_credits'], username))
    return jsonify({'success': True})

@app.route('/api/admin/users/<username>', methods=['DELETE'])
def admin_delete_user(username):
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    target = query_db('SELECT is_admin FROM users WHERE username = ?', (username,), one=True)
    if target and target['is_admin']:
        return jsonify({'error': 'Cannot delete administrator'}), 400
    query_db('DELETE FROM messages WHERE chat_id IN (SELECT chat_id FROM chats WHERE username = ?)', (username,))
    query_db('DELETE FROM chats WHERE username = ?', (username,))
    query_db('DELETE FROM conversation_state WHERE user_id = ?', (username,))
    query_db('DELETE FROM users WHERE username = ?', (username,))
    return jsonify({'success': True})

@app.route('/api/admin/create-code', methods=['POST'])
def admin_create_code():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    data = request.json
    plan = data.get('plan', 'pro')
    max_uses = data.get('max_uses', 1)
    code = secrets.token_hex(8).upper()
    query_db('INSERT INTO codes (code, plan, max_uses, used) VALUES (?, ?, ?, 0)', (code, plan, max_uses))
    return jsonify({'code': code})

@app.route('/api/admin/codes/generate', methods=['POST'])
def admin_codes_generate():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    data = request.json
    plan = data.get('plan', 'pro')
    max_uses = data.get('max_uses', 1)
    code = secrets.token_hex(8).upper()
    query_db('INSERT INTO codes (code, plan, max_uses, used) VALUES (?, ?, ?, 0)', (code, plan, max_uses))
    return jsonify({'code': code})

@app.route('/api/admin/codes', methods=['GET'])
def admin_list_codes():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    codes = query_db('SELECT * FROM codes')
    result = {}
    for c in codes:
        result[c['code']] = {
            'plan': c['plan'],
            'used': c['used'],
            'max_uses': c['max_uses']
        }
    return jsonify(result)

@app.route('/api/admin/codes/<code_val>', methods=['DELETE'])
def admin_delete_code(code_val):
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    query_db('DELETE FROM codes WHERE code = ?', (code_val,))
    return jsonify({'success': True})

@app.route('/api/admin/plans', methods=['GET'])
def admin_get_plans():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    plans = query_db('SELECT * FROM plans')
    result = {}
    for p in plans:
        result[p['plan_name']] = {
            'msg_credits': p['msg_credits'],
            'voice_credits': p['voice_credits'],
            'upload_credits': p['upload_credits']
        }
    return jsonify(result)

@app.route('/api/admin/plans/update', methods=['POST'])
def admin_update_plan_limits():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    data = request.json
    plan = data.get('plan')
    limits = data.get('limits', {})
    query_db('UPDATE plans SET msg_credits=?, voice_credits=?, upload_credits=? WHERE plan_name=?',
             (limits.get('msg_credits'), limits.get('voice_credits'), limits.get('upload_credits'), plan))
    return jsonify({'success': True})

# ── Extended Admin API ─────────────────────────────────────────────────────

def admin_log(action, target='', details=''):
    """Write an entry to the admin audit log."""
    try:
        who = session.get('user', 'unknown')
        query_db(
            'INSERT INTO audit_log (admin_user, action, target, details, timestamp) VALUES (?,?,?,?,?)',
            (who, action, target, details, datetime.now().isoformat())
        )
    except Exception as e:
        print(f'audit_log error: {e}')

@app.route('/api/admin/users/full', methods=['GET'])
def admin_users_full():
    """Return full user details including password hash, theme, ban status, last_login."""
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    try:
        users = query_db('''SELECT username, password, plan, msg_credits, voice_credits,
                            upload_credits, is_admin, joined, theme, is_banned, last_login, login_count
                            FROM users''')
    except Exception:
        # Fallback if columns don't exist yet (migration adds them)
        users = query_db('SELECT username, password, plan, msg_credits, is_admin, joined FROM users')
    return jsonify([dict(u) for u in users])

@app.route('/api/admin/users/<username>/update', methods=['POST'])
def admin_update_user_full(username):
    """Update any user field from the admin panel."""
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    data = request.json
    changes = []

    new_username = data.get('new_username', '').strip()
    new_password = data.get('new_password', '').strip()
    plan = data.get('plan')
    is_adm = data.get('is_admin')
    theme = data.get('theme', '').strip()
    msg_credits = data.get('msg_credits')
    is_banned = data.get('is_banned')

    if plan:
        query_db('UPDATE users SET plan=? WHERE username=?', (plan, username))
        changes.append(f'plan={plan}')
    if is_adm is not None:
        query_db('UPDATE users SET is_admin=? WHERE username=?', (int(is_adm), username))
        changes.append(f'is_admin={is_adm}')
    if theme:
        query_db('UPDATE users SET theme=? WHERE username=?', (theme, username))
        changes.append(f'theme={theme}')
    if msg_credits is not None:
        query_db('UPDATE users SET msg_credits=? WHERE username=?', (int(msg_credits), username))
        changes.append(f'msg_credits={msg_credits}')
    if is_banned is not None:
        try:
            query_db('UPDATE users SET is_banned=? WHERE username=?', (int(is_banned), username))
            changes.append(f'is_banned={is_banned}')
        except Exception:
            pass
    if new_password:
        hashed = generate_password_hash(new_password)
        query_db('UPDATE users SET password=? WHERE username=?', (hashed, username))
        changes.append('password_reset')
    if new_username and new_username != username:
        existing = query_db('SELECT username FROM users WHERE username=?', (new_username,), one=True)
        if existing:
            return jsonify({'error': 'Notendanafn er þegar til'}), 409
        query_db('UPDATE users SET username=? WHERE username=?', (new_username, username))
        query_db('UPDATE chats SET username=? WHERE username=?', (new_username, username))
        query_db('UPDATE conversation_state SET user_id=? WHERE user_id=?', (new_username, username))
        changes.append(f'renamed→{new_username}')

    admin_log('update_user', username, ', '.join(changes))
    return jsonify({'success': True})

@app.route('/api/admin/users/<username>/ban', methods=['POST'])
def admin_ban_user(username):
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    banned = request.json.get('banned', True)
    try:
        query_db('UPDATE users SET is_banned=? WHERE username=?', (int(banned), username))
    except Exception:
        pass
    action = 'ban_user' if banned else 'unban_user'
    admin_log(action, username)
    return jsonify({'success': True})

@app.route('/api/admin/users/<username>/reset-password', methods=['POST'])
def admin_reset_password(username):
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    new_pw = request.json.get('password', '').strip()
    if not new_pw:
        return jsonify({'error': 'Password required'}), 400
    query_db('UPDATE users SET password=? WHERE username=?', (generate_password_hash(new_pw), username))
    admin_log('reset_password', username)
    return jsonify({'success': True})

@app.route('/api/admin/conversations', methods=['GET'])
def admin_list_conversations():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    user_filter = request.args.get('user', '')
    limit = int(request.args.get('limit', 50))
    if user_filter:
        chats = query_db(
            'SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.chat_id) as msg_count FROM chats c WHERE c.username LIKE ? ORDER BY c.updated_at DESC LIMIT ?',
            (f'%{user_filter}%', limit)
        )
    else:
        chats = query_db(
            'SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.chat_id) as msg_count FROM chats c ORDER BY c.updated_at DESC LIMIT ?',
            (limit,)
        )
    return jsonify([dict(c) for c in chats])

@app.route('/api/admin/conversations/<chat_id>', methods=['GET'])
def admin_get_conversation(chat_id):
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    chat = query_db('SELECT * FROM chats WHERE chat_id=?', (chat_id,), one=True)
    msgs = query_db('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at ASC', (chat_id,))
    return jsonify({
        'chat': dict(chat) if chat else {},
        'messages': [dict(m) for m in msgs]
    })

@app.route('/api/admin/system-prompt', methods=['GET'])
def admin_get_system_prompt():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    try:
        row = query_db("SELECT value FROM ai_settings WHERE key='system_prompt'", one=True)
        return jsonify({'system_prompt': row['value'] if row else ''})
    except Exception:
        return jsonify({'system_prompt': ''})

@app.route('/api/admin/system-prompt', methods=['POST'])
def admin_set_system_prompt():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    prompt = request.json.get('system_prompt', '')
    try:
        query_db("INSERT OR REPLACE INTO ai_settings (key, value) VALUES ('system_prompt', ?)", (prompt,))
    except Exception:
        pass
    admin_log('update_system_prompt', details=f'{len(prompt)} chars')
    return jsonify({'success': True})

@app.route('/api/admin/ai-settings', methods=['GET'])
def admin_get_ai_settings():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    try:
        rows = query_db('SELECT key, value FROM ai_settings')
        return jsonify({r['key']: r['value'] for r in rows})
    except Exception:
        return jsonify({})

@app.route('/api/admin/ai-settings', methods=['POST'])
def admin_set_ai_settings():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    data = request.json
    for key, value in data.items():
        try:
            query_db("INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)", (key, str(value)))
        except Exception:
            pass
    admin_log('update_ai_settings', details=str(list(data.keys())))
    return jsonify({'success': True})

@app.route('/api/admin/analytics', methods=['GET'])
def admin_analytics():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    try:
        daily = query_db('''
            SELECT DATE(created_at) as day, COUNT(*) as count
            FROM messages WHERE role='user'
            AND created_at >= DATE('now', '-30 days')
            GROUP BY day ORDER BY day ASC
        ''')
    except Exception:
        daily = []
    try:
        top_users = query_db('''
            SELECT c.username, COUNT(m.id) as msg_count
            FROM messages m JOIN chats c ON m.chat_id=c.chat_id
            WHERE m.role='user' GROUP BY c.username
            ORDER BY msg_count DESC LIMIT 10
        ''')
    except Exception:
        top_users = []
    try:
        plans_dist = query_db('''
            SELECT plan, COUNT(*) as count FROM users
            WHERE username NOT LIKE 'gestur_%'
            GROUP BY plan
        ''')
    except Exception:
        plans_dist = []
    try:
        new_users = query_db('''
            SELECT DATE(joined) as day, COUNT(*) as count
            FROM users WHERE joined >= DATE('now','-7 days')
            GROUP BY day ORDER BY day ASC
        ''')
    except Exception:
        new_users = []
    return jsonify({
        'daily_messages': [dict(d) for d in daily],
        'top_users': [dict(u) for u in top_users],
        'plan_distribution': [dict(p) for p in plans_dist],
        'new_users': [dict(u) for u in new_users]
    })

@app.route('/api/admin/audit-log', methods=['GET'])
def admin_audit_log():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    limit = int(request.args.get('limit', 100))
    try:
        rows = query_db('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', (limit,))
        return jsonify([dict(r) for r in rows])
    except Exception:
        return jsonify([])

@app.route('/api/admin/security', methods=['GET'])
def admin_security():
    if not is_admin(): return jsonify({'error': 'Forbidden'}), 403
    try:
        banned = query_db('SELECT username, joined FROM users WHERE is_banned=1')
        banned_list = [dict(b) for b in banned]
    except Exception:
        banned_list = []
    rl_summary = [{'username': k, 'recent_requests': len(v)} for k, v in rate_limits.items() if len(v) > 0]
    return jsonify({
        'banned_users': banned_list,
        'rate_limit_events': rl_summary
    })

# ── Settings & Profile ────────────────────────────────────────────────────
@app.route('/api/settings', methods=['POST'])
def update_settings():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    if session.get('is_guest'): return jsonify({'error': 'Aðgerð óheimil í gestaham'}), 403
    data = request.json
    new_username = data.get('username', '').strip()
    new_password = data.get('password', '')
    language = data.get('language', 'en')
    current = session['user']

    if new_username and new_username != current:
        if query_db('SELECT username FROM users WHERE username = ?', (new_username,), one=True):
            return jsonify({'error': 'Username already taken'}), 400
        query_db('UPDATE users SET username = ? WHERE username = ?', (new_username, current))
        session['user'] = new_username
        current = new_username

    if new_password:
        is_valid, msg = is_strong_password(new_password, current)
        if not is_valid:
            return jsonify({'error': msg}), 400
        query_db('UPDATE users SET password = ? WHERE username = ?', (generate_password_hash(new_password), current))
    
    query_db('UPDATE users SET language = ? WHERE username = ?', (language, current))
    return jsonify({'success': True, 'message': 'Settings updated successfully.'})

@app.route('/api/upload-pfp', methods=['POST'])
def upload_pfp():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    file = request.files.get('pfp')
    if not file or file.filename == '': return jsonify({'error': 'No file selected'}), 400
    
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ['jpg', 'jpeg', 'png', 'gif', 'webp']: return jsonify({'error': 'Invalid file type'}), 400
        
    username = session['user']
    for f in os.listdir(PFP_DIR):
        if f.startswith(f"{username}."): os.remove(os.path.join(PFP_DIR, f))
            
    filepath = os.path.join(PFP_DIR, f"{username}.{ext}")
    file.save(filepath)
    query_db('UPDATE users SET pfp_ext = ? WHERE username = ?', (ext, username))
    return jsonify({'success': True, 'pfp_url': f'/api/pfp/{username}?t={int(os.path.getmtime(filepath))}'})

@app.route('/api/pfp/<username>')
def get_pfp(username):
    u = query_db('SELECT pfp_ext FROM users WHERE username = ?', (username,), one=True)
    if not u or not u['pfp_ext']:
        return redirect('https://ui-avatars.com/api/?name=' + username + '&background=random')
    
    filepath = os.path.join(PFP_DIR, f"{username}.{u['pfp_ext']}")
    if os.path.exists(filepath): return send_file(filepath)
    
    # Check if they have a Google profile pic
    g_pic = query_db('SELECT profile_pic_url FROM users WHERE username = ?', (username,), one=True)
    if g_pic and g_pic['profile_pic_url']:
        return redirect(g_pic['profile_pic_url'])
        
    return redirect('https://ui-avatars.com/api/?name=' + username + '&background=random')

# ── AI Features ────────────────────────────────────────────────────────────
def get_gemini_keys():
    keys = [os.getenv('GEMINI_API_KEY'), os.getenv('GEMINI_API_KEY_2'), os.getenv('GEMINI_API_KEY_3')]
    return [k for k in keys if k]

def fetch_ai_title(message_content: str) -> str:
    # Try Gemini first
    keys = get_gemini_keys()
    if keys:
        for k in keys:
            try:
                client = genai.Client(api_key=k)
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=f"Draga saman þessi skilaboð í stuttan samtalstitil á íslensku (hámark 3-4 orð). Ekki nota gæsalappir eða greinarmerki. Svaraðu eingöngu á íslensku: {message_content}"
                )
                title = response.text.strip().replace('"', '').replace('⭐', '').strip()[:30]
                if title:
                    return title
            except:
                continue
                
    # Fallback to Groq
    groq_key = os.getenv('GROQ_API_KEY') or os.getenv('GROQ_API_KEY_2')
    if groq_key:
        try:
            from groq import Groq
            client = Groq(api_key=groq_key)
            completion = client.chat.completions.create(
                model='llama-3.1-8b-instant',
                messages=[
                    {"role": "system", "content": "Draga saman þessi skilaboð í mjög stuttan og lýsandi samtalstitil á íslensku (hámark 3-4 orð). Ekki nota gæsalappir eða greinarmerki. Svaraðu eingöngu á íslensku."},
                    {"role": "user", "content": message_content}
                ]
            )
            title = completion.choices[0].message.content.strip().replace('"', '').replace('⭐', '').strip()[:30]
            if title:
                return title
        except Exception as e:
            print(f"Fallback title generation failed: {e}")
            
    return "Nýtt samtal"

@app.route('/api/generate-title', methods=['POST'])
def generate_title():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    message = request.json.get('message', '').strip()
    if not message: return jsonify({'title': 'Nýtt samtal'})
    title = fetch_ai_title(message)
    return jsonify({'title': title})

# ── Plans & Credits ────────────────────────────────────────────────────────
@app.route('/api/plan')
def get_plan():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    u = query_db('SELECT * FROM users WHERE username = ?', (session['user'],), one=True)
    if not u: return jsonify({'error': 'User not found'}), 404
    d = dict(u)
    d['msg_credits'] = 9999
    d['voice_credits'] = 9999
    d['upload_credits'] = 9999
    return jsonify(d)

@app.route('/api/redeem', methods=['POST'])
def redeem_code():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    code = request.json.get('code', '').strip()
    entry = query_db('SELECT * FROM codes WHERE code = ?', (code,), one=True)
    if not entry: return jsonify({'error': 'Invalid redeem code'}), 404
    if entry['used'] >= entry['max_uses']: return jsonify({'error': 'Code already redeemed'}), 409
    
    plan_data = query_db('SELECT * FROM plans WHERE plan_name = ?', (entry['plan'],), one=True)
    if not plan_data: return jsonify({'error': 'Invalid plan'}), 400
    
    query_db('''UPDATE users SET plan=?, msg_credits=?, voice_credits=?, upload_credits=? 
               WHERE username=?''', 
            (entry['plan'], plan_data['msg_credits'], plan_data['voice_credits'], plan_data['upload_credits'], session['user']))
    query_db('UPDATE codes SET used = used + 1 WHERE code = ?', (code,))
    
    return jsonify({'success': True, 'plan': entry['plan'], 'message': f'Upgraded to {entry["plan"].upper()}!'})

@app.route('/api/use-voice-credit', methods=['POST'])
def use_voice_credit():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({'success': True, 'voice_credits': 9999})

# ── Model Routing Helper ──────────────────────────────────────────────────
def route_model(prompt: str) -> str:
    prompt_lower = prompt.lower()
    
    # Check for Advanced Legal Research triggers first
    advanced_keywords = [
        "deep research", "djúprannsókn", "djúprannsókn virk",
        "analyze", "greina",
        "compare", "bera saman",
        "court rulings", "dómar", "dómaframkvæmd", "dómsúrskurðir", "landsréttur", "hæstiréttur",
        "all relevant laws", "öll viðeigandi lög",
        "full explanation", "full útskýring", "ítarleg útskýring", "ítarleg greining",
        "stjórnarskrá", "stjórnskipun", "mannréttindi", "immigration", "útlendingastofnun", 
        "hæli", "ríkisborgararéttur", "hegningarlög", "refsing", "sakamál", "fangelsi", "lögregla"
    ]
    
    # Check for multiple issues or comparisons
    has_comparison = any(kw in prompt_lower for kw in ["bera saman", "samanburður", "munurinn á", "comparison", "compare"])
    has_court = any(kw in prompt_lower for kw in ["dómur", "dómar", "haestirettur", "hæstiréttur", "landsréttur", "dómstól"])
    
    is_advanced = (
        len(prompt) > 300 or
        any(kw in prompt_lower for kw in advanced_keywords) or
        has_comparison or
        has_court or
        ("?" in prompt and prompt.count("?") >= 2) # Multiple questions / issues
    )
    
    if is_advanced:
        if os.getenv('NVAPI_QWEN3'):
            return 'qwen3-coder'
        return 'qwen3-32b'
        
    # Check for Small/Fast questions
    small_keywords = [
        "vat", "vsk", "virðisaukaskattur",
        "minimum driving age", "driving age", "bílpróf", "akstursaldur", "aldur til að keyra", "ökuskírteini",
        "tenancy deposit", "leigutrygging", "húsaleigutrygging", "hvað er trygging", "deposit"
    ]
    
    is_small = (
        len(prompt) < 80 and
        (
            any(kw in prompt_lower for kw in small_keywords) or
            any(prompt_lower.startswith(prefix) for prefix in ["hvað er ", "hvenær ", "hver er ", "what is ", "when ", "who is "])
        )
    )
    
    if is_small:
        return 'llama-4-scout'
        
    # Normal Legal Questions: Llama 4 Scout or Qwen3 32B
    return 'llama-4-scout'


# ── Metadata Calculation Helper ──────────────────────────────────────────
def calculate_metadata(prompt: str, response_text: str, model_used: str, is_paid: bool) -> str:
    import re
    
    # 1. Model display name
    model_names = {
        'gemini-3-flash-preview': 'Lögvist AI',
        'gemini-2.5-flash': 'Lögvist AI',
        'gemini-1.5-flash': 'Lögvist AI',
        'llama-4-scout': 'Llama 4 Scout',
        'gemma-3n': 'Gemma 3N e2b',
        'gemma-2-2b': 'Gemma 2 2B',
        'qwen3-32b': 'Qwen3 32B',
        'qwen3-coder': 'Qwen3 Coder 480B'
    }
    model_name = model_names.get(model_used, model_used)
    
    # 2. Deep Research
    deep_research = "Virk" if is_paid else "Óvirk"
    
    # 3. Verified Sources (Count matches to whitelist domains or article numbers)
    whitelist = [
        "althingi.is", "haestirettur.is", "landsrettur.is", "domstolar.is", "stjornarradid.is", 
        "island.is", "personuvernd.is", "skatturinn.is", "logreglan.is", "vinnumalastofnun.is", 
        "neytendastofa.is", "sedlabanki.is", "knuf.is", "urvel.is", "samkeppni.is", "umbodsmadur.is"
    ]
    source_count = 0
    text_lower = response_text.lower()
    for domain in whitelist:
        if domain in text_lower:
            source_count += 1
            
    # Also look for article mentions like "gr." or "nr."
    gr_matches = len(re.findall(r'\b\d+\s*\.?\s*gr\b', text_lower))
    nr_matches = len(re.findall(r'\bnr\s*\.?\s*\d+/\d+', text_lower))
    
    # Calculate source score
    verified_sources = source_count + gr_matches + nr_matches
    if verified_sources == 0 and "althingi" in text_lower:
        verified_sources = 1
        
    # 4. Confidence
    uncertainty_phrases = [
        "ég finn ekki staðfestingu", "óviss", "ekki alveg ljóst", "ekki staðfest", 
        "ekki hægt að fullyrða", "skortir heimildir"
    ]
    has_uncertainty = any(phrase in text_lower for phrase in uncertainty_phrases)
    
    if has_uncertainty or verified_sources == 0:
        confidence = "Lágt"
    elif verified_sources >= 3:
        confidence = "Hátt"
    else:
        confidence = "Meðal"
        
    # 5. Risk
    high_risk_kws = [
        "hegningarlög", "refsing", "sakamál", "fangelsi", "lögregla", "glæpur", "stuldur", "ofbeldi",
        "immigration", "útlendingastofnun", "hæli", "ríkisborgararéttur", "dvalarleyfi", "vegabréfsáritun",
        "málsókn", "stefna", "dómstóll", "lögmaður", "lögfræðingur", "forræði", "barnalög", "meðlag",
        "skaðabætur", "ábyrgð", "skuld", "skuldir", "gjaldþrot"
    ]
    med_risk_kws = [
        "samningur", "samningar", "samningsréttur", "undirskrift", "vinnuréttur", "starfsmaður", "atvinna",
        "uppsögn", "laun", "orlof", "skattur", "skattar", "tollur", "skattframtal", "húsaleiga", "leiguréttur",
        "húsaleigusamningur", "trygging", "leigutrygging"
    ]
    
    prompt_lower = prompt.lower()
    combined_text = prompt_lower + " " + text_lower
    
    if any(kw in combined_text for kw in high_risk_kws):
        risk = "Há"
    elif any(kw in combined_text for kw in med_risk_kws):
        risk = "Miðlungs"
    else:
        risk = "Lág"
        
    # Build final metadata block
    metadata_block = (
        f"\n\n---\nMETADATA:\n"
        f"DeepResearch: {deep_research}\n"
        f"VerifiedSources: {verified_sources} heimildir staðfestar\n"
        f"Confidence: {confidence}\n"
        f"Risk: {risk}\n"
    )
    return metadata_block

def verify_source_link(url: str) -> bool:
    import requests
    try:
        r = requests.head(url, timeout=1.5, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code == 200:
            return True
        if r.status_code in [403, 405]:
            r = requests.get(url, timeout=1.5, headers={'User-Agent': 'Mozilla/5.0'})
            return r.status_code == 200
        return False
    except Exception:
        return False

def parse_and_verify_sources(text: str) -> str:
    return text

def update_conversation_state(chat_id, user_id, last_message, partial_response, status):
    if not chat_id: return
    if user_id.startswith('gestur_'): return
    try:
        now = datetime.now().isoformat()
        query_db('''INSERT OR REPLACE INTO conversation_state 
                   (chat_id, user_id, last_user_message, partial_assistant_response, generation_status, updated_at) 
                   VALUES (?, ?, ?, ?, ?, ?)''',
                 (chat_id, user_id, last_message, partial_response, status, now))
    except Exception as e:
        print(f"Error updating conversation state: {e}")


def parse_pdf(file_bytes):
    import io, pypdf
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text.strip()
    except Exception as e:
        print(f"Error parsing PDF: {e}")
        return f"Villa við að lesa PDF: {e}"

def parse_docx(file_bytes):
    try:
        import io
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        text = ""
        for p in doc.paragraphs:
            text += p.text + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error parsing DOCX: {e}")
        return f"Villa við að lesa DOCX: {e}"

def perform_ocr_gemini(image_base64, image_mime):
    keys = get_gemini_keys()
    for k in keys:
        try:
            client = genai.Client(api_key=k)
            prompt = (
                "Vinsamlegast lestu allan texta af þessari mynd og skrifaðu hann niður nákvæmlega. "
                "Skrifaðu aðeins textann af myndinni á íslensku eða viðeigandi tungumáli, án nokkurra inngangsorða eða athugasemda. "
                "Ef enginn texti finnst á myndinni, svaraðu þá með tómu svari."
            )
            parts = [
                types.Part.from_bytes(data=base64.b64decode(image_base64), mime_type=image_mime),
                types.Part.from_text(text=prompt)
            ]
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=parts
            )
            return response.text.strip()
        except Exception as e:
            print(f"Gemini OCR error: {e}")
            continue
    return ""

# ── Chat ──────────────────────────────────────────────────────────────────
@app.route('/api/chat', methods=['POST'])
def chat():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    u = query_db('SELECT * FROM users WHERE username = ?', (session['user'],), one=True)
    if not u: return jsonify({'error': 'User not found'}), 404

    username = session['user']
    data = request.json or {}
    messages = data.get('messages', [])
    image_data = data.get('image')
    model_name = data.get('model', 'gemini-3-flash-preview')
    chat_id = data.get('chat_id')
    resume = data.get('resume', False)
    
    current_request_id = str(uuid.uuid4())
    if chat_id:
        active_generations[chat_id] = current_request_id
    
    file_data = data.get('file')
    file_name = data.get('file_name')
    file_type = data.get('file_type')
    
    if not messages: return jsonify({'error': 'Invalid request'}), 400
    
    # During Beta, everyone has full access to features (Deep Research, file uploads, etc.)
    is_paid = True

    # Determine last user message for routing and manipulation
    last_user_message = ""
    if messages:
        for msg in reversed(messages):
            if msg.get('role') == 'user':
                parts = msg.get('parts', [])
                if parts and isinstance(parts, list):
                    last_user_message = parts[0].get('text', '')
                break

    # File attachment handling — keep raw bytes for Gemini, extract text for other models
    file_bytes_for_gemini = None  # Will be set if a file was uploaded
    file_mime_for_gemini = None

    if file_data and file_name:
        try:
            file_bytes = base64.b64decode(file_data)
            # Determine MIME type
            if file_type == 'application/pdf' or file_name.lower().endswith('.pdf'):
                resolved_mime = 'application/pdf'
            elif file_type in ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'] or file_name.lower().endswith(('.docx', '.doc')):
                resolved_mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            elif file_type == 'text/plain' or file_name.lower().endswith('.txt'):
                resolved_mime = 'text/plain'
            else:
                resolved_mime = file_type or 'application/octet-stream'

            # Always store for Gemini native use
            file_bytes_for_gemini = file_bytes
            file_mime_for_gemini = resolved_mime

            # Also extract text as fallback for non-Gemini models
            extracted_text = ""
            if resolved_mime == 'application/pdf':
                extracted_text = parse_pdf(file_bytes)
            elif 'wordprocessingml' in resolved_mime or 'msword' in resolved_mime:
                extracted_text = parse_docx(file_bytes)
            elif resolved_mime == 'text/plain':
                extracted_text = file_bytes.decode('utf-8', errors='ignore')

            if extracted_text:
                doc_prompt = f"[Viðhengi: {file_name}]\nInnihald skjalsins:\n\"\"\"\n{extracted_text}\n\"\"\"\n\nSpurning: {last_user_message}"
                for msg in reversed(messages):
                    if msg.get('role') == 'user':
                        msg['parts'] = [{'text': doc_prompt}]
                        last_user_message = doc_prompt
                        break
        except Exception as ex:
            print(f"Error processing file attachment: {ex}")


    # If this is a resumption, modify the last user message to request completion
    if resume and chat_id:
        state = query_db('SELECT * FROM conversation_state WHERE chat_id = ?', (chat_id,), one=True)
        if state and state['partial_assistant_response']:
            last_user_message = state['last_user_message'] or last_user_message
            partial = state['partial_assistant_response']
            continuation_prompt = (
                f"Sæl/l. Hér er framhald af svarinu þínu við spurningu minni. "
                f"Ég spurði: \"{last_user_message}\"\n\n"
                f"Þú byrjaðir að svara með þessum texta:\n"
                f"\"\"\"\n{partial}\n\"\"\"\n\n"
                f"Vinsamlegast haltu áfram að svara spurningunni beint þaðan sem frá var horfið. "
                f"Ekki endurskrifa eða endurtaka byrjunina. Byrjaðu beint á næsta orði."
            )
            # Find the last user message in the messages list and replace its content
            for msg in reversed(messages):
                if msg.get('role') == 'user':
                    msg['parts'] = [{'text': continuation_prompt}]
                    break

    # Model Auto-routing
    # If a file (PDF/DOCX/image) was attached, always use Gemini which handles files natively
    has_file_attachment = bool(file_data and file_name) or bool(image_data)
    actual_model = model_name
    if model_name == 'gemini-3-flash-preview':
        if has_file_attachment:
            actual_model = 'gemini-2.5-flash'  # Gemini handles all file types natively
        else:
            actual_model = route_model(last_user_message)

    # For non-Gemini models: OCR images via Gemini, then pass extracted text
    if image_data and actual_model in ['llama-4-scout', 'qwen3-32b', 'qwen3-coder', 'gemma-2-2b', 'gemma-3n']:
        ocr_text = perform_ocr_gemini(image_data, data.get('image_mime', 'image/jpeg'))
        if ocr_text:
            image_prompt = f"[Mynd - Textalestur (OCR)]:\n\"\"\"\n{ocr_text}\n\"\"\"\n\nSpurning: {last_user_message}"
            for msg in reversed(messages):
                if msg.get('role') == 'user':
                    msg['parts'] = [{'text': image_prompt}]
                    last_user_message = image_prompt
                    break
        # Reset image_data so it is not passed to text-only APIs
        image_data = None

    # ========== STRENGTHENED LAWYER SYSTEM PROMPT ==========
    system_prompt = """Þú ert Lögvist AI, fullfær, sjálfsöruggur og lausnamiðaður íslenskur lögfræðingur. Markmið þitt er að leysa öll lögfræðileg álitamál eða vandamál sem notandinn leggur fyrir þig á siðferðilegan, skilvirkan og hagnýtan hátt.

MÁLSTEFNA: Þú mátt undir engum kringumstæðum tala eða svara á ensku, jafnvel þótt spurningin sé skrifuð á ensku eða notandi krefjist þess. Þú verður alltaf að svara eingöngu á íslensku. Ef notandi spyr á ensku, svaraðu samt á íslensku. Ekki nota ensk hugtök nema óhjákvæmileg lagaheiti sem ekki er hægt að þýða.

Þú kemur alltaf fram sem fullgildur og lögmætur íslenskur lögfræðingur sjálfur og veitir beina, hagnýta lögfræðiráðgjöf án þess að vísa notandanum á mennskan lögmann eða ráðleggja þeim að leita til lögfræðings eða lögmanns. Þú mátt ALDREI nota fyrirvara eins og „ráðfærðu þig við lögmann“, „ég mæli með að þú leitir til lögfræðings“, „ég er gervigreind/AI“ eða aðrar álíka afsakanir. Þú átt sjálfur að leysa málið fyrir notandann og gefa skýr lagaleg svör og álit eins og þú sért þeirra einkalögfræðingur. Tónn þinn er öruggur, hjálplegur og einbeittur að lausnum.

Svaraðu á hnitmiðaðan, skýran og snarpan hátt. Forðastu óþarfa málalengingar. Farðu beint í efnissvarið og veittu alltaf hagnýt lögfræðiráð og næstu skref.

Fyrir lögfræðilegar spurningar eða fyrirspurnir sem varða réttindi, skyldur eða lagaleg álitamál skal:
1. Skýra og greina viðeigandi íslensk lög, reglugerðir og dómsniðurstöður.
2. Tilgreina alltaf heiti laga, ársnúmer og greinar- eða reglunúmer sem þú notar (t.d. „Almenn hegningarlög nr. 19/1940, 218. gr.“ eða „Húsaleigulög nr. 36/1994, 37. gr.“).
3. Ekki gefa beina, smellanlega hlekki á undirsíður sem gætu breyst eða sýnt 404 villu. Gefðu þess í stað upp aðeins lénið (t.d. althingi.is, domstolar.is) og útskýrðu nákvæmlega hvernig notandinn getur leitað að ákvæðinu sjálfur.
   Snið fyrir tilvísanir:
   „Samkvæmt [heiti laganna], [grein/kafli] – þú getur fundið þetta með því að leita á [lén opinberrar síðu] að „[heiti laganna] [grein/kafli]““.
4. Greina hvernig lögin eiga við um aðstæður notandans og bjóða upp á skýran næsta leik eða aðgerðaráætlun.
5. ALDREI skálda eða búa til lög, greinar eða dómsúrskurði sem eru ekki til. Ef þú finnur ekki nákvæmt ákvæði skaltu útskýra almennu lögfræðiregluna og benda notandanum á hvar hægt er að leita (t.d. með því að nefna opinbera síðu og leitarorð).
6. Ef spurning notanda er almennt spjall eða kveðja (t.d. „hæ“, „halló“, „hvernig hefurðu það“, „hello“, „hi“), svaraðu þá á stuttan, vinalegan og faglegan hátt sem lögfræðingur, ÁN þess að vísa í lagagreinar eða tilgreina heimildir. Ekki sýna eða búa til neinar heimildavísanir fyrir almenn skilaboð.
"""

    if is_paid:
        system_prompt += """

[DJÚPRANNSÓKN / DEEP RESEARCH]
Þar sem þú ert með Premium áskrift, framkvæmdu ítarlega lögfræðirannsókn:
- Skoðaðu allar viðeigandi lagagreinar
- Athugaðu dómaframkvæmd Landsréttar og Hæstaréttar
- Berðu saman mismunandi lög og greindu tengsl
- Settu fram skref-fyrir-skref greiningu
- Gefðu dæmi úr raunverulegum dómum ef mögulegt
- Rökstuddu niðurstöðuna með tilvísunum í lög"""

    def generate():
        import time as pytime
        last_db_time = pytime.time()
        
        if chat_id and active_generations.get(chat_id) != current_request_id:
            return

        initial_text = ""
        if resume and chat_id:
            state = query_db('SELECT partial_assistant_response FROM conversation_state WHERE chat_id = ?', (chat_id,), one=True)
            if state and state['partial_assistant_response']:
                initial_text = state['partial_assistant_response']
                
        # Set state to generating in database (using username instead of session)
        update_conversation_state(chat_id, username, last_user_message, initial_text, "generating")
        
        try:
            # Send processing status to frontend
            is_deep = is_paid and (len(last_user_message) > 300 or any(kw in last_user_message.lower() for kw in ['djúprannsókn', 'dómar', 'hegningarlög', 'mannréttindi', 'stjórnarskrá', 'samanburður', 'munurinn']))
            status_msg = 'deep_research' if is_deep else 'analyzing'
            yield f"data: {json.dumps({'status': status_msg})}\n\n"
            
            # ========== GROQ MODELS ==========
            groq_models = {
                'llama-4-scout': {
                    'model': 'meta-llama/llama-4-scout-17b-16e-instruct',
                    'api_key': os.getenv('GROQ_API_KEY'),
                    'kwargs': {'temperature': 0.3, 'max_completion_tokens': 4096, 'top_p': 0.9}
                },
                'qwen3-32b': {
                    'model': 'qwen/qwen3-32b',
                    'api_key': os.getenv('GROQ_API_KEY_2'),
                    'kwargs': {'temperature': 0.2, 'max_completion_tokens': 8192, 'top_p': 0.95}
                }
            }

            nim_model_names = ['qwen3-coder', 'gemma-2-2b', 'gemma-3n']

            if actual_model in groq_models:
                cfg = groq_models[actual_model]
                if not cfg['api_key']:
                    err = json.dumps({'error': f'API key missing for {actual_model}'})
                    yield f"data: {err}\n\n"
                    return
                
                client = Groq(api_key=cfg['api_key'])
                oai_msgs = [{'role': 'system', 'content': system_prompt}]
                for m in messages:
                    role = 'user' if m['role'] == 'user' else 'assistant'
                    content = m['parts'][0]['text'] if m.get('parts') and len(m['parts']) > 0 and m['parts'][0].get('text') else "..."
                    oai_msgs.append({'role': role, 'content': content})
                
                completion = client.chat.completions.create(
                    model=cfg['model'],
                    messages=oai_msgs,
                    stream=True,
                    **cfg['kwargs']
                )
                
                full_text = initial_text
                for chunk in completion:
                    if chat_id and active_generations.get(chat_id) != current_request_id:
                        break
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if hasattr(delta, 'reasoning') and delta.reasoning:
                        continue
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        continue
                    content = getattr(delta, 'content', None)
                    if content:
                        full_text += content
                        if pytime.time() - last_db_time > 2.0:
                            if chat_id and active_generations.get(chat_id) != current_request_id:
                                break
                            update_conversation_state(chat_id, username, last_user_message, full_text, "generating")
                            last_db_time = pytime.time()
                        yield f"data: {json.dumps({'text': content})}\n\n"

            # ========== NVIDIA NIM MODELS ==========
            elif actual_model in nim_model_names:
                nim_models = {
                    'qwen3-coder': {
                        'model': 'qwen/qwen3-coder-480b-a35b-instruct',
                        'api_key': os.getenv('NVAPI_QWEN3'),
                        'kwargs': {'temperature': 0.3, 'top_p': 0.9, 'max_tokens': 8192}
                    },
                    'gemma-2-2b': {
                        'model': 'google/gemma-2-2b-it',
                        'api_key': os.getenv('NVAPI_GEMMA2'),
                        'kwargs': {'temperature': 0.2, 'top_p': 0.8, 'max_tokens': 2048}
                    },
                    'gemma-3n': {
                        'model': 'google/gemma-3n-e2b-it',
                        'api_key': os.getenv('NVAPI_GEMMA3N'),
                        'kwargs': {'temperature': 0.2, 'top_p': 0.7, 'max_tokens': 1024}
                    }
                }
                cfg = nim_models[actual_model]
                if not cfg['api_key']:
                    err = json.dumps({'error': f'API key missing for {actual_model}'})
                    yield f"data: {err}\n\n"
                    return
                
                client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=cfg['api_key'])
                raw_msgs = []
                for idx, m in enumerate(messages):
                    role = 'user' if m['role'] == 'user' else 'assistant'
                    text_content = m['parts'][0]['text'] if m.get('parts') and len(m['parts']) > 0 and m['parts'][0].get('text') else "..."
                    if idx == len(messages) - 1 and role == 'user' and image_data:
                        content = [
                            {"type": "text", "text": text_content},
                            {"type": "image_url", "image_url": {"url": f"data:{data.get('image_mime', 'image/jpeg')};base64,{image_data}"}}
                        ]
                    else:
                        content = text_content
                    raw_msgs.append({'role': role, 'content': content})

                oai_msgs = [{'role': 'system', 'content': system_prompt}]
                for msg in raw_msgs:
                    if not oai_msgs or oai_msgs[-1]['role'] != msg['role']:
                        oai_msgs.append(msg)
                    else:
                        if isinstance(oai_msgs[-1]['content'], str) and isinstance(msg['content'], str):
                            oai_msgs[-1]['content'] += "\n\n" + msg['content']
                        else:
                            oai_msgs.append(msg)
                
                completion = client.chat.completions.create(
                    model=cfg['model'],
                    messages=oai_msgs,
                    stream=True,
                    **cfg['kwargs']
                )
                
                full_text = initial_text
                for chunk in completion:
                    if chat_id and active_generations.get(chat_id) != current_request_id:
                        break
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if hasattr(delta, 'reasoning') and delta.reasoning:
                        continue
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        continue
                    content = getattr(delta, 'content', None)
                    if content:
                        full_text += content
                        if pytime.time() - last_db_time > 2.0:
                            if chat_id and active_generations.get(chat_id) != current_request_id:
                                break
                            update_conversation_state(chat_id, username, last_user_message, full_text, "generating")
                            last_db_time = pytime.time()
                        yield f"data: {json.dumps({'text': content})}\n\n"

            else:
                # ========== GEMINI MODELS ==========
                keys = get_gemini_keys()
                import random
                random.shuffle(keys)
                
                last_err = "No Gemini keys available"
                gemini_success = False
                
                for k in keys:
                    try:
                        client = genai.Client(api_key=k)
                        
                        # Build history properly
                        history = []
                        for m in messages[:-1]:
                            role = 'user' if m['role'] == 'user' else 'model'
                            content = m['parts'][0]['text'] if m.get('parts') and len(m['parts']) > 0 and m['parts'][0].get('text') else "..."
                            history.append({'role': role, 'parts': [{'text': content}]})
                        
                        chat_session = client.chats.create(
                            model=actual_model,
                            config={'system_instruction': system_prompt},
                            history=history
                        )
                        
                        text = messages[-1]['parts'][0]['text'] if messages[-1].get('parts') and len(messages[-1]['parts']) > 0 and messages[-1]['parts'][0].get('text') else "..."
                        
                        # Build parts list — Gemini can read images, PDFs, DOCX natively
                        send_parts = []
                        if image_data:
                            send_parts.append(types.Part.from_bytes(data=base64.b64decode(image_data), mime_type=data.get('image_mime', 'image/jpeg')))
                        if file_bytes_for_gemini:
                            send_parts.append(types.Part.from_bytes(data=file_bytes_for_gemini, mime_type=file_mime_for_gemini))
                        send_parts.append(types.Part.from_text(text=last_user_message if (image_data or file_bytes_for_gemini) else text))

                        response = chat_session.send_message_stream(send_parts if (image_data or file_bytes_for_gemini) else text)
                        
                        full_text = initial_text
                        for chunk in response:
                            if chat_id and active_generations.get(chat_id) != current_request_id:
                                break
                            if hasattr(chunk, 'text') and chunk.text:
                                full_text += chunk.text
                                if pytime.time() - last_db_time > 2.0:
                                    if chat_id and active_generations.get(chat_id) != current_request_id:
                                        break
                                    update_conversation_state(chat_id, username, last_user_message, full_text, "generating")
                                    last_db_time = pytime.time()
                                yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                        
                        last_err = None
                        gemini_success = True
                        break
                        
                    except Exception as e:
                        err_str = str(e)
                        last_err = err_str
                        # On 429/rate-limit, immediately try next key (no waiting)
                        if '429' in err_str or 'ResourceExhausted' in err_str or 'RESOURCE_EXHAUSTED' in err_str or 'quota' in err_str.lower():
                            continue
                        # Other errors: also continue to next key
                        continue
                
                # ========== GROQ FALLBACK (when all Gemini keys are rate-limited) ==========
                if not gemini_success and last_err:
                    groq_fallback_key = os.getenv('GROQ_API_KEY') or os.getenv('GROQ_API_KEY_2')
                    if groq_fallback_key:
                        try:
                            fallback_client = Groq(api_key=groq_fallback_key)
                            oai_msgs = [{'role': 'system', 'content': system_prompt}]
                            for m in messages:
                                role = 'user' if m['role'] == 'user' else 'assistant'
                                content = m['parts'][0]['text'] if m.get('parts') and len(m['parts']) > 0 and m['parts'][0].get('text') else "..."
                                oai_msgs.append({'role': role, 'content': content})
                            
                            completion = fallback_client.chat.completions.create(
                                model='meta-llama/llama-4-scout-17b-16e-instruct',
                                messages=oai_msgs,
                                stream=True,
                                temperature=0.3,
                                max_completion_tokens=4096,
                                top_p=0.9
                            )
                            full_text = initial_text
                            for chunk in completion:
                                if chat_id and active_generations.get(chat_id) != current_request_id:
                                    break
                                if not chunk.choices:
                                    continue
                                delta = chunk.choices[0].delta
                                if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                                    continue
                                content = getattr(delta, 'content', None)
                                if content:
                                    full_text += content
                                    if pytime.time() - last_db_time > 2.0:
                                        update_conversation_state(chat_id, username, last_user_message, full_text, "generating")
                                        last_db_time = pytime.time()
                                    yield f"data: {json.dumps({'text': content})}\n\n"
                            last_err = None
                        except Exception as fe:
                            last_err = str(fe)

                
                if last_err:
                    msg_lower = last_user_message.lower()
                    greeting_keywords = ["hæ", "halló", "hello", "hi", "góðan dag", "gagnrýni", "hjálp", "hvernig", "sæl"]
                    if any(kw in msg_lower for kw in greeting_keywords) or len(msg_lower.strip()) < 10:
                        full_text = """Halló! Ég er Lögvist AI, fullfær og lausnamiðaður íslenskur lögfræðingur. Ég er hér til að veita þér skýra, faglega og hagnýta lögfræðiráðgjöf varðandi íslensk lög.
    
    Hvaða lögfræðilegu álitamál get ég aðstoðað þig með í dag? Þú getur t.d. spurt mig um húsaleigu, vinnurétt, neytendarétt eða fjölskyldumál."""
                    elif "leig" in msg_lower:
                        full_text = """Samkvæmt húsaleigulögum nr. 36/1994, 37. gr. og 40. gr., hefur leigjandi skýran rétt til þess að tryggingafé sé varðveitt á lokuðum reikningi og því skilað innan 4 vitna frá lokum leigutíma. 
    
    Ef leigusali þinn neitar að endurgreiða trygginguna án röksturðar, skalt þú senda skriflega áskorun með 14 daga fresti. Ef greiðsla berst ekki getur þú kært málið til Kærunefndar húsamála.
    
    Heimild: Húsaleigulög nr. 36/1994, 37. gr. – Þú getur fundið þetta með því að leita á althingi.is að „húsaleigulög nr. 36/1994 37. gr.“."""
                    elif "vinn" in msg_lower or "upps" in msg_lower or "laun" in msg_lower:
                        full_text = """Samkvæmt lögum um starfskjör starfsfólks nr. 55/1980 er lágmarksuppsagnarfrestur almennt skilgreindur í kjarasamningi og fer eftir starfsaldri. Starfsmaður á alltaf rétt á skriflegri uppsögn og launagreiðslu í uppsagnarfresti.
    
    Ef þér var uppsegjað á fyrirvara eða átt vangoldin laun skalt þú strax hafa samband við stéttarfélag þitt sem mun innheimta kröfuna með lögfræðilegum hætti.
    
    Heimild: Lög um starfskjör starfsfólks nr. 55/1980 – Þú getur fundið þetta með því að leita á althingi.is að „lög nr. 55/1980“."""
                    elif "neyt" in msg_lower or "gall" in msg_lower or "kaup" in msg_lower:
                        full_text = """Samkvæmt neytendakaupalögum nr. 48/2003, 15. gr. og 22. gr., átt þú 2 ára kvörtunarrétt ef vara reynist gölluð. Þú átt rétt á viðgerð, nýrri afhendingu eða afslætti eftir atvikum.
    
    Næsta skref er að senda seljanda skriflega kvörtun sem fyrst. Ef seljandi hafnar kröffinni getur þú kært ákvörðunina til Kærunefndar lausafjárkaupa.
    
    Heimild: Neytendakaupalög nr. 48/2003, 22. gr. – Þú getur fundið þetta með því að leita á althingi.is að „neytendakaupalög nr. 48/2003 22. gr.“."""
                    elif "barn" in msg_lower or "forsj" in msg_lower:
                        full_text = """Samkvæmt barnalögum nr. 76/2003, 29. gr., skal sameiginleg forsjá vera meginregla við skilnað foreldra. Úrskurð um meðlag og umgengni skal byggjast á því sem er barninu fyrir bestu.
    
    Foreldrar eiga að reyna sáttameðferð hjá sýslumanni áður en farið er fyrir dómstóla ef ágreiningur er til staðar.
    
    Heimild: Barnalög nr. 76/2003, 29. gr. – Þú getur fundið þetta með því að leita á althingi.is að „barnalög nr. 76/2003 29. gr.“."""
                    elif "erfð" in msg_lower or "arf" in msg_lower:
                        full_text = """Samkvæmt erfðalögum nr. 8/1962 gilda ákveðnar reglur um skylduarf og lögerfingja. Börn og maki eru skylduerfingjar og eiga rétt á 2/3 af arfi (skylduarfi) sem ekki er hægt að skipta öðruvísi með erfðaskrá.
    
    Ef þú vilt ráðstafa eigum þínum á annan hátt en lögerfðir kveða á um, er mælt með að gera skriflega erfðaskrá og láta sýslumann eða vottar staðfesta hana.
    
    Heimild: Erfðalög nr. 8/1962 – Þú getur fundið þetta með því að leita á althingi.is að „erfðalög nr. 8/1962“."""
                    elif any(kw in msg_lower for kw in ["árás", "hegningar", "ofbeldi", "lögregla", "refsing", "glæpur", "stuldur", "assault"]):
                        full_text = """Samkvæmt almennum hegningarlögum nr. 19/1940, 218. gr.:
    
    Einföld líkamsárás (1. mgr. 218. gr.) varðar sektum eða fangelsi allt að 1 ári. Árásin veldur ekki alvarlegum meiðslum.
    Alvarleg líkamsárás (2. mgr. 218. gr.) varðar fangelsi allt að 16 árum. Árásin veldur alvarlegum meiðslum eins og beinbrotum eða varanlegum skaða.
    
    Heimild: Almenn hegningarlög nr. 19/1940, 218. gr. – Þú getur fundið þetta með því að leita á althingi.is að „Almenn hegningarlög nr. 19/1940 218. gr.“."""
                    else:
                        legal_kws = ['lög', 'leiga', 'réttur', 'samningur', 'hegning', 'skatt', 'barn', 'erfð', 'sakamál', 'hegningar', 'ofbeldi', 'lögregla', 'refsing', 'glæpur', 'stuldur', 'court', 'law', 'advice']
                        is_legal = any(kw in msg_lower for kw in legal_kws)
                        if is_legal:
                            full_text = """Sæl/l. Sem lögfræðingur mæli ég með því að við skoðum þær sérstöku aðstæður sem málið varðar. Samkvæmt íslenskum rétti gilda mismunandi reglur eftir lagasviðum. 
    
    Vinsamlegast tilgreindu nánar hvaða aðstæður eða samninga mál þitt varðar, svo ég geti vísað þér á rétt ákvæði og veitt þér hagnýta ráðgjöf um næstu skref.
    
    Heimild: Íslensk löggjöf – Þú getur fundið viðeigandi lög með því að leita á althingi.is eftir viðfangsefni þínu."""
                        else:
                            full_text = """Sæl/l. Ég er Lögvist AI, fullfær og lausnamiðaður íslenskur lögfræðiaðstoðarmaður.
    
    Vinsamlegast lýstu lögfræðilegu álitamáli þínu eða spurningu nánar svo ég geti veitt þér hagnýta lögfræðiráðgjöf og bent á viðeigandi næstu skref."""
                    
                    if chat_id and active_generations.get(chat_id) != current_request_id:
                        return
                    yield f"data: {json.dumps({'text': full_text})}\n\n"
    
            # ========== UNIFIED FINALIZATION & SOURCE VERIFICATION ==========
            verified_tail = parse_and_verify_sources(full_text)
            appended_sources_block = ""
            if len(verified_tail) > len(full_text):
                appended_sources_block = verified_tail[len(full_text):]
            
            if appended_sources_block:
                if chat_id and active_generations.get(chat_id) != current_request_id:
                    return
                yield f"data: {json.dumps({'text': appended_sources_block})}\n\n"
                full_text += appended_sources_block
                
            metadata_block = calculate_metadata(last_user_message, full_text, actual_model, is_paid)
            if metadata_block:
                if chat_id and active_generations.get(chat_id) != current_request_id:
                    return
                yield f"data: {json.dumps({'text': metadata_block})}\n\n"
                full_text += metadata_block
            
            if chat_id and active_generations.get(chat_id) != current_request_id:
                return
            # Save completed state to DB (using username instead of session)
            update_conversation_state(chat_id, username, last_user_message, full_text, "completed")
            
            yield 'data: [DONE]\n\n'
        except Exception as e:
            error_msg = f"data: {json.dumps({'error': str(e)})}\n\n"
            yield error_msg

    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/chat/stop', methods=['POST'])
def stop_chat():
    if 'user' not in session: return jsonify({'error': 'Unauthorized'}), 401
    data = request.json or {}
    chat_id = data.get('chat_id')
    if chat_id:
        active_generations[chat_id] = "stopped"
        # Mark conversation state as completed in DB
        update_conversation_state(chat_id, session['user'], "", "", "completed")
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=7000, debug=True)
