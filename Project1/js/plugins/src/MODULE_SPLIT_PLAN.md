# SRPG_Core.js 모듈 분리 계획서

## 목적
Edit 도구의 대형 파일 처리 한계(6000줄+ 파일 끝 잘림)를 해결하기 위해
SRPG_Core.js를 소스 파일 3개로 분리하고, 빌드 스크립트로 합쳐 최종 플러그인을 생성한다.

## 분리 원칙
- **최소 분리**: 3개 파일 (찾아 헤맬 일 없도록)
- **각 파일 2500줄 이하**: Edit 도구 안전 범위
- **의존성 한 방향**: Data → SM → UI 순서로 concat하면 선언 순서 보장
- **RMMZ 호환**: 최종 산출물은 기존과 동일한 단일 SRPG_Core.js

---

## 파일 구성

### 1. `src/SRPG_Data.js` (~2300줄)
**역할**: 상수, 데이터 모델, 로직 계층 — "두뇌"

포함 모듈:
| 모듈 | 현재 줄 범위 | 줄 수 | 설명 |
|---|---|---|---|
| Plugin Header 주석 | 1-160 | 160 | @plugindesc, @param 등 |
| 상수/유틸/SkillMeta | 163-436 | 274 | 설정값, 그리드유틸, 색상, 지형, FIRE_MODE |
| SrpgUnit + EventProxy | 441-810 | 370 | 유닛 클래스, 소환 프록시 |
| SrpgSummon | 812-1080 | 269 | 소환 시스템 |
| SrpgGrid | 1085-1308 | 224 | 경로탐색, 사거리, 차단판정 |
| SrpgTurnOrder | 1312-1383 | 72 | AP 턴 큐 |
| SrpgCombat | 1388-1623 | 236 | 전투 판정, resolveFireMode |
| SrpgFX | 1626-1757 | 132 | 이펙트 상태 관리 |
| SrpgProjectile | 1764-2444 | 681 | 투사체 3종 연출 |
| **합계** | | **~2418** | |

의존성: 없음 (최하위 계층). 모든 상수와 유틸이 여기에 정의됨.
다른 파일에서 참조: SM, SrpgUI, Sprite_Character 확장

### 2. `src/SRPG_SM.js` (~2400줄)
**역할**: 메인 상태머신 — "심장"

포함 모듈:
| 모듈 | 현재 줄 범위 | 줄 수 | 설명 |
|---|---|---|---|
| SM (SrpgManager) | 2447-4823 | 2377 | 전투 생명주기, 유닛 관리, 페이즈, AI, 입력 |
| **합계** | | **~2377** | |

의존성: SRPG_Data.js의 모든 모듈 (SrpgGrid, SrpgCombat, SrpgUnit 등)
다른 파일에서 참조: SrpgUI, Sprite_Character, Scene_Map

### 3. `src/SRPG_UI.js` (~1830줄)
**역할**: 화면 표시 + RMMZ 엔진 연결 — "얼굴"

포함 모듈:
| 모듈 | 현재 줄 범위 | 줄 수 | 설명 |
|---|---|---|---|
| _TS (텍스트 스타일) | 4829-4840 | 12 | PIXI 텍스트 스타일 정의 |
| SrpgUI (오버레이) | 4842-6141 | 1300 | 턴오더바, HUD, 원형메뉴, 팝업, 프리뷰 |
| Sprite_Character 확장 | 6146-6547 | 402 | 초상화, 투명도 |
| Scene_Map 확장 | 6554-6601 | 48 | update/init 연결 |
| Game_Player/Event 확장 | 6607-6641 | 35 | 전투 중 이동 잠금 |
| Plugin Commands | 6646-6654 | 9 | StartBattle, EndBattle |
| **합계** | | **~1806** | |

의존성: SRPG_Data.js + SRPG_SM.js
다른 파일에서 참조: 없음 (최상위 계층)

---

## 의존성 흐름도

```
SRPG_Data.js          SRPG_SM.js           SRPG_UI.js
(상수/유틸/로직)  ──→  (상태머신)      ──→  (화면/RMMZ 브릿지)
                       │                     │
                       │  SM ←── SrpgUI      │  (런타임 상호참조)
                       │  (상태조회만,        │   concat 순서로 해결)
                       │   선언시점X)         │
```

