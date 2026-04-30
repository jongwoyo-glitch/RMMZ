# 관계 시스템 오버홀 설계서
## RMMZ 다크 판타지 — 사주명리 기반 인물관계 엔진 v2

---

## 0. 변경 요약

### 현행 시스템 (GridInventory.js 기반)
- **3축:** Impression(호감도), Mood(기분), BondTag(10종 문자열)
- **단순 선형:** 호감도 ±수치 → 순응률(complianceRate) 계산
- **정적 태그:** stranger/acquaintance/friend/rival 등 단일 태그 방식
- **궁합:** GahoSystem.js의 getCompatibility (천간합 +20, 육합 +15 등 단순 보정)

### 목표 시스템
- **4축 (고정 기준값):** 이끌림(引/Desire), 주도권(制/Dominance), 유대(親/Bond), 어둠(暗/Darkness) — 사주에서 산출된 불변 프로필, 스트레스 계수로 작용
- **스트레스 시스템:** CK3식 — 사주 체질(4축)과 행동의 괴리가 내적 대가로 작용
- **트라우마 레이어:** 6종 강화 태그 — 입력 필터 왜곡 + 공망(원국 강제 비활성화)
- **4계층 사회 관계:** Layer 0(면식) → Layer 1(호감도) → Layer 2(관계이력태그) → Layer 3(Chemistry/4축+스트레스)
- **활성주(Active Pillar):** 관계 태그에 따라 십성 산출 기준 주(柱) 변경
- **호감도 재설계:** 외모태그(하드웨어) × 일주궁합 × 오행비율궁합 = 기본 베이스 + 태그 모디파이어
- **서사 궤적 패턴:** 7종 자동 감지 (CORRUPTION, TRAINING, NTR, DARK_FALL 등)

### 불변 사항 (세계관 유지)
- **천간 10별자리:** 참나무(甲)/화분(乙)/태양(丙)/등불(丁)/산맥(戊)/쟁기(己)/칼날(庚)/끌(辛)/파도(壬)/물병(癸)
- **지지 12주신:** 노크탄(子)/그란디르(丑)/프레간(寅)/플로렌(卯)/레그나스(辰)/벨리스(巳)/솔란(午)/큐라(未)/크리시스(申)/스펠라(酉)/에르미탄(戌)/레바(亥)
- **오행 → 판타지 원소:** Verdance(木)/Ignis(火)/Terra(土)/Aurum(金)/Abyssia(水)
- **GahoSystem.js 핵심 데이터:** GANS 10항목, JIS 12항목, 오행 상생상극 테이블

---

## 1. 4축 관계 수치 — 고정 기준값 체계

> **핵심 원칙: 4축은 고정(Fixed) 기준값이다.** 두 캐릭터의 원국(사주)과 활성주에서 한 번 산출되면 변동하지 않는다. 4축은 "이 관계의 체질적 프로필"이며, 스트레스 연산의 계수(coefficient)로만 작용한다. 플레이어의 행동이 직접 바꾸는 것은 스트레스·호감도·태그이지, 4축 자체가 아니다.

| 축 | 한국어 | 영문 키 | 범위 | 의미 |
|----|--------|---------|------|------|
| 引 | **이끌림** | desire | 0~100 | 상대를 향한 욕망의 강도. 성적/권력적/소유적 욕망 모두 포함. |
| 制 | **주도권** | dominance | -100~+100 | 관계 내 주도권. 양수=내가 위, 음수=상대가 위, 0=대등. |
| 親 | **유대** | bond | 0~100 | 유대감, 신뢰, 친밀도. 높으면 보호 본능, 낮으면 무관심/적대. |
| 暗 | **어둠** | darkness | 0~100 | 관계의 독성 경향. 집착, 강제, 착취, 배신, 가학/피학. |

> **4축이 변경되는 유일한 경우:** 활성주 전환(§4) — 관계 태그로 인해 참조 주(柱)가 바뀌면 십신이 달라지므로 기준값이 재산출된다. 이때도 "수치가 서서히 변하는" 것이 아니라 새 활성주 기준으로 **즉시 교체**된다.

### 1-1. 해석 조합 예시

| 이끌림 | 주도권 | 유대 | 어둠 | 관계 양상 |
|--------|--------|------|------|-----------|
| 高 | +高 | 高 | 低 | 열정적 연인이 주도하는 헌신 관계 |
| 高 | +高 | 低 | 高 | 강제 예속. 힘으로 취하고 정도 없다 |
| 高 | -高 | 高 | 低 | 자발적 복종. 경배에 가까운 사랑 |
| 高 | -高 | 低 | 高 | 약자의 처지에서 벗어나지 못하는 학대 관계 |
| 高 | 0 | 高 | 低 | 대등한 열정적 동반자 |
| 低 | +高 | 高 | 低 | 보호자/후견인 |
| 低 | +高 | 低 | 高 | 냉담한 지배자. 도구 취급 |
| 低 | 0 | 高 | 低 | 전우, 형제 |

### 1-2. 관계 유형 자동 분류 (classify)

4축 조합으로 11종 관계 유형을 자동 판정한다.

```javascript
function classifyRelation(d, dom, b, dk) {
  if (dk >= 50 && d >= 50) return {code: 10, name: 'OBSESSION',   label: '집착'};
  if (dk >= 50 && dom >= 30) return {code: 11, name: 'TYRANNY',   label: '폭압'};
  if (dk >= 50 && dom <= -30) return {code: 12, name: 'SUBJUGATION', label: '예속'};
  if (dk >= 50) return {code: 13, name: 'TOXIC', label: '독성'};

  if (d >= 60 && b >= 60) return {code: 1, name: 'PASSION',  label: '열정'};
  if (d >= 60 && dom >= 30) return {code: 2, name: 'CONQUEST', label: '정복'};
  if (d >= 60 && dom <= -30) return {code: 3, name: 'DEVOTION', label: '경배'};
  if (d >= 60) return {code: 4, name: 'LUST', label: '욕망'};

  if (b >= 60 && Math.abs(dom) < 15) return {code: 5, name: 'COMRADE',   label: '전우'};
  if (b >= 60 && dom >= 15) return {code: 6, name: 'PROTECTOR', label: '보호자'};
  if (b >= 60 && dom <= -15) return {code: 7, name: 'WARD',     label: '피보호'};

  if (dom >= 30) return {code: 8, name: 'MASTER',  label: '지배'};
  if (dom <= -30) return {code: 9, name: 'SERVANT', label: '복종'};

  return {code: 0, name: 'NEUTRAL', label: '중립'};
}
```

---

## 2. 십신 관계 판정 — 4축 기본 보정

### 2-1. 십신 판정 로직

A의 활성주 천간 기준으로 B의 활성주 천간을 읽는다. **양방향** — A→B와 B→A가 다르다.

오행 생극 관계 + 음양 동이(同異)로 정(正)/편(偏)을 구분한다.

| 관계 | 같은 극성 | 다른 극성 |
|------|----------|----------|
| 비화(같은 오행) | 비견(比肩) | 겁재(劫財) |
| 아생(내가 생함) | 식신(食神) | 상관(傷官) |
| 아극(내가 극함) | 편재(偏財) | 정재(正財) |
| 극아(나를 극함) | 편관(偏官) | 정관(正官) |
| 생아(나를 생함) | 편인(偏印) | 정인(正印) |

### 2-2. 십신별 4축 기본 보정값

A→B 방향 기준. A가 주체, B가 대상.

| 십신 | 이끌림 | 주도권 | 유대 | 어둠 | 밝은 면 | 어두운 면 |
|------|--------|--------|------|------|---------|-----------|
| 비견 | +5 | 0 | +15 | +5 | 전우, 동지, 경쟁 속 우정 | 자원 쟁탈, 질투, 동족상잔 |
| 겁재 | +10 | +5 | +10 | +15 | 의형제, 함께 죽을 각오 | 약탈, 빼앗음, 뒤통수 |
| 식신 | +15 | +10 | +20 | 0 | 돌봄, 양육, 관대한 보호 | 과잉보호, 질식, 자율 박탈 |
| 상관 | +25 | +5 | +10 | +10 | 해방, 자유, 관능적 탐색 | 기존 질서 파괴, 배신, 방종 |
| 편재 | +30 | +15 | +10 | +10 | 관대한 향유, 쾌락의 공유 | 소비/착취, 대상화, 싫증 |
| 정재 | +20 | +10 | +25 | 0 | 헌신, 동반자, 안정적 사랑 | 소유물 취급, 자유 박탈 |
| 편관 | +30 | -20 | +5 | +20 | 강렬한 카리스마, 복종 속 쾌감 | 폭력적 지배, 강제, 공포 |
| 정관 | +15 | -15 | +15 | +5 | 구조적 보호, 질서, 안정감 | 속박, 감시, 자율 억압 |
| 편인 | +10 | -10 | +10 | +15 | 비밀스러운 지혜, 은밀한 유대 | 정신적 잠식, 세뇌, 자아 침식 |
| 정인 | +5 | -10 | +25 | 0 | 스승, 은인, 무조건적 수용 | 과도한 의존, 자립심 상실 |

> **설계 의도:** 편(偏) 계열은 어둠이 높고 정(正) 계열은 어둠이 낮다. 도덕 판단이 아니라, 편 관계의 극단성과 불안정성을 반영한다. 다크 판타지에서 편 관계가 더 드라마틱한 서사를 만든다.

