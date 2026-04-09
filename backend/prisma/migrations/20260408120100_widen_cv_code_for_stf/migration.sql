-- Plan 12 P2 follow-up: widen controlled_vocabulary.code so STF file-tag
-- values fit. ICH STF v6 valid-values.xml has tags up to 58 chars (e.g.
-- "inter-laboratory-standardisation-methods-quality-assurance"); the
-- pre-Plan-12 column was VARCHAR(10), which fit only the legacy NMPA codes
-- (cnapt1..cnsqt4). Widen to VARCHAR(80) with headroom.

ALTER TABLE "controlled_vocabulary"
    ALTER COLUMN "code" TYPE VARCHAR(80);
