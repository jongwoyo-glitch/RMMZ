# SRPG 멀티샷 + 직사 차단 시각 연출 설계서

## 1. 직사 투사체 차단 지점 시각 연출

### 현재 동작
- `checkProjectilePath`가 경로 차단 정보(좌표, 타입, coverObject) 반환
- `SrpgCombat.execute`에서 blocked/redirect 결과 처리
- **투사체 스프라이트는 원래 타겟까지 비행** → 차단 시에도 타겟 좌표로 날아감 (시각 불일치)

### 개선 목표
- 직사(projectile/hitray)가 차단되면 **차단 지점에서 투사체 정지 + 착탄 이펙트**
- 곡사(artillery)는 기존대로 포물선 비행 (경로 차단 무시)

### 구현

#### 1-1. SM에서 차단 좌표를 투사체에 전달

```
_executeCombat / _executeGroundAttack:
  if (projMeta && pathCheck.blockInfo) {
    // 차단 좌표를 투사체 목적지로 덮어쓰기
    hitTarget = { x: blockInfo.x, y: blockInfo.y, ... }
  }
```

- `fireProjectile` / `fireHitray`: 목적지를 차단 타일 좌표로 변경
- `fireArtillery`: 변경 없음 (곡사는 경로 차단 불가)

#### 1-2. 착탄 이펙트

- 차단 시에도 `_onImpact` → `_playImpactEffects` 정상 호출
- 차단 지점 착탄 SE + 시각 이펙트로 "막혔다" 피드백

---

## 2. 스톡샷 (타겟 지정형 멀티샷)

### 컨셉
- 플레이어가 **N개의 타겟을 순서대로 클릭**하여 지정
- 같은 타겟 중복 지정 가능 (집중 사격)
- 각 타겟에 **개별 투사체** 발사, 시간차 연출
- 각 투사체마다 독립적으로 경로 차단 판정

### 노트태그

```
<srpgMultiShot:N>          발수 (필수, N≥2)
<srpgShotDelay:F>          발사 간격 (프레임, 기본 12)
<srpgShotDamageMod:R>      발당 데미지 배율 (기본 1.0 = 풀데미지)
```

### SM 타겟 선택 플로우

```
selectTarget 상태 진입 시:
  if (pendingSkill has <srpgMultiShot:N>):
    _multiShotMode = true
    _multiShotMax = N
    _multiShotTargets = []   // [{x, y, unit}]
    _multiShotCount = 0
    UI에 "타겟 선택 (0/N)" 표시

클릭 (confirmTargetTile):
  if (_multiShotMode):
    target = unitAt(tx, ty) || {x: tx, y: ty}  // 빈 타일도 가능
    _multiShotTargets.push({x: tx, y: ty, unit: target})
    _multiShotCount++
    
    if (_multiShotCount >= _multiShotMax):
      _executeMultiShot()  // 모든 타겟 확정
    else:
      UI 갱신 "타겟 선택 (count/N)"
      // 계속 선택 대기

ESC/우클릭:
  if (_multiShotCount > 0):
    _multiShotTargets.pop()  // 마지막 선택 취소
    _multiShotCount--
  else:
    _multiShotMode = false   // 스킬 선택으로 복귀
```

### 전투 실행 (_executeMultiShot)

```
phase = "combat"
subPhase = "multishot"
_multiShotQueue = [..._multiShotTargets]
_multiShotIdx = 0
_multiShotDelay = 0

update 루프:
  if (subPhase === "multishot"):
    if (_multiShotDelay > 0):
      _multiShotDelay--
      return

    if (_multiShotIdx < _multiShotQueue.length):
      shot = _multiShotQueue[_multiShotIdx]
      
      // 1) 경로 차단 검사
      pathCheck = checkAttackPath(attacker, shot, skillId)
      
      // 2) 데미지 계산 (damageMod 적용)
      result = execute(attacker, shot.unit, true, skillId)
      result.damage = Math.floor(result.damage * damageMod)
      
      // 3) 투사체 발사 (차단 시 차단 좌표로)
      actualTarget = pathCheck.blocked 
        ? {x: pathCheck.blockInfo.x, y: pathCheck.blockInfo.y}
        : shot
      fireProjectile(attacker, actualTarget, projMeta, onImpact)
      
      _multiShotIdx++
      _multiShotDelay = shotDelay
    
    else if (!SrpgProjectile.isBusy()):
      // 모든 투사체 완료
      subPhase = "animating"
      _combatAnimTimer = 40
```