---

## 3. 천간합/충 + 지지 관계 보정

### 3-1. 천간오합 (天干五合)

두 캐릭터의 활성주 천간이 합 관계이면 양방향 동시 적용.

| 합 | 화합 오행 | 이끌림 | 유대 | 특수 효과 |
|----|----------|--------|------|-----------|
| 甲+己 | 土 | +20 | +15 | 주종 관계 자연 형성 |
| 乙+庚 | 金 | +25 | +10 | 칼날과 넝쿨. 거칠지만 강렬한 결합 |
| 丙+辛 | 水 | +20 | +10 | 태양과 보석. 화려한 매혹 |
| 丁+壬 | 木 | +25 | +15 | 은밀한 불과 깊은 물. 가장 관능적인 합 |
| 戊+癸 | 火 | +15 | +20 | 대지와 이슬. 가장 안정적인 합 |

### 3-2. 천간충 (天干沖)

| 충 | 이끌림 | 주도권 | 어둠 | 특수 효과 |
|----|--------|--------|------|-----------|
| 甲↔庚 | +15 | ±20 | +10 | 나무 vs 도끼. 직접적 무력 충돌 |
| 乙↔辛 | +10 | ±15 | +15 | 독침 vs 넝쿨. 음습한 암투 |
| 丙↔壬 | +20 | ±15 | +10 | 불 vs 홍수. 장대한 충돌 |
| 丁↔癸 | +15 | ±10 | +15 | 촛불 vs 빗물. 서서히 소멸 |

> 주도권의 ± — 극하는 쪽이 양수. 庚(金)이 甲(木)을 극하므로, 庚 시점에서 주도권 +20, 甲 시점에서 주도권 -20.

### 3-3. 지지 관계 보정

지지는 **활성주의 지지**를 사용한다.

| 관계 | 해당 조합 | 보정 | 서사적 의미 |
|------|----------|------|-----------|
| 육합(六合) | 子丑, 寅亥, 卯戌, 辰酉, 巳申, 午未 | 유대+15, 이끌림+10 | 자연스러운 밀착. 만나면 끌린다 |
| 삼합(三合) | 寅午戌, 巳酉丑, 申子辰, 亥卯未 | 유대+10 (3인 모두) | 삼자 유대. 세력 결성 시너지 |
| 충(沖) | 子午, 丑未, 寅申, 卯酉, 辰戌, 巳亥 | 이끌림+10, 어둠+10 | 충돌. 부딪히지만 무시 못함 |
| 형(刑) | 寅巳申, 丑戌未, 子卯, 자형(辰辰/午午/酉酉/亥亥) | 어둠+20 | **핵심 독성 트리거.** 상호 파괴적 경향 |
| 해(害) | 子未, 丑午, 寅巳, 卯辰, 申亥, 酉戌 | 어둠+10, 유대-10 | 겉은 괜찮은데 속에서 곪는다 |

---

## 4. 활성주(Active Pillar) 시스템

관계 태그에 따라 **어떤 주(柱)로 십성을 계산하는지** 변경된다. 이것이 "관계가 깊어질수록 다른 면이 보인다"의 기계적 표현이다.

### 4-1. 활성 모드 3종

| 모드 | 활성주 쌍 | 트리거 태그 | 서사적 의미 |
|------|-----------|-----------|-----------|
| **기본(year)** | 년주 ↔ 년주 | 기본값 (태그 없음) | 사회적 페르소나로 상호 인식 |
| **친밀(day)** | 일주 ↔ 일주 | intimate_consensual, confess_accepted, sworn_oath, sworn_brother, blood_sibling, married | 내면을 드러내는 관계. 진짜 궁합 |
| **상하(hier)** | 상위=월주, 하위=시주 | blood_parent/child, liege/vassal, master/apprentice, owner/slave, enslaved | 위계적 관계. 권력 구조 반영 |

### 4-2. 활성주 결정 함수

```javascript
const INTIMATE_TAGS = new Set([
  'intimate_consensual', 'confess_accepted', 'sworn_oath',
  'sworn_brother', 'blood_sibling', 'married'
]);
const HIER_TAGS = new Set([
  'blood_parent', 'blood_child', 'liege', 'vassal',
  'master', 'apprentice', 'owner', 'slave', 'enslaved'
]);
const SUPERIOR_TAGS = new Set([
  'blood_parent', 'liege', 'master', 'owner'
]);

function getActiveMode(tags) {
  for (const t of tags) if (INTIMATE_TAGS.has(t)) return 'day';
  for (const t of tags) if (HIER_TAGS.has(t)) return 'hier';
  return 'year';
}

function getActivePair(mode, fromTags, toTags) {
  if (mode === 'day') return ['d', 'd'];   // 일주↔일주
  if (mode === 'year') return ['y', 'y'];  // 년주↔년주
  // hier: 상위자=월주, 하위자=시주
  const isSuperior = fromTags.some(t => SUPERIOR_TAGS.has(t));
  return isSuperior ? ['m', 'h'] : ['h', 'm'];
}
```

### 4-3. 활성주 전환 시 재계산

태그 추가로 활성 모드가 변경되면, 사주 기본값이 재연산된다. 현재 4축 값은 "기본값 변화분"만큼 보정한다.

```javascript
// 새 기본값과 구 기본값의 차이만큼 현재값 조정
newRel.desire = clamp(oldRel.desire + (newBase.desire - oldBase.desire), 0, 100);
newRel.dominance = clamp(oldRel.dominance + (newBase.dominance - oldBase.dominance), -100, 100);
newRel.bond = clamp(oldRel.bond + (newBase.bond - oldBase.bond), 0, 100);
newRel.darkness = clamp(oldRel.darkness + (newBase.darkness - oldBase.darkness), 0, 100);
```

### 4-4. 활성주 전환이 스트레스 효율을 직접 바꾼다 ★

**이것이 활성주 시스템의 핵심 레버다.** 스트레스 연산(§7-3)의 기준이 되는 `baseline`은 해당 관계의 사주 기본값(bDe, bDo, bBo, bDk)이며, 이 기본값 자체가 활성주에 따라 결정된다. 따라서 활성주가 전환되면 **같은 행동의 스트레스 비용이 완전히 달라진다.**

```
예시: A(년주: 甲寅, 일주: 丁卯) → B(년주: 庚申, 일주: 壬子)

[년주 모드 — 사회적 지인]
  甲→庚: 편관 → 기본값 어둠=20, 주도권=-20
  → 위협 행동(darkAffinity +0.5): 사주 어둠이 낮아 어둠 정합성 음수
  → 스트레스 +7 (체질에 맞지 않음)

[일주 모드 — 친밀 관계로 전환 후]
  丁→壬: 정관 → 기본값 어둠=5, 주도권=-15, 유대=15
  → 위협 행동(darkAffinity +0.5): 사주 어둠이 더 낮아짐
  → 스트레스 +9 (더욱 맞지 않음, 내적 대가 증가)

  BUT 만약 일주 모드에서 丁→壬가 편재였다면?
  → 기본값 어둠=10, 주도권=+15
  → 위협 행동: 주도권 방향 일치 + 어둠 중간
  → 스트레스 -2 (오히려 해소)
```

**서사적 함의:**
- 사회적 관계에서 자연스럽게 지배하던 사람이, 관계가 깊어져 일주가 활성화되면 그 지배가 자기 내면과 충돌하기 시작할 수 있다
- 표면적으로 온순했던 관계가 위계 태그로 월주↔시주가 활성화되면, 잔혹한 행동이 갑자기 "편한" 행동이 될 수 있다
- **같은 두 사람, 같은 행동인데 관계의 종류가 달라지자 내적 대가가 천차만별로 바뀐다**

이 메커니즘이 플레이어에게 "관계를 어떤 방향으로 발전시킬 것인가"라는 선택에 기계적 무게를 부여한다. 서약이나 예속 태그를 붙이는 것은 단순한 서사 라벨이 아니라, 그 관계에서의 모든 행동의 스트레스 경제를 근본적으로 재편하는 결정이다.

---

## 5. 호감도 재설계 — 3단계 베이스 + 태그 모디파이어

### 5-1. 첫 호감도 기본값 산출

호감도의 초기 베이스는 세 가지 하드웨어/체질적 요소의 곱으로 결정된다.

```
첫_호감도 = 외모태그_점수 × 일주궁합_계수 × 오행비율_계수
```

#### (A) 외모태그 점수 (Hardware)

캐릭터의 외모 관련 태그(appearance tags)가 상대의 선호와 얼마나 일치하는지. 가호록/액터 에디터의 외형 탭에서 설정되는 데이터를 기반으로 한다.

```javascript
function calcAppearanceScore(observerId, targetId) {
  const observer = $gameActors.actor(observerId);
  const target = $gameActors.actor(targetId);
  const prefs = observer.appearancePrefs || {};  // 선호 외모태그 목록
  const tags = target.appearanceTags || [];       // 대상의 외모태그 목록

  let score = 50; // 기본 50점 (중립)
  for (const tag of tags) {
    if (prefs.liked && prefs.liked.includes(tag)) score += 10;
    if (prefs.disliked && prefs.disliked.includes(tag)) score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}
```

#### (B) 일주궁합 계수

