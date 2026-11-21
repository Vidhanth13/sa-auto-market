-- sa_auto_market schema
-- Sources: naamsa (national sales), oilprices/DMRE (fuel), NaTIS (provincial registrations)
-- Money/units are integers (vehicle counts) or numeric (rand).

-- ---------- reference ----------
CREATE TABLE IF NOT EXISTS manufacturer (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE          -- canonical, as printed by naamsa
);

CREATE TABLE IF NOT EXISTS province (
    code        TEXT PRIMARY KEY,             -- GP, KZN, WC, EC, FS, MP, NW, LP, NC
    name        TEXT NOT NULL
);

INSERT INTO province (code, name) VALUES
 ('GP','Gauteng'),('KZN','KwaZulu-Natal'),('WC','Western Cape'),
 ('EC','Eastern Cape'),('FS','Free State'),('MP','Mpumalanga'),
 ('NW','North West'),('LP','Limpopo'),('NC','Northern Cape')
ON CONFLICT (code) DO NOTHING;

-- ---------- naamsa: monthly report provenance ----------
CREATE TABLE IF NOT EXISTS naamsa_report (
    id          SERIAL PRIMARY KEY,
    period      DATE NOT NULL UNIQUE,         -- first day of the sales month
    source_url  TEXT,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- naamsa: segment totals (Market at a Glance) ----------
-- segment in: Passenger, LightCV, MediumCV, HeavyCV, ExtraHeavyCV, Bus
CREATE TABLE IF NOT EXISTS sales_segment (
    id          SERIAL PRIMARY KEY,
    report_id   INT NOT NULL REFERENCES naamsa_report(id) ON DELETE CASCADE,
    period      DATE NOT NULL,
    segment     TEXT NOT NULL,
    channel     TEXT NOT NULL CHECK (channel IN ('local','export')),
    units       INT,
    UNIQUE (period, segment, channel)
);

-- ---------- naamsa: per-manufacturer totals ----------
-- group in: PassengerLCV, Commercial, Total   (as the naamsa manufacturer table splits)
CREATE TABLE IF NOT EXISTS sales_manufacturer (
    id              SERIAL PRIMARY KEY,
    report_id       INT NOT NULL REFERENCES naamsa_report(id) ON DELETE CASCADE,
    period          DATE NOT NULL,
    manufacturer_id INT NOT NULL REFERENCES manufacturer(id),
    veh_group       TEXT NOT NULL,            -- PassengerLCV | Commercial | Total
    channel         TEXT NOT NULL CHECK (channel IN ('local','export')),
    units           INT,
    UNIQUE (period, manufacturer_id, veh_group, channel)
);

-- ---------- fuel prices (later step) ----------
CREATE TABLE IF NOT EXISTS fuel_price (
    id          SERIAL PRIMARY KEY,
    period      DATE NOT NULL,               -- pricing month
    zone        TEXT NOT NULL DEFAULT 'inland', -- inland | coastal
    petrol95    NUMERIC(6,2),
    petrol93    NUMERIC(6,2),
    diesel50    NUMERIC(6,2),
    diesel500   NUMERIC(6,2),
    paraffin    NUMERIC(6,2),
    UNIQUE (period, zone)
);

-- ---------- NaTIS registrations (later step) ----------
-- kind in: new | used | population ; class = NaTIS vehicle class text
CREATE TABLE IF NOT EXISTS natis_registration (
    id            SERIAL PRIMARY KEY,
    period        DATE NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('new','used','population')),
    province_code TEXT NOT NULL REFERENCES province(code),
    veh_class     TEXT NOT NULL,
    units         INT,
    UNIQUE (period, kind, province_code, veh_class)
);

CREATE INDEX IF NOT EXISTS idx_salesman_period ON sales_manufacturer(period);
CREATE INDEX IF NOT EXISTS idx_salesseg_period ON sales_segment(period);
CREATE INDEX IF NOT EXISTS idx_fuel_period     ON fuel_price(period);
CREATE INDEX IF NOT EXISTS idx_natis_period    ON natis_registration(period, kind);
