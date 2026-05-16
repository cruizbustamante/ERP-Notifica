"""
Configuración compartida para scripts de scraping.
Credenciales SII, Banco, y conexión Supabase.
"""

# ============================================================
# SII
# ============================================================
SII_RUT = "78036379-7"
SII_CLAVE = "Legal.25"

# ============================================================
# BANCO SANTANDER
# ============================================================
BANCO_RUT = "19875994-5"
BANCO_CLAVE = "19Virp_"

# ============================================================
# SUPABASE (reemplaza Google Sheets)
# ============================================================
SUPABASE_URL = "https://djjvrzbrzbctoclzywrw.supabase.co"
# IMPORTANTE: usar la service_role key (no anon) para bypass RLS
# Obtener desde: Supabase Dashboard > Settings > API > service_role key
SUPABASE_SERVICE_KEY = "PEGAR_SERVICE_ROLE_KEY_AQUI"

# ============================================================
# RUTAS LOCALES
# ============================================================
RUTA_DESCARGAS = r"C:\Users\cruiz\Downloads"

# ============================================================
# OPCIONES
# ============================================================
MODO_HEADLESS = True
