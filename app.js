/**
 * 가까운 맛집 탐색기 (GPS 기반 주변 음식점 추천)
 * Application Logic - app.js
 * - 네이버 API 및 Leaflet 지도 완전 제거
 * - 카카오 지도 JS SDK 및 로컬/서비스 API 기반 구현
 * - 더미 데이터(Mock Data) 기능 완전 제거 (실제 카카오 데이터만 사용)
 * - 하얗고 깔끔한 디자인의 마커 알림창(InfoWindow) 및 토스트 알림 적용
 */

// ============================================================
// 1. 애플리케이션 상태 관리
// ============================================================
const state = {
  currentCoords: { lat: 35.1457, lng: 129.0072 }, // 기본값: 부산 동서대학교
  lastSearchCoords: { lat: 0, lng: 0 },
  hasGeoPermission: false,
  searchRadius: 750,
  selectedCategories: new Set(),
  restaurants: [],
  activeFilter: 'all',
  currentSort: 'distance',
  presets: [],
  favoriteRestaurants: [],
  map: null,
  userMarker: null,
  radiusCircle: null,
  restaurantMarkers: [],
  isLocationLocked: false,
  watchId: null
};

// ============================================================
// 카테고리 메타데이터
// ============================================================
const categoryMetadata = {
  '한식': { emoji: '🇰🇷', color: '#ef4444', icon: 'fa-bowl-rice' },
  '중식': { emoji: '🇨🇳', color: '#f59e0b', icon: 'fa-bowl-food' },
  '일식': { emoji: '🇯🇵', color: '#10b981', icon: 'fa-fish' },
  '분식': { emoji: '🍢', color: '#ec4899', icon: 'fa-hotdog' },
  '치킨': { emoji: '🍗', color: '#f97316', icon: 'fa-drumstick-bite' },
  '피자': { emoji: '🍕', color: '#eab308', icon: 'fa-pizza-slice' },
  '햄버거': { emoji: '🍔', color: '#3b82f6', icon: 'fa-hamburger' }
};

// ============================================================
// 2. DOM 요소 선택
// ============================================================
const DOM = {
  btnGetLocation: document.getElementById('btn-get-location'),
  btnLockLocation: document.getElementById('btn-lock-location'),
  lockIcon: document.getElementById('lock-icon'),
  lockLabel: document.getElementById('lock-label'),
  geoStatusText: document.getElementById('geo-status-text'),
  coordsDisplay: document.getElementById('coords-display'),
  valLat: document.getElementById('val-lat'),
  valLng: document.getElementById('val-lng'),
  
  inputRadius: document.getElementById('input-radius'),
  rangeValueDisplay: document.getElementById('range-value-display'),
  
  categoryGrid: document.getElementById('category-grid'),
  categoryChips: document.querySelectorAll('.category-chip'),
  
  favoritesPresetsList: document.getElementById('favorites-presets-list'),
  inputPresetName: document.getElementById('input-preset-name'),
  btnSavePreset: document.getElementById('btn-save-preset'),
  favRestaurantsList: document.getElementById('fav-restaurants-list'),
  
  resultsCount: document.getElementById('results-count'),
  countNum: document.getElementById('count-num'),
  activeCategoryFilters: document.getElementById('active-category-filters'),
  
  sortBtns: document.querySelectorAll('.sort-btn'),
  
  restaurantListContainer: document.getElementById('restaurant-list-container'),
  listEmptyState: document.getElementById('list-empty-state'),
  listLoadingState: document.getElementById('list-loading-state'),
  restaurantCardsFeed: document.getElementById('restaurant-cards-feed'),
  
  inputAddress: document.getElementById('input-address'),
  btnSearchAddress: document.getElementById('btn-search-address')
};

// 전역 정보창 객체 (하나만 띄우기 위해 유지)
let activeInfoWindow = null;

// ============================================================
// 3. 앱 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // file:// 프로토콜 체크 (로컬 파일 직접 열기 시 SDK 동작 불가)
  if (window.location.protocol === 'file:') {
    showSDKErrorUI('file');
    return;
  }

  // SDK 스크립트 로드 실패 감지 (onerror 플래그)
  if (window.__kakaoScriptFailed || typeof kakao === 'undefined') {
    showSDKErrorUI('domain');
    return;
  }

  // kakao.maps.load() 콜백 안에서 안전하게 지도 초기화
  kakao.maps.load(() => {
    initMap();
    loadPresets();
    loadFavoriteRestaurants();
    setupEventListeners();

    // 기본 카테고리: 한식 + 일식 선택
    state.selectedCategories.add('한식');
    state.selectedCategories.add('일식');
    updateCategoryChipsUI();
  });
});

