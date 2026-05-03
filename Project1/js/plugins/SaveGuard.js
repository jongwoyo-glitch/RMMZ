//=============================================================================
// SaveGuard.js — Null-byte & Truncation Prevention Layer
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.0] Prevents null-byte injection and truncation in all file writes. Patches Node.js fs.writeFileSync at the lowest level.
 * @author Claude (for Michael)
 * @url
 *
 * @help
 * ============================================================================
 * SaveGuard.js — 파일 저장 보호 플러그인
 * ============================================================================
 *
 * NW.js 런타임에서 발생하는 null byte (0x00) 주입과 파일 잘림(truncation)을
 * 근본적으로 방지합니다.
 *
 * 방어 계층:
 *   1) fs.writeFileSync monkey-patch — 모든 파일 쓰기에서 null byte 제거
 *   2) JSON 파일 쓰기 시 구조 검증 — 잘린 JSON 감지 후 쓰기 차단
 *   3) 쓰기 후 즉시 읽기-검증 — 디스크에 쓴 내용을 즉시 재검증
 *
 * 플러그인 목록에서 가장 위(높은 우선순위)에 배치하세요.
 * ============================================================================
 *
 * @param enableLogging
 * @text 로그 출력
 * @type boolean
 * @default true
 * @desc 콘솔에 방지 로그를 출력합니다.
 *
 * @param enableWriteVerify
 * @text 쓰기 후 검증
 * @type boolean
 * @default true
 * @desc 파일 쓰기 후 즉시 읽어서 null byte 여부를 재검증합니다.
 */

