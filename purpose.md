# 🎵 성탄 칸타타 바이올린 연습 플레이어

## 📌 개요
**목적:** 구간 반복(A-B Repeat) 오디오 플레이어  
**플랫폼:** 데스크톱 + 모바일 웹  
**배포:** Railway

## 🎯 핵심 기능
1. **오디오 재생** - M4A/MP3, 웨이브폼 시각화
2. **구간 반복** - 마커 드래그로 A-B 설정
3. **파일 관리** - FTP 동기화, 드래그앤드롭

## 📱 모바일 필수 사항

### 서버
- ThreadingHTTPServer (멀티스레드)
- Range 요청 (206 Partial Content)
- 1MB 청크 전송
- 캐시 헤더 (24시간)
- MIME: .m4a→audio/mp4, .mp3→audio/mpeg

### 클라이언트
- playsinline, preload="auto"
- AudioContext resume 처리
- 터치 이벤트 지원
- 반응형 디자인

## ⚙️ FTP 설정
```
Host: 9899.i234.me:480
User: gihwaja
Pass: dmswns9151
Path: web/repeat
```

## 📁 파일 구조
```
repeatm4a/
├── server.py      # HTTP 서버 + FTP 동기화
├── index.html     # 메인 UI
├── script.js      # 플레이어 로직
├── style.css      # 스타일
├── audio_cache/   # 동기화된 오디오
└── purpose.md     # 이 문서
```

## 🚀 실행
```bash
python server.py
```

## 🎨 UI 특징
- 성탄절 테마 (금색 + 자주색)
- 웨이브폼 시각화
- 터치 친화적 대형 버튼
- 드래그로 구간 조절

## 🔧 API
- `GET /api/files` - 오디오 파일 목록
- `GET /api/sync` - FTP 동기화 실행
- `GET /audio/{filename}` - 오디오 파일 (Range 지원)

