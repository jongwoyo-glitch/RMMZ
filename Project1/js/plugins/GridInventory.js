//=============================================================================
// GridInventory.js — Diablo 2 Style Grid Inventory System
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Grid-based inventory system with per-character storage and hotkey slots. No item rotation. Drag-and-drop spatial management.
 * @author GahoRok
 *
 * @param DefaultGridCols
 * @text Default Grid Columns
 * @type number
 * @min 4
 * @max 12
 * @default 8
 * @desc Number of columns in each character's inventory grid.
 *
 * @param DefaultGridRows
 * @text Default Grid Rows
 * @type number
 * @min 4
 * @max 10
 * @default 6
 * @desc Number of rows in each character's inventory grid.
 *
 * @param HotkeySlots
 * @text Hotkey Slots
 * @type number
 * @min 2
 * @max 8
 * @default 4
 * @desc Number of hotkey slots per character (1x1 each, consumables only).
 *
 * @param DefaultItemSize
 * @text Default Item Size (Consumable)
 * @type text
 * @default 1,1
 * @desc Default grid size for consumable items (W,H).
 *
 * @param DefaultWeaponSize
 * @text Default Weapon Size
 * @type text
 * @default 1,3
 * @desc Default grid size for weapons (W,H).
 *
 * @param DefaultArmorSize
 * @text Default Armor Size
 * @type text
 * @default 2,2
 * @desc Default grid size for armor (W,H).
 *
 * @param DefaultKeyItemSize
 * @text Default Key Item Size
 * @type text
 * @default 1,1
 * @desc Default grid size for key items (W,H).
 *
 * @help
 * ============================================================================
 * Grid Inventory System (GridInventory.js)
 * ============================================================================
 *
 * Diablo 2 style grid-based inventory. Each character has a personal grid
 * and hotkey slots. Items occupy space based on their volume (W x H).
 * No item rotation.
 *
 * ─── Notetags (Items / Weapons / Armors) ───
 *   <gridSize:W,H>       Grid size (e.g. <gridSize:2,3> = 2 wide, 3 tall)
 *   <gridIcon:col,row>   Custom icon position in grid (optional)
 *
 * ─── Hotkey Slots ───
 *   Each character has configurable hotkey slots (default 4).
 *   Only consumable items (itypeId === 1) can be placed in hotkeys.
 *   Hotkey items can be used quickly in SRPG combat.
 *   Non-hotkey items require opening the bag (costs more action).
 *
 * ─── Plugin Commands ───
 *   SetImpression / AddImpression / AddImpressionBi / SetBondTag
 *   SetMood / AddMood / RecalcMood
 *   (Legacy: SetRelation / AddFavor are wrapped for backward compat)
 *
 * ============================================================================
 *
 * @command SetImpression
 * @text Set Impression
 * @desc Set one-directional impression score (A->B).
 * @arg actorId
 * @type number
 * @text Actor ID
 * @arg targetId
 * @type number
 * @text Target Actor ID
 * @arg value
 * @type number
 * @min -100
 * @max 100
 * @text Impression Value
 *
 * @command AddImpression
 * @text Add Impression
 * @desc Add impression with bond tag modifier (one-directional).
 * @arg actorId
 * @type number
 * @text Actor ID
 * @arg targetId
 * @type number
 * @text Target Actor ID
 * @arg amount
 * @type number
 * @min -100
 * @max 100
 * @text Amount
 *
 * @command AddImpressionBi
 * @text Add Impression (Bidirectional)
 * @desc Add impression both ways with separate amounts.
 * @arg actorId
 * @type number
 * @text Actor A ID
 * @arg targetId
 * @type number
 * @text Actor B ID
 * @arg amountAB
 * @type number
 * @min -100
 * @max 100
 * @text A->B Amount
 * @arg amountBA
 * @type number
 * @min -100
 * @max 100
 * @text B->A Amount
 *
 * @command SetBondTag
 * @text Set Bond Tag
 * @desc Set relationship bond tag (one-directional, with history).
 * @arg actorId
 * @type number
 * @text Actor ID
 * @arg targetId
 * @type number
 * @text Target Actor ID
 * @arg tag
 * @type select
 * @option stranger
 * @option acquaintance
 * @option friend
 * @option rival
 * @option sworn
 * @option hostile
 * @option mentor
 * @option pupil
 * @option lover
 * @option broken
 * @text Bond Tag
 * @arg reason
 * @type text
 * @text Reason (for history)
 *
 * @command SetMood
 * @text Set Mood
 * @desc Directly set actor mood value.
 * @arg actorId
 * @type number
 * @text Actor ID
 * @arg value
 * @type number
 * @min -100
 * @max 100
 * @text Mood Value
 *
 * @command AddMood
 * @text Add Mood
 * @desc Add to actor mood value.
 * @arg actorId
 * @type number
 * @text Actor ID
 * @arg amount
 * @type number
 * @min -100
 * @max 100
 * @text Amount
 *
 * @command RecalcMood
 * @text Recalculate Mood
 * @desc Recalculate actor mood from party impression averages.
 * @arg actorId
 * @type number
 * @text Actor ID
 *
 * @command SetRelation
 * @text [Legacy] Set Relation
 * @desc Backward compat — maps favor to impression (bidirectional).
 * @arg actorId
 * @type number
 * @arg targetId
 * @type number
 * @arg favor
 * @type number
 * @min -100
 * @max 100
 *
 * @command AddFavor
 * @text [Legacy] Add Favor
 * @desc Backward compat — maps to addImpression (bidirectional).
 * @arg actorId
 * @type number
 * @arg targetId
 * @type number
 * @arg amount
 * @type number
 * @min -100
 * @max 100
 *
 * @command AddQuest
 * @text Add Quest
 * @desc Add a new quest entry.
 * @arg questId
 * @type number
 * @arg title
 * @type text
 * @arg desc
 * @type text
 *
 * @command CompleteQuest
 * @text Complete Quest
 * @desc Mark a quest as completed.
 * @arg questId
 * @type number
 *
 * @command UpdateQuest
 * @text Update Quest
 * @desc Update quest description or status.
 * @arg questId
 * @type number
 * @arg desc
 * @type text
 * @arg status
 * @type text
 *
 * @command AddEventRecord
 * @text Add Event Record
 * @desc Record a story event.
 * @arg title
 * @type text
 * @arg desc
 * @type text
 * @arg actorIds
 * @type text
 * @arg choices
 * @type text
 *
 * @command RecordSkillSource
 * @text Record Skill Source
 * @desc Record who taught a skill.
 * @arg actorId
 * @type number
 * @arg skillId
 * @type number
 * @arg source
 * @type text
 *
 */

