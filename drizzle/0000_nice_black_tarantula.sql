CREATE TABLE `draws` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game` text DEFAULT 'daily_cash' NOT NULL,
	`period` text NOT NULL,
	`draw_date` text NOT NULL,
	`n1` integer NOT NULL,
	`n2` integer NOT NULL,
	`n3` integer NOT NULL,
	`n4` integer NOT NULL,
	`n5` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`raw_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draws_game_period_idx` ON `draws` (`game`,`period`);