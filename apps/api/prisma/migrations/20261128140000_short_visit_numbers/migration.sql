BEGIN;

LOCK TABLE "Visit" IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE visit_number_seq START WITH 100001;

SELECT setval('visit_number_seq', GREATEST(100000, COALESCE(MAX(
  CASE WHEN "visitNumber" ~ '^V-[0-9]{1,18}$' THEN substring("visitNumber" FROM 3)::bigint END
), 0))) FROM "Visit";

ALTER TABLE "Visit"
  ADD COLUMN "legacyVisitNumber" TEXT,
  ALTER COLUMN "visitNumber" SET DEFAULT ('V-'::text || nextval('visit_number_seq'::regclass));
ALTER SEQUENCE visit_number_seq OWNED BY "Visit"."visitNumber";

UPDATE "Visit"
SET "legacyVisitNumber" = "visitNumber", "visitNumber" = DEFAULT
WHERE "visitNumber" ~* '^V-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';

CREATE UNIQUE INDEX "Visit_legacyVisitNumber_key" ON "Visit"("legacyVisitNumber");

COMMIT;
