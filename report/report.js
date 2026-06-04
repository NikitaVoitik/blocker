(() => {
  const shameLevels = [
    { min: 0, label: 'Clean' },
    { min: 1, label: 'Rookie' },
    { min: 3, label: 'Repeat Offender' },
    { min: 6, label: 'Addict' },
    { min: 10, label: 'Terminal Brain Rot' },
    { min: 20, label: 'Beyond Saving' },
  ];

  function getShameLevel(threeDayCount) {
    let level = shameLevels[0].label;
    for (const s of shameLevels) {
      if (threeDayCount >= s.min) level = s.label;
    }
    return level;
  }

  function formatDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  }

  function formatTime(seconds) {
    if (seconds < 60) return '<1m';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  // --- Tab switching ---

  const tabBtns = document.querySelectorAll('.report-tab-btn');
  const reportShame = document.getElementById('report-shame');
  const reportTracking = document.getElementById('report-tracking');
  let trackingLoaded = false;

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      reportShame.style.display = tab === 'shame' ? '' : 'none';
      reportTracking.style.display = tab === 'tracking' ? '' : 'none';
      if (tab === 'tracking' && !trackingLoaded) {
        loadTrackingReport();
        trackingLoaded = true;
      }
    });
  });

  // Auto-select tracking tab if URL param says so
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'tracking') {
    tabBtns.forEach((b) => {
      b.classList.remove('active');
    });
    document.querySelector('[data-tab="tracking"]').classList.add('active');
    reportShame.style.display = 'none';
    reportTracking.style.display = '';
    loadTrackingReport();
    trackingLoaded = true;
  }

  // --- Shame report ---

  function renderDailyChart(dailyBreakdown) {
    const container = document.getElementById('daily-chart');
    const axis = document.getElementById('chart-axis');
    const maxCount = Math.max(1, ...dailyBreakdown.map((d) => d.count));

    for (let i = 0; i < dailyBreakdown.length; i++) {
      const entry = dailyBreakdown[i];
      const bar = document.createElement('div');
      bar.className = 'bar';

      if (entry.count === 0) {
        bar.classList.add('bar-zero');
      } else {
        const heightPct = (entry.count / maxCount) * 100;
        bar.style.height = `${heightPct}%`;
        const opacity = 0.4 + (entry.count / maxCount) * 0.6;
        bar.style.backgroundColor = `rgba(255, 51, 51, ${opacity})`;
      }

      const tooltip = document.createElement('span');
      tooltip.className = 'bar-tooltip';
      tooltip.textContent = entry.count;
      bar.appendChild(tooltip);

      bar.setAttribute('data-date', formatDate(entry.date));
      container.appendChild(bar);
    }

    const first = document.createElement('span');
    first.textContent = formatDate(dailyBreakdown[0].date);
    const mid = document.createElement('span');
    mid.textContent = formatDate(dailyBreakdown[14].date);
    const last = document.createElement('span');
    last.textContent = formatDate(dailyBreakdown[29].date);
    axis.appendChild(first);
    axis.appendChild(mid);
    axis.appendChild(last);
  }

  function renderWeeklyChart(weeklySummaries) {
    const container = document.getElementById('weekly-chart');
    const labels = ['This Week', 'Last Week', '2 Weeks Ago', '3 Weeks Ago'];
    const maxTotal = Math.max(1, ...weeklySummaries.map((w) => w.total));

    for (let i = 0; i < weeklySummaries.length; i++) {
      const week = weeklySummaries[i];
      const row = document.createElement('div');
      row.className = 'week-row';

      const label = document.createElement('span');
      label.className = 'week-label';
      label.textContent = labels[i];

      const track = document.createElement('div');
      track.className = 'week-bar-track';

      const bar = document.createElement('div');
      bar.className = 'week-bar';
      const widthPct = (week.total / maxTotal) * 100;
      bar.style.width = `${widthPct}%`;
      const opacity = week.total > 0 ? 0.4 + (week.total / maxTotal) * 0.6 : 0;
      bar.style.backgroundColor = `rgba(255, 51, 51, ${opacity})`;

      track.appendChild(bar);

      const count = document.createElement('span');
      count.className = 'week-count';
      count.textContent = week.total;

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(count);
      container.appendChild(row);
    }
  }

  function populate(data) {
    document.getElementById('today-count').textContent = data.todayCount;
    document.getElementById('seven-day-count').textContent = data.sevenDayCount;
    document.getElementById('thirty-day-count').textContent = data.thirtyDayCount;
    document.getElementById('all-time-count').textContent = data.allTimeCount;

    const worstLabel =
      data.worstDay.count > 0
        ? `${formatDate(data.worstDay.date)} (${data.worstDay.count})`
        : 'None';
    document.getElementById('worst-day').textContent = worstLabel;
    document.getElementById('current-streak').textContent =
      `${data.currentCleanStreak} day${data.currentCleanStreak !== 1 ? 's' : ''}`;
    document.getElementById('longest-streak').textContent =
      `${data.longestCleanStreak} day${data.longestCleanStreak !== 1 ? 's' : ''}`;
    document.getElementById('photo-count').textContent = data.photoCount;
    document.getElementById('shame-level').textContent = getShameLevel(data.threeDayCount);

    renderDailyChart(data.dailyBreakdown);
    renderWeeklyChart(data.weeklySummaries);
  }

  chrome.runtime.sendMessage({ type: 'GET_REPORT_DATA' }, (response) => {
    if (response) {
      populate(response);
    }
  });

  // --- Coward Log ---

  function renderCowardLog(log, photos) {
    const listEl = document.getElementById('coward-log-list');
    const emptyEl = document.getElementById('coward-log-empty');
    const totalEl = document.getElementById('coward-total');

    totalEl.textContent = log.length;

    if (log.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    const photoMap = {};
    for (const p of photos) {
      photoMap[p.id] = p.data;
    }

    const sorted = [...log].sort((a, b) => b.timestamp - a.timestamp);

    for (const entry of sorted) {
      const row = document.createElement('div');
      row.className = 'coward-log-entry';

      if (entry.photoId && photoMap[entry.photoId]) {
        const img = document.createElement('img');
        img.className = 'coward-log-thumb';
        img.src = photoMap[entry.photoId];
        img.alt = 'Shame selfie';
        row.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'coward-log-thumb-placeholder';
        placeholder.textContent = 'N/A';
        row.appendChild(placeholder);
      }

      const info = document.createElement('div');
      info.className = 'coward-log-info';

      const site = document.createElement('div');
      site.className = 'coward-log-site';
      site.textContent = entry.siteLabel || entry.siteId;

      const date = document.createElement('div');
      date.className = 'coward-log-date';
      date.textContent = new Date(entry.timestamp).toLocaleString();

      info.appendChild(site);
      info.appendChild(date);
      row.appendChild(info);

      const badge = document.createElement('span');
      badge.className = 'coward-log-badge';
      badge.textContent = 'COWARD';
      row.appendChild(badge);

      listEl.appendChild(row);
    }
  }

  chrome.runtime.sendMessage({ type: 'GET_REMOVAL_LOG' }, (log) => {
    chrome.runtime.sendMessage({ type: 'GET_PHOTOS' }, (photos) => {
      renderCowardLog(log || [], photos || []);
    });
  });

  // --- Tracking report ---

  function loadTrackingReport() {
    chrome.runtime.sendMessage({ type: 'GET_TRACKING_REPORT_DATA' }, (response) => {
      if (response) {
        populateTracking(response);
      }
    });
  }

  let cachedTrackingData = null;

  function populateTracking(data) {
    cachedTrackingData = data;

    document.getElementById('track-today-visits').textContent = data.todayVisits;
    document.getElementById('track-today-time').textContent = formatTime(data.todayTime);
    document.getElementById('track-week-time').textContent = formatTime(data.weekTime);
    document.getElementById('track-month-time').textContent = formatTime(data.monthTime);

    // Insights
    document.getElementById('track-most-time').textContent = data.mostTimeSite
      ? `${data.mostTimeSite.label} (${formatTime(data.mostTimeSite.time)})`
      : 'None';
    document.getElementById('track-most-visited').textContent = data.mostVisited
      ? `${data.mostVisited.label} (${data.mostVisited.visits} visits)`
      : 'None';
    document.getElementById('track-avg-daily').textContent = formatTime(data.avgDailyTime);
    document.getElementById('track-worst-day').textContent =
      data.worstDay.time > 0
        ? `${formatDate(data.worstDay.date)} (${formatTime(data.worstDay.time)})`
        : 'None';
    document.getElementById('track-month-visits').textContent = data.monthVisits;

    renderTrackingDailyChart(data.dailyBreakdown);
    renderSiteTimeBreakdown(data.siteBreakdownToday);
    renderTrackingWeeklyChart(data.weeklySummaries);

    // Period switcher for site breakdown
    document.querySelectorAll('.period-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach((b) => {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        const period = btn.dataset.period;
        const breakdownData =
          period === 'week'
            ? cachedTrackingData.siteBreakdownWeek
            : period === 'month'
              ? cachedTrackingData.siteBreakdownMonth
              : cachedTrackingData.siteBreakdownToday;
        renderSiteTimeBreakdown(breakdownData);
      });
    });
  }

  function renderTrackingDailyChart(dailyBreakdown) {
    const container = document.getElementById('tracking-daily-chart');
    const axis = document.getElementById('tracking-chart-axis');
    const maxTime = Math.max(1, ...dailyBreakdown.map((d) => d.time));

    for (let i = 0; i < dailyBreakdown.length; i++) {
      const entry = dailyBreakdown[i];
      const bar = document.createElement('div');
      bar.className = 'bar';

      if (entry.time === 0) {
        bar.classList.add('bar-zero');
      } else {
        const heightPct = (entry.time / maxTime) * 100;
        bar.style.height = `${heightPct}%`;
        const opacity = 0.4 + (entry.time / maxTime) * 0.6;
        bar.style.backgroundColor = `rgba(51, 153, 255, ${opacity})`;
      }

      const tooltip = document.createElement('span');
      tooltip.className = 'bar-tooltip';
      tooltip.textContent = formatTime(entry.time);
      bar.appendChild(tooltip);

      bar.setAttribute('data-date', formatDate(entry.date));
      container.appendChild(bar);
    }

    const first = document.createElement('span');
    first.textContent = formatDate(dailyBreakdown[0].date);
    const mid = document.createElement('span');
    mid.textContent = formatDate(dailyBreakdown[14].date);
    const last = document.createElement('span');
    last.textContent = formatDate(dailyBreakdown[29].date);
    axis.appendChild(first);
    axis.appendChild(mid);
    axis.appendChild(last);
  }

  function renderSiteTimeBreakdown(siteBreakdown) {
    const container = document.getElementById('site-time-breakdown');
    const emptyEl = document.getElementById('site-breakdown-empty');
    container.innerHTML = '';
    const active = siteBreakdown.filter((s) => s.time > 0 || s.visits > 0);

    if (active.length === 0) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    const maxTime = Math.max(1, ...active.map((s) => s.time));

    for (const site of active) {
      const row = document.createElement('div');
      row.className = 'week-row';

      const label = document.createElement('span');
      label.className = 'week-label';
      label.textContent = site.label;

      const track = document.createElement('div');
      track.className = 'week-bar-track';

      const bar = document.createElement('div');
      bar.className = 'week-bar';
      const widthPct = site.time > 0 ? (site.time / maxTime) * 100 : 0;
      bar.style.width = `${widthPct}%`;
      const opacity = site.time > 0 ? 0.4 + (site.time / maxTime) * 0.6 : 0;
      bar.style.backgroundColor = `rgba(51, 153, 255, ${opacity})`;
      track.appendChild(bar);

      const count = document.createElement('span');
      count.className = 'week-count week-count-track';
      count.textContent = formatTime(site.time);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(count);
      container.appendChild(row);
    }
  }

  function renderTrackingWeeklyChart(weeklySummaries) {
    const container = document.getElementById('tracking-weekly-chart');
    const labels = ['This Week', 'Last Week', '2 Weeks Ago', '3 Weeks Ago'];
    const maxTime = Math.max(1, ...weeklySummaries.map((w) => w.time));

    for (let i = 0; i < weeklySummaries.length; i++) {
      const week = weeklySummaries[i];
      const row = document.createElement('div');
      row.className = 'week-row';

      const label = document.createElement('span');
      label.className = 'week-label';
      label.textContent = labels[i];

      const track = document.createElement('div');
      track.className = 'week-bar-track';

      const bar = document.createElement('div');
      bar.className = 'week-bar';
      const widthPct = week.time > 0 ? (week.time / maxTime) * 100 : 0;
      bar.style.width = `${widthPct}%`;
      const opacity = week.time > 0 ? 0.4 + (week.time / maxTime) * 0.6 : 0;
      bar.style.backgroundColor = `rgba(51, 153, 255, ${opacity})`;
      track.appendChild(bar);

      const count = document.createElement('span');
      count.className = 'week-count week-count-track';
      count.textContent = formatTime(week.time);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(count);
      container.appendChild(row);
    }
  }
})();
