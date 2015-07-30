//var si470x = require('./index')();
var _ = require('lodash');

process.stdin.setEncoding('utf8');

function printInstructions() {
  process.stdout.write(_.once(function(){return[
    '  +/-) Change volume',
    '  >/<) Seek up/down',
    '  =##) Tune to station ## (i.e. 101.1)',
    '  ~##) Set seek threshold to ## (0-99)',
    '    *) Reset',
    '  q/0) Quit',
    '',
    'Please enter a command: '
  ].join('\n');})());
}

function loop() {
  printInstructions();
  readAndProcess();
}

function readAndProcess() {
  process.stdin.once('readable', function() {
    var chunk = process.stdin.read();
    if (chunk === null) return readAndProcess();

    chunk = chunk.toString().match(/\w*/)[0];
    if (chunk === '0' || chunk === 'q' || chunk === 'Q') {
      process.stdout.write('\nGoodbye!\n');
      return;
    }
    if (chunk === '+') {
      si470x.incrementVolume();
    } else if (chunk === '-') {
      si470x.decrementVolume();
    } else if (chunk === '>') {
      si470x.seekUp();
    } else if (chunk === '<') {
      si470x.seekDown();
    } else if (chunk.startsWith('=')) {
      var station = chunk.substr(1);
      si470x.tune(station);
    } else if (chunk.startsWith('~')) {
      var threshold = chunk.substr(1);
      si470x.setTuneThreshold(threshold);
    } else if (chunk === '*') {
      si470x.reset();
    }

    loop();
    
  });
}

loop();
