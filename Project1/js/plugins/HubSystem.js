//=============================================================================
// HubSystem.js — 거점(Hub) 시스템
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Hub/Base location system — illustrated backgrounds with hotspot navigation and sidebar UI
 * @author Claude
 *
 * @help
 * 비전투 거점 화면을 구현합니다.
 * 배경 일러스트 + 핫스팟 클릭 + 사이드바(파티 상태/의뢰/메뉴/파티원).
 *
 * 의존성: GridInventory.js, StandingManager.js, MenuOverhaul.js
 *
 * 사용법 (이벤트 스크립트):
 *   $gameSystem._hubData.currentLocationId = 1;
 *   SceneManager.goto(Scene_Hub);
 *
 * @param HotspotTypes
 * @text 핫스팟 종류 (3단계)
 * @type struct<HotspotCategory>[]
 * @desc 카테고리 > 시설 > 등급 형태의 핫스팟 종류 정의
 * @default []
 */

/*~struct~HotspotCategory:
 * @param category
 * @text 카테고리
 * @type string
 * @desc 대분류 (예: 군사시설, 상업시설, 생활시설)
 *
 * @param facilities
 * @text 시설 목록
 * @type struct<HotspotFacility>[]
 * @desc 이 카테고리에 속하는 시설들
 * @default []
 */

/*~struct~HotspotFacility:
 * @param name
 * @text 시설명
 * @type string
 * @desc 시설 이름 (예: 훈련소, 병영, 무기고)
 *
 * @param id
 * @text 시설 ID
 * @type string
 * @desc 고유 식별자 (예: training_ground, barracks)
 *
 * @param icon
 * @text 아이콘
 * @type string
 * @desc img/locations/hs/ 폴더의 아이콘 파일명
 * @default hs_guild
 *
 * @param grades
 * @text 등급 목록
 * @type struct<HotspotGrade>[]
 * @desc 이 시설의 업그레이드 등급
 * @default []
 */

/*~struct~HotspotGrade:
 * @param level
 * @text 등급
 * @type number
 * @min 1
 * @max 5
 * @desc 등급 레벨
 * @default 1
 *
 * @param label
 * @text 등급명
 * @type string
 * @desc 등급 이름 (예: 초급, 중급, 고급)
 *
 * @param description
 * @text 설명
 * @type string
 * @desc 이 등급의 효과 설명
 */

(() => {
"use strict";

// =========================================================================
//  상수
// =========================================================================
const BG_RATIO_W = 3;  // 배경 비율 너비
const BG_RATIO_H = 2;  // 배경 비율 높이
const SIDEBAR_MIN_W = 200; // 사이드바 최소 너비

// ── 플러그인 파라미터에서 핫스팟 타입 로드 ──
const _hubParams = PluginManager.parameters("HubSystem");
const _hotspotTypes = (function() {
    try {
        var raw = JSON.parse(_hubParams["HotspotTypes"] || "[]");
        return raw.map(function(catStr) {
            var cat = typeof catStr === "string" ? JSON.parse(catStr) : catStr;
            var facilities = JSON.parse(cat.facilities || "[]").map(function(facStr) {
                var fac = typeof facStr === "string" ? JSON.parse(facStr) : facStr;
                var grades = JSON.parse(fac.grades || "[]").map(function(gStr) {
                    return typeof gStr === "string" ? JSON.parse(gStr) : gStr;
                });
                return { name: fac.name, id: fac.id, icon: fac.icon || "hs_guild", grades: grades };
            });
            return { category: cat.category, facilities: facilities };
        });
    } catch(e) { console.warn("HubSystem: HotspotTypes parse error", e); return []; }
})();

// 외부 접근용
window._hubHotspotTypes = _hotspotTypes;

// =========================================================================
//  DataManager 확장
// =========================================================================
window.$dataLocations = null;
window.$dataFacilities = null;

const _DM_loadDatabase = DataManager.loadDatabase;
DataManager.loadDatabase = function() {
    _DM_loadDatabase.call(this);
    this.loadDataFile("$dataLocations", "Locations.json");
    this.loadDataFile("$dataFacilities", "Facilities.json");
};

const _DM_isDatabaseLoaded = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
    if (!_DM_isDatabaseLoaded.call(this)) return false;
    if (!window.$dataLocations) return false;
    if (!window.$dataFacilities) return false;
    return true;
};

// =========================================================================
//  ImageManager 확장
// =========================================================================
ImageManager.loadLocation = function(filename) {
    return this.loadBitmap("img/locations/", filename);
};
ImageManager.loadHotspotIcon = function(filename) {
    return this.loadBitmap("img/locations/hs/", filename);
};
ImageManager.loadFacility = function(filename) {
    return this.loadBitmap("img/facilities/", filename);
};

// =========================================================================
//  Game_System 확장
// =========================================================================
const _GS_initialize = Game_System.prototype.initialize;
Game_System.prototype.initialize = function() {
    _GS_initialize.call(this);
    this._hubData = {
        currentLocationId: 0,
        currentFacilityId: 0,
        dayCount: 1,
        timeOfDay: "morning",
        weather: "clear",
        morale: 70,
        moraleMax: 100,
        actionPoints: 5,
        actionPointsMax: 7,
        partyFund: 500,
        personalWealth: {},
        fundPolicy: { shareRatio: 50, distMethod: "equal", bonusRule: "party_auction" },
        activeQuests: [
            { questId: 1, destination: "남부 숲", objective: "고블린 소탕", dueDateDay: 5, reward: 800, status: "active" },
            { questId: 2, destination: "벨포드",  objective: "약초 납품",   dueDateDay: 8, reward: 300, status: "active" }
        ],
        visitedLocations: [],
        discoveredLocations: []
    };
};

Game_System.prototype.hubData = function() {
    if (!this._hubData) this.initialize._hubData;
    return this._hubData;
};

Game_System.prototype.currentLocation = function() {
    const id = this._hubData.currentLocationId;
    return id > 0 && $dataLocations ? $dataLocations[id] : null;
};

Game_System.prototype.leaderPersonalWealth = function() {
    const leaderId = $gameParty.leader() ? $gameParty.leader().actorId() : 0;
    return (this._hubData.personalWealth[leaderId] || 0);
};

// =========================================================================
//  Game_Actor 확장 — 스트레스
// =========================================================================
Game_Actor.prototype.stressLevel = function() {
    const mood = (this._mood !== undefined) ? this._mood : 70;
    return Math.max(0, Math.min(100, 100 - mood));
};

Game_Actor.prototype.stressRating = function() {
    const s = this.stressLevel();
    if (s <= 30) return "low";
    if (s <= 70) return "mid";
    return "high";
};

// =========================================================================
//  레이아웃 계산 유틸
// =========================================================================
function calcLayout() {
    const gw = Graphics.width;
    const gh = Graphics.height;
    // 배경: 높이 = 화면 전체, 너비 = 2:3 비율
    let bgH = gh;
    let bgW = Math.floor(bgH * BG_RATIO_W / BG_RATIO_H);
    let sideW = gw - bgW;
    if (sideW < SIDEBAR_MIN_W) {
        sideW = SIDEBAR_MIN_W;
        bgW = gw - sideW;
    }
    return { bgW, bgH, sideW, sideX: bgW };
}

// =========================================================================
//  Scene_Hub
// =========================================================================
function Scene_Hub() {
    this.initialize.apply(this, arguments);
}
Scene_Hub.prototype = Object.create(Scene_MenuBase.prototype);
Scene_Hub.prototype.constructor = Scene_Hub;
window.Scene_Hub = Scene_Hub;

Scene_Hub.prototype.initialize = function() {
    Scene_MenuBase.prototype.initialize.call(this);
};

Scene_Hub.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    const lay = calcLayout();
    this._layout = lay;
    this._createHubBackground(lay);
    this._createLocationName(lay);
    this._createHotspots(lay);
    this._createSidebar(lay);
};

Scene_Hub.prototype.start = function() {
    Scene_MenuBase.prototype.start.call(this);
    const loc = $gameSystem.currentLocation();
    if (loc && loc.bgm) {
        AudioManager.playBgm(loc.bgm);
    }
    // 페이드 인 (검은 화면에서 밝아짐)
    this.startFadeIn(12, false);
};

// ── 배경 ──
Scene_Hub.prototype._createHubBackground = function(lay) {
    this._bgSprite = new Sprite();
    this.addChild(this._bgSprite);
    const loc = $gameSystem.currentLocation();
    if (!loc) return;
    // 시간대별 배경 선택
    const tod = $gameSystem._hubData.timeOfDay;
    let imgName = loc.bgImage;
    if (loc.bgVariants && loc.bgVariants[tod]) {
        imgName = loc.bgVariants[tod];
    }
    const bmp = ImageManager.loadLocation(imgName);
    this._bgSprite.bitmap = bmp;
    bmp.addLoadListener(() => {
        // 2:3 비율 영역에 맞게 스케일
        const sx = lay.bgW / bmp.width;
        const sy = lay.bgH / bmp.height;
        const s = Math.max(sx, sy); // cover
        this._bgSprite.scale.set(s, s);
        // 센터링
        this._bgSprite.x = (lay.bgW - bmp.width * s) / 2;
        this._bgSprite.y = (lay.bgH - bmp.height * s) / 2;
    });
};

// ── 장소명 ──
Scene_Hub.prototype._createLocationName = function(lay) {
    const loc = $gameSystem.currentLocation();
    if (!loc) return;
    const style = new PIXI.TextStyle({
        fontFamily: "sans-serif",
        fontSize: 22,
        fontWeight: "bold",
        fill: "#ffffff",
        dropShadow: true,
        dropShadowColor: "#000000",
        dropShadowBlur: 4,
        dropShadowDistance: 1
    });
    const nameText = new PIXI.Text(loc.name, style);
    nameText.x = 16;
    nameText.y = 14;
    this.addChild(nameText);

    if (loc.region) {
        const subStyle = new PIXI.TextStyle({
            fontFamily: "sans-serif",
            fontSize: 13,
            fill: "rgba(255,255,255,0.65)",
            dropShadow: true,
            dropShadowColor: "#000000",
            dropShadowBlur: 3,
            dropShadowDistance: 1
        });
        const subText = new PIXI.Text(loc.region, subStyle);
        subText.x = 16;
        subText.y = 42;
        this.addChild(subText);
    }
};

// ── 핫스팟 ──
Scene_Hub.prototype._createHotspots = function(lay) {
    this._hotspotSprites = [];
    const loc = $gameSystem.currentLocation();
    if (!loc || !loc.hotspots) return;

    for (const hs of loc.hotspots) {
        const container = new PIXI.Container();
        // 위치 (비율 → 픽셀, 배경 영역 내)
        container.x = Math.floor(hs.x / 100 * lay.bgW);
        container.y = Math.floor(hs.y / 100 * lay.bgH);
        container._hsData = hs;
        container._hoverT = 0;
        container._isHovered = false;

        // 아이콘 배경 (PIXI.Graphics)
        const iconBg = new PIXI.Graphics();
        iconBg.beginFill(0x000000, 0.45);
        iconBg.lineStyle(1, 0xffffff, 0.35);
        iconBg.drawRoundedRect(-20, -20, 40, 40, 6);
        iconBg.endFill();
        container.addChild(iconBg);
        container._iconBg = iconBg;

        // 아이콘 이미지
        const iconSpr = new Sprite();
        iconSpr.anchor.set(0.5, 0.5);
        const iconBmp = ImageManager.loadHotspotIcon(hs.icon);
        iconSpr.bitmap = iconBmp;
        iconBmp.addLoadListener(() => {
            iconSpr.scale.set(40 / Math.max(iconBmp.width, 1));
        });
        container.addChild(iconSpr);

        // 라벨
        const labelStyle = new PIXI.TextStyle({
            fontFamily: "sans-serif",
            fontSize: 12,
            fontWeight: "bold",
            fill: "#ffffff",
            dropShadow: true,
            dropShadowColor: "#000000",
            dropShadowBlur: 3,
            dropShadowDistance: 1
        });
        const label = new PIXI.Text(hs.name, labelStyle);
        label.anchor.set(0.5, 0);
        label.y = 24;
        container.addChild(label);

        this.addChild(container);
        this._hotspotSprites.push(container);
    }
};

