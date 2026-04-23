#!/usr/bin/env python3
"""Phase 5: Upgrade SrpgSummon for Actor DB-based + multi-tile + duration/limit"""
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

# === Patch 1: Upgrade parseSummonMeta to support actorId-based summon ===
OLD_PARSE = """        // 스킬 노트 태그 파싱: <srpgSummon:타입> + 옵션
        parseSummonMeta(skillId) {
            if (!skillId || !$dataSkills[skillId]) return null;
            const skill = $dataSkills[skillId];
            const note = skill.note || "";
            const m = note.match(/<srpgSummon:\s*(\w+)>/i);
            if (!m) return null;
            const typeName = m[1].toLowerCase();
            const base = this.TYPES[typeName];
            const meta = {
                type: typeName,
                name: base ? base.name : typeName,
                hp: base ? base.hp : 60,
                def: base ? base.def : 5,
                charName: base ? base.charName : "",
                charIndex: base ? base.charIndex : 0,
                tileColor: base ? base.tileColor : 0x888888,
                teamId: -1, // -1 = 소환자의 팀으로 설정
                summonAnim: 0,
            };
            // 커스텀 옵션 파싱
            const hp = note.match(/<srpgSummonHp:\s*(\d+)>/i);
            if (hp) meta.hp = Number(hp[1]);
            const def = note.match(/<srpgSummonDef:\s*(\d+)>/i);
            if (def) meta.def = Number(def[1]);
            const name = note.match(/<srpgSummonName:\s*(.+?)>/i);
            if (name) meta.name = name[1].trim();
            const anim = note.match(/<srpgSummonAnim:\s*(\d+)>/i);
            if (anim) meta.summonAnim = Number(anim[1]);
            const team = note.match(/<srpgSummonTeam:\s*(\d+)>/i);
            if (team) meta.teamId = Number(team[1]);
            const charN = note.match(/<srpgSummonChar:\s*(.+?)>/i);
            if (charN) {
                const parts = charN[1].split(",");
                meta.charName = parts[0].trim();
                if (parts[1]) meta.charIndex = Number(parts[1].trim());
            }
            return meta;
        },"""

