#!/usr/bin/env python3
"""전투 규칙 변경:
1. 반격: 근접 물리 기본공격 한정
2. 측면/배면: 물리 공격(hitType 1)만
3. 마법 치명타: <srpgMagicCrit> 트레잇 게이트
"""
import sys

def patch(content, old, new, label):
    if old not in content:
        print(f"  [FAIL] {label}: old string not found")
        print(f"         First 80: {repr(old[:80])}")
        return content, False
    count = content.count(old)
    if count > 1:
        print(f"  [WARN] {label}: {count} matches, replacing first")
    content = content.replace(old, new, 1)
    print(f"  [OK]   {label}")
    return content, True

data_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_Data.js"
with open(data_path, "r", encoding="utf-8") as f:
    data = f.read()
data_len = len(data)
all_ok = True

print("=== SRPG_Data.js combat rule patches ===")

# ══════════════════════════════════════════════════════════════════
# 1. 반격: 근접 기본공격 한정
# ══════════════════════════════════════════════════════════════════
# 1a. canCounter에 거리 체크 추가 (인접 1칸만)
old_1a = """        // ─── 반격 가능 여부 (Grid Range System 연동) ───
        canCounter(attacker, defender) {
            if (defender.isObject) return false;
            if (!defender.isAlive()) return false;
            // 사거리 체크
            const defReach = SrpgGrid.calcAtkRange(defender);
            const inRange = defReach.some(t => t.x === attacker.x && t.y === attacker.y);
            if (!inRange) return false;
            // CNT(반격률) 확률 체크 — 트레잇 미설정 시 100% 반격 (기존 호환)
            const cntRate = defender.cnt;
            if (cntRate <= 0) return false;
            if (cntRate >= 1) return true;
            return Math.random() < cntRate;
        },"""

new_1a = """        // ─── 반격 가능 여부 (근접 물리 기본공격 한정) ───
        // 반격 조건: 근접(인접 1칸) + 물리 공격에 대해서만 발동
        // 마법 반격은 별도 역할군/시스템으로 분리 (미구현)
        // 원거리 반격은 비활성화
        canCounter(attacker, defender) {
            if (defender.isObject) return false;
            if (!defender.isAlive()) return false;
            // 근접 인접 체크 (1칸 이내만 반격 가능)
            const dist = SrpgGrid.dist(attacker.x, attacker.y, defender.x, defender.y);
            if (dist > 1) return false;
            // CNT(반격률) 확률 체크 — 트레잇 미설정 시 100% 반격 (기존 호환)
            const cntRate = defender.cnt;
            if (cntRate <= 0) return false;
            if (cntRate >= 1) return true;
            return Math.random() < cntRate;
        },"""
data, ok = patch(data, old_1a, new_1a, "1a: canCounter 근접 한정")
all_ok = all_ok and ok

# 1b. execute() 반격 블록에 물리 공격 체크 추가
old_1b = """            // 반격 (리다이렉트된 경우 원래 대상도 반격하지 않음)
            if (!redirected && this.canCounter(attacker, defender) && defender.isAlive()) {"""

new_1b = """            // 반격 (근접 물리 공격에 한해서만 발동)
            // 조건: 리다이렉트 없음 + 근접 + 물리 공격(hitType 1) + 반격 가능
            const atkSkill = this.getSkillData(skillId);
            const atkHitType = (atkSkill && atkSkill.hitType != null) ? atkSkill.hitType : 1;
            if (!redirected && !isRanged && atkHitType === 1 &&
                this.canCounter(attacker, defender) && defender.isAlive()) {"""
data, ok = patch(data, old_1b, new_1b, "1b: execute 반격 물리+근접 체크")
all_ok = all_ok and ok

# 1c. predict() 반격 프리뷰에도 같은 조건 적용
old_1c = """            let counter = 0;
            if (!redirected && this.canCounter(attacker, defender)) {
                const counterPath = this.checkAttackPath(defender, attacker);
                if (!counterPath.blocked && !counterPath.redirectTarget) {
                    counter = this.calcDamage(defender, attacker, 0);
                    // 반격 PDR 예측
                    counter = Math.floor(counter * (attacker.pdr || 1));
                }
            }"""

new_1c = """            // 반격 예측 (근접 물리만)
            let counter = 0;
            const predDist = SrpgGrid.dist(attacker.x, attacker.y, defender.x, defender.y);
            const predIsRanged = predDist > 1;
            if (!redirected && !predIsRanged && hitType === 1 &&
                this.canCounter(attacker, defender)) {
                counter = this.calcDamage(defender, attacker, 0);
                // 반격 PDR 예측
                counter = Math.floor(counter * (attacker.pdr || 1));
            }"""
