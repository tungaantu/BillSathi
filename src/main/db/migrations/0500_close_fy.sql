CREATE TABLE fy_closings (id INTEGER PRIMARY KEY AUTOINCREMENT, firm_id INTEGER NOT NULL REFERENCES firms(id), fy_start TEXT NOT NULL, fy_end TEXT NOT NULL, closed_at TEXT NOT NULL, backup_path TEXT NOT NULL, snapshot TEXT NOT NULL, reopened_at TEXT);
--> statement-breakpoint
CREATE INDEX fy_closings_firm ON fy_closings(firm_id, fy_end);
