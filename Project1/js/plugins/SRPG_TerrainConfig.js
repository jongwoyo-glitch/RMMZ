//=============================================================================
// SRPG_TerrainConfig.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc SRPG 지형 태그 & 지역 ID 설정 테이블 v2.0
 * @author Studio
 * @orderAfter SRPG_Core
 *
 * @help
 * ============================================================================
 * SRPG 지형 태그 & 지역 ID 설정  v2.0
 * ============================================================================
 *
 * v2.0: Terrain Tag와 Region ID의 역할을 교환했습니다.
 *
 * ── Terrain Tag (타일셋 이미지 고유 물리 성질, 0~15) ──
 * 타일셋 이미지에 종속되는 영구 속성입니다.
 *   - 원소 장판: 전투 시작 시 해당 타일에 자동으로 영구 장판 생성
 *     (물길→물웅덩이, 독샘→독웅덩이, 용암→불구덩이 등)
 *   - 엄폐물(cover): 직사 투사체 차단, 곡사 통과, 은신 보정
 *   - 폐쇄벽(wall): 직사/곡사 투사체 모두 차단, 시야 차단
 *   - 수풀(bush): 시야 차단, 은신 보정
 *
 * ── Region ID (맵별 오버레이, 0~255) ──
 * 맵 디자이너가 자유롭게 칠하는 고저차 요소입니다.
 *   - 낭떠러지: 이동불가, 투사체는 모두 통과
 *   - 고저차: 타일 높이 레벨 (elevation 0~4)
 *   - 계단: 인접 고도를 연결하는 타일
 *
 * ── 사용 방법 ──
 * 1. 아래 플러그인 파라미터에서 각 번호별 설정을 정의
 * 2. RMMZ 에디터의 타일셋 편집에서 Terrain Tag 할당 (원소/장애물)
 * 3. 맵 편집에서 Region ID로 고저차/낭떠러지 지정
 * 4. RMMZStudio에서는 팔레트 UI로 더 편리하게 편집 가능
 *
 * SRPG_Core가 이 플러그인의 설정을 자동으로 읽어서
 * 투사체 차단/시야/은신/고저차/장판 생성을 처리합니다.
 *
 * @param TerrainTags
 * @text ── 지형 태그 설정 (0~15) ──
 * @type struct<TerrainDef>[]
 * @default ["{\"tag\":\"0\",\"name\":\"일반\",\"terrainType\":\"none\",\"element\":\"\"}","{\"tag\":\"1\",\"name\":\"물길\",\"terrainType\":\"surface\",\"element\":\"water\"}","{\"tag\":\"2\",\"name\":\"독샘\",\"terrainType\":\"surface\",\"element\":\"poison\"}","{\"tag\":\"3\",\"name\":\"용암\",\"terrainType\":\"surface\",\"element\":\"fire\"}","{\"tag\":\"4\",\"name\":\"얼음\",\"terrainType\":\"surface\",\"element\":\"ice\"}","{\"tag\":\"5\",\"name\":\"기름\",\"terrainType\":\"surface\",\"element\":\"oil\"}","{\"tag\":\"6\",\"name\":\"축복\",\"terrainType\":\"surface\",\"element\":\"blessed\"}","{\"tag\":\"7\",\"name\":\"저주\",\"terrainType\":\"surface\",\"element\":\"cursed\"}","{\"tag\":\"8\",\"name\":\"엄폐물\",\"terrainType\":\"cover\",\"element\":\"\"}","{\"tag\":\"9\",\"name\":\"폐쇄벽\",\"terrainType\":\"wall\",\"element\":\"\"}","{\"tag\":\"10\",\"name\":\"수풀\",\"terrainType\":\"bush\",\"element\":\"\"}"]
 * @desc 각 terrain tag 번호에 대한 이름과 전술 효과를 정의합니다.
 *
 * @param RegionElevations
 * @text ── 지역 ID 고저차 설정 ──
 * @type struct<RegionElevDef>[]
 * @default ["{\"regionId\":\"0\",\"name\":\"\uc911\uac04\uc9c0\ub300\",\"elevType\":\"elevation\",\"elevationLevel\":\"2\",\"isStair\":\"false\"}", "{\"regionId\":\"1\",\"name\":\"\ub0ad\ub5a0\ub7ec\uc9c0\",\"elevType\":\"cliff\",\"elevationLevel\":\"0\",\"isStair\":\"false\"}", "{\"regionId\":\"2\",\"name\":\"\uc800\uc9c0\ub300\",\"elevType\":\"elevation\",\"elevationLevel\":\"0\",\"isStair\":\"false\"}", "{\"regionId\":\"3\",\"name\":\"\uc800-\uc911 \uacc4\ub2e8\",\"elevType\":\"elevation\",\"elevationLevel\":\"1\",\"isStair\":\"true\"}", "{\"regionId\":\"5\",\"name\":\"\uc911-\uace0 \uacc4\ub2e8\",\"elevType\":\"elevation\",\"elevationLevel\":\"3\",\"isStair\":\"true\"}", "{\"regionId\":\"6\",\"name\":\"\uace0\uc9c0\ub300\",\"elevType\":\"elevation\",\"elevationLevel\":\"4\",\"isStair\":\"false\"}"]
 * @desc 특정 region ID에 고저차/낭떠러지/계단을 정의합니다.
 *
 * @param DefaultElevation
 * @text 기본 고도 레벨
 * @type number
 * @min 0
 * @max 4
 * @default 2
 * @desc Region이 지정되지 않은 타일의 기본 고도 레벨. 2=중지대
 */

