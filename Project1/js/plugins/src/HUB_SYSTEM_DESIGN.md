# 거점(Hub) 시스템 설계서

**버전:** v1.0
**작성일:** 2026-04-29
**상태:** 설계 확정 — 구현 전

---

## 1. 개요

### 목적
타일맵을 사용하지 않는 비전투 "장소" 화면을 구현한다. 배경 일러스트 위에 핫스팟 클릭으로 시설에 진입하고, 우측 사이드바에 파티 상태/의뢰/메뉴/파티원을 상시 표시한다.

### 설계 원칙
- **RMMZ 네이티브 최대 활용**: Scene_Base 상속, Window_Base 계열 윈도우, $gameParty/$gameActors/$gameSystem 직접 참조
- **기존 시스템 호환**: Scene_CustomMenu(메인메뉴), GridInventory, GahoSystem, 관계 시스템과 자연스럽게 연동
- **데이터 분리**: 거점/장소 데이터는 JSON 테이블($dataLocations)로 관리, 맵 타일과 무관
- **세이브/로드 안전**: $gameSystem 확장으로 현재 위치·시간 상태 저장

### 게임 흐름에서의 위치
```
타이틀 → 월드맵(타일맵) → 거점 도착 → Scene_Hub(본 설계서)
                                          ↓
                                    시설 핫스팟 클릭
                                          ↓
                              Scene_Facility(시설 내부) 또는
                              Scene_CustomMenu(메뉴) 또는
                              Scene_Map(SRPG 전투)
```

---

## 2. 화면 레이아웃

### 전체 구성 (해상도 1600×900 기준)
```
┌─────────────────────────────────┬──────┐
│                                 │ 상태 │ ← 시간/날씨 + 사기/행동력 바 + 자금 + 보급
│       배경 일러스트              │──────│
│       (86% 너비)                │ 의뢰 │ ← 진행 중 의뢰 요약 (목적지/목표/기한)
│                                 │──────│
│   [핫스팟] [핫스팟] [핫스팟]     │ 메뉴 │ ← 2×4 그리드 (소지품/전술/일지/관계/편성/의뢰/회의/설정)
│                                 │──────│
│       장소명                    │파티원│ ← 2열 초상화 그리드 (최대 2×5=10명)
│       지역 설명                 │      │   스트레스 외곽선 원형
└─────────────────────────────────┴──────┘
         좌측 ~86%                우측 ~14%
```

### 사이드바 상세

#### 상태 블록
- **1행**: 시간(일차 + 시간대) + 날씨 태그
- **사기 바**: 굵은 바(13px) 안에 "사기" 라벨 + 수치, 흰색 외곽선 텍스트
- **행동력 바**: 동일 형태, "행동력" + "현재/최대"
- **자금**: "파티 1,250G | 개인 380G" (이원화 가능, 비활성 시 파티만 표시)
- **보급**: 식량/자재/재료 태그

#### 의뢰 블록
- 행당 "목적지 | 목표요약 | D-n" 한 줄 포맷
- 최대 3건 표시, 초과 시 "외 n건" 축약
- 세부 내용은 메뉴 > 의뢰에서 확인

#### 메뉴 블록
- 2×4 그리드, 텍스트만 (아이콘 없음)
- 소지품, 전술, 일지, 관계, 편성, 의뢰, 회의, 설정
- 각각 SceneManager.push로 해당 Scene 진입

