import sqlite3
import requests

AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
DB_PASSWORD = "admin123"

def login(username, password):
    conn = sqlite3.connect("users.db")
    query = "SELECT * FROM users WHERE name = '" + username + "' AND pw = '" + password + "'"
    return conn.execute(query).fetchone()

def calculate(expr):
    return eval(expr)

def fetch(url):
    return requests.get(url, verify=False).text
