# SRPG_CombatAI.js — 전투 AI 플러그인 설계서

## 1. 개요

**목적**: 현재 SRPG_Core의 `_enemyDecide()`에 하드코딩된 단순 AI를 독립 플러그인으로 분리하고, 액터와 몬스터 모두에게 적용되는 범용 전투 AI 시스템을 구축한다.

**핵심 원칙**:
- **액터/몬스터 구분 없음**: AI는 `SrpgUnit`에 대해 동작한다. 플레이어 조작 여부는 `isPlayerControlled()`로만 결정된다.
- **노트태그 기반 설정**: 각 액터/몬스터의 노트태그로 AI 프로필을 지정한다.
- **모듈식 평가 함수**: 타일 평가, 타겟 평가, 스킬 선택을 독립 함수로 분리하여 확장성을 확보한다.
- **기존 시스템 완전 연동**: 장판, 측면/배면, 고저차, ZoC, 기회공격, 투사체 차단, 시야, 은신 등 이미 구현된 전술 시스템을 AI가 모두 인식한다.

---

## 2. 현행 AI 분석 (교체 대상)

### 현재 `SM._enemyDecide()` 구조
```
1. 적 전용 (아군 AI 없음)
2. _selectEnemySkill() → RMMZ 행동 패턴 기반 스킬 선택 (조건/rating)
3. 이동 범위 내 모든 타일 순회 → 공격 가능 타겟 탐색
4. 평가 기준: TGR 가중 거리 + 장판 위험도
5. 공격 불가 시 → 가장 가까운 적에게 접근
6. 접근도 불가 시 → 대기
```

### 문제점
- **적 전용**: 아군 NPC, 동맹 팀, 자동전투 액터에 적용 불가
- **단일 전략**: "가장 가까운 적 공격"만 가능. 힐러, 서포터, 원거리 딜러 등 역할별 행동 불가
- **위치 평가 부재**: 이동 후 위치의 방어적 가치(엄폐, 고저차, 배면 노출)를 고려하지 않음
- **팀 전술 부재**: 집중 공격, 분산, 핀서(협공) 등 협동 판단 없음
- **보조 행동 미사용**: bonusAction(투척, 아이템 등)을 AI가 활용하지 않음
- **스킬 범위 최적화 부재**: 범위 스킬의 최적 타겟 위치 계산 없음

---

## 3. 오행 기반 AI 성향 파생

### 3.1 설계 철학: "AI도 원국에서 나온다"

이 게임의 캐릭터 빌딩은 사주팔자(원국)에서 시작한다. 스탯, 성격, 기질, 아키타입이 모두 오행 비율에서 파생되는데, 전투 AI만 노트태그로 따로 지정하면 세계관이 끊어진다. 따라서 **AI 프로필을 오행 비율에서 자동 파생**하는 것을 기본으로 하고, 노트태그는 오버라이드용으로만 쓴다.

### 3.2 GahoSystem 연동 — getCombatTendency()

`GahoSystem.getCombatTendency(actorId)`가 이미 오행 비율을 전투 역할 5축으로 변환하고 있다:

```
목(木) → attack   기동/침투    — 직접 이동, 측배면 공격
화(火) → burst    화력/버스트  — 일점 집중, 킬 확인
토(土) → defense  방어/지원    — 아군 보호, 진지 사수
금(金) → mobility 대기/확살    — 자리 사수, 기회 포착, 확인사살
수(水) → strategy 전략/디버프  — 원거리 교란, 상태이상
```

AI는 이 5축 비율을 읽어서 각 평가 함수의 가중치를 동적으로 조절한다.

### 3.3 오행 → AI 가중치 매핑

| 평가 항목 | 목(attack) | 화(burst) | 토(defense) | 금(mobility) | 수(strategy) |
|-----------|-----------|-----------|-------------|-------------|-------------|
| **공격성(aggro)** | ×1.5 | ×2.0 | ×0.3 | ×0.5 | ×0.5 |
| **킬 확인 가중** | ×1.0 | ×2.5 | ×0.5 | ×2.5 | ×0.8 |
| **아군 보호 가중** | ×0.5 | ×0.3 | ×2.5 | ×0.5 | ×1.0 |
| **회복/버프 우선** | ×0.3 | ×0.2 | ×2.0 | ×0.3 | ×1.5 |
| **엄폐/고지 선호** | ×0.5 | ×0.5 | ×1.5 | ×1.5 | ×1.5 |
| **배면공격 가중** | ×2.5 | ×1.5 | ×0.3 | ×0.5 | ×0.8 |
| **장판 활용** | ×0.5 | ×1.0 | ×0.5 | ×0.8 | ×2.0 |
| **거리 유지** | ×0.3 | ×0.5 | ×1.0 | ×1.0 | ×2.0 |
| **ZoC 벽 형성** | ×0.5 | ×0.3 | ×2.5 | ×1.5 | ×0.3 |
| **디버프 스킬 선호** | ×0.3 | ×0.5 | ×0.5 | ×0.8 | ×2.5 |
| **AoE 최적화** | ×0.5 | ×2.0 | ×0.5 | ×0.5 | ×1.5 |

### 3.4 자동 프로필 결정 로직

```javascript
SrpgAI.deriveProfile(unit) {
    // 1) 액터면 GahoSystem에서 오행 비율 가져오기
    if (unit.team === 'actor' && GahoSystem) {
        const tendency = GahoSystem.getCombatTendency(unit.actorId);
        // dominant 축으로 기본 프로필 결정
        switch (tendency.dominant) {
            case 'attack':   return 'assassin';       // 목 — 측배면 침투
            case 'burst':    return 'assassin';       // 화
            case 'defense':  return 'guardian';        // 토
            case 'mobility': return 'ambush';          // 금 — 자리 사수+확인사살
            case 'strategy': return 'support';         // 수
        }
    }
    // 2) 몬스터 또는 가호 데이터 없는 경우 → 스킬셋 분석
    if (unit.hasHealSkill) return 'healer';
    if (unit.atkRange >= 4) return 'ranged_sniper';
    return 'default';
}
```

**중요**: 이것은 "기본값"이다. 목 비율이 높아도 궁수 장비를 쓰는 액터가 있을 수 있으므로, 스킬셋과 무장을 2차 보정으로 반영한다. 예를 들어 dominant가 'attack'(목)이지만 사거리 6 + 직사 스킬을 보유한 액터라면 `melee_fighter`가 아니라 `ranged_fighter`로 보정된다.

### 3.5 오행 상성 — 타겟 선택 반영

`GahoSystem.getElementAffinity(atkId, defId)`를 타겟 평가에 반영:

```
상극 우위 (OVR): 타겟 점수 +15% → 이 적을 우선 공격
상극 열세 (WEAK): 타겟 점수 -15% → 이 적은 기피
상생 (GEN): 타겟 점수 -5% → 약간 회피 (상대가 나를 이롭게 함)
동기 (SAME): 변동 없음
```

이를 통해 같은 전장에서 적 A와 적 B가 있을 때, 오행 상극 우위인 적을 자연스럽게 우선 노리게 된다.

### 3.6 몬스터의 오행

몬스터는 GahoSystem(사주)이 없다. 대신 두 가지 방법으로 오행을 부여:

**방법 A — 노트태그 직접 지정**:
```
<srpgElement:fire>          ← 일간 오행 (화)
<srpgElemRatio:10,40,15,15,20>  ← 목/화/토/금/수 비율 직접 지정
```

**방법 B — RMMZ 속성에서 자동 매핑**:
시스템에 이미 원소 속성(화염, 얼음, 번개 등)이 있으므로, 몬스터의 주 공격 속성에서 오행을 파생:
```
화염/번개 → 화(火)
얼음/물   → 수(水)  
땅/독     → 토(土)
바람      → 목(木)
물리/무   → 금(金)
```