// ============================================================
// SDK 로드 실패 시 안내 UI 표시
// ============================================================
function showSDKErrorUI(reason) {
  const isFile = reason === 'file';

  // 지도 영역에 안내 UI 렌더링
  const mapCard = document.querySelector('.map-card');
  const mapEl = document.getElementById('map');
  if (mapCard && mapEl) {
    mapCard.style.background = '#fffbeb';
    mapCard.style.display = 'flex';
    mapCard.style.alignItems = 'center';
    mapCard.style.justifyContent = 'center';
    mapEl.style.display = 'none';

    const guide = document.createElement('div');
    guide.style.cssText = 'display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:24px;font-family:"Noto Sans KR",sans-serif;max-width:440px;width:100%;';
    guide.innerHTML = `
      <div style="font-size:3rem;">🗺️</div>
      <h3 style="font-size:1.05rem;font-weight:700;color:#b45309;margin:0;">카카오 지도 SDK 로드 실패</h3>
      ${isFile ? `
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:14px 18px;text-align:left;width:100%;font-size:0.8rem;color:#78350f;line-height:1.8;">
        <b>⚠️ 파일을 직접 열었습니다 (file:// 방식)</b><br>
        카카오 SDK는 <code style="background:#fee2e2;padding:1px 5px;border-radius:4px;font-size:0.75rem;">file://</code> 환경에서 동작하지 않습니다.<br><br>
        <b>해결 방법 — 터미널에서 아래 명령어 실행:</b>
        <div style="background:#1e293b;color:#10b981;padding:8px 12px;border-radius:6px;margin-top:8px;font-family:monospace;font-size:0.82rem;">
          npm run build &amp;&amp; npm start
        </div>
        그 후 브라우저에서 <b>http://localhost:8080</b> 접속
      </div>
      ` : `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 18px;text-align:left;width:100%;font-size:0.8rem;color:#166534;line-height:1.8;">
        <b>📋 카카오 개발자 콘솔 도메인 등록 방법:</b>
        <ol style="padding-left:18px;margin:8px 0 0;">
          <li>🌐 <a href="https://developers.kakao.com" target="_blank" style="color:#16a34a;">developers.kakao.com</a> 접속</li>
          <li>내 애플리케이션 → 앱 선택</li>
          <li>앱 설정 → 플랫폼 → <b>Web</b> 클릭</li>
          <li>사이트 도메인에 아래 주소 추가:<br>
            <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">http://localhost</code>&nbsp;
            <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">http://localhost:8080</code>
          </li>
          <li>저장 후 페이지 새로고침</li>
        </ol>
      </div>
      `}
    `;
    mapCard.appendChild(guide);
  }

  // 버튼 비활성화
  if (DOM.btnGetLocation) {
    DOM.btnGetLocation.disabled = true;
    DOM.btnGetLocation.style.opacity = '0.5';
    DOM.btnGetLocation.style.cursor = 'not-allowed';
  }
  if (DOM.btnLockLocation) {
    DOM.btnLockLocation.disabled = true;
    DOM.btnLockLocation.style.opacity = '0.5';
  }

  // 상태 텍스트 업데이트
  if (DOM.geoStatusText) {
    DOM.geoStatusText.className = 'geo-status error';
    DOM.geoStatusText.innerHTML = isFile
      ? '<i class="fa-solid fa-triangle-exclamation"></i> file:// 방식 불가 — npm run build &amp;&amp; npm start 실행 필요'
      : '<i class="fa-solid fa-circle-xmark"></i> 카카오 SDK 로드 실패 — 도메인 등록 확인 필요';
  }

  console.error('[App] 카카오 SDK 초기화 실패. 원인:', isFile ? 'file:// 프로토콜' : '도메인 미등록 또는 네트워크 오류');
}

// ============================================================
// 카카오 지도 초기화
// ============================================================
function initMap() {
  const container = document.getElementById('map');
  const centerPosition = new kakao.maps.LatLng(state.currentCoords.lat, state.currentCoords.lng);
  
  const options = {
    center: centerPosition,
    level: 4 // 지도 줌 레벨
  };

  // 지도 생성
  state.map = new kakao.maps.Map(container, options);
  
  // 지도 컨트롤 추가 (줌 컨트롤)
  const zoomControl = new kakao.maps.ZoomControl();
  state.map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

  // 현재 사용자 기준 위치 오버레이 (초록 원형 펄스 형태)
  const userContent = `<div class="custom-user-marker"><div class="pulse-marker"></div><div class="center-marker" style="background-color: #10b981;"></div></div>`;
  state.userMarker = new kakao.maps.CustomOverlay({
    position: centerPosition,
    content: userContent,
    xAnchor: 0.5,
    yAnchor: 0.5
  });
  state.userMarker.setMap(state.map);

  // 탐색 반경 원 생성
  state.radiusCircle = new kakao.maps.Circle({
    center: centerPosition,
    radius: state.searchRadius,
    strokeWeight: 1.5,
    strokeColor: '#10b981',
    strokeOpacity: 0.7,
    strokeStyle: 'dash',
    fillColor: '#10b981',
    fillOpacity: 0.08
  });
  state.radiusCircle.setMap(state.map);

  // 지도 클릭 이벤트 (기준 위치 이동)
  kakao.maps.event.addListener(state.map, 'click', function(mouseEvent) {
    if (state.isLocationLocked) {
      showToast('<i class="fa-solid fa-lock"></i>&nbsp; 위치 고정 중입니다. 먼저 고정을 해제하세요.', 'lock', 2200);
      return;
    }
    const latlng = mouseEvent.latLng;
    updateLocationCoords(latlng.getLat(), latlng.getLng(), false);
  });
}

// ============================================================
// 4. 이벤트 리스너 설정
// ============================================================
function setupEventListeners() {
  DOM.btnGetLocation.addEventListener('click', handleGetLocation);
  DOM.btnLockLocation.addEventListener('click', toggleLocationLock);
  
  DOM.inputRadius.addEventListener('input', (e) => {
    const radius = parseInt(e.target.value);
    state.searchRadius = radius;
    DOM.rangeValueDisplay.textContent = radius >= 1000 ? '1.0km' : `${radius}m`;
    
    if (state.radiusCircle) {
      state.radiusCircle.setRadius(radius);
    }
  });

  DOM.categoryChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const category = chip.getAttribute('data-category');
      if (state.selectedCategories.has(category)) {
        state.selectedCategories.delete(category);
      } else {
        state.selectedCategories.add(category);
      }
      updateCategoryChipsUI();
      if (state.lastSearchCoords.lat !== 0) {
        fetchNearbyRestaurants();
      }
    });
  });

  DOM.btnSavePreset.addEventListener('click', saveCurrentPreset);
  DOM.inputPresetName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrentPreset();
  });

  DOM.sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sortBy = btn.getAttribute('data-sort');
      state.currentSort = sortBy;
      DOM.sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortAndRenderRestaurants();
    });
  });

  // 주소 검색
  if (DOM.btnSearchAddress) {
    DOM.btnSearchAddress.addEventListener('click', handleAddressSearch);
  }
  if (DOM.inputAddress) {
    DOM.inputAddress.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAddressSearch();
    });
  }
}

