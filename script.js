/**
 * Violin Practice - 구간 반복 연습 플레이어
 */

// ===== 토스트 알림 =====
function showToast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

// ===== 앱 진입점 =====
class App {
    constructor() {
        this.currentPin = null;
        this.player = null;
        this.initLogin();
    }

    initLogin() {
        this.loginSection = document.getElementById('loginSection');
        this.mainSection = document.getElementById('mainSection');
        this.pinInputs = document.querySelectorAll('.pin-input');
        this.pinError = document.getElementById('pinError');
        this.loginCard = document.getElementById('loginCard');
        this.checking = false;

        this.pinInputs.forEach((input, idx) => {
            // 숫자 입력 처리
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length === 0) {
                    e.target.value = '';
                    return;
                }
                // 한 자리만 허용, ● 마스킹
                e.target.value = val.charAt(0);
                e.target.classList.add('filled');
                this.pinError.textContent = '';

                // 다음 칸으로 자동 이동
                if (idx < 3) {
                    this.pinInputs[idx + 1].focus();
                } else {
                    // 4자리 모두 입력 완료
                    e.target.blur();
                    this.trySubmit();
                }
            });

            // 키 다운 처리
            input.addEventListener('keydown', (e) => {
                // 백스페이스: 현재 칸 비우거나 이전 칸으로
                if (e.key === 'Backspace') {
                    if (input.value === '' && idx > 0) {
                        e.preventDefault();
                        this.pinInputs[idx - 1].value = '';
                        this.pinInputs[idx - 1].classList.remove('filled');
                        this.pinInputs[idx - 1].focus();
                    } else {
                        input.classList.remove('filled');
                    }
                    this.pinError.textContent = '';
                    return;
                }
                // 왼쪽 화살표
                if (e.key === 'ArrowLeft' && idx > 0) {
                    e.preventDefault();
                    this.pinInputs[idx - 1].focus();
                    return;
                }
                // 오른쪽 화살표
                if (e.key === 'ArrowRight' && idx < 3) {
                    e.preventDefault();
                    this.pinInputs[idx + 1].focus();
                    return;
                }
                // 숫자가 아닌 키 차단 (제어키 제외)
                if (e.key.length === 1 && !/[0-9]/.test(e.key)) {
                    e.preventDefault();
                }
            });

            // 포커스 시 전체 선택
            input.addEventListener('focus', () => {
                input.select();
            });

            // 붙여넣기 처리 (4자리 한번에)
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
                if (paste.length >= 4) {
                    this.pinInputs.forEach((inp, i) => {
                        inp.value = paste.charAt(i) || '';
                        inp.classList.toggle('filled', inp.value !== '');
                    });
                    this.pinInputs[3].focus();
                    this.trySubmit();
                }
            });
        });

        // 첫 번째 입력 필드에 자동 포커스
        setTimeout(() => this.pinInputs[0].focus(), 300);
    }

    getPin() {
        return Array.from(this.pinInputs).map(i => i.value).join('');
    }

    trySubmit() {
        const pin = this.getPin();
        if (pin.length === 4 && /^[0-9]{4}$/.test(pin)) {
            this.checkPin(pin);
        }
    }

    async checkPin(pin) {
        if (this.checking) return;
        this.checking = true;
        this.pinInputs.forEach(i => i.disabled = true);

        try {
            const res = await fetch(`/api/check-pin?pin=${pin}`);
            const data = await res.json();

            if (data.valid) {
                this.currentPin = pin;
                this.pinInputs.forEach(i => i.classList.add('success'));
                setTimeout(() => this.showMain(), 400);
            } else {
                this.pinError.textContent = data.error || '잘못된 번호입니다';
                this.loginCard.classList.add('shake');
                setTimeout(() => {
                    this.loginCard.classList.remove('shake');
                    this.pinInputs.forEach(i => {
                        i.value = '';
                        i.classList.remove('filled');
                        i.disabled = false;
                    });
                    this.checking = false;
                    this.pinInputs[0].focus();
                }, 500);
            }
        } catch (err) {
            this.pinError.textContent = '서버 연결 실패';
            this.pinInputs.forEach(i => {
                i.value = '';
                i.classList.remove('filled');
                i.disabled = false;
            });
            this.checking = false;
            this.pinInputs[0].focus();
        }
    }

    showMain() {
        this.loginSection.style.display = 'none';
        this.mainSection.style.display = '';
        this.mainSection.classList.add('fade-in');
        this.player = new AudioPlayer(this.currentPin);
    }
}


