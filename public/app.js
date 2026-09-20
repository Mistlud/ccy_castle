const app = document.querySelector('#app');
const homeButton = document.querySelector('#home-button');
const refreshButton = document.querySelector('#refresh-library');
const audioDock = document.querySelector('#audio-dock');
const audioPlayer = document.querySelector('#audio-player');
const audioTitle = document.querySelector('#audio-title');
const previousTrack = document.querySelector('#previous-track');
const nextTrack = document.querySelector('#next-track');

let audioQueue = [];
let audioIndex = -1;
let refreshResetTimer;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(response.status === 403 ? '허용되지 않은 경로입니다.' : '요청한 항목을 불러올 수 없습니다.');
  return response.json();
}

function navigate(kind, path = '') {
  const target = path ? `${kind}=${encodeURIComponent(path)}` : '';
  if (location.hash.slice(1) === target) route();
  else location.hash = target;
}

function heading(eyebrow, title, description, { thumbnailUrl = '', compact = false, metadata = '' } = {}) {
  const wrapper = element('header', compact ? 'page-heading explorer-heading' : 'page-heading');
  wrapper.append(element('span', 'eyebrow', eyebrow));
  if (thumbnailUrl) {
    const image = document.createElement('img');
    image.className = 'folder-thumbnail';
    image.src = thumbnailUrl;
    image.alt = '';
    wrapper.append(image);
  }
  wrapper.append(element('h1', '', title));
  if (description) wrapper.append(element('p', '', description));
  if (metadata) wrapper.append(element('span', 'meta-line heading-meta', metadata));
  return wrapper;
}

function renderBreadcrumb(items) {
  const nav = element('nav', 'breadcrumb');
  nav.setAttribute('aria-label', '현재 경로');
  items.forEach((item, index) => {
    if (index > 0) nav.append(element('span', '', '/'));
    const button = element('button', '', item.title);
    button.type = 'button';
    if (index === items.length - 1) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => {
      if (!item.path) navigate('', '');
      else if (item.path.split('/').length === 1) navigate('menu', item.path);
      else navigate('browse', item.path);
    });
    nav.append(button);
  });
  return nav;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function playTrack(queue, index) {
  audioQueue = queue;
  audioIndex = index;
  const track = audioQueue[audioIndex];
  if (!track) return;
  audioDock.hidden = false;
  audioTitle.textContent = track.name;
  audioPlayer.src = track.mediaUrl;
  audioPlayer.play().catch(() => {});
}

