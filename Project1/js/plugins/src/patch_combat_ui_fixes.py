#!/usr/bin/env python3
"""
4가지 전투 UI 버그 수정:
1. 피해 플로팅 텍스트 잔류 — _updatePopups 안전장치 + init/clearAll 팝업 정리
2. 턴 종료 아군 회색 색조 미적용 — Sprite_Character tint 적용
3. 아군 턴 시작 시 카메라 자동 이동 — _startPhaseRound에서 첫 아군 위치로 스크롤
4. 현재 페이즈 미해당 아군 회색 색조 — _phaseUnits 기반 tint 분기
"""
import sys

def patch(path, old, new, desc):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        print(f"  FAIL: {desc} — target not found")
        sys.exit(1)
    count = content.count(old)
    if count > 1:
        print(f"  WARN: {count} matches for '{desc}', replacing first only")
        content = content.replace(old, new, 1)
    else:
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  OK: {desc}")

UI = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_UI.js"
SM = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_SM.js"

# ============================================================
# 1. SRPG_UI.js — init() 재초기화 시 팝업 정리
# ============================================================
patch(UI,
    '                console.log("[SRPG] SrpgUI re-initializing (scene recreated)");',
    '''                // 기존 팝업 스프라이트 정리 (scene 복귀 시 고아 방지)
                if (SM._damagePopups) {
                    for (const p of SM._damagePopups) {
                        if (p.sprite) {
                            if (p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
                            if (!p.sprite._destroyed) p.sprite.destroy();
                        }
                    }
                    SM._damagePopups.length = 0;
                }
                console.log("[SRPG] SrpgUI re-initializing (scene recreated)");''',
    "init() 팝업 정리"
)

# ============================================================
# 2. SRPG_UI.js — clearAll() 에 팝업 정리 추가
# ============================================================
patch(UI,
    "            // 메뉴 텍스트 제거\n            if (this._menuTextWrap) this._menuTextWrap.removeChildren();\n            this._initialized = false;",
    """            // 팝업 스프라이트 전체 제거
            if (SM._damagePopups) {
                for (const p of SM._damagePopups) {
                    if (p.sprite) {
                        if (p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
                        if (!p.sprite._destroyed) p.sprite.destroy();
                    }
                }
                SM._damagePopups.length = 0;
            }
            // 메뉴 텍스트 제거
            if (this._menuTextWrap) this._menuTextWrap.removeChildren();
            this._initialized = false;""",
    "clearAll() 팝업 정리"
)

