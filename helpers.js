const path = require('path');
const fs = require('fs');

const makeFileDirectoryIfNeeded = function (filepath) {
  var dir = path.parse(filepath).dir,
    ind,
    currDir;
  var directories = dir.split(path.sep);
  for (ind = 1; ind <= directories.length; ind++) {
    currDir = directories.slice(0, ind).join(path.sep);
    if (currDir && !fs.existsSync(currDir)) {
      fs.mkdirSync(currDir);
    }
  }
};

const deleteFolder = function (dir) {
  fs.readdirSync(dir).forEach(function (file) {
    fs.unlinkSync(path.join(dir, file));
  });
  fs.rmdirSync(dir);
};

const argumentArrayContains = function (args, item) {
  return args.reduce(function (accumulator, currentValue) {
    return (
      accumulator ||
      currentValue === item ||
      currentValue.startsWith(item + '=')
    );
  }, false);
};

const parseProgressLine = (data, totalFrames) => {
  const dataString = data.toString();
  const line = dataString.replace(/=\s+/g, '=').trim();
  const progressParts = line.split(' ');

  if (dataString.includes('frame=')) {
    for (var i = 0; i < progressParts.length; i++) {
      const progressSplit = progressParts[i].split('=', 2);
      const key = progressSplit[0];
      const value = progressSplit[1];

      if (typeof value !== 'undefined') {
        if (key === 'frame') {
          console.log(`Compiling current:${value} total:${totalFrames} frames`);
        }
      }
    }
  }
};

module.exports = {
  makeFileDirectoryIfNeeded,
  deleteFolder,
  argumentArrayContains,
  parseProgressLine,
};