// ── 사이드바 ──
Scene_Hub.prototype._createSidebar = function(lay) {
    var sideX = lay.sideX;
    var sideW = lay.sideW;
    var gh = Graphics.height;

    // 상태+의뢰 윈도우 (상단)
    var statusH = 230;
    this._statusWindow = new Window_HubStatus(sideX, 0, sideW, statusH);
    this._statusWindow.setQuestClickHandler(function() {
        // "의뢰" 메뉴 호출
        if (typeof Scene_CustomMenu !== "undefined") {
            SceneManager.push(Scene_CustomMenu);
            if (SceneManager._nextScene) SceneManager._nextScene._initialTab = "journal";
        }
    });
    this._statusWindow.refresh();
    this.addChild(this._statusWindow);

    // 메뉴 윈도우
    var menuY = statusH;
    this._drawSidebarMenu_v2(sideX, menuY, sideW);

    // 파티 윈도우 (하단 - 0.7 스케일)
    var menuH = this._hubMenuWindow ? this._hubMenuWindow.height : 120;
    var partyY = menuY + menuH;
    var partyH = gh - partyY;
    this._partyWindow = new Window_HubParty(sideX, partyY, sideW, partyH);
    this._partyWindow.setHandler("ok", this._onPartyOk.bind(this));
    this._partyWindow.setHandler("cancel", this._onPartyCancel.bind(this));
    this._partyWindow._onUpExit = this._partyToMenu.bind(this);
    this._partyWindow.refresh();
    this.addChild(this._partyWindow);

    // 키보드 네비게이션: 핫스팟 ↔ 메뉴/파티 자유 이동
    this._hotspotMode = false;
    this._selectedHotspotIdx = 0;
    this._hotspotHighlight = null;
    var scene = this;
    // 메뉴/파티에서 왼쪽키 → 핫스팟 모드
    if (this._hubMenuWindow) {
        this._hubMenuWindow._onLeftExit = function() { scene._enterHotspotMode(); };
    }
    if (this._partyWindow) {
        this._partyWindow._onLeftExit = function() { scene._enterHotspotMode(); };
    }
};

Scene_Hub.prototype._enterHotspotMode = function() {
    if (!this._hotspotSprites || this._hotspotSprites.length === 0) return;
    this._hotspotMode = true;
    if (this._hubMenuWindow) { this._hubMenuWindow.deactivate(); this._hubMenuWindow.deselect(); }
    if (this._partyWindow) { this._partyWindow.deactivate(); this._partyWindow.deselect(); }
    this._selectedHotspotIdx = Math.min(this._selectedHotspotIdx, this._hotspotSprites.length - 1);
    this._updateHotspotHighlight();
    SoundManager.playCursor();
};

Scene_Hub.prototype._exitHotspotMode = function() {
    this._hotspotMode = false;
    this._clearHotspotHighlight();
    if (this._hubMenuWindow) { this._hubMenuWindow.activate(); this._hubMenuWindow.select(0); }
};

Scene_Hub.prototype._updateHotspotHighlight = function() {
    this._clearHotspotHighlight();
    if (!this._hotspotSprites || this._selectedHotspotIdx < 0) return;
    var hs = this._hotspotSprites[this._selectedHotspotIdx];
    if (!hs) return;
    var gfx = new PIXI.Graphics();
    gfx.lineStyle(2, 0x64B4FF, 0.9);
    gfx.drawRoundedRect(-24, -24, 48, 48, 8);
    hs.addChild(gfx);
    this._hotspotHighlight = gfx;
    // 호버 효과도 강제 적용
    hs._hoverT = 1;
};

Scene_Hub.prototype._clearHotspotHighlight = function() {
    if (this._hotspotHighlight && this._hotspotHighlight.parent) {
        this._hotspotHighlight.parent.removeChild(this._hotspotHighlight);
    }
    this._hotspotHighlight = null;
};

Scene_Hub.prototype._updateHotspotKeyboard = function() {
    if (!this._hotspotMode) return;
    if (!this._hotspotSprites || this._hotspotSprites.length === 0) return;
    var len = this._hotspotSprites.length;
    var changed = false;

    if (Input.isRepeated("right")) {
        // 오른쪽 → 메뉴로 복귀
        this._exitHotspotMode();
        return;
    }
    if (Input.isRepeated("up")) {
        this._selectedHotspotIdx = (this._selectedHotspotIdx - 1 + len) % len;
        changed = true;
    }
    if (Input.isRepeated("down")) {
        this._selectedHotspotIdx = (this._selectedHotspotIdx + 1) % len;
        changed = true;
    }
    if (Input.isRepeated("left")) {
        // 왼쪽도 이전 핫스팟으로 이동
        this._selectedHotspotIdx = (this._selectedHotspotIdx - 1 + len) % len;
        changed = true;
    }
    if (changed) {
        SoundManager.playCursor();
        this._updateHotspotHighlight();
    }
    if (Input.isTriggered("ok")) {
        var hs = this._hotspotSprites[this._selectedHotspotIdx];
        if (hs && hs._hsData) {
            SoundManager.playOk();
            this._onHotspotClick(hs._hsData);
        }
    }
    if (Input.isTriggered("cancel")) {
        SoundManager.playCancel();
        this._exitHotspotMode();
    }
};

Scene_Hub.prototype._drawSidebarMenu_v2 = function(sideX, menuY, sideW) {
    var menuWin = new Window_HubMenu(sideX, menuY, sideW);
    menuWin.setHandler("menu", this._onHubMenuOk.bind(this));
    menuWin.setHandler("cancel", this._onHubCancelSafe.bind(this));
    menuWin._onDownExit = this._menuToParty.bind(this);
    menuWin.activate();
    menuWin.select(0);
    this.addChild(menuWin);
    this._hubMenuWindow = menuWin;
};

// (상태 블록은 Window_HubStatus로 이전됨)

// (_drawInlineBar는 Window_HubStatus._drawGauge로 이전됨)

// (의뢰 블록은 Window_HubStatus로 이전됨)

// (메뉴 블록은 _drawSidebarMenu_v2로 이전됨)

// 취소 버튼 — 아무 반응 없음 (freeze 방지)
Scene_Hub.prototype._onHubCancelSafe = function() {
    if (this._hubMenuWindow) this._hubMenuWindow.activate();
};

Scene_Hub.prototype._onMenuCancel = function() {
    if (this._hubMenuWindow) {
        this._hubMenuWindow.deactivate();
        this._hubMenuWindow.deselect();
    }
    if (this._partyWindow) {
        this._partyWindow.activate();
        this._partyWindow.select(0);
    }
};

// 메뉴 → 파티 자연 전환 (방향키 아래 / 마우스 호버)
Scene_Hub.prototype._menuToParty = function() {
    if (this._hubMenuWindow) {
        this._hubMenuWindow.deactivate();
        this._hubMenuWindow.deselect();
    }
    if (this._partyWindow) {
        this._partyWindow.activate();
        // 마우스 위치에 해당하는 항목 선택, 없으면 첫 번째
        var hi = this._partyWindow.hitIndex();
        this._partyWindow.select(hi >= 0 ? hi : 0);
    }
};

// 파티 → 메뉴 자연 전환 (방향키 위 / 마우스 호버)
Scene_Hub.prototype._partyToMenu = function() {
    if (this._partyWindow) {
        this._partyWindow.deactivate();
        this._partyWindow.deselect();
    }
    if (this._hubMenuWindow) {
        this._hubMenuWindow.activate();
        // 마우스 위치에 해당하는 항목 선택, 없으면 마지막 행 첫 번째
        var hi = this._hubMenuWindow.hitIndex();
        if (hi >= 0) {
            this._hubMenuWindow.select(hi);
        } else {
            var lastRow = Math.ceil(this._hubMenuWindow.maxItems() / this._hubMenuWindow.maxCols()) - 1;
            this._hubMenuWindow.select(lastRow * this._hubMenuWindow.maxCols());
        }
    }
};

Scene_Hub.prototype._onPartyOk = function() {
    var idx = this._partyWindow.index();
    var members = $gameParty.members();
    if (idx >= 0 && idx < members.length) {
        var actor = members[idx];
        var portraits = this._partyWindow._partyPortraits;
        if (portraits && portraits[idx]) {
            this._openPortraitDropdown(portraits[idx], this._partyWindow.x);
            return; // 드롭다운이 열렸으므로 파티 윈도우를 재활성화하지 않음
        }
    }
    this._partyWindow.activate();
};

Scene_Hub.prototype._onPartyCancel = function() {
    if (this._partyWindow) {
        this._partyWindow.deactivate();
        this._partyWindow.deselect();
    }
    if (this._hubMenuWindow) {
        this._hubMenuWindow.activate();
        this._hubMenuWindow.select(0);
    }
};

Scene_Hub.prototype._onHubMenuOk = function() {
    var win = this._hubMenuWindow;
    var idx = win.index();
    var items = ["소지품", "전술", "일지", "관계", "편성", "의뢰", "회의", "설정"];
    var name = items[idx] || "";
    win.activate();
    this._onMenuClick(name);
};

// (파티원 블록은 Window_HubParty로 이전됨)



// ── 파티 초상화 클릭 → 드롭다운 메뉴 ──
Scene_Hub.prototype._updatePartyPortraits = function() {
    if (!this._partyWindow || !this._partyWindow._partyPortraits) return;
    if (this._partyWindow._partyPortraits.length === 0) return;
    if (this._portraitDropdown) return;
    var tx = TouchInput.x;
    var ty = TouchInput.y;
    var pw = this._partyWindow;
    var ox = pw.x + pw.padding;
    var oy = pw.y + pw.padding;
    for (var i = 0; i < pw._partyPortraits.length; i++) {
        var p = pw._partyPortraits[i];
        var dx = tx - (ox + p.cx);
        var dy = ty - (oy + p.cy);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < p.r + 4 && TouchInput.isTriggered()) {
            // 마우스 클릭 시 파티 윈도우 활성화 + 해당 인덱스 선택
            if (this._hubMenuWindow) { this._hubMenuWindow.deactivate(); this._hubMenuWindow.deselect(); }
            pw.activate();
            pw.select(i);
            this._openPortraitDropdown(p, 0);
            break;
        }
    }
};

Scene_Hub.prototype._openPortraitDropdown = function(portraitData, sideX) {
    SoundManager.playOk();
    this._closePortraitDropdown();
    var actor = $gameActors.actor(portraitData.actorId);
    if (!actor) return;
    // 위치 계산: 초상화 글로벌 좌표 기준
    var pw = this._partyWindow;
    var globalX = pw.x + pw.padding + portraitData.cx;
    var globalY = pw.y + pw.padding + portraitData.cy;
    var ddW = 160;
    var ddH = 130;
    var ddX = globalX - portraitData.r - ddW - 8;
    var ddY = globalY - ddH / 2;
    if (ddY < 4) ddY = 4;
    if (ddY + ddH > Graphics.height - 4) ddY = Graphics.height - 4 - ddH;
    if (ddX < 4) ddX = globalX + portraitData.r + 8;
    var dd = new Window_HubDropdown(ddX, ddY);
    dd.setActorId(portraitData.actorId);
    dd.setHandler("talk", this._onDropdownTalk.bind(this));
    dd.setHandler("info", this._onDropdownInfo.bind(this));
    dd.setHandler("close", this._closePortraitDropdown.bind(this));
    dd.setHandler("cancel", this._closePortraitDropdown.bind(this));
    dd.activate();
    dd.select(0);
    this.addChild(dd);
    this._portraitDropdown = dd;
    this._dropdownJustOpened = true;
    // 모달이 열릴 때 파티 윈도우 입력 차단
    if (this._partyWindow) this._partyWindow.deactivate();
};

Scene_Hub.prototype._onDropdownTalk = function() {
    var dd = this._portraitDropdown;
    var actorId = dd ? dd._actorId : 0;
    this._closePortraitDropdown();
    this._onPortraitMenuAction("talk", actorId);
};

Scene_Hub.prototype._onDropdownInfo = function() {
    var dd = this._portraitDropdown;
    var actorId = dd ? dd._actorId : 0;
    this._closePortraitDropdown();
    this._onPortraitMenuAction("info", actorId);
};

Scene_Hub.prototype._updatePortraitDropdown = function() {
    if (!this._portraitDropdown) return;
    if (this._dropdownJustOpened) { this._dropdownJustOpened = false; return; }
    // Window_Command handles cursor + ok/cancel internally
    // Just check for outside clicks to close
    var dd = this._portraitDropdown;
    if (TouchInput.isTriggered()) {
        var tx = TouchInput.x;
        var ty = TouchInput.y;
        if (tx < dd.x || tx > dd.x + dd.width || ty < dd.y || ty > dd.y + dd.height) {
            this._closePortraitDropdown();
        }
    }
};

Scene_Hub.prototype._onPortraitMenuAction = function(action, actorId) {
    SoundManager.playOk();
    this._closePortraitDropdown();
    if (action === "talk") {
        try {
            console.log("[HubSystem] Starting conversation with actorId:", actorId);
            Scene_Conversation._targetActorId = actorId;
            SceneManager.snapForBackground();
            SceneManager.push(Scene_Conversation);
        } catch(e) { console.error("[HubSystem] Talk error:", e); }
    } else if (action === "info") {
        if (typeof Scene_CustomMenu !== "undefined") {
            Scene_CustomMenu._initialTab = "character";
            Scene_CustomMenu._initialActorId = actorId;
            SceneManager.push(Scene_CustomMenu);
        }
    }
};

Scene_Hub.prototype._closePortraitDropdown = function() {
    if (this._portraitDropdown) {
        this._portraitDropdown.deactivate();
        this.removeChild(this._portraitDropdown);
        this._portraitDropdown = null;
    }
    // 모달이 닫히면 파티 윈도우 입력 복원
    if (this._partyWindow) this._partyWindow.activate();
};

