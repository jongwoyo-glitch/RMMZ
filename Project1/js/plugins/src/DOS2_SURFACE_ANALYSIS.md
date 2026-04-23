# Divinity: Original Sin 2 — 장판/구름 시스템 근본 분석

> 작성일: 2026-04-20  
> 목적: SRPG 원소 시스템 설계의 레퍼런스로 활용

---

## 1. 시스템 아키텍처 개요

DOS2의 환경 효과 시스템은 **3계층 구조**로 이루어져 있다.

**Surface(장판)** — 지면 타일. 진입/체류 시 상태이상 부여. 다른 원소 스킬에 의해 변환됨.  
**Cloud(구름)** — 공중 레이어. 시야 차단 및 상태이상. 장판과 독립적으로 존재.  
**Modifier(변형자)** — Blessed/Cursed. 장판·구름에 덧씌워져 효과를 근본적으로 변질시킴.

핵심 설계 원칙: **모든 장판은 다른 원소에 의해 변환될 수 있고, 변환 결과가 또 다른 반응을 연쇄시킬 수 있다.**

---

## 2. DOS2 장판(Surface) 완전 목록

### 2-A. 기본 장판 (Normal)

| 장판 | 원소 | 진입 효과 | 핵심 반응 | 비고 |
|------|------|-----------|-----------|------|
| **Fire** | 불 | Burning (DoT) | 물→소멸+Steam, 얼음→소멸+Steam, 독·기름→폭발 | 가장 파괴적 |
| **Water** | 물 | Wet | 불→소멸+Steam, 얼음→Ice, 전기→Electrified Water | 반응 매질 |
| **Electrified Water** | 물+전기 | Shocked→Stunned | 물의 변형. 전기 피해 | |
| **Blood** | (특수) | — | 얼음→Frozen Blood, 전기→Electrified Blood | Wet과 유사 |
| **Electrified Blood** | 피+전기 | Shocked→Stunned | Blood의 변형 | |
| **Poison** | 독 | Poisoned (DoT) | 불→폭발+Fire | 언데드 치유 |
| **Oil** | 흙 | Slowed | 불→폭발+Fire | 갑옷 무시 둔화 |
| **Ice** | 얼음 | KnockDown 확률 | 불→Water | 미끄러짐 |
| **Frozen Blood** | 피+얼음 | KnockDown 확률 | 불→Blood | Ice와 동일 |
| **Lava** | (특수) | 즉사급 화염 | 제거 불가 | 축복/저주/동결 불가 |
| **Source** | (특수) | Source Point 충전 | — | 비전투 자원 |
| **Web** | (특수) | Enwebbed(속박) | 불→Fire | 갑옷 무시 |

**총 12종.** 이 중 핵심 반응 장판은 Fire, Water, Blood, Poison, Oil, Ice의 **6종**.

### 2-B. 축복 장판 (Blessed)

| 장판 | 효과 변화 |
|------|-----------|
| Blessed Fire | **Holy Fire** — 치유 + Frozen 면역. 언데드에 피해 |
| Blessed Water | 치유. 언데드에 피해 |
| Blessed Electrified Water | **Haste** 부여 |
| Blessed Blood | 치유 |
| Blessed Electrified Blood | **Haste** 부여 |
| Blessed Poison | **Regeneration** (독→재생으로 반전) |
| Blessed Oil | **Fortified** + Stun/Petrified 정화 |
| Blessed Ice | **Magic Shell** (마법 방어↑) 확률 |
| Blessed Frozen Blood | **Magic Shell** 확률 |
| Blessed Web | **Haste** 부여 (속박→가속 반전) |

**패턴: 피해→치유, 디버프→버프로 반전. 유해 장판이 유익 장판으로 전환.**

### 2-C. 저주 장판 (Cursed)

| 장판 | 효과 변화 |
|------|-----------|
| Cursed Fire | **Necrofire** — 물/얼음으로 소화 불가. 정화 필요 |
| Cursed Water | **Decaying** (치유 시 피해) + 수속성 피해 |
| Cursed Electrified Water | **Stunned** (Shocked 스킵, 즉시 기절) |
| Cursed Blood | **Decaying** |
| Cursed Electrified Blood | **Stunned** |
| Cursed Poison | **Acid** + Poisoned (이중 상태이상) |
| Cursed Oil | Slowed + 이동 시 폭발 확률 |
| Cursed Ice | **Frozen** 확률 (마법 방어 무시) |
| Cursed Frozen Blood | **Frozen** |
| Cursed Web | 속박 100% (확률→확정) + 갑옷 무시 |

**패턴: 기존 효과 강화 + 제거 저항(정화 필요) 또는 방어 무시.**

---

## 3. DOS2 구름(Cloud) 완전 목록

### 3-A. 기본 구름 (Normal)

