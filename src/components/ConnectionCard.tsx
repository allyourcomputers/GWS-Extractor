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
  const exportToSheets = useAction(api.sheets.exportToSheets);

  const handleSync = async () => {
    try {
      await syncConnection({ connectionId: connection._id });
      await exportToSheets({ connectionId: connection._id });
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Check console for details.");
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
          {connection.syncStatus === "syncing"
            ? "Syncing..."
            : connection.isActive
              ? "Active"
              : "Paused"}
        </span>
        <span>Syncs {connection.syncSchedule}</span>
      </div>
      <div className="connection-footer">
        <span>Last sync: {formatLastSync(connection.lastSyncAt)}</span>
        <button
          onClick={handleSync}
          disabled={connection.syncStatus === "syncing"}
          className="sync-button"
        >
          {connection.syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </button>
      </div>
      {connection.lastError && (
        <div className="connection-error">Error: {connection.lastError}</div>
      )}
    </div>
  );
}
