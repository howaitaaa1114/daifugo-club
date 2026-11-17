CREATE TABLE `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `revision` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `state` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_updated_at` ON `rooms` (`updated_at`);
