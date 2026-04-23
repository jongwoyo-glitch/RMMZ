#!/usr/bin/env python3
"""전술 시스템 통합 재점검 — 버그 수정 패치
Critical 1: 플레이어 이동 OA 체크
Critical 2: 고저차 사거리 dead code 수정
Critical 3: 반격 측면/고저차/명중 판정
Critical 4: 적 AI 추격공격 체크
Medium 5: 힐 스킬 측면배율 제외
Medium 7: Miss 결과 flankType 추가
Medium 9: 적 AI MCR 적용
"""
import sys, os

def patch(content, old, new, label):
    if old not in content:
        print(f"  [FAIL] {label}: old string not found")
        # Print first 60 chars of old for debugging
        print(f"         Looking for: {repr(old[:80])}...")
        return content, False
    count = content.count(old)
    if count > 1:
        print(f"  [WARN] {label}: {count} matches found, replacing first only")
    content = content.replace(old, new, 1)
    print(f"  [OK]   {label}")
    return content, True

# ─── SRPG_Data.js ───
data_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_Data.js"
with open(data_path, "r", encoding="utf-8") as f:
    data = f.read()
data_orig_len = len(data)
all_ok = True

print("=== SRPG_Data.js patches ===")

# ── Critical 2: 고저차 사거리 보너스 dead code 수정 ──
# resolveReach 호출 전에 atkRange를 보정하여 타일 배열 자체를 확장/축소
old_c2 = """            const resolved = resolveReach(unit, null);
            const dir = unit.event ? unit.event.direction() : 8;
            // ─── 고저차 사거리 보정 (원거리만) ───
            // 고지대에서는 사거리 증가, 저지대에서는 감소
            // resolved.maxRange에 보정 적용 (개별 타일의 고저차가 아닌 공격자 위치 기준)
            const unitElev = this.getElevation(fromX, fromY);
            const elevRangeBonus = unitElev - 1; // 고지대(2):+1, 일반(1):0, 저지대(0):-1

            // 원거리(atkRange >= 2)일 때만 elevRangeBonus 적용
            if (unit.atkRange >= 2 && elevRangeBonus !== 0) {
                resolved.maxRange = Math.max(1, (resolved.maxRange || unit.atkRange) + elevRangeBonus);
            }"""

new_c2 = """            // ─── 고저차 사거리 보정 (원거리, atkRange 다이아몬드만) ───
            // resolveReach 호출 전에 atkRange를 임시 보정하여 타일 배열 확장/축소
            // 커스텀 reach 타일(노트태그/무기)에는 보정 미적용 (의도적)
            const unitElev = this.getElevation(fromX, fromY);
            const elevRangeBonus = unitElev - 1; // 고지대(2):+1, 일반(1):0, 저지대(0):-1
            const origAtkRange = unit.atkRange;
            if (unit.atkRange >= 2 && elevRangeBonus !== 0) {
                unit.atkRange = Math.max(1, unit.atkRange + elevRangeBonus);
            }
            const resolved = resolveReach(unit, null);
            unit.atkRange = origAtkRange; // atkRange 복원
            const dir = unit.event ? unit.event.direction() : 8;"""
data, ok = patch(data, old_c2, new_c2, "Critical 2: 고저차 사거리 보너스")
all_ok = all_ok and ok

# ── Medium 5: 힐 스킬 측면배율 제외 ──
old_m5 = """            // ─── 배면/측면 데미지 배율 ───
            if (flankType === "rear") {
                dmg = Math.floor(dmg * 2.0);
            } else if (flankType === "flank") {
                dmg = Math.floor(dmg * 1.5);
            }"""

new_m5 = """            // ─── 배면/측면 데미지 배율 (공격 스킬만, 회복 제외) ───
            if (damageType !== 3 && damageType !== 4) {
                if (flankType === "rear") {
                    dmg = Math.floor(dmg * 2.0);
                } else if (flankType === "flank") {
                    dmg = Math.floor(dmg * 1.5);
                }
            }"""
data, ok = patch(data, old_m5, new_m5, "Medium 5: 힐 스킬 측면배율 제외")
all_ok = all_ok and ok

