"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";

type FieldName = "name" | "email" | "password" | "confirmPassword";
type Values = Record<FieldName, string>;
type Errors = Partial<Record<FieldName, string>>;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [values, setValues] = useState<Values>({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState({ password: false, confirmPassword: false });

  useEffect(() => {
    if (!isSignup && new URLSearchParams(window.location.search).get("loggedOut") === "1") {
      setNotice("You’re logged out.");
    }
  }, [isSignup]);

  function validate() {
    const next: Errors = {};
    if (isSignup && !values.name.trim()) next.name = "Please enter your name.";
    if (!values.email.trim()) next.email = "Please enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = "Enter a valid email address, like you@example.com.";
    if (!values.password) next.password = "Please enter your password.";
    else if (values.password.length < 8) next.password = "Your password must be at least 8 characters.";
    else if (values.password.length > 128) next.password = "Your password must be 128 characters or fewer.";
    if (isSignup && !values.confirmPassword) next.confirmPassword = "Please confirm your password.";
    else if (isSignup && values.password !== values.confirmPassword) next.confirmPassword = "Your passwords don’t match. Please try again.";
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError("");
    setNotice("");
    const nextErrors = validate();
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...values, name: values.name.trim(), email: values.email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "We couldn’t sign you in. Please try again.");
        setPending(false);
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setFormError("We couldn’t connect. Check your connection and try again.");
      setPending(false);
    }
  }

  function field(name: FieldName, label: string, placeholder: string) {
    const password = name === "password" || name === "confirmPassword";
    const Icon = name === "email" ? Mail : name === "name" ? UserRound : LockKeyhole;
    const shown = password && visible[name];
    return (
      <div className="form-field">
        <label htmlFor={name}>{label}</label>
        <div className={`input-wrap${errors[name] ? " input-invalid" : ""}`}>
          <Icon size={17} className="input-icon" aria-hidden="true" />
          <input id={name} name={name} type={password ? (shown ? "text" : "password") : name === "email" ? "email" : "text"} placeholder={placeholder} value={values[name]} onChange={(event) => {
            setValues((old) => ({ ...old, [name]: event.target.value }));
            if (errors[name]) setErrors((old) => ({ ...old, [name]: undefined }));
          }} required disabled={pending} autoComplete={name === "name" ? "name" : name === "email" ? "email" : isSignup ? "new-password" : "current-password"} maxLength={name === "name" ? 80 : name === "email" ? 254 : 128} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : name === "password" && isSignup ? "password-hint" : undefined} />
          {password && <button type="button" className="password-toggle" onClick={() => setVisible((old) => ({ ...old, [name]: !old[name] }))} aria-label={`${shown ? "Hide" : "Show"} ${name === "confirmPassword" ? "confirm password" : "password"}`} aria-pressed={shown}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
        </div>
        {errors[name] ? <p id={`${name}-error`} className="field-error"><AlertCircle size={13} aria-hidden="true" />{errors[name]}</p> : name === "password" && isSignup ? <p id="password-hint" className="field-hint">At least 8 characters.</p> : null}
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={pending}>
      {notice && <div className="form-notice" role="status"><CheckCircle2 size={17} />{notice}</div>}
      {formError && <div className="form-alert" role="alert"><AlertCircle size={17} />{formError}</div>}
      {isSignup && field("name", "Name", "Your name")}
      {field("email", "Email", "you@example.com")}
      {field("password", "Password", "Enter your password")}
      {isSignup && field("confirmPassword", "Confirm password", "Confirm your password")}
      <button className="primary-button" type="submit" disabled={pending}><span>{pending ? (isSignup ? "Creating your account…" : "Signing you in…") : (isSignup ? "Create account" : "Log in")}</span>{pending && <LoaderCircle className="spin" size={18} aria-hidden="true" />}</button>
    </form>
  );
}
