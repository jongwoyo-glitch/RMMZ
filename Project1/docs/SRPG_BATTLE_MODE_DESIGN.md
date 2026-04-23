# SRPG 전투 모드 + 팀 시스템 + 스튜디오 UI 설계서

**작성일**: 2026-04-22  
**버전**: 1.0  
**목적**: 다양한 전투 목적/상황을 지원하고, 다중 팀 기반 피아 관계를 구현하며, RMMZStudio에서 SRPG 맵을 쉽게 설정할 수 있는 전용 UI를 제공한다.

---

## 1. 현행 시스템 분석

### 1.1 현재 팀 구조
- `TEAM_COLORS[1~8]` — 8팀 컬러 팔레트가 이미 존재 (스타크래프트 스타일)
- `SrpgUnit.teamId` — 노트태그 `<srpgTeam:N>` 기반, 기본값: actor=1, enemy=2
- `isHostileTo(other)` — `teamId === 0`(중립)이면 모두 적대, 그 외 `teamId !== other.teamId`
- `allyUnits()` — `teamId === 1`만 필터
- `enemyUnits()` — `teamId !== 1`만 필터

### 1.2 현재 승패 판정
- `allyUnits().length === 0` → 패배
- `enemyUnits().length === 0` → 승리
- 단순 섬멸전만 가능, 커스텀 목표 미지원

### 1.3 현재 배치 시스템
- Region 200 기반 배치 존 스캔
- `_hasDeployableUnits()` → 아군 존재 여부만 체크
- **현재 비활성** (`if (false && ...)`)

---

## 2. 팀 시스템 확장

### 2.1 팀 슬롯 (Team Slot)
기존 8팀 컬러 유지. 맵별로 사용할 팀을 **맵 노트태그**로 정의한다.

```
<srpgTeams:1,2>          // 2팀 (표준 1v1)
<srpgTeams:1,2,3>        // 3팀 (3파전)
<srpgTeams:1,2,3,4>      // 4파전
```

### 2.2 동맹 매트릭스 (Alliance Matrix)
팀 간 관계를 맵 노트태그로 정의한다. 정의하지 않은 쌍은 기본 **적대**.

```
<srpgAlliance:1-3>       // 팀1과 팀3은 동맹
<srpgAlliance:2-4>       // 팀2와 팀4는 동맹
```

**런타임 데이터 구조:**
```javascript
SM._allianceMatrix = {
    "1-2": "hostile",   // 기본값
    "1-3": "ally",      // <srpgAlliance:1-3>
    "2-3": "hostile",   // 기본값
};

// 조회 함수
SM.areAllied(teamA, teamB)   // → true/false
SM.areHostile(teamA, teamB)  // → true/false
```

### 2.3 isHostileTo 교체
```javascript
// 기존
isHostileTo(other) {
    if (this.teamId === 0 || other.teamId === 0) return true;
    return other.teamId !== this.teamId;
}

// 신규
isHostileTo(other) {
    if (!other) return false;
    if (this.teamId === 0 || other.teamId === 0) return true;  // 중립은 항상 적대
    if (this.teamId === other.teamId) return false;             // 같은 팀은 우호
    return SM.areHostile(this.teamId, other.teamId);            // 매트릭스 조회
}
```

### 2.4 allyUnits / enemyUnits 교체
```javascript
// 기존: teamId === 1만 아군
// 신규: 지정 팀 + 동맹 팀 모두 반환
allyUnitsOf(teamId) {
    return this._units.filter(u => u.isAlive() && !u.isObject &&
        (u.teamId === teamId || this.areAllied(u.teamId, teamId)));
},
enemyUnitsOf(teamId) {
    return this._units.filter(u => u.isAlive() && !u.isObject &&
        this.areHostile(u.teamId, teamId));
},
// 하위 호환
allyUnits()  { return this.allyUnitsOf(1); },
enemyUnits() { return this.enemyUnitsOf(1); },
```

