// Keep only one video active at a time and pause videos when they leave the viewport.
(function () {
  var videos = new Set();
  var activeVideo = null;
  var scheduled = false;

  function isFullyOutOfView(video) {
    if (!video || !video.isConnected) return true;

    var rect = video.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;

    return rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw;
  }

  function pauseVideo(video) {
    if (!video || video.paused) return;
    try {
      video.pause();
    } catch (_) {
      // no-op
    }
  }

  function pauseAllExcept(exceptVideo) {
    videos.forEach(function (video) {
      if (video !== exceptVideo) {
        pauseVideo(video);
      }
    });
  }

  function updateActiveVideo(video) {
    if (!video || !video.isConnected) return;
    if (activeVideo === video) return;
    activeVideo = video;
    pauseAllExcept(video);
  }

  function refreshVisibility() {
    scheduled = false;

    if (!videos.size) return;

    videos.forEach(function (video) {
      if (isFullyOutOfView(video)) {
        pauseVideo(video);
        if (activeVideo === video) {
          activeVideo = null;
        }
      }
    });
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(refreshVisibility);
  }

  function attach(video) {
    if (!video || videos.has(video)) return;
    videos.add(video);

    video.addEventListener('play', function () {
      updateActiveVideo(video);
      scheduleRefresh();
    });

    video.addEventListener('pause', function () {
      if (activeVideo === video && video.paused) {
        activeVideo = null;
      }
    });
  }

  function init() {
    document.querySelectorAll('video').forEach(attach);
    scheduleRefresh();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('scroll', scheduleRefresh, { passive: true });
  window.addEventListener('resize', scheduleRefresh);
  window.addEventListener('orientationchange', scheduleRefresh);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pauseAllExcept(null);
      activeVideo = null;
      return;
    }
    scheduleRefresh();
  });

  if ('MutationObserver' in window) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches('video')) {
            attach(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach(attach);
          }
        });
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
