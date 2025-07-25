const LoggerHelper = require('./logger');
const DateHelper = require('./dateHelper');

class CronLogger {
  constructor() {
    this.jobs = new Map();
  }

  // Cron job başlangıcını logla
  startJob(jobName, schedule = '') {
    const startTime = DateHelper.createDate();
    this.jobs.set(jobName, {
      startTime,
      schedule,
      status: 'running'
    });

    LoggerHelper.logInfo('cron', `[${jobName}] Cron job started${schedule ? ` (Schedule: ${schedule})` : ''}`);
  }

  // Cron job sonucunu logla
  endJob(jobName, status = 'success', details = {}) {
    const job = this.jobs.get(jobName);
    if (!job) {
      LoggerHelper.logWarning('cron', `[${jobName}] No start record found for this job`);
      return;
    }

    const endTime = DateHelper.createDate();
    const duration = endTime - job.startTime;
    
    const logData = {
      jobName,
      startTime: job.startTime,
      endTime,
      duration: `${duration}ms`,
      status,
      ...details
    };

    if (status === 'success') {
      LoggerHelper.logSuccess('cron', `[${jobName}] Completed in ${duration}ms`, logData);
    } else if (status === 'error') {
      LoggerHelper.logError('cron', new Error(details.error || 'Unknown error'), `[${jobName}] Failed`, logData);
    } else if (status === 'skipped') {
      LoggerHelper.logWarning('cron', `[${jobName}] Skipped: ${details.reason || 'Unknown reason'}`, logData);
    }

    this.jobs.delete(jobName);
  }

  // Cron job check logla (çalışma zamanı kontrolü için)
  logCheck(jobName, shouldRun, reason = '') {
    if (shouldRun) {
      LoggerHelper.logInfo('cron', `[${jobName}] Check passed - Job will run`);
    } else {
      LoggerHelper.logInfo('cron', `[${jobName}] Check failed - Job will not run${reason ? `: ${reason}` : ''}`);
    }
  }

  // Cron job istatistiklerini logla
  logStats(jobName, stats) {
    LoggerHelper.logInfo('cron', `[${jobName}] Stats`, stats);
  }

  // Periyodik durum raporu
  getStatus() {
    const runningJobs = Array.from(this.jobs.entries())
      .filter(([_, job]) => job.status === 'running')
      .map(([name, job]) => ({
        name,
        startTime: job.startTime,
        runningFor: `${DateHelper.createDate() - job.startTime}ms`
      }));

    return {
      runningJobs: runningJobs.length,
      jobs: runningJobs
    };
  }
}

module.exports = new CronLogger();