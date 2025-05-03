let blurOverlay = null;
const videoElements = [];

const videos = document.querySelectorAll('video');
console.log('Number of videos', videos.length);
videos.forEach(video => {
    console.log('video detected', video);
  if (!video.dataset.blurred) {
    video.addEventListener('play', handleVideoPlay);
    video.dataset.blurred = true;
    // 正确地将当前播放的视频元素赋值给 videoElement
    videoElements.push(video);
  }
});

function handleVideoPlay(event) {
console.log('video play event', event);
  const video = event.target;
  videoElements.push(video);
  createBlurOverlay();
}
  // 监听视频大小和位置变化
const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
    if (entry.target === videoElements[0] && blurOverlay) {
        createBlurOverlay();
    }
}
});
resizeObserver.observe(videoElements[0]);
createBlurOverlay();

function createBlurOverlay() {
    console.log('createBlurOverlay called');
  if (blurOverlay && blurOverlay.parentNode) {
    blurOverlay.parentNode.removeChild(blurOverlay);
    blurOverlay = null;
  }

  blurOverlay = document.createElement('div');
  blurOverlay.style.position = 'absolute';
  blurOverlay.style.zIndex = 99999; // 确保在视频上方，但在控制栏下方
  blurOverlay.style.pointerEvents = 'none'; // 允许鼠标事件穿透
  updateOverlayPosition();

  console.log('blurOverlay', blurOverlay);
  document.body.appendChild(blurOverlay);


  // 监听视频在页面中的位置变化 (例如，全屏切换)
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition);
}


function updateOverlayPosition() {
  if (blurOverlay && videoElements[0]) {
    const videoRect = videoElements[0].getBoundingClientRect();
    const blurHeight = videoRect.height / 5;
    const blurY = videoRect.top + window.scrollY + videoRect.height - blurHeight - videoRect.height / 10; // 

    blurOverlay.style.top = `${blurY}px`;
    blurOverlay.style.left = `${videoRect.left + window.scrollX}px`;
    blurOverlay.style.width = `${videoRect.width}px`;
    blurOverlay.style.height = `${blurHeight}px`;
    blurOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)'; // Increase opacity for visibility
    blurOverlay.style.backdropFilter = 'blur(5px)'; // Use backdrop-filter instead of filter
    blurOverlay.style.filter = 'blur(0px)'; // Remove regular filter
    console.log('blurOverlay position updated', blurOverlay.style.top, blurOverlay.style.left, blurOverlay.style.width, blurOverlay.style.height);
  }
}