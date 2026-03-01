#!/usr/bin/env node

const argv = process.argv.slice(2);
const isServe = argv.includes('--serve') || argv.includes('-s');

if (isServe) {
  import('../src/webServer.js').then(({ runServe }) =>
    runServe(argv).catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    })
  );
} else {
  import('../src/index.js').then(({ runCli }) =>
    runCli(argv).catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    })
  );
}
