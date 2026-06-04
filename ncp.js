/**
 * 맛집 탐색기 NCP 버전 — 4대 API 활용
 * ─────────────────────────────────────
 * 1. Dynamic Map  : 인터랙티브 지도 (SDK v3)
 * 2. Static Map   : 음식점 카드 미니맵 이미지
 * 3. Geocoding    : 주소 → 좌표 변환 (주소 검색)
 * 4. Reverse Geo  : 좌표 → 주소 변환
 * ─────────────────────────────────────
 * + 블로그 리뷰 버튼 (네이버 블로그 검색 연결)
 * + 무한로딩 방지 (15초 안전 타이머 + AbortController)
 * + SDK 없을 경우 Leaflet(OSM) 자동 폴백
 * + Overpass API(OSM) 로 주변 음식점 실데이터 검색
 */

// ============================================================
// 상태 관리
// ============================================================
const state = {
  currentCoords: { lat: 35.1457, lng: 129.0072 },
  lastSearchCoords: { lat: 0, lng: 0 },
  searchRadius: 750,
  selectedCategories: new Set(),
  restaurants: [],
  activeFilter: 'all',
  currentSort: 'distance',
  mapType: 'naver',   // 'naver' | 'leaflet'
  map: null,
  userMarker: null,
  radiusCircle: null,
  restaurantMarkers: [],
  openInfoWindow: null,
  currentAddress: '',
  loadingSafetyTimer: null  // 무한로딩 방지 타이머
};

// ============================================================
// 카테고리 메타데이터
// ============================================================
const CATEGORIES = {
  '한식': { emoji: '🇰🇷', color: '#ef4444', icon: 'fa-bowl-rice' },
  '중식': { emoji: '🇨🇳', color: '#f59e0b', icon: 'fa-bowl-food' },
  '일식': { emoji: '🇯🇵', color: '#10b981', icon: 'fa-fish' },
  '분식': { emoji: '🍢', color: '#ec4899', icon: 'fa-hotdog' },
  '치킨': { emoji: '🍗', color: '#f97316', icon: 'fa-drumstick-bite' },
  '피자': { emoji: '🍕', color: '#eab308', icon: 'fa-pizza-slice' },
  '햄버거': { emoji: '🍔', color: '#3b82f6', icon: 'fa-hamburger' }
};

// ============================================================
// 더미 데이터 (OSM 결과 부족 시 보강)
// ============================================================
const MOCK_NAMES = {
  '한식': ['부산깡통시장 돼지국밥', '동래 할매파전', '기장 미역 칼국수', '남포동 밀면', '서면 돼지갈비', '해운대 어묵', '광안리 회덮밥', '부산진 설렁탕', '사상 쌈밥', '주례 된장찌개'],
  '중식': ['부산 짜장면', '사상구 짬뽕', '동서대 앞 중화요리', '경화루 부산점', '홍콩반점 서면점', '차이나타운 딤섬', '사상 마라탕', '양꼬치 서면', '딩딤 부산', '취영루 부산'],
  '일식': ['부산 초밥', '해운대 라멘', '광안리 우동', '동서대 돈까스', '사상 일식', '서면 스시', '남포 이자카야', '부산 텐동', '기장 회', '해운대 오마카세'],
  '분식': ['사상 떡볶이', '주례 김밥', '동서대 분식', '엽기떡볶이 서면', '죠스떡볶이 사상', '꼬마김밥 부산', '순대국 사상', '만두 부산', '청년다방 사상', '신전떡볶이 부산'],
  '치킨': ['교촌치킨 사상점', 'BBQ 주례점', 'bhc 서면점', '굽네치킨 부산', '네네치킨 사상', '페리카나 부산', '처갓집 사상', '호치킨 부산', '자담치킨 서면', '푸라닭 부산'],
  '피자': ['도미노 사상점', '피자헛 서면', '미스터피자 부산', '파파존스 부산', '피자스쿨 사상', '피자마루 부산', '부산 화덕피자', '피자알볼로 서면', '59쌀피자 부산', '잭슨피자 부산'],
  '햄버거': ['맥도날드 사상점', '버거킹 서면점', '롯데리아 부산', '맘스터치 사상', 'KFC 서면', '쉑쉑버거 부산', '노브랜드버거 부산', '바스버거 서면', '다운타우너 부산', '프랭크버거 사상']
};

// ============================================================
// DOM 참조
// ============================================================
const DOM = {
  ncpKeyId:               document.getElementById('ncp-key-id'),
  ncpKey:                 document.getElementById('ncp-key'),
  useProxy:               document.getElementById('use-proxy'),
  ncpUsageCount:          document.getElementById('ncp-usage-count'),
  ncpUsageBar:            document.getElementById('ncp-usage-bar'),
  ncpUsageCost:           document.getElementById('ncp-usage-cost'),
  btnGetLocation:         document.getElementById('btn-get-location'),
  geoStatusText:          document.getElementById('geo-status-text'),
  coordsDisplay:          document.getElementById('coords-display'),
  valLat:                 document.getElementById('val-lat'),
  valLng:                 document.getElementById('val-lng'),
  inputRadius:            document.getElementById('input-radius'),
  rangeValueDisplay:      document.getElementById('range-value-display'),
  categoryChips:          document.querySelectorAll('.category-chip'),
  countNum:               document.getElementById('count-num'),
  activeCategoryFilters:  document.getElementById('active-category-filters'),
  sortBtns:               document.querySelectorAll('.sort-btn'),
  listEmptyState:         document.getElementById('list-empty-state'),
  listLoadingState:       document.getElementById('list-loading-state'),
  restaurantCardsFeed:    document.getElementById('restaurant-cards-feed'),
  // 새로 추가된 DOM
  inputAddress:           document.getElementById('input-address'),
  btnSearchAddress:       document.getElementById('btn-search-address')
};

