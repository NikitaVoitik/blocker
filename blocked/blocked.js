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
      "Nobody remembers your tweets. Nobody cares about your likes. You are screaming into a void that actively makes you worse.",
      "You're about to spend 45 minutes being angry at strangers and then wonder why you feel awful.",
      "The algorithm knows you can't look away. It's designed for people exactly like you. Weak ones.",
      "You could read a book, learn a skill, call a friend. Instead you chose the outrage machine. Again.",
      "Nothing on that timeline will matter in an hour. But the time you waste on it is gone forever.",
      "You keep going back like the engagement bait will fill whatever hole you're trying to fill. It won't."
    ],
    'youtube-shorts': [
      "You're feeding yourself digital junk food because you can't handle 10 seconds of silence with your own thoughts.",
      "A grown adult, sitting there, watching 15-second clips on repeat like a lab rat pressing a lever. That's you.",
      "Every short you watch trains your brain to need more stimulation and give less effort. You are making yourself useless.",
      "You don't even enjoy these. You just can't stop. That's not entertainment, that's a compulsion.",
      "Your attention span is already destroyed and you're here to finish the job.",
      "Fifteen seconds at a time, over and over, until an hour disappears. You won't even remember a single one.",
      "You swipe because thinking feels too hard now. That's what these did to you.",
      "Somewhere a developer is celebrating their engagement metrics. You are the metric."
    ],
    youtube: [
      "You told yourself you'd watch one video. You and I both know that's not how this ends.",
      "The recommended sidebar is not your friend. It's a trap built for people with no self-control. People like you.",
      "Three hours from now you'll have watched eight videos and remember nothing useful from any of them.",
      "You're about to autoplay your way through the entire afternoon and then complain you had no time.",
      "Every 'just one more' is a lie you tell yourself. You've never watched just one more.",
      "The rabbit hole is calling. You always answer. That's the problem.",
      "You could actually do the thing you keep watching tutorials about. But watching feels easier than trying.",
      "Congratulations, you're about to trade real progress for the illusion of learning."
    ],
    reddit: [
      "You're reading strangers argue about things that don't matter so you can avoid doing things that do.",
      "You tell yourself you're 'learning' on Reddit. You're not. You're hiding.",
      "Another hour of reading other people's lives because building your own feels too hard.",
      "Reddit is where you go to feel smart without actually doing anything smart.",
      "You're about to read a thread, form a strong opinion, and then do absolutely nothing with it.",
      "The front page is not news. It's a curated distraction machine and you fell for it again.",
      "Upvotes are not accomplishments. Comments are not conversations. None of this is real.",
      "You already know what's on there. The same recycled takes. And you still can't resist."
    ],
    instagram: [
      "You're watching people live the life you want while doing absolutely nothing to build your own.",
      "Every minute on Instagram widens the gap between who you are and who you pretend to be.",
      "You scroll through other people's highlights to numb the fact that your own life feels empty.",
      "You're comparing your behind-the-scenes to everyone else's highlight reel. And losing. On purpose.",
      "Nothing you see on there is real. But the time you lose staring at it is.",
      "You don't even follow people you know anymore. You're just watching strangers perform happiness.",
      "The explore page is an endless pit and you were about to jump in with both feet. Again.",
      "Every scroll teaches the algorithm what keeps you trapped. You're training your own cage."
    ],
    tiktok: [
      "You can't focus on anything for more than 30 seconds anymore and you're about to make it worse.",
      "TikTok has rewired your brain into needing constant stimulation and you keep crawling back for more.",
      "You've already lost hours of your life to this app today. Hours you'll never get back. And here you are, trying again.",
      "Your dopamine receptors are fried and you're reaching for the thing that fried them.",
      "You'll open it for 'just a second' and surface an hour later with nothing to show for it. You know this.",
      "The For You page knows you better than you know yourself. That should terrify you, not comfort you.",
      "Every session makes it harder to do anything that requires actual sustained attention. You're choosing to get worse.",
      "You are voluntarily making yourself dumber, one swipe at a time."
    ],
    facebook: [
      "It's not 2012 anymore. There's nothing left for you there and you know it.",
      "You're about to scroll through acquaintances' life updates and call it socializing.",
      "The only people still posting are the ones you muted years ago. And you're going back anyway.",
      "Facebook is where you go when you've already exhausted every other distraction. Rock bottom of boredom.",
      "You're not staying connected. You're staring at people you don't talk to anymore."
    ],
    linkedin: [
      "You're not networking. You're procrastinating with a professional veneer.",
      "Reading other people's career wins is not a career strategy. It's self-torture.",
      "Another humble-brag post about someone's promotion won't get you one. Actual work might.",
      "You're about to spend 30 minutes on LinkedIn and call it 'professional development.'",
      "The feed is just corporate Instagram. Inspirational quotes over stock photos. You're better than this."
    ],
    twitch: [
      "You're about to watch someone else play a game instead of doing literally anything with your own life.",
      "Hours of watching someone else have fun. That's your plan. Think about that.",
      "The streamer doesn't know you exist. Your subscription is not a friendship.",
      "You could be building, learning, creating. Instead you chose to be an audience member for your own wasted evening.",
      "Every hour you watch is an hour you could have spent on something that actually moves your life forward."
    ],
    discord: [
      "You don't have 'just one quick message.' You have two hours of aimless chatting ahead of you.",
      "You're about to open seventeen channels and read none of them properly.",
      "The server will still be there after you finish your actual responsibilities. Go handle those first.",
      "You're substituting real human connection with group chat noise. And you know the difference.",
      "Nothing in those channels is urgent. Nothing. Go do your work."
    ],
    pinterest: [
      "You're saving ideas you'll never act on. That's not inspiration, that's avoidance.",
      "Your boards have hundreds of pins and zero finished projects. Think about why.",
      "Collecting aesthetic images is not a personality. It's procrastination with a mood board.",
      "You plan and save and curate and never, ever execute. Pinterest is where ambition goes to die.",
      "Every pin is a tiny lie you tell yourself — that you'll get to it someday."
    ],
    netflix: [
      "You already watched three episodes today. The plot can wait. Your life can't.",
      "Binge-watching is not self-care. It's hiding from everything you need to do.",
      "The show will still be there tomorrow. Your deadlines won't.",
      "You're about to lose an entire evening to a screen. Again. Is this really how you want to spend your time?",
      "Auto-play is counting on you being too passive to hit stop. Prove it wrong for once."
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
      "You are watching your own life waste away and your response is to open this site again.",
      "You blocked this site for a reason. That reason hasn't changed. You have. You got weaker.",
      "The urge will pass in about ten minutes. You just have to not be pathetic for ten minutes. Can you manage that?",
      "Every time you try to visit this page, you're choosing short-term comfort over long-term growth. Every single time.",
      "You're not bored. You're uncomfortable with silence. And instead of sitting with it, you run here.",
      "Close this tab. Stand up. Do one push-up. That's more than you were about to accomplish."
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

  // Roasts shown when a site is blocked for hitting its daily time limit.
  const limitMessages = [
    "Sixty minutes. You begged for a limit and still ran straight into the wall.",
    "Your hour is gone. You spent it here. On this. Was it worth it? You know it wasn't.",
    "You rationed yourself like an adult and binged like a child. Time's up.",
    "You set the limit because you knew you couldn't be trusted. You were right.",
    "That's your daily dose. The machine had to cut you off because you wouldn't.",
    "An hour of your one and only life, fed into the void. The void says: more, please.",
    "You hit the ceiling you built yourself. Sit with that before you try to climb over it.",
    "Limit reached. The only muscle you've trained today is your scrolling thumb.",
    "You asked to be stopped. Here's the stop. You're welcome.",
    "Out of time. Not out of life — yet. Go do literally anything else."
  ];

  const limitQuotes = [
    '"You drew the line yourself. Then you sprinted toward it like it was a finish line."',
    '"A limit is a promise to your future self. You just broke it, right on schedule."',
    '"The clock didn\'t run out on you. You ran it out."',
    '"You wanted discipline to be a setting you could toggle. It isn\'t. It\'s you. And you blinked."',
    '"Every day you get a fresh hour and every day you set it on fire by lunch."',
    '"The cap isn\'t the punishment. The fact that you needed one is."'
  ];

  // Detect which site triggered the block
  function getBlockedSiteId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('site') || null;
  }

  // True when this block is a daily-limit block (reason=limit), not a relapse on a fully-blocked site.
  function isLimitBlock() {
    const params = new URLSearchParams(window.location.search);
    return params.get('reason') === 'limit';
  }

  // Format seconds as "1h 2m" / "47m" / "<1m"
  function formatDuration(seconds) {
    if (!seconds || seconds < 60) return '<1m';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return mins > 0 ? hours + 'h ' + mins + 'm' : hours + 'h';
    return mins + 'm';
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
  const limitBlock = isLimitBlock();
  const shameMessages = limitBlock ? limitMessages : getMessagesForSite(blockedSiteId);

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

  // Get all restrictions (each carries its mode, daily limit, and today's usage)
  async function getRestrictionSites() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_RESTRICTION_SITES' }, (response) => {
        resolve(response || []);
      });
    });
  }

  // Reveal and populate the daily-limit banner with the offending site + usage
  async function setupLimitBanner() {
    const banner = document.getElementById('limit-banner');
    if (!banner) return;
    banner.style.display = 'block';

    try {
      const sites = await getRestrictionSites();
      const site = sites.find((s) => s.id === blockedSiteId);
      const spent = (site && Number(site.usageTodaySeconds)) || 0;
      const cap = (site && Number(site.dailyLimitSeconds) > 0) ? Number(site.dailyLimitSeconds) : 0;

      document.getElementById('limit-site').textContent = (site && (site.label || site.id)) || blockedSiteId || 'this site';
      document.getElementById('limit-spent').textContent = formatDuration(spent);
      document.getElementById('limit-cap').textContent = cap ? formatDuration(cap) : '—';
    } catch (e) {
      // Banner still shows with its default copy if data fetch fails
    }
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

  const fakeUsers = [
    'serial relapser',
    'definitely not you on alt',
    'anonymous coward',
    'ctrl+T enjoyer',
    'one more scroll andy',
    'the usual suspect',
    'willpower.exe has stopped',
    'just 5 more minutes guy',
  ];

  function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  function generateFakeEntries(todayCount) {
    const daySeed = Math.floor(Date.now() / 86400000);
    const count = 4 + Math.floor(seededRandom(daySeed) * 3);
    const entries = [];

    for (let i = 0; i < count; i++) {
      const s = seededRandom(daySeed * 100 + i + 1);
      const base = Math.max(3, Math.floor(todayCount * (0.4 + s * 1.2)));
      const nameIndex = Math.floor(seededRandom(daySeed + i * 7) * fakeUsers.length);
      entries.push({ name: fakeUsers[nameIndex], count: base, isYou: false });
    }

    return entries;
  }

  function updateLeaderboard(todayCount) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    const fakes = generateFakeEntries(todayCount);
    const all = [...fakes, { name: 'you', count: todayCount, isYou: true }];
    all.sort((a, b) => b.count - a.count);

    const top = all.slice(0, 5);
    const youInTop = top.some(e => e.isYou);
    if (!youInTop) {
      const youIndex = all.findIndex(e => e.isYou);
      top[top.length - 1] = all[youIndex];
    }

    list.innerHTML = '';
    top.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'leaderboard-entry' + (entry.isYou ? ' you' : '');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'entry-name';
      nameSpan.textContent = entry.name;
      const countSpan = document.createElement('span');
      countSpan.className = 'entry-count';
      countSpan.textContent = entry.count;
      li.appendChild(nameSpan);
      li.appendChild(countSpan);
      list.appendChild(li);
    });
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

    // Update quote — limit blocks use their own quote set
    const quoteSet = limitBlock ? limitQuotes : insanityQuotes;
    const quoteIndex = threeDayCount % quoteSet.length;
    quotesEl.querySelector('.quote').textContent = quoteSet[quoteIndex];

    updateLeaderboard(stats.todayCount);

    // Update shame level styling based on 3-day count
    updateShameLevel(threeDayCount);

    // Apply milestone visual effect based on all-time count
    applyMilestoneEffect(stats.allTimeCount);
  }

  const milestoneThresholds = [1000, 500, 404, 250, 100, 75, 67, 42, 13];

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
  const storageCountEl = document.getElementById('storage-count');
  const storageBytesEl = document.getElementById('storage-bytes');
  const storageStatusEl = document.getElementById('storage-status');
  const limitInput = document.getElementById('limit-input');
  const limitHintEl = document.getElementById('limit-hint');
  const limitDecreaseBtn = document.getElementById('limit-decrease');
  const limitIncreaseBtn = document.getElementById('limit-increase');
  const applyLimitBtn = document.getElementById('apply-limit');
  const clearGalleryBtn = document.getElementById('clear-gallery');

  let storageInfo = { count: 0, bytes: 0, limit: 50, minLimit: 5, maxLimit: 500 };
  let clearArmed = false;
  let clearArmTimer = null;

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getPhotoStorageInfo() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_PHOTO_STORAGE_INFO' }, (response) => {
        resolve(response || { count: 0, bytes: 0, limit: 50, minLimit: 5, maxLimit: 500 });
      });
    });
  }

  function setPhotoLimit(limit) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'SET_PHOTO_LIMIT', limit }, (response) => {
        resolve(response || { success: false });
      });
    });
  }

  function clearPhotos() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CLEAR_PHOTOS' }, (response) => {
        resolve(response || { success: false });
      });
    });
  }

  function setStorageStatus(message, kind) {
    storageStatusEl.textContent = message || '';
    storageStatusEl.classList.remove('is-success', 'is-danger');
    if (kind === 'success') storageStatusEl.classList.add('is-success');
    if (kind === 'danger') storageStatusEl.classList.add('is-danger');
  }

  function clampLimit(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return storageInfo.limit;
    return Math.max(storageInfo.minLimit, Math.min(storageInfo.maxLimit, n));
  }

  function renderStorageInfo(info) {
    storageInfo = info;
    storageCountEl.textContent = info.count + ' / ' + info.limit;
    storageBytesEl.textContent = formatBytes(info.bytes);
    limitInput.min = String(info.minLimit);
    limitInput.max = String(info.maxLimit);
    if (document.activeElement !== limitInput) {
      limitInput.value = String(info.limit);
    }
    limitHintEl.textContent = info.minLimit + ' – ' + info.maxLimit + ' photos';
  }

  function disarmClear() {
    clearArmed = false;
    clearGalleryBtn.classList.remove('is-armed');
    clearGalleryBtn.textContent = 'Purge Gallery';
    if (clearArmTimer) {
      clearTimeout(clearArmTimer);
      clearArmTimer = null;
    }
  }

  async function loadGallery() {
    const [photos, info] = await Promise.all([getPhotos(), getPhotoStorageInfo()]);
    renderStorageInfo(info);
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
    setStorageStatus('');
    disarmClear();
    await loadGallery();
    galleryModal.style.display = 'flex';
  });

  closeGallery.addEventListener('click', () => {
    disarmClear();
    if (isGalleryOnly) {
      window.close();
      return;
    }
    galleryModal.style.display = 'none';
  });

  galleryModal.addEventListener('click', (e) => {
    if (e.target === galleryModal) {
      disarmClear();
      if (isGalleryOnly) {
        window.close();
        return;
      }
      galleryModal.style.display = 'none';
    }
  });

  limitDecreaseBtn.addEventListener('click', () => {
    limitInput.value = String(clampLimit((parseInt(limitInput.value, 10) || storageInfo.limit) - 5));
    setStorageStatus('');
  });

  limitIncreaseBtn.addEventListener('click', () => {
    limitInput.value = String(clampLimit((parseInt(limitInput.value, 10) || storageInfo.limit) + 5));
    setStorageStatus('');
  });

  limitInput.addEventListener('change', () => {
    limitInput.value = String(clampLimit(limitInput.value));
  });

  applyLimitBtn.addEventListener('click', async () => {
    const target = clampLimit(limitInput.value);
    limitInput.value = String(target);
    if (target === storageInfo.limit && storageInfo.count <= target) {
      setStorageStatus('No change applied.', null);
      return;
    }
    applyLimitBtn.disabled = true;
    const willPrune = storageInfo.count > target;
    const response = await setPhotoLimit(target);
    applyLimitBtn.disabled = false;
    if (response && response.success) {
      const info = await getPhotoStorageInfo();
      renderStorageInfo(info);
      if (willPrune) {
        await loadGallery();
        setStorageStatus('Capacity set to ' + target + '. Excess evidence purged.', 'success');
      } else {
        setStorageStatus('Capacity set to ' + target + '.', 'success');
      }
    } else {
      setStorageStatus((response && response.error) || 'Could not update capacity.', 'danger');
    }
  });

  clearGalleryBtn.addEventListener('click', async () => {
    if (storageInfo.count === 0) {
      setStorageStatus('Gallery already empty.', null);
      return;
    }
    if (!clearArmed) {
      clearArmed = true;
      clearGalleryBtn.classList.add('is-armed');
      clearGalleryBtn.textContent = 'Confirm Purge';
      setStorageStatus('Click again within 8 seconds to destroy all evidence.', 'danger');
      clearArmTimer = setTimeout(() => {
        disarmClear();
        setStorageStatus('Purge cancelled.', null);
      }, 8000);
      return;
    }
    disarmClear();
    clearGalleryBtn.disabled = true;
    const response = await clearPhotos();
    clearGalleryBtn.disabled = false;
    if (response && response.success) {
      await loadGallery();
      setStorageStatus('Gallery purged. Slate clean.', 'success');
    } else {
      setStorageStatus((response && response.error) || 'Purge failed.', 'danger');
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

    if (limitBlock) {
      setupLimitBanner();
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
