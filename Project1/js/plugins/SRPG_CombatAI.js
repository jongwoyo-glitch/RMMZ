//=============================================================================
// SRPG_CombatAI.js — SRPG Combat AI Plugin (Dual-Layer: Ilgan/Ilji)
//=============================================================================
/*:
 * @target MZ
 * @plugindesc SRPG Combat AI with dual-layer decision system based on Saju (Four Pillars). Replaces default enemy AI with Ilgan(outer)/Ilji(inner) weighted evaluation.
 * @author GahoRok
 * @orderAfter SRPG_Core
 * @orderAfter GahoSystem
 *
 * @param debugLog
 * @text Debug Log
 * @type boolean
 * @default false
 * @desc Enable AI decision logging to console
 *
 * @help
 * ============================================================================
 * SRPG_CombatAI.js — 이중 레이어 전투 AI
 * ============================================================================
 *
 * 일간(天干) = 외적 결정: 이동, 타겟 선택, 포지셔닝
 * 일지(地支) = 내적 결정: 스킬 선택, 능력 사용
 *
 * ─── 노트태그 ───
 *   <srpgDayGan:丙>         일간 직접 지정 (한자 또는 이름)
 *   <srpgDayJi:午>          일지 직접 지정
 *   <srpgDayGanOverride:X>  사주 무시 강제 일간
 *   <srpgDayJiOverride:X>   사주 무시 강제 일지
 *   <srpgClass:phys_melee_wood>  클래스 직접 지정
 *   <srpgAI:프로필ID>       사전 정의 프로필 적용
 *   <srpgAIAggro:80>        공격성 (0~100)
 *   <srpgAIPriority:weakest> 타겟 우선순위
 *   <srpgAIRetreatHp:30>    후퇴 HP%
 *   <srpgElement:fire>      몬스터 오행 지정
 *
 * ============================================================================
 */

