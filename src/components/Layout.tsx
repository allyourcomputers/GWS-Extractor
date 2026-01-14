import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>GWS Email Extractor</h1>
        <div className="header-right">
          <span>{auth?.email}</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