NEW_PARSE = """        // 스킬 노트 태그 파싱: <srpgSummon:actorId|타입> + 옵션
        parseSummonMeta(skillId) {
            if (!skillId || !$dataSkills[skillId]) return null;
            const skill = $dataSkills[skillId];
            const note = skill.note || "";
            const m = note.match(/<srpgSummon:\s*(\w+)>/i);
            if (!m) return null;
            const val = m[1];

            // actorId(숫자) vs 레거시 타입명 판별
            const actorId = Number(val);
            const isActorBased = !isNaN(actorId) && actorId > 0 && $dataActors[actorId];

            let meta;
            if (isActorBased) {
                // ─── 액터 DB 기반 소환 (신규) ───
                const actor = $dataActors[actorId];
                const aMeta = {};
                const aLines = (actor.note || "").split(/[\r\n]+/);
                for (const ln of aLines) {
                    const mm = ln.match(/<(\w+):(.+?)>/);
                    if (mm) aMeta[mm[1]] = mm[2].trim();
                }
                meta = {
                    actorId: actorId,
                    type: "actor",
                    name: actor.name || "소환물",
                    hp: 100, def: 0,
                    charName: actor.characterName || "",
                    charIndex: actor.characterIndex || 0,
                    tileColor: 0x888888,
                    teamId: -1,
                    summonAnim: 0,
                    // 멀티타일 정보 (액터 DB에서 읽음)
                    gridW: Math.max(1, Number(aMeta.srpgGridW || 1)),
                    gridH: Math.max(1, Number(aMeta.srpgGridH || 1)),
                    anchor: { x: 0, y: 0 },
                    unitType: aMeta.srpgUnitType || "object",
                    objectFlags: (aMeta.srpgObjectFlags || "").split(",").filter(f => f.trim()),
                    spriteFile: aMeta.srpgSpriteFile || null,
                    spriteFolder: aMeta.srpgSpriteFolder || null,
                };
                if (aMeta.srpgAnchor) {
                    const ap = aMeta.srpgAnchor.split(",");
                    meta.anchor = { x: Number(ap[0]) || 0, y: Number(ap[1]) || 0 };
                }
                // 액터의 클래스에서 HP/DEF 추출
                const clsId = actor.classId || 1;
                const cls = $dataClasses[clsId];
                if (cls && cls.params && Array.isArray(cls.params[0])) {
                    meta.hp = cls.params[0][1] || 100;  // Lv1 MHP
                    meta.def = cls.params[3][1] || 0;    // Lv1 DEF
                }
            } else {
                // ─── 레거시 타입 기반 소환 (하위 호환) ───
                const typeName = val.toLowerCase();
                const base = this.TYPES[typeName];
                meta = {
                    actorId: 0,
                    type: typeName,
                    name: base ? base.name : typeName,
                    hp: base ? base.hp : 60,
                    def: base ? base.def : 5,
                    charName: base ? base.charName : "",
                    charIndex: base ? base.charIndex : 0,
                    tileColor: base ? base.tileColor : 0x888888,
                    teamId: -1,
                    summonAnim: 0,
                    gridW: 1, gridH: 1,
                    anchor: { x: 0, y: 0 },
                    unitType: "object",
                    objectFlags: [],
                    spriteFile: null,
                    spriteFolder: null,
                };
            }
            // 공통 커스텀 옵션 파싱
            const hp = note.match(/<srpgSummonHp:\s*(\d+)>/i);
            if (hp) meta.hp = Number(hp[1]);
            const def = note.match(/<srpgSummonDef:\s*(\d+)>/i);
            if (def) meta.def = Number(def[1]);
            const name = note.match(/<srpgSummonName:\s*(.+?)>/i);
            if (name) meta.name = name[1].trim();
            const anim = note.match(/<srpgSummonAnim:\s*(\d+)>/i);
            if (anim) meta.summonAnim = Number(anim[1]);
            const team = note.match(/<srpgSummonTeam:\s*(\d+)>/i);
            if (team) meta.teamId = Number(team[1]);
            const charN = note.match(/<srpgSummonChar:\s*(.+?)>/i);
            if (charN) {
                const parts = charN[1].split(",");
                meta.charName = parts[0].trim();
                if (parts[1]) meta.charIndex = Number(parts[1].trim());
            }
            // 소환 제한/지속 파싱
            const dur = note.match(/<srpgSummonDuration:\s*(\d+)>/i);
            meta.duration = dur ? Number(dur[1]) : 0; // 0 = 영구
            const lim = note.match(/<srpgSummonLimit:\s*(\d+)>/i);
            meta.limit = lim ? Number(lim[1]) : 99;
            const rng = note.match(/<srpgSummonRange:\s*(.+?)>/i);
            meta.range = rng ? rng[1].trim() : "1-3";
            return meta;
        },"""

data = patch_replace(data, OLD_PARSE, NEW_PARSE,
    "parseSummonMeta: Actor DB + multi-tile + duration/limit")

# === Patch 2: Upgrade spawn() for multi-tile + duration/limit ===
OLD_SPAWN = """        // 오브젝트 소환 실행
        spawn(summoner, tx, ty, meta) {
            // 해당 타일에 이미 유닛이 있으면 실패
            if (SM.unitAt(tx, ty)) return null;
            // 이동 불가 지형이면 실패
            if (!SrpgGrid.isPassable(tx, ty)) return null;

            const teamId = meta.teamId >= 0 ? meta.teamId : summoner.teamId;

            // 이벤트 프록시 생성
            const proxy = new SrpgEventProxy(tx, ty, meta.name, meta.charName, meta.charIndex);

            // SrpgUnit 생성을 위한 가짜 메타
            const unitMeta = {
                srpgUnit: summoner.team,
                srpgTeam: String(teamId),
                srpgObject: "true",
                srpgObjectHp: String(meta.hp),
                srpgObjectDef: String(meta.def),
                srpgObjectName: meta.name,
            };

            const unit = new SrpgUnit(proxy, unitMeta);
            unit._summoned = true;     // 동적 소환 마커
            unit._summonerId = SM._units.indexOf(summoner);
            SM._units.push(unit);"""

