import { internalAction, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

const SCHEDULE_INTERVALS: Record<string, number> = {
  "15min": 15 * 60 * 1000,
  "1hour": 60 * 60 * 1000,
  "4hours": 4 * 60 * 60 * 1000,
  "daily": 24 * 60 * 60 * 1000,
  manual: Infinity,
};

export const getDueConnections = internalQuery({
  handler: async (ctx) => {
    const connections = await ctx.db.query("connections").collect();
    const now = Date.now();

    return connections.filter((conn) => {
      if (!conn.isActive) return false;
      if (conn.syncStatus === "syncing") return false;
      if (conn.syncSchedule === "manual") return false;

      const interval = SCHEDULE_INTERVALS[conn.syncSchedule] || Infinity;
      const lastSync = conn.lastSyncAt || 0;

      return now - lastSync >= interval;
    });
  },
});

export const runDueSyncs = internalAction({
  handler: async (ctx) => {
    const dueConnections = await ctx.runQuery(internal.scheduler.getDueConnections);

    for (const conn of dueConnections) {
      try {
        // Run sync
        await ctx.runAction(api.sync.syncConnection, {
          connectionId: conn._id,
        });

        // Run export
        await ctx.runAction(api.sheets.exportToSheets, {
          connectionId: conn._id,
        });
      } catch (error) {
        console.error(`Sync failed for connection ${conn._id}:`, error);
      }
    }
  },
});
