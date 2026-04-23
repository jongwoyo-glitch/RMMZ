#!/usr/bin/env python3
"""Phase 3: Combat/projectile multi-tile support for SRPG_Data.js"""
import os, sys

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC)
    try:
        os.write(fd, content.encode('utf-8'))
        os.fsync(fd)
    finally:
        os.close(fd)

def patch_replace(content, old, new, label=""):
    if old not in content:
        print(f"[FAIL] Cannot find marker for: {label}")
        print(f"  Looking for: {repr(old[:100])}...")
        sys.exit(1)
    count = content.count(old)
    if count > 1:
        print(f"[WARN] Multiple matches ({count}) for: {label}")
        sys.exit(1)
    result = content.replace(old, new, 1)
    print(f"[OK] Patched: {label}")
    return result

data_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_Data.js"
data = read_file(data_path)
orig_size = len(data)
print(f"[INFO] SRPG_Data.js size: {orig_size} bytes")

# === Patch 1: Update checkProjectilePath to handle objectFlags ===
OLD_CHECK_PROJ = """        // ─── 투사체 경로 차단 판정 ───
        // 공격자(fromX,fromY) → 대상(toX,toY)까지 fireMode에 따라
        // 경로상 차단 여부를 검사.
        // returns:
        //   { blocked: false } — 통과
        //   { blocked: true, x, y, terrainType, coverObject } — 차단됨
        //     coverObject: 해당 타일에 있는 파괴 가능 사물 (있으면)
        checkProjectilePath(fromX, fromY, toX, toY, fireMode) {
            // 근접은 경로 무시
            if (fireMode === FIRE_MODE.MELEE) {
                return { blocked: false };
            }
            const path = this.traceLine(fromX, fromY, toX, toY);
            for (const tile of path) {
                // 1) 지형 태그 기반 차단 (타일셋에 설정된 영구 지형)
                if (this.doesTileBlock(tile.x, tile.y, fireMode)) {
                    const obj = SM.unitAt(tile.x, tile.y);
                    const coverObj = (obj && obj.isObject && obj.isAlive()) ? obj : null;
                    return {
                        blocked: true,
                        x: tile.x,
                        y: tile.y,
                        terrainType: this.getTerrainType(tile.x, tile.y),
                        coverObject: coverObj,
                    };
                }
                // 2) 파괴 가능 사물(srpgObject)이 경로 위에 있으면 엄폐물로 취급
                //    직사 → 사물이 차단 (데미지 리다이렉트 가능)
                //    곡사 → 사물 위로 넘어감 (차단 안 함)
                if (fireMode === FIRE_MODE.DIRECT) {
                    const obj = SM.unitAt(tile.x, tile.y);
                    if (obj && obj.isObject && obj.isAlive()) {
                        return {
                            blocked: true,
                            x: tile.x,
                            y: tile.y,
                            terrainType: "cover",  // 사물 = 동적 엄폐물
                            coverObject: obj,
                        };
                    }
                }
            }
            return { blocked: false };
        },"""

