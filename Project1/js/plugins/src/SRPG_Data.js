// ─── SRPG_Data.js ───────────────────────────────────────────────────────────
// 빌드 순서: 1/3 (최하위 계층)
//
// [포함 모듈]
//   상수/유틸      — C, TERRAIN, FIRE_MODE, TEAM_COLORS
//                    ADJ4, ADJ8, makeDiamond, makeRing, parseTileList 등
//                    noteTagValue, noteTagBool, parseRangeMeta, parseStateMeta
//                    resolveReach, resolveArea, rotateTile, tilesToAbsolute
//                    WTYPE_RANGE_DEFAULTS
//   SrpgSkillMeta  — 스킬 범위 메타 파싱 (→ window.SrpgSkillMeta)
//                    parse, defaultMeta, defaultAttackMeta, getRange
//                    calcReachTiles, calcEffectTiles
//   SrpgUnit       — 유닛 클래스 (HP/MP/ATK/DEF/AGI, fireMode, 초상화 등)
//   SrpgEventProxy — 소환용 경량 이벤트 프록시
//   SrpgSummon     — 소환 시스템 (barricade, wall, totem)
//                    parseSummonMeta, summon, clear
//   SrpgGrid       — 경로탐색, 사거리, 차단판정 (→ window.SrpgGrid)
//                    bfs, calcAtkRange, checkProjectilePath, doesTileBlock
//                    traceLine, getTerrainType, dist
//   SrpgTurnOrder  — AP 턴 큐 (advanceToNextTurn, predictTurns)
//   SrpgCombat     — 전투 판정
//                    resolveFireMode, checkAttackPath, execute, predict
//                    calcDamage, rollDamage, canCounter, critRate
//   SrpgFX         — 이펙트 상태 (startCritCharge, startHitReaction)
//   SrpgProjectile — 투사체 3종 연출 (projectile, hitray, artillery)
//   SrpgField      — 장판/구름 3계층 시스템 (→ window.SrpgField)
//                    SrpgSurface, SrpgCloud, create/remove/query/tick
//                    parseSkillMeta, createProjectile, createHitray
//                    createArtillery, update, clear
//
// [외부 의존] 없음 — 이 파일이 모든 상수와 유틸을 정의함
// [참조하는 쪽] SRPG_SM.js, SRPG_UI.js
// ─────────────────────────────────────────────────────────────────────────────
//=============================================================================
// RPG Maker MZ - SRPG Core v2.0 (AP Turn Order + Direct Control)
//=============================================================================

/*:
 * @target MZ
 * @plugindesc AP 기반 턴 오더 SRPG 시스템. 마우스/터치 직접 조작, BG3식 행동 경제.
 * @author RMMZStudio
 *
 * @help SRPG_Core.js
 *
 * === 유닛 노트 태그 ===
 * <srpgUnit:actor>      아군 유닛
 * <srpgUnit:enemy>      적군 유닛
 * <srpgActorId:N>       배우 ID (아군)
 * <srpgEnemyId:N>       적 ID (적군)
 * <srpgLevel:N>         레벨
 * <srpgMov:N>           이동력 (기본 4)
 * <srpgAtkRange:N>      공격 사거리 (기본 1)
 * <srpgTeam:N>          팀 번호 (1=플레이어, 2+=적 세력, 기본: 아군1/적군2)
 *
 * === 파괴 가능 사물 노트 태그 ===
 * <srpgObject:true>      이 유닛을 파괴 가능 사물로 설정
 * <srpgObjectHp:N>       사물 HP (기본 100)
 * <srpgObjectDef:N>      사물 방어력 (기본 0)
 * <srpgObjectName:이름>  사물 표시 이름 (기본: 이벤트명)
 * <srpgDestroyPage:N>    파괴 시 실행할 이벤트 페이지 번호
 * - 사물은 이동/행동 불가, 턴 없음, 반격 없음
 * - 팀 설정에 따라 아군/적군/중립 가능 (srpgTeam 사용)
 * - srpgUnit:actor 또는 enemy와 함께 사용 가능
 *
 * === 투사체/지형 차단 시스템 ===
 * 타일셋의 Terrain Tag를 사용하여 3단계 지형 차단을 구현합니다.
 *   Terrain Tag 1 = 낭떠러지 (Cliff): 이동 불가, 직사/곡사 통과
 *   Terrain Tag 2 = 엄폐물 (Cover):  이동 불가, 직사 차단, 곡사 통과
 *   Terrain Tag 3 = 폐쇄벽 (Wall):   이동 불가, 직사/곡사 차단
 *
 * === 사격 모드 노트 태그 (이벤트 노트) ===
 * <srpgFireMode:direct>   직사 공격 (기본값, 사거리 2+)
 * <srpgFireMode:arc>      곡사 공격 (장애물 위로 넘어감)
 * <srpgFireMode:melee>    근접 공격 (사거리 1, 경로 무시)
 * - 사거리 1인 유닛은 자동으로 melee 취급
 * - 직사: 경로상 Cover/Wall에 의해 차단됨
 * - 곡사: Wall에만 차단됨 (Cover 위를 넘어감)
 * - 엄폐물(Cover) 타일에 파괴 가능 사물이 있고 직사 공격이
 *   차단되면, 해당 사물이 대신 피격됩니다.
 *
 * === 투사체 애니메이션 시스템 (스킬 노트 태그) ===
 * <srpgProjectile:projectile>  스프라이트 비행 투사체
 * <srpgProjectile:hitray>      즉시 빔 (3파트 이미지)
 * <srpgProjectile:artillery>   고각 포물선 포격
 *
 * --- Projectile 공통 태그 ---
 * <srpgProjImage:파일명>       img/srpg/ 이미지 (확장자 없이)
 * <srpgProjFrameW:N>           프레임 폭 (px, 기본 32)
 * <srpgProjFrameH:N>           프레임 높이 (px, 기본 32)
 * <srpgProjFrames:N>           프레임 수 (기본 1)
 * <srpgProjFrameSpeed:N>       프레임 속도 (틱, 기본 6)
 * <srpgProjSpeed:N>            비행 속도 (px/프레임, 기본 6)
 * <srpgProjScale:N>            스케일 (기본 1.0)
 * <srpgProjRotate:true/false>  방향 회전 (기본 true)
 * <srpgProjTrail:true/false>   잔상 효과 (기본 false)
 * <srpgProjImpactAnim:N>       착탄 RMMZ 애니메이션 ID
 * <srpgProjImpactSe:파일명>    착탄 SE
 *
 * --- Hitray 전용 태그 ---
 * <srpgBeamStart:파일명>       빔 시작부 이미지
 * <srpgBeamMid:파일명>         빔 중간부 이미지
 * <srpgBeamEnd:파일명>         빔 끝부분 이미지
 * <srpgBeamDuration:N>         빔 지속시간 (프레임, 기본 30)
 * <srpgBeamWidth:N>            빔 스케일 (기본 1.0)
 * <srpgHitCount:N>             히트 횟수 (기본 1)
 * <srpgHitInterval:N>          히트 간격 (프레임, 기본 10)
 *
 * --- Artillery 전용 태그 ---
 * <srpgArcHeight:N>            포물선 최대 높이 (px, 기본 200)
 * <srpgCameraPan:true/false>   착탄지 카메라 팬 (기본 true)
 * <srpgScatterRadius:N>        산개 반경 (타일, 기본 0)
 * <srpgWarningDuration:N>      위험 표시 시간 (프레임, 기본 40)
 *
 * === 조작법 ===
 * - 마우스/터치: 타일 클릭으로 이동/공격 대상 선택
 * - 방향키: 유닛 직접 이동
 * - Enter/Z: 확인     Escape/X: 취소
 *
 * === AP 턴 시스템 ===
 * 각 유닛의 AGI에 비례하여 AP가 누적되며, AP가 임계치에 도달한
 * 유닛부터 턴을 획득합니다. (대협입지전 스타일)
 *
 * === 행동 경제 (BG3 스타일) ===
 * 주 행동(Main Action): 공격, 스킬, 아이템 사용
 * 보조 행동(Bonus Action): 추가 이동, 대기 등
 *
 * @command StartBattle
 * @text SRPG 전투 시작
 * @desc 현재 맵에서 SRPG 전투를 시작합니다.
 *
 * @command EndBattle
 * @text SRPG 전투 종료
 * @desc 진행 중인 SRPG 전투를 종료합니다.
 *
 * @param DefaultMov
 * @text 기본 이동력
 * @type number
 * @default 4
 *
 * @param DefaultAtkRange
 * @text 기본 공격 사거리
 * @type number
 * @default 1
 *
 * @param TileSize
 * @text 타일 크기
 * @type number
 * @default 48
 *
 * @param APThreshold
 * @text AP 임계치
 * @type number
 * @default 1000
 * @desc AP가 이 값에 도달하면 턴 획득
 *
 * @param MoveSpeed
 * @text 유닛 이동 속도
 * @type select
 * @option 1 - 가장 느림
 * @value 1
 * @option 2 - 느림
 * @value 2
 * @option 3 - 보통
 * @value 3
 * @option 4 - 빠름 (RMMZ 기본)
 * @value 4
 * @option 5 - 매우 빠름
 * @value 5
 * @option 6 - 최고속
 * @value 6
 * @default 5
 * @desc 전투 중 유닛의 이동 애니메이션 속도 (1~6, 높을수록 빠름)
 *
 * @param PortraitMode
 * @text 스탠딩 초상화 모드
 * @type boolean
 * @on 초상화 모드
 * @off 기본 스프라이트
 * @default false
 * @desc 전투 중 캐릭터 스프라이트 대신 스탠딩 초상화를 표시합니다.
 * 이벤트 노트에 <srpgPortrait:파일명> 등으로 지정합니다.
 *
 * @param PortraitScale
 * @text 초상화 크기 배율
 * @type number
 * @decimals 1
 * @min 0.5
 * @max 3.0
 * @default 1.5
 * @desc 초상화의 최대 높이를 타일 크기의 몇 배까지 허용할지 (기본 1.5)
 */