#### 파티원 블록
- 2열 그리드, 최대 5행(10명)
- 셀: 정사각형, 원형 초상화(두상) + 이름
- **스트레스 지수**: 초상화를 감싸는 원형 외곽선 색상
  - 초록(#1D9E75): 안정 (0~30%)
  - 노랑(#EF9F27): 경고 (30~70%)
  - 빨강(#E24B4A): 위험 (70~100%)
- 파티장: 우상단 ★ 배지
- 빈 슬롯: 점선 테두리

### 배경 영역

#### 핫스팟 시스템
- 거점 데이터에 정의된 좌표에 아이콘+건물명 표시
- 아이콘: 36×36 반투명 사각형 안에 픽토그램/심볼
- 호버: 밝아짐 + 약간 위로 이동
- 클릭: 해당 시설의 Scene_Facility로 전환 또는 이벤트 실행
- 위치: 배경 일러스트 크기 대비 비율(%) 좌표로 저장 → 해상도 독립적

#### 장소 정보
- 좌상단: 거점명 + 지역 설명 (반투명 텍스트)

---

## 3. 데이터 구조

### 3-A. 거점 데이터 테이블 ($dataLocations)

파일: `data/Locations.json`

```javascript
// RMMZ 관례: index 0 = null
[
  null,
  {
    "id": 1,
    "name": "벨포드 마을",
    "region": "왕국 남부 교역로",
    "type": "town",           // town | camp | dungeon | field
    "bgImage": "town_belford", // img/locations/ 폴더
    "bgVariants": {            // 시간대/날씨별 배경 교체 (선택)
      "night": "town_belford_night",
      "rain": "town_belford_rain"
    },
    "bgm": { "name": "Town1", "volume": 80, "pitch": 100, "pan": 0 },
    "hotspots": [
      { "id": "guild",    "name": "길드",   "icon": "hs_guild",   "x": 52, "y": 18, "facilityId": 1 },
      { "id": "tavern",   "name": "주점",   "icon": "hs_tavern",  "x": 20, "y": 35, "facilityId": 2 },
      { "id": "market",   "name": "시장",   "icon": "hs_market",  "x": 42, "y": 55, "facilityId": 3 },
      { "id": "smithy",   "name": "대장간", "icon": "hs_smithy",  "x": 70, "y": 48, "facilityId": 4 },
      { "id": "inn",      "name": "숙소",   "icon": "hs_inn",     "x": 10, "y": 75, "facilityId": 5 },
      { "id": "exit",     "name": "외출",   "icon": "hs_exit",    "x": 58, "y": 80, "target": "worldmap" }
    ],
    "availableServices": ["shop", "repair", "rest", "quest", "recruit"],
    "worldMapX": 12,
    "worldMapY": 8
  }
]
```

### 3-B. 시설 데이터 테이블 ($dataFacilities)

파일: `data/Facilities.json`

```javascript
[
  null,
  {
    "id": 1,
    "name": "모험가 길드",
    "type": "guild",           // guild | tavern | shop | smithy | inn | temple | ...
    "bgImage": "facility_guild_belford",
    "actions": [
      { "id": "quest_board", "name": "의뢰 게시판", "handler": "openQuestBoard" },
      { "id": "report",      "name": "의뢰 보고",   "handler": "reportQuest" },
      { "id": "rank_check",  "name": "등급 확인",   "handler": "checkRank" }
    ],
    "npcs": [
      { "actorId": 0, "name": "접수원 마리아", "portrait": "npc_maria", "role": "receptionist" }
    ]
  }
]
```

### 3-C. $gameSystem 확장 (런타임 상태)

```javascript
// 세이브/로드에 자동 포함되는 필드들
$gameSystem._hubData = {
  // ── 현재 위치 ──
  currentLocationId: 1,        // 현재 거점 ID
  currentFacilityId: 0,        // 0 = 거점 메인 화면, >0 = 시설 내부

  // ── 시간 ──
  dayCount: 3,                 // 경과 일수
  timeOfDay: "afternoon",      // dawn | morning | afternoon | evening | night
  weather: "clear",            // clear | rain | snow | fog | storm

  // ── 파티 자원 (수치) ──
  morale: 72,                  // 사기 (0~100)
  moraleMax: 100,
  actionPoints: 3,             // 행동력 (0~max)
  actionPointsMax: 7,
  partyFund: 1250,             // 파티 공유 자금

  // ── 개인 자금 ──
  personalWealth: {},          // { actorId: amount } — 파티장 본인 것만 사이드바 표시

  // ── 보급품 (아이템 카테고리별 집계, 실물은 GridInventory) ──
  // → 실시간 계산: GridInventory에서 카테고리별 합산
  // supplyFood / supplyMaterial / supplyIngredient는 getter로 제공

  // ── 자금 정책 ──
  fundPolicy: {
    shareRatio: 50,            // 공유 자금 적립 비율 (%)
    distMethod: "equal",       // equal | contribution | role | need | discretion
    bonusRule: "party_auction"  // finder | party_auction | communal
  },

  // ── 의뢰 ──
  activeQuests: [
    // { questId, destination, objective, dueDateDay, reward, status }
  ],

  // ── 방문 기록 ──
  visitedLocations: [],        // [locationId, ...]
  discoveredLocations: []      // 월드맵에서 발견했지만 미방문
};
```

### 3-D. Game_Actor 확장 (스트레스)

```javascript
// 기존 관계 시스템의 mood와 연동
// 스트레스 = 100 - mood (mood가 높으면 스트레스 낮음)
Game_Actor.prototype.stressLevel = function() {
  // mood: 0~100 (GridInventory.js에서 이미 관리)
  const mood = this._relationships ? (this._mood || 70) : 70;
  return Math.max(0, Math.min(100, 100 - mood));
};

Game_Actor.prototype.stressRating = function() {
  const s = this.stressLevel();
  if (s <= 30) return "low";    // 초록
  if (s <= 70) return "mid";    // 노랑
  return "high";                 // 빨강
};
```

---

## 4. 클래스 구성

### 4-A. Scene_Hub (메인 거점 화면)

```
Scene_Hub extends Scene_MenuBase
  │
  ├── _bgSprite: Sprite              // 배경 일러스트
  ├── _locationNameWindow: Window_HubLocationName   // 좌상단 장소명
  ├── _hotspotLayer: Sprite_HubHotspots             // 핫스팟 컨테이너
  ├── _sidebarContainer: Window_HubSidebar          // 우측 사이드바 (복합 윈도우)
  │     ├── _statusSection    // 시간+사기+행동력+자금+보급
  │     ├── _questSection     // 의뢰 요약
  │     ├── _menuSection      // 메뉴 버튼 그리드
  │     └── _partySection     // 파티원 초상화 그리드
  │
  └── 메서드:
      ├── create()             // Scene_MenuBase.create + 각 요소 생성
      ├── start()              // BGM 재생, 배경 로드
      ├── update()             // 핫스팟 호버/클릭 처리
      ├── _loadBackground()    // 시간대/날씨 기반 배경 선택
      ├── _onHotspotClick(hs)  // 시설 진입 또는 월드맵 복귀
      ├── _onMenuCommand(cmd)  // 메뉴 버튼 → SceneManager.push
      └── terminate()          // BGM 페이드, 정리
```

### 4-B. Window 클래스 계층

```
Window_Base (RMMZ 네이티브)
  ├── Window_HubSidebar         // 사이드바 컨테이너 (배경+테두리 관리)
  ├── Window_HubStatus          // 시간/사기/행동력/자금/보급 표시
  ├── Window_HubQuests          // 의뢰 요약 리스트
  ├── Window_HubMenu            // 메뉴 버튼 그리드 (Window_Selectable 상속)
  └── Window_HubParty           // 파티원 초상화 그리드 (Window_Selectable 상속)

Window_Selectable (RMMZ 네이티브)
  ├── Window_HubMenu            // 2×4 그리드, 커서 이동 지원
  └── Window_HubParty           // 2×N 그리드, 클릭으로 인물 상세 진입
```

### 4-C. Sprite 클래스

```
Sprite (PIXI 기반)
  ├── Sprite_HubHotspots        // 핫스팟 컨테이너
  │     └── Sprite_HubHotspot[] // 개별 핫스팟 (아이콘+라벨)
  │           ├── _iconSprite   // 아이콘 이미지
  │           ├── _labelText    // PIXI.Text 건물명
  │           └── _hoverScale   // 호버 애니메이션 상태
  │
  └── Sprite_HubPortrait        // 파티원 초상화 (원형 클리핑 + 스트레스 링)
        ├── _portraitBitmap     // ImageManager.loadPicture/loadFace
        ├── _stressRing         // PIXI.Graphics 원형 외곽선
        ├── _leaderBadge        // ★ 배지 (파티장만)
        └── _nameText           // PIXI.Text 이름
```

---

## 5. RMMZ 네이티브 연동

### 5-A. DataManager 확장

```javascript
// Locations.json, Facilities.json 로드
window.$dataLocations = null;
window.$dataFacilities = null;

const _DM_loadDatabase = DataManager.loadDatabase;
DataManager.loadDatabase = function() {
  _DM_loadDatabase.call(this);
  this.loadDataFile("$dataLocations", "Locations.json");
  this.loadDataFile("$dataFacilities", "Facilities.json");
};

const _DM_isDatabaseLoaded = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
  if (!_DM_isDatabaseLoaded.call(this)) return false;
  if (!window.$dataLocations) return false;
  if (!window.$dataFacilities) return false;
  return true;
};
```

### 5-B. 세이브/로드

```javascript
// $gameSystem._hubData는 $gameSystem의 프로퍼티이므로
// makeSaveContents/extractSaveContents에서 자동 직렬화됨
// 추가 작업 불필요 — RMMZ 네이티브가 처리

const _GS_initialize = Game_System.prototype.initialize;
Game_System.prototype.initialize = function() {
  _GS_initialize.call(this);
  this._hubData = {
    currentLocationId: 0,
    currentFacilityId: 0,
    dayCount: 1,
    timeOfDay: "morning",
    weather: "clear",
    morale: 70,
    moraleMax: 100,
    actionPoints: 5,
    actionPointsMax: 7,
    partyFund: 0,
    personalWealth: {},
    fundPolicy: { shareRatio: 50, distMethod: "equal", bonusRule: "party_auction" },
    activeQuests: [],
    visitedLocations: [],
    discoveredLocations: []
  };
};
```

### 5-C. 이미지 로드 경로

```
img/locations/       ← 거점 배경 일러스트 (1600×900)
img/locations/hs/    ← 핫스팟 아이콘 (36×36 또는 48×48)
img/facilities/      ← 시설 내부 배경 일러스트
```

ImageManager 확장:
```javascript
ImageManager.loadLocation = function(filename) {
  return this.loadBitmap("img/locations/", filename);
};
ImageManager.loadHotspotIcon = function(filename) {
  return this.loadBitmap("img/locations/hs/", filename);
};
ImageManager.loadFacility = function(filename) {
  return this.loadBitmap("img/facilities/", filename);
};
```

### 5-D. SceneManager 전환

```javascript
// 월드맵 → 거점 진입 (이벤트 커맨드 또는 스크립트 호출)
$gameSystem._hubData.currentLocationId = locationId;
SceneManager.push(Scene_Hub);

// 거점 → 시설 진입
$gameSystem._hubData.currentFacilityId = facilityId;
SceneManager.push(Scene_Facility);

// 거점 → 메뉴 진입 (기존 Scene_CustomMenu 재활용)
SceneManager.push(Scene_CustomMenu);

// 거점 → 월드맵 복귀
SceneManager.goto(Scene_Map);

// 거점 → SRPG 전투
$gameSystem._hubData.currentFacilityId = 0;
SceneManager.goto(Scene_Map); // → 전투 맵 로드 → SM.startBattle()
```

### 5-E. $gameParty 연동

```javascript
// 파티원 목록: $gameParty.members() — 네이티브 그대로
// 파티장: $gameParty.leader() — 네이티브
// 보급품 집계: GridInventory 카테고리별 합산

Game_System.prototype.supplyFood = function() {
  // GridInventory에서 식량 카테고리 아이템 총량 합산
  let total = 0;
  for (const actor of $gameParty.members()) {
    if (actor._inventory) {
      total += actor._inventory.countByCategory("food");
    }
  }
  // 파티 공유 보관함도 합산
  if ($gameParty._sharedStorage) {
    total += $gameParty._sharedStorage.countByCategory("food");
  }
  return total;
};
// supplyMaterial, supplyIngredient 동일 패턴
```

### 5-F. 초상화 로드

```javascript
// StandingManager 연동 — 이미 구현된 초상화 시스템 재활용
// 두상(bust) 크기로 원형 클리핑하여 사이드바에 표시

Sprite_HubPortrait.prototype._loadPortrait = function(actor) {
  // 1차: StandingManager에서 감정별 초상화
  if (actor.hasPortrait && actor.hasPortrait()) {
    const name = actor.currentPortraitName();
    this._portraitBitmap = ImageManager.loadPicture(name);
  }
  // 2차 폴백: RMMZ 네이티브 얼굴 이미지
  else {
    this._portraitBitmap = ImageManager.loadFace(actor.faceName());
    this._faceIndex = actor.faceIndex();
  }
};
```

---

## 6. 핫스팟 상호작용

### 마우스/터치 처리

```javascript
Scene_Hub.prototype.update = function() {
  Scene_MenuBase.prototype.update.call(this);
  this._updateHotspots();
};

Scene_Hub.prototype._updateHotspots = function() {
  const tx = TouchInput.x;
  const ty = TouchInput.y;
  const sidebarW = Math.floor(Graphics.width * 0.14);
  const bgW = Graphics.width - sidebarW;

  // 사이드바 영역은 Window가 처리 → 배경 영역만 핫스팟 체크
  if (tx >= bgW) return;

  const loc = $dataLocations[$gameSystem._hubData.currentLocationId];
  if (!loc) return;

  let hoveredHs = null;
  for (const hs of loc.hotspots) {
    // 비율 좌표 → 실제 픽셀
    const hx = Math.floor(hs.x / 100 * bgW);
    const hy = Math.floor(hs.y / 100 * Graphics.height);
    const dist = Math.sqrt((tx - hx) ** 2 + (ty - hy) ** 2);
    if (dist < 30) { // 히트 반경 30px
      hoveredHs = hs;
      break;
    }
  }

  // 호버 시각 피드백
  this._hotspotLayer.setHovered(hoveredHs);

  // 클릭 처리
  if (hoveredHs && TouchInput.isTriggered()) {
    this._onHotspotClick(hoveredHs);
  }
};
```

### 시설 진입 흐름

```javascript
Scene_Hub.prototype._onHotspotClick = function(hs) {
  SoundManager.playOk();

  if (hs.target === "worldmap") {
    // 월드맵 복귀
    SceneManager.goto(Scene_Map);
    return;
  }

  if (hs.facilityId) {
    // 시설 내부 진입
    $gameSystem._hubData.currentFacilityId = hs.facilityId;
    SceneManager.push(Scene_Facility);
  }

  if (hs.commonEventId) {
    // 커먼 이벤트 실행 (특수 상호작용)
    $gameTemp.reserveCommonEvent(hs.commonEventId);
  }
};
```

---

## 7. 시설 내부 (Scene_Facility)

### 개요
거점의 하위 화면. 배경 일러스트 교체 + 행동 메뉴 표시.
Scene_Hub와 동일한 사이드바 구조를 공유한다 (파티 상태 상시 표시).

### 구조
```
Scene_Facility extends Scene_MenuBase
  ├── _bgSprite           // 시설 배경 일러스트
  ├── _sidebarContainer   // Scene_Hub와 동일한 사이드바 (공유 클래스)
  ├── _actionWindow       // 행동 선택 (Window_Selectable)
  ├── _npcSprites[]       // NPC 스탠딩 일러스트
  └── _dialogWindow       // 대화/설명 윈도우
```

### 시설 유형별 행동

| 시설 | 주요 행동 | 연동 시스템 |
|------|----------|------------|
| 길드 | 의뢰 게시판, 보고, 등급 확인 | Quest 시스템 |
| 주점 | 정보 수집, 동료 모집, 식사 | 관계 시스템, 사기 회복 |
| 시장 | 매매, 감정, 소문 | GridInventory, 교섭 태그 |
| 대장간 | 수리, 강화, 제작 | 장비 내구도, 자재 소비 |
| 숙소 | 숙박(시간 경과), 회의 | 행동력 회복, 회의 시스템 |
| 신전 | 치료, 해독, 축복 | HP/상태이상 회복 |

---

## 8. 플러그인 구성

### 파일 목록

```
js/plugins/HubSystem.js        ← 메인 플러그인
  - Scene_Hub
  - Scene_Facility
  - Window_HubSidebar (복합)
  - Window_HubStatus
  - Window_HubQuests
  - Window_HubMenu
  - Window_HubParty
  - Sprite_HubHotspots
  - Sprite_HubHotspot
  - Sprite_HubPortrait
  - DataManager 확장
  - Game_System 확장
  - ImageManager 확장

data/Locations.json             ← 거점 데이터
data/Facilities.json            ← 시설 데이터
img/locations/                  ← 배경 일러스트
img/locations/hs/               ← 핫스팟 아이콘
img/facilities/                 ← 시설 배경
```

### plugins.js 등록

```javascript
{
  "name": "HubSystem",
  "status": true,
  "description": "Hub/Base location system — illustrated backgrounds with hotspot navigation and persistent sidebar UI",
  "parameters": {}
}
```

### 의존성

```
SRPG_Boot.js          ← 기본 부팅 (선행)
GridInventory.js      ← 인벤토리/관계/보급품 API
StandingManager.js    ← 초상화 로드 API
MenuOverhaul.js       ← Scene_CustomMenu (메뉴 진입)
GahoSystem.js         ← 원국 데이터 (스트레스 계산 시 참조)
```

---

## 9. 월드맵 연동

### 월드맵 → 거점 진입

월드맵은 RMMZ 네이티브 타일맵(Scene_Map). 거점 위치에 이벤트를 배치하고,
이벤트 커맨드 "스크립트"로 Scene_Hub를 호출한다.

```javascript
// 맵 이벤트 스크립트
$gameSystem._hubData.currentLocationId = 1; // 벨포드
SceneManager.goto(Scene_Hub);
```

### 거점 → 월드맵 복귀

"외출" 핫스팟 클릭 시 `SceneManager.goto(Scene_Map)`.
$gamePlayer의 위치는 거점 이벤트 좌표에 유지됨 (월드맵에서 떠난 위치).

### 거점 간 직접 이동

월드맵을 거치지 않고 거점→거점 직접 이동이 필요한 경우:
```javascript
// 마차/선박 등 교통 수단 이용 시
$gameSystem._hubData.currentLocationId = targetLocationId;
// 월드맵 플레이어 위치도 갱신
$gamePlayer.setPosition(targetX, targetY);
// Scene_Hub 재시작
SceneManager.goto(Scene_Hub);
```

---

## 10. 시간 시스템 연동

### 시간대 구분

| 시간대 | 영문 키 | 배경 변형 | 게임 효과 |
|--------|---------|----------|----------|
| 새벽 | dawn | _dawn | 척후 보너스, 시장 닫힘 |
| 오전 | morning | (기본) | 기본 상태 |
| 오후 | afternoon | (기본) | 기본 상태 |
| 저녁 | evening | _evening | 주점 활성, 정보 수집 보너스 |
| 밤 | night | _night | 숙소 한정, 야습 리스크 |

### 시간 경과 트리거

- **숙박**: dawn → morning (1일 경과)
- **야영**: 현재 → 다음 시간대
- **시설 행동**: 일부 행동은 시간대를 소비 (예: 정보 수집 → 오후→저녁)
- **행동력 소비**: 행동력이 0이 되면 강제 시간 경과

---

## 11. 구현 순서

### Phase 1: 코어 프레임워크
- DataManager 확장 (Locations.json, Facilities.json 로드)
- Game_System._hubData 초기화 + 세이브/로드 검증
- Scene_Hub 골격 (배경 + 빈 사이드바)
- ImageManager 확장

### Phase 2: 사이드바 윈도우
- Window_HubStatus (시간/사기/행동력/자금/보급)
- Window_HubQuests (의뢰 요약)
- Window_HubMenu (메뉴 그리드 → SceneManager.push)
- Window_HubParty (초상화 그리드 + 스트레스 링)

### Phase 3: 핫스팟 시스템
- Sprite_HubHotspots / Sprite_HubHotspot
- 마우스/터치 히트 판정 + 호버 애니메이션
- 클릭 → 시설 진입 또는 월드맵 복귀

### Phase 4: Scene_Facility
- 시설 배경 + 행동 메뉴
- NPC 스탠딩 배치
- 사이드바 공유

### Phase 5: 데이터 + 통합
- 샘플 거점/시설 데이터 작성
- 월드맵 이벤트에서 Scene_Hub 호출 검증
- 메뉴 진입/복귀 플로우 검증
- 빌드 + truncation 점검

---

## 12. 미결정 사항

- [ ] 거점 배경 일러스트 사이즈 확정 (1600×900 전체? 사이드바 제외 1376×900?)
- [ ] 핫스팟 아이콘 소스 (자체 제작? 아이콘 세트?)
- [ ] 시설 내부 레이아웃 상세 (행동 메뉴 위치, NPC 배치 규칙)
- [ ] 시간 경과 공식 (행동당 소비 시간, 하루 최대 행동 횟수)
- [ ] 행동력 회복 공식 (숙박 시 전량 회복? 부분 회복?)
- [ ] 사기 변동 공식 (식사/숙박/전투 결과별 변동량)
- [ ] 보급품 소비 공식 (파티 인원 × 식량 단위 / 일)
- [ ] 월드맵 이동 시스템 (자유 이동? 경로 선택?)
- [ ] 야영지(camp) 타입 거점의 핫스팟 구성
- [ ] Scene_Facility 내에서의 대화 시스템 (네이티브 메시지 윈도우 활용?)
