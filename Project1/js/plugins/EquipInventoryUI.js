//=============================================================================
// EquipInventoryUI.js — Diablo 2 Style Equipment + Inventory UI
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Diablo 2 style paperdoll equipment slots + grid inventory in-game UI. Replaces the character tab equipment section with a dedicated equip tab.
 * @author GahoRok
 * @orderAfter MenuOverhaul
 * @orderAfter GridInventory
 *
 * @help
 * ============================================================================
 * Diablo 2 Style Equipment & Inventory UI (EquipInventoryUI.js)
 * ============================================================================
 *
 * Adds an "장비" (Equipment) tab to the custom menu with:
 *   - Left panel: Actor standing illustration / radar chart toggle
 *   - Right panel: Paperdoll equipment slots (D2-style sizing)
 *   - Center bar: Navigation buttons (prev/next actor, stats toggle, etc.)
 *   - Bottom panel: Grid inventory with square cells
 *
 * Equipment slots follow D2 proportions:
 *   투구(helm) 2x2, 무기(weapon) 2x4, 갑옷(armor) 2x3,
 *   방패(shield) 2x4, 장갑(gloves) 2x2, 벨트(belt) 2x1, 신발(boots) 2x2
 *
 * Slot → etypeId mapping:
 *   0:무기(etypeId 1), 1:방패(etypeId 2), 2:투구(etypeId 3),
 *   3:갑옷(etypeId 4), 4:신발(etypeId 5), 5:장갑(etypeId 6),
 *   6:벨트/장신구(etypeId 7)
 *
 * ============================================================================
 */

