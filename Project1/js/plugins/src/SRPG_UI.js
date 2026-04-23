// ─── SRPG_UI.js ─────────────────────────────────────────────────────────────
// 빌드 순서: 3/3 (최상위 계층 — 화면 표시 + RMMZ 엔진 연결)
//
// [포함 모듈]
//   _TS            — PIXI 텍스트 스타일 정의 (menu, hud, banner, damage 등)
//   SrpgUI         — 오버레이 렌더링 (→ window.SrpgUI)
//     턴오더바      : _drawTurnOrderBar, _updateTurnOrderSlots
//     HUD           : _drawHUD, _drawUnitStats
//     커서          : _drawCursor
//     이동범위 표시  : _drawMoveRange, _drawAtkRange
//     전투 프리뷰   : _drawCombatPreview, _drawProjectilePathPreview
//     원형 메뉴     : _drawRadialMenu, _drawSubRadial
//     팝업          : _updatePopups, _drawDamagePopup
//     배너          : _drawBanner
//     적 행동 메시지 : _drawEnemyActionMsg (비활성화됨 — 외침 팝업으로 대체)
//   Sprite_Character 확장 — 초상화 렌더링, 턴 종료 투명도
//     _srpgPSetup, _srpgPUpdateBitmap, _srpgPUpdatePosition
//     _srpgPUpdateEffects, _srpgPCleanup
//   Scene_Map 확장  — SM.update/SrpgUI.update/SrpgFX.update 호출
//   Spriteset_Map 확장 — SrpgProjectile.init 호출
//   Game_Player 확장 — 전투 중 이동/액션 차단
//   Game_Event 확장  — 전투 중 자율이동/트리거 차단
//   Plugin Commands — StartBattle, EndBattle
//   IIFE 닫기       — })();
//
// [외부 의존 — SRPG_Data.js]
//   SrpgSkillMeta  — calcReachTiles (범위 시각화)
//   SrpgProjectile — parseSkillMeta (프리뷰용)
//   SrpgCombat     — resolveFireMode (프리뷰 경로 판정)
//   SrpgGrid       — doesTileBlock, traceLine (프리뷰 경로)
//   SrpgFX         — update (Scene_Map에서 호출)
//   상수           — C, FIRE_MODE, PORTRAIT_MODE, TILE 등
//
// [외부 의존 — SRPG_SM.js]
//   SM             — _phase, _subPhase, _currentUnit, _units, _moveRange,
//                    _atkRange, _finishedUnits, _combatPrediction 등 상태 조회
//
// [참조하는 쪽] 없음 (최상위 계층)
// ─────────────────────────────────────────────────────────────────────────────

    // =========================================================================
    //  SrpgUI — 오버레이 렌더링 (이동범위, 커서, 턴오더바, 메뉴, 팝업 등)
    // =========================================================================
    // ─── 해상도 비례 스케일 (기준: 816x624) ───
    // RS() = min(현재폭/816, 현재높이/624) — UI 요소 크기 동적 조정
    // 매 프레임 호출해도 가벼움 (단순 나눗셈)
    function RS() {
        return Math.min(Graphics.width / 816, Graphics.height / 624);
    }

    // ─── 공통 텍스트 스타일 ───
    const _TS_BASE = {
        menu: { fontFamily: "sans-serif", fontSize: 13, fill: "#ffffff", stroke: "#000000", strokeThickness: 2 },
        menuSm: { fontFamily: "sans-serif", fontSize: 11, fill: "#aaaacc", stroke: "#000000", strokeThickness: 1 },
        hud: { fontFamily: "sans-serif", fontSize: 12, fill: "#ffffff", stroke: "#000000", strokeThickness: 2 },
        hudSm: { fontFamily: "sans-serif", fontSize: 10, fill: "#cccccc", stroke: "#000000", strokeThickness: 1 },
        banner: { fontFamily: "sans-serif", fontSize: 18, fill: "#ffdd66", stroke: "#000000", strokeThickness: 3, fontWeight: "bold" },
        damage: { fontFamily: "sans-serif", fontSize: 20, fill: "#ffffff", stroke: "#000000", strokeThickness: 3, fontWeight: "bold" },
        pvLabel: { fontFamily: "sans-serif", fontSize: 13, fill: "#ffffff", stroke: "#000000", strokeThickness: 2 },
        pvNum: { fontFamily: "sans-serif", fontSize: 16, fill: "#ff6644", stroke: "#000000", strokeThickness: 2, fontWeight: "bold" },
        pvBtn: { fontFamily: "sans-serif", fontSize: 13, fill: "#ffffff", stroke: "#000000", strokeThickness: 2 },
        enemy: { fontFamily: "sans-serif", fontSize: 12, fill: "#ff8888", stroke: "#000000", strokeThickness: 2 },
    };
    // 해상도 비례 텍스트 스타일 — _TS.xxx 접근 시 RS()로 fontSize 자동 조정
    const _TS = new Proxy(_TS_BASE, {
        get(target, key) {
            const base = target[key];
            if (!base) return base;
            const rs = RS();
            return Object.assign({}, base, {
                fontSize: Math.round(base.fontSize * rs),
                strokeThickness: Math.round(base.strokeThickness * rs)
            });
        }
    });

    const SrpgUI = window.SrpgUI = {
        _initialized: false,
        _tilemap: null,
        _overlayWrap: null,
        _overlayGfx: null,
        _cursorWrap: null,
        _cursorGfx: null,
        _hudWrap: null,
        _hudGfx: null,
        _miniArrowWrap: null,
        _miniArrowGfx: null,
        _lastDX: -1,
        _lastDY: -1,
        // 턴오더 바 관련
        _toContainer: null,
        _toGfx: null,
        _toSlots: [],       // [{container, gfx, sprite, mask}]
        _toPortraitCache: {},// unit key → PIXI.Texture
        _toAnimOffset: 0,
        // 텍스트 캐시
        _textPool: {},       // key → PIXI.Text
        _textUsed: {},       // 현 프레임에서 사용된 키
        // 메뉴 텍스트 (오버레이에 부착)
        _menuTextWrap: null,

        init(tilemap) {
            // ── 재초기화 감지: Scene_Menu 복귀 등으로 새 tilemap이 들어오면
            //    기존 텍스트 풀/슬롯을 정리하고 dirty 플래그를 올린다 ──
            if (this._initialized) {
                // 기존 텍스트 풀 정리 (파괴된 객체 참조 제거)
                for (const k in this._textPool) {
                    const t = this._textPool[k];
                    if (t && !t._destroyed) {
                        if (t.parent) t.parent.removeChild(t);
                        t.destroy();
                    }
                }
                this._textPool = {};
                this._textUsed = {};
                // 기존 턴오더 슬롯 정리
                for (const s of this._toSlots) {
                    if (s.container && !s.container._destroyed) {
                        if (s.container.parent) s.container.parent.removeChild(s.container);
                        s.container.destroy({ children: true });
                    }
                }
                this._toSlots = [];
                this._toPortraitCache = {};
                // 메뉴 텍스트 정리
                if (this._menuTextWrap && !this._menuTextWrap._destroyed) {
                    this._menuTextWrap.removeChildren();
                }
                console.log("[SRPG] SrpgUI re-initializing (scene recreated)");
            }

            this._tilemap = tilemap;
            this._initialized = true;

            // 오버레이 레이어 (이동/공격 범위 표시, z=0)
            this._overlayWrap = new PIXI.Container();
            this._overlayWrap.z = 0;
            this._overlayGfx = new PIXI.Graphics();
            this._overlayWrap.addChild(this._overlayGfx);
            tilemap.addChild(this._overlayWrap);

            // 장판(Surface) 렌더 레이어 (z=1, 오버레이 위/캐릭터 아래)
            this._fieldSurfaceWrap = new PIXI.Container();
            this._fieldSurfaceWrap.z = 1;
            tilemap.addChild(this._fieldSurfaceWrap);
            this._fieldSurfaceSprites = {}; // surfaceId → { tiles: Map<"x,y" → PIXI.Graphics> }

            // 구름(Cloud) 렌더 레이어 (z=6, 캐릭터 위)
            this._fieldCloudWrap = new PIXI.Container();
            this._fieldCloudWrap.z = 6;
            tilemap.addChild(this._fieldCloudWrap);
            this._fieldCloudSprites = {}; // cloudId → { tiles: Map<"x,y" → PIXI.Graphics> }

            // 장판 애니메이션 타이머
            this._fieldAnimFrame = 0;
            this._fieldAnimTimer = 0;

            // 커서 레이어 (z=4, 초상화 위)
            this._cursorWrap = new PIXI.Container();
            this._cursorWrap.z = 4;
            this._cursorGfx = new PIXI.Graphics();
            this._cursorWrap.addChild(this._cursorGfx);
            tilemap.addChild(this._cursorWrap);

            // 미니 방향 화살표 레이어 (z=5, 초상화 위)
            this._miniArrowWrap = new PIXI.Container();
            this._miniArrowWrap.z = 5;
            this._miniArrowGfx = new PIXI.Graphics();
            this._miniArrowWrap.addChild(this._miniArrowGfx);
            tilemap.addChild(this._miniArrowWrap);

            // 메뉴/배너/프리뷰 레이어 (z=8, 스프라이트 위)
            this._menuLayer = new PIXI.Container();
            this._menuLayer.z = 8;
            this._menuLayerGfx = new PIXI.Graphics();
            this._menuLayer.addChild(this._menuLayerGfx);
            this._menuTextWrap = new PIXI.Container();
            this._menuLayer.addChild(this._menuTextWrap);
            tilemap.addChild(this._menuLayer);

            // HUD 레이어 (화면 고정 — Scene_Map 자식)
            this._hudWrap = new PIXI.Container();
            this._hudGfx = new PIXI.Graphics();
            this._hudWrap.addChild(this._hudGfx);
            // 턴오더 바 전용 컨테이너
            this._toContainer = new PIXI.Container();
            this._toGfx = new PIXI.Graphics();
            this._toContainer.addChild(this._toGfx);
            this._hudWrap.addChild(this._toContainer);
            this._toSlots = [];
            this._toPortraitCache = {};

            // 전투 중 재초기화 시 강제 갱신 (Scene_Menu 복귀 등)
            if (SM._battleActive) {
                SM._uiDirty = true;
                SrpgProjectile._pendingInit = true;
            }
        },

        // ─── 텍스트 풀 관리 ───
        _getText(key, text, style, parent) {
            const target = parent || this._hudWrap;
            if (!target) return null;
            // 파괴된 텍스트 객체 제거
            if (this._textPool[key] && this._textPool[key]._destroyed) {
                delete this._textPool[key];
            }
            if (!this._textPool[key]) {
                this._textPool[key] = new PIXI.Text(text, new PIXI.TextStyle(style));
                target.addChild(this._textPool[key]);
            }
            const t = this._textPool[key];
            if (t.text !== text) t.text = text;
            if (t.parent !== target) {
                if (t.parent) t.parent.removeChild(t);
                target.addChild(t);
            }
            t.visible = true;
            this._textUsed[key] = true;
            return t;
        },
        _beginTextFrame() { this._textUsed = {}; },
        _endTextFrame() {
            for (const k in this._textPool) {
                if (!this._textUsed[k]) this._textPool[k].visible = false;
            }
        },

        refresh() {
            this._drawOverlay();
            this._drawCursor();
            this._drawMiniArrows();
        },

        update() {
            if (!this._initialized || !SM._battleActive) return;
            this._updateScrollPositions();
            const scrolled = this._checkScroll();
            const stateChanged = SM._uiDirty;
            // 호버 타일 변경 감지 (이동/공격/브라우즈 범위 표시 중 호버 강조 갱신)
            let hoverChanged = false;
            const hasRange = (SM._moveRange && SM._moveRange.length > 0) ||
                             (SM._atkRange && SM._atkRange.length > 0) ||
                             (SM._subPhase === "browse" && SM._browseRange && SM._browseRange.length > 0);
            if (hasRange) {
                const ht = SM.getHoverTile();
                const hk = ht ? `${ht.x},${ht.y}` : "";
                if (hk !== this._lastHoverKey) {
                    this._lastHoverKey = hk;
                    hoverChanged = true;
                }
            }
            if (stateChanged) {
                SM._uiDirty = false;
                this._drawOverlay();
                this._drawHUD();
            } else if (hoverChanged) {
                this._drawOverlay();
            }
            if (SM._subPhase === "selectTarget" || scrolled || stateChanged) {
                this._drawCursor();
            }
            // 브라우즈 모드: 스크롤 시 오버레이 재그리기 (tilemap 좌표 기반이므로)
            if (scrolled && SM._subPhase === "browse") {
                this._drawOverlay();
            }
            // 미니 화살표: 매 프레임 갱신 (행동 후에도 유지)
            this._drawMiniArrows();
            this._updatePopups();
            this._toAnimOffset += 0.02;
            SrpgSummon.update();
            // 장판/구름 스프라이트 갱신 (매 프레임)
            this._updateFieldSprites();
            // 은신 시 적군 시야 오버레이
            this._updateEnemyVisionOverlay();
            // 배치 페이즈 오버레이
            this._updateDeploymentOverlay();
        },

        clearAll() {
            if (this._overlayGfx) this._overlayGfx.clear();
            this._clearFieldSprites();
            this._clearEnemyVisionOverlay();
            this._clearDeploymentOverlay();
            if (this._menuLayerGfx) this._menuLayerGfx.clear();
            if (this._cursorGfx) this._cursorGfx.clear();
            if (this._hudGfx) this._hudGfx.clear();
            if (this._miniArrowGfx) this._miniArrowGfx.clear();
            if (this._toGfx) this._toGfx.clear();
            // 턴오더 슬롯 제거
            for (const s of this._toSlots) {
                if (s.container && s.container.parent) s.container.parent.removeChild(s.container);
            }
            this._toSlots = [];
            // 텍스트 풀 전체 제거
            for (const k in this._textPool) {
                const t = this._textPool[k];
                if (t.parent) t.parent.removeChild(t);
                t.destroy();
            }
            this._textPool = {};
            // 메뉴 텍스트 제거
            if (this._menuTextWrap) this._menuTextWrap.removeChildren();
            this._initialized = false;
        },

        _checkScroll() {
            const dx = $gameMap.displayX();
            const dy = $gameMap.displayY();
            if (dx !== this._lastDX || dy !== this._lastDY) {
                this._lastDX = dx;
                this._lastDY = dy;
                return true;
            }
            return false;
        },

        // ─── tilemap 자식 컨테이너 스크롤 오프셋 보정 ───
        // RMMZ Tilemap.origin은 _lowerLayer/_upperLayer(타일 렌더링)에만 적용되고
        // addChild로 추가한 컨테이너에는 적용되지 않음.
        // 캐릭터 스프라이트는 screenX()/screenY()로 자체 보정하지만,
        // 우리 오버레이/화살표/커서는 맵픽셀 좌표로 그리므로 컨테이너 위치로 보정.
        _updateScrollPositions() {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const ox = Math.ceil($gameMap.displayX() * tw);
            const oy = Math.ceil($gameMap.displayY() * th);
            const containers = [
                this._overlayWrap, this._cursorWrap, this._miniArrowWrap,
                this._fieldSurfaceWrap, this._fieldCloudWrap, this._menuLayer,
                this._deployOverlayWrap, this._enemyVisionWrap,
            ];
            for (const c of containers) {
                if (c) { c.pivot.x = ox; c.pivot.y = oy; }
            }
        },

        // =================================================================
        //  오버레이 (이동범위, 공격범위, 적 이동범위, 메뉴, 프리뷰 등)
        // =================================================================
        _drawOverlay() {
            const g = this._overlayGfx;
            g.clear();
            // 메뉴 레이어 (고 z-index, 스프라이트 위)
            const mg = this._menuLayerGfx;
            if (mg) mg.clear();
            if (this._menuTextWrap) this._menuTextWrap.removeChildren();
            if (!SM._battleActive) return;

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const PAD = 1, CUT = 3;

            // 이동 범위
            if (SM._moveRange && SM._moveRange.length > 0) {
                g.beginFill(C.moveFill, C.moveAlpha);
                for (const t of SM._moveRange) {
                    this._drawOctaTile(g, t.x * tw, t.y * th, tw, th, PAD, CUT);
                }
                g.endFill();
                // 호버 타일 강조 (이동 범위 내)
                const hoverTile = SM.getHoverTile();
                if (hoverTile && SM._moveRangeSet && SM._moveRangeSet.has(`${hoverTile.x},${hoverTile.y}`)) {
                    g.lineStyle(2, 0xffffff, 0.85);
                    g.beginFill(0xffffff, 0.25);
                    this._drawOctaTile(g, hoverTile.x * tw, hoverTile.y * th, tw, th, PAD, CUT);
                    g.endFill();
                    g.lineStyle(0);
                }
                // 공격 위협 범위 (이동범위 외곽, 적색 외곽선)
                if (SM._moveAtkThreat && SM._moveAtkThreat.length > 0) {
                    for (const t of SM._moveAtkThreat) {
                        g.lineStyle(1.5, C.atkFill, 0.4);
                        g.beginFill(C.atkFill, 0.05);
                        this._drawOctaTile(g, t.x * tw, t.y * th, tw, th, PAD, CUT);
                        g.endFill();
                    }
                    g.lineStyle(0);
                }
            }
            // 이동 경로
            if (SM._movePath && SM._movePath.length > 1) {
                g.lineStyle(3, C.pathFill, C.pathAlpha);
                for (let i = 0; i < SM._movePath.length - 1; i++) {
                    const a = SM._movePath[i], b = SM._movePath[i + 1];
                    g.moveTo(a.x * tw + tw / 2, a.y * th + th / 2);
                    g.lineTo(b.x * tw + tw / 2, b.y * th + th / 2);
                }
                g.lineStyle(0);
            }
            // 공격 범위 (행동 메뉴 등에서 표시)
            if (SM._atkRange && SM._atkRange.length > 0) {
                g.beginFill(C.atkFill, C.atkAlpha);
                for (const t of SM._atkRange) {
                    this._drawOctaTile(g, t.x * tw, t.y * th, tw, th, PAD, CUT);
                }
                g.endFill();
                // 호버 타일 강조 (공격 범위 내)
                const hoverAtk = SM.getHoverTile();
                if (hoverAtk) {
                    const inAtk = SM._atkRange.some(t => t.x === hoverAtk.x && t.y === hoverAtk.y);
                    if (inAtk) {
                        g.lineStyle(2, 0xffaaaa, 0.85);
                        g.beginFill(0xff6644, 0.25);
                        this._drawOctaTile(g, hoverAtk.x * tw, hoverAtk.y * th, tw, th, PAD, CUT);
                        g.endFill();
                        g.lineStyle(0);
                    }
                }
            }
            // ─── 브라우즈 모드: 호버 유닛 이동 범위 + 공격 위협 범위 ───
            if (SM._subPhase === "browse" && SM._browseRange && SM._browseRange.length > 0) {
                const bu = SM._browseUnit;
                const browseColor = bu && bu.isPlayerControlled() ? C.moveFill : C.enemyColor;
                // 이동 범위 (채우기)
                g.beginFill(browseColor, C.moveAlpha);
                for (const t of SM._browseRange) {
                    this._drawOctaTile(g, t.x * tw, t.y * th, tw, th, PAD, CUT);
                }
                g.endFill();
                // 호버 타일 강조 (브라우즈 범위 내)
                const hoverBrowse = SM.getHoverTile();
                if (hoverBrowse) {
                    const inBrowse = SM._browseRange.some(t => t.x === hoverBrowse.x && t.y === hoverBrowse.y);
                    if (inBrowse) {
                        g.lineStyle(2, 0xffffff, 0.85);
                        g.beginFill(0xffffff, 0.20);
                        this._drawOctaTile(g, hoverBrowse.x * tw, hoverBrowse.y * th, tw, th, PAD, CUT);
                        g.endFill();
                        g.lineStyle(0);
                    }
                }
                // 공격 위협 범위 (적색 외곽선만, 채우기 없음)
                if (SM._browseAtkThreat && SM._browseAtkThreat.length > 0) {
                    for (const t of SM._browseAtkThreat) {
                        g.lineStyle(1.5, C.atkFill, 0.45);
                        g.beginFill(C.atkFill, 0.06);
                        this._drawOctaTile(g, t.x * tw, t.y * th, tw, th, PAD, CUT);
                        g.endFill();
                    }
                    g.lineStyle(0);
                }
            }
            // ─── 브라우즈 커서 표시 (키보드 탐색 위치) ───
            if (SM._subPhase === "browse" && SM._browseCursorX != null) {
                const bcx = SM._browseCursorX * tw;
                const bcy = SM._browseCursorY * th;
                // 점선 사각형 + 십자 표시
                g.lineStyle(2, 0xffffff, 0.7);
                g.drawRect(bcx + 2, bcy + 2, tw - 4, th - 4);
                g.lineStyle(0);
                // 중앙 십자
                const ccx = bcx + tw / 2, ccy = bcy + th / 2;
                g.lineStyle(1, 0xffffff, 0.5);
                g.moveTo(ccx - 6, ccy); g.lineTo(ccx + 6, ccy);
                g.moveTo(ccx, ccy - 6); g.lineTo(ccx, ccy + 6);
                g.lineStyle(0);
            }
            // 적 턴: 이동 범위 표시
            if (SM._phase === "enemyTurn" && SM._enemyMoveRange.length > 0) {
                g.beginFill(C.enemyColor, 0.15);
                for (const t of SM._enemyMoveRange) {
                    this._drawOctaTile(g, t.x * tw, t.y * th, tw, th, PAD, CUT);
                }
                g.endFill();
                if (SM._enemyMovePath && SM._enemyMovePath.length > 1) {
                    g.lineStyle(2, C.enemyColor, 0.5);
                    for (let i = 0; i < SM._enemyMovePath.length - 1; i++) {
                        const a = SM._enemyMovePath[i], b = SM._enemyMovePath[i + 1];
                        g.moveTo(a.x * tw + tw / 2, a.y * th + th / 2);
                        g.lineTo(b.x * tw + tw / 2, b.y * th + th / 2);
                    }
                    g.lineStyle(0);
                }
            }
            // ─── 이하 메뉴/배너/프리뷰: 고z 레이어(mg)에 그림 ───
            // 메뉴 표시
            if (SM._subPhase === "radialMenu" || SM._subPhase === "subRadial") {
                this._drawRadialMenu(mg || g);
            }
            if (SM._subPhase === "slotReel") {
                this._drawSlotReel(mg || g);
            }
            // 전투 프리뷰 패널
            if (SM._subPhase === "combatPreview") {
                this._drawCombatPreview(mg || g);
            }
            // 방향 전환 화살표
            if (SM._subPhase === "faceDirection") {
                this._drawFaceDirectionArrows(mg || g);
            }
            // 적 행동 메시지 — 외침 팝업 시스템으로 대체, 비활성화
            // if (SM._phase === "enemyTurn" && SM._enemyActionMsg) {
            //     this._drawEnemyActionMsg(mg || g);
            // }
            // 배너
            if (SM._bannerTimer > 0) {
                this._drawBanner(mg || g);
            }
        },

        // ─── 팔각형 타일 그리기 유틸 ───
        _drawOctaTile(g, sx, sy, tw, th, pad, cut) {
            g.moveTo(sx + pad + cut, sy + pad);
            g.lineTo(sx + tw - pad - cut, sy + pad);
            g.lineTo(sx + tw - pad, sy + pad + cut);
            g.lineTo(sx + tw - pad, sy + th - pad - cut);
            g.lineTo(sx + tw - pad - cut, sy + th - pad);
            g.lineTo(sx + pad + cut, sy + th - pad);
            g.lineTo(sx + pad, sy + th - pad - cut);
            g.lineTo(sx + pad, sy + pad + cut);
            g.closePath();
        },

        // ─── 커서 그리기 ───
        _drawCursor() {
            const g = this._cursorGfx;
            g.clear();
            if (SM._subPhase === "selectTarget" && SM._targetCursorActive) {
                const tw = $gameMap.tileWidth();
                const th = $gameMap.tileHeight();
                const sx = SM._targetTileX * tw;
                const sy = SM._targetTileY * th;
                const PAD = 1, CUT = 3;
                const tileUnit = SM.unitAt(SM._targetTileX, SM._targetTileY);
                const isSummonSkill = SM._pendingSkill &&
                    SrpgSummon.parseSummonMeta(SM._pendingSkill.id);
                let cursorColor, cursorAlpha;
                if (isSummonSkill) {
                    const canPlace = !tileUnit && SrpgGrid.isPassable(SM._targetTileX, SM._targetTileY);
                    cursorColor = canPlace ? 0x44DD44 : 0xFF4444;
                    cursorAlpha = 0.3;
                } else {
                    const hasHostile = tileUnit && tileUnit.isAlive()
                        && SM._currentUnit && SM._currentUnit.isHostileTo(tileUnit);
                    cursorColor = hasHostile ? C.selectFill : 0xFFDD44;
                    cursorAlpha = hasHostile ? 0.35 : 0.25;
                }
                g.beginFill(cursorColor, cursorAlpha);
                this._drawOctaTile(g, sx, sy, tw, th, PAD, CUT);
                g.endFill();
                g.lineStyle(2, cursorColor, 0.9);
                this._drawOctaTile(g, sx, sy, tw, th, PAD + 1, CUT);
                g.lineStyle(0);
                const cx = sx + tw / 2, cy = sy + th / 2;
                g.lineStyle(1, 0xffffff, 0.6);
                g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy);
                g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6);
                g.lineStyle(0);
                return;
            }
            if (!SM._selectedTarget) return;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const sx = SM._selectedTarget.x * tw;
            const sy = SM._selectedTarget.y * th;
            g.lineStyle(2, C.selectFill, 0.8);
            this._drawOctaTile(g, sx, sy, tw, th, 1, 3);
            g.lineStyle(0);
        },

        // =================================================================
        //  미니 방향 화살표 — 유닛 우측 상단, 팀색 원형 + 흰색 화살표
        // =================================================================
        _drawMiniArrows() {
            const g = this._miniArrowGfx;
            if (!g) return;
            if (!PORTRAIT_MODE || !SM._battleActive || !SM._units
                || SM._subPhase === "faceDirection") { g.clear(); return; }
            // 캐싱: 유닛 방향이 바뀌지 않으면 재그리기 스킵
            let dirKey = "";
            for (const unit of SM._units) {
                if (!unit.isAlive() || !unit.event) continue;
                const _rx = unit.event._realX != null ? unit.event._realX : unit.x;
                const _ry = unit.event._realY != null ? unit.event._realY : unit.y;
                dirKey += _rx + "," + _ry + "," + unit.event.direction() + ";";
            }
            if (dirKey === this._miniArrowCache) return;
            this._miniArrowCache = dirKey;
            g.clear();
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const R = 7;          // 원형 반지름
            const arrSz = 3.5;    // 화살표 크기

            for (const unit of SM._units) {
                if (!unit.isAlive()) continue;
                const ev = unit.event;
                if (!ev) continue;
                const dir = ev.direction();
                // 유닛 우측 상단 위치 (_realX/_realY로 이동 중 부드럽게 추적)
                const rx = ev._realX != null ? ev._realX : unit.x;
                const ry = ev._realY != null ? ev._realY : unit.y;
                const cx = rx * tw + tw - R - 1;
                const cy = ry * th + R + 1;
                const tc = unit.teamColor().fill;
                // 팀색 원형 배경 (반투명)
                g.beginFill(tc, 0.4);
                g.lineStyle(1, tc, 0.6);
                g.drawCircle(cx, cy, R);
                g.endFill();
                g.lineStyle(0);
                // 흰색 화살표
                g.beginFill(0xffffff, 0.9);
                switch (dir) {
                    case 2: // 아래
                        g.moveTo(cx, cy + arrSz);
                        g.lineTo(cx - arrSz, cy - arrSz * 0.6);
                        g.lineTo(cx + arrSz, cy - arrSz * 0.6);
                        break;
                    case 4: // 왼쪽
                        g.moveTo(cx - arrSz, cy);
                        g.lineTo(cx + arrSz * 0.6, cy - arrSz);
                        g.lineTo(cx + arrSz * 0.6, cy + arrSz);
                        break;
                    case 6: // 오른쪽
                        g.moveTo(cx + arrSz, cy);
                        g.lineTo(cx - arrSz * 0.6, cy - arrSz);
                        g.lineTo(cx - arrSz * 0.6, cy + arrSz);
                        break;
                    case 8: // 위
                        g.moveTo(cx, cy - arrSz);
                        g.lineTo(cx - arrSz, cy + arrSz * 0.6);
                        g.lineTo(cx + arrSz, cy + arrSz * 0.6);
                        break;
                }
                g.endFill();
            }
        },

        // =================================================================
        //  HUD (턴 오더 바, 유닛 정보)
        // =================================================================
        _drawHUD() {
            const g = this._hudGfx;
            g.clear();
            if (!SM._battleActive) return;
            this._beginTextFrame();
            this._drawTurnOrderBar();
            this._drawUnitInfoPanel(g);
            this._endTextFrame();
        },

        // ═══════════════════════════════════════════════════════════
        // 장판/구름 타일 스프라이트 렌더링 시스템
        // ═══════════════════════════════════════════════════════════

        // 기반타입별 색상 (PIXI hex)
        _FIELD_COLORS: {
            fire:   0xFF4422, water:  0x2288FF, blood:  0x882222,
            poison: 0x44CC22, oil:    0x886622, mud:    0x664422,
            web:    0xCCCCCC, lava:   0xFF6600,
            // 구름
            steam:       0xCCDDFF, firecloud:   0xFF6633, poisoncloud: 0x66DD44,
            smoke:       0x666666, snow:        0xDDEEFF, dust:        0xBBAA77,
            storm:       0x4466AA, bloodcloud:  0x994444,
            explosion:   0xFF8800, frostexplosion: 0x88CCFF,
        },

        // 변형자 테두리/틴트
        _MODIFIER_BORDER: {
            normal:  { color: 0xFFFFFF, alpha: 0.3 },
            blessed: { color: 0xFFDD44, alpha: 0.8 },  // 금빛
            cursed:  { color: 0x9944CC, alpha: 0.8 },   // 보라빛
        },

        // 오버레이 이펙트 색상
        _OVERLAY_FX: {
            electrified: { color: 0xFFFF44, pattern: "spark" },
            frozen:      { color: 0x88DDFF, pattern: "crystal" },
        },

        _updateFieldSprites() {
            if (typeof SrpgField === "undefined") return;

            this._fieldAnimTimer++;
            if (this._fieldAnimTimer >= 8) {
                this._fieldAnimTimer = 0;
                this._fieldAnimFrame = (this._fieldAnimFrame + 1) % 4;
            }

            const tw = $gameMap ? $gameMap.tileWidth() : 48;
            const th = $gameMap ? $gameMap.tileHeight() : 48;

            // ── 장판(Surface) 렌더링 ──
            const activeSurfaceIds = new Set();
            for (const surface of SrpgField._surfaces) {
                activeSurfaceIds.add(surface.id);
                this._renderField(surface, tw, th, this._fieldSurfaceWrap, this._fieldSurfaceSprites, false);
            }
            // 소멸된 장판 정리
            for (const id of Object.keys(this._fieldSurfaceSprites)) {
                if (!activeSurfaceIds.has(id)) {
                    this._removeFieldSprite(id, this._fieldSurfaceSprites, this._fieldSurfaceWrap);
                }
            }

            // ── 구름(Cloud) 렌더링 ──
            const activeCloudIds = new Set();
            for (const cloud of SrpgField._clouds) {
                activeCloudIds.add(cloud.id);
                this._renderField(cloud, tw, th, this._fieldCloudWrap, this._fieldCloudSprites, true);
            }
            for (const id of Object.keys(this._fieldCloudSprites)) {
                if (!activeCloudIds.has(id)) {
                    this._removeFieldSprite(id, this._fieldCloudSprites, this._fieldCloudWrap);
                }
            }
        },

        _renderField(field, tw, th, parentWrap, spriteMap, isCloud) {
            if (!spriteMap[field.id]) {
                spriteMap[field.id] = { gfx: new PIXI.Graphics(), tileCount: 0 };
                parentWrap.addChild(spriteMap[field.id].gfx);
            }
            const entry = spriteMap[field.id];
            const gfx = entry.gfx;
            gfx.clear();
            entry.tileCount = field.tiles.length;

            for (let i = 0; i < field.tiles.length; i++) {
                const tile = field.tiles[i];

                // 화면 좌표 (tilemap 로컬 좌표)
                const px = tile.x * tw;
                const py = tile.y * th;

                // 기본 색상
                const baseColor = this._FIELD_COLORS[field.baseType] || 0x888888;
                const modBorder = this._MODIFIER_BORDER[field.modifier] || this._MODIFIER_BORDER.normal;

                // opacity = duration 비례 (최소 0.15)
                const baseAlpha = isCloud ? 0.35 : 0.45;
                const opacityMul = field.opacity !== undefined ? field.opacity : 1.0;
                const alpha = baseAlpha * opacityMul;

                // 바둑판 패턴: (x+y) 짝수/홀수로 밝기 차이
                const checkerOffset = ((tile.x + tile.y) % 2 === 0) ? 0.08 : 0;

                // ── 메인 타일 ──
                if (isCloud) {
                    // 구름: 부드러운 원형 (타일 중앙)
                    gfx.beginFill(baseColor, alpha + checkerOffset);
                    gfx.drawRoundedRect(px + 2, py + 2, tw - 4, th - 4, 8);
                    gfx.endFill();
                } else {
                    // 장판: 사각 타일 (1px 패딩)
                    gfx.beginFill(baseColor, alpha + checkerOffset);
                    gfx.drawRect(px + 1, py + 1, tw - 2, th - 2);
                    gfx.endFill();
                }

                // ── 오버레이 이펙트 ──
                if (field.overlay && field.overlay !== "none") {
                    const ovFx = this._OVERLAY_FX[field.overlay];
                    if (ovFx) {
                        if (ovFx.pattern === "spark") {
                            // 감전: 번개 라인 (애니메이션)
                            const sparkAlpha = 0.3 + 0.2 * Math.sin(this._fieldAnimFrame * 1.57);
                            gfx.lineStyle(1.5, ovFx.color, sparkAlpha);
                            const cx = px + tw / 2, cy = py + th / 2;
                            const offX = (this._fieldAnimFrame % 2) * 4 - 2;
                            gfx.moveTo(cx - 6 + offX, cy - 8);
                            gfx.lineTo(cx + 2 + offX, cy);
                            gfx.lineTo(cx - 4 + offX, cy);
                            gfx.lineTo(cx + 4 + offX, cy + 8);
                            gfx.lineStyle(0);
                        } else if (ovFx.pattern === "crystal") {
                            // 동결: 결정 패턴 (고정)
                            gfx.lineStyle(1, ovFx.color, 0.4);
                            const cx = px + tw / 2, cy = py + th / 2;
                            for (let a = 0; a < 6; a++) {
                                const rad = a * Math.PI / 3;
                                gfx.moveTo(cx, cy);
                                gfx.lineTo(cx + Math.cos(rad) * 8, cy + Math.sin(rad) * 8);
                            }
                            gfx.lineStyle(0);
                        }
                    }
                }

                // ── 변형자 테두리 ──
                if (field.modifier !== "normal") {
                    gfx.lineStyle(2, modBorder.color, modBorder.alpha * opacityMul);
                    if (isCloud) {
                        gfx.drawRoundedRect(px + 2, py + 2, tw - 4, th - 4, 8);
                    } else {
                        gfx.drawRect(px + 1, py + 1, tw - 2, th - 2);
                    }
                    gfx.lineStyle(0);
                }

                // ── 애니메이션: 타일 내부 파동 (바둑판식 시차) ──
                const animPhase = (this._fieldAnimFrame + (tile.x + tile.y) % 4) % 4;
                const pulseAlpha = 0.05 + 0.03 * animPhase;
                gfx.beginFill(0xFFFFFF, pulseAlpha);
                const inset = 4 + animPhase * 2;
                if (tw > inset * 2 && th > inset * 2) {
                    gfx.drawRect(px + inset, py + inset, tw - inset * 2, th - inset * 2);
                }
                gfx.endFill();
            }

            // 통합 Graphics이므로 타일 단위 정리 불필요
        },

        _removeFieldSprite(fieldId, spriteMap, parentWrap) {
            const entry = spriteMap[fieldId];
            if (!entry) return;
            if (entry.gfx) {
                if (entry.gfx.parent) entry.gfx.parent.removeChild(entry.gfx);
                entry.gfx.destroy();
            }
            delete spriteMap[fieldId];
        },

        _clearFieldSprites() {
            // 장판 정리
            for (const id of Object.keys(this._fieldSurfaceSprites)) {
                this._removeFieldSprite(id, this._fieldSurfaceSprites, this._fieldSurfaceWrap);
            }
            this._fieldSurfaceSprites = {};
            // 구름 정리
            for (const id of Object.keys(this._fieldCloudSprites)) {
                this._removeFieldSprite(id, this._fieldCloudSprites, this._fieldCloudWrap);
            }
            this._fieldCloudSprites = {};
        },

        // ─── 적군 시야 오버레이 (은신 유닛 턴에 표시) ───

        // ─── 배치 페이즈 오버레이 ───
        _deployOverlayWrap: null,
        _deployOverlaySprites: {},
        _deploySelectedSprite: null,

        _updateDeploymentOverlay() {
            const SM = window.SrpgManager || window.SM;
            if (!SM || SM._phase !== "deployment") {
                this._clearDeploymentOverlay();
                return;
            }

            const tilemap = this._tilemap;
            if (!tilemap) return;

            // 컨테이너 생성
            if (!this._deployOverlayWrap) {
                this._deployOverlayWrap = new PIXI.Container();
                this._deployOverlayWrap.zIndex = -1; // 액터 스프라이트 아래
                tilemap.addChild(this._deployOverlayWrap);
            }

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const deployRegion = SM._deployRegion;
            if (!deployRegion) return;

            const PAD = 1, CUT = 3;
            // 배치 가능 타일 하이라이트 (팔각형, 기존 그리드 디자인과 통일)
            const needed = new Set();
            for (const key of deployRegion) {
                needed.add(key);
                if (!this._deployOverlaySprites[key]) {
                    const parts = key.split(",");
                    const tx = Number(parts[0]);
                    const ty = Number(parts[1]);
                    const g = new PIXI.Graphics();
                    g.beginFill(0x4488ff, 0.18);
                    this._drawOctaTile(g, 0, 0, tw, th, PAD, CUT);
                    g.endFill();
                    g.lineStyle(1.5, 0x6699cc, 0.45);
                    this._drawOctaTile(g, 0, 0, tw, th, PAD, CUT);
                    g.lineStyle(0);
                    g.x = tx * tw;
                    g.y = ty * th;
                    this._deployOverlayWrap.addChild(g);
                    this._deployOverlaySprites[key] = g;
                }
            }
            // 불필요한 스프라이트 제거
            for (const key in this._deployOverlaySprites) {
                if (!needed.has(key)) {
                    this._deployOverlayWrap.removeChild(this._deployOverlaySprites[key]);
                    this._deployOverlaySprites[key].destroy();
                    delete this._deployOverlaySprites[key];
                }
            }

            // 선택된 유닛 강조 (노란색 깜빡임 — alpha만 매 프레임 변경)
            if (SM._deployUnits && SM._deploySelectedIdx >= 0) {
                const selUnit = SM._deployUnits[SM._deploySelectedIdx];
                if (selUnit) {
                    if (!this._deploySelectedSprite) {
                        this._deploySelectedSprite = new PIXI.Graphics();
                        this._deploySelectedSprite.beginFill(0xffdd44, 0.45);
                        this._drawOctaTile(this._deploySelectedSprite, 0, 0, tw, th, PAD, CUT);
                        this._deploySelectedSprite.endFill();
                        this._deploySelectedSprite.lineStyle(2, 0xffdd44, 0.75);
                        this._drawOctaTile(this._deploySelectedSprite, 0, 0, tw, th, PAD, CUT);
                        this._deploySelectedSprite.lineStyle(0);
                        this._deployOverlayWrap.addChild(this._deploySelectedSprite);
                    }
                    // alpha만 변경 (Graphics 재생성 없음)
                    this._deploySelectedSprite.alpha = 0.5 + Math.sin(Date.now() / 200) * 0.35;
                    this._deploySelectedSprite.x = selUnit.event.x * tw;
                    this._deploySelectedSprite.y = selUnit.event.y * th;
                    this._deploySelectedSprite.visible = true;
                }
            }

            // 배치 안내 텍스트 (화면 하단)
            // TODO: Phase 10 에서 별도 HUD 창으로 대체
        },

        _clearDeploymentOverlay() {
            if (this._deployOverlayWrap) {
                for (const key in this._deployOverlaySprites) {
                    this._deployOverlaySprites[key].destroy();
                }
                this._deployOverlaySprites = {};
                if (this._deploySelectedSprite) {
                    this._deploySelectedSprite.destroy();
                    this._deploySelectedSprite = null;
                }
                if (this._deployOverlayWrap.parent) {
                    this._deployOverlayWrap.parent.removeChild(this._deployOverlayWrap);
                }
                this._deployOverlayWrap.destroy();
                this._deployOverlayWrap = null;
            }
        },

        _enemyVisionWrap: null,
        _enemyVisionSprites: {},

        _updateEnemyVisionOverlay() {
            const SM = window.SrpgManager;
            if (!SM) return;
            const unit = SM._currentUnit;
            // 은신 중인 유닛의 턴에만 표시
            const shouldShow = unit && unit._hidden && SM._showEnemyVision;
            if (!shouldShow) {
                this._clearEnemyVisionOverlay();
                return;
            }

            // 시야 타일 계산
            if (typeof SrpgVision === "undefined") return;
            const visionTiles = SrpgVision.calcEnemyVisionTiles(unit);

            // 컨테이너 초기화
            if (!this._enemyVisionWrap) {
                const tilemap = SceneManager._scene._spriteset && SceneManager._scene._spriteset._tilemap;
                if (!tilemap) return;
                this._enemyVisionWrap = new PIXI.Container();
                this._enemyVisionWrap.zIndex = 5; // 장판(1)과 구름(6) 사이
                tilemap.addChild(this._enemyVisionWrap);
            }

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const PAD = 1, CUT = 3;
            const used = new Set();

            for (const key of visionTiles) {
                used.add(key);
                if (this._enemyVisionSprites[key]) continue;
                const [sx, sy] = key.split(",").map(Number);
                const g = new PIXI.Graphics();
                g.beginFill(0xFF2222, 0.15);
                this._drawOctaTile(g, 0, 0, tw, th, PAD, CUT);
                g.endFill();
                g.lineStyle(1, 0xFF4444, 0.3);
                this._drawOctaTile(g, 0, 0, tw, th, PAD, CUT);
                g.lineStyle(0);
                g.x = sx * tw;
                g.y = sy * th;
                this._enemyVisionWrap.addChild(g);
                this._enemyVisionSprites[key] = g;
            }

            // 범위 밖 타일 제거
            for (const key of Object.keys(this._enemyVisionSprites)) {
                if (!used.has(key)) {
                    this._enemyVisionWrap.removeChild(this._enemyVisionSprites[key]);
                    this._enemyVisionSprites[key].destroy();
                    delete this._enemyVisionSprites[key];
                }
            }
        },

        _clearEnemyVisionOverlay() {
            if (this._enemyVisionWrap) {
                for (const key of Object.keys(this._enemyVisionSprites)) {
                    this._enemyVisionSprites[key].destroy();
                }
                this._enemyVisionSprites = {};
                if (this._enemyVisionWrap.parent) {
                    this._enemyVisionWrap.parent.removeChild(this._enemyVisionWrap);
                }
                this._enemyVisionWrap.destroy();
                this._enemyVisionWrap = null;
            }
        },


        // ─── 턴오더: 장판/구름 슬롯 (60% 크기, 바 중앙) ───
        _drawFieldTurnSlot(slot, field, index, START_X, BAR_Y, BAR_H, SPACING, SNAP_LEN, CIRC_R, barGfx) {
            const r = Math.round(CIRC_R * 0.6); // 60% 크기
            const sx = START_X + index * SPACING;
            // 장판/구름은 바 중앙에 위치 (아군/적 구분 없음)
            const sy = BAR_Y;
            const baseColor = this._FIELD_COLORS[field.baseType] || 0x888888;
            const modBorder = this._MODIFIER_BORDER[field.modifier] || this._MODIFIER_BORDER.normal;
            const sg = slot.gfx;
            sg.clear();

            // 스냅 연결선 (짧게)
            barGfx.lineStyle(1, baseColor, 0.4);
            barGfx.moveTo(sx, BAR_Y - BAR_H / 2);
            barGfx.lineTo(sx, sy - r);
            barGfx.lineStyle(0);

            // 외곽: 변형자 테두리
            if (field.modifier !== "normal") {
                sg.lineStyle(2, modBorder.color, modBorder.alpha);
            } else {
                sg.lineStyle(1.5, 0xFFFFFF, 0.3);
            }

            // 배경: 기반 색상 원
            sg.beginFill(baseColor, 0.7);
            if (field.isCloud) {
                sg.drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.5); // 구름: 둥근 사각
            } else {
                sg.drawCircle(0, 0, r); // 장판: 원
            }
            sg.endFill();
            sg.lineStyle(0);

            // 오버레이 표시 (작은 점)
            if (field.overlay && field.overlay !== "none") {
                const ovColor = field.overlay === "electrified" ? 0xFFFF44 : 0x88DDFF;
                sg.beginFill(ovColor, 0.8);
                sg.drawCircle(r * 0.5, -r * 0.5, 3);
                sg.endFill();
            }

            // duration 텍스트는 생략 (슬롯이 작아서 가독성 문제)

            slot.sprite.texture = PIXI.Texture.EMPTY; // 초상화 없음
            slot.container.x = sx;
            slot.container.y = sy;
            slot.container.alpha = 0.85;
        },

        // ─── 턴 오더 바 (얇은 바 + 화살표 애니메이션 + 초상화 위/아래) ───
        _drawTurnOrderBar() {
            const tg = this._toGfx;
            tg.clear();
            if (!SM._predictedTurns || SM._predictedTurns.length === 0) return;

            const screenW = Graphics.width;
            const rs = RS();
            const MARGIN = Math.round(20 * rs);
            const R_MARGIN = Math.round(60 * rs);
            const BAR_Y = Math.round(50 * rs);
            const BAR_H = Math.round(6 * rs);
            const BAR_L = MARGIN;
            const BAR_R = screenW - R_MARGIN;
            const BAR_W = BAR_R - BAR_L;
            const CIRC_R_CUR = Math.round(18 * rs);
            const CIRC_R = Math.round(14 * rs);
            const SPACING = Math.round(48 * rs);
            const START_X = MARGIN + Math.round(30 * rs);
            const SNAP_LEN = Math.round(6 * rs);

            // ─ 바 외곽선 + 내부 ─
            tg.lineStyle(1.5, C.panelBorder, 0.7);
            tg.beginFill(C.panelBg, 0.6);
            tg.drawRoundedRect(BAR_L, BAR_Y - BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);
            tg.endFill();
            tg.lineStyle(0);

            // ─ 애니메이션 화살표 패턴 (바 내부, 오른쪽으로 흐름) ─
            const offset = (this._toAnimOffset * 40) % 20;
            const clipY1 = BAR_Y - BAR_H / 2 + 1;
            const clipY2 = BAR_Y + BAR_H / 2 - 1;
            for (let cx = BAR_L + offset; cx < BAR_R; cx += 20) {
                const alpha = 0.2 + 0.15 * Math.sin((cx - BAR_L) / BAR_W * Math.PI);
                tg.lineStyle(1, 0xFFFFFF, alpha);
                tg.moveTo(cx, clipY1); tg.lineTo(cx + 6, BAR_Y); tg.lineTo(cx, clipY2);
                tg.lineStyle(0);
            }
            // 화살표 머리 (바 우측 끝)
            const headSz = 6;
            tg.beginFill(0xFFFFFF, 0.45);
            tg.moveTo(BAR_R + headSz + 2, BAR_Y);
            tg.lineTo(BAR_R - 2, BAR_Y - headSz);
            tg.lineTo(BAR_R - 2, BAR_Y + headSz);
            tg.endFill();

            // ─ 턴 원형 슬롯 ─
            const turns = SM._predictedTurns.slice(0, TURN_PREDICT_COUNT);
            const currentUnit = SM._currentUnit;
            // 슬롯 개수 조정
            while (this._toSlots.length < turns.length) {
                const cont = new PIXI.Container();
                const gfx = new PIXI.Graphics();
                cont.addChild(gfx);
                const spr = new PIXI.Sprite();
                spr.anchor.set(0.5, 0.5);
                cont.addChild(spr);
                const mask = new PIXI.Graphics();
                cont.addChild(mask);
                spr.mask = mask;
                this._toContainer.addChild(cont);
                this._toSlots.push({ container: cont, gfx, sprite: spr, mask, _loadedKey: "" });
            }
            for (let i = turns.length; i < this._toSlots.length; i++) {
                this._toSlots[i].container.visible = false;
                this._toSlots[i].container.alpha = 1.0; // alpha 잔류 방지
            }

            // 현재 페이즈 살아있는 유닛 수 (finished 포함) → 이 범위까지가 "현재 페이즈"
            const phaseAliveCount = (SM._phaseUnits && SM._phaseUnits.length > 0)
                ? SM._phaseUnits.filter(u => u.isAlive()).length : 0;

            // ─ 각 턴 슬롯 렌더링 ─
            for (let i = 0; i < turns.length; i++) {
                const unit = turns[i];
                if (!unit) continue;
                const slot = this._toSlots[i];
                slot.container.visible = true;

                // ── 장판/구름 슬롯 분기 ──
                const isField = (unit.isSurface || unit.isCloud);
                if (isField) {
                    this._drawFieldTurnSlot(slot, unit, i, START_X, BAR_Y, BAR_H, SPACING, SNAP_LEN, CIRC_R, tg);
                    continue;
                }

                const isCurrent = (unit === currentUnit) ||
                    (i === 0 && !currentUnit && SM._phase === "playerTurn" && SM._subPhase === "browse" &&
                     SM._phaseUnits && SM._phaseUnits.includes(unit) && !SM._finishedUnits.includes(unit));
                const r = isCurrent ? CIRC_R_CUR : CIRC_R;
                const sx = START_X + i * SPACING;
                const isAlly = (unit.team === "actor");
                // 아군: 바 위쪽, 적: 바 아래쪽
                const sy = isAlly ? (BAR_Y - BAR_H / 2 - SNAP_LEN - r)
                                  : (BAR_Y + BAR_H / 2 + SNAP_LEN + r);
                const tc = unit.teamColor().fill;
                const sg = slot.gfx;
                sg.clear();

                // 스냅 연결선 (원↔바)
                const lineTopY = isAlly ? r : -r;
                const lineEndY = isAlly ? (r + SNAP_LEN) : -(r + SNAP_LEN);
                tg.lineStyle(1.5, tc, 0.5);
                tg.moveTo(sx, isAlly ? (BAR_Y - BAR_H / 2) : (BAR_Y + BAR_H / 2));
                tg.lineTo(sx, isAlly ? (sy + r) : (sy - r));
                tg.lineStyle(0);

                // 외곽 글로우 (현재 턴: 골드)
                if (isCurrent) {
                    sg.lineStyle(3, C.currentTurnGlow, 0.8);
                    sg.beginFill(tc, 0.2);
                    sg.drawCircle(0, 0, r + 3);
                    sg.endFill();
                    sg.lineStyle(0);
                }
                // 팀색 테두리 + 어두운 배경
                sg.lineStyle(2, tc, 0.85);
                sg.beginFill(C.panelBg, 0.9);
                sg.drawCircle(0, 0, r);
                sg.endFill();
                sg.lineStyle(0);

                // 원형 마스크
                slot.mask.clear();
                slot.mask.beginFill(0xffffff);
                slot.mask.drawCircle(0, 0, r - 2);
                slot.mask.endFill();

                // 초상화 로드
                this._loadTurnPortrait(slot, unit, r);

                // 위치 설정
                slot.container.x = sx;
                slot.container.y = sy;

                // 행동 완료 유닛 어둡게, 미래 예측 유닛 약간 투명
                // i < phaseAliveCount → 현재 페이즈 슬롯 (finished 판정 가능)
                // i >= phaseAliveCount → 미래 예측 슬롯 (finished 판정 불가)
                if (i < phaseAliveCount) {
                    const finished = SM._finishedUnits && SM._finishedUnits.includes(unit);
                    slot.container.alpha = finished ? 0.35 : 1.0;
                } else if (phaseAliveCount > 0) {
                    slot.container.alpha = 0.6; // 미래 예측 슬롯
                } else {
                    slot.container.alpha = 1.0;
                }
            }

            // ─ 페이즈 경계선 (현재 페이즈 ↔ 미래 예측 구분) ─
            if (phaseAliveCount > 0 && phaseAliveCount < turns.length) {
                const divX = START_X + phaseAliveCount * SPACING - SPACING / 2;
                tg.lineStyle(1.5, 0xffffff, 0.3);
                const divH = Math.round(25 * rs);
                tg.moveTo(divX, BAR_Y - divH);
                tg.lineTo(divX, BAR_Y + divH);
                tg.lineStyle(0);
            }
        },

        // ─── 턴오더 초상화 로드 ───
        _loadTurnPortrait(slot, unit, radius) {
            const key = (unit.team || "") + "_" + (unit.actorId || unit.enemyId || 0);
            if (slot._loadedKey === key && slot.sprite.texture !== PIXI.Texture.EMPTY) return;
            slot._loadedKey = key;

            // 캐시 확인
            if (this._toPortraitCache[key]) {
                slot.sprite.texture = this._toPortraitCache[key];
                this._fitSpriteToCircle(slot.sprite, radius);
                return;
            }

            const name = unit.currentPortraitName();
            if (!name) {
                // 이름이 없으면 컬러 원으로 대체
                slot.sprite.texture = PIXI.Texture.EMPTY;
                const sg = slot.gfx;
                sg.beginFill(unit.teamColor().fill, 0.4);
                sg.drawCircle(0, 0, radius - 2);
                sg.endFill();
                return;
            }
            const bmp = unit.loadPortraitBitmap(name);
            if (!bmp) return;
            const isSV = (unit._portraitSource === "sv_actor");
            const self = this;

            bmp.addLoadListener(() => {
                let tex;
                if (isSV) {
                    const canvas = document.createElement("canvas");
                    canvas.width = 64; canvas.height = 64;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(bmp._canvas || bmp._image, 0, 0, 64, 64, 0, 0, 64, 64);
                    tex = PIXI.Texture.from(canvas);
                } else {
                    tex = bmp._canvas
                        ? PIXI.Texture.from(bmp._canvas)
                        : PIXI.Texture.from(bmp._image);
                }
                self._toPortraitCache[key] = tex;
                slot.sprite.texture = tex;
                self._fitSpriteToCircle(slot.sprite, radius);
            });
        },

        _fitSpriteToCircle(spr, radius) {
            const d = radius * 2;
            const tw = spr.texture.width || 1;
            const th = spr.texture.height || 1;
            const sc = Math.max(d / tw, d / th);
            spr.scale.set(sc, sc);
        },

        // ─── 유닛 정보 패널 (좌하단) ───
        _drawUnitInfoPanel(g) {
            // 브라우즈 모드에서는 호버 유닛 정보 표시
            const unit = SM._browseUnit || SM._currentUnit;
            if (!unit) return;
            const rs = RS();
            const px = Math.round(10 * rs);
            const py = Graphics.height - Math.round(100 * rs);
            const pw = Math.round(220 * rs), ph = Math.round(90 * rs);

            g.beginFill(C.panelBg, 0.8);
            g.lineStyle(1, C.panelBorder, 0.6);
            g.drawRoundedRect(px, py, pw, ph, 4);
            g.endFill();
            g.lineStyle(0);

            // 유닛 이름
            const dName = unit._data ? (unit._data.name || "???") : "???";
            const nt = this._getText("info_name", dName, _TS.hud);
            if (nt) { nt.x = px + 10; nt.y = py + 6; }

            // HP 바 + 수치
            const hpRatio = Math.max(0, unit.hp / unit.mhp);
            const barW = pw - 20, barH = 8, barY = py + 30;
            g.beginFill(0x333333, 0.8);
            g.drawRect(px + 10, barY, barW, barH);
            g.endFill();
            g.beginFill(hpRatio > 0.5 ? C.hpColor : (hpRatio > 0.25 ? 0xcccc44 : 0xcc4444), 0.9);
            g.drawRect(px + 10, barY, barW * hpRatio, barH);
            g.endFill();
            const hpTxt = this._getText("info_hp", `HP ${unit.hp}/${unit.mhp}`, _TS.hudSm);
            if (hpTxt) { hpTxt.x = px + 10; hpTxt.y = barY + barH + 2; }

            // MP 바
            if (unit.mmp > 0) {
                const mpRatio = Math.max(0, unit.mp / unit.mmp);
                const mpY = barY + barH + 18;
                g.beginFill(0x333333, 0.8);
                g.drawRect(px + 10, mpY, barW, barH);
                g.endFill();
                g.beginFill(C.mpColor, 0.9);
                g.drawRect(px + 10, mpY, barW * mpRatio, barH);
                g.endFill();
                const mpTxt = this._getText("info_mp", `MP ${unit.mp}/${unit.mmp}`, _TS.hudSm);
                if (mpTxt) { mpTxt.x = px + 10; mpTxt.y = mpY + barH + 2; }
            }

            // 행동 상태 표시
            const actY = py + ph - 16;
            const mainClr = unit.mainAction > 0 ? "#ffcc00" : "#555555";
            const bonusClr = unit.bonusAction > 0 ? "#66ddff" : "#555555";
            const actTxt = this._getText("info_act", "●주행동  ●보조", {
                fontFamily: "sans-serif", fontSize: 10, fill: "#aaaaaa",
                stroke: "#000000", strokeThickness: 1
            });
            if (actTxt) { actTxt.x = px + 10; actTxt.y = actY; }

            // ─── 인접 궁합 시너지 보너스 표시 ───
            if (unit.isActor() && unit.actorId > 0 &&
                typeof SM._calcAdjacencyBonus === 'function') {
                const synBonus = SM._calcAdjacencyBonus(unit);
                if (synBonus !== 0) {
                    const synSign = synBonus > 0 ? "+" : "";
                    const synColor = synBonus > 0 ? "#66ff88" : "#ff6666";
                    const synLabel = "궁합 " + synSign + synBonus;
                    const synTxt = this._getText("info_syn", synLabel, {
                        fontFamily: "sans-serif", fontSize: 10, fill: synColor,
                        stroke: "#000000", strokeThickness: 2
                    });
                    if (synTxt) {
                        synTxt.x = px + pw - 70;
                        synTxt.y = actY;
                    }
                } else {
                    // 보너스 없으면 텍스트 숨김
                    const synTxt = this._getText("info_syn", "", _TS.hudSm);
                    if (synTxt) synTxt.text = "";
                }
            }
        },

        // =================================================================
        //  메뉴 (행동 선택 UI) — 텍스트 포함
        // =================================================================
        // =================================================================
        //  라디얼 파이 메뉴 그리기 (Sims 4 스타일)
        // =================================================================
        _drawRadialMenu(g) {
            const items = SM._radialItems;
            if (!items || items.length === 0) return;
            const cx = SM._radialCenter.x;
            const cy = SM._radialCenter.y;
            const R = SM._radialRadius || 95;
            const n = items.length;
            const arcSize = (360 / n) * Math.PI / 180; // 라디안
            const gap = 0.06; // 아크 사이 간격 (라디안)
            const innerR = SM._radialInnerR || 55;

            // 팝인 애니메이션 스케일
            const animT = Math.min((SM._radialAnimFrame || 0) / 10, 1);
            const scale = 0.3 + 0.7 * (1 - Math.pow(1 - animT, 3)); // ease-out cubic

            for (let i = 0; i < n; i++) {
                const item = items[i];
                if (item.dummy) continue;  // 더미 버튼은 렌더링 스킵
                const centerAngle = item.angle * Math.PI / 180;
                const startA = centerAngle - arcSize / 2 + gap / 2;
                const endA = centerAngle + arcSize / 2 - gap / 2;
                const isHover = (i === SM._radialHover);
                const curR = R * scale;
                const curInner = innerR * scale;

                // 색상 결정 — 호버 시 accent 색상, 기본은 통일 색조
                let fillColor = item.color || 0x2a3a5c;
                let alpha = item.enabled ? 0.65 : 0.35;
                let borderColor = 0x667799;
                let borderAlpha = 0.4;
                if (isHover && item.enabled) {
                    fillColor = item.accent || this._brightenColor(fillColor, 0.25);
                    alpha = 0.80;
                    borderColor = 0xccddff;
                    borderAlpha = 0.8;
                }

                // 아크 세그먼트 그리기
                g.beginFill(fillColor, alpha);
                g.lineStyle(isHover ? 2 : 1, borderColor, borderAlpha);

                // 외호
                g.moveTo(cx + Math.cos(startA) * curInner, cy + Math.sin(startA) * curInner);
                g.lineTo(cx + Math.cos(startA) * curR, cy + Math.sin(startA) * curR);
                g.arc(cx, cy, curR, startA, endA);
                g.lineTo(cx + Math.cos(endA) * curInner, cy + Math.sin(endA) * curInner);
                g.arc(cx, cy, curInner, endA, startA, true);
                g.closePath();
                g.endFill();
                g.lineStyle(0);

                // 라벨 텍스트
                const labelAngle = centerAngle;
                const labelR = (curR + curInner) / 2;
                const lx = cx + Math.cos(labelAngle) * labelR;
                const ly = cy + Math.sin(labelAngle) * labelR;

                const txtColor = item.enabled
                    ? (isHover ? "#ffff88" : "#ffffff")
                    : "#666666";
                const txt = new PIXI.Text(item.label, new PIXI.TextStyle({
                    fontFamily: "sans-serif",
                    fontSize: isHover ? 13 : 11,
                    fill: txtColor,
                    stroke: "#000000",
                    strokeThickness: 2,
                    align: "center"
                }));
                txt.anchor.set(0.5, 0.5);
                txt.x = lx;
                txt.y = ly;
                if (animT < 1) txt.alpha = animT;
                this._menuTextWrap.addChild(txt);
            }
        },

        // 색상 밝기 조절 유틸리티
        _brightenColor(color, amount) {
            const r = Math.min(255, ((color >> 16) & 0xff) + Math.floor(255 * amount));
            const g = Math.min(255, ((color >> 8) & 0xff) + Math.floor(255 * amount));
            const b = Math.min(255, (color & 0xff) + Math.floor(255 * amount));
            return (r << 16) | (g << 8) | b;
        },

        // =================================================================
        //  슬롯머신 릴 UI 그리기
        // =================================================================
        _drawSlotReel(g) {
            const items = SM._reelItems;
            if (!items || items.length === 0) return;
            const n = items.length;
            const cx = SM._radialCenter.x;
            const cy = SM._radialCenter.y;

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;
            const screenCX = cx - scrollX;

            // 팝인 애니메이션
            const animT = Math.min((SM._radialAnimFrame || 0) / 10, 1);
            const slideIn = 0.3 + 0.7 * (1 - Math.pow(1 - animT, 3));

            // 릴 위치 (캐릭터 우측 또는 좌측)
            const rs = RS();
            const reelW = Math.round(180 * rs);
            const visibleCount = 7;
            const itemH = Math.round(36 * rs);
            // 항목 수가 적으면 릴 높이 축소
            const actualVisible = Math.min(visibleCount, n);
            const reelPad = Math.round(50 * rs);
            const reelH = actualVisible * itemH + reelPad;
            const reelOnRight = screenCX < Graphics.width / 2;
            const baseReelX = reelOnRight ? cx + reelPad : cx - reelPad - reelW;
            const reelX = reelOnRight
                ? cx + reelPad * slideIn
                : cx - (reelPad + reelW) * slideIn;
            const reelY = cy - reelH / 2;

            // 배경 패널
            g.beginFill(C.menuBg || 0x1a1a2e, 0.92 * slideIn);
            g.lineStyle(1, C.panelBorder || 0x4444aa, 0.7);
            g.drawRoundedRect(reelX, reelY, reelW, reelH, 8);
            g.endFill();
            g.lineStyle(0);

            // 중앙 하이라이트
            const centerY = cy - itemH / 2;
            g.beginFill(C.menuHighlight || 0x3355aa, 0.6);
            g.lineStyle(1, 0xffffff, 0.5);
            g.drawRoundedRect(reelX + 4, centerY, reelW - 8, itemH, 4);
            g.endFill();
            g.lineStyle(0);

            // 아이템 그리기 (중앙 + 위아래 3개씩, 항목 적으면 범위 축소)
            const scrollY2 = SM._reelScrollY;
            const halfVisible = Math.floor(visibleCount / 2);
            // 항목 수가 보이는 수보다 적으면 중복 없이 실제 항목만 표시
            const halfShow = n > visibleCount ? halfVisible : Math.floor((n - 1) / 2);
            const drawnIndices = new Set();

            for (let offset = -halfShow; offset <= halfShow; offset++) {
                const rawIdx = Math.round(scrollY2) + offset;
                const idx = ((rawIdx % n) + n) % n;
                // 이미 그린 인덱스면 스킵 (소수 항목 중복 방지)
                if (drawnIndices.has(idx)) continue;
                drawnIndices.add(idx);
                const item = items[idx];

                // 부드러운 스크롤 오프셋
                const fracOffset = offset - (scrollY2 - Math.round(scrollY2));
                const iy = cy + fracOffset * itemH - itemH / 2;

                // 릴 영역 밖이면 스킵
                if (iy + itemH < reelY || iy > reelY + reelH) continue;

                // 거리에 따른 크기/투명도
                const distFromCenter = Math.abs(fracOffset);
                const sizeScale = Math.max(0.6, 1 - distFromCenter * 0.12);
                const alphaScale = Math.max(0.2, 1 - distFromCenter * 0.2) * slideIn;

                // 비활성 오버레이
                if (!item.enabled) {
                    g.beginFill(0x111111, 0.4 * alphaScale);
                    g.drawRoundedRect(reelX + 6, iy + 2, reelW - 12, itemH - 4, 3);
                    g.endFill();
                }

                // 라벨
                const isCenter = (Math.abs(fracOffset) < 0.5);
                const txtColor = !item.enabled ? "#555555"
                    : isCenter ? "#ffff88" : "#cccccc";
                const fontSize = Math.round(13 * sizeScale);
                const txt = new PIXI.Text(item.label || "???", new PIXI.TextStyle({
                    fontFamily: "sans-serif",
                    fontSize: fontSize,
                    fill: txtColor,
                    stroke: "#000000",
                    strokeThickness: 2
                }));
                txt.x = reelX + 14;
                txt.y = iy + (itemH - fontSize) / 2;
                txt.alpha = alphaScale;
                this._menuTextWrap.addChild(txt);

                // MP 비용
                if (item.mpCost > 0) {
                    const costTxt = new PIXI.Text(`MP${item.mpCost}`, new PIXI.TextStyle({
                        fontFamily: "sans-serif",
                        fontSize: Math.round(10 * sizeScale),
                        fill: item.enabled ? "#88aaff" : "#444466",
                        stroke: "#000000",
                        strokeThickness: 1
                    }));
                    costTxt.x = reelX + reelW - reelPad;
                    costTxt.y = iy + (itemH - 10) / 2;
                    costTxt.alpha = alphaScale;
                    this._menuTextWrap.addChild(costTxt);
                }
            }

            // 상단/하단 페이드 그라데이션 (릴 경계 마스킹 효과)
            const fadeH = 30;
            const bgColor = C.menuBg || 0x1a1a2e;
            // 상단
            g.beginFill(bgColor, 0.9);
            g.drawRect(reelX, reelY, reelW, fadeH);
            g.endFill();
            // 하단
            g.beginFill(bgColor, 0.9);
            g.drawRect(reelX, reelY + reelH - fadeH, reelW, fadeH);
            g.endFill();

            // 카테고리 제목
            let title = "";
            if (SM._reelParentId === "mainAction") title = "주요 행동";
            else if (SM._reelParentId === "bonusAction") title = "보조 행동";
            const titleTxt = new PIXI.Text(title, new PIXI.TextStyle({
                fontFamily: "sans-serif",
                fontSize: 11,
                fill: "#aabbdd",
                stroke: "#000000",
                strokeThickness: 2
            }));
            titleTxt.x = reelX + 10;
            titleTxt.y = reelY + 6;
            titleTxt.alpha = slideIn;
            this._menuTextWrap.addChild(titleTxt);

            // 스크롤 인디케이터 (위/아래 화살표)
            if (n > visibleCount) {
                const arrowColor = 0xaaaacc;
                // 위 화살표
                g.beginFill(arrowColor, 0.6 * slideIn);
                const atx = reelX + reelW / 2;
                g.moveTo(atx - 6, reelY + fadeH - 2);
                g.lineTo(atx + 6, reelY + fadeH - 2);
                g.lineTo(atx, reelY + fadeH - 10);
                g.closePath();
                g.endFill();
                // 아래 화살표
                g.beginFill(arrowColor, 0.6 * slideIn);
                const aby = reelY + reelH - fadeH + 2;
                g.moveTo(atx - 6, aby);
                g.lineTo(atx + 6, aby);
                g.lineTo(atx, aby + 8);
                g.closePath();
                g.endFill();
            }
        },

        // =================================================================
        //  투사체 예상 경로 프리뷰 (전투 프리뷰 시 표시)
        // =================================================================
        _drawProjectilePathPreview(g) {
            const atk = SM._currentUnit;
            const def = SM._selectedTarget;
            const pred = SM._combatPrediction;
            if (!atk || !def || !pred) return;

            // 투사체 메타 확인
            const skillId = SM._pendingSkill ? SM._pendingSkill.id : 0;
            const projMeta = skillId ? SrpgProjectile.parseSkillMeta(skillId) : null;
            if (!projMeta) return; // 투사체 스킬이 아니면 경로 표시 안 함

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            // 시작/끝 픽셀 좌표 (타일 중심) — 맵픽셀 좌표 (컨테이너 오프셋이 스크롤 처리)
            const ax = atk.x * tw + tw / 2;
            const ay = atk.y * th + th / 2;
            const dx = def.x * tw + tw / 2;
            const dy = def.y * th + th / 2;

            const isBlocked = pred.blocked;
            const isArtillery = projMeta.type === "artillery";

            // 경로 타일 (Bresenham)
            const pathTiles = SrpgGrid.traceLine(atk.x, atk.y, def.x, def.y);

            // 차단 지점 찾기
            let blockTile = null;
            if (isBlocked) {
                const fireMode = SrpgCombat.resolveFireMode(atk, skillId);
                for (const pt of pathTiles) {
                    if (SrpgGrid.doesTileBlock(pt.x, pt.y, fireMode)) {
                        blockTile = pt; break;
                    }
                    // 오브젝트 차단 확인
                    if (fireMode === FIRE_MODE.DIRECT) {
                        const blocker = SM._units.find(u =>
                            u.isObject && u.isAlive() && u.x === pt.x && u.y === pt.y);
                        if (blocker) { blockTile = pt; break; }
                    }
                }
            }

            if (isArtillery) {
                // ── 곡선 경로 (포물선) ──
                const lineColor = isBlocked ? 0xff4444 : 0x44ff66;
                const lineAlpha = isBlocked ? 0.5 : 0.6;
                // 45도 기반 동적 arcHeight (수평 픽셀거리 * 0.5)
                const hDist = Math.sqrt((dx - ax) ** 2 + (dy - ay) ** 2);
                const arcHeight = projMeta.arcHeight > 0 ? projMeta.arcHeight : hDist * 0.5;
                const steps = 24;

                g.lineStyle(2.5, lineColor, lineAlpha);
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const px = ax + (dx - ax) * t;
                    // 포물선: y = baseY - 4*h*t*(1-t)
                    const baseY = ay + (dy - ay) * t;
                    const arcY = -4 * (arcHeight * 0.3) * t * (1 - t); // 미리보기는 축소 스케일
                    const py = baseY + arcY;
                    if (i === 0) g.moveTo(px, py);
                    else g.lineTo(px, py);
                }
                g.lineStyle(0);

                // 착탄 예상 지점 원형 표시
                if (!isBlocked) {
                    g.lineStyle(1.5, 0xff6644, 0.5);
                    g.beginFill(0xff6644, 0.15);
                    g.drawCircle(dx, dy, tw * 0.4);
                    g.endFill();
                    g.lineStyle(0);
                }
            } else {
                // ── 직선 경로 (타일 단위 점선) ──
                const lineColor = isBlocked ? 0xff4444 : 0x44ff66;
                const lineAlpha = isBlocked ? 0.5 : 0.6;

                // 경로 타일 하이라이트
                for (const pt of pathTiles) {
                    if (blockTile && pt.x === blockTile.x && pt.y === blockTile.y) break;
                    const px = pt.x * tw;
                    const py = pt.y * th;
                    g.beginFill(lineColor, 0.12);
                    g.drawRect(px + 4, py + 4, tw - 8, th - 8);
                    g.endFill();
                }

                // 직선 화살표
                g.lineStyle(2, lineColor, lineAlpha);
                if (blockTile) {
                    const bx = blockTile.x * tw + tw / 2;
                    const by = blockTile.y * th + th / 2;
                    g.moveTo(ax, ay);
                    g.lineTo(bx, by);
                } else {
                    g.moveTo(ax, ay);
                    g.lineTo(dx, dy);
                }
                g.lineStyle(0);

                // 화살촉 (삼각형)
                const endX = blockTile ? (blockTile.x * tw + tw / 2) : dx;
                const endY = blockTile ? (blockTile.y * th + th / 2) : dy;
                const angle = Math.atan2(endY - ay, endX - ax);
                const arrLen = 8;
                g.beginFill(lineColor, lineAlpha);
                g.moveTo(endX, endY);
                g.lineTo(endX - Math.cos(angle - 0.4) * arrLen,
                         endY - Math.sin(angle - 0.4) * arrLen);
                g.lineTo(endX - Math.cos(angle + 0.4) * arrLen,
                         endY - Math.sin(angle + 0.4) * arrLen);
                g.closePath();
                g.endFill();
            }

            // ── 차단 시 X 표시 ──
            if (isBlocked && blockTile) {
                const bx = blockTile.x * tw + tw / 2;
                const by = blockTile.y * th + th / 2;
                const sz = tw * 0.3;
                g.lineStyle(3, 0xff2222, 0.85);
                g.moveTo(bx - sz, by - sz); g.lineTo(bx + sz, by + sz);
                g.moveTo(bx + sz, by - sz); g.lineTo(bx - sz, by + sz);
                g.lineStyle(0);
            }
        },

        // =================================================================
        //  전투 프리뷰 — 텍스트 포함
        // =================================================================
        _drawCombatPreview(g) {
            // 전투 프리뷰 모달 비활성화 — HP/MP 바 위에 직접 표시
            // 확인/취소 버튼만 대상 유닛 근처에 작게 표시
            if (!SM._combatPrediction) return;
            const def = SM._selectedTarget;
            if (!def || !def.event) return;

            // ── 투사체 예상 경로 오버레이 ──
            this._drawProjectilePathPreview(g);

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            // screenX/Y는 스크롤 보정된 화면좌표이므로, 컨테이너 오프셋 적용 후
            // 맵픽셀 좌표로 변환 (scrollOffset을 다시 더함)
            const _scrollOX = $gameMap.displayX() * tw;
            const _scrollOY = $gameMap.displayY() * th;
            const sx = def.event.screenX() + _scrollOX;
            const sy = def.event.screenY() - th - 30 + _scrollOY; // 바 위쪽

            const rs = RS();
            const btnW = Math.round(50 * rs), btnH = Math.round(22 * rs);
            const confirmX = sx - btnW - 4;
            const cancelX = sx + 4;
            const btnY = sy - btnH - 4;

            // 확인 버튼
            g.beginFill(SM._pvHoverConfirm ? 0x44aa44 : 0x336633, 0.88);
            g.lineStyle(1, 0x55cc55, 0.6);
            g.drawRoundedRect(confirmX, btnY, btnW, btnH, 3); g.endFill();
            g.lineStyle(0);
            // 취소 버튼
            g.beginFill(SM._pvHoverCancel ? 0xaa4444 : 0x663333, 0.88);
            g.lineStyle(1, 0xcc5555, 0.6);
            g.drawRoundedRect(cancelX, btnY, btnW, btnH, 3); g.endFill();
            g.lineStyle(0);

            // 버튼 텍스트
            const cTxt = new PIXI.Text("확인", new PIXI.TextStyle(_TS.pvBtn));
            cTxt.x = confirmX + (btnW - 26) / 2; cTxt.y = btnY + 3;
            this._menuTextWrap.addChild(cTxt);
            const xTxt = new PIXI.Text("취소", new PIXI.TextStyle(_TS.pvBtn));
            xTxt.x = cancelX + (btnW - 26) / 2; xTxt.y = btnY + 3;
            this._menuTextWrap.addChild(xTxt);

            // 버튼 영역을 SM에 캐시 (입력 처리용)
            SM._pvBtnArea = { confirmX, cancelX, btnY, btnW, btnH };
        },

        // ─── 방향 전환 화살표 ───
        _drawFaceDirectionArrows(g) {
            const unit = SM._currentUnit;
            if (!unit) return;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const cx = unit.x * tw + tw / 2;
            const cy = unit.y * th + th / 2;
            const dirs = [
                { dir: 2, dx: 0, dy: 1 }, { dir: 4, dx: -1, dy: 0 },
                { dir: 6, dx: 1, dy: 0 }, { dir: 8, dx: 0, dy: -1 },
            ];
            const tick = SM._faceDirTick || 0;
            const glowPulse = 0.5 + Math.sin(tick * 0.08) * 0.15;
            for (const d of dirs) {
                const ax = cx + d.dx * tw;
                const ay = cy + d.dy * th;
                const isHover = (SM._faceDirHover === d.dir);
                const tc = unit.teamColor().fill;
                if (isHover) {
                    g.beginFill(tc, 0.35 * glowPulse * 2);
                    g.drawCircle(ax, ay, tw * 0.35);
                    g.endFill();
                    g.lineStyle(2, tc, 0.8);
                } else {
                    g.lineStyle(1, 0xcccccc, 0.5);
                }
                const sz = 8;
                switch (d.dir) {
                    case 2: g.moveTo(ax, ay+sz); g.lineTo(ax-sz, ay-sz/2); g.lineTo(ax+sz, ay-sz/2); break;
                    case 4: g.moveTo(ax-sz, ay); g.lineTo(ax+sz/2, ay-sz); g.lineTo(ax+sz/2, ay+sz); break;
                    case 6: g.moveTo(ax+sz, ay); g.lineTo(ax-sz/2, ay-sz); g.lineTo(ax-sz/2, ay+sz); break;
                    case 8: g.moveTo(ax, ay-sz); g.lineTo(ax-sz, ay+sz/2); g.lineTo(ax+sz, ay+sz/2); break;
                }
                g.lineStyle(0);
            }
        },

        // ─── 적 행동 메시지 ───
        _drawEnemyActionMsg(g) {
            if (!SM._enemyActionMsg) return;
            const msg = SM._enemyActionMsg;
            const rs = RS();
            const msgW = Math.round(260 * rs), msgH = Math.round(34 * rs);
            const mx = (Graphics.width - msgW) / 2, my = Math.round(60 * rs);
            g.beginFill(0x331111, 0.85);
            g.lineStyle(1, 0x663333, 0.5);
            g.drawRoundedRect(mx, my, msgW, msgH, 4);
            g.endFill(); g.lineStyle(0);
            const txt = new PIXI.Text(msg, new PIXI.TextStyle(_TS.enemy));
            txt.x = mx + (msgW - txt.width) / 2; txt.y = my + 8;
            this._menuTextWrap.addChild(txt);
        },

        // ─── 배너 (라운드 시작 등) ───
        _drawBanner(g) {
            const rs = RS();
            const bw = Math.round(320 * rs), bh = Math.round(54 * rs);
            // 컨테이너 오프셋 보정: 화면 중앙 → 맵픽셀 좌표로 변환
            const _ox = $gameMap.displayX() * $gameMap.tileWidth();
            const _oy = $gameMap.displayY() * $gameMap.tileHeight();
            const bx = (Graphics.width - bw) / 2 + _ox, by = (Graphics.height - bh) / 2 + _oy;
            const alpha = Math.min(1, SM._bannerTimer / 15);
            g.beginFill(C.panelBg, 0.88 * alpha);
            g.lineStyle(2, C.currentTurnGlow, 0.6 * alpha);
            g.drawRoundedRect(bx, by, bw, bh, 10);
            g.endFill(); g.lineStyle(0);
            // 배너 텍스트
            const text = SM._bannerText || "";
            if (text) {
                const bt = new PIXI.Text(text, new PIXI.TextStyle(_TS.banner));
                bt.alpha = alpha;
                bt.x = bx + (bw - bt.width) / 2;
                bt.y = by + (bh - bt.height) / 2;
                this._menuTextWrap.addChild(bt);
            }
        },

        // ─── 데미지 팝업 ───
        _updatePopups() {
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
        },
    }; // ── SrpgUI 끝 ──

    // =========================================================================
    //  Sprite_Character 확장 — 초상화 모드 렌더링
    // =========================================================================
    const _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);
        if (!this._character || !SM._battleActive) {
            // 전투 종료 시 alpha 원상복귀
            if (this.alpha !== 1.0) this.alpha = 1.0;
            if (this._srpgPActive) this._srpgPCleanup();
            return;
        }
        const unit = SM.unitByEvent(this._character);
        if (!unit || !unit.isAlive()) {
            if (this.alpha !== 1.0) this.alpha = 1.0;
            if (this._srpgPActive) this._srpgPCleanup();
            return;
        }

        // ── 투명도: 턴 종료 유닛 0.75, 그 외 1.0 (피/아 무관, 매 프레임 적용) ──
        const isCurrentUnit = (unit === SM._currentUnit);
        const isFinished = SM._finishedUnits && SM._finishedUnits.includes(unit);
        if (isCurrentUnit) {
            this.alpha = 1.0;
        } else if (isFinished) {
            this.alpha = 0.75;
        } else {
            this.alpha = 1.0;
        }

        if (PORTRAIT_MODE && unit.hasPortrait()) {
            if (!this._srpgPActive) {
                this._srpgPSetup(unit);
                this._srpgPHover = 0;
            }
            this._srpgPUpdateBitmap();
            this._srpgPUpdatePosition();
            this._srpgPUpdateEffects();
        }
    };

    // ─── 초상화 스프라이트 셋업 ───
    Sprite_Character.prototype._srpgPSetup = function(unit) {
        this._srpgPActive = true;
        this._srpgPUnit = unit;
        this._srpgPIsSV = (unit._portraitSource === "sv_actor");

        this.bitmap = ImageManager.loadEmptyBitmap ? ImageManager.loadEmptyBitmap() : new Bitmap(1, 1);
        this.setFrame(0, 0, 0, 0);

        // 그림자 제거 (draw call 절감)
        this._srpgPShadow = null;

        // 글로우 (선택 시 외곽선 효과)
        this._srpgPGlow = new Sprite();
        this._srpgPGlow.anchor.set(0.5, 1);
        this._srpgPGlow.visible = false;
        this.addChild(this._srpgPGlow);

        // 메인 초상화
        this._srpgPSprite = new Sprite();
        this._srpgPSprite.anchor.set(0.5, 1);
        this.addChild(this._srpgPSprite);

        // 공격 대상 글로우 아웃라인 (붉은 펄스)
        this._srpgPTargetGlow = new PIXI.Graphics();
        this._srpgPTargetGlow.visible = false;
        this._srpgPTargetGlowPhase = 0;
        this.addChild(this._srpgPTargetGlow);

        // ─── HP/MP 바 (캐릭터 머리 위, 통합 Graphics) ───
        this._srpgHpBar = new PIXI.Graphics();
        this.addChild(this._srpgHpBar);
        this._srpgMpBar = new PIXI.Graphics();
        this.addChild(this._srpgMpBar);
        // 상태 아이콘 컨테이너
        this._srpgStateIcons = new PIXI.Container();
        this.addChild(this._srpgStateIcons);
        // 데미지 텍스트 (예측 표시용)
        const _rs = Math.min(Graphics.width / 816, Graphics.height / 624);
        this._srpgDmgText = new PIXI.Text("", new PIXI.TextStyle({
            fontFamily: "sans-serif", fontSize: Math.round(10 * _rs), fontWeight: "bold",
            fill: "#ff4444", stroke: "#000000", strokeThickness: Math.round(2 * _rs)
        }));
        this._srpgDmgText.anchor.set(0.5, 1);
        this._srpgDmgText.visible = false;
        this.addChild(this._srpgDmgText);

        this._srpgPLoadImage(unit);
    };

    // ─── 그림자 그리기 (팀색상 외곽선 포함, 멀티타일 대응) ───
    Sprite_Character.prototype._srpgPDrawShadow = function(unit) {
        const g = this._srpgPShadow;
        g.clear();
        const tc = unit.teamColor().fill;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();

        if (unit.isSingleTile()) {
            // 기존: 1×1 타원 그림자
            g.lineStyle(1.5, tc, 0.65);
            g.beginFill(tc, 0.30);
            g.drawEllipse(0, 0, tw * 0.38, tw * 0.13);
            g.endFill();
            g.lineStyle(0);
            g.beginFill(0x000000, 0.25);
            g.drawEllipse(0, 0, tw * 0.25, tw * 0.09);
            g.endFill();
        } else {
            // 멀티타일: 점유 영역 전체에 걸쳐 바닥 표시
            const ox = -unit.anchor.x * tw;
            const oy = -unit.anchor.y * th;
            const fullW = unit.gridW * tw;
            const fullH = unit.gridH * th;
            // 팀 컬러 영역 표시
            g.lineStyle(2, tc, 0.7);
            g.beginFill(tc, 0.15);
            g.drawRoundedRect(ox - tw/2 + 2, oy - th + 2, fullW - 4, fullH - 4, 4);
            g.endFill();
            // 각 점유 타일에 작은 그림자 점
            g.lineStyle(0);
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const cx = ox + i * tw;
                    const cy = oy + j * th - th/2;
                    g.beginFill(0x000000, 0.15);
                    g.drawEllipse(cx, cy, tw * 0.2, tw * 0.07);
                    g.endFill();
                }
            }
        }
    };

    // ─── 초상화 이미지 로드 (멀티타일: 커스텀 스프라이트 대응) ───
    Sprite_Character.prototype._srpgPLoadImage = function(unit) {
        // 멀티타일 커스텀 스프라이트 처리
        if (!unit.isSingleTile() && unit.spriteFile) {
            this._srpgPLoadMultiTileSprite(unit);
            return;
        }
        const name = unit.currentPortraitName();
        if (!name || name === this._srpgPName) return;
        this._srpgPName = name;
        const bmp = unit.loadPortraitBitmap(name);
        if (!bmp) return;

        const isSV = this._srpgPIsSV;
        const spr = this._srpgPSprite;
        const glow = this._srpgPGlow;

        bmp.addLoadListener(() => {
            if (isSV) {
                const fw = 64, fh = 64;
                const canvas = document.createElement("canvas");
                canvas.width = fw; canvas.height = fh;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(bmp._canvas || bmp._image, 0, 0, fw, fh, 0, 0, fw, fh);
                const tex = PIXI.Texture.from(canvas);
                spr.texture = tex;
                glow.texture = tex;
            } else {
                const baseTex = bmp._canvas
                    ? PIXI.Texture.from(bmp._canvas)
                    : PIXI.Texture.from(bmp._image);
                spr.texture = baseTex;
                glow.texture = baseTex;
            }
            const tw = $gameMap.tileWidth();
            const maxH = unit.isSingleTile()
                ? tw * PORTRAIT_MAX_H
                : unit.gridH * tw * PORTRAIT_MAX_H;
            const iw = spr.texture.width || 1;
            const ih = spr.texture.height || 1;
            let sc = (unit.isSingleTile() ? tw : unit.gridW * tw) / iw;
            if (ih * sc > maxH) sc = maxH / ih;
            this._srpgPScale = sc;
            spr.scale.set(sc, sc);
            glow.scale.set(sc * 1.1, sc * 1.1);
        });
    };

    // ─── 멀티타일 커스텀 스프라이트 로드 ───
    Sprite_Character.prototype._srpgPLoadMultiTileSprite = function(unit) {
        const sprFile = unit.spriteFile;
        if (sprFile === this._srpgPName) return;
        this._srpgPName = sprFile;
        const folder = unit.spriteFolder || "img/characters";
        const bmp = ImageManager.loadBitmap(folder + "/", sprFile);
        if (!bmp) return;

        const spr = this._srpgPSprite;
        const glow = this._srpgPGlow;

        bmp.addLoadListener(() => {
            const baseTex = bmp._canvas
                ? PIXI.Texture.from(bmp._canvas)
                : PIXI.Texture.from(bmp._image);
            spr.texture = baseTex;
            glow.texture = baseTex;
            // 스프라이트를 점유 영역에 정확히 맞춤
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const targetW = unit.gridW * tw;
            const targetH = unit.gridH * th;
            const iw = baseTex.width || 1;
            const ih = baseTex.height || 1;
            const scX = targetW / iw;
            const scY = targetH / ih;
            const sc = Math.min(scX, scY); // 비율 유지
            this._srpgPScale = sc;
            spr.scale.set(sc, sc);
            glow.scale.set(sc * 1.05, sc * 1.05);
            // 멀티타일 스프라이트는 앵커를 영역 중심-하단으로
            spr.anchor.set(0.5, 1);
            glow.anchor.set(0.5, 1);
        });
    };

    Sprite_Character.prototype._srpgPUpdateBitmap = function() {
        const unit = this._srpgPUnit;
        if (!unit) return;
        const name = unit.currentPortraitName();
        if (name !== this._srpgPName) this._srpgPLoadImage(unit);
    };

    Sprite_Character.prototype._srpgPUpdatePosition = function() {
        const ch = this._character;
        const unit = this._srpgPUnit;
        if (unit && !unit.isSingleTile()) {
            // 멀티타일: 스프라이트 위치를 점유 영역 중심으로 조정
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const centerOffX = (unit.gridW / 2 - unit.anchor.x - 0.5) * tw;
            const centerOffY = (unit.gridH - unit.anchor.y - 1) * th;
            this.x = ch.screenX() + centerOffX;
            this.y = ch.screenY() + centerOffY;
        } else {
            this.x = ch.screenX();
            this.y = ch.screenY();
        }
        this.z = ch.screenZ();
    };

    // ─── 시각 효과 (글로우, 호버, 전투 피드백, 공격대상 글로우) ───
    Sprite_Character.prototype._srpgPUpdateEffects = function() {
        const unit = this._srpgPUnit;
        if (!unit) return;
        const isSelected = (unit === SM._currentUnit);
        const spr = this._srpgPSprite;
        const glow = this._srpgPGlow;
        const fx = SrpgFX.getEffectsForUnit(unit);

        // 호버링 애니메이션
        if (isSelected && !SrpgFX.hasActiveEffect(unit)) {
            this._srpgPHover += 0.06;
            const hoverY = Math.sin(this._srpgPHover) * 4;
            spr.y = hoverY + fx.offsetY;
            glow.y = hoverY + fx.offsetY;
        } else if (fx.offsetX !== 0 || fx.offsetY !== 0) {
            spr.y = fx.offsetY;
            glow.y = fx.offsetY;
        } else {
            this._srpgPHover = 0;
            spr.y = 0;
            glow.y = 0;
        }
        spr.x = fx.offsetX;
        glow.x = fx.offsetX;

        // 글로우 (선택 시 팀 컬러)
        glow.visible = isSelected && !SrpgFX.hasActiveEffect(unit);
        if (glow.visible) {
            const tc = unit.teamColor().fill;
            glow.tint = tc;
            glow.alpha = 0.35 + Math.sin(this._srpgPHover * 1.5) * 0.2;
        }

        // 투명도는 상위 Sprite_Character.update에서 this.alpha로 직접 제어
        // spr(내부 PIXI 스프라이트)는 항상 1.0 유지
        spr.alpha = 1.0;

        // 붉은색 틴트 (피격 피드백)
        if (fx.tintAlpha > 0 && fx.tintColor !== null) {
            const r = 255, g = Math.floor(255 * (1 - fx.tintAlpha)), b = Math.floor(255 * (1 - fx.tintAlpha));
            spr.tint = (r << 16) | (g << 8) | b;
        } else {
            spr.tint = 0xFFFFFF;
        }

        // ── 공격 대상 글로우 아웃라인 (피아 상관없이, 붉은 펄스) ──
        const tg = this._srpgPTargetGlow;
        if (tg) {
            let isTargetable = false;
            if (SM._subPhase === "selectTarget" && SM._targetCursorActive
                && SM._currentUnit && unit !== SM._currentUnit && unit.isAlive()) {
                const atkTiles = SM._atkRange;
                if (atkTiles) {
                    for (let i = 0; i < atkTiles.length; i++) {
                        if (atkTiles[i].x === unit.x && atkTiles[i].y === unit.y) {
                            isTargetable = true;
                            break;
                        }
                    }
                }
            }
            if (isTargetable) {
                this._srpgPTargetGlowPhase += 0.05;
                const pulse = 0.40 + Math.sin(this._srpgPTargetGlowPhase * 2) * 0.25;
                const sc = this._srpgPScale || 1;
                const sprW = (spr.texture ? spr.texture.width : $gameMap.tileWidth()) * sc;
                const sprH = (spr.texture ? spr.texture.height : $gameMap.tileWidth()) * sc;
                const pad = 3;
                tg.clear();
                tg.lineStyle(4, 0xFF2222, pulse * 0.5);
                tg.drawRoundedRect(-sprW / 2 - pad + fx.offsetX, -sprH + fx.offsetY - pad,
                                   sprW + pad * 2, sprH + pad * 2, 4);
                tg.lineStyle(2, 0xFF4444, pulse);
                tg.drawRoundedRect(-sprW / 2 - pad + 1 + fx.offsetX, -sprH + fx.offsetY - pad + 1,
                                   sprW + pad * 2 - 2, sprH + pad * 2 - 2, 3);
                tg.lineStyle(0);
                tg.visible = true;
            } else {
                if (tg.visible) tg.clear();
                tg.visible = false;
                this._srpgPTargetGlowPhase = 0;
            }
        }

        // ─── HP/MP 바 업데이트 ───
        this._srpgPUpdateBars(unit, spr, fx);

        // 흰색 페이드 오버레이 (크리티컬 차징)
        if (!this._srpgPWhiteOverlay) {
            this._srpgPWhiteOverlay = new PIXI.Graphics();
            this.addChild(this._srpgPWhiteOverlay);
        }
        const wo = this._srpgPWhiteOverlay;
        if (fx.whiteAlpha > 0) {
            wo.clear();
            wo.beginFill(0xFFFFFF, fx.whiteAlpha);
            const sc = this._srpgPScale || 1;
            const tw = (spr.texture ? spr.texture.width : $gameMap.tileWidth()) * sc;
            const th = (spr.texture ? spr.texture.height : $gameMap.tileWidth()) * sc;
            wo.drawRect(-tw / 2 + fx.offsetX, -th + fx.offsetY, tw, th);
            wo.endFill();
            wo.visible = true;
        } else {
            wo.visible = false;
        }
    };

    // ─── HP/MP 바 업데이트 (캐싱 + 통합 Graphics: 5→2) ───
    Sprite_Character.prototype._srpgPUpdateBars = function(unit, spr, fx) {
        if (!this._srpgHpBar || !unit) return;

        const sc = this._srpgPScale || 1;
        const sprH = (spr.texture ? spr.texture.height : $gameMap.tileWidth()) * sc;
        const barW = 40, hpBarH = 4, mpBarH = 3, gap = 2;
        const barX = -barW / 2;
        const barBaseY = -sprH + (spr.y || 0) - 8;

        // 상태 아이콘 업데이트 (별도 캐시)
        this._srpgPUpdateStateIcons(unit, barBaseY);
        const cacheKey = unit.hp + "," + unit.mhp + "," + unit.mp + "," + unit.mmp + "," + (barBaseY | 0);
        if (this._srpgBarCache === cacheKey) return;
        this._srpgBarCache = cacheKey;

        // HP 바 (배경 + 채우기 통합)
        const hpG = this._srpgHpBar;
        hpG.clear();
        hpG.beginFill(0x000000, 0.55);
        hpG.drawRoundedRect(barX - 1, barBaseY - 1, barW + 2, hpBarH + 2, 1);
        hpG.endFill();
        const hpRatio = Math.max(0, Math.min(1, unit.hp / unit.mhp));
        let hpCol = C.hpColor;
        if (hpRatio <= 0.25) hpCol = 0xff4444;
        else if (hpRatio <= 0.50) hpCol = 0xddcc22;
        if (hpRatio > 0) {
            hpG.beginFill(hpCol, 0.9);
            hpG.drawRect(barX, barBaseY, barW * hpRatio, hpBarH);
            hpG.endFill();
        }

        // MP 바 (배경 + 채우기 통합)
        const mpG = this._srpgMpBar;
        mpG.clear();
        if (unit.mmp > 0) {
            const mpBarY = barBaseY + hpBarH + gap;
            mpG.beginFill(0x000000, 0.55);
            mpG.drawRoundedRect(barX - 1, mpBarY - 1, barW + 2, mpBarH + 2, 1);
            mpG.endFill();
            const mpRatio = Math.max(0, Math.min(1, unit.mp / unit.mmp));
            if (mpRatio > 0) {
                mpG.beginFill(C.mpColor, 0.9);
                mpG.drawRect(barX, mpBarY, barW * mpRatio, mpBarH);
                mpG.endFill();
            }
        }

        // ─── 전투 예측 오버레이 (HP 바에 직접 그림) ───
        const dmgG = this._srpgHpBar; // 통합 HP 바에 직접 추가 그리기
        const dmgTxt = this._srpgDmgText;
        const pred = SM._combatPrediction;
        const isDefender = pred && SM._selectedTarget === unit;
        const isAttacker = pred && SM._currentUnit === unit && pred.counterDamage > 0;

        if (isDefender) {
            // 방어자: 예측 데미지 부분을 빨간색으로 표시
            const dmg = pred.damage;
            const hpAfterRatio = Math.max(0, Math.min(1, (unit.hp - dmg) / unit.mhp));
            if (dmg > 0 && hpRatio > hpAfterRatio) {
                dmgG.beginFill(C.hpDmgColor, 0.75);
                dmgG.drawRect(barX + barW * hpAfterRatio, barBaseY,
                              barW * (hpRatio - hpAfterRatio), hpBarH);
                dmgG.endFill();
            }
            dmgG.visible = true;

            // 데미지 텍스트
            if (dmg > 0) {
                dmgTxt.text = `-${dmg}`;
                dmgTxt.x = 0;
                dmgTxt.y = barBaseY - 2;
                dmgTxt.visible = true;
            } else {
                dmgTxt.visible = false;
            }
        } else if (isAttacker) {
            // 공격자: 반격 데미지 표시 (주황색)
            const cDmg = pred.counterDamage;
            const hpAfterRatio = Math.max(0, Math.min(1, (unit.hp - cDmg) / unit.mhp));
            if (cDmg > 0 && hpRatio > hpAfterRatio) {
                dmgG.beginFill(0xff8844, 0.70);
                dmgG.drawRect(barX + barW * hpAfterRatio, barBaseY,
                              barW * (hpRatio - hpAfterRatio), hpBarH);
                dmgG.endFill();
            }
            dmgG.visible = true;

            if (cDmg > 0) {
                dmgTxt.text = `-${cDmg}`;
                dmgTxt.x = 0;
                dmgTxt.y = barBaseY - 2;
                dmgTxt.style.fill = "#ff8844";
                dmgTxt.visible = true;
            } else {
                dmgTxt.visible = false;
            }
        } else {
            dmgTxt.visible = false;
            if (dmgTxt.style) dmgTxt.style.fill = "#ff4444";
        }
    };

    // ─── 상태 아이콘 표시 (HP 바 위) ───
    Sprite_Character.prototype._srpgPUpdateStateIcons = function(unit, barBaseY) {
        if (!this._srpgStateIcons) return;
        // 상태 ID 수집 (RMMZ Game_Actor 상태)
        let stateIds = [];
        if (unit.actorId && typeof $gameActors !== "undefined" && $gameActors) {
            const actor = $gameActors.actor(unit.actorId);
            if (actor) stateIds = actor.states().map(function(s){ return s.iconIndex; }).filter(function(i){ return i > 0; });
        } else if (unit._hidden) {
            stateIds.push(81); // 숨기 아이콘
        }
        const stateKey = stateIds.join(",");
        if (this._srpgStateCache === stateKey) return;
        this._srpgStateCache = stateKey;
        // 기존 아이콘 제거
        this._srpgStateIcons.removeChildren();
        if (stateIds.length === 0) return;
        // IconSet 로드 (RMMZ Bitmap)
        const iconset = ImageManager.loadSystem("IconSet");
        if (!iconset || !iconset.isReady()) {
            // 아직 로딩 중이면 캐시 리셋해서 다음 프레임에 재시도
            this._srpgStateCache = "";
            return;
        }
        const iconW = 32, iconH = 32;
        const iconsPerRow = 16;
        const scale = 0.5; // 16x16 표시
        const dispW = iconW * scale;
        const startX = -(stateIds.length * dispW) / 2;
        const iconY = barBaseY - dispW - 2; // HP 바 위
        for (let i = 0; i < stateIds.length; i++) {
            const iconIdx = stateIds[i];
            const sx = (iconIdx % iconsPerRow) * iconW;
            const sy = Math.floor(iconIdx / iconsPerRow) * iconH;
            // RMMZ Bitmap → PIXI.BaseTexture 접근
            const bt = iconset._baseTexture || (iconset._image ? PIXI.BaseTexture.from(iconset._image) : null);
            if (!bt) { this._srpgStateCache = ""; return; }
            const tex = new PIXI.Texture(bt, new PIXI.Rectangle(sx, sy, iconW, iconH));
            const spr = new PIXI.Sprite(tex);
            spr.scale.set(scale);
            spr.x = startX + i * dispW;
            spr.y = iconY;
            this._srpgStateIcons.addChild(spr);
        }
    };

    // ─── 정리 ───
    Sprite_Character.prototype._srpgPCleanup = function() {
        if (this._srpgPSprite) { this.removeChild(this._srpgPSprite); this._srpgPSprite = null; }
        if (this._srpgPGlow) { this.removeChild(this._srpgPGlow); this._srpgPGlow = null; }
        this._srpgPShadow = null;
        if (this._srpgPTargetGlow) { this.removeChild(this._srpgPTargetGlow); this._srpgPTargetGlow = null; }
        if (this._srpgPWhiteOverlay) { this.removeChild(this._srpgPWhiteOverlay); this._srpgPWhiteOverlay = null; }
        // HP/MP 바 정리 (통합 Graphics)
        if (this._srpgHpBar) { this.removeChild(this._srpgHpBar); this._srpgHpBar = null; }
        if (this._srpgMpBar) { this.removeChild(this._srpgMpBar); this._srpgMpBar = null; }
        if (this._srpgStateIcons) { this.removeChild(this._srpgStateIcons); this._srpgStateIcons.destroy({children:true}); this._srpgStateIcons = null; }
        if (this._srpgDmgText) { this.removeChild(this._srpgDmgText); this._srpgDmgText.destroy(); this._srpgDmgText = null; }
        this._srpgPActive = false;
        this._srpgPUnit = null;
        this._srpgPName = null;
        this._srpgPScale = null;
        this.alpha = 1.0;  // 투명도 원상복귀
    };

    // =========================================================================
    //  Scene_Map 확장 — SRPG 업데이트 루프
    // =========================================================================
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (SM._battleActive) {
            SM.update();
            SrpgUI.update();
            SrpgFX.update();
        }
    };

    // SRPG 전투 중 네이티브 메뉴(ESC/우클릭) 차단
    const _Scene_Map_updateCallMenu = Scene_Map.prototype.updateCallMenu;
    Scene_Map.prototype.updateCallMenu = function() {
        if (SM._battleActive) return;
        _Scene_Map_updateCallMenu.call(this);
    };

    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        if (this._spriteset && this._spriteset._tilemap) {
            SrpgUI.init(this._spriteset._tilemap);
            if (SrpgUI._hudWrap) {
                this.addChild(SrpgUI._hudWrap);
            }
        }
    };

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        if (SrpgProjectile._pendingInit && this._tilemap) {
            SrpgProjectile.init(this._tilemap);
            SrpgProjectile._pendingInit = false;
        }
    };


    // =========================================================================
    //  SRPG 애니메이션 스케일링 시스템
    //  — 스킬 범위 크기에 맞춰 RMMZ(Effekseer) 애니메이션 크기 자동 조정
    // =========================================================================

    // $gameTemp에 SRPG 스케일 오버라이드 저장
    // requestAnimation 호출 직전에 설정, 애니메이션 생성 후 자동 소거
    const _origRetrieveAnimation = Game_Temp.prototype.retrieveAnimation;
    Game_Temp.prototype.retrieveAnimation = function() {
        const request = _origRetrieveAnimation.call(this);
        if (request && this._srpgAnimScale) {
            request._srpgAnimScale = this._srpgAnimScale;
            this._srpgAnimScale = null;  // 1회용 — 즉시 소거
        }
        return request;
    };

    // createAnimation 후킹 — request._srpgAnimScale을 pending으로 전달
    const _origCreateAnimation = Spriteset_Base.prototype.createAnimation;
    Spriteset_Base.prototype.createAnimation = function(request) {
        this._srpgAnimScalePending = request._srpgAnimScale || null;
        _origCreateAnimation.call(this, request);
        this._srpgAnimScalePending = null;
    };

    // createAnimationSprite 후킹 — pending scale을 sprite에 부착
    const _origCreateAnimSprite = Spriteset_Base.prototype.createAnimationSprite;
    Spriteset_Base.prototype.createAnimationSprite = function(targets, animation, mirror, delay) {
        _origCreateAnimSprite.call(this, targets, animation, mirror, delay);
        if (this._srpgAnimScalePending && this._animationSprites && this._animationSprites.length > 0) {
            const last = this._animationSprites[this._animationSprites.length - 1];
            if (last) last._srpgScale = this._srpgAnimScalePending;
        }
    };

    // Sprite_Animation.updateEffectGeometry 후킹 — SRPG 스케일 적용
    const _origUpdateEffectGeo = Sprite_Animation.prototype.updateEffectGeometry;
    Sprite_Animation.prototype.updateEffectGeometry = function() {
        _origUpdateEffectGeo.call(this);
        if (this._srpgScale && this._handle) {
            const baseScale = this._animation.scale / 100;
            const finalScale = baseScale * this._srpgScale;
            this._handle.setScale(finalScale, finalScale, finalScale);
        }
    };

    // ── 스킬 범위로부터 애니메이션 스케일 계산 유틸 ──
    window.SrpgAnimScale = {
        // 이펙트 타일(area) 목록에서 바운딩 최대 치수(타일 수) 계산
        calcFromEffectTiles(tiles) {
            if (!tiles || tiles.length === 0) return 1.5;
            if (tiles.length === 1) return 1.5;  // 1그리드 → 1+0.5 = 1.5배

            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            for (const t of tiles) {
                const tx = t.dx !== undefined ? t.dx : t.x;
                const ty = t.dy !== undefined ? t.dy : t.y;
                if (tx < minX) minX = tx;
                if (tx > maxX) maxX = tx;
                if (ty < minY) minY = ty;
                if (ty > maxY) maxY = ty;
            }
            const width = maxX - minX + 1;
            const height = maxY - minY + 1;
            const maxDim = Math.max(width, height);
            return maxDim + 0.5;  // 최대 치수 + 0.5 패딩
        },

        // 스킬/유닛 조합으로 스케일 계산
        calcForSkill(unit, skill, targetX, targetY) {
            if (!skill) return 1.5;  // 기본 공격 = 1타일
            const meta = SrpgSkillMeta.getRange(unit, skill);
            if (meta.area && meta.area.length > 1) {
                return this.calcFromEffectTiles(meta.area);
            }
            return 1.5;  // 단일 타일
        },

        // $gameTemp에 스케일 설정 (requestAnimation 직전 호출)
        setScale(scale) {
            if ($gameTemp) $gameTemp._srpgAnimScale = scale;
        }
    };

        // =========================================================================
    //  Game_Player / Game_Event 확장 — 전투 중 자유이동/자율행동 차단
    // =========================================================================
    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (SM._battleActive) return false;
        return _Game_Player_canMove.call(this);
    };

    const _Game_Player_moveByInput = Game_Player.prototype.moveByInput;
    Game_Player.prototype.moveByInput = function() {
        if (SM._battleActive) return;
        _Game_Player_moveByInput.call(this);
    };

    const _Game_Player_triggerAction = Game_Player.prototype.triggerAction;
    Game_Player.prototype.triggerAction = function() {
        if (SM._battleActive) return false;
        return _Game_Player_triggerAction.call(this);
    };

    const _Game_Event_updateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function() {
        if (SM._battleActive) return;
        _Game_Event_updateSelfMovement.call(this);
    };

    const _Game_Event_checkEventTriggerAuto = Game_Event.prototype.checkEventTriggerAuto;
    Game_Event.prototype.checkEventTriggerAuto = function() {
        if (SM._battleActive) return;
        _Game_Event_checkEventTriggerAuto.call(this);
    };

    const _Game_Event_checkEventTriggerTouch = Game_Event.prototype.checkEventTriggerTouch;
    Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
        if (SM._battleActive) return;
        _Game_Event_checkEventTriggerTouch.call(this, x, y);
    };

    // =========================================================================
    //  Plugin Commands
    // =========================================================================
    PluginManager.registerCommand(pluginName, "StartBattle", () => {
        SM.startBattle();
    });

    PluginManager.registerCommand(pluginName, "EndBattle", () => {
        SM.endBattle();
    });


    // =========================================================================
    //  SRPG 이동속도 옵션 — ConfigManager + Window_Options 확장
    // =========================================================================

    // --- ConfigManager 확장: srpgMoveSpeed 저장/로드 ---
    ConfigManager.srpgMoveSpeed = _DEFAULT_MOVE_SPEED;

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.srpgMoveSpeed = this.srpgMoveSpeed;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.srpgMoveSpeed = config.srpgMoveSpeed != null
            ? Number(config.srpgMoveSpeed).clamp(1, 6)
            : _DEFAULT_MOVE_SPEED;
    };

    // --- Window_Options 확장: SRPG 이동속도 항목 추가 ---
    const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function() {
        _Window_Options_addGeneralOptions.call(this);
        this.addCommand("SRPG 이동속도", "srpgMoveSpeed");
    };

    // srpgMoveSpeed 심볼 판별
    Window_Options.prototype.isSrpgSpeedSymbol = function(symbol) {
        return symbol === "srpgMoveSpeed";
    };

    // 상태 텍스트: 숫자 + 라벨
    const _Window_Options_statusText = Window_Options.prototype.statusText;
    Window_Options.prototype.statusText = function(index) {
        const symbol = this.commandSymbol(index);
        if (this.isSrpgSpeedSymbol(symbol)) {
            const v = this.getConfigValue(symbol);
            const labels = ["", "매우 느림", "느림", "약간 느림", "보통", "빠름", "매우 빠름"];
            return v + " (" + (labels[v] || "") + ")";
        }
        return _Window_Options_statusText.call(this, index);
    };

    // OK(Enter/Z): 값 순환 1→2→...→6→1
    const _Window_Options_processOk = Window_Options.prototype.processOk;
    Window_Options.prototype.processOk = function() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (this.isSrpgSpeedSymbol(symbol)) {
            let v = this.getConfigValue(symbol) + 1;
            if (v > 6) v = 1;
            this.changeValue(symbol, v);
            return;
        }
        _Window_Options_processOk.call(this);
    };

    // 좌/우 화살표: ±1 (1~6 범위)
    const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
    Window_Options.prototype.cursorRight = function() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (this.isSrpgSpeedSymbol(symbol)) {
            const v = this.getConfigValue(symbol);
            if (v < 6) this.changeValue(symbol, v + 1);
            return;
        }
        _Window_Options_cursorRight.call(this);
    };

    const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
    Window_Options.prototype.cursorLeft = function() {
        const index = this.index();
        const symbol = this.commandSymbol(index);
        if (this.isSrpgSpeedSymbol(symbol)) {
            const v = this.getConfigValue(symbol);
            if (v > 1) this.changeValue(symbol, v - 1);
            return;
        }
        _Window_Options_cursorLeft.call(this);
    };

})(); // ── IIFE 끝 ──