// ===== 오디오 플레이어 =====
class AudioPlayer {
    constructor(pin) {
        this.pin = pin;

        // DOM
        this.audio = document.getElementById('audioPlayer');
        this.playerSection = document.getElementById('playerSection');
        this.fileList = document.getElementById('fileList');
        this.fileCount = document.getElementById('fileCount');

        this.playBtn = document.getElementById('playBtn');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.syncBtn = document.getElementById('syncBtn');
        this.logoutBtn = document.getElementById('logoutBtn');

        this.helpToggleBtn = document.getElementById('helpToggleBtn');
        this.helpPanel = document.getElementById('helpPanel');

        this.fileUpload = document.getElementById('fileUpload');

        this.setLoopBtn = document.getElementById('setLoopBtn');
        this.resetLoopBtn = document.getElementById('resetLoopBtn');
        this.loopRegion = document.getElementById('loopRegion');
        this.markerA = document.getElementById('markerA');
        this.markerB = document.getElementById('markerB');

        this.waveformContainer = document.getElementById('waveformContainer');
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        this.playhead = document.getElementById('playhead');

        this.currentTimeBubble = document.getElementById('currentTimeBubble');
        this.trackNameOverlay = document.getElementById('trackNameOverlay');
        this.loopStartDisplay = document.getElementById('loopStartDisplay');
        this.loopEndDisplay = document.getElementById('loopEndDisplay');
        this.selectedDuration = document.getElementById('selectedDuration');

        this.volumeSlider = document.getElementById('volumeSlider');

        // 상태
        this.files = [];
        this.currentFile = null;
        this.waveformData = null;
        this.audioContext = null;
        this.loopStart = 0;
        this.loopEnd = 0;
        this.loopEnabled = false;
        this.isDragging = false;
        this.dragTarget = null;
        this.isUploading = false;

        this.init();
    }

    async init() {
        this.setupEvents();
        this.setupAudioContext();
        this.setupKeyboard();
        await this.loadFiles();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupAudioContext() {
        const resume = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') this.audioContext.resume();
        };
        document.addEventListener('touchstart', resume, { once: true });
        document.addEventListener('click', resume, { once: true });
    }

