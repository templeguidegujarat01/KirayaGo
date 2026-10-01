// Option values are language-independent. Labels come from locales/*.json  (opt.<field>.<value>).
export const OPTS = {
  listing_by: ['owner', 'manager', 'broker'],
  property_type: ['apartment', 'independent_house', 'villa', 'builder_floor', 'room', 'studio', 'one_rk', 'other'],
  furnishing: ['fully_furnished', 'semi_furnished', 'unfurnished'],
  area_unit: ['sqft', 'sqyd', 'sqm'],
  rent_negotiable: ['negotiable', 'slightly', 'fixed'],
  allowed_tenants: ['family', 'bachelors', 'students', 'professionals'],
  gender_preference: ['any', 'male', 'female'],
  pets: ['allowed', 'not_allowed', 'conditional'],
  visitors: ['allowed', 'restricted', 'other'],
  cooking: ['allowed', 'not_allowed', 'conditional'],
  smoking: ['allowed', 'not_allowed', 'outside_only'],
  electricity_arrangement: ['separate_meter', 'shared_meter', 'sub_meter', 'included_in_rent', 'fixed_charge', 'other'],
  electricity_billing: ['submeter_usage', 'percentage_split', 'fixed_amount', 'per_person', 'other'],
  water_source: ['municipal', 'borewell', 'tank', 'tanker', 'mixed', 'other'],
  water_arrangement: ['included', 'shared', 'separate'],
  water_shortage: ['no', 'sometimes', 'yes', 'not_sure'],
  parking_type: ['dedicated', 'shared', 'street', 'other'],
  owner_lives: ['elsewhere', 'same_building', 'same_floor', 'ground_floor', 'upper_floor', 'same_plot', 'other'],
  entrance: ['separate', 'shared'],
  image_category: ['exterior', 'front', 'street', 'living', 'bedroom1', 'bedroom2', 'kitchen', 'bathroom1', 'bathroom2', 'balcony', 'parking', 'other'],
  report_reason: ['fake', 'wrong_info', 'already_rented', 'wrong_contact', 'spam', 'misleading_photos', 'other'],
  status: ['draft', 'pending_review', 'published', 'rented', 'unavailable', 'archived', 'suspended'],
  account_type: ['owner', 'manager', 'broker'],
};
export const NEARBY_KINDS = ['metro', 'bus_stop', 'railway', 'airport', 'petrol_pump', 'hospital', 'school', 'college', 'market', 'grocery', 'temple', 'mosque', 'church', 'other'];
export const AMENITY_GROUPS = ['appliances', 'furniture', 'building', 'outdoor'];
export const BUDGETS = [
  [3000, 5000], [6000, 9000], [10000, 13000], [14000, 18000], [19000, 25000], [25000, null],
];
export const MAX_PHOTOS = 15;