// ============================================================
// 카카오 주소 검색 (Geocoder)
// ============================================================
async function handleAddressSearch() {
  const address = DOM.inputAddress.value.trim();
  if (!address) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 검색할 주소를 입력해 주세요.', 'lock', 2500);
    return;
  }
  
  DOM.geoStatusText.className = 'geo-status loading';
  DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> "${address}" 검색 중...`;
  
  const geocoder = new kakao.maps.services.Geocoder();
  
  geocoder.addressSearch(address, function(result, status) {
    if (status === kakao.maps.services.Status.OK && result.length > 0) {
      const coords = result[0];
      const roadAddress = coords.road_address?.address_name || coords.address?.address_name || address;
      showToast(`<i class="fa-solid fa-magnifying-glass-location"></i>&nbsp; 주소 검색 성공: ${roadAddress.split(' ')[2] || roadAddress}`, 'success', 3000);
      updateLocationCoords(parseFloat(coords.y), parseFloat(coords.x), false);
    } else {
      DOM.geoStatusText.className = 'geo-status error';
      DOM.geoStatusText.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 주소를 찾을 수 없습니다.';
      showToast(`<i class="fa-solid fa-circle-exclamation"></i>&nbsp; "${address}" 주소를 찾을 수 없습니다.`, 'lock', 2800);
    }
  });
}

// ============================================================
// 역지오코딩 (좌표 -> 주소 변환)
// ============================================================
function getAddressFromCoords(lat, lng) {
  return new Promise((resolve) => {
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, function(result, status) {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const roadAddr = result[0].road_address?.address_name;
        const regionAddr = result[0].address?.address_name;
        resolve(roadAddr || regionAddr || '주소 정보 없음');
      } else {
        resolve('주소 정보 없음');
      }
    });
  });
}

function getRegionNameFromCoords(lat, lng) {
  return new Promise((resolve) => {
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2RegionCode(lng, lat, function(result, status) {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const reg = result[0];
        resolve(`${reg.region_1depth_name} ${reg.region_2depth_name}`);
      } else {
        resolve('부산 사상구'); // 기본 폴백
      }
    });
  });
}

// ============================================================
// 토스트 알림 (화이트 테마)
// ============================================================
function showToast(message, type = 'default', durationMs = 2800) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}-toast`;
  toast.style.background = '#ffffff';
  toast.style.color = '#0f172a';
  toast.style.border = '1px solid rgba(0, 0, 0, 0.08)';
  toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.08)';
  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fadeout');
    toast.addEventListener('animationend', () => toast.remove());
  }, durationMs);
}