NEW_CHECK_PROJ = """        // ─── 투사체 경로 차단 판정 ───
        // 공격자(fromX,fromY) → 대상(toX,toY)까지 fireMode에 따라
        // 경로상 차단 여부를 검사.
        // returns:
        //   { blocked: false } — 통과
        //   { blocked: true, x, y, terrainType, coverObject } — 차단됨
        //     coverObject: 해당 타일에 있는 파괴 가능 사물 (있으면)
        checkProjectilePath(fromX, fromY, toX, toY, fireMode) {
            // 근접은 경로 무시
            if (fireMode === FIRE_MODE.MELEE) {
                return { blocked: false };
            }
            const path = this.traceLine(fromX, fromY, toX, toY);
            // 이미 체크한 유닛 중복 방지 (멀티타일 유닛이 여러 타일에 걸칠 수 있으므로)
            const checkedUnits = new Set();
            for (const tile of path) {
                // 1) 지형 태그 기반 차단 (타일셋에 설정된 영구 지형)
                if (this.doesTileBlock(tile.x, tile.y, fireMode)) {
                    const obj = SM.unitAt(tile.x, tile.y);
                    const coverObj = (obj && obj.isObject && obj.isAlive()) ? obj : null;
                    return {
                        blocked: true,
                        x: tile.x,
                        y: tile.y,
                        terrainType: this.getTerrainType(tile.x, tile.y),
                        coverObject: coverObj,
                    };
                }
                // 2) 오브젝트/유닛의 objectFlags 기반 차단 판정
                const obj = SM.unitAt(tile.x, tile.y);
                if (obj && obj.isAlive() && !checkedUnits.has(obj)) {
                    checkedUnits.add(obj);
                    // objectFlags 기반 판정 (멀티타일 오브젝트 지원)
                    if (obj.objectFlags && obj.objectFlags.size > 0) {
                        // transparent: 투사체 통과 (차단 안함)
                        if (obj.objectFlags.has('transparent')) continue;
                        // blocking: direct & arc 모두 차단
                        if (obj.objectFlags.has('blocking')) {
                            return {
                                blocked: true,
                                x: tile.x, y: tile.y,
                                terrainType: "blocking",
                                coverObject: obj.objectFlags.has('destructible') ? obj : null,
                            };
                        }
                        // cover: direct만 차단 (arc는 통과)
                        if (obj.objectFlags.has('cover') && fireMode === FIRE_MODE.DIRECT) {
                            return {
                                blocked: true,
                                x: tile.x, y: tile.y,
                                terrainType: "cover",
                                coverObject: obj.objectFlags.has('destructible') ? obj : null,
                            };
                        }
                    }
                    // 기존 isObject 호환: objectFlags가 없는 구형 사물
                    else if (obj.isObject && fireMode === FIRE_MODE.DIRECT) {
                        return {
                            blocked: true,
                            x: tile.x, y: tile.y,
                            terrainType: "cover",
                            coverObject: obj,
                        };
                    }
                }
            }
            return { blocked: false };
        },"""

data = patch_replace(data, OLD_CHECK_PROJ, NEW_CHECK_PROJ,
    "checkProjectilePath: objectFlags-based blocking")

# === Patch 2: Update calcAtkRange to support multi-tile attack origin ===
OLD_ATKRANGE = """        // 공격 범위 (Grid Range System 연동)
        calcAtkRange(unit, fromX, fromY) {
            if (fromX === undefined) fromX = unit.x;
            if (fromY === undefined) fromY = unit.y;
            const resolved = resolveReach(unit, null);
            const dir = unit.event ? unit.event.direction() : 8;
            return tilesToAbsolute(resolved.tiles, fromX, fromY, dir, resolved.rotate)
                .filter(t => this.inBounds(t.x, t.y));
        },"""

NEW_ATKRANGE = """        // 공격 범위 (Grid Range System 연동, 멀티타일 대응)
        calcAtkRange(unit, fromX, fromY) {
            if (fromX === undefined) fromX = unit.x;
            if (fromY === undefined) fromY = unit.y;
            const resolved = resolveReach(unit, null);
            const dir = unit.event ? unit.event.direction() : 8;

            if (unit.isSingleTile()) {
                // 기존: 앵커 기준 단일 계산
                return tilesToAbsolute(resolved.tiles, fromX, fromY, dir, resolved.rotate)
                    .filter(t => this.inBounds(t.x, t.y));
            }
            // 멀티타일: 모든 점유 타일에서 공격 범위를 합산
            const resultSet = new Map(); // key -> {x,y}
            const key = (x, y) => `${x},${y}`;
            const ox = fromX - unit.anchor.x;
            const oy = fromY - unit.anchor.y;
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    const tiles = tilesToAbsolute(resolved.tiles, tx, ty, dir, resolved.rotate);
                    for (const t of tiles) {
                        if (!this.inBounds(t.x, t.y)) continue;
                        const k = key(t.x, t.y);
                        // 자기 점유 타일은 제외
                        if (t.x >= ox && t.x < ox + unit.gridW &&
                            t.y >= oy && t.y < oy + unit.gridH) continue;
                        if (!resultSet.has(k)) resultSet.set(k, { x: t.x, y: t.y });
                    }
                }
            }
            return Array.from(resultSet.values());
        },"""

data = patch_replace(data, OLD_ATKRANGE, NEW_ATKRANGE,
    "calcAtkRange: multi-tile attack range union")

# Write
write_file(data_path, data)
new_size = len(data)
print(f"[INFO] SRPG_Data.js patched size: {new_size} bytes (delta: +{new_size - orig_size})")
print("\n[DONE] Phase 3 patches applied!")
