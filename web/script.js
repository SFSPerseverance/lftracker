// Optional: add basic drag-to-pan for the SVG container
const container = document.getElementById('map-container');

let isDragging = false;
let startX, startY, scrollLeft, scrollTop;

container.addEventListener('mousedown', e => {
  isDragging = true;
  container.style.cursor = 'grabbing';
  startX = e.pageX - container.offsetLeft;
  startY = e.pageY - container.offsetTop;
  scrollLeft = container.scrollLeft;
  scrollTop = container.scrollTop;
});

container.addEventListener('mouseup', () => {
  isDragging = false;
  container.style.cursor = 'grab';
});

container.addEventListener('mouseleave', () => {
  isDragging = false;
  container.style.cursor = 'grab';
});

container.addEventListener('mousemove', e => {
  if (!isDragging) return;
  e.preventDefault();
  const x = e.pageX - container.offsetLeft;
  const y = e.pageY - container.offsetTop;
  const walkX = x - startX;
  const walkY = y - startY;
  container.scrollLeft = scrollLeft - walkX;
  container.scrollTop = scrollTop - walkY;
});
