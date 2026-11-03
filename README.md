# 청년주택 알리미

LH청약플러스 + SH 서울주거포털의 임대 공고를 3시간마다 수집해 `data/listings.json`에 쌓고, `index.html`에서 필터링해 보여줍니다.

- 수동 실행: `node scan.mjs`
- 자동 실행: `.github/workflows/scan.yml` (GitHub에 이 폴더를 별도 저장소로 올리면 동작)
- 텔레그램 알림(선택): 저장소 Secrets에 `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` 등록 → 새 "1인 청년 후보" 공고만 푸시
- 배포: Cloudflare Pages / GitHub Pages에 정적 호스팅 (빌드 불필요)
- "1인 청년 후보"는 제목 키워드 기반 추정이라 실제 자격은 공고문에서 확인해야 합니다.