// ============================================================
// 앱 초기화
// ============================================================
// SDK 서브모듈(geocoder) 로드 상태 추적
let sdkServiceReady = false;

// NAVER 지도 SDK 인증 실패 핸들러
window.navermap_authFailure = function() {
  console.error('❌ NAVER 지도 API 인증 실패! Leaflet 폴백을 활성화합니다.');
  showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; <strong>NCP 인증 실패</strong><br>OpenStreetMap 모드로 자동 전환합니다.', 'error', 5000);
  
  // 기존 지도 정리
  if (state.map) {
    try {
      if (state.mapType === 'leaflet') state.map.remove();
    } catch (e) { /* ignore */ }
    state.map = null;
    state.restaurantMarkers = [];
    state.openInfoWindow = null;
  }
  document.getElementById('map').innerHTML = '';
  
  // Leaflet 지도로 전환 및 초기화
  initLeafletMap();
  
  // 현재 위치 기준 음식점 탐색
  fetchNearbyRestaurants();
};

// Nominatim (OpenStreetMap) Geocoding / Reverse Geocoding 폴백
async function fetchGeocodeNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&accept-language=ko`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NearbyRestaurantsApp/1.0'
      }
    });
    if (!res.ok) throw new Error('Nominatim Geocoding API Error');
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        roadAddress: data[0].display_name
      };
    }
    return null;
  } catch (e) {
    console.error('[Nominatim Geocoding 실패]', e);
    return null;
  }
}

async function fetchReverseGeocodeNominatim(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'NearbyRestaurantsApp/1.0'
      }
    });
    if (!res.ok) throw new Error('Nominatim Reverse Geocoding API Error');
    const data = await res.json();
    if (data && data.address) {
      const addr = data.address;
      const parts = [
        addr.city || addr.province || addr.state,
        addr.borough || addr.municipality || addr.city_district || addr.county,
        addr.suburb || addr.neighbourhood || addr.village || addr.town
      ].filter(Boolean);
      const formatted = parts.join(' ');
      return formatted || data.display_name;
    }
    return null;
  } catch (e) {
    console.error('[Nominatim Reverse Geocoding 실패]', e);
    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('naver-mode');
  loadSavedCredentials();

  // geocoder 서브모듈 비동기 로드 완료 콜백 등록
  if (window.naver && window.naver.maps) {
    if (window.naver.maps.Service) {
      // 이미 로드됨
      sdkServiceReady = true;
      console.log('✅ NAVER Maps Service(geocoder) 이미 로드됨');
    }
    // 서브모듈 로드 완료 콜백
    naver.maps.onJSContentLoaded = function() {
      sdkServiceReady = true;
      console.log('✅ NAVER Maps Service(geocoder) 서브모듈 로드 완료');
    };
  }

  initMap();
  setupEventListeners();
  renderNcpUsageUI();
  state.selectedCategories.add('한식');
  updateCategoryChipsUI();
});

// ============================================================
// 인증 정보 로드
// ============================================================
function loadSavedCredentials() {
  const savedId  = localStorage.getItem('ncp_api_key_id');
  const savedKey = localStorage.getItem('ncp_api_key_secret');
  if (savedId)  DOM.ncpKeyId.value = savedId;
  if (savedKey) DOM.ncpKey.value   = savedKey;
  // HTML 기본값을 localStorage에 초기 저장
  if (!savedId  && DOM.ncpKeyId.value) localStorage.setItem('ncp_api_key_id',     DOM.ncpKeyId.value);
  if (!savedKey && DOM.ncpKey.value)   localStorage.setItem('ncp_api_key_secret', DOM.ncpKey.value);
}

// ============================================================
// [API 1] Dynamic Map 초기화 — SDK 우선, 폴백 Leaflet
// ============================================================
function initMap() {
  // 기존 지도 정리
  if (state.map) {
    try {
      if (state.mapType === 'leaflet') state.map.remove();
      else document.getElementById('map').innerHTML = '';
    } catch (e) { /* ignore */ }
    state.map = null;
    state.restaurantMarkers = [];
    state.openInfoWindow = null;
  }

  if (window.naver && window.naver.maps) {
    try {
      initNaverMap();
    } catch (e) {
      console.error('❌ NAVER Map 초기화 실패, Leaflet 폴백:', e);
      document.getElementById('map').innerHTML = '';
      initLeafletMap();
    }
  } else {
    console.warn('NAVER SDK 미로드 → Leaflet 폴백');
    initLeafletMap();
  }
}

function initNaverMap() {
  state.mapType = 'naver';
  const center = new naver.maps.LatLng(state.currentCoords.lat, state.currentCoords.lng);

  state.map = new naver.maps.Map('map', {
    center,
    zoom: 15,
    mapTypeControl: true
  });

  state.userMarker = new naver.maps.Marker({
    position: center,
    map: state.map,
    draggable: true,
    icon: {
      content: '<div class="custom-user-marker"><div class="pulse-marker"></div><div class="center-marker"></div></div>',
      anchor: new naver.maps.Point(12, 12)
    }
  });

  naver.maps.Event.addListener(state.userMarker, 'dragend', () => {
    const p = state.userMarker.getPosition();
    updateLocationCoords(p.lat(), p.lng(), false);
  });

  naver.maps.Event.addListener(state.map, 'click', e => {
    updateLocationCoords(e.coord.lat(), e.coord.lng(), false);
  });

  state.radiusCircle = new naver.maps.Circle({
    map: state.map,
    center,
    radius: state.searchRadius,
    fillColor: '#03c75a',
    fillOpacity: 0.06,
    strokeColor: '#03c75a',
    strokeOpacity: 0.7,
    strokeWeight: 1.5,
    strokeStyle: 'dash'
  });

  incrementNcpUsage(1); // Dynamic Map 로드 카운트
  console.log('✅ [API 1] NCP Dynamic Map 로드 완료');
}

function initLeafletMap() {
  state.mapType = 'leaflet';
  state.map = L.map('map', { zoomControl: true, attributionControl: false })
    .setView([state.currentCoords.lat, state.currentCoords.lng], 15);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 })
    .addTo(state.map);

  const icon = L.divIcon({
    className: 'custom-user-marker',
    html: '<div class="pulse-marker"></div><div class="center-marker"></div>',
    iconSize: [24, 24], iconAnchor: [12, 12]
  });

  state.userMarker = L.marker([state.currentCoords.lat, state.currentCoords.lng], { icon, draggable: true })
    .addTo(state.map)
    .bindPopup('<b>기준 위치</b><br>드래그하거나 지도를 클릭하여 변경')
    .openPopup();

  state.userMarker.on('dragend', e => {
    const p = e.target.getLatLng();
    updateLocationCoords(p.lat, p.lng, false);
  });

  state.map.on('click', e => {
    updateLocationCoords(e.latlng.lat, e.latlng.lng, false);
  });

  state.radiusCircle = L.circle([state.currentCoords.lat, state.currentCoords.lng], {
    color: '#03c75a', fillColor: '#03c75a', fillOpacity: 0.08,
    radius: state.searchRadius, weight: 1.5, dashArray: '4,4'
  }).addTo(state.map);
}

// ============================================================
// 이벤트 리스너
// ============================================================
function setupEventListeners() {
  DOM.ncpKeyId.addEventListener('change', () => {
    const v = DOM.ncpKeyId.value.trim();
    if (v) localStorage.setItem('ncp_api_key_id', v);
  });
  DOM.ncpKey.addEventListener('input', () => {
    localStorage.setItem('ncp_api_key_secret', DOM.ncpKey.value.trim());
  });

  DOM.btnGetLocation.addEventListener('click', handleGetLocation);

  // [API 3] Geocoding — 주소 검색
  DOM.btnSearchAddress.addEventListener('click', handleAddressSearch);
  DOM.inputAddress.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddressSearch();
  });

  DOM.inputRadius.addEventListener('input', e => {
    const r = parseInt(e.target.value);
    state.searchRadius = r;
    DOM.rangeValueDisplay.textContent = r >= 1000 ? `${(r/1000).toFixed(1)}km` : `${r}m`;
    if (state.radiusCircle) state.radiusCircle.setRadius(r);
    if (state.mapType === 'naver' && state.radiusCircle) {
      state.radiusCircle.setRadius(r);
    }
  });

  DOM.categoryChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.category;
      if (state.selectedCategories.has(cat)) {
        if (state.selectedCategories.size > 1) state.selectedCategories.delete(cat);
        else { showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 최소 1개 이상 선택하세요.', 'error'); return; }
      } else {
        state.selectedCategories.add(cat);
      }
      updateCategoryChipsUI();
      if (state.lastSearchCoords.lat !== 0) fetchNearbyRestaurants();
    });
  });

  DOM.sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentSort = btn.dataset.sort;
      DOM.sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortAndRender();
    });
  });
}

// ============================================================
// 토스트 알림
// ============================================================
function showToast(html, type = 'default', ms = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}-toast`;
  toast.innerHTML = html;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fadeout');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, ms);
}

