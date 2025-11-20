-- Update leads.identifier with Owner RUT from vehicle data CSV
-- Matches based on car_checkouts.plate = Plate Number from CSV
-- Includes all records from vehicle-data-1.csv with non-empty Owner RUT

UPDATE leads
SET identifier = data.owner_rut
FROM (
    VALUES
        ('RYLZ34', '20.052.998-7'),
        ('RYPD50', '19.636.195-2'),
        ('RYPD64', '18.960.493-9'),
        ('RYPF23', '78.026.100-5'),
        ('RYPG30', '16.607.407-K'),
        ('RYPH48', '10.557.717-6'),
        ('RYPK84', '91.502.000-3'),
        ('RYPL75', '14.497.100-0'),
        ('RYPP75', '18.212.020-0')
) AS data(plate, owner_rut)
INNER JOIN car_checkouts ON car_checkouts.plate = data.plate
INNER JOIN lead_car_checkouts ON lead_car_checkouts.car_checkout_id = car_checkouts.id
WHERE leads.id = lead_car_checkouts.lead_id;
