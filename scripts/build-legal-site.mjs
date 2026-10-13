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
// Google Play 계정 삭제 요구사항 — 앱을 지운 사람도 웹에서 삭제를 요청할 수 있는 페이지
const deleteBody = `<h1>PADO 계정 삭제 요청</h1>
<p class="meta">PADO(파도) 계정과 관련 데이터를 삭제하는 방법이에요.</p>
<h2>앱에서 바로 삭제</h2>
<ul>
<li>PADO 앱 › 프로필 › 설정(톱니바퀴) › 회원 탈퇴 › '탈퇴하기'</li>
<li>모든 기기에서 로그아웃되고, 90일 안에 다시 로그인하면 계정을 복구할 수 있어요.</li>
</ul>
<h2>앱 없이 요청</h2>
<p>앱을 지웠거나 로그인할 수 없다면, 가입한 이메일 주소에서 <b>${esc(OPERATOR.email)}</b>로 '계정 삭제 요청'과 PADO 닉네임을 보내 주세요. 본인 확인 후 7일 안에 처리하고 결과를 메일로 알려 드려요.</p>
<h2>삭제되는 정보</h2>
<ul>
<li>탈퇴 90일 뒤: 이메일, 비밀번호, 생년월일, 성별, 소셜 로그인 식별값, 프로필 사진, 플레이리스트, 알림, 차단 목록</li>
<li>이용 분석 기록(Amplitude, 분석에 동의한 경우에만 수집): 탈퇴하면 앱에서 분석 연결을 끊고, 이미 보낸 기록은 수집일로부터 1년 뒤 자동 삭제. 바로 삭제를 원하면 아래 이메일로 요청하면 처리합니다.</li>
</ul>
<h2>남는 정보</h2>
<ul>
<li>남긴 드랍·댓글·좋아요는 작성자를 알 수 없도록 '탈퇴한 사용자'로 표시되어 남아요.</li>
<li>관련 법령에 따라 보관해야 하는 정보: 서비스 접속 기록 3개월(통신비밀보호법), 위치정보 이용·제공사실 확인자료 6개월(위치정보법)</li>
</ul>`;
fs.writeFileSync(path.join(out, 'delete-account.html'), layout('계정 삭제 요청', deleteBody, 'delete-account.html'));

fs.writeFileSync(path.join(out, 'index.html'), layout('PADO', `<h1>PADO(파도)</h1>
<p>거리에 음악을 흘려두고, 누군가의 하루에 닿게.</p>
<p>PADO는 지금 있는 곳에 좋아하는 음악을 남기고, 주변에 남겨진 음악을 발견하는 위치 기반 음악 공유 앱입니다.</p>
<div class="links">${PAGES.map(p => `<a href="${p.file}">${p.nav}</a>`).join('')}<a href="delete-account.html">계정 삭제 요청</a></div>`, 'index.html'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`[legal-site] ${PAGES.length + 2}개 페이지 → ${path.relative(root, out)}/`);
