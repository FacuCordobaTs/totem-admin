# Crow Admin — App de Escritorio (Tauri 2) · Guía de Deploy

App de escritorio Windows de **admin.crow.ar** empaquetada con Tauri 2.
Incluye: impresión térmica ESC/POS (RAW, serial COM y Windows spooler) y
auto-updates firmados vía `tauri-plugin-updater`.

- **Identifier:** `ar.crow.admin`
- **Instalador:** NSIS (`crow_<version>_x64-setup.exe`)
- **Endpoint de updates:** `https://api.crow.ar/public/updates/latest.json`
- **Clave pública de firma:** embebida en `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`)

---

## 0. Requisitos previos (una sola vez)

### Secrets en GitHub

La GitHub Action (`.github/workflows/release.yml`) firma el instalador. Necesita
dos secrets en el repo (**Settings → Secrets and variables → Actions**):

| Secret | Valor |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido de la clave privada minisign (`crow-signing-key` en la raíz del monorepo Crow). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | La password con la que se generó la clave (vacío si no tiene). |

> La clave privada vive en `../crow-signing-key` (raíz del monorepo). **Nunca** se
> commitea. La pública (`../crow-signing-key.pub`) es la que está en `tauri.conf.json`.

Para regenerar el par de claves (solo si se pierde — invalida updates viejos):

```bash
bunx tauri signer generate -w crow-signing-key
# copiar el contenido de crow-signing-key.pub a plugins.updater.pubkey en tauri.conf.json
```

---

## 1. Subir una nueva versión

1. **Bump de versión** en `src-tauri/tauri.conf.json` → campo `"version"`
   (ej. `0.1.0` → `0.1.1`). Usar SemVer. Este número es el que compara el updater.

2. Commit + push a GitHub:

   ```bash
   git add src-tauri/tauri.conf.json
   git commit -m "release: v0.1.1"
   git push
   ```

3. **Disparar la build manual**: en GitHub → pestaña **Actions** →
   *Release Tauri (Windows)* → **Run workflow**.

4. Cuando termine (~10-15 min), descargar el artefacto **`crow-windows`**. Contiene:
   - `crow_<version>_x64-setup.exe` — el instalador.
   - `crow_<version>_x64-setup.exe.sig` — la firma (texto) para `latest.json`.

---

## 2. Publicar el update en el VPS

El endpoint sirve dos cosas desde `https://api.crow.ar/public/updates/`:
`latest.json` (el manifiesto) y el `.exe` (el binario que descarga el updater).

### 2.1. Actualizar `latest.json`

Editar el manifiesto con la nueva versión. La `signature` es el **contenido del
archivo `.sig`** (no la ruta), pegado tal cual.

```json
{
  "version": "0.1.1",
  "notes": "Descripción de los cambios de esta versión",
  "pub_date": "2026-07-06T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contenido completo de crow_0.1.1_x64-setup.exe.sig>",
      "url": "https://api.crow.ar/public/updates/crow_0.1.1_x64-setup.exe"
    }
  }
}
```

> El template inicial está en `latest.json` (raíz de este proyecto). Mantenelo
> versionado como referencia, pero el archivo que importa es el que vive en el VPS.

### 2.2. Subir archivos al VPS

```bash
# Desde tu máquina, con los dos archivos del artefacto descomprimido:
scp -P 5140 ./crow_X.X.X_x64-setup.exe root@168.181.186.163:/var/www/backend/public/updates/
scp -P 5140 ./latest.json root@168.181.186.163:/var/www/backend/public/updates/
```

(Los archivos se sirven desde el backend de Crow en `/var/www/backend/public/updates/`,
expuesto por Hono como estático en `https://api.crow.ar/public/updates/`.)

### 2.3. Verificar

```bash
curl https://api.crow.ar/public/updates/latest.json
# Debe devolver el JSON con la nueva "version" y la URL del .exe accesible.
curl -I https://api.crow.ar/public/updates/crow_0.1.1_x64-setup.exe   # -> 200 OK
```

---

## 3. Cómo funciona el auto-update (cliente)

- Al iniciar (o cuando el frontend lo dispare con `@tauri-apps/plugin-updater`),
  la app pega a `endpoints` → `https://api.crow.ar/public/updates/latest.json`.
- Compara `version` del manifiesto contra la versión instalada.
- Si es mayor, descarga el `.exe`, **verifica la firma** contra el `pubkey`
  embebido y lo instala (`installMode: "passive"` → sin diálogos molestos).

> Si la firma no valida (ej. `latest.json` con `"signature": "PENDING"` o una
> clave que no corresponde), el updater **rechaza** el update. Por eso el
> `latest.json` inicial tiene `PENDING`: es solo un template hasta la primera release real.

---

## 4. Impresora térmica

El backend Rust (`src-tauri/src/lib.rs`) expone dos comandos Tauri:

- `get_printers()` → lista puertos serie (`COMx`), impresoras de Windows y la
  opción `DEBUG - guardar HTML y ESC-POS`.
- `send_print_job(printerName, content)` → manda bytes RAW: por puerto serie si
  el nombre empieza con `COM`, o vía el spooler de Windows (RAW) en otro caso.

Al elegir la opción de **DEBUG**, cada trabajo se guarda sin sobrescribir los
anteriores en `Documentos/Crow Debug Prints` (o en los datos locales de la app
si Windows no tiene carpeta Documentos). Se crean dos archivos con el mismo
nombre: `.html`, que se abre directamente en el navegador para previsualizar la
comanda, y `.escpos`, con los bytes RAW exactos para abrirlos en un visor ESC/POS
o enviarlos luego a una térmica.

Desde el frontend se usa el hook `usePrinter()` (`src/context/PrinterContext.tsx`)
y los formatters ESC/POS de `src/lib/printerUtils.ts`
(`formatTicketEntrada`, `formatReciboVentaBarra`, `formatResumenCaja`).

---

## 5. Desarrollo local

```bash
bun install
bun run tauri:dev      # levanta Vite (bun run dev) + la ventana nativa
bun run tauri:build    # build local del instalador (sin firmar si no hay secrets)
```

> Requiere toolchain de Rust instalada. Los comandos de impresión real solo
> funcionan en Windows; en Linux/Mac usá la opción de DEBUG a archivo.