기존 GahoSystem.js의 getCompatibility를 확장한다. 일주(일간+일지) 기준 상성.

```javascript
function calcDayPillarCompat(actorA, actorB) {
  const stemA = actorA.gahoData.dayStem;
  const stemB = actorB.gahoData.dayStem;
  const branchA = actorA.gahoData.dayBranch;
  const branchB = actorB.gahoData.dayBranch;

  let score = 50; // 기본 중립

  // 천간합 체크
  if (isStemCombination(stemA, stemB)) score += 20;
  // 천간충 체크
  if (isStemClash(stemA, stemB)) score -= 10;
  // 일지 육합
  if (isBranchHexComb(branchA, branchB)) score += 15;
  // 일지 충
  if (isBranchClash(branchA, branchB)) score -= 15;
  // 일지 형
  if (isBranchPunishment(branchA, branchB)) score -= 10;

  return score / 100; // 0.0 ~ 1.0 계수로 변환
}
```

#### (C) 오행비율 궁합 계수

두 캐릭터의 사주팔자 전체 오행 분포 비율의 상보성.

```javascript
function calcElementRatioCompat(actorA, actorB) {
  const ratioA = getElementRatio(actorA); // [木%, 火%, 土%, 金%, 水%]
  const ratioB = getElementRatio(actorB);

  // 상생 관계 오행의 비율이 높을수록 궁합 Good
  let synergy = 0;
  for (let i = 0; i < 5; i++) {
    const genTarget = (i + 1) % 5; // 상생 대상
    synergy += ratioA[i] * ratioB[genTarget]; // A가 B를 생하는 정도
    synergy += ratioB[i] * ratioA[genTarget]; // B가 A를 생하는 정도
  }

  // 상극 관계는 감산
  let conflict = 0;
  for (let i = 0; i < 5; i++) {
    const ctlTarget = (i + 2) % 5;
    conflict += ratioA[i] * ratioB[ctlTarget];
    conflict += ratioB[i] * ratioA[ctlTarget];
  }

  const raw = 50 + (synergy - conflict) * 50;
  return Math.max(0.2, Math.min(1.5, raw / 100)); // 0.2 ~ 1.5 계수
}
```

### 5-2. 호감도 산출 공식 (동적)

면식 이후, 호감도는 4축 + 태그의 종합 스냅샷으로 매번 재산출된다.

```javascript
function calcImpression(observerId, targetId) {
  const rel = getRelation(observerId, targetId);
  if (!rel.known) return 0;

  // 4축 기반값
  let base = 0;
  base += rel.bond * 0.4;       // 유대가 주축 (+0~40)
  base -= rel.darkness * 0.3;   // 어둠이 감산 (-0~30)
  base += rel.desire * 0.1;     // 이끌림은 미약한 양수 (+0~10)
  // 주도권은 호감도에 직접 영향 없음 — 존경/두려움은 별개

  // 태그 보정
  let tagMod = 0;
  for (const tag of rel.tags) {
    tagMod += IMPRESSION_TAG_VALUES[tag] || 0;
  }

  return clamp(Math.round(base + tagMod), -100, 100);
}
```

### 5-3. 호감도 구간별 NPC 반응

| 호감도 | 반응 기조 | 키워드 |
|--------|---------|--------|
| +80~+100 | 경애 | 절대적 신뢰, 무조건적 호의 |
| +50~+79 | 호의 | 친절, 협조적, 부탁 수용 |
| +20~+49 | 우호 | 기본적 호의, 경계 없음 |
| -19~+19 | 중립 | 무관심, 사무적, 이해타산적 |
| -49~-20 | 경계 | 불신, 거리 두기, 부탁 거절 |
| -79~-50 | 적대 | 노골적 적의, 공격적 언사 |
| -100~-80 | 증오 | 살의, 배신, 적극적 해치려는 의도 |

> **호감도는 "문을 열어주는가"를 결정하고, 4축은 "문 뒤에서 무슨 일이 벌어지는가"를 결정한다.**

---

## 6. 4계층 사회 관계 (Social Relationship Layers)

```
┌──────────────────────────────────────────────────┐
│  Layer 3: Chemistry (4축 + 스트레스)               │ ← 심층 엔진
│  사주 기반 체질적 상성. 플레이어 불가시.              │
├──────────────────────────────────────────────────┤
│  Layer 2: History Tags (관계 이력 태그)            │ ← 사실의 기록
│  수치가 아닌 태그 누적. 친족도 태그.                 │
├──────────────────────────────────────────────────┤
│  Layer 1: Impression (호감도)                     │ ← 현재 평가
│  단일 수치 -100~+100. 4축+태그 종합 스냅샷.         │
├──────────────────────────────────────────────────┤
│  Layer 0: Acquaintance (면식)                     │ ← 이진값
│  초면=false, 면식=true. 행동 출현 관문.              │
└──────────────────────────────────────────────────┘
```

**Layer 0**이 행동 출현을, **Layer 1**이 NPC 반응을, **Layer 2**가 이벤트 분기를, **Layer 3**가 내부 역학을 담당한다.

### 6-1. Layer 0: 면식 (Acquaintance)

boolean 값. 최초 의미 있는 접촉 시 자동 전이. 한번 면식이면 영원히 면식. 초면이면 "말 걸기"와 폭력 행위만 가능.

### 6-2. Layer 2: 관계 이력 태그 (History Tags)

수치화가 아닌 사실의 기록. 친족 관계도 태그로 표현. `saved_life`와 `betrayed`가 같은 배열에 공존할 수 있다.

#### 태그 부여 원칙 — "수치 게이팅 + 이벤트 부여" 이중 관문

**태그는 시스템이 자동으로 붙이지 않는다. 이벤트(커먼이벤트)가 부여한다.**

시스템은 "이 이벤트가 발생할 수 있는 조건이 됐는가"를 수치로 판정할 뿐이다. 실제 태그 부여는 이벤트 내 연출, 선택지, 판정을 거친 뒤 플러그인 커맨드로 실행한다.

```
[수치 조건 충족] ← 4축/스트레스/컨텍스트가 임계치 도달
       │
       ▼
[외적 상황 부합] ← 전투 중 아군 치명상 / 포로 상태 / 단둘이 등
       │
       ▼
[커먼이벤트 트리거] ← 연출 + 선택지 + 판정 진행
       │
       ▼
[태그 부여] ← 플러그인 커맨드: RelationSystem.addTag(actorA, actorB, tagId)
```

예시: `saved_life` 태그는 "보호" 버튼을 눌렀다고 붙지 않는다. 전투 중 아군이 HP 20% 이하일 때 치료/구출 행동을 실행하고, 해당 전투에서 아군이 생존하면, 전투 후 커먼이벤트가 트리거되어 `saved_life` 태그를 부여한다. 수치(HP 조건, 4축 유대 수준)가 문을 열고, 이벤트가 열쇠를 돌리는 구조.

#### 태그 사전 (발췌)

| 카테고리 | 태그 ID | 호감도 보정 | 트리거 조건 (수치 게이팅 예시) |
|----------|---------|-----------|---------------------------|
| 교류 | first_met | +5 | 첫 접촉 시 자동 (유일한 자동 태그) |
| 교류 | traveled_together | +8 | 동행 N일 이상 (이벤트 확인) |
| 전투 | saved_life | +25 | 아군 HP≤20% 상태에서 치료/구출 성공 |
| 전투 | sacrificed_for | +35 | 보호 행동으로 자신이 치명상 |
| 배신 | betrayed | -40 | 신뢰 태그 보유 중 적대 행동 |
| 지배 | enslaved | -30 | 전투 후 포로에 예속 선택 |
| 친밀 | confess_accepted | +30 | 호감도≥50 상태에서 고백 이벤트 성공 |
| 친밀 | sworn_oath | +25 | 유대≥60, 어둠<20 상태에서 서약 이벤트 |
| 친족 | blood_sibling | +10 | 설정 시점 부여 (게임 시작/시나리오) |

> **수치는 조건이고, 이벤트가 행위이며, 태그는 결과다.** "+15"는 아무것도 기억하지 않지만 "saved_my_life"는 영원히 기억한다. 수치는 현재 상태를, 태그는 역사를 담당한다.

---

## 7. 스트레스 시스템 (CK3-style)

### 7-1. 설계 철학

**모든 행동은 항상 가능하다.** 4축이 행동을 차단하지 않는다. 면식 + 컨텍스트가 행동 출현을 결정하되, 출현한 행동은 전부 선택 가능.

대신 행동이 캐릭터의 사주 체질과 어긋나면 **스트레스**가 쌓인다. 체질에 맞는 행동은 해소, 반하는 행동은 축적.

- 어둠 낮은 캐릭터가 잔혹한 행동을 할 수 있다. 단지 내적 대가를 치른다.
- 어둠 높은 캐릭터가 선행을 할 수 있다. 단지 그것이 스트레스다.
- **"하지 마"가 아니라 "대가가 있다"를 보여준다.**

### 7-2. 스트레스 수치

```
Stress: 0~100
  0~20:  평온. 모든 판정 정상.
  21~40: 긴장. 미세한 징후 (대사 변화).
  41~60: 동요. 소규모 패널티 시작.
  61~80: 불안정. 판정 실패율 상승, 돌발 행동 가능.
  81~99: 한계. 전투 능력 심각 저하.
  100:   붕괴 (Breakdown). 강제 이벤트 트리거.
```