이렇게 하면 몬스터도 오행 기반 AI 가중치를 자동으로 가질 수 있다.

### 3.7 오행 비율에 따른 행동 예시

**목(木) 40% 유닛** — "기동 침투자"
- 정면 돌파보다 우회해서 적의 측면/배면으로 파고듦
- 적 진형의 빈틈을 찾아 직접 이동, 뒤를 잡으면 집중 공격
- ZoC를 피해 돌아가는 경로를 선호, 한번 붙으면 놓지 않음

**화(火) 45% 유닛** — "화력 집중형"
- 약한 적(HP 낮은)을 우선 노림
- 범위 스킬을 적이 뭉쳐있을 때 최대 효율로 사용
- 킬 확인에 집착, 반쯤 죽은 적을 마무리하러 이동
- 자기 보호에 무관심

**토(土) 35% 유닛** — "보호자"
- 아군 힐러나 약한 유닛 옆에 위치
- 적보다 아군 상태를 먼저 확인, 위험하면 회복/버프
- ZoC 벽을 형성하고, 거기서 안 움직임
- 후퇴 HP 임계가 낮음 (끝까지 자리 사수)

**금(金) 50% 유닛** — "냉혈 확인사살자"
- 유리한 자리를 잡으면 거기서 안 움직임
- 적이 사거리 내로 오기를 참을성 있게 기다림
- 약해진 적(HP 낮은)이 사거리에 들어오면 확인사살
- 확실한 킬이 아니면 행동을 아끼고, 기회가 오면 한 방에 마무리

**수(水) 40% 유닛** — "전술가"
- 디버프/상태이상 스킬을 최우선 사용
- 적 장판에 몰아넣는 위치로 밀치기/당기기 활용
- 직접 교전 회피, 최대 사거리 유지
- 아군 장판 위에서 교전하도록 유도

---

## 4. 일간/일지 이중 레이어 AI 아키텍처

### 4.1 설계 철학: "겉과 속이 다른 AI"

사주에서 **일간(日干)**은 자기 자신의 본질, 즉 세상에 드러나는 외적 행동 양식이고, **일지(日支)**는 내면의 성향, 즉 내적인 판단 기준이다. 이 이분법을 전투 AI에 그대로 적용한다:

```
일간 (天干, Day Stem) ── 외적 결정 레이어
  → 이동 동선, 타겟 선택, 위치 선정, 후퇴 판단
  → "어디로 가서 누구를 상대할 것인가"

일지 (地支, Day Branch) ── 내적 결정 레이어
  → 스킬 선택, 능력 사용, 전술적 판단
  → "무엇을 어떻게 사용할 것인가"
```

이를 통해 같은 오행(예: 화)이라도 일간이 丙(태양)인 유닛과 丁(등불)인 유닛의 전투 행동이 뚜렷하게 달라진다. 丙은 정면으로 돌격하지만, 丁은 같은 화 성향이면서도 은밀하게 약점을 파고드는 식이다.

### 4.2 일간 → 외적 행동 아키타입 (10종)

10천간 각각이 고유한 이동/타겟/포지셔닝 전략을 정의한다.

| 일간 | 이름 | 오행 | 음양 | 외적 아키타입 | 이동 성향 | 타겟 선택 | 포지셔닝 |
|------|------|------|------|--------------|----------|----------|---------|
| **甲** | 참나무 | 木 | 양 | **정면 침투자** | 적 진형을 관통하여 배면으로 돌파 | 측면/배면이 노출된 적 우선 | 적 후방 침투, 배면 확보 후 고정 |
| **乙** | 화분 | 木 | 음 | **은밀한 우회자** | ZoC를 피해 우회, 적 배면으로 침투 | 고립된 적, 배면이 비어있는 적 | 적 시야 밖으로 우회, 빈틈 파고들기 |
| **丙** | 태양 | 火 | 양 | **정면 돌격자** | 최단 경로로 가장 위협적인 적에게 돌격 | 가장 강한 적 (보스/탱커 우선) | 교전 거리를 0으로, 퇴로 무시 |
| **丁** | 등불 | 火 | 음 | **집요한 마무리꾼** | HP 낮은 적 쪽으로 정밀 이동 | 킬 확인 가능한 적 (HP < 예상 대미지) | 한 타겟에 집착, 마무리 후 다음 |
| **戊** | 산맥 | 土 | 양 | **부동의 방벽** | 거의 이동 안함, 초기 위치 사수 | 사거리 내 진입한 적만 상대 | 아군 중심부에 위치, ZoC 벽 극대화 |
| **己** | 쟁기 | 土 | 음 | **헌신적 보호자** | 가장 약한 아군 옆으로 이동 | 아군을 위협하는 적 우선 | 보호 대상 인접, 대신 맞기 |
| **庚** | 칼날 | 金 | 양 | **냉혈 매복자** | 유리한 위치 선점 후 이동 최소화 | HP 낮은 적 = 확인사살 대상 | 자리 사수, 사거리 내 진입한 약한 적 즉시 처형 |
| **辛** | 끌 | 金 | 음 | **인내의 저격수** | 초기 위치에서 거의 이동 안함 | 사거리 내 가장 약한 적, 킬 가능 시 우선 | 엄폐물 뒤 고정, 확실한 기회만 노림 |
| **壬** | 파도 | 水 | 양 | **자유로운 교란자** | 전장 전체를 돌아다님, 예측 불가 | 가장 고립된 적, 아군 근처 없는 적 | 위치 고정 안함, 매 턴 다른 곳 |
| **癸** | 물병 | 水 | 음 | **은밀한 전략가** | 수풀/은신 지형 선호, 느린 접근 | 상태이상에 취약한 적, 디버프 유지 대상 | 시야 밖 위치, 은신 유지 |

> **壬/癸 수정**: 壬(파도)과 癸(물병)은 같은 수(水)지만 양/음 차이로 완전히 다른 기동 패턴을 보인다.

#### 외적 레이어 가중치 상세

각 일간은 `scoreTile()`과 `scoreTarget()` 함수의 가중치를 다음과 같이 조절한다:

