/**
 * srpgPhaseParser.js — SRPG 스킬 Phase 노트태그 파서/직렬화 모듈
 *
 * 레이어 C: HTML 팝업 에디터(B)와 RMMZ 에디터 플러그인(A), 게임 런타임 세 곳에서 공유.
 * UMD 래퍼로 브라우저 전역(window.SrpgPhaseParser) / Node require 양쪽 사용 가능.
 *
 * 주요 API:
 *   parsePhases(noteText)         → [{type, ...params}]
 *   serializePhases(phaseArray)   → "<srpgPhase:...>\n..."
 *   parseReach(noteText)          → [{dx, dy}, ...]
 *   parseArea(noteText)           → [{dx, dy}, ...]
 *   serializeReach(coords)        → "<srpgReach:...>"
 *   serializeArea(coords)         → "<srpgArea:...>"
 *   parseOptions(noteText)        → {rotate:bool, selfTarget:bool}
 *   parseLegacyProj(noteText)     → {projType, image, ...}
 *   mergeIntoNote(origNote, {phases, reach, area, options}) → merged text
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SrpgPhaseParser = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── helpers ──────────────────────────────────────────────
  function tryNum(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }

  function splitOnce(str, sep) {
    const i = str.indexOf(sep);
    return i < 0 ? [str, ''] : [str.slice(0, i), str.slice(i + 1)];
  }

  // ── Phase 파싱 ──────────────────────────────────────────

  const PHASE_RE = /<srpgPhase:([^>]+)>/gi;

  /**
   * 노트 텍스트에서 <srpgPhase:...> 태그를 모두 추출하여 JSON 배열로 반환.
   * @param {string} noteText
   * @returns {Array<Object>}
   */
  function parsePhases(noteText) {
    if (!noteText) return [];
    const phases = [];
    let m;
    PHASE_RE.lastIndex = 0;
    while ((m = PHASE_RE.exec(noteText)) !== null) {
      const tokens = m[1].split('|');
      const phase = { type: tokens[0] };
      for (let i = 1; i < tokens.length; i++) {
        const [key, val] = splitOnce(tokens[i], ':');
        if (!key) continue;
        if (val === '') {
          phase[key] = true; // flag-only, e.g. "heal" → heal:true
        } else if (val.indexOf(',') >= 0 && !/^\d+\.\d+$/.test(val)) {
          // comma-separated → array (but not decimal like "0.8")
          phase[key] = val.split(',').map(v => tryNum(v.trim()));
        } else {
          phase[key] = tryNum(val);
        }
      }
      phases.push(phase);
    }
    return phases;
  }

  /**
   * Phase JSON 배열을 노트태그 텍스트로 직렬화.
   * @param {Array<Object>} phases
   * @returns {string}
   */
  function serializePhases(phases) {
    if (!phases || !phases.length) return '';
    return phases.map(function (p) {
      const parts = [p.type];
      Object.keys(p).forEach(function (k) {
        if (k === 'type') return;
        var v = p[k];
        if (v === true) { parts.push(k); return; }
        if (v === false) return; // skip false flags
        if (Array.isArray(v)) { parts.push(k + ':' + v.join(',')); return; }
        parts.push(k + ':' + v);
      });
      return '<srpgPhase:' + parts.join('|') + '>';
    }).join('\n');
  }

  // ── Reach / Area 파싱 ───────────────────────────────────

  const REACH_RE = /<srpgReach:([^>]+)>/i;
  const RANGE_RE = /<srpgRange:(\d+)>/i;
  const AREA_RE = /<srpgArea:([^>]+)>/i;

  /**
   * 좌표 문자열 "dx,dy|dx,dy|..." → [{dx,dy}, ...]
   */
  function parseCoordStr(str) {
    return str.split('|').map(function (pair) {
      var parts = pair.split(',').map(Number);
      return { dx: parts[0] || 0, dy: parts[1] || 0 };
    });
  }

  /**
   * 좌표 배열 → "dx,dy|dx,dy|..."
   */
  function serializeCoords(coords) {
    return coords.map(function (c) { return c.dx + ',' + c.dy; }).join('|');
  }

  /**
   * 반지름 N의 맨해튼 다이아몬드 좌표 생성 (0,0 제외 — 시전자 위치).
   * 사거리이므로 원점은 포함하지 않음.
   */
  function diamondCoords(radius) {
    var coords = [];
    for (var dx = -radius; dx <= radius; dx++) {
      for (var dy = -radius; dy <= radius; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (Math.abs(dx) + Math.abs(dy) <= radius) {
          coords.push({ dx: dx, dy: dy });
        }
      }
    }
    return coords;
  }

  /**
   * 노트에서 사거리 정보를 추출.
   * srpgReach → 커스텀 좌표, srpgRange → 다이아몬드 자동생성.
   * @returns {{ coords: Array, mode: 'reach'|'range'|'none', rangeN: number|null }}
   */
  function parseReach(noteText) {
    if (!noteText) return { coords: [], mode: 'none', rangeN: null };
    var m = REACH_RE.exec(noteText);
    if (m) return { coords: parseCoordStr(m[1]), mode: 'reach', rangeN: null };
    m = RANGE_RE.exec(noteText);
    if (m) {
      var n = parseInt(m[1], 10);
      return { coords: diamondCoords(n), mode: 'range', rangeN: n };
    }
    return { coords: [], mode: 'none', rangeN: null };
  }

  /**
   * 노트에서 효과범위(Area) 정보를 추출.
   * @returns {Array<{dx,dy}>}
   */
  function parseArea(noteText) {
    if (!noteText) return [];
    var m = AREA_RE.exec(noteText);
    return m ? parseCoordStr(m[1]) : [];
  }

  function serializeReach(coords, mode, rangeN) {
    if (mode === 'range' && rangeN != null) return '<srpgRange:' + rangeN + '>';
    if (!coords || !coords.length) return '';
    return '<srpgReach:' + serializeCoords(coords) + '>';
  }

  function serializeArea(coords) {
    if (!coords || !coords.length) return '';
    return '<srpgArea:' + serializeCoords(coords) + '>';
  }

  // ── Options 파싱 ────────────────────────────────────────

  function parseOptions(noteText) {
    if (!noteText) return { rotate: false, selfTarget: false };
    return {
      rotate: /<srpgRotate>/i.test(noteText),
      selfTarget: /<srpgSelfTarget>/i.test(noteText)
    };
  }

  function serializeOptions(opts) {
    var lines = [];
    if (opts.rotate) lines.push('<srpgRotate>');
    if (opts.selfTarget) lines.push('<srpgSelfTarget>');
    return lines.join('\n');
  }

  // ── Legacy Projectile 파싱 ──────────────────────────────

  var PROJ_TAGS = [
    'srpgProjectile', 'srpgProjImage', 'srpgProjFrameW', 'srpgProjFrameH',
    'srpgProjFrames', 'srpgProjFrameSpeed', 'srpgProjSpeed', 'srpgProjScale',
    'srpgProjRotate', 'srpgProjTrail', 'srpgProjTrailAlpha',
    'srpgProjImpactAnim', 'srpgProjImpactSe',
    'srpgArcHeight', 'srpgArcLaunchSpeed', 'srpgArcFlightSpeed', 'srpgArcFallSpeed',
    'srpgCameraPan', 'srpgScatterRadius', 'srpgWarningDuration',
    'srpgBeamStart', 'srpgBeamMid', 'srpgBeamEnd',
    'srpgBeamDuration', 'srpgBeamWidth', 'srpgHitCount', 'srpgHitInterval'
  ];

  function parseLegacyProj(noteText) {
    if (!noteText) return null;
    var result = {};
    var found = false;
    PROJ_TAGS.forEach(function (tag) {
      var re = new RegExp('<' + tag + ':([^>]+)>', 'i');
      var m = re.exec(noteText);
      if (m) { result[tag] = tryNum(m[1]); found = true; }
    });
    return found ? result : null;
  }

  function serializeLegacyProj(proj) {
    if (!proj) return '';
    return Object.keys(proj).map(function (k) {
      return '<' + k + ':' + proj[k] + '>';
    }).join('\n');
  }

  // ── mergeIntoNote ───────────────────────────────────────

  /**
   * 기존 노트 텍스트에서 관리 대상 태그만 교체하고, 나머지는 보존.
   * @param {string} origNote - 원본 노트 텍스트
   * @param {Object} data - { phases, reach:{coords,mode,rangeN}, area, options, legacyProj }
   * @returns {string} - 병합된 노트 텍스트
   */
  function mergeIntoNote(origNote, data) {
    var note = origNote || '';

    // 관리 대상 태그 목록 (제거 후 재생성)
    var managedPatterns = [
      /<srpgPhase:[^>]*>\s*/gi,
      /<srpgReach:[^>]*>\s*/gi,
      /<srpgRange:\d+>\s*/gi,
      /<srpgArea:[^>]*>\s*/gi,
      /<srpgRotate>\s*/gi,
      /<srpgSelfTarget>\s*/gi
    ];

    // 기존 관리 태그 제거
    managedPatterns.forEach(function (pat) {
      note = note.replace(pat, '');
    });

    // 레거시 투사체 태그도 관리 대상이면 제거 후 재생성
    if (data.legacyProj !== undefined) {
      PROJ_TAGS.forEach(function (tag) {
        var re = new RegExp('<' + tag + ':[^>]*>\\s*', 'gi');
        note = note.replace(re, '');
      });
    }

    note = note.replace(/\n{3,}/g, '\n\n').trim();

    // 새 태그 생성
    var newParts = [];

    if (data.phases && data.phases.length) {
      newParts.push(serializePhases(data.phases));
    }

    if (data.reach) {
      var reachStr = serializeReach(data.reach.coords, data.reach.mode, data.reach.rangeN);
      if (reachStr) newParts.push(reachStr);
    }

    if (data.area && data.area.length) {
      newParts.push(serializeArea(data.area));
    }

    if (data.options) {
      var optStr = serializeOptions(data.options);
      if (optStr) newParts.push(optStr);
    }

    if (data.legacyProj) {
      newParts.push(serializeLegacyProj(data.legacyProj));
    }

    var newBlock = newParts.join('\n');
    return note ? (note + '\n' + newBlock) : newBlock;
  }

  // ── 요약 텍스트 생성 (요약 패널용) ─────────────────────

  var ATOM_LABELS = {
    dash: '돌진', push: '밀침', pull: '끌어당김', throw: '넘기기',
    swap: '교환', escape: '이탈', leap: '도약',
    hit: '타격', proj: '투사체', chain: '전파', multi: '다중지정', dot: '지속뎀',
    summon: '소환', terrain: '지형변형', trap: '함정',
    counter: '카운터', interrupt: '차단', reflect: '반사', trigger: '조건발동'
  };

  var PATH_LABELS = { line: '직선', arc: '포물선', jump: '점프' };
  var STOP_LABELS = { adjacent: '인접', on: '위', behind: '뒤' };
  var DIR_LABELS = { away: '후방', side_L: '좌측', side_R: '우측', free: '자유' };

  /**
   * Phase 배열을 한 줄 요약 텍스트로 변환.
   * 예: "[돌진(직선→인접)] → [타격(AOE)] → [밀침(후방2)]"
   */
  function summarizePhases(phases) {
    if (!phases || !phases.length) return '(설정 없음)';
    return phases.map(function (p) {
      var label = ATOM_LABELS[p.type] || p.type;
      var details = [];

      if (p.type === 'dash' || p.type === 'leap') {
        if (p.path) details.push(PATH_LABELS[p.path] || p.path);
        if (p.stopAt) details.push('→' + (STOP_LABELS[p.stopAt] || p.stopAt));
      }
      if (p.type === 'push' || p.type === 'throw') {
        if (p.dir) details.push(DIR_LABELS[p.dir] || p.dir);
        if (p.dist) details.push(p.dist + '칸');
        if (p.casterFollow) details.push('추적');
      }
      if (p.type === 'pull') {
        if (p.dist) details.push(p.dist + '칸');
        if (p.stopAt) details.push('→' + (STOP_LABELS[p.stopAt] || p.stopAt));
      }
      if (p.type === 'hit') {
        if (p.area) details.push('AOE');
        if (p.heal) details.push('힐');
        if (p.targetTeam === 'ally') details.push('아군');
      }
      if (p.type === 'proj') {
        details.push(p.projType || p.type || '');
      }
      if (p.type === 'chain') {
        details.push('×' + (p.maxBounce || '?'));
        if (p.damageDecay && p.damageDecay > 1) details.push('증폭');
        if (p.splitCount && p.splitCount > 1) details.push(p.splitCount + '분기');
      }
      if (p.type === 'escape') {
        if (p.dest) details.push(p.dest === 'back' ? '후방' : p.dest);
        if (p.dist) details.push(p.dist + '칸');
      }
      if (p.type === 'terrain') {
        if (p.effect) details.push(p.effect);
        if (p.duration) details.push(p.duration + '턴');
      }
      if (p.type === 'multi') {
        details.push(p.count + '발');
      }

      var suffix = details.length ? '(' + details.join(',') + ')' : '';
      var cond = p['if'] ? ' if:' + p['if'] : '';
      var rep = (p.repeat && p.repeat > 1) ? ' ×' + p.repeat : '';
      return '[' + label + suffix + cond + rep + ']';
    }).join(' → ');
  }

  // ── Public API ──────────────────────────────────────────

  return {
    parsePhases: parsePhases,
    serializePhases: serializePhases,
    parseReach: parseReach,
    parseArea: parseArea,
    serializeReach: serializeReach,
    serializeArea: serializeArea,
    parseOptions: parseOptions,
    serializeOptions: serializeOptions,
    parseLegacyProj: parseLegacyProj,
    serializeLegacyProj: serializeLegacyProj,
    mergeIntoNote: mergeIntoNote,
    summarizePhases: summarizePhases,
    diamondCoords: diamondCoords,
    // constants for UI
    ATOM_LABELS: ATOM_LABELS,
    PATH_LABELS: PATH_LABELS,
    STOP_LABELS: STOP_LABELS,
    DIR_LABELS: DIR_LABELS
  };
}));
