//=============================================================================
// MenuOverhaul.js — Custom Main Menu System
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Custom main menu with Character, Bonds, Items, Tactics, Journal, and System tabs. Replaces default ESC menu.
 * @author GahoRok
 *
 * @param PartyDisplayHeight
 * @text Party Display Height
 * @type number
 * @min 80
 * @max 200
 * @default 120
 * @desc Height of the top party display area in pixels (before scaling).
 *
 * @param CommandWidth
 * @text Command Panel Width
 * @type number
 * @min 140
 * @max 260
 * @default 180
 * @desc Width of the left command panel in pixels (before scaling).
 *
 * @help
 * ============================================================================
 * Menu Overhaul (MenuOverhaul.js)
 * ============================================================================
 *
 * Replaces the default RMMZ ESC menu with a custom 6-tab menu:
 *   1. Character (인물) — Stats radar chart, equipment, profile
 *   2. Bonds (관계) — Relationships + Gaho compatibility
 *   3. Items (소지품) — Grid inventory (GridInventory.js required)
 *   4. Tactics (전술) — Party analysis + skill overview
 *   5. Journal (일지) — Quest / event log
 *   6. System (시스템) — Save / Load / Options
 *
 * Requires: GridInventory.js, GahoSystem.js, StandingManager.js
 *
 * ============================================================================
 */

(function() {
'use strict';

// ═══════════════════════════════════════════════════════════════════
//  0. 파라미터
// ═══════════════════════════════════════════════════════════════════

var _params = PluginManager.parameters('MenuOverhaul');
var PARTY_DISPLAY_H = Number(_params['PartyDisplayHeight'] || 120);
var COMMAND_W       = Number(_params['CommandWidth'] || 180);

/** 해상도 스케일 (SRPG_Core 호환) */
function RS() {
  return Math.min(Graphics.width / 816, Graphics.height / 624);
}


// ═══════════════════════════════════════════════════════════════════
//  1. Scene_Menu 오버라이드 — ESC 키로 커스텀 메뉴 호출
// ═══════════════════════════════════════════════════════════════════

Scene_Map.prototype.callMenu = function() {
  SoundManager.playOk();
  SceneManager.push(Scene_CustomMenu);
  Window_MenuCommand.initCommandPosition();
  $gameTemp.clearDestination();
  if (this._mapNameWindow) this._mapNameWindow.hide();
  this._waitCount = 2;
};


// ═══════════════════════════════════════════════════════════════════
//  2. Scene_CustomMenu
// ═══════════════════════════════════════════════════════════════════

function Scene_CustomMenu() {
  this.initialize.apply(this, arguments);
}

Scene_CustomMenu.prototype = Object.create(Scene_MenuBase.prototype);
Scene_CustomMenu.prototype.constructor = Scene_CustomMenu;

Scene_CustomMenu.prototype.initialize = function() {
  Scene_MenuBase.prototype.initialize.call(this);
  this._activeTab = null;
  this._selectedActorIndex = 0;
};

Scene_CustomMenu.prototype.create = function() {
  Scene_MenuBase.prototype.create.call(this);
  this._createBackground();
  this._createPartyDisplay();
  this._createCommandWindow();
  this._createContentArea();
};

Scene_CustomMenu.prototype.start = function() {
  Scene_MenuBase.prototype.start.call(this);
  this._commandWindow.activate();
};


// --- 배경 ---

Scene_CustomMenu.prototype._createBackground = function() {
  this._bgSprite = new Sprite();
  this._bgSprite.bitmap = new Bitmap(Graphics.width, Graphics.height);
  this._bgSprite.bitmap.fillAll('rgba(0, 0, 0, 0.75)');
  this.addChild(this._bgSprite);
};


// --- 파티 디스플레이 (상단) ---

Scene_CustomMenu.prototype._createPartyDisplay = function() {
  var rs = RS();
  var h = Math.round(PARTY_DISPLAY_H * rs);
  this._partyWindow = new Window_PartyDisplay(0, 0, Graphics.width, h);
  this._partyWindow.setSelectedIndex(this._selectedActorIndex);
  this.addChild(this._partyWindow);
};


// --- 커맨드 (좌측) ---

Scene_CustomMenu.prototype._createCommandWindow = function() {
  var rs = RS();
  var w = Math.round(COMMAND_W * rs);
  var y = this._partyWindow.height;
  var h = Graphics.height - y;
  this._commandWindow = new Window_CustomMenuCommand(0, y, w, h);
  this._commandWindow.setHandler('character', this._onCommandCharacter.bind(this));
  this._commandWindow.setHandler('bonds',     this._onCommandBonds.bind(this));
  this._commandWindow.setHandler('items',     this._onCommandItems.bind(this));
  this._commandWindow.setHandler('tactics',   this._onCommandTactics.bind(this));
  this._commandWindow.setHandler('journal',   this._onCommandJournal.bind(this));
  this._commandWindow.setHandler('system',    this._onCommandSystem.bind(this));
  this._commandWindow.setHandler('cancel',    this.popScene.bind(this));
  this.addChild(this._commandWindow);
};


// --- 콘텐츠 영역 (우측) ---

Scene_CustomMenu.prototype._createContentArea = function() {
  var x = this._commandWindow.width;
  var y = this._partyWindow.height;
  var w = Graphics.width - x;
  var h = Graphics.height - y;
  this._contentRect = { x: x, y: y, w: w, h: h };

  // 각 탭별 Window/Container를 여기에 생성
  // Phase 3~7에서 개별 구현 — 현재는 플레이스홀더
  this._contentWindows = {};
  this._createPlaceholder();
};

Scene_CustomMenu.prototype._createPlaceholder = function() {
  var r = this._contentRect;
  this._placeholderWindow = new Window_MenuPlaceholder(r.x, r.y, r.w, r.h);
  this._contentWindows['placeholder'] = this._placeholderWindow;
  this.addChild(this._placeholderWindow);
};

Scene_CustomMenu.prototype._showContent = function(tabName) {
  this._activeTab = tabName;
  // 모든 콘텐츠 숨기기
  for (var key in this._contentWindows) {
    if (this._contentWindows.hasOwnProperty(key)) {
      this._contentWindows[key].hide();
    }
  }
  // 해당 탭 표시
  if (this._contentWindows[tabName]) {
    this._contentWindows[tabName].show();
    this._contentWindows[tabName].refresh();
  } else {
    // 미구현 탭은 플레이스홀더
    this._placeholderWindow.setTabName(tabName);
    this._placeholderWindow.show();
    this._placeholderWindow.refresh();
  }
};


// --- 커맨드 핸들러 ---

Scene_CustomMenu.prototype._onCommandCharacter = function() {
  this._showContent('character');
  this._commandWindow.activate();
};

Scene_CustomMenu.prototype._onCommandBonds = function() {
  this._showContent('bonds');
  this._commandWindow.activate();
};

Scene_CustomMenu.prototype._onCommandItems = function() {
  this._showContent('items');
  this._commandWindow.activate();
};

Scene_CustomMenu.prototype._onCommandTactics = function() {
  this._showContent('tactics');
  this._commandWindow.activate();
};

Scene_CustomMenu.prototype._onCommandJournal = function() {
  this._showContent('journal');
  this._commandWindow.activate();
};

Scene_CustomMenu.prototype._onCommandSystem = function() {
  this._showContent('system');
  this._commandWindow.activate();
};


// --- 파티 디스플레이에서 캐릭터 선택 ---

Scene_CustomMenu.prototype.update = function() {
  Scene_MenuBase.prototype.update.call(this);
  this._updatePartySelection();
};

Scene_CustomMenu.prototype._updatePartySelection = function() {
  // 파티 디스플레이에서 캐릭터를 클릭하면 선택 변경
  if (this._partyWindow && this._partyWindow.isSelectedChanged()) {
    this._selectedActorIndex = this._partyWindow.selectedIndex();
    // 현재 탭이 캐릭터 의존 탭이면 갱신
    if (this._activeTab === 'character' || this._activeTab === 'items' ||
        this._activeTab === 'tactics') {
      this._showContent(this._activeTab);
    }
  }
};

Scene_CustomMenu.prototype.selectedActor = function() {
  var members = $gameParty.members();
  return members[this._selectedActorIndex] || members[0];
};


// ═══════════════════════════════════════════════════════════════════
//  3. Window_PartyDisplay — 상단 파티원 표시
// ═══════════════════════════════════════════════════════════════════

function Window_PartyDisplay() {
  this.initialize.apply(this, arguments);
}

Window_PartyDisplay.prototype = Object.create(Window_Base.prototype);
Window_PartyDisplay.prototype.constructor = Window_PartyDisplay;

Window_PartyDisplay.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._selectedIndex = 0;
  this._prevSelectedIndex = -1;
  this._touchedIndex = -1;
  this.refresh();
};

Window_PartyDisplay.prototype.setSelectedIndex = function(idx) {
  this._selectedIndex = idx;
  this.refresh();
};

Window_PartyDisplay.prototype.selectedIndex = function() {
  return this._selectedIndex;
};

Window_PartyDisplay.prototype.isSelectedChanged = function() {
  if (this._prevSelectedIndex !== this._selectedIndex) {
    this._prevSelectedIndex = this._selectedIndex;
    return true;
  }
  return false;
};

Window_PartyDisplay.prototype.refresh = function() {
  this.contents.clear();
  var members = $gameParty.members();
  if (members.length === 0) return;

  var maxSlots = 6;
  var slotW = Math.floor((this.innerWidth) / maxSlots);
  var pad = 4;

  for (var i = 0; i < maxSlots; i++) {
    var actor = members[i];
    var sx = i * slotW + pad;
    var isSelected = (i === this._selectedIndex);

    if (!actor) {
      // 빈 슬롯
      this.contents.fillRect(sx, 8, slotW - pad * 2, this.innerHeight - 16,
        'rgba(255,255,255,0.05)');
      continue;
    }

    // 선택 강조
    if (isSelected) {
      this.contents.fillRect(sx, 0, slotW - pad * 2, this.innerHeight,
        'rgba(100, 180, 255, 0.2)');
    }

    // 얼굴 그래픽 (RMMZ Face)
    var faceH = this.innerHeight - 36;
    var faceW = Math.min(slotW - pad * 2, faceH);
    var faceX = sx + Math.floor((slotW - pad * 2 - faceW) / 2);
    var faceY = isSelected ? 0 : 4;  // 선택 시 약간 위로
    this.drawFace(actor.faceName(), actor.faceIndex(),
      faceX, faceY, faceW, faceH);

    // 이름
    var nameY = faceY + faceH + 2;
    this.contents.fontSize = 13;
    this.contents.textColor = isSelected ? '#88ccff' : '#ffffff';
    this.contents.drawText(actor.name(), sx, nameY, slotW - pad * 2, 16, 'center');

    // HP바
    var barY = nameY + 16;
    var barW = slotW - pad * 4;
    var barX = sx + pad;
    this._drawMiniBar(barX, barY, barW, 4, actor.hp, actor.mhp, '#44cc44', '#225522');

    // MP바
    this._drawMiniBar(barX, barY + 6, barW, 4, actor.mp, actor.mmp, '#4488cc', '#223355');
  }

  this.contents.fontSize = this.contents.defaultFontSize || 26;
};

Window_PartyDisplay.prototype._drawMiniBar = function(x, y, w, h, current, max, fgColor, bgColor) {
  this.contents.fillRect(x, y, w, h, bgColor);
  if (max > 0) {
    var rate = Math.min(1, current / max);
    this.contents.fillRect(x, y, Math.floor(w * rate), h, fgColor);
  }
};

Window_PartyDisplay.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  this._processTouch();
};

