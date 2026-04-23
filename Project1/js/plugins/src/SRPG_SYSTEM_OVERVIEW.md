# SRPG 전투 시스템 전체 정리

> 최종 갱신: 2026-04-21 | 코드 기반 감사 결과

---

## 1. 핵심 상수

| 상수 | 기본값 | 설명 |
|------|--------|------|
| DEFAULT_MOV | 4 | 기본 이동력 |
| DEFAULT_ATK_RANGE | 1 | 기본 사거리 |
| TILE | 48 | 타일 크기(px) |
| AP_THRESHOLD | 1000 | AP 턴 획득 임계치 |
| MOVE_SPEED | 5 | 이동 애니메이션 속도(1~6) |
| TURN_PREDICT_COUNT | 12 | 턴 오더바 예측 슬롯 수 |

---

## 2. 지형/사격 모드

### 지형 태그 (Terrain Tag)
| Tag | 이름 | 이동 | 직사 | 곡사 |
|-----|------|------|------|------|
| 0 | 일반 | ○ | 통과 | 통과 |
| 1 | 낭떠러지 | × | 통과 | 통과 |
| 2 | 엄폐물 | × | **차단** | 통과 |
| 3 | 폐쇄벽 | × | **차단** | **차단** |

### 사격 모드 (FIRE_MODE)
- **melee** — 사거리 1, 경로 무시
- **direct** — 사거리 2+, Cover/Wall 차단, 오브젝트 차단 시 데미지 리다이렉트
- **arc** — Wall만 차단, Cover/오브젝트 무시하고 넘어감

---

## 3. 유닛 시스템 (SrpgUnit)

### 기본 스탯
- MHP/HP, MMP/MP, ATK, DEF, MAT, MDF, AGI, LUK
- 아군: 클래스 파라미터 테이블(레벨별), 적군: $dataEnemies 파라미터

### 행동 경제 (BG3 스타일)
- `mainAction`: 매 턴 1 — 공격/스킬 사용
- `bonusAction`: 매 턴 1 — 보조 행동
- `mov` / `turnMoveMax` / `turnMoveUsed`: 이동 예산 (이동 후 남은 거리로 다시 이동 가능)

### 파괴 가능 사물 (isObject)
- 노트: `<srpgObject:true>`, `<srpgObjectHp:N>`, `<srpgObjectDef:N>`
- 이동/행동/반격 불가, 팀 색상으로 아군/적군/중립 설정 가능
- `<srpgDestroyPage:N>`: 파괴 시 이벤트 페이지 전환 (셀프스위치 A)

---

## 4. 전투 판정 (SrpgCombat)

### 데미지 공식
```
base = max(ATK - floor(DEF / 2), 1)
variance = floor(base × 0.1)        // ±10% 분산
실제 데미지 = base + random(-variance ~ +variance)
크리티컬 시 × 1.5
```

### 크리티컬 확률
```
critRate = LUK / 100
```

### 반격 조건
- 방어자의 사거리 내에 공격자가 있을 때
- isObject는 반격 불가
- 반격도 경로 차단 검사 수행

### 경로 차단 (checkAttackPath)
1. `resolveFireMode(attacker, skillId)` — 스킬의 투사체 타입 우선 참조
2. Bresenham 직선 경로 순차 검사
3. 직사 + 경로 위 오브젝트 → 데미지 리다이렉트 ("엄폐!" 팝업)
4. 완전 차단 → "차단!" 팝업

---

## 5. AP 턴 시스템 (SrpgTurnOrder)

### 작동 방식
```
매 틱: 전 유닛 ap += agi
AP ≥ 1000 → 턴 획득 (ap -= 1000)
동률: actor 팀 우선 → 맵 등록 순서
```

### 팀 페이즈 묶기
- 첫 턴 유닛과 같은 팀을 연속 추출 → 하나의 페이즈
- 다른 팀 출현 시 AP 스냅샷 복원 후 중단
- 한 페이즈 내 아군 유닛끼리 자유 순서로 행동

---

## 6. 스킬 범위 (SrpgSkillMeta)