// ── 한글 변환 ──
Scene_Hub.prototype._todKorean = function(tod) {
    const map = { dawn: "새벽", morning: "오전", afternoon: "오후", evening: "저녁", night: "밤" };
    return map[tod] || tod;
};
Scene_Hub.prototype._weatherKorean = function(w) {
    const map = { clear: "맑음", rain: "비", snow: "눈", fog: "안개", storm: "폭풍" };
    return map[w] || w;
};

// ── 업데이트 (핫스팟 호버 + 클릭) ──
Scene_Hub.prototype.update = function() {
    Scene_MenuBase.prototype.update.call(this);
    this._updateMouseWindowFocus();
    this._updateHotspots();
    this._updateMenuButtons();
    this._updatePartyPortraits();
    this._updatePortraitDropdown();
    this._updateHotspotKeyboard();
};

// ── 마우스 호버 기반 윈도우 자동 포커스 전환 ──
// 마우스는 호버 위치가 곧 포커스. 키보드는 activate/deactivate 기반.
Scene_Hub.prototype._updateMouseWindowFocus = function() {
    // 드롭다운 모달이 열려 있으면 전환하지 않음
    if (this._portraitDropdown) return;
    // 핫스팟 모드에서는 전환하지 않음
    if (this._hotspotMode) return;
    // 마우스 호버 이동이 없으면 건너뜀 (isMoved는 드래그 전용, isHovered가 일반 호버)
    if (!TouchInput.isHovered() && !TouchInput.isMoved()) return;

    var mx = TouchInput.x;
    var my = TouchInput.y;
    var menuWin = this._hubMenuWindow;
    var partyWin = this._partyWindow;

    var inMenu = menuWin && mx >= menuWin.x && mx < menuWin.x + menuWin.width &&
                 my >= menuWin.y && my < menuWin.y + menuWin.height;
    var inParty = partyWin && mx >= partyWin.x && mx < partyWin.x + partyWin.width &&
                  my >= partyWin.y && my < partyWin.y + partyWin.height;

    if (inMenu && menuWin && !menuWin.active) {
        // 파티 → 메뉴 전환
        if (partyWin && partyWin.active) {
            partyWin.deactivate();
            partyWin.deselect();
        }
        menuWin.activate();
        var hi = menuWin.hitIndex();
        menuWin.select(hi >= 0 ? hi : 0);
    } else if (inParty && partyWin && !partyWin.active) {
        // 메뉴 → 파티 전환
        if (menuWin && menuWin.active) {
            menuWin.deactivate();
            menuWin.deselect();
        }
        partyWin.activate();
        var hi2 = partyWin.hitIndex();
        partyWin.select(hi2 >= 0 ? hi2 : 0);
    }
};

Scene_Hub.prototype._updateHotspots = function() {
    if (!this._hotspotSprites) return;
    const tx = TouchInput.x;
    const ty = TouchInput.y;

    for (const hs of this._hotspotSprites) {
        const dx = tx - hs.x;
        const dy = ty - hs.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isHover = dist < 30;

        if (isHover) {
            hs._hoverT = Math.min(1, (hs._hoverT || 0) + 0.1);
        } else {
            hs._hoverT = Math.max(0, (hs._hoverT || 0) - 0.1);
        }

        const s = 1 + hs._hoverT * 0.15;
        hs.scale.set(s, s);
        hs._iconBg.alpha = 0.45 + hs._hoverT * 0.25;

        if (isHover && TouchInput.isTriggered()) {
            this._onHotspotClick(hs._hsData);
        }
    }
};

Scene_Hub.prototype._updateMenuButtons = function() {
    if (!this._hubMenuWindow) return;
    // 드롭다운이 열려있으면 메뉴 비활성화
    if (this._portraitDropdown) {
        this._hubMenuWindow.deactivate();
        return;
    }
    // 마우스 호버 기반 활성화는 _updateMouseWindowFocus에서 처리
};

Scene_Hub.prototype._onHotspotClick = function(hs) {
    SoundManager.playOk();
    if (hs.target === "worldmap") {
        SceneManager.goto(Scene_Map);
        return;
    }
    if (hs.facilityId) {
        $gameSystem._hubData.currentFacilityId = hs.facilityId;
        // Scene_Facility는 Phase 4에서 구현 — 일단 로그만
        console.log("Enter facility:", hs.facilityId, hs.name);
        SoundManager.playOk();
    }
};

Scene_Hub.prototype._onMenuClick = function(menuName) {
    SoundManager.playOk();
    const menuMap = {
        "소지품": "items",
        "전술":   "tactics",
        "일지":   "journal",
        "관계":   "bonds",
        "편성":   "party",
        "의뢰":   "quest",
        "회의":   "meeting",
        "설정":   "system"
    };
    // Scene_CustomMenu가 있으면 해당 탭으로 진입
    if (typeof Scene_CustomMenu !== "undefined") {
        const tabName = menuMap[menuName];
        if (tabName) {
            Scene_CustomMenu._initialTab = tabName;
            SceneManager.push(Scene_CustomMenu);
        }
    }
};

// 취소 키로 거점을 빠져나가지 않도록
Scene_Hub.prototype.createButtons = function() {
    // Scene_MenuBase의 기본 버튼 생성 억제
};

// =========================================================================
//  설정 상수
// =========================================================================
const WORLD_MAP_ID = 3;       // 월드맵 맵 ID
const VEHICLE_CHARSET = 'Vehicle';  // 월드맵 탈것 캐릭터 파일명
const VEHICLE_INDEX = 5;      // 캐릭터 인덱스 (마차)

// =========================================================================
//  Scene_Map → Scene_Hub 전환 훅
// =========================================================================

const _hubFindLocationByMapId = function(mapId) {
    if (!$dataLocations) return null;
    for (let i = 1; i < $dataLocations.length; i++) {
        if ($dataLocations[i] && $dataLocations[i].mapId === mapId) return $dataLocations[i];
    }
    return null;
};

const _hubFindFacilityByMapId = function(mapId) {
    if (!$dataFacilities) return null;
    for (let i = 1; i < $dataFacilities.length; i++) {
        if ($dataFacilities[i] && $dataFacilities[i].mapId === mapId) return $dataFacilities[i];
    }
    return null;
};

// Scene_Map.onMapLoaded 훅
// - 월드맵 진입 → 탈것 스프라이트만 활성화 (follower 숨김)
// - 거점맵 진입 → 모든 액터 스프라이트 숨김 후 Scene_Hub 전환
const _SM_onMapLoaded = Scene_Map.prototype.onMapLoaded;
Scene_Map.prototype.onMapLoaded = function() {
    _SM_onMapLoaded.call(this);
    const mapId = $gameMap.mapId();

    if (mapId === WORLD_MAP_ID) {
        // 월드맵: 탈것 그래픽 적용 (메인 액터만 탈것으로 표시, follower 숨김)
        _hubApplyVehicleGraphic();
    } else if ($gameSystem._hubData) {
        var loc = _hubFindLocationByMapId(mapId);
        if (loc) {
            // 거점맵: 우선 모든 액터 스프라이트 비활성화
            _hubHideAllActorSprites();
            // 화면을 즉시 검정으로 (빈 맵이 보이지 않도록)
            if (this._fadeSprite) this._fadeSprite.opacity = 255;
            // 그 후 Scene_Hub로 전환
            $gameSystem._hubData.currentLocationId = loc.id;
            $gameSystem._hubData.currentFacilityId = 0;
            SceneManager.goto(Scene_Hub);
            return;
        }
    }
};


// Game_Player.performTransfer 가로채기 — 거점 맵이면 전송 취소 + 플래그 설정
const _GP_performTransfer = Game_Player.prototype.performTransfer;
Game_Player.prototype.performTransfer = function() {
    if (this.isTransferring()) {
        // 월드맵에서 거점 맵으로 이동할 때만 가로채기
        if ($gameMap.mapId() === WORLD_MAP_ID) {
            var destMapId = this._newMapId;
            var loc = _hubFindLocationByMapId(destMapId);
            if (loc && $gameSystem._hubData) {
                // 거점 맵 → 전송 취소, 플래그만 세움 (Scene_Map.update에서 안전하게 전환)
                this._transferring = false;
                $gameSystem._hubData._pendingHubId = loc.id;
                return;
            }
        }
    }
    _GP_performTransfer.call(this);
};

// =========================================================================
//  액터 스프라이트 전체 숨김 — 거점 진입 시 빈 맵에 캐릭터가 보이지 않도록
// =========================================================================
const _hubHideAllActorSprites = function() {
    $gamePlayer.setTransparent(true);
    var followers = $gamePlayer.followers();
    if (followers) {
        for (var i = 0; i < followers._data.length; i++) {
            followers._data[i].setTransparent(true);
        }
    }
};

// =========================================================================
//  월드맵 탈것 그래픽 시스템
// =========================================================================

// 탈것 그래픽 적용 (원래 그래픽 저장 후 교체)
const _hubApplyVehicleGraphic = function() {
    const player = $gamePlayer;
    const hub = $gameSystem._hubData;
    // 이미 탈것 상태면 스킵
    if (hub._isOnVehicle) return;
    // 원래 그래픽 저장
    hub._savedCharName = player.characterName();
    hub._savedCharIndex = player.characterIndex();
    hub._isOnVehicle = true;
    // 탈것 그래픽 적용
    player.setImage(VEHICLE_CHARSET, VEHICLE_INDEX);
    player.setTransparent(false);  // 허브 전환 시 설정된 투명 해제
    // 이동속도 올리기 (월드맵은 빠르게)
    hub._savedMoveSpeed = player.moveSpeed();
    player.setMoveSpeed(5);  // 빠른 이동
    // 동료(follower) 스프라이트 완전 숨기기 — 캐릭터 이미지 제거
    var followers = $gamePlayer.followers();
    if (followers) {
        hub._savedFollowerGraphics = [];
        for (var i = 0; i < followers._data.length; i++) {
            var f = followers._data[i];
            hub._savedFollowerGraphics.push({
                name: f.characterName(),
                index: f.characterIndex()
            });
            f.setImage('', 0);
            f.setTransparent(true);
        }
    }
};

// 원래 그래픽 복원
const _hubRestorePlayerGraphic = function() {
    const player = $gamePlayer;
    const hub = $gameSystem._hubData;
    if (!hub._isOnVehicle) return;
    // 원래 그래픽 복원
    if (hub._savedCharName) {
        player.setImage(hub._savedCharName, hub._savedCharIndex || 0);
    }
    if (hub._savedMoveSpeed) {
        player.setMoveSpeed(hub._savedMoveSpeed);
    }
    hub._isOnVehicle = false;
    // 동료(follower) 스프라이트 복원
    var followers = $gamePlayer.followers();
    if (followers && hub._savedFollowerGraphics) {
        for (var i = 0; i < followers._data.length; i++) {
            var f = followers._data[i];
            var saved = hub._savedFollowerGraphics[i];
            if (saved) {
                f.setImage(saved.name, saved.index);
            }
            f.setTransparent(false);
        }
        hub._savedFollowerGraphics = null;
    }
};

// =========================================================================
//  핫스팟 클릭 → 맵 전환
// =========================================================================

Scene_Hub.prototype._onHotspotClick = function(hotspot) {
    // "외출" 핫스팟 — 페이드 아웃 후 월드맵으로 이동
    if (hotspot.target === "worldmap" || hotspot.id === "exit") {
        const targetMap = hotspot.targetMapId || WORLD_MAP_ID;
        const loc = $dataLocations[$gameSystem._hubData.currentLocationId];
        const wx = (loc && loc.worldMapX) ? loc.worldMapX : 0;
        const wy = (loc && loc.worldMapY) ? loc.worldMapY : 0;
        $gamePlayer.reserveTransfer(targetMap, wx, wy, 2, 0);
        // 짧은 페이드 아웃 후 전환
        var scene = SceneManager._scene;
        if (scene && scene.startFadeOut) {
            scene.startFadeOut(10, false);
            setTimeout(function() { SceneManager.goto(Scene_Map); }, 180);
        } else {
            SceneManager.goto(Scene_Map);
        }
        return;
    }
    // 시설 등 다른 핫스팟 — 하위 맵으로 전환
    if (hotspot.targetMapId && hotspot.targetMapId > 0) {
        $gamePlayer.reserveTransfer(hotspot.targetMapId, 0, 0, 2, 0);
        SceneManager.goto(Scene_Map);
    }
};

// =========================================================================
//  유틸: 맵 노트태그 기반 거점/시설 ID 파싱 (폴백용)
// =========================================================================
Scene_Hub.prototype._parseMapNoteHub = function(note) {
    const m = note.match(/<hubLocation:(\d+)>/i);
    return m ? parseInt(m[1]) : 0;
};

Scene_Hub.prototype._parseMapNoteFacility = function(note) {
    const m = note.match(/<hubFacility:(\d+)>/i);
    return m ? parseInt(m[1]) : 0;
};


