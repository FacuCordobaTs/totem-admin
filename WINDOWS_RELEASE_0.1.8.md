# Release Windows 0.1.8 — para el Claude de la partición Windows

Objetivo: dejar funcionando **«Acceder como esta persona»**, que pasa a ser la forma de iniciar sesión en las barras: un admin o gerente abre **Evento → Equipo → detalle de la persona** en el POS y el equipo queda con la sesión del empleado.

Hay **dos piezas y las dos son necesarias**:

- **Backend** (`FacuCordobaTs/eventos-backend`): endpoint `POST /staff/team/:id/impersonate`. Pushear no lo despliega; hay que actualizar la VPS.
- **App de escritorio** (`FacuCordobaTs/totem-admin`): versión 0.1.8 con el botón.

**El orden importa: primero el backend, después la app.** Sin el backend, el botón falla con error.

El código ya está en `main` de ambos repos. No hay que tocar código ni migrar la base de datos: este cambio no toca el schema. Hoy hay un evento en curso: si algo no coincide con lo descrito, frená y avisale a Facu. Sólo Bun, nunca npm ni pnpm.

## 1. Desplegar el backend en la VPS

Acceso: `ssh -p 5140 root@168.181.186.163`, carpeta `/var/www/backend`.

Primero mirá, sin cambiar nada. El repo no documenta cómo corre el backend, así que hay que averiguarlo:

```bash
cd /var/www/backend
git status --short
git branch --show-current
git log --oneline -3
git fetch origin
git log --oneline HEAD..origin/main
pm2 list 2>/dev/null; systemctl list-units --type=service --state=running | grep -iE 'crow|backend|bun|node'
```

Continuá sólo si se cumple todo esto:

- La rama es `main`.
- `git status` no muestra archivos de código modificados. Archivos sin seguimiento dentro de `public/updates/` no molestan.
- Los commits pendientes son los esperados: el último es «Permite acceder como un empleado desde el equipo del evento». Si hay otros, listalos y confirmá con Facu.
- Identificaste sin dudas el proceso del backend.

Si no, **frená y preguntale a Facu**. No inventes un comando de reinicio ni uses `reset`, `stash` o `checkout` para limpiar.

Reiniciar corta unos segundos la API, que usan los POS y la venta online. **Antes de reiniciar, avisale a Facu y esperá su OK**, sobre todo si el evento ya empezó. Con el OK:

```bash
git pull --ff-only origin main
bun install --frozen-lockfile
# reiniciar el proceso con el gestor que identificaste
```

Verificá desde afuera:

```powershell
curl.exe -s -o NUL -w "%{http_code}" -X POST https://api.crow.ar/staff/team/x/impersonate
curl.exe -s -o NUL -w "%{http_code}" https://api.crow.ar/public/updates/latest.json
```

El primero tiene que dar **401** (antes del despliegue da 404) y el segundo **200**. Si la API no responde, revisá los logs del proceso; si no se recupera en un par de minutos, volvé al commit anterior con Facu al tanto. No sigas con la app hasta que esto esté bien.

## 2. Traer los cambios de la app

Carpeta esperada: `C:\Users\facuc\Downloads\crow\crow\admin`. Confirmá en Chrome el último commit en `https://github.com/FacuCordobaTs/totem-admin/commits/main` (si no hay Chrome: `git ls-remote origin main`).

```powershell
git status --short
git branch --show-current
git fetch origin
git pull --ff-only origin main
```

Si hay cambios locales que bloquean el pull, mostráselos a Facu; no los descartes.

Verificá:

- `git rev-parse HEAD` coincide con GitHub.
- `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` dicen `0.1.8`.
- `Select-String -Path src/components/events/event-staff-tab.tsx -Pattern '/impersonate'` encuentra el endpoint.

## 3. Compilar y firmar

La contraseña y la ruta de la clave están en `comandos_tauri.txt`, en la carpeta padre de `admin`. **No las copies a ningún archivo, commit ni log, ni las repitas en el chat.**

```powershell
bun install --frozen-lockfile
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "C:\Users\facuc\Downloads\crow\crow\crow-signing-key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<valor de comandos_tauri.txt>"
bunx tauri build
```

Tienen que existir, recién generados:

- `src-tauri\target\release\bundle\nsis\crow_0.1.8_x64-setup.exe`
- `src-tauri\target\release\bundle\nsis\crow_0.1.8_x64-setup.exe.sig`

## 4. Armar `latest.json`

Partí del manifiesto publicado y dejalo **fuera del repo**, en la carpeta padre. Cambiá sólo esto:

- `version`: `0.1.8`
- `notes`: `Permite abrir la sesión de un empleado desde Equipo, con «Acceder como esta persona».`
- `pub_date`: hora actual en UTC, formato `2026-10-31T23:00:00Z`
- `platforms.windows-x86_64.signature`: contenido completo del `.sig`
- `platforms.windows-x86_64.url`: `https://api.crow.ar/public/updates/crow_0.1.8_x64-setup.exe`

Guardalo en UTF-8 **sin BOM** con `[IO.File]::WriteAllText($ruta, $json, (New-Object Text.UTF8Encoding $false))` y validá que parsee.

## 5. Publicar

Primero el instalador y después el manifiesto, en ese orden.

```powershell
scp -P 5140 .\src-tauri\target\release\bundle\nsis\crow_0.1.8_x64-setup.exe root@168.181.186.163:/var/www/backend/public/updates/
ssh -p 5140 root@168.181.186.163 "cp /var/www/backend/public/updates/latest.json /var/www/backend/public/updates/latest.0.1.7.json.bak"
scp -P 5140 ..\latest.json root@168.181.186.163:/var/www/backend/public/updates/
```

Verificá:

```powershell
curl.exe -s https://api.crow.ar/public/updates/latest.json
curl.exe -sI https://api.crow.ar/public/updates/crow_0.1.8_x64-setup.exe
```

El JSON tiene que decir `0.1.8` con la firma igual al `.sig`, y el instalador responder 200 con el mismo tamaño que el local.

Si hay que volver atrás:

```powershell
ssh -p 5140 root@168.181.186.163 "cp /var/www/backend/public/updates/latest.0.1.7.json.bak /var/www/backend/public/updates/latest.json"
```

## 6. Probar en una sola computadora antes de seguir

Es importante que esto funcione bien. Facu tiene que hacer esta prueba, porque requiere su cuenta: no ingreses contraseñas por él.

1. Abrir la app, aceptar la actualización y confirmar que reinicia en 0.1.8.
2. Iniciar sesión como admin o gerente e ir a **Evento → Equipo → un bartender de prueba → Acceder como esta persona**.
3. Confirmar el diálogo. La app tiene que abrir el POS del bartender, sin pantalla en blanco y en la barra que le corresponde.
4. Cerrar y volver a abrir la app: la sesión tiene que seguir abierta.
5. Hacer una venta real o de prueba e imprimir el comprobante.
6. Si el empleado tiene varios roles, tiene que aparecer primero el selector de rol.

Recordale a Facu que **no hay vuelta**: ese equipo queda con la sesión del empleado, y para administrar de nuevo hay que cerrar sesión y entrar con su cuenta. Por eso conviene confirmar antes a quién se abre la sesión.

## 7. Informar a Facu

Decile los hashes desplegados de backend y app, y el resultado de cada verificación. Los POS sólo ven la actualización al abrir la app o cada 6 horas, y alguien tiene que aceptarla: hay que cerrar y abrir la app en cada POS.