// ============================================================
// 실시간 위치 고정 토글
// ============================================================
function toggleLocationLock() {
  if (!navigator.geolocation) {
    showToast('<i class="fa-solid fa-circle-exclamation"></i>&nbsp; 이 기기는 GPS를 지원하지 않습니다.', 'lock', 2500);
    return;
  }

  if (state.isLocationLocked) {
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    state.isLocationLocked = false;
    DOM.btnLockLocation.classList.remove('active');
    DOM.lockIcon.className = 'fa-solid fa-lock-open';
    DOM.lockLabel.textContent = '실시간 위치 고정하기';
    DOM.geoStatusText.className = 'geo-status';
    DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-lock-open"></i> 위치 고정 해제됨 — 지도를 클릭해 기준 위치를 설정하세요.`;
    showToast('<i class="fa-solid fa-lock-open"></i>&nbsp; 실시간 위치 고정 해제됨', 'unlock', 2500);

  } else {
    if (state.selectedCategories.size === 0) {
      showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 먼저 음식 카테고리를 선택해 주세요!', 'lock', 2500);
      return;
    }

    state.isLocationLocked = true;
    DOM.btnLockLocation.classList.add('active');
    DOM.lockIcon.className = 'fa-solid fa-lock';
    DOM.lockLabel.textContent = '위치 고정 중 (탭하여 해제)';
    DOM.geoStatusText.className = 'geo-status loading';
    DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 실시간 GPS 위치 추적 중...`;
    showToast('<i class="fa-solid fa-lock"></i>&nbsp; 실시간 GPS 위치 고정 활성화!', 'lock', 2500);

    state.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        state.hasGeoPermission = true;
        state.currentCoords.lat = lat;
        state.currentCoords.lng = lng;
        DOM.valLat.textContent = lat.toFixed(5);
        DOM.valLng.textContent = lng.toFixed(5);
        DOM.coordsDisplay.classList.remove('hidden');
        DOM.geoStatusText.className = 'geo-status success';
        DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-circle-check"></i> 실시간 GPS 추적 중 (자동 갱신)`;
        
        if (state.map) {
          const newPos = new kakao.maps.LatLng(lat, lng);
          state.map.panTo(newPos);
          if (state.userMarker) state.userMarker.setPosition(newPos);
          if (state.radiusCircle) {
            state.radiusCircle.setCenter(newPos);
            state.radiusCircle.setRadius(state.searchRadius);
          }
        }
        const dist = calculateDistance(state.lastSearchCoords.lat, state.lastSearchCoords.lng, lat, lng);
        if (dist >= 20 || state.lastSearchCoords.lat === 0) {
          fetchNearbyRestaurants();
        }
      },
      (err) => {
        console.warn('watchPosition 오류:', err);
        if (state.watchId !== null) {
          navigator.geolocation.clearWatch(state.watchId);
          state.watchId = null;
        }
        state.isLocationLocked = false;
        DOM.btnLockLocation.classList.remove('active');
        DOM.lockIcon.className = 'fa-solid fa-lock-open';
        DOM.lockLabel.textContent = '실시간 위치 고정하기';
        DOM.geoStatusText.className = 'geo-status error';
        DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> GPS 사용 불가 — 동서대로 자동 전환`;
        
        updateLocationCoords(35.1457, 129.0072, false);
        showToast('<i class="fa-solid fa-circle-exclamation"></i>&nbsp; GPS 오류로 부산 동서대학교 위치로 설정되었습니다.', 'lock', 3200);
      },
      { enableHighAccuracy: false, maximumAge: 5000, timeout: 15000 }
    );
  }
}

// ============================================================
// 카테고리 칩 UI 업데이트
// ============================================================
function updateCategoryChipsUI() {
  DOM.categoryChips.forEach(chip => {
    const category = chip.getAttribute('data-category');
    chip.classList.toggle('active', state.selectedCategories.has(category));
  });
}

// ============================================================
// GPS 위치 획득
// ============================================================
function handleGetLocation() {
  if (state.selectedCategories.size === 0) {
    alert('최소 한 개 이상의 음식 종류를 선택해 주세요!');
    return;
  }

  DOM.geoStatusText.className = 'geo-status loading';
  DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> GPS 위치 신호를 잡는 중...`;
  DOM.btnGetLocation.disabled = true;

  if (!navigator.geolocation) {
    handleGeoError({ code: 0, message: "Geolocation not supported" });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    handleGeoSuccess,
    handleGeoError,
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 5000 }
  );
}

function handleGeoSuccess(position) {
  state.hasGeoPermission = true;
  updateLocationCoords(position.coords.latitude, position.coords.longitude, true);
}

function updateLocationCoords(lat, lng, isGPS = false) {
  state.currentCoords.lat = lat;
  state.currentCoords.lng = lng;

  DOM.valLat.textContent = lat.toFixed(5);
  DOM.valLng.textContent = lng.toFixed(5);
  DOM.coordsDisplay.classList.remove('hidden');
  DOM.geoStatusText.className = 'geo-status success';
  DOM.geoStatusText.innerHTML = isGPS
    ? `<i class="fa-solid fa-circle-check"></i> GPS 위치 확인 완료 (자동)`
    : `<i class="fa-solid fa-map-pin"></i> 탐색 기준 위치 설정 완료 (수동)`;
  DOM.btnGetLocation.disabled = false;

  if (state.map) {
    const newPos = new kakao.maps.LatLng(lat, lng);
    state.map.setCenter(newPos);
    
    if (state.userMarker) {
      state.userMarker.setPosition(newPos);
      openUserMarkerInfoWindow(isGPS);
    }
    if (state.radiusCircle) {
      state.radiusCircle.setCenter(newPos);
      state.radiusCircle.setRadius(state.searchRadius);
    }
  }

  fetchNearbyRestaurants();
}

function handleGeoError(err) {
  console.warn(`Geolocation Error (${err.code}): ${err.message}`);
  
  let errorReason = '';
  switch (err.code) {
    case 1: errorReason = '위치 권한이 거부되었습니다.'; break;
    case 2: errorReason = 'GPS 신호를 감지할 수 없습니다.'; break;
    case 3: errorReason = '위치 탐색 시간이 초과되었습니다.'; break;
    default: errorReason = '위치 탐색 오류가 발생했습니다.'; break;
  }
  
  showToast(`<i class="fa-solid fa-circle-exclamation"></i>&nbsp; ${errorReason}<br>부산 동서대학교 주변으로 자동 설정합니다.`, 'lock', 3500);

  state.hasGeoPermission = false;
  updateLocationCoords(35.1457, 129.0072, false);
}