// =========================================================================
//  월드맵 마을 이름 라벨 시스템
// =========================================================================

/**
 * Sprite_HubLabel — 월드맵 위에 거점 이름을 표시하는 플로팅 텍스트 스프라이트
 */
function Sprite_HubLabel() {
    this.initialize.apply(this, arguments);
}
Sprite_HubLabel.prototype = Object.create(Sprite.prototype);
Sprite_HubLabel.prototype.constructor = Sprite_HubLabel;

Sprite_HubLabel.prototype.initialize = function(name, mapX, mapY) {
    Sprite.prototype.initialize.call(this);
    this._labelName = name;
    this._mapX = mapX;
    this._mapY = mapY;  // 마커 타일 바로 위에 살짝 띄워 표시
    this._floatPhase = Math.random() * Math.PI * 2;
    this._createBitmap();
};

Sprite_HubLabel.prototype._createBitmap = function() {
    const fontSize = 16;
    const padding = 6;
    // Measure text width
    const tempBmp = new Bitmap(1, 1);
    tempBmp.fontSize = fontSize;
    tempBmp.fontFace = 'GameFont, sans-serif';
    const tw = tempBmp.measureTextWidth(this._labelName);
    const bw = Math.ceil(tw + padding * 2);
    const bh = fontSize + padding * 2;

    this.bitmap = new Bitmap(bw, bh);
    this.bitmap.fontSize = fontSize;
    this.bitmap.fontFace = 'GameFont, sans-serif';
    this.bitmap.fontBold = true;

    // White text + thick black outline (no background)
    this.bitmap.textColor = '#FFFFFF';
    this.bitmap.outlineColor = '#000000';
    this.bitmap.outlineWidth = 5;
    this.bitmap.drawText(this._labelName, 0, 0, bw, bh, 'center');

    this.anchor.x = 0.5;
    this.anchor.y = 1.0;
};

Sprite_HubLabel.prototype.update = function() {
    Sprite.prototype.update.call(this);
    // Follow map scroll — 마커 타일 바로 위에 라벨 표시
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();
    this.x = Math.round(($gameMap.adjustX(this._mapX) + 0.5) * tw);
    // 마커 타일 상단에서 4px 위 (anchor.y=1.0이므로 텍스트 하단 기준)
    this.y = Math.round($gameMap.adjustY(this._mapY) * th) - 4;
    // 살짝 플로팅 (1px 범위)
    this._floatPhase += 0.02;
    this.y += Math.sin(this._floatPhase) * 1;
};

// -- Spriteset_Map 훅: 월드맵일 때 라벨 스프라이트 생성 --
const _SM_createCharacters = Spriteset_Map.prototype.createCharacters;
Spriteset_Map.prototype.createCharacters = function() {
    _SM_createCharacters.call(this);
    this._hubLabels = [];
    if ($gameMap.mapId() !== WORLD_MAP_ID) return;
    if (!window.$dataLocations) return;

    for (let i = 1; i < $dataLocations.length; i++) {
        const loc = $dataLocations[i];
        if (!loc || !loc.worldMapX) continue;
        const label = new Sprite_HubLabel(
            loc.name,
            loc.worldMapX,
            loc.worldMapY
        );
        label.z = 9;
        this._tilemap.addChild(label);
        this._hubLabels.push(label);
    }
};



// =========================================================================
//  월드맵 사이드바 (Scene_Map 오버레이)
// =========================================================================

/**
 * WorldMapSidebar — 월드맵에서 Scene_Hub와 동일한 우측 사이드바를 표시하는 PIXI 컨테이너
 */
function WorldMapSidebar() {
    PIXI.Container.call(this);
    this._menuButtons = [];
    this._partyPortraits = [];
    this._build();
}
WorldMapSidebar.prototype = Object.create(PIXI.Container.prototype);
WorldMapSidebar.prototype.constructor = WorldMapSidebar;

WorldMapSidebar.prototype._build = function() {
    var lay = calcLayout();
    var gh = Graphics.height;
    var sideW = lay.sideW;
    var sideX = lay.sideX;

    this._sideW = sideW;
    this._sideX = sideX;

    // 상태+의뢰 윈도우
    var statusH = 230;
    this._statusWindow = new Window_HubStatus(sideX, 0, sideW, statusH);
    this._statusWindow.setQuestClickHandler(function() {
        if (typeof Scene_CustomMenu !== "undefined") {
            SceneManager.push(Scene_CustomMenu);
            if (SceneManager._nextScene) SceneManager._nextScene._initialTab = "journal";
        }
    });
    this._statusWindow.refresh();
    var scene = SceneManager._scene;
    if (scene) scene.addChild(this._statusWindow);

    // 메뉴 윈도우
    var menuY = statusH;
    this._drawMenu_v2(sideX, menuY, sideW);

    // 파티 윈도우
    var menuH = this._hubMenuWindow ? this._hubMenuWindow.height : 120;
    var partyY = menuY + menuH;
    var partyH = gh - partyY;
    this._partyWindow = new Window_HubParty(sideX, partyY, sideW, partyH);
    this._partyWindow.setHandler("ok", this._onPartyOk.bind(this));
    this._partyWindow.setHandler("cancel", this._onPartyCancel.bind(this));
    this._partyWindow.refresh();
    if (scene) scene.addChild(this._partyWindow);
};

WorldMapSidebar.prototype._drawMenu_v2 = function(sideX, menuY, sideW) {
    var menuWin = new Window_HubMenu(sideX, menuY, sideW);
    menuWin.setHandler("menu", this._onWMMenuOk.bind(this));
    menuWin.setHandler("cancel", this._onWMCancelSafe.bind(this));
    menuWin.deactivate();
    menuWin.deselect();
    var scene = SceneManager._scene;
    if (scene) scene.addChild(menuWin);
    this._hubMenuWindow = menuWin;
    this._menuMode = false;  // 기본: 이동 모드 (메뉴 비활성)
};

// 월드맵 키보드 모드 전환: 이동 ↔ 메뉴
WorldMapSidebar.prototype.activateMenu = function() {
    this._menuMode = true;
    if (this._hubMenuWindow) {
        this._hubMenuWindow.activate();
        this._hubMenuWindow.select(0);
    }
};

WorldMapSidebar.prototype.deactivateMenu = function() {
    this._menuMode = false;
    if (this._hubMenuWindow) {
        this._hubMenuWindow.deactivate();
        this._hubMenuWindow.deselect();
    }
    if (this._partyWindow) {
        this._partyWindow.deactivate();
        this._partyWindow.deselect();
    }
};

// (상태 블록은 Window_HubStatus로 이전됨)

// (_drawBar는 Window_HubStatus._drawGauge로 이전됨)

// (의뢰 블록은 Window_HubStatus로 이전됨)

// (메뉴 블록은 _drawMenu_v2로 이전됨)

WorldMapSidebar.prototype._onWMMenuOk = function() {
    var win = this._hubMenuWindow;
    var idx = win.index();
    var items = ["소지품", "전술", "일지", "관계", "편성", "의뢰", "회의", "설정"];
    var name = items[idx] || "";
    win.activate();
    this._onMenuClick(name);
};

WorldMapSidebar.prototype._onWMCancelSafe = function() {
    // 월드맵에서 cancel = 이동 모드로 복귀
    this.deactivateMenu();
};

WorldMapSidebar.prototype._onMenuCancel = function() {
    // 메뉴 취소 → 이동 모드로 복귀
    this.deactivateMenu();
    SoundManager.playCancel();
};

WorldMapSidebar.prototype._onPartyOk = function() {
    var idx = this._partyWindow.index();
    var members = $gameParty.members();
    if (idx >= 0 && idx < members.length) {
        var actor = members[idx];
        var portraits = this._partyWindow._partyPortraits;
        if (portraits && portraits[idx]) {
            this._openWMPortraitDropdown(portraits[idx], this._partyWindow.x);
            return; // 드롭다운이 열렸으므로 파티 윈도우를 재활성화하지 않음
        }
    }
    this._partyWindow.activate();
};

WorldMapSidebar.prototype._onPartyCancel = function() {
    if (this._partyWindow) {
        this._partyWindow.deactivate();
        this._partyWindow.deselect();
    }
    if (this._hubMenuWindow) {
        this._hubMenuWindow.activate();
        this._hubMenuWindow.select(0);
    }
};

// (파티원 블록은 Window_HubParty로 이전됨)



// ── 메뉴 버튼 호버/클릭 업데이트 ──
WorldMapSidebar.prototype.updateInput = function() {
    this._updateWMMouseFocus();
    this._updateWMPortraits();
    this._updateWMDropdown();
    if (!this._hubMenuWindow) return;
    // Deactivate menu while dropdown is open
    if (this._wmDropdown) {
        this._hubMenuWindow.deactivate();
        return;
    }
    if (!this._hubMenuWindow.active) {
        var tx = TouchInput.x;
        var ty = TouchInput.y;
        var win = this._hubMenuWindow;
        if (tx >= win.x && tx <= win.x + win.width && ty >= win.y && ty <= win.y + win.height) {
            if (TouchInput.isTriggered()) {
                win.activate();
                win.select(0);
            }
        }
    }
};

// ── 월드맵 사이드바 파티 초상화 클릭 ──
// ── 월드맵 마우스 호버 기반 윈도우 자동 포커스 전환 ──
WorldMapSidebar.prototype._updateWMMouseFocus = function() {
    // 이동 모드에서는 전환하지 않음
    if (!this._menuMode) return;
    // 드롭다운이 열려있으면 전환하지 않음
    if (this._wmDropdown) return;
    // 마우스 이동이 없으면 건너뜀
    if (!TouchInput.isHovered() && !TouchInput.isMoved()) return;

    var mx = TouchInput.x;
    var my = TouchInput.y;
    var menuWin = this._hubMenuWindow;
    var partyWin = this._partyWindow;

    var inMenu = menuWin && mx >= menuWin.x && mx < menuWin.x + menuWin.width &&
                 my >= menuWin.y && my < menuWin.y + menuWin.height;
    var inParty = partyWin && mx >= partyWin.x && mx < partyWin.x + partyWin.width &&
                  my >= partyWin.y && my < partyWin.y + partyWin.height;

    if (inMenu && menuWin && !menuWin.active) {
        if (partyWin && partyWin.active) {
            partyWin.deactivate();
            partyWin.deselect();
        }
        menuWin.activate();
        var hi = menuWin.hitIndex();
        menuWin.select(hi >= 0 ? hi : 0);
    } else if (inParty && partyWin && !partyWin.active) {
        if (menuWin && menuWin.active) {
            menuWin.deactivate();
            menuWin.deselect();
        }
        partyWin.activate();
        var hi2 = partyWin.hitIndex();
        partyWin.select(hi2 >= 0 ? hi2 : 0);
    }
};

WorldMapSidebar.prototype._updateWMPortraits = function() {
    if (!this._partyWindow || !this._partyWindow._partyPortraits) return;
    if (this._partyWindow._partyPortraits.length === 0) return;
    if (this._wmDropdown) return;
    var tx = TouchInput.x;
    var ty = TouchInput.y;
    var pw = this._partyWindow;
    var ox = pw.x + pw.padding;
    var oy = pw.y + pw.padding;
    for (var i = 0; i < pw._partyPortraits.length; i++) {
        var p = pw._partyPortraits[i];
        var dx = tx - (ox + p.cx);
        var dy = ty - (oy + p.cy);
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < p.r + 4 && TouchInput.isTriggered()) {
            this._openWMDropdown(p);
            break;
        }
    }
};

WorldMapSidebar.prototype._openWMDropdown = function(portraitData) {
    SoundManager.playOk();
    this._closeWMDropdown();
    var actor = $gameActors.actor(portraitData.actorId);
    if (!actor) return;
    // 위치: 초상화 글로벌 좌표 기준
    var pw = this._partyWindow;
    var globalX = pw.x + pw.padding + portraitData.cx;
    var globalY = pw.y + pw.padding + portraitData.cy;
    var ddW = 160;
    var ddH = 130;
    var ddX = globalX - portraitData.r - ddW - 8;
    var ddY = globalY - ddH / 2;
    if (ddY < 4) ddY = 4;
    if (ddY + ddH > Graphics.height - 4) ddY = Graphics.height - 4 - ddH;
    if (ddX < 4) ddX = globalX + portraitData.r + 8;
    var dd = new Window_HubDropdown(ddX, ddY);
    dd.setActorId(portraitData.actorId);
    dd.setHandler("talk", this._onWMDropdownTalk.bind(this));
    dd.setHandler("info", this._onWMDropdownInfo.bind(this));
    dd.setHandler("close", this._closeWMDropdown.bind(this));
    dd.setHandler("cancel", this._closeWMDropdown.bind(this));
    dd.activate();
    dd.select(0);
    var scene = SceneManager._scene;
    if (scene) scene.addChild(dd);
    this._wmDropdown = dd;
    this._wmDropdownJustOpened = true;
    // 모달이 열릴 때 파티 윈도우 입력 차단
    if (this._partyWindow) this._partyWindow.deactivate();
};

