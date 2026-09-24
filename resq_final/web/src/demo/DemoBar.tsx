import { useLocation, useNavigate } from "react-router-dom";
import { resetDemo } from "./server";
import "./demo.css";

/**
 * The strip across the top of the Claude demo: says plainly that this is a
 * self-contained demo, switches between the two sides of the product (there
 * is no address bar inside Claude), and resets the sample data.
 */
export default function DemoBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onControl = pathname.startsWith("/control");

  return (
    <div className="demobar" role="region" aria-label="Demo controls">
      <span className="demobar__tag">Demo</span>
      <span className="demobar__note">The backend runs inside this page, with sample reports from Assam.</span>
      <div className="demobar__switch" role="tablist" aria-label="Which side to show">
        <button type="button" role="tab" aria-selected={!onControl} onClick={() => navigate("/")}>Citizen app</button>
        <button type="button" role="tab" aria-selected={onControl} onClick={() => navigate("/control")}>Control room</button>
      </div>
      <button type="button" className="demobar__reset" onClick={() => { resetDemo(); window.location.hash = "#/"; window.location.reload(); }}>
        Reset
      </button>
    </div>
  );
}