SM이 SrpgUI를 참조하는 곳:
- `SM._uiDirty = true` (플래그 설정만, UI 객체 직접 호출 아님)
- Scene_Map.update에서 `SrpgUI.update()` 호출 (SRPG_UI.js 내부)

→ SM 코드 자체는 SrpgUI 객체를 직접 호출하지 않으므로, 
   Data → SM → UI 순서로 concat하면 문제없음.

---

## 빌드 스크립트 (`src/build.py`)

```python
#!/usr/bin/env python3
"""SRPG_Core.js 빌드 스크립트 — 소스 3개를 합쳐 단일 플러그인 생성"""
import os

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_DIR = os.path.dirname(SRC_DIR)
OUTPUT = os.path.join(PLUGIN_DIR, "SRPG_Core.js")

# concat 순서 = 의존성 순서
SOURCES = ["SRPG_Data.js", "SRPG_SM.js", "SRPG_UI.js"]

parts = []
for name in SOURCES:
    path = os.path.join(SRC_DIR, name)
    with open(path, "r", encoding="utf-8") as f:
        parts.append(f"// ═══════ {name} ═══════\n")
        parts.append(f.read())
        parts.append("\n\n")

with open(OUTPUT, "w", encoding="utf-8") as f:
    f.write("".join(parts))

print(f"✓ Built {OUTPUT} ({sum(len(p) for p in parts)} chars)")
```

빌드 실행: `python src/build.py`
결과: `js/plugins/SRPG_Core.js` (기존과 동일 위치, RMMZ가 로드)

---

## IIFE 처리 방식

현재 전체 파일이 하나의 IIFE로 감싸져 있음:
```javascript
(() => {
    // ... 6600줄 ...
})();
```

분리 후:
- `SRPG_Data.js`: IIFE 시작 `(() => {` + 상수~Projectile
- `SRPG_SM.js`: SM 객체 (IIFE 내부, 감싸기 없음)
- `SRPG_UI.js`: UI~PluginCommand + IIFE 닫기 `})();`

→ concat하면 기존과 동일한 IIFE 구조 유지

---

## 작업 순서 (실행 시)

1. `src/` 폴더 생성
2. 현재 SRPG_Core.js를 백업 (`backup/SRPG_Core_20260418c.js`)
3. 현재 파일에서 3개 소스 파일로 분리 (줄 범위 기준 복사)
4. `build.py` 작성
5. 빌드 실행 → 결과물 `node -c` 구문 검증
6. 원본과 diff로 내용 동일성 확인
7. `MODULE_MAP.md` 작성 (각 모듈 → 파일 + 줄 번호 매핑)

---

## MODULE_MAP.md (빌드 후 유지)

편집 시 어떤 파일을 열어야 하는지 즉시 파악 가능:

```
# SRPG 모듈 매핑
| 수정 대상 | 소스 파일 | 비고 |
|---|---|---|
| 상수 (C, TERRAIN, FIRE_MODE) | SRPG_Data.js | 최상단 |
| SrpgSkillMeta | SRPG_Data.js | 스킬 범위 메타 |
| SrpgUnit | SRPG_Data.js | 유닛 클래스 |
| SrpgSummon | SRPG_Data.js | 소환 시스템 |
| SrpgGrid | SRPG_Data.js | 경로/사거리 |
| SrpgTurnOrder | SRPG_Data.js | AP 턴 큐 |
| SrpgCombat | SRPG_Data.js | 전투 판정 |
| SrpgFX | SRPG_Data.js | 이펙트 상태 |
| SrpgProjectile | SRPG_Data.js | 투사체 연출 |
| SM (상태머신) | SRPG_SM.js | 메인 로직 전부 |
| SrpgUI (오버레이) | SRPG_UI.js | 턴바, HUD, 메뉴, 팝업 |
| Sprite_Character | SRPG_UI.js | 초상화, 투명도 |
| Scene_Map 연결 | SRPG_UI.js | RMMZ 브릿지 |
| Plugin Commands | SRPG_UI.js | StartBattle/EndBattle |
```