// ============================================================
// 카테고리 칩 UI
// ============================================================
function updateCategoryChipsUI() {
  DOM.categoryChips.forEach(chip => {
    chip.classList.toggle('active', state.selectedCategories.has(chip.dataset.category));
  });
}

// ============================================================
// GPS 위치 탐색
// ============================================================
function handleGetLocation() {
  if (state.selectedCategories.size === 0) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 음식 종류를 선택하세요!', 'error');
    return;
  }
  DOM.geoStatusText.className = 'geo-status loading';
  DOM.geoStatusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GPS 신호 가져오는 중...';
  DOM.btnGetLocation.disabled = true;

  if (!navigator.geolocation) { handleGeoError({ code: 0, message: 'unsupported' }); return; }

  navigator.geolocation.getCurrentPosition(
    pos => { updateLocationCoords(pos.coords.latitude, pos.coords.longitude, true); },
    handleGeoError,
    { enableHighAccuracy: false, timeout: 7000, maximumAge: 5000 }
  );
}

function handleGeoError(err) {
  const msgs = { 1: '위치 권한 거부됨', 2: 'GPS 신호 없음', 3: '탐색 시간 초과' };
  const msg = msgs[err.code] || '위치 탐색 실패';
  showToast(`<i class="fa-solid fa-circle-exclamation"></i>&nbsp; ${msg}<br>동서대학교 좌표로 대체합니다.`, 'error', 3500);
  updateLocationCoords(35.1457, 129.0072, false);
}

