// 청년·1인가구 임대 공고 수집기 (LH청약플러스 + SH 서울주거포털). 의존성 없음, Node 18+.
// 실행: node scan.mjs   → data/listings.json 갱신, 신규 공고는 Telegram(선택)으로 알림
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (housing-finder personal use)';
const OUT = new URL('./data/listings.json', import.meta.url);
const LH_LIST = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1026';
const SH_LIST = 'https://housing.seoul.go.kr/site/main/sh/publicLease/list';

// 1인 청년이 노려볼 만한 공고 판별용 키워드
const YOUTH = /청년|행복주택|도전숙|희망하우징|기숙사|대학생|사회초년생|1인|독신|쉐어|원룸|매입임대|통합공공|안심주택/;
const NOT_FIT = /신혼|다자녀|고령|어르신|홀몸|노인|장애|수급/;

const strip = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = d => d.replace(/\./g, '-');

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
}

function rows(html) {
  const body = html.slice(html.indexOf('<tbody'));
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
}

async function scanLH() {
  const html = await get(LH_LIST);
  return rows(html).flatMap(r => {
    const td = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]));
    if (td.length < 8) return [];
    const [no, type, title0, region, , posted, deadline, status] = td;
    const title = title0.replace(/\d+일전$|\d+시간전$/, '').trim();
    const pan = (r.match(/data-id1="(\d+)"/) || [])[1] || no;
    return [{ id: `lh-${pan}`, source: 'LH', type, title, region, posted: norm(posted), deadline: norm(deadline), status, url: LH_LIST }];
  });
}

async function scanSH() {
  const html = await get(SH_LIST);
  return rows(html).flatMap(r => {
    const td = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]));
    const href = (r.match(/href="(https?:[^"]+)"/) || [])[1];
    if (td.length < 7 || !href) return [];
    const [, type, title, posted, announce, status] = td;
    const seq = (href.match(/seq=(\d+)/) || [])[1] || title;
    return [{ id: `sh-${seq}`, source: 'SH', type, title, region: '서울특별시', posted, deadline: announce === '-' ? '' : announce, status, url: href }];
  });
}

function tag(l) {
  const t = `${l.type} ${l.title}`;
  l.fit = YOUTH.test(t) && !NOT_FIT.test(t);
  return l;
}

async function notify(items) {
  const { TELEGRAM_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat || !items.length) return;
  const text = '🏠 새 임대 공고 ' + items.length + '건\n\n' +
    items.slice(0, 15).map(l => `[${l.source}/${l.type}] ${l.title}\n${l.region} · 마감 ${l.deadline || '-'}\n${l.url}`).join('\n\n');
  const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!r.ok) console.error('telegram 실패', r.status);
}

let old = { listings: [] };
try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const known = new Map(old.listings.map(l => [l.id, l]));

const results = await Promise.allSettled([scanLH(), scanSH()]);
const fresh = [];
results.forEach((r, i) => r.status === 'fulfilled' ? fresh.push(...r.value) : console.error(['LH', 'SH'][i], '실패:', r.reason.message));
if (!fresh.length) { console.error('수집 결과 없음 — 기존 데이터 유지'); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
const added = [];
for (const l of fresh.map(tag)) {
  const prev = known.get(l.id);
  if (prev) l.firstSeen = prev.firstSeen; else { l.firstSeen = today; added.push(l); }
  known.set(l.id, { ...prev, ...l });
}
const listings = [...known.values()].sort((a, b) => (b.posted || '').localeCompare(a.posted || '')).slice(0, 400);

await mkdir(new URL('./data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), listings }, null, 1));
console.log(`수집 ${fresh.length}건, 신규 ${added.length}건`);
// 첫 실행(빈 DB)에는 알림 폭탄 방지
if (old.listings.length) await notify(added.filter(l => l.fit));