```javascript
// 일간별 외적 가중치 (기본값 대비 배율)
const ILGAN_WEIGHTS = {
  '甲': { // 정면 침투자 — 직접 이동해서 배면을 잡는다
    advance: 2.0,    // 적 방향 전진
    retreat: 0.3,    // 후퇴 기피
    flank: 2.0,      // 측면 우회 높음 (배면 확보용)
    zocForm: 0.5,    // ZoC 벽 형성 낮음 (돌파하는 쪽)
    coverSeek: 0.3,  // 엄폐 무관심 (이동 우선)
    nearest: 1.0,    // 거리보다 위치가 중요
    weakest: 0.8,
    isolated: 1.5,   // 고립 적 선호 (뒤잡기 쉬움)
    allyGuard: 0.3,  // 아군 보호 낮음 (침투 중)
    rearAttack: 3.0, // 배면 공격 극선호 ★
    rearSeek: 2.5,   // 배면 확보 위치로 이동 ★
  },
  '乙': { // 은밀한 우회자 — ZoC 피해서 배면 침투
    advance: 1.0,    retreat: 1.0,
    flank: 3.0,      // 우회 경로 극선호 ★
    zocForm: 0.2,    coverSeek: 1.0,
    zocAvoid: 2.5,   // 적 ZoC 회피 극선호 ★
    nearest: 0.3,    weakest: 1.0,
    isolated: 2.5,   // 고립 적 극선호 (뒤가 빈 적)
    allyGuard: 0.3,
    rearAttack: 2.5, // 배면 공격 높음 ★
    stealth: 1.5,    // 은밀 이동 선호
  },
  '丙': { // 정면 돌격자
    advance: 2.5,    retreat: 0.0,   // 후퇴 불가
    flank: 0.2,      zocForm: 0.5,
    coverSeek: 0.1,  nearest: 0.5,
    weakest: 0.3,
    strongest: 2.5,  // 강한 적 선호 (丙 전용)
    isolated: 0.3,   allyGuard: 0.2,
  },
  '丁': { // 집요한 마무리꾼
    advance: 1.2,    retreat: 0.5,
    flank: 1.0,      zocForm: 0.3,
    coverSeek: 0.8,  nearest: 0.8,
    weakest: 2.5,    // 약한 적 극선호 (킬 확인)
    killConfirm: 3.0, // 킬 가능 타겟 극선호 (丁 전용)
    isolated: 0.5,   allyGuard: 0.3,
  },
  '戊': { // 부동의 방벽
    advance: 0.1,    retreat: 0.1,   // 양쪽 다 안함
    flank: 0.1,      zocForm: 3.0,   // ZoC 극대화
    coverSeek: 1.5,  nearest: 1.5,
    weakest: 0.5,    isolated: 0.3,
    allyGuard: 2.0,
    stayPut: 2.5,    // 현재 위치 유지 보너스 (戊 전용)
  },
  '己': { // 헌신적 보호자
    advance: 0.3,    retreat: 0.8,
    flank: 0.3,      zocForm: 1.5,
    coverSeek: 1.0,  nearest: 0.5,
    weakest: 0.5,    isolated: 0.3,
    allyGuard: 3.0,  // 아군 보호 극대화
    allyProximity: 2.5, // 약한 아군 근접 선호 (己 전용)
  },
  '庚': { // 냉혈 매복자 — 자리 잡고 기다리다 확인사살
    advance: 0.3,    // 이동 최소화 ★
    retreat: 0.5,    // 후퇴도 안함
    flank: 0.3,      // 우회 안함 (자리에 있으니까)
    zocForm: 1.5,    // 자리에서 ZoC 형성
    coverSeek: 2.0,  // 엄폐 선호 (자리 잡을 곳)
    nearest: 0.5,
    weakest: 2.5,    // HP 낮은 적 극선호 (확인사살) ★
    killConfirm: 3.0, // 킬 가능 타겟 극선호 ★★
    isolated: 1.0,   allyGuard: 0.5,
    stayPut: 2.5,    // 현재 위치 유지 ★
    patience: 2.0,   // 확실한 기회까지 대기 (庚 전용) ★
  },
  '辛': { // 인내의 저격수 — 움직이지 않고 확실한 기회만 노린다
    advance: 0.1,    // 거의 이동 안함 ★
    retreat: 0.5,    // 후퇴도 안함 (자리 사수)
    flank: 0.2,      zocForm: 0.3,
    coverSeek: 2.5,  // 엄폐 극선호
    nearest: 0.3,
    weakest: 2.0,    // 약한 적 선호 (확인사살)
    killConfirm: 2.5, // 킬 가능 타겟 선호 ★
    keyTarget: 2.0,  // 핵심 타겟도 여전히 노림
    maxRange: 2.5,   // 최대 사거리 유지
    stayPut: 2.0,    // 자리 유지 ★
    patience: 2.5,   // 확실한 기회까지 대기 ★
    isolated: 0.5,   allyGuard: 0.3,
  },
  '壬': { // 자유로운 교란자
    advance: 1.0,    retreat: 1.0,
    flank: 1.5,      zocForm: 0.2,
    coverSeek: 0.5,
    nearest: 0.3,    weakest: 0.5,
    isolated: 2.5,   // 고립 적 극선호
    allyGuard: 0.5,
    unpredictable: 2.0, // 랜덤 위치 보너스 (壬 전용)
    roaming: 2.0,    // 넓은 범위 이동 선호 (壬 전용)
  },
  '癸': { // 은밀한 전략가
    advance: 0.5,    retreat: 1.5,
    flank: 1.0,      zocForm: 0.2,
    coverSeek: 2.0,
    nearest: 0.3,    weakest: 0.8,
    isolated: 1.0,   allyGuard: 0.5,
    stealth: 3.0,    // 은신/수풀 극선호 (癸 전용)
    debuffTarget: 2.5, // 디버프 취약 타겟 선호 (癸 전용)
  },
};
```

### 4.3 일지 → 내적 스킬 선택 패턴 (12종)

12지지 각각이 고유한 스킬 선택 성향과 전술적 판단 로직을 정의한다. 지지의 주신(主神) 캐릭터성이 그대로 전술에 반영된다.

| 일지 | 주신 | 오행 | 음양 | 내적 아키타입 | 스킬 선택 성향 | 전술적 특징 |
|------|------|------|------|-------------|--------------|-----------|
| **子** | 노크탄 | 水 | 양 | **교활한 책략가** | 디버프/상태이상 최우선, 독/혼란/수면 | 상태이상 중첩, 한 타겟에 여러 디버프 |
| **丑** | 그란디르 | 土 | 음 | **느긋한 지구전가** | 방어 버프 우선, 자기 강화, 저코스트 스킬 | MP 절약, 장기전 대비, 지속 효과 선호 |
| **寅** | 프레간 | 木 | 양 | **용맹한 일격자** | 최고 위력 단일 대상 스킬, 필살기 | 가장 강한 스킬 바로 사용, MP 아끼지 않음 |
| **卯** | 플로렌 | 木 | 음 | **다정한 치유사** | 회복/버프 최우선, 아군 지원 | 아군 HP 확인 후 회복, 버프 순서 최적화 |
| **辰** | 레그나스 | 土 | 양 | **오만한 지배자** | AoE/범위 스킬 선호, 가장 많은 적 포함 | 범위 최적화, 아군 피해 무시 성향 |
| **巳** | 벨리스 | 火 | 음 | **총명한 분석가** | 적 약점 속성 공격, 속성 상성 최적화 | 속성 상성 우위 스킬 선택, 내성 있는 스킬 회피 |
| **午** | 솔란 | 火 | 양 | **성급한 선제자** | 가장 빠른 스킬, 선제 공격, 연속 행동 | 행동 속도 보너스 스킬, 추가 행동 기회 스킬 |
| **未** | 큐라 | 土 | 음 | **과묵한 인내자** | 카운터/반격 스킬, 대기 상태 스킬 | 방어 태세 후 반격, 조건부 발동 스킬 선호 |
| **申** | 크리시스 | 金 | 양 | **엄격한 심판자** | 확정 대미지/관통 스킬, 방어무시 | 방어 높은 적에게 관통 스킬, 확률 스킬 기피 |
| **酉** | 스펠라 | 金 | 음 | **깐깐한 장인** | 콤보/연계 스킬, 조건부 강화 | 스킬 순서 최적화, 콤보 세팅→마무리 순서 |
| **戌** | 에르미탄 | 土 | 양 | **완고한 수호자** | 아군 보호 스킬, 대신 맞기, 커버 | 보호 대상 지정, 위협받는 아군에게 방패 |
| **亥** | 레바 | 水 | 음 | **게으른 기회주의자** | 저코스트 스킬 선호, 가끔 대박 스킬 | 평소 약한 스킬, HP/MP 비율 보고 가끔 전력 |

#### 내적 레이어 가중치 상세

각 일지는 `selectSkill()` 함수의 스킬 평가 가중치를 조절한다:

```javascript
// 일지별 내적 가중치 (스킬 rating 보정)
const ILJI_WEIGHTS = {
  '子': { // 교활한 책략가
    debuff: 3.0,     // 디버프 스킬 극선호
    damage: 0.5,     heal: 0.3,
    buff: 0.8,       aoe: 1.0,
    lowCost: 0.8,    highCost: 1.2,
    statusStack: 2.0, // 이미 디버프 걸린 적에 추가 디버프
  },
  '丑': { // 느긋한 지구전가
    debuff: 0.5,     damage: 0.8,
    heal: 1.2,       buff: 2.0,     // 자기 버프 선호
    aoe: 0.5,
    lowCost: 2.5,    // 저코스트 극선호
    highCost: 0.3,
    sustained: 2.0,  // 지속 효과 스킬 선호
  },
  '寅': { // 용맹한 일격자
    debuff: 0.2,     damage: 3.0,   // 최고 대미지 스킬
    heal: 0.1,       buff: 0.3,
    aoe: 0.8,
    lowCost: 0.3,
    highCost: 2.0,   // 고코스트 = 강한 스킬
    singleTarget: 2.0, // 단일 대상 선호
  },
  '卯': { // 다정한 치유사
    debuff: 0.2,     damage: 0.3,
    heal: 3.0,       // 회복 극선호
    buff: 2.5,       // 버프도 높음
    aoe: 1.0,        // 범위 회복 선호
    lowCost: 1.0,    highCost: 1.0,
    allyLowHp: 2.5,  // 아군 HP 낮을수록 회복 우선
  },
  '辰': { // 오만한 지배자
    debuff: 0.8,     damage: 1.5,
    heal: 0.2,       buff: 0.3,
    aoe: 3.0,        // 범위 스킬 극선호
    lowCost: 0.5,    highCost: 1.5,
    allyDamage: -0.5, // 아군 피해 감수 (辰 전용, 부정적 감수)
    maxTargets: 2.5,  // 적중 수 최대화
  },
  '巳': { // 총명한 분석가
    debuff: 1.0,     damage: 1.5,
    heal: 0.5,       buff: 0.8,
    aoe: 1.0,
    lowCost: 1.0,    highCost: 1.0,
    eleAdvantage: 3.0, // 속성 상성 우위 스킬 극선호
    eleDisadvantage: 0.1, // 불리 속성 극기피
  },
  '午': { // 성급한 선제자
    debuff: 0.3,     damage: 1.8,
    heal: 0.2,       buff: 0.5,
    aoe: 0.8,
    lowCost: 1.5,    // 빠른 스킬 선호
    highCost: 0.5,
    speed: 2.5,      // 행동 속도 보너스 스킬 극선호
    extraAction: 3.0, // 추가 행동 스킬 극선호
  },
  '未': { // 과묵한 인내자
    debuff: 0.5,     damage: 0.8,
    heal: 1.0,       buff: 1.5,
    aoe: 0.5,
    lowCost: 1.5,    highCost: 0.5,
    counter: 3.0,    // 반격/카운터 스킬 극선호
    defensive: 2.5,  // 방어 태세 스킬 극선호
  },
  '申': { // 엄격한 심판자
    debuff: 0.5,     damage: 2.0,
    heal: 0.2,       buff: 0.5,
    aoe: 0.8,
    lowCost: 0.8,    highCost: 1.5,
    piercing: 3.0,   // 방어관통 스킬 극선호
    guaranteed: 2.5, // 확정(miss 없음) 스킬 극선호
    random: 0.2,     // 확률 스킬 극기피
  },
  '酉': { // 깐깐한 장인
    debuff: 1.0,     damage: 1.5,
    heal: 0.5,       buff: 1.0,
    aoe: 0.8,
    lowCost: 1.0,    highCost: 1.0,
    combo: 3.0,      // 콤보/연계 스킬 극선호
    setup: 2.0,      // 세팅 스킬 (다음 턴 강화) 선호
    finisher: 2.5,   // 세팅 후 마무리 스킬 선호
  },
  '戌': { // 완고한 수호자
    debuff: 0.3,     damage: 0.5,
    heal: 1.5,       buff: 1.5,
    aoe: 0.5,
    lowCost: 1.0,    highCost: 1.0,
    protect: 3.0,    // 보호/커버 스킬 극선호
    taunt: 2.5,      // 도발 스킬 선호
    selfHeal: 2.0,   // 자가 회복 선호
  },
  '亥': { // 게으른 기회주의자
    debuff: 0.5,     damage: 1.0,
    heal: 0.8,       buff: 0.5,
    aoe: 0.8,
    lowCost: 2.5,    // 평소 저코스트 극선호
    highCost: 0.3,   // 평소 고코스트 기피
    opportunistic: 2.5, // HP/MP 여유시 가끔 강스킬 (亥 전용)
    lazy: 1.5,       // 행동 안함(대기) 확률 증가 (亥 전용)
  },
};
```

### 4.3.1 오행 스킬 친화도 + 스킬 지지 배정

> **v2 변경**: CLASS_SKILL_MODIFIER(20개 클래스) 폐기 → ELEMENT_SKILL_AFFINITY(5개 오행) + 스킬별 지지 배정으로 교체.

**핵심 원리**: 유닛에 "클래스"를 부여하지 않는다. 스킬 자체의 오행 분류가 일지의 오행 성향과 자연스럽게 결합한다.

```javascript
var ELEMENT_SKILL_AFFINITY = {
    wood: { multiHit: 2.0, piercing: 1.8, combo: 1.5, singleTarget: 1.5, lowCost: 1.5 },
    fire: { aoe: 2.0, damage: 2.0, highCost: 1.8, maxTargets: 1.5 },
    earth: { buff: 2.0, protect: 2.0, defensive: 1.8, sustained: 1.8, setup: 1.5 },
    metal: { critical: 2.5, guaranteed: 2.0, counter: 1.8, finisher: 2.0 },
    water: { debuff: 2.5, statusStack: 2.0, setup: 1.5, bonusAction: 1.5, stealth: 1.5 }
};
```

**가중치 공식**: `일지 가중치 = ILJI_WEIGHTS[일지] × ELEMENT_SKILL_AFFINITY[일지의 오행]`

#### 스킬 지지(일지) 배정

스킬 노트태그 `<srpgJi:가호이름1,가호이름2>` 으로 특정 일지를 가진 유닛이 이 스킬을 선호하도록 설정.

| 가호 이름 | 한자 | 오행 | 도메인 |
|-----------|------|------|--------|
| 노크탄 | 子 | 수 | 교활한 비밀의 신 |
| 그란디르 | 丑 | 토 | 느긋한 대지의 신 |
| 프레간 | 寅 | 목 | 용맹한 전쟁의 신 |
| 플로렌 | 卯 | 목 | 다정한 사랑의 신 |
| 레그나스 | 辰 | 토 | 오만한 권력의 신 |
| 벨리스 | 巳 | 화 | 총명한 지식의 신 |
| 솔란 | 午 | 화 | 성급한 계몽의 신 |
| 큐라 | 未 | 토 | 과묵한 등불의 신 |
| 크리시스 | 申 | 금 | 엄격한 심판의 신 |
| 스펠라 | 酉 | 금 | 깐깐한 장인의 신 |
| 에르미탄 | 戌 | 토 | 완고한 믿음의 신 |
| 레바 | 亥 | 수 | 게으른 축제의 신 |

**매칭 규칙**: 일지 매칭 시 ×1.8, 미매칭 시 ×0.6, 태그 없으면 보정 없음.

**RMMZStudio 연동**: 스킬 에디터에 "AI 지지 배정" 칩 UI 추가 (복수 선택, 노트태그 자동 반영).

### 4.4 이중 레이어 결합 — 최종 결정

일간과 일지 레이어는 독립적으로 평가한 뒤 **결합 점수**로 최종 행동을 결정한다:

```
최종 점수 = (일간 점수 × 0.5) + (일지 점수 × 0.5) + (오행 상성 보정)
```

이때 두 레이어의 비중은 상황에 따라 동적으로 조절된다:

```javascript
SrpgAI.combineLayerScores(unit, ilganScore, iljiScore, context) {
    // 기본 비율: 50:50
    var ganWeight = 0.5;
    var jiWeight  = 0.5;
    
    // 상황별 보정
    if (context.noEnemyInRange) {
        // 공격 불가 상황 → 외적(이동) 결정이 더 중요
        ganWeight = 0.8; jiWeight = 0.2;
    }
    if (context.multipleSkillOptions >= 4) {
        // 스킬 선택지 많음 → 내적(스킬) 결정이 더 중요
        ganWeight = 0.3; jiWeight = 0.7;
    }
    if (unit.hp < unit.mhp * 0.3) {
        // HP 위급 → 외적(도주/위치) 결정이 더 중요
        ganWeight = 0.7; jiWeight = 0.3;
    }
    
    return ilganScore * ganWeight + iljiScore * jiWeight;
}
```

#### 조합 예시

같은 화(火) 오행이라도 일간/일지 조합에 따라 완전히 다른 전투 양상:

| 일간 | 일지 | 조합 명칭 | 행동 패턴 |
|------|------|----------|----------|
| 丙(태양) | 午(솔란) | **"폭주 불꽃"** | 가장 강한 적에게 돌격 + 가장 빠른 스킬로 선제 공격. 방어 완전 무시 |
| 丙(태양) | 巳(벨리스) | **"화염 분석가"** | 가장 강한 적에게 접근하되, 속성 약점을 정확히 찌르는 스킬 선택 |
| 丁(등불) | 子(노크탄) | **"독화살 사냥꾼"** | HP 낮은 적을 추적하면서 디버프로 약화 → 마무리 |
| 丁(등불) | 酉(스펠라) | **"정밀 연쇄 처형"** | 약한 적을 노리되, 콤보 세팅→마무리 순서로 효율 극대화 |
| 戊(산맥) | 戌(에르미탄) | **"불멸의 성벽"** | 절대 안 움직이며 보호/도발 스킬로 아군 방어. 전형적 탱커 |
| 壬(파도) | 辰(레그나스) | **"혼돈의 폭격수"** | 전장 돌아다니며 가장 많은 적을 맞출 수 있는 위치에서 AoE |
| 庚(칼날) | 申(크리시스) | **"냉혈 처형인"** | 자리에서 대기하다 약해진 적이 사거리에 들어오면 방어관통 확정 처형 |
| 癸(물병) | 亥(레바) | **"잠복 기회주의자"** | 은신하며 대기, 적이 지치면 갑자기 강스킬로 일격 |

### 4.5 몬스터의 일간/일지 부여

몬스터는 사주가 없으므로 간단한 방법으로 일간/일지를 지정한다.

#### 방법 A — 노트태그 직접 지정 (권장)

```
<srpgDayGan:丙>    ← 일간: 丙(태양) → 정면 돌격 이동 패턴
<srpgDayJi:午>     ← 일지: 午(솔란) → 선제 공격, 빠른 스킬 선호
```

한글 별칭도 지원:
```
<srpgDayGan:태양>   ← 丙과 동일
<srpgDayJi:솔란>    ← 午와 동일
```

#### 방법 B — 오행+음양으로 자동 매핑

일간/일지를 따로 안 정하면, 몬스터의 오행에서 자동 파생:

```javascript
SrpgAI.deriveMonsterIlganIlji(enemy) {
    // 1) 오행 결정 (노트태그 or RMMZ 속성)
    var elem = enemy.srpgElement || deriveElemFromAttribute(enemy);
    
    // 2) 공격성으로 음양 결정
    var isYang = (enemy.agi + enemy.atk) > (enemy.def + enemy.mdf);
    
    // 3) 오행+음양 → 일간
    var ganMap = {
        'wood_yang': '甲', 'wood_yin': '乙',
        'fire_yang': '丙', 'fire_yin': '丁',
        'earth_yang': '戊', 'earth_yin': '己',
        'metal_yang': '庚', 'metal_yin': '辛',
        'water_yang': '壬', 'water_yin': '癸',
    };
    var ilgan = ganMap[elem + '_' + (isYang ? 'yang' : 'yin')];
    
    // 4) 일지는 일간의 오행 + 스킬셋에서 파생
    var jiMap = {
        'wood_yang': '寅', 'wood_yin': '卯',
        'fire_yang': '午', 'fire_yin': '巳',
        'earth_yang': '辰', 'earth_yin': '丑',
        'metal_yang': '申', 'metal_yin': '酉',
        'water_yang': '子', 'water_yin': '亥',
    };
    var ilji = jiMap[elem + '_' + (isYang ? 'yang' : 'yin')];
    
    // 5) 스킬셋 보정: 회복 스킬 보유 → 일지를 卯(치유)로 오버라이드
    if (enemy.hasHealSkill) ilji = '卯';
    if (enemy.hasTauntSkill) ilji = '戌';
    if (enemy.hasAoESkill && !enemy.hasSingleTargetSkill) ilji = '辰';
    
    return { ilgan: ilgan, ilji: ilji };
}
```

#### 방법 C — 프로필에서 일간/일지 내장

기존 프로필 시스템과 호환:
```
<srpgAI:melee_fighter>  → 내부적으로 일간=甲, 일지=寅 적용
<srpgAI:healer>         → 내부적으로 일간=己, 일지=卯 적용
<srpgAI:assassin>       → 내부적으로 일간=庚, 일지=申 적용
```

| 기존 프로필 | 기본 일간 | 기본 일지 | 이유 |
|-----------|----------|----------|------|
| melee_fighter | 甲 | 寅 | 배면 침투 + 최강 일격 |
| ranged_sniper | 辛 | 巳 | 최대 사거리 + 약점 분석 |
| healer | 己 | 卯 | 아군 보호 + 치유 우선 |
| tank | 戊 | 戌 | 부동 방벽 + 보호/도발 |
| assassin | 乙 | 申 | 은밀 우회+배면 침투 + 확정 대미지 |
| mage_aoe | 壬 | 辰 | 교란 이동 + 범위 극대화 |
| support | 己 | 丑 | 아군 보호 + 지속 버프 |
| berserker | 丙 | 寅 | 정면 돌격 + 최강 스킬 |
| guardian | 戊 | 戌 | 위치 사수 + 보호 커버 |
| ambush | 庚 | 申 | 자리 매복 + 확인사살 |
| default | 甲 | 午 | 전진 + 빠른 공격 (현행 유사) |

### 4.6 액터의 일간/일지 — GahoSystem 연동

액터는 사주가 있으므로 일간/일지를 GahoSystem에서 직접 읽는다:

```javascript
SrpgAI.getActorIlganIlji(actorId) {
    var data = GahoSystem.getActorData(actorId);
    if (!data || !data.pillars) return null;
    
    // pillars[1] = 일주 (Day Pillar)
    var dayPillar = data.pillars[1];
    var ilgan = dayPillar.g.tid;  // 천간 tid (甲~癸)
    var ilji  = dayPillar.j.tid;  // 지지 tid (子~亥)
    
    return { ilgan: ilgan, ilji: ilji };
}
```

**노트태그 오버라이드**: 사주에서 자동 파생되지만, 특수 상황(장비/상태이상/이벤트)으로 일시적 변경 가능:
```
<srpgDayGanOverride:丙>   ← 사주 무시, 강제 丙(광전사화 이벤트 등)
<srpgDayJiOverride:子>    ← 사주 무시, 강제 子(저주받아 책략가 전환 등)
```

### 4.7 GahoSystem API 확장 제안

일간/일지 AI 연동을 위해 GahoSystem에 다음 API를 추가한다:

```javascript
// 액터의 일간(Day Stem) 반환
GahoSystem.getDayGan(actorId) → { tid, name, elem, yang, virtue }

// 액터의 일지(Day Branch) 반환
GahoSystem.getDayJi(actorId)  → { tid, name, elem, yang, domain }

// 일간/일지 조합의 전투 성향 반환
GahoSystem.getDualLayerTendency(actorId) → {
    outer: { archetype, weights },  // 일간 → 외적
    inner: { archetype, weights },  // 일지 → 내적
    synergy: Number                 // 일간+일지 오행 관계 시너지 (상생=1.1, 상극=0.9, 동일=1.0)
}
```

