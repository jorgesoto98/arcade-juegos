# 🕹️ Arcade

Colección de juegos web hechos con HTML, CSS y JavaScript puro — sin dependencias ni build. Solo abre y juega.

## 🎮 Jugar

El `index.html` es el **menú principal** para elegir juego.

## Juegos

### 🧩 Sliding Puzzle
Rompecabezas deslizante con una mecánica especial: al tocar una ficha alineada con el hueco, se deslizan **todas las fichas intermedias de la fila o columna** de un solo toque.

- Menú inicial para elegir tablero: **3×3**, **4×4** o **5×5**
- Vista previa de la cadena de fichas que se moverá
- Estrellas por eficiencia, sonido opcional, confeti y vibración
- Botón **Solve** que resuelve el puzzle automáticamente (IDA\* ponderado)
- Mejor marca guardada localmente

## Estructura

```
.
├── index.html          # Menú principal (hub de juegos)
└── sliding-puzzle/     # Sliding Puzzle
    ├── index.html
    ├── style.css
    └── script.js
```

## Desarrollo local

Por restricciones del navegador (`file://`), sírvelo con un servidor estático:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```