data, ok = patch(data, old_1c, new_1c, "1c: predict 반격 근접+물리 체크")
all_ok = all_ok and ok


# ══════════════════════════════════════════════════════════════════
# 2. 측면/배면: 물리 공격(hitType 1)만
# ══════════════════════════════════════════════════════════════════
# 2a. execute() - 배면 자동 명중을 물리 한정
old_2a = """            // ─── 명중 판정 (HIT vs EVA+MEV) ───
            // 배면 공격은 무조건 명중
            const isHit = (flankType === "rear")
                ? true
                : this.hitCheck(attacker, actualTarget, skillId, flankType);"""

new_2a = """            // ─── 명중 판정 (HIT vs EVA+MEV) ───
            // 스킬 명중 타입 확인 (물리만 측면/배면 보너스)
            const skillForFlank = this.getSkillData(skillId);
            const flankHitType = (skillForFlank && skillForFlank.hitType != null)
                ? skillForFlank.hitType : 1;
            const isPhysical = (flankHitType === 1);
            // 배면 자동 명중: 물리 공격만 적용
            const isHit = (isPhysical && flankType === "rear")
                ? true
                : this.hitCheck(attacker, actualTarget, skillId,
                    isPhysical ? flankType : "front");"""
data, ok = patch(data, old_2a, new_2a, "2a: 배면 자동명중 물리 한정")
all_ok = all_ok and ok

# 2b. hitCheck() - 측면 명중 보너스를 물리 한정
# hitCheck에 전달되는 flankType 자체가 이미 "front"로 바뀌므로 추가 수정 불필요
# (execute에서 isPhysical이 아니면 flankType="front"으로 전달)

# 2c. execute() - 측면/배면 데미지 배율을 물리 한정
old_2c = """            // ─── 배면/측면 데미지 배율 (공격 스킬만, 회복 제외) ───
            if (damageType !== 3 && damageType !== 4) {
                if (flankType === "rear") {
                    dmg = Math.floor(dmg * 2.0);
                } else if (flankType === "flank") {
                    dmg = Math.floor(dmg * 1.5);
                }
            }"""

new_2c = """            // ─── 배면/측면 데미지 배율 (물리 공격만) ───
            if (isPhysical) {
                if (flankType === "rear") {
                    dmg = Math.floor(dmg * 2.0);
                } else if (flankType === "flank") {
                    dmg = Math.floor(dmg * 1.5);
                }
            }"""
data, ok = patch(data, old_2c, new_2c, "2c: 측면/배면 데미지 물리 한정")
all_ok = all_ok and ok

# 2d. predict() - 측면/배면 예측도 물리 한정
old_2d = """            // 배면/측면 데미지 배율 (예측)
            if (flankType === "rear") {
                dmg = Math.floor(dmg * 2.0);
            } else if (flankType === "flank") {
                dmg = Math.floor(dmg * 1.5);
            }

            // 명중률 예측
            const hitType = (() => {
                const sk = this.getSkillData(skillId);
                return (sk && sk.hitType != null) ? sk.hitType : 1;
            })();
            let predictedHitRate = 1.0;
            if (hitType !== 0) {
                const atkHit = attacker.hit || 0.95;
                const sk = this.getSkillData(skillId);
                const skRate = (sk && sk.successRate != null) ? sk.successRate / 100 : 1.0;
                const defEva = (actualTarget.eva || 0) + (actualTarget.mev || 0);
                // 고저차 보정
                const pElevDiff = SrpgGrid.elevationDiff(attacker.x, attacker.y, actualTarget.x, actualTarget.y);
                const pElevEvaBonus = pElevDiff * -0.075;
                const pAdjEva = Math.max(0, defEva + pElevEvaBonus);
                const pElevHitMod = 1 + pElevDiff * 0.15;
                predictedHitRate = Math.min(1, Math.max(0, atkHit * skRate * (1 - pAdjEva) * pElevHitMod));
            }
            // 배면: 무조건 명중, 측면: 1.5배
            if (flankType === "rear") predictedHitRate = 1.0;
            else if (flankType === "flank") predictedHitRate = Math.min(1, predictedHitRate * 1.5);"""

