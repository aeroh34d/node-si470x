var rpio = require('rpio'),
    async = require('async'),
    _ = require('lodash');

var writeReg = new Buffer(11);
var readReg = new Buffer(32);
var reg = new Array(16);
var interruptPin = null;

/**
 * 
 * @param cfg [Object] Configuration object with any of the following properties:
 *     * slaveAddress [Number] i2c slave address (default 0x10)
 *     * baudRate [Number] i2c baud rate in Hertz (default 100kHz)
 *     * clockDivider [Number] divider of 250MHz to set clock speed (default 2500 -> clock speed = 100kHz)
 *     * interruptPin [Number] number of the GPIO pin for interrupts (default false -> don't use interrupts)
 *     * mode [String] 'gpio' or 'physical', the numbering scheme to use to identify interruptPin
 * @returns si470x controller
 */
module.exports = function(cfg) {
  cfg = cfg || {};

  // Provide some likely defaults
  cfg = _.defaults(cfg, {
    slaveAddress: 0x10, // consumed by rpio
    baudRate: 100000, // consumed by rpio
    clockDivider: 2500, // consumed by rpio
    interruptPin: null, // setting interruptPin implies interrupt mode is on
    mode: 'gpio' // 'gpio' or 'physical', consumed by rpio
  });
  
  // If interrupt mode is on, set up the interruptPin
  if (cfg.interruptPin !== null) {
    // TODO validate mode
    rpio.setMode(cfg.mode);
    // TODO validate interruptPin
    rpio.setInput(cfg.interruptPin);
  }

  // Start up i2c and set config
  rpio.i2cBegin();
  rpio.i2cSetSlaveAddress(cfg.slaveAddress);
  rpio.i2cSetBaudRate(cfg.baudRate);
  rpio.i2cSetClockDivider(cfg.clockDivider);
  
  // Read first to initialize local shadow of registers
  read();
  
  // If interrupt mode is on, tell the chip
  if (cfg.interruptPin !== null) {
    reg[0x04] &= ~0x0C;
    reg[0x04] |= 0x04;
    write();
  }
  
  // Turn on oscillator
  reg[0x07] = 0x8100;
  write();
  
  // Turn on IC and unmute
  reg[0x02] = 0x4001;
  write();
  
  // Expose API
  return {
    seekUp: tune(true),
    seekDown: tune(false),
    getChannel: getChannel
  };
};

/**
 * A wrapper for seek functions that provides the direction to seek.
 *
 * @param seekUp [Boolean] whether the generated seek function should seek up
 * @returns the actual seek function
 */
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
    
    return onTuneComplete(function() {
      read();
      return cb();
    });
  };
}

/**
 * Gets the current channel.
 *
 * @param skipRead [Boolean] [optional] If true, just read the channel from the shadow registers...don't require an additional read.
 * @returns the current channel in MHz (i.e. 101.1)
 */
function getChannel(skipRead) {
  if (!skipRead) {
    read();
  }
  return ((reg[0x0b] & 0x03ff) * 2 + 875) / 10;
}

/**
 * Calls cb when a tuning operation is complete. If interrupt mode is on, this is signified by an interrupt. Otherwise, it is signified by STC going high.
 *
 * @param cb [Function] function to call upon completion of the tuning operation
 */
function onTuneComplete(cb) {
    if (interruptPin !== null) {
      return onInterrupt(cb);
    }
    
    return onSTC(cb);
}

/**
 * Read all registers and store their bytes in local shadow "reg"
 */
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

/**
 * Write the values in reg[2] through reg[7] to the Si470x's corresponding registers
 */
function write() {
  // This part's tricky. The top byte of register 0x02 is for commands, so must be treated differently.
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
  
  // Write the 11 bytes into the bottom of 0x02 through 0x07
  rpio.i2cWrite(writeReg, 11);
  readReg[16] = cmd; // not sure why this is important....
  
  // Immediately read to ensure that reg is correct
  read();
}

/**
 * Call cb when an interrupt occurs on interruptPin.
 *
 * @param cb [Function] callback on interrupt
 */
function onInterrupt(cb) {
  // Check for an interrupt
  if (rpio.read(interruptPin)) {
    return cb();
  }
  // If it's not high yet, check back in ~5ms
  setTimeout(_.partial(onInterrupt, cb), 5);
}

/**
 * Call cb when STC goes high.
 *
 * @param cb [Function] callback when STC goes high
 */
function onSTC(cb) {
  // Check for STC high -- requires a full read of the i2c registers, so interrupt is better!
  read();
  if (reg[10] & 0x4000) {
    return cb();
  }
  // If it's not high yet, check back in 10ms
  setTimeout(_.partial(onSTC, cb), 10);
}

// Attempt to nicely shutdown the i2c config
process.on('exit', function() {
  rpio.i2cEnd();
});