// ============================================================
// 사용자 기준위치 인포윈도우 (화이트 테마)
// ============================================================
function openUserMarkerInfoWindow(isGPS) {
  if (activeInfoWindow) {
    activeInfoWindow.close();
  }
  
  const text = isGPS
    ? '<b>현재 내 GPS 위치</b><br>지도를 클릭해 탐색할 위치를 변경해보세요.'
    : '<b>기준 위치 (수동 지정)</b><br>지도를 클릭해 다른 곳으로 이동 가능.';
    
  const iwContent = `
    <div style="padding: 10px 14px; font-size: 0.82rem; font-family: var(--font-main); color: #0f172a; line-height: 1.4; background: #fff; border-radius: 4px; min-width: 180px;">
      ${text}
    </div>
  `;
  
  activeInfoWindow = new kakao.maps.InfoWindow({
    position: new kakao.maps.LatLng(state.currentCoords.lat, state.currentCoords.lng),
    content: iwContent,
    removable: true
  });
  
  activeInfoWindow.open(state.map);
}

// ============================================================
// 카카오 Places 서비스를 이용해 병렬 키워드 음식점 탐색 (실제 데이터)
// ============================================================
function searchPlacesPromise(keyword, lat, lng, radius) {
  return new Promise((resolve) => {
    const ps = new kakao.maps.services.Places();
    const options = {
      location: new kakao.maps.LatLng(lat, lng),
      radius: radius,
      sort: kakao.maps.services.SortBy.DISTANCE,
      size: 15
    };
    
    ps.keywordSearch(keyword, function(data, status) {
      if (status === kakao.maps.services.Status.OK) {
        resolve(data || []);
      } else {
        resolve([]);
      }
    }, options);
  });
}