### 2.5 팀 소속 턴 제어
현재 `teamId === 1`이면 playerTurn, 아니면 enemyTurn. 확장:
- **플레이어 제어 팀**: `<srpgPlayerTeam:1>` (기본값 1). 플레이어가 직접 조작.
- **AI 제어 팀**: 나머지 모든 팀은 AI가 조작.
- 향후 멀티 플레이어 제어 팀 확장 가능 (`<srpgPlayerTeam:1,3>` — 1팀과 3팀 둘 다 플레이어)

```javascript
SM._playerTeams = new Set([1]);  // 기본
isPlayerControlled() { return SM._playerTeams.has(this.teamId); }
```

---

## 3. 전투 모드 시스템

### 3.1 전투 모드 열거
맵 노트태그: `<srpgBattleMode:모드명>`

| 모드 | 태그값 | 승리 조건 | 패배 조건 |
|------|--------|----------|----------|
| 섬멸전 | `annihilation` | 적 팀 유닛 전멸 | 아군 팀 유닛 전멸 |
| 대장전 | `commander` | 적 대장 처치 | 아군 대장 처치 |
| 호위전 | `escort` | 호위 대상 생존 + 적 전멸 or 호위 대상 도착 | 호위 대상 사망 |
| 깃발전 | `capture` | 깃발을 아군 진지로 운반 | 적이 먼저 운반 or 아군 전멸 |
| 점령전 | `domination` | 지정 거점 N개 모두 점령 | 적이 먼저 점령 or 턴 제한 초과 |
| 방어전 | `defense` | N턴 생존 | 아군 전멸 or 방어 대상 파괴 |
| 도망전 | `escape` | 아군 M명 이상 탈출 지점 도달 | 아군 전멸 or 턴 제한 초과 |

### 3.2 전투 모드별 추가 파라미터
맵 노트태그로 지정:

```
// 대장전
<srpgCommander:1:evId>       // 팀1 대장 = 이벤트 ID
<srpgCommander:2:evId>       // 팀2 대장

// 호위전
<srpgEscort:evId1,evId2>     // 호위 대상 이벤트 ID 목록
<srpgEscortGoal:x,y>         // 호위 대상 도착 지점 (선택)
<srpgEscortFollow:evId>      // 호위 대상이 따라갈 아군 이벤트 ID (선택)
<srpgEscortPath:x1,y1|x2,y2|x3,y3>  // 고정 이동 경로 (선택)

// 깃발전
<srpgFlag:x,y>               // 깃발 위치
<srpgFlagBase:1:x,y>         // 팀1 진지 위치
<srpgFlagBase:2:x,y>         // 팀2 진지 위치

// 점령전
<srpgCapPoint:x,y>           // 거점 위치 (복수 가능)
<srpgCapCount:3>             // 승리에 필요한 거점 수
<srpgCapTurns:2>             // 점령에 필요한 점유 턴 수

// 방어전
<srpgDefenseTurns:10>        // 생존 목표 턴 수
<srpgSpawnWave:turn,evId,x,y> // 적 스폰 웨이브 (복수 가능)
<srpgDefenseTarget:evId>     // 방어 대상 오브젝트 (선택)

// 도망전
<srpgEscapeZone:x1,y1,x2,y2>  // 탈출 구역 (사각형)
<srpgEscapeCount:3>            // 탈출 필요 인원
<srpgEscapeTurnLimit:15>       // 턴 제한
```

### 3.3 전투 모드 체커 (BattleModeChecker)
기존 하드코딩된 승패 판정을 모듈화한다.

```javascript
const BattleModeChecker = {
    modes: {},

    register(name, checker) {
        this.modes[name] = checker;
    },

    check(modeName) {
        const checker = this.modes[modeName] || this.modes["annihilation"];
        return checker.check(); // → "victory" | "defeat" | null
    }
};
```

