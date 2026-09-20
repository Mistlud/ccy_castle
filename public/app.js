const app = document.querySelector('#app');
const homeButton = document.querySelector('#home-button');
const refreshButton = document.querySelector('#refresh-library');
const audioDock = document.querySelector('#audio-dock');
const audioPlayer = document.querySelector('#audio-player');
const audioTitle = document.querySelector('#audio-title');
const audioTitleCollapsed = document.querySelector('#audio-title-collapsed');
const audioThumbnail = document.querySelector('#audio-thumbnail');
const audioThumbnailCollapsed = document.querySelector('#audio-thumbnail-collapsed');
const audioFolderTitleCollapsed = document.querySelector('#audio-folder-title-collapsed');
const audioPlaylist = document.querySelector('#audio-playlist');
const audioPlaylistItems = document.querySelector('#audio-playlist-items');
const audioSeek = document.querySelector('#audio-seek');
const audioCurrentTime = document.querySelector('#audio-current-time');
const audioDuration = document.querySelector('#audio-duration');
const audioVolume = document.querySelector('#audio-volume');
const expandedPlayer = document.querySelector('#expanded-player');
const collapsedPlayer = document.querySelector('#collapsed-player');
const collapsePlayerHandle = document.querySelector('#player-collapse-handle');
const expandPlayerHandle = document.querySelector('#player-expand-handle');
const previousTrack = document.querySelector('#previous-track');
const nextTrack = document.querySelector('#next-track');
const compactPreviousTrack = document.querySelector('#compact-previous-track');
const compactNextTrack = document.querySelector('#compact-next-track');
const compactTogglePlayback = document.querySelector('#compact-toggle-playback');
const togglePlayback = document.querySelector('#toggle-playback');
const toggleMute = document.querySelector('#toggle-mute');
const togglePlaylist = document.querySelector('#toggle-playlist');
const playlistControlLabel = document.querySelector('#playlist-control-label');
const cyclePlaybackMode = document.querySelector('#cycle-playback-mode');
const playbackModeSymbol = document.querySelector('#playback-mode-symbol');
const playbackModeLabel = document.querySelector('#playback-mode-label');
const goToAudioFolder = document.querySelector('#go-to-audio-folder');

let audioQueue = [];
let audioIndex = -1;
let audioFolder = null;
let playbackMode = 'continuous';
let lastAudibleVolume = 1;
let audioTitleFrame;
let refreshResetTimer;
let suppressHandleClick = false;

const playbackModes = {
  continuous: { next: 'stop', symbol: '∞', label: '연속 재생', shortLabel: '연속' },
  stop: { next: 'repeat-one', symbol: '■', label: '한 곡 후 정지', shortLabel: '정지' },
  'repeat-one': { next: 'continuous', symbol: '↻1', label: '한 곡 반복', shortLabel: '한곡' },
};

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

function formatPlaybackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainder = wholeSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function updateAudioTitleOverflow() {
  cancelAnimationFrame(audioTitleFrame);
  const titles = [audioTitle, audioTitleCollapsed];
  for (const title of titles) {
    title.classList.remove('is-overflowing');
    title.style.removeProperty('--track-title-shift');
    title.style.removeProperty('--track-title-duration');
  }
  audioTitleFrame = requestAnimationFrame(() => {
    for (const title of titles) {
      const shift = Math.ceil(title.scrollWidth - title.clientWidth);
      if (shift <= 1) continue;
      title.style.setProperty('--track-title-shift', `${shift}px`);
      title.style.setProperty('--track-title-duration', `${Math.max(6, shift / 24 + 3)}s`);
      title.classList.add('is-overflowing');
    }
  });
}

function updatePlayerTime() {
  const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
  const currentTime = Number.isFinite(audioPlayer.currentTime) ? audioPlayer.currentTime : 0;
  audioSeek.max = String(duration);
  audioSeek.value = String(Math.min(currentTime, duration || 0));
  audioSeek.disabled = duration <= 0;
  audioCurrentTime.textContent = formatPlaybackTime(currentTime);
  audioDuration.textContent = duration > 0 ? formatPlaybackTime(duration) : '--:--';
}

function updatePlaybackButton() {
  const isPlaying = !audioPlayer.paused && !audioPlayer.ended;
  togglePlayback.textContent = isPlaying ? 'Ⅱ' : '▶';
  togglePlayback.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
  compactTogglePlayback.textContent = isPlaying ? 'Ⅱ' : '▶';
  compactTogglePlayback.setAttribute('aria-label', isPlaying ? '일시정지' : '재생');
}