(function() {
'use strict';

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

var RS = function() {
  return Math.max(Graphics.width / 816, Graphics.height / 624, 1);
};

// Equipment slot definitions: D2-style grid sizes (in cell units)
// Order: display order in paperdoll
var EQUIP_SLOTS = [
  { id: 'helm',   name: '투구', etypeId: 3, equipIdx: 2, gw: 2, gh: 2 },
  { id: 'weapon', name: '무기', etypeId: 1, equipIdx: 0, gw: 2, gh: 4 },
  { id: 'armor',  name: '갑옷', etypeId: 4, equipIdx: 3, gw: 2, gh: 3 },
  { id: 'shield', name: '방패', etypeId: 2, equipIdx: 1, gw: 2, gh: 4 },
  { id: 'gloves', name: '장갑', etypeId: 6, equipIdx: 5, gw: 2, gh: 2 },
  { id: 'belt',   name: '벨트', etypeId: 7, equipIdx: 6, gw: 2, gh: 1 },
  { id: 'boots',  name: '신발', etypeId: 5, equipIdx: 4, gw: 2, gh: 2 }
];

// Colors
var COL_BG       = 'rgba(15, 21, 32, 1)';
var COL_SLOT_BG  = 'rgba(26, 42, 60, 1)';
var COL_SLOT_BD  = 'rgba(46, 74, 102, 1)';
var COL_SLOT_HL  = 'rgba(90, 138, 180, 0.5)';
var COL_LABEL    = 'rgba(74, 122, 158, 1)';
var COL_GRID_BG  = 'rgba(24, 32, 48, 1)';
var COL_GRID_BD  = 'rgba(30, 46, 66, 1)';
var COL_OCCUPY   = 'rgba(42, 58, 32, 0.6)';
var COL_PREVIEW_OK  = 'rgba(100, 200, 120, 0.3)';
var COL_PREVIEW_NG  = 'rgba(200, 80, 80, 0.3)';
var COL_RADAR_FILL  = 'rgba(90, 138, 180, 0.25)';
var COL_RADAR_LINE  = 'rgba(90, 138, 180, 0.8)';
var COL_RADAR_PV_FILL = 'rgba(100, 200, 120, 0.15)';
var COL_RADAR_PV_LINE = 'rgba(100, 200, 120, 0.8)';
var COL_ACTOR_NAME = '#5a8ab4';

// Tooltip colors (D2-style)
var COL_TT_BG     = 'rgba(8, 12, 20, 0.94)';
var COL_TT_BD     = 'rgba(80, 110, 140, 0.85)';
var COL_TT_NAME   = '#c8a864';   // gold
var COL_TT_STAT   = '#8888ff';   // blue stat text
var COL_TT_DESC   = '#cccccc';   // gray desc
var COL_TT_TYPE   = '#00cc00';   // green type label
var COL_TT_NEGATIVE = '#ff4444'; // red for negative stats

// Radar chart axes for equipment stats
var STAT_AXES = [
  { key: 'atk', name: 'ATK', param: 2 },
  { key: 'def', name: 'DEF', param: 3 },
  { key: 'agi', name: 'SPD', param: 6 },
  { key: 'mhp', name: 'HP',  param: 0 },
  { key: 'mmp', name: 'MP',  param: 1 }
];
var STAT_CAP = { atk: 200, def: 200, agi: 150, mhp: 9999, mmp: 999 };


// ═══════════════════════════════════════════════════════════════════
//  Helper: load item image from <invImage:path> notetag
// ═══════════════════════════════════════════════════════════════════

var _imgCache = {};
var _imgReady = {};

function loadInvImage(dataItem, callback) {
  if (!dataItem || !dataItem.note) return null;
  var key = (dataItem.id || 0) + '_' + (dataItem.name || '');
  if (_imgReady[key]) return _imgCache[key] || null;
  if (_imgCache[key] === undefined) {
    var m = dataItem.note.match(/<invImage:([^>]+)>/);
    if (!m) { _imgCache[key] = null; _imgReady[key] = true; return null; }
    var path = m[1];
    var lastSlash = path.lastIndexOf('/');
    var folder = (lastSlash >= 0) ? path.substring(0, lastSlash + 1) : '';
    var name = path.substring(lastSlash + 1).replace(/\.png$/i, '');
    var bmp = ImageManager.loadBitmap(folder, name);
    _imgCache[key] = bmp;
    bmp.addLoadListener(function() {
      _imgReady[key] = true;
      if (callback) callback();
    });
    return null;
  }
  return _imgCache[key];
}


// ═══════════════════════════════════════════════════════════════════
//  1. Window_StandingPanel — 좌측: 스탠딩 일러스트 / 오각형 레이더
// ═══════════════════════════════════════════════════════════════════

function Window_StandingPanel() {
  this.initialize.apply(this, arguments);
}

Window_StandingPanel.prototype = Object.create(Window_Base.prototype);
Window_StandingPanel.prototype.constructor = Window_StandingPanel;

Window_StandingPanel.prototype.initialize = function(rect) {
  Window_Base.prototype.initialize.call(this, rect);
  this._actor = null;
  this._showRadar = false;
  this._previewStats = null;  // {atk, def, agi, mhp, mmp} delta from hovering equip
  this._previewName = '';
  this._standingBmp = null;
  this._standingReady = false;
  this.refresh();
};

Window_StandingPanel.prototype.setActor = function(actor) {
  if (this._actor !== actor) {
    this._actor = actor;
    this._previewStats = null;
    this._standingBmp = null;
    this._standingReady = false;
    this._loadStanding();
    this.refresh();
  }
};

Window_StandingPanel.prototype.setShowRadar = function(show) {
  if (this._showRadar !== show) {
    this._showRadar = show;
    this.refresh();
  }
};

Window_StandingPanel.prototype.toggleRadar = function() {
  this.setShowRadar(!this._showRadar);
};

Window_StandingPanel.prototype.setPreviewStats = function(stats, name) {
  this._previewStats = stats;
  this._previewName = name || '';
  if (this._showRadar) this.refresh();
};

Window_StandingPanel.prototype.clearPreview = function() {
  this._previewStats = null;
  this._previewName = '';
  if (this._showRadar) this.refresh();
};

Window_StandingPanel.prototype._loadStanding = function() {
  if (!this._actor) return;
  // 스탠딩 일러스트 준비 전까지 플레이스홀더 실루엣 표시
  this._standingBmp = null;
  this._standingReady = true;
  this.refresh();
};

Window_StandingPanel.prototype.refresh = function() {
  this.contents.clear();
  // dark background fill
  this.contents.fillRect(0, 0, this.innerWidth, this.innerHeight, COL_BG);

  if (!this._actor) return;

  if (this._showRadar) {
    this._drawRadarView();
  } else {
    this._drawStandingView();
  }

  // Actor name at bottom
  this.contents.fontSize = 12;
  this.contents.textColor = COL_ACTOR_NAME;
  this.contents.drawText(
    this._actor.name(),
    0, this.innerHeight - 20, this.innerWidth, 18, 'center'
  );
};

Window_StandingPanel.prototype._drawStandingView = function() {
  var iw = this.innerWidth;
  var ih = this.innerHeight - 24;
  var ctx = this.contents.context;

  // 플레이스홀더 실루엣 — 전신 윤곽
  var cx = Math.floor(iw / 2);
  var headR = Math.floor(iw * 0.12);
  var headY = Math.floor(ih * 0.15);
  var shoulderW = Math.floor(iw * 0.32);
  var bodyTop = headY + headR + 4;
  var bodyBot = Math.floor(ih * 0.92);

  ctx.save();
  // 머리 (원)
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = '#1a2a3a';
  ctx.fill();
  ctx.strokeStyle = '#2a4a6a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 몸통 (사다리꼴)
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW * 0.4, bodyTop);
  ctx.lineTo(cx + shoulderW * 0.4, bodyTop);
  ctx.lineTo(cx + shoulderW, bodyBot);
  ctx.lineTo(cx - shoulderW, bodyBot);
  ctx.closePath();
  ctx.fillStyle = '#1a2a3a';
  ctx.fill();
  ctx.strokeStyle = '#2a4a6a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // "Standing" 텍스트
  this.contents.fontSize = 11;
  this.contents.textColor = '#3a5a7a';
  this.contents.drawText('Standing Image', 0, ih - 16, iw, 14, 'center');
};

Window_StandingPanel.prototype._drawRadarView = function() {
  var iw = this.innerWidth;
  var ih = this.innerHeight - 28;
  var gaugeH = 14, gaugeGap = 3, gaugeCount = 5;
  var gaugeBlockH = gaugeCount * gaugeH + (gaugeCount - 1) * gaugeGap + 8;
  var radarAreaH = ih - gaugeBlockH;
  var cx = Math.floor(iw / 2);
  var cy = Math.floor(radarAreaH / 2);
  var radius = Math.min(iw / 2 - 26, radarAreaH / 2 - 22);
  if (radius < 20) return;

  var ctx = this.contents.context;
  // uses module-scope STAT_AXES
  // uses module-scope STAT_CAP
  var n = STAT_AXES.length;
  var actor = this._actor;
  if (!actor) return;

  // --- raw values ---
  var rawVals = [];
  for (var i = 0; i < n; i++) rawVals.push(actor.param(STAT_AXES[i].param));
  var pvRaw = null;
  if (this._previewStats) {
    pvRaw = [];
    for (var i = 0; i < n; i++) {
      var pid = STAT_AXES[i].param;
      pvRaw.push(rawVals[i] + (this._previewStats[pid] || 0));
    }
  }

  // --- helper: vertex position ---
  var vx = function(i, r) {
    return cx + r * Math.cos(Math.PI / 2 + (2 * Math.PI * i) / n) * -1;
  };
  var vy = function(i, r) {
    return cy - r * Math.sin(Math.PI / 2 + (2 * Math.PI * i) / n);
  };

  // --- grid rings ---
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1;
  for (var ring = 1; ring <= 4; ring++) {
    var rr = radius * ring / 4;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(vx(i, rr), vy(i, rr));
      else ctx.lineTo(vx(i, rr), vy(i, rr));
    }
    ctx.closePath();
    ctx.stroke();
  }

  // --- axis lines ---
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  for (var i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(vx(i, radius), vy(i, radius));
    ctx.stroke();
  }

  // --- delta area (green / red) ---
  if (pvRaw) {
    var baseNorm = [], pvNorm = [];
    for (var i = 0; i < n; i++) {
      baseNorm.push(Math.min(rawVals[i] / STAT_CAP[STAT_AXES[i].key], 1));
      pvNorm.push(Math.min(pvRaw[i] / STAT_CAP[STAT_AXES[i].key], 1));
    }
    // determine per-axis direction
    for (var i = 0; i < n; i++) {
      var i2 = (i + 1) % n;
      // triangle: base[i], base[i2], pv[i], pv[i2]
      var diff1 = pvNorm[i] - baseNorm[i];
      var diff2 = pvNorm[i2] - baseNorm[i2];
      var anyUp = diff1 > 0 || diff2 > 0;
      var anyDown = diff1 < 0 || diff2 < 0;
      if (!anyUp && !anyDown) continue;
      ctx.beginPath();
      ctx.moveTo(vx(i, baseNorm[i] * radius), vy(i, baseNorm[i] * radius));
      ctx.lineTo(vx(i2, baseNorm[i2] * radius), vy(i2, baseNorm[i2] * radius));
      ctx.lineTo(vx(i2, pvNorm[i2] * radius), vy(i2, pvNorm[i2] * radius));
      ctx.lineTo(vx(i, pvNorm[i] * radius), vy(i, pvNorm[i] * radius));
      ctx.closePath();
      if (anyUp && !anyDown) ctx.fillStyle = 'rgba(80,200,120,0.35)';
      else if (anyDown && !anyUp) ctx.fillStyle = 'rgba(220,80,80,0.35)';
      else ctx.fillStyle = 'rgba(200,200,80,0.25)';
      ctx.fill();
    }
  }

  // --- base polygon ---
  ctx.beginPath();
  for (var i = 0; i < n; i++) {
    var norm = Math.min(rawVals[i] / STAT_CAP[STAT_AXES[i].key], 1);
    var px = vx(i, norm * radius), py = vy(i, norm * radius);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(100,180,255,0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,180,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- preview polygon outline ---
  if (pvRaw) {
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var norm = Math.min(pvRaw[i] / STAT_CAP[STAT_AXES[i].key], 1);
      var px = vx(i, norm * radius), py = vy(i, norm * radius);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- axis labels (outlined, no values) ---
  var labelOff = 12;
  for (var i = 0; i < n; i++) {
    var lx = vx(i, radius + labelOff);
    var ly = vy(i, radius + labelOff);
    this._drawOutlinedText(ctx, STAT_AXES[i].name, lx, ly, 10, '#ffffff', '#000000', 'center');
  }

  // ===== GAUGE BARS (below pentagon) =====
  var gaugeTop = radarAreaH + 2;
  var gaugeLR = 8;
  var gaugeW = iw - gaugeLR * 2;

  for (var i = 0; i < n; i++) {
    var gy = gaugeTop + i * (gaugeH + gaugeGap);
    var val = rawVals[i];
    var cap = STAT_CAP[STAT_AXES[i].key];
    var ratio = Math.min(val / cap, 1);

    // background bar (rounded, dark)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    this._fillRoundRect(ctx, gaugeLR, gy, gaugeW, gaugeH, 4);

    // current value fill
    var fillW = Math.max(gaugeW * ratio, 0);
    if (fillW > 0) {
      ctx.fillStyle = 'rgba(70,130,180,0.45)';
      this._fillRoundRect(ctx, gaugeLR, gy, fillW, gaugeH, 4);
    }

    // delta fill
    if (pvRaw) {
      var newVal = pvRaw[i];
      var newRatio = Math.min(newVal / cap, 1);
      var diff = newRatio - ratio;
      if (diff > 0) {
        // positive: green bar from current end to new end
        var dw = gaugeW * diff;
        ctx.fillStyle = 'rgba(80,200,120,0.5)';
        this._fillRoundRect(ctx, gaugeLR + fillW, gy, dw, gaugeH, 2);
      } else if (diff < 0) {
        // negative: red bar from new end to current end
        var newFillW = Math.max(gaugeW * newRatio, 0);
        var dw = fillW - newFillW;
        ctx.fillStyle = 'rgba(220,80,80,0.5)';
        this._fillRoundRect(ctx, gaugeLR + newFillW, gy, dw, gaugeH, 2);
      }
    }

    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    this._strokeRoundRect(ctx, gaugeLR, gy, gaugeW, gaugeH, 4);

    // text overlay: name (left) and value (right)
    var nameStr = STAT_AXES[i].name;
    var midY = gy + gaugeH / 2;
    this._drawOutlinedText(ctx, nameStr, gaugeLR + 6, midY, 9, '#ffffff', '#000000', 'left');

    if (pvRaw) {
      var newVal = pvRaw[i];
      var d = newVal - val;
      if (d > 0) {
        this._drawOutlinedText(ctx, String(val) + '→' + String(newVal),
          gaugeLR + gaugeW - 6, midY, 9, '#60e860', '#000000', 'right');
      } else if (d < 0) {
        this._drawOutlinedText(ctx, String(val) + '→' + String(newVal),
          gaugeLR + gaugeW - 6, midY, 9, '#dc5050', '#000000', 'right');
      } else {
        this._drawOutlinedText(ctx, String(val),
          gaugeLR + gaugeW - 6, midY, 9, '#ffffff', '#000000', 'right');
      }
    } else {
      this._drawOutlinedText(ctx, String(val),
        gaugeLR + gaugeW - 6, midY, 9, '#ffffff', '#000000', 'right');
    }
  }
};

// --- Helper: outlined text ---
Window_StandingPanel.prototype._drawOutlinedText = function(ctx, text, x, y, fontSize, fillColor, strokeColor, align) {
  ctx.save();
  ctx.font = 'bold ' + fontSize + 'px ' + this.contents.fontFace;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = strokeColor || '#000000';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor || '#ffffff';
  ctx.fillText(text, x, y);
  ctx.restore();
};

// --- Helper: fill rounded rect ---
Window_StandingPanel.prototype._fillRoundRect = function(ctx, x, y, w, h, r) {
  if (w <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
};

// --- Helper: stroke rounded rect ---
Window_StandingPanel.prototype._strokeRoundRect = function(ctx, x, y, w, h, r) {
  if (w <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
};



// ═══════════════════════════════════════════════════════════════════
//  2. Window_EquipPaperdoll — 우측: D2식 장비 슬롯
// ═══════════════════════════════════════════════════════════════════

function Window_EquipPaperdoll() {
  this.initialize.apply(this, arguments);
}

Window_EquipPaperdoll.prototype = Object.create(Window_Selectable.prototype);
Window_EquipPaperdoll.prototype.constructor = Window_EquipPaperdoll;

Window_EquipPaperdoll.prototype.initialize = function(rect) {
  Window_Selectable.prototype.initialize.call(this, rect);
  this._actor = null;
  this._slotRects = [];  // [{x, y, w, h, slotDef}] in content coords
  this._hoveredSlot = -1;
  this._onSlotHover = null;   // callback(slotDef, equipItem) or null
  this._onSlotUnhover = null; // callback()
  this._onSlotContext = null; // callback(item, slotIdx, screenX, screenY)
  this._dragItem = null;
  this._dragSlotIdx = -1;
  this._dragStartX = 0;
  this._dragStartY = 0;
  this._dragging = false;
  this._cellUnit = 24;
  this._calcLayout();
  this.refresh();
};

Window_EquipPaperdoll.prototype.maxItems = function() {
  return EQUIP_SLOTS.length;
};

Window_EquipPaperdoll.prototype.setActor = function(actor) {
  if (this._actor !== actor) {
    this._actor = actor;
    this._calcLayout();
    this.refresh();
  }
};

Window_EquipPaperdoll.prototype._calcLayout = function() {
  var iw = this.innerWidth;
  var ih = this.innerHeight;
  // Grid: 6 cells wide (2+2+2), 8 cells tall (helm2 + body4 + boots2) + 2 gaps
  var cu = Math.floor(Math.min(iw / 7, ih / 8.5));
  this._cellUnit = Math.max(20, cu);
  var c = this._cellUnit;
  var gap = Math.floor(c * 0.12);

  // Total dimensions for centering (rowGap = vertical spacing between rows)
  var totalW = 6 * c + 2 * gap;
  var rowGap = Math.max(2, Math.floor(c * 0.15));
  var totalH = 8 * c + 2 * gap + 2 * rowGap;
  var ox = Math.floor((iw - totalW) / 2);
  var oy = Math.floor((ih - totalH) / 2);

  var row1Y = oy;                              // Helm row
  var row2Y = oy + 2*c + rowGap;               // Body row (weapon/armor/shield)
  var row3Y = row2Y + 4*c + rowGap;            // Bottom row (gloves/belt/boots)

  this._slotRects = [];
  // Helm 2x2 — top center
  this._slotRects.push({ x: ox + 2*c + gap, y: row1Y, w: 2*c, h: 2*c, slotDef: EQUIP_SLOTS[0] });
  // Weapon 2x4 — left middle
  this._slotRects.push({ x: ox, y: row2Y, w: 2*c, h: 4*c, slotDef: EQUIP_SLOTS[1] });
  // Armor 2x4 — center middle (same height as weapon/shield)
  this._slotRects.push({ x: ox + 2*c + gap, y: row2Y, w: 2*c, h: 4*c, slotDef: EQUIP_SLOTS[2] });
  // Shield 2x4 — right middle
  this._slotRects.push({ x: ox + 4*c + 2*gap, y: row2Y, w: 2*c, h: 4*c, slotDef: EQUIP_SLOTS[3] });
  // Gloves 2x2 — left bottom
  this._slotRects.push({ x: ox, y: row3Y, w: 2*c, h: 2*c, slotDef: EQUIP_SLOTS[4] });
  // Belt 2x2 — center bottom (same size as gloves/boots)
  this._slotRects.push({ x: ox + 2*c + gap, y: row3Y, w: 2*c, h: 2*c, slotDef: EQUIP_SLOTS[5] });
  // Boots 2x2 — right bottom
  this._slotRects.push({ x: ox + 4*c + 2*gap, y: row3Y, w: 2*c, h: 2*c, slotDef: EQUIP_SLOTS[6] });
};

Window_EquipPaperdoll.prototype.refresh = function() {
  this.contents.clear();
  this.contents.fillRect(0, 0, this.innerWidth, this.innerHeight, COL_BG);
  if (!this._actor) return;

  var equips = this._actor.equips();

  for (var i = 0; i < this._slotRects.length; i++) {
    var sr = this._slotRects[i];
    var sd = sr.slotDef;
    var item = equips[sd.equipIdx];
    var isHovered = (this._hoveredSlot === i || this.index() === i);

    // Slot background
    var bg = isHovered ? COL_SLOT_HL : COL_SLOT_BG;
    this.contents.fillRect(sr.x, sr.y, sr.w, sr.h, bg);

    // Border
    var ctx = this.contents.context;
    ctx.strokeStyle = isHovered ? '#5a8ab4' : COL_SLOT_BD;
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.strokeRect(sr.x + 0.5, sr.y + 0.5, sr.w - 1, sr.h - 1);

    if (item) {
      // Try to draw item image
      var bmp = loadInvImage(item, this.refresh.bind(this));
      if (bmp && bmp.isReady()) {
        var sw = bmp.width;
        var sh = bmp.height;
        // 인벤토리에서 보이는 크기를 기준으로 사용 (gridSize × cellSize)
        var gs = (window.GridInventory && window.GridInventory.getGridSize)
            ? window.GridInventory.getGridSize(item) : {w:1, h:1};
        var _gi = EquipModal._gridInv;
        var invCellSize = (_gi && _gi._cellSize) ? _gi._cellSize : 64;
        var invW = gs.w * invCellSize;
        var invH = gs.h * invCellSize;
        // 인벤토리 기준 스케일 (원본→인벤토리 셀 영역에 맞추기)
        var invScale = Math.min(invW / sw, invH / sh) * 0.9;
        var imgW = sw * invScale;
        var imgH = sh * invScale;
        // (1) 인벤토리 크기가 슬롯 안에 들어가면 → 원본(인벤토리) 크기 유지
        // (2) 인벤토리 크기가 슬롯을 초과하면 → 비율 유지하며 축소
        var finalScale = invScale;
        if (imgW > sr.w || imgH > sr.h) {
          finalScale = Math.min(sr.w / sw, sr.h / sh) * 0.9;
        }
        var dw = Math.floor(sw * finalScale);
        var dh = Math.floor(sh * finalScale);
        var dx = sr.x + Math.floor((sr.w - dw) / 2);
        var dy = sr.y + Math.floor((sr.h - dh) / 2);
        this.contents.blt(bmp, 0, 0, sw, sh, dx, dy, dw, dh);
      } else {
        // Fallback: draw icon + name
        var iconIdx = item.iconIndex;
        if (iconIdx > 0) {
          var ix = sr.x + Math.floor((sr.w - 32) / 2);
          var iy = sr.y + Math.floor((sr.h - 32) / 2) - 6;
          this.drawIcon(iconIdx, ix, iy);
        }
        this.contents.fontSize = 9;
        this.contents.textColor = '#cccccc';
        this.contents.drawText(item.name, sr.x + 2, sr.y + sr.h - 14, sr.w - 4, 12, 'center');
      }
    } else {
      // ── grip: offhand 잠금 시각 표시 (양손무기 장착 시) ──
      var isOffhandLocked = (sd.id === 'shield' && this._actor.isOffhandLocked && this._actor.isOffhandLocked());
      if (isOffhandLocked) {
        // 반투명 어둡게 + 사선 빗금
        var ctx2 = this.contents.context;
        ctx2.save();
        ctx2.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx2.fillRect(sr.x, sr.y, sr.w, sr.h);
        ctx2.strokeStyle = 'rgba(200, 60, 60, 0.6)';
        ctx2.lineWidth = 2;
        // X 표시
        ctx2.beginPath();
        ctx2.moveTo(sr.x + 4, sr.y + 4);
        ctx2.lineTo(sr.x + sr.w - 4, sr.y + sr.h - 4);
        ctx2.moveTo(sr.x + sr.w - 4, sr.y + 4);
        ctx2.lineTo(sr.x + 4, sr.y + sr.h - 4);
        ctx2.stroke();
        ctx2.restore();
        this.contents.fontSize = 8;
        this.contents.textColor = '#cc4444';
        this.contents.drawText('양손', sr.x, sr.y + Math.floor(sr.h / 2) - 6, sr.w, 12, 'center');
      } else {
        // Empty slot label
        this.contents.fontSize = 9;
        this.contents.textColor = COL_LABEL;
        this.contents.drawText(sd.name, sr.x, sr.y + Math.floor(sr.h / 2) - 6, sr.w, 12, 'center');
      }
    }
  }
};

Window_EquipPaperdoll.prototype.itemRect = function(index) {
  if (index < 0 || index >= this._slotRects.length) {
    return new Rectangle(0, 0, 0, 0);
  }
  var sr = this._slotRects[index];
  return new Rectangle(
    sr.x + this.padding,
    sr.y + this.padding,
    sr.w,
    sr.h
  );
};

Window_EquipPaperdoll.prototype.hitTest = function(x, y) {
  var cx = x - this.padding;
  var cy = y - this.padding;
  for (var i = 0; i < this._slotRects.length; i++) {
    var sr = this._slotRects[i];
    if (cx >= sr.x && cx < sr.x + sr.w && cy >= sr.y && cy < sr.y + sr.h) {
      return i;
    }
  }
  return -1;
};

Window_EquipPaperdoll.prototype.update = function() {
  Window_Selectable.prototype.update.call(this);
  this._updateHover();
};

Window_EquipPaperdoll.prototype._updateHover = function() {
  if (!this._actor) return;
  // 컨텍스트 메뉴가 열려있으면 파퍼돌 입력 처리 건너뛰기
  if (EquipModal._contextMenu && EquipModal._contextMenu.isOpen()) return;
  var tp = new Point(TouchInput.x, TouchInput.y);
  var local = this.worldTransform.applyInverse(tp);
  var idx = this.hitTest(local.x, local.y);

  if (idx !== this._hoveredSlot) {
    this._hoveredSlot = idx;
    if (idx >= 0 && this._onSlotHover) {
      var sd = this._slotRects[idx].slotDef;
      var item = this._actor.equips()[sd.equipIdx];
      this._onSlotHover(sd, item);
    } else if (idx < 0 && this._onSlotUnhover) {
      this._onSlotUnhover();
    }
    this.refresh();
  }

  // 그리드 인벤토리가 드래그 중이면 파퍼돌 자체 입력 건너뛰기
  var _gridDragging = EquipModal._gridInv && EquipModal._gridInv._dragging;
  // 좌클릭 = 클릭앤드롭 (즉시 드래그 시작) — 그리드 드래그 중 아님
  var _justDropped = EquipModal._dropFrame === Graphics.frameCount;
  if (!_gridDragging && !_justDropped && TouchInput.isTriggered() && idx >= 0) {
    var sd2 = this._slotRects[idx].slotDef;
    var item2 = this._actor.equips()[sd2.equipIdx];
    if (item2) {
      this._dragItem = item2;
      this._dragSlotIdx = idx;
      this._dragging = true;
      SoundManager.playOk();
      if (EquipModal._showDragSprite) EquipModal._showDragSprite(item2);
      return; // 드래그 시작 프레임에서 즉시 드롭 방지
    }
  }

  // 드래그 중 재클릭 = 드롭 (파퍼돌 자체 드래그만)
  if (!_gridDragging && this._dragItem && this._dragging && TouchInput.isTriggered() && idx < 0) {
    var dropOk = false;
    if (this._onDragDrop) {
      dropOk = this._onDragDrop(this._dragItem, this._dragSlotIdx, 'equip');
    }
    // 드롭 성공 시에만 드래그 상태 해제
    if (dropOk) {
      this._dragItem = null;
      this._dragSlotIdx = -1;
      this._dragging = false;
      EquipModal._dropFrame = Graphics.frameCount; // gi 이중 처리 방지
    }
  }
};

Window_EquipPaperdoll.prototype.processOk = function() {
  if (this.index() >= 0 && this.index() < this._slotRects.length) {
    var sd = this._slotRects[this.index()].slotDef;
    var item = this._actor.equips()[sd.equipIdx];
    if (item && this._onSlotContext) {
      var sr = this._slotRects[this.index()];
      var sx = this.x + this.padding + sr.x + sr.w;
      var sy = this.y + this.padding + sr.y;
      this._onSlotContext(item, this.index(), sx, sy);
      return;
    }
  }
  this.activate();
};

// 파퍼돌: 기본 processTouch/processHandling/processCursorMove 비활성화
// (자체 _updateHover에서 마우스 처리, 기본 핸들러 간섭 방지)
Window_EquipPaperdoll.prototype.processTouch = function() {};
Window_EquipPaperdoll.prototype.processHandling = function() {};
Window_EquipPaperdoll.prototype.processCursorMove = function() {};


// ═══════════════════════════════════════════════════════════════════
//  3. Window_EquipButtons — 버튼바: ◀ | 능력치 | Btn2 | Btn3 | ▶
// ═══════════════════════════════════════════════════════════════════

function Window_EquipButtons() {
  this.initialize.apply(this, arguments);
}

Window_EquipButtons.prototype = Object.create(Window_HorzCommand.prototype);
Window_EquipButtons.prototype.constructor = Window_EquipButtons;

Window_EquipButtons.prototype.initialize = function(rect) {
  this._hoverIdx = -1;
  Window_HorzCommand.prototype.initialize.call(this, rect);
};

Window_EquipButtons.prototype.maxCols = function() { return 5; };

Window_EquipButtons.prototype.makeCommandList = function() {
  this.addCommand('◀', 'prevActor', true);
  this.addCommand('★ 능력치', 'toggleStats', true);
  this.addCommand('정렬', 'sort', true);
  this.addCommand('버리기', 'discard', true);
  this.addCommand('▶', 'nextActor', true);
};

Window_EquipButtons.prototype.itemRect = function(index) {
  var rect = Window_HorzCommand.prototype.itemRect.call(this, index);
  // Make arrow buttons narrower
  if (index === 0 || index === 4) {
    rect.width = Math.floor(this.innerWidth * 0.1);
    if (index === 4) {
      rect.x = this.innerWidth - rect.width;
    }
  } else {
    // Distribute remaining space among middle 3 buttons
    var arrowW = Math.floor(this.innerWidth * 0.1);
    var midW = Math.floor((this.innerWidth - arrowW * 2) / 3);
    rect.x = arrowW + (index - 1) * midW;
    rect.width = midW;
  }
  return rect;
};

Window_EquipButtons.prototype.drawItem = function(index) {
  var rect = this.itemLineRect(index);
  // 마우스 호버/선택 하이라이트
  if (index === this._hoverIdx) {
    this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, 'rgba(90, 138, 180, 0.35)');
  }
  this.resetTextColor();
  this.contents.fontSize = 12;
  if (index === 0 || index === 4) {
    this.contents.textColor = COL_ACTOR_NAME;
  }
  this.drawText(this.commandName(index), rect.x, rect.y, rect.width, 'center');
};

// 버튼 마우스 호버 추적
Window_EquipButtons.prototype._updateButtonHover = function() {
  if (!this.isOpen()) return;
  var idx = this.hitIndex();
  if (idx !== this._hoverIdx) {
    this._hoverIdx = idx;
    this.refresh();
  }
};


// ═══════════════════════════════════════════════════════════════════
//  4. Window_GridInvD2 — 하단: 정사각형 셀 그리드 인벤토리
// ═══════════════════════════════════════════════════════════════════

// --- 버튼바: 키보드 입력 무시 (마우스 클릭만 허용) ---
// 방향키가 인벤토리 커서와 동기화되는 문제 방지
Window_EquipButtons.prototype.processCursorMove = function() {};
// 키보드 OK/Cancel이 버튼을 통해 처리되는 것 방지
Window_EquipButtons.prototype.processHandling = function() {};
// 우클릭이 버튼 윈도우에서 소비되는 것 방지 (마우스 좌클릭 즉시 실행)
Window_EquipButtons.prototype.processTouch = function() {
    // isOpen만 확인 (deactivate 상태에서도 마우스 클릭 작동)
    if (this.isOpen()) {
        if (EquipModal._contextMenu && EquipModal._contextMenu.isOpen()) return;
        this._updateButtonHover();
        if (TouchInput.isTriggered()) {
            var hitIdx = this.hitIndex();
            if (hitIdx >= 0) {
                this.select(hitIdx);
                this.callHandler(this.currentSymbol());
            }
        }
    }
};


function Window_GridInvD2() {
  this.initialize.apply(this, arguments);
}

Window_GridInvD2.prototype = Object.create(Window_Selectable.prototype);
Window_GridInvD2.prototype.constructor = Window_GridInvD2;

// Window_Selectable의 커서/OK 처리 비활성화 (자체 구현 사용)
Window_GridInvD2.prototype.maxItems = function() { return 0; };
Window_GridInvD2.prototype.processCursorMove = function() {};
Window_GridInvD2.prototype.processHandling = function() {};
Window_GridInvD2.prototype.processTouch = function() {};
Window_GridInvD2.prototype.processOk = function() {};

Window_GridInvD2.prototype.initialize = function(rect) {
  Window_Selectable.prototype.initialize.call(this, rect);
  this._actor = null;
  this._cellSize = 32;
  this._gridOx = 0;
  this._gridOy = 0;
  this._cursorGx = 0;
  this._cursorGy = 0;
  this._hoverGx = -1;
  this._hoverGy = -1;
  this._lastMouseX = 0;
  this._lastMouseY = 0;
  this._selectedPid = 0;  // selected item placement id for equipping
  this._onItemHover = null;
  this._onItemUnhover = null;
  this._onItemSelect = null;
  this._onItemContext = null; // callback(item, pid, screenX, screenY)
  this._onDragDrop = null;
  this._dragItem = null;
  this._dragPid = 0;
  this._dragStartX = 0;
  this._dragStartY = 0;
  this._dragging = false;
  this.refresh();
};

Window_GridInvD2.prototype.setActor = function(actor) {
  if (this._actor !== actor) {
    this._actor = actor;
    this._cursorGx = 0;
    this._cursorGy = 0;
    this._selectedPid = 0;
    this._recalcLayout();
    this.refresh();
  }
};

Window_GridInvD2.prototype._recalcLayout = function() {
  if (!this._actor) return;
  var inv = this._actor.gridInventory();
  if (!inv) return;
  var maxW = this.innerWidth - 8;
  var maxH = this.innerHeight - 8;
  // Square cells: fit to available space
  this._cellSize = Math.min(
    Math.floor(maxW / inv.cols()),
    Math.floor(maxH / inv.rows()),
    64
  );
  var totalW = this._cellSize * inv.cols();
  var totalH = this._cellSize * inv.rows();
  this._gridOx = Math.floor((this.innerWidth - totalW) / 2);
  this._gridOy = Math.floor((this.innerHeight - totalH) / 2);
};

Window_GridInvD2.prototype.refresh = function() {
  this.contents.clear();
  this.contents.fillRect(0, 0, this.innerWidth, this.innerHeight, COL_BG);
  if (!this._actor) return;

  var inv = this._actor.gridInventory();
  if (!inv) return;
  var cs = this._cellSize;
  var ox = this._gridOx;
  var oy = this._gridOy;
  var cols = inv.cols();
  var rows = inv.rows();

  // Draw grid cells
  for (var gy = 0; gy < rows; gy++) {
    for (var gx = 0; gx < cols; gx++) {
      var x = ox + gx * cs;
      var y = oy + gy * cs;
      var pid = inv._grid[gy][gx];

      // Cell background
      if (pid > 0) {
        this.contents.fillRect(x, y, cs, cs, COL_OCCUPY);
      } else {
        this.contents.fillRect(x, y, cs, cs, COL_GRID_BG);
      }

      // Cell border
      var ctx = this.contents.context;
      ctx.strokeStyle = COL_GRID_BD;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
    }
  }

  // Draw item images on occupied cells
  var drawn = {};
  var placements = inv._placements;
  for (var pid in placements) {
    if (drawn[pid]) continue;
    drawn[pid] = true;
    var pl = placements[pid];
    var dataItem = this._getDataItem(pl.itemType, pl.itemId);
    if (!dataItem) continue;

    // 드래그 중인 아이템은 반투명으로 표시
    var isDragged = this._dragging && parseInt(pid) === this._dragPid;
    var ctx = this.contents.context;
    if (isDragged) ctx.globalAlpha = 0.3;

    var px = ox + pl.gx * cs;
    var py = oy + pl.gy * cs;
    var pw = pl.w * cs;
    var ph = pl.h * cs;

    var bmp = loadInvImage(dataItem, this.refresh.bind(this));
    if (bmp && bmp.isReady()) {
      // Use actual bitmap dimensions for source rect (contain-fit)
      var sw = bmp.width;
      var sh = bmp.height;
      var scale = Math.min(pw / sw, ph / sh) * 0.9;
      var dw = Math.floor(sw * scale);
      var dh = Math.floor(sh * scale);
      var dx = px + Math.floor((pw - dw) / 2);
      var dy = py + Math.floor((ph - dh) / 2);
      this.contents.blt(bmp, 0, 0, sw, sh, dx, dy, dw, dh);
    } else {
      // Fallback: icon
      var iconIdx = dataItem.iconIndex;
      if (iconIdx > 0) {
        var ix = px + Math.floor((pw - 32) / 2);
        var iy = py + Math.floor((ph - 32) / 2);
        this.drawIcon(iconIdx, ix, iy);
      }
    }
    if (isDragged) ctx.globalAlpha = 1.0;
  }

  // Cursor highlight (dynamic size: expands to item footprint)
  if (this.active) {
    var cpid = inv._grid[this._cursorGy] && inv._grid[this._cursorGy][this._cursorGx];
    var cw = 1, ch = 1, cdx = this._cursorGx, cdy = this._cursorGy;
    if (cpid > 0 && inv._placements[cpid]) {
      var cpl = inv._placements[cpid];
      cw = cpl.w; ch = cpl.h;
      cdx = cpl.gx; cdy = cpl.gy;
    }
    var cx = ox + cdx * cs;
    var cy = oy + cdy * cs;
    var ctx2 = this.contents.context;
    ctx2.strokeStyle = '#5a8ab4';
    ctx2.lineWidth = 2;
    ctx2.strokeRect(cx + 1, cy + 1, cw * cs - 2, ch * cs - 2);
  }

  // 드래그 중 드롭 프리뷰 (배치 가능/불가 표시)
  if (this._dragging && this._dragPid > 0) {
    var dpl = inv._placements[this._dragPid];
    if (dpl) {
      var tp3 = new Point(TouchInput.x, TouchInput.y);
      var loc3 = this.worldTransform.applyInverse(tp3);
      var pmx = loc3.x - this.padding - this._gridOx;
      var pmy = loc3.y - this.padding - this._gridOy;
      var pgx = Math.floor(pmx / cs);
      var pgy = Math.floor(pmy / cs);
      // 아이템 중앙 오프셋
      var pox = Math.floor(dpl.w / 2);
      var poy = Math.floor(dpl.h / 2);
      var ptx = Math.max(0, Math.min(pgx - pox, inv.cols() - dpl.w));
      var pty = Math.max(0, Math.min(pgy - poy, inv.rows() - dpl.h));
      var canDrop = inv.canPlace(ptx, pty, dpl.w, dpl.h, this._dragPid);
      var pvColor = canDrop ? COL_PREVIEW_OK : COL_PREVIEW_NG;
      for (var pdy = 0; pdy < dpl.h; pdy++) {
        for (var pdx = 0; pdx < dpl.w; pdx++) {
          this.contents.fillRect(
            ox + (ptx + pdx) * cs, oy + (pty + pdy) * cs,
            cs, cs, pvColor
          );
        }
      }
    }
  }
};

Window_GridInvD2.prototype._getDataItem = function(type, id) {
  if (type === 'item') return $dataItems[id];
  if (type === 'weapon') return $dataWeapons[id];
  if (type === 'armor') return $dataArmors[id];
  return null;
};

Window_GridInvD2.prototype.update = function() {
  Window_Selectable.prototype.update.call(this);
  if (!this.active || !this._actor) return;
  // 컨텍스트 메뉴가 열려있으면 그리드 입력 처리 건너뛰기
  if (EquipModal._contextMenu && EquipModal._contextMenu.isOpen()) return;

  var inv = this._actor.gridInventory();
  if (!inv) return;


  // Keyboard cursor movement — 멀티셀 아이템은 한 단위로 건너뛰기
  var moved = false;
  var _pid = inv._grid[this._cursorGy] && inv._grid[this._cursorGy][this._cursorGx] || 0;
  var _pl = _pid > 0 ? inv._placements[_pid] : null;
  if (Input.isRepeated('right')) {
    // 아이템 위에 있으면 아이템 오른쪽 끝 다음 칸으로, 아니면 +1
    var nx = _pl ? _pl.gx + _pl.w : this._cursorGx + 1;
    this._cursorGx = Math.min(nx, inv.cols() - 1);
    moved = true;
  }
  if (Input.isRepeated('left')) {
    var nx = _pl ? _pl.gx - 1 : this._cursorGx - 1;
    this._cursorGx = Math.max(nx, 0);
    moved = true;
  }
  if (Input.isRepeated('down')) {
    var ny = _pl ? _pl.gy + _pl.h : this._cursorGy + 1;
    this._cursorGy = Math.min(ny, inv.rows() - 1);
    moved = true;
  }
  if (Input.isRepeated('up')) {
    var ny = _pl ? _pl.gy - 1 : this._cursorGy - 1;
    this._cursorGy = Math.max(ny, 0);
    moved = true;
  }
  if (moved) {
    SoundManager.playCursor();
    this.refresh();
  }

  // Cancel: 모달 닫기 (processHandling 비활성화 → 직접 처리)
  if (Input.isTriggered('cancel')) {
    if (this.isHandled('cancel')) {
      SoundManager.playCancel();
      this.callHandler('cancel');
      return;
    }
  }

  // OK: show context menu for item under cursor
  if (Input.isTriggered('ok')) {
    var pid = inv._grid[this._cursorGy][this._cursorGx];
    if (pid > 0) {
      var pl = inv._placements[pid];
      if (pl) {
        var dataItem = this._getDataItem(pl.itemType, pl.itemId);
        if (dataItem && this._onItemContext) {
          var cs = this._cellSize;
          var sx = this.x + this.padding + this._gridOx + (pl.gx + pl.w) * cs;
          var sy = this.y + this.padding + this._gridOy + pl.gy * cs;
          this._onItemContext(dataItem, pid, sx, sy);
        }
      }
    }
  }

  // 마우스 움직임 감지 → 커서 위치를 마우스로 갱신
  if (TouchInput.x !== this._lastMouseX || TouchInput.y !== this._lastMouseY) {
    this._lastMouseX = TouchInput.x;
    this._lastMouseY = TouchInput.y;
    var tp2 = new Point(TouchInput.x, TouchInput.y);
    var loc2 = this.worldTransform.applyInverse(tp2);
    var mx2 = loc2.x - this.padding - this._gridOx;
    var my2 = loc2.y - this.padding - this._gridOy;
    var mgx = Math.floor(mx2 / this._cellSize);
    var mgy = Math.floor(my2 / this._cellSize);
    if (mgx >= 0 && mgx < inv.cols() && mgy >= 0 && mgy < inv.rows()) {
      if (mgx !== this._cursorGx || mgy !== this._cursorGy) {
        this._cursorGx = mgx;
        this._cursorGy = mgy;
        this.refresh();
      }
    }
  }
  // Mouse click/right-click
  this._updateMouseHover(inv);
};

Window_GridInvD2.prototype._updateMouseHover = function(inv) {
  var tp = new Point(TouchInput.x, TouchInput.y);
  var local = this.worldTransform.applyInverse(tp);
  var cx = local.x - this.padding - this._gridOx;
  var cy = local.y - this.padding - this._gridOy;
  var gx = Math.floor(cx / this._cellSize);
  var gy = Math.floor(cy / this._cellSize);


  if (gx >= 0 && gx < inv.cols() && gy >= 0 && gy < inv.rows()) {
    if (gx !== this._hoverGx || gy !== this._hoverGy) {
      this._hoverGx = gx;
      this._hoverGy = gy;
      var pid = inv._grid[gy][gx];
      if (pid > 0 && this._onItemHover) {
        var pl = inv._placements[pid];
        var dataItem = this._getDataItem(pl.itemType, pl.itemId);
        this._onItemHover(dataItem);
      } else if (this._onItemUnhover) {
        this._onItemUnhover();
      }
    }

    // 좌클릭 = 클릭앤드롭 (즉시 드래그)
    var _pdDragging = EquipModal._paperdoll && EquipModal._paperdoll._dragging;
    var _justDropped = EquipModal._dropFrame === Graphics.frameCount;
    if (!_pdDragging && !_justDropped && TouchInput.isTriggered()) {
      var pid = inv._grid[gy][gx];
      if (pid > 0) {
        var pl = inv._placements[pid];
        if (pl) {
          var dataItem = this._getDataItem(pl.itemType, pl.itemId);
          if (dataItem) {
            this._dragItem = dataItem;
            this._dragPid = pid;
            this._dragging = true;
            SoundManager.playOk();
            if (EquipModal._showDragSprite) EquipModal._showDragSprite(dataItem);
            this.refresh();
            return; // 드래그 시작 프레임에서 즉시 드롭 방지
          }
        }
      }
      this.refresh();
    }

  } else {
    if (this._hoverGx >= 0 || this._hoverGy >= 0) {
      this._hoverGx = -1;
      this._hoverGy = -1;
      if (this._onItemUnhover) this._onItemUnhover();
    }
  }

  // 클릭앤드롭: 드래그 중 재클릭 = 드롭
  if (this._dragItem && this._dragging && TouchInput.isTriggered()) {
    var dropOk2 = false;
    if (this._onDragDrop) {
      dropOk2 = this._onDragDrop(this._dragItem, this._dragPid, 'inventory');
    }
    // 드롭 성공 시에만 드래그 상태 해제
    if (dropOk2) {
      this._dragItem = null;
      this._dragPid = 0;
      this._dragging = false;
      EquipModal._dropFrame = Graphics.frameCount; // pd 이중 처리 방지
    }
  }
};




// ═══════════════════════════════════════════════════════════════════
//  4b. Window_ItemContextMenu — 아이템 인터랙션 팝업

// ═══════════════════════════════════════════════════════════════════
//  5b. Window_ItemTooltip — Diablo 2 style item info tooltip
// ═══════════════════════════════════════════════════════════════════

function Window_ItemTooltip() {
  this.initialize.apply(this, arguments);
}

Window_ItemTooltip.prototype = Object.create(Window_Base.prototype);
Window_ItemTooltip.prototype.constructor = Window_ItemTooltip;

Window_ItemTooltip.prototype.initialize = function() {
  Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, 240, 120));
  this._item = null;
  this._actor = null;
  this.openness = 0;
  this.z = 950;
  this.hide();
  this.deactivate();
  this.padding = 8;
  this._frameVisible = false;
  // Custom background
  this._bgSpriteCustom = null;
};

Window_ItemTooltip.prototype.showForItem = function(item, actor, x, y) {
  if (!item) { this.hideTooltip(); return; }
  if (this._item === item && this.visible) {
    // 같은 아이템이어도 위치 갱신 (커서 이동 대응)
    this._positionAt(x, y);
    return;
  }
  this._item = item;
  this._actor = actor || null;
  this._renderContent();
  this._positionAt(x, y);
  this.show();
  this.openness = 255;
};

Window_ItemTooltip.prototype.hideTooltip = function() {
  this._item = null;
  this.hide();
  this.openness = 0;
};

Window_ItemTooltip.prototype._renderContent = function() {
  var item = this._item;
  if (!item) return;

  // Gather lines to measure height
  var lines = [];
  var lineColors = [];
  var lineAligns = [];
  var lineSizes = [];
  var lineBolds = [];

  // ── Item name ──
  lines.push(item.name);
  lineColors.push(COL_TT_NAME);
  lineAligns.push('center');
  lineSizes.push(18);
  lineBolds.push(true);

  // ── Item type label ──
  var typeLabel = '';
  if (DataManager.isWeapon(item)) {
    var wtypes = $dataSystem.weaponTypes;
    typeLabel = wtypes[item.wtypeId] || '무기';
  } else if (DataManager.isArmor(item)) {
    var atypes = $dataSystem.armorTypes;
    typeLabel = atypes[item.atypeId] || '방어구';
    // Add equip type name
    var etypes = $dataSystem.equipTypes;
    if (etypes[item.etypeId]) typeLabel += ' (' + etypes[item.etypeId] + ')';
  } else {
    typeLabel = '아이템';
  }
  lines.push(typeLabel);
  lineColors.push(COL_TT_TYPE);
  lineAligns.push('center');
  lineSizes.push(13);
  lineBolds.push(false);

  // ── Separator ──
  lines.push('---');
  lineColors.push(COL_TT_BD);
  lineAligns.push('center');
  lineSizes.push(4);
  lineBolds.push(false);

  // ── Stats (params) ──
  if (DataManager.isWeapon(item) || DataManager.isArmor(item)) {
    var paramNames = ['최대 HP', '최대 MP', '공격력', '방어력', '마공력', '마방력', '민첩성', '운'];
    for (var p = 0; p < 8; p++) {
      var val = item.params[p];
      if (val !== 0) {
        var sign = val > 0 ? '+' : '';
        var color = val > 0 ? COL_TT_STAT : COL_TT_NEGATIVE;
        lines.push(paramNames[p] + ' ' + sign + val);
        lineColors.push(color);
        lineAligns.push('left');
        lineSizes.push(14);
        lineBolds.push(false);
      }
    }
  }

  // ── Price ──
  if (item.price > 0) {
    lines.push('가격: ' + item.price + 'G');
    lineColors.push('#aaaaaa');
    lineAligns.push('left');
    lineSizes.push(12);
    lineBolds.push(false);
  }

  // ── Description ──
  if (item.description && item.description.trim()) {
    // Separator before desc
    lines.push('---');
    lineColors.push(COL_TT_BD);
    lineAligns.push('center');
    lineSizes.push(4);
    lineBolds.push(false);

    // Word-wrap description
    var descLines = this._wrapText(item.description.trim(), 200, 13);
    for (var d = 0; d < descLines.length; d++) {
      lines.push(descLines[d]);
      lineColors.push(COL_TT_DESC);
      lineAligns.push('left');
      lineSizes.push(13);
      lineBolds.push(false);
    }
  }

  // ── Calculate dimensions ──
  var padX = 12;
  var padY = 10;
  var lineH = 0;
  var maxW = 0;
  var totalH = padY;

  // Measure each line
  var lineYs = [];
  for (var i = 0; i < lines.length; i++) {
    lineYs.push(totalH);
    if (lines[i] === '---') {
      totalH += 8;
    } else {
      var h = lineSizes[i] + 6;
      totalH += h;
      // Measure text width
      this.contents.fontSize = lineSizes[i];
      var tw = this.contents.measureTextWidth(lines[i]);
      if (tw + padX * 2 > maxW) maxW = tw + padX * 2;
    }
  }
  totalH += padY;

  var winW = Math.max(160, Math.min(280, maxW + 24));
  var winH = totalH + this.padding * 2;

  // Resize window
  this.move(this.x, this.y, winW, winH);
  this.createContents();

  // ── Draw custom background ──
  var ctx = this.contents.context;
  ctx.fillStyle = COL_TT_BG;
  ctx.fillRect(0, 0, this.innerWidth, this.innerHeight);
  ctx.strokeStyle = COL_TT_BD;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, 0.5, this.innerWidth - 1, this.innerHeight - 1);

  // ── Draw lines ──
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] === '---') {
      // Draw separator line
      var sepY = lineYs[i] + 4;
      ctx.strokeStyle = COL_TT_BD;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padX, sepY);
      ctx.lineTo(this.innerWidth - padX, sepY);
      ctx.stroke();
      continue;
    }

    this.contents.fontSize = lineSizes[i];
    this.contents.fontBold = lineBolds[i];
    this.contents.textColor = lineColors[i];

    var tx = padX;
    var tw2 = this.innerWidth - padX * 2;
    var align = lineAligns[i];

    this.contents.drawText(lines[i], tx, lineYs[i], tw2, lineSizes[i] + 6, align);
  }

  // Reset
  this.contents.fontBold = false;
  this.resetFontSettings();
};