(function() {
'use strict';

// ═══════════════════════════════════════════════════════════════════
//  0. 플러그인 파라미터
// ═══════════════════════════════════════════════════════════════════

var _params = PluginManager.parameters('GridInventory');
var GRID_COLS       = Number(_params['DefaultGridCols'] || 8);
var GRID_ROWS       = Number(_params['DefaultGridRows'] || 6);
var HOTKEY_SLOTS    = Number(_params['HotkeySlots'] || 4);

function _parseSize(str) {
  var parts = (str || '1,1').split(',');
  return { w: Math.max(1, Number(parts[0]) || 1),
           h: Math.max(1, Number(parts[1]) || 1) };
}
var DEF_ITEM_SIZE   = _parseSize(_params['DefaultItemSize']);
var DEF_WEAPON_SIZE = _parseSize(_params['DefaultWeaponSize']);
var DEF_ARMOR_SIZE  = _parseSize(_params['DefaultArmorSize']);
var DEF_KEY_SIZE    = _parseSize(_params['DefaultKeyItemSize']);


// ═══════════════════════════════════════════════════════════════════
//  0b. 관계 시스템 상수 (Relationship System v2)
// ═══════════════════════════════════════════════════════════════════

var BOND_TAGS = [
  'stranger', 'acquaintance', 'friend', 'rival', 'sworn',
  'hostile', 'mentor', 'pupil', 'lover', 'broken'
];

var BOND_MODIFIERS = {
  stranger:     { pos: 1.0, neg: 1.0 },
  acquaintance: { pos: 1.1, neg: 0.9 },
  friend:       { pos: 1.3, neg: 0.7 },
  rival:        { pos: 0.8, neg: 1.3 },
  sworn:        { pos: 1.5, neg: 0.5 },
  hostile:      { pos: 0.5, neg: 1.5 },
  mentor:       { pos: 1.2, neg: 0.8 },
  pupil:        { pos: 1.2, neg: 0.8 },
  lover:        { pos: 1.5, neg: 1.5 },
  broken:       { pos: 0.3, neg: 2.0 }
};

var COMPLIANCE_BONUS = {
  stranger: 0, acquaintance: 3, friend: 10, rival: -15,
  sworn: 10, hostile: -15, mentor: 8, pupil: 5,
  lover: 15, broken: -20
};

var IMPRESSION_DECAY_THRESHOLD = 30;
var COMPLIANCE_BASE = 70;
var MOOD_LERP = 0.3;


// ═══════════════════════════════════════════════════════════════════
//  1. 노트태그 파서 — 아이템 부피
// ═══════════════════════════════════════════════════════════════════

/**
 * 아이템/무기/방어구의 그리드 크기를 반환.
 * @param {Object} dataItem - $dataItems[n], $dataWeapons[n], $dataArmors[n]
 * @returns {{w:number, h:number}}
 */
function getGridSize(dataItem) {
  if (!dataItem) return { w: 1, h: 1 };

  // 캐시
  if (dataItem._gridSizeCache) return dataItem._gridSizeCache;

  var note = dataItem.note || '';
  var match = note.match(/<gridSize:\s*(\d+)\s*,\s*(\d+)\s*>/i);
  if (match) {
    dataItem._gridSizeCache = {
      w: Math.max(1, Math.min(4, Number(match[1]))),
      h: Math.max(1, Math.min(4, Number(match[2])))
    };
  } else {
    // 기본값 판정
    if (DataManager.isWeapon(dataItem)) {
      dataItem._gridSizeCache = { w: DEF_WEAPON_SIZE.w, h: DEF_WEAPON_SIZE.h };
    } else if (DataManager.isArmor(dataItem)) {
      dataItem._gridSizeCache = { w: DEF_ARMOR_SIZE.w, h: DEF_ARMOR_SIZE.h };
    } else if (DataManager.isItem(dataItem)) {
      // 소비 아이템 vs 핵심 아이템
      if (dataItem.itypeId === 2) {
        dataItem._gridSizeCache = { w: DEF_KEY_SIZE.w, h: DEF_KEY_SIZE.h };
      } else {
        dataItem._gridSizeCache = { w: DEF_ITEM_SIZE.w, h: DEF_ITEM_SIZE.h };
      }
    } else {
      dataItem._gridSizeCache = { w: 1, h: 1 };
    }
  }
  return dataItem._gridSizeCache;
}


// ═══════════════════════════════════════════════════════════════════
//  2. Game_GridInventory — 그리드 인벤토리 코어
// ═══════════════════════════════════════════════════════════════════

/**
 * @class Game_GridInventory
 * @param {number} cols - 그리드 열 수
 * @param {number} rows - 그리드 행 수
 * @param {number} hotkeyCount - 핫키 슬롯 수
 */
function Game_GridInventory() {
  this.initialize.apply(this, arguments);
}

Game_GridInventory.prototype.initialize = function(cols, rows, hotkeyCount) {
  this._cols = cols || GRID_COLS;
  this._rows = rows || GRID_ROWS;
  this._hotkeyCount = hotkeyCount || HOTKEY_SLOTS;

  // 그리드: 0 = 빈칸, 양수 = 배치 ID
  this._grid = [];
  for (var r = 0; r < this._rows; r++) {
    this._grid[r] = [];
    for (var c = 0; c < this._cols; c++) {
      this._grid[r][c] = 0;
    }
  }

  // 배치 목록: placementId → { itemType, itemId, gx, gy, w, h }
  this._placements = {};
  this._nextPlacementId = 1;

  // 핫키 슬롯: [null, null, ...]
  this._hotkeys = [];
  for (var i = 0; i < this._hotkeyCount; i++) {
    this._hotkeys[i] = null;  // { itemType: 'item', itemId: N } or null
  }
};

// --- 접근자 ---
Game_GridInventory.prototype.cols = function() { return this._cols; };
Game_GridInventory.prototype.rows = function() { return this._rows; };
Game_GridInventory.prototype.hotkeyCount = function() { return this._hotkeyCount; };
Game_GridInventory.prototype.hotkeys = function() { return this._hotkeys; };
Game_GridInventory.prototype.placements = function() { return this._placements; };

/**
 * 해당 그리드 좌표에 있는 배치 ID 반환 (0 = 비어있음)
 */
Game_GridInventory.prototype.gridAt = function(gx, gy) {
  if (gx < 0 || gx >= this._cols || gy < 0 || gy >= this._rows) return -1;
  return this._grid[gy][gx];
};

/**
 * 해당 좌표의 배치 정보 반환
 */
Game_GridInventory.prototype.placementAt = function(gx, gy) {
  var pid = this.gridAt(gx, gy);
  if (pid <= 0) return null;
  return this._placements[pid] || null;
};

/**
 * 아이템의 RMMZ 데이터 오브젝트를 해결
 */
Game_GridInventory.prototype.resolveDataItem = function(itemType, itemId) {
  if (itemType === 'item')   return $dataItems[itemId];
  if (itemType === 'weapon') return $dataWeapons[itemId];
  if (itemType === 'armor')  return $dataArmors[itemId];
  return null;
};

/**
 * itemType 문자열 판정
 */
Game_GridInventory.prototype.classifyItem = function(dataItem) {
  if (DataManager.isItem(dataItem))   return 'item';
  if (DataManager.isWeapon(dataItem)) return 'weapon';
  if (DataManager.isArmor(dataItem))  return 'armor';
  return 'item';
};


// --- 배치 가능 여부 검사 ---

/**
 * (gx, gy) 위치에 w x h 아이템을 놓을 수 있는지 검사
 * @param {number} gx - 좌상단 열
 * @param {number} gy - 좌상단 행
 * @param {number} w  - 폭
 * @param {number} h  - 높이
 * @param {number} [ignorePid] - 무시할 배치ID (이동 시 자기 자신)
 * @returns {boolean}
 */
Game_GridInventory.prototype.canPlace = function(gx, gy, w, h, ignorePid) {
  if (gx < 0 || gy < 0 || gx + w > this._cols || gy + h > this._rows) {
    return false;
  }
  for (var dy = 0; dy < h; dy++) {
    for (var dx = 0; dx < w; dx++) {
      var cell = this._grid[gy + dy][gx + dx];
      if (cell !== 0 && cell !== (ignorePid || 0)) {
        return false;
      }
    }
  }
  return true;
};

/**
 * 자동 배치 가능한 첫 번째 위치를 찾기 (좌→우, 상→하 스캔)
 * @returns {{gx:number, gy:number}|null}
 */
Game_GridInventory.prototype.findFreeSlot = function(w, h) {
  for (var gy = 0; gy <= this._rows - h; gy++) {
    for (var gx = 0; gx <= this._cols - w; gx++) {
      if (this.canPlace(gx, gy, w, h)) {
        return { gx: gx, gy: gy };
      }
    }
  }
  return null;
};


// --- 배치 / 제거 / 이동 ---

/**
 * 아이템을 그리드에 배치
 * @param {Object} dataItem - $dataItems[n] 등
 * @param {number} gx - 좌상단 열
 * @param {number} gy - 좌상단 행
 * @returns {number} placementId (0 = 실패)
 */
Game_GridInventory.prototype.place = function(dataItem, gx, gy) {
  var size = getGridSize(dataItem);
  if (!this.canPlace(gx, gy, size.w, size.h)) return 0;

  var pid = this._nextPlacementId++;
  var itemType = this.classifyItem(dataItem);

  this._placements[pid] = {
    itemType: itemType,
    itemId:   dataItem.id,
    gx: gx, gy: gy,
    w: size.w, h: size.h
  };

  this._stampGrid(pid, gx, gy, size.w, size.h);
  return pid;
};

/**
 * 아이템을 자동 배치 (빈 자리 탐색)
 * @returns {number} placementId (0 = 공간 없음)
 */
Game_GridInventory.prototype.autoPlace = function(dataItem) {
  var size = getGridSize(dataItem);
  var slot = this.findFreeSlot(size.w, size.h);
  if (!slot) return 0;
  return this.place(dataItem, slot.gx, slot.gy);
};

/**
 * 배치 제거
 * @param {number} pid - placementId
 * @returns {Object|null} 제거된 placement 정보
 */
Game_GridInventory.prototype.removePlacement = function(pid) {
  var p = this._placements[pid];
  if (!p) return null;
  this._clearGrid(p.gx, p.gy, p.w, p.h, pid);
  delete this._placements[pid];
  // 핫키에서도 제거
  this._removeFromHotkeys(p.itemType, p.itemId);
  return p;
};

/**
 * 아이템 이동 (같은 그리드 내)
 * @param {number} pid - placementId
 * @param {number} newGx - 새 좌상단 열
 * @param {number} newGy - 새 좌상단 행
 * @returns {boolean} 성공 여부
 */
Game_GridInventory.prototype.movePlacement = function(pid, newGx, newGy) {
  var p = this._placements[pid];
  if (!p) return false;
  if (!this.canPlace(newGx, newGy, p.w, p.h, pid)) return false;

  // 이전 위치 클리어
  this._clearGrid(p.gx, p.gy, p.w, p.h, pid);
  // 새 위치 스탬프
  p.gx = newGx;
  p.gy = newGy;
  this._stampGrid(pid, newGx, newGy, p.w, p.h);
  return true;
};

/**
 * 특정 dataItem이 그리드에 있는지 검색
 * @returns {Array<number>} 해당 아이템의 placementId 배열
 */
Game_GridInventory.prototype.findItem = function(dataItem) {
  var itemType = this.classifyItem(dataItem);
  var itemId = dataItem.id;
  var result = [];
  var placements = this._placements;
  for (var pid in placements) {
    if (placements.hasOwnProperty(pid)) {
      var p = placements[pid];
      if (p.itemType === itemType && p.itemId === itemId) {
        result.push(Number(pid));
      }
    }
  }
  return result;
};

/**
 * 특정 아이템의 소지 수량
 */
Game_GridInventory.prototype.itemCount = function(dataItem) {
  return this.findItem(dataItem).length;
};

/**
 * 아이템을 count개 제거 (핫키 실행 등에서 호출)
 * @param {Object} dataItem - RMMZ 데이터 아이템
 * @param {number} count - 제거할 수량
 * @returns {number} 실제 제거된 수량
 */
Game_GridInventory.prototype.removeItem = function(dataItem, count) {
  if (!dataItem || count <= 0) return 0;
  var pids = this.findItem(dataItem);
  var removed = 0;
  for (var i = 0; i < pids.length && removed < count; i++) {
    this.removePlacement(pids[i]);
    removed++;
  }
  return removed;
};

/**
 * 전체 배치 목록을 배열로 반환
 */
Game_GridInventory.prototype.allPlacements = function() {
  var result = [];
  var placements = this._placements;
  for (var pid in placements) {
    if (placements.hasOwnProperty(pid)) {
      result.push({ pid: Number(pid), data: placements[pid] });
    }
  }
  return result;
};

/**
 * 남은 빈 칸 수
 */
Game_GridInventory.prototype.freeSpace = function() {
  var count = 0;
  for (var r = 0; r < this._rows; r++) {
    for (var c = 0; c < this._cols; c++) {
      if (this._grid[r][c] === 0) count++;
    }
  }
  return count;
};

/**
 * 전체 칸 수
 */
Game_GridInventory.prototype.totalSpace = function() {
  return this._cols * this._rows;
};


// --- 핫키 슬롯 ---

/**
 * 핫키 슬롯에 아이템 등록
 * @param {number} slotIdx - 슬롯 인덱스 (0-based)
 * @param {Object} dataItem - 소비 아이템만 가능
 * @returns {boolean}
 */
Game_GridInventory.prototype.setHotkey = function(slotIdx, dataItem) {
  if (slotIdx < 0 || slotIdx >= this._hotkeyCount) return false;
  if (!dataItem) {
    this._hotkeys[slotIdx] = null;
    return true;
  }
  // 소비 아이템만 허용 (itypeId === 1)
  if (!DataManager.isItem(dataItem) || dataItem.itypeId !== 1) return false;
  // 인벤토리에 해당 아이템이 있는지 확인
  if (this.findItem(dataItem).length === 0) return false;

  this._hotkeys[slotIdx] = { itemType: 'item', itemId: dataItem.id };
  return true;
};

/**
 * 핫키 슬롯 클리어
 */
Game_GridInventory.prototype.clearHotkey = function(slotIdx) {
  if (slotIdx < 0 || slotIdx >= this._hotkeyCount) return;
  this._hotkeys[slotIdx] = null;
};

/**
 * 핫키 슬롯의 dataItem 반환
 */
Game_GridInventory.prototype.hotkeyItem = function(slotIdx) {
  var hk = this._hotkeys[slotIdx];
  if (!hk) return null;
  return this.resolveDataItem(hk.itemType, hk.itemId);
};

/**
 * 핫키에 등록된 아이템이 인벤토리에 아직 있는지 검증 (소비 후 동기화)
 */
Game_GridInventory.prototype.validateHotkeys = function() {
  for (var i = 0; i < this._hotkeyCount; i++) {
    var hk = this._hotkeys[i];
    if (!hk) continue;
    var dataItem = this.resolveDataItem(hk.itemType, hk.itemId);
    if (!dataItem || this.findItem(dataItem).length === 0) {
      this._hotkeys[i] = null;
    }
  }
};


// --- 내부 헬퍼 ---

Game_GridInventory.prototype._stampGrid = function(pid, gx, gy, w, h) {
  for (var dy = 0; dy < h; dy++) {
    for (var dx = 0; dx < w; dx++) {
      this._grid[gy + dy][gx + dx] = pid;
    }
  }
};

Game_GridInventory.prototype._clearGrid = function(gx, gy, w, h, pid) {
  for (var dy = 0; dy < h; dy++) {
    for (var dx = 0; dx < w; dx++) {
      if (this._grid[gy + dy][gx + dx] === pid) {
        this._grid[gy + dy][gx + dx] = 0;
      }
    }
  }
};

Game_GridInventory.prototype._removeFromHotkeys = function(itemType, itemId) {
  for (var i = 0; i < this._hotkeyCount; i++) {
    var hk = this._hotkeys[i];
    if (hk && hk.itemType === itemType && hk.itemId === itemId) {
      // 인벤토리에 남은 동일 아이템이 있으면 핫키 유지
      var dataItem = this.resolveDataItem(itemType, itemId);
      if (dataItem && this.findItem(dataItem).length > 0) continue;
      this._hotkeys[i] = null;
    }
  }
};


// --- 직렬화 ---

Game_GridInventory.prototype.toSaveData = function() {
  return {
    cols: this._cols,
    rows: this._rows,
    hotkeyCount: this._hotkeyCount,
    grid: this._grid,
    placements: this._placements,
    nextPid: this._nextPlacementId,
    hotkeys: this._hotkeys
  };
};

Game_GridInventory.fromSaveData = function(data) {
  var inv = new Game_GridInventory(data.cols, data.rows, data.hotkeyCount);
  inv._grid = data.grid;
  inv._placements = data.placements;
  inv._nextPlacementId = data.nextPid;
  inv._hotkeys = data.hotkeys;
  return inv;
};


// ═══════════════════════════════════════════════════════════════════
//  3. Game_Actor 확장
// ═══════════════════════════════════════════════════════════════════

var _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
Game_Actor.prototype.initMembers = function() {
  _Game_Actor_initMembers.call(this);
  this._gridInventory = null;  // lazy init after setup
  // ── 관계 시스템 v2 ──
  this._impressions = {};      // { actorId: number (-100~100) }
  this._bondTags = {};         // { actorId: string }
  this._bondHistory = {};      // { actorId: [{tag, since, reason}] }
  this._mood = 0;              // -100 ~ 100
  this._skillSource = {};      // { skillId: teacherActorId or 'event' }
};

var _Game_Actor_setup = Game_Actor.prototype.setup;
Game_Actor.prototype.setup = function(actorId) {
  _Game_Actor_setup.call(this, actorId);
  if (!this._gridInventory) {
    this._gridInventory = new Game_GridInventory();
  }
};

/**
 * 그리드 인벤토리 접근자
 */
Game_Actor.prototype.gridInventory = function() {
  if (!this._gridInventory) {
    this._gridInventory = new Game_GridInventory();
  }
  return this._gridInventory;
};

// ═══════════════════════════════════════════════════════════════════
//  3b. 관계 시스템 v2 API
// ═══════════════════════════════════════════════════════════════════

// ─── Impression (인상 점수) ───

Game_Actor.prototype.getImpression = function(targetId) {
  return this._impressions[targetId] || 0;
};

Game_Actor.prototype.setImpression = function(targetId, value) {
  if (!this._impressions) this._impressions = {};
  this._impressions[targetId] = Math.max(-100, Math.min(100, Math.round(value)));
};

/**
 * 인상 점수 변동 — Bond Tag 모디파이어 자동 적용
 */
Game_Actor.prototype.addImpression = function(targetId, amount) {
  var tag = this.getBondTag(targetId);
  var mod = BOND_MODIFIERS[tag] || BOND_MODIFIERS.stranger;
  var multiplier = amount >= 0 ? mod.pos : mod.neg;
  var adjusted = Math.round(amount * multiplier);
  this.setImpression(targetId, this.getImpression(targetId) + adjusted);
};

Game_Actor.prototype.allImpressions = function() {
  return this._impressions || {};
};

// ─── Bond Tag (관계 태그) ───

Game_Actor.prototype.getBondTag = function(targetId) {
  return (this._bondTags && this._bondTags[targetId]) || 'stranger';
};

Game_Actor.prototype.setBondTag = function(targetId, tag, reason) {
  if (!this._bondTags) this._bondTags = {};
  if (!this._bondHistory) this._bondHistory = {};
  var oldTag = this.getBondTag(targetId);
  if (oldTag === tag) return;
  this._bondTags[targetId] = tag;
  // 히스토리 기록
  if (!this._bondHistory[targetId]) {
    this._bondHistory[targetId] = [{ tag: 'stranger', since: 0 }];
  }
  var elapsed = typeof $gameVariables !== 'undefined' ? ($gameVariables.value(1) || 0) : 0;
  this._bondHistory[targetId].push({
    tag: tag,
    since: elapsed,
    reason: reason || ''
  });
};

Game_Actor.prototype.getBondHistory = function(targetId) {
  return (this._bondHistory && this._bondHistory[targetId]) || [];
};

Game_Actor.prototype.allBondTags = function() {
  return this._bondTags || {};
};

// ─── Mood (기분) ───

Game_Actor.prototype.mood = function() {
  return this._mood || 0;
};

Game_Actor.prototype.setMood = function(value) {
  this._mood = Math.max(-100, Math.min(100, Math.round(value)));
};

Game_Actor.prototype.addMood = function(amount) {
  this.setMood(this.mood() + amount);
};

/**
 * 파티원 인상 평균 기반 기분 재계산 (관성 적용)
 */
Game_Actor.prototype.recalcMood = function() {
  if (!$gameParty) return;
  var members = $gameParty.members();
  var sum = 0;
  var count = 0;
  for (var i = 0; i < members.length; i++) {
    if (members[i] === this) continue;
    sum += this.getImpression(members[i].actorId());
    count++;
  }
  var base = count > 0 ? Math.round(sum / count) : 0;
  var current = this.mood();
  var next = current + Math.round((base - current) * MOOD_LERP);
  this.setMood(next);
};

// ─── 순응 확률 ───

/**
 * 비전투 상호작용 순응 확률 (%) 반환
 * @param {number} [requesterId] - 요청자 actorId (태그 보정용)
 */
Game_Actor.prototype.complianceRate = function(requesterId) {
  var moodVal = this.mood();
  var moodBonus = moodVal > 0 ? moodVal * 0.3 : moodVal * 0.5;
  var tag = requesterId ? this.getBondTag(requesterId) : 'stranger';
  var tagBonus = COMPLIANCE_BONUS[tag] || 0;
  return Math.max(5, Math.min(99, Math.round(COMPLIANCE_BASE + moodBonus + tagBonus)));
};

/**
 * 순응 판정 실행 — true면 순응, false면 불응
 */
Game_Actor.prototype.checkCompliance = function(requesterId) {
  return Math.random() * 100 < this.complianceRate(requesterId);
};

// ─── 인상 자연 감쇠 ───

/**
 * 게임 내 1일 경과 시 호출 — 극단값 중앙 회귀
 */
Game_Actor.prototype.decayImpressions = function() {
  if (!this._impressions) return;
  for (var id in this._impressions) {
    if (!this._impressions.hasOwnProperty(id)) continue;
    var val = this._impressions[id];
    if (Math.abs(val) <= IMPRESSION_DECAY_THRESHOLD) continue;
    // Bond Tag에 따라 감쇠 차단
    var tag = this.getBondTag(Number(id));
    if (val > 0 && (tag === 'sworn' || tag === 'friend' || tag === 'lover')) continue;
    if (val < 0 && (tag === 'hostile' || tag === 'broken')) continue;
    this._impressions[id] = val > 0 ? val - 1 : val + 1;
  }
};

// ─── 하위 호환 래퍼 (deprecated) ───

Game_Actor.prototype.getRelationship = function(otherActorId) {
  return { favor: this.getImpression(otherActorId), trust: 0 };
};
Game_Actor.prototype.setRelationship = function(otherActorId, favor) {
  this.setImpression(otherActorId, favor);
};
Game_Actor.prototype.addFavor = function(otherActorId, amount) {
  this.addImpression(otherActorId, amount);
};
Game_Actor.prototype.addTrust = function() { /* deprecated — no-op */ };
Game_Actor.prototype.allRelationships = function() {
  return this.allImpressions();
};

/**
 * 스킬 습득 경로 기록
 */
Game_Actor.prototype.recordSkillSource = function(skillId, source) {
  this._skillSource[skillId] = source;  // actorId or 'event' or 'innate'
};

Game_Actor.prototype.getSkillSource = function(skillId) {
  return this._skillSource[skillId] || 'innate';
};


// ═══════════════════════════════════════════════════════════════════
//  4. Game_Party 확장
// ═══════════════════════════════════════════════════════════════════

var _Game_Party_initialize = Game_Party.prototype.initialize;
Game_Party.prototype.initialize = function() {
  _Game_Party_initialize.call(this);
  this._questLog = [];    // [{ id, title, desc, status, steps, relatedActors }]
  this._eventLog = [];    // [{ timestamp, title, desc, actorIds, choices }]
  this._sharedStorage = null;  // 공용 보관함 (별도 접근점에서만)
};

/**
 * 공용 보관함 (거점 전용, 메인 메뉴 밖)
 */
Game_Party.prototype.sharedStorage = function() {
  if (!this._sharedStorage) {
    this._sharedStorage = new Game_GridInventory(10, 8, 0);
  }
  return this._sharedStorage;
};


// --- 퀘스트 시스템 ---

Game_Party.prototype.addQuest = function(quest) {
  // quest: { id, title, desc, status:'active', steps:[], relatedActors:[] }
  if (this.getQuest(quest.id)) return;
  quest.status = quest.status || 'active';
  quest.steps = quest.steps || [];
  quest.relatedActors = quest.relatedActors || [];
  this._questLog.push(quest);
};

Game_Party.prototype.getQuest = function(questId) {
  for (var i = 0; i < this._questLog.length; i++) {
    if (this._questLog[i].id === questId) return this._questLog[i];
  }
  return null;
};

Game_Party.prototype.updateQuest = function(questId, changes) {
  var q = this.getQuest(questId);
  if (!q) return;
  if (changes.status !== undefined) q.status = changes.status;
  if (changes.desc !== undefined) q.desc = changes.desc;
  if (changes.title !== undefined) q.title = changes.title;
};

Game_Party.prototype.completeQuest = function(questId) {
  this.updateQuest(questId, { status: 'completed' });
};

Game_Party.prototype.activeQuests = function() {
  return this._questLog.filter(function(q) { return q.status === 'active'; });
};

Game_Party.prototype.completedQuests = function() {
  return this._questLog.filter(function(q) { return q.status === 'completed'; });
};

Game_Party.prototype.allQuests = function() {
  return this._questLog;
};


// --- 이벤트 기록 ---

Game_Party.prototype.addEventRecord = function(record) {
  // record: { title, desc, actorIds:[], choices:[] }
  record.timestamp = record.timestamp || Date.now();
  this._eventLog.push(record);
};

Game_Party.prototype.eventLog = function() {
  return this._eventLog;
};

Game_Party.prototype.eventsByActor = function(actorId) {
  return this._eventLog.filter(function(e) {
    return e.actorIds && e.actorIds.indexOf(actorId) >= 0;
  });
};


// --- RMMZ 기본 아이템 시스템 브릿지 ---

/**
 * gainItem 오버라이드: 아이템 획득 시 그리드 인벤토리에 자동 배치
 * 원본 파티 아이템 개수 관리도 유지 (호환성)
 */
var _Game_Party_gainItem = Game_Party.prototype.gainItem;
Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
  if (!item) return;
  if (amount > 0) {
    // 획득: 파티원 그리드에 배치 시도
    var placed = 0;
    for (var i = 0; i < amount; i++) {
      if (this._tryAutoPlaceToParty(item)) {
        placed++;
      } else {
        // 배치 실패 — 공간 부족 알림
        if (typeof SceneManager !== 'undefined' && SceneManager._scene) {
          // 씬이 있으면 알림 표시 (Phase 5 에서 UI 연결)
        }
        break;
      }
    }
    // 실제 배치된 수만 기본 시스템에 반영
    if (placed > 0) {
      _Game_Party_gainItem.call(this, item, placed, includeEquip);
    }
  } else if (amount < 0) {
    // 소비/버리기: 파티원 그리드에서 제거
    var toRemove = Math.abs(amount);
    var removed = 0;
    for (var j = 0; j < toRemove; j++) {
      if (this._tryRemoveFromParty(item)) {
        removed++;
      }
    }
    if (removed > 0) {
      _Game_Party_gainItem.call(this, item, -removed, includeEquip);
    }
  }
};

/**
 * 파티원 순서대로 자동 배치 시도
 */
Game_Party.prototype._tryAutoPlaceToParty = function(dataItem) {
  var members = this.members();
  for (var i = 0; i < members.length; i++) {
    var inv = members[i].gridInventory();
    if (inv.autoPlace(dataItem) > 0) return true;
  }
  return false;
};

/**
 * 파티원에서 아이템 1개 제거
 */
Game_Party.prototype._tryRemoveFromParty = function(dataItem) {
  var members = this.members();
  for (var i = 0; i < members.length; i++) {
    var inv = members[i].gridInventory();
    var pids = inv.findItem(dataItem);
    if (pids.length > 0) {
      inv.removePlacement(pids[0]);
      return true;
    }
  }
  return false;
};

/**
 * hasItem 오버라이드: 전 파티원 그리드 검색
 */
var _Game_Party_hasItem = Game_Party.prototype.hasItem;
Game_Party.prototype.hasItem = function(item, includeEquip) {
  // 기본 체크 유지 (장비 포함 등)
  return _Game_Party_hasItem.call(this, item, includeEquip);
};

/**
 * 파티 전체에서 특정 아이템 수량 조회 (그리드 기반)
 */
Game_Party.prototype.gridItemCount = function(dataItem) {
  var count = 0;
  var members = this.members();
  for (var i = 0; i < members.length; i++) {
    count += members[i].gridInventory().itemCount(dataItem);
  }
  return count;
};


// ═══════════════════════════════════════════════════════════════════
//  5. DataManager 확장 — 저장/로드
// ═══════════════════════════════════════════════════════════════════

var _DataManager_makeSaveContents = DataManager.makeSaveContents;
DataManager.makeSaveContents = function() {
  var contents = _DataManager_makeSaveContents.call(this);

  // 액터별 그리드 인벤토리 + 관계v2 + 스킬소스
  contents.gridInventories = {};
  contents.actorImpressions = {};
  contents.actorBondTags = {};
  contents.actorBondHistory = {};
  contents.actorMoods = {};
  contents.actorSkillSources = {};
  var actors = $gameActors._data;
  for (var i = 1; i < actors.length; i++) {
    if (actors[i]) {
      contents.gridInventories[i] = actors[i].gridInventory().toSaveData();
      contents.actorImpressions[i] = actors[i]._impressions || {};
      contents.actorBondTags[i] = actors[i]._bondTags || {};
      contents.actorBondHistory[i] = actors[i]._bondHistory || {};
      contents.actorMoods[i] = actors[i]._mood || 0;
      contents.actorSkillSources[i] = actors[i]._skillSource;
    }
  }

  // 파티 퀘스트/이벤트/보관함
  contents.questLog = $gameParty._questLog;
  contents.eventLog = $gameParty._eventLog;
  if ($gameParty._sharedStorage) {
    contents.sharedStorage = $gameParty._sharedStorage.toSaveData();
  }

  return contents;
};

var _DataManager_extractSaveContents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function(contents) {
  _DataManager_extractSaveContents.call(this, contents);

  // 복원: 그리드 인벤토리
  if (contents.gridInventories) {
    var actors = $gameActors._data;
    for (var id in contents.gridInventories) {
      if (contents.gridInventories.hasOwnProperty(id) && actors[id]) {
        actors[id]._gridInventory =
          Game_GridInventory.fromSaveData(contents.gridInventories[id]);
      }
    }
  }

  // 복원: 관계 v2
  if (contents.actorImpressions) {
    var actors2 = $gameActors._data;
    for (var id2 in contents.actorImpressions) {
      if (contents.actorImpressions.hasOwnProperty(id2) && actors2[id2]) {
        actors2[id2]._impressions = contents.actorImpressions[id2];
        actors2[id2]._bondTags = (contents.actorBondTags && contents.actorBondTags[id2]) || {};
        actors2[id2]._bondHistory = (contents.actorBondHistory && contents.actorBondHistory[id2]) || {};
        actors2[id2]._mood = (contents.actorMoods && contents.actorMoods[id2]) || 0;
      }
    }
  } else if (contents.actorRelationships) {
    // ── 구 세이브 마이그레이션 ──
    var actors2m = $gameActors._data;
    for (var id2m in contents.actorRelationships) {
      if (contents.actorRelationships.hasOwnProperty(id2m) && actors2m[id2m]) {
        var oldRels = contents.actorRelationships[id2m];
        actors2m[id2m]._impressions = {};
        actors2m[id2m]._bondTags = {};
        actors2m[id2m]._bondHistory = {};
        actors2m[id2m]._mood = 0;
        for (var tid in oldRels) {
          if (!oldRels.hasOwnProperty(tid)) continue;
          actors2m[id2m]._impressions[tid] = oldRels[tid].favor || 0;
          var trust = oldRels[tid].trust || 0;
          if (trust >= 60) actors2m[id2m]._bondTags[tid] = 'friend';
          else if (trust >= 30) actors2m[id2m]._bondTags[tid] = 'acquaintance';
        }
      }
    }
  }

  // 복원: 스킬소스
  if (contents.actorSkillSources) {
    var actors3 = $gameActors._data;
    for (var id3 in contents.actorSkillSources) {
      if (contents.actorSkillSources.hasOwnProperty(id3) && actors3[id3]) {
        actors3[id3]._skillSource = contents.actorSkillSources[id3];
      }
    }
  }

  // 복원: 퀘스트/이벤트
  if (contents.questLog) $gameParty._questLog = contents.questLog;
  if (contents.eventLog) $gameParty._eventLog = contents.eventLog;

  // 복원: 공용 보관함
  if (contents.sharedStorage) {
    $gameParty._sharedStorage =
      Game_GridInventory.fromSaveData(contents.sharedStorage);
  }
};


// ═══════════════════════════════════════════════════════════════════
//  6. 플러그인 커맨드
// ═══════════════════════════════════════════════════════════════════

PluginManager.registerCommand('GridInventory', 'AddQuest', function(args) {
  var quest = {
    id:    Number(args.questId),
    title: String(args.title || ''),
    desc:  String(args.desc || ''),
    status: 'active'
  };
  $gameParty.addQuest(quest);
});

PluginManager.registerCommand('GridInventory', 'CompleteQuest', function(args) {
  $gameParty.completeQuest(Number(args.questId));
});

PluginManager.registerCommand('GridInventory', 'UpdateQuest', function(args) {
  $gameParty.updateQuest(Number(args.questId), {
    desc: args.desc || undefined,
    status: args.status || undefined
  });
});

PluginManager.registerCommand('GridInventory', 'AddEventRecord', function(args) {
  $gameParty.addEventRecord({
    title: String(args.title || ''),
    desc:  String(args.desc || ''),
    actorIds: JSON.parse(args.actorIds || '[]'),
    choices:  JSON.parse(args.choices || '[]')
  });
});

// ── 관계 v2 플러그인 커맨드 ──

PluginManager.registerCommand('GridInventory', 'SetImpression', function(args) {
  var actorId = Number(args.actorId);
  var targetId = Number(args.targetId);
  var value = Number(args.value || 0);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.setImpression(targetId, value);
});

PluginManager.registerCommand('GridInventory', 'AddImpression', function(args) {
  var actorId = Number(args.actorId);
  var targetId = Number(args.targetId);
  var amount = Number(args.amount || 0);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.addImpression(targetId, amount);
});

PluginManager.registerCommand('GridInventory', 'AddImpressionBi', function(args) {
  var actorId = Number(args.actorId);
  var targetId = Number(args.targetId);
  var amountAB = Number(args.amountAB || 0);
  var amountBA = Number(args.amountBA != null ? args.amountBA : args.amountAB || 0);
  var actor = $gameActors.actor(actorId);
  var target = $gameActors.actor(targetId);
  if (actor) actor.addImpression(targetId, amountAB);
  if (target) target.addImpression(actorId, amountBA);
});

PluginManager.registerCommand('GridInventory', 'SetBondTag', function(args) {
  var actorId = Number(args.actorId);
  var targetId = Number(args.targetId);
  var tag = String(args.tag || 'stranger');
  var reason = String(args.reason || '');
  var actor = $gameActors.actor(actorId);
  if (actor) actor.setBondTag(targetId, tag, reason);
});

PluginManager.registerCommand('GridInventory', 'SetMood', function(args) {
  var actorId = Number(args.actorId);
  var value = Number(args.value || 0);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.setMood(value);
});

PluginManager.registerCommand('GridInventory', 'AddMood', function(args) {
  var actorId = Number(args.actorId);
  var amount = Number(args.amount || 0);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.addMood(amount);
});

PluginManager.registerCommand('GridInventory', 'RecalcMood', function(args) {
  var actorId = Number(args.actorId);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.recalcMood();
});

// ── 하위 호환 (구 커맨드 → 신 API 래핑) ──

PluginManager.registerCommand('GridInventory', 'SetRelation', function(args) {
  var actorId = Number(args.actorId);
  var targetId = Number(args.targetId);
  var favor = Number(args.favor || 0);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.setImpression(targetId, favor);
  var target = $gameActors.actor(targetId);
  if (target) target.setImpression(actorId, favor);
});

PluginManager.registerCommand('GridInventory', 'AddFavor', function(args) {
  var actorId = Number(args.actorId);
  var targetId = Number(args.targetId);
  var amount = Number(args.amount || 0);
  var actor = $gameActors.actor(actorId);
  if (actor) actor.addImpression(targetId, amount);
  var target = $gameActors.actor(targetId);
  if (target) target.addImpression(actorId, amount);
});

PluginManager.registerCommand('GridInventory', 'RecordSkillSource', function(args) {
  var actorId = Number(args.actorId);
  var skillId = Number(args.skillId);
  var source = args.source || 'event';
  var actor = $gameActors.actor(actorId);
  if (actor) actor.recordSkillSource(skillId, source);
});


// ═══════════════════════════════════════════════════════════════════
//  7. 노트태그 파서 — 관계 초기값
// ═══════════════════════════════════════════════════════════════════

/**
 * 게임 시작 시 액터 노트태그에서 관계 초기값 파싱
 * 형식: <srpgRelation:targetId,impression,bondTag>
 * 구형식: <srpgRelation:targetId,favor,trust> (마이그레이션)
 */
var _Game_Actor_setup_rel = Game_Actor.prototype.setup;
Game_Actor.prototype.setup = function(actorId) {
  _Game_Actor_setup_rel.call(this, actorId);
  this._parseRelationNotetags();
};

Game_Actor.prototype._parseRelationNotetags = function() {
  var actor = $dataActors[this._actorId];
  if (!actor) return;
  var note = actor.note || '';
  var regex = /<srpgRelation:(\d+),([^,>]+),([^>]+)>/gi;
  var m;
  while ((m = regex.exec(note)) !== null) {
    var targetId = parseInt(m[1]);
    var second = m[2].trim();
    var third = m[3].trim();
    // 신규 형식: impression(숫자), bondTag(문자)
    // 구형식: favor(숫자), trust(숫자)
    if (isNaN(Number(third))) {
      // 신규: <srpgRelation:id,impression,bondTag>
      this.setImpression(targetId, Number(second) || 0);
      if (BOND_TAGS.indexOf(third) >= 0) {
        if (!this._bondTags) this._bondTags = {};
        this._bondTags[targetId] = third;
      }
    } else {
      // 구형식: <srpgRelation:id,favor,trust> — 마이그레이션
      this.setImpression(targetId, Number(second) || 0);
      var trust = Number(third) || 0;
      if (!this._bondTags) this._bondTags = {};
      if (trust >= 60) this._bondTags[targetId] = 'friend';
      else if (trust >= 30) this._bondTags[targetId] = 'acquaintance';
    }
  }
};


// ═══════════════════════════════════════════════════════════════════
//  8. 기분 재계산 훅 — 맵 전환 / 전투 종료
// ═══════════════════════════════════════════════════════════════════

/**
 * 파티 전체 기분 재계산
 */
function recalcAllMoods() {
  if (!$gameParty) return;
  var members = $gameParty.members();
  for (var i = 0; i < members.length; i++) {
    members[i].recalcMood();
  }
}

/**
 * 파티 전체 인상 감쇠 (1일 경과 시 호출)
 */
function decayAllImpressions() {
  if (!$gameActors || !$gameActors._data) return;
  var actors = $gameActors._data;
  for (var i = 1; i < actors.length; i++) {
    if (actors[i]) actors[i].decayImpressions();
  }
}

// 맵 전환 시 기분 재계산
var _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
Scene_Map.prototype.onMapLoaded = function() {
  _Scene_Map_onMapLoaded.call(this);
  recalcAllMoods();
};


// ═══════════════════════════════════════════════════════════════════
//  9. 전역 노출
// ═══════════════════════════════════════════════════════════════════

window.Game_GridInventory = Game_GridInventory;
window.GridInventory = {
  getGridSize: getGridSize,
  GRID_COLS:   GRID_COLS,
  GRID_ROWS:   GRID_ROWS,
  HOTKEY_SLOTS: HOTKEY_SLOTS,
  // 관계 시스템 v2
  BOND_TAGS:      BOND_TAGS,
  BOND_MODIFIERS: BOND_MODIFIERS,
  COMPLIANCE_BONUS: COMPLIANCE_BONUS,
  recalcAllMoods: recalcAllMoods,
  decayAllImpressions: decayAllImpressions
};

})();