function updateVolumeControls() {
  if (audioPlayer.volume > 0) lastAudibleVolume = audioPlayer.volume;
  const silent = audioPlayer.muted || audioPlayer.volume === 0;
  audioVolume.value = String(audioPlayer.volume);
  toggleMute.textContent = silent ? '×♪' : '♪';
  toggleMute.setAttribute('aria-label', silent ? '음소거 해제' : '음소거');
  toggleMute.setAttribute('aria-pressed', String(audioPlayer.muted));
}

function updatePlaybackMode() {
  const mode = playbackModes[playbackMode];
  playbackModeSymbol.textContent = mode.symbol;
  playbackModeLabel.textContent = mode.shortLabel;
  cyclePlaybackMode.title = mode.label;
  cyclePlaybackMode.setAttribute('aria-label', `재생 모드: ${mode.label}. 눌러서 변경`);
  cyclePlaybackMode.dataset.mode = playbackMode;
}

function setPlaylistVisible(visible) {
  audioPlaylist.hidden = !visible;
  audioThumbnail.hidden = visible;
  togglePlaylist.setAttribute('aria-pressed', String(visible));
  togglePlaylist.setAttribute('aria-label', visible ? '재생목록 닫기' : '재생목록 열기');
  playlistControlLabel.textContent = visible ? '닫기' : '목록';
  if (visible) {
    requestAnimationFrame(() => {
      const current = audioPlaylistItems.querySelector('[aria-current="true"]');
      if (current) {
        audioPlaylist.scrollTop = Math.max(0, current.offsetTop - (audioPlaylist.clientHeight - current.clientHeight) / 2);
      }
    });
  }
}

function renderAudioPlaylist() {
  const items = document.createDocumentFragment();
  audioQueue.forEach((track, index) => {
    const item = document.createElement('li');
    const button = element('button');
    button.type = 'button';
    button.title = track.name;
    if (index === audioIndex) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      playTrack(audioQueue, index, audioFolder);
      setPlaylistVisible(false);
    });
    button.append(element('span', 'playlist-track-name', track.name));
    item.append(button);
    items.append(item);
  });
  audioPlaylistItems.replaceChildren(items);
}

function setPlayerExpanded(expanded) {
  audioDock.classList.toggle('is-expanded', expanded);
  expandedPlayer.hidden = !expanded;
  collapsePlayerHandle.hidden = !expanded;
  collapsedPlayer.hidden = expanded;
  expandPlayerHandle.setAttribute('aria-expanded', String(expanded));
  document.body.classList.toggle('player-expanded', expanded);
  audioDock.style.removeProperty('--player-drag-y');
  requestAnimationFrame(updateAudioTitleOverflow);
}

function playTrack(queue, index, folder = audioFolder, { expand = false } = {}) {
  audioQueue = queue;
  audioIndex = index;
  audioFolder = folder;
  const track = audioQueue[audioIndex];
  if (!track) return;
  const wasHidden = audioDock.hidden;
  audioDock.hidden = false;
  document.body.classList.add('has-audio-player');
  audioTitle.textContent = track.name;
  audioTitle.title = track.name;
  audioTitleCollapsed.textContent = track.name;
  audioTitleCollapsed.title = track.name;
  audioFolderTitleCollapsed.textContent = audioFolder?.title || '현재 폴더';
  audioFolderTitleCollapsed.title = audioFolder?.title || '';
  if (audioFolder?.thumbnailUrl) {
    audioThumbnail.src = audioFolder.thumbnailUrl;
    audioThumbnailCollapsed.src = audioFolder.thumbnailUrl;
  }
  audioThumbnail.alt = audioFolder?.title ? `${audioFolder.title} 썸네일` : '';
  audioThumbnailCollapsed.alt = audioFolder?.title ? `${audioFolder.title} 썸네일` : '';
  renderAudioPlaylist();
  if (expand) setPlaylistVisible(false);
  if (expand || wasHidden) setPlayerExpanded(true);
  updateAudioTitleOverflow();
  audioPlayer.src = track.mediaUrl;
  updatePlayerTime();
  audioPlayer.play().catch(() => {});
}

function playAdjacentTrack(offset) {
  if (!audioQueue.length) return;
  const index = (audioIndex + offset + audioQueue.length) % audioQueue.length;
  playTrack(audioQueue, index, audioFolder);
}

