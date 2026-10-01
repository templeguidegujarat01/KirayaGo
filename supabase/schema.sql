-- =====================================================================
-- KirayaGo — database schema v1
-- Paste this WHOLE file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (tables use IF NOT EXISTS, policies are dropped/recreated).
-- Contains NO sample/fake data.
-- =====================================================================

-- ---------- helpers ----------
create or replace function public.slugify(t text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(t,'')), '[^[:alnum:]]+', '-', 'g'))
$$;

create or replace function public.normalize_phone(t text) returns text
language sql immutable as $$
  select case
    when d is null or d = '' then null
    when length(d) = 12 and d like '91%' then substr(d, 3)
    when length(d) = 11 and d like '0%'  then substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(t,''), '[^0-9]', '', 'g') as d) x
$$;

-- ---------- reference: states & union territories ----------
create table if not exists public.states (
  slug text primary key,
  name text not null unique,
  kind text not null default 'state' check (kind in ('state','ut'))
);
insert into public.states(slug, name, kind)
select public.slugify(n), n, k from (values
 ('Andhra Pradesh','state'),('Arunachal Pradesh','state'),('Assam','state'),('Bihar','state'),
 ('Chhattisgarh','state'),('Goa','state'),('Gujarat','state'),('Haryana','state'),
 ('Himachal Pradesh','state'),('Jharkhand','state'),('Karnataka','state'),('Kerala','state'),
 ('Madhya Pradesh','state'),('Maharashtra','state'),('Manipur','state'),('Meghalaya','state'),
 ('Mizoram','state'),('Nagaland','state'),('Odisha','state'),('Punjab','state'),
 ('Rajasthan','state'),('Sikkim','state'),('Tamil Nadu','state'),('Telangana','state'),
 ('Tripura','state'),('Uttar Pradesh','state'),('Uttarakhand','state'),('West Bengal','state'),
 ('Andaman and Nicobar Islands','ut'),('Chandigarh','ut'),
 ('Dadra and Nagar Haveli and Daman and Diu','ut'),('Delhi','ut'),('Jammu and Kashmir','ut'),
 ('Ladakh','ut'),('Lakshadweep','ut'),('Puducherry','ut')
) v(n,k)
on conflict do nothing;

-- ---------- locations: created automatically from owner input ----------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  state_slug text not null references public.states(slug),
  state text not null,
  city text not null,
  city_slug text not null,
  locality text not null,
  locality_slug text not null,
  created_at timestamptz not null default now(),
  unique (state_slug, city_slug, locality_slug)
);
create index if not exists locations_city_idx on public.locations (state_slug, city_slug);

-- ---------- accounts ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 80),
  phone text check (phone is null or phone ~ '^[0-9]{8,12}$'),
  account_type text not null default 'owner' check (account_type in ('owner','manager','broker')),
  created_at timestamptz not null default now()
);

-- Admins live in their own table; nobody can insert here through the API.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);
insert into public.app_settings(key, value) values ('require_review', 'false'::jsonb)
on conflict do nothing;

-- ---------- amenities (labels live in the frontend locale files) ----------
create table if not exists public.amenities (
  code text primary key,
  grp text not null check (grp in ('appliances','furniture','building','outdoor')),
  sort_order smallint not null default 0
);
insert into public.amenities(code, grp, sort_order) values
 ('fan','appliances',1),('ac','appliances',2),('tv','appliances',3),('fridge','appliances',4),
 ('washing_machine','appliances',5),('geyser','appliances',6),('water_purifier','appliances',7),
 ('microwave','appliances',8),('gas_connection','appliances',9),('wifi','appliances',10),
 ('bed','furniture',1),('wardrobe','furniture',2),('sofa','furniture',3),
 ('dining_table','furniture',4),('kitchen_cabinets','furniture',5),
 ('lift','building',1),('security','building',2),('cctv','building',3),('power_backup','building',4),
 ('intercom','building',5),('gated_society','building',6),('gym','building',7),
 ('balcony','outdoor',1),('terrace','outdoor',2),('garden','outdoor',3)
on conflict do nothing;

