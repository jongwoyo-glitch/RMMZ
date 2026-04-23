//=============================================================================
// GahoSystem.js — 가호(加護) 시스템 플러그인
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Gaho (Divine Blessing) System - Saju-based character natal chart engine with personality derivation, random/design generation, and SRPG stat bridge.
 * @author GahoRok
 *
 * @help
 * ============================================================================
 * 가호 시스템 (GahoSystem.js)
 * ============================================================================
 *
 * 사주팔자 기반 세계관 "가호록"을 RMMZ 플러그인으로 구현합니다.
 * 각 액터에 원국(4주 8글자)을 부여하고, 성격/기질/신살/아키타입을 자동 파생합니다.
 *
 * ─── 노트 태그 (액터) ───
 *   <gahoPillars:甲子|丙寅|戊辰|壬午>   // 4주 (시|일|월|년)
 *   <gahoRace:human>                    // 종족 ID
 *   <gahoGender:m>                      // 성별 (m/f)
 *   <gahoBirth:1180,3,15,7>             // 생년월일시 (선택)
 *
 * ─── 전역 API ───
 *   window.GahoSystem.getActorData(actorId)
 *   window.GahoSystem.getActorPillars(actorId)
 *   window.GahoSystem.getActorElements(actorId)
 *   window.GahoSystem.getActorParams(actorId)
 *   window.GahoSystem.getActorSinsal(actorId)
 *   window.GahoSystem.getStatModifiers(actorId)
 *   window.GahoSystem.getElementAffinity(atkActorId, defActorId)
 *   window.GahoSystem.randomGenerate(race, gender)
 *   window.GahoSystem.designGenerate(dayElem, gender, race, mode, prefs)
 *
 * ============================================================================
 */