Window_PartyDisplay.prototype._processTouch = function() {
  if (!TouchInput.isTriggered()) return;
  var tx = this.canvasToLocalX(TouchInput.x);
  var ty = this.canvasToLocalY(TouchInput.y);
  if (tx < 0 || ty < 0 || tx > this.innerWidth || ty > this.innerHeight) return;

  var maxSlots = 6;
  var slotW = Math.floor(this.innerWidth / maxSlots);
  var idx = Math.floor(tx / slotW);
  var members = $gameParty.members();
  if (idx >= 0 && idx < members.length) {
    this._selectedIndex = idx;
    SoundManager.playCursor();
    this.refresh();
  }
};


// ═══════════════════════════════════════════════════════════════════
//  4. Window_CustomMenuCommand — 좌측 커맨드
// ═══════════════════════════════════════════════════════════════════

function Window_CustomMenuCommand() {
  this.initialize.apply(this, arguments);
}

Window_CustomMenuCommand.prototype = Object.create(Window_Command.prototype);
Window_CustomMenuCommand.prototype.constructor = Window_CustomMenuCommand;

Window_CustomMenuCommand.prototype.initialize = function(x, y, w, h) {
  this._customWidth = w;
  this._customHeight = h;
  Window_Command.prototype.initialize.call(this, new Rectangle(x, y, w, h));
};

Window_CustomMenuCommand.prototype.makeCommandList = function() {
  this.addCommand('인물',   'character', true);
  this.addCommand('관계',   'bonds',     true);
  this.addCommand('소지품', 'items',     true);
  this.addCommand('전술',   'tactics',   true);
  this.addCommand('일지',   'journal',   true);
  this.addCommand('시스템', 'system',    true);
};

Window_CustomMenuCommand.prototype.itemHeight = function() {
  return Math.floor((this.innerHeight - 12) / 6);
};

Window_CustomMenuCommand.prototype.drawItem = function(index) {
  var rect = this.itemLineRect(index);
  this.resetTextColor();
  var symbol = this.commandSymbol(index);
  var icons = {
    character: '\u2660',  // ♠
    bonds:     '\u2665',  // ♥
    items:     '\u25A0',  // ■
    tactics:   '\u2694',  // ⚔ (fallback to text)
    journal:   '\u270E',  // ✎
    system:    '\u2699'   // ⚙
  };
  var prefix = icons[symbol] || '';
  this.drawText(prefix + ' ' + this.commandName(index), rect.x + 4, rect.y, rect.width - 8, 'left');
};


// ═══════════════════════════════════════════════════════════════════
//  5. Window_MenuPlaceholder — 임시 콘텐츠 (Phase 3~7 전 표시)
// ═══════════════════════════════════════════════════════════════════

function Window_MenuPlaceholder() {
  this.initialize.apply(this, arguments);
}

Window_MenuPlaceholder.prototype = Object.create(Window_Base.prototype);
Window_MenuPlaceholder.prototype.constructor = Window_MenuPlaceholder;

Window_MenuPlaceholder.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._tabName = '';
  this.refresh();
};

Window_MenuPlaceholder.prototype.setTabName = function(name) {
  this._tabName = name;
};

Window_MenuPlaceholder.prototype.refresh = function() {
  this.contents.clear();
  var labels = {
    character: '인물 (Character)',
    bonds:     '관계 (Bonds)',
    items:     '소지품 (Items)',
    tactics:   '전술 (Tactics)',
    journal:   '일지 (Journal)',
    system:    '시스템 (System)'
  };
  var label = labels[this._tabName] || this._tabName;
  this.contents.fontSize = 28;
  this.contents.textColor = '#aaaaaa';
  this.contents.drawText(label, 0, Math.floor(this.innerHeight / 2) - 20,
    this.innerWidth, 40, 'center');
  this.contents.fontSize = 16;
  this.contents.drawText('(구현 예정)', 0, Math.floor(this.innerHeight / 2) + 20,
    this.innerWidth, 24, 'center');
};




// ═══════════════════════════════════════════════════════════════════
//  7. Window_CharacterPanel — 인물(Character) 화면
// ═══════════════════════════════════════════════════════════════════

function Window_CharacterPanel() {
  this.initialize.apply(this, arguments);
}

Window_CharacterPanel.prototype = Object.create(Window_Base.prototype);
Window_CharacterPanel.prototype.constructor = Window_CharacterPanel;

Window_CharacterPanel.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._actor = null;
  this._subTab = 0;  // 0=능력치, 1=장비, 2=프로필
  this._radarMode = 0; // 0=전투, 1=십성, 2=오행
};

Window_CharacterPanel.prototype.setActor = function(actor) {
  this._actor = actor;
  this.refresh();
};

Window_CharacterPanel.prototype.refresh = function() {
  this.contents.clear();
  if (!this._actor) return;
  this._drawSubTabs();
  var contentY = 40;
  var contentH = this.innerHeight - contentY;
  if (this._subTab === 0) {
    this._drawStatsTab(contentY, contentH);
  } else if (this._subTab === 1) {
    this._drawEquipTab(contentY, contentH);
  } else {
    this._drawProfileTab(contentY, contentH);
  }
};


// --- 서브탭 버튼 ---

Window_CharacterPanel.prototype._drawSubTabs = function() {
  var tabs = ['능력치', '장비', '프로필'];
  var tabW = Math.floor(this.innerWidth / tabs.length);
  for (var i = 0; i < tabs.length; i++) {
    var x = i * tabW;
    if (i === this._subTab) {
      this.contents.fillRect(x, 0, tabW, 32, 'rgba(100,180,255,0.3)');
      this.contents.textColor = '#88ccff';
    } else {
      this.contents.fillRect(x, 0, tabW, 32, 'rgba(255,255,255,0.05)');
      this.contents.textColor = '#888888';
    }
    this.contents.fontSize = 15;
    this.contents.drawText(tabs[i], x, 4, tabW, 24, 'center');
  }
  this.contents.textColor = '#ffffff';
};


// ─── 능력치 탭: 레이더 차트 ───

Window_CharacterPanel.prototype._drawStatsTab = function(baseY, height) {
  var cw = this.innerWidth;
  // 레이더 차트 모드 전환 버튼
  var modeLabels = ['전투', '십성(사주)', '오행'];
  var btnW = 80;
  var btnX = cw - btnW * 3 - 8;
  for (var m = 0; m < 3; m++) {
    var bx = btnX + m * btnW;
    if (m === this._radarMode) {
      this.contents.fillRect(bx, baseY, btnW - 4, 22, 'rgba(100,180,255,0.3)');
      this.contents.textColor = '#88ccff';
    } else {
      this.contents.fillRect(bx, baseY, btnW - 4, 22, 'rgba(255,255,255,0.08)');
      this.contents.textColor = '#666666';
    }
    this.contents.fontSize = 12;
    this.contents.drawText(modeLabels[m], bx, baseY + 2, btnW - 4, 18, 'center');
  }
  this.contents.textColor = '#ffffff';

  var chartY = baseY + 30;
  var chartH = height - 30;
  var cx = Math.floor(cw / 2);
  var cy = chartY + Math.floor(chartH / 2);
  var radius = Math.min(cw / 2 - 60, chartH / 2 - 30);

  if (this._radarMode === 0) {
    this._drawRadarChart(cx, cy, radius, this._getCombatAxes(), this._getCombatValues());
  } else if (this._radarMode === 1) {
    this._drawRadarChart(cx, cy, radius, this._getSipsungAxes(), this._getSipsungValues());
  } else {
    this._drawRadarChart(cx, cy, radius, this._getElemAxes(), this._getElemValues());
  }
};