WorldMapSidebar.prototype._onWMDropdownTalk = function() {
    var dd = this._wmDropdown;
    var actorId = dd ? dd._actorId : 0;
    this._closeWMDropdown();
    this._onWMDropdownAction("talk", actorId);
};

WorldMapSidebar.prototype._onWMDropdownInfo = function() {
    var dd = this._wmDropdown;
    var actorId = dd ? dd._actorId : 0;
    this._closeWMDropdown();
    this._onWMDropdownAction("info", actorId);
};

WorldMapSidebar.prototype._updateWMDropdown = function() {
    if (!this._wmDropdown) return;
    if (this._wmDropdownJustOpened) { this._wmDropdownJustOpened = false; return; }
    // Window_Command handles cursor + ok/cancel
    var dd = this._wmDropdown;
    if (TouchInput.isTriggered()) {
        var tx = TouchInput.x;
        var ty = TouchInput.y;
        if (tx < dd.x || tx > dd.x + dd.width || ty < dd.y || ty > dd.y + dd.height) {
            this._closeWMDropdown();
        }
    }
};

WorldMapSidebar.prototype._onWMDropdownAction = function(action, actorId) {
    SoundManager.playOk();
    this._closeWMDropdown();
    if (action === "talk") {
        Scene_Conversation._targetActorId = actorId;
        SceneManager.snapForBackground();
        SceneManager.push(Scene_Conversation);
    } else if (action === "info") {
        if (typeof Scene_CustomMenu !== "undefined") {
            Scene_CustomMenu._initialTab = "character";
            Scene_CustomMenu._initialActorId = actorId;
            SceneManager.push(Scene_CustomMenu);
        }
    }
};

WorldMapSidebar.prototype._closeWMDropdown = function() {
    if (this._wmDropdown) {
        this._wmDropdown.deactivate();
        var scene = SceneManager._scene;
        if (scene) scene.removeChild(this._wmDropdown);
        this._wmDropdown = null;
    }
    // 모달이 닫히면 파티 윈도우 입력 복원
    if (this._partyWindow) this._partyWindow.activate();
};

WorldMapSidebar.prototype._onMenuClick = function(menuName) {
    SoundManager.playOk();
    var menuMap = {
        "소지품": "items",  "전술": "tactics", "일지": "journal", "관계": "bonds",
        "편성": "party",   "의뢰": "quest",   "회의": "meeting", "설정": "system"
    };
    if (typeof Scene_CustomMenu !== "undefined") {
        var tabName = menuMap[menuName];
        if (tabName) {
            Scene_CustomMenu._initialTab = tabName;
            SceneManager.push(Scene_CustomMenu);
        }
    }
};

// ── 사이드바 영역 내 터치 흡수 (맵 이동 방지) ──
WorldMapSidebar.prototype.containsPoint = function(x) {
    return x >= this._sideX;
};

WorldMapSidebar.prototype.destroy = function() {
    var scene = SceneManager._scene;
    if (scene) {
        if (this._statusWindow) scene.removeChild(this._statusWindow);
        if (this._hubMenuWindow) scene.removeChild(this._hubMenuWindow);
        if (this._partyWindow) scene.removeChild(this._partyWindow);
    }
    PIXI.Container.prototype.destroy.call(this, { children: true });
};


// =========================================================================
//  Scene_Map 훅 — 월드맵일 때 사이드바 생성 + 업데이트
// =========================================================================

var _SM_createAllWindows = Scene_Map.prototype.createAllWindows;
Scene_Map.prototype.createAllWindows = function() {
    _SM_createAllWindows.call(this);
    if ($gameMap.mapId() === WORLD_MAP_ID) {
        this._worldMapSidebar = new WorldMapSidebar();
        this.addChild(this._worldMapSidebar);
        // 월드맵 진입 시 페이드 인
        this.startFadeIn(12, false);
    }
};

var _SM_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    // 월드맵 → 거점 전환 플래그 체크
    var hubData = $gameSystem._hubData;
    var pendingId = hubData ? hubData._pendingHubId : 0;
    if (pendingId) {
        hubData._pendingHubId = 0;
        // 우선 모든 액터 스프라이트 비활성화
        _hubHideAllActorSprites();
        // 화면을 즉시 검정으로 (월드맵 이벤트/라벨이 잔류하지 않도록)
        if (this._fadeSprite) this._fadeSprite.opacity = 255;
        // 탈것 그래픽을 원래대로 복원 (다음 월드맵 진입 시 다시 적용됨)
        _hubRestorePlayerGraphic();
        // Scene_Hub 전환
        hubData.currentLocationId = pendingId;
        hubData.currentFacilityId = 0;
        SceneManager.goto(Scene_Hub);
        return;
    }
    _SM_update.call(this);
    if (this._worldMapSidebar) {
        this._worldMapSidebar.updateInput();
        // 이동 모드에서 ESC/취소 → 메뉴 모드 전환
        if (!this._worldMapSidebar._menuMode) {
            if (Input.isTriggered("cancel") || Input.isTriggered("menu")) {
                this._worldMapSidebar.activateMenu();
                SoundManager.playOk();
            }
        }
    }
};

// 월드맵 사이드바 영역에서는 플레이어 이동 입력 차단
var _GP_moveByInput = Game_Player.prototype.moveByInput;
Game_Player.prototype.moveByInput = function() {
    if ($gameMap.mapId() === WORLD_MAP_ID) {
        // 메뉴 모드일 때 키보드 이동 완전 차단
        var scene = SceneManager._scene;
        if (scene && scene._worldMapSidebar && scene._worldMapSidebar._menuMode) return;
        // 마우스/터치가 사이드바 영역 안이면 이동 차단
        if (TouchInput.isPressed()) {
            var lay = calcLayout(); var sideX = lay.sideX;
            if (TouchInput.x >= sideX) return;
        }
    }
    _GP_moveByInput.call(this);
};



// =========================================================================
//  Scene_Conversation — 1:1 대화 인터랙션 시스템
// =========================================================================
// 진입 순서: (1) 블러 배경 (2) 레터박스 슬라이드 (3) 스탠딩+대사 페이드인
// 레이어 순서(뒤→앞): 블러배경 → 레터박스 → 스탠딩 → 말풍선 → 선택지

function Scene_Conversation() {
    this.initialize.apply(this, arguments);
}
Scene_Conversation.prototype = Object.create(Scene_Base.prototype);
Scene_Conversation.prototype.constructor = Scene_Conversation;

Scene_Conversation._targetActorId = 1;

Scene_Conversation.prototype.initialize = function() {
    Scene_Base.prototype.initialize.call(this);
    this._phase = "init"; // init → blur → letterbox → fadein → idle → fadeout → done
    this._timer = 0;
};

Scene_Conversation.prototype.create = function() {
    Scene_Base.prototype.create.call(this);
    console.log("[Conversation] create() starting, actorId:", Scene_Conversation._targetActorId);
    this._actorId = Scene_Conversation._targetActorId;
    var actor = $gameActors.actor(this._actorId);
    this._actorName = actor ? actor.name() : "???";

    // --- (1) 블러 배경: 이전 씬 스냅샷 ---
    this._bgSprite = new Sprite();
    this._bgSprite.bitmap = SceneManager.backgroundBitmap();
    this.addChild(this._bgSprite);

    // 블러 필터
    try {
        this._blurFilter = new PIXI.filters.BlurFilter();
        this._blurFilter.blur = 0;
        this._bgSprite.filters = [this._blurFilter];
        this._hasBlur = true;
    } catch(e) {
        console.warn("[Conversation] BlurFilter unavailable:", e);
        this._blurFilter = { blur: 0 };
        this._hasBlur = false;
    }

    // --- (2) 레터박스 (위/아래 검은 바) ---
    var barH = Math.floor(Graphics.height * 0.1); // 화면 높이의 10%
    this._letterboxH = barH;

    this._topBar = new PIXI.Graphics();
    this._topBar.beginFill(0x000000, 1);
    this._topBar.drawRect(0, 0, Graphics.width, barH);
    this._topBar.endFill();
    this._topBar.y = -barH; // 화면 밖에서 시작
    this.addChild(this._topBar);

    this._bottomBar = new PIXI.Graphics();
    this._bottomBar.beginFill(0x000000, 1);
    this._bottomBar.drawRect(0, 0, Graphics.width, barH);
    this._bottomBar.endFill();
    this._bottomBar.y = Graphics.height; // 화면 밖에서 시작
    this.addChild(this._bottomBar);

    // --- (3) 스탠딩 이미지 컨테이너 ---
    this._standingContainer = new PIXI.Container();
    this._standingContainer.alpha = 0;
    this.addChild(this._standingContainer);

    // 스탠딩 이미지 로드
    this._standingSprite = new Sprite();
    this._standingContainer.addChild(this._standingSprite);
    this._faceRect = [216, 30, 400, 400]; // 기본값
    this._loadStanding();

    // --- (4) 말풍선 꼬리 (PIXI — 윈도우 뒤에 그려짐) ---
    this._tailGraphics = new PIXI.Graphics();
    this._tailGraphics.alpha = 0;
    this.addChild(this._tailGraphics);

    // --- (5) RMMZ 윈도우: 이름, 말풍선, 선택지 ---
    this._nameWindow = new Window_ConvName(0, 0);
    this._nameWindow.openness = 0;
    this._nameWindow.opacity = 0;  // 페이드인 전 투명
    this.addChild(this._nameWindow);

    this._messageWindow = new Window_ConvMessage(0, 0, 400, 120);
    this._messageWindow.openness = 0;
    this._messageWindow.opacity = 0;
    this.addChild(this._messageWindow);

    this._choiceWindow = new Window_ConvChoice(0, 0);
    this._choiceWindow.openness = 0;
    this._choiceWindow.opacity = 0;
    this._choiceWindow.deactivate();
    this._choiceWindow.setHandler("choice", this._onChoiceOk.bind(this));
    this._choiceWindow.setHandler("cancel", this._startFadeOut.bind(this));
    this.addChild(this._choiceWindow);

    // 초기 대사 설정 (테스트용)
    this._dialogueQueue = [
        { text: "안녕하세요, 무슨 일이신가요?", choices: null },
        { text: "무엇을 도와드릴까요?", choices: [
            { label: "근황을 묻는다", next: 2 },
            { label: "함께 전투하자고 한다", next: 3 },
            { label: "대화를 마친다", next: -1 }
        ]},
        { text: "별일 없이 잘 지내고 있습니다.", choices: null },
        { text: "좋습니다, 힘을 합칩시다!", choices: null },
    ];
    this._dialogueIndex = 0;

    this._phase = "blur";
    this._timer = 0;
};

Scene_Conversation.prototype._loadStanding = function() {
    var actorId = this._actorId;
    var self = this;
    this._standingLoaded = false;

    // StandingManager에서 스탠딩 이미지 로드 시도
    if (typeof StandingManager !== "undefined") {
        var fr = StandingManager.getFaceRect(actorId, "normal");
        if (fr) this._faceRect = fr;
        var mode = StandingManager.getMode ? StandingManager.getMode(actorId) : "single";
        if (mode === "layered") {
            StandingManager.composeBitmap(actorId, "normal", "default").then(function(bmp) {
                if (bmp) {
                    self._standingSprite.bitmap = bmp;
                    self._standingLoaded = true;
                    self._positionStanding();
                    console.log("[Conversation] Layered standing loaded for actor", actorId);
                } else {
                    self._createPlaceholder();
                }
            });
            return;
        } else {
            var bmp = StandingManager.loadBitmap(actorId, "normal");
            if (bmp) {
                self._standingSprite.bitmap = bmp;
                bmp.addLoadListener(function() {
                    self._standingLoaded = true;
                    self._positionStanding();
                    console.log("[Conversation] Standing loaded for actor", actorId, bmp.width, "x", bmp.height);
                });
                return;
            }
        }
    }

    // StandingManager에 이미지가 없으면 플레이스홀더
    this._createPlaceholder();
};