Window_ItemTooltip.prototype._wrapText = function(text, maxWidth, fontSize) {
  var result = [];
  this.contents.fontSize = fontSize;
  var words = text.split('');
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var ch = words[i];
    if (ch === '\n') {
      result.push(line);
      line = '';
      continue;
    }
    var test = line + ch;
    var w = this.contents.measureTextWidth(test);
    if (w > maxWidth && line.length > 0) {
      result.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) result.push(line);
  return result;
};

Window_ItemTooltip.prototype._positionAt = function(x, y) {
  var w = this.width;
  var h = this.height;
  // 아이템 우상단 기준: 우측에 약간 간격, 상단 정렬
  var px = x + 8;
  var py = y;
  // 화면 밖이면 좌측으로 플립
  if (px + w > Graphics.width) px = x - w - 8;
  // 하단 넘침 보정
  if (py + h > Graphics.height - 4) py = Graphics.height - h - 4;
  if (py < 4) py = 4;
  if (px < 4) px = 4;
  this.x = px;
  this.y = py;
};

Window_ItemTooltip.prototype._refreshFrame = function() {
  // Override to prevent default window frame
};

Window_ItemTooltip.prototype.loadWindowskin = function() {
  this.windowskin = ImageManager.loadSystem('Window');
};

Window_ItemTooltip.prototype._updateBackOpacity = function() {
  this.backOpacity = 0;
};

