"""
Scraping Santander OffBanking - Cartola Cuenta Corriente → Supabase
Basado en el script original de Carlos Ruiz Bustamante.
Adaptado para subir directamente a Supabase en vez de Google Sheets.
Usa undetected-chromedriver para bypass anti-bot.
"""

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException
import random
from datetime import date, timedelta
from hashlib import md5
import os
import time
import pandas as pd
from supabase import create_client
from config import BANCO_RUT, BANCO_CLAVE, SUPABASE_URL, SUPABASE_SERVICE_KEY, RUTA_DESCARGAS

URL = "https://empresas.officebanking.cl/"
CUENTA_BANCO = "CTE-SANTANDER"
ARCHIVO_DESCARGA = os.path.join(RUTA_DESCARGAS, "descarga_cartola.xlsx")

COLS_SCRAPING = ["MONTO", "DESCRIPCIÓN", "FECHA", "Saldo", "N° DOC", "SUCURSAL", "CARGO/ABONO"]

MAPA_COLUMNAS = {
    "DESCRIPCIÓN MOVIMIENTO": "DESCRIPCIÓN",
    "DESCRIPCION MOVIMIENTO": "DESCRIPCIÓN",
    "DESCRIPCION":            "DESCRIPCIÓN",
    "SALDO":                  "Saldo",
    "N° DOCUMENTO":           "N° DOC",
    "NRO. DOCUMENTO":         "N° DOC",
    "NRO DOCUMENTO":          "N° DOC",
    "NUMERO DOCUMENTO":       "N° DOC",
}


def normalizar_monto(val):
    try:
        s = str(val).strip().replace(".", "").replace(",", "")
        return str(int(float(s)))
    except (ValueError, TypeError):
        return str(val).strip()


def normalizar_fecha(val):
    try:
        return pd.to_datetime(str(val).strip(), dayfirst=True, format="mixed").strftime("%Y-%m-%d")
    except Exception:
        try:
            return pd.to_datetime(str(val).strip()).strftime("%Y-%m-%d")
        except Exception:
            return str(val).strip()


def normalizar_ndoc(val):
    try:
        return str(int(float(str(val).strip())))
    except (ValueError, TypeError):
        return str(val).strip()


def generar_huella(monto, descripcion, fecha, ndoc, cargo_abono):
    partes = [
        normalizar_monto(monto),
        str(descripcion).strip().upper(),
        normalizar_fecha(fecha),
        normalizar_ndoc(ndoc),
        str(cargo_abono).strip().upper(),
    ]
    return md5("|".join(partes).encode()).hexdigest()


def espera_humana(minimo=2, maximo=4):
    time.sleep(random.uniform(minimo, maximo))


