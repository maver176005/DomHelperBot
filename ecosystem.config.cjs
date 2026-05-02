module.exports = {
  apps: [
    {
      name: 'dom-helper-bot',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