# ============================================================
# 3. SRPG_UI.js — _updatePopups 안전장치 (최대 수명 + 방어적 정리)
# ============================================================
patch(UI,
    """        _updatePopups() {
            if (!SM._damagePopups) return;
            const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            for (let i = SM._damagePopups.length - 1; i >= 0; i--) {
                const p = SM._damagePopups[i];
                // 스프라이트 미생성 시 새로 만듦
                if (!p.sprite && this._tilemap) {
                    const isShout = p.isShout;
                    const rs = RS();
                    const fontSize = Math.round((isShout ? 15 : 20) * rs);
                    const fillColor = typeof p.color === "string" ? p.color : "#ffffff";
                    const style = new PIXI.TextStyle({
                        fontFamily: "sans-serif",
                        fontSize,
                        fontWeight: "bold",
                        fill: fillColor,
                        stroke: isShout ? "#222244" : "#000000",
                        strokeThickness: Math.round((isShout ? 4 : 3) * rs),
                        ...(isShout ? { dropShadow: false } : {}),
                    });
                    p.sprite = new PIXI.Text(String(p.text), style);
                    p.sprite.anchor.set(0.5, 1);
                    p.sprite.x = p.x * tw + tw / 2;
                    // 외침은 유닛 머리 위(타일 상단보다 위), 데미지는 타일 중앙
                    p.sprite.y = isShout ? (p.y * th - th * 0.3) : (p.y * th);
                    p.sprite.z = 10;
                    this._overlayWrap.addChild(p.sprite);
                }
                p.timer--;
                if (p.timer <= 0) {
                    if (p.sprite && p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
                    if (p.sprite) p.sprite.destroy();
                    SM._damagePopups.splice(i, 1);
                } else if (p.sprite) {
                    p.sprite.y -= (p.isShout ? 0.4 : 0.8);
                    p.sprite.alpha = Math.min(1, p.timer / 15);
                }
            }
        },""",
    """        _updatePopups() {
            if (!SM._damagePopups) return;
            const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            const MAX_LIFE = 300; // 안전장치: 최대 5초 (300프레임)
            for (let i = SM._damagePopups.length - 1; i >= 0; i--) {
                const p = SM._damagePopups[i];
                // 생성 시간 기록 (최초 1회)
                if (p._born === undefined) p._born = 0;
                p._born++;
                // 스프라이트 미생성 시 새로 만듦
                if (!p.sprite && this._tilemap && this._overlayWrap) {
                    try {
                        const isShout = p.isShout;
                        const rs = RS();
                        const fontSize = Math.round((isShout ? 15 : 20) * rs);
                        const fillColor = typeof p.color === "string" ? p.color : "#ffffff";
                        const style = new PIXI.TextStyle({
                            fontFamily: "sans-serif",
                            fontSize,
                            fontWeight: "bold",
                            fill: fillColor,
                            stroke: isShout ? "#222244" : "#000000",
                            strokeThickness: Math.round((isShout ? 4 : 3) * rs),
                            ...(isShout ? { dropShadow: false } : {}),
                        });
                        p.sprite = new PIXI.Text(String(p.text), style);
                        p.sprite.anchor.set(0.5, 1);
                        p.sprite.x = p.x * tw + tw / 2;
                        p.sprite.y = isShout ? (p.y * th - th * 0.3) : (p.y * th);
                        p.sprite.z = 10;
                        this._overlayWrap.addChild(p.sprite);
                    } catch (e) {
                        console.warn("[SRPG] Popup sprite creation failed:", e);
                        SM._damagePopups.splice(i, 1);
                        continue;
                    }
                }
                p.timer--;
                // 안전장치: 최대 수명 초과 OR 타이머 이상값 → 강제 제거
                if (p.timer <= 0 || p._born > MAX_LIFE || isNaN(p.timer)) {
                    if (p.sprite) {
                        if (p.sprite.parent) p.sprite.parent.removeChild(p.sprite);
                        if (!p.sprite._destroyed) p.sprite.destroy();
                    }
                    SM._damagePopups.splice(i, 1);
                } else if (p.sprite) {
                    // 스프라이트가 고아(orphaned)인 경우 강제 제거
                    if (p.sprite._destroyed || !p.sprite.parent) {
                        SM._damagePopups.splice(i, 1);
                        continue;
                    }
                    p.sprite.y -= (p.isShout ? 0.4 : 0.8);
                    p.sprite.alpha = Math.min(1, p.timer / 15);
                }
            }
        },""",
    "_updatePopups 안전장치"
)

# ============================================================
# 4. SRPG_UI.js — Sprite_Character 턴종료/비페이즈 유닛 tint 처리
# ============================================================
patch(UI,
    """        // ── 투명도: 턴 종료 유닛 0.75, 그 외 1.0 (피/아 무관, 매 프레임 적용) ──
        const isCurrentUnit = (unit === SM._currentUnit);
        const isFinished = SM._finishedUnits && SM._finishedUnits.includes(unit);
        if (isCurrentUnit) {
            this.alpha = 1.0;
        } else if (isFinished) {
            this.alpha = 0.75;
        } else {
            this.alpha = 1.0;
        }""",
    """        // ── 턴 종료/비페이즈 유닛 시각 피드백 (tint + alpha) ──
        const isCurrentUnit = (unit === SM._currentUnit);
        const isFinished = SM._finishedUnits && SM._finishedUnits.includes(unit);
        // 아군 페이즈에서 _phaseUnits에 속하지 않는 아군 = 비활성
        const isAllyPhase = (SM._phase === "playerTurn");
        const isInPhase = !SM._phaseUnits || SM._phaseUnits.includes(unit);
        const isNonPhaseAlly = isAllyPhase && unit.team === "actor" && !isInPhase;
        if (isCurrentUnit) {
            this.alpha = 1.0;
            if (this._srpgPSprite) this._srpgPSprite.tint = 0xffffff;
        } else if (isFinished) {
            this.alpha = 0.75;
            if (this._srpgPSprite) this._srpgPSprite.tint = 0x888899;
        } else if (isNonPhaseAlly) {
            this.alpha = 0.65;
            if (this._srpgPSprite) this._srpgPSprite.tint = 0x777788;
        } else {
            this.alpha = 1.0;
            if (this._srpgPSprite) this._srpgPSprite.tint = 0xffffff;
        }""",
    "Sprite_Character 턴종료/비페이즈 tint"
)