Window_ItemTooltip.prototype.updateBackOpacity = function() {
  this.backOpacity = 0;
};


// ═══════════════════════════════════════════════════════════════════

function Window_ItemContextMenu() {
  this.initialize.apply(this, arguments);
}

Window_ItemContextMenu.prototype = Object.create(Window_Command.prototype);
Window_ItemContextMenu.prototype.constructor = Window_ItemContextMenu;

Window_ItemContextMenu.prototype.initialize = function(x, y) {
  this._commands = [];
  this._contextItem = null;
  this._contextSource = null; // 'equip' or 'inventory'
  this._contextPid = 0;
  this._contextSlotIdx = -1;
  Window_Command.prototype.initialize.call(this, new Rectangle(x, y, 160, 120));
  this.openness = 0;
  this.deactivate();
};

Window_ItemContextMenu.prototype.makeCommandList = function() {
  for (var i = 0; i < this._commands.length; i++) {
    this.addCommand(this._commands[i].name, this._commands[i].symbol, true);
  }
};

Window_ItemContextMenu.prototype.showForEquipSlot = function(item, slotIdx, x, y) {
  if (EquipModal._tooltip) EquipModal._tooltip.hideTooltip();
  this._contextItem = item;
  this._contextSource = 'equip';
  this._contextSlotIdx = slotIdx;
  this._contextPid = 0;
  this._commands = [
    { name: '인벤토리로', symbol: 'unequip' },
    { name: '취소', symbol: 'cancel' }
  ];
  this._repositionAndOpen(x, y);
};

