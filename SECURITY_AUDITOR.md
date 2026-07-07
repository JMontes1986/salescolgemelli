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

- En `/self-service` permanece activa en segundo plano y ejecuta una revisión inicial de autogestión, pero el botón público no abre el detalle de hallazgos para padres de familia.
- Si la revisión automática de `/self-service` describe una posible brecha, ataque o riesgo alto/crítico, el endpoint registra `SELF_SERVICE_SECURITY_ALERT` en Auditoría para que administrador o auditor lo revisen desde la sección de seguridad.
- En el dashboard administrativo queda disponible como botón flotante con hallazgos y solución ideal de ciberseguridad para cada riesgo activo o residual.
- El navegador llama a `/api/security-auditor`; esa ruta usa `GROQ_API_KEY` solo en servidor.
- La IA recibe contexto de ruta y superficie, no datos personales de clientes. En autogestión pública la respuesta del endpoint se reduce a un estado genérico; el resumen técnico redactado queda solo en la bitácora administrativa.

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
- Configuración de Vercel, cabeceras, variables públicas/privadas y logs de producción.

La regla práctica: si afecta dinero, stock, usuarios o entrega de productos, debe quedar validado en servidor o base de datos, no solamente en la interfaz.
