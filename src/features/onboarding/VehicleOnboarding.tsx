import { useState, type FormEvent } from "react"

import { ArrowRight, CarFront, Gauge, Hash, SkipForward } from "lucide-react"

import { useNavigate } from "react-router"

import { AppLayout } from "../../components/AppLayout"
import { BrandLogo } from "../../components/BrandLogo"
import carPhoto from "../../assets/corolla.jpg"

import { vehicleService } from "../../services/vehicles"

import { useAppStore } from "../../state/store"

export function VehicleOnboarding() {
  const theme = useAppStore((state) => state.theme)

  const setVehicle = useAppStore((state) => state.setVehicle)

  const user = useAppStore((state) => state.user)

  const navigate = useNavigate()

  const [make, setMake] = useState("")

  const [model, setModel] = useState("")

  const [year, setYear] = useState(String(new Date().getFullYear()))

  const [plate, setPlate] = useState("")

  const [mileage, setMileage] = useState("")

  const [error, setError] = useState("")

  const [saving, setSaving] = useState(false)

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!make.trim() || !model.trim()) {
      setError("Enter your vehicle make and model.")

      return
    }

    const parsedYear = Number(year)

    const parsedMileage = mileage === "" ? 0 : Number(mileage)

    if (
      !Number.isInteger(parsedYear) ||
      parsedYear < 1950 ||
      parsedYear > new Date().getFullYear() + 1
    ) {
      setError("Enter a valid model year.")

      return
    }

    if (!Number.isFinite(parsedMileage) || parsedMileage < 0) {
      setError("Enter a valid mileage, or leave it blank.")

      return
    }

    setSaving(true)

    setError("")

    try {
      const vehicle = await vehicleService.create({
        make: make.trim(),

        model: model.trim(),

        year: parsedYear,

        plate: plate.trim().toUpperCase(),

        mileageKm: parsedMileage,

        primary: true,
      })

      setVehicle(vehicle)

      navigate("/app/home", { replace: true })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't save your vehicle.",
      )
    } finally {
      setSaving(false)
    }
  }

  function skip() {
    setVehicle(null)

    navigate("/app/home", { replace: true })
  }

  return (
    <AppLayout theme={theme}>
      <main className="vehicle-onboarding">
        <header className="vehicle-onboarding__header">
          <BrandLogo />
          <span>1 minute setup</span>
        </header>
        <section className="vehicle-onboarding__hero">
          <div className="vehicle-onboarding__progress" aria-label="Step 1 of 1">
            <span />
          </div>
          <div className="vehicle-onboarding__illustration">
            <img alt="" aria-hidden="true" src={carPhoto} />
            <span className="vehicle-onboarding__image-badge"><CarFront size={17} /> YOUR GARAGE</span>
          </div>
          <span className="auth-kicker">LET'S GET YOU ON THE ROAD</span>
          <h1>First, tell us about your car.</h1>
          <p className="vehicle-onboarding__intro">
            We’ll use these details to make your service requests easier. You can update them any time.
          </p>
        </section>

        <form className="vehicle-onboarding__form" onSubmit={finish}>
          <div className="vehicle-onboarding__form-heading">
            <span><CarFront size={19} /></span>
            <div><strong>Vehicle details</strong><small>Required fields are marked</small></div>
          </div>
          <label>
            <span>Make <i>Required</i></span>
            <input
              autoComplete="off"
              maxLength={40}
              onChange={(event) => setMake(event.target.value)}
              placeholder="e.g. Toyota"
              required
              value={make}
            />
          </label>
          <label>
            <span>Model <i>Required</i></span>
            <input
              autoComplete="off"
              maxLength={40}
              onChange={(event) => setModel(event.target.value)}
              placeholder="e.g. Corolla"
              required
              value={model}
            />
          </label>
          <div className="vehicle-onboarding__row">
            <label>
              <span>Year <i>Required</i></span>
              <input
                max={new Date().getFullYear() + 1}
                min="1950"
                onChange={(event) => setYear(event.target.value)}
                required
                type="number"
                value={year}
              />
            </label>
            <label>
              <span>Odometer <small>Optional</small></span>
              <div className="vehicle-onboarding__input-icon">
                <Gauge size={15} aria-hidden="true" />
                <input
                  min="0"
                  onChange={(event) => setMileage(event.target.value)}
                  placeholder="Optional"
                  type="number"
                  value={mileage}
                />
              </div>
            </label>
          </div>
          <label>
            <span>
              Number plate <small>Optional</small>
            </span>
            <div className="vehicle-onboarding__input-icon">
              <Hash size={15} aria-hidden="true" />
              <input
                autoCapitalize="characters"
                maxLength={16}
                onChange={(event) => setPlate(event.target.value)}
                placeholder="e.g. GR 1234-24"
                value={plate}
              />
            </div>
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-submit" disabled={saving} type="submit">
            {saving ? "Saving your car…" : "Save and continue"} <ArrowRight size={17} />
          </button>
        </form>
        <button className="vehicle-onboarding__skip" onClick={skip} type="button">
          <SkipForward size={15} /> I’ll do this later
        </button>
        <p className="vehicle-onboarding__welcome">
          Welcome, {user?.name.split(" ")[0] ?? "driver"} · Your vehicle details stay private.
        </p>
      </main>
    </AppLayout>
  )
}
