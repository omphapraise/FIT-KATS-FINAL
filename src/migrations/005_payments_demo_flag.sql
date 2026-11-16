-- Payments: mark which records are demo/sample data and which came from a real payment provider.
-- Every payment that exists today was created by the seed script, so ALL existing rows become demo.
-- Real rows can only appear once a payment provider is integrated (it will set is_demo = 0 and provider).
ALTER TABLE Payments ADD COLUMN is_demo  INTEGER NOT NULL DEFAULT 1 CHECK (is_demo IN (0,1));
ALTER TABLE Payments ADD COLUMN provider TEXT;