각 모드는 `check()` 함수를 가진 오브젝트:

```javascript
BattleModeChecker.register("annihilation", {
    check() {
        if (SM.allyUnits().length === 0) return "defeat";
        if (SM.enemyUnits().length === 0) return "victory";
        return null;
    }
});

BattleModeChecker.register("commander", {
    check() {
        const params = SM._battleModeParams;
        // 아군 대장 생존 체크
        const allyCmd = SM._units.find(u => u.event.eventId() === params.allyCommander);
        if (!allyCmd || !allyCmd.isAlive()) return "defeat";
        // 적 대장 생존 체크
        const enemyCmd = SM._units.find(u => u.event.eventId() === params.enemyCommander);
        if (!enemyCmd || !enemyCmd.isAlive()) return "victory";
        return null;
    }
});

BattleModeChecker.register("defense", {
    check() {
        const params = SM._battleModeParams;
        if (SM.allyUnits().length === 0) return "defeat";
        // 방어 대상 있으면 체크
        if (params.defenseTarget) {
            const target = SM._units.find(u => u.event.eventId() === params.defenseTarget);
            if (!target || !target.isAlive()) return "defeat";
        }
        // 목표 턴 도달 체크
        if (SM._turnNumber >= params.defenseTurns) return "victory";
        return null;
    }
});

// ... 나머지 모드도 동일 패턴
```

### 3.4 SM 통합
기존 승패 판정 코드(SRPG_SM.js 라인 412~422)를 교체:

```javascript
// 기존
if (this.allyUnits().length === 0) { this._showBanner("패배...", ...); ... }
if (this.enemyUnits().length === 0) { this._showBanner("승리!", ...); ... }

// 신규
const result = BattleModeChecker.check(this._battleMode);
if (result === "defeat") {
    this._showBanner("패배...", "#ff4444");
    this._phase = "banner"; this._subPhase = "defeat";
} else if (result === "victory") {
    this._showBanner("승리!", "#44ff44");
    this._phase = "banner"; this._subPhase = "victory";
}
```

---

## 4. 전투 이전 처리 (기습 / 배치)

### 4.1 기습 시스템
맵 노트태그: `<srpgAmbush:팀ID>` 또는 `<srpgAmbush:none>`

| 설정 | 효과 |
|------|------|
| `<srpgAmbush:none>` | 기본값. 상호 배치. |
| `<srpgAmbush:1>` | 팀1이 기습. 팀1은 확장 배치존, 나머지 팀은 배치 불가(초기 위치 고정). |
| `<srpgAmbush:2>` | 팀2가 기습. 팀2는 기습 보너스, 팀1은 초기 위치 고정. |

**기습 효과:**
- **기습하는 쪽**: 첫 턴 선공 보장 (모든 유닛 AP +100), 확장 배치존 (region 201~205)
- **기습당하는 쪽**: 배치 페이즈 스킵(초기 위치 고정), 첫 턴 AP -50
- **상호 배치**: 양쪽 모두 표준 배치존 (region 200)

### 4.2 배치 존 (Deploy Zone)
리전 ID로 배치 가능 영역을 지정한다.

| 리전 | 용도 |
|------|------|
| 200 | 표준 배치 존 (모든 플레이어 팀 공용) |
| 201~208 | 팀별 전용 배치 존 (팀1=201, 팀2=202, ...) |

```javascript
_getDeployRegion(teamId) {
    const teamRegion = 200 + teamId;   // 팀 전용 존
    const commonRegion = 200;           // 공용 존
    const tiles = new Set();
    const w = $gameMap.width(), h = $gameMap.height();
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const r = $gameMap.regionId(x, y);
            if (r === teamRegion || r === commonRegion) {
                tiles.add(x + "," + y);
            }
        }
    }
    return tiles;
}
```

