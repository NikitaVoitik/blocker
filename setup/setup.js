// Setup page - Request webcam permission

const enableBtn = document.getElementById('enable-camera');
const skipBtn = document.getElementById('skip-btn');
const closeBtn = document.getElementById('close-tab');
const errorMsg = document.getElementById('error-msg');
const previewContainer = document.getElementById('preview-container');
const preview = document.getElementById('preview');
const permissionStep = document.getElementById('permission-step');
const doneContainer = document.getElementById('done-container');

let stream = null;

enableBtn.addEventListener('click', async () => {
  enableBtn.disabled = true;
  enableBtn.textContent = 'Requesting...';

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    // Show preview
    preview.srcObject = stream;
    previewContainer.classList.add('show');
    errorMsg.classList.remove('show');

    // Save permission state
    await chrome.storage.local.set({ webcamPermissionGranted: true });

    // Update button
    enableBtn.textContent = 'Camera Enabled!';
    enableBtn.style.background = '#4CAF50';

    // Auto-proceed after 2 seconds
    setTimeout(() => {
      showDone();
    }, 2000);
  } catch (error) {
    console.error('Permission error:', error);
    errorMsg.classList.add('show');
    enableBtn.textContent = 'Try Again';
    enableBtn.disabled = false;

    await chrome.storage.local.set({ webcamPermissionGranted: false });
  }
});

skipBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ webcamPermissionGranted: false });
  showDone();
});

closeBtn.addEventListener('click', () => {
  // Stop stream if active
  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  window.close();
});

function showDone() {
  // Stop stream
  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    stream = null;
  }

  permissionStep.style.display = 'none';
  doneContainer.classList.add('show');
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
});