NEW_SPAWN = """        // 오브젝트 소환 실행 (멀티타일 대응)
        spawn(summoner, tx, ty, meta) {
            const gw = meta.gridW || 1;
            const gh = meta.gridH || 1;
            const anc = meta.anchor || { x: 0, y: 0 };

            // 멀티타일: 모든 점유 타일 검증
            const ox = tx - anc.x;
            const oy = ty - anc.y;
            for (let i = 0; i < gw; i++) {
                for (let j = 0; j < gh; j++) {
                    const cx = ox + i, cy = oy + j;
                    if (!SrpgGrid.inBounds(cx, cy)) return null;
                    if (!SrpgGrid.isPassable(cx, cy)) return null;
                    if (SrpgGrid.isOccupied(cx, cy)) return null;
                }
            }

            // 소환 제한 확인
            if (meta.limit < 99) {
                const summonerIdx = SM._units.indexOf(summoner);
                const activeSummons = SM._units.filter(u =>
                    u._summoned && u._summonerId === summonerIdx &&
                    u._summonSkillType === (meta.type || "actor") && u.isAlive()
                ).length;
                if (activeSummons >= meta.limit) {
                    SM._addPopup(tx, ty, "소환 한도 초과!", "#ff4444");
                    return null;
                }
            }

            const teamId = meta.teamId >= 0 ? meta.teamId : summoner.teamId;

            // 이벤트 프록시 생성
            const proxy = new SrpgEventProxy(tx, ty, meta.name, meta.charName, meta.charIndex);

            // SrpgUnit 생성을 위한 가짜 메타
            const unitMeta = {
                srpgUnit: summoner.team,
                srpgTeam: String(teamId),
                srpgObject: "true",
                srpgObjectHp: String(meta.hp),
                srpgObjectDef: String(meta.def),
                srpgObjectName: meta.name,
                // 멀티타일 정보 전달
                srpgGridW: String(gw),
                srpgGridH: String(gh),
                srpgAnchor: `${anc.x},${anc.y}`,
                srpgUnitType: meta.unitType || "object",
            };
            if (meta.objectFlags && meta.objectFlags.length > 0) {
                unitMeta.srpgObjectFlags = meta.objectFlags.join(",");
            }
            if (meta.spriteFile) unitMeta.srpgSpriteFile = meta.spriteFile;
            if (meta.spriteFolder) unitMeta.srpgSpriteFolder = meta.spriteFolder;

            const unit = new SrpgUnit(proxy, unitMeta);
            unit._summoned = true;     // 동적 소환 마커
            unit._summonerId = SM._units.indexOf(summoner);
            unit._summonSkillType = meta.type || "actor";
            unit._summonDuration = meta.duration || 0; // 0 = 영구
            unit._summonTurnsLeft = meta.duration || 0;
            SM._units.push(unit);"""

data = patch_replace(data, OLD_SPAWN, NEW_SPAWN,
    "spawn: multi-tile + duration/limit support")

# === Patch 3: Update _createSprite for multi-tile objects ===
OLD_CREATE_SPRITE = """        // 소환물 PIXI 스프라이트 생성
        _createSprite(unit, proxy, meta) {
            const tilemap = SrpgUI._tilemap;
            if (!tilemap) return;

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();

            // 컨테이너 (타일맵 자식, z=3 캐릭터와 동일)
            const container = new PIXI.Container();
            container.z = 3;

            // ── 타일 표시 (색상 사각형 + 외곽) ──
            const tileGfx = new PIXI.Graphics();
            tileGfx.beginFill(meta.tileColor, 0.35);
            tileGfx.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
            tileGfx.endFill();
            tileGfx.lineStyle(1, meta.tileColor, 0.7);
            tileGfx.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
            tileGfx.lineStyle(0);
            container.addChild(tileGfx);

            // ── X 마크 (엄폐물 표시) ──
            const xMark = new PIXI.Graphics();
            xMark.lineStyle(2, 0xffffff, 0.5);
            const cx = tw / 2, cy = th / 2, sz = 6;
            xMark.moveTo(cx - sz, cy - sz); xMark.lineTo(cx + sz, cy + sz);
            xMark.moveTo(cx + sz, cy - sz); xMark.lineTo(cx - sz, cy + sz);
            xMark.lineStyle(0);
            container.addChild(xMark);

            // ── 이름 텍스트 ──
            const _rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            const nameText = new PIXI.Text(meta.name, {
                fontFamily: "sans-serif", fontSize: Math.round(9 * _rs), fontWeight: "bold",
                fill: "#ffffff", stroke: "#000000", strokeThickness: Math.round(2 * _rs),
                align: "center",
            });
            nameText.anchor.set(0.5, 0);
            nameText.x = tw / 2;
            nameText.y = 1;
            container.addChild(nameText);

            // ── HP 바 ──
            const hpBarBg = new PIXI.Graphics();
            hpBarBg.beginFill(0x000000, 0.6);
            hpBarBg.drawRect(4, th - 8, tw - 8, 4);
            hpBarBg.endFill();
            container.addChild(hpBarBg);
            const hpBar = new PIXI.Graphics();
            container.addChild(hpBar);
            container._hpBar = hpBar;
            container._hpBarW = tw - 8;"""