/*~struct~TerrainDef:
 * @param tag
 * @text 태그 번호
 * @type number
 * @min 0
 * @max 15
 * @desc Terrain Tag 번호 (0~15)
 *
 * @param name
 * @text 이름
 * @type string
 * @desc 이 태그의 표시 이름 (주석/팔레트용)
 *
 * @param terrainType
 * @text 타입
 * @type select
 * @option 없음
 * @value none
 * @option 원소 장판
 * @value surface
 * @option 엄폐물 (직사차단, 은신보정)
 * @value cover
 * @option 폐쇄벽 (직사/곡사차단, 시야차단)
 * @value wall
 * @option 수풀 (시야차단, 은신보정)
 * @value bush
 * @default none
 * @desc 이 태그의 전술적 타입
 *
 * @param element
 * @text 원소
 * @type select
 * @option (없음)
 * @value
 * @option 물
 * @value water
 * @option 불
 * @value fire
 * @option 독
 * @value poison
 * @option 얼음
 * @value ice
 * @option 기름
 * @value oil
 * @option 축복
 * @value blessed
 * @option 저주
 * @value cursed
 * @default
 * @desc 원소 장판 타입일 때 자동 생성할 장판의 원소 (엄폐물/벽/수풀이면 무시)
 */

/*~struct~RegionElevDef:
 * @param regionId
 * @text 지역 ID
 * @type number
 * @min 0
 * @max 255
 * @desc Region ID 번호 (0=중간지대 기본값, 배치 존=200 고정)
 *
 * @param name
 * @text 이름
 * @type string
 * @desc 이 지역의 표시 이름 (주석/팔레트용)
 *
 * @param elevType
 * @text 타입
 * @type select
 * @option 낭떠러지 (이동불가, 투사체통과)
 * @value cliff
 * @option 고저차
 * @value elevation
 * @default elevation
 * @desc 이 지역의 역할
 *
 * @param elevationLevel
 * @text 고도 레벨
 * @type number
 * @min 0
 * @max 4
 * @default 2
 * @desc 고저차 레벨 (0=저지대, 1=저중계단, 2=중지대, 3=중고계단, 4=고지대)
 *
 * @param isStair
 * @text 계단 여부
 * @type boolean
 * @default false
 * @desc 이 타일이 계단(인접 고도 연결)인지 여부
 */

