#!/usr/bin/env node
// Genera un SVG animado: un coche recorre tu gráfica de contribuciones
// fila a fila y va dejando pintadas las casillas a su paso.
//
// Uso:
//   GITHUB_TOKEN=xxx node scripts/drive.mjs <usuario>   -> datos reales
//   node scripts/drive.mjs --demo                        -> datos de ejemplo
//
// Variables opcionales: GH_USER, OUT (por defecto dist/drive.svg)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const DEMO = args.includes("--demo");
const USER = process.env.GH_USER || args.find((a) => !a.startsWith("--")) || "crlossrs-dev";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT || "dist/drive.svg";

// ---------- Ajustes visuales ----------
const S = 14;          // distancia entre casillas
const C = 11;          // tamaño de casilla
const PAD = 16;        // margen alrededor de la gráfica
const CYCLE = 16;      // segundos por vuelta completa
const DRIVE = 0.86;    // fracción del ciclo que el coche está conduciendo
const BASE = "#161b22";               // casilla vacía (sin pintar)
const TRAIL = ["#2b2140", "#5b2a86", "#9b3fbf", "#e0529c", "#ff9f43"]; // nivel 0..4
const FLASH = "#fff4c2";              // destello al pasar el coche

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchWeeks() {
  if (!TOKEN) throw new Error("Falta GITHUB_TOKEN (o usa --demo)");
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{contributionLevel weekday}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (json.errors || !json.data?.user) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map((w) => {
    const col = Array(7).fill(null);
    for (const d of w.contributionDays) col[d.weekday] = LEVELS[d.contributionLevel] ?? 0;
    return col;
  });
}

function demoWeeks() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 53 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      if (w === 52 && d > 3) return null; // semana actual incompleta
      const r = rnd();
      return r < 0.45 ? 0 : r < 0.65 ? 1 : r < 0.8 ? 2 : r < 0.92 ? 3 : 4;
    })
  );
}

function buildSvg(weeks) {
  const W = weeks.length;
  const width = PAD * 2 + (W - 1) * S + C;
  const height = PAD * 2 + 6 * S + C;
  const cx = (w) => PAD + w * S + C / 2;
  const cy = (d) => PAD + d * S + C / 2;

  // Recorrido en zigzag: fila 0 izq→der, fila 1 der→izq, ... con curvas en U.
  const lead = 4 * S;                 // entra y sale fuera de la imagen
  const straight = (W - 1) * S;
  const arc = (Math.PI * S) / 2;      // semicircunferencia de radio S/2
  const total = 2 * lead + 7 * straight + 6 * arc;

  const xs = cx(0), xe = cx(W - 1), r = S / 2;
  let path = `M${xs - lead},${cy(0)} L${xe},${cy(0)}`;
  for (let d = 1; d < 7; d++) {
    const goingLeft = d % 2 === 1;
    if (goingLeft) path += ` A${r},${r} 0 0 1 ${xe},${cy(d)} L${xs},${cy(d)}`;
    else path += ` A${r},${r} 0 0 0 ${xs},${cy(d)} L${xe},${cy(d)}`;
  }
  path += ` L${xe + lead},${cy(6)}`;

  const f = (dist) => ((dist / total) * DRIVE).toFixed(4);
  const cells = [];
  weeks.forEach((col, w) => {
    col.forEach((lvl, d) => {
      if (lvl === null) return;
      const along = d % 2 === 0 ? w : W - 1 - w;
      const dist = lead + d * (straight + arc) + along * S;
      const t = Number(f(dist));
      const t2 = (t + 0.006).toFixed(4);
      cells.push(
        `<rect x="${PAD + w * S}" y="${PAD + d * S}" width="${C}" height="${C}" rx="2" fill="${BASE}">` +
          `<animate attributeName="fill" dur="${CYCLE}s" repeatCount="indefinite" calcMode="discrete" ` +
          `keyTimes="0;${t};${t2};0.97" values="${BASE};${FLASH};${TRAIL[lvl]};${BASE}"/></rect>`
      );
    });
  });

  // Coche visto desde arriba, mirando hacia +x (rotate="auto" lo orienta).
  const car = `
  <g>
    <g>
      <animateTransform attributeName="transform" type="rotate" values="-5;5;-5" dur="0.5s" repeatCount="indefinite"/>
      <polygon points="11,-3 34,-10 34,10 11,3" fill="url(#beam)"/>
      <rect x="-11" y="-6.5" width="22" height="13" rx="4" fill="#2f8cff" filter="url(#glow)"/>
      <rect x="-3" y="-5" width="8" height="10" rx="2" fill="#0d2a52"/>
      <rect x="-9" y="-4.5" width="4" height="9" rx="1.5" fill="#0d2a52" opacity="0.8"/>
      <rect x="9" y="-5.5" width="2.5" height="3" rx="1" fill="#fff6b0"/>
      <rect x="9" y="2.5" width="2.5" height="3" rx="1" fill="#fff6b0"/>
      <rect x="-11.5" y="-5.5" width="2" height="3" rx="1" fill="#ff3b5c"/>
      <rect x="-11.5" y="2.5" width="2" height="3" rx="1" fill="#ff3b5c"/>
    </g>
    <animateMotion dur="${CYCLE}s" repeatCount="indefinite" rotate="auto"
      keyPoints="0;1;1" keyTimes="0;${DRIVE};1" calcMode="linear" path="${path}"/>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>${USER} — contribution drive</title>
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="beam" x1="0" x2="1">
      <stop offset="0" stop-color="#fff6b0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#fff6b0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="8" fill="#0d1117"/>
  ${cells.join("\n  ")}
  ${car}
</svg>
`;
}

const weeks = DEMO ? demoWeeks() : await fetchWeeks();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buildSvg(weeks));
console.log(`OK → ${OUT} (${weeks.length} semanas, usuario ${DEMO ? "demo" : USER})`);
