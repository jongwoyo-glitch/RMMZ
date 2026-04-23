# SRPG 전투 구역 · 승리 조건 · 배치 시스템 설계서

> 작성일: 2026-04-23  
> 범위: SRPG_Core(SM/Data), RMMZStudio 맵 에디터 SRPG 탭

---

## 1. 현행 분석

### 1.1 이미 구현된 것

| 기능 | 위치 | 상태 |
|------|------|------|
| BattleModeChecker 7모드 등록·판정 | SRPG_Data.js L622-873 | ✅ 완성 |
| parseMapNote() 노트태그 파서 | SRPG_Data.js L641-740 | ✅ 완성 |
| 기습 적용 (_applyAmbush) | SRPG_SM.js L141-161 | ✅ 완성 |
| 배치 페이즈 로직 (입력·배치·완료) | SRPG_SM.js L164-291 | ✅ 완성 |
| 배치 리전 (200=공용, 201-208=팀별) | SRPG_SM.js L169-203 | ✅ 완성 |
| 승리/패배 커먼이벤트 트리거 | SRPG_SM.js L294-305 | ✅ 완성 |
| 맵 속성 모달: 전투모드/기습/팀 설정 | RMMZStudio.js L7915-8040 | ✅ 완성 |
| 유닛 배치 팔레트 + 이벤트 자동 생성 | RMMZStudio.js L8156-8407 | ✅ 완성 |

### 1.2 빠져 있는 것

| 기능 | 문제 |
|------|------|
| 배치 구역 페인팅 도구 | 리전 200/201-208을 맵 캔버스에 칠하는 UI 없음 |
| 특수 구역 시각 배치 | 탈출존, 점령거점, 깃발위치 등이 노트태그 좌표 수동입력뿐 |
| 증원 스폰 포인트 시각 배치 | `<srpgSpawnWave>` 좌표를 텍스트로 입력해야 함 |
| 승리/패배 감시 이벤트 자동 생성 | 주석만 있는 빈 껍데기 — 실제 판정 로직 없음 |
| 배치 스킵 제어 | TODO 주석만 있음 (SM.js L643) |
| 전투 목표 배너 | 전투 시작 시 "○○전 — 적을 전멸하라" 같은 목표 안내 없음 |

---

## 2. 설계 목표

**전투 흐름 정비:**
```
전투 시작 → 전투 목표 배너 → 배치 페이즈(기습 시 스킵) → 본 전투 → 승리/패배 배너 → 전투 종료
```

**스튜디오에서 설정 가능한 항목:**
1. 아군 배치 구역 (리전 페인팅)
2. 특수 구역/기믹 (점령 거점, 깃발, 탈출존, 스폰 포인트, 호위 목적지)
3. 승리/패배 조건 (7가지 전투 모드 + 커스텀 커먼이벤트)
4. 기습 설정
5. 배치 페이즈 활성화/비활성화

---

## 3. 구역 시스템 설계

### 3.1 리전 ID 예약 체계

현행 TerrainConfig 리전 배정 (1-10번대)과 충돌하지 않도록, SRPG 전투 구역은 **200번대**를 사용한다.

| 리전 ID | 용도 | 색상(맵 오버레이) |
|---------|------|------------------|
| 200 | 공용 배치 구역 | 파란색 반투명 |
| 201-208 | 팀 1~8 전용 배치 구역 | 팀 색상 반투명 |
| 210 | 점령 거점 (Capture Point) | 보라색 |
| 211 | 깃발 거점 (Flag Position) | 노란색 |
| 212 | 깃발 베이스 (Flag Return Base) | 주황색 |
| 220 | 탈출 구역 (Escape Zone) | 초록색 |
| 230 | 호위 목적지 (Escort Goal) | 분홍색 |
| 240-248 | 증원 스폰 포인트 (팀별) | 빨간색 계열 |

> **참고:** 기존 `<srpgCapPoint:x,y>` 같은 좌표 기반 노트태그는 하위 호환 유지. 리전 기반 구역이 있으면 리전 우선, 없으면 노트태그 좌표 폴백.

### 3.2 구역 페인팅 UI (RMMZStudio SRPG 탭)

현재 SRPG 탭 우측 패널에 "유닛 배치" 모드만 있다. 이를 **서브 탭**으로 분리:

```
┌──────────────────────────────────────┐
│  [유닛 배치]  [구역 설정]  [전투 설정] │
├──────────────────────────────────────┤
│                                      │
│  (서브 탭 내용)                        │
│                                      │
└──────────────────────────────────────┘
```

#### 3.2.1 "구역 설정" 서브 탭

구역 종류 드롭다운 + 팀 선택(배치 구역인 경우) + 브러시 크기:

```
구역 종류: [▼ 배치 구역 (공용)      ]
           ├─ 배치 구역 (공용)       → 리전 200
           ├─ 배치 구역 (팀 1 전용)  → 리전 201
           ├─ ...
           ├─ 점령 거점              → 리전 210
           ├─ 깃발 위치              → 리전 211
           ├─ 깃발 베이스            → 리전 212
           ├─ 탈출 구역              → 리전 220
           ├─ 호위 목적지            → 리전 230
           └─ 증원 스폰 (팀 2)      → 리전 242

브러시: [연필] [사각형] [지우개]

[구역 페인팅 시작]  ← 토글 버튼
```

- **동작 원리:** 기존 `지역` 탭(리전 에디터)과 동일한 페인팅 로직 공유. 선택한 구역 종류에 따라 리전 ID를 자동 배정.
- **맵 오버레이:** 구역 페인팅 모드일 때 해당 리전 ID 타일에 색상 오버레이 표시. 기존 `_drawRegionOverlay`를 확장하여 200번대 리전에 전용 색상·라벨 적용.
- **지우기:** 구역 타일을 지우면 해당 위치의 리전 ID를 0으로 되돌림.

#### 3.2.2 구역 오버레이 렌더링

맵 캔버스에서 SRPG 탭이 활성일 때 200번대 리전을 시각화:

```javascript
// 구역 색상 맵
const ZONE_COLORS = {
    200: 'rgba(60,120,255,0.3)',   // 공용 배치 — 파랑
    // 201-208: 팀별 배치 — 팀 색상 사용
    210: 'rgba(160,80,255,0.4)',   // 점령 — 보라
    211: 'rgba(255,220,40,0.4)',   // 깃발 — 노랑
    212: 'rgba(255,160,40,0.4)',   // 깃발 베이스 — 주황
    220: 'rgba(40,200,80,0.4)',    // 탈출 — 초록
    230: 'rgba(255,120,180,0.4)',  // 호위 목적지 — 분홍
    // 240-248: 증원 스폰 — 빨강 계열
};
```

각 구역 타일 위에 약어 라벨 표시: `배`, `점`, `깃`, `탈`, `호`, `증` 등.

---

## 4. 전투 설정 UI 개선

### 4.1 "전투 설정" 서브 탭 (맵 우측 패널)

현재 맵 속성 모달 안에 분산된 SRPG 설정을 **우측 패널 서브 탭**으로 이전/통합:

```
── 전투 모드 ──
[▼ 섬멸전 (annihilation)]

── 기습 설정 ──
( ) 기습 없음
( ) 아군 기습 (팀 1)
( ) 적군 기습 (팀 2)
( ) 커스텀 팀: [__]

── 배치 페이즈 ──
[✓] 배치 페이즈 활성화
    └ 비활성 시: 유닛이 초기 이벤트 위치에서 즉시 시작

── KO 정책 ──
[▼ 체력 회복 (recover)]

── 모드별 추가 설정 ──
(전투 모드에 따라 동적 표시)

  방어전:    방어 턴 수: [10]  방어 대상 이벤트: [__]
  도망전:    탈출 인원: [3]   턴 제한: [__]  (탈출 구역은 '구역 설정'에서 페인팅)
  점령전:    점령 수: [2]    필요 턴: [3]   (거점은 '구역 설정'에서 페인팅)
  깃발전:    (깃발·베이스는 '구역 설정'에서 페인팅)
  호위전:    호위 대상 이벤트: [__]  (목적지는 '구역 설정'에서 페인팅)
  지휘관전:  지휘관 이벤트: [__]

── 승리/패배 연출 ──
  승리 커먼이벤트: [▼ 없음]
  패배 커먼이벤트: [▼ 없음]

── 증원 웨이브 ──
  [+ 추가]
  턴 3: 적(고블린 전사) @ (12,8)  [×]
  턴 5: 적(개미귀 정찰병) @ 스폰존 팀2  [×]

── 팀 매트릭스 ──
  (기존 동맹/적대 토글 매트릭스 유지)
```

