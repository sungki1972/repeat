/**
 * 🎵 성탄 칸타타 바이올린 연습 플레이어
 * A-B 구간 반복 - 마커 드래그로 설정
 */

class AudioPlayer {
    constructor() {
        // DOM 요소
        this.audio = document.getElementById('audioPlayer');
        this.playerSection = document.getElementById('playerSection');
        this.fileList = document.getElementById('fileList');
        this.fileCount = document.getElementById('fileCount');
        
        // 컨트롤 버튼
        this.playBtn = document.getElementById('playBtn');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.syncBtn = document.getElementById('syncBtn');
        
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
        this.loopTimeCenter = document.getElementById('loopTimeCenter');
        
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
        this.resizeCanvas();
        await this.loadFiles();
        
        window.addEventListener('resize', () => this.resizeCanvas());
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
        // 재생 컨트롤
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.skipBackBtn.addEventListener('click', () => this.skip(-5));
        this.skipForwardBtn.addEventListener('click', () => this.skip(5));
        
        // 오디오 이벤트
        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.audio.addEventListener('play', () => this.updatePlayButton(true));
        this.audio.addEventListener('pause', () => this.updatePlayButton(false));
        this.audio.addEventListener('ended', () => this.onEnded());
        
        // 구간 반복 버튼
        this.setLoopBtn.addEventListener('click', () => this.toggleLoop());
        this.resetLoopBtn.addEventListener('click', () => this.resetLoop());
        
        // 마커 드래그 이벤트
        this.setupMarkerDrag();
        
        // 웨이브폼 클릭 (시킹)
        this.waveformContainer.addEventListener('click', (e) => this.handleWaveformClick(e));
        
        // 볼륨
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value;
        });
        
        // 속도 버튼
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseFloat(e.target.dataset.speed);
                this.audio.playbackRate = speed;
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        // FTP 동기화
        this.syncBtn.addEventListener('click', () => this.syncFTP());
    }
    
    setupMarkerDrag() {
        // 마커 A 드래그
        this.markerA.addEventListener('mousedown', (e) => this.startDrag(e, 'a'));
        this.markerA.addEventListener('touchstart', (e) => this.startDrag(e, 'a'), { passive: false });
        
        // 마커 B 드래그
        this.markerB.addEventListener('mousedown', (e) => this.startDrag(e, 'b'));
        this.markerB.addEventListener('touchstart', (e) => this.startDrag(e, 'b'), { passive: false });
        
        // 전역 이동/종료 이벤트
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
            // A 마커는 B 이전까지만 (최소 0.5초 간격)
            this.loopStart = Math.max(0, Math.min(time, this.loopEnd - 0.5));
        } else if (this.dragTarget === 'b') {
            // B 마커는 A 이후부터
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
    
    async loadFiles() {
        try {
            const response = await fetch('/api/files');
            this.files = await response.json();
            this.renderFileList();
        } catch (error) {
            console.error('파일 목록 로딩 실패:', error);
            this.fileList.innerHTML = '<div class="loading">파일을 불러올 수 없습니다</div>';
        }
    }
    
    renderFileList() {
        if (this.files.length === 0) {
            this.fileList.innerHTML = '<div class="loading">파일이 없습니다. 동기화 버튼을 눌러주세요.</div>';
            this.fileCount.textContent = '0개';
            return;
        }
        
        this.fileCount.textContent = `${this.files.length}개`;
        this.fileList.innerHTML = this.files.map(file => `
            <div class="file-item" data-name="${file.name}">
                <span class="file-icon">${file.name.endsWith('.m4a') ? '🎵' : '🎶'}</span>
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
    
    formatFileName(name) {
        return name.replace(/\.(m4a|mp3)$/i, '');
    }
    
    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    async loadTrack(filename) {
        this.currentFile = filename;
        const url = `/audio/${encodeURIComponent(filename)}`;
        
        this.trackNameOverlay.textContent = this.formatFileName(filename);
        
        this.audio.src = url;
        this.audio.load();
        
        // 웨이브폼 생성
        await this.generateWaveform(url);
        
        this.playerSection.classList.remove('hidden');
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
            
            // 세밀한 샘플링
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
            // 기본 웨이브폼
            this.waveformData = Array(500).fill(0).map(() => {
                const v = Math.random() * 0.7 + 0.1;
                return { max: v, min: -v };
            });
            this.drawWaveform();
        }
    }
    
    resizeCanvas() {
        const rect = this.waveformCanvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.waveformCanvas.width = rect.width * dpr;
        this.waveformCanvas.height = rect.height * dpr;
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
        const rect = this.waveformCanvas.parentElement.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const centerY = height / 2;
        
        ctx.clearRect(0, 0, width, height);
        
        // 현재 재생 위치
        const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
        const progressX = progress * width;
        
        const barWidth = width / this.waveformData.length;
        
        // 파형 그리기 (위아래 대칭)
        // 1. 재생된 부분 (밝은 녹색)
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        
        const playedSamples = Math.floor(progressX / barWidth);
        
        // 상단 라인
        for (let i = 0; i <= playedSamples && i < this.waveformData.length; i++) {
            const x = i * barWidth + barWidth / 2;
            if (x > progressX) break;
            const data = this.waveformData[i];
            const topY = centerY - (data.max * centerY * 0.85);
            ctx.lineTo(x, topY);
        }
        
        // 하단 라인 (역순)
        for (let i = Math.min(playedSamples, this.waveformData.length - 1); i >= 0; i--) {
            const x = i * barWidth + barWidth / 2;
            if (x > progressX) continue;
            const data = this.waveformData[i];
            const bottomY = centerY - (data.min * centerY * 0.85);
            ctx.lineTo(x, bottomY);
        }
        
        ctx.closePath();
        ctx.fillStyle = '#2eec94';
        ctx.fill();
        
        // 2. 미재생 부분 (기본 청록색)
        ctx.beginPath();
        ctx.moveTo(progressX, centerY);
        
        // 상단 라인
        for (let i = playedSamples; i < this.waveformData.length; i++) {
            const x = i * barWidth + barWidth / 2;
            const data = this.waveformData[i];
            const topY = centerY - (data.max * centerY * 0.85);
            ctx.lineTo(x, topY);
        }
        
        // 하단 라인 (역순)
        for (let i = this.waveformData.length - 1; i >= playedSamples; i--) {
            const x = i * barWidth + barWidth / 2;
            const data = this.waveformData[i];
            const bottomY = centerY - (data.min * centerY * 0.85);
            ctx.lineTo(x, bottomY);
        }
        
        ctx.closePath();
        ctx.fillStyle = '#1abc9c';
        ctx.fill();
        
        // 중앙선
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.strokeStyle = 'rgba(26, 188, 156, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
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
            this.audio.duration
        ));
    }
    
    onTimeUpdate() {
        const current = this.audio.currentTime;
        const duration = this.audio.duration || 0;
        
        // 현재 시간 말풍선
        this.currentTimeBubble.textContent = this.formatTimeMs(current);
        
        // 말풍선 위치
        const percent = duration ? (current / duration) * 100 : 0;
        const containerWidth = this.waveformContainer.offsetWidth;
        const bubbleWidth = this.currentTimeBubble.offsetWidth;
        
        let bubbleLeft = (percent / 100) * containerWidth;
        bubbleLeft = Math.max(bubbleWidth / 2 + 5, Math.min(bubbleLeft, containerWidth - bubbleWidth / 2 - 5));
        this.currentTimeBubble.style.left = bubbleLeft + 'px';
        
        // 플레이헤드 위치
        this.playhead.style.left = percent + '%';
        
        // 웨이브폼 다시 그리기
        this.drawWaveform();
        
        // 구간 반복 체크
        if (this.loopEnabled && current >= this.loopEnd) {
            this.audio.currentTime = this.loopStart;
        }
    }
    
    onLoadedMetadata() {
        const duration = this.audio.duration;
        
        // 초기 마커 위치: 처음과 끝
        this.loopStart = 0;
        this.loopEnd = duration;
        this.loopEnabled = false;
        this.setLoopBtn.classList.remove('active');
        
        this.updateMarkerPositions();
        this.updateTimeDisplay();
    }
    
    onEnded() {
        if (this.loopEnabled) {
            this.audio.currentTime = this.loopStart;
            this.audio.play();
        } else {
            this.updatePlayButton(false);
        }
    }
    
    formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    formatTimeMs(seconds) {
        if (!seconds || !isFinite(seconds)) return '00:00.0';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
    }
    
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
        
        // 반복 구간 배경
        this.loopRegion.style.left = startPercent + '%';
        this.loopRegion.style.width = (endPercent - startPercent) + '%';
    }
    
    updateTimeDisplay() {
        this.loopStartDisplay.textContent = this.formatTimeMs(this.loopStart);
        this.loopEndDisplay.textContent = this.formatTimeMs(this.loopEnd);
        
        const duration = this.loopEnd - this.loopStart;
        this.selectedDuration.textContent = this.formatTimeMs(duration);
    }
    
    async syncFTP() {
        this.syncBtn.classList.add('syncing');
        
        try {
            const response = await fetch('/api/sync');
            const result = await response.json();
            
            if (result.success) {
                await this.loadFiles();
                alert('동기화 완료: ' + result.message);
            } else {
                alert('동기화 실패: ' + result.error);
            }
        } catch (error) {
            alert('동기화 오류: ' + error.message);
        } finally {
            this.syncBtn.classList.remove('syncing');
        }
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new AudioPlayer();
});
