import { useAction } from "convex/react";
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

  const getStatusColor = () => {
    switch (connection.syncStatus) {
      case "syncing":
        return "#f0ad4e";
      case "error":
        return "#d9534f";
      default:
        return connection.isActive ? "#5cb85c" : "#999";
    }
  };

  const isSyncing = connection.syncStatus === "syncing";
  const total = connection.totalMessagesToSync || 0;
  const processed = connection.messagesProcessed || 0;
  const percentComplete = total > 0 ? Math.round((processed / total) * 100) : 0;

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
          {isSyncing
            ? `Syncing... ${percentComplete}%`
            : connection.syncStatus === "error"
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
          <span className="progress-text">
            {processed} / {total} messages
          </span>
        </div>
      )}

      <div className="connection-footer">
        <span>Last sync: {formatLastSync(connection.lastSyncAt)}</span>
        <div className="sync-buttons">
          {isSyncing ? (
            <button onClick={handleCancel} className="cancel-button">
              Cancel
            </button>
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

      {connection.lastError && connection.syncStatus === "error" && (
        <div className="connection-error">Error: {connection.lastError}</div>
      )}
    </div>
  );
}