### 7-3. 스트레스 연산 — 사주 정합성 (Temperament Alignment)

```javascript
function calcStressChange(actorId, targetId, actionType) {
  // ★ baseline은 "이 관계의" 사주 기본값 — 활성주에 따라 달라진다 (§4-4)
  const rel = getRelation(actorId, targetId);
  const baseline = { darkness: rel.bDk, dominance: rel.bDo, bond: rel.bBo };
  const action = ACTION_TABLE[actionType];
  let alignment = 0;

  // 어둠 정합성
  if (action.darkAffinity > 0) {
    alignment += (baseline.darkness - 50) / 50 * action.darkAffinity;
  } else if (action.darkAffinity < 0) {
    alignment += (50 - baseline.darkness) / 50 * Math.abs(action.darkAffinity);
  }

  // 주도권 정합성
  if (action.domDirection !== 0) {
    const sajuSign = Math.sign(baseline.dominance) || 1;
    alignment += (sajuSign === action.domDirection) ? 0.3 : -0.3;
  }

  // 유대 정합성
  if (action.bondAffinity !== 0) {
    alignment += (baseline.bond - 40) / 60 * action.bondAffinity;
  }

  return Math.round(-alignment * action.intensity);
}
```

### 7-4. 붕괴 이벤트 (Breakdown)

스트레스 100 도달 시 캐릭터 성향별 강제 이벤트:

| 사주 성향 | 붕괴 유형 | 효과 |
|----------|----------|------|
| 어둠 HIGH + 주도권 +HIGH | RAGE (폭주) | 가장 가까운 대상에 폭력 |
| 어둠 HIGH + 주도권 -LOW | CRUELTY (음습) | 약자 대상 가학 |
| 유대 HIGH | DESPAIR (절망) | 무기력, 전투 불능 |
| 이끌림 HIGH | FRENZY (광란) | 충동적 쾌락 추구 |
| 주도권 -HIGH | SURRENDER (항복) | 완전한 자기 포기 |
| 기타 | NUMBNESS (무감각) | 관계 수치 일시 동결 |

붕괴 후 스트레스는 50으로 리셋.

---

## 8. 트라우마 레이어 — 강화 태그

### 8-1. 설계 원칙

트라우마는 관계 이력 태그보다 강렬한 **강화 태그**다. 일반 태그가 호감도 보정과 이벤트 분기에 영향을 미치는 반면, 트라우마는 **4축 입력 자체를 왜곡**하고, 극단적일 경우 **원국(사주 기본값)까지 영구 변질**시킨다.

사주가 "타고난 궤도"라면 트라우마는 "궤도 위에 놓인 프리즘"이다.

### 8-2. 트라우마 데이터 구조

트라우마는 severity 추적 없이 **존재 여부(boolean)**로만 관리한다. 붕괴 1회 = 트라우마 1개.

```javascript
// $gameSystem._trauma에 저장 (§12 참조)
// 트라우마 배열: 최대 4개 (붕괴 횟수 = 트라우마 수 = 공망 수)
$gameSystem._trauma = {
  actorId: [
    {
      type: "betrayal",        // 유형 코드 (6종)
      sourceId: actorId|null,  // 이벤트 트라우마: 원인 제공자 / 붕괴 트라우마: null
    }
  ]
};
```

> **이벤트 트라우마 vs 붕괴 트라우마:** 이벤트(폭행, 배신 등)로 부여되는 트라우마는 입력 왜곡(§8-4)에만 영향을 주고 공망을 유발하지 않는다. 공망은 오직 스트레스 붕괴를 통해서만 발생한다(§8-6).

### 8-3. 6종 트라우마 유형 + 입력 왜곡 필터

#### BETRAYAL (배신)
- **원인:** 신뢰하던 대상의 기만, 뒤통수, 약속 파기
- **왜곡:** 유대 입력 감쇠 + 유대 양수 입력의 일부가 어둠으로 전이
- "누군가 호의를 베풀면 '무슨 속셈이지?'"

#### VIOLENCE (폭력/고문)
- **원인:** 물리적 폭행, 고문, 압도적 패배
- **왜곡:** 주도권 민감도 증폭 + 피지배 시 어둠/이끌림 이상 반응
- 약간의 제압에도 과잉 반응. 공포+끌림의 혼재가 기계적으로 발생

#### FORCED_INTIMACY (강제 친밀)
- **원인:** 성적 강제, 약물/마법에 의한 강제 각성
- **왜곡:** 이끌림→어둠 결합 + 친밀 행위의 유대 보너스 감쇠~역전
- "싫은데 몸이 반응한다"의 기계적 표현

#### ENSLAVEMENT (예속)
- **원인:** 장기 포로 생활, 노예 상태, 지속적 종속
- **왜곡:** 주도권이 음수로 끌림(사주 무관) + 지배자에 대한 비정상 유대 상승
- 학습된 무력감. 스톡홀름 증후군의 기계적 토대

#### LOSS (상실)
- **원인:** 사랑하는 대상의 죽음, 영구적 이별
- **왜곡:** 유대 상한 제한 (100 - severity/2)
- 가장 단순하지만 잔혹. 욕망은 느끼되 진짜 정을 주는 데 보이지 않는 벽

#### INDOCTRINATION (세뇌)
- **원인:** 마법적 정신 지배, 장기 교화
- **왜곡:** 세뇌자 대상에 궤도 자체를 override + 타인에 대한 이끌림/유대 감쇠
- 가짜 사주가 덮어씌워진 상태. 어둠이 0으로 설정되어 본인은 행복하다고 느낌

### 8-4. 트라우마 입력 필터 함수

```javascript
function applyTraumaFilter(actorId, targetId, rawChange) {
  const traumas = $gameTrauma[actorId] || [];
  let filtered = { ...rawChange };

  for (const t of traumas) {
    if (t.sourceId !== null && t.sourceId !== targetId) continue;
    const s = t.severity / 100;

    switch (t.type) {
      case 'betrayal':
        if (filtered.bond > 0) {
          const bleed = filtered.bond * (s / 2);
          filtered.bond *= (1 - s / 2);
          filtered.darkness += bleed;
        }
        break;
      case 'violence':
        filtered.dominance *= (1 + s);
        if (filtered.dominance < 0) {
          filtered.darkness += Math.abs(filtered.dominance) * (s / 3);
          filtered.desire += Math.abs(filtered.dominance) * (s / 4);
        }
        break;
      case 'forced_intimacy':
        if (filtered.desire > 0) filtered.darkness += filtered.desire * (s / 1.5);
        if (filtered.bond > 0) filtered.bond *= (1 - s / 0.8);
        break;
      case 'enslavement':
        filtered.dominance -= s * 10;
        if (t.sourceId === targetId && filtered.bond > 0)
          filtered.bond *= (1 + s / 1.5);
        break;
      case 'loss':
        // 유대 천장은 applyChange 시 클램프에서 별도 처리
        break;
      case 'indoctrination':
        if (t.sourceId !== targetId) {
          if (filtered.desire > 0) filtered.desire *= (1 - s / 2);
          if (filtered.bond > 0) filtered.bond *= (1 - s / 2);
        }
        break;
    }
  }
  return filtered;
}
```

### 8-5. 트라우마 회복

트라우마는 severity 없이 **존재/해소**의 이진 상태다. 해소 조건을 충족하면 트라우마 엔트리가 제거된다.

| 회복 방법 | 조건 | 효과 |
|----------|------|------|
| 치유 마법/의식 | 1회성 이벤트 | 이벤트 트라우마 1개 해소 |
| 가해자 처단/복수 완수 | source 대상에 한정 | 해당 source 트라우마 해소 |
| 특수 퀘스트 완수 | 서사적 치유 이벤트 | 붕괴 트라우마 1개 해소 + 공망 해제 |
| PURE_LOVE 달성 | 해당 주 관련 관계 | 붕괴 트라우마 해소 + 공망 해제 |

```javascript
function healTrauma(actorId, traumaIndex) {
  const trauma = $gameSystem._trauma[actorId][traumaIndex];
  // 붕괴 트라우마(sourceId === null)는 공망도 함께 해제
  if (trauma.sourceId === null) {
    const pillar = TRAUMA_PILLAR_MAP[trauma.type]; // §8-6 매핑 참조
    const voided = $gameSystem._voidedBranches[actorId];
    if (voided) {
      const idx = voided.indexOf(pillar);
      if (idx >= 0) voided.splice(idx, 1);
    }
  }
  $gameSystem._trauma[actorId].splice(traumaIndex, 1);
}
```

> 트라우마는 해소 가능하다. 하지만 붕괴의 기억과 공망의 흉터는 서사에 남는다.

### 8-6. 공망 (空亡) — 붕괴 1회 = 트라우마 1개 = 원국 1곳 손상

원국 자체가 변질되는 것이 아니다. **스트레스 붕괴(Breakdown) 1회가 트라우마 1개를 누적**하고, 트라우마 1개가 쌓일 때마다 관련 원국의 지지 **1곳이 비활성화(공망)**된다. 최대 4회 붕괴 = 4개 트라우마 = 4주 전부 공망 가능.