(() => {
    "use strict";

    const PLUGIN_NAME = "SRPG_TerrainConfig";
    const params = PluginManager.parameters(PLUGIN_NAME);

    // ─── Parse terrain tag definitions (surface/cover/wall/bush) ───
    const terrainDefs = {};  // tag(number) → { name, terrainType, element }
    try {
        const rawTags = JSON.parse(params.TerrainTags || "[]");
        for (const raw of rawTags) {
            const def = JSON.parse(raw);
            const tag = Number(def.tag);
            terrainDefs[tag] = {
                name: def.name || `Tag ${tag}`,
                terrainType: def.terrainType || "none",
                element: def.element || "",
            };
        }
    } catch (e) {
        console.error("[TerrainConfig] TerrainTags parse error:", e);
    }

    // ─── Parse region elevation definitions (cliff/elevation/stair) ───
    const regionDefs = {};  // regionId(number) → { name, elevType, elevationLevel, isStair }
    const defaultElevation = Number(params.DefaultElevation || 2);

    try {
        const rawRegions = JSON.parse(params.RegionElevations || "[]");
        for (const raw of rawRegions) {
            const def = JSON.parse(raw);
            const rid = Number(def.regionId);
            regionDefs[rid] = {
                name: def.name || `Region ${rid}`,
                elevType: def.elevType || "elevation",
                elevationLevel: Number(def.elevationLevel || 0),
                isStair: def.isStair === "true",
            };
        }
    } catch (e) {
        console.error("[TerrainConfig] RegionElevations parse error:", e);
    }

    // ─── Public API ───
    const TerrainConfig = window.TerrainConfig = {
        // 전체 정의 맵
        terrainDefs,
        regionDefs,

        // 기본 고도
        defaultElevation,

        // ════════════════════════════════════════
        // ═══ Terrain Tag 기반 API (장애물/장판) ═══
        // ════════════════════════════════════════

        // terrain tag → 정의 조회 (없으면 기본값)
        getTerrainDef(tag) {
            return terrainDefs[tag] || {
                name: `Tag ${tag}`,
                terrainType: "none",
                element: "",
            };
        },

        // terrain tag → 차단 타입 ('cover'|'wall'|null)
        getTerrainBlockType(tag) {
            const def = this.getTerrainDef(tag);
            if (def.terrainType === "cover") return "cover";
            if (def.terrainType === "wall") return "wall";
            return null;
        },

        // terrain tag → 직사 차단 여부
        terrainBlocksDirect(tag) {
            const def = this.getTerrainDef(tag);
            return def.terrainType === "cover" || def.terrainType === "wall";
        },

        // terrain tag → 곡사 차단 여부
        terrainBlocksArc(tag) {
            const def = this.getTerrainDef(tag);
            return def.terrainType === "wall";
        },

        // terrain tag → 수풀 여부
        terrainIsBush(tag) {
            const def = this.getTerrainDef(tag);
            return def.terrainType === "bush";
        },

        // terrain tag → 시야 차단 여부 (wall, bush)
        terrainBlocksVision(tag) {
            const def = this.getTerrainDef(tag);
            return def.terrainType === "wall" || def.terrainType === "bush";
        },

        // terrain tag → 은신 보정 여부 (bush, cover)
        terrainGivesStealth(tag) {
            const def = this.getTerrainDef(tag);
            return def.terrainType === "bush" || def.terrainType === "cover";
        },

        // terrain tag → 원소 장판 정의 (surface 타입만, 아니면 null)
        getTerrainSurface(tag) {
            const def = this.getTerrainDef(tag);
            if (def.terrainType !== "surface" || !def.element) return null;
            return def;
        },

        // ════════════════════════════════════════
        // ═══ Region ID 기반 API (고저차) ═══
        // ════════════════════════════════════════

        // region ID → 정의 조회 (없으면 null)
        getRegionDef(regionId) {
            return regionDefs[regionId] || null;
        },

        // region ID → 고도 레벨 (정의 없으면 defaultElevation)
        getElevationLevel(regionId) {
            const def = regionDefs[regionId];
            if (!def) return defaultElevation;
            if (def.elevType === "cliff") return 0; // cliff = 레벨 0
            return def.elevationLevel;
        },

        // region ID → 계단 여부
        isStairRegion(regionId) {
            const def = regionDefs[regionId];
            if (!def) return false;
            return def.isStair;
        },

        // region ID → 낭떠러지 여부
        isCliffRegion(regionId) {
            const def = regionDefs[regionId];
            if (!def) return false;
            return def.elevType === "cliff";
        },

        // ════════════════════════════════════════
        // ═══ 하위 호환 + 유틸 ═══
        // ════════════════════════════════════════

        // 이전 API 호환 (SrpgField._spawnTerrainSurfaces에서 사용)
        get terrainSurfaces() {
            const result = {};
            for (const [tag, def] of Object.entries(terrainDefs)) {
                if (def.terrainType === "surface" && def.element) {
                    result[tag] = def;
                }
            }
            return result;
        },

        // 이름 목록 (팔레트 UI용)
        getTerrainNames() {
            const names = {};
            for (let i = 0; i <= 15; i++) {
                const def = terrainDefs[i];
                names[i] = def ? def.name : "";
            }
            return names;
        },

        getRegionNames() {
            const names = {};
            for (const [rid, def] of Object.entries(regionDefs)) {
                names[rid] = def.name;
            }
            return names;
        },
    };

    // ─── 로그 출력 ───
    const tagCount = Object.keys(terrainDefs).length;
    const surfaceCount = Object.values(terrainDefs).filter(d => d.terrainType === 'surface').length;
    const blockCount = Object.values(terrainDefs).filter(d => d.terrainType === 'cover' || d.terrainType === 'wall').length;
    const bushCount = Object.values(terrainDefs).filter(d => d.terrainType === 'bush').length;
    const regionCount = Object.keys(regionDefs).length;
    console.log(`[TerrainConfig] v2.0 | 태그 ${tagCount}개 (장판 ${surfaceCount}, 차단 ${blockCount}, 수풀 ${bushCount}) | 지역 ${regionCount}개 (고저차) 로드 완료`);

})();
