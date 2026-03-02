/**
 * Violin Practice - 구간 반복 연습 플레이어
 * PIN 인증 + A-B 구간 반복 + 키보드 단축키
 */

class App {
    constructor() {
        this.currentPin = null;
        this.player = null;
        this.initLogin();
    }

    initLogin() {
        this.loginSection = document.getElementById('loginSection');
        this.mainSection = document.getElementById('mainSection');
        this.pinDots = document.querySelectorAll('.pin-dot');
        this.pinError = document.getElementById('pinError');
        this.pinValue = '';

        // PIN 패드 클릭
        document.querySelectorAll('.pin-key').forEach(btn => {
            btn.addEventListener('click', () => this.onPinKey(btn.dataset.key));
        });

        // 키보드 입력 (로그인 화면)
        document.addEventListener('keydown', (e) => {
            if (this.currentPin) return; // 이미 로그인됨
            if (e.key >= '0' && e.key <= '9') {
                this.onPinKey(e.key);
            } else if (e.key === 'Backspace') {
                this.onPinKey('back');
            } else if (e.key === 'Escape') {
                this.onPinKey('clear');
            }
        });
    }

    onPinKey(key) {
        if (key === 'clear') {
            this.pinValue = '';
        } else if (key === 'back') {
            this.pinValue = this.pinValue.slice(0, -1);
        } else {
            if (this.pinValue.length >= 4) return;
            this.pinValue += key;
        }

        this.pinError.textContent = '';
        this.updatePinDots();

        if (this.pinValue.length === 4) {
            this.checkPin(this.pinValue);
        }
    }

    updatePinDots() {
        this.pinDots.forEach((dot, i) => {
            dot.classList.toggle('filled', i < this.pinValue.length);
        });
    }

    async checkPin(pin) {
        try {
            const res = await fetch(`/api/check-pin?pin=${pin}`);
            const data = await res.json();

            if (data.valid) {
                this.currentPin = pin;
                this.loginSection.classList.add('hidden');
                this.mainSection.classList.remove('hidden');
                this.player = new AudioPlayer(pin);
            } else {
                this.pinError.textContent = data.error || '잘못된 코드입니다';
                this.pinValue = '';
                this.updatePinDots();
                // 흔들기 애니메이션
                this.pinError.parentElement.classList.add('shake');
                setTimeout(() => this.pinError.parentElement.classList.remove('shake'), 500);
            }
        } catch (err) {
            this.pinError.textContent = '서버 연결 실패';
            this.pinValue = '';
            this.updatePinDots();
        }
    }
}


class AudioPlayer {
    constructor(pin) {
        this.pin = pin;

        // DOM
        this.audio = document.getElementById('audioPlayer');
        this.playerSection = document.getElementById('playerSection');
        this.fileList = document.getElementById('fileList');
        this.fileCount = document.getElementById('fileCount');

        // 컨트롤
        this.playBtn = document.getElementById('playBtn');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.syncBtn = document.getElementById('syncBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.helpBtn = document.getElementById('helpBtn');
        this.helpSection = document.getElementById('helpSection');

        // 업로드
        this.fileUpload = document.getElementById('fileUpload');
        this.uploadProgress = document.getElementById('uploadProgress');

        // 구간 반복
        this.setLoopBtn = document.getElementById('setLoopBtn');
        this.resetLoopBtn = document.getElementById('resetLoopBtn');
        this.loopRegion = document.getElementById('loopRegion');
        this.markerA = document.getElementById('markerA');
        this.markerB = document.getElementById('markerB');

        // 웨이브폼
        this.waveformContainer = document.getElementById('waveformContainer');
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.playhead = document.getElementById('playhead');

        // 시간 표시
        this.currentTimeBubble = document.getElementById('currentTimeBubble');
        this.trackNameOverlay = document.getElementById('trackNameOverlay');
        this.loopStartDisplay = document.getElementById('loopStartDisplay');
        this.loopEndDisplay = document.getElementById('loopEndDisplay');
        this.selectedDuration = document.getElementById('selectedDuration');

        // 볼륨 & 속도
        this.volumeSlider = document.getElementById('volumeSlider');

        // 상태
        this.files = [];
        this.currentFile = null;
        this.waveformData = null;
        this.audioContext = null;

        // 구간 반복 상태
        this.loopStart = 0;
        this.loopEnd = 0;
        this.loopEnabled = false;

        // 드래그 상태
        this.isDragging = false;
        this.dragTarget = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupAudioContext();
        this.setupKeyboardShortcuts();
        await this.loadFiles();

        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }

    setupAudioContext() {
        const resumeAudio = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
        };
        document.addEventListener('touchstart', resumeAudio, { once: true });
        document.addEventListener('click', resumeAudio, { once: true });
    }