```
핵심 루프:
  스트레스 100 도달 → 붕괴(Breakdown) 강제 이벤트
    → 트라우마 1개 누적 (붕괴 유형에 따라 트라우마 유형 결정)
    → 해당 트라우마 유형에 대응하는 주(柱) 1곳의 지지 공망 처리
    → 스트레스 50으로 리셋
    → 다음 붕괴 시 또 다른 트라우마/공망 누적

최대 한계:
  4회 붕괴 = 4개 트라우마 = 4주 전부 공망 → 완전 고립 상태
```

#### 붕괴 유형 → 트라우마 유형 → 공망 대상 매핑

| 붕괴 유형 (§7-4) | 생성 트라우마 | 공망 대상 | 서사적 의미 |
|------------------|-------------|----------|-----------|
| RAGE (폭주) | VIOLENCE | 시주 지지 | 하위 관계 기능 손상 — 타인을 돌볼 수 없다 |
| CRUELTY (음습) | VIOLENCE | 시주 지지 | 하위 관계 기능 손상 — 약자를 보호하는 본능이 사라졌다 |
| DESPAIR (절망) | LOSS | 일주 지지 | 친밀 관계 근본 손상 — 누군가를 깊이 사랑할 수 없다 |
| FRENZY (광란) | FORCED_INTIMACY | 일주 지지 | 내밀한 관계 기능 손상 — 욕망과 친밀이 뒤엉켰다 |
| SURRENDER (항복) | ENSLAVEMENT | 월주 지지 | 사회적 역할 손상 — 스스로 결정하는 능력을 잃었다 |
| NUMBNESS (무감각) | INDOCTRINATION | 년주 지지 | 사회적 페르소나 손상 — 세계와의 연결이 끊어졌다 |

> 이벤트를 통해 발생하는 트라우마(BETRAYAL 등)는 별도의 공망을 유발하지 않는다. 공망은 **오직 스트레스 붕괴를 통해서만** 발생한다.

#### 공망의 기계적 효과

```javascript
function isVoided(actorId, pillarKey) {
  const voided = $gameSystem._voidedBranches[actorId];
  return voided && voided.includes(pillarKey);
}

// 지지 관계 판정 시 공망 체크
function calcBranchRelations(branchA, branchB, actorA, actorB, pillarKeyA, pillarKeyB) {
  if (isVoided(actorA, pillarKeyA) || isVoided(actorB, pillarKeyB)) {
    return []; // 공망 → 지지 보정 전부 비활성
  }
  return bRels(branchA, branchB);
}

// 붕괴 → 트라우마 + 공망 처리
function processBreakdown(actorId, breakdownType) {
  const BREAKDOWN_MAP = {
    'RAGE':      { trauma: 'violence',         pillar: 'h' },
    'CRUELTY':   { trauma: 'violence',         pillar: 'h' },
    'DESPAIR':   { trauma: 'loss',             pillar: 'd' },
    'FRENZY':    { trauma: 'forced_intimacy',  pillar: 'd' },
    'SURRENDER': { trauma: 'enslavement',      pillar: 'm' },
    'NUMBNESS':  { trauma: 'indoctrination',   pillar: 'y' },
  };
  const map = BREAKDOWN_MAP[breakdownType];

  // 트라우마 누적 (severity 없음 — 있거나 없거나)
  if (!$gameSystem._trauma[actorId]) $gameSystem._trauma[actorId] = [];
  $gameSystem._trauma[actorId].push({ type: map.trauma, sourceId: null });

  // 공망 처리
  if (!$gameSystem._voidedBranches[actorId]) $gameSystem._voidedBranches[actorId] = [];
  if (!$gameSystem._voidedBranches[actorId].includes(map.pillar)) {
    $gameSystem._voidedBranches[actorId].push(map.pillar);
  }

  // 스트레스 리셋
  $gameSystem._stress[actorId] = 50;
}
```

### 8-7. 트라우마 외형 그룹화 — 스탠딩 이미지 최소화

트라우마는 6종이지만 스탠딩 이미지 제작 비용을 줄이기 위해 **3종 외형 그룹**으로 통합한다. 각 캐릭터는 기본 스탠딩 + 트라우마 그룹별 스탠딩 레이어(최대 3종)를 준비한다.

| 외형 그룹 | 포함 트라우마 | 외형 변화 | 스탠딩 레이어 |
|----------|-------------|----------|-------------|
| **위축형** (Withdrawn) | VIOLENCE, ENSLAVEMENT | 움츠린 자세, 시선 회피, 방어적 체형 | trauma_withdrawn |
| **무표정형** (Hollow) | BETRAYAL, LOSS | 감정이 빠진 눈, 무기력한 표정, 창백 | trauma_hollow |
| **불안정형** (Unstable) | FORCED_INTIMACY, INDOCTRINATION | 불안한 눈빛, 경직된 미소, 떨림 | trauma_unstable |

```javascript
const TRAUMA_VISUAL_GROUP = {
  'violence':         'withdrawn',
  'enslavement':      'withdrawn',
  'betrayal':         'hollow',
  'loss':             'hollow',
  'forced_intimacy':  'unstable',
  'indoctrination':   'unstable',
};

// StandingManager 연동 — 트라우마 보유 시 레이어 자동 적용
function getTraumaVisualLayer(actorId) {
  const traumas = $gameSystem._trauma[actorId] || [];
  if (traumas.length === 0) return null;
  // 가장 최근 트라우마의 외형 그룹 적용 (복수면 우선순위: unstable > withdrawn > hollow)
  const groups = traumas.map(t => TRAUMA_VISUAL_GROUP[t.type]);
  if (groups.includes('unstable')) return 'trauma_unstable';
  if (groups.includes('withdrawn')) return 'trauma_withdrawn';
  if (groups.includes('hollow')) return 'trauma_hollow';
  return null;
}
```

> 트라우마가 2개 이상 누적되면 외형은 우선순위가 높은 그룹이 적용된다. 개별 스탠딩을 전부 만들 필요 없이, **캐릭터당 최대 3종의 트라우마 레이어**만 준비하면 된다.

#### 공망 해제 (회복)

공망은 극도로 어렵지만 **회복 가능**하다.

| 해제 조건 | 설명 |
|----------|------|
| 특수 치유 이벤트 (퀘스트) | 고위 치유 의식, 현자의 개입 등 |
| 해당 주와 관련된 관계에서 PURE_LOVE 달성 | 공망된 일주가 순애 관계를 통해 회복 |
| 트라우마 치유 완료 | 해당 트라우마의 입력 왜곡이 완전 해소된 후 |

> 원국은 변하지 않았다. 연결이 끊어진 것이다. 끊어진 연결은 다시 이을 수 있지만, 흉터는 남는다.

---

## 9. [삭제됨 — 사주 궤도 효과(Tendency Pull)]

> **설계 결정:** 4축이 고정 기준값으로 변경됨에 따라 Tendency Pull(수치 회귀)은 불필요해져 제거되었다. 4축은 변동하지 않으므로 "회귀"할 대상이 없다. 사주의 운명적 구속력은 **스트레스 비용의 비대칭성**으로 충분히 표현된다 — 체질에 반하는 행동은 항상 더 비싸다.

---

## 10. 행동 시스템 (Action Table)

### 10-1. 행동 출현 — 면식 + 컨텍스트

| 컨텍스트 | 출현 행동 |
|----------|----------|
| BASE (항상) | 대화, 선물, 유혹, 접촉 |
| PARTY (동행 중) | 보호, 치료, 위로, 구출 |
| PRIVATE (단둘이) | 고백, 친밀행위, 위협, 고백수락, 서약, 의형제 |
| BATTLE (전투 후) | 처벌, 예속, 용서, 해방, 폭행 |
| CAPTIVE (포로) | 강제행위, 약물/마법, 복종, 해방, 친밀행위 |
| SETUP (설정용) | 부모/자녀/형제/혼인/주군/봉신/소유주/노예 |

초면에서도 가능한 행동: 말걸기, 폭행, 강제행위, 약물, 예속, 치료, 해방, 복종

### 10-2. 행동별 스트레스 파라미터 (발췌)

> 4축은 고정 기준값이므로 행동에 의한 4축 변동은 없다. 행동은 **스트레스 비용**과 **호감도/태그 변동**에만 영향을 미친다.

| 행동 | 어둠친화 | 주도방향 | 유대친화 | 강도 | 트라우마(이벤트) | 호감도 보정 |
|------|---------|---------|---------|------|----------------|-----------|
| 대화 | 0 | 0 | +0.3 | 3 | | +3 |
| 선물 | -0.3 | 0 | +0.5 | 4 | | +8 |
| 보호 | -0.5 | +1 | +0.6 | 6 | | +10 |
| 고백 | -0.4 | 0 | +0.8 | 8 | | +15 |
| 유혹 | +0.1 | +1 | 0 | 5 | | +5 |
| 친밀행위 | -0.2 | 0 | +0.7 | 7 | | +15 |
| 위협 | +0.5 | +1 | -0.5 | 6 | | -10 |
| 처벌 | +0.7 | +1 | -0.5 | 7 | | -10 |
| 폭행 | +0.8 | +1 | -0.8 | 9 | VIOLENCE | -15 |
| 강제행위 | +1.0 | +1 | -1.0 | 10 | FORCED_INTIMACY | -15 |
| 예속 | +1.0 | +1 | -1.0 | 10 | ENSLAVEMENT | -15 |
| 배신 | +0.7 | 0 | -1.0 | 10 | BETRAYAL | -20 |
| 용서 | -0.6 | 0 | +0.8 | 8 | | +15 |
| 희생 | -0.8 | 0 | +1.0 | 10 | | +25 |

