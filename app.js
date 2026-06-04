/**
 * 가까운 맛집 탐색기 (GPS 기반 주변 음식점 추천)
 * Application Logic - app.js
 * - 버전1(시뮬레이션) 완전 제거
 * - 데모 모드 버튼 제거
 * - 네이버 API로 현재 좌표 기반 실제 음식점 검색
 * - GPS 실패 시 기본값: 부산 동서대학교 (35.1457, 129.0072)
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
// 폴백용 가상 음식점 이름 (API 실패 시 사용)
// ============================================================
const mockRestaurantNames = {
  '한식': ['부산깡통시장 돼지국밥', '동래 할매파전', '기장 미역 칼국수', '남포동 밀면', '서면 돼지갈비', '해운대 어묵', '광안리 회덮밥', '부산진 설렁탕', '사상 쌈밥', '주례 된장찌개'],
  '중식': ['부산 짜장면', '사상구 짬뽕', '동서대 앞 중화요리', '경화루 부산점', '홍콩반점 서면점', '차이나타운 딤섬', '사상 마라탕', '양꼬치 서면', '딩딤 부산', '취영루 부산'],
  '일식': ['부산 초밥', '해운대 라멘', '광안리 우동', '동서대 돈까스', '사상 일식', '서면 스시', '남포 이자카야', '부산 텐동', '기장 회', '해운대 오마카세'],
  '분식': ['사상 떡볶이', '주례 김밥', '동서대 분식', '엽기떡볶이 서면', '죠스떡볶이 사상', '꼬마김밥 부산', '순대국 사상', '만두 부산', '청년다방 사상', '신전떡볶이 부산'],
  '치킨': ['교촌치킨 사상점', 'BBQ 주례점', 'bhc 서면점', '굽네치킨 부산', '네네치킨 사상', '페리카나 부산', '처갓집 사상', '호치킨 부산', '자담치킨 서면', '푸라닭 부산'],
  '피자': ['도미노 사상점', '피자헛 서면', '미스터피자 부산', '파파존스 부산', '피자스쿨 사상', '피자마루 부산', '부산 화덕피자', '피자알볼로 서면', '59쌀피자 부산', '잭슨피자 부산'],
  '햄버거': ['맥도날드 사상점', '버거킹 서면점', '롯데리아 부산', '맘스터치 사상', 'KFC 서면', '쉑쉑버거 부산', '노브랜드버거 부산', '바스버거 서면', '다운타우너 부산', '프랭크버거 사상']
};

// ============================================================
// 2. DOM 요소 선택
// ============================================================
const DOM = {
  naverClientId: document.getElementById('naver-client-id'),
  naverClientSecret: document.getElementById('naver-client-secret'),
  
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
  
  btnAdminLogin: document.getElementById('btn-admin-login'),
  adminModal: document.getElementById('admin-modal'),
  btnCloseAdminModal: document.getElementById('btn-close-admin-modal'),
  btnSubmitAdmin: document.getElementById('btn-submit-admin'),
  adminPasswordInput: document.getElementById('admin-password-input'),
  naverSettings: document.getElementById('naver-settings'),
  inputAddress: document.getElementById('input-address'),
  btnSearchAddress: document.getElementById('btn-search-address')
};

// ============================================================
// 3. 앱 초기화
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadPresets();
  loadFavoriteRestaurants();
  setupEventListeners();
  renderNaverUsageUI();
  
  // 관리자 인증 여부 복구
  if (sessionStorage.getItem('isAdminAuthenticated') === 'true') {
    if (DOM.naverSettings) DOM.naverSettings.classList.remove('hidden');
  }
  
  // 기본 카테고리: 한식 + 일식 선택
  state.selectedCategories.add('한식');
  state.selectedCategories.add('일식');
  updateCategoryChipsUI();
});

// ============================================================
// 지도 초기화
// ============================================================
function initMap() {
  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([state.currentCoords.lat, state.currentCoords.lng], 15);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(state.map);

  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `<div class="pulse-marker"></div><div class="center-marker"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  
  state.userMarker = L.marker([state.currentCoords.lat, state.currentCoords.lng], { 
    icon: userIcon,
    draggable: true 
  })
    .addTo(state.map)
    .bindPopup('<b>기준 위치 (드래그 가능)</b><br>핀을 드래그하거나 지도를 클릭해 위치를 변경하세요.')
    .openPopup();

  state.userMarker.on('dragend', function(event) {
    if (state.isLocationLocked) return;
    const pos = event.target.getLatLng();
    updateLocationCoords(pos.lat, pos.lng, false);
  });

  state.map.on('click', function(e) {
    if (state.isLocationLocked) {
      showToast('<i class="fa-solid fa-lock"></i>&nbsp; 위치 고정 중입니다. 먼저 고정을 해제하세요.', 'lock', 2200);
      return;
    }
    updateLocationCoords(e.latlng.lat, e.latlng.lng, false);
  });

  state.radiusCircle = L.circle([state.currentCoords.lat, state.currentCoords.lng], {
    color: '#03c75a',
    fillColor: '#03c75a',
    fillOpacity: 0.08,
    radius: state.searchRadius,
    weight: 1.5,
    dashArray: '4, 4'
  }).addTo(state.map);

  setTimeout(() => state.map.invalidateSize(), 400);
}

// ============================================================
// 4. 이벤트 리스너
// ============================================================
function setupEventListeners() {
  DOM.btnGetLocation.addEventListener('click', handleGetLocation);
  DOM.btnLockLocation.addEventListener('click', toggleLocationLock);
  
  DOM.inputRadius.addEventListener('input', (e) => {
    const radius = parseInt(e.target.value);
    state.searchRadius = radius;
    DOM.rangeValueDisplay.textContent = radius >= 1000 ? '1.0km' : `${radius}m`;
    if (state.radiusCircle) state.radiusCircle.setRadius(radius);
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

  // 관리자 모드 로그인 이벤트
  if (DOM.btnAdminLogin) {
    DOM.btnAdminLogin.addEventListener('click', () => {
      if (DOM.naverSettings.classList.contains('hidden')) {
        DOM.adminModal.classList.remove('hidden');
        DOM.adminPasswordInput.focus();
      } else {
        DOM.naverSettings.classList.add('hidden');
        sessionStorage.removeItem('isAdminAuthenticated');
        showToast('<i class="fa-solid fa-lock"></i>&nbsp; 관리자 설정 창이 숨겨졌습니다.', 'lock', 2200);
      }
    });
  }
  if (DOM.btnCloseAdminModal) {
    DOM.btnCloseAdminModal.addEventListener('click', () => {
      DOM.adminModal.classList.add('hidden');
      DOM.adminPasswordInput.value = '';
    });
  }
  if (DOM.btnSubmitAdmin) {
    DOM.btnSubmitAdmin.addEventListener('click', handleAdminLogin);
  }
  if (DOM.adminPasswordInput) {
    DOM.adminPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });
  }
  
  // 외부 클릭 시 모달 닫기
  window.addEventListener('click', (e) => {
    if (e.target === DOM.adminModal) {
      DOM.adminModal.classList.add('hidden');
      DOM.adminPasswordInput.value = '';
    }
  });

  // 주소 검색 이벤트
  if (DOM.btnSearchAddress) {
    DOM.btnSearchAddress.addEventListener('click', handleAddressSearch);
  }
  if (DOM.inputAddress) {
    DOM.inputAddress.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAddressSearch();
    });
  }
}

function handleAdminLogin() {
  const val = DOM.adminPasswordInput.value.trim();
  if (val === '1111') {
    DOM.naverSettings.classList.remove('hidden');
    DOM.adminModal.classList.add('hidden');
    DOM.adminPasswordInput.value = '';
    showToast('<i class="fa-solid fa-lock-open"></i>&nbsp; 관리자 인증 성공! 네이버 API 설정 활성화.', 'success', 2500);
    sessionStorage.setItem('isAdminAuthenticated', 'true');
  } else {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 비밀번호가 일치하지 않습니다.', 'lock', 2500);
    DOM.adminPasswordInput.value = '';
    DOM.adminPasswordInput.focus();
  }
}

async function handleAddressSearch() {
  const address = DOM.inputAddress.value.trim();
  if (!address) {
    showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 검색할 주소를 입력해 주세요.', 'lock', 2500);
    return;
  }
  
  DOM.geoStatusText.className = 'geo-status loading';
  DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> "${address}" 검색 중...`;
  
  const result = await fetchGeocodeNominatim(address);
  if (result) {
    showToast(`<i class="fa-solid fa-magnifying-glass-location"></i>&nbsp; 주소 검색 성공: ${result.roadAddress.split(',')[0]}`, 'success', 3000);
    updateLocationCoords(result.lat, result.lng, false);
  } else {
    DOM.geoStatusText.className = 'geo-status error';
    DOM.geoStatusText.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 주소를 찾을 수 없습니다.';
    showToast(`<i class="fa-solid fa-circle-exclamation"></i>&nbsp; "${address}" 주소를 찾을 수 없습니다.`, 'lock', 2800);
  }
}

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

// ============================================================
// 토스트 알림
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
    if (state.userMarker) state.userMarker.dragging.enable();
    DOM.geoStatusText.className = 'geo-status';
    DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-lock-open"></i> 위치 고정 해제됨 — 지도를 클릭하거나 핀을 드래그하세요.`;
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
    if (state.userMarker) state.userMarker.dragging.disable();
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
          state.map.setView([lat, lng], 15, { animate: true });
          if (state.userMarker) state.userMarker.setLatLng([lat, lng]);
          if (state.radiusCircle) {
            state.radiusCircle.setLatLng([lat, lng]);
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
        if (state.userMarker) state.userMarker.dragging.enable();
        DOM.geoStatusText.className = 'geo-status error';
        DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> GPS 사용 불가 — 동서대로 자동 전환`;
        state.currentCoords.lat = 35.1457;
        state.currentCoords.lng = 129.0072;
        updateMapToUserCoords();
        fetchNearbyRestaurants();
        showToast('<i class="fa-solid fa-circle-exclamation"></i>&nbsp; GPS 오류로 부산 동서대학교 위치로 자동 전환되었습니다.', 'lock', 3200);
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
    state.map.setView([lat, lng], 15);
    if (state.userMarker) {
      state.userMarker.setLatLng([lat, lng]);
      state.userMarker.bindPopup(isGPS
        ? '<b>현재 내 GPS 위치</b><br>드래그하거나 지도를 클릭하여 변경 가능.'
        : '<b>기준 위치 (수동 지정)</b><br>드래그하거나 다른 곳을 클릭하여 변경 가능.'
      ).openPopup();
    }
    if (state.radiusCircle) {
      state.radiusCircle.setLatLng([lat, lng]);
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
  
  showToast(`<i class="fa-solid fa-circle-exclamation"></i>&nbsp; ${errorReason}<br>부산 동서대학교 주변으로 자동 탐색합니다.`, 'lock', 3500);

  // 기본값: 부산 동서대학교
  state.hasGeoPermission = false;
  state.currentCoords.lat = 35.1457;
  state.currentCoords.lng = 129.0072;
  
  DOM.valLat.textContent = '35.14570';
  DOM.valLng.textContent = '129.00720';
  DOM.coordsDisplay.classList.remove('hidden');
  DOM.geoStatusText.className = 'geo-status error';
  DOM.geoStatusText.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> GPS 사용 불가 (부산 동서대학교 기준)`;
  DOM.btnGetLocation.disabled = false;

  updateMapToUserCoords();
  fetchNearbyRestaurants();
}

function updateMapToUserCoords() {
  const coords = [state.currentCoords.lat, state.currentCoords.lng];
  if (state.map) {
    state.map.setView(coords, 15);
    if (state.userMarker) {
      state.userMarker.setLatLng(coords);
      state.userMarker.bindPopup('<b>현재 탐색 기준 위치</b><br>부산 동서대학교 주변을 탐색합니다.').openPopup();
    }
    if (state.radiusCircle) {
      state.radiusCircle.setLatLng(coords);
      state.radiusCircle.setRadius(state.searchRadius);
    }
  }
}

// ============================================================
// 현재 위치에서 행정구역 이름 가져오기 (좌표 → 지역명)
// Kakao 역지오코딩 API 또는 좌표 기반 지역 추정
// ============================================================
function getLocationName(lat, lng) {
  // 부산광역시 영역: 위도 34.8~35.4, 경도 128.7~129.3
  // 동서대학교(사상구): 위도 35.14~35.16, 경도 128.99~129.02
  if (lat >= 35.10 && lat <= 35.20 && lng >= 128.95 && lng <= 129.05) {
    return '부산 사상구';
  } else if (lat >= 35.05 && lat <= 35.25 && lng >= 128.9 && lng <= 129.3) {
    return '부산';
  } else if (lat >= 37.4 && lat <= 37.7 && lng >= 126.8 && lng <= 127.2) {
    return '서울';
  } else if (lat >= 35.05 && lat <= 35.35 && lng >= 128.5 && lng <= 128.8) {
    return '창원';
  } else if (lat >= 35.8 && lat <= 36.0 && lng >= 128.4 && lng <= 128.7) {
    return '대구';
  } else if (lat >= 36.3 && lat <= 36.5 && lng >= 127.3 && lng <= 127.6) {
    return '대전';
  } else if (lat >= 35.1 && lat <= 35.2 && lng >= 126.8 && lng <= 127.0) {
    return '광주';
  } else if (lat >= 37.2 && lat <= 37.5 && lng >= 126.7 && lng <= 127.1) {
    return '경기';
  } else {
    // 기본: 좌표 값으로 한국 내 지역 추정
    if (lat > 36.5) return '서울 경기';
    if (lat > 35.5) return '충청';
    return '부산';
  }
}

// ============================================================
// 맛집 데이터 패치 핵심 함수
// ============================================================
async function fetchNearbyRestaurants() {
  showLoading(true);
  
  state.lastSearchCoords.lat = state.currentCoords.lat;
  state.lastSearchCoords.lng = state.currentCoords.lng;
  
  const clientId = DOM.naverClientId ? DOM.naverClientId.value.trim() : '';
  const clientSecret = DOM.naverClientSecret ? DOM.naverClientSecret.value.trim() : '';
  const hasNaverCredentials = !!(clientId && clientSecret);
  
  try {
    if (hasNaverCredentials) {
      // ✅ 네이버 API 모드: 현재 좌표 기반 지역명으로 검색
      const naverData = await fetchFromNaverAPI(clientId, clientSecret);
      if (naverData && naverData.length > 0) {
        processNaverData(naverData);
      } else {
        // API 결과 없으면 폴백
        generateMockRestaurantsFallback();
      }
    } else {
      // 폴백 모드: Overpass API(OSM) 시도 → 실패 시 더미 데이터
      try {
        const osmData = await fetchFromOverpassAPI();
        processOSMData(osmData);
      } catch (err) {
        console.warn('Overpass API 실패, 더미 데이터로 대체:', err);
        generateMockRestaurantsFallback();
      }
    }
  } catch (error) {
    console.error('음식점 데이터 로드 실패:', error);
    generateMockRestaurantsFallback();
  } finally {
    showLoading(false);
  }
}

// ============================================================
// 네이버 로컬 검색 API 호출
// 핵심: 현재 좌표 → 지역명 → "부산 사상구 한식" 형태로 검색
// ============================================================
async function fetchFromNaverAPI(clientId, clientSecret) {
  const keywords = Array.from(state.selectedCategories);
  if (keywords.length === 0) return [];
  
  const { lat, lng } = state.currentCoords;
  
  // ✅ 현재 좌표 기반으로 지역명을 정확하게 결정
  const locationName = getLocationName(lat, lng);
  
  let allItems = [];
  const corsProxy = 'https://cors-anywhere.herokuapp.com/';

  console.log(`📍 현재 위치: ${lat.toFixed(4)}, ${lng.toFixed(4)} → 지역: ${locationName}`);
  
  for (const keyword of keywords) {
    // ✅ "부산 사상구 한식" 형태로 지역 기반 검색
    const searchQuery = `${locationName} ${keyword}`;
    const apiURL = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(searchQuery)}&display=20&start=1&sort=random`;
    
    incrementNaverUsage(1);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    
    try {
      console.log(`🔍 네이버 검색: "${searchQuery}"`);
      
      const response = await fetch(corsProxy + apiURL, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'X-Requested-With': 'XMLHttpRequest'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          console.log(`✅ "${searchQuery}": ${data.items.length}개 결과`);
          
          data.items.forEach(item => {
            // 네이버 mapx, mapy = KATEC 좌표 (1/10,000,000도 단위)
            let itemLat = lat + (Math.random() - 0.5) * 0.006;
            let itemLng = lng + (Math.random() - 0.5) * 0.008;
            
            if (item.mapy && item.mapx) {
              const rawLat = parseInt(item.mapy) / 10000000;
              const rawLng = parseInt(item.mapx) / 10000000;
              // 유효한 한반도 범위 내인지 확인
              if (rawLat > 33.0 && rawLat < 38.5 && rawLng > 124.5 && rawLng < 132.0) {
                itemLat = rawLat;
                itemLng = rawLng;
              }
            }
            
            allItems.push({
              name: item.title.replace(/<[^>]*>?/gm, ''),
              category: keyword,
              address: item.address || item.roadAddress || '',
              roadAddress: item.roadAddress || '',
              telephone: item.telephone || '정보 없음',
              lat: itemLat,
              lng: itemLng
            });
          });
        } else {
          console.warn(`⚠️ "${searchQuery}": 검색 결과 없음`);
        }
      } else {
        const errText = await response.text().catch(() => '');
        console.warn(`⚠️ 네이버 API 응답 오류 (${response.status}):`, errText.substring(0, 100));
        
        if (response.status === 403) {
          showToast('<i class="fa-solid fa-shield-halved"></i>&nbsp; CORS 프록시 접근이 필요합니다. <a href="https://cors-anywhere.herokuapp.com/corsdemo" target="_blank" style="color:#03c75a">여기를 클릭</a>하여 임시 접근을 허용하세요.', 'lock', 6000);
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        console.warn(`⏱️ "${keyword}" 요청 시간 초과`);
      } else {
        console.warn(`❌ "${keyword}" 호출 실패:`, e.message);
      }
    }
  }
  
  return allItems;
}

// ============================================================
// 네이버 API 데이터 처리
// ============================================================
function processNaverData(items) {
  const { lat: userLat, lng: userLng } = state.currentCoords;
  const result = [];
  
  items.forEach((item, index) => {
    if (!item.name) return;
    
    const itemLat = item.lat;
    const itemLng = item.lng;
    
    if (isNaN(itemLat) || isNaN(itemLng)) return;
    
    // 카테고리 판별
    const category = item.category || determineCategory(item.name, '');
    if (!state.selectedCategories.has(category)) return;
    
    // 현재 좌표와의 거리 계산
    const distance = calculateDistance(userLat, userLng, itemLat, itemLng);
    
    // 반경 내 음식점만 표시 (네이버 결과는 지역명으로 검색했으므로 반경 2배까지 허용)
    const maxDist = Math.max(state.searchRadius * 2, 3000);
    if (distance > maxDist) return;
    
    const rating = parseFloat((3.8 + Math.random() * 1.2).toFixed(1));
    const reviews = Math.floor(Math.random() * 450) + 12;
    
    result.push({
      id: `naver_${index}_${Date.now()}`,
      name: item.name,
      category: category,
      lat: itemLat,
      lng: itemLng,
      distance: Math.round(distance),
      rating: rating,
      reviews: reviews,
      telephone: item.telephone || '정보 없음',
      address: item.address || item.roadAddress || '주소 정보 없음',
      source: 'naver'
    });
  });
  
  state.restaurants = result;
  
  // 결과가 너무 적으면 더미로 보강
  if (state.restaurants.length < 3) {
    const needed = 8 - state.restaurants.length;
    fillUpWithMockData(needed);
    if (result.length === 0) {
      showToast('<i class="fa-solid fa-triangle-exclamation"></i>&nbsp; 반경 내 음식점이 적어 추천 데이터를 추가했습니다.', 'lock', 3000);
    }
  }
  
  postFetchProcess();
}

// ============================================================
// Overpass API (OSM) 호출
// ============================================================
async function fetchFromOverpassAPI() {
  const { lat, lng } = state.currentCoords;
  const radius = state.searchRadius;
  
  const query = `
    [out:json][timeout:8];
    (
      node["amenity"="restaurant"](around:${radius},${lat},${lng});
      node["amenity"="fast_food"](around:${radius},${lat},${lng});
      way["amenity"="restaurant"](around:${radius},${lat},${lng});
      way["amenity"="fast_food"](around:${radius},${lat},${lng});
    );
    out center;
  `;
  
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Overpass API response not OK');
    const data = await response.json();
    return data.elements || [];
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================
// OSM 데이터 처리
// ============================================================
function processOSMData(elements) {
  const { lat: userLat, lng: userLng } = state.currentCoords;
  const result = [];
  
  elements.forEach((item, index) => {
    const name = item.tags?.['name:ko'] || item.tags?.name || item.tags?.['name:en'] || '';
    if (!name) return;
    
    const itemLat = item.lat || item.center?.lat;
    const itemLng = item.lon || item.center?.lon;
    if (!itemLat || !itemLng || isNaN(itemLat) || isNaN(itemLng)) return;
    
    const cuisineTag = item.tags?.cuisine || '';
    const category = determineCategory(name, cuisineTag);
    if (!state.selectedCategories.has(category)) return;
    
    const distance = calculateDistance(userLat, userLng, itemLat, itemLng);
    if (distance > state.searchRadius) return;
    
    result.push({
      id: `osm_${index}_${Date.now()}`,
      name: name,
      category: category,
      lat: itemLat,
      lng: itemLng,
      distance: Math.round(distance),
      rating: parseFloat((3.8 + Math.random() * 1.2).toFixed(1)),
      reviews: Math.floor(Math.random() * 450) + 12,
      telephone: item.tags?.phone || item.tags?.['contact:phone'] || '정보 없음',
      address: item.tags?.['addr:full'] || item.tags?.['addr:street'] || '주소 정보 없음',
      source: 'osm'
    });
  });
  
  state.restaurants = result;
  
  // OSM 결과가 적으면 더미 보강
  if (state.restaurants.length < 5) {
    fillUpWithMockData(Math.max(5 - state.restaurants.length, 3));
  }
  
  postFetchProcess();
}

// ============================================================
// 카테고리 판별
// ============================================================
function determineCategory(name, cuisine) {
  const n = name.toLowerCase();
  const c = cuisine.toLowerCase();
  
  if (n.includes('짜장') || n.includes('짬뽕') || n.includes('반점') || n.includes('중식') || n.includes('마라') || n.includes('딤섬') || n.includes('양꼬치') || c.includes('chinese')) return '중식';
  if (n.includes('스시') || n.includes('초밥') || n.includes('라멘') || n.includes('우동') || n.includes('돈까스') || n.includes('돈카츠') || n.includes('일식') || c.includes('japanese') || c.includes('sushi') || c.includes('ramen')) return '일식';
  if (n.includes('치킨') || n.includes('닭강정') || n.includes('통닭') || n.includes('호프') || n.includes('chicken') || c.includes('chicken')) return '치킨';
  if (n.includes('피자') || n.includes('pizza') || c.includes('pizza') || c.includes('italian')) return '피자';
  if (n.includes('버거') || n.includes('burger') || n.includes('맥도날드') || n.includes('버거킹') || n.includes('롯데리아') || n.includes('맘스터치') || c.includes('burger')) return '햄버거';
  if (n.includes('떡볶이') || n.includes('김밥') || n.includes('순대') || n.includes('만두') || n.includes('분식') || n.includes('어묵') || n.includes('튀김')) return '분식';
  return '한식';
}

// ============================================================
// 위치 기반 가상 주소/전화번호 생성
// ============================================================
function getMockAddress(lat) {
  if (lat >= 35.10 && lat <= 35.20) {
    const streets = ['주례로', '사상로', '백양대로', '덕포로', '학장로', '괴정로'];
    const street = streets[Math.floor(Math.random() * streets.length)];
    return `부산광역시 사상구 ${street} ${Math.floor(10 + Math.random() * 200)}`;
  } else if (lat > 34.8 && lat < 35.4) {
    const dists = ['해운대구', '수영구', '남구', '동래구', '부산진구', '서구'];
    const dist = dists[Math.floor(Math.random() * dists.length)];
    return `부산광역시 ${dist} ${Math.floor(1 + Math.random() * 500)}번길`;
  } else if (lat > 37.4 && lat < 37.7) {
    return `서울특별시 강남구 테헤란로 ${Math.floor(10 + Math.random() * 300)}길`;
  }
  return `부산광역시 사상구 주례동 ${Math.floor(100 + Math.random() * 900)}`;
}

function getMockPhone(lat) {
  const isBusan = lat < 36.0;
  const prefix = isBusan ? '051' : '02';
  return `${prefix}-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ============================================================
// 폴백 더미 데이터 생성 (API 실패 시)
// ============================================================
function generateMockRestaurantsFallback() {
  const result = [];
  const { lat, lng } = state.currentCoords;
  const categories = Array.from(state.selectedCategories);
  
  if (categories.length === 0) {
    state.restaurants = [];
    postFetchProcess();
    return;
  }
  
  let idCounter = 0;
  categories.forEach(cat => {
    const count = Math.floor(Math.random() * 3) + 4; // 4~6개
    const names = mockRestaurantNames[cat];
    
    for (let i = 0; i < count; i++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const distanceMeters = 150 + Math.random() * (state.searchRadius - 200);
      const angle = Math.random() * Math.PI * 2;
      const offsetLat = (distanceMeters * Math.cos(angle)) / 111000;
      const offsetLng = (distanceMeters * Math.sin(angle)) / (111000 * Math.cos(lat * Math.PI / 180));
      const itemLat = lat + offsetLat;
      const itemLng = lng + offsetLng;
      
      result.push({
        id: `mock_${idCounter++}_${Date.now()}`,
        name: name,
        category: cat,
        lat: itemLat,
        lng: itemLng,
        distance: Math.round(calculateDistance(lat, lng, itemLat, itemLng)),
        rating: parseFloat((3.8 + Math.random() * 1.2).toFixed(1)),
        reviews: Math.floor(Math.random() * 350) + 5,
        telephone: getMockPhone(lat),
        address: getMockAddress(lat),
        source: 'mock'
      });
    }
  });
  
  state.restaurants = result;
  postFetchProcess();
}

// ============================================================
// 부족한 결과 더미로 보강
// ============================================================
function fillUpWithMockData(neededCount) {
  const { lat, lng } = state.currentCoords;
  const categories = Array.from(state.selectedCategories);
  if (categories.length === 0) return;
  
  for (let i = 0; i < neededCount; i++) {
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const names = mockRestaurantNames[cat];
    const name = names[Math.floor(Math.random() * names.length)] + ' (추천)';
    const distanceMeters = 150 + Math.random() * (state.searchRadius - 200);
    const angle = Math.random() * Math.PI * 2;
    const offsetLat = (distanceMeters * Math.cos(angle)) / 111000;
    const offsetLng = (distanceMeters * Math.sin(angle)) / (111000 * Math.cos(lat * Math.PI / 180));
    const itemLat = lat + offsetLat;
    const itemLng = lng + offsetLng;
    
    state.restaurants.push({
      id: `fill_${i}_${Date.now()}`,
      name: name,
      category: cat,
      lat: itemLat,
      lng: itemLng,
      distance: Math.round(distanceMeters),
      rating: parseFloat((4.0 + Math.random() * 1.0).toFixed(1)),
      reviews: Math.floor(Math.random() * 200) + 10,
      telephone: getMockPhone(lat),
      address: getMockAddress(lat),
      source: 'mock'
    });
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
    const isMock = restaurant.source === 'mock';
    
    const card = document.createElement('div');
    card.className = 'restaurant-card';
    card.setAttribute('data-id', restaurant.id);
    
    const regionName = (getLocationName(restaurant.lat, restaurant.lng) || '부산');
    const blogSearchUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(restaurant.name + ' ' + regionName + ' 맛집')}`;

    card.innerHTML = `
      <div class="card-header-row">
        <span class="card-category-badge">${meta.emoji} ${restaurant.category}${isMock ? ' <small style="opacity:0.5;font-size:0.65rem">(추천)</small>' : ''}</span>
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
      const phone = e.target.closest('.btn-call').getAttribute('data-phone');
      if (phone && phone !== '정보 없음') {
        window.location.href = `tel:${phone.replace(/-/g, '')}`;
      } else {
        alert(`[안내] '${restaurant.name}' 매장 전화번호 정보가 없습니다.`);
      }
    });

    card.querySelector('.btn-find-way').addEventListener('click', (e) => {
      e.stopPropagation();
      const rLat = e.target.closest('.btn-find-way').getAttribute('data-lat');
      const rLng = e.target.closest('.btn-find-way').getAttribute('data-lng');
      // 네이버 지도 길찾기 연동
      const naverMapUrl = `https://map.naver.com/v5/directions/-/${rLng},${rLat},${encodeURIComponent(restaurant.name)},,/walk?c=15,0,0,0,dh`;
      window.open(naverMapUrl, '_blank');
    });

    card.querySelector('.btn-blog').addEventListener('click', (e) => {
      e.stopPropagation();
      const url = e.target.closest('.btn-blog').getAttribute('data-url');
      window.open(url, '_blank');
      showToast('<i class="fa-solid fa-blog"></i>&nbsp; 네이버 블로그 검색 결과를 엽니다', 'success', 2000);
    });
    
    DOM.restaurantCardsFeed.appendChild(card);
  });
}

// ============================================================
// 지도 마커 업데이트
// ============================================================
function updateMapMarkers() {
  state.restaurantMarkers.forEach(marker => state.map.removeLayer(marker));
  state.restaurantMarkers = [];
  
  const filtered = state.activeFilter === 'all'
    ? state.restaurants
    : state.restaurants.filter(r => r.category === state.activeFilter);
    
  filtered.forEach(restaurant => {
    const meta = categoryMetadata[restaurant.category];
    
    const markerHtml = `
      <div class="restaurant-pin" style="background-color: ${meta.color}; border-color: #fff;">
        <i class="fa-solid ${meta.icon}"></i>
      </div>
    `;
    
    const customIcon = L.divIcon({
      className: 'custom-restaurant-marker',
      html: markerHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
    
    const marker = L.marker([restaurant.lat, restaurant.lng], { icon: customIcon })
      .addTo(state.map)
      .bindPopup(`
        <div class="map-popup-content">
          <h4 style="font-weight: 700; margin-bottom: 4px; font-size: 0.95rem;">${restaurant.name}</h4>
          <div style="font-size: 0.8rem; margin-bottom: 6px; color: #cbd5e1;">
            <span style="color: ${meta.color}; font-weight:700;">${meta.emoji} ${restaurant.category}</span> | 
            <span><i class="fa-solid fa-person-walking"></i> ${restaurant.distance}m</span>
          </div>
          <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 4px;">${restaurant.address}</div>
          <div style="font-size: 0.85rem; font-weight:700; color: #fbbf24;">
            <i class="fa-solid fa-star"></i> ${restaurant.rating.toFixed(1)} (리뷰 ${restaurant.reviews})
          </div>
        </div>
      `);
      
    marker.on('click', () => highlightRestaurantCard(restaurant.id));
    state.restaurantMarkers.push(marker);
  });
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
  state.map.setView([restaurant.lat, restaurant.lng], 16);
  const marker = state.restaurantMarkers.find(m => {
    const latLng = m.getLatLng();
    return Math.abs(latLng.lat - restaurant.lat) < 0.00001 && Math.abs(latLng.lng - restaurant.lng) < 0.00001;
  });
  if (marker) marker.openPopup();
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
      deletePreset(e.target.closest('.btn-delete-preset').getAttribute('data-id'));
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
      state.map.setView([restaurant.lat, restaurant.lng], 16);
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

// ============================================================
// 네이버 API 사용량 트래킹
// ============================================================
function incrementNaverUsage(count = 1) {
  const today = new Date().toISOString().split('T')[0];
  let usage = { date: today, count: 0 };
  
  const stored = localStorage.getItem('naver_api_usage');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === today) usage = parsed;
    } catch (e) {}
  }
  
  usage.count += count;
  localStorage.setItem('naver_api_usage', JSON.stringify(usage));
  renderNaverUsageUI();
}

function renderNaverUsageUI() {
  const today = new Date().toISOString().split('T')[0];
  let count = 0;
  
  const stored = localStorage.getItem('naver_api_usage');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === today) count = parsed.count;
    } catch (e) {}
  }
  
  const countEl = document.getElementById('naver-usage-count');
  const barEl = document.getElementById('naver-usage-bar');
  
  if (countEl && barEl) {
    countEl.textContent = `${count.toLocaleString()} / 25,000`;
    const percent = Math.min(100, (count / 25000) * 100);
    barEl.style.width = `${percent}%`;
    
    // 사용량 많으면 경고 색상
    if (percent > 80) {
      barEl.style.background = '#ef4444';
    } else if (percent > 50) {
      barEl.style.background = '#f59e0b';
    } else {
      barEl.style.background = 'var(--naver-green)';
    }
  }
}
