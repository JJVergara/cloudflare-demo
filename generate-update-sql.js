import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the CSV file
const csvPath = path.join(__dirname, 'data/results/vehicle-data.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// Parse CSV lines
const lines = csvContent.split('\n');
const records = [];

// Skip header (line 0) and blank separator (line 1), start from line 2
for (let i = 2; i < lines.length; i++) {
  const line = lines[i]?.trim();

  if (!line) {
    continue;
  }

  // Simple CSV parsing - handle quoted fields
  const match = line.match(/^\d+,"([^"]+)","[^"]*","[^"]*","[^"]*","([^"]*)"/);

  if (match) {
    const plate = match[1];
    const ownerRut = match[2];

    // Only include records with non-empty owner RUT
    if (ownerRut && ownerRut.trim() !== '') {
      records.push({ plate, ownerRut });
    }
  }
}

const escapeSql = (value) => value.replace(/'/g, "''");

// Generate SQL
let sql = `-- Update profiles.identifier with Owner RUT from vehicle data CSV
-- Matches based on cars.plate = Plate Number from CSV
-- Only updates if profiles.identifier IS NULL or length < 8

UPDATE profiles
SET identifier = data.owner_rut
FROM (
    VALUES\n`;

// Add all records
const values = records.map(r => `        ('${escapeSql(r.plate)}', '${escapeSql(r.ownerRut)}')`).join(',\n');
sql += values;

sql += `
) AS data(plate, owner_rut)
INNER JOIN cars ON cars.plate = data.plate
INNER JOIN profile_cars ON profile_cars.car_id = cars.id
WHERE profiles.id = profile_cars.profile_id
  AND (profiles.identifier IS NULL OR LENGTH(profiles.identifier) < 8);
`;

// Write SQL file
fs.writeFileSync(path.join(__dirname, 'update-leads.sql'), sql);

console.log(`Generated SQL with ${records.length} records`);
