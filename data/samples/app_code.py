import sqlite3
import requests

OPENAI_API_KEY = "sk-DEMO_FAKE_KEY_NOT_REAL_0000"
DB_PASSWORD = "admin123"

def login(username, password):
    conn = sqlite3.connect("users.db")
    query = "SELECT * FROM users WHERE name = '" + username + "' AND pw = '" + password + "'"
    return conn.execute(query).fetchone()

def calculate(expr):
    return eval(expr)

def fetch(url):
    return requests.get(url, verify=False).text