/** 전투 능력치 축 */
Window_CharacterPanel.prototype._getCombatAxes = function() {
  return ['ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
};

Window_CharacterPanel.prototype._getCombatValues = function() {
  var a = this._actor;
  // 최대치 대비 비율 (0~1). 레벨 99 기준 대략 최대 200 정도 가정
  var cap = 200;
  return [
    Math.min(1, a.atk / cap),
    Math.min(1, a.def / cap),
    Math.min(1, a.mat / cap),
    Math.min(1, a.mdf / cap),
    Math.min(1, a.agi / cap),
    Math.min(1, a.luk / cap)
  ];
};

/** 십성 5축 (GahoSystem PARAM_AXES) */
Window_CharacterPanel.prototype._getSipsungAxes = function() {
  if (typeof GahoSystem === 'undefined') return ['?','?','?','?','?'];
  return GahoSystem.PARAM_AXES.map(function(ax) { return ax.name; });
};

Window_CharacterPanel.prototype._getSipsungValues = function() {
  if (typeof GahoSystem === 'undefined') return [0.5,0.5,0.5,0.5,0.5];
  var data = GahoSystem.getActorData(this._actor.actorId());
  if (!data || !data.sipsung) return [0.5,0.5,0.5,0.5,0.5];
  // sipsung 값은 0~6 범위 (7등급)
  return GahoSystem.PARAM_AXES.map(function(ax) {
    var val = data.sipsung[ax.id];
    return (val !== undefined) ? val / 6 : 0.5;
  });
};

/** 오행 5축 (GahoSystem ELEM_AXES) */
Window_CharacterPanel.prototype._getElemAxes = function() {
  if (typeof GahoSystem === 'undefined') return ['?','?','?','?','?'];
  return GahoSystem.ELEM_AXES.map(function(ax) { return ax.name; });
};

Window_CharacterPanel.prototype._getElemValues = function() {
  if (typeof GahoSystem === 'undefined') return [0.5,0.5,0.5,0.5,0.5];
  var data = GahoSystem.getActorData(this._actor.actorId());
  if (!data || !data.elemAxes) return [0.5,0.5,0.5,0.5,0.5];
  return GahoSystem.ELEM_AXES.map(function(ax) {
    var val = data.elemAxes[ax.id];
    return (val !== undefined) ? val / 6 : 0.5;
  });
};

/** 범용 레이더 차트 그리기 */
Window_CharacterPanel.prototype._drawRadarChart = function(cx, cy, radius, labels, values) {
  var n = labels.length;
  if (n < 3) return;
  var ctx = this.contents.context;
  var angleStep = (Math.PI * 2) / n;
  var startAngle = -Math.PI / 2;  // 12시 방향 시작

  // 배경 눈금선 (20%, 40%, 60%, 80%, 100%)
  ctx.save();
  for (var ring = 1; ring <= 5; ring++) {
    var r = radius * ring / 5;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var angle = startAngle + i * angleStep;
      var px = cx + Math.cos(angle) * r;
      var py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 축선
  for (var i = 0; i < n; i++) {
    var angle = startAngle + i * angleStep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 데이터 영역 채움
  ctx.beginPath();
  for (var i = 0; i < n; i++) {
    var angle = startAngle + i * angleStep;
    var val = Math.max(0, Math.min(1, values[i]));
    var px = cx + Math.cos(angle) * radius * val;
    var py = cy + Math.sin(angle) * radius * val;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(68, 170, 255, 0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(68, 170, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 꼭짓점 도트
  for (var i = 0; i < n; i++) {
    var angle = startAngle + i * angleStep;
    var val = Math.max(0, Math.min(1, values[i]));
    var px = cx + Math.cos(angle) * radius * val;
    var py = cy + Math.sin(angle) * radius * val;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#44aaff';
    ctx.fill();
  }

  ctx.restore();

  // 축 레이블 (RMMZ Bitmap drawText)
  this.contents.fontSize = 12;
  this.contents.textColor = '#cccccc';
  for (var i = 0; i < n; i++) {
    var angle = startAngle + i * angleStep;
    var lx = cx + Math.cos(angle) * (radius + 18);
    var ly = cy + Math.sin(angle) * (radius + 18);
    // 정렬 조정
    var align = 'center';
    var drawX = lx - 30;
    var drawY = ly - 8;
    if (Math.cos(angle) < -0.3) { align = 'right'; drawX = lx - 60; }
    else if (Math.cos(angle) > 0.3) { align = 'left'; drawX = lx; }
    this.contents.drawText(labels[i], drawX, drawY, 60, 16, align);
  }

  // 수치 표시 (차트 아래)
  var textY = cy + radius + 30;
  this.contents.fontSize = 13;
  this.contents.textColor = '#aaaaaa';
  var valTexts = [];
  for (var i = 0; i < n; i++) {
    valTexts.push(labels[i] + ': ' + Math.round(values[i] * 100));
  }
  var line = valTexts.join('  |  ');
  this.contents.drawText(line, 0, textY, this.innerWidth, 18, 'center');
};


// ─── 장비 탭 ───

Window_CharacterPanel.prototype._drawEquipTab = function(baseY, height) {
  var a = this._actor;
  var equips = a.equips();
  var slots = a.equipSlots();
  var slotNames = ['무기', '방패', '머리', '몸통', '장신구'];

  this.contents.fontSize = 14;
  var y = baseY + 8;
  var leftW = Math.floor(this.innerWidth * 0.45);

  // 장비 슬롯 목록
  for (var i = 0; i < slots.length; i++) {
    var name = slotNames[i] || ('슬롯' + (i + 1));
    var item = equips[i];

    this.contents.textColor = '#888888';
    this.contents.drawText(name, 8, y, 60, 20, 'left');

    if (item) {
      this.contents.textColor = '#ffffff';
      // 아이콘
      this.drawItemName(item, 72, y, leftW - 80);
    } else {
      this.contents.textColor = '#555555';
      this.contents.drawText('- 없음 -', 72, y, leftW - 80, 20, 'left');
    }
    y += 28;
  }

  // 우측: 스탯 요약
  var rx = leftW + 16;
  y = baseY + 8;
  this.contents.fontSize = 13;
  var params = [
    ['HP',  a.mhp], ['MP',  a.mmp],
    ['ATK', a.atk], ['DEF', a.def],
    ['MAT', a.mat], ['MDF', a.mdf],
    ['AGI', a.agi], ['LUK', a.luk]
  ];
  for (var i = 0; i < params.length; i++) {
    this.contents.textColor = '#aaaaaa';
    this.contents.drawText(params[i][0], rx, y, 40, 18, 'left');
    this.contents.textColor = '#ffffff';
    this.contents.drawText(String(params[i][1]), rx + 44, y, 60, 18, 'right');
    y += 22;
  }
};


// ─── 프로필 탭 ───

Window_CharacterPanel.prototype._drawProfileTab = function(baseY, height) {
  var a = this._actor;
  var y = baseY + 8;
  this.contents.fontSize = 14;

  // 기본 정보
  this.contents.textColor = '#88ccff';
  this.contents.drawText(a.name(), 8, y, 200, 20, 'left');
  y += 24;

  // 클래스
  this.contents.textColor = '#aaaaaa';
  this.contents.drawText('직업: ', 8, y, 50, 18, 'left');
  this.contents.textColor = '#ffffff';
  this.contents.drawText(a.currentClass().name, 58, y, 150, 18, 'left');
  y += 22;

  // 레벨
  this.contents.textColor = '#aaaaaa';
  this.contents.drawText('레벨: ', 8, y, 50, 18, 'left');
  this.contents.textColor = '#ffffff';
  this.contents.drawText(String(a.level), 58, y, 50, 18, 'left');
  y += 28;

  // 원국 (GahoSystem 연동)
  if (typeof GahoSystem !== 'undefined') {
    var gData = GahoSystem.getActorData(a.actorId());
    if (gData) {
      // 구분선
      this.contents.fillRect(8, y, this.innerWidth - 16, 1, 'rgba(255,255,255,0.2)');
      y += 8;

      this.contents.textColor = '#88ccff';
      this.contents.fontSize = 14;
      this.contents.drawText('원국 (사주팔자)', 8, y, 200, 20, 'left');
      y += 24;

      // 4주 표시
      if (gData.pillars) {
        var pillarLabels = ['시주', '일주', '월주', '년주'];
        this.contents.fontSize = 13;
        for (var p = 0; p < 4 && p < gData.pillars.length; p++) {
          var pil = gData.pillars[p];
          var gan = GahoSystem.GAN_MAP[pil.gan];
          var ji  = GahoSystem.JI_MAP[pil.ji];
          this.contents.textColor = '#888888';
          this.contents.drawText(pillarLabels[p], 16, y, 40, 18, 'left');
          if (gan && ji) {
            var ganColor = GahoSystem.EC[gan.elem] || '#ffffff';
            var jiColor  = GahoSystem.EC[ji.elem] || '#ffffff';
            this.contents.textColor = ganColor;
            this.contents.drawText(gan.tid + ' ' + gan.name, 60, y, 100, 18, 'left');
            this.contents.textColor = jiColor;
            this.contents.drawText(ji.tid + ' ' + ji.name, 170, y, 120, 18, 'left');
          }
          y += 20;
        }
      }

      // 일주 천간 (메인 기질)
      y += 8;
      if (gData.dayGan) {
        var dg = GahoSystem.GAN_MAP[gData.dayGan];
        if (dg) {
          this.contents.textColor = GahoSystem.EC[dg.elem] || '#ffffff';
          this.contents.fontSize = 15;
          this.contents.drawText(dg.emoji + ' ' + dg.name + ' — ' + dg.virtue, 16, y, 300, 20, 'left');
          y += 24;
        }
      }

      // 아키타입
      if (gData.archetypes && gData.archetypes.length > 0) {
        this.contents.textColor = '#ccaa44';
        this.contents.fontSize = 13;
        var archText = gData.archetypes.map(function(at) { return at.icon + ' ' + at.name; }).join(', ');
        this.contents.drawText('기질: ' + archText, 16, y, this.innerWidth - 32, 18, 'left');
        y += 22;
      }

      // 신살
      var sinsal = GahoSystem.getActorSinsal(a.actorId());
      if (sinsal && sinsal.length > 0) {
        this.contents.textColor = '#aa88cc';
        this.contents.fontSize = 12;
        var ssText = sinsal.map(function(s) { return s.name; }).join(', ');
        this.contents.drawText('신살: ' + ssText, 16, y, this.innerWidth - 32, 16, 'left');
        y += 20;
      }
    }
  }

  // 프로필/배경 텍스트 (노트태그 또는 별도)
  y += 8;
  this.contents.fillRect(8, y, this.innerWidth - 16, 1, 'rgba(255,255,255,0.2)');
  y += 8;
  this.contents.textColor = '#cccccc';
  this.contents.fontSize = 13;
  var profile = a.profile() || '';
  if (profile) {
    var lines = profile.split('\n');
    for (var i = 0; i < lines.length && y < this.innerHeight - 20; i++) {
      this.contents.drawText(lines[i], 16, y, this.innerWidth - 32, 18, 'left');
      y += 18;
    }
  }
};


// --- 터치/클릭 처리 ---

Window_CharacterPanel.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  this._processTabTouch();
  this._processRadarModeTouch();
};

Window_CharacterPanel.prototype._processTabTouch = function() {
  if (!TouchInput.isTriggered()) return;
  var tx = this.canvasToLocalX(TouchInput.x);
  var ty = this.canvasToLocalY(TouchInput.y);
  if (ty < 0 || ty > 32 || tx < 0 || tx > this.innerWidth) return;

  var tabs = 3;
  var tabW = Math.floor(this.innerWidth / tabs);
  var idx = Math.floor(tx / tabW);
  if (idx >= 0 && idx < tabs && idx !== this._subTab) {
    this._subTab = idx;
    SoundManager.playCursor();
    this.refresh();
  }
};

Window_CharacterPanel.prototype._processRadarModeTouch = function() {
  if (this._subTab !== 0) return;
  if (!TouchInput.isTriggered()) return;
  var tx = this.canvasToLocalX(TouchInput.x);
  var ty = this.canvasToLocalY(TouchInput.y);

  var btnW = 80;
  var btnX = this.innerWidth - btnW * 3 - 8;
  var btnY = 40;
  if (ty < btnY || ty > btnY + 22 || tx < btnX) return;

  var idx = Math.floor((tx - btnX) / btnW);
  if (idx >= 0 && idx < 3 && idx !== this._radarMode) {
    this._radarMode = idx;
    SoundManager.playCursor();
    this.refresh();
  }
};


// --- Character 패널 생성 (Scene_CustomMenu 확장) ---

var _Scene_CustomMenu_createContentArea = Scene_CustomMenu.prototype._createContentArea;
Scene_CustomMenu.prototype._createContentArea = function() {
  _Scene_CustomMenu_createContentArea.call(this);
  var r = this._contentRect;
  this._characterPanel = new Window_CharacterPanel(r.x, r.y, r.w, r.h);
  this._characterPanel.hide();
  this._contentWindows['character'] = this._characterPanel;
  this.addChild(this._characterPanel);
};

var _Scene_CustomMenu_showContent = Scene_CustomMenu.prototype._showContent;
Scene_CustomMenu.prototype._showContent = function(tabName) {
  _Scene_CustomMenu_showContent.call(this, tabName);
  if (tabName === 'character' && this._characterPanel) {
    this._characterPanel.setActor(this.selectedActor());
  }
};

var _Scene_CustomMenu_updatePartySelection = Scene_CustomMenu.prototype._updatePartySelection;
Scene_CustomMenu.prototype._updatePartySelection = function() {
  var oldIdx = this._selectedActorIndex;
  _Scene_CustomMenu_updatePartySelection.call(this);
  if (this._selectedActorIndex !== oldIdx && this._activeTab === 'character') {
    this._characterPanel.setActor(this.selectedActor());
  }
};



// ═══════════════════════════════════════════════════════════════════
//  8. Window_BondsPanel — 관계(Bonds) 화면
// ═══════════════════════════════════════════════════════════════════

function Window_BondsPanel() {
  this.initialize.apply(this, arguments);
}

Window_BondsPanel.prototype = Object.create(Window_Base.prototype);
Window_BondsPanel.prototype.constructor = Window_BondsPanel;

Window_BondsPanel.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._selectedActor = null;
  this._targetActor = null;    // 궁합 비교 대상
  this._targetIndex = -1;
};

Window_BondsPanel.prototype.setActor = function(actor) {
  this._selectedActor = actor;
  this._targetActor = null;
  this._targetIndex = -1;
  this.refresh();
};

Window_BondsPanel.prototype.refresh = function() {
  this.contents.clear();
  if (!this._selectedActor) return;

  var members = $gameParty.members();
  if (members.length <= 1) {
    this.contents.textColor = '#888888';
    this.contents.fontSize = 16;
    this.contents.drawText('파티원이 2명 이상 필요합니다.', 0, this.innerHeight / 2 - 10,
      this.innerWidth, 20, 'center');
    return;
  }

  // 좌측: 관계망 시각화
  var netW = Math.floor(this.innerWidth * 0.55);
  this._drawRelationNetwork(0, 0, netW, this.innerHeight);

  // 우측: 궁합 상세 (타겟 선택 시)
  var detailX = netW + 8;
  var detailW = this.innerWidth - netW - 8;
  if (this._targetActor) {
    this._drawCompatDetail(detailX, 0, detailW, this.innerHeight);
  } else {
    this.contents.textColor = '#666666';
    this.contents.fontSize = 13;
    this.contents.drawText('파티원을 클릭하면', detailX, this.innerHeight / 2 - 20, detailW, 18, 'center');
    this.contents.drawText('궁합을 확인합니다', detailX, this.innerHeight / 2, detailW, 18, 'center');
  }
};


// --- 관계망 그리기 ---

Window_BondsPanel.prototype._drawRelationNetwork = function(ox, oy, w, h) {
  var members = $gameParty.members();
  var self = this._selectedActor;
  var selfIdx = members.indexOf(self);
  var others = members.filter(function(m) { return m !== self; });
  var ctx = this.contents.context;

  // 중앙에 선택 캐릭터
  var cx = ox + Math.floor(w / 2);
  var cy = oy + Math.floor(h / 2);

  // 주변에 다른 파티원 원형 배치
  var n = others.length;
  var orbitR = Math.min(w, h) * 0.35;
  var positions = [];

  for (var i = 0; i < n; i++) {
    var angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    positions.push({
      x: cx + Math.cos(angle) * orbitR,
      y: cy + Math.sin(angle) * orbitR,
      actor: others[i]
    });
  }

  // 연결선 그리기
  ctx.save();
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var favor = self.getImpression(p.actor.actorId());

    // 색상: 높은 인상=금색, 보통=회색, 낮은=붉은색
    var lineColor;
    var lineW;
    if (favor >= 60)      { lineColor = 'rgba(255, 215, 80, 0.7)';  lineW = 3; }
    else if (favor >= 30) { lineColor = 'rgba(180, 200, 120, 0.5)'; lineW = 2; }
    else if (favor >= 0)  { lineColor = 'rgba(150, 150, 150, 0.3)'; lineW = 1; }
    else if (favor >= -30){ lineColor = 'rgba(200, 130, 80, 0.4)';  lineW = 1; }
    else                  { lineColor = 'rgba(200, 80, 80, 0.6)';   lineW = 2; }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }
  ctx.restore();

  // 중앙 캐릭터 원
  this._drawActorNode(cx, cy, self, true);

  // 주변 캐릭터 원
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var isTarget = (this._targetActor === p.actor);
    this._drawActorNode(p.x, p.y, p.actor, isTarget);

    // 인상 수치 (선 위)
    var impVal = self.getImpression(p.actor.actorId());
    var midX = (cx + p.x) / 2;
    var midY = (cy + p.y) / 2;
    this.contents.fontSize = 10;
    this.contents.textColor = impVal >= 0 ? '#aaccaa' : '#ccaaaa';
    this.contents.drawText(String(impVal), midX - 12, midY - 6, 24, 12, 'center');
  }

  // 터치용 위치 저장
  this._nodePositions = positions;
  this._nodePositions.unshift({ x: cx, y: cy, actor: self });
};

Window_BondsPanel.prototype._drawActorNode = function(x, y, actor, highlight) {
  var ctx = this.contents.context;
  var r = 24;

  // 원 배경
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = highlight ? 'rgba(100, 180, 255, 0.4)' : 'rgba(60, 60, 80, 0.6)';
  ctx.fill();
  ctx.strokeStyle = highlight ? '#88ccff' : '#555555';
  ctx.lineWidth = highlight ? 2 : 1;
  ctx.stroke();
  ctx.restore();

  // 이름
  this.contents.fontSize = 11;
  this.contents.textColor = highlight ? '#88ccff' : '#cccccc';
  this.contents.drawText(actor.name(), x - 30, y + r + 2, 60, 14, 'center');
};


// --- 궁합 상세 패널 ---

Window_BondsPanel.prototype._drawCompatDetail = function(ox, oy, w, h) {
  var selfActor = this._selectedActor;
  var targetActor = this._targetActor;

  var y = oy + 8;

  // 헤더
  this.contents.fontSize = 14;
  this.contents.textColor = '#88ccff';
  this.contents.drawText(selfActor.name() + '  \u2194  ' + targetActor.name(), ox, y, w, 20, 'center');
  y += 28;

  // 인상/관계 태그
  var impScore = selfActor.getImpression(targetActor.actorId());
  var bondTag = selfActor.getBondTag(targetActor.actorId());
  var _bondLabels = {'stranger':'초면','acquaintance':'지인','friend':'친구','rival':'라이벌','sworn':'맹우','hostile':'적대','mentor':'스승','pupil':'제자','lover':'연인','broken':'결별'};
  this.contents.fontSize = 13;
  this.contents.textColor = '#aaaaaa';
  this.contents.drawText('인상: ', ox + 4, y, 50, 18, 'left');
  this.contents.textColor = impScore >= 0 ? '#88cc88' : '#cc8888';
  this.contents.drawText(String(impScore), ox + 54, y, 40, 18, 'left');

  this.contents.textColor = '#aaaaaa';
  this.contents.drawText('관계: ', ox + 110, y, 50, 18, 'left');
  this.contents.textColor = '#88aacc';
  this.contents.drawText(_bondLabels[bondTag] || bondTag, ox + 160, y, 80, 18, 'left');
  y += 26;

  // 구분선
  this.contents.fillRect(ox + 4, y, w - 8, 1, 'rgba(255,255,255,0.15)');
  y += 10;

  // 원국 궁합 (GahoSystem)
  if (typeof GahoSystem !== 'undefined' && GahoSystem.getCompatibility) {
    var compat = GahoSystem.getCompatibility(selfActor.actorId(), targetActor.actorId());

    // 궁합 점수 게이지
    this.contents.textColor = '#cccc88';
    this.contents.fontSize = 13;
    this.contents.drawText('원국 궁합', ox + 4, y, 80, 18, 'left');
    y += 20;

    // 점수 바
    var barW = w - 16;
    var barH = 12;
    this.contents.fillRect(ox + 8, y, barW, barH, 'rgba(60,60,60,0.8)');
    var scoreRate = compat.score / 100;
    var barColor;
    if (compat.score >= 70) barColor = '#66cc66';
    else if (compat.score >= 45) barColor = '#cccc66';
    else barColor = '#cc6666';
    this.contents.fillRect(ox + 8, y, Math.floor(barW * scoreRate), barH, barColor);

    this.contents.fontSize = 11;
    this.contents.textColor = '#ffffff';
    this.contents.drawText(compat.score + '/100', ox + 8, y - 1, barW, barH + 2, 'center');
    y += barH + 8;

    // 상세 설명
    this.contents.textColor = '#cccccc';
    this.contents.fontSize = 12;
    // desc를 여러 줄로 분할
    var desc = compat.desc || '';
    var descParts = desc.split(' (');
    this.contents.drawText(descParts[0], ox + 8, y, w - 16, 16, 'left');
    y += 18;
    if (descParts.length > 1) {
      this.contents.textColor = '#999999';
      this.contents.fontSize = 11;
      this.contents.drawText('(' + descParts[1], ox + 8, y, w - 16, 14, 'left');
      y += 16;
    }

    // 특수 관계 태그
    y += 6;
    this.contents.fontSize = 12;
    if (compat.ganCombine) {
      this.contents.textColor = '#ffcc44';
      this.contents.drawText('\u2605 천간합 (깊은 인연)', ox + 8, y, w - 16, 16, 'left');
      y += 18;
    }
    if (compat.jiHarmony) {
      this.contents.textColor = '#66ccaa';
      this.contents.drawText('\u2605 지지 육합 (조화)', ox + 8, y, w - 16, 16, 'left');
      y += 18;
    }
    if (compat.jiClash) {
      this.contents.textColor = '#cc6666';
      this.contents.drawText('\u2716 지지 충 (충돌)', ox + 8, y, w - 16, 16, 'left');
      y += 18;
    }

    // 전투 시너지
    y += 4;
    this.contents.fillRect(ox + 4, y, w - 8, 1, 'rgba(255,255,255,0.1)');
    y += 8;
    this.contents.textColor = '#aaaaaa';
    this.contents.fontSize = 12;
    this.contents.drawText('전투 시너지 (인접 배치 시)', ox + 8, y, w - 16, 16, 'left');
    y += 18;
    var bonusText = compat.synergyBonus >= 0 ?
      '+' + compat.synergyBonus + ' 스탯 보너스' :
      compat.synergyBonus + ' 스탯 페널티';
    this.contents.textColor = compat.synergyBonus >= 0 ? '#88cc88' : '#cc8888';
    this.contents.fontSize = 14;
    this.contents.drawText(bonusText, ox + 8, y, w - 16, 20, 'center');
  }

  // 관계 이벤트 기록
  y += 30;
  this.contents.fillRect(ox + 4, y, w - 8, 1, 'rgba(255,255,255,0.1)');
  y += 8;
  this.contents.textColor = '#888888';
  this.contents.fontSize = 12;
  this.contents.drawText('관계 이벤트 기록', ox + 8, y, w - 16, 16, 'left');
  y += 20;

  // 두 캐릭터 관련 이벤트 조회
  if ($gameParty && $gameParty.eventLog) {
    var selfId = selfActor.actorId();
    var targetId = targetActor.actorId();
    var events = $gameParty.eventLog().filter(function(e) {
      return e.actorIds &&
        e.actorIds.indexOf(selfId) >= 0 &&
        e.actorIds.indexOf(targetId) >= 0;
    });
    if (events.length === 0) {
      this.contents.textColor = '#555555';
      this.contents.drawText('아직 기록이 없습니다.', ox + 8, y, w - 16, 14, 'left');
    } else {
      this.contents.fontSize = 11;
      var maxShow = Math.min(events.length, 5);
      for (var i = events.length - maxShow; i < events.length && y < h - 20; i++) {
        this.contents.textColor = '#999999';
        this.contents.drawText('\u25AA ' + events[i].title, ox + 8, y, w - 16, 14, 'left');
        y += 16;
      }
    }
  }
};


// --- 터치: 노드 클릭으로 타겟 선택 ---

Window_BondsPanel.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  if (!TouchInput.isTriggered()) return;
  if (!this._nodePositions) return;

  var tx = this.canvasToLocalX(TouchInput.x);
  var ty = this.canvasToLocalY(TouchInput.y);

  for (var i = 0; i < this._nodePositions.length; i++) {
    var node = this._nodePositions[i];
    var dx = tx - node.x;
    var dy = ty - node.y;
    if (dx * dx + dy * dy < 30 * 30) {
      if (node.actor !== this._selectedActor) {
        this._targetActor = node.actor;
        this._targetIndex = i;
        SoundManager.playCursor();
        this.refresh();
      }
      break;
    }
  }
};


// --- Scene_CustomMenu 에 관계 패널 연결 ---

var _Scene_CustomMenu_createContentArea_bonds = Scene_CustomMenu.prototype._createContentArea;
Scene_CustomMenu.prototype._createContentArea = function() {
  _Scene_CustomMenu_createContentArea_bonds.call(this);
  var r = this._contentRect;
  this._bondsPanel = new Window_BondsPanel(r.x, r.y, r.w, r.h);
  this._bondsPanel.hide();
  this._contentWindows['bonds'] = this._bondsPanel;
  this.addChild(this._bondsPanel);
};

var _Scene_CustomMenu_showContent_bonds = Scene_CustomMenu.prototype._showContent;
Scene_CustomMenu.prototype._showContent = function(tabName) {
  _Scene_CustomMenu_showContent_bonds.call(this, tabName);
  if (tabName === 'bonds' && this._bondsPanel) {
    this._bondsPanel.setActor(this.selectedActor());
  }
};



// ═══════════════════════════════════════════════════════════════════
//  9. Window_GridInventoryPanel — 소지품(Items) 그리드 인벤토리 UI
// ═══════════════════════════════════════════════════════════════════

function Window_GridInventoryPanel() {
  this.initialize.apply(this, arguments);
}

Window_GridInventoryPanel.prototype = Object.create(Window_Base.prototype);
Window_GridInventoryPanel.prototype.constructor = Window_GridInventoryPanel;

Window_GridInventoryPanel.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._actor = null;
  this._secondActor = null;  // 캐릭터간 이동 시
  this._cellSize = 40;
  this._gridOffsetX = 8;
  this._gridOffsetY = 8;
  this._hotkeyOffsetY = 0;  // 계산됨
  // 드래그 상태
  this._dragging = false;
  this._dragPid = 0;
  this._dragOffX = 0;
  this._dragOffY = 0;
  this._dragGhostX = 0;
  this._dragGhostY = 0;
  this._hoverGx = -1;
  this._hoverGy = -1;
  // 인포 패널용
  this._infoItem = null;
  // 아이템 이미지 캐시 (invImage 노트태그 기반)
  this._itemImageCache = {};
  this._itemImageReady = {};
};

