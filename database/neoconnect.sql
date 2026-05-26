-- ==========================================
-- NEOCONNECT AI - SUPABASE SCHEMA & POLICIES
-- ==========================================

-- Enable UUID extension (if not already enabled)
create extension if not exists "uuid-ossp";

-- 1. Create Profiles Table (extends Supabase Auth metadata)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  full_name text,
  avatar_url text
);

-- Enable Row Level Security (RLS) on Profiles
alter table public.profiles enable row level security;

-- Drop existing policies if they exist (for clean executions)
drop policy if exists "Allow public read of profiles" on public.profiles;
drop policy if exists "Allow user insert own profile" on public.profiles;
drop policy if exists "Allow user update own profile" on public.profiles;

-- Create Policies for Profiles
create policy "Allow public read of profiles" on public.profiles 
  for select using (true);

create policy "Allow user insert own profile" on public.profiles 
  for insert with check (auth.uid() = id);

create policy "Allow user update own profile" on public.profiles 
  for update using (auth.uid() = id);

-- 2. Create Contacts Table
create table if not exists public.contacts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  phone text not null,
  email text,
  category text check (category in ('Work', 'Family', 'Friends', 'Emergency')) not null,
  notes text,
  avatar text,
  favorite boolean default false not null,
  is_deleted boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) on Contacts
alter table public.contacts enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Users can manage their own contacts" on public.contacts;

-- Create Policies for Contacts
create policy "Users can manage their own contacts" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Utility Trigger function for updated_at tracking
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at trigger to Profiles and Contacts
drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

drop trigger if exists on_contact_updated on public.contacts;
create trigger on_contact_updated
  before update on public.contacts
  for each row execute procedure public.handle_updated_at();

-- 4. Trigger for automatic profile creation when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/bottts/svg?seed=Felix')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Database Indexes for query optimization
create index if not exists contacts_user_id_idx on public.contacts(user_id);
create index if not exists contacts_is_deleted_idx on public.contacts(is_deleted);

-- 6. Storage Bucket Configuration for custom avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Set up access policies for Storage Bucket
drop policy if exists "Public Access to Avatars" on storage.objects;
create policy "Public Access to Avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Authenticated User Upload to Avatars" on storage.objects;
create policy "Authenticated User Upload to Avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Authenticated User Update own Avatar" on storage.objects;
create policy "Authenticated User Update own Avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