// ============================================================
// [API 3] Geocoding — 주소 → 좌표 변환 (주소 검색)
// ============================================================

// Service 모듈 로드 대기 헬퍼 (최대 3초)
function waitForService(maxWait = 3000) {
  return new Promise(resolve => {
    if (window.naver?.maps?.Service) { resolve(true); return; }
    const start = Date.now();
    const check = setInterval(() => {
      if (window.naver?.maps?.Service) { clearInterval(check); resolve(true); return; }
      if (Date.now() - start > maxWait) { clearInterval(check); resolve(false); return; }
    }, 200);
  });
}

async function handleAddressSearch() {
  const address = DOM.inputAddress.value.trim();
  if (!address) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 주소를 입력해 주세요.', 'error');
    return;
  }

  if (state.selectedCategories.size === 0) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 음식 종류를 먼저 선택하세요!', 'error');
    return;
  }

  DOM.geoStatusText.className = 'geo-status loading';
  DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> "${address}" Geocoding 중...`;

  // Service 모듈 로드 대기 (비동기 서브모듈이므로)
  const serviceAvailable = await waitForService(3000);

  if (state.mapType === 'naver' && serviceAvailable && window.naver?.maps?.Service) {
    incrementNcpUsage(1);
    naver.maps.Service.geocode({ query: address }, async (status, response) => {
      if (status !== naver.maps.Service.Status.OK || !response.v2?.addresses?.length) {
        console.warn(`[API 3] Naver Geocoding 실패, Nominatim 폴백 시도: "${address}"`);
        await tryNominatimGeocode(address);
        return;
      }
      const addr = response.v2.addresses[0];
      const lat = parseFloat(addr.y);
      const lng = parseFloat(addr.x);
      const roadAddr = addr.roadAddress || addr.jibunAddress || address;

      console.log(`✅ [API 3] Geocoding 성공: "${address}" → (${lat}, ${lng})`);
      showToast(`<i class="fa-solid fa-magnifying-glass-location"></i>&nbsp; <strong>Geocoding</strong>: ${roadAddr}`, 'success', 3000);

      updateLocationCoords(lat, lng, false);
    });
  } else {
    // Leaflet 모드이거나 Naver SDK Service가 없을 경우 즉시 Nominatim 사용
    console.log(`[API 3] NAVER SDK 미사용/로딩실패 → Nominatim Geocoding 사용: "${address}"`);
    await tryNominatimGeocode(address);
  }
}

async function tryNominatimGeocode(address) {
  const result = await fetchGeocodeNominatim(address);
  if (result) {
    console.log(`✅ [Nominatim] Geocoding 성공: "${address}" → (${result.lat}, ${result.lng})`);
    showToast(`<i class="fa-solid fa-magnifying-glass-location"></i>&nbsp; <strong>OSM Geocoding</strong>: ${result.roadAddress.split(',')[0]}`, 'success', 3000);
    updateLocationCoords(result.lat, result.lng, false);
  } else {
    DOM.geoStatusText.className = 'geo-status error';
    DOM.geoStatusText.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 주소를 찾을 수 없습니다.';
    showToast(`<i class="fa-solid fa-circle-exclamation"></i>&nbsp; "${address}" 주소를 찾을 수 없습니다.`, 'error');
  }
}

// ============================================================
// 위치 좌표 업데이트 + 지도 동기화
// ============================================================
function updateLocationCoords(lat, lng, isGPS) {
  state.currentCoords = { lat, lng };
  DOM.valLat.textContent = lat.toFixed(5);
  DOM.valLng.textContent = lng.toFixed(5);
  DOM.coordsDisplay.classList.remove('hidden');
  DOM.geoStatusText.className = 'geo-status success';
  DOM.geoStatusText.innerHTML = isGPS
    ? '<i class="fa-solid fa-circle-check"></i> GPS 위치 획득 완료'
    : '<i class="fa-solid fa-map-pin"></i> 기준 위치 설정 완료';
  DOM.btnGetLocation.disabled = false;

  if (state.map) {
    if (state.mapType === 'naver') {
      const ll = new naver.maps.LatLng(lat, lng);
      state.map.setCenter(ll);
      state.userMarker?.setPosition(ll);
      state.radiusCircle?.setCenter(ll);
      state.radiusCircle?.setRadius(state.searchRadius);
    } else {
      state.map.setView([lat, lng], 15);
      state.userMarker?.setLatLng([lat, lng]);
      state.radiusCircle?.setLatLng([lat, lng]);
    }
  }

  fetchNearbyRestaurants();
}

// ============================================================
// [API 4] Reverse Geocoding — 좌표 → 주소 변환
// ============================================================
async function fetchReverseGeocode(lat, lng) {
  // Service 모듈이 아직 로드되지 않았으면 최대 3초 대기
  if (state.mapType === 'naver' && !window.naver?.maps?.Service) {
    await waitForService(3000);
  }

  return new Promise(resolve => {
    // NAVER Maps Service가 있으면 CORS 없이 호출 가능
    if (state.mapType === 'naver' && window.naver?.maps?.Service) {
      try {
        incrementNcpUsage(1);
        naver.maps.Service.reverseGeocode({
          coords: new naver.maps.LatLng(lat, lng),
          orders: [naver.maps.Service.OrderType.ROADADDR, naver.maps.Service.OrderType.ADDR].join(',')
        }, async (status, response) => {
          if (status !== naver.maps.Service.Status.OK) { 
            console.warn('[API 4] Reverse Geocoding 실패, Nominatim 폴백');
            const osmAddr = await fetchReverseGeocodeNominatim(lat, lng);
            resolve(osmAddr || estimateAddress(lat)); 
            return; 
          }
          const r = response.v2?.results?.[0];
          if (!r) { 
            const osmAddr = await fetchReverseGeocodeNominatim(lat, lng);
            resolve(osmAddr || estimateAddress(lat)); 
            return; 
          }
          const reg = r.region;
          const parts = [reg.area1?.name, reg.area2?.name, reg.area3?.name, reg.area4?.name,
                         r.land?.name, r.land?.number1].filter(Boolean);
          const addr = parts.join(' ');
          console.log(`✅ [API 4] Reverse Geocoding: (${lat.toFixed(4)}, ${lng.toFixed(4)}) → "${addr}"`);
          resolve(addr);
        });
      } catch (e) {
        console.warn('[API 4] Reverse Geocoding 예외, Nominatim 폴백:', e);
        fetchReverseGeocodeNominatim(lat, lng).then(osmAddr => {
          resolve(osmAddr || estimateAddress(lat));
        });
      }
    } else {
      // SDK 없으면 Nominatim 사용 및 좌표 기반 추정 주소 폴백
      console.warn('[API 4] Service 미로드, Nominatim Reverse Geocoding 사용');
      fetchReverseGeocodeNominatim(lat, lng).then(osmAddr => {
        resolve(osmAddr || estimateAddress(lat));
      });
    }
  });
}

function estimateAddress(lat) {
  if (lat >= 35.10 && lat <= 35.20) return '부산광역시 사상구 주례동';
  if (lat >= 35.20 && lat <= 35.30) return '부산광역시 북구 화명동';
  if (lat >= 35.05 && lat <= 35.10) return '부산광역시 사하구 괴정동';
  return '부산광역시';
}

// ============================================================
// [API 2] Static Map — 음식점 카드 미니맵 이미지 URL 생성
// ============================================================
function getStaticMapURL(lat, lng, width = 280, height = 140) {
  const keyId = DOM.ncpKeyId.value.trim() || 'qblmax2it4';
  // Static Map API URL 생성 (브라우저 referer 인증을 위해 raster-cors 엔드포인트 사용)
  const url = `https://naveropenapi.apigw.ntruss.com/map-static/v2/raster-cors`
    + `?w=${width}&h=${height}`
    + `&center=${lng},${lat}`
    + `&level=16`
    + `&markers=type:d|size:small|pos:${lng}%20${lat}|color:red`
    + `&X-NCP-APIGW-API-KEY-ID=${keyId}`;
  return url;
}