**일간/일지 오행 시너지**: 일간과 일지의 오행 관계가 AI 효율에 영향:
- 상생 (GEN): 두 레이어가 자연스럽게 연결 → 일관된 행동, 효율 +10%
- 상극 (OVR): 내외 갈등 → 가끔 비합리적 행동 (예: 후퇴하면서 공격 스킬 선택)
- 동일 (SAME): 한 방향으로 극단적 → 특화도 높지만 유연성 부족

---

## 5. AI 프로필 시스템 (오버라이드)

### 4.1 노트태그 체계

```
<srpgAI:프로필ID>           — 사전 정의된 AI 프로필 적용
<srpgAIAggro:수치>          — 공격성 (0~100, 기본 50)
<srpgAIGuard:대상유형>      — 보호 대상 지정 (commander/healer/weakest)
<srpgAIPriority:우선순위>   — 타겟 우선순위 (nearest/weakest/highest_tgr/healer_first/ranged_first)
<srpgAIRange:선호거리>      — 선호 교전 거리 (melee/mid/far/max)
<srpgAIRetreatHp:비율>      — HP가 이 비율 이하면 후퇴 (0~100, 기본 0=후퇴 안함)
<srpgAISkillBias:편향>      — 스킬 선택 편향 (damage/heal/buff/debuff/aoe)
```

### 4.2 사전 정의 프로필

| 프로필 ID | 설명 | 공격성 | 선호거리 | 타겟 우선 | 비고 |
|-----------|------|--------|----------|-----------|------|
| `melee_fighter` | 근접 전사 | 80 | melee | nearest | 돌격, ZoC 활용 |
| `ranged_sniper` | 원거리 저격 | 60 | max | weakest | 사거리 유지, 고지대 선호 |
| `healer` | 치유사 | 10 | far | - | 아군 회복 우선, 전선 후방 유지 |
| `tank` | 방어전사 | 40 | melee | highest_tgr | 아군 보호, ZoC 벽 형성 |
| `assassin` | 암살자 | 90 | melee | weakest | 배면 공격 극대화, 후퇴 활용 |
| `mage_aoe` | 범위 마법사 | 70 | mid | - | AoE 최적 위치 계산 |
| `support` | 버프 서포터 | 20 | far | - | 아군 강화 우선, 교전 회피 |
| `berserker` | 광전사 | 100 | melee | nearest | 후퇴 안함, HP 무시 돌격 |
| `guardian` | 호위 | 30 | melee | - | 지정 대상 근처 유지, 대신 맞기 |
| `object` | 사물 | 0 | - | - | 이동 안함, 반격만 |
| `patrol` | 순찰 | 30 | mid | nearest | 지정 경로 순찰, 적 발견 시 교전 |
| `ambush` | 매복 | 70 | mid | nearest | 적이 사거리 내 올 때까지 대기 |
| `default` | 기본 | 50 | melee | nearest | 현행 _enemyDecide와 동일 |

### 4.3 프로필 미지정 시 기본 동작 (오행 자동 파생)

- 몬스터: `default` 프로필 적용 (현행과 동일한 "가까운 적 공격")
- 액터 (NPC/자동전투): 노트태그의 스킬 셋에 따라 자동 판단
  - 회복 스킬 보유 → `healer` 계열 행동
  - 원거리 스킬만 → `ranged_sniper` 계열
  - 그 외 → `melee_fighter`

---

## 6. AI 결정 파이프라인

```
┌──────────────────────────────────────────────────────────────┐
│              이중 레이어 AI Decision Pipeline                  │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  0. 일간/일지 결정 (최초 1회)                                    │
│     ├─ 액터: GahoSystem.getDayGan/Ji(actorId) 자동 획득        │
│     ├─ 몬스터: 노트태그 or 오행+음양 자동 매핑                   │
│     └─ ILGAN_WEIGHTS[일간], ILJI_WEIGHTS[일지] 로드             │
│                                                                │
│  1. Context Gathering (상황 수집) ─── 공통                      │
│     ├─ 자기 상태 (HP/MP/상태이상/위치)                           │
│     ├─ 가시 적군 목록 (시야+은신 필터)                           │
│     ├─ 가시 아군 목록 + 상태                                     │
│     ├─ 장판/구름 맵                                              │
│     └─ 지형 정보 (고저차/엄폐/수풀)                              │
│                                                                │
│  ┌────────────────────┐  ┌────────────────────┐              │
│  │ 일간 레이어 (외적)   │  │ 일지 레이어 (내적)   │              │
│  │ ══════════════════ │  │ ══════════════════ │              │
│  │                    │  │                    │              │
│  │ 2a. Threat Assess  │  │ 2b. Skill Scan     │              │
│  │  적군 위협도 평가    │  │  사용 가능 스킬 열거  │              │
│  │  (일간 가중치 적용)  │  │  (일지 가중치 적용)  │              │
│  │                    │  │                    │              │
│  │ 3a. Target Select  │  │ 3b. Skill Rating   │              │
│  │  누구를 상대할지     │  │  어떤 스킬을 쓸지   │              │
│  │  (일간: nearest/   │  │  (일지: damage/    │              │
│  │   weakest/         │  │   heal/debuff/     │              │
│  │   strongest/       │  │   buff/aoe/        │              │
│  │   isolated 가중)   │  │   combo 가중)      │              │
│  │                    │  │                    │              │
│  │ 4a. Tile Evaluate  │  │ 4b. Skill-Tile     │              │
│  │  어디로 이동할지     │  │  Match             │              │
│  │  (일간: advance/   │  │  스킬 사거리+범위에  │              │
│  │   retreat/flank/   │  │  맞는 위치 확인     │              │
│  │   cover 가중)      │  │                    │              │
│  │                    │  │                    │              │
│  └────────┬───────────┘  └────────┬───────────┘              │
│           │                       │                           │
│           ▼                       ▼                           │
│  5. Layer Combination (레이어 결합)                              │
│     ├─ 일간 점수 × ganWeight + 일지 점수 × jiWeight             │
│     ├─ 상황별 가중치 동적 조절                                   │
│     │   (교전 불가 → 일간↑, 스킬 다양 → 일지↑)                  │
│     ├─ 일간/일지 오행 시너지 보정 (상생=+10%, 상극=-10%)         │
│     └─ 오행 상성(vs 타겟) 추가 보정                              │
│                                                                │
│  6. Strategy Finalize (전략 확정)                                │
│     ├─ ATTACK / HEAL / BUFF / RETREAT / REPOSITION / WAIT       │
│     └─ 최적 {타겟, 스킬, 이동 타일} 조합 확정                    │
│                                                                │
│  7. Bonus Action (보조 행동 결정)                                │
│     ├─ 아이템 사용 / 투척                                        │
│     ├─ 방향 전환 (배면 비노출)                                   │
│     └─ 스프린트 판단                                             │
│                                                                │
│  8. Output: { strategy, skill, target, moveTile,                │
│               facingDir, bonusAction,                           │
│               ilganArchetype, iljiArchetype }                   │
└──────────────────────────────────────────────────────────────┘
```

### 파이프라인 핵심 변경점 (기존 대비)

1. **병렬 평가**: 타겟 선택(일간)과 스킬 선택(일지)이 독립적으로 병렬 평가된다. 기존에는 전략→스킬→타겟→타일의 직렬 파이프라인이었으나, 이제 외적/내적 두 트랙이 동시에 돌고 결합 단계에서 합쳐진다.

2. **조합 폭발 방지**: 모든 (타일×타겟×스킬) 조합을 평가하면 O(N³)이 되므로, 각 레이어에서 top-K 후보만 추린 뒤 결합한다.
   - 일간 레이어: 상위 5개 타겟 × 상위 5개 타일 = 25개 후보
   - 일지 레이어: 상위 3개 스킬 후보
   - 결합: 25 × 3 = 최대 75개 조합만 최종 평가

