# SRPG 원소/장판 시스템 — 단계별 구현 계획서

> 작성일: 2026-04-20  
> 설계 레퍼런스: SRPG_ELEMENT_PHASE_DESIGN.md, SRPG_FIELD_SYSTEM_DESIGN.md  
> 원칙: **RMMZ 네이티브 시스템을 최대한 활용**

> **구현 완료일: 2026-04-21**  
> 전 Phase(0~9) + UI(1~6) 구현 완료. 빌드 통과 (10,591 lines).  
> UI: 타일 렌더링, 턴오더 바, resolveOverlap 원소반응, 적AI 장판인식, 노트태그 가이드.

---

## 전체 개요

### 구현 원칙

1. **RMMZ States 활용**: 16개 커스텀 상태이상을 RMMZ 데이터베이스(States.json)에 직접 정의. Traits로 속성 내성/취약 관계 설정.
2. **RMMZ Elements 활용**: System.json 원소 배열에 독(ID 10) 추가. elementRate 시스템 그대로 활용.
3. **노트태그 확장**: 상태/스킬의 `<note>` 필드에 커스텀 태그 삽입 → 플러그인에서 파싱.
4. **기존 SrpgField 설계 계승**: SRPG_FIELD_SYSTEM_DESIGN.md의 생명주기/턴오더/시각 구조를 그대로 사용하되, 내부 데이터를 3계층 아키텍처로 교체.
5. **점진적 구현**: 데이터 → 로직 → UI 순서. 각 Phase 완료 후 빌드+검증.

### Phase 의존성 다이어그램

```
Phase 0 (RMMZ 데이터 세팅)
  │
  ├─ Phase 1 (상태이상 티어 시스템)
  │    └─ Phase 2 (언데드/부패)
  │
  ├─ Phase 3 (장판 코어 — 3계층)
  │    ├─ Phase 4 (원소 반응 엔진)
  │    │    └─ Phase 5 (장판 효과 + 부산물)
  │    │         └─ Phase 6 (구름 시스템)
  │    │
  │    └─ Phase 7 (SM/턴오더/UI 연동)
  │
  └─ Phase 8 (유닛 상태 + 원소 즉시 반응)
       │
       Phase 9 (통합 검증)
```

---

## Phase 0: RMMZ 데이터 기반 세팅

> 목표: 원소·상태이상 데이터를 RMMZ 네이티브 DB에 등록. 코드 변경 없이 에디터에서 확인 가능한 상태.

### 0-A. System.json — 독 원소 추가

```
현재: elements[0~9] = ["", "물리적", "불", "얼음", "천둥", "물", "흙", "바람", "빛", "어둠"]
추가: elements[10] = "독"
```

이후 원소 ID 매핑:

| ID | 이름 | 설계서 역할 |
|----|------|-------------|
| 1 | 물리 | 오버레이 해제자 |
| 2 | 불 | L1 Base 생성자 |
| 3 | 얼음 | L2 Overlay (Frozen) |
| 4 | 천둥 | L2 Overlay (Electrified) |
| 5 | 물 | L1 Base 생성자 |
| 6 | 흙 | L1 Base 생성자 |
| 7 | 바람 | 구름 촉매 |
| 8 | 빛 | L3 Modifier (Blessed) |
| 9 | 어둠 | L3 Modifier (Cursed) |
| 10 | 독 | L1 Base 생성자 |

### 0-B. States.json — 16개 커스텀 상태 생성

RMMZ의 상태 시스템을 최대한 활용: `traits`로 속성 내성/취약, `restriction`으로 행동제한, `autoRemovalTiming`으로 자동해제.

**ID 할당** (기존 1~30 사용 중, 31~46 사용):

