#!/usr/bin/env node
/**
 * RMMZ 파일 감시 데몬 v2 -- 항목 수 추적 + 스마트 복원
 * 사용법: node watch_integrity.js
 * 종료: Ctrl+C
 *
 * v1 대비 변경점:
 *   - manifest.json으로 파일별 기대 항목 수 / 크기 추적
 *   - JSON 파싱 성공해도 항목 수가 줄면 "묵시적 손상"으로 감지
 *   - 복원 시 safe_copy / .bak 중 항목이 더 많은 쪽 선택
 *   - null 바이트 자동 정화 (수리 전 단계)
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PLUGINS = path.join(ROOT, 'js', 'plugins');
const STUDIO = path.join(ROOT, '..', 'RMMZStudio.html');
const SAFE_DIR = path.join(ROOT, 'backup', 'safe_copy');
const MANIFEST = path.join(SAFE_DIR, 'manifest.json');

if (!fs.existsSync(SAFE_DIR)) fs.mkdirSync(SAFE_DIR, { recursive: true });
const safeData = path.join(SAFE_DIR, 'data');
const safePlugins = path.join(SAFE_DIR, 'plugins');
if (!fs.existsSync(safeData)) fs.mkdirSync(safeData, { recursive: true });
if (!fs.existsSync(safePlugins)) fs.mkdirSync(safePlugins, { recursive: true });

let debounce = {};

// -- manifest: 파일별 기대 항목 수 기록 --
let manifest = {};
function loadManifest() {
    try {
        if (fs.existsSync(MANIFEST)) {
            manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
        }
    } catch (e) { manifest = {}; }
}
function saveManifest() {
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}
function getEntryCount(data) {
    return Array.isArray(data) ? data.length : Object.keys(data).length;
}

function timestamp() {
    return new Date().toLocaleTimeString('ko-KR', { hour12: false });
}
function log(icon, msg) {
    console.log(`[${timestamp()}] ${icon} ${msg}`);
}

// -- null 바이트 정화 --
function sanitizeNullBytes(fp) {
    let raw = fs.readFileSync(fp, 'utf8');
    if (raw.includes('\x00')) {
        const count = (raw.match(/\x00/g) || []).length;
        log('!', `${path.basename(fp)} -- null bytes ${count} removed`);
        raw = raw.replace(/\x00/g, '').trim();
        fs.writeFileSync(fp, raw);
    }
    return raw;
}

// -- 가장 좋은 복원 소스 찾기 --
function findBestSource(file, currentCount) {
    const candidates = [];

    // 1) safe_copy
    const safeFp = path.join(safeData, file);
    if (fs.existsSync(safeFp)) {
        try {
            let raw = fs.readFileSync(safeFp, 'utf8').replace(/\x00/g, '').trim();
            const data = JSON.parse(raw);
            candidates.push({ source: 'safe_copy', count: getEntryCount(data), path: safeFp, cleanData: raw });
        } catch (e) {}
    }

    // 2) .bak
    const bakFp = path.join(DATA, file + '.bak');
    if (fs.existsSync(bakFp)) {
        try {
            let raw = fs.readFileSync(bakFp, 'utf8').replace(/\x00/g, '').trim();
            const data = JSON.parse(raw);
            candidates.push({ source: '.bak', count: getEntryCount(data), path: bakFp, cleanData: raw });
        } catch (e) {}
    }

    // 3) manifest 기대값
    const expected = manifest[file] ? manifest[file].entries : 0;

    // 항목이 가장 많은 소스 선택 (기대값 이상인 것 우선)
    candidates.sort((a, b) => b.count - a.count);

    if (candidates.length === 0) return null;

    const best = candidates[0];
    // 현재보다 항목이 더 많은 소스만 복원 대상
    if (best.count > currentCount) return best;
    return null;
}

// -- clean restore (null-byte-free) --
function restoreFrom(best, targetPath) {
    fs.writeFileSync(targetPath, best.cleanData);
}

// -- JSON 검증 (핵심 로직) --
function validateAndProtectJSON(file) {
    const fp = path.join(DATA, file);
    const safeFp = path.join(safeData, file);

    // Step 0: null 바이트 정화
    let raw;
    try {
        raw = sanitizeNullBytes(fp);
    } catch (e) {
        log('x', `${file} -- read failed: ${e.message}`);
        return;
    }

    // Step 1: JSON 파싱
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        log('!', `${file} -- parse failed: ${e.message.substring(0, 60)}`);

        // 파싱 실패 -> 최선의 소스에서 복원
        const best = findBestSource(file, 0);
        if (best) {
            fs.copyFileSync(fp, fp + '.corrupted_' + Date.now());
            restoreFrom(best, fp);
            log('~', `${file} -- restored from ${best.source} (${best.count} entries)`);
        } else {
            log('x', `${file} -- no valid backup available!`);
        }
        return;
    }

    const currentCount = getEntryCount(data);
    const expectedCount = manifest[file] ? manifest[file].entries : 0;

    // Step 2: 항목 수 감소 감지 (묵시적 손상)
    if (expectedCount > 0 && currentCount < expectedCount) {
        log('!', `${file} -- entry count dropped! ${expectedCount} -> ${currentCount}`);

        const best = findBestSource(file, currentCount);
        if (best && best.count >= expectedCount) {
            // 항목이 더 많은 백업이 있으면 복원
            fs.copyFileSync(fp, fp + '.shrunk_' + Date.now());
            restoreFrom(best, fp);
            log('~', `${file} -- restored from ${best.source} (${best.count} entries, was ${currentCount})`);
            return;
        } else if (best && best.count > currentCount) {
            // 기대치에는 못 미치지만 현재보다 나은 소스
            fs.copyFileSync(fp, fp + '.shrunk_' + Date.now());
            restoreFrom(best, fp);
            log('~', `${file} -- partial restore from ${best.source} (${best.count}/${expectedCount} entries)`);
            log('!', `${file} -- still missing ${expectedCount - best.count} entries, manual check needed`);
            return;
        } else {
            log('!', `${file} -- no better backup found. Accepting ${currentCount} entries.`);
            // manifest는 갱신하지 않음 -- 항목 수가 줄었을 때 기대값을 내리면 안 됨
        }
    }

    // Step 3: 정상 -- safe_copy 갱신 + manifest 업데이트
    fs.copyFileSync(fp, safeFp);

    // manifest: 항목 수는 항상 최대값 유지 (증가만 허용, 감소 불가)
    if (!manifest[file] || currentCount >= expectedCount) {
        manifest[file] = {
            entries: currentCount,
            size: Buffer.byteLength(raw),
            updated: new Date().toISOString()
        };
        saveManifest();
    }

    log('+', `${file} -- OK (${currentCount} entries)`);
}

// -- JS 검증 --
function validateAndProtectJS(file) {
    const fp = path.join(PLUGINS, file);
    const safeFp = path.join(safePlugins, file);

    try {
        const src = fs.readFileSync(fp, 'utf8');
        new Function(src);
        fs.copyFileSync(fp, safeFp);
        log('+', `${file} -- OK`);
    } catch (e) {
        log('!', `${file} -- syntax error: ${e.message.split('\n')[0]}`);
        if (fs.existsSync(safeFp)) {
            fs.copyFileSync(fp, fp + '.corrupted_' + Date.now());
            fs.copyFileSync(safeFp, fp);
            log('~', `${file} -- restored from safe_copy`);
        }
    }
}

// -- Studio 검증 --
function validateStudio() {
    const safeFp = path.join(SAFE_DIR, 'RMMZStudio.html');
    try {
        const html = fs.readFileSync(STUDIO, 'utf8');
        if (!html.trimEnd().endsWith('</html>')) throw new Error('missing </html> -- truncated');
        const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let m;
        while ((m = re.exec(html)) !== null) { new Function(m[1]); }
        fs.copyFileSync(STUDIO, safeFp);
        log('+', `RMMZStudio.html -- OK`);
    } catch (e) {
        log('!', `RMMZStudio.html -- ${e.message.substring(0, 60)}`);
        if (fs.existsSync(safeFp)) {
            fs.copyFileSync(STUDIO, STUDIO + '.corrupted_' + Date.now());
            fs.copyFileSync(safeFp, STUDIO);
            log('~', `RMMZStudio.html -- restored from safe_copy`);
        }
    }
}

// -- 초기 안전 복사본 + manifest 생성 --
function initSafeCopies() {
    log('.', 'Initializing safe copies + manifest...');
    loadManifest();
    let count = 0;

    for (const f of fs.readdirSync(DATA).filter(f => f.endsWith('.json') && !f.includes('.damaged') && !f.includes('.corrupted') && !f.includes('.shrunk'))) {
        try {
            let raw = sanitizeNullBytes(path.join(DATA, f));
            const data = JSON.parse(raw);
            const entries = getEntryCount(data);
            const size = Buffer.byteLength(raw);

            // safe_copy 갱신
            fs.copyFileSync(path.join(DATA, f), path.join(safeData, f));

            // manifest: 최대값 유지
            const prev = manifest[f] ? manifest[f].entries : 0;
            if (entries >= prev) {
                manifest[f] = { entries, size, updated: new Date().toISOString() };
            } else {
                log('!', `${f} -- current ${entries} < manifest ${prev}, keeping higher expectation`);
            }

            count++;
        } catch(e) { log('!', `${f} -- damaged, cannot create safe copy`); }
    }

    for (const f of fs.readdirSync(PLUGINS).filter(f => f.endsWith('.js'))) {
        try {
            new Function(fs.readFileSync(path.join(PLUGINS, f), 'utf8'));
            fs.copyFileSync(path.join(PLUGINS, f), path.join(safePlugins, f));
            count++;
        } catch(e) {}
    }

    if (fs.existsSync(STUDIO)) {
        try {
            const h = fs.readFileSync(STUDIO, 'utf8');
            if (h.trimEnd().endsWith('</html>')) {
                fs.copyFileSync(STUDIO, path.join(SAFE_DIR, 'RMMZStudio.html'));
                count++;
            }
        } catch(e) {}
    }

    saveManifest();
    log('.', `Safe copies: ${count}, manifest entries: ${Object.keys(manifest).length}`);
}

// -- 파일 감시 --
function watch() {
    fs.watch(DATA, (event, filename) => {
        if (!filename || !filename.endsWith('.json') || filename.includes('.damaged') || filename.includes('.corrupted') || filename.includes('.shrunk')) return;
        clearTimeout(debounce[filename]);
        debounce[filename] = setTimeout(() => validateAndProtectJSON(filename), 500);
    });

    fs.watch(PLUGINS, (event, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        clearTimeout(debounce[filename]);
        debounce[filename] = setTimeout(() => validateAndProtectJS(filename), 500);
    });

    if (fs.existsSync(STUDIO)) {
        fs.watch(path.dirname(STUDIO), (event, filename) => {
            if (filename !== 'RMMZStudio.html') return;
            clearTimeout(debounce['studio']);
            debounce['studio'] = setTimeout(() => validateStudio(), 500);
        });
    }

    log('.', 'Watching: data/*.json, plugins/*.js, RMMZStudio.html');
    log('.', 'Auto-validate on change, auto-restore on corruption');
    log('.', 'Ctrl+C to stop');
}

// -- Run --
console.log('\x1b[1;36m======================================');
console.log('  RMMZ Integrity Daemon v2');
console.log('======================================\x1b[0m');

initSafeCopies();
watch();
