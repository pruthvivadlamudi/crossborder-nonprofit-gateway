-- ============================================================================
-- Cross-Border Donation & FCRA Compliance Database Schema
-- Compatible with PostgreSQL 13+
-- Designed for complete FCRA Rule 13 audit trails & Form FC-4 annual reporting
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Donors Table (Enforces non-anonymous donor identity required by FCRA)
-- ----------------------------------------------------------------------------
CREATE TABLE donors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    nationality VARCHAR(50) NOT NULL,               -- e.g., 'United States', 'Germany'
    is_nri BOOLEAN NOT NULL DEFAULT FALSE,          -- True if Indian passport holder living abroad
    passport_or_id_number VARCHAR(100),             -- Mandatory for foreign nationals
    country_of_residence VARCHAR(2) NOT NULL,       -- ISO-3166-1 alpha-2 code (e.g., 'US', 'GB')
    residential_address TEXT NOT NULL,              -- Full postal address
    phone_number VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_donors_email ON donors(email);
CREATE INDEX idx_donors_country ON donors(country_of_residence);

-- ----------------------------------------------------------------------------
-- 2. Donations Table (Tracks PayPal Order & Capture lifecycle)
-- ----------------------------------------------------------------------------
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE RESTRICT,
    
    -- PayPal Identifiers
    paypal_order_id VARCHAR(100) UNIQUE NOT NULL,
    paypal_capture_id VARCHAR(100) UNIQUE,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,

    -- Financial Breakdown (in source currency, e.g., USD)
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    gross_amount NUMERIC(12, 2) NOT NULL CHECK (gross_amount > 0),
    paypal_fee NUMERIC(12, 2) DEFAULT 0.00,
    net_amount NUMERIC(12, 2),

    -- Status Lifecycle: CREATED -> APPROVED -> CAPTURED -> FAILED / REFUNDED
    status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    
    -- FCRA Specific Purpose & Reporting Metadata
    fcra_purpose VARCHAR(50) NOT NULL DEFAULT 'SOCIAL', -- CULTURAL, ECONOMIC, EDUCATIONAL, RELIGIOUS, SOCIAL
    fcra_financial_year VARCHAR(9) NOT NULL,            -- e.g., '2026-2027'
    institutional_grant_batch_id UUID,                 -- Link to batch wire transfer when aggregated

    -- Audit Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_donations_donor_id ON donations(donor_id);
CREATE INDEX idx_donations_status ON donations(status);
CREATE INDEX idx_donations_paypal_order ON donations(paypal_order_id);
CREATE INDEX idx_donations_financial_year ON donations(fcra_financial_year);

-- ----------------------------------------------------------------------------
-- 3. Webhook Audit Logs (Guarantees zero dropped events & idempotency)
-- ----------------------------------------------------------------------------
CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    processed_status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, DUPLICATE, FAILED
    error_message TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_logs_event_id ON webhook_logs(event_id);
CREATE INDEX idx_webhook_logs_event_type ON webhook_logs(event_type);

-- ----------------------------------------------------------------------------
-- 4. Institutional SWIFT Grant Batches (US/Foreign Entity -> SBI NDMB)
-- ----------------------------------------------------------------------------
CREATE TABLE institutional_grant_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_reference VARCHAR(100) UNIQUE NOT NULL,       -- Wire transfer reference
    source_entity_name VARCHAR(255) NOT NULL,           -- e.g., 'Friends of Hope India Foundation Inc.'
    target_bank_branch VARCHAR(255) NOT NULL DEFAULT 'SBI New Delhi Main Branch (Sansad Marg)',
    target_account_number VARCHAR(50) NOT NULL,         -- FCRA Designated Account Number
    total_usd_amount NUMERIC(14, 2) NOT NULL,
    swift_reference_number VARCHAR(100),                -- SWIFT MT103 reference
    firc_number VARCHAR(100),                           -- Bank Inward Remittance Certificate Number
    firc_date DATE,
    inr_realized_amount NUMERIC(14, 2),                 -- Total INR credited by SBI NDMB
    exchange_rate NUMERIC(10, 4),                       -- Realized USD/INR rate
    disbursed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. Helper View for Ministry of Home Affairs (MHA) Form FC-4 Annual Return
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_fc4_annual_return AS
SELECT 
    d.id AS donation_id,
    d.fcra_financial_year,
    d.created_at AS date_of_receipt,
    CONCAT(dn.first_name, ' ', dn.last_name) AS donor_full_name,
    dn.nationality,
    dn.is_nri,
    dn.passport_or_id_number,
    dn.country_of_residence,
    dn.residential_address,
    d.currency,
    d.gross_amount AS foreign_currency_amount,
    d.paypal_fee,
    d.net_amount,
    d.fcra_purpose,
    d.status AS payment_status,
    b.swift_reference_number,
    b.firc_number
FROM donations d
JOIN donors dn ON d.donor_id = dn.id
LEFT JOIN institutional_grant_batches b ON d.institutional_grant_batch_id = b.id
WHERE d.status = 'CAPTURED';