def esperar_ajax(driver, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            done = driver.execute_script(
                "return (document.readyState==='complete') && (!window.jQuery || jQuery.active===0);"
            )
            if done:
                return
        except Exception:
            pass
        time.sleep(0.4)


def encontrar_en_iframes(driver, css_selector, timeout_total=20):
    end = time.time() + timeout_total
    while time.time() < end:
        driver.switch_to.default_content()
        try:
            return driver.find_element(By.CSS_SELECTOR, css_selector)
        except Exception:
            pass
        for fr in driver.find_elements(By.TAG_NAME, "iframe"):
            try:
                driver.switch_to.default_content()
                driver.switch_to.frame(fr)
                return driver.find_element(By.CSS_SELECTOR, css_selector)
            except Exception:
                continue
        time.sleep(0.5)
    raise TimeoutException(f"No se encontro '{css_selector}'.")


def set_input_value(driver, el, value):
    driver.execute_script(
        """
        arguments[0].focus();
        arguments[0].value = arguments[1];
        arguments[0].dispatchEvent(new Event('input',  {bubbles:true}));
        arguments[0].dispatchEvent(new Event('change', {bubbles:true}));
        arguments[0].blur();
        """,
        el, value,
    )


def ejecutar_scraping():
    """Paso 1: Scraping OffBanking Santander → descarga Excel."""
    print("Abriendo OffBanking Santander...")
    options = uc.ChromeOptions()
    prefs = {
        "download.default_directory": RUTA_DESCARGAS,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)
    driver = uc.Chrome(options=options, version_main=148)
    driver.maximize_window()

    driver.get(URL)
    espera_humana(3, 5)
    wait = WebDriverWait(driver, 30)

    # Login
    print("Login...")
    btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.button-action-default-icon")))
    driver.execute_script("arguments[0].click();", btn)
    espera_humana(1, 2)

    driver.switch_to.default_content()
    try:
        wait.until(lambda d: any(f.is_displayed() for f in d.find_elements(By.TAG_NAME, "iframe")))
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        elegido = None
        for f in iframes:
            if not f.is_displayed():
                continue
            src = (f.get_attribute("src") or "").lower()
            if any(k in src for k in ["login", "auth", "oauth", "sso", "idp"]):
                elegido = f
                break
        if elegido is None:
            elegido = next(f for f in iframes if f.is_displayed())
        driver.switch_to.frame(elegido)
    except TimeoutException:
        driver.switch_to.default_content()
        wait.until(EC.any_of(
            EC.presence_of_element_located((By.ID, "username")),
            EC.presence_of_element_located((By.ID, "password")),
        ))

    rut_input = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.ID, "username")))
    rut_input.click()
    espera_humana(0.3, 0.6)
    rut_input.clear()
    for c in BANCO_RUT:
        rut_input.send_keys(c)
        time.sleep(random.uniform(0.05, 0.12))
    espera_humana(0.6, 1.2)

    clave_input = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.ID, "password")))
    clave_input.click()
    espera_humana(0.3, 0.6)
    clave_input.clear()
    for c in BANCO_CLAVE:
        clave_input.send_keys(c)
        time.sleep(random.uniform(0.05, 0.12))
    espera_humana(0.8, 1.4)

    btn_ok = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "doLoginButton")))
    WebDriverWait(driver, 30).until(lambda d: d.find_element(By.ID, "doLoginButton").is_enabled())
    driver.execute_script("arguments[0].click();", btn_ok)
    espera_humana(4, 6)
    driver.switch_to.default_content()
    espera_humana(3, 4)

    # Seleccionar empresa
    try:
        btn_emp = WebDriverWait(driver, 6).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//tr[contains(.,'78.036.379-7')]//button[@name='entrar']")
            )
        )
        btn_emp.click()
        espera_humana(3, 5)
        print("Empresa seleccionada")
    except TimeoutException:
        pass

    # Navegar a saldos y movimientos
    WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable((By.XPATH, "//span[text()='Cuentas Corrientes']"))
    ).click()
    espera_humana(2, 3)

    WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable(
            (By.XPATH, "//a[contains(@class,'obLink') and text()='Saldos y movimientos']")
        )
    ).click()
    espera_humana(3, 5)

    # Fechas: ultimos 90 dias
    hoy = date.today()
    desde = hoy - timedelta(days=90)
    f_hasta = hoy.strftime("%d/%m/%Y")
    f_desde = desde.strftime("%d/%m/%Y")
    print(f"Rango: {f_desde} - {f_hasta}")

    inp = encontrar_en_iframes(driver, "#FechaDesde", 25)
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", inp)
    espera_humana(0.4, 0.8)
    set_input_value(driver, inp, f_desde)
    espera_humana(0.3, 0.6)

    inp = encontrar_en_iframes(driver, "#FechaHasta", 25)
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", inp)
    espera_humana(0.4, 0.8)
    set_input_value(driver, inp, f_hasta)
    espera_humana(0.4, 0.8)

    btn_c = encontrar_en_iframes(driver, "button[data-bind*='BuscarMovimientos']", 25)
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn_c)
    espera_humana(0.4, 0.8)
    driver.execute_script("arguments[0].click();", btn_c)
    esperar_ajax(driver, 25)
    espera_humana(1.5, 2.5)
    print("Consulta lista")

    # Descargar Excel
    driver.switch_to.default_content()
    btn_d = encontrar_en_iframes(driver, "a.wrapper-descarga-link", 20)
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn_d)
    espera_humana(0.5, 1)
    ActionChains(driver).move_to_element(btn_d).pause(0.3).perform()
    driver.execute_script(
        "arguments[0].dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));", btn_d
    )
    espera_humana(0.8, 1.2)

    btn_xl = WebDriverWait(driver, 12).until(
        EC.presence_of_element_located((By.ID, "downloadExcelLinkMov"))
    )
    driver.execute_script("arguments[0].click();", btn_xl)

    # Esperar descarga
    print("Esperando descarga...")
    inicio_descarga = time.time()
    end = inicio_descarga + 60
    archivo_raw = None
    ignorar = {os.path.basename(ARCHIVO_DESCARGA)}

    while time.time() < end:
        archivos = [
            f for f in os.listdir(RUTA_DESCARGAS)
            if f.endswith(".xlsx")
            and not f.endswith(".crdownload")
            and f not in ignorar
            and not f.startswith("Reporte_")
            and os.path.getmtime(os.path.join(RUTA_DESCARGAS, f)) >= inicio_descarga
        ]
        if archivos:
            archivo_raw = max(
                [os.path.join(RUTA_DESCARGAS, f) for f in archivos],
                key=os.path.getmtime,
            )
            break
        time.sleep(1)

    driver.quit()

    if not archivo_raw:
        raise FileNotFoundError("No se encontro .xlsx descargado.")

    if os.path.exists(ARCHIVO_DESCARGA):
        os.remove(ARCHIVO_DESCARGA)
    os.rename(archivo_raw, ARCHIVO_DESCARGA)
    print(f"Descarga OK: {ARCHIVO_DESCARGA}")