-- ---------- properties ----------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  status text not null default 'draft'
    check (status in ('draft','pending_review','published','rented','unavailable','archived','suspended')),
  listing_by text not null default 'owner' check (listing_by in ('owner','manager','broker')),
  title text check (char_length(title) <= 120),
  description text check (char_length(description) <= 3000),
  property_type text check (property_type in
    ('apartment','independent_house','villa','builder_floor','room','studio','one_rk','other')),
  furnishing text check (furnishing in ('fully_furnished','semi_furnished','unfurnished')),
  society_name text check (char_length(society_name) <= 100),
  pin_code text check (pin_code is null or pin_code ~ '^[1-9][0-9]{5}$'),
  -- rooms & size
  bhk smallint check (bhk between 0 and 10),
  bedrooms smallint check (bedrooms between 0 and 20),
  bathrooms smallint check (bathrooms between 0 and 20),
  toilets smallint check (toilets between 0 and 20),
  has_hall boolean not null default true,
  has_kitchen boolean not null default true,
  balconies smallint check (balconies between 0 and 10),
  floor_no smallint check (floor_no between -2 and 200),
  total_floors smallint check (total_floors between 0 and 200),
  builtup_area numeric(10,2) check (builtup_area > 0),
  carpet_area numeric(10,2) check (carpet_area > 0),
  plot_area numeric(12,2) check (plot_area > 0),
  area_unit text not null default 'sqft' check (area_unit in ('sqft','sqyd','sqm')),
  builtup_sqft numeric generated always as (
    case area_unit when 'sqft' then builtup_area when 'sqyd' then builtup_area * 9
                   when 'sqm' then builtup_area * 10.7639 end) stored,
  -- money: kept as separate columns on purpose (never hidden in the description)
  monthly_rent integer check (monthly_rent between 500 and 10000000),
  security_deposit integer check (security_deposit between 0 and 100000000),
  maintenance_amount integer not null default 0 check (maintenance_amount between 0 and 1000000),
  maintenance_included boolean not null default false,
  other_recurring_amount integer check (other_recurring_amount between 0 and 1000000),
  other_recurring_note text check (char_length(other_recurring_note) <= 200),
  one_time_amount integer check (one_time_amount between 0 and 10000000),
  one_time_note text check (char_length(one_time_note) <= 200),
  rent_negotiable text check (rent_negotiable in ('negotiable','slightly','fixed')),
  available_from date,
  min_rental_months smallint check (min_rental_months between 1 and 120),
  -- who can live here
  allowed_tenants text[] not null default '{}'
    check (allowed_tenants <@ array['family','bachelors','students','professionals']::text[]),
  max_occupants smallint check (max_occupants between 1 and 30),
  min_occupants smallint check (min_occupants between 1 and 30),
  -- parking
  car_parking smallint not null default 0 check (car_parking between 0 and 20),
  bike_parking smallint not null default 0 check (bike_parking between 0 and 50),
  parking_type text check (parking_type in ('dedicated','shared','street','other')),
  parking_charge integer check (parking_charge between 0 and 100000),
  parking_note text check (char_length(parking_note) <= 200),
  -- owner living arrangement
  owner_lives text check (owner_lives in
    ('elsewhere','same_building','same_floor','ground_floor','upper_floor','same_plot','other')),
  entrance text check (entrance in ('separate','shared')),
  owner_note text check (char_length(owner_note) <= 300),
  -- future use (no UI in v1)
  is_featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists properties_search_idx on public.properties (status, location_id, monthly_rent);
create index if not exists properties_status_pub_idx on public.properties (status, published_at desc);
create index if not exists properties_type_idx on public.properties (property_type) where status = 'published';
create index if not exists properties_bhk_idx on public.properties (bhk) where status = 'published';
create index if not exists properties_rent_idx on public.properties (monthly_rent) where status = 'published';
create index if not exists properties_tenants_idx on public.properties using gin (allowed_tenants);

-- Ownership is a separate table so the public API never exposes owner user IDs.
create table if not exists public.property_owners (
  property_id uuid primary key references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade
);
create index if not exists property_owners_owner_idx on public.property_owners (owner_id);

create table if not exists public.property_rules (
  property_id uuid primary key references public.properties(id) on delete cascade,
  pets text check (pets in ('allowed','not_allowed','conditional')),
  pets_note text check (char_length(pets_note) <= 200),
  visitors text check (visitors in ('allowed','restricted','other')),
  visitors_note text check (char_length(visitors_note) <= 200),
  cooking text check (cooking in ('allowed','not_allowed','conditional')),
  cooking_note text check (char_length(cooking_note) <= 200),
  smoking text check (smoking in ('allowed','not_allowed','outside_only')),
  gender_preference text check (gender_preference in ('any','male','female')),
  curfew_time text check (char_length(curfew_time) <= 100),
  other_rules text check (char_length(other_rules) <= 1000)
);

