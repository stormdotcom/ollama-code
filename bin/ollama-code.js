#!/usr/bin/env node

import { runCli } from '../src/index.js';

runCli(process.argv.slice(2)).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