// ============================================================
// 주변 음식점 탐색 메인 로직
// ============================================================
async function fetchNearbyRestaurants() {
  showLoading(true);
  state.lastSearchCoords = { ...state.currentCoords };

  const { lat, lng } = state.currentCoords;

  // [API 4] 역지오코딩으로 현재 주소 파악
  const addr = await fetchReverseGeocode(lat, lng);
  state.currentAddress = addr || estimateAddress(lat);
  if (addr) {
    const parts = addr.split(' ');
    DOM.geoStatusText.className = 'geo-status success';
    DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span class="api-tag-inline">Reverse Geocoding</span> ${parts.slice(0,3).join(' ')}`;
    showToast(`<i class="fa-solid fa-map-pin"></i>&nbsp; ${parts.slice(0,3).join(' ')} 주변 탐색 중`, 'success', 2000);
  }

  // OSM Overpass API로 실제 음식점 검색
  try {
    const elements = await fetchOverpass(lat, lng, state.searchRadius);
    processOSM(elements);
  } catch (err) {
    console.warn('Overpass 실패, 더미 데이터 사용:', err);
    generateMockData();
  } finally {
    showLoading(false);
  }
}

// ============================================================
// Overpass API (OSM) — 7초 타임아웃
// ============================================================
async function fetchOverpass(lat, lng, radius) {
  const q = `[out:json][timeout:8];(node["amenity"="restaurant"](around:${radius},${lat},${lng});node["amenity"="fast_food"](around:${radius},${lat},${lng});way["amenity"="restaurant"](around:${radius},${lat},${lng}););out center;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error('Overpass error');
    const data = await res.json();
    return data.elements || [];
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ============================================================
// OSM 데이터 처리
// ============================================================
function processOSM(elements) {
  const { lat: uLat, lng: uLng } = state.currentCoords;
  const results = [];

  elements.forEach((item, i) => {
    const name = item.tags?.['name:ko'] || item.tags?.name || '';
    if (!name) return;
    const iLat = item.lat ?? item.center?.lat;
    const iLng = item.lon ?? item.center?.lon;
    if (!iLat || !iLng) return;
    const dist = calcDistance(uLat, uLng, iLat, iLng);
    if (dist > state.searchRadius) return;
    const cat = detectCategory(name, item.tags?.cuisine || '');
    if (!state.selectedCategories.has(cat)) return;

    results.push({
      id: `osm_${i}_${Date.now()}`,
      name, cat, lat: iLat, lng: iLng,
      distance: Math.round(dist),
      rating: +(3.8 + Math.random() * 1.2).toFixed(1),
      reviews: Math.floor(Math.random() * 400) + 8,
      phone: item.tags?.phone || item.tags?.['contact:phone'] || mockPhone(iLat),
      address: item.tags?.['addr:full'] || mockAddress(),
      source: 'osm'
    });
  });

  state.restaurants = results;
  if (state.restaurants.length < 5) appendMock(5 - state.restaurants.length);
  postProcess();
}

function detectCategory(name, cuisine) {
  const n = name, c = cuisine;
  if (/짜장|짬뽕|반점|중식|마라|딤섬|양꼬치/i.test(n) || /chinese/i.test(c)) return '중식';
  if (/스시|초밥|라멘|우동|돈까스|돈카츠|일식/i.test(n) || /japanese|sushi|ramen/i.test(c)) return '일식';
  if (/치킨|닭강정|통닭|호프/i.test(n) || /chicken/i.test(c)) return '치킨';
  if (/피자|pizza/i.test(n) || /pizza|italian/i.test(c)) return '피자';
  if (/버거|맥도날드|버거킹|롯데리아|맘스터치/i.test(n) || /burger/i.test(c)) return '햄버거';
  if (/떡볶이|김밥|순대|만두|분식|어묵|튀김/i.test(n)) return '분식';
  return '한식';
}

function mockAddress() {
  const base = state.currentAddress || '부산광역시 사상구';
  const parts = base.split(' ').slice(0, 3).join(' ');
  return `${parts} ${Math.floor(100 + Math.random() * 800)}번지`;
}

function mockPhone(lat) {
  const prefix = lat < 36 ? '051' : '02';
  return `${prefix}-${Math.floor(100+Math.random()*900)}-${Math.floor(1000+Math.random()*9000)}`;
}

// ============================================================
// 더미 데이터 생성
// ============================================================
function generateMockData() {
  state.restaurants = [];
  const { lat, lng } = state.currentCoords;
  let id = 0;
  state.selectedCategories.forEach(cat => {
    const n = Math.floor(Math.random() * 3) + 4;
    for (let i = 0; i < n; i++) {
      state.restaurants.push(makeMockItem(id++, cat, lat, lng));
    }
  });
  postProcess();
}

function appendMock(count) {
  const { lat, lng } = state.currentCoords;
  const cats = [...state.selectedCategories];
  for (let i = 0; i < count; i++) {
    const cat = cats[i % cats.length];
    state.restaurants.push(makeMockItem(9000 + i, cat, lat, lng));
  }
}

function makeMockItem(id, cat, baseLat, baseLng) {
  const dist = 150 + Math.random() * (state.searchRadius - 200);
  const angle = Math.random() * Math.PI * 2;
  const iLat = baseLat + (dist * Math.cos(angle)) / 111000;
  const iLng = baseLng + (dist * Math.sin(angle)) / (111000 * Math.cos(baseLat * Math.PI / 180));
  const names = MOCK_NAMES[cat];
  return {
    id: `mock_${id}_${Date.now()}`,
    name: names[Math.floor(Math.random() * names.length)],
    cat, lat: iLat, lng: iLng,
    distance: Math.round(dist),
    rating: +(3.8 + Math.random() * 1.2).toFixed(1),
    reviews: Math.floor(Math.random() * 200) + 5,
    phone: mockPhone(iLat),
    address: mockAddress(),
    source: 'mock'
  };
}

// ============================================================
// 후처리: 필터 칩 + 정렬 + 렌더
// ============================================================
function postProcess() {
  DOM.countNum.textContent = state.restaurants.length;
  DOM.activeCategoryFilters.innerHTML = '';

  if (state.restaurants.length > 0) {
    const allBtn = mkFilterPill(`전체 (${state.restaurants.length})`, 'all');
    DOM.activeCategoryFilters.appendChild(allBtn);
    state.selectedCategories.forEach(cat => {
      const cnt = state.restaurants.filter(r => r.cat === cat).length;
      const btn = mkFilterPill(`${CATEGORIES[cat].emoji} ${cat} (${cnt})`, cat);
      DOM.activeCategoryFilters.appendChild(btn);
    });
    updateFilterPillsUI();
  }

  if (!state.selectedCategories.has(state.activeFilter)) state.activeFilter = 'all';
  sortAndRender();
}

function mkFilterPill(label, val) {
  const btn = document.createElement('button');
  btn.className = 'active-filter-pill';
  btn.textContent = label;
  btn.addEventListener('click', () => { state.activeFilter = val; updateFilterPillsUI(); renderCards(); updateMarkers(); });
  return btn;
}

function updateFilterPillsUI() {
  DOM.activeCategoryFilters.querySelectorAll('.active-filter-pill').forEach((pill, i) => {
    const isAll = state.activeFilter === 'all';
    if (i === 0) pill.classList.toggle('active', isAll);
    else pill.classList.toggle('active', !isAll && pill.textContent.includes(state.activeFilter));
  });
}

function sortAndRender() {
  if (state.currentSort === 'distance') state.restaurants.sort((a, b) => a.distance - b.distance);
  else state.restaurants.sort((a, b) => b.rating - a.rating);
  renderCards();
  updateMarkers();
}

// ============================================================
// 카드 렌더링 — Static Map 미니맵 + 블로그 리뷰 버튼
// ============================================================
function renderCards() {
  DOM.restaurantCardsFeed.innerHTML = '';
  const list = state.activeFilter === 'all'
    ? state.restaurants
    : state.restaurants.filter(r => r.cat === state.activeFilter);

  if (list.length === 0) {
    DOM.restaurantCardsFeed.classList.add('hidden');
    DOM.listEmptyState.classList.remove('hidden');
    DOM.listEmptyState.querySelector('h3').textContent = '해당 음식점 없음';
    DOM.listEmptyState.querySelector('p').textContent = '반경을 넓히거나 카테고리를 추가해 보세요.';
    return;
  }

  DOM.listEmptyState.classList.add('hidden');
  DOM.restaurantCardsFeed.classList.remove('hidden');

  // Static Map 사용량 카운트 (전체 카드 수 만큼)
  incrementNcpUsage(list.length);

  list.forEach(r => {
    const meta = CATEGORIES[r.cat];
    // [API 2] Static Map 이미지 URL
    const staticMapUrl = getStaticMapURL(r.lat, r.lng);
    // 블로그 검색 URL
    const regionName = (state.currentAddress || '부산').split(' ').slice(0, 2).join(' ');
    const blogSearchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(r.name + ' ' + regionName + ' 맛집')}`;

    const card = document.createElement('div');
    card.className = 'restaurant-card';
    card.dataset.id = r.id;
    card.innerHTML = `
      <div class="card-static-map">
        <img src="${staticMapUrl}" 
             alt="${r.name} 위치" 
             class="static-map-img" 
             loading="lazy"
             onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'static-map-fallback\\'><i class=\\'fa-solid fa-map\\'></i><span>Static Map</span></div>';">
        <span class="static-map-label"><i class="fa-solid fa-image"></i> Static Map API</span>
      </div>
      <div class="card-body">
        <div class="card-header-row">
          <span class="card-category-badge">${meta.emoji} ${r.cat}${r.source==='mock'?'<small style="opacity:.4;font-size:.6rem"> 추천</small>':''}</span>
          <span class="card-distance"><i class="fa-solid fa-person-walking"></i> ${r.distance}m</span>
        </div>
        <h3 class="restaurant-name">${r.name}</h3>
        <div class="card-address"><i class="fa-solid fa-location-dot" style="opacity:.6;font-size:.75rem"></i> ${r.address}</div>
        <div class="card-stats">
          <span class="card-rating"><i class="fa-solid fa-star"></i> ${r.rating.toFixed(1)}</span>
          <span class="card-reviews"><i class="fa-solid fa-comment-dots"></i> 리뷰 ${r.reviews}</span>
        </div>
        <div class="card-actions">
          <button class="card-btn action-primary btn-call" data-phone="${r.phone}">
            <i class="fa-solid fa-phone"></i> 전화
          </button>
          <button class="card-btn btn-find-way" data-lat="${r.lat}" data-lng="${r.lng}" data-name="${encodeURIComponent(r.name)}">
            <i class="fa-solid fa-map-location-dot"></i> 길찾기
          </button>
          <button class="card-btn btn-blog" data-url="${blogSearchUrl}">
            <i class="fa-solid fa-blog"></i> 블로그
          </button>
        </div>
      </div>`;

    card.addEventListener('click', e => { if (!e.target.closest('.card-btn')) focusMarker(r); });
    card.querySelector('.btn-call').addEventListener('click', e => {
      e.stopPropagation();
      const ph = e.currentTarget.dataset.phone;
      if (ph) window.location.href = `tel:${ph.replace(/-/g,'')}`;
      else showToast('전화번호 정보 없음', 'error');
    });
    card.querySelector('.btn-find-way').addEventListener('click', e => {
      e.stopPropagation();
      const { lat: rLat, lng: rLng, name } = e.currentTarget.dataset;
      window.open(`https://map.naver.com/v5/directions/-/${rLng},${rLat},${name},,/walk`, '_blank');
    });
    card.querySelector('.btn-blog').addEventListener('click', e => {
      e.stopPropagation();
      const url = e.currentTarget.dataset.url;
      window.open(url, '_blank');
      showToast('<i class="fa-solid fa-blog"></i>&nbsp; 네이버 블로그 검색 결과를 엽니다', 'success', 2000);
    });

    DOM.restaurantCardsFeed.appendChild(card);
  });
}

