# SRPG 통행·고저차 시스템 개선 설계서

> 작성일: 2026-04-21
> 대상 파일: SRPG_Data.js (SrpgGrid, SrpgCombat), SRPG_SM.js

---

## 1. 현황 진단

### 1-A. 통행 판정 문제

현재 `SrpgGrid.isPassable`은 RMMZ의 4방향 통행을 **OR 결합**으로만 사용한다:

```javascript
// 현재 — "어느 방향이든 하나라도 열려있으면 통과 가능"
isPassable(x, y) {
    return $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) ||
           $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8);
}
```

RMMZ 타일셋에서 설정하는 **방향별 통행 제한** (예: 울타리 위쪽만 통과 불가, 절벽 아래쪽만 진입 불가)이 BFS 경로탐색에 반영되지 않는다. 게다가 BFS 이웃 확장 시 **이동 방향**도 체크하지 않아, "현재 타일에서 해당 방향으로 나갈 수 있는가" + "다음 타일에 해당 방향으로 들어올 수 있는가" 양쪽 모두 검증되어야 하는 RMMZ 표준 동작이 누락되었다.

### 1-B. 고저차와 전투의 연결 부재

현재 고저차(Elevation) 시스템은 Region ID 기반 3단계(저지대 0, 일반 1, 고지대 2)로 구현되어 있으나, 다음 영역에서 활용이 빠져 있다:

| 영역 | 현재 상태 | 문제 |
|------|----------|------|
| 이동 범위 BFS | 고저차 무시 | 인접 타일이라도 고저차가 다르면 계단 없이 이동 불가해야 함 |
| 근접 공격 (melee) | 고저차 무시 | 성벽 위 아래가 타일상 인접해도 근접 공격은 불가능해야 함 |
| 공격 범위 표시 | 사거리 보정만 존재 | 궤적 유형별 고저차 필터링 없음 |
| 반격 (canCounter) | 고저차 무시 | 고저차가 다르면 근접 반격 불가해야 함 |

### 1-C. 스킬 궤적과 고저차 관계 부재

현재 FIRE_MODE(melee/direct/arc)가 **장애물 차단**에만 사용된다. 고저차에 의한 범위 제한이 없어서, 저지대에서 고지대로 방사형(direct) 스킬을 자유롭게 사용할 수 있다.

---

## 2. 설계

### 2-A. 4방향 통행 판정 반영

RMMZ 표준 `canPass` 동작을 재현한다. 핵심은 **양방향 검증**: 현재 타일에서 나가는 방향 + 다음 타일에 들어오는 방향 모두 통행 가능해야 한다.

#### 변경 함수

**`SrpgGrid.canMoveTo(fromX, fromY, toX, toY)`** — 신규 메서드

```javascript
// (fromX, fromY) → (toX, toY) 이동이 타일 통행 규칙상 가능한지 판정
// RMMZ의 Game_CharacterBase.isMapPassable과 동일한 양방향 체크
canMoveTo(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    // dx, dy → RMMZ 방향 코드 (2=↓, 4=←, 6=→, 8=↑)
    let d;
    if (dy > 0) d = 2;       // 아래로 이동
    else if (dx < 0) d = 4;  // 왼쪽으로 이동
    else if (dx > 0) d = 6;  // 오른쪽으로 이동
    else if (dy < 0) d = 8;  // 위로 이동
    else return false;        // 같은 타일

    const reverseD = 10 - d;  // RMMZ 역방향: 2↔8, 4↔6

    // 출발 타일에서 d 방향으로 나갈 수 있는가?
    if (!$gameMap.isPassable(fromX, fromY, d)) return false;
    // 도착 타일에 역방향(reverseD)으로 들어올 수 있는가?
    if (!$gameMap.isPassable(toX, toY, reverseD)) return false;

    return true;
},
```

**`SrpgGrid.isPassable(x, y)`** — 유지 (범용 "이 타일이 아예 벽인가" 판정)

기존 `isPassable`은 소환 배치·맵 초기화 등 "방향 상관없이 타일 자체가 통과 가능한지"만 필요한 곳에서 그대로 사용한다.

**`calcMoveRange` BFS 수정**

```javascript
// 기존:
if (!this.isPassable(nx, ny)) continue;

// 변경:
if (!this.inBounds(nx, ny)) continue;
if (!this.canMoveTo(cur.x, cur.y, nx, ny)) continue;
```

---

### 2-B. 고저차 5단계 시스템

