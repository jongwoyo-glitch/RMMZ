# SRPG 장판(Field Zone) 시스템 + 아이템 스킬 시전 설계서

> 작성일: 2026-04-19
> 대상 파일: SRPG_Data.js (SrpgField), SRPG_SM.js, SRPG_UI.js

---

## 목차

1. [장판 시스템 개요](#1-장판-시스템-개요)
2. [데이터 구조](#2-데이터-구조)
3. [장판 생명주기](#3-장판-생명주기)
4. [턴 오더 연동](#4-턴-오더-연동)
5. [상태이상 부여/해제 로직](#5-상태이상-부여해제-로직)
6. [시각 표현](#6-시각-표현)
7. [장판 조합 (Divinity 2식)](#7-장판-조합-divinity-2식)
8. [아이템 → 스킬 시전](#8-아이템--스킬-시전)
9. [노트태그 레퍼런스](#9-노트태그-레퍼런스)
10. [구현 순서 및 의존성](#10-구현-순서-및-의존성)

---

## 1. 장판 시스템 개요

### 1.1 설계 의도
스킬/아이템으로 그리드 위에 지속성 영역(장판)을 생성. 장판 위의 유닛에게 상태이상을 부여하고, 턴 오더에서 독립적으로 지속시간을 관리한다.

### 1.2 핵심 규칙

- **생성**: 장판 스킬 사용 시, 스킬의 범위(reach+area) 영역에 장판 생성
- **효과**: 장판 위에 있는 동안 해당 상태이상 **상시 부여** (매 턴 갱신)
- **해제**: 장판 밖으로 나가면 상태이상의 **자체 턴 카운트**가 소진될 때까지 유지
- **소멸**: 지속턴이 다하면 장판 페이드아웃 후 제거
- **턴 오더**: 장판도 AP 기반 턴 참가자 (다른 유닛보다 작은 아이콘)
- **장판 조합**: 특정 원소 조합 시 새로운 장판으로 변환 (Divinity 2식)
- **비조합 중첩**: 조합 규칙에 없으면 후발 우선 (기존 장판 제거)

---

## 2. 데이터 구조

### 2.1 SrpgField 객체

```javascript
const SrpgField = {
    _fields: [],     // 활성 장판 목록
    _nextId: 1,      // 장판 고유 ID 시퀀스
    _mixTable: {},    // 조합 테이블 { "fire+water": { ... } }

    // 장판 인스턴스 구조
    // {
    //     id: Number,           // 고유 ID
    //     stateId: Number,      // 부여할 상태이상 ID
    //     element: String,      // 원소 타입 ("fire","water","ice","poison","oil","lightning","steam",...)
    //     tiles: [{x,y}],       // 점유 타일 목록 (절대 좌표)
    //     tileSet: Set,         // "x,y" 문자열 Set (빠른 조회)
    //     duration: Number,     // 남은 턴 수
    //     maxDuration: Number,  // 최대 턴 수 (페이드 계산용)
    //     owner: SrpgUnit,      // 생성자 (아군/적 판별용)
    //     skillId: Number,      // 원본 스킬 ID
    //     color: Number,        // 오버레이 색상 (0xRRGGBB)
    //     imageName: String,    // 바닥 이미지 파일명 (img/srpg/ 폴더)
    //     ap: Number,           // 현재 AP (턴 오더용)
    //     agi: Number,          // AP 누적 속도 (기본: 300, 유닛보다 느림)
    //     opacity: Number,      // 현재 투명도 (0.0~1.0)
    //     bushEffect: Boolean,  // 수풀 효과 적용 여부 (기본 true)
    // }
};
```

### 2.2 노트태그 소스

**스킬 노트태그** — 장판 생성 파라미터:
```
<srpgField:stateId,duration>
<srpgFieldAgi:300>             // AP 누적 속도 (기본 300)
<srpgFieldBush:false>          // 수풀 효과 끄기 (기본 true)
```

**상태이상 노트태그** — 시각/원소 속성:
```
<srpgFieldElement:fire>        // 원소 타입 (조합 키)
<srpgFieldColor:#FF4400>       // 오버레이 색상
<srpgFieldImage:FireField>     // 바닥 이미지 (img/srpg/)
```

예시:
```
스킬 "화염진": <srpgField:15,4>
  → 상태 15번을 4턴간 부여하는 장판 생성

상태 15 "화상 지대": 
  <srpgFieldElement:fire>
  <srpgFieldColor:#FF4400>
  <srpgFieldImage:FireField>
```

---

## 3. 장판 생명주기

### 3.1 생성 플로우

```
스킬 사용 (투척/원거리)
  ↓
SrpgCombat.execute() 또는 SM._executeCombat()
  ↓
장판 노트태그 감지: <srpgField:stateId,duration>
  ↓
SrpgField.create(caster, skillId, targetTiles)
  ↓
  1. 타겟 타일에 기존 장판 있는지 확인
     → 조합 가능? → SrpgField._tryMix() → 새 장판으로 대체
     → 조합 불가? → 기존 장판 제거 (후발 우선)
  2. 장판 인스턴스 생성, _fields에 추가
  3. 바닥 스프라이트 생성 (UI 레이어)
  4. 턴 오더에 등록 (AP 초기값: 0)
  5. 장판 위 유닛에 즉시 상태 부여
```

### 3.2 턴 진행 (장판의 턴)

```
장판 AP >= AP_THRESHOLD → 장판의 "턴"
  ↓
  1. duration-- (남은 턴 감소)
  2. opacity 재계산: duration / maxDuration
  3. 장판 위 유닛 스캔 → 상태이상 재적용 (턴 갱신)
  4. duration === 0? → 장판 제거
  5. AP -= AP_THRESHOLD
```

### 3.3 소멸 플로우

```
duration === 0 (또는 dispel/purge로 강제 제거)
  ↓
  1. 바닥 스프라이트 페이드아웃 (opacity → 0, 30프레임)
  2. 턴 오더에서 제거
  3. _fields 배열에서 삭제
  4. 장판 위 유닛의 상태: 해당 상태의 자체 턴 카운트 유지 (즉시 제거 안 함)
```

---

## 4. 턴 오더 연동

### 4.1 장판 as 턴 참가자

장판은 유닛과 동일한 AP 시스템을 공유하되, 구분을 위한 플래그를 갖는다:
- `isField: true` — 장판 여부
- `agi`: 기본 300 (유닛 평균 AGI 500~800 대비 느림 → 유닛 사이에 가끔 끼어듦)
- 턴 오더 바에서 **유닛 원형의 60% 크기**로 표시
- 원소 색상으로 원형 채움, 중앙에 원소 아이콘 또는 상태 아이콘

### 4.2 SrpgTurnOrder 수정

`advanceToNextTurn()` 과 `predictTurns()` 에서 _units + _fields 를 통합 검색:

```javascript
// 기존: const alive = SM._units.filter(u => u.isAlive() && !u.isObject);
// 변경: 장판도 포함
const participants = [
    ...SM._units.filter(u => u.isAlive() && !u.isObject),
    ...SrpgField._fields  // 장판도 AP 참가자
];
```

장판의 "턴"이 오면 SM이 자동 처리 (UI 상호작용 없음):
1. 장판 효과 적용 (상태 갱신)
2. duration 감소
3. 자동으로 다음 턴 진행

### 4.3 턴 오더 UI (SRPG_UI.js)

```javascript
// 장판 슬롯 판별
const isFieldSlot = (participant) => participant.isField === true;

// 크기 조정
const r = isCurrent ? CIRC_R_CUR
    : isFieldSlot(unit) ? Math.round(CIRC_R * 0.6)  // 장판: 60% 크기
    : CIRC_R;

// 장판 슬롯 색상: 원소 색상
// 장판 슬롯 내부: 상태 아이콘 또는 원소 심볼
```

---

## 5. 상태이상 부여/해제 로직

### 5.1 장판 위 진입/체류

```
유닛이 타일(x,y)에 도착 (이동 완료 / 턴 시작)
  ↓
SrpgField.getFieldsAt(x, y) → 해당 위치 장판 목록
  ↓
각 장판의 stateId를 유닛에 addState(stateId, 999)
  → turns=999: 장판 위에 있는 동안은 사실상 무한 지속
  → _fieldAppliedStates[unitId] 에 { stateId, fieldId } 기록
```

### 5.2 장판 밖으로 이탈

```
유닛 이동 완료 후 SrpgField.checkUnitFieldStatus(unit)
  ↓
이전에 부여된 _fieldAppliedStates 순회
  ↓
유닛 현재 위치가 해당 장판 tiles에 없으면:
  → 상태의 remainingTurns를 상태 자체의 기본 턴(minTurns~maxTurns)으로 재설정
  → _fieldAppliedStates에서 제거
  → 이후 상태의 자체 턴 카운트로 소진
```

### 5.3 장판의 턴 (상태 갱신)

```
장판 턴 도래 시:
  ↓
장판 tiles 위의 모든 유닛 스캔
  ↓
각 유닛에 addState(stateId, 999) — 턴 카운트 리프레시
  → 이미 있으면 remainingTurns만 999로 리셋
```

### 5.4 특수 케이스

- **유닛이 장판 위에서 사망**: 상태는 자연 소멸 (사망 유닛 무시)
- **장판이 소멸되었는데 유닛이 위에 있었음**: 상태 turns를 기본값으로 재설정
- **복수 장판 중첩** (조합 결과로): 모든 장판의 상태를 동시 부여

---

## 6. 시각 표현

### 6.1 바닥 이미지 레이어

```
z-order (아래→위):
  1. Tilemap (지형)
  2. ★ 장판 바닥 이미지 ← 여기
  3. 그리드 오버레이 (이동/공격 범위)
  4. 캐릭터 스프라이트
  5. 이펙트/팝업
  6. UI (메뉴, HUD, 턴 오더)
```

- PIXI.Sprite 또는 PIXI.TilingSprite로 구현
- 이미지 소스: `img/srpg/{imageName}.png`
- 이미지가 장판의 전체 타일 영역을 커버 (중심 기준 스케일)
- **원형 장판** 전제: 스킬 area 해석 결과 타일 목록의 바운딩 사각형 계산 → 이미지 스케일

### 6.2 투명도 페이드

```javascript
// 매 프레임 업데이트
field.opacity = field.duration / field.maxDuration;
// 최소 투명도 제한 (완전히 보이지 않게 되기 직전까지)
field.opacity = Math.max(0.15, field.opacity);
// 마지막 턴(duration===1)에서 0으로 서서히 소멸
if (field.duration <= 0) {
    // 30프레임에 걸쳐 0.15 → 0 페이드아웃
}
```

턴이 줄어들수록 장판이 점점 투명해져서 곧 사라질 것임을 시각적으로 전달.

### 6.3 수풀(Bush) 효과

RMMZ 수풀 효과: 캐릭터 스프라이트 하반부가 반투명이 되어 "잠겨있는" 느낌.

```javascript
// Game_CharacterBase.prototype.refreshBushDepth 오버라이드
// 원래: $gameMap.isBush(this.x, this.y) 체크
// 확장: SrpgField.hasBushFieldAt(x, y) 도 체크

const _orig_refreshBush = Game_CharacterBase.prototype.refreshBushDepth;
Game_CharacterBase.prototype.refreshBushDepth = function() {
    _orig_refreshBush.call(this);
    // SRPG 장판 수풀 효과 추가
    if (SrpgField && SrpgField.hasBushFieldAt(this.x, this.y)) {
        this._bushDepth = 12;  // 기본 수풀 깊이
    }
};
```

이렇게 하면 장판 위 유닛은 자동으로 하반신이 반투명 → "장판 안에 잠겨 있는" 비주얼.

### 6.4 장판 생성 시 연출

1. 스킬 애니메이션 정상 재생 (투사체 포함)
2. 착탄 후 바닥 이미지가 opacity 0 → targetOpacity로 페이드인 (20프레임)
3. 생성 SE 재생 (기본: "Fire3" 또는 커스텀)

---

## 7. 장판 조합 (Divinity 2식)

### 7.1 조합 테이블

```javascript
// SrpgField._mixTable
// key: "원소A+원소B" (알파벳순 정렬하여 키 생성)
// value: { resultElement, resultStateId, resultImage, resultColor, durationMod }
const DEFAULT_MIX_TABLE = {
    "fire+poison":    { result: "explosion",  stateId: 20, duration: 1, image: "Explosion", color: 0xFF6600 },
    "fire+oil":       { result: "inferno",    stateId: 21, duration: 3, image: "Inferno",   color: 0xFF2200 },
    "fire+water":     { result: "steam",      stateId: 22, duration: 2, image: "Steam",     color: 0xCCCCCC },
    "fire+ice":       { result: "water",      stateId: 23, duration: 2, image: "WaterField",color: 0x4488FF },
    "ice+water":      { result: "frozen",     stateId: 24, duration: 3, image: "Frozen",    color: 0xAADDFF },
    "lightning+water": { result: "electrified",stateId: 25, duration: 2, image: "Electro",  color: 0xFFFF44 },
    "oil+poison":     { result: "toxic_oil",  stateId: 26, duration: 3, image: "ToxicOil",  color: 0x886600 },
};
```

### 7.2 조합 로직

```
새 장판 생성 시, 같은 타일에 기존 장판이 있으면:
  ↓
기존 장판의 element + 새 장판의 element → mixKey 생성
  (알파벳순: "fire+water", not "water+fire")
  ↓
_mixTable[mixKey] 존재?
  → YES: 기존 장판 제거, 새 장판도 제거, 조합 결과 장판 생성
         조합 결과 범위 = 두 장판의 합집합(union)
         조합 결과 duration = mixTable.duration (또는 max(두 장판 잔여턴))
  → NO:  기존 장판 제거 (후발 우선), 새 장판만 생성
```

### 7.3 조합 테이블 커스터마이징

플러그인 파라미터 또는 게임 데이터로 조합 테이블을 확장/수정 가능:

```
플러그인 파라미터:
FieldMixRules: [
    "fire+poison=explosion,20,1,Explosion,#FF6600",
    "fire+water=steam,22,2,Steam,#CCCCCC",
    ...
]
```

### 7.4 연쇄 반응

조합 결과로 생긴 장판이 또 다른 기존 장판과 중첩될 경우:
- **1회만 조합** (무한 연쇄 방지)
- 조합 결과 장판이 기존 장판과 또 겹치면 → 후발 우선 (기존 제거)

---

## 8. 아이템 → 스킬 시전

### 8.1 설계 의도

투척형 아이템(수류탄, 물약병, 기름통 등)으로 범위 스킬을 시전. 
아이템을 소비하면서 해당 스킬의 타겟팅/범위/투사체 시스템을 그대로 사용.

### 8.2 노트태그

```
아이템 노트태그:
<srpgSkill:skillId>           // 이 아이템 사용 시 해당 스킬 발동
```

예시:
```
아이템 "화염병": <srpgSkill:45>
  → 사용 시 스킬 45번("화염진") 발동
  → 스킬 45의 reach/area/projectile/field 전부 적용
  → 아이템 1개 소비
```

### 8.3 SM 플로우

```
보조 행동 메뉴 > "아이템 사용" 선택
  ↓
아이템 목록 표시 (인벤토리에서 <srpgSkill> 태그 있는 아이템 필터)
  ↓
아이템 선택
  ↓
<srpgSkill:skillId> 파싱 → _pendingSkill = $dataSkills[skillId]
  ↓
기존 스킬 타겟팅 플로우 진입 (selectTarget)
  → reach/area 범위 표시
  → 타겟 확정
  ↓
_executeCombat() (또는 장판 생성)
  ↓
아이템 소비: party.loseItem(item, 1)
```

### 8.4 단일 대상 아이템

`<srpgSkill>` 태그가 없는 기존 아이템은 현행대로 처리:
- 자기 자신 또는 인접 아군에게 사용
- 기존 보조 행동 "아이템 사용" 로직 유지

---

## 9. 노트태그 레퍼런스

### 스킬 노트태그

| 태그 | 설명 | 예시 |
|------|------|------|
| `<srpgField:stateId,duration>` | 장판 생성 (상태ID, 지속턴) | `<srpgField:15,4>` |
| `<srpgFieldAgi:N>` | 장판 AP 속도 (기본 300) | `<srpgFieldAgi:500>` |
| `<srpgFieldBush:false>` | 수풀 효과 비활성화 | `<srpgFieldBush:false>` |

### 상태이상 노트태그

| 태그 | 설명 | 예시 |
|------|------|------|
| `<srpgFieldElement:type>` | 원소 타입 (조합 키) | `<srpgFieldElement:fire>` |
| `<srpgFieldColor:#hex>` | 오버레이 색상 | `<srpgFieldColor:#FF4400>` |
| `<srpgFieldImage:name>` | 바닥 이미지 (img/srpg/) | `<srpgFieldImage:FireField>` |

### 아이템 노트태그

| 태그 | 설명 | 예시 |
|------|------|------|
| `<srpgSkill:skillId>` | 아이템 사용 시 스킬 발동 | `<srpgSkill:45>` |

### 플러그인 파라미터 (장판 조합)

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `FieldMixRules` | 조합 규칙 배열 | `"fire+water=steam,22,2,Steam,#CCC"` |
| `FieldDefaultAgi` | 기본 장판 AGI | `300` |
| `FieldBushDepth` | 수풀 깊이 (px) | `12` |

---

## 10. 구현 순서 및 의존성

### Phase 1: SrpgField 코어 (SRPG_Data.js)
- SrpgField 객체: create, remove, getFieldsAt, hasBushFieldAt
- 노트태그 파싱: parseFieldMeta (스킬), parseFieldVisual (상태)
- _fieldAppliedStates 관리: applyFieldStates, checkUnitFieldStatus
- 기본 생명주기: duration 감소, 소멸

### Phase 2: 턴 오더 연동 (SRPG_Data.js + SRPG_SM.js)
- SrpgTurnOrder: 장판을 AP 참가자로 통합
- SM: 장판 턴 자동 처리 (advanceToNextTurn에서 장판이면 tick+skip)
- 장판 소멸 시 턴 오더에서 제거

### Phase 3: 시각 효과 (SRPG_UI.js)
- 장판 바닥 스프라이트 레이어 (Tilemap 위, 캐릭터 아래)
- 투명도 페이드 (duration 기반)
- 생성/소멸 페이드 애니메이션
- 턴 오더 바: 장판 슬롯 (60% 크기, 원소 색상)

### Phase 4: 수풀 효과 (SRPG_Data.js)
- Game_CharacterBase.refreshBushDepth 오버라이드
- SrpgField.hasBushFieldAt() 연동

### Phase 5: 장판 조합 (SRPG_Data.js)
- _mixTable 초기화 (플러그인 파라미터 + 기본값)
- _tryMix() 로직
- 조합 결과 장판 생성 + 범위 union

### Phase 6: 아이템→스킬 시전 (SRPG_SM.js)
- 보조 행동 아이템 목록에서 srpgSkill 필터
- 아이템 선택 → 스킬 타겟팅 플로우 진입
- 스킬 실행 후 아이템 소비

### Phase 7: SM 연동 — 장판 생성 트리거
- _executeCombat / _enemyShowAction에서 장판 스킬 감지
- 스킬 area 타일 계산 → SrpgField.create() 호출
- 이동 완료 콜백에 장판 상태 체크 추가

### Phase 8: 통합 검증
- 빌드, 구문 검증
- 전투 플로우: 장판 생성 → 턴 진행 → 상태 부여 → 이탈 → 소멸
- 조합 테스트: fire + water = steam
- 아이템 스킬: 화염병 → 장판 생성
- 턴 오더 UI: 장판 슬롯 표시

### 의존성

```
Phase 1 (코어)
  ├─ Phase 2 (턴 오더)
  ├─ Phase 3 (시각)
  │    └─ Phase 4 (수풀)
  ├─ Phase 5 (조합)
  └─ Phase 7 (SM 연동)
       └─ Phase 6 (아이템)
Phase 8 (통합)
```
