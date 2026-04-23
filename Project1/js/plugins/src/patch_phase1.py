#!/usr/bin/env python3
"""Phase 1: Multi-tile data model + occupancy logic patches for SRPG_Data.js and SRPG_SM.js"""
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
        print(f"  Looking for: {repr(old[:80])}...")
        sys.exit(1)
    count = content.count(old)
    if count > 1:
        print(f"[WARN] Multiple matches ({count}) for: {label} — replacing first only")
    result = content.replace(old, new, 1)
    print(f"[OK] Patched: {label}")
    return result

# =============================================
#  SRPG_Data.js patches
# =============================================
data_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_Data.js"
data = read_file(data_path)
orig_size = len(data)
print(f"[INFO] SRPG_Data.js original size: {orig_size} bytes")

# --- Patch 1: Add multi-tile properties to SrpgUnit constructor ---
# Insert after the isObject block (after line 568: closing brace of isObject block)
OLD_AFTER_ISOBJECT = """            }

            this.hp = this.mhp;
            this.mp = this.mmp;
            this._alive = true;

            // AP 턴 시스템"""

NEW_AFTER_ISOBJECT = """            }

            // ─── 멀티타일 그리드 시스템 ───
            this.gridW = 1;
            this.gridH = 1;
            this.anchor = { x: 0, y: 0 };
            this.unitType = this.isObject ? 'object' : this.team; // 'actor'|'enemy'|'object'
            this.objectFlags = new Set();
            this.spriteFile = null;
            this.spriteFolder = null;

            // dataMeta에서 멀티타일 태그 파싱 (Actor/Enemy DB 노트)
            if (this._data && this._data.note) {
                // dataMeta는 이미 위에서 파싱됨, 재파싱
                const _mt = {};
                const _mtLines = this._data.note.split(/[\\r\\n]+/);
                for (const _ln of _mtLines) {
                    const _mm = _ln.match(/<(\\w+):(.+?)>/);
                    if (_mm) _mt[_mm[1]] = _mm[2].trim();
                }
                if (_mt.srpgGridW) this.gridW = Math.max(1, Number(_mt.srpgGridW));
                if (_mt.srpgGridH) this.gridH = Math.max(1, Number(_mt.srpgGridH));
                if (_mt.srpgAnchor) {
                    const _anc = _mt.srpgAnchor.split(',');
                    this.anchor = { x: Number(_anc[0]) || 0, y: Number(_anc[1]) || 0 };
                }
                if (_mt.srpgUnitType) this.unitType = _mt.srpgUnitType;
                if (_mt.srpgObjectFlags) {
                    _mt.srpgObjectFlags.split(',').forEach(f => {
                        const ft = f.trim();
                        if (ft) this.objectFlags.add(ft);
                    });
                }
                if (_mt.srpgSpriteFile) this.spriteFile = _mt.srpgSpriteFile;
                if (_mt.srpgSpriteFolder) this.spriteFolder = _mt.srpgSpriteFolder;
            }
            // 이벤트 노트태그에서도 오버라이드 가능
            if (meta.srpgGridW) this.gridW = Math.max(1, Number(meta.srpgGridW));
            if (meta.srpgGridH) this.gridH = Math.max(1, Number(meta.srpgGridH));
            if (meta.srpgAnchor) {
                const _anc2 = meta.srpgAnchor.split(',');
                this.anchor = { x: Number(_anc2[0]) || 0, y: Number(_anc2[1]) || 0 };
            }
            if (meta.srpgUnitType) this.unitType = meta.srpgUnitType;
            if (meta.srpgObjectFlags) {
                meta.srpgObjectFlags.split(',').forEach(f => {
                    const ft = f.trim();
                    if (ft) this.objectFlags.add(ft);
                });
            }
            if (meta.srpgSpriteFile) this.spriteFile = meta.srpgSpriteFile;
            if (meta.srpgSpriteFolder) this.spriteFolder = meta.srpgSpriteFolder;

            this.hp = this.mhp;
            this.mp = this.mmp;
            this._alive = true;

            // AP 턴 시스템"""

data = patch_replace(data, OLD_AFTER_ISOBJECT, NEW_AFTER_ISOBJECT,
    "SrpgUnit constructor: add multi-tile properties")

# --- Patch 2: Add occupies(), canPlaceAt(), occupiedTiles, originX, originY ---
# Insert after the get y() line and isAlive/isActor/isEnemy block
OLD_AFTER_GETTERS = """        get x() { return this.event._x; }
        get y() { return this.event._y; }
        isAlive() { return this._alive; }
        isActor() { return this.team === "actor"; }
        isEnemy() { return this.team === "enemy"; }
        isPlayerControlled() { return this.teamId === 1; }"""