| 구름 | 원소 | 효과 | 생성 조건 |
|------|------|------|-----------|
| **Fire Cloud** | 불 | Burning + 화염 피해 | 대규모 화염 스킬 |
| **Steam Cloud** | 물 | Burning 제거 | Fire+Water 반응 (물이 불을 끔) |
| **Electrified Steam** | 물+전기 | Shocked + 전기 피해 | Steam에 전기 |
| **Blood Cloud** | 피 | 무해 | 대량 출혈 |
| **Electrified Blood Cloud** | 피+전기 | Shocked | Blood Cloud에 전기 |
| **Poison Cloud** | 독 | Poisoned + 독 피해 | 독 스킬 |
| **Smoke Cloud** | (부산물) | **시야 차단** | Fire 타임아웃, 폭발 잔여물 |
| **Explosion Cloud** | 불 | Burning (순간) | Oil/Poison+Fire 폭발 시 잠깐 나타남 |
| **Frost Explosion** | 얼음 | Chilled (순간) | 얼음 폭발 |
| **Deathfog** | (특수) | **생물 즉사** | 특수 환경 |

### 3-B. 축복 구름

| 구름 | 효과 |
|------|------|
| Blessed Fire Cloud | 치유 + Frozen 면역 |
| Blessed Steam | 치유 |
| Blessed Electrified Steam | Haste |
| Blessed Blood Cloud | 치유 |
| Blessed Electrified Blood Cloud | Haste |
| Blessed Poison Cloud | Regeneration |
| Blessed Smoke | **Invisibility** + Silence 정화 |

### 3-C. 저주 구름

| 구름 | 효과 |
|------|------|
| Cursed Fire Cloud | Necrofire |
| Cursed Steam | Decaying + 수속성 피해 |
| Cursed Electrified Steam | Stunned |
| Cursed Blood Cloud | Decaying |
| Cursed Electrified Blood Cloud | Stunned |
| Cursed Poison Cloud | Acid + Poisoned |
| Cursed Smoke | **Blind + Suffocating** |

---

## 4. 원소 반응 규칙 — DOS2의 핵심 로직

### 4-A. 장판 변환 테이블

```
Fire + Water  → 소멸 + Steam Cloud
Fire + Ice    → 소멸 + Steam Cloud  
Fire + Poison → 폭발 + Fire Surface (독 대체)
Fire + Oil    → 폭발 + Fire Surface (기름 대체)
Water + Ice   → Ice Surface (물이 얼음)
Water + Elec  → Electrified Water (변형)
Water + Fire  → 소멸 + Steam Cloud
Blood + Ice   → Frozen Blood
Blood + Elec  → Electrified Blood
Ice + Fire    → Water Surface (얼음이 녹음)
Poison + Fire → 폭발 + Fire
Oil + Fire    → 폭발 + Fire
```

### 4-B. 구름 반응

```
Steam + Elec   → Electrified Steam
Poison + Fire  → 폭발 + 소멸
Smoke + 시간   → 자연 소멸
```

### 4-C. 반응 우선순위 원칙

1. **물은 불을 끈다** — 가장 기본적인 반응
2. **전기는 매질을 전도한다** — Water/Blood/Steam을 전기화
3. **얼음은 액체를 얼린다** — Water/Blood → Ice/Frozen Blood
4. **불은 가연물을 태운다** — Oil/Poison → 폭발+Fire
5. **불은 얼음을 녹인다** — Ice → Water

### 4-D. 핵심 설계 특징

**① 양방향 반응**: Fire+Water = Water+Fire (결과 동일: Steam)

**② 변환은 대체(Replace)**: 새 장판이 기존 장판을 완전히 대체. 중첩 없음.

**③ 부산물 생성**: 장판 소멸 시 구름이 생길 수 있음 (Fire 소멸→Steam/Smoke)

**④ 연쇄 반응 가능**: Oil 깔기 → Fire 스킬 → 폭발 → Fire Surface 생성 → 인접 Poison에 연쇄 폭발

**⑤ 상태이상은 장판과 연동**: 장판 위 유닛은 매 턴 상태이상 갱신. 장판을 제거하면 근원이 사라짐.

---

## 5. Blessed/Cursed 시스템 — DOS2의 메타 레이어

### 5-A. 변환 규칙

```
Bless + Normal Surface → Blessed Surface
Bless + Cursed Surface → Normal Surface (정화)
Curse + Normal Surface → Cursed Surface
Curse + Blessed Surface → Normal Surface (상쇄)
```

**2단계 전환**: Cursed → (Bless) → Normal → (Bless) → Blessed. 저주에서 축복까지 Bless 2회 필요.

### 5-B. Blessed의 설계 의도

- **피해 반전**: 유해 장판이 치유 장판으로 전환
- **전략적 활용**: 적이 깐 Poison을 Bless → Blessed Poison(Regeneration)으로 역이용
- **팀 구분 없음**: DOS2에서 Blessed 장판은 아적 구분 없이 모두에게 유익

### 5-C. Cursed의 설계 의도