def detectar_skiprows(path, max_filas=20):
    for i in range(max_filas):
        try:
            df_t = pd.read_excel(path, skiprows=i, nrows=1)
            cols = [str(c).strip().upper() for c in df_t.columns]
            if "MONTO" in cols and "FECHA" in cols:
                return i
        except Exception:
            continue
    return 11


def subir_a_supabase():
    """Lee Excel descargado y sube movimientos nuevos a Supabase."""
    if not os.path.exists(ARCHIVO_DESCARGA):
        raise FileNotFoundError(f"No existe: {ARCHIVO_DESCARGA}")

    skiprows = detectar_skiprows(ARCHIVO_DESCARGA)
    df = pd.read_excel(ARCHIVO_DESCARGA, skiprows=skiprows)
    df.columns = [str(c).strip() for c in df.columns]
    df = df.rename(columns=MAPA_COLUMNAS)

    faltantes = [c for c in COLS_SCRAPING if c not in df.columns]
    if faltantes:
        raise KeyError(f"Columnas requeridas no encontradas: {faltantes}")

    df["FECHA"] = pd.to_datetime(df["FECHA"], format="%d/%m/%Y", errors="coerce").dt.date
    df = df.dropna(subset=["FECHA"])
    print(f"{len(df)} movimientos en Excel descargado")

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # Obtener huellas existentes
    existing = supabase.table("cartolas").select("huella").execute()
    huellas_existentes = {r["huella"] for r in (existing.data or []) if r.get("huella")}

    nuevos = 0
    duplicados = 0
    batch = []

    for _, row in df.iterrows():
        monto = row.get("MONTO", 0)
        descripcion = str(row.get("DESCRIPCIÓN", "")).strip()
        fecha = row.get("FECHA")
        ndoc = row.get("N° DOC", "")
        sucursal = str(row.get("SUCURSAL", "")).strip()
        cargo_abono = str(row.get("CARGO/ABONO", "")).strip()
        saldo = row.get("Saldo", 0)

        huella = generar_huella(monto, descripcion, fecha, ndoc, cargo_abono)

        if huella in huellas_existentes:
            duplicados += 1
            continue

        fecha_str = None
        try:
            fecha_str = pd.to_datetime(str(fecha)).strftime("%Y-%m-%d")
        except Exception:
            pass

        anio = None
        mes = None
        if fecha_str:
            try:
                anio = int(fecha_str[:4])
                mes = int(fecha_str[5:7])
            except Exception:
                pass

        try:
            monto_float = float(str(monto).replace(".", "").replace(",", ""))
        except (ValueError, TypeError):
            monto_float = 0

        try:
            saldo_float = float(str(saldo).replace(".", "").replace(",", ""))
        except (ValueError, TypeError):
            saldo_float = 0

        tipo = "CARGO" if cargo_abono.upper() == "CARGO" else "ABONO"

        registro = {
            "cuenta_banco": CUENTA_BANCO,
            "fecha": fecha_str,
            "descripcion": descripcion,
            "referencia": "",
            "monto": monto_float,
            "saldo": saldo_float,
            "tipo": tipo,
            "estado_conciliacion": "PENDIENTE",
            "huella": huella,
            "anio": anio,
            "mes": mes,
            "num_doc": normalizar_ndoc(ndoc),
            "sucursal": sucursal,
            "cargo_abono": cargo_abono.upper(),
        }
        batch.append(registro)
        huellas_existentes.add(huella)
        nuevos += 1

        if len(batch) >= 100:
            supabase.table("cartolas").insert(batch).execute()
            batch = []

    if batch:
        supabase.table("cartolas").insert(batch).execute()

    print(f"  Nuevos: {nuevos} | Duplicados: {duplicados}")


def main():
    try:
        ejecutar_scraping()
    except Exception as e:
        print(f"Error scraping: {e}")
        import traceback
        traceback.print_exc()
        return

    try:
        subir_a_supabase()
    except Exception as e:
        print(f"Error subiendo a Supabase: {e}")
        import traceback
        traceback.print_exc()

    print("\nProceso cartola finalizado.")


if __name__ == "__main__":
    main()
