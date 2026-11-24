import Link from "next/link";
import { Brand } from "./brand";
import { AuthForm } from "./auth-form";

export function AuthShell({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";

  return (
    <main className="auth-layout">
      <div className="auth-container">
        <Brand />
        <section className="auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title">{isSignup ? "Create account" : "Welcome back"}</h1>
          <AuthForm mode={mode} />
          <p className="auth-switch">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log in" : "Create account"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
