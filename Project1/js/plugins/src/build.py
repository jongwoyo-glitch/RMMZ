#!/usr/bin/env python3
"""
SRPG_Core.js 빌드 스크립트
소스 3개를 순서대로 합쳐 단일 플러그인 파일을 생성한다.
빌드 성공 시 소스 파일을 backup/src_latest/에 자동 백업.

사용법:
    python src/build.py

의존성 순서: Data -> SM -> UI
"""
import os
import sys
import subprocess

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_DIR = os.path.dirname(SRC_DIR)
OUTPUT = os.path.join(PLUGIN_DIR, "SRPG_Core.js")
BACKUP_DIR = os.path.join(PLUGIN_DIR, "backup", "src_latest")

# concat 순서 = 의존성 순서 (변경 금지)
SOURCES = [
    "SRPG_Data.js",   # 상수, 유틸, 유닛, 그리드, 전투, 투사체
    "SRPG_SM.js",     # 메인 상태머신
    "SRPG_UI.js",     # 오버레이, RMMZ 브릿지, 플러그인 커맨드
]

def build():
    parts = []

    # --- 소스 읽기 ---
    for name in SOURCES:
        path = os.path.join(SRC_DIR, name)
        if not os.path.exists(path):
            print("ERROR: %s not found" % path)
            sys.exit(1)

        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        lines = content.count("\n") + (0 if content.endswith("\n") else 1)
        parts.append((name, content, lines))
        print("  %s: %d lines" % (name, lines))

    # --- concat ---
    result = "".join(c for _, c, _ in parts)

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(result)

    out_lines = result.count("\n") + (0 if result.endswith("\n") else 1)
    print("")
    print("  -> %s" % OUTPUT)
    print("  Total: %d lines, %d chars" % (out_lines, len(result)))

    # --- 구문 검증 ---
    # NW.js package.json (main: index.html)이 Node.js --check와 충돌하므로
    # 임시 디렉토리에 복사하여 검증한다.
    import tempfile, shutil
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_js = os.path.join(tmpdir, "SRPG_Core.js")
            shutil.copy2(OUTPUT, tmp_js)
            proc = subprocess.run(
                ["node", "--check", tmp_js],
                capture_output=True, text=True, timeout=10
            )
        if proc.returncode != 0:
            print("")
            print("X 구문 오류!")
            print(proc.stderr)
            sys.exit(1)
        print("")
        print("OK 구문 검증 통과")
    except FileNotFoundError:
        print("  (node 없음 - 구문 검증 건너뜀)")
    except subprocess.TimeoutExpired:
        print("  (node 타임아웃 - 구문 검증 건너뜀)")

    # --- 소스 자동 백업 ---
    os.makedirs(BACKUP_DIR, exist_ok=True)
    for name, content, _ in parts:
        dst = os.path.join(BACKUP_DIR, name)
        with open(dst, "w", encoding="utf-8") as f:
            f.write(content)
    print("OK 소스 백업 -> backup/src_latest/")

    print("")
    print("=== 빌드 완료 ===")

if __name__ == "__main__":
    build()
