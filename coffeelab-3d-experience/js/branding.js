// branding.js - canvas-based label textures
import * as THREE from 'three';

export function createBagLabel({
    tagline = 'PREMIUM ROAST',
    bgHex = '#f5f0e6',
    fgHex = '#2b1a10',
    accentHex = '#8b4513'
} = {}) {
    const w = 512;
    const h = 768;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = accentHex;
    ctx.fillRect(40, 40, 90, 90);
    ctx.font = 'bold 56px "Sodo Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = bgHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('', 85, 85);

    ctx.font = '24px "Sodo Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('POUCH', w - 40, 56);

    ctx.font = 'italic bold 130px Georgia, "Times New Roman", serif';
    ctx.fillStyle = fgHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Coffee', w / 2, h / 2 - 60);

    ctx.font = 'bold 70px "Sodo Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = accentHex;
    ctx.letterSpacing = '8px';
    ctx.fillText('LAB', w / 2, h / 2 + 50);

    ctx.fillStyle = accentHex;
    ctx.fillRect(w / 2 - 100, h / 2 + 120, 200, 4);

    ctx.font = '500 28px "Sodo Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText(tagline, w / 2, h / 2 + 170);

    ctx.fillStyle = fgHex;
    ctx.fillRect(40, h - 130, w - 80, 70);
    ctx.fillStyle = bgHex;
    ctx.font = 'bold 24px "Sodo Sans", "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('250g · DARK ROAST · BEANS', 70, h - 95);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

export function createCupLogo({
    bgHex = '#ffffff',
    ringHex = '#00704A',
    fgHex = '#1E3932',
    accentHex = '#cba258'
} = {}) {
    const w = 2048;
    const h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = ringHex;
    ctx.fillRect(0, 70, w, 6);
    // Decorative bottom band
    ctx.fillRect(0, h - 76, w, 6);

    ctx.font = '500 32px "Sodo Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = ringHex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tagline = '·  PREMIUM ROAST  ·  HAND CRAFTED  ·  COFFEELAB ESTD 2026  ·  PREMIUM ROAST  ·  HAND CRAFTED  ·';
    ctx.fillText(tagline, w / 2, 38);
    
    const cellW = w / 3;
    for (let i = 0; i < 3; i++) {
        const cx = cellW * i + cellW / 2;
        const cy = h / 2 + 20;

        
        ctx.font = 'bold 130px sans-serif';
        ctx.fillStyle = ringHex;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('', cx, cy - 120);
        
        ctx.font = 'italic bold 140px Georgia, "Times New Roman", serif';
        ctx.fillStyle = fgHex;
        ctx.fillText('Coffee', cx, cy + 20);
        
        ctx.font = 'bold 80px "Sodo Sans", "Segoe UI", sans-serif';
        ctx.fillStyle = accentHex;
        ctx.fillText('LAB', cx, cy + 120);

        
        ctx.fillStyle = ringHex;
        ctx.fillRect(cx - 80, cy + 175, 160, 4);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
}

export function createPressBadge({
    bgHex = '#222222',
    fgHex = '#cba258'
} = {}) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = fgHex;
    ctx.font = 'bold 96px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CL', size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
}

export function applyBranding(root, productId) {
    if (!root || !productId) return;
    const textures = {
        'french-press': { factory: createPressBadge, targets: ['base'] }
    };
    const cfg = textures[productId];
    if (!cfg) return;

    const tex = cfg.factory();
    let applied = 0;

    root.traverse((c) => {
        if (!c.isMesh || !c.material) return;
        const name = (c.name || '').toLowerCase();
        const matched = cfg.targets.includes(name);
        if (!matched) return;

        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => {
            if (m && m.map !== undefined) {
                m.map = tex;
                m.needsUpdate = true;
                applied++;
            }
        });
    });
}