// 아이템 이미지 로드 (invImage 노트태그 → img/items/ 파일)
Window_GridInventoryPanel.prototype._loadInvImage = function(dataItem) {
  if (!dataItem || !dataItem.note) return null;
  var key = (dataItem.id || 0) + '_' + (dataItem.name || '');
  if (this._itemImageReady[key]) return this._itemImageCache[key] || null;
  if (this._itemImageCache[key] === undefined) {
    var m = dataItem.note.match(/<invImage:([^>]+)>/);
    if (!m) { this._itemImageCache[key] = null; this._itemImageReady[key] = true; return null; }
    var path = m[1];
    // path 예: img/items/itemImg_5.png → folder='img/items/', name='itemImg_5'
    var lastSlash = path.lastIndexOf('/');
    var folder = (lastSlash >= 0) ? path.substring(0, lastSlash + 1) : '';
    var name = path.substring(lastSlash + 1).replace(/\.png$/i, '');
    var bmp = ImageManager.loadBitmap(folder, name);
    this._itemImageCache[key] = bmp;
    var self = this;
    bmp.addLoadListener(function() {
      self._itemImageReady[key] = true;
      self.refresh();
    });
    return null;  // 아직 로딩 중
  }
  return this._itemImageCache[key];
};

Window_GridInventoryPanel.prototype.setActor = function(actor) {
  this._actor = actor;
  this._secondActor = null;
  this._dragging = false;
  this._recalcLayout();
  this.refresh();
};

