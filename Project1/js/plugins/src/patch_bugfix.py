#!/usr/bin/env python3
"""
멀티타일 시스템 검증 후 발견된 버그 4건 수정 패치
1. tickSummonDurations() 미호출 → _updateTurnAdvance에 추가
2. 소환 제한 카운터 actorId 미구분 → _summonSkillType에 actorId 포함
3. _updateTargetGlow 멀티타일 미대응 → occupies() 사용
4. _executeSummon 단일타일 사전검증 → 멀티타일 대응
"""
import re, sys, shutil

# ── SRPG_Data.js 패치 ──
data_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_Data.js"
with open(data_path, "r", encoding="utf-8") as f:
    data = f.read()

original_len = len(data)
patches_applied = 0

# ─── 패치 1: _updateTurnAdvance에서 tickSummonDurations 호출 ───
# 이 패치는 SRPG_SM.js에 적용해야 함 (아래에서 처리)

# ─── 패치 2: 소환 제한 카운터에 actorId 포함 ───
# spawn() 내 _summonSkillType 설정: meta.type || "actor" → actorId 포함
old_2 = 'unit._summonSkillType = meta.type || "actor";'
new_2 = 'unit._summonSkillType = meta.actorId ? ("actor_" + meta.actorId) : (meta.type || "actor");'
if old_2 in data:
    data = data.replace(old_2, new_2)
    patches_applied += 1
    print(f"[PATCH 2a] spawn _summonSkillType → actorId 포함")
else:
    print(f"[SKIP 2a] spawn _summonSkillType 패턴 미발견")

# countActiveSummons/spawn 내 limit 체크의 _summonSkillType 비교도 동일하게 변경
old_2b = 'u._summonSkillType === (meta.type || "actor")'
new_2b = 'u._summonSkillType === (meta.actorId ? ("actor_" + meta.actorId) : (meta.type || "actor"))'
if old_2b in data:
    data = data.replace(old_2b, new_2b)
    patches_applied += 1
    print(f"[PATCH 2b] spawn limit check → actorId 포함")
else:
    print(f"[SKIP 2b] spawn limit check 패턴 미발견")

# ─── 패치 3: _updateTargetGlow 멀티타일 대응 ───
# atkTiles[i].x === unit.x && atkTiles[i].y === unit.y → unit.occupies(atkTiles[i].x, atkTiles[i].y)
old_3 = '''            let isTargetable = false;
            if (atkTiles && unit !== SM._currentUnit) {
                for (let i = 0; i < atkTiles.length; i++) {
                    if (atkTiles[i].x === unit.x && atkTiles[i].y === unit.y) {
                        isTargetable = true;
                        break;
                    }
                }
            }'''
new_3 = '''            let isTargetable = false;
            if (atkTiles && unit !== SM._currentUnit) {
                for (let i = 0; i < atkTiles.length; i++) {
                    if (unit.occupies(atkTiles[i].x, atkTiles[i].y)) {
                        isTargetable = true;
                        break;
                    }
                }
            }'''
if old_3 in data:
    data = data.replace(old_3, new_3)
    patches_applied += 1
    print(f"[PATCH 3] _updateTargetGlow → unit.occupies() 사용")
else:
    print(f"[SKIP 3] _updateTargetGlow 패턴 미발견")

with open(data_path, "w", encoding="utf-8") as f:
    f.write(data)
print(f"SRPG_Data.js: {patches_applied} patches, {original_len} → {len(data)} chars")

# ── SRPG_SM.js 패치 ──
sm_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_SM.js"
with open(sm_path, "r", encoding="utf-8") as f:
    sm = f.read()

sm_original_len = len(sm)
sm_patches = 0

# ─── 패치 1: _updateTurnAdvance에 tickSummonDurations() 호출 추가 ───
# _updateTurnAdvance 시작부 — finishedUnits 초기화 다음에 삽입
old_1 = '''        _updateTurnAdvance() {
            // 이전 페이즈의 완료 유닛 목록 즉시 초기화 (투명화 잔류 방지)
            this._finishedUnits = [];
            // 연속으로 같은 팀 유닛들을 뽑아 하나의 페이즈로 묶기'''
new_1 = '''        _updateTurnAdvance() {
            // 이전 페이즈의 완료 유닛 목록 즉시 초기화 (투명화 잔류 방지)
            this._finishedUnits = [];
            // 소환물 지속시간 감소 (턴 전환 시)
            if (typeof SrpgSummon !== 'undefined') SrpgSummon.tickSummonDurations();
            // 연속으로 같은 팀 유닛들을 뽑아 하나의 페이즈로 묶기'''
if old_1 in sm:
    sm = sm.replace(old_1, new_1)
    sm_patches += 1
    print(f"[PATCH 1] _updateTurnAdvance → tickSummonDurations() 호출 추가")
else:
    print(f"[SKIP 1] _updateTurnAdvance 패턴 미발견")

# ─── 패치 4: _executeSummon 멀티타일 사전검증 ───
old_4 = '''        _executeSummon(tx, ty, summonMeta) {
            const unit = this._currentUnit;

            // 타일에 유닛이 있으면 소환 불가
            if (this.unitAt(tx, ty)) {
                this._addPopup(tx, ty, "소환 불가!", "#ff6666");
                return; // selectTarget 유지, 다른 타일 선택 가능
            }
            // 이동 불가 지형이면 소환 불가
            if (!SrpgGrid.isPassable(tx, ty)) {
                this._addPopup(tx, ty, "소환 불가!", "#ff6666");
                return;
            }'''
new_4 = '''        _executeSummon(tx, ty, summonMeta) {
            const unit = this._currentUnit;

            // 멀티타일 대응: 앵커(tx,ty) 기준으로 전체 점유 영역 검증
            const gw = summonMeta.gridW || 1;
            const gh = summonMeta.gridH || 1;
            const anc = summonMeta.anchor || { x: 0, y: 0 };
            const oox = tx - anc.x, ooy = ty - anc.y;
            for (let ii = 0; ii < gw; ii++) {
                for (let jj = 0; jj < gh; jj++) {
                    const cx = oox + ii, cy = ooy + jj;
                    if (!SrpgGrid.inBounds(cx, cy) || !SrpgGrid.isPassable(cx, cy) || this.unitAt(cx, cy)) {
                        this._addPopup(tx, ty, "소환 불가!", "#ff6666");
                        return; // selectTarget 유지, 다른 타일 선택 가능
                    }
                }
            }'''
if old_4 in sm:
    sm = sm.replace(old_4, new_4)
    sm_patches += 1
    print(f"[PATCH 4] _executeSummon → 멀티타일 사전검증")
else:
    print(f"[SKIP 4] _executeSummon 패턴 미발견")

with open(sm_path, "w", encoding="utf-8") as f:
    f.write(sm)
print(f"SRPG_SM.js: {sm_patches} patches, {sm_original_len} → {len(sm)} chars")

print(f"\n총 패치: {patches_applied + sm_patches} / 4")
if patches_applied + sm_patches < 4:
    print("⚠ 일부 패치 미적용 — 수동 확인 필요")
    sys.exit(1)
else:
    print("✅ 모든 패치 적용 완료")