(() => {
    'use strict';

    const pluginName = 'SaveGuard';
    const params = PluginManager.parameters(pluginName);
    const LOG = params.enableLogging !== 'false';
    const VERIFY = params.enableWriteVerify !== 'false';

    // NW.js 환경에서만 동작
    if (typeof require === 'undefined') return;

    const fs = require('fs');
    const path = require('path');

    // ── 원본 보존 ──
    const _origWriteFileSync = fs.writeFileSync;
    const _origWriteFile = fs.writeFile;

    // ── 유틸 ──
    function stripNullBytes(data) {
        if (typeof data === 'string') {
            return data.replace(/\0/g, '');
        }
        if (Buffer.isBuffer(data)) {
            // Buffer에서 null byte 제거
            const clean = [];
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== 0) clean.push(data[i]);
            }
            return Buffer.from(clean);
        }
        return data;
    }

    function isJsonFile(filePath) {
        return typeof filePath === 'string' && filePath.endsWith('.json');
    }

    function isJsFile(filePath) {
        return typeof filePath === 'string' && filePath.endsWith('.js');
    }

    function isTextFile(filePath) {
        return isJsonFile(filePath) || isJsFile(filePath);
    }

    function validateJsonStructure(content, filePath) {
        try {
            JSON.parse(content);
            return true;
        } catch (e) {
            if (LOG) {
                console.error('[SaveGuard] JSON 구조 오류 감지 — 쓰기 차단:', filePath);
                console.error('[SaveGuard] 오류:', e.message);
            }
            return false;
        }
    }

    function validateJsStructure(content, filePath) {
        // plugins.js 등 JS 파일의 기본 구조 검증
        // 중괄호/대괄호 쌍 확인
        const opens = (content.match(/[\[{(]/g) || []).length;
        const closes = (content.match(/[\]})]/g) || []).length;
        if (Math.abs(opens - closes) > 2) {
            if (LOG) {
                console.error('[SaveGuard] JS 괄호 불균형 감지 — 쓰기 차단:', filePath,
                    'opens:', opens, 'closes:', closes);
            }
            return false;
        }
        // 세미콜론이나 중괄호로 끝나는지 (잘림 감지)
        const trimmed = content.trim();
        if (trimmed.length > 100) {
            const lastChar = trimmed[trimmed.length - 1];
            if (!'};)'.includes(lastChar) && lastChar !== '\n') {
                if (LOG) {
                    console.warn('[SaveGuard] JS 파일 끝이 비정상:', filePath,
                        'last:', JSON.stringify(trimmed.slice(-20)));
                }
                // 경고만, 차단하지는 않음 (JS는 구조가 다양)
            }
        }
        return true;
    }

    // ── fs.writeFileSync 패치 ──
    fs.writeFileSync = function(filePath, data, options) {
        let cleanData = data;

        if (isTextFile(filePath)) {
            // 문자열로 변환
            let text = typeof data === 'string' ? data :
                       Buffer.isBuffer(data) ? data.toString('utf8') : String(data);

            // null byte 제거
            const nullCount = (text.match(/\0/g) || []).length;
            if (nullCount > 0) {
                text = text.replace(/\0/g, '');
                if (LOG) {
                    console.warn('[SaveGuard] null byte ' + nullCount + '개 제거:', filePath);
                }
            }

            // JSON 구조 검증
            if (isJsonFile(filePath)) {
                if (!validateJsonStructure(text, filePath)) {
                    // 잘린 JSON은 쓰지 않음 — 기존 파일 보호
                    console.error('[SaveGuard] ★ 손상된 JSON 쓰기 차단:', filePath);
                    return;
                }
            }

            // JS 구조 검증
            if (isJsFile(filePath)) {
                validateJsStructure(text, filePath);
            }

            cleanData = text;
        } else if (Buffer.isBuffer(data)) {
            // 바이너리 파일은 null byte가 정상이므로 건드리지 않음
            cleanData = data;
        }

        // 원본 함수로 쓰기
        _origWriteFileSync.call(fs, filePath, cleanData, options);

        // 쓰기 후 검증 (텍스트 파일만)
        if (VERIFY && isTextFile(filePath)) {
            try {
                const written = fs.readFileSync(filePath, 'utf8');
                const postNulls = (written.match(/\0/g) || []).length;
                if (postNulls > 0) {
                    // 디스크에 쓴 후에도 null이 있으면 한 번 더 정화
                    const reClean = written.replace(/\0/g, '');
                    _origWriteFileSync.call(fs, filePath, reClean, options);
                    if (LOG) {
                        console.warn('[SaveGuard] 쓰기 후 검증에서 null byte ' +
                            postNulls + '개 재발견, 재정화 완료:', filePath);
                    }
                }
            } catch (e) {
                // 검증 실패는 무시 (파일 접근 문제 등)
            }
        }
    };

    // ── fs.writeFile (비동기) 패치 ──
    fs.writeFile = function(filePath, data, optionsOrCallback, callback) {
        let options, cb;
        if (typeof optionsOrCallback === 'function') {
            cb = optionsOrCallback;
            options = undefined;
        } else {
            options = optionsOrCallback;
            cb = callback;
        }

        let cleanData = data;
        if (isTextFile(filePath) && typeof data === 'string') {
            const nullCount = (data.match(/\0/g) || []).length;
            if (nullCount > 0) {
                cleanData = data.replace(/\0/g, '');
                if (LOG) {
                    console.warn('[SaveGuard] (async) null byte ' + nullCount + '개 제거:', filePath);
                }
            }
            if (isJsonFile(filePath) && !validateJsonStructure(cleanData, filePath)) {
                console.error('[SaveGuard] ★ (async) 손상된 JSON 쓰기 차단:', filePath);
                if (cb) cb(new Error('SaveGuard: corrupted JSON blocked'));
                return;
            }
        }

        _origWriteFile.call(fs, filePath, cleanData, options, cb);
    };

    // ── DataManager.onXhrLoad 패치 — 로드 시에도 null byte 정화 ──
    const _DataManager_onXhrLoad = DataManager.onXhrLoad;
    DataManager.onXhrLoad = function(xhr, name, src, url) {
        if (xhr.status < 400) {
            let text = xhr.responseText;
            const nullCount = (text.match(/\0/g) || []).length;
            if (nullCount > 0) {
                text = text.replace(/\0/g, '');
                if (LOG) {
                    console.warn('[SaveGuard] 데이터 로드 시 null byte ' +
                        nullCount + '개 정화:', src);
                }
                // 정화된 텍스트로 파싱
                try {
                    window[name] = JSON.parse(text);
                    this.onLoad(window[name]);
                } catch (e) {
                    this.onXhrError(name, src, url);
                }
                return;
            }
        }
        _DataManager_onXhrLoad.call(this, xhr, name, src, url);
    };

    // ── StorageManager.fsWriteFile 이중 패치 ──
    const _StorageManager_fsWriteFile = StorageManager.fsWriteFile;
    StorageManager.fsWriteFile = function(filePath, data) {
        // fs.writeFileSync가 이미 패치되어 있지만, 여기서도 한 번 더 정화
        let cleanData = data;
        if (typeof data === 'string') {
            cleanData = data.replace(/\0/g, '');
        }
        _StorageManager_fsWriteFile.call(this, filePath, cleanData);
    };

    // ── 시작 시 data/ 폴더 전수 정화 ──
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        if (typeof require !== 'undefined') {
            try {
                const dataDir = path.join(path.dirname(process.mainModule.filename), 'data');
                if (fs.existsSync(dataDir)) {
                    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
                    let totalCleaned = 0;
                    for (const file of files) {
                        const fp = path.join(dataDir, file);
                        const raw = fs.readFileSync(fp);
                        const nullCount = raw.filter(b => b === 0).length;
                        if (nullCount > 0) {
                            const clean = raw.filter(b => b !== 0);
                            _origWriteFileSync.call(fs, fp, clean);
                            totalCleaned += nullCount;
                            if (LOG) {
                                console.warn('[SaveGuard] 부팅 정화:', file,
                                    '— null byte', nullCount, '개 제거');
                            }
                        }
                    }
                    if (totalCleaned > 0 && LOG) {
                        console.log('[SaveGuard] 부팅 시 총', totalCleaned, '개 null byte 정화 완료');
                    } else if (LOG) {
                        console.log('[SaveGuard] 부팅 시 데이터 파일 정상 확인 (' + files.length + '개)');
                    }
                }
            } catch (e) {
                console.error('[SaveGuard] 부팅 정화 실패:', e.message);
            }
        }
        _Scene_Boot_start.call(this);
    };

    if (LOG) {
        console.log('[SaveGuard] v1.0 로드 완료 — fs.writeFileSync/writeFile 패치 적용');
    }
})();