- **효과 강화**: 기존보다 더 강력한 버전
- **제거 저항**: Necrofire는 물/얼음으로 안 꺼짐 → Bless로 정화 후 물로 꺼야 함
- **방어 관통**: Cursed Ice는 Magic Armor 무시하고 Frozen
- **카운터 제한**: 저주 장판은 정상적 원소 반응으로 해결 불가 → Bless 스킬이 필수

### 5-D. Necrofire — 저주화염의 특별함

DOS2에서 가장 위험한 환경 효과. 일반 수단으로 제거 불가.
- 물을 부어도 안 꺼짐
- 얼음을 써도 안 꺼짐
- Bless로 먼저 정화 → Normal Fire → 그 다음 물/얼음으로 소화
- **"2단계 해제" 설계**: 저주 해제 → 원소 상쇄. 전략적 깊이의 핵심.

---

## 6. DOS2에 없는 것 (SRPG에서 독자 확장 가능 영역)

| 요소 | DOS2 상태 | SRPG 현재 설계 | 비고 |
|------|-----------|----------------|------|
| **바람** | 전용 장판/구름 없음 (Aerotheurge=전기 계열) | 구름(폭풍)+상태(풍압) 있음 | SRPG 독자 |
| **흙/진흙** | Oil이 Earth 계열 (Geomancer) | 진흙 장판 + 먼지 구름 있음 | SRPG 독자 확장 |
| **빛/어둠** | 없음 (Source/Void 계열은 별도) | 상태 전용 + 변형자 부여/해제 | SRPG 독자 |
| **Blood** | 독립 장판 (Necromancy) | 없음 | DOS2 독자 |
| **Deathfog** | 즉사 특수 구름 | 없음 | DOS2 독자 |
| **Web** | 거미줄 속박 장판 | 없음 | DOS2 독자 |
| **Source** | SP 충전 장판 | 없음 | DOS2 독자 |
| **구름→장판 전환** | Steam에 얼음 → Ice(드묾) | 눈구름→서리(제한적) | 확장 가능 |
| **유닛 상태+원소 반응** | Wet+전기→Stunned 등 | 젖음+천둥→감전 등 (유사) | 이미 구현 |

---

## 7. DOS2 vs SRPG 현재 설계 대조

### 7-A. 구조 비교

| 항목 | DOS2 | SRPG 현재 |
|------|------|-----------|
| 장판 기본 종류 | 6종 핵심 (Fire/Water/Blood/Poison/Oil/Ice) + 특수 3종 | 7종 (화염/용암/수면/빙판/진흙/기름/독늪) |
| 장판 변형 (전기화 등) | Electrified Water/Blood (2종) | 감전수/감전진흙 (2종) |
| 구름 기본 종류 | 7종 | 6종 |
| 변형자 단계 | 3단계 (Cursed↔Normal↔Blessed) | 3+1 단계 (저주↔일반↔축복, +독) |
| 원소 수 | 4핵심 (Fire/Water/Earth/Air) + Poison/Necro | 9종 (물리/불/얼음/천둥/물/흙/바람/빛/어둠) |
| 아/적 구분 | 축복도 아적 무차별 | 축복은 아/적 구분 |

### 7-B. 반응 구조 비교

| 반응 패턴 | DOS2 | SRPG 현재 |
|-----------|------|-----------|
| Fire+Water→Steam | ✅ | ✅ (화염+물→수증기) |
| Water+Elec→Electrified | ✅ | ✅ (수면+천둥→감전수) |
| Water+Ice→Frozen | ✅ | ✅ (수면+얼음→빙판) |
| Oil+Fire→Explosion | ✅ | ✅ (기름+불→화염) |
| Poison+Fire→Explosion | ✅ | ✅ (독늪+불→폭발+화염) |
| Ice+Fire→Water | ✅ | ✅ (빙판+불→수면) |
| Fire+Earth→Lava | ❌ (Oil=Earth계열) | ✅ (화염+흙→용암) — 독자 |
| Water+Earth→Mud | ❌ (없음) | ✅ (수면+흙→진흙) — 독자 |
| Wind 확산/제거 | ❌ | ✅ (바람이 구름 확산/제거) — 독자 |
| Blood 장판 | ✅ | ❌ |
| 2단계 저주 해제 | ✅ (Bless→Normal→Water) | ✅ (정화→일반→원소) |

### 7-C. SRPG가 DOS2보다 확장된 점

1. **바람 원소**: 구름 확산/제거 역할. DOS2에 없는 독자 시스템
2. **흙 원소 독립**: 진흙 장판, 먼지 구름. DOS2에서 Earth=Oil이었음
3. **용암 생성 반응**: 화염+흙→용암. DOS2에서 용암은 환경 고정 배치만
4. **빛/어둠 대립축**: 변형자 부여/해제 전용. DOS2에 없는 메타 시스템
5. **독이 변형자**: DOS2에서 Poison은 독립 원소. SRPG에서는 어디든 덧씌울 수 있는 레이어
6. **축복의 아/적 구분**: DOS2는 무차별. SRPG는 아군 버프+적 디버프 분리