Window_GridInventoryPanel.prototype._recalcLayout = function() {
  if (!this._actor) return;
  var inv = this._actor.gridInventory();
  var maxGridW = this.innerWidth - 16;
  var maxGridH = this.innerHeight - 80;  // 핫키 공간 확보
  this._cellSize = Math.min(
    Math.floor(maxGridW / inv.cols()),
    Math.floor(maxGridH / inv.rows()),
    48
  );
  this._gridOffsetX = 8;
  this._gridOffsetY = 8;
  this._hotkeyOffsetY = this._gridOffsetY + inv.rows() * this._cellSize + 12;
};

Window_GridInventoryPanel.prototype.refresh = function() {
  this.contents.clear();
  if (!this._actor) return;

  var inv = this._actor.gridInventory();
  var cs = this._cellSize;
  var ox = this._gridOffsetX;
  var oy = this._gridOffsetY;

  // 캐릭터 이름 헤더
  this.contents.fontSize = 14;
  this.contents.textColor = '#88ccff';
  this.contents.drawText(this._actor.name() + ' 인벤토리', ox, oy - 2, 200, 16, 'left');

  // 그리드 오프셋 조정 (헤더 아래)
  var goy = oy + 18;

  // 그리드 배경
  var ctx = this.contents.context;
  for (var r = 0; r < inv.rows(); r++) {
    for (var c = 0; c < inv.cols(); c++) {
      var px = ox + c * cs;
      var py = goy + r * cs;
      var cellVal = inv.gridAt(c, r);
      if (cellVal === 0) {
        this.contents.fillRect(px, py, cs - 1, cs - 1, 'rgba(40, 45, 55, 0.8)');
      } else {
        this.contents.fillRect(px, py, cs - 1, cs - 1, 'rgba(60, 65, 80, 0.6)');
      }
      // 셀 테두리
      ctx.save();
      ctx.strokeStyle = 'rgba(80, 85, 100, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
      ctx.restore();
    }
  }

  // 드래그 중 hover 하이라이트
  if (this._dragging && this._hoverGx >= 0) {
    var dp = inv.placements()[this._dragPid];
    if (dp) {
      var canDrop = inv.canPlace(this._hoverGx, this._hoverGy, dp.w, dp.h, this._dragPid);
      var hlColor = canDrop ? 'rgba(68, 255, 100, 0.25)' : 'rgba(255, 68, 68, 0.25)';
      for (var dy = 0; dy < dp.h; dy++) {
        for (var dx = 0; dx < dp.w; dx++) {
          var hx = ox + (this._hoverGx + dx) * cs;
          var hy = goy + (this._hoverGy + dy) * cs;
          this.contents.fillRect(hx, hy, cs - 1, cs - 1, hlColor);
        }
      }
    }
  }

  // 배치된 아이템 그리기
  var placements = inv.allPlacements();
  for (var i = 0; i < placements.length; i++) {
    var entry = placements[i];
    var p = entry.data;
    if (this._dragging && entry.pid === this._dragPid) continue;  // 드래그 중인 것은 고스트로
    var dataItem = inv.resolveDataItem(p.itemType, p.itemId);
    if (!dataItem) continue;

    var ix = ox + p.gx * cs;
    var iy = goy + p.gy * cs;
    var iw = p.w * cs - 2;
    var ih = p.h * cs - 2;

    // 아이템 배경
    this.contents.fillRect(ix + 1, iy + 1, iw, ih, 'rgba(50, 70, 100, 0.5)');

    // 아이템 이미지 또는 아이콘 (중앙)
    var invBmp = this._loadInvImage(dataItem);
    if (invBmp && invBmp.isReady() && invBmp.width > 0) {
      // invImage가 있으면 셀 크기에 맞춰 그리기 (blt = 안전한 Bitmap 복사)
      this.contents.blt(invBmp, 0, 0, invBmp.width, invBmp.height, ix + 1, iy + 1, iw, ih);
    } else {
      var iconIndex = dataItem.iconIndex;
      if (iconIndex > 0) {
        var iconCx = ix + Math.floor(iw / 2) - 12;
        var iconCy = iy + Math.floor(ih / 2) - 12;
        this.drawIcon(iconIndex, iconCx, iconCy);
      }
    }

    // 수량 (같은 아이템이 여러 개면 해당 칸은 1개이므로 표시 안 함)
    // 이름 (큰 아이템만)
    if (p.w >= 2 || p.h >= 2) {
      this.contents.fontSize = 9;
      this.contents.textColor = '#cccccc';
      this.contents.drawText(dataItem.name, ix + 2, iy + ih - 12, iw - 4, 12, 'center');
    }
  }

  // 드래그 고스트
  if (this._dragging && this._dragPid > 0) {
    var dp = inv.placements()[this._dragPid];
    if (dp) {
      var dataItem = inv.resolveDataItem(dp.itemType, dp.itemId);
      if (dataItem) {
        var gx = this._dragGhostX;
        var gy = this._dragGhostY;
        ctx.save();
        ctx.globalAlpha = 0.6;
        this.contents.fillRect(gx, gy, dp.w * cs - 2, dp.h * cs - 2, 'rgba(100, 150, 255, 0.4)');
        var ghostBmp = this._loadInvImage(dataItem);
        if (ghostBmp && ghostBmp.isReady() && ghostBmp.width > 0) {
          this.contents.blt(ghostBmp, 0, 0, ghostBmp.width, ghostBmp.height, gx, gy, dp.w * cs - 2, dp.h * cs - 2);
        } else if (dataItem.iconIndex > 0) {
          this.drawIcon(dataItem.iconIndex,
            gx + Math.floor((dp.w * cs - 2) / 2) - 12,
            gy + Math.floor((dp.h * cs - 2) / 2) - 12);
        }
        ctx.restore();
      }
    }
  }

  // 핫키 슬롯
  this._drawHotkeys(ox, this._hotkeyOffsetY + 18, cs, inv);

  // 정보 패널 (우하단)
  if (this._infoItem) {
    this._drawItemInfo(this.innerWidth - 200, goy, 192, inv.rows() * cs);
  }
};


