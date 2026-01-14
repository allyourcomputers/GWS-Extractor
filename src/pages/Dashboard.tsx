import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/AuthContext";
import Layout from "../components/Layout";
import ConnectionCard from "../components/ConnectionCard";

export default function Dashboard() {
  const { auth } = useAuth();
  const navigate = useNavigate();

  const connections = useQuery(
    api.connections.list,
    auth?.userId ? { userId: auth.userId as any } : "skip"
  );

  const handleAddConnection = () => {
    navigate("/connections/new");
  };

  const handleEditConnection = (connectionId: string) => {
    navigate(`/connections/${connectionId}`);
  };

  return (
    <Layout>
      <div className="dashboard">
        <div className="dashboard-header">
          <h2>Your Connections</h2>
          <button onClick={handleAddConnection} className="add-button">
            + Add Connection
          </button>
        </div>

        {connections === undefined && <p>Loading...</p>}

        {connections && connections.length === 0 && (
          <div className="empty-state">
            <p>No connections yet.</p>
            <p>Add a connection to start extracting email addresses.</p>
          </div>
        )}

        {connections &&
          connections.map((conn) => (
            <ConnectionCardWithCount
              key={conn._id}
              connection={conn}
              onEdit={() => handleEditConnection(conn._id)}
            />
          ))}
      </div>
    </Layout>
  );
}

function ConnectionCardWithCount({
  connection,
  onEdit,
}: {
  connection: any;
  onEdit: () => void;
}) {
  const count = useQuery(api.addresses.count, {
    connectionId: connection._id,
  });

  return (
    <ConnectionCard
      connection={connection}
      addressCount={count ?? 0}
      onEdit={onEdit}
    />
  );
}