3. **디버그 가시성**: 결과에 `ilganArchetype`(예: "돌파 지휘관")과 `iljiArchetype`(예: "용맹한 일격자")이 포함되어, 왜 이런 행동을 했는지 한눈에 파악 가능.


---

## 7. 핵심 모듈 상세

### 6.1 TileEvaluator — 이동 위치 점수 계산

```javascript
// 각 이동 가능 타일에 점수를 매겨 최적 위치를 결정
SrpgAI.scoreTile(unit, tile, context) → Number

점수 요소:
  +10  : 타겟 공격 가능 (사거리 내)
  +5   : 엄폐물 뒤 (cover region)
  +3   : 고지대 (heightLevel > 타겟)
  +3   : 수풀 위 (은신 보정)
  -5   : 적 장판 위 (fire/lava = -10)
  +2   : 아군 장판 위 (blessed)
  -3   : 적 ZoC 영향권 (탈출 비용)
  +2   : 아군 ZoC 벽 형성 기여
  -4   : 배면 노출 (이동 후 적에게 뒤를 보임)
  +3   : 배면 공격 가능 (타겟의 뒤에서 공격)
  +2   : 협동 공격 트리거 가능 위치
  -8   : 기회공격 경로 (이동 중 적 ZoC 통과)
  ±N   : 선호 거리 편차 패널티
```

### 6.2 TargetEvaluator — 타겟 점수 계산

```javascript
SrpgAI.scoreTarget(unit, target, skill, context) → Number

점수 요소:
  base : 예상 대미지 / 타겟 현재 HP (킬 확률)
  ×TGR : 타겟의 TGR (도발 효과)
  +10  : 킬 가능 (HP < 예상 대미지)
  +5   : healer_first 설정 시 회복 스킬 보유 타겟
  +3   : ranged_first 설정 시 원거리 타겟
  +5   : 배면 공격 가능
  +3   : 측면 공격 가능
  -5   : 투사체 차단됨 (직사 불가)
  -3   : 반격 가능 타겟 (canCounter = true)
  +N   : 범위 스킬 시 추가 피해 대상 수 × 3
```

### 6.3 StrategySelector — 전략 결정

```javascript
SrpgAI.selectStrategy(unit, context) → String

결정 로직 (우선순위):
  1. HP ≤ retreatHp% → "RETREAT" (후퇴 가능 시)
  2. 아군 HP 위험 + 회복 스킬 → "HEAL"
  3. 공격 가능 타겟 존재 + aggro 체크 → "ATTACK"
  4. 아군 버프 가능 → "BUFF"
  5. 더 좋은 위치 있음 → "REPOSITION"
  6. 그 외 → "WAIT"
```

### 6.4 SkillSelector — 스킬 선택 (기존 확장)

```javascript
SrpgAI.selectSkill(unit, strategy, targets, context) → {skillId, skill}

현행 _selectEnemySkill 로직 유지 + 확장:
  - HEAL 전략 → 회복 스킬만 후보
  - BUFF 전략 → 버프 스킬만 후보
  - ATTACK 전략 → 공격 스킬 후보 + AoE 최적화
  - skillBias 설정 반영
  - 범위 스킬: 적중 타겟 수로 rating 보정
```

### 6.5 BonusActionDecider — 보조 행동

```javascript
SrpgAI.decideBonusAction(unit, mainDecision, context) → {type, params}

판단:
  - 아이템 사용 (회복 포션 등)
  - 투척 가능 아이템 (수류탄 등)
  - 방향 전환 (주 행동 후 배면 비노출 방향)
  - 스프린트 (접근 시 추가 이동 필요)
```

---

## 8. 플레이어 조작 연동

### 7.1 자동전투 모드

플레이어 턴에서 자동전투를 선택하면 해당 액터에 AI를 적용한다.

```
자동전투 레벨:
  1. 완전 자동 — AI가 이동+공격+보조 행동 전부 결정
  2. 이동 수동 — 플레이어가 위치 선택, 공격은 AI
  3. 제안 모드 — AI가 추천 행동을 표시, 플레이어가 승인/변경
```

### 7.2 NPC 동맹 유닛

`SrpgAlliance`의 팀 시스템과 연동:
- 플레이어 팀이 아닌 유닛은 모두 AI로 동작
- 동맹 팀(hostile=false)이라도 플레이어 조작이 아니면 AI
- 이벤트로 제어되는 특수 유닛은 AI 무시 (노트태그: `<srpgAI:none>`)

---

## 9. 기존 시스템 연동 상세

| 기존 시스템 | AI 활용 방법 |
|------------|-------------|
| **측면/배면** | 배면 공격 가능 위치 우선, 이동 후 배면 비노출 방향 전환 |
| **고저차** | 고지대에서 사거리 보너스, 이동 시 고지대 선호 |
| **ZoC** | 탱커는 적 진로에 ZoC 벽 형성, 원거리는 ZoC 회피 |
| **기회공격** | 이동 경로에서 적 ZoC 통과 시 패널티 → 우회 경로 탐색 |
| **협동공격** | 협동 가능 위치에 이동하면 추가 점수 |
| **투사체 차단** | 직사 스킬은 차단 체크 후 불가 시 다른 타겟/위치 |
| **장판/구름** | 적 장판 회피, 아군 장판 활용, 장판 생성 스킬 위치 최적화 |
| **시야/은신** | 안 보이는 적은 타겟에서 제외, 수풀 은신 활용 |
| **엄폐물** | 원거리 유닛은 엄폐물 뒤 선호 |
| **팀/동맹** | isHostileTo 기반, 동맹 팀 유닛은 회복/버프 대상 |
| **RMMZ 행동 패턴** | 기존 rating 시스템 유지, AI 프로필이 보완 |

---

## 10. 노트태그 예시

### 근접 전사 (몬스터)
```
<srpgUnit:enemy>
<srpgEnemyId:3>
<srpgMov:5>
<srpgAtkRange:1>
<srpgFireMode:melee>
<srpgAI:melee_fighter>
<srpgAIAggro:80>
```

### 원거리 궁수 (액터 NPC)
```
<srpgUnit:actor>
<srpgActorId:5>
<srpgMov:4>
<srpgAtkRange:6>
<srpgFireMode:direct>
<srpgAI:ranged_sniper>
<srpgAIPriority:weakest>
<srpgAIRange:far>
```

### 힐러 동맹 NPC
```
<srpgUnit:actor>
<srpgActorId:7>
<srpgMov:3>
<srpgAtkRange:4>
<srpgFireMode:arc>
<srpgAI:healer>
<srpgAIRetreatHp:30>
```

### 보스 몬스터 (일간/일지 직접 지정)
```
<srpgUnit:enemy>
<srpgEnemyId:10>
<srpgMov:3>
<srpgAtkRange:3>
<srpgDayGan:丙>
<srpgDayJi:辰>
<srpgAIRetreatHp:20>
```
→ 丙(정면 돌격) + 辰(범위 극대화): 가장 강한 적에게 돌진하며 AoE로 최대 피해.

### 지능형 궁수 (일간/일지 + 프로필 혼용)
```
<srpgUnit:enemy>
<srpgEnemyId:8>
<srpgMov:4>
<srpgAtkRange:6>
<srpgFireMode:direct>
<srpgDayGan:辛>
<srpgDayJi:巳>
<srpgAI:ranged_sniper>
```
→ 辛(최대 사거리 유지) + 巳(속성 약점 분석): 엄폐 뒤에서 적 약점 속성으로 저격.
→ 프로필 `ranged_sniper`는 fallback, 일간/일지가 우선 적용됨.

