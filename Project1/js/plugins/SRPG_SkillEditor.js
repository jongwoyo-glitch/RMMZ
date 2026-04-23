/*:
 * @target MZ
 * @plugindesc SRPG Skill Editor - note tag summary panel and visual editor popup
 * @author RMMZStudio
 *
 * @help SRPG_SkillEditor.js
 *
 * === Game Runtime ===
 * Registers SrpgPhaseParser globally for phase-based skill execution.
 *
 * === Editor Integration (NW.js) ===
 * Injects a summary panel below Note textareas showing:
 *   - Phase flow diagram (colour-coded atom badges)
 *   - Reach / Area minimaps (Canvas)
 *   - One-line summary text
 *   - [🔧 스킬 설계] button → opens tools/skill_editor.html popup
 *
 * How to load in RMMZ Editor:
 *   Method 1 — DevTools (F12) console:
 *     require('./js/plugins/SRPG_SkillEditor.js')
 *
 *   Method 2 — package.json:
 *     "inject_js_start": "js/plugins/SRPG_SkillEditor.js"
 *
 *   Method 3 — editor index.html:
 *     <script src="js/plugins/SRPG_SkillEditor.js"></script>
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // 1. PARSER LOADING
  // ══════════════════════════════════════════════════════════
  var Parser = null;

  // Try require (NW.js / Node)
  if (typeof require === 'function') {
    try {
      var _path = require('path');
      var _base = (typeof nw !== 'undefined' && nw.App) ? nw.App.startPath : process.cwd();
      Parser = require(_path.join(_base, 'js', 'plugins', 'src', 'srpgPhaseParser.js'));
    } catch (_e1) {
      try { Parser = require('./js/plugins/src/srpgPhaseParser.js'); } catch (_e2) { /* noop */ }
    }
  }
  // Fallback: global
  if (!Parser && typeof window !== 'undefined' && window.SrpgPhaseParser) {
    Parser = window.SrpgPhaseParser;
  }
  if (!Parser) {
    console.warn('[SRPG_SkillEditor] srpgPhaseParser.js not found. Features disabled.');
    return;
  }
  if (typeof window !== 'undefined') window.SrpgPhaseParser = Parser;

  // ══════════════════════════════════════════════════════════
  // 2. ENVIRONMENT DETECTION
  // ══════════════════════════════════════════════════════════
  var isGameRuntime = typeof SceneManager !== 'undefined';
  var isNwjs = (typeof nw !== 'undefined') ||
               (typeof process !== 'undefined' && process.versions && process.versions.nw);

  if (isGameRuntime) {
    console.log('[SRPG_SkillEditor] Game runtime — SrpgPhaseParser registered.');
    return;
  }
  if (!isNwjs) return; // browser standalone → nothing to inject

  console.log('[SRPG_SkillEditor] Editor mode — injecting summary panel …');

  // ══════════════════════════════════════════════════════════
  // 3. CONSTANTS
  // ══════════════════════════════════════════════════════════
  var CAT_COLORS = {
    movement: '#4fc3f7', offense: '#ef5350',
    placement: '#ab47bc', reaction: '#ffa726'
  };
  var ATOM_CATS = {
    dash:'movement', push:'movement', pull:'movement', escape:'movement',
    leap:'movement', swap:'movement', throw:'movement',
    hit:'offense', proj:'offense', chain:'offense', multi:'offense', dot:'offense',
    summon:'placement', terrain:'placement', trap:'placement',
    counter:'reaction', interrupt:'reaction', reflect:'reaction', trigger:'reaction'
  };

  // ══════════════════════════════════════════════════════════
  // 4. CSS INJECTION
  // ══════════════════════════════════════════════════════════
  var style = document.createElement('style');
  style.textContent = [
    '.srpg-panel{margin-top:4px;padding:6px 8px;background:#1e1e2e;border:1px solid #444;border-radius:4px;font-family:Consolas,"Malgun Gothic",monospace;font-size:12px;color:#ccc}',
    '.srpg-panel-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}',
    '.srpg-panel-title{font-weight:bold;color:#aaa;font-size:11px}',
    '.srpg-edit-btn{padding:2px 10px;background:#3a3a5a;border:1px solid #666;border-radius:3px;color:#eee;cursor:pointer;font-size:12px}',
    '.srpg-edit-btn:hover{background:#5a5a8a}',
    '.srpg-panel-body{display:flex;gap:8px;align-items:flex-start}',
    '.srpg-mm{flex-shrink:0;text-align:center}',
    '.srpg-mm canvas{border:1px solid #555;border-radius:2px}',
    '.srpg-mm-lbl{font-size:9px;color:#888;margin-top:1px}',
    '.srpg-flow{flex:1;min-width:0}',
    '.srpg-chain{display:flex;flex-wrap:wrap;gap:2px;align-items:center;margin-bottom:3px}',
    '.srpg-atom{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;color:#fff;white-space:nowrap}',
    '.srpg-arrow{color:#666;font-size:10px;margin:0 1px}',
    '.srpg-summ{font-size:11px;color:#999;margin-top:2px}',
    '.srpg-opts{font-size:10px;color:#77aacc;margin-top:1px}'
  ].join('\n');
  document.head.appendChild(style);

  // ══════════════════════════════════════════════════════════
  // 5. MINIMAP RENDERER
  // ══════════════════════════════════════════════════════════
  function drawMini(canvas, coords, color, showCenter) {
    var ctx = canvas.getContext('2d');
    var N = 7, ts = Math.floor(canvas.width / N);
    var cx = Math.floor(N / 2), cy = Math.floor(N / 2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // grid background
    for (var gx = 0; gx < N; gx++) {
      for (var gy = 0; gy < N; gy++) {
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#2a2a3a' : '#222233';
        ctx.fillRect(gx * ts, gy * ts, ts, ts);
      }
    }
    // tiles
    if (coords && coords.length) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = color || '#4488cc';
      coords.forEach(function (c) {
        var px = cx + c.dx, py = cy + c.dy;
        if (px >= 0 && px < N && py >= 0 && py < N) {
          ctx.fillRect(px * ts + 0.5, py * ts + 0.5, ts - 1, ts - 1);
        }
      });
      ctx.globalAlpha = 1;
    }
    // center
    if (showCenter) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = (ts - 1) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2605', cx * ts + ts / 2, cy * ts + ts / 2);
    }
    // grid lines
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(i * ts, 0); ctx.lineTo(i * ts, N * ts); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * ts); ctx.lineTo(N * ts, i * ts); ctx.stroke();
    }
  }

  // ══════════════════════════════════════════════════════════
  // 6. FLOW CHAIN RENDERER
  // ══════════════════════════════════════════════════════════
  function renderChain(container, phases) {
    container.innerHTML = '';
    if (!phases || !phases.length) {
      container.innerHTML = '<span style="color:#666">(Phase \uc5c6\uc74c)</span>';
      return;
    }
    phases.forEach(function (p, i) {
      if (i > 0) {
        var ar = document.createElement('span');
        ar.className = 'srpg-arrow';
        ar.textContent = '\u2192';
        container.appendChild(ar);
      }
      var b = document.createElement('span');
      b.className = 'srpg-atom';
      b.style.background = CAT_COLORS[ATOM_CATS[p.type] || 'offense'] || '#666';
      var lbl = (Parser.ATOM_LABELS[p.type] || p.type);
      if (p['if']) lbl += ' \u26a1';
      if (p.repeat && p.repeat > 1) lbl += ' \u00d7' + p.repeat;
      b.textContent = lbl;
      b.title = JSON.stringify(p, null, 1);
      container.appendChild(b);
    });
  }

  // ══════════════════════════════════════════════════════════
  // 7. PANEL CREATE / UPDATE
  // ══════════════════════════════════════════════════════════
  var panelMap = new WeakMap();  // textarea → panel DOM
  var prevNotes = new WeakMap(); // textarea → last note string (skip redundant updates)

  function createPanel(ta) {
    var panel = document.createElement('div');
    panel.className = 'srpg-panel';

    // header
    var hdr = document.createElement('div');
    hdr.className = 'srpg-panel-hdr';
    var ttl = document.createElement('span');
    ttl.className = 'srpg-panel-title';
    ttl.textContent = 'SRPG Skill';
    var btn = document.createElement('button');
    btn.className = 'srpg-edit-btn';
    btn.textContent = '\ud83d\udd27 \uc2a4\ud0ac \uc124\uacc4';
    btn.onclick = function () { openPopup(ta); };
    hdr.appendChild(ttl);
    hdr.appendChild(btn);
    panel.appendChild(hdr);

    // body
    var body = document.createElement('div');
    body.className = 'srpg-panel-body';

    // reach minimap
    var rmm = document.createElement('div'); rmm.className = 'srpg-mm';
    var rcv = document.createElement('canvas'); rcv.width = 56; rcv.height = 56;
    rmm.appendChild(rcv);
    var rlbl = document.createElement('div'); rlbl.className = 'srpg-mm-lbl'; rlbl.textContent = '\uc0ac\uac70\ub9ac';
    rmm.appendChild(rlbl);
    body.appendChild(rmm);

    // area minimap
    var amm = document.createElement('div'); amm.className = 'srpg-mm';
    var acv = document.createElement('canvas'); acv.width = 56; acv.height = 56;
    amm.appendChild(acv);
    var albl = document.createElement('div'); albl.className = 'srpg-mm-lbl'; albl.textContent = '\ubc94\uc704';
    amm.appendChild(albl);
    body.appendChild(amm);

    // flow
    var flow = document.createElement('div'); flow.className = 'srpg-flow';
    var chain = document.createElement('div'); chain.className = 'srpg-chain';
    flow.appendChild(chain);
    var summ = document.createElement('div'); summ.className = 'srpg-summ';
    flow.appendChild(summ);
    var opts = document.createElement('div'); opts.className = 'srpg-opts';
    flow.appendChild(opts);
    body.appendChild(flow);

    panel.appendChild(body);

    // store refs
    panel._rcv = rcv;
    panel._acv = acv;
    panel._chain = chain;
    panel._summ = summ;
    panel._opts = opts;

    // insert into DOM
    ta.parentNode.insertBefore(panel, ta.nextSibling);
    panelMap.set(ta, panel);

    // watch input
    ta.addEventListener('input', function () { updatePanel(ta); });

    // initial
    updatePanel(ta);
    return panel;
  }

  function updatePanel(ta) {
    var panel = panelMap.get(ta);
    if (!panel) return;
    var note = ta.value || '';
    // skip if unchanged
    if (prevNotes.get(ta) === note) return;
    prevNotes.set(ta, note);

    var phases = Parser.parsePhases(note);
    var reach  = Parser.parseReach(note);
    var area   = Parser.parseArea(note);
    var optObj = Parser.parseOptions(note);
    var legacy = Parser.parseLegacyProj(note);

    // minimaps
    drawMini(panel._rcv, reach.coords, '#4488cc', true);
    drawMini(panel._acv, area, '#cc4444', false);

    // flow chain
    renderChain(panel._chain, phases);

    // summary line
    var parts = [];
    parts.push(Parser.summarizePhases(phases));
    if (reach.mode === 'range') parts.push('\uc0ac\uac70\ub9ac:' + reach.rangeN);
    else if (reach.coords.length) parts.push('\uc0ac\uac70\ub9ac:\ucee4\uc2a4\ud140(' + reach.coords.length + '\uce78)');
    if (area.length) parts.push('\ubc94\uc704:' + area.length + '\uce78');
    if (legacy) parts.push('\ud22c\uc0ac\uccb4:' + (legacy.srpgProjectile || 'yes'));
    panel._summ.textContent = parts.join(' | ');

    // options line
    var optParts = [];
    if (optObj.rotate)     optParts.push('\ud68c\uc804');
    if (optObj.selfTarget) optParts.push('\uc790\uac00\ub300\uc0c1');
    panel._opts.textContent = optParts.length ? '\u2699 ' + optParts.join(', ') : '';
  }

  // ══════════════════════════════════════════════════════════
  // 8. POPUP MANAGEMENT
  // ══════════════════════════════════════════════════════════
  var curPopup = null;
  var curTA = null;

  function openPopup(ta) {
    curTA = ta;
    var url = 'tools/skill_editor.html';
    try {
      var fs   = require('fs');
      var path = require('path');
      var base = (typeof nw !== 'undefined' && nw.App) ? nw.App.startPath : process.cwd();
      var full = path.join(base, 'tools', 'skill_editor.html');
      if (fs.existsSync(full)) url = 'file:///' + full.replace(/\\/g, '/');
    } catch (_e) { /* use relative */ }

    var w = 1200, h = 850;
    var lf = Math.max(0, Math.round((screen.width - w) / 2));
    var tp = Math.max(0, Math.round((screen.height - h) / 2));

    curPopup = window.open(url, 'srpg_skill_editor',
      'width=' + w + ',height=' + h + ',left=' + lf + ',top=' + tp +
      ',menubar=no,toolbar=no,status=no,resizable=yes');

    if (curPopup) {
      var send = function () {
        var note = ta.value || '';
        var name = extractSkillName() || '';
        try {
          curPopup.postMessage({ type: 'srpgSkillLoad', note: note, name: name }, '*');
        } catch (_e) { /* popup may have closed */ }
      };
      // fire after popup loads
      try { curPopup.addEventListener('load', function () { setTimeout(send, 300); }); } catch (_e) { /* noop */ }
      setTimeout(send, 1500); // fallback
    }
  }

  function extractSkillName() {
    var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var prev = inp.previousElementSibling;
      if (prev && /\u540d\u524d|Name|\uc774\ub984/.test(prev.textContent)) return inp.value;
      var par = inp.parentElement;
      if (par) {
        var ls = par.querySelectorAll('label');
        for (var j = 0; j < ls.length; j++) {
          if (/\u540d\u524d|Name|\uc774\ub984/.test(ls[j].textContent)) return inp.value;
        }
      }
    }
    return '';
  }

  // ══════════════════════════════════════════════════════════
  // 9. postMessage RECEIVER
  // ══════════════════════════════════════════════════════════
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'srpgSkillSave') return;
    if (!curTA) return;

    curTA.value = e.data.note || '';

    // fire events so the editor detects the change
    ['input', 'change'].forEach(function (evtName) {
      curTA.dispatchEvent(new Event(evtName, { bubbles: true }));
    });

    updatePanel(curTA);
    console.log('[SRPG_SkillEditor] Note updated from popup editor.');
  });

  // ══════════════════════════════════════════════════════════
  // 10. DOM OBSERVER — textarea 탐지 + 패널 부착
  // ══════════════════════════════════════════════════════════
  function scanTextareas() {
    var tas = document.querySelectorAll('textarea');
    for (var i = 0; i < tas.length; i++) {
      var ta = tas[i];
      if (panelMap.has(ta)) {
        // existing — just refresh
        var prev = prevNotes.get(ta);
        if (prev !== ta.value) updatePanel(ta);
        continue;
      }
      // decide if this looks like a Note field
      var isNote = false;
      if (/<srpg/i.test(ta.value)) isNote = true;
      if (ta.rows >= 4 || ta.clientHeight >= 80) isNote = true;
      // label heuristic
      var sib = ta.previousElementSibling;
      if (sib && /Note|\u30e1\u30e2|\ub178\ud2b8|\u5099\u8003/.test(sib.textContent)) isNote = true;
      if (ta.parentElement) {
        var txt = (ta.parentElement.textContent || '').substring(0, 30);
        if (/Note|\u30e1\u30e2|\ub178\ud2b8/.test(txt)) isNote = true;
      }
      if (isNote) createPanel(ta);
    }
  }

  var obs = new MutationObserver(function (muts) {
    var need = false;
    for (var i = 0; i < muts.length; i++) { if (muts[i].addedNodes.length) { need = true; break; } }
    if (need) {
      clearTimeout(obs._t);
      obs._t = setTimeout(scanTextareas, 300);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // periodic fallback (every 2 s)
  setInterval(scanTextareas, 2000);

  // initial scan
  setTimeout(scanTextareas, 500);

  console.log('[SRPG_SkillEditor] Editor integration active. Watching for Note textareas.');
})();