// --- 핫키 슬롯 그리기 ---

Window_GridInventoryPanel.prototype._drawHotkeys = function(ox, oy, cs, inv) {
  this.contents.fontSize = 12;
  this.contents.textColor = '#ccaa44';
  this.contents.drawText('핫키 슬롯', ox, oy - 16, 100, 14, 'left');

  for (var i = 0; i < inv.hotkeyCount(); i++) {
    var hx = ox + i * (cs + 4);
    var hy = oy;

    // 슬롯 배경
    this.contents.fillRect(hx, hy, cs - 1, cs - 1, 'rgba(80, 70, 40, 0.5)');
    var ctx = this.contents.context;
    ctx.save();
    ctx.strokeStyle = '#886622';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx + 0.5, hy + 0.5, cs - 1, cs - 1);
    ctx.restore();

    // 핫키 번호
    this.contents.fontSize = 9;
    this.contents.textColor = '#886622';
    this.contents.drawText(String(i + 1), hx + 2, hy + 1, 12, 10, 'left');

    // 아이템 아이콘
    var hkItem = inv.hotkeyItem(i);
    if (hkItem && hkItem.iconIndex > 0) {
      this.drawIcon(hkItem.iconIndex, hx + Math.floor(cs / 2) - 12, hy + Math.floor(cs / 2) - 12);
    }
  }
};


// --- 아이템 정보 패널 ---

Window_GridInventoryPanel.prototype._drawItemInfo = function(ox, oy, w, maxH) {
  var item = this._infoItem;
  if (!item) return;

  this.contents.fillRect(ox, oy, w, Math.min(maxH, 120), 'rgba(20, 25, 35, 0.9)');
  var ctx = this.contents.context;
  ctx.save();
  ctx.strokeStyle = 'rgba(100, 120, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, w, Math.min(maxH, 120));
  ctx.restore();

  var y = oy + 4;
  // 아이콘 또는 아이템 이미지 + 이름
  var infoBmp = this._loadInvImage(item);
  if (infoBmp && infoBmp.isReady() && infoBmp.width > 0) {
    this.contents.blt(infoBmp, 0, 0, infoBmp.width, infoBmp.height, ox + 2, y, 28, 28);
  } else if (item.iconIndex > 0) {
    this.drawIcon(item.iconIndex, ox + 4, y);
  }
  this.contents.fontSize = 13;
  this.contents.textColor = '#ffffff';
  this.contents.drawText(item.name, ox + 36, y + 4, w - 40, 18, 'left');
  y += 28;

  // 설명
  this.contents.fontSize = 11;
  this.contents.textColor = '#aaaaaa';
  var desc = item.description || '';
  var lines = desc.split('\n');
  for (var i = 0; i < lines.length && y < oy + 110; i++) {
    this.contents.drawText(lines[i], ox + 8, y, w - 16, 14, 'left');
    y += 14;
  }

  // 크기
  var size = (typeof GridInventory !== 'undefined') ? GridInventory.getGridSize(item) : {w:1,h:1};
  this.contents.textColor = '#888888';
  this.contents.drawText(size.w + 'x' + size.h, ox + w - 40, oy + 4, 36, 14, 'right');
};


// --- 마우스/터치 처리 ---

Window_GridInventoryPanel.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  if (!this._actor) return;

  var inv = this._actor.gridInventory();
  var cs = this._cellSize;
  var ox = this._gridOffsetX;
  var goy = this._gridOffsetY + 18;

  var mx = this.canvasToLocalX(TouchInput.x);
  var my = this.canvasToLocalY(TouchInput.y);

  // 그리드 좌표 변환
  var gx = Math.floor((mx - ox) / cs);
  var gy = Math.floor((my - goy) / cs);
  var inGrid = gx >= 0 && gx < inv.cols() && gy >= 0 && gy < inv.rows();

  // 호버 시 아이템 정보 표시
  if (inGrid && !this._dragging) {
    var placement = inv.placementAt(gx, gy);
    if (placement) {
      this._infoItem = inv.resolveDataItem(placement.itemType, placement.itemId);
    } else {
      this._infoItem = null;
    }
  }

  // 드래그 시작
  if (TouchInput.isTriggered() && inGrid && !this._dragging) {
    var pid = inv.gridAt(gx, gy);
    if (pid > 0) {
      this._dragging = true;
      this._dragPid = pid;
      this._dragOffX = mx;
      this._dragOffY = my;
      SoundManager.playCursor();
    }
  }

  // 드래그 중
  if (this._dragging && TouchInput.isPressed()) {
    this._dragGhostX = mx - cs / 2;
    this._dragGhostY = my - cs / 2;
    this._hoverGx = Math.floor((mx - ox) / cs);
    this._hoverGy = Math.floor((my - goy) / cs);
    this.refresh();
  }

  // 드래그 종료
  if (this._dragging && TouchInput.isReleased()) {
    var dropGx = Math.floor((mx - ox) / cs);
    var dropGy = Math.floor((my - goy) / cs);
    if (dropGx >= 0 && dropGy >= 0 && dropGx < inv.cols() && dropGy < inv.rows()) {
      if (inv.movePlacement(this._dragPid, dropGx, dropGy)) {
        SoundManager.playOk();
      } else {
        SoundManager.playBuzzer();
      }
    }

    // 핫키 슬롯 드롭 체크
    var hoy = this._hotkeyOffsetY + 18;
    if (my >= hoy && my < hoy + cs) {
      var hSlot = Math.floor((mx - ox) / (cs + 4));
      if (hSlot >= 0 && hSlot < inv.hotkeyCount()) {
        var dp = inv.placements()[this._dragPid];
        if (dp) {
          var dataItem = inv.resolveDataItem(dp.itemType, dp.itemId);
          if (inv.setHotkey(hSlot, dataItem)) {
            SoundManager.playOk();
          } else {
            SoundManager.playBuzzer();
          }
        }
      }
    }

    this._dragging = false;
    this._dragPid = 0;
    this._hoverGx = -1;
    this._hoverGy = -1;
    this.refresh();
  }

  // 우클릭/더블클릭으로 핫키 해제 등은 Phase 5 후속에서 확장
};