| State ID | 이름 | 속성 | 티어 | RMMZ 설정 핵심 |
|----------|------|------|------|----------------|
| 31 | 온기 | 불 | T1 | autoRemoval=턴끝, 2턴. traits: 얼음내성↓(code11,id3,0.5) |
| 32 | 화상 | 불 | T2 | autoRemoval=턴끝, 3턴. traits: HP재생-10%(code22,id7,-0.10) |
| 33 | 젖음 | 물 | — | autoRemoval=턴끝, 3턴. traits: 불내성↑(code11,id2,1.5), 천둥취약(code11,id4,0.5), 얼음취약(code11,id3,0.5) |
| 34 | 한기 | 얼음 | T1 | autoRemoval=턴끝, 2턴. traits: AGI-20%(code22,id6,-0.2) |
| 35 | 동결 | 얼음 | T2 | autoRemoval=턴끝, 1턴. restriction=4(행동불가). removeByDamage=true |
| 36 | 대전 | 천둥 | T1 | autoRemoval=턴끝, 2턴. traits: HP재생-5%(code22,id7,-0.05) |
| 37 | 감전 | 천둥 | T2 | autoRemoval=턴끝, 1턴. restriction=4(행동불가). removeByDamage=true |
| 38 | 중독 | 독 | — | autoRemoval=턴끝, 3턴. traits: HP재생-8%(code22,id7,-0.08) |
| 39 | 유침 | 기름 | — | autoRemoval=턴끝, 3턴. traits: 불취약(code11,id2,0.5), AGI-30%(code22,id6,-0.3) |
| 40 | 출혈 | 물리 | — | autoRemoval=턴끝, 3턴. traits: HP재생-5%(code22,id7,-0.05) |
| 41 | 균열 | 흙 | — | autoRemoval=턴끝, 2턴. traits: AGI-10%(code22,id6,-0.1) |
| 42 | 풍압 | 바람 | — | autoRemoval=턴끝, 2턴. traits: HIT-20%(code22,id0,-0.2) |
| 43 | 여명 | 빛 | — | autoRemoval=턴끝, 3턴. traits: 어둠내성↑(code11,id9,2.0), HP재생+5%(code22,id7,0.05) |
| 44 | 그림자 | 어둠 | — | autoRemoval=턴끝, 3턴. traits: 빛취약(code11,id8,0.5), REC-30%(code23,id2,0.7) |
| 45 | 부패 | 어둠 | — | autoRemoval=턴끝, 2턴. note: `<srpgDecaying>` (치유→피해 전환은 코드로) |
| 46 | 속박 | 흙/웹 | — | autoRemoval=턴끝, 1턴. note: `<srpgImmobile>` (이동불가는 코드로) |

**Traits 코드 참조** (RMMZ 표준):
- code 11 = Element Rate (dataId=원소ID, value=배율. 0.5=취약, 2.0=내성)
- code 22 = Special Parameter (dataId: 0=HIT, 6=AGI, 7=HRG 등)
- code 23 = Ex-Parameter / Sp-Parameter
- restriction 4 = 행동불가

**노트태그로 확장할 커스텀 속성** (RMMZ Traits로 표현 불가한 것):

```
<srpgTier:1>            — 티어 등급 (1=T1, 2=T2)
<srpgTierElement:2>     — 티어 관련 속성 ID (불=2, 얼음=3, 천둥=4)
<srpgTierPair:32>       — T1→T2 승급 대상 State ID (온기→화상=32)
<srpgDecaying>          — 부패 상태 플래그
<srpgImmobile>          — 이동불가 플래그
<srpgFieldElement:fire>  — 장판 원소 타입 (기존 설계서)
<srpgFieldColor:#hex>   — 장판 시각 색상 (기존 설계서)
```

### 0-C. 상태 간 관계 노트태그 설정

```
State 31(온기):  <srpgTier:1><srpgTierElement:2><srpgTierPair:32>
State 32(화상):  <srpgTier:2><srpgTierElement:2>
State 33(젖음):  (노트태그 없음 — 취약은 Traits로 처리)
State 34(한기):  <srpgTier:1><srpgTierElement:3><srpgTierPair:35>
State 35(동결):  <srpgTier:2><srpgTierElement:3>
State 36(대전):  <srpgTier:1><srpgTierElement:4><srpgTierPair:37>
State 37(감전):  <srpgTier:2><srpgTierElement:4>
State 38(중독):  (기본 독 DoT)
State 39(유침):  (기본 둔화)
State 40(출혈):  <srpgBleedField> (이동 시 피 장판 생성)
State 41(균열):  (기본)
State 42(풍압):  (기본)
State 43(여명):  (기본)
State 44(그림자): (기본)
State 45(부패):  <srpgDecaying>
State 46(속박):  <srpgImmobile>
```

### 0-D. 검증 사항
- [x] System.json elements[10] = "독" 확인
- [x] States.json 31~46번 전부 유효한 JSON
- [x] RMMZ 에디터에서 상태 목록 정상 표시
- [x] 각 상태의 Traits가 의도대로 설정

---

## Phase 1: 상태이상 티어 시스템

> 목표: 온기→화상, 한기→동결, 대전→감전 승급 + 젖음 즉시 T2 로직. SRPG_Data.js 수정.

### 1-A. 노트태그 파서 추가

