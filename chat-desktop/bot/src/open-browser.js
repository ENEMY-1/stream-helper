'use strict';

const { spawn } = require('node:child_process');

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      // rundll32 не пропускает URL через cmd, поэтому '&' в ссылке не ломает её.
      spawn('rundll32', ['url.dll,FileProtocolHandler', url], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      return true;
    }
    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = { openBrowser: openBrowser };
