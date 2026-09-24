/*
 * RESQ.AI web app — deployment settings.
 *
 * Edit this file on the server after deploying; no rebuild needed.
 *
 *   apiBase  The address of the RESQ.AI backend, no trailing slash.
 *            Example: "https://resq-ai-backend.onrender.com"
 *            Leave "" to use the address baked in at build time
 *            (VITE_RESQ_API), or http://localhost:4000 if none was set.
 *
 * Anyone can still override it for their own browser in Settings.
 */
window.RESQ_CONFIG = {
  apiBase: "",
};