> **스트레스 연산 참조 축:** 어둠친화 → baseline.darkness, 주도방향 → baseline.dominance 부호, 유대친화 → baseline.bond (§7-3 참조)

---

## 11. 서사 궤적 패턴 (Narrative Arc Patterns)

4축 궤적 시퀀스로 정의된 서사 패턴. 특정 수치 흐름 감지 시 이벤트 트리거.

### 11-1. 7종 패턴

| 패턴 | 조건 | 설명 |
|------|------|------|
| **CORRUPTION** | 이끌림≥80, 어둠≥50, FORCED_INTIMACY 활성 | 쾌락타락. "싫다고 하면서 몸은 반응" |
| **TRAINING** | 주도권≤-50, ENSLAVEMENT 활성, source 유대≥40 | 조교. 체계적 과정으로 자아 재구축 |
| **NTR** | 삼자 관계에서 배신 트라우마 발생 | A-B 기존 관계에 C 개입 |
| **TOTAL_VOID** | 공망 3곳 이상 (붕괴 3회+) | 거의 모든 관계 기능 상실. 원국 대부분 비활성화 |
| **REVENGE** | 주도권≤-30, 어둠≥40 → 주도권 역전 이벤트 | 증오+욕망이 뒤엉킨 역전극 |
| **STOCKHOLM** | ENSLAVEMENT + 가해자가 유일한 高유대 + 타인 유대 전부 LOW | 시스템이 자연 발생시키는 의존 |
| **PURE_LOVE** | 이끌림≥50, 유대≥60, 어둠<15, |주도권|<15 | 가장 희귀한 궤적. 조건 자체가 도전 |

### 11-2. 패턴 감지 함수

```javascript
function detectNarrativePattern(actorId, targetId) {
  const rel = getRelation(actorId, targetId);
  const traumas = $gameTrauma[actorId] || [];
  const patterns = [];

  // 4축은 고정 기준값 — baseline을 직접 참조
  if (rel.bDe >= 80 && rel.bDk >= 50
      && traumas.some(t => t.type === 'forced_intimacy'))
    patterns.push('CORRUPTION');

  if (rel.bDo <= -50 && rel.bBo >= 40
      && traumas.some(t => t.type === 'enslavement' && t.sourceId === targetId))
    patterns.push(rel.bBo >= 60 ? 'TRAINING_DEVOTION' : 'TRAINING_FEAR');

  if (rel.bDe >= 50 && rel.bBo >= 60
      && rel.bDk < 15 && Math.abs(rel.bDo) < 15)
    patterns.push('PURE_LOVE');

  if (rel.bDo <= -30 && rel.bDk >= 40)
    patterns.push('REVENGE_READY');

  // 공망 기반 패턴 (DARK_FALL → TOTAL_VOID)
  const voided = $gameSystem._voidedBranches[actorId] || [];
  if (voided.length >= 3) patterns.push('TOTAL_VOID');

  return patterns;
}
```

### 11-3. 복합 서사

| 복합 패턴 | 구성 | 서사 |
|----------|------|------|
| CORRUPTION → REVENGE | 쾌락타락 후 주도권 역전 | 타락한 뒤 가해자를 같은 방식으로 갚는다 |
| TRAINING → STOCKHOLM → 해방 | 조교 → 의존 → 외부 개입 | 구출되었지만 가해자를 그리워하는 비극 |
| NTR → TOTAL_VOID | 빼앗김 → 관계 기능 상실 | 배신과 붕괴가 원국 대부분을 비활성화 |
| ENSLAVEMENT → REVENGE → TRAINING | 예속 → 복수 → 역조교 | 피해자가 가해자가 되는 순환 |

> 복합 패턴은 별도 코딩이 아니라, 기존 시스템의 자연스러운 조합으로 발생한다.

---

## 12. 데이터 저장 아키텍처

### 12-1. 원국 데이터 — 플러그인 파라미터 (불변, 에디터 시점)

원국(사주팔자)은 캐릭터의 체질이므로 게임 중 변하지 않는다. **노트태그가 아닌 플러그인 파라미터**로 저장한다. 이미 GahoSystem.js에서 GANS/JIS를 플러그인 파라미터로 관리하고 있고, 액터 에디터(RMMZStudio)에서 천간/지지를 드롭다운으로 배정하는 UI도 존재하므로, 같은 패턴을 확장한다.

```javascript
// plugins.js — GahoSystem 파라미터 내 actorSaju 항목
{
  "name": "GahoSystem",
  "parameters": {
    "actorSaju": JSON.stringify({
      "1": { // Actor ID
        "yearStem": 0, "yearBranch": 2,   // 년주: 甲寅
        "monthStem": 4, "monthBranch": 5,  // 월주: 戊巳
        "dayStem": 3, "dayBranch": 8,      // 일주: 丁申
        "hourStem": 8, "hourBranch": 0,    // 시주: 壬子
        "appearanceTags": ["tall", "scarred", "dark_hair"],
        "appearancePrefs": { "liked": ["graceful"], "disliked": ["bulky"] }
      },
      "2": { ... }
    })
  }
}
```

**장점:**
- RMMZStudio 액터 에디터에서 드롭다운으로 편집 가능 (기존 가호 탭 확장)
- 노트태그보다 오타 위험 없음, 구조화된 JSON
- 네이티브 RMMZ 에디터에서도 플러그인 파라미터로 접근 가능
- 외모태그/선호도를 같은 구조에 포함 → 호감도 초기값 산출에 즉시 사용

**접근 API:**
```javascript
GahoSystem.getActorSaju = function(actorId) {
  return this._actorSaju[actorId] || null;
};
GahoSystem.getActorPillar = function(actorId, pillarKey) {
  // pillarKey: 'y'(년), 'm'(월), 'd'(일), 'h'(시)
  const saju = this._actorSaju[actorId];
  const stemKey = {y:'yearStem', m:'monthStem', d:'dayStem', h:'hourStem'}[pillarKey];
  const branchKey = {y:'yearBranch', m:'monthBranch', d:'dayBranch', h:'hourBranch'}[pillarKey];
  return { stem: saju[stemKey], branch: saju[branchKey] };
};
```

### 12-2. 관계 동적 데이터 — $gameSystem 세이브 연동

관계의 동적 상태(태그, 호감도, 활성주)는 `$gameSystem`에 붙여서 세이브/로드한다. **4축은 고정 기준값**이므로 활성주 변경 시에만 재산출된다. **첫 면식 시점에 기본값을 연산해서 초기화**한다.

```javascript
// $gameSystem에 저장되는 관계 데이터
$gameSystem._relations = {
  "1_2": {
    known: true,
    bDe: 40, bDo: 10, bBo: 40, bDk: 0,                  // 4축 고정 기준값 (활성주 기준)
    activeMode: 'year',                                   // 현재 활성 모드
    tags: ['first_met', 'talked', 'fought_alongside'],    // 관계 이력 태그
    impression: 22,                                       // 호감도 캐시
    baseImpression: 55,                                   // 첫 호감도 (외모×궁합)
  },
  "2_1": { ... }
};

$gameSystem._stress = { 1: 15, 2: 0, 3: 42, ... };  // actorId: stress

// 트라우마: severity 없이 존재 여부만 추적. 최대 4개(이벤트) + 4개(붕괴)
$gameSystem._trauma = {
  3: [
    { type: 'betrayal', sourceId: 2 },        // 이벤트 트라우마 (입력 왜곡만)
    { type: 'loss', sourceId: null },          // 붕괴 트라우마 (공망 유발)
  ]
};

// 공망: 붕괴 트라우마로 비활성화된 지지 목록
$gameSystem._voidedBranches = {
  3: ['d']  // 일주 지지 공망
};
```

**초기화 타이밍:**
```javascript
// 첫 면식 시 호출 — 관계 데이터 생성
RelationSystem.initRelation = function(actorA, actorB) {
  const key = actorA + '_' + actorB;
  if ($gameSystem._relations[key]) return; // 이미 존재

  // 활성주 결정 (태그 없으므로 year 모드)
  const pairA = GahoSystem.getActorPillar(actorA, 'y');
  const pairB = GahoSystem.getActorPillar(actorB, 'y');

  // 4축 기본값 연산
  const baseline = this.calcBaseline(pairA, pairB);

  // 첫 호감도 산출
  const appearance = this.calcAppearanceScore(actorB, actorA); // B가 A를 보는 시점
  const dayCompat = this.calcDayPillarCompat(actorA, actorB);
  const elemCompat = this.calcElementRatioCompat(actorA, actorB);
  const baseImp = Math.round(appearance * dayCompat * elemCompat);

  $gameSystem._relations[key] = {
    known: true,
    bDe: baseline.desire, bDo: baseline.dominance,
    bBo: baseline.bond, bDk: baseline.darkness,  // 4축 고정 기준값
    activeMode: 'year',
    tags: [],  // 태그는 이벤트가 부여 (first_met 포함)
    impression: baseImp,
    baseImpression: baseImp,
  };
};
```

### 12-3. 저장 계층 요약

