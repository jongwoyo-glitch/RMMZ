# 파티 슬롯 시스템 설계서

## 1. 문제 정의

현행 SRPG 시스템은 맵 이벤트에 `<srpgActorId:N>`으로 **특정 액터를 하드코딩**한다.
실제 게임에서는 파티 구성이 유동적이므로, 맵마다 고정 액터를 배치하면 아군 구성이 불가능.

## 2. 해결: 파티 슬롯 시스템

### 핵심 개념
- 맵 이벤트에 `<srpgPartySlot:N>` (N=1~8) 태그 사용
- "파티의 N번째 멤버가 여기 서는 자리"라는 의미
- 전투 시작 시 `$gameParty.members()[N-1]` → 해당 슬롯 이벤트에 바인딩

### 노트태그 형식
```
<srpgUnit:actor>
<srpgPartySlot:1>
```
- srpgActorId 대신 srpgPartySlot 사용
- srpgTeam은 기본 1 (아군), 필요시 명시 가능
- srpgActorId와 srpgPartySlot 공존 불가 — 슬롯이 우선

## 3. 런타임 흐름

### 3-A. 일반 전투 (배치 페이즈 있음)
1. `_collectUnits()`: 이벤트 스캔 → srpgPartySlot 감지
2. `_resolvePartySlots()` (신규): 슬롯 N → `$gameParty.members()[N-1]`로 actorId 결정
   - 파티원 수 < 슬롯 수: 남는 슬롯 이벤트 비활성화 (투명 + 충돌 해제)
   - 파티원 수 > 슬롯 수: 초과 파티원은 배치 불가
3. SrpgUnit에 actorId/data 바인딩 → 캐릭터 그래픽 업데이트
4. 배치 페이즈 진입 (기존 로직 그대로)

### 3-B. 기습 전투 (배치 페이즈 생략)
1. `_collectUnits()` + `_resolvePartySlots()` 동일
2. 단, 슬롯 배정을 **무작위 셔플** — Fisher-Yates
3. `_applyAmbush()` 기존 로직 (AP 페널티 등) 그대로 적용
4. 배치 페이즈 스킵 → 바로 전투

### 3-C. 적군은 변경 없음
- 적군은 기존대로 `<srpgEnemyId:N>`으로 특정 적 하드코딩
- 맵마다 적 구성이 다른 것이 정상

## 4. 코드 변경 범위

### SRPG_Data.js (src/)
- SrpgUnit 생성자: `srpgPartySlot` 메타 파싱 추가
- `this.partySlot = Number(meta.srpgPartySlot || 0);`
- actorId는 0으로 초기화 (나중에 resolve)

### SRPG_SM.js (src/)
- `_collectUnits()` 직후 `_resolvePartySlots()` 호출
- `_resolvePartySlots()` 신규 메서드:
  ```
  const slotUnits = this._units.filter(u => u.partySlot > 0).sort((a,b) => a.partySlot - b.partySlot);
  const members = $gameParty.members();
  // 기습 시 셔플
  if (ambush) shuffle(members);
  for (const su of slotUnits) {
      const idx = su.partySlot - 1;
      if (idx < members.length) {
          su.actorId = members[idx].actorId();
          su._data = $dataActors[su.actorId];
          su._bindActorData();  // 스탯, 그래픽 갱신
      } else {
          // 파티원 부족 → 비활성화
          su._dead = true;
          su.event.setTransparent(true);
          su.event.setThrough(true);
      }
  }
  ```
- 기습 판정: `this._battleModeParams.ambush` 존재 + 아군이 기습당하는 쪽

### RMMZStudio.js
- 유닛 배치 팔레트: 타입 탭에 "파티 슬롯" 추가 (Actor/Enemy 외 3번째)
- 파티 슬롯 선택 시: 드롭다운 대신 슬롯 번호(1~8) 선택 UI
- 이벤트 생성: `<srpgUnit:actor>\n<srpgPartySlot:N>` 노트태그
- 이벤트 그래픽: 번호 표시용 기본 캐릭터 (또는 "P1"~"P8" 텍스트)

## 5. 기존 시스템 연동 확인

| 시스템 | 영향 | 대응 |
|--------|------|------|
| 배치 페이즈 | 영향 없음 | allyUnits()로 필터, 슬롯 resolve 후이므로 정상 |
| 기습 시스템 | 셔플만 추가 | _applyAmbush()는 유닛 목록 기반, 변경 불필요 |
| 팀 시스템 | 영향 없음 | teamId는 노트태그에서 읽음, 기본 1 |
| 전투 AI | 영향 없음 | actorId 기반이 아닌 SrpgUnit 기반 |
| 승리/패배 | 영향 없음 | 유닛 생사 체크 기반 |
| KO 시스템 | 확인 필요 | koActorIds에 resolved actorId 추가 |
| 세이브/로드 | 전투 중 저장 없음 | 해당 없음 |

## 6. 구현 순서

1. SRPG_Data.js: partySlot 메타 파싱 + _bindActorData 메서드
2. SRPG_SM.js: _resolvePartySlots() + _collectUnits 직후 호출
3. SRPG_SM.js: 기습 시 셔플 분기
4. RMMZStudio.js: 파티 슬롯 배치 UI
5. 빌드 + 검증