(function() {
'use strict';

// ─── 플러그인 파라미터 로더 ─────────────────────────────────────────
var _gahoParams = (function() {
    var pluginName = 'GahoSystem';
    var raw = (typeof $plugins !== 'undefined')
        ? $plugins.find(function(p) { return p.name === pluginName && p.status; })
        : null;
    if (!raw || !raw.parameters) return { actor: {} };
    try {
        return { actor: JSON.parse(raw.parameters.ActorConfig || '{}') };
    } catch(e) {
        console.warn('[Gaho] ActorConfig parse error:', e);
        return { actor: {} };
    }
})();

function _getGahoCfg(actorId) {
    return _gahoParams.actor[String(actorId)] || {};
}

// ═══════════════════════════════════════════════════════════════════
//  1. 매핑 테이블
// ═══════════════════════════════════════════════════════════════════

// --- 오행 상생/상극 ---
const GEN  = {wood:'fire', fire:'earth', earth:'metal', metal:'water', water:'wood'};
const OVR  = {wood:'earth', fire:'metal', earth:'water', metal:'wood', water:'fire'};
const CTRL = {wood:'metal', fire:'water', earth:'wood', metal:'fire', water:'earth'};
const FEED = {wood:'water', fire:'wood', earth:'fire', metal:'earth', water:'metal'};
const EN   = {wood:'목', fire:'화', earth:'토', metal:'금', water:'수'};
const EC   = {wood:'#4a7c59', fire:'#c44536', earth:'#b5893a', metal:'#7a8b99', water:'#3a7bd5'};

// --- 천간 (10성좌) ---
const GANS = [
  {tid:'甲', name:'참나무', elem:'wood',  yang:true,  emoji:'🌳', virtue:'추진력·리더십'},
  {tid:'乙', name:'화분',   elem:'wood',  yang:false, emoji:'🌱', virtue:'유연·적응력'},
  {tid:'丙', name:'태양',   elem:'fire',  yang:true,  emoji:'☀️', virtue:'열정·카리스마'},
  {tid:'丁', name:'등불',   elem:'fire',  yang:false, emoji:'🕯️', virtue:'집중·집요함'},
  {tid:'戊', name:'산맥',   elem:'earth', yang:true,  emoji:'⛰️', virtue:'포용·안정'},
  {tid:'己', name:'쟁기',   elem:'earth', yang:false, emoji:'🌾', virtue:'돌봄·실리'},
  {tid:'庚', name:'칼날',   elem:'metal', yang:true,  emoji:'🗡️', virtue:'결단·의지'},
  {tid:'辛', name:'끌',     elem:'metal', yang:false, emoji:'💎', virtue:'감수성·심미안'},
  {tid:'壬', name:'파도',   elem:'water', yang:true,  emoji:'🌊', virtue:'자유·대범함'},
  {tid:'癸', name:'물병',   elem:'water', yang:false, emoji:'💧', virtue:'통찰·직감'},
];

// --- 지지 (12주신) ---
const JIS = [
  {tid:'子', name:'노크탄',   elem:'water', yang:true,  emoji:'🌙', domain:'교활한 비밀의 신'},
  {tid:'丑', name:'그란디르', elem:'earth', yang:false, emoji:'🪨', domain:'느긋한 대지의 신'},
  {tid:'寅', name:'프레간',   elem:'wood',  yang:true,  emoji:'⚔️', domain:'용맹한 전쟁의 신'},
  {tid:'卯', name:'플로렌',   elem:'wood',  yang:false, emoji:'🌸', domain:'다정한 사랑의 신'},
  {tid:'辰', name:'레그나스', elem:'earth', yang:true,  emoji:'👑', domain:'오만한 권력의 신'},
  {tid:'巳', name:'벨리스',   elem:'fire',  yang:false, emoji:'🔮', domain:'총명한 지식의 신'},
  {tid:'午', name:'솔란',     elem:'fire',  yang:true,  emoji:'✨', domain:'성급한 계몽의 신'},
  {tid:'未', name:'큐라',     elem:'earth', yang:false, emoji:'🏮', domain:'과묵한 등불의 신'},
  {tid:'申', name:'크리시스',   elem:'metal', yang:true,  emoji:'⚖️', domain:'엄격한 심판의 신'},
  {tid:'酉', name:'스펠라',   elem:'metal', yang:false, emoji:'🔨', domain:'깐깐한 장인의 신'},
  {tid:'戌', name:'에르미탄',   elem:'earth', yang:true,  emoji:'📿', domain:'완고한 믿음의 신'},
  {tid:'亥', name:'레바',     elem:'water', yang:false, emoji:'🎊', domain:'게으른 축제의 신'},
];

// 양/음 분리 배열 (설계 역산용)
const GANS_Y = GANS.filter(g => g.yang);
const GANS_N = GANS.filter(g => !g.yang);
const JIS_Y  = JIS.filter(j => j.yang);
const JIS_N  = JIS.filter(j => !j.yang);

// tid 빠른 검색 맵
const GAN_MAP = {}; GANS.forEach(g => { GAN_MAP[g.tid] = g; });
const JI_MAP  = {}; JIS.forEach(j => { JI_MAP[j.tid] = j; });

// --- 종족 ---
const RACES = {
  human:   {name:'인간',     ageRatio:1.0,  minAge:16,  maxAge:45,
            yearJiFn: null},
  elf:     {name:'엘프',     ageRatio:0.1,  minAge:160, maxAge:400,
            yearJiFn: function(yGanIdx){ return yGanIdx%2===0 ? 2 : 3; }},  // 木
  orc:     {name:'오크',     ageRatio:2.0,  minAge:8,   maxAge:30,
            yearJiFn: function(yGanIdx){ return yGanIdx%2===0 ? 6 : 5; }},  // 火
  ogre:    {name:'오거',     ageRatio:0.4,  minAge:40,  maxAge:150,
            yearJiFn: function(yGanIdx){                                     // 土
              if(yGanIdx%2===0) return Math.random()<0.5 ? 4 : 10;
              return Math.random()<0.5 ? 1 : 7;
            }},
  dwarf:   {name:'드워프',   ageRatio:0.67, minAge:24,  maxAge:65,
            yearJiFn: function(yGanIdx){ return yGanIdx%2===0 ? 8 : 9; }},  // 金
  darkelf: {name:'다크엘프', ageRatio:0.1,  minAge:160, maxAge:400,
            yearJiFn: function(yGanIdx){ return yGanIdx%2===0 ? 0 : 11; }}, // 水
};

// ═══════════════════════════════════════════════════════════════════
//  2. 파라미터 축 정의
// ═══════════════════════════════════════════════════════════════════

// --- 십성 5축 ---
const PARAM_AXES = [
  {id:'bigup',   name:'주체성',   sipsung:'비겁', over:'고집', under:'순종',
   desc:'나와 같은 기운',
   overSubs:['독립심','집착도','자존심'], underSubs:['포용력','협조성','의존도'],
   titles:['지조없는 철새','줏대없는 팔랑귀','개인 심리상담사','적당한 주체성',
           '자기주장 강한편','흔들림 없는 뚝심','고집불통 황소']},
  {id:'express', name:'사교성',   sipsung:'식상', over:'외향', under:'내향',
   desc:'내가 낳는 기운',
   overSubs:['사교성','표현력','과시욕'], underSubs:['관찰력','경계심','자기은폐'],
   titles:['타고난 은둔자','혼자가 제일 좋아','수줍은 친구','적당한 사교성',
           '성격좋은 친구','타고난 파티피플','무대위의 지배자']},
  {id:'percept', name:'현실감각', sipsung:'재성', over:'현실', under:'망상',
   desc:'내가 다스리는 기운',
   overSubs:['실리감각','탐욕','계산력'], underSubs:['상상력','순수함','몰입도'],
   titles:['꿈 속에 갇힌 자','생각 속에 표류중','풍부한 상상력','돈만 세면 됐죠',
           '계산적인 사람','넘치는 사업가 정신','타고난 회계사']},
  {id:'discip',  name:'자기절제', sipsung:'관성', over:'경직', under:'방탕',
   desc:'나를 다스리는 기운',
   overSubs:['책임감','강박도','인내력'], underSubs:['적응력','쾌락추구','즉흥대응'],
   titles:['풀려버린 자물쇠','거절은 어려워','유혹에 약한 사람','적당한 절제력',
           '단호한 사람','진짜 독한놈','고난길의 수도승']},
  {id:'reflect', name:'계획성',   sipsung:'인성', over:'신중', under:'즉흥',
   desc:'나를 낳는 기운',
   overSubs:['분석력','의심도','계획성'], underSubs:['직감력','대담함','반사신경'],
   titles:['타고난 사고뭉치','일단 움직이고봐','즉흥적인 사람','첫 시작이 반이다',
           '체계적인 사람','과도한 준비성','스스로도 불신']},
];

// --- 오행 5축 ---
const ELEM_AXES = [
  {id:'wood',  name:'공감능력', element:'木', over:'자비',   under:'냉담',
   overSubs:['자비심','성장욕','개척정신'], underSubs:['무관심','냉담함','이기심'],
   titles:['싸이코패스','나부터 살아야죠','차가운 사람','보통의 사람',
           '정말 착한 사람','모두의 아버지/어머니','살아있는 성인']},
  {id:'fire',  name:'몰입능력', element:'火', over:'열정',   under:'냉소',
   overSubs:['열정','표현력','카리스마'], underSubs:['무기력','냉소','무감동'],
   titles:['굳이 그걸 왜?','사그라든 열정','소극적인 사람','보통의 적극성',
           '적극적인 사람','끝 없는 열정','하얗게 불태웠어']},
  {id:'earth', name:'정서안정', element:'土', over:'안정',   under:'불안',
   overSubs:['안정감','신뢰감','포용력'], underSubs:['불안정','변덕','뿌리없음'],
   titles:['심각한 공황장애','불안 장애','정서불안','보통의 안정감',
           '안정된 사람','품어주는 사람','태산같은 군자']},
  {id:'metal', name:'판단력',   element:'金', over:'결단',   under:'우유부단',
   overSubs:['결단력','정의감','냉철함'], underSubs:['우유부단','원칙없음','줏대없음'],
   titles:['중증 결정장애','갈팡질팡 갈대','우유부단한 사람','보통의 판단력',
           '날카로운 사람','오차없는 칼날','살아있는 계산기']},
  {id:'water', name:'학습능력', element:'水', over:'지혜',   under:'둔감',
   overSubs:['지혜','적응력','전략성'], underSubs:['둔감','경직사고','융통성없음'],
   titles:['생각없는 둔재','공부는 귀찮아','눈치없는 사람','보통의 학습력',
           '교수님의 애제자','천생 철학자','살아있는 대현자']},
];

// --- H기질 5축 ---
const H_AXES = [
  {id:'chastity', name:'정조관념', over:'일편단심', under:'개방적',
   overSubs:['정조의식','거부감','결벽'], underSubs:['자유연애','경계없음','무차별'],
   titlesF:['많을수록 더 좋아','좋은게 좋은거지','과거 없는 사람 없다','바람은 피면 안되는 것','당신이 제일 좋아','죽어야만 헤어진다','죽어도 당신뿐'],
   titlesM:['많을수록 더 좋아','좋은게 좋은거지','과거 없는 사람 없다','바람은 피면 안되는 것','당신이 제일 좋아','죽어야만 헤어진다','죽어도 당신뿐']},
  {id:'morality', name:'도덕성', over:'양심적', under:'막가파',
   overSubs:['죄책감','자기검열','윤리관'], underSubs:['무양심','합리화','이기심'],
   titlesF:['안되는 거라서 더 좋아','기분 좋으면 그만이야','한번 정도는 궁금해','궁금하지만 꺼림칙해','모든 금기는 이유가 있다','금기는 지켜야 한다','안되는 건 안되는 것'],
   titlesM:['안되는 거라서 더 좋아','기분 좋으면 그만이야','한번 정도는 궁금해','궁금하지만 꺼림칙해','모든 금기는 이유가 있다','금기는 지켜야 한다','안되는 건 안되는 것']},
  {id:'resist', name:'쾌락내성', over:'철벽', under:'민감',
   overSubs:['둔감','자제력','무반응'], underSubs:['과민','몰입','자극갈구'],
   titlesF:['자지 없으면 안돼','쾌감이 최고야','자꾸만 생각나','기분 좋으면 좋아요','흔들리지 않는 정신','강철의 의지','쾌감 면역'],
   titlesM:['보지 없으면 안돼','쾌감이 최고야','자꾸만 생각나','기분 좋으면 좋아요','흔들리지 않는 정신','강철의 의지','쾌감 면역']},
  {id:'submit', name:'지배성향', over:'지배', under:'피지배',
   overSubs:['통제욕','소유욕','주도'], underSubs:['수용','의존','자기포기'],
   titlesF:['충실한 육변기','이끌어줘','적극적이진 않음','과하지만 않으면 좋아','내 말대로 해','타고난 주인님','도도한 여왕님'],
   titlesM:['패배자 베타메일','리드해줘...','살살 따라감','과하지만 않으면 좋아','내 말대로 해','타고난 주인님','수컷 알파메일']},
  {id:'sadism', name:'가학성향', over:'가학', under:'피학',
   overSubs:['가학쾌감','잔인함','지배적고통'], underSubs:['피학쾌감','자기학대','고통의존'],
   titlesF:['타고난 암퇘지','때려줘 밟아줘 욕해줘','아픈데 짜릿해','아픈건 그다지','깨달아버린 손맛','괴롭힘의 미학','타고난 고문가'],
   titlesM:['타고난 숫퇘지','때려줘 밟아줘 욕해줘','아픈데 짜릿해','아픈건 그다지','깨달아버린 손맛','괴롭힘의 미학','타고난 고문가']},
];

// --- 아키타입 (18종) ---
const ARCHETYPES = [
  {name:'배신자 기질', cond:{bigup:'h',percept:'h',discip:'l'}, icon:'🗡️'},
  {name:'야심가',       cond:{bigup:'h',express:'h',percept:'h'}, icon:'👑'},
  {name:'충성의 칼',    cond:{bigup:'l',discip:'h',percept:'l'}, icon:'🛡️'},
  {name:'의리파',       cond:{discip:'h',percept:'l'}, icon:'🤝'},
  {name:'타고난 지휘관',cond:{bigup:'h',express:'h',discip:'h'}, icon:'⚔️'},
  {name:'그림자 참모',  cond:{bigup:'l',express:'l',percept:'h',reflect:'h'}, icon:'📋'},
  {name:'사기꾼',       cond:{express:'h',percept:'h',discip:'l'}, icon:'🎪'},
  {name:'자기희생형',   cond:{bigup:'l',percept:'l',reflect:'h'}, icon:'💫'},
  {name:'은둔 현자',    cond:{express:'l',percept:'l',reflect:'h'}, icon:'📿'},
  {name:'자유영혼',     cond:{discip:'l',reflect:'l'}, icon:'🌊'},
  {name:'사고뭉치',     cond:{express:'h',discip:'l',reflect:'l'}, icon:'💥'},
  {name:'철벽 관료',    cond:{percept:'h',discip:'h'}, icon:'🏛️'},
  {name:'낭만주의자',   cond:{percept:'l',discip:'l'}, icon:'🌹'},
  {name:'냉혈한',       cond:{bigup:'h',percept:'h',reflect:'l'}, icon:'🧊'},
  {name:'고독한 늑대',  cond:{bigup:'h',express:'l'}, icon:'🐺'},
  {name:'무대 위의 왕', cond:{bigup:'h',express:'h',discip:'l'}, icon:'🎭'},
  {name:'만년 2인자',   cond:{bigup:'l',express:'l',reflect:'h'}, icon:'🌙'},
  {name:'불꽃 돌진형',  cond:{bigup:'h',discip:'l',reflect:'l'}, icon:'🔥'},
];

// --- 신살 설명 테이블 ---
const SINSAL_DESC = {
  '위기의 은인':{1:'위기에 도와줄 누군가가 있다',2:'위기마다 귀인이 나타난다',3:'하늘이 보낸 수호자가 곁에 있다'},
  '책벌레':{1:'책과 친한 편이다',2:'학문에 상당한 재능이 있다',3:'타고난 학자형 인재다'},
  '살벌한 승부사':{1:'승부욕이 있다',2:'승부에 거는 집념이 강하다',3:'이기기 위해 수단을 가리지 않는다'},
  '날카로움':{1:'감이 좋다',2:'칼날 같은 직감이 있다',3:'꿰뚫어보는 눈을 가졌다'},
  '치명적 매력':{1:'은근한 매력이 있다',2:'묘한 색기가 있다',3:'치명적 매력의 소유자다'},
  '숨은 행운아':{1:'자신도 모르게 위험을 피한다',2:'몰래 돌아오는 행운이 있다',3:'본인도 모르게 복이 따른다'},
  '귀한 인연':{1:'좋은 인연이 올 수 있다',2:'평생의 반려를 만날 상이다',3:'하늘이 맺어준 인연을 만난다'},
  '자수성가':{1:'자기 힘으로 일어서는 편이다',2:'맨손으로 기반을 다진다',3:'타고난 자수성가형이다'},
  '타고난 식복':{1:'먹는 복이 있다',2:'어딜 가든 굶지 않는다',3:'타고난 식복이다'},
  '럭키가이':{1:'은근히 운이 좋다',2:'유독 운이 좋다',3:'매사에 운이 따른다'},
  '천재 괴짜':{1:'남다른 구석이 있다',2:'비범한 머리와 괴짜 기질이 있다',3:'천재성과 광기가 공존한다'},
  '외과의 손':{1:'손재주가 있다',2:'정밀한 손놀림의 소유자다',3:'신의 손이라 불릴 재능이 있다'},
  '빛나는 외모':{1:'외모가 준수하다',2:'눈에 띄는 외모다',3:'보는 이를 멈추게 하는 외모다'},
  '쉬운 이혼':{1:'결혼에 파란이 있을 수 있다',2:'한 사람과 오래 가기 어렵다',3:'결혼 유지가 극히 어렵다'},
  '인싸 체질':{1:'사교성이 있다',2:'어디서든 금방 어울린다',3:'타고난 인싸다'},
  '파견 전문':{1:'타지 생활에 적성이 있다',2:'고향보다 밖에서 빛난다',3:'이국 땅에서 운명을 찾을 상이다'},
  '예술혼':{1:'예술적 감수성이 있다',2:'예술적 재능이 뚜렷하다',3:'타고난 예술가다'},
  '혼자가 좋아':{1:'혼자 있는 시간을 좋아한다',2:'고독을 즐길 줄 안다',3:'근본적으로 혼자인 사람이다'},
  '질긴 악연':{1:'풀기 어려운 인연이 있다',2:'끊어도 끊기지 않는 악연이 있다',3:'숙명적 악연에 묶여 있다'},
  '제6감':{1:'직감이 좋다',2:'보이지 않는 것을 느낀다',3:'초자연적 직감의 소유자다'},
  '타고난 리더':{1:'리더 기질이 있다',2:'사람들이 자연히 따른다',3:'천부적 통솔력을 타고났다'},
  '타고난 예술가':{1:'예술적 기질이 있다',2:'창작에 비범하다',3:'예술 분야의 천재다'},
  '타고난 흑막':{1:'뒤에서 조율하는 능력이 있다',2:'배후 조종에 재능이 있다',3:'모든 판을 뒤에서 짠다'},
  '천생 의사':{1:'돌보는 데 소질이 있다',2:'치유의 손길을 가졌다',3:'타고난 의료인이다'},
  '천생 홀아비':{1:'여성운이 다소 약하다',2:'여성과의 인연이 박하다',3:'평생 독신의 상이 짙다'},
  '천생 과부':{1:'남성운이 다소 약하다',2:'남성과의 인연이 박하다',3:'평생 독신의 상이 짙다'},
};

// --- 신살 룩업 테이블 ---
const JI_ORDER = '子丑寅卯辰巳午未申酉戌亥';
const SAMHAP   = {子:'water',丑:'metal',寅:'fire',卯:'wood',辰:'water',巳:'metal',
                  午:'fire',未:'wood',申:'water',酉:'metal',戌:'fire',亥:'wood'};
const SS12T    = {fire:'亥子丑寅卯辰巳午未申酉戌',
                  metal:'寅卯辰巳午未申酉戌亥子丑',
                  water:'巳午未申酉戌亥子丑寅卯辰',
                  wood:'申酉戌亥子丑寅卯辰巳午未'};
const SS12N    = ['물불 안 가림','위기관리','몽상가','길잡이','인싸 체질','파란만장',
                  '무대체질','장군감','철두철미','파견 전문','트러블 메이커','혼자가 좋아'];

const CHEONUL   = {甲:'丑未',乙:'子申',丙:'亥酉',丁:'亥酉',戊:'丑未',己:'子申',庚:'寅午',辛:'寅午',壬:'巳卯',癸:'巳卯'};
const MUNCHANG  = {甲:'巳',乙:'午',丙:'申',丁:'酉',戊:'申',己:'酉',庚:'亥',辛:'子',壬:'寅',癸:'卯'};
const YANGIN    = {甲:'卯',丙:'午',戊:'午',庚:'酉',壬:'子'};
const BIIN      = {甲:'酉',丙:'子',戊:'子',庚:'卯',壬:'午'};
const HONGYEOM  = {甲:'午',乙:'申',丙:'寅',丁:'未',戊:'辰',己:'辰',庚:'戌',辛:'酉',壬:'子',癸:'申'};
const AMROK     = {甲:'午',乙:'申',丙:'酉',丁:'亥',戊:'子',己:'寅',庚:'卯',辛:'巳',壬:'午',癸:'巳'};
const GEUMYEO   = {甲:'辰',乙:'巳',丙:'未',丁:'申',戊:'酉',己:'戌',庚:'亥',辛:'子',壬:'丑',癸:'寅'};
const GEONROK   = {甲:'寅',乙:'卯',丙:'巳',丁:'午',戊:'巳',己:'午',庚:'申',辛:'酉',壬:'亥',癸:'子'};
const BOKSUNG   = {甲:'寅丑',乙:'子亥',丙:'酉亥',丁:'酉亥',戊:'申',己:'未',庚:'午巳',辛:'午巳',壬:'卯寅',癸:'卯寅'};
const CHEONBOK  = {甲:'寅子',乙:'丑卯',丙:'寅子',丁:'亥',戊:'申',己:'未',庚:'午',辛:'巳',壬:'辰',癸:'丑卯'};
const HYEONCHIM = '甲乙辛壬';
const GOEGANG   = ['庚辰','庚戌','壬辰','壬戌'];
const BAEKHO    = ['甲辰','乙巳','丙申','丁酉','戊寅','己卯','庚午','辛未','壬戌','癸亥'];
const YUKSU     = ['丙午','丁未','戊子','己丑','庚寅','辛卯'];
const GORAN     = ['乙巳','丁巳','辛亥','戊申','壬寅','戊午','壬子','丙午'];
const WONJIN    = [['子','未'],['丑','午'],['寅','巳'],['卯','辰'],['申','亥'],['酉','戌']];
const GWIMUN    = [['寅','未'],['卯','辰'],['巳','戌'],['午','亥'],['酉','寅'],['子','未']];
const SAMGI     = {천상:'甲戊庚', 인중:'乙丙丁', 지하:'辛壬癸'};
const GOSIN     = {亥:'寅',子:'寅',丑:'寅',寅:'巳',卯:'巳',辰:'巳',巳:'申',午:'申',未:'申',申:'亥',酉:'亥',戌:'亥'};
const GWASUK    = {亥:'戌',子:'戌',丑:'戌',寅:'丑',卯:'丑',辰:'丑',巳:'辰',午:'辰',未:'辰',申:'未',酉:'未',戌:'未'};

// --- 설계 모달 프리셋 ---
const DM_PRESETS = {
  sipsung: [
    {name:'전사형',    icon:'⚔️', vals:[2,0,0,3,1]},
    {name:'마법사형',  icon:'🔮', vals:[0,-1,0,0,3]},
    {name:'사교형',    icon:'🎭', vals:[0,3,2,0,0]},
    {name:'지휘관형',  icon:'👑', vals:[3,2,0,1,0]},
    {name:'방랑자형',  icon:'🌍', vals:[0,1,0,-2,-1]},
    {name:'균형형',    icon:'☯️', vals:[0,0,0,0,0]},
  ],
  elem: [
    {name:'화염술사',      icon:'🔥', vals:[0,3,0,0,-2]},
    {name:'대지의 수호자', icon:'🪨', vals:[0,0,3,0,0]},
    {name:'칼날의 심판자', icon:'⚔️', vals:[0,-1,0,3,0]},
    {name:'물의 현자',     icon:'💧', vals:[0,0,0,0,3]},
    {name:'숲의 치유사',   icon:'🌿', vals:[3,0,0,0,0]},
    {name:'균형형',        icon:'☯️', vals:[0,0,0,0,0]},
  ],
  h: [
    {name:'청순가련', icon:'🌸', vals:[3,2,2,2,-2]},
    {name:'요부형',   icon:'💋', vals:[-3,-1,-2,1,1]},
    {name:'철벽녀',   icon:'🛡️', vals:[3,3,3,-1,0]},
    {name:'순종미인', icon:'🎀', vals:[1,1,0,-3,-2]},
    {name:'여왕님',   icon:'👑', vals:[1,0,1,3,3]},
    {name:'균형형',   icon:'☯️', vals:[0,0,0,0,0]},
  ],
};


// ═══════════════════════════════════════════════════════════════════
//  3. 사주 계산 엔진
// ═══════════════════════════════════════════════════════════════════

const ORVIA_YEAR = 1219;

function isLeap(y) { return (y%4===0 && y%100!==0) || y%400===0; }
function dimOf(y, m) {
  return [31, isLeap(y)?29:28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m-1];
}
function absDay(y, m, d) {
  var y1 = y - 1;
  var days = y1*365 + Math.floor(y1/4) - Math.floor(y1/100) + Math.floor(y1/400);
  var md = [31, isLeap(y)?29:28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (var i = 0; i < m-1; i++) days += md[i];
  return days + d;
}

/**
 * 생년월일시 → 4주 계산
 * @param {number} year  - 오르비아력 년
 * @param {number} month - 1~12
 * @param {number} day   - 1~31
 * @param {number} hour  - 0~11 (시진)
 * @param {string} race  - 종족 ID
 * @returns {{p: Array, birth: Object}}  p = [시주, 일주, 월주, 년주]
 */
function calcSajuFromDate(year, month, day, hour, race) {
  var raceData = RACES[race || 'human'] || RACES.human;
  // 년주
  var yIdx = (year - 1) % 60;
  var yG = GANS[yIdx % 10];
  var yJ = raceData.yearJiFn ? JIS[raceData.yearJiFn(yIdx % 10)] : JIS[yIdx % 12];
  // 일주
  var ad = absDay(year, month, day);
  var dIdx = (ad - 1) % 60;
  var dG = GANS[dIdx % 10];
  var dJ = JIS[dIdx % 12];
  // 월주 (년상기월법)
  var mJiIdx = (month + 1) % 12;
  var mGanStart = ((yIdx % 10) % 5) * 2 + 2;
  var mGanIdx = (mGanStart + month - 1) % 10;
  var mG = GANS[mGanIdx];
  var mJ = JIS[mJiIdx];
  // 시주 (일상기시법)
  var hJiIdx = hour % 12;
  var hGanStart = ((dIdx % 10) % 5) * 2;
  var hGanIdx = (hGanStart + hJiIdx) % 10;
  var hG = GANS[hGanIdx];
  var hJ = JIS[hJiIdx];
  // [시, 일, 월, 년]
  return {
    p: [
      {g: hG, j: hJ},
      {g: dG, j: dJ},
      {g: mG, j: mJ},
      {g: yG, j: yJ}
    ],
    birth: {year: year, month: month, day: day, hour: hour}
  };
}


// ═══════════════════════════════════════════════════════════════════
//  4. 파생 계산 함수
// ═══════════════════════════════════════════════════════════════════

/** 4주 → 오행 비율 (%) */
function calcElements(pillars) {
  var el = {wood:0, fire:0, earth:0, metal:0, water:0};
  pillars.forEach(function(p) {
    if (p.g && p.g.elem) el[p.g.elem] += 12.5;
    if (p.j && p.j.elem) el[p.j.elem] += 12.5;
  });
  return el;
}

/** 일간 기준 십성 판정 */
function getSipsung(dayEl, targetEl) {
  if (!dayEl || !targetEl) return null;
  if (targetEl === dayEl)       return 'bigup';
  if (GEN[dayEl] === targetEl)  return 'express';
  if (OVR[dayEl] === targetEl)  return 'percept';
  if (CTRL[dayEl] === targetEl) return 'discip';
  if (FEED[dayEl] === targetEl) return 'reflect';
  return null;
}

/** 4주 → 십성 카운트 {counts, total, dayEl} */
function calcSipsung(pillars) {
  var dayEl = pillars[1].g.elem;
  if (!dayEl) return null;
  var counts = {bigup:0, express:0, percept:0, discip:0, reflect:0};
  var total = 0;
  pillars.forEach(function(pil, i) {
    // 천간 (일간 자신 제외)
    if (i !== 1) {
      if (pil.g && pil.g.elem) {
        var s = getSipsung(dayEl, pil.g.elem);
        if (s) { counts[s]++; total++; }
      }
    }
    // 지지 (전체)
    if (pil.j && pil.j.elem) {
      var s2 = getSipsung(dayEl, pil.j.elem);
      if (s2) { counts[s2]++; total++; }
    }
  });
  return {counts: counts, total: total, dayEl: dayEl};
}

/** 오행 비율 → 오행 5축 레벨 (0~6) */
function calcElemAxes(elements) {
  function toLevel(pct) {
    if (pct <= 2)  return 0;
    if (pct <= 8)  return 1;
    if (pct <= 16) return 2;
    if (pct <= 24) return 3;
    if (pct <= 34) return 4;
    if (pct <= 44) return 5;
    return 6;
  }
  var result = [];
  ELEM_AXES.forEach(function(ax) {
    var pct = elements[ax.id] || 0;
    var lv = toLevel(pct);
    var dev = (pct - 20) / 20;
    result.push({id: ax.id, level: lv, deviation: dev, pct: pct});
  });
  return result;
}

/** 십성×오행 → H기질 5축 (0~6 정수) */
function calcHParams(sipCounts, total, elPcts) {
  var sc = sipCounts;
  var el = elPcts;
  var b = total / 5;
  function clamp06(v) { return Math.max(0, Math.min(6, Math.round(v))); }
  if (b === 0) b = 0.001; // division guard
  var chastity = 3 + (sc.discip-b)/b*1.2 + (el.metal-20)/20*0.8 + (b-sc.percept)/b*0.7;
  var morality = 3 + (el.wood-20)/20*1.0 + (sc.discip-b)/b*0.8 + (b-sc.percept)/b*0.7;
  var resist   = 3 + (sc.reflect-b)/b*1.0 + (sc.discip-b)/b*0.8 + (20-el.water)/20*0.5 + (20-el.fire)/20*0.5;
  var submit   = 3 + (sc.bigup-b)/b*1.5 + (20-el.earth)/20*1.0;
  var sadism   = 3 + (sc.bigup-b)/b*0.8 + (sc.percept-b)/b*0.6 + (b-sc.reflect)/b*0.5 + (el.metal-20)/20*0.6 + (el.fire-20)/20*0.4;
  return {
    chastity: clamp06(chastity),
    morality: clamp06(morality),
    resist:   clamp06(resist),
    submit:   clamp06(submit),
    sadism:   clamp06(sadism)
  };
}

/** 4주 → 신살 태그 {name: level} */
function calcSinsal(pillars, gender) {
  var tags = {};
  function add(name) { tags[name] = (tags[name] || 0) + 1; }

  var gTids = pillars.map(function(p) { return p.g ? p.g.tid : null; });
  var jTids = pillars.map(function(p) { return p.j ? p.j.tid : null; });
  var dayG   = gTids[1];
  var dayJ   = jTids[1];
  var yearJ  = jTids[3];
  var monthJ = jTids[2];
  var allJ   = jTids.filter(Boolean);
  var dayPillar = (dayG || '') + (dayJ || '');

  if (!dayG || !dayJ) return tags;

  // A. 일간 기준 단순 룩업
  allJ.forEach(function(j) {
    if (CHEONUL[dayG] && CHEONUL[dayG].indexOf(j) >= 0) add('위기의 은인');
    if (MUNCHANG[dayG] === j) add('책벌레');
    if (YANGIN[dayG] === j)   add('살벌한 승부사');
    if (BIIN[dayG] === j)     add('날카로움');
    if (HONGYEOM[dayG] === j) add('치명적 매력');
    if (AMROK[dayG] === j)    add('숨은 행운아');
    if (GEUMYEO[dayG] === j)  add('귀한 인연');
    if (GEONROK[dayG] === j)  add('자수성가');
    if (BOKSUNG[dayG] && BOKSUNG[dayG].indexOf(j) >= 0) add('타고난 식복');
    if (CHEONBOK[dayG] && CHEONBOK[dayG].indexOf(j) >= 0) add('럭키가이');
  });
  if (HYEONCHIM.indexOf(dayG) >= 0) add('날카로움');

  // B. 일주 조합
  if (GOEGANG.indexOf(dayPillar) >= 0)  add('천재 괴짜');
  if (BAEKHO.indexOf(dayPillar) >= 0)   add('외과의 손');
  if (YUKSU.indexOf(dayPillar) >= 0)    add('빛나는 외모');
  if (GORAN.indexOf(dayPillar) >= 0)    add('쉬운 이혼');

  // C. 12신살 (삼합 기반)
  var refJs = [dayJ, yearJ].filter(Boolean);
  refJs.forEach(function(refJ) {
    var samhap = SAMHAP[refJ];
    if (!samhap || !SS12T[samhap]) return;
    var row = SS12T[samhap];
    allJ.forEach(function(j) {
      var idx = row.indexOf(j);
      if (idx >= 0 && j !== refJ) add(SS12N[idx]);
    });
  });

  // D. 월지 기반 (천의성)
  if (monthJ) {
    var mIdx = JI_ORDER.indexOf(monthJ);
    if (mIdx >= 0) {
      var medJ = JI_ORDER.charAt((mIdx - 1 + 12) % 12);
      var hasMed = false;
      allJ.forEach(function(j, i) {
        if (i !== 2 && j === medJ) hasMed = true;
      });
      if (hasMed) add('천생 의사');
    }
  }

  // E. 복합 조건
  WONJIN.forEach(function(pair) {
    if (allJ.indexOf(pair[0]) >= 0 && allJ.indexOf(pair[1]) >= 0) add('질긴 악연');
  });
  var adjPairs = [[monthJ, dayJ], [dayJ, jTids[0]]];
  adjPairs.forEach(function(pair) {
    if (!pair[0] || !pair[1]) return;
    GWIMUN.forEach(function(gp) {
      if ((pair[0]===gp[0] && pair[1]===gp[1]) || (pair[0]===gp[1] && pair[1]===gp[0]))
        add('제6감');
    });
  });
  // 삼기
  var g3s = [[gTids[3], gTids[2], gTids[1]], [gTids[2], gTids[1], gTids[0]]];
  Object.keys(SAMGI).forEach(function(type) {
    var seq = SAMGI[type];
    g3s.forEach(function(g3) {
      if (!g3[0] || !g3[1] || !g3[2]) return;
      var fwd = g3[0] + g3[1] + g3[2];
      var rev = g3[2] + g3[1] + g3[0];
      if (fwd === seq || rev === seq) {
        if (type === '천상') add('타고난 리더');
        if (type === '인중') add('타고난 예술가');
        if (type === '지하') add('타고난 흑막');
      }
    });
  });

  // F. 방합 기반 (성별 구분)
  var gdr = gender || 'm';
  [dayJ, yearJ].filter(Boolean).forEach(function(refJ) {
    allJ.forEach(function(j) {
      if (j === refJ) return;
      if (gdr === 'm' && GOSIN[refJ] === j) add('천생 홀아비');
      if (gdr === 'f' && GWASUK[refJ] === j) add('천생 과부');
    });
  });

  return tags;
}

/** 십성 카운트 → 아키타입 매칭 */
function matchArchetypes(sipCounts) {
  var matched = [];
  ARCHETYPES.forEach(function(arch) {
    var ok = true;
    Object.keys(arch.cond).forEach(function(axis) {
      var req = arch.cond[axis];
      if (req === 'h' && sipCounts[axis] < 3) ok = false;
      if (req === 'l' && sipCounts[axis] > 0) ok = false;
    });
    if (ok) matched.push({name: arch.name, icon: arch.icon});
  });
  return matched;
}


// ═══════════════════════════════════════════════════════════════════
//  5. 파싱 / 인코딩
// ═══════════════════════════════════════════════════════════════════

/**
 * "甲子|丙寅|戊辰|壬午" → [{g:{...}, j:{...}}, ...] (시|일|월|년)
 */
function parsePillars(pillarStr) {
  if (!pillarStr) return null;
  var parts = pillarStr.split('|');
  if (parts.length !== 4) return null;
  var result = [];
  for (var i = 0; i < 4; i++) {
    var chars = parts[i];
    if (chars.length < 2) return null;
    var gTid = chars.charAt(0);
    var jTid = chars.charAt(1);
    var g = GAN_MAP[gTid];
    var j = JI_MAP[jTid];
    if (!g || !j) return null;
    result.push({g: g, j: j});
  }
  return result;
}

/**
 * [{g:{...}, j:{...}}, ...] → "甲子|丙寅|戊辰|壬午"
 */
function encodePillars(pillars) {
  if (!pillars || pillars.length !== 4) return '';
  return pillars.map(function(p) {
    return (p.g ? p.g.tid : '?') + (p.j ? p.j.tid : '?');
  }).join('|');
}


// ═══════════════════════════════════════════════════════════════════
//  6. 생성 함수
// ═══════════════════════════════════════════════════════════════════

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * 랜덤 생성: 종족+성별 → 생년월일시 랜덤 → 4주 계산 → pillarStr + 부가정보
 */
function randomGenerate(race, gender) {
  var r = race || 'human';
  var raceData = RACES[r] || RACES.human;
  var gdr = gender || (Math.random() > 0.5 ? 'm' : 'f');
  var age = Math.floor(Math.random() * (raceData.maxAge - raceData.minAge + 1)) + raceData.minAge;
  var bYear = ORVIA_YEAR - age;
  var bMonth = Math.floor(Math.random() * 12) + 1;
  var bDay = Math.floor(Math.random() * dimOf(bYear, bMonth)) + 1;
  var bHour = Math.floor(Math.random() * 12);
  var saju = calcSajuFromDate(bYear, bMonth, bDay, bHour, r);
  return {
    pillars: saju.p,
    pillarStr: encodePillars(saju.p),
    birth: saju.birth,
    race: r,
    gender: gdr,
    age: age,
    appAge: Math.floor(age * raceData.ageRatio)
  };
}

/**
 * 설계 역산 생성: 일간오행 + 성별 + 종족 + 모드 + 5축 선호도 → 4주 역산
 */
function designGenerate(dayElem, gender, race, mode, prefs) {
  var elOrder = ['wood', 'fire', 'earth', 'metal', 'water'];

  function prefToWeight(p) {
    if (p >= 3)  return 6;
    if (p === 2) return 4;
    if (p === 1) return 2.5;
    if (p === 0) return 1.4;
    if (p === -1) return 0.5;
    if (p === -2) return 0.1;
    return 0;
  }

  var elW = {wood:1.4, fire:1.4, earth:1.4, metal:1.4, water:1.4};

  if (mode === 'sipsung') {
    var sipElMap = [dayElem, GEN[dayElem], OVR[dayElem], CTRL[dayElem], FEED[dayElem]];
    prefs.forEach(function(p, i) { elW[sipElMap[i]] = prefToWeight(p); });
  } else if (mode === 'elem') {
    prefs.forEach(function(p, i) { elW[elOrder[i]] = prefToWeight(p); });
  } else if (mode === 'h') {
    var sipElMap2 = [dayElem, GEN[dayElem], OVR[dayElem], CTRL[dayElem], FEED[dayElem]];
    var sipW = [0, 0, 0, 0, 0];
    sipW[3] += prefs[0]*0.4; sipW[2] -= prefs[0]*0.3;
    sipW[3] += prefs[1]*0.3; sipW[2] -= prefs[1]*0.3;
    sipW[4] += prefs[2]*0.4; sipW[3] += prefs[2]*0.3;
    sipW[0] += prefs[3]*0.5;
    sipW[0] += prefs[4]*0.3; sipW[2] += prefs[4]*0.3; sipW[4] -= prefs[4]*0.2;
    sipW.forEach(function(sw, i) { elW[sipElMap2[i]] += sw; });
    elW.metal += prefs[0]*0.3;
    elW.wood  += prefs[1]*0.3;
    elW.water -= prefs[2]*0.2; elW.fire -= prefs[2]*0.2;
    elW.earth -= prefs[3]*0.3;
    elW.metal += prefs[4]*0.3; elW.fire += prefs[4]*0.2;
  }

  // Clamp and normalize → 7 슬롯
  elOrder.forEach(function(e) { elW[e] = Math.max(0, elW[e]); });
  var wSum = elOrder.reduce(function(s, e) { return s + elW[e]; }, 0);
  var targets = elOrder.map(function(e) { return wSum > 0 ? elW[e]/wSum*7 : 1.4; });
  var floors = targets.map(function(t) { return Math.floor(t); });
  var remainder = 7 - floors.reduce(function(a, b) { return a + b; }, 0);
  var fracs = targets.map(function(t, i) { return {i: i, f: t - floors[i]}; });
  fracs.sort(function(a, b) { return b.f - a.f; });
  for (var r2 = 0; r2 < remainder && r2 < fracs.length; r2++) floors[fracs[r2].i]++;

  // pool 생성 + 셔플
  var pool = [];
  elOrder.forEach(function(e, i) {
    for (var j = 0; j < floors[i]; j++) pool.push(e);
  });
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  // 일간 결정
  var isYang = Math.random() > 0.5;
  var dayGanArr = isYang ? GANS_Y : GANS_N;
  var dayGan = null;
  for (var k = 0; k < dayGanArr.length; k++) {
    if (dayGanArr[k].elem === dayElem) { dayGan = dayGanArr[k]; break; }
  }
  if (!dayGan) dayGan = GANS[0]; // fallback

  var ganSlots = pool.slice(0, 3);
  var jiSlots  = pool.slice(3, 7);
  var allGans  = GANS_Y.concat(GANS_N);
  var allJis   = JIS_Y.concat(JIS_N);

  var gans = ganSlots.map(function(e) {
    var ms = allGans.filter(function(g) { return g.elem === e; });
    return ms[Math.floor(Math.random() * ms.length)];
  });
  var jis = jiSlots.map(function(e) {
    var ms = allJis.filter(function(j2) { return j2.elem === e; });
    return ms[Math.floor(Math.random() * ms.length)];
  });

  // 종족 년지 보정
  if (race && RACES[race] && RACES[race].yearJiFn) {
    var ganIdx = GANS.indexOf(gans[0]);
    if (ganIdx < 0) ganIdx = 0;
    var fixedJiIdx = RACES[race].yearJiFn(ganIdx);
    jis[0] = JIS[fixedJiIdx];
  }

  // 조립: [시간|일간+일지|월간|년간] + [시지|일지|월지|년지]
  var pils = [
    {g: gans[2], j: jis[3]},   // 시주
    {g: dayGan,  j: jis[2]},   // 일주
    {g: gans[1], j: jis[1]},   // 월주
    {g: gans[0], j: jis[0]}    // 년주
  ];

  return {
    pillars: pils,
    pillarStr: encodePillars(pils),
    race: race || 'human',
    gender: gender || 'm'
  };
}


// ═══════════════════════════════════════════════════════════════════
//  7. 액터 API
// ═══════════════════════════════════════════════════════════════════

/** 액터 가호 데이터 파싱 (플러그인 파라미터 → 노트태그 폴백) */
function _parseActorNote(actorId) {
  // 1) 플러그인 파라미터에서 읽기
  var cfg = _getGahoCfg(actorId);

  // 2) DB 노트태그 폴백
  var note = '';
  if (typeof $dataActors !== 'undefined' && $dataActors) {
    var actor = $dataActors[actorId];
    if (actor && actor.note) note = actor.note;
  }

  var pillarsMatch = note.match(/<gahoPillars:([^>]+)>/i);
  var raceMatch    = note.match(/<gahoRace:([^>]+)>/i);
  var genderMatch  = note.match(/<gahoGender:([^>]+)>/i);
  var birthMatch   = note.match(/<gahoBirth:([^>]+)>/i);

  // 우선순위: 노트태그(비상 오버라이드) → 플러그인 파라미터 → 기본값
  var pillarStr = pillarsMatch ? pillarsMatch[1] : (cfg.pillars || null);
  var race      = raceMatch ? raceMatch[1].trim() : (cfg.race || 'human');
  var gender    = genderMatch ? genderMatch[1].trim() : (cfg.gender || 'm');
  var birth     = null;
  if (birthMatch) {
    var bp = birthMatch[1].split(',').map(Number);
    if (bp.length >= 4) birth = {year: bp[0], month: bp[1], day: bp[2], hour: bp[3]};
  } else if (cfg.birth) {
    var bp2 = String(cfg.birth).split(',').map(Number);
    if (bp2.length >= 4) birth = {year: bp2[0], month: bp2[1], day: bp2[2], hour: bp2[3]};
  }

  if (!pillarStr && !cfg.pillars) return null;

  return {
    pillarStr: pillarStr,
    race: race,
    gender: gender,
    birth: birth
  };
}

/** 데이터 캐시 (런타임) */
var _cache = {};

/** 캐시 무효화 */
function invalidateCache(actorId) {
  if (actorId) delete _cache[actorId];
  else _cache = {};
}

/**
 * 액터 전체 데이터 가져오기 (파싱 + 모든 파생 계산)
 */
function getActorData(actorId) {
  if (_cache[actorId]) return _cache[actorId];

  var raw = _parseActorNote(actorId);
  if (!raw || !raw.pillarStr) return null;

  var pillars = parsePillars(raw.pillarStr);
  if (!pillars) return null;

  var elements = calcElements(pillars);
  var sipResult = calcSipsung(pillars);
  if (!sipResult) return null;

  var elemAxes   = calcElemAxes(elements);
  var hParams    = calcHParams(sipResult.counts, sipResult.total, elements);
  var sinsal     = calcSinsal(pillars, raw.gender);
  var archetypes = matchArchetypes(sipResult.counts);

  var data = {
    actorId:    actorId,
    pillarStr:  raw.pillarStr,
    pillars:    pillars,
    race:       raw.race,
    gender:     raw.gender,
    birth:      raw.birth,
    elements:   elements,
    dayElem:    sipResult.dayEl,
    sipsung:    sipResult,
    elemAxes:   elemAxes,
    hParams:    hParams,
    sinsal:     sinsal,
    archetypes: archetypes
  };

  _cache[actorId] = data;
  return data;
}

function getActorPillars(actorId) {
  var d = getActorData(actorId);
  return d ? d.pillars : null;
}

function getActorElements(actorId) {
  var d = getActorData(actorId);
  return d ? d.elements : null;
}

function getActorParams(actorId) {
  var d = getActorData(actorId);
  if (!d) return null;
  return {
    sipsung:  d.sipsung,
    elemAxes: d.elemAxes,
    hParams:  d.hParams
  };
}

function getActorSinsal(actorId) {
  var d = getActorData(actorId);
  return d ? d.sinsal : null;
}


// ═══════════════════════════════════════════════════════════════════
//  8. SRPG 연동 브릿지 (스텁 — 추후 구체화)
// ═══════════════════════════════════════════════════════════════════

/**
 * 전투 스탯 보정값
 * @param {number} actorId
 * @returns {Object|null}  { atk, def, mat, mdf, agi, luk }
 *
 * TODO: 실제 보정 공식 구현 필요 (현재는 오행 비율 기반 기본 스텁)
 */
function getStatModifiers(actorId) {
  var d = getActorData(actorId);
  if (!d) return null;
  var el = d.elements;
  // 기본 스텁: 오행 비율이 25% 이상이면 관련 스탯에 소량 보정
  return {
    atk: Math.floor((el.fire  - 20) / 10),
    def: Math.floor((el.earth - 20) / 10),
    mat: Math.floor((el.water - 20) / 10),
    mdf: Math.floor((el.wood  - 20) / 10),
    agi: Math.floor((el.metal - 20) / 10),
    luk: 0
  };
}

/**
 * 오행 상성 보정 (공격자 vs 방어자)
 * @returns {Object|null}  { bonus, relation }
 */
function getElementAffinity(atkActorId, defActorId) {
  var atkData = getActorData(atkActorId);
  var defData = getActorData(defActorId);
  if (!atkData || !defData) return null;
  var aEl = atkData.dayElem;
  var dEl = defData.dayElem;
  if (!aEl || !dEl) return null;
  if (OVR[aEl] === dEl) return {bonus: 1.15, relation: 'ovr'};  // 상극 우위
  if (OVR[dEl] === aEl) return {bonus: 0.85, relation: 'weak'}; // 상극 열세
  if (GEN[aEl] === dEl) return {bonus: 1.05, relation: 'gen'};  // 상생
  if (aEl === dEl)      return {bonus: 1.0,  relation: 'same'}; // 동일
  return {bonus: 1.0, relation: 'neutral'};
}




// ═══════════════════════════════════════════════════════════════════
//  8b. 궁합 판정 + 전투 성향
// ═══════════════════════════════════════════════════════════════════

/** 천간합(干合) 테이블: 5쌍 */
var GAN_COMBINE = {'甲':'己','己':'甲','乙':'庚','庚':'乙','丙':'辛','辛':'丙','丁':'壬','壬':'丁','戊':'癸','癸':'戊'};

/** 지지충(冲) 테이블: 6쌍 */
var JI_CLASH = {'子':'午','午':'子','丑':'未','未':'丑','寅':'申','申':'寅','卯':'酉','酉':'卯','辰':'戌','戌':'辰','巳':'亥','亥':'巳'};

/** 지지육합(六合) 테이블 */
var JI_HARMONY = {'子':'丑','丑':'子','寅':'亥','亥':'寅','卯':'戌','戌':'卯','辰':'酉','酉':'辰','巳':'申','申':'巳','午':'未','未':'午'};

/** 지지삼합(三合) - 중심지지와 결과오행 */
var JI_TRIPLE = {
  '申子辰': 'water', '寅午戌': 'fire', '亥卯未': 'wood', '巳酉丑': 'metal'
};

/**
 * 두 액터 간 종합 궁합 판정
 * @param {number} actorIdA
 * @param {number} actorIdB
 * @returns {Object} { score, ganCombine, jiHarmony, jiClash, elemRelation, desc, synergyBonus }
 */
function getCompatibility(actorIdA, actorIdB) {
  var dA = getActorData(actorIdA);
  var dB = getActorData(actorIdB);
  if (!dA || !dB || !dA.pillars || !dB.pillars) {
    return { score: 50, ganCombine: false, jiHarmony: false, jiClash: false,
             elemRelation: 'neutral', desc: '판정 불가', synergyBonus: 0 };
  }

  var score = 50;  // 기본 50점
  var flags = { ganCombine: false, jiHarmony: false, jiClash: false, jiTriple: false };
  var descs = [];

  // 1) 일주 천간합 체크
  var dayGanA = dA.pillars[1].gan;
  var dayGanB = dB.pillars[1].gan;
  if (GAN_COMBINE[dayGanA] === dayGanB) {
    flags.ganCombine = true;
    score += 20;
    var ganA = GAN_MAP[dayGanA];
    var ganB = GAN_MAP[dayGanB];
    descs.push((ganA ? ganA.name : dayGanA) + '과 ' + (ganB ? ganB.name : dayGanB) + '의 천간합');
  }

  // 2) 일주 지지 육합/충 체크
  var dayJiA = dA.pillars[1].ji;
  var dayJiB = dB.pillars[1].ji;
  if (JI_HARMONY[dayJiA] === dayJiB) {
    flags.jiHarmony = true;
    score += 15;
    descs.push('일지 육합 (조화)');
  }
  if (JI_CLASH[dayJiA] === dayJiB) {
    flags.jiClash = true;
    score -= 20;
    descs.push('일지 충 (갈등)');
  }

  // 3) 오행 상성
  var elemRel = getElementAffinity(actorIdA, actorIdB);
  if (elemRel) {
    if (elemRel.relation === 'gen') { score += 10; descs.push('오행 상생'); }
    else if (elemRel.relation === 'ovr') { score -= 5; descs.push('오행 상극 (A우위)'); }
    else if (elemRel.relation === 'weak') { score -= 5; descs.push('오행 상극 (B우위)'); }
    else if (elemRel.relation === 'same') { score += 5; descs.push('오행 동기'); }
  }

  // 4) 전체 기둥 간 합/충 추가 보정 (년주, 월주, 시주)
  for (var p = 0; p < 4; p++) {
    if (p === 1) continue;  // 일주는 이미 처리
    var pilA = dA.pillars[p];
    var pilB = dB.pillars[p];
    if (!pilA || !pilB) continue;
    if (GAN_COMBINE[pilA.gan] === pilB.gan) score += 5;
    if (JI_HARMONY[pilA.ji] === pilB.ji) score += 5;
    if (JI_CLASH[pilA.ji] === pilB.ji) score -= 5;
  }

  // 점수 클램프
  score = Math.max(0, Math.min(100, score));

  // 관계 설명
  var desc = '';
  if (score >= 80) desc = '천생연분 — 깊은 유대';
  else if (score >= 65) desc = '좋은 궁합 — 자연스러운 조화';
  else if (score >= 45) desc = '보통 — 노력으로 보완';
  else if (score >= 25) desc = '다소 불화 — 갈등 소지';
  else desc = '상극 — 강한 충돌';
  if (descs.length > 0) desc += ' (' + descs.join(', ') + ')';

  // 전투 시너지 보너스 (인접 배치 시)
  var synergyBonus = Math.floor((score - 50) / 10);  // -5 ~ +5 범위

  return {
    score: score,
    ganCombine: flags.ganCombine,
    jiHarmony: flags.jiHarmony,
    jiClash: flags.jiClash,
    elemRelation: elemRel ? elemRel.relation : 'neutral',
    desc: desc,
    synergyBonus: synergyBonus
  };
}

/**
 * 전투 성향 분석 (오행 분포 → 역할 비율)
 * @returns {Object} { attack, burst, defense, mobility, strategy, dominant }
 */
function getCombatTendency(actorId) {
  var data = getActorData(actorId);
  if (!data || !data.elements) {
    return { attack: 20, burst: 20, defense: 20, mobility: 20, strategy: 20, dominant: 'none' };
  }
  var el = data.elements;
  // 오행 → 전투 역할 매핑
  var attack   = el.wood || 0;   // 목 → 공격/성장
  var burst    = el.fire || 0;   // 화 → 화력/버스트
  var defense  = el.earth || 0;  // 토 → 방어/지원
  var mobility = el.metal || 0;  // 금 → 기동/정밀
  var strategy = el.water || 0;  // 수 → 전략/디버프

  var total = attack + burst + defense + mobility + strategy;
  if (total === 0) total = 1;

  var result = {
    attack:   Math.round(attack / total * 100),
    burst:    Math.round(burst / total * 100),
    defense:  Math.round(defense / total * 100),
    mobility: Math.round(mobility / total * 100),
    strategy: Math.round(strategy / total * 100)
  };

  // 주 성향
  var max = 0; var dom = 'attack';
  var keys = ['attack','burst','defense','mobility','strategy'];
  for (var i = 0; i < keys.length; i++) {
    if (result[keys[i]] > max) { max = result[keys[i]]; dom = keys[i]; }
  }
  result.dominant = dom;
  return result;
}

// ═══════════════════════════════════════════════════════════════════
//  9. 전역 API 등록
// ═══════════════════════════════════════════════════════════════════

window.GahoSystem = {
  // 매핑 테이블
  GANS:          GANS,
  JIS:           JIS,
  GANS_Y:        GANS_Y,
  GANS_N:        GANS_N,
  JIS_Y:         JIS_Y,
  JIS_N:         JIS_N,
  GAN_MAP:       GAN_MAP,
  JI_MAP:        JI_MAP,
  RACES:         RACES,
  PARAM_AXES:    PARAM_AXES,
  ELEM_AXES:     ELEM_AXES,
  H_AXES:        H_AXES,
  ARCHETYPES:    ARCHETYPES,
  SINSAL_DESC:   SINSAL_DESC,
  DM_PRESETS:    DM_PRESETS,
  // 오행 관계
  GEN:  GEN,
  OVR:  OVR,
  CTRL: CTRL,
  FEED: FEED,
  EN:   EN,
  EC:   EC,
  // 달력
  ORVIA_YEAR: ORVIA_YEAR,
  isLeap:     isLeap,
  dimOf:      dimOf,
  // 사주 계산
  calcSajuFromDate: calcSajuFromDate,
  parsePillars:     parsePillars,
  encodePillars:    encodePillars,
  // 파생 계산
  calcElements:     calcElements,
  getSipsung:       getSipsung,
  calcSipsung:      calcSipsung,
  calcElemAxes:     calcElemAxes,
  calcHParams:      calcHParams,
  calcSinsal:       calcSinsal,
  matchArchetypes:  matchArchetypes,
  // 생성
  randomGenerate:   randomGenerate,
  designGenerate:   designGenerate,
  // 액터 API
  getActorData:     getActorData,
  getActorPillars:  getActorPillars,
  getActorElements: getActorElements,
  getActorParams:   getActorParams,
  getActorSinsal:   getActorSinsal,
  invalidateCache:  invalidateCache,
  // SRPG 연동
  getStatModifiers:    getStatModifiers,
  getElementAffinity:  getElementAffinity,
  getCompatibility:    getCompatibility,
  getCombatTendency:   getCombatTendency,
};

// ═══════════════════════════════════════════════════════════════════
//  캐시 자동 무효화 — 씬 전환 시 전체 캐시 클리어
// ═══════════════════════════════════════════════════════════════════
if (typeof Scene_Map !== 'undefined') {
  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function() {
    invalidateCache();
    _Scene_Map_terminate.call(this);
  };
}

// DataManager.onLoad — 데이터 로드 시 캐시 리셋
if (typeof DataManager !== 'undefined') {
  const _DataManager_onLoad = DataManager.onLoad;
  DataManager.onLoad = function(object) {
    _DataManager_onLoad.call(this, object);
    if (object === $dataActors) invalidateCache();
  };
}

})();