### 4.3 기습 시 배치 플로우
```
startBattle()
  → 맵 노트 파싱 (battleMode, ambush, teams, alliance)
  → _collectUnits()
  → 기습 판정:
      기습 당하는 팀 → 배치 스킵, AP 감소
      기습 하는 팀 → 확장 배치존, AP 증가
      상호 배치 → 양쪽 표준 배치
  → 배치 페이즈 (플레이어 팀만, AI 팀은 초기 위치 유지)
  → turnAdvance
```

---

## 5. 전투 이후 처리

### 5.1 승리/패배 분기
`_phase === "battleEnd"` 진입 시:

```javascript
_processBattleEnd() {
    const result = this._subPhase; // "victory" | "defeat"

    // 1) KO 유닛 복구
    this._processKnockedOutActors(result);

    // 2) 보상 지급 (승리 시)
    if (result === "victory") {
        this._processBattleRewards();
    }

    // 3) 이벤트 트리거
    //    맵 노트: <srpgVictoryEvent:commonEventId>
    //    맵 노트: <srpgDefeatEvent:commonEventId>
    const eventId = result === "victory"
        ? this._battleModeParams.victoryEvent
        : this._battleModeParams.defeatEvent;
    if (eventId) {
        $gameTemp.reserveCommonEvent(eventId);
    }

    // 4) 전투 상태 정리
    this._cleanup();
}
```

### 5.2 전투불능(KO) 액터 처리
설계 옵션 3가지 중 **옵션 B**를 기본 채택하되, 맵 노트태그로 변경 가능:

| 옵션 | 태그 | 설명 |
|------|------|------|
| A | `<srpgKoPolicy:remove>` | 전투불능 = 영구 퇴장 (파이어엠블렘 클래식) |
| B | `<srpgKoPolicy:recover>` | 전투 후 HP 1로 자동 복구 (기본값) |
| C | `<srpgKoPolicy:reserve>` | 전투불능 시 reserve로, 다음 전투에서 수동 복구 |

```javascript
_processKnockedOutActors(result) {
    const policy = this._battleModeParams.koPolicy || "recover";
    const koActors = this._koActorIds; // 전투 중 KO된 액터 ID 목록

    for (const actorId of koActors) {
        const actor = $gameActors.actor(actorId);
        if (!actor) continue;

        switch (policy) {
            case "remove":
                // 파티에서 제거 (영구 퇴장)
                $gameParty.removeActor(actorId);
                break;
            case "recover":
                // HP 1로 복구, 전투불능 상태 해제
                actor.setHp(1);
                actor.removeState(1); // 전투불능 상태 해제
                break;
            case "reserve":
                // 파티에서 뺀 뒤 특수 reserve 배열에 보관
                $gameParty.removeActor(actorId);
                $gameParty._reserveActors = $gameParty._reserveActors || [];
                if (!$gameParty._reserveActors.includes(actorId)) {
                    $gameParty._reserveActors.push(actorId);
                }
                break;
        }
    }
}
```

### 5.3 KO 추적
유닛 사망 시 기록:

```javascript
// SrpgUnit.die() 또는 HP <= 0 처리 시
if (unit.isActor() && unit.actorId > 0) {
    SM._koActorIds = SM._koActorIds || [];
    SM._koActorIds.push(unit.actorId);
}
```

---

## 6. 전투 모드별 런타임 로직

### 6.1 호위전 (Escort)
호위 대상은 **중립 팀(teamId=0)의 유닛**으로, 특수 AI를 가진다.

```javascript
// 호위 대상 AI (enemyTurn에서 처리, teamId=0이지만 적대가 아닌 특수 분류)
// 호위 대상의 isHostileTo는 적 팀에만 true
// 이동 로직:
//   followTarget가 있으면 → 해당 아군 유닛 쪽으로 이동
//   path가 있으면 → 경로 웨이포인트 순서대로 이동
//   둘 다 없으면 → 제자리

<srpgEscortAI:follow:actorEventId>   // 특정 아군 따라감
<srpgEscortAI:path>                  // 고정 경로 이동
<srpgEscortAI:stay>                  // 제자리 (기본)
```

