// 第三階段修正版：依照實際蘋果位置計算蛇的路線與捲動進度。

// 保留首頁錨點的平滑捲動功能。
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const targetId = link.getAttribute('href');
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const timeline = document.querySelector('.snake-timeline');
const route = document.querySelector('#snakeProgress');
const routeSvg = document.querySelector('#timelineRouteSvg');
const overlaySvg = document.querySelector('#snakeOverlaySvg');
const routeTrack = document.querySelector('.route-line');
const routeShadow = document.querySelector('.route-shadow');
const segmentsGroup = document.querySelector('#snakeSegments');
const snakeHead = document.querySelector('#movingSnakeHead');
const projectItems = [...document.querySelectorAll('.timeline-item')];

if (timeline && route && routeSvg && overlaySvg && routeTrack && routeShadow && segmentsGroup && snakeHead && projectItems.length) {
  let currentPathLength = 0;
  let milestoneDistances = [];
  const segmentSpacing = 38;
  const maxSegments = 9;
  const segmentElements = [];

  // 預先建立蛇身圓形節點，捲動時只更新位置。
  for (let i = 0; i < maxSegments; i += 1) {
    const segment = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    segment.setAttribute('class', 'snake-body-segment');
    segment.setAttribute('r', String(12.5 - i * 0.35));

    const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    highlight.setAttribute('class', 'snake-body-highlight');
    highlight.setAttribute('r', '3');

    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrapper.append(segment, highlight);
    wrapper.style.display = 'none';
    segmentsGroup.appendChild(wrapper);
    segmentElements.push(wrapper);
  }

  // 將蘋果在瀏覽器中的中心點，換算成 SVG viewBox 座標。
  function getApplePoints() {
    const matrix = routeSvg.getScreenCTM();
    if (!matrix) return [];
    const inverse = matrix.inverse();

    return projectItems.map((item) => {
      const node = item.querySelector('.project-node');
      const rect = node.getBoundingClientRect();
      const screenPoint = routeSvg.createSVGPoint();
      screenPoint.x = rect.left + rect.width / 2;
      screenPoint.y = rect.top + rect.height / 2;
      return screenPoint.matrixTransform(inverse);
    });
  }

  // 讓路線從第一顆蘋果中心出發，並精準通過每一顆蘋果中心。
  function createPath(points, isMobile) {
    if (!points.length) return '';
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i];
      const to = points[i + 1];
      const middleY = (from.y + to.y) / 2;
      // 手機版蘋果排列在同一側，以交替的小幅偏移保留蛇行感。
      const offset = isMobile ? (i % 2 === 0 ? 16 : -16) : 0;
      d += ` C ${from.x + offset} ${middleY}, ${to.x + offset} ${middleY}, ${to.x} ${to.y}`;
    }
    return d;
  }

  // 以取樣方式找出每顆蘋果在 SVG 路線上的實際距離。
  function findMilestoneDistances(points) {
    const total = route.getTotalLength();
    const results = [];
    const step = Math.max(1, total / 2500);

    points.forEach((target) => {
      let bestDistance = 0;
      let bestSquaredDistance = Infinity;
      for (let distance = 0; distance <= total; distance += step) {
        const point = route.getPointAtLength(Math.min(distance, total));
        const dx = point.x - target.x;
        const dy = point.y - target.y;
        const squaredDistance = dx * dx + dy * dy;
        if (squaredDistance < bestSquaredDistance) {
          bestSquaredDistance = squaredDistance;
          bestDistance = distance;
        }
      }
      results.push(bestDistance);
    });
    results[results.length - 1] = total;
    return results;
  }

  function setResponsiveRoute() {
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    const viewBox = isMobile ? '0 0 100 2080' : '0 0 1000 2080';
    routeSvg.setAttribute('viewBox', viewBox);
    overlaySvg.setAttribute('viewBox', viewBox);

    // 先讓 SVG 完成尺寸更新，再讀取節點座標。
    const points = getApplePoints();
    if (points.length !== projectItems.length) return;
    const pathData = createPath(points, isMobile);
    [route, routeTrack, routeShadow].forEach((path) => path.setAttribute('d', pathData));
    currentPathLength = route.getTotalLength();
    milestoneDistances = findMilestoneDistances(points);
  }

  function getScrollRange() {
    const firstNode = projectItems[0].querySelector('.project-node').getBoundingClientRect();
    const lastNode = projectItems[projectItems.length - 1].querySelector('.project-node').getBoundingClientRect();
    const firstPageY = window.scrollY + firstNode.top + firstNode.height / 2;
    const lastPageY = window.scrollY + lastNode.top + lastNode.height / 2;
    const viewportHeight = window.innerHeight;

    // 以第一顆及最後一顆蘋果作為行程端點，不再依賴整個時間軸高度。
    const startScroll = firstPageY - viewportHeight * 0.55;
    const desiredEndScroll = lastPageY - viewportHeight * 0.5;
    // 大視窗下，確保進度 100% 一定能在文件最底部之前或當下達成。
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
    const endScroll = Math.min(desiredEndScroll, maxScroll);
    return { startScroll, endScroll: Math.max(startScroll + 1, endScroll) };
  }

  let ticking = false;

  function updateSnake() {
    const { startScroll, endScroll } = getScrollRange();
    const progress = Math.min(1, Math.max(0, (window.scrollY - startScroll) / (endScroll - startScroll)));
    const headDistance = currentPathLength * progress;

    route.style.strokeDasharray = `${currentPathLength} ${currentPathLength}`;
    route.style.strokeDashoffset = String(currentPathLength - headDistance);

    const headPoint = route.getPointAtLength(headDistance);
    const directionPoint = headDistance < currentPathLength
      ? route.getPointAtLength(Math.min(currentPathLength, headDistance + 3))
      : route.getPointAtLength(Math.max(0, headDistance - 3));
    const dx = headDistance < currentPathLength ? directionPoint.x - headPoint.x : headPoint.x - directionPoint.x;
    const dy = headDistance < currentPathLength ? directionPoint.y - headPoint.y : headPoint.y - directionPoint.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    snakeHead.setAttribute('transform', `translate(${headPoint.x} ${headPoint.y}) rotate(${angle})`);
    snakeHead.classList.toggle('is-visible', progress > 0.005);

    const visibleSegments = Math.min(maxSegments, Math.floor(progress * maxSegments));
    segmentElements.forEach((segment, index) => {
      if (index >= visibleSegments) {
        segment.style.display = 'none';
        return;
      }
      const distance = headDistance - (index + 1) * segmentSpacing;
      if (distance < 0) {
        segment.style.display = 'none';
        return;
      }
      const point = route.getPointAtLength(distance);
      segment.setAttribute('transform', `translate(${point.x} ${point.y})`);
      segment.style.display = '';
    });

    // 依照每顆蘋果在路線上的實際距離觸發抵達效果。
    projectItems.forEach((item, index) => {
      item.classList.toggle('is-reached', headDistance >= milestoneDistances[index] - 1);
    });

    ticking = false;
  }

  function requestSnakeUpdate() {
    if (!ticking) {
      window.requestAnimationFrame(updateSnake);
      ticking = true;
    }
  }

  function rebuildRouteAndUpdate() {
    setResponsiveRoute();
    requestSnakeUpdate();
  }

  // 等字型及版面載入後再讀取節點位置，避免大視窗初始座標不準。
  window.addEventListener('scroll', requestSnakeUpdate, { passive: true });
  window.addEventListener('resize', rebuildRouteAndUpdate);
  window.addEventListener('load', rebuildRouteAndUpdate);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rebuildRouteAndUpdate);
  }
  rebuildRouteAndUpdate();
}
