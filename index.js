var rpio = require('rpio'),
    async = require('async'),
    _ = require('lodash');

modules.exports = function(cfg) {

  _.defaults(cfg, {
    slaveAddress: 0x68,
    baudRate: 100000,
    clockDivider: 2500
  });

  rpio.i2cBegin();
  rpio.setSlaveAddress(cfg.slaveAddress);
  rpio.setBaudRate(cfg.baudRate);
  rpio.setClockDivider(cfg.clockDivider);

  return {
    
  };
}



process.on('end', function() {
  console.log('ending nicely');
  rpio.i2cEnd();
});
