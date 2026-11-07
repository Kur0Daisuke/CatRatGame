CREATE TABLE "hunt_scores" (
	"id" serial PRIMARY KEY,
	"time_seconds" double precision NOT NULL,
	"lives_left" smallint NOT NULL,
	"cat_label" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