호위 대상 전용 `teamId` 할당:
- 호위 대상은 **팀 0 (중립)**이지만, 적에게만 적대적이 아닌 **특수 중립** 처리
- 새 관계 유형 도입: `<srpgNeutralFriendly:1>` — 팀1에게는 우호적, 나머지에게는 중립

### 6.2 깃발전 (Capture the Flag)
깃발은 **맵 이벤트** (srpgObject)로 구현.
- 유닛이 깃발 타일 위에서 "줍기" 행동 → 깃발 소지 상태
- 깃발 소지 유닛이 KO → 깃발 현재 위치에 드롭
- 깃발 소지 유닛이 진지 도달 → 승리

```
<srpgObjectType:flag>
<srpgFlagTeam:0>     // 중립 깃발 (어느 팀이든 집을 수 있음)
```

### 6.3 점령전 (Domination)
거점은 **맵 이벤트** (srpgObject, 파괴 불가)로 구현.
- 유닛이 거점 위에 서 있으면 점유 게이지 축적
- 적 유닛이 올라서면 게이지 감소 → 0 → 적 팀 점유 시작
- 게이지 풀 → 점령 완료 (오너 팀 변경)

```
<srpgObjectType:capPoint>
<srpgCapTurnsRequired:2>   // 2턴 점유로 점령
```

### 6.4 방어전 (Defense)
- 턴 카운터 UI 표시 (현재턴 / 목표턴)
- 웨이브 스폰: 지정 턴에 지정 위치에 적 유닛 자동 생성
- 스폰은 `SrpgSummon.summon()` 재활용

```javascript
_checkSpawnWaves() {
    const waves = this._battleModeParams.spawnWaves || [];
    for (const wave of waves) {
        if (SM._turnNumber === wave.turn && !wave.spawned) {
            SrpgSummon.summon(wave.x, wave.y, wave.template, null);
            wave.spawned = true;
        }
    }
}
```

### 6.5 도망전 (Escape)
- 탈출 구역을 리전 또는 좌표 사각형으로 지정
- 아군 유닛이 탈출 구역에 진입 + 턴 종료 → 탈출 처리 (맵에서 제거, 카운트 증가)
- 탈출 인원 >= 목표 → 승리

---

## 7. 스튜디오 UI 설계

### 7.1 SRPG 맵 설정 패널
맵 에디터 우측 패널에 **"SRPG 전투 설정"** 탭 추가.

```
┌─────────────────────────────────────┐
│  📋 SRPG 전투 설정                    │
├─────────────────────────────────────┤
│                                     │
│  전투 모드: [섬멸전 ▼]               │
│                                     │
│  ── 참전 팀 ──                      │
│  ☑ 팀1 (파랑) 🟦  [플레이어 제어]    │
│  ☑ 팀2 (빨강) 🟥  [AI 제어]         │
│  ☐ 팀3 (청록) 🟩  [AI 제어]         │
│  ☐ 팀4 (보라)     [AI 제어]         │
│  ...                                │
│                                     │
│  ── 팀 관계 매트릭스 ──              │
│       팀1   팀2   팀3               │
│  팀1  ──   적대   동맹              │
│  팀2  적대  ──    적대              │
│  팀3  동맹  적대   ──               │
│  (셀 클릭으로 적대↔동맹 토글)        │
│                                     │
│  ── 기습 설정 ──                    │
│  ◉ 상호 배치  ○ 아군 기습  ○ 적 기습│
│                                     │
│  ── KO 정책 ──                      │
│  ◉ 전투 후 복구  ○ 영구 퇴장  ○ 예비 │
│                                     │
│  ── 모드별 추가 설정 ──              │
│  (전투 모드에 따라 동적 표시)         │
│  예: 방어전 → 생존 턴: [10]         │
│      도망전 → 탈출 인원: [3]         │
│                                     │
│  [SRPG 이벤트 자동 생성]  ← 버튼     │
│                                     │
└─────────────────────────────────────┘
```

