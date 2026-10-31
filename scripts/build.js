/**
 * @file scripts/build.js
 * @description Vercel 배포용 번들링 · 주석 제거 · 난독화(Mangling) · 압축(Minify) 빌드 스크립트
 *
 * - GEMINI.md, 룰북 PDF, README.md 및 원본 js/*.js 파일은 배포 폴더(dist/)에 포함되지 않습니다.
 * - 오직 압축/난독화된 dist/index.html, dist/style.min.css, dist/app.min.js 3개 파일만 생성되어 배포됩니다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MODULE_ORDER = [
  'js/boardPresets.js',
  'js/state.js',
  'js/solver.js',
  'js/physics.js',
  'js/input.js',
  'js/rules.js',
  'js/renderer.js',
  'js/main.js',
];

const MANGLE_IDENTIFIERS = [
  'WALL',
  'ROBOT_COLORS',
  'TARGET_SYMBOLS',
  'CENTER_CLOSED_CELLS',
  'PLAYABLE_ROBOTS',
  'QUADRANT_PRESETS',
  'DIFFICULTY_TIERS',
  'DIRECTIONS',
  'DIRECTION_VECTORS',
  'COLOR_LABELS_KO',
  'SYMBOL_LABELS_KO',
  'SWIPE_THRESHOLD_PX',
  'isCenterClosedCell',
  'rotateWallMask',
  'rotateCoord8x8',
  'buildRotatedQuadrant',
  'syncBidirectionalWalls',
  'createBoardData',
  'classifyDifficulty',
  'compareRecords',
  'buildWallSlideTable',
  'slideFastWithCollision',
  'packSortedHelpers',
  'encodeStateKey',
  'solveBoardBFS',
  'buildSolverFeedback',
  'gameState',
  'generateRandomRobots',
  'cloneRobots',
  'initGameState',
  'updateBestRecord',
  'recordMoveForUndo',
  'undoLastMove',
  'resetCurrentRound',
  'getRobotAt',
  'computeSlideDestination',
  'resolveSwipeDirection',
  'bindInputEvents',
  'getDirectionAxis',
  'hasRobotRicocheted',
  'isTargetColorMatch',
  'evaluateRoundStatus',
  'getTargetSymbolSVG',
  'syncBoardPixelSize',
  'renderBoardGrid',
  'renderRobots',
  'updateRobotPositions',
  'renderHUD',
  'renderRuleFeedback',
  'handleSelectRobot',
  'handleMoveDirection',
  'handleUndo',
  'handleReset',
  'handleNextStage',
  'renderAll',
  'bootstrap',
];

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

function stripCommentsAndMinifyJS(source) {
  let out = '';
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const c = source[i];
        out += c;
        i++;
        if (c === '\\' && i < len) {
          out += source[i];
          i++;
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }

    out += ch;
    i++;
  }

  MANGLE_IDENTIFIERS.forEach((ident, idx) => {
    const mangled = `_0x${(idx + 0xa0).toString(16)}`;
    const regex = new RegExp(`\\b${ident}\\b`, 'g');
    out = out.replace(regex, mangled);
  });

  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\n+/g, '\n');
}

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function buildHTML(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace('./css/style.css', './style.min.css')
    .replace(
      '<script type="module" src="./js/main.js"></script>',
      '<script defer src="./app.min.js"></script>'
    )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/>\s+</g, '><');
}

function runBuild() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const combinedChunks = MODULE_ORDER.map((relPath) => {
    const fullPath = path.join(ROOT_DIR, relPath);
    const raw = fs.readFileSync(fullPath, 'utf8');
    return stripModuleSyntax(raw);
  });

  const wrappedJS = `(()=>{"use strict";\n${combinedChunks.join('\n')}\n})();`;
  const minifiedJS = stripCommentsAndMinifyJS(wrappedJS);
  fs.writeFileSync(path.join(DIST_DIR, 'app.min.js'), minifiedJS, 'utf8');

  const rawCSS = fs.readFileSync(path.join(ROOT_DIR, 'css/style.css'), 'utf8');
  const minifiedCSS = minifyCSS(rawCSS);
  fs.writeFileSync(path.join(DIST_DIR, 'style.min.css'), minifiedCSS, 'utf8');

  const rawHTML = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const minifiedHTML = buildHTML(rawHTML);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), minifiedHTML, 'utf8');

  console.log('✅ Build complete! Output in dist/:');
  for (const file of fs.readdirSync(DIST_DIR)) {
    const sizeKB = (
      fs.statSync(path.join(DIST_DIR, file)).size / 1024
    ).toFixed(2);
    console.log(`   - dist/${file} (${sizeKB} KB)`);
  }
}

runBuild();
