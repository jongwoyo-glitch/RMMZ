# 지형 태그 + 지역 ID 시스템 재설계서

> 작성일: 2026-04-21
> 대상: SRPG_TerrainConfig.js (신규), SRPG_Data.js, RMMZStudio.html


## 구현 완료 (2026-04-21)

| 항목 | 상태 |
|------|------|
| terrain tag 비트 버그 수정 (9-11→12+) | ✅ |
| 보트/배/비행선 편집 모드 추가 | ✅ |
| SRPG_TerrainConfig.js 플러그인 | ✅ |
| SRPG_Core 리팩터 (플러그인 연동) | ✅ |
| RMMZStudio 팔레트 UI | ✅ |
| 빌드 및 전체 검증 | ✅ |

---
## 1. 현황 진단

### 1-A. 타일셋 flags 비트 레이아웃 (RMMZ 엔진 기준)

| Bit | Hex | 용도 |
|-----|-----|------|
| 0-3 | 0x000F | 4방향 통행 (D/L/R/U) |
| 4 | 0x0010 | 위에 표시 (☆) |
| 5 | 0x0020 | 사다리 |
| 6 | 0x0040 | 수풀 |
| 7 | 0x0080 | 카운터 |
| 8 | 0x0100 | 피해입는 바닥 |
| 9 | 0x0200 | 보트 통행 |
| 10 | 0x0400 | 배 통행 |
| 11 | 0x0800 | 비행선 착륙 |
| 12-15 | 0xF000 | 지형 태그 (>> 12) |

### 1-B. 현재 문제점

1. **RMMZStudio 비트 위치 오류**: terrain tag를 bits 9-11 (0x0E00, >>9)에 저장 → 엔진은 bits 12+ (>>12)에서 읽음. 보트/배/비행선 비트를 덮어쓰는 버그.
2. **보트/배/비행선 편집 모드 누락**: 네이티브 에디터에는 있으나 스튜디오에 없음.
3. **terrain tag 0-7 제한**: 네이티브 에디터 UI 제한일 뿐, 엔진은 0-15 지원 (4비트).
4. **고저차가 Region ID**: 타일 그래픽에 종속되는 물리적 높이가 맵 오버레이인 Region에 의존.
5. **차단/고저차/원소지형 매핑 하드코딩**: SRPG_Data.js에 상수로 박혀있음.

---

## 2. 새 체계

### 2-A. Terrain Tag (0-15) — 타일의 물리적 성질

플러그인 파라미터로 정의, 타일셋에 종속되는 영구 속성.

| Tag | 기본 이름 | 타입 | 설명 |
|-----|----------|------|------|
| 0 | 일반 | none | 효과 없음 |
| 1 | 낭떠러지 | cliff | 이동불가, 투사체 통과 |
| 2 | 엄폐물 | cover | 이동불가, 직사 차단 |
| 3 | 폐쇄벽 | wall | 이동불가, 직사/곡사 차단 |
| 4 | 저지대 | elevation | level=0 |
| 5 | 중지대 | elevation | level=2 (기본) |
| 6 | 고지대 | elevation | level=4 |
| 7 | 저↔중 계단 | elevation | level=1 (stair) |
| 8 | 중↔고 계단 | elevation | level=3 (stair) |
| 9-15 | (미사용) | none | 확장 여유 |

### 2-B. Region ID (0-255) — 전술 오버레이

맵 디자이너가 자유롭게 칠하는 전술 요소.

| Region | 기본 이름 | 타입 | 원소 |
|--------|----------|------|------|
| 0 | (없음) | none | - |
| 10 | 물길 | surface | water |
| 11 | 독샘 | surface | poison |
| 12 | 용암 | surface | fire |
| 13-19 | (확장용) | surface | - |

전투 시작 시 SrpgField.init()에서 맵 전체 Region을 스캔하여 해당 타일에 영구 장판(duration=Infinity) 자동 생성.

---

## 3. SRPG_TerrainConfig.js 플러그인 구조

```
@plugindesc SRPG 지형 태그 & 지역 ID 설정 테이블
@author Studio

@param TerrainTags
@text 지형 태그 설정 (0-15)
@type struct<TerrainDef>[]
@desc 각 terrain tag 번호에 대한 이름과 효과를 정의합니다.

@param RegionSurfaces
@text 지역 ID → 원소 장판
@type struct<RegionSurfaceDef>[]
@desc 특정 region ID에 자동 생성할 원소 장판을 정의합니다.
```

### struct<TerrainDef>
- tag: number (0-15)
- name: string (한글 이름, 주석용)
- type: "none" | "cliff" | "cover" | "wall" | "elevation"
- blockDirect: boolean
- blockArc: boolean
- elevationLevel: number (0-4, type=elevation일 때)
- isStair: boolean

### struct<RegionSurfaceDef>
- regionId: number (1-255)
- name: string (한글 이름)
- element: string ("water" | "fire" | "poison" | "ice" | "oil" ...)
- permanent: boolean (기본 true, 전투 종료 후 복원)

---

## 4. 변경 범위

### 4-A. RMMZStudio.html
1. terrain tag 비트 수정: 0x0E00/>>9 → 0xF000/>>12
2. 보트/배/비행선 편집 모드 3개 추가
3. terrain tag 편집: 클릭-증분 → 팔레트 선택 방식
4. 팔레트에 플러그인 정의 이름 표시

### 4-B. SRPG_Data.js
1. TERRAIN 상수 → TerrainConfig 플러그인에서 읽기
2. getElevation(): Region → TerrainTag 기반
3. isStair(): Region → TerrainTag 기반
4. doesTileBlock(): 플러그인 설정 참조

### 4-C. SrpgField.init()
1. 맵 로드 시 Region 스캔 → 원소 장판 자동 생성
2. 영구 장판 duration=Infinity + permanent 플래그

---

## 5. 구현 순서

1. terrain tag 비트 버그 수정 (스튜디오)
2. 보트/배/비행선 편집 모드 추가 (스튜디오)
3. SRPG_TerrainConfig.js 플러그인 생성
4. SRPG_Core 리팩터 (플러그인 설정 연동)
5. 팔레트 UI (스튜디오)
6. 빌드 및 전체 검증
