//=============================================================================
// StandingManager.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Standing portrait DB with single-image and layered compositing modes
 * @author RMMZ Studio
 * @url
 *
 * @param emotionPresets
 * @text 감정 프리셋 목록
 * @desc 사용할 감정/상황 태그 목록 (쉼표 구분)
 * @type text
 * @default normal,sternness,indignation,anger,rage,disdain,aversion,disgust,revulsion,concern,anxiety,fear,terror,satisfaction,amusement,joy,laughter,dejection,melancholy,sadness,grief,alertness,wonder,surprise,shock,wounded,battle,event
 *
 * @param defaultSlots
 * @text 기본 레이어 슬롯
 * @desc 레이어 모드 기본 슬롯 (쉼표 구분, 아래→위 순서)
 * @type text
 * @default body,outfit,hair,expression,accessory
 *
 * @param portraits
 * @text 인물 초상화 DB (단일 모드)
 * @type struct<ActorPortrait>[]
 * @default []
 *
 * @param layered
 * @text 인물 레이어 DB
 * @type struct<LayeredActor>[]
 * @default []
 *
 * @param standingWidth
 * @text 스탠딩 기준 너비
 * @type number
 * @default 832
 *
 * @param standingHeight
 * @text 스탠딩 기준 높이
 * @type number
 * @default 1216
 *
 * @param situationRatios
 * @text 상황 이미지 비율 옵션
 * @desc 허용 비율 목록 (W:H, 쉼표 구분)
 * @type text
 * @default 1:1,3:2,2:3
 *
 * @help
 * ============================================================================
 * StandingManager - Standing Portrait DB with Layer Compositing
 * ============================================================================
 *
 * Two modes per actor:
 *   1. Single-image mode: one image per emotion tag (original)
 *   2. Layered mode: composite from multiple layer images
 *
 * --- Layer System ---
 * Layer slots (bottom to top): body, outfit, hair, expression, accessory
 * Each actor has "situations" (clothed, nude, battle, etc.)
 * Each situation defines which file goes on each layer slot.
 * Each situation has its own expression group.
 * Swapping emotion only replaces the expression layer within that situation.
 *
 * --- File naming ---
 * Layers: img/standing/{actorName}_{slot}_{situation}.png
 * Expressions: img/standing/{actorName}_expr_{situation}_{tag}.png
 *
 * --- Script API ---
 * StandingManager.getMode(actorId) -> "single" | "layered"
 *
 * StandingManager.getPortrait(actorId, tag)
 *   -> { file, face, mini } (single mode only)
 *
 * StandingManager.composeLayers(actorId, situation, expression)
 *   -> { layers:[{slot,file,offsetX,offsetY}...], face, mini }
 *
 * StandingManager.composeBitmap(actorId, situation, expression)
 *   -> Promise<Bitmap>
 *
 * StandingManager.getSituations(actorId) -> string[]
 * StandingManager.getExpressions(actorId, situation) -> string[]
 *
 * --- Emotion System (Scott McCloud) ---
 * 6 primary emotions x 4 intensity levels
 * ============================================================================
 */

/*~struct~ActorPortrait:
 * @param actorId
 * @text 액터 ID
 * @type actor
 * @default 1
 *
 * @param images
 * @text 이미지 목록
 * @type struct<PortraitImage>[]
 * @default []
 */

/*~struct~PortraitImage:
 * @param tag
 * @text 상황 태그
 * @type text
 * @default normal
 *
 * @param file
 * @text 이미지 파일
 * @type file
 * @dir img/standing
 * @default
 *
 * @param face
 * @text 얼굴 영역 (x,y,w,h)
 * @type text
 * @default 216,30,400,400
 *
 * @param mini
 * @text 미니 영역 (x,y,w,h)
 * @type text
 * @default 266,80,200,200
 */

/*~struct~LayeredActor:
 * @param actorId
 * @text 액터 ID
 * @type actor
 * @default 1
 *
 * @param slots
 * @text 레이어 슬롯 목록
 * @desc 아래→위 순서, 쉼표 구분 (비워두면 기본값 사용)
 * @type text
 * @default
 *
 * @param situations
 * @text 상황 그룹
 * @type struct<Situation>[]
 * @default []
 *
 * @param faceRect
 * @text 얼굴 영역 (x,y,w,h)
 * @desc 합성 결과 기준
 * @type text
 * @default 216,30,400,400
 *
 * @param miniRect
 * @text 미니 영역 (x,y,w,h)
 * @desc 합성 결과 기준
 * @type text
 * @default 266,80,200,200
 */

/*~struct~Situation:
 * @param name
 * @text 상황 이름
 * @type text
 * @default clothed
 *
 * @param layers
 * @text 레이어 파일 목록
 * @type struct<LayerFile>[]
 * @default []
 *
 * @param expressions
 * @text 표정 목록
 * @type struct<ExpressionFile>[]
 * @default []
 */

