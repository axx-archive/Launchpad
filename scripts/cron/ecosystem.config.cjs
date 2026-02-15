/**
 * PM2 Ecosystem Config — Launchpad Automation Cron Jobs
 *
 * Usage:
 *   pm2 start scripts/cron/ecosystem.config.cjs
 *   pm2 status
 *   pm2 logs mission-scanner
 *   pm2 stop all
 *
 * Each script runs on a cron schedule and exits after completion.
 * autorestart: false prevents PM2 from restarting after exit.
 * cron_restart triggers the next run on schedule.
 */

module.exports = {
  apps: [
    {
      name: "mission-scanner",
      script: "mission-scanner.mjs",
      cwd: __dirname,
      cron_restart: "*/15 * * * *",   // Every 15 minutes
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
    {
      name: "health-monitor",
      script: "health-monitor.mjs",
      cwd: __dirname,
      cron_restart: "0 */6 * * *",    // Every 6 hours
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
    {
      name: "approval-watcher",
      script: "approval-watcher.mjs",
      cwd: __dirname,
      cron_restart: "*/5 * * * *",    // Every 5 minutes
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
    {
      name: "pipeline-executor",
      script: "pipeline-executor.mjs",
      cwd: __dirname,
      autorestart: true,              // Keep alive — polls internally every 2 min
      watch: false,
      max_memory_restart: "1G",       // Opus responses can be large
      kill_timeout: 600000,           // 10 min grace period for in-flight API calls
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
    {
      name: "signal-ingester",
      script: "signal-ingester.mjs",
      cwd: __dirname,
      autorestart: true,              // Keep alive — polls internally every 60s
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
    {
      name: "velocity-calculator",
      script: "velocity-calculator.mjs",
      cwd: __dirname,
      cron_restart: "0 6 * * *",      // Daily at 6 AM UTC
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
    {
      name: "learning-aggregator",
      script: "learning-aggregator.mjs",
      cwd: __dirname,
      cron_restart: "0 3 * * 0",      // Weekly: Sunday 3 AM UTC
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production",
        AUTOMATION_ENABLED: "true",
      },
    },
  ],
};
