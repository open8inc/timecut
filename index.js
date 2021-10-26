/**
 * BSD 3-Clause License
 *
 * Copyright (c) 2018-2021, Steve Tung
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of the copyright holder nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS'
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

const timesnap = require('timesnap');
const path = require('path');
const fs = require('fs');
const spawn = require('child_process').spawn;
const {
  makeFileDirectoryIfNeeded,
  deleteFolder,
  argumentArrayContains,
  parseProgressLine,
} = require('./helpers');

module.exports = async function (config) {
  config = Object.assign(
    {
      roundToEvenWidth: true,
      roundToEvenHeight: true,
      url: 'index.html',
      pixFmt: 'yuv420p',
      quiet: true,
    },
    config || {}
  );

  const output = path.resolve(process.cwd(), config.output || 'video.mp4');
  const frameMode = config.frameCache || !config.pipeMode;
  const pipeMode = config.pipeMode;
  const screenshotType = config.screenshotType || 'png';
  let ffmpegArgs;
  let inputOptions = config.inputOptions || [];
  let outputOptions = config.outputOptions || [];
  let frameDirectory = config.tempDir || config.frameDir;
  let processError, outputPattern, convertProcess, processPromise;

  if (frameMode) {
    if (!frameDirectory) {
      frameDirectory =
        'timecut-' +
        (config.keepFrames ? 'frames-' : 'temp-') +
        new Date().getTime();
    }

    if (typeof config.frameCache === 'string')
      frameDirectory = path.join(config.frameCache, frameDirectory);

    frameDirectory = path.resolve(path.parse(output).dir, frameDirectory);
    outputPattern = path.resolve(
      frameDirectory,
      `image-%09d.${screenshotType}`
    );
  } else {
    outputPattern = '';
  }

  const timesnapConfig = Object.assign({}, config, {
    output: '',
    outputPattern: outputPattern,
  });

  const fps = () => {
    if (config.fps) return config.fps;
    if (config.frames && config.duration)
      return config.frames / config.duration;
    return 60;
  };

  const makeProcessPromise = function () {
    makeFileDirectoryIfNeeded(output);
    const input = pipeMode ? 'pipe:0' : outputPattern;
    ffmpegArgs = inputOptions;

    if (!argumentArrayContains(inputOptions, '-framerate'))
      ffmpegArgs = ffmpegArgs.concat(['-framerate', fps()]);

    if (pipeMode && (screenshotType === 'jpeg' || screenshotType === 'jpg')) {
      // piping jpegs with the other method can cause an error
      // this is intended to fix that
      ffmpegArgs = ffmpegArgs.concat([
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-i',
        '-',
      ]);
    } else {
      ffmpegArgs = ffmpegArgs.concat(['-i', input]);
    }

    if (!argumentArrayContains(outputOptions, '-pix_fmt') && config.pixFmt)
      ffmpegArgs = ffmpegArgs.concat(['-pix_fmt', config.pixFmt]);

    ffmpegArgs = ffmpegArgs.concat(outputOptions);
    if (config.outputStream) {
      let outputStreamOptions = config.outputStreamOptions || {};
      let outputStreamArgs = ['-f', outputStreamOptions.format || 'mp4'];
      let movflags = outputStreamOptions.movflags;

      if (movflags === undefined)
        movflags = 'frag_keyframe+empty_moov+faststart';

      if (movflags)
        outputStreamArgs = outputStreamArgs.concat(['-movflags', movflags]);

      ffmpegArgs = ffmpegArgs.concat(outputStreamArgs).concat(['pipe:1']);
    } else {
      // by default just write out the file
      // -y writes over existing files
      ffmpegArgs = ffmpegArgs.concat(['-y', output]);
    }

    convertProcess = spawn('ffmpeg', ffmpegArgs);
    convertProcess.stderr.setEncoding('utf8');
    convertProcess.stderr.on('data', function (data) {
      const totalFrames = config.fps * config.duration;
      parseProgressLine(data, totalFrames);
    });

    return new Promise((resolve, reject) => {
      convertProcess.on('close', function () {
        console.log('FFMPEG compilation process has been completed');
        // Check if file has been created
        if (fs.existsSync(config.output)) resolve(config.output);
        else reject(new Error('File not created'));
      });

      convertProcess.on('error', function (err) {
        processError = err;
        reject(err);
      });

      convertProcess.stdin.on('error', function (err) {
        processError = err;
        reject(err);
      });

      if (config.outputStream) {
        convertProcess.stdout.on('error', function (err) {
          processError = err;
          reject(err);
        });
        convertProcess.stdout.pipe(config.outputStream);
      }
    });
  };

  if (pipeMode) {
    processPromise = makeProcessPromise();
    timesnapConfig.frameProcessor = function (buffer) {
      if (processError) throw processError;
      convertProcess.stdin.write(buffer);
    };
  }

  try {
    let videoOutput;
    await timesnap(timesnapConfig);
    if (convertProcess) convertProcess.stdin.end();
    videoOutput = processPromise
      ? await processPromise
      : await makeProcessPromise();
    if (frameMode && !config.keepFrames) deleteFolder(frameDirectory);

    return videoOutput;
  } catch (error) {
    throw error;
  }
};