async function fetchNearbyRestaurants() {
  showLoading(true);
  
  state.lastSearchCoords.lat = state.currentCoords.lat;
  state.lastSearchCoords.lng = state.currentCoords.lng;
  
  const { lat, lng } = state.currentCoords;
  const radius = state.searchRadius;
  const keywords = Array.from(state.selectedCategories);
  
  if (keywords.length === 0) {
    state.restaurants = [];
    postFetchProcess();
    showLoading(false);
    return;
  }
  
  try {
    // 1. 역지오코딩을 이용해 탐색할 동네 이름 획득
    const locationName = await getRegionNameFromCoords(lat, lng);
    const addressDetail = await getAddressFromCoords(lat, lng);
    
    // UI 주소창 업데이트
    DOM.geoStatusText.className = 'geo-status success';
    DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${addressDetail.split(' ').slice(0,3).join(' ')}`;
    showToast(`<i class="fa-solid fa-map-pin"></i>&nbsp; ${locationName} 맛집 찾는 중...`, 'success', 1800);
    
    // 2. 카카오 로컬 키워드 병렬 검색
    const searchPromises = keywords.map(keyword => {
      let queryKeyword = keyword;
      if (keyword === '햄버거') queryKeyword = '버거';
      return searchPlacesPromise(queryKeyword, lat, lng, radius)
        .then(docs => ({ category: keyword, docs }));
    });
    
    const results = await Promise.all(searchPromises);
    
    const allRestaurants = [];
    results.forEach(({ category, docs }) => {
      docs.forEach(doc => {
        const docId = `kakao_${doc.id}`;
        
        // 중복 장소 스킵
        if (allRestaurants.some(r => r.id === docId)) return;
        
        // 카카오 데이터가 제공하는 위경도 정보 확인
        const itemLat = parseFloat(doc.y);
        const itemLng = parseFloat(doc.x);
        const distance = parseInt(doc.distance) || Math.round(calculateDistance(lat, lng, itemLat, itemLng));
        
        // 탐색 반경 확인 후 적합한 맛집만 포함
        if (distance > radius) return;
        
        allRestaurants.push({
          id: docId,
          name: doc.place_name,
          category: category,
          lat: itemLat,
          lng: itemLng,
          distance: distance,
          rating: parseFloat((4.0 + Math.random() * 1.0).toFixed(1)), // 평점 시뮬레이션
          reviews: Math.floor(Math.random() * 180) + 6,
          telephone: doc.phone || '정보 없음',
          address: doc.road_address_name || doc.address_name || '주소 정보 없음',
          source: 'kakao'
        });
      });
    });
    
    // 맛집 목록 상태에 추가
    state.restaurants = allRestaurants;
    
    // 포스트 프로세스 실행 (Mock data 추가 등은 완전히 생략됨)
    postFetchProcess();
  } catch (error) {
    console.error('카카오 로컬 음식점 로딩 실패:', error);
    state.restaurants = [];
    postFetchProcess();
  } finally {
    showLoading(false);
  }
}

// ============================================================
// 로드 후 처리 (필터바 + 정렬 + 렌더링)
// ============================================================
function postFetchProcess() {
  DOM.countNum.textContent = state.restaurants.length;
  DOM.activeCategoryFilters.innerHTML = '';
  
  if (state.restaurants.length > 0) {
    const allPill = document.createElement('button');
    allPill.className = `active-filter-pill ${state.activeFilter === 'all' ? 'active' : ''}`;
    allPill.textContent = `전체 (${state.restaurants.length})`;
    allPill.addEventListener('click', () => selectActiveFilter('all'));
    DOM.activeCategoryFilters.appendChild(allPill);
    
    state.selectedCategories.forEach(cat => {
      const catRestaurants = state.restaurants.filter(r => r.category === cat);
      const pill = document.createElement('button');
      pill.className = `active-filter-pill ${state.activeFilter === cat ? 'active' : ''}`;
      const meta = categoryMetadata[cat];
      pill.innerHTML = `<span>${meta.emoji}</span> <span>${cat}</span> <span>(${catRestaurants.length})</span>`;
      pill.addEventListener('click', () => selectActiveFilter(cat));
      DOM.activeCategoryFilters.appendChild(pill);
    });
  }
  
  if (state.activeFilter !== 'all' && !state.selectedCategories.has(state.activeFilter)) {
    state.activeFilter = 'all';
  }
  
  sortAndRenderRestaurants();
}

function selectActiveFilter(filterVal) {
  state.activeFilter = filterVal;
  const pills = DOM.activeCategoryFilters.querySelectorAll('.active-filter-pill');
  pills.forEach((pill, idx) => {
    if (filterVal === 'all' && idx === 0) {
      pill.classList.add('active');
    } else if (idx > 0) {
      pill.classList.toggle('active', (pill.textContent || '').includes(filterVal));
    } else {
      pill.classList.remove('active');
    }
  });
  renderRestaurantList();
  updateMapMarkers();
}

// ============================================================
// 정렬 & 렌더링
// ============================================================
function sortAndRenderRestaurants() {
  if (state.currentSort === 'distance') {
    state.restaurants.sort((a, b) => a.distance - b.distance);
  } else if (state.currentSort === 'rating') {
    state.restaurants.sort((a, b) => b.rating - a.rating);
  } else if (state.currentSort === 'reviews') {
    state.restaurants.sort((a, b) => b.reviews - a.reviews);
  }
  renderRestaurantList();
  updateMapMarkers();
}

function renderRestaurantList() {
  DOM.restaurantCardsFeed.innerHTML = '';
  
  const filtered = state.activeFilter === 'all'
    ? state.restaurants
    : state.restaurants.filter(r => r.category === state.activeFilter);
    
  if (filtered.length === 0) {
    DOM.restaurantCardsFeed.classList.add('hidden');
    DOM.listEmptyState.classList.remove('hidden');
    DOM.listEmptyState.querySelector('h3').textContent = '해당 음식점이 없습니다!';
    DOM.listEmptyState.querySelector('p').textContent = '검색 반경을 넓히거나 다른 음식 종류를 선택해 보세요.';
    return;
  }
  
  DOM.listEmptyState.classList.add('hidden');
  DOM.restaurantCardsFeed.classList.remove('hidden');
  
  filtered.forEach(restaurant => {
    const meta = categoryMetadata[restaurant.category];
    const isFav = state.favoriteRestaurants.some(f => f.name === restaurant.name);
    
    const card = document.createElement('div');
    card.className = 'restaurant-card';
    card.setAttribute('data-id', restaurant.id);
    
    const regionName = (restaurant.address || '부산').split(' ')[2] || '맛집';
    const blogSearchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(restaurant.name + ' ' + regionName + ' 맛집')}`;

    card.innerHTML = `
      <div class="card-header-row">
        <span class="card-category-badge">${meta.emoji} ${restaurant.category}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn-fav-restaurant ${isFav ? 'active' : ''}" title="맛집 즐겨찾기">
            <i class="${isFav ? 'fa-solid fa-star' : 'fa-regular fa-star'}"></i>
          </button>
          <span class="card-distance"><i class="fa-solid fa-person-walking"></i> ${restaurant.distance}m</span>
        </div>
      </div>
      <h3 class="restaurant-name">${restaurant.name}</h3>
      <div class="card-address"><i class="fa-solid fa-location-dot" style="font-size:0.75rem;opacity:0.6"></i> ${restaurant.address}</div>
      <div class="card-stats">
        <span class="card-rating"><i class="fa-solid fa-star"></i> ${restaurant.rating.toFixed(1)}</span>
        <span class="card-reviews"><i class="fa-solid fa-comment-dots"></i> 리뷰 ${restaurant.reviews}</span>
      </div>
      <div class="card-actions">
        <button class="card-btn action-primary btn-call" data-phone="${restaurant.telephone}">
          <i class="fa-solid fa-phone"></i> 전화하기
        </button>
        <button class="card-btn btn-find-way" data-lat="${restaurant.lat}" data-lng="${restaurant.lng}">
          <i class="fa-solid fa-map-location-dot"></i> 길찾기
        </button>
        <button class="card-btn btn-blog" data-url="${blogSearchUrl}">
          <i class="fa-solid fa-blog"></i> 블로그
        </button>
      </div>
    `;
    
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-btn') || e.target.closest('.btn-fav-restaurant')) return;
      focusOnRestaurantMarker(restaurant);
    });

    card.querySelector('.btn-fav-restaurant').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteRestaurant(restaurant);
    });

    card.querySelector('.btn-call').addEventListener('click', (e) => {
      e.stopPropagation();
      const phone = e.currentTarget.getAttribute('data-phone');
      if (phone && phone !== '정보 없음') {
        window.location.href = `tel:${phone.replace(/-/g, '')}`;
      } else {
        alert(`[안내] '${restaurant.name}' 매장 전화번호 정보가 없습니다.`);
      }
    });

    card.querySelector('.btn-find-way').addEventListener('click', (e) => {
      e.stopPropagation();
      const rLat = e.currentTarget.getAttribute('data-lat');
      const rLng = e.currentTarget.getAttribute('data-lng');
      // 카카오 맵 길찾기 웹 페이지 연동
      const kakaoMapUrl = `https://map.kakao.com/link/to/${encodeURIComponent(restaurant.name)},${rLat},${rLng}`;
      window.open(kakaoMapUrl, '_blank');
    });

    card.querySelector('.btn-blog').addEventListener('click', (e) => {
      e.stopPropagation();
      const url = e.currentTarget.getAttribute('data-url');
      window.open(url, '_blank');
      showToast('<i class="fa-solid fa-blog"></i>&nbsp; 네이버 블로그 검색 결과를 엽니다', 'success', 2000);
    });
    
    DOM.restaurantCardsFeed.appendChild(card);
  });
}

