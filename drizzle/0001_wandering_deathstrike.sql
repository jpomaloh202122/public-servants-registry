CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`number` text NOT NULL,
	`agency` text NOT NULL,
	`status` text NOT NULL,
	`search` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_dataset_number` ON `employees` (`dataset`,`number`);--> statement-breakpoint
CREATE INDEX `employee_dataset_agency` ON `employees` (`dataset`,`agency`);--> statement-breakpoint
CREATE INDEX `employee_dataset_status` ON `employees` (`dataset`,`status`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset` text NOT NULL,
	`key` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `organisation_dataset` ON `organisations` (`dataset`);