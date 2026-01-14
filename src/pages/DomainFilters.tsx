import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Layout from "../components/Layout";

export default function DomainFilters() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const domains = useQuery(api.domains.list, { connectionId: id as any });
  const addDomain = useMutation(api.domains.add);
  const addBulkDomains = useMutation(api.domains.addBulk);
  const removeDomain = useMutation(api.domains.remove);

  const [newDomain, setNewDomain] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    try {
      await addDomain({
        connectionId: id as any,
        domain: newDomain.trim(),
      });
      setNewDomain("");
    } catch (error) {
      console.error("Failed to add domain:", error);
    }
  };

  const handleBulkImport = async () => {
    const domains = bulkInput
      .split(/[\n,]/)
      .map((d) => d.trim())
      .filter(Boolean);

    if (domains.length === 0) return;

    try {
      await addBulkDomains({
        connectionId: id as any,
        domains,
      });
      setBulkInput("");
      setShowBulk(false);
    } catch (error) {
      console.error("Failed to import domains:", error);
    }
  };

  const handleRemove = async (domainId: string) => {
    try {
      await removeDomain({ id: domainId as any });
    } catch (error) {
      console.error("Failed to remove domain:", error);
    }
  };

  return (
    <Layout>
      <div className="domains-page">
        <div className="domains-header">
          <h2>Domain Filters</h2>
          <button
            onClick={() => navigate(`/connections/${id}`)}
            className="back-button"
          >
            ← Back to Settings
          </button>
        </div>

        <p className="domains-description">
          Email addresses from these domains will be excluded from extraction.
        </p>

        <div className="domains-card">
          <form onSubmit={handleAddDomain} className="add-domain-form">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Enter domain (e.g., mycompany.com)"
            />
            <button type="submit">Add</button>
          </form>

          <button
            onClick={() => setShowBulk(!showBulk)}
            className="bulk-toggle"
          >
            {showBulk ? "Hide Bulk Import" : "Bulk Import"}
          </button>

          {showBulk && (
            <div className="bulk-import">
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="Enter domains, one per line or comma-separated"
                rows={5}
              />
              <button onClick={handleBulkImport}>Import All</button>
            </div>
          )}

          <div className="domains-list">
            {domains === undefined && <p>Loading...</p>}
            {domains && domains.length === 0 && (
              <p className="no-domains">No filtered domains yet.</p>
            )}
            {domains &&
              domains.map((domain) => (
                <div key={domain._id} className="domain-item">
                  <span>{domain.domain}</span>
                  <button
                    onClick={() => handleRemove(domain._id)}
                    className="remove-button"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