기존 3단계를 **5단계**로 확장한다. 계단은 독립적인 레벨로, 인접한 두 높이를 연결하는 역할을 한다.

#### Region ID ↔ 고저차 레벨 매핑

| Region ID | 명칭 | 고저차 레벨 | 설명 |
|-----------|------|-----------|------|
| 1 | 저지대 | 0 | 낮은 평지 |
| 3 (신규) | 저↔중 계단 | 1 | 저지대와 중지대를 연결하는 경사/계단 |
| 0 (미지정) | 중지대 | 2 | 일반 평지 (기본값) |
| 4 (신규) | 중↔고 계단 | 3 | 중지대와 고지대를 연결하는 경사/계단 |
| 2 | 고지대 | 4 | 높은 고지 |

#### getElevation 변경

```javascript
getElevation(x, y) {
    if (!this.inBounds(x, y)) return 2; // 기본 = 중지대
    const r = $gameMap.regionId(x, y);
    switch (r) {
        case 1: return 0;  // 저지대
        case 3: return 1;  // 저↔중 계단
        case 2: return 4;  // 고지대
        case 4: return 3;  // 중↔고 계단
        default: return 2; // 중지대 (Region 0 포함)
    }
},
```

#### 계단 판별

```javascript
isStair(x, y) {
    const r = $gameMap.regionId(x, y);
    return r === 3 || r === 4; // Region 3(저↔중), Region 4(중↔고)
},
```

#### 이동 규칙: 인접 1레벨 차이만 허용

5단계 시스템에서 이동은 **레벨 차이 ±1 이내**만 허용한다. 계단이 중간 레벨이므로 자연스럽게 연결된다:

```
저지대(0) ↔ 저중계단(1) ↔ 중지대(2) ↔ 중고계단(3) ↔ 고지대(4)
   OK          OK           OK           OK           
```

레벨 차이 2 이상은 이동 불가:
- 저지대(0) → 중지대(2): 불가 (계단을 거쳐야 함)
- 중지대(2) → 고지대(4): 불가 (계단을 거쳐야 함)
- 저지대(0) → 고지대(4): 불가

```javascript
canTraverseElevation(fromX, fromY, toX, toY) {
    const fromElev = this.getElevation(fromX, fromY);
    const toElev = this.getElevation(toX, toY);
    return Math.abs(fromElev - toElev) <= 1;
},
```

#### 기존 코드 호환 — elevationDiff 변경

기존 전투 보정 시스템이 사용하는 `elevationDiff`는 **전투 레벨**(저=0, 중=1, 고=2)로 변환하여 반환한다. 기존 보정 계수를 그대로 유지하기 위함이다.

```javascript
// 전투용 고저차 (3단계로 정규화: 0=저, 1=중, 2=고)
// 계단은 인접한 낮은 쪽 레벨로 취급
getCombatElevation(x, y) {
    const elev = this.getElevation(x, y);
    return Math.floor(elev / 2); // 0→0, 1→0, 2→1, 3→1, 4→2
},

elevationDiff(ax, ay, dx, dy) {
    return this.getCombatElevation(ax, ay) - this.getCombatElevation(dx, dy);
},
```

이렇게 하면 기존 명중률/회피 보정 (`elevDiff * 0.15`, `elevDiff * -0.075`)이 -2 ~ +2 범위에서 그대로 동작한다.

#### 사거리 보정도 동일 변환

기존:
```javascript
const elevRangeBonus = unitElev - 1; // 고지대(2):+1, 일반(1):0, 저지대(0):-1
```

변경:
```javascript
const combatElev = this.getCombatElevation(fromX, fromY);
const elevRangeBonus = combatElev - 1; // 고지대(2):+1, 중지대(1):0, 저지대(0):-1
```

---

### 2-C. 고저차에 의한 근접 공격·반격 차단

고저차가 다른 인접 타일의 유닛은 개념적으로 "위/아래층"에 있으므로, 근접(melee) 공격과 반격이 불가능해야 한다.

#### 근접 상호작용 가능 판정

근접 공격·반격·ZoC는 **같은 "평지 레벨"에 있거나, 계단을 통해 1레벨 차이 이내**인 경우에만 동작한다. 이동 규칙과 동일하게 레벨 차이 ±1 이내를 사용한다.

```javascript
canMeleeInteract(ax, ay, bx, by) {
    const aElev = this.getElevation(ax, ay);
    const bElev = this.getElevation(bx, by);
    return Math.abs(aElev - bElev) <= 1;
},
```