### 7-D. DOS2에서 가져올 수 있는 것

1. **Blood 장판**: 네크로맨시/물리전투 피드백으로 활용 가능. Water와 유사하게 전기 전도.
2. **Smoke와 Steam 분리**: DOS2는 Fire 소멸→Steam, Fire 타임아웃→Smoke로 구분. SRPG는 연기 하나로 통합.
3. **Explosion Cloud**: 폭발 순간 구름. 시각적 피드백 강화.
4. **Blessed Smoke→Invisibility**: 축복 연기가 은신 부여. 은신 시스템과 연계 가능.
5. **Cursed 효과의 구체화**: Decaying(치유 반전), Suffocating(질식) 등 저주 전용 상태이상.
6. **Web 장판**: 속박 전용 장판. 소환수/트랩 시스템과 시너지.

---

## 8. 핵심 교훈 — DOS2 시스템이 작동하는 이유

### 교훈 1: 반응은 직관적이어야 한다

물이 불을 끄고, 전기가 물을 통해 퍼지고, 불이 기름을 태운다. 현실 물리를 기반으로 하되 게임적으로 단순화. 플레이어가 "이건 당연히 이렇게 되겠지"라고 예측할 수 있어야 한다.

### 교훈 2: 장판 수는 적고, 반응 밀도는 높게

DOS2 핵심 장판은 6종뿐. 하지만 6종 간의 반응이 촘촘하게 얽혀 있어 조합 깊이가 생긴다. 장판 수를 늘리는 것보다 기존 장판 간 반응을 풍부하게 만드는 것이 중요.

### 교훈 3: 변형자(Blessed/Cursed)는 복잡도를 곱하지 않는다

Normal 6종 × 3단계(Cursed/Normal/Blessed) = 18종처럼 보이지만, 규칙은 단순하다:
- Blessed = 효과 반전
- Cursed = 효과 강화 + 제거 저항

이 두 규칙만으로 모든 변형이 자동 도출된다. 개별 조합을 외울 필요가 없다.

### 교훈 4: 2단계 해제 구조가 전략적 깊이를 만든다

Cursed Fire → (Bless) → Normal Fire → (Water) → 소멸. 단순히 "물로 끄면 끝"이 아니라 선행 조건이 필요한 구조. 이것이 DOS2 전투를 전략적으로 만드는 핵심.

### 교훈 5: 부산물이 연쇄를 만든다

Fire+Water → Steam → Steam+Electric → Stunned. 하나의 행동이 의도치 않은 결과를 낳을 수 있는 구조. "불을 끄려고 물을 뿌렸는데 Steam이 발생해서 시야가 차단됐다" — 이런 창발적 상황이 재미.

---

## 9. SRPG 시스템 권장 조정 사항

현재 SRPG_ELEMENT_PHASE_DESIGN.md는 DOS2의 핵심 구조를 이미 잘 따르고 있다. 아래는 분석을 통해 도출된 세부 조정 제안.

### 조정 1: 연기 vs 수증기 생성 조건 명확화

DOS2 방식:
- Fire를 Water/Ice로 끄면 → **Steam**(수증기)
- Fire가 자연 소멸(턴 종료)하면 → **Smoke**(연기)

현재 SRPG: 화염+물 → 연기. 이것을 **수증기**로 바꿔야 자연스러움.
제안: 화염+물 → 수증기, 화염 자연소멸 → 연기.

### 조정 2: 독을 변형자가 아닌 독립 원소로 재고

DOS2에서 Poison은 독립 원소(자체 장판+구름). SRPG에서는 변형자로 설계.
변형자 방식의 장점: 어떤 장판에든 독을 얹을 수 있어 조합 폭이 넓음.
단점: 독이 Fire+Poison→폭발 같은 직접 반응을 하기 어려움.
**현재 설계 유지 권장** — 독 변형자는 DOS2보다 확장된 독자 시스템이므로.

### 조정 3: 저주 효과 구체화

DOS2 저주 효과 중 도입할 만한 것:
- **Decaying(부패)**: 치유 시 오히려 피해. 저주수/저주피에 적용.
- **Suffocating(질식)**: 저주 연기에 적용. 스킬 사용 불가.

현재 SRPG 저주는 "효과 강화+해제 불가"로 포괄적. 구체적 상태이상 추가 고려.

### 조정 4: 축복 아/적 구분 유지

DOS2는 Blessed가 아적 무차별. SRPG는 아/적 구분. **SRPG 방식이 전략적으로 더 풍부**하므로 유지.

### 조정 5: 폭발(Explosion) 시각 피드백

