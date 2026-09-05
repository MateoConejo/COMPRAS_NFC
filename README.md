# 🛒 Mis compras

Lista de compras personal, instalable como PWA en Android, que funciona
100% offline después de la primera carga y se abre mediante un sticker NFC.

Todos los datos (alimentos y categorías) se guardan **solo en tu
teléfono**, en IndexedDB. No hay servidor, no hay cuentas, no hay
tracking.

---

## Estructura del proyecto

```
shopping-list-pwa/
├── index.html              → estructura de la app y de las hojas (sheets)
├── manifest.json           → metadatos de instalación como PWA
├── service-worker.js       → cachea el "app shell" para funcionar offline
├── css/
│   └── styles.css          → tema oscuro, tipografía, animaciones
├── js/
│   ├── db.js                → capa de almacenamiento (IndexedDB)
│   └── app.js                → estado, renderizado y eventos de la UI
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
└── README.md
```

No hay dependencias externas, ni build step: es HTML/CSS/JS puro.

---

## 1. Ejecutarlo en local

Los Service Workers requieren HTTPS **o** `localhost`, así que para
probarlo en tu PC basta un servidor estático simple:

```bash
cd shopping-list-pwa

# Opción A (Python, ya viene instalado en la mayoría de sistemas)
python3 -m http.server 8080

# Opción B (Node)
npx serve .
```

Abre `http://localhost:8080` en Chrome. Añade algún alimento, recarga la
página y confirma que sigue ahí.

Para probar el modo offline en tu PC: abre las DevTools → pestaña
**Network** → marca **Offline**, y sigue usando la app con normalidad.

---

## 2. Desplegarlo en un hosting HTTPS

Fuera de `localhost`, Android **exige HTTPS** para instalar una PWA y
para que el Service Worker funcione. Todas las opciones siguientes dan
HTTPS gratis:

### Opción recomendada: GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta
   (el `index.html` debe quedar en la raíz del repo, o en `/docs` si
   así lo configuras).
2. En el repo: **Settings → Pages → Source**, selecciona la rama y
   carpeta correspondientes, y guarda.
3. GitHub te dará una URL del tipo:
   `https://tu-usuario.github.io/tu-repositorio/`
4. Espera 1-2 minutos y ábrela desde el móvil.

### Alternativas igual de válidas

- **Netlify** — arrastra la carpeta del proyecto a
  [app.netlify.com/drop](https://app.netlify.com/drop) y obtienes una
  URL HTTPS al instante.
- **Vercel** — `npx vercel` dentro de la carpeta del proyecto.
- **Cloudflare Pages** — conecta el repositorio desde el dashboard de
  Cloudflare.

Cualquiera de estas sirve; lo único que importa es que el resultado
sea una **URL HTTPS estable**, porque esa es la URL que vas a grabar
en el sticker NFC.

> **Importante:** una vez elegida la URL definitiva, evita cambiarla.
> Si cambias de dominio tendrás que volver a programar el sticker.

---

## 3. Instalarlo como PWA en Android

1. Abre la URL HTTPS de tu app en **Chrome** en el móvil.
2. Toca el menú ⋮ (arriba a la derecha).
3. Toca **"Instalar aplicación"** (o **"Añadir a pantalla de inicio"**
   según la versión de Chrome).
4. Confirma. Aparecerá un ícono de "Mis compras" en tu pantalla de
   inicio, y se abrirá en su propia ventana, sin la barra del
   navegador.
5. Ábrela una vez con conexión para que el Service Worker descargue y
   guarde en caché todos los archivos de la app. A partir de ahí,
   funciona sin internet.

---

## 4. Programar el sticker NFC con la URL de la app

Necesitas una app de Android que escriba etiquetas NFC. La más simple
y gratuita es **NFC Tools** (Play Store).

1. Instala **NFC Tools** desde Google Play.
2. Ten a mano la URL HTTPS final de tu app (la del paso 2).
3. Abre NFC Tools → pestaña **"Escribir"**.
4. Toca **"Añadir un registro"** → elige **"URL / URI"**.
5. Pega tu URL (por ejemplo `https://tu-usuario.github.io/mis-compras/`)
   y confirma.
6. Toca **"Escribir"** y acerca el teléfono al sticker NFC hasta que
   la app confirme la escritura.
7. Prueba: bloquea el teléfono, acerca el móvil al sticker de nuevo.
   Android debe mostrar una notificación para abrir la URL — al
   tocarla, se abre "Mis compras" con tus datos tal como los dejaste.

Si tienes varios stickers, repite el proceso con la misma URL en cada
uno; todos abrirán la misma app y verán los mismos datos, porque el
almacenamiento vive en el teléfono, no en el sticker.

---

## Cómo funciona el almacenamiento

- **IndexedDB** (`mis-compras-db`) guarda dos "tablas": `categories` y
  `items`. Cada alimento tiene un estado `completed` (true/false) en
  vez de eliminarse al comprarlo, así que siempre puedes devolverlo a
  pendiente.
- **Eliminar** (icono de papelera) borra el alimento para siempre, con
  una confirmación previa. **Marcar como comprado** solo cambia su
  estado — nunca borra datos.
- Si borras una categoría que tiene alimentos dentro, la app te
  pregunta si quieres moverlos a **"Sin categoría"** o eliminarlos
  también; nunca los borra en silencio.
- El **Service Worker** (`service-worker.js`) solo cachea los archivos
  de la aplicación (HTML/CSS/JS/íconos) para que cargue sin conexión.
  Los datos nunca pasan por ahí ni por ningún servidor.

### Actualizar la app más adelante

Si en el futuro modificas el código y lo vuelves a desplegar, sube en
uno el número de `CACHE_VERSION` al inicio de `service-worker.js`
(por ejemplo de `'v1'` a `'v2'`). Así, la próxima vez que el teléfono
tenga conexión, descargará la versión nueva en segundo plano sin
tocar tus datos guardados en IndexedDB.

---

## Casos verificados

Antes de entregar el proyecto se comprobó, con pruebas automatizadas
sobre el código real (Playwright + Chromium):

- ✅ Añadir un alimento y que persista tras cerrar/reabrir.
- ✅ Marcar un alimento como comprado y que el estado persista.
- ✅ Volver a marcar ese alimento como pendiente.
- ✅ Añadir alimentos con la conexión simulada como apagada.
- ✅ Crear una categoría personalizada y que persista.
- ✅ Añadir un alimento dentro de esa categoría y que persista.
- ✅ Abrir la app en una pestaña "nueva" (equivalente a reabrir vía
  NFC) y recuperar automáticamente todos los datos guardados.
- ✅ Eliminar una categoría con alimentos dentro: la app pregunta antes
  de mover o borrar esos alimentos.
- ✅ Eliminar un alimento de forma definitiva, con confirmación previa.
- ✅ El Service Worker queda registrado para el funcionamiento offline.

---

## Privacidad

- Sin cuentas, sin contraseñas, sin login.
- Sin analytics, sin tracking, sin publicidad.
- Sin llamadas a APIs externas para el funcionamiento básico.
- Todos los datos quedan en el almacenamiento local del dispositivo.
