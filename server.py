#!/usr/bin/env python3
"""
🎵 성탄 칸타타 바이올린 연습 플레이어 - 서버
FTP 동기화 + HTTP 서버 (Range 요청 지원)
"""

import os
import json
import mimetypes
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from ftplib import FTP
from pathlib import Path
from urllib.parse import unquote, quote
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

class RangeHTTPRequestHandler(SimpleHTTPRequestHandler):
    """Range 요청을 지원하는 HTTP 핸들러"""
    
    CHUNK_SIZE = 1024 * 1024  # 1MB
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)
    
    def end_headers(self):
        """CORS 및 캐시 헤더 추가"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range')
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()
    
    def do_OPTIONS(self):
        """CORS preflight 요청 처리"""
        self.send_response(204)
        self.end_headers()
    
    def do_GET(self):
        """GET 요청 처리 - API 및 정적 파일"""
        path = unquote(self.path)
        
        # API 엔드포인트
        if path == '/api/files':
            self.handle_file_list()
            return
        elif path == '/api/sync':
            self.handle_sync()
            return
        
        # 오디오 파일 요청
        if path.startswith('/audio/'):
            self.handle_audio_request(path[7:])
            return
        
        # 정적 파일
        super().do_GET()
    
    def handle_file_list(self):
        """오디오 파일 목록 반환"""
        files = []
        if AUDIO_CACHE_DIR.exists():
            for f in AUDIO_CACHE_DIR.iterdir():
                if f.suffix.lower() in ['.m4a', '.mp3']:
                    stat = f.stat()
                    files.append({
                        'name': f.name,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        
        files.sort(key=lambda x: x['name'])
        self.send_json_response(files)
    
    def handle_sync(self):
        """FTP 동기화 실행"""
        try:
            result = sync_ftp()
            self.send_json_response({'success': True, 'message': result})
        except Exception as e:
            self.send_json_response({'success': False, 'error': str(e)}, 500)
    
    def handle_audio_request(self, filename):
        """오디오 파일 요청 처리 (Range 지원)"""
        file_path = AUDIO_CACHE_DIR / unquote(filename)
        
        if not file_path.exists():
            self.send_error(404, 'File not found')
            return
        
        file_size = file_path.stat().st_size
        mime_type = mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'
        
        # Range 헤더 파싱
        range_header = self.headers.get('Range')
        
        if range_header:
            # Range 요청 처리
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
                    
            except (ValueError, IOError) as e:
                self.send_error(416, 'Range Not Satisfiable')
        else:
            # 전체 파일 전송
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', file_size)
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()
            
            with open(file_path, 'rb') as f:
                while chunk := f.read(self.CHUNK_SIZE):
                    self.wfile.write(chunk)
    
    def send_json_response(self, data, status=200):
        """JSON 응답 전송"""
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)
    
    def log_message(self, format, *args):
        """로그 포맷팅"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")


def sync_ftp():
    """FTP에서 오디오 파일 동기화"""
    AUDIO_CACHE_DIR.mkdir(exist_ok=True)
    
    ftp = FTP()
    ftp.connect(FTP_CONFIG['host'], FTP_CONFIG['port'])
    ftp.login(FTP_CONFIG['user'], FTP_CONFIG['pass'])
    ftp.cwd(FTP_CONFIG['path'])
    
    # 원격 파일 목록
    remote_files = {}
    ftp.retrlines('LIST', lambda line: parse_ftp_list(line, remote_files))
    
    # 로컬 파일 목록
    local_files = {f.name: f.stat().st_size for f in AUDIO_CACHE_DIR.iterdir() 
                   if f.suffix.lower() in ['.m4a', '.mp3']}
    
    downloaded = []
    deleted = []
    
    # 다운로드 (새 파일 또는 크기 변경)
    for name, size in remote_files.items():
        if name not in local_files or local_files[name] != size:
            local_path = AUDIO_CACHE_DIR / name
            with open(local_path, 'wb') as f:
                ftp.retrbinary(f'RETR {name}', f.write)
            downloaded.append(name)
            print(f"  ✓ Downloaded: {name}")
    
    # 삭제 (원격에 없는 파일)
    for name in local_files:
        if name not in remote_files:
            (AUDIO_CACHE_DIR / name).unlink()
            deleted.append(name)
            print(f"  ✗ Deleted: {name}")
    
    ftp.quit()
    
    return f"Synced: {len(downloaded)} downloaded, {len(deleted)} deleted"


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
    """HTTP 서버 시작"""
    server = ThreadingHTTPServer(('0.0.0.0', PORT), RangeHTTPRequestHandler)
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  🎵 성탄 칸타타 바이올린 연습 플레이어                          ║
╠══════════════════════════════════════════════════════════════╣
║  Server: http://localhost:{PORT}                              ║
║  Audio Cache: {str(AUDIO_CACHE_DIR):<42} ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    # 시작 시 FTP 동기화
    try:
        print("🔄 Syncing with FTP...")
        result = sync_ftp()
        print(f"✅ {result}\n")
    except Exception as e:
        print(f"⚠️ FTP sync failed: {e}\n")
    
    server.serve_forever()


if __name__ == '__main__':
    start_server()