### 언데드 전사 (오행 자동 매핑)
```
<srpgUnit:enemy>
<srpgEnemyId:12>
<srpgMov:5>
<srpgAtkRange:1>
<srpgElement:water>
```
→ 오행=수(水) + 스탯 기반 음양 판정 → 일간/일지 자동 결정.
→ atk>def이면 壬(교란자)+子(책략가), def>atk이면 癸(전략가)+亥(기회주의자)

### 매복 유닛
```
<srpgUnit:enemy>
<srpgEnemyId:6>
<srpgMov:6>
<srpgAI:ambush>
<srpgAIAggro:90>
```
→ 적이 사거리 내에 올 때까지 대기. 사거리 내 진입 시 즉시 공격.

### 순찰 유닛
```
<srpgUnit:enemy>
<srpgEnemyId:4>
<srpgMov:4>
<srpgAI:patrol>
<srpgAIPatrolPath:5,3|8,3|8,7|5,7>
```
→ 지정 경로를 반복 순찰. 적 발견 시 교전 모드 전환.

---

## 11. 플러그인 구조

```
SRPG_CombatAI.js
├── SrpgAI (전역 객체)
│   ├── profiles: {}              — 프로필 사전
│   ├── ILGAN_WEIGHTS: {}         — 10천간 외적 가중치 테이블
│   ├── ILJI_WEIGHTS: {}          — 12지지 내적 가중치 테이블
│   ├── parseNotes(unit)          — 노트태그 → AI 설정 파싱
│   ├── decide(unit, context)     — 메인 결정 함수 (이중 레이어 파이프라인)
│   │
│   ├── ── 공통 ──
│   ├── gatherContext(unit)       — 상황 수집
│   ├── resolveIlganIlji(unit)    — 일간/일지 결정 (액터→사주, 몬스터→노트태그/자동)
│   │
│   ├── ── 일간 레이어 (외적) ──
│   ├── assessThreats(unit, ctx)  — 위협 평가 (일간 가중)
│   ├── scoreTarget(unit, target, ctx)     — 타겟 점수 (일간 가중)
│   ├── scoreTile(unit, tile, ctx)         — 타일 점수 (일간 가중)
│   │
│   ├── ── 일지 레이어 (내적) ──
│   ├── scanSkills(unit, ctx)     — 사용 가능 스킬 열거
│   ├── rateSkill(unit, skill, targets, ctx) — 스킬 평가 (일지 가중)
│   ├── matchSkillTile(skill, tiles, ctx)    — 스킬-타일 매칭
│   │
│   ├── ── 결합 ──
│   ├── combineLayerScores(unit, ganScore, jiScore, ctx) — 레이어 결합
│   ├── selectStrategy(unit, ctx) — 전략 확정 (결합 결과 기반)
│   ├── decideBonusAction(unit, mainDec, ctx) — 보조 행동
│   │
│   └── execute(unit, decision)   — 결정 실행 (SM 연동)
│
├── GahoSystem 연동
│   ├── getDayGan(actorId)        — 액터 일간 조회
│   ├── getDayJi(actorId)         — 액터 일지 조회
│   └── getDualLayerTendency(actorId) — 이중 레이어 성향 조회
│
└── SM 연동
    ├── _enemyDecide() → SrpgAI.decide() 호출로 교체
    ├── _npcDecide() 추가 (동맹 NPC 턴)
    └── autoBattle() 추가 (플레이어 자동전투)
```

---

## 12. SM (상태머신) 통합

### 현행 흐름
```
enemyTurn → _processEnemyTurn → _enemyDecide → showDecision → executeMove → ...
```

### 변경 후 흐름
```
aiTurn → _processAITurn → SrpgAI.decide(unit) → showDecision → executeMove → ...
```

- `enemyTurn`을 `aiTurn`으로 일반화
- 플레이어 팀이 아닌 모든 유닛이 aiTurn에서 처리됨
- 자동전투 액터도 aiTurn으로 전환 가능

---

## 13. 성능 고려

- **이동 범위 계산**: 기존 BFS 결과 재사용 (SrpgGrid.calcMoveRange 캐시)
- **타일 평가 캐시**: 같은 턴에 여러 유닛이 평가할 때 지형/장판 정보 캐시
- **순차 처리**: 적 유닛은 한 번에 하나씩 결정 → 이전 유닛의 이동 결과 반영
- **평가 중단**: 킬 가능 타겟 발견 시 나머지 타일 평가 스킵 (greedy cutoff)
- **프레임 분산**: 복잡한 AI 계산을 여러 프레임에 걸쳐 분산 (코루틴 패턴)

---

## 14. 구현 단계

### Phase 1: 기반 + 기본 교체
- `SRPG_CombatAI.js` 파일 생성, SrpgAI 전역 객체
- 프로필 파서 (노트태그 → 설정)
- `SM._enemyDecide()` → `SrpgAI.decide()` 호출 교체
- 기존 로직 1:1 이식 (동작 변경 없음)

### Phase 2: 타일/타겟 평가 고도화
- `scoreTile()`: 엄폐/고지/장판/ZoC/기회공격 반영
- `scoreTarget()`: 측면/배면/협동/투사체 차단 반영
- 프로필별 가중치 적용

### Phase 3: 전략 분기 + 스킬 최적화
- HEAL/BUFF/RETREAT/REPOSITION 전략 구현
- 범위 스킬 AoE 최적 위치 계산
- 보조 행동 결정

### Phase 4: 아군 AI + 자동전투
- NPC 동맹 유닛 AI 적용
- 자동전투 모드 구현
- 순찰/매복 AI

### Phase 5: RMMZStudio UI
- SRPG 패널에 AI 프로필 선택 드롭다운 추가
- 액터/몬스터 DB 폼에 AI 설정 섹션
- AI 디버그 오버레이 (타일 점수 시각화)

---

## 15. RMMZStudio 연동

### SRPG 배치 팔레트 확장
유닛 배치 시 AI 프로필도 함께 지정:
```
[액터] [몬스터]
┌─────────────────────┐
│ 3: 리드         ▼  │  ← 드롭다운
├─────────────────────┤
│ 팀 배정: [1][2]...  │
├─────────────────────┤
│ AI: melee_fighter ▼ │  ← AI 프로필 드롭다운
├─────────────────────┤
│ DB 설정 (읽기 전용)  │
│ 이동력: 5  사거리: 1 │
│ 발사: melee          │
├─────────────────────┤
│ [  배치 모드 시작  ] │
└─────────────────────┘
```

### 액터/몬스터 DB 폼 — AI 섹션
```
── SRPG 전투 AI ──
프로필:  [melee_fighter ▼]
공격성:  [80  ]  (0~100)
타겟 우선: [nearest ▼]
선호 거리: [melee ▼]
후퇴 HP%: [0   ]
스킬 편향: [damage ▼]
```

---

## 16. 디버그/개발 지원

### AI 사고 로그
```javascript
console.log(`[AI] ${unit.name}: 전략=${strategy}, 스킬=${skill.name}, 타겟=${target.name}`);
console.log(`[AI]   타일(${tile.x},${tile.y}) 점수=${score} [공격+10, 엄폐+5, 장판-3]`);
```

### 오버레이 시각화 (개발용)
- 이동 범위 타일 위에 점수 표시 (높을수록 녹색, 낮을수록 적색)
- 선택된 타겟에 화살표
- AI 결정 요약을 화면 구석에 표시

---

## 17. 확장 가능성

- **스크립트 훅**: `SrpgAI.onBeforeDecide(unit, ctx)`, `SrpgAI.onAfterDecide(unit, decision)` 이벤트
- **커스텀 프로필**: 플러그인 커맨드로 런타임에 AI 프로필 변경
- **학습 AI**: 플레이어 행동 패턴 기록 → 적 AI가 대응 전략 변경 (상급 옵션)
- **팀 전술**: 지휘관 유닛이 팀 전체 전략을 결정 (공격/방어/포위)