Window_ItemContextMenu.prototype.showForInventoryItem = function(item, pid, x, y) {
  if (EquipModal._tooltip) EquipModal._tooltip.hideTooltip();
  this._contextItem = item;
  this._contextSource = 'inventory';
  this._contextPid = pid;
  this._contextSlotIdx = -1;
  var cmds = [];
  if (DataManager.isWeapon(item) || DataManager.isArmor(item)) {
    cmds.push({ name: '장착', symbol: 'equip' });
  }
  cmds.push({ name: '취소', symbol: 'cancel' });
  this._commands = cmds;
  this._repositionAndOpen(x, y);
};

Window_ItemContextMenu.prototype._repositionAndOpen = function(x, y) {
  var lineH = this.lineHeight() + 8;
  var h = lineH * this._commands.length + this.padding * 2;
  this.move(x, y, 160, h);
  // Clamp to screen
  if (this.x + this.width > Graphics.width) this.x = Graphics.width - this.width;
  if (this.y + this.height > Graphics.height) this.y = Graphics.height - this.height;
  this.refresh();
  this.select(0);
  this.open();
  this.activate();
};

Window_ItemContextMenu.prototype.closeMenu = function() {
  this.close();
  this.deactivate();
  this._contextItem = null;
};

// ═══════════════════════════════════════════════════════════════════
//  5. EquipModal — 현재 씬 위에 뜨는 모달 오버레이
// ═══════════════════════════════════════════════════════════════════