예시:
- 저지대(0) ↔ 저중계단(1): 근접 공격 가능
- 저중계단(1) ↔ 중지대(2): 근접 공격 가능
- 저지대(0) ↔ 중지대(2): **근접 공격 불가** (계단 없이는 닿지 않음)
- 중지대(2) ↔ 고지대(4): **근접 공격 불가**
- 중고계단(3) ↔ 고지대(4): 근접 공격 가능

#### 영향받는 함수

| 함수 | 수정 내용 |
|------|----------|
| `canCounter` | 고저차 체크 추가 — `canMeleeInteract` 통과 시에만 반격 |
| `isZoCTile` | 고저차 체크 추가 — 같은 높이에서만 ZoC 발동 |
| `calcAtkRange` (melee) | 범위 타일에서 고저차 필터링 |
| 기회 공격 (OA) | 인접 적 이탈 시 고저차 체크 |

---

### 2-D. 궤적 유형별 고저차 범위 제한

스킬 범위를 계산할 때, 궤적 유형(fireMode)에 따라 고저차를 고려하여 범위 타일을 필터링한다.

#### 원칙

| 궤적 유형 | 고저차 규칙 | 근거 |
|-----------|-----------|------|
| **melee** (근접) | 레벨 차이 ±1 이내 | 물리적으로 손이 닿는 거리, 계단에서 위/아래 공격 가능 |
| **direct** (직사) | 시전자의 **전투 레벨** 이하만 | 수평 궤적이라 위로 쏠 수 없음 |
| **arc** (곡사/포격) | **고저차 무시** | 포물선이므로 어디든 떨어짐 |

#### 세부 규칙

**direct (직사, 방사형 포함)**
- 시전자의 전투 레벨(getCombatElevation) 이하인 타일만 공격 가능
- 근거: 수평으로 날아가는 화살/마법은 위로 올려 쏠 수 없음
- 고지대(전투2)에서 시전 → 고지대 + 중지대 + 저지대 모두 타겟 가능
- 중지대(전투1)에서 시전 → 중지대 + 저지대 타겟 가능
- 저지대(전투0)에서 시전 → 저지대만 타겟 가능
- 계단 위의 유닛은 낮은 쪽 전투 레벨로 취급 (공격 받기 유리하지도 불리하지도 않음)

**melee (근접)**
- 인접 타일 중 레벨 차이 ±1 이내만 공격 가능
- `canMeleeInteract` 사용

**arc (곡사, artillery 투사체)**
- 고저차 무시, 범위 내 모든 타일 공격 가능
- 포물선으로 날아가므로 높이에 관계없이 떨어질 수 있음

**스킬별 fireMode 결정 (resolveFireMode)**
현재 이미 구현된 우선순위 체인을 그대로 활용:
1. 스킬 노트태그 `<srpgProjectile:artillery>` → arc
2. 스킬 노트태그 `<srpgProjectile:hitray|projectile>` → direct
3. 유닛 기본 fireMode (atkRange ≤ 1 → melee, ≥ 2 → direct)
4. 이벤트 노트태그 `<srpgFireMode:arc|direct|melee>` 오버라이드

**추가 노트태그 — `<srpgIgnoreElevation>`**
특정 스킬이 고저차 규칙을 완전히 무시하도록 하는 예외 태그:
- 예: 텔레포트, 소환, 땅에서 솟는 마법 등
- fireMode와 독립적으로 동작

#### 구현: calcAtkRange 고저차 필터

`calcAtkRange`의 반환값에서 고저차 조건을 만족하지 않는 타일을 제거한다:

```javascript
calcAtkRange(unit, fromX, fromY, skillId) {
    // ... 기존 로직으로 범위 타일 계산 ...
    const tiles = /* 기존 결과 */;

    // 고저차 필터링
    const fireMode = skillId
        ? SrpgCombat.resolveFireMode(unit, skillId)
        : unit.fireMode;
    const ignoreElev = skillId && this._skillIgnoresElevation(skillId);

    if (!ignoreElev) {
        return tiles.filter(t => this.canTargetWithElevation(
            fromX, fromY, t.x, t.y, fireMode
        ));
    }
    return tiles;
},

// 고저차 기반 타겟 가능 여부
canTargetWithElevation(fromX, fromY, toX, toY, fireMode) {
    if (fireMode === FIRE_MODE.ARC) return true;  // 곡사 — 무시

    if (fireMode === FIRE_MODE.MELEE) {
        // 근접 — 레벨 차이 ±1 이내
        return this.canMeleeInteract(fromX, fromY, toX, toY);
    }

    // direct — 시전자 전투 레벨 이하만 타겟 가능
    const fromCombatElev = this.getCombatElevation(fromX, fromY);
    const toCombatElev = this.getCombatElevation(toX, toY);
    return toCombatElev <= fromCombatElev;
},

// 스킬 노트태그에서 고저차 무시 여부 확인
_skillIgnoresElevation(skillId) {
    const skill = $dataSkills[skillId];
    if (!skill || !skill.note) return false;
    return /<srpgIgnoreElevation>/i.test(skill.note);
},
```

