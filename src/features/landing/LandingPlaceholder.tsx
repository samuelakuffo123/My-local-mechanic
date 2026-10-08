import { ArrowRight, Gauge, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { Link } from "react-router";

const products = [
  { title: "Emergency assist", copy: "On-demand roadside and battery help in under 15 minutes.", tag: "24/7", price: "From GHS 120" },
  { title: "Certified mechanics", copy: "Verified specialists for diagnostics, repairs, and routine service.", tag: "4.9 avg", price: "Booked in 2 min" },
  { title: "Genuine parts", copy: "Vehicle-matched parts and maintenance bundles delivered fast.", tag: "Same day", price: "Up to 30% off" },
];

export function LandingPlaceholder() {
  return (
    <main className="landing-placeholder">
      <nav>
        <strong>mechnow</strong>
        <Link to="/login">Log in</Link>
        <Link to="/signup">Get started</Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <span>TRUSTED AUTOMOTIVE HELP ACROSS GHANA</span>
          <h1>Help, on the road.</h1>
          <p>
            Mechanics, towing, and genuine parts when and where you need them. A premium
            service experience built for drivers who want confidence, speed, and clarity.
          </p>
          <div className="landing-actions">
            <Link to="/signup">Get emergency help</Link>
            <Link className="landing-secondary" to="/app/explore">Find a mechanic</Link>
          </div>

          <div className="landing-trust-row">
            <div>
              <ShieldCheck size={18} />
              <span>Verified providers</span>
            </div>
            <div>
              <Gauge size={18} />
              <span>Live ETA tracking</span>
            </div>
            <div>
              <Sparkles size={18} />
              <span>Upfront pricing</span>
            </div>
          </div>
        </div>

        <div className="landing-product-panel" aria-label="Featured automotive services">
          <div className="landing-product-header">
            <span className="landing-badge">Popular now</span>
            <button type="button">View all</button>
          </div>

          <div className="landing-product-list">
            {products.map(({ title, copy, tag, price }) => (
              <article key={title} className="feature-card">
                <div className="feature-card__title">
                  <span className="feature-icon"><Wrench size={16} /></span>
                  <strong>{title}</strong>
                </div>
                <p>{copy}</p>
                <div className="feature-card__meta">
                  <span>{tag}</span>
                  <strong>{price}</strong>
                </div>
                <Link to="/signup">
                  Book now <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