// ============================================================
// 지도 마커 렌더링
// ============================================================
function updateMarkers() {
  // 기존 마커 제거
  if (state.mapType === 'naver') {
    state.restaurantMarkers.forEach(m => m.setMap(null));
  } else {
    state.restaurantMarkers.forEach(m => state.map.removeLayer(m));
  }
  state.restaurantMarkers = [];

  const list = state.activeFilter === 'all'
    ? state.restaurants
    : state.restaurants.filter(r => r.cat === state.activeFilter);

  list.forEach(r => {
    const meta = CATEGORIES[r.cat];
    if (state.mapType === 'naver') {
      addNaverMarker(r, meta);
    } else {
      addLeafletMarker(r, meta);
    }
  });
}

function addNaverMarker(r, meta) {
  const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(r.lat, r.lng),
    map: state.map,
    icon: {
      content: `<div class="custom-restaurant-marker"><div class="restaurant-pin" style="background:${meta.color}"><i class="fa-solid ${meta.icon}"></i></div></div>`,
      anchor: new naver.maps.Point(16, 32)
    }
  });

  const iw = new naver.maps.InfoWindow({
    content: `<div style="padding:10px;background:rgba(15,23,42,.97);border:1px solid ${meta.color};border-radius:8px;color:#fff;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.6)">
      <strong style="font-size:.95rem">${r.name}</strong><br>
      <span style="color:${meta.color};font-size:.8rem">${meta.emoji} ${r.cat}</span>
      <span style="color:#94a3b8;font-size:.8rem"> · ${r.distance}m</span><br>
      <span style="color:#94a3b8;font-size:.75rem">${r.address}</span><br>
      <span style="color:#fbbf24;font-size:.85rem;font-weight:700">★ ${r.rating.toFixed(1)}</span>
      <span style="color:#94a3b8;font-size:.75rem"> (리뷰 ${r.reviews})</span>
    </div>`,
    borderWidth: 0, disableAnchor: true, backgroundColor: 'transparent'
  });

  naver.maps.Event.addListener(marker, 'click', () => {
    if (state.openInfoWindow) state.openInfoWindow.close();
    iw.open(state.map, marker);
    state.openInfoWindow = iw;
    highlightCard(r.id);
  });

  marker._iw = iw;
  marker._r  = r;
  state.restaurantMarkers.push(marker);
}