### 7.2 팀 컬러 오버레이
맵 캔버스에서 이벤트 위에 팀 컬러 아이콘 표시:
- 각 SRPG 유닛 이벤트 위에 해당 팀 컬러의 작은 원 (8px)
- 오브젝트는 회색 사각형
- NPC(비 SRPG)는 표시 없음
- **이벤트 모드**에서만 표시

```
맵 캔버스:
  🟦 리드    🟦 프리실라
  🟦 게일    🟦 미쉘
  🟦 알버트  🟦 케이시

            🟥 고블린   🟥 고블린
         🟥 까마귀      🟥 난쟁이
  ⬜ 보물상자
                        🟥 나무거인
```

### 7.3 유닛 배치 도구
이벤트 모드에서 SRPG 유닛을 빠르게 배치하는 전용 도구.

**유닛 팔레트** (맵 에디터 우측 하단):
```
┌─────────────────────────────────┐
│  SRPG 유닛 배치                  │
├─────────────────────────────────┤
│  팀: [팀1 (파랑) ▼]             │
│                                 │
│  ── 아군 액터 ──                │
│  [리드] [프리실라] [게일]        │
│  [미쉘] [알버트]  [케이시]       │
│  [엘리엇] [로자]                │
│                                 │
│  ── 적 유닛 ──                  │
│  [고블린전사] [난쟁이마법사]      │
│  [까마귀정찰병] [나무거인]        │
│                                 │
│  ── 오브젝트 ──                 │
│  [바리케이드] [보물상자] [거점]   │
│  [깃발] [탈출지점]               │
│                                 │
│  선택 후 맵 클릭 → 배치          │
└─────────────────────────────────┘
```

**동작 플로우:**
1. 팔레트에서 유닛 선택 (예: "고블린전사")
2. 팀 드롭다운에서 팀 선택 (예: "팀2 빨강")
3. 맵 캔버스 클릭 → 해당 위치에 이벤트 자동 생성
4. 생성된 이벤트에 SRPG 노트태그 자동 삽입

### 7.4 SRPG 이벤트 자동 생성
"SRPG 이벤트 자동 생성" 버튼 클릭 시, 현재 설정 기반으로 필수 이벤트를 자동 생성:

| 이벤트 | 내용 | 트리거 |
|--------|------|--------|
| SRPG 컨트롤러 | `SrpgManager.startBattle()` 호출 | Autorun (1회) |
| 승리 처리 | 커먼이벤트 호출 or 인라인 스크립트 | — (SM이 자동 호출) |
| 패배 처리 | 게임오버 or 커먼이벤트 호출 | — (SM이 자동 호출) |

**핵심: 컨트롤러 이벤트 하나만 생성하면 되도록 설계.**  
기존의 별도 "승리/패배 감시" 병렬 이벤트는 불필요해짐 (BattleModeChecker가 SM 내부에서 처리).

### 7.5 전투 모드별 UI 확장

**대장전 선택 시:**
```
대장 지정:
  아군 대장: [리드 (Ev2) ▼]
  적군 대장: [나무거인 (Ev17) ▼]
```

**호위전 선택 시:**
```
호위 대상: [마을 주민 (Ev20) ▼] [+ 추가]
호위 AI:  ◉ 아군 추종  ○ 고정 경로  ○ 제자리
추종 대상: [리드 (Ev2) ▼]
```

**방어전 선택 시:**
```
생존 턴: [10]
방어 대상: [없음 ▼]
── 스폰 웨이브 ──
턴 3: 고블린전사 ×2 at (30,5)  [삭제]
턴 6: 까마귀정찰병 ×3 at (35,10) [삭제]
[+ 웨이브 추가]
```

