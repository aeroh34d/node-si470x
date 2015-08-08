var si470x = require('./index.js')({interruptPin: 7});

var was = si470x.getChannel(true);
si470x.seekUp();
var is = si470x.getChannel(true);

console.log(is !== was);