```javascript
// SRPG_Data.js — SrpgUnit 또는 전역 유틸
function parseStateMeta(stateId) {
    const state = $dataStates[stateId];
    if (!state || !state.note) return {};
    const meta = {};
    const m1 = state.note.match(/<srpgTier:(\d+)>/);
    if (m1) meta.tier = Number(m1[1]);
    const m2 = state.note.match(/<srpgTierElement:(\d+)>/);
    if (m2) meta.tierElement = Number(m2[1]);
    const m3 = state.note.match(/<srpgTierPair:(\d+)>/);
    if (m3) meta.tierPair = Number(m3[1]);
    if (state.note.includes('<srpgDecaying>')) meta.decaying = true;
    if (state.note.includes('<srpgImmobile>')) meta.immobile = true;
    if (state.note.includes('<srpgBleedField>')) meta.bleedField = true;
    return meta;
}
```

### 1-B. addState 확장 — 티어 승급

```javascript
// SrpgUnit.addState 확장 로직 (기존 addState 내부에 추가)
addState(stateId, turns) {
    // ... 기존 유효도 체크 ...
    
    // ★ 티어 승급 체크
    const incomingMeta = parseStateMeta(stateId);
    if (incomingMeta.tier === 1) {
        // 이미 같은 T1이 있으면 → T2로 승급
        if (this.hasState(stateId)) {
            const t2Id = incomingMeta.tierPair;
            if (t2Id) {
                this.removeState(stateId); // T1 제거
                this._addStateCore(t2Id, turns); // T2 부여
                return;
            }
        }
    }
    
    // ★ 젖음 + 얼음/천둥 → 즉시 T2
    if (incomingMeta.tier === 1 && incomingMeta.tierElement) {
        if (this.hasState(33)) { // 젖음 상태
            const t2Id = incomingMeta.tierPair;
            if (t2Id && (incomingMeta.tierElement === 3 || incomingMeta.tierElement === 4)) {
                this.removeState(33); // 젖음 해제
                this._addStateCore(t2Id, turns); // 즉시 T2
                return;
            }
        }
    }
    
    // 일반 부여
    this._addStateCore(stateId, turns);
}
```

### 1-C. T2 물리 해제

```javascript
// SrpgCombat 데미지 적용 후 T2 해제 체크
function checkT2BreakByPhysical(defender, element) {
    if (element !== 1) return; // 물리만
    // 동결(35), 감전(37) 체크
    for (const t2Id of [35, 37]) {
        if (defender.hasState(t2Id)) {
            defender.removeState(t2Id);
            // 추가 피해 (장착 무기 ATK의 50%)
            const bonusDmg = Math.floor(defender.mhp * 0.1);
            defender.hp = Math.max(0, defender.hp - bonusDmg);
        }
    }
}
```

### 1-D. 검증
- [x] 온기 상태에서 불 피격 → 화상 승급
- [x] 젖음 상태에서 얼음 피격 → T1 스킵, 즉시 동결
- [x] 동결 상태에서 물리 피격 → 동결 해제 + 추가피해
- [x] 빌드 통과

---

## Phase 2: 언데드/부패 시스템

> 목표: 치유→피해 전환 (부패), 독=치유 (언데드), 이중반전. SRPG_Data.js 수정.

### 2-A. 언데드 판별

RMMZ 네이티브 활용: 액터/적 노트태그 `<srpgUndead>` 또는 특성(Trait)으로 판별.

```javascript
// SrpgUnit
isUndead() {
    // 방법 1: 노트태그
    if (this._actorData && this._actorData.note.includes('<srpgUndead>')) return true;
    if (this._enemyData && this._enemyData.note.includes('<srpgUndead>')) return true;
    // 방법 2: 특정 상태 보유 (영구 언데드 상태)
    // if (this.hasState(UNDEAD_STATE_ID)) return true;
    return false;
}
```

### 2-B. heal() 확장

```javascript
heal(amount) {
    let finalAmount = amount;
    
    // 언데드: 치유→피해
    if (this.isUndead()) finalAmount = -Math.abs(amount);
    
    // 부패(State 45): 치유→피해 (언데드와 별개로 적용)
    if (this.hasState(45) && amount > 0) finalAmount = -Math.abs(amount);
    
    // 적용
    if (finalAmount >= 0) {
        this.hp = Math.min(this.mhp, this.hp + finalAmount);
    } else {
        this.hp = Math.max(0, this.hp + finalAmount); // 피해
    }
}
```

### 2-C. 독 피해 처리

```javascript
applyPoisonDamage(unit, amount) {
    if (unit.isUndead()) {
        if (unit.hasState(45)) { // 부패 + 언데드 = 이중반전 → 독도 피해
            unit.hp = Math.max(0, unit.hp - Math.abs(amount));
        } else {
            unit.heal(Math.abs(amount)); // 언데드: 독=치유
        }
    } else {
        unit.hp = Math.max(0, unit.hp - Math.abs(amount)); // 일반: 독=피해
    }
}
```

