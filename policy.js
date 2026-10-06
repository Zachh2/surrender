/* Shared by the browser and server. Philippine time is UTC+08:00. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;
  const RETENTION = 30 * DAY;
  const dateKey = (value) => new Date(new Date(value).getTime() + OFFSET).toISOString().slice(0, 10);
  function closeAt(value) {
    const time = new Date(value).getTime();
    const dayStart = Math.floor((time + OFFSET) / DAY) * DAY - OFFSET;
    const todayClose = dayStart + 18 * 3600000;
    return time < todayClose ? todayClose : todayClose + DAY;
  }
  function maintain(items, now = Date.now()) {
    return items.filter((r) => !r.demo && Number.isFinite(new Date(r.surrenderedAt).getTime())).map((r) => {
      const due = closeAt(r.surrenderedAt);
      return r.active && due <= now ? { ...r, active: false, returnedAt: new Date(due).toISOString(), autoClosed: true } : r;
    }).filter((r) => r.active || new Date(r.returnedAt || r.surrenderedAt).getTime() > now - RETENTION);
  }
  const api = { closeAt, maintain, dateKey, RETENTION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SurrenderPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