function addLeafletMarker(r, meta) {
  const icon = L.divIcon({
    className: 'custom-restaurant-marker',
    html: `<div class="restaurant-pin" style="background:${meta.color}"><i class="fa-solid ${meta.icon}"></i></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
  });
  const marker = L.marker([r.lat, r.lng], { icon })
    .addTo(state.map)
    .bindPopup(`<b>${r.name}</b><br><small>${r.cat} · ${r.distance}m</small><br><small>${r.address}</small>`);
  marker.on('click', () => highlightCard(r.id));
  marker._r = r;
  state.restaurantMarkers.push(marker);
}

function focusMarker(r) {
  if (state.mapType === 'naver') {
    state.map.setCenter(new naver.maps.LatLng(r.lat, r.lng));
    state.map.setZoom(17);
    const m = state.restaurantMarkers.find(m => m._r?.id === r.id);
    if (m) {
      if (state.openInfoWindow) state.openInfoWindow.close();
      m._iw.open(state.map, m);
      state.openInfoWindow = m._iw;
    }
  } else {
    state.map.setView([r.lat, r.lng], 17);
    const m = state.restaurantMarkers.find(m => m._r?.id === r.id);
    if (m) m.openPopup();
  }
}

function highlightCard(id) {
  DOM.restaurantCardsFeed.querySelectorAll('.restaurant-card').forEach(c => {
    const on = c.dataset.id === id;
    c.classList.toggle('highlight', on);
    if (on) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else c.classList.remove('highlight');
  });
  setTimeout(() => DOM.restaurantCardsFeed.querySelectorAll('.restaurant-card.highlight').forEach(c => c.classList.remove('highlight')), 2000);
}

// ============================================================
// 로딩 상태 — 15초 안전 타이머로 무한로딩 방지
// ============================================================
function showLoading(on) {
  // 기존 안전 타이머 해제
  if (state.loadingSafetyTimer) {
    clearTimeout(state.loadingSafetyTimer);
    state.loadingSafetyTimer = null;
  }

  if (on) {
    DOM.listEmptyState.classList.add('hidden');
    DOM.restaurantCardsFeed.classList.add('hidden');
    DOM.listLoadingState.classList.remove('hidden');

    // 15초 안전 타이머: 무한로딩 방지
    state.loadingSafetyTimer = setTimeout(() => {
      console.warn('⚠️ 로딩 15초 초과 — 안전 타이머로 강제 해제');
      DOM.listLoadingState.classList.add('hidden');
      DOM.listEmptyState.classList.remove('hidden');
      DOM.listEmptyState.querySelector('h3').textContent = '탐색 시간 초과';
      DOM.listEmptyState.querySelector('p').textContent = '네트워크 상태를 확인하고 다시 시도해 주세요.';
      showToast('<i class="fa-solid fa-clock"></i>&nbsp; 탐색 시간이 초과되었습니다. 다시 시도해 주세요.', 'error', 4000);
      state.loadingSafetyTimer = null;
    }, 15000);
  } else {
    DOM.listLoadingState.classList.add('hidden');
  }
}

// ============================================================
// 거리 계산 (Haversine)
// ============================================================
function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// NCP 사용량 트래킹
// ============================================================
function incrementNcpUsage(n = 1) {
  const today = new Date().toISOString().split('T')[0];
  let u = JSON.parse(localStorage.getItem('ncp_api_usage') || 'null');
  if (!u || u.date !== today) u = { date: today, count: 0 };
  u.count += n;
  localStorage.setItem('ncp_api_usage', JSON.stringify(u));
  renderNcpUsageUI(u.count);
}

function renderNcpUsageUI(count) {
  const today = new Date().toISOString().split('T')[0];
  if (count === undefined) {
    const u = JSON.parse(localStorage.getItem('ncp_api_usage') || 'null');
    count = (u?.date === today) ? u.count : 0;
  }
  if (DOM.ncpUsageCount) DOM.ncpUsageCount.textContent = `${count} 회`;
  if (DOM.ncpUsageBar) {
    const pct = Math.min(100, (count / 300) * 100);
    DOM.ncpUsageBar.style.width = `${pct}%`;
    DOM.ncpUsageBar.style.background = pct > 90 ? '#ef4444' : pct > 60 ? '#f59e0b' : 'var(--naver-green)';
  }
  if (DOM.ncpUsageCost) {
    DOM.ncpUsageCost.textContent = count <= 300
      ? '이번달 예상 비용: 무료'
      : `이번달 예상 비용: 약 ${Math.ceil((count-300)*0.04)}원`;
  }
}
