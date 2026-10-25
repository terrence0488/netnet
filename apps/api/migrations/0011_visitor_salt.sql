CREATE TABLE "core"."visitor_salt" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" "bytea" NOT NULL,
	CONSTRAINT "visitor_salt_salt_check" CHECK (octet_length("core"."visitor_salt"."salt") = 32)
);