Scene_Conversation.prototype._createPlaceholder = function() {
    console.log("[Conversation] No standing image found, creating placeholder");
    var actor = $gameActors.actor(this._actorId);
    var phH = Math.floor(Graphics.height * 0.70);
    var phW = Math.floor(phH * 0.5);
    var bmp = new Bitmap(phW, phH);

    // 단색 반투명 실루엣
    var ctx = bmp.context;
    ctx.fillStyle = "rgba(60, 80, 120, 0.5)";
    // 머리
    var headR = phW * 0.18;
    var headCX = phW * 0.5;
    var headCY = phH * 0.12;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    // 몸통
    ctx.beginPath();
    ctx.moveTo(phW * 0.25, phH * 0.22);
    ctx.lineTo(phW * 0.75, phH * 0.22);
    ctx.lineTo(phW * 0.8, phH * 0.55);
    ctx.lineTo(phW * 0.7, phH);
    ctx.lineTo(phW * 0.3, phH);
    ctx.lineTo(phW * 0.2, phH * 0.55);
    ctx.closePath();
    ctx.fill();

    // 테두리 (윤곽 강조)
    ctx.strokeStyle = "rgba(150, 180, 220, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(headCX, headCY, headR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(phW * 0.25, phH * 0.22);
    ctx.lineTo(phW * 0.75, phH * 0.22);
    ctx.lineTo(phW * 0.8, phH * 0.55);
    ctx.lineTo(phW * 0.7, phH);
    ctx.lineTo(phW * 0.3, phH);
    ctx.lineTo(phW * 0.2, phH * 0.55);
    ctx.closePath();
    ctx.stroke();

    // 이름 (가슴 부분)
    if (actor) {
        bmp.fontSize = 28;
        bmp.textColor = "rgba(255,255,255,0.8)";
        bmp.outlineColor = "rgba(0,0,0,0.6)";
        bmp.outlineWidth = 3;
        bmp.drawText(actor.name(), 0, phH * 0.3, phW, 36, "center");
    }

    // ? 마크 (머리 부분)
    bmp.fontSize = Math.floor(headR * 1.4);
    bmp.textColor = "rgba(255,255,255,0.7)";
    bmp.outlineColor = "rgba(0,0,0,0.4)";
    bmp.outlineWidth = 2;
    bmp.drawText("?", headCX - headR, headCY - headR * 0.6, headR * 2, headR * 2, "center");

    this._standingSprite.bitmap = bmp;
    this._standingLoaded = true;
    this._faceRect = [
        Math.floor(phW * 0.3), Math.floor(headCY - headR),
        Math.floor(headR * 2.4), Math.floor(headR * 2.4)
    ];
    this._positionStanding();
};

Scene_Conversation.prototype._positionStanding = function() {
    var bmp = this._standingSprite.bitmap;
    if (!bmp || !bmp.isReady()) return;
    // 스탠딩 높이: 화면 높이의 70% (키 낮춤)
    var standH = Graphics.height * 0.70;
    var scale = standH / bmp.height;
    var standW = bmp.width * scale;
    this._standingSprite.scale.set(scale, scale);
    // 위치: 중앙에서 살짝 좌측, 하단이 화면 끝에 닿도록
    this._standingSprite.x = Graphics.width * 0.4 - standW / 2;
    this._standingSprite.y = Graphics.height - standH;
};

Scene_Conversation.prototype.update = function() {
    Scene_Base.prototype.update.call(this);
    switch (this._phase) {
        case "blur":     this._updateBlur(); break;
        case "letterbox": this._updateLetterbox(); break;
        case "fadein":   this._updateFadeIn(); break;
        case "idle":     this._updateIdle(); break;
        case "fadeout":  this._updateFadeOut(); break;
        case "done":     this.popScene(); break;
    }
};

// --- Phase: 블러 ---
Scene_Conversation.prototype._updateBlur = function() {
    this._timer++;
    var dur = 20; // 20프레임 동안 블러 증가
    var t = Math.min(this._timer / dur, 1);
    if (this._hasBlur) this._blurFilter.blur = t * 8;
    if (t >= 1) {
        this._phase = "letterbox";
        this._timer = 0;
    }
};

// --- Phase: 레터박스 슬라이드 ---
Scene_Conversation.prototype._updateLetterbox = function() {
    this._timer++;
    var dur = 15;
    var t = Math.min(this._timer / dur, 1);
    var ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
    this._topBar.y = -this._letterboxH + ease * this._letterboxH;
    this._bottomBar.y = Graphics.height - ease * this._letterboxH;
    if (t >= 1) {
        this._phase = "fadein";
        this._timer = 0;
        this._showDialogue(0);
    }
};

// --- Phase: 스탠딩+대사 페이드인 ---
Scene_Conversation.prototype._updateFadeIn = function() {
    this._timer++;
    var dur = 15;
    var t = Math.min(this._timer / dur, 1);
    var ease = t; // linear
    this._standingContainer.alpha = ease;
    this._tailGraphics.alpha = ease;
    var op = Math.floor(ease * 255);
    this._nameWindow.opacity = op;
    this._messageWindow.opacity = op;
    this._choiceWindow.opacity = op;
    if (t >= 1) {
        this._phase = "idle";
        this._timer = 0;
        // 윈도우 openness 보장
        this._nameWindow.open();
        this._messageWindow.open();
        if (this._choiceWindow._list && this._choiceWindow._list.length > 0) {
            this._choiceWindow.open();
            this._choiceWindow.activate();
            this._choiceWindow.select(0);
        }
    }
};

// --- Phase: 대기 (입력 처리) ---
Scene_Conversation.prototype._updateIdle = function() {
    // 선택지 활성 중이면 Window_Command가 입력 처리
    if (this._choiceWindow.active) return;
    // ESC/취소 → 대화 종료
    if (Input.isTriggered("cancel") || Input.isTriggered("escape")) {
        this._startFadeOut();
        return;
    }
    // 클릭/확인 → 다음 대사
    if (TouchInput.isTriggered() || Input.isTriggered("ok")) {
        this._dialogueIndex++;
        if (this._dialogueIndex >= this._dialogueQueue.length) {
            this._startFadeOut();
        } else {
            this._showDialogue(this._dialogueIndex);
        }
    }
};

Scene_Conversation.prototype._onChoiceOk = function() {
    var idx = this._choiceWindow.index();
    var choices = this._dialogueQueue[this._dialogueIndex].choices;
    if (!choices || !choices[idx]) return;
    var next = choices[idx].next;
    if (next === -1) {
        this._startFadeOut();
    } else {
        this._dialogueIndex = next;
        this._showDialogue(this._dialogueIndex);
    }
};

// --- Phase: 페이드아웃 ---
Scene_Conversation.prototype._startFadeOut = function() {
    this._phase = "fadeout";
    this._timer = 0;
};

Scene_Conversation.prototype._updateFadeOut = function() {
    this._timer++;
    var dur = 20;
    var t = Math.min(this._timer / dur, 1);
    var ease = 1 - Math.pow(1 - t, 3);
    // 스탠딩+UI 페이드아웃
    this._standingContainer.alpha = 1 - ease;
    this._tailGraphics.alpha = 1 - ease;
    var op = Math.floor((1 - ease) * 255);
    this._nameWindow.opacity = op;
    this._messageWindow.opacity = op;
    this._choiceWindow.opacity = op;
    // 레터박스 퇴장
    this._topBar.y = -ease * this._letterboxH;
    this._bottomBar.y = Graphics.height - this._letterboxH + ease * this._letterboxH;
    // 블러 해제
    if (this._hasBlur) this._blurFilter.blur = 8 * (1 - ease);
    if (t >= 1) {
        this._phase = "done";
    }
};

// --- 대사 표시 ---
Scene_Conversation.prototype._showDialogue = function(index) {
    var d = this._dialogueQueue[index];
    if (!d) return;
    this._activeChoices = null;

    // 스탠딩 위치 갱신
    this._positionStanding();

    // 말풍선 위치: faceRect 기반
    this._buildBubble(d.text);

    // 선택지
    if (d.choices) {
        this._buildChoices(d.choices);
    } else {
        this._clearChoices();
    }
};

Scene_Conversation.prototype._buildBubble = function(text) {
    // 두상 스크린 좌표 계산
    var bmp = this._standingSprite.bitmap;
    var standH = Graphics.height * 0.70;
    var scale = (bmp && bmp.isReady()) ? standH / bmp.height : 1;
    var standW = (bmp && bmp.isReady()) ? bmp.width * scale : Graphics.width * 0.2;
    var standX = Graphics.width * 0.4 - standW / 2;
    var standY = Graphics.height - standH;
    var fr = this._faceRect;
    var headX = standX + fr[0] * scale + fr[2] * scale / 2;
    var headY = standY + fr[1] * scale + fr[3] * scale / 2;

    // 말풍선 윈도우 크기 계산
    var maxW = Math.floor(Graphics.width * 0.42);
    this._messageWindow.resetFontSettings();
    var textW = Math.min(this._messageWindow.textSizeEx(text).width + 48, maxW);
    textW = Math.max(textW, 280);
    var textH = this._messageWindow.textSizeEx(text).height + 24;
    textH = Math.max(textH, 60);
    var winW = textW + 24;
    var winH = textH + 24;

    // 말풍선 위치: 화면 중앙-우측 (60% 지점)
    var winX = Math.floor(Graphics.width * 0.6 - winW / 2);
    var winY = Math.floor(Graphics.height * 0.4 - winH / 2);
    if (winX < 20) winX = 20;
    if (winX + winW > Graphics.width - 20) winX = Graphics.width - 20 - winW;
    if (winY < this._letterboxH + 10) winY = this._letterboxH + 10;

    // 메시지 윈도우 배치
    this._messageWindow.move(winX, winY, winW, winH);
    this._messageWindow.createContents();
    this._messageWindow.drawTextEx(text, 4, 4, winW - 32);
    if (this._phase !== "fadein") this._messageWindow.open();

    // 이름 윈도우 배치
    this._nameWindow.setName(this._actorName);
    var nameW = this._nameWindow.windowWidth();
    this._nameWindow.move(winX, winY - this._nameWindow.windowHeight() - 4, nameW, this._nameWindow.windowHeight());
    if (this._phase !== "fadein") this._nameWindow.open();

    // 꼬리 (PIXI — 윈도우 뒤에 그리지만 z축상 스탠딩과 윈도우 사이)
    this._tailGraphics.clear();
    var tailStartY = Math.max(winY + 10, Math.min(headY, winY + winH - 10));
    var tailEndX = winX + (headX - winX) * 0.6;
    var tailEndY = tailStartY + (headY - tailStartY) * 0.6;
    this._tailGraphics.beginFill(0x000033, 0.6);
    this._tailGraphics.lineStyle(2, 0xffffff, 0.4);
    this._tailGraphics.moveTo(winX, tailStartY - 8);
    this._tailGraphics.lineTo(winX, tailStartY + 8);
    this._tailGraphics.lineTo(tailEndX, tailEndY);
    this._tailGraphics.closePath();
    this._tailGraphics.endFill();

    // 말풍선 좌표 저장 (선택지 배치용)
    this._bubbleBounds = { x: winX, y: winY, w: winW, h: winH };
};

Scene_Conversation.prototype._buildChoices = function(choices) {
    var bb = this._bubbleBounds || { x: Graphics.width * 0.35, y: Graphics.height * 0.3, w: Graphics.width * 0.4, h: 100 };
    this._choiceWindow.setChoices(choices);
    var choiceW = 300;
    var choiceH = this._choiceWindow.fittingHeight(choices.length);
    var cx = bb.x + bb.w - choiceW;
    var cy = bb.y + bb.h + 12;
    // 하단 레터박스 침범 방지
    var maxY = Graphics.height - this._letterboxH - 10;
    if (cy + choiceH > maxY) cy = maxY - choiceH;
    this._choiceWindow.move(cx, cy, choiceW, choiceH);
    if (this._phase !== "fadein") {
        this._choiceWindow.open();
        this._choiceWindow.activate();
        this._choiceWindow.select(0);
    }
};

Scene_Conversation.prototype._clearChoices = function() {
    this._choiceWindow.close();
    this._choiceWindow.deactivate();
};


// ============================================================
// Window_ConvName — 이름 표시 윈도우 (RMMZ 스킨)
// ============================================================
function Window_ConvName() { this.initialize.apply(this, arguments); }
Window_ConvName.prototype = Object.create(Window_Base.prototype);
Window_ConvName.prototype.constructor = Window_ConvName;
Window_ConvName.prototype.initialize = function(x, y) {
    var h = this.windowHeight();
    Window_Base.prototype.initialize.call(this, new Rectangle(x, y, 160, h));
    this._name = "";
};
Window_ConvName.prototype.windowHeight = function() { return 48; };
Window_ConvName.prototype.windowWidth = function() {
    if (!this._name) return 120;
    this.resetFontSettings();
    var tw = this.textWidth(this._name);
    return tw + 40;
};
Window_ConvName.prototype.setName = function(name) {
    this._name = name;
    var w = this.windowWidth();
    this.move(this.x, this.y, w, this.windowHeight());
    this.createContents();
    this.resetFontSettings();
    this.changeTextColor(ColorManager.normalColor());
    this.drawText(this._name, 0, 0, this.innerWidth, "left");
};

// ============================================================
// Window_ConvMessage — 대사 윈도우 (RMMZ 스킨)
// ============================================================
function Window_ConvMessage() { this.initialize.apply(this, arguments); }
Window_ConvMessage.prototype = Object.create(Window_Base.prototype);
Window_ConvMessage.prototype.constructor = Window_ConvMessage;
Window_ConvMessage.prototype.initialize = function(x, y, w, h) {
    Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
};

