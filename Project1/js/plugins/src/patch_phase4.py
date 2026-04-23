#!/usr/bin/env python3
"""Phase 4: Multi-tile sprite rendering for SRPG_UI.js"""
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

ui_path = "/sessions/funny-eager-meitner/mnt/Project1/js/plugins/src/SRPG_UI.js"
ui = read_file(ui_path)
orig_size = len(ui)
print(f"[INFO] SRPG_UI.js size: {orig_size} bytes")

# === Patch 1: Update _srpgPDrawShadow for multi-tile ===
OLD_SHADOW = """    // ─── 그림자 그리기 (팀색상 외곽선 포함) ───
    Sprite_Character.prototype._srpgPDrawShadow = function(unit) {
        const g = this._srpgPShadow;
        g.clear();
        const tc = unit.teamColor().fill;
        g.lineStyle(1.5, tc, 0.65);
        g.beginFill(tc, 0.30);
        const tw = $gameMap.tileWidth();
        g.drawEllipse(0, 0, tw * 0.38, tw * 0.13);
        g.endFill();
        g.lineStyle(0);
        g.beginFill(0x000000, 0.25);
        g.drawEllipse(0, 0, tw * 0.25, tw * 0.09);
        g.endFill();
    };"""

NEW_SHADOW = """    // ─── 그림자 그리기 (팀색상 외곽선 포함, 멀티타일 대응) ───
    Sprite_Character.prototype._srpgPDrawShadow = function(unit) {
        const g = this._srpgPShadow;
        g.clear();
        const tc = unit.teamColor().fill;
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();

        if (unit.isSingleTile()) {
            // 기존: 1×1 타원 그림자
            g.lineStyle(1.5, tc, 0.65);
            g.beginFill(tc, 0.30);
            g.drawEllipse(0, 0, tw * 0.38, tw * 0.13);
            g.endFill();
            g.lineStyle(0);
            g.beginFill(0x000000, 0.25);
            g.drawEllipse(0, 0, tw * 0.25, tw * 0.09);
            g.endFill();
        } else {
            // 멀티타일: 점유 영역 전체에 걸쳐 바닥 표시
            const ox = -unit.anchor.x * tw;
            const oy = -unit.anchor.y * th;
            const fullW = unit.gridW * tw;
            const fullH = unit.gridH * th;
            // 팀 컬러 영역 표시
            g.lineStyle(2, tc, 0.7);
            g.beginFill(tc, 0.15);
            g.drawRoundedRect(ox - tw/2 + 2, oy - th + 2, fullW - 4, fullH - 4, 4);
            g.endFill();
            // 각 점유 타일에 작은 그림자 점
            g.lineStyle(0);
            for (let i = 0; i < unit.gridW; i++) {
                for (let j = 0; j < unit.gridH; j++) {
                    const cx = ox + i * tw;
                    const cy = oy + j * th - th/2;
                    g.beginFill(0x000000, 0.15);
                    g.drawEllipse(cx, cy, tw * 0.2, tw * 0.07);
                    g.endFill();
                }
            }
        }
    };"""

ui = patch_replace(ui, OLD_SHADOW, NEW_SHADOW, "_srpgPDrawShadow: multi-tile support")

# === Patch 2: Update _srpgPLoadImage for multi-tile sprite scaling ===
OLD_LOAD_IMG = """    // ─── 초상화 이미지 로드 ───
    Sprite_Character.prototype._srpgPLoadImage = function(unit) {
        const name = unit.currentPortraitName();
        if (!name || name === this._srpgPName) return;
        this._srpgPName = name;
        const bmp = unit.loadPortraitBitmap(name);
        if (!bmp) return;

        const isSV = this._srpgPIsSV;
        const spr = this._srpgPSprite;
        const glow = this._srpgPGlow;

        bmp.addLoadListener(() => {
            if (isSV) {
                const fw = 64, fh = 64;
                const canvas = document.createElement("canvas");
                canvas.width = fw; canvas.height = fh;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(bmp._canvas || bmp._image, 0, 0, fw, fh, 0, 0, fw, fh);
                const tex = PIXI.Texture.from(canvas);
                spr.texture = tex;
                glow.texture = tex;
            } else {
                const baseTex = bmp._canvas
                    ? PIXI.Texture.from(bmp._canvas)
                    : PIXI.Texture.from(bmp._image);
                spr.texture = baseTex;
                glow.texture = baseTex;
            }
            const tw = $gameMap.tileWidth();
            const maxH = tw * PORTRAIT_MAX_H;
            const iw = spr.texture.width || 1;
            const ih = spr.texture.height || 1;
            let sc = tw / iw;
            if (ih * sc > maxH) sc = maxH / ih;
            this._srpgPScale = sc;
            spr.scale.set(sc, sc);
            glow.scale.set(sc * 1.1, sc * 1.1);
        });
    };"""

