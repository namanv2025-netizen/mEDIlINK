import sqlite3
from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'database.db')

@app.before_request
def setup():
    """Ensure DB is initialized on first request"""
    init_db()

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Create Hospitals table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hospitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            type TEXT NOT NULL,
            contact TEXT NOT NULL,
            beds_available INTEGER DEFAULT 0,
            icu_available INTEGER DEFAULT 0
        )
    ''')
    
    # Check for missing columns and add them if necessary (for existing DBs)
    cursor.execute("PRAGMA table_info(hospitals)")
    columns = [row[1] for row in cursor.fetchall()]
    if 'beds_available' not in columns:
        cursor.execute("ALTER TABLE hospitals ADD COLUMN beds_available INTEGER DEFAULT 0")
    if 'icu_available' not in columns:
        cursor.execute("ALTER TABLE hospitals ADD COLUMN icu_available INTEGER DEFAULT 0")
    
    # Create Queries table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if hospitals are already populated
    cursor.execute("SELECT COUNT(*) FROM hospitals")
    if cursor.fetchone()[0] == 0:
        # Insert mock hospital data (example coordinates around a common location, 
        # actual map will calculate relative to user, but let's provide some generic ones that JS will offset or just show nearby generically)
        # Note: In a real app we'd fetch actual nearby data. Here we provide some realistic mock data.
        mock_hospitals = [
            ("City General Hospital", 28.6139, 77.2090, "Government", "011-23456789", 45, 12),
            ("Apollo Private Hospital", 28.6150, 77.2150, "Private", "011-98765432", 15, 4),
            ("St. Jude Medical Center", 28.6200, 77.2000, "Private", "011-55554444", 8, 2),
            ("District Civil Hospital", 28.6100, 77.2200, "Government", "011-33332222", 120, 25),
            ("Sunrise Emergency Care", 28.6250, 77.2100, "Private", "011-11110000", 3, 0)
        ]
        cursor.executemany("INSERT INTO hospitals (name, lat, lng, type, contact, beds_available, icu_available) VALUES (?, ?, ?, ?, ?, ?, ?)", mock_hospitals)
        
    conn.commit()
    conn.close()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/hospitals')
def get_hospitals():
    """Return all hospitals as JSON"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM hospitals")
    hospitals = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(hospitals)

@app.route('/api/contact', methods=['POST'])
def submit_contact():
    """Store user queries"""
    data = request.json
    name = data.get('name')
    email = data.get('email')
    message = data.get('message')
    
    if not name or not email or not message:
        return jsonify({"error": "Missing fields"}), 400
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO queries (name, email, message) VALUES (?, ?, ?)", (name, email, message))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "message": "Query received. We will get back to you soon!"})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