### 4.2 증원 스폰 방식 개선

현재: `<srpgSpawnWave:턴,적ID,x,y>` — 좌표 하드코딩  
개선: 두 가지 모드 지원

1. **좌표 지정**: 기존 방식 유지 (UI에서 맵 클릭으로 좌표 선택)
2. **스폰존 지정**: `<srpgSpawnWave:턴,적ID,zone,팀ID>` — 리전 240+팀ID 영역 내 빈 타일에 랜덤 배치

### 4.3 노트태그 확장

새로 추가되는 노트태그:

| 태그 | 용도 |
|------|------|
| `<srpgDeployEnabled:true/false>` | 배치 페이즈 활성화 여부 (기본 true) |
| `<srpgObjective:텍스트>` | 전투 목표 배너 텍스트 |
| `<srpgSpawnWave:턴,적ID,zone,팀ID>` | 스폰존 기반 증원 (기존 좌표 방식과 공존) |

기존 좌표 기반 노트태그 (`<srpgCapPoint:x,y>`, `<srpgFlag:x,y>` 등)는 **하위 호환 유지**. 리전 기반 구역이 있으면 리전이 우선.

---

## 5. 전투 흐름 정비 (SRPG_SM)

### 5.1 현행 흐름

```
startBattle → 유닛 수집 → applyAmbush → startBanner
  → (배치 or turnAdvance) → 본 전투 루프
  → BattleModeChecker.check() → victory/defeat → endBattle
```

### 5.2 개선 흐름

```
startBattle
  → 유닛 수집 + applyAmbush
  → parseMapNote → _battleModeParams 설정
  → ★ 목표 배너 (objectiveBanner)
      "○○전 — [목표 텍스트]"
  → ★ 배치 페이즈 판단
      if (_battleModeParams.deployEnabled === false) → 스킵
      else if (기습당한 팀이 플레이어) → 스킵
      else → deployment 페이즈 진입
  → turnAdvance → 본 전투 루프
  → BattleModeChecker.check() 매 턴 체크
  → victory/defeat 배너
  → ★ victoryEvent/defeatEvent 커먼이벤트 실행
  → endBattle
```

### 5.3 목표 배너 (objectiveBanner)

`_onBannerDone()`에서 `startBanner` → `objectiveBanner` → `deployment/turnAdvance` 순서로 전환:

```javascript
_onBannerDone() {
    if (this._subPhase === "startBanner") {
        // 전투 목표 배너로 전환
        const objective = this._battleModeParams.objective;
        if (objective) {
            this._subPhase = "objectiveBanner";
            this._bannerText = objective;
            this._bannerTimer = 120; // 2초
            return;
        }
        // 목표 없으면 바로 배치/전투
        this._enterDeployOrBattle();
    } else if (this._subPhase === "objectiveBanner") {
        this._enterDeployOrBattle();
    } else if (this._subPhase === "victory" || ...) { ... }
}

_enterDeployOrBattle() {
    const deployEnabled = this._battleModeParams.deployEnabled !== false;
    const ambushed = this._ambushTeam && !SrpgAlliance.isPlayerTeam(this._ambushTeam);
    if (deployEnabled && this._hasDeployableUnits() && !ambushed) {
        // 배치 페이즈 진입
        this._phase = "deployment";
        ...
    } else {
        this._phase = "turnAdvance";
    }
}
```

### 5.4 배치 스킵 제어

`<srpgDeployEnabled:false>` → `_battleModeParams.deployEnabled = false` → `_enterDeployOrBattle()`에서 배치 스킵.

### 5.5 리전 기반 구역 → BattleModeChecker 연동

`parseMapNote()` 확장: 맵 데이터에서 200번대 리전을 스캔하여 좌표 목록 자동 생성.