---

## 3. 기존 시스템과의 정합성

### 3-A. 고저차 사거리 보정 (기존 유지)

현재 `calcAtkRange`에 있는 고저차 사거리 보정(`elevRangeBonus`)은 `getCombatElevation`을 사용하도록 변환한다. 이 보정은 "고지대에서 더 멀리 볼 수 있다"는 개념이고, 본 설계의 고저차 필터는 "궤적이 닿느냐"라는 별개의 개념이다.

적용 순서:
1. 사거리 보정 (기존) — 고지대에서 atkRange +1, 저지대에서 -1
2. 범위 타일 계산 (기존)
3. **고저차 필터링 (신규)** — fireMode에 따라 도달 불가 타일 제거

### 3-B. 투사체 경로 차단 (기존 유지)

`checkProjectilePath`는 **수평 경로상 장애물**을 체크하는 기존 시스템이다. 고저차 필터링은 이와 독립적으로 동작한다:

- 고저차 필터 = "해당 높이의 타일에 궤적이 닿는가" (범위 계산 시)
- 경로 차단 = "시전자↔타겟 사이에 장애물이 있는가" (전투 실행 시)

두 시스템이 모두 통과해야 공격이 성립한다.

### 3-C. 명중률·대미지 보정 (기존 유지)

고저차에 의한 명중률 보정 (`elevDiff * 0.15`)과 회피율 보정은 `elevationDiff`가 내부적으로 `getCombatElevation`(3단계)을 사용하도록 변경되므로, 기존 보정 계수가 그대로 동작한다.

### 3-D. 적 AI 영향

적 AI가 스킬 타겟을 선택할 때 `calcAtkRange`를 사용하므로, 고저차 필터가 자동으로 반영된다. 별도의 AI 수정은 불필요하다.

---

## 4. 고저차 5단계 전체 정리

```
레벨 4  ████ 고지대 ████     Region 2
         ↕ (±1 이동/근접 가능)
레벨 3  ▓▓▓ 중고 계단 ▓▓▓    Region 4
         ↕ (±1 이동/근접 가능)
레벨 2  ████ 중지대 ████     Region 0 (기본)
         ↕ (±1 이동/근접 가능)
레벨 1  ▓▓▓ 저중 계단 ▓▓▓    Region 3
         ↕ (±1 이동/근접 가능)
레벨 0  ████ 저지대 ████     Region 1
```

**이동**: 인접 타일 레벨 차이 ±1 이내만 허용. 저지대→중지대는 반드시 계단(레벨1)을 거쳐야 함.

**근접 공격/반격/ZoC**: 이동과 동일, 레벨 차이 ±1 이내.

**직사(direct) 공격**: 시전자 전투 레벨(0/1/2) 이하의 타일만. 계단은 낮은 쪽 전투 레벨.

**곡사(arc) 공격**: 고저차 완전 무시.

**전투 레벨 변환**: `Math.floor(elev / 2)` → 0(저), 0(저중계단), 1(중), 1(중고계단), 2(고)

---

## 5. 엣지 케이스

### 5-1. 멀티타일 유닛의 고저차

멀티타일 유닛이 여러 고저차에 걸쳐 있을 수 있다. 이 경우:
- **이동**: 앵커 기준 고저차로 판정 (기존 `_canAnchorAt`에 고저차 체크 추가)
- **공격 범위**: 각 점유 타일에서 개별적으로 고저차 필터링 → 합산
  - 멀티타일 유닛의 일부가 고지대에 있으면 그 타일에서는 direct로 저지대를 공격 가능

### 5-2. 고저차가 같지만 절벽 타일로 분리된 경우

절벽(cliff) terrain tag가 있는 타일은 같은 고저차라도 `doesTileBlock`에서 직사를 차단할 수 있다. 본 설계와 별도로 동작하므로 충돌 없음.