# ── Medium 7: Miss 결과에 flankType 추가 ──
old_m7 = """                    damageType: this.getDamageType(skillId), skillId: skillId,
                    missed: true,
                };"""

new_m7 = """                    damageType: this.getDamageType(skillId), skillId: skillId,
                    missed: true, flankType: flankType,
                };"""
data, ok = patch(data, old_m7, new_m7, "Medium 7: Miss 결과 flankType")
all_ok = all_ok and ok

# ── Critical 3: 반격에 측면/고저차/명중 판정 적용 ──
old_c3 = """            // 반격 (리다이렉트된 경우 원래 대상도 반격하지 않음)
            if (!redirected && this.canCounter(attacker, defender) && defender.isAlive()) {
                // 반격도 경로 검사 (방어자 → 공격자)
                const counterPath = this.checkAttackPath(defender, attacker);
                if (!counterPath.blocked && !counterPath.redirectTarget) {
                    const cCrit = Math.random() < this.critRate(defender, attacker, 0);
                    let cdmg = this.rollDamage(defender, attacker, 0); // 반격은 기본 공격
                    // 반격에도 PDR/MDR 적용 (기본 공격 = 물리)
                    cdmg = Math.floor(cdmg * (attacker.pdr || 1));
                    if (cCrit) cdmg = Math.floor(cdmg * 1.5);
                    if (!deferDamage) {
                        attacker.takeDamage(cdmg);
                    }
                    result.counterDamage = cdmg;
                    result.counterCritical = cCrit;
                    if (!deferDamage) {
                        this.playCounterEffects(defender, attacker);
                    }
                }
            }"""

new_c3 = """            // 반격 (리다이렉트된 경우 원래 대상도 반격하지 않음)
            if (!redirected && this.canCounter(attacker, defender) && defender.isAlive()) {
                // 반격도 경로 검사 (방어자 → 공격자)
                const counterPath = this.checkAttackPath(defender, attacker);
                if (!counterPath.blocked && !counterPath.redirectTarget) {
                    // ─── 반격 측면/명중 판정 ───
                    const cFlank = this.getFlankingType(defender, attacker);
                    const cIsHit = (cFlank === "rear")
                        ? true
                        : this.hitCheck(defender, attacker, 0, cFlank);
                    if (cIsHit) {
                        const cCrit = Math.random() < this.critRate(defender, attacker, 0);
                        let cdmg = this.rollDamage(defender, attacker, 0); // 반격은 기본 공격
                        // 반격에도 PDR/MDR 적용 (기본 공격 = 물리)
                        cdmg = Math.floor(cdmg * (attacker.pdr || 1));
                        // 반격 측면 배율
                        if (cFlank === "rear") cdmg = Math.floor(cdmg * 2.0);
                        else if (cFlank === "flank") cdmg = Math.floor(cdmg * 1.5);
                        if (cCrit) cdmg = Math.floor(cdmg * 1.5);
                        if (!deferDamage) {
                            attacker.takeDamage(cdmg);
                        }
                        result.counterDamage = cdmg;
                        result.counterCritical = cCrit;
                        result.counterFlank = cFlank;
                        if (!deferDamage) {
                            this.playCounterEffects(defender, attacker);
                        }
                    } else {
                        // 반격 회피
                        result.counterMissed = true;
                    }
                }
            }"""
data, ok = patch(data, old_c3, new_c3, "Critical 3: 반격 측면/명중 판정")
all_ok = all_ok and ok

# 저장
with open(data_path, "w", encoding="utf-8") as f:
    f.write(data)
print(f"  SRPG_Data.js: {data_orig_len} → {len(data)} chars")

# ─── SRPG_SM.js ───
sm_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_SM.js"
with open(sm_path, "r", encoding="utf-8") as f:
    sm = f.read()
sm_orig_len = len(sm)

print("\n=== SRPG_SM.js patches ===")

