import psycopg2

try:
    conn = psycopg2.connect(
        host="localhost",
        port="5432",
        database="axentra",
        user="postgres",
        password="Micro506"
    )
    print("✅ ¡Conexión exitosa a PostgreSQL desde Python!")
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")