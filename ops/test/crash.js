// A bot that dies at once, for testing the supervisor's restarts and crash alert (crashy.json).
console.log('crashy: starting');
console.error('crashy: failed on purpose, token Bot abcdefghijklmnopqrstuvwx.ABCDEF.abcdefghijklmnopqrstuvwxyz0');
process.exit(3);