# ── Critical 1: 플레이어 이동 완료 → OA 체크 ──
old_c1 = """        _handleMoving() {
            const unit = this._currentUnit;
            if (unit.updateMove()) return; // 아직 이동 중
            // 마지막 스텝 애니메이션까지 완전히 끝났는지 확인
            if (unit.event.isMoving()) return;

            // 경로 이동 완료 → 행동 메뉴
            $gamePlayer.locate(unit.x, unit.y);
            this._openActionMenu();
        },"""

new_c1 = """        _handleMoving() {
            const unit = this._currentUnit;
            if (unit.updateMove()) return; // 아직 이동 중
            // 마지막 스텝 애니메이션까지 완전히 끝났는지 확인
            if (unit.event.isMoving()) return;

            // ─── 플레이어 이동 완료 → 기회공격 체크 ───
            if (unit._segStartX !== undefined && unit._segStartY !== undefined &&
                (unit.x !== unit._segStartX || unit.y !== unit._segStartY)) {
                const oaResult = this._checkOpportunityAttack(
                    unit, unit._segStartX, unit._segStartY);
                if (oaResult) {
                    this._addPopup(oaResult.reactor.x, oaResult.reactor.y,
                        "기회 공격!", "#FFD700");
                    this._addPopup(unit.x, unit.y,
                        String(oaResult.damage), "#FF4444");
                    if (oaResult.died) {
                        unit.refreshTint();
                        this._endCurrentTurn();
                        return;
                    }
                }
            }

            // 경로 이동 완료 → 행동 메뉴
            $gamePlayer.locate(unit.x, unit.y);
            this._openActionMenu();
        },"""
sm, ok = patch(sm, old_c1, new_c1, "Critical 1: 플레이어 이동 OA 체크")
all_ok = all_ok and ok

# ── Medium 9: 적 AI MCR 적용 ──
old_m9 = """                // 스킬 MP 소모
                if (dec.skill && dec.skill.mpCost > 0) {
                    unit.mp -= dec.skill.mpCost;
                }"""

new_m9 = """                // 스킬 MP 소모 (MCR 적용)
                if (dec.skill && dec.skill.mpCost > 0) {
                    const mcrRate = unit.mcr || 1; // sparam MCR (MP 소비율)
                    const actualCost = Math.floor(dec.skill.mpCost * mcrRate);
                    unit.mp -= actualCost;
                }"""
sm, ok = patch(sm, old_m9, new_m9, "Medium 9: 적 AI MCR 적용")
all_ok = all_ok and ok

# ── Critical 4: 적 AI 전투 후 추격공격 + 반격 회피 팝업 ──
# _enemyShowAction 내에서 전투 결과 처리 이후, miss 팝업과 follow-up 추가
# 현재: result.blocked 체크 후 바로 데미지 이펙트로 넘어감
# miss 처리가 없고, follow-up 체크도 없음

old_c4 = """                if (result.blocked) {
                    // 완전 차단
                    this._addPopup(target.x, target.y, "차단!", "#aaaaaa");
                    try {
                        if (AudioManager && AudioManager.playSe) {
                            AudioManager.playSe({name: "Buzzer1", volume: 70, pitch: 100, pan: 0});
                        }
                    } catch (e) {}
                } else {
                    // 데미지 이펙트 (execute에서 이미 takeDamage 호출됨)
                    if (result.critical) SrpgFX.startCritCharge(unit, 15);
                    SrpgFX.startHitReaction(hitTarget, unit, result.isRanged, result.critical, hitTarget.team);

                    if (result.redirected) {
                        this._addPopup(hitTarget.x, hitTarget.y, "엄폐!", "#ffaa44");
                    }

                    // 데미지 팝업
                    const critTag = result.critical ? "!" : "";
                    this._addPopup(hitTarget.x, hitTarget.y,
                        `-${result.damage}${critTag}`, result.critical ? "#ffff00" : "#ff4444");

                    // 반격 이펙트
                    if (result.counterDamage > 0) {
                        if (result.counterCritical) SrpgFX.startCritCharge(target, 10);
                        SrpgFX.startHitReaction(unit, target, result.isRanged, result.counterCritical, unit.team);
                        const cTag = result.counterCritical ? "!" : "";
                        this._addPopup(unit.x, unit.y,
                            `-${result.counterDamage}${cTag}`, result.counterCritical ? "#ffff00" : "#ffaa44");
                    }

                    // 적 AI 스킬 범위 기반 애니메이션 스케일
                    const eSkill = this._pendingSkill || null;
                    const eScale = SrpgAnimScale.calcForSkill(unit, eSkill, hitTarget.x, hitTarget.y);
                    SrpgAnimScale.setScale(eScale);
                    SrpgCombat.playCombatEffects(unit, hitTarget);
                }"""

