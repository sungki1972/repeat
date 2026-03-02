#!/usr/bin/env python3
"""
Violin Practice - 구간 반복 연습 플레이어 서버
PIN 폴더 기반 인증 + FTP 동기화 + 파일 업로드
"""

import os
import json
import mimetypes
import cgi
import io
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from ftplib import FTP
from pathlib import Path
from urllib.parse import unquote, parse_qs, urlparse
from datetime import datetime

# 설정
PORT = int(os.environ.get('PORT', 8080))
AUDIO_CACHE_DIR = Path(__file__).parent / 'audio_cache'
STATIC_DIR = Path(__file__).parent

# FTP 설정
FTP_CONFIG = {
    'host': '9899.i234.me',
    'port': 480,
    'user': 'gihwaja',
    'pass': 'dmswns9151',
    'path': 'web/repeat'
}

# MIME 타입 추가
mimetypes.add_type('audio/mp4', '.m4a')
mimetypes.add_type('audio/mpeg', '.mp3')

# 최대 업로드 크기 50MB
MAX_UPLOAD_SIZE = 50 * 1024 * 1024


class RequestHandler(SimpleHTTPRequestHandler):
    """PIN 기반 인증 + Range 요청 지원 HTTP 핸들러"""

    CHUNK_SIZE = 1024 * 1024  # 1MB

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        params = parse_qs(parsed.query)

        # API 엔드포인트
        if path == '/api/check-pin':
            self.handle_check_pin(params)
            return
        elif path == '/api/files':
            self.handle_file_list(params)
            return
        elif path == '/api/sync':
            self.handle_sync(params)
            return

        # 오디오 파일: /audio/PIN/filename.m4a
        if path.startswith('/audio/'):
            parts = path[7:].split('/', 1)
            if len(parts) == 2:
                self.handle_audio_request(parts[0], parts[1])
                return

        # 정적 파일
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == '/api/upload':
            self.handle_upload()
            return

        self.send_error(404)

    def handle_check_pin(self, params):
        """PIN(폴더) 존재 여부 확인"""
        pin = params.get('pin', [''])[0].strip()
        if not pin:
            self.send_json({'valid': False, 'error': '코드를 입력하세요'})
            return

        pin_dir = AUDIO_CACHE_DIR / pin
        if pin_dir.is_dir():
            self.send_json({'valid': True})
        else:
            self.send_json({'valid': False, 'error': '잘못된 코드입니다'})

    def handle_file_list(self, params):
        """특정 PIN 폴더의 오디오 파일 목록"""
        pin = params.get('pin', [''])[0].strip()
        if not pin:
            self.send_json([])
            return

        pin_dir = AUDIO_CACHE_DIR / pin
        if not pin_dir.is_dir():
            self.send_json([])
            return

        files = []
        for f in pin_dir.iterdir():
            if f.suffix.lower() in ['.m4a', '.mp3']:
                stat = f.stat()
                files.append({
                    'name': f.name,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })

        files.sort(key=lambda x: x['name'])
        self.send_json(files)

    def handle_sync(self, params):
        """FTP 동기화 (특정 PIN 또는 전체)"""
        pin = params.get('pin', [''])[0].strip()
        try:
            result = sync_ftp(pin if pin else None)
            self.send_json({'success': True, 'message': result})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)

    def handle_audio_request(self, pin, filename):
        """오디오 파일 (Range 지원)"""
        file_path = AUDIO_CACHE_DIR / pin / unquote(filename)

        if not file_path.exists():
            self.send_error(404, 'File not found')
            return

        file_size = file_path.stat().st_size
        mime_type = mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'

        range_header = self.headers.get('Range')

        if range_header:
            try:
                range_spec = range_header.replace('bytes=', '')
                start_str, end_str = range_spec.split('-')
                start = int(start_str) if start_str else 0
                end = int(end_str) if end_str else min(start + self.CHUNK_SIZE - 1, file_size - 1)
                end = min(end, file_size - 1)

                content_length = end - start + 1

                self.send_response(206)
                self.send_header('Content-Type', mime_type)
                self.send_header('Content-Length', content_length)
                self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()

                with open(file_path, 'rb') as f:
                    f.seek(start)
                    self.wfile.write(f.read(content_length))

            except (ValueError, IOError):
                self.send_error(416, 'Range Not Satisfiable')
        else:
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', file_size)
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()

            with open(file_path, 'rb') as f:
                while chunk := f.read(self.CHUNK_SIZE):
                    self.wfile.write(chunk)

    def handle_upload(self):
        """파일 업로드 처리"""
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in content_type:
            self.send_json({'success': False, 'error': 'Invalid content type'}, 400)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_UPLOAD_SIZE:
            self.send_json({'success': False, 'error': '파일이 너무 큽니다 (최대 50MB)'}, 413)
            return

        # multipart 파싱
        boundary = content_type.split('boundary=')[1].strip()
        environ = {
            'REQUEST_METHOD': 'POST',
            'CONTENT_TYPE': content_type,
            'CONTENT_LENGTH': str(content_length),
        }
        body = self.rfile.read(content_length)
        fs = cgi.FieldStorage(
            fp=io.BytesIO(body),
            environ=environ,
            keep_blank_values=True
        )

        pin = fs.getvalue('pin', '').strip()
        if not pin:
            self.send_json({'success': False, 'error': 'PIN이 필요합니다'}, 400)
            return

        pin_dir = AUDIO_CACHE_DIR / pin
        if not pin_dir.is_dir():
            self.send_json({'success': False, 'error': '잘못된 코드입니다'}, 400)
            return

        file_item = fs['file']
        if not file_item.filename:
            self.send_json({'success': False, 'error': '파일을 선택하세요'}, 400)
            return

        filename = Path(file_item.filename).name
        if not filename.lower().endswith(('.m4a', '.mp3')):
            self.send_json({'success': False, 'error': 'M4A 또는 MP3 파일만 가능합니다'}, 400)
            return

        save_path = pin_dir / filename
        with open(save_path, 'wb') as f:
            f.write(file_item.file.read())

        print(f"  Uploaded: {pin}/{filename} ({save_path.stat().st_size} bytes)")
        self.send_json({'success': True, 'message': f'{filename} 업로드 완료'})

    def send_json(self, data, status=200):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def sync_ftp(target_pin=None):
    """FTP에서 오디오 파일 재귀 동기화"""
    AUDIO_CACHE_DIR.mkdir(exist_ok=True)

    ftp = FTP()
    ftp.connect(FTP_CONFIG['host'], FTP_CONFIG['port'])
    ftp.login(FTP_CONFIG['user'], FTP_CONFIG['pass'])
    ftp.cwd(FTP_CONFIG['path'])

    total_downloaded = 0
    total_deleted = 0

    # 원격 폴더(PIN) 목록 가져오기
    remote_dirs = []
    entries = []
    ftp.retrlines('LIST', entries.append)

    for line in entries:
        parts = line.split()
        if len(parts) >= 9 and line.startswith('d'):
            dirname = ' '.join(parts[8:])
            if dirname not in ('.', '..'):
                if target_pin is None or dirname == target_pin:
                    remote_dirs.append(dirname)

    # 각 폴더(PIN)별 동기화
    for pin_dir_name in remote_dirs:
        local_pin_dir = AUDIO_CACHE_DIR / pin_dir_name
        local_pin_dir.mkdir(exist_ok=True)

        # 해당 폴더의 파일 목록
        remote_files = {}
        ftp.cwd(pin_dir_name)
        ftp.retrlines('LIST', lambda line, rf=remote_files: parse_ftp_list(line, rf))

        # 로컬 파일 목록
        local_files = {f.name: f.stat().st_size for f in local_pin_dir.iterdir()
                       if f.suffix.lower() in ['.m4a', '.mp3']}

        # 다운로드
        for name, size in remote_files.items():
            if name not in local_files or local_files[name] != size:
                local_path = local_pin_dir / name
                with open(local_path, 'wb') as f:
                    ftp.retrbinary(f'RETR {name}', f.write)
                total_downloaded += 1
                print(f"  Downloaded: {pin_dir_name}/{name}")

        # 삭제 (원격에 없는 파일)
        for name in local_files:
            if name not in remote_files:
                (local_pin_dir / name).unlink()
                total_deleted += 1
                print(f"  Deleted: {pin_dir_name}/{name}")

        ftp.cwd('..')

    ftp.quit()
    return f"{total_downloaded} downloaded, {total_deleted} deleted"


def parse_ftp_list(line, result):
    """FTP LIST 출력 파싱"""
    parts = line.split()
    if len(parts) >= 9:
        name = ' '.join(parts[8:])
        if name.lower().endswith(('.m4a', '.mp3')):
            try:
                size = int(parts[4])
                result[name] = size
            except ValueError:
                pass


def start_server():
    AUDIO_CACHE_DIR.mkdir(exist_ok=True)

    server = ThreadingHTTPServer(('0.0.0.0', PORT), RequestHandler)
    print(f"""
  Violin Practice Server
  http://localhost:{PORT}
  Audio: {AUDIO_CACHE_DIR}
""")

    # 시작 시 FTP 동기화
    try:
        print("Syncing with FTP...")
        result = sync_ftp()
        print(f"Done: {result}\n")
    except Exception as e:
        print(f"FTP sync failed: {e}\n")

    server.serve_forever()


if __name__ == '__main__':
    start_server()
