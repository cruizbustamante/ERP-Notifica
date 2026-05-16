"""
Scraping SII - Registro de Ventas → Supabase
Basado en el script original de Carlos Ruiz Bustamante.
Adaptado para subir directamente a Supabase en vez de Google Sheets.
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
import time
import os
import glob
import pandas as pd
from supabase import create_client
from config import SII_RUT, SII_CLAVE, SUPABASE_URL, SUPABASE_SERVICE_KEY, RUTA_DESCARGAS, MODO_HEADLESS

# Periodos a consultar: lista de tuplas (MES, AÑO)
PERIODOS = [
    ("04", "2026"),
]

MAPA_DTE = {
    33: "FAC", 34: "FEX", 39: "BV", 41: "BVE",
    46: "FC", 48: "VT", 52: "GD", 56: "ND", 61: "NC",
    110: "FEX", 111: "NCE", 112: "NDE",
}


def iniciar_navegador():
    options = Options()
    if MODO_HEADLESS:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
    else:
        options.add_argument("--start-maximized")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-extensions")
    options.add_argument("--blink-settings=imagesEnabled=false")
    options.page_load_strategy = "eager"
    prefs = {
        "download.default_directory": RUTA_DESCARGAS,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    if MODO_HEADLESS:
        driver.execute_cdp_cmd("Page.setDownloadBehavior", {
            "behavior": "allow", "downloadPath": RUTA_DESCARGAS
        })
    return driver


def login_sii(driver):
    print("Navegando a homer.sii.cl...")
    driver.get("https://homer.sii.cl/")
    wait = WebDriverWait(driver, 15)
    wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Ingresar a Mi Sii"))).click()
    campo_rut = wait.until(EC.presence_of_element_located((By.ID, "rutcntr")))
    campo_rut.clear()
    campo_rut.send_keys(SII_RUT)
    campo_clave = wait.until(EC.presence_of_element_located((By.ID, "clave")))
    campo_clave.clear()
    campo_clave.send_keys(SII_CLAVE)
    wait.until(EC.element_to_be_clickable((By.ID, "bt_ingresar"))).click()
    wait.until(EC.presence_of_element_located((By.LINK_TEXT, "Servicios online")))
    print("Login OK")


def navegar_a_registro(driver):
    wait = WebDriverWait(driver, 15)
    try:
        btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable(
            (By.XPATH, "//div[contains(@class,'modal')]//button[contains(@class,'close') or contains(text(),'Cerrar')]")
        ))
        btn.click()
    except Exception:
        try:
            driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        except Exception:
            pass
    link = wait.until(EC.presence_of_element_located((By.LINK_TEXT, "Servicios online")))
    driver.execute_script("arguments[0].click();", link)
    wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Impuestos mensuales"))).click()
    link_reg = wait.until(EC.presence_of_element_located((By.XPATH, "//a[contains(@href, '1042-3253.html')]")))
    driver.execute_script("arguments[0].click();", link_reg)
    wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Ingresar al Registro de Compras y Ventas"))).click()
    time.sleep(2)
    print("Navegacion OK")


def descargar_periodo(driver, periodo_mes, periodo_anho):
    wait = WebDriverWait(driver, 15)
    time.sleep(3)
    Select(wait.until(EC.presence_of_element_located((By.ID, "periodoMes")))).select_by_value(periodo_mes)
    Select(wait.until(EC.presence_of_element_located(
        (By.XPATH, "//select[@ng-model='periodoAnho']")
    ))).select_by_value(periodo_anho)
    wait.until(EC.element_to_be_clickable(
        (By.XPATH, "//button[@type='submit' and contains(text(), 'Consultar')]")
    )).click()
    time.sleep(3)
    tab = wait.until(EC.presence_of_element_located((By.XPATH, "//strong[text()='VENTA']")))
    driver.execute_script("arguments[0].click();", tab)
    time.sleep(2)
    btn = wait.until(EC.presence_of_element_located((By.XPATH, "//button[contains(text(), 'Descargar Detalles')]")))
    driver.execute_script("arguments[0].click();", btn)
    print(f"Descarga {periodo_mes}/{periodo_anho} iniciada")


def esperar_csv(periodo_mes, periodo_anho, timeout=30):
    patron = os.path.join(RUTA_DESCARGAS, f"RCV_VENTA_{SII_RUT}_{periodo_anho}{periodo_mes}*.csv")
    for i in range(timeout):
        archivos = [a for a in glob.glob(patron) if not a.endswith(".crdownload")]
        if archivos:
            return max(archivos, key=os.path.getmtime)
        time.sleep(1)
    return None


def limpiar_csv_anteriores(periodo_mes, periodo_anho):
    patron = os.path.join(RUTA_DESCARGAS, f"RCV_VENTA_{SII_RUT}_{periodo_anho}{periodo_mes}*")
    for a in glob.glob(patron):
        try:
            os.remove(a)
        except PermissionError:
            pass


def subir_a_supabase(csv_path, periodo_mes, periodo_anho):
    """Lee CSV del SII y sube registros nuevos a Supabase."""
    print(f"Leyendo CSV: {csv_path}")
    df = pd.read_csv(csv_path, sep=";", encoding="latin-1", index_col=False)
    print(f"  {len(df)} registros en CSV")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Obtener folios existentes para este periodo
    existing = supabase.table("ventas_sii").select("tipo_dte, folio").execute()
    claves_existentes = {f"{r['tipo_dte']}-{r['folio']}" for r in (existing.data or [])}

    nuevos = 0
    duplicados = 0
    batch = []

    for _, row in df.iterrows():
        tipo_dte = int(row.get("Tipo Doc", 33))
        folio = str(row.get("Folio", "")).strip()
        clave = f"{tipo_dte}-{folio}"

        if clave in claves_existentes:
            duplicados += 1
            continue

        fecha_str = str(row.get("Fecha Docto", "")).strip()
        try:
            fecha = pd.to_datetime(fecha_str, dayfirst=True).strftime("%Y-%m-%d")
        except Exception:
            fecha = None

        # Referencia para NC/ND
        tipo_doc_ref = None
        folio_doc_ref = ""
        try:
            ref_val = row.get("Tipo Docto. Referencia", None)
            if pd.notna(ref_val) and int(ref_val) > 0:
                tipo_doc_ref = int(ref_val)
        except (ValueError, TypeError):
            pass
        try:
            ref_folio = row.get("Folio Docto. Referencia", None)
            if pd.notna(ref_folio) and str(ref_folio).strip():
                folio_doc_ref = str(int(float(ref_folio)))
        except (ValueError, TypeError):
            pass

        registro = {
            "periodo": f"{periodo_anho}-{periodo_mes}",
            "tipo_dte": tipo_dte,
            "tipo_dte_nombre": MAPA_DTE.get(tipo_dte, str(tipo_dte)),
            "rut_receptor": str(row.get("Rut Receptor", row.get("RUT Receptor", ""))).strip(),
            "razon_social": str(row.get("Razon Social", "")).strip(),
            "folio": folio,
            "fecha_emision": fecha,
            "monto_exento": float(row.get("Monto Exento", 0) or 0),
            "monto_neto": float(row.get("Monto Neto", 0) or 0),
            "monto_iva": float(row.get("Monto IVA", row.get("Monto Iva", 0)) or 0),
            "monto_total": float(row.get("Monto total", row.get("Monto Total", 0)) or 0),
            "estado_sii": str(row.get("Estado SII", "")).strip(),
            "tipo_doc_ref": tipo_doc_ref,
            "folio_doc_ref": folio_doc_ref,
            "anio": int(periodo_anho),
            "mes": int(periodo_mes),
            "centralizado": False,
        }
        batch.append(registro)
        claves_existentes.add(clave)
        nuevos += 1

        if len(batch) >= 100:
            supabase.table("ventas_sii").insert(batch).execute()
            batch = []

    if batch:
        supabase.table("ventas_sii").insert(batch).execute()

    print(f"  Nuevos: {nuevos} | Duplicados: {duplicados}")


def main():
    driver = None
    periodos_ok = []
    try:
        driver = iniciar_navegador()
        login_sii(driver)
        navegar_a_registro(driver)

        for periodo_mes, periodo_anho in PERIODOS:
            print(f"\n--- Periodo {periodo_mes}/{periodo_anho} ---")
            limpiar_csv_anteriores(periodo_mes, periodo_anho)
            descargar_periodo(driver, periodo_mes, periodo_anho)
            csv_path = esperar_csv(periodo_mes, periodo_anho)
            if csv_path:
                periodos_ok.append((csv_path, periodo_mes, periodo_anho))
            else:
                print(f"  CSV no descargado, saltando")
    except Exception as e:
        print(f"Error scraping: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if driver:
            driver.quit()

    for csv_path, periodo_mes, periodo_anho in periodos_ok:
        try:
            subir_a_supabase(csv_path, periodo_mes, periodo_anho)
        except Exception as e:
            print(f"Error subiendo {periodo_mes}/{periodo_anho}: {e}")
            import traceback
            traceback.print_exc()

    print("\nProceso ventas finalizado.")


if __name__ == "__main__":
    main()
