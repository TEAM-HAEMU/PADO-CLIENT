#!/usr/bin/env node
/**
 * 약관·개인정보처리방침 공개 페이지 생성 — src/content/terms.ts(앱과 같은 본문)를 정적 HTML로.
 * Google OAuth 동의 화면(홈페이지·개인정보처리방침·약관 링크)과 스토어 등록에 쓰는 공개 URL용.
 *
 *   node scripts/build-legal-site.mjs [출력 폴더=legal-site]
 * 출력 폴더를 GitHub Pages 저장소(CraftsManShip001/pado-legal)에 올리면 된다.
 * (Node 23.6+의 TypeScript 타입 제거 기능으로 terms.ts를 바로 불러온다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'legal-site');
const { TERMS, OPERATOR } = await import(path.join(root, 'src/content/terms.ts'));

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEADING = /^(제\d+조|■ |부칙$|# )/;

/** 앱 약관 화면과 같은 규칙: 제목 줄 / 목록(  - , ·) / 문단 */
function render(body) {
  const html = [];
  let list = null;
  const close = () => { if (list) { html.push('</ul>'); list = null; } };
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { close(); continue; }
    if (HEADING.test(line)) { close(); html.push(`<h2>${esc(line.replace(/^# /, ''))}</h2>`); continue; }
    const li = line.match(/^\s+[-·]\s+(.*)$/);
    if (li) {
      if (!list) { html.push('<ul>'); list = true; }
      html.push(`<li${/^\s{4,}/.test(line) ? ' class="sub"' : ''}>${esc(li[1])}</li>`);
      continue;
    }
    close();
    html.push(`<p>${esc(line)}</p>`);
  }
  close();
  return html.join('\n');
}

const PAGES = [
  { file: 'terms.html', type: 'SERVICE', nav: '서비스 이용약관' },
  { file: 'privacy.html', type: 'PRIVACY', nav: '개인정보 처리방침', title: '개인정보 처리방침' },
  { file: 'location.html', type: 'LOCATION', nav: '위치기반서비스 이용약관' },
  { file: 'marketing.html', type: 'MARKETING', nav: '마케팅 정보 수신 동의' },
];

const nav = current => PAGES.map(p => `<a href="${p.file}"${p.file === current ? ' aria-current="page"' : ''}>${p.nav}</a>`).join('');

const layout = (title, body, current) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · PADO</title>
<meta name="description" content="PADO(파도) — 거리에 음악을 흘려두는 위치 기반 음악 공유 앱">
<style>
  :root { --page:#050916; --card:#0B1330; --ink:#EAF1FF; --ink2:#8D9BC4; --line:#19234D; --primary:#4FD1FF; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--page); color:var(--ink2); font:16px/1.7 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
  header { border-bottom:1px solid var(--line); }
  .wrap { max-width:760px; margin:0 auto; padding:24px 16px 64px; }
  .brand { color:var(--ink); text-decoration:none; font-weight:700; letter-spacing:.2em; font-size:20px; }
  nav { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:12px; font-size:14px; }
  nav a { color:var(--ink2); text-decoration:none; }
  nav a[aria-current] { color:var(--primary); }
  h1 { color:var(--ink); font-size:26px; margin:8px 0 4px; }
  h2 { color:var(--ink); font-size:17px; margin:28px 0 6px; }
  p { margin:4px 0; }
  ul { margin:4px 0; padding-left:20px; }
  li.sub { margin-left:16px; list-style:circle; }
  .meta { font-size:14px; }
  .links a { display:block; padding:14px 16px; margin:8px 0; border:1px solid var(--line); border-radius:14px; background:var(--card); color:var(--ink); text-decoration:none; }
  footer { font-size:13px; border-top:1px solid var(--line); margin-top:40px; padding-top:16px; }
</style>
</head>
<body>
<header><div class="wrap" style="padding-bottom:16px"><a class="brand" href="index.html">PADO</a><nav>${nav(current)}</nav></div></header>
<main class="wrap">
${body}
<footer>© ${OPERATOR.company} · 문의 ${esc(OPERATOR.email)}</footer>
</main>
</body>
</html>
`;

fs.mkdirSync(out, { recursive: true });
for (const p of PAGES) {
  const doc = TERMS[p.type];
  const title = p.title ?? doc.title;
  fs.writeFileSync(path.join(out, p.file), layout(title, `<h1>${esc(title)}</h1>\n<p class="meta">시행일 ${doc.version}</p>\n${render(doc.body)}`, p.file));
}
fs.writeFileSync(path.join(out, 'index.html'), layout('PADO', `<h1>PADO(파도)</h1>
<p>거리에 음악을 흘려두고, 누군가의 하루에 닿게.</p>
<p>PADO는 지금 있는 곳에 좋아하는 음악을 남기고, 주변에 남겨진 음악을 발견하는 위치 기반 음악 공유 앱입니다.</p>
<div class="links">${PAGES.map(p => `<a href="${p.file}">${p.nav}</a>`).join('')}</div>`, 'index.html'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`[legal-site] ${PAGES.length + 1}개 페이지 → ${path.relative(root, out)}/`);
