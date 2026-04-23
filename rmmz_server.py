#!/usr/bin/env python3
"""
RMMZ Studio Server
Usage: python3 rmmz_server.py [project_path] [port]
  project_path: RMMZ project folder (default: Project1)
  port: HTTP port (default: 8080)

Open http://localhost:8080 in Chrome — that's it.
Browser closes → server auto-shuts down via heartbeat timeout.
"""
import sys, os, json, glob, mimetypes, time, threading, tempfile, shutil
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_FILES = ['Actors','Classes','Skills','Items','Weapons','Armors',
            'Enemies','Troops','States','CommonEvents','System','Tilesets']

KEY_MAP = {}
for _f in DB_FILES:
    KEY_MAP[_f] = _f
    KEY_MAP[_f.lower()] = _f
KEY_MAP['commonEvents'] = 'CommonEvents'
KEY_MAP['commonevents'] = 'CommonEvents'

PROJECT = 'Project1'
STUDIO_DIR = os.path.dirname(os.path.abspath(__file__))

# ─── 하트비트 관리 ───
_last_heartbeat = time.time()
_heartbeat_lock = threading.Lock()
HEARTBEAT_TIMEOUT = 120  # 초 — Chrome 백그라운드 탭 쓰로틀링(~60초) 대비 여유 확보
_server_ref = None

def touch_heartbeat():
    global _last_heartbeat
    with _heartbeat_lock:
        _last_heartbeat = time.time()

def heartbeat_watchdog():
    """백그라운드 스레드: 하트비트 타임아웃 감시"""
    # 서버 시작 직후에는 브라우저가 아직 안 열렸으므로 여유를 줌
    time.sleep(HEARTBEAT_TIMEOUT + 10)
    while True:
        time.sleep(3)
        with _heartbeat_lock:
            elapsed = time.time() - _last_heartbeat
        if elapsed > HEARTBEAT_TIMEOUT:
            print(f'\n  [Auto-shutdown] 브라우저 연결 없음 ({elapsed:.0f}초). 서버를 종료합니다.')
            if _server_ref:
                _server_ref.shutdown()
            break

def load_all():
    data_dir = os.path.join(STUDIO_DIR, PROJECT, 'data')
    result = {'database': {}, 'mapInfos': [], 'maps': {}, 'plugins': []}
    for db_file in DB_FILES:
        fp = os.path.join(data_dir, db_file + '.json')
        if os.path.exists(fp):
            with open(fp, 'r', encoding='utf-8') as f:
                result['database'][db_file] = json.load(f)
    mi = os.path.join(data_dir, 'MapInfos.json')
    if os.path.exists(mi):
        with open(mi, 'r', encoding='utf-8') as f:
            result['mapInfos'] = json.load(f)
    for mf in sorted(glob.glob(os.path.join(data_dir, 'Map[0-9]*.json'))):
        fname = os.path.basename(mf)
        mid = fname.replace('Map','').replace('.json','')
        try:
            mid_int = int(mid)
        except ValueError:
            continue
        with open(mf, 'r', encoding='utf-8') as f:
            result['maps'][str(mid_int)] = json.load(f)
    pp = os.path.join(STUDIO_DIR, PROJECT, 'js', 'plugins.js')
    if os.path.exists(pp):
        with open(pp, 'r', encoding='utf-8') as f:
            c = f.read()
        if '$plugins' in c:
            try:
                s = c.index('[')
                e = c.rindex(']') + 1
                result['plugins'] = json.loads(c[s:e])
            except Exception:
                pass
    return result


def _atomic_write(fp, data_str):
    """원자적 파일 쓰기: tempfile → fsync → rename으로 잘림 방지"""
    dir_name = os.path.dirname(fp)
    fd, tmp = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(data_str)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, fp)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

def _pre_save_backup(data_dir):
    """저장 직전 현재 JSON 파일들을 .bak으로 백업 (1세대만 유지)"""
    for fp in glob.glob(os.path.join(data_dir, '*.json')):
        if '.damaged' in fp or '.bak' in fp:
            continue
        bak = fp + '.bak'
        try:
            shutil.copy2(fp, bak)
        except Exception:
            pass