new_c4 = """                // ─── 적 AI 협동 공격 체크 ───
                const fuDef = result.actualTarget || target;
                if (!result.blocked && !result.missed && fuDef.isAlive()) {
                    const fuResult = this._checkFollowUpAttack(unit, fuDef);
                    if (fuResult) {
                        result.followUp = fuResult;
                        this._addPopup(fuResult.follower.x, fuResult.follower.y,
                            "협동!", "#00FF88");
                        this._addPopup(fuDef.x, fuDef.y,
                            String(fuResult.damage), "#00FF88");
                    }
                }

                if (result.blocked) {
                    // 완전 차단
                    this._addPopup(target.x, target.y, "차단!", "#aaaaaa");
                    try {
                        if (AudioManager && AudioManager.playSe) {
                            AudioManager.playSe({name: "Buzzer1", volume: 70, pitch: 100, pan: 0});
                        }
                    } catch (e) {}
                } else if (result.missed) {
                    // 회피!
                    this._addPopup(target.x, target.y, "MISS!", "#88aaff");
                    try {
                        if (AudioManager && AudioManager.playSe) {
                            AudioManager.playSe({name: "Evasion1", volume: 80, pitch: 110, pan: 0});
                        }
                    } catch (e) {}
                } else {
                    // 데미지 이펙트 (execute에서 이미 takeDamage 호출됨)
                    if (result.critical) SrpgFX.startCritCharge(unit, 15);
                    SrpgFX.startHitReaction(hitTarget, unit, result.isRanged, result.critical, hitTarget.team);

                    if (result.redirected) {
                        this._addPopup(hitTarget.x, hitTarget.y, "엄폐!", "#ffaa44");
                    }

                    // 데미지 팝업
                    const critTag = result.critical ? "!" : "";
                    this._addPopup(hitTarget.x, hitTarget.y,
                        `-${result.damage}${critTag}`, result.critical ? "#ffff00" : "#ff4444");

                    // 반격 이펙트
                    if (result.counterDamage > 0) {
                        if (result.counterCritical) SrpgFX.startCritCharge(target, 10);
                        SrpgFX.startHitReaction(unit, target, result.isRanged, result.counterCritical, unit.team);
                        const cTag = result.counterCritical ? "!" : "";
                        this._addPopup(unit.x, unit.y,
                            `-${result.counterDamage}${cTag}`, result.counterCritical ? "#ffff00" : "#ffaa44");
                    } else if (result.counterMissed) {
                        this._addPopup(unit.x, unit.y, "반격 회피!", "#88aaff");
                    }

                    // 적 AI 스킬 범위 기반 애니메이션 스케일
                    const eSkill = this._pendingSkill || null;
                    const eScale = SrpgAnimScale.calcForSkill(unit, eSkill, hitTarget.x, hitTarget.y);
                    SrpgAnimScale.setScale(eScale);
                    SrpgCombat.playCombatEffects(unit, hitTarget);
                }"""
sm, ok = patch(sm, old_c4, new_c4, "Critical 4: 적 AI 추격공격 + MISS/반격회피 팝업")
all_ok = all_ok and ok

# 저장
with open(sm_path, "w", encoding="utf-8") as f:
    f.write(sm)
print(f"  SRPG_SM.js: {sm_orig_len} → {len(sm)} chars")

# ─── 요약 ───
print(f"\n{'='*50}")
if all_ok:
    print("All patches applied successfully!")
else:
    print("WARNING: Some patches failed. Check output above.")
    sys.exit(1)