    setupEvents() {
        // 재생
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.skipBackBtn.addEventListener('click', () => this.skip(-10));
        this.skipForwardBtn.addEventListener('click', () => this.skip(10));

        // 오디오
        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.audio.addEventListener('play', () => this.updatePlayBtn(true));
        this.audio.addEventListener('pause', () => this.updatePlayBtn(false));
        this.audio.addEventListener('ended', () => this.onEnded());

        // 루프
        this.setLoopBtn.addEventListener('click', () => this.toggleLoop());
        this.resetLoopBtn.addEventListener('click', () => this.resetLoop());
        this.setupMarkerDrag();

        // 웨이브폼 클릭
        this.waveformContainer.addEventListener('click', (e) => this.onWaveformClick(e));

        // 볼륨
        this.volumeSlider.addEventListener('input', (e) => { this.audio.volume = e.target.value; });

        // 속도
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.audio.playbackRate = parseFloat(e.target.dataset.speed);
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
            location.reload();
        });

        // 도움말 토글
        this.helpToggleBtn.addEventListener('click', () => {
            this.helpPanel.classList.toggle('open');
            this.helpToggleBtn.classList.toggle('active');
        });

        // 업로드
        this.fileUpload.addEventListener('change', (e) => this.handleUpload(e));
    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (!this.audio.src) return;
                e.preventDefault();
                this.togglePlay();
                return;
            }
            if (e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); this.skip(-10); return; }
            if (e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); this.skip(10); return; }
            if (e.ctrlKey && e.key === 'r') { e.preventDefault(); this.toggleLoop(); return; }
        });
    }

    // ===== 마커 드래그 =====

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
        e.preventDefault(); e.stopPropagation();
        this.isDragging = true;
        this.dragTarget = target;
        (target === 'a' ? this.markerA : this.markerB).classList.add('dragging');
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
        } else {
            this.loopEnd = Math.max(this.loopStart + 0.5, Math.min(time, this.audio.duration));
        }
        this.updateMarkers();
        this.updateTimeDisplay();
    }

    endDrag() {
        if (!this.isDragging) return;
        this.markerA.classList.remove('dragging');
        this.markerB.classList.remove('dragging');
        this.isDragging = false;
        this.dragTarget = null;
    }

    onWaveformClick(e) {
        if (this.isDragging || e.target.closest('.loop-marker') || !this.audio.duration) return;
        const rect = this.waveformContainer.getBoundingClientRect();
        this.audio.currentTime = ((e.clientX - rect.left) / rect.width) * this.audio.duration;
    }

    // ===== 파일 관리 =====

    async loadFiles() {
        try {
            const res = await fetch(`/api/files?pin=${this.pin}`);
            this.files = await res.json();
            this.renderFileList();
        } catch {
            this.fileList.innerHTML = '<div class="empty-msg">파일을 불러올 수 없습니다</div>';
        }
    }

    renderFileList() {
        if (this.files.length === 0) {
            this.fileList.innerHTML = '<div class="empty-msg">연습곡이 없습니다<br><small>위의 업로드 버튼으로 추가하세요</small></div>';
            this.fileCount.textContent = '';
            return;
        }
        this.fileCount.textContent = `${this.files.length}곡`;
        this.fileList.innerHTML = this.files.map(f => `
            <div class="file-item" data-name="${f.name}">
                <span class="fi-name">${this.fmtName(f.name)}</span>
                <span class="fi-size">${this.fmtSize(f.size)}</span>
                <button class="fi-del" data-name="${f.name}" title="삭제">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');

        this.fileList.querySelectorAll('.file-item').forEach(item => {
            // 파일 선택 (삭제 버튼 제외)
            item.addEventListener('click', (e) => {
                if (e.target.closest('.fi-del')) return;
                this.loadTrack(item.dataset.name);
                this.fileList.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // 삭제 버튼
        this.fileList.querySelectorAll('.fi-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.name);
            });
        });
    }

    async handleUpload(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        this.isUploading = true;
        showToast(`${files.length}개 파일 업로드 중...`, 60000);

        let ok = 0;
        for (const file of files) {
            const fd = new FormData();
            fd.append('pin', this.pin);
            fd.append('file', file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                const r = await res.json();
                if (r.success) ok++;
                else showToast(r.error, 3000);
            } catch (err) {
                showToast('업로드 실패: ' + err.message, 3000);
            }
        }

        this.isUploading = false;
        this.fileUpload.value = '';
        if (ok > 0) {
            showToast(`${ok}개 파일 업로드 완료`);
            await this.loadFiles();
        }
    }

    async deleteFile(filename) {
        if (!confirm(`"${this.fmtName(filename)}" 을(를) 삭제할까요?`)) return;

        try {
            const res = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: this.pin, filename })
            });
            const r = await res.json();
            if (r.success) {
                // 현재 재생 중인 파일이면 정지
                if (this.currentFile === filename) {
                    this.audio.pause();
                    this.audio.src = '';
                    this.currentFile = null;
                    this.playerSection.style.display = 'none';
                }
                showToast(r.message);
                await this.loadFiles();
            } else {
                showToast(r.error, 3000);
            }
        } catch (err) {
            showToast('삭제 실패', 3000);
        }
    }

    fmtName(n) { return n.replace(/\.(m4a|mp3)$/i, ''); }
    fmtSize(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    }

    // ===== 트랙 & 웨이브폼 =====

    async loadTrack(filename) {
        this.currentFile = filename;
        const url = `/audio/${this.pin}/${encodeURIComponent(filename)}`;
        this.trackNameOverlay.textContent = this.fmtName(filename);

        // 플레이어 먼저 표시 (파형 버그 수정)
        this.playerSection.style.display = '';
        this.audio.src = url;
        this.audio.load();

        // 2프레임 대기 후 캔버스 사이즈 확정
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        this.resizeCanvas();
        await this.generateWaveform(url);
    }

    async generateWaveform(url) {
        try {
            const resp = await fetch(url);
            const buf = await resp.arrayBuffer();
            if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const ab = await this.audioContext.decodeAudioData(buf);
            const ch = ab.getChannelData(0);
            const N = 500, bs = Math.floor(ch.length / N);
            this.waveformData = [];
            for (let i = 0; i < N; i++) {
                let mx = 0, mn = 0;
                for (let j = 0; j < bs; j++) {
                    const v = ch[i * bs + j] || 0;
                    if (v > mx) mx = v;
                    if (v < mn) mn = v;
                }
                this.waveformData.push({ max: mx, min: mn });
            }
            const peak = Math.max(...this.waveformData.map(d => Math.max(Math.abs(d.max), Math.abs(d.min))));
            if (peak > 0) this.waveformData = this.waveformData.map(d => ({ max: d.max / peak, min: d.min / peak }));
            this.drawWaveform();
        } catch (err) {
            console.error('Waveform error:', err);
            this.waveformData = Array(500).fill(0).map(() => { const v = Math.random() * 0.7 + 0.1; return { max: v, min: -v }; });
            this.drawWaveform();
        }
    }

    resizeCanvas() {
        const rect = this.waveformCanvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        this.waveformCanvas.width = rect.width * dpr;
        this.waveformCanvas.height = rect.height * dpr;
        this.waveformCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.waveformCtx.scale(dpr, dpr);
        this.waveformCanvas.style.width = rect.width + 'px';
        this.waveformCanvas.style.height = rect.height + 'px';
        if (this.waveformData) this.drawWaveform();
        this.updateMarkers();
    }

    drawWaveform() {
        if (!this.waveformData) return;
        const ctx = this.waveformCtx;
        const rect = this.waveformCanvas.parentElement.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        if (w === 0 || h === 0) return;
        const cy = h / 2;
        ctx.clearRect(0, 0, w, h);

        const prog = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
        const px = prog * w, bw = w / this.waveformData.length;

        const drawHalf = (start, end, color) => {
            ctx.beginPath();
            ctx.moveTo(start, cy);
            for (let i = Math.floor(start / bw); i < this.waveformData.length; i++) {
                const x = i * bw + bw / 2;
                if (x < start) continue; if (x > end) break;
                ctx.lineTo(x, cy - this.waveformData[i].max * cy * 0.85);
            }
            for (let i = Math.min(Math.floor(end / bw), this.waveformData.length - 1); i >= 0; i--) {
                const x = i * bw + bw / 2;
                if (x < start) break; if (x > end) continue;
                ctx.lineTo(x, cy - this.waveformData[i].min * cy * 0.85);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        };

        drawHalf(0, px, '#faf0dc');
        drawHalf(px, w, '#d4c8a8');

        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.strokeStyle = 'rgba(212,200,168,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // ===== 재생 =====

    togglePlay() { this.audio.paused ? this.audio.play() : this.audio.pause(); }

    updatePlayBtn(playing) {
        this.playBtn.querySelector('.icon-play').style.display = playing ? 'none' : '';
        this.playBtn.querySelector('.icon-pause').style.display = playing ? '' : 'none';
    }

    skip(s) { this.audio.currentTime = Math.max(0, Math.min(this.audio.currentTime + s, this.audio.duration || 0)); }

    onTimeUpdate() {
        const cur = this.audio.currentTime, dur = this.audio.duration || 0;
        this.currentTimeBubble.textContent = this.fmtTime(cur);
        const pct = dur ? (cur / dur) * 100 : 0;
        const cw = this.waveformContainer.offsetWidth, bw = this.currentTimeBubble.offsetWidth;
        let bl = (pct / 100) * cw;
        bl = Math.max(bw / 2 + 4, Math.min(bl, cw - bw / 2 - 4));
        this.currentTimeBubble.style.left = bl + 'px';
        this.playhead.style.left = pct + '%';
        this.drawWaveform();
        if (this.loopEnabled && cur >= this.loopEnd) this.audio.currentTime = this.loopStart;
    }

    onLoadedMetadata() {
        this.loopStart = 0;
        this.loopEnd = this.audio.duration;
        this.loopEnabled = false;
        this.setLoopBtn.classList.remove('active');
        this.updateMarkers();
        this.updateTimeDisplay();
        this.resizeCanvas();
    }

    onEnded() {
        if (this.loopEnabled) { this.audio.currentTime = this.loopStart; this.audio.play(); }
        else this.updatePlayBtn(false);
    }

    fmtTime(s) {
        if (!s || !isFinite(s)) return '00:00.0';
        const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${ms}`;
    }

    // ===== 루프 =====

    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        this.setLoopBtn.classList.toggle('active', this.loopEnabled);
        showToast(this.loopEnabled ? '구간 반복 ON' : '구간 반복 OFF');
    }

    resetLoop() {
        if (!this.audio.duration) return;
        this.loopStart = 0;
        this.loopEnd = this.audio.duration;
        this.loopEnabled = false;
        this.setLoopBtn.classList.remove('active');
        this.updateMarkers();
        this.updateTimeDisplay();
    }

    updateMarkers() {
        if (!this.audio.duration) return;
        const d = this.audio.duration;
        const sp = (this.loopStart / d) * 100, ep = (this.loopEnd / d) * 100;
        this.markerA.style.left = sp + '%';
        this.markerB.style.left = ep + '%';
        this.loopRegion.style.left = sp + '%';
        this.loopRegion.style.width = (ep - sp) + '%';
    }

    updateTimeDisplay() {
        this.loopStartDisplay.textContent = this.fmtTime(this.loopStart);
        this.loopEndDisplay.textContent = this.fmtTime(this.loopEnd);
        this.selectedDuration.textContent = this.fmtTime(this.loopEnd - this.loopStart);
    }

    // ===== FTP =====

    async syncFTP() {
        this.syncBtn.classList.add('syncing');
        showToast('동기화 중...', 30000);
        try {
            const res = await fetch(`/api/sync?pin=${this.pin}`);
            const r = await res.json();
            if (r.success) { await this.loadFiles(); showToast('동기화 완료'); }
            else showToast('동기화 실패: ' + r.error, 4000);
        } catch (err) { showToast('동기화 오류', 3000); }
        finally { this.syncBtn.classList.remove('syncing'); }
    }
}

document.addEventListener('DOMContentLoaded', () => new App());
