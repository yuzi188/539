CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);
--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_sessions_token_hash_unique` ON `member_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `member_sessions_token_idx` ON `member_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `member_sessions_member_idx` ON `member_sessions` (`member_id`);
--> statement-breakpoint
CREATE TABLE `bet_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`period` text NOT NULL,
	`draw_date` text DEFAULT '' NOT NULL,
	`numbers_json` text NOT NULL,
	`stake` integer DEFAULT 50 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`hit_count` integer,
	`prize` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bet_orders_member_created_idx` ON `bet_orders` (`member_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `bet_orders_member_period_idx` ON `bet_orders` (`member_id`,`period`);
