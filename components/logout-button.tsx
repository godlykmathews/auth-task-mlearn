"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

export function LogoutButton({ className = "" }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Logout failed");
      window.location.assign("/login?loggedOut=1");
    } catch {
      setError("Couldn’t log out. Please try again.");
      setPending(false);
    }
  }

  return <div className="logout-wrap"><button className={`logout-button ${className}`} type="button" onClick={logout} disabled={pending}>{pending ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} />}<span>{pending ? "Logging out…" : "Log out"}</span></button>{error && <p className="field-error" role="alert">{error}</p>}</div>;
}
