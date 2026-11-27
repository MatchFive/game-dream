// 一次性脚本：按"源码 + 真实 DOM 里出现过"的类名，剪掉只服务旧 DOM 的 CSS 规则。
// 用法：node scripts/prune-css.mjs [--apply]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const apply = process.argv.includes('--apply');

const FILES = [
  'packages/studio/public/theme.css',
  'packages/studio/public/styles.css',
  'packages/studio/public/studio.css',
];

// 源码里静态出现的类名：className 字面量、模板字符串片段、普通字符串字面量
const used = new Set();
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|dist/.test(full)) walk(full, out);
    } else if (/\.(tsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
for (const file of walk(join(root, 'packages/studio/web/src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{[`'"]([^`'"]*)[`'"]\})/g)) {
    for (const name of (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ').split(/[^A-Za-z0-9_-]+/)) {
      if (name) used.add(name);
    }
  }
  for (const m of src.matchAll(/[`]([^`]*)[`]/g)) {
    for (const name of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/[^A-Za-z0-9_-]+/)) {
      if (name && /^[a-z][a-z0-9-]*$/.test(name)) used.add(name);
    }
  }
  for (const m of src.matchAll(/'([a-z][a-z0-9-]{2,})'/g)) used.add(m[1]);
}

// 真实 DOM 里出现的类名（渲染后才存在的）
for (const page of ['mission', 'assets', 'settings']) {
  const file = join(root, `dist/css-prune/dom-${page}.html`);
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of m[1].split(/\s+/)) if (name) used.add(name);
  }
}

// 运行时拼接的类名：前缀整体保留
const PROTECTED_PREFIXES = ['canvas-node-'];
// 状态类（来自后端字段，源码里是变量）
for (const status of ['ok', 'bad', 'warn', 'error', 'idle', 'running', 'finished', 'failed', 'canceled', 'pending', 'applied', 'waiting']) {
  used.add(status);
}

const isUsedClass = (name) =>
  used.has(name) || PROTECTED_PREFIXES.some((prefix) => name.startsWith(prefix));

/** 找到一个规则块的结束位置（处理嵌套花括号）。 */
function blockEnd(css, start) {
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length - 1;
}

/** 把 CSS 拆成顶层片段：注释、at-rule、普通规则，保持原文顺序。 */
function parseSegments(css) {
  const segments = [];
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open < 0) {
      segments.push({ type: 'tail', text: css.slice(index) });
      break;
    }
    const prelude = css.slice(index, open);
    const close = blockEnd(css, open);
    const text = css.slice(index, close + 1);
    if (prelude.trim().startsWith('@media')) {
      segments.push({ type: 'media', prelude: prelude.trim(), body: css.slice(open + 1, close) });
    } else if (prelude.trim().startsWith('@')) {
      segments.push({ type: 'at', text });
    } else {
      segments.push({ type: 'rule', prelude, text });
    }
    index = close + 1;
  }
  return segments;
}

function selectorUsed(selector) {
  const classes = [...selector.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
  if (classes.length === 0) return true; // 元素/id/属性选择器，不动
  return classes.some((name) => isUsedClass(name));
}

const report = [];

for (const rel of FILES) {
  const css = readFileSync(join(root, rel), 'utf8');
  const segments = parseSegments(css);
  const out = [];
  const removedClasses = new Set();
  let removedRules = 0;
  let removedSelectors = 0;

  for (const segment of segments) {
    if (segment.type !== 'rule' && segment.type !== 'media') {
      out.push(segment.type === 'tail' ? segment.text : segment.text);
      continue;
    }
    const source = segment.type === 'media' ? segment.body : segment.text;
    const prelude = segment.type === 'media' ? '' : segment.prelude;
    const segments2 = segment.type === 'media' ? parseSegments(segment.body) : null;

    if (segment.type === 'media') {
      const kept = [];
      for (const inner of segments2) {
        if (inner.type !== 'rule') {
          kept.push(inner.text ?? '');
          continue;
        }
        const selectors = inner.prelude.split(',').map((s) => s.trim()).filter(Boolean);
        const survivors = selectors.filter(selectorUsed);
        removedSelectors += selectors.length - survivors.length;
        for (const dead of selectors.length === survivors.length ? [] : selectors.filter((s) => !selectorUsed(s))) {
          for (const m of dead.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) removedClasses.add(m[1]);
        }
        if (survivors.length === 0) {
          removedRules += 1;
          continue;
        }
        const decls = inner.text.slice(inner.text.indexOf('{'));
        kept.push(`${survivors.join(', ')} ${decls}`);
      }
      if (kept.some((text) => text.trim())) {
        out.push(`${segment.prelude} {\n${kept.join('\n')}\n}`);
      }
      continue;
    }

    const selectors = prelude.split(',').map((s) => s.trim()).filter(Boolean);
    const survivors = selectors.filter(selectorUsed);
    removedSelectors += selectors.length - survivors.length;
    for (const dead of selectors) {
      if (selectorUsed(dead)) continue;
      for (const m of dead.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) removedClasses.add(m[1]);
    }
    if (survivors.length === 0) {
      removedRules += 1;
      continue;
    }
    const decls = source.slice(source.indexOf('{'));
    out.push(`${survivors.join(', ')} ${decls}`);
  }

  const next = out.join('');
  report.push({ rel, before: css.length, after: next.length, removedRules, removedSelectors, removedClasses: [...removedClasses].sort() });
  if (apply) writeFileSync(join(root, rel), next);
}

for (const entry of report) {
  console.log(
    `${entry.rel}: ${entry.before}B -> ${entry.after}B (-${entry.before - entry.after}), `
    + `rules -${entry.removedRules}, selectors -${entry.removedSelectors}, classes ${entry.removedClasses.length}`,
  );
}
if (!apply) {
  console.log('\n(dry run) 加 --apply 才会写回文件');
  for (const entry of report) console.log(`\n${entry.rel}\n  ${entry.removedClasses.join(' ')}`);
}