def save_all(export_data):
    data_dir = os.path.join(STUDIO_DIR, PROJECT, 'data')
    saved = []
    sizes = {}
    # 저장 직전 백업
    _pre_save_backup(data_dir)
    if 'database' in export_data:
        for key, data in export_data['database'].items():
            name = KEY_MAP.get(key, key)
            fp = os.path.join(data_dir, name + '.json')
            data_str = json.dumps(data, ensure_ascii=False, separators=(',',':'))
            _atomic_write(fp, data_str)
            sizes[name + '.json'] = len(data_str.encode('utf-8'))
            saved.append(name + '.json')
    if 'maps' in export_data:
        for mid_str, mdata in export_data['maps'].items():
            mid = int(mid_str)
            fname = 'Map' + str(mid).zfill(3) + '.json'
            fp = os.path.join(data_dir, fname)
            data_str = json.dumps(mdata, ensure_ascii=False, separators=(',',':'))
            _atomic_write(fp, data_str)
            sizes[fname] = len(data_str.encode('utf-8'))
            saved.append(fname)
    if 'mapInfos' in export_data:
        fp = os.path.join(data_dir, 'MapInfos.json')
        data_str = json.dumps(export_data['mapInfos'], ensure_ascii=False, separators=(',',':'))
        _atomic_write(fp, data_str)
        sizes['MapInfos.json'] = len(data_str.encode('utf-8'))
        saved.append('MapInfos.json')
    if export_data.get('plugins'):
        pp = os.path.join(STUDIO_DIR, PROJECT, 'js', 'plugins.js')
        pj = json.dumps(export_data['plugins'], ensure_ascii=False, indent=2)
        plugin_str = '// Generated by RMMZ Studio\nvar $plugins =\n' + pj + ';\n'
        _atomic_write(pp, plugin_str)
        sizes['plugins.js'] = len(plugin_str.encode('utf-8'))
        saved.append('plugins.js')
    return saved, sizes

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STUDIO_DIR, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        # ─── 하트비트 엔드포인트 ───
        if parsed.path == '/api/heartbeat':
            touch_heartbeat()
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == '/api/load':
            touch_heartbeat()
            data = load_all()
            body = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == '/api/status':
            touch_heartbeat()
            info = {'project': PROJECT, 'dbFiles': DB_FILES}
            body = json.dumps(info).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == '/api/list':
            touch_heartbeat()
            qs = parse_qs(parsed.query)
            rel_path = qs.get('path', [''])[0]
            target = os.path.join(STUDIO_DIR, PROJECT, rel_path)
            target = os.path.normpath(target)
            proj_root = os.path.normpath(os.path.join(STUDIO_DIR, PROJECT))
            if not target.startswith(proj_root):
                self.send_response(403)
                self.end_headers()
                return
            files = []
            if os.path.isdir(target):
                for f in sorted(os.listdir(target)):
                    fp = os.path.join(target, f)
                    if os.path.isfile(fp):
                        files.append(f)
            body = json.dumps(files, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == '/' or parsed.path == '':
            self.path = '/RMMZStudio.html'
        if parsed.path.startswith('/project/'):
            rel = parsed.path[len('/project/'):]
            fp = os.path.join(STUDIO_DIR, PROJECT, rel)
            if os.path.isfile(fp):
                ct, _ = mimetypes.guess_type(fp)
                with open(fp, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', ct or 'application/octet-stream')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/save':
            touch_heartbeat()
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                export_data = json.loads(body.decode('utf-8'))
                saved, sizes = save_all(export_data)
                # 저장 후 검증: 실제 파일 크기가 일치하는지 확인
                verified = []
                data_dir = os.path.join(STUDIO_DIR, PROJECT, 'data')
                for fname in saved:
                    if fname in sizes:
                        # plugins.js는 js/ 폴더에 저장됨 (data/ 아님)
                        if fname == 'plugins.js':
                            fp = os.path.join(STUDIO_DIR, PROJECT, 'js', fname)
                        else:
                            fp = os.path.join(data_dir, fname)
                        if os.path.exists(fp):
                            actual = os.path.getsize(fp)
                            expected = sizes[fname]
                            if actual >= expected:
                                verified.append(fname)
                            else:
                                raise Exception(f'{fname}: 쓰기 실패 (expected {expected}B, got {actual}B)')
                        else:
                            raise Exception(f'{fname}: 파일이 생성되지 않음')
                    else:
                        verified.append(fname)
                resp = json.dumps({'success': True, 'saved': verified, 'sizes': sizes}).encode('utf-8')
                self.send_response(200)
            except Exception as e:
                resp = json.dumps({'success': False, 'error': str(e)}).encode('utf-8')
                self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(resp)
            return
        if parsed.path == '/api/upload':
            touch_heartbeat()
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode('utf-8'))
                rel_dir = payload.get('dir', 'img/standing')
                filename = os.path.basename(payload['filename'])  # 경로 조작 방지
                import base64
                data = base64.b64decode(payload['data'])

                target_dir = os.path.join(STUDIO_DIR, PROJECT, rel_dir)
                target_dir = os.path.normpath(target_dir)
                proj_root = os.path.normpath(os.path.join(STUDIO_DIR, PROJECT))
                if not target_dir.startswith(proj_root):
                    raise ValueError('Invalid path')
                os.makedirs(target_dir, exist_ok=True)

                fp = os.path.join(target_dir, filename)
                with open(fp, 'wb') as f:
                    f.write(data)

                resp = json.dumps({'success': True, 'path': rel_dir + '/' + filename}).encode('utf-8')
                self.send_response(200)
            except Exception as e:
                resp = json.dumps({'success': False, 'error': str(e)}).encode('utf-8')
                self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(resp)
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''):
            # heartbeat는 로그 생략 (너무 빈번)
            if 'heartbeat' in (args[0] if args else ''):
                return
            print(f'  [{self.log_date_time_string()}] {fmt % args}')

if __name__ == '__main__':
    if len(sys.argv) > 1:
        PROJECT = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    proj_data = os.path.join(STUDIO_DIR, PROJECT, 'data')
    if not os.path.isdir(proj_data):
        print(f'ERROR: {proj_data} not found')
        sys.exit(1)
    url = f'http://localhost:{port}'
    print(f'RMMZ Studio Server')
    print(f'  Project : {PROJECT}')
    print(f'  Data dir: {proj_data}')
    print(f'  URL     : {url}')
    print(f'  Auto-shutdown: 브라우저 종료 시 {HEARTBEAT_TIMEOUT}초 후 자동 종료')
    print(f'\nCtrl+C to stop.\n')

    server = HTTPServer(('127.0.0.1', port), Handler)
    _server_ref = server

    # 하트비트 감시 스레드 시작
    wd = threading.Thread(target=heartbeat_watchdog, daemon=True)
    wd.start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    print('\nServer stopped.')
