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

### 🔢 2048
Desliza las fichas (flechas o swipe) para fusionar números iguales y combinarlos hasta llegar a la ficha **2048**. Cada movimiento genera una ficha nueva; el reto es no quedarte sin espacio.

### 🧠 Memory
Memorama de cartas: voltea pares de cartas para encontrar todas las parejas de íconos en la menor cantidad de movimientos posible. Usa un set de sprites SVG propios (control, dado, cohete, corazón, estrella, rayo, gema y fantasma).

### 🐍 Snake
La serpiente crece cada vez que come; el objetivo es comer lo más posible sin chocar contra los muros ni contra tu propio cuerpo. La comida se dibuja con un sprite SVG propio.

### 💣 Minesweeper
Buscaminas clásico: despeja todas las casillas seguras apoyándote en los números (cuántas minas hay alrededor) y marca con banderas las casillas sospechosas, sin pisar ninguna mina. Mina y bandera usan sprites SVG propios.

### 🪐 Big Merge
Suika cósmico: deja caer cuerpos celestes y fusiona dos iguales para crear el siguiente en la escala. La progresión va de **polvo estelar** a **galaxia** (11 niveles), cada uno con su propio sprite SVG con resplandor radial.

### 🔤 Starword
Wordle cósmico: adivina la palabra del día (de temática espacial) en seis intentos, con pistas de color por letra.

### ☄️ Astro Drop
Puzzle físico: corta la "cuerda" de gravedad en el momento justo para que el meteorito caiga dentro del agujero negro. Meteorito y agujero negro usan sprites SVG propios.

### 🛰️ Tiny Comet
Idle de progresión: lanza tu sonda para pescar fragmentos estelares en órbita y usa el botín para mejorar el alcance y la velocidad de la sonda. Sonda y fragmento usan sprites SVG propios.

### 🧱 Neon Breaker
Breakout de estética neón: rebota la bola con la paleta para romper todos los ladrillos sin que la bola se escape por abajo.

## Estructura

```
.
├── index.html          # Menú principal (hub de juegos)
├── sliding-puzzle/     # Sliding Puzzle
│   ├── index.html
│   ├── style.css
│   └── script.js
├── 2048/               # 2048
│   ├── index.html
│   ├── style.css
│   └── script.js
├── memorama/           # Memory
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/         # sym-1..sym-8.svg, back.svg
├── snake/              # Snake
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/         # food.svg
├── buscaminas/         # Minesweeper
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/         # mine.svg, flag.svg
├── big-merge/          # Big Merge (Suika cósmico)
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/         # stardust→galaxy (11 sprites .svg)
├── starword/           # Starword (Wordle cósmico)
│   ├── index.html
│   ├── style.css
│   └── script.js
├── astro-drop/         # Astro Drop (puzzle físico)
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/         # meteor.svg, blackhole.svg
├── tiny-comet/         # Tiny Comet (idle de progresión)
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── assets/         # probe.svg, fragment.svg
└── neon-breaker/       # Neon Breaker (breakout neón)
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