create table if not exists public.property_utilities (
  property_id uuid primary key references public.properties(id) on delete cascade,
  electricity_arrangement text check (electricity_arrangement in
    ('separate_meter','shared_meter','sub_meter','included_in_rent','fixed_charge','other')),
  electricity_billing text check (electricity_billing in
    ('submeter_usage','percentage_split','fixed_amount','per_person','other')),
  electricity_fixed_amount integer check (electricity_fixed_amount between 0 and 1000000),
  electricity_rate_per_unit numeric(6,2) check (electricity_rate_per_unit between 0 and 100),
  electricity_note text check (char_length(electricity_note) <= 500),
  water_source text check (water_source in ('municipal','borewell','tank','tanker','mixed','other')),
  water_arrangement text check (water_arrangement in ('included','shared','separate')),
  water_shortage text check (water_shortage in ('no','sometimes','yes','not_sure')),
  water_tank_note text check (char_length(water_tank_note) <= 200),
  water_note text check (char_length(water_note) <= 500)
);
create index if not exists utilities_elec_idx on public.property_utilities (electricity_arrangement);

create table if not exists public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_code text not null references public.amenities(code),
  primary key (property_id, amenity_code)
);
create index if not exists property_amenities_code_idx on public.property_amenities (amenity_code);

create table if not exists public.property_nearby (
  property_id uuid not null references public.properties(id) on delete cascade,
  kind text not null check (kind in ('metro','bus_stop','railway','airport','petrol_pump','hospital',
    'school','college','market','grocery','temple','mosque','church','other')),
  distance_m integer not null check (distance_m between 0 and 500000),
  primary key (property_id, kind)
);
create index if not exists property_nearby_kind_idx on public.property_nearby (kind, distance_m);

create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  path text not null,
  thumb_path text,
  category text not null default 'other' check (category in ('exterior','front','street','living','bedroom1',
    'bedroom2','kitchen','bathroom1','bathroom2','balcony','parking','other')),
  alt_text text check (char_length(alt_text) <= 200),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists property_images_prop_idx on public.property_images (property_id, sort_order);
create unique index if not exists property_images_one_primary on public.property_images (property_id) where is_primary;