// --- Scene 연결 ---

var _Scene_CustomMenu_createContentArea_items = Scene_CustomMenu.prototype._createContentArea;
Scene_CustomMenu.prototype._createContentArea = function() {
  _Scene_CustomMenu_createContentArea_items.call(this);
  var r = this._contentRect;
  this._itemsPanel = new Window_GridInventoryPanel(r.x, r.y, r.w, r.h);
  this._itemsPanel.hide();
  this._contentWindows['items'] = this._itemsPanel;
  this.addChild(this._itemsPanel);
};

var _Scene_CustomMenu_showContent_items = Scene_CustomMenu.prototype._showContent;
Scene_CustomMenu.prototype._showContent = function(tabName) {
  _Scene_CustomMenu_showContent_items.call(this, tabName);
  if (tabName === 'items' && this._itemsPanel) {
    this._itemsPanel.setActor(this.selectedActor());
  }
};



// ═══════════════════════════════════════════════════════════════════
//  10. Window_TacticsPanel — 전술(Tactics) 화면
// ═══════════════════════════════════════════════════════════════════

function Window_TacticsPanel() {
  this.initialize.apply(this, arguments);
}

Window_TacticsPanel.prototype = Object.create(Window_Base.prototype);
Window_TacticsPanel.prototype.constructor = Window_TacticsPanel;

Window_TacticsPanel.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._showSkillDetail = false;
  this._detailActorIdx = 0;
};

Window_TacticsPanel.prototype.refresh = function() {
  this.contents.clear();
  var members = $gameParty.members();
  if (members.length === 0) return;

  if (this._showSkillDetail) {
    this._drawSkillDetailView(members[this._detailActorIdx]);
    return;
  }

  // 파티 카드 배치
  var maxCards = Math.min(members.length, 6);
  var cardW = Math.floor((this.innerWidth - 16) / Math.min(maxCards, 3));
  var cardH = Math.floor((this.innerHeight - 8) / 2);

  for (var i = 0; i < maxCards; i++) {
    var col = i % 3;
    var row = Math.floor(i / 3);
    var cx = 8 + col * cardW;
    var cy = 4 + row * cardH;
    this._drawTacticsCard(members[i], cx, cy, cardW - 8, cardH - 8, i);
  }

  // 하단 안내
  this.contents.fontSize = 11;
  this.contents.textColor = '#666666';
  this.contents.drawText('카드를 클릭하면 스킬 전체 목록을 볼 수 있습니다', 0,
    this.innerHeight - 16, this.innerWidth, 14, 'center');
};

Window_TacticsPanel.prototype._drawTacticsCard = function(actor, x, y, w, h, idx) {
  // 카드 배경
  this.contents.fillRect(x, y, w, h, 'rgba(40, 45, 60, 0.7)');
  var ctx = this.contents.context;
  ctx.save();
  ctx.strokeStyle = 'rgba(100, 120, 160, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.restore();

  // 이름
  this.contents.fontSize = 13;
  this.contents.textColor = '#88ccff';
  this.contents.drawText(actor.name(), x + 4, y + 4, w - 8, 18, 'left');

  // 전투 성향 파이 차트 (좌측)
  var pieR = Math.min(w * 0.2, h * 0.25, 30);
  var pieCx = x + pieR + 8;
  var pieCy = y + 28 + pieR + 4;
  this._drawPieChart(pieCx, pieCy, pieR, actor);

  // 상위 3 스킬 (우측)
  var skills = actor.skills().slice();
  // 간단 정렬: 데미지/MP소모 기준
  skills.sort(function(a, b) {
    return (b.damage.formula ? 1 : 0) - (a.damage.formula ? 1 : 0) ||
           b.mpCost - a.mpCost;
  });
  var topSkills = skills.slice(0, 3);
  var sx = x + pieR * 2 + 24;
  var sy = y + 28;
  this.contents.fontSize = 11;
  for (var s = 0; s < topSkills.length; s++) {
    var sk = topSkills[s];
    if (sk.iconIndex > 0) {
      this.drawIcon(sk.iconIndex, sx, sy + s * 22);
    }
    this.contents.textColor = '#cccccc';
    this.contents.drawText(sk.name, sx + 28, sy + s * 22 + 4, w - sx + x - 36, 14, 'left');
    this.contents.textColor = '#666688';
    this.contents.drawText('MP' + sk.mpCost, sx + 28 + 80, sy + s * 22 + 4, 40, 14, 'right');
  }

  // 궁합 힌트 (인접 파티원과)
  if (idx > 0 && typeof GahoSystem !== 'undefined' && GahoSystem.getCompatibility) {
    var prevActor = $gameParty.members()[idx - 1];
    if (prevActor) {
      var compat = GahoSystem.getCompatibility(actor.actorId(), prevActor.actorId());
      this.contents.fontSize = 10;
      if (compat.synergyBonus > 0) {
        this.contents.textColor = '#88cc88';
        this.contents.drawText('\u2194 ' + prevActor.name() + ' +' + compat.synergyBonus,
          x + 4, y + h - 16, w - 8, 12, 'left');
      } else if (compat.synergyBonus < 0) {
        this.contents.textColor = '#cc8888';
        this.contents.drawText('\u2194 ' + prevActor.name() + ' ' + compat.synergyBonus,
          x + 4, y + h - 16, w - 8, 12, 'left');
      }
    }
  }
};

/** 전투 성향 파이 차트 */
Window_TacticsPanel.prototype._drawPieChart = function(cx, cy, r, actor) {
  if (typeof GahoSystem === 'undefined' || !GahoSystem.getCombatTendency) return;

  var tendency = GahoSystem.getCombatTendency(actor.actorId());
  var slices = [
    { key: 'attack',   label: '공격', color: '#4a7c59', val: tendency.attack },
    { key: 'burst',    label: '화력', color: '#c44536', val: tendency.burst },
    { key: 'defense',  label: '방어', color: '#b5893a', val: tendency.defense },
    { key: 'mobility', label: '기동', color: '#7a8b99', val: tendency.mobility },
    { key: 'strategy', label: '전략', color: '#3a7bd5', val: tendency.strategy }
  ];

  var total = 0;
  for (var i = 0; i < slices.length; i++) total += slices[i].val;
  if (total === 0) total = 1;

  var ctx = this.contents.context;
  var startAngle = -Math.PI / 2;

  ctx.save();
  for (var i = 0; i < slices.length; i++) {
    var slice = slices[i];
    var sliceAngle = (slice.val / total) * Math.PI * 2;
    if (sliceAngle < 0.01) continue;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 레이블 (큰 조각만)
    if (sliceAngle > 0.5) {
      var midAngle = startAngle + sliceAngle / 2;
      var lx = cx + Math.cos(midAngle) * r * 0.6;
      var ly = cy + Math.sin(midAngle) * r * 0.6;
      this.contents.fontSize = 8;
      this.contents.textColor = '#ffffff';
      this.contents.drawText(slice.label, lx - 12, ly - 5, 24, 10, 'center');
    }

    startAngle += sliceAngle;
  }
  ctx.restore();
};

/** 스킬 전체 목록 뷰 */
Window_TacticsPanel.prototype._drawSkillDetailView = function(actor) {
  if (!actor) return;

  // 헤더
  this.contents.fontSize = 15;
  this.contents.textColor = '#88ccff';
  this.contents.drawText(actor.name() + ' — 습득 스킬 목록', 8, 4, this.innerWidth - 16, 20, 'left');

  this.contents.fontSize = 11;
  this.contents.textColor = '#666666';
  this.contents.drawText('[ESC/클릭으로 돌아가기]', this.innerWidth - 160, 6, 150, 16, 'right');

  var y = 30;
  var skills = actor.skills();

  // 열 헤더
  this.contents.textColor = '#888888';
  this.contents.fontSize = 11;
  this.contents.drawText('스킬', 40, y, 120, 14, 'left');
  this.contents.drawText('MP', 170, y, 30, 14, 'right');
  this.contents.drawText('사거리', 210, y, 40, 14, 'center');
  this.contents.drawText('습득 경로', 260, y, 100, 14, 'left');
  y += 18;
  this.contents.fillRect(8, y, this.innerWidth - 16, 1, 'rgba(255,255,255,0.1)');
  y += 4;

  for (var i = 0; i < skills.length && y < this.innerHeight - 20; i++) {
    var sk = skills[i];
    // 아이콘
    if (sk.iconIndex > 0) this.drawIcon(sk.iconIndex, 8, y - 2);
    // 이름
    this.contents.textColor = '#cccccc';
    this.contents.fontSize = 12;
    this.contents.drawText(sk.name, 40, y + 2, 120, 16, 'left');
    // MP
    this.contents.textColor = '#8888cc';
    this.contents.drawText(String(sk.mpCost), 170, y + 2, 30, 16, 'right');
    // 사거리 (노트태그에서)
    var rangeMatch = (sk.note || '').match(/<srpgRange:\s*(\d+)/i);
    var rangeText = rangeMatch ? rangeMatch[1] : '-';
    this.contents.textColor = '#888888';
    this.contents.drawText(rangeText, 210, y + 2, 40, 16, 'center');
    // 습득 경로
    var source = actor.getSkillSource ? actor.getSkillSource(sk.id) : 'innate';
    var sourceText = source === 'innate' ? '고유' :
                     source === 'event' ? '이벤트' :
                     (typeof $gameActors !== 'undefined' && $gameActors.actor(Number(source))) ?
                       $gameActors.actor(Number(source)).name() + '에게 배움' : String(source);
    this.contents.textColor = '#999966';
    this.contents.fontSize = 11;
    this.contents.drawText(sourceText, 260, y + 2, 120, 16, 'left');

    y += 24;
  }
};

// --- 터치 ---