DOS2의 Explosion Cloud처럼 Oil/Poison+Fire 반응 시 순간 폭발 이펙트 추가. 현재 설계에서 "폭발(즉시 HP↓)"로 표기되어 있으나, 구름 레이어에 순간 이펙트 추가하면 시각적 임팩트 향상.

---

## 10. 특기 메카닉: 부패(Decaying)와 언데드(Undead)

### 10-A. 부패(Decaying) 상태이상

**효과: 치유를 받으면 치유량만큼 피해를 입는다.**

DOS2에서 가장 독특하고 전략적인 상태이상 중 하나. Cursed Water, Cursed Blood, Cursed Steam, Cursed Blood Cloud에 진입하면 부여된다.

핵심 규칙:
- 모든 치유 효과가 동일한 수치의 **피해**로 전환됨
- 예외: 네크로맨시 흡혈(Necromancy passive), 침대(Bedroll), Cleanse Wounds(부패 먼저 제거 후 치유)
- Fortify(토속성 방어 스킬)로 해제 가능
- Physical Armor가 부패 상태 부여를 차단

SRPG 적용 가치:
- **저주수(저주된 수면)의 고유 효과**로 채택 가능
- 힐러가 적에게 회복 스킬을 쓰면 오히려 피해 → "공격적 치유" 전술
- 언데드/부패 유닛에 대한 치유 스킬의 이중 용도
- 부패 상태의 유닛이 치유 장판(축복 장판 등) 위에 서면 오히려 피해 → 위치 전략

### 10-B. 언데드(Undead) 종족 특성

DOS2에서 언데드는 **치유와 독의 관계가 완전히 반전**된 종족.

핵심 규칙:
- 독 저항 200% → 독이 항상 **치유**로 작동
- 일반 치유 포션/스킬 → **피해**로 작동
- 독 장판 위에 서면 → HP 회복
- 치유 장판 위에 서면 → HP 감소
- Blessed Water/Fire 같은 축복 장판도 언데드에겐 **피해**

이것은 Decaying과 별개의 시스템:
- **Decaying** = 일시적 상태이상. 해제 가능. 치유→피해 전환
- **Undead** = 영구적 종족 특성. 치유→피해 + 독→치유 **양방향 반전**
- Undead에 Decaying이 걸리면? → 독이 다시 피해로 전환 (이중 반전!)

### 10-C. SRPG 적용 설계 제안

```
[부패 상태이상]
- 부여 조건: 저주수, 저주피(Blood), 특정 어둠 스킬
- 효과: 치유 효과 → 동일 수치의 피해로 전환
- 지속: 2턴
- 해제: 빛 스킬(정화), 특정 흙 스킬(강화)
- 장판 시너지: 축복 장판 위의 부패 유닛 → 치유가 피해로

[언데드 종족 특성]  
- 독 흡수: 독 피해 → HP 회복으로 전환
- 치유 반전: 일반 치유 스킬/포션 → 피해로 전환
- 독 장판 = 회복 장판, 축복 장판 = 피해 장판
- 부패 중첩 시: 독도 피해로 (이중 반전)
```

이 시스템이 만드는 전략적 상황 예시:
1. 적 언데드가 독늪 위에서 HP를 회복 중 → 빛 축복으로 독늪→축복독늪(Regeneration) → 언데드에겐 재생이 피해
2. 아군에 부패가 걸림 → 적 힐러가 "치유"로 아군을 공격 가능
3. 부패 유닛을 독 장판으로 밀어넣음 → 독 DoT가 (부패와 무관하게) 피해. 하지만 언데드+부패라면 독도 피해

---

## 11. DOS2 장판 × 원소 완전 조합표

모든 **기존 장판 + 투입 원소** 경우의 수를 정리한 매트릭스.

범례: → 변환, ↑ 강화, ✕ 소멸, ◎ 폭발, — 반응 없음

### 11-A. 장판(Surface) + 원소 스킬

| 기존 장판 \ 투입 원소 | 🔥 Fire | 💧 Water | ❄ Ice | ⚡ Electricity | 🧪 Poison | 🪨 Earth/Oil |
|---|---|---|---|---|---|---|
| **Fire** | ↑ 유지/확산 | → Steam(구름) + ✕소멸 | → Steam(구름) + ✕소멸 | — | ◎ 폭발 + Fire 유지 | — (비가연) |
| **Water** | → Steam(구름) + ✕소멸 | ↑ 유지/확산 | → **Ice** | → **Electrified Water** | — (희석) | → **Oil** (대체) |
| **Electrified Water** | → Steam(구름) + ✕소멸 | ↑ 유지 (전기 유지) | → **Ice** (전기 소멸) | ↑ 전기 유지 | — | → **Oil** (대체) |
| **Blood** | → Steam(구름) + ✕소멸 | — (공존) | → **Frozen Blood** | → **Electrified Blood** | — | — |
| **Electrified Blood** | → Steam(구름) + ✕소멸 | — | → **Frozen Blood** (전기 소멸) | ↑ 전기 유지 | — | — |
| **Poison** | ◎ 폭발 → **Fire** | — (희석/대체) | — | — | ↑ 유지/확산 | — |
| **Oil** | ◎ 폭발 → **Fire** | → **Water** (대체) | — | — | — | ↑ 유지/확산 |
| **Ice** | → **Water** (녹음) | → **Water** (녹음) | ↑ 유지/확산 | — (얼음은 비전도체) | — | — |
| **Frozen Blood** | → **Blood** (녹음) | → **Blood** (녹음) | ↑ 유지 | — | — | — |
| **Lava** | ↑ 유지 | — (제거 불가) | — (제거 불가) | — | — | — |
| **Web** | → **Fire** (연소) | — (제거) | — | — | — | — |
| **Source** | — | — | — | — | — | — |