var EquipModal = {
    _windows: [],
    _active: false,
    _actorId: 1,
    _inventoryOnly: false,
    _actor: null,
    _parentScene: null,
    _dimSprite: null,
    _contextMenu: null,
    _tooltip: null,
    _dragSprite: null,

    // ── 모달 열기 ──
    open: function(actorId, inventoryOnly) {
        if (this._active) return;
        this._actorId = actorId || 1;
        this._inventoryOnly = inventoryOnly || false;
        this._actor = $gameActors.actor(this._actorId);
        if (!this._actor) {
            this._actor = $gameActors.actor($gameParty.leader().actorId());
            this._actorId = this._actor.actorId();
        }
        this._parentScene = SceneManager._scene;
        this._active = true;
        this._createOverlay();
        this._createWindows();
        this._refreshAll();
        SoundManager.playOk();

        // ── DOM 우클릭 리스너 (TouchInput.isCancelled 바이패스) ──
        var self = this;
        this._rightClickHandler = function(e) {
            if (e.button !== 2) return;
            if (!self._active) return;
            e.preventDefault();
            e.stopPropagation();
            var cx = Graphics.pageToCanvasX(e.pageX);
            var cy = Graphics.pageToCanvasY(e.pageY);
            self._handleRightClick(cx, cy);
        };
        document.addEventListener('mousedown', this._rightClickHandler, true);
    },

    // ── 모달 닫기 ──
    close: function() {
        if (!this._active) return;
        this._active = false;
        // DOM 우클릭 리스너 제거
        if (this._rightClickHandler) {
            document.removeEventListener('mousedown', this._rightClickHandler, true);
            this._rightClickHandler = null;
        }
        this._cancelDrag();
        if (this._tooltip) this._tooltip.hideTooltip();
        // 윈도우 제거
        var scene = this._parentScene;
        if (scene) {
            for (var i = 0; i < this._windows.length; i++) {
                scene.removeChild(this._windows[i]);
            }
            if (this._dimSprite) {
                scene.removeChild(this._dimSprite);
                this._dimSprite = null;
            }
            if (this._dragSprite) {
                scene.removeChild(this._dragSprite);
                this._dragSprite = null;
            }
        }
        this._windows = [];
        this._contextMenu = null;
        this._parentScene = null;
        SoundManager.playCancel();
    },

    isActive: function() { return this._active; },

    // ── 반투명 배경 ──
    _createOverlay: function() {
        var scene = this._parentScene;
        this._dimSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
        this._dimSprite.bitmap.fillRect(0, 0, Graphics.width, Graphics.height, 'rgba(0,0,0,0.55)');
        this._dimSprite.z = 900;
        scene.addChild(this._dimSprite);
    },

    // ── 윈도우 생성 ──
    _createWindows: function() {
        var scene = this._parentScene;
        var totalW = 560;
        var standW = 240;
        var startX = Math.floor((Graphics.width - totalW) / 2);
        var startY = 10;
        var btnH = 72;
        var availH = Graphics.height - startY - btnH - 10;
        var topH = Math.floor(availH / 2);

        // ── 상단 좌측: 스탠딩(플레이스홀더) ──
        var sp = new Window_StandingPanel(
            new Rectangle(startX, startY, standW, topH)
        );
        sp.z = 910;
        scene.addChild(sp);
        this._windows.push(sp);
        this._standingPanel = sp;

        // ── 상단 우측: 파퍼돌 ──
        var pd = new Window_EquipPaperdoll(
            new Rectangle(startX + standW, startY, totalW - standW, topH)
        );
        pd.z = 910;
        scene.addChild(pd);
        this._windows.push(pd);
        this._paperdoll = pd;

        // ── 버튼 바 ──
        var bt = new Window_EquipButtons(
            new Rectangle(startX, startY + topH, totalW, btnH)
        );
        bt.z = 910;
        var self = this;
        bt.setHandler("prevActor",    function() { self._prevActor(); });
        bt.setHandler("toggleStats",  function() { self._toggleStats(); });
        bt.setHandler("sort",         function() { self._sortInventory(); });
        bt.setHandler("discard",      function() { SoundManager.playBuzzer(); bt.deactivate(); bt.deselect(); });
        bt.setHandler("nextActor",    function() { self._nextActor(); });
        bt.setHandler("cancel",  function() { self.close(); });
        scene.addChild(bt);
        this._windows.push(bt);
        this._buttons = bt;

        // ── 하단: 그리드 인벤토리 ──
        var invY = startY + topH + btnH;
        var invH = topH;
        var gi = new Window_GridInvD2(
            new Rectangle(startX, invY, totalW, invH)
        );
        gi.z = 910;
        gi.setHandler("cancel", function() { self.close(); });
        scene.addChild(gi);
        this._windows.push(gi);
        this._gridInv = gi;

        // ── 파퍼돌 호버 → 스탠딩 패널 델타 ──
        pd._onSlotHover = function(slotDef, equipItem) {
            if (!slotDef) { sp.clearPreview(); return; }
            if (!sp._showRadar) return;
            var delta = self._calcEquipDelta(slotDef, null);
            sp.setPreviewStats(delta);
        };
        pd._onSlotUnhover = function() {
            sp.clearPreview();
        };

        // ── 그리드 호버 → 스탠딩 패널 델타 ──
        gi._onItemHover = function(item) {
            if (!item || !sp._showRadar) { sp.clearPreview(); return; }
            if (DataManager.isWeapon(item) || DataManager.isArmor(item)) {
                var matchSlot = null;
                for (var s = 0; s < EQUIP_SLOTS.length; s++) {
                    if (item.etypeId === EQUIP_SLOTS[s].etypeId) {
                        matchSlot = EQUIP_SLOTS[s]; break;
                    }
                }
                // ── grip: 무기인데 매칭 슬롯 없으면 오프핸드 시도 ──
                if (!matchSlot && DataManager.isWeapon(item)) {
                    var GI = window.GridInventory;
                    var actor = self._actor;
                    if (GI && GI.canEquipWeaponInOffhand && actor) {
                        if (GI.canEquipWeaponInOffhand(item, actor) && (!actor.isOffhandLocked || !actor.isOffhandLocked())) {
                            for (var sh = 0; sh < EQUIP_SLOTS.length; sh++) {
                                if (EQUIP_SLOTS[sh].id === 'shield') { matchSlot = EQUIP_SLOTS[sh]; break; }
                            }
                        }
                    }
                }
                if (matchSlot) {
                    sp.setPreviewStats(self._calcEquipDelta(matchSlot, item));
                } else { sp.clearPreview(); }
            } else { sp.clearPreview(); }
        };
        gi._onItemUnhover = function() {
            sp.clearPreview();
        };

        // ── 컨텍스트 메뉴 윈도우 ──
        var cm = new Window_ItemContextMenu(0, 0);
        cm.z = 920;
        cm.setHandler('unequip', function() {
            var item = cm._contextItem;
            var slotIdx = cm._contextSlotIdx;
            if (item && slotIdx >= 0) {
                var sd = pd._slotRects[slotIdx].slotDef;
                var inv2 = self._actor.gridInventory();
                if (inv2) {
                    // 배치 가능 여부를 먼저 확인 (장비 해제 전)
                    var _gs = window.GridInventory && window.GridInventory.getGridSize ? window.GridInventory.getGridSize(item) : {w:1,h:1};
                    var size = {w:_gs.w, h:_gs.h};
                    if (!inv2.findFreeSlot(size.w, size.h)) {
                        // 인벤토리 꽉 참 → 장비 유지, buzzer
                        SoundManager.playBuzzer();
                        cm.closeMenu();
                        return;
                    }
                    self._actor.forceChangeEquip(sd.equipIdx, null);
                    var apResult = inv2.autoPlace(item);
                } else {
                    self._actor.forceChangeEquip(sd.equipIdx, null);
                }
                SoundManager.playEquip();
                self._refreshAll();
            }
            cm.closeMenu();
        });
        cm.setHandler('equip', function() {
            var item = cm._contextItem;
            var pid2 = cm._contextPid;
            if (item && pid2 > 0) {
                self._tryEquipFromInventory(item, pid2);
            }
            cm.closeMenu();
        });
        cm.setHandler('cancel', function() {
            cm.closeMenu();
            gi.activate();
        });
        scene.addChild(cm);
        this._windows.push(cm);
        this._contextMenu = cm;

        // ── 아이템 툴팁 ──
        var tt = new Window_ItemTooltip();
        tt.z = 950;
        scene.addChild(tt);
        this._windows.push(tt);
        this._tooltip = tt;

        // ── 파퍼돌 호버 → 툴팁 ──
        var oldPdUpdate = pd.update;
        pd.update = function() {
            oldPdUpdate.call(this);
            if (!self._active) return;
            if (self._contextMenu && self._contextMenu.isOpen && self._contextMenu.isOpen()) { tt.hideTooltip(); return; }
            if (this._dragging) { tt.hideTooltip(); return; }
            var hIdx = this._hoveredSlot;
            if (hIdx < 0 && this.active) hIdx = this.index();
            if (hIdx >= 0 && hIdx < this._slotRects.length) {
                var equips = self._actor ? self._actor.equips() : [];
                var sdef = this._slotRects[hIdx].slotDef;
                var eItem = equips[sdef.equipIdx];
                if (eItem) {
                    var sr = this._slotRects[hIdx];
                    var sx = this.x + this.padding + sr.x + sr.w;
                    var sy = this.y + this.padding + sr.y;
                    tt.showForItem(eItem, self._actor, sx, sy);
                } else {
                    tt.hideTooltip();
                }
            } else {
                tt.hideTooltip();
            }
        };

        // ── 그리드 인벤토리 커서 → 툴팁 (아이템 우상단 기준) ──
        var oldGiUpdate = gi.update;
        gi.update = function() {
            oldGiUpdate.call(this);
            if (!self._active) return;
            if (self._contextMenu && self._contextMenu.isOpen && self._contextMenu.isOpen()) { tt.hideTooltip(); return; }
            if (this._dragging) { tt.hideTooltip(); return; }
            var inv = self._actor ? self._actor.gridInventory() : null;
            if (!inv) { tt.hideTooltip(); return; }
            // 커서 위치의 아이템 확인 (마우스/키보드 통합 커서)
            var cgx = this._cursorGx;
            var cgy = this._cursorGy;
            var foundItem = null;
            var foundPl = null;
            if (cgx >= 0 && cgx < inv.cols() && cgy >= 0 && cgy < inv.rows()) {
                var pid3 = inv._grid[cgy][cgx];
                if (pid3 > 0) {
                    foundPl = inv._placements[pid3];
                    if (foundPl) foundItem = this._getDataItem(foundPl.itemType, foundPl.itemId);
                }
            }
            if (foundItem && foundPl) {
                // 아이템 우상단 기준 툴팁 위치
                var cs = this._cellSize;
                var ttx = this.x + this.padding + this._gridOx + (foundPl.gx + foundPl.w) * cs;
                var tty = this.y + this.padding + this._gridOy + foundPl.gy * cs;
                tt.showForItem(foundItem, self._actor, ttx, tty);
            } else {
                tt.hideTooltip();
            }
        };

        // ── 파퍼돌 컨텍스트 콜백 (클릭 시) ──
        pd._onSlotContext = function(item, slotIdx, sx, sy) {
            cm.showForEquipSlot(item, slotIdx, sx, sy);
        };

        // ── 그리드 컨텍스트 콜백 (클릭 시) ──
        gi._onItemContext = function(item, pid2, sx, sy) {
            cm.showForInventoryItem(item, pid2, sx, sy);
        };

        // ── 드래그 앤 드롭: 장비칸 → 인벤토리 ──
        pd._onDragDrop = function(item, slotIdx, source) {
            var tx = TouchInput.x, ty = TouchInput.y;
            // 인벤토리 영역 밖 클릭 → 드롭 실패 (드래그 유지)
            if (!(tx >= gi.x && tx < gi.x + gi.width && ty >= gi.y && ty < gi.y + gi.height)) {
                SoundManager.playBuzzer();
                return false;
            }
            var inv2 = self._actor.gridInventory();
            if (!inv2) return false;
            // 마우스 위치 → 그리드 좌표 계산
            var tp = new Point(tx, ty);
            var loc = gi.worldTransform.applyInverse(tp);
            var mx = loc.x - gi.padding - gi._gridOx;
            var my = loc.y - gi.padding - gi._gridOy;
            var _gs2 = window.GridInventory && window.GridInventory.getGridSize ? window.GridInventory.getGridSize(item) : {w:1,h:1};
            var size = {w:_gs2.w, h:_gs2.h};
            var dropGx = Math.floor(mx / gi._cellSize) - Math.floor(size.w / 2);
            var dropGy = Math.floor(my / gi._cellSize) - Math.floor(size.h / 2);
            dropGx = Math.max(0, Math.min(dropGx, inv2.cols() - size.w));
            dropGy = Math.max(0, Math.min(dropGy, inv2.rows() - size.h));
            // 겹치면 배치 불가 → 드래그 유지
            if (!inv2.canPlace(dropGx, dropGy, size.w, size.h)) {
                SoundManager.playBuzzer();
                return false;
            }
            // 배치 성공 → 장비 해제, 배치, 드래그 종료
            // 안전장치: canPlace 재확인 (이중 체크)
            if (!inv2.canPlace(dropGx, dropGy, size.w, size.h)) {
                SoundManager.playBuzzer();
                return false;
            }
            self._hideDragSprite();
            // CRITICAL: place를 먼저 하고, 성공 시에만 장비 해제
            var placeOk = inv2.place(item, dropGx, dropGy);
            if (!placeOk && placeOk !== undefined) {
                // place 실패 — 아이템 보존
                SoundManager.playBuzzer();
                return false;
            }
            var sd = pd._slotRects[slotIdx].slotDef;
            self._actor.forceChangeEquip(sd.equipIdx, null);
            SoundManager.playEquip();
            self._refreshAll();
            return true;
        };

        // ── 드래그 앤 드롭: 인벤토리 → 장비칸 ──
        gi._onEmptyRightClick = function() {
            self._cancelDrag();
            self.close();
        };
        gi._onDragDrop = function(item, pid2, source) {
            var tx = TouchInput.x, ty = TouchInput.y;

            // ── 파퍼돌 위에 드롭 → 장비 장착 ──
            if (tx >= pd.x && tx < pd.x + pd.width && ty >= pd.y && ty < pd.y + pd.height) {
                if (DataManager.isWeapon(item) || DataManager.isArmor(item)) {
                    self._hideDragSprite();
                    self._tryEquipFromInventory(item, pid2);
                    return true;
                } else {
                    SoundManager.playBuzzer();
                    return false;
                }
            }

            // ── 그리드 위에 드롭 → 자유 배치 (아이템 이동) ──
            if (tx >= gi.x && tx < gi.x + gi.width && ty >= gi.y && ty < gi.y + gi.height) {
                var inv = self._actor.gridInventory();
                if (inv && pid2 > 0) {
                    var tp = new Point(tx, ty);
                    var loc = gi.worldTransform.applyInverse(tp);
                    var mx = loc.x - gi.padding - gi._gridOx;
                    var my = loc.y - gi.padding - gi._gridOy;
                    var dropGx = Math.floor(mx / gi._cellSize);
                    var dropGy = Math.floor(my / gi._cellSize);
                    // 아이템 좌상단 기준으로 배치 (커서가 아이템 중앙에 오도록 오프셋)
                    var pl = inv._placements[pid2];
                    if (pl) {
                        var ox = Math.floor(pl.w / 2);
                        var oy = Math.floor(pl.h / 2);
                        var targetGx = Math.max(0, Math.min(dropGx - ox, inv.cols() - pl.w));
                        var targetGy = Math.max(0, Math.min(dropGy - oy, inv.rows() - pl.h));
                        if (inv.movePlacement(pid2, targetGx, targetGy)) {
                            self._hideDragSprite();
                            SoundManager.playOk();
                            gi.refresh();
                            return true;
                        } else {
                            SoundManager.playBuzzer();
                            return false;
                        }
                    }
                }
                gi.refresh();
                return false;
            }

            // ── 그 외 영역: 아무것도 하지 않음 (드래그 유지) ──
            SoundManager.playBuzzer();
            return false;
        };

        // ── 그리드 장비 장착 콜백 (하위호환) ──
        gi._onEquipItem = function(dataItem, pid2) {
            self._tryEquipFromInventory(dataItem, pid2);
        };
    },

    // ── 전체 새로고침 ──
    _refreshAll: function() {
        var actor = this._actor;
        this._standingPanel.setActor(actor);
        this._standingPanel.refresh();
        this._paperdoll.setActor(actor);
        this._paperdoll.refresh();
        this._gridInv.setActor(actor);
        this._gridInv.refresh();
        this._gridInv.activate();
        this._buttons.deactivate();
        this._buttons.deselect();
    },

    // ── 액터 전환 ──
    _prevActor: function() {
        var members = $gameParty.members();
        var idx = members.indexOf(this._actor);
        idx = (idx - 1 + members.length) % members.length;
        this._actor = members[idx];
        this._actorId = this._actor.actorId();
        this._refreshAll();
    },

    _nextActor: function() {
        var members = $gameParty.members();
        var idx = members.indexOf(this._actor);
        idx = (idx + 1) % members.length;
        this._actor = members[idx];
        this._actorId = this._actor.actorId();
        this._refreshAll();
    },

    // ── 스탯/레이더 토글 ──
    _toggleStats: function() {
        this._standingPanel.toggleRadar();
        this._buttons.deactivate();
        this._buttons.deselect();
    },

    // ── 인벤토리 정렬 ──
    _sortInventory: function() {
        var inv = this._actor._gridInventory;
        if (inv && inv.autoSort) {
            inv.autoSort();
            this._gridInv.refresh();
        }
        this._buttons.deactivate();
        this._buttons.deselect();
    },

    // ── 장비 교체 델타 계산 ──
    _calcEquipDelta: function(slotDef, newItem) {
        var actor = this._actor;
        var current = actor.equips()[slotDef.equipIdx];
        // Return delta keyed by paramId (0=mhp,1=mmp,2=atk,3=def,4=mat,5=mdf,6=agi,7=luk)
        var delta = {};
        for (var p = 0; p < 8; p++) {
            var curVal = current ? current.params[p] : 0;
            var newVal = newItem  ? newItem.params[p]  : 0;
            var d = newVal - curVal;
            if (d !== 0) delta[p] = d;
        }
        return delta;
    },

    // ── 드래그 스프라이트 관리 ──
    _showDragSprite: function(dataItem) {
        var scene = this._parentScene;
        if (!scene) return;

        // 기존 드래그 스프라이트 완전 제거
        if (this._dragSprite) {
            scene.removeChild(this._dragSprite);
            if (this._dragSprite.destroy) this._dragSprite.destroy();
            this._dragSprite = null;
        }
        // _dragGridGfx도 정리
        if (this._dragGridGfx) {
            this._dragGridGfx = null;
        }

        // 아이템 그리드 크기 — GridInventory.getGridSize() 사용 (노트태그 + 기본값 통합)
        var _gSize = (window.GridInventory && window.GridInventory.getGridSize)
            ? window.GridInventory.getGridSize(dataItem) : {w:1, h:1};
        var gw = _gSize.w || 1;
        var gh = _gSize.h || 1;
        var gi = this._gridInv;
        var cellSize = (gi && gi._cellSize) ? gi._cellSize : 64;
        var totalW = gw * cellSize;
        var totalH = gh * cellSize;

        // ── 원본 패턴: 아이템 이미지를 직접 bitmap으로 (이건 작동 확인됨) ──
        var spr = new Sprite();
        spr.anchor.x = 0.5;
        spr.anchor.y = 0.5;
        var invBmp = loadInvImage(dataItem, null);
        if (invBmp && invBmp.isReady()) {
            spr.bitmap = invBmp;
        } else {
            var iconBmp = new Bitmap(48, 48);
            var iconIdx = dataItem.iconIndex || 0;
            var iconSet = ImageManager.loadSystem('IconSet');
            if (iconSet && iconSet.isReady()) {
                var isx = (iconIdx % 16) * 32;
                var isy = Math.floor(iconIdx / 16) * 32;
                iconBmp.blt(iconSet, isx, isy, 32, 32, 8, 8, 32, 32);
            }
            spr.bitmap = iconBmp;
            if (invBmp) {
                var self2 = this;
                invBmp.addLoadListener(function() {
                    if (self2._dragSprite && self2._dragSprite.visible) {
                        self2._showDragSprite(dataItem);
                    }
                });
            }
        }
        // 아이템 이미지 크기를 그리드 크기에 맞게 축소
        if (spr.bitmap && spr.bitmap.width > 0 && spr.bitmap.height > 0) {
            var imgW = spr.bitmap.width;
            var imgH = spr.bitmap.height;
            var sc = Math.min(totalW / imgW, totalH / imgH) * 0.9;
            spr.scale.x = sc;
            spr.scale.y = sc;
        }

        // ── 그리드 오버레이: PIXI.Graphics를 자식으로 추가 (이미지 위에 렌더링) ──
        var gfx = new PIXI.Graphics();
        // anchor 0.5 기준이므로 좌표는 중심 기준
        var hx = totalW / 2;
        var hy = totalH / 2;
        // 스케일 역보정 (부모 스프라이트에 scale이 적용되므로)
        var invSc = (spr.scale.x > 0) ? (1 / spr.scale.x) : 1;
        var gfxHx = hx * invSc;
        var gfxHy = hy * invSc;
        var gfxCellW = cellSize * invSc;
        var gfxCellH = cellSize * invSc;
        var gfxTotalW = totalW * invSc;
        var gfxTotalH = totalH * invSc;

        // 반투명 배경
        gfx.beginFill(0x2858B4, 0.35);
        gfx.drawRect(-gfxHx, -gfxHy, gfxTotalW, gfxTotalH);
        gfx.endFill();

        // 셀 경계선 (흰색 2px)
        gfx.lineStyle(2 * invSc, 0xFFFFFF, 0.8);
        for (var cx = 0; cx <= gw; cx++) {
            var lx = -gfxHx + cx * gfxCellW;
            gfx.moveTo(lx, -gfxHy);
            gfx.lineTo(lx, gfxHy);
        }
        for (var cy = 0; cy <= gh; cy++) {
            var ly = -gfxHy + cy * gfxCellH;
            gfx.moveTo(-gfxHx, ly);
            gfx.lineTo(gfxHx, ly);
        }

        // 외곽 테두리 (흰색 3px)
        gfx.lineStyle(3 * invSc, 0xFFFFFF, 1.0);
        gfx.drawRect(-gfxHx, -gfxHy, gfxTotalW, gfxTotalH);

        spr.addChild(gfx);
        this._dragGridGfx = gfx;

        spr.opacity = 200;
        spr.x = TouchInput.x;
        spr.y = TouchInput.y;
        spr.visible = true;

        this._dragSprite = spr;
        this._dragSpriteHalfW = Math.floor(totalW / 2);
        this._dragSpriteHalfH = Math.floor(totalH / 2);
        scene.addChild(spr);
    },

    _hideDragSprite: function() {
        if (this._dragSprite) {
            this._dragSprite.visible = false;
            if (this._parentScene) this._parentScene.removeChild(this._dragSprite);
            if (this._dragSprite.destroy) this._dragSprite.destroy();
            this._dragSprite = null;
        }
        this._dropFrame = Graphics.frameCount; // 드롭 프레임 기록
    },

    _cancelDrag: function() {
        var wasDragging = false;
        if (this._paperdoll && this._paperdoll._dragging) wasDragging = true;
        if (this._gridInv && this._gridInv._dragging) wasDragging = true;
        this._hideDragSprite();
        this._dropFrame = Graphics.frameCount; // 취소 직후 재클릭 방지
        if (this._paperdoll) {
            this._paperdoll._dragItem = null;
            this._paperdoll._dragSlotIdx = -1;
            this._paperdoll._dragging = false;
        }
        if (this._gridInv) {
            this._gridInv._dragItem = null;
            this._gridInv._dragPid = 0;
            this._gridInv._dragging = false;
        }
        // 드래그 취소 시 장비/인벤토리 시각 복원
        if (wasDragging) this._refreshAll();
    },

    // ── 인벤토리에서 장비 장착 시도 ──
    _tryEquipFromInventory: function(dataItem, pid) {
        if (!dataItem) return;
        var actor = this._actor;
        var targetSlot = null;
        for (var s = 0; s < EQUIP_SLOTS.length; s++) {
            if (dataItem.etypeId === EQUIP_SLOTS[s].etypeId) {
                targetSlot = EQUIP_SLOTS[s]; break;
            }
        }
        // ── grip 시스템: 무기(etypeId 1)를 방패 슬롯(etypeId 2)에 장착 허용 ──
        if (!targetSlot && DataManager.isWeapon(dataItem)) {
            var GI = window.GridInventory;
            if (GI && GI.canEquipWeaponInOffhand && GI.canEquipWeaponInOffhand(dataItem, actor)) {
                // 메인핸드가 양손 차지가 아닐 때만
                if (!actor.isOffhandLocked || !actor.isOffhandLocked()) {
                    for (var s2 = 0; s2 < EQUIP_SLOTS.length; s2++) {
                        if (EQUIP_SLOTS[s2].id === 'shield') {
                            targetSlot = EQUIP_SLOTS[s2]; break;
                        }
                    }
                }
            }
        }
        // ── grip: 무기 etypeId 매칭 시, 메인핸드에 이미 무기 → 오프핸드 시도 ──
        if (targetSlot && DataManager.isWeapon(dataItem) && targetSlot.id === 'weapon') {
            var currentMain = actor.equips()[0];
            if (currentMain && DataManager.isWeapon(currentMain)) {
                var GI2 = window.GridInventory;
                if (GI2 && GI2.canEquipWeaponInOffhand && GI2.canEquipWeaponInOffhand(dataItem, actor)) {
                    if (!actor.isOffhandLocked || !actor.isOffhandLocked()) {
                        // 메인핸드 차있고 이도류 가능 → 오프핸드로 리다이렉트
                        for (var s3 = 0; s3 < EQUIP_SLOTS.length; s3++) {
                            if (EQUIP_SLOTS[s3].id === 'shield') {
                                targetSlot = EQUIP_SLOTS[s3]; break;
                            }
                        }
                    }
                }
            }
        }
        if (!targetSlot) { SoundManager.playBuzzer(); return; }
        var inv = actor._gridInventory;
        if (!inv) { SoundManager.playBuzzer(); return; }
        var currentEquip = actor.equips()[targetSlot.equipIdx];
        inv.removePlacement(pid);
        if (currentEquip) {
            var placed = inv.autoPlace(currentEquip);
            if (!placed) {
                inv.autoPlace(dataItem);
                SoundManager.playBuzzer();
                this._gridInv.refresh();
                return;
            }
        }
        actor.forceChangeEquip(targetSlot.equipIdx, dataItem);
        SoundManager.playEquip();
        this._refreshAll();
    },

    // ── DOM 우클릭 핸들러 ──
    _handleRightClick: function(cx, cy) {
        if (!this._active) return;
        // 드래그 중 우클릭 → 드래그 취소 (아이템 원위치)
        var pd = this._paperdoll;
        var gi = this._gridInv;
        if ((pd && pd._dragging) || (gi && gi._dragging)) {
            this._cancelDrag();
            this._refreshAll();
            return;
        }
        // 컨텍스트 메뉴가 열려있으면 닫기
        if (this._contextMenu && this._contextMenu.isOpen()) {
            this._contextMenu.close();
            return;
        }
        // 그리드 인벤토리 위 우클릭 체크
        var gi = this._gridInv;
        if (gi && cx >= gi.x && cx < gi.x + gi.width && cy >= gi.y && cy < gi.y + gi.height) {
            var tp = new Point(cx, cy);
            var loc = gi.worldTransform.applyInverse(tp);
            var mx = loc.x - gi.padding - gi._gridOx;
            var my = loc.y - gi.padding - gi._gridOy;
            var gx = Math.floor(mx / gi._cellSize);
            var gy = Math.floor(my / gi._cellSize);
            var inv = this._actor.gridInventory();
            if (inv && gx >= 0 && gx < inv.cols() && gy >= 0 && gy < inv.rows()) {
                var rcPid = inv._grid[gy][gx];
                if (rcPid > 0 && gi._onItemContext) {
                    var rcPl = inv._placements[rcPid];
                    if (rcPl) {
                        var rcItem = gi._getDataItem(rcPl.itemType, rcPl.itemId);
                        if (rcItem) gi._onItemContext(rcItem, rcPid, cx, cy);
                    }
                    return;
                }
            }
        }
        // 파퍼돌 위 우클릭 체크
        var pd = this._paperdoll;
        if (pd && cx >= pd.x && cx < pd.x + pd.width && cy >= pd.y && cy < pd.y + pd.height) {
            var tp2 = new Point(cx, cy);
            var loc2 = pd.worldTransform.applyInverse(tp2);
            var hitIdx = -1;
            for (var s = 0; s < pd._slotRects.length; s++) {
                var sr = pd._slotRects[s];
                if (loc2.x >= pd.padding + sr.x && loc2.x < pd.padding + sr.x + sr.w &&
                    loc2.y >= pd.padding + sr.y && loc2.y < pd.padding + sr.y + sr.h) {
                    hitIdx = s; break;
                }
            }
            if (hitIdx >= 0 && pd._onSlotContext) {
                var sd = pd._slotRects[hitIdx].slotDef;
                var eqItem = this._actor.equips()[sd.equipIdx];
                if (eqItem) {
                    pd._onSlotContext(eqItem, hitIdx, cx, cy);
                }
                return;
            }
        }
        // 딤 영역(어떤 윈도우에도 속하지 않음) 우클릭 = 모달 닫기
        var inWin = false;
        for (var j = 0; j < this._windows.length; j++) {
            var wj = this._windows[j];
            if (cx >= wj.x && cx < wj.x + wj.width && cy >= wj.y && cy < wj.y + wj.height) {
                inWin = true; break;
            }
        }
        if (!inWin) {
            this._cancelDrag();
            this.close();
        }
    },

    // ── update (Scene의 update에서 호출) ──
    update: function() {
        if (!this._active) return;
        // 컨텍스트 메뉴가 열려있으면 다른 입력 무시
        if (this._contextMenu && this._contextMenu.isOpen()) return;

        // 드래그 스프라이트 위치 갱신 + 배치 가능 여부 색상 피드백
        if (this._dragSprite && this._dragSprite.visible) {
            this._dragSprite.x = TouchInput.x;
            this._dragSprite.y = TouchInput.y;
            // 인벤토리 그리드 위에 있을 때 배치 가능/불가 색조 표시
            var _gi = this._gridInv;
            var _pd = this._paperdoll;
            var _dragItem = (_pd && _pd._dragItem) || (_gi && _gi._dragItem);
            if (_dragItem && _gi) {
                var _tx = TouchInput.x, _ty = TouchInput.y;
                var _inGrid = _tx >= _gi.x && _tx < _gi.x + _gi.width && _ty >= _gi.y && _ty < _gi.y + _gi.height;
                if (_inGrid) {
                    var _inv = this._actor ? this._actor.gridInventory() : null;
                    if (_inv) {
                        var _tp2 = new Point(_tx, _ty);
                        var _loc2 = _gi.worldTransform.applyInverse(_tp2);
                        var _mx2 = _loc2.x - _gi.padding - _gi._gridOx;
                        var _my2 = _loc2.y - _gi.padding - _gi._gridOy;
                        var _gs3 = window.GridInventory && window.GridInventory.getGridSize ? window.GridInventory.getGridSize(_dragItem) : {w:1,h:1};
                        var _sz = {w:_gs3.w, h:_gs3.h};
                        var _dgx = Math.floor(_mx2 / _gi._cellSize) - Math.floor(_sz.w / 2);
                        var _dgy = Math.floor(_my2 / _gi._cellSize) - Math.floor(_sz.h / 2);
                        _dgx = Math.max(0, Math.min(_dgx, _inv.cols() - _sz.w));
                        _dgy = Math.max(0, Math.min(_dgy, _inv.rows() - _sz.h));
                        // 인벤토리 내부 이동 시 자기 자신 제외
                        var _canP = false;
                        var _dragPid = _gi._dragPid || 0;
                        if (_dragPid > 0) {
                            // 인벤토리 내부 드래그 — movePlacement 가능 여부
                            var _oldPl = _inv._placements[_dragPid];
                            if (_oldPl) {
                                _inv._clearGrid(_oldPl.gx, _oldPl.gy, _oldPl.w, _oldPl.h, _dragPid);
                                _canP = _inv.canPlace(_dgx, _dgy, _sz.w, _sz.h);
                                _inv._stampGrid(_dragPid, _oldPl.gx, _oldPl.gy, _oldPl.w, _oldPl.h);
                            }
                        } else {
                            _canP = _inv.canPlace(_dgx, _dgy, _sz.w, _sz.h);
                        }
                        // 빨강(불가) / 초록(가능) 색조
                        if (this._dragSprite) {
                    this._dragSprite.tint = _canP ? 0x88FF88 : 0xFF6666;
                    if (this._dragGridGfx) { this._dragGridGfx.tint = _canP ? 0x88FF88 : 0xFF6666; }
                }
                    }
                } else {
                    // 그리드 밖 — 파퍼돌 위면 파란색, 그 외 기본
                    var _onPd = _pd && _tx >= _pd.x && _tx < _pd.x + _pd.width && _ty >= _pd.y && _ty < _pd.y + _pd.height;
                    if (this._dragSprite) {
                    this._dragSprite.tint = _onPd ? 0x8888FF : 0xFFFFFF;
                    if (this._dragGridGfx) { this._dragGridGfx.tint = _onPd ? 0x8888FF : 0xFFFFFF; }
                }
                }
            }
        }



        // 딤 좌클릭 = 모달 닫기 (드래그 중에는 드래그 취소만)
        if (TouchInput.isTriggered()) {
            var tx = TouchInput.x, ty = TouchInput.y;
            var inAnyWindow = false;
            for (var i = 0; i < this._windows.length; i++) {
                var w = this._windows[i];
                if (tx >= w.x && tx < w.x + w.width && ty >= w.y && ty < w.y + w.height) {
                    inAnyWindow = true; break;
                }
            }
            if (!inAnyWindow) {
                var pd2 = this._paperdoll;
                var gi2 = this._gridInv;
                if ((pd2 && pd2._dragging) || (gi2 && gi2._dragging)) {
                    // 드래그 중 딤 클릭 → 드래그 유지 (배치 실패 = 계속 잡고 있음)
                    SoundManager.playBuzzer();
                    // 드래그 취소하지 않음 — 유저가 원하는 위치에 배치할 때까지 유지
                } else {
                    this._cancelDrag();
                    this.close();
                }
            }
        }
    }
};