| 데이터 | 저장 위치 | 변경 빈도 | 세이브 포함 |
|--------|----------|----------|-----------|
| 원국 (사주팔자 8주) | plugins.js 파라미터 | 불변 | X (고정) |
| 외모태그 / 선호도 | plugins.js 파라미터 | 불변 | X (고정) |
| 천간/지지 마스터 데이터 | GahoSystem.js (GANS/JIS) | 불변 | X (고정) |
| 4축 기준값 + 태그 + 면식 | $gameSystem._relations | 활성주 변경 시 | O |
| 스트레스 | $gameSystem._stress | 매 행동 | O |
| 트라우마 | $gameSystem._trauma | 이벤트 시 | O |
| 공망 (비활성화 지지) | $gameSystem._voidedBranches | 붕괴 시 | O |

### 12-4. 게임 변수 매핑

자주 참조하는 값만 이벤트 커맨드용 게임 변수에 복사:

| 변수 번호 | 용도 |
|----------|------|
| 101 | 현재 대화 상대 Actor ID |
| 102 | 현재 관계 이끌림 |
| 103 | 현재 관계 주도권 |
| 104 | 현재 관계 유대 |
| 105 | 현재 관계 어둠 |
| 106 | 관계 유형 코드 (classify 결과) |
| 107 | 면식 여부 (0/1) |
| 108 | 호감도 |
| 109 | 스트레스 |
| 110~121 | 주요 태그 존재 여부 (0/1) |

---

## 13. 데이터 흐름 — 행동 실행 파이프라인

```
플레이어 행동 선택
    │
    ▼
[Layer 0: 면식 체크] ─── 초면이면 "말 걸기/폭력"만, 면식이면 통과
    │
    ▼
[컨텍스트 체크] ─── 상황 조건 필터 (BASE/PARTY/PRIVATE/BATTLE/CAPTIVE)
    │
    ▼
행동 실행 (즉시 처리)
    │
    ├──▶ [스트레스 변동] ─── 4축 고정 기준값 × 행동 파라미터 (§7-3)
    │         ├──▶ 트라우마 필터 적용 (applyTraumaFilter)
    │         ├──▶ 공망 체크 (비활성 지지 → 해당 모드 보정 스킵)
    │         └──▶ 붕괴 체크 (stress ≥ 100)
    │               └──▶ 붕괴 시: 트라우마 1개 + 공망 1곳 + 스트레스 50 리셋
    │
    ├──▶ [Layer 1: 호감도 변동] ─── 행동별 호감도 보정 (§10-2) + 태그 모디파이어
    │         └──▶ NPC 반응/대사 분기
    │
    └──▶ [이벤트 트라우마] ─── 극단적 행동 시 트라우마 부여 (입력 왜곡만, 공망 없음)

수치 변동 후 이벤트 게이팅 (비동기)
    │
    ├──▶ [수치 임계치 체크] ─── 호감도/스트레스/컨텍스트 조건 충족?
    │         │
    │         ▼
    │    [커먼이벤트 트리거] ─── 연출, 선택지, 판정
    │         │
    │         ▼
    │    [Layer 2: 태그 부여] ─── 이벤트 결과로 태그 추가
    │         ├──▶ 활성주 모드 재계산 (태그에 따라 주 전환)
    │         └──▶ 4축 기준값 즉시 교체 (활성주 변경 시)
    │
    └──▶ [서사 패턴 감지] ─── detectNarrativePattern
```

---

## 14. 성인 씬 트리거 조건

| 조건 | 씬 유형 | 톤 |
|------|---------|-----|
| 이끌림≥70, 유대≥60, 어둠<30 | 합의된 친밀 | 로맨틱~열정적 |
| 이끌림≥70, 주도권≥40, 어둠<30 | 주도적 관계 | 지배적이지만 상호 수용 |
| 이끌림≥60, 주도권≥40, 어둠≥50 | 강제/강압 | 다크. 가해자 시점 or 피해자 시점 |
| 이끌림≥50, 주도권≤-40, 어둠≥50 | 피지배/굴복 | 저항 실패 or 굴종 수용 |
| 이끌림≥80, 어둠≥60 | 집착/광기 | 극단적. 상호 파멸 가능 |
| 이끌림≥50, 유대≥70, 어둠<20, 주도권≈0 | 대등한 사랑 | 가장 "건강한" 관계 |
| 이끌림<30, 주도권≥50, 어둠≥40 | 도구적 행위 | 감정 없는 지배 |

> **어둠이 씬의 톤을 결정한다.** 같은 이끌림+주도권 조합이라도 어둠에 따라 "열정적 밤"이 될 수도 있고 "잔혹한 밤"이 될 수도 있다. (여기서 4축은 고정 기준값 bDe/bDo/bBo/bDk를 참조한다.)

---

## 15. 현행 코드 마이그레이션 계획

### 15-1. GridInventory.js 교체 대상

| 현행 | 교체 후 |
|------|---------|
| `_impressions` {actorId: number} | `$gameSystem._relations` 4축 구조체 |
| `_bondTags` {actorId: string} | Layer 2 관계 이력 태그 배열 |
| `_mood` (0~100) | `$gameSystem._stress` (0~100) |
| `complianceRate` 계산 | `calcImpression` + NPC 반응 판정 |
| `decayImpressions` | 제거됨 (4축 고정 → 궤도 회귀 불필요) |
| `recalcMood` | `calcStressChange` (사주 정합성) |

### 15-2. GahoSystem.js 보존/확장

보존 항목: GANS, JIS, 오행 상생상극 테이블, 천간합/충 조견표, 지지 육합/충/형/해 테이블

확장 항목:
- `actorSaju` 파라미터 로드/접근 API (`getActorSaju`, `getActorPillar`)
- `getSipsin(stemA, stemB)` — 십신 판정 함수 추가
- `getActiveMode(tags)` / `getActivePair(mode, fromTags, toTags)` — 활성주 결정
- `calcRelationBaseline(actorA, actorB, pillarKeyA, pillarKeyB)` — 4축 기본값 연산

---

## 16. 인게임 UI 설계

### 16-1. 정보 공개 원칙 — "플레이어가 아는 것 vs 시스템이 아는 것"

| 계층 | 플레이어 공개 | 표시 방식 |
|------|-------------|----------|
| Layer 0 (면식) | 완전 공개 | 초상화 아이콘 활성/비활성 |
| Layer 1 (호감도) | 구간 공개 (정확한 숫자 비공개) | 표정 아이콘 7단계 (증오~경애) |
| Layer 2 (태그) | 선택 공개 | 관계 키워드 뱃지 (예: "생명의 은인", "배신자") |
| Layer 3 (4축) | **기본 비공개**, 조건부 공개 | 가호록/점성술 NPC를 통해 열람 가능 |
| 스트레스 | 구간 공개 | 캐릭터 초상화 옆 표정/색조 변화 |
| 트라우마 | 존재 여부만 공개 | 보라색 흉터 아이콘 |

> **Layer 3(4축)를 기본 비공개로 하는 이유:** 플레이어가 숫자를 직접 보면 "이끌림 60 → 70으로 올리기" 같은 수치 최적화 플레이가 되어버린다. 대신 Layer 1(호감도 구간)과 Layer 2(태그)로 간접적 피드백을 주고, 4축의 결과물인 NPC 반응과 대사 톤으로 관계의 질감을 체감하게 한다. 가호록이나 점성술 NPC를 찾아가면 "이 사람과의 원소 상성이 불안정합니다" 같은 힌트를 받을 수 있어서, 시스템을 파고드는 플레이어에게도 깊이를 제공한다.

### 16-2. 메뉴 관계(Bonds) 화면 — MenuOverhaul.js 확장

현재 MenuOverhaul.js의 관계 화면(인물 목록 + 관계 설명)을 다음과 같이 확장:

```
┌─────────────────────────────────────────────────────┐
│  [관계]                                              │
│                                                     │
│  ┌─────────┐  아르테미아    ★ 열정 (관계유형)          │
│  │ 초상화  │  ──────────────────────────              │
│  │         │  [😊 호의]     스트레스: ████░░░░░ 42    │
│  └─────────┘                                        │
│                                                     │
│  태그: [생명의 은인] [함께 싸움] [서약]                  │
│                                                     │
│  ─── 원소 상성 ────────────────────                   │
│  "불과 물의 이끌림이 강합니다"  (활성: 일주↔일주)        │
│                                                     │
│  ─── 최근 기억 ────────────────                      │
│  "고블린 동굴에서 당신의 생명을 구했다"                  │
│  "서로의 이름을 걸고 서약했다"                          │
│                                                     │
│  [가호록에서 상세 상성 확인]  ← 4축 열람 진입점          │
└─────────────────────────────────────────────────────┘
```

**주요 요소:**
- 관계 유형 라벨 (classify 결과): 열정/전우/보호자/집착/폭압 등
- 호감도 구간 아이콘: 7단계 표정
- 스트레스 바: 자기 캐릭터의 현재 스트레스 (관계별이 아닌 캐릭터별)
- 태그 뱃지: 주요 관계 이력 시각화
- 원소 상성 한 줄 요약: 활성주 기반 힌트 텍스트
- 트라우마 아이콘: 보라색, 존재 시에만 표시

### 16-3. 가호록 상세 상성 화면 — 4축 열람

가호록(gahorok.html) 또는 인게임 점성술 NPC를 통해 접근하는 상세 화면. 여기서만 4축 수치를 수치적으로 확인 가능.