NEW_CREATE_SPRITE = """        // 소환물 PIXI 스프라이트 생성 (멀티타일 대응)
        _createSprite(unit, proxy, meta) {
            const tilemap = SrpgUI._tilemap;
            if (!tilemap) return;

            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const gw = unit.gridW;
            const gh = unit.gridH;
            const fullW = gw * tw;
            const fullH = gh * th;

            // 컨테이너 (타일맵 자식, z=3 캐릭터와 동일)
            const container = new PIXI.Container();
            container.z = 3;

            // ── 타일 표시 (멀티타일 전체 영역) ──
            const tileGfx = new PIXI.Graphics();
            if (gw === 1 && gh === 1) {
                // 기존 1×1 렌더링
                tileGfx.beginFill(meta.tileColor, 0.35);
                tileGfx.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
                tileGfx.endFill();
                tileGfx.lineStyle(1, meta.tileColor, 0.7);
                tileGfx.drawRoundedRect(2, 2, tw - 4, th - 4, 3);
                tileGfx.lineStyle(0);
            } else {
                // 멀티타일: 전체 영역 + 개별 타일 그리드 표시
                const offX = -unit.anchor.x * tw;
                const offY = -unit.anchor.y * th;
                tileGfx.beginFill(meta.tileColor, 0.30);
                tileGfx.drawRoundedRect(offX + 2, offY + 2, fullW - 4, fullH - 4, 4);
                tileGfx.endFill();
                tileGfx.lineStyle(1.5, meta.tileColor, 0.7);
                tileGfx.drawRoundedRect(offX + 2, offY + 2, fullW - 4, fullH - 4, 4);
                // 내부 그리드 선
                tileGfx.lineStyle(0.5, meta.tileColor, 0.3);
                for (let i = 1; i < gw; i++) {
                    const lx = offX + i * tw;
                    tileGfx.moveTo(lx, offY + 4);
                    tileGfx.lineTo(lx, offY + fullH - 4);
                }
                for (let j = 1; j < gh; j++) {
                    const ly = offY + j * th;
                    tileGfx.moveTo(offX + 4, ly);
                    tileGfx.lineTo(offX + fullW - 4, ly);
                }
                tileGfx.lineStyle(0);
            }
            container.addChild(tileGfx);

            // ── X 마크 (엄폐물 표시, 앵커 타일) ──
            const xMark = new PIXI.Graphics();
            xMark.lineStyle(2, 0xffffff, 0.5);
            const cx = tw / 2, cy = th / 2, sz = 6;
            xMark.moveTo(cx - sz, cy - sz); xMark.lineTo(cx + sz, cy + sz);
            xMark.moveTo(cx + sz, cy - sz); xMark.lineTo(cx - sz, cy + sz);
            xMark.lineStyle(0);
            container.addChild(xMark);

            // ── 이름 텍스트 (멀티타일은 중앙에 표시) ──
            const _rs = Math.min(Graphics.width / 816, Graphics.height / 624);
            const nameText = new PIXI.Text(meta.name, {
                fontFamily: "sans-serif", fontSize: Math.round(9 * _rs), fontWeight: "bold",
                fill: "#ffffff", stroke: "#000000", strokeThickness: Math.round(2 * _rs),
                align: "center",
            });
            nameText.anchor.set(0.5, 0);
            if (gw > 1 || gh > 1) {
                const offX = -unit.anchor.x * tw;
                const offY = -unit.anchor.y * th;
                nameText.x = offX + fullW / 2;
                nameText.y = offY + 1;
            } else {
                nameText.x = tw / 2;
                nameText.y = 1;
            }
            container.addChild(nameText);

            // ── HP 바 (멀티타일은 전체 영역 하단) ──
            const hpBarBg = new PIXI.Graphics();
            const barOffX = (gw > 1 || gh > 1) ? -unit.anchor.x * tw : 0;
            const barOffY = (gw > 1 || gh > 1) ? -unit.anchor.y * th : 0;
            const barW = fullW - 8;
            hpBarBg.beginFill(0x000000, 0.6);
            hpBarBg.drawRect(barOffX + 4, barOffY + fullH - 8, barW, 4);
            hpBarBg.endFill();
            container.addChild(hpBarBg);
            const hpBar = new PIXI.Graphics();
            container.addChild(hpBar);
            container._hpBar = hpBar;
            container._hpBarW = barW;
            container._hpBarOffX = barOffX + 4;
            container._hpBarOffY = barOffY + fullH - 8;"""

