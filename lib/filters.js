// Overlay filter utilities

// biome-ignore lint/correctness/noUnusedVariables: web-accessible global used by pages and tests
const OverlayFilters = {
  // Overlay configurations based on attempt count thresholds
  configs: {
    clown: {
      src: 'assets/overlays/clown-nose.png',
      minAttempts: 3,
      position: 'center', // 'center', 'nose', 'face'
      scale: 0.3,
    },
    wojakSad: {
      src: 'assets/overlays/wojak-sad.png',
      minAttempts: 6,
      position: 'overlay',
      opacity: 0.7,
      scale: 1,
    },
    wojakCrying: {
      src: 'assets/overlays/wojak-crying.png',
      minAttempts: 10,
      position: 'overlay',
      opacity: 0.8,
      scale: 1,
    },
  },

  // Get appropriate overlay for attempt count
  getOverlayForCount(count) {
    if (count >= 10) return this.configs.wojakCrying;
    if (count >= 6) return this.configs.wojakSad;
    if (count >= 3) return this.configs.clown;
    return null;
  },

  // Load image and return promise
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
      img.src = chrome.runtime.getURL(src);
    });
  },

  // Apply overlay to canvas
  async applyOverlay(canvas, attemptCount) {
    const config = this.getOverlayForCount(attemptCount);
    if (!config) return false;

    const ctx = canvas.getContext('2d');

    try {
      const overlay = await this.loadImage(config.src);

      // Calculate dimensions
      let width = overlay.width * config.scale;
      let height = overlay.height * config.scale;

      // Scale to fit canvas if needed
      if (width > canvas.width * 0.9) {
        const ratio = (canvas.width * 0.9) / width;
        width *= ratio;
        height *= ratio;
      }

      // Calculate position
      let x;
      let y;

      switch (config.position) {
        case 'center':
          x = (canvas.width - width) / 2;
          y = (canvas.height - height) / 2;
          break;

        case 'overlay':
          // Cover entire canvas
          x = 0;
          y = 0;
          width = canvas.width;
          height = canvas.height;
          break;

        default:
          x = (canvas.width - width) / 2;
          y = (canvas.height - height) / 2;
      }

      // Apply opacity if specified
      if (config.opacity) {
        ctx.globalAlpha = config.opacity;
      }

      ctx.drawImage(overlay, x, y, width, height);

      // Reset alpha
      ctx.globalAlpha = 1;

      return true;
    } catch (error) {
      console.warn('Overlay not applied:', error);
      return false;
    }
  },

  // Apply text overlay
  applyTextOverlay(canvas, text, options = {}) {
    const ctx = canvas.getContext('2d');
    const {
      font = 'bold 24px Arial',
      color = '#ff3333',
      strokeColor = '#000',
      y = canvas.height - 40,
      align = 'center',
    } = options;

    ctx.font = font;
    ctx.textAlign = align;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.strokeText(text, canvas.width / 2, y);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, y);
  },

  // Apply grayscale filter
  applyGrayscale(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    ctx.putImageData(imageData, 0, 0);
  },

  // Apply red tint
  applyRedTint(canvas, intensity = 0.3) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  },
};
