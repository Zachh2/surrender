'use strict';
// Vercel invokes this per request. There is no listen(), local JSON file or timer.
module.exports = require('../lib/handler').createHandler();
