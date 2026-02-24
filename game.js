const CONFIG = {
    GRAVITY: 0.8,
    SPEED: 6,
    JUMP_FORCE: -14, // Daha yükseğe zıplasın
    FPS: 60
};

// === SES SİSTEMİ (PROSEDÜREL) ===
const AudioSys = {
    ctx: null,
    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
    },
    playTone(freq, type, duration, vol = 0.1, slideFreq = null) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (slideFreq) {
                osc.frequency.exponentialRampToValueAtTime(slideFreq, this.ctx.currentTime + duration);
            }
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) { }
    },
    jump() { this.playTone(300, 'sine', 0.25, 0.15, 600); },
    crouch() { this.playTone(200, 'sine', 0.15, 0.05, 100); },
    button() { this.playTone(800, 'square', 0.1, 0.05, 1200); },
    door() { this.playTone(150, 'sawtooth', 0.4, 0.08, 100); },
    rewind() { this.playTone(600, 'triangle', 0.4, 0.1, 200); },
    die() { this.playTone(100, 'sawtooth', 0.6, 0.2, 50); },
    exit() {
        this.playTone(400, 'sine', 0.3, 0.1, 800);
        setTimeout(() => this.playTone(600, 'sine', 0.4, 0.1, 1200), 150);
    }
};

window.addEventListener('mousedown', () => AudioSys.init(), { once: true });
window.addEventListener('touchstart', () => AudioSys.init(), { once: true });
window.addEventListener('keydown', () => AudioSys.init(), { once: true });

// Canvas Kurulumu
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const vigCanvas = document.createElement('canvas'); // Cache için
const vigCtx = vigCanvas.getContext('2d', { alpha: true });

// Ekran boyutlandırma
function resize() {
    const container = document.getElementById('game-container');
    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    // Canvas çözünürlüğü her zaman sabit
    canvas.width = 800;
    canvas.height = 450;

    if (!isMobile) {
        // Masaüstü: Manuel boyutlandırma
        const targetRatio = 800 / 450;
        const windowRatio = window.innerWidth / window.innerHeight;

        let finalWidth, finalHeight;
        if (windowRatio > targetRatio) {
            finalHeight = window.innerHeight;
            finalWidth = finalHeight * targetRatio;
        } else {
            finalWidth = window.innerWidth;
            finalHeight = finalWidth / targetRatio;
        }

        container.style.width = finalWidth + 'px';
        container.style.height = finalHeight + 'px';
    } else {
        // Mobil: CSS hallediyor, JS karışmasın
        container.style.width = '';
        container.style.height = '';
    }

    // === VIGNETTE ÖNBELLEĞİ (Saniyede 60 kez üretilmesini engeller) ===
    vigCanvas.width = canvas.width;
    vigCanvas.height = canvas.height;
    const vigGrad = vigCtx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.75
    );
    vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    vigCtx.fillStyle = vigGrad;
    vigCtx.fillRect(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
window.onload = () => { Game.init(); resize(); setTimeout(resize, 100); setTimeout(resize, 500); };

// iOS / Mobil: Sayfa kaydırmayı engelle
document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.level-grid')) e.preventDefault();
}, { passive: false });

// Yatay yön kilidi
if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => { });
}

// Girdi Yöneticisi
const Input = {
    keys: {},
    touch: { left: false, right: false, jump: false, rewind: false, crouch: false },

    init() {
        // Klavye
        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup', e => this.keys[e.code] = false);

        // Joystick kurulumu
        this.initJoystick();

        // Aksiyon butonları (sağ taraf)
        this.bindTouch('btn-crouch', 'crouch');
        this.bindTouch('btn-jump', 'jump');
        this.bindTouch('btn-rewind', 'rewind');
    },

    // === JOYSTICK ===
    joystickActive: false,
    joystickTouchId: null,

    initJoystick() {
        const zone = document.getElementById('joystick-zone');
        const base = document.getElementById('joystick-base');
        const thumb = document.getElementById('joystick-thumb');
        if (!zone || !base || !thumb) return;

        const maxRadius = 35; // Thumb'ın merkeze max uzaklığı (px)
        const deadZone = 0.25; // %25 ölü bölge

        const getOffset = (touchX, touchY) => {
            const rect = base.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            return { dx: touchX - centerX, dy: touchY - centerY };
        };

        const updateThumb = (dx, dy) => {
            // Mesafeyi sınırla
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clampedDist = Math.min(dist, maxRadius);
            const angle = Math.atan2(dy, dx);
            const clampedX = Math.cos(angle) * clampedDist;
            const clampedY = Math.sin(angle) * clampedDist;

            // Thumb pozisyonunu güncelle
            thumb.style.left = `calc(50% + ${clampedX}px)`;
            thumb.style.top = `calc(50% + ${clampedY}px)`;

            // Normalize (0-1 arası)
            const nx = clampedX / maxRadius; // -1 to 1
            const ny = clampedY / maxRadius; // -1 to 1

            // Yön hesapla (dead zone ile)
            this.touch.left = nx < -deadZone;
            this.touch.right = nx > deadZone;
            this.touch.crouch = ny > 0.4;   // Aşağı bastırma (eğilme)
            // Yukarı yönde joystick → zıplama (jump butonundan da yapılabilir)
        };

        const resetThumb = () => {
            thumb.style.left = '50%';
            thumb.style.top = '50%';
            thumb.classList.remove('active');
            this.touch.left = false;
            this.touch.right = false;
            this.touch.crouch = false;
            this.joystickActive = false;
            this.joystickTouchId = null;
        };

        // Touch events
        zone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.joystickActive) return; // Zaten aktif
            const t = e.changedTouches[0];
            this.joystickTouchId = t.identifier;
            this.joystickActive = true;
            thumb.classList.add('active');
            if (navigator.vibrate) navigator.vibrate(10);
            const { dx, dy } = getOffset(t.clientX, t.clientY);
            updateThumb(dx, dy);
        }, { passive: false });

        zone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier === this.joystickTouchId) {
                    const { dx, dy } = getOffset(t.clientX, t.clientY);
                    updateThumb(dx, dy);
                    break;
                }
            }
        }, { passive: false });

        zone.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystickTouchId) {
                    resetThumb();
                    break;
                }
            }
        }, { passive: false });

        zone.addEventListener('touchcancel', () => resetThumb(), { passive: false });

        // Mouse desteği (masaüstü test)
        let mouseDown = false;
        zone.addEventListener('mousedown', (e) => {
            e.preventDefault();
            mouseDown = true;
            thumb.classList.add('active');
            const { dx, dy } = getOffset(e.clientX, e.clientY);
            updateThumb(dx, dy);
        });
        window.addEventListener('mousemove', (e) => {
            if (!mouseDown) return;
            const { dx, dy } = getOffset(e.clientX, e.clientY);
            updateThumb(dx, dy);
        });
        window.addEventListener('mouseup', () => {
            if (mouseDown) { mouseDown = false; resetThumb(); }
        });
    },

    bindTouch(id, action) {
        const btn = document.getElementById(id);
        if (!btn) return;

        const activate = (e) => {
            e.preventDefault();
            this.touch[action] = true;
            btn.classList.add('pressed');
            if (navigator.vibrate) navigator.vibrate(15);
        };
        const deactivate = (e) => {
            e.preventDefault();
            this.touch[action] = false;
            btn.classList.remove('pressed');
        };

        btn.addEventListener('touchstart', activate, { passive: false });
        btn.addEventListener('touchend', deactivate, { passive: false });
        btn.addEventListener('touchcancel', deactivate, { passive: false });
        btn.addEventListener('mousedown', activate);
        btn.addEventListener('mouseup', deactivate);
        btn.addEventListener('mouseleave', deactivate);
    },

    isDown(action) {
        switch (action) {
            case 'LEFT': return this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left;
            case 'RIGHT': return this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right;
            case 'JUMP': return this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['Space'] || this.touch.jump;
            case 'REWIND': return this.keys['KeyR'] || this.touch.rewind;
            case 'CROUCH': return this.keys['ArrowDown'] || this.keys['KeyS'] || this.touch.crouch;
            default: return false;
        }
    }
};