```javascript
// parseMapNote에 추가 — 리전 스캔으로 구역 자동 추출
_scanZoneRegions(mapData) {
    const zones = {
        deployShared: [],    // 리전 200
        deployTeam: {},      // 리전 201-208 → { teamId: [tiles] }
        capPoints: [],       // 리전 210
        flagPos: [],         // 리전 211
        flagBase: [],        // 리전 212
        escapeZone: [],      // 리전 220
        escortGoal: [],      // 리전 230
        spawnZone: {},       // 리전 240-248 → { teamId: [tiles] }
    };
    for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
            const rid = cycleRegionId(mapData, x, y);
            if (rid === 200) zones.deployShared.push({x,y});
            else if (rid >= 201 && rid <= 208) {
                const t = rid - 200;
                (zones.deployTeam[t] = zones.deployTeam[t] || []).push({x,y});
            }
            else if (rid === 210) zones.capPoints.push({x,y,owner:0,gauge:0});
            else if (rid === 211) zones.flagPos.push({x,y});
            else if (rid === 212) zones.flagBase.push({x,y});
            else if (rid === 220) zones.escapeZone.push({x,y});
            else if (rid === 230) zones.escortGoal.push({x,y});
            else if (rid >= 240 && rid <= 248) {
                const t = rid - 240;
                (zones.spawnZone[t] = zones.spawnZone[t] || []).push({x,y});
            }
        }
    }
    return zones;
}
```

이 스캔 결과를 `_battleModeParams`에 병합:
- `capPoints`: 리전 210 타일 → 좌표 노트태그 폴백
- `escapeRegion`: 리전 220 → `<srpgEscapeRegion>` 폴백
- 등등

### 5.6 증원 스폰존 처리

`_processSpawnWaves(turnNumber)` 수정:

```javascript
_processSpawnWaves(turn) {
    for (const wave of this._battleModeParams.spawnWaves) {
        if (wave.spawned || wave.turn !== turn) continue;
        let sx = wave.x, sy = wave.y;
        // 스폰존 모드: zone + teamId → 해당 리전 240+team 영역 내 빈 타일 랜덤
        if (wave.zone && wave.zoneTeam != null) {
            const candidates = this._battleModeParams._zones.spawnZone[wave.zoneTeam] || [];
            const free = candidates.filter(t => !SrpgGrid.isOccupied(t.x, t.y));
            if (free.length === 0) continue; // 빈 타일 없으면 스킵
            const pick = free[Math.floor(Math.random() * free.length)];
            sx = pick.x; sy = pick.y;
        }
        this._spawnUnit(wave.enemyId, sx, sy, wave.teamId || 2);
        wave.spawned = true;
    }
}
```

---

## 6. 승리/패배 감시 이벤트 개선

### 6.1 현행 문제

`_srpgAutoGenWinLose()`가 생성하는 이벤트는 주석만 있는 빈 껍데기:
```javascript
{ code: 355, parameters: ['// 승리/패배 조건은 BattleModeChecker가 자동 처리합니다.'] }
```

### 6.2 개선: 실제 판정 스크립트 삽입

BattleModeChecker는 이미 매 턴 SM에서 호출되므로, 자동 생성 이벤트에는 **연출 전용 커먼이벤트 호출**을 삽입:

```javascript
_srpgAutoGenWinLose() {
    // ... 기존 중복 체크 ...
    
    // 승리 연출 커먼이벤트 자동 생성 (CommonEvents에 추가)
    const ceVictory = this._getOrCreateCommonEvent('SRPG 승리 연출');
    const ceDefeat = this._getOrCreateCommonEvent('SRPG 패배 연출');
    
    // 맵 노트에 승리/패배 이벤트 ID 자동 등록
    let note = mapData.note || '';
    note = note.replace(/<srpg(VictoryEvent|DefeatEvent):[^>]*>/gi, '');
    note += '\n<srpgVictoryEvent:' + ceVictory.id + '>';
    note += '\n<srpgDefeatEvent:' + ceDefeat.id + '>';
    mapData.note = note.trim();
    
    UI._showNotice('승리/패배 커먼이벤트 자동 등록됨 (CE' + ceVictory.id + ', CE' + ceDefeat.id + ')');
}
```

커먼이벤트 내용:
- **승리**: 승리 ME 재생 → 메시지 "전투 승리!" → 화면 페이드아웃
- **패배**: 패배 ME 재생 → 메시지 "전투 패배..." → 게임오버 or 화면 전환

---

## 7. 구현 계획

### Phase 1: 백엔드 — SM 전투 흐름 정비
- `_enterDeployOrBattle()` 메서드 추출
- `objectiveBanner` 서브 페이즈 추가
- `<srpgDeployEnabled>` 노트태그 파서 + 배치 스킵 제어
- `<srpgObjective>` 노트태그 파서 + 목표 텍스트 표시

