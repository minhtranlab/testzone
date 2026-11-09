// Where the harness finds the app source and keeps its generated build (git-ignored tests/.work).
const path = require('path');
module.exports = {
  APP: process.env.APP_DIR || path.join(__dirname, '..', 'src'),
  WORK: process.env.WORK_DIR || path.join(__dirname, '.work')
};