### 사거리 (Reach)
- `<srpgReach:dx,dy|dx,dy|...>` — 커스텀 상대좌표 목록
- `<srpgRange:N>` — 반지름 N 맨해튼 다이아몬드 (레거시)
- 미지정 시: 무기 타입 기본값 → 유닛 atkRange 기반 다이아몬드

### 효과 범위 (Area)
- `<srpgArea:dx,dy|...>` — 명중 타일 기준 AoE 오프셋
- `<srpgRotate>` — 공격 방향에 따라 Area 회전
- `<srpgSelfTarget>` — Area를 자신 위치 기준으로 적용

### 애니메이션 크기 자동 조정
- 단일 타일: 1.5배 스케일
- 범위 스킬: 최대 치수 + 0.5 (예: 3×3 → 3.5배)

---

## 7. 투사체 시스템 (SrpgProjectile)

### 공통 태그
| 태그 | 기본값 | 설명 |
|------|--------|------|
| srpgProjImage | (필수) | img/srpg/ 이미지 |
| srpgProjFrameW/H | 32 | 프레임 크기 |
| srpgProjFrameCount | 1 | 프레임 수 |
| srpgProjSpeed | 6 | 비행 속도 (px/f) |
| srpgProjScale | 1.0 | 스프라이트 배율 |
| srpgImpactAnimId | 0 | 착탄 RMMZ 애니메이션 |

### 3종 타입

**projectile (스프라이트 비행)**
- 직선 비행, 도착 시 onImpact 콜백

**hitray (즉시 빔)**
- 3파트 이미지 (Start/Mid/End) 타일링
- `beamDuration`(30f), `hitCount`(1), `hitInterval`(10f) — 다중 히트

**artillery (포물선 포격)**
- `arcHeight`: 0이면 45도 동적 계산 (수평거리 × 0.5)
- 수식: `arcY = -4h × t × (1-t)`, 최대 높이 t=0.5
- `warningDuration`(40f): 착탄 지점 위험 표시
- `cameraPan`(true): 카메라 착탄지 팬
- `scatterRadius`(0): 랜덤 산개 반경

### 예상 경로 프리뷰
- 통과 가능: **초록색** (0x44ff66)
- 차단됨: **빨간색** (0xff4444) + X마크
- 곡사: 포물선 곡선, 직사: 타일 하이라이트 + 화살촉

---

## 8. 소환 시스템 (SrpgSummon)

### 내장 타입
| 타입 | 이름 | HP | DEF | 색상 |
|------|------|-----|-----|------|
| barricade | 바리케이드 | 60 | 5 | 0x886644 |
| wall | 마법 벽 | 100 | 10 | 0x4488cc |
| totem | 토템 | 40 | 0 | 0x44cc88 |

### 노트 태그
- `<srpgSummon:타입>`, `<srpgSummonHp/Def/Name/Anim/Team/Char>`
- 소환물은 PIXI Graphics 직접 생성 (색상 사각형 + HP바 + 이름)
- 파괴 시 페이드아웃 애니메이션

---

## 9. FX 시스템 (SrpgFX)

| 이펙트 | 대상 | 시각 효과 |
|--------|------|-----------|
| critCharge | 공격자 | 흰색 플래시 (progress × 0.7, 20프레임) |
| hitReaction | 피격자 | 넉백(6px) + 붉은 틴트 → 복귀, 크리티컬 시 1.5배 + 화면 플래시 |

- 오브젝트(소환물)도 동일한 피격 효과 적용 (_applyHitFX)

---

## 10. 상태머신 흐름 (SM)

### 최상위 페이즈
```
idle → banner(전투시작) → turnAdvance → playerTurn / enemyTurn → combat → banner(승리/패배) → battleEnd
```

### 플레이어 턴 서브페이즈
```
browse → awaitCommand → moving → radialMenu → subRadial → slotReel → selectTarget → combatPreview → combat(projectile → animating)
```

### 보조 행동 (bonusAction)
| 행동 | 상태 | 비고 |
|------|------|------|
| 밀치기 | 스켈레톤 | 팝업만 |
| 아이템 던지기 | 스켈레톤 | 팝업만 |
| 아이템 사용 | 스켈레톤 | 팝업만 |
| 이탈 | 스켈레톤 | _disengaged 플래그만 |
| 도발 | 스켈레톤 | 팝업만 |
| 은신 | 스켈레톤 | _hidden 플래그만 |
| 전력질주 | **구현됨** | turnMoveMax += remainingMov() |
| 방향전환 | **구현됨** | free:true (보조행동 무소모) |

