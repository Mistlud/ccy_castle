const app = document.querySelector('#app');
const homeButton = document.querySelector('#home-button');
const audioDock = document.querySelector('#audio-dock');
const audioPlayer = document.querySelector('#audio-player');
const audioTitle = document.querySelector('#audio-title');
const previousTrack = document.querySelector('#previous-track');
const nextTrack = document.querySelector('#next-track');

let audioQueue = [];
let audioIndex = -1;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 403 ? '허용되지 않은 경로입니다.' : '요청한 항목을 불러올 수 없습니다.');
  return response.json();
}

function navigate(kind, path = '') {
  const target = path ? `${kind}=${encodeURIComponent(path)}` : '';
  if (location.hash.slice(1) === target) route();
  else location.hash = target;
}

function heading(eyebrow, title, description) {
  const wrapper = element('header', 'page-heading');
  wrapper.append(element('span', 'eyebrow', eyebrow), element('h1', '', title));
  if (description) wrapper.append(element('p', '', description));
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
      const row = element('article', 'entry');
      row.append(element('span', 'entry-icon', '▰'));
      const copy = element('div', 'entry-copy');
      copy.append(element('strong', '', directory.name), element('small', '', '폴더'));
      const open = element('button', 'entry-action', '열기');
      open.type = 'button';
      open.addEventListener('click', () => navigate('browse', directory.path));
      row.append(copy, open);
      list.append(row);
    }
    container.append(list);
  }

  if (files.length) {
    container.append(element('h2', 'section-title', '파일'));
    const list = element('div', 'entry-list');
    const audioFiles = files.filter((file) => file.mediaType === 'audio');
    for (const file of files) {
      const row = element('article', 'entry');
      const icons = { image: '▧', audio: '♪', video: '▶', other: '·' };
      row.append(element('span', 'entry-icon', icons[file.mediaType] || '·'));
      const copy = element('div', 'entry-copy');
      copy.append(element('strong', '', file.name), element('small', '', `${file.mediaType} · ${formatBytes(file.size)}`));
      let action;
      if (file.mediaType === 'audio') {
        action = element('button', 'entry-action', '재생');
        action.type = 'button';
        action.addEventListener('click', () => playTrack(audioFiles, audioFiles.findIndex((track) => track.path === file.path)));
      } else if (file.mediaType === 'video') {
        action = element('button', 'entry-action', '재생');
        action.type = 'button';
        action.addEventListener('click', () => showVideo(file, list));
      } else {
        action = element('a', 'entry-action', file.mediaType === 'image' ? '보기' : '열기');
        action.href = file.mediaUrl;
        action.target = '_blank';
        action.rel = 'noopener';
      }
      row.append(copy, action);
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
  content.append(heading('Explorer', browse.title, '읽기 전용 폴더 탐색'));
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
  } catch (error) {
    app.replaceChildren(element('p', 'error', error.message || '화면을 불러오지 못했습니다.'));
  }
}

homeButton.addEventListener('click', () => navigate('', ''));
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
