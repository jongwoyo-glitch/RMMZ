#!/usr/bin/env python3
"""Phase 2: Movement/pathfinding multi-tile support for SRPG_Data.js"""
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

# === Patch 1: calcMoveRange — multi-tile BFS ===
OLD_CALCMOVE = """        // 이동 범위 BFS (maxMov: 사용할 이동력, 생략 시 unit.mov)
        calcMoveRange(unit, maxMov) {
            const movLimit = (maxMov !== undefined) ? maxMov : unit.mov;
            const range = [];
            const visited = {};
            const key = (x, y) => `${x},${y}`;
            const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
            visited[key(unit.x, unit.y)] = 0;

            while (queue.length > 0) {
                const cur = queue.shift();
                range.push({ x: cur.x, y: cur.y, cost: cur.cost });

                if (cur.cost >= movLimit) continue;

                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    const nk = key(nx, ny);
                    const nc = cur.cost + 1;
                    if (!this.inBounds(nx, ny)) continue;
                    if (!this.isPassable(nx, ny)) continue;
                    if (visited[nk] !== undefined && visited[nk] <= nc) continue;
                    // 적 유닛은 통과 불가 (아군은 통과 가능)
                    const occ = SM.unitAt(nx, ny);
                    if (occ && occ !== unit && occ.teamId !== unit.teamId && occ.isAlive()) continue;
                    // 같은 팀이면 통과 가능하지만 최종 위치로 멈출 수는 없음 (나중에 필터)
                    visited[nk] = nc;
                    queue.push({ x: nx, y: ny, cost: nc });
                }
            }

            // 다른 유닛이 있는 타일은 최종 목적지에서 제외 (본인 위치는 허용)
            return range.filter(t =>
                (t.x === unit.x && t.y === unit.y) ||
                !this.isOccupied(t.x, t.y, unit)
            );
        },"""

NEW_CALCMOVE = """        // 이동 범위 BFS (maxMov: 사용할 이동력, 생략 시 unit.mov)
        // 멀티타일: 앵커 좌표 기준으로 BFS, 각 후보 위치에서 W×H 전체 검증
        calcMoveRange(unit, maxMov) {
            const movLimit = (maxMov !== undefined) ? maxMov : unit.mov;
            const range = [];
            const visited = {};
            const key = (x, y) => `${x},${y}`;
            const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
            visited[key(unit.x, unit.y)] = 0;
            const isMulti = !unit.isSingleTile();

            while (queue.length > 0) {
                const cur = queue.shift();
                range.push({ x: cur.x, y: cur.y, cost: cur.cost });

                if (cur.cost >= movLimit) continue;

                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    const nk = key(nx, ny);
                    const nc = cur.cost + 1;
                    if (visited[nk] !== undefined && visited[nk] <= nc) continue;

                    if (isMulti) {
                        // 멀티타일: 앵커를 (nx,ny)에 놓았을 때 모든 점유 타일 검증
                        if (!this._canAnchorAt(unit, nx, ny)) continue;
                    } else {
                        // 싱글타일: 기존 로직
                        if (!this.inBounds(nx, ny)) continue;
                        if (!this.isPassable(nx, ny)) continue;
                        // 적 유닛은 통과 불가 (아군은 통과 가능)
                        const occ = SM.unitAt(nx, ny);
                        if (occ && occ !== unit && occ.teamId !== unit.teamId && occ.isAlive()) continue;
                    }

                    visited[nk] = nc;
                    queue.push({ x: nx, y: ny, cost: nc });
                }
            }

            // 다른 유닛이 있는 타일은 최종 목적지에서 제외 (본인 위치는 허용)
            if (isMulti) {
                return range.filter(t =>
                    (t.x === unit.x && t.y === unit.y) ||
                    this._canStopAt(unit, t.x, t.y)
                );
            }
            return range.filter(t =>
                (t.x === unit.x && t.y === unit.y) ||
                !this.isOccupied(t.x, t.y, unit)
            );
        },"""

data = patch_replace(data, OLD_CALCMOVE, NEW_CALCMOVE, "calcMoveRange: multi-tile BFS")

# === Patch 2: findPath — multi-tile pathfinding ===
OLD_FINDPATH = """        // BFS 경로 찾기 (이동 범위 내)
        findPath(unit, tx, ty, moveRange) {
            const key = (x, y) => `${x},${y}`;
            const rangeSet = new Set(moveRange.map(t => key(t.x, t.y)));
            if (!rangeSet.has(key(tx, ty))) return [];

            const visited = {};
            const prev = {};
            const queue = [{ x: unit.x, y: unit.y }];
            visited[key(unit.x, unit.y)] = true;

            while (queue.length > 0) {
                const cur = queue.shift();
                if (cur.x === tx && cur.y === ty) break;

                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    const nk = key(nx, ny);
                    if (!rangeSet.has(nk)) continue;
                    if (visited[nk]) continue;
                    // 경로 중간의 아군은 통과 가능
                    const occ = SM.unitAt(nx, ny);
                    if (occ && occ !== unit && occ.teamId !== unit.teamId && occ.isAlive()) continue;
                    visited[nk] = true;
                    prev[nk] = { x: cur.x, y: cur.y };
                    queue.push({ x: nx, y: ny });
                }
            }

            // 경로 역추적
            const path = [];
            let ck = key(tx, ty);
            if (!prev[ck] && !(tx === unit.x && ty === unit.y)) return [];
            let cx = tx, cy = ty;
            while (!(cx === unit.x && cy === unit.y)) {
                path.unshift({ x: cx, y: cy });
                const p = prev[key(cx, cy)];
                if (!p) break;
                cx = p.x; cy = p.y;
            }
            return path;
        },"""

