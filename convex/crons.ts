import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run sync scheduler every 15 minutes
crons.interval(
  "sync-scheduler",
  { minutes: 15 },
  internal.scheduler.runDueSyncs
);

export default crons;
