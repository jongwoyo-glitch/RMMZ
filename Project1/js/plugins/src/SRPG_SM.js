// ─── SRPG_SM.js ─────────────────────────────────────────────────────────────
// 빌드 순서: 2/3 (중간 계층 — 메인 상태머신)
//
// [포함 모듈]
//   SM (SrpgManager) — 전투 총괄 스테이트 머신 (→ window.SrpgManager)
//     전투 생명주기  : startBattle, endBattle, _collectUnits
//     턴 관리       : _updateTurnAdvance, _startPhaseRound, _endCurrentTurn
//     페이즈        : _phase (idle/battleStart/playerTurn/enemyTurn/turnAdvance)
//     서브페이즈    : _subPhase (none/move/selectTarget/combatPreview/faceDirection 등)
//     이동          : moveUnit, _calcMoveRange, _animateMove
//     액션 메뉴     : _openActionMenu, _openSubRadial, _handleRadialMenu
//     타겟팅        : selectTarget, _calcAtkRange, _drawProjectilePathPreview
//     전투 실행     : _executeCombat, _executeGroundAttack, _openCombatPreview
//     소환          : _executeSummon
//     적 AI         : _startNextEnemyInPhase, _enemyDecide, _enemyShowAction
//     유틸          : unitAt, _addPopup, _updatePopups
//
// [외부 의존 — SRPG_Data.js]
//   SrpgGrid       — bfs, calcAtkRange, checkProjectilePath, dist
//   SrpgCombat     — execute, predict, checkAttackPath, resolveFireMode
//   SrpgUnit       — 유닛 인스턴스 생성/관리
//   SrpgTurnOrder  — advanceToNextTurn, predictTurns
//   SrpgProjectile — createProjectile, createHitray, createArtillery, init
//   SrpgFX         — startCritCharge, startHitReaction, clear
//   SrpgSummon     — parseSummonMeta, summon
//   SrpgSkillMeta  — parse, calcReachTiles, calcEffectTiles
//   상수           — FIRE_MODE, TERRAIN, C, TEAM_COLORS, TILE 등
//
// [참조하는 쪽] SRPG_UI.js (SM 상태 조회, SM._uiDirty 플래그)
// ─────────────────────────────────────────────────────────────────────────────
    // =========================================================================
    //  SrpgManager (SM) — 전투 총괄 스테이트 머신
    // =========================================================================
    const SM = window.SrpgManager = {
        _phase: "idle",
        _subPhase: "none",
        _units: [],
        _currentUnit: null,      // 현재 턴 유닛
        _selectedTarget: null,
        _targetCursorActive: false,  // 그리드 커서 활성 (selectTarget)
        _targetTileX: 0,             // 그리드 커서 X
        _targetTileY: 0,             // 그리드 커서 Y
        // 멀티샷 상태
        _multiShotMode: false,
        _multiShotMax: 0,
        _multiShotTargets: [],       // [{x, y, unit}]
        _multiShotMeta: null,
        _moveRange: [],
        _moveAtkThreat: [],     // 이동범위 외곽 공격 위협 범위
        _movePath: [],           // 호버 이동 경로 미리보기
        _atkRange: [],
        _browseUnit: null,       // 브라우즈 모드: 호버 중인 유닛
        _browseRange: [],        // 브라우즈 모드: 이동 범위
        _browseAtkThreat: [],    // 브라우즈 모드: 공격 위협 범위
        _moveTargetX: -1,
        _moveTargetY: -1,
        _battleActive: false,
        _battleMode: "annihilation",
        _battleModeParams: null,
        _koActorIds: [],
        _escapedCount: 0,
        _turnNumber: 0,
        _inputDelay: 0,
        _bannerText: "",
        _bannerTimer: 0,
        _bannerColor: "#ffffff",
        _combatResult: null,
        _combatAnimTimer: 0,
        _enemyThinkTimer: 0,
        _damagePopups: [],
        _cursor: { x: 0, y: 0, visible: false },
        _predictedTurns: [],
        _turnPredictDirty: true,
        _uiDirty: true,  // UI 갱신 플래그
        _unitMap: null,          // event → unit O(1) 맵
        _enemyMoveRange: [],      // enemy visible move range
        _enemyMovePath: [],       // enemy visible path (array of {x,y})
        _enemyActionMsg: "",      // "XXX에게 일반 공격!"
        _enemyOrigin: null,       // {x, y} for arrow start
        _enemyDest: null,         // {x, y} for arrow end
        _enemyDecision: null,     // stored decision {type, movePath, target, moveRange}
        _enemyShowTimer: 0,
        _enemyActionTimer: 0,

        // ─── BG3 팀 페이즈 ───
        _phaseUnits: [],         // 현재 페이즈에서 행동 가능한 유닛들
        _finishedUnits: [],      // 이번 페이즈에서 턴 종료한 유닛들

        // ─── 전투 시작/종료 ───
        startBattle() {
            // 재진입 방지 — autorun이 매 프레임 호출하므로 이미 활성이면 무시
            if (this._battleActive) return;
            this._battleActive = true;
            this._turnNumber = 0;
            this._units = [];
            this._koActorIds = [];
            this._escapedCount = 0;
            this._phase = "battleStart";
            this._subPhase = "none";
            SrpgGrid.init();
            // 투사체 컨테이너 초기화는 Spriteset_Map 생성 후 연결
            SrpgProjectile._pendingInit = true;

            // ─── 맵 노트 파싱: 팀 관계 + 전투 모드 ───
            const mapNote = $dataMap ? ($dataMap.note || "") : "";
            SrpgAlliance.parseMapNote(mapNote);
            this._battleModeParams = BattleModeChecker.parseMapNote(mapNote);
            this._battleMode = this._battleModeParams.mode;
            // 리전 기반 구역 스캔 + 병합
            if ($dataMap) {
                const zones = BattleModeChecker.scanZoneRegions($dataMap);
                BattleModeChecker.mergeZones(this._battleModeParams, zones);
                console.log("[SRPG] Zone scan:", JSON.stringify({
                    deploy: zones.deployShared.length,
                    cap: zones.capPoints.length,
                    escape: zones.escapeZone.length,
                    spawn: Object.keys(zones.spawnZone).length
                }));
            }
            console.log("[SRPG] Battle mode:", this._battleMode, "Ambush:", this._battleModeParams.ambush);

            this._collectUnits();

            // 파티 슬롯 → 실제 액터 바인딩
            this._resolvePartySlots();
            if (this._units.length === 0) {
                console.warn("[SRPG] No units found!");
                this._battleActive = false;
                return;
            }

            // ─── 기습 처리 ───
            this._applyAmbush();

            // 초상화 이미지 사전 로드
            this._preloadPortraits();
            $gamePlayer.setTransparent(true);
            SrpgTurnOrder.reset();
            // 이벤트 → 유닛 O(1) 룩업 맵 생성
            this._unitMap = new Map();
            for (const u of this._units) {
                if (u.event) this._unitMap.set(u.event, u);
            }
            console.log("[SRPG] Battle started. Units:", this._units.length, "Mode:", this._battleMode);
            this._showBanner("전투 시작!", "#ffdd44");
            this._phase = "banner";
            this._subPhase = "startBanner";

            // UI 초기화
            this._turnPredictDirty = true;
            this._uiDirty = true;
            if (SrpgUI._initialized) SrpgUI.refresh();
        },

        // ─── 기습 적용 ───
        // ─── 파티 슬롯 → 실제 $gameParty 멤버 바인딩 ───
        _resolvePartySlots() {
            const slotUnits = this._units.filter(u => u.partySlot > 0)
                .sort((a, b) => a.partySlot - b.partySlot);
            if (slotUnits.length === 0) return;

            // $gameParty.members()에서 현재 파티원 가져오기
            const members = $gameParty ? $gameParty.members().slice() : [];

            // 기습 판정: 아군이 기습당하는 경우 슬롯 배정을 셔플
            const ambush = this._battleModeParams ? this._battleModeParams.ambush : null;
            const ambushTeam = ambush ? Number(ambush) : 0;
            const playerAmbushed = ambushTeam > 0 && !SrpgAlliance.isPlayerTeam(ambushTeam);

            if (playerAmbushed && members.length > 1) {
                // Fisher-Yates 셔플
                for (let i = members.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [members[i], members[j]] = [members[j], members[i]];
                }
                console.log("[SRPG] Party slots shuffled (ambush)");
            }

            for (const su of slotUnits) {
                const idx = su.partySlot - 1; // 1-based → 0-based
                if (idx >= 0 && idx < members.length) {
                    const actor = members[idx];
                    su._bindActorData(actor.actorId());
                    // Game_Actor 인스턴스에서 레벨 동기화
                    su.level = actor.level || 1;
                    console.log("[SRPG] Slot " + su.partySlot + " → Actor " + su.actorId + " (" + (su.name || "?") + ")");
                } else {
                    // 파티원 수 부족 → 슬롯 비활성화
                    su._dead = true;
                    su.hp = 0;
                    if (su.event) {
                        su.event.setTransparent(true);
                        su.event.setThrough(true);
                    }
                    console.log("[SRPG] Slot " + su.partySlot + " deactivated (no party member)");
                }
            }
        },

        _applyAmbush() {
            const ambush = this._battleModeParams.ambush;
            if (!ambush || ambush === "none") return;
            const ambushTeam = Number(ambush);
            if (isNaN(ambushTeam) || ambushTeam <= 0) return;
            console.log("[SRPG] Ambush by team", ambushTeam);
            for (const u of this._units) {
                if (u.isObject) continue;
                if (SrpgAlliance.areAllied(u.teamId, ambushTeam)) {
                    // 기습하는 쪽: AP 보너스
                    u._ap = (u._ap || 0) + 100;
                } else {
                    // 기습당하는 쪽: AP 페널티 + 배치 불가 플래그
                    u._ap = Math.max(0, (u._ap || 0) - 50);
                    u._ambushed = true;
                }
            }
            // 기습당하는 팀은 배치 스킵
            this._ambushTeam = ambushTeam;
        },


        // ─── 배치 페이즈 ───
        /** 배치 페이즈 진입 또는 즉시 전투 시작 판단 */
        _enterDeployOrBattle() {
            const params = this._battleModeParams || {};
            const deployEnabled = params.deployEnabled !== false;
            // 기습당한 쪽이 플레이어면 배치 스킵
            const ambushed = this._ambushTeam && !SrpgAlliance.isPlayerTeam(this._ambushTeam);
            if (deployEnabled && this._hasDeployableUnits() && !ambushed) {
                this._phase = "deployment";
                this._subPhase = "selectUnit";
                this._deployUnits = this.allyUnits().slice();
                this._deployPlaced = [];
                this._deploySelectedIdx = 0;
                this._deployRegion = this._getDeployRegion();
                this._inputDelay = 15;
                console.log("[SRPG] Entering deployment phase. Units:", this._deployUnits.length);
            } else {
                if (!deployEnabled) console.log("[SRPG] Deployment disabled by notetag.");
                else if (ambushed) console.log("[SRPG] Deployment skipped — player is ambushed.");
                this._phase = "turnAdvance";
                this._subPhase = "none";
            }
        },

        _hasDeployableUnits() {
            return this.allyUnits().length > 0;
        },

        _getDeployRegion() {
            // 배치 가능 타일: 리전 200(공용) + 201~208(팀별 전용)
            const tiles = new Set();
            const playerTeam = [...SrpgAlliance._playerTeams][0] || 1;
            const teamRegion = 200 + playerTeam; // 팀 전용 존
            const allies = this.allyUnits();
            
            // 1) 리전 기반 (mapData에서 리전 ID 1인 타일)
            for (let y = 0; y < $gameMap.height(); y++) {
                for (let x = 0; x < $gameMap.width(); x++) {
                    if ($gameMap.regionId(x, y) === 200 || $gameMap.regionId(x, y) === teamRegion) { // 배치 존: 공용(200) + 팀전용(201~208)
                        tiles.add(x + "," + y);
                    }
                }
            }

            // 2) 리전이 없으면 아군 초기 위치 주변 3타일 다이아몬드
            if (tiles.size === 0) {
                for (const u of allies) {
                    const ox = u.event.x;
                    const oy = u.event.y;
                    for (let dy = -3; dy <= 3; dy++) {
                        for (let dx = -3; dx <= 3; dx++) {
                            if (Math.abs(dx) + Math.abs(dy) > 3) continue;
                            const tx = ox + dx;
                            const ty = oy + dy;
                            if (tx < 0 || ty < 0 || tx >= $gameMap.width() || ty >= $gameMap.height()) continue;
                            if (!SrpgGrid.isPassable(tx, ty)) continue;
                            tiles.add(tx + "," + ty);
                        }
                    }
                }
            }

            return tiles;
        },

        _isDeployTile(x, y) {
            return this._deployRegion && this._deployRegion.has(x + "," + y);
        },

        _updateDeployment() {
            if (this._inputDelay > 0) { this._inputDelay--; return; }

            const allies = this._deployUnits;
            if (!allies || allies.length === 0) {
                this._finishDeployment();
                return;
            }

            // 현재 선택 유닛 하이라이트
            const selectedUnit = allies[this._deploySelectedIdx];
            if (!selectedUnit) { this._finishDeployment(); return; }

            // 키보드 입력
            if (Input.isTriggered("left") || Input.isTriggered("up")) {
                this._deploySelectedIdx = (this._deploySelectedIdx - 1 + allies.length) % allies.length;
                SoundManager.playCursor();
                this._uiDirty = true;
            }
            if (Input.isTriggered("right") || Input.isTriggered("down")) {
                this._deploySelectedIdx = (this._deploySelectedIdx + 1) % allies.length;
                SoundManager.playCursor();
                this._uiDirty = true;
            }

            // 마우스/터치 클릭 → 배치 위치 지정
            if (TouchInput.isTriggered()) {
                const tx = $gameMap.canvasToMapX(TouchInput.x);
                const ty = $gameMap.canvasToMapY(TouchInput.y);

                // 배치 타일 클릭 → 유닛 이동
                if (this._isDeployTile(tx, ty)) {
                    // 해당 위치에 이미 다른 유닛이 있는지 체크
                    const occupant = this.unitAt(tx, ty);
                    if (!occupant || occupant === selectedUnit) {
                        // 이동 (unitAt은 event 위치 기반이므로 별도 점유 관리 불필요)
                        selectedUnit.event.setPosition(tx, ty);
                        // 다음 유닛으로
                        if (!this._deployPlaced.includes(this._deploySelectedIdx)) {
                            this._deployPlaced.push(this._deploySelectedIdx);
                        }
                        this._deploySelectedIdx = (this._deploySelectedIdx + 1) % allies.length;
                        SoundManager.playOk();
                        this._uiDirty = true;
                    } else {
                        SoundManager.playBuzzer();
                    }
                }
                // 아군 유닛 클릭 → 선택 변경
                else {
                    for (let i = 0; i < allies.length; i++) {
                        if (allies[i].event.x === tx && allies[i].event.y === ty) {
                            this._deploySelectedIdx = i;
                            SoundManager.playCursor();
                            this._uiDirty = true;
                            break;
                        }
                    }
                }
            }

            // Enter/OK → 배치 확정
            if (Input.isTriggered("ok")) {
                this._finishDeployment();
            }

            // ESC/Cancel → 배치 리셋 (전원 초기 위치로)
            if (Input.isTriggered("cancel")) {
                // 초기 위치는 이미 이벤트 원래 위치이므로 리셋 불필요
                // 단순히 "정말 시작?" 확인 생략하고 진행
                this._finishDeployment();
            }
        },

        _finishDeployment() {
            this._phase = "turnAdvance";
            this._subPhase = "none";
            this._deployUnits = null;
            this._deployPlaced = null;
            this._deployRegion = null;
            this._uiDirty = true;
            console.log("[SRPG] Deployment complete. Starting battle.");
        },

        endBattle() {
            // ─── KO 액터 처리 ───
            this._processKnockedOutActors();
            // ─── 승리/패배 이벤트 트리거 ───
            if (this._battleModeParams) {
                const result = this._lastBattleResult || "victory";
                const eventId = result === "victory"
                    ? this._battleModeParams.victoryEvent
                    : this._battleModeParams.defeatEvent;
                if (eventId > 0) {
                    $gameTemp.reserveCommonEvent(eventId);
                }
            }
            this._unitMap = null;
            this._battleActive = false;
            this._battleMode = "annihilation";
            this._battleModeParams = null;
            this._phase = "idle";
            this._subPhase = "none";
            this._currentUnit = null;
            this._units = [];
            this._finishedUnits = [];
            this._pendingSkill = null;
            this._koActorIds = [];
            this._escapedCount = 0;
            this._ambushTeam = 0;
            this._lastBattleResult = null;
            $gamePlayer.setTransparent(false);
            SrpgProjectile.clear();
            SrpgSummon.clear();
            if (typeof SrpgField !== 'undefined') SrpgField.init();
            SrpgUI.clearAll();
            console.log("[SRPG] Battle ended.");
        },

        // ─── KO 액터 처리 ───
        _processKnockedOutActors() {
            const policy = (this._battleModeParams && this._battleModeParams.koPolicy) || "recover";
            const koList = this._koActorIds || [];
            for (const actorId of koList) {
                const actor = $gameActors.actor(actorId);
                if (!actor) continue;
                switch (policy) {
                    case "remove":
                        // 영구 퇴장 (파이어엠블렘 클래식)
                        $gameParty.removeActor(actorId);
                        console.log("[SRPG] Actor", actorId, "permanently removed (KO policy: remove)");
                        break;
                    case "recover":
                        // HP 1로 복구
                        actor.setHp(1);
                        actor.removeState(1);
                        console.log("[SRPG] Actor", actorId, "recovered to HP 1 (KO policy: recover)");
                        break;
                    case "reserve":
                        // 예비 배열로 이동
                        $gameParty.removeActor(actorId);
                        $gameParty._reserveActors = $gameParty._reserveActors || [];
                        if (!$gameParty._reserveActors.includes(actorId)) {
                            $gameParty._reserveActors.push(actorId);
                        }
                        console.log("[SRPG] Actor", actorId, "moved to reserve (KO policy: reserve)");
                        break;
                }
            }
},

        // ─── 방어전: 스폰 웨이브 체크 ───
        _checkSpawnWaves() {
            if (!this._battleModeParams || !this._battleModeParams.spawnWaves) return;
            const zones = this._battleModeParams._zones;
            for (const wave of this._battleModeParams.spawnWaves) {
                if (this._turnNumber === wave.turn && !wave.spawned) {
                    let sx = wave.x, sy = wave.y;
                    // 스폰존 모드: zone + zoneTeam → 해당 리전 영역 내 빈 타일 랜덤
                    if (wave.zone && wave.zoneTeam != null && zones) {
                        const candidates = zones.spawnZone[wave.zoneTeam] || [];
                        const free = candidates.filter(t => !SrpgGrid.isOccupied(t.x, t.y));
                        if (free.length === 0) {
                            console.log("[SRPG] Spawn wave skipped — no free tiles in zone team", wave.zoneTeam);
                            continue; // 빈 타일 없으면 스킵
                        }
                        const pick = free[Math.floor(Math.random() * free.length)];
                        sx = pick.x; sy = pick.y;
                    }
                    wave.spawned = true;
                    // SrpgSummon 재활용으로 적 유닛 스폰
                    if (typeof SrpgSummon !== 'undefined') {
                        const enemyData = $dataEnemies[wave.enemyId];
                        if (enemyData) {
                            const meta = {
                                srpgUnit: "enemy",
                                srpgEnemyId: String(wave.enemyId),
                                srpgTeam: String(wave.zoneTeam || 2),
                                srpgMov: "3",
                                srpgAtkRange: "1"
                            };
                            const spawnEv = SrpgSummon._createSummonEvent(sx, sy, enemyData.name, null);
                            if (spawnEv) {
                                const u = new SrpgUnit(spawnEv, meta);
                                this._units.push(u);
                                if (this._unitMap) this._unitMap.set(spawnEv, u);
                                console.log("[SRPG] Spawn wave: enemy", wave.enemyId, "at", sx, sy, wave.zone ? "(zone)" : "(coord)");
                            }
                        }
                    }
                }
            }
        },

        /** 유닛 사망 시 KO 추적 (SrpgCombat에서 호출) */
        trackKO(unit) {
            if (unit && unit.isActor() && unit.actorId > 0) {
                this._koActorIds = this._koActorIds || [];
                if (!this._koActorIds.includes(unit.actorId)) {
                    this._koActorIds.push(unit.actorId);
                    console.log("[SRPG] Actor KO tracked:", unit.actorId);
                }
            }
        },

        /** 도망전: 유닛 탈출 처리 */
        processEscape(unit) {
            if (this._battleMode !== "escape") return false;
            const params = this._battleModeParams;
            if (!params) return false;
            const ux = unit.event.x, uy = unit.event.y;
            const region = $gameMap.regionId(ux, uy);
            // 리전 기반 체크 OR 구역 타일 직접 체크
            const inEscapeZone = region === params.escapeRegion ||
                (params._escapeZoneTiles && params._escapeZoneTiles.some(t => t.x === ux && t.y === uy));
            if (inEscapeZone) {
                unit._alive = false;
                unit.event.setTransparent(true);
                this._escapedCount = (this._escapedCount || 0) + 1;
                this._addPopup(unit.event.x, unit.event.y, "탈출!", "#44ff44");
                console.log("[SRPG] Unit escaped! Count:", this._escapedCount, "/", params.escapeCount);
                return true;
            }
            return false;
        },

        // ─── 초상화 사전 로드 ───
        _preloadPortraits() {
            const loaded = new Set();
            let pending = 0;
            const onLoad = () => {
                pending--;
                if (pending <= 0) {
                    this._uiDirty = true;
                    if (SrpgUI._portraitCache) SrpgUI._portraitCache = {};
                }
            };
            for (const u of this._units) {
                if (u._portraitType === "face" && u._faceName && !loaded.has("f_" + u._faceName)) {
                    loaded.add("f_" + u._faceName);
                    pending++;
                    const bmp = ImageManager.loadFace(u._faceName);
                    bmp.addLoadListener(onLoad);
                } else if (u._portraitType === "battler" && u._battlerName && !loaded.has("b_" + u._battlerName)) {
                    loaded.add("b_" + u._battlerName);
                    pending++;
                    const bmp = ImageManager.loadEnemy(u._battlerName);
                    bmp.addLoadListener(onLoad);
                }
            }
            if (pending === 0) {
                // 이미 모두 캐시됨
                this._uiDirty = true;
            }
        },

        // ─── 유닛 수집 ───
        _collectUnits() {
            const events = $gameMap.events();
            for (const ev of events) {
                if (!ev || !ev.event()) continue;
                const note = ev.event().note || "";
                const meta = this._parseMeta(note);
                if (meta.srpgUnit === "actor" || meta.srpgUnit === "enemy") {
                    this._units.push(new SrpgUnit(ev, meta));
                } else if (meta.srpgObject === "true") {
                    // 파괴 가능 사물: srpgUnit 없이도 등록 가능 (기본 중립 팀)
                    if (!meta.srpgUnit) meta.srpgUnit = "enemy"; // 내부 타입용 폴백
                    if (!meta.srpgTeam) meta.srpgTeam = "0";     // 팀 0 = 중립
                    this._units.push(new SrpgUnit(ev, meta));
                }
            }
        },

        _parseMeta(note) {
            const meta = {};
            const re = /<(\w+):([^>]+)>/g;
            let m;
            while ((m = re.exec(note)) !== null) {
                meta[m[1]] = m[2].trim();
            }
            return meta;
        },

        // O(1) 이벤트→유닛 룩업
        unitByEvent(ev) {
            return this._unitMap ? this._unitMap.get(ev) || null : null;
        },

        unitAt(x, y) {
            return this._units.find(u => u.isAlive() && u.occupies(x, y)) || null;
        },

        /** 특정 팀의 아군 유닛 (같은 팀 + 동맹 팀) */
        allyUnitsOf(teamId) {
            return this._units.filter(u => u.isAlive() && !u.isObject &&
                (u.teamId === teamId || SrpgAlliance.areAllied(u.teamId, teamId)));
        },
        /** 특정 팀의 적 유닛 */
        enemyUnitsOf(teamId) {
            return this._units.filter(u => u.isAlive() && !u.isObject &&
                SrpgAlliance.areHostile(u.teamId, teamId));
        },
        /** 하위 호환: 플레이어 팀(기본 1)의 아군/적군 */
        allyUnits() {
            const pt = SrpgAlliance._playerTeams;
            return this._units.filter(u => u.isAlive() && !u.isObject &&
                [...pt].some(t => u.teamId === t || SrpgAlliance.areAllied(u.teamId, t)));
        },
        enemyUnits() {
            const pt = SrpgAlliance._playerTeams;
            return this._units.filter(u => u.isAlive() && !u.isObject &&
                ![...pt].some(t => u.teamId === t || SrpgAlliance.areAllied(u.teamId, t)));
        },

        // ─── 배너 ───
        _showBanner(text, color) {
            this._bannerText = text;
            this._bannerColor = color || "#ffffff";
            this._bannerTimer = 90;
        },

        // ─── 데미지 팝업 ───
        _addPopup(x, y, text, color, isShout) {
            this._damagePopups.push({
                x,         // 타일 좌표 그대로 저장
                y,         // 타일 좌표 그대로 저장
                text: String(text),
                color: color || "#ffffff",
                timer: isShout ? 50 : 60,
                oy: 0,
                isShout: !!isShout,
                sprite: null,
            });
        },

        // ─── 화면 좌표 → 타일 좌표 ───
        screenToTile(sx, sy) {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const ox = $gameMap.displayX() * tw;
            const oy = $gameMap.displayY() * th;
            return {
                x: Math.floor((sx + ox) / tw),
                y: Math.floor((sy + oy) / th),
            };
        },

        // ─── 마우스/터치 입력 위치 (타일) ───
        getPointerTile() {
            if (TouchInput.isTriggered()) {
                return this.screenToTile(TouchInput.x, TouchInput.y);
            }
            return null;
        },
        // ─── 마우스 호버 위치 (클릭 없이 이동만으로 감지) ───
        getHoverTile() {
            const x = TouchInput.x;
            const y = TouchInput.y;
            if (x === undefined || y === undefined) return null;
            if (x === 0 && y === 0) return null; // 초기 상태
            return this.screenToTile(x, y);
        },

        // ─── 메인 업데이트 ───
        update() {
            if (!this._battleActive) return;

            // 배너 업데이트
            if (this._bannerTimer > 0) {
                this._bannerTimer--;
                if (this._bannerTimer <= 0 && this._phase === "banner") {
                    this._onBannerDone();
                }
                return; // 배너 중에는 다른 입력 차단
            }

            // 입력 딜레이
            if (this._inputDelay > 0) {
                this._inputDelay--;
                Input.clear(); TouchInput.clear();
                return;
            }

            // 팝업 업데이트는 Spriteset_Map._updatePopups()에서 처리
            // (이중 타이머 감소 방지)

            // 승패 체크 — BattleModeChecker로 모드별 판정
            if (this._phase !== "idle" && this._phase !== "banner" && this._phase !== "battleEnd" && this._phase !== "deployment") {
                const result = BattleModeChecker.check(this._battleMode, this);
                if (result === "defeat") {
                    this._lastBattleResult = "defeat";
                    this._showBanner("패배...", "#ff4444");
                    this._phase = "banner";
                    this._subPhase = "defeat";
                    return;
                } else if (result === "victory") {
                    this._lastBattleResult = "victory";
                    this._showBanner("승리!", "#44ff44");
                    this._phase = "banner";
                    this._subPhase = "victory";
                    return;
                }
                // 방어전: 스폰 웨이브 체크
                if (this._battleMode === "defense") {
                    this._checkSpawnWaves();
                }
            }

            switch (this._phase) {
                case "deployment": this._updateDeployment(); break;
                case "turnAdvance": this._updateTurnAdvance(); break;
                case "playerTurn": this._updatePlayerTurn(); break;
                case "enemyTurn": this._updateEnemyTurn(); break;
                case "combat": this._updateCombat(); break;
                case "battleEnd": break;
            }

            // 턴 예측 갱신 (dirty flag)
            // 현재 페이즈 유닛(미행동 → 행동완료 순) + AP 예측으로 합산
            if (this._turnPredictDirty) {
                const phaseOrder = [];
                // 현재 페이즈 유닛: 미행동 유닛 먼저, 행동완료 유닛 뒤에
                if (this._phaseUnits && this._phaseUnits.length > 0) {
                    const waiting = this._phaseUnits.filter(u =>
                        u.isAlive() && !this._finishedUnits.includes(u));
                    const done = this._phaseUnits.filter(u =>
                        u.isAlive() && this._finishedUnits.includes(u));
                    // 현재 행동 중인 유닛을 맨 앞에
                    if (this._currentUnit && waiting.includes(this._currentUnit)) {
                        phaseOrder.push(this._currentUnit);
                        for (const u of waiting) { if (u !== this._currentUnit) phaseOrder.push(u); }
                    } else {
                        phaseOrder.push(...waiting);
                    }
                    phaseOrder.push(...done);
                }
                // AP 예측으로 나머지 슬롯 채우기
                const futureCount = Math.max(0, TURN_PREDICT_COUNT - phaseOrder.length);
                const futureTurns = futureCount > 0 ? SrpgTurnOrder.predictTurns(futureCount) : [];
                this._predictedTurns = [...phaseOrder, ...futureTurns];
                this._turnPredictDirty = false;
                this._uiDirty = true; // 예측 갱신 시 HUD도 강제 다시 그리기
            }
        },

        _onBannerDone() {
            this._uiDirty = true; // 배너 종료 시 강제 UI 갱신
            if (this._subPhase === "startBanner") {
                // 전투 목표 배너 표시 (있으면)
                const objective = this._battleModeParams && this._battleModeParams.objective;
                if (objective) {
                    this._subPhase = "objectiveBanner";
                    this._bannerText = objective;
                    this._bannerTimer = 120; // 2초
                    return;
                }
                // 목표 없으면 바로 배치/전투
                this._enterDeployOrBattle();
            } else if (this._subPhase === "objectiveBanner") {
                // 목표 배너 종료 → 배치/전투 진입
                this._enterDeployOrBattle();
            } else if (this._subPhase === "victory" || this._subPhase === "defeat") {
                this._phase = "battleEnd";
                this.endBattle();
            } else if (this._subPhase === "bonusBanner") {
                // 보조 행동 배너 후 → 액션 메뉴로 복귀
                this._phase = "playerTurn";
                this._openActionMenu();
            } else if (this._subPhase === "turnStart") {
                // (레거시 호환) 개별 턴 배너 후 → 실제 행동 페이즈
                if (this._currentUnit && this._currentUnit.isPlayerControlled()) {
                    this._phase = "playerTurn";
                    this._subPhase = "awaitCommand";
                    this._showMoveRange();
                    this._inputDelay = 10;
                } else if (this._currentUnit) {
                    this._phase = "enemyTurn";
                    this._subPhase = "thinking";
                    this._enemyThinkTimer = 30;
                }
            }
        },

        // ─── 턴 진행 (BG3 팀 페이즈 + 라운드 분리) ───
        _updateTurnAdvance() {
            // 이전 페이즈의 완료 유닛 목록 즉시 초기화 (투명화 잔류 방지)
            this._finishedUnits = [];
            // 소환물 지속시간 감소 (턴 전환 시)
            if (typeof SrpgSummon !== 'undefined') SrpgSummon.tickSummonDurations();
            // 연속으로 같은 팀 유닛들을 뽑아 하나의 페이즈로 묶기
            const firstUnit = SrpgTurnOrder.advanceToNextTurn();
            if (!firstUnit) {
                this.endBattle();
                return;
            }
            const team = firstUnit.team; // "actor" or "enemy"
            const allTurns = [firstUnit]; // 중복 포함 전체 턴 목록

            // 같은 팀이 연속으로 오는 동안 계속 뽑기 (AP 스냅샷으로 안전 복구)
            const alive = this._units.filter(u => u.isAlive());
            for (let i = 0; i < 20; i++) { // 안전 한도
                const apSnap = new Map();
                alive.forEach(u => apSnap.set(u, u.ap));
                const tickSnap = SrpgTurnOrder._globalTick;

                const peek = SrpgTurnOrder.advanceToNextTurn();
                if (!peek) break;
                if (peek.team === team) {
                    allTurns.push(peek);
                } else {
                    // 다른 팀 → 모든 AP를 peek 이전으로 복구하고 중단
                    alive.forEach(u => u.ap = apSnap.get(u));
                    SrpgTurnOrder._globalTick = tickSnap;
                    break;
                }
            }

            // ── 라운드 분리 ──
            // Round 1: 고유 유닛 1회씩, Round 2+: 추가 턴
            const rounds = [];
            const seen = new Set();
            const extras = [];
            for (const u of allTurns) {
                if (!seen.has(u)) {
                    seen.add(u);
                } else {
                    extras.push(u);
                }
            }
            // Round 1 = 고유 유닛 (등장 순서 유지)
            rounds.push([...seen]);
            // 남은 추가 턴을 다시 라운드로 분리
            if (extras.length > 0) {
                const seen2 = new Set();
                const extras2 = [];
                for (const u of extras) {
                    if (!seen2.has(u)) {
                        seen2.add(u);
                    } else {
                        extras2.push(u);
                    }
                }
                rounds.push([...seen2]);
                // 이론적으로 3라운드 이상도 가능
                if (extras2.length > 0) rounds.push(extras2);
            }

            this._phaseRounds = rounds;
            this._currentRoundIndex = 0;
            this._phaseTeam = team;

            // 첫 라운드 시작
            this._startPhaseRound(0);

            this._turnPredictDirty = true;
            this._uiDirty = true;
        },

        // 페이즈 내 특정 라운드 시작
        _startPhaseRound(roundIdx) {
            this._currentRoundIndex = roundIdx;
            const roundUnits = this._phaseRounds[roundIdx];
            const team = this._phaseTeam;

            // 각 유닛 턴 초기화
            for (const u of roundUnits) {
                this._turnNumber++;
                u._origX = u.x;
                u._origY = u.y;
                u.turnMoveUsed = 0;
                u._segStartX = u.x;
                u._segStartY = u.y;
                // 행동력 복구 + 흑백 색조 원상복귀
                u.mainAction = 1;
                u.bonusAction = 1;
                u.hasMoved = false;
                u.refreshTint();
                // 은신 감지 체크
                if (typeof SrpgVision !== "undefined") {
                    SrpgVision.checkStealthOnTurnStart(u);
                }
                // 스프린트 효과는 사용한 턴에만 유효 → 다음 턴 시작 시 리셋
                if (u._sprintActive) {
                    u._sprintActive = false;
                }
            }

            this._phaseUnits = roundUnits;
            this._finishedUnits = [];

            if (team === "actor") {
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
            } else {
                this._enemyPhaseIndex = 0;
                this._startNextEnemyInPhase();
            }
        },

        // 아군 페이즈에서 유닛 선택 (초기화 시)
        _selectPhaseUnit(unit) {
            this._currentUnit = unit;
            $gamePlayer.locate(unit.x, unit.y);
            $gamePlayer.center(unit.x, unit.y);
        },

        // 아군 페이즈 중 다른 유닛으로 전환
        _switchToPhaseUnit(newUnit) {
            // 현재 유닛 위치 복원 (이동 중이었다면 구간 시작점으로)
            const cur = this._currentUnit;
            if (cur && (cur.x !== cur._segStartX || cur.y !== cur._segStartY)) {
                cur.event.locate(cur._segStartX, cur._segStartY);
            }
            // 상태 정리
            this._movePath = [];
            this._moveRange = [];
            this._moveRangeSet = null;
            this._atkRange = [];
            this._menuItems = null;
            this._radialItems = null;
            this._reelItems = null;
            this._freeMoving = false;

            // 새 유닛 선택
            this._selectPhaseUnit(newUnit);
            this._subPhase = "awaitCommand";
            this._showMoveRange();
            this._inputDelay = 10;
            this._uiDirty = true;
        },

        // 아군 페이즈에서 아직 행동하지 않은 유닛 목록
        _availablePhaseUnits() {
            return this._phaseUnits.filter(u =>
                u.isAlive() && !this._finishedUnits.includes(u)
            );
        },

        // 적군 페이즈: 다음 적 AI 시작
        _startNextEnemyInPhase() {
            while (this._enemyPhaseIndex < this._phaseUnits.length) {
                const u = this._phaseUnits[this._enemyPhaseIndex];
                this._enemyPhaseIndex++;
                if (u.isAlive()) {
                    this._currentUnit = u;
                    $gamePlayer.locate(u.x, u.y);
                    $gamePlayer.center(u.x, u.y);
                    this._phase = "enemyTurn";
                    this._subPhase = "thinking";
                    this._enemyThinkTimer = 30;
                    return;
                }
            }
            // 현재 라운드 완료 → 다음 라운드가 있으면 전환
            if (this._phaseRounds &&
                this._currentRoundIndex < this._phaseRounds.length - 1) {
                this._startPhaseRound(this._currentRoundIndex + 1);
                return;
            }
            // 모든 라운드 완료 → 다음 턴 어드밴스
            this._finishedUnits = [];  // 투명화 즉시 해제
            this._phase = "turnAdvance";
            this._subPhase = "none";
            this._inputDelay = 10;
            this._turnPredictDirty = true;
            this._uiDirty = true;
        },

        // ─── 이동 범위 표시 ───
        _showMoveRange() {
            if (!this._currentUnit) return;
            const remaining = this._currentUnit.remainingMov();
            this._moveRange = SrpgGrid.calcMoveRange(this._currentUnit, remaining);
            // O(1) 검색용 Set 캐시
            this._moveRangeSet = new Set(this._moveRange.map(t => `${t.x},${t.y}`));
            // 구간 범위 저장 (메뉴에서 복귀 시 재활용)
            this._segMoveRange = this._moveRange;
            this._segMoveRangeSet = this._moveRangeSet;
            // 공격 위협 범위 (이동범위 외곽의 공격 가능 타일)
            this._moveAtkThreat = this._calcAtkThreatRange(this._currentUnit, this._moveRange);
            this._atkRange = [];
            this._uiDirty = true;
        },

        // 공격 범위 표시 (이동 후)
        _showAtkRange() {
            if (!this._currentUnit) return;
            this._atkRange = SrpgGrid.calcAtkRange(this._currentUnit);
        },

        // ─── 플레이어 턴 ───
        _updatePlayerTurn() {
            // 브라우즈 모드에서는 _currentUnit이 null일 수 있음
            if (this._subPhase !== "browse" &&
                (!this._currentUnit || !this._currentUnit.isAlive())) {
                this._endCurrentTurn();
                return;
            }

            switch (this._subPhase) {
                case "browse": this._handleBrowse(); break;
                case "awaitCommand": this._handleAwaitCommand(); break;
                case "moving": this._handleMoving(); break;
                case "radialMenu": this._handleRadialMenu(); break;
                case "subRadial": this._handleSubRadial(); break;
                case "slotReel": this._handleSlotReel(); break;
                case "selectTarget": this._handleSelectTarget(); break;
                case "combatPreview": this._handleCombatPreview(); break;
                case "executing": this._handleExecuting(); break;
                case "faceDirection": this._handleFaceDirection(); break;
                case "selectThrowTarget": this._handleSelectThrowTarget(); break;
                case "selectBonusTarget": this._handleSelectBonusTarget(); break;
            }
        },

        // ─── 공격 위협 범위 계산 (이동범위 외곽에서 공격 가능한 타일) ───
        _calcAtkThreatRange(unit, moveRange) {
            const moveSet = new Set(moveRange.map(t => `${t.x},${t.y}`));
            const threatSet = new Set();
            const resolved = resolveReach(unit, null);
            for (const tile of moveRange) {
                const dir = unit.event ? unit.event.direction() : 8;
                const atkTiles = tilesToAbsolute(resolved.tiles, tile.x, tile.y, dir, resolved.rotate);
                for (const at of atkTiles) {
                    const key = `${at.x},${at.y}`;
                    if (!moveSet.has(key) && SrpgGrid.inBounds(at.x, at.y)) {
                        threatSet.add(key);
                    }
                }
            }
            return [...threatSet].map(k => {
                const [x, y] = k.split(",").map(Number);
                return { x, y };
            });
        },

        // ─── 브라우즈 모드: 유닛 선택 전 자유 정찰 ───
        _handleBrowse() {
            // ─── 마우스 화면 가장자리 스크롤 ───
            this._browseEdgeScroll();

            // 마우스 호버 → 유닛 정보 표시 (마우스가 실제로 움직였을 때만)
            const hover = this.getHoverTile();
            const mx = TouchInput.x, my = TouchInput.y;
            const mouseMoved = (mx !== this._browseLastMx || my !== this._browseLastMy);
            if (mouseMoved) {
                this._browseLastMx = mx;
                this._browseLastMy = my;
            }
            if (hover && mouseMoved) {
                const hoverUnit = this.unitAt(hover.x, hover.y);
                if (hoverUnit && hoverUnit.isAlive() && hoverUnit !== this._browseUnit) {
                    this._browseUnit = hoverUnit;
                    // 해당 유닛의 이동 범위 + 공격 위협 범위 계산
                    const movRange = SrpgGrid.calcMoveRange(hoverUnit, hoverUnit.mov);
                    this._browseRange = movRange;
                    this._browseAtkThreat = this._calcAtkThreatRange(hoverUnit, movRange);
                    this._uiDirty = true;
                } else if (!hoverUnit && this._browseUnit) {
                    this._browseUnit = null;
                    this._browseRange = [];
                    this._browseAtkThreat = [];
                    this._uiDirty = true;
                }
            }

            // 클릭 처리
            const pt = this.getPointerTile();
            if (pt) {
                const clickedUnit = this.unitAt(pt.x, pt.y);
                if (clickedUnit && clickedUnit.isAlive()) {
                    if (clickedUnit.isPlayerControlled()) {
                        // 아군 클릭 → 행동 가능하면 선택 후 awaitCommand
                        const avail = this._availablePhaseUnits();
                        if (avail.includes(clickedUnit)) {
                            this._browseUnit = null;
                            this._browseRange = [];
                            this._browseAtkThreat = [];
                            this._browseCursorX = null;
                            this._browseCursorY = null;
                            this._selectPhaseUnit(clickedUnit);
                            this._subPhase = "awaitCommand";
                            this._showMoveRange();
                            this._inputDelay = 8;
                            return;
                        }
                    }
                    // 적군 or 행동완료 아군 클릭 → 범위 표시 고정 (이미 호버에서 처리)
                }
            }

            // ─── 키보드: 방향키로 커서(가상 위치) 이동 + 카메라 추적 ───
            // isRepeated = 누르는 동안 반복(처음 트리거 + 리피트)
            let browseDir = null;
            if (Input.isRepeated("up"))    browseDir = "up";
            if (Input.isRepeated("down"))  browseDir = "down";
            if (Input.isRepeated("left"))  browseDir = "left";
            if (Input.isRepeated("right")) browseDir = "right";
            if (browseDir) {
                // 커서 위치 이동 (유닛 없어도 이동)
                this._browseMoveCursor(browseDir);
            }

            // 키보드: Tab으로 아군 유닛 순회
            if (Input.isTriggered("pagedown") || Input.isTriggered("tab")) {
                const avail = this._availablePhaseUnits();
                if (avail.length > 0) {
                    const curIdx = this._browseUnit ? avail.indexOf(this._browseUnit) : -1;
                    const next = avail[(curIdx + 1) % avail.length];
                    this._browseSetUnit(next);
                }
            }

            // Enter/Z: 현재 호버 유닛이 아군이면 선택, 없으면 첫 유닛 선택
            if (Input.isTriggered("ok")) {
                const avail = this._availablePhaseUnits();
                if (this._browseUnit && this._browseUnit.isPlayerControlled() &&
                    avail.includes(this._browseUnit)) {
                    this._selectPhaseUnit(this._browseUnit);
                } else if (avail.length > 0) {
                    this._selectPhaseUnit(avail[0]);
                }
                this._browseUnit = null;
                this._browseRange = [];
                this._browseAtkThreat = [];
                this._browseCursorX = null;
                this._browseCursorY = null;
                this._subPhase = "awaitCommand";
                this._showMoveRange();
                this._inputDelay = 8;
                return;
            }
        },

        // ─── 브라우즈: 유닛에 커서를 설정하고 범위 표시 ───
        // ─── 브라우즈: 마우스 화면 가장자리 스크롤 ───
        _browseEdgeScroll() {
            const edgeMargin = 30;  // 가장자리 감지 영역 (px)
            const scrollSpeed = 0.15; // 스크롤 속도 (타일/프레임)
            const mx = TouchInput.x, my = TouchInput.y;
            // 마우스가 화면 밖이거나 (0,0)이면 스킵
            if ((mx <= 0 && my <= 0) || mx < 0 || my < 0) return;
            if (mx > Graphics.width || my > Graphics.height) return;

            let sdx = 0, sdy = 0;
            if (mx < edgeMargin) sdx = -scrollSpeed;
            else if (mx > Graphics.width - edgeMargin) sdx = scrollSpeed;
            if (my < edgeMargin) sdy = -scrollSpeed;
            else if (my > Graphics.height - edgeMargin) sdy = scrollSpeed;

            if (sdx !== 0 || sdy !== 0) {
                // 맵 범위 제한 (scrollDown/scrollRight 등 사용)
                const newDx = $gameMap.displayX() + sdx;
                const newDy = $gameMap.displayY() + sdy;
                const maxDx = $gameMap.width() - $gameMap.screenTileX();
                const maxDy = $gameMap.height() - $gameMap.screenTileY();
                $gameMap._displayX = Math.max(0, Math.min(maxDx, newDx));
                $gameMap._displayY = Math.max(0, Math.min(maxDy, newDy));
            }
        },

        // ─── 브라우즈: 키보드 커서 이동 (유닛 간 점프가 아닌 타일 단위 이동) ───
        _browseMoveCursor(dir) {
            // 커서 위치 초기화 (browseUnit이 있으면 그 위치, 없으면 화면 중앙)
            if (this._browseCursorX == null) {
                if (this._browseUnit) {
                    this._browseCursorX = this._browseUnit.x;
                    this._browseCursorY = this._browseUnit.y;
                } else {
                    const tw = $gameMap.tileWidth();
                    const th = $gameMap.tileHeight();
                    this._browseCursorX = Math.floor($gameMap.displayX() + Graphics.width / tw / 2);
                    this._browseCursorY = Math.floor($gameMap.displayY() + Graphics.height / th / 2);
                }
            }
            switch (dir) {
                case "up":    this._browseCursorY--; break;
                case "down":  this._browseCursorY++; break;
                case "left":  this._browseCursorX--; break;
                case "right": this._browseCursorX++; break;
            }
            // 맵 범위 클램핑
            this._browseCursorX = Math.max(0, Math.min($gameMap.width() - 1, this._browseCursorX));
            this._browseCursorY = Math.max(0, Math.min($gameMap.height() - 1, this._browseCursorY));

            // 카메라 추적
            $gamePlayer.center(this._browseCursorX, this._browseCursorY);

            // 커서 위치에 유닛이 있으면 정보 표시
            const curUnit = this.unitAt(this._browseCursorX, this._browseCursorY);
            if (curUnit && curUnit.isAlive()) {
                if (curUnit !== this._browseUnit) {
                    this._browseUnit = curUnit;
                    const movRange = SrpgGrid.calcMoveRange(curUnit, curUnit.mov);
                    this._browseRange = movRange;
                    this._browseAtkThreat = this._calcAtkThreatRange(curUnit, movRange);
                    this._uiDirty = true;
                }
            } else if (this._browseUnit) {
                this._browseUnit = null;
                this._browseRange = [];
                this._browseAtkThreat = [];
                this._uiDirty = true;
            }
        },

        _browseSetUnit(unit) {
            this._browseUnit = unit;
            this._browseCursorX = unit.x;
            this._browseCursorY = unit.y;
            $gamePlayer.center(unit.x, unit.y);
            const movRange = SrpgGrid.calcMoveRange(unit, unit.mov);
            this._browseRange = movRange;
            this._browseAtkThreat = this._calcAtkThreatRange(unit, movRange);
            this._uiDirty = true;
        },

        // ─── 브라우즈: 방향키로 가장 가까운 유닛 탐색 ───
        // 현재 browseUnit 기준으로 지정 방향에 있는 가장 가까운 유닛 반환
        // browseUnit이 없으면 턴오더 첫 번째 아군부터 시작
        _browseFindUnit(dir) {
            const allAlive = this._units.filter(u => u.isAlive());
            if (allAlive.length === 0) return null;

            // 현재 커서 유닛이 없으면 → 첫 번째 아군 (행동 가능한 유닛 우선)
            if (!this._browseUnit) {
                const avail = this._availablePhaseUnits();
                if (avail.length > 0) return avail[0];
                return allAlive[0];
            }

            const cx = this._browseUnit.x;
            const cy = this._browseUnit.y;

            // 방향에 따른 필터: 해당 방향에 있는 유닛만 후보
            let candidates = [];
            for (const u of allAlive) {
                if (u === this._browseUnit) continue;
                const dx = u.x - cx;
                const dy = u.y - cy;
                let valid = false;
                switch (dir) {
                    case "up":    valid = dy < 0; break;
                    case "down":  valid = dy > 0; break;
                    case "left":  valid = dx < 0; break;
                    case "right": valid = dx > 0; break;
                }
                if (valid) {
                    // 주 방향 거리 + 보조 방향 페널티 (대각선보다 직선 우선)
                    const mainDist = (dir === "up" || dir === "down")
                        ? Math.abs(dy) : Math.abs(dx);
                    const subDist = (dir === "up" || dir === "down")
                        ? Math.abs(dx) : Math.abs(dy);
                    const score = mainDist + subDist * 0.5;
                    candidates.push({ unit: u, score });
                }
            }

            // 해당 방향에 아무도 없으면 → 반대편 끝에서 가장 먼 유닛 (순환)
            if (candidates.length === 0) {
                for (const u of allAlive) {
                    if (u === this._browseUnit) continue;
                    const dx = u.x - cx;
                    const dy = u.y - cy;
                    const mainDist = (dir === "up" || dir === "down")
                        ? Math.abs(dy) : Math.abs(dx);
                    const subDist = (dir === "up" || dir === "down")
                        ? Math.abs(dx) : Math.abs(dy);
                    const score = -mainDist + subDist * 0.5;
                    candidates.push({ unit: u, score });
                }
            }

            if (candidates.length === 0) return null;
            candidates.sort((a, b) => a.score - b.score);
            return candidates[0].unit;
        },

        _handleAwaitCommand() {
            const unit = this._currentUnit;

            // ─── 이동 애니메이션 진행 중 → 카메라 추적만 ───
            if (unit.event.isMoving()) {
                $gamePlayer._realX = unit.event._realX;
                $gamePlayer._realY = unit.event._realY;
                return;
            }

            // 이동 스텝 완료 직후 → 카메라 확정 + UI 갱신
            if (this._freeMoving) {
                this._freeMoving = false;
                $gamePlayer.locate(unit.x, unit.y);
                this._uiDirty = true;
            }

            // ─── 마우스/터치: 타일 클릭 ───
            const pt = this.getPointerTile();
            if (pt) {
                // 다른 아군 유닛 클릭 → 유닛 전환 (이동 범위보다 우선)
                const clickedAlly = this._availablePhaseUnits().find(
                    u => u !== unit && u.x === pt.x && u.y === pt.y
                );
                if (clickedAlly) {
                    this._switchToPhaseUnit(clickedAlly);
                    return;
                }
                const inRange = this._moveRangeSet && this._moveRangeSet.has(`${pt.x},${pt.y}`);
                if (inRange) {
                    if (pt.x === unit.x && pt.y === unit.y) {
                        unit.event.setThrough(false);
                        this._openActionMenu();
                        return;
                    }
                    this._startUnitMove(pt.x, pt.y);
                    return;
                }
            }

            // ─── 키보드: 방향키 꾹 누르면 연속 이동 (RMMZ 스타일) ───
            const dir = Input.dir4;
            if (dir > 0) {
                let nx = unit.x, ny = unit.y;
                if (dir === 6) nx++;
                else if (dir === 4) nx--;
                else if (dir === 2) ny++;
                else if (dir === 8) ny--;

                const inRange = this._moveRangeSet && this._moveRangeSet.has(`${nx},${ny}`);
                if (inRange) {
                    unit.event.setThrough(true);
                    unit.event.setMoveSpeed(getSrpgMoveSpeed());
                    unit.event.moveStraight(dir);
                    this._freeMoving = true;
                } else {
                    // 범위 밖이면 방향만 전환
                    unit.event.setDirection(dir);
                }
                return;
            }

            // ─── 이동 안 할 때 through 해제 ───
            unit.event.setThrough(false);
            unit.event.setMoveSpeed(getSrpgMoveSpeed());

            // Enter/Z: 현재 위치에서 행동 메뉴
            if (Input.isTriggered("ok")) {
                this._openActionMenu();
                return;
            }

            // Tab / pagedown: 다음 아군 유닛으로 전환
            if (Input.isTriggered("pagedown") || Input.isTriggered("tab")) {
                const avail = this._availablePhaseUnits();
                if (avail.length > 1) {
                    const idx = avail.indexOf(unit);
                    const next = avail[(idx + 1) % avail.length];
                    this._switchToPhaseUnit(next);
                    return;
                }
            }

            // Escape / 우클릭: 구간 시작점으로 복귀 → 브라우즈 모드
            if (Input.isTriggered("escape") || TouchInput.isCancelled()) {
                if (unit.x !== unit._segStartX || unit.y !== unit._segStartY) {
                    // 이동 중이었다면 시작점으로 복귀
                    unit.event.locate(unit._segStartX, unit._segStartY);
                    $gamePlayer.locate(unit._segStartX, unit._segStartY);
                    $gamePlayer.center(unit._segStartX, unit._segStartY);
                    this._moveRange = this._segMoveRange;
                    this._moveRangeSet = this._segMoveRangeSet;
                    this._uiDirty = true;
                } else {
                    // 시작점에 있으면 브라우즈 모드로 복귀
                    this._currentUnit = null;
                    this._subPhase = "browse";
                    this._browseUnit = null;
                    this._browseRange = [];
                    this._browseAtkThreat = [];
                    this._browseLastMx = -1;
                    this._browseLastMy = -1;
                    this._moveRange = [];
                    this._atkRange = [];
                    this._uiDirty = true;
                }
            }
        },

        _startUnitMove(tx, ty) {
            const unit = this._currentUnit;
            const path = SrpgGrid.findPath(unit, tx, ty, this._moveRange);
            if (path.length === 0) return;
            unit.event.setThrough(false); // startMovePath이 through 관리함
            unit.startMovePath(path);
            this._subPhase = "moving";
            // 범위 숨기되 캐시는 유지 (이동취소 시 복원용)
            this._moveRange = [];
            this._moveAtkThreat = [];
            this._movePath = [];
            this._atkRange = [];
        },

        _handleMoving() {
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
        },

        // ─── 행동 메뉴 ───
        // ─── BG3식 보조 행동 정의 ───
        _getBonusActions(unit) {
            const actions = [];
            // ─── 밀치기: 근력 기반, 인접 1칸 밀기 ───
            actions.push({
                id: "shove", label: "밀치기", cost: 1,
                desc: "인접 대상을 1칸 밀어냄 (근력 기반)",
                range: 1, needTarget: true, targetHostile: false, // 피아 무관
            });
            // ─── 방향전환: 무소비 ───
            actions.push({
                id: "faceDir", label: "방향전환", cost: 0,
                desc: "바라보는 방향을 변경 (무소비)",
                range: 0, needTarget: false, targetHostile: false,
                free: true,
            });

            // ─── 핫키 아이템 사용 (GridInventory 연동) ───
            if (unit.isActor() && unit.actorId > 0 && typeof Game_GridInventory !== 'undefined') {
                try {
                    const actor = $gameActors.actor(unit.actorId);
                    if (actor && actor.gridInventory) {
                        const inv = actor.gridInventory();
                        const hkCount = inv.hotkeyCount();
                        for (let hi = 0; hi < hkCount; hi++) {
                            const dataItem = inv.hotkeyItem(hi);
                            if (!dataItem) continue;
                            // 소비 아이템만 (itypeId === 1)
                            if (dataItem.itypeId !== 1) continue;
                            actions.push({
                                id: "useHotkey_" + hi, label: dataItem.name,
                                cost: 1,
                                desc: dataItem.description || "핫키 아이템 사용",
                                range: 0, needTarget: false, targetHostile: false,
                                hotkeySlot: hi, hotkeyItemId: dataItem.id,
                                icon: dataItem.iconIndex || 0,
                            });
                        }
                    }
                } catch (e) {
                    console.warn('[SRPG] Hotkey item load error:', e.message);
                }
            }

            return actions;
        },

        // ─── 주요 행동 서브메뉴 구성 ───
        _getMainActions(unit) {
            const actions = [];
            // 일반 공격
            const atkTiles = SrpgGrid.calcAtkRange(unit);
            const hasTargets = atkTiles.some(t => {
                const u = this.unitAt(t.x, t.y);
                return u && unit.isHostileTo(u) && u.isAlive();
            });
            actions.push({
                id: "attack", label: "일반 공격", cost: 1, costType: "main",
                enabled: hasTargets, desc: "기본 물리 공격",
                mpCost: 0,
            });
            // 스킬 목록 (액터 데이터베이스 기반)
            if (unit.isActor() && unit._data) {
                const classId = unit._data.classId || 1;
                const cls = $dataClasses[classId];
                if (cls && cls.learnings) {
                    for (const learning of cls.learnings) {
                        if (learning.level <= unit.level) {
                            const skill = $dataSkills[learning.skillId];
                            if (skill && skill.stypeId > 0) { // stypeId 0은 일반공격
                                const canUse = unit.mp >= skill.mpCost;
                                // TODO: hasTargets는 기본공격 사거리 기준 — 스킬별 사거리 검증 추가 필요
                                actions.push({
                                    id: "skill_" + skill.id, label: skill.name,
                                    cost: 1, costType: "main",
                                    enabled: canUse && hasTargets,
                                    desc: skill.description || "",
                                    mpCost: skill.mpCost,
                                    skillId: skill.id,
                                });
                            }
                        }
                    }
                }
            }
            // ─── 오브젝트 던지기: 주행동, 인접 비-heavy 오브젝트 투척 ───
            // 인접 타일에 던질 수 있는 오브젝트가 있는지 확인
            const adjObjs = [];
            const dirs4 = [{dx:0,dy:1},{dx:0,dy:-1},{dx:-1,dy:0},{dx:1,dy:0}];
            for (const dd of dirs4) {
                const ax = unit.x + dd.dx, ay = unit.y + dd.dy;
                const ou = this.unitAt(ax, ay);
                if (ou && ou.isObject && ou.isAlive() && (!ou.objectFlags || !ou.objectFlags.has("heavy"))) {
                    adjObjs.push(ou);
                }
            }
            if (adjObjs.length > 0) {
                actions.push({
                    id: "throwObj", label: "던지기", cost: 1, costType: "main",
                    enabled: true,
                    desc: "인접 오브젝트를 투척 (근력 기반 피해)",
                    adjObjects: adjObjs,
                });
            }

            // ─── 숨기: 주행동, 민첩 기반, 은신 상태 진입 ───
            actions.push({
                id: "hide", label: "숨기", cost: 1, costType: "main",
                enabled: true,
                desc: "은신 상태 진입 (민첩 기반, 스킬 은신보다 성능 열위)",
            });

            // ─── 스프린트: 주행동, 1턴간 이동범위 1.5배 ───
            actions.push({
                id: "sprint", label: "전력질주", cost: 1, costType: "main",
                enabled: !unit._sprintUsed,
                desc: "이번 턴 이동가능 범위 1.5배 (1턴 한정)",
            });

            return actions;
        },

        _openActionMenu() {
            const unit = this._currentUnit;
            this._subPhase = "radialMenu";
            this._moveRange = [];
            this._moveAtkThreat = [];
            this._uiDirty = true;
            this._menuDepth = 0;
            this._menuParentId = null;

            // ─── 라디얼 메뉴 상태 초기화 ───
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;
            // 캐릭터 중심 (tilemap 좌표)
            this._radialCenter = {
                x: (unit.x + 0.5) * tw,
                y: (unit.y + 0.5) * th
            };
            const rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            this._radialRadius = Math.round(95 * rs);
            this._radialInnerR = Math.round(55 * rs);
            this._radialHover = 0;      // 첫 항목 기본 선택 (키보드 대응)
            this._radialAnimFrame = 0;  // 팝인 애니메이션 프레임 (0~10)
            this._radialInputMode = "keyboard";  // 초기: 키보드 모드
            this._radialLastMx = -1;
            this._radialLastMy = -1;

            // 루트 라디얼: 행동 / 대기 / 취소 (통일 색조: 어두운 남색 기반)
            const canAct = unit.canMainAct() || unit.canBonusAct();
            const canMove = this._segMoveRange && this._segMoveRange.length > 1;
            const canCancel = unit.x !== unit._segStartX || unit.y !== unit._segStartY;
            const RC = 0x2a3a5c; // 라디얼 기본 색조 (어두운 남색)
            const items = [];
            items.push({ id: "action", label: "행동", enabled: canAct,
                angle: -90, color: 0x3a5a8c, accent: 0x6699cc });
            if (canMove) {
                items.push({ id: "move", label: "이동", enabled: true,
                    angle: 150, color: 0x3a5c4a, accent: 0x66aa77 });
            }
            items.push({ id: "wait", label: "대기", enabled: true,
                angle: 150, color: 0x3a3a4c, accent: 0x7777aa });
            if (canCancel) {
                items.push({ id: "cancel", label: "취소", enabled: true,
                    angle: 30, color: 0x5c3a3a, accent: 0xaa6666 });
            }
            // 홀수 개 → 더미 추가하여 짝수로 맞춤 (키보드 조작 개선)
            if (items.length % 2 !== 0) {
                items.push({ id: "__dummy__", label: "", enabled: false,
                    angle: 0, color: 0x2a2a3c, accent: 0x2a2a3c, dummy: true });
            }
            // 균등 분배 각도
            const n = items.length;
            for (let i = 0; i < n; i++) {
                items[i].angle = -90 + (360 / n) * i;
            }

            this._radialItems = items;
            this._menuItems = items; // 호환성 유지
            this._menuIndex = 0;
            this._atkRange = SrpgGrid.calcAtkRange(unit);
            this._inputDelay = 8;

            // 슬롯릴 상태 초기화
            this._reelItems = null;
            this._reelScrollY = 0;
            this._reelTargetIdx = 0;
            this._reelParentId = null;
        },

        // ─── 서브메뉴 열기 (슬롯릴 호환) ───
        _openSubmenu(parentId) {
            const unit = this._currentUnit;
            this._menuDepth = 1;
            this._menuParentId = parentId;
            this._menuIndex = 0;
            this._uiDirty = true;

            // 슬롯릴로 열기
            this._reelParentId = parentId;
            if (parentId === "mainAction") {
                this._reelItems = this._getMainActions(unit);
            } else if (parentId === "bonusAction") {
                this._reelItems = this._getBonusActions(unit);
            }
            if (this._reelItems && this._reelItems.length > 0) {
                this._reelTargetIdx = 0;
                this._reelScrollY = 0;
                this._subPhase = "slotReel";
                this._radialAnimFrame = 0;
            }
        },

        // ─── 루트 라디얼 메뉴로 복귀 ───
        _returnToRootMenu() {
            this._menuDepth = 0;
            this._menuParentId = null;
            this._reelItems = null;
            this._openActionMenu();
        },

        // ─── 서브 라디얼 열기 (행동 → 주행동/보조행동) ───
        _openSubRadial() {
            this._subPhase = "subRadial";
            this._radialHover = 0;      // 첫 항목 기본 선택
            this._radialAnimFrame = 0;
            this._radialInputMode = "keyboard";
            this._radialLastMx = -1;
            this._radialLastMy = -1;
            this._uiDirty = true;

            const unit = this._currentUnit;
            const items = [];
            if (unit.canMainAct()) {
                items.push({ id: "mainAction", label: "주 행동", enabled: true,
                    angle: -90, color: 0x3a5a8c, accent: 0x6699cc });
            }
            if (unit.canBonusAct()) {
                items.push({ id: "bonusAction", label: "보조 행동", enabled: true,
                    angle: 150, color: 0x3a4a6c, accent: 0x6688bb });
            }
            // 홀수 개 → 더미 추가
            if (items.length % 2 !== 0) {
                items.push({ id: "__dummy__", label: "", enabled: false,
                    angle: 0, color: 0x2a2a3c, accent: 0x2a2a3c, dummy: true });
            }
            // 균등 분배
            const n = items.length;
            for (let i = 0; i < n; i++) {
                items[i].angle = -90 + (360 / n) * i;
            }
            this._radialItems = items;
        },

        // ─── 메뉴 레이아웃 계산 (레거시 호환) ───
        _calcMenuLayout() {
            const items = this._menuItems || [];
            const rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            const itemH = Math.round(28 * rs);
            const pad = Math.round(6 * rs);
            const menuW = Math.round((this._menuDepth === 1 ? 210 : 160) * rs);
            const menuH = items.length * itemH + pad * 2;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;
            const menuX = Graphics.width / 2 - menuW / 2 + scrollX;
            const menuY = Graphics.height / 2 - menuH / 2 + scrollY;
            return { items, itemH, pad, menuW, menuH, menuX, menuY };
        },

        // ─── 라디얼 공통: 마우스→호버 인덱스 ───
        _radialHitTest(mx, my) {
            if (!this._radialItems || !this._radialCenter) return -1;
            const cx = this._radialCenter.x;
            const cy = this._radialCenter.y;
            const dx = mx - cx, dy = my - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const innerR = this._radialInnerR || 55;
            if (dist < innerR - 5 || dist > this._radialRadius + 25) return -1;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI; // -180~180
            const items = this._radialItems;
            const n = items.length;
            const arcSize = 360 / n;
            for (let i = 0; i < n; i++) {
                let a = items[i].angle;
                let diff = angle - a;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                if (Math.abs(diff) < arcSize / 2) return i;
            }
            return -1;
        },

        // ─── 방향키 → 가장 가까운 버튼 직행 ───
        _radialFindByDirection(items, targetAngle) {
            let best = -1, bestDist = 999;
            for (let i = 0; i < items.length; i++) {
                if (items[i].dummy) continue;
                let diff = items[i].angle - targetAngle;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                if (Math.abs(diff) < bestDist) {
                    bestDist = Math.abs(diff);
                    best = i;
                }
            }
            return best;
        },

        // ─── 라디얼 메뉴 입력 처리 (루트) ───
        _handleRadialMenu() {
            if (!this._radialItems) return;
            // 팝인 애니메이션
            if (this._radialAnimFrame < 10) {
                this._radialAnimFrame++;
                this._uiDirty = true;
            }

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;
            const mx = TouchInput.x + scrollX;
            const my = TouchInput.y + scrollY;
            const items = this._radialItems;
            const n = items.length;

            // 마우스 호버 (마우스가 실제로 움직였을 때만 적용)
            const mouseMoved = (mx !== this._radialLastMx || my !== this._radialLastMy);
            if (mouseMoved) {
                this._radialLastMx = mx;
                this._radialLastMy = my;
                const hIdx = this._radialHitTest(mx, my);
                if (hIdx >= 0 && hIdx !== this._radialHover) {
                    this._radialHover = hIdx;
                    this._radialInputMode = "mouse";
                    this._uiDirty = true;
                }
            }

            // 키보드 방향키 → 해당 방향 버튼으로 직행
            let kbDir = -1;
            if (Input.isTriggered("up"))    kbDir = -90;
            if (Input.isTriggered("right")) kbDir = 0;
            if (Input.isTriggered("down"))  kbDir = 90;
            if (Input.isTriggered("left"))  kbDir = 180;
            if (kbDir !== -1) {
                const found = this._radialFindByDirection(items, kbDir);
                if (found >= 0) {
                    this._radialHover = found;
                    this._radialInputMode = "keyboard";
                    this._uiDirty = true;
                }
            }

            // 클릭 or OK
            const clickIdx = TouchInput.isTriggered() ? this._radialHitTest(mx, my) : -1;
            if (clickIdx >= 0 && items[clickIdx].enabled) {
                this._radialSelectItem(items[clickIdx]);
                return;
            }
            if (Input.isTriggered("ok") && this._radialHover >= 0 && items[this._radialHover].enabled) {
                this._radialSelectItem(items[this._radialHover]);
                return;
            }

            // ESC / 우클릭 / 클릭 바깥
            let esc = Input.isTriggered("escape") || TouchInput.isCancelled();
            if (TouchInput.isTriggered() && clickIdx < 0) esc = true;

            if (esc) {
                // 루트 라디얼 → 이동 상태로 복귀
                const unit = this._currentUnit;
                if (unit.x !== unit._segStartX || unit.y !== unit._segStartY) {
                    unit.event.locate(unit._segStartX, unit._segStartY);
                    $gamePlayer.locate(unit._segStartX, unit._segStartY);
                    $gamePlayer.center(unit._segStartX, unit._segStartY);
                }
                this._subPhase = "awaitCommand";
                this._moveRange = this._segMoveRange || [];
                this._moveRangeSet = this._segMoveRangeSet || new Set();
                this._atkRange = [];
                this._menuItems = null;
                this._radialItems = null;
                this._reelItems = null;
                this._inputDelay = 8;
                this._uiDirty = true;
            }
        },

        // ─── 루트 라디얼 항목 선택 ───
        _radialSelectItem(item) {
            switch (item.id) {
                case "action":
                    this._openSubRadial();
                    break;
                case "move":
                    this._executeMenuItem({ id: "move", enabled: true });
                    break;
                case "wait":
                    this._executeMenuItem({ id: "wait", enabled: true });
                    break;
                case "cancel":
                    this._executeMenuItem({ id: "cancel", enabled: true });
                    break;
            }
        },

        // ─── 서브 라디얼 입력 처리 ───
        _handleSubRadial() {
            if (!this._radialItems) return;
            if (this._radialAnimFrame < 10) {
                this._radialAnimFrame++;
                this._uiDirty = true;
            }

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;
            const mx = TouchInput.x + scrollX;
            const my = TouchInput.y + scrollY;
            const items = this._radialItems;
            const n = items.length;

            // 마우스 호버 (움직였을 때만)
            const mouseMoved = (mx !== this._radialLastMx || my !== this._radialLastMy);
            let hIdx = -1;
            if (mouseMoved) {
                this._radialLastMx = mx;
                this._radialLastMy = my;
                hIdx = this._radialHitTest(mx, my);
                if (hIdx >= 0 && hIdx !== this._radialHover) {
                    this._radialHover = hIdx;
                    this._radialInputMode = "mouse";
                    this._uiDirty = true;
                }
            } else {
                hIdx = this._radialHitTest(mx, my);
            }

            // 키보드 방향키 → 해당 방향 버튼으로 직행
            let kbDir = -1;
            if (Input.isTriggered("up"))    kbDir = -90;
            if (Input.isTriggered("right")) kbDir = 0;
            if (Input.isTriggered("down"))  kbDir = 90;
            if (Input.isTriggered("left"))  kbDir = 180;
            if (kbDir !== -1) {
                const found = this._radialFindByDirection(items, kbDir);
                if (found >= 0) {
                    this._radialHover = found;
                    this._radialInputMode = "keyboard";
                    this._uiDirty = true;
                }
            }

            if (TouchInput.isTriggered() && hIdx >= 0 && items[hIdx].enabled) {
                this._openSubmenu(items[hIdx].id);
                return;
            }
            if (Input.isTriggered("ok") && this._radialHover >= 0 && items[this._radialHover].enabled) {
                this._openSubmenu(items[this._radialHover].id);
                return;
            }

            let esc = Input.isTriggered("escape") || TouchInput.isCancelled();
            if (TouchInput.isTriggered() && hIdx < 0) esc = true;
            if (esc) {
                // 서브 라디얼 → 루트 라디얼로 복귀
                this._returnToRootMenu();
            }
        },

        // ─── 슬롯릴 입력 처리 ───
        _handleSlotReel() {
            if (!this._reelItems || this._reelItems.length === 0) return;
            const items = this._reelItems;
            const n = items.length;

            // 스무스 스크롤 (lerp)
            const diff = this._reelTargetIdx - this._reelScrollY;
            if (Math.abs(diff) > 0.01) {
                this._reelScrollY += diff * 0.25;
                this._uiDirty = true;
            } else {
                this._reelScrollY = this._reelTargetIdx;
            }

            // 팝인 애니메이션
            if (this._radialAnimFrame < 10) {
                this._radialAnimFrame++;
                this._uiDirty = true;
            }

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;

            // 릴 위치 계산 (캐릭터 우측 또는 좌측)
            const cx = this._radialCenter.x;
            const cy = this._radialCenter.y;
            const screenCX = cx - scrollX;
            const rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            const reelW = Math.round(180 * rs);
            const reelOnRight = screenCX < Graphics.width / 2;
            const reelOff = Math.round(50 * rs);
            const reelX = reelOnRight ? cx + reelOff : cx - reelOff - reelW;
            const reelY = cy - Math.round(120 * rs);

            // 마우스 호버 → 릴 내 항목 클릭
            const mx = TouchInput.x + scrollX;
            const my = TouchInput.y + scrollY;

            // 마우스 휠 스크롤
            if (TouchInput.wheelY < 0) {
                this._reelTargetIdx = (this._reelTargetIdx - 1 + n) % n;
                this._uiDirty = true;
            } else if (TouchInput.wheelY > 0) {
                this._reelTargetIdx = (this._reelTargetIdx + 1) % n;
                this._uiDirty = true;
            }

            // 키보드 스크롤
            if (Input.isTriggered("up") || Input.isRepeated("up")) {
                this._reelTargetIdx = (this._reelTargetIdx - 1 + n) % n;
                this._uiDirty = true;
            }
            if (Input.isTriggered("down") || Input.isRepeated("down")) {
                this._reelTargetIdx = (this._reelTargetIdx + 1) % n;
                this._uiDirty = true;
            }

            // 중앙 아이템 클릭 → 확인
            const centerItemY = cy - 18;
            const centerItemH = 36;
            if (TouchInput.isTriggered()) {
                if (mx >= reelX && mx <= reelX + reelW &&
                    my >= centerItemY && my <= centerItemY + centerItemH) {
                    const item = items[this._reelTargetIdx];
                    if (item && item.enabled !== false) {
                        this._menuParentId = this._reelParentId;
                        this._executeMenuItem(item);
                        return;
                    }
                }
            }

            // OK키 → 중앙 아이템 확인
            if (Input.isTriggered("ok")) {
                const item = items[this._reelTargetIdx];
                if (item && item.enabled !== false) {
                    this._menuParentId = this._reelParentId;
                    this._executeMenuItem(item);
                    return;
                }
            }

            // ESC → 서브 라디얼로 복귀
            let esc = Input.isTriggered("escape") || TouchInput.isCancelled();
            if (TouchInput.isTriggered()) {
                // 릴 영역 밖 클릭
                if (mx < reelX || mx > reelX + reelW || my < reelY || my > reelY + 240) {
                    esc = true;
                }
            }
            if (esc) {
                this._reelItems = null;
                this._openSubRadial();
            }
        },

        // ─── 메뉴 항목 실행 ───
        _executeMenuItem(item) {
            const unit = this._currentUnit;

            // 서브메뉴 열기
            if (item.hasSubmenu) {
                this._openSubmenu(item.id);
                return;
            }

            switch (item.id) {
                // ─── 주요 행동 ───
                case "attack":
                    this._subPhase = "selectTarget";
                    this._atkRange = SrpgGrid.calcAtkRange(unit);
                    this._selectedTarget = null;
                    this._targetCursorActive = false; // 커서 초기화 트리거
                    this._preTargetMenuParent = this._menuParentId; // 복귀용 저장
                    this._menuItems = null;
                    this._radialItems = null;
                    this._reelItems = null;
                    this._inputDelay = 8;
                    break;

                // ─── 오브젝트 던지기 (주행동) ───
                case "throwObj": {
                    // 던질 오브젝트 선택 → 착탄 타일 선택 2단계
                    const adjObjs = item.adjObjects || [];
                    if (adjObjs.length === 1) {
                        // 인접 오브젝트가 1개면 자동 선택
                        this._throwObject = adjObjs[0];
                        this._subPhase = "selectThrowTarget";
                        this._throwRange = SrpgGrid.calcThrowRange(unit); // 투척 범위
                        this._selectedTarget = null;
                        this._targetCursorActive = false;
                    } else {
                        // 여러 개면 선택 UI (일단 첫 번째 선택)
                        this._throwObject = adjObjs[0];
                        this._subPhase = "selectThrowTarget";
                        this._throwRange = SrpgGrid.calcThrowRange(unit);
                        this._selectedTarget = null;
                        this._targetCursorActive = false;
                    }
                    // NOTE: useMainAction()은 투척 확정 시점(_handleSelectThrowTarget)에서 호출
                    this._menuItems = null;
                    this._radialItems = null;
                    this._reelItems = null;
                    this._inputDelay = 8;
                    break;
                }

                // ─── 숨기 (주행동) ───
                case "hide": {
                    // 민첩 기반 은신: 스킬 은신보다 성능 열위
                    unit._hidden = true;
                    unit._hideAgi = unit.buffedAgi; // 은신 시점의 AGI 기록
                    unit._hideSkill = false;        // 스킬 은신이 아님
                    // RMMZ 상태 21(숨기) 부여 — 아이콘 표시용
                    if (unit.actorId && $gameActors) {
                        const actor = $gameActors.actor(unit.actorId);
                        if (actor && !actor.isStateAffected(21)) actor.addState(21);
                    }
                    // 적 시야 계산용 플래그
                    this._showEnemyVision = true;
                    unit.useMainAction();
                    unit.refreshTint(); // 즉시 반투명 적용
                    this._addPopup(unit.x, unit.y, "숨기!", "#aaaacc", true);
                    this._menuItems = null;
                    this._radialItems = null;
                    this._reelItems = null;
                    this._inputDelay = 20;
                    this._openActionMenu();
                    break;
                }

                // ─── 스프린트 (주행동) ───
                case "sprint": {
                    // 1턴간 이동범위 1.5배
                    const baseMov = unit.mov;
                    const bonus = Math.floor(baseMov * 0.5);
                    unit.turnMoveMax += bonus;
                    unit._sprintActive = true;
                    unit._sprintUsed = true;
                    unit.useMainAction();
                    this._addPopup(unit.x, unit.y, `전력질주! +${bonus}`, "#ffdd44", true);
                    this._menuItems = null;
                    this._radialItems = null;
                    this._reelItems = null;
                    this._inputDelay = 20;
                    this._openActionMenu();
                    break;
                }

                // ─── 이동/대기/취소 ───
                case "move":
                    this._subPhase = "awaitCommand";
                    this._moveRange = this._segMoveRange || [];
                    this._moveRangeSet = this._segMoveRangeSet || new Set();
                    this._atkRange = [];
                    this._menuItems = null;
                    this._radialItems = null;
                    this._reelItems = null;
                    this._inputDelay = 8;
                    this._uiDirty = true;
                    break;
                case "wait":
                    unit.consumeSegmentMove();
                    unit.useMainAction();
                    unit.useBonusAction();
                    this._endCurrentTurn();
                    break;
                case "cancel":
                    unit.event.locate(unit._segStartX, unit._segStartY);
                    $gamePlayer.locate(unit._segStartX, unit._segStartY);
                    $gamePlayer.center(unit._segStartX, unit._segStartY);
                    this._subPhase = "awaitCommand";
                    this._moveRange = this._segMoveRange || [];
                    this._moveRangeSet = this._segMoveRangeSet || new Set();
                    this._atkRange = [];
                    this._menuItems = null;
                    this._radialItems = null;
                    this._reelItems = null;
                    this._inputDelay = 8;
                    this._uiDirty = true;
                    break;

                default:
                    // 스킬 (주요 행동)
                    if (item.id && item.id.startsWith("skill_")) {
                        const skillId = item.skillId;
                        const skill = $dataSkills[skillId];
                        if (skill) {
                            // MP는 전투 실행 시 차감 (취소 가능하도록 보류)
                            this._pendingSkill = skill;
                            this._pendingSkillMpCost = skill.mpCost;
                            // 멀티샷 모드 체크
                            const _msMeta = SrpgProjectile.parseSkillMeta(skill.id);
                            if (_msMeta && _msMeta.multiShot > 1) {
                                this._multiShotMode = true;
                                this._multiShotMax = _msMeta.multiShot;
                                this._multiShotTargets = [];
                                this._multiShotMeta = _msMeta;
                            } else {
                                this._multiShotMode = false;
                            }
                            this._preTargetMenuParent = this._menuParentId; // 복귀용 저장
                            this._subPhase = "selectTarget";
                            this._atkRange = SrpgGrid.calcAtkRange(unit);
                            this._selectedTarget = null;
                            this._targetCursorActive = false; // 커서 초기화 트리거
                            this._menuItems = null;
                            this._radialItems = null;
                            this._reelItems = null;
                            this._inputDelay = 8;
                        }
                        break;
                    }
                    // ─── 보조 행동 실행 ───
                    this._executeBonusAction(item);
                    break;
            }
        },

        // ─── 보조 행동 실행 ───
        _executeBonusAction(item) {
            const unit = this._currentUnit;

            // 방향전환은 보조 행동 포인트를 소모하지 않음
            if (item.id === "faceDir") {
                this._subPhase = "faceDirection";
                this._faceDirHover = unit.event.direction(); // 현재 방향
                this._faceDirTick = 0;                       // 애니메이션 틱
                this._faceDirOrigDir = unit.event.direction(); // 취소용 원래 방향
                this._menuItems = null;
                this._radialItems = null;
                this._reelItems = null;
                this._inputDelay = 8;
                this._uiDirty = true;
                return;
            }

            // ─── 타겟이 필요한 보조행동: 타겟선택 서브페이즈로 전환 ───
            if (item.needTarget && !this._bonusTarget) {
                this._pendingBonusItem = item;
                this._subPhase = "selectBonusTarget";
                // 범위 계산: 인접 range 칸
                const range = item.range || 1;
                const tiles = [];
                for (let dx = -range; dx <= range; dx++) {
                    for (let dy = -range; dy <= range; dy++) {
                        if (Math.abs(dx) + Math.abs(dy) > range || (dx === 0 && dy === 0)) continue;
                        const tx = unit.x + dx, ty = unit.y + dy;
                        if (SrpgGrid.inBounds(tx, ty)) tiles.push({ x: tx, y: ty });
                    }
                }
                this._atkRange = tiles;
                this._targetCursorActive = false;
                this._menuItems = null;
                this._radialItems = null;
                this._reelItems = null;
                this._inputDelay = 8;
                this._uiDirty = true;
                return; // 타겟 선택 후 다시 _executeBonusAction 호출
            }

            unit.useBonusAction();

            switch (item.id) {
                case "shove": {
                    // ─── 밀치기: 근력 기반, 1칸 밀기 ───
                    const target = this._bonusTarget;
                    if (target) {
                        // 밀기 방향: 시전자 → 대상 방향
                        const pdx = target.x - unit.x;
                        const pdy = target.y - unit.y;
                        const pushX = target.x + Math.sign(pdx);
                        const pushY = target.y + Math.sign(pdy);
                        // 밀릴 수 있는지 확인 (맵 범위 + 통행 가능)
                        const canPush = SrpgGrid.isValidTile(pushX, pushY) &&
                                        !SrpgGrid.isBlocked(pushX, pushY) &&
                                        !this.unitAt(pushX, pushY);
                        if (canPush) {
                            // 근력 체크: ATK 비교 (시전자 ATK >= 대상 DEF의 50%면 성공)
                            const strCheck = unit.buffedAtk >= Math.floor(target.buffedDef * 0.5);
                            if (strCheck) {
                                target.setPosition(pushX, pushY);
                                target.event.locate(pushX, pushY);
                                this._addPopup(unit.x, unit.y, "밀치기!", "#ffaa44", true);
                                // 밀려난 위치에 장판이 있으면 효과 적용
                                if (typeof SrpgField !== "undefined") {
                                    SrpgField.checkUnitFieldStatus(target, pushX, pushY);
                                }
                            } else {
                                this._addPopup(target.x, target.y, "버텼다!", "#ff6666", true);
                            }
                        } else {
                            // 벽에 부딪힘 → 대상에 근력 기반 피해
                            const wallDmg = Math.floor(unit.buffedAtk * 0.3);
                            if (wallDmg > 0 && target.isAlive()) {
                                target.hp = Math.max(0, target.hp - wallDmg);
                                this._addPopup(target.x, target.y, `-${wallDmg}`, "#ff4444");
                                if (target.hp <= 0) target.die();
                            }
                            this._addPopup(target.x, target.y, "벽 충돌!", "#ff8844", true);
                        }
                    } else {
                        this._addPopup(unit.x, unit.y, "밀치기 실패!", "#ff6666", true);
                    }
                    this._menuItems = null; this._radialItems = null; this._reelItems = null;
                    this._inputDelay = 20;
                    this._openActionMenu();
                    break;
                }
                default: {
                    // ─── 핫키 아이템 사용 ───
                    if (item.id && item.id.startsWith('useHotkey_') && item.hotkeySlot !== undefined) {
                        try {
                            const actor = $gameActors.actor(unit.actorId);
                            if (actor && actor.gridInventory) {
                                const inv = actor.gridInventory();
                                const dataItem = inv.hotkeyItem(item.hotkeySlot);
                                if (dataItem) {
                                    // 아이템 효과 적용 (HP/MP 회복 등)
                                    this._applyItemEffects(unit, dataItem);
                                    // 인벤토리에서 1개 소비
                                    inv.removeItem(dataItem, 1);
                                    inv.validateHotkeys();
                                    this._addPopup(unit.x, unit.y, dataItem.name + "!", "#66ccff", true);
                                    try {
                                        if (AudioManager && AudioManager.playSe) {
                                            AudioManager.playSe({name: "Item3", volume: 80, pitch: 100, pan: 0});
                                        }
                                    } catch(e) {}
                                } else {
                                    this._addPopup(unit.x, unit.y, "아이템 없음!", "#ff6666", true);
                                }
                            }
                        } catch (e) {
                            console.warn('[SRPG] Hotkey use error:', e.message);
                            this._addPopup(unit.x, unit.y, "사용 실패!", "#ff6666", true);
                        }
                    } else {
                        this._addPopup(unit.x, unit.y, item.label, "#cccccc", true);
                    }
                    this._menuItems = null; this._radialItems = null; this._reelItems = null;
                    this._inputDelay = 20;
                    this._openActionMenu();
                    break;
                }
            }
        },

        // ─── 아이템 효과 적용 (RMMZ 데이터 기반) ───
        _applyItemEffects(unit, dataItem) {
            if (!dataItem || !dataItem.effects) return;
            for (const eff of dataItem.effects) {
                switch (eff.code) {
                    case 11: // HP 회복 (rate + flat)
                        const hpGain = Math.floor(unit.mhp * eff.value1) + Math.floor(eff.value2);
                        if (hpGain !== 0) {
                            unit.hp = Math.min(unit.mhp, Math.max(0, unit.hp + hpGain));
                            if (hpGain > 0) {
                                this._addPopup(unit.x, unit.y, "+" + hpGain + " HP", "#44ff44");
                            }
                        }
                        break;
                    case 12: // MP 회복
                        const mpGain = Math.floor(unit.mmp * eff.value1) + Math.floor(eff.value2);
                        if (mpGain !== 0) {
                            unit.mp = Math.min(unit.mmp, Math.max(0, unit.mp + mpGain));
                            if (mpGain > 0) {
                                this._addPopup(unit.x, unit.y, "+" + mpGain + " MP", "#4488ff");
                            }
                        }
                        break;
                    case 21: { // 상태 부여
                        const stateId = eff.dataId;
                        if (stateId > 0 && unit.addState) {
                            // value1 = 부여 확률 (1.0 = 100%), 아이템은 보통 확정
                            const chance = eff.value1 || 1.0;
                            if (Math.random() < chance) {
                                unit.addState(stateId, 3);
                                const st = $dataStates[stateId];
                                const stName = st ? st.name : "상태" + stateId;
                                this._addPopup(unit.x, unit.y, "+" + stName, "#ffcc44");
                            }
                        }
                        break;
                    }
                    case 22: { // 상태 해제
                        const stateId2 = eff.dataId;
                        if (stateId2 > 0 && unit.removeState) {
                            unit.removeState(stateId2);
                            const st2 = $dataStates[stateId2];
                            const stName2 = st2 ? st2.name : "상태" + stateId2;
                            this._addPopup(unit.x, unit.y, "-" + stName2, "#88ccff");
                        }
                        break;
                    }
                    default:
                        break;
                }
            }
            unit.refreshTint();
            this._uiDirty = true;
            this._turnPredictDirty = true;
        },

        // ─── 인접 아군 궁합 보너스 계산 ───
        _calcAdjacencyBonus(unit) {
            if (!unit.isActor() || unit.actorId <= 0) return 0;
            if (typeof GahoSystem === "undefined" || !GahoSystem.getCompatibility) return 0;

            let totalBonus = 0;
            let allyCount = 0;
            const dirs = [{dx:0,dy:1},{dx:0,dy:-1},{dx:-1,dy:0},{dx:1,dy:0}];

            for (const d of dirs) {
                const adj = this.unitAt(unit.x + d.dx, unit.y + d.dy);
                if (!adj || !adj.isAlive() || !adj.isActor() || adj.actorId <= 0) continue;
                if (adj === unit) continue;
                try {
                    const compat = GahoSystem.getCompatibility(unit.actorId, adj.actorId);
                    if (compat && compat.synergyBonus !== 0) {
                        totalBonus += compat.synergyBonus;
                        allyCount++;
                    }
                } catch (e) {
                    console.warn('[SRPG] Compatibility check error:', e.message);
                }
            }

            // 최대 보너스 ±10 캡
            return Math.max(-10, Math.min(10, totalBonus));
        },

        // ─── 대상 선택 ───
        _handleSelectTarget() {
            const unit = this._currentUnit;
            const atkTiles = this._atkRange;
            if (!atkTiles || atkTiles.length === 0) return;

            const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
            const ox = $gameMap.displayX() * tw, oy = $gameMap.displayY() * th;
            const atkSet = new Set(atkTiles.map(t => `${t.x},${t.y}`));

            // ── 첫 진입: 커서 초기화 (유닛 앞 방향 또는 범위 첫 타일) ──
            if (!this._targetCursorActive) {
                this._targetCursorActive = true;
                // 유닛이 바라보는 방향의 첫 번째 범위 내 타일
                const dirMap = { 2:{dx:0,dy:1}, 4:{dx:-1,dy:0}, 6:{dx:1,dy:0}, 8:{dx:0,dy:-1} };
                const d = dirMap[unit.event.direction()] || { dx:0, dy:-1 };
                const frontX = unit.x + d.dx, frontY = unit.y + d.dy;
                if (atkSet.has(`${frontX},${frontY}`)) {
                    this._targetTileX = frontX;
                    this._targetTileY = frontY;
                } else {
                    this._targetTileX = atkTiles[0].x;
                    this._targetTileY = atkTiles[0].y;
                }
                // 커서 위치의 유닛을 selectedTarget에 반영 (프리뷰용)
                this._selectedTarget = this.unitAt(this._targetTileX, this._targetTileY);
                this._uiDirty = true;
            }

            // ── 마우스 호버: 범위 내 타일로 커서 즉시 이동 ──
            const mx = TouchInput.x, my = TouchInput.y;
            const hoverTileX = Math.floor((mx + ox) / tw);
            const hoverTileY = Math.floor((my + oy) / th);
            if (atkSet.has(`${hoverTileX},${hoverTileY}`)) {
                if (hoverTileX !== this._targetTileX || hoverTileY !== this._targetTileY) {
                    this._targetTileX = hoverTileX;
                    this._targetTileY = hoverTileY;
                    this._selectedTarget = this.unitAt(hoverTileX, hoverTileY);
                    this._uiDirty = true;
                }
            }

            // ── 키보드 방향키: 범위 내에서 한 칸씩 이동 ──
            const dirs = [];
            if (Input.isTriggered("left"))  dirs.push({dx:-1, dy:0});
            if (Input.isTriggered("right")) dirs.push({dx:1,  dy:0});
            if (Input.isTriggered("up"))    dirs.push({dx:0,  dy:-1});
            if (Input.isTriggered("down"))  dirs.push({dx:0,  dy:1});
            for (const dir of dirs) {
                // 현재 커서에서 해당 방향으로 범위 내 가장 가까운 타일 찾기
                for (let step = 1; step <= unit.atkRange * 2; step++) {
                    const nx = this._targetTileX + dir.dx * step;
                    const ny = this._targetTileY + dir.dy * step;
                    if (atkSet.has(`${nx},${ny}`)) {
                        this._targetTileX = nx;
                        this._targetTileY = ny;
                        this._selectedTarget = this.unitAt(nx, ny);
                        this._uiDirty = true;
                        break;
                    }
                }
            }

            // ── 클릭/터치: 범위 내 타일 확인 → 전투/공격 실행 ──
            if (TouchInput.isTriggered()) {
                if (atkSet.has(`${hoverTileX},${hoverTileY}`)) {
                    this._targetTileX = hoverTileX;
                    this._targetTileY = hoverTileY;
                    this._selectedTarget = this.unitAt(hoverTileX, hoverTileY);
                    this._confirmTargetTile();
                    return;
                }
                // 범위 밖 클릭 → 취소
                this._cancelSelectTarget();
                return;
            }

            // ── Enter: 현재 커서 위치 확정 ──
            if (Input.isTriggered("ok")) {
                this._confirmTargetTile();
                return;
            }

            // ── Escape / 우클릭: 취소 ──
            if (Input.isTriggered("escape") || TouchInput.isCancelled()) {
                this._cancelSelectTarget();
            }
        },

        // 타일 타겟 확정 → 유닛이 있으면 전투 프리뷰, 없으면 지면 공격 실행
        _confirmTargetTile() {
            const tx = this._targetTileX;
            const ty = this._targetTileY;
            const targetUnit = this.unitAt(tx, ty);

            // ── 소환 스킬 분기 ──
            if (this._pendingSkill) {
                const summonMeta = SrpgSummon.parseSummonMeta(this._pendingSkill.id);
                if (summonMeta) {
                    this._executeSummon(tx, ty, summonMeta);
                    return;
                }
            }

            // ── 멀티샷 타겟 수집 ──
            if (this._multiShotMode) {
                this._multiShotTargets.push({ x: tx, y: ty, unit: targetUnit || null });
                this._addPopup(tx, ty, `${this._multiShotTargets.length}/${this._multiShotMax}`, "#88ccff", true);
                try { AudioManager.playSe({name: "Cursor2", volume: 60, pitch: 120, pan: 0}); } catch(e){}
                if (this._multiShotTargets.length >= this._multiShotMax) {
                    this._executeMultiShot();
                }
                return;
            }

            // ── 바라지 분기 ──
            if (this._pendingSkill) {
                const _barMeta = SrpgProjectile.parseSkillMeta(this._pendingSkill.id);
                if (_barMeta && _barMeta.barragePattern) {
                    this._executeBarrage(tx, ty, _barMeta);
                    return;
                }
            }

            if (targetUnit && targetUnit.isAlive() && this._currentUnit.isHostileTo(targetUnit)) {
                // 적 유닛 → 투사체 경로 차단 검사 후 전투 프리뷰
                const skillId = this._pendingSkill ? this._pendingSkill.id : 0;
                const pathCheck = SrpgCombat.checkAttackPath(this._currentUnit, targetUnit, skillId);
                targetUnit._pathBlocked = pathCheck.blocked;
                targetUnit._pathRedirected = !!pathCheck.redirectTarget;
                targetUnit._redirectTarget = pathCheck.redirectTarget || null;
                this._selectedTarget = targetUnit;
                this._openCombatPreview();
            } else {
                // 빈 타일 또는 아군 → 지면 공격 (AoE)
                this._selectedTarget = null;
                this._executeGroundAttack(tx, ty);
            }
        },

        // ─── 소환 스킬 실행 ───
        _executeSummon(tx, ty, summonMeta) {
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
            }

            // MP 소모
            if (this._pendingSkillMpCost > 0) {
                unit.mp -= this._pendingSkillMpCost;
                this._pendingSkillMpCost = 0;
            }

            // 소환 실행
            const spawned = SrpgSummon.spawn(unit, tx, ty, summonMeta);
            if (!spawned) {
                this._addPopup(tx, ty, "소환 실패!", "#ff6666");
                // MP 환불은 하지 않음 (이미 타일 검증 후)
            }

            // 행동 소모
            unit.useMainAction();

            // 방향 전환
            const dx = tx - unit.x, dy = ty - unit.y;
            if (Math.abs(dx) > Math.abs(dy)) {
                unit.event.setDirection(dx > 0 ? 6 : 4);
            } else {
                unit.event.setDirection(dy > 0 ? 2 : 8);
            }

            // 상태 정리
            this._targetCursorActive = false;
            this._pendingSkill = null;
            this._selectedTarget = null;
            this._combatResult = null;

            // 행동 후 턴 계속 여부 판정
            this._phase = "combat";
            this._subPhase = "animating";
            this._combatAnimTimer = 30; // 소환 연출 시간
            this._uiDirty = true;
        },

        // selectTarget 취소 → 메뉴 복귀 (슬롯릴로 복귀)
        _cancelSelectTarget() {
            // 멀티샷 모드: 마지막 선택 취소 (전부 취소 시 모드 해제)
            if (this._multiShotMode && this._multiShotTargets.length > 0) {
                this._multiShotTargets.pop();
                this._addPopup(this._targetTileX, this._targetTileY,
                    `${this._multiShotTargets.length}/${this._multiShotMax}`, "#ffaa44", true);
                try { AudioManager.playSe({name: "Cancel1", volume: 60, pitch: 100, pan: 0}); } catch(e){}
                return;
            }
            if (this._multiShotMode) {
                this._multiShotMode = false;
                this._multiShotTargets = [];
                this._multiShotMeta = null;
            }
            this._selectedTarget = null;
            this._targetCursorActive = false;
            this._pendingSkill = null;
            this._pendingSkillMpCost = 0;
            if (this._preTargetMenuParent) {
                // 슬롯릴로 복귀
                this._openActionMenu(); // 라디얼 상태 초기화
                this._openSubRadial();  // 서브 라디얼 거쳐
                this._openSubmenu(this._preTargetMenuParent); // 슬롯릴 열기
                this._preTargetMenuParent = null;
            } else {
                this._openActionMenu();
            }
            this._inputDelay = 8;
        },

        // ─── 지면 공격 (빈 타일 대상) ───
        _executeGroundAttack(tx, ty) {
            const atk = this._currentUnit;
            const skillId = this._pendingSkill ? this._pendingSkill.id : 0;
            const projMeta = skillId ? SrpgProjectile.parseSkillMeta(skillId) : null;

            // MP 소모
            if (this._pendingSkillMpCost > 0) {
                atk.mp -= this._pendingSkillMpCost;
                this._pendingSkillMpCost = 0;
            }

            atk.useMainAction();

            // 방향 전환 (타겟 타일 방향)
            const dx = tx - atk.x, dy = ty - atk.y;
            if (Math.abs(dx) > Math.abs(dy)) {
                atk.event.setDirection(dx > 0 ? 6 : 4);
            } else {
                atk.event.setDirection(dy > 0 ? 2 : 8);
            }

            this._phase = "combat";
            this._targetCursorActive = false;

            if (projMeta) {
                // 직사 투사체 경로 차단 검사
                const fireMode = SrpgCombat.resolveFireMode(atk, skillId);
                const groundPathCheck = (fireMode !== FIRE_MODE.ARC)
                    ? SrpgGrid.checkProjectilePath(atk.x, atk.y, tx, ty, fireMode)
                    : { blocked: false };
                const actualTX = groundPathCheck.blocked ? groundPathCheck.x : tx;
                const actualTY = groundPathCheck.blocked ? groundPathCheck.y : ty;
                const groundBlocked = groundPathCheck.blocked;

                // 투사체 → 타일 좌표를 목표로 발사 (차단 시 차단 좌표)
                this._subPhase = "projectile";
                this._combatAnimTimer = 999;
                this._projTimeout = 0;

                const onImpact = () => {
                    if (groundBlocked) {
                        this._addPopup(actualTX, actualTY, "차단!", "#aaaaaa");
                        this._combatAnimTimer = 40;
                        this._subPhase = "animating";
                        return;
                    }
                    // 착탄 시 해당 타일의 유닛에 데미지 (착탄 시점에 유닛 확인)
                    const hitUnit = this.unitAt(tx, ty);
                    if (hitUnit && hitUnit.isAlive() && atk.isHostileTo(hitUnit)) {
                        const result = SrpgCombat.execute(atk, hitUnit, true, skillId);
                        if (!result.blocked) {
                            const actualHit = result.actualTarget || hitUnit;
                            actualHit.takeDamage(result.damage);
                            if (result.critical) SrpgFX.startCritCharge(atk, 15);
                            SrpgFX.startHitReaction(actualHit, atk, true, result.critical, actualHit.team);
                            const critTag = result.critical ? "!" : "";
                            this._addPopup(actualHit.x, actualHit.y,
                                `-${result.damage}${critTag}`, result.critical ? "#ffff00" : "#ff4444");
                        }
                    }

                    // 착탄 애니메이션 (범위 스케일 적용)
                    if (projMeta.impactAnimId > 0) {
                        const gndSkill = this._pendingSkill || null;
                        const gndScale = SrpgAnimScale.calcForSkill(atk, gndSkill, tx, ty);
                        SrpgAnimScale.setScale(gndScale);
                        const evTarget = hitUnit ? hitUnit.event : null;
                        if (evTarget) {
                            $gameTemp.requestAnimation([evTarget], projMeta.impactAnimId);
                        }
                    }

                    // 장판/구름 생성 + 원소 반응
                    if (skillId) {
                        this._processFieldCreation(atk, tx, ty, skillId);
                    }

                    this._combatAnimTimer = 40;
                    this._subPhase = "animating";
                };

                // 투사체를 타일 좌표로 발사 (차단 시 차단 좌표)
                const tileTarget = { x: actualTX, y: actualTY, event: { screenX: () => {
                    const tw2 = $gameMap.tileWidth();
                    return Math.round((actualTX + 0.5) * tw2 - $gameMap.displayX() * tw2);
                }, screenY: () => {
                    const th2 = $gameMap.tileHeight();
                    return Math.round((actualTY + 0.5) * th2 - $gameMap.displayY() * th2);
                }}};

                if (projMeta.type === "projectile") {
                    SrpgProjectile.fireProjectile(atk, tileTarget, projMeta, onImpact);
                } else if (projMeta.type === "hitray") {
                    SrpgProjectile.fireHitray(atk, tileTarget, projMeta, onImpact);
                } else if (projMeta.type === "artillery") {
                    SrpgProjectile.fireArtillery(atk, tileTarget, projMeta, onImpact);
                }

                try {
                    if (AudioManager && AudioManager.playSe) {
                        AudioManager.playSe({name: "Bow1", volume: 80, pitch: 100, pan: 0});
                    }
                } catch (e) {}
            } else {
                // 투사체 없는 지면 공격 → 장판/구름 생성
                if (skillId) {
                    this._processFieldCreation(atk, tx, ty, skillId);
                }

                // 스킬 범위 스케일 애니메이션
                const gndSkill2 = this._pendingSkill || null;
                const gndScale2 = SrpgAnimScale.calcForSkill(atk, gndSkill2, tx, ty);
                SrpgAnimScale.setScale(gndScale2);
                SrpgCombat.playCombatEffects(atk, { x: tx, y: ty, event: null });

                this._combatAnimTimer = 40;
                this._subPhase = "animating";
            }

            this._pendingSkill = null;
            this._uiDirty = true;
        },

        // ─── 멀티샷 실행 (스톡샷) ───
        _executeMultiShot() {
            const atk = this._currentUnit;
            const skillId = this._pendingSkill ? this._pendingSkill.id : 0;
            const projMeta = this._multiShotMeta;
            const targets = this._multiShotTargets;
            const damageMod = projMeta.shotDamageMod || 1.0;
            const shotDelay = projMeta.shotDelay || 12;

            // MP 소모
            if (this._pendingSkillMpCost > 0) {
                const mcrRate = atk.mcr || 1;
                atk.mp -= Math.floor(this._pendingSkillMpCost * mcrRate);
                this._pendingSkillMpCost = 0;
            }
            atk.useMainAction();

            const shoutName = this._pendingSkill ? this._pendingSkill.name : "공격!";
            this._addPopup(atk.x, atk.y, shoutName, "#ffffff", true);

            this._phase = "combat";
            this._subPhase = "multishot";
            this._targetCursorActive = false;
            this._combatAnimTimer = 999;
            this._projTimeout = 0;

            this._msQueue = targets.slice();
            this._msIdx = 0;
            this._msDelay = 0;
            this._msDamageMod = damageMod;
            this._msShotDelay = shotDelay;
            this._msProjMeta = projMeta;
            this._msSkillId = skillId;

            try { AudioManager.playSe({name: "Bow1", volume: 80, pitch: 100, pan: 0}); } catch(e){}

            this._multiShotMode = false;
            this._multiShotTargets = [];
            this._pendingSkill = null;
            this._uiDirty = true;
        },

        // 멀티샷 업데이트 (매 프레임)
        _updateMultiShot() {
            if (this._msDelay > 0) {
                this._msDelay--;
                return;
            }
            if (this._msIdx < this._msQueue.length) {
                const shot = this._msQueue[this._msIdx];
                const atk = this._currentUnit;
                const projMeta = this._msProjMeta;
                const skillId = this._msSkillId;
                const damageMod = this._msDamageMod;

                // 방향 전환
                const sdx = shot.x - atk.x, sdy = shot.y - atk.y;
                if (Math.abs(sdx) > Math.abs(sdy)) {
                    atk.event.setDirection(sdx > 0 ? 6 : 4);
                } else if (sdy !== 0) {
                    atk.event.setDirection(sdy > 0 ? 2 : 8);
                }

                // 경로 차단 검사
                const fireMode = SrpgCombat.resolveFireMode(atk, skillId);
                let actualX = shot.x, actualY = shot.y;
                let shotBlocked = false;
                if (fireMode !== FIRE_MODE.ARC) {
                    const pathCheck = SrpgGrid.checkProjectilePath(
                        atk.x, atk.y, shot.x, shot.y, fireMode);
                    if (pathCheck.blocked) {
                        actualX = pathCheck.x;
                        actualY = pathCheck.y;
                        shotBlocked = true;
                    }
                }

                // 가상 타겟 좌표
                const tX = actualX, tY = actualY;
                const projTarget = {
                    x: tX, y: tY,
                    event: {
                        screenX: () => {
                            const tw2 = $gameMap.tileWidth();
                            return Math.round((tX + 0.5) * tw2 - $gameMap.displayX() * tw2);
                        },
                        screenY: () => {
                            const th2 = $gameMap.tileHeight();
                            return Math.round((tY + 0.5) * th2 - $gameMap.displayY() * th2);
                        },
                    },
                };

                const shotIdx = this._msIdx;
                const queueLen = this._msQueue.length;
                const onShotImpact = () => {
                    if (shotBlocked) {
                        this._addPopup(tX, tY, "차단!", "#aaaaaa");
                        return;
                    }
                    const targetUnit = shot.unit && shot.unit.isAlive && shot.unit.isAlive()
                        ? shot.unit : this.unitAt(shot.x, shot.y);
                    if (targetUnit && targetUnit.isAlive() && atk.isHostileTo(targetUnit)) {
                        const result = SrpgCombat.execute(atk, targetUnit, true, skillId);
                        if (!result.blocked) {
                            const hitU = result.actualTarget || targetUnit;
                            const dmg = Math.floor(result.damage * damageMod);
                            hitU.takeDamage(dmg);
                            if (result.critical) SrpgFX.startCritCharge(atk, 10);
                            SrpgFX.startHitReaction(hitU, atk, true, result.critical, hitU.team);
                            const cTag = result.critical ? "!" : "";
                            this._addPopup(hitU.x, hitU.y,
                                `-${dmg}${cTag}`, result.critical ? "#ffff00" : "#ff4444");
                        } else {
                            this._addPopup(shot.x, shot.y, "차단!", "#aaaaaa");
                        }
                    }
                    if (projMeta.impactAnimId > 0) {
                        const impU = this.unitAt(tX, tY);
                        if (impU && impU.event) {
                            $gameTemp.requestAnimation([impU.event], projMeta.impactAnimId);
                        }
                    }
                    if (shotIdx === queueLen - 1 && skillId) {
                        this._processFieldCreation(atk, shot.x, shot.y, skillId);
                    }
                };

                if (projMeta.type === "projectile") {
                    SrpgProjectile.fireProjectile(atk, projTarget, projMeta, onShotImpact);
                } else if (projMeta.type === "hitray") {
                    SrpgProjectile.fireHitray(atk, projTarget, projMeta, onShotImpact);
                } else if (projMeta.type === "artillery") {
                    SrpgProjectile.fireArtillery(atk, projTarget, projMeta, onShotImpact);
                }

                if (this._msIdx > 0) {
                    try { AudioManager.playSe({name: "Bow1", volume: 70, pitch: 105 + this._msIdx * 5, pan: 0}); } catch(e){}
                }

                this._msIdx++;
                this._msDelay = this._msShotDelay;
            } else if (!SrpgProjectile.isBusy()) {
                this._combatAnimTimer = 40;
                this._subPhase = "animating";
                this._msQueue = null;
            }
        },

        // ─── 바라지 실행 (고정 범위 멀티샷) ───
        _executeBarrage(tx, ty, barMeta) {
            const atk = this._currentUnit;
            const skillId = this._pendingSkill ? this._pendingSkill.id : 0;
            const pattern = BARRAGE_PATTERNS[barMeta.barragePattern];
            if (!pattern) {
                console.warn("[SRPG] Unknown barrage pattern:", barMeta.barragePattern);
                return;
            }

            const targets = pattern.generate(
                atk.x, atk.y, tx, ty,
                barMeta.barrageCount, barMeta.barrageSpread
            );

            // MP 소모
            if (this._pendingSkillMpCost > 0) {
                const mcrRate = atk.mcr || 1;
                atk.mp -= Math.floor(this._pendingSkillMpCost * mcrRate);
                this._pendingSkillMpCost = 0;
            }
            atk.useMainAction();

            const shoutName = this._pendingSkill ? this._pendingSkill.name : "공격!";
            this._addPopup(atk.x, atk.y, shoutName, "#ffffff", true);

            const bdx = tx - atk.x, bdy = ty - atk.y;
            if (Math.abs(bdx) > Math.abs(bdy)) {
                atk.event.setDirection(bdx > 0 ? 6 : 4);
            } else {
                atk.event.setDirection(bdy > 0 ? 2 : 8);
            }

            this._phase = "combat";
            this._subPhase = "multishot";
            this._targetCursorActive = false;
            this._combatAnimTimer = 999;
            this._projTimeout = 0;

            this._msQueue = targets.map(t => ({
                x: t.x, y: t.y,
                unit: this.unitAt(t.x, t.y) || null,
                penetrate: t.penetrate || false,
            }));
            this._msIdx = 0;
            this._msDelay = 0;
            this._msDamageMod = barMeta.barrageDamageMod || 0.6;
            this._msShotDelay = barMeta.barrageDelay || 8;
            this._msProjMeta = barMeta;
            this._msSkillId = skillId;

            try { AudioManager.playSe({name: "Bow1", volume: 80, pitch: 100, pan: 0}); } catch(e){}

            this._pendingSkill = null;
            this._uiDirty = true;
        },

        // ─── 전투 프리뷰 ───
        _openCombatPreview() {
            if (!this._selectedTarget) return;
            this._subPhase = "combatPreview";
            const predSkillId = this._pendingSkill ? this._pendingSkill.id : 0;
            this._combatPrediction = SrpgCombat.predict(this._currentUnit, this._selectedTarget, predSkillId);
            this._inputDelay = 10;
            this._uiDirty = true;
        },

        _handleCombatPreview() {
            // ─── 버튼 영역 (UI 그리기에서 캐시됨) ───
            const ba = this._pvBtnArea;
            const mx = TouchInput.x, my = TouchInput.y;
            let hoverConfirm = false, hoverCancel = false;

            if (ba) {
                hoverConfirm = (mx >= ba.confirmX && mx <= ba.confirmX + ba.btnW && my >= ba.btnY && my <= ba.btnY + ba.btnH);
                hoverCancel = (mx >= ba.cancelX && mx <= ba.cancelX + ba.btnW && my >= ba.btnY && my <= ba.btnY + ba.btnH);
            }

            // 호버 상태 변경 시 UI 갱신
            if (hoverConfirm !== this._pvHoverConfirm || hoverCancel !== this._pvHoverCancel) {
                this._pvHoverConfirm = hoverConfirm;
                this._pvHoverCancel = hoverCancel;
                this._uiDirty = true;
            }

            // ─── 클릭/터치 ───
            if (TouchInput.isTriggered()) {
                if (hoverConfirm) {
                    this._executeCombat();
                    return;
                }
                if (hoverCancel) {
                    this._subPhase = "selectTarget";
                    this._inputDelay = 8;
                    return;
                }
                // 버튼 외부 클릭 → 취소
                this._subPhase = "selectTarget";
                this._inputDelay = 8;
                return;
            }

            // ─── 키보드 ───
            if (Input.isTriggered("ok")) {
                this._executeCombat();
                return;
            }
            if (Input.isTriggered("escape") || TouchInput.isCancelled()) {
                this._subPhase = "selectTarget";
                this._inputDelay = 8;
            }
        },

        _executeCombat() {
            // ─── 전투 시 은신 해제 ───
            if (typeof SrpgVision !== "undefined") {
                SrpgVision.breakStealth(this._currentUnit);
            }
            const atk = this._currentUnit;
            const def = this._selectedTarget;
            this._targetCursorActive = false;

            // ── 스킬명/공격 외침 팝업 (사용 주체 머리 위) ──
            const shoutName = this._pendingSkill ? this._pendingSkill.name : "공격!";
            this._addPopup(atk.x, atk.y, shoutName, "#ffffff", true);

            // 투사체 메타 확인 (스킬 사용 시)
            const skillId = this._pendingSkill ? this._pendingSkill.id : 0;
            const projMeta = skillId ? SrpgProjectile.parseSkillMeta(skillId) : null;

            // 스킬 MP 소모 (MCR 적용)
            if (this._pendingSkillMpCost > 0) {
                const mcrRate = atk.mcr || 1; // sparam MCR (MP 소비율)
                const actualCost = Math.floor(this._pendingSkillMpCost * mcrRate);
                atk.mp -= actualCost;
                this._pendingSkillMpCost = 0;
            }

            // 데미지 계산 (즉시) — 적용은 투사체 착탄 시 지연 가능
            const result = SrpgCombat.execute(atk, def, !!projMeta, skillId);
            this._combatResult = result;
            atk.useMainAction();

            // ─── 협동 공격 체크 ───
            const fuDef = result.actualTarget || def;
            if (!result.blocked && !result.missed && fuDef.isAlive()) {
                const fuResult = this._checkFollowUpAttack(atk, fuDef);
                if (fuResult) {
                    result.followUp = fuResult;
                    this._addPopup(fuResult.follower.x, fuResult.follower.y, "협동!", "#00FF88");
                    this._addPopup(fuDef.x, fuDef.y, String(fuResult.damage), "#00FF88");
                }
            }

            const hitTarget = result.actualTarget || def;

            if (result.missed) {
                // 회피! — "MISS" 팝업 표시
                this._addPopup(def.x, def.y, "MISS!", "#88aaff");
                try {
                    if (AudioManager && AudioManager.playSe) {
                        AudioManager.playSe({name: "Evasion1", volume: 80, pitch: 110, pan: 0});
                    }
                } catch (e) {}
                this._phase = "combat";
                this._combatAnimTimer = 40;
                this._subPhase = "animating";
                return;
            }

            if (result.blocked) {
                // 완전 차단 — 투사체가 있으면 차단 지점까지 날아간 뒤 정지
                if (projMeta && result.isRanged && result.blockInfo) {
                    this._phase = "combat";
                    this._subPhase = "projectile";
                    this._combatAnimTimer = 999;
                    this._projTimeout = 0;

                    const blockX = result.blockInfo.x;
                    const blockY = result.blockInfo.y;
                    const blockTarget = { x: blockX, y: blockY, event: { screenX: () => {
                        const tw2 = $gameMap.tileWidth();
                        return Math.round((blockX + 0.5) * tw2 - $gameMap.displayX() * tw2);
                    }, screenY: () => {
                        const th2 = $gameMap.tileHeight();
                        return Math.round((blockY + 0.5) * th2 - $gameMap.displayY() * th2);
                    }}};

                    const onBlockImpact = () => {
                        this._addPopup(blockX, blockY, "차단!", "#aaaaaa");
                        try {
                            AudioManager.playSe({name: "Buzzer1", volume: 70, pitch: 100, pan: 0});
                        } catch (e) {}
                        // 차단 지점 착탄 이펙트
                        if (projMeta.impactAnimId > 0) {
                            const blockUnit = this.unitAt(blockX, blockY);
                            if (blockUnit && blockUnit.event) {
                                $gameTemp.requestAnimation([blockUnit.event], projMeta.impactAnimId);
                            }
                        }
                        this._combatAnimTimer = 40;
                        this._subPhase = "animating";
                    };

                    if (projMeta.type === "projectile") {
                        SrpgProjectile.fireProjectile(atk, blockTarget, projMeta, onBlockImpact);
                    } else if (projMeta.type === "hitray") {
                        SrpgProjectile.fireHitray(atk, blockTarget, projMeta, onBlockImpact);
                    }
                    // artillery는 곡사라 차단되지 않으므로 여기 오지 않음

                    try {
                        AudioManager.playSe({name: "Bow1", volume: 80, pitch: 100, pan: 0});
                    } catch (e) {}
                    return;
                }

                // 투사체 없는 차단 — 즉시 팝업
                this._addPopup(def.x, def.y, "차단!", "#aaaaaa");
                try {
                    if (AudioManager && AudioManager.playSe) {
                        AudioManager.playSe({name: "Buzzer1", volume: 70, pitch: 100, pan: 0});
                    }
                } catch (e) {}
                this._phase = "combat";
                this._combatAnimTimer = 40;
                this._subPhase = "animating";
                return;
            }

            // ─── 투사체 애니메이션 분기 ───
            if (projMeta && result.isRanged) {
                this._phase = "combat";
                this._subPhase = "projectile";  // 투사체 비행 중
                this._combatAnimTimer = 999;     // 투사체 완료 콜백이 해제
                this._projTimeout = 0;

                // 착탄 콜백 — 데미지 적용 + 이펙트
                const onImpact = (hitNum) => {
                    // 지연된 데미지 적용
                    result.actualTarget
                        ? result.actualTarget.takeDamage(result.damage)
                        : def.takeDamage(result.damage);

                    // 피격 이펙트
                    if (result.critical) SrpgFX.startCritCharge(atk, 15);
                    SrpgFX.startHitReaction(hitTarget, atk, true, result.critical, hitTarget.team);

                    if (result.redirected) {
                        this._addPopup(hitTarget.x, hitTarget.y, "엄폐!", "#ffaa44");
                    }

                    // 데미지 팝업
                    const critTag = result.critical ? "!" : "";
                    this._addPopup(hitTarget.x, hitTarget.y,
                        `-${result.damage}${critTag}`, result.critical ? "#ffff00" : "#ff4444");

                    // 착탄 RMMZ 애니메이션 (범위 스케일 적용)
                    const impactSkill = this._pendingSkill || null;
                    const impactScale = SrpgAnimScale.calcForSkill(atk, impactSkill, hitTarget.x, hitTarget.y);
                    SrpgAnimScale.setScale(impactScale);
                    if (projMeta.impactAnimId > 0 && hitTarget.event) {
                        $gameTemp.requestAnimation([hitTarget.event], projMeta.impactAnimId);
                    } else {
                        SrpgCombat.playCombatEffects(atk, hitTarget);
                    }

                    // 반격 (투사체 착탄 후)
                    if (result.counterDamage > 0) {
                        atk.takeDamage(result.counterDamage);
                        if (result.counterCritical) SrpgFX.startCritCharge(def, 10);
                        SrpgFX.startHitReaction(atk, def, true, result.counterCritical, atk.team);
                        const cTag = result.counterCritical ? "!" : "";
                        this._addPopup(atk.x, atk.y,
                            `-${result.counterDamage}${cTag}`, result.counterCritical ? "#ffff00" : "#ffaa44");
                    } else if (result.counterMissed) {
                        this._addPopup(atk.x, atk.y, "반격 회피!", "#88aaff");
                    }

                    // 장판/구름 생성 + 원소 반응 (투사체 착탄 시점)
                    if (skillId) {
                        this._processFieldCreation(atk, hitTarget.x, hitTarget.y, skillId);
                    }

                    // 투사체 완료 → 전투 애니메이션 마무리
                    this._combatAnimTimer = 40;
                    this._subPhase = "animating";
                };

                // 투사체 발사!
                if (projMeta.type === "projectile") {
                    SrpgProjectile.fireProjectile(atk, hitTarget, projMeta, onImpact);
                } else if (projMeta.type === "hitray") {
                    SrpgProjectile.fireHitray(atk, hitTarget, projMeta, onImpact);
                } else if (projMeta.type === "artillery") {
                    SrpgProjectile.fireArtillery(atk, hitTarget, projMeta, onImpact);
                }

                // 발사 SE
                try {
                    if (AudioManager && AudioManager.playSe) {
                        AudioManager.playSe({name: "Bow1", volume: 80, pitch: 100, pan: 0});
                    }
                } catch (e) {}
                return;
            }

            // ─── 기존 즉시 전투 (투사체 없음 / 근접) ───
            if (result.critical) SrpgFX.startCritCharge(atk, 15);
            SrpgFX.startHitReaction(hitTarget, atk, result.isRanged, result.critical, hitTarget.team);

            if (result.redirected) {
                this._addPopup(hitTarget.x, hitTarget.y, "엄폐!", "#ffaa44");
            }

            if (result.counterDamage > 0 && result.counterCritical) {
                SrpgFX.startCritCharge(def, 10);
            }
            if (result.counterDamage > 0) {
                SrpgFX.startHitReaction(atk, def, result.isRanged, result.counterCritical, atk.team);
            }

            const critTag = result.critical ? "!" : "";
            this._addPopup(hitTarget.x, hitTarget.y,
                `-${result.damage}${critTag}`, result.critical ? "#ffff00" : "#ff4444");
            if (result.counterDamage > 0) {
                const cTag = result.counterCritical ? "!" : "";
                this._addPopup(atk.x, atk.y,
                    `-${result.counterDamage}${cTag}`, result.counterCritical ? "#ffff00" : "#ffaa44");
            } else if (result.counterMissed) {
                this._addPopup(atk.x, atk.y, "반격 회피!", "#88aaff");
            }

            // 스킬 범위 기반 애니메이션 스케일 설정
            const animSkill2 = this._pendingSkill || null;
            const animScale2 = SrpgAnimScale.calcForSkill(atk, animSkill2, hitTarget.x, hitTarget.y);
            SrpgAnimScale.setScale(animScale2);
            SrpgCombat.playCombatEffects(atk, hitTarget);

            // ─── 스킬 → 장판/구름 생성 + 기존 장판 원소 반응 ───
            if (skillId) {
                this._processFieldCreation(atk, hitTarget.x, hitTarget.y, skillId);
            }

            this._phase = "combat";
            this._combatAnimTimer = 60;
            this._subPhase = "animating";
        },

        // ─── 스킬 사용 후 장판/구름 생성 + 기존 장판 원소 반응 ───
        _processFieldCreation(casterUnit, targetX, targetY, skillId) {
            if (!skillId) return;
            const fieldMeta = parseSkillFieldMeta(skillId);

            // 1. 스킬의 원소 → 기존 장판/구름에 원소 반응 적용
            // 스킬의 원소 ID 해석 (SrpgCombat의 resolveSkillElement 사용)
            let skillElement = 0;
            try {
                if (SrpgCombat && SrpgCombat.resolveSkillElement) {
                    skillElement = SrpgCombat.resolveSkillElement(casterUnit, skillId);
                } else if ($dataSkills[skillId] && $dataSkills[skillId].damage) {
                    skillElement = $dataSkills[skillId].damage.elementId || 0;
                }
            } catch (e) { skillElement = 0; }

            // 스킬 범위(area) 타일 계산
            const skill = $dataSkills[skillId];
            const areaMeta = parseRangeMeta(skill ? skill.note || "" : "");
            let affectedTiles;
            if (areaMeta.area && areaMeta.area.length > 0) {
                affectedTiles = areaMeta.area.map(t => ({
                    x: targetX + (t.dx || 0),
                    y: targetY + (t.dy || 0)
                }));
            } else {
                affectedTiles = [{ x: targetX, y: targetY }];
            }

            // 기존 장판에 원소 반응 적용
            if (skillElement > 0 && typeof SrpgField !== 'undefined') {
                for (const tile of affectedTiles) {
                    SrpgField.applyElementToTile(tile.x, tile.y, skillElement, casterUnit.id || 0);
                }
            }

            // 2. 장판/구름 생성 (노트태그 기반)
            if (!fieldMeta || typeof SrpgField === 'undefined') return;

            if (fieldMeta.surface) {
                SrpgField.createSurface({
                    baseType: fieldMeta.surface.baseType,
                    tiles: affectedTiles.map(t => ({ x: t.x, y: t.y })),
                    duration: fieldMeta.surface.duration,
                    ownerId: casterUnit.id || 0,
                    ownerTeam: casterUnit.teamId || casterUnit.team || 0,
                    modifier: fieldMeta.surface.modifier || "normal",
                });
                console.log(`[SM] 장판 생성: ${fieldMeta.surface.baseType} (${affectedTiles.length}타일, ${fieldMeta.surface.duration}턴)`);
            }

            if (fieldMeta.cloud) {
                SrpgField.createCloud({
                    baseType: fieldMeta.cloud.baseType,
                    tiles: affectedTiles.map(t => ({ x: t.x, y: t.y })),
                    duration: fieldMeta.cloud.duration,
                    ownerId: casterUnit.id || 0,
                    ownerTeam: casterUnit.teamId || casterUnit.team || 0,
                    modifier: fieldMeta.cloud.modifier || "normal",
                });
                console.log(`[SM] 구름 생성: ${fieldMeta.cloud.baseType} (${affectedTiles.length}타일, ${fieldMeta.cloud.duration}턴)`);
            }

            // 3. 장판 위 유닛에 즉시 효과 적용
            for (const tile of affectedTiles) {
                const unitOnTile = this.unitAt(tile.x, tile.y);
                if (unitOnTile && unitOnTile.isAlive()) {
                    SrpgField.checkUnitFieldStatus(unitOnTile);
                }
            }
        },

        _handleExecuting() {
            // 전투 결과 후 처리
            const unit = this._currentUnit;
            unit.consumeSegmentMove();
            this._checkContinueTurn(unit);
        },

        // ─── 전투 애니메이션 ───
        _updateCombat() {
            // 멀티샷 서브페이즈
            if (this._subPhase === "multishot") {
                if (!this._projTimeout) this._projTimeout = 0;
                this._projTimeout++;
                if (this._projTimeout > 1200) {
                    console.warn("[SRPG] MultiShot timeout!");
                    SrpgProjectile.clear();
                    this._combatAnimTimer = 30;
                    this._subPhase = "animating";
                    this._projTimeout = 0;
                    return;
                }
                this._updateMultiShot();
                return;
            }
            // 투사체 비행 중이면 투사체 완료 대기
            if (this._subPhase === "projectile") {
                // 안전장치: 비트맵 로드 실패 등으로 투사체가 끝나지 않을 때 대비
                if (!this._projTimeout) this._projTimeout = 0;
                this._projTimeout++;
                if (!SrpgProjectile.isBusy() || this._projTimeout > 600) {
                    if (this._projTimeout > 600) {
                        console.warn("[SRPG] Projectile timeout! Forcing combat phase end.");
                        SrpgProjectile.clear();
                    }
                    // 투사체가 사라졌는데 아직 animating으로 안 넘어갔으면 강제 전환
                    this._combatAnimTimer = 30;
                    this._subPhase = "animating";
                    this._projTimeout = 0;
                }
                return;
            }
            this._combatAnimTimer--;
            if (this._combatAnimTimer <= 0) {
                // 유닛 상태 갱신
                const unit = this._currentUnit;
                unit.refreshTint();
                if (this._selectedTarget) this._selectedTarget.refreshTint();

                this._combatResult = null;
                this._pendingSkill = null; // 스킬 사용 완료 → 초기화
                // 초상화 상태 복원
                if (PORTRAIT_MODE) {
                    unit.setPortraitState("idle");
                    if (this._selectedTarget) this._selectedTarget.setPortraitState("idle");
                }
                this._selectedTarget = null;
                this._combatPrediction = null; this._pvBtnArea = null;

                // 구간 이동거리 소비
                unit.consumeSegmentMove();

                // 남은 행동 & 이동 예산 확인 → 턴 계속 or 종료
                this._checkContinueTurn(unit);
            }
        },

        // 행동 후 턴 계속 여부 판정
        _checkContinueTurn(unit) {
            if (!unit || !unit.isAlive()) {
                this._endCurrentTurn();
                return;
            }
            // 행동이나 이동이 남아있으면 → 메뉴로
            if (unit.canAct() || unit.remainingMov() > 0) {
                this._phase = "playerTurn";
                if (unit.remainingMov() > 0) {
                    this._subPhase = "awaitCommand";
                    this._showMoveRange();
                } else {
                    this._openActionMenu();
                }
                this._inputDelay = 10;
                this._uiDirty = true;
            } else {
                // 모든 행동/이동 소진 → 턴 종료
                this._endCurrentTurn();
            }
        },

        // ─── 방향 전환 (보조행동 — 화살표 UI 인터랙티브) ───
        // _faceDirHover: 현재 호버 중인 방향 (2/4/6/8)
        // _faceDirTick: 애니메이션 틱 (글로우 펄스, 떠다님)
        // _faceDirOrigDir: 진입 시 원래 방향 (취소용)
        _handleFaceDirection() {
            const unit = this._currentUnit;
            if (!unit) { this._endCurrentTurn(); return; }

            // 애니메이션 틱 증가 (오버레이 갱신은 SrpgUI.update에서 처리)
            if (this._faceDirTick === undefined) this._faceDirTick = 0;
            this._faceDirTick++;

            // 원래 방향 저장 (최초 진입 시)
            if (this._faceDirOrigDir === undefined) {
                this._faceDirOrigDir = unit.event.direction();
            }

            const dirOffsets = { 2: {dx:0,dy:1}, 4: {dx:-1,dy:0}, 6: {dx:1,dy:0}, 8: {dx:0,dy:-1} };

            // ─── 키보드: 방향키로 호버 이동 ───
            const dir = Input.dir4;
            if (dir > 0 && dir !== this._faceDirHover) {
                this._faceDirHover = dir;
            }

            // ─── 마우스 호버: 클릭 없이 이동만으로 감지 ───
            const hover = this.getHoverTile();
            if (hover) {
                for (const [d, off] of Object.entries(dirOffsets)) {
                    if (hover.x === unit.x + off.dx && hover.y === unit.y + off.dy) {
                        const dNum = Number(d);
                        if (this._faceDirHover !== dNum) {
                            this._faceDirHover = dNum;
                        }
                        break;
                    }
                }
            }

            // ─── 스프라이트 방향 미리보기 ───
            if (this._faceDirHover && !PORTRAIT_MODE) {
                unit.event.setDirection(this._faceDirHover);
            }

            // ─── 확인: 클릭 또는 ok ───
            const clickPt = this.getPointerTile();
            const clickOnArrow = clickPt && Object.entries(dirOffsets).some(([d, off]) =>
                clickPt.x === unit.x + off.dx && clickPt.y === unit.y + off.dy &&
                Number(d) === this._faceDirHover
            );
            const confirmed = Input.isTriggered("ok") || (TouchInput.isTriggered() && clickOnArrow);

            if (confirmed && this._faceDirHover) {
                unit.event.setDirection(this._faceDirHover);
                this._cleanupFaceDir();
                this._openActionMenu();
                return;
            }

            // ─── 취소: 원래 방향으로 복원 후 복귀 ───
            if (Input.isTriggered("escape") || TouchInput.isCancelled()) {
                unit.event.setDirection(this._faceDirOrigDir || 2);
                this._cleanupFaceDir();
                this._openActionMenu();
                return;
            }
        },

        _cleanupFaceDir() {
            delete this._faceDirHover;
            delete this._faceDirTick;
            delete this._faceDirOrigDir;
        },

        // ─── 보조행동 타겟 선택 핸들러 ───
        _handleSelectBonusTarget() {
            const unit = this._currentUnit;
            const item = this._pendingBonusItem;
            if (!unit || !item) { this._openActionMenu(); return; }

            const rangeTiles = this._atkRange || [];
            if (rangeTiles.length === 0) { this._openActionMenu(); return; }
            const rangeSet = new Set(rangeTiles.map(t => `${t.x},${t.y}`));

            // 첫 진입: 커서 초기화
            if (!this._targetCursorActive) {
                this._targetCursorActive = true;
                // 범위 내 첫 번째 유닛으로
                let firstTarget = null;
                for (const t of rangeTiles) {
                    const u = this.unitAt(t.x, t.y);
                    if (u && u.isAlive() && u !== unit) { firstTarget = t; break; }
                }
                this._targetTileX = firstTarget ? firstTarget.x : rangeTiles[0].x;
                this._targetTileY = firstTarget ? firstTarget.y : rangeTiles[0].y;
                this._uiDirty = true;
            }

            // 키보드 방향키
            const dir = Input.dir4;
            if (dir > 0) {
                const dmap = { 2:{dx:0,dy:1}, 4:{dx:-1,dy:0}, 6:{dx:1,dy:0}, 8:{dx:0,dy:-1} };
                const d = dmap[dir];
                if (d) {
                    const nx = this._targetTileX + d.dx, ny = this._targetTileY + d.dy;
                    if (rangeSet.has(`${nx},${ny}`)) {
                        this._targetTileX = nx; this._targetTileY = ny;
                        this._uiDirty = true;
                    }
                }
            }

            // 마우스 호버
            const hover = this.getHoverTile();
            if (hover && rangeSet.has(`${hover.x},${hover.y}`)) {
                if (this._targetTileX !== hover.x || this._targetTileY !== hover.y) {
                    this._targetTileX = hover.x; this._targetTileY = hover.y;
                    this._uiDirty = true;
                }
            }

            // 확인
            const clickPt = this.getPointerTile();
            const clickInRange = clickPt && rangeSet.has(`${clickPt.x},${clickPt.y}`);
            if (Input.isTriggered("ok") || (TouchInput.isTriggered() && clickInRange)) {
                const tx = clickInRange ? clickPt.x : this._targetTileX;
                const ty = clickInRange ? clickPt.y : this._targetTileY;
                const target = this.unitAt(tx, ty);
                if (target && target.isAlive() && target !== unit) {
                    this._bonusTarget = target;
                    this._targetCursorActive = false;
                    this._atkRange = [];
                    this._executeBonusAction(item);
                    this._pendingBonusItem = null;
                    this._bonusTarget = null; // 사용 후 클리어
                }
                return;
            }

            // 취소
            if (Input.isTriggered("escape") || TouchInput.isCancelled()) {
                this._pendingBonusItem = null;
                this._bonusTarget = null;
                this._targetCursorActive = false;
                this._atkRange = [];
                this._openActionMenu();
                return;
            }
        },

        // ─── 투척 타겟 선택 핸들러 ───
        _handleSelectThrowTarget() {
            const unit = this._currentUnit;
            const obj = this._throwObject;
            if (!unit || !obj) { this._endCurrentTurn(); return; }

            const throwTiles = this._throwRange || [];
            if (throwTiles.length === 0) { this._endCurrentTurn(); return; }

            const throwSet = new Set(throwTiles.map(t => `${t.x},${t.y}`));

            // 첫 진입: 커서 초기화
            if (!this._targetCursorActive) {
                this._targetCursorActive = true;
                this._targetTileX = throwTiles[0].x;
                this._targetTileY = throwTiles[0].y;
                this._atkRange = throwTiles; // UI용 범위 표시
                this._uiDirty = true;
            }

            // 키보드 방향키로 커서 이동
            const dir = Input.dir4;
            if (dir > 0) {
                const dmap = { 2:{dx:0,dy:1}, 4:{dx:-1,dy:0}, 6:{dx:1,dy:0}, 8:{dx:0,dy:-1} };
                const d = dmap[dir];
                if (d) {
                    const nx = this._targetTileX + d.dx;
                    const ny = this._targetTileY + d.dy;
                    if (throwSet.has(`${nx},${ny}`)) {
                        this._targetTileX = nx;
                        this._targetTileY = ny;
                        this._uiDirty = true;
                    }
                }
            }

            // 마우스 호버
            const hover = this.getHoverTile();
            if (hover && throwSet.has(`${hover.x},${hover.y}`)) {
                if (this._targetTileX !== hover.x || this._targetTileY !== hover.y) {
                    this._targetTileX = hover.x;
                    this._targetTileY = hover.y;
                    this._uiDirty = true;
                }
            }

            // 확인
            const clickPt = this.getPointerTile();
            const clickInRange = clickPt && throwSet.has(`${clickPt.x},${clickPt.y}`);
            if (Input.isTriggered("ok") || (TouchInput.isTriggered() && clickInRange)) {
                const tx = clickInRange ? clickPt.x : this._targetTileX;
                const ty = clickInRange ? clickPt.y : this._targetTileY;
                // 투척 실행
                unit.useMainAction();
                const results = SrpgThrow.execute(unit, obj, tx, ty);
                // 팝업 표시
                this._addPopup(tx, ty, `-${results.objDamage}`, "#ffaa44");
                if (results.hitUnit) {
                    this._addPopup(results.hitUnit.x, results.hitUnit.y,
                        `-${results.hitDamage}`, "#ff4444");
                }
                let msg = `${obj.name} 투척!`;
                if (results.objDestroyed) msg += " (붕괴)";
                if (results.hitUnit) msg += ` ${results.hitUnit.name} 충돌!`;
                this._addPopup(unit.x, unit.y, msg, "#ffaa44", true);
                // 정리
                this._throwObject = null;
                this._throwRange = null;
                this._atkRange = [];
                this._targetCursorActive = false;
                this._inputDelay = 25;
                this._uiDirty = true;
                this._openActionMenu();
                return;
            }

            // 취소
            if (Input.isTriggered("escape") || TouchInput.isCancelled()) {
                this._throwObject = null;
                this._throwRange = null;
                this._atkRange = [];
                this._targetCursorActive = false;
                this._openActionMenu();
                return;
            }
        },

        // ─── 턴 종료 (팀 페이즈 대응) ───
        _endCurrentTurn() {
            // 시야 오버레이 클리어
            this._showEnemyVision = false;
            const unit = this._currentUnit;
            if (unit) {
                unit.refreshTint();
                unit.event.setThrough(false);
                unit.event.setMoveSpeed(getSrpgMoveSpeed());
                // 팀 페이즈: 이 유닛을 완료 목록에 추가
                if (!this._finishedUnits.includes(unit)) {
                    this._finishedUnits.push(unit);
                }
            }

            // 공통 상태 정리
            this._currentUnit = null;
            this._selectedTarget = null;
            this._moveRange = [];
            this._moveRangeSet = null;
            this._segMoveRange = null;
            this._segMoveRangeSet = null;
            this._atkRange = [];
            this._menuItems = null;
            this._radialItems = null;
            this._reelItems = null;
            this._combatPrediction = null; this._pvBtnArea = null;
            this._freeMoving = false;
            this._enemyMoveRange = [];
            this._enemyMovePath = [];
            this._enemyActionMsg = "";
            this._enemyOrigin = null;
            this._enemyDest = null;
            this._enemyDecision = null;
            this._enemyShowTimer = 0;
            this._enemyActionTimer = 0;

            // 적군 페이즈 중이면 → 다음 적 유닛 처리
            if (this._phase === "enemyTurn") {
                this._turnPredictDirty = true;
                this._uiDirty = true;
                this._startNextEnemyInPhase();
                return;
            }

            // 아군 페이즈: 행동 가능한 유닛이 남아있는지 확인
            const remaining = this._availablePhaseUnits();
            if (remaining.length > 0) {
                // 남은 유닛 있음 → 브라우즈 모드로 복귀 (자동 선택 안 함)
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
            } else if (this._phaseRounds &&
                       this._currentRoundIndex < this._phaseRounds.length - 1) {
                // 현재 라운드 완료, 다음 라운드 존재 → 다음 라운드 시작
                this._startPhaseRound(this._currentRoundIndex + 1);
            } else {
                // 모든 라운드 완료 → 다음 턴 어드밴스
                this._finishedUnits = [];  // 투명화 즉시 해제
                this._phase = "turnAdvance";
                this._subPhase = "none";
                this._inputDelay = 10;
            }
            this._turnPredictDirty = true;
            this._uiDirty = true;
        },

        // ─── 기회 공격 이동 체크 ───
        _checkOpportunityAttack(movingUnit, prevX, prevY) {
            if (!movingUnit || !movingUnit.isAlive()) return null;
            const curX = movingUnit.x, curY = movingUnit.y;
            const ADJ = [[0,-1],[0,1],[-1,0],[1,0]];
            for (const [dx, dy] of ADJ) {
                const oaX = prevX + dx, oaY = prevY + dy;
                const u = this.unitAt(oaX, oaY);
                if (!u || u === movingUnit || !u.isAlive()) continue;
                if (!u.isHostileTo(movingUnit)) continue;
                if (!u.canOpportunityAttack()) continue;
                // 고저차 체크 — 근접 상호작용 불가하면 OA 발동 안 함
                if (!SrpgGrid.canMeleeInteract(oaX, oaY, prevX, prevY)) continue;
                const stillAdj = ADJ.some(([ax, ay]) => curX + ax === u.x && curY + ay === u.y);
                if (stillAdj) continue;
                if (movingUnit._data && movingUnit._data.note &&
                    /<srpgNoOpportunity:\s*true>/i.test(movingUnit._data.note)) continue;
                if (movingUnit.ignoreZoC) continue;
                const result = SrpgCombat.executeOpportunityAttack(u, movingUnit);
                if (result) return result;
            }
            return null;
        },

        // ─── 협동 공격 체크 (전투 후) ───
        _checkFollowUpAttack(attacker, defender) {
            if (!defender || !defender.isAlive()) return null;
            const ally = SrpgCombat.findFollowUpAlly(attacker, defender);
            if (!ally) return null;
            return SrpgCombat.executeFollowUp(ally.unit, defender, ally.affinity);
        },

        // ─── 적 턴 AI ───
        _updateEnemyTurn() {
            const unit = this._currentUnit;
            if (!unit || !unit.isAlive()) {
                this._endCurrentTurn();
                return;
            }

            switch (this._subPhase) {
                case "thinking":
                    this._enemyThinkTimer--;
                    if (this._enemyThinkTimer <= 0) {
                        this._enemyDecide();
                    }
                    break;
                case "showDecision":
                    // 결정 표시 타이머 → 이동 범위 표시 단계
                    this._enemyShowTimer--;
                    if (this._enemyShowTimer <= 0) {
                        this._subPhase = "enemyShowRange";
                        this._enemyShowTimer = 25;
                        this._uiDirty = true;
                    }
                    break;
                case "enemyShowRange":
                    this._enemyShowRange();
                    break;
                case "enemyMoving":
                    if (!unit.updateMove()) {
                        unit.hasMoved = true;
                        // ─── 이동 경로상 기회 공격 체크 ───
                        if (this._enemyOrigin) {
                            const oaResult = this._checkOpportunityAttack(
                                unit, this._enemyOrigin.x, this._enemyOrigin.y);
                            if (oaResult) {
                                this._addPopup(oaResult.reactor.x, oaResult.reactor.y, "기회 공격!", "#FFD700");
                                this._addPopup(unit.x, unit.y, String(oaResult.damage), "#FF4444");
                                if (oaResult.died) {
                                    unit.refreshTint();
                                    this._endCurrentTurn();
                                    return;
                                }
                            }
                        }
                        this._subPhase = "enemyShowAction";
                        this._enemyActionTimer = 30;
                        this._uiDirty = true;
                    }
                    break;
                case "enemyShowAction":
                    this._enemyShowAction();
                    break;
                case "enemyActing":
                    this._combatAnimTimer--;
                    if (this._combatAnimTimer <= 0) {
                        if (this._selectedTarget) this._selectedTarget.refreshTint();
                        unit.refreshTint();
                        this._selectedTarget = null;
                        this._combatResult = null;
                        this._endCurrentTurn();
                    }
                    break;
            }
        },

        // ─── 적 AI 스킬 선택 헬퍼 ───
        // RMMZ 행동 패턴: {skillId, conditionType, conditionParam1, conditionParam2, rating}
        // conditionType: 0=항상, 1=턴, 2=HP, 3=MP, 4=상태, 5=파티레벨, 6=스위치
        _selectEnemySkill(unit) {
            if (!unit._data || !unit._data.actions || unit._data.actions.length === 0) {
                return null; // DB에 행동 패턴 없음 → 기본 공격
            }

            const actions = unit._data.actions;
            const candidates = [];

            for (const act of actions) {
                if (!act.skillId) continue;
                // 스킬 사용 가능 여부 (MP 체크)
                const skill = (typeof $dataSkills !== "undefined") ? $dataSkills[act.skillId] : null;
                if (skill && skill.mpCost > 0) {
                    const aiMcr = unit.mcr || 1;
                    if (unit.mp < Math.floor(skill.mpCost * aiMcr)) continue;
                }

                // 조건 체크
                let condMet = true;
                switch (act.conditionType) {
                    case 0: // 항상
                        break;
                    case 1: // 턴 (param1 + param2 * X)
                        // 간이 구현: 현재 턴 카운터가 없으므로 항상 통과
                        break;
                    case 2: // HP (param1% ~ param2%)
                        const hpRate = unit.hp / unit.mhp * 100;
                        if (hpRate < (act.conditionParam1 || 0) || hpRate > (act.conditionParam2 || 100)) {
                            condMet = false;
                        }
                        break;
                    case 3: // MP (param1% ~ param2%)
                        const mpRate = unit.mp / Math.max(1, unit.mmp) * 100;
                        if (mpRate < (act.conditionParam1 || 0) || mpRate > (act.conditionParam2 || 100)) {
                            condMet = false;
                        }
                        break;
                    case 4: // 상태 (param1 = stateId)
                        if (unit.hasState && !unit.hasState(act.conditionParam1)) {
                            condMet = false;
                        }
                        break;
                    case 6: // 스위치 (param1 = switchId)
                        try {
                            if (typeof $gameSwitches !== "undefined" && !$gameSwitches.value(act.conditionParam1)) {
                                condMet = false;
                            }
                        } catch (e) { condMet = false; }
                        break;
                    default:
                        break;
                }

                if (condMet) {
                    candidates.push({ skillId: act.skillId, rating: act.rating || 5, skill: skill });
                }
            }

            if (candidates.length === 0) return null;

            // RMMZ 방식: rating 기반 가중 랜덤 선택
            // 최고 rating에서 -3 이하인 것은 제외
            const maxRating = Math.max(...candidates.map(c => c.rating));
            const filtered = candidates.filter(c => c.rating >= maxRating - 3);
            // 가중치: rating - (maxRating - 3) + 1
            const weights = filtered.map(c => c.rating - (maxRating - 3) + 1);
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let rand = Math.random() * totalWeight;
            for (let i = 0; i < filtered.length; i++) {
                rand -= weights[i];
                if (rand <= 0) return filtered[i];
            }
            return filtered[filtered.length - 1];
        },

        _enemyDecide() {
            const unit = this._currentUnit;
            // 은신 유닛 필터링: 감지 불가능한 아군은 타겟에서 제외
            const allAllies = this.allyUnits();
            const allies = allAllies.filter(a => {
                if (typeof SrpgVision !== "undefined") {
                    return SrpgVision.isVisibleToEnemy(a, unit);
                }
                return true;
            });
            if (allies.length === 0) { this._endCurrentTurn(); return; }

            // ─── 스킬 선택 (DB 행동 패턴 기반) ───
            const selectedAction = this._selectEnemySkill(unit);
            const useSkillId = selectedAction ? selectedAction.skillId : 0;
            const useSkill = selectedAction ? selectedAction.skill : null;

            // 가장 가까운 아군 찾기
            let closest = null, minDist = 9999;
            for (const a of allies) {
                const d = SrpgGrid.dist(unit.x, unit.y, a.x, a.y);
                if (d < minDist) { minDist = d; closest = a; }
            }

            // 이동 범위 계산
            const moveRange = SrpgGrid.calcMoveRange(unit);

            // ─── 스킬 범위 고려한 공격 타일 탐색 ───
            // 스킬에 커스텀 범위가 있으면 그 범위를 사용
            let bestTile = null, bestDist = 9999, bestTarget = null;
            for (const tile of moveRange) {
                // 스킬 범위 또는 기본 공격 범위
                const atkR = useSkill
                    ? SrpgGrid.calcAtkRange(unit, tile.x, tile.y)
                    : SrpgGrid.calcAtkRange(unit, tile.x, tile.y);
                for (const at of atkR) {
                    const target = this.unitAt(at.x, at.y);
                    if (target && target.isAlive() && unit.isHostileTo(target) && !target.isObject) {
                        const pathCheck = SrpgCombat.checkAttackPath(
                            Object.assign({}, unit, {x: tile.x, y: tile.y}), target, useSkillId);
                        if (pathCheck.blocked) continue;
                        // TGR 가중 거리: 낮은 값 = 우선 타겟
                        // TGR이 높으면 가중 거리가 줄어들어 우선 선택됨
                        const rawDist = SrpgGrid.dist(tile.x, tile.y, target.x, target.y);
                        const tgrWeight = target.tgr || 1;
                        let d = rawDist / Math.max(0.1, tgrWeight); // TGR↑ → 거리 감소 효과
                        // ─── 장판 위험도 보정 ───
                        if (typeof SrpgField !== "undefined") {
                            const sf = SrpgField.getSurfaceAt(tile.x, tile.y);
                            if (sf) {
                                const isOwn = (unit.teamId === sf.ownerTeam);
                                if (!isOwn) {
                                    // 적 장판 위 이동 패널티 (화염/용암 = 큰 패널티)
                                    const hazard = (sf.baseType === "fire" || sf.baseType === "lava") ? 6 : 3;
                                    d += hazard;
                                } else if (sf.modifier === "cursed") {
                                    d += 2; // 저주받은 자기편 장판도 기피
                                }
                            }
                        }
                        if (d < bestDist) {
                            bestDist = d;
                            bestTile = tile;
                            bestTarget = target;
                        }
                    }
                }
            }

            if (bestTile && bestTarget) {
                const path = SrpgGrid.findPath(unit, bestTile.x, bestTile.y, moveRange);
                this._enemyDecision = { type: "attack", movePath: path, target: bestTarget, moveRange, skillId: useSkillId, skill: useSkill };
                this._enemyMoveRange = moveRange.map(t => ({x: t.x, y: t.y}));
                this._enemyMovePath = path;
                const skillName = useSkill ? useSkill.name : "공격";
                this._enemyActionMsg = `${bestTarget.name}에게 ${skillName}!`;
                this._enemyOrigin = {x: unit.x, y: unit.y};
                this._enemyDest = {x: bestTile.x, y: bestTile.y};
            } else if (closest) {
                let closestTile = null, closestDist = 9999;
                for (const tile of moveRange) {
                    let d = SrpgGrid.dist(tile.x, tile.y, closest.x, closest.y);
                    // ─── 접근 이동 시 장판 위험도 보정 ───
                    if (typeof SrpgField !== "undefined") {
                        const sf = SrpgField.getSurfaceAt(tile.x, tile.y);
                        if (sf) {
                            const isOwn = (unit.teamId === sf.ownerTeam);
                            if (!isOwn) {
                                const hazard = (sf.baseType === "fire" || sf.baseType === "lava") ? 6 : 3;
                                d += hazard;
                            } else if (sf.modifier === "cursed") {
                                d += 2;
                            }
                        }
                    }
                    if (d < closestDist) { closestDist = d; closestTile = tile; }
                }
                if (closestTile) {
                    const path = SrpgGrid.findPath(unit, closestTile.x, closestTile.y, moveRange);
                    this._enemyDecision = { type: "move", movePath: path, target: null, moveRange };
                    this._enemyMoveRange = moveRange.map(t => ({x: t.x, y: t.y}));
                    this._enemyMovePath = path;
                    this._enemyActionMsg = "접근 중...";
                    this._enemyOrigin = {x: unit.x, y: unit.y};
                    this._enemyDest = {x: closestTile.x, y: closestTile.y};
                } else {
                    this._enemyDecision = { type: "wait" };
                    this._enemyActionMsg = "대기";
                }
            } else {
                this._enemyDecision = { type: "wait" };
                this._enemyActionMsg = "대기";
            }

            this._enemyShowTimer = 40;
            this._subPhase = "showDecision";
            this._uiDirty = true;
        },

        // ─── 적 이동 범위 표시 후 이동 시작 ───
        _enemyShowRange() {
            this._enemyShowTimer--;
            if (this._enemyShowTimer <= 0) {
                const dec = this._enemyDecision;
                if (!dec) { this._endCurrentTurn(); return; }
                if (dec.type === "wait") {
                    this._endCurrentTurn();
                    return;
                }
                // 이동 경로가 있으면 이동 시작
                if (dec.movePath && dec.movePath.length > 0) {
                    this._currentUnit.startMovePath(dec.movePath);
                    this._subPhase = "enemyMoving";
                } else {
                    // 이동 없이 바로 행동
                    this._currentUnit.hasMoved = true;
                    this._subPhase = "enemyShowAction";
                    this._enemyActionTimer = 30;
                    this._uiDirty = true;
                }
            }
        },

        // ─── 적 행동 메시지 표시 후 전투 실행 ───
        _enemyShowAction() {
            this._enemyActionTimer--;
            if (this._enemyActionTimer <= 0) {
                const dec = this._enemyDecision;
                if (!dec || dec.type !== "attack" || !dec.target || !dec.target.isAlive()) {
                    this._endCurrentTurn();
                    return;
                }
                // 전투 실행 (SrpgCombat.execute 사용)
                const unit = this._currentUnit;
                const target = dec.target;

                // 방향 전환 (타겟 방향)
                const ddx = target.x - unit.x, ddy = target.y - unit.y;
                if (Math.abs(ddx) > Math.abs(ddy)) {
                    unit.event.setDirection(ddx > 0 ? 6 : 4);
                } else {
                    unit.event.setDirection(ddy > 0 ? 2 : 8);
                }

                // ── 적 스킬명/공격 외침 팝업 ──
                const enemySkillName = (dec.skill && dec.skill.name) ? dec.skill.name : "공격!";
                this._addPopup(unit.x, unit.y, enemySkillName, "#ffffff", true);

                // 스킬 MP 소모 (MCR 적용)
                if (dec.skill && dec.skill.mpCost > 0) {
                    const mcrRate = unit.mcr || 1; // sparam MCR (MP 소비율)
                    const actualCost = Math.floor(dec.skill.mpCost * mcrRate);
                    unit.mp -= actualCost;
                }

                const enemySkillId = dec.skillId || 0;
                this._pendingSkill = dec.skill || null;
                const result = SrpgCombat.execute(unit, target, false, enemySkillId);
                this._combatResult = result;
                this._selectedTarget = target;
                unit.useMainAction();

                const hitTarget = result.actualTarget || target;

                // ─── 적 AI 협동 공격 체크 ───
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
                }

                // 상태 갱신
                hitTarget.refreshTint();
                unit.refreshTint();

                this._combatAnimTimer = 60;
                this._subPhase = "enemyActing";
                this._uiDirty = true;
                this._turnPredictDirty = true;
            }
        },
    }; // ── SM (SrpgManager) 끝 ──
