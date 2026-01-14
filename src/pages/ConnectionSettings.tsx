import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/AuthContext";
import Layout from "../components/Layout";

const SCHEDULE_OPTIONS = [
  { value: "15min", label: "Every 15 minutes" },
  { value: "1hour", label: "Every hour" },
  { value: "4hours", label: "Every 4 hours" },
  { value: "daily", label: "Daily" },
  { value: "manual", label: "Manual only" },
];

export default function ConnectionSettings() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { auth } = useAuth();

  const connection = useQuery(
    api.connections.get,
    !isNew && id ? { id: id as any } : "skip"
  );

  const createConnection = useMutation(api.connections.create);
  const updateConnection = useMutation(api.connections.update);
  const deleteConnection = useMutation(api.connections.remove);
  const listLabels = useAction(api.google.gmail.listLabels);
  const listSpreadsheets = useAction(api.google.sheets.listSpreadsheets);
  const createSpreadsheet = useAction(api.google.sheets.createSpreadsheet);

  const [name, setName] = useState("");
  const [mailboxFolder, setMailboxFolder] = useState("INBOX");
  const [sheetsId, setSheetsId] = useState("");
  const [sheetTab, setSheetTab] = useState("Addresses");
  const [syncSchedule, setSyncSchedule] = useState("1hour");
  const [isActive, setIsActive] = useState(true);
  const [labels, setLabels] = useState<Array<{ id: string; name: string }>>([]);
  const [spreadsheets, setSpreadsheets] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setMailboxFolder(connection.mailboxFolder);
      setSheetsId(connection.sheetsId);
      setSheetTab(connection.sheetTab);
      setSyncSchedule(connection.syncSchedule);
      setIsActive(connection.isActive);
    }
  }, [connection]);

  useEffect(() => {
    const loadOptions = async () => {
      if (!auth?.accessToken) {
        console.log("No access token available");
        return;
      }

      setLoadingOptions(true);
      setOptionsError(null);

      try {
        console.log("Loading Gmail labels and spreadsheets...");
        const [labelsResult, spreadsheetsResult] = await Promise.all([
          listLabels({ accessToken: auth.accessToken }),
          listSpreadsheets({ accessToken: auth.accessToken }),
        ]);
        console.log("Labels loaded:", labelsResult);
        console.log("Spreadsheets loaded:", spreadsheetsResult);
        setLabels(labelsResult);
        setSpreadsheets(spreadsheetsResult);
      } catch (error) {
        console.error("Failed to load options:", error);
        setOptionsError(error instanceof Error ? error.message : "Failed to load Gmail folders and spreadsheets");
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
  }, [auth?.accessToken, listLabels, listSpreadsheets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isNew) {
        await createConnection({
          userId: auth!.userId as any,
          name,
          accessToken: auth!.accessToken!,
          refreshToken: auth!.refreshToken!,
          tokenExpiry: auth!.tokenExpiry!,
          mailboxFolder,
          sheetsId,
          sheetTab,
          syncSchedule,
        });
      } else {
        await updateConnection({
          id: id as any,
          name,
          mailboxFolder,
          sheetsId,
          sheetTab,
          syncSchedule,
          isActive,
        });
      }
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Failed to save connection");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this connection?")) return;

    try {
      await deleteConnection({ id: id as any });
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete connection");
    }
  };

  const handleCreateSpreadsheet = async () => {
    if (!newSheetName.trim() || !auth?.accessToken) return;

    setCreatingSheet(true);
    try {
      const newSheet = await createSpreadsheet({
        accessToken: auth.accessToken,
        title: newSheetName.trim(),
        sheetName: sheetTab || "Addresses",
      });

      // Add to spreadsheets list and select it
      setSpreadsheets((prev) => [newSheet, ...prev]);
      setSheetsId(newSheet.id);
      setShowCreateSheet(false);
      setNewSheetName("");
    } catch (error) {
      console.error("Failed to create spreadsheet:", error);
      alert("Failed to create spreadsheet");
    } finally {
      setCreatingSheet(false);
    }
  };

  return (
    <Layout>
      <div className="settings-page">
        <h2>{isNew ? "Add Connection" : "Edit Connection"}</h2>

        {optionsError && (
          <div className="options-error">
            <p>Error loading Gmail folders and spreadsheets: {optionsError}</p>
            <p>Please try signing out and signing back in.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="settings-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sales Inbox"
              required
            />
          </div>

          <div className="form-group">
            <label>Gmail Folder</label>
            {loadingOptions ? (
              <select disabled>
                <option>Loading folders...</option>
              </select>
            ) : (
              <select
                value={mailboxFolder}
                onChange={(e) => setMailboxFolder(e.target.value)}
              >
                {labels.length === 0 && <option value="INBOX">INBOX</option>}
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Google Sheet</label>
            {loadingOptions ? (
              <select disabled>
                <option>Loading spreadsheets...</option>
              </select>
            ) : (
              <>
                <select
                  value={sheetsId}
                  onChange={(e) => setSheetsId(e.target.value)}
                  required={!showCreateSheet}
                  disabled={showCreateSheet}
                >
                  <option value="">Select a spreadsheet...</option>
                  {spreadsheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
                {!showCreateSheet ? (
                  <button
                    type="button"
                    className="link-button create-sheet-toggle"
                    onClick={() => setShowCreateSheet(true)}
                  >
                    + Create new spreadsheet
                  </button>
                ) : (
                  <div className="create-sheet-form">
                    <input
                      type="text"
                      value={newSheetName}
                      onChange={(e) => setNewSheetName(e.target.value)}
                      placeholder="Enter spreadsheet name..."
                      disabled={creatingSheet}
                    />
                    <div className="create-sheet-actions">
                      <button
                        type="button"
                        onClick={handleCreateSpreadsheet}
                        disabled={creatingSheet || !newSheetName.trim()}
                        className="create-sheet-button"
                      >
                        {creatingSheet ? "Creating..." : "Create"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateSheet(false);
                          setNewSheetName("");
                        }}
                        disabled={creatingSheet}
                        className="cancel-create-button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label>Sheet Tab Name</label>
            <input
              type="text"
              value={sheetTab}
              onChange={(e) => setSheetTab(e.target.value)}
              placeholder="e.g., Addresses"
              required
            />
          </div>

          <div className="form-group">
            <label>Sync Schedule</label>
            <select
              value={syncSchedule}
              onChange={(e) => setSyncSchedule(e.target.value)}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {!isNew && (
            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" disabled={loading} className="save-button">
              {loading ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="cancel-button"
            >
              Cancel
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                className="delete-button"
              >
                Delete
              </button>
            )}
          </div>
        </form>

        {!isNew && (
          <div className="domain-filters-link">
            <button
              onClick={() => navigate(`/connections/${id}/domains`)}
              className="link-button"
            >
              Manage Domain Filters →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