function bindPlayerHandle(handle, direction, expand) {
  let gesture = null;

  handle.addEventListener('click', () => {
    if (suppressHandleClick) return;
    setPlayerExpanded(expand);
  });

  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 };
    handle.setPointerCapture(event.pointerId);
    audioDock.classList.add('is-dragging');
  });

  handle.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const deltaX = event.clientX - gesture.x;
    const deltaY = event.clientY - gesture.y;
    if (Math.abs(deltaY) <= Math.abs(deltaX)) return;
    gesture.distance = direction === 'down' ? Math.max(0, deltaY) : Math.min(0, deltaY);
    audioDock.style.setProperty('--player-drag-y', `${gesture.distance}px`);
  });

  const finishGesture = (event, cancelled = false) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = !cancelled && Math.abs(gesture.distance) >= 56;
    if (completed) {
      suppressHandleClick = true;
      setPlayerExpanded(expand);
      setTimeout(() => { suppressHandleClick = false; }, 0);
    }
    audioDock.classList.remove('is-dragging');
    audioDock.style.removeProperty('--player-drag-y');
    gesture = null;
  };

  handle.addEventListener('pointerup', (event) => finishGesture(event));
  handle.addEventListener('pointercancel', (event) => finishGesture(event, true));
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
          row.addEventListener('click', () => playTrack(
            audioFiles,
            audioFiles.findIndex((track) => track.path === file.path),
            { path: browse.path, title: browse.title, thumbnailUrl: browse.thumbnailUrl },
            { expand: true },
          ));
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
previousTrack.addEventListener('click', () => playAdjacentTrack(-1));
nextTrack.addEventListener('click', () => playAdjacentTrack(1));
compactPreviousTrack.addEventListener('click', () => playAdjacentTrack(-1));
compactNextTrack.addEventListener('click', () => playAdjacentTrack(1));
function toggleAudioPlayback() {
  if (audioPlayer.paused) audioPlayer.play().catch(() => {});
  else audioPlayer.pause();
}
togglePlayback.addEventListener('click', toggleAudioPlayback);
compactTogglePlayback.addEventListener('click', toggleAudioPlayback);
audioSeek.addEventListener('input', () => {
  if (Number.isFinite(audioPlayer.duration)) audioPlayer.currentTime = Number(audioSeek.value);
  updatePlayerTime();
});
audioVolume.addEventListener('input', () => {
  audioPlayer.muted = false;
  audioPlayer.volume = Number(audioVolume.value);
});
toggleMute.addEventListener('click', () => {
  if (audioPlayer.muted || audioPlayer.volume === 0) {
    if (audioPlayer.volume === 0) audioPlayer.volume = lastAudibleVolume || 1;
    audioPlayer.muted = false;
  } else {
    audioPlayer.muted = true;
  }
});
togglePlaylist.addEventListener('click', () => setPlaylistVisible(audioPlaylist.hidden));
cyclePlaybackMode.addEventListener('click', () => {
  playbackMode = playbackModes[playbackMode].next;
  updatePlaybackMode();
});
goToAudioFolder.addEventListener('click', () => {
  if (!audioFolder) return;
  setPlayerExpanded(false);
  const kind = audioFolder.path.split('/').length === 1 ? 'menu' : 'browse';
  navigate(kind, audioFolder.path);
});
audioPlayer.addEventListener('loadedmetadata', updatePlayerTime);
audioPlayer.addEventListener('durationchange', updatePlayerTime);
audioPlayer.addEventListener('timeupdate', updatePlayerTime);
audioPlayer.addEventListener('play', updatePlaybackButton);
audioPlayer.addEventListener('pause', updatePlaybackButton);
audioPlayer.addEventListener('volumechange', updateVolumeControls);
audioPlayer.addEventListener('ended', () => {
  updatePlaybackButton();
  if (playbackMode === 'repeat-one') {
    audioPlayer.currentTime = 0;
    audioPlayer.play().catch(() => {});
  } else if (playbackMode === 'continuous' && audioQueue.length > 1) {
    playAdjacentTrack(1);
  }
});
bindPlayerHandle(collapsePlayerHandle, 'down', false);
bindPlayerHandle(expandPlayerHandle, 'up', true);
window.addEventListener('hashchange', route);
window.addEventListener('resize', updateAudioTitleOverflow);
updatePlaybackMode();
updatePlaybackButton();
updateVolumeControls();
route();