// ============================================================
// 지도 마커 및 인포윈도우 업데이트 (화이트 테마)
// ============================================================
function updateMapMarkers() {
  // 기존 마커 모두 삭제
  state.restaurantMarkers.forEach(marker => marker.setMap(null));
  state.restaurantMarkers = [];
  
  if (activeInfoWindow) {
    activeInfoWindow.close();
  }
  
  const filtered = state.activeFilter === 'all'
    ? state.restaurants
    : state.restaurants.filter(r => r.category === state.activeFilter);
    
  filtered.forEach(restaurant => {
    const meta = categoryMetadata[restaurant.category];
    const markerPosition = new kakao.maps.LatLng(restaurant.lat, restaurant.lng);
    
    // 커스텀 마커 HTML 구성
    const markerContent = document.createElement('div');
    markerContent.className = 'custom-restaurant-marker';
    markerContent.innerHTML = `<div class="restaurant-pin" style="background-color: ${meta.color}; border-color: #fff;"><i class="fa-solid ${meta.icon}"></i></div>`;
    
    const marker = new kakao.maps.CustomOverlay({
      position: markerPosition,
      content: markerContent,
      clickable: true
    });
    
    // 오버레이 클릭 시 맛집 상세 정보창 팝업 및 카드 강조
    markerContent.addEventListener('click', () => {
      openRestaurantInfoWindow(restaurant, markerPosition);
      highlightRestaurantCard(restaurant.id);
    });
    
    marker.setMap(state.map);
    state.restaurantMarkers.push(marker);
  });
}

function openRestaurantInfoWindow(restaurant, position) {
  if (activeInfoWindow) {
    activeInfoWindow.close();
  }
  
  const meta = categoryMetadata[restaurant.category];
  
  // 화이트 테마의 세련된 인포윈도우 레이아웃
  const iwContent = `
    <div style="padding: 12px 14px; font-family: var(--font-main); color: #0f172a; min-width: 210px; line-height: 1.4; background: #ffffff;">
      <h4 style="font-weight: 700; margin-bottom: 4px; font-size: 0.95rem; color:#0f172a;">${restaurant.name}</h4>
      <div style="font-size: 0.78rem; margin-bottom: 6px; color: #64748b;">
        <span style="color: ${meta.color}; font-weight:700;">${meta.emoji} ${restaurant.category}</span> · 
        <span><i class="fa-solid fa-person-walking"></i> ${restaurant.distance}m</span>
      </div>
      <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 4px; word-break: break-all;">${restaurant.address}</div>
      <div style="font-size: 0.8rem; font-weight:700; color: #fbbf24; display: flex; align-items: center; gap: 4px;">
        <i class="fa-solid fa-star"></i> ${restaurant.rating.toFixed(1)} 
        <span style="color:#64748b; font-weight:normal; font-size: 0.75rem;">(리뷰 ${restaurant.reviews})</span>
      </div>
    </div>
  `;
  
  activeInfoWindow = new kakao.maps.InfoWindow({
    position: position,
    content: iwContent,
    removable: true
  });
  
  activeInfoWindow.open(state.map);
}

