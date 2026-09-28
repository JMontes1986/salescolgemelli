# Design System: Ventas ColGemelli

## 1. Visual Theme & Atmosphere

Una interfaz institucional contemporanea, serena y directa: mas cercana a una plataforma de servicio escolar confiable que a una pieza promocional tematica. La densidad es equilibrada (5/10), la variacion es moderada (4/10) y el movimiento es discreto (3/10). La prioridad es que familias, estudiantes y equipo administrativo entiendan siempre donde estan, que deben hacer y cual es el siguiente paso.

La composicion usa bloques amplios, jerarquia tipografica firme y espacios en blanco generosos. Las zonas operativas mantienen mas densidad que el acceso publico, pero comparten colores, radios, estados y lenguaje. No se usan referencias visuales a decadas, fiestas retro ni esteticas de neon.

## 2. Color Palette & Roles

- **Canvas Blue Mist** (`#F4F7FB`) — fondo principal frio y luminoso; conecta todas las areas sin competir con el contenido.
- **Pure Surface** (`#FFFFFF`) — paneles, formularios y superficies elevadas.
- **Navy Ink** (`#172434`) — texto principal; reemplaza el negro puro.
- **Slate Blue** (`#5F6F82`) — texto secundario, ayudas y metadatos.
- **Blue Mist Border** (`#D7E1EC`) — divisores y bordes estructurales de 1 px.
- **Gemelli Blue** (`#0D4D8B`) — acento principal; acciones, foco, seleccion y estados activos.
- **Deep Gemelli Blue** (`#073B72`) — superficies institucionales de alto contraste.
- **Gemelli Yellow** (`#F2C84B`) — acento complementario para hitos, llamadas destacadas e indicadores.
- **Soft Yellow Wash** (`#FFF3C4`) — fondos seleccionados y realces vinculados al amarillo.
- **Semantic Amber** (`#A86413`) — solo avisos y estados pendientes, nunca decoracion.
- **Semantic Red** (`#B42318`) — errores y acciones destructivas.

No usar gradientes multicolor, cyan, magenta o morado como decoracion. Azul y amarillo son los unicos acentos de marca; los colores semanticos se reservan para estados.

## 3. Typography Rules

- **Display:** `Geist`, sans-serif — peso 650–750, tracking ajustado y escala controlada con `clamp()`.
- **Body:** `Geist`, sans-serif — 15–16 px, interlineado relajado y ancho maximo de 65 caracteres para textos explicativos.
- **Mono:** `Geist Mono`, monospace — codigos de compra, referencias, cifras densas y marcas de tiempo.
- Los titulos usan frase natural, no mayusculas sostenidas. La jerarquia se expresa con peso, espacio y color.
- Prohibidos `Inter`, serif genericas y bloques extensos en mayusculas.

## 4. Component Stylings

- **Botones:** altura minima de 44 px, radio de 12–14 px, texto semibold. El primario usa Gemelli Blue; el amarillo se reserva para llamadas institucionales destacadas. Los secundarios son blancos con borde Blue Mist. Al presionar se desplazan 1 px hacia abajo. Sin brillos externos.
- **Paneles:** radio de 20–24 px, borde fino y sombra corta tintada al fondo. Solo se elevan formularios, resumenes y acciones principales; las listas densas usan divisores.
- **Campos:** etiqueta visible arriba, ayuda opcional debajo y error inmediatamente posterior. Altura minima de 48 px y foco azul de alto contraste.
- **Productos:** imagen con proporcion consistente, nombre legible sin mayusculas, precio prominente y disponibilidad expresada en lenguaje simple. La tarjeta completa puede agregar el producto, pero conserva un boton explicito.
- **Pasos:** secuencia vertical u horizontal numerada con verbos breves. En movil se convierte en una sola columna.
- **Carga:** esqueletos con las mismas dimensiones del contenido final. No usar spinners genericos.
- **Vacios:** explicar por que no hay contenido y que puede hacer la persona a continuacion.
- **Errores:** mensajes concretos junto a la accion o campo que los produjo.

## 5. Layout Principles

- Contenedor maximo de 1280 px centrado, con margenes fluidos de 16–32 px.
- CSS Grid para las divisiones principales. En Autogestion: catalogo flexible y resumen fijo de 360–380 px en escritorio.
- El acceso usa una composicion dividida: contexto del producto a la izquierda y formulario a la derecha. No usa una tarjeta aislada flotando sin contexto.
- Debajo de 768 px, toda estructura multicolumna se convierte en una columna y el resumen de compra deja de ser fijo.
- Ningun elemento se superpone. No se permite desplazamiento horizontal en movil.
- Todas las zonas interactivas tienen al menos 44 x 44 px.

## 6. Motion & Interaction

- Transiciones entre 180 y 260 ms con curva `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animar solo `transform` y `opacity`.
- Las tarjetas pueden elevarse 2 px al pasar el cursor; los botones descienden 1 px al presionarse.
- Las listas aparecen con una cascada corta, desactivada cuando el sistema solicita movimiento reducido.
- Los estados activos pueden usar un pulso muy tenue en el indicador, nunca sobre texto ni areas grandes.

## 7. Anti-Patterns (Banned)

- No emojis ni iconos usados como decoracion sin significado.
- No `Inter`, serif genericas ni negro puro.
- No neon, brillos externos, gradientes arcoiris o estetica retro 80/90.
- No titulos completos en mayusculas ni tracking excesivo.
- No tres tarjetas identicas como bloque promocional; los pasos son una secuencia funcional.
- No encabezados centrados cuando una alineacion izquierda mejora la lectura.
- No cursores personalizados, elementos superpuestos o botones menores a 44 px.
- No porcentajes falsos, datos de ejemplo presentados como reales ni nombres genericos.
- No frases de marketing vacias como “eleva”, “experiencia perfecta” o “proxima generacion”.
- No texto de relleno ni instrucciones que dependan solo del color.