NEW_AFTER_GETTERS = """        get x() { return this.event._x; }
        get y() { return this.event._y; }

        // ─── 멀티타일 점유 메서드 ───
        /** 점유 영역 좌상단 X */
        get originX() { return this.x - this.anchor.x; }
        /** 점유 영역 좌상단 Y */
        get originY() { return this.y - this.anchor.y; }

        /** 점유 중인 모든 타일 좌표 */
        get occupiedTiles() {
            const tiles = [];
            const ox = this.originX;
            const oy = this.originY;
            for (let i = 0; i < this.gridW; i++) {
                for (let j = 0; j < this.gridH; j++) {
                    tiles.push({ x: ox + i, y: oy + j });
                }
            }
            return tiles;
        }

        /** 이 유닛이 (tx, ty) 타일을 점유하는가? */
        occupies(tx, ty) {
            const ox = this.originX;
            const oy = this.originY;
            return tx >= ox && tx < ox + this.gridW &&
                   ty >= oy && ty < oy + this.gridH;
        }

        /** (ax, ay)를 앵커로 배치할 때 모든 타일이 유효한가? */
        canPlaceAt(ax, ay, gridSystem) {
            const ox = ax - this.anchor.x;
            const oy = ay - this.anchor.y;
            for (let i = 0; i < this.gridW; i++) {
                for (let j = 0; j < this.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    if (gridSystem && !gridSystem.inBounds(tx, ty)) return false;
                    if (gridSystem && !gridSystem.isPassable(tx, ty)) return false;
                    if (gridSystem && gridSystem.isOccupied(tx, ty, this)) return false;
                }
            }
            return true;
        }

        /** 1x1 유닛인가? */
        isSingleTile() { return this.gridW === 1 && this.gridH === 1; }

        isAlive() { return this._alive; }
        isActor() { return this.team === "actor"; }
        isEnemy() { return this.team === "enemy"; }
        isPlayerControlled() { return this.teamId === 1; }"""

data = patch_replace(data, OLD_AFTER_GETTERS, NEW_AFTER_GETTERS,
    "SrpgUnit: add multi-tile occupancy methods")

# --- Patch 3: Update isOccupied() to use occupies() ---
OLD_ISOCCUPIED = """        isOccupied(x, y, excludeUnit) {
            for (const u of SM._units) {
                if (u === excludeUnit) continue;
                if (u.isAlive() && u.x === x && u.y === y) return true;
            }
            return false;
        },"""

NEW_ISOCCUPIED = """        isOccupied(x, y, excludeUnit) {
            for (const u of SM._units) {
                if (u === excludeUnit) continue;
                if (u.isAlive() && u.occupies(x, y)) return true;
            }
            return false;
        },"""

data = patch_replace(data, OLD_ISOCCUPIED, NEW_ISOCCUPIED,
    "isOccupied: use occupies() for multi-tile")

# --- Patch 4: Update dist() for multi-tile distance ---
OLD_DIST = """        // 맨해튼 거리
        dist(x1, y1, x2, y2) {
            return Math.abs(x1 - x2) + Math.abs(y1 - y2);
        },"""

NEW_DIST = """        // 맨해튼 거리 (단일 타일 좌표 간)
        dist(x1, y1, x2, y2) {
            return Math.abs(x1 - x2) + Math.abs(y1 - y2);
        },

        // 멀티타일 유닛 간 최소 맨해튼 거리
        distMulti(unitA, unitB) {
            if (unitA.isSingleTile() && unitB.isSingleTile()) {
                return this.dist(unitA.x, unitA.y, unitB.x, unitB.y);
            }
            let minDist = Infinity;
            const tilesA = unitA.occupiedTiles;
            const tilesB = unitB.occupiedTiles;
            for (const a of tilesA) {
                for (const b of tilesB) {
                    const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
                    if (d < minDist) {
                        minDist = d;
                        if (d <= 1) return d; // 인접이면 즉시 리턴
                    }
                }
            }
            return minDist;
        },

        // 좌표에서 멀티타일 유닛까지의 최소 맨해튼 거리
        distToUnit(x, y, unit) {
            if (unit.isSingleTile()) {
                return this.dist(x, y, unit.x, unit.y);
            }
            let minDist = Infinity;
            for (const t of unit.occupiedTiles) {
                const d = Math.abs(x - t.x) + Math.abs(y - t.y);
                if (d < minDist) {
                    minDist = d;
                    if (d <= 1) return d;
                }
            }
            return minDist;
        },"""

data = patch_replace(data, OLD_DIST, NEW_DIST,
    "dist: add multi-tile distance functions")

# --- Write patched SRPG_Data.js ---
write_file(data_path, data)
new_size = len(data)
print(f"[INFO] SRPG_Data.js patched size: {new_size} bytes (delta: +{new_size - orig_size})")

# =============================================
#  SRPG_SM.js patches
# =============================================
sm_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_SM.js"
sm = read_file(sm_path)
sm_orig_size = len(sm)
print(f"\n[INFO] SRPG_SM.js original size: {sm_orig_size} bytes")

# --- Patch 5: Update unitAt() to use occupies() ---
OLD_UNITAT = """        unitAt(x, y) {
            return this._units.find(u => u.isAlive() && u.x === x && u.y === y) || null;
        },"""

NEW_UNITAT = """        unitAt(x, y) {
            return this._units.find(u => u.isAlive() && u.occupies(x, y)) || null;
        },"""

sm = patch_replace(sm, OLD_UNITAT, NEW_UNITAT,
    "unitAt: use occupies() for multi-tile")

# --- Write patched SRPG_SM.js ---
write_file(sm_path, sm)
sm_new_size = len(sm)
print(f"[INFO] SRPG_SM.js patched size: {sm_new_size} bytes (delta: +{sm_new_size - sm_orig_size})")

print("\n[DONE] Phase 1 patches applied successfully!")