### 11-B. 구름(Cloud) + 원소 스킬

| 기존 구름 \ 투입 원소 | 🔥 Fire | 💧 Water/Rain | ❄ Ice | ⚡ Electricity | 🧪 Poison | 💨 Wind |
|---|---|---|---|---|---|---|
| **Fire Cloud** | ↑ 유지 | → **Steam**(구름) | → **Steam**(구름) | — | ◎ 폭발 | — |
| **Steam Cloud** | — (증발 유지) | ↑ 유지 | — (응결→소멸 가능) | → **Electrified Steam** | — | 소멸 (흩뜨림) |
| **Electrified Steam** | — | ↑ 유지 | — | ↑ 전기 유지 | — | 소멸 |
| **Blood Cloud** | — | — | — | → **Electrified Blood Cloud** | — | 소멸 |
| **Electrified Blood Cloud** | — | — | — | ↑ 유지 | — | 소멸 |
| **Poison Cloud** | ◎ 폭발 + ✕소멸 | ✕소멸 (Rain으로 제거) | — | — | ↑ 유지 | 확산 |
| **Smoke Cloud** | — | ✕소멸 (Rain으로 제거) | — | — | — | 소멸 |
| **Deathfog** | — | — | — | — | — | — (제거 불가) |

### 11-C. 장판 → 구름 생성 경로

장판이 소멸/변환될 때 부산물로 구름이 생기는 경우:

| 장판 소멸 조건 | 생성되는 구름 |
|---|---|
| Fire + Water/Ice로 소화 | → **Steam Cloud** |
| Fire 자연 소멸 (턴 만료) | → **Smoke Cloud** |
| Water + Fire로 증발 | → **Steam Cloud** |
| Oil + Fire 폭발 | → **Explosion Cloud** (순간) → **Smoke Cloud** (잔여) |
| Poison + Fire 폭발 | → **Explosion Cloud** (순간) → **Fire Cloud** 또는 **Smoke Cloud** |
| Blood + Fire로 증발 | → **Steam Cloud** |

### 11-D. Blessed/Cursed 변형 시 반응 변화

변형자가 걸린 장판의 원소 반응은 기본적으로 동일하되, **저주 장판은 일반 원소 반응으로 제거 불가**:

| 상황 | 일반 장판 | 저주 장판 |
|---|---|---|
| Fire + Water | → Steam + 소멸 ✅ | → **반응 거부** (Necrofire는 물로 안 꺼짐) ❌ |
| Fire + Ice | → Steam + 소멸 ✅ | → **반응 거부** ❌ |
| Ice + Fire | → Water ✅ | → Cursed Ice는 불로 안 녹음 ❌ |
| 해제 절차 | 원소 반응으로 직접 | Bless → Normal로 전환 → 그 다음 원소 반응 |

이것이 DOS2 전투의 핵심 전략 깊이: **2단계 해제 구조**.

---

## 12. DOS2 유닛 상태 × 원소 반응

유닛에 걸린 상태이상이 추가 원소에 반응하는 경우:

| 유닛 상태 | + 투입 원소 | 반응 |
|---|---|---|
| **Wet** | + Electricity | → **Stunned** (즉시, Magic Armor 차감 후) |
| **Wet** | + Ice | → **Frozen** |
| **Wet** | + Fire | → Wet 해제 (증발) |
| **Burning** | + Water | → Burning 해제 |
| **Burning** | + Poison | → 폭발 (Burning 유닛이 Poison에 닿으면) |
| **Chilled** | + Ice | → **Frozen** (한기→동결 승급) |
| **Chilled** | + Fire | → Chilled 해제 |
| **Shocked** | + Electricity | → **Stunned** (감전→기절 승급) |
| **Poisoned** | + Fire | → Burning (독에 불 붙음) |
| **Frozen** | + 물리 피격 | → Frozen 해제 + **추가 피해** |
| **Stunned** | + 물리 피격 | → 추가 피해 (CC 상태 보너스) |
| **Decaying** | + 치유 | → 치유량만큼 **피해** |

---

## 13. DOS2 내부 데이터 — SurfaceType 열거형 전체 (공식 모딩 문서)