// ============================================================
// Window_ConvChoice — 선택지 윈도우 (RMMZ 커서 선택)
// ============================================================
function Window_ConvChoice() { this.initialize.apply(this, arguments); }
Window_ConvChoice.prototype = Object.create(Window_Command.prototype);
Window_ConvChoice.prototype.constructor = Window_ConvChoice;
Window_ConvChoice.prototype.initialize = function(x, y) {
    this._choices = [];
    Window_Command.prototype.initialize.call(this, new Rectangle(x, y, 300, 200));
    this.deactivate();
    this.close();
};
Window_ConvChoice.prototype.makeCommandList = function() {
    for (var i = 0; i < this._choices.length; i++) {
        this.addCommand(this._choices[i].label, "choice");
    }
};
Window_ConvChoice.prototype.setChoices = function(choices) {
    this._choices = choices || [];
    this.clearCommandList();
    this.makeCommandList();
    this.refresh();
};



// ── Window_HubStatus — 상태+의뢰 표시 (RMMZ Window_Base) ──

function Window_HubStatus() { this.initialize.apply(this, arguments); }
Window_HubStatus.prototype = Object.create(Window_Base.prototype);
Window_HubStatus.prototype.constructor = Window_HubStatus;
Window_HubStatus.prototype.initialize = function(x, y, w, h) {
    Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
    this.opacity = 200;
    this._hubData = null;
    this._questRects = [];
    this._onQuestClick = null;
};
Window_HubStatus.prototype.setQuestClickHandler = function(fn) { this._onQuestClick = fn; };
Window_HubStatus.prototype.update = function() {
    Window_Base.prototype.update.call(this);
    if (this._onQuestClick && TouchInput.isTriggered()) {
        var touchPos = new Point(TouchInput.x, TouchInput.y);
        var localPos = this.worldTransform.applyInverse(touchPos);
        var tx = localPos.x - this.padding;
        var ty = localPos.y - this.padding;
        for (var i = 0; i < this._questRects.length; i++) {
            var r = this._questRects[i];
            if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) {
                SoundManager.playOk();
                this._onQuestClick();
                return;
            }
        }
    }
};
Window_HubStatus.prototype.refresh = function() {
    if (this.contents.width < 1 && this.innerWidth > 0) {
        this.createContents();
    }
    this.contents.clear();
    var hub = $gameSystem._hubData;
    if (!hub) return;
    var cw = this.innerWidth;
    var ch = this.innerHeight;
    var gPad = 6;
    var qPad = 6;

    // ══ 하단 기준 역산: 의뢰 → 자금 → 게이지 → 시간 ══
    // 1) 의뢰 섹션 높이 계산
    var quests = hub.activeQuests ? hub.activeQuests.filter(function(q) { return q.status === "active"; }) : [];
    var questRows = Math.max(1, Math.min(quests.length, 3));
    var questContentH = qPad + 18 + questRows * 20 + qPad;
    // 2) 자금 그리드 높이 계산
    var fundContentH = gPad + 18 + 14 + gPad; // pad + fundLine(18) + supplyLine(14) + pad
    // 3) 고정 상단: 시간(22px) + 여유(2px) = 24px
    var topH = 24;
    // 4) 게이지 높이: 16px × 2 + 간격 4px = 36px
    var gaugeH = 36;

    // ── 배치 계산 (하단 정렬) ──
    var questStartY = ch - questContentH;
    var fundStartY = questStartY - 3 - fundContentH; // 3px gap between fund and quest
    // 게이지는 시간 아래 ~ 자금 위 사이에서 가운데 배치
    var gaugeZoneTop = topH;
    var gaugeZoneBot = fundStartY - 2;
    var gaugeStartY = gaugeZoneTop + Math.max(0, Math.floor((gaugeZoneBot - gaugeZoneTop - gaugeH) / 2));

    // ══ 렌더링 ══

    // ── 일차 + 시간 (큰 글씨) ──
    var timeStr = hub.dayCount + "일차  " + this._todKorean(hub.timeOfDay);
    this.contents.fontSize = 16;
    this.contents.textColor = "#ffffff";
    this.contents.outlineColor = "#000000";
    this.contents.outlineWidth = 3;
    this.drawText(timeStr, 0, -4, cw * 0.65, "left");
    var weatherStr = this._weatherKorean(hub.weather);
    this.contents.fontSize = 13;
    this.contents.textColor = "#85B7EB";
    this.drawText(weatherStr, 0, -2, cw, "right");
    this.contents.outlineWidth = 0;

    // ── 사기 게이지 ──
    this._drawGauge(0, gaugeStartY, cw, 16, hub.morale, hub.moraleMax, "#1D9E75", "사기", true);
    // ── 행동력 게이지 ──
    this._drawGauge(0, gaugeStartY + 20, cw, 16, hub.actionPoints, hub.actionPointsMax, "#2968A8", "행동력", false);

    // ── 자금+보급 그리드 (그리드 내 수직 가운데 정렬) ──
    var fundTextH = 18 + 14; // 두 줄 합산 높이
    var fy = fundStartY + Math.floor((fundContentH - fundTextH) / 2);
    this.contents.fontSize = 13;
    this.contents.textColor = "#dddddd";
    this.contents.outlineColor = "#000000";
    this.contents.outlineWidth = 2;
    var fundStr = "파티 " + hub.partyFund.toLocaleString() + "G";
    var pw = $gameSystem.leaderPersonalWealth ? $gameSystem.leaderPersonalWealth() : 0;
    fundStr += "  |  개인 " + pw.toLocaleString() + "G";
    this.contents.drawText(fundStr, gPad, fy, cw - gPad * 2, 18, "left");
    fy += 18;
    this.contents.fontSize = 11;
    this.contents.textColor = "#aaaaaa";
    this.contents.drawText("식량12  자재8  재료5", gPad, fy, cw - gPad * 2, 14, "left");
    this.contents.outlineWidth = 0;

    // 자금 그리드 배경
    this._drawRoundedGrid(0, fundStartY, cw, fundContentH);

    // ── 의뢰 섹션 (그리드 내 수직 가운데 정렬) ──
    this._questRects = [];
    var questTextH = 18 + questRows * 20; // 헤더 + 목록
    var qy = questStartY + Math.floor((questContentH - questTextH) / 2);
    // 의뢰 헤더
    this.contents.fontSize = 12;
    this.contents.textColor = "#999999";
    this.contents.drawText("의뢰", qPad, qy, cw * 0.3, 18, "left");
    this.contents.fontSize = 10;
    this.contents.textColor = "#666666";
    this.contents.drawText("▶", 0, qy, cw - qPad, 18, "right");
    qy += 18;

    // 의뢰 목록
    this.contents.fontSize = 13;
    if (quests.length === 0) {
        this.contents.textColor = "#666666";
        this.contents.drawText("수주 중인 의뢰 없음", qPad, qy, cw - qPad * 2, 20, "left");
    } else {
        for (var i = 0; i < Math.min(quests.length, 3); i++) {
            var q = quests[i];
            var dDay = q.dueDateDay - hub.dayCount;
            this.contents.textColor = "#ffffff";
            this.contents.outlineColor = "#000000";
            this.contents.outlineWidth = 2;
            this.contents.drawText(q.destination, qPad, qy, cw * 0.35 - qPad, 20, "left");
            this.contents.textColor = "#bbbbbb";
            this.contents.drawText(q.objective, cw * 0.37, qy, cw * 0.35, 20, "left");
            this.contents.textColor = dDay <= 2 ? "#E24B4A" : "#EF9F27";
            this.contents.drawText("D-" + dDay, 0, qy, cw - qPad, 20, "right");
            this.contents.outlineWidth = 0;
            qy += 20;
        }
    }

    // 의뢰 그리드 배경
    this._drawRoundedGrid(0, questStartY, cw, questContentH);
    this._questRects.push({ x: 0, y: questStartY, w: cw, h: questContentH });
};

Window_HubStatus.prototype._drawRoundedGrid = function(x, y, w, h) {
    var ctx = this.contents._canvas ? this.contents.context : this.contents._context;
    if (!ctx) return;
    var r = 4;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (this.contents._baseTexture) this.contents._baseTexture.update();
};

Window_HubStatus.prototype._drawGauge = function(x, y, w, h, current, max, color, label, isMorale) {
    var ctx = this.contents._canvas ? this.contents.context : this.contents._context;
    var r = Math.floor(h / 2);
    // 둥근 배경
    if (ctx) {
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + h);
        ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        // 둥근 채움
        var ratio = Math.min(1, current / max);
        if (ratio > 0) {
            var fw = Math.max(h, Math.floor(w * ratio));
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + fw - r, y);
            ctx.arc(x + fw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(x + r, y + h);
            ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
        if (this.contents._baseTexture) this.contents._baseTexture.update();
    }
    // 중앙 텍스트: "사기:NN" — 게이지 높이에 맞춰 직접 렌더
    var centerStr = label + ":" + current;
    this.contents.fontSize = 12;
    this.contents.textColor = "#ffffff";
    this.contents.outlineColor = "#000000";
    this.contents.outlineWidth = 3;
    this.contents.drawText(centerStr, x, y, w, h, "center");
    this.contents.outlineWidth = 0;
};

Window_HubStatus.prototype._todKorean = function(tod) {
    var m = { dawn: "새벽", morning: "오전", afternoon: "오후", evening: "저녁", night: "밤" };
    return m[tod] || tod;
};
Window_HubStatus.prototype._weatherKorean = function(w) {
    var m = { clear: "맑음", rain: "비", snow: "눈", fog: "안개", storm: "폭풍" };
    return m[w] || w;
};

// ── Window_HubParty — 초상화 그리드 (RMMZ Window_Selectable) ──

function Window_HubParty() { this.initialize.apply(this, arguments); }
Window_HubParty.prototype = Object.create(Window_Selectable.prototype);
Window_HubParty.prototype.constructor = Window_HubParty;
Window_HubParty.prototype.initialize = function(x, y, w, h) {
    Window_Selectable.prototype.initialize.call(this, new Rectangle(x, y, w, h));
    this.opacity = 200;
    this._partyPortraits = [];
    this._scale = 0.7;
    this._maxItems = 10;
    this._hoveredIndex = -1;
};
Window_HubParty.prototype.maxItems = function() { return this._maxItems; };
Window_HubParty.prototype.maxCols = function() { return 2; };
Window_HubParty.prototype.itemWidth = function() {
    var gap = 3;
    return Math.floor((this.innerWidth - gap) / 2);
};
Window_HubParty.prototype.itemHeight = function() {
    var rows = Math.ceil(this._maxItems / 2);
    var gap = 3;
    return Math.floor((this.innerHeight - (rows - 1) * gap) / rows);
};
Window_HubParty.prototype.itemRect = function(index) {
    var cols = this.maxCols();
    var gap = 3;
    var cellW = this.itemWidth();
    var cellH = this.itemHeight();
    var gridW = cols * cellW + (cols - 1) * gap;
    var offsetX = Math.floor((this.innerWidth - gridW) / 2);
    var col = index % cols;
    var row = Math.floor(index / cols);
    return new Rectangle(
        offsetX + col * (cellW + gap),
        row * (cellH + gap),
        cellW, cellH
    );
};
// 첫 행에서 위키 → 메뉴 윈도우로 자연 전환
Window_HubParty.prototype.cursorUp = function(wrap) {
    var currentRow = Math.floor(this.index() / this.maxCols());
    if (currentRow <= 0) {
        if (this._onUpExit) this._onUpExit();
    } else {
        Window_Selectable.prototype.cursorUp.call(this, wrap);
    }
};
// 좌측 열에서 왼쪽키 → 핫스팟 모드로 전환
Window_HubParty.prototype.cursorLeft = function(wrap) {
    if (this.index() % 2 === 0) {
        if (this._onLeftExit) this._onLeftExit();
    } else {
        Window_Selectable.prototype.cursorLeft.call(this, wrap);
    }
};
// 마우스 호버 시 커서 자동 이동
Window_HubParty.prototype.processTouch = function() {
    if (this.isOpenAndActive()) {
        if (TouchInput.isHovered() || TouchInput.isMoved()) {
            var hitIndex = this.hitIndex();
            if (hitIndex >= 0 && hitIndex !== this.index()) {
                this.select(hitIndex);
                SoundManager.playCursor();
            }
        }
    }
    Window_Selectable.prototype.processTouch.call(this);
};
// RMMZ 커서 사각형은 숨기고, 자체 하이라이트 표시
Window_HubParty.prototype.drawItemBackground = function(index) {
    // 호버/선택 하이라이트는 refresh에서 그림
};
// 커서 이동 시 재그리기 (하이라이트 반영)
Window_HubParty.prototype._onCursorChange = function() {
    this.refresh();
};
Window_HubParty.prototype.select = function(index) {
    var lastIndex = this._index;
    Window_Selectable.prototype.select.call(this, index);
    if (lastIndex !== index) this._onCursorChange();
};
Window_HubParty.prototype.refresh = function() {
    // contents가 0×0이면 재생성 (초기화 타이밍 문제 방어)
    if (this.contents.width < 1 && this.innerWidth > 0) {
        this.createContents();
    }
    this.contents.clear();
    this._partyPortraits = [];
    var members = $gameParty.members();
    var maxSlots = 10;
    var cw = this.innerWidth;
    var ch = this.innerHeight;
    var gap = 3;
    var cols = 2;
    var rows = Math.ceil(maxSlots / cols);
    // 셀 너비: 윈도우 폭을 꽉 채움
    var cellW = Math.floor((cw - gap) / cols);
    // 셀 높이: 윈도우 높이에 10칸이 딱 들어가도록
    var rawCellH = Math.floor((ch - (rows - 1) * gap) / rows);
    // 이름 아래 여백의 70%를 줄임
    var minCellH = Math.floor(cellW * 0.38 * 2 + 4 + 2 + 14 + 4); // pad+portrait+gap+name+smallpad
    var trimAmount = Math.floor((rawCellH - minCellH) * 0.7);
    var cellH = rawCellH - Math.max(0, trimAmount);
    // 초상화 크기는 축소 스케일 유지
    var portraitR = Math.floor(cellW * this._scale * 0.38);

    var y = 0;
    var gridW = cols * cellW + (cols - 1) * gap;
    var offsetX = Math.floor((cw - gridW) / 2);
    for (var i = 0; i < maxSlots; i++) {
        var col = i % cols;
        var row = Math.floor(i / cols);
        var ex = offsetX + col * (cellW + gap);
        var ey = y + row * (cellH + gap);
        // 선택 하이라이트
        if (i === this.index()) {
            this.contents.fillRect(ex, ey, cellW, cellH, "rgba(100,180,255,0.25)");
            // 테두리 강조
            var ctx = this.contents._canvas ? this.contents.context : this.contents._context;
            if (ctx) {
                ctx.save();
                ctx.strokeStyle = "rgba(100,180,255,0.6)";
                ctx.lineWidth = 2;
                ctx.strokeRect(ex + 1, ey + 1, cellW - 2, cellH - 2);
                ctx.restore();
            }
        }
        if (i < members.length) {
            var actor = members[i];
            this._drawPortraitCell(ex, ey, portraitR, cellW, cellH, actor, i === 0);
        } else {
            // 빈 슬롯
                    this.contents.fillRect(ex, ey, cellW, cellH, "rgba(255,255,255,0.08)");
            var ctx2 = this.contents._canvas ? this.contents.context : this.contents._context;
            if (ctx2) {
                ctx2.save();
                ctx2.strokeStyle = "rgba(255,255,255,0.1)";
                ctx2.lineWidth = 1;
                ctx2.strokeRect(ex + 0.5, ey + 0.5, cellW - 1, cellH - 1);
                ctx2.restore();
            }
        }
    }
    // (blt이 자동으로 _baseTexture.update를 호출)
};