NEW_LOAD_IMG = """    // ─── 초상화 이미지 로드 (멀티타일: 커스텀 스프라이트 대응) ───
    Sprite_Character.prototype._srpgPLoadImage = function(unit) {
        // 멀티타일 커스텀 스프라이트 처리
        if (!unit.isSingleTile() && unit.spriteFile) {
            this._srpgPLoadMultiTileSprite(unit);
            return;
        }
        const name = unit.currentPortraitName();
        if (!name || name === this._srpgPName) return;
        this._srpgPName = name;
        const bmp = unit.loadPortraitBitmap(name);
        if (!bmp) return;

        const isSV = this._srpgPIsSV;
        const spr = this._srpgPSprite;
        const glow = this._srpgPGlow;

        bmp.addLoadListener(() => {
            if (isSV) {
                const fw = 64, fh = 64;
                const canvas = document.createElement("canvas");
                canvas.width = fw; canvas.height = fh;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(bmp._canvas || bmp._image, 0, 0, fw, fh, 0, 0, fw, fh);
                const tex = PIXI.Texture.from(canvas);
                spr.texture = tex;
                glow.texture = tex;
            } else {
                const baseTex = bmp._canvas
                    ? PIXI.Texture.from(bmp._canvas)
                    : PIXI.Texture.from(bmp._image);
                spr.texture = baseTex;
                glow.texture = baseTex;
            }
            const tw = $gameMap.tileWidth();
            const maxH = unit.isSingleTile()
                ? tw * PORTRAIT_MAX_H
                : unit.gridH * tw * PORTRAIT_MAX_H;
            const iw = spr.texture.width || 1;
            const ih = spr.texture.height || 1;
            let sc = (unit.isSingleTile() ? tw : unit.gridW * tw) / iw;
            if (ih * sc > maxH) sc = maxH / ih;
            this._srpgPScale = sc;
            spr.scale.set(sc, sc);
            glow.scale.set(sc * 1.1, sc * 1.1);
        });
    };

    // ─── 멀티타일 커스텀 스프라이트 로드 ───
    Sprite_Character.prototype._srpgPLoadMultiTileSprite = function(unit) {
        const sprFile = unit.spriteFile;
        if (sprFile === this._srpgPName) return;
        this._srpgPName = sprFile;
        const folder = unit.spriteFolder || "img/characters";
        const bmp = ImageManager.loadBitmap(folder + "/", sprFile);
        if (!bmp) return;

        const spr = this._srpgPSprite;
        const glow = this._srpgPGlow;

        bmp.addLoadListener(() => {
            const baseTex = bmp._canvas
                ? PIXI.Texture.from(bmp._canvas)
                : PIXI.Texture.from(bmp._image);
            spr.texture = baseTex;
            glow.texture = baseTex;
            // 스프라이트를 점유 영역에 정확히 맞춤
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const targetW = unit.gridW * tw;
            const targetH = unit.gridH * th;
            const iw = baseTex.width || 1;
            const ih = baseTex.height || 1;
            const scX = targetW / iw;
            const scY = targetH / ih;
            const sc = Math.min(scX, scY); // 비율 유지
            this._srpgPScale = sc;
            spr.scale.set(sc, sc);
            glow.scale.set(sc * 1.05, sc * 1.05);
            // 멀티타일 스프라이트는 앵커를 영역 중심-하단으로
            spr.anchor.set(0.5, 1);
            glow.anchor.set(0.5, 1);
        });
    };"""

ui = patch_replace(ui, OLD_LOAD_IMG, NEW_LOAD_IMG,
    "_srpgPLoadImage: multi-tile sprite scaling")

# === Patch 3: Update _srpgPUpdatePosition for multi-tile offset ===
OLD_UPDATE_POS = """    Sprite_Character.prototype._srpgPUpdatePosition = function() {
        const ch = this._character;
        this.x = ch.screenX();
        this.y = ch.screenY();
        this.z = ch.screenZ();
    };"""

NEW_UPDATE_POS = """    Sprite_Character.prototype._srpgPUpdatePosition = function() {
        const ch = this._character;
        const unit = this._srpgPUnit;
        if (unit && !unit.isSingleTile()) {
            // 멀티타일: 스프라이트 위치를 점유 영역 중심으로 조정
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const centerOffX = (unit.gridW / 2 - unit.anchor.x - 0.5) * tw;
            const centerOffY = (unit.gridH - unit.anchor.y - 1) * th;
            this.x = ch.screenX() + centerOffX;
            this.y = ch.screenY() + centerOffY;
        } else {
            this.x = ch.screenX();
            this.y = ch.screenY();
        }
        this.z = ch.screenZ();
    };"""

ui = patch_replace(ui, OLD_UPDATE_POS, NEW_UPDATE_POS,
    "_srpgPUpdatePosition: multi-tile center offset")

# Write
write_file(ui_path, ui)
new_size = len(ui)
print(f"[INFO] SRPG_UI.js patched size: {new_size} bytes (delta: +{new_size - orig_size})")
print("\n[DONE] Phase 4 patches applied!")
