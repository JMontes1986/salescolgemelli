# Security Auditor con Groq

Este repositorio usa Groq para ejecutar auditorías de seguridad asistidas por IA con el modelo `openai/gpt-oss-safeguard-20b`.

## Requisitos

- Node.js 18+.
- Una API key de Groq configurada fuera del repositorio.

```bash
export GROQ_API_KEY="tu-api-key"
```

No guardes claves reales en archivos del proyecto, commits, tickets, capturas o chats. Si una clave se expone, revócala y crea una nueva.

## IA activa en la aplicación

La app monta un panel flotante global en `src/components/security-ai-assistant.tsx`.

- En `/self-service` se abre automáticamente y ejecuta una revisión inicial de autogestión.
- En el resto de la app queda disponible como botón flotante.
- El navegador llama a `/api/security-auditor`; esa ruta usa `GROQ_API_KEY` solo en servidor.
- La IA recibe contexto de ruta y superficie, no datos personales de clientes.

## Ejecutar una auditoría por terminal

```bash
npm run security:audit
```

También puedes pasar un alcance específico:

```bash
npm run security:audit -- "Audita Supabase RLS, compras, caja y entrega de productos. Prioriza hallazgos críticos."
```

El runner imprime la respuesta en streaming y usa por defecto:

- Modelo: `openai/gpt-oss-safeguard-20b`
- `temperature`: `1`
- `max_completion_tokens`: `8192`
- `top_p`: `1`
- `reasoning_effort`: `medium`

Puedes cambiar el modelo sin editar código:

```bash
GROQ_SECURITY_MODEL="openai/gpt-oss-safeguard-20b" npm run security:audit
```

## Configuración

La configuración CLI del auditor vive en `agents/security-auditor.groq.mjs`, el ejecutor de terminal en `scripts/run-security-audit-groq.mjs` y la integración en app en `src/app/api/security-auditor/route.ts`.

## Alcance recomendado para esta plataforma

Pídele al auditor revisar con evidencia:

- Supabase RLS, permisos `anon`/`authenticated`, funciones `security definer` y exposición de tablas sensibles.
- Autenticación, creación de usuarios, roles, sesiones y permisos por módulo.
- Flujo de compras, generación de códigos, confirmación de pagos, entregas y devoluciones.
- Integridad de inventario, caja, auditoría y trazabilidad de acciones con impacto financiero.
- Configuración de Netlify, cabeceras, variables públicas/privadas y logs de producción.

La regla práctica: si afecta dinero, stock, usuarios o entrega de productos, debe quedar validado en servidor o base de datos, no solamente en la interfaz.