new_2d = """            // 명중률 예측
            const hitType = (() => {
                const sk = this.getSkillData(skillId);
                return (sk && sk.hitType != null) ? sk.hitType : 1;
            })();
            const predIsPhysical = (hitType === 1);

            // 배면/측면 데미지 배율 (예측, 물리만)
            if (predIsPhysical) {
                if (flankType === "rear") {
                    dmg = Math.floor(dmg * 2.0);
                } else if (flankType === "flank") {
                    dmg = Math.floor(dmg * 1.5);
                }
            }

            let predictedHitRate = 1.0;
            if (hitType !== 0) {
                const atkHit = attacker.hit || 0.95;
                const sk = this.getSkillData(skillId);
                const skRate = (sk && sk.successRate != null) ? sk.successRate / 100 : 1.0;
                const defEva = (actualTarget.eva || 0) + (actualTarget.mev || 0);
                // 고저차 보정
                const pElevDiff = SrpgGrid.elevationDiff(attacker.x, attacker.y, actualTarget.x, actualTarget.y);
                const pElevEvaBonus = pElevDiff * -0.075;
                const pAdjEva = Math.max(0, defEva + pElevEvaBonus);
                const pElevHitMod = 1 + pElevDiff * 0.15;
                predictedHitRate = Math.min(1, Math.max(0, atkHit * skRate * (1 - pAdjEva) * pElevHitMod));
            }
            // 배면/측면 명중 보너스 (물리만)
            if (predIsPhysical) {
                if (flankType === "rear") predictedHitRate = 1.0;
                else if (flankType === "flank") predictedHitRate = Math.min(1, predictedHitRate * 1.5);
            }"""
data, ok = patch(data, old_2d, new_2d, "2d: predict 측면/배면 물리 한정")
all_ok = all_ok and ok


# ══════════════════════════════════════════════════════════════════
# 3. 마법 치명타: <srpgMagicCrit> 트레잇 게이트
# ══════════════════════════════════════════════════════════════════
old_3 = """        critRate(attacker, defender, skillId) {
            const skill = this.getSkillData(skillId);
            // 스킬에서 크리티컬 비활성화 시 0%
            if (skill && skill.damage && skill.damage.critical === false) return 0;
            // 회복 스킬은 크리티컬 없음
            if (skill && skill.damage && (skill.damage.type === 3 || skill.damage.type === 4)) return 0;
            // CRI(공격자) - CEV(방어자), 최소 0%
            const cri = attacker.cri || ((attacker.luk || 10) / 100); // fallback: 기존 LUK 방식
            const cev = defender ? (defender.cev || 0) : 0;
            return Math.max(0, cri - cev);
        },"""

new_3 = """        critRate(attacker, defender, skillId) {
            const skill = this.getSkillData(skillId);
            // 스킬에서 크리티컬 비활성화 시 0%
            if (skill && skill.damage && skill.damage.critical === false) return 0;
            // 회복 스킬은 크리티컬 없음
            if (skill && skill.damage && (skill.damage.type === 3 || skill.damage.type === 4)) return 0;
            // ─── 마법 크리티컬: 별도 트레잇 필요 ───
            // 마법(hitType 2)은 기본 CRI로 크리티컬 불가
            // <srpgMagicCrit:true> 노트태그가 있는 장비/상태/액터만 마법 크리티컬 가능
            const critHitType = (skill && skill.hitType != null) ? skill.hitType : 1;
            if (critHitType === 2) {
                // 마법 크리티컬 트레잇 확인
                const hasMagicCrit = attacker._data && attacker._data.note &&
                    /<srpgMagicCrit:\s*true>/i.test(attacker._data.note);
                // 장비에서도 확인
                const equipMagicCrit = attacker.equips && attacker.equips.some(e =>
                    e && e.note && /<srpgMagicCrit:\s*true>/i.test(e.note));
                // 상태에서도 확인
                const stateMagicCrit = attacker.states && attacker.states.some(s =>
                    s && s.note && /<srpgMagicCrit:\s*true>/i.test(s.note));
                if (!hasMagicCrit && !equipMagicCrit && !stateMagicCrit) return 0;
            }
            // CRI(공격자) - CEV(방어자), 최소 0%
            const cri = attacker.cri || ((attacker.luk || 10) / 100); // fallback: 기존 LUK 방식
            const cev = defender ? (defender.cev || 0) : 0;
            return Math.max(0, cri - cev);
        },"""
data, ok = patch(data, old_3, new_3, "3: 마법 크리티컬 트레잇 게이트")
all_ok = all_ok and ok


# 저장
with open(data_path, "w", encoding="utf-8") as f:
    f.write(data)
print(f"\n  SRPG_Data.js: {data_len} → {len(data)} chars")

print(f"\n{'='*50}")
if all_ok:
    print("All combat rule patches applied successfully!")
else:
    print("WARNING: Some patches failed!")
    sys.exit(1)