/*~struct~LayerFile:
 * @param slot
 * @text 슬롯 이름
 * @type text
 * @default body
 *
 * @param file
 * @text 이미지 파일
 * @type file
 * @dir img/standing
 * @default
 *
 * @param offsetX
 * @text X 오프셋
 * @type number
 * @min -9999
 * @default 0
 *
 * @param offsetY
 * @text Y 오프셋
 * @type number
 * @min -9999
 * @default 0
 */

/*~struct~ExpressionFile:
 * @param tag
 * @text 표정 태그
 * @type text
 * @default normal
 *
 * @param file
 * @text 표정 레이어 파일
 * @type file
 * @dir img/standing
 * @default
 *
 * @param offsetX
 * @text X 오프셋
 * @type number
 * @min -9999
 * @default 0
 *
 * @param offsetY
 * @text Y 오프셋
 * @type number
 * @min -9999
 * @default 0
 */

(() => {
    'use strict';

    const pluginName = 'StandingManager';
    const params = PluginManager.parameters(pluginName);

    // --- Presets ---
    const presetStr = params.emotionPresets || 'normal';
    const emotionPresets = presetStr.split(',').map(s => s.trim()).filter(Boolean);

    const defaultSlotsStr = params.defaultSlots || 'body,outfit,hair,expression,accessory';
    const defaultSlots = defaultSlotsStr.split(',').map(s => s.trim()).filter(Boolean);

    // --- Resolution specs ---
    const STANDING_W = Number(params.standingWidth) || 832;
    const STANDING_H = Number(params.standingHeight) || 1216;
    const SITUATION_RATIOS_STR = params.situationRatios || '1:1,3:2,2:3';
    const SITUATION_RATIOS = SITUATION_RATIOS_STR.split(',').map(function(s) {
        var parts = s.trim().split(':');
        return { w: Number(parts[0]), h: Number(parts[1]) };
    });

    // --- Utility ---
    function parseRect(str) {
        if (!str) return [216, 30, 400, 400];
        const parts = str.split(',').map(Number);
        return parts.length === 4 ? parts : [216, 30, 400, 400];
    }

    function deepParse(v) {
        if (typeof v === 'string') {
            try { return JSON.parse(v); } catch(e) { return v; }
        }
        return v;
    }

    // --- Single-image DB ---
    const _singleDB = {};

    function buildSingleDB() {
        const raw = JSON.parse(params.portraits || '[]');
        for (const entry of raw) {
            const parsed = deepParse(entry);
            const actorId = Number(parsed.actorId);
            if (!actorId) continue;
            _singleDB[actorId] = _singleDB[actorId] || {};
            const images = JSON.parse(parsed.images || '[]');
            for (const img of images) {
                const imgData = deepParse(img);
                const tag = (imgData.tag || 'normal').toLowerCase().trim();
                _singleDB[actorId][tag] = {
                    file: imgData.file || '',
                    face: parseRect(imgData.face),
                    mini: parseRect(imgData.mini)
                };
            }
        }
    }

    // --- Layered DB ---
    const _layeredDB = {};

    function buildLayeredDB() {
        const raw = JSON.parse(params.layered || '[]');
        for (const entry of raw) {
            const parsed = deepParse(entry);
            const actorId = Number(parsed.actorId);
            if (!actorId) continue;

            const slotsStr = parsed.slots || '';
            const slots = slotsStr ? slotsStr.split(',').map(s => s.trim()).filter(Boolean) : defaultSlots.slice();

            const situationsRaw = JSON.parse(parsed.situations || '[]');
            const situations = {};
            for (const sitEntry of situationsRaw) {
                const sit = deepParse(sitEntry);
                const name = (sit.name || 'default').toLowerCase().trim();

                const layersRaw = JSON.parse(sit.layers || '[]');
                const layers = {};
                for (const lEntry of layersRaw) {
                    const l = deepParse(lEntry);
                    layers[l.slot] = {
                        file: l.file || '',
                        offsetX: Number(l.offsetX) || 0,
                        offsetY: Number(l.offsetY) || 0
                    };
                }

                const exprsRaw = JSON.parse(sit.expressions || '[]');
                const expressions = {};
                for (const eEntry of exprsRaw) {
                    const e = deepParse(eEntry);
                    const tag = (e.tag || 'normal').toLowerCase().trim();
                    expressions[tag] = {
                        file: e.file || '',
                        offsetX: Number(e.offsetX) || 0,
                        offsetY: Number(e.offsetY) || 0
                    };
                }

                situations[name] = { layers: layers, expressions: expressions };
            }

            _layeredDB[actorId] = {
                slots: slots,
                situations: situations,
                faceRect: parseRect(parsed.faceRect),
                miniRect: parseRect(parsed.miniRect)
            };
        }
    }

    buildSingleDB();
    buildLayeredDB();

    function getMode(actorId) {
        return _layeredDB[actorId] ? 'layered' : 'single';
    }

    // --- Public API ---
    var StandingManager = {
        presets: emotionPresets,
        defaultSlots: defaultSlots,
        STANDING_W: STANDING_W,
        STANDING_H: STANDING_H,
        SITUATION_RATIOS: SITUATION_RATIOS,
        singleDB: _singleDB,
        layeredDB: _layeredDB,

        getMode: function(actorId) {
            return getMode(actorId);
        },

        // --- Single-image API ---
        getPortrait: function(actorId, tag) {
            tag = (tag || 'normal').toLowerCase().trim();
            var actor = _singleDB[actorId];
            if (!actor) return null;
            return actor[tag] || null;
        },

        loadBitmap: function(actorId, tag) {
            var p = this.getPortrait(actorId, tag);
            if (!p || !p.file) return null;
            return ImageManager.loadBitmap('img/standing/', p.file);
        },

        getFaceRect: function(actorId, tag) {
            if (getMode(actorId) === 'layered') {
                return _layeredDB[actorId].faceRect;
            }
            var p = this.getPortrait(actorId, tag);
            return p ? p.face : null;
        },

        getMiniRect: function(actorId, tag) {
            if (getMode(actorId) === 'layered') {
                return _layeredDB[actorId].miniRect;
            }
            var p = this.getPortrait(actorId, tag);
            return p ? p.mini : null;
        },

        getTags: function(actorId) {
            var actor = _singleDB[actorId];
            return actor ? Object.keys(actor) : [];
        },

        setPortrait: function(actorId, tag, file, face, mini) {
            if (!_singleDB[actorId]) _singleDB[actorId] = {};
            _singleDB[actorId][tag] = {
                file: file || '',
                face: face || [216, 30, 400, 400],
                mini: mini || [266, 80, 200, 200]
            };
        },

        // --- Layered API ---
        getSituations: function(actorId) {
            var data = _layeredDB[actorId];
            return data ? Object.keys(data.situations) : [];
        },

        getExpressions: function(actorId, situation) {
            var data = _layeredDB[actorId];
            if (!data) return [];
            var sit = data.situations[(situation || '').toLowerCase().trim()];
            return sit ? Object.keys(sit.expressions) : [];
        },

        getSlots: function(actorId) {
            var data = _layeredDB[actorId];
            return data ? data.slots : defaultSlots.slice();
        },

        composeLayers: function(actorId, situation, expression) {
            var data = _layeredDB[actorId];
            if (!data) return null;
            situation = (situation || '').toLowerCase().trim();
            expression = (expression || 'normal').toLowerCase().trim();

            var sit = data.situations[situation];
            if (!sit) return null;

            var result = [];
            for (var i = 0; i < data.slots.length; i++) {
                var slot = data.slots[i];
                if (slot === 'expression') {
                    var expr = sit.expressions[expression];
                    if (expr && expr.file) {
                        result.push({
                            slot: 'expression',
                            file: expr.file,
                            offsetX: expr.offsetX,
                            offsetY: expr.offsetY
                        });
                    }
                } else {
                    var layer = sit.layers[slot];
                    if (layer && layer.file) {
                        result.push({
                            slot: slot,
                            file: layer.file,
                            offsetX: layer.offsetX,
                            offsetY: layer.offsetY
                        });
                    }
                }
            }

            return {
                layers: result,
                face: data.faceRect,
                mini: data.miniRect
            };
        },

        /**
         * 레이어 합성 비트맵을 생성하여 Promise로 반환합니다.
         * 주의: 반환된 Bitmap은 호출자가 사용 후 bitmap.destroy()로
         * 명시적 해제해야 메모리 누수를 방지할 수 있습니다.
         * (RMMZ ImageManager 캐시와 별개로 생성되는 독립 Bitmap)
         */
        composeBitmap: function(actorId, situation, expression) {
            var info = this.composeLayers(actorId, situation, expression);
            if (!info || info.layers.length === 0) return Promise.resolve(null);

            return new Promise(function(resolve) {
                var bitmaps = info.layers.map(function(l) {
                    return {
                        bmp: ImageManager.loadBitmap('img/standing/', l.file),
                        ox: l.offsetX,
                        oy: l.offsetY
                    };
                });

                var loaded = 0;
                var total = bitmaps.length;
                var onLoad = function() {
                    loaded++;
                    if (loaded < total) return;

                    var w = 0, h = 0;
                    for (var i = 0; i < bitmaps.length; i++) {
                        w = Math.max(w, bitmaps[i].bmp.width + bitmaps[i].ox);
                        h = Math.max(h, bitmaps[i].bmp.height + bitmaps[i].oy);
                    }
                    if (w === 0 || h === 0) { resolve(null); return; }

                    var result = new Bitmap(w, h);
                    for (var j = 0; j < bitmaps.length; j++) {
                        var b = bitmaps[j];
                        result.blt(b.bmp, 0, 0, b.bmp.width, b.bmp.height, b.ox, b.oy);
                    }
                    resolve(result);
                };

                for (var k = 0; k < bitmaps.length; k++) {
                    if (bitmaps[k].bmp.isReady()) {
                        onLoad();
                    } else {
                        bitmaps[k].bmp.addLoadListener(onLoad);
                    }
                }
            });
        },

        // --- Layered data mutation (for editor) ---
        initLayeredActor: function(actorId, slots) {
            _layeredDB[actorId] = {
                slots: slots || defaultSlots.slice(),
                situations: {},
                faceRect: [216, 30, 400, 400],
                miniRect: [266, 80, 200, 200]
            };
        },

        removeLayeredActor: function(actorId) {
            delete _layeredDB[actorId];
        },

        addSituation: function(actorId, name) {
            var data = _layeredDB[actorId];
            if (!data) return;
            name = name.toLowerCase().trim();
            if (!data.situations[name]) {
                data.situations[name] = { layers: {}, expressions: {} };
            }
        },

        removeSituation: function(actorId, name) {
            var data = _layeredDB[actorId];
            if (data) delete data.situations[name.toLowerCase().trim()];
        },

        setLayerFile: function(actorId, situation, slot, file, offsetX, offsetY) {
            var data = _layeredDB[actorId];
            if (!data) return;
            var sit = data.situations[situation.toLowerCase().trim()];
            if (!sit) return;
            sit.layers[slot] = { file: file, offsetX: offsetX || 0, offsetY: offsetY || 0 };
        },

        removeLayerFile: function(actorId, situation, slot) {
            var data = _layeredDB[actorId];
            if (!data) return;
            var sit = data.situations[situation.toLowerCase().trim()];
            if (sit) delete sit.layers[slot];
        },

        setExpression: function(actorId, situation, tag, file, offsetX, offsetY) {
            var data = _layeredDB[actorId];
            if (!data) return;
            var sit = data.situations[situation.toLowerCase().trim()];
            if (!sit) return;
            sit.expressions[tag.toLowerCase().trim()] = {
                file: file, offsetX: offsetX || 0, offsetY: offsetY || 0
            };
        },

        removeExpression: function(actorId, situation, tag) {
            var data = _layeredDB[actorId];
            if (!data) return;
            var sit = data.situations[situation.toLowerCase().trim()];
            if (sit) delete sit.expressions[tag.toLowerCase().trim()];
        },

        setLayeredRect: function(actorId, type, rect) {
            var data = _layeredDB[actorId];
            if (!data) return;
            if (type === 'face') data.faceRect = rect;
            if (type === 'mini') data.miniRect = rect;
        },

        // --- Serialization ---
        serializeSingle: function() {
            var result = [];
            for (var actorId in _singleDB) {
                var tags = _singleDB[actorId];
                var images = [];
                for (var tag in tags) {
                    var d = tags[tag];
                    images.push(JSON.stringify({
                        tag: tag, file: d.file,
                        face: d.face.join(','),
                        mini: d.mini.join(',')
                    }));
                }
                result.push(JSON.stringify({
                    actorId: String(actorId),
                    images: '[' + images.join(',') + ']'
                }));
            }
            return result;
        },

        serializeLayered: function() {
            var result = [];
            for (var actorId in _layeredDB) {
                var data = _layeredDB[actorId];
                var situations = [];
                for (var sitName in data.situations) {
                    var sit = data.situations[sitName];
                    var layers = [];
                    for (var slot in sit.layers) {
                        var l = sit.layers[slot];
                        layers.push(JSON.stringify({
                            slot: slot, file: l.file,
                            offsetX: String(l.offsetX),
                            offsetY: String(l.offsetY)
                        }));
                    }
                    var expressions = [];
                    for (var etag in sit.expressions) {
                        var e = sit.expressions[etag];
                        expressions.push(JSON.stringify({
                            tag: etag, file: e.file,
                            offsetX: String(e.offsetX),
                            offsetY: String(e.offsetY)
                        }));
                    }
                    situations.push(JSON.stringify({
                        name: sitName,
                        layers: '[' + layers.join(',') + ']',
                        expressions: '[' + expressions.join(',') + ']'
                    }));
                }
                result.push(JSON.stringify({
                    actorId: String(actorId),
                    situations: '[' + situations.join(',') + ']',
                    faceRect: data.faceRect.join(','),
                    miniRect: data.miniRect.join(',')
                }));
            }
            return result;
        },
    };

    // 전역 등록
    window.StandingManager = StandingManager;

})();
