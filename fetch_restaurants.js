/**
 * fetch_restaurants.js
 * 카카오 로컬 REST API를 사용해
 * 부산 주례·냉정 지역 음식점 리스트를 수집하고 txt 파일로 저장합니다.
 *
 * ▶ 실행 방법:
 *    node fetch_restaurants.js
 *
 * ▶ 사전 준비:
 *    developers.kakao.com → 내 앱 → 앱 키 탭 → REST API 키
 *    아래 KAKAO_REST_API_KEY 변수에 붙여넣기
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ====================================================================
// ⚠️  REST API 키를 여기에 입력하세요
//     developers.kakao.com → 내 애플리케이션 → 앱 키 → "REST API 키"
// ====================================================================
const KAKAO_REST_API_KEY = '6b4db317baae5211a7e28df1598bccc2';

// 검색할 지역 좌표 (위도/경도)
const SEARCH_AREAS = [
  { name: '부산 주례', lat: 35.1687, lng: 128.9773, radius: 800 },
  { name: '부산 냉정', lat: 35.1611, lng: 128.9891, radius: 800 }
];

// 검색할 음식 카테고리
const FOOD_KEYWORDS = [
  '한식', '중식', '일식', '분식',
  '치킨', '피자', '버거', '카페·디저트'
];

// ====================================================================
// 카카오 로컬 키워드 검색 함수
// ====================================================================
function kakaoSearch(query, lng, lat, radius, page = 1) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      query,
      x: lng.toString(),
      y: lat.toString(),
      radius: radius.toString(),
      sort: 'distance',
      size: '15',
      page: page.toString()
    });

    const options = {
      hostname: 'dapi.kakao.com',
      path: `/v2/local/search/keyword.json?${qs}`,
      method: 'GET',
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` }
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${json.message || raw}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`파싱 오류: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 딜레이 헬퍼
const delay = ms => new Promise(r => setTimeout(r, ms));

// ====================================================================
// 메인 실행
// ====================================================================
async function main() {
  // ── REST API 키 검증 ──────────────────────────────────────────────
  if (!KAKAO_REST_API_KEY || KAKAO_REST_API_KEY === 'YOUR_REST_API_KEY_HERE') {
    console.error('\n❌ REST API 키가 설정되지 않았습니다!');
    console.error('   이 파일(fetch_restaurants.js) 상단의');
    console.error('   KAKAO_REST_API_KEY 변수에 REST API 키를 입력하세요.');
    console.error('\n   📍 REST API 키 확인 방법:');
    console.error('   1. https://developers.kakao.com 접속');
    console.error('   2. 내 애플리케이션 → 앱 선택');
    console.error('   3. 앱 키 탭 → "REST API 키" 복사');
    process.exit(1);
  }

  console.log('================================================');
  console.log('  부산 주례·냉정 음식점 데이터 수집 시작');
  console.log('================================================\n');

  const collected = [];
  const seenIds = new Set();

  for (const area of SEARCH_AREAS) {
    console.log(`\n📍 ${area.name} (반경 ${area.radius}m) 검색 중...`);
    console.log('─'.repeat(40));

    for (const kw of FOOD_KEYWORDS) {
      const query = `${kw}`;
      let found = 0;

      try {
        const res = await kakaoSearch(query, area.lng, area.lat, area.radius);
        const docs = res.documents || [];

        for (const doc of docs) {
          if (seenIds.has(doc.id)) continue;
          seenIds.add(doc.id);

          collected.push({
            area: area.name,
            category: kw,
            name: doc.place_name,
            address: doc.road_address_name || doc.address_name || '-',
            phone: doc.phone || '정보없음',
            distance: doc.distance ? `${doc.distance}m` : '-',
            lat: doc.y,
            lng: doc.x,
            url: doc.place_url || '-'
          });
          found++;
        }

        console.log(`  [${kw.padEnd(8)}] ${found}개 수집`);
      } catch (err) {
        console.error(`  [${kw.padEnd(8)}] 오류 - ${err.message}`);
      }

      await delay(120); // API 호출 간격
    }
  }

  // ── 결과 정리 ─────────────────────────────────────────────────────
  console.log(`\n================================================`);
  console.log(`  총 ${collected.length}개 음식점 수집 완료`);
  console.log(`================================================\n`);

  // ── txt 파일 생성 ─────────────────────────────────────────────────
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  let txt = '';

  txt += '╔══════════════════════════════════════════════════════════════╗\n';
  txt += '║       부산 주례 · 냉정 음식점 리스트 (카카오 API 수집)          ║\n';
  txt += `║  생성: ${now.padEnd(52)}║\n`;
  txt += `║  총  : ${String(collected.length + '개').padEnd(52)}║\n`;
  txt += '╚══════════════════════════════════════════════════════════════╝\n';

  for (const areaName of ['부산 주례', '부산 냉정']) {
    const items = collected.filter(r => r.area === areaName);
    txt += `\n\n${'▶'.repeat(1)} ${areaName}  (${items.length}개)\n`;
    txt += '━'.repeat(65) + '\n';

    const cats = [...new Set(items.map(r => r.category))];
    for (const cat of cats) {
      const list = items.filter(r => r.category === cat);
      txt += `\n  ◆ ${cat} (${list.length}개)\n`;
      txt += '  ' + '─'.repeat(60) + '\n';

      list.forEach((r, i) => {
        txt += `  ${String(i + 1).padStart(2)}. ${r.name}\n`;
        txt += `      주소: ${r.address}\n`;
        txt += `      전화: ${r.phone}\n`;
        txt += `      거리: ${r.distance}\n`;
        txt += `      링크: ${r.url}\n`;
        txt += `      좌표: ${r.lat}, ${r.lng}\n\n`;
      });
    }
  }

  txt += '\n\n' + '='.repeat(65) + '\n';
  txt += '  ※ 본 데이터는 카카오 로컬 REST API를 통해 수집된 정보입니다.\n';
  txt += '  ※ 영업 시간, 정보 변경 여부는 카카오맵에서 확인하세요.\n';
  txt += '='.repeat(65) + '\n';

  const outPath = path.join(
    __dirname,
    `restaurant_주례_냉정_${new Date().toISOString().slice(0, 10)}.txt`
  );
  fs.writeFileSync(outPath, txt, 'utf8');

  console.log(`✅ 파일 저장 완료!`);
  console.log(`📄 ${outPath}\n`);
}

main().catch(err => {
  console.error('\n❌ 실행 오류:', err.message);
});