**도망전 선택 시:**
```
탈출 구역: 리전 [250 ▼] (맵에서 페인트)
탈출 인원: [3]
턴 제한: [15] (0 = 무제한)
```

**점령전 선택 시:**
```
── 거점 목록 ──
거점1: (20,15) [맵에서 선택]
거점2: (30,25) [맵에서 선택]
[+ 거점 추가]
점령 필요 수: [2]
점유 턴: [2]
```

---

## 8. 맵 노트태그 종합

모든 SRPG 전투 설정은 맵 노트에 저장된다. 스튜디오 UI가 이를 읽고 쓴다.

```
<srpgBattleMode:annihilation>
<srpgTeams:1,2>
<srpgPlayerTeam:1>
<srpgAlliance:1-3>
<srpgAmbush:none>
<srpgKoPolicy:recover>
<srpgDeployRegion:200>
<srpgVictoryEvent:1>
<srpgDefeatEvent:2>

// 대장전
<srpgCommander:1:2>
<srpgCommander:2:17>

// 방어전
<srpgDefenseTurns:10>
<srpgSpawnWave:3,1,30,5>
<srpgSpawnWave:6,3,35,10>

// 도망전
<srpgEscapeRegion:250>
<srpgEscapeCount:3>
<srpgEscapeTurnLimit:15>
```

---

## 9. 구현 계획

### Phase 1: 팀 시스템 확장 (SRPG_Data.js)
- 동맹 매트릭스 데이터 구조 + 파서
- `isHostileTo()` 교체
- `allyUnitsOf()` / `enemyUnitsOf()` 추가
- `isPlayerControlled()` 확장
- TEAM_COLORS는 기존 유지

### Phase 2: BattleModeChecker 모듈 (SRPG_Data.js)
- 7가지 전투 모드 체커 등록
- 맵 노트태그 파서 (battleMode, 모드별 파라미터)

### Phase 3: SM 전투 플로우 확장 (SRPG_SM.js)
- `startBattle()` — 맵 노트 파싱, 기습 처리, 배치 페이즈 활성화
- 승패 판정을 BattleModeChecker로 교체
- `endBattle()` — KO 정책 처리, 이벤트 트리거
- 호위/깃발/점령/방어/도망 런타임 로직

### Phase 4: 배치 페이즈 완성 (SRPG_SM.js)
- 기습에 따른 배치존 차별화
- 팀별 배치 리전 (200~208)
- 배치 페이즈 재활성화 + UI 개선

### Phase 5: SRPG 전투 플러그인 (SRPG_BattleMode.js)
- 위 Phase 1~4를 별도 플러그인으로 분리할지 SRPG_Core에 통합할지 결정
- 맵 노트 파싱/체크 로직은 SRPG_Data.js에, 런타임은 SRPG_SM.js에 배치

### Phase 6: 스튜디오 UI (RMMZStudio.html)
- SRPG 전투 설정 패널
- 팀 관계 매트릭스 에디터
- 유닛 배치 팔레트
- 모드별 동적 UI
- 이벤트 자동 생성 기능
- 팀 컬러 오버레이

### Phase 7: 통합 검증
- 각 모드별 시뮬레이션 테스트
- 스튜디오 ↔ 인게임 데이터 흐름 검증
- 기존 기능 호환성 확인

---

## 10. 파일 변경 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/SRPG_Data.js` | 동맹 매트릭스, BattleModeChecker, 팀 확장, KO 추적 |
| `src/SRPG_SM.js` | startBattle 확장, 승패 교체, 배치 활성화, 기습, 모드 런타임 |
| `RMMZStudio.html` | SRPG 패널, 팀 매트릭스, 유닛 팔레트, 이벤트 자동생성 |
| `plugins.js` | SRPG_Core 파라미터에 기본 전투모드 관련 설정 추가 |
