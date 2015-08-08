var rpio = require('rpio'),
    async = require('async'),
    _ = require('lodash');

var writeReg = new Buffer(11);
var readReg = new Buffer(32);
var reg = new Array(16);
var interruptPin = false;

module.exports = function(cfg) {
  cfg = cfg || {};

  cfg = _.defaults(cfg, {
    slaveAddress: 0x68,
    baudRate: 100000,
    clockDivider: 2500,
    interruptPin: false,
    mode: 'gpio'
  });
  
  if (cfg.interruptPin) {
    // TODO validate mode
    rpio.setMode(cfg.mode);
    // TODO validate interruptPin
    rpio.setInput(cfg.interruptPin);
  }

  rpio.i2cBegin();
  rpio.i2cSetSlaveAddress(cfg.slaveAddress);
  rpio.i2cSetBaudRate(cfg.baudRate);
  rpio.i2cSetClockDivider(cfg.clockDivider);
  
  read();

  return {
    seekUp: tune(true),
    seekDown: tune(false)
  };
};

function tune(seekUp) {
  return function(threshold, cb) {
    cb = _.isFunction(threshold) ? threshold : _.isFunction(cb) ? cb : _.identity;
    threshold = _.isNumber(threshold) ? threshold * 1.28 : 64;
    reg[2] &= ~0x0400;
    if (seekUp) {
      reg[2] |= 0x0200;
    }
    reg[2] |= 0x0100;
    write();
    
    if (interruptPin) {
      return waitForInterrupt(function() {
        read();
        cb();
      });
    }
    
    return waitForSTC(function() {
      read();
      cb();
    });
  };
}

function read() {
  readReg = rpio.i2cRead(32);
  reg[10] = readReg[0] * 256 + readReg[1];
  reg[11] = readReg[2] * 256 + readReg[3];
  reg[12] = readReg[4] * 256 + readReg[5];
  reg[13] = readReg[6] * 256 + readReg[7];
  reg[14] = readReg[8] * 256 + readReg[9];
  reg[15] = readReg[10] * 256 + readReg[11];
  reg[0] = readReg[12] * 256 + readReg[13];
  reg[1] = readReg[14] * 256 + readReg[15];
  reg[2] = readReg[16] * 256 + readReg[17];
  reg[3] = readReg[18] * 256 + readReg[19];
  reg[4] = readReg[20] * 256 + readReg[21];
  reg[5] = readReg[22] * 256 + readReg[23];
  reg[6] = readReg[24] * 256 + readReg[25];
  reg[7] = readReg[26] * 256 + readReg[27];
  reg[8] = readReg[28] * 256 + readReg[29];
  reg[9] = readReg[30] * 256 + readReg[31];
}

function write() {
  var cmd = (reg[2] & 0xFF00) >> 8;
  writeReg[0] = reg[2] & 0xFF;
  writeReg[1] = (reg[3] & 0xFF00) >> 8;
  writeReg[2] = reg[3] & 0xFF;
  writeReg[3] = (reg[4] & 0xFF00) >> 8;
  writeReg[4] = reg[4] & 0xFF;
  writeReg[5] = (reg[5] & 0xFF00) >> 8;
  writeReg[6] = reg[5] & 0xFF;
  writeReg[7] = (reg[6] & 0xFF00) >> 8;
  writeReg[8] = reg[6] & 0xFF;
  writeReg[9] = (reg[7] & 0xFF00) >> 8;
  writeReg[10] = reg[7] & 0xFF;
  
  rpio.i2cWrite(writeReg, 11);
  readReg[16] = cmd;
  read();
}

function waitForInterrupt(cb) {
  if (rpio.read(interruptPin)) {
    return cb();
  }
  setTimeout(_.partial(waitForInterrupt, cb), 10);
}

function waitForSTC(cb) {
  read();
  if (reg[8] & 0x4000) {
    return cb();
  }
  setTimeout(_.partial(waitForSTC, cb), 10);
}

process.on('exit', function() {
  rpio.i2cEnd();
});