// Scene_Map / Scene_Hub update 훅 — 모달 업데이트 주입
var _EIU_SceneMap_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    if (EquipModal.isActive()) {
        EquipModal.update();
        // 모달 활성 시 하위 씬 입력 차단하되 윈도우는 업데이트
        Scene_Base.prototype.update.call(this);
        return;
    }
    _EIU_SceneMap_update.call(this);
};

// Scene_EquipInventory는 EquipModal의 래퍼 (하위 호환용)
var Scene_EquipInventory = {
    _actorId: 1,
    _inventoryOnly: false
};

// ═══════════════════════════════════════════════════════════════════
//  6. HubSystem 통합 — 초상화 드롭다운 + 소지품 메뉴
//     (HubSystem.js가 나중에 로드되므로 Scene_Boot 이후 deferred 실행)
// ═══════════════════════════════════════════════════════════════════

var _EIU_Scene_Boot_start = Scene_Boot.prototype.start;
Scene_Boot.prototype.start = function() {
    _EIU_Scene_Boot_start.call(this);

    // HubSystem.js 로드 확인
    if (typeof Window_HubDropdown === "undefined") return;

    // ── 6-A: Window_HubDropdown에 "장비" 커맨드 추가 ──
    Window_HubDropdown.prototype.makeCommandList = function() {
        this.addCommand("대화하기", "talk");
        this.addCommand("인물 정보", "info");
        this.addCommand("장비", "equip");
        this.addCommand("닫기", "close");
    };

    // fittingHeight를 4로 변경 (기존 3 → 4 커맨드)
    var _WHD_init_orig = Window_HubDropdown.prototype.initialize;
    Window_HubDropdown.prototype.initialize = function(x, y) {
        this._actorId = 0;
        Window_Command.prototype.initialize.call(this, new Rectangle(x, y, 160, this.fittingHeight(4)));
        this.openness = 255;
        this.opacity = 220;
    };

    // ── 6-B: Scene_Hub 초상화 드롭다운 — "equip" 핸들러 ──
    var _SH_openPD = Scene_Hub.prototype._openPortraitDropdown;
    Scene_Hub.prototype._openPortraitDropdown = function(portraitData, sideX) {
        _SH_openPD.call(this, portraitData, sideX);
        if (this._portraitDropdown) {
            this._portraitDropdown.setHandler("equip", this._onDropdownEquip.bind(this));
        }
    };

    Scene_Hub.prototype._onDropdownEquip = function() {
        var dd = this._portraitDropdown;
        var actorId = dd ? dd._actorId : 0;
        this._closePortraitDropdown();
        EquipModal.open(actorId, false);
    };

    // ── 6-C: WorldMapSidebar 초상화 드롭다운 — "equip" 핸들러 ──
    var _WMS_openDD = WorldMapSidebar.prototype._openWMDropdown;
    WorldMapSidebar.prototype._openWMDropdown = function(portraitData) {
        _WMS_openDD.call(this, portraitData);
        if (this._wmDropdown) {
            this._wmDropdown.setHandler("equip", this._onWMDropdownEquip.bind(this));
        }
    };

    WorldMapSidebar.prototype._onWMDropdownEquip = function() {
        var dd = this._wmDropdown;
        var actorId = dd ? dd._actorId : 0;
        this._closeWMDropdown();
        EquipModal.open(actorId, false);
    };

    // ── 6-D: "소지품" 메뉴 → 플레이어 인벤토리 모달 ──
    var _SH_menuClick = Scene_Hub.prototype._onMenuClick;
    Scene_Hub.prototype._onMenuClick = function(menuName) {
        if (menuName === "소지품") {
            SoundManager.playOk();
            var leaderId = $gameParty.leader() ? $gameParty.leader().actorId() : 1;
            EquipModal.open(leaderId, false);
            return;
        }
        _SH_menuClick.call(this, menuName);
    };

    var _WMS_menuClick = WorldMapSidebar.prototype._onMenuClick;
    WorldMapSidebar.prototype._onMenuClick = function(menuName) {
        if (menuName === "소지품") {
            SoundManager.playOk();
            var leaderId = $gameParty.leader() ? $gameParty.leader().actorId() : 1;
            EquipModal.open(leaderId, false);
            return;
        }
        _WMS_menuClick.call(this, menuName);
    };

    // Scene_Hub update 훅 — 모달 업데이트 주입
    var _SH_update = Scene_Hub.prototype.update;
    Scene_Hub.prototype.update = function() {
        if (EquipModal.isActive()) {
            EquipModal.update();
            Scene_Base.prototype.update.call(this);
            return;
        }
        _SH_update.call(this);
    };
};

// ═══════════════════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════════════════

window.Window_StandingPanel = Window_StandingPanel;
window.Window_EquipPaperdoll = Window_EquipPaperdoll;
window.Window_EquipButtons = Window_EquipButtons;
window.Window_GridInvD2 = Window_GridInvD2;
window.Window_ItemContextMenu = Window_ItemContextMenu;
window.EquipModal = EquipModal;
// Scene_EquipInventory를 하위 호환 래퍼로 유지
window.Scene_EquipInventory = Scene_EquipInventory;

})();