// Oyuncu Sınıfı
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 40;
        this.normalHeight = 40;
        this.crouchHeight = 22;
        this.vx = 0;
        this.vy = 0;
        this.isGrounded = false;
        this.isCrouching = false;
        this.color = '#3498db';
        this.facingRight = true;
    }


    draw() {
        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        const cx = x + w / 2;

        if (this.isCrouching) {
            // === EĞİLME POZU ===
            // Kuyruk
            ctx.strokeStyle = '#6d4c28';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const tailX = this.facingRight ? x : x + w;
            const tailDir = this.facingRight ? -1 : 1;
            ctx.moveTo(tailX, y + h - 8);
            ctx.quadraticCurveTo(tailX + tailDir * 15, y + h - 18, tailX + tailDir * 10, y + h - 25);
            ctx.stroke();

            // Gövde (yatay, basık)
            ctx.fillStyle = '#8B5E3C';
            ctx.fillRect(cx - 14, y + 8, 28, 18);
            ctx.fillStyle = '#D4A76A';
            ctx.fillRect(cx - 9, y + 11, 18, 12);

            // Kafa (öne eğik)
            const headOff = this.facingRight ? 6 : -6;
            ctx.fillStyle = '#8B5E3C';
            ctx.beginPath();
            ctx.arc(cx + headOff, y + 8, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#D4A76A';
            ctx.beginPath();
            ctx.arc(cx + headOff, y + 10, 7, 0, Math.PI * 2);
            ctx.fill();

            // Gözler
            const eOff = this.facingRight ? 3 : -3;
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(cx + headOff - 2 + eOff, y + 8, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + headOff + 3 + eOff, y + 8, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(cx + headOff - 1 + eOff, y + 8, 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + headOff + 4 + eOff, y + 8, 1, 0, Math.PI * 2);
            ctx.fill();

            // Bacaklar (bükülü)
            ctx.strokeStyle = '#8B5E3C';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cx - 6, y + h - 2);
            ctx.lineTo(cx - 10, y + h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 6, y + h - 2);
            ctx.lineTo(cx + 10, y + h);
            ctx.stroke();
            return;
        }

        // === NORMAL MAYMUN (40px boyuna ölçekli) ===

        // Kuyruk
        ctx.strokeStyle = '#6d4c28';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const tailX = this.facingRight ? x : x + w;
        const tailDir = this.facingRight ? -1 : 1;
        ctx.moveTo(tailX, y + h - 12);
        ctx.quadraticCurveTo(tailX + tailDir * 15, y + h - 24, tailX + tailDir * 10, y + h - 34);
        ctx.stroke();

        // Gövde
        ctx.fillStyle = '#8B5E3C';
        ctx.fillRect(cx - 10, y + 16, 20, 22);
        ctx.fillStyle = '#D4A76A';
        ctx.fillRect(cx - 6, y + 18, 12, 16);

        // Kafa
        ctx.fillStyle = '#8B5E3C';
        ctx.beginPath();
        ctx.arc(cx, y + 10, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#D4A76A';
        ctx.beginPath();
        ctx.arc(cx, y + 13, 8, 0, Math.PI * 2);
        ctx.fill();

        // Kulaklar
        ctx.fillStyle = '#D4A76A';
        ctx.beginPath();
        ctx.arc(cx - 11, y + 8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 11, y + 8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#C4956A';
        ctx.beginPath();
        ctx.arc(cx - 11, y + 8, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 11, y + 8, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Gözler
        const eyeOff = this.facingRight ? 3 : -3;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(cx - 3 + eyeOff, y + 10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 3 + eyeOff, y + 10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx - 2 + eyeOff, y + 10, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 4 + eyeOff, y + 10, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Ağız
        ctx.strokeStyle = '#5a3520';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, y + 16, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();

        // Kollar
        ctx.strokeStyle = '#8B5E3C';
        ctx.lineWidth = 3;
        const swing = Math.sin(Date.now() / 150) * 3;
        ctx.beginPath();
        ctx.moveTo(cx - 10, y + 22);
        ctx.lineTo(cx - 15, y + 30 + swing);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 10, y + 22);
        ctx.lineTo(cx + 15, y + 30 - swing);
        ctx.stroke();

        // Bacaklar
        ctx.beginPath();
        ctx.moveTo(cx - 5, y + h - 3);
        ctx.lineTo(cx - 7, y + h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 5, y + h - 3);
        ctx.lineTo(cx + 7, y + h);
        ctx.stroke();
    }
}

// Hayalet Sınıfı (Geçmişin Yankısı)
class Ghost {
    constructor(recording, color) {
        this.recording = recording;
        this.color = color;
        this.width = 30;
        this.height = 40;
        this.currentFrame = 0;
        this.finished = false;

        // İlk pozisyonu ayarla
        if (recording.length > 0) {
            this.x = recording[0].x;
            this.y = recording[0].y;
        }
    }

    update(frame) {
        if (frame < this.recording.length) {
            const data = this.recording[frame];
            this.x = data.x;
            this.y = data.y;
        } else {
            this.finished = true;
        }
    }

    draw() {
        if (this.recording.length === 0) return;

        ctx.save();
        ctx.globalAlpha = this.finished ? 0.25 : 0.45;

        const x = this.x;
        const y = this.y;
        const w = this.width;
        const h = this.height;
        const cx = x + w / 2;

        // Kuyruk
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + h - 15);
        ctx.quadraticCurveTo(x + 18, y + h - 30, x + 12, y + h - 42);
        ctx.stroke();

        // Gövde
        ctx.fillStyle = this.color;
        ctx.fillRect(cx - 11, y + 22, 22, 26);

        // Kafa
        ctx.beginPath();
        ctx.arc(cx, y + 10, 12, 0, Math.PI * 2);
        ctx.fill();

        // Yüz
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(cx, y + 13, 8, 0, Math.PI * 2);
        ctx.fill();

        // Kulaklar
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(cx - 11, y + 8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 11, y + 8, 5, 0, Math.PI * 2);
        ctx.fill();

        // Gözler
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(cx - 3, y + 10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 3, y + 10, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx - 2, y + 10, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 4, y + 10, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Kollar
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 10, y + 22);
        ctx.lineTo(cx - 15, y + 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 10, y + 22);
        ctx.lineTo(cx + 15, y + 30);
        ctx.stroke();

        // Bacaklar
        ctx.beginPath();
        ctx.moveTo(cx - 5, y + h - 3);
        ctx.lineTo(cx - 7, y + h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 5, y + h - 3);
        ctx.lineTo(cx + 7, y + h);
        ctx.stroke();

        ctx.restore();
    }
}

// Bulmaca Objeleri: Buton
class GameButton {
    constructor(x, y, id) {
        this.type = 'Button';
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 10;
        this.id = id;
        this.isPressed = false;
        this.color = '#e74c3c';
    }

    update(entities) {
        const wasPressed = this.isPressed;
        this.isPressed = false;
        // Oyuncu veya herhangi bir hayalet butona basıyor mu?
        entities.forEach(entity => {
            if (entity.x < this.x + this.width &&
                entity.x + entity.width > this.x &&
                entity.y + entity.height >= this.y &&
                entity.y + entity.height <= this.y + this.height + 10) { // Biraz tolerans
                this.isPressed = true;
            }
        });
        if (this.isPressed && !wasPressed) AudioSys.button();
    }

    draw() {
        const h = this.isPressed ? 5 : 10;
        const y = this.isPressed ? this.y + 5 : this.y;

        // Glow effect
        ctx.shadowColor = this.isPressed ? '#2ecc71' : '#e74c3c';
        ctx.shadowBlur = this.isPressed ? 12 : 6;

        // Base
        const grad = ctx.createLinearGradient(this.x, y, this.x, y + h);
        if (this.isPressed) {
            grad.addColorStop(0, '#2ecc71');
            grad.addColorStop(1, '#1a9c54');
        } else {
            grad.addColorStop(0, '#e74c3c');
            grad.addColorStop(1, '#c0392b');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(this.x, y, this.width, h);

        // Metallic highlight
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(this.x + 2, y, this.width - 4, 2);

        ctx.shadowBlur = 0;
    }
}

// Bulmaca Objeleri: Kapı
class Door {
    constructor(x, y, triggerId, isHorizontal = false) {
        this.type = 'Door';
        this.x = x;
        this.y = y;
        this.isHorizontal = isHorizontal;
        // Yatay kapı: geniş ve kısa, dikey kapı: dar ve uzun
        this.width = isHorizontal ? 100 : 20;
        this.height = isHorizontal ? 20 : 100;
        this.triggerId = triggerId;
        this.isOpen = false;
        this.initialX = x;
        this.initialY = y;
    }

    update(isTriggerActive) {
        if (isTriggerActive && !this.isOpen) AudioSys.door();
        if (this.isHorizontal) {
            // Yatay kapı: yana kayar
            const targetX = isTriggerActive ? this.initialX + this.width : this.initialX;
            this.x += (targetX - this.x) * 0.1;
        } else {
            // Dikey kapı: yukarı kayar
            const targetY = isTriggerActive ? this.initialY - this.height : this.initialY;
            this.y += (targetY - this.y) * 0.1;
        }
        this.isOpen = isTriggerActive;
    }

    draw() {
        if (this.isOpen) {
            // Açık kapı — yeşil glow
            ctx.shadowColor = '#2ecc71';
            ctx.shadowBlur = 15;
            ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = '#2ecc71';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(this.x, this.y, this.width, this.height);
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
        } else {
            // Kapalı kapı
            const grad = this.isHorizontal
                ? ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height)
                : ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y);
            grad.addColorStop(0, '#8e2424');
            grad.addColorStop(0.5, '#c0392b');
            grad.addColorStop(1, '#8e2424');
            ctx.fillStyle = grad;
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // Demir çubuklar
            ctx.strokeStyle = '#6b1d1d';
            if (this.isHorizontal) {
                // Yatay kapı: dikey çubuklar
                ctx.lineWidth = 2;
                for (let bx = 8; bx < this.width; bx += 12) {
                    ctx.beginPath();
                    ctx.moveTo(this.x + bx, this.y);
                    ctx.lineTo(this.x + bx, this.y + this.height);
                    ctx.stroke();
                }
                // Yatay çizgi
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y + this.height / 2);
                ctx.lineTo(this.x + this.width, this.y + this.height / 2);
                ctx.stroke();
            } else {
                // Dikey kapı: dikey çubuklar
                ctx.lineWidth = 3;
                for (let bx = 5; bx < this.width; bx += 7) {
                    ctx.beginPath();
                    ctx.moveTo(this.x + bx, this.y);
                    ctx.lineTo(this.x + bx, this.y + this.height);
                    ctx.stroke();
                }
                // Yatay çubuklar
                ctx.lineWidth = 2;
                for (let by = 0; by < this.height; by += 25) {
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y + by);
                    ctx.lineTo(this.x + this.width, this.y + by);
                    ctx.stroke();
                }
            }

            // Highlight/shadow
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(this.x, this.y, this.isHorizontal ? this.width : this.width, this.isHorizontal ? 2 : 3);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            if (this.isHorizontal) {
                ctx.fillRect(this.x, this.y + this.height - 2, this.width, 2);
            } else {
                ctx.fillRect(this.x, this.y + this.height - 3, this.width, 3);
            }
        }
    }
}