출처: https://docs.larian.game/Scripting_surface_types

### 13-A. 지면 장판 (Ground Surface) — 43종

```
[Fire 계열] — 4종
  0  SurfaceFire
  1  SurfaceFireBlessed
  2  SurfaceFireCursed
  3  SurfaceFirePurified

[Water 계열] — 12종  ★ 전기·동결 오버레이 가능
  4  SurfaceWater
  5  SurfaceWaterElectrified
  6  SurfaceWaterFrozen              ← "빙판"의 정체
  7  SurfaceWaterBlessed
  8  SurfaceWaterElectrifiedBlessed
  9  SurfaceWaterFrozenBlessed
  10 SurfaceWaterCursed
  11 SurfaceWaterElectrifiedCursed
  12 SurfaceWaterFrozenCursed
  13 SurfaceWaterPurified
  14 SurfaceWaterElectrifiedPurified
  15 SurfaceWaterFrozenPurified

[Blood 계열] — 12종  ★ 전기·동결 오버레이 가능
  16 SurfaceBlood
  17 SurfaceBloodElectrified
  18 SurfaceBloodFrozen
  19 SurfaceBloodBlessed
  20 SurfaceBloodElectrifiedBlessed
  21 SurfaceBloodFrozenBlessed
  22 SurfaceBloodCursed
  23 SurfaceBloodElectrifiedCursed
  24 SurfaceBloodFrozenCursed
  25 SurfaceBloodPurified
  26 SurfaceBloodElectrifiedPurified
  27 SurfaceBloodFrozenPurified

[Poison 계열] — 4종
  28 SurfacePoison
  29 SurfacePoisonBlessed
  30 SurfacePoisonCursed
  31 SurfacePoisonPurified

[Oil 계열] — 4종
  32 SurfaceOil
  33 SurfaceOilBlessed
  34 SurfaceOilCursed
  35 SurfaceOilPurified

[특수] — 7종
  36 SurfaceLava                     ← 변형 없음(1종만)
  37 SurfaceSource                   ← 변형 없음
  38 SurfaceWeb
  39 SurfaceWebBlessed
  40 SurfaceWebCursed
  41 SurfaceWebPurified
  42 SurfaceDeepwater                ← 변형 없음
```

### 13-B. 구름 (Cloud) — 31종

```
[FireCloud 계열] — 4종
  43 SurfaceFireCloud
  44 SurfaceFireCloudBlessed
  45 SurfaceFireCloudCursed
  46 SurfaceFireCloudPurified

[WaterCloud(=Steam) 계열] — 8종  ★ 전기 오버레이 가능
  47 SurfaceWaterCloud
  48 SurfaceWaterCloudElectrified
  49 SurfaceWaterCloudBlessed
  50 SurfaceWaterCloudElectrifiedBlessed
  51 SurfaceWaterCloudCursed
  52 SurfaceWaterCloudElectrifiedCursed
  53 SurfaceWaterCloudPurified
  54 SurfaceWaterCloudElectrifiedPurified

[BloodCloud 계열] — 8종  ★ 전기 오버레이 가능
  55 SurfaceBloodCloud
  56 SurfaceBloodCloudElectrified
  57 SurfaceBloodCloudBlessed
  58 SurfaceBloodCloudElectrifiedBlessed
  59 SurfaceBloodCloudCursed
  60 SurfaceBloodCloudElectrifiedCursed
  61 SurfaceBloodCloudPurified
  62 SurfaceBloodCloudElectrifiedPurified

[PoisonCloud 계열] — 4종
  63 SurfacePoisonCloud
  64 SurfacePoisonCloudBlessed
  65 SurfacePoisonCloudCursed
  66 SurfacePoisonCloudPurified

[SmokeCloud 계열] — 4종
  67 SurfaceSmokeCloud
  68 SurfaceSmokeCloudBlessed
  69 SurfaceSmokeCloudCursed
  70 SurfaceSmokeCloudPurified

[특수 구름] — 3종
  71 SurfaceExplosionCloud            ← 순간 구름, 변형 없음
  72 SurfaceFrostCloud                ← 순간 구름, 변형 없음
  73 SurfaceDeathfogCloud             ← 변형 없음
```

### 13-C. 조합 공식 분석

이 열거형에서 DOS2의 **실제 조합 공식**이 드러난다:

```
Surface = [기반 타입] × [원소 오버레이] × [변형자]
```

**기반 타입 (Base)**: Fire, Water, Blood, Poison, Oil, Web, Lava, Source, Deepwater
  + 구름: FireCloud, WaterCloud, BloodCloud, PoisonCloud, SmokeCloud, ExplosionCloud, FrostCloud, DeathfogCloud

**원소 오버레이 (Element Overlay)**: 기반 위에 얹히는 원소 속성
  - **Electrified** (전기): Water, Blood, WaterCloud, BloodCloud에만 적용 가능
  - **Frozen** (동결): Water, Blood에만 적용 가능 (구름에는 없음!)
  - Electrified와 Frozen은 **상호 배타적** (동시 불가)