Window_TacticsPanel.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  if (!TouchInput.isTriggered()) return;

  if (this._showSkillDetail) {
    // 아무 곳 클릭하면 돌아감
    this._showSkillDetail = false;
    this.refresh();
    return;
  }

  // 카드 클릭 → 스킬 상세
  var tx = this.canvasToLocalX(TouchInput.x);
  var ty = this.canvasToLocalY(TouchInput.y);
  var members = $gameParty.members();
  var maxCards = Math.min(members.length, 6);
  var cardW = Math.floor((this.innerWidth - 16) / Math.min(maxCards, 3));
  var cardH = Math.floor((this.innerHeight - 8) / 2);

  for (var i = 0; i < maxCards; i++) {
    var col = i % 3;
    var row = Math.floor(i / 3);
    var cx = 8 + col * cardW;
    var cy = 4 + row * cardH;
    if (tx >= cx && tx < cx + cardW - 8 && ty >= cy && ty < cy + cardH - 8) {
      this._detailActorIdx = i;
      this._showSkillDetail = true;
      SoundManager.playCursor();
      this.refresh();
      return;
    }
  }
};


// ═══════════════════════════════════════════════════════════════════
//  11. Window_JournalPanel — 일지(Journal) 화면
// ═══════════════════════════════════════════════════════════════════

function Window_JournalPanel() {
  this.initialize.apply(this, arguments);
}

Window_JournalPanel.prototype = Object.create(Window_Base.prototype);
Window_JournalPanel.prototype.constructor = Window_JournalPanel;

Window_JournalPanel.prototype.initialize = function(x, y, w, h) {
  Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
  this._tab = 0;  // 0=메인퀘스트, 1=사이드, 2=이벤트기록
  this._scrollY = 0;
};

Window_JournalPanel.prototype.refresh = function() {
  this.contents.clear();
  this._drawJournalTabs();

  var y = 40;
  if (this._tab === 0 || this._tab === 1) {
    this._drawQuestList(y);
  } else {
    this._drawEventLog(y);
  }
};

Window_JournalPanel.prototype._drawJournalTabs = function() {
  var tabs = ['메인 퀘스트', '사이드 퀘스트', '이벤트 기록'];
  var tabW = Math.floor(this.innerWidth / tabs.length);
  for (var i = 0; i < tabs.length; i++) {
    var x = i * tabW;
    if (i === this._tab) {
      this.contents.fillRect(x, 0, tabW, 30, 'rgba(100,180,255,0.3)');
      this.contents.textColor = '#88ccff';
    } else {
      this.contents.fillRect(x, 0, tabW, 30, 'rgba(255,255,255,0.05)');
      this.contents.textColor = '#888888';
    }
    this.contents.fontSize = 14;
    this.contents.drawText(tabs[i], x, 6, tabW, 20, 'center');
  }
};

Window_JournalPanel.prototype._drawQuestList = function(baseY) {
  if (!$gameParty) return;
  var quests = $gameParty.allQuests();
  // 탭에 따라 필터 (간단 분류: id < 1000 메인, >= 1000 사이드)
  var isMain = (this._tab === 0);
  var filtered = quests.filter(function(q) {
    return isMain ? (q.id < 1000) : (q.id >= 1000);
  });

  if (filtered.length === 0) {
    this.contents.textColor = '#555555';
    this.contents.fontSize = 14;
    this.contents.drawText('등록된 퀘스트가 없습니다.', 0, baseY + 20, this.innerWidth, 20, 'center');
    return;
  }

  var y = baseY;
  this.contents.fontSize = 13;
  for (var i = 0; i < filtered.length && y < this.innerHeight - 20; i++) {
    var q = filtered[i];
    // 상태 아이콘
    var statusIcon = q.status === 'completed' ? '\u2713' : '\u25CB';
    var statusColor = q.status === 'completed' ? '#66aa66' : '#cccc66';
    this.contents.textColor = statusColor;
    this.contents.drawText(statusIcon, 8, y, 20, 18, 'left');
    // 제목
    this.contents.textColor = q.status === 'completed' ? '#888888' : '#cccccc';
    this.contents.drawText(q.title, 28, y, this.innerWidth - 40, 18, 'left');
    y += 20;
    // 설명
    if (q.desc) {
      this.contents.textColor = '#777777';
      this.contents.fontSize = 11;
      this.contents.drawText(q.desc, 28, y, this.innerWidth - 40, 14, 'left');
      y += 16;
      this.contents.fontSize = 13;
    }
    y += 4;
  }
};

Window_JournalPanel.prototype._drawEventLog = function(baseY) {
  if (!$gameParty || !$gameParty.eventLog) return;
  var events = $gameParty.eventLog();
  if (events.length === 0) {
    this.contents.textColor = '#555555';
    this.contents.fontSize = 14;
    this.contents.drawText('기록된 이벤트가 없습니다.', 0, baseY + 20, this.innerWidth, 20, 'center');
    return;
  }

  var y = baseY;
  this.contents.fontSize = 12;
  // 최신순
  for (var i = events.length - 1; i >= 0 && y < this.innerHeight - 20; i--) {
    var ev = events[i];
    this.contents.textColor = '#aaaaaa';
    this.contents.drawText('\u25AA ' + ev.title, 8, y, this.innerWidth - 16, 16, 'left');
    y += 16;
    if (ev.desc) {
      this.contents.textColor = '#777777';
      this.contents.fontSize = 11;
      this.contents.drawText(ev.desc, 24, y, this.innerWidth - 32, 14, 'left');
      y += 14;
      this.contents.fontSize = 12;
    }
    y += 6;
  }
};

Window_JournalPanel.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  if (!TouchInput.isTriggered()) return;
  var ty = this.canvasToLocalY(TouchInput.y);
  var tx = this.canvasToLocalX(TouchInput.x);
  if (ty >= 0 && ty <= 30 && tx >= 0 && tx <= this.innerWidth) {
    var tabW = Math.floor(this.innerWidth / 3);
    var idx = Math.floor(tx / tabW);
    if (idx >= 0 && idx < 3 && idx !== this._tab) {
      this._tab = idx;
      SoundManager.playCursor();
      this.refresh();
    }
  }
};


// ═══════════════════════════════════════════════════════════════════
//  12. Window_SystemPanel — 시스템(System) 화면
// ═══════════════════════════════════════════════════════════════════

function Window_SystemPanel() {
  this.initialize.apply(this, arguments);
}

Window_SystemPanel.prototype = Object.create(Window_Command.prototype);
Window_SystemPanel.prototype.constructor = Window_SystemPanel;

Window_SystemPanel.prototype.initialize = function(x, y, w, h) {
  this._customWidth = w;
  this._customHeight = h;
  Window_Command.prototype.initialize.call(this, new Rectangle(x, y, w, h));
};

Window_SystemPanel.prototype.makeCommandList = function() {
  this.addCommand('저장',     'save',    true);
  this.addCommand('불러오기', 'load',    true);
  this.addCommand('옵션',     'options', true);
  this.addCommand('타이틀로', 'toTitle', true);
};

Window_SystemPanel.prototype.itemHeight = function() {
  return 44;
};

Window_SystemPanel.prototype.drawItem = function(index) {
  var rect = this.itemLineRect(index);
  this.resetTextColor();
  this.contents.fontSize = 16;
  this.contents.drawText(this.commandName(index), rect.x + 20, rect.y, rect.width - 40, rect.height, 'center');
};


// --- Scene 연결: 전술 + 일지 + 시스템 ---

var _Scene_CustomMenu_createContentArea_tjs = Scene_CustomMenu.prototype._createContentArea;
Scene_CustomMenu.prototype._createContentArea = function() {
  _Scene_CustomMenu_createContentArea_tjs.call(this);
  var r = this._contentRect;

  // 전술
  this._tacticsPanel = new Window_TacticsPanel(r.x, r.y, r.w, r.h);
  this._tacticsPanel.hide();
  this._contentWindows['tactics'] = this._tacticsPanel;
  this.addChild(this._tacticsPanel);

  // 일지
  this._journalPanel = new Window_JournalPanel(r.x, r.y, r.w, r.h);
  this._journalPanel.hide();
  this._contentWindows['journal'] = this._journalPanel;
  this.addChild(this._journalPanel);

  // 시스템
  this._systemPanel = new Window_SystemPanel(r.x + Math.floor(r.w * 0.3), r.y + 40,
    Math.floor(r.w * 0.4), 240);
  this._systemPanel.hide();
  this._systemPanel.setHandler('save',    this._onSystemSave.bind(this));
  this._systemPanel.setHandler('load',    this._onSystemLoad.bind(this));
  this._systemPanel.setHandler('options', this._onSystemOptions.bind(this));
  this._systemPanel.setHandler('toTitle', this._onSystemToTitle.bind(this));
  this._systemPanel.setHandler('cancel',  this._onSystemCancel.bind(this));
  this._contentWindows['system'] = this._systemPanel;
  this.addChild(this._systemPanel);
};

var _Scene_CustomMenu_showContent_tjs = Scene_CustomMenu.prototype._showContent;
Scene_CustomMenu.prototype._showContent = function(tabName) {
  _Scene_CustomMenu_showContent_tjs.call(this, tabName);
  if (tabName === 'system' && this._systemPanel) {
    this._systemPanel.activate();
    this._systemPanel.select(0);
  }
};

Scene_CustomMenu.prototype._onSystemSave = function() {
  SceneManager.push(Scene_Save);
};

Scene_CustomMenu.prototype._onSystemLoad = function() {
  SceneManager.push(Scene_Load);
};

Scene_CustomMenu.prototype._onSystemOptions = function() {
  SceneManager.push(Scene_Options);
};

Scene_CustomMenu.prototype._onSystemToTitle = function() {
  SceneManager.goto(Scene_Title);
};

Scene_CustomMenu.prototype._onSystemCancel = function() {
  this._commandWindow.activate();
  this._showContent(this._activeTab || 'character');
};

// ═══════════════════════════════════════════════════════════════════
//  6. 전역 노출
// ═══════════════════════════════════════════════════════════════════

window.Scene_CustomMenu = Scene_CustomMenu;
window.Window_PartyDisplay = Window_PartyDisplay;
window.Window_CustomMenuCommand = Window_CustomMenuCommand;
window.Window_CharacterPanel = Window_CharacterPanel;
window.Window_BondsPanel = Window_BondsPanel;
window.Window_GridInventoryPanel = Window_GridInventoryPanel;
window.Window_TacticsPanel = Window_TacticsPanel;
window.Window_JournalPanel = Window_JournalPanel;
window.Window_SystemPanel = Window_SystemPanel;

})();
