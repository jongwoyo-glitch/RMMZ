# SRPG 전술 시스템 5종 설계서

> 작성일: 2026-04-19
> 대상 파일: SRPG_Data.js (SrpgUnit, SrpgGrid, SrpgCombat), SRPG_SM.js

---

## 목차

1. [배면/측면 공격 보너스](#1-배면측면-공격-보너스)
2. [지형 레벨 (고저차)](#2-지형-레벨-고저차)
3. [기회 공격 (Opportunity Attack)](#3-기회-공격-opportunity-attack)
4. [협동 공격 (Follow-up Attack)](#4-협동-공격-follow-up-attack)
5. [지배 영역 (Zone of Control)](#5-지배-영역-zone-of-control)
6. [구현 순서 및 의존성](#6-구현-순서-및-의존성)
7. [데이터 구조 변경 요약](#7-데이터-구조-변경-요약)

---

## 1. 배면/측면 공격 보너스

### 1.1 설계 의도
공격자가 방어자의 뒤(배면)나 옆(측면)에서 공격하면 보너스를 받는다. 위치 전술의 핵심.

### 1.2 방향 판정 로직

RMMZ 방향은 넘패드 기준: 2=아래, 4=왼쪽, 6=오른쪽, 8=위.

```
방어자가 바라보는 방향 = defender.event.direction()
공격자 상대 위치 = atan2(attacker.y - defender.y, attacker.x - defender.x)

판정 구분:
  정면(Front): 방어자가 바라보는 방향과 공격자 위치가 같은 방향
  배면(Rear):  방어자가 바라보는 반대쪽에서 공격
  측면(Flank): 좌우 90° 위치에서 공격
```

구체적 매핑:

| 방어자 방향 | 정면 (dx,dy)     | 배면 (dx,dy)     | 측면                    |
|-------------|-----------------|-----------------|------------------------|
| 2 (아래)    | dy > 0          | dy < 0          | dx ≠ 0, dy == 0       |
| 8 (위)      | dy < 0          | dy > 0          | dx ≠ 0, dy == 0       |
| 4 (왼쪽)    | dx < 0          | dx > 0          | dy ≠ 0, dx == 0       |
| 6 (오른쪽)  | dx > 0          | dx < 0          | dy ≠ 0, dx == 0       |

대각선 위치(dx≠0 && dy≠0)인 경우:
- 방어자 방향의 **반대축** 성분이 더 크면 배면, 같은축이면 측면으로 판정
- 예: 방어자가 아래(2)를 보고 있고, 공격자가 (dx=1, dy=-2)면 → dy<0이 주성분 → 배면

### 1.3 보너스 수치

| 공격 방향 | 데미지 배율 | 명중률 처리        |
|-----------|------------|-------------------|
| 정면      | ×1.0       | 기존 hitCheck 그대로 |
| 측면      | ×1.5       | 명중률 ×1.5        |
| 배면      | ×2.0       | 무조건 명중 (hitCheck 스킵) |

### 1.4 삽입 포인트

**SrpgCombat (SRPG_Data.js)**

새 메서드:
```javascript
// SrpgCombat.getFlankingType(attacker, defender)
// 반환: "front" | "flank" | "rear"
```

수정할 메서드:
- `execute()`: hitCheck 전에 flanking 판정 → 배면이면 hitCheck 스킵, 측면이면 hitRate ×1.5
- `execute()`: 데미지 계산 후 flanking 배율 적용 (crit 이전)
- `predict()`: 같은 로직으로 예측 수치에 반영
- `predict()` 반환값에 `flankType` 추가 (UI 표시용)

### 1.5 제외 사항
- 오브젝트(파괴 가능 사물)에 대한 배면/측면은 없음 (방향 개념 없으므로)
- 회복 스킬은 배면/측면 판정 제외
- 근접(melee)과 원거리 구분 없이 동일 적용

---

## 2. 지형 레벨 (고저차)

### 2.1 설계 의도
3단계 고저차로 고지대 이점/불이점을 표현. Terrain Tag 4/5/6 사용.

### 2.2 Region ID 기반 고저차 (Terrain Tag와 독립)

Terrain Tag는 투사체 차단용(0~3)으로 이미 사용 중. 고저차는 **Region ID**를 사용하여
Terrain Tag와 중첩 가능하게 구현. (예: 고지대+엄폐물 조합 가능)

| Region ID | 높이         | 비고                          |
|-----------|-------------|-------------------------------|
| 0 (미지정) | 일반 (레벨 1) | 아무것도 안 칠한 기본 타일       |
| 1         | 저지대 (레벨 0)| 낮은 곳만 칠함                 |
| 2         | 고지대 (레벨 2)| 높은 곳만 칠함                 |
| 3~255     | 일반 (레벨 1) | 이벤트/기타 용도 자유 사용       |

### 2.3 보정 규칙 (상대적)

`levelDiff = 공격자 레벨 - 방어자 레벨` (범위: -2 ~ +2)

| levelDiff | 명중률 보정     | 회피율 보정     | 시야 보정    | 원거리 사거리 보정 |
|-----------|---------------|---------------|------------|------------------|
| +2        | ×1.3          | +0.15         | +2칸       | +2칸             |
| +1        | ×1.15         | +0.075        | +1칸       | +1칸             |
| 0         | ×1.0          | 0             | 0          | 0                |
| -1        | ×0.85 (역보정) | -0.075        | -1칸       | -1칸             |
| -2        | ×0.7          | -0.15         | -2칸       | -2칸             |

**구현 세부:**
- 명중률: `hitCheck()`에서 `finalRate *= elevationHitMod(levelDiff)` 적용
- 회피율: `hitCheck()`에서 방어자 EVA에 보정치 가산 후 계산
- 시야: 향후 시야 시스템 구현 시 `visionRange + levelDiff` 적용
- 사거리: 원거리(atkRange ≥ 2) 유닛에만 적용. `calcAtkRange()`에서 보정

### 2.4 삽입 포인트

**SrpgGrid (SRPG_Data.js)**

새 메서드:
```javascript
// Region ID 기반 지형 레벨 반환 (0/1/2)
getElevation(x, y) {
    const r = $gameMap.regionId(x, y);
    if (r === 1) return 0;  // 저지대
    if (r === 2) return 2;  // 고지대
    return 1;                // 0(미지정) 또는 3+ = 일반
}

// 두 위치의 고저차 (공격자 - 방어자)
elevationDiff(ax, ay, dx, dy) {
    return this.getElevation(ax, ay) - this.getElevation(dx, dy);
}
```

TERRAIN 상수는 변경 없음 (고저차는 Region ID 사용).

수정할 메서드:
- `SrpgCombat.hitCheck()`: elevationDiff 기반 명중률/회피율 보정
- `SrpgCombat.execute()`: 고저차 보정 결과를 result에 포함
- `SrpgCombat.predict()`: 동일 보정 반영
- `SrpgGrid.calcAtkRange()`: 공격자 위치의 elevation으로 사거리 증감
- (향후) 시야 시스템: visionRange ± levelDiff

---

## 3. 기회 공격 (Opportunity Attack)

### 3.1 설계 의도
적 유닛이 아군의 근접 위협 범위(사거리 1 인접 타일)를 벗어나려 할 때, 해당 아군이 자동 무료 공격 1회를 수행. BG3의 핵심 전술 요소.

### 3.2 핵심 규칙

1. **트리거 조건**: 유닛 A가 유닛 B에 대해 적대적(isHostileTo)이고, B의 근접 위협 범위(인접 4방향) 안에서 **밖으로** 이동할 때
2. **소비**: 기회 공격을 가하는 유닛의 `reaction` 리소스 1회 소비 (턴 시작 시 1로 리셋)
3. **공격 내용**: 기본 공격(skillId=0) 1회. 배면/측면 보너스 적용 (이동 방향의 반대가 공격 방향)
4. **데미지 적용**: 즉시. 피격자가 사망하면 이동 중단
5. **이동 중단 없음**: 기회 공격을 받아도 생존 시 이동은 계속됨 (BG3 방식)
6. **무시 조건**: 스킬 프로퍼티로 기회 공격 무시 가능 (은신, 이탈기 등)
7. **기회 공격 불가 유닛**: 원거리 전용 유닛(atkRange > 1, fireMode !== melee), 사물, 이미 reaction 소비

### 3.3 `reaction` 리소스

```javascript
// SrpgUnit 생성자에 추가
this.reaction = 1;        // 턴당 기회 공격 횟수
this.maxReaction = 1;     // 최대 reaction (장비/스킬로 증가 가능)

// resetActions()에 추가
this.reaction = this.maxReaction;
```

### 3.4 트리거 판정 흐름

```
이동 경로의 각 스텝(타일 → 타일)마다:
  1. 현재 타일에서 이 유닛에게 적대적인 모든 인접 유닛 목록 A 산출
  2. 다음 타일에서의 인접 적대 유닛 목록 B 산출
  3. A에는 있지만 B에는 없는 유닛 = 위협 범위를 이탈하는 유닛
  4. 해당 유닛 중 reaction > 0이고 근접 공격 가능한 유닛 → 기회 공격 실행
```

### 3.5 삽입 포인트

**SrpgUnit (SRPG_Data.js)**
- 생성자: `reaction`, `maxReaction` 프로퍼티 추가
- `resetActions()`: `this.reaction = this.maxReaction` 추가
- 새 메서드: `canOpportunityAttack()` — `reaction > 0 && atkRange <= 1 && isAlive() && !isObject`

**SrpgCombat (SRPG_Data.js)**
- 새 메서드: `executeOpportunityAttack(reactor, mover)` — 기본 공격 1회, reaction 소비, 배면 보너스 자동 적용, 결과 반환

**SRPG_SM (SRPG_SM.js)**
수정 지점: `_animateMove()` / `updateMove()` 호출 전후 → 각 이동 스텝 완료 시점에서:

```
현재 위치에서 적대 인접 유닛 캐시 → 이동 후 재산출 → 이탈한 유닛에 대해 기회 공격 실행
```

플레이어 이동 중: `_updatePlayerMoving()` 내에서 스텝별 체크
적 이동 중: `_updateEnemyTurn()` → `"enemyMoving"` 서브페이즈 내에서 체크

### 3.6 시각 연출

- 기회 공격 발생 시 이동 일시 정지 (15프레임)
- 공격자 방향 전환 → "기회 공격!" 팝업 (color: #FFD700)
- 데미지 적용 + 피격 이펙트
- 이동 재개 or 사망 처리

---

## 4. 협동 공격 (Follow-up Attack)

### 4.1 설계 의도
아군이 적을 공격했을 때, 인접한 다른 아군이 자동으로 일반 공격으로 원호 사격/공격. 친밀도나 패시브 스킬에 의해 발동.

### 4.2 발동 조건

1. **인접 아군**: 공격 대상(방어자)의 인접 4방향 or 공격 사거리 내에 같은 팀 아군이 위치
2. **친밀 관계**: 공격자와 원호자 사이에 친밀도 조건 충족 (일정 수치 이상)
3. **OR 패시브 스킬**: 원호자가 `<srpgFollowUp:true>` 같은 패시브 보유 시 친밀도 무관 발동
4. **원호 가능 상태**: 원호자가 `reaction > 0`이고 생존, 전투 가능 상태
5. **사거리 조건**: 원호자의 공격 사거리 내에 방어자가 있어야 함
6. **1회 제한**: 한 전투당 원호 공격은 최대 1회 (가장 높은 친밀도 or 스킬 우선순위 기준)

### 4.3 친밀도 시스템 (데이터 구조)

친밀도는 액터 간 양방향 관계. `$dataActors[id].relationships` 커스텀 필드 (Actors.json):

```javascript
// Actors.json 내 커스텀 필드
{
    "id": 1,
    "name": "주인공",
    "relationships": {
        "2": 80,   // actorId 2와의 친밀도 80
        "3": 50,   // actorId 3과의 친밀도 50
    }
}
```

임계값:
- 친밀도 ≥ 70: 협동 공격 가능
- 친밀도 ≥ 90: 협동 공격 데미지 1.2배 보너스

적 유닛은 친밀도 대신 패시브 스킬(`<srpgFollowUp:true>`)로만 발동.

### 4.4 삽입 포인트

**SrpgUnit (SRPG_Data.js)**
- 새 메서드: `canFollowUp(target)` — reaction > 0, 사거리 내, 생존, 적대
- 새 메서드: `affinityWith(otherUnit)` — 친밀도 수치 반환 (액터간)
- 새 메서드: `hasFollowUpSkill()` — 패시브 노트태그 체크

**SrpgCombat (SRPG_Data.js)**
- 새 메서드: `findFollowUpAlly(attacker, defender)` — 조건 만족하는 최적 원호자 반환
- 새 메서드: `executeFollowUp(follower, defender, affinityLevel)` — 기본 공격, 친밀도 보너스

**SRPG_SM (SRPG_SM.js)**
- `_executeCombat()`: 메인 전투 결과 후, 방어자 생존 시 협동 공격 탐색 → 실행
- 적 AI 전투 실행부에도 동일 처리 (적에게도 협동 공격 발생 가능)

### 4.5 시각 연출

- 메인 공격 데미지 표시 후 짧은 딜레이 (20프레임)
- 원호자 방향 전환 → "협동!" 팝업 (color: #00FF88)
- 원호 공격 데미지 적용 (별도 투사체/이펙트)
- 원호자의 reaction 소비

### 4.6 기회 공격과의 관계

기회 공격과 협동 공격 모두 `reaction` 리소스를 소비. 한 턴에 하나만 사용 가능 (기본 maxReaction=1). 특수 스킬/장비로 maxReaction 증가 가능.

---

## 5. 지배 영역 (Zone of Control)

### 5.1 설계 의도
근접 유닛의 인접 타일을 적이 자유롭게 통과할 수 없게 하여, 전선 유지와 탱커 역할에 전략적 깊이를 부여.

### 5.2 핵심 규칙

1. **ZoC 생성**: 근접 공격 가능한 유닛(atkRange ≤ 1)의 인접 4방향 타일이 ZoC 영역
2. **이동 비용 증가**: ZoC 타일 진입 시 이동 비용 +2 (일반 1 → 3)
3. **ZoC 무시 조건** (스킬 프로퍼티 `<srpgIgnoreZoC:true>`):
   - 은신 상태
   - 이탈기(Disengage) 스킬 사용 (보조 행동 소비)
   - 달리기(Sprint) 등 특수 이동 스킬
4. **아군 ZoC**: 아군의 ZoC는 무시 (같은 팀은 통과)
5. **사물 ZoC 없음**: isObject인 유닛은 ZoC 생성하지 않음

### 5.3 삽입 포인트

**SrpgUnit (SRPG_Data.js)**
- 새 프로퍼티: `ignoreZoC` (boolean, 기본 false)
- 새 메서드: `hasZoC()` — `isAlive() && !isObject && atkRange <= 1 && fireMode === "melee"`
- 새 메서드: `isInZoCOf(enemy)` — 인접 판정

**SrpgGrid (SRPG_Data.js)**
- `calcMoveRange()` 수정: BFS 이동 비용 계산 시 ZoC 타일이면 +2
- 새 메서드: `isZoCTile(x, y, movingUnit)` — 해당 타일이 movingUnit에 대한 ZoC인지

```javascript
isZoCTile(x, y, movingUnit) {
    // 인접 4방향에 적대적 근접 유닛이 있는지 확인
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const u = SM.unitAt(x + dx, y + dy);
        if (u && u.isAlive() && u.hasZoC() && u.isHostileTo(movingUnit)) {
            return true;
        }
    }
    return false;
}
```

**calcMoveRange() 수정:**
```javascript
// 기존: const nc = cur.cost + 1;
// 변경:
let stepCost = 1;
if (!unit.ignoreZoC && this.isZoCTile(nx, ny, unit)) {
    stepCost = 3; // ZoC 진입 비용 +2
}
const nc = cur.cost + stepCost;
```

### 5.4 이탈기(Disengage) 스킬 연동

보조 행동으로 "이탈" 사용 시 해당 턴의 이동에 ZoC 무시:
```javascript
// SM 라디얼 메뉴에 "이탈" 옵션 추가
// 사용 시: unit.ignoreZoC = true, unit.useBonusAction()
// 턴 종료 시: unit.ignoreZoC = false
```

### 5.5 UI 표시
- 이동 범위 표시 시 ZoC 타일을 다른 색상으로 표시 (주황색 경고)
- 또는 이동 범위가 ZoC로 인해 줄어든 것을 시각적으로 확인 가능

---

## 6. 구현 순서 및 의존성

```
Phase 1: 배면/측면 공격 보너스
    └─ SrpgCombat.getFlankingType() 추가
    └─ execute/predict 수정
    └─ 의존성: 없음 (독립적)

Phase 2: 지형 레벨 (고저차)
    └─ TERRAIN 상수 확장, getElevation() 추가
    └─ hitCheck/calcAtkRange 보정
    └─ 의존성: 없음 (독립적)

Phase 3: ZoC (지배 영역)
    └─ SrpgUnit.hasZoC(), SrpgGrid.isZoCTile()
    └─ calcMoveRange 비용 수정
    └─ SM 라디얼 메뉴에 "이탈" 추가
    └─ 의존성: 없음

Phase 4: 기회 공격 (Opportunity Attack)
    └─ SrpgUnit.reaction 리소스
    └─ SrpgCombat.executeOpportunityAttack()
    └─ SM 이동 스텝별 트리거 체크
    └─ 의존성: Phase 1 (배면 보너스가 기회 공격에 적용되므로)
             Phase 3 (ZoC 무시 ↔ 기회 공격 무시 연동)

Phase 5: 협동 공격 (Follow-up Attack)
    └─ 친밀도 데이터, affinityWith()
    └─ SrpgCombat.findFollowUpAlly(), executeFollowUp()
    └─ SM 전투 실행 후 협동 체크
    └─ 의존성: Phase 4 (reaction 리소스 공유)

Phase 6: 빌드 + 통합 검증
```

### 코드 규모 추정

| Phase | SRPG_Data.js | SRPG_SM.js | 난이도 |
|-------|-------------|-----------|-------|
| 1. 배면/측면 | +60줄       | +5줄      | ★☆☆  |
| 2. 지형 레벨 | +40줄       | +5줄      | ★☆☆  |
| 3. ZoC      | +50줄       | +40줄     | ★★☆  |
| 4. 기회 공격 | +70줄       | +100줄    | ★★★  |
| 5. 협동 공격 | +80줄       | +80줄     | ★★☆  |
| 합계        | +300줄      | +230줄    |       |

---

## 7. 데이터 구조 변경 요약

### SrpgUnit 신규 프로퍼티

| 프로퍼티       | 타입     | 기본값 | 용도                          |
|---------------|---------|-------|------------------------------|
| reaction      | number  | 1     | 기회/협동 공격 잔여 횟수       |
| maxReaction   | number  | 1     | 턴당 최대 reaction            |
| ignoreZoC     | boolean | false | ZoC 무시 여부 (이탈기 등)     |

### SrpgUnit 신규 메서드

| 메서드                    | 반환       | 용도                      |
|--------------------------|-----------|--------------------------|
| canOpportunityAttack()   | boolean   | 기회 공격 가능 여부        |
| hasZoC()                 | boolean   | ZoC 생성 여부             |
| canFollowUp(target)      | boolean   | 협동 공격 가능 여부        |
| affinityWith(otherUnit)  | number    | 친밀도 수치               |
| hasFollowUpSkill()       | boolean   | 협동 공격 패시브 보유      |

### SrpgGrid 신규 메서드

| 메서드                            | 반환     | 용도                    |
|----------------------------------|---------|------------------------|
| getElevation(x, y)              | number  | 타일 지형 레벨 (0/1/2)   |
| elevationDiff(ax, ay, dx, dy)   | number  | 고저차 (-2~+2)          |
| isZoCTile(x, y, movingUnit)     | boolean | ZoC 타일 판정           |

### SrpgCombat 신규 메서드

| 메서드                                          | 반환     | 용도                    |
|------------------------------------------------|---------|------------------------|
| getFlankingType(attacker, defender)             | string  | "front"/"flank"/"rear" |
| executeOpportunityAttack(reactor, mover)       | object  | 기회 공격 실행+결과      |
| findFollowUpAlly(attacker, defender)            | unit    | 최적 원호자 탐색        |
| executeFollowUp(follower, defender, affinity)   | object  | 협동 공격 실행+결과      |

### TERRAIN 상수 확장

```javascript
const TERRAIN = {
    NONE:  0,
    CLIFF: 1, COVER: 2, WALL: 3,
    LOW:   4,   // 저지대 (레벨 0)
    HIGH:  5,   // 고지대 (레벨 2)
};
```

### 노트태그 추가

| 태그                        | 대상       | 설명                         |
|----------------------------|-----------|------------------------------|
| `<srpgIgnoreZoC:true>`     | 스킬/상태  | ZoC 무시 (이탈기, 은신 등)    |
| `<srpgNoOpportunity:true>` | 스킬/상태  | 기회 공격 트리거 안 됨        |
| `<srpgFollowUp:true>`      | 스킬(패시브)| 친밀도 무관 협동 공격 가능     |
| `<srpgMaxReaction:N>`      | 액터/적    | 최대 reaction 수 오버라이드   |

### SM 상태 변수 추가

```javascript
// _executeCombat 내부
_pendingOpportunityAttacks: [],  // 이동 중 누적된 기회 공격 목록
_followUpResult: null,           // 협동 공격 결과
```

---

## 8. 통합 재점검 패치 내역 (2026-04-19)

### Critical 수정

| # | 이슈 | 수정 내용 |
|---|------|----------|
| C1 | 플레이어 이동 시 OA 미체크 | `_handleMoving()`에 `_checkOpportunityAttack` 호출 추가 (`_segStartX/Y` 기준) |
| C2 | 고저차 사거리 dead code | `resolved.maxRange` 제거 → `resolveReach` 호출 전 `unit.atkRange` 임시 보정 |
| C3 | 반격에 측면/명중 미적용 | `execute()` counter 블록에 `getFlankingType` + `hitCheck` + 측면배율 추가, `counterMissed` 결과 필드 |
| C4 | 적 AI 추격공격 누락 | `_enemyShowAction()`에 `_checkFollowUpAttack` + MISS 팝업 추가 |

### Medium 수정

| # | 이슈 | 수정 내용 |
|---|------|----------|
| M5 | 힐에 측면배율 적용 | `damageType !== 3 && damageType !== 4` 가드 추가 |
| M7 | Miss 결과 flankType 누락 | miss return 객체에 `flankType` 필드 추가 |
| M9 | 적 AI MCR 미적용 | `_enemyShowAction()` MP 소모에 `mcr` 배율 적용 |

### 의도적 유지 (수정 안 함)

| 항목 | 사유 |
|------|------|
| OA 중간경로 미체크 | 출발점 인접 → 현재위치 비인접 판정으로 충분. 경로 전체 체크는 성능 부담 |
| OA/협동 자동명중 | 전술적 보상 성격상 의도된 설계. OA는 이탈 페널티, 협동은 보너스 공격 |

### result 객체 필드 추가

```javascript
// SrpgCombat.execute() 반환값
{
    ...기존 필드,
    flankType: "front"|"flank"|"rear",     // 항상 포함 (miss 시에도)
    counterFlank: "front"|"flank"|"rear",  // 반격 측면타입 (반격 시)
    counterMissed: true|false,             // 반격 회피 여부
    followUp: { follower, damage, ... },   // 협동 공격 결과 (SM에서 추가)
}
```

---

## 9. 전투 규칙 정리 패치 (2026-04-19)

### 반격 시스템 제한

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 반격 사거리 | 방어자 공격범위 전체 | **근접 1칸 이내만** |
| 반격 조건 | 모든 공격 | **물리 공격(hitType 1)만** |
| 원거리 반격 | 가능 | **불가** |
| 마법 반격 | 동일 로직 | **별도 시스템으로 분리 (미구현)** |

canCounter()에서 `dist > 1` 이면 false. execute()/predict()에서 `isRanged || atkHitType !== 1` 이면 반격 블록 스킵.

### 측면/배면 보너스 물리 한정

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 배면 자동명중 | 모든 공격 | **물리(hitType 1)만** |
| 측면 명중 1.5배 | 모든 공격 | **물리만** |
| 측면 데미지 1.5배 | 공격 스킬(회복 제외) | **물리만** |
| 배면 데미지 2.0배 | 공격 스킬(회복 제외) | **물리만** |
| 마법/회복/버프/디버프 | 측면/배면 보너스 적용 | **보너스 없음 (정면 취급)** |

execute()에서 `isPhysical = (hitType === 1)` 플래그 도입. 비물리 공격은 hitCheck에 flankType="front" 전달.

### 마법 치명타 트레잇 게이트

| 항목 | 설명 |
|------|------|
| 물리(hitType 1) | 기존대로 CRI - CEV |
| 마법(hitType 2) | **기본 CRI 사용 불가**, `<srpgMagicCrit:true>` 노트태그 필요 |
| 확정(hitType 0) | 크리티컬 없음 (기존) |

노트태그 위치: 액터, 장비, 상태 중 어디든 하나에 있으면 마법 크리티컬 활성화.

```
예시: 지팡이에 <srpgMagicCrit:true> → 이 지팡이 장착 시 마법 크리티컬 가능
예시: "집중" 상태에 <srpgMagicCrit:true> → 집중 버프 중 마법 크리티컬 가능
```