**변형자 (Modifier)**: Normal, Blessed, Cursed, Purified
  - Fire, Water, Blood, Poison, Oil, Web + 주요 구름에 적용 가능
  - Lava, Source, Deepwater, ExplosionCloud, FrostCloud, DeathfogCloud에는 불가

### 13-D. 핵심 발견: 전기는 "원소 오버레이"

```
일반 원소의 장판 작용 방식:
  Water + Fire  → 소멸 + Steam        ← REPLACE (대체/소멸)
  Water + Ice   → WaterFrozen         ← TRANSFORM (상태 변환)
  Water + Elec  → WaterElectrified    ← OVERLAY (원본 유지 + 속성 추가)
  Oil   + Fire  → 폭발 + Fire         ← DESTROY + REPLACE

전기(Electricity)만의 특수성:
  ① 자기 장판이 없다 — SurfaceElectricity 같은 건 존재하지 않음
  ② 원본을 파괴하지 않는다 — Water는 그대로 Water, 거기에 Electrified가 붙을 뿐
  ③ 액체 계열에만 적용된다 — Water, Blood (+ 그 구름). Oil, Poison, Fire에는 불가
  ④ 다른 변환에 의해 떨어져 나간다 — ElectrifiedWater + Ice → WaterFrozen (전기 소멸)
  ⑤ 변형자와 공존한다 — WaterElectrifiedBlessed, BloodElectrifiedCursed 등 가능
```

이것은 "변형자"와 구분되는 별도의 레이어다:
```
Surface = [Base] × [ElementOverlay: None|Electrified|Frozen] × [Modifier: N|B|C|P]
```

### 13-E. 동결(Frozen)도 오버레이

빙판(Ice Surface)의 정체: **SurfaceWaterFrozen**. 독립된 "Ice Surface"가 아니라, **Water의 Frozen 오버레이**.

```
SurfaceWaterFrozen = Water + Frozen 오버레이
SurfaceBloodFrozen = Blood + Frozen 오버레이
```

이것이 의미하는 것:
- 빙판에 불을 쓰면? → Frozen 해제 → SurfaceWater로 복귀 (녹음)
- 빙판에 천둥을 쓰면? → Frozen 해제 + Electrified 적용 → SurfaceWaterElectrified
- **오버레이끼리는 상호 배타적** — Frozen이면 Electrified가 아니고, 그 역도 마찬가지

### 13-F. 3계층 구조 요약

```
┌─────────────────────────────────────────────┐
│ Layer 3: 변형자 (Modifier)                   │
│   Normal / Blessed / Cursed / Purified       │
│   - 빛/어둠 스킬로 전환                       │
│   - 거의 모든 장판/구름에 적용 가능            │
├─────────────────────────────────────────────┤
│ Layer 2: 원소 오버레이 (Element Overlay)      │
│   None / Electrified / Frozen                │
│   - 천둥/얼음 스킬로 전환                     │
│   - 액체 계열(Water, Blood)에만 적용          │
│   - 상호 배타적                               │
├─────────────────────────────────────────────┤
│ Layer 1: 기반 타입 (Base Type)               │
│   Fire, Water, Blood, Poison, Oil, Web...    │
│   - 원소 스킬로 생성/대체/소멸                 │
│   - 가장 근본적인 레이어                      │
└─────────────────────────────────────────────┘

예시:
  SurfaceWaterElectrifiedCursed
  = [Water] × [Electrified] × [Cursed]
  = 저주 감전수
  
  SurfaceBloodFrozenBlessed
  = [Blood] × [Frozen] × [Blessed]
  = 축복 동결피
```

---

## 출처

- [Environmental Effects — Fextralife Wiki](https://divinityoriginalsin2.wiki.fextralife.com/Environmental+Effects)
- [Environmental Effects — Divinity Fandom Wiki](https://divinity.fandom.com/wiki/Environmental_Effects_(Original_Sin_2))
- [Bless — Fextralife Wiki](https://divinityoriginalsin2.wiki.fextralife.com/Bless)
- [Curse — Fextralife Wiki](https://divinityoriginalsin2.wiki.fextralife.com/Curse)
- [Clouds and Combinations — Gamepressure](https://www.gamepressure.com/originalsinii/clouds-and-combinations/zfa275)
- [Environmental Effects and Combinations — Gamepressure](https://www.gamepressure.com/originalsinii/environmental-effects-and-combinations/zea274)
- [Damage Interaction FAQ — Steam Guide by Jarvz](https://steamcommunity.com/sharedfiles/filedetails/?id=1171813230)
- [Environmental Effects (Fields) — GameFAQs](https://gamefaqs.gamespot.com/pc/179840-divinity-original-sin-ii/faqs/75293/environmental-effects-fields)
