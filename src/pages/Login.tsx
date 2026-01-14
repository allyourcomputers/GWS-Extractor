import { getGoogleAuthUrl } from "../lib/google";

export default function Login() {
  const handleLogin = () => {
    window.location.href = getGoogleAuthUrl();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>GWS Email Extractor</h1>
        <p>Extract email addresses from your Gmail and export to Google Sheets</p>
        <button onClick={handleLogin} className="google-button">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
