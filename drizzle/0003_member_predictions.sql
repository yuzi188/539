CREATE TABLE `member_predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`period` text NOT NULL,
	`draw_date` text DEFAULT '' NOT NULL,
	`model` text NOT NULL,
	`sets_json` text NOT NULL,
	`locked_json` text DEFAULT '[]' NOT NULL,
	`excluded_json` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX `member_predictions_member_created_idx` ON `member_predictions` (`member_id`,`created_at`);
CREATE INDEX `member_predictions_member_period_idx` ON `member_predictions` (`member_id`,`period`);