(function() {
'use strict';

var params = PluginManager.parameters('SRPG_CombatAI');
var DEBUG = params['debugLog'] === 'true';

// ─── 유닛별 AI 설정 (플러그인 파라미터) ─────────────────────────────
var _aiCfgData = (function() {
    try {
        return {
            actor: JSON.parse(params.ActorAIConfig || '{}'),
            enemy: JSON.parse(params.EnemyAIConfig || '{}')
        };
    } catch(e) {
        console.warn('[AI] Config parse error:', e);
        return { actor: {}, enemy: {} };
    }
})();

function _getAICfg(unit) {
    if (unit.team === 'actor' && unit.actorId)
        return _aiCfgData.actor[String(unit.actorId)] || {};
    if (unit.team === 'enemy' && unit.enemyId)
        return _aiCfgData.enemy[String(unit.enemyId)] || {};
    return {};
}

function log() {
    if (DEBUG) console.log.apply(console, ['[AI]'].concat(Array.prototype.slice.call(arguments)));
}

// ═══════════════════════════════════════════════════════════════════
//  1. 천간/지지 매핑
// ═══════════════════════════════════════════════════════════════════

var GAN_NAMES = {
    '甲':'참나무','乙':'화분','丙':'태양','丁':'등불','戊':'산맥',
    '己':'쟁기','庚':'칼날','辛':'끌','壬':'파도','癸':'물병'
};
var GAN_ELEMS = {
    '甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth',
    '己':'earth','庚':'metal','辛':'metal','壬':'water','癸':'water'
};
var GAN_YANG = {
    '甲':true,'乙':false,'丙':true,'丁':false,'戊':true,
    '己':false,'庚':true,'辛':false,'壬':true,'癸':false
};

var JI_NAMES = {
    '子':'노크탄','丑':'그란디르','寅':'프레간','卯':'플로렌',
    '辰':'레그나스','巳':'벨리스','午':'솔란','未':'큐라',
    '申':'크리시스','酉':'스펠라','戌':'에르미탄','亥':'레바'
};
var JI_ELEMS = {
    '子':'water','丑':'earth','寅':'wood','卯':'wood',
    '辰':'earth','巳':'fire','午':'fire','未':'earth',
    '申':'metal','酉':'metal','戌':'earth','亥':'water'
};

// 이름→한자 역매핑
var NAME_TO_GAN = {};
var k;
for (k in GAN_NAMES) NAME_TO_GAN[GAN_NAMES[k]] = k;
var NAME_TO_JI = {};
for (k in JI_NAMES) NAME_TO_JI[JI_NAMES[k]] = k;

function resolveGan(str) {
    if (!str) return null;
    str = str.trim();
    if (GAN_NAMES[str]) return str;
    if (NAME_TO_GAN[str]) return NAME_TO_GAN[str];
    return null;
}
function resolveJi(str) {
    if (!str) return null;
    str = str.trim();
    if (JI_NAMES[str]) return str;
    if (NAME_TO_JI[str]) return NAME_TO_JI[str];
    return null;
}

// 오행 상생/상극
var OHG = {
    GEN:  {wood:'fire', fire:'earth', earth:'metal', metal:'water', water:'wood'},
    OVR:  {wood:'earth', fire:'metal', earth:'water', metal:'wood', water:'fire'},
    CTRL: {wood:'metal', fire:'water', earth:'wood', metal:'fire', water:'earth'}
};

function elemRelation(e1, e2) {
    if (e1 === e2) return 'same';
    if (OHG.GEN[e1] === e2) return 'gen';
    if (OHG.OVR[e1] === e2) return 'ovr';
    if (OHG.CTRL[e1] === e2) return 'ctrl';
    return 'neutral';
}

// ═══════════════════════════════════════════════════════════════════
//  2. 일간 가중치 (외적 — 이동/타겟/포지셔닝)
// ═══════════════════════════════════════════════════════════════════

var ILGAN_WEIGHTS = {
    '甲': { // 정면 침투자
        advance: 2.0, retreat: 0.3, flank: 2.0,
        zocForm: 0.5, coverSeek: 0.3,
        nearest: 1.0, weakest: 0.8, isolated: 1.5,
        allyGuard: 0.3,
        rearAttack: 3.0, rearSeek: 2.5
    },
    '乙': { // 은밀한 우회자
        advance: 1.0, retreat: 1.0, flank: 3.0,
        zocForm: 0.2, zocAvoid: 2.5, coverSeek: 1.0,
        nearest: 0.3, weakest: 1.0, isolated: 2.5,
        allyGuard: 0.3,
        rearAttack: 2.5, stealth: 1.5
    },
    '丙': { // 정면 돌격자
        advance: 2.5, retreat: 0.0, flank: 0.2,
        zocForm: 0.5, coverSeek: 0.1,
        nearest: 0.5, weakest: 0.3, strongest: 2.5,
        isolated: 0.3, allyGuard: 0.2
    },
    '丁': { // 집요한 마무리꾼
        advance: 1.2, retreat: 0.5, flank: 1.0,
        zocForm: 0.3, coverSeek: 0.8,
        nearest: 0.8, weakest: 2.5, killConfirm: 3.0,
        isolated: 0.5, allyGuard: 0.3
    },
    '戊': { // 부동의 방벽
        advance: 0.1, retreat: 0.1, flank: 0.1,
        zocForm: 3.0, coverSeek: 1.5,
        nearest: 1.5, weakest: 0.5, isolated: 0.3,
        allyGuard: 2.0, stayPut: 2.5
    },
    '己': { // 헌신적 보호자
        advance: 0.3, retreat: 0.8, flank: 0.3,
        zocForm: 1.5, coverSeek: 1.0,
        nearest: 0.5, weakest: 0.5, isolated: 0.3,
        allyGuard: 3.0, allyProximity: 2.5
    },
    '庚': { // 냉혈 매복자
        advance: 0.3, retreat: 0.5, flank: 0.3,
        zocForm: 1.5, coverSeek: 2.0,
        nearest: 0.5, weakest: 2.5, killConfirm: 3.0,
        isolated: 1.0, allyGuard: 0.5,
        stayPut: 2.5, patience: 2.0
    },
    '辛': { // 인내의 저격수
        advance: 0.1, retreat: 0.5, flank: 0.2,
        zocForm: 0.3, coverSeek: 2.5,
        nearest: 0.3, weakest: 2.0, killConfirm: 2.5,
        keyTarget: 2.0, maxRange: 2.5,
        stayPut: 2.0, patience: 2.5,
        isolated: 0.5, allyGuard: 0.3
    },
    '壬': { // 자유로운 교란자
        advance: 1.0, retreat: 1.0, flank: 1.5,
        zocForm: 0.2, coverSeek: 0.5,
        nearest: 0.3, weakest: 0.5, isolated: 2.5,
        allyGuard: 0.5,
        unpredictable: 2.0, roaming: 2.0
    },
    '癸': { // 은밀한 전략가
        advance: 0.5, retreat: 1.5, flank: 1.0,
        zocForm: 0.2, coverSeek: 2.0,
        nearest: 0.3, weakest: 0.8, isolated: 1.0,
        allyGuard: 0.5,
        stealth: 3.0, debuffTarget: 2.5
    }
};

// ═══════════════════════════════════════════════════════════════════
//  3. 일지 가중치 (내적 — 스킬 선택)
// ═══════════════════════════════════════════════════════════════════

var ILJI_WEIGHTS = {
    '子': { // 교활한 책략가
        debuff: 3.0, damage: 0.5, heal: 0.3,
        buff: 0.8, aoe: 1.0,
        lowCost: 0.8, highCost: 1.2, statusStack: 2.0
    },
    '丑': { // 느긋한 지구전가
        debuff: 0.5, damage: 0.8, heal: 1.2,
        buff: 2.0, aoe: 0.5,
        lowCost: 2.5, highCost: 0.3, sustained: 2.0
    },
    '寅': { // 용맹한 일격자
        debuff: 0.2, damage: 3.0, heal: 0.1,
        buff: 0.3, aoe: 0.8,
        lowCost: 0.3, highCost: 2.0, singleTarget: 2.0
    },
    '卯': { // 다정한 치유사
        debuff: 0.2, damage: 0.3, heal: 3.0,
        buff: 2.5, aoe: 1.0,
        lowCost: 1.0, highCost: 1.0, allyLowHp: 2.5
    },
    '辰': { // 오만한 지배자
        debuff: 0.8, damage: 1.5, heal: 0.2,
        buff: 0.3, aoe: 3.0,
        lowCost: 0.5, highCost: 1.5, maxTargets: 2.5
    },
    '巳': { // 총명한 분석가
        debuff: 1.0, damage: 1.5, heal: 0.5,
        buff: 0.8, aoe: 1.0,
        lowCost: 1.0, highCost: 1.0,
        eleAdvantage: 3.0, eleDisadvantage: 0.1
    },
    '午': { // 성급한 선제자
        debuff: 0.3, damage: 1.8, heal: 0.2,
        buff: 0.5, aoe: 0.8,
        lowCost: 1.5, highCost: 0.5,
        speed: 2.5, extraAction: 3.0
    },
    '未': { // 과묵한 인내자
        debuff: 0.5, damage: 0.8, heal: 1.0,
        buff: 1.5, aoe: 0.5,
        lowCost: 1.5, highCost: 0.5,
        counter: 3.0, defensive: 2.5
    },
    '申': { // 엄격한 심판자
        debuff: 0.5, damage: 2.0, heal: 0.2,
        buff: 0.5, aoe: 0.8,
        lowCost: 0.8, highCost: 1.5,
        piercing: 3.0, guaranteed: 2.5, random: 0.2
    },
    '酉': { // 깐깐한 장인
        debuff: 1.0, damage: 1.5, heal: 0.5,
        buff: 1.0, aoe: 0.8,
        lowCost: 1.0, highCost: 1.0,
        combo: 3.0, setup: 2.0, finisher: 2.5
    },
    '戌': { // 완고한 수호자
        debuff: 0.3, damage: 0.5, heal: 1.5,
        buff: 1.5, aoe: 0.5,
        lowCost: 1.0, highCost: 1.0,
        protect: 3.0, taunt: 2.5, selfHeal: 2.0
    },
    '亥': { // 게으른 기회주의자
        debuff: 0.5, damage: 1.0, heal: 0.8,
        buff: 0.5, aoe: 0.8,
        lowCost: 2.5, highCost: 0.3,
        opportunistic: 2.5, lazy: 1.5
    }
};

// ═══════════════════════════════════════════════════════════════════
//  4. 기동력 보정 + 클래스→기동력 매핑
// ═══════════════════════════════════════════════════════════════════

var MOBILITY_MODIFIER = {
    fast:   { advance: 1.3, retreat: 1.3, flank: 1.4, coverSeek: 0.8, stayPut: 0.5, roaming: 1.3 },
    normal: {},
    slow:   { advance: 0.7, retreat: 0.6, flank: 0.5, coverSeek: 1.5, stayPut: 1.8, zocForm: 1.4, allyGuard: 1.3 }
};

var MOBILITY_MAP = {
    'phys_melee_wood': 'fast',   'phys_melee_fire': 'normal',
    'phys_melee_earth': 'slow',  'phys_melee_metal': 'normal',
    'phys_melee_water': 'fast',
    'phys_ranged_wood': 'normal','phys_ranged_fire': 'normal',
    'phys_ranged_earth': 'slow', 'phys_ranged_metal': 'normal',
    'phys_ranged_water': 'fast',
    'magic_atk_wood': 'fast',    'magic_atk_fire': 'normal',
    'magic_atk_earth': 'slow',   'magic_atk_metal': 'fast',
    'magic_atk_water': 'normal',
    'magic_sup_wood': 'normal',  'magic_sup_fire': 'normal',
    'magic_sup_earth': 'normal', 'magic_sup_metal': 'normal',
    'magic_sup_water': 'normal'
};

// ═══════════════════════════════════════════════════════════════════
//  4-B. 오행 스킬 친화도 — 스킬의 오행이 전투 스타일에 미치는 영향
// ═══════════════════════════════════════════════════════════════════
// 스킬 자체의 오행 태그에 따른 스킬 카테고리 가중치.
// 일지의 오행 친화와 결합하여 "이 일지가 이 오행의 스킬을 어떻게 쓸지" 결정.

var ELEMENT_SKILL_AFFINITY = {
    wood: {
        // 목: 연타, 관통, 기동형 — 빠르고 여러 번 치는 스킬
        multiHit: 2.0, piercing: 1.8, combo: 1.5, singleTarget: 1.5,
        lowCost: 1.5, sustained: 1.3,
        aoe: 0.5, highCost: 0.5, setup: 0.5
    },
    fire: {
        // 화: 범위, 누킹, 폭발 — 크고 강하게 한 방
        aoe: 2.0, damage: 2.0, highCost: 1.8, maxTargets: 1.5,
        singleTarget: 0.5, lowCost: 0.5, combo: 0.3, sustained: 0.5
    },
    earth: {
        // 토: 버프, 방어, 지속, 설치 — 견고하고 꾸준한 스킬
        buff: 2.0, protect: 2.0, defensive: 1.8, sustained: 1.8, setup: 1.5,
        cooperative: 1.5, selfHeal: 1.3,
        damage: 0.5, aoe: 0.8
    },
    metal: {
        // 금: 치명타, 확인사살, 카운터 — 정밀하고 확실한 스킬
        critical: 2.5, guaranteed: 2.0, counter: 1.8, piercing: 1.5,
        singleTarget: 1.5, finisher: 2.0,
        aoe: 0.3, lowCost: 0.5, combo: 0.8
    },
    water: {
        // 수: 디버프, 상태이상, 변수 창출 — 교란하고 흐트러뜨리는 스킬
        debuff: 2.5, statusStack: 2.0, setup: 1.5, bonusAction: 1.5,
        stealth: 1.5, forced_move: 1.5,
        damage: 0.5, aoe: 0.8, buff: 0.3
    }
};

// 일지의 오행 매핑 (JIS 기준)
var ILJI_ELEMENT = {
    '子': 'water', '丑': 'earth', '寅': 'wood', '卯': 'wood',
    '辰': 'earth', '巳': 'fire',  '午': 'fire',  '未': 'earth',
    '申': 'metal', '酉': 'metal', '戌': 'earth', '亥': 'water'
};

// 지지 이름 ↔ 한자 변환 (가호시스템 연동)
var JI_NAME_MAP = {
    '노크탄': '子', '그란디르': '丑', '프레간': '寅', '플로렌': '卯',
    '레그나스': '辰', '벨리스': '巳', '솔란': '午', '큐라': '未',
    '크리시스': '申', '스펠라': '酉', '에르미탄': '戌', '레바': '亥'
};
var JI_TID_TO_NAME = {};
for (var jn in JI_NAME_MAP) JI_TID_TO_NAME[JI_NAME_MAP[jn]] = jn;

// ═══════════════════════════════════════════════════════════════════
//  5. 프로필→일간/일지 기본 매핑
// ═══════════════════════════════════════════════════════════════════

var PROFILE_DEFAULTS = {
    melee_fighter: { gan: '甲', ji: '寅', aggro: 80 },
    ranged_sniper: { gan: '辛', ji: '巳', aggro: 60 },
    healer:        { gan: '己', ji: '卯', aggro: 10 },
    tank:          { gan: '戊', ji: '戌', aggro: 40 },
    assassin:      { gan: '乙', ji: '申', aggro: 90 },
    mage_aoe:      { gan: '壬', ji: '辰', aggro: 70 },
    support:       { gan: '己', ji: '丑', aggro: 20 },
    berserker:     { gan: '丙', ji: '寅', aggro: 100 },
    guardian:      { gan: '戊', ji: '戌', aggro: 30 },
    ambush:        { gan: '庚', ji: '申', aggro: 70 },
    patrol:        { gan: '甲', ji: '午', aggro: 30 },
    object:        { gan: '戊', ji: '未', aggro: 0 },
    'default':     { gan: '甲', ji: '午', aggro: 50 }
};

// ═══════════════════════════════════════════════════════════════════
//  6. SrpgAI — 메인 전역 객체
// ═══════════════════════════════════════════════════════════════════

var SrpgAI = {};

// --- 노트태그 파싱 (플러그인 파라미터 → 노트태그 폴백) ---
SrpgAI.parseNotes = function(unit) {
    // 플러그인 파라미터에서 AI 설정 읽기
    var pcfg = _getAICfg(unit);

    // DB 노트태그
    var notes = '';
    if (unit._data && unit._data.note) notes = unit._data.note;
    else if (unit.note) notes = unit.note;

    // 기본값 (플러그인 파라미터로 초기화)
    var cfg = {
        ilgan: pcfg.ilgan ? resolveGan(pcfg.ilgan) : null,
        ilji: pcfg.ilji ? resolveJi(pcfg.ilji) : null,
        ilganOverride: null, iljiOverride: null,
        profile: pcfg.profile || null,
        unitClass: pcfg.unitClass || null,
        aggro: pcfg.aggro != null ? parseInt(pcfg.aggro) : -1,
        priority: pcfg.priority || null,
        retreatHp: pcfg.retreatHp != null ? parseInt(pcfg.retreatHp) : 0,
        element: pcfg.element || null,
        skillBias: pcfg.skillBias || null,
        range: pcfg.range || null,
        guardTarget: pcfg.guardTarget || null
    };

    // 노트태그로 오버라이드 (비상 수동 설정)
    var m;
    m = notes.match(/<srpgDayGan:(.+?)>/i);
    if (m) cfg.ilgan = resolveGan(m[1]);
    m = notes.match(/<srpgDayJi:(.+?)>/i);
    if (m) cfg.ilji = resolveJi(m[1]);
    m = notes.match(/<srpgDayGanOverride:(.+?)>/i);
    if (m) cfg.ilganOverride = resolveGan(m[1]);
    m = notes.match(/<srpgDayJiOverride:(.+?)>/i);
    if (m) cfg.iljiOverride = resolveJi(m[1]);
    m = notes.match(/<srpgAI:(.+?)>/i);
    if (m) cfg.profile = m[1].trim();
    m = notes.match(/<srpgClass:(.+?)>/i);
    if (m) cfg.unitClass = m[1].trim();
    m = notes.match(/<srpgAIAggro:(\d+)>/i);
    if (m) cfg.aggro = parseInt(m[1]);
    m = notes.match(/<srpgAIPriority:(.+?)>/i);
    if (m) cfg.priority = m[1].trim();
    m = notes.match(/<srpgAIRetreatHp:(\d+)>/i);
    if (m) cfg.retreatHp = parseInt(m[1]);
    m = notes.match(/<srpgElement:(.+?)>/i);
    if (m) cfg.element = m[1].trim();
    m = notes.match(/<srpgAISkillBias:(.+?)>/i);
    if (m) cfg.skillBias = m[1].trim();
    m = notes.match(/<srpgAIRange:(.+?)>/i);
    if (m) cfg.range = m[1].trim();
    m = notes.match(/<srpgAIGuard:(.+?)>/i);
    if (m) cfg.guardTarget = m[1].trim();

    return cfg;
};

// --- 일간/일지 결정 ---
SrpgAI.resolveIlganIlji = function(unit) {
    var cfg = this.parseNotes(unit);
    var gan = null, ji = null;

    // 1순위: 오버라이드
    if (cfg.ilganOverride) gan = cfg.ilganOverride;
    if (cfg.iljiOverride) ji = cfg.iljiOverride;

    // 2순위: 노트태그 직접 지정
    if (!gan && cfg.ilgan) gan = cfg.ilgan;
    if (!ji && cfg.ilji) ji = cfg.ilji;

    // 3순위: 액터 → GahoSystem 사주
    if ((!gan || !ji) && unit.actorId && typeof window.GahoSystem !== 'undefined') {
        var data = window.GahoSystem.getActorData(unit.actorId);
        if (data && data.pillars && data.pillars[1]) {
            if (!gan) gan = data.pillars[1].g ? data.pillars[1].g.tid : null;
            if (!ji)  ji  = data.pillars[1].j ? data.pillars[1].j.tid : null;
        }
    }

    // 4순위: 프로필에서 가져오기
    if ((!gan || !ji) && cfg.profile && PROFILE_DEFAULTS[cfg.profile]) {
        var pd = PROFILE_DEFAULTS[cfg.profile];
        if (!gan) gan = pd.gan;
        if (!ji)  ji  = pd.ji;
    }

    // 5순위: 몬스터 오행+음양 자동 매핑
    if (!gan || !ji) {
        var elem = cfg.element || this._deriveElemFromUnit(unit);
        var isYang = ((unit.atk || 0) + (unit.agi || 0)) > ((unit.def || 0) + (unit.mdf || 0));
        var ganMap = {
            wood_true: '甲', wood_false: '乙',
            fire_true: '丙', fire_false: '丁',
            earth_true: '戊', earth_false: '己',
            metal_true: '庚', metal_false: '辛',
            water_true: '壬', water_false: '癸'
        };
        var jiMap = {
            wood_true: '寅', wood_false: '卯',
            fire_true: '午', fire_false: '巳',
            earth_true: '辰', earth_false: '丑',
            metal_true: '申', metal_false: '酉',
            water_true: '子', water_false: '亥'
        };
        var key = elem + '_' + isYang;
        if (!gan) gan = ganMap[key] || '甲';
        if (!ji)  ji  = jiMap[key] || '午';
    }

    return { ilgan: gan, ilji: ji, cfg: cfg };
};

SrpgAI._deriveElemFromUnit = function(unit) {
    // RMMZ 속성에서 오행 파생 (간이)
    return 'wood'; // 기본값, 추후 속성 분석 확장
};

// --- 클래스 판별 ---
SrpgAI.resolveUnitClass = function(unit, cfg) {
    if (cfg && cfg.unitClass) return cfg.unitClass;

    var isMagic = (unit.mat || 0) > (unit.atk || 0);
    var isRanged = (unit.srpgAtkRange || unit.atkRange || 1) >= 3;
    var hasHeal = this._unitHasSkillType(unit, 'heal');
    var hasBuff = this._unitHasSkillType(unit, 'buff');
    var isSupport = hasHeal || hasBuff;
    var elem = (cfg && cfg.element) || this._deriveElemFromUnit(unit);

    var type;
    if (isMagic && isSupport) type = 'magic_sup';
    else if (isMagic)         type = 'magic_atk';
    else if (isRanged)        type = 'phys_ranged';
    else                      type = 'phys_melee';

    return type + '_' + elem;
};

SrpgAI._unitHasSkillType = function(unit, type) {
    if (!unit._data || !unit._data.actions) return false;
    for (var i = 0; i < unit._data.actions.length; i++) {
        var act = unit._data.actions[i];
        if (!act.skillId || typeof $dataSkills === 'undefined') continue;
        var sk = $dataSkills[act.skillId];
        if (!sk) continue;
        if (type === 'heal' && sk.damage && sk.damage.type === 3) return true;
        if (type === 'buff' && sk.effects) {
            for (var j = 0; j < sk.effects.length; j++) {
                if (sk.effects[j].code === 31 || sk.effects[j].code === 32) return true;
            }
        }
    }
    return false;
};

// --- 기동력 판별 (장비/노트태그 기반) ---
SrpgAI.resolveMobility = function(unit) {
    // 노트태그 직접 지정
    var notes = (unit._data && unit._data.note) || (unit.note) || '';
    var m = notes.match(/<srpgMobility:(fast|normal|slow)>/i);
    if (m) return m[1].toLowerCase();
    // 이동력 기반 자동 판별
    var mov = unit.mov || 4;
    if (mov >= 6) return 'fast';
    if (mov <= 3) return 'slow';
    return 'normal';
};

// --- 최종 가중치 계산 ---
SrpgAI.getFinalWeights = function(unit) {
    var ij = this.resolveIlganIlji(unit);

    // 일간 가중치 × 기동력 보정
    var baseGan = ILGAN_WEIGHTS[ij.ilgan] || ILGAN_WEIGHTS['甲'];
    var mob = this.resolveMobility(unit);
    var mobMod = MOBILITY_MODIFIER[mob] || {};
    var ganW = {};
    for (var gk in baseGan) {
        ganW[gk] = baseGan[gk] * (mobMod[gk] || 1.0);
    }

    // 일지 가중치 × 오행 스킬 친화도
    var jiElem = ILJI_ELEMENT[ij.ilji] || 'fire';
    var elemAff = ELEMENT_SKILL_AFFINITY[jiElem] || {};
    var jiW = {};
    var baseJi = ILJI_WEIGHTS[ij.ilji] || ILJI_WEIGHTS['午'];
    for (var jk in baseJi) {
        jiW[jk] = baseJi[jk] * (elemAff[jk] || 1.0);
    }
    // 오행 친화도에만 있고 일지 기본에 없는 키도 전달
    for (var ek in elemAff) {
        if (!(ek in jiW)) jiW[ek] = elemAff[ek];
    }

    return { ganWeights: ganW, jiWeights: jiW, ilgan: ij.ilgan, ilji: ij.ilji, jiElem: jiElem, cfg: ij.cfg };
};

// ═══════════════════════════════════════════════════════════════════
//  7. 타겟 점수 계산 (일간 가중)
// ═══════════════════════════════════════════════════════════════════

SrpgAI.scoreTarget = function(unit, target, gw, context) {
    var score = 0;
    var dist = SrpgGrid.dist(unit.x, unit.y, target.x, target.y);
    var tgr = target.tgr || 1;
    var hpRate = target.hp / Math.max(1, target.mhp);

    // 기본: TGR 가중
    score += tgr * 5;

    // 거리 기반 (nearest 가중치)
    var nearBonus = Math.max(0, 10 - dist) * (gw.nearest || 1.0);
    score += nearBonus;

    // 약한 적 (weakest 가중치)
    if (hpRate < 0.5) score += (1 - hpRate) * 10 * (gw.weakest || 1.0);

    // 킬 확인 (killConfirm)
    if (gw.killConfirm && target.hp <= (unit.atk || 0)) {
        score += 15 * gw.killConfirm;
    }

    // 강한 적 (strongest — 丙 전용)
    if (gw.strongest) {
        var strength = (target.atk || 0) + (target.mat || 0);
        score += (strength / 50) * gw.strongest;
    }

    // 고립된 적 (isolated)
    if (gw.isolated && context && context.enemies) {
        var nearbyAllies = 0;
        for (var i = 0; i < context.enemies.length; i++) {
            if (context.enemies[i] !== target && SrpgGrid.dist(target.x, target.y, context.enemies[i].x, context.enemies[i].y) <= 2) {
                nearbyAllies++;
            }
        }
        if (nearbyAllies === 0) score += 10 * gw.isolated;
    }

    // 배면 공격 가능 (rearAttack)
    if (gw.rearAttack && target.dir) {
        // 간이: 타겟 배면에서 접근 가능한지
        score += 5 * gw.rearAttack;
    }

    // 핵심 타겟: 힐러/지휘관 (keyTarget)
    if (gw.keyTarget && this._unitHasSkillType(target, 'heal')) {
        score += 10 * gw.keyTarget;
    }

    // 디버프 취약 타겟 (debuffTarget — 癸 전용)
    if (gw.debuffTarget && target.mdf && target.mdf < target.def) {
        score += 8 * gw.debuffTarget;
    }

    // 오행 상성 보정
    if (typeof window.GahoSystem !== 'undefined' && unit.actorId && target.actorId) {
        var aff = window.GahoSystem.getElementAffinity(unit.actorId, target.actorId);
        if (aff > 1) score *= 1.15;
        else if (aff < 1) score *= 0.85;
    }

    return score;
};

// ═══════════════════════════════════════════════════════════════════
//  8. 타일 점수 계산 (일간 가중)
// ═══════════════════════════════════════════════════════════════════

SrpgAI.scoreTile = function(unit, tile, gw, context) {
    var score = 0;

    // 공격 가능 여부
    if (tile._canAttack) score += 10;

    // 전진/후퇴 (적에 가까워지는 방향)
    if (context && context.nearestEnemy) {
        var dBefore = SrpgGrid.dist(unit.x, unit.y, context.nearestEnemy.x, context.nearestEnemy.y);
        var dAfter = SrpgGrid.dist(tile.x, tile.y, context.nearestEnemy.x, context.nearestEnemy.y);
        if (dAfter < dBefore) score += 5 * (gw.advance || 1.0);
        if (dAfter > dBefore) score += 3 * (gw.retreat || 1.0);
    }

    // 자리 유지 (stayPut)
    if (gw.stayPut && tile.x === unit.x && tile.y === unit.y) {
        score += 8 * gw.stayPut;
    }

    // 인내 (patience) — 공격 불가 시 현재 위치 유지 보너스
    if (gw.patience && !tile._canAttack && tile.x === unit.x && tile.y === unit.y) {
        score += 5 * gw.patience;
    }

    // 엄폐물 (coverSeek)
    if (gw.coverSeek && typeof SrpgGrid.hasCover === 'function' && SrpgGrid.hasCover(tile.x, tile.y)) {
        score += 5 * gw.coverSeek;
    }

    // 고지대
    if (typeof SrpgGrid.getHeight === 'function') {
        var h = SrpgGrid.getHeight(tile.x, tile.y);
        if (h > 0) score += h * 2 * (gw.coverSeek || 1.0);
    }

    // 수풀/은신 (stealth)
    if (gw.stealth && typeof SrpgGrid.hasBush === 'function' && SrpgGrid.hasBush(tile.x, tile.y)) {
        score += 5 * gw.stealth;
    }

    // 장판 위험도
    if (typeof SrpgField !== 'undefined') {
        var sf = SrpgField.getSurfaceAt(tile.x, tile.y);
        if (sf) {
            var isOwn = (unit.teamId === sf.ownerTeam);
            if (!isOwn) {
                var hazard = (sf.baseType === 'fire' || sf.baseType === 'lava') ? -10 : -5;
                score += hazard;
            } else {
                score += 2;
            }
        }
    }

    // ZoC 벽 형성 (zocForm)
    if (gw.zocForm && context && context.allies) {
        var adjAllies = 0;
        for (var i = 0; i < context.allies.length; i++) {
            if (SrpgGrid.dist(tile.x, tile.y, context.allies[i].x, context.allies[i].y) === 1) adjAllies++;
        }
        if (adjAllies > 0) score += adjAllies * 2 * gw.zocForm;
    }

    // 아군 보호 (allyGuard / allyProximity)
    if ((gw.allyGuard > 1 || gw.allyProximity) && context && context.allies) {
        var weakestAlly = null, weakestHp = 999;
        for (var j = 0; j < context.allies.length; j++) {
            var allyHpR = context.allies[j].hp / Math.max(1, context.allies[j].mhp);
            if (allyHpR < weakestHp) { weakestHp = allyHpR; weakestAlly = context.allies[j]; }
        }
        if (weakestAlly) {
            var allyDist = SrpgGrid.dist(tile.x, tile.y, weakestAlly.x, weakestAlly.y);
            if (allyDist <= 2) score += (3 - allyDist) * 3 * (gw.allyGuard || 1.0);
            if (gw.allyProximity && allyDist <= 1) score += 5 * gw.allyProximity;
        }
    }

    // 측면 우회 (flank) — 타겟의 배면 방향 타일에 보너스
    if (gw.flank > 1 && context && context.bestTarget && context.bestTarget.dir) {
        // 간이 구현: 타겟과 다른 방향에서 접근
        var tx = context.bestTarget.x, ty = context.bestTarget.y;
        var attackDist = SrpgGrid.dist(tile.x, tile.y, tx, ty);
        if (attackDist <= (unit.srpgAtkRange || unit.atkRange || 1) + 1) {
            score += 3 * gw.flank;
        }
    }

    // 교란자 랜덤 보너스 (unpredictable — 壬 전용)
    if (gw.unpredictable) {
        score += Math.random() * 5 * gw.unpredictable;
    }

    // 최대 사거리 유지 (maxRange — 辛 전용)
    if (gw.maxRange && context && context.nearestEnemy) {
        var atkRange = unit.srpgAtkRange || unit.atkRange || 1;
        var distToE = SrpgGrid.dist(tile.x, tile.y, context.nearestEnemy.x, context.nearestEnemy.y);
        if (distToE >= atkRange && distToE <= atkRange + 1) {
            score += 8 * gw.maxRange;
        }
    }

    return score;
};

// ═══════════════════════════════════════════════════════════════════
//  9. 스킬 평가 (일지 가중)
// ═══════════════════════════════════════════════════════════════════

SrpgAI.rateSkill = function(unit, skillData, jw, context) {
    var sk = skillData.skill;
    if (!sk) return skillData.rating || 5;

    var score = skillData.rating || 5;

    // 스킬 타입 분류
    var isHeal = sk.damage && sk.damage.type === 3;
    var isDamage = sk.damage && (sk.damage.type === 1 || sk.damage.type === 5);
    var isBuff = false, isDebuff = false;
    if (sk.effects) {
        for (var i = 0; i < sk.effects.length; i++) {
            var eff = sk.effects[i];
            if (eff.code === 31 || eff.code === 32) isBuff = true;  // 파라미터 증감
            if (eff.code === 21 && eff.dataId > 0) isDebuff = true; // 상태이상 부여
        }
    }

    // 범위 스킬 판별 (scope: 2=적 전체, 3=적 1~2, 4=적 1~3, 8=아군 전체 등)
    var isAoE = sk.scope && (sk.scope === 2 || sk.scope >= 3 && sk.scope <= 6);

    // MP 코스트 기준
    var costRatio = sk.mpCost / Math.max(1, unit.mmp || 100);
    var isLowCost = costRatio < 0.1;
    var isHighCost = costRatio > 0.25;

    // 일지 가중치 적용
    if (isDamage)  score *= (jw.damage || 1.0);
    if (isHeal)    score *= (jw.heal || 1.0);
    if (isBuff)    score *= (jw.buff || 1.0);
    if (isDebuff)  score *= (jw.debuff || 1.0);
    if (isAoE)     score *= (jw.aoe || 1.0);
    if (isLowCost) score *= (jw.lowCost || 1.0);
    if (isHighCost) score *= (jw.highCost || 1.0);

    // 단일 대상 선호 (寅)
    if (jw.singleTarget && sk.scope === 1) score *= jw.singleTarget;

    // 속성 상성 (巳)
    if (jw.eleAdvantage && sk.damage && sk.damage.elementId > 0) {
        score *= jw.eleAdvantage;
    }

    // 기회주의 (亥) — MP 여유로우면 가끔 강스킬
    if (jw.opportunistic && isHighCost) {
        var mpRate = unit.mp / Math.max(1, unit.mmp);
        if (mpRate > 0.7 && Math.random() < 0.3) {
            score *= jw.opportunistic;
        }
    }

    // 게으름 (亥) — 가끔 행동 안함 가중
    if (jw.lazy && Math.random() < 0.15) {
        score *= 0.1; // 이 스킬 기피 → 대기 유도
    }

    // ─── 스킬 지지(일지) 매칭 보너스 ───
    // 스킬에 <srpgJi:노크탄,프레간> 배정 시, 유닛의 일지와 매칭되면 보너스
    var skillJiTag = (sk.meta && sk.meta.srpgJi) || '';
    if (skillJiTag && context && context.ilji) {
        var jiList = skillJiTag.split(',');
        var unitJi = context.ilji;
        var matched = false;
        for (var ji = 0; ji < jiList.length; ji++) {
            var jName = jiList[ji].trim();
            // 가호 이름 → 한자 변환
            var jTid = JI_NAME_MAP[jName] || jName;
            if (jTid === unitJi) { matched = true; break; }
        }
        if (matched) {
            score *= 1.8; // 일지 매칭 보너스
        } else if (jiList.length > 0 && jiList[0] !== '') {
            score *= 0.6; // 다른 일지 전용 스킬 → 약간 기피
        }
    }

    // ─── 스킬 오행 × 일지 오행 상성 ───
    if (sk.damage && sk.damage.elementId > 0 && context && context.jiElem) {
        var skillElem = this.resolveSkillElement(sk);
        if (skillElem === context.jiElem) {
            score *= 1.3; // 같은 오행 = 친화
        }
    }

    return Math.max(1, Math.round(score));
};

// --- 스킬 오행 판별 ---
SrpgAI.resolveSkillElement = function(sk) {
    // 노트태그 우선
    if (sk.meta && sk.meta.srpgElement) return sk.meta.srpgElement.trim().toLowerCase();
    // RMMZ 속성 ID → 오행 매핑 (System.json elements 기준)
    // 1=물리, 2=화, 3=수, 4=목, 5=토, 6=금, 7=독 ...
    var elemMap = { 2: 'fire', 3: 'water', 4: 'wood', 5: 'earth', 6: 'metal' };
    if (sk.damage && sk.damage.elementId > 0) {
        return elemMap[sk.damage.elementId] || null;
    }
    return null;
};

// ═══════════════════════════════════════════════════════════════════
//  10. 레이어 결합
// ═══════════════════════════════════════════════════════════════════

SrpgAI.combineScores = function(ganScore, jiScore, context) {
    var gW = 0.5, jW = 0.5;

    if (context && context.noEnemyInRange) {
        gW = 0.8; jW = 0.2;
    }
    if (context && context.skillCount >= 4) {
        gW = 0.3; jW = 0.7;
    }

    return ganScore * gW + jiScore * jW;
};

// ═══════════════════════════════════════════════════════════════════
//  11. 메인 결정 함수 — SM._enemyDecide() 교체
// ═══════════════════════════════════════════════════════════════════

SrpgAI.decide = function(SM, unit) {
    var weights = this.getFinalWeights(unit);
    var gw = weights.ganWeights;
    var jw = weights.jiWeights;
    var cfg = weights.cfg;

    log(unit.name, '일간=' + weights.ilgan + '(' + (GAN_NAMES[weights.ilgan]||'?') + ')',
        '일지=' + weights.ilji + '(' + (JI_NAMES[weights.ilji]||'?') + ')');

    // ─── 컨텍스트 수집 ───
    var allHostiles = [];
    var allAllies = [];
    var allUnits = SM._units || [];
    for (var i = 0; i < allUnits.length; i++) {
        var u = allUnits[i];
        if (!u || !u.isAlive() || u === unit) continue;
        if (u.isObject) continue;
        if (unit.isHostileTo(u)) {
            // 시야 체크
            if (typeof SrpgVision !== 'undefined' && !SrpgVision.isVisibleToEnemy(u, unit)) continue;
            allHostiles.push(u);
        } else {
            allAllies.push(u);
        }
    }

    if (allHostiles.length === 0) {
        log(unit.name, '적 없음 → 대기');
        return { type: 'wait' };
    }

    // 가장 가까운 적
    var nearestEnemy = null, minDist = 9999;
    for (var ne = 0; ne < allHostiles.length; ne++) {
        var d = SrpgGrid.dist(unit.x, unit.y, allHostiles[ne].x, allHostiles[ne].y);
        if (d < minDist) { minDist = d; nearestEnemy = allHostiles[ne]; }
    }

    var context = {
        enemies: allHostiles,
        allies: allAllies,
        nearestEnemy: nearestEnemy,
        noEnemyInRange: true,
        skillCount: 0,
        bestTarget: null,
        ilji: weights.ilji,
        jiElem: weights.jiElem
    };

    // ─── 일지 레이어: 스킬 선택 ───
    var selectedAction = SM._selectEnemySkill(unit);
    var useSkillId = selectedAction ? selectedAction.skillId : 0;
    var useSkill = selectedAction ? selectedAction.skill : null;

    // 스킬 rating을 일지 가중치로 보정
    if (unit._data && unit._data.actions) {
        var skillCandidates = [];
        var actions = unit._data.actions;
        for (var sa = 0; sa < actions.length; sa++) {
            var act = actions[sa];
            if (!act.skillId) continue;
            var sk = (typeof $dataSkills !== 'undefined') ? $dataSkills[act.skillId] : null;
            if (sk && sk.mpCost > 0) {
                var aiMcr = unit.mcr || 1;
                if (unit.mp < Math.floor(sk.mpCost * aiMcr)) continue;
            }
            var newRating = this.rateSkill(unit, { skillId: act.skillId, rating: act.rating || 5, skill: sk }, jw, context);
            skillCandidates.push({ skillId: act.skillId, rating: newRating, skill: sk });
        }
        context.skillCount = skillCandidates.length;

        if (skillCandidates.length > 0) {
            // RMMZ 방식 + 일지 가중 rating
            var maxR = 0;
            for (var sc = 0; sc < skillCandidates.length; sc++) {
                if (skillCandidates[sc].rating > maxR) maxR = skillCandidates[sc].rating;
            }
            var filtered = [];
            for (var sf2 = 0; sf2 < skillCandidates.length; sf2++) {
                if (skillCandidates[sf2].rating >= maxR - 3) filtered.push(skillCandidates[sf2]);
            }
            var wts = [];
            var totalW = 0;
            for (var fw = 0; fw < filtered.length; fw++) {
                var w = filtered[fw].rating - (maxR - 3) + 1;
                wts.push(w);
                totalW += w;
            }
            var rand = Math.random() * totalW;
            for (var rr = 0; rr < filtered.length; rr++) {
                rand -= wts[rr];
                if (rand <= 0) { selectedAction = filtered[rr]; break; }
            }
            if (!selectedAction && filtered.length > 0) selectedAction = filtered[filtered.length - 1];
            if (selectedAction) {
                useSkillId = selectedAction.skillId;
                useSkill = selectedAction.skill;
            }
        }
    }

    log(unit.name, '스킬=' + (useSkill ? useSkill.name : '기본공격'));

    // ─── 일간 레이어: 타겟 선택 + 타일 평가 ───
    var moveRange = SrpgGrid.calcMoveRange(unit);

    // 모든 타겟 점수 계산
    var targetScores = [];
    for (var ts = 0; ts < allHostiles.length; ts++) {
        var tScore = this.scoreTarget(unit, allHostiles[ts], gw, context);
        targetScores.push({ target: allHostiles[ts], score: tScore });
    }
    targetScores.sort(function(a, b) { return b.score - a.score; });

    // 상위 타겟 기준 최적 타일 탐색
    var bestResult = null, bestFinalScore = -9999;
    var topTargets = targetScores.slice(0, 5);

    for (var tt = 0; tt < topTargets.length; tt++) {
        var tgt = topTargets[tt].target;
        var tgtScore = topTargets[tt].score;
        context.bestTarget = tgt;

        for (var mr = 0; mr < moveRange.length; mr++) {
            var tile = moveRange[mr];

            // 공격 가능 여부 확인
            var atkR = SrpgGrid.calcAtkRange(unit, tile.x, tile.y);
            var canAttack = false;
            for (var ar = 0; ar < atkR.length; ar++) {
                if (atkR[ar].x === tgt.x && atkR[ar].y === tgt.y) {
                    // 투사체 차단 확인
                    var pathOk = true;
                    if (typeof SrpgCombat !== 'undefined' && SrpgCombat.checkAttackPath) {
                        var pc = SrpgCombat.checkAttackPath(
                            {x: tile.x, y: tile.y, teamId: unit.teamId}, tgt, useSkillId);
                        if (pc.blocked) pathOk = false;
                    }
                    if (pathOk) { canAttack = true; break; }
                }
            }
            tile._canAttack = canAttack;

            var tileScore = this.scoreTile(unit, tile, gw, context);
            if (canAttack) tileScore += 10; // 공격 가능 보너스

            // 일간(타겟+타일) + 일지(스킬) 결합
            var ganScore = tgtScore + tileScore;
            var jiScore = selectedAction ? selectedAction.rating : 5;
            context.noEnemyInRange = !canAttack;
            var finalScore = this.combineScores(ganScore, jiScore, context);

            if (finalScore > bestFinalScore) {
                bestFinalScore = finalScore;
                bestResult = {
                    tile: tile, target: canAttack ? tgt : null,
                    canAttack: canAttack
                };
            }
        }
    }

    // ─── 결과 조립 ───
    if (bestResult && bestResult.canAttack && bestResult.target) {
        var path = SrpgGrid.findPath(unit, bestResult.tile.x, bestResult.tile.y, moveRange);
        log(unit.name, '공격 →', bestResult.target.name, '위치(' + bestResult.tile.x + ',' + bestResult.tile.y + ')');
        return {
            type: 'attack',
            movePath: path,
            target: bestResult.target,
            moveRange: moveRange,
            skillId: useSkillId,
            skill: useSkill,
            ilgan: weights.ilgan,
            ilji: weights.ilji
        };
    } else if (bestResult) {
        // 공격 불가 → 접근 이동 (일간 가중치로 최적 접근 타일)
        var approachTarget = nearestEnemy;

        // patience/stayPut 높으면 대기 선호
        if ((gw.patience || 0) >= 2.0 || (gw.stayPut || 0) >= 2.0) {
            // 庚/辛/戊 계열: 자리에서 대기
            log(unit.name, '인내 대기 (patience=' + (gw.patience||0) + ')');
            return { type: 'wait', ilgan: weights.ilgan, ilji: weights.ilji };
        }

        // 접근 타일 탐색 (일간 가중치 반영)
        var closestTile = null, closestScore = -9999;
        for (var ct = 0; ct < moveRange.length; ct++) {
            var ctile = moveRange[ct];
            var approachDist = SrpgGrid.dist(ctile.x, ctile.y, approachTarget.x, approachTarget.y);
            var appScore = (20 - approachDist) * (gw.advance || 1.0);

            // 장판 회피
            if (typeof SrpgField !== 'undefined') {
                var surfCheck = SrpgField.getSurfaceAt(ctile.x, ctile.y);
                if (surfCheck && unit.teamId !== surfCheck.ownerTeam) {
                    var haz = (surfCheck.baseType === 'fire' || surfCheck.baseType === 'lava') ? 6 : 3;
                    appScore -= haz;
                }
            }

            // 측면 우회 보너스
            if (gw.flank > 1) appScore += Math.random() * 3 * gw.flank;

            if (appScore > closestScore) { closestScore = appScore; closestTile = ctile; }
        }

        if (closestTile) {
            var approachPath = SrpgGrid.findPath(unit, closestTile.x, closestTile.y, moveRange);
            log(unit.name, '접근 → (' + closestTile.x + ',' + closestTile.y + ')');
            return {
                type: 'move',
                movePath: approachPath,
                target: null,
                moveRange: moveRange,
                ilgan: weights.ilgan,
                ilji: weights.ilji
            };
        }
    }

    log(unit.name, '대기');
    return { type: 'wait', ilgan: weights.ilgan, ilji: weights.ilji };
};

// ═══════════════════════════════════════════════════════════════════
//  12. SM 연동 — _enemyDecide 교체
// ═══════════════════════════════════════════════════════════════════

var _origSM = null;

SrpgAI.hookSM = function() {
    if (typeof SM === 'undefined' || !SM) return;
    if (_origSM) return; // 이미 훅됨

    _origSM = SM._enemyDecide;

    SM._enemyDecide = function() {
        var unit = this._currentUnit;
        if (!unit) { this._endCurrentTurn(); return; }

        var decision;
        try {
            decision = SrpgAI.decide(this, unit);
        } catch (e) {
            console.error('[SRPG_CombatAI] Error in AI decide:', e);
            // 폴백: 원본 AI 호출
            _origSM.call(this);
            return;
        }

        switch (decision.type) {
            case 'attack':
                this._enemyDecision = {
                    type: 'attack',
                    movePath: decision.movePath,
                    target: decision.target,
                    moveRange: decision.moveRange,
                    skillId: decision.skillId,
                    skill: decision.skill
                };
                this._enemyMoveRange = decision.moveRange.map(function(t) { return {x: t.x, y: t.y}; });
                this._enemyMovePath = decision.movePath;
                var skName = decision.skill ? decision.skill.name : '공격';
                this._enemyActionMsg = decision.target.name + '에게 ' + skName + '!';
                this._enemyOrigin = {x: unit.x, y: unit.y};
                this._enemyDest = {x: decision.movePath[decision.movePath.length - 1].x,
                                    y: decision.movePath[decision.movePath.length - 1].y};
                break;

            case 'move':
                this._enemyDecision = {
                    type: 'move',
                    movePath: decision.movePath,
                    target: null,
                    moveRange: decision.moveRange
                };
                this._enemyMoveRange = decision.moveRange.map(function(t) { return {x: t.x, y: t.y}; });
                this._enemyMovePath = decision.movePath;
                this._enemyActionMsg = '접근 중...';
                this._enemyOrigin = {x: unit.x, y: unit.y};
                var lastTile = decision.movePath[decision.movePath.length - 1];
                this._enemyDest = {x: lastTile.x, y: lastTile.y};
                break;

            case 'wait':
            default:
                this._enemyDecision = { type: 'wait' };
                this._enemyActionMsg = '대기';
                break;
        }

        this._enemyShowTimer = 40;
        this._subPhase = 'showDecision';
        this._uiDirty = true;
    };

    log('SM._enemyDecide hooked successfully');
};

// ═══════════════════════════════════════════════════════════════════
//  13. 초기화 — 씬 로드 시 훅 적용
// ═══════════════════════════════════════════════════════════════════

var _Scene_Map_start = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    // SM이 초기화된 후 훅 적용
    setTimeout(function() {
        SrpgAI.hookSM();
    }, 100);
};

// ═══════════════════════════════════════════════════════════════════
//  14. 전역 API 등록
// ═══════════════════════════════════════════════════════════════════

window.SrpgAI = SrpgAI;

// GahoSystem 확장 API (존재할 경우)
if (typeof window.GahoSystem !== 'undefined') {
    if (!window.GahoSystem.getDayGan) {
        window.GahoSystem.getDayGan = function(actorId) {
            var data = this.getActorData(actorId);
            if (!data || !data.pillars || !data.pillars[1]) return null;
            return data.pillars[1].g || null;
        };
    }
    if (!window.GahoSystem.getDayJi) {
        window.GahoSystem.getDayJi = function(actorId) {
            var data = this.getActorData(actorId);
            if (!data || !data.pillars || !data.pillars[1]) return null;
            return data.pillars[1].j || null;
        };
    }
}

})();