NEW_FINDPATH = """        // BFS 경로 찾기 (이동 범위 내, 멀티타일 대응)
        findPath(unit, tx, ty, moveRange) {
            const key = (x, y) => `${x},${y}`;
            const rangeSet = new Set(moveRange.map(t => key(t.x, t.y)));
            if (!rangeSet.has(key(tx, ty))) return [];

            const isMulti = !unit.isSingleTile();
            const visited = {};
            const prev = {};
            const queue = [{ x: unit.x, y: unit.y }];
            visited[key(unit.x, unit.y)] = true;

            while (queue.length > 0) {
                const cur = queue.shift();
                if (cur.x === tx && cur.y === ty) break;

                for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
                    const nx = cur.x + dx;
                    const ny = cur.y + dy;
                    const nk = key(nx, ny);
                    if (!rangeSet.has(nk)) continue;
                    if (visited[nk]) continue;
                    if (isMulti) {
                        // 멀티타일: 경로 중간에 앵커 위치로 진입 가능한지 확인
                        if (!this._canAnchorAt(unit, nx, ny)) continue;
                    } else {
                        // 경로 중간의 아군은 통과 가능
                        const occ = SM.unitAt(nx, ny);
                        if (occ && occ !== unit && occ.teamId !== unit.teamId && occ.isAlive()) continue;
                    }
                    visited[nk] = true;
                    prev[nk] = { x: cur.x, y: cur.y };
                    queue.push({ x: nx, y: ny });
                }
            }

            // 경로 역추적
            const path = [];
            let ck = key(tx, ty);
            if (!prev[ck] && !(tx === unit.x && ty === unit.y)) return [];
            let cx = tx, cy = ty;
            while (!(cx === unit.x && cy === unit.y)) {
                path.unshift({ x: cx, y: cy });
                const p = prev[key(cx, cy)];
                if (!p) break;
                cx = p.x; cy = p.y;
            }
            return path;
        },"""

data = patch_replace(data, OLD_FINDPATH, NEW_FINDPATH, "findPath: multi-tile pathfinding")

# === Patch 3: Add helper methods _canAnchorAt and _canStopAt ===
# Insert right before the dist function
OLD_BEFORE_DIST = """        // 맨해튼 거리 (단일 타일 좌표 간)
        dist(x1, y1, x2, y2) {"""

NEW_BEFORE_DIST = """        // ─── 멀티타일 이동 헬퍼 ───
        /** 앵커를 (ax,ay)에 놓았을 때 모든 점유 타일이 이동 가능한가? (통과 검증) */
        _canAnchorAt(unit, ax, ay) {
            const ox = ax - unit.anchor.x;
            const oy = ay - unit.anchor.y;
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    if (!this.inBounds(tx, ty)) return false;
                    if (!this.isPassable(tx, ty)) return false;
                    // 타일에 있는 유닛 확인 (자기 자신은 제외)
                    for (const u of SM._units) {
                        if (u === unit) continue;
                        if (!u.isAlive()) continue;
                        if (u.occupies(tx, ty)) {
                            // 적 팀은 통과 불가
                            if (u.teamId !== unit.teamId) return false;
                        }
                    }
                }
            }
            return true;
        },

        /** 앵커를 (ax,ay)에 놓았을 때 최종 정지할 수 있는가? (점유 검증) */
        _canStopAt(unit, ax, ay) {
            const ox = ax - unit.anchor.x;
            const oy = ay - unit.anchor.y;
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const tx = ox + i, ty = oy + j;
                    // 다른 유닛이 점유 중이면 정지 불가
                    if (this.isOccupied(tx, ty, unit)) return false;
                }
            }
            return true;
        },

        // 맨해튼 거리 (단일 타일 좌표 간)
        dist(x1, y1, x2, y2) {"""

data = patch_replace(data, OLD_BEFORE_DIST, NEW_BEFORE_DIST, "Add _canAnchorAt/_canStopAt helpers")

# Write
write_file(data_path, data)
new_size = len(data)
print(f"[INFO] SRPG_Data.js patched size: {new_size} bytes (delta: +{new_size - orig_size})")
print("\n[DONE] Phase 2 patches applied!")