-- Private tables: readable only by the owner (and admins).
create table if not exists public.property_contacts (
  property_id uuid primary key references public.properties(id) on delete cascade,
  contact_name text check (char_length(contact_name) <= 80),
  phone text check (phone ~ '^[6-9][0-9]{9}$'),
  whatsapp text check (whatsapp ~ '^[6-9][0-9]{9}$'),
  alt_phone text check (alt_phone ~ '^[0-9]{8,12}$')
);
create table if not exists public.property_private (
  property_id uuid primary key references public.properties(id) on delete cascade,
  address_line text check (char_length(address_line) <= 300)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  reporter_id uuid default auth.uid() references auth.users(id) on delete set null,
  reason text not null check (reason in
    ('fake','wrong_info','already_rented','wrong_contact','spam','misleading_photos','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_property_idx on public.reports (property_id);

-- ---------- triggers ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists properties_touch on public.properties;
create trigger properties_touch before update on public.properties
  for each row execute function public.touch_updated_at();

create or replace function public.limit_images() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.property_images where property_id = new.property_id) >= 15 then
    raise exception 'You can upload at most 15 photos per property.';
  end if;
  return new;
end $$;
drop trigger if exists images_limit on public.property_images;
create trigger images_limit before insert on public.property_images
  for each row execute function public.limit_images();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text := coalesce(new.raw_user_meta_data->>'account_type', 'owner');
begin
  if t not in ('owner','manager','broker') then t := 'owner'; end if;
  insert into public.profiles(id, full_name, account_type)
  values (new.id, left(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 80), t)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- authorization helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
create or replace function public.is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.property_owners where property_id = pid and owner_id = auth.uid())
$$;

-- ---------- location auto-creation ----------
create or replace function public.get_or_create_location(p_state text, p_city text, p_locality text)
returns uuid language plpgsql security definer set search_path = public as $$
declare st public.states; c text; l text; cs text; ls text; lid uuid;
begin
  select * into st from public.states
   where slug = public.slugify(p_state) or lower(name) = lower(trim(coalesce(p_state,''))) limit 1;
  if not found then raise exception 'Please choose a valid state.'; end if;
  c := initcap(trim(regexp_replace(coalesce(p_city,''), '\s+', ' ', 'g')));
  l := initcap(trim(regexp_replace(coalesce(p_locality,''), '\s+', ' ', 'g')));
  if char_length(c) not between 2 and 60 or c ~ '[<>{}\\|/]' then
    raise exception 'Please enter a valid city name.'; end if;
  if char_length(l) not between 2 and 80 or l ~ '[<>{}\\|/]' then
    raise exception 'Please enter a valid locality / area name.'; end if;
  cs := coalesce(nullif(public.slugify(c), ''), substr(md5(c), 1, 8));
  ls := coalesce(nullif(public.slugify(l), ''), substr(md5(l), 1, 8));
  select id into lid from public.locations where state_slug = st.slug and city_slug = cs and locality_slug = ls;
  if lid is null then
    insert into public.locations(state_slug, state, city, city_slug, locality, locality_slug)
    values (st.slug, st.name, c, cs, l, ls)
    on conflict (state_slug, city_slug, locality_slug) do nothing
    returning id into lid;
    if lid is null then
      select id into lid from public.locations where state_slug = st.slug and city_slug = cs and locality_slug = ls;
    end if;
  end if;
  return lid;
end $$;
revoke all on function public.get_or_create_location(text,text,text) from public, anon, authenticated;

-- ---------- publishing checks ----------
create or replace function public.assert_publishable(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.properties; u public.property_utilities; c public.property_contacts; m text[] := '{}';
begin
  select * into r from public.properties where id = pid;
  select * into u from public.property_utilities where property_id = pid;
  select * into c from public.property_contacts where property_id = pid;
  if coalesce(r.title,'') = '' then m := m || 'title'; end if;
  if r.property_type is null then m := m || 'property type'; end if;
  if r.furnishing is null then m := m || 'furnishing'; end if;
  if r.bhk is null then m := m || 'BHK'; end if;
  if r.bathrooms is null then m := m || 'bathrooms'; end if;
  if r.builtup_area is null then m := m || 'built-up area'; end if;
  if r.monthly_rent is null then m := m || 'monthly rent'; end if;
  if r.security_deposit is null then m := m || 'security deposit'; end if;
  if r.available_from is null then m := m || 'availability date'; end if;
  if coalesce(array_length(r.allowed_tenants,1),0) = 0 then m := m || 'who can rent'; end if;
  if r.max_occupants is null then m := m || 'maximum occupants'; end if;
  if r.owner_lives is null then m := m || 'owner living arrangement'; end if;
  if r.entrance is null then m := m || 'entrance type'; end if;
  if u.electricity_arrangement is null then m := m || 'electricity arrangement'; end if;
  if u.water_arrangement is null then m := m || 'water arrangement'; end if;
  if c.phone is null then m := m || 'contact phone number'; end if;
  if not exists (select 1 from public.property_images where property_id = pid) then m := m || 'at least one photo'; end if;
  if array_length(m,1) > 0 then
    raise exception 'Please complete before publishing: %', array_to_string(m, ', ');
  end if;
end $$;
revoke all on function public.assert_publishable(uuid) from public, anon, authenticated;

-- ---------- write API (the ONLY way clients create/edit/delete properties) ----------
create or replace function public.save_property(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid := p_id;
  loc_id uuid;
  r public.properties;
  ru public.property_rules;
  ut public.property_utilities;
  ct jsonb := coalesce(p->'contact', '{}'::jsonb);
  pv jsonb := coalesce(p->'private', '{}'::jsonb);
  ph text; wa text; alt text;
begin
  if uid is null then raise exception 'Please log in first.' using errcode = '28000'; end if;
  loc_id := public.get_or_create_location(p#>>'{location,state}', p#>>'{location,city}', p#>>'{location,locality}');
  if pid is null then
    insert into public.properties(location_id) values (loc_id) returning id into pid;
    insert into public.property_owners(property_id, owner_id) values (pid, uid);
    insert into public.property_rules(property_id) values (pid);
    insert into public.property_utilities(property_id) values (pid);
    insert into public.property_contacts(property_id) values (pid);
    insert into public.property_private(property_id) values (pid);
  else
    if not (public.is_owner(pid) or public.is_admin()) then
      raise exception 'You can only edit your own properties.' using errcode = '42501'; end if;
    if not public.is_admin() and (select status from public.properties where id = pid) = 'suspended' then
      raise exception 'This listing was suspended by KirayaGo and cannot be edited.'; end if;
  end if;

  r  := jsonb_populate_record(null::public.properties, coalesce(p->'property', '{}'::jsonb));
  ru := jsonb_populate_record(null::public.property_rules, coalesce(p->'rules', '{}'::jsonb));
  ut := jsonb_populate_record(null::public.property_utilities, coalesce(p->'utilities', '{}'::jsonb));

  update public.properties set
    location_id = loc_id,
    listing_by = coalesce(r.listing_by, 'owner'),
    title = nullif(trim(r.title), ''), description = nullif(trim(r.description), ''),
    property_type = r.property_type, furnishing = r.furnishing,
    society_name = nullif(trim(r.society_name), ''), pin_code = nullif(trim(r.pin_code), ''),
    bhk = r.bhk, bedrooms = r.bedrooms, bathrooms = r.bathrooms, toilets = r.toilets,
    has_hall = coalesce(r.has_hall, true), has_kitchen = coalesce(r.has_kitchen, true),
    balconies = r.balconies, floor_no = r.floor_no, total_floors = r.total_floors,
    builtup_area = r.builtup_area, carpet_area = r.carpet_area, plot_area = r.plot_area,
    area_unit = coalesce(r.area_unit, 'sqft'),
    monthly_rent = r.monthly_rent, security_deposit = r.security_deposit,
    maintenance_amount = coalesce(r.maintenance_amount, 0),
    maintenance_included = coalesce(r.maintenance_included, false),
    other_recurring_amount = r.other_recurring_amount, other_recurring_note = nullif(trim(r.other_recurring_note), ''),
    one_time_amount = r.one_time_amount, one_time_note = nullif(trim(r.one_time_note), ''),
    rent_negotiable = r.rent_negotiable, available_from = r.available_from,
    min_rental_months = r.min_rental_months,
    allowed_tenants = coalesce(r.allowed_tenants, '{}'),
    max_occupants = r.max_occupants, min_occupants = r.min_occupants,
    car_parking = coalesce(r.car_parking, 0), bike_parking = coalesce(r.bike_parking, 0),
    parking_type = r.parking_type, parking_charge = r.parking_charge,
    parking_note = nullif(trim(r.parking_note), ''),
    owner_lives = r.owner_lives, entrance = r.entrance, owner_note = nullif(trim(r.owner_note), '')
  where id = pid;

  update public.property_rules set
    pets = ru.pets, pets_note = nullif(trim(ru.pets_note), ''),
    visitors = ru.visitors, visitors_note = nullif(trim(ru.visitors_note), ''),
    cooking = ru.cooking, cooking_note = nullif(trim(ru.cooking_note), ''),
    smoking = ru.smoking, gender_preference = ru.gender_preference,
    curfew_time = nullif(trim(ru.curfew_time), ''), other_rules = nullif(trim(ru.other_rules), '')
  where property_id = pid;

  update public.property_utilities set
    electricity_arrangement = ut.electricity_arrangement, electricity_billing = ut.electricity_billing,
    electricity_fixed_amount = ut.electricity_fixed_amount, electricity_rate_per_unit = ut.electricity_rate_per_unit,
    electricity_note = nullif(trim(ut.electricity_note), ''),
    water_source = ut.water_source, water_arrangement = ut.water_arrangement, water_shortage = ut.water_shortage,
    water_tank_note = nullif(trim(ut.water_tank_note), ''), water_note = nullif(trim(ut.water_note), '')
  where property_id = pid;

  if p->'amenities' is not null and jsonb_typeof(p->'amenities') = 'array' then
    delete from public.property_amenities where property_id = pid;
    insert into public.property_amenities(property_id, amenity_code)
    select distinct pid, a from jsonb_array_elements_text(p->'amenities') a
    where exists (select 1 from public.amenities where code = a);
  end if;

  if p->'nearby' is not null and jsonb_typeof(p->'nearby') = 'array' then
    delete from public.property_nearby where property_id = pid;
    insert into public.property_nearby(property_id, kind, distance_m)
    select distinct on (x.kind) pid, x.kind, x.distance_m
    from jsonb_to_recordset(p->'nearby') as x(kind text, distance_m integer)
    where x.kind is not null and x.distance_m is not null and x.distance_m between 0 and 500000;
  end if;

  ph := public.normalize_phone(ct->>'phone');
  wa := public.normalize_phone(ct->>'whatsapp');
  alt := public.normalize_phone(ct->>'alt_phone');
  if ph is not null and ph !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit mobile number.'; end if;
  if wa is not null and wa !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit WhatsApp number.'; end if;
  if alt is not null and alt !~ '^[0-9]{8,12}$' then raise exception 'Please enter a valid alternate number.'; end if;
  update public.property_contacts set
    contact_name = left(nullif(trim(ct->>'contact_name'), ''), 80), phone = ph, whatsapp = wa, alt_phone = alt
  where property_id = pid;

  update public.property_private set address_line = left(nullif(trim(pv->>'address_line'), ''), 300)
  where property_id = pid;

  return pid;
end $$;

create or replace function public.set_property_status(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare cur public.properties; new_status text := p_status; adm boolean := public.is_admin(); req boolean;
begin
  if auth.uid() is null then raise exception 'Please log in first.' using errcode = '28000'; end if;
  select * into cur from public.properties where id = p_id for update;
  if not found then raise exception 'Property not found.'; end if;
  if not (adm or public.is_owner(p_id)) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  if p_status not in ('draft','pending_review','published','rented','unavailable','archived','suspended') then
    raise exception 'Invalid status.'; end if;
  if not adm then
    if cur.status = 'suspended' then raise exception 'This listing was suspended by KirayaGo. Please contact support.'; end if;
    if p_status in ('suspended','pending_review') then raise exception 'Not allowed.'; end if;
    if cur.status = 'pending_review' and p_status = 'published' then new_status := 'pending_review'; end if;
  end if;
  if new_status = 'published' then
    perform public.assert_publishable(p_id);
    select coalesce((select value = 'true'::jsonb from public.app_settings where key = 'require_review'), false) into req;
    if req and not adm and cur.published_at is null then new_status := 'pending_review'; end if;
  end if;
  update public.properties set status = new_status,
    published_at = case when new_status = 'published' and published_at is null then now() else published_at end
  where id = p_id;
  return new_status;
end $$;

create or replace function public.set_property_rent(p_id uuid, p_rent integer, p_deposit integer default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_owner(p_id) or public.is_admin()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  update public.properties set monthly_rent = p_rent, security_deposit = coalesce(p_deposit, security_deposit)
  where id = p_id;
end $$;

create or replace function public.delete_property(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_owner(p_id) or public.is_admin()) then raise exception 'Not allowed.' using errcode = '42501'; end if;
  delete from public.properties where id = p_id;
end $$;

-- ---------- public read API ----------
create or replace function public.get_public_contact(p_id uuid)
returns table (contact_name text, phone text, whatsapp text, alt_phone text)
language sql stable security definer set search_path = public as $$
  select c.contact_name, c.phone, c.whatsapp, c.alt_phone
  from public.property_contacts c join public.properties p on p.id = c.property_id
  where c.property_id = p_id and p.status = 'published'
$$;

create or replace function public.get_listing_meta(p_id uuid)
returns table (email_verified boolean, member_since timestamptz)
language sql stable security definer set search_path = public as $$
  select (u.email_confirmed_at is not null), u.created_at
  from public.property_owners o join auth.users u on u.id = o.owner_id
  join public.properties p on p.id = o.property_id
  where o.property_id = p_id and p.status = 'published'
$$;

create or replace view public.location_stats as
select l.state_slug, l.state, l.city_slug, l.city, l.locality_slug, l.locality,
       count(p.id)::integer as listing_count
from public.locations l
join public.properties p on p.location_id = l.id and p.status = 'published'
group by l.id;

create or replace function public.search_properties(
  p_filters jsonb default '{}'::jsonb, p_sort text default 'newest',
  p_limit integer default 12, p_offset integer default 0)
returns table (
  id uuid, title text, monthly_rent integer, security_deposit integer, maintenance_amount integer,
  maintenance_included boolean, bhk smallint, bathrooms smallint, property_type text, furnishing text,
  builtup_area numeric, area_unit text, allowed_tenants text[], bike_parking smallint, car_parking smallint,
  owner_lives text, entrance text, electricity_arrangement text, available_from date, listing_by text,
  published_at timestamptz, updated_at timestamptz, state text, city text, locality text,
  state_slug text, city_slug text, cover_path text, cover_thumb text, total_count bigint)
language sql stable security invoker set search_path = public as $$
  select p.id, p.title, p.monthly_rent, p.security_deposit, p.maintenance_amount, p.maintenance_included,
         p.bhk, p.bathrooms, p.property_type, p.furnishing, p.builtup_area, p.area_unit, p.allowed_tenants,
         p.bike_parking, p.car_parking, p.owner_lives, p.entrance, u.electricity_arrangement, p.available_from,
         p.listing_by, p.published_at, p.updated_at, l.state, l.city, l.locality, l.state_slug, l.city_slug,
         c.path, c.thumb_path, count(*) over ()
  from public.properties p
  join public.locations l on l.id = p.location_id
  left join public.property_utilities u on u.property_id = p.id
  left join lateral (
    select i.path, i.thumb_path from public.property_images i
    where i.property_id = p.id order by i.is_primary desc, i.sort_order, i.created_at limit 1) c on true
  where p.status = 'published'
    and (nullif(p_filters->>'state','') is null or l.state_slug = p_filters->>'state')
    and (nullif(p_filters->>'city','') is null or l.city_slug = p_filters->>'city')
    and (nullif(p_filters->>'locality','') is null or l.locality_slug = p_filters->>'locality')
    and (nullif(p_filters->>'min_rent','') is null or p.monthly_rent >= (p_filters->>'min_rent')::int)
    and (nullif(p_filters->>'max_rent','') is null or p.monthly_rent <= (p_filters->>'max_rent')::int)
    and (nullif(p_filters->>'max_deposit','') is null or p.security_deposit <= (p_filters->>'max_deposit')::int)
    and (nullif(p_filters->>'type','') is null or p.property_type = p_filters->>'type')
    and (coalesce(jsonb_array_length(p_filters->'bhk'),0) = 0 or exists (
          select 1 from jsonb_array_elements_text(p_filters->'bhk') b
          where (b::int < 4 and p.bhk = b::int) or (b::int >= 4 and p.bhk >= 4)))
    and (coalesce(jsonb_array_length(p_filters->'furnishing'),0) = 0
         or p.furnishing in (select jsonb_array_elements_text(p_filters->'furnishing')))
    and (coalesce(jsonb_array_length(p_filters->'tenants'),0) = 0
         or p.allowed_tenants && array(select jsonb_array_elements_text(p_filters->'tenants')))
    and (coalesce(jsonb_array_length(p_filters->'owner_lives'),0) = 0
         or p.owner_lives in (select jsonb_array_elements_text(p_filters->'owner_lives')))
    and (coalesce(jsonb_array_length(p_filters->'listing_by'),0) = 0
         or p.listing_by in (select jsonb_array_elements_text(p_filters->'listing_by')))
    and (coalesce(jsonb_array_length(p_filters->'electricity'),0) = 0
         or u.electricity_arrangement in (select jsonb_array_elements_text(p_filters->'electricity')))
    and (coalesce(jsonb_array_length(p_filters->'water'),0) = 0
         or u.water_arrangement in (select jsonb_array_elements_text(p_filters->'water')))
    and (not coalesce((p_filters->'parking') ? 'car', false) or p.car_parking > 0)
    and (not coalesce((p_filters->'parking') ? 'bike', false) or p.bike_parking > 0)
    and (nullif(p_filters->>'min_bathrooms','') is null or p.bathrooms >= (p_filters->>'min_bathrooms')::int)
    and (nullif(p_filters->>'occupants','') is null or p.max_occupants >= (p_filters->>'occupants')::int)
    and (not coalesce((p_filters->>'available_now')::boolean, false)
         or p.available_from is null or p.available_from <= current_date)
    and (nullif(p_filters->>'metro_max_m','') is null or exists (
          select 1 from public.property_nearby n where n.property_id = p.id and n.kind = 'metro'
          and n.distance_m <= (p_filters->>'metro_max_m')::int))
    and (nullif(p_filters->>'bus_max_m','') is null or exists (
          select 1 from public.property_nearby n where n.property_id = p.id and n.kind = 'bus_stop'
          and n.distance_m <= (p_filters->>'bus_max_m')::int))
    and not exists (
          select 1 from jsonb_array_elements_text(coalesce(p_filters->'amenities','[]'::jsonb)) a
          where not exists (select 1 from public.property_amenities pa
                            where pa.property_id = p.id and pa.amenity_code = a))
  order by
    case when p_sort = 'rent_asc'  then p.monthly_rent end asc,
    case when p_sort = 'rent_desc' then p.monthly_rent end desc,
    p.published_at desc nulls last, p.id
  limit least(greatest(coalesce(p_limit, 12), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 100)
returns table (id uuid, email text, full_name text, account_type text, created_at timestamptz,
               email_verified boolean, listing_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, pr.full_name, pr.account_type, u.created_at,
           (u.email_confirmed_at is not null),
           (select count(*) from public.property_owners o where o.owner_id = u.id)
    from auth.users u left join public.profiles pr on pr.id = u.id
    where p_search is null or u.email ilike '%' || p_search || '%' or pr.full_name ilike '%' || p_search || '%'
    order by u.created_at desc limit least(coalesce(p_limit, 100), 500);
end $$;

-- ---------- permissions ----------
revoke all on function public.save_property(uuid, jsonb), public.set_property_status(uuid, text),
  public.set_property_rent(uuid, integer, integer), public.delete_property(uuid),
  public.admin_list_users(text, integer) from public, anon;
grant execute on function public.save_property(uuid, jsonb), public.set_property_status(uuid, text),
  public.set_property_rent(uuid, integer, integer), public.delete_property(uuid),
  public.admin_list_users(text, integer) to authenticated;
grant execute on function public.search_properties(jsonb, text, integer, integer),
  public.get_public_contact(uuid), public.get_listing_meta(uuid), public.is_admin() to anon, authenticated;
grant select on public.location_stats to anon, authenticated;

-- ---------- Row Level Security ----------
do $$ declare pol record; begin
  for pol in select schemaname, tablename, policyname from pg_policies
             where schemaname in ('public','storage') and policyname like 'kg\_%'
  loop execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename); end loop;
end $$;

alter table public.states enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.amenities enable row level security;
alter table public.properties enable row level security;
alter table public.property_owners enable row level security;
alter table public.property_rules enable row level security;
alter table public.property_utilities enable row level security;
alter table public.property_amenities enable row level security;
alter table public.property_nearby enable row level security;
alter table public.property_images enable row level security;
alter table public.property_contacts enable row level security;
alter table public.property_private enable row level security;
alter table public.reports enable row level security;

create policy kg_states_read on public.states for select using (true);
create policy kg_locations_read on public.locations for select using (true);
create policy kg_amenities_read on public.amenities for select using (true);

create policy kg_profiles_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy kg_profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy kg_admins_self on public.admins for select to authenticated using (user_id = auth.uid());
create policy kg_settings_admin on public.app_settings for select to authenticated using (public.is_admin());

-- properties: public sees published only; owners see their own; admins see all. No client write policies.
create policy kg_properties_read on public.properties for select
  using (status = 'published' or public.is_owner(id) or public.is_admin());
create policy kg_owners_read on public.property_owners for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- child tables inherit visibility from the parent property (which itself is filtered by RLS)
create policy kg_rules_read on public.property_rules for select
  using (exists (select 1 from public.properties p where p.id = property_id));
create policy kg_utilities_read on public.property_utilities for select
  using (exists (select 1 from public.properties p where p.id = property_id));
create policy kg_pamenities_read on public.property_amenities for select
  using (exists (select 1 from public.properties p where p.id = property_id));
create policy kg_nearby_read on public.property_nearby for select
  using (exists (select 1 from public.properties p where p.id = property_id));
create policy kg_images_read on public.property_images for select
  using (exists (select 1 from public.properties p where p.id = property_id));

-- private data: owner/admin only
create policy kg_contacts_read on public.property_contacts for select to authenticated
  using (public.is_owner(property_id) or public.is_admin());
create policy kg_private_read on public.property_private for select to authenticated
  using (public.is_owner(property_id) or public.is_admin());

-- images: owners manage rows for their own properties
create policy kg_images_insert on public.property_images for insert to authenticated
  with check (public.is_owner(property_id) and (storage.foldername(path))[1] = auth.uid()::text);
create policy kg_images_update on public.property_images for update to authenticated
  using (public.is_owner(property_id)) with check (public.is_owner(property_id));
create policy kg_images_delete on public.property_images for delete to authenticated
  using (public.is_owner(property_id) or public.is_admin());

-- reports: anyone may report a published listing; only admins can read/update
create policy kg_reports_insert on public.reports for insert to anon, authenticated
  with check (
    (reporter_id is null or reporter_id = auth.uid()) and status = 'open'
    and exists (select 1 from public.properties p where p.id = property_id and p.status = 'published'));
create policy kg_reports_read on public.reports for select to authenticated using (public.is_admin());
create policy kg_reports_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Storage: property photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy kg_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy kg_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'property-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy kg_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'property-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- Make yourself an admin (run separately, after you have signed up) ----------
-- insert into public.admins(user_id) select id from auth.users where email = 'you@example.com';