### 2-D. 검증
- [x] 부패 상태 유닛에 치유 → 피해 전환
- [x] 언데드 유닛에 치유 → 피해
- [x] 언데드 유닛에 독 → 치유
- [x] 부패+언데드에 독 → 피해 (이중반전)
- [x] 빌드 통과

---

## Phase 3: 장판 코어 — 3계층 아키텍처

> 목표: SrpgField를 3계층(Base×Overlay×Modifier)으로 재구축. 기존 SRPG_FIELD_SYSTEM_DESIGN.md의 생명주기 구조 계승.

### 3-A. 데이터 구조

```javascript
// SrpgSurface — 지면 장판 인스턴스
class SrpgSurface {
    constructor(config) {
        this.id = SrpgField._nextId++;
        this.baseType = config.baseType;    // "fire"|"water"|"blood"|"poison"|"oil"|"mud"|"web"|"lava"
        this.overlay = config.overlay || "none";     // "none"|"electrified"|"frozen"
        this.modifier = config.modifier || "normal"; // "normal"|"blessed"|"cursed"
        this.tiles = config.tiles;          // [{x,y}]
        this.tileSet = new Set(config.tiles.map(t => `${t.x},${t.y}`));
        this.duration = config.duration;
        this.maxDuration = config.duration;
        this.ownerId = config.ownerId;
        this.skillId = config.skillId || 0;
        
        // 턴오더 참가자 속성 (기존 설계 계승)
        this.ap = 0;
        this.agi = config.agi || 300;
        this.isField = true;
        this.isSurface = true;
        
        // 시각 (Phase 7에서 사용)
        this.opacity = 1.0;
    }
    
    // 이 장판의 현재 상태 ID 결정 (3계층 조합)
    getEffectStateId() {
        return SURFACE_STATE_TABLE[this.baseType][this.overlay][this.modifier];
    }
    
    // 이 장판이 액체인지
    isLiquid() {
        return ["water", "blood", "mud"].includes(this.baseType);
    }
    
    // 동결 가능한 액체인지 (진흙 제외)
    canFreeze() {
        return ["water", "blood"].includes(this.baseType);
    }
    
    // 전기 가능한 액체인지
    canElectrify() {
        return ["water", "blood", "mud"].includes(this.baseType);
    }
}

// SrpgCloud — 구름 인스턴스
class SrpgCloud {
    constructor(config) {
        this.id = SrpgField._nextId++;
        this.baseType = config.baseType;    // "steam"|"firecloud"|"poisoncloud"|"smoke"|...
        this.overlay = config.overlay || "none";     // "none"|"electrified"
        this.modifier = config.modifier || "normal";
        this.tiles = config.tiles;
        this.tileSet = new Set(config.tiles.map(t => `${t.x},${t.y}`));
        this.duration = config.duration;
        this.maxDuration = config.duration;
        this.ownerId = config.ownerId;
        
        this.ap = 0;
        this.agi = config.agi || 300;
        this.isField = true;
        this.isCloud = true;
        
        this.opacity = 1.0;
    }
}
```

### 3-B. SrpgField 확장

```javascript
const SrpgField = {
    _surfaces: [],   // 지면 장판
    _clouds: [],     // 구름
    _nextId: 1,
    
    // 생성
    createSurface(config) { ... },
    createCloud(config) { ... },
    
    // 조회
    getSurfaceAt(x, y) { ... },    // 해당 타일의 지면 장판
    getCloudAt(x, y) { ... },      // 해당 타일의 구름
    
    // 제거
    removeSurface(id) { ... },
    removeCloud(id) { ... },
    
    // 턴 처리 (기존 설계 계승)
    tickSurface(surface) { ... },  // duration--, 유닛에 효과 적용
    tickCloud(cloud) { ... },
    
    // 원소 반응 (Phase 4)
    applyElementToTile(x, y, elementId, casterId) { ... },
};
```

### 3-C. 장판 → 상태 매핑 테이블

RMMZ States를 참조하되, 3계층 조합에 따라 다른 효과를 선택:

```javascript
// 기본 진입 효과 → State ID
const BASE_ENTRY_STATES = {
    fire:   { state: 32, element: 2 },   // 화상
    water:  { state: 33, element: 5 },   // 젖음
    blood:  { state: null, element: 1 }, // 기본 효과 없음
    poison: { state: 38, element: 10 },  // 중독
    oil:    { state: 39, element: 0 },   // 유침
    mud:    { state: 46, element: 6 },   // 속박
    web:    { state: 46, element: 0 },   // 속박
    lava:   { state: 32, element: 2 },   // 화상 (강화)
};

// 오버레이 추가 효과
const OVERLAY_ENTRY_STATES = {
    electrified: { state: 37, element: 4 }, // 감전 (T2 직행)
    frozen:      { knockdown: true },        // 넘어짐 확률
};

// 변형자 효과 분기
// blessed → 아군에 버프, 적에 기본 디버프
// cursed → 효과 강화 + 부패(수면/피 계열)
```

### 3-D. 검증
- [x] SrpgSurface 인스턴스 생성/제거
- [x] 타일 기반 조회 동작
- [x] 장판 duration 감소 → 소멸
- [x] 빌드 통과

---

## Phase 4: 원소 반응 엔진

> 목표: 설계서 §8의 반응 매트릭스를 코드화. 4단계 처리 순서 구현.

### 4-A. 반응 처리 메인 함수

```javascript
// 설계서 §11의 applyElementToSurface 구현
SrpgField.applyElementToSurface = function(surface, elementId) {
    // 1. 저주 장판 → 빛/어둠 이외 거부
    if (surface.modifier === "cursed" && elementId !== 8 && elementId !== 9) {
        return null; // 반응 거부
    }
    
    // 2. L3: 빛(8)/어둠(9) → 변형자 전환만
    if (elementId === 8 || elementId === 9) {
        return this._switchModifier(surface, elementId);
    }
    
    // 3. L2: 천둥(4)/얼음(3) → 오버레이 (액체만)
    if (elementId === 4 || elementId === 3) {
        if (elementId === 4 && surface.canElectrify()) {
            return this._switchOverlay(surface, "electrified");
        }
        if (elementId === 3 && surface.canFreeze()) {
            return this._switchOverlay(surface, "frozen");
        }
        // 비액체에 대한 특수 반응 (얼음+화염→소멸 등) → L1 fallthrough
    }
    
    // 4. L1: 기반 타입 변환/소멸
    return this._transformBase(surface, elementId);
};
```

### 4-B. L3 변형자 전환

```javascript
_switchModifier(surface, elementId) {
    if (elementId === 8) { // 빛
        if (surface.modifier === "cursed") surface.modifier = "normal";
        else if (surface.modifier === "normal") surface.modifier = "blessed";
    }
    if (elementId === 9) { // 어둠
        if (surface.modifier === "blessed") surface.modifier = "normal";
        else if (surface.modifier === "normal") surface.modifier = "cursed";
    }
    return { type: "modifier_change", surface };
}
```

### 4-C. L2 오버레이 전환

```javascript
_switchOverlay(surface, newOverlay) {
    const old = surface.overlay;
    if (old === newOverlay) return null; // 이미 같음
    
    // 상호 배타: 감전↔동결 교체
    surface.overlay = newOverlay;
    return { type: "overlay_change", surface, oldOverlay: old };
}
```

### 4-D. L1 기반 변환 테이블

```javascript
// 설계서 §8-A 매트릭스를 데이터 테이블로
const BASE_REACTIONS = {
    // [기존base][공격element] → { action, resultBase?, byproduct? }
    fire: {
        5: { action: "destroy", byproduct: { type: "cloud", base: "steam" } },       // +물 → 소멸+수증기
        3: { action: "destroy", byproduct: { type: "cloud", base: "steam" } },       // +얼음 → 소멸+수증기
        6: { action: "none" },                                                         // +흙 → 무반응
        10:{ action: "explode", byproduct: { type: "surface", base: "fire" } },      // +독 → 폭발(화염유지)
        7: { action: "spread" },                                                       // +바람 → 확산
    },
    water: {
        2: { action: "destroy", byproduct: { type: "cloud", base: "steam" } },       // +불 → 수증기
        6: { action: "transform", resultBase: "mud" },                                // +흙 → 진흙
        7: { action: "spread" },                                                       // +바람 → 확산
    },
    blood: {
        2: { action: "destroy", byproduct: { type: "cloud", base: "steam" } },       // +불 → 수증기
    },
    poison: {
        2: { action: "explode_transform", resultBase: "fire",
             byproduct: { type: "cloud", base: "poisoncloud" } },                    // +불 → 폭발→화염+독구름
        5: { action: "destroy" },                                                      // +물 → 희석 소멸
        7: { action: "destroy", byproduct: { type: "cloud", base: "poisoncloud" } }, // +바람 → 독구름+소멸
    },
    oil: {
        2: { action: "explode_transform", resultBase: "fire",
             byproduct: { type: "cloud", base: "smoke" } },                          // +불 → 폭발→화염+연기
        5: { action: "transform", resultBase: "water" },                              // +물 → 수면 대체
    },
    mud: {
        2: { action: "transform", resultBase: "hardened" },                           // +불 → 경화
        5: { action: "transform", resultBase: "water" },                              // +물 → 수면(씻김)
        7: { action: "destroy", byproduct: { type: "cloud", base: "dust" } },        // +바람 → 먼지+소멸
    },
    web: {
        2: { action: "transform", resultBase: "fire" },                               // +불 → 화염(연소)
        5: { action: "destroy" },                                                      // +물 → 제거
    },
    lava: {
        5: { action: "transform", resultBase: "mud",
             byproduct: { type: "cloud", base: "smoke" } },                          // +물 → 진흙+연기
    },
};
```