function showVideo(file, beforeNode) {
  document.querySelector('.video-view')?.remove();
  const view = element('section', 'video-view');
  const video = document.createElement('video');
  video.controls = true;
  video.preload = 'metadata';
  video.src = file.mediaUrl;
  view.append(video, element('strong', '', file.name));
  beforeNode.before(view);
  video.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderEntries(browse, container) {
  const directories = browse.entries.filter((entry) => entry.kind === 'directory');
  const files = browse.entries.filter((entry) => entry.kind === 'file');

  if (directories.length) {
    container.append(element('h2', 'section-title', '폴더'));
    const list = element('div', 'entry-list');
    for (const directory of directories) {
      const row = element('button', 'entry entry-clickable');
      row.type = 'button';
      row.addEventListener('click', () => navigate('browse', directory.path));
      row.append(element('span', 'entry-icon', '▰'));
      const copy = element('div', 'entry-copy');
      copy.append(element('strong', '', directory.name), element('small', '', '폴더'));
      row.append(copy);
      list.append(row);
    }
    container.append(list);
  }

  if (files.length) {
    container.append(element('h2', 'section-title', '파일'));
    const list = element('div', 'entry-list');
    const audioFiles = files.filter((file) => file.mediaType === 'audio');
    for (const file of files) {
      let row;
      if (file.mediaType === 'audio' || file.mediaType === 'video') {
        row = element('button', 'entry entry-clickable');
        row.type = 'button';
        if (file.mediaType === 'audio') {
          row.addEventListener('click', () => playTrack(audioFiles, audioFiles.findIndex((track) => track.path === file.path)));
        } else {
          row.addEventListener('click', () => showVideo(file, list));
        }
      } else {
        row = element('a', 'entry entry-clickable');
        row.href = file.mediaUrl;
        row.target = '_blank';
        row.rel = 'noopener';
      }
      const icons = { image: '▧', audio: '♪', video: '▶', other: '·' };
      row.append(element('span', 'entry-icon', icons[file.mediaType] || '·'));
      const copy = element('div', 'entry-copy');
      copy.append(element('strong', '', file.name), element('small', '', `${file.mediaType} · ${formatBytes(file.size)}`));
      row.append(copy);
      list.append(row);
    }
    container.append(list);
  }

  if (!directories.length && !files.length) container.append(element('p', 'empty', '이 폴더는 비어 있습니다.'));
}

async function renderHome() {
  app.replaceChildren(element('p', 'loading', '메뉴를 불러오는 중…'));
  const { menus } = await api('/api/menus');
  const content = document.createDocumentFragment();
  content.append(heading('Personal media', '내 Castle', '같은 네트워크에서 미디어 폴더를 탐색합니다.'));
  if (!menus.length) {
    content.append(element('p', 'empty', 'Castle 루트에 메뉴 폴더를 추가해 주세요.'));
  } else {
    const grid = element('div', 'menu-grid');
    for (const menu of menus) {
      const button = element('button', 'menu-tile', menu.title);
      button.type = 'button';
      button.addEventListener('click', () => navigate('menu', menu.path));
      grid.append(button);
    }
    content.append(grid);
  }
  app.replaceChildren(content);
  document.title = 'Castle';
}

async function renderMenu(path) {
  app.replaceChildren(element('p', 'loading', '카드를 불러오는 중…'));
  const data = await api(`/api/item?path=${encodeURIComponent(path)}`);
  const content = document.createDocumentFragment();
  content.append(renderBreadcrumb(data.menu.breadcrumb));
  content.append(heading('Library', data.menu.title, `${data.cards.length}개 항목`));
  if (data.cards.length) {
    const cards = element('div', 'card-list');
    for (const card of data.cards) {
      const button = element('button', 'media-card');
      button.type = 'button';
      const image = document.createElement('img');
      image.src = card.thumbnailUrl;
      image.alt = '';
      image.loading = 'lazy';
      const copy = element('span', 'card-copy');
      copy.append(element('strong', '', card.title));
      if (card.description) copy.append(element('p', '', card.description));
      const metadata = [
        card.artist,
        card.type,
        `미디어 ${card.mediaCount}개`,
        card.rating ? `등급 ${card.rating}` : '',
      ].filter(Boolean).join(' · ');
      copy.append(element('span', 'meta-line', metadata));
      button.append(image, copy);
      button.addEventListener('click', () => navigate('browse', card.path));
      cards.append(button);
    }
    content.append(cards);
  } else if (!data.menu.entries.length) {
    content.append(element('p', 'empty', '이 메뉴에는 아직 항목이 없습니다.'));
  }

  const looseFiles = data.menu.entries.filter((entry) => entry.kind === 'file');
  if (looseFiles.length) renderEntries({ ...data.menu, entries: looseFiles }, content);
  app.replaceChildren(content);
  document.title = `${data.menu.title} · Castle`;
}

async function renderBrowse(path) {
  app.replaceChildren(element('p', 'loading', '폴더를 불러오는 중…'));
  const browse = await api(`/api/browse?path=${encodeURIComponent(path)}`);
  const content = document.createDocumentFragment();
  content.append(renderBreadcrumb(browse.breadcrumb));
  const metadata = [
    browse.artist,
    browse.type,
    `미디어 ${browse.mediaCount}개`,
    browse.rating ? `등급 ${browse.rating}` : '',
  ].filter(Boolean).join(' · ');
  content.append(heading('Explorer', browse.title, browse.description || '읽기 전용 폴더 탐색', {
    thumbnailUrl: browse.thumbnailUrl,
    compact: true,
    metadata,
  }));
  renderEntries(browse, content);
  app.replaceChildren(content);
  document.title = `${browse.title} · Castle`;
}

async function route() {
  window.scrollTo({ top: 0 });
  const hash = location.hash.slice(1);
  try {
    if (hash.startsWith('menu=')) await renderMenu(decodeURIComponent(hash.slice(5)));
    else if (hash.startsWith('browse=')) await renderBrowse(decodeURIComponent(hash.slice(7)));
    else await renderHome();
    return true;
  } catch (error) {
    app.replaceChildren(element('p', 'error', error.message || '화면을 불러오지 못했습니다.'));
    return false;
  }
}

async function refreshLibrary() {
  if (refreshButton.disabled) return;
  clearTimeout(refreshResetTimer);
  refreshButton.disabled = true;
  refreshButton.textContent = '새로고침 중…';
  refreshButton.removeAttribute('title');
  try {
    await api('/api/refresh', { method: 'POST' });
    if (!await route()) throw new Error('새로고침 후 화면을 다시 불러오지 못했습니다.');
    refreshButton.textContent = '새로고침 완료';
  } catch (error) {
    refreshButton.textContent = '새로고침 실패';
    refreshButton.title = error.message || '라이브러리를 새로고치지 못했습니다.';
  } finally {
    refreshButton.disabled = false;
    refreshResetTimer = setTimeout(() => {
      refreshButton.textContent = '라이브러리 새로고침';
      refreshButton.removeAttribute('title');
    }, 1800);
  }
}

homeButton.addEventListener('click', () => navigate('', ''));
refreshButton.addEventListener('click', refreshLibrary);
previousTrack.addEventListener('click', () => {
  if (audioQueue.length) playTrack(audioQueue, (audioIndex - 1 + audioQueue.length) % audioQueue.length);
});
nextTrack.addEventListener('click', () => {
  if (audioQueue.length) playTrack(audioQueue, (audioIndex + 1) % audioQueue.length);
});
audioPlayer.addEventListener('ended', () => {
  if (audioQueue.length > 1) playTrack(audioQueue, (audioIndex + 1) % audioQueue.length);
});
window.addEventListener('hashchange', route);
route();
