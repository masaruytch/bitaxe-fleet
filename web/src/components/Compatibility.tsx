import { ShieldCheck } from "lucide-react";
import { minerCompatibility } from "../../../shared/compatibility";
export function CompatibilityList() {
  return (
    <div className="compatibility-list">
      {minerCompatibility.map((item) => (
        <div className="compatibility-item" key={item.name}>
          <div>
            <strong>{item.name}</strong>
            <span
              className={`compatibility-badge ${item.status === "Tested" ? "tested" : item.status === "Unverified" ? "unverified" : "unsupported"}`}
            >
              {item.status}
            </span>
          </div>
          <p>{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
export function CompatibilityPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Compatibility</div>
          <h1>Miner compatibility</h1>
          <p>What has been tested, and what still needs verification.</p>
        </div>
      </header>
      <section className="compatibility-panel">
        <div className="compatibility-intro">
          <ShieldCheck size={23} />
          <div>
            <h2>Tested with Bitaxe Gamma 601</h2>
            <p>
              This is the only board tested by the maintainer so far. AxeOS
              firmware differences can affect available readings.
            </p>
          </div>
        </div>
        <CompatibilityList />
        <p className="muted compatibility-footnote">
          The app checks the connection before registering a miner. A successful
          check confirms the required telemetry is available; it does not verify
          every hardware or firmware combination. Hardware settings stay in
          AxeOS.
        </p>
      </section>
    </>
  );
}