### Phase 2: 백엔드 — 리전 기반 구역 스캔
- `_scanZoneRegions()` 구현
- `parseMapNote()` 확장: 리전 스캔 결과를 `_battleModeParams`에 병합
- 점령/깃발/탈출/호위 모드에서 리전 기반 좌표 자동 추출
- 기존 노트태그 좌표와의 폴백 로직

### Phase 3: 백엔드 — 증원 스폰존 + 빌드
- `<srpgSpawnWave:턴,적ID,zone,팀ID>` 파서 추가
- `_processSpawnWaves()` 스폰존 모드 처리
- `python src/build.py` 빌드 + 구문 검증

### Phase 4: 스튜디오 UI — SRPG 탭 서브 탭 분리
- 우측 패널을 [유닛 배치] / [구역 설정] / [전투 설정] 3탭으로 분리
- 기존 유닛 배치 코드를 "유닛 배치" 탭으로 이동

### Phase 5: 스튜디오 UI — 구역 페인팅 도구
- 구역 종류 드롭다운 (리전 ID 자동 매핑)
- 연필/사각형/지우개 브러시 (기존 리전 에디터 로직 재활용)
- SRPG 탭 활성 시 200번대 리전 오버레이 렌더링 (색상 + 라벨)
- 구역 페인팅 결과가 Map JSON의 regionData에 직접 반영

### Phase 6: 스튜디오 UI — 전투 설정 패널 통합
- 전투 모드/기습/배치/KO 설정을 우측 패널 "전투 설정" 탭으로 이전
- 모드별 동적 파라미터 표시
- 증원 웨이브 목록 에디터 (추가/제거 + 맵 클릭 좌표 선택 or 스폰존 선택)
- 승리/패배 커먼이벤트 드롭다운

### Phase 7: 승리/패배 이벤트 자동 생성 개선 + 빌드
- `_srpgAutoGenWinLose()` 개선: 실제 커먼이벤트 생성
- 전체 빌드 + JS/JSON 잘림 점검 + 무결성 검증

---

## 8. 전투 모드별 구역 요약

| 전투 모드 | 필수 구역 | 선택 구역 |
|-----------|-----------|-----------|
| 섬멸전 | — | 배치 구역 |
| 지휘관전 | — | 배치 구역 |
| 호위전 | 호위 목적지(230) | 배치 구역 |
| 깃발전 | 깃발 위치(211) + 깃발 베이스(212) | 배치 구역 |
| 점령전 | 점령 거점(210) | 배치 구역 |
| 방어전 | — | 배치 구역, 증원 스폰(240+) |
| 도망전 | 탈출 구역(220) | 배치 구역 |

---

## 9. 리전 충돌 방지

TerrainConfig 리전 (1-10번대)과 SRPG 전투 구역 (200번대)은 완전히 분리:
- TerrainConfig: 1-10 (지형 효과, 엄폐, 수풀 등)
- SRPG 전투 구역: 200-248 (배치, 점령, 깃발, 탈출, 호위, 스폰)
- RMMZ 리전 최대값: 255

한 타일에 리전 ID는 하나만 가능하므로, **전투 구역 리전은 지형 리전과 겹칠 수 없다**. 이는 의도적 제약 — 예: 엄폐물 위에 배치 구역을 설정하려면, 엄폐물은 지형 태그(terrain tag)로 처리하고 리전은 배치 구역용으로 사용.

> 실제로 현행 시스템에서 엄폐/벽/수풀은 이미 terrain tag → region 이전이 완료되어 1-10번 리전을 사용 중이므로, 200번대와 겹칠 일이 없다. 단, 하나의 타일에 "엄폐(리전 5) + 배치 구역(리전 200)"은 불가능. 이 경우 배치 구역이 우선하며, 해당 타일의 엄폐 효과는 terrain tag로 부여해야 한다.

**대안:** 만약 리전 겹침이 빈번하게 필요하다면, 전투 구역을 리전 대신 **별도 레이어**(맵 JSON 확장 필드 `srpgZones: [{type, tiles: [...]}]`)로 관리하는 방안도 고려. 다만 이는 RMMZ 네이티브 에디터 호환성을 포기하는 것이므로, 현 단계에서는 리전 방식을 채택한다.
