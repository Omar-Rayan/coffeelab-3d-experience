import { ProductModel } from './model.js';
import { SceneView } from './view.js';
import { AppController } from './controller.js';

async function bootstrap() {
    try {
        const model = await new ProductModel().load('products.json');
        const view = new SceneView('canvas-container');
        const controller = new AppController(model, view);
        controller.init();
        window.app = { model, view, controller };
    } catch (err) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <p style="color:#ff6b6b">Failed to load app.</p>
                <p style="font-size:0.8rem;color:#aaa">${err.message}</p>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
