// controller.js - DOM events and UI generation

export class AppController {
    constructor(model, view) {
        this.model = model;
        this.view = view;
        this.brewAudio = document.getElementById('audio-brewing');
        this.cafeAudio = document.getElementById('audio-cafe');
        this.isPlaying = false;
        this.hasFinished = false;
        this._timelineRAF = null;
    }

    _playLabels() {
        return {
            'french-press': 'Brew Coffee',
            'coffee-bag':   'Open Bag',
            'takeaway-cup': 'Play'
        };
    }

    _refreshPlayButton() {
        const playIcon  = document.getElementById('play-icon');
        const playLabel = document.getElementById('play-label');
        if (!playIcon || !playLabel) return;
        const id = this.model.currentProductId;
        const productLabel = this._playLabels()[id] || 'Play';
        if (this.hasFinished) {
            playLabel.textContent = 'Replay';
        } else if (this.isPlaying) {
            playLabel.textContent = 'Pause';
        } else {
            playLabel.textContent = productLabel;
        }
    }

    init() {
        this._renderProductSelector();
        this._renderColorSwatches();
        this._renderFinishes();
        this._wireControls();

        const first = this.model.getCurrent();
        if (first) {
            this.view.loadModel(first, () => this._onModelLoaded());
            this._updateProductInfo(first);
        }
        this._refreshPlayButton();
    }

    _renderProductSelector() {
        const wrap = document.getElementById('model-selector');
        if (!wrap) return;
        wrap.innerHTML = '';
        for (const p of this.model.getAllProducts()) {
            const btn = document.createElement('button');
            btn.className = 'model-btn' + (p.id === this.model.currentProductId ? ' active' : '');
            btn.dataset.model = p.id;
            btn.innerHTML = `<span class="model-name">${p.title}</span>`;
            btn.addEventListener('click', () => this._onSelectProduct(p.id));
            wrap.appendChild(btn);
        }
    }

