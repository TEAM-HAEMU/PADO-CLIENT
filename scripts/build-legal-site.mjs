#!/usr/bin/env node
/**
 * PADO 공개 사이트 생성 — 랜딩(site/index.html) + 약관·개인정보처리방침(src/content/terms.ts, 앱과 같은 본문)을 정적 HTML로.
 * Google OAuth 동의 화면(홈페이지·개인정보처리방침·약관 링크)과 스토어 등록에 쓰는 공개 URL용.
 *
 *   SITE_URL=https://paado.app/ node scripts/build-legal-site.mjs [출력 폴더=legal-site]
 *   (SITE_URL은 공유 미리보기·canonical 주소. 없으면 지금 GitHub Pages 주소)
 * 출력 폴더를 GitHub Pages 저장소(CraftsManShip001/pado-legal)에 올리면 된다.
 * (Node 23.6+의 TypeScript 타입 제거 기능으로 terms.ts를 바로 불러온다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'legal-site');
const SITE_URL = (process.env.SITE_URL || 'https://craftsmanship001.github.io/pado-legal/').replace(/\/?$/, '/');
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

const tabs = current => PAGES.map(p => `<a href="${p.file}"${p.file === current ? ' aria-current="page"' : ''}>${p.nav}</a>`).join('');

/** 공통 헤더 — 랜딩·약관 모두 */
const header = () => `<header class="top"><div class="wrap">
<a class="brand" href="index.html"><img src="assets/icon.png" alt="" width="28" height="28">PADO</a>
<nav><a class="wide" href="index.html#how">소개</a><a class="wide" href="index.html#drop">남기기</a><a href="privacy.html">개인정보 처리방침</a></nav>
</div></header>`;

/** 공통 푸터 — 사업자 정보(상호·대표·사업자등록번호·주소·연락처·호스팅)와 법적 고지 링크. 통신판매(유료 판매)가 없어 통신판매업 신고번호는 표시하지 않는다 */
const sep = '<span class="sep" aria-hidden="true"></span>';
const footer = () => `<footer class="foot"><div class="wrap">
<div class="links"><a class="strong" href="privacy.html">개인정보 처리방침</a><a href="terms.html">서비스 이용약관</a><a href="location.html">위치기반서비스 이용약관</a><a href="marketing.html">마케팅 정보 수신 동의</a><a href="delete-account.html">계정 삭제 요청</a></div>
<p>상호 ${esc(OPERATOR.company)}${sep}대표 ${esc(OPERATOR.representative)}${sep}사업자등록번호 ${esc(OPERATOR.bizNo)}</p>
<p>주소 ${esc(OPERATOR.address)}</p>
<p>이메일 <a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a>${sep}개인정보 보호책임자 ${esc(OPERATOR.privacyOfficer)}</p>
<p>호스팅 서비스 Cloudflare, Inc. (Cloudflare Pages)</p>
<p class="copy">© ${new Date().getFullYear()} ${esc(OPERATOR.company)}. All rights reserved.</p>
</div></footer>`;

/** 문서 페이지 — 흰 화면에 탭·제목·본문만 (시안 1) */
const layout = (title, body, current, meta = '') => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · PADO</title>
<meta name="description" content="PADO(파도) — 거리에 음악을 흘려두는 위치 기반 음악 공유 앱">
<link rel="icon" href="assets/favicon.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="site.css">
</head>
<body>
${header()}
<main class="doc">
<nav class="tabs" aria-label="약관">${tabs(current)}<a href="delete-account.html"${current === 'delete-account.html' ? ' aria-current="page"' : ''}>계정 삭제 요청</a></nav>
<h1>${esc(title)}</h1>
${meta ? `<p class="meta">${meta}</p>` : ''}
${body}
</main>
${footer()}
</body>
</html>
`;

fs.mkdirSync(out, { recursive: true });
for (const p of PAGES) {
  const doc = TERMS[p.type];
  const title = p.title ?? doc.title;
  fs.writeFileSync(path.join(out, p.file), layout(title, render(doc.body), p.file, `시행일 ${doc.version}`));
}
// Google Play 계정 삭제 요구사항 — 앱을 지운 사람도 웹에서 삭제를 요청할 수 있는 페이지
const deleteBody = `<h2>앱에서 바로 삭제</h2>
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
fs.writeFileSync(path.join(out, 'delete-account.html'), layout('계정 삭제 요청', deleteBody, 'delete-account.html', 'PADO(파도) 계정과 관련 데이터를 삭제하는 방법이에요.'));

// 랜딩 — site/index.html(본문)에 공통 헤더·푸터를 끼우고, 스타일·이미지를 함께 복사
const site = path.join(root, 'site');
fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(site, 'index.html'), 'utf8')
  .replace('<!--HEADER-->', header()).replace('<!--FOOTER-->', footer()).replaceAll('{{EMAIL}}', esc(OPERATOR.email)).replaceAll('{{SITE_URL}}', SITE_URL));
// 없는 주소로 들어온 경우 (GitHub Pages가 404.html을 보여준다)
fs.writeFileSync(path.join(out, '404.html'), layout('페이지를 찾을 수 없어요', `<p>주소가 바뀌었거나 없어진 페이지예요.</p><p style="margin-top:24px"><a href="index.html">PADO 홈으로 가기</a></p>`, '404.html')
  .replace('<head>', `<head>\n<base href="${SITE_URL}">`).replace('<nav class="tabs"', '<nav hidden class="tabs"')); // 어느 경로에서 열려도 링크·스타일이 맞게
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n`);
fs.copyFileSync(path.join(site, 'site.css'), path.join(out, 'site.css'));
fs.cpSync(path.join(site, 'assets'), path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`[legal-site] 랜딩 + ${PAGES.length + 1}개 문서 → ${path.relative(root, out)}/`);
