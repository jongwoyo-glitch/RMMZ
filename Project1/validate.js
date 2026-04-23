#!/usr/bin/env node
/**
 * RMMZ Project Integrity Validator v2
 * Usage: node validate.js [--fix] [--backup]
 *   --fix    : auto-repair recoverable issues
 *   --backup : create snapshot before validation
 *   (no args): validate only
 *
 * v2 changes:
 *   - manifest.json tracks expected entry counts per file
 *   - null byte sanitization before any parse attempt
 *   - entry count drop detection (silent corruption)
 *   - smart repair: compare .bak / safe_copy, pick best source
 *   - never auto-truncate if a better backup exists
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PLUGINS = path.join(ROOT, 'js', 'plugins');
const BACKUP_DIR = path.join(ROOT, 'backup', 'data_snapshots');
const SAFE_DIR = path.join(ROOT, 'backup', 'safe_copy');
const MANIFEST = path.join(SAFE_DIR, 'manifest.json');

const args = process.argv.slice(2);
const doFix = args.includes('--fix');
const doBackup = args.includes('--backup');

let issues = 0;
let warnings = 0;
let fixed = 0;

// -- manifest --
let manifest = {};
function loadManifest() {
    try {
        if (fs.existsSync(MANIFEST)) manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    } catch (e) { manifest = {}; }
}
function saveManifest() {
    if (!fs.existsSync(SAFE_DIR)) fs.mkdirSync(SAFE_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}
function getEntryCount(data) {
    return Array.isArray(data) ? data.length : Object.keys(data).length;
}

function log(type, msg) {
    const prefix = { ok: '\x1b[32m+\x1b[0m', warn: '\x1b[33m!\x1b[0m', err: '\x1b[31mx\x1b[0m', fix: '\x1b[36m~\x1b[0m', info: '\x1b[90m.\x1b[0m' };
    console.log(`  ${prefix[type] || ' '} ${msg}`);
}

// -- find best restoration source --
function findBestSource(file, currentCount) {
    const candidates = [];
    const safeData = path.join(SAFE_DIR, 'data');

    // safe_copy
    const safeFp = path.join(safeData, file);
    if (fs.existsSync(safeFp)) {
        try {
            let raw = fs.readFileSync(safeFp, 'utf8').replace(/\x00/g, '').trim();
            const data = JSON.parse(raw);
            candidates.push({ source: 'safe_copy', count: getEntryCount(data), path: safeFp, cleanData: raw });
        } catch (e) {}
    }

    // .bak
    const bakFp = path.join(DATA, file + '.bak');
    if (fs.existsSync(bakFp)) {
        try {
            let raw = fs.readFileSync(bakFp, 'utf8').replace(/\x00/g, '').trim();
            const data = JSON.parse(raw);
            candidates.push({ source: '.bak', count: getEntryCount(data), path: bakFp, cleanData: raw });
        } catch (e) {}
    }

    candidates.sort((a, b) => b.count - a.count);
    if (candidates.length === 0) return null;
    if (candidates[0].count > currentCount) return candidates[0];
    return null;
}

// -- restore from best source (writes sanitized data, not raw copy) --
function restoreFrom(best, targetPath) {
    fs.writeFileSync(targetPath, best.cleanData);
}

// --- 1. JSON validation ---
function validateJSON() {
    console.log('\n\x1b[1m-- JSON Data Validation --\x1b[0m');
    loadManifest();
    const files = fs.readdirSync(DATA).filter(f => f.endsWith('.json') && !f.includes('.damaged') && !f.includes('backup') && !f.includes('.corrupted') && !f.includes('.shrunk'));

    for (const file of files) {
        const fp = path.join(DATA, file);
        let raw = fs.readFileSync(fp, 'utf8');
        const bytes = Buffer.byteLength(raw);

        // Step 0: null byte sanitization
        if (raw.includes('\x00')) {
            const nullCount = (raw.match(/\x00/g) || []).length;
            log('warn', `${file} -- ${nullCount} null bytes found`);
            warnings++;
            raw = raw.replace(/\x00/g, '').trim();
            if (doFix) {
                fs.writeFileSync(fp, raw);
                log('fix', `  -> null bytes removed`);
                fixed++;
            }
        }

        // Step 1: JSON parse
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            issues++;
            log('err', `${file} -- JSON parse failed: ${e.message.substring(0, 80)}`);

            if (doFix) {
                // Try best source first, only truncate-repair as last resort
                const best = findBestSource(file, 0);
                if (best) {
                    fs.writeFileSync(fp + '.damaged', raw);
                    restoreFrom(best, fp);
                    log('fix', `  -> restored from ${best.source} (${best.count} entries)`);
                    fixed++;
                } else {
                    // Last resort: truncate repair
                    const repaired = tryRepairJSON(raw, file);
                    if (repaired) {
                        fs.writeFileSync(fp + '.damaged', raw);
                        fs.writeFileSync(fp, repaired);
                        log('fix', `  -> truncate-repaired (original -> ${file}.damaged)`);
                        log('warn', `  -> WARNING: truncate repair may have lost entries, verify manually!`);
                        fixed++;
                        warnings++;
                    }
                }
            }
            continue;
        }

        const currentCount = getEntryCount(data);
        const expectedCount = manifest[file] ? manifest[file].entries : 0;
        const info = Array.isArray(data) ? `${currentCount} entries` : `${currentCount} keys`;

        // Step 2: entry count drop detection
        if (expectedCount > 0 && currentCount < expectedCount) {
            warnings++;
            log('warn', `${file} -- entry count dropped! expected ${expectedCount}, got ${currentCount}`);

            if (doFix) {
                const best = findBestSource(file, currentCount);
                if (best && best.count > currentCount) {
                    fs.writeFileSync(fp + '.shrunk_' + Date.now(), raw);
                    restoreFrom(best, fp);
                    log('fix', `  -> restored from ${best.source} (${best.count} entries)`);
                    fixed++;
                } else {
                    log('warn', `  -> no better backup found, accepting ${currentCount} entries`);
                }
            }
            continue;
        }

        log('ok', `${file.padEnd(25)} ${(bytes/1024).toFixed(1).padStart(7)}KB  ${info}`);

        // Step 3: update manifest (increase only)
        if (!manifest[file] || currentCount >= expectedCount) {
            manifest[file] = { entries: currentCount, size: bytes, updated: new Date().toISOString() };
        }

        // Step 4: file size anomaly
        const MIN_SIZES = {
            'System.json': 3000, 'Actors.json': 500, 'Skills.json': 5000,
            'Classes.json': 5000, 'Tilesets.json': 50000, 'Animations.json': 10000
        };
        if (MIN_SIZES[file] && bytes < MIN_SIZES[file]) {
            warnings++;
            log('warn', `  -> ${file} size(${bytes}B) abnormally small (min: ${MIN_SIZES[file]}B)`);
        }
    }

    saveManifest();
}

// --- 2. JS plugin validation ---
function validateJS() {
    console.log('\n\x1b[1m-- JS Plugin Validation --\x1b[0m');
    const files = fs.readdirSync(PLUGINS).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const fp = path.join(PLUGINS, file);
        const src = fs.readFileSync(fp, 'utf8');

        try {
            new Function(src);
        } catch (e) {
            issues++;
            log('err', `${file} -- syntax error: ${e.message.split('\n')[0]}`);
            continue;
        }

        const trimmed = src.trimEnd();
        const endsIIFE = /\}\)\s*\(\s*\)\s*;?\s*(\/\/.*)?$/.test(trimmed);
        if (!endsIIFE) {
            warnings++;
            log('warn', `${file} -- no IIFE end pattern (possible truncation)`);
        } else {
            log('ok', `${file.padEnd(30)} ${(Buffer.byteLength(src)/1024).toFixed(1).padStart(7)}KB`);
        }
    }
}

// --- 3. RMMZStudio.html validation ---
function validateStudio() {
    console.log('\n\x1b[1m-- RMMZStudio.html Validation --\x1b[0m');
    const studioPath = path.join(ROOT, '..', 'RMMZStudio.html');
    if (!fs.existsSync(studioPath)) {
        log('info', 'RMMZStudio.html not found -- skip');
        return;
    }

    const html = fs.readFileSync(studioPath, 'utf8');

    if (!html.trimEnd().endsWith('</html>')) {
        issues++;
        log('err', 'RMMZStudio.html -- missing </html> (truncated!)');
    }

    const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let m, idx = 0, scriptErrs = 0;
    while ((m = re.exec(html)) !== null) {
        idx++;
        try { new Function(m[1]); }
        catch (e) { scriptErrs++; log('err', `script#${idx}: ${e.message.split('\n')[0]}`); }
    }

    if (scriptErrs) {
        issues += scriptErrs;
    } else {
        log('ok', `RMMZStudio.html -- ${idx} script blocks OK, ${html.split('\n').length} lines`);
    }
}

// --- 4. Backup ---
function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const snapDir = path.join(BACKUP_DIR, timestamp);

    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.mkdirSync(snapDir, { recursive: true });

    const dataSnap = path.join(snapDir, 'data');
    fs.mkdirSync(dataSnap);
    const dataFiles = fs.readdirSync(DATA).filter(f => f.endsWith('.json') && !f.includes('.damaged'));
    for (const f of dataFiles) {
        fs.copyFileSync(path.join(DATA, f), path.join(dataSnap, f));
    }

    const plugSnap = path.join(snapDir, 'plugins');
    fs.mkdirSync(plugSnap);
    const plugFiles = fs.readdirSync(PLUGINS).filter(f => f.endsWith('.js'));
    for (const f of plugFiles) {
        fs.copyFileSync(path.join(PLUGINS, f), path.join(plugSnap, f));
    }

    const studioSrc = path.join(ROOT, '..', 'RMMZStudio.html');
    if (fs.existsSync(studioSrc)) {
        fs.copyFileSync(studioSrc, path.join(snapDir, 'RMMZStudio.html'));
    }

    console.log('\n\x1b[1m-- Backup Created --\x1b[0m');
    log('ok', `${snapDir}`);
    log('info', `data: ${dataFiles.length}, plugins: ${plugFiles.length}`);

    const snaps = fs.readdirSync(BACKUP_DIR).sort().reverse();
    if (snaps.length > 10) {
        for (const old of snaps.slice(10)) {
            fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
        }
        log('info', `old backups ${snaps.length - 10} removed (keeping 10)`);
    }
}

// --- JSON truncate repair (last resort only) ---
function tryRepairJSON(raw, filename) {
    const isArray = raw.trim().startsWith('[');
    if (isArray) {
        let pos = raw.length - 1;
        while (pos > 0) {
            if (raw[pos] === '}') {
                const candidate = raw.substring(0, pos + 1).replace(/,\s*$/, '') + '\n]';
                try { JSON.parse(candidate); return candidate; }
                catch (e) {}
            }
            pos--;
        }
    } else {
        let pos = raw.length - 1;
        while (pos > 0) {
            if (raw[pos] === '}') {
                try { JSON.parse(raw.substring(0, pos + 1)); return raw.substring(0, pos + 1); }
                catch (e) {}
            }
            pos--;
        }
    }
    return null;
}

// === Run ===
console.log('\x1b[1;36m======================================');
console.log('  RMMZ Project Integrity Check v2');
console.log('======================================\x1b[0m');
console.log(`  path: ${ROOT}`);
console.log(`  mode: ${doBackup ? 'backup+' : ''}validate${doFix ? '+autofix' : ''}`);

if (doBackup) createBackup();
validateJSON();
validateJS();
validateStudio();

// --- summary ---
console.log('\n\x1b[1m-- Result --\x1b[0m');
if (issues === 0 && warnings === 0) {
    console.log('  \x1b[32;1mAll files OK\x1b[0m');
} else {
    if (issues > 0) console.log(`  \x1b[31;1mErrors: ${issues}\x1b[0m${fixed ? ` (${fixed} fixed)` : ''}`);
    if (warnings > 0) console.log(`  \x1b[33;1mWarnings: ${warnings}\x1b[0m`);
}

// Show manifest summary
loadManifest();
const mKeys = Object.keys(manifest);
if (mKeys.length > 0) {
    console.log(`\n\x1b[1m-- Manifest (${mKeys.length} files tracked) --\x1b[0m`);
    for (const k of mKeys.sort()) {
        const m = manifest[k];
        log('info', `${k.padEnd(25)} ${String(m.entries).padStart(4)} entries  ${(m.size/1024).toFixed(1).padStart(7)}KB`);
    }
}

process.exit(issues > 0 ? 1 : 0);