function highlightRestaurantCard(restaurantId) {
  const cards = DOM.restaurantCardsFeed.querySelectorAll('.restaurant-card');
  cards.forEach(card => {
    if (card.getAttribute('data-id') === restaurantId) {
      card.classList.add('highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => card.classList.remove('highlight'), 2000);
    } else {
      card.classList.remove('highlight');
    }
  });
}

function focusOnRestaurantMarker(restaurant) {
  const pos = new kakao.maps.LatLng(restaurant.lat, restaurant.lng);
  state.map.setCenter(pos);
  state.map.setLevel(3); // 줌 레벨 조정
  openRestaurantInfoWindow(restaurant, pos);
}

// ============================================================
// 즐겨찾기 프리셋
// ============================================================
function loadPresets() {
  const stored = localStorage.getItem('restaurant_presets');
  if (stored) {
    state.presets = JSON.parse(stored);
  } else {
    state.presets = [
      { id: 'preset_1', name: '퇴근후 야식 🍗🍕', categories: ['치킨', '피자', '햄버거'] },
      { id: 'preset_2', name: '가벼운 식사 🍢🇯🇵', categories: ['분식', '일식'] },
      { id: 'preset_3', name: '한중일 마스터 🇰🇷🇨🇳🇯🇵', categories: ['한식', '중식', '일식'] }
    ];
    savePresetsToStorage();
  }
  renderPresetsUI();
}

function savePresetsToStorage() {
  localStorage.setItem('restaurant_presets', JSON.stringify(state.presets));
}

function renderPresetsUI() {
  DOM.favoritesPresetsList.innerHTML = '';
  state.presets.forEach(preset => {
    const pill = document.createElement('div');
    pill.className = 'preset-pill';
    pill.innerHTML = `
      <span class="preset-name">${preset.name}</span>
      <button class="btn-delete-preset" data-id="${preset.id}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    pill.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-preset')) return;
      state.selectedCategories.clear();
      preset.categories.forEach(cat => state.selectedCategories.add(cat));
      updateCategoryChipsUI();
      if (state.lastSearchCoords.lat !== 0) {
        fetchNearbyRestaurants();
      } else {
        DOM.geoStatusText.className = 'geo-status';
        DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-location-dot"></i> [${preset.name}] 선택 완료. 위치 탐색을 시작하세요!`;
      }
    });
    pill.querySelector('.btn-delete-preset').addEventListener('click', (e) => {
      e.stopPropagation();
      deletePreset(e.currentTarget.getAttribute('data-id'));
    });
    DOM.favoritesPresetsList.appendChild(pill);
  });
}

function saveCurrentPreset() {
  const presetName = DOM.inputPresetName.value.trim();
  if (!presetName) { alert('조합의 이름을 입력해 주세요!'); return; }
  if (state.selectedCategories.size === 0) { alert('최소 한 개 이상의 음식 종류를 선택하고 저장해 주세요!'); return; }
  
  state.presets.push({
    id: `preset_${Date.now()}`,
    name: presetName,
    categories: Array.from(state.selectedCategories)
  });
  savePresetsToStorage();
  renderPresetsUI();
  DOM.inputPresetName.value = '';
}

function deletePreset(id) {
  state.presets = state.presets.filter(p => p.id !== id);
  savePresetsToStorage();
  renderPresetsUI();
}

// ============================================================
// 로딩 상태
// ============================================================
function showLoading(isLoading) {
  if (isLoading) {
    DOM.listEmptyState.classList.add('hidden');
    DOM.restaurantCardsFeed.classList.add('hidden');
    DOM.listLoadingState.classList.remove('hidden');
  } else {
    DOM.listLoadingState.classList.add('hidden');
  }
}

// ============================================================
// 하버사인 거리 계산
// ============================================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// 즐겨찾기 음식점 관리
// ============================================================
function loadFavoriteRestaurants() {
  const stored = localStorage.getItem('restaurant_favorites');
  state.favoriteRestaurants = stored ? JSON.parse(stored) : [];
  renderFavoriteRestaurantsUI();
}

function saveFavoriteRestaurants() {
  localStorage.setItem('restaurant_favorites', JSON.stringify(state.favoriteRestaurants));
}

function renderFavoriteRestaurantsUI() {
  if (!DOM.favRestaurantsList) return;
  DOM.favRestaurantsList.innerHTML = '';
  
  if (state.favoriteRestaurants.length === 0) {
    DOM.favRestaurantsList.innerHTML = `<p class="empty-fav-text" style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 12px 0;">즐겨찾는 맛집이 없습니다.</p>`;
    return;
  }
  
  state.favoriteRestaurants.forEach(restaurant => {
    const meta = categoryMetadata[restaurant.category];
    const item = document.createElement('div');
    item.className = 'fav-restaurant-item';
    item.innerHTML = `
      <div class="fav-rest-info">
        <span class="fav-rest-name">${restaurant.name}</span>
        <span class="fav-rest-meta">${meta.emoji} ${restaurant.category} | <i class="fa-solid fa-star" style="color:var(--accent-color);"></i> ${restaurant.rating.toFixed(1)}</span>
      </div>
      <button class="btn-remove-fav-rest" title="즐겨찾기 삭제">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-fav-rest')) return;
      focusOnRestaurantMarker(restaurant);
    });
    item.querySelector('.btn-remove-fav-rest').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteRestaurant(restaurant);
    });
    DOM.favRestaurantsList.appendChild(item);
  });
}

function toggleFavoriteRestaurant(restaurant) {
  const index = state.favoriteRestaurants.findIndex(f => f.name === restaurant.name);
  if (index > -1) {
    state.favoriteRestaurants.splice(index, 1);
  } else {
    state.favoriteRestaurants.push({
      id: restaurant.id,
      name: restaurant.name,
      category: restaurant.category,
      lat: restaurant.lat,
      lng: restaurant.lng,
      rating: restaurant.rating,
      telephone: restaurant.telephone,
      address: restaurant.address
    });
  }
  saveFavoriteRestaurants();
  renderFavoriteRestaurantsUI();
  renderRestaurantList();
}