### 4-E. 검증
- [x] 저주 장판에 불/물 → 거부 확인
- [x] 저주 장판에 빛 → Normal로 정화
- [x] 수면에 천둥 → 감전수 (overlay 변경)
- [x] 빙판에 천둥 → 감전수 (frozen→electrified)
- [x] 수면에 불 → 소멸 + 수증기 구름 생성
- [x] 독늪에 불 → 폭발 + 화염 + 독구름
- [x] 빌드 통과

---

## Phase 5: 장판 효과 + 부산물

> 목표: 장판 진입/체류 효과 적용, 축복/저주 분기, 소멸 시 구름 부산물 생성.

### 5-A. 진입 효과 시스템

```javascript
SrpgField.applyEntryEffect = function(surface, unit) {
    const base = BASE_ENTRY_STATES[surface.baseType];
    if (!base) return;
    
    // 기본 상태 부여
    if (base.state) {
        unit.addState(base.state, 999); // 장판 위 = 무한
    }
    
    // 오버레이 추가 효과
    if (surface.overlay === "electrified") {
        unit.addState(37, 2); // 감전
    }
    if (surface.overlay === "frozen") {
        // 넘어짐 확률 체크 (KD)
    }
    
    // 축복/저주 분기
    if (surface.modifier === "blessed") {
        this._applyBlessedEffect(surface, unit);
    } else if (surface.modifier === "cursed") {
        this._applyCursedEffect(surface, unit);
    }
};
```

### 5-B. 축복 아/적 구분

```javascript
_applyBlessedEffect(surface, unit) {
    const isAlly = (unit.teamId === surface.ownerTeamId);
    
    if (isAlly) {
        // 축복 = 아군에게 버프
        switch (surface.baseType) {
            case "fire":  unit.heal(hpPercent(5)); break;  // 성화: HP 치유
            case "water": unit.heal(hpPercent(3)); this._purifyDebuffs(unit); break; // 성수
            case "poison": /* Regeneration */ break;
            // ... 설계서 §5-A 참조
        }
    } else {
        // 적에게는 기본 디버프 유지
        this._applyNormalEffect(surface, unit);
    }
}
```

### 5-C. 부산물 생성 (설계서 §8-E)

```javascript
const BYPRODUCT_TABLE = {
    // [소멸조건] → 구름 타입
    "fire_extinguish": "steam",       // 화염 + 물/얼음 소화 → 수증기
    "fire_expire": "smoke",           // 화염 자연소멸 → 연기
    "water_evaporate": "steam",       // 수면/피 + 불 증발 → 수증기
    "oil_explode": "smoke",           // 기름 + 불 → 연기
    "poison_explode": "poisoncloud",  // 독늪 + 불 → 독구름
    "lava_cool": "smoke",             // 용암 + 물 → 연기
    "mud_wind": "dust",               // 진흙 + 바람 → 먼지
};
```

### 5-D. 검증
- [x] 수면 장판 위 유닛 → 젖음 상태 부여
- [x] 축복수면 위 아군 → HP 회복 + 디버프 정화
- [x] 축복수면 위 적 → 젖음 (기본 디버프)
- [x] 저주수 위 유닛 → 부패 부여
- [x] 화염 장판 + 물 소화 → 수증기 구름 생성
- [x] 빌드 통과

---

## Phase 6: 구름 시스템

> 목표: 구름 레이어 구현. 장판 위에 독립적으로 존재. 설계서 §8-D 반응.

### 6-A. 구름 특성

- 구름은 장판과 **같은 타일에 공존** 가능 (장판 = 지면, 구름 = 공중)
- 구름도 3계층(Base×Overlay×Modifier) 구조
- 구름의 Overlay는 `electrified`만 (Frozen 구름은 없음)
- 바람(7)은 구름 확산/제거의 주요 촉매

