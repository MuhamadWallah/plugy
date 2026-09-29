/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO categories (slug, name, description, icon) VALUES
      ('cleaning', 'Cleaning', 'Home, apartment, and office cleaning services', 'sparkles'),
      ('ironing', 'Ironing', 'Clothes ironing, steam pressing, and folding', 'shirt'),
      ('gardening', 'Gardening', 'Lawn care, weeding, hedge trimming, and planting', 'leaf'),
      ('car_wash', 'Car Washing', 'Exterior car washing, interior vacuuming, and detailing', 'car'),
      ('care_taking', 'Care Taking', 'Elderly care, companionship, and house sitting', 'heart-handshake'),
      ('babysitting', 'Babysitting', 'Childcare, supervision, and homework assistance', 'baby')
    ON CONFLICT (slug) DO NOTHING;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM categories WHERE slug IN (
      'cleaning', 'ironing', 'gardening', 'car_wash', 'care_taking', 'babysitting'
    );
  `);
};
