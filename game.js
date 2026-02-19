const CONFIG = {
    GRAVITY: 0.8,
    SPEED: 6,
    JUMP_FORCE: -14, // Daha yükseğe zıplasın
    FPS: 60
};

// Canvas Kurulumu
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Ekran boyutlandırma
function resize() {
    const container = document.getElementById('game-container');
    const targetRatio = 800 / 450;
    const windowRatio = window.innerWidth / window.innerHeight;

    let finalWidth, finalHeight;

    if (windowRatio > targetRatio) {
        // Ekran daha geniş, yükseklikten kısıtla
        finalHeight = window.innerHeight;
        finalWidth = finalHeight * targetRatio;
    } else {
        // Ekran daha dar, genişlikten kısıtla
        finalWidth = window.innerWidth;
        finalHeight = finalWidth / targetRatio;
    }

    container.style.width = finalWidth + 'px';
    container.style.height = finalHeight + 'px';

    // Canvas çözünürlüğü sabit kalsın (kalite için)
    canvas.width = 800;
    canvas.height = 450;
}
window.addEventListener('resize', resize);
// Sayfa yüklendiğinde ve biraz sonra (mobil adres çubuğu için) tekrar çağır
window.onload = () => { Game.init(); resize(); setTimeout(resize, 100); setTimeout(resize, 500); };

// iOS / Mobil: Sayfa kaydırmayı engelle (oyun alanı dışında)
document.addEventListener('touchmove', (e) => {
    // Level grid scroll'una izin ver
    if (!e.target.closest('.level-grid')) e.preventDefault();
}, { passive: false });

// Ekran yönü kilidi (yatay tercih)
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
function canReach(from, to) {
    // from, to: {x, y, width} → y = platformun üst yüzeyi
    const jumpForce = 14; // CONFIG.JUMP_FORCE (pozitif)
    const gravity = 0.8;  // CONFIG.GRAVITY
    const speed = 6;      // CONFIG.SPEED
    const maxJumpH = (jumpForce * jumpForce) / (2 * gravity); // ~122px

    // Dikey fark (pozitif = yukarı zılamak lazım)
    const dy = from.y - to.y;

    // Yatay boşluk (en yakın kenarlar arası)
    const fromRight = from.x + from.width;
    const toRight = to.x + to.width;
    let gap;
    if (fromRight < to.x) gap = to.x - fromRight;       // to sağda
    else if (toRight < from.x) gap = from.x - toRight;   // to solda
    else gap = 0; // Üst üste biniyor

    if (dy > 0) {
        // YUKARI ZIPLAMA
        if (dy > maxJumpH * 0.9) return false; // %10 güvenlik payı

        // dy yüksekliğinde asılı kalma süresi
        const disc = jumpForce * jumpForce - 2 * gravity * dy;
        if (disc < 0) return false;
        const hangTime = 2 * Math.sqrt(disc) / gravity;
        const maxHoriz = speed * hangTime * 0.85; // %15 güvenlik payı

        return gap <= maxHoriz;
    } else {
        // AŞAĞI DÜŞME veya AYNI SEVİYE
        // Düşerken yatay mesafe çok geniş, sadece aşırı uzaklığı engelle
        return gap <= 300;
    }
}

// Platform pozisyonunu düzelt (erişilebilir hale getir)
function fixPlatformPosition(from, toX, toY, toWidth) {
    // Önce mevcut konum geçerli mi?
    if (canReach(from, { x: toX, y: toY, width: toWidth })) {
        return toX; // Geçerli, değiştirmeye gerek yok
    }

    // Önceki platformun ortasına doğru çek
    const fromCenter = from.x + from.width / 2;
    const direction = (toX > fromCenter) ? 1 : -1;

    // Giderek yakınlaştır
    for (let offset = 20; offset <= 300; offset += 20) {
        const newX = fromCenter + direction * (offset - toWidth / 2);
        const clamped = Math.max(20, Math.min(660, newX));
        if (canReach(from, { x: clamped, y: toY, width: toWidth })) {
            return clamped;
        }
    }

    // Son çare: tam üstüne koy
    return Math.max(20, Math.min(660, fromCenter - toWidth / 2));
}

