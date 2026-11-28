BEGIN;

LOCK TABLE "Patient" IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE patient_number_seq START WITH 100001;

SELECT setval('patient_number_seq', GREATEST(100000, COALESCE(MAX(
  CASE WHEN "patientNumber" ~ '^P-[0-9]{1,18}$' THEN substring("patientNumber" FROM 3)::bigint END
), 0))) FROM "Patient";

ALTER TABLE "Patient"
  ADD COLUMN "legacyPatientNumber" TEXT,
  ALTER COLUMN "patientNumber" SET DEFAULT ('P-'::text || nextval('patient_number_seq'::regclass));
ALTER SEQUENCE patient_number_seq OWNED BY "Patient"."patientNumber";

UPDATE "Patient"
SET "legacyPatientNumber" = "patientNumber", "patientNumber" = DEFAULT
WHERE "patientNumber" ~* '^P-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';

CREATE UNIQUE INDEX "Patient_legacyPatientNumber_key" ON "Patient"("legacyPatientNumber");

COMMIT;