### 6-B. 구름+원소 반응 테이블

설계서 §8-D를 데이터화:

```javascript
const CLOUD_REACTIONS = {
    steam: {
        3: { action: "destroy" },                          // +얼음 → 응결소멸
        4: { action: "overlay", overlay: "electrified" },  // +천둥 → 감전증기
        7: { action: "destroy" },                          // +바람 → 흩뜨림
    },
    firecloud: {
        5: { action: "transform", resultBase: "steam" },   // +물 → 수증기
        3: { action: "transform", resultBase: "steam" },   // +얼음 → 수증기
        10:{ action: "explode" },                           // +독 → 폭발
    },
    poisoncloud: {
        2: { action: "explode_destroy" },                   // +불 → 폭발+소멸
        5: { action: "destroy" },                           // +물 → 가라앉힘
        7: { action: "spread" },                            // +바람 → 확산
    },
    // ... 나머지 §8-D 참조
};
```

### 6-C. 검증
- [x] 수증기에 천둥 → 감전증기
- [x] 독구름에 불 → 폭발+소멸
- [x] 바람에 의한 구름 확산/제거
- [x] 구름+장판 동시 존재 확인
- [x] 빌드 통과

---

## Phase 7: SM/턴오더/UI 연동

> 목표: 스킬 사용→장판 생성 트리거, 턴오더에 장판 등록, 시각 효과.

### 7-A. SM 연동 (SRPG_SM.js)

기존 SRPG_FIELD_SYSTEM_DESIGN.md §3의 생성 플로우 그대로:

```
스킬 사용 → 노트태그 감지 → SrpgField.createSurface() → 원소 반응 체크 → 턴오더 등록
```

확장: 스킬 노트태그에 3계층 정보 추가

```
<srpgSurface:baseType,duration>
<srpgSurfaceModifier:blessed>    // 선택적 — 기본값 normal
<srpgCloud:baseType,duration>     // 구름 생성 스킬
```

### 7-B. 턴 오더 연동 (기존 설계 계승)

- _surfaces, _clouds를 AP 참가자로 통합
- 장판 턴: duration 감소 + 유닛 효과 재적용 + 소멸 체크

### 7-C. UI (SRPG_UI.js)

- 장판 바닥 스프라이트 (z-order: Tilemap 위, 캐릭터 아래)
- 구름 스프라이트 (z-order: 캐릭터 위)
- 투명도 페이드 (duration 기반)
- 턴 오더 바: 장판/구름 슬롯 (60% 크기)
- 축복=금빛 테두리, 저주=보라빛 테두리, 감전=번개 이펙트, 동결=얼음 결정

### 7-D. 검증
- [x] 불 스킬 → 화염 장판 생성
- [x] 화염 장판 위에 물 스킬 → 소멸 + 수증기 구름
- [x] 장판이 턴 오더 바에 표시
- [x] 장판 위 유닛에 수풀 효과
- [x] 빌드 통과

---

## Phase 8: 유닛 상태 + 원소 즉시 반응

> 목표: 설계서 §8-F. 유닛의 기존 상태이상이 원소 피격에 의해 즉시 반응.

### 8-A. 반응 테이블

```javascript
// [현재상태ID][피격원소ID] → { action, ... }
const UNIT_STATE_REACTIONS = {
    33: { // 젖음
        2: { remove: 33, byproduct: "steam" },              // +불 → 해제+수증기
        3: { remove: 33, apply: 35 },                        // +얼음 → 동결(T2 직행)
        4: { remove: 33, apply: 37 },                        // +천둥 → 감전(T2 직행)
    },
    31: { // 온기
        2: { remove: 31, apply: 32 },                        // +불 → 화상(T1→T2)
        5: { remove: 31 },                                    // +물 → 해제
        3: { remove: 31 },                                    // +얼음 → 해제
    },
    32: { // 화상
        5: { remove: 32, byproduct: "smoke" },               // +물 → 해제+연기
        3: { remove: 32 },                                    // +얼음 → 해제
        7: { extendDuration: true },                          // +바람 → 지속연장
    },
    34: { // 한기
        2: { remove: 34 },                                    // +불 → 해제
        3: { remove: 34, apply: 35 },                         // +얼음 → 동결(T1→T2)
    },
    35: { // 동결
        2: { remove: 35, createSurface: "water" },           // +불 → 해제→수면(장판)
    },
    36: { // 대전
        5: { remove: 36, apply: 37 },                         // +물 → 감전(T1→T2)
        4: { remove: 36, apply: 37 },                         // +천둥 → 감전(T1→T2)
        7: { remove: 36, spreadToAdjacent: true },            // +바람 → 해제+주변확산
    },
    39: { // 유침
        2: { remove: 39, apply: 32 },                         // +불 → 화상+소멸
        4: { remove: 39, spark: true },                       // +천둥 → 스파크+소멸
    },
    38: { // 중독
        2: { remove: 38, apply: 32 },                         // +불 → 화상(독에 불붙음)
    },
};
```

