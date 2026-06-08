# 📦 Ventas ColGemelli

Aplicación web para **gestión de ventas, preventas, caja, devoluciones, usuarios y auditoría** del Colegio Franciscano Agustín Gemelli. El proyecto ahora está preparado para ejecutarse con **Next.js + TypeScript**, desplegarse en **Netlify** y persistir datos en **Supabase**.

---

## ✨ Características
- Registro de ventas presenciales y de autogestión.
- Administración de productos, inventario y orden visual.
- Preventas, confirmación de pagos y entrega/reclamo.
- Apertura/cierre de caja.
- Usuarios, roles, permisos y auditoría.
- Historial de devoluciones con reintegro de stock.

---

## 🧱 Arquitectura
- **Next.js (App Router + TypeScript):** UI, rutas y componentes.
- **Supabase:** Authentication para usuarios, Postgres vía REST para tablas de negocio y Storage para imágenes.
- **Netlify:** build y hosting configurados en `netlify.toml`.

La conexión a Supabase está centralizada en `src/lib/supabase.ts`; los módulos de negocio consumen esa capa desde `src/lib/services/`.

---

## ⚙️ Requisitos
- Node.js 18+.
- npm.
- Proyecto Supabase creado.
- Usuarios creados en **Supabase → Authentication → Users**.
- Tablas creadas en Supabase ejecutando el SQL de `supabase/schema.sql`.

---

## 🔐 Variables de entorno
Crea `.env.local` para desarrollo y configura las mismas variables en **Netlify → Site configuration → Environment variables**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
NEXT_PUBLIC_ENABLE_CLIENT_AUDIT_LOGS=false
NEXT_PUBLIC_DAVIPLATA_BREB_KEY=llave-breb-daviplata-del-colegio
NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL=daviplata://pagar?llave={key}&valor={amount}&referencia={code}
```


`NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL` puede ser un enlace profundo o URL provista por DaviPlata/Bre-B. Soporta los placeholders `{key}`, `{amount}`, `{amount_cents}` y `{code}` para construir el enlace/QR de pago de autogestión.

> ⚠️ No subas claves privadas ni archivos `.env.local` al repositorio.

---

## 🗃️ Base de datos Supabase
1. Entra al panel de Supabase.
2. Abre **SQL Editor**.
3. Ejecuta el contenido de `supabase/schema.sql`.
4. Configura las políticas RLS según tu operación. Para una app interna puedes empezar permitiendo acceso autenticado y luego endurecer por rol.

La autenticación de credenciales ocurre en **Supabase Authentication**. La tabla `public.users` no guarda contraseñas y ya no es requisito para iniciar sesión: si existe, solo conserva perfil de la aplicación, rol, permisos y avatar. Si no hay perfil público, la app toma `name`, `role` y `avatarUrl` desde `user_metadata` de Supabase Auth; sin metadata, el rol por defecto es `seller`.

Tablas principales:
- `users`
- `products`
- `purchases`
- `returns`
- `auditLogs`
- `cashboxSessions`
- `counters`

---

## 🚀 Desarrollo local
```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

---

## 🧪 Scripts
```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

---

## ☁️ Despliegue en Netlify
El archivo `netlify.toml` define:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Pasos:
1. Conecta el repositorio en Netlify.
2. Usa `npm run build` como build command.
3. Deja `.next` como publish directory.
4. Agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Despliega.

---

## 🐛 Solución de problemas
- **Supabase no está configurado:** revisa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Errores 401/403:** revisa políticas RLS y permisos de la anon key.
- **Tablas o columnas no encontradas:** vuelve a ejecutar `supabase/schema.sql` en el proyecto correcto.
- **Imágenes remotas bloqueadas:** agrega el host de Supabase Storage en `next.config.ts` si cambias de proyecto.

---

## 📄 Licencia
MIT