// ============================================
// OTO-GENERATOR: 99 Bölüm (Rule-Based)
// ============================================
function generateLevels() {
    for (let i = 4; i < 99; i++) {
        const rand = createSeededRandom(i * 7919 + 42);
        const isTower = i > 10;

        // === PROGRESSIVE DIFFICULTY PARAMETRELERI ===
        const levelNum = i - 3; // 1-based (bölüm 5 = levelNum 2)
        const numButtons = Math.min(1 + Math.floor(levelNum / 3), 5); // 1→2→3→4→5
        const baseWidth = Math.max(60, 140 - levelNum * 2.5); // Platform genişliği azalır
        const vertGap = Math.max(50, 70 - levelNum * 0.5); // Dikey aralık azalır
        const widthRatio = 0.6 + rand() * 0.25; // Üst/Alt genişlik oranı: 0.6-0.85

        const level = {
            playerStart: { x: 50, y: 350 },
            objects: [
                { type: 'Platform', x: 0, y: 430, width: 800, height: 40 },
            ]
        };

        const GROUND = { x: 0, y: 430, width: 800 };

        if (!isTower) {
            // ====== YATAY SİSTEM (Bölüm 5-11) — Rule-Based ======

            // Duvar konumu (level bazlı çeşitlilik)
            const wallX = 350 + Math.floor(rand() * 100); // Duvar orta-sağda (350-450)

            // TEK duvar + TEK kapı
            level.objects.push({ type: 'Platform', x: wallX, y: 0, width: 25, height: 330 });
            level.objects.push({ type: 'Door', x: wallX, y: 330, triggerId: 1 });

            // === MERDİVEN BASAMAKLARI (her zaman SOL tarafta — oyuncunun yanında) ===
            let currentWidth = Math.floor(baseWidth);
            let currentX = 20; // Oyuncu sol tarafta başlar, basamaklar da sol tarafta
            let currentY = 380;
            const stairSteps = [];

            for (let b = 0; b < numButtons; b++) {
                const stepW = Math.floor(currentWidth);
                level.objects.push({ type: 'Platform', x: currentX, y: currentY, width: stepW, height: 20 });
                stairSteps.push({ x: currentX, y: currentY, width: stepW });

                // Buton bu basamakta
                level.objects.push({ type: 'Button', x: currentX + 10, y: currentY - 10, id: b + 1 });

                // TAVAN ENGELİ: Bu basamağın ÜSTÜNde (oyuncu eğilerek geçer)
                if (b < numButtons - 1) {
                    const obstW = Math.floor(stepW * (0.5 + rand() * 0.2));
                    const obstY = currentY - 35; // Eğilince 22px geçer, ayakta 40px çarpar
                    const obstX = currentX + stepW - obstW;
                    level.objects.push({ type: 'Platform', x: obstX, y: obstY, width: obstW, height: 10 });
                }

                // Sonraki basamak: yana kayma (duvarı geçmesin!)
                const maxShift = Math.min(130 + Math.floor(rand() * 50), wallX - currentX - stepW - 30);
                const shift = Math.max(40, maxShift);
                currentX += shift;
                currentY -= vertGap;
                currentWidth = Math.floor(currentWidth * (0.65 + rand() * 0.2));
                currentWidth = Math.max(55, currentWidth);

                // Ekran sınırları (duvardan önce kal!)
                if (currentX + currentWidth > wallX - 10) currentX = wallX - currentWidth - 15;
                if (currentX < 15) currentX = 15;
                if (currentY < 180) currentY = 180; // Çok yukarı çıkmasın
            }

            // Çıkış (her zaman duvarın SAĞ tarafında — kapıdan geçilmeli)
            const exitX = Math.min(wallX + 120, 720);
            level.objects.push({ type: 'Exit', x: exitX, y: 370 });
            level.objects.push({ type: 'Platform', x: wallX + 50, y: 390, width: 100, height: 20 });

        } else {
            // ====== KULE SİSTEMİ (Bölüm 12+) — Rule-Based ======

            let numFloors = 1 + Math.floor(levelNum / 12);
            if (numFloors > 3) numFloors = 3;

            let currentBaseY = 430;

            for (let f = 1; f <= numFloors; f++) {
                const ceilingY = currentBaseY - 350; // Daha kısa kat (350px)
                const doorX = 250 + Math.floor(rand() * 300); // Kapı orta bölgede

                // Kapı ve Duvarlar
                const floorButtons = Math.min(numButtons, 3);
                for (let b = 1; b <= floorButtons; b++) {
                    const dY = ceilingY + (b - 1) * 15;
                    level.objects.push({ type: 'Door', x: doorX, y: dY, triggerId: (f - 1) * 3 + b, horizontal: true });
                }
                level.objects.push({ type: 'Platform', x: 0, y: ceilingY, width: doorX, height: 40 });
                level.objects.push({ type: 'Platform', x: doorX + 100, y: ceilingY, width: 800 - (doorX + 100), height: 40 });

                // === MERDİVEN PLATFORMLARI (Sol-Sağ Alternating) ===
                const starterY = currentBaseY - 60;
                // Geniş başlangıç platformu (zemin üstü)
                level.objects.push({ type: 'Platform', x: 30, y: starterY + 20, width: 200, height: 20 });

                const towerStepWidth = Math.max(110, baseWidth + 30);
                let stepWidth = towerStepWidth;
                const towerVertGap = 50;
                const steps = [];

                // Platformlar SABİT sol-sağ-sol-sağ dizilir
                let stepY = starterY;
                let stepIndex = 0;
                const leftZone = 50 + Math.floor(rand() * 80);   // Sol platform bölgesi
                const rightZone = 400 + Math.floor(rand() * 100); // Sağ platform bölgesi

                while (stepY > ceilingY + 90) {
                    // Sırayla sol ve sağa yerleştir
                    const isLeft = (stepIndex % 2 === 0);
                    const stepX = isLeft ? leftZone : rightZone;

                    level.objects.push({ type: 'Platform', x: stepX, y: stepY, width: stepWidth, height: 20 });
                    steps.push({ x: stepX, y: stepY, width: stepWidth });

                    stepY -= towerVertGap;
                    stepWidth = Math.max(90, Math.floor(stepWidth * 0.95));
                    stepIndex++;
                }

                // Kapı altı basamak (tavana geçiş)
                const doorPlatY = ceilingY + 80;
                level.objects.push({ type: 'Platform', x: doorX + 10, y: doorPlatY, width: 100, height: 20 });

                // Son basamaktan kapıya köprü
                const lastStep = steps.length > 0 ? steps[steps.length - 1] : { x: 100, y: starterY, width: towerStepWidth };
                const doorStep = { x: doorX + 10, y: doorPlatY, width: 100 };
                if (!canReach(lastStep, doorStep)) {
                    const bridgeY = lastStep.y - towerVertGap;
                    const bridgeX = fixPlatformPosition(lastStep, doorX + 10, bridgeY, 100);
                    level.objects.push({ type: 'Platform', x: bridgeX, y: bridgeY, width: 100, height: 20 });
                }

                // Butonlar: Basamaklara yerleştir
                for (let b = 0; b < floorButtons; b++) {
                    const btnIdx = Math.floor((b + 1) * steps.length / (floorButtons + 1));
                    const btnStep = steps[Math.min(btnIdx, steps.length - 1)];
                    if (btnStep) {
                        level.objects.push({
                            type: 'Button',
                            x: btnStep.x + 10,
                            y: btnStep.y - 10,
                            id: (f - 1) * 3 + b + 1
                        });
                    }
                }

                currentBaseY = ceilingY;
            }

            // Çıkış: Tavanın üstünde, kapı açıldığında ulaşılabilir
            const lastCeiling = currentBaseY;
            level.objects.push({ type: 'Platform', x: 300, y: lastCeiling - 60, width: 200, height: 20 });
            level.objects.push({ type: 'Exit', x: 380, y: lastCeiling - 120 });
        }

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

    // KAMERA
    camera: { x: 0, y: 0 },

    init() {
        generateLevels(); // Bölümleri oluştur
        Input.init();
        this.createLevelButtons();
        this.showMainMenu();
        this.loop();
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
        document.getElementById('main-menu').style.display = 'flex';
        document.getElementById('level-select').style.display = 'none';
        document.getElementById('game-container').style.display = 'block';
    },

    showLevelSelect() {
        this.state = 'LEVEL_SELECT';
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('level-select').style.display = 'flex';
    },

    loadLevel(index) {
        this.currentLevelIndex = index;
        this.state = 'PLAYING';

        // UI Güncelleme
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('level-select').style.display = 'none';

        const levelData = LEVELS[index];

        this.ghosts = [];
        this.currentRecording = [];
        this.frame = 0;
        this.isRewinding = false;

        this.player = new Player(levelData.playerStart.x, levelData.playerStart.y);
        this.camera.y = 0; // Kamerayı sıfırla

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
        // Döngü sayacını güncelle
        document.getElementById('loop-counter').innerText = `Döngü: ${this.ghosts.length + 1}`;
        // Normal reset (Hayaletler kalsın)
        this.resetLevel(false);
    },

    update() {
        if (this.state !== 'PLAYING') return;

        // --- KAMERA TAKİBİ (SADECE YUKARI) ---
        // Oyuncu ekranın %40'ından yukarı çıkarsa kamera yukarı kaysın
        const targetCamY = Math.min(0, this.player.y - 300);

        // Kamera sadece YUKARI gider (Geri dönmez - Zorluk)
        if (targetCamY < this.camera.y) {
            // Smooth scroll
            this.camera.y += (targetCamY - this.camera.y) * 0.1;
        }

        // --- ÖLÜM KONTROLÜ (LAVA / AŞAĞI DÜŞME) ---
        const climbAmount = -this.camera.y;
        if (climbAmount > 150) {
            // Kule seviyelerde: Lava ekranın altında (görünür uyarı sonrası ölüm)
            const lavaSurfaceY = this.camera.y + canvas.height + 30;
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
            this.isRewinding = true;
            this.startNewLoop();
            return;
        }
        if (!Input.isDown('REWIND')) this.isRewinding = false;

        // --- EĞİLME MEKANİĞİ ---
        if (Input.isDown('CROUCH') && this.player.isGrounded) {
            if (!this.player.isCrouching) {
                this.player.isCrouching = true;
                const oldH = this.player.height;
                this.player.height = this.player.crouchHeight;
                this.player.y += (oldH - this.player.crouchHeight); // Ayaklar yerde kalsın
            }
        } else {
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
        }

        this.player.vy += CONFIG.GRAVITY;
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
        document.getElementById('time-display').innerText = `Bölüm: ${this.currentLevelIndex + 1} | Zaman: ${time}s`;
    },

    draw() {
        if (this.state !== 'PLAYING') return;

        // === GRADIENT BACKGROUND ===
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, '#0f1923');
        bgGrad.addColorStop(0.5, '#1a2a3a');
        bgGrad.addColorStop(1, '#2c3e50');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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
            const twinkle = 0.3 + Math.sin(Date.now() / 800 + i * 0.7) * 0.3;

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
                    ctx.shadowColor = isActive ? '#2ecc71' : '#e74c3c';
                    ctx.shadowBlur = isActive ? 10 : 4;

                    ctx.beginPath();
                    ctx.lineWidth = isActive ? 3 : 2;
                    ctx.strokeStyle = isActive ? 'rgba(46, 204, 113, 0.7)' : 'rgba(88, 27, 22, 0.5)';
                    ctx.setLineDash([6, 6]);
                    ctx.lineDashOffset = -Date.now() / 100; // Animated flow

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

        // ATEŞ / LAVA EFEKTİ (Kamera yukarı gittikçe görünür olur)
        const climbAmount = -this.camera.y;
        const lavaOpacity = Math.min(1, Math.max(0, (climbAmount - 100) / 200)); // 100px sonra başla, 300px'de tam

        if (lavaOpacity > 0.02) {
            const lavaBaseY = this.camera.y + canvas.height;
            const time = Date.now() / 300;

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
    },

    loop() {
        Game.update();
        Game.draw();
        requestAnimationFrame(Game.loop);
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
