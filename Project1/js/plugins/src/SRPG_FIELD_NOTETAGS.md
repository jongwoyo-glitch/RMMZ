# SRPG 장판/구름 시스템 — 스킬 노트태그 가이드

## 개요
RMMZ 에디터의 스킬(Skill) "메모(Note)" 란에 아래 태그를 입력하면,
해당 스킬 사용 시 장판(Surface) 또는 구름(Cloud)이 자동 생성됩니다.

---

## 기본 태그

### 장판 생성
```
<srpgSurface:baseType,duration>
```
- **baseType**: 장판 종류 (아래 목록 참조)
- **duration**: 지속 턴 수

### 장판 변형자 (선택)
```
<srpgSurfaceModifier:modifier>
```
- **modifier**: `normal` (기본), `blessed`, `cursed`

### 구름 생성
```
<srpgCloud:baseType,duration>
```

### 구름 변형자 (선택)
```
<srpgCloudModifier:modifier>
```

---

## baseType 목록

| baseType | 한국어 | 주요 효과 |
|----------|--------|-----------|
| fire | 불 | 화상 데미지, 화염 장판 |
| water | 물 | 이동 감소, 물 장판 |
| ice | 얼음 | 빙결 확률, 미끄러움 |
| earth | 땅 | 방어 버프, 지형 변화 |
| wind | 바람 | 이동 증가, 밀치기 |
| lightning | 번개 | 감전, 전기 장판 |
| nature | 자연 | 회복, 독/구속 |
| poison | 독 | 독 데미지 |
| lava | 용암 | 강한 화상, 높은 AI 기피도 |
| steam | 증기 | 시야 차단, 회피 증가 |
| mud | 진흙 | 이동 대폭 감소 |
| acid | 산 | 방어 감소, 부식 |
| magma | 마그마 | 용암과 유사, 극한 데미지 |
| holy | 신성 | 아군 회복, 적 데미지 |
| dark | 암흑 | 저주, 시야 차단 |
| void | 공허 | 특수 반응, 소멸 |

---

## 사용 예시

### 화염 장판 (3턴, 일반)
```
<srpgSurface:fire,3>
```

### 축복받은 물 장판 (5턴)
```
<srpgSurface:water,5>
<srpgSurfaceModifier:blessed>
```

### 저주받은 독 구름 (2턴)
```
<srpgCloud:poison,2>
<srpgCloudModifier:cursed>
```

### 장판 + 구름 동시 생성
```
<srpgSurface:fire,3>
<srpgCloud:steam,2>
```

---

## 스킬 범위와 연동

장판/구름은 스킬의 `<srpgRange:...>` 범위에 맞춰 생성됩니다.
범위 태그가 없으면 타겟 단일 타일에만 생성됩니다.

```
<srpgRange:diamond,2>
<srpgSurface:ice,4>
<srpgSurfaceModifier:blessed>
```
→ 다이아몬드 범위 2칸에 축복받은 얼음 장판 4턴 생성

---

## 원소 반응

이미 장판이 존재하는 타일에 다른 원소 스킬을 사용하면 원소 반응이 발생합니다.
(예: 물 장판 + 번개 스킬 → 감전 장판 변환)

같은 원소의 장판이 이미 있으면 지속시간이 갱신됩니다.

---

## 변형자 효과

| modifier | 효과 |
|----------|------|
| normal | 기본 효과 |
| blessed | 아군에게 추가 버프 (회복, 보호 등) |
| cursed | 모든 유닛에게 강화된 디버프 (아군 포함) |

---

## AI 행동

적 AI는 자동으로 유해 장판을 인식합니다:
- 적 소유 장판: 이동 비용 +1 (기피)
- 화염/용암 장판: 이동 비용 +2 (강한 기피)
- 저주받은 장판: 아군 것이라도 기피
- 공격 타일 선택 시에도 장판 위험도를 고려하여 안전한 위치 우선

