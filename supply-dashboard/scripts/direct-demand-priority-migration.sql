-- Flag set by the Direct Demand team to request priority on a property.
-- When true, the property surfaces in the dashboard's notification bell.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS direct_demand_priority BOOLEAN NOT NULL DEFAULT false;