```
┌─────────────────────────────────────────────────────┐
│  [원소 상성 — 아르테미아 ↔ 카엘란]                      │
│                                                     │
│  활성 원리: 일주↔일주 (親密)                            │
│  丁(등불) → 壬(파도): 정관                              │
│                                                     │
│  이끌림  ████████░░░░░░░░░░░░  40                    │
│  주도권  ◄━━━━━━━━━━●━━━━━━►  +12                    │
│  유  대  ██████████████░░░░░░  68                    │
│  어  둠  ███░░░░░░░░░░░░░░░░  15                    │
│                                                     │
│  궤도(사주 기본값):                                    │
│  이끌림 35 → 현재 40 (↑ 행동 누적)                     │
│  주도권 -15 → 현재 +12 (↑ 역전 중)                     │
│  유  대 40 → 현재 68 (↑ 유대 형성)                     │
│  어  둠  5 → 현재 15 (↑ 소량 오염)                     │
│                                                     │
│  ─── 체질 해석 ────────                              │
│  "등불이 파도를 비추니, 고요한 밤의 동반자.              │
│   그러나 파도가 등불을 삼킬 수도 있으니                  │
│   조심스럽게 불씨를 지켜야 합니다."                      │
│                                                     │
│  [트라우마]  없음                                      │
│  [서사 궤적] PURE_LOVE 조건 근접 (어둠 15 → <15 필요)   │
└─────────────────────────────────────────────────────┘
```

### 16-4. 행동 선택 UI — 컨텍스트 메뉴 확장

현재 SRPG의 radialMenu를 확장하거나, 대화/상호작용 시 별도 행동 메뉴를 띄운다. 각 행동 옆에 스트레스 예상 변동을 색상으로 힌트:

```
┌───────────────────────┐
│  [행동 선택]            │
│                       │
│  ● 대화      ░ (중립)  │
│  ● 선물      🟢 (-2)  │  ← 초록: 스트레스 해소
│  ● 유혹      🟡 (+3)  │  ← 노랑: 소량 스트레스
│  ● 위협      🔴 (+8)  │  ← 빨강: 대량 스트레스
│  ● 접촉      🟢 (-1)  │
│                       │
│  현재 스트레스: 42/100  │
└───────────────────────┘
```

스트레스 색상 기준: 해소(초록), ±2 이내(회색/중립), 소량 축적(노랑), 대량 축적(빨강)

### 16-5. 관계 변동 알림 — 인게임 피드백

행동 실행 후 결과를 간결하게 표시:

```
┌─────────────────────────────────────┐
│  아르테미아 → 카엘란: 보호           │
│  [유대 ▲] [호감도: 우호 → 호의]     │
│  스트레스 -3                        │
└─────────────────────────────────────┘
```

활성주 전환 시 특별 알림:
```
┌─────────────────────────────────────┐
│  ★ 관계의 깊이가 변했습니다         │
│  아르테미아 ↔ 카엘란                │
│  [사회적 인연] → [내밀한 유대]       │
│  원소 상성이 재조정됩니다            │
└─────────────────────────────────────┘
```

### 16-6. RMMZStudio 에디터 UI

스튜디오의 액터 에디터 가호 탭을 확장하여:
- 사주 8주 드롭다운 (기존 유지)
- 외모태그 편집기 (체크박스 또는 태그 입력)
- 외모 선호도 편집기
- **시뮬레이터 버튼**: 두 액터를 선택하면 3가지 모드별 4축 기본값을 미리 계산해서 보여줌 (saju_v4.html의 기능을 에디터에 내장)

---

## 17. 구현 우선순위

### Phase 1 — 골격 (기반 데이터)
1. GahoSystem.js에 actorSaju 플러그인 파라미터 구조 추가
2. 십신 판정 함수 (getSipsin)
3. 4축 기본값 연산 함수 (calcBaseline)
4. 관계 데이터 $gameSystem 저장/로드
5. 이벤트 커맨드 연동 (변수 매핑)

### Phase 2 — 사회적 관계 계층
6. 면식 여부 관리 (known + 자동 전이)
7. 관계 이력 태그 시스템 (addHistoryTag + 연쇄 처리)
8. 호감도 산출 (첫 호감도 3요소 + 동적 재산출)
9. NPC 반응 판정 (호감도 기반)

### Phase 3 — 스트레스 + 행동
10. 스트레스 수치 관리 ($gameSystem._stress)
11. 행동 테이블 정의 (ACTION_TABLE)
12. 면식 + 컨텍스트 통합 행동 출현
13. 스트레스 연산 (사주 정합성 — 활성주 기반)
14. 붕괴 이벤트 (triggerBreakdown)

### Phase 4 — 동적 관계
15. 활성주 시스템 (태그 → 주 전환 → 4축 기준값 즉시 교체 → 스트레스 효율 변경)
16. 관계 유형 자동 분류 (classifyRelation — 고정 4축 기준)
17. 씬 트리거 조건 판정
18. 트라우마 외형 그룹화 (StandingManager 연동 — 3종 레이어)

### Phase 5 — 트라우마 + 공망
19. 트라우마 데이터 구조 (이벤트/붕괴 이원화)
20. 트라우마 입력 필터 (applyTraumaFilter)
21. 붕괴 → 트라우마 → 공망 자동 연쇄 (processBreakdown)
22. 트라우마 회복 + 공망 해제 (healTrauma)

### Phase 6 — 서사 궤적
25. 서사 패턴 감지 (detectNarrativePattern)
26. 삼각관계 질투 함수 (triggerJealousy)
27. 복수 역전 판정 (triggerRevenge)
28. 패턴별 전용 커먼이벤트 연동

### Phase 7 — UI/UX (인게임)
29. MenuOverhaul 관계 화면 확장 (§16-2)
30. 행동 선택 UI + 스트레스 예측 색상 (§16-4)
31. 관계 변동 알림 + 활성주 전환 알림 (§16-5)
32. 가호록 상세 상성 화면 (§16-3)

### Phase 8 — UI/UX (에디터)
33. RMMZStudio 액터 가호 탭 확장 (외모태그/선호도)
34. RMMZStudio 관계 시뮬레이터 (§16-6)

---

## 부록 A. 천간 10×10 십신 조견표

A(행) → B(열) 방향으로 읽는다.

|   | 甲 | 乙 | 丙 | 丁 | 戊 | 己 | 庚 | 辛 | 壬 | 癸 |
|---|----|----|----|----|----|----|----|----|----|----|
| **甲** | 비견 | 겁재 | 식신 | 상관 | 편재 | 정재 | 편관 | 정관 | 편인 | 정인 |
| **乙** | 겁재 | 비견 | 상관 | 식신 | 정재 | 편재 | 정관 | 편관 | 정인 | 편인 |
| **丙** | 편인 | 정인 | 비견 | 겁재 | 식신 | 상관 | 편재 | 정재 | 편관 | 정관 |
| **丁** | 정인 | 편인 | 겁재 | 비견 | 상관 | 식신 | 정재 | 편재 | 정관 | 편관 |
| **戊** | 편관 | 정관 | 편인 | 정인 | 비견 | 겁재 | 식신 | 상관 | 편재 | 정재 |
| **己** | 정관 | 편관 | 정인 | 편인 | 겁재 | 비견 | 상관 | 식신 | 정재 | 편재 |
| **庚** | 편재 | 정재 | 편관 | 정관 | 편인 | 정인 | 비견 | 겁재 | 식신 | 상관 |
| **辛** | 정재 | 편재 | 정관 | 편관 | 정인 | 편인 | 겁재 | 비견 | 상관 | 식신 |
| **壬** | 식신 | 상관 | 편재 | 정재 | 편관 | 정관 | 편인 | 정인 | 비견 | 겁재 |
| **癸** | 상관 | 식신 | 정재 | 편재 | 정관 | 편관 | 정인 | 편인 | 겁재 | 비견 |

---

## 부록 B. 최종 기본값 연산 예시

### 예시 1: 甲(寅월) → 己(未월) [기본 모드: 년주↔년주]

1. 甲→己: 정재 → 이끌림+20, 주도권+10, 유대+25, 어둠+0
2. 甲己합 → 이끌림+20, 유대+15
3. 寅-未: 해당 없음 → 보정 없음

결과: 이끌림=40, 주도권=+10, 유대=40, 어둠=0
→ "헌신적 동반자로 발전하기 좋은 자연적 끌림. 독성 낮음."

### 예시 2: 庚(申월) → 甲(寅월) [기본 모드: 년주↔년주]

1. 庚→甲: 편재 → 이끌림+30, 주도권+15, 유대+10, 어둠+10
2. 甲庚충 → 이끌림+15, 주도권+20, 어둠+10
3. 申-寅: 충 → 이끌림+10, 어둠+10

결과: 이끌림=55, 주도권=+35, 유대=10, 어둠=30
→ "강한 정복욕. 끌림과 지배가 동시에. 유대는 낮고 독성 있음. 전장에서 사로잡은 적을 취하는 유형."

---

*문서 작성일: 2026-04-27 (구조 개편: 2026-04-27 — 4축 고정화, Tendency Pull 제거, 트라우마/공망 단순화)*
*기반 자료: saju_relationship_system.md (1601줄), saju_v4.html (488줄)*
*현행 코드: GridInventory.js, GahoSystem.js, MenuOverhaul.js*