### 8-B. 빛/어둠 상태 반응

```javascript
const LIGHT_DARK_REACTIONS = {
    44: { 8: { remove: 44 } },           // 그림자 + 빛 → 해제
    43: { 9: { remove: 43 } },           // 여명 + 어둠 → 해제
    45: { 8: { remove: 45 } },           // 부패 + 빛 → 해제(정화)
    // 상태 없음 + 빛 → 여명(43) 부여, + 어둠 → 그림자(44) 부여
};
```

### 8-C. SrpgCombat 연동

```javascript
// 데미지 적용 직후, 피격 원소에 따라 유닛 상태 즉시 반응 체크
function checkUnitStateReactions(defender, elementId) {
    for (const stateId of defender.currentStateIds()) {
        const reactions = UNIT_STATE_REACTIONS[stateId];
        if (reactions && reactions[elementId]) {
            executeStateReaction(defender, stateId, reactions[elementId]);
        }
    }
}
```

### 8-D. 검증
- [x] 젖음 유닛에 불 → 젖음 해제 + 수증기
- [x] 유침 유닛에 불 → 화상 승급 + 유침 해제
- [x] 동결 유닛에 불 → 동결 해제 + 발밑 수면 장판
- [x] 대전 유닛에 바람 → 대전 해제 + 인접 유닛 확산
- [x] 빛 스킬 → 부패 정화, 여명 부여
- [x] 빌드 통과

---

## Phase 9: 통합 검증

> 목표: 전체 시스템 통합 테스트. 설계서 §10의 시나리오 재현.

### 9-A. 시나리오 테스트

1. **기름+불+독 연쇄**: 기름 → 불 → 폭발+화염+연기 → 인접 독늪 → 폭발+화염+독구름
2. **물→천둥→얼음**: 수면 생성 → 천둥 → 감전수 → 얼음 → 빙판
3. **어둠→부패→빛**: 수면+어둠 → 저주수 → 적 진입(부패) → 빛 → 정화 → 수면
4. **업화 2단계 해제**: 업화+물 → 거부. 업화+빛 → 화염. 화염+물 → 소멸+수증기
5. **언데드 역이용**: 독늪 위 언데드 HP회복 → 빛 → 축복독늪 → 언데드에 재생=피해

### 9-B. 엣지 케이스

- 용암에 모든 원소 → 물만 반응 (진흙+연기)
- 거미줄+불 → 화염 전환 후 화염의 변형자 = 거미줄의 변형자 계승?
- 복수 장판 중첩 (조합 불가 시 후발우선)
- 장판 + 구름 동시 존재 + 원소 피격 → 둘 다 반응

### 9-C. 빌드 체크리스트
- [x] python src/build.py 성공
- [x] 구문 오류 없음
- [x] 전 Phase 기능 동작
- [x] 설계서와 코드 불일치 없음

---

## 부록: RMMZ 네이티브 시스템 활용 정리

| 기능 | RMMZ 네이티브 | 커스텀 확장 |
|------|---------------|-------------|
| 원소 배율 | Trait code 11 (elementRate) | — |
| 상태 내성 | Trait code 13 (stateRate) | — |
| HP 재생/DoT | Trait code 22, dataId 7 (HRG) | — |
| 행동 제한 | restriction 4 (행동불가) | — |
| 피격 해제 | removeByDamage = true | — |
| 자동 해제 | autoRemovalTiming + minTurns/maxTurns | — |
| 속성 취약/내성 | Trait code 11 (element rate) | — |
| 티어 승급 | — | 노트태그 `<srpgTier>` + 커스텀 로직 |
| 부패/치유반전 | — | 노트태그 `<srpgDecaying>` + heal() 훅 |
| 언데드 | — | 노트태그 `<srpgUndead>` |
| 이동불가 | — | 노트태그 `<srpgImmobile>` + 이동 체크 훅 |
| 장판 원소 | — | 노트태그 `<srpgFieldElement>` |
| 장판 3계층 | — | SrpgSurface 클래스 |
| 원소 반응 | — | 반응 테이블 + 처리 엔진 |

---

*다음 단계: Phase 0 실행 — System.json, States.json 데이터 세팅*
