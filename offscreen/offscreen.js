// Offscreen document for webcam capture
// This is the only context in MV3 where getUserMedia() works

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let stream = null;

// Listen for capture requests from service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_PHOTO') {
    capturePhoto()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'CLEANUP') {
    cleanup();
    sendResponse({ success: true });
    return false;
  }
});

async function capturePhoto() {
  try {
    // Get webcam stream if we don't have one
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
      video.srcObject = stream;
    }

    // Wait for video to be ready
    await new Promise((resolve, reject) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }

      const onLoaded = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
        resolve();
      };

      const onError = (_e) => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
        reject(new Error('Video failed to load'));
      };

      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('error', onError);

      // Timeout after 5 seconds
      setTimeout(() => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
        reject(new Error('Video load timeout'));
      }, 5000);
    });

    // Small delay to ensure frame is rendered
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Capture frame to canvas
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    cleanup();
    return dataUrl;
  } catch (error) {
    cleanup();
    console.error('Capture error:', error);
    throw error;
  }
}

function cleanup() {
  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
  }
  video.srcObject = null;
}

// Cleanup when page unloads
window.addEventListener('beforeunload', cleanup);