    setupEventListeners() {
        // 재생
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.skipBackBtn.addEventListener('click', () => this.skip(-10));
        this.skipForwardBtn.addEventListener('click', () => this.skip(10));

        // 오디오 이벤트
        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.audio.addEventListener('play', () => this.updatePlayButton(true));
        this.audio.addEventListener('pause', () => this.updatePlayButton(false));
        this.audio.addEventListener('ended', () => this.onEnded());

        // 구간 반복
        this.setLoopBtn.addEventListener('click', () => this.toggleLoop());
        this.resetLoopBtn.addEventListener('click', () => this.resetLoop());

        // 마커 드래그
        this.setupMarkerDrag();

        // 웨이브폼 클릭
        this.waveformContainer.addEventListener('click', (e) => this.handleWaveformClick(e));

        // 볼륨
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value;
        });

        // 속도
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.audio.playbackRate = speed;
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });

        // 동기화
        this.syncBtn.addEventListener('click', () => this.syncFTP());

        // 로그아웃
        this.logoutBtn.addEventListener('click', () => {
            this.audio.pause();
            this.audio.src = '';
            document.getElementById('mainSection').classList.add('hidden');
            document.getElementById('loginSection').classList.remove('hidden');
            // 앱 리셋
            location.reload();
        });

        // 도움말
        this.helpBtn.addEventListener('click', () => {
            this.helpSection.classList.toggle('hidden');
        });

        // 업로드
        this.fileUpload.addEventListener('change', (e) => this.handleUpload(e));
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Space → 재생/정지
            if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // PIN 로그인 중이면 무시
                if (!this.audio.src) return;
                e.preventDefault();
                this.togglePlay();
                return;
            }

            // Ctrl + ← → -10초
            if (e.ctrlKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.skip(-10);
                return;
            }

            // Ctrl + → → +10초
            if (e.ctrlKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.skip(10);
                return;
            }

            // Ctrl + R → 반복 토글
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.toggleLoop();
                return;
            }
        });
    }

    setupMarkerDrag() {
        this.markerA.addEventListener('mousedown', (e) => this.startDrag(e, 'a'));
        this.markerA.addEventListener('touchstart', (e) => this.startDrag(e, 'a'), { passive: false });

        this.markerB.addEventListener('mousedown', (e) => this.startDrag(e, 'b'));
        this.markerB.addEventListener('touchstart', (e) => this.startDrag(e, 'b'), { passive: false });

        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());
        document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
        document.addEventListener('touchend', () => this.endDrag());
        document.addEventListener('touchcancel', () => this.endDrag());
    }

    startDrag(e, target) {
        e.preventDefault();
        e.stopPropagation();
        this.isDragging = true;
        this.dragTarget = target;

        if (target === 'a') {
            this.markerA.classList.add('dragging');
        } else {
            this.markerB.classList.add('dragging');
        }
    }

    onDrag(e) {
        if (!this.isDragging || !this.audio.duration) return;
        e.preventDefault();

        const rect = this.waveformContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const time = (x / rect.width) * this.audio.duration;

        if (this.dragTarget === 'a') {
            this.loopStart = Math.max(0, Math.min(time, this.loopEnd - 0.5));
        } else if (this.dragTarget === 'b') {
            this.loopEnd = Math.max(this.loopStart + 0.5, Math.min(time, this.audio.duration));
        }

        this.updateMarkerPositions();
        this.updateTimeDisplay();
    }

    endDrag() {
        if (!this.isDragging) return;
        this.markerA.classList.remove('dragging');
        this.markerB.classList.remove('dragging');
        this.isDragging = false;
        this.dragTarget = null;
    }

    handleWaveformClick(e) {
        if (this.isDragging) return;
        if (e.target.closest('.loop-marker')) return;
        if (!this.audio.duration) return;

        const rect = this.waveformContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = x / rect.width;
        this.audio.currentTime = percent * this.audio.duration;
    }

    // ===== 파일 관리 =====

    async loadFiles() {
        try {
            const res = await fetch(`/api/files?pin=${this.pin}`);
            this.files = await res.json();
            this.renderFileList();
        } catch (err) {
            this.fileList.innerHTML = '<div class="loading">파일을 불러올 수 없습니다</div>';
        }
    }

    renderFileList() {
        if (this.files.length === 0) {
            this.fileList.innerHTML = '<div class="loading">파일이 없습니다. 업로드하거나 동기화하세요.</div>';
            this.fileCount.textContent = '0개';
            return;
        }

        this.fileCount.textContent = `${this.files.length}개`;
        this.fileList.innerHTML = this.files.map(file => `
            <div class="file-item" data-name="${file.name}">
                <span class="file-icon">${file.name.toLowerCase().endsWith('.m4a') ? '🎵' : '🎶'}</span>
                <span class="file-name">${this.formatFileName(file.name)}</span>
                <span class="file-size">${this.formatSize(file.size)}</span>
            </div>
        `).join('');

        this.fileList.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('click', () => {
                const name = item.dataset.name;
                this.loadTrack(name);
                this.fileList.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    async handleUpload(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        this.uploadProgress.classList.remove('hidden');

        for (const file of files) {
            const formData = new FormData();
            formData.append('pin', this.pin);
            formData.append('file', file);

            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                if (!result.success) {
                    alert(result.error);
                }
            } catch (err) {
                alert('업로드 실패: ' + err.message);
            }
        }

        this.uploadProgress.classList.add('hidden');
        this.fileUpload.value = '';
        await this.loadFiles();
    }

    formatFileName(name) {
        return name.replace(/\.(m4a|mp3)$/i, '');
    }

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ===== 트랙 로드 & 웨이브폼 =====

    async loadTrack(filename) {
        this.currentFile = filename;
        const url = `/audio/${this.pin}/${encodeURIComponent(filename)}`;

        this.trackNameOverlay.textContent = this.formatFileName(filename);

        // 먼저 플레이어를 보여준 후 웨이브폼 생성 (파형 버그 수정)
        this.playerSection.classList.remove('hidden');

        this.audio.src = url;
        this.audio.load();

        // DOM이 렌더링되도록 한 프레임 대기
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        this.resizeCanvas();
        await this.generateWaveform(url);
    }

    async generateWaveform(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0);

            const samples = 500;
            const blockSize = Math.floor(channelData.length / samples);
            this.waveformData = [];

            for (let i = 0; i < samples; i++) {
                let max = 0;
                let min = 0;
                for (let j = 0; j < blockSize; j++) {
                    const idx = i * blockSize + j;
                    if (idx < channelData.length) {
                        const val = channelData[idx];
                        if (val > max) max = val;
                        if (val < min) min = val;
                    }
                }
                this.waveformData.push({ max, min });
            }

            // 정규화
            const maxAbs = Math.max(
                ...this.waveformData.map(d => Math.max(Math.abs(d.max), Math.abs(d.min)))
            );
            if (maxAbs > 0) {
                this.waveformData = this.waveformData.map(d => ({
                    max: d.max / maxAbs,
                    min: d.min / maxAbs
                }));
            }

            this.drawWaveform();
        } catch (error) {
            console.error('웨이브폼 생성 실패:', error);
            // 폴백: 랜덤 웨이브폼
            this.waveformData = Array(500).fill(0).map(() => {
                const v = Math.random() * 0.7 + 0.1;
                return { max: v, min: -v };
            });
            this.drawWaveform();
        }
    }

    resizeCanvas() {
        const container = this.waveformCanvas.parentElement;
        const rect = container.getBoundingClientRect();

        // 컨테이너가 아직 보이지 않으면 무시
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;

        this.waveformCanvas.width = rect.width * dpr;
        this.waveformCanvas.height = rect.height * dpr;

        this.waveformCtx.setTransform(1, 0, 0, 1, 0, 0); // 리셋
        this.waveformCtx.scale(dpr, dpr);

        this.waveformCanvas.style.width = rect.width + 'px';
        this.waveformCanvas.style.height = rect.height + 'px';

        if (this.waveformData) {
            this.drawWaveform();
        }

        this.updateMarkerPositions();
    }

    drawWaveform() {
        if (!this.waveformData) return;

        const ctx = this.waveformCtx;
        const container = this.waveformCanvas.parentElement;
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        if (width === 0 || height === 0) return;

        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
        const progressX = progress * width;
        const barWidth = width / this.waveformData.length;

        // 재생된 부분
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        const playedSamples = Math.floor(progressX / barWidth);

        for (let i = 0; i <= playedSamples && i < this.waveformData.length; i++) {
            const x = i * barWidth + barWidth / 2;
            if (x > progressX) break;
            ctx.lineTo(x, centerY - (this.waveformData[i].max * centerY * 0.85));
        }
        for (let i = Math.min(playedSamples, this.waveformData.length - 1); i >= 0; i--) {
            const x = i * barWidth + barWidth / 2;
            if (x > progressX) continue;
            ctx.lineTo(x, centerY - (this.waveformData[i].min * centerY * 0.85));
        }
        ctx.closePath();
        ctx.fillStyle = '#faf0dc';
        ctx.fill();

        // 미재생 부분
        ctx.beginPath();
        ctx.moveTo(progressX, centerY);
        for (let i = playedSamples; i < this.waveformData.length; i++) {
            const x = i * barWidth + barWidth / 2;
            ctx.lineTo(x, centerY - (this.waveformData[i].max * centerY * 0.85));
        }
        for (let i = this.waveformData.length - 1; i >= playedSamples; i--) {
            const x = i * barWidth + barWidth / 2;
            ctx.lineTo(x, centerY - (this.waveformData[i].min * centerY * 0.85));
        }
        ctx.closePath();
        ctx.fillStyle = '#d4c8a8';
        ctx.fill();

        // 중앙선
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.strokeStyle = 'rgba(212, 200, 168, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ===== 재생 컨트롤 =====

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    }

    updatePlayButton(isPlaying) {
        const playIcon = this.playBtn.querySelector('.play-icon');
        const pauseIcon = this.playBtn.querySelector('.pause-icon');
        if (isPlaying) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
        }
    }

    skip(seconds) {
        this.audio.currentTime = Math.max(0, Math.min(
            this.audio.currentTime + seconds,
            this.audio.duration || 0
        ));
    }

    onTimeUpdate() {
        const current = this.audio.currentTime;
        const duration = this.audio.duration || 0;

        this.currentTimeBubble.textContent = this.formatTimeMs(current);

        const percent = duration ? (current / duration) * 100 : 0;
        const containerWidth = this.waveformContainer.offsetWidth;
        const bubbleWidth = this.currentTimeBubble.offsetWidth;

        let bubbleLeft = (percent / 100) * containerWidth;
        bubbleLeft = Math.max(bubbleWidth / 2 + 5, Math.min(bubbleLeft, containerWidth - bubbleWidth / 2 - 5));
        this.currentTimeBubble.style.left = bubbleLeft + 'px';

        this.playhead.style.left = percent + '%';

        this.drawWaveform();

        // 구간 반복 체크
        if (this.loopEnabled && current >= this.loopEnd) {
            this.audio.currentTime = this.loopStart;
        }
    }

    onLoadedMetadata() {
        const duration = this.audio.duration;
        this.loopStart = 0;
        this.loopEnd = duration;
        this.loopEnabled = false;
        this.setLoopBtn.classList.remove('active');

        this.updateMarkerPositions();
        this.updateTimeDisplay();

        // 메타데이터 로드 후 캔버스 재조정
        this.resizeCanvas();
    }

    onEnded() {
        if (this.loopEnabled) {
            this.audio.currentTime = this.loopStart;
            this.audio.play();
        } else {
            this.updatePlayButton(false);
        }
    }

    formatTimeMs(seconds) {
        if (!seconds || !isFinite(seconds)) return '00:00.0';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
    }

    // ===== 구간 반복 =====

    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        this.setLoopBtn.classList.toggle('active', this.loopEnabled);
    }

    resetLoop() {
        if (!this.audio.duration) return;
        this.loopStart = 0;
        this.loopEnd = this.audio.duration;
        this.loopEnabled = false;
        this.setLoopBtn.classList.remove('active');
        this.updateMarkerPositions();
        this.updateTimeDisplay();
    }

    updateMarkerPositions() {
        if (!this.audio.duration) return;
        const duration = this.audio.duration;
        const startPercent = (this.loopStart / duration) * 100;
        const endPercent = (this.loopEnd / duration) * 100;

        this.markerA.style.left = startPercent + '%';
        this.markerB.style.left = endPercent + '%';
        this.loopRegion.style.left = startPercent + '%';
        this.loopRegion.style.width = (endPercent - startPercent) + '%';
    }

    updateTimeDisplay() {
        this.loopStartDisplay.textContent = this.formatTimeMs(this.loopStart);
        this.loopEndDisplay.textContent = this.formatTimeMs(this.loopEnd);
        this.selectedDuration.textContent = this.formatTimeMs(this.loopEnd - this.loopStart);
    }

    // ===== FTP 동기화 =====

    async syncFTP() {
        this.syncBtn.classList.add('syncing');
        try {
            const res = await fetch(`/api/sync?pin=${this.pin}`);
            const result = await res.json();
            if (result.success) {
                await this.loadFiles();
                alert('동기화 완료: ' + result.message);
            } else {
                alert('동기화 실패: ' + result.error);
            }
        } catch (err) {
            alert('동기화 오류: ' + err.message);
        } finally {
            this.syncBtn.classList.remove('syncing');
        }
    }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
