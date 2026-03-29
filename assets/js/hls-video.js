// Enables HLS (.m3u8) playback in browsers without native support.
(function () {
  function initVideo(video) {
    var src = video.getAttribute('data-hls');
    if (!src) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    function attachWithHlsJs() {
      if (!window.Hls || !window.Hls.isSupported()) return;
      var hls = new window.Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    }

    if (window.Hls) {
      attachWithHlsJs();
      return;
    }

    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js';
    script.async = true;
    script.onload = attachWithHlsJs;
    document.head.appendChild(script);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('video[data-hls]').forEach(initVideo);
  });
})();
