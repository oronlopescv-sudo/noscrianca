CREATE TABLE "db_files" (
	"institution_id" text NOT NULL,
	"raiz" text DEFAULT 'storage' NOT NULL,
	"path" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "db_files_institution_id_raiz_path_pk" PRIMARY KEY("institution_id","raiz","path")
);
