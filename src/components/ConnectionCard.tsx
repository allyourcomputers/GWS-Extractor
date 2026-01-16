import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

interface ConnectionCardProps {
  connection: Doc<"connections">;
  addressCount: number;
  onEdit: () => void;
}

export default function ConnectionCard({
  connection,
  addressCount,
  onEdit,
}: ConnectionCardProps) {
  const syncConnection = useAction(api.sync.syncConnection);
  const cancelSync = useAction(api.sync.cancelSync);
  const exportToSheets = useAction(api.sheets.exportToSheets);
  const resetSync = useMutation(api.connections.resetSync);

  const handleSync = async () => {
    try {
      const result = await syncConnection({ connectionId: connection._id });
      console.log("Sync started:", result.message);
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Check console for details.");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelSync({ connectionId: connection._id });
    } catch (error) {
      console.error("Cancel failed:", error);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset this connection? This will clear the sync status and allow you to sync again.")) {
      return;
    }
    try {
      await resetSync({ id: connection._id });
    } catch (error) {
      console.error("Reset failed:", error);
      alert("Reset failed. Check console for details.");
    }
  };

  const handleExport = async () => {
    try {
      await exportToSheets({ connectionId: connection._id });
      alert("Export complete!");
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Check console for details.");
    }
  };

  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Less than an hour ago";
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return "Almost done";
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `~${hours}h ${minutes}m remaining`;
    } else if (minutes > 0) {
      return `~${minutes}m remaining`;
    } else {
      return "< 1m remaining";
    }
  };

  const calculateTimeRemaining = () => {
    const startedAt = connection.syncStartedAt || 0;
    const total = connection.totalMessagesToSync || 0;
    const processed = connection.messagesProcessed || 0;

    // Need at least some progress to estimate
    if (startedAt === 0 || processed === 0 || total === 0) {
      return null;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = total - processed;

    // Calculate rate: messages per millisecond
    const rate = processed / elapsed;

    // Estimate remaining time
    const estimatedMs = remaining / rate;

    return estimatedMs;
  };

  const getStatusColor = () => {
    switch (connection.syncStatus) {
      case "syncing":
        return "#f0ad4e";
      case "deleting":
      case "resetting":
        return "#6c757d";
      case "error":
        return "#d9534f";
      default:
        return connection.isActive ? "#5cb85c" : "#999";
    }
  };

  const isSyncing = connection.syncStatus === "syncing";
  const isError = connection.syncStatus === "error";
  const isDeleting = connection.syncStatus === "deleting";
  const isResetting = connection.syncStatus === "resetting";
  const total = connection.totalMessagesToSync || 0;
  const processed = connection.messagesProcessed || 0;
  const percentComplete = total > 0 ? Math.round((processed / total) * 100) : 0;

  // Detect stuck sync (syncing for more than 2 minutes with no progress)
  const syncStartedAt = connection.syncStartedAt || 0;
  const syncDuration = Date.now() - syncStartedAt;
  const TWO_MINUTES = 2 * 60 * 1000;
  const isStuck = isSyncing && total > 0 && processed === 0 && syncDuration > TWO_MINUTES;

  return (
    <div className="connection-card">
      <div className="connection-header">
        <h3>{connection.name}</h3>
        <button onClick={onEdit} className="edit-button">
          Settings
        </button>
      </div>
      <div className="connection-stats">
        <span>{addressCount} addresses</span>
        <span style={{ color: getStatusColor() }}>
          {isDeleting
            ? "Deleting..."
            : isResetting
              ? "Resetting..."
              : isSyncing
                ? `Syncing... ${percentComplete}%`
                : isError
                  ? "Error"
                  : connection.isActive
                    ? "Active"
                    : "Paused"}
        </span>
        <span>Syncs {connection.syncSchedule}</span>
      </div>

      {isSyncing && total > 0 && (
        <div className="sync-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <div className="progress-info">
            <span className="progress-text">
              {processed.toLocaleString()} / {total.toLocaleString()} messages
            </span>
            <span className="time-remaining">
              {calculateTimeRemaining() !== null
                ? formatTimeRemaining(calculateTimeRemaining()!)
                : processed > 0
                  ? "Estimating..."
                  : "Starting..."}
            </span>
          </div>
        </div>
      )}

      <div className="connection-footer">
        <span>Last sync: {formatLastSync(connection.lastSyncAt)}</span>
        <div className="sync-buttons">
          {isDeleting || isResetting ? (
            <span className="status-text">Please wait...</span>
          ) : isSyncing ? (
            <>
              <button onClick={handleReset} className="reset-button">
                Reset
              </button>
              <button onClick={handleCancel} className="cancel-button">
                Cancel
              </button>
            </>
          ) : isError ? (
            <>
              <button onClick={handleReset} className="reset-button">
                Reset
              </button>
              <button onClick={handleSync} className="sync-button">
                Retry
              </button>
            </>
          ) : (
            <>
              <button onClick={handleExport} className="export-button">
                Export
              </button>
              <button onClick={handleSync} className="sync-button">
                Sync Now
              </button>
            </>
          )}
        </div>
      </div>

      {connection.lastError && isError && (
        <div className="connection-error">Error: {connection.lastError}</div>
      )}

      {isStuck && (
        <div className="connection-warning">
          Sync appears stuck. Try clicking Reset to clear and start fresh.
        </div>
      )}
    </div>
  );
}