    _renderColorSwatches() {
        const wrap = document.getElementById('color-swatches');
        if (!wrap) return;
        wrap.innerHTML = '';
        for (const sw of this.model.getColorSwatches()) {
            const btn = document.createElement('button');
            btn.className = 'swatch-btn';
            btn.style.background = sw.hex;
            btn.title = sw.name;
            btn.setAttribute('aria-label', `Apply ${sw.name} colour`);
            btn.addEventListener('click', () => {
                const product = this.model.getCurrent();
                this.view.swapColor(sw.hex, product?.swappableMeshNames || []);
                document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            wrap.appendChild(btn);
        }
    }

    _renderFinishes() {
        const wrap = document.getElementById('finish-buttons');
        if (!wrap) return;
        wrap.innerHTML = '';
        for (const f of this.model.getFinishes()) {
            const btn = document.createElement('button');
            btn.className = 'control-btn';
            btn.innerHTML = `${f.name}`;
            btn.addEventListener('click', () => {
                this.view.swapFinish({ roughness: f.roughness, metalness: f.metalness });
                wrap.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            wrap.appendChild(btn);
        }
    }

    _wireControls() {
        document.getElementById('wireframe-btn')?.addEventListener('click', (e) => {
            const on = !this.view.isWireframe;
            this.view.setWireframe(on);
            e.currentTarget.classList.toggle('active', on);
        });

        document.getElementById('reset-camera-btn')?.addEventListener('click', () => {
            const p = this.model.getCameraPreset('default');
            this.view.tweenCamera(p.position, p.target);
        });

        for (const name of ['front', 'top', 'side']) {
            document.getElementById(`cam-${name}-btn`)?.addEventListener('click', () => {
                const p = this.model.getCameraPreset(name);
                this.view.userOverrideCamera = true;
                this.view.tweenCamera(p.position, p.target);
            });
        }

        document.getElementById('cam-detail-btn')?.addEventListener('click', () => {
            const product = this.model.getCurrent();
            if (product?.detailCamera) {
                this.view.userOverrideCamera = true;
                this.view.tweenCamera(product.detailCamera.position, product.detailCamera.target);
            }
        });

        document.getElementById('light-ambient-btn')?.addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('active');
            this.view.setAmbient(e.currentTarget.classList.contains('active'));
        });

        document.getElementById('light-intensity')?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            const out = document.getElementById('intensity-value');
            if (out) out.textContent = v.toFixed(1);
            this.view.setIntensity(v);
        });

        document.getElementById('rotate-btn')?.addEventListener('click', (e) => {
            const on = !this.view.controls.autoRotate;
            this.view.setAutoRotate(on);
            e.currentTarget.classList.toggle('active', on);
        });

        document.getElementById('animate-btn')?.addEventListener('click', (e) => {
            const state = this.view.cycleAnimation();
            e.currentTarget.classList.toggle('active', state.active);
            const icon = e.currentTarget.querySelector('.btn-icon');
            if (this.cafeAudio) {
                const audioToggle = document.getElementById('audio-toggle');
                if (state.active && this.cafeAudio.paused) {
                    this.cafeAudio.volume = 0.4;
                    this.cafeAudio.play().catch(() => {});
                    if (audioToggle) {
                        audioToggle.classList.add('active');
                    }
                } else if (!state.active && !this.cafeAudio.paused) {
                    this.cafeAudio.pause();
                    if (audioToggle) {
                        audioToggle.classList.remove('active');
                    }
                }
            }
        });

        document.getElementById('cinematic-btn')?.addEventListener('click', (e) => {
            const on = !this.view.isCinematic;
            this.view.setCinematic(on);
            e.currentTarget.classList.toggle('active', on);
        });

        const playBtn = document.getElementById('play-pause-btn');
        const slider = document.getElementById('animation-timeline');
        const label = document.getElementById('timeline-label');
        const playIcon = document.getElementById('play-icon');

        playBtn?.addEventListener('click', () => {
            if (this.hasFinished) {
                this.view.setBrewProgress(0);
                this.hasFinished = false;
                playBtn.classList.remove('finished');
            }
            if (!this.isPlaying) {
                const ok = this.view.resumeBrew(this.brewAudio);
                if (!ok) {
                    this.view.startBrew(this.brewAudio);
                }
                this.isPlaying = true;
                playBtn.classList.add('playing');
                this._startTimelineSync();
            } else {
                this.view.pauseBrew();
                this.isPlaying = false;
                playBtn.classList.remove('playing');
                this._stopTimelineSync();
            }
            this._refreshPlayButton();
        });

        slider?.addEventListener('input', (e) => {
            const t = parseFloat(e.target.value) / 100;
            this.view.setBrewProgress(t);
            if (label) label.textContent = `${Math.round(t * 100)}%`;
            if (this.hasFinished) {
                this.hasFinished = false;
                playBtn?.classList.remove('finished');
            }
            if (this.isPlaying) {
                this.view.pauseBrew();
                this.isPlaying = false;
                playBtn?.classList.remove('playing');
                this._stopTimelineSync();
            }
            this._refreshPlayButton();
        });

        document.getElementById('brew-btn')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const ok = this.view.startBrew(this.brewAudio);
            if (!ok) {
                btn.classList.add('disabled-flash');
                setTimeout(() => btn.classList.remove('disabled-flash'), 600);
                return;
            }
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 5000);
        });

        document.getElementById('audio-toggle')?.addEventListener('click', (e) => {
            if (!this.cafeAudio) return;
            if (this.cafeAudio.paused) {
                this.cafeAudio.volume = 0.4;
                this.cafeAudio.play().catch(() => {});
                e.currentTarget.classList.add('active');
            } else {
                this.cafeAudio.pause();
                e.currentTarget.classList.remove('active');
            }
        });
    }

    _onSelectProduct(id) {
        document.querySelectorAll('.model-btn').forEach(b => b.classList.toggle('active', b.dataset.model === id));
        this.model.setCurrent(id);
        const product = this.model.getCurrent();
        this.view.loadModel(product, () => this._onModelLoaded());
        this._updateProductInfo(product);
        this._updateBrewButtonAvailability();

        this.isPlaying = false;
        this.hasFinished = false;
        this._stopTimelineSync();
        const slider = document.getElementById('animation-timeline');
        const label = document.getElementById('timeline-label');
        const playBtn = document.getElementById('play-pause-btn');
        if (slider) slider.value = 0;
        if (label) label.textContent = '0%';
        playBtn?.classList.remove('playing');
        playBtn?.classList.remove('finished');
        this._refreshPlayButton();

        const timelineBar = document.querySelector('.timeline-bar');
        if (timelineBar) {
            timelineBar.style.display = (id === 'takeaway-cup') ? 'none' : '';
        }

        this.view.userOverrideCamera = false;
        const defaultCam = this.model.getCameraPreset('default');
        if (defaultCam && id !== 'coffee-bag') {
            this.view.tweenCamera(defaultCam.position, defaultCam.target, 700);
        }
    }

    _onModelLoaded() {
        document.getElementById('loading')?.classList.add('hidden');
        this._updateBrewButtonAvailability();
    }

    _updateBrewButtonAvailability() {
        const btn = document.getElementById('brew-btn');
        if (!btn) return;
        const labels = {
            'french-press': { icon: '', text: 'Brew Coffee', title: 'Brew the French Press' },
            'coffee-bag':   { icon: '', text: 'Open Bag',    title: 'Open the coffee bag' },
            'takeaway-cup': { icon: '',  text: 'Play',        title: 'Play model animation' }
        };
        const id = this.model.currentProductId;
        const label = labels[id] || labels['french-press'];
        btn.innerHTML = `<span class="btn-icon">${label.icon}</span>${label.text}`;
        btn.title = label.title;
        btn.classList.remove('disabled');
        btn.disabled = false;
    }

    _startTimelineSync() {
        this._stopTimelineSync();
        const slider = document.getElementById('animation-timeline');
        const label = document.getElementById('timeline-label');
        const playIcon = document.getElementById('play-icon');
        const playBtn = document.getElementById('play-pause-btn');

        const tick = () => {
            const t = this.view.getBrewProgress();
            if (slider) slider.value = (t * 100).toFixed(1);
            if (label) label.textContent = `${Math.round(t * 100)}%`;

            if (t >= 1) {
                this.isPlaying = false;
                this.hasFinished = true;
                playBtn?.classList.remove('playing');
                playBtn?.classList.add('finished');
                this._refreshPlayButton();
                this._stopTimelineSync();
                return;
            }
            this._timelineRAF = requestAnimationFrame(tick);
        };
        this._timelineRAF = requestAnimationFrame(tick);
    }

    _stopTimelineSync() {
        if (this._timelineRAF) {
            cancelAnimationFrame(this._timelineRAF);
            this._timelineRAF = null;
        }
    }

    _updateProductInfo(product) {
        const wrap = document.getElementById('product-description');
        if (!wrap || !product) return;
        const detailRows = product.details
            ? Object.entries(product.details)
                .map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`)
                .join('')
            : '';
        wrap.innerHTML = `
            <h4>${product.title}</h4>
            <p>${product.description}</p>
            ${detailRows ? `<ul class="product-details">${detailRows}</ul>` : ''}
        `;
    }
}