# ============================================================
# 5. SRPG_SM.js — 아군 턴 시작 시 카메라 이동
# ============================================================
patch(SM,
    """            if (team === "actor") {
                // 브라우즈 모드로 시작 (유닛 선택 전 자유 정찰)
                this._currentUnit = null;
                this._phase = "playerTurn";
                this._subPhase = "browse";
                this._browseUnit = null;       // 호버 중인 유닛
                this._browseRange = [];        // 브라우즈 이동 범위
                this._browseCursorX = null;    // 키보드 커서 X
                this._browseCursorY = null;    // 키보드 커서 Y
                this._browseAtkThreat = [];    // 브라우즈 공격 위협 범위
                this._browseLastMx = -1;       // 마우스 위치 추적 (키보드/마우스 충돌 방지)
                this._browseLastMy = -1;
                this._moveRange = [];
                this._atkRange = [];
                this._inputDelay = 15;
                this._uiDirty = true;""",
    """            if (team === "actor") {
                // 브라우즈 모드로 시작 (유닛 선택 전 자유 정찰)
                this._currentUnit = null;
                this._phase = "playerTurn";
                this._subPhase = "browse";
                this._browseUnit = null;       // 호버 중인 유닛
                this._browseRange = [];        // 브라우즈 이동 범위
                this._browseCursorX = null;    // 키보드 커서 X
                this._browseCursorY = null;    // 키보드 커서 Y
                this._browseAtkThreat = [];    // 브라우즈 공격 위협 범위
                this._browseLastMx = -1;       // 마우스 위치 추적 (키보드/마우스 충돌 방지)
                this._browseLastMy = -1;
                this._moveRange = [];
                this._atkRange = [];
                this._inputDelay = 15;
                this._uiDirty = true;
                // ── 아군 턴 시작 시 첫 아군 유닛 위치로 카메라 이동 ──
                if (roundUnits.length > 0) {
                    const firstAlly = roundUnits[0];
                    $gamePlayer.locate(firstAlly.x, firstAlly.y);
                    $gamePlayer.center(firstAlly.x, firstAlly.y);
                    this._browseCursorX = firstAlly.x;
                    this._browseCursorY = firstAlly.y;
                }""",
    "아군 페이즈 시작 시 카메라 이동"
)

# ============================================================
# 6. SRPG_SM.js — 아군 페이즈 복귀(턴 종료 후) 시에도 카메라 이동
# ============================================================
patch(SM,
    """            // 남은 유닛 있음 → 브라우즈 모드로 복귀 (자동 선택 안 함)
                this._currentUnit = null;
                this._phase = "playerTurn";
                this._subPhase = "browse";
                this._browseUnit = null;
                this._browseRange = [];
                this._browseAtkThreat = [];
                this._browseLastMx = -1;
                this._browseLastMy = -1;
                this._moveRange = [];
                this._atkRange = [];
                this._inputDelay = 10;""",
    """            // 남은 유닛 있음 → 브라우즈 모드로 복귀 (자동 선택 안 함)
                this._currentUnit = null;
                this._phase = "playerTurn";
                this._subPhase = "browse";
                this._browseUnit = null;
                this._browseRange = [];
                this._browseAtkThreat = [];
                this._browseLastMx = -1;
                this._browseLastMy = -1;
                this._moveRange = [];
                this._atkRange = [];
                this._inputDelay = 10;
                // ── 남은 아군 중 첫 유닛으로 카메라 이동 ──
                if (remaining.length > 0) {
                    const nextAlly = remaining[0];
                    $gamePlayer.locate(nextAlly.x, nextAlly.y);
                    $gamePlayer.center(nextAlly.x, nextAlly.y);
                    this._browseCursorX = nextAlly.x;
                    this._browseCursorY = nextAlly.y;
                }""",
    "턴 종료 후 복귀 시 카메라 이동"
)

print("\n모든 패치 완료.")
