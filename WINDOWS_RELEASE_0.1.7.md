# Release Windows 0.1.7 — para el Claude de la partición Windows

Objetivo: publicar la app de escritorio Crow **0.1.7** para que las computadoras POS del evento de esta noche la reciban. Esta versión quita el control de stock de las barras: el stock se opera sólo desde **Depósito**.

El código, la versión y este archivo ya están en `origin/main` de `FacuCordobaTs/totem-admin`. No hay que tocar código. Si algo no coincide con lo descrito, frená y avisale a Facu; no improvises sobre la VPS.

Carpeta esperada: `C:\Users\facuc\Downloads\crow\crow\admin`. Si no está ahí, buscala por el remote `totem-admin`. Usá PowerShell y sólo Bun, nunca npm ni pnpm.

## 1. Confirmar el commit en GitHub

Abrí en Chrome `https://github.com/FacuCordobaTs/totem-admin/commits/main` y anotá el hash del commit más reciente. Debe incluir "Centraliza el stock en Depósito". Si Chrome no está disponible, usá `git ls-remote origin main`.

## 2. Traer los cambios

```powershell
git status --short
git branch --show-current
git fetch origin
git pull --ff-only origin main
```

Tiene que estar en `main`. Si hay cambios locales que bloquean el pull o el fast-forward falla, no uses `reset`, `stash` ni `checkout` para descartarlos: mostráselos a Facu y preguntá.

## 3. Verificar que estén los cambios

Todo esto debe cumplirse:

- `git rev-parse HEAD` coincide con el hash del paso 1.
- `src/components/events/bar-stock-panel.tsx` **no** existe.
- `src/components/events/deposit-workspace.tsx` existe.
- `Select-String -Path src/components/events/bar-detail-view.tsx -Pattern 'BarStockPanel|"stock"'` no devuelve nada.
- `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` dicen `0.1.7`.

## 4. Compilar y firmar

La contraseña y la ruta de la clave están en `comandos_tauri.txt`, en la carpeta padre de `admin` (`C:\Users\facuc\Downloads\crow\crow\`). Leelas de ahí. Si falta el archivo, pedíselas a Facu. **No las copies a ningún archivo, commit ni log, ni las repitas en el chat.**

```powershell
bun install --frozen-lockfile
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "C:\Users\facuc\Downloads\crow\crow\crow-signing-key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<valor de comandos_tauri.txt>"
bunx tauri build
```

Tienen que existir estos dos archivos, recién generados:

- `src-tauri\target\release\bundle\nsis\crow_0.1.7_x64-setup.exe`
- `src-tauri\target\release\bundle\nsis\crow_0.1.7_x64-setup.exe.sig`

## 5. Armar `latest.json`

Partí del manifiesto publicado y dejalo **fuera del repo**, en la carpeta padre. Cambiá sólo esto:

- `version`: `0.1.7`
- `notes`: `El control de stock pasa a hacerse sólo desde Depósito; se quita de las barras.`
- `pub_date`: hora actual en UTC, formato `2026-10-31T23:00:00Z`
- `platforms.windows-x86_64.signature`: contenido completo del `.sig`
- `platforms.windows-x86_64.url`: `https://api.crow.ar/public/updates/crow_0.1.7_x64-setup.exe`

Guardalo en UTF-8 **sin BOM** y validá que parsee. Windows PowerShell 5 agrega BOM con `Set-Content -Encoding UTF8`; usá `[IO.File]::WriteAllText($ruta, $json, (New-Object Text.UTF8Encoding $false))`.

## 6. Subir a la VPS

Primero el instalador y después el manifiesto, en ese orden: si se invierte, los POS podrían intentar bajar un archivo que todavía no existe. Antes de pisarlo, guardá una copia del manifiesto actual. Facu ya pidió esta subida, y estos son los únicos cambios autorizados en la VPS.

```powershell
scp -P 5140 .\src-tauri\target\release\bundle\nsis\crow_0.1.7_x64-setup.exe root@168.181.186.163:/var/www/backend/public/updates/
ssh -p 5140 root@168.181.186.163 "cp /var/www/backend/public/updates/latest.json /var/www/backend/public/updates/latest.0.1.6.json.bak"
scp -P 5140 ..\latest.json root@168.181.186.163:/var/www/backend/public/updates/
```

## 7. Verificar lo publicado

```powershell
curl.exe -s https://api.crow.ar/public/updates/latest.json
curl.exe -sI https://api.crow.ar/public/updates/crow_0.1.7_x64-setup.exe
```

- El JSON tiene que decir `0.1.7` y su firma tiene que ser igual al `.sig`.
- El instalador tiene que responder 200, con el mismo tamaño que el archivo local.

## 8. Informar a Facu

Decile el hash publicado y el resultado de cada verificación. Avisale que:

- Los POS buscan actualizaciones al abrir la app y cada 6 horas, y alguien tiene que aceptar el aviso. Antes del evento conviene **cerrar y abrir la app en cada POS** y aceptar.
- Hay que probar la actualización en un POS antes de seguir con los demás: que abra, que la barra ya no muestre la pestaña Stock y que venda.

Si la actualización falla, restaurá el manifiesto anterior:

```powershell
ssh -p 5140 root@168.181.186.163 "cp /var/www/backend/public/updates/latest.0.1.6.json.bak /var/www/backend/public/updates/latest.json"
```