### 데미지 분배 예시
- 3발 스톡샷, damageMod 0.5 → 각 발당 50% 데미지 (총 150%)
- 3발 스톡샷, damageMod 1.0 → 각 발당 100% 데미지 (총 300%)
- 기본값 1.0이므로 별도 설정 없으면 풀데미지 × N발

---

## 3. 고정 범위 멀티샷 (패턴 바라지)

### 컨셉
- 플레이어가 **기준점 1곳만 지정**
- 기준점을 중심으로 **미리 정의된 패턴**에 여러 투사체 자동 발사
- 패턴: 부채꼴, 십자, 일직선, 원형 등
- 각 투사체는 독립적 경로 차단 판정

### 노트태그

```
<srpgBarrage:패턴명>       패턴 이름 (필수)
<srpgBarrageCount:N>       투사체 수 (기본: 패턴 기본값)
<srpgBarrageDelay:F>       발사 간격 (프레임, 기본 8)
<srpgBarrageDamageMod:R>   발당 데미지 배율 (기본 0.6)
<srpgBarrageSpread:N>      산개 폭 (타일, 패턴별 해석 다름)
```

### 패턴 정의

```javascript
const BARRAGE_PATTERNS = {
  // 부채꼴: 공격자→기준점 방향 중심으로 좌우 산개
  fan: {
    defaultCount: 3,
    generate(fromX, fromY, toX, toY, count, spread) {
      // 중심 각도 ± spread 범위에서 count개 균등 분배
      const baseAngle = Math.atan2(toY - fromY, toX - fromX);
      const dist = SrpgGrid.dist(fromX, fromY, toX, toY);
      const spreadRad = spread * (Math.PI / 6); // spread=1 → ±30°
      const targets = [];
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1~+1
        const angle = baseAngle + t * spreadRad;
        targets.push({
          x: Math.round(fromX + Math.cos(angle) * dist),
          y: Math.round(fromY + Math.sin(angle) * dist)
        });
      }
      return targets;
    }
  },

  // 일직선 관통: 공격자→기준점 방향으로 사거리 끝까지 관통
  line: {
    defaultCount: 1,  // 1발이 관통하며 경로상 모든 적에 히트
    generate(fromX, fromY, toX, toY, count, spread) {
      // 기준점 방향으로 최대 사거리까지의 타일 목록
      return [{ x: toX, y: toY, penetrate: true }];
    }
  },

  // 십자: 기준점을 중심으로 4방향
  cross: {
    defaultCount: 4,
    generate(fromX, fromY, toX, toY, count, spread) {
      const s = spread || 1;
      return [
        { x: toX, y: toY - s },
        { x: toX + s, y: toY },
        { x: toX, y: toY + s },
        { x: toX - s, y: toY },
      ];
    }
  },

  // 원형 산탄: 기준점 주변 랜덤
  scatter: {
    defaultCount: 5,
    generate(fromX, fromY, toX, toY, count, spread) {
      const s = spread || 1;
      const targets = [{ x: toX, y: toY }]; // 중심 1발
      for (let i = 1; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * s;
        targets.push({
          x: Math.round(toX + Math.cos(angle) * r),
          y: Math.round(toY + Math.sin(angle) * r)
        });
      }
      return targets;
    }
  },
};
```

### 실행 플로우

```
confirmTargetTile → _executeBarrage(tx, ty):
  1. 패턴에서 타겟 좌표 목록 생성
  2. 각 좌표에 대해:
     a. 경로 차단 검사 → 차단 시 차단 좌표로 변경
     b. 해당 좌표의 유닛에 데미지 계산 (× damageMod)
     c. 투사체 발사 (시간차)
  3. 모든 투사체 완료 후 전투 종료
```

### 관통(penetrate) 특수 처리