### 적 AI
1. thinking (30f 지연) → 이동범위+공격가능 조합 탐색 → 경로차단 고려
2. 공격 가능하면 이동+공격, 불가하면 최근접 아군 방향 이동
3. 스킬 사용 미구현 (기본 공격만)

---

## 11. UI 시스템

- **해상도 대응**: RS() = min(폭/816, 높이/624), 모든 UI 고정값에 적용
- **턴 오더 바**: 화면 상단, 원형 슬롯(아군=위, 적=아래), 초상화, 페이즈 구분선
- **유닛 정보 패널**: 좌하단, HP/MP바 + 행동상태
- **라디얼 파이 메뉴**: Sims 4 스타일, 팝인 애니메이션
- **슬롯 릴**: 스킬 목록 세로 스크롤, 마우스 휠/방향키
- **데미지 팝업**: 크리티컬=노란색!, 외침=유닛 머리 위
- **초상화**: RMMZ Face/SV Actor/Enemy Battler → 원형 마스크/전신 표시

---

## 12. 구현 현황 요약

| 시스템 | 상태 | 미구현/스켈레톤 |
|--------|------|----------------|
| AP 턴 오더 + 팀 페이즈 | ✅ 완전 | — |
| 이동 BFS + 경로탐색 | ✅ 완전 | — |
| 공격범위 Grid Range | ✅ 완전 | — |
| 전투 판정/반격/리다이렉트 | ✅ 완전 | — |
| 투사체 3종 + 예상경로 | ✅ 완전 | — |
| 소환 시스템 | ✅ 완전 | — |
| FX 시스템 | ✅ 완전 | — |
| 해상도 대응 | ✅ 완전 | — |
| 애니메이션 스케일링 | ✅ 완전 | — |
| 보조 행동 (3종+) | ✅ 구현 | 밀치기, 방향전환(무소비), 핫키 아이템 사용 |
| 주 행동 (공통) | ✅ 구현 | 던지기(오브젝트투척), 숨기(은신), 스프린트(1.5배이동) |
| 은신/시야 시스템 | ✅ 구현 | SrpgVision — 감지/은신력, 적시야 오버레이 |
| 투척 시스템 | ✅ 구현 | SrpgThrow — 오브젝트 투척, 충돌피해, 붕괴장판 |
| 적 AI 스킬 | ⚠️ 미구현 | 기본 공격만 사용 |
| 상태이상/버프 | ❌ 미구현 | — |
| 경험치/레벨업 | ❌ 미구현 | — |
| 아이템 인벤토리 | ✅ 구현 | GridInventory.js — 그리드 기반, 핫키 슬롯 |
| 지형 효과 (높낮이 등) | ❌ 미구현 | 차단만 존재 |
| 시야 | ✅ 은신 연계 구현 | SrpgVision, 전장안개(FoW) 의도적 제외 |
| 커스텀 메인메뉴 | ✅ 구현 | MenuOverhaul.js — 인물/관계/소지품/전술/일지/시스템 |
| 관계 시스템 | ✅ 구현 | 호감도/신뢰도 + 원국 궁합 (GahoSystem 확장) |
| 퀘스트/일지 | ✅ 구현 | Game_Party 퀘스트/이벤트 로그 |
| 궁합 판정 | ✅ 구현 | GahoSystem.getCompatibility — 천간합/지지충/육합 |
| 전투 성향 분석 | ✅ 구현 | GahoSystem.getCombatTendency — 오행→역할 매핑 |
| 인접 궁합 보너스 | ✅ 구현 | 인접 아군 궁합 시너지 → 데미지 ±1~10 보정 |
| SRPG 배치 페이즈 | ✅ 구현 | region ID 1 기반 배치 타일, 파란/노란 오버레이 |
| 핫키 전투 사용 | ✅ 구현 | 보조행동으로 핫키 소비 아이템 사용 (GridInventory 연동) |
| 스킬 습득 (삼국지10PK식) | ⚠️ 데이터만 | 인물간 가르침/배움 이벤트 미구현 |
