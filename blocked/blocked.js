// Blocked page logic
(async function() {
  const canvas = document.getElementById('shame-canvas');
  const ctx = canvas.getContext('2d');
  const loadingOverlay = document.getElementById('loading-overlay');
  const errorOverlay = document.getElementById('error-overlay');
  const attemptCountEl = document.getElementById('attempt-count');
  const totalAttemptsEl = document.getElementById('total-attempts');
  const allTimeAttemptsEl = document.getElementById('all-time-attempts');
  const shameTextEl = document.getElementById('shame-text');
  const quotesEl = document.getElementById('quotes');
  const galleryBtn = document.getElementById('view-gallery');
  const galleryModal = document.getElementById('gallery-modal');
  const closeGallery = document.getElementById('close-gallery');
  const galleryGrid = document.getElementById('gallery-grid');
  const container = document.querySelector('.shame-container');

  const siteMessages = {
    twitter: [
      "You have nothing interesting to say. Neither does anyone else on there.",
      "You're refreshing a feed that doesn't know you exist. Let that sink in.",
      "Every second on Twitter makes you dumber, angrier, and more alone. You know this.",
      "You want to scroll Twitter because real life requires effort and you're too weak for effort right now.",
      "Nobody remembers your tweets. Nobody cares about your likes. You are screaming into a void that actively makes you worse."
    ],
    'youtube-shorts': [
      "You're feeding yourself digital junk food because you can't handle 10 seconds of silence with your own thoughts.",
      "A grown adult, sitting there, watching 15-second clips on repeat like a lab rat pressing a lever. That's you.",
      "Every short you watch trains your brain to need more stimulation and give less effort. You are making yourself useless.",
      "You don't even enjoy these. You just can't stop. That's not entertainment, that's a disorder."
    ],
    reddit: [
      "You're reading strangers argue about things that don't matter so you can avoid doing things that do.",
      "You tell yourself you're 'learning' on Reddit. You're not. You're hiding.",
      "Another hour of reading other people's lives because building your own feels too hard.",
      "Reddit is where you go to feel smart without actually doing anything smart."
    ],
    instagram: [
      "You're watching people live the life you want while doing absolutely nothing to build your own.",
      "Every minute on Instagram widens the gap between who you are and who you pretend to be.",
      "You scroll through other people's highlights to numb the fact that your own life feels empty."
    ],
    tiktok: [
      "You can't focus on anything for more than 30 seconds anymore and you're about to make it worse.",
      "TikTok has rewired your brain and you're going back for more like an addict licking the pipe.",
      "You've already lost hours of your life to this app today. Hours you'll never get back. And here you are, trying again."
    ],
    default: [
      "You installed this blocker because you know you're too weak to stop on your own. And you're proving yourself right.",
      "The fact that you're seeing this screen means you failed. Again. How many times is it now?",
      "You promised yourself you'd stop. That promise meant nothing. Just like the last one.",
      "This is you choosing the thing that makes your life worse over literally anything else. Think about that.",
      "Everyone else is building something with their time. You're here, trying to get past a wall you built yourself.",
      "You set this up because you were disgusted with yourself. Remember that feeling? You should. It was today.",
      "You're not even enjoying it when you get there. You're just avoiding the discomfort of doing something real.",
      "The version of you that installed this blocker would be ashamed of what you're doing right now.",
      "How many times are you going to do this before you admit you have a real problem?",
      "You are watching your own life waste away and your response is to open this site again."
    ]
  };

  const insanityQuotes = [
    '"You are not tired. You are not bored. You are addicted, and you are lying to yourself about it."',
    '"Every time you come back here, you prove that you value a dopamine hit more than your own future."',
    '"The person you could have been is getting further away every single day you do this."',
    '"Nobody is coming to save you from yourself. Either you stop, or this is who you are now."',
    '"You will look back on these wasted hours with genuine regret. But not yet. Not until it\'s too late."',
    '"Your discipline is a muscle and you have let it atrophy into nothing. This is the proof."',
    '"The gap between your potential and your reality is filled with exactly this \u2014 mindless scrolling."',
    '"One day you will run out of tomorrows to start fresh. Today could have been the day. But here you are."'
  ];

  // Detect which site triggered the block
  function getBlockedSiteId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('site') || null;
  }

  function getMessagesForSite(siteId) {
    if (siteId) {
      // Direct match
      if (siteMessages[siteId]) return siteMessages[siteId];
      // Partial match (e.g. "reddit.com" contains "reddit")
      for (const key of Object.keys(siteMessages)) {
        if (key !== 'default' && siteId.includes(key)) return siteMessages[key];
      }
    }
    return siteMessages.default;
  }

  const blockedSiteId = getBlockedSiteId();
  const shameMessages = getMessagesForSite(blockedSiteId);

  // Request photo capture from service worker
  async function requestCapture() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_PHOTO' }, (response) => {
        resolve(response);
      });
    });
  }

  // Get stats from storage
  async function getStats() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
        resolve(response || { attemptCount: 0, todayCount: 0, allTimeCount: 0 });
      });
    });
  }

  // Get photos from storage
  async function getPhotos() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PHOTOS' }, (response) => {
        resolve(response || []);
      });
    });
  }


  // Update shame level styling
  function updateShameLevel(count) {
    container.classList.remove('shame-level-1', 'shame-level-2', 'shame-level-3', 'shame-level-4');

    if (count >= 10) {
      container.classList.add('shame-level-4');
    } else if (count >= 6) {
      container.classList.add('shame-level-3');
    } else if (count >= 3) {
      container.classList.add('shame-level-2');
    } else {
      container.classList.add('shame-level-1');
    }
  }

  // Display photo on canvas
  function displayPhoto(base64Data) {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width || 640;
      canvas.height = img.height || 480;
      ctx.drawImage(img, 0, 0);
      loadingOverlay.style.display = 'none';
    };
    img.src = base64Data;
  }

  // Show error state — dark mirror effect
  function showError() {
    loadingOverlay.style.display = 'none';
    errorOverlay.style.display = 'none';

    // Turn the canvas into a dark mirror
    canvas.style.background = '#000';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const photoFrame = document.getElementById('photo-frame');
    photoFrame.classList.add('mirror-mode');

    // Add the "LOOK AT YOURSELF" overlay
    const mirrorText = document.createElement('div');
    mirrorText.className = 'mirror-text';
    mirrorText.textContent = 'LOOK AT YOURSELF';
    photoFrame.appendChild(mirrorText);
  }

  // Update UI with stats
  async function updateStats() {
    const stats = await getStats();
    attemptCountEl.textContent = stats.allTimeCount;
    totalAttemptsEl.textContent = stats.todayCount;
    allTimeAttemptsEl.textContent = stats.allTimeCount;

    // Pick a shame message based on 3-day rolling count
    const threeDayCount = stats.threeDayCount || stats.allTimeCount;
    const messageIndex = Math.min(threeDayCount - 1, shameMessages.length - 1);
    if (messageIndex >= 0) {
      shameTextEl.textContent = shameMessages[Math.max(0, messageIndex)];
    }

    // Update quote
    const quoteIndex = threeDayCount % insanityQuotes.length;
    quotesEl.querySelector('.quote').textContent = insanityQuotes[quoteIndex];

    // Update leaderboard with real today count
    const leaderboardYou = document.getElementById('leaderboard-you');
    if (leaderboardYou) {
      leaderboardYou.textContent = stats.todayCount;
    }

    // Update shame level styling based on 3-day count
    updateShameLevel(threeDayCount);

    // Apply milestone visual effect based on all-time count
    applyMilestoneEffect(stats.allTimeCount);
  }

  const milestoneThresholds = [1000, 666, 420, 404, 100, 69, 67, 42, 13];

  function applyMilestoneEffect(count) {
    milestoneThresholds.forEach(n => container.classList.remove('milestone-' + n));
    if (milestoneThresholds.includes(count)) {
      container.classList.add('milestone-' + count);
    }
  }

  // Gallery functionality
  const roastCaptions = [
    "Exhibit A in the case against your willpower",
    "This is what rock bottom looks like",
    "Your parents would be so proud",
    "Frame this one for the therapist",
    "Evidence that screen time warnings exist for a reason",
    "Not your best angle. Then again, none of them are.",
    "Caught in 4K. Again.",
    "Even your webcam is judging you.",
    "Another one for the cringe compilation.",
    "Future you is going to hate present you.",
    "Proof that self-control is just a myth.",
    "This photo has more regret than a Monday morning.",
    "You look exactly how your browser history feels.",
    "Screenshot this and send it to your accountability partner.",
    "Day N of pretending you'll stop tomorrow."
  ];

  function getCaptionForIndex(index) {
    // Deterministic pick seeded by index so captions don't shuffle on re-render
    const seed = (index * 2654435761) >>> 0; // Knuth multiplicative hash
    return roastCaptions[seed % roastCaptions.length];
  }

  const galleryCountEl = document.getElementById('gallery-count');
  const galleryEmpty = document.getElementById('gallery-empty');

  async function loadGallery() {
    const photos = await getPhotos();
    galleryGrid.innerHTML = '';

    if (photos.length === 0) {
      galleryGrid.style.display = 'none';
      galleryEmpty.style.display = 'block';
      galleryCountEl.textContent = '0 photos';
      return;
    }

    galleryEmpty.style.display = 'none';
    galleryGrid.style.display = 'grid';
    galleryCountEl.textContent = photos.length + (photos.length === 1 ? ' photo' : ' photos');

    photos.reverse().forEach((photo, index) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.style.animationDelay = (index * 0.06) + 's';

      const img = document.createElement('img');
      img.src = photo.data;

      const captionWrap = document.createElement('div');
      captionWrap.className = 'gallery-item-caption';

      const captionText = document.createElement('div');
      captionText.className = 'caption-text';
      captionText.textContent = '"' + getCaptionForIndex(index) + '"';

      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      timestamp.textContent = new Date(photo.timestamp).toLocaleString();

      captionWrap.appendChild(captionText);
      captionWrap.appendChild(timestamp);
      item.appendChild(img);
      item.appendChild(captionWrap);
      galleryGrid.appendChild(item);
    });
  }

  galleryBtn.addEventListener('click', async () => {
    await loadGallery();
    galleryModal.style.display = 'flex';
  });

  closeGallery.addEventListener('click', () => {
    if (isGalleryOnly) {
      window.close();
      return;
    }
    galleryModal.style.display = 'none';
  });

  galleryModal.addEventListener('click', (e) => {
    if (e.target === galleryModal) {
      if (isGalleryOnly) {
        window.close();
        return;
      }
      galleryModal.style.display = 'none';
    }
  });

  const params = new URLSearchParams(window.location.search);
  const isGalleryOnly = params.get('gallery') === 'true';

  // Initialize
  async function init() {
    if (isGalleryOnly) {
      document.querySelector('.shame-container').style.display = 'none';
      await loadGallery();
      galleryModal.style.display = 'flex';
      return;
    }

    try {
      const response = await requestCapture();

      if (response && response.success && response.data) {
        displayPhoto(response.data);
      } else {
        showError();
      }
    } catch (e) {
      console.error('Capture error:', e);
      showError();
    }

    await updateStats();
  }

  init();
})();
