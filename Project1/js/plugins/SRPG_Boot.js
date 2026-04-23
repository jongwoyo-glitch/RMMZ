//=============================================================================
// SRPG_Boot.js — Bootstrap safety patch for SRPG_Core
//=============================================================================

/*:
 * @target MZ
 * @plugindesc SRPG Core safety patch - error recovery, command fallback, debug overlay.
 * @author RMMZStudio
 *
 * @help This plugin MUST be placed AFTER SRPG_Core in the plugin list.
 *
 * @command StartBattle
 * @text Start SRPG Battle
 * @desc Starts the SRPG grid battle.
 *
 * @command EndBattle
 * @text End SRPG Battle
 * @desc Ends the SRPG grid battle.
 */

(function() {
    "use strict";

    var pluginName = "SRPG_Boot";
    var SM = window.SrpgManager;

    if (!SM) {
        console.error("[SRPG_Boot] SrpgManager not found! SRPG_Core must load first.");
        return;
    }

    // =========================================================================
    //  0. Anti-Throttle via Web Worker (for iframe/background tab only)
    // =========================================================================
    (function installAntiThrottle() {
        var workerBlob = new Blob([
            "var tid=null;self.onmessage=function(e){" +
            "if(e.data==='start'&&!tid){tid=setInterval(function(){self.postMessage('t')},16)}" +
            "else if(e.data==='stop'&&tid){clearInterval(tid);tid=null}};"
        ], { type: "application/javascript" });
        var worker = null, workerActive = false, lastFC = 0;
        function startW() {
            if (workerActive) return;
            try {
                worker = new Worker(URL.createObjectURL(workerBlob));
                worker.onmessage = function() {
                    if (SceneManager._scene) SceneManager.update(1/60);
                };
                worker.postMessage("start");
                workerActive = true;
            } catch(e) {}
        }
        function stopW() {
            if (!workerActive||!worker) return;
            worker.postMessage("stop"); worker.terminate();
            worker = null; workerActive = false;
        }
        function check() {
            var fc = Graphics.frameCount, d = fc - lastFC; lastFC = fc;
            if (d < 20 && !workerActive) startW();
            if (d > 100 && workerActive) stopW();
        }
        setTimeout(function() { lastFC = Graphics.frameCount; setInterval(check, 2000); }, 3000);
        document.addEventListener("visibilitychange", function() {
            if (document.hidden && !workerActive) startW();
        });
    })();

    // =========================================================================
    //  1. Targeted Section Profiler (no per-sprite wrapping)
    // =========================================================================
    var _prof = {
        sceneTotal: 0,
        uiUpdate: 0,
        spritesetUp: 0,
        samples: 0,
        avgScene: 0,
        avgUI: 0,
        avgSpriteset: 0,
    };

    // Wrap SrpgUI.update to time it
    var _origSrpgUIUpdate = null;
    if (typeof SrpgUI !== "undefined" && SrpgUI.update) {
        _origSrpgUIUpdate = SrpgUI.update.bind(SrpgUI);
        SrpgUI.update = function() {
            var t0 = performance.now();
            _origSrpgUIUpdate();
            _prof.uiUpdate += performance.now() - t0;
        };
    }

    // Wrap Spriteset_Map.prototype.update to time total sprite rendering
    if (!Spriteset_Map.prototype._srpgBootProfPatched) {
        var _Spriteset_Map_update = Spriteset_Map.prototype.update;
        Spriteset_Map.prototype.update = function() {
            if (SM._battleActive) {
                var t0 = performance.now();
                _Spriteset_Map_update.call(this);
                _prof.spritesetUp += performance.now() - t0;
            } else {
                _Spriteset_Map_update.call(this);
            }
        };
        Spriteset_Map.prototype._srpgBootProfPatched = true;
    }

    // =========================================================================
    //  2. State Transition Logger — 상태 전환 추적
    // =========================================================================
    var _lastLogPhase = "", _lastLogSub = "";
    function logStateChange(context) {
        var p = SM._phase, s = SM._subPhase;
        if (p !== _lastLogPhase || s !== _lastLogSub) {
            var uName = SM._currentUnit ? SM._currentUnit.name : "null";
            console.log("[SM:STATE] " + _lastLogPhase + "/" + _lastLogSub +
                        " → " + p + "/" + s +
                        " (unit=" + uName + ")" +
                        (context ? " [" + context + "]" : ""));
            _lastLogPhase = p;
            _lastLogSub = s;
        }
    }

    // Patch SM.update to log state changes
    var _origSMUpdate = SM.update.bind(SM);
    SM.update = function() {
        _origSMUpdate();
        logStateChange("update");
    };

    // Patch key methods to log transitions
    var _origOpenActionMenu = SM._openActionMenu.bind(SM);
    SM._openActionMenu = function() {
        console.log("[SM:MENU] _openActionMenu called. unit=" +
            (this._currentUnit ? this._currentUnit.name : "null"));
        _origOpenActionMenu();
        console.log("[SM:MENU] radialItems=" +
            (this._radialItems ? this._radialItems.length + " items" : "null"));
    };

    var _origFinishDeploy = SM._finishDeployment.bind(SM);
    SM._finishDeployment = function() {
        console.log("[SM:DEPLOY] _finishDeployment called");
        _origFinishDeploy();
        console.log("[SM:DEPLOY] After finish: phase=" + this._phase + " sub=" + this._subPhase);
    };

    var _origStartPhaseRound = SM._startPhaseRound.bind(SM);
    SM._startPhaseRound = function(idx) {
        console.log("[SM:PHASE] _startPhaseRound(" + idx + ") team=" + this._phaseTeam +
            " units=" + (this._phaseRounds && this._phaseRounds[idx] ?
                this._phaseRounds[idx].map(function(u){return u.name}).join(",") : "?"));
        _origStartPhaseRound(idx);
        console.log("[SM:PHASE] After start: phase=" + this._phase + " sub=" + this._subPhase);
    };

    var _origHandleBrowse = SM._handleBrowse.bind(SM);
    SM._handleBrowse = function() {
        var prevSub = this._subPhase;
        _origHandleBrowse();
        if (this._subPhase !== prevSub) {
            console.log("[SM:BROWSE] subPhase changed: " + prevSub + " → " + this._subPhase +
                " unit=" + (this._currentUnit ? this._currentUnit.name : "null"));
        }
    };

    var _origHandleAwait = SM._handleAwaitCommand.bind(SM);
    SM._handleAwaitCommand = function() {
        var prevSub = this._subPhase;
        _origHandleAwait();
        if (this._subPhase !== prevSub) {
            console.log("[SM:AWAIT] subPhase changed: " + prevSub + " → " + this._subPhase +
                " unit=" + (this._currentUnit ? this._currentUnit.name : "null"));
        }
    };

    // =========================================================================
    //  3. Debug Overlay
    // =========================================================================
    var _lastError = "", _errorCount = 0, _debugDiv = null;
    var _fpsFrames = 0, _fpsLast = performance.now(), _fpsDisplay = 0;

    function ensureDebugDiv() {
        if (_debugDiv && document.body.contains(_debugDiv)) return _debugDiv;
        _debugDiv = document.createElement("div");
        _debugDiv.id = "srpg-debug";
        _debugDiv.style.cssText =
            "position:fixed;top:0;left:0;right:0;z-index:99999;" +
            "background:rgba(0,0,0,0.85);color:#0f0;font:bold 12px monospace;" +
            "padding:4px 8px;pointer-events:none;white-space:pre-wrap;";
        document.body.appendChild(_debugDiv);
        return _debugDiv;
    }

    function updateDebugOverlay() {
        _fpsFrames++;
        var now = performance.now();
        if (now - _fpsLast >= 1000) {
            _fpsDisplay = _fpsFrames;
            _fpsFrames = 0;
            _fpsLast = now;
        }

        _prof.samples++;
        if (_prof.samples >= 60) {
            _prof.avgScene = (_prof.sceneTotal / _prof.samples).toFixed(1);
            _prof.avgUI = (_prof.uiUpdate / _prof.samples).toFixed(1);
            _prof.avgSpriteset = (_prof.spritesetUp / _prof.samples).toFixed(1);
            _prof.sceneTotal = 0;
            _prof.uiUpdate = 0;
            _prof.spritesetUp = 0;
            _prof.samples = 0;
        }

        var d = ensureDebugDiv();
        var uName = SM._currentUnit ? SM._currentUnit.name : "null";
        var browseU = SM._browseUnit ? SM._browseUnit.name : "null";
        var t = "[SM] FPS=" + _fpsDisplay;
        t += " phase=" + SM._phase;
        t += " sub=" + SM._subPhase;
        t += " unit=" + uName;
        t += " browse=" + browseU + "\n";
        t += "[PROF] scene=" + _prof.avgScene + "ms";
        t += " spriteset=" + _prof.avgSpriteset + "ms";
        t += " srpgUI=" + _prof.avgUI + "ms";
        if (_lastError) {
            t += "\n[ERR x" + _errorCount + "] " + _lastError;
        }
        d.textContent = t;
    }

    // =========================================================================
    //  4. Plugin Commands
    // =========================================================================
    var cmdKey = "SRPG_Core:StartBattle";
    if (!PluginManager._commands[cmdKey]) {
        PluginManager.registerCommand("SRPG_Core", "StartBattle", function() { SM.startBattle(); });
        PluginManager.registerCommand("SRPG_Core", "EndBattle", function() { SM.endBattle(); });
    }
    PluginManager.registerCommand(pluginName, "StartBattle", function() { SM.startBattle(); });
    PluginManager.registerCommand(pluginName, "EndBattle", function() { SM.endBattle(); });

    // =========================================================================
    //  5. Scene_Map.update — error logging (NEVER swallow errors)
    // =========================================================================
    if (!Scene_Map.prototype._srpgBootPatched) {
        var _Scene_Map_update = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            if (SM._battleActive) {
                var t0 = performance.now();
                try {
                    _Scene_Map_update.call(this);
                } catch (e) {
                    _lastError = e.message + " @ " + (e.stack || "").split("\n")[1];
                    _errorCount++;
                    console.error("[SRPG_Boot] Scene_Map.update error #" + _errorCount + ":", e.message, e.stack);
                    // ALWAYS re-throw — never swallow errors
                    throw e;
                }
                _prof.sceneTotal += performance.now() - t0;
                updateDebugOverlay();
            } else {
                _Scene_Map_update.call(this);
            }
        };
        Scene_Map.prototype._srpgBootPatched = true;
    }

    console.log("[SRPG_Boot] Patches applied (profiler + stateLogger + debug + anti-throttle).");
})();