`line` 패턴의 관통 투사체:
- 투사체가 경로를 따라 비행하면서 **경로상의 모든 적에 히트**
- 벽/엄폐물에 도달하면 거기서 정지
- `_updateProjectile`에 관통 모드 추가:
  - 이동 중 유닛과 겹치면 `onHit` 호출 (데미지) → **파괴하지 않고 계속 비행**
  - 벽/엄폐물 도달 시 정지 → `_onImpact`

---

## 4. 고저차 + 멀티샷 상호작용

- 스톡샷: 각 발마다 `canTargetWithElevation` 개별 판정
  - 직사형이면 타겟이 자신보다 높으면 해당 발 무효 (MISS 팝업)
  - `<srpgIgnoreElevation>` 있으면 무시
- 바라지: 각 타겟 좌표마다 고저차 필터
  - `FIRE_MODE.ARC`(곡사)면 고저차 무시
  - `FIRE_MODE.DIRECT`(직사)면 같거나 낮은 지형만

---

## 5. 노트태그 종합

### 기존 투사체 노트태그 (변경 없음)
```
<srpgProjectile:projectile|hitray|artillery>
<srpgProjImage:파일명>  <srpgProjSpeed:N>  etc.
```

### 신규 — 스톡샷
```
<srpgMultiShot:N>              발수 (2 이상)
<srpgShotDelay:F>              발사 간격 프레임 (기본 12)
<srpgShotDamageMod:R>          발당 데미지 배율 (기본 1.0)
```

### 신규 — 바라지
```
<srpgBarrage:fan|line|cross|scatter>   패턴명
<srpgBarrageCount:N>                   투사체 수 (기본: 패턴 기본값)
<srpgBarrageDelay:F>                   발사 간격 프레임 (기본 8)
<srpgBarrageDamageMod:R>               발당 데미지 배율 (기본 0.6)
<srpgBarrageSpread:N>                  산개 폭 타일 (기본 1)
```

### 조합 규칙
- `<srpgMultiShot>` + `<srpgProjectile>` = 스톡샷 (타겟 지정 멀티샷)
- `<srpgBarrage>` + `<srpgProjectile>` = 패턴 바라지
- `<srpgMultiShot>` + `<srpgBarrage>` = **불가** (둘 중 하나만)
- `<srpgProjectile>` 없이 멀티샷/바라지 = 투사체 없이 즉시 다중 판정

### 예시 스킬 노트

**궁수 3연사 (스톡샷):**
```
<srpgProjectile:projectile>
<srpgProjImage:arrow>
<srpgProjSpeed:10>
<srpgProjRotate:true>
<srpgMultiShot:3>
<srpgShotDelay:10>
<srpgShotDamageMod:0.5>
```

**화염 부채꼴 (바라지):**
```
<srpgProjectile:projectile>
<srpgProjImage:fireball>
<srpgProjSpeed:8>
<srpgBarrage:fan>
<srpgBarrageCount:5>
<srpgBarrageSpread:2>
<srpgBarrageDamageMod:0.4>
```

**관통 레이저 (바라지 line):**
```
<srpgProjectile:hitray>
<srpgBeamStart:beam_start>
<srpgBeamMid:beam_mid>
<srpgBeamEnd:beam_end>
<srpgBarrage:line>
```

---

## 6. 구현 순서

### Phase 1: 직사 차단 시각 연출
- SM에서 pathCheck.blockInfo 좌표를 투사체 목적지로 전달
- 차단 지점에서 투사체 정지 + 착탄 이펙트

### Phase 2: 스톡샷
- parseSkillMeta에 멀티샷 태그 파싱 추가
- SM에 multiShotMode 타겟 선택 UI
- _executeMultiShot 전투 실행 로직
- _updateMultiShot 서브페이즈 루프

### Phase 3: 고정 범위 멀티샷
- BARRAGE_PATTERNS 패턴 정의
- parseSkillMeta에 바라지 태그 파싱 추가
- _executeBarrage 전투 실행 로직
- 관통(penetrate) 특수 로직 (line 패턴)

### Phase 4: 빌드 및 검증
