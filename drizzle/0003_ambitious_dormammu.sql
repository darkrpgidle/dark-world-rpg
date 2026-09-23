ALTER TABLE `accounts` ADD `is_gm` integer DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `accounts` (`id`, `username`, `password_hash`, `is_gm`)
VALUES ('gm4d-system-account', 'gm4d', 'o8Xw5sI5Y0jjFvMQffXGMg==:EJ9byns6YpJCeIddAMBuDjy/jMyFLNPrqg8AYoH5iao=', 1);
