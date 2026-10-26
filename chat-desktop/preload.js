'use strict';

// Мост между страницей оверлея и главным процессом:
// нужен только для перетаскивания окна в режиме перемещения.

const { ipcRenderer } = require('electron');

let editMode = false;

ipcRenderer.on('edit-mode', function (event, enabled) {
  editMode = !!enabled;
});

window.addEventListener('mousedown', function (event) {
  if (!editMode || event.button !== 0) return;
  event.preventDefault();
  ipcRenderer.send('overlay-drag-start', { x: event.screenX, y: event.screenY });
});

window.addEventListener('mouseup', function () {
  if (!editMode) return;
  ipcRenderer.send('overlay-drag-end');
});

window.addEventListener('mouseleave', function () {
  if (!editMode) return;
  ipcRenderer.send('overlay-drag-end');
});
