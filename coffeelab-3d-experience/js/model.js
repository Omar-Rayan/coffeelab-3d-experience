// model.js - product data layer

export class ProductModel {
    constructor() {
        this.products = [];
        this.cameraPresets = {};
        this.colorSwatches = [];
        this.finishes = [];
        this.currentProductId = null;
        this.subscribers = [];
    }

    async load(jsonPath = 'products.json') {
        const res = await fetch(jsonPath);
        if (!res.ok) throw new Error(`Failed to load ${jsonPath}: ${res.status}`);
        const data = await res.json();
        this.products = data.products;
        this.cameraPresets = data.cameraPresets;
        this.colorSwatches = data.colorSwatches;
        this.finishes = data.finishes;
        if (this.products.length) this.currentProductId = this.products[0].id;
        return this;
    }

    getAllProducts() { return this.products; }

    getProduct(id) { return this.products.find(p => p.id === id); }

    getCurrent() { return this.getProduct(this.currentProductId); }

    setCurrent(id) {
        if (this.currentProductId === id) return;
        this.currentProductId = id;
        this.notify({ type: 'product-change', product: this.getCurrent() });
    }

    getCameraPreset(name) { return this.cameraPresets[name]; }

    getColorSwatches() { return this.colorSwatches; }

    getFinishes() { return this.finishes; }

    subscribe(fn) { this.subscribers.push(fn); }

    notify(event) { this.subscribers.forEach(fn => fn(event)); }
}
