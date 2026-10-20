import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('麦迹-演示.html', root), 'utf8');
const embedded = html.match(/<script\b[^>]*\bid="recapData"[^>]*>([\s\S]*?)<\/script>/);
if (!embedded) {
  throw new Error('演示页缺少回顾数据，请先运行 python recap.py --demo。');
}

const data = JSON.parse(embedded[1]);
if (data.initial?.source !== 'demo' || data.demo?.source !== 'demo') {
  throw new Error('只允许发布虚构演示数据，请先运行 python recap.py --demo。');
}

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/index.html', root), html, 'utf8');
console.log('演示网站已生成：dist/index.html（仅包含虚构示例）');
