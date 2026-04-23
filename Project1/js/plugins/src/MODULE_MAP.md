# SRPG 모듈 매핑

## 빌드
```
python src/build.py
```
3개 소스를 합쳐 `SRPG_Core.js` 생성. 수정 후 반드시 빌드 실행.

## 소스 → 모듈 매핑

| 수정 대상 | 소스 파일 | 비고 |
|---|---|---|
| 플러그인 헤더 (@plugindesc 등) | `SRPG_Data.js` | 파일 최상단 |
| 상수 (C, TERRAIN, FIRE_MODE) | `SRPG_Data.js` | IIFE 시작 직후 |
| 그리드 유틸 (makeDiamond 등) | `SRPG_Data.js` | |
| SrpgSkillMeta | `SRPG_Data.js` | 스킬 범위 메타데이터 |
| SrpgUnit 클래스 | `SRPG_Data.js` | 유닛 데이터 모델 |
| SrpgEventProxy | `SRPG_Data.js` | 소환용 경량 이벤트 |
| SrpgSummon | `SRPG_Data.js` | 소환 시스템 |
| SrpgGrid | `SRPG_Data.js` | 경로탐색, 사거리, 차단판정 |
| SrpgTurnOrder | `SRPG_Data.js` | AP 턴 큐 |
| SrpgCombat | `SRPG_Data.js` | 전투 판정, resolveFireMode |
| SrpgFX | `SRPG_Data.js` | 이펙트 상태 관리 |
| SrpgProjectile | `SRPG_Data.js` | 투사체 3종 연출 |
| SM (SrpgManager) | `SRPG_SM.js` | 메인 상태머신 전부 |
| _TS (텍스트 스타일) | `SRPG_UI.js` | 파일 최상단 |
| SrpgUI (오버레이) | `SRPG_UI.js` | 턴바, HUD, 메뉴, 팝업, 프리뷰 |
| Sprite_Character 확장 | `SRPG_UI.js` | 초상화, 투명도 |
| Scene_Map/Spriteset 연결 | `SRPG_UI.js` | RMMZ 브릿지 |
| Game_Player/Event 잠금 | `SRPG_UI.js` | 전투 중 이동 차단 |
| Plugin Commands | `SRPG_UI.js` | StartBattle, EndBattle, IIFE 닫기 |

## 의존성 순서 (빌드 순서)
```
SRPG_Data.js  →  SRPG_SM.js  →  SRPG_UI.js
(상수/로직)      (상태머신)      (화면/브릿지)
```

## 편집 규칙
1. **소스 파일만 수정** — `SRPG_Core.js`를 직접 수정하지 않음
2. **Edit 도구 사용 금지** — python 패치 스크립트(bash 내 inline python)로만 수정
   - Edit 도구는 대형 파일 끝부분을 잘라먹는 버그가 있음
   - 패치 예시: `python3 /tmp/patch_xxx.py` (old/new 문자열 교체 방식)
3. 수정 후 `python src/build.py` 실행 — concat + 구문 검증 + 소스 백업 자동 수행
4. 잘림 발생 시 `backup/src_latest/`에서 즉시 복원 가능
