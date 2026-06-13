# 📦 Ventas ColGemelli

Sistema web de administración comercial para el **Colegio Franciscano Agustín Gemelli**. Centraliza ventas presenciales, preventas, autogestión, inventario, caja, devoluciones, usuarios y auditoría en una aplicación Next.js conectada a Supabase.

---

## Tabla de contenido

- [Overview](#overview)
- [Características principales](#características-principales)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura y flujo de datos](#arquitectura-y-flujo-de-datos)
- [Módulos funcionales](#módulos-funcionales)
- [Modelo de dominio](#modelo-de-dominio)
- [Navegación y control de acceso](#navegación-y-control-de-acceso)
- [Primeros pasos](#primeros-pasos)
- [Despliegue en Netlify](#despliegue-en-netlify)
- [Solución de problemas](#solución-de-problemas)
- [Auditoría de seguridad](#auditoría-de-seguridad)
- [Documentación adicional](#documentación-adicional)
- [Licencia](#licencia)

---

## Overview

**Ventas ColGemelli** es una plataforma integral para administrar operaciones de comercio escolar en tiempo real. La aplicación soporta flujos de venta física y digital, conciliación de inventario, sesiones de caja, validación de pagos y trazabilidad de acciones sensibles mediante auditoría.

El sistema está diseñado para cubrir tres canales de operación:

1. **Punto de venta (POS):** ventas presenciales ejecutadas por cajeros o administradores.
2. **Autogestión:** portal público para padres o estudiantes, con códigos de reserva y enlaces/QR de pago.
3. **Preventa:** pedidos administrados por vendedores antes de la entrega o confirmación final.

---

## Características principales

- **Ventas multicanal:** POS interno, preventas para eventos y portal público de autogestión.
- **Inventario en tiempo real:** control de stock con validación de disponibilidad, reservas y reintegro por devoluciones.
- **Caja y finanzas:** apertura/cierre de caja, totales esperados, descuadres y verificación de pagos digitales.
- **Pagos DaviPlata/Bre-B:** generación configurable de enlaces profundos o URL con placeholders para llave, valor y referencia.
- **Autenticación y RBAC:** inicio de sesión con Supabase Auth y roles `admin`, `cashier`, `seller` y `auditor`.
- **Auditoría:** registro opcional de acciones críticas como ventas, canjes, pagos, reintegros, cierres de caja y cambios de rol.
- **Dashboard administrativo:** KPIs, productos, caja, devoluciones, usuarios y bitácora de auditoría.

---

## Stack tecnológico

| Capa | Tecnología | Rol |
| --- | --- | --- |
| Frontend | Next.js 15 App Router + React 18 | Rutas, renderizado, UI y lógica del cliente. |
| Lenguaje | TypeScript | Tipado de modelos, servicios y respuestas de API. |
| Backend-as-a-Service | Supabase | Auth, PostgreSQL, REST API y funciones RPC. |
| Estilos | Tailwind CSS + shadcn/ui/Radix UI | Componentes accesibles y diseño responsive. |
| Estado | React Hooks + LocalStorage | Sesión, estado local y persistencia en cliente. |
| Visualización | Recharts | Gráficas y métricas del dashboard. |
| Ordenamiento UI | `@dnd-kit` | Reordenamiento visual de productos. |
| Despliegue | Netlify | Build, hosting y plugin oficial para Next.js. |

---

## Arquitectura y flujo de datos

La aplicación sigue un patrón por capas:

```text
UI / Rutas Next.js
  ↓
Hooks y componentes de dominio
  ↓
Servicios en src/lib/services/
  ↓
Data Access Layer en src/lib/supabase.ts
  ↓
Supabase REST, Auth y RPC PostgreSQL
```

### Componentes clave

- **Rutas y pantallas:** ubicadas en `src/app/`, separan el portal público (`/self-service`) de la operación interna (`/dashboard/*`).
- **Service Layer:** `src/lib/services/` concentra reglas de negocio para compras, productos, caja, devoluciones, usuarios y auditoría.
- **Data Access Layer:** `src/lib/supabase.ts` centraliza llamadas REST/Auth, manejo de tokens y helpers como `selectRows`, `insertRow`, `updateRows` y `callRpc`.
- **Operaciones atómicas:** `supabase/schema.sql` define funciones como `next_counter` y `create_pos_purchase_with_stock` para generar consecutivos y descontar stock de forma transaccional.
- **Tipos de dominio:** `src/lib/types.ts` define roles, permisos, productos, compras, caja, devoluciones y auditoría.

---

## Módulos funcionales

### 1. Punto de venta (POS)

- Ruta: `/dashboard/sales`.
- Usuarios principales: `admin`, `cashier`, `seller` según permisos.
- Descuenta stock al finalizar la venta.
- Valida disponibilidad antes de registrar la compra.
- Asocia la venta al usuario autenticado.

### 2. Autogestión

- Ruta pública: `/self-service`.
- Permite a padres o estudiantes seleccionar productos y generar una reserva.
- Usa identificación por cédula/celular.
- Genera códigos y enlaces/QR de pago configurables con DaviPlata/Bre-B.
- Mantiene compras pendientes hasta su verificación o entrega.

### 3. Preventa

- Ruta: `/dashboard/presale`.
- Permite organizar pedidos antes de la entrega física.
- Comparte catálogo con POS y autogestión.
- Soporta confirmación posterior y atribución al vendedor.

### 4. Canje y verificación

- Ruta: `/dashboard/redeem`.
- Permite buscar, validar y confirmar compras pendientes o preventas.
- Registra eventos relevantes en auditoría cuando está habilitada.

### 5. Productos e inventario

- Ruta: `/dashboard/products`.
- Administra productos, precio, stock, disponibilidad por canal e imagen.
- Soporta reintegros de stock y reordenamiento visual.
- Incluye tolerancia a migraciones de esquema para columnas opcionales como disponibilidad o posición.

### 6. Caja

- Ruta: `/dashboard/cashbox`.
- Gestiona apertura y cierre de sesiones de caja.
- Calcula ventas y facilita detectar diferencias entre efectivo esperado y contado.

### 7. Devoluciones

- Ruta: `/dashboard/returns`.
- Registra devoluciones por origen (`Punto de Venta` o `Autogestión`).
- Reintegra stock al producto correspondiente.

### 8. Usuarios, roles y auditoría

- Rutas: `/dashboard/users` y `/dashboard/audit`.
- Administra roles y permisos de usuarios.
- Consulta el historial de acciones sensibles del sistema.

---

## Modelo de dominio

Entidades principales del sistema:

| Entidad | Archivo/tabla | Propósito |
| --- | --- | --- |
| `User` | `src/lib/types.ts`, `public.users` | Perfil de aplicación, rol, permisos y avatar. |
| `Product` | `src/lib/types.ts`, `public.products` | Catálogo, precio, stock, disponibilidad y orden visual. |
| `Purchase` | `src/lib/types.ts`, `public.purchases` | Compra POS, autogestión o preventa con estado e ítems. |
| `CashboxSession` | `src/lib/types.ts`, `public.cashboxSessions` | Sesiones de caja abiertas/cerradas y saldos. |
| `Return` | `src/lib/types.ts`, `public.returns` | Devoluciones y reintegro de inventario. |
| `AuditLog` | `src/lib/types.ts`, `public.auditLogs` | Bitácora de eventos administrativos y transaccionales. |
| `counters` | `supabase/schema.sql` | Consecutivos para códigos de compra. |

Estados relevantes:

- `PurchaseStatus`: `pending`, `paid`, `cancelled`, `delivered`, `pre-sale`, `pre-sale-confirmed`.
- `ProductAvailability`: `pos`, `self-service`, `presale`.
- `AuditLogAction`: incluye ventas, canjes, anulaciones, pagos, caja, reintegros, login y autogestión.

---

## Navegación y control de acceso

El acceso interno está protegido mediante roles y permisos definidos en `src/lib/types.ts` y `src/lib/roles.ts`.

| Rol | Uso principal | Permisos generales |
| --- | --- | --- |
| `admin` | Administración completa | Dashboard, ventas, preventas, autogestión, productos, canje, caja, devoluciones, usuarios y auditoría. |
| `cashier` | Operación de caja/POS | Dashboard, ventas, preventas, canje, caja y devoluciones. |
| `seller` | Entrega de compras | Solo canje/entrega por QR o código de compra. |
| `auditor` | Supervisión | Dashboard y auditoría. |

### Rutas públicas

- `/self-service`: portal público para compras/reservas de padres o estudiantes.

### Rutas protegidas

- `/dashboard`: KPIs y resumen operativo.
- `/dashboard/sales`: POS.
- `/dashboard/presale`: preventas.
- `/dashboard/self-service`: administración de autogestión.
- `/dashboard/self-service-pos`: operación auxiliar de autogestión/POS.
- `/dashboard/redeem`: canje y verificación.
- `/dashboard/products`: productos e inventario.
- `/dashboard/cashbox`: caja.
- `/dashboard/returns`: devoluciones.
- `/dashboard/users`: usuarios y roles.
- `/dashboard/audit`: auditoría.

---

## Primeros pasos

### Requisitos

- Node.js 18+.
- npm.
- Proyecto Supabase creado.
- Usuarios creados en **Supabase → Authentication → Users**.
- Esquema de base de datos creado con `supabase/schema.sql`.

### Instalación

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

### Variables de entorno

Crea `.env.local` para desarrollo y configura las mismas variables en **Netlify → Site configuration → Environment variables**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
NEXT_PUBLIC_ENABLE_CLIENT_AUDIT_LOGS=false
NEXT_PUBLIC_DAVIPLATA_BREB_KEY=3206766574
NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL=daviplata://pagar?llave={key}&valor={amount}&referencia={code}
```

`NEXT_PUBLIC_DAVIPLATA_BREB_PAYMENT_URL` puede ser un enlace profundo o URL provista por DaviPlata/Bre-B. Soporta los placeholders `{key}`, `{amount}`, `{amount_cents}` y `{code}`. Si no se configura, el autoservicio usa por defecto `daviplata://pagar?llave={key}&valor={amount}&referencia={code}` con la llave Bre-B `3206766574`.

> ⚠️ No subas claves privadas ni archivos `.env.local` al repositorio.

### Inicialización de Supabase

1. Entra al panel de Supabase.
2. Abre **SQL Editor**.
3. Ejecuta el contenido de `supabase/schema.sql`.
4. Revisa o ajusta políticas RLS según la operación del colegio.
5. Verifica que existan las funciones RPC críticas, especialmente `create_pos_purchase_with_stock`.

La autenticación ocurre en **Supabase Authentication**. La tabla `public.users` conserva el perfil de la aplicación, rol, permisos y avatar; no almacena contraseñas. Si no existe perfil público, la app usa metadata de Supabase Auth y asigna `seller` como rol por defecto.

### Scripts disponibles

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run security:audit
```

## Auditoría de seguridad

El repositorio incluye una configuración de auditoría de seguridad con Groq en `SECURITY_AUDITOR.md`.

- `npm run security:audit` ejecuta el auditor con el modelo `openai/gpt-oss-safeguard-20b`.
- `agents/security-auditor.groq.mjs` contiene el prompt y la configuración del modelo.
- `scripts/run-security-audit-groq.mjs` llama al endpoint OpenAI-compatible de Groq y transmite la respuesta.
- `/api/security-auditor` alimenta el panel flotante de IA visible en la aplicación.

No guardes `GROQ_API_KEY` en el repositorio. Mantén ese valor en tu gestor de secretos o variables privadas.

---

## Despliegue en Netlify

El repositorio incluye `netlify.toml` con build de Next.js:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Pasos sugeridos:

1. Conecta el repositorio en Netlify.
2. Usa `npm run build` como build command.
3. Deja `.next` como publish directory.
4. Agrega las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y las variables de pago/auditoría que apliquen.
5. Despliega y valida login, POS, autogestión y caja en un ambiente controlado.

---

## Solución de problemas

- **Supabase no está configurado:** revisa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Errores 401/403:** revisa políticas RLS, permisos de la anon key y sesión del usuario.
- **Tablas o columnas no encontradas:** vuelve a ejecutar `supabase/schema.sql` en el proyecto correcto.
- **La venta POS no descuenta stock:** confirma que exista la RPC `create_pos_purchase_with_stock`; la app bloquea ventas si la función no está disponible para evitar inventario inconsistente.
- **Aparecen compras antiguas sin ajuste de inventario:** corrige una sola vez el stock real de productos afectados y usa la RPC para ventas futuras.
- **Imágenes remotas bloqueadas:** agrega el host de Supabase Storage en `next.config.ts` si cambias de proyecto o bucket.
- **No se guardan auditorías:** activa `NEXT_PUBLIC_ENABLE_CLIENT_AUDIT_LOGS=true` en el entorno donde quieras persistir logs.

---

## Documentación adicional

- `docs/blueprint.md`: blueprint original de producto, features y guía visual.
- `supabase/schema.sql`: definición de tablas, funciones RPC, triggers/migraciones y permisos SQL.
- `src/lib/types.ts`: referencia de tipos de dominio, roles, permisos y estados.
- `src/lib/services/`: reglas de negocio por módulo.

---

## Licencia

MIT
