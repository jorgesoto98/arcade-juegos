# CLAUDE.md

Guía para trabajar en este repositorio. Léela antes de hacer cambios.

## Qué es

**Arcade** de juegos web hechos con **HTML, CSS y JavaScript puro** — sin frameworks, sin bundler, sin dependencias, sin paso de build. Se sirve como sitio estático (preparado para GitHub Pages: hay un `.nojekyll`). El objetivo es "abrir y jugar".

## Arquitectura

```
.
├── index.html          # Menú principal (hub) — tarjetas que enlazan a cada juego
└── <nombre-juego>/      # Una carpeta por juego, autocontenida
    ├── index.html
    ├── style.css
    └── script.js
```

- **Cada juego es autocontenido** en su carpeta con sus propios `index.html`, `style.css` y `script.js`. No se comparte código JS/CSS entre juegos (cada uno duplica lo que necesita). Mantén esa independencia salvo que se decida explícitamente extraer algo común.
- El **menú principal** (`/index.html`) lleva su CSS inline en un `<style>`. Los juegos individuales separan el CSS en `style.css`.
- Cada juego enlaza de vuelta al hub con `<a class="back-link" href="../index.html">← Arcade</a>`.

## Cómo agregar un juego nuevo

1. Crear carpeta `nombre-juego/` con `index.html`, `style.css`, `script.js`.
2. Incluir el enlace de regreso al arcade (`../index.html`).
3. Reemplazar la tarjeta `.card.soon` ("Coming soon") del menú principal por una `<a class="card" href="nombre-juego/index.html">` con emoji, `<h2>` y `.desc`. Si quieres dejar un placeholder, añade otra `.card.soon`.
4. Documentar el juego en `README.md` (sección "Juegos" + árbol de estructura).

## Sistema visual compartido

Aunque el CSS no se comparte como archivo, todos los juegos siguen el mismo lenguaje visual. Reutiliza estos tokens para mantener coherencia:

- Fondo oscuro base: `#0b1020`
- Tinta/texto: `--ink: #eef2ff`, atenuado: `--dim: #9aa6cc`
- Acentos: `--accent: #7c5cff` (morado), `--accent-2: #22d3ee` (cyan)
- Tipografía: **Sora** (UI/títulos) vía Google Fonts; **Space Grotesk** para números/displays en algunos juegos
- Tarjetas/superficies: `rgba(255,255,255,0.05)` con borde `rgba(255,255,255,0.08)`, `border-radius` ~18px
- Microinteracciones suaves (`transform: translateY(-4px)` en hover, transiciones ~160ms)

Calidad esperada en cada juego (el sliding-puzzle es la referencia): estados de victoria, feedback (confeti/vibración/sonido opcional), persistencia de mejores marcas en `localStorage`, y atributos de accesibilidad (`aria-label`, `aria-hidden`, `role`).

## Convenciones de código

- **Idioma**: los comentarios y los textos de documentación se escriben en **español**. El texto visible de la UI de los juegos está en **inglés** (ej. "Moves", "Solve", "Play again") — respeta lo que ya use cada juego.
- JavaScript de navegador puro (sin módulos ni imports). Selección de elementos con `getElementById` / `querySelector` al inicio del archivo, y un objeto `state` central para el estado del juego.
- Sin TODOs ni stubs: cada función debe quedar completa y funcional.

## Desarrollo local

Por la restricción `file://` del navegador, sírvelo con un servidor estático:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

No hay tests automatizados ni linters configurados. La verificación es manual en el navegador (probar el flujo principal y los casos límite).

## Git

- **No** hacer `git add/commit/push` sin que el usuario lo pida explícitamente.
- Mensajes en formato **Conventional Commits**, en español e imperativo. Usar scope con el nombre del juego cuando aplique.
  - Ej.: `feat(2048): agregar lógica de fusión de fichas`
  - Ej.: `feat: agregar juego de memoria al arcade`

## Artefactos de QA

Si usas Playwright u otras herramientas de automatización, **no** dejes screenshots/logs en el repo. La carpeta `.playwright-mcp/` y `*.log` ya están en `.gitignore`; limpia cualquier artefacto generado antes de terminar.
