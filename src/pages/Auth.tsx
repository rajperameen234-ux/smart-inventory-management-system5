
import { useState, type FormEvent } from "react";
import { supabase } from "../supabase";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMessage(
          data.session
            ? "Account created successfully!"
            : "Account created. Please check your email to confirm."
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      maxWidth: 400,
      margin: "80px auto",
      padding: 25,
      fontFamily: "Arial",
      border: "1px solid #ddd",
      borderRadius: 12
    }}>
      <h1>Smart Inventory</h1>
      <h2>{isLogin ? "Login" : "Create Account"}</h2>

      <form onSubmit={handleSubmit}>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 18px", boxSizing: "border-box" }}
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 18px", boxSizing: "border-box" }}
        />

        <button type="submit" disabled={loading} style={{ padding: 12, width: "100%", cursor: "pointer" }}>
          {loading ? "Please wait..." : isLogin ? "Login" : "Sign Up"}
        </button>
      </form>

      {message && <p>{message}</p>}

      <p>
        {isLogin ? "Don't have an account?" : "Already have an account?"}
      </p>

      <button
        type="button"
        onClick={() => {
          setIsLogin(!isLogin);
          setMessage("");
        }}
      >
        {isLogin ? "Create Account" : "Back to Login"}
      </button>
    </div>
  );
}