data = patch_replace(data, OLD_CREATE_SPRITE, NEW_CREATE_SPRITE,
    "_createSprite: multi-tile sprite rendering")

# === Patch 4: Update _updateHpBar for multi-tile offset ===
OLD_HP_BAR = """        // HP 바 업데이트
        _updateHpBar(unit) {
            const c = unit._spriteContainer;
            if (!c || !c._hpBar) return;
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const hpBar = c._hpBar;
            hpBar.clear();
            const ratio = Math.max(0, unit.hp / unit.mhp);
            const color = ratio > 0.5 ? 0x44cc44 : (ratio > 0.25 ? 0xcccc44 : 0xcc4444);
            hpBar.beginFill(color, 0.9);
            hpBar.drawRect(4, th - 8, c._hpBarW * ratio, 4);
            hpBar.endFill();
        },"""

NEW_HP_BAR = """        // HP 바 업데이트 (멀티타일 위치 대응)
        _updateHpBar(unit) {
            const c = unit._spriteContainer;
            if (!c || !c._hpBar) return;
            const hpBar = c._hpBar;
            hpBar.clear();
            const ratio = Math.max(0, unit.hp / unit.mhp);
            const color = ratio > 0.5 ? 0x44cc44 : (ratio > 0.25 ? 0xcccc44 : 0xcc4444);
            const bx = c._hpBarOffX !== undefined ? c._hpBarOffX : 4;
            const by = c._hpBarOffY !== undefined ? c._hpBarOffY : $gameMap.tileHeight() - 8;
            hpBar.beginFill(color, 0.9);
            hpBar.drawRect(bx, by, c._hpBarW * ratio, 4);
            hpBar.endFill();
        },"""

data = patch_replace(data, OLD_HP_BAR, NEW_HP_BAR,
    "_updateHpBar: multi-tile position offset")

# === Patch 5: Add summon duration tick in update() ===
# Add duration tracking after the existing update() loop
OLD_UPDATE_END = """                this._updateHpBar(u);
                this._updateSpritePos(u);
                this._updateTargetGlow(u, atkTiles);
                // ── 피격 효과 (SrpgFX 연동) ──
                this._applyHitFX(u);
            }
        },"""

NEW_UPDATE_END = """                this._updateHpBar(u);
                this._updateSpritePos(u);
                this._updateTargetGlow(u, atkTiles);
                // ── 피격 효과 (SrpgFX 연동) ──
                this._applyHitFX(u);
            }
        },

        // 턴 종료 시 소환물 지속시간 감소 (SM에서 호출)
        tickSummonDurations() {
            for (const u of SM._units) {
                if (!u._summoned || !u.isAlive()) continue;
                if (u._summonDuration > 0 && u._summonTurnsLeft > 0) {
                    u._summonTurnsLeft--;
                    if (u._summonTurnsLeft <= 0) {
                        u._alive = false;
                        SM._addPopup(u.x, u.y, `${u.name} 소멸`, "#aaaaaa");
                    }
                }
            }
        },

        // 특정 소환자의 활성 소환물 수
        countActiveSummons(summoner, skillType) {
            const idx = SM._units.indexOf(summoner);
            return SM._units.filter(u =>
                u._summoned && u._summonerId === idx &&
                (!skillType || u._summonSkillType === skillType) && u.isAlive()
            ).length;
        },

        // 소환물 전체 제거 (전투 종료 시)
        clearAll() {
            for (const u of SM._units) {
                if (u._summoned && u._spriteContainer) {
                    if (u._spriteContainer.parent) {
                        u._spriteContainer.parent.removeChild(u._spriteContainer);
                    }
                    u._spriteContainer = null;
                }
            }
        },"""

data = patch_replace(data, OLD_UPDATE_END, NEW_UPDATE_END,
    "SrpgSummon: add duration tick + helpers")

# Write
write_file(data_path, data)
new_size = len(data)
print(f"[INFO] SRPG_Data.js patched size: {new_size} bytes (delta: +{new_size - orig_size})")
print("\n[DONE] Phase 5 patches applied!")