Window_HubParty.prototype._drawPortraitCell = function(x0, y0, r, cellW, cellH, actor, isLeader) {
    var contents = this.contents;
    var cellPad = 4;
    var px = x0 + cellPad + r;
    var py = y0 + cellPad + r;
    var diameter = r * 2;
    var faceX = x0 + cellPad;
    var faceY = y0 + cellPad;

    // 셀 배경
    contents.fillRect(x0, y0, cellW, cellH, "rgba(255,255,255,0.08)");

    var stress = actor.stressRating ? actor.stressRating() : "low";
    var ringColor = stress === "low" ? "#1D9E75" : stress === "mid" ? "#EF9F27" : "#E24B4A";

    var faceName = actor.faceName();
    var faceIndex = actor.faceIndex();
    var self = this;

    if (faceName) {
        // 비동기 로드 — 원형 클리핑 + blt
        var faceBmp = ImageManager.loadFace(faceName);
        faceBmp.addLoadListener(function() {
            var pw = ImageManager.faceWidth;
            var ph = ImageManager.faceHeight;
            var sx = (faceIndex % 4) * pw;
            var sy = Math.floor(faceIndex / 4) * ph;
            // 원형 클리핑: tmp 비트맵에 얼굴 → destination-in 마스크 → contents에 blt
            var tmp = new Bitmap(diameter, diameter);
            tmp.blt(faceBmp, sx, sy, pw, ph, 0, 0, diameter, diameter);
            var tmpCtx = tmp.context;
            tmpCtx.globalCompositeOperation = "destination-in";
            tmpCtx.beginPath();
            tmpCtx.arc(r, r, r - 2, 0, Math.PI * 2);
            tmpCtx.fill();
            tmpCtx.globalCompositeOperation = "source-over";
            tmp._baseTexture.update();
            contents.blt(tmp, 0, 0, diameter, diameter, faceX, faceY);
            tmp.destroy();
            // 스트레스 링 (원형 테두리)
            var ctx = contents._canvas ? contents.context : contents._context;
            if (ctx) {
                ctx.save();
                ctx.strokeStyle = ringColor;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            // 파티장 배지 (좌측 상단, 왕관)
            if (isLeader) {
                if (ctx) {
                    var lbR = 8;
                    var lbX = faceX + lbR - 1;
                    var lbY = faceY + lbR - 1;
                    ctx.save();
                    // 원형 배경
                    ctx.beginPath();
                    ctx.arc(lbX, lbY, lbR, 0, Math.PI * 2);
                    ctx.fillStyle = "#DAA520";
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = "#000000";
                    ctx.stroke();
                    // 왕관 도형 (원 중심 기준)
                    var cw = 9, ch = 7;
                    var cx = lbX, cy = lbY + 1;
                    ctx.beginPath();
                    ctx.moveTo(cx - cw/2, cy + ch/2);       // 좌하
                    ctx.lineTo(cx - cw/2, cy - ch/4);       // 좌측 올라감
                    ctx.lineTo(cx - cw/4, cy + ch/6);       // 좌 골
                    ctx.lineTo(cx, cy - ch/2);               // 중앙 꼭지
                    ctx.lineTo(cx + cw/4, cy + ch/6);       // 우 골
                    ctx.lineTo(cx + cw/2, cy - ch/4);       // 우측 올라감
                    ctx.lineTo(cx + cw/2, cy + ch/2);       // 우하
                    ctx.closePath();
                    ctx.fillStyle = "#FFF8DC";
                    ctx.fill();
                    ctx.lineWidth = 0.5;
                    ctx.strokeStyle = "#8B6914";
                    ctx.stroke();
                    ctx.restore();
                }
            }
            // 성별 배지 (우측 하단)
            var genderVal = actor.gender ? actor.gender() : ($dataActors[actor.actorId()] ? $dataActors[actor.actorId()].gender : null);
            if (genderVal && ctx) {
                var badgeR = 7;
                var badgeX = faceX + diameter - badgeR + 1;
                var badgeY = faceY + diameter - badgeR + 1;
                var isMale = (genderVal === "m");
                ctx.save();
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
                ctx.fillStyle = isMale ? "#4488ff" : "#ff4488";
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#000000";
                ctx.stroke();
                ctx.font = "bold 10px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(isMale ? "\u2642" : "\u2640", badgeX, badgeY);
                ctx.restore();
            }
            // 이름
            contents.fontSize = 10;
            contents.textColor = "#ffffff";
            contents.outlineColor = "#000000";
            contents.outlineWidth = 2;
            self.drawText(actor.name(), x0 + cellPad, faceY + diameter + 2, diameter, "center");
            contents.outlineWidth = 0;
            if (contents._baseTexture) contents._baseTexture.update();
        });
    } else {
        // 폴백: 이니셜 원형
        contents.drawCircle(px, py, r - 2, "rgba(85,85,85,0.5)");
        contents.fontSize = r;
        contents.textColor = "#ffffff";
        self.drawText(actor.name().charAt(0), px - r, py - r / 2, r * 2, "center");
        // 이름
        contents.fontSize = 10;
        contents.outlineColor = "#000000";
        contents.outlineWidth = 2;
        self.drawText(actor.name(), x0 + cellPad, faceY + diameter + 2, diameter, "center");
        contents.outlineWidth = 0;
    }

    // 히트 영역
    this._partyPortraits.push({
        cx: px, cy: py, r: r, cellW: cellW, cellH: cellH,
        actorId: actor.actorId()
    });
};

// ── Window_HubMenu — 사이드바 메뉴 (RMMZ Window_Command) ──

function Window_HubMenu() { this.initialize.apply(this, arguments); }
Window_HubMenu.prototype = Object.create(Window_Command.prototype);
Window_HubMenu.prototype.constructor = Window_HubMenu;
Window_HubMenu.prototype.initialize = function(x, y, w) {
    this._menuWidth = w || 200;
    Window_Command.prototype.initialize.call(this, new Rectangle(x, y, this._menuWidth, this.fittingHeight(4)));
    this.opacity = 200;
};
Window_HubMenu.prototype.maxCols = function() { return 2; };
Window_HubMenu.prototype.makeCommandList = function() {
    var items = ["소지품", "전술", "일지", "관계", "편성", "의뢰", "회의", "설정"];
    for (var i = 0; i < items.length; i++) {
        this.addCommand(items[i], "menu", true);
    }
};
Window_HubMenu.prototype.itemWidth = function() {
    return Math.floor((this.innerWidth - this.colSpacing()) / this.maxCols());
};
Window_HubMenu.prototype.itemHeight = function() {
    return Math.floor(this.lineHeight() * 0.9);
};
// 하단 행에서 아래키 → 파티 윈도우로 자연 전환
Window_HubMenu.prototype.cursorDown = function(wrap) {
    var maxRows = Math.ceil(this.maxItems() / this.maxCols());
    var currentRow = Math.floor(this.index() / this.maxCols());
    if (currentRow >= maxRows - 1) {
        // 마지막 행 — 파티 윈도우로 이동
        if (this._onDownExit) this._onDownExit();
    } else {
        Window_Command.prototype.cursorDown.call(this, wrap);
    }
};
// 좌측 열에서 왼쪽키 → 핫스팟 모드로 전환
Window_HubMenu.prototype.cursorLeft = function(wrap) {
    if (this.index() % 2 === 0) {
        // 이미 좌측 열 — 핫스팟으로 포커스 이동
        if (this._onLeftExit) this._onLeftExit();
    } else {
        Window_Command.prototype.cursorLeft.call(this, wrap);
    }
};
// 마우스 호버 시 커서 자동 이동
Window_HubMenu.prototype.processTouch = function() {
    if (this.isOpenAndActive()) {
        if (TouchInput.isHovered() || TouchInput.isMoved()) {
            var hitIndex = this.hitIndex();
            if (hitIndex >= 0 && hitIndex !== this.index()) {
                this.select(hitIndex);
                SoundManager.playCursor();
            }
        }
    }
    Window_Command.prototype.processTouch.call(this);
};
// 선택 항목 하이라이트 — 반투명 밝은 배경
Window_HubMenu.prototype.drawItemBackground = function(index) {
    var rect = this.itemRect(index);
    // 모든 버튼 항상 표시 (반투명 배경)
    this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, "rgba(255,255,255,0.08)");
    // 선택된 버튼만 강조
    if (index === this.index()) {
        this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, "rgba(100,180,255,0.25)");
    }
};
// 선택 변경 시 배경 재그리기
Window_HubMenu.prototype.refreshCursor = function() {
    Window_Command.prototype.refreshCursor.call(this);
    this.refresh();
};

// ── Window_HubDropdown — 초상화 드롭다운 (RMMZ Window_Command) ──

function Window_HubDropdown() { this.initialize.apply(this, arguments); }
Window_HubDropdown.prototype = Object.create(Window_Command.prototype);
Window_HubDropdown.prototype.constructor = Window_HubDropdown;
Window_HubDropdown.prototype.initialize = function(x, y) {
    this._actorId = 0;
    Window_Command.prototype.initialize.call(this, new Rectangle(x, y, 160, this.fittingHeight(3)));
    this.openness = 255;
    this.opacity = 220;
};
Window_HubDropdown.prototype.makeCommandList = function() {
    this.addCommand("대화하기", "talk");
    this.addCommand("인물 정보", "info");
    this.addCommand("닫기", "close");
};
Window_HubDropdown.prototype.setActorId = function(actorId) {
    this._actorId = actorId;
};
// 마우스 호버 시 커서 자동 이동
Window_HubDropdown.prototype.processTouch = function() {
    if (this.isOpenAndActive()) {
        if (TouchInput.isHovered() || TouchInput.isMoved()) {
            var hitIndex = this.hitIndex();
            if (hitIndex >= 0 && hitIndex !== this.index()) {
                this.select(hitIndex);
                SoundManager.playCursor();
            }
        }
    }
    Window_Command.prototype.processTouch.call(this);
};
// 선택 항목 하이라이트
Window_HubDropdown.prototype.drawItemBackground = function(index) {
    var rect = this.itemRect(index);
    if (index === this.index()) {
        this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, "rgba(100,180,255,0.3)");
    }
};
Window_HubDropdown.prototype.refreshCursor = function() {
    Window_Command.prototype.refreshCursor.call(this);
    this.refresh();
};

// --- window에 공개 ---
window.Scene_Conversation = Scene_Conversation;
window.Window_HubDropdown = Window_HubDropdown;
window.WorldMapSidebar = WorldMapSidebar;


})();