(() => {
    "use strict";

    const pluginName = "SRPG_Core";
    const params = PluginManager.parameters(pluginName);
    const DEFAULT_MOV = Number(params["DefaultMov"] || 4);
    const DEFAULT_ATK_RANGE = Number(params["DefaultAtkRange"] || 1);
    const TILE = Number(params["TileSize"] || 48);
    const AP_THRESHOLD = Number(params["APThreshold"] || 1000);
    const _DEFAULT_MOVE_SPEED = Number(params["MoveSpeed"] || 5); // 기본 이동 속도
    // SRPG 시각 이동속도: ConfigManager에서 읽거나, 없으면 플러그인 기본값
    function getSrpgMoveSpeed() {
        if (typeof ConfigManager !== "undefined" && ConfigManager.srpgMoveSpeed != null) {
            return ConfigManager.srpgMoveSpeed;
        }
        return _DEFAULT_MOVE_SPEED;
    }
    const TURN_PREDICT_COUNT = 12; // 턴 오더바에 표시할 예측 턴 수
    // PortraitMode: "false"로 명시하지 않으면 기본 활성 (스튜디오 호환)
    const PORTRAIT_MODE = params["PortraitMode"] !== "false";
    const PORTRAIT_MAX_H = Number(params["PortraitScale"] || 1.5); // 타일 대비 최대 높이 배율

    // =========================================================================
    //  Grid Range System — 그리드 기반 사거리/효과 범위
    // =========================================================================

    // ─── 기본 인접 패턴 ───
    const ADJ4 = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];
    const ADJ8 = [{dx:0,dy:-1},{dx:1,dy:-1},{dx:1,dy:0},{dx:1,dy:1},
                  {dx:0,dy:1},{dx:-1,dy:1},{dx:-1,dy:0},{dx:-1,dy:-1}];

    // ─── 유틸리티 함수 ───
    function makeDiamond(r, includeCenter = false) {
        const tiles = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) + Math.abs(dy) > r) continue;
                if (!includeCenter && dx === 0 && dy === 0) continue;
                tiles.push({dx, dy});
            }
        }
        return tiles;
    }

    function makeRing(r) {
        const tiles = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) + Math.abs(dy) !== r) continue;
                tiles.push({dx, dy});
            }
        }
        return tiles;
    }

    function parseTileList(str) {
        // "0,1|0,-1|1,0|-1,0" → [{dx:0,dy:1}, ...]
        if (!str || !str.trim()) return null;
        return str.split("|").map(p => {
            const [dx, dy] = p.split(",").map(Number);
            return {dx, dy};
        });
    }

    function serializeTileList(tiles) {
        return tiles.map(t => `${t.dx},${t.dy}`).join("|");
    }

    function noteTagValue(note, tag) {
        if (!note) return null;
        const re = new RegExp("<" + tag + ":([^>]+)>", "i");
        const m = note.match(re);
        return m ? m[1].trim() : null;
    }

    function noteTagBool(note, tag) {
        if (!note) return false;
        return new RegExp("<" + tag + "(\\s*>|:true\\s*>)", "i").test(note);
    }

    // ─── 범위 메타 파싱 ───
    function parseRangeMeta(note) {
        const reach = parseTileList(noteTagValue(note, "srpgReach"));
        const area  = parseTileList(noteTagValue(note, "srpgArea"));
        const rotate = noteTagBool(note, "srpgRotate");
        const selfTarget = noteTagBool(note, "srpgSelfTarget");
        return { reach, area, rotate, selfTarget };
    }

    // ─── 스킬 장판/구름 생성 메타 파서 ───
    // <srpgSurface:baseType,duration>   → 장판 생성
    // <srpgSurfaceModifier:blessed>     → 변형자 지정 (기본: normal)
    // <srpgCloud:baseType,duration>     → 구름 생성
    // <srpgCloudModifier:cursed>        → 구름 변형자
    const _skillFieldMetaCache = {};
    function parseSkillFieldMeta(skillId) {
        if (_skillFieldMetaCache[skillId]) return _skillFieldMetaCache[skillId];
        if (typeof $dataSkills === 'undefined' || !$dataSkills[skillId]) return null;
        const note = $dataSkills[skillId].note || "";
        const result = {};

        // 장판 파싱
        const mSurface = note.match(/<srpgSurface:([a-zA-Z]+),(\d+)>/);
        if (mSurface) {
            result.surface = {
                baseType: mSurface[1].toLowerCase(),
                duration: Number(mSurface[2]),
            };
            // 변형자
            const mSmod = note.match(/<srpgSurfaceModifier:([a-zA-Z]+)>/);
            result.surface.modifier = mSmod ? mSmod[1].toLowerCase() : "normal";
        }

        // 구름 파싱
        const mCloud = note.match(/<srpgCloud:([a-zA-Z]+),(\d+)>/);
        if (mCloud) {
            result.cloud = {
                baseType: mCloud[1].toLowerCase(),
                duration: Number(mCloud[2]),
            };
            const mCmod = note.match(/<srpgCloudModifier:([a-zA-Z]+)>/);
            result.cloud.modifier = mCmod ? mCmod[1].toLowerCase() : "normal";
        }

        if (!result.surface && !result.cloud) {
            _skillFieldMetaCache[skillId] = null;
            return null;
        }
        _skillFieldMetaCache[skillId] = result;
        return result;
    }

    // ─── 상태 메타 파서 (티어/부패/속박 등) ───
    // $dataStates[stateId]의 note 필드에서 커스텀 태그를 파싱
    const _stateMetaCache = {};
    function parseStateMeta(stateId) {
        if (_stateMetaCache[stateId]) return _stateMetaCache[stateId];
        if (typeof $dataStates === 'undefined' || !$dataStates[stateId]) return {};
        const note = $dataStates[stateId].note || "";
        const meta = {};
        const mTier = note.match(/<srpgTier:(\d+)>/);
        if (mTier) meta.tier = Number(mTier[1]);
        const mElem = note.match(/<srpgTierElement:(\d+)>/);
        if (mElem) meta.tierElement = Number(mElem[1]);
        const mPair = note.match(/<srpgTierPair:(\d+)>/);
        if (mPair) meta.tierPair = Number(mPair[1]);
        if (note.includes('<srpgDecaying>')) meta.decaying = true;
        if (note.includes('<srpgImmobile>')) meta.immobile = true;
        if (note.includes('<srpgBleedField>')) meta.bleedField = true;
        _stateMetaCache[stateId] = meta;
        return meta;
    }

    // 특정 원소에 대응하는 T1 상태 ID 찾기
    // (미리 빌드된 룩업 — $dataStates 로드 후 초기화)
    let _tierT1ByElement = null;
    function getTierT1StateForElement(elementId) {
        if (!_tierT1ByElement) {
            _tierT1ByElement = {};
            if (typeof $dataStates !== 'undefined') {
                for (let i = 1; i < $dataStates.length; i++) {
                    if (!$dataStates[i]) continue;
                    const m = parseStateMeta(i);
                    if (m.tier === 1 && m.tierElement) {
                        _tierT1ByElement[m.tierElement] = i;
                    }
                }
            }
        }
        return _tierT1ByElement[elementId] || 0;
    }

    // ─── 방향 회전 ───
    function rotateTile(dx, dy, dir) {
        // 기본: 위(8), 시계방향 회전
        switch (dir) {
            case 8: return {dx, dy};        // ↑ 그대로
            case 6: return {dx: -dy, dy: dx}; // → 90° CW
            case 2: return {dx: -dx, dy: -dy}; // ↓ 180°
            case 4: return {dx: dy, dy: -dx}; // ← 270° CW
            default: return {dx, dy};
        }
    }

    function tilesToAbsolute(tiles, cx, cy, dir, shouldRotate) {
        return tiles.map(t => {
            let {dx, dy} = t;
            if (shouldRotate) {
                const r = rotateTile(dx, dy, dir);
                dx = r.dx; dy = r.dy;
            }
            return {x: cx + dx, y: cy + dy};
        });
    }

    // ─── 무기 타입별 기본 범위 ───
    const WTYPE_RANGE_DEFAULTS = {
        // weaponTypeId → { reach, area, rotate }
        // 비어 있으면 DatabaseEditor에서 설정; 런타임 fallback은 ADJ4
    };

    // ─── 3-tier 범위 해석 체인 ───
    function resolveReach(unit, skill) {
        // 1) 스킬 커스텀
        if (skill) {
            const sm = parseRangeMeta(skill.note || "");
            if (sm.reach) return { tiles: sm.reach, rotate: sm.rotate };
        }
        // 2) 무기 개별 note
        const weapon = unit.equips ? unit.equips[0] : null;
        if (weapon) {
            const wm = parseRangeMeta(weapon.note || "");
            if (wm.reach) return { tiles: wm.reach, rotate: wm.rotate };
        }
        // 3) 무기 타입 기본값
        if (weapon && weapon.wtypeId && WTYPE_RANGE_DEFAULTS[weapon.wtypeId]) {
            const def = WTYPE_RANGE_DEFAULTS[weapon.wtypeId];
            return { tiles: def.reach || ADJ4, rotate: def.rotate || false };
        }
        // 4) fallback: atkRange 기반 다이아몬드 or ADJ4 (최대 10칸)
        const r = Math.min(unit.atkRange || 1, 10);
        return { tiles: makeDiamond(r, false), rotate: false };
    }

    function resolveArea(unit, skill) {
        if (skill) {
            const sm = parseRangeMeta(skill.note || "");
            if (sm.area) return { tiles: sm.area, rotate: sm.rotate, selfTarget: sm.selfTarget };
        }
        const weapon = unit.equips ? unit.equips[0] : null;
        if (weapon) {
            const wm = parseRangeMeta(weapon.note || "");
            if (wm.area) return { tiles: wm.area, rotate: wm.rotate, selfTarget: wm.selfTarget };
        }
        // 기본: 타겟 셀만
        return { tiles: [{dx:0, dy:0}], rotate: false, selfTarget: false };
    }

    // ─── SrpgSkillMeta — 스킬 범위 메타데이터 통합 객체 ───
    const SrpgSkillMeta = window.SrpgSkillMeta = {
        parse(note) {
            if (!note) return this.defaultMeta();
            const reach = parseTileList(noteTagValue(note, "srpgReach"));
            const area  = parseTileList(noteTagValue(note, "srpgArea"));
            const rotate = noteTagBool(note, "srpgRotate");
            const selfTarget = noteTagBool(note, "srpgSelfTarget");

            if (reach) {
                return { type: "custom", reach, area: area || [{dx:0,dy:0}], rotate, selfTarget };
            }
            // legacy: srpgRange 태그 (반지름 기반)
            const rangeVal = noteTagValue(note, "srpgRange");
            if (rangeVal) {
                const r = Number(rangeVal);
                return { type: "radial", reach: makeDiamond(r, false), area: area || [{dx:0,dy:0}], rotate: false, selfTarget };
            }
            return this.defaultMeta();
        },

        defaultMeta() {
            return { type: "default", reach: null, area: [{dx:0,dy:0}], rotate: false, selfTarget: false };
        },

        defaultAttackMeta(unit) {
            const resolved = resolveReach(unit, null);
            return { type: "weaponDefault", reach: resolved.tiles, area: [{dx:0,dy:0}], rotate: resolved.rotate, selfTarget: false };
        },

        getRange(unit, skill) {
            if (!skill) return this.defaultAttackMeta(unit);
            const meta = this.parse(skill.note || "");
            if (meta.type === "default") {
                // 스킬에 커스텀 범위 없음 → 무기 체인 사용
                return this.defaultAttackMeta(unit);
            }
            return meta;
        },

        calcReachTiles(unit, skill, fromX, fromY) {
            if (fromX === undefined) fromX = unit.x;
            if (fromY === undefined) fromY = unit.y;
            const meta = this.getRange(unit, skill);
            const dir = unit.event ? unit.event.direction() : 8;
            return tilesToAbsolute(meta.reach, fromX, fromY, dir, meta.rotate);
        },

        calcEffectTiles(unit, skill, targetX, targetY) {
            const meta = this.getRange(unit, skill);
            if (meta.selfTarget) {
                return tilesToAbsolute(meta.area, unit.x, unit.y, 8, false);
            }
            const dir = this._dirToVec(unit.x, unit.y, targetX, targetY);
            return tilesToAbsolute(meta.area, targetX, targetY, dir, meta.rotate);
        },

        _dirToVec(ax, ay, tx, ty) {
            const ddx = tx - ax;
            const ddy = ty - ay;
            if (Math.abs(ddy) >= Math.abs(ddx)) {
                return ddy <= 0 ? 8 : 2;
            }
            return ddx >= 0 ? 6 : 4;
        }
    };

    // =========================================================================
    //  Color Palette
    // =========================================================================
    const C = {
        moveFill: 0x3388ff, moveAlpha: 0.25,
        atkFill: 0xff3333, atkAlpha: 0.25,
        pathFill: 0x66bbff, pathAlpha: 0.45,
        selectFill: 0xffff00, selectAlpha: 0.35,
        allyColor: 0x4488ff,
        enemyColor: 0xff4444,
        currentTurnGlow: 0xffdd00,
        nextTurnGlow: 0x88ccff,
        panelBg: 0x1a1a2e,
        panelBorder: 0x3a3a5e,
        hpColor: 0x44cc44,
        mpColor: 0x4488ff,
        hpDmgColor: 0xff6644,
        mpDmgColor: 0xff44aa,
        mainActColor: 0xffcc00,
        bonusActColor: 0x66ddff,
        usedActColor: 0x555555,
        menuBg: 0x222244,
        menuHighlight: 0x4466aa,
        white: 0xffffff,
        black: 0x000000,
        gray: 0x888888,
    };

    // =========================================================================
    //  Terrain Tag Constants (투사체/지형 차단 시스템)
    // =========================================================================
    const TERRAIN = {
        NONE:  0,  // 일반 타일
        // v2: 낭떠러지는 이제 Region ID 기반 (TerrainConfig.isCliffRegion)
        // cover/wall은 이제 Terrain Tag 기반 (TerrainConfig.terrainBlocksDirect/Arc)
    };

    // Fire modes
    const FIRE_MODE = {
        MELEE:  "melee",   // 근접 (경로 무시)
        DIRECT: "direct",  // 직사 (Region의 cover/wall 차단)
        ARC:    "arc",     // 곡사 (Wall만 차단)
    };

    // =========================================================================
    //  Team Color Palette (StarCraft-style)
    // =========================================================================
    const TEAM_COLORS = [
        null,
        { fill: 0x0042FF, hex: "#0042FF", name: "파랑" },    // Team 1 (Player)
        { fill: 0xFF0303, hex: "#FF0303", name: "빨강" },    // Team 2
        { fill: 0x1CE6B9, hex: "#1CE6B9", name: "청록" },    // Team 3
        { fill: 0x540081, hex: "#540081", name: "보라" },     // Team 4
        { fill: 0xFEBA0E, hex: "#FEBA0E", name: "주황" },    // Team 5
        { fill: 0x20C000, hex: "#20C000", name: "초록" },     // Team 6
        { fill: 0xE55BB0, hex: "#E55BB0", name: "분홍" },     // Team 7
        { fill: 0x959697, hex: "#959697", name: "회색" },     // Team 8
    ];
    function getTeamColor(teamId) {
        return TEAM_COLORS[teamId] || TEAM_COLORS[2]; // fallback to red
    }

    // =========================================================================
    //  Alliance Matrix — 팀 간 동맹/적대 관계 관리
    // =========================================================================
    const SrpgAlliance = window.SrpgAlliance = {
        _matrix: {},       // "A-B" → "ally" | "hostile"
        _playerTeams: new Set([1]),  // 플레이어가 직접 조작하는 팀 목록

        /** 초기화 — 맵 노트에서 파싱 */
        init() {
            this._matrix = {};
            this._playerTeams = new Set([1]);
        },

        /** 맵 노트태그 파싱 */
        parseMapNote(note) {
            this.init();
            if (!note) return;
            // <srpgPlayerTeam:1,3> — 플레이어 제어 팀
            const ptMatch = note.match(/<srpgPlayerTeam:([^>]+)>/i);
            if (ptMatch) {
                this._playerTeams = new Set(ptMatch[1].split(",").map(Number));
            }
            // <srpgAlliance:1-3> — 동맹 관계
            const allyRe = /<srpgAlliance:(\d+)-(\d+)>/gi;
            let m;
            while ((m = allyRe.exec(note)) !== null) {
                const a = Number(m[1]), b = Number(m[2]);
                this._setRelation(a, b, "ally");
            }
        },

        _key(a, b) { return Math.min(a, b) + "-" + Math.max(a, b); },

        _setRelation(a, b, rel) {
            if (a === b) return;
            this._matrix[this._key(a, b)] = rel;
        },

        /** 두 팀이 동맹인지 */
        areAllied(teamA, teamB) {
            if (teamA === teamB) return true;
            return this._matrix[this._key(teamA, teamB)] === "ally";
        },

        /** 두 팀이 적대인지 */
        areHostile(teamA, teamB) {
            if (teamA === teamB) return false;
            if (teamA === 0 || teamB === 0) return true; // 중립(0)은 모두 적대
            return this._matrix[this._key(teamA, teamB)] !== "ally";
        },

        /** 특정 팀이 플레이어 제어인지 */
        isPlayerTeam(teamId) {
            return this._playerTeams.has(teamId);
        },

        /** 런타임 동맹 변경 (이벤트 커맨드용) */
        setAlliance(teamA, teamB, allied) {
            this._setRelation(teamA, teamB, allied ? "ally" : "hostile");
        }
    };

    // =========================================================================
    //  BattleModeChecker — 전투 모드별 승패 판정
    // =========================================================================
    const BattleModeChecker = window.BattleModeChecker = {
        _modes: {},

        /** 모드 등록 */
        register(name, checker) {
            this._modes[name] = checker;
        },

        /** 승패 판정 — "victory" | "defeat" | null */
        check(modeName, sm) {
            const checker = this._modes[modeName] || this._modes["annihilation"];
            if (!checker) return null;
            return checker.check(sm);
        },

        /** 맵 노트에서 전투 모드 + 파라미터 파싱 */
        parseMapNote(note) {
            const params = {
                mode: "annihilation",
                koPolicy: "recover",
                ambush: "none",       // "none" | teamId(숫자)
                defenseTurns: 10,
                defenseTarget: 0,
                spawnWaves: [],
                escapeRegion: 250,
                escapeCount: 3,
                escapeTurnLimit: 0,
                capPoints: [],
                capCount: 1,
                capTurnsRequired: 2,
                commanders: {},       // {teamId: eventId}
                escorts: [],
                escortFollow: 0,
                escortGoal: null,
                escortAI: "stay",
                flagPos: null,
                flagBases: {},        // {teamId: {x,y}}
                victoryEvent: 0,
                defeatEvent: 0,
                deployEnabled: true,
                objective: ""
            };
            if (!note) return params;

            // 전투 모드
            const modeMatch = note.match(/<srpgBattleMode:(\w+)>/i);
            if (modeMatch) params.mode = modeMatch[1];

            // KO 정책
            const koMatch = note.match(/<srpgKoPolicy:(\w+)>/i);
            if (koMatch) params.koPolicy = koMatch[1];

            // 기습
            const ambushMatch = note.match(/<srpgAmbush:(\w+)>/i);
            if (ambushMatch) params.ambush = ambushMatch[1];

            // 대장전
            const cmdRe = /<srpgCommander:(\d+):(\d+)>/gi;
            let m;
            while ((m = cmdRe.exec(note)) !== null) {
                params.commanders[Number(m[1])] = Number(m[2]);
            }

            // 호위전
            const escortMatch = note.match(/<srpgEscort:([^>]+)>/i);
            if (escortMatch) params.escorts = escortMatch[1].split(",").map(Number);
            const escortFollowMatch = note.match(/<srpgEscortFollow:(\d+)>/i);
            if (escortFollowMatch) params.escortFollow = Number(escortFollowMatch[1]);
            const escortGoalMatch = note.match(/<srpgEscortGoal:(\d+),(\d+)>/i);
            if (escortGoalMatch) params.escortGoal = { x: Number(escortGoalMatch[1]), y: Number(escortGoalMatch[2]) };
            const escortAIMatch = note.match(/<srpgEscortAI:(\w+)>/i);
            if (escortAIMatch) params.escortAI = escortAIMatch[1];

            // 깃발전
            const flagMatch = note.match(/<srpgFlag:(\d+),(\d+)>/i);
            if (flagMatch) params.flagPos = { x: Number(flagMatch[1]), y: Number(flagMatch[2]) };
            const flagBaseRe = /<srpgFlagBase:(\d+):(\d+),(\d+)>/gi;
            while ((m = flagBaseRe.exec(note)) !== null) {
                params.flagBases[Number(m[1])] = { x: Number(m[2]), y: Number(m[3]) };
            }

            // 점령전
            const capRe = /<srpgCapPoint:(\d+),(\d+)>/gi;
            while ((m = capRe.exec(note)) !== null) {
                params.capPoints.push({ x: Number(m[1]), y: Number(m[2]), owner: 0, gauge: 0 });
            }
            const capCountMatch = note.match(/<srpgCapCount:(\d+)>/i);
            if (capCountMatch) params.capCount = Number(capCountMatch[1]);
            const capTurnsMatch = note.match(/<srpgCapTurns:(\d+)>/i);
            if (capTurnsMatch) params.capTurnsRequired = Number(capTurnsMatch[1]);

            // 방어전
            const defTurnsMatch = note.match(/<srpgDefenseTurns:(\d+)>/i);
            if (defTurnsMatch) params.defenseTurns = Number(defTurnsMatch[1]);
            const defTargetMatch = note.match(/<srpgDefenseTarget:(\d+)>/i);
            if (defTargetMatch) params.defenseTarget = Number(defTargetMatch[1]);
            const spawnRe = /<srpgSpawnWave:(\d+),(\d+),(\d+),(\d+)>/gi;
            while ((m = spawnRe.exec(note)) !== null) {
                params.spawnWaves.push({
                    turn: Number(m[1]), enemyId: Number(m[2]),
                    x: Number(m[3]), y: Number(m[4]), spawned: false
                });
            }

            // 도망전
            const escRegionMatch = note.match(/<srpgEscapeRegion:(\d+)>/i);
            if (escRegionMatch) params.escapeRegion = Number(escRegionMatch[1]);
            const escCountMatch = note.match(/<srpgEscapeCount:(\d+)>/i);
            if (escCountMatch) params.escapeCount = Number(escCountMatch[1]);
            const escLimitMatch = note.match(/<srpgEscapeTurnLimit:(\d+)>/i);
            if (escLimitMatch) params.escapeTurnLimit = Number(escLimitMatch[1]);

            // 이벤트
            const vicMatch = note.match(/<srpgVictoryEvent:(\d+)>/i);
            if (vicMatch) params.victoryEvent = Number(vicMatch[1]);
            const defMatch = note.match(/<srpgDefeatEvent:(\d+)>/i);
            if (defMatch) params.defeatEvent = Number(defMatch[1]);

            // 배치 페이즈 활성화 여부
            const deployMatch = note.match(/<srpgDeployEnabled:(true|false)>/i);
            if (deployMatch) params.deployEnabled = deployMatch[1].toLowerCase() === "true";

            // 전투 목표 텍스트
            const objMatch = note.match(/<srpgObjective:([^>]+)>/i);
            if (objMatch) params.objective = objMatch[1].trim();

            // 스폰존 기반 증원 (zone 모드): <srpgSpawnWave:턴,적ID,zone,팀ID>
            const spawnZoneRe = /<srpgSpawnWave:(\d+),(\d+),zone,(\d+)>/gi;
            let mz;
            while ((mz = spawnZoneRe.exec(note)) !== null) {
                params.spawnWaves.push({
                    turn: Number(mz[1]), enemyId: Number(mz[2]),
                    zone: true, zoneTeam: Number(mz[3]), spawned: false
                });
            }

            return params;
        },

        /**
         * 맵 데이터에서 200번대 리전을 스캔하여 전투 구역 좌표 추출
         * @param {Object} mapData - $dataMap 또는 동일 구조
         * @returns {Object} zones
         */
        scanZoneRegions(mapData) {
            const zones = {
                deployShared: [],       // 리전 200
                deployTeam: {},         // 리전 201-208 → { teamId: [{x,y}] }
                capPoints: [],          // 리전 210
                flagPos: [],            // 리전 211
                flagBases: [],          // 리전 212
                escapeZone: [],         // 리전 220
                escortGoal: [],         // 리전 230
                spawnZone: {},          // 리전 240-248 → { teamId: [{x,y}] }
            };
            if (!mapData || !mapData.data) return zones;
            const w = mapData.width, h = mapData.height;
            const size = w * h;
            for (let i = 0; i < size; i++) {
                // 리전은 mapData.data의 5번째 레이어 (index = 5*size + i)
                const rid = mapData.data[5 * size + i] >> 8; // 상위 바이트가 리전 ID
                if (rid < 200 || rid > 248) continue;
                const x = i % w, y = Math.floor(i / w);
                if (rid === 200) { zones.deployShared.push({x, y}); }
                else if (rid >= 201 && rid <= 208) {
                    const t = rid - 200;
                    (zones.deployTeam[t] = zones.deployTeam[t] || []).push({x, y});
                }
                else if (rid === 210) { zones.capPoints.push({x, y, owner: 0, gauge: 0}); }
                else if (rid === 211) { zones.flagPos.push({x, y}); }
                else if (rid === 212) { zones.flagBases.push({x, y}); }
                else if (rid === 220) { zones.escapeZone.push({x, y}); }
                else if (rid === 230) { zones.escortGoal.push({x, y}); }
                else if (rid >= 240 && rid <= 248) {
                    const t = rid - 240;
                    (zones.spawnZone[t] = zones.spawnZone[t] || []).push({x, y});
                }
            }
            return zones;
        },

        /**
         * parseMapNote 결과에 리전 스캔 결과를 병합 (리전 우선, 노트태그 폴백)
         * @param {Object} params - parseMapNote 결과
         * @param {Object} zones - scanZoneRegions 결과
         */
        mergeZones(params, zones) {
            params._zones = zones;
            // 점령 거점: 리전 있으면 우선
            if (zones.capPoints.length > 0) params.capPoints = zones.capPoints;
            // 깃발: 리전 211이 있으면 첫 번째를 flagPos로
            if (zones.flagPos.length > 0) params.flagPos = zones.flagPos[0];
            // 깃발 베이스: 리전 212 타일들 → 팀 1 베이스로 기본 매핑
            if (zones.flagBases.length > 0 && Object.keys(params.flagBases).length === 0) {
                params.flagBases[1] = zones.flagBases[0];
            }
            // 탈출 구역: 리전 220이 있으면 escapeRegion을 220으로 설정
            if (zones.escapeZone.length > 0) {
                params.escapeRegion = 220;
                params._escapeZoneTiles = zones.escapeZone;
            }
            // 호위 목적지: 리전 230이 있으면 첫 번째를 escortGoal로
            if (zones.escortGoal.length > 0 && !params.escortGoal) {
                params.escortGoal = zones.escortGoal[0];
            }
        }
    };

    // ─── 개별 전투 모드 체커 등록 ───

    /** 섬멸전: 적 전멸 = 승리, 아군 전멸 = 패배 */
    BattleModeChecker.register("annihilation", {
        check(sm) {
            if (sm.allyUnits().length === 0) return "defeat";
            if (sm.enemyUnits().length === 0) return "victory";
            return null;
        }
    });

    /** 대장전: 적 대장 처치 = 승리, 아군 대장 처치 = 패배 */
    BattleModeChecker.register("commander", {
        check(sm) {
            const params = sm._battleModeParams;
            if (!params || !params.commanders) return null;
            // 아군 대장 체크
            for (const [tid, evId] of Object.entries(params.commanders)) {
                if (SrpgAlliance.isPlayerTeam(Number(tid))) {
                    const cmd = sm._units.find(u => u.event && u.event.eventId() === evId);
                    if (!cmd || !cmd.isAlive()) return "defeat";
                }
            }
            // 적 대장 체크
            for (const [tid, evId] of Object.entries(params.commanders)) {
                if (!SrpgAlliance.isPlayerTeam(Number(tid))) {
                    const cmd = sm._units.find(u => u.event && u.event.eventId() === evId);
                    if (!cmd || !cmd.isAlive()) return "victory";
                }
            }
            return null;
        }
    });

    /** 호위전: 호위 대상 사망 = 패배, 적 전멸 or 호위 대상 도착 = 승리 */
    BattleModeChecker.register("escort", {
        check(sm) {
            const params = sm._battleModeParams;
            if (!params || !params.escorts || params.escorts.length === 0) return null;
            // 호위 대상 생존 체크
            for (const evId of params.escorts) {
                const esc = sm._units.find(u => u.event && u.event.eventId() === evId);
                if (!esc || !esc.isAlive()) return "defeat";
            }
            // 도착 체크 (목표 지점이 있으면)
            if (params.escortGoal) {
                const allArrived = params.escorts.every(evId => {
                    const esc = sm._units.find(u => u.event && u.event.eventId() === evId);
                    return esc && esc.event.x === params.escortGoal.x && esc.event.y === params.escortGoal.y;
                });
                if (allArrived) return "victory";
            }
            // 적 전멸도 승리
            if (sm.enemyUnits().length === 0) return "victory";
            return null;
        }
    });

    /** 깃발전: 아군이 깃발을 진지로 운반 = 승리, 적이 먼저 = 패배 */
    BattleModeChecker.register("capture", {
        check(sm) {
            const params = sm._battleModeParams;
            if (!params) return null;
            // 깃발 소지 유닛 확인
            const carrier = sm._units.find(u => u.isAlive() && u._carryingFlag);
            if (!carrier) return null;
            const base = params.flagBases[carrier.teamId];
            if (!base) return null;
            if (carrier.event.x === base.x && carrier.event.y === base.y) {
                return SrpgAlliance.isPlayerTeam(carrier.teamId) ? "victory" : "defeat";
            }
            return null;
        }
    });

    /** 점령전: 지정 거점 N개 점령 = 승리 */
    BattleModeChecker.register("domination", {
        check(sm) {
            const params = sm._battleModeParams;
            if (!params || !params.capPoints || params.capPoints.length === 0) return null;
            // 각 팀별 점령 수 카운트
            const teamCaps = {};
            for (const cp of params.capPoints) {
                if (cp.owner > 0) {
                    teamCaps[cp.owner] = (teamCaps[cp.owner] || 0) + 1;
                }
            }
            for (const [tid, count] of Object.entries(teamCaps)) {
                if (count >= params.capCount) {
                    return SrpgAlliance.isPlayerTeam(Number(tid)) ? "victory" : "defeat";
                }
            }
            // 아군 전멸 = 패배
            if (sm.allyUnits().length === 0) return "defeat";
            return null;
        }
    });

    /** 방어전: N턴 생존 = 승리, 아군 전멸 or 방어 대상 파괴 = 패배 */
    BattleModeChecker.register("defense", {
        check(sm) {
            const params = sm._battleModeParams;
            if (!params) return null;
            if (sm.allyUnits().length === 0) return "defeat";
            // 방어 대상 체크
            if (params.defenseTarget) {
                const target = sm._units.find(u => u.event && u.event.eventId() === params.defenseTarget);
                if (!target || !target.isAlive()) return "defeat";
            }
            // 목표 턴 도달
            if (sm._turnNumber >= params.defenseTurns) return "victory";
            return null;
        }
    });

    /** 도망전: 아군 M명 탈출 = 승리, 아군 전멸 or 턴 초과 = 패배 */
    BattleModeChecker.register("escape", {
        check(sm) {
            const params = sm._battleModeParams;
            if (!params) return null;
            if (sm.allyUnits().length === 0) return "defeat";
            // 탈출 인원 체크
            sm._escapedCount = sm._escapedCount || 0;
            if (sm._escapedCount >= params.escapeCount) return "victory";
            // 턴 제한 체크
            if (params.escapeTurnLimit > 0 && sm._turnNumber >= params.escapeTurnLimit) return "defeat";
            return null;
        }
    });

    // =========================================================================
    //  플러그인 파라미터 기반 유닛 설정 로더
    // =========================================================================
    const _srpgCoreParams = (function() {
        const pluginName = 'SRPG_Core';
        const raw = (typeof $plugins !== 'undefined')
            ? $plugins.find(p => p.name === pluginName && p.status)
            : null;
        if (!raw || !raw.parameters) return { actor: {}, enemy: {} };
        const params = raw.parameters;
        try {
            return {
                actor: JSON.parse(params.ActorConfig || '{}'),
                enemy: JSON.parse(params.EnemyConfig || '{}')
            };
        } catch(e) {
            console.warn('[SRPG] ActorConfig/EnemyConfig parse error:', e);
            return { actor: {}, enemy: {} };
        }
    })();

    // 유닛 설정 읽기: 이벤트 노트태그 → 플러그인 파라미터 → 기본값
    function _getUnitCfg(team, id) {
        if (team === 'actor') return _srpgCoreParams.actor[String(id)] || {};
        if (team === 'enemy') return _srpgCoreParams.enemy[String(id)] || {};
        return {};
    }

    // =========================================================================
    //  SrpgUnit — 유닛 래퍼 클래스
    // =========================================================================
    class SrpgUnit {
        constructor(event, meta) {
            this.event = event;
            this.team = meta.srpgUnit; // "actor" | "enemy"
            this.actorId = Number(meta.srpgActorId || 0);
            this.enemyId = Number(meta.srpgEnemyId || 0);
            this.level = Number(meta.srpgLevel || 1);
            this.mov = Number(meta.srpgMov || DEFAULT_MOV);
            this.atkRange = Number(meta.srpgAtkRange || DEFAULT_ATK_RANGE);
            this.teamId = Number(meta.srpgTeam || (this.team === "actor" ? 1 : 2));

            // 사격 모드: melee(근접) / direct(직사) / arc(곡사)
            if (meta.srpgFireMode) {
                this.fireMode = meta.srpgFireMode.toLowerCase();
            } else {
                // 기본: 사거리 1이면 근접, 2+이면 직사
                this.fireMode = (this.atkRange <= 1) ? FIRE_MODE.MELEE : FIRE_MODE.DIRECT;
            }

            // 데이터 소스 (안전 접근 — 0번 인덱스는 null)
            this._data = null;
            try {
                if (this.team === "actor" && this.actorId > 0) {
                    this._data = $dataActors[this.actorId] || null;
                } else if (this.team === "enemy" && this.enemyId > 0) {
                    this._data = $dataEnemies[this.enemyId] || null;
                }
            } catch (e) {
                console.warn("[SRPG] Data lookup failed:", e.message);
            }

            // 플러그인 파라미터에서 유닛 설정 읽기
            const _unitCfg = _getUnitCfg(this.team, this.actorId || this.enemyId);

            // 우선순위: 이벤트 노트 → 플러그인 파라미터 → 기본값
            if (_unitCfg.atkRange != null && !meta.srpgAtkRange) {
                this.atkRange = Number(_unitCfg.atkRange);
            }
            if (_unitCfg.fireMode && !meta.srpgFireMode) {
                this.fireMode = _unitCfg.fireMode.toLowerCase();
            } else if (!meta.srpgFireMode && !_unitCfg.fireMode) {
                this.fireMode = (this.atkRange <= 1) ? FIRE_MODE.MELEE : FIRE_MODE.DIRECT;
            }
            if (_unitCfg.mov != null && !meta.srpgMov) {
                this.mov = Number(_unitCfg.mov);
            }

            // 노트태그 폴백 (비상 오버라이드)
            if (this._data && this._data.note) {
                const dataMeta = {};
                const noteLines = this._data.note.split(/[\r\n]+/);
                for (const line of noteLines) {
                    const m = line.match(/<(\w+):(.+?)>/);
                    if (m) dataMeta[m[1]] = m[2].trim();
                }
                if (dataMeta.srpgAtkRange) this.atkRange = Number(dataMeta.srpgAtkRange);
                if (dataMeta.srpgFireMode) this.fireMode = dataMeta.srpgFireMode.toLowerCase();
                if (dataMeta.srpgMov) this.mov = Number(dataMeta.srpgMov);
            }

            // 기본 스탯 (RMMZ 데이터베이스 기반)
            if (this.team === "actor" && this._data) {
                // 액터의 params는 $dataClasses[classId].params에 있음
                const classId = this._data.classId || 1;
                const cls = $dataClasses[classId];
                if (cls && cls.params && Array.isArray(cls.params[0])) {
                    const p = cls.params;
                    const lv = Math.min(this.level, p[0].length - 1);
                    this.mhp = p[0][lv]; this.mmp = p[1][lv];
                    this.atk = p[2][lv]; this.def = p[3][lv];
                    this.mat = p[4][lv]; this.mdf = p[5][lv];
                    this.agi = p[6][lv]; this.luk = p[7][lv];
                } else {
                    this.mhp = 100; this.mmp = 20;
                    this.atk = 15; this.def = 10;
                    this.mat = 10; this.mdf = 10;
                    this.agi = 10; this.luk = 5;
                }
            } else if (this._data && this._data.params) {
                // 적은 params가 평탄 배열 [mhp,mmp,atk,def,mat,mdf,agi,luk]
                const ep = this._data.params;
                this.mhp = ep[0]; this.mmp = ep[1];
                this.atk = ep[2]; this.def = ep[3];
                this.mat = ep[4]; this.mdf = ep[5];
                this.agi = ep[6]; this.luk = ep[7];
            } else {
                this.mhp = 100; this.mmp = 20;
                this.atk = 15; this.def = 10;
                this.mat = 10; this.mdf = 10;
                this.agi = 10; this.luk = 5;
            }

            // ─── 파괴 가능 사물 처리 ───
            this.isObject = (meta.srpgObject === "true");
            if (this.isObject) {
                this.mhp = Number(meta.srpgObjectHp || 100);
                this.def = Number(meta.srpgObjectDef || 0);
                this.mov = 0;
                this.agi = 0;       // 턴 없음
                this.atk = 0;       // 공격 불가
                this.atkRange = 0;
                this.luk = 0;
                this.name = meta.srpgObjectName || event._name || "사물";
                this._destroyPage = Number(meta.srpgDestroyPage || 0);
            }

            // ─── 멀티타일 그리드 시스템 ───
            this.gridW = 1;
            this.gridH = 1;
            this.anchor = { x: 0, y: 0 };
            this.unitType = this.isObject ? 'object' : this.team; // 'actor'|'enemy'|'object'
            this.objectFlags = new Set();
            this.spriteFile = null;
            this.spriteFolder = null;

            // 플러그인 파라미터에서 멀티타일/스프라이트 설정 읽기
            if (_unitCfg.gridW) this.gridW = Math.max(1, Number(_unitCfg.gridW));
            if (_unitCfg.gridH) this.gridH = Math.max(1, Number(_unitCfg.gridH));
            if (_unitCfg.anchor) {
                const _anc = String(_unitCfg.anchor).split(',');
                this.anchor = { x: Number(_anc[0]) || 0, y: Number(_anc[1]) || 0 };
            }
            if (_unitCfg.unitType) this.unitType = _unitCfg.unitType;
            if (_unitCfg.objectFlags) {
                String(_unitCfg.objectFlags).split(',').forEach(f => {
                    const ft = f.trim();
                    if (ft) this.objectFlags.add(ft);
                });
            }
            if (_unitCfg.spriteFile) this.spriteFile = _unitCfg.spriteFile;
            if (_unitCfg.spriteFolder) this.spriteFolder = _unitCfg.spriteFolder;

            // DB 노트태그 폴백 (멀티타일)
            if (this._data && this._data.note) {
                const _mt = {};
                const _mtLines = this._data.note.split(/[\r\n]+/);
                for (const _ln of _mtLines) {
                    const _mm = _ln.match(/<(\w+):(.+?)>/);
                    if (_mm) _mt[_mm[1]] = _mm[2].trim();
                }
                if (_mt.srpgGridW) this.gridW = Math.max(1, Number(_mt.srpgGridW));
                if (_mt.srpgGridH) this.gridH = Math.max(1, Number(_mt.srpgGridH));
                if (_mt.srpgAnchor) {
                    const _anc = _mt.srpgAnchor.split(',');
                    this.anchor = { x: Number(_anc[0]) || 0, y: Number(_anc[1]) || 0 };
                }
                if (_mt.srpgUnitType) this.unitType = _mt.srpgUnitType;
                if (_mt.srpgObjectFlags) {
                    _mt.srpgObjectFlags.split(',').forEach(f => {
                        const ft = f.trim();
                        if (ft) this.objectFlags.add(ft);
                    });
                }
                if (_mt.srpgSpriteFile) this.spriteFile = _mt.srpgSpriteFile;
                if (_mt.srpgSpriteFolder) this.spriteFolder = _mt.srpgSpriteFolder;
            }
            // 이벤트 노트태그에서도 오버라이드 가능
            if (meta.srpgGridW) this.gridW = Math.max(1, Number(meta.srpgGridW));
            if (meta.srpgGridH) this.gridH = Math.max(1, Number(meta.srpgGridH));
            if (meta.srpgAnchor) {
                const _anc2 = meta.srpgAnchor.split(',');
                this.anchor = { x: Number(_anc2[0]) || 0, y: Number(_anc2[1]) || 0 };
            }
            if (meta.srpgUnitType) this.unitType = meta.srpgUnitType;
            if (meta.srpgObjectFlags) {
                meta.srpgObjectFlags.split(',').forEach(f => {
                    const ft = f.trim();
                    if (ft) this.objectFlags.add(ft);
                });
            }
            if (meta.srpgSpriteFile) this.spriteFile = meta.srpgSpriteFile;
            if (meta.srpgSpriteFolder) this.spriteFolder = meta.srpgSpriteFolder;

            this.hp = this.mhp;
            this.mp = this.mmp;
            this._alive = true;

            // AP 턴 시스템
            this.ap = 0;

            // 상태 이상 시스템
            this._states = [];      // [{id, turnsLeft}]
            this._buffs = [0,0,0,0,0,0,0,0]; // 8개 능력치 버프 단계 (-2~+2)
            this._buffTurns = [0,0,0,0,0,0,0,0];

            // BG3 행동 경제
            this.mainAction = 1;   // 주 행동 횟수
            this.bonusAction = 1;  // 보조 행동 횟수
            this.hasMoved = false;

            // 기회 공격 / 협동 공격 리소스
            this.reaction = 1;
            this.maxReaction = Number(meta.srpgMaxReaction || _unitCfg.maxReaction || (this._data && this._data.note && this._data.note.match(/<srpgMaxReaction:(\d+)>/i)?.[1]) || 1);

            // ZoC 무시 여부 (이탈기, 은신 등에 의해 일시적으로 true)
            this.ignoreZoC = false;

            // 은신/스프린트 상태 초기화
            this._hidden = false;
            this._hideAgi = 0;
            this._hideSkill = false;
            this._sprintUsed = false;
            this._sprintActive = false;

            // 턴당 이동 예산 시스템
            this.turnMoveMax = this.mov;   // 턴당 최대 이동거리
            this.turnMoveUsed = 0;         // 이번 턴 소비한 이동거리
            this._segStartX = event._x;   // 현재 이동 구간 시작점
            this._segStartY = event._y;

            // 원래 위치 (이동 취소용)
            this._origX = event._x;
            this._origY = event._y;

            // 표시 이름
            this.name = this._data ? this._data.name : event._name || "???";

            // 초상화 정보 (턴 오더 바용)
            if (this.team === "actor" && this._data) {
                this._portraitType = "face";
                this._faceName = this._data.faceName || "";
                this._faceIndex = this._data.faceIndex || 0;
            } else if (this.team === "enemy" && this._data) {
                this._portraitType = "battler";
                this._battlerName = this._data.battlerName || "";
            } else {
                this._portraitType = "none";
            }

            // 스탠딩 초상화 시스템
            this._portraitState = "idle"; // idle, attack, damage
            this._srpgPortraits = null;
            this._portraitSource = "picture"; // picture, enemy, sv_actor
            if (PORTRAIT_MODE) {
                this._srpgPortraits = {
                    idle: meta.srpgPortrait || "",
                    attack: meta.srpgPortraitAtk || "",
                    damage: meta.srpgPortraitDmg || "",
                };
                // 노트 태그 미지정 시 DB에서 자동 감지
                if (!this._srpgPortraits.idle && this._data) {
                    if (this.team === "enemy") {
                        this._srpgPortraits.idle = this._data.battlerName || "";
                        this._portraitSource = "enemy";
                    } else if (this.team === "actor") {
                        this._srpgPortraits.idle = this._data.battlerName || "";
                        this._portraitSource = "sv_actor";
                    }
                }
            }

            // 이동 경로 애니메이션
            this._movePath = [];
            this._moveIdx = 0;
            this._moveTimer = 0;
        }

        get x() { return this.event._x; }
        get y() { return this.event._y; }

        // ─── 멀티타일 점유 메서드 ───
        /** 점유 영역 좌상단 X */
        get originX() { return this.x - this.anchor.x; }
        /** 점유 영역 좌상단 Y */
        get originY() { return this.y - this.anchor.y; }

        /** 점유 중인 모든 타일 좌표 */
        get occupiedTiles() {
            const tiles = [];
            const ox = this.originX;
            const oy = this.originY;
            for (let i = 0; i < this.gridW; i++) {
                for (let j = 0; j < this.gridH; j++) {
                    tiles.push({ x: ox + i, y: oy + j });
                }
            }
            return tiles;
        }

        /** 이 유닛이 (tx, ty) 타일을 점유하는가? */
        occupies(tx, ty) {
            const ox = this.originX;
            const oy = this.originY;
            return tx >= ox && tx < ox + this.gridW &&
                   ty >= oy && ty < oy + this.gridH;
        }

        /** (ax, ay)를 앵커로 배치할 때 모든 타일이 유효한가? */
        canPlaceAt(ax, ay, gridSystem) {
            const ox = ax - this.anchor.x;
            const oy = ay - this.anchor.y;
            for (let i = 0; i < this.gridW; i++) {
                for (let j = 0; j < this.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    if (gridSystem && !gridSystem.inBounds(tx, ty)) return false;
                    if (gridSystem && !gridSystem.isPassable(tx, ty)) return false;
                    if (gridSystem && gridSystem.isOccupied(tx, ty, this)) return false;
                }
            }
            return true;
        }

        /** 1x1 유닛인가? */
        isSingleTile() { return this.gridW === 1 && this.gridH === 1; }

        isAlive() { return this._alive; }
        isActor() { return this.team === "actor"; }
        isEnemy() { return this.team === "enemy"; }
        isPlayerControlled() { return SrpgAlliance.isPlayerTeam(this.teamId); }
        isHostileTo(other) {
            if (!other) return false;
            return SrpgAlliance.areHostile(this.teamId, other.teamId);
        }
        teamColor() { return getTeamColor(this.teamId); }

        // 초상화 상태 관리
        hasPortrait() { return PORTRAIT_MODE && this._srpgPortraits && !!this._srpgPortraits.idle; }
        currentPortraitName() {
            if (!this._srpgPortraits) return "";
            const st = this._portraitState || "idle";
            return this._srpgPortraits[st] || this._srpgPortraits.idle || "";
        }
        setPortraitState(st) { this._portraitState = st; }
        loadPortraitBitmap(name) {
            if (!name) return null;
            switch (this._portraitSource) {
                case "enemy": return ImageManager.loadEnemy(name);
                case "sv_actor": return ImageManager.loadSvActor(name);
                default: return ImageManager.loadPicture(name);
            }
        }

        // ZoC 생성 여부: 근접 유닛만 (살아있고, 사물 아님)
        hasZoC() {
            return this._alive && !this.isObject && this.atkRange <= 1 &&
                   this.fireMode === "melee";
        }

        // 기회 공격 가능 여부
        canOpportunityAttack() {
            return this._alive && !this.isObject && this.reaction > 0 &&
                   this.atkRange <= 1;
        }

        canAct() { return this._alive && (this.mainAction > 0 || this.bonusAction > 0); }
        canMainAct() { return this._alive && this.mainAction > 0; }
        canBonusAct() { return this._alive && this.bonusAction > 0; }

        resetActions() {
            this.mainAction = 1;
            this.bonusAction = 1;
            this.hasMoved = false;
            this.reaction = this.maxReaction;
            this.ignoreZoC = false;
            this._sprintUsed = false;
            this._sprintActive = false;
            this._origX = this.event._x;
            this._origY = this.event._y;
            // 이동 예산 초기화
            this.turnMoveUsed = 0;
            // 흑백 색조 원상복귀 (행동력 복구됨)
            this.refreshTint();
            this._segStartX = this.event._x;
            this._segStartY = this.event._y;
            // 상태/버프 턴 갱신
            if (this._states) this.updateStates();
            if (this._buffs) this.updateBuffs();

            // ─── HRG/MRG 턴 재생 ───
            const hrgRate = this.hrg;
            if (hrgRate > 0 && this.hp < this.mhp) {
                const hpRegen = Math.floor(this.mhp * hrgRate);
                if (hpRegen > 0) {
                    this.heal(hpRegen);
                    console.log(`[SRPG] ${this.name}: HP 재생 +${hpRegen} (HRG ${(hrgRate * 100).toFixed(0)}%)`);
                }
            }
            const mrgRate = this.mrg;
            if (mrgRate > 0 && this.mp < this.mmp) {
                const mpRegen = Math.floor(this.mmp * mrgRate);
                if (mpRegen > 0) {
                    this.healMp(mpRegen);
                    console.log(`[SRPG] ${this.name}: MP 재생 +${mpRegen} (MRG ${(mrgRate * 100).toFixed(0)}%)`);
                }
            }
        }

        useMainAction() { this.mainAction = Math.max(0, this.mainAction - 1); }
        useBonusAction() { this.bonusAction = Math.max(0, this.bonusAction - 1); }

        // 현재 구간의 이동거리를 소비하고 새 구간 시작
        consumeSegmentMove() {
            const dist = Math.abs(this.x - this._segStartX) + Math.abs(this.y - this._segStartY);
            this.turnMoveUsed += dist;
            this._segStartX = this.x;
            this._segStartY = this.y;
            return dist;
        }

        remainingMov() {
            return Math.max(0, this.turnMoveMax - this.turnMoveUsed);
        }

        refreshTint() {
            if (!this._alive) {
                this.event.setOpacity(0);
                return;
            }
            // 은신 유닛: 항시 반투명 (행동 상태 무관)
            const isHidden = !!this._hidden;
            const hiddenOpacity = isHidden ? 128 : 255;

            // 행동 완료 시 흑백(grayscale) 색조 변경 (반투명 대신)
            if (this.mainAction <= 0 && this.bonusAction <= 0) {
                // 흑백 효과: R,G,B를 동일 값 -80, gray=180 → 채도 제거
                this.event.setTint && this.event.setTint(-80, -80, -80, 180);
                this.event.setOpacity(isHidden ? 100 : 200);
            } else {
                this.event.setTint && this.event.setTint(0, 0, 0, 0);
                this.event.setOpacity(hiddenOpacity);
            }
        }

        // 이동 경로 시작
        startMovePath(path) {
            this._movePath = path;
            this._moveIdx = 0;
            this._moveStepActive = false;
            // 이동 속도 설정 (RMMZ 기본 4, SRPG용으로 약간 빠르게)
            this.event.setMoveSpeed(getSrpgMoveSpeed());
            // 이동 중 제자리걸음 방지 — through ON (충돌 무시)
            this.event.setThrough(true);
        }

        // 이동 업데이트 — RMMZ 네이티브 moveStraight 사용
        updateMove() {
            if (this._moveIdx >= this._movePath.length) {
                // 이동 완료 — through 복원, 이동속도 복원
                this.event.setThrough(false);
                this.event.setMoveSpeed(getSrpgMoveSpeed());
                return false;
            }

            // 현재 스텝이 아직 움직이는 중이면 대기
            if (this.event.isMoving()) return true;

            // 다음 타일로 이동 시작
            const pt = this._movePath[this._moveIdx];
            const dx = pt.x - this.event._x;
            const dy = pt.y - this.event._y;
            let dir = 0;
            if (dx > 0) dir = 6;
            else if (dx < 0) dir = 4;
            else if (dy > 0) dir = 2;
            else if (dy < 0) dir = 8;

            if (dir > 0) {
                this.event.moveStraight(dir);
            } else {
                // 같은 위치면 스킵
                this.event.locate(pt.x, pt.y);
            }
            this._moveIdx++;
            return true; // still moving
        }

        isMoving() {
            return this._moveIdx < this._movePath.length || this.event.isMoving();
        }

        takeDamage(dmg) {
            this.hp = Math.max(0, this.hp - dmg);
            try {
                // Hit SE
                if (AudioManager && AudioManager.playSe) {
                    AudioManager.playSe({name: "Damage4", volume: 80, pitch: 100 + Math.floor(Math.random()*20), pan: 0});
                }
            } catch (e) {
                console.warn("[SRPG] takeDamage SE error:", e.message);
            }
            if (this.hp <= 0) {
                this._alive = false;
                // KO 추적 — endBattle에서 정책별 처리
                if (typeof SM !== 'undefined' && SM.trackKO) SM.trackKO(this);
                try {
                    if (AudioManager && AudioManager.playSe) {
                        const se = this.isObject
                            ? {name: "Crash", volume: 90, pitch: 80, pan: 0}
                            : {name: "Collapse1", volume: 90, pitch: 100, pan: 0};
                        AudioManager.playSe(se);
                    }
                } catch (e) {
                    console.warn("[SRPG] death SE error:", e.message);
                }
                // 파괴 가능 사물: 이벤트 페이지 트리거
                if (this.isObject && this._destroyPage > 0) {
                    try {
                        const ev = this.event;
                        // 셀프 스위치 A를 ON으로 설정하여 페이지 전환 트리거
                        const key = [$gameMap.mapId(), ev.eventId(), "A"];
                        $gameSelfSwitches.setValue(key, true);
                        ev.refresh();
                    } catch (e) {
                        console.warn("[SRPG] destroyPage trigger error:", e.message);
                    }
                } else {
                    this.event.setOpacity(0);
                    this.event.setThrough(true);
                }
            }
        }

        // ─── 언데드 판별 ───
        // 액터/적 노트태그 <srpgUndead> 로 판별
        isUndead() {
            if (this._data && this._data.note && this._data.note.includes('<srpgUndead>')) return true;
            return false;
        }

        // ─── 치유 (언데드/부패 반전 포함) ───
        heal(amount) {
            let finalAmount = amount;

            // 부패(State 45): 양의 치유를 동일 수치 피해로 전환
            if (this.hasState(45) && amount > 0) {
                finalAmount = -Math.abs(amount);
                console.log(`[SRPG] ${this.name}: 부패! 치유 ${amount} → 피해 ${-finalAmount}`);
            }

            // 언데드: 치유↔피해 반전 (부패와 별개 — 이중 반전 가능)
            if (this.isUndead()) {
                finalAmount = -finalAmount;
                console.log(`[SRPG] ${this.name}: 언데드! 치유 반전 → ${finalAmount}`);
            }

            // 적용
            if (finalAmount >= 0) {
                this.hp = Math.min(this.mhp, this.hp + finalAmount);
            } else {
                this.hp = Math.max(0, this.hp + finalAmount);
                // 사망 체크
                if (this.hp <= 0) this._alive = false;
            }
        }

        // ─── 독 피해 처리 (언데드: 독=치유, 부패+언데드: 독=피해) ───
        applyPoisonDamage(amount) {
            if (this.isUndead()) {
                if (this.hasState(45)) {
                    // 부패 + 언데드 = 이중 반전 → 독도 피해
                    this.hp = Math.max(0, this.hp - Math.abs(amount));
                    console.log(`[SRPG] ${this.name}: 부패+언데드 이중반전! 독 ${amount} → 피해`);
                    if (this.hp <= 0) this._alive = false;
                } else {
                    // 언데드: 독=치유
                    this.hp = Math.min(this.mhp, this.hp + Math.abs(amount));
                    console.log(`[SRPG] ${this.name}: 언데드! 독 ${amount} → 치유`);
                }
            } else {
                // 일반: 독=피해
                this.hp = Math.max(0, this.hp - Math.abs(amount));
                if (this.hp <= 0) this._alive = false;
            }
        }

        // ─── 상태 이상 관리 ───
        // 내부 코어: 내성 체크 없이 상태 직접 부여 (티어 승급 등에서 사용)
        _addStateCore(stateId, turns) {
            if (!stateId) return;
            const existing = this._states.find(s => s.id === stateId);
            if (existing) {
                if (turns > existing.turnsLeft) existing.turnsLeft = turns;
                return;
            }
            this._states.push({ id: stateId, turnsLeft: turns || 3 });
            console.log(`[SRPG] ${this.name}: 상태 ${stateId} 부여 (${turns}턴)`);
        }

        addState(stateId, turns) {
            if (!stateId) return;
            // 상태 유효도 체크
            const rate = this.stateRate(stateId);
            if (Math.random() >= rate) return; // 내성으로 무효화

            const meta = parseStateMeta(stateId);

            // ★ 티어 승급 체크: 이미 같은 T1을 보유 → T2로 승급
            if (meta.tier === 1 && meta.tierPair) {
                if (this.hasState(stateId)) {
                    this.removeState(stateId);
                    this._addStateCore(meta.tierPair, turns);
                    console.log(`[SRPG] ${this.name}: 티어 승급 ${stateId}→${meta.tierPair}`);
                    return;
                }
            }

            // ★ 젖음(33) + 얼음(3)/천둥(4) T1 → 즉시 T2 (T1 스킵)
            if (meta.tier === 1 && meta.tierPair && meta.tierElement) {
                if (this.hasState(33) && (meta.tierElement === 3 || meta.tierElement === 4)) {
                    this.removeState(33); // 젖음 해제
                    this._addStateCore(meta.tierPair, turns);
                    console.log(`[SRPG] ${this.name}: 젖음→즉시 T2 ${meta.tierPair}`);
                    return;
                }
            }

            // 일반 부여
            this._addStateCore(stateId, turns);
        }

        removeState(stateId) {
            this._states = this._states.filter(s => s.id !== stateId);
        }

        hasState(stateId) {
            return this._states.some(s => s.id === stateId);
        }

        // 현재 보유 상태 ID 배열 반환
        currentStateIds() {
            return this._states.map(s => s.id);
        }

        // 턴 종료 시 상태 갱신
        updateStates() {
            for (let i = this._states.length - 1; i >= 0; i--) {
                this._states[i].turnsLeft--;
                if (this._states[i].turnsLeft <= 0) {
                    console.log(`[SRPG] ${this.name}: 상태 ${this._states[i].id} 해제`);
                    this._states.splice(i, 1);
                }
            }
        }

        // ─── 버프 관리 ───
        // paramId: 0=MHP, 1=MMP, 2=ATK, 3=DEF, 4=MAT, 5=MDF, 6=AGI, 7=LUK
        addBuff(paramId, turns) {
            if (paramId < 0 || paramId > 7) return;
            this._buffs[paramId] = Math.min(2, this._buffs[paramId] + 1);
            this._buffTurns[paramId] = Math.max(this._buffTurns[paramId], turns || 3);
        }

        addDebuff(paramId, turns) {
            if (paramId < 0 || paramId > 7) return;
            this._buffs[paramId] = Math.max(-2, this._buffs[paramId] - 1);
            this._buffTurns[paramId] = Math.max(this._buffTurns[paramId], turns || 3);
        }

        removeBuff(paramId) {
            if (paramId < 0 || paramId > 7) return;
            this._buffs[paramId] = 0;
            this._buffTurns[paramId] = 0;
        }

        // 버프 반영된 스탯 (전투 계산에서 사용)
        buffRate(paramId) {
            const stage = this._buffs[paramId] || 0;
            return 1.0 + stage * 0.25; // 단계당 ±25%
        }

        // 턴 종료 시 버프 갱신
        updateBuffs() {
            for (let i = 0; i < 8; i++) {
                if (this._buffs[i] !== 0) {
                    this._buffTurns[i]--;
                    if (this._buffTurns[i] <= 0) {
                        this._buffs[i] = 0;
                        this._buffTurns[i] = 0;
                    }
                }
            }
        }

        // 버프 반영된 능력치 접근자
        get buffedAtk() { return Math.floor(this.atk * this.buffRate(2)); }
        get buffedDef() { return Math.floor(this.def * this.buffRate(3)); }
        get buffedMat() { return Math.floor(this.mat * this.buffRate(4)); }
        get buffedMdf() { return Math.floor(this.mdf * this.buffRate(5)); }
        get buffedAgi() { return Math.floor(this.agi * this.buffRate(6)); }
        get buffedLuk() { return Math.floor(this.luk * this.buffRate(7)); }

        // ─── RMMZ 특성(Traits) 수집 ───
        // 액터: 액터+직업+장비 특성 병합 / 적: 적 데이터 특성
        collectTraits() {
            const traits = [];
            try {
                if (this.team === "actor" && this._data) {
                    // 액터 고유 특성
                    if (this._data.traits) traits.push(...this._data.traits);
                    // 직업 특성
                    const cls = $dataClasses[this._data.classId];
                    if (cls && cls.traits) traits.push(...cls.traits);
                    // 장비 특성 (장비가 있다면)
                    if (this.equips) {
                        for (const eqId of this.equips) {
                            if (!eqId) continue;
                            // equips[0]=무기, 나머지=방어구
                            const eqData = (this.equips.indexOf(eqId) === 0)
                                ? ($dataWeapons && $dataWeapons[eqId])
                                : ($dataArmors && $dataArmors[eqId]);
                            if (eqData && eqData.traits) traits.push(...eqData.traits);
                        }
                    }
                } else if (this.team === "enemy" && this._data) {
                    if (this._data.traits) traits.push(...this._data.traits);
                }
            } catch (e) {
                console.warn("[SRPG] collectTraits error:", e.message);
            }
            return traits;
        }

        // ─── 속성 배율 계산 ───
        // RMMZ Trait Code 11 = 속성 유효도 (elementRate)
        // dataId = 속성 ID, value = 배율 (1.0=100%, 2.0=약점, 0.5=내성)
        elementRate(elementId) {
            if (!elementId || elementId <= 0) return 1.0;
            const traits = this.collectTraits();
            let rate = 1.0;
            for (const t of traits) {
                if (t.code === 11 && t.dataId === elementId) {
                    rate *= t.value;
                }
            }
            return rate;
        }

        // ─── 상태 유효도 ───
        // RMMZ Trait Code 13 = 상태 유효도 (stateRate)
        stateRate(stateId) {
            if (!stateId) return 1.0;
            const traits = this.collectTraits();
            let rate = 1.0;
            for (const t of traits) {
                if (t.code === 13 && t.dataId === stateId) {
                    rate *= t.value;
                }
            }
            return rate;
        }

        // ─── 공격 속성 가져오기 ───
        // RMMZ Trait Code 31 = 공격 속성 (attackElement)
        attackElements() {
            const traits = this.collectTraits();
            const elements = [];
            for (const t of traits) {
                if (t.code === 31) elements.push(t.dataId);
            }
            return elements;
        }

        // ─── 특정 특성 코드의 합산값 ───
        traitSum(code, dataId) {
            const traits = this.collectTraits();
            let sum = 0;
            for (const t of traits) {
                if (t.code === code && (dataId == null || t.dataId === dataId)) {
                    sum += t.value;
                }
            }
            return sum;
        }

        // ─── 특정 특성 코드의 곱산값 ───
        traitPi(code, dataId) {
            const traits = this.collectTraits();
            let pi = 1.0;
            for (const t of traits) {
                if (t.code === code && (dataId == null || t.dataId === dataId)) {
                    pi *= t.value;
                }
            }
            return pi;
        }

        // ─── RMMZ 추가 능력치 (xparam / sparam) ───
        // xparam: Trait Code 22, 가산 (base 0)
        //   0=HIT 1=EVA 2=CRI 3=CEV 4=MEV 5=MRF 6=CNT 7=HRG 8=MRG 9=TRG
        // sparam: Trait Code 23, 곱산 (base 1.0)
        //   0=TGR 1=GRD 2=REC 3=PHA 4=MCR 5=TCR 6=PDR 7=MDR 8=FDR 9=EXR
        xparam(paramId) {
            return this.traitSum(22, paramId);
        }

        sparam(paramId) {
            return this.traitPi(23, paramId);
        }

        // traitSum with dataId filter (기존 traitSum은 dataId 무시)
        traitSumById(code, dataId) {
            const traits = this.collectTraits();
            let sum = 0;
            for (const t of traits) {
                if (t.code === code && t.dataId === dataId) sum += t.value;
            }
            return sum;
        }

        // ─── xparam 편의 getter ───
        get hit() { return this.traitSumById(22, 0); }   // 명중률
        get eva() { return this.traitSumById(22, 1); }   // 회피율
        get cri() { return this.traitSumById(22, 2); }   // 크리티컬률
        get cev() { return this.traitSumById(22, 3); }   // 크리티컬 회피율
        get mev() { return this.traitSumById(22, 4); }   // 마법 회피율 (EVA에 통합)
        get mrf() { return this.traitSumById(22, 5); }   // 마법 반사율 (미사용)
        get cnt() { return this.traitSumById(22, 6); }   // 반격률
        get hrg() { return this.traitSumById(22, 7); }   // HP 재생률
        get mrg() { return this.traitSumById(22, 8); }   // MP 재생률
        get trg() { return this.traitSumById(22, 9); }   // TP 재생률 (미사용)

        // ─── sparam 편의 getter ───
        get tgr() { return this.traitPi(23, 0); }   // 타겟률
        get grd() { return this.traitPi(23, 1); }   // 방어 효과율 (미사용)
        get rec() { return this.traitPi(23, 2); }   // 회복 효과율
        get pha() { return this.traitPi(23, 3); }   // 약의 지식
        get mcr() { return this.traitPi(23, 4); }   // MP 소비율
        get tcr() { return this.traitPi(23, 5); }   // TP 차지율 (미사용)
        get pdr() { return this.traitPi(23, 6); }   // 물리 데미지율
        get mdr() { return this.traitPi(23, 7); }   // 마법 데미지율
        get fdr() { return this.traitPi(23, 8); }   // 바닥 데미지율
        get exr() { return this.traitPi(23, 9); }   // 경험치 획득율

        takeMpDamage(dmg) {
            this.mp = Math.max(0, this.mp - dmg);
        }

        healMp(amount) {
            this.mp = Math.min(this.mmp, this.mp + amount);
        }

        // RMMZ 데미지 타입별 적용
        // damageType: 0=없음, 1=HP데미지, 2=MP데미지, 3=HP회복, 4=MP회복, 5=HP흡수, 6=MP흡수
        applyDamage(dmg, damageType, source) {
            switch (damageType) {
                case 1: // HP 데미지
                    this.takeDamage(dmg);
                    break;
                case 2: // MP 데미지
                    this.takeMpDamage(dmg);
                    break;
                case 3: // HP 회복
                    this.heal(dmg);
                    break;
                case 4: // MP 회복
                    this.healMp(dmg);
                    break;
                case 5: // HP 흡수
                    this.takeDamage(dmg);
                    if (source) source.heal(Math.floor(dmg / 2));
                    break;
                case 6: // MP 흡수
                    this.takeMpDamage(dmg);
                    if (source) source.healMp(Math.floor(dmg / 2));
                    break;
                default:
                    break;
            }
        }
    }

    // =========================================================================
    //  SrpgSummon — 동적 오브젝트 소환 시스템
    // =========================================================================
    // 경량 이벤트 프록시: Game_Event 대신 사용 (동적 생성 오브젝트용)
    class SrpgEventProxy {
        constructor(x, y, name, charName, charIndex) {
            this._x = x;
            this._y = y;
            this._name = name || "소환물";
            this._opacity = 255;
            this._through = false;
            this._direction = 2;
            this._characterName = charName || "";
            this._characterIndex = charIndex || 0;
            this._sprite = null;      // PIXI 스프라이트 (SrpgUI가 관리)
            this._eventId = -1000 - Math.floor(Math.random() * 99999);
        }
        eventId() { return this._eventId; }
        locate(x, y) { this._x = x; this._y = y; }
        direction() { return this._direction; }
        setDirection(d) { this._direction = d; }
        setOpacity(v) {
            this._opacity = v;
            if (this._sprite) this._sprite.alpha = v / 255;
        }
        setThrough(v) { this._through = v; }
        screenX() {
            const tw = $gameMap.tileWidth();
            return Math.round((this._x + 0.5) * tw - $gameMap.displayX() * tw);
        }
        screenY() {
            const th = $gameMap.tileHeight();
            return Math.round((this._y + 1) * th - $gameMap.displayY() * th);
        }
        screenZ() { return 3; }
        refresh() {}
    }

    const SrpgSummon = {
        // 소환 가능한 오브젝트 타입 정의
        TYPES: {
            barricade: {
                name: "바리케이드",
                hp: 60, def: 5,
                charName: "!Other1", charIndex: 3, // RMMZ 기본 캐릭터셋
                tileColor: 0x886644,
            },
            wall: {
                name: "마법 벽",
                hp: 100, def: 10,
                charName: "!Other1", charIndex: 4,
                tileColor: 0x4488cc,
            },
            totem: {
                name: "토템",
                hp: 40, def: 0,
                charName: "!Other1", charIndex: 5,
                tileColor: 0x44cc88,
            },
        },

        // 스킬 노트 태그 파싱: <srpgSummon:actorId|타입> + 옵션
        parseSummonMeta(skillId) {
            if (!skillId || !$dataSkills[skillId]) return null;
            const skill = $dataSkills[skillId];
            const note = skill.note || "";
            const m = note.match(/<srpgSummon:\s*(\w+)>/i);
            if (!m) return null;
            const val = m[1];

            // actorId(숫자) vs 레거시 타입명 판별
            const actorId = Number(val);
            const isActorBased = !isNaN(actorId) && actorId > 0 && $dataActors[actorId];

            let meta;
            if (isActorBased) {
                // ─── 액터 DB 기반 소환 (신규) ───
                const actor = $dataActors[actorId];
                const aMeta = {};
                const aLines = (actor.note || "").split(/[\r\n]+/);
                for (const ln of aLines) {
                    const mm = ln.match(/<(\w+):(.+?)>/);
                    if (mm) aMeta[mm[1]] = mm[2].trim();
                }
                // 플러그인 파라미터에서 소환 액터 설정 읽기
                const _sumCfg = _getUnitCfg('actor', actorId);
                meta = {
                    actorId: actorId,
                    type: "actor",
                    name: actor.name || "소환물",
                    hp: 100, def: 0,
                    charName: actor.characterName || "",
                    charIndex: actor.characterIndex || 0,
                    tileColor: 0x888888,
                    teamId: -1,
                    summonAnim: 0,
                    // 멀티타일: 노트태그 → 플러그인 파라미터 → 기본값
                    gridW: Math.max(1, Number(aMeta.srpgGridW || _sumCfg.gridW || 1)),
                    gridH: Math.max(1, Number(aMeta.srpgGridH || _sumCfg.gridH || 1)),
                    anchor: { x: 0, y: 0 },
                    unitType: aMeta.srpgUnitType || _sumCfg.unitType || "object",
                    objectFlags: (aMeta.srpgObjectFlags || _sumCfg.objectFlags || "").split(",").filter(f => f.trim()),
                    spriteFile: aMeta.srpgSpriteFile || _sumCfg.spriteFile || null,
                    spriteFolder: aMeta.srpgSpriteFolder || _sumCfg.spriteFolder || null,
                };
                if (aMeta.srpgAnchor) {
                    const ap = aMeta.srpgAnchor.split(",");
                    meta.anchor = { x: Number(ap[0]) || 0, y: Number(ap[1]) || 0 };
                }
                // 액터의 클래스에서 HP/DEF 추출
                const clsId = actor.classId || 1;
                const cls = $dataClasses[clsId];
                if (cls && cls.params && Array.isArray(cls.params[0])) {
                    meta.hp = cls.params[0][1] || 100;  // Lv1 MHP
                    meta.def = cls.params[3][1] || 0;    // Lv1 DEF
                }
            } else {
                // ─── 레거시 타입 기반 소환 (하위 호환) ───
                const typeName = val.toLowerCase();
                const base = this.TYPES[typeName];
                meta = {
                    actorId: 0,
                    type: typeName,
                    name: base ? base.name : typeName,
                    hp: base ? base.hp : 60,
                    def: base ? base.def : 5,
                    charName: base ? base.charName : "",
                    charIndex: base ? base.charIndex : 0,
                    tileColor: base ? base.tileColor : 0x888888,
                    teamId: -1,
                    summonAnim: 0,
                    gridW: 1, gridH: 1,
                    anchor: { x: 0, y: 0 },
                    unitType: "object",
                    objectFlags: [],
                    spriteFile: null,
                    spriteFolder: null,
                };
            }
            // 공통 커스텀 옵션 파싱
            const hp = note.match(/<srpgSummonHp:\s*(\d+)>/i);
            if (hp) meta.hp = Number(hp[1]);
            const def = note.match(/<srpgSummonDef:\s*(\d+)>/i);
            if (def) meta.def = Number(def[1]);
            const name = note.match(/<srpgSummonName:\s*(.+?)>/i);
            if (name) meta.name = name[1].trim();
            const anim = note.match(/<srpgSummonAnim:\s*(\d+)>/i);
            if (anim) meta.summonAnim = Number(anim[1]);
            const team = note.match(/<srpgSummonTeam:\s*(\d+)>/i);
            if (team) meta.teamId = Number(team[1]);
            const charN = note.match(/<srpgSummonChar:\s*(.+?)>/i);
            if (charN) {
                const parts = charN[1].split(",");
                meta.charName = parts[0].trim();
                if (parts[1]) meta.charIndex = Number(parts[1].trim());
            }
            // 소환 제한/지속 파싱
            const dur = note.match(/<srpgSummonDuration:\s*(\d+)>/i);
            meta.duration = dur ? Number(dur[1]) : 0; // 0 = 영구
            const lim = note.match(/<srpgSummonLimit:\s*(\d+)>/i);
            meta.limit = lim ? Number(lim[1]) : 99;
            const rng = note.match(/<srpgSummonRange:\s*(.+?)>/i);
            meta.range = rng ? rng[1].trim() : "1-3";
            return meta;
        },

        // 오브젝트 소환 실행 (멀티타일 대응)
        spawn(summoner, tx, ty, meta) {
            const gw = meta.gridW || 1;
            const gh = meta.gridH || 1;
            const anc = meta.anchor || { x: 0, y: 0 };

            // 멀티타일: 모든 점유 타일 검증
            const ox = tx - anc.x;
            const oy = ty - anc.y;
            for (let i = 0; i < gw; i++) {
                for (let j = 0; j < gh; j++) {
                    const cx = ox + i, cy = oy + j;
                    if (!SrpgGrid.inBounds(cx, cy)) return null;
                    if (!SrpgGrid.isPassable(cx, cy)) return null;
                    if (SrpgGrid.isOccupied(cx, cy)) return null;
                }
            }

            // 소환 제한 확인
            if (meta.limit < 99) {
                const summonerIdx = SM._units.indexOf(summoner);
                const activeSummons = SM._units.filter(u =>
                    u._summoned && u._summonerId === summonerIdx &&
                    u._summonSkillType === (meta.actorId ? ("actor_" + meta.actorId) : (meta.type || "actor")) && u.isAlive()
                ).length;
                if (activeSummons >= meta.limit) {
                    SM._addPopup(tx, ty, "소환 한도 초과!", "#ff4444");
                    return null;
                }
            }

            const teamId = meta.teamId >= 0 ? meta.teamId : summoner.teamId;

            // 이벤트 프록시 생성
            const proxy = new SrpgEventProxy(tx, ty, meta.name, meta.charName, meta.charIndex);

            // SrpgUnit 생성을 위한 가짜 메타
            const unitMeta = {
                srpgUnit: summoner.team,
                srpgTeam: String(teamId),
                srpgObject: "true",
                srpgObjectHp: String(meta.hp),
                srpgObjectDef: String(meta.def),
                srpgObjectName: meta.name,
                // 멀티타일 정보 전달
                srpgGridW: String(gw),
                srpgGridH: String(gh),
                srpgAnchor: `${anc.x},${anc.y}`,
                srpgUnitType: meta.unitType || "object",
            };
            if (meta.objectFlags && meta.objectFlags.length > 0) {
                unitMeta.srpgObjectFlags = meta.objectFlags.join(",");
            }
            if (meta.spriteFile) unitMeta.srpgSpriteFile = meta.spriteFile;
            if (meta.spriteFolder) unitMeta.srpgSpriteFolder = meta.spriteFolder;

            const unit = new SrpgUnit(proxy, unitMeta);
            unit._summoned = true;     // 동적 소환 마커
            unit._summonerId = SM._units.indexOf(summoner);
            unit._summonSkillType = meta.actorId ? ("actor_" + meta.actorId) : (meta.type || "actor");
            unit._summonDuration = meta.duration || 0; // 0 = 영구
            unit._summonTurnsLeft = meta.duration || 0;
            SM._units.push(unit);

            // PIXI 스프라이트 생성 (타일맵에 추가)
            this._createSprite(unit, proxy, meta);

            // 소환 이펙트
            if (meta.summonAnim > 0 && proxy) {
                // 더미 이벤트 대상으로는 requestAnimation 불가 → 팝업으로 대체
            }
            SM._addPopup(tx, ty, `${meta.name} 소환!`, "#44ddff");
            try {
                if (AudioManager && AudioManager.playSe) {
                    AudioManager.playSe({name: "Saint5", volume: 80, pitch: 120, pan: 0});
                }
            } catch (e) {}

            SM._uiDirty = true;
            return unit;
        },

        // 소환물 PIXI 스프라이트 생성 (멀티타일 대응)
        _createSprite(unit, proxy, meta) {
            const tilemap = SrpgUI._tilemap;
            if (!tilemap) return;

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const gw = unit.gridW;
            const gh = unit.gridH;
            const fullW = gw * tw;
            const fullH = gh * th;

            // 컨테이너 (타일맵 자식, z=3 캐릭터와 동일)
            const container = new PIXI.Container();
            container.z = 3;

            // ── 타일 표시 (멀티타일 전체 영역) ──
            const tileGfx = new PIXI.Graphics();
            if (gw === 1 && gh === 1) {
                // 기존 1×1 렌더링
                tileGfx.beginFill(meta.tileColor, 0.35);
                tileGfx.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
                tileGfx.endFill();
                tileGfx.lineStyle(1, meta.tileColor, 0.7);
                tileGfx.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
                tileGfx.lineStyle(0);
            } else {
                // 멀티타일: 전체 영역 + 개별 타일 그리드 표시
                const offX = -unit.anchor.x * tw;
                const offY = -unit.anchor.y * th;
                tileGfx.beginFill(meta.tileColor, 0.30);
                tileGfx.drawRoundedRect(offX + 2, offY + 2, fullW - 4, fullH - 4, 4);
                tileGfx.endFill();
                tileGfx.lineStyle(1.5, meta.tileColor, 0.7);
                tileGfx.drawRoundedRect(offX + 2, offY + 2, fullW - 4, fullH - 4, 4);
                // 내부 그리드 선
                tileGfx.lineStyle(0.5, meta.tileColor, 0.3);
                for (let i = 1; i < gw; i++) {
                    const lx = offX + i * tw;
                    tileGfx.moveTo(lx, offY + 4);
                    tileGfx.lineTo(lx, offY + fullH - 4);
                }
                for (let j = 1; j < gh; j++) {
                    const ly = offY + j * th;
                    tileGfx.moveTo(offX + 4, ly);
                    tileGfx.lineTo(offX + fullW - 4, ly);
                }
                tileGfx.lineStyle(0);
            }
            container.addChild(tileGfx);

            // ── X 마크 (엄폐물 표시, 앵커 타일) ──
            const xMark = new PIXI.Graphics();
            xMark.lineStyle(2, 0xffffff, 0.5);
            const cx = tw / 2, cy = th / 2, sz = 6;
            xMark.moveTo(cx - sz, cy - sz); xMark.lineTo(cx + sz, cy + sz);
            xMark.moveTo(cx + sz, cy - sz); xMark.lineTo(cx - sz, cy + sz);
            xMark.lineStyle(0);
            container.addChild(xMark);

            // ── 이름 텍스트 (멀티타일은 중앙에 표시) ──
            const _rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            const nameText = new PIXI.Text(meta.name, {
                fontFamily: "sans-serif", fontSize: Math.round(9 * _rs), fontWeight: "bold",
                fill: "#ffffff", stroke: "#000000", strokeThickness: Math.round(2 * _rs),
                align: "center",
            });
            nameText.anchor.set(0.5, 0);
            if (gw > 1 || gh > 1) {
                const offX = -unit.anchor.x * tw;
                const offY = -unit.anchor.y * th;
                nameText.x = offX + fullW / 2;
                nameText.y = offY + 1;
            } else {
                nameText.x = tw / 2;
                nameText.y = 1;
            }
            container.addChild(nameText);

            // ── HP 바 (멀티타일은 전체 영역 하단) ──
            const hpBarBg = new PIXI.Graphics();
            const barOffX = (gw > 1 || gh > 1) ? -unit.anchor.x * tw : 0;
            const barOffY = (gw > 1 || gh > 1) ? -unit.anchor.y * th : 0;
            const barW = fullW - 8;
            hpBarBg.beginFill(0x000000, 0.6);
            hpBarBg.drawRect(barOffX + 4, barOffY + fullH - 8, barW, 4);
            hpBarBg.endFill();
            container.addChild(hpBarBg);
            const hpBar = new PIXI.Graphics();
            container.addChild(hpBar);
            container._hpBar = hpBar;
            container._hpBarW = barW;
            container._hpBarOffX = barOffX + 4;
            container._hpBarOffY = barOffY + fullH - 8;

            // ── 공격 대상 글로우 아웃라인 ──
            const targetGlow = new PIXI.Graphics();
            targetGlow.visible = false;
            container.addChild(targetGlow);
            container._targetGlow = targetGlow;
            container._targetGlowPhase = 0;

            tilemap.addChild(container);
            proxy._sprite = container;
            unit._spriteContainer = container;

            // 초기 위치 설정
            this._updateSpritePos(unit);
            this._updateHpBar(unit);
        },

        // 스프라이트 위치 업데이트
        _updateSpritePos(unit) {
            const c = unit._spriteContainer;
            if (!c) return;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            c.x = unit.x * tw + (c._fxOffsetX || 0);
            c.y = unit.y * th + (c._fxOffsetY || 0);
        },

        // HP 바 업데이트 (멀티타일 위치 대응)
        _updateHpBar(unit) {
            const c = unit._spriteContainer;
            if (!c || !c._hpBar) return;
            const hpBar = c._hpBar;
            hpBar.clear();
            const ratio = Math.max(0, unit.hp / unit.mhp);
            const color = ratio > 0.5 ? 0x44cc44 : (ratio > 0.25 ? 0xcccc44 : 0xcc4444);
            const _rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            const bx = c._hpBarOffX !== undefined ? c._hpBarOffX : Math.round(4 * _rs);
            const by = c._hpBarOffY !== undefined ? c._hpBarOffY : $gameMap.tileHeight() - Math.round(8 * _rs);
            const barH = Math.max(2, Math.round(4 * _rs));
            hpBar.beginFill(color, 0.9);
            hpBar.drawRect(bx, by, c._hpBarW * ratio, barH);
            hpBar.endFill();
        },

        // 매 프레임 호출: 소환물 스프라이트 갱신
        update() {
            // selectTarget 중 사정거리 타일 캐싱
            const inTarget = SM._subPhase === "selectTarget" && SM._targetCursorActive
                             && SM._currentUnit;
            const atkTiles = inTarget ? SM._atkRange : null;

            for (const u of SM._units) {
                if (!u._summoned || !u._spriteContainer) continue;
                if (!u.isAlive()) {
                    // 파괴됨 → 페이드아웃 후 스프라이트 제거
                    if (!u._destroyFade) {
                        u._destroyFade = 1.0; // 페이드아웃 시작
                    }
                    u._destroyFade -= 0.04; // ~25프레임 (0.4초)
                    u._spriteContainer.alpha = Math.max(0, u._destroyFade);
                    if (u._destroyFade <= 0) {
                        if (u._spriteContainer.parent) {
                            u._spriteContainer.parent.removeChild(u._spriteContainer);
                        }
                        u._spriteContainer = null;
                    }
                    continue;
                }
                this._updateHpBar(u);
                this._updateSpritePos(u);
                this._updateTargetGlow(u, atkTiles);
                // ── 피격 효과 (SrpgFX 연동) ──
                this._applyHitFX(u);
            }
        },

        // 턴 종료 시 소환물 지속시간 감소 (SM에서 호출)
        tickSummonDurations() {
            for (const u of SM._units) {
                if (!u._summoned || !u.isAlive()) continue;
                if (u._summonDuration > 0 && u._summonTurnsLeft > 0) {
                    u._summonTurnsLeft--;
                    if (u._summonTurnsLeft <= 0) {
                        u._alive = false;
                        SM._addPopup(u.x, u.y, `${u.name} 소멸`, "#aaaaaa");
                    }
                }
            }
        },

        // 특정 소환자의 활성 소환물 수
        countActiveSummons(summoner, skillType) {
            const idx = SM._units.indexOf(summoner);
            return SM._units.filter(u =>
                u._summoned && u._summonerId === idx &&
                (!skillType || u._summonSkillType === skillType) && u.isAlive()
            ).length;
        },

        // 소환물 전체 제거 (전투 종료 시)
        clearAll() {
            for (const u of SM._units) {
                if (u._summoned && u._spriteContainer) {
                    if (u._spriteContainer.parent) {
                        u._spriteContainer.parent.removeChild(u._spriteContainer);
                    }
                    u._spriteContainer = null;
                }
            }
        },

        // ── 오브젝트 피격 효과 (SrpgFX 연동) ──
        _applyHitFX(unit) {
            const c = unit._spriteContainer;
            if (!c) return;
            const fx = SrpgFX.getEffectsForUnit(unit);
            // 넉백 오프셋 (피격 시 흔들림)
            c._fxOffsetX = fx.offsetX || 0;
            c._fxOffsetY = fx.offsetY || 0;
            // 피격 틴트 (붉은색 플래시)
            if (fx.tintAlpha > 0) {
                if (!c._tintOverlay) {
                    const tw = $gameMap.tileWidth();
                    const th = $gameMap.tileHeight();
                    const tint = new PIXI.Graphics();
                    tint.beginFill(0xff0000, 1.0);
                    tint.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
                    tint.endFill();
                    c.addChild(tint);
                    c._tintOverlay = tint;
                }
                c._tintOverlay.visible = true;
                c._tintOverlay.alpha = fx.tintAlpha * 0.5;
            } else if (c._tintOverlay) {
                c._tintOverlay.visible = false;
            }
            // 크리티컬 차지 화이트 플래시
            if (fx.whiteAlpha > 0) {
                if (!c._whiteOverlay) {
                    const tw = $gameMap.tileWidth();
                    const th = $gameMap.tileHeight();
                    const white = new PIXI.Graphics();
                    white.beginFill(0xffffff, 1.0);
                    white.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
                    white.endFill();
                    c.addChild(white);
                    c._whiteOverlay = white;
                }
                c._whiteOverlay.visible = true;
                c._whiteOverlay.alpha = fx.whiteAlpha * 0.7;
            } else if (c._whiteOverlay) {
                c._whiteOverlay.visible = false;
            }
        },

        // 소환물 공격 대상 글로우 업데이트
        _updateTargetGlow(unit, atkTiles) {
            const c = unit._spriteContainer;
            if (!c || !c._targetGlow) return;
            const tg = c._targetGlow;
            let isTargetable = false;
            if (atkTiles && unit !== SM._currentUnit) {
                for (let i = 0; i < atkTiles.length; i++) {
                    if (unit.occupies(atkTiles[i].x, atkTiles[i].y)) {
                        isTargetable = true;
                        break;
                    }
                }
            }
            if (isTargetable) {
                c._targetGlowPhase += 0.05;
                const pulse = 0.40 + Math.sin(c._targetGlowPhase * 2) * 0.25;
                const tw = $gameMap.tileWidth();
                const th = $gameMap.tileHeight();
                tg.clear();
                tg.lineStyle(3, 0xFF2222, pulse * 0.6);
                tg.drawRoundedRect(0, 0, tw, th, 3);
                tg.lineStyle(1.5, 0xFF4444, pulse);
                tg.drawRoundedRect(1, 1, tw - 2, th - 2, 2);
                tg.lineStyle(0);
                tg.visible = true;
            } else {
                if (tg.visible) tg.clear();
                tg.visible = false;
                c._targetGlowPhase = 0;
            }
        },

        // 전투 종료 시 정리
        clear() {
            for (const u of SM._units) {
                if (u._summoned && u._spriteContainer) {
                    if (u._spriteContainer.parent) {
                        u._spriteContainer.parent.removeChild(u._spriteContainer);
                    }
                    u._spriteContainer = null;
                }
            }
        },
    };

    // =========================================================================
    //  SrpgGrid — 그리드 유틸 (BFS, 경로찾기)
    // =========================================================================
    const SrpgGrid = window.SrpgGrid = {
        _width: 0,
        _height: 0,

        init() {
            this._width = $dataMap.width;
            this._height = $dataMap.height;
        },

        inBounds(x, y) {
            return x >= 0 && x < this._width && y >= 0 && y < this._height;
        },

        isPassable(x, y) {
            if (!this.inBounds(x, y)) return false;
            return $gameMap.isPassable(x, y, 2) || $gameMap.isPassable(x, y, 4) ||
                   $gameMap.isPassable(x, y, 6) || $gameMap.isPassable(x, y, 8);
        },

        // ─── 4방향 통행 판정 (RMMZ 표준 양방향 체크) ───
        // (fromX,fromY)→(toX,toY) 이동 시 출발 타일 나가기 + 도착 타일 들어오기 모두 검증
        canMoveTo(fromX, fromY, toX, toY) {
            const dx = toX - fromX;
            const dy = toY - fromY;
            let d;
            if (dy > 0) d = 2;       // ↓
            else if (dx < 0) d = 4;  // ←
            else if (dx > 0) d = 6;  // →
            else if (dy < 0) d = 8;  // ↑
            else return false;
            const reverseD = 10 - d;
            if (!$gameMap.isPassable(fromX, fromY, d)) return false;
            if (!$gameMap.isPassable(toX, toY, reverseD)) return false;
            return true;
        },

        // ─── ZoC(지배 영역) 판정 ───
        // 해당 타일이 movingUnit에 대한 적대적 ZoC인지 확인
        isZoCTile(x, y, movingUnit) {
            for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                const nx = x + dx, ny = y + dy;
                const u = SM.unitAt(nx, ny);
                if (u && u.isAlive() && u.hasZoC() && u.isHostileTo(movingUnit)) {
                    // 고저차가 같아야 ZoC 작동
                    if (this.canMeleeInteract(x, y, nx, ny)) {
                        return true;
                    }
                }
            }
            return false;
        },

        // ─── 지형 레벨 (Region ID 기반, TerrainConfig 플러그인 참조) ───
        getElevation(x, y) {
            if (!this.inBounds(x, y)) return 2; // 기본 = 중지대
            const rid = $gameMap.regionId(x, y);
            if (typeof TerrainConfig !== 'undefined') {
                return TerrainConfig.getElevationLevel(rid);
            }
            // fallback (플러그인 미로드 시)
            return 2;
        },

        // 전투용 고저차 (3단계 정규화: 0=저, 1=중, 2=고)
        getCombatElevation(x, y) {
            return Math.floor(this.getElevation(x, y) / 2);
        },

        // 계단 타일 여부 (Region ID 기반, TerrainConfig 플러그인 참조)
        isStair(x, y) {
            const rid = $gameMap.regionId(x, y);
            if (typeof TerrainConfig !== 'undefined') {
                return TerrainConfig.isStairRegion(rid);
            }
            return false;
        },

        // 이동 시 고저차 검증: 레벨 차이 ±1 이내만 허용
        canTraverseElevation(fromX, fromY, toX, toY) {
            const fromElev = this.getElevation(fromX, fromY);
            const toElev = this.getElevation(toX, toY);
            return Math.abs(fromElev - toElev) <= 1;
        },

        // 근접 상호작용 가능 여부 (근접공격/반격/ZoC)
        canMeleeInteract(ax, ay, bx, by) {
            const aElev = this.getElevation(ax, ay);
            const bElev = this.getElevation(bx, by);
            return Math.abs(aElev - bElev) <= 1;
        },

        // 고저차: 공격자 전투레벨 - 방어자 전투레벨 (-2 ~ +2)
        elevationDiff(ax, ay, dx, dy) {
            return this.getCombatElevation(ax, ay) - this.getCombatElevation(dx, dy);
        },

        // ─── 고저차 기반 타겟 가능 여부 (스킬 범위 필터) ───
        // fireMode에 따라 고저차 제한 적용
        canTargetWithElevation(fromX, fromY, toX, toY, fireMode) {
            if (fireMode === FIRE_MODE.ARC) return true; // 곡사 — 무시
            if (fireMode === FIRE_MODE.MELEE) {
                // 근접 — 레벨 차이 ±1 이내
                return this.canMeleeInteract(fromX, fromY, toX, toY);
            }
            // direct — 시전자 전투 레벨 이하만
            const fromCE = this.getCombatElevation(fromX, fromY);
            const toCE = this.getCombatElevation(toX, toY);
            return toCE <= fromCE;
        },

        // 스킬 노트태그 <srpgIgnoreElevation> 확인
        _skillIgnoresElevation(skillId) {
            const skill = [skillId];
            if (!skill || !skill.note) return false;
            return /<srpgIgnoreElevation>/i.test(skill.note);
        },

        // ─── 지형 태그 기반 타일 속성 ───
        // 타일의 terrain tag 가져오기
        getTerrainTag(x, y) {
            if (!this.inBounds(x, y)) return 0;
            return $gameMap.terrainTag(x, y);
        },

        // 타일의 지형 타입 반환 ('cliff' | 'cover' | 'wall' | null)
        // v2: cliff는 Region 기반, cover/wall은 Terrain Tag 기반
        getTerrainType(x, y) {
            // 1) Region 기반 cliff 판정
            const rid = $gameMap.regionId(x, y);
            if (rid > 0 && typeof TerrainConfig !== 'undefined') {
                if (TerrainConfig.isCliffRegion(rid)) return "cliff";
            }
            // 2) Terrain Tag 기반 cover/wall 판정
            const tag = this.getTerrainTag(x, y);
            if (typeof TerrainConfig !== 'undefined') {
                return TerrainConfig.getTerrainBlockType(tag);
            }
            return null;
        },

        // terrain tag → 차단 타입 ('cover' | 'wall' | null)
        getTerrainTagBlockType(x, y) {
            if (!this.inBounds(x, y)) return null;
            const tag = $gameMap.terrainTag(x, y);
            if (typeof TerrainConfig !== 'undefined') {
                return TerrainConfig.getTerrainBlockType(tag);
            }
            return null;
        },

        // 해당 타일이 특정 fireMode의 투사체를 차단하는지 판정
        // v2: Terrain Tag(cover/wall) 기반 차단, cliff(region)는 통과
        // returns true if the tile BLOCKS the projectile
        doesTileBlock(x, y, fireMode) {
            if (fireMode === FIRE_MODE.MELEE) return false; // 근접 = 항상 통과

            // Terrain Tag 기반 차단 (cover/wall)
            if (this.inBounds(x, y)) {
                const tag = $gameMap.terrainTag(x, y);
                if (tag > 0 && typeof TerrainConfig !== 'undefined') {
                    if (fireMode === FIRE_MODE.DIRECT && TerrainConfig.terrainBlocksDirect(tag)) return true;
                    if (fireMode === FIRE_MODE.ARC && TerrainConfig.terrainBlocksArc(tag)) return true;
                }
            }

            return false;
        },

        // ─── Bresenham 직선 경로 추적 ───
        // fromX,fromY → toX,toY 사이의 타일 목록 반환 (양 끝점 제외)
        traceLine(fromX, fromY, toX, toY) {
            const tiles = [];
            let x0 = fromX, y0 = fromY;
            const x1 = toX, y1 = toY;
            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1;
            const sy = y0 < y1 ? 1 : -1;
            let err = dx - dy;

            // 시작점 건너뛰기
            while (true) {
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 <  dx) { err += dx; y0 += sy; }
                // 도착점도 제외
                if (x0 === x1 && y0 === y1) break;
                tiles.push({ x: x0, y: y0 });
            }
            return tiles;
        },

        // ─── 투사체 경로 차단 판정 ───
        // 공격자(fromX,fromY) → 대상(toX,toY)까지 fireMode에 따라
        // 경로상 차단 여부를 검사.
        // returns:
        //   { blocked: false } — 통과
        //   { blocked: true, x, y, terrainType, coverObject } — 차단됨
        //     coverObject: 해당 타일에 있는 파괴 가능 사물 (있으면)
        checkProjectilePath(fromX, fromY, toX, toY, fireMode) {
            // 근접은 경로 무시
            if (fireMode === FIRE_MODE.MELEE) {
                return { blocked: false };
            }
            const path = this.traceLine(fromX, fromY, toX, toY);
            // 이미 체크한 유닛 중복 방지 (멀티타일 유닛이 여러 타일에 걸칠 수 있으므로)
            const checkedUnits = new Set();
            for (const tile of path) {
                // 1) 지형 태그 기반 차단 (타일셋에 설정된 영구 지형)
                if (this.doesTileBlock(tile.x, tile.y, fireMode)) {
                    const obj = SM.unitAt(tile.x, tile.y);
                    const coverObj = (obj && obj.isObject && obj.isAlive()) ? obj : null;
                    return {
                        blocked: true,
                        x: tile.x,
                        y: tile.y,
                        terrainType: this.getTerrainTagBlockType(tile.x, tile.y) || this.getTerrainType(tile.x, tile.y),
                        coverObject: coverObj,
                    };
                }
                // 2) 오브젝트/유닛의 objectFlags 기반 차단 판정
                const obj = SM.unitAt(tile.x, tile.y);
                if (obj && obj.isAlive() && !checkedUnits.has(obj)) {
                    checkedUnits.add(obj);
                    // objectFlags 기반 판정 (멀티타일 오브젝트 지원)
                    if (obj.objectFlags && obj.objectFlags.size > 0) {
                        // transparent: 투사체 통과 (차단 안함)
                        if (obj.objectFlags.has('transparent')) continue;
                        // blocking: direct & arc 모두 차단
                        if (obj.objectFlags.has('blocking')) {
                            return {
                                blocked: true,
                                x: tile.x, y: tile.y,
                                terrainType: "blocking",
                                coverObject: obj.objectFlags.has('destructible') ? obj : null,
                            };
                        }
                        // cover: direct만 차단 (arc는 통과)
                        if (obj.objectFlags.has('cover') && fireMode === FIRE_MODE.DIRECT) {
                            return {
                                blocked: true,
                                x: tile.x, y: tile.y,
                                terrainType: "cover",
                                coverObject: obj.objectFlags.has('destructible') ? obj : null,
                            };
                        }
                    }
                    // 기존 isObject 호환: objectFlags가 없는 구형 사물
                    else if (obj.isObject && fireMode === FIRE_MODE.DIRECT) {
                        return {
                            blocked: true,
                            x: tile.x, y: tile.y,
                            terrainType: "cover",
                            coverObject: obj,
                        };
                    }
                }
            }
            return { blocked: false };
        },

        // 유닛이 점유 중인지 (이동 불가)
        isOccupied(x, y, excludeUnit) {
            for (const u of SM._units) {
                if (u === excludeUnit) continue;
                if (u.isAlive() && u.occupies(x, y)) return true;
            }
            return false;
        },

        // 이동 범위 BFS (maxMov: 사용할 이동력, 생략 시 unit.mov)
        // 멀티타일: 앵커 좌표 기준으로 BFS, 각 후보 위치에서 W×H 전체 검증
        calcMoveRange(unit, maxMov) {
            const movLimit = (maxMov !== undefined) ? maxMov : unit.mov;
            const range = [];
            const visited = {};
            const key = (x, y) => `${x},${y}`;
            const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
            visited[key(unit.x, unit.y)] = 0;
            const isMulti = !unit.isSingleTile();

            while (queue.length > 0) {
                const cur = queue.shift();
                range.push({ x: cur.x, y: cur.y, cost: cur.cost });

                if (cur.cost >= movLimit) continue;

                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    const nk = key(nx, ny);
                    const nc = cur.cost + 1;
                    if (visited[nk] !== undefined && visited[nk] <= nc) continue;

                    if (isMulti) {
                        // 멀티타일: 앵커를 (nx,ny)에 놓았을 때 모든 점유 타일 검증
                        if (!this._canAnchorAt(unit, nx, ny)) continue;
                    } else {
                        // 싱글타일: 4방향 통행 + 고저차 검증
                        if (!this.inBounds(nx, ny)) continue;
                        if (!this.canMoveTo(cur.x, cur.y, nx, ny)) continue;
                        if (!this.canTraverseElevation(cur.x, cur.y, nx, ny)) continue;
                        // 적 유닛은 통과 불가 (아군은 통과 가능)
                        const occ = SM.unitAt(nx, ny);
                        if (occ && occ !== unit && occ.teamId !== unit.teamId && occ.isAlive()) continue;
                    }

                    // ─── ZoC 이동 비용 증가 ───
                    let zocCost = 0;
                    if (!unit.ignoreZoC && this.isZoCTile(nx, ny, unit)) {
                        zocCost = 2; // ZoC 진입 시 추가 비용 +2
                    }
                    // ─── 유해 장판 이동 비용 증가 ───
                    let fieldCost = 0;
                    if (typeof SrpgField !== "undefined") {
                        const surface = SrpgField.getSurfaceAt(nx, ny);
                        if (surface) {
                            // 적(unit)에게 유해한 장판이면 비용 증가
                            const isOwner = (unit.teamId === surface.ownerTeam);
                            if (!isOwner || surface.modifier === "cursed") {
                                fieldCost = 1; // 유해 장판 추가 비용
                            }
                            // 용암/화염은 더 위험 → 추가 비용
                            if (surface.baseType === "lava" || surface.baseType === "fire") {
                                fieldCost = 2;
                            }
                        }
                    }
                    const adjustedCost = nc + zocCost + fieldCost;
                    if (visited[nk] !== undefined && visited[nk] <= adjustedCost) continue;
                    visited[nk] = adjustedCost;
                    queue.push({ x: nx, y: ny, cost: adjustedCost });
                }
            }

            // 다른 유닛이 있는 타일은 최종 목적지에서 제외 (본인 위치는 허용)
            if (isMulti) {
                return range.filter(t =>
                    (t.x === unit.x && t.y === unit.y) ||
                    this._canStopAt(unit, t.x, t.y)
                );
            }
            return range.filter(t =>
                (t.x === unit.x && t.y === unit.y) ||
                !this.isOccupied(t.x, t.y, unit)
            );
        },

        // 공격 범위 (Grid Range System 연동, 멀티타일 대응)
        calcAtkRange(unit, fromX, fromY, skillId) {
            if (fromX === undefined) fromX = unit.x;
            if (fromY === undefined) fromY = unit.y;
            // ─── 고저차 사거리 보정 (원거리, atkRange 다이아몬드만) ───
            // resolveReach 호출 전에 atkRange를 임시 보정하여 타일 배열 확장/축소
            // 커스텀 reach 타일(노트태그/무기)에는 보정 미적용 (의도적)
            const combatElev = this.getCombatElevation(fromX, fromY);
            const elevRangeBonus = combatElev - 1; // 고지대(2):+1, 중지대(1):0, 저지대(0):-1
            const origAtkRange = unit.atkRange;
            if (unit.atkRange >= 2 && elevRangeBonus !== 0) {
                unit.atkRange = Math.max(1, unit.atkRange + elevRangeBonus);
            }
            const resolved = resolveReach(unit, null);
            unit.atkRange = origAtkRange; // atkRange 복원
            const dir = unit.event ? unit.event.direction() : 8;

            // 고저차 필터 준비
            const _fireMode = skillId
                ? SrpgCombat.resolveFireMode(unit, skillId)
                : unit.fireMode;
            const _ignoreElev = skillId && this._skillIgnoresElevation(skillId);
            const _elevFilter = (t) => _ignoreElev || this.canTargetWithElevation(fromX, fromY, t.x, t.y, _fireMode);

            if (unit.isSingleTile()) {
                // 앵커 기준 단일 계산 + 고저차 필터
                return tilesToAbsolute(resolved.tiles, fromX, fromY, dir, resolved.rotate)
                    .filter(t => this.inBounds(t.x, t.y) && _elevFilter(t));
            }
            // 멀티타일: 모든 점유 타일에서 공격 범위를 합산
            const resultSet = new Map(); // key -> {x,y}
            const key = (x, y) => `${x},${y}`;
            const ox = fromX - unit.anchor.x;
            const oy = fromY - unit.anchor.y;
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    const tiles = tilesToAbsolute(resolved.tiles, tx, ty, dir, resolved.rotate);
                    for (const t of tiles) {
                        if (!this.inBounds(t.x, t.y)) continue;
                        if (!_elevFilter(t)) continue;
                        const k = key(t.x, t.y);
                        // 자기 점유 타일은 제외
                        if (t.x >= ox && t.x < ox + unit.gridW &&
                            t.y >= oy && t.y < oy + unit.gridH) continue;
                        if (!resultSet.has(k)) resultSet.set(k, { x: t.x, y: t.y });
                    }
                }
            }
            return Array.from(resultSet.values());
        },

        // ─── 투척 범위 계산 (근력 기반) ───
        calcThrowRange(unit, fromX, fromY) {
            if (fromX === undefined) fromX = unit.x;
            if (fromY === undefined) fromY = unit.y;
            // 투척 거리: 기본 3 + ATK/20 (최대 6)
            const throwDist = Math.min(6, 3 + Math.floor((unit.buffedAtk || unit.atk) / 20));
            const tiles = [];
            for (let dx = -throwDist; dx <= throwDist; dx++) {
                for (let dy = -throwDist; dy <= throwDist; dy++) {
                    if (Math.abs(dx) + Math.abs(dy) > throwDist) continue;
                    if (dx === 0 && dy === 0) continue;
                    const tx = fromX + dx, ty = fromY + dy;
                    if (this.inBounds(tx, ty)) tiles.push({ x: tx, y: ty });
                }
            }
            return tiles;
        },

        // BFS 경로 찾기 (이동 범위 내, 멀티타일 대응)
        findPath(unit, tx, ty, moveRange) {
            const key = (x, y) => `${x},${y}`;
            const rangeSet = new Set(moveRange.map(t => key(t.x, t.y)));
            if (!rangeSet.has(key(tx, ty))) return [];

            const isMulti = !unit.isSingleTile();
            const visited = {};
            const prev = {};
            const queue = [{ x: unit.x, y: unit.y }];
            visited[key(unit.x, unit.y)] = true;

            while (queue.length > 0) {
                const cur = queue.shift();
                if (cur.x === tx && cur.y === ty) break;

                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    const nk = key(nx, ny);
                    if (!rangeSet.has(nk)) continue;
                    if (visited[nk]) continue;
                    if (isMulti) {
                        // 멀티타일: 경로 중간에 앵커 위치로 진입 가능한지 확인
                        if (!this._canAnchorAt(unit, nx, ny)) continue;
                    } else {
                        // 경로 중간의 아군은 통과 가능
                        const occ = SM.unitAt(nx, ny);
                        if (occ && occ !== unit && occ.teamId !== unit.teamId && occ.isAlive()) continue;
                    }
                    visited[nk] = true;
                    prev[nk] = { x: cur.x, y: cur.y };
                    queue.push({ x: nx, y: ny });
                }
            }

            // 경로 역추적
            const path = [];
            let ck = key(tx, ty);
            if (!prev[ck] && !(tx === unit.x && ty === unit.y)) return [];
            let cx = tx, cy = ty;
            while (!(cx === unit.x && cy === unit.y)) {
                path.unshift({ x: cx, y: cy });
                const p = prev[key(cx, cy)];
                if (!p) break;
                cx = p.x; cy = p.y;
            }
            return path;
        },

        // ─── 멀티타일 이동 헬퍼 ───
        /** 앵커를 (ax,ay)에 놓았을 때 모든 점유 타일이 이동 가능한가? (통과 검증) */
        _canAnchorAt(unit, ax, ay) {
            const ox = ax - unit.anchor.x;
            const oy = ay - unit.anchor.y;
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    if (!this.inBounds(tx, ty)) return false;
                    if (!this.isPassable(tx, ty)) return false;
                    // 타일에 있는 유닛 확인 (자기 자신은 제외)
                    for (const u of SM._units) {
                        if (u === unit) continue;
                        if (!u.isAlive()) continue;
                        if (u.occupies(tx, ty)) {
                            // 적 팀은 통과 불가
                            if (u.teamId !== unit.teamId) return false;
                        }
                    }
                }
            }
            return true;
        },

        /** 앵커를 (ax,ay)에 놓았을 때 최종 정지할 수 있는가? (점유 검증) */
        _canStopAt(unit, ax, ay) {
            const ox = ax - unit.anchor.x;
            const oy = ay - unit.anchor.y;
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    // 다른 유닛이 점유 중이면 정지 불가
                    if (this.isOccupied(tx, ty, unit)) return false;
                }
            }
            return true;
        },

        // 맨해튼 거리 (단일 타일 좌표 간)
        dist(x1, y1, x2, y2) {
            return Math.abs(x1 - x2) + Math.abs(y1 - y2);
        },

        // 멀티타일 유닛 간 최소 맨해튼 거리
        distMulti(unitA, unitB) {
            if (unitA.isSingleTile() && unitB.isSingleTile()) {
                return this.dist(unitA.x, unitA.y, unitB.x, unitB.y);
            }
            let minDist = Infinity;
            const tilesA = unitA.occupiedTiles;
            const tilesB = unitB.occupiedTiles;
            for (const a of tilesA) {
                for (const b of tilesB) {
                    const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
                    if (d < minDist) {
                        minDist = d;
                        if (d <= 1) return d; // 인접이면 즉시 리턴
                    }
                }
            }
            return minDist;
        },

        // 좌표에서 멀티타일 유닛까지의 최소 맨해튼 거리
        distToUnit(x, y, unit) {
            if (unit.isSingleTile()) {
                return this.dist(x, y, unit.x, unit.y);
            }
            let minDist = Infinity;
            for (const t of unit.occupiedTiles) {
                const d = Math.abs(x - t.x) + Math.abs(y - t.y);
                if (d < minDist) {
                    minDist = d;
                    if (d <= 1) return d;
                }
            }
            return minDist;
        },
    };

    // =========================================================================
    //  SrpgTurnOrder — AP 기반 턴 관리
    // =========================================================================
    const SrpgTurnOrder = {
        _turnQueue: [],  // 예측된 턴 순서 [{unit, ap}]
        _globalTick: 0,

        reset() {
            this._globalTick = 0;
            this._turnQueue = [];
            // 장판 시스템도 초기화
            if (typeof SrpgField !== 'undefined') SrpgField.init();
        },

        // AP 누적 → 다음 턴 유닛/장판 결정
        advanceToNextTurn() {
            const alive = SM._units.filter(u => u.isAlive() && !u.isObject);
            // ★ 장판/구름도 AP 참가자로 포함
            const fields = (typeof SrpgField !== 'undefined') ? SrpgField.getAllParticipants() : [];
            const participants = [...alive, ...fields];
            if (participants.length === 0) return null;

            // AP를 누적시켜 임계치 도달 참가자 찾기
            for (let safety = 0; safety < 10000; safety++) {
                for (const u of participants) {
                    u.ap += u.agi;
                }
                this._globalTick++;

                const ready = participants.filter(u => u.ap >= AP_THRESHOLD);
                if (ready.length > 0) {
                    ready.sort((a, b) => {
                        if (b.ap !== a.ap) return b.ap - a.ap;
                        // 유닛 우선, 장판은 후순위
                        if (a.isField && !b.isField) return 1;
                        if (!a.isField && b.isField) return -1;
                        if (!a.isField && !b.isField) {
                            if (a.team !== b.team) return a.team === "actor" ? -1 : 1;
                            return SM._units.indexOf(a) - SM._units.indexOf(b);
                        }
                        return 0;
                    });
                    const next = ready[0];
                    next.ap -= AP_THRESHOLD;

                    // ★ 장판 턴: 자동 처리 (UI 상호작용 없음)
                    if (next.isField) {
                        const expired = SrpgField.tickField(next);
                        // 장판이 소멸했든 안 했든, 다음 참가자를 찾기 위해 재귀 호출
                        return this.advanceToNextTurn();
                    }

                    next.resetActions();
                    return next;
                }
            }
            return null;
        },

        // 턴 순서 예측 (UI용, 현재 상태를 변경하지 않음)
        predictTurns(count) {
            const alive = SM._units.filter(u => u.isAlive() && !u.isObject);
            const fields = (typeof SrpgField !== 'undefined') ? SrpgField.getAllParticipants() : [];
            const participants = [...alive, ...fields];
            if (participants.length === 0) return [];

            // 현재 AP 복사
            const apSnap = new Map();
            participants.forEach(u => apSnap.set(u, u.ap));

            const result = [];
            for (let t = 0; t < count; t++) {
                for (let safety = 0; safety < 10000; safety++) {
                    let found = null;
                    for (const u of participants) {
                        const newAp = apSnap.get(u) + u.agi;
                        apSnap.set(u, newAp);
                        if (newAp >= AP_THRESHOLD) {
                            if (!found || newAp > apSnap.get(found)) {
                                found = u;
                            }
                        }
                    }
                    if (found) {
                        apSnap.set(found, apSnap.get(found) - AP_THRESHOLD);
                        result.push(found);
                        break;
                    }
                }
            }

            return result;
        },
    };

    // =========================================================================
    //  SrpgCombat — 전투 계산
    // =========================================================================
    const SrpgCombat = {
        // ─── RMMZ 스킬 데이터 조회 ───
        getSkillData(skillId) {
            if (!skillId) return null;
            try {
                return (typeof $dataSkills !== "undefined" && $dataSkills[skillId]) || null;
            } catch (e) { return null; }
        },

        // ─── RMMZ 데미지 공식 평가 ───
        // formula: "a.atk * 4 - b.def * 2" 같은 문자열
        // a = 공격자(SrpgUnit), b = 방어자(SrpgUnit)
        evalFormula(formula, a, b) {
            try {
                const v = (typeof $gameVariables !== "undefined" && $gameVariables._data) ? $gameVariables._data : [];
                const value = Math.floor(eval(formula));
                return isNaN(value) ? 0 : value;
            } catch (e) {
                console.warn("[SRPG] Formula eval error:", formula, e.message);
                return 0;
            }
        },

        // ─── 데미지 타입 조회 ───
        getDamageType(skillId) {
            const skill = this.getSkillData(skillId);
            return (skill && skill.damage) ? (skill.damage.type || 0) : 1;
        },

        // ─── 예상 데미지 계산 (RMMZ 공식 기반) ───
        calcDamage(attacker, defender, skillId) {
            const skill = this.getSkillData(skillId);
            if (skill && skill.damage && skill.damage.formula && skill.damage.type > 0) {
                const base = this.evalFormula(skill.damage.formula, attacker, defender);
                // 회복 스킬(type 3,4)은 양수가 회복량
                const dtype = skill.damage.type;
                if (dtype === 3 || dtype === 4) return Math.max(base, 0);
                return Math.max(base, 0);
            }
            // fallback: 스킬 미지정 또는 데미지 없는 스킬 → 기본 공격
            const raw = attacker.atk - Math.floor(defender.def / 2);
            return Math.max(raw, 1);
        },

        // ─── 실제 데미지 (분산 적용) ───
        rollDamage(attacker, defender, skillId) {
            const base = this.calcDamage(attacker, defender, skillId);
            const skill = this.getSkillData(skillId);
            const variancePct = (skill && skill.damage && skill.damage.type > 0)
                ? (skill.damage.variance != null ? skill.damage.variance : 20) : 10;
            const amp = Math.floor(base * variancePct / 100);
            if (amp === 0) return base;
            return Math.max(0, base + Math.floor(Math.random() * (amp * 2 + 1)) - amp);
        },

        // ─── 배면/측면 판정 ───
        // 공격자와 방어자의 위치+방향으로 공격 방향 판정
        // 반환: "front" | "flank" | "rear"
        getFlankingType(attacker, defender) {
            // 사물(방향 개념 없음)이면 항상 정면
            if (defender.isObject) return "front";
            const defDir = defender.event ? defender.event.direction() : 2;
            const dx = attacker.x - defender.x;
            const dy = attacker.y - defender.y;
            // 방어자가 바라보는 방향의 반대에서 공격하면 배면
            // RMMZ: 2=아래, 4=왼, 6=오른, 8=위
            // 방어자 "앞" 방향 벡터
            let fx = 0, fy = 0;
            if (defDir === 2) fy = 1;       // 아래를 봄 → 앞=+y
            else if (defDir === 8) fy = -1; // 위를 봄 → 앞=-y
            else if (defDir === 4) fx = -1; // 왼쪽을 봄 → 앞=-x
            else if (defDir === 6) fx = 1;  // 오른쪽을 봄 → 앞=+x
            // 공격자 방향 내적: 양수=앞쪽, 음수=뒤쪽, 0=옆
            const dot = dx * fx + dy * fy;
            // 크로스(2D): 옆 판별
            const cross = dx * fy - dy * fx;
            if (dot < 0) return "rear";     // 뒤에서 공격
            if (dot === 0 && cross !== 0) return "flank"; // 옆에서 공격
            if (dot === 0 && cross === 0) return "front"; // 완전 겹침(자기 자신)
            // dot > 0 = 정면
            // 대각선: |cross| > |dot|이면 옆 비중이 큼 → flank
            if (Math.abs(cross) > Math.abs(dot)) return "flank";
            return "front";
        },

        // ─── 반격 가능 여부 (근접 물리 기본공격 한정) ───
        // 반격 조건: 근접(인접 1칸) + 물리 공격에 대해서만 발동
        // 마법 반격은 별도 역할군/시스템으로 분리 (미구현)
        // 원거리 반격은 비활성화
        canCounter(attacker, defender) {
            if (defender.isObject) return false;
            if (!defender.isAlive()) return false;
            // 근접 인접 체크 (1칸 이내만 반격 가능)
            const dist = SrpgGrid.dist(attacker.x, attacker.y, defender.x, defender.y);
            if (dist > 1) return false;
            // 고저차 체크 — 근접 상호작용 불가하면 반격 불가
            if (!SrpgGrid.canMeleeInteract(attacker.x, attacker.y, defender.x, defender.y)) return false;
            // CNT(반격률) 확률 체크 — 트레잇 미설정 시 100% 반격 (기존 호환)
            const cntRate = defender.cnt;
            if (cntRate <= 0) return false;
            if (cntRate >= 1) return true;
            return Math.random() < cntRate;
        },

        // ─── 명중 판정 (HIT vs EVA+MEV) ───
        // 반환: true = 명중, false = 회피
        hitCheck(attacker, defender, skillId, flankType) {
            const skill = this.getSkillData(skillId);
            // 회복/보조 스킬은 항상 명중
            if (skill && skill.damage) {
                const dt = skill.damage.type;
                if (dt === 0 || dt === 3 || dt === 4) return true;
            }
            // 스킬 명중 타입: 0=반드시, 1=물리, 2=마법
            const hitType = (skill && skill.hitType != null) ? skill.hitType : 1;
            if (hitType === 0) return true; // 반드시 명중

            // 공격자 명중률 (xparam HIT)
            const attackerHit = attacker.hit || 0.95; // 트레잇 미설정 시 95%
            // 스킬 자체 명중률 (successRate, 기본 100)
            const skillRate = (skill && skill.successRate != null) ? skill.successRate / 100 : 1.0;
            // 방어자 회피율 (EVA + MEV 통합)
            const defenderEva = (defender.eva || 0) + (defender.mev || 0);

            // ─── 고저차 회피율 보정 ───
            const elevDiff = SrpgGrid.elevationDiff(attacker.x, attacker.y, defender.x, defender.y);
            const elevEvaBonus = elevDiff * -0.075; // 고지→저지 공격 시 방어자 EVA 감소
            const adjustedEva = Math.max(0, defenderEva + elevEvaBonus);
            // 최종 명중률 = 공격자HIT × 스킬성공률 × (1 - 보정EVA) × 고저차 명중배율
            const elevHitMod = 1 + elevDiff * 0.15; // +1:1.15, +2:1.3, -1:0.85, -2:0.7
            let finalRate = attackerHit * skillRate * (1 - adjustedEva) * elevHitMod;
            // 측면 공격: 명중률 1.5배
            if (flankType === "flank") finalRate = Math.min(1, finalRate * 1.5);
            return Math.random() < finalRate;
        },

        // ─── 크리티컬 확률 (CRI - CEV 기반) ───
        critRate(attacker, defender, skillId) {
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
        },

        // ─── 거리 보정 계수 파싱 ───
        // 노트태그: <srpgDistMod:계수,기준거리> (기본: 1.0, 거리1)
        // 예: <srpgDistMod:0.9,1> → 기준거리(1칸)에서 100%, 멀어질수록 ×0.9/칸
        // 예: <srpgDistMod:1.1,3> → 기준거리(3칸)에서 100%, 가까울수록 ×1.1/칸
        parseDistMod(skillId) {
            const skill = this.getSkillData(skillId);
            if (!skill || !skill.note) return null;
            const m = skill.note.match(/<srpgDistMod:([^>]+)>/i);
            if (!m) return null;
            const parts = m[1].split(",").map(Number);
            return {
                factor: parts[0] || 1.0,   // 거리당 보정 계수
                baseDist: parts[1] || 1,     // 기준 거리
            };
        },

        // ─── 범위 감쇠 파싱 ───
        // 노트태그: <srpgAreaFalloff:계수> (기본: 없음 = 100% 균일)
        // 예: <srpgAreaFalloff:0.8> → 중심에서 1칸 떨어질 때마다 ×0.8
        parseAreaFalloff(skillId) {
            const skill = this.getSkillData(skillId);
            if (!skill || !skill.note) return null;
            const m = skill.note.match(/<srpgAreaFalloff:([\d.]+)>/i);
            if (!m) return null;
            return parseFloat(m[1]) || 1.0;
        },

        // ─── 거리 보정 적용 ───
        applyDistanceModifier(baseDmg, attacker, defender, skillId) {
            const mod = this.parseDistMod(skillId);
            if (!mod) return baseDmg;
            const dist = SrpgGrid.dist(attacker.x, attacker.y, defender.x, defender.y);
            const delta = Math.abs(dist - mod.baseDist);
            if (delta === 0) return baseDmg;
            // 기준거리보다 멀면 감쇠, 가까우면 증폭 (factor < 1이면 감쇠)
            const multiplier = Math.pow(mod.factor, delta);
            return Math.max(1, Math.floor(baseDmg * multiplier));
        },

        // ─── 범위 감쇠 적용 ───
        // targetDist: 범위 중심에서 해당 타겟까지의 거리
        applyAreaFalloff(baseDmg, skillId, targetDist) {
            const falloff = this.parseAreaFalloff(skillId);
            if (!falloff || targetDist <= 0) return baseDmg;
            const multiplier = Math.pow(falloff, targetDist);
            return Math.max(1, Math.floor(baseDmg * multiplier));
        },

        // ─── 속성 배율 적용 ───
        // ─── 스킬 공격 원소 ID 해석 ───
        // applyElementRate, checkT2Break 등에서 공유
        resolveSkillElement(attacker, skillId) {
            const skill = this.getSkillData(skillId);
            let elementId = 0;

            if (skill && skill.damage && skill.damage.elementId) {
                elementId = skill.damage.elementId;
                if (elementId === -1) {
                    // "통상 공격" → 공격자의 공격 속성 중 최적
                    const atkElements = attacker.attackElements ? attacker.attackElements() : [];
                    if (atkElements.length > 0) {
                        elementId = atkElements[0]; // 첫 번째 (배율 비교는 defender 필요)
                    } else {
                        elementId = 0;
                    }
                }
            } else if (!skillId || skillId === 0) {
                const atkElements = attacker.attackElements ? attacker.attackElements() : [];
                if (atkElements.length > 0) elementId = atkElements[0];
            }

            return elementId;
        },

        // ─── T2(동결/감전) 물리 해제 + 추가피해 ───
        // 물리 공격 적중 후 호출. T2 CC 상태 해제 + 보너스 피해.
        checkT2BreakByPhysical(target, elementId) {
            if (elementId !== 1 && elementId !== 0) return 0; // 물리(1) 또는 무속성(0)만
            let bonusDmg = 0;
            // 동결(35) 해제
            if (target.hasState(35)) {
                target.removeState(35);
                bonusDmg += Math.floor(target.mhp * 0.10); // MHP의 10% 추가피해
                console.log(`[SRPG] ${target.name}: 동결 물리 해제! +${bonusDmg} 추가피해`);
            }
            // 감전(37) 해제
            if (target.hasState(37)) {
                target.removeState(37);
                const sDmg = Math.floor(target.mhp * 0.10);
                bonusDmg += sDmg;
                console.log(`[SRPG] ${target.name}: 감전 물리 해제! +${sDmg} 추가피해`);
            }
            if (bonusDmg > 0 && target.applyDamage) {
                target.applyDamage(bonusDmg, 1, null); // 물리 추가피해
            }
            return bonusDmg;
        },

        applyElementRate(baseDmg, attacker, defender, skillId) {
            const skill = this.getSkillData(skillId);
            let elementId = 0;

            if (skill && skill.damage && skill.damage.elementId) {
                elementId = skill.damage.elementId;
                // elementId -1 = "통상 공격" → 공격자의 공격 속성 사용
                if (elementId === -1) {
                    const atkElements = attacker.attackElements ? attacker.attackElements() : [];
                    if (atkElements.length > 0) {
                        // 가장 효과적인 속성 선택 (RMMZ 기본 동작)
                        let bestRate = 0;
                        for (const eid of atkElements) {
                            const r = defender.elementRate ? defender.elementRate(eid) : 1.0;
                            if (r > bestRate) { bestRate = r; elementId = eid; }
                        }
                    } else {
                        elementId = 0; // 속성 없음
                    }
                }
            } else if (!skillId || skillId === 0) {
                // 기본 공격: 공격자의 공격 속성
                const atkElements = attacker.attackElements ? attacker.attackElements() : [];
                if (atkElements.length > 0) {
                    let bestRate = 0;
                    for (const eid of atkElements) {
                        const r = defender.elementRate ? defender.elementRate(eid) : 1.0;
                        if (r > bestRate) { bestRate = r; elementId = eid; }
                    }
                }
            }

            if (!elementId || elementId <= 0) return baseDmg;
            const rate = defender.elementRate ? defender.elementRate(elementId) : 1.0;
            return Math.max(0, Math.floor(baseDmg * rate));
        },

        // ─── 스킬 효과(Effects) 처리 ───
        // RMMZ 효과 코드:
        //  11: HP 회복   (value1=비율, value2=고정값)
        //  12: MP 회복   (value1=비율, value2=고정값)
        //  13: TP 획득   (value1=비율)
        //  21: 상태 부여  (dataId=stateId, value1=확률)
        //  22: 상태 해제  (dataId=stateId, value1=확률)
        //  31: 버프 부여  (dataId=paramId, value1=턴)
        //  32: 디버프 부여 (dataId=paramId, value1=턴)
        //  33: 버프 해제  (dataId=paramId)
        //  34: 디버프 해제 (dataId=paramId)
        //  41: 특수 효과  (dataId: 0=도주)
        //  42: 성장      (dataId=paramId, value1=값)
        //  43: 스킬 습득  (dataId=skillId)
        //  44: 공통 이벤트 (dataId=commonEventId)
        applySkillEffects(attacker, target, skillId) {
            const skill = this.getSkillData(skillId);
            if (!skill || !skill.effects || skill.effects.length === 0) return;

            for (const eff of skill.effects) {
                switch (eff.code) {
                    case 11: // HP 회복
                        if (target.heal) {
                            const amt = Math.floor(target.mhp * (eff.value1 || 0)) + (eff.value2 || 0);
                            if (amt > 0) target.heal(amt);
                        }
                        break;

                    case 12: // MP 회복
                        if (target.healMp) {
                            const amt = Math.floor(target.mmp * (eff.value1 || 0)) + (eff.value2 || 0);
                            if (amt > 0) target.healMp(amt);
                        }
                        break;

                    case 21: // 상태 부여
                        if (target.addState) {
                            const chance = eff.value1 || 1.0;
                            if (Math.random() < chance) {
                                const state = (typeof $dataStates !== "undefined") ? $dataStates[eff.dataId] : null;
                                const turns = state ? (state.minTurns + Math.floor(Math.random() * (state.maxTurns - state.minTurns + 1))) : 3;
                                target.addState(eff.dataId, turns);
                            }
                        }
                        break;

                    case 22: // 상태 해제
                        if (target.removeState) {
                            const chance = eff.value1 || 1.0;
                            if (Math.random() < chance) {
                                target.removeState(eff.dataId);
                            }
                        }
                        break;

                    case 31: // 버프 부여
                        if (target.addBuff) {
                            target.addBuff(eff.dataId, Math.floor(eff.value1) || 3);
                        }
                        break;

                    case 32: // 디버프 부여
                        if (target.addDebuff) {
                            target.addDebuff(eff.dataId, Math.floor(eff.value1) || 3);
                        }
                        break;

                    case 33: // 버프 해제
                        if (target.removeBuff) target.removeBuff(eff.dataId);
                        break;

                    case 34: // 디버프 해제
                        if (target.removeBuff) target.removeBuff(eff.dataId);
                        break;

                    case 44: // 공통 이벤트 호출
                        try {
                            if (typeof $gameTemp !== "undefined" && $gameTemp.reserveCommonEvent) {
                                $gameTemp.reserveCommonEvent(eff.dataId);
                            }
                        } catch (e) {}
                        break;

                    default:
                        break;
                }
            }
        },

        // 스킬 projectile type → fireMode 변환
        // artillery 스킬은 곡사(ARC), hitray/projectile은 직사(DIRECT)
        resolveFireMode(attacker, skillId) {
            if (skillId) {
                const projMeta = SrpgProjectile.parseSkillMeta(skillId);
                if (projMeta) {
                    if (projMeta.type === "artillery") return FIRE_MODE.ARC;
                    // hitray, projectile → 직사
                    return FIRE_MODE.DIRECT;
                }
            }
            // 투사체 스킬이 아니면 액터 기본 fireMode
            return attacker.fireMode;
        },

        // ─── 투사체 경로 차단 검사 (전투 전) ───
        // 공격자 → 대상까지 경로가 막혀 있는지 확인
        // skillId: 사용 중인 스킬 ID (투사체 타입으로 fireMode 결정)
        // returns: { blocked, redirectTarget, blockInfo }
        checkAttackPath(attacker, defender, skillId) {
            const fireMode = this.resolveFireMode(attacker, skillId);
            const pathResult = SrpgGrid.checkProjectilePath(
                attacker.x, attacker.y,
                defender.x, defender.y,
                fireMode
            );
            if (!pathResult.blocked) {
                return { blocked: false, redirectTarget: null, blockInfo: null };
            }
            // 직사 공격이 엄폐물에 차단 + 해당 타일에 파괴 가능 사물 있음
            // → 사물이 데미지를 대신 받음 (damage redirect)
            if (pathResult.terrainType === "cover" &&
                pathResult.coverObject &&
                fireMode === FIRE_MODE.DIRECT) {
                return {
                    blocked: false,        // 공격 자체는 실행됨 (리다이렉트)
                    redirectTarget: pathResult.coverObject,
                    blockInfo: pathResult,
                };
            }
            // 완전 차단 (Wall이거나, Cover에 사물 없는 경우)
            return { blocked: true, redirectTarget: null, blockInfo: pathResult };
        },

        // 전투 실행 (deferDamage: true면 데미지 계산만, 적용은 콜백에서)
        execute(attacker, defender, deferDamage, skillId) {
            if (PORTRAIT_MODE) {
                attacker.setPortraitState("attack");
                defender.setPortraitState("damage");
            }

            const dist = SrpgGrid.dist(attacker.x, attacker.y, defender.x, defender.y);
            const isRanged = dist > 1;

            // ─── 투사체 경로 차단 검사 ───
            const pathCheck = this.checkAttackPath(attacker, defender, skillId);

            if (pathCheck.blocked) {
                // 완전 차단 — 공격 실패
                console.log(`[SRPG] Attack BLOCKED: ${attacker.name} → ${defender.name} by ${pathCheck.blockInfo.terrainType} at (${pathCheck.blockInfo.x},${pathCheck.blockInfo.y})`);
                return {
                    damage: 0,
                    counterDamage: 0,
                    defenderDied: false,
                    critical: false,
                    counterCritical: false,
                    isRanged: isRanged,
                    attackerTeam: attacker.team,
                    defenderTeam: defender.team,
                    attacker: attacker,
                    defender: defender,
                    blocked: true,
                    blockInfo: pathCheck.blockInfo,
                };
            }

            // 실제 피격 대상 (리다이렉트 가능)
            const actualTarget = pathCheck.redirectTarget || defender;
            const redirected = !!pathCheck.redirectTarget;

            if (redirected) {
                console.log(`[SRPG] Attack REDIRECTED: ${attacker.name} → ${actualTarget.name} (cover at ${pathCheck.blockInfo.x},${pathCheck.blockInfo.y})`);
                if (PORTRAIT_MODE && actualTarget.setPortraitState) {
                    actualTarget.setPortraitState("damage");
                }
            }

            // ─── 배면/측면 판정 ───
            const flankType = this.getFlankingType(attacker, actualTarget);

            // ─── 명중 판정 (HIT vs EVA+MEV) ───
            // 스킬 명중 타입 확인 (물리만 측면/배면 보너스)
            const skillForFlank = this.getSkillData(skillId);
            const flankHitType = (skillForFlank && skillForFlank.hitType != null)
                ? skillForFlank.hitType : 1;
            const isPhysical = (flankHitType === 1);
            // 배면 자동 명중: 물리 공격만 적용
            const isHit = (isPhysical && flankType === "rear")
                ? true
                : this.hitCheck(attacker, actualTarget, skillId,
                    isPhysical ? flankType : "front");
            if (!isHit) {
                // 회피! 데미지 0, 반격도 없음
                if (!deferDamage) {
                    // "MISS" 팝업은 SM에서 result.missed 체크하여 표시
                }
                return {
                    damage: 0, counterDamage: 0,
                    defenderDied: false, critical: false, counterCritical: false,
                    isRanged: isRanged, attackerTeam: attacker.team, defenderTeam: defender.team,
                    attacker: attacker, defender: defender,
                    blocked: false, redirected: redirected, actualTarget: actualTarget,
                    damageType: this.getDamageType(skillId), skillId: skillId,
                    missed: true, flankType: flankType,
                };
            }

            const isCrit = Math.random() < this.critRate(attacker, actualTarget, skillId);
            const damageType = this.getDamageType(skillId);
            let dmg = this.rollDamage(attacker, actualTarget, skillId);
            // 거리 보정 적용
            dmg = this.applyDistanceModifier(dmg, attacker, actualTarget, skillId);
            // 속성 배율 적용 (회복 스킬 제외)
            if (damageType === 1 || damageType === 2 || damageType === 5 || damageType === 6) {
                dmg = this.applyElementRate(dmg, attacker, actualTarget, skillId);
            }
            // ─── PDR/MDR 물리·마법 데미지 배율 ───
            if (damageType === 1 || damageType === 5) {
                dmg = Math.floor(dmg * (actualTarget.pdr || 1));
            } else if (damageType === 2 || damageType === 6) {
                dmg = Math.floor(dmg * (actualTarget.mdr || 1));
            }
            // ─── REC 회복 효과율 ───
            if (damageType === 3 || damageType === 4) {
                dmg = Math.floor(dmg * (actualTarget.rec || 1));
            }
            // ─── 배면/측면 데미지 배율 (물리 공격만) ───
            if (isPhysical) {
                if (flankType === "rear") {
                    dmg = Math.floor(dmg * 2.0);
                } else if (flankType === "flank") {
                    dmg = Math.floor(dmg * 1.5);
                }
            }
            // ─── 인접 아군 궁합(시너지) 보너스 ───
            if (typeof SM !== 'undefined' && SM._calcAdjacencyBonus) {
                const synBonus = SM._calcAdjacencyBonus(attacker);
                if (synBonus !== 0) {
                    dmg = Math.max(1, dmg + synBonus);
                }
            }
            if (isCrit) dmg = Math.floor(dmg * 1.5);

            // deferDamage: 투사체 모드에서는 데미지 적용을 지연
            if (!deferDamage) {
                actualTarget.applyDamage(dmg, damageType, attacker);
                // ─── T2(동결/감전) 물리 해제 체크 ───
                const atkElement = this.resolveSkillElement(attacker, skillId);
                const t2Bonus = this.checkT2BreakByPhysical(actualTarget, atkElement);
                if (t2Bonus > 0) dmg += t2Bonus; // result.damage에 합산
                // 스킬 효과 즉시 적용 (상태/버프 등)
                this.applySkillEffects(attacker, actualTarget, skillId);
                // ─── 유닛 상태 + 원소 즉시 반응 (§8-F) ───
                checkUnitStateReactions(actualTarget, atkElement, attacker);
            }

            const result = {
                damage: dmg,
                counterDamage: 0,
                defenderDied: deferDamage ? (actualTarget.hp - dmg <= 0) : !actualTarget.isAlive(),
                critical: isCrit,
                counterCritical: false,
                isRanged: isRanged,
                attackerTeam: attacker.team,
                defenderTeam: defender.team,
                attacker: attacker,
                defender: defender,
                blocked: false,
                redirected: redirected,
                actualTarget: actualTarget,
                damageType: damageType,
                skillId: skillId,
                flankType: flankType,
            };

            // 반격 (근접 물리 공격에 한해서만 발동)
            // 조건: 리다이렉트 없음 + 근접 + 물리 공격(hitType 1) + 반격 가능
            const atkSkill = this.getSkillData(skillId);
            const atkHitType = (atkSkill && atkSkill.hitType != null) ? atkSkill.hitType : 1;
            if (!redirected && !isRanged && atkHitType === 1 &&
                this.canCounter(attacker, defender) && defender.isAlive()) {
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
            }

            return result;
        },

        // 전투 예측 (UI용)
        predict(attacker, defender, skillId) {
            const pathCheck = this.checkAttackPath(attacker, defender, skillId);

            if (pathCheck.blocked) {
                return {
                    damage: 0,
                    counterDamage: 0,
                    defenderHpAfter: defender.hp,
                    attackerHpAfter: attacker.hp,
                    defenderWillDie: false,
                    attackerWillDie: false,
                    blocked: true,
                    blockInfo: pathCheck.blockInfo,
                };
            }

            const actualTarget = pathCheck.redirectTarget || defender;
            const redirected = !!pathCheck.redirectTarget;
            const flankType = this.getFlankingType(attacker, actualTarget);
            let dmg = this.calcDamage(attacker, actualTarget, skillId);
            dmg = this.applyDistanceModifier(dmg, attacker, actualTarget, skillId);
            // 속성 배율
            const predDmgType = this.getDamageType(skillId);
            if (predDmgType === 1 || predDmgType === 2 || predDmgType === 5 || predDmgType === 6) {
                dmg = this.applyElementRate(dmg, attacker, actualTarget, skillId);
            }

            const damageType = this.getDamageType(skillId);
            // PDR/MDR/REC 예측 반영
            if (damageType === 1 || damageType === 5) {
                dmg = Math.floor(dmg * (actualTarget.pdr || 1));
            } else if (damageType === 2 || damageType === 6) {
                dmg = Math.floor(dmg * (actualTarget.mdr || 1));
            } else if (damageType === 3 || damageType === 4) {
                dmg = Math.floor(dmg * (actualTarget.rec || 1));
            }
            // 명중률 예측
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

            // ─── 인접 아군 궁합 보너스 (예측) ───
            if (typeof SM !== 'undefined' && SM._calcAdjacencyBonus) {
                const predSynBonus = SM._calcAdjacencyBonus(attacker);
                if (predSynBonus !== 0) {
                    dmg = Math.max(1, dmg + predSynBonus);
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
            }

            // 크리티컬률 예측
            const predictedCritRate = Math.max(0, Math.min(1, this.critRate(attacker, actualTarget, skillId)));

            // 반격 예측 (근접 물리만)
            let counter = 0;
            const predDist = SrpgGrid.dist(attacker.x, attacker.y, defender.x, defender.y);
            const predIsRanged = predDist > 1;
            if (!redirected && !predIsRanged && hitType === 1 &&
                this.canCounter(attacker, defender)) {
                counter = this.calcDamage(defender, attacker, 0);
                // 반격 PDR 예측
                counter = Math.floor(counter * (attacker.pdr || 1));
            }

            // 회복 스킬 프리뷰
            const isHeal = (damageType === 3 || damageType === 4);
            const isDrain = (damageType === 5 || damageType === 6);
            const defHpAfter = isHeal
                ? Math.min(actualTarget.mhp, actualTarget.hp + dmg)
                : Math.max(0, actualTarget.hp - dmg);
            const atkHpAfter = isDrain
                ? Math.min(attacker.mhp, attacker.hp + Math.floor(dmg / 2) - counter)
                : Math.max(0, attacker.hp - counter);

            return {
                damage: dmg,
                counterDamage: counter,
                defenderHpAfter: defHpAfter,
                attackerHpAfter: atkHpAfter,
                defenderWillDie: !isHeal && actualTarget.hp - dmg <= 0,
                attackerWillDie: counter > 0 && attacker.hp - counter <= 0,
                blocked: false,
                redirected: redirected,
                actualTarget: redirected ? actualTarget : null,
                damageType: damageType,
                isHeal: isHeal,
                isDrain: isDrain,
                hitRate: predictedHitRate,
                critRate: predictedCritRate,
                flankType: flankType,
            };
        },

        // ─── 협동 공격 탐색 ───
        findFollowUpAlly(attacker, defender) {
            if (!SM || !SM._units) return null;
            let best = null, bestScore = -1;
            for (const u of SM._units) {
                if (u === attacker || u === defender) continue;
                if (!u.isAlive() || u.isObject) continue;
                if (u.teamId !== attacker.teamId) continue;
                if (u.reaction <= 0) continue;
                // 사거리 체크
                const atkR = SrpgGrid.calcAtkRange(u);
                if (!atkR.some(t => t.x === defender.x && t.y === defender.y)) continue;
                // 경로 차단 체크
                const pathCheck = this.checkAttackPath(u, defender, 0);
                if (pathCheck.blocked) continue;
                // 친밀도 또는 패시브
                const affinity = u.affinityWith ? u.affinityWith(attacker) : 0;
                const hasSkill = u.hasFollowUpSkill ? u.hasFollowUpSkill() : false;
                if (affinity < 70 && !hasSkill) continue;
                const score = hasSkill ? Math.max(70, affinity) : affinity;
                if (score > bestScore) { bestScore = score; best = { unit: u, affinity: score }; }
            }
            return best;
        },

        // ─── 협동 공격 실행 ───
        executeFollowUp(follower, defender, affinityScore) {
            if (follower.reaction <= 0) return null;
            follower.reaction--;
            // 방향 전환
            const dx = defender.x - follower.x;
            const dy = defender.y - follower.y;
            let dir = 2;
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 6 : 4;
            else dir = dy > 0 ? 2 : 8;
            if (follower.event && follower.event.setDirection) follower.event.setDirection(dir);
            let dmg = this.rollDamage(follower, defender, 0);
            dmg = Math.floor(dmg * (defender.pdr || 1));
            const flankType = this.getFlankingType(follower, defender);
            if (flankType === "rear") dmg = Math.floor(dmg * 2.0);
            else if (flankType === "flank") dmg = Math.floor(dmg * 1.5);
            if (affinityScore >= 90) dmg = Math.floor(dmg * 1.2);
            defender.takeDamage(dmg);
            console.log(`[SRPG] 협동 공격: ${follower.name} → ${defender.name} (${dmg}dmg, 친밀${affinityScore})`);
            return { follower, defender, damage: dmg, flankType, affinityScore, died: !defender.isAlive() };
        },

        // ─── 기회 공격 실행 ───
        executeOpportunityAttack(reactor, mover) {
            if (!reactor.canOpportunityAttack()) return null;
            reactor.reaction--;
            // 방향 전환
            const dx = mover.x - reactor.x;
            const dy = mover.y - reactor.y;
            let dir = 2;
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 6 : 4;
            else dir = dy > 0 ? 2 : 8;
            if (reactor.event && reactor.event.setDirection) reactor.event.setDirection(dir);
            // 배면 보너스 자동 적용
            const flankType = this.getFlankingType(reactor, mover);
            let dmg = this.rollDamage(reactor, mover, 0);
            dmg = Math.floor(dmg * (mover.pdr || 1));
            if (flankType === "rear") dmg = Math.floor(dmg * 2.0);
            else if (flankType === "flank") dmg = Math.floor(dmg * 1.5);
            const isCrit = Math.random() < this.critRate(reactor, mover, 0);
            if (isCrit) dmg = Math.floor(dmg * 1.5);
            mover.takeDamage(dmg);
            console.log(`[SRPG] 기회 공격: ${reactor.name} → ${mover.name} (${dmg}dmg, ${flankType}${isCrit ? ", CRIT" : ""})`);
            return { reactor, mover, damage: dmg, critical: isCrit, flankType, died: !mover.isAlive() };
        },

        // SE/Animation helpers
        playCombatEffects(attacker, defender) {
            try {
                // SE: attack sound
                if (AudioManager && AudioManager.playSe) {
                    AudioManager.playSe({name: "Slash1", volume: 90, pitch: 100, pan: 0});
                }
                // RMMZ animation on defender (ID 1 = 물리 타격)
                if (defender && defender.event && $gameTemp && $gameTemp.requestAnimation) {
                    $gameTemp.requestAnimation([defender.event], 1);
                }
            } catch (e) {
                console.warn("[SRPG] playCombatEffects error:", e.message);
            }
        },

        playCounterEffects(defender, attacker) {
            try {
                if (AudioManager && AudioManager.playSe) {
                    AudioManager.playSe({name: "Blow1", volume: 80, pitch: 110, pan: 0});
                }
                if (attacker && attacker.event && $gameTemp && $gameTemp.requestAnimation) {
                    $gameTemp.requestAnimation([attacker.event], 1);
                }
            } catch (e) {
                console.warn("[SRPG] playCounterEffects error:", e.message);
            }
        },
    };

    // =========================================================================
    //  SrpgFX — 전투 피드백 이펙트 시스템
    //  (크리티컬 화이트 페이드, 피격 넉백+붉은 틴트, 화면 플래시)
    // =========================================================================
    const SrpgFX = {
        _activeEffects: [], // { type, target, timer, maxTimer, params }

        // 프레임마다 호출
        update() {
            for (let i = this._activeEffects.length - 1; i >= 0; i--) {
                const fx = this._activeEffects[i];
                fx.timer--;
                if (fx.timer <= 0) {
                    this._finish(fx);
                    this._activeEffects.splice(i, 1);
                }
            }
        },

        // ─── 공격자 크리티컬 차징 (흰색 페이드 IN → 공격 시 해제) ───
        // 전투 실행 직전에 호출, 공격 모션과 동시에 해제됨
        startCritCharge(unit, duration) {
            if (!unit) return;
            const d = duration || 20;
            this._activeEffects.push({
                type: "critCharge",
                target: unit,
                timer: d,
                maxTimer: d,
            });
        },

        // ─── 피격 넉백 + 붉은색 틴트 ───
        // isRanged: true면 위아래 점프, false면 공격자 반대방향 밀림
        // isCrit: 시간 1.5배 + 화면 플래시
        startHitReaction(defender, attacker, isRanged, isCrit, defenderTeam) {
            if (!defender) return;
            const baseDuration = 30; // 0.5초 @60fps
            const d = isCrit ? Math.floor(baseDuration * 1.5) : baseDuration;

            // 넉백 방향 계산
            let knockX = 0, knockY = 0;
            const knockDist = 6; // 픽셀
            if (isRanged) {
                // 범위 공격: 위아래 점프 (Y축만)
                knockX = 0;
                knockY = -knockDist;
            } else if (attacker) {
                // 근접: 공격자 반대방향
                const dx = defender.x - attacker.x;
                const dy = defender.y - attacker.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                knockX = (dx / len) * knockDist;
                knockY = (dy / len) * knockDist;
            }

            this._activeEffects.push({
                type: "hitReaction",
                target: defender,
                timer: d,
                maxTimer: d,
                knockX: knockX,
                knockY: knockY,
                isCrit: isCrit,
            });

            // 크리티컬 시 화면 플래시
            if (isCrit) {
                const flashColor = (defenderTeam === "actor")
                    ? [255, 60, 60, 180]    // 아군 피격: 붉은 플래시
                    : [255, 255, 255, 180];  // 적군 피격: 흰색 플래시
                if ($gameScreen) {
                    $gameScreen.startFlash(flashColor, 20);
                }
            }
        },

        // ─── 스프라이트에 효과 적용 (매 프레임, _srpgPUpdateEffects에서 호출) ───
        // 반환값: { offsetX, offsetY, tintColor, tintAlpha, whiteAlpha }
        getEffectsForUnit(unit) {
            const result = { offsetX: 0, offsetY: 0, tintColor: null, tintAlpha: 0, whiteAlpha: 0 };
            for (const fx of this._activeEffects) {
                if (fx.target !== unit) continue;

                if (fx.type === "critCharge") {
                    // 흰색이 점점 짙어짐 (0 → 0.7)
                    const progress = 1 - (fx.timer / fx.maxTimer); // 0→1
                    result.whiteAlpha = progress * 0.7;
                }

                if (fx.type === "hitReaction") {
                    const progress = 1 - (fx.timer / fx.maxTimer); // 0→1
                    // 넉백: 처음 0.3 구간에서 밀리고, 나머지에서 복귀
                    const knockPhase = 0.3;
                    let knockFactor;
                    if (progress < knockPhase) {
                        knockFactor = progress / knockPhase; // 0→1 밀려남
                    } else {
                        knockFactor = 1 - (progress - knockPhase) / (1 - knockPhase); // 1→0 복귀
                    }
                    result.offsetX = fx.knockX * knockFactor;
                    result.offsetY = fx.knockY * knockFactor;

                    // 붉은색 틴트: 처음에 완전 빨강, 점점 페이드아웃
                    // 처음 0.15 구간 = 풀 빨강, 이후 페이드아웃
                    const tintHold = 0.15;
                    if (progress < tintHold) {
                        result.tintColor = 0xFF0000;
                        result.tintAlpha = 1.0;
                    } else {
                        result.tintColor = 0xFF0000;
                        result.tintAlpha = 1.0 - (progress - tintHold) / (1 - tintHold);
                    }
                }
            }
            return result;
        },

        _finish(fx) {
            // 이펙트 종료 시 정리 (필요하면)
        },

        // 유닛에 활성 이펙트가 있는지
        hasActiveEffect(unit) {
            return this._activeEffects.some(fx => fx.target === unit);
        },

        // 전투 애니메이션이 완전히 끝났는지 (모든 이펙트 소진)
        allDone() {
            return this._activeEffects.length === 0;
        },

        clear() {
            this._activeEffects = [];
        },
    };

    // =========================================================================
    //  SrpgProjectile — 투사체/광선/포격 애니메이션 시스템
    //  3 모드: "projectile" (스프라이트 비행), "hitray" (즉시 빔),
    //          "artillery" (고각 포물선 + 카메라 팬)
    // ─── 바라지 패턴 정의 ───
    const BARRAGE_PATTERNS = {
        // 부채꼴: 공격자→기준점 방향 중심으로 좌우 산개
        fan: {
            defaultCount: 3,
            generate(fromX, fromY, toX, toY, count, spread) {
                const baseAngle = Math.atan2(toY - fromY, toX - fromX);
                const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
                const spreadRad = spread * (Math.PI / 6);
                const targets = [];
                for (let i = 0; i < count; i++) {
                    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
                    const angle = baseAngle + t * spreadRad;
                    targets.push({
                        x: Math.round(fromX + Math.cos(angle) * dist),
                        y: Math.round(fromY + Math.sin(angle) * dist),
                    });
                }
                return targets;
            },
        },
        // 일직선 관통
        line: {
            defaultCount: 1,
            generate(fromX, fromY, toX, toY, count, spread) {
                return [{ x: toX, y: toY, penetrate: true }];
            },
        },
        // 십자: 기준점 중심 4방향
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
            },
        },
        // 원형 산탄
        scatter: {
            defaultCount: 5,
            generate(fromX, fromY, toX, toY, count, spread) {
                const s = spread || 1;
                const targets = [{ x: toX, y: toY }];
                for (let i = 1; i < count; i++) {
                    const angle = (Math.PI * 2 / (count - 1)) * (i - 1);
                    const r = s * (0.5 + Math.random() * 0.5);
                    targets.push({
                        x: Math.round(toX + Math.cos(angle) * r),
                        y: Math.round(toY + Math.sin(angle) * r),
                    });
                }
                return targets;
            },
        },
    };
    window.BARRAGE_PATTERNS = BARRAGE_PATTERNS;

    // =========================================================================
    const SrpgProjectile = {
        _active: [],       // 활성 투사체 목록
        _container: null,  // PIXI.Container (Spriteset_Map 위에)
        _imageCache: {},   // 로드된 이미지 캐시

        // ─── 초기화 (전투 시작 시 호출) ───
        init(parentContainer) {
            if (this._container) {
                this.clear();
            }
            this._container = new PIXI.Container();
            this._container.z = 8; // 유닛 스프라이트 위
            if (parentContainer) {
                parentContainer.addChild(this._container);
            }
            this._parentRef = parentContainer;
            // PIXI 티커에 직접 등록 (RMMZ Studio 프리뷰 등 Scene_Map.update 체인이
            // 정상 동작하지 않는 환경에서도 투사체 애니메이션이 실행되도록 보장)
            this._removeTicker();
            this._tickerFn = () => this.update();
            if (Graphics._app && Graphics._app.ticker) {
                Graphics._app.ticker.add(this._tickerFn);
            }
        },

        _removeTicker() {
            if (this._tickerFn && Graphics._app && Graphics._app.ticker) {
                Graphics._app.ticker.remove(this._tickerFn);
            }
            this._tickerFn = null;
        },

        // 컨테이너가 없으면 자동 생성 (지연 초기화)
        _ensureContainer() {
            if (this._container) return;
            // Scene_Map의 spriteset에서 tilemap 찾기
            const scene = SceneManager._scene;
            if (scene && scene._spriteset && scene._spriteset._tilemap) {
                this.init(scene._spriteset._tilemap);
            } else {
                // 폴백: 독립 컨테이너
                this._container = new PIXI.Container();
                if (scene && scene._spriteset) {
                    scene._spriteset.addChild(this._container);
                }
            }
        },

        // ─── 이미지 로드 (img/srpg/ 폴더) ───
        _loadImage(name) {
            if (this._imageCache[name]) return this._imageCache[name];
            const bmp = ImageManager.loadBitmap("img/srpg/", name);
            this._imageCache[name] = bmp;
            return bmp;
        },

        // ─── 스킬 노트에서 투사체 설정 파싱 ───
        parseSkillMeta(skillId) {
            const skill = $dataSkills[skillId];
            if (!skill || !skill.note) return null;
            const note = skill.note;

            // <srpgProjectile:type>
            const typeMatch = note.match(/<srpgProjectile:\s*(projectile|hitray|artillery)\s*>/i);
            if (!typeMatch) return null;

            const meta = {
                type: typeMatch[1].toLowerCase(),
                image: "arrow",
                frameWidth: 32,
                frameHeight: 32,
                frameCount: 1,
                frameSpeed: 6,
                speed: 6,
                scale: 1.0,
                rotate: true,
                trail: false,
                trailAlpha: 0.3,
                impactAnimId: 0,
                impactSe: "",
                // Hitray 전용
                beamStart: "beam_start",
                beamMid: "beam_mid",
                beamEnd: "beam_end",
                beamDuration: 30,
                beamWidth: 1.0,
                hitCount: 1,
                hitInterval: 10,
                // Artillery 전용
                arcHeight: 0,       // 0 = 45도 동적 계산
                cameraPan: true,
                scatterRadius: 0,
                warningDuration: 40,
            };

            // 각 태그 파싱
            const tags = {
                srpgProjImage:      (v) => { meta.image = v; },
                srpgProjFrameW:     (v) => { meta.frameWidth = Number(v); },
                srpgProjFrameH:     (v) => { meta.frameHeight = Number(v); },
                srpgProjFrames:     (v) => { meta.frameCount = Number(v); },
                srpgProjFrameSpeed: (v) => { meta.frameSpeed = Number(v); },
                srpgProjSpeed:      (v) => { meta.speed = Number(v); },
                srpgProjScale:      (v) => { meta.scale = Number(v); },
                srpgProjRotate:     (v) => { meta.rotate = v.toLowerCase() !== "false"; },
                srpgProjTrail:      (v) => { meta.trail = v.toLowerCase() === "true"; },
                srpgProjTrailAlpha: (v) => { meta.trailAlpha = Number(v); },
                srpgProjImpactAnim: (v) => { meta.impactAnimId = Number(v); },
                srpgProjImpactSe:   (v) => { meta.impactSe = v; },
                // Hitray
                srpgBeamStart:      (v) => { meta.beamStart = v; },
                srpgBeamMid:        (v) => { meta.beamMid = v; },
                srpgBeamEnd:        (v) => { meta.beamEnd = v; },
                srpgBeamDuration:   (v) => { meta.beamDuration = Number(v); },
                srpgBeamWidth:      (v) => { meta.beamWidth = Number(v); },
                srpgHitCount:       (v) => { meta.hitCount = Number(v); },
                srpgHitInterval:    (v) => { meta.hitInterval = Number(v); },
                // Artillery
                srpgArcHeight:      (v) => { meta.arcHeight = Number(v); },
                srpgCameraPan:      (v) => { meta.cameraPan = v.toLowerCase() !== "false"; },
                srpgScatterRadius:  (v) => { meta.scatterRadius = Number(v); },
                srpgWarningDuration:(v) => { meta.warningDuration = Number(v); },
                // 멀티샷
                srpgMultiShot:      (v) => { meta.multiShot = Math.max(1, Number(v)); },
                srpgShotDelay:      (v) => { meta.shotDelay = Number(v); },
                srpgShotDamageMod:  (v) => { meta.shotDamageMod = Number(v); },
                // 바라지 (고정 범위 멀티샷)
                srpgBarrageCount:   (v) => { meta.barrageCount = Number(v); },
                srpgBarrageDelay:   (v) => { meta.barrageDelay = Number(v); },
                srpgBarrageDamageMod:(v) => { meta.barrageDamageMod = Number(v); },
                srpgBarrageSpread:  (v) => { meta.barrageSpread = Number(v); },
            };

            for (const [tag, setter] of Object.entries(tags)) {
                const re = new RegExp("<" + tag + ":\\s*(.+?)\\s*>", "i");
                const m = note.match(re);
                if (m) setter(m[1]);
            }

            // 바라지 패턴 파싱
            const barrageMatch = note.match(/<srpgBarrage:\s*(fan|line|cross|scatter)\s*>/i);
            if (barrageMatch) {
                meta.barragePattern = barrageMatch[1].toLowerCase();
                if (!meta.barrageCount) meta.barrageCount = BARRAGE_PATTERNS[meta.barragePattern]?.defaultCount || 3;
                if (!meta.barrageDelay) meta.barrageDelay = 8;
                if (!meta.barrageDamageMod) meta.barrageDamageMod = 0.6;
                if (!meta.barrageSpread) meta.barrageSpread = 1;
            }

            // 멀티샷 기본값
            if (meta.multiShot > 1) {
                if (!meta.shotDelay) meta.shotDelay = 12;
                if (!meta.shotDamageMod) meta.shotDamageMod = 1.0;
            }

            return meta;
        },

        // ─── 월드 좌표 변환 (그리드 → 화면 픽셀) ───
        _gridToScreen(gx, gy) {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            return {
                x: (gx + 0.5) * tw - $gameMap.displayX() * tw,
                y: (gy + 0.5) * th - $gameMap.displayY() * th,
            };
        },

        // =========================================================
        //  (1) Projectile — 스프라이트 비행
        // =========================================================
        fireProjectile(attacker, target, meta, onHit) {
            this._ensureContainer();
            const from = this._gridToScreen(attacker.x, attacker.y);
            const to = this._gridToScreen(target.x, target.y);

            const bmp = this._loadImage(meta.image);
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5);
            sprite.scale.set(meta.scale);
            sprite.x = from.x;
            sprite.y = from.y;

            // 방향 각도
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const angle = Math.atan2(dy, dx);
            if (meta.rotate) sprite.rotation = angle;

            this._container.addChild(sprite);

            // 프레임 애니메이션 데이터
            const proj = {
                type: "projectile",
                sprite: sprite,
                bitmap: bmp,
                fromX: from.x, fromY: from.y,
                toX: to.x, toY: to.y,
                dx: dx, dy: dy,
                dist: Math.sqrt(dx * dx + dy * dy),
                traveled: 0,
                speed: meta.speed,
                angle: angle,
                meta: meta,
                onHit: onHit,
                // 프레임 애니
                frame: 0,
                frameTimer: 0,
                frameCount: meta.frameCount,
                frameWidth: meta.frameWidth,
                frameHeight: meta.frameHeight,
                frameSpeed: meta.frameSpeed,
                // 텍스처 로드 대기
                textureReady: false,
                // 잔상
                trails: [],
            };

            // 비트맵 로드 완료 시 텍스처 설정
            bmp.addLoadListener(() => {
                const baseTex = PIXI.Texture.from(bmp._canvas || bmp._image);
                proj._baseTex = baseTex;
                proj.textureReady = true;
                this._setFrame(proj, 0);
            });

            this._active.push(proj);
            return proj;
        },

        // 프레임 설정 (스프라이트시트에서 특정 프레임 추출)
        _setFrame(proj, frameIdx) {
            if (!proj._baseTex) return;
            const fw = proj.frameWidth;
            const fh = proj.frameHeight;
            const cols = Math.floor(proj._baseTex.width / fw) || 1;
            const col = frameIdx % cols;
            const row = Math.floor(frameIdx / cols);
            const rect = new PIXI.Rectangle(col * fw, row * fh, fw, fh);
            proj.sprite.texture = new PIXI.Texture(proj._baseTex.baseTexture, rect);
        },

        // =========================================================
        //  (2) Hitray — 즉시 빔
        // =========================================================
        fireHitray(attacker, target, meta, onHit) {
            this._ensureContainer();
            const from = this._gridToScreen(attacker.x, attacker.y);
            const to = this._gridToScreen(target.x, target.y);

            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            const tw = $gameMap.tileWidth();

            // 빔 컨테이너
            const beamContainer = new PIXI.Container();
            beamContainer.x = from.x;
            beamContainer.y = from.y;
            beamContainer.rotation = angle;
            this._container.addChild(beamContainer);

            // 이미지 로드
            const startBmp = this._loadImage(meta.beamStart);
            const midBmp = this._loadImage(meta.beamMid);
            const endBmp = this._loadImage(meta.beamEnd);

            const ray = {
                type: "hitray",
                container: beamContainer,
                fromX: from.x, fromY: from.y,
                toX: to.x, toY: to.y,
                dist: dist,
                angle: angle,
                meta: meta,
                onHit: onHit,
                timer: meta.beamDuration,
                maxTimer: meta.beamDuration,
                hitCount: meta.hitCount,
                hitInterval: meta.hitInterval,
                hitsDone: 0,
                hitTimer: 0,
                startBmp: startBmp,
                midBmp: midBmp,
                endBmp: endBmp,
                spritesBuilt: false,
                beamScale: meta.beamWidth,
            };

            // 비트맵 로드 후 빔 스프라이트 구축
            const checkReady = () => {
                if (startBmp.isReady() && midBmp.isReady() && endBmp.isReady()) {
                    this._buildBeamSprites(ray);
                } else {
                    setTimeout(checkReady, 16);
                }
            };
            checkReady();

            this._active.push(ray);
            return ray;
        },

        _buildBeamSprites(ray) {
            const c = ray.container;
            const dist = ray.dist;
            const sc = ray.beamScale;

            // Start piece
            const startTex = PIXI.Texture.from(ray.startBmp._canvas || ray.startBmp._image);
            const startSpr = new PIXI.Sprite(startTex);
            startSpr.anchor.set(0, 0.5);
            startSpr.scale.set(sc);
            c.addChild(startSpr);

            // Mid pieces (타일링)
            const midTex = PIXI.Texture.from(ray.midBmp._canvas || ray.midBmp._image);
            const midW = midTex.width * sc;
            const startW = startTex.width * sc;
            const endTex = PIXI.Texture.from(ray.endBmp._canvas || ray.endBmp._image);
            const endW = endTex.width * sc;
            const midLength = Math.max(0, dist - startW - endW);
            const midCount = Math.ceil(midLength / midW);

            for (let i = 0; i < midCount; i++) {
                const midSpr = new PIXI.Sprite(midTex);
                midSpr.anchor.set(0, 0.5);
                midSpr.x = startW + i * midW;
                midSpr.scale.set(sc);
                c.addChild(midSpr);
            }

            // End piece
            const endSpr = new PIXI.Sprite(endTex);
            endSpr.anchor.set(0, 0.5);
            endSpr.x = dist - endW;
            endSpr.scale.set(sc);
            c.addChild(endSpr);

            ray.spritesBuilt = true;
        },

        // =========================================================
        //  (3) Artillery — 고각 포물선 + 카메라 팬
        // =========================================================
        fireArtillery(attacker, target, meta, onHit) {
            this._ensureContainer();
            const from = this._gridToScreen(attacker.x, attacker.y);
            const to = this._gridToScreen(target.x, target.y);

            const bmp = this._loadImage(meta.image);
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5);
            sprite.scale.set(meta.scale);
            sprite.visible = false; // 카메라 팬 후 나타남

            this._container.addChild(sprite);

            // 위험 구역 표시 (빨간 원)
            const warningGfx = new PIXI.Graphics();
            warningGfx.lineStyle(2, 0xFF3333, 0.8);
            warningGfx.beginFill(0xFF0000, 0.15);
            const warningR = (meta.scatterRadius > 0 ? meta.scatterRadius + 0.5 : 0.6) * $gameMap.tileWidth();
            warningGfx.drawCircle(0, 0, warningR);
            warningGfx.endFill();
            warningGfx.x = to.x;
            warningGfx.y = to.y;
            this._container.addChild(warningGfx);

            // 산개 오프셋 (scatterRadius > 0이면 랜덤 착탄점)
            let finalX = to.x, finalY = to.y;
            if (meta.scatterRadius > 0) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * meta.scatterRadius * $gameMap.tileWidth();
                finalX = to.x + Math.cos(angle) * r;
                finalY = to.y + Math.sin(angle) * r;
            }

            const arty = {
                type: "artillery",
                sprite: sprite,
                bitmap: bmp,
                warning: warningGfx,
                fromX: from.x, fromY: from.y,
                toX: to.x, toY: to.y,
                finalX: finalX, finalY: finalY,
                meta: meta,
                onHit: onHit,
                // 단계: "warning" → "rising" → "falling" → "done"
                phase: "warning",
                warningTimer: meta.warningDuration,
                // 포물선 파라미터 — arcHeight=0이면 45도 기반 동적 계산
                arcHeight: meta.arcHeight > 0 ? meta.arcHeight
                    : Math.abs(finalX - from.x) * 0.5,
                flightProgress: 0,        // 0 → 1
                flightSpeed: meta.speed * 0.015,  // progress per frame
                // 카메라 팬
                cameraPan: meta.cameraPan,
                originalScrollX: 0,
                originalScrollY: 0,
                panDone: false,
                // 프레임 애니
                frame: 0, frameTimer: 0,
                frameCount: meta.frameCount,
                frameWidth: meta.frameWidth,
                frameHeight: meta.frameHeight,
                frameSpeed: meta.frameSpeed,
                textureReady: false,
            };

            bmp.addLoadListener(() => {
                const baseTex = PIXI.Texture.from(bmp._canvas || bmp._image);
                arty._baseTex = baseTex;
                arty.textureReady = true;
                this._setFrame(arty, 0);
            });

            this._active.push(arty);
            return arty;
        },

        // ─── 매 프레임 업데이트 ───
        update() {
            if (!this._container || this._active.length === 0) return;
            // 중복 호출 방지 (Scene_Map.update + PIXI 티커 양쪽에서 호출될 수 있음)
            const fc = Graphics.frameCount;
            if (this._lastUpdateFrame === fc) return;
            this._lastUpdateFrame = fc;
            for (let i = this._active.length - 1; i >= 0; i--) {
                const p = this._active[i];
                let done = false;

                if (p.type === "projectile") done = this._updateProjectile(p);
                else if (p.type === "hitray") done = this._updateHitray(p);
                else if (p.type === "artillery") done = this._updateArtillery(p);

                if (done) {
                    this._cleanup(p);
                    this._active.splice(i, 1);
                }
            }
        },

        // ─── Projectile 업데이트 ───
        _updateProjectile(p) {
            if (!p.textureReady) return false;

            // 프레임 애니메이션
            p.frameTimer++;
            if (p.frameTimer >= p.frameSpeed) {
                p.frameTimer = 0;
                p.frame = (p.frame + 1) % p.frameCount;
                this._setFrame(p, p.frame);
            }

            // 이동
            const step = p.speed;
            p.traveled += step;
            const t = Math.min(p.traveled / p.dist, 1);

            p.sprite.x = p.fromX + p.dx * t;
            p.sprite.y = p.fromY + p.dy * t;

            // 잔상 (trail)
            if (p.meta.trail) {
                this._addTrail(p);
                this._updateTrails(p);
            }

            // 도착
            if (t >= 1) {
                this._onImpact(p);
                return true;
            }
            return false;
        },

        // ─── Hitray 업데이트 ───
        _updateHitray(p) {
            // 히트 타이밍
            p.hitTimer++;
            if (p.hitsDone < p.hitCount) {
                if (p.hitsDone === 0 || p.hitTimer >= p.hitInterval) {
                    p.hitTimer = 0;
                    p.hitsDone++;
                    if (p.onHit) p.onHit(p.hitsDone);
                    // 히트 이펙트
                    this._playImpactEffects(p.meta, p.toX, p.toY);
                }
            }

            // 페이드 아웃
            p.timer--;
            const fadeStart = p.maxTimer * 0.3;
            if (p.timer < fadeStart) {
                p.container.alpha = p.timer / fadeStart;
            }

            if (p.timer <= 0) return true;
            return false;
        },

        // ─── Artillery 업데이트 ───
        _updateArtillery(p) {
            switch (p.phase) {
                case "warning":
                    // 위험 표시 깜빡임
                    p.warningTimer--;
                    p.warning.alpha = 0.4 + Math.sin(p.warningTimer * 0.3) * 0.3;

                    if (p.warningTimer <= 0) {
                        p.phase = "rising";
                        p.sprite.visible = true;
                        // 시작점에서 위로 발사
                        p.sprite.x = p.fromX;
                        p.sprite.y = p.fromY;
                        p.flightProgress = 0;

                        // 카메라 팬 준비
                        if (p.cameraPan) {
                            p.originalScrollX = $gameMap.displayX();
                            p.originalScrollY = $gameMap.displayY();
                        }
                    }
                    break;

                case "rising":
                    // 포물선 상승 구간 (0 → 0.5)
                    p.flightProgress += p.flightSpeed;

                    if (p.flightProgress >= 0.5) {
                        p.phase = "falling";
                        // 카메라를 착탄 지점으로 팬
                        if (p.cameraPan) {
                            const tw = $gameMap.tileWidth();
                            const th = $gameMap.tileHeight();
                            const targetMapX = p.finalX / tw + $gameMap.displayX() - 0.5;
                            const targetMapY = p.finalY / th + $gameMap.displayY() - 0.5;
                            const halfW = Graphics.width / tw / 2;
                            const halfH = Graphics.height / th / 2;
                            const scrollX = Math.max(0, targetMapX - halfW + 0.5);
                            const scrollY = Math.max(0, targetMapY - halfH + 0.5);
                            $gameMap._displayX = scrollX;
                            $gameMap._displayY = scrollY;
                        }
                    }

                    this._updateArtilleryPosition(p);
                    this._updateArtilleryFrame(p);
                    break;

                case "falling":
                    // 포물선 하강 구간 (0.5 → 1.0)
                    p.flightProgress += p.flightSpeed * 1.5; // 낙하 가속

                    this._updateArtilleryPosition(p);
                    this._updateArtilleryFrame(p);

                    // 회전 (낙하감)
                    if (p.meta.rotate) {
                        const fallAngle = Math.PI * 0.5 + (p.flightProgress - 0.5) * Math.PI * 0.3;
                        p.sprite.rotation = fallAngle;
                    }

                    if (p.flightProgress >= 1) {
                        p.sprite.x = p.finalX;
                        p.sprite.y = p.finalY;
                        this._onImpact(p);

                        // 카메라 복귀
                        if (p.cameraPan && p.originalScrollX !== undefined) {
                            $gameMap._displayX = p.originalScrollX;
                            $gameMap._displayY = p.originalScrollY;
                        }
                        return true;
                    }
                    break;
            }
            return false;
        },

        // 포물선 위치 계산
        _updateArtilleryPosition(p) {
            const t = p.flightProgress;
            // 선형 보간 (X, Y) + 포물선 높이 오프셋
            const lerpX = p.fromX + (p.finalX - p.fromX) * t;
            const lerpY = p.fromY + (p.finalY - p.fromY) * t;
            // 포물선: -4h*t*(t-1) → 최대높이 h at t=0.5
            const arcY = -4 * p.arcHeight * t * (t - 1);

            // 화면 스크롤 보정
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrOffX = (p.originalScrollX - $gameMap.displayX()) * tw;
            const scrOffY = (p.originalScrollY - $gameMap.displayY()) * th;

            p.sprite.x = lerpX + scrOffX;
            p.sprite.y = lerpY - arcY + scrOffY;
        },

        // Artillery 프레임 애니메이션
        _updateArtilleryFrame(p) {
            if (!p.textureReady || p.frameCount <= 1) return;
            p.frameTimer++;
            if (p.frameTimer >= p.frameSpeed) {
                p.frameTimer = 0;
                p.frame = (p.frame + 1) % p.frameCount;
                this._setFrame(p, p.frame);
            }
        },

        // ─── 착탄 처리 (공통) ───
        _onImpact(p) {
            if (p.onHit) p.onHit(1);
            this._playImpactEffects(p.meta, p.sprite.x, p.sprite.y);
        },

        // 착탄 이펙트 (RMMZ 애니메이션 + SE)
        _playImpactEffects(meta, screenX, screenY) {
            // RMMZ 바닐라 애니메이션 재생
            if (meta.impactAnimId > 0) {
                // 화면 좌표에서 가장 가까운 맵 이벤트를 찾아 애니메이션 재생
                // 또는 대상 이벤트에 직접 재생
                try {
                    // $gameTemp.requestAnimation 은 캐릭터 배열 필요
                    // 여기서는 대상 이벤트를 onHit 콜백에서 처리하도록 위임
                } catch (e) {
                    console.warn("[SrpgProjectile] Impact anim error:", e);
                }
            }
            // 착탄 SE
            if (meta.impactSe && AudioManager && AudioManager.playSe) {
                AudioManager.playSe({name: meta.impactSe, volume: 90, pitch: 100, pan: 0});
            }
        },

        // ─── 잔상 시스템 ───
        _addTrail(p) {
            const trail = new PIXI.Sprite(p.sprite.texture);
            trail.anchor.set(0.5);
            trail.x = p.sprite.x;
            trail.y = p.sprite.y;
            trail.rotation = p.sprite.rotation;
            trail.scale.set(p.meta.scale);
            trail.alpha = p.meta.trailAlpha;
            this._container.addChild(trail);
            p.trails.push({ sprite: trail, life: 15 });
        },

        _updateTrails(p) {
            for (let i = p.trails.length - 1; i >= 0; i--) {
                const t = p.trails[i];
                t.life--;
                t.sprite.alpha = (t.life / 15) * p.meta.trailAlpha;
                if (t.life <= 0) {
                    this._container.removeChild(t.sprite);
                    t.sprite.destroy();
                    p.trails.splice(i, 1);
                }
            }
        },

        // ─── 정리 ───
        _cleanup(p) {
            if (p.sprite) {
                this._container.removeChild(p.sprite);
                p.sprite.destroy();
            }
            if (p.container) {
                this._container.removeChild(p.container);
                p.container.destroy({ children: true });
            }
            if (p.warning) {
                this._container.removeChild(p.warning);
                p.warning.destroy();
            }
            // 잔상 정리
            if (p.trails) {
                for (const t of p.trails) {
                    this._container.removeChild(t.sprite);
                    t.sprite.destroy();
                }
            }
        },

        // 모든 투사체 활성 상태?
        isBusy() {
            return this._active.length > 0;
        },

        // 완전 정리
        clear() {
            for (const p of this._active) {
                this._cleanup(p);
            }
            this._active = [];
            if (this._container && this._container.parent) {
                this._container.parent.removeChild(this._container);
            }
            this._container = null;
            this._removeTicker();
        },
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  SrpgField — 장판/구름 3계층 시스템
    //    Surface = [BaseType] × [Overlay] × [Modifier]
    //    Cloud   = [BaseType] × [Overlay] × [Modifier]
    //    설계서: SRPG_ELEMENT_PHASE_DESIGN.md, SRPG_ELEMENT_IMPL_PLAN.md
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── 상수 ───

    // 원소 ID (System.json 순서)
    const EL = {
        PHYSICAL: 1, FIRE: 2, ICE: 3, THUNDER: 4, WATER: 5,
        EARTH: 6, WIND: 7, LIGHT: 8, DARK: 9, POISON: 10
    };

    // 기반 타입
    const BASE_SURFACE = ["fire","water","blood","poison","oil","mud","web","lava"];
    const BASE_CLOUD   = ["steam","firecloud","poisoncloud","smoke","snow","dust","storm","bloodcloud","explosion","frostexplosion"];

    // 액체 판별 (오버레이 허용)
    const LIQUID_BASES = new Set(["water","blood","mud"]);
    // 동결 가능 액체 (진흙 제외)
    const FREEZABLE_BASES = new Set(["water","blood"]);
    // 전기 가능 액체
    const ELECTRIFIABLE_BASES = new Set(["water","blood","mud"]);
    // 전기 가능 구름
    const ELECTRIFIABLE_CLOUDS = new Set(["steam","bloodcloud"]);

    // 장판 기반 타입 → 기본 진입 상태 ID
    const SURFACE_ENTRY_STATE = {
        fire:   32,  // 화상
        water:  33,  // 젖음
        blood:  null, // 기본 효과 없음 (흡혈은 별도)
        poison: 38,  // 중독
        oil:    39,  // 유침
        mud:    46,  // 속박
        web:    46,  // 속박
        lava:   32,  // 화상 (강화)
    };

    // 오버레이 → 추가 진입 상태
    const OVERLAY_ENTRY_STATE = {
        electrified: 37, // 감전 (T2)
        frozen: null,     // 넘어짐 확률 (코드로 처리)
    };

    // ─── Phase 5: 축복 효과 테이블 (아군 전용) ───
    // 설계서 §5-A: 축복 장판 위 아군 → 버프
    const BLESSED_ALLY_EFFECT = {
        // baseType → { heal, purify, buffState, immuneState, special }
        fire:   { healPercent: 5, immuneState: [34,35] },  // 성화: HP 5%, 동결 면역
        water:  { healPercent: 3, purify: true },            // 성수: HP 3%, 디버프 정화
        poison: { healPercent: 3 },                          // 축복독: 재생
        mud:    { noMovePenalty: true },                      // 축복진흙: 이동 페널티 없음
        oil:    { buffDef: true, purify: true },              // 축복기름: 방어↑, 정화
        blood:  { healPercent: 3 },                           // 축복피: HP 회복
        web:    { buffAgi: true },                            // 축복거미줄: Haste
    };

    // 축복 오버레이 효과 (아군 전용)
    const BLESSED_OVERLAY_ALLY = {
        electrified: { buffAgi: true },   // Haste (행동력↑)
        frozen:      { buffMdf: true },   // 마법방어↑
    };

    // ─── 저주 효과 테이블 (설계서 §5-B) ───
    // 저주 장판은 적/아군 구분 없이 강화된 디버프
    const CURSED_EFFECT = {
        // baseType → { enhancedDoT, extraState, instantT2, armorPierce, special }
        fire:   { enhancedDoT: 2.0 },                         // 업화: DoT 2배
        water:  { extraState: 45 },                            // 저주수: 부패 부여
        poison: { extraState: 41 },                            // 저주독: 산성(균열=물리방어↓)
        mud:    { debuffStateRes: true },                       // 저주진흙: 상태이상 저항↓
        oil:    { explosionOnMove: true },                      // 저주기름: 이동 시 폭발 확률
        blood:  { extraState: 45 },                            // 저주피: 부패 부여
        web:    { guaranteedBind: true },                       // 저주거미줄: 속박 100%
    };

    // 저주 오버레이 효과
    const CURSED_OVERLAY_EFFECT = {
        electrified: { instantT2: 37 },   // 감전(T2) 즉시
        frozen:      { instantT2: 35, armorPierce: true },  // 동결(T2), 갑옷무시
    };

    // ─── 구름 진입 상태 ───
    const CLOUD_ENTRY_STATE = {
        steam:       null,    // 수증기: 기본 효과 없음 (HIT↓ 정도, 별도 처리)
        firecloud:   32,      // 화염구름: 화상
        poisoncloud: 38,      // 독구름: 중독
        smoke:       42,      // 연기: 풍압(HIT↓)
        snow:        34,      // 눈구름: 한기
        dust:        42,      // 먼지: 풍압(HIT↓)
        storm:       42,      // 폭풍: 풍압
        bloodcloud:  null,    // 피구름: 기본 효과 없음
    };

    // 축복 구름 효과 (아군 전용) — 설계서 §5-C
    const BLESSED_CLOUD_ALLY = {
        steam:       { healPercent: 3 },                // 축복수증기: HP 치유
        firecloud:   { healPercent: 3, immuneState: [34,35] }, // HP치유+동결면역
        poisoncloud: { healPercent: 3 },                // Regeneration
        smoke:       { stealth: true },                  // 은신
        snow:        { immuneState: [34] },             // 한기 면역
        dust:        { immuneHit: true },               // HIT 페널티 면역
        storm:       { immunePush: true },              // 밀림 면역
        bloodcloud:  { healPercent: 3 },                // HP 치유
    };

    // 저주 구름 효과 — 설계서 §5-C
    const CURSED_CLOUD_EFFECT = {
        steam:       { extraState: 45 },                // 부패 부여
        firecloud:   { enhancedDoT: 2.0 },              // 업화급 DoT
        poisoncloud: { extraState: 41 },                // 산성+중독
        smoke:       { silence: true, extraState: 44 }, // 실명+질식(그림자?)
        snow:        { freezeChanceUp: true },           // 동결 확률↑
        dust:        { enhancedHitDown: true },          // HIT↓↓ 강화
        storm:       { enhancedPush: true, dotPercent: 3 }, // 밀림강화+HP↓
        bloodcloud:  { extraState: 45 },                // 부패 부여
    };

    // ─── 넘어짐(KD) 확률: 빙판 위 이동 시 ───
    const FROZEN_KD_CHANCE = 0.30; // 30% 넘어짐 확률

    // ─── 자연 소멸 시 부산물 구름 테이블 (설계서 §8-E) ───
    const NATURAL_EXPIRY_BYPRODUCT = {
        fire: "smoke",   // 화염 자연소멸 → 연기
        lava: "smoke",   // 용암 자연소멸 → 연기
        // 나머지 기반 타입은 자연소멸 시 부산물 없음
    };

    // 장판 기반 타입 → 원소 ID (장판 자체의 원소)
    const BASE_TO_ELEMENT = {
        fire: EL.FIRE, water: EL.WATER, blood: EL.PHYSICAL,
        poison: EL.POISON, oil: 0, mud: EL.EARTH,
        web: 0, lava: EL.FIRE,
    };

    // 구름 기반 타입 → 원소 ID
    const CLOUD_TO_ELEMENT = {
        steam: EL.WATER, firecloud: EL.FIRE, poisoncloud: EL.POISON,
        smoke: 0, snow: EL.ICE, dust: EL.EARTH,
        storm: EL.WIND, bloodcloud: EL.PHYSICAL,
        explosion: EL.FIRE, frostexplosion: EL.ICE,
    };

    // 장판 기반타입 → 기본 애니메이션 이름 (img/srpg/Field_{name}.png)
    const SURFACE_ANIM_NAME = {
        fire: "Fire", water: "Water", blood: "Blood",
        poison: "Poison", oil: "Oil", mud: "Mud",
        web: "Web", lava: "Lava",
    };

    // 구름 기반타입 → 기본 애니메이션 이름
    const CLOUD_ANIM_NAME = {
        steam: "Steam", firecloud: "FireCloud", poisoncloud: "PoisonCloud",
        smoke: "Smoke", snow: "Snow", dust: "Dust",
        storm: "Storm", bloodcloud: "BloodCloud",
        explosion: "Explosion", frostexplosion: "FrostExplosion",
    };

    // 변형자별 색조 (blessed=금빛, cursed=보라)
    const MODIFIER_TINT = {
        normal:  [0, 0, 0, 0],
        blessed: [40, 30, 0, 60],    // 금빛 가산
        cursed:  [30, 0, 40, 60],    // 보라 가산
    };

    // 오버레이 추가 이펙트 이름
    const OVERLAY_FX = {
        none: null,
        electrified: "Electrify", // 번개 스파크 오버레이 애니메이션
        frozen: "Frozen",          // 얼음 결정 오버레이 애니메이션
    };

    // ─── SrpgSurface 클래스 (지면 장판) ───

    class SrpgSurface {
        constructor(config) {
            this.id = SrpgField._nextId++;
            this.baseType = config.baseType;              // "fire"|"water"|...
            this.overlay  = config.overlay  || "none";    // "none"|"electrified"|"frozen"
            this.modifier = config.modifier || "normal";  // "normal"|"blessed"|"cursed"

            // 타일 목록 [{x,y}] — 바둑판식 개별 타일 관리
            this.tiles   = config.tiles || [];
            this.tileSet = new Set(this.tiles.map(t => `${t.x},${t.y}`));

            this.duration    = config.duration || 4;
            this.maxDuration = this.duration;
            this.ownerId     = config.ownerId  || 0;
            this.ownerTeam   = config.ownerTeam || "enemy";
            this.skillId     = config.skillId  || 0;

            // 턴오더 참가자 속성
            this.ap    = 0;
            this.agi   = config.agi || 300;
            this.isField   = true;
            this.isSurface = true;
            this.isCloud   = false;
            this.name  = this._buildName();

            // 시각 속성 — 타일당 애니메이션
            this.animName    = config.animName || SURFACE_ANIM_NAME[this.baseType] || "Default";
            this.overlayFx   = OVERLAY_FX[this.overlay];
            this.modifierTint = MODIFIER_TINT[this.modifier];
            this.opacity     = 1.0;
        }

        _buildName() {
            let n = "";
            if (this.modifier !== "normal") n += (this.modifier === "blessed" ? "축복" : "저주");
            if (this.overlay === "electrified") n += "감전";
            if (this.overlay === "frozen") n += "동결";
            const nameMap = {
                fire:"화염",water:"수면",blood:"피",poison:"독늪",
                oil:"기름",mud:"진흙",web:"거미줄",lava:"용암"
            };
            n += nameMap[this.baseType] || this.baseType;
            return n;
        }

        // 이 장판이 액체인지
        isLiquid()       { return LIQUID_BASES.has(this.baseType); }
        canFreeze()      { return FREEZABLE_BASES.has(this.baseType); }
        canElectrify()   { return ELECTRIFIABLE_BASES.has(this.baseType); }

        // 타일 포함 여부
        containsTile(x, y) { return this.tileSet.has(`${x},${y}`); }

        // 기본 진입 상태 ID
        getEntryStateId() { return SURFACE_ENTRY_STATE[this.baseType] || null; }

        // 원소 ID
        getElementId() { return BASE_TO_ELEMENT[this.baseType] || 0; }

        // 이름 재빌드 (변형 후)
        refreshName() { this.name = this._buildName(); }

        // 시각 속성 갱신 (변형 후)
        refreshVisual() {
            this.overlayFx    = OVERLAY_FX[this.overlay];
            this.modifierTint = MODIFIER_TINT[this.modifier];
            this.refreshName();
        }
    }

    // ─── SrpgCloud 클래스 (구름) ───

    class SrpgCloud {
        constructor(config) {
            this.id = SrpgField._nextId++;
            this.baseType = config.baseType;
            this.overlay  = config.overlay  || "none";    // "none"|"electrified" (frozen 구름 없음)
            this.modifier = config.modifier || "normal";

            this.tiles   = config.tiles || [];
            this.tileSet = new Set(this.tiles.map(t => `${t.x},${t.y}`));

            this.duration    = config.duration || 3;
            this.maxDuration = this.duration;
            this.ownerId     = config.ownerId  || 0;
            this.ownerTeam   = config.ownerTeam || "enemy";

            // 턴오더
            this.ap    = 0;
            this.agi   = config.agi || 300;
            this.isField   = true;
            this.isSurface = false;
            this.isCloud   = true;
            this.name  = this._buildName();

            // 시각 — 타일당 애니메이션
            this.animName    = config.animName || CLOUD_ANIM_NAME[this.baseType] || "Default";
            this.overlayFx   = OVERLAY_FX[this.overlay];
            this.modifierTint = MODIFIER_TINT[this.modifier];
            this.opacity     = 1.0;

            // 순간 구름 (폭발/한파: 1턴만, 즉시 소멸)
            this.isInstant = (this.baseType === "explosion" || this.baseType === "frostexplosion");
        }

        _buildName() {
            let n = "";
            if (this.modifier !== "normal") n += (this.modifier === "blessed" ? "축복" : "저주");
            if (this.overlay === "electrified") n += "감전";
            const nameMap = {
                steam:"수증기",firecloud:"화염구름",poisoncloud:"독구름",
                smoke:"연기",snow:"눈구름",dust:"먼지",
                storm:"폭풍",bloodcloud:"피구름",
                explosion:"폭발구름",frostexplosion:"한파구름"
            };
            n += nameMap[this.baseType] || this.baseType;
            return n;
        }

        canElectrify() { return ELECTRIFIABLE_CLOUDS.has(this.baseType); }
        containsTile(x, y) { return this.tileSet.has(`${x},${y}`); }
        getElementId() { return CLOUD_TO_ELEMENT[this.baseType] || 0; }

        refreshName() { this.name = this._buildName(); }
        refreshVisual() {
            this.overlayFx    = OVERLAY_FX[this.overlay];
            this.modifierTint = MODIFIER_TINT[this.modifier];
            this.refreshName();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 유닛 상태 + 원소 즉시 반응 (설계서 §8-F)
    // ═══════════════════════════════════════════════════════════════

    const UNIT_STATE_REACTIONS = {
        33: { // 젖음
            [EL.FIRE]:    { remove: 33, byproduct: "steam" },
            [EL.ICE]:     { remove: 33, apply: 35 },
            [EL.THUNDER]: { remove: 33, apply: 37 },
        },
        31: { // 온기
            [EL.FIRE]:  { remove: 31, apply: 32 },
            [EL.WATER]: { remove: 31 },
            [EL.ICE]:   { remove: 31 },
        },
        32: { // 화상
            [EL.WATER]: { remove: 32, byproduct: "smoke" },
            [EL.ICE]:   { remove: 32 },
            [EL.WIND]:  { extendDuration: true },
        },
        34: { // 한기
            [EL.FIRE]: { remove: 34 },
            [EL.ICE]:  { remove: 34, apply: 35 },
        },
        35: { // 동결
            [EL.FIRE]: { remove: 35, createSurface: "water" },
        },
        36: { // 대전
            [EL.WATER]:   { remove: 36, apply: 37 },
            [EL.THUNDER]: { remove: 36, apply: 37 },
            [EL.WIND]:    { remove: 36, spreadToAdjacent: true },
        },
        39: { // 유침
            [EL.FIRE]:    { remove: 39, apply: 32 },
            [EL.THUNDER]: { remove: 39, spark: true },
        },
        38: { // 중독
            [EL.FIRE]: { remove: 38, apply: 32 },
        },
    };

    const LIGHT_DARK_REACTIONS = {
        44: { [EL.LIGHT]: { remove: 44 } },
        43: { [EL.DARK]:  { remove: 43 } },
        45: { [EL.LIGHT]: { remove: 45 } },
    };

    function checkUnitStateReactions(defender, elementId, attackerUnit) {
        if (!defender || !elementId || elementId <= 0) return;
        const reactions = [];
        const currentStates = defender.currentStateIds ? defender.currentStateIds() : [];

        for (const stateId of currentStates) {
            const table = UNIT_STATE_REACTIONS[stateId];
            if (table && table[elementId]) {
                reactions.push({ stateId, reaction: table[elementId] });
            }
        }
        for (const stateId of currentStates) {
            const table = LIGHT_DARK_REACTIONS[stateId];
            if (table && table[elementId]) {
                reactions.push({ stateId, reaction: table[elementId] });
            }
        }

        // 빛/어둠 + 해당 상태 없음 → 여명/그림자 부여
        if (elementId === EL.LIGHT && !currentStates.includes(43)) {
            defender.addState(43, 3);
        }
        if (elementId === EL.DARK && !currentStates.includes(44)) {
            defender.addState(44, 3);
        }

        for (const { stateId, reaction } of reactions) {
            _executeStateReaction(defender, stateId, reaction, attackerUnit);
        }
    }

    function _executeStateReaction(unit, stateId, reaction, attacker) {
        if (reaction.remove) {
            unit.removeState(reaction.remove);
            console.log("[StateReaction] " + unit.name + ": 상태 " + stateId + " 해제");
        }
        if (reaction.apply) {
            unit._addStateCore(reaction.apply, 3);
            console.log("[StateReaction] " + unit.name + ": → 상태 " + reaction.apply + " 부여");
        }
        if (reaction.byproduct && typeof SrpgField !== "undefined") {
            const ux = unit.event ? unit.event.x : (unit.x || 0);
            const uy = unit.event ? unit.event.y : (unit.y || 0);
            SrpgField.createCloud({
                baseType: reaction.byproduct,
                tiles: [{ x: ux, y: uy }],
                duration: 2, ownerId: 0, ownerTeam: 0,
            });
        }
        if (reaction.createSurface && typeof SrpgField !== "undefined") {
            const ux = unit.event ? unit.event.x : (unit.x || 0);
            const uy = unit.event ? unit.event.y : (unit.y || 0);
            SrpgField.createSurface({
                baseType: reaction.createSurface,
                tiles: [{ x: ux, y: uy }],
                duration: 3, ownerId: 0, ownerTeam: 0,
            });
        }
        if (reaction.extendDuration && unit._states) {
            const s = unit._states.find(function(s) { return s.id === stateId; });
            if (s) s.turnsLeft += 2;
        }
        if (reaction.spark) {
            const ux = unit.event ? unit.event.x : (unit.x || 0);
            const uy = unit.event ? unit.event.y : (unit.y || 0);
            const sparkDmg = Math.floor(unit.mhp * 0.05);
            unit.applyDamage(sparkDmg, 1, null);
            if (typeof SM !== "undefined" && SM._units) {
                for (const adj of SM._units) {
                    if (adj === unit || !adj.isAlive()) continue;
                    const ax = adj.event ? adj.event.x : (adj.x || 0);
                    const ay = adj.event ? adj.event.y : (adj.y || 0);
                    if (Math.abs(ax - ux) + Math.abs(ay - uy) <= 1) {
                        adj.applyDamage(Math.floor(sparkDmg * 0.5), 1, null);
                    }
                }
            }
        }
        if (reaction.spreadToAdjacent) {
            const ux = unit.event ? unit.event.x : (unit.x || 0);
            const uy = unit.event ? unit.event.y : (unit.y || 0);
            if (typeof SM !== "undefined" && SM._units) {
                for (const adj of SM._units) {
                    if (adj === unit || !adj.isAlive()) continue;
                    const ax = adj.event ? adj.event.x : (adj.x || 0);
                    const ay = adj.event ? adj.event.y : (adj.y || 0);
                    if (Math.abs(ax - ux) + Math.abs(ay - uy) <= 1) {
                        adj.addState(36, 2);
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    // ─── 투척 시스템 (Throw) ───
    // ═══════════════════════════════════════════════════════

    const SrpgThrow = window.SrpgThrow = {
        // 투척 기본 피해 (오브젝트 자체에 가하는 피해)
        BASE_THROW_DAMAGE: 10,

        // 투척 실행: caster가 obj를 (tx, ty)에 던짐
        execute(caster, obj, tx, ty) {
            const results = { objDamage: 0, hitDamage: 0, hitUnit: null, objDestroyed: false };

            // 1) 오브젝트에 가하는 피해: 기본 + 근력 보정
            const strBonus = Math.floor((caster.buffedAtk || caster.atk) * 0.4);
            results.objDamage = this.BASE_THROW_DAMAGE + strBonus;

            // 2) 착탄 지점에 유닛이 있으면 충돌 피해
            const hitUnit = (window.SrpgManager || SM).unitAt(tx, ty);
            if (hitUnit && hitUnit.isAlive() && hitUnit !== caster && hitUnit !== obj) {
                // 충돌 피해: 근력 기반 별개 계산
                results.hitDamage = Math.floor((caster.buffedAtk || caster.atk) * 0.5);
                results.hitUnit = hitUnit;
            }

            // 3) 오브젝트 이동
            obj.setPosition(tx, ty);
            if (obj.event) obj.event.locate(tx, ty);

            // 4) 오브젝트에 피해 적용
            if (obj.isAlive()) {
                obj.hp = Math.max(0, obj.hp - results.objDamage);
                if (obj.hp <= 0) {
                    results.objDestroyed = true;
                    obj.die();
                    // 5) 오브젝트 붕괴 시 속성 장판 생성 (오브젝트 메타 기반)
                    this._onObjectDestroyed(obj, tx, ty);
                }
            }

            // 6) 충돌 유닛에 피해 적용
            if (results.hitUnit && results.hitDamage > 0) {
                results.hitUnit.hp = Math.max(0, results.hitUnit.hp - results.hitDamage);
                if (results.hitUnit.hp <= 0) results.hitUnit.die();
            }

            // 7) 착탄 지점 장판 효과 체크
            if (typeof SrpgField !== "undefined") {
                SrpgField.checkUnitFieldStatus(obj, tx, ty);
                if (results.hitUnit) {
                    SrpgField.checkUnitFieldStatus(results.hitUnit, tx, ty);
                }
            }

            return results;
        },

        // 오브젝트 붕괴 시 속성 장판 연계
        _onObjectDestroyed(obj, tx, ty) {
            if (typeof SrpgField === "undefined") return;
            // 오브젝트 메타에서 장판 정보 읽기
            // <srpgDestroyField:baseType,duration> 노트태그
            const meta = (obj._data && obj._data.meta) ? obj._data.meta : {};
            const fieldTag = meta.srpgDestroyField;
            if (!fieldTag) return;
            const parts = fieldTag.split(",");
            if (parts.length < 2) return;
            const baseType = parts[0].trim().toLowerCase();
            const duration = Number(parts[1]) || 3;
            // 붕괴 지점에 장판 생성
            SrpgField.createSurface(tx, ty, baseType, duration, "normal", obj.teamId || 0);
            console.log(`[SrpgThrow] ${obj.name} 붕괴 → ${baseType} 장판 생성 (${duration}턴)`);
        },
    };

    // ═══════════════════════════════════════════════════════
    // ─── 은신/시야 시스템 (Stealth & Vision) ───
    // ═══════════════════════════════════════════════════════

    const SrpgVision = window.SrpgVision = {
        // 유닛의 감지 범위 (기본 시야)
        getVisionRange(unit) {
            // 기본 시야: 5 + LUK/10
            return 5 + Math.floor((unit.luk || 0) / 10);
        },

        // 해당 타일이 시야를 차단하는지 판정
        // v2: wall(tag 9)/bush(tag 10)은 Terrain Tag 기반 시야 차단
        doesTileBlockVision(x, y) {
            if (!SrpgGrid.inBounds(x, y)) return false;
            const tag = $gameMap.terrainTag(x, y);
            if (tag > 0 && typeof TerrainConfig !== 'undefined') {
                if (TerrainConfig.terrainBlocksVision(tag)) return true;
            }
            return false;
        },

        // 두 지점 사이 시야선(LOS) 확인 — Bresenham 직선 기반
        // returns true if line of sight is clear (not blocked)
        hasLineOfSight(fromX, fromY, toX, toY) {
            const path = SrpgGrid.traceLine(fromX, fromY, toX, toY);
            for (const tile of path) {
                if (this.doesTileBlockVision(tile.x, tile.y)) return false;
            }
            return true;
        },

        // 은신 중인 유닛을 감지할 수 있는지 판정
        // observer: 감지하려는 유닛, hidden: 은신 중인 유닛
        canDetect(observer, hidden) {
            if (!hidden._hidden) return true; // 은신 아님 → 항상 감지
            const dx = hidden.x - observer.x;
            const dy = hidden.y - observer.y;
            const dist = Math.abs(dx) + Math.abs(dy);
            const visionR = this.getVisionRange(observer);
            if (dist > visionR) return false; // 시야 밖 → 감지 불가

            // LOS 체크: 경로상 wall/bush가 시야를 차단하면 감지 불가
            if (!this.hasLineOfSight(observer.x, observer.y, hidden.x, hidden.y)) {
                return false;
            }

            // 방향 기반 시야 원뿔 체크 (전방 90도)
            if (dist > 0) {
                const dir = observer.event ? observer.event.direction() : 2;
                let fdx = 0, fdy = 0;
                if (dir === 2) fdy = 1;
                else if (dir === 8) fdy = -1;
                else if (dir === 4) fdx = -1;
                else if (dir === 6) fdx = 1;
                const dot = dx * fdx + dy * fdy;
                const cross = Math.abs(dx * fdy - dy * fdx);
                // 후방/측면(90도 밖): 인접 1칸만 감지 가능
                if (dot <= 0 || cross > dot) {
                    if (dist > 1) return false;
                }
            }

            // 감지 확률: observer의 감지력 vs hidden의 은신력
            // 감지력: LUK + AGI/2
            const detectPower = (observer.luk || 0) + Math.floor((observer.buffedAgi || observer.agi) / 2);
            // 은신력: 스킬 은신은 AGI * 1.5, 숨기(행동)는 AGI * 0.8
            const stealthMult = hidden._hideSkill ? 1.5 : 0.8;
            let stealthPower = Math.floor((hidden._hideAgi || hidden.agi) * stealthMult);

            // 지형 은신 보정: 수풀/엄폐물 위 유닛은 은신력 증가
            // v2: Terrain Tag 기반 (bush/cover)
            if (typeof TerrainConfig !== 'undefined') {
                const hTag = $gameMap.terrainTag(hidden.x, hidden.y);
                if (hTag > 0 && TerrainConfig.terrainIsBush(hTag)) {
                    stealthPower = Math.floor(stealthPower * 1.5); // 수풀: 50% 증가
                } else if (hTag > 0 && TerrainConfig.terrainGivesStealth(hTag)) {
                    stealthPower = Math.floor(stealthPower * 1.25); // 엄폐물: 25% 증가
                }
            }
            // 구름 은신 보정: 연기 구름 위에 있으면 은신력 증가
            if (typeof SrpgField !== 'undefined') {
                const clouds = SrpgField.getCloudsAt(hidden.x, hidden.y);
                if (clouds && clouds.some(c => c.baseType === 'smoke')) {
                    stealthPower = Math.floor(stealthPower * 1.3); // 연기: 30% 증가
                }
            }

            // 거리 보정: 가까울수록 감지 쉬움
            const distPenalty = Math.max(0, dist - 1) * 5;

            // 감지 임계: detectPower >= stealthPower + distPenalty → 감지
            return detectPower >= (stealthPower + distPenalty);
        },

        // 적군 시야 타일 계산 (은신 턴에 표시할 위협 범위)
        // 유닛이 바라보는 방향 기준 전방 90도 원뿔 시야
        calcEnemyVisionTiles(activeUnit) {
            const tiles = new Set();
            const units = SM._units || [];
            for (const u of units) {
                if (!u.isAlive() || u.isObject) continue;
                if (u.teamId === activeUnit.teamId) continue; // 아군은 제외
                const vr = this.getVisionRange(u);
                const dir = u.event ? u.event.direction() : 2;
                // 방향 벡터 (RMMZ: 2=아래, 4=왼, 6=오른, 8=위)
                let fdx = 0, fdy = 0;
                if (dir === 2) fdy = 1;
                else if (dir === 8) fdy = -1;
                else if (dir === 4) fdx = -1;
                else if (dir === 6) fdx = 1;
                for (let dx = -vr; dx <= vr; dx++) {
                    for (let dy = -vr; dy <= vr; dy++) {
                        const md = Math.abs(dx) + Math.abs(dy);
                        if (md === 0 || md > vr) continue;
                        // 전방 90도 원뿔: 방향벡터와의 내적 >= 0 이고
                        // 측면 성분이 전방 성분 이하 (cos45 ≈ 0.707)
                        const dot = dx * fdx + dy * fdy;
                        if (dot <= 0) continue; // 후방/측면 제외
                        // 90도 원뿔: |cross| <= dot (즉, 각도 <= 45도 양쪽)
                        const cross = Math.abs(dx * fdy - dy * fdx);
                        if (cross > dot) continue;
                        const tx = u.x + dx, ty = u.y + dy;
                        if (SrpgGrid.inBounds(tx, ty)) {
                            // LOS 체크: 경로상 wall/bush가 시야를 차단하면 제외
                            if (this.hasLineOfSight(u.x, u.y, tx, ty)) {
                                tiles.add(`${tx},${ty}`);
                            }
                        }
                    }
                }
                // 유닛 자체 위치도 시야에 포함 (자기 발밑)
                if (SrpgGrid.inBounds(u.x, u.y)) {
                    tiles.add(`${u.x},${u.y}`);
                }
            }
            return tiles;
        },

        // 턴 시작 시 은신 해제 체크
        checkStealthOnTurnStart(unit) {
            if (!unit._hidden) return;
            // 인접 적이 감지 가능하면 은신 해제
            const units = SM._units || [];
            for (const u of units) {
                if (!u.isAlive() || u.isObject) continue;
                if (u.teamId === unit.teamId) continue;
                if (this.canDetect(u, unit)) {
                    unit._hidden = false;
                    delete unit._hideAgi;
                    delete unit._hideSkill;
                    // RMMZ 상태 21(숨기) 제거
                    if (unit.actorId && $gameActors) {
                        const actor = $gameActors.actor(unit.actorId);
                        if (actor && actor.isStateAffected(21)) actor.removeState(21);
                    }
                    unit.refreshTint(); // 투명도 복원
                    console.log(`[SrpgVision] ${unit.name} 은신 해제 — ${u.name}에게 감지됨`);
                    return;
                }
            }
        },

        // 공격 시 은신 자동 해제
        breakStealth(unit) {
            if (unit._hidden) {
                unit._hidden = false;
                delete unit._hideAgi;
                delete unit._hideSkill;
                // RMMZ 상태 21(숨기) 제거
                if (unit.actorId && $gameActors) {
                    const actor = $gameActors.actor(unit.actorId);
                    if (actor && actor.isStateAffected(21)) actor.removeState(21);
                }
                unit.refreshTint(); // 투명도 복원
                console.log(`[SrpgVision] ${unit.name} 은신 해제 — 공격 행동`);
            }
        },

        // 적 AI: 은신 유닛을 타겟에서 제외
        isVisibleToEnemy(target, enemyUnit) {
            if (!target._hidden) return true;
            return this.canDetect(enemyUnit, target);
        },
    };

    // ─── SrpgField 매니저 ───

    const SrpgField = window.SrpgField = {
        _surfaces: [],    // SrpgSurface[]
        _clouds: [],      // SrpgCloud[]
        _nextId: 1,

        // 유닛별 장판 부여 상태 추적 { unitId: [{stateId, fieldId}] }
        _fieldAppliedStates: {},

        // ─── 초기화 ───
        init() {
            this._surfaces = [];
            this._clouds = [];
            this._nextId = 1;
            this._fieldAppliedStates = {};
            // Terrain Tag 기반 원소 지형 장판 자동 생성 (v2)
            this._spawnTerrainSurfaces();
        },

        // Terrain Tag 스캔 → 영구 원소 장판 생성 (surface 타입만)
        _spawnTerrainSurfaces() {
            if (typeof TerrainConfig === 'undefined') return;
            if (!$gameMap || !$gameMap.width()) return;
            const terrainSurfs = TerrainConfig.terrainSurfaces;
            if (!terrainSurfs || Object.keys(terrainSurfs).length === 0) return;

            // tag별 타일 수집
            const tagTiles = {}; // tag → [{x,y}, ...]
            const w = $gameMap.width(), h = $gameMap.height();
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const tag = $gameMap.terrainTag(x, y);
                    if (tag > 0 && terrainSurfs[tag]) {
                        if (!tagTiles[tag]) tagTiles[tag] = [];
                        tagTiles[tag].push({x, y});
                    }
                }
            }

            // 장판 생성
            for (const [tagStr, tiles] of Object.entries(tagTiles)) {
                const tag = Number(tagStr);
                const def = terrainSurfs[tag];
                if (!def || tiles.length === 0) continue;
                this.createSurface({
                    baseType: def.element,
                    name: def.name,
                    tiles: tiles,
                    duration: Infinity,
                    permanent: true,
                    fromTerrainTag: tag,  // 복원용 마커 (v2)
                });
            }
        },

        // ─── 장판 생성 ───
        createSurface(config) {
            const surface = new SrpgSurface(config);
            this._surfaces.push(surface);
            console.log(`[SrpgField] 장판 생성: ${surface.name} (id=${surface.id}, tiles=${surface.tiles.length})`);
            return surface;
        },

        // ─── 구름 생성 ───
        createCloud(config) {
            const cloud = new SrpgCloud(config);
            this._clouds.push(cloud);
            console.log(`[SrpgField] 구름 생성: ${cloud.name} (id=${cloud.id}, tiles=${cloud.tiles.length})`);
            return cloud;
        },

        // ─── 장판 제거 ───
        removeSurface(id) {
            const idx = this._surfaces.findIndex(s => s.id === id);
            if (idx >= 0) {
                const s = this._surfaces[idx];
                console.log(`[SrpgField] 장판 제거: ${s.name} (id=${id})`);
                this._surfaces.splice(idx, 1);
                // 이 장판으로 부여된 상태 정리
                this._cleanFieldStates(id);
                return s;
            }
            return null;
        },

        // ─── 구름 제거 ───
        removeCloud(id) {
            const idx = this._clouds.findIndex(c => c.id === id);
            if (idx >= 0) {
                const c = this._clouds[idx];
                console.log(`[SrpgField] 구름 제거: ${c.name} (id=${id})`);
                this._clouds.splice(idx, 1);
                this._cleanFieldStates(id);
                return c;
            }
            return null;
        },

        // ─── 타일 기반 조회 ───
        getSurfaceAt(x, y) {
            return this._surfaces.find(s => s.containsTile(x, y)) || null;
        },

        getCloudAt(x, y) {
            return this._clouds.find(c => c.containsTile(x, y)) || null;
        },

        // 해당 타일의 모든 장판 (중첩 가능 — 장판+구름)
        getAllFieldsAt(x, y) {
            const result = [];
            for (const s of this._surfaces) {
                if (s.containsTile(x, y)) result.push(s);
            }
            for (const c of this._clouds) {
                if (c.containsTile(x, y)) result.push(c);
            }
            return result;
        },

        // 해당 타일에 수풀 효과가 있는 장판이 있는지
        hasBushFieldAt(x, y) {
            return this._surfaces.some(s => s.containsTile(x, y));
        },

        // ─── 턴오더 참가자 목록 (유닛과 통합) ───
        getAllParticipants() {
            return [...this._surfaces, ...this._clouds];
        },

        // ─── 장판 턴 처리 (AP 도달 시 호출) ───
        tickField(field) {
            field.duration--;
            field.opacity = Math.max(0.15, field.duration / field.maxDuration);

            // 장판 위 유닛에 효과 재적용
            this._applyFieldEffectsToUnits(field);

            // 소멸 체크
            if (field.duration <= 0) {
                if (field.isSurface) {
                    // 자연소멸 부산물 구름 생성 (설계서 §8-E)
                    const byproduct = NATURAL_EXPIRY_BYPRODUCT[field.baseType];
                    if (byproduct) {
                        this.createCloud({
                            baseType: byproduct,
                            tiles: [...field.tiles],
                            duration: 2,
                            ownerId: field.ownerId,
                            ownerTeam: field.ownerTeam,
                            modifier: "normal",
                        });
                        console.log(`[SrpgField] 자연소멸 부산물: ${field.baseType} → ${byproduct} 구름`);
                    }
                    this.removeSurface(field.id);
                } else if (field.isCloud) {
                    this.removeCloud(field.id);
                }
                return true; // 소멸됨
            }
            return false;
        },

        // ─── 유닛에 장판 효과 적용 ───
        _applyFieldEffectsToUnits(field) {
            // SM._units가 있을 때만 (런타임)
            if (typeof SM === 'undefined' || !SM._units) return;

            for (const unit of SM._units) {
                if (!unit.isAlive() || unit.isObject) continue;
                const ux = unit.event ? unit.event.x : (unit.x || 0);
                const uy = unit.event ? unit.event.y : (unit.y || 0);

                if (!field.containsTile(ux, uy)) continue;

                if (field.isSurface) {
                    this._applySurfaceEffectToUnit(field, unit);
                } else if (field.isCloud) {
                    this._applyCloudEffectToUnit(field, unit);
                }
            }
        },

        // ─── 장판(Surface) 효과 적용 ───
        _applySurfaceEffectToUnit(surface, unit) {
            // 1. 기본 진입 상태 (장판 위 = 턴 999)
            const entryState = SURFACE_ENTRY_STATE[surface.baseType];
            if (entryState) {
                // 저주 거미줄: 100% 확정 속박 (저항 무시)
                if (surface.modifier === "cursed" && surface.baseType === "web") {
                    unit._addStateCore(entryState, 999);
                } else {
                    unit._addStateCore(entryState, 999);
                }
                this._trackFieldState(unit, entryState, surface.id);
            }

            // 2. 오버레이 추가 효과
            if (surface.overlay !== "none") {
                const ovState = OVERLAY_ENTRY_STATE[surface.overlay];
                if (ovState) {
                    unit._addStateCore(ovState, 999);
                    this._trackFieldState(unit, ovState, surface.id);
                }
                // 빙판: 넘어짐(KD) 확률 체크
                if (surface.overlay === "frozen") {
                    if (Math.random() < FROZEN_KD_CHANCE) {
                        // 동결 상태 1턴 적용 (넘어짐 = 행동 불가 1턴)
                        unit._addStateCore(35, 1);
                        console.log(`[SrpgField] ${unit.name}: 빙판 넘어짐!`);
                    }
                }
            }

            // 3. 축복/저주 분기
            if (surface.modifier === "blessed") {
                this._applyBlessedSurfaceEffect(surface, unit);
            } else if (surface.modifier === "cursed") {
                this._applyCursedSurfaceEffect(surface, unit);
            }
        },

        // ─── 축복 장판 효과 (아군=버프, 적=기본 디버프) ───
        _applyBlessedSurfaceEffect(surface, unit) {
            const isAlly = (unit.teamId === surface.ownerTeam);
            if (!isAlly) return; // 적은 기본 진입 효과만 받음 (이미 적용됨)

            const fx = BLESSED_ALLY_EFFECT[surface.baseType];
            if (!fx) return;

            // HP 치유
            if (fx.healPercent && unit.heal) {
                const amount = Math.floor(unit.mhp * fx.healPercent / 100);
                unit.heal(amount);
            }
            // 디버프 정화 (T1 이하 디버프 해제)
            if (fx.purify && unit._states) {
                const toRemove = [];
                for (const s of unit._states) {
                    const meta = parseStateMeta(s.id);
                    // 디버프 판별: tier=1 또는 decaying/immobile
                    if (meta.tier === 1 || meta.decaying || meta.immobile) {
                        toRemove.push(s.id);
                    }
                }
                for (const sid of toRemove) unit.removeState(sid);
            }
            // 면역 상태 부여 차단 (해당 상태가 있으면 제거)
            if (fx.immuneState) {
                for (const sid of fx.immuneState) {
                    if (unit.hasState(sid)) unit.removeState(sid);
                }
            }
            // 방어 버프 (간이: DEF +20% 효과를 임시 버프로)
            if (fx.buffDef && unit.param) {
                // 임시 DEF 버프 — RMMZ의 addBuff 사용 가능 시
                // 여기서는 간단히 축복기름 위에 있는 동안 DEF 증가를 trait로 처리하는 대신
                // 축복 효과를 별도 상태로 관리 (향후 확장 포인트)
                console.log(`[SrpgField] ${unit.name}: 축복기름 방어 버프`);
            }
            // Haste(AGI 버프)
            if (fx.buffAgi) {
                console.log(`[SrpgField] ${unit.name}: 축복 Haste 효과`);
            }

            // 축복 오버레이 추가 효과
            if (surface.overlay !== "none") {
                const ovFx = BLESSED_OVERLAY_ALLY[surface.overlay];
                if (ovFx) {
                    if (ovFx.buffAgi) {
                        console.log(`[SrpgField] ${unit.name}: 축복 오버레이 Haste`);
                    }
                    if (ovFx.buffMdf) {
                        console.log(`[SrpgField] ${unit.name}: 축복 오버레이 마법방어↑`);
                    }
                }
            }
        },

        // ─── 저주 장판 효과 (적/아군 구분 없이 강화 디버프) ───
        _applyCursedSurfaceEffect(surface, unit) {
            const fx = CURSED_EFFECT[surface.baseType];
            if (!fx) return;

            // 추가 상태 부여 (부패, 균열 등)
            if (fx.extraState) {
                unit._addStateCore(fx.extraState, 999);
                this._trackFieldState(unit, fx.extraState, surface.id);
            }
            // 강화 DoT: 해당 상태의 DoT가 2배 (데미지 계산 시 modifier로 처리)
            if (fx.enhancedDoT) {
                // 업화: 화상 상태(32)의 HRG 트레잇이 -10% → 저주 시 -20% 효과
                // 구현: unit에 cursedDoTMultiplier 플래그 세팅
                if (!unit._cursedFieldEffects) unit._cursedFieldEffects = {};
                unit._cursedFieldEffects.dotMultiplier = fx.enhancedDoT;
            }
            // 상태이상 저항↓
            if (fx.debuffStateRes) {
                if (!unit._cursedFieldEffects) unit._cursedFieldEffects = {};
                unit._cursedFieldEffects.stateResDown = true;
            }
            // 이동 시 폭발 확률 (저주기름)
            if (fx.explosionOnMove) {
                if (!unit._cursedFieldEffects) unit._cursedFieldEffects = {};
                unit._cursedFieldEffects.explosionOnMove = true;
            }

            // 저주 오버레이 효과
            if (surface.overlay !== "none") {
                const ovFx = CURSED_OVERLAY_EFFECT[surface.overlay];
                if (ovFx) {
                    if (ovFx.instantT2) {
                        // 즉시 T2 상태 부여 (저항 무시)
                        unit._addStateCore(ovFx.instantT2, 999);
                        this._trackFieldState(unit, ovFx.instantT2, surface.id);
                    }
                }
            }
        },

        // ─── 구름(Cloud) 효과 적용 ───
        _applyCloudEffectToUnit(cloud, unit) {
            // 1. 기본 진입 상태
            const entryState = CLOUD_ENTRY_STATE[cloud.baseType];
            if (entryState) {
                unit._addStateCore(entryState, 999);
                this._trackFieldState(unit, entryState, cloud.id);
            }

            // 2. 오버레이 추가 효과 (구름은 electrified만)
            if (cloud.overlay === "electrified") {
                unit._addStateCore(37, 999); // 감전
                this._trackFieldState(unit, 37, cloud.id);
            }

            // 3. 축복/저주 분기
            if (cloud.modifier === "blessed") {
                this._applyBlessedCloudEffect(cloud, unit);
            } else if (cloud.modifier === "cursed") {
                this._applyCursedCloudEffect(cloud, unit);
            }
        },

        // ─── 축복 구름 효과 (아군=버프, 적=기본 디버프) ───
        _applyBlessedCloudEffect(cloud, unit) {
            const isAlly = (unit.teamId === cloud.ownerTeam);
            if (!isAlly) return;

            const fx = BLESSED_CLOUD_ALLY[cloud.baseType];
            if (!fx) return;

            if (fx.healPercent && unit.heal) {
                const amount = Math.floor(unit.mhp * fx.healPercent / 100);
                unit.heal(amount);
            }
            if (fx.immuneState) {
                for (const sid of fx.immuneState) {
                    if (unit.hasState(sid)) unit.removeState(sid);
                }
            }
            if (fx.stealth) {
                // 축복 연기 은신: 비은신 유닛에게 은신 부여
                if (!unit._hidden && !unit.isObject) {
                    unit._hidden = true;
                    unit._hideAgi = unit.agi;
                    unit._hideSkill = false; // 행동 은신 수준 (스킬 은신보다 낮음)
                    unit.refreshTint(); // 투명 처리
                    console.log(`[SrpgField] ${unit.name}: 축복연기 은신 부여`);
                }
            }
        },

        // ─── 저주 구름 효과 (적/아군 무관) ───
        _applyCursedCloudEffect(cloud, unit) {
            const fx = CURSED_CLOUD_EFFECT[cloud.baseType];
            if (!fx) return;

            if (fx.extraState) {
                unit._addStateCore(fx.extraState, 999);
                this._trackFieldState(unit, fx.extraState, cloud.id);
            }
            if (fx.enhancedDoT) {
                if (!unit._cursedFieldEffects) unit._cursedFieldEffects = {};
                unit._cursedFieldEffects.dotMultiplier = fx.enhancedDoT;
            }
            if (fx.dotPercent && unit.heal) {
                // 직접 HP 피해 (저주 폭풍)
                const dmg = Math.floor(unit.mhp * fx.dotPercent / 100);
                unit.applyDamage(dmg, 1, null);
            }
            if (fx.silence) {
                console.log(`[SrpgField] ${unit.name}: 저주연기 질식`);
            }

            // 저주 오버레이 (구름)
            if (cloud.overlay === "electrified") {
                const ovFx = CURSED_OVERLAY_EFFECT.electrified;
                if (ovFx && ovFx.instantT2) {
                    unit._addStateCore(ovFx.instantT2, 999);
                    this._trackFieldState(unit, ovFx.instantT2, cloud.id);
                }
            }
        },

        // ─── 유닛 이동 완료 후 장판 상태 체크 ───
        checkUnitFieldStatus(unit) {
            const uid = unit.id || unit.name;
            const tracked = this._fieldAppliedStates[uid];
            if (!tracked) return;

            const ux = unit.event ? unit.event.x : (unit.x || 0);
            const uy = unit.event ? unit.event.y : (unit.y || 0);

            for (let i = tracked.length - 1; i >= 0; i--) {
                const entry = tracked[i];
                // 해당 장판이 아직 존재하는지
                const field = this._surfaces.find(s => s.id === entry.fieldId)
                           || this._clouds.find(c => c.id === entry.fieldId);

                if (!field || !field.containsTile(ux, uy)) {
                    // 장판 밖으로 나감 → 상태 턴을 기본값으로 재설정
                    const stateData = (typeof $dataStates !== 'undefined') ? $dataStates[entry.stateId] : null;
                    if (stateData && unit._states) {
                        const existing = unit._states.find(s => s.id === entry.stateId);
                        if (existing) {
                            existing.turnsLeft = stateData.minTurns || 2;
                            console.log(`[SrpgField] ${unit.name}: 장판 이탈 → 상태 ${entry.stateId} 잔여 ${existing.turnsLeft}턴`);
                        }
                    }
                    tracked.splice(i, 1);
                }
            }

            if (tracked.length === 0) delete this._fieldAppliedStates[uid];

            // 장판 밖으로 나온 유닛의 저주 필드 효과 정리
            if (unit._cursedFieldEffects) {
                // 해당 유닛이 저주 장판 위에 아직 있는지 확인
                const stillOnCursed = this._surfaces.some(s =>
                    s.modifier === "cursed" && s.containsTile(ux, uy)
                ) || this._clouds.some(c =>
                    c.modifier === "cursed" && c.containsTile(ux, uy)
                );
                if (!stillOnCursed) {
                    delete unit._cursedFieldEffects;
                }
            }

            // 새 장판 위에 진입한 경우 → 즉시 효과 적용
            const surfaceHere = this.getSurfaceAt(ux, uy);
            if (surfaceHere) {
                this._applySurfaceEffectToUnit(surfaceHere, unit);
            }

            // 구름 위 진입 효과도 적용
            const cloudHere = this.getCloudAt(ux, uy);
            if (cloudHere) {
                this._applyCloudEffectToUnit(cloudHere, unit);
            }
        },

        // ─── 장판 상태 추적 헬퍼 ───
        _trackFieldState(unit, stateId, fieldId) {
            const uid = unit.id || unit.name;
            if (!this._fieldAppliedStates[uid]) this._fieldAppliedStates[uid] = [];
            const arr = this._fieldAppliedStates[uid];
            if (!arr.some(e => e.stateId === stateId && e.fieldId === fieldId)) {
                arr.push({ stateId, fieldId });
            }
        },

        _cleanFieldStates(fieldId) {
            for (const uid of Object.keys(this._fieldAppliedStates)) {
                const arr = this._fieldAppliedStates[uid];
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (arr[i].fieldId === fieldId) arr.splice(i, 1);
                }
                if (arr.length === 0) delete this._fieldAppliedStates[uid];
            }
        },

        // ─── 같은 타일에 기존 장판이 있을 때 처리 ───
        // 새 장판의 원소로 기존 장판에 원소 반응 적용. 반응 없으면 후발 우선.
        resolveOverlap(newSurface) {
            const newElement = BASE_TO_ELEMENT[newSurface.baseType] || 0;
            const overlapping = [];
            for (const existing of this._surfaces) {
                if (existing.id === newSurface.id) continue;
                for (const tile of newSurface.tiles) {
                    if (existing.containsTile(tile.x, tile.y)) {
                        overlapping.push(existing);
                        break;
                    }
                }
            }
            for (const existing of overlapping) {
                // 같은 기반 타입이면 duration 리프레시 후 새 것 취소
                if (existing.baseType === newSurface.baseType) {
                    existing.duration = Math.max(existing.duration, newSurface.duration);
                    // 새 장판의 변형자가 다르면 적용
                    if (newSurface.modifier !== "normal" && existing.modifier !== newSurface.modifier) {
                        existing.modifier = newSurface.modifier;
                        existing.refreshVisual();
                    }
                    this.removeSurface(newSurface.id);
                    return; // 새 장판 흡수됨
                }
                // 원소 반응 시도
                if (newElement > 0) {
                    const result = this.applyElementToSurface(existing, newElement, newSurface.ownerId);
                    if (result && result.type !== "rejected") {
                        continue; // 반응 처리됨 (소멸/변환 등)
                    }
                }
                // 반응 없음 → 후발 우선 (기존 제거)
                this.removeSurface(existing.id);
            }
        },

        // ─── 디버그 ───
        debugList() {
            console.log(`[SrpgField] === 장판 ${this._surfaces.length}개, 구름 ${this._clouds.length}개 ===`);
            for (const s of this._surfaces) {
                console.log(`  [S${s.id}] ${s.name} base=${s.baseType} ov=${s.overlay} mod=${s.modifier} dur=${s.duration}/${s.maxDuration} tiles=${s.tiles.length}`);
            }
            for (const c of this._clouds) {
                console.log(`  [C${c.id}] ${c.name} base=${c.baseType} ov=${c.overlay} mod=${c.modifier} dur=${c.duration}/${c.maxDuration} tiles=${c.tiles.length}`);
            }
        },

        // ═════════════════════════════════════════════════════════════════════
        //  원소 반응 엔진 (Phase 4)
        //  설계서 §8, §11의 4단계 처리: 저주차단 → L3 → L2 → L1
        // ═════════════════════════════════════════════════════════════════════

        // ─── 메인: 타일에 원소 적용 ───
        // 해당 타일의 장판+구름 모두에 반응 적용
        applyElementToTile(x, y, elementId, casterId) {
            const surface = this.getSurfaceAt(x, y);
            const cloud   = this.getCloudAt(x, y);
            const results = [];

            if (surface) {
                const r = this.applyElementToSurface(surface, elementId, casterId);
                if (r) results.push(r);
            }
            if (cloud) {
                const r = this.applyElementToCloud(cloud, elementId, casterId);
                if (r) results.push(r);
            }
            return results;
        },

        // ─── 장판 + 원소 반응 (4단계) ───
        applyElementToSurface(surface, elementId, casterId) {
            // 1. 저주 장판 → 빛/어둠 이외 전부 거부
            if (surface.modifier === "cursed" && elementId !== EL.LIGHT && elementId !== EL.DARK) {
                console.log(`[SrpgField] 저주 반응 거부: ${surface.name} + 원소${elementId}`);
                return { type: "rejected", surface };
            }

            // 2. L3: 빛(8)/어둠(9) → 변형자 전환만
            if (elementId === EL.LIGHT || elementId === EL.DARK) {
                return this._switchModifier(surface, elementId);
            }

            // 3. L2: 천둥(4)/얼음(3) → 오버레이 (액체만)
            if (elementId === EL.THUNDER && surface.canElectrify()) {
                return this._switchOverlay(surface, "electrified");
            }
            if (elementId === EL.ICE && surface.canFreeze()) {
                return this._switchOverlay(surface, "frozen");
            }
            // 비액체에 대한 천둥/얼음 특수반응 → L1 fallthrough
            // (예: 기름+천둥=스파크폭발, 화염+얼음=소멸+수증기)

            // 4. L1: 기반 타입 변환/소멸
            return this._transformBase(surface, elementId, casterId);
        },

        // ─── L3: 변형자 전환 ───
        _switchModifier(field, elementId) {
            const oldMod = field.modifier;
            if (elementId === EL.LIGHT) {
                if (field.modifier === "cursed")  field.modifier = "normal";   // 정화
                else if (field.modifier === "normal") field.modifier = "blessed";
                // blessed + 빛 = 유지
            }
            if (elementId === EL.DARK) {
                if (field.modifier === "blessed") field.modifier = "normal";   // 상쇄
                else if (field.modifier === "normal") field.modifier = "cursed";
                // cursed + 어둠 = 유지
            }
            if (field.modifier !== oldMod) {
                field.refreshVisual();
                console.log(`[SrpgField] L3 변형자: ${field.name} (${oldMod}→${field.modifier})`);
            }
            return { type: "modifier_change", field, oldModifier: oldMod };
        },

        // ─── L2: 오버레이 전환 ───
        _switchOverlay(surface, newOverlay) {
            const oldOv = surface.overlay;
            if (oldOv === newOverlay) return null; // 이미 같음 → 유지
            surface.overlay = newOverlay;
            surface.refreshVisual();
            console.log(`[SrpgField] L2 오버레이: ${surface.name} (${oldOv}→${newOverlay})`);
            return { type: "overlay_change", surface, oldOverlay: oldOv };
        },

        // ─── L1: 기반 타입 변환/소멸 반응 테이블 ───
        // action: "none"|"destroy"|"transform"|"explode"|"explode_transform"|"spread"
        _BASE_REACTIONS: {
            fire: {
                [EL.WATER]: { action:"destroy", cloud:"steam" },
                [EL.ICE]:   { action:"destroy", cloud:"steam" },
                [EL.POISON]:{ action:"explode" },
                [EL.WIND]:  { action:"spread" },
            },
            water: {
                [EL.FIRE]:  { action:"destroy", cloud:"steam" },
                [EL.EARTH]: { action:"transform", resultBase:"mud" },
                [EL.WIND]:  { action:"spread" },
            },
            blood: {
                [EL.FIRE]:  { action:"destroy", cloud:"steam" },
            },
            poison: {
                [EL.FIRE]:  { action:"explode_transform", resultBase:"fire", cloud:"poisoncloud" },
                [EL.WATER]: { action:"destroy" },
                [EL.WIND]:  { action:"destroy", cloud:"poisoncloud" },
            },
            oil: {
                [EL.FIRE]:    { action:"explode_transform", resultBase:"fire", cloud:"smoke" },
                [EL.WATER]:   { action:"transform", resultBase:"water" },
                [EL.THUNDER]: { action:"explode" },
            },
            mud: {
                [EL.FIRE]:  { action:"transform", resultBase:"hardened" },
                [EL.WATER]: { action:"transform", resultBase:"water" },
                [EL.WIND]:  { action:"destroy", cloud:"dust" },
            },
            web: {
                [EL.FIRE]:  { action:"transform", resultBase:"fire" },
                [EL.WATER]: { action:"destroy" },
            },
            lava: {
                [EL.WATER]: { action:"transform", resultBase:"mud", cloud:"smoke" },
            },
        },

        // ─── L1: 기반 변환 실행 ───
        _transformBase(surface, elementId, casterId) {
            const table = this._BASE_REACTIONS[surface.baseType];
            if (!table || !table[elementId]) return null; // 반응 없음

            const reaction = table[elementId];
            const result = { type: reaction.action, surface, elementId };

            switch (reaction.action) {
                case "destroy":
                    // 장판 소멸 + 구름 부산물
                    if (reaction.cloud) {
                        this.createCloud({
                            baseType: reaction.cloud,
                            tiles: [...surface.tiles],
                            duration: 2,
                            ownerId: surface.ownerId,
                            ownerTeam: surface.ownerTeam,
                            modifier: surface.modifier === "cursed" ? "normal" : surface.modifier,
                        });
                        result.byproductCloud = reaction.cloud;
                    }
                    this.removeSurface(surface.id);
                    console.log(`[SrpgField] L1 소멸: ${surface.name} → ${reaction.cloud || "없음"}`);
                    break;

                case "transform":
                    // 기반 타입 변경 (오버레이/변형자는 유지? 기반이 변하면 오버레이 리셋)
                    const oldBase = surface.baseType;
                    surface.baseType = reaction.resultBase;
                    // 새 기반이 오버레이 불가능하면 오버레이 해제
                    if (surface.overlay !== "none") {
                        if (surface.overlay === "electrified" && !ELECTRIFIABLE_BASES.has(surface.baseType)) {
                            surface.overlay = "none";
                        }
                        if (surface.overlay === "frozen" && !FREEZABLE_BASES.has(surface.baseType)) {
                            surface.overlay = "none";
                        }
                    }
                    surface.animName = SURFACE_ANIM_NAME[surface.baseType] || surface.animName;
                    surface.refreshVisual();
                    // 구름 부산물
                    if (reaction.cloud) {
                        this.createCloud({
                            baseType: reaction.cloud,
                            tiles: [...surface.tiles],
                            duration: 2,
                            ownerId: surface.ownerId,
                            ownerTeam: surface.ownerTeam,
                        });
                        result.byproductCloud = reaction.cloud;
                    }
                    console.log(`[SrpgField] L1 변환: ${oldBase}→${surface.baseType}`);
                    break;

                case "explode":
                    // 폭발: 장판 유지 + 범위 내 즉시 피해 (피해 적용은 SM에서)
                    result.explodeTiles = [...surface.tiles];
                    console.log(`[SrpgField] L1 폭발: ${surface.name} (범위 ${surface.tiles.length}타일)`);
                    break;

                case "explode_transform":
                    // 폭발 + 기반 변환 + 구름
                    result.explodeTiles = [...surface.tiles];
                    surface.baseType = reaction.resultBase;
                    surface.overlay = "none"; // 폭발 시 오버레이 리셋
                    surface.animName = SURFACE_ANIM_NAME[surface.baseType] || surface.animName;
                    surface.refreshVisual();
                    if (reaction.cloud) {
                        this.createCloud({
                            baseType: reaction.cloud,
                            tiles: [...surface.tiles],
                            duration: 2,
                            ownerId: surface.ownerId,
                            ownerTeam: surface.ownerTeam,
                        });
                        result.byproductCloud = reaction.cloud;
                    }
                    console.log(`[SrpgField] L1 폭발변환: →${surface.baseType} + ${reaction.cloud || ""}`);
                    break;

                case "spread":
                    // 확산: 장판 범위 +1 (인접 타일 추가)
                    this._spreadField(surface);
                    console.log(`[SrpgField] L1 확산: ${surface.name} → ${surface.tiles.length}타일`);
                    break;
            }

            return result;
        },

        // ─── 구름 + 원소 반응 ───
        _CLOUD_REACTIONS: {
            steam: {
                [EL.ICE]:     { action:"destroy" },
                [EL.THUNDER]: { action:"overlay", overlay:"electrified" },
                [EL.WIND]:    { action:"destroy" },
            },
            firecloud: {
                [EL.WATER]:  { action:"transform", resultBase:"steam" },
                [EL.ICE]:    { action:"transform", resultBase:"steam" },
                [EL.POISON]: { action:"explode" },
            },
            poisoncloud: {
                [EL.FIRE]:   { action:"explode_destroy" },
                [EL.WATER]:  { action:"destroy" },
                [EL.WIND]:   { action:"spread" },
            },
            smoke: {
                [EL.WATER]:  { action:"destroy" },
                [EL.WIND]:   { action:"destroy" },
            },
            snow: {
                [EL.FIRE]:   { action:"transform", resultBase:"steam" },
                [EL.WIND]:   { action:"spread" },
            },
            dust: {
                [EL.FIRE]:   { action:"explode_destroy" },
                [EL.WATER]:  { action:"destroy" },
                [EL.WIND]:   { action:"spread" },
            },
            storm: {
                [EL.FIRE]:   { action:"transform", resultBase:"firecloud" },
                [EL.WATER]:  { action:"enhance_surface", surfaceBase:"water" }, // +물 → 확장+지면수면
                [EL.ICE]:    { action:"transform_surface", resultBase:"snow", surfaceBase:"water", surfaceOverlay:"frozen" }, // +얼음 → 눈구름+지면빙판
                [EL.THUNDER]:{ action:"enhance" }, // 뇌우(낙뢰)
                [EL.WIND]:   { action:"spread" }, // 확산
                [EL.POISON]: { action:"transform", resultBase:"poisoncloud" }, // 독풍
            },
            bloodcloud: {
                [EL.THUNDER]: { action:"overlay", overlay:"electrified" },
                [EL.WIND]:    { action:"destroy" },
            },
        },

        applyElementToCloud(cloud, elementId, casterId) {
            // 저주 구름도 빛/어둠 외 거부
            if (cloud.modifier === "cursed" && elementId !== EL.LIGHT && elementId !== EL.DARK) {
                return { type: "rejected", cloud };
            }
            // L3: 빛/어둠 → 변형자 전환
            if (elementId === EL.LIGHT || elementId === EL.DARK) {
                return this._switchModifier(cloud, elementId);
            }
            // 구름 반응 테이블
            const table = this._CLOUD_REACTIONS[cloud.baseType];
            if (!table || !table[elementId]) return null;
            const reaction = table[elementId];
            const result = { type: reaction.action, cloud, elementId };

            switch (reaction.action) {
                case "destroy":
                    this.removeCloud(cloud.id);
                    break;
                case "transform":
                    cloud.baseType = reaction.resultBase;
                    cloud.overlay = "none";
                    cloud.animName = CLOUD_ANIM_NAME[cloud.baseType] || cloud.animName;
                    cloud.refreshVisual();
                    break;
                case "overlay":
                    if (cloud.canElectrify()) {
                        cloud.overlay = reaction.overlay;
                        cloud.refreshVisual();
                    }
                    break;
                case "explode_destroy":
                    result.explodeTiles = [...cloud.tiles];
                    this.removeCloud(cloud.id);
                    break;
                case "spread":
                    this._spreadField(cloud);
                    break;
                case "enhance":
                    // 폭풍+천둥 = 뇌우 (턴 연장 + 범위 피해)
                    cloud.duration = Math.min(cloud.duration + 2, cloud.maxDuration + 2);
                    result.enhanced = true;
                    break;
                case "enhance_surface":
                    // 구름 유지 + 지면에 장판 생성 (폭풍+물 → 확장+지면수면)
                    cloud.duration = Math.min(cloud.duration + 1, cloud.maxDuration + 1);
                    if (reaction.surfaceBase) {
                        this.createSurface({
                            baseType: reaction.surfaceBase,
                            tiles: [...cloud.tiles],
                            duration: 3,
                            ownerId: cloud.ownerId,
                            ownerTeam: cloud.ownerTeam,
                        });
                        result.surfaceCreated = reaction.surfaceBase;
                    }
                    break;
                case "transform_surface":
                    // 구름 변환 + 지면에 장판 생성 (폭풍+얼음 → 눈구름+빙판)
                    cloud.baseType = reaction.resultBase;
                    cloud.overlay = "none";
                    cloud.animName = CLOUD_ANIM_NAME[cloud.baseType] || cloud.animName;
                    cloud.refreshVisual();
                    if (reaction.surfaceBase) {
                        const surfOpts = {
                            baseType: reaction.surfaceBase,
                            tiles: [...cloud.tiles],
                            duration: 3,
                            ownerId: cloud.ownerId,
                            ownerTeam: cloud.ownerTeam,
                        };
                        if (reaction.surfaceOverlay) surfOpts.overlay = reaction.surfaceOverlay;
                        this.createSurface(surfOpts);
                        result.surfaceCreated = reaction.surfaceBase;
                    }
                    break;
            }
            return result;
        },

        // ─── 확산 (바람 등) ───
        _spreadField(field) {
            const newTiles = [];
            for (const tile of field.tiles) {
                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = tile.x + dx, ny = tile.y + dy;
                    const key = `${nx},${ny}`;
                    if (!field.tileSet.has(key)) {
                        newTiles.push({ x: nx, y: ny });
                        field.tileSet.add(key);
                    }
                }
            }
            field.tiles.push(...newTiles);
        },
    };