// Bölüm Sonu Portalı
class LevelExit {
    constructor(x, y) {
        this.type = 'Exit'; // Tipini belirt
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 60;
    }

    draw() {
        const t = Date.now() / 1000;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Outer glow
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 20 + Math.sin(t * 3) * 8;

        // Portal frame
        const frameGrad = ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y + this.height);
        frameGrad.addColorStop(0, '#f39c12');
        frameGrad.addColorStop(0.5, '#f1c40f');
        frameGrad.addColorStop(1, '#e67e22');
        ctx.fillStyle = frameGrad;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Inner swirl
        ctx.shadowBlur = 0;
        const innerGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 25);
        innerGrad.addColorStop(0, '#fff');
        innerGrad.addColorStop(0.4, '#ffeaa7');
        innerGrad.addColorStop(1, 'rgba(243, 156, 18, 0)');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();

        // Rotating particles
        for (let i = 0; i < 6; i++) {
            const angle = t * 2 + (i * Math.PI / 3);
            const r = 12 + Math.sin(t * 4 + i) * 4;
            const px = cx + Math.cos(angle) * r;
            const py = cy + Math.sin(angle) * r;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(t * 3 + i) * 0.3})`;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Platform (Zemin/Duvar)
class Platform {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    draw() {
        // Stone brick texture
        const isWall = this.height > 30;

        if (isWall) {
            // Vertical wall — dark gradient
            const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.width, this.y);
            grad.addColorStop(0, '#4a4a5a');
            grad.addColorStop(0.5, '#5a5a6a');
            grad.addColorStop(1, '#4a4a5a');
            ctx.fillStyle = grad;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        } else {
            // Horizontal platform — stone look
            const grad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height);
            grad.addColorStop(0, '#6a7a8a');
            grad.addColorStop(0.3, '#586878');
            grad.addColorStop(1, '#4a5a6a');
            ctx.fillStyle = grad;
            ctx.fillRect(this.x, this.y, this.width, this.height);

            // Brick lines
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 1;
            const brickW = 20;
            const brickH = this.height / 2;
            for (let row = 0; row < 2; row++) {
                const offsetX = row % 2 === 0 ? 0 : brickW / 2;
                for (let bx = -offsetX; bx < this.width; bx += brickW) {
                    const drawX = this.x + bx;
                    const drawY = this.y + row * brickH;
                    if (drawX + brickW > this.x && drawX < this.x + this.width) {
                        ctx.strokeRect(
                            Math.max(drawX, this.x), drawY,
                            Math.min(brickW, this.x + this.width - Math.max(drawX, this.x)), brickH
                        );
                    }
                }
            }

            // Top highlight
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(this.x, this.y, this.width, 2);

            // Bottom shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(this.x, this.y + this.height - 2, this.width, 2);
        }
    }
}

// BÖLÜM TASARIMLARI
let LEVELS = [
    // BÖLÜM 1: Giriş (Düz Zemin)
    {
        playerStart: { x: 50, y: 300 },
        objects: [
            { type: 'Button', x: 300, y: 420, id: 1 },
            { type: 'Door', x: 500, y: 330, triggerId: 1 },
            { type: 'Exit', x: 740, y: 370 },
            { type: 'Platform', x: 0, y: 430, width: 800, height: 20 } // Zemin
        ]
    },
    // BÖLÜM 2: Merdivenler
    {
        playerStart: { x: 50, y: 350 },
        objects: [
            { type: 'Platform', x: 0, y: 430, width: 800, height: 20 },
            { type: 'Platform', x: 200, y: 370, width: 100, height: 20 },
            { type: 'Platform', x: 350, y: 300, width: 150, height: 20 },
            { type: 'Button', x: 400, y: 290, id: 1 },
            { type: 'Door', x: 600, y: 330, triggerId: 1 },
            { type: 'Exit', x: 750, y: 370 }
        ]
    },
    // BÖLÜM 3: Asansör
    {
        playerStart: { x: 50, y: 350 },
        objects: [
            { type: 'Platform', x: 0, y: 430, width: 800, height: 20 },
            { type: 'Platform', x: 150, y: 350, width: 80, height: 20 },
            { type: 'Platform', x: 200, y: 280, width: 80, height: 20 },
            { type: 'Platform', x: 100, y: 210, width: 150, height: 20 },
            { type: 'Button', x: 120, y: 200, id: 1 },
            { type: 'Door', x: 600, y: 330, triggerId: 1 },
            { type: 'Exit', x: 740, y: 370 },
            { type: 'Platform', x: 400, y: 300, width: 100, height: 20 }
        ]
    },
    // BÖLÜM 4: Strateji
    {
        playerStart: { x: 50, y: 350 },
        objects: [
            { type: 'Platform', x: 0, y: 430, width: 800, height: 20 },
            { type: 'Exit', x: 750, y: 370 },
            { type: 'Door', x: 400, y: 330, triggerId: 1 },
            { type: 'Platform', x: 400, y: 0, width: 20, height: 350 },
            { type: 'Platform', x: 0, y: 300, width: 150, height: 20 },
            { type: 'Button', x: 50, y: 290, id: 1 },
            { type: 'Platform', x: 150, y: 350, width: 80, height: 20 }
        ]
    }
];

// SABİT RASTGELE SAYI ÜRETECİ (Seeded PRNG)
// Her seviye için aynı "rastgele" değerleri üretir
function createSeededRandom(seed) {
    let state = seed;
    return function () {
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (state >>> 0) / 0xFFFFFFFF;
    };
}

// ============================================
// DOĞRULAMA SİSTEMİ: Fizik Tabanlı Erişilebilirlik
// ============================================

// İki platform arasında zıplayarak geçiş mümkün mü?
function canReach(from, to, allPlatforms = []) {
    // from, to: {x, y, width} → y = platformun üst yüzeyi
    const jumpForce = 14;
    const gravity = 0.8;
    const speed = 6;
    const maxJumpH = (jumpForce * jumpForce) / (2 * gravity); // ~122px

    const dy = from.y - to.y;

    const fromRight = from.x + from.width;
    const toRight = to.x + to.width;
    let gap;
    if (fromRight < to.x) gap = to.x - fromRight;
    else if (toRight < from.x) gap = from.x - toRight;
    else gap = 0;

    // Yatay sıçramayı engelleyen duvar var mı?
    if (allPlatforms.length > 0) {
        const minX = Math.min(from.x + from.width / 2, to.x + to.width / 2);
        const maxX = Math.max(from.x + from.width / 2, to.x + to.width / 2);
        const maxY = Math.max(from.y, to.y);
        const jumpArcMidY = Math.min(from.y, to.y) - (gap > 0 ? 40 : 10);

        for (const p of allPlatforms) {
            if (p.height && p.height > 30) { // Duvar
                if (p.x < maxX && p.x + p.width > minX) {
                    if (p.y < maxY && p.y + p.height > jumpArcMidY) {
                        return false;
                    }
                }
            }
        }
    }

    if (dy > 0) {
        // YUKARI ZIPLAMA
        if (dy > maxJumpH * 0.9) return false;

        // dy yüksekliğinde asılı kalma süresi
        const disc = jumpForce * jumpForce - 2 * gravity * dy;
        if (disc < 0) return false;
        const hangTime = 2 * Math.sqrt(disc) / gravity;
        const maxHoriz = speed * hangTime * 0.85;

        return gap <= maxHoriz;
    } else {
        // AŞAĞI DÜŞME veya AYNI SEVİYE
        return gap <= 250;
    }
}

// Platform pozisyonunu düzelt (erişilebilir hale getir)
function fixPlatformPosition(from, toX, toY, toWidth, allPlatforms = []) {
    // Önce mevcut konum geçerli mi?
    if (canReach(from, { x: toX, y: toY, width: toWidth }, allPlatforms)) {
        return toX; // Geçerli, değiştirmeye gerek yok
    }

    // Önceki platformun ortasına doğru çek
    const fromCenter = from.x + from.width / 2;
    const direction = (toX > fromCenter) ? 1 : -1;

    // Giderek yakınlaştır
    for (let offset = 20; offset <= 300; offset += 20) {
        const newX = fromCenter + direction * (offset - toWidth / 2);
        const clamped = Math.max(20, Math.min(660, newX));
        if (canReach(from, { x: clamped, y: toY, width: toWidth }, allPlatforms)) {
            return clamped;
        }
    }

    // Son çare: tam üstüne koy
    return Math.max(20, Math.min(660, fromCenter - toWidth / 2));
}

// ============================================
// LAYOUT × PUZZLE LEVEL GENERATOR
// 8 Layouts × 10 Puzzles × Progressive Difficulty
// ============================================
function generateLevels() {
    const W = 800, GY = 430, GH = 40, WT = 25;

    // ─── Difficulty Scaling ───
    function getDiff(n) {
        const t = Math.min(1, (n - 1) / 94);
        return {
            pw: Math.max(55, Math.floor(140 - t * 80)),
            vg: Math.max(40, Math.floor(70 - t * 25)),
            nb: Math.min(5, 1 + Math.floor(t * 4.5)),
            nf: Math.min(4, 1 + Math.floor(t * 3))
        };
    }

    // ─── Puzzle Type Selection (no consecutive repeat) ───
    function pickType(n, rand, last) {
        let p;
        if (n <= 6) p = ['LINEAR'];
        else if (n <= 10) p = ['LINEAR', 'GHOST_SYNC'];
        else if (n <= 15) p = ['GHOST_SYNC', 'CEILING_CRAWL'];
        else if (n <= 21) p = ['CEILING_CRAWL', 'DOUBLE_BTN', 'GHOST_SYNC'];
        else if (n <= 28) p = ['DOUBLE_BTN', 'SEQUENCE', 'SPLIT_PATH'];
        else if (n <= 38) p = ['SEQUENCE', 'SPLIT_PATH', 'TOWER'];
        else if (n <= 52) p = ['TOWER', 'CHAIN', 'SPLIT_PATH'];
        else if (n <= 66) p = ['CHAIN', 'FORTRESS', 'TOWER'];
        else if (n <= 82) p = ['FORTRESS', 'MASTER', 'CHAIN'];
        else p = ['MASTER', 'FORTRESS'];
        let f = p.filter(t => t !== last);
        if (!f.length) f = p;
        return f[Math.floor(rand() * f.length)];
    }

    // ─── Layout Type Selection (no consecutive repeat) ───
    function pickLayout(n, rand, last) {
        let p;
        if (n <= 8) p = ['H_MAZE', 'ARENA'];
        else if (n <= 18) p = ['H_MAZE', 'ARENA', 'SPLIT', 'BACKTRACK'];
        else if (n <= 35) p = ['SPLIT', 'BACKTRACK', 'CORE', 'M_FLOOR'];
        else if (n <= 55) p = ['V_TOWER', 'CORE', 'SPIRAL', 'M_FLOOR'];
        else if (n <= 75) p = ['V_TOWER', 'SPIRAL', 'BACKTRACK', 'CORE'];
        else p = ['V_TOWER', 'SPIRAL', 'CORE', 'M_FLOOR', 'BACKTRACK'];
        let f = p.filter(t => t !== last);
        if (!f.length) f = p;
        return f[Math.floor(rand() * f.length)];
    }

    // ─── Helper: validated platform placement ───
    function vPlat(objs, prev, x, y, w) {
        const maxJumpSafe = 100; // maxJumpH * 0.8 padding
        let curPrev = prev;

        // Zıplama mesafesini aşan durumlarda merdiven / basamaklar ekle
        while (curPrev.y - y > maxJumpSafe) {
            const stepY = curPrev.y - maxJumpSafe + 15;
            let stepX = curPrev.x + (Math.random() > 0.5 ? 90 : -90);
            stepX = Math.max(10, Math.min(W - w - 10, stepX));
            if (!canReach(curPrev, { x: stepX, y: stepY, width: w }, objs)) {
                stepX = fixPlatformPosition(curPrev, stepX, stepY, w, objs);
            }
            objs.push({ type: 'Platform', x: stepX, y: stepY, width: w, height: 20 });
            curPrev = { x: stepX, y: stepY, width: w };
        }

        if (!canReach(curPrev, { x, y, width: w }, objs)) x = fixPlatformPosition(curPrev, x, y, w, objs);
        x = Math.max(10, Math.min(W - w - 10, x));
        y = Math.max(80, y);
        objs.push({ type: 'Platform', x, y, width: w, height: 20 });
        return { x, y, width: w };
    }

    // ════════════════════════════════════════════
    //  8 LAYOUT BUILDERS
    //  Each returns { o[], spawn, exit, path[] }
    //  path = ordered key platforms for puzzle placement
    // ════════════════════════════════════════════

    // HORIZONTAL_MAZE — Wide ground, platforms spread horizontally
    function layHMaze(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        const np = 5 + Math.floor(rand() * 3);
        const seg = Math.floor((W - 60) / np);
        let prev = gnd;
        for (let i = 0; i < np; i++) {
            const px = 20 + i * seg + Math.floor(rand() * seg * 0.3);
            const py = GY - 35 - Math.floor(rand() * 70);
            const pw = Math.max(d.pw, 55 + Math.floor(rand() * 35));
            prev = vPlat(o, prev, px, py, pw);
            path.push({ x: prev.x, y: prev.y, w: prev.width });
        }
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: W - 70, y: GY - 60 }, path };
    }

    // ARENA — Sparse elevated platforms with wide gaps
    function layArena(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        const spots = [
            [60 + Math.floor(rand() * 50), GY - 55 - Math.floor(rand() * 50)],
            [220 + Math.floor(rand() * 80), GY - 80 - Math.floor(rand() * 60)],
            [440 + Math.floor(rand() * 80), GY - 50 - Math.floor(rand() * 70)],
            [630 + Math.floor(rand() * 50), GY - 70 - Math.floor(rand() * 50)]
        ];
        let prev = gnd;
        for (const [sx, sy] of spots) {
            const pw = Math.max(d.pw + 10, 70 + Math.floor(rand() * 40));
            prev = vPlat(o, prev, sx, sy, pw);
            path.push({ x: prev.x, y: prev.y, w: prev.width });
        }
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: W - 80, y: GY - 60 }, path };
    }

    // SPLIT_BRANCH — Fork into upper and lower routes
    function laySplit(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        // Entry
        let prev = vPlat(o, gnd, 70, GY - 50, d.pw + 30);
        path.push({ x: prev.x, y: prev.y, w: prev.width });
        // Upper branch
        let u = vPlat(o, prev, 170 + Math.floor(rand() * 50), GY - 130 - Math.floor(rand() * 40), d.pw);
        path.push({ x: u.x, y: u.y, w: u.width });
        u = vPlat(o, u, 320 + Math.floor(rand() * 60), u.y - d.vg + Math.floor(rand() * 15), d.pw);
        path.push({ x: u.x, y: u.y, w: u.width });
        // Lower branch
        let lo = vPlat(o, prev, 190 + Math.floor(rand() * 50), GY - 40 - Math.floor(rand() * 15), d.pw + 15);
        path.push({ x: lo.x, y: lo.y, w: lo.width });
        lo = vPlat(o, lo, 380 + Math.floor(rand() * 50), GY - 35 - Math.floor(rand() * 25), d.pw);
        path.push({ x: lo.x, y: lo.y, w: lo.width });
        // Merge
        const mp = vPlat(o, u, 540 + Math.floor(rand() * 60), GY - 70, d.pw + 25);
        path.push({ x: mp.x, y: mp.y, w: mp.width });
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: W - 65, y: mp.y - 50 }, path };
    }

    // BACKTRACK — Go right, then return left at higher elevation
    function layBacktrack(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        let prev = gnd;
        // Outward path (right)
        const outward = [
            [90 + Math.floor(rand() * 50), GY - 50 - Math.floor(rand() * 30)],
            [260 + Math.floor(rand() * 60), GY - 90 - Math.floor(rand() * 40)],
            [440 + Math.floor(rand() * 80), GY - 65 - Math.floor(rand() * 50)],
            [610 + Math.floor(rand() * 50), GY - 110 - Math.floor(rand() * 40)]
        ];
        for (const [rx, ry] of outward) {
            prev = vPlat(o, prev, rx, ry, d.pw + Math.floor(rand() * 20));
            path.push({ x: prev.x, y: prev.y, w: prev.width });
        }
        // Return path (left, higher)
        const retY = prev.y - d.vg;
        const ret = [
            [500 + Math.floor(rand() * 40), retY],
            [300 + Math.floor(rand() * 60), retY - d.vg + Math.floor(rand() * 15)],
            [120 + Math.floor(rand() * 50), retY - d.vg * 2 + Math.floor(rand() * 20)]
        ];
        for (const [rx, ry] of ret) {
            prev = vPlat(o, prev, rx, Math.max(100, ry), d.pw + Math.floor(rand() * 15));
            path.push({ x: prev.x, y: prev.y, w: prev.width });
        }
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: 80, y: prev.y - 50 }, path };
    }

    // CENTRAL_CORE — Hub platform in center, spokes radiate out
    function layCore(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        // Central hub
        const cx = 280 + Math.floor(rand() * 100), cy = GY - 130 - Math.floor(rand() * 50);
        const cw = 150 + Math.floor(rand() * 50);
        o.push({ type: 'Platform', x: cx, y: cy, width: cw, height: 20 });
        // Left spoke
        let prev = gnd;
        let lp = vPlat(o, prev, 35 + Math.floor(rand() * 30), GY - 55, d.pw + 25);
        path.push({ x: lp.x, y: lp.y, w: lp.width });
        lp = vPlat(o, lp, 100 + Math.floor(rand() * 50), cy + d.vg, d.pw);
        path.push({ x: lp.x, y: lp.y, w: lp.width });
        // Center
        path.push({ x: cx, y: cy, w: cw });
        // Right spoke
        let rp = vPlat(o, { x: cx, y: cy, width: cw }, cx + cw + 20 + Math.floor(rand() * 40), cy + d.vg + Math.floor(rand() * 20), d.pw);
        path.push({ x: rp.x, y: rp.y, w: rp.width });
        rp = vPlat(o, rp, 580 + Math.floor(rand() * 80), GY - 45 - Math.floor(rand() * 30), d.pw + 10);
        path.push({ x: rp.x, y: rp.y, w: rp.width });
        // Top spoke
        let tp = vPlat(o, { x: cx, y: cy, width: cw }, cx + Math.floor(rand() * 40), cy - d.vg - Math.floor(rand() * 20), d.pw);
        path.push({ x: tp.x, y: tp.y, w: tp.width });
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: cx + 30, y: cy - 75 }, path };
    }

    // VERTICAL_TOWER — Tall column with alternating zigzag climb
    function layVTower(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        let prev = gnd;
        const nSteps = 6 + Math.floor(rand() * 4);
        const vgap = 45 + Math.floor(rand() * 25);
        for (let i = 0; i < nSteps; i++) {
            const isL = (i % 2 === 0);
            const px = isL ? (25 + Math.floor(rand() * 130)) : (420 + Math.floor(rand() * 200));
            const py = GY - (i + 1) * vgap;
            if (py < 80) break;
            const pw = Math.max(d.pw, 75 + Math.floor(rand() * 45));
            prev = vPlat(o, prev, px, py, pw);
            path.push({ x: prev.x, y: prev.y, w: prev.width });
        }
        const top = path[path.length - 1] || { x: 350, y: 200, w: 100 };
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: top.x + 15, y: top.y - 65 }, path };
    }

    // SPIRAL_ASCENT — Platforms spiral along edges going up
    function laySpiral(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        // Spiral: bottom-right → right → top-right → top-left → left → higher
        const spiral = [
            [480 + Math.floor(rand() * 80), GY - 50 - Math.floor(rand() * 25)],
            [600 + Math.floor(rand() * 70), GY - 110 - Math.floor(rand() * 30)],
            [500 + Math.floor(rand() * 60), GY - 170 - Math.floor(rand() * 25)],
            [300 + Math.floor(rand() * 60), GY - 200 - Math.floor(rand() * 30)],
            [110 + Math.floor(rand() * 60), GY - 230 - Math.floor(rand() * 25)],
            [50 + Math.floor(rand() * 50), GY - 290 - Math.floor(rand() * 20)],
            [180 + Math.floor(rand() * 80), GY - 330 - Math.floor(rand() * 15)]
        ];
        let prev = gnd;
        for (const [sx, sy] of spiral) {
            const pw = Math.max(d.pw, 60 + Math.floor(rand() * 35));
            prev = vPlat(o, prev, sx, Math.max(90, sy), pw);
            path.push({ x: prev.x, y: prev.y, w: prev.width });
        }
        const top = path[path.length - 1];
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: top.x + 10, y: top.y - 55 }, path };
    }

    // MULTI_FLOOR — 2-3 horizontal floors stacked with gaps between
    function layMFloor(rand, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        const path = [], gnd = { x: 0, y: GY, width: W };
        const nFloors = 2 + Math.floor(rand());
        let curY = GY;
        let prev = gnd;

        for (let f = 0; f < nFloors; f++) {
            const floorY = curY - 140 - Math.floor(rand() * 60);
            const gapX = 150 + Math.floor(rand() * 400);
            const gapW = 80 + Math.floor(rand() * 50);
            // Floor with gap
            if (gapX > 20) o.push({ type: 'Platform', x: 0, y: floorY, width: gapX, height: GH });
            if (gapX + gapW < W - 20) o.push({ type: 'Platform', x: gapX + gapW, y: floorY, width: W - gapX - gapW, height: GH });
            // Stepping platforms between floors
            const np = 2 + Math.floor(rand() * 2);
            for (let p = 0; p < np; p++) {
                const px = 30 + Math.floor(rand() * (W - 100));
                const py = curY - 40 - Math.floor(rand() * (curY - floorY - 60));
                const pw = d.pw + Math.floor(rand() * 30);
                prev = vPlat(o, prev, px, Math.max(floorY + 50, py), pw);
                path.push({ x: prev.x, y: prev.y, w: prev.width });
            }
            curY = floorY;
        }
        // Exit above top floor
        const top = path[path.length - 1] || { x: 350, y: 200, w: 100 };
        return { o, spawn: { x: 50, y: GY - 80 }, exit: { x: top.x + 15, y: curY - 55 }, path };
    }

    // ════════════════════════════════════════════
    //  UNIFIED PUZZLE PLACER
    //  Adapts puzzle mechanics to ANY layout terrain
    // ════════════════════════════════════════════
    function placePuzzle(pType, lay, rand, d, n) {
        const level = { playerStart: lay.spawn, objects: [...lay.o] };
        const o = level.objects;
        const path = lay.path;

        // Determine button count from puzzle type
        let nBtn;
        switch (pType) {
            case 'LINEAR': case 'GHOST_SYNC': case 'CEILING_CRAWL': nBtn = 1; break;
            case 'DOUBLE_BTN': case 'SPLIT_PATH': nBtn = 2; break;
            case 'SEQUENCE': case 'TOWER': nBtn = Math.min(3, d.nb); break;
            case 'CHAIN': case 'FORTRESS': nBtn = Math.min(4, d.nb); break;
            case 'MASTER': nBtn = Math.min(5, d.nb); break;
            default: nBtn = 1;
        }
        nBtn = Math.min(nBtn, Math.max(1, path.length - 1));

        // Divide path into segments — button at end of each, barrier after
        const segSize = Math.max(1, Math.floor(path.length / (nBtn + 1)));

        for (let b = 0; b < nBtn; b++) {
            // Button position: end of segment b
            const btnIdx = Math.min((b + 1) * segSize - 1, path.length - 2);
            const spot = path[btnIdx];
            o.push({ type: 'Button', x: spot.x + 10, y: spot.y - 10, id: b + 1 });

            // Barrier between this button and next segment
            const nextIdx = Math.min(btnIdx + 1, path.length - 1);
            if (nextIdx > btnIdx) {
                const before = path[btnIdx];
                const after = path[nextIdx];
                const dy = before.y - after.y;

                if (Math.abs(dy) > 60) {
                    // Vertical movement → horizontal barrier with PERMANENT SHAFT
                    const barY = Math.floor((before.y + after.y) / 2);
                    // Ensure the shaft and door don't completely overlap or trap the player
                    const shaftX = Math.max(10, Math.min(W - 90, Math.max(before.x, after.x) + 30));
                    const shaftW = 70;

                    let doorX = Math.max(60, Math.min(W - 200, Math.min(before.x, after.x)));
                    // Eğer kapı permenant shaft ile çakışıyorsa kapıyı kaydır
                    if (Math.abs(doorX - shaftX) < 80) {
                        doorX = (shaftX > W / 2) ? shaftX - 100 : shaftX + 100;
                    }

                    const openings = [
                        { start: doorX, end: doorX + 100 },
                        { start: shaftX, end: shaftX + shaftW }
                    ].sort((a, b) => a.start - b.start);

                    const merged = [openings[0]];
                    for (let m = 1; m < openings.length; m++) {
                        const last = merged[merged.length - 1];
                        if (openings[m].start <= last.end + 10) {
                            last.end = Math.max(last.end, openings[m].end);
                        } else { merged.push(openings[m]); }
                    }

                    let cx = 0;
                    for (const gap of merged) {
                        if (gap.start - cx > 20) {
                            o.push({ type: 'Platform', x: cx, y: barY, width: gap.start - cx, height: GH });
                        }
                        cx = gap.end;
                    }
                    if (W - cx > 20) {
                        o.push({ type: 'Platform', x: cx, y: barY, width: W - cx, height: GH });
                    }
                    o.push({ type: 'Door', x: doorX, y: barY, triggerId: b + 1, horizontal: true });

                    // Step platforms for access
                    const stepY1 = barY + 50;
                    const stepY2 = barY - 50;
                    if (stepY1 < GY - 20) o.push({ type: 'Platform', x: shaftX - 20, y: stepY1, width: 60, height: 20 });
                    o.push({ type: 'Platform', x: shaftX + 5, y: Math.max(80, stepY2), width: 60, height: 20 });
                } else {
                    // Horizontal movement → vertical wall
                    const wallX = Math.max(40, Math.min(W - 50, Math.floor((before.x + before.w + after.x) / 2)));
                    o.push({ type: 'Platform', x: wallX, y: GY - 330, width: WT, height: 230 });
                    o.push({ type: 'Door', x: wallX, y: GY - 100, triggerId: b + 1 });
                }
            }
        }

        if (pType === 'CEILING_CRAWL' || pType === 'FORTRESS' || pType === 'MASTER') {
            const cs = path[Math.min(1, path.length - 1)];
            if (cs) o.push({ type: 'Platform', x: cs.x - 10, y: cs.y - 33, width: Math.floor(cs.w * 0.6), height: 12 });
            if (pType !== 'CEILING_CRAWL' && path.length > 3) {
                const cs2 = path[Math.floor(path.length * 0.6)];
                o.push({ type: 'Platform', x: cs2.x, y: cs2.y - 35, width: Math.floor(cs2.w * 0.5), height: 12 });
            }
        }

        o.push({ type: 'Platform', x: lay.exit.x - 25, y: lay.exit.y + 45, width: 110, height: 20 });
        o.push({ type: 'Exit', x: lay.exit.x, y: lay.exit.y });

        return level;
    }

    // ════════════════════════════════════════════
    //  REACHABILITY VALIDATION
    // ════════════════════════════════════════════
    function validateLevel(level, levelIndex = -1) {
        const platforms = level.objects.filter(o => o.type === 'Platform');
        const doors = level.objects.filter(o => o.type === 'Door');
        const buttons = level.objects.filter(o => o.type === 'Button');
        const exits = level.objects.filter(o => o.type === 'Exit');

        // Tüm fiziksel engeller (platformlar + kapalı kapılar)
        const surfs = [
            ...platforms.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height })),
            ...doors.map(d => ({
                x: d.x, y: d.y,
                width: d.horizontal ? 150 : 20, // Tahmini kapı boyutları
                height: d.horizontal ? 20 : 150
            }))
        ];

        // Sadece üzerinden yürünebilecek zeminleri ayıklar (yatay zeminler)
        const walkableSurfs = surfs.filter(s => s.height <= 30);
        const spawn = level.playerStart;

        function canReachTarget(tx, ty) {
            let startPlat = walkableSurfs.find(s => spawn.x >= s.x && spawn.x <= s.x + s.width && Math.abs(s.y - (spawn.y + 40)) < 30);
            if (!startPlat) {
                startPlat = walkableSurfs.reduce((best, s) => {
                    const dist = Math.abs((s.x + s.width / 2) - spawn.x) + Math.abs(s.y - (spawn.y + 40));
                    const bDist = Math.abs((best.x + best.width / 2) - spawn.x) + Math.abs(best.y - (spawn.y + 40));
                    return dist < bDist ? s : best;
                }, walkableSurfs[0]);
            }

            let targetPlat = walkableSurfs.find(s => tx >= s.x && tx <= s.x + s.width && Math.abs(s.y - (ty + 10)) < 30);
            if (!targetPlat) {
                targetPlat = walkableSurfs.reduce((best, s) => {
                    const dist = Math.abs((s.x + s.width / 2) - tx) + Math.abs(s.y - ty);
                    const bDist = Math.abs((best.x + best.width / 2) - tx) + Math.abs(best.y - ty);
                    return dist < bDist ? s : best;
                }, walkableSurfs[0]);
            }

            if (!startPlat || !targetPlat) return false;

            const visited = new Set();
            const queue = [startPlat];
            visited.add(walkableSurfs.indexOf(startPlat));

            let attempts = 0; // Sonsuz döngü kırıcısı

            while (queue.length > 0) {
                attempts++;
                if (attempts > 500) {
                    if (levelIndex === 40) console.log(`[LEVEL 41 DEBUG] ESCAPED INFINITE LOOP`);
                    return false; // Çok karmaşık veya döngüsel bölüm, doğrudan reddet
                }

                const cur = queue.shift();
                if (cur === targetPlat) {
                    if (levelIndex === 40) console.log(`[LEVEL 41 DEBUG] Found path to target (${tx}, ${ty})!`);
                    return true;
                }
                for (let i = 0; i < walkableSurfs.length; i++) {
                    // Gezinilebilir yüzeylere zıpla, bloklayıcı tüm 'surfs'leri dikkate al
                    if (!visited.has(i) && canReach(cur, walkableSurfs[i], surfs)) {
                        visited.add(i);
                        queue.push(walkableSurfs[i]);
                    }
                }
            }
            if (levelIndex === 40) console.log(`[LEVEL 41 DEBUG] FAILED to reach target (${tx}, ${ty}) from spawn.`);
            return false;
        }

        // Kural: İlk buton erişilebilir olmak zorundadır
        if (buttons.length > 0) {
            if (levelIndex === 40) console.log(`[LEVEL 41 DEBUG] Checking first button at (${buttons[0].x}, ${buttons[0].y})...`);
            if (!canReachTarget(buttons[0].x, buttons[0].y)) return false;
        }

        for (const btn of buttons) if (!canReachTarget(btn.x, btn.y)) return false;
        for (const ex of exits) if (!canReachTarget(ex.x, ex.y)) return false;
        return true;
    }

    function makeFallback(n, d) {
        const o = [{ type: 'Platform', x: 0, y: GY, width: W, height: GH }];
        o.push({ type: 'Platform', x: 100, y: GY - 60, width: Math.max(d.pw, 80), height: 20 });
        o.push({ type: 'Button', x: 110, y: GY - 70, id: 1 });
        const wx = 400;
        o.push({ type: 'Platform', x: wx, y: GY - 330, width: WT, height: 230 });
        o.push({ type: 'Door', x: wx, y: GY - 100, triggerId: 1 });
        o.push({ type: 'Exit', x: 600, y: GY - 60 });
        return { playerStart: { x: 50, y: GY - 80 }, objects: o };
    }

    // ════════════════════════════════════════════
    //  MAIN GENERATION LOOP
    // ════════════════════════════════════════════
    let lastLayout = null, lastType = null;
    for (let i = 4; i < 99; i++) {
        const n = i - 3;
        const d = getDiff(n);
        let level = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            const rand = createSeededRandom(i * 7919 + 42 + attempt * 1301);
            const layout = pickLayout(n, rand, lastLayout);
            const type = pickType(n, rand, lastType);
            let lay;
            switch (layout) {
                case 'H_MAZE': lay = layHMaze(rand, d); break;
                case 'ARENA': lay = layArena(rand, d); break;
                case 'SPLIT': lay = laySplit(rand, d); break;
                case 'BACKTRACK': lay = layBacktrack(rand, d); break;
                case 'CORE': lay = layCore(rand, d); break;
                case 'V_TOWER': lay = layVTower(rand, d); break;
                case 'SPIRAL': lay = laySpiral(rand, d); break;
                case 'M_FLOOR': lay = layMFloor(rand, d); break;
                default: lay = layHMaze(rand, d); break;
            }
            const candidate = placePuzzle(type, lay, rand, d, n);
            if (validateLevel(candidate, i - 4)) {
                level = candidate;
                lastLayout = layout;
                lastType = type;
                break;
            }
        }
        if (!level) level = makeFallback(n, d);
        LEVELS.push(level);
    }
}

// Oyun Durumu
const Game = {
    player: null,
    ghosts: [],
    currentRecording: [],
    frame: 0,
    isRewinding: false,
    levelObjects: [],
    currentLevelIndex: 0,
    platforms: [],
    state: 'MENU',
    camera: { x: 0, y: 0 },
    maxScrollY: 0,

    // UPDATE LOOP (FIXED TIMESTEP)
    lastTime: 0,
    accumulator: 0,
    timeStep: 1000 / 60, // Saniyede 60 fizik adımı (144Hz sorunu çözümü)

    init() {
        generateLevels(); // Bölümleri oluştur
        Input.init();
        this.createLevelButtons();
        this.showMainMenu();
        requestAnimationFrame((ts) => this.loop(ts));
    },

    createLevelButtons() {
        const grid = document.getElementById('level-grid');
        grid.innerHTML = '';
        LEVELS.forEach((level, index) => {
            const btn = document.createElement('button');
            btn.className = 'level-btn';
            btn.innerText = index + 1;
            btn.onclick = () => Game.loadLevel(index);
            grid.appendChild(btn);
        });
    },

    showMainMenu() {
        this.state = 'MENU';
        const mainMenu = document.getElementById('main-menu');
        const levelSelect = document.getElementById('level-select');
        mainMenu.style.display = 'flex';
        levelSelect.classList.remove('visible');
        levelSelect.style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
        // Trigger fade-in on next frame
        requestAnimationFrame(() => mainMenu.classList.add('visible'));
    },

    showLevelSelect() {
        this.state = 'LEVEL_SELECT';
        const mainMenu = document.getElementById('main-menu');
        const levelSelect = document.getElementById('level-select');
        mainMenu.classList.remove('visible');
        mainMenu.style.display = 'none';
        levelSelect.style.display = 'flex';
        // Trigger fade-in on next frame
        requestAnimationFrame(() => levelSelect.classList.add('visible'));
    },

    loadLevel(index) {
        this.currentLevelIndex = index;
        this.state = 'PLAYING';

        // UI Güncelleme — fade out, then hide
        const mainMenu = document.getElementById('main-menu');
        const levelSelect = document.getElementById('level-select');
        mainMenu.classList.remove('visible');
        levelSelect.classList.remove('visible');
        mainMenu.style.display = 'none';
        levelSelect.style.display = 'none';

        const levelData = LEVELS[index];

        this.ghosts = [];
        this.currentRecording = [];
        this.frame = 0;
        this.isRewinding = false;

        this.player = new Player(levelData.playerStart.x, levelData.playerStart.y);
        this.camera.y = 0; // Kamerayı sıfırla
        this.maxScrollY = 0;

        this.levelObjects = [];
        this.platforms = [];

        levelData.objects.forEach(obj => {
            if (obj.type === 'Button') this.levelObjects.push(new GameButton(obj.x, obj.y, obj.id));
            if (obj.type === 'Door') this.levelObjects.push(new Door(obj.x, obj.y, obj.triggerId, obj.horizontal || false));
            if (obj.type === 'Exit') this.levelObjects.push(new LevelExit(obj.x, obj.y));
            if (obj.type === 'Platform') this.platforms.push(new Platform(obj.x, obj.y, obj.width, obj.height));
        });

        resize();
    },

    resetLevel(hardReset = false) {
        const levelData = LEVELS[this.currentLevelIndex];

        // Eğer Hard Reset (Ölüm) ise hayaletleri de sil, en baştan başlat
        if (hardReset) {
            this.ghosts = [];
        }

        this.player = new Player(levelData.playerStart.x, levelData.playerStart.y);
        this.frame = 0;
        this.currentRecording = [];
        this.isRewinding = false;
        // Kamerayı resetle (En baştan)
        this.camera.y = 0;
        this.maxScrollY = 0;
        if (hardReset) AudioSys.die();

        // Obje durumlarını sıfırla (buton/kapı)
        this.levelObjects.forEach(obj => {
            if (obj instanceof GameButton) obj.isPressed = false;
            if (obj instanceof Door) {
                obj.isOpen = false;
                obj.x = obj.initialX;
                obj.y = obj.initialY;
            }
        });
    },

    nextLevel() {
        if (this.currentLevelIndex + 1 < LEVELS.length) {
            this.loadLevel(this.currentLevelIndex + 1);
        } else {
            alert("OYUN BİTTİ! EFSANESİN!");
            this.showMainMenu();
        }
    },

    startNewLoop() {
        if (this.currentRecording.length > 0) {
            const colors = ['#e74c3c', '#9b59b6', '#f1c40f', '#34495e'];
            const color = colors[this.ghosts.length % colors.length];
            const newGhost = new Ghost([...this.currentRecording], color);
            this.ghosts.push(newGhost);
        }
        // Döngü sayacını güncelle + pulse animation
        const loopEl = document.getElementById('loop-counter');
        loopEl.innerText = `Döngü: ${this.ghosts.length + 1}`;
        loopEl.classList.remove('pulse');
        requestAnimationFrame(() => loopEl.classList.add('pulse'));
        // Normal reset (Hayaletler kalsın)
        this.resetLevel(false);
    },

    update() {
        if (this.state !== 'PLAYING') return;

        // --- KAMERA TAKİBİ (ESNEK 100PX AŞAĞI İNİŞ İZNİ) ---
        // Oyuncu ekranın %40'ından yukarı çıkarsa kamera yukarı kaysın
        const targetCamY = Math.min(0, this.player.y - 300);

        if (targetCamY < this.camera.y) {
            // Smooth scroll (Hızlı yukarı çıkış)
            this.camera.y += (targetCamY - this.camera.y) * 0.1;
        } else if (targetCamY > this.camera.y + 100) {
            // Az da olsa aşağı inmesine izin ver (Kör olmamak için)
            this.camera.y += (targetCamY - (this.camera.y + 100)) * 0.05;
        }

        if (this.camera.y < this.maxScrollY) {
            this.maxScrollY = this.camera.y;
        }

        // --- ÖLÜM KONTROLÜ (LAVA / AŞAĞI DÜŞME) ---
        // Lava'yı maxScrollY'ye bağladık, o yüzden kamera inse de lava inmez.
        const climbAmount = -this.maxScrollY;
        if (climbAmount > 150) {
            // Kule seviyelerde: Lava ekranın altında (görünür uyarı sonrası ölüm)
            const lavaSurfaceY = this.maxScrollY + canvas.height + 30;
            if (this.player.y + this.player.height >= lavaSurfaceY) {
                this.resetLevel(true);
                return;
            }
        } else {
            // Düz seviyelerde: Ekranın çok altına düşerse öl
            if (this.player.y > canvas.height + 100) {
                this.resetLevel(true);
                return;
            }
        }

        // Rewind
        if (Input.isDown('REWIND') && !this.isRewinding) {
            AudioSys.rewind();
            this.isRewinding = true;
            this.startNewLoop();
            return;
        }
        if (!Input.isDown('REWIND')) this.isRewinding = false;

        // --- ZAMAN SINIRI (Maksimum 60 saniye / 3600 Frame) ---
        if (this.currentRecording.length >= 3600 && !this.isRewinding) {
            AudioSys.rewind();
            this.isRewinding = true;
            this.startNewLoop(); // Otomatik olarak zamanı sıfırla/başlat
            return;
        }

        // --- EĞİLME VE HIZLI DÜŞÜŞ MEKANİĞİ ---
        if (Input.isDown('CROUCH')) {
            if (this.player.isGrounded) {
                // Yerdeyken Eğilme
                if (!this.player.isCrouching) {
                    this.player.isCrouching = true;
                    AudioSys.crouch();
                    const oldH = this.player.height;
                    this.player.height = this.player.crouchHeight;
                    this.player.y += (oldH - this.player.crouchHeight); // Ayaklar yerde kalsın
                }
            } else {
                // Havadayken Hızlı Düşüş (Fast Drop)
                this.player.vy += 2.5; // Ekstra yerçekimi
            }
        } else {
            // Eğilme bırakıldı
            if (this.player.isCrouching) {
                // Tavan kontrolü: Kalkarken üstte platform var mı?
                const testY = this.player.y - (this.player.normalHeight - this.player.height);
                const canStand = !this.platforms.some(p =>
                    this.player.x < p.x + p.width &&
                    this.player.x + this.player.width > p.x &&
                    testY < p.y + p.height &&
                    testY + this.player.normalHeight > p.y
                );
                if (canStand) {
                    this.player.isCrouching = false;
                    const oldH = this.player.height;
                    this.player.height = this.player.normalHeight;
                    this.player.y -= (this.player.normalHeight - oldH); // Ayaklar yerde kalsın
                }
            }
        }

        // --- GELİŞMİŞ FİZİK (X ve Y AYRI) ---

        // 1. ADIM: YATAY HAREKET (X)
        let dx = 0;
        if (Input.isDown('LEFT')) { dx = -CONFIG.SPEED; this.player.facingRight = false; }
        else if (Input.isDown('RIGHT')) { dx = CONFIG.SPEED; this.player.facingRight = true; }

        this.player.vx = dx;
        this.player.x += this.player.vx;

        // X Çarpışma Kontrolü (Duvarlar)
        // Ekran sınırları
        if (this.player.x < 0) this.player.x = 0;
        if (this.player.x + this.player.width > canvas.width) this.player.x = canvas.width - this.player.width;

        // Platform/Duvar X Çarpışması
        this.platforms.forEach(platform => {
            if (CheckAABB(this.player, platform)) {
                // Çarpışma var! Geri it.
                if (this.player.vx > 0) { // Sağa gidiyorduk, soluna yapış
                    this.player.x = platform.x - this.player.width;
                } else if (this.player.vx < 0) { // Sola gidiyorduk, sağına yapış
                    this.player.x = platform.x + platform.width;
                }
                this.player.vx = 0;
            }
        });

        // Kapı Çarpışması (hem X hem Y)
        this.levelObjects.forEach(obj => {
            if (obj instanceof Door && !obj.isOpen) {
                if (CheckAABB(this.player, obj)) {
                    if (this.player.vx > 0) this.player.x = obj.x - this.player.width;
                    else if (this.player.vx < 0) this.player.x = obj.x + obj.width;
                }
            }
        });

        // 2. ADIM: DİKEY HAREKET (Y) + ZIPLAMA
        if (Input.isDown('JUMP') && this.player.isGrounded) {
            this.player.vy = CONFIG.JUMP_FORCE;
            this.player.isGrounded = false;
            AudioSys.jump();
        }

        this.player.vy += CONFIG.GRAVITY;

        // Terminal Velocity (Platformları delip geçmemek için hız sınırı)
        const maxFallSpeed = 19;
        if (this.player.vy > maxFallSpeed) this.player.vy = maxFallSpeed;

        this.player.y += this.player.vy;
        this.player.isGrounded = false; // Havada varsayalım

        // Y Çarpışma Kontrolü

        // (Eski Void kontrolü kaldırıldı - Kamera tabanlı ölüm sistemi yukarıda var)

        this.platforms.forEach(platform => {
            if (CheckAABB(this.player, platform)) {
                if (this.player.vy > 0) { // Düşüyorduk (Zemin)
                    this.player.y = platform.y - this.player.height;
                    this.player.isGrounded = true;
                    this.player.vy = 0;
                } else if (this.player.vy < 0) { // Kafa attık (Tavan)
                    this.player.y = platform.y + platform.height;
                    this.player.vy = 0;
                }
            }
        });

        // Kapı Y Çarpışması (yatay kapılar için — tavan kapıları)
        this.levelObjects.forEach(obj => {
            if (obj instanceof Door && !obj.isOpen) {
                if (CheckAABB(this.player, obj)) {
                    if (this.player.vy > 0) {
                        this.player.y = obj.y - this.player.height;
                        this.player.isGrounded = true;
                        this.player.vy = 0;
                    } else if (this.player.vy < 0) {
                        this.player.y = obj.y + obj.height;
                        this.player.vy = 0;
                    }
                }
            }
        });

        // Çıkış Kontrolü (Tüm butonlara basılmış olmalı)
        const exit = this.levelObjects.find(obj => obj instanceof LevelExit);
        const allButtons = this.levelObjects.filter(obj => obj instanceof GameButton);
        const allPressed = allButtons.length === 0 || allButtons.every(b => b.isPressed);
        if (exit && allPressed && CheckAABB(this.player, exit)) {
            AudioSys.exit();
            this.nextLevel();
            return;
        }

        // Kayıt
        this.currentRecording.push({ x: this.player.x, y: this.player.y });

        // Hayaletleri Güncelle
        this.ghosts.forEach(ghost => ghost.update(this.frame));

        // Objeleri Güncelle
        const allEntities = [this.player, ...this.ghosts];
        this.levelObjects.forEach(obj => {
            if (obj instanceof GameButton) obj.update(allEntities);
        });

        this.levelObjects.forEach(obj => {
            if (obj instanceof Door) {
                const triggerBtn = this.levelObjects.find(o => o instanceof GameButton && o.id === obj.triggerId);
                if (triggerBtn) obj.update(triggerBtn.isPressed);
            }
        });

        this.frame++;
        const time = (this.frame / 60).toFixed(1);
        const timeEl = document.getElementById('time-display');
        const newText = `Bölüm: ${this.currentLevelIndex + 1} | Zaman: ${time}s`;
        if (timeEl.innerText !== newText) {
            timeEl.innerText = newText;
            // Pulse every 5 seconds
            if (this.frame % 300 === 0) {
                timeEl.classList.remove('pulse');
                requestAnimationFrame(() => timeEl.classList.add('pulse'));
            }
        }
    },

    draw() {
        if (this.state !== 'PLAYING') return;

        const now = Date.now();

        // === ANIMATED GRADIENT BACKGROUND ===
        const hueShift = Math.sin(now / 8000) * 8;
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, `hsl(${215 + hueShift}, 55%, 6%)`);
        bgGrad.addColorStop(0.5, `hsl(${225 + hueShift}, 50%, 10%)`);
        bgGrad.addColorStop(1, `hsl(${220 + hueShift}, 45%, 8%)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // === AMBIENT PARTICLES ===
        if (!this._particles) {
            this._particles = [];
            for (let i = 0; i < 30; i++) {
                this._particles.push({
                    x: Math.random() * 800,
                    y: Math.random() * 450,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: -Math.random() * 0.2 - 0.05,
                    size: Math.random() * 2 + 0.5,
                    alpha: Math.random() * 0.15 + 0.03
                });
            }
        }
        for (let i = 0; i < this._particles.length; i++) {
            const p = this._particles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
            if (p.x < -5) p.x = canvas.width + 5;
            if (p.x > canvas.width + 5) p.x = -5;
            const flicker = p.alpha + Math.sin(now / 1200 + i) * 0.03;
            ctx.fillStyle = `rgba(0, 229, 255, ${Math.max(0, flicker)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // === PARALLAX STARS ===
        const starSeed = 12345;
        let s = starSeed;
        for (let i = 0; i < 60; i++) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const sx = (s % canvas.width);
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const sy = (s % canvas.height);
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            const size = 0.5 + (s % 15) / 10;
            const twinkle = 0.3 + Math.sin(now / 800 + i * 0.7) * 0.3;

            // Parallax — stars shift slightly with camera
            const parallaxY = sy + this.camera.y * 0.05;
            const wrappedY = ((parallaxY % canvas.height) + canvas.height) % canvas.height;

            ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
            ctx.beginPath();
            ctx.arc(sx, wrappedY, size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.save();
        // KAMERA UYGULA
        ctx.translate(0, -this.camera.y);

        // ENERJI BAĞLANTILARI (Butonlardan Kapılara)
        this.levelObjects.forEach(obj => {
            if (obj instanceof GameButton) {
                const targetDoor = this.levelObjects.find(d => d instanceof Door && d.triggerId === obj.id);
                if (targetDoor) {
                    const isActive = obj.isPressed;

                    // Glow effect
                    ctx.shadowColor = isActive ? '#00e5ff' : '#b24bf3';
                    ctx.shadowBlur = isActive ? 12 : 4;

                    ctx.beginPath();
                    ctx.lineWidth = isActive ? 3 : 2;
                    ctx.strokeStyle = isActive ? 'rgba(0, 229, 255, 0.6)' : 'rgba(178, 75, 243, 0.3)';
                    ctx.setLineDash([6, 6]);
                    ctx.lineDashOffset = -now / 100; // Animated flow

                    ctx.moveTo(obj.x + 15, obj.y + 10);
                    const midX = (obj.x + targetDoor.x) / 2;
                    const midY = (obj.y + targetDoor.y) / 2 + 50;
                    ctx.quadraticCurveTo(midX, midY, targetDoor.x + 10, targetDoor.y + 30);
                    ctx.stroke();

                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;
                }
            }
        });

        this.platforms.forEach(p => p.draw());
        this.levelObjects.forEach(obj => obj.draw());
        this.ghosts.forEach(ghost => ghost.draw());
        this.player.draw();

        // === AMBIENT GLOW AROUND EXIT ===
        const exit = this.levelObjects.find(obj => obj instanceof LevelExit);
        if (exit) {
            const glowPulse = 0.5 + Math.sin(now / 600) * 0.2;
            const exitGlow = ctx.createRadialGradient(
                exit.x + 20, exit.y + 30, 5,
                exit.x + 20, exit.y + 30, 80
            );
            exitGlow.addColorStop(0, `rgba(0, 229, 255, ${0.15 * glowPulse})`);
            exitGlow.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = exitGlow;
            ctx.fillRect(exit.x - 60, exit.y - 50, 160, 160);
        }

        // ATEŞ / LAVA EFEKTİ (Kamera yukarı gittikçe görünür olur)
        const climbAmount = -this.maxScrollY;
        const lavaOpacity = Math.min(1, Math.max(0, (climbAmount - 100) / 200)); // 100px sonra başla, 300px'de tam

        if (lavaOpacity > 0.02) {
            const lavaBaseY = this.maxScrollY + canvas.height;
            const time = now / 300;

            // Ateş Dalgaları (Katmanlı)
            for (let i = 0; i < 3; i++) {
                const waveHeight = Math.sin(time + i) * 15;
                const yPos = lavaBaseY - 20 - (30 * i) + waveHeight;

                // Renkler: Sarı -> Turuncu -> Kırmızı (Opaklık tırmanışa bağlı)
                const colors = [
                    `rgba(241, 196, 15, ${0.5 * lavaOpacity})`,
                    `rgba(230, 126, 34, ${0.6 * lavaOpacity})`,
                    `rgba(231, 76, 60, ${0.8 * lavaOpacity})`
                ];

                ctx.fillStyle = colors[i];
                ctx.beginPath();
                ctx.moveTo(0, lavaBaseY + 100);
                ctx.lineTo(0, yPos);

                // Dalgalı üst çizgi
                for (let x = 0; x <= canvas.width; x += 40) {
                    ctx.lineTo(x, yPos + Math.sin(time * 2 + x / 100) * 10);
                }

                ctx.lineTo(canvas.width, lavaBaseY + 100);
                ctx.fill();
            }

            // Lava parıltısı (üst kenar)
            const glowGradient = ctx.createLinearGradient(0, lavaBaseY - 100, 0, lavaBaseY - 20);
            glowGradient.addColorStop(0, `rgba(231, 76, 60, 0)`);
            glowGradient.addColorStop(1, `rgba(231, 76, 60, ${0.3 * lavaOpacity})`);
            ctx.fillStyle = glowGradient;
            ctx.fillRect(0, lavaBaseY - 100, canvas.width, 80);
        }

        ctx.restore();

        // === SOFT VIGNETTE (Cached canvas'tan çizim - Yüksek performans) ===
        ctx.drawImage(vigCanvas, 0, 0);
    },

    loop(timestamp) {
        if (!timestamp) timestamp = performance.now();
        if (!this.lastTime) this.lastTime = timestamp;
        let delta = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (delta > 250) delta = 250; // Tarayıcı donarsa sekmeyi engelle

        this.accumulator += delta;

        // Saniyede tam 60 kere Update (Fizik) — Monitör Hertz'inden bağımsız
        while (this.accumulator >= this.timeStep) {
            Game.update();
            this.accumulator -= this.timeStep;
        }

        // Çizim monitör hızında (144Hz ise 144 kere)
        Game.draw();
        requestAnimationFrame((ts) => Game.loop(ts));
    }
};

// Yardımcı: AABB Çarpışma Testi
function CheckAABB(r1, r2) {
    return (r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y);
}

// Oyun satır 40'ta başlatılıyor (window.onload)