### 5-3. 저지대 → 고지대 direct 공격 불가 상황에서의 대안

저지대에서 고지대 적을 공격하려면:
- arc(곡사) 스킬 사용
- `<srpgIgnoreElevation>` 태그가 있는 마법 스킬 사용
- 계단을 통해 같은 높이로 이동 후 공격

이는 **전술적 의미**를 부여하여 고지대 점령의 가치를 높인다.

### 5-4. 계단 위에서의 전투

계단(레벨 1, 3) 위에 서 있는 유닛:
- 위아래 인접 레벨 유닛 모두와 근접 공격 교환 가능
- direct 공격 시 전투 레벨은 낮은 쪽(계단을 올라가기 전 레벨)로 취급
- 방어적으로 불리: 위에서도 아래에서도 공격당할 수 있음
- 공격적으로도 불리: direct 사거리에서 높은 쪽을 노릴 수 없음

### 5-5. 범위 표시 UI 영향

`_drawOverlay`에서 공격 범위를 표시할 때 `calcAtkRange`의 결과를 그대로 사용하므로, 고저차 필터가 적용된 범위만 표시된다. 별도의 UI 수정은 불필요하다.

---

## 6. 구현 계획

### Phase 1: 4방향 통행 반영

| 항목 | 파일 | 내용 |
|------|------|------|
| `canMoveTo()` 신규 | SRPG_Data.js | 양방향 타일 통행 검증 |
| `calcMoveRange` BFS 수정 | SRPG_Data.js | `isPassable` → `canMoveTo` 교체 |
| `_canAnchorAt` 수정 | SRPG_Data.js | 멀티타일도 canMoveTo 적용 |

### Phase 2: 고저차 5단계 + 이동·근접 차단

| 항목 | 파일 | 내용 |
|------|------|------|
| `getElevation()` 5단계 변경 | SRPG_Data.js | Region → 0~4 레벨 매핑 |
| `getCombatElevation()` 신규 | SRPG_Data.js | 전투용 3단계 변환 |
| `isStair()` 신규 | SRPG_Data.js | Region 3/4 계단 판별 |
| `canTraverseElevation()` 신규 | SRPG_Data.js | 이동 시 ±1 레벨 검증 |
| `canMeleeInteract()` 신규 | SRPG_Data.js | 근접 상호작용 ±1 레벨 검증 |
| `elevationDiff` 변경 | SRPG_Data.js | getCombatElevation 사용 |
| `calcMoveRange` BFS 추가 | SRPG_Data.js | 고저차 검증 단계 삽입 |
| `canCounter` 수정 | SRPG_Data.js | 고저차 체크 추가 |
| `isZoCTile` 수정 | SRPG_Data.js | 고저차 체크 추가 |
| 사거리 보정 변경 | SRPG_Data.js | getCombatElevation 사용 |

### Phase 3: 스킬 범위 고저차 필터링

| 항목 | 파일 | 내용 |
|------|------|------|
| `canTargetWithElevation()` 신규 | SRPG_Data.js | fireMode별 고저차 필터 |
| `_skillIgnoresElevation()` 신규 | SRPG_Data.js | 노트태그 파서 |
| `calcAtkRange` 수정 | SRPG_Data.js | 결과에 고저차 필터 적용 |
| `calcAtkRange` 시그니처 확장 | SRPG_Data.js | skillId 파라미터 추가 |
| SM 호출부 수정 | SRPG_SM.js | calcAtkRange에 skillId 전달 |

### Phase 4: 빌드 및 검증

- `python src/build.py` 실행
- 구문 검증
- 엣지 케이스 시나리오 검증

---

## 7. 노트태그 요약

| 태그 | 대상 | 설명 |
|------|------|------|
| `<srpgFireMode:melee\|direct\|arc>` | 이벤트 노트 | 유닛 기본 궤적 (기존) |
| `<srpgProjectile:artillery>` | 스킬 노트 | 곡사 투사체 → arc (기존) |
| `<srpgIgnoreElevation>` | 스킬 노트 | 고저차 범위 제한 완전 무시 (신규) |

Region ID:

| Region | 명칭 | 레벨 | 전투 레벨 |
|--------|------|------|----------|
| 1 | 저지대 | 0 | 0 |
| 3 (신규) | 저↔중 계단 | 1 | 0 |
| 0 (기본) | 중지대 | 2 | 1 |
| 4 (신규) | 중↔고 계단 | 3 | 1 |
| 2 | 고지대 | 4 | 2 |